import type { SupportMessage } from './support-service';
import { api } from './index';
import { getLinkedApiKey } from './telemetry-service';

interface MinimalWebSocketEvent {
  data: unknown;
}

interface MinimalWebSocket {
  readonly readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: {
    (type: 'open' | 'close', listener: () => void): void;
    (type: 'message', listener: (event: MinimalWebSocketEvent) => void): void;
    (type: 'error', listener: () => void): void;
  };
}

interface MinimalWebSocketConstructor {
  new (url: string): MinimalWebSocket;
  readonly OPEN: number;
}

const NativeWebSocket = (
  globalThis as unknown as { WebSocket: MinimalWebSocketConstructor }
).WebSocket;

export type SupportSocketEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'message'; conversationId: string; message: SupportMessage };

type Listener = (event: SupportSocketEvent) => void;

const heartbeat = 25000;

let socket: MinimalWebSocket | null = null;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
let reconnectHandle: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let desired = false;
const listeners = new Set<Listener>();

function emit(event: SupportSocketEvent): void {
  for (const listener of listeners) listener(event);
}

function stopHeartbeat(): void {
  if (heartbeatHandle) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatHandle = setInterval(() => {
    if (socket?.readyState === NativeWebSocket.OPEN) socket.send('ping');
  }, heartbeat);
}

function scheduleReconnect(): void {
  if (!desired || reconnectHandle) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
  reconnectAttempt += 1;
  reconnectHandle = setTimeout(() => {
    reconnectHandle = null;
    void openSocket();
  }, delay);
}

function isSupportMessageEvent(
  value: unknown,
): value is { type: 'message'; conversationId: string; message: SupportMessage } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === 'message' &&
    typeof candidate.conversationId === 'string' &&
    typeof candidate.message === 'object' &&
    candidate.message !== null
  );
}

async function openSocket(): Promise<void> {
  if (!desired || socket) return;

  const apiKey = await getLinkedApiKey();
  if (apiKey === null) {
    scheduleReconnect();
    return;
  }

  const url = `${api.replace(/^http/, 'ws')}/api/support/socket?key=${encodeURIComponent(apiKey)}`;

  let ws: MinimalWebSocket;
  try {
    ws = new NativeWebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    reconnectAttempt = 0;
    startHeartbeat();
    emit({ type: 'connected' });
  });

  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || event.data === 'pong') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }

    if (isSupportMessageEvent(parsed)) emit(parsed);
  });

  ws.addEventListener('close', () => {
    socket = null;
    stopHeartbeat();
    emit({ type: 'disconnected' });
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    ws.close();
  });

  socket = ws;
}

export function connectSupportSocket(): void {
  if (desired) return;
  desired = true;
  reconnectAttempt = 0;
  void openSocket();
}

export function disconnectSupportSocket(): void {
  desired = false;
  if (reconnectHandle) {
    clearTimeout(reconnectHandle);
    reconnectHandle = null;
  }
  stopHeartbeat();
  socket?.close();
  socket = null;
}

export function onSupportSocketEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
