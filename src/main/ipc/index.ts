import { registerAppHandlers } from './app-handlers';
import { registerLogHandlers } from './log-handlers';
import { registerPerfHandlers } from './perf-handlers';
import { registerProxyHandlers } from './proxy-handlers';
import { registerRpcHandlers } from './rpc-handlers';
import { registerShortcutsHandlers } from './shortcuts-handlers';
import { registerStatsHandlers } from './stats-handlers';
import { registerTelemetryHandlers } from './telemetry-handlers';
import { registerUpdaterHandlers } from './updater-handlers';
import { registerWindowHandlers } from './window-handlers';

export function registerAllIpcHandlers(): void {
  registerPerfHandlers();
  registerWindowHandlers();
  registerStatsHandlers();
  registerAppHandlers();
  registerLogHandlers();
  registerShortcutsHandlers();
  registerRpcHandlers();
  registerUpdaterHandlers();
  registerProxyHandlers();
  registerTelemetryHandlers();
}
