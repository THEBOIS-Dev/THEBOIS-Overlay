<template>
  <header
    class="flex items-center justify-between shrink-0 px-2 border-b titlebar-integrated"
    :class="{ 'is-integrated': config.integratedMode }"
    :style="[{
      height: '42px',
      background: 'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, rgba(6,9,20,0.4) 100%)',
      borderColor: 'var(--color-border)',
    }, integratedHeaderStyle]"
  >
    <!-- Logo + drag zone -->
    <div class="drag flex items-center gap-2.5 pl-1 min-w-0 flex-1 h-full">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="shrink-0">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#b89aff"/>
            <stop offset="100%" stop-color="#7c3aed"/>
          </linearGradient>
          <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#e040fb"/>
            <stop offset="100%" stop-color="#7c3aed"/>
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="8" height="8" rx="2" fill="url(#g1)"/>
        <rect x="11" y="1" width="8" height="8" rx="2" fill="url(#g2)" opacity=".7"/>
        <rect x="1" y="11" width="8" height="8" rx="2" fill="url(#g2)" opacity=".7"/>
        <rect x="11" y="11" width="8" height="8" rx="2" fill="url(#g1)" opacity=".35"/>
      </svg>
      <div class="flex items-baseline gap-1.5">
        <span class="font-extrabold tracking-widest gradient-text" style="font-size: 0.8rem; letter-spacing: 0.14em;">THEBOIS</span>
        <span style="font-size: 0.72rem; color: var(--color-ink-3); font-weight: 400;">overlay</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="no-drag flex items-center gap-1.5">

      <!-- Add player input (always visible, works from any page) -->
      <template v-if="!isSettings && !isSetup">
        <div class="relative">
          <input
            v-model.trim="addInput"
            placeholder="Add player…"
            class="input-field"
            style="height: 28px; width: 138px; padding-right: 28px; font-size: 0.8rem;"
            @keydown.enter="submitAdd"
            @keydown.escape="addInput = ''"
          />
          <button
            v-if="addInput"
            class="absolute right-1 top-1/2 -translate-y-1/2 btn rounded w-5 h-5"
            style="color: var(--color-accent-light);"
            @click="submitAdd"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </template>

      <template v-if="isHome">
        <select :value="config.mode" class="select-field" style="height: 28px; font-size: 0.78rem; min-width: 100px;" @change="onModeChange">
          <option v-for="[k, v] in MODES" :key="k" :value="k">{{ v }}</option>
        </select>
        <select :value="config.interval" class="select-field" style="height: 28px; font-size: 0.78rem; min-width: 82px;" @change="onIntervalChange">
          <option v-for="[k, v] in INTERVALS" :key="k" :value="k">{{ v }}</option>
        </select>
        <button class="btn w-7 h-7 rounded" title="Clear players" @click="players.clear()">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </template>

      <!-- Nav menu -->
      <div class="relative" ref="menuRef">
        <button class="btn w-7 h-7 rounded" @click="menuOpen = !menuOpen">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/>
          </svg>
        </button>

        <!-- Backdrop to block click-through to player table -->
        <div v-if="menuOpen" class="fixed inset-0 z-40" @click="menuOpen = false" />

        <Transition name="drop">
          <nav
            v-if="menuOpen"
            class="absolute right-0 top-full mt-1.5 z-50 w-44 overflow-hidden shadow-2xl"
            style="
              background: rgba(8,5,22,0.98);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-lg);
              box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.1);
            "
            @click.stop
          >
            <router-link
              v-for="item in NAV"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 px-3.5 py-2.5 transition-colors"
              style="font-size: 0.85rem;"
              :style="route.path === item.to
                ? 'color:#b89aff; background: rgba(124,58,237,0.18);'
                : 'color: var(--color-ink-2);'"
              @click="menuOpen = false"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><g v-html="item.iconPath" /></svg>
              {{ item.label }}
            </router-link>

            <div class="mx-3 my-1" style="border-top: 1px solid var(--color-border);" />

            <button
              class="flex w-full items-center gap-2.5 px-3.5 py-2.5 transition-colors"
              style="font-size: 0.85rem; color: var(--color-ink-3);"
              @click="doScreenshot"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M20 4h-3.17L15 2H9L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
              </svg>
              Screenshot
            </button>
          </nav>
        </Transition>
      </div>

      <div class="w-px mx-0.5" style="height: 16px; background: var(--color-border);" />

      <button class="btn w-7 h-7 rounded" title="Minimize" @click="onMinimize">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M4 11h16v2H4z"/></svg>
      </button>

      <button class="btn w-7 h-7 rounded close-btn" title="Close" @click="onClose">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M5 5l14 14M19 5 5 19"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@renderer/store/config'
import { usePlayersStore } from '@renderer/store/players'
import type { BedwarsMode, Interval } from '@renderer/types'

const config  = useConfigStore()
const players = usePlayersStore()
const route   = useRoute()
const router  = useRouter()

const addInput = ref('')
const menuOpen = ref(false)
const menuRef  = ref<HTMLElement | null>(null)

const headerHovered = inject<ReturnType<typeof ref<boolean>>>('headerHovered', ref(false))
const dropdownOpen  = inject<ReturnType<typeof ref<boolean>>>('dropdownOpen',  ref(false))

watch(menuOpen, (val) => { dropdownOpen.value = val })

const integratedHeaderStyle = computed(() => {
  if (!config.integratedMode) return {}
  const visible = headerHovered.value || menuOpen.value
  return visible
    ? { opacity: '1', background: 'rgba(8,5,22,0.95)', transition: 'opacity 0.15s ease, background 0.15s ease' }
    : { opacity: '0.05', transition: 'opacity 0.25s ease' }
})

const isHome     = computed(() => route.name === 'Home')
const isSettings = computed(() => route.name === 'Settings')
const isSetup    = computed(() => route.name === 'Setup')
const logValid   = computed(() => players.logPathValid === true)

const MODES: [BedwarsMode, string][] = [
  ['ALL_MODES', 'All Modes'],
  ['SOLO',      'Solo'],
  ['DOUBLES',   'Doubles'],
  ['TRIPLES',   'Triples'],
  ['QUAD',      'Quads'],
]

const INTERVALS: [Interval, string][] = [
  ['total',   'Overall'],
  ['weekly',  'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly',  'Yearly'],
]

const NAV = [
  { to: '/',         label: 'Home',     iconPath: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>' },
  { to: '/nicks',    label: 'Nicks',    iconPath: '<path d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>' },
  { to: '/theme',    label: 'Theme',    iconPath: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>' },
  { to: '/settings', label: 'Settings', iconPath: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>' },
  { to: '/setup',    label: 'Setup',    iconPath: '<path d="M13.78 15.3 19.78 21.3Q20.2 21.725 20.8 21.725Q21.4 21.725 21.825 21.3Q22.25 20.875 22.25 20.275Q22.25 19.675 21.825 19.25L15.825 13.25Q16.3 12.2 16.3 11Q16.3 8.4 14.45 6.55Q12.6 4.7 10 4.7Q9.1 4.7 8.3 4.95Q7.5 5.2 6.85 5.65L9.75 8.55Q10.125 8.925 10.125 9.45Q10.125 9.975 9.75 10.35L8.35 11.75Q7.975 12.125 7.45 12.125Q6.925 12.125 6.55 11.75L3.65 8.85Q3.2 9.5 2.95 10.3Q2.7 11.1 2.7 12Q2.7 14.6 4.55 16.45Q6.4 18.3 9 18.3Q10.2 18.3 11.25 17.8L13.78 15.3Z"/>' },
]

function onMinimize(): void { window.api.win.minimize() }
function onClose():    void { window.api.win.close() }

function submitAdd(): void {
  const names = addInput.value.trim().split(/[\s,]+/).filter(Boolean)
  names.forEach((n) => {
    if (/^[A-Za-z0-9_]{1,16}$/.test(n)) players.addByName(n, 'manual')
  })
  addInput.value = ''
  if (names.length > 0 && route.name !== 'Home') router.replace('/')
}

async function onModeChange(e: Event): Promise<void> {
  const mode = (e.target as HTMLSelectElement).value as BedwarsMode
  config.mode = mode
  await players.refreshAllStats(config.interval, mode)
}

async function onIntervalChange(e: Event): Promise<void> {
  const interval = (e.target as HTMLSelectElement).value as Interval
  config.interval = interval
  await players.refreshAllStats(interval, config.mode)
}

async function doScreenshot(): Promise<void> {
  menuOpen.value = false
  await new Promise((r) => setTimeout(r, 180))
  window.api.win.screenshot()
}

onMounted(()  => {})
onUnmounted(() => {})
</script>

<style scoped>
.drop-enter-active, .drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.drop-enter-from, .drop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.97);
}
.close-btn:hover {
  background: rgba(239,68,68,0.7) !important;
  color: #fff !important;
  box-shadow: 0 0 10px rgba(239,68,68,0.4) !important;
}
/* pointer-events are handled dynamically by App.vue's setIgnoreMouse */
</style>
