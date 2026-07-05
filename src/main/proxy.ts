import { EventEmitter } from 'events';
import type { Socket } from 'net';
import * as minecraftProtocol from 'minecraft-protocol';
import { app, clipboard, dialog, shell } from 'electron';
import { join } from 'path';

const MC_COLOR_BYTE_TO_HEX: Record<number, string> = {
  0: '#000000',
  1: '#0000AA',
  2: '#00AA00',
  3: '#00AAAA',
  4: '#AA0000',
  5: '#AA00AA',
  6: '#FFAA00',
  7: '#AAAAAA',
  8: '#555555',
  9: '#5555FF',
  10: '#55FF55',
  11: '#55FFFF',
  12: '#FF5555',
  13: '#FF55FF',
  14: '#FFFF55',
  15: '#FFFFFF',
};

const MC_COLOR_CHAR_TO_HEX: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
};

const MC_COLOR_NAME_TO_HEX: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF',
  orange: '#FFA500',
  pink: '#FFB6C1',
  lime: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  brown: '#8B4513',
  light_blue: '#ADD8E6',
  light_gray: '#D3D3D3',
};

export type ProxyNetwork = 'pikanetwork' | 'jartexnetwork';
export type ProxyBindHost = '0.0.0.0' | '127.0.0.1';

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

interface McPacketMeta {
  name: string;
  state: string;
}

interface McClient extends NodeJS.EventEmitter {
  username: string;
  version: string;
  ended: boolean;
  state: string;
  socket: Socket;
  write(name: string, data: Record<string, unknown>): void;
  writeRaw(buffer: Buffer): void;
  end(reason?: string): void;
}

interface McServer extends NodeJS.EventEmitter {
  close(): void;
}

interface McModule {
  createServer(options: Record<string, unknown>): McServer;
  createClient(options: Record<string, unknown>): McClient;
  states: Record<string, string>;
}

const PROXY_VERSION = '1.8';
const UPSTREAM_TIMEOUT_MS = 15_000;
const UPSTREAM_AUTH_TIMEOUT_MS = 180_000;
const UPSTREAM_MAX_RETRIES = 4;
const UPSTREAM_RETRY_BASE_MS = 800;
const UPSTREAM_AUTH_CACHE_DIR = join(app.getPath('userData'), 'minecraft-auth-cache');

type UpstreamAuthMode = 'microsoft' | 'offline';

function getUpstreamAuthMode(network: ProxyNetwork): UpstreamAuthMode {
  return network === 'pikanetwork' ? 'microsoft' : 'offline';
}

function isRetryableError(err: Error): boolean {
  const code = (err as NodeJS.ErrnoException).code ?? '';

  return (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  );
}

function retryDelay(attempt: number): Promise<void> {
  return new Promise((res) => setTimeout(res, UPSTREAM_RETRY_BASE_MS * 2 ** attempt));
}

function setNoDelay(client: McClient): void {
  try {
    client.socket?.setNoDelay(true);
  } catch {}
}

function stripColorCodes(s: string): string {
  return s.replace(/[§\u00A7\uFFFD][0-9A-FK-OR]/gi, '').replace(/[§\u00A7\uFFFD]/g, '');
}

function extractComponentText(component: unknown): string {
  if (typeof component === 'string') {
    try {
      return extractComponentText(JSON.parse(component) as unknown);
    } catch {
      return component;
    }
  }

  if (Array.isArray(component)) {
    return (component as unknown[]).map(extractComponentText).join('');
  }

  if (typeof component === 'object' && component !== null) {
    const obj = component as Record<string, unknown>;

    let text = typeof obj.text === 'string' ? obj.text : '';

    if (typeof obj.translate === 'string') {
      text += obj.translate;
    }

    if (Array.isArray(obj.extra)) {
      text += (obj.extra as unknown[]).map(extractComponentText).join('');
    }

    if (Array.isArray(obj.with)) {
      text += (obj.with as unknown[]).map(extractComponentText).join('');
    }

    return text;
  }

  return '';
}

function parseChatToPlain(raw: string): string {
  return stripColorCodes(extractComponentText(raw));
}

function extractSectionColor(s: string): string | null {
  const m = s.match(/[§\u00A7\uFFFD]([0-9a-fA-F])/);

  if (m) {
    return MC_COLOR_CHAR_TO_HEX[m[1].toLowerCase()] ?? null;
  }

  return null;
}

function extractTeamColor(prefix: string, colorField: unknown, rawName: string): string {
  const fromPrefix = extractSectionColor(prefix);

  if (fromPrefix) {
    return fromPrefix;
  }

  if (typeof colorField === 'number' && colorField >= 0 && colorField <= 15) {
    return MC_COLOR_BYTE_TO_HEX[colorField] ?? '#AAAAAA';
  }

  if (typeof colorField === 'string') {
    const named = MC_COLOR_NAME_TO_HEX[colorField.toLowerCase()];

    if (named) {
      return named;
    }
  }

  const fromName = extractSectionColor(rawName);

  if (fromName) {
    return fromName;
  }

  return '#AAAAAA';
}

function formatTeamName(teamId: string): string {
  const lower = teamId.toLowerCase();

  for (const colorName of Object.keys(MC_COLOR_NAME_TO_HEX)) {
    if (lower.includes(colorName)) {
      return colorName.charAt(0).toUpperCase() + colorName.slice(1);
    }
  }

  return '';
}

function isGameTeam(teamId: string): boolean {
  return formatTeamName(teamId) !== '';
}

function isNPC(item: Record<string, unknown>): boolean {
  const gm = item.gamemode as number | undefined;

  if (typeof gm === 'number' && gm < 0) {
    return true;
  }

  const displayName = item.displayName;

  if (displayName !== undefined && displayName !== null) {
    if (extractComponentText(displayName).includes('[NPC]')) {
      return true;
    }
  }

  return false;
}

function safeWriteRaw(target: McClient, buffer: Buffer): void {
  if (!target.ended) {
    try {
      target.writeRaw(buffer);
    } catch {}
  }
}

function safeEnd(target: McClient, reason?: string): void {
  if (!target.ended) {
    try {
      target.end(reason ?? '');
    } catch {}
  }
}

class BedwarsProxy extends EventEmitter {
  private readonly network: ProxyNetwork;
  private readonly remoteHost: string;
  private readonly remotePort: number;

  private localPort: number;
  private bindHost: ProxyBindHost;

  private mc: McModule;
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

    this.mc = minecraftProtocol as unknown as McModule;
  }

  private emit2(event: ProxyEvent): void {
    this.emit('proxy-event', event);
  }

  private buildTeams(): TeamInfo[] {
    const teams: TeamInfo[] = [];

    for (const [teamId, players] of this.teamPlayers) {
      if (players.size === 0) {
        continue;
      }

      const displayName = formatTeamName(teamId);

      if (!displayName) {
        continue;
      }

      const color = this.teamColors.get(teamId) ?? '#AAAAAA';

      teams.push({
        name: displayName,
        displayName,
        color,
        players: [...players],
      });
    }

    return teams;
  }

  private checkGameState(): void {
    const populated = [...this.teamPlayers.entries()].filter(
      ([id, s]) => isGameTeam(id) && s.size > 0,
    );

    const hasTeams = populated.length >= 2;

    if (hasTeams && !this.gameActive) {
      this.gameActive = true;

      this.emit2({
        type: 'teams-update',
        network: this.network,
        teams: this.buildTeams(),
      });
    } else if (!hasTeams && this.gameActive) {
      this.gameActive = false;

      this.emit2({
        type: 'teams-update',
        network: this.network,
        teams: [],
      });
    } else if (this.gameActive) {
      this.emit2({
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
    if (!username || username === '§r') {
      return;
    }

    const plain = stripColorCodes(username);

    if (!plain || this.knownPlayers.has(plain)) {
      return;
    }

    this.knownPlayers.add(plain);

    this.emit2({
      type: 'player-join',
      network: this.network,
      username: plain,
    });
  }

  private removeKnownPlayer(username: string): void {
    if (!username) {
      return;
    }

    const plain = stripColorCodes(username);

    if (!plain) {
      return;
    }

    if (this.knownPlayers.delete(plain)) {
      this.emit2({
        type: 'player-quit',
        network: this.network,
        username: plain,
      });
    }
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      const mc = this.mc;

      const server = mc.createServer({
        'online-mode': false,
        port: this.localPort,
        host: this.bindHost,
        version: PROXY_VERSION,
        motd: `THEBOIS | ${
          this.network === 'pikanetwork' ? 'PikaNetwork' : 'JartexNetwork'
        }`,
        maxPlayers: 5,
        hideErrors: false,
      });

      (
        server as unknown as {
          _server?: {
            on(e: string, cb: (s: Socket) => void): void;
          };
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

      server.once('error', (err: Error) => {
        this.lastError = err.message;
        this.server = null;

        this.sessions.clear();
        this.clearSessionState();

        this.emit2({
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

        this.emit2({
          type: 'status',
          network: this.network,
          running: true,
          port: this.localPort,
          bindHost: this.bindHost,
          error: null,
        });

        resolveOnce();
      });

      server.on('error', (err: Error) => {
        this.lastError = err.message;
        this.server = null;

        this.sessions.clear();
        this.clearSessionState();

        this.emit2({
          type: 'status',
          network: this.network,
          running: false,
          port: this.localPort,
          bindHost: this.bindHost,
          error: err.message,
        });
      });

      server.on('login', (client: McClient) => {
        setNoDelay(client);

        const username = client.username;
        const sessionKey = `${username}_${Date.now()}`;

        this.sessions.set(sessionKey, username);

        this.emit2({
          type: 'client-connect',
          network: this.network,
          clientName: username,
        });

        let upstreamReady = false;
        let sessionEnded = false;
        let attempt = 0;

        let activeUpstream: McClient | null = null;

        const teardown = (): void => {
          if (sessionEnded) {
            return;
          }

          sessionEnded = true;

          this.sessions.delete(sessionKey);

          this.emit2({
            type: 'client-disconnect',
            network: this.network,
            clientName: username,
          });

          if (this.sessions.size === 0) {
            this.clearSessionState();

            this.emit2({
              type: 'teams-update',
              network: this.network,
              teams: [],
            });
          }

          if (activeUpstream) {
            safeEnd(activeUpstream);
          }

          safeEnd(client);
        };

        const connectUpstream = (): void => {
          if (sessionEnded || client.ended) {
            return;
          }

          const upstreamAuthMode = getUpstreamAuthMode(this.network);

          const upstream = mc.createClient({
            host: this.remoteHost,
            port: this.remotePort,
            username,
            version: PROXY_VERSION,
            auth: upstreamAuthMode,
            profilesFolder: UPSTREAM_AUTH_CACHE_DIR,
            onMsaCode: (data: {
              message?: string;
              user_code?: string;
              verification_uri?: string;
              verification_uri_complete?: string;
            }) => {
              const url =
                data.verification_uri_complete ??
                data.verification_uri ??
                'https://www.microsoft.com/link';
              const message =
                data.message ??
                `Open ${url} and enter code ${data.user_code ?? ''}`;

              clipboard.writeText(data.verification_uri_complete ?? data.user_code ?? url);
              void shell.openExternal(url);

              dialog.showMessageBoxSync({
                type: 'info',
                message: `Authenticate Minecraft proxy upstream:\n\n${message}\n\nThe link/code was copied to your clipboard.`,
              });
            },
            hideErrors: true,
          });

          setNoDelay(upstream);

          activeUpstream = upstream;

          const connectTimeout = setTimeout(
            () => {
              if (!upstreamReady && !sessionEnded) {
                safeEnd(upstream);
                safeEnd(client, 'Upstream connection timed out');
                teardown();
              }
            },
            upstreamAuthMode === 'microsoft' ? UPSTREAM_AUTH_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS,
          );

          (upstream as NodeJS.EventEmitter).on(
            'raw',
            (buffer: Buffer, meta: McPacketMeta) => {
              if (meta.state !== mc.states.PLAY) {
                return;
              }

              safeWriteRaw(client, buffer);
            },
          );

          (upstream as NodeJS.EventEmitter).on(
            'packet',
            (data: Record<string, unknown>, meta: McPacketMeta) => {
              if (meta.state !== mc.states.PLAY) {
                return;
              }

              try {
                if (meta.name === 'login') {
                  upstreamReady = true;

                  clearTimeout(connectTimeout);

                  this.clearSessionState();

                  this.emit2({
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

                if (meta.name === 'teams' || meta.name === 'scoreboard_team') {
                  this.handleTeamPacket(data);

                  this.checkGameState();

                  return;
                }

                if (meta.name === 'chat' || meta.name === 'system_chat') {
                  this.handleChatPacket(data);
                }
              } catch (err) {
                console.warn('Failed to inspect upstream packet', {
                  packet: meta.name,
                  err,
                });
              }
            },
          );

          (upstream as NodeJS.EventEmitter).on('error', (err: Error) => {
            void (async () => {
              clearTimeout(connectTimeout);

              if (
                !upstreamReady &&
                isRetryableError(err) &&
                attempt < UPSTREAM_MAX_RETRIES &&
                !sessionEnded &&
                !client.ended
              ) {
                attempt++;

                await retryDelay(attempt - 1);

                connectUpstream();

                return;
              }

              if (!upstreamReady && !sessionEnded) {
                safeEnd(client, `Upstream error: ${err?.message ?? 'unknown'}`);
              }

              teardown();
            })();
          });

          (upstream as NodeJS.EventEmitter).on('end', () => {
            clearTimeout(connectTimeout);
            teardown();
          });
        };

        connectUpstream();

        (client as NodeJS.EventEmitter).on(
          'raw',
          (buffer: Buffer, meta: McPacketMeta) => {
            if (meta.state !== mc.states.PLAY || !upstreamReady || !activeUpstream) {
              return;
            }

            safeWriteRaw(activeUpstream, buffer);
          },
        );

        (client as NodeJS.EventEmitter).on('error', () => {
          teardown();
        });

        (client as NodeJS.EventEmitter).on('end', () => {
          teardown();
        });
      });
    });
  }

  private handlePlayerInfoPacket(data: Record<string, unknown>): void {
    const action = data.action;

    const items = data.data as Record<string, unknown>[] | undefined;

    if (!items) {
      return;
    }

    for (const item of items) {
      const rawName = item.name as string | undefined;

      const uuid = item.uuid ?? item.UUID;

      const isAdd =
        (typeof action === 'number' && action === 0) ||
        (typeof action === 'string' && action === 'add_player');

      const isRemove =
        (typeof action === 'number' && action === 4) ||
        (typeof action === 'string' && action === 'remove_player');

      if (isAdd && !isNPC(item) && rawName) {
        const plain = stripColorCodes(rawName);

        if (plain) {
          this.uuidToName.set(uuid as string, plain);

          this.addKnownPlayer(rawName);
        }
      } else if (isRemove) {
        const plainName = rawName
          ? stripColorCodes(rawName)
          : this.uuidToName.get(uuid as string);

        if (plainName) {
          this.removeKnownPlayer(plainName);

          this.uuidToName.delete(uuid as string);
        }
      } else if (action === undefined) {
        const online = item.online as boolean | undefined;

        if (rawName && !isNPC(item)) {
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

  private handleChatPacket(data: Record<string, unknown>): void {
    const raw =
      (data.message as string | undefined) ?? (data.content as string | undefined) ?? '';

    const msg = parseChatToPlain(raw);

    const joinPika = msg.match(/^([A-Za-z0-9_]{1,16}) has joined! \(\d+\/\d+\)/);

    const quitPika = msg.match(/^([A-Za-z0-9_]{1,16}) has quit! \(\d+\/\d+\)/);

    const joinBw = msg.match(
      /(?:BedWars\s+)?([A-Za-z0-9_]{1,16}) (?:has )?joined (?:the )?(?:game|BedWars)/i,
    );

    const quitBw = msg.match(
      /(?:BedWars\s+)?([A-Za-z0-9_]{1,16}) (?:has )?(?:left|quit) (?:the )?(?:game|BedWars)/i,
    );

    const disconn = msg.match(/^([A-Za-z0-9_]{1,16}) disconnected!$/);

    const joiner = joinPika?.[1] ?? joinBw?.[1];

    const quitter = quitPika?.[1] ?? quitBw?.[1] ?? disconn?.[1];

    if (joiner) {
      this.addKnownPlayer(joiner);
    }

    if (quitter) {
      this.removeKnownPlayer(quitter);
    }
  }

  private handleTeamPacket(data: Record<string, unknown>): void {
    const teamId = data.team as string | undefined;

    const mode = data.mode as number | undefined;

    if (teamId === undefined || mode === undefined) {
      return;
    }

    if (mode === 1) {
      this.teamPlayers.delete(teamId);

      this.teamColors.delete(teamId);

      for (const [player, team] of this.playerTeam) {
        if (team === teamId) {
          this.playerTeam.delete(player);
        }
      }

      return;
    }

    if (mode === 0 || mode === 2) {
      const rawName = (data.name as string | undefined) ?? '';

      const prefix = (data.prefix as string | undefined) ?? '';

      const color = extractTeamColor(prefix, data.color, rawName);

      this.teamColors.set(teamId, color);
    }

    if (mode === 0 || mode === 3) {
      const players = (data.players as string[] | undefined) ?? [];

      let set = this.teamPlayers.get(teamId);

      if (!set) {
        set = new Set();

        this.teamPlayers.set(teamId, set);
      }

      for (const p of players) {
        set.add(p);

        this.playerTeam.set(p, teamId);
      }
    }

    if (mode === 4) {
      const players = (data.players as string[] | undefined) ?? [];

      const set = this.teamPlayers.get(teamId);

      if (set) {
        for (const p of players) {
          set.delete(p);

          if (this.playerTeam.get(p) === teamId) {
            this.playerTeam.delete(p);
          }
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    this.server.close();

    this.server = null;
    this.lastError = null;

    this.sessions.clear();

    this.clearSessionState();

    this.emit2({
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

    if (newPort !== undefined) {
      this.localPort = newPort;
    }

    if (newBindHost !== undefined) {
      this.bindHost = newBindHost;
    }

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
      'hub.pika.host',
      25565,
      pikaPort,
      bindHost,
    );

    this.jartex = new BedwarsProxy(
      'jartexnetwork',
      'play.jartex.fun',
      25565,
      jartexPort,
      bindHost,
    );

    const fwd = (e: ProxyEvent): void => {
      this.emit('event', e);
    };

    this.pika.on('proxy-event', fwd);
    this.jartex.on('proxy-event', fwd);
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

  getStatus(): {
    pika: ProxyStatus;
    jartex: ProxyStatus;
  } {
    return {
      pika: this.pika.getStatus(),
      jartex: this.jartex.getStatus(),
    };
  }
}
