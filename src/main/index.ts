/* eslint-disable no-console */
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from 'electron';
import type { ProxyEvent } from './proxy';
import { join } from 'path';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu-vsync');
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
}

app.commandLine.appendSwitch(
  'enable-hardware-overlays',
  'single-fullscreen,single-on-top',
);

import TailFile from '@logdna/tail-file';
import axios from 'axios';
import { autoUpdater } from 'electron-updater';
import windowStateKeeper from 'electron-window-state';
import fs from 'fs';
import http from 'http';
import https from 'https';
import readline from 'readline';
import { ProxyManager } from './proxy';
import type { ProxyNetwork, ProxyBindHost } from './proxy';

const DEFAULT_PIKA_PROXY_PORT = 25566;
const DEFAULT_JARTEX_PROXY_PORT = 25567;
const DEFAULT_PROXY_BIND_HOST: ProxyBindHost = '127.0.0.1';

const PIKA_BASE = 'https://stats.pika-network.net/api';
const JARTEX_BASE = 'https://stats.jartexnetwork.com/api';
const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 700;
const RATE_LIMIT_DELAY_MS = 3000;
const MAX_CONCURRENT = 16;
const CACHE_TTL_MS = 600_000;

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: MAX_CONCURRENT });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: MAX_CONCURRENT });

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';

function ts(): string {
  return `${DIM + new Date().toISOString().slice(11, 23) + RESET} `;
}

const noop = (): void => {};

const dbg = is.dev
  ? {
      cache: (msg: string) => console.log(`${ts() + CYAN}[CACHE] ${RESET}${msg}`),
      dedup: (msg: string) => console.log(`${ts() + MAGENTA}[DEDUP] ${RESET}${msg}`),
      sem: (msg: string) => console.log(`${ts() + BLUE}[SEM]   ${RESET}${msg}`),
      http: (msg: string) => console.log(`${ts() + GREEN}[HTTP]  ${RESET}${msg}`),
      retry: (msg: string) => console.log(`${ts() + YELLOW}[RETRY] ${RESET}${msg}`),
      ipc: (msg: string) => console.log(`${ts() + YELLOW}[IPC]   ${RESET}${msg}`),
      error: (msg: string) => console.log(`${ts() + RED}[ERROR] ${RESET}${msg}`),
      rpc: (msg: string) => console.log(`${ts() + BLUE}[RPC]   ${RESET}${msg}`),
    }
  : {
      cache: noop,
      dedup: noop,
      sem: noop,
      http: noop,
      retry: noop,
      ipc: noop,
      error: noop,
      rpc: noop,
    };

interface CacheEntry<T> {
  data: T;
  expires: number;
}

class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void {
    this.store.set(key, { data, expires: Date.now() + ttlMs });
    dbg.cache(`SET  "${key}"  (TTL ${ttlMs / 1000}s, store size: ${this.store.size})`);
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      dbg.cache(`MISS "${key}"`);
      return null;
    }
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      dbg.cache(`EXPIRED "${key}"`);
      return null;
    }
    const ttlLeft = Math.round((entry.expires - Date.now()) / 1000);
    dbg.cache(`HIT  "${key}"  (${ttlLeft}s left)`);
    return entry.data as T;
  }

  clear(): void {
    dbg.cache(`CLEAR (${this.store.size} entries flushed)`);
    this.store.clear();
  }
}

const cache = new SimpleCache();
const inFlight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    dbg.dedup(`REUSE in-flight "${key}" (${inFlight.size} total in-flight)`);
    return existing as Promise<T>;
  }
  dbg.dedup(`NEW   "${key}"`);
  const promise = fn().finally(() => {
    inFlight.delete(key);
    dbg.dedup(`DONE  "${key}" (${inFlight.size} remaining in-flight)`);
  });
  inFlight.set(key, promise);
  return promise;
}

class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];

  constructor(limit: number) {
    this.slots = limit;
  }

  acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--;
      dbg.sem(`ACQUIRE (slots left: ${this.slots}, queued: ${this.queue.length})`);
      return Promise.resolve();
    }
    dbg.sem(`QUEUE   (no slots, queued: ${this.queue.length + 1})`);
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      dbg.sem(
        `RELEASE → waking queued request (slots: ${this.slots}, queued remaining: ${this.queue.length - 1})`,
      );
      this.queue.shift()!();
    } else {
      this.slots++;
      dbg.sem(`RELEASE (slots: ${this.slots}, queue empty)`);
    }
  }
}

const sem = new Semaphore(MAX_CONCURRENT);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        const isRateLimit = (err as Error).message.includes('429');
        const base = isRateLimit ? RATE_LIMIT_DELAY_MS : delayMs;
        const wait =
          Math.min(base * Math.pow(2, i), isRateLimit ? 15_000 : 8_000) +
          Math.random() * 600;
        dbg.retry(
          `attempt ${i + 1}/${retries} failed — retrying in ${Math.round(wait)}ms  (${(err as Error).message})`,
        );
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function apiGet<T = unknown>(url: string) {
  await sem.acquire();
  const t0 = Date.now();
  dbg.http(`→ GET ${url}`);
  try {
    const res = await withRetry(async () => {
      const r = await axios.get<T>(url, {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        validateStatus: () => true,
        httpAgent,
        httpsAgent,
      });
      if (r.status === 429) throw new Error('Rate limited (429)');
      if (r.status >= 500) throw new Error(`Server error ${r.status}`);
      return r;
    });
    dbg.http(`← ${res.status} ${url}  (${Date.now() - t0}ms)`);
    return res;
  } catch (err) {
    dbg.error(`FAIL ${url}  (${Date.now() - t0}ms) — ${(err as Error).message}`);
    throw err;
  } finally {
    sem.release();
  }
}

let win: BrowserWindow | null = null;
let proxyManager: ProxyManager | null = null;

function createWindow(): void {
  const state = windowStateKeeper({ defaultWidth: 700, defaultHeight: 460 });

  win = new BrowserWindow({
    title: 'THEBOIS Overlay',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 480,
    minHeight: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    maximizable: false,
    fullscreenable: false,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      backgroundThrottling: false,
      v8CacheOptions: 'code',
    },
  });

  state.manage(win);
  win.setAlwaysOnTop(true, 'screen-saver');

  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
  }

  let saveTimer: NodeJS.Timeout | null = null;
  const debounceSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => state.saveState(win!), 800);
  };
  win.on('resize', debounceSave);
  win.on('move', debounceSave);

  win.on('close', () => {
    win?.webContents
      .executeJavaScript(`try { localStorage.removeItem('players') } catch(e) {}`)
      .catch(() => {});
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.thebois.overlay');
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w));
  if (process.platform === 'linux') await sleep(500);
  createWindow();

  proxyManager = new ProxyManager(
    DEFAULT_PIKA_PROXY_PORT,
    DEFAULT_JARTEX_PROXY_PORT,
    DEFAULT_PROXY_BIND_HOST,
  );
  proxyManager.on('event', (event: ProxyEvent) => {
    win?.webContents.send('proxy:event', event);
  });
  proxyManager
    .startAll()
    .catch((err) => console.error('[PROXY] Failed to start proxies:', err));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:close', () => win?.close());
ipcMain.on('win:toggle-minimize', () => {
  if (win?.isMinimized()) win?.showInactive();
  else win?.minimize();
});
ipcMain.on('win:open-external', (_, url: string) => void shell.openExternal(url));

let linuxCursorPoll: NodeJS.Timeout | null = null;

function startLinuxCursorPoll(): void {
  if (linuxCursorPoll) return;
  linuxCursorPoll = setInterval(() => {
    if (!win) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    if (
      cursor.x >= bounds.x &&
      cursor.x < bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y < bounds.y + bounds.height
    ) {
      win.webContents.send(
        'cursor:forwarded-move',
        cursor.x - bounds.x,
        cursor.y - bounds.y,
      );
    }
  }, 16);
}

function stopLinuxCursorPoll(): void {
  if (!linuxCursorPoll) return;
  clearInterval(linuxCursorPoll);
  linuxCursorPoll = null;
}

ipcMain.on('win:set-ignore-mouse', (_, ignore: boolean) => {
  if (!win) return;
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true });
    if (process.platform === 'linux') startLinuxCursorPoll();
  } else {
    win.setIgnoreMouseEvents(false);
    if (process.platform === 'linux') stopLinuxCursorPoll();
  }
});

ipcMain.on('win:focus', () => {
  if (win && !win.isFocused()) {
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
  }
});

const STAT_COL_W = 65;
const REMOVE_W = 36;
const BUFFER = 4;

ipcMain.on('win:fit-columns', (_, numColumns: number, nameColPx: number) => {
  if (!win) return;
  const statCols = Math.max(0, numColumns - 1);
  const w = Math.round(nameColPx) + statCols * STAT_COL_W + REMOVE_W + BUFFER;
  const { height } = win.getContentBounds();
  dbg.ipc(
    `win:fit-columns  cols=${numColumns}  nameCol=${Math.round(nameColPx)}px  → contentWidth=${w}`,
  );
  win.setContentSize(w, height);
});

ipcMain.handle('win:screenshot', async () => {
  const img = await win?.webContents.capturePage();
  if (img) clipboard.writeImage(img);
});

type FetchResult = {
  profile: unknown;
  stats: unknown;
  notFound: boolean;
  rateLimit: boolean;
  statsDisabled: boolean;
};

function makeFetchHandler(network: 'pika' | 'jartex', base: string) {
  return (
    _: Electron.IpcMainInvokeEvent,
    username: string,
    interval = 'total',
    mode = 'ALL_MODES',
    concurrent = false,
  ): Promise<FetchResult> => {
    const key = `${network}:${username.toLowerCase()}:${interval}:${mode}`;
    dbg.ipc(
      `${network}:fetch  user="${username}"  interval=${interval}  mode=${mode}  concurrent=${concurrent}`,
    );

    const cached = cache.get<FetchResult>(key);
    if (cached) return Promise.resolve(cached);

    return dedupe(key, async () => {
      const cached2 = cache.get<FetchResult>(key);
      if (cached2) return cached2;

      const profileUrl = `${base}/profile/${encodeURIComponent(username)}`;
      const directStatsUrl = `${base}/profile/${encodeURIComponent(username)}/leaderboard?type=bedwars&interval=${interval}&mode=${mode}`;

      if (concurrent) {
        const [pRes, sRes] = await Promise.all([
          apiGet(profileUrl).catch((err) => {
            dbg.error(
              `${network}:fetch profile "${username}" — ${(err as Error).message}`,
            );
            return null;
          }),
          apiGet(directStatsUrl).catch((err) => {
            dbg.error(`${network}:fetch stats "${username}" — ${(err as Error).message}`);
            return null;
          }),
        ]);

        const notFound = pRes !== null && (pRes.status === 404 || pRes.status === 400);
        const rateLimit = pRes !== null && pRes.status === 429;

        if (rateLimit) {
          dbg.ipc(`${network}:fetch "${username}" → RATE LIMITED`);
          return {
            profile: null,
            stats: null,
            notFound: false,
            rateLimit: true,
            statsDisabled: false,
          };
        }

        const profile = pRes?.status === 200 ? pRes.data : null;
        const statsDisabled = sRes !== null && sRes.status === 204;
        const stats = sRes?.status === 200 ? sRes.data : null;
        dbg.ipc(
          `${network}:fetch "${username}" → OK  profile=${!!profile}  stats=${!!stats}  statsDisabled=${statsDisabled}`,
        );
        const result: FetchResult = {
          profile,
          stats,
          notFound,
          rateLimit: false,
          statsDisabled,
        };
        cache.set(key, result);
        return result;
      }

      const pRes = await apiGet(profileUrl).catch((err) => {
        dbg.error(`${network}:fetch profile "${username}" — ${(err as Error).message}`);
        return null;
      });

      const notFound = pRes !== null && (pRes.status === 404 || pRes.status === 400);
      const rateLimit = pRes !== null && pRes.status === 429;

      if (notFound) {
        dbg.ipc(`${network}:fetch "${username}" → NOT FOUND`);
        const result: FetchResult = {
          profile: null,
          stats: null,
          notFound: true,
          rateLimit: false,
          statsDisabled: false,
        };
        cache.set(key, result);
        return result;
      }

      if (rateLimit) {
        dbg.ipc(`${network}:fetch "${username}" → RATE LIMITED`);
        return {
          profile: null,
          stats: null,
          notFound: false,
          rateLimit: true,
          statsDisabled: false,
        };
      }

      const profile = pRes?.status === 200 ? pRes.data : null;
      const canonicalUsername =
        (profile as { username?: string } | null)?.username ?? username;
      const canonicalStatsUrl = `${base}/profile/${encodeURIComponent(canonicalUsername)}/leaderboard?type=bedwars&interval=${interval}&mode=${mode}`;

      const sRes = await apiGet(canonicalStatsUrl).catch((err) => {
        dbg.error(
          `${network}:fetch stats "${canonicalUsername}" — ${(err as Error).message}`,
        );
        return null;
      });

      const statsDisabled = sRes !== null && sRes.status === 204;
      const stats = sRes?.status === 200 ? sRes.data : null;
      dbg.ipc(
        `${network}:fetch "${canonicalUsername}" → OK  profile=${!!profile}  stats=${!!stats}  statsDisabled=${statsDisabled}`,
      );
      const result: FetchResult = {
        profile,
        stats,
        notFound: false,
        rateLimit: false,
        statsDisabled,
      };
      cache.set(key, result);
      return result;
    });
  };
}

function makeStatsHandler(network: 'pika' | 'jartex', base: string) {
  return (
    _: Electron.IpcMainInvokeEvent,
    username: string,
    interval: string,
    mode: string,
  ): Promise<unknown> => {
    const key = `${network}:stats:${username.toLowerCase()}:${interval}:${mode}`;
    dbg.ipc(`${network}:stats  user="${username}"  interval=${interval}  mode=${mode}`);

    const cached = cache.get<unknown>(key);
    if (cached) return Promise.resolve(cached);

    return dedupe(key, async () => {
      const cached2 = cache.get<unknown>(key);
      if (cached2) return cached2;

      const url = `${base}/profile/${encodeURIComponent(username)}/leaderboard?type=bedwars&interval=${interval}&mode=${mode}`;
      dbg.http(`${network}:stats request for "${username}"`);

      const res = await apiGet(url).catch((err) => {
        dbg.error(`${network}:stats "${username}" — ${(err as Error).message}`);
        return null;
      });

      const data = res?.status === 200 ? res.data : null;
      if (data) cache.set(key, data);
      return data;
    });
  };
}

function makeClanHandler(network: 'pika' | 'jartex', base: string) {
  return (_: Electron.IpcMainInvokeEvent, name: string): Promise<unknown> => {
    const key = `${network}:clan:${name.toLowerCase()}`;
    dbg.ipc(`${network}:clan  name="${name}"`);

    const cached = cache.get<unknown>(key);
    if (cached) return Promise.resolve(cached);

    return dedupe(key, async () => {
      const cached2 = cache.get<unknown>(key);
      if (cached2) return cached2;

      const url = `${base}/clans/${encodeURIComponent(name)}`;
      dbg.http(`${network}:clan request for "${name}"`);

      const res = await apiGet(url).catch((err) => {
        dbg.error(`${network}:clan "${name}" — ${(err as Error).message}`);
        return null;
      });

      if (!res) throw new Error('Network error');
      if (res.status === 404 || res.status === 400) return { notFound: true };
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);

      const data = res.data;
      cache.set(key, data);
      dbg.ipc(`${network}:clan "${name}" → OK`);
      return data;
    });
  };
}

ipcMain.handle('pika:fetch', makeFetchHandler('pika', PIKA_BASE));
ipcMain.handle('pika:stats', makeStatsHandler('pika', PIKA_BASE));
ipcMain.handle('pika:clan', makeClanHandler('pika', PIKA_BASE));
ipcMain.handle('jartex:fetch', makeFetchHandler('jartex', JARTEX_BASE));
ipcMain.handle('jartex:stats', makeStatsHandler('jartex', JARTEX_BASE));
ipcMain.handle('jartex:clan', makeClanHandler('jartex', JARTEX_BASE));

ipcMain.handle('skin:fetch', async (_, username: string) => {
  const urls = [
    `https://starlightskins.lunareclipse.studio/render/ultimate/${encodeURIComponent(username)}/full`,
    `https://visage.surgeplay.com/full/512/${encodeURIComponent(username)}`,
    `https://mc-heads.net/body/${encodeURIComponent(username)}/100`,
  ];
  for (const url of urls) {
    try {
      const r = await axios.get<ArrayBuffer>(url, {
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        validateStatus: (s) => s === 200,
        httpsAgent,
      });
      const buf = Buffer.from(r.data);
      const ct = (r.headers['content-type'] as string | undefined) ?? 'image/png';
      const mime = ct.split(';')[0].trim();
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {}
  }
  return null;
});

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:get-path', (_, name: string) =>
  app.getPath(name as Parameters<typeof app.getPath>[0]),
);

ipcMain.handle('app:find-lunar-log', async (): Promise<string> => {
  const home = app.getPath('home');

  const baseCandidates: string[] = [
    `${home}/.lunarclient/offline`,
    `${home}/.lunarclient/profiles/lunar`,
  ];

  if (process.platform === 'win32') {
    const roaming = app.getPath('appData');
    const local = roaming.replace(/[Rr]oaming$/, 'Local');
    baseCandidates.push(
      `${local}/lunarclient/offline`,
      `${local}/lunarclient/profiles/lunar`,
    );
  } else if (process.platform === 'darwin') {
    const appSupport = app.getPath('appData');
    baseCandidates.push(
      `${appSupport}/lunarclient/offline`,
      `${appSupport}/lunarclient/profiles/lunar`,
    );
  }

  const found: { path: string; mtime: number }[] = [];

  for (const base of baseCandidates) {
    let versions: string[];
    try {
      versions = await fs.promises.readdir(base);
    } catch {
      continue;
    }
    for (const version of versions) {
      const logPath = `${base}/${version}/logs/latest.log`;
      try {
        const stat = await fs.promises.stat(logPath);
        if (stat.isFile()) found.push({ path: logPath, mtime: stat.mtimeMs });
      } catch {
        continue;
      }
    }
  }

  if (found.length === 0) {
    return `${home}/.lunarclient/offline/multiver/logs/latest.log`;
  }

  found.sort((a, b) => b.mtime - a.mtime);
  dbg.ipc(`app:find-lunar-log → ${found[0].path}  (${found.length} candidates)`);
  return found[0].path;
});

function stripMcColorCodes(line: string): string {
  return line.replace(/[\u00A7\uFFFD][0-9A-FK-OR]/gi, '').replace(/[\u00A7\uFFFD]/g, '');
}

let logTail: TailFile | null = null;
let logRl: readline.Interface | null = null;
let restartTimer: NodeJS.Timeout | null = null;

async function stopTail(): Promise<void> {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (logRl) {
    logRl.close();
    logRl = null;
  }
  if (logTail) {
    await logTail.quit().catch((err) => console.error('Error closing tail:', err));
    logTail = null;
  }
}

async function startTail(path: string): Promise<void> {
  await stopTail();
  try {
    logTail = new TailFile(path, { pollFileIntervalMs: 250 });
    logTail.on('error', () => {
      if (!restartTimer) {
        restartTimer = setTimeout(() => {
          void (async () => {
            restartTimer = null;
            if (logTail) {
              const readable = await fs.promises
                .access(path, fs.constants.R_OK)
                .then(() => true)
                .catch(() => false);
              if (readable) await startTail(path).catch(() => {});
              else await stopTail();
            }
          })();
        }, 2000);
      }
    });
    await logTail.start();
    logRl = readline.createInterface({ input: logTail, crlfDelay: Infinity });
    logRl.on('line', (line) => {
      const cleaned = stripMcColorCodes(line);
      win?.webContents.send('log:line', cleaned);
    });
    dbg.ipc(`Log tail started: ${path}`);
  } catch (err) {
    console.error('Failed to start log tail:', err);
  }
}

ipcMain.on('log:set-path', (_, path: string | null) => {
  void (async () => {
    if (!path) {
      await stopTail();
      return;
    }
    await startTail(path);
  })();
});

ipcMain.handle('log:check-path', (_, path: string) =>
  fs.promises
    .access(path, fs.constants.R_OK)
    .then(() => true)
    .catch(() => false),
);

ipcMain.handle('log:open-dialog', () =>
  dialog.showOpenDialog(win!, {
    filters: [{ name: 'Minecraft Logs', extensions: ['log'] }],
    properties: ['openFile'],
  }),
);

ipcMain.handle('app:open-image-dialog', () =>
  dialog.showOpenDialog(win!, {
    title: 'Choose Background Image',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
    ],
    properties: ['openFile'],
  }),
);

ipcMain.handle('app:read-file-base64', async (_, filePath: string) => {
  const { readFile } = await import('fs/promises');
  const { extname } = await import('path');
  const ext = extname(filePath).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  };
  const mime = mimeMap[ext] ?? 'image/png';
  const data = await readFile(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
});

const registeredShortcuts = new Set<string>();

ipcMain.handle('shortcuts:register', (_, shortcuts: string[]) => {
  for (const s of registeredShortcuts) {
    globalShortcut.unregister(s);
    registeredShortcuts.delete(s);
  }
  for (const s of shortcuts.filter(Boolean)) {
    try {
      globalShortcut.register(s, () => win?.webContents.send('shortcut:fired', s));
      registeredShortcuts.add(s);
    } catch {}
  }
});

const RPC_APP_ID = '1487763608820781096';

let rpcClient: unknown = null;
let rpcConnected = false;
let rpcRetryTimer: NodeJS.Timeout | null = null;
let rpcIsActive = false;
let rpcCurrentNetwork = 'pikanetwork';

type RpcClientInstance = {
  on(event: string, cb: () => void): void;
  login(opts: { clientId: string }): Promise<void>;
  setActivity(opts: object): Promise<void>;
  destroy(): Promise<void>;
  user?: { username?: string };
};

async function destroyRPC(): Promise<void> {
  if (rpcRetryTimer) {
    clearTimeout(rpcRetryTimer);
    rpcRetryTimer = null;
  }
  if (rpcClient) {
    try {
      await (rpcClient as RpcClientInstance).destroy();
    } catch {}
    rpcClient = null;
    rpcConnected = false;
    dbg.rpc('Discord RPC destroyed');
  }
}

async function initRPC(): Promise<void> {
  if (rpcConnected) return;
  await destroyRPC();

  try {
    const { Client } = await import('discord-rpc').catch(() => ({ Client: null }));
    if (!Client) {
      dbg.rpc('discord-rpc module not found — skipping RPC');
      return;
    }

    rpcClient = new Client({ transport: 'ipc' }) as RpcClientInstance;
    const client = rpcClient as RpcClientInstance;

    client.on('ready', () => {
      rpcConnected = true;
      dbg.rpc(`Connected as ${client.user?.username ?? 'unknown'}`);
      applyRPCActivity();
    });

    client.on('disconnected', () => {
      rpcConnected = false;
      dbg.rpc('Disconnected — will retry in 15s');
      if (!rpcRetryTimer) {
        rpcRetryTimer = setTimeout(() => {
          rpcRetryTimer = null;
          initRPC().catch(() => {});
        }, 15_000);
      }
    });

    await client.login({ clientId: RPC_APP_ID });
  } catch (err) {
    dbg.rpc(`Init failed: ${(err as Error).message} — will retry in 15s`);
    if (!rpcRetryTimer) {
      rpcRetryTimer = setTimeout(() => {
        rpcRetryTimer = null;
        initRPC().catch(() => {});
      }, 15_000);
    }
  }
}

function applyRPCActivity(): void {
  if (!rpcClient || !rpcConnected) return;
  const client = rpcClient as RpcClientInstance;
  const networkLabel =
    rpcCurrentNetwork === 'jartexnetwork' ? 'JartexNetwork' : 'PikaNetwork';
  const details = rpcIsActive ? `Playing on ${networkLabel}` : 'Idle';
  client
    .setActivity({
      details,
      largeImageKey: 'bedwars',
      largeImageText: 'THEBOIS Overlay',
      instance: false,
    })
    .catch((err: Error) => dbg.rpc(`setActivity error: ${err.message}`));
}

ipcMain.handle('rpc:init', async () => {
  dbg.rpc('rpc:init called');
  await initRPC();
});

ipcMain.on('rpc:set-enabled', (_, enabled: boolean) => {
  void (async () => {
    dbg.rpc(`rpc:set-enabled  enabled=${enabled}`);
    if (enabled) await initRPC();
    else await destroyRPC();
  })();
});

ipcMain.on('rpc:set-active', (_, active: boolean) => {
  rpcIsActive = active;
  applyRPCActivity();
});

ipcMain.on('rpc:set-network', (_, network: string) => {
  dbg.rpc(`rpc:set-network  network=${network}`);
  rpcCurrentNetwork = network;
  applyRPCActivity();
});

ipcMain.on('rpc:update', () => {});

ipcMain.on('rpc:destroy', () => {
  void destroyRPC();
});

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () =>
  win?.webContents.send('updater:status', { status: 'checking' }),
);
autoUpdater.on('update-not-available', () =>
  win?.webContents.send('updater:status', { status: 'up-to-date' }),
);
autoUpdater.on('update-available', (info) =>
  win?.webContents.send('updater:status', { status: 'available', version: info.version }),
);
autoUpdater.on('download-progress', (p) =>
  win?.webContents.send('updater:status', {
    status: 'downloading',
    percent: Math.round(p.percent),
  }),
);
autoUpdater.on('update-downloaded', (info) => {
  win?.webContents.send('updater:status', {
    status: 'downloaded',
    version: info.version,
  });
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 3_000);
});
autoUpdater.on('error', (err) =>
  win?.webContents.send('updater:status', { status: 'error', error: err.message }),
);

ipcMain.on('updater:check', () => {
  if (is.dev) {
    dbg.ipc('updater:check skipped in dev mode');
    win?.webContents.send('updater:status', { status: 'dev' });
    return;
  }
  dbg.ipc('updater:check — checking for updates');
  autoUpdater.checkForUpdates().catch((err) => {
    dbg.error(`autoUpdater.checkForUpdates failed: ${(err as Error).message}`);
  });
});

ipcMain.on('updater:install', () => {
  dbg.ipc('updater:install — quitting and installing (silent)');
  autoUpdater.quitAndInstall(true, true);
});

ipcMain.handle('proxy:get-status', () => proxyManager?.getStatus() ?? null);

ipcMain.handle('proxy:set-port', async (_, network: ProxyNetwork, port: number) => {
  if (!proxyManager) return;
  await proxyManager.updatePort(network, port);
});

ipcMain.handle('proxy:set-bind-host', async (_, bindHost: ProxyBindHost) => {
  if (!proxyManager) return;
  await proxyManager.updateBindHost(bindHost);
});

app.on('will-quit', () => {
  void (async () => {
    stopLinuxCursorPoll();
    for (const s of registeredShortcuts) globalShortcut.unregister(s);
    await stopTail();
    await destroyRPC();
    if (proxyManager) await proxyManager.stopAll().catch(() => {});
    cache.clear();
    httpAgent.destroy();
    httpsAgent.destroy();
  })();
});
