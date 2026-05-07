import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { _electron as electron } from 'playwright';

const PIKA_PLAYERS = [
  'voodootje0',
  'JustThiemo',
  'Arrly',
  '_Luanne',
  'Ehtne',
  'Darnly',
  'Vaitren',
  'tobin',
  'loxamy',
  'meoweys',
  'resuns',
  'izoo_',
  'Si1ent_',
  'Hiqhest',
  'IStayKittens',
];

const JARTEX_PLAYERS = [
  'Si1ent_',
  'Sandy07',
  'DARKpeveresh',
  'meelb',
  'Lexi58',
  'Faoloe',
  'Weeder',
  'Djim',
  'Stxrs',
  'bene_e',
  'JustThiemo',
  'iFlyYT',
  'voodootje0',
  'climbby',
  'IStayKittens',
];

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
];

const BASE_CONFIG_SEED = {
  activeColumns: ALL_COLUMNS,
  columnLabels: 'FULL',
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
};

const NICKS_SEED = {
  nicks: [{ id: 'showcase-nick-1', nick: 'IStayKittens', realName: 'harshil_mc' }],
};

async function captureShowcase(
  players: string[],
  configSeed: Record<string, unknown>,
  outputFilename: string,
): Promise<void> {
  const mainEntry = path.join(__dirname, '..', 'out', 'main', 'index.js');

  const app = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '0',
    },
  });

  try {
    const page = await app.firstWindow();

    await app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win.setContentSize(1400, 800);
    });

    await page.evaluate(
      ({ cfg, nicks }) => {
        localStorage.setItem('thebois-config', JSON.stringify(cfg));
        localStorage.setItem('nicks', JSON.stringify(nicks));
        localStorage.setItem('skip-loading', '1');
      },
      { cfg: configSeed, nicks: NICKS_SEED },
    );

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('header', { timeout: 15_000 });

    await page.waitForFunction(() => (window as any).__pinia !== undefined, {
      timeout: 10000,
    });

    await page.evaluate(() => {
      const pinia = (window as any).__pinia;
      const state = pinia.state?.value;
      if (state?.players) state.players.logPathValid = null;
    });

    const network = (configSeed.network as string) ?? 'pikanetwork';

    await page.evaluate(
      async ({ names, net }: { names: string[]; net: string }) => {
        const pinia = (window as any).__pinia;
        if (!pinia) throw new Error('[showcase] window.__pinia not found');
        const state = pinia.state?.value;
        const api = net === 'jartexnetwork' ? window.api.jartex : window.api.pika;

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
          });
        }

        await Promise.allSettled(
          names.map(async (username, i) => {
            await new Promise((r) => setTimeout(r, i * 350));

            try {
              const result = await api.fetch(username, 'total', 'ALL_MODES');
              const idx = state.players.players.findIndex(
                (p: any) => p.realName.toLowerCase() === username.toLowerCase(),
              );
              if (idx === -1) return;

              const p = state.players.players[idx];
              if (result.notFound) {
                p.nicked = true;
                if (!p.profile && !p.stats) p.error = 'not_found';
              } else if (result.rateLimit) {
                p.error = 'rate_limited';
              } else {
                p.profile = result.profile;
                p.stats = result.stats;
                const apiName = (result.profile as any)?.username;
                if (apiName) {
                  p.name = apiName;
                  p.realName = apiName;
                }
              }
              p.loading = false;
            } catch {
              const idx = state.players.players.findIndex(
                (p: any) => p.realName.toLowerCase() === username.toLowerCase(),
              );
              if (idx !== -1) {
                state.players.players[idx].loading = false;
                state.players.players[idx].error = 'network';
              }
            }
          }),
        );
      },
      { names: players, net: network },
    );

    await page.waitForFunction(
      (count) => {
        const rows = document.querySelectorAll('tbody tr');
        return rows.length >= count;
      },
      players.length,
      { timeout: 10_000 },
    );

    await page.waitForTimeout(800);

    await app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win.setContentSize(2000, 800);
    });

    await page.waitForTimeout(300);

    const { contentW, contentH } = await page.evaluate(
      (): { contentW: number; contentH: number } => {
        const titleBar = document.querySelector('header')?.offsetHeight ?? 42;
        const thead = document.querySelector('thead') as HTMLElement | null;
        const tbody = document.querySelector('tbody') as HTMLElement | null;
        const footer = document.querySelector('.border-t') as HTMLElement | null;

        const theadH = thead?.offsetHeight ?? 35;
        const tbodyH = tbody?.scrollHeight ?? 0;
        const footerH = footer?.offsetHeight ?? 34;

        const w = document.body.scrollWidth;

        return {
          contentW: w,
          contentH: titleBar + theadH + tbodyH + footerH + 20,
        };
      },
    );

    await app.evaluate(
      ({ BrowserWindow }, { w, h }) => {
        const [win] = BrowserWindow.getAllWindows();
        win.setContentSize(w, h);
      },
      { w: contentW, h: contentH },
    );

    await page.waitForTimeout(400);

    const outDir = path.join(__dirname, '..', 'assets');
    fs.mkdirSync(outDir, { recursive: true });

    await page.screenshot({
      path: path.join(outDir, outputFilename),
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: contentW,
        height: contentH,
      },
    });
  } finally {
    await app.close();
  }
}

test.setTimeout(180_000);

test('capture pika showcase', async () => {
  await captureShowcase(
    PIKA_PLAYERS,
    { ...BASE_CONFIG_SEED, network: 'pikanetwork' },
    'showcase-pika.png',
  );
});

test('capture jartex showcase', async () => {
  await captureShowcase(
    JARTEX_PLAYERS,
    { ...BASE_CONFIG_SEED, network: 'jartexnetwork' },
    'showcase-jartex.png',
  );
});
