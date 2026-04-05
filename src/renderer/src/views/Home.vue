<script setup lang="ts">
import { computed } from 'vue'
import PlayerRow from '@renderer/components/PlayerRow.vue'
import { usePlayersStore } from '@renderer/store/players'
import { useConfigStore } from '@renderer/store/config'
import { Column, COLUMNS, statColor, fmt, ratio, statVal, type Player } from '@renderer/types'

const players = usePlayersStore()
const config = useConfigStore()

const activeColumns = computed(() => config.activeColumns)

function colLabel(col: Column): string {
  if (config.columnLabels === 'HIDDEN') return ''
  if (config.columnLabels === 'SHORT') return COLUMNS[col].shortLabel
  return COLUMNS[col].label
}

function toggleSort(col: Column): void {
  if (config.sortBy === col) config.sortAscending = !config.sortAscending
  else {
    config.sortBy = col
    config.sortAscending = false
  }
}

function getSortKey(p: Player): string | number {
  const def = COLUMNS[config.sortBy]
  if (config.sortBy === Column.NAME && def.getNum) return def.getNum(p)
  if (def.getNum && !def.getStr) return def.getNum(p)
  if (def.getStr) return def.getStr(p) ?? ''
  return 0
}

const sortedPlayers = computed((): Player[] =>
  [...players.players].sort((a, b) => {
    if (a.loading && !b.loading) return 1
    if (!a.loading && b.loading) return -1
    const ak = getSortKey(a)
    const bk = getSortKey(b)
    const dir = config.sortAscending ? 1 : -1
    if (typeof ak === 'number' && typeof bk === 'number') {
      if (config.sortBy === Column.NAME) return (ak - bk) * dir
      return (bk - ak) * dir
    }
    return String(ak).localeCompare(String(bk)) * dir
  }),
)

function removePlayer(name: string): void {
  players.removeByName(name)
}

const avgFkdr = computed(() => {
  const loaded = sortedPlayers.value.filter((p) => p.stats && !p.loading)
  if (!loaded.length) return '—'
  const sum = loaded.reduce(
    (acc, p) => acc + ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
    0,
  )
  return fmt(sum / loaded.length)
})

const avgFkdrColor = computed(() => {
  const loaded = sortedPlayers.value.filter((p) => p.stats && !p.loading)
  if (!loaded.length) return 'var(--color-ink-3)'
  const sum = loaded.reduce(
    (acc, p) => acc + ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
    0,
  )
  return statColor(sum / loaded.length, [0, 1, 2, 4, 7, 12, 20, 35])
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div
      v-if="players.logPathValid === false"
      class="flex items-center justify-between gap-3 px-3.5 py-2 text-xs shrink-0"
      style="
        background: rgba(251, 191, 36, 0.07);
        border-bottom: 1px solid rgba(251, 191, 36, 0.18);
        color: #fbbf24;
      "
    >
      <div class="flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
        </svg>
        <span style="font-size: 0.82rem">Log file not configured — auto-detection disabled.</span>
      </div>
      <router-link
        to="/setup"
        class="underline underline-offset-2 hover:opacity-80 transition-opacity font-semibold"
        style="font-size: 0.82rem"
      >
        Fix →
      </router-link>
    </div>

    <div
      v-if="config.missingPlayersWarning && players.missingCount > 0"
      class="flex items-center gap-2 px-3.5 py-1.5 shrink-0"
      style="
        background: rgba(248, 113, 113, 0.06);
        border-bottom: 1px solid rgba(248, 113, 113, 0.14);
        color: var(--color-bad);
      "
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
        />
      </svg>
      <span style="font-size: 0.82rem">
        {{ players.missingCount }} player{{ players.missingCount !== 1 ? 's' : '' }} missing — type
        <code
          class="px-1.5 py-0.5 rounded"
          style="
            background: rgba(255, 255, 255, 0.07);
            font-family: var(--font-mono);
            font-size: 0.78rem;
          "
        >
          /who
        </code>
        in-game
      </span>
    </div>

    <div
      v-if="sortedPlayers.length === 0"
      class="flex-1 flex flex-col items-center justify-center gap-4"
    >
      <div style="position: relative; width: 64px; height: 64px">
        <div
          style="
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 2px solid rgba(124, 58, 237, 0.2);
            animation: pulse-dot 2.5s ease-in-out infinite;
          "
        />
        <div
          style="
            position: absolute;
            inset: 8px;
            border-radius: 50%;
            border: 1px solid rgba(124, 58, 237, 0.12);
          "
        />
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="currentColor"
          style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: rgba(124, 58, 237, 0.45);
          "
        >
          <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
          />
        </svg>
      </div>
      <div class="text-center" style="color: var(--color-ink-3)">
        <div
          style="
            font-size: 0.92rem;
            font-weight: 500;
            margin-bottom: 4px;
            color: var(--color-ink-2);
          "
        >
          No players yet
        </div>
        <div style="font-size: 0.8rem; opacity: 0.65">Join a game or add players manually.</div>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto overflow-x-auto themed-scroll">
      <table class="w-full border-separate" style="border-spacing: 0">
        <thead
          v-if="!config.integratedMode && config.columnLabels !== 'HIDDEN'"
          class="sticky top-0 z-10"
          style="background: rgba(4, 6, 15, 0.96); backdrop-filter: blur(4px)"
        >
          <tr>
            <th
              v-for="col in activeColumns"
              :key="col"
              class="px-2.5 py-2 font-bold select-none border-b"
              :class="[
                col === Column.NAME ? 'text-left' : 'text-center',
                COLUMNS[col].sortable ? 'cursor-pointer' : '',
              ]"
              style="
                border-color: rgba(120, 80, 255, 0.14);
                font-size: 0.72rem;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--color-ink-3);
              "
              @click="COLUMNS[col].sortable && toggleSort(col)"
            >
              <div
                class="inline-flex items-center gap-1"
                :class="col !== Column.NAME ? 'justify-center' : ''"
              >
                <span :style="config.sortBy === col ? 'color: var(--color-accent-light)' : ''">
                  {{ colLabel(col) }}
                </span>
                <template v-if="config.sortBy === col">
                  <svg
                    viewBox="0 0 24 24"
                    width="9"
                    height="9"
                    fill="currentColor"
                    style="color: var(--color-accent-light)"
                  >
                    <path v-if="config.sortAscending" d="M7 14l5-5 5 5z" />
                    <path v-else d="M7 10l5 5 5-5z" />
                  </svg>
                </template>
              </div>
            </th>
            <th class="w-6 border-b" style="border-color: rgba(120, 80, 255, 0.14)" />
          </tr>
        </thead>
        <tbody>
          <PlayerRow
            v-for="player in sortedPlayers"
            :key="player.realName"
            :player="player"
            :active-columns="activeColumns"
            @remove="removePlayer"
          />
        </tbody>
      </table>
    </div>

    <div
      v-if="sortedPlayers.length > 0 && !config.integratedMode"
      class="flex items-center justify-between px-3.5 py-2 shrink-0 border-t no-drag"
      style="
        border-color: rgba(120, 80, 255, 0.12);
        background: linear-gradient(180deg, rgba(4, 6, 15, 0.6) 0%, rgba(8, 5, 22, 0.8) 100%);
        font-size: 0.78rem;
        color: var(--color-ink-3);
      "
    >
      <span style="font-weight: 500">
        {{ sortedPlayers.length }} player{{ sortedPlayers.length !== 1 ? 's' : '' }}
      </span>
      <div class="flex items-center gap-4">
        <span v-if="players.playersCount" style="color: var(--color-ink-3)">
          <span style="color: var(--color-accent-light); font-weight: 600">
            {{ sortedPlayers.filter((p) => p.source === 'auto').length }}
          </span>
          <span style="opacity: 0.6">/{{ players.playersCount }}</span>
        </span>
        <span :style="{ color: avgFkdrColor, fontWeight: 600 }">avg {{ avgFkdr }} FKDR</span>
      </div>
    </div>
  </div>
</template>
