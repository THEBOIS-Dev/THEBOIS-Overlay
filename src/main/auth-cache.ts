import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { safeStorage } from 'electron';

interface CachePayload {
  [key: string]: unknown;
}

export class EncryptedFileCache {
  private readonly filePath: string;
  private cache: CachePayload | undefined;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async reset(): Promise<CachePayload> {
    this.cache = {};
    await this.persist();
    return this.cache;
  }

  async getCached(): Promise<CachePayload> {
    if (this.cache === undefined) {
      this.cache = await this.loadInitialValue();
    }

    return this.cache;
  }

  async setCached(cached: CachePayload): Promise<void> {
    this.cache = cached;
    await this.persist();
  }

  async setCachedPartial(cached: CachePayload): Promise<void> {
    await this.setCached({ ...this.cache, ...cached });
  }

  private async loadInitialValue(): Promise<CachePayload> {
    try {
      const raw = await fs.readFile(this.filePath);

      if (raw.length === 0) {
        return await this.reset();
      }

      if (safeStorage.isEncryptionAvailable()) {
        try {
          return JSON.parse(safeStorage.decryptString(raw)) as CachePayload;
        } catch {
          return JSON.parse(raw.toString('utf8')) as CachePayload;
        }
      }

      return JSON.parse(raw.toString('utf8')) as CachePayload;
    } catch {
      return this.reset();
    }
  }

  private async persist(): Promise<void> {
    const json = JSON.stringify(this.cache);

    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8');

    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.filePath, data, { mode: 0o600 });
  }
}

export function createEncryptedAuthCache(
  cacheDir: string,
): (params: { cacheName: string; username: string }) => EncryptedFileCache {
  return ({ cacheName }) =>
    new EncryptedFileCache(path.join(cacheDir, `${cacheName}.cache`));
}

export async function purgeLegacyPlaintextCache(cacheDir: string): Promise<void> {
  let entries: string[];

  try {
    entries = await fs.readdir(cacheDir);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((name) => name.endsWith('-cache.json'))
      .map(async (name) => fs.unlink(path.join(cacheDir, name)).catch(() => undefined)),
  );
}
