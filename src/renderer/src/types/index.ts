export type Interval = 'total' | 'weekly' | 'monthly' | 'yearly'
export type BedwarsMode = 'ALL_MODES' | 'SOLO' | 'DOUBLES' | 'TRIPLES' | 'QUAD'

export interface PikaStatEntry {
  place?: number
  value: string | number
}

export interface PikaStatGroup {
  entries: PikaStatEntry[] | null
}

export interface PikaBedwarsStats {
  Wins?: PikaStatGroup
  Losses?: PikaStatGroup
  Kills?: PikaStatGroup
  Deaths?: PikaStatGroup
  'Final kills'?: PikaStatGroup
  'Final deaths'?: PikaStatGroup
  'Beds destroyed'?: PikaStatGroup
  'Highest winstreak reached'?: PikaStatGroup
  'Games played'?: PikaStatGroup
  'Bow kills'?: PikaStatGroup
  'Melee kills'?: PikaStatGroup
  'Void kills'?: PikaStatGroup
}

export interface PikaClan {
  name: string
  tag: string
  color?: string
}

export interface PikaLevelInfo {
  level: number
  experience: number
  percentage: number
  rankDisplay: string
}

export interface PikaRankEntry {
  name: string
  displayName: string
  server: string
  season: string | null
  expiry: number
}

export interface PikaProfile {
  username: string
  ranks: PikaRankEntry[]
  rank: PikaLevelInfo | null
  clan: PikaClan | null
  lastSeen?: number
  online?: boolean
}

export type PlayerSource = 'manual' | 'auto'
export type LogFilePreset =
  | 'STANDARD'
  | 'LUNAR_CLIENT'
  | 'TLAUNCHER'
  | 'SILENT_CLIENT'
  | 'FEATHER_CLIENT'
  | 'SK_CLIENT'
  | 'CM_CLIENT'
  | 'SALWYRR'
  | 'BADLION_CLIENT'
  | 'PVPLOUNGE'
  | 'CUSTOM'

export interface Player {
  name: string
  realName: string
  uuid: string | null
  loading: boolean
  error: 'not_found' | 'rate_limited' | 'network' | null
  nicked: boolean
  profile: PikaProfile | null
  stats: PikaBedwarsStats | null
  source: PlayerSource
}

export interface Nick {
  id: string
  nick: string
  realName: string
}

export enum Column {
  NAME = 'NAME',
  LEVEL = 'LEVEL',
  FKDR = 'FKDR',
  WLR = 'WLR',
  WINS = 'WINS',
  LOSSES = 'LOSSES',
  FINAL_KILLS = 'FINAL_KILLS',
  FINAL_DEATHS = 'FINAL_DEATHS',
  KILLS = 'KILLS',
  DEATHS = 'DEATHS',
  KDR = 'KDR',
  BEDS_BROKEN = 'BEDS_BROKEN',
  BBLR = 'BBLR',
  WIN_STREAK = 'WIN_STREAK',
  PLAYED = 'PLAYED',
}

export function statVal(group?: PikaStatGroup | null): number {
  const raw = group?.entries?.[0]?.value
  if (raw === undefined || raw === null) return 0
  return typeof raw === 'number' ? raw : Number(raw) || 0
}

export function ratio(a: number, b: number): number {
  return b === 0 ? a : a / b
}

export function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

const RANK_PRIORITY: string[] = [
  'owner',
  'developer',
  'manager',
  'admin',
  'srmod',
  'moderator',
  'helper',
  'trial',
  'youtuber',
  'games4',
  'games3',
  'games2',
  'games1',
]

export function getRankSortIndex(profile: PikaProfile | null): number {
  if (!profile?.ranks?.length) return RANK_PRIORITY.length
  for (let i = 0; i < RANK_PRIORITY.length; i++) {
    if (profile.ranks.some((r) => r.name === RANK_PRIORITY[i])) return i
  }
  return RANK_PRIORITY.length
}

function getRankColorMap(): Record<string, string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useConfigStore } = require('@renderer/store/config')
    const c = useConfigStore().theme.colors
    return {
      owner: c.rankOwner,
      developer: c.rankDeveloper,
      manager: c.rankManager,
      admin: c.rankAdmin,
      srmod: c.rankSrmod,
      moderator: c.rankModerator,
      helper: c.rankHelper,
      trial: c.rankTrial,
      youtuber: c.rankYoutuber,
      games4: c.rankChampion,
      games3: c.rankTitan,
      games2: c.rankElite,
      games1: c.rankVip,
    }
  } catch {
    return {
      owner: '#BC4141',
      developer: '#FF5555',
      manager: '#AA0000',
      admin: '#FF5555',
      srmod: '#00AAAA',
      moderator: '#00AA00',
      helper: '#5555FF',
      trial: '#55FFFF',
      youtuber: '#FF5555',
      games4: '#FF5555',
      games3: '#FFD700',
      games2: '#55FFFF',
      games1: '#55FF55',
    }
  }
}

const STAFF_RANK_NAMES = new Set([
  'owner',
  'developer',
  'manager',
  'admin',
  'srmod',
  'moderator',
  'helper',
  'trial',
])

export function getTopRankName(profile: PikaProfile | null): string | null {
  if (!profile?.ranks?.length) return null
  for (const name of RANK_PRIORITY) {
    if (profile.ranks.some((r) => r.name === name)) return name
  }
  return null
}

export function getTopRankDisplay(profile: PikaProfile | null): string | null {
  if (!profile?.ranks?.length) return null
  for (const name of RANK_PRIORITY) {
    const entry = profile.ranks.find((r) => r.name === name)
    if (entry) return entry.displayName
  }
  return null
}

export function playerNameColor(profile: PikaProfile | null): string {
  const rankName = getTopRankName(profile)
  if (!rankName) return '#AAAAAA'
  return getRankColorMap()[rankName] ?? '#AAAAAA'
}

export function isStaff(profile: PikaProfile | null): boolean {
  if (!profile?.ranks?.length) return false
  return profile.ranks.some((r) => STAFF_RANK_NAMES.has(r.name))
}

export const STAT_COLORS = [
  '#4b5563',
  '#94a3b8',
  '#34d399',
  '#22d3ee',
  '#fbbf24',
  '#f97316',
  '#f87171',
  '#e879f9',
] as const

export function colorIndex(value: number, thresholds: readonly number[]): number {
  let idx = 0
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) idx = i
    else break
  }
  return idx
}

export function statColor(value: number, thresholds: readonly number[]): string {
  return STAT_COLORS[colorIndex(value, thresholds)]
}

export interface ColumnDef {
  label: string
  shortLabel: string
  sortable: boolean
  fromProfile?: boolean
  thresholds?: readonly number[]
  getNum?: (p: Player) => number
  getStr?: (p: Player) => string | null
  getColor?: (p: Player) => string
}

export function levelColor(level: number): string {
  if (level >= 200) return '#ff5555'
  if (level >= 160) return '#55ffff'
  if (level >= 120) return '#55ff55'
  if (level >= 100) return '#ff5555'
  if (level >= 75) return '#ffff55'
  if (level >= 60) return '#ffaa00'
  if (level >= 50) return '#ff55ff'
  if (level >= 45) return '#55ffff'
  if (level >= 40) return '#55ff55'
  if (level >= 35) return '#ffffff'
  if (level >= 30) return '#ff5555'
  if (level >= 25) return '#ffff55'
  if (level >= 20) return '#ffaa00'
  if (level >= 15) return '#ff55ff'
  if (level >= 10) return '#55ffff'
  if (level >= 5) return '#55ff55'
  return '#aaaaaa'
}

export const COLUMNS: Record<Column, ColumnDef> = {
  [Column.NAME]: {
    label: 'Name',
    shortLabel: 'N',
    sortable: true,
    getNum: (p) => getRankSortIndex(p.profile),
    getStr: (p) => p.realName || p.name,
  },
  [Column.LEVEL]: {
    label: 'Level',
    shortLabel: 'LVL',
    sortable: true,
    fromProfile: true,
    getNum: (p) => p.profile?.rank?.level ?? 0,
    getColor: (p) => levelColor(p.profile?.rank?.level ?? 0),
  },
  [Column.FKDR]: {
    label: 'FKDR',
    shortLabel: 'FK',
    sortable: true,
    thresholds: [0, 1, 2, 4, 7, 12, 20, 35],
    getNum: (p) => ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
  },
  [Column.WINS]: {
    label: 'Wins',
    shortLabel: 'W',
    sortable: true,
    thresholds: [0, 50, 200, 500, 1000, 2500, 5000, 10000],
    getNum: (p) => statVal(p.stats?.['Wins']),
  },
  [Column.LOSSES]: {
    label: 'Losses',
    shortLabel: 'L',
    sortable: true,
    getNum: (p) => statVal(p.stats?.['Losses']),
  },
  [Column.WLR]: {
    label: 'WLR',
    shortLabel: 'WL',
    sortable: true,
    thresholds: [0, 0.5, 1, 2, 3.5, 5, 8, 12],
    getNum: (p) => ratio(statVal(p.stats?.['Wins']), statVal(p.stats?.['Losses'])),
  },
  [Column.FINAL_KILLS]: {
    label: 'FK',
    shortLabel: 'FK',
    sortable: true,
    thresholds: [0, 100, 500, 1500, 3000, 7500, 15000, 30000],
    getNum: (p) => statVal(p.stats?.['Final kills']),
  },
  [Column.FINAL_DEATHS]: {
    label: 'FD',
    shortLabel: 'FD',
    sortable: true,
    getNum: (p) => statVal(p.stats?.['Final deaths']),
  },
  [Column.KILLS]: {
    label: 'Kills',
    shortLabel: 'K',
    sortable: true,
    thresholds: [0, 200, 1000, 3000, 7500, 15000, 30000, 60000],
    getNum: (p) => statVal(p.stats?.['Kills']),
  },
  [Column.DEATHS]: {
    label: 'Deaths',
    shortLabel: 'D',
    sortable: true,
    getNum: (p) => statVal(p.stats?.['Deaths']),
  },
  [Column.KDR]: {
    label: 'KDR',
    shortLabel: 'KD',
    sortable: true,
    thresholds: [0, 1, 2, 4, 7, 12, 20, 35],
    getNum: (p) => ratio(statVal(p.stats?.['Kills']), statVal(p.stats?.['Deaths'])),
  },
  [Column.BEDS_BROKEN]: {
    label: 'BB',
    shortLabel: 'BB',
    sortable: true,
    thresholds: [0, 50, 200, 500, 1200, 2500, 5000, 10000],
    getNum: (p) => statVal(p.stats?.['Beds destroyed']),
  },
  [Column.BBLR]: {
    label: 'BBLR',
    shortLabel: 'BB',
    sortable: true,
    thresholds: [0, 0.5, 1, 2, 3.5, 5, 8, 12],
    getNum: (p) => ratio(statVal(p.stats?.['Beds destroyed']), statVal(p.stats?.['Losses'])),
  },
  [Column.WIN_STREAK]: {
    label: 'WS',
    shortLabel: 'WS',
    sortable: true,
    thresholds: [0, 3, 7, 15, 30, 50, 80, 120],
    getNum: (p) => statVal(p.stats?.['Highest winstreak reached']),
  },
  [Column.PLAYED]: {
    label: 'Played',
    shortLabel: 'GP',
    sortable: true,
    thresholds: [0, 100, 500, 1500, 3000, 7000, 15000, 30000],
    getNum: (p) => statVal(p.stats?.['Games played']),
  },
}

export function rankColor(_rank?: string | null): string {
  return '#475569'
}

declare global {
  interface Window {
    api: {
      pika: {
        fetch(
          username: string,
          interval?: string,
          mode?: string,
        ): Promise<{
          profile: PikaProfile | null
          stats: PikaBedwarsStats | null
          notFound?: boolean
          rateLimit?: boolean
        }>
        stats(username: string, interval: string, mode: string): Promise<PikaBedwarsStats | null>
      }
      win: {
        minimize(): void
        close(): void
        toggleMinimize(): void
        openExternal(url: string): void
        screenshot(): Promise<void>
        fitColumns(numColumns: number, nameColPx: number): void
        setIgnoreMouse(ignore: boolean): void
        focus(): void
      }
      app: {
        getPath(name: string): Promise<string>
        findLunarLog(): Promise<string>
        openImageDialog(): Promise<Electron.OpenDialogReturnValue>
        readFileBase64(filePath: string): Promise<string>
        onClearPlayers(cb: () => void): () => void
      }
      log: {
        setPath(path: string | null): void
        checkPath(path: string): Promise<boolean>
        openDialog(): Promise<{ canceled: boolean; filePaths: string[] }>
        onLine(cb: (line: string) => void): () => void
      }
      shortcuts: {
        register(shortcuts: string[]): Promise<void>
        onFired(cb: (shortcut: string) => void): () => void
      }
      rpc: {
        init(): Promise<void>
        setEnabled(enabled: boolean): void
        setActive(active: boolean): void
        destroy(): void
      }
      updater: {
        check(): void
        install(): void
        onStatus(
          cb: (payload: {
            status: string
            version?: string
            percent?: number
            error?: string
          }) => void,
        ): () => void
      }
    }
  }
}
