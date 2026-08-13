import { join } from 'node:path';
import process from 'node:process';
import { is } from '@electron-toolkit/utils';
import { BrowserWindow, screen } from 'electron';
import windowStateKeeper from 'electron-window-state';

const width = 700;
const height = 460;
const minWidth = 480;
const minHeight = 340;

let mainWindow: BrowserWindow | null = null;
let linuxAllowMinimize = false;
let cursorPollTimer: NodeJS.Timeout | null = null;
let lastCursorX = -1;
let lastCursorY = -1;
let ignoringMouseEvents = false;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function allowLinuxMinimize(): void {
  linuxAllowMinimize = true;
}

export function isIgnoringMouseEvents(): boolean {
  return ignoringMouseEvents;
}

export function setIgnoringMouseEvents(ignore: boolean): void {
  ignoringMouseEvents = ignore;
}

export function createWindow(): BrowserWindow {
  const state = windowStateKeeper({
    defaultWidth: width,
    defaultHeight: height,
  });

  const win = new BrowserWindow({
    title: 'Kyra Overlay',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth,
    minHeight,
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
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  mainWindow = win;
  state.manage(win);
  win.setAlwaysOnTop(true, 'screen-saver');

  if (process.platform === 'win32') {
    win.setSkipTaskbar(false);
  }

  win.on('focus', () => {
    if (ignoringMouseEvents) {
      win.blur();
    }
  });

  if (process.platform === 'linux') {
    win.on('minimize', () => {
      if (!linuxAllowMinimize) {
        setImmediate(() => win.showInactive());
      }
      linuxAllowMinimize = false;
    });
  }

  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
  }

  let saveTimer: NodeJS.Timeout | null = null;
  const debounceSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => state.saveState(win), 800);
  };
  win.on('resize', debounceSave);
  win.on('move', debounceSave);

  win.on('close', () => {
    win.webContents
      .executeJavaScript(`try { localStorage.removeItem('players') } catch(e) {}`)
      .catch(() => {});
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL !== undefined) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

const crosshairDeadZone = 3;

export function startCursorPoll(): void {
  if (cursorPollTimer) return;
  cursorPollTimer = setInterval(() => {
    if (!mainWindow || !mainWindow.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (cursor.x === lastCursorX && cursor.y === lastCursorY) return;

    const bounds = mainWindow.getBounds();
    const isCursorInsideWindow =
      cursor.x >= bounds.x &&
      cursor.x < bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y < bounds.y + bounds.height;

    lastCursorX = cursor.x;
    lastCursorY = cursor.y;

    if (!isCursorInsideWindow) {
      mainWindow.webContents.send('cursor:forwarded-move', null, null);
      return;
    }

    const display = screen.getDisplayNearestPoint(cursor);
    const displayCenterX = display.bounds.x + display.bounds.width / 2;
    const displayCenterY = display.bounds.y + display.bounds.height / 2;
    const isAtCrosshair =
      Math.abs(cursor.x - displayCenterX) <= crosshairDeadZone &&
      Math.abs(cursor.y - displayCenterY) <= crosshairDeadZone;

    if (isAtCrosshair) {
      return;
    }

    mainWindow.webContents.send(
      'cursor:forwarded-move',
      cursor.x - bounds.x,
      cursor.y - bounds.y,
    );
  }, 16);
}

export function stopCursorPoll(): void {
  if (!cursorPollTimer) return;
  clearInterval(cursorPollTimer);
  cursorPollTimer = null;
  lastCursorX = -1;
  lastCursorY = -1;
}
