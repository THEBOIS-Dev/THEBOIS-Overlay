<script setup lang="ts">
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import type { BedwarsMode, Interval } from '@renderer/types';
import { onClickOutside } from '@vueuse/core';
import {
  Camera,
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

const headerHovered = inject<ReturnType<typeof ref<boolean>>>(
  'headerHovered',
  ref(false),
);
const dropdownOpen = inject<ReturnType<typeof ref<boolean>>>('dropdownOpen', ref(false));

watch(menuOpen, (val) => {
  dropdownOpen.value = val;
});
onClickOutside(menuRef, () => {
  menuOpen.value = false;
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

async function onModeChange(e: Event): Promise<void> {
  config.mode = (e.target as HTMLSelectElement).value as BedwarsMode;
  await players.refreshAllStats(config.interval, config.mode);
}

async function onIntervalChange(e: Event): Promise<void> {
  config.interval = (e.target as HTMLSelectElement).value as Interval;
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
      <div class="flex items-baseline gap-1">
        <span
          class="gradient-text font-extrabold tracking-widest"
          style="font-size: 0.77rem; letter-spacing: 0.15em"
        >
          THEBOIS
        </span>
        <span
          style="
            font-size: 0.65rem;
            color: var(--color-ink-3);
            font-weight: 400;
            letter-spacing: 0.02em;
          "
        >
          overlay
        </span>
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
        <select
          :value="config.mode"
          class="select-field"
          style="height: 27px; font-size: 0.76rem; min-width: 98px"
          @change="onModeChange"
        >
          <option
            v-for="[k, v] in MODES"
            :key="k"
            :value="k"
          >
            {{ v }}
          </option>
        </select>
        <select
          :value="config.interval"
          class="select-field"
          style="height: 27px; font-size: 0.76rem; min-width: 76px"
          @change="onIntervalChange"
        >
          <option
            v-for="[k, v] in INTERVALS"
            :key="k"
            :value="k"
          >
            {{ v }}
          </option>
        </select>
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
            class="absolute top-full right-0 z-50 mt-1.5 w-44 overflow-hidden"
            style="
              background: rgba(8, 5, 22, 0.98);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-lg);
              box-shadow:
                0 8px 36px rgba(0, 0, 0, 0.65),
                0 0 0 1px rgba(124, 58, 237, 0.08);
            "
            @click.stop
          >
            <div class="py-1">
              <router-link
                v-for="item in NAV"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-2.5 px-3.5 py-2 transition-colors"
                style="font-size: 0.83rem"
                :style="
                  route.path === item.to
                    ? 'color:var(--color-accent-light);background:rgba(124,58,237,0.14)'
                    : 'color:var(--color-ink-2)'
                "
                @click="menuOpen = false"
              >
                <component
                  :is="item.icon"
                  :size="13"
                  class="shrink-0"
                />
                {{ item.label }}
              </router-link>

              <div
                class="mx-3 my-1.5 border-t"
                style="border-color: var(--color-border)"
              />

              <button
                class="flex w-full items-center gap-2.5 px-3.5 py-2 transition-colors"
                style="font-size: 0.83rem; color: var(--color-ink-3)"
                @click="doScreenshot"
              >
                <Camera :size="13" />
                Screenshot
              </button>
            </div>
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
.drop-enter-active,
.drop-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
.close-btn:hover {
  background: rgba(239, 68, 68, 0.65) !important;
  color: #fff !important;
}
</style>
