import type { ClientOptions } from 'minecraft-protocol';
import type { Buffer } from 'node:buffer';
import type { Socket } from 'node:net';
import type { McClient, McServer } from './mc-protocol-types';
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

type PacketDirection = 'serverbound' | 'clientbound';
type PendingQueue =
  'serverPlay' | 'serverConfiguration' | 'clientPlay' | 'clientConfiguration';

interface ParsedPacket {
  metadata: { size: number };
  data: { name: string; params: Record<string, unknown> };
}

interface PacketEndpoint extends McClient {
  decompressor?: NodeJS.EventEmitter;
  splitter: NodeJS.EventEmitter;
  deserializer: { parsePacketBuffer: (buffer: Buffer) => ParsedPacket };
}

interface DecodedPacketEvent {
  direction: PacketDirection;
  state: string;
  name: string;
  data: Record<string, unknown>;
}

interface ProxyConnectionOptions {
  server: McServer;
  client: McClient;
  remoteHost: string;
  remotePort: number;
}

/**
 * One transparent Minecraft connection.
 *
 * Packet buffers are forwarded before decoding and decoding is only used for
 * state synchronization and overlay features. A decode failure can therefore
 * never drop or rewrite traffic between the real client and server.
 */
class ProxyConnection extends EventEmitter {
  private readonly server: McServer;
  private readonly client: McClient;
  private readonly remoteHost: string;
  private readonly remotePort: number;
  private readonly pending: Record<PendingQueue, Buffer[]> = {
    serverPlay: [],
    serverConfiguration: [],
    clientPlay: [],
    clientConfiguration: [],
  };
  private readonly cleanup: Array<() => void> = [];
  private readonly observedUpstreams = new WeakSet<object>();
  private upstream: McClient | null = null;
  private upstreamReady = false;
  private upstreamDisconnectReason: string | null = null;
  private configurationReady = false;
  private awaitingConfigurationAcknowledgement = false;
  private retryAttempt = 0;
  private ended = false;

  constructor(options: ProxyConnectionOptions) {
    super();
    this.server = options.server;
    this.client = options.client;
    this.remoteHost = options.remoteHost;
    this.remotePort = options.remotePort;
  }

  start(): this {
    this.observePackets(this.client, 'serverbound');

    const onConfigurationReady = (): void => {
      this.configurationReady = true;
      this.flush('clientConfiguration', this.client);
    };
    this.client.on('proxy-configuration-ready', onConfigurationReady);
    this.cleanup.push(() =>
      this.client.off('proxy-configuration-ready', onConfigurationReady),
    );

    const onLocalPlayerJoin = (joinedClient: McClient): void => {
      if (joinedClient !== this.client) return;
      this.flush('clientPlay', this.client);
      this.server.off('playerJoin', onLocalPlayerJoin);
    };
    this.server.on('playerJoin', onLocalPlayerJoin);
    this.cleanup.push(() => this.server.off('playerJoin', onLocalPlayerJoin));

    const onClientEnd = (): void => this.close();
    this.client.once('end', onClientEnd);
    this.cleanup.push(() => this.client.off('end', onClientEnd));

    this.connectUpstream(false);
    return this;
  }

  close(reason = 'Proxy session ended'): void {
    if (this.ended) return;
    this.ended = true;

    for (const unsubscribe of this.cleanup.splice(0)) unsubscribe();

    if (this.upstream && !this.upstream.ended) {
      try {
        this.upstream.end(reason);
      } catch {}
    }
    if (!this.client.ended) {
      try {
        this.client.end(reason);
      } catch {}
    }

    this.emit('close');
  }

  private connectUpstream(forcePremium: boolean): void {
    if (this.ended || this.client.ended) return;

    this.upstreamReady = false;
    this.upstreamDisconnectReason = null;
    this.pending.clientConfiguration.length = 0;

    const upstreamConfig: ClientOptions = {
      host: this.remoteHost,
      port: this.remotePort,
      username: this.client.username,
      version: this.client.version,
      fakeHost: this.remoteHost,
      keepAlive: false,
      hideErrors: true,
      connect: (candidate: McClient) => {
        const socket = connect({
          host: this.remoteHost,
          port: this.remotePort,
          family: 4,
        });
        (candidate as unknown as { setSocket: (value: Socket) => void }).setSocket(
          socket,
        );
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
          }) => this.emit('auth-code', code),
        })
      : createClient({ ...upstreamConfig, auth: 'offline' });

    this.makeUpstreamPassiveAfterLogin(upstream);
    this.upstream = upstream;

    try {
      upstream.socket?.setNoDelay(true);
    } catch {}

    let abandoned = false;
    let connectTimeout: NodeJS.Timeout | undefined;
    this.cleanup.push(() => clearTimeout(connectTimeout));

    const abandon = (reason: string): void => {
      if (abandoned) return;
      abandoned = true;
      clearTimeout(connectTimeout);
      if (this.upstream === upstream) this.upstream = null;
      try {
        upstream.end(reason);
      } catch {}
    };

    if (!forcePremium) {
      upstream.once('encryption_begin', () => {
        if (abandoned || this.ended || upstream !== this.upstream) return;
        abandon('Switching to premium authentication');
        this.connectUpstream(true);
      });
    }

    upstream.once('connect', () => {
      connectTimeout = setTimeout(() => {
        if (abandoned || this.ended || upstream !== this.upstream) return;
        this.upstreamDisconnectReason = 'Upstream connection timed out';
        upstream.end(this.upstreamDisconnectReason);
      }, 15_000);
    });

    upstream.on('state', (state: string) => {
      if (
        abandoned ||
        upstream !== this.upstream ||
        (state !== states.CONFIGURATION && state !== states.PLAY)
      ) {
        return;
      }

      if (!this.observedUpstreams.has(upstream)) {
        this.observePackets(upstream, 'clientbound');
        this.observedUpstreams.add(upstream);
      }
      if (state === states.CONFIGURATION) {
        this.flush('serverConfiguration', upstream);
      }
    });

    upstream.on('playerJoin', () => {
      if (abandoned || upstream !== this.upstream) return;
      clearTimeout(connectTimeout);
      this.retryAttempt = 0;
      this.upstreamReady = true;
      this.flush('serverPlay', upstream);
      if (forcePremium) this.emit('auth-success');
      this.emit('upstream-ready');
    });

    upstream.on('disconnect', (packet: { reason?: unknown }) => {
      if (abandoned || upstream !== this.upstream) return;
      this.upstreamDisconnectReason =
        packet.reason === undefined ? null : parseChatToPlain(packet.reason);
    });

    upstream.on('error', (error: Error) => {
      void (async () => {
        if (abandoned || this.ended || upstream !== this.upstream) return;

        // Raw forwarding has already happened. A play decoder error belongs to
        // the optional observer and must not terminate a healthy transport.
        if (this.upstreamReady) {
          this.emit('packet-error', error);
          return;
        }

        if (isRetryableError(error) && this.retryAttempt < 4) {
          this.retryAttempt++;
          abandon('Retrying upstream connection');
          await new Promise((resolve) =>
            setTimeout(resolve, 800 * 2 ** this.retryAttempt),
          );
          this.connectUpstream(forcePremium);
          return;
        }

        this.upstreamDisconnectReason = `Upstream error: ${error.message}`;
        upstream.end(this.upstreamDisconnectReason);
      })();
    });

    upstream.on('end', () => {
      clearTimeout(connectTimeout);
      if (abandoned || this.ended || upstream !== this.upstream) return;

      const reason =
        this.upstreamDisconnectReason ||
        (this.upstreamReady
          ? 'Upstream closed the connection'
          : 'Upstream closed the connection before login completed');
      if (forcePremium && !this.upstreamReady) this.emit('auth-error', reason);
      this.close(reason);
    });
  }

  private makeUpstreamPassiveAfterLogin(upstream: McClient): void {
    const originalWrite = upstream.write.bind(upstream);
    upstream.write = (name, data) => {
      const isLoginPacket =
        upstream.state === states.HANDSHAKING || upstream.state === states.LOGIN;
      if (isLoginPacket) originalWrite(name, data);
    };
  }

  private observePackets(endpoint: McClient, direction: PacketDirection): void {
    const internals = endpoint as PacketEndpoint;
    const packetStream = internals.decompressor ?? internals.splitter;
    const onRawPacket = (buffer: Buffer): void => {
      if (direction === 'clientbound' && endpoint !== this.upstream) return;
      const state = endpoint.state;

      // Forward first. Everything below this line is optional observation.
      if (direction === 'serverbound') {
        this.routeServerbound(state, buffer);
      } else {
        this.routeClientbound(state, buffer);
      }

      this.decodePacket(internals, direction, state, buffer);
    };

    packetStream.prependListener('data', onRawPacket);
    this.cleanup.push(() => packetStream.off('data', onRawPacket));
  }

  private decodePacket(
    endpoint: PacketEndpoint,
    direction: PacketDirection,
    state: string,
    buffer: Buffer,
  ): void {
    try {
      const parsed = endpoint.deserializer.parsePacketBuffer(buffer);
      if (parsed.metadata.size !== buffer.length) {
        this.emit(
          'packet-error',
          new Error(`Decoded ${parsed.metadata.size} of ${buffer.length} packet bytes`),
        );
        return;
      }

      const event: DecodedPacketEvent = {
        direction,
        state,
        name: parsed.data.name,
        data: parsed.data.params,
      };
      this.handleDecodedPacket(event);
      this.emit('packet', event);
    } catch (error) {
      this.emit('packet-error', error);
    }
  }

  private routeServerbound(state: string, buffer: Buffer): void {
    const upstream = this.upstream;
    if (state === states.CONFIGURATION) {
      if (upstream?.state === states.CONFIGURATION || upstream?.state === states.PLAY) {
        this.writeRaw(upstream, buffer);
      } else {
        this.pending.serverConfiguration.push(buffer);
      }
      return;
    }

    if (state !== states.PLAY) return;
    const canReceivePlay = upstream?.state === states.PLAY;
    const isReconfigurationAcknowledgement =
      this.awaitingConfigurationAcknowledgement &&
      upstream?.state === states.CONFIGURATION;
    if (upstream && (canReceivePlay || isReconfigurationAcknowledgement)) {
      this.writeRaw(upstream, buffer);
    } else {
      this.pending.serverPlay.push(buffer);
    }
  }

  private routeClientbound(state: string, buffer: Buffer): void {
    if (state === states.CONFIGURATION) {
      this.pending.clientConfiguration.push(buffer);
      if (this.configurationReady) {
        this.flush('clientConfiguration', this.client);
      }
      return;
    }

    if (state !== states.PLAY) return;
    if (this.client.state === states.PLAY) {
      this.writeRaw(this.client, buffer);
    } else {
      this.pending.clientPlay.push(buffer);
    }
  }

  private handleDecodedPacket(event: DecodedPacketEvent): void {
    if (
      event.direction === 'clientbound' &&
      event.state === states.PLAY &&
      event.name === 'start_configuration' &&
      this.client.state === states.PLAY
    ) {
      this.awaitingConfigurationAcknowledgement = true;
      return;
    }

    if (
      event.direction === 'serverbound' &&
      event.state === states.PLAY &&
      event.name === 'configuration_acknowledged' &&
      this.awaitingConfigurationAcknowledgement
    ) {
      this.awaitingConfigurationAcknowledgement = false;
      this.client.state = states.CONFIGURATION;
      return;
    }

    if (
      event.direction === 'serverbound' &&
      event.state === states.CONFIGURATION &&
      event.name === 'finish_configuration'
    ) {
      this.client.state = states.PLAY;
      this.flush('clientPlay', this.client);
    }
  }

  private flush(queue: PendingQueue, destination: McClient): void {
    for (const buffer of this.pending[queue].splice(0)) {
      this.writeRaw(destination, buffer);
    }
  }

  private writeRaw(destination: McClient, buffer: Buffer): void {
    if (destination.ended) return;
    try {
      destination.writeRaw(buffer);
    } catch {}
  }
}

export class BedwarsProxy extends EventEmitter {
  private readonly network: ProxyNetwork;
  private readonly remoteHost: string;
  private readonly remotePort: number;
  private localPort: number;
  private bindHost: ProxyBindHost;
  private server: McServer | null = null;
  private connections = new Set<ProxyConnection>();
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

  private closeConnections(reason: string): void {
    for (const connection of [...this.connections]) connection.close(reason);
    this.connections.clear();
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
        keepAlive: false,
        hideErrors: true,
        errorHandler: (client: McClient, error: unknown) => {
          if (client.ended) return;
          const message = error instanceof Error ? error.message : String(error);
          (client as unknown as { _end: (reason: string) => void })._end(message);
        },
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
        this.closeConnections('Proxy server stopped');
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
        const sessionKey = `${username}_${Date.now()}_${this.connections.size}`;
        const connection = new ProxyConnection({
          server,
          client,
          remoteHost: this.remoteHost,
          remotePort: this.remotePort,
        });

        this.sessions.set(sessionKey, username);
        this.connections.add(connection);
        this.emitProxyEvent({
          type: 'client-connect',
          network: this.network,
          clientName: username,
        });

        connection.on(
          'auth-code',
          (code: {
            user_code?: string;
            verification_uri?: string;
            expires_in?: number;
          }) => {
            this.emitProxyEvent({
              type: 'auth-code',
              network: this.network,
              userCode: code.user_code ?? '',
              verificationUri: code.verification_uri ?? 'https://microsoft.com/link',
              expiresInSeconds: code.expires_in ?? 900,
            });
          },
        );
        connection.on('auth-success', () => {
          this.emitProxyEvent({ type: 'auth-success', network: this.network });
        });
        connection.on('auth-error', (message: string) => {
          this.emitProxyEvent({
            type: 'auth-error',
            network: this.network,
            message: message || 'Sign-in failed. Please try again.',
          });
        });
        connection.on('upstream-ready', () => {
          this.clearSessionState();
          this.emitProxyEvent({
            type: 'teams-update',
            network: this.network,
            teams: [],
          });
        });
        connection.on('packet', (event: DecodedPacketEvent) => {
          if (event.direction !== 'clientbound' || event.state !== states.PLAY) {
            return;
          }
          if (event.name === 'player_info' || event.name === 'playerlist_item') {
            this.handlePlayerInfoPacket(event.data);
            return;
          }
          if (event.name === 'player_remove') {
            this.handlePlayerRemovePacket(event.data);
            return;
          }
          if (event.name === 'teams' || event.name === 'scoreboard_team') {
            this.handleTeamPacket(event.data);
            this.checkGameState();
          }
        });
        connection.once('close', () => {
          this.connections.delete(connection);
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
        });

        connection.start();
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
    this.closeConnections('Proxy stopped');
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
