import type { IpcMainInvokeEvent } from 'electron';
import process from 'node:process';
import { app, ipcMain } from 'electron';

export interface MainPerfEvent {
  t: number;
  channel: string;
  durMs: number;
  error?: string;
}

export interface MainProcessMetrics {
  pid: number;
  type: string;
  cpuPercent: number;
  memoryMB: number;
}

const events: MainPerfEvent[] = [];
const startedAt = performance.now();
let instrumented = false;

function pushEvent(event: MainPerfEvent): void {
  events.push(event);
  if (events.length > 4000) events.shift();
}

export function instrumentIpcHandlers(): void {
  if (instrumented) return;
  instrumented = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);

  ipcMain.handle = ((channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => {
    return originalHandle(
      channel,
      async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        const start = performance.now();
        try {
          const result: unknown = await listener(event, ...args);
          return result;
        } catch (error) {
          const durMs = performance.now() - start;
          pushEvent({ t: start, channel, durMs, error: (error as Error).message });
          throw error;
        } finally {
          const durMs = performance.now() - start;
          pushEvent({ t: start, channel, durMs });
        }
      },
    );
  }) as typeof ipcMain.handle;
}

export function getMainPerfEvents(): MainPerfEvent[] {
  return events.slice();
}

export function getMainUptimeMs(): number {
  return performance.now() - startedAt;
}

export async function getMainProcessMetrics(): Promise<MainProcessMetrics[]> {
  const metrics = app.getAppMetrics();
  return metrics.map((metric) => ({
    pid: metric.pid,
    type: metric.type,
    cpuPercent: metric.cpu.percentCPUUsage,
    memoryMB: (metric.memory?.workingSetSize ?? 0) / 1024,
  }));
}

export function getCurrentProcessMemoryMB(): { rssMB: number; heapUsedMB: number } {
  const usage = process.memoryUsage();
  return {
    rssMB: usage.rss / 1048576,
    heapUsedMB: usage.heapUsed / 1048576,
  };
}
