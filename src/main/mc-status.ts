import type { ChatComponent } from './chat-color-utils';
import { ping } from 'minecraft-protocol';
import { normalizeChatComponent, parseChatToPlain } from './chat-color-utils';

export interface RemoteServerStatus {
  motd: string;
  description: ChatComponent;
  favicon?: string;
}

interface CacheEntry {
  status: RemoteServerStatus | null;
  expiresAt: number;
}

const statusCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<RemoteServerStatus | null>>();

function extractRawDescription(result: object): unknown {
  const fields = result as { description?: unknown; motd?: unknown };
  return fields.description ?? fields.motd;
}

function extractFavicon(result: object): string | undefined {
  const favicon = (result as { favicon?: unknown }).favicon;
  return typeof favicon === 'string' && favicon.length > 0 ? favicon : undefined;
}

async function pingOnce(host: string, port: number): Promise<RemoteServerStatus | null> {
  try {
    const result = await ping({ host, port, closeTimeout: 4000 });
    const raw = extractRawDescription(result);
    const motd = parseChatToPlain(raw);
    if (motd.length === 0) return null;
    return {
      motd,
      description: normalizeChatComponent(raw),
      favicon: extractFavicon(result),
    };
  } catch {
    return null;
  }
}

async function pingWithTimeout(
  host: string,
  port: number,
): Promise<RemoteServerStatus | null> {
  return new Promise((resolvePromise) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolvePromise(null);
    }, 4000);

    void pingOnce(host, port).then((status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(status);
    });
  });
}

export async function fetchRemoteServerStatus(
  host: string,
  port: number,
): Promise<RemoteServerStatus | null> {
  const key = `${host}:${port}`;
  const cached = statusCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const pending = inFlightRequests.get(key);
  if (pending) return pending;

  const request = pingWithTimeout(host, port).then((status) => {
    statusCache.set(key, { status, expiresAt: Date.now() + 30_000 });
    inFlightRequests.delete(key);
    return status;
  });

  inFlightRequests.set(key, request);
  return request;
}
