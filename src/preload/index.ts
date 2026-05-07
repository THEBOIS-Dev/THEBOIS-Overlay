import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

const api = {
  platform: process.platform as string,

  pika: {
    fetch: (username: string, interval = 'total', mode = 'ALL_MODES') =>
      ipcRenderer.invoke('pika:fetch', username, interval, mode),
    stats: (username: string, interval: string, mode: string) =>
      ipcRenderer.invoke('pika:stats', username, interval, mode),
    clan: (name: string) => ipcRenderer.invoke('pika:clan', name),
  },

  jartex: {
    fetch: (username: string, interval = 'total', mode = 'ALL_MODES') =>
      ipcRenderer.invoke('jartex:fetch', username, interval, mode),
    stats: (username: string, interval: string, mode: string) =>
      ipcRenderer.invoke('jartex:stats', username, interval, mode),
    clan: (name: string) => ipcRenderer.invoke('jartex:clan', name),
  },

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    close: () => ipcRenderer.send('win:close'),
    toggleMinimize: () => ipcRenderer.send('win:toggle-minimize'),
    openExternal: (url: string) => ipcRenderer.send('win:open-external', url),
    screenshot: () => ipcRenderer.invoke('win:screenshot'),
    fitColumns: (numColumns: number, nameColPx: number) =>
      ipcRenderer.send('win:fit-columns', numColumns, nameColPx),
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('win:set-ignore-mouse', ignore),
    focus: () => ipcRenderer.send('win:focus'),
    onForwardedMove: (cb: (x: number, y: number) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, x: number, y: number): void => cb(x, y);
      ipcRenderer.on('cursor:forwarded-move', handler);
      return () => ipcRenderer.off('cursor:forwarded-move', handler);
    },
  },

  app: {
    getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:get-path', name),
    findLunarLog: (): Promise<string> => ipcRenderer.invoke('app:find-lunar-log'),
    openImageDialog: (): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke('app:open-image-dialog'),
    readFileBase64: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('app:read-file-base64', filePath),
    onClearPlayers: (cb: () => void): (() => void) => {
      const handler = () => cb();
      ipcRenderer.on('app:clear-players', handler);
      return () => ipcRenderer.off('app:clear-players', handler);
    },
  },

  log: {
    setPath: (path: string | null) => ipcRenderer.send('log:set-path', path),
    checkPath: (path: string): Promise<boolean> =>
      ipcRenderer.invoke('log:check-path', path),
    openDialog: (): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke('log:open-dialog'),
    onLine: (cb: (line: string) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, line: string): void => cb(line);
      ipcRenderer.on('log:line', handler);
      return () => ipcRenderer.off('log:line', handler);
    },
  },

  shortcuts: {
    register: (shortcuts: string[]): Promise<void> =>
      ipcRenderer.invoke('shortcuts:register', shortcuts),
    onFired: (cb: (shortcut: string) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, s: string): void => cb(s);
      ipcRenderer.on('shortcut:fired', handler);
      return () => ipcRenderer.off('shortcut:fired', handler);
    },
  },

  skin: {
    fetch: (username: string): Promise<string | null> =>
      ipcRenderer.invoke('skin:fetch', username),
  },

  rpc: {
    init: (): Promise<void> => ipcRenderer.invoke('rpc:init', ''),
    setEnabled: (enabled: boolean) => ipcRenderer.send('rpc:set-enabled', enabled),
    setActive: (active: boolean) => ipcRenderer.send('rpc:set-active', active),
    setNetwork: (network: string) => ipcRenderer.send('rpc:set-network', network),
    destroy: () => ipcRenderer.send('rpc:destroy'),
  },

  updater: {
    check: () => ipcRenderer.send('updater:check'),
    install: () => ipcRenderer.send('updater:install'),
    onStatus: (
      cb: (payload: {
        status: string;
        version?: string;
        percent?: number;
        error?: string;
      }) => void,
    ): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: unknown): void =>
        cb(
          payload as {
            status: string;
            version?: string;
            percent?: number;
            error?: string;
          },
        );
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.off('updater:status', handler);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
