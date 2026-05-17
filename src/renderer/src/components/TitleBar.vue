<script setup lang="ts">
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import type { BedwarsMode, Interval } from '@renderer/types';
import { onClickOutside } from '@vueuse/core';
import {
  Camera,
  ChevronDown,
  Home,
  Menu,
  Minus,
  Palette,
  Plus,
  Settings,
  Tag,
  Trash2,
  Wrench,
  X,
} from 'lucide-vue-next';
import { computed, inject, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const config = useConfigStore();
const players = usePlayersStore();
const route = useRoute();
const router = useRouter();

const addInput = ref('');
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const modeOpen = ref(false);
const modeRef = ref<HTMLElement | null>(null);
const intervalOpen = ref(false);
const intervalRef = ref<HTMLElement | null>(null);

const headerHovered = inject<ReturnType<typeof ref<boolean>>>(
  'headerHovered',
  ref(false),
);
const dropdownOpen = inject<ReturnType<typeof ref<boolean>>>('dropdownOpen', ref(false));

watch(menuOpen, (val) => {
  dropdownOpen.value = val;
});
watch(modeOpen, (val) => {
  if (val) dropdownOpen.value = true;
});
watch(intervalOpen, (val) => {
  if (val) dropdownOpen.value = true;
});

onClickOutside(menuRef, () => {
  menuOpen.value = false;
});
onClickOutside(modeRef, () => {
  modeOpen.value = false;
});
onClickOutside(intervalRef, () => {
  intervalOpen.value = false;
});

const integratedHeaderStyle = computed(() => {
  if (!config.integratedMode) return {};
  const visible = headerHovered.value || menuOpen.value;
  return visible
    ? {
        opacity: '1',
        background: 'rgba(8,5,22,0.95)',
        transition: 'opacity 0.15s ease, background 0.15s ease',
      }
    : { opacity: '0.05', transition: 'opacity 0.25s ease' };
});

const isHome = computed(() => route.name === 'Home');
const isSettings = computed(() => route.name === 'Settings');
const isSetup = computed(() => route.name === 'Setup');

const isJartex = computed(() => config.network === 'jartexnetwork');
const networkAccent = computed(() => (isJartex.value ? '#22d3ee' : '#ffea00'));
const networkLabel = computed(() => (isJartex.value ? 'JartexNetwork' : 'PikaNetwork'));

const MODES: [BedwarsMode, string][] = [
  ['ALL_MODES', 'All Modes'],
  ['SOLO', 'Solo'],
  ['DOUBLES', 'Doubles'],
  ['TRIPLES', 'Triples'],
  ['QUAD', 'Quads'],
];

const INTERVALS: [Interval, string][] = [
  ['total', 'Overall'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
];

const NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/nicks', label: 'Nicks', icon: Tag },
  { to: '/theme', label: 'Theme', icon: Palette },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/setup', label: 'Setup', icon: Wrench },
];

const modeLabel = computed(
  () => MODES.find(([k]) => k === config.mode)?.[1] ?? 'All Modes',
);
const intervalLabel = computed(
  () => INTERVALS.find(([k]) => k === config.interval)?.[1] ?? 'Overall',
);

function onMinimize() {
  window.api.win.minimize();
}
function onClose() {
  window.api.win.close();
}

function submitAdd(): void {
  const names = addInput.value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  names.forEach((n) => {
    if (/^[A-Za-z0-9_]{1,16}$/.test(n)) players.addByName(n, 'manual');
  });
  addInput.value = '';
  if (names.length > 0 && route.name !== 'Home') router.replace('/');
}

async function selectMode(k: BedwarsMode): Promise<void> {
  config.mode = k;
  modeOpen.value = false;
  await players.refreshAllStats(config.interval, config.mode);
}

async function selectInterval(k: Interval): Promise<void> {
  config.interval = k;
  intervalOpen.value = false;
  await players.refreshAllStats(config.interval, config.mode);
}

async function doScreenshot(): Promise<void> {
  menuOpen.value = false;
  await new Promise((r) => setTimeout(r, 180));
  window.api.win.screenshot();
}
</script>

<template>
  <header
    class="flex shrink-0 items-center justify-between border-b px-2.5"
    :class="{ 'is-integrated': config.integratedMode }"
    :style="[
      {
        height: '40px',
        background:
          'linear-gradient(180deg, rgba(124,58,237,0.05) 0%, rgba(4,6,15,0.5) 100%)',
        borderColor: 'var(--color-border)',
      },
      integratedHeaderStyle,
    ]"
  >
    <div class="drag flex h-full min-w-0 flex-1 items-center gap-2 pl-0.5">
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        class="shrink-0"
      >
        <defs>
          <linearGradient
            id="g1"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop
              offset="0%"
              stop-color="#c4a8ff"
            />
            <stop
              offset="100%"
              stop-color="#7c3aed"
            />
          </linearGradient>
          <linearGradient
            id="g2"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop
              offset="0%"
              stop-color="#e040fb"
            />
            <stop
              offset="100%"
              stop-color="#7c3aed"
            />
          </linearGradient>
        </defs>
        <rect
          x="1"
          y="1"
          width="8"
          height="8"
          rx="2.2"
          fill="url(#g1)"
        />
        <rect
          x="11"
          y="1"
          width="8"
          height="8"
          rx="2.2"
          fill="url(#g2)"
          opacity=".65"
        />
        <rect
          x="1"
          y="11"
          width="8"
          height="8"
          rx="2.2"
          fill="url(#g2)"
          opacity=".65"
        />
        <rect
          x="11"
          y="11"
          width="8"
          height="8"
          rx="2.2"
          fill="url(#g1)"
          opacity=".3"
        />
      </svg>
      <div class="flex items-center gap-1.5">
        <span
          class="gradient-text font-extrabold tracking-widest"
          style="font-size: 0.77rem; letter-spacing: 0.15em"
          >THEBOIS</span
        >
        <span
          style="
            font-size: 0.7rem;
            color: var(--color-ink-3);
            font-weight: 400;
            letter-spacing: 0.02em;
          "
          >overlay</span
        >
      </div>
      <div
        class="flex shrink-0 items-center rounded px-1.5 py-0.5"
        style="
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          transition: all 0.2s ease;
        "
        :style="{
          color: networkAccent,
          background: isJartex ? 'rgba(6,182,212,0.09)' : 'rgba(255,234,0,0.09)',
          border: `1px solid ${isJartex ? 'rgba(6,182,212,0.22)' : 'rgba(255,234,0,0.22)'}`,
        }"
      >
        {{ networkLabel }}
      </div>
    </div>

    <div class="no-drag flex items-center gap-1.5">
      <template v-if="!isSettings && !isSetup">
        <div class="relative">
          <input
            v-model.trim="addInput"
            placeholder="Add player…"
            class="input-field"
            style="height: 27px; width: 132px; padding-right: 26px; font-size: 0.78rem"
            @keydown.enter="submitAdd"
            @keydown.escape="addInput = ''"
          />
          <button
            v-if="addInput"
            class="btn absolute top-1/2 right-1 h-5 w-5 -translate-y-1/2 rounded"
            style="color: var(--color-accent-light)"
            @click="submitAdd"
          >
            <Plus :size="11" />
          </button>
        </div>
      </template>

      <template v-if="isHome">
        <div
          ref="modeRef"
          class="relative"
        >
          <button
            class="custom-select no-drag"
            :class="{ 'custom-select--open': modeOpen }"
            @click="modeOpen = !modeOpen"
          >
            <span>{{ modeLabel }}</span>
            <ChevronDown
              :size="10"
              class="custom-select-chevron"
              :class="{ 'custom-select-chevron--open': modeOpen }"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="modeOpen"
              class="custom-dropdown"
            >
              <button
                v-for="[k, v] in MODES"
                :key="k"
                class="custom-dropdown-item"
                :class="{ 'custom-dropdown-item--active': config.mode === k }"
                @click="selectMode(k)"
              >
                <span
                  v-if="config.mode === k"
                  class="custom-dropdown-dot"
                />
                {{ v }}
              </button>
            </div>
          </Transition>
        </div>

        <div
          ref="intervalRef"
          class="relative"
        >
          <button
            class="custom-select no-drag"
            :class="{ 'custom-select--open': intervalOpen }"
            @click="intervalOpen = !intervalOpen"
          >
            <span>{{ intervalLabel }}</span>
            <ChevronDown
              :size="10"
              class="custom-select-chevron"
              :class="{ 'custom-select-chevron--open': intervalOpen }"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="intervalOpen"
              class="custom-dropdown"
            >
              <button
                v-for="[k, v] in INTERVALS"
                :key="k"
                class="custom-dropdown-item"
                :class="{ 'custom-dropdown-item--active': config.interval === k }"
                @click="selectInterval(k)"
              >
                <span
                  v-if="config.interval === k"
                  class="custom-dropdown-dot"
                />
                {{ v }}
              </button>
            </div>
          </Transition>
        </div>

        <button
          class="btn h-6 w-6 rounded"
          title="Clear players"
          @click="players.clear()"
        >
          <Trash2 :size="13" />
        </button>
      </template>

      <div
        class="mx-0.5 h-3.5 w-px"
        style="background: var(--color-border)"
      />

      <div
        ref="menuRef"
        class="relative"
      >
        <button
          class="btn h-6 w-6 rounded"
          @click="menuOpen = !menuOpen"
        >
          <Menu :size="13" />
        </button>

        <Transition name="drop">
          <nav
            v-if="menuOpen"
            class="absolute top-full right-0 z-50 mt-1 overflow-hidden"
            style="
              width: 152px;
              background: rgba(8, 5, 22, 0.98);
              border: 1px solid rgba(120, 80, 255, 0.18);
              border-radius: var(--radius-lg);
              box-shadow:
                0 8px 36px rgba(0, 0, 0, 0.65),
                0 0 0 1px rgba(124, 58, 237, 0.06);
              padding: 4px;
            "
            @click.stop
          >
            <router-link
              v-for="item in NAV"
              :key="item.to"
              :to="item.to"
              class="nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors"
              :class="{ 'nav-item--active': route.path === item.to }"
              @click="menuOpen = false"
            >
              <component
                :is="item.icon"
                :size="12"
                class="shrink-0"
              />
              {{ item.label }}
            </router-link>

            <div
              class="mx-1.5 my-1 border-t"
              style="border-color: rgba(120, 80, 255, 0.12)"
            />

            <button
              class="nav-item nav-item--muted flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors"
              @click="doScreenshot"
            >
              <Camera :size="12" />
              Screenshot
            </button>
          </nav>
        </Transition>
      </div>

      <button
        class="btn h-6 w-6 rounded"
        title="Minimize"
        @click="onMinimize"
      >
        <Minus :size="12" />
      </button>
      <button
        class="btn close-btn h-6 w-6 rounded"
        title="Close"
        @click="onClose"
      >
        <X :size="11" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.custom-select {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(120, 80, 255, 0.18);
  color: var(--color-ink-2);
  font-family: var(--font-sans);
  font-size: 0.76rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    color 150ms ease;
  -webkit-app-region: no-drag;
}

.custom-select:hover,
.custom-select--open {
  border-color: rgba(124, 58, 237, 0.38);
  background: rgba(124, 58, 237, 0.08);
  color: var(--color-ink-1);
}

.custom-select-chevron {
  color: var(--color-ink-3);
  flex-shrink: 0;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.custom-select-chevron--open {
  transform: rotate(180deg);
}

.custom-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  z-index: 50;
  min-width: 100%;
  background: rgba(8, 5, 22, 0.98);
  border: 1px solid rgba(120, 80, 255, 0.18);
  border-radius: var(--radius-md);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(124, 58, 237, 0.06);
  padding: 4px;
  overflow: hidden;
}

.custom-dropdown-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--color-ink-2);
  cursor: pointer;
  transition:
    background 140ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
    color 140ms ease;
  -webkit-app-region: no-drag;
  white-space: nowrap;
}

.custom-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-ink-1);
}

.custom-dropdown-item--active {
  color: var(--color-accent-light);
  background: rgba(124, 58, 237, 0.12);
}

.custom-dropdown-item--active:hover {
  background: rgba(124, 58, 237, 0.18);
}

.custom-dropdown-dot {
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--color-accent);
  flex-shrink: 0;
}

.nav-item {
  font-size: 0.81rem;
  font-weight: 500;
  color: var(--color-ink-2);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-ink-1);
}

.nav-item--active {
  color: var(--color-accent-light);
  background: rgba(124, 58, 237, 0.14);
}

.nav-item--active:hover {
  background: rgba(124, 58, 237, 0.18);
}

.nav-item--muted {
  color: var(--color-ink-3);
}

.nav-item--muted:hover {
  color: var(--color-ink-2);
  background: rgba(255, 255, 255, 0.04);
}

.drop-enter-active,
.drop-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.97);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.65) !important;
  color: #fff !important;
}
</style>
