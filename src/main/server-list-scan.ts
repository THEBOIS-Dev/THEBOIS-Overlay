import type { Readable } from 'node:stream';
import type { NBT, Tags, TagType } from 'prismarine-nbt';
import { promises as fs } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import fastGlob from 'fast-glob';
import { parseUncompressed } from 'prismarine-nbt';

async function scanRoot(root: string): Promise<string[]> {
  let resolvedRoot: string;

  try {
    resolvedRoot = resolve(root);
    await fs.access(resolvedRoot);
  } catch {
    return [];
  }

  return new Promise((resolvePromise) => {
    const matches: string[] = [];
    const stream = fastGlob.stream(`**/servers.dat`, {
      cwd: resolvedRoot,
      absolute: true,
      onlyFiles: true,
      dot: true,
      unique: true,
      deep: 12,
      followSymbolicLinks: false,
      suppressErrors: true,
    }) as Readable;

    let settled = false;

    const timer = setTimeout(() => {
      stream.destroy();
      finish();
    }, 5000);

    function finish(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(matches);
    }

    stream.on('data', (entry: string) => {
      matches.push(entry);
    });
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
  });
}

export async function scanForServersDatFiles(roots: string[]): Promise<string[]> {
  const uniqueRoots = Array.from(new Set(roots.filter((root) => root.length > 0)));
  const results = await Promise.all(uniqueRoots.map(scanRoot));
  return Array.from(new Set(results.flat()));
}

export function isValidServersDatStructure(root: NBT): boolean {
  if (root.type !== 'compound') return false;

  const servers = root.value.servers;
  if (servers === undefined) return true;
  if (servers.type !== 'list') return false;

  const listValue = servers.value as { type: string; value: unknown[] };
  if (listValue.type !== 'compound' && listValue.type !== 'end') return false;
  if (listValue.type === 'end') return true;

  return listValue.value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const fields = entry as Record<string, Tags[TagType]>;
    return fields.ip === undefined || fields.ip.type === 'string';
  });
}

export async function verifyServersDatFile(filePath: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(filePath);
    if (buf.length === 0) return true;
    const root = parseUncompressed(buf, 'big');
    return isValidServersDatStructure(root);
  } catch {
    return false;
  }
}

export function dynamicScanRoots(
  platform: string,
  appData: string,
  home: string,
): string[] {
  if (platform === 'win32') {
    const local = appData.replace(/[Rr]oaming$/, 'Local');
    return [home, appData, local];
  }

  if (platform === 'darwin') {
    return [home, appData, join(home, 'Library', 'Application Support')];
  }

  return [home, join(home, '.local', 'share'), join(home, '.config'), `${sep}opt`];
}
