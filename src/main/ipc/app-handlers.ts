import fs from 'node:fs';
import process from 'node:process';
import { app, dialog, ipcMain } from 'electron';
import { dbg } from '../logger';
import { getMainWindow } from '../window';

const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const mimeByExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export function registerAppHandlers(): void {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:get-path', (_, name: string) =>
    app.getPath(name as Parameters<typeof app.getPath>[0]),
  );

  ipcMain.handle('app:open-image-dialog', async () =>
    dialog.showOpenDialog(getMainWindow()!, {
      title: 'Choose Background Image',
      filters: [{ name: 'Images', extensions }],
      properties: ['openFile'],
    }),
  );

  ipcMain.handle('app:read-file-base64', async (_, filePath: string) =>
    readFileAsBase64(filePath),
  );

  ipcMain.handle('app:find-lunar-log', findLunarLog);
}

async function readFileAsBase64(filePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { extname } = await import('node:path');
  const extension = extname(filePath).slice(1).toLowerCase();
  const mime = mimeByExtension[extension] ?? 'image/png';
  const data = await readFile(filePath);
  return `data:${mime};base64,${data.toString('base64')}`;
}

async function findLunarLog(): Promise<string> {
  const home = app.getPath('home');

  const baseCandidates: string[] = [
    `${home}/.lunarclient/offline`,
    `${home}/.lunarclient/profiles/lunar`,
    `${home}/.lunarclient/profiles`,
  ];

  if (process.platform === 'win32') {
    const roaming = app.getPath('appData');
    const local = roaming.replace(/[Rr]oaming$/, 'Local');
    baseCandidates.push(
      `${local}/lunarclient/offline`,
      `${local}/lunarclient/profiles/lunar`,
      `${local}/lunarclient/profiles`,
    );
  } else if (process.platform === 'darwin') {
    const appSupport = app.getPath('appData');
    baseCandidates.push(
      `${appSupport}/lunarclient/offline`,
      `${appSupport}/lunarclient/profiles/lunar`,
      `${appSupport}/lunarclient/profiles`,
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
  dbg.ipc(`app:find-lunar-log -> ${found[0].path}  (${found.length} candidates)`);
  return found[0].path;
}
