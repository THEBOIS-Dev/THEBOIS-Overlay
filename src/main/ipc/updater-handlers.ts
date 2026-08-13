import { is } from '@electron-toolkit/utils';
import { ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { dbg } from '../logger';
import { getMainWindow } from '../window';

export function registerUpdaterHandlers(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () =>
    getMainWindow()?.webContents.send('updater:status', { status: 'checking' }),
  );
  autoUpdater.on('update-not-available', () =>
    getMainWindow()?.webContents.send('updater:status', { status: 'up-to-date' }),
  );
  autoUpdater.on('update-available', (info) =>
    getMainWindow()?.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
    }),
  );
  autoUpdater.on('download-progress', (progress) =>
    getMainWindow()?.webContents.send('updater:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    }),
  );
  autoUpdater.on('update-downloaded', (info) => {
    getMainWindow()?.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
    });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 3_000);
  });
  autoUpdater.on('error', (error) =>
    getMainWindow()?.webContents.send('updater:status', {
      status: 'error',
      error: error.message,
    }),
  );

  ipcMain.on('updater:check', () => {
    if (is.dev) {
      dbg.ipc('updater:check skipped in dev mode');
      getMainWindow()?.webContents.send('updater:status', { status: 'dev' });
      return;
    }
    dbg.ipc('updater:check - checking for updates');
    autoUpdater.checkForUpdates().catch((error: Error) => {
      dbg.error(`autoUpdater.checkForUpdates failed: ${error.message}`);
    });
  });

  ipcMain.on('updater:install', () => {
    dbg.ipc('updater:install - quitting and installing');
    autoUpdater.quitAndInstall(true, true);
  });
}
