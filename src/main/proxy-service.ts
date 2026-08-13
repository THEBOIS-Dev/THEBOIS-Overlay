import type { ProxyBindHost, ProxyEvent } from './proxy';
import process from 'node:process';
import { app } from 'electron';
import { dbg } from './logger';
import { ProxyManager } from './proxy';
import { promoteProxyAcrossClients } from './server-list';
import { getMainWindow } from './window';

const pikaPort = 25566;
const jartexPort = 25567;
const host: ProxyBindHost = '127.0.0.1';

let proxyManager: ProxyManager | null = null;
let promotionDebounceTimer: NodeJS.Timeout | null = null;

export function getProxyManager(): ProxyManager | null {
  return proxyManager;
}

export async function startProxyManager(): Promise<void> {
  proxyManager = new ProxyManager(pikaPort, jartexPort, host);
  proxyManager.on('event', (event: ProxyEvent) => {
    getMainWindow()?.webContents.send('proxy:event', event);
  });
  await proxyManager
    .startAll()
    .catch((error: Error) => dbg.error(`proxy startAll failed - ${error.message}`));
}

export async function stopProxyManager(): Promise<void> {
  if (!proxyManager) return;
  await proxyManager.stopAll().catch(() => {});
}

export function runProxyPromotion(): void {
  if (!proxyManager) return;
  if (promotionDebounceTimer) clearTimeout(promotionDebounceTimer);

  promotionDebounceTimer = setTimeout(() => {
    if (!proxyManager) return;
    const status = proxyManager.getStatus();

    void promoteProxyAcrossClients(
      process.platform,
      app.getPath('appData'),
      app.getPath('home'),
      [
        {
          entryName: 'Kyra Proxy | PikaNetwork',
          targetIp: `localhost:${status.pika.port}`,
          matchIpHints: [/pika/i],
        },
        {
          entryName: 'Kyra Proxy | JartexNetwork',
          targetIp: `localhost:${status.jartex.port}`,
          matchIpHints: [/jartex/i],
        },
      ],
    ).catch((error: Error) =>
      dbg.error(`servers.dat promotion failed - ${error.message}`),
    );
  }, 500);
}
