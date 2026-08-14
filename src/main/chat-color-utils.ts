import { simplify } from 'prismarine-nbt';

const byteToHex: Record<number, string> = {
  0: '#000000',
  1: '#0000AA',
  2: '#00AA00',
  3: '#00AAAA',
  4: '#AA0000',
  5: '#AA00AA',
  6: '#FFAA00',
  7: '#AAAAAA',
  8: '#555555',
  9: '#5555FF',
  10: '#55FF55',
  11: '#55FFFF',
  12: '#FF5555',
  13: '#FF55FF',
  14: '#FFFF55',
  15: '#FFFFFF',
};

const charToHex: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  a: '#55FF55',
  b: '#55FFFF',
  c: '#FF5555',
  d: '#FF55FF',
  e: '#FFFF55',
  f: '#FFFFFF',
};

const nameToHex: Record<string, string> = {
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF',
  orange: '#FFA500',
  pink: '#FFB6C1',
  lime: '#00FF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  brown: '#8B4513',
  light_blue: '#ADD8E6',
  light_gray: '#D3D3D3',
};

export function stripColorCodes(text: string): string {
  return text.replace(/[§\uFFFD][0-9A-FK-OR]/gi, '').replace(/[§\uFFFD]/g, '');
}

function isNbtTag(value: unknown): value is { type: string; value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'value' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

function simplifyIfNbt(value: unknown): unknown {
  if (isNbtTag(value)) {
    try {
      return simplify(value as never);
    } catch {
      return value;
    }
  }

  return value;
}

export function extractComponentText(component: unknown): string {
  if (isNbtTag(component)) {
    return extractComponentText(simplifyIfNbt(component));
  }

  if (typeof component === 'string') {
    try {
      return extractComponentText(JSON.parse(component) as unknown);
    } catch {
      return component;
    }
  }

  if (Array.isArray(component)) {
    return (component as unknown[]).map(extractComponentText).join('');
  }

  if (typeof component === 'object' && component !== null) {
    const fields = component as Record<string, unknown>;

    let text = typeof fields.text === 'string' ? fields.text : '';

    if (typeof fields.translate === 'string') {
      text += fields.translate;
    }

    if (Array.isArray(fields.extra)) {
      text += (fields.extra as unknown[]).map(extractComponentText).join('');
    }

    if (Array.isArray(fields.with)) {
      text += (fields.with as unknown[]).map(extractComponentText).join('');
    }

    return text;
  }

  return '';
}

export function parseChatToPlain(raw: unknown): string {
  return stripColorCodes(extractComponentText(raw));
}

export type ChatComponent = { text?: string; extra?: unknown[] } | string;

export function normalizeChatComponent(raw: unknown): ChatComponent {
  if (isNbtTag(raw)) {
    return normalizeChatComponent(simplifyIfNbt(raw));
  }

  if (typeof raw === 'string') {
    try {
      return normalizeChatComponent(JSON.parse(raw) as unknown);
    } catch {
      return raw;
    }
  }

  if (Array.isArray(raw)) {
    return { text: '', extra: raw };
  }

  if (typeof raw === 'object' && raw !== null) {
    return raw;
  }

  return '';
}

function extractSectionColor(text: string): string | null {
  const match = text.match(/[§\uFFFD]([0-9a-f])/i);
  if (!match) return null;
  return charToHex[match[1].toLowerCase()] ?? null;
}

export function extractTeamColor(
  prefix: unknown,
  colorField: unknown,
  rawName: string,
): string {
  const simplifiedPrefix = simplifyIfNbt(
    typeof prefix === 'string'
      ? (() => {
          try {
            return JSON.parse(prefix) as unknown;
          } catch {
            return prefix;
          }
        })()
      : prefix,
  );

  if (typeof simplifiedPrefix === 'object' && simplifiedPrefix !== null) {
    const componentColor = (simplifiedPrefix as Record<string, unknown>).color;

    if (typeof componentColor === 'string') {
      if (componentColor.startsWith('#')) return componentColor;

      const named = nameToHex[componentColor.toLowerCase()];
      if (named) return named;
    }
  }

  const prefixText =
    typeof simplifiedPrefix === 'string'
      ? simplifiedPrefix
      : extractComponentText(simplifiedPrefix);

  const fromPrefix = extractSectionColor(prefixText);
  if (fromPrefix !== null) return fromPrefix;

  if (typeof colorField === 'number' && colorField >= 0 && colorField <= 15) {
    return byteToHex[colorField] ?? '#AAAAAA';
  }

  if (typeof colorField === 'string') {
    const named = nameToHex[colorField.toLowerCase()];
    if (named) return named;
  }

  const fromName = extractSectionColor(rawName);
  if (fromName !== null) return fromName;

  return '#AAAAAA';
}

export function formatTeamName(teamId: string): string {
  const lower = teamId.toLowerCase();

  for (const colorName of Object.keys(nameToHex)) {
    if (lower.includes(colorName)) {
      return colorName.charAt(0).toUpperCase() + colorName.slice(1);
    }
  }

  return '';
}

export function isGameTeam(teamId: string): boolean {
  return formatTeamName(teamId) !== '';
}

export function isNPC(item: Record<string, unknown>): boolean {
  const gamemode = item.gamemode as number | undefined;
  if (typeof gamemode === 'number' && gamemode < 0) return true;

  const displayName = item.displayName;
  if (displayName !== undefined && displayName !== null) {
    if (extractComponentText(displayName).includes('[NPC]')) return true;
  }

  return false;
}
