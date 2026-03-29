<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, provide } from 'vue'
import TitleBar from '@renderer/components/TitleBar.vue'
import { useConfigStore } from '@renderer/store/config'
import { usePlayersStore } from '@renderer/store/players'
import { useNicksStore } from '@renderer/store/nicks'
import { parseLine } from '@renderer/composables/useLogParser'
import { useRouter } from 'vue-router'

const config = useConfigStore()
const players = usePlayersStore()
const nicks = useNicksStore()
const router = useRouter()

let currentlyIgnoring = false

const headerHovered = ref(false)
const dropdownOpen = ref(false)
provide('headerHovered', headerHovered)
provide('dropdownOpen', dropdownOpen)

const HEADER_HEIGHT = 42
const RESIZE_EDGE_PX = 6

function setIgnore(ignore: boolean): void {
  if (currentlyIgnoring === ignore) return
  currentlyIgnoring = ignore
  window.api.win.setIgnoreMouse(ignore)
}

function isOnResizeEdge(e: MouseEvent): boolean {
  const x = e.clientX
  const y = e.clientY
  const w = window.innerWidth
  const h = window.innerHeight
  return (
    x <= RESIZE_EDGE_PX || x >= w - RESIZE_EDGE_PX || y <= RESIZE_EDGE_PX || y >= h - RESIZE_EDGE_PX
  )
}

const INTERACTIVE_SELECTOR =
  'button, input, select, textarea, a, label, [role="button"], [tabindex="0"]'

function isScrollable(el: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node && node !== document.documentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return true
    }
    node = node.parentElement
  }
  return false
}

function updateResizeCursor(e: MouseEvent): void {
  const x = e.clientX
  const y = e.clientY
  const w = window.innerWidth
  const h = window.innerHeight
  const onL = x <= RESIZE_EDGE_PX
  const onR = x >= w - RESIZE_EDGE_PX
  const onT = y <= RESIZE_EDGE_PX
  const onB = y >= h - RESIZE_EDGE_PX

  let cursor = ''
  if (onT && onL) cursor = 'nw-resize'
  else if (onT && onR) cursor = 'ne-resize'
  else if (onB && onL) cursor = 'sw-resize'
  else if (onB && onR) cursor = 'se-resize'
  else if (onT) cursor = 'n-resize'
  else if (onB) cursor = 's-resize'
  else if (onL) cursor = 'w-resize'
  else if (onR) cursor = 'e-resize'

  document.documentElement.style.cursor = cursor
}

function onMouseMove(e: MouseEvent): void {
  if (isOnResizeEdge(e)) {
    setIgnore(false)
    updateResizeCursor(e)
    return
  }

  document.documentElement.style.cursor = ''
  headerHovered.value = e.clientY <= HEADER_HEIGHT || dropdownOpen.value

  const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  if (!target || target === document.documentElement || target === document.body) {
    if (dropdownOpen.value) {
      setIgnore(false)
      return
    }
    setIgnore(true)
    return
  }

  if (dropdownOpen.value) {
    setIgnore(false)
    return
  }

  if (config.integratedMode && e.clientY <= HEADER_HEIGHT) {
    setIgnore(false)
    return
  }

  const hit =
    target.closest(INTERACTIVE_SELECTOR) ||
    target.closest('.no-drag') ||
    target.closest('.btn') ||
    target.closest('.cursor-pointer') ||
    isScrollable(target)

  setIgnore(!hit)
}

function onMouseLeave(): void {
  if (dropdownOpen.value) return
  headerHovered.value = false
  document.documentElement.style.cursor = ''
  setIgnore(true)
}

function onMouseEnter(): void {
  setIgnore(false)
}

function applyThemeVars(): void {
  const c = config.theme.colors
  const s = document.documentElement.style
  s.setProperty('--color-accent', c.accent)
  s.setProperty('--color-accent-light', c.accentLight)
  s.setProperty('--color-border', c.border)
  s.setProperty('--color-ink-1', c.ink1)
  s.setProperty('--color-ink-2', c.ink2)
  s.setProperty('--color-ink-3', c.ink3)
  s.setProperty('--color-nick', c.nick)
  s.setProperty('--color-good', c.good)
  s.setProperty('--color-bad', c.bad)
}

watch(() => config.theme.colors, applyThemeVars, { deep: true, immediate: true })

watch(
  () => config.fontSize,
  (size) => {
    document.documentElement.style.fontSize = size + 'px'
  },
  { immediate: true },
)

function clearStalePlayerStorage(): void {
  try {
    localStorage.removeItem('players')
  } catch {
    /* ignore */
  }
}

let removeLogListener: (() => void) | null = null

async function initLogWatcher(): Promise<void> {
  if (!config.logFilePath) {
    await config.setLogFilePathFromPreset(config.logFilePathPreset)
  }
  const valid = await window.api.log.checkPath(config.logFilePath)
  players.logPathValid = valid
  if (valid) {
    window.api.log.setPath(config.logFilePath)
    if (router.currentRoute.value.name === 'Setup') router.replace('/')
  }
}

function attachLogListener(): void {
  removeLogListener?.()
  removeLogListener = window.api.log.onLine((line) => {
    rpcHeartbeat()
    const event = parseLine(line)
    if (!event) return

    switch (event.type) {
      case 'join':
        if (config.autoAddPlayers) {
          players.setCount((players.playersCount ?? 0) + 1)
          players.addByName(event.name, 'auto')
        }
        break

      case 'quit':
        if (config.autoRemoveOnQuit) {
          players.removeByName(nicks.resolve(event.name))
          players.decrementCount()
        }
        break

      case 'who': {
        const trackedNames = new Set(players.players.map((p) => p.realName.toLowerCase()))
        const newNames = event.names.filter(
          (n) => !trackedNames.has(nicks.resolve(n).toLowerCase()),
        )

        if (config.autoRemoveAllOnWho) players.clear()
        players.setCount(event.names.length)

        const toAdd = config.autoRemoveAllOnWho ? event.names : newNames
        for (const n of toAdd) players.addByName(n, 'auto')
        break
      }

      case 'finalKill':
        if (config.autoRemoveFinalDeath) {
          players.removeByName(nicks.resolve(event.name))
          players.decrementCount()
        }
        break
    }
  })
}

let removeShortcutListener: (() => void) | null = null

async function registerShortcuts(): Promise<void> {
  await window.api.shortcuts.register([config.shortcutMinimize, config.shortcutClearPlayers])
  removeShortcutListener?.()
  removeShortcutListener = window.api.shortcuts.onFired((s) => {
    if (s === config.shortcutMinimize) window.api.win.toggleMinimize()
    if (s === config.shortcutClearPlayers) players.clear()
  })
}

let rpcIdleTimer: ReturnType<typeof setTimeout> | null = null
const RPC_IDLE_TIMEOUT_MS = 15_000

function rpcSetActive(active: boolean): void {
  window.api.rpc.setActive(active)
}

function rpcHeartbeat(): void {
  rpcSetActive(true)
  if (rpcIdleTimer) clearTimeout(rpcIdleTimer)
  rpcIdleTimer = setTimeout(() => {
    rpcSetActive(false)
    rpcIdleTimer = null
  }, RPC_IDLE_TIMEOUT_MS)
}

watch(
  () => config.discordRpcEnabled,
  (enabled) => {
    window.api.rpc.setEnabled(enabled)
    if (!enabled && rpcIdleTimer) {
      clearTimeout(rpcIdleTimer)
      rpcIdleTimer = null
    }
  },
)

watch(
  () => [config.interval, config.mode] as const,
  ([interval, mode]) => {
    players.refreshAllStats(interval, mode)
  },
)

watch(
  () => config.logFilePath,
  async () => {
    window.api.log.setPath(null)
    await initLogWatcher()
  },
)

watch(
  () => [config.shortcutMinimize, config.shortcutClearPlayers] as const,
  () => registerShortcuts(),
)

onMounted(async () => {
  clearStalePlayerStorage()
  players.clear()
  attachLogListener()
  await initLogWatcher()
  await registerShortcuts()

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('mouseenter', onMouseEnter)
  setIgnore(true)

  if (config.discordRpcEnabled) {
    window.api.rpc.setEnabled(true)
  }

  if (config.autoUpdateEnabled) {
    window.api.updater.check()
  }
})

onUnmounted(() => {
  removeLogListener?.()
  removeShortcutListener?.()
  if (rpcIdleTimer) {
    clearTimeout(rpcIdleTimer)
    rpcIdleTimer = null
  }
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseleave', onMouseLeave)
  window.removeEventListener('mouseenter', onMouseEnter)
  window.api.rpc.destroy()
})
</script>

<template>
  <div
    class="w-screen h-screen flex flex-col overflow-hidden relative"
    :class="{ 'rounded-[14px]': config.roundedCorners }"
  >
    <div
      v-if="config.theme.bgType === 'image' && config.theme.bgImageUrl && !config.integratedMode"
      class="absolute inset-0 pointer-events-none"
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
      class="absolute inset-0 pointer-events-none"
      :style="{
        background: config.bgColor,
        opacity: config.integratedMode ? 0 : config.theme.opacity,
        borderRadius: 'inherit',
      }"
    />
    <div class="relative flex flex-col flex-1 overflow-hidden" style="z-index: 1">
      <TitleBar />
      <router-view v-slot="{ Component }" class="flex-1 overflow-hidden">
        <Transition name="fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </div>
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
</style>
