import { globalShortcut, ipcMain } from 'electron';
import { getMainWindow } from '../window';

const registeredShortcuts = new Set<string>();

export function registerShortcutsHandlers(): void {
  ipcMain.handle('shortcuts:register', (_, shortcuts: string[]) => {
    unregisterAllShortcuts();
    for (const shortcut of shortcuts.filter(Boolean)) {
      try {
        globalShortcut.register(shortcut, () =>
          getMainWindow()?.webContents.send('shortcut:fired', shortcut),
        );
        registeredShortcuts.add(shortcut);
      } catch {}
    }
  });
}

export function unregisterAllShortcuts(): void {
  for (const shortcut of registeredShortcuts) {
    globalShortcut.unregister(shortcut);
    registeredShortcuts.delete(shortcut);
  }
}
