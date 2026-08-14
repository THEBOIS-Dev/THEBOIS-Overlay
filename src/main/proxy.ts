import type { ClientOptions } from 'minecraft-protocol';
import type { Buffer } from 'node:buffer';
import type { Socket } from 'node:net';
import type { McClient, McPacketMeta, McServer } from './mc-protocol-types';
import { EventEmitter } from 'node:events';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient, createServer, states } from 'minecraft-protocol';
import { createEncryptedAuthCache, purgeLegacyPlaintextCache } from './auth-cache';
import {
  extractComponentText,
  extractTeamColor,
  formatTeamName,
  isGameTeam,
  isNPC,
  parseChatToPlain,
  stripColorCodes,
} from './chat-color-utils';
import { fetchRemoteServerStatus } from './mc-status';

export type ProxyNetwork = 'pikanetwork' | 'jartexnetwork';
export type ProxyBindHost = '0.0.0.0' | '127.0.0.1';

export interface RemoteEndpoint {
  host: string;
  port: number;
}

interface PingResponse {
  version: { name: string; protocol: number };
  players: { max: number; online: number; sample: unknown[] };
  description: { text?: string; extra?: unknown[] } | string;
  favicon?: string;
}

export const endpoints: Record<ProxyNetwork, RemoteEndpoint> = {
  pikanetwork: { host: 'pika.host', port: 25565 },
  jartexnetwork: { host: 'play.jartex.fun', port: 25565 },
};

export interface TeamInfo {
  name: string;
  displayName: string;
  color: string;
  players: string[];
}

export type ProxyEvent =
  | { type: 'player-join'; network: ProxyNetwork; username: string }
  | { type: 'player-quit'; network: ProxyNetwork; username: string }
  | { type: 'teams-update'; network: ProxyNetwork; teams: TeamInfo[] }
  | { type: 'client-connect'; network: ProxyNetwork; clientName: string }
  | { type: 'client-disconnect'; network: ProxyNetwork; clientName: string }
  | {
      type: 'auth-code';
      network: ProxyNetwork;
      userCode: string;
      verificationUri: string;
      expiresInSeconds: number;
    }
  | { type: 'auth-success'; network: ProxyNetwork }
  | { type: 'auth-error'; network: ProxyNetwork; message: string }
  | {
      type: 'status';
      network: ProxyNetwork;
      running: boolean;
      port: number;
      bindHost: ProxyBindHost;
      error: string | null;
    };

export interface ProxyStatus {
  running: boolean;
  port: number;
  bindHost: ProxyBindHost;
  clientCount: number;
  error: string | null;
}

const cacheDir = join(homedir(), '.kyra-overlay', 'msa-cache');
const encryptedAuthCache = createEncryptedAuthCache(cacheDir);
void purgeLegacyPlaintextCache(cacheDir);

function isRetryableError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code ?? '';
  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  );
}

export class BedwarsProxy extends EventEmitter {
  private readonly network: ProxyNetwork;
  private readonly remoteHost: string;
  private readonly remotePort: number;
  private localPort: number;
  private bindHost: ProxyBindHost;
  private server: McServer | null = null;
  private sessions = new Map<string, string>();
  private teamColors = new Map<string, string>();
  private teamPlayers = new Map<string, Set<string>>();
  private playerTeam = new Map<string, string>();
  private knownPlayers = new Set<string>();
  private uuidToName = new Map<string, string>();
  private lastError: string | null = null;
  private gameActive = false;

  constructor(
    network: ProxyNetwork,
    remoteHost: string,
    remotePort: number,
    localPort: number,
    bindHost: ProxyBindHost,
  ) {
    super();
    this.network = network;
    this.remoteHost = remoteHost;
    this.remotePort = remotePort;
    this.localPort = localPort;
    this.bindHost = bindHost;
  }

  private emitProxyEvent(event: ProxyEvent): void {
    this.emit('proxy-event', event);
  }

  private buildTeams(): TeamInfo[] {
    const teams: TeamInfo[] = [];
    for (const [teamId, players] of this.teamPlayers) {
      if (players.size === 0) continue;
      const displayName = formatTeamName(teamId);
      if (!displayName) continue;
      const color = this.teamColors.get(teamId) ?? '#AAAAAA';
      teams.push({ name: displayName, displayName, color, players: [...players] });
    }
    return teams;
  }

  private checkGameState(): void {
    const populatedTeams = [...this.teamPlayers.entries()].filter(
      ([teamId, members]) => isGameTeam(teamId) && members.size > 0,
    );
    const hasTeams = populatedTeams.length >= 2;
    if (hasTeams && !this.gameActive) {
      this.gameActive = true;
      this.emitProxyEvent({
        type: 'teams-update',
        network: this.network,
        teams: this.buildTeams(),
      });
    } else if (!hasTeams && this.gameActive) {
      this.gameActive = false;
      this.emitProxyEvent({ type: 'teams-update', network: this.network, teams: [] });
    } else if (this.gameActive) {
      this.emitProxyEvent({
        type: 'teams-update',
        network: this.network,
        teams: this.buildTeams(),
      });
    }
  }

  private clearSessionState(): void {
    this.knownPlayers.clear();
    this.uuidToName.clear();
    this.teamColors.clear();
    this.teamPlayers.clear();
    this.playerTeam.clear();
    this.gameActive = false;
  }

  private addKnownPlayer(username: string): void {
    if (!username || username === '§r') return;
    const plain = stripColorCodes(username);
    if (!plain || this.knownPlayers.has(plain)) return;
    this.knownPlayers.add(plain);
    this.emitProxyEvent({ type: 'player-join', network: this.network, username: plain });
  }

  private removeKnownPlayer(username: string): void {
    if (!username) return;
    const plain = stripColorCodes(username);
    if (!plain) return;
    if (this.knownPlayers.delete(plain)) {
      this.emitProxyEvent({
        type: 'player-quit',
        network: this.network,
        username: plain,
      });
    }
  }

  async start(): Promise<void> {
    if (this.server) return;
    await new Promise<void>((resolve) => {
      const serverConfig: Record<string, unknown> = {
        'online-mode': false,
        port: this.localPort,
        host: this.bindHost,
        version: false,
        motd: `Kyra | ${this.network === 'pikanetwork' ? 'PikaNetwork' : 'JartexNetwork'}`,
        maxPlayers: 5,
        hideErrors: false,
        beforePing: (
          response: PingResponse,
          _client: unknown,
          callback: (error: unknown, result: PingResponse) => void,
        ) => {
          void fetchRemoteServerStatus(this.remoteHost, this.remotePort).then(
            (status) => {
              if (!status) {
                callback(null, response);
                return;
              }
              callback(null, {
                ...response,
                description: status.description,
                favicon: status.favicon ?? response.favicon,
              });
            },
          );
        },
        beforeLogin: (client: McClient) => {
          client.once('login_acknowledged', () => {
            const write = client.write.bind(client);
            client.write = (name, data) => {
              if (name !== 'registry_data' && name !== 'finish_configuration') {
                write(name, data);
              }
            };
            queueMicrotask(() => {
              client.write = write;
              client.emit('proxy-configuration-ready');
            });
          });
        },
      };
      const server = createServer(serverConfig);
      (
        server as unknown as {
          _server?: { on: (e: string, cb: (s: Socket) => void) => void };
        }
      )._server?.on('connection', (socket: Socket) => {
        try {
          socket.setNoDelay(true);
        } catch {}
      });
      let resolved = false;
      const resolveOnce = (): void => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      server.once('error', (error: Error) => {
        this.lastError = error.message;
        this.server = null;
        this.sessions.clear();
        this.clearSessionState();
        this.emitProxyEvent({
          type: 'status',
          network: this.network,
          running: false,
          port: this.localPort,
          bindHost: this.bindHost,
          error: this.lastError,
        });
        resolveOnce();
      });
      server.on('listening', () => {
        this.server = server;
        this.lastError = null;
        this.emitProxyEvent({
          type: 'status',
          network: this.network,
          running: true,
          port: this.localPort,
          bindHost: this.bindHost,
          error: null,
        });
        resolveOnce();
      });
      server.on('error', (error: Error) => {
        this.lastError = error.message;
        this.server = null;
        this.sessions.clear();
        this.clearSessionState();
        this.emitProxyEvent({
          type: 'status',
          network: this.network,
          running: false,
          port: this.localPort,
          bindHost: this.bindHost,
          error: error.message,
        });
      });
      server.on('login', (client: McClient) => {
        try {
          client.socket?.setNoDelay(true);
        } catch {}
        const username = client.username;
        const sessionKey = `${username}_${Date.now()}`;
        const clientVersion = client.version;
        this.sessions.set(sessionKey, username);
        this.emitProxyEvent({
          type: 'client-connect',
          network: this.network,
          clientName: username,
        });
        let upstreamReady = false;
        let sessionEnded = false;
        let attempt = 0;
        let activeUpstream: McClient | null = null;
        const pendingClientBuffers: Buffer[] = [];
        const pendingUpstreamBuffers: Buffer[] = [];
        const pendingConfigurationBuffers: Buffer[] = [];
        let configurationReady = false;
        const flushConfiguration = (): void => {
          if (!configurationReady) return;
          for (const buffer of pendingConfigurationBuffers.splice(0)) {
            if (!client.ended) {
              try {
                client.writeRaw(buffer);
              } catch {}
            }
          }
        };
        client.on('proxy-configuration-ready', () => {
          configurationReady = true;
          flushConfiguration();
        });
        const flushUpstreamBuffers = (joinedClient: McClient): void => {
          if (joinedClient !== client) return;
          for (const buffer of pendingUpstreamBuffers.splice(0)) {
            if (!client.ended) {
              try {
                client.writeRaw(buffer);
              } catch {}
            }
          }
          server.off('playerJoin', flushUpstreamBuffers);
        };
        server.on('playerJoin', flushUpstreamBuffers);
        const flushPendingClientBuffers = (): void => {
          if (!upstreamReady || !activeUpstream || pendingClientBuffers.length === 0)
            return;
          for (const buffered of pendingClientBuffers) {
            if (!activeUpstream.ended) {
              try {
                activeUpstream.writeRaw(buffered);
              } catch {}
            }
          }
          pendingClientBuffers.length = 0;
        };
        const teardown = (): void => {
          if (sessionEnded) return;
          sessionEnded = true;
          server.off('playerJoin', flushUpstreamBuffers);
          this.sessions.delete(sessionKey);
          this.emitProxyEvent({
            type: 'client-disconnect',
            network: this.network,
            clientName: username,
          });
          if (this.sessions.size === 0) {
            this.clearSessionState();
            this.emitProxyEvent({
              type: 'teams-update',
              network: this.network,
              teams: [],
            });
          }
          if (activeUpstream && !activeUpstream.ended) {
            try {
              activeUpstream.end('Proxy session ended');
            } catch {}
          }
          if (!client.ended) {
            try {
              client.end('Disconnected');
            } catch {}
          }
        };
        const connectUpstream = async (forcePremium: boolean): Promise<void> => {
          if (sessionEnded || client.ended) return;
          const upstreamConfig: ClientOptions = {
            host: this.remoteHost,
            port: this.remotePort,
            username,
            version: clientVersion,
            hideErrors: false,
            connect: (c: McClient) => {
              const socket = connect({
                host: this.remoteHost,
                port: this.remotePort,
                family: 4,
              });
              (c as unknown as { setSocket: (s: Socket) => void }).setSocket(socket);
            },
          } as ClientOptions;
          const upstream = forcePremium
            ? createClient({
                ...upstreamConfig,
                auth: 'microsoft',
                profilesFolder: encryptedAuthCache as unknown as string,
                onMsaCode: (code: {
                  user_code?: string;
                  verification_uri?: string;
                  expires_in?: number;
                }) => {
                  this.emitProxyEvent({
                    type: 'auth-code',
                    network: this.network,
                    userCode: code?.user_code ?? '',
                    verificationUri:
                      code?.verification_uri ?? 'https://microsoft.com/link',
                    expiresInSeconds: code?.expires_in ?? 900,
                  });
                },
              })
            : createClient({
                ...upstreamConfig,
                auth: 'offline',
              });
          try {
            upstream.socket?.setNoDelay(true);
          } catch {}
          activeUpstream = upstream;
          let abandoned = false;
          if (!forcePremium) {
            (upstream as NodeJS.EventEmitter).once('encryption_begin', () => {
              if (abandoned || sessionEnded || client.ended) return;
              abandoned = true;
              try {
                (upstream as unknown as { socket?: Socket }).socket?.destroy();
              } catch {}
              try {
                upstream.end('Switching to premium auth');
              } catch {}
              void connectUpstream(true);
            });
          }
          let connectTimeout: NodeJS.Timeout | undefined;
          upstream.once('connect', () => {
            connectTimeout = setTimeout(() => {
              if (!upstreamReady && !sessionEnded && upstream === activeUpstream) {
                if (!upstream.ended) {
                  try {
                    upstream.end('Upstream connection timed out');
                  } catch {}
                }
                if (!client.ended) {
                  try {
                    client.end('Upstream connection timed out');
                  } catch {}
                }
                teardown();
              }
            }, 15_000);
          });
          (upstream as NodeJS.EventEmitter).on(
            'raw',
            (buffer: Buffer, meta: McPacketMeta) => {
              if (upstream !== activeUpstream || meta.state !== states.PLAY) return;
              if (meta.name === 'login') {
                upstreamReady = true;
                clearTimeout(connectTimeout);
              }
              if (!client.ended && client.state === states.PLAY) {
                try {
                  client.writeRaw(buffer);
                } catch {}
              } else {
                pendingUpstreamBuffers.push(buffer);
              }
            },
          );
          (upstream as NodeJS.EventEmitter).on(
            'packet',
            (data: Record<string, unknown>, meta: McPacketMeta, buffer: Buffer) => {
              if (upstream !== activeUpstream) return;
              if (meta.state === states.CONFIGURATION) {
                pendingConfigurationBuffers.push(buffer);
                flushConfiguration();
                return;
              }
              if (meta.state !== states.PLAY) return;
              if (meta.name === 'login') {
                upstreamReady = true;
                clearTimeout(connectTimeout);
                flushPendingClientBuffers();
                this.clearSessionState();
                if (forcePremium) {
                  this.emitProxyEvent({ type: 'auth-success', network: this.network });
                }
                this.emitProxyEvent({
                  type: 'teams-update',
                  network: this.network,
                  teams: [],
                });
                return;
              }
              if (meta.name === 'player_info' || meta.name === 'playerlist_item') {
                this.handlePlayerInfoPacket(data);
                return;
              }
              if (meta.name === 'player_remove') {
                this.handlePlayerRemovePacket(data);
                return;
              }
              if (meta.name === 'teams' || meta.name === 'scoreboard_team') {
                this.handleTeamPacket(data);
                this.checkGameState();
              }
            },
          );
          (upstream as NodeJS.EventEmitter).on(
            'disconnect',
            (data: { reason?: string }) => {
              clearTimeout(connectTimeout);
              if (abandoned || upstream !== activeUpstream) return;
              if (!upstreamReady && !sessionEnded) {
                const text =
                  data.reason !== undefined ? parseChatToPlain(data.reason) : '';
                if (forcePremium) {
                  this.emitProxyEvent({
                    type: 'auth-error',
                    network: this.network,
                    message: text || 'Sign-in failed. Please try again.',
                  });
                }
                if (!client.ended) {
                  try {
                    client.end(text || 'Disconnected by upstream server');
                  } catch {}
                }
              }
              teardown();
            },
          );
          (upstream as NodeJS.EventEmitter).on('error', (error: Error) => {
            void (async () => {
              clearTimeout(connectTimeout);
              if (abandoned || upstream !== activeUpstream) return;
              if (
                !upstreamReady &&
                isRetryableError(error) &&
                attempt < 4 &&
                !sessionEnded &&
                !client.ended
              ) {
                attempt++;
                await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
                await connectUpstream(forcePremium);
                return;
              }
              if (!upstreamReady && !sessionEnded) {
                if (forcePremium) {
                  this.emitProxyEvent({
                    type: 'auth-error',
                    network: this.network,
                    message: error?.message ?? 'Sign-in failed. Please try again.',
                  });
                }
                if (!client.ended) {
                  try {
                    client.end(`Upstream error: ${error?.message ?? 'unknown'}`);
                  } catch {}
                }
              }
              teardown();
            })();
          });
          (upstream as NodeJS.EventEmitter).on('end', () => {
            clearTimeout(connectTimeout);
            if (abandoned || upstream !== activeUpstream) return;
            if (!upstreamReady && !sessionEnded) {
              if (forcePremium) {
                this.emitProxyEvent({
                  type: 'auth-error',
                  network: this.network,
                  message: 'Sign-in failed. Please try again.',
                });
              }
              if (!client.ended) {
                try {
                  client.end('Upstream closed the connection before login completed');
                } catch {}
              }
            }
            teardown();
          });
        };
        void connectUpstream(false);
        (client as NodeJS.EventEmitter).on(
          'raw',
          (buffer: Buffer, meta: McPacketMeta) => {
            if (meta.state !== states.PLAY || !activeUpstream) return;
            if (!upstreamReady) {
              pendingClientBuffers.push(buffer);
              return;
            }
            if (!activeUpstream.ended) {
              try {
                activeUpstream.writeRaw(buffer);
              } catch {}
            }
          },
        );
        (client as NodeJS.EventEmitter).on('end', () => {
          teardown();
        });
      });
    });
  }

  private handlePlayerInfoPacket(data: Record<string, unknown>): void {
    const action = data.action;
    const items = data.data as Record<string, unknown>[] | undefined;
    if (!items) return;
    const isBitflagAction = typeof action === 'object' && action !== null;
    const isAdd =
      (typeof action === 'number' && action === 0) ||
      (typeof action === 'string' && action === 'add_player') ||
      (isBitflagAction && (action as Record<string, unknown>).add_player === true);
    const isLegacyRemove =
      (typeof action === 'number' && action === 4) ||
      (typeof action === 'string' && action === 'remove_player');
    for (const item of items) {
      const nestedPlayer = item.player as Record<string, unknown> | undefined;
      const rawName =
        (item.name as string | undefined) ?? (nestedPlayer?.name as string | undefined);
      const uuid = item.uuid ?? item.UUID;
      if (isAdd && !isNPC(item) && rawName !== undefined) {
        const plain = stripColorCodes(rawName);
        if (plain) {
          this.uuidToName.set(uuid as string, plain);
          this.addKnownPlayer(rawName);
        }
      } else if (isLegacyRemove) {
        const plainName =
          rawName !== undefined
            ? stripColorCodes(rawName)
            : this.uuidToName.get(uuid as string);
        if (plainName !== undefined) {
          this.removeKnownPlayer(plainName);
          this.uuidToName.delete(uuid as string);
        }
      } else if (action === undefined) {
        const online = item.online as boolean | undefined;
        if (rawName !== undefined && !isNPC(item)) {
          const plain = stripColorCodes(rawName);
          if (plain) {
            if (online === true) {
              this.uuidToName.set(uuid as string, plain);
              this.addKnownPlayer(rawName);
            }
            if (online === false) {
              this.removeKnownPlayer(plain);
              this.uuidToName.delete(uuid as string);
            }
          }
        }
      }
    }
  }

  private handlePlayerRemovePacket(data: Record<string, unknown>): void {
    const uuids = data.players as string[] | undefined;
    if (!uuids) return;
    for (const uuid of uuids) {
      const plainName = this.uuidToName.get(uuid);
      if (plainName !== undefined) {
        this.removeKnownPlayer(plainName);
        this.uuidToName.delete(uuid);
      }
    }
  }

  private handleTeamPacket(data: Record<string, unknown>): void {
    const teamId = data.team as string | undefined;
    const mode = data.mode as number | undefined;
    if (teamId === undefined || mode === undefined) return;
    if (mode === 1) {
      this.teamPlayers.delete(teamId);
      this.teamColors.delete(teamId);
    }
    if (mode === 0 || mode === 2) {
      const rawNameField = data.name;
      const rawName =
        typeof rawNameField === 'string'
          ? rawNameField
          : extractComponentText(rawNameField);
      const color = extractTeamColor(data.prefix, data.color ?? data.formatting, rawName);
      this.teamColors.set(teamId, color);
    }
    if (mode === 0 || mode === 3) {
      const players = (data.players as string[] | undefined) ?? [];
      let members = this.teamPlayers.get(teamId);
      if (!members) {
        members = new Set();
        this.teamPlayers.set(teamId, members);
      }
      for (const player of players) {
        members.add(player);
        this.playerTeam.set(player, teamId);
      }
    }
    if (mode === 4) {
      const players = (data.players as string[] | undefined) ?? [];
      const members = this.teamPlayers.get(teamId);
      if (members) {
        for (const player of players) {
          members.delete(player);
          if (this.playerTeam.get(player) === teamId) {
            this.playerTeam.delete(player);
          }
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.close();
    this.server = null;
    this.lastError = null;
    this.sessions.clear();
    this.clearSessionState();
    this.emitProxyEvent({
      type: 'status',
      network: this.network,
      running: false,
      port: this.localPort,
      bindHost: this.bindHost,
      error: null,
    });
  }

  async restart(newPort?: number, newBindHost?: ProxyBindHost): Promise<void> {
    await this.stop();
    if (newPort !== undefined) this.localPort = newPort;
    if (newBindHost !== undefined) this.bindHost = newBindHost;
    await this.start();
  }

  getStatus(): {
    running: boolean;
    port: number;
    bindHost: ProxyBindHost;
    clientCount: number;
    error: string | null;
  } {
    return {
      running: this.server !== null,
      port: this.localPort,
      bindHost: this.bindHost,
      clientCount: this.sessions.size,
      error: this.lastError,
    };
  }
}

export class ProxyManager extends EventEmitter {
  private pika: BedwarsProxy;
  private jartex: BedwarsProxy;

  constructor(pikaPort: number, jartexPort: number, bindHost: ProxyBindHost) {
    super();
    this.pika = new BedwarsProxy(
      'pikanetwork',
      endpoints.pikanetwork.host,
      endpoints.pikanetwork.port,
      pikaPort,
      bindHost,
    );
    this.jartex = new BedwarsProxy(
      'jartexnetwork',
      endpoints.jartexnetwork.host,
      endpoints.jartexnetwork.port,
      jartexPort,
      bindHost,
    );
    const forwardEvent = (event: ProxyEvent): void => {
      this.emit('event', event);
    };
    this.pika.on('proxy-event', forwardEvent);
    this.jartex.on('proxy-event', forwardEvent);
  }

  async startAll(): Promise<void> {
    await Promise.all([this.pika.start(), this.jartex.start()]);
  }

  async stopAll(): Promise<void> {
    await Promise.all([this.pika.stop(), this.jartex.stop()]);
  }

  async updatePort(network: ProxyNetwork, port: number): Promise<void> {
    if (network === 'pikanetwork') {
      await this.pika.restart(port);
    } else {
      await this.jartex.restart(port);
    }
  }

  async updateBindHost(bindHost: ProxyBindHost): Promise<void> {
    await Promise.all([
      this.pika.restart(undefined, bindHost),
      this.jartex.restart(undefined, bindHost),
    ]);
  }

  getStatus(): { pika: ProxyStatus; jartex: ProxyStatus } {
    return {
      pika: this.pika.getStatus(),
      jartex: this.jartex.getStatus(),
    };
  }
}
