import { app, shell, BrowserWindow, ipcMain, dialog, clipboard, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import windowStateKeeper from 'electron-window-state'
import axios from 'axios'
import fs from 'fs'
import readline from 'readline'
import TailFile from '@logdna/tail-file'

const PIKA_BASE = 'https://stats.pika-network.net/api'
const TIMEOUT_MS = 8_000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const MAX_CONCURRENT = 16
const CACHE_TTL_MS = 60_000

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const MAGENTA = '\x1b[35m'
const BLUE = '\x1b[34m'

function ts(): string {
  return DIM + new Date().toISOString().slice(11, 23) + RESET + ' '
}

const dbg = {
  cache: (msg: string) => console.log(ts() + CYAN + '[CACHE] ' + RESET + msg),
  dedup: (msg: string) => console.log(ts() + MAGENTA + '[DEDUP] ' + RESET + msg),
  sem: (msg: string) => console.log(ts() + BLUE + '[SEM]   ' + RESET + msg),
  http: (msg: string) => console.log(ts() + GREEN + '[HTTP]  ' + RESET + msg),
  retry: (msg: string) => console.log(ts() + YELLOW + '[RETRY] ' + RESET + msg),
  ipc: (msg: string) => console.log(ts() + YELLOW + '[IPC]   ' + RESET + msg),
  error: (msg: string) => console.log(ts() + RED + '[ERROR] ' + RESET + msg),
  rpc: (msg: string) => console.log(ts() + BLUE + '[RPC]   ' + RESET + msg),
}

interface CacheEntry<T> {
  data: T
  expires: number
}

class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>()

  set<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): void {
    this.store.set(key, { data, expires: Date.now() + ttlMs })
    dbg.cache(`SET  "${key}"  (TTL ${ttlMs / 1000}s, store size: ${this.store.size})`)
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) {
      dbg.cache(`MISS "${key}"`)
      return null
    }
    if (Date.now() > entry.expires) {
      this.store.delete(key)
      dbg.cache(`EXPIRED "${key}"`)
      return null
    }
    const ttlLeft = Math.round((entry.expires - Date.now()) / 1000)
    dbg.cache(`HIT  "${key}"  (${ttlLeft}s left)`)
    return entry.data as T
  }

  clear(): void {
    dbg.cache(`CLEAR (${this.store.size} entries flushed)`)
    this.store.clear()
  }
}

const cache = new SimpleCache()
const inFlight = new Map<string, Promise<unknown>>()

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) {
    dbg.dedup(`REUSE in-flight "${key}" (${inFlight.size} total in-flight)`)
    return existing as Promise<T>
  }
  dbg.dedup(`NEW   "${key}"`)
  const promise = fn().finally(() => {
    inFlight.delete(key)
    dbg.dedup(`DONE  "${key}" (${inFlight.size} remaining in-flight)`)
  })
  inFlight.set(key, promise)
  return promise
}

class Semaphore {
  private slots: number
  private queue: Array<() => void> = []

  constructor(limit: number) {
    this.slots = limit
  }

  acquire(): Promise<void> {
    if (this.slots > 0) {
      this.slots--
      dbg.sem(`ACQUIRE (slots left: ${this.slots}, queued: ${this.queue.length})`)
      return Promise.resolve()
    }
    dbg.sem(`QUEUE   (no slots, queued: ${this.queue.length + 1})`)
    return new Promise<void>((resolve) => this.queue.push(resolve))
  }

  release(): void {
    if (this.queue.length > 0) {
      dbg.sem(
        `RELEASE → waking queued request (slots: ${this.slots}, queued remaining: ${this.queue.length - 1})`,
      )
      this.queue.shift()!()
    } else {
      this.slots++
      dbg.sem(`RELEASE (slots: ${this.slots}, queue empty)`)
    }
  }
}

const sem = new Semaphore(MAX_CONCURRENT)
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < retries) {
        const wait = delayMs * (i + 1)
        dbg.retry(
          `attempt ${i + 1}/${retries} failed — retrying in ${wait}ms  (${(err as Error).message})`,
        )
        await sleep(wait)
      }
    }
  }
  throw lastErr
}

async function pikaGet<T = unknown>(url: string) {
  await sem.acquire()
  const t0 = Date.now()
  dbg.http(`→ GET ${url}`)
  try {
    const res = await withRetry(async () => {
      const r = await axios.get<T>(url, {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        validateStatus: () => true,
      })
      if (r.status === 429) throw new Error('Rate limited (429)')
      if (r.status >= 500) throw new Error(`Server error ${r.status}`)
      return r
    })
    dbg.http(`← ${res.status} ${url}  (${Date.now() - t0}ms)`)
    return res
  } catch (err) {
    dbg.error(`FAIL ${url}  (${Date.now() - t0}ms) — ${(err as Error).message}`)
    throw err
  } finally {
    sem.release()
  }
}

let win: BrowserWindow | null = null

function createWindow(): void {
  const state = windowStateKeeper({ defaultWidth: 700, defaultHeight: 460 })

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
    },
  })

  state.manage(win)
  win.setAlwaysOnTop(true, 'screen-saver')

  let saveTimer: NodeJS.Timeout | null = null
  const debounceSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => state.saveState(win!), 800)
  }
  win.on('resize', debounceSave)
  win.on('move', debounceSave)

  win.on('close', () => {
    win?.webContents
      .executeJavaScript(`try { localStorage.removeItem('players') } catch(e) {}`)
      .catch(() => {})
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.thebois.overlay')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  if (process.platform === 'linux') await sleep(500)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:close', () => win?.close())
ipcMain.on('win:toggle-minimize', () => {
  if (win?.isMinimized()) win?.showInactive()
  else win?.minimize()
})
ipcMain.on('win:open-external', (_, url: string) => void shell.openExternal(url))

ipcMain.on('win:set-ignore-mouse', (_, ignore: boolean) => {
  if (!win) return
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
  }
})

ipcMain.on('win:focus', () => {
  if (win && !win.isFocused()) {
    win.setAlwaysOnTop(true, 'screen-saver')
    win.focus()
  }
})

const STAT_COL_W = 65
const REMOVE_W = 36
const BUFFER = 4

ipcMain.on('win:fit-columns', (_, numColumns: number, nameColPx: number) => {
  if (!win) return
  const statCols = Math.max(0, numColumns - 1)
  const w = Math.round(nameColPx) + statCols * STAT_COL_W + REMOVE_W + BUFFER
  const { height } = win.getContentBounds()
  dbg.ipc(
    `win:fit-columns  cols=${numColumns}  nameCol=${Math.round(nameColPx)}px  → contentWidth=${w}`,
  )
  win.setContentSize(w, height)
})

ipcMain.handle('win:screenshot', async () => {
  const img = await win?.webContents.capturePage()
  if (img) clipboard.writeImage(img)
})

type PikaFetchResult = {
  profile: unknown
  stats: unknown
  notFound: boolean
  rateLimit: boolean
}

ipcMain.handle(
  'pika:fetch',
  (_, username: string, interval = 'total', mode = 'ALL_MODES'): Promise<PikaFetchResult> => {
    const key = `pika:${username}:${interval}:${mode}`
    dbg.ipc(`pika:fetch  user="${username}"  interval=${interval}  mode=${mode}`)

    const cached = cache.get<PikaFetchResult>(key)
    if (cached) return Promise.resolve(cached)

    return dedupe(key, async () => {
      const cached2 = cache.get<PikaFetchResult>(key)
      if (cached2) return cached2

      const enc = encodeURIComponent(username)
      const profileUrl = `${PIKA_BASE}/profile/${enc}`
      const statsUrl = `${PIKA_BASE}/profile/${enc}/leaderboard?type=bedwars&interval=${interval}&mode=${mode}`

      dbg.http(`pika:fetch firing 2 parallel requests for "${username}"`)
      const [pRes, sRes] = await Promise.allSettled([pikaGet(profileUrl), pikaGet(statsUrl)])

      const profile =
        pRes.status === 'fulfilled' && pRes.value.status === 200 ? pRes.value.data : null
      const stats =
        sRes.status === 'fulfilled' && sRes.value.status === 200 ? sRes.value.data : null
      const notFound =
        pRes.status === 'fulfilled' && (pRes.value.status === 404 || pRes.value.status === 400)
      const rateLimit = pRes.status === 'fulfilled' && pRes.value.status === 429

      if (notFound) dbg.ipc(`pika:fetch "${username}" → NOT FOUND`)
      if (rateLimit) dbg.ipc(`pika:fetch "${username}" → RATE LIMITED`)
      if (!notFound && !rateLimit) {
        dbg.ipc(`pika:fetch "${username}" → OK  profile=${!!profile}  stats=${!!stats}`)
      }

      const result: PikaFetchResult = { profile, stats, notFound, rateLimit }
      cache.set(key, result)
      return result
    })
  },
)

ipcMain.handle(
  'pika:stats',
  (_, username: string, interval: string, mode: string): Promise<unknown> => {
    const key = `pika:stats:${username}:${interval}:${mode}`
    dbg.ipc(`pika:stats  user="${username}"  interval=${interval}  mode=${mode}`)

    const cached = cache.get<unknown>(key)
    if (cached) return Promise.resolve(cached)

    return dedupe(key, async () => {
      const cached2 = cache.get<unknown>(key)
      if (cached2) return cached2

      const enc = encodeURIComponent(username)
      const url = `${PIKA_BASE}/profile/${enc}/leaderboard?type=bedwars&interval=${interval}&mode=${mode}`
      const res = await pikaGet(url).catch((err) => {
        dbg.error(`pika:stats "${username}" — ${(err as Error).message}`)
        return null
      })
      const data = res?.status === 200 ? res.data : null
      if (data) cache.set(key, data)
      return data
    })
  },
)

ipcMain.handle('app:get-path', (_, name: string) =>
  app.getPath(name as Parameters<typeof app.getPath>[0]),
)

function stripMcColorCodes(line: string): string {
  return line.replace(/[\u00A7\uFFFD][0-9A-FK-OR]/gi, '').replace(/[\u00A7\uFFFD]/g, '')
}

let logTail: TailFile | null = null
let logRl: readline.Interface | null = null
let restartTimer: NodeJS.Timeout | null = null

async function stopTail(): Promise<void> {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (logRl) {
    logRl.close()
    logRl = null
  }
  if (logTail) {
    await logTail.quit().catch((err) => console.error('Error closing tail:', err))
    logTail = null
  }
}

async function startTail(path: string): Promise<void> {
  await stopTail()
  try {
    logTail = new TailFile(path, { pollFileIntervalMs: 1000 })
    logTail.on('error', () => {
      if (!restartTimer) {
        restartTimer = setTimeout(() => {
          void (async () => {
            restartTimer = null
            if (logTail) {
              const readable = await fs.promises
                .access(path, fs.constants.R_OK)
                .then(() => true)
                .catch(() => false)
              if (readable) await startTail(path).catch(() => {})
              else await stopTail()
            }
          })()
        }, 2000)
      }
    })
    await logTail.start()
    logRl = readline.createInterface({ input: logTail, crlfDelay: Infinity })
    logRl.on('line', (line) => {
      const cleaned = stripMcColorCodes(line)
      win?.webContents.send('log:line', cleaned)
    })
    dbg.ipc(`Log tail started: ${path}`)
  } catch (err) {
    console.error('Failed to start log tail:', err)
  }
}

ipcMain.on('log:set-path', (_, path: string | null) => {
  void (async () => {
    if (!path) {
      await stopTail()
      return
    }
    await startTail(path)
  })()
})

ipcMain.handle('log:check-path', (_, path: string) =>
  fs.promises
    .access(path, fs.constants.R_OK)
    .then(() => true)
    .catch(() => false),
)

ipcMain.handle('log:open-dialog', () =>
  dialog.showOpenDialog(win!, {
    filters: [{ name: 'Minecraft Logs', extensions: ['log'] }],
    properties: ['openFile'],
  }),
)

ipcMain.handle('app:open-image-dialog', () =>
  dialog.showOpenDialog(win!, {
    title: 'Choose Background Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    properties: ['openFile'],
  }),
)

ipcMain.handle('app:read-file-base64', async (_, filePath: string) => {
  const { readFile } = await import('fs/promises')
  const { extname } = await import('path')
  const ext = extname(filePath).slice(1).toLowerCase()
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
  }
  const mime = mimeMap[ext] ?? 'image/png'
  const data = await readFile(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
})

const registeredShortcuts = new Set<string>()

ipcMain.handle('shortcuts:register', (_, shortcuts: string[]) => {
  for (const s of registeredShortcuts) {
    globalShortcut.unregister(s)
    registeredShortcuts.delete(s)
  }
  for (const s of shortcuts.filter(Boolean)) {
    try {
      globalShortcut.register(s, () => win?.webContents.send('shortcut:fired', s))
      registeredShortcuts.add(s)
    } catch {
      /* invalid shortcut string */
    }
  }
})

const RPC_APP_ID = '1487763608820781096'

let rpcClient: unknown = null
let rpcConnected = false
let rpcRetryTimer: NodeJS.Timeout | null = null
let rpcIsActive = false

type RpcClientInstance = {
  on(event: string, cb: () => void): void
  login(opts: { clientId: string }): Promise<void>
  setActivity(opts: object): Promise<void>
  destroy(): Promise<void>
  user?: { username?: string }
}

async function destroyRPC(): Promise<void> {
  if (rpcRetryTimer) {
    clearTimeout(rpcRetryTimer)
    rpcRetryTimer = null
  }
  if (rpcClient) {
    try {
      await (rpcClient as RpcClientInstance).destroy()
    } catch {
      /* ignore */
    }
    rpcClient = null
    rpcConnected = false
    dbg.rpc('Discord RPC destroyed')
  }
}

async function initRPC(): Promise<void> {
  if (rpcConnected) return
  await destroyRPC()

  try {
    const { Client } = await import('discord-rpc').catch(() => ({ Client: null }))
    if (!Client) {
      dbg.rpc('discord-rpc module not found — skipping RPC')
      return
    }

    rpcClient = new Client({ transport: 'ipc' }) as RpcClientInstance
    const client = rpcClient as RpcClientInstance

    client.on('ready', () => {
      rpcConnected = true
      dbg.rpc(`Connected as ${client.user?.username ?? 'unknown'}`)
      applyRPCActivity()
    })

    client.on('disconnected', () => {
      rpcConnected = false
      dbg.rpc('Disconnected — will retry in 15s')
      if (!rpcRetryTimer) {
        rpcRetryTimer = setTimeout(() => {
          rpcRetryTimer = null
          initRPC().catch(() => {})
        }, 15_000)
      }
    })

    await client.login({ clientId: RPC_APP_ID })
  } catch (err) {
    dbg.rpc(`Init failed: ${(err as Error).message} — will retry in 15s`)
    if (!rpcRetryTimer) {
      rpcRetryTimer = setTimeout(() => {
        rpcRetryTimer = null
        initRPC().catch(() => {})
      }, 15_000)
    }
  }
}

function applyRPCActivity(): void {
  if (!rpcClient || !rpcConnected) return
  const client = rpcClient as RpcClientInstance
  const details = rpcIsActive ? 'Playing on PikaNetwork' : 'Idle'
  client
    .setActivity({
      details,
      largeImageKey: 'bedwars',
      largeImageText: 'THEBOIS Overlay',
      instance: false,
    })
    .catch((err: Error) => dbg.rpc(`setActivity error: ${err.message}`))
}

ipcMain.handle('rpc:init', async () => {
  dbg.rpc('rpc:init called')
  await initRPC()
})

ipcMain.on('rpc:set-enabled', (_, enabled: boolean) => {
  void (async () => {
    dbg.rpc(`rpc:set-enabled  enabled=${enabled}`)
    if (enabled) await initRPC()
    else await destroyRPC()
  })()
})

ipcMain.on('rpc:set-active', (_, active: boolean) => {
  dbg.rpc(`rpc:set-active  active=${active}`)
  rpcIsActive = active
  applyRPCActivity()
})

ipcMain.on('rpc:update', () => {})

ipcMain.on('rpc:destroy', () => {
  void destroyRPC()
})

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () =>
  win?.webContents.send('updater:status', { status: 'checking' }),
)
autoUpdater.on('update-not-available', () =>
  win?.webContents.send('updater:status', { status: 'up-to-date' }),
)
autoUpdater.on('update-available', (info) =>
  win?.webContents.send('updater:status', { status: 'available', version: info.version }),
)
autoUpdater.on('download-progress', (p) =>
  win?.webContents.send('updater:status', {
    status: 'downloading',
    percent: Math.round(p.percent),
  }),
)
autoUpdater.on('update-downloaded', (info) =>
  win?.webContents.send('updater:status', { status: 'downloaded', version: info.version }),
)
autoUpdater.on('error', (err) =>
  win?.webContents.send('updater:status', { status: 'error', error: err.message }),
)

ipcMain.on('updater:check', () => {
  if (is.dev) {
    dbg.ipc('updater:check skipped in dev mode')
    win?.webContents.send('updater:status', { status: 'dev' })
    return
  }
  dbg.ipc('updater:check — checking for updates')
  autoUpdater.checkForUpdates().catch((err) => {
    dbg.error(`autoUpdater.checkForUpdates failed: ${(err as Error).message}`)
  })
})

ipcMain.on('updater:install', () => {
  dbg.ipc('updater:install — quitting and installing')
  autoUpdater.quitAndInstall()
})

app.on('will-quit', () => {
  void (async () => {
    for (const s of registeredShortcuts) globalShortcut.unregister(s)
    await stopTail()
    await destroyRPC()
    cache.clear()
  })()
})
