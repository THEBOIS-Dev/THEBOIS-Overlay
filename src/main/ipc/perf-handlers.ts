import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, contentTracing, ipcMain, shell } from 'electron';
import { dbg } from '../logger';
import {
  getCurrentProcessMemoryMB,
  getMainPerfEvents,
  getMainProcessMetrics,
  getMainUptimeMs,
  instrumentIpcHandlers,
} from '../perf-monitor';

let tracing = false;

function getPerfLogDir(): string {
  return join(app.getPath('userData'), 'perf-logs');
}

async function writeDump(rendererSnapshot: unknown): Promise<string> {
  const dir = getPerfLogDir();
  await fs.mkdir(dir, { recursive: true });

  const filename = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const target = join(dir, filename);

  const payload = {
    generatedAt: new Date().toISOString(),
    main: {
      uptimeMs: getMainUptimeMs(),
      processMemory: getCurrentProcessMemoryMB(),
      appMetrics: await getMainProcessMetrics(),
      ipcEvents: getMainPerfEvents(),
    },
    renderer: rendererSnapshot,
  };

  await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf8');
  return target;
}

export function registerPerfHandlers(): void {
  instrumentIpcHandlers();

  ipcMain.handle('perf:dump', async (_, rendererSnapshot: unknown) => {
    const target = await writeDump(rendererSnapshot);
    dbg.ipc(`perf diagnostics dumped to ${target}`);
    return target;
  });

  ipcMain.handle('perf:process-metrics', async () => ({
    uptimeMs: getMainUptimeMs(),
    processMemory: getCurrentProcessMemoryMB(),
    appMetrics: await getMainProcessMetrics(),
  }));

  ipcMain.handle('perf:start-trace', async () => {
    if (tracing) return false;
    tracing = true;
    await contentTracing.startRecording({
      included_categories: ['*', 'disabled-by-default-devtools.timeline'],
    });
    dbg.ipc('content tracing started');
    return true;
  });

  ipcMain.handle('perf:stop-trace', async () => {
    if (!tracing) return null;
    tracing = false;
    const dir = getPerfLogDir();
    await fs.mkdir(dir, { recursive: true });
    const target = join(
      dir,
      `trace-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    const resultPath = await contentTracing.stopRecording(target);
    dbg.ipc(`content trace saved to ${resultPath}`);
    return resultPath;
  });

  ipcMain.handle('perf:open-log-dir', async () => {
    const dir = getPerfLogDir();
    await fs.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
    return dir;
  });
}
