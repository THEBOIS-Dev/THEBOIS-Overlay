import { promises as fs } from 'fs';
import * as path from 'path';
import * as nbt from 'prismarine-nbt';

type ServerFields = Record<string, nbt.Tags[nbt.TagType]>;

interface PromoteTarget {
  clientRoot: string;
  serversDatPath: string;
}

interface PromoteSpec {
  entryName: string;
  targetIp: string;
  matchIpHints: RegExp[];
}

function stringTag(value: string): nbt.String {
  return { type: 'string', value };
}

function byteTag(value: number): nbt.Byte {
  return { type: 'byte', value };
}

function readStringField(entry: ServerFields, key: string): string | undefined {
  const field = entry[key];
  return field && field.type === 'string' ? field.value : undefined;
}

function buildEmptyRoot(): nbt.NBT {
  return {
    name: '',
    type: 'compound',
    value: {
      servers: {
        type: 'list',
        value: { type: 'compound', value: [] },
      },
    },
  };
}

async function readServersDat(filePath: string): Promise<nbt.NBT> {
  try {
    const buf = await fs.readFile(filePath);
    if (buf.length === 0) return buildEmptyRoot();
    return nbt.parseUncompressed(buf, 'big');
  } catch {
    return buildEmptyRoot();
  }
}

async function writeServersDat(filePath: string, root: nbt.NBT): Promise<void> {
  const buf = nbt.writeUncompressed(root, 'big');
  const tmpPath = `${filePath}.thebois-tmp`;
  await fs.writeFile(tmpPath, buf);
  await fs.rename(tmpPath, filePath);
}

function getServerEntries(root: nbt.NBT): ServerFields[] {
  const serversTag = root.value.servers;
  if (!serversTag || serversTag.type !== 'list') return [];
  const listValue = serversTag.value as { type: string; value: unknown[] };
  if (listValue.type !== 'compound') return [];
  return listValue.value as ServerFields[];
}

function setServerEntries(root: nbt.NBT, entries: ServerFields[]): nbt.NBT {
  return {
    ...root,
    value: {
      ...root.value,
      servers: {
        type: 'list',
        value: { type: 'compound', value: entries },
      },
    },
  };
}

function findExistingIcon(entries: ServerFields[], hints: RegExp[]): string | undefined {
  for (const entry of entries) {
    const ip = readStringField(entry, 'ip') ?? '';
    const name = readStringField(entry, 'name') ?? '';
    if (hints.some((hint) => hint.test(ip) || hint.test(name))) {
      const icon = entry.icon;
      if (icon && icon.type === 'string') return icon.value;
    }
  }
  return undefined;
}

function upsertAllPromotedEntries(
  entries: ServerFields[],
  specs: PromoteSpec[],
): ServerFields[] {
  const specNames = new Set(specs.map((spec) => spec.entryName));

  const remaining = entries.filter(
    (entry) => !specNames.has(readStringField(entry, 'name') ?? ''),
  );

  const promotedBlock = specs.map((spec) => {
    const existing = entries.find(
      (entry) => readStringField(entry, 'name') === spec.entryName,
    );

    const existingIcon = existing?.icon;
    const borrowedIcon = existingIcon
      ? undefined
      : findExistingIcon(remaining, spec.matchIpHints);
    const icon = existingIcon ?? (borrowedIcon ? stringTag(borrowedIcon) : undefined);

    return {
      name: stringTag(spec.entryName),
      ip: stringTag(spec.targetIp),
      acceptTextures: byteTag(1),
      ...(icon ? { icon } : {}),
    };
  });

  return [...promotedBlock, ...remaining];
}

async function promoteInFile(filePath: string, specs: PromoteSpec[]): Promise<boolean> {
  try {
    const root = await readServersDat(filePath);
    const entries = getServerEntries(root);

    const alreadyCorrect = specs.every(
      (spec, i) =>
        entries[i] &&
        readStringField(entries[i], 'name') === spec.entryName &&
        readStringField(entries[i], 'ip') === spec.targetIp,
    );

    if (alreadyCorrect) return true;

    const updated = upsertAllPromotedEntries(entries, specs);
    await writeServersDat(filePath, setServerEntries(root, updated));
    return true;
  } catch {
    return false;
  }
}

function windowsRoots(appData: string): PromoteTarget[] {
  const local = appData.replace(/[Rr]oaming$/, 'Local');
  return [
    {
      clientRoot: `${appData}/.minecraft`,
      serversDatPath: `${appData}/.minecraft/servers.dat`,
    },
    { clientRoot: `${appData}/.mc`, serversDatPath: `${appData}/.mc/servers.dat` },
    {
      clientRoot: `${appData}/.minecraft/feather`,
      serversDatPath: `${appData}/.minecraft/feather/servers.dat`,
    },
    {
      clientRoot: `${appData}/.cmclient`,
      serversDatPath: `${appData}/.cmclient/servers.dat`,
    },
    {
      clientRoot: `${appData}/.salwyrr`,
      serversDatPath: `${appData}/.salwyrr/servers.dat`,
    },
    {
      clientRoot: `${appData}/.pvplounge`,
      serversDatPath: `${appData}/.pvplounge/servers.dat`,
    },
    { clientRoot: `${local}/lunarclient/offline`, serversDatPath: '' },
    { clientRoot: `${local}/lunarclient/profiles/lunar`, serversDatPath: '' },
    { clientRoot: `${local}/lunarclient/profiles`, serversDatPath: '' },
  ];
}

function darwinRoots(appSupport: string, home: string): PromoteTarget[] {
  return [
    {
      clientRoot: `${appSupport}/minecraft`,
      serversDatPath: `${appSupport}/minecraft/servers.dat`,
    },
    { clientRoot: `${home}/.mc`, serversDatPath: `${home}/.mc/servers.dat` },
    {
      clientRoot: `${appSupport}/minecraft/feather`,
      serversDatPath: `${appSupport}/minecraft/feather/servers.dat`,
    },
    { clientRoot: `${home}/.cmclient`, serversDatPath: `${home}/.cmclient/servers.dat` },
    { clientRoot: `${home}/.salwyrr`, serversDatPath: `${home}/.salwyrr/servers.dat` },
    {
      clientRoot: `${appSupport}/pvplounge`,
      serversDatPath: `${appSupport}/pvplounge/servers.dat`,
    },
    { clientRoot: `${appSupport}/lunarclient/offline`, serversDatPath: '' },
    { clientRoot: `${appSupport}/lunarclient/profiles/lunar`, serversDatPath: '' },
    { clientRoot: `${appSupport}/lunarclient/profiles`, serversDatPath: '' },
  ];
}

function linuxRoots(home: string): PromoteTarget[] {
  return [
    {
      clientRoot: `${home}/.minecraft`,
      serversDatPath: `${home}/.minecraft/servers.dat`,
    },
    { clientRoot: `${home}/.mc`, serversDatPath: `${home}/.mc/servers.dat` },
    {
      clientRoot: `${home}/.minecraft/feather`,
      serversDatPath: `${home}/.minecraft/feather/servers.dat`,
    },
    { clientRoot: `${home}/.cmclient`, serversDatPath: `${home}/.cmclient/servers.dat` },
    { clientRoot: `${home}/.salwyrr`, serversDatPath: `${home}/.salwyrr/servers.dat` },
    {
      clientRoot: `${home}/.pvplounge`,
      serversDatPath: `${home}/.pvplounge/servers.dat`,
    },
    { clientRoot: `${home}/.lunarclient/offline`, serversDatPath: '' },
    { clientRoot: `${home}/.lunarclient/profiles/lunar`, serversDatPath: '' },
    { clientRoot: `${home}/.lunarclient/profiles`, serversDatPath: '' },
  ];
}

async function expandLunarVersionRoots(base: string): Promise<string[]> {
  try {
    const versions = await fs.readdir(base);
    const paths: string[] = [];

    for (const version of versions) {
      const candidate = path.join(base, version, 'servers.dat');

      try {
        await fs.access(candidate);
        paths.push(candidate);
      } catch {
        continue;
      }
    }

    return paths;
  } catch {
    return [];
  }
}

async function collectServersDatPaths(
  platform: string,
  appData: string,
  home: string,
): Promise<string[]> {
  const targets =
    platform === 'win32'
      ? windowsRoots(appData)
      : platform === 'darwin'
        ? darwinRoots(appData, home)
        : linuxRoots(home);

  const direct = targets.filter((t) => t.serversDatPath).map((t) => t.serversDatPath);
  const lunarBases = targets.filter((t) => !t.serversDatPath).map((t) => t.clientRoot);

  const lunarExpanded = await Promise.all(lunarBases.map(expandLunarVersionRoots));

  const existing: string[] = [];

  for (const p of direct) {
    try {
      await fs.access(path.dirname(p));
      existing.push(p);
    } catch {
      continue;
    }
  }

  return Array.from(new Set([...existing, ...lunarExpanded.flat()]));
}

export async function promoteProxyAcrossClients(
  platform: string,
  appData: string,
  home: string,
  specs: PromoteSpec[],
): Promise<void> {
  const paths = await collectServersDatPaths(platform, appData, home);

  for (const filePath of paths) {
    await promoteInFile(filePath, specs);
  }
}

export type { PromoteSpec };
