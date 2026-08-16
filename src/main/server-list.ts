import type {
  NBT,
  Byte as NbtByte,
  String as NbtString,
  Tags,
  TagType,
} from 'prismarine-nbt';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseUncompressed, writeUncompressed } from 'prismarine-nbt';
import { fetchRemoteServerStatus, uri } from './mc-status';
import {
  dynamicScanRoots,
  scanForServersDatFiles,
  verifyServersDatFile,
} from './server-list-scan';

type ServerFields = Record<string, Tags[TagType]>;

interface PromoteTarget {
  clientRoot: string;
  serversDatPath: string;
}

interface PromoteSpec {
  entryName: string;
  targetIp: string;
  matchIpHints: RegExp[];
  sourceHost: string;
  sourcePort: number;
}

function sanitizeFavicon(value: string): string {
  const match = value.match(uri);
  return match ? match[1] : value;
}

function stringTag(value: string): NbtString {
  return { type: 'string', value };
}

function byteTag(value: number): NbtByte {
  return { type: 'byte', value };
}

function readStringField(entry: ServerFields, key: string): string | undefined {
  const field = entry[key];
  return field !== undefined && field.type === 'string' ? field.value : undefined;
}

function buildEmptyRoot(): NBT {
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

async function readServersDat(filePath: string): Promise<NBT> {
  try {
    const buf = await fs.readFile(filePath);
    if (buf.length === 0) return buildEmptyRoot();
    return parseUncompressed(buf, 'big');
  } catch {
    return buildEmptyRoot();
  }
}

async function writeServersDat(filePath: string, root: NBT): Promise<void> {
  const buf = writeUncompressed(root, 'big');
  const tmpPath = `${filePath}.kyra-tmp`;
  await fs.writeFile(tmpPath, buf);
  await fs.rename(tmpPath, filePath);
}

function getServerEntries(root: NBT): ServerFields[] {
  const serversTag = root.value.servers;
  if (!serversTag || serversTag.type !== 'list') return [];
  const listValue = serversTag.value as { type: string; value: unknown[] };
  if (listValue.type !== 'compound') return [];
  return listValue.value as ServerFields[];
}

function setServerEntries(root: NBT, entries: ServerFields[]): NBT {
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
      if (icon !== undefined && icon.type === 'string')
        return sanitizeFavicon(icon.value);
    }
  }
  return undefined;
}

async function resolveEntryIcon(
  spec: PromoteSpec,
  existingIcon: Tags[TagType] | undefined,
  remaining: ServerFields[],
): Promise<NbtString | Tags[TagType] | undefined> {
  const liveStatus = await fetchRemoteServerStatus(spec.sourceHost, spec.sourcePort);
  if (liveStatus?.favicon !== undefined) return stringTag(liveStatus.favicon);

  if (existingIcon !== undefined) {
    if (existingIcon.type === 'string')
      return stringTag(sanitizeFavicon(existingIcon.value));
    return existingIcon;
  }

  const borrowedIcon = findExistingIcon(remaining, spec.matchIpHints);
  return borrowedIcon !== undefined ? stringTag(borrowedIcon) : undefined;
}

async function upsertAllPromotedEntries(
  entries: ServerFields[],
  specs: PromoteSpec[],
): Promise<ServerFields[]> {
  const specNames = new Set(specs.map((spec) => spec.entryName));

  const remaining = entries.filter(
    (entry) => !specNames.has(readStringField(entry, 'name') ?? ''),
  );

  const promotedBlock = await Promise.all(
    specs.map(async (spec) => {
      const existing = entries.find(
        (entry) => readStringField(entry, 'name') === spec.entryName,
      );

      const icon = await resolveEntryIcon(spec, existing?.icon, remaining);

      return {
        name: stringTag(spec.entryName),
        ip: stringTag(spec.targetIp),
        acceptTextures: byteTag(1),
        ...(icon ? { icon } : {}),
      };
    }),
  );

  return [...promotedBlock, ...remaining];
}

async function promoteInFile(filePath: string, specs: PromoteSpec[]): Promise<boolean> {
  try {
    const root = await readServersDat(filePath);
    const entries = getServerEntries(root);

    const alreadyCorrect = specs.every((spec, i) => {
      const entry = entries[i];
      if (entry === undefined) return false;
      if (readStringField(entry, 'name') !== spec.entryName) return false;
      if (readStringField(entry, 'ip') !== spec.targetIp) return false;
      const icon = entry.icon;
      if (icon !== undefined && icon.type === 'string' && uri.test(icon.value)) {
        return false;
      }
      return true;
    });

    if (alreadyCorrect) return true;

    const updated = await upsertAllPromotedEntries(entries, specs);
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
      const candidate = join(base, version, 'servers.dat');

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

  const direct = targets
    .filter((target) => target.serversDatPath)
    .map((target) => target.serversDatPath);
  const lunarBases = targets
    .filter((target) => !target.serversDatPath)
    .map((target) => target.clientRoot);

  const lunarExpanded = await Promise.all(lunarBases.map(expandLunarVersionRoots));

  const existing: string[] = [];

  for (const candidatePath of direct) {
    try {
      await fs.access(dirname(candidatePath));
      existing.push(candidatePath);
    } catch {
      continue;
    }
  }

  const knownPaths = new Set([...existing, ...lunarExpanded.flat()]);

  const discoveredCandidates = await scanForServersDatFiles(
    dynamicScanRoots(platform, appData, home),
  );

  const verifiedDiscovered: string[] = [];

  for (const candidate of discoveredCandidates) {
    if (knownPaths.has(candidate)) continue;
    if (await verifyServersDatFile(candidate)) verifiedDiscovered.push(candidate);
  }

  return Array.from(new Set([...knownPaths, ...verifiedDiscovered]));
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
