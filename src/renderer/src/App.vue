<script setup lang="ts">
import AnnouncementModal from '@renderer/components/AnnouncementModal.vue';
import LoadingScreen from '@renderer/components/LoadingScreen.vue';
import TitleBar from '@renderer/components/TitleBar.vue';
import { parseLine } from '@renderer/composables/useLogParser';
import { useAnnouncements } from '@renderer/composables/useAnnouncements';
import { useConfigStore } from '@renderer/store/config';
import { useNicksStore } from '@renderer/store/nicks';
import { usePlayersStore } from '@renderer/store/players';
import type { ProxyEventPayload } from '@renderer/types';
import { onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const config = useConfigStore();
const players = usePlayersStore();
const nicks = useNicksStore();
const router = useRouter();

const { activeAnnouncement, fetchAnnouncements, dismissActive } = useAnnouncements();

const isLinux = window.api.platform === 'linux';

const SKIP_LOADING = localStorage.getItem('skip-loading') === '1';
const loadingDone = ref(SKIP_LOADING);
const appVisible = ref(SKIP_LOADING);

function onLoadingDone(): void {
  loadingDone.value = true;
  requestAnimationFrame(() => {
    appVisible.value = true;
  });
  void fetchAnnouncements();
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

function hexToRgbParts(hex: string): string {
  const clean = hex.replace('#', '').slice(0, 6);
  if (clean.length < 6) return '124,58,237';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function applyThemeVars(): void {
  const c = config.theme.colors;
  const s = document.documentElement.style;

  s.setProperty('--color-accent', c.accent);
  s.setProperty('--color-accent-light', c.accentLight);
  s.setProperty('--color-border', c.border);
  s.setProperty('--color-ink-1', c.ink1);
  s.setProperty('--color-ink-2', c.ink2);
  s.setProperty('--color-ink-3', c.ink3);
  s.setProperty('--color-nick', c.nick);
  s.setProperty('--color-good', c.good);
  s.setProperty('--color-bad', c.bad);

  const rgb = hexToRgbParts(c.accent);
  s.setProperty('--color-accent-rgb', rgb);
  s.setProperty('--color-accent-dim', `rgba(${rgb},0.12)`);
  s.setProperty('--color-accent-glow', `rgba(${rgb},0.45)`);
  s.setProperty('--shadow-glow', `0 0 18px rgba(${rgb},0.25)`);

  s.setProperty('--color-rank-owner', c.rankOwner);
  s.setProperty('--color-rank-developer', c.rankDeveloper);
  s.setProperty('--color-rank-manager', c.rankManager);
  s.setProperty('--color-rank-admin', c.rankAdmin);
  s.setProperty('--color-rank-srmod', c.rankSrmod);
  s.setProperty('--color-rank-moderator', c.rankModerator);
  s.setProperty('--color-rank-helper', c.rankHelper);
  s.setProperty('--color-rank-trial', c.rankTrial);
  s.setProperty('--color-rank-youtuber', c.rankYoutuber);
  s.setProperty('--color-rank-champion', c.rankChampion);
  s.setProperty('--color-rank-titan', c.rankTitan);
  s.setProperty('--color-rank-elite', c.rankElite);
  s.setProperty('--color-rank-vip', c.rankVip);
}

watch(() => config.theme.colors, applyThemeVars, { deep: true, immediate: true });

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
  } catch {
    /* ignore */
  }
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
    if (router.currentRoute.value.name === 'Setup') router.replace('/');
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

        if (config.autoRemoveAllOnWho) players.clear();
        players.setCount(event.names.length);

        const toAdd = config.autoRemoveAllOnWho ? event.names : newNames;
        for (const n of toAdd) players.addByName(n, 'auto');
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
        if (config.autoAddPlayers) players.addByName(event.username, 'auto');
        break;
      case 'player-quit':
        if (config.autoRemoveOnQuit) players.removeByName(nicks.resolve(event.username));
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
    if (s === config.shortcutMinimize) window.api.win.toggleMinimize();
    if (s === config.shortcutClearPlayers) players.clear();
  });
}

let rpcIdleTimer: ReturnType<typeof setTimeout> | null = null;
const RPC_IDLE_TIMEOUT_MS = 15_000;

function rpcSetActive(active: boolean): void {
  window.api.rpc.setActive(active);
}

function rpcHeartbeat(): void {
  rpcSetActive(true);
  if (rpcIdleTimer) clearTimeout(rpcIdleTimer);
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

  if (SKIP_LOADING) {
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
