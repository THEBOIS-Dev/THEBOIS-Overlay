import { ipcMain } from 'electron';
import {
  createConversation,
  getConversation,
  listConversations,
  replyToConversation,
} from '../support-service';
import {
  connectSupportSocket,
  disconnectSupportSocket,
  onSupportSocketEvent,
} from '../support-socket';
import { getMainWindow } from '../window';

export function registerSupportHandlers(): void {
  ipcMain.handle('support:list', async () => listConversations());

  ipcMain.handle('support:create', async (_event, subject: string, message: string) =>
    createConversation(subject, message),
  );

  ipcMain.handle('support:get', async (_event, id: string) => getConversation(id));

  ipcMain.handle('support:reply', async (_event, id: string, message: string) =>
    replyToConversation(id, message),
  );

  onSupportSocketEvent((event) => {
    getMainWindow()?.webContents.send('support:socket-event', event);
  });

  ipcMain.on('support:socket-connect', () => connectSupportSocket());
  ipcMain.on('support:socket-disconnect', () => disconnectSupportSocket());
}
