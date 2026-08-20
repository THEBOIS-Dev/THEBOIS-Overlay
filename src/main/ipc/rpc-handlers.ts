import { Client } from 'discord-rpc';
import { ipcMain } from 'electron';
import { dbg } from '../logger';

const rpcAppId = '1487763608820781096';

interface RpcClientInstance {
  on: (
    event: 'ready' | 'disconnected' | string,
    cb: (...args: unknown[]) => void,
  ) => void;
  login: (opts: { clientId: string }) => Promise<RpcClientInstance>;
  setActivity: (opts: {
    details: string;
    largeImageKey: string;
    largeImageText: string;
    instance: boolean;
  }) => Promise<void>;
  destroy: () => Promise<void>;
  user?: { username?: string } | null;
}

let rpcClient: RpcClientInstance | null = null;
let rpcConnected = false;
let rpcRetryTimer: NodeJS.Timeout | null = null;
let rpcIsActive = false;
let rpcCurrentNetwork = 'pikanetwork';

export function registerRpcHandlers(): void {
  ipcMain.on('rpc:set-enabled', (_, enabled: boolean) => {
    void (async () => {
      dbg.rpc(`rpc:set-enabled  enabled=${enabled}`);
      if (enabled) await initRpc();
      else await destroyRpcClient();
    })();
  });

  ipcMain.on('rpc:set-active', (_, active: boolean) => {
    rpcIsActive = active;
    applyRpcActivity();
  });

  ipcMain.on('rpc:set-network', (_, network: string) => {
    dbg.rpc(`rpc:set-network  network=${network}`);
    rpcCurrentNetwork = network;
    applyRpcActivity();
  });

  ipcMain.on('rpc:destroy', () => {
    void destroyRpcClient();
  });
}

export async function destroyRpcClient(): Promise<void> {
  if (rpcRetryTimer !== null) {
    clearTimeout(rpcRetryTimer);
    rpcRetryTimer = null;
  }
  if (rpcClient) {
    try {
      await rpcClient.destroy();
    } catch {}
    rpcClient = null;
    rpcConnected = false;
    dbg.rpc('Discord RPC destroyed');
  }
}

async function initRpc(): Promise<void> {
  if (rpcConnected) return;
  await destroyRpcClient();

  try {
    const RpcClientConstructor = Client as unknown as new (opts: {
      transport: 'ipc' | 'websocket';
    }) => RpcClientInstance;
    const client = new RpcClientConstructor({
      transport: 'ipc',
    });
    rpcClient = client;

    client.on('ready', () => {
      rpcConnected = true;
      dbg.rpc(`Connected as ${client.user?.username ?? 'unknown'}`);
      applyRpcActivity();
    });

    client.on('disconnected', () => {
      rpcConnected = false;
      dbg.rpc('Disconnected. Retrying in 15s');
      scheduleRpcRetry();
    });

    await client.login({ clientId: rpcAppId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dbg.rpc(`Init failed: ${message}. Retrying in 15s`);
    scheduleRpcRetry();
  }
}

function scheduleRpcRetry(): void {
  if (rpcRetryTimer !== null) return;
  rpcRetryTimer = setTimeout(() => {
    rpcRetryTimer = null;
    initRpc().catch(() => {});
  }, 15_000);
}

function applyRpcActivity(): void {
  if (rpcClient === null || !rpcConnected) return;
  const client = rpcClient;
  const networkLabel =
    rpcCurrentNetwork === 'jartexnetwork' ? 'JartexNetwork' : 'PikaNetwork';
  const details = rpcIsActive ? `Playing on ${networkLabel}` : 'Idle';
  client
    .setActivity({
      details,
      largeImageKey: 'bedwars',
      largeImageText: 'Kyra Overlay',
      instance: false,
    })
    .catch((error: Error) => dbg.rpc(`setActivity error: ${error.message}`));
}
