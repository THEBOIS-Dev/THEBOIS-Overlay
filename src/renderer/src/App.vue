<script setup lang="ts">
import AnnouncementModal from '@renderer/components/AnnouncementModal.vue';
import LoadingScreen from '@renderer/components/LoadingScreen.vue';
import PremiumSignInModal from '@renderer/components/PremiumSignInModal.vue';
import TitleBar from '@renderer/components/TitleBar.vue';
import { parseLine } from '@renderer/composables/useLogParser';
import { useAnnouncements } from '@renderer/composables/useAnnouncements';
import { usePremiumAuth } from '@renderer/composables/usePremiumAuth';
import { useConfigStore } from '@renderer/store/config';
import type { ThemeColors } from '@renderer/store/config';
import { useNicksStore } from '@renderer/store/nicks';
import { usePlayersStore } from '@renderer/store/players';
import type { ProxyEventPayload } from '@renderer/types';
import { onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const config = useConfigStore();
const players = usePlayersStore();
const nicks = useNicksStore();
const router = useRouter();

document.documentElement.classList.toggle('low-end', config.lowEndMode);
watch(
  () => config.lowEndMode,
  (val) => {
    document.documentElement.classList.toggle('low-end', val);
  },
);

function handleVisibilityChange(): void {
  document.documentElement.style.setProperty(
    '--anim-play-state',
    document.hidden ? 'paused' : 'running',
  );
}

const { activeAnnouncement, fetchAnnouncements, dismissActive } = useAnnouncements();

const {
  active: activePremiumAuth,
  handleProxyAuthEvent,
  dismiss: dismissPremiumAuth,
} = usePremiumAuth();

const isLinux = window.api.platform === 'linux';

const SKIP_LOADING = localStorage.getItem('skip-loading') === '1';
const SKIP_ANNOUNCEMENTS = localStorage.getItem('skip-announcements') === '1';

const loadingDone = ref(SKIP_LOADING);
const appVisible = ref(SKIP_LOADING);

function onLoadingDone(): void {
  loadingDone.value = true;

  requestAnimationFrame(() => {
    appVisible.value = true;
  });

  if (!SKIP_ANNOUNCEMENTS) {
    void fetchAnnouncements();
  }
}

let currentlyIgnoring = false;

const headerHovered = ref(false);
const dropdownOpen = ref(false);

provide('headerHovered', headerHovered);
provide('dropdownOpen', dropdownOpen);

const HEADER_HEIGHT = 42;
const RESIZE_EDGE_PX = 6;

function setIgnore(ignore: boolean): void {
  if (currentlyIgnoring === ignore) return;

  currentlyIgnoring = ignore;
  window.api.win.setIgnoreMouse(ignore);
}

function isOnResizeEdge(e: MouseEvent): boolean {
  const x = e.clientX;
  const y = e.clientY;
  const w = window.innerWidth;
  const h = window.innerHeight;

  return (
    x <= RESIZE_EDGE_PX ||
    x >= w - RESIZE_EDGE_PX ||
    y <= RESIZE_EDGE_PX ||
    y >= h - RESIZE_EDGE_PX
  );
}

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, label, [role="button"], [tabindex="0"]';

function isScrollable(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;

  while (node && node !== document.documentElement) {
    const style = window.getComputedStyle(node);

    const oy = style.overflowY;
    const ox = style.overflowX;

    if (
      ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) ||
      ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth)
    ) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function updateResizeCursor(e: MouseEvent): void {
  const x = e.clientX;
  const y = e.clientY;

  const w = window.innerWidth;
  const h = window.innerHeight;

  const onL = x <= RESIZE_EDGE_PX;
  const onR = x >= w - RESIZE_EDGE_PX;
  const onT = y <= RESIZE_EDGE_PX;
  const onB = y >= h - RESIZE_EDGE_PX;

  let cursor = '';

  if (onT && onL) cursor = 'nw-resize';
  else if (onT && onR) cursor = 'ne-resize';
  else if (onB && onL) cursor = 'sw-resize';
  else if (onB && onR) cursor = 'se-resize';
  else if (onT) cursor = 'n-resize';
  else if (onB) cursor = 's-resize';
  else if (onL) cursor = 'w-resize';
  else if (onR) cursor = 'e-resize';

  document.documentElement.style.cursor = cursor;
}

function onMouseMove(e: MouseEvent): void {
  if (isOnResizeEdge(e)) {
    setIgnore(false);
    updateResizeCursor(e);
    return;
  }

  document.documentElement.style.cursor = '';

  headerHovered.value = e.clientY <= HEADER_HEIGHT || dropdownOpen.value;

  if (isLinux) return;

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;

  if (!target || target === document.documentElement || target === document.body) {
    if (dropdownOpen.value) {
      setIgnore(false);
      return;
    }

    setIgnore(true);
    return;
  }

  if (dropdownOpen.value) {
    setIgnore(false);
    return;
  }

  if (config.integratedMode && e.clientY <= HEADER_HEIGHT) {
    setIgnore(false);
    return;
  }

  const hit =
    target.closest(INTERACTIVE_SELECTOR) ||
    target.closest('.no-drag') ||
    target.closest('.btn') ||
    target.closest('.cursor-pointer') ||
    isScrollable(target);

  setIgnore(!hit);
}

function onMouseLeave(): void {
  if (dropdownOpen.value) return;

  headerHovered.value = false;

  document.documentElement.style.cursor = '';

  setIgnore(true);
}

function onMouseEnter(): void {
  setIgnore(false);
}

const RANK_KEYS = [
  'rankOwner',
  'rankDeveloper',
  'rankManager',
  'rankAdmin',
  'rankSrmod',
  'rankModerator',
  'rankHelper',
  'rankTrial',
  'rankYoutuber',
  'rankChampion',
  'rankTitan',
  'rankElite',
  'rankVip',
] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').slice(0, 6).padEnd(6, '0');

  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  let h = 0;
  let s = 0;

  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;

    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;

      case g:
        h = (b - r) / d + 2;
        break;

      default:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);

  const f = (n: number): number => {
    const k = (n + h / 30) % 12;

    return 255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1));
  };

  return rgbToHex(f(0), f(8), f(4));
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);

  return `rgba(${r},${g},${b},${alpha})`;
}

function mix(hexA: string, hexB: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);

  return rgbToHex(
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  );
}

function getBackgroundBase(theme: import('@renderer/store/config').ThemeConfig): string {
  if (theme.bgType === 'gradient' && theme.bgGradientStops.length) {
    const sorted = [...theme.bgGradientStops].sort((a, b) => a.position - b.position);

    return sorted[0].color;
  }

  if (theme.bgType === 'image') {
    return '#0b0f19';
  }

  return theme.bgColor;
}

function deriveDynamicColors(
  theme: import('@renderer/store/config').ThemeConfig,
): ThemeColors {
  const bg = getBackgroundBase(theme);

  const [h, s, l] = hexToHsl(bg);

  const isDark = l < 45;
  const isVeryDark = l < 18;
  const isLight = l > 72;

  const accent = isLight
    ? hslToHex(h, Math.max(s, 58), 42)
    : hslToHex(h, Math.max(s, 62), clamp(l + 18, 52, 68));

  const accentLight = isLight
    ? hslToHex(h, Math.max(s - 6, 48), 56)
    : hslToHex(h, Math.max(s - 4, 54), clamp(l + 30, 66, 82));

  const ink1 = isDark
    ? hslToHex(h, Math.min(s, 12), 96)
    : hslToHex(h, Math.min(s, 18), 10);

  const ink2 = isDark
    ? hslToHex(h, Math.min(s, 10), 72)
    : hslToHex(h, Math.min(s, 14), 34);

  const ink3 = isDark
    ? hslToHex(h, Math.min(s, 8), 52)
    : hslToHex(h, Math.min(s, 10), 52);

  const border = isVeryDark
    ? 'rgba(255,255,255,0.08)'
    : isDark
      ? rgba(mix(bg, '#ffffff', 0.35), 0.18)
      : rgba(mix(bg, '#000000', 0.45), 0.14);

  const good = isDark ? '#4ade80' : '#16a34a';
  const bad = isDark ? '#fb7185' : '#dc2626';

  const nick = isDark
    ? hslToHex((h + 18) % 360, Math.max(s, 72), 76)
    : hslToHex((h + 18) % 360, Math.max(s, 72), 42);

  const rankOverrides = Object.fromEntries(
    RANK_KEYS.map((key, i) => [key, hslToHex((h + i * 24) % 360, 78, isDark ? 68 : 46)]),
  ) as Pick<ThemeColors, (typeof RANK_KEYS)[number]>;

  return {
    ...theme.colors,
    accent,
    accentLight,
    border,
    ink1,
    ink2,
    ink3,
    nick,
    good,
    bad,
    ...rankOverrides,
  };
}

function applyThemeVars(): void {
  const theme = config.theme;

  const colors: ThemeColors = theme.dynamicColors
    ? deriveDynamicColors(theme)
    : theme.colors;

  const root = document.documentElement.style;

  const bgBase = getBackgroundBase(theme);
  const [br, bg_, bb] = hexToRgb(bgBase);
  root.setProperty('--color-bg', bgBase);
  root.setProperty('--color-bg-rgb', `${br},${bg_},${bb}`);

  root.setProperty('--color-accent', colors.accent);
  root.setProperty('--color-accent-light', colors.accentLight);
  root.setProperty('--color-border', colors.border);

  root.setProperty('--color-ink-1', colors.ink1);
  root.setProperty('--color-ink-2', colors.ink2);
  root.setProperty('--color-ink-3', colors.ink3);

  root.setProperty('--color-nick', colors.nick);
  root.setProperty('--color-good', colors.good);
  root.setProperty('--color-bad', colors.bad);

  const [r, g, b] = hexToRgb(colors.accent);

  root.setProperty('--color-accent-rgb', `${r},${g},${b}`);
  root.setProperty('--color-accent-dim', `rgba(${r},${g},${b},0.12)`);
  root.setProperty('--color-accent-glow', `rgba(${r},${g},${b},0.42)`);

  root.setProperty('--shadow-glow', `0 0 18px rgba(${r},${g},${b},0.24)`);

  root.setProperty('--color-border-hover', `rgba(${r},${g},${b},0.28)`);
  root.setProperty('--color-border-active', `rgba(${r},${g},${b},0.42)`);

  root.setProperty('--color-rank-owner', colors.rankOwner);
  root.setProperty('--color-rank-developer', colors.rankDeveloper);
  root.setProperty('--color-rank-manager', colors.rankManager);
  root.setProperty('--color-rank-admin', colors.rankAdmin);
  root.setProperty('--color-rank-srmod', colors.rankSrmod);
  root.setProperty('--color-rank-moderator', colors.rankModerator);
  root.setProperty('--color-rank-helper', colors.rankHelper);
  root.setProperty('--color-rank-trial', colors.rankTrial);
  root.setProperty('--color-rank-youtuber', colors.rankYoutuber);
  root.setProperty('--color-rank-champion', colors.rankChampion);
  root.setProperty('--color-rank-titan', colors.rankTitan);
  root.setProperty('--color-rank-elite', colors.rankElite);
  root.setProperty('--color-rank-vip', colors.rankVip);
}

watch(() => config.theme, applyThemeVars, {
  deep: true,
  immediate: true,
});

watch(
  () => config.fontSize,
  (size) => {
    document.documentElement.style.fontSize = size + 'px';
  },
  { immediate: true },
);

function clearStalePlayerStorage(): void {
  try {
    localStorage.removeItem('players');
  } catch {}
}

let removeLogListener: (() => void) | null = null;
let removeForwardedMoveListener: (() => void) | null = null;

async function initLogWatcher(): Promise<void> {
  if (!config.logFilePath) {
    await config.setLogFilePathFromPreset(config.logFilePathPreset);
  }

  const valid = await window.api.log.checkPath(config.logFilePath);

  players.logPathValid = valid;

  if (valid) {
    window.api.log.setPath(config.logFilePath);

    if (router.currentRoute.value.name === 'Setup') {
      router.replace('/');
    }
  }
}

function attachLogListener(): void {
  removeLogListener?.();

  removeLogListener = window.api.log.onLine((line) => {
    rpcHeartbeat();

    const event = parseLine(line);

    if (!event) return;

    switch (event.type) {
      case 'join':
        if (config.autoAddPlayers) {
          players.setCount((players.playersCount ?? 0) + 1);
          players.addByName(event.name, 'auto');
        }
        break;

      case 'quit':
        if (config.autoRemoveOnQuit) {
          players.removeByName(nicks.resolve(event.name));
          players.decrementCount();
        }
        break;

      case 'who': {
        const trackedNames = new Set(
          players.players.map((p) => p.realName.toLowerCase()),
        );

        const newNames = event.names.filter(
          (n) => !trackedNames.has(nicks.resolve(n).toLowerCase()),
        );

        if (config.autoRemoveAllOnWho) {
          players.clear();
        }

        players.setCount(event.names.length);

        const toAdd = config.autoRemoveAllOnWho ? event.names : newNames;

        for (const n of toAdd) {
          players.addByName(n, 'auto');
        }

        break;
      }

      case 'finalKill':
        if (config.autoRemoveFinalDeath) {
          players.removeByName(nicks.resolve(event.name));
          players.decrementCount();
        }
        break;
    }
  });
}

let removeShortcutListener: (() => void) | null = null;

let removeProxyListener: (() => void) | null = null;

function attachProxyListener(): void {
  removeProxyListener?.();

  removeProxyListener = window.api.proxy.onEvent((raw) => {
    const event = raw as ProxyEventPayload;

    if (
      event.type === 'auth-code' ||
      event.type === 'auth-success' ||
      event.type === 'auth-error'
    ) {
      handleProxyAuthEvent(event);

      return;
    }

    if (event.type === 'client-connect') {
      players.setProxyConnectedNetwork(event.network);

      if (config.autoDetectNetwork && event.network !== config.network) {
        config.network = event.network as typeof config.network;
        window.api.rpc.setNetwork(event.network);
      }

      players.clear();

      return;
    }

    if (event.type === 'client-disconnect') {
      if (players.proxyConnectedNetwork === event.network) {
        players.setProxyConnectedNetwork(null);
      }

      players.clearTeams();

      return;
    }

    if (event.network !== config.network) return;

    switch (event.type) {
      case 'player-join':
        if (config.autoAddPlayers) {
          players.addByName(event.username, 'auto');
        }
        break;

      case 'player-quit':
        if (config.autoRemoveOnQuit) {
          players.removeByName(nicks.resolve(event.username));
        }
        break;

      case 'teams-update':
        players.applyTeams(event.teams);
        break;
    }
  });
}

async function registerShortcuts(): Promise<void> {
  await window.api.shortcuts.register([
    config.shortcutMinimize,
    config.shortcutClearPlayers,
  ]);

  removeShortcutListener?.();

  removeShortcutListener = window.api.shortcuts.onFired((s) => {
    if (s === config.shortcutMinimize) {
      window.api.win.toggleMinimize();
    }

    if (s === config.shortcutClearPlayers) {
      players.clear();
    }
  });
}

let rpcIdleTimer: ReturnType<typeof setTimeout> | null = null;

const RPC_IDLE_TIMEOUT_MS = 15_000;

function rpcSetActive(active: boolean): void {
  window.api.rpc.setActive(active);
}

function rpcHeartbeat(): void {
  rpcSetActive(true);

  if (rpcIdleTimer) {
    clearTimeout(rpcIdleTimer);
  }

  rpcIdleTimer = setTimeout(() => {
    rpcSetActive(false);
    rpcIdleTimer = null;
  }, RPC_IDLE_TIMEOUT_MS);
}

watch(
  () => config.discordRpcEnabled,
  (enabled) => {
    window.api.rpc.setEnabled(enabled);

    if (!enabled && rpcIdleTimer) {
      clearTimeout(rpcIdleTimer);
      rpcIdleTimer = null;
    }
  },
);

watch(
  () => config.network,
  (network) => {
    window.api.rpc.setNetwork(network);
    players.clear();
  },
);

watch(
  () => [config.interval, config.mode] as const,
  ([interval, mode]) => {
    players.refreshAllStats(interval, mode);
  },
);

watch(
  () => config.logFilePath,
  async () => {
    window.api.log.setPath(null);
    await initLogWatcher();
  },
);

watch(
  () => [config.shortcutMinimize, config.shortcutClearPlayers] as const,
  () => registerShortcuts(),
);

onMounted(async () => {
  clearStalePlayerStorage();

  players.clear();

  attachLogListener();
  attachProxyListener();

  await initLogWatcher();
  await registerShortcuts();

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('mouseenter', onMouseEnter);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  setIgnore(true);

  removeForwardedMoveListener = window.api.win.onForwardedMove((_x, y) => {
    headerHovered.value = y <= HEADER_HEIGHT || dropdownOpen.value;
    setIgnore(false);
  });

  if (config.discordRpcEnabled) {
    window.api.rpc.setEnabled(true);
    window.api.rpc.setNetwork(config.network);
  }

  if (config.autoUpdateEnabled) {
    window.api.updater.check();
  }

  if (SKIP_LOADING && !SKIP_ANNOUNCEMENTS) {
    void fetchAnnouncements();
  }

  window.api.proxy.setPort('pikanetwork', config.pikaProxyPort).catch(() => {});
  window.api.proxy.setPort('jartexnetwork', config.jartexProxyPort).catch(() => {});
  window.api.proxy.setBindHost(config.proxyBindHost).catch(() => {});
});

onUnmounted(() => {
  removeLogListener?.();
  removeShortcutListener?.();
  removeForwardedMoveListener?.();
  removeProxyListener?.();

  if (rpcIdleTimer) {
    clearTimeout(rpcIdleTimer);
    rpcIdleTimer = null;
  }

  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseleave', onMouseLeave);
  window.removeEventListener('mouseenter', onMouseEnter);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  window.api.rpc.destroy();
});
</script>

<template>
  <div
    class="relative flex h-screen w-screen flex-col overflow-hidden"
    :class="{ 'rounded-lg': config.roundedCorners }"
  >
    <div
      v-if="
        config.theme.bgType === 'image' &&
        config.theme.bgImageUrl &&
        !config.integratedMode
      "
      class="pointer-events-none absolute inset-0"
      :style="{
        backgroundImage: `url('${config.theme.bgImageUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: config.theme.bgImageOpacity,
        borderRadius: 'inherit',
      }"
    />

    <div
      v-if="config.theme.bgType !== 'image'"
      class="pointer-events-none absolute inset-0"
      :style="{
        background: config.bgColor,
        opacity: config.integratedMode ? 0 : config.theme.opacity,
        borderRadius: 'inherit',
      }"
    />

    <template v-if="!config.integratedMode && config.theme.bgType !== 'image'">
      <div class="ambient-layer ambient-tl" />
      <div class="ambient-layer ambient-br" />
      <div class="ambient-layer ambient-center" />
      <div class="ambient-layer ambient-top-vignette" />
    </template>

    <div
      class="relative flex flex-1 flex-col overflow-hidden"
      :style="{
        zIndex: 1,
        opacity: appVisible ? 1 : 0,
        transition: 'opacity 0.35s ease-in-out',
      }"
    >
      <TitleBar />

      <router-view
        v-slot="{ Component }"
        class="flex-1 overflow-hidden"
      >
        <Transition
          name="fade"
          mode="out-in"
        >
          <component :is="Component" />
        </Transition>
      </router-view>
    </div>

    <Transition name="loading-fade">
      <LoadingScreen
        v-if="!loadingDone"
        @done="onLoadingDone"
      />
    </Transition>

    <AnnouncementModal
      v-if="activeAnnouncement"
      :key="activeAnnouncement.payload.id"
      :mode="activeAnnouncement.mode"
      :changelog="
        activeAnnouncement.mode === 'changelog' ? activeAnnouncement.payload : undefined
      "
      :alert="
        activeAnnouncement.mode === 'alert' ? activeAnnouncement.payload : undefined
      "
      @close="dismissActive()"
    />

    <PremiumSignInModal
      v-if="activePremiumAuth"
      :key="activePremiumAuth.network"
      :auth="activePremiumAuth"
      @close="dismissPremiumAuth()"
    />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.loading-fade-leave-active {
  transition: opacity 0.35s ease-in-out;
  pointer-events: none;
}

.loading-fade-leave-to {
  opacity: 0;
}
</style>
