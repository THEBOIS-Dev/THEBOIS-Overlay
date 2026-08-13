import type { ProxyBindHost, ProxyNetwork } from '../proxy';
import { ipcMain } from 'electron';
import { getProxyManager, runProxyPromotion } from '../proxy-service';

export function registerProxyHandlers(): void {
  ipcMain.handle('proxy:get-status', () => getProxyManager()?.getStatus() ?? null);

  ipcMain.handle('proxy:set-port', async (_, network: ProxyNetwork, port: number) => {
    const proxyManager = getProxyManager();
    if (!proxyManager) return;
    await proxyManager.updatePort(network, port);
    runProxyPromotion();
  });

  ipcMain.handle('proxy:set-bind-host', async (_, bindHost: ProxyBindHost) => {
    const proxyManager = getProxyManager();
    if (!proxyManager) return;
    await proxyManager.updateBindHost(bindHost);
  });
}
