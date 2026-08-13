import type { Buffer } from 'node:buffer';
import type { Socket } from 'node:net';

export interface McPacketMeta {
  name: string;
  state: string;
}

export interface McClient extends NodeJS.EventEmitter {
  username: string;
  version: string | number;
  protocolVersion?: number;
  ended: boolean;
  state: string;
  socket: Socket;
  write: (name: string, data: Record<string, unknown>) => void;
  writeRaw: (buffer: Buffer) => void;
  end: (reason?: string) => void;
}

export interface McServer extends NodeJS.EventEmitter {
  close: () => void;
}
