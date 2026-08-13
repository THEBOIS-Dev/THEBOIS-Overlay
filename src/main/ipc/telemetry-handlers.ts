import { ipcMain } from 'electron';
import { isLinked, startDiscordLink } from '../telemetry-service';

export function registerTelemetryHandlers(): void {
  ipcMain.handle('telemetry:is-linked', async () => isLinked());

  ipcMain.on('telemetry:start-link', () => startDiscordLink());
}
