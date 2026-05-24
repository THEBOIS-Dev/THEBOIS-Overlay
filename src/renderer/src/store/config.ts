import { defineStore } from 'pinia';
import type { PiniaPluginContext } from 'pinia';
import 'pinia-plugin-persistedstate';
import { DEFAULT_PALETTE_ID, getPalette } from '@renderer/palettes';
import {
  Column,
  type BedwarsMode,
  type Interval,
  type LogFilePreset,
  type Network,
} from '@renderer/types';

export type GradientStop = { color: string; position: number };
export type BgType = 'solid' | 'gradient' | 'image';
export type GradientDirection =
  | 'to right'
  | 'to left'
  | 'to bottom'
  | 'to top'
  | 'to bottom right'
  | 'to bottom left'
  | 'to top right'
  | 'to top left'
  | string;

export interface ThemeColors {
  accent: string;
  accentLight: string;
  border: string;
  ink1: string;
  ink2: string;
  ink3: string;
  nick: string;
  good: string;
  bad: string;
  rankOwner: string;
  rankDeveloper: string;
  rankManager: string;
  rankAdmin: string;
  rankSrmod: string;
  rankModerator: string;
  rankHelper: string;
  rankTrial: string;
  rankYoutuber: string;
  rankChampion: string;
  rankTitan: string;
  rankElite: string;
  rankVip: string;
}

export interface ThemeConfig {
  bgType: BgType;
  bgColor: string;
  bgGradientStops: GradientStop[];
  bgGradientDir: GradientDirection;
  bgImageUrl: string;
  bgImageOpacity: number;
  opacity: number;
  colors: ThemeColors;
  dynamicColors: boolean;
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  accent: '#f97316',
  accentLight: '#fdba74',
  border: 'rgba(249,115,22,0.16)',
  ink1: '#fff3e8',
  ink2: '#b08060',
  ink3: '#6b4a2c',
  nick: '#fde68a',
  good: '#34d399',
  bad: '#f87171',
  rankOwner: '#ff4d6d',
  rankDeveloper: '#a855f7',
  rankManager: '#ec4899',
  rankAdmin: '#ef4444',
  rankSrmod: '#f97316',
  rankModerator: '#eab308',
  rankHelper: '#22c55e',
  rankTrial: '#06b6d4',
  rankYoutuber: '#ff0000',
  rankChampion: '#3b82f6',
  rankTitan: '#8b5cf6',
  rankElite: '#14b8a6',
  rankVip: '#facc15',
};

export const DEFAULT_THEME: ThemeConfig = {
  bgType: 'solid',
  bgColor: '#0b0704',
  bgGradientStops: [
    { color: '#f97316', position: 0 },
    { color: '#0b0704', position: 100 },
  ],
  bgGradientDir: 'to bottom right',
  bgImageUrl: '',
  bgImageOpacity: 0.3,
  opacity: 0.92,
  colors: { ...DEFAULT_THEME_COLORS },
  dynamicColors: false,
};

export interface ConfigState {
  network: Network;
  logFilePath: string;
  logFilePathPreset: LogFilePreset;
  fontSize: number;
  opacity: number;
  roundedCorners: boolean;
  activeColumns: Column[];
  sortBy: Column;
  sortAscending: boolean;
  interval: Interval;
  mode: BedwarsMode;
  columnLabels: 'FULL' | 'SHORT' | 'HIDDEN';
  textShadow: boolean;
  integratedMode: boolean;
  autoAddPlayers: boolean;
  autoRemoveAllOnServerChange: boolean;
  autoRemoveAllOnWho: boolean;
  autoRemoveFinalDeath: boolean;
  autoRemoveOnQuit: boolean;
  missingPlayersWarning: boolean;
  shortcutMinimize: string;
  shortcutClearPlayers: string;
  discordRpcEnabled: boolean;
  autoUpdateEnabled: boolean;
  theme: ThemeConfig;
  paletteId: string;
  lowEndMode: boolean;
  pikaProxyPort: number;
  jartexProxyPort: number;
  autoDetectNetwork: boolean;
  proxyBindHost: '0.0.0.0' | '127.0.0.1';
  proxyBannerDismissed: boolean;
}

const DEFAULT_COLUMNS: Column[] = [
  Column.NAME,
  Column.LEVEL,
  Column.WINS,
  Column.KILLS,
  Column.FINAL_KILLS,
  Column.FKDR,
  Column.WLR,
  Column.WIN_STREAK,
];

const CONFIG_VERSION = 4;

interface ConfigMigration {
  keys: (keyof ConfigState)[];
}

const CONFIG_MIGRATIONS: Record<number, ConfigMigration> = {
  2: { keys: ['theme', 'fontSize', 'opacity', 'roundedCorners', 'textShadow'] },
  3: { keys: ['paletteId'] },
  4: { keys: ['lowEndMode'] },
};

const VALID_COLUMNS = new Set<string>(Object.values(Column));

type PresetPathKey = Exclude<LogFilePreset, 'CUSTOM' | 'LUNAR_CLIENT'>;

function buildPresetPaths(
  platform: string,
  appData: string,
  home: string,
): Record<PresetPathKey, string> {
  if (platform === 'win32') {
    return {
      STANDARD: `${appData}/.minecraft/logs/latest.log`,
      TLAUNCHER: `${appData}/.minecraft/logs/latest.log`,
      BADLION_CLIENT: `${appData}/.minecraft/logs/blclient/minecraft/latest.log`,
      SILENT_CLIENT: `${appData}/.mc/logs/latest.log`,
      FEATHER_CLIENT: `${appData}/.minecraft/feather/logs/latest.log`,
      CM_CLIENT: `${appData}/.cmclient/logs/latest.log`,
      SK_CLIENT: `${appData}/.minecraft/logs/latest.log`,
      SALWYRR: `${appData}/.salwyrr/logs/latest.log`,
      PVPLOUNGE: `${appData}/.pvplounge/logs/latest.log`,
    };
  }

  if (platform === 'darwin') {
    return {
      STANDARD: `${appData}/minecraft/logs/latest.log`,
      TLAUNCHER: `${appData}/minecraft/logs/latest.log`,
      BADLION_CLIENT: `${appData}/minecraft/logs/blclient/minecraft/latest.log`,
      SILENT_CLIENT: `${home}/.mc/logs/latest.log`,
      FEATHER_CLIENT: `${appData}/minecraft/feather/logs/latest.log`,
      CM_CLIENT: `${home}/.cmclient/logs/latest.log`,
      SK_CLIENT: `${appData}/minecraft/logs/latest.log`,
      SALWYRR: `${home}/.salwyrr/logs/latest.log`,
      PVPLOUNGE: `${appData}/pvplounge/logs/latest.log`,
    };
  }

  return {
    STANDARD: `${home}/.minecraft/logs/latest.log`,
    TLAUNCHER: `${home}/.minecraft/logs/latest.log`,
    BADLION_CLIENT: `${home}/.minecraft/logs/blclient/minecraft/latest.log`,
    SILENT_CLIENT: `${home}/.mc/logs/latest.log`,
    FEATHER_CLIENT: `${home}/.minecraft/feather/logs/latest.log`,
    CM_CLIENT: `${home}/.cmclient/logs/latest.log`,
    SK_CLIENT: `${home}/.minecraft/logs/latest.log`,
    SALWYRR: `${home}/.salwyrr/logs/latest.log`,
    PVPLOUNGE: `${home}/.pvplounge/logs/latest.log`,
  };
}

function makeDefaultState(): ConfigState {
  return {
    network: 'pikanetwork',
    logFilePath: '',
    logFilePathPreset: 'STANDARD',
    fontSize: 15,
    opacity: 0.92,
    roundedCorners: true,
    activeColumns: DEFAULT_COLUMNS,
    sortBy: Column.NAME,
    sortAscending: false,
    interval: 'total',
    mode: 'ALL_MODES',
    columnLabels: 'FULL',
    textShadow: false,
    integratedMode: false,
    autoAddPlayers: true,
    autoRemoveAllOnServerChange: false,
    autoRemoveAllOnWho: true,
    autoRemoveFinalDeath: true,
    autoRemoveOnQuit: true,
    missingPlayersWarning: true,
    shortcutMinimize: '',
    shortcutClearPlayers: '',
    discordRpcEnabled: false,
    autoUpdateEnabled: true,
    theme: { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME_COLORS } },
    paletteId: DEFAULT_PALETTE_ID,
    lowEndMode: false,
    pikaProxyPort: 25566,
    jartexProxyPort: 25567,
    autoDetectNetwork: true,
    proxyBindHost: '127.0.0.1',
    proxyBannerDismissed: false,
  };
}

export const useConfigStore = defineStore('config', {
  state: makeDefaultState,

  getters: {
    bgColor(state): string {
      const t = state.theme;
      if (t.bgType === 'gradient') {
        const stops = t.bgGradientStops
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((s) => `${s.color} ${s.position}%`)
          .join(', ');
        return `linear-gradient(${t.bgGradientDir}, ${stops})`;
      }
      if (t.bgType === 'image') {
        return 'rgb(6,9,20)';
      }
      const hex = t.bgColor.replace('#', '').slice(0, 6).padEnd(6, '0');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgb(${r},${g},${b})`;
    },
  },

  actions: {
    applyPalette(id: string): void {
      const palette = getPalette(id);
      if (!palette) return;
      this.paletteId = id;
      this.theme.bgColor = palette.bg;
      this.theme.bgType = 'solid';
      this.theme.colors = { ...palette.colors };
      this.theme.dynamicColors = false;
    },

    resetTheme(): void {
      this.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME_COLORS } };
      this.paletteId = DEFAULT_PALETTE_ID;
    },

    async findLunarLogPath(): Promise<string> {
      return window.api.app.findLunarLog();
    },

    async setLogFilePathFromPreset(preset: LogFilePreset): Promise<void> {
      this.logFilePathPreset = preset;
      if (preset === 'CUSTOM') return;
      if (preset === 'LUNAR_CLIENT') {
        this.logFilePath = await this.findLunarLogPath();
        return;
      }

      const platform = window.api.platform;
      const [appData, home] = await Promise.all([
        window.api.app.getPath('appData'),
        window.api.app.getPath('home'),
      ]);

      const paths = buildPresetPaths(platform, appData, home);
      this.logFilePath = paths[preset as PresetPathKey];
    },
  },

  persist: {
    key: 'thebois-config',
    storage: localStorage,
    afterHydrate: (ctx: PiniaPluginContext) => {
      const storedVersion = parseInt(
        localStorage.getItem('thebois-config-version') ?? '0',
        10,
      );

      if (storedVersion < CONFIG_VERSION) {
        const defaults = makeDefaultState();
        for (let v = storedVersion + 1; v <= CONFIG_VERSION; v++) {
          const migration = CONFIG_MIGRATIONS[v];
          if (migration) {
            for (const key of migration.keys) {
              (ctx.store as Record<string, unknown>)[key] = (
                defaults as Record<string, unknown>
              )[key];
            }
          }
        }
        localStorage.setItem('thebois-config-version', String(CONFIG_VERSION));
      }

      const cols = ctx.store.activeColumns;
      const valid = Array.isArray(cols)
        ? (cols as string[]).filter((c) => VALID_COLUMNS.has(c))
        : [];
      ctx.store.activeColumns = valid.length > 0 ? valid : DEFAULT_COLUMNS;

      if (!ctx.store.theme?.colors) {
        ctx.store.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME_COLORS } };
      } else {
        ctx.store.theme.colors = { ...DEFAULT_THEME_COLORS, ...ctx.store.theme.colors };
      }

      if (ctx.store.theme.dynamicColors === undefined) {
        ctx.store.theme.dynamicColors = false;
      }

      if (!ctx.store.paletteId) {
        ctx.store.paletteId = DEFAULT_PALETTE_ID;
      }

      if (!ctx.store.network) {
        ctx.store.network = 'pikanetwork';
      }

      if (!ctx.store.pikaProxyPort) ctx.store.pikaProxyPort = 25566;
      if (!ctx.store.jartexProxyPort) ctx.store.jartexProxyPort = 25567;
      if (ctx.store.autoDetectNetwork === undefined) ctx.store.autoDetectNetwork = true;
      if (!ctx.store.proxyBindHost) ctx.store.proxyBindHost = '127.0.0.1';
      if (ctx.store.proxyBannerDismissed === undefined)
        ctx.store.proxyBannerDismissed = false;

      if (ctx.store.lowEndMode === undefined) ctx.store.lowEndMode = false;
    },
  },
});
