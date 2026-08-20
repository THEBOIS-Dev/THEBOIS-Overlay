import fs from 'node:fs';
import readline from 'node:readline';
import TailFile from '@logdna/tail-file';
import { dialog, ipcMain } from 'electron';
import { dbg } from '../logger';
import { getMainWindow } from '../window';

const logBatchIntervalMs = 16;

let logTail: TailFile | null = null;
let logReadline: readline.Interface | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let lineBuffer: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;

export function registerLogHandlers(): void {
  ipcMain.on('log:set-path', (_, path: string | null) => {
    void (async () => {
      if (path === null) {
        await stopLogTail();
        return;
      }
      await startLogTail(path);
    })();
  });

  ipcMain.handle('log:check-path', async (_, path: string) =>
    fs.promises
      .access(path, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false),
  );

  ipcMain.handle('log:open-dialog', async () =>
    dialog.showOpenDialog(getMainWindow()!, {
      filters: [{ name: 'Minecraft Logs', extensions: ['log'] }],
      properties: ['openFile'],
    }),
  );
}

export async function stopLogTail(): Promise<void> {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (logReadline) {
    logReadline.close();
    logReadline = null;
  }
  if (logTail) {
    await logTail
      .quit()
      .catch((error: Error) => dbg.error(`Error closing tail: ${error.message}`));
    logTail = null;
  }
  flushLineBuffer();
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function queueLine(line: string): void {
  lineBuffer.push(line);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLineBuffer();
    }, logBatchIntervalMs);
  }
}

function flushLineBuffer(): void {
  if (lineBuffer.length === 0) return;
  const lines = lineBuffer;
  lineBuffer = [];
  getMainWindow()?.webContents.send('log:line', lines);
}

async function startLogTail(path: string): Promise<void> {
  await stopLogTail();
  try {
    logTail = new TailFile(path, { pollFileIntervalMs: 250 });
    logTail.on('error', () => scheduleRestartIfReadable(path));
    await logTail.start();
    logReadline = readline.createInterface({ input: logTail, crlfDelay: Infinity });
    logReadline.on('line', (line) => {
      queueLine(stripMcColorCodes(line));
    });
    dbg.ipc(`Log tail started: ${path}`);
  } catch (error) {
    dbg.error(`Failed to start log tail: ${(error as Error).message}`);
  }
}

function scheduleRestartIfReadable(path: string): void {
  if (restartTimer) return;
  restartTimer = setTimeout(() => {
    void (async () => {
      restartTimer = null;
      const readable = await fs.promises
        .access(path, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false);
      if (readable) await startLogTail(path).catch(() => {});
      else await stopLogTail();
    })();
  }, 2_000);
}

function stripMcColorCodes(line: string): string {
  return line.replace(/[\u00A7\uFFFD][0-9A-FK-OR]/gi, '').replace(/[\u00A7\uFFFD]/g, '');
}
