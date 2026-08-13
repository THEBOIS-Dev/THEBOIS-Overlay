import type { IpcRendererEvent } from 'electron';
import process from 'node:process';
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  platform: process.platform as string,

  pika: {
    fetch: async (
      username: string,
      interval = 'total',
      mode = 'ALL_MODES',
      concurrent = false,
    ): Promise<{
      profile: unknown;
      stats: unknown;
      notFound?: boolean;
      rateLimit?: boolean;
    }> =>
      ipcRenderer.invoke('pika:fetch', username, interval, mode, concurrent) as Promise<{
        profile: unknown;
        stats: unknown;
        notFound?: boolean;
        rateLimit?: boolean;
      }>,
    stats: async (username: string, interval: string, mode: string): Promise<unknown> =>
      ipcRenderer.invoke('pika:stats', username, interval, mode) as Promise<unknown>,
    clan: async (name: string): Promise<unknown> =>
      ipcRenderer.invoke('pika:clan', name) as Promise<unknown>,
  },

  jartex: {
    fetch: async (
      username: string,
      interval = 'total',
      mode = 'ALL_MODES',
      concurrent = false,
    ): Promise<{
      profile: unknown;
      stats: unknown;
      notFound?: boolean;
      rateLimit?: boolean;
    }> =>
      ipcRenderer.invoke(
        'jartex:fetch',
        username,
        interval,
        mode,
        concurrent,
      ) as Promise<{
        profile: unknown;
        stats: unknown;
        notFound?: boolean;
        rateLimit?: boolean;
      }>,
    stats: async (username: string, interval: string, mode: string): Promise<unknown> =>
      ipcRenderer.invoke('jartex:stats', username, interval, mode) as Promise<unknown>,
    clan: async (name: string): Promise<unknown> =>
      ipcRenderer.invoke('jartex:clan', name) as Promise<unknown>,
  },

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    close: () => ipcRenderer.send('win:close'),
    toggleMinimize: () => ipcRenderer.send('win:toggle-minimize'),
    openExternal: (url: string) => ipcRenderer.send('win:open-external', url),
    screenshot: async (): Promise<void> =>
      ipcRenderer.invoke('win:screenshot') as Promise<void>,
    fitContentWidth: (desiredContentWidth: number) =>
      ipcRenderer.send('win:fit-content-width', desiredContentWidth),
    setIgnoreMouse: (ignore: boolean) => ipcRenderer.send('win:set-ignore-mouse', ignore),
    focus: () => ipcRenderer.send('win:focus'),
    onForwardedMove: (cb: (x: number | null, y: number | null) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, x: number | null, y: number | null): void =>
        cb(x, y);
      ipcRenderer.on('cursor:forwarded-move', handler);
      return () => ipcRenderer.off('cursor:forwarded-move', handler);
    },
  },

  app: {
    getVersion: async (): Promise<string> =>
      ipcRenderer.invoke('app:get-version') as Promise<string>,
    getPath: async (name: string): Promise<string> =>
      ipcRenderer.invoke('app:get-path', name) as Promise<string>,
    findLunarLog: async (): Promise<string> =>
      ipcRenderer.invoke('app:find-lunar-log') as Promise<string>,
    openImageDialog: async (): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke(
        'app:open-image-dialog',
      ) as Promise<Electron.OpenDialogReturnValue>,
    readFileBase64: async (filePath: string): Promise<string> =>
      ipcRenderer.invoke('app:read-file-base64', filePath) as Promise<string>,
    onClearPlayers: (cb: () => void): (() => void) => {
      const handler = () => cb();
      ipcRenderer.on('app:clear-players', handler);
      return () => ipcRenderer.off('app:clear-players', handler);
    },
  },

  log: {
    setPath: (path: string | null) => ipcRenderer.send('log:set-path', path),
    checkPath: async (path: string): Promise<boolean> =>
      ipcRenderer.invoke('log:check-path', path) as Promise<boolean>,
    openDialog: async (): Promise<Electron.OpenDialogReturnValue> =>
      ipcRenderer.invoke('log:open-dialog') as Promise<Electron.OpenDialogReturnValue>,
    onLine: (cb: (line: string) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, line: string): void => cb(line);
      ipcRenderer.on('log:line', handler);
      return () => ipcRenderer.off('log:line', handler);
    },
  },

  shortcuts: {
    register: async (shortcuts: string[]): Promise<void> =>
      ipcRenderer.invoke('shortcuts:register', shortcuts) as Promise<void>,
    onFired: (cb: (shortcut: string) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, s: string): void => cb(s);
      ipcRenderer.on('shortcut:fired', handler);
      return () => ipcRenderer.off('shortcut:fired', handler);
    },
  },

  skin: {
    fetch: async (username: string): Promise<string | null> =>
      ipcRenderer.invoke('skin:fetch', username) as Promise<string | null>,
  },

  rpc: {
    init: async (): Promise<void> => ipcRenderer.invoke('rpc:init', '') as Promise<void>,
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

  proxy: {
    getStatus: async (): Promise<{
      pika: {
        running: boolean;
        port: number;
        bindHost: string;
        clientCount: number;
        error: string | null;
      };
      jartex: {
        running: boolean;
        port: number;
        bindHost: string;
        clientCount: number;
        error: string | null;
      };
    } | null> =>
      ipcRenderer.invoke('proxy:get-status') as Promise<{
        pika: {
          running: boolean;
          port: number;
          bindHost: string;
          clientCount: number;
          error: string | null;
        };
        jartex: {
          running: boolean;
          port: number;
          bindHost: string;
          clientCount: number;
          error: string | null;
        };
      } | null>,
    setPort: async (
      network: 'pikanetwork' | 'jartexnetwork',
      port: number,
    ): Promise<void> =>
      ipcRenderer.invoke('proxy:set-port', network, port) as Promise<void>,
    setBindHost: async (bindHost: '0.0.0.0' | '127.0.0.1'): Promise<void> =>
      ipcRenderer.invoke('proxy:set-bind-host', bindHost) as Promise<void>,
    onEvent: (cb: (event: unknown) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, event: unknown): void => cb(event);
      ipcRenderer.on('proxy:event', handler);
      return () => ipcRenderer.off('proxy:event', handler);
    },
  },

  telemetry: {
    isLinked: async (): Promise<boolean> =>
      ipcRenderer.invoke('telemetry:is-linked') as Promise<boolean>,
    startLink: () => ipcRenderer.send('telemetry:start-link'),
    onEvent: (cb: (event: unknown) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, event: unknown): void => cb(event);
      ipcRenderer.on('telemetry:event', handler);
      return () => ipcRenderer.off('telemetry:event', handler);
    },
  },

  perf: {
    dump: async (rendererSnapshot: unknown): Promise<string> =>
      ipcRenderer.invoke('perf:dump', rendererSnapshot) as Promise<string>,
    processMetrics: async (): Promise<{
      uptimeMs: number;
      processMemory: { rssMB: number; heapUsedMB: number };
      appMetrics: Array<{
        pid: number;
        type: string;
        cpuPercent: number;
        memoryMB: number;
      }>;
    }> =>
      ipcRenderer.invoke('perf:process-metrics') as Promise<{
        uptimeMs: number;
        processMemory: { rssMB: number; heapUsedMB: number };
        appMetrics: Array<{
          pid: number;
          type: string;
          cpuPercent: number;
          memoryMB: number;
        }>;
      }>,
    startTrace: async (): Promise<boolean> =>
      ipcRenderer.invoke('perf:start-trace') as Promise<boolean>,
    stopTrace: async (): Promise<string | null> =>
      ipcRenderer.invoke('perf:stop-trace') as Promise<string | null>,
    openLogDir: async (): Promise<string> =>
      ipcRenderer.invoke('perf:open-log-dir') as Promise<string>,
  },
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
