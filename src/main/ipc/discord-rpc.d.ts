import { EventEmitter } from 'node:events';

declare module 'discord-rpc' {
  export interface ClientOptions {
    transport: 'ipc' | 'websocket';
  }

  export interface Activity {
    details?: string;
    state?: string;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    partySize?: number;
    partyId?: string;
    partyMax?: number;
    matchSecret?: string;
    joinSecret?: string;
    spectateSecret?: string;
    instance?: boolean;
  }

  export class Client extends EventEmitter {
    constructor(options?: ClientOptions);
    on(
      event: 'ready' | 'disconnected' | string,
      callback: (...args: unknown[]) => void,
    ): this;
    login(options: { clientId: string }): Promise<this>;
    setActivity(activity: Activity, pid?: number): Promise<void>;
    destroy(): Promise<void>;
    user?: { username?: string } | null;
  }

  export function register(id: string): string;
}
