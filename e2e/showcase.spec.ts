import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { _electron as electron } from 'playwright';

const pika = [
  'voodootje0',
  'Arrly',
  'JustThiemo',
  '_Luanne',
  'Ehtne',
  'Darnly',
  'Vaitren',
  'tobin',
  'Climbby',
  'meoweys',
  'resuns',
  'izoo_',
  'Si1ent_',
  'Hiqhest',
  'IStayKittens',
];

const jartex = [
  'voodootje0',
  'iFlyYT',
  'JustThiemo',
  'bene_e',
  'Stxrs',
  'Djim',
  'Faoloe',
  'Climbby',
  'Lexi58',
  'Meelb',
  'DARKpeveresh',
  'Sandy07',
  'Si1ent_',
  'IStayKittens',
];

const columns = [
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

const base = {
  activeColumns: columns,
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
  autoDetectNetwork: false,
  pikaProxyPort: 25566,
  jartexProxyPort: 25567,
  proxyBindHost: '127.0.0.1',
  proxyBannerDismissed: true,
  paletteId: 'ember',
  theme: {
    bgType: 'solid',
    bgColor: '#130508',
    bgGradientStops: [
      { color: '#ff2d55', position: 0 },
      { color: '#130508', position: 100 },
    ],
    bgGradientDir: 'to bottom right',
    bgImageUrl: '',
    bgImageOpacity: 0.3,
    opacity: 1,
    dynamicColors: false,
    colors: {
      accent: '#ff2d55',
      accentLight: '#ff5c7c',
      border: '#3a1523',
      ink1: '#ffe9ef',
      ink2: '#ff4d73',
      ink3: '#b87586',
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

const nicks = {
  nicks: [{ id: 'showcase-nick-1', nick: 'IStayKittens', realName: 'harshil_mc' }],
};

interface ShowcaseApiResult {
  notFound?: boolean;
  rateLimit?: boolean;
  profile?: Record<string, unknown> | null;
  stats?: unknown;
}

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

    const network = (configSeed.network as string) ?? 'pikanetwork';

    await page.evaluate(
      ({ cfg, nicks }) => {
        localStorage.setItem('kyra-config', JSON.stringify(cfg));
        localStorage.setItem('kyra-config-version', '4');
        localStorage.setItem('nicks', JSON.stringify(nicks));
        localStorage.setItem('skip-loading', '1');
        localStorage.setItem('skip-announcements', '1');
        localStorage.setItem('skip-remove-btn', '1');
      },
      { cfg: configSeed, nicks },
    );

    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('header', { timeout: 15_000 });

    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__pinia !== undefined,
      {
        timeout: 10000,
      },
    );

    await page.evaluate((net: string) => {
      const pinia = (window as unknown as Record<string, unknown>).__pinia as {
        state?: { value?: Record<string, unknown> };
      };
      const state = pinia.state?.value as
        Record<string, Record<string, unknown>> | undefined;
      if (!state) return;
      const playersState = state.players;
      if (playersState !== undefined) {
        playersState.logPathValid = null;
        playersState.proxyConnectedNetwork = net;
      }
    }, network);

    await page.evaluate(
      async ({ names, net }: { names: string[]; net: string }) => {
        const pinia = (window as unknown as Record<string, unknown>).__pinia as
          { state?: { value?: Record<string, unknown> } } | undefined;
        if (pinia === undefined) throw new Error('[showcase] window.__pinia not found');
        const state = pinia.state?.value as
          Record<string, Record<string, unknown>> | undefined;
        if (!state) throw new Error('[showcase] pinia state not found');
        const api = net === 'jartexnetwork' ? window.api.jartex : window.api.pika;

        for (const name of names) {
          (state.players.players as unknown[]).push({
            name,
            realName: name,
            uuid: null,
            loading: true,
            error: null,
            nicked: false,
            profile: null,
            stats: null,
            source: 'manual' as const,
            team: null,
            teamColor: null,
          });
        }

        await Promise.allSettled(
          names.map(async (username, i) => {
            await new Promise((r) => setTimeout(r, i * 350));

            try {
              const result = (await api.fetch(
                username,
                'total',
                'ALL_MODES',
              )) as ShowcaseApiResult;
              const playerList = state.players.players as Array<Record<string, unknown>>;
              const idx = playerList.findIndex(
                (p) => (p.realName as string).toLowerCase() === username.toLowerCase(),
              );
              if (idx === -1) return;

              const p = playerList[idx];
              if (result.notFound) {
                p.nicked = true;
                if (p.profile === null && p.stats === null) p.error = 'not_found';
              } else if (result.rateLimit) {
                p.error = 'rate_limited';
              } else {
                p.profile = result.profile;
                p.stats = result.stats;
                const apiName =
                  typeof result.profile === 'object' && result.profile !== null
                    ? (result.profile.username as string | undefined)
                    : undefined;
                if (typeof apiName === 'string' && apiName.length > 0) {
                  p.name = apiName;
                  p.realName = apiName;
                }
              }
              p.loading = false;
            } catch {
              const playerList = state.players.players as Array<Record<string, unknown>>;
              const idx = playerList.findIndex(
                (p) => (p.realName as string).toLowerCase() === username.toLowerCase(),
              );
              if (idx !== -1) {
                playerList[idx].loading = false;
                playerList[idx].error = 'network';
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

    const measured = await page.evaluate((): { contentW: number; contentH: number } => {
      const header = document.querySelector('header');
      const titleBar = header instanceof HTMLElement ? header.offsetHeight : 42;
      const thead = document.querySelector('thead');
      const tbody = document.querySelector('tbody');
      const footer = document.querySelector('.border-t');

      const theadH = thead instanceof HTMLElement ? thead.offsetHeight : 35;
      const tbodyH = tbody instanceof HTMLElement ? tbody.scrollHeight : 0;
      const footerH = footer instanceof HTMLElement ? footer.offsetHeight : 34;

      // Measure the table's natural content width (sum of whitespace-nowrap columns)
      // rather than body.scrollWidth which includes the over-expanded 2000px window.
      const table = document.querySelector('table') as HTMLElement | null;
      const w = table?.scrollWidth ?? document.body.scrollWidth;

      return {
        contentW: w,
        contentH: titleBar + theadH + tbodyH + footerH + 20,
      };
    });
    const { contentW, contentH } = measured;

    await app.evaluate(
      ({ BrowserWindow }, { w, h }) => {
        const [win] = BrowserWindow.getAllWindows();
        win.setContentSize(w, h);
      },
      { w: contentW, h: contentH },
    );

    await page.waitForTimeout(400);

    await page.addStyleTag({
      content: `
      ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
      * { scrollbar-width: none !important; }
      `,
    });

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
  await captureShowcase(pika, { ...base, network: 'pikanetwork' }, 'showcase-pika.png');
});

test('capture jartex showcase', async () => {
  await captureShowcase(
    jartex,
    { ...base, network: 'jartexnetwork' },
    'showcase-jartex.png',
  );
});
