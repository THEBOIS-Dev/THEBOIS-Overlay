import { defineStore } from 'pinia'
import { Column, type BedwarsMode, type Interval, type LogFilePreset } from '@renderer/types'

export type GradientStop = { color: string; position: number }
export type BgType = 'solid' | 'gradient' | 'image'
export type GradientDirection =
  | 'to right'
  | 'to left'
  | 'to bottom'
  | 'to top'
  | 'to bottom right'
  | 'to bottom left'
  | 'to top right'
  | 'to top left'
  | string

export interface ThemeColors {
  accent: string
  accentLight: string
  border: string
  ink1: string
  ink2: string
  ink3: string
  nick: string
  good: string
  bad: string
  rankOwner: string
  rankDeveloper: string
  rankManager: string
  rankAdmin: string
  rankSrmod: string
  rankModerator: string
  rankHelper: string
  rankTrial: string
  rankYoutuber: string
  rankChampion: string
  rankTitan: string
  rankElite: string
  rankVip: string
}

export interface ThemeConfig {
  bgType: BgType
  bgColor: string
  bgGradientStops: GradientStop[]
  bgGradientDir: GradientDirection
  bgImageUrl: string
  bgImageOpacity: number
  opacity: number
  colors: ThemeColors
}

export const DEFAULT_THEME_COLORS: ThemeColors = {
  accent: '#7c3aed',
  accentLight: '#b89aff',
  border: 'rgba(120,80,255,0.18)',
  ink1: '#e8e0ff',
  ink2: '#a89bc2',
  ink3: '#6b5e82',
  nick: '#fde68a',
  good: '#34d399',
  bad: '#f87171',
  rankOwner: '#BC4141',
  rankDeveloper: '#FF5555',
  rankManager: '#AA0000',
  rankAdmin: '#FF5555',
  rankSrmod: '#00AAAA',
  rankModerator: '#00AA00',
  rankHelper: '#5555FF',
  rankTrial: '#55FFFF',
  rankYoutuber: '#FF5555',
  rankChampion: '#FF5555',
  rankTitan: '#FFD700',
  rankElite: '#55FFFF',
  rankVip: '#55FF55',
}

export const DEFAULT_THEME: ThemeConfig = {
  bgType: 'solid',
  bgColor: '#06091400',
  bgGradientStops: [
    { color: '#7c3aed', position: 0 },
    { color: '#06091a', position: 100 },
  ],
  bgGradientDir: 'to bottom right',
  bgImageUrl: '',
  bgImageOpacity: 0.3,
  opacity: 0.92,
  colors: { ...DEFAULT_THEME_COLORS },
}

export interface ConfigState {
  logFilePath: string
  logFilePathPreset: LogFilePreset
  fontSize: number
  opacity: number
  roundedCorners: boolean
  activeColumns: Column[]
  sortBy: Column
  sortAscending: boolean
  interval: Interval
  mode: BedwarsMode
  columnLabels: 'FULL' | 'SHORT' | 'HIDDEN'
  textShadow: boolean
  integratedMode: boolean
  autoAddPlayers: boolean
  autoRemoveAllOnServerChange: boolean
  autoRemoveAllOnWho: boolean
  autoRemoveFinalDeath: boolean
  autoRemoveOnQuit: boolean
  missingPlayersWarning: boolean
  shortcutMinimize: string
  shortcutClearPlayers: string
  discordRpcEnabled: boolean
  autoUpdateEnabled: boolean
  theme: ThemeConfig
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
]

const VALID_COLUMNS = new Set<string>(Object.values(Column))

export const useConfigStore = defineStore('config', {
  state: (): ConfigState => ({
    logFilePath: '',
    logFilePathPreset: 'STANDARD',
    fontSize: 15,
    opacity: 0.92,
    roundedCorners: true,
    activeColumns: DEFAULT_COLUMNS,
    sortBy: Column.FKDR,
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
  }),

  getters: {
    bgColor(state): string {
      const t = state.theme
      if (t.bgType === 'gradient') {
        const stops = t.bgGradientStops
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((s) => `${s.color} ${s.position}%`)
          .join(', ')
        return `linear-gradient(${t.bgGradientDir}, ${stops})`
      }
      if (t.bgType === 'image') {
        return 'rgb(6,9,20)'
      }
      const hex = t.bgColor.replace('#', '').slice(0, 6).padEnd(6, '0')
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgb(${r},${g},${b})`
    },
  },

  actions: {
    resetTheme(): void {
      this.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME_COLORS } }
    },

    async findLunarLogPath(): Promise<string> {
      return window.api.app.findLunarLog()
    },

    async setLogFilePathFromPreset(preset: LogFilePreset): Promise<void> {
      this.logFilePathPreset = preset
      if (preset === 'CUSTOM') return
      if (preset === 'LUNAR_CLIENT') {
        this.logFilePath = await this.findLunarLogPath()
        return
      }
      const appData = await window.api.app.getPath('appData')
      const paths: Record<Exclude<LogFilePreset, 'CUSTOM'>, string> = {
        STANDARD: `${appData}/.minecraft/logs/latest.log`,
        TLAUNCHER: `${appData}/.minecraft/logs/latest.log`,
        BADLION_CLIENT: `${appData}/.minecraft/logs/blclient/minecraft/latest.log`,
        LUNAR_CLIENT: '',
        SILENT_CLIENT: `${appData}/.mc/logs/latest.log`,
        FEATHER_CLIENT: `${appData}/.minecraft/feather/logs/latest.log`,
        CM_CLIENT: `${appData}/.cmclient/logs/latest.log`,
        SK_CLIENT: `${appData}/.minecraft/logs/latest.log`,
        SALWYRR: `${appData}/.salwyrr/logs/latest.log`,
        PVPLOUNGE: `${appData}/.pvplounge/logs/latest.log`,
      }
      this.logFilePath = paths[preset]
    },
  },

  persist: {
    key: 'thebois-config',
    storage: localStorage,
    mergeDefaults: true,
    afterHydrate: (ctx) => {
      const cols = ctx.store.activeColumns
      const valid = Array.isArray(cols)
        ? (cols as string[]).filter((c) => VALID_COLUMNS.has(c))
        : []
      ctx.store.activeColumns = valid.length > 0 ? valid : DEFAULT_COLUMNS

      if (!ctx.store.theme?.colors) {
        ctx.store.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME_COLORS } }
      } else {
        ctx.store.theme.colors = { ...DEFAULT_THEME_COLORS, ...ctx.store.theme.colors }
      }
    },
  },
})