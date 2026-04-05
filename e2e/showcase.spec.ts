import { test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'

const PLAYERS = [
  'voodootje0',
  'JustThiemo',
  'Arrly',
  '_Luanne',
  'Sanivu',
  'arham19',
  'hxml',
  'Mefity',
  'loxamy',
  'Abdomen',
  'resuns',
  'izoo_',
  'Si1ent_',
  'Hiqhest',
  'IStayKittens',
]

const ALL_COLUMNS = [
  'NAME',
  'LEVEL',
  'FKDR',
  'WLR',
  'WINS',
  'LOSSES',
  'FINAL_KILLS',
  'FINAL_DEATHS',
  'KILLS',
  'DEATHS',
  'KDR',
  'BEDS_BROKEN',
  'BBLR',
  'WIN_STREAK',
  'PLAYED',
]

const CONFIG_SEED = {
  activeColumns: ALL_COLUMNS,
  columnLabels: 'SHORT',
  sortBy: 'NAME',
  sortAscending: true,
  interval: 'total',
  mode: 'ALL_MODES',
  integratedMode: false,
  missingPlayersWarning: false,
  fontSize: 18,
  roundedCorners: false,
  textShadow: true,
  theme: {
    bgType: 'solid',
    bgColor: '#06091400',
    bgGradientStops: [
      { color: '#7c3aed', position: 0 },
      { color: '#06091a', position: 100 },
    ],
    bgGradientDir: 'to bottom right',
    bgImageUrl: '',
    bgImageOpacity: 0.3,
    opacity: 1,
    colors: {
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
    },
  },
}

const NICKS_SEED = {
  nicks: [{ id: 'showcase-nick-1', nick: 'IStayKittens', realName: 'harshil_mc' }],
}

const STAT_COL_W = 65
const REMOVE_W = 36
const BUFFER = 4

test.setTimeout(180_000)

test('capture showcase', async () => {
  const mainEntry = path.join(__dirname, '..', 'out', 'main', 'index.js')

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '0',
    },
  })

  try {
    const page = await app.firstWindow()
    
    await app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows()
      win.setContentSize(1400, 800)
    })

    await page.evaluate(
      ({ cfg, nicks }) => {
        localStorage.setItem('thebois-config', JSON.stringify(cfg))
        localStorage.setItem('nicks', JSON.stringify(nicks))
      },
      { cfg: CONFIG_SEED, nicks: NICKS_SEED },
    )

    await page.reload({ waitUntil: 'domcontentloaded' })

    await page.waitForSelector('header', { timeout: 15_000 })

    await page.waitForFunction(() => (window as any).__pinia !== undefined, { timeout: 10000 })

    // Suppress the "log not configured" banner by setting logPathValid to null
    await page.evaluate(() => {
      const pinia = (window as any).__pinia
      const state = pinia.state?.value
      if (state?.players) state.players.logPathValid = null
    })

    await page.evaluate(async (names: string[]) => {
      const pinia = (window as any).__pinia
      if (!pinia) throw new Error('[showcase] window.__pinia not found')
      const state = pinia.state?.value

      for (const name of names) {
        state.players.players.push({
          name,
          realName: name,
          uuid: null,
          loading: true,
          error: null,
          nicked: false,
          profile: null,
          stats: null,
          source: 'manual' as const,
        })
      }

      await Promise.allSettled(
        names.map(async (username, i) => {
          await new Promise((r) => setTimeout(r, i * 350))

          try {
            const result = await window.api.pika.fetch(username, 'total', 'ALL_MODES')
            const idx = state.players.players.findIndex(
              (p: any) => p.realName.toLowerCase() === username.toLowerCase(),
            )
            if (idx === -1) return

            const p = state.players.players[idx]
            if (result.notFound) {
              p.nicked = true
              if (!p.profile && !p.stats) p.error = 'not_found'
            } else if (result.rateLimit) {
              p.error = 'rate_limited'
            } else {
              p.profile = result.profile
              p.stats = result.stats
              const apiName = (result.profile as any)?.username
              if (apiName) {
                p.name = apiName
                p.realName = apiName
              }
            }
            p.loading = false
          } catch {
            const idx = state.players.players.findIndex(
              (p: any) => p.realName.toLowerCase() === username.toLowerCase(),
            )
            if (idx !== -1) {
              state.players.players[idx].loading = false
              state.players.players[idx].error = 'network'
            }
          }
        }),
      )
    }, PLAYERS)

    await page.waitForFunction(
      (count) => {
        const rows = document.querySelectorAll('tbody tr')
        return rows.length >= count
      },
      PLAYERS.length,
      { timeout: 10_000 },
    )

    await page.waitForTimeout(800)

    const nameColPx = await page.evaluate((): number => {
      const th = document.querySelector('thead th:first-child')
      if (!th) return 260
      return Math.ceil(th.getBoundingClientRect().width)
    })

    const totalColumns = ALL_COLUMNS.length
    await page.evaluate(
      ({ cols, nameW }) => window.api.win.fitColumns(cols, nameW),
      { cols: totalColumns, nameW: nameColPx },
    )

    await page.waitForTimeout(300)

    const { contentW, contentH } = await page.evaluate((): { contentW: number; contentH: number } => {
      const titleBar = document.querySelector('header')?.offsetHeight ?? 42
      const thead = document.querySelector('thead') as HTMLElement | null
      const tbody = document.querySelector('tbody') as HTMLElement | null
      const footer = document.querySelector('.border-t') as HTMLElement | null
      const table = document.querySelector('table') as HTMLElement | null

      const theadH = thead?.offsetHeight ?? 35
      const tbodyH = tbody?.scrollHeight ?? 0
      const footerH = footer?.offsetHeight ?? 34
      const tableW = table?.scrollWidth ?? 0

      return {
        contentW: tableW,
        contentH: titleBar + theadH + tbodyH + footerH + 20,
      }
    })

    await app.evaluate(({ BrowserWindow }, { w, h }) => {
      const [win] = BrowserWindow.getAllWindows()
      win.setContentSize(w, h)
    }, { w: contentW, h: contentH })

    await page.waitForTimeout(400)

    const outDir = path.join(__dirname, '..', 'assets')
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, 'showcase.png')

    await page.screenshot({
      path: outPath,
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: contentW,
        height: contentH - 16,
      },
    })

    console.log(`Screenshot saved → ${outPath}`)
  } finally {
    await app.close()
  }
})
