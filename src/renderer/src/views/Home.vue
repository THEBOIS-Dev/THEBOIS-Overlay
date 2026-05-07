<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, Info, Users, ChevronUp, ChevronDown } from 'lucide-vue-next';
import PlayerRow from '@renderer/components/PlayerRow.vue';
import { usePlayersStore } from '@renderer/store/players';
import { useConfigStore } from '@renderer/store/config';
import {
  Column,
  COLUMNS,
  statColor,
  fmt,
  ratio,
  statVal,
  type Player,
} from '@renderer/types';

const players = usePlayersStore();
const config = useConfigStore();

const activeColumns = computed(() => config.activeColumns);

function colLabel(col: Column): string {
  if (config.columnLabels === 'HIDDEN') return '';
  if (config.columnLabels === 'SHORT') return COLUMNS[col].shortLabel;
  return COLUMNS[col].label;
}

function toggleSort(col: Column): void {
  if (config.sortBy === col) config.sortAscending = !config.sortAscending;
  else {
    config.sortBy = col;
    config.sortAscending = false;
  }
}

function getSortKey(p: Player): string | number {
  const def = COLUMNS[config.sortBy];
  if (config.sortBy === Column.NAME && def.getNum) return def.getNum(p);
  if (def.getNum && !def.getStr) return def.getNum(p);
  if (def.getStr) return def.getStr(p) ?? '';
  return 0;
}

const sortedPlayers = computed((): Player[] =>
  [...players.players].sort((a, b) => {
    if (a.loading && !b.loading) return 1;
    if (!a.loading && b.loading) return -1;
    const ak = getSortKey(a);
    const bk = getSortKey(b);
    const dir = config.sortAscending ? 1 : -1;
    if (typeof ak === 'number' && typeof bk === 'number') {
      if (config.sortBy === Column.NAME) return (ak - bk) * dir;
      return (bk - ak) * dir;
    }
    return String(ak).localeCompare(String(bk)) * dir;
  }),
);

function removePlayer(name: string): void {
  players.removeByName(name);
}

const avgFkdr = computed(() => {
  const loaded = sortedPlayers.value.filter((p) => p.stats && !p.loading);
  if (!loaded.length) return '—';
  const sum = loaded.reduce(
    (acc, p) =>
      acc + ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
    0,
  );
  return fmt(sum / loaded.length);
});

const avgFkdrColor = computed(() => {
  const loaded = sortedPlayers.value.filter((p) => p.stats && !p.loading);
  if (!loaded.length) return 'var(--color-ink-3)';
  const sum = loaded.reduce(
    (acc, p) =>
      acc + ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
    0,
  );
  return statColor(sum / loaded.length, [0, 1, 2, 4, 7, 12, 20, 35]);
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div
      v-if="players.logPathValid === false"
      class="flex shrink-0 items-center justify-between gap-3 px-3.5 py-1.5"
      style="
        background: rgba(251, 191, 36, 0.06);
        border-bottom: 1px solid rgba(251, 191, 36, 0.15);
        color: #fbbf24;
      "
    >
      <div class="flex items-center gap-2">
        <AlertTriangle :size="12" />
        <span style="font-size: 0.79rem"
          >Log file not configured — auto-detection disabled.</span
        >
      </div>
      <router-link
        to="/setup"
        class="font-semibold underline underline-offset-2 transition-opacity hover:opacity-70"
        style="font-size: 0.79rem"
      >
        Fix →
      </router-link>
    </div>

    <div
      v-if="config.missingPlayersWarning && players.missingCount > 0"
      class="flex shrink-0 items-center gap-2 px-3.5 py-1.5"
      style="
        background: rgba(248, 113, 113, 0.05);
        border-bottom: 1px solid rgba(248, 113, 113, 0.12);
        color: var(--color-bad);
      "
    >
      <Info :size="11" />
      <span style="font-size: 0.79rem">
        {{ players.missingCount }} player{{ players.missingCount !== 1 ? 's' : '' }}
        missing — type
        <code
          class="rounded px-1.5 py-0.5 font-mono"
          style="background: rgba(255, 255, 255, 0.07); font-size: 0.75rem"
        >
          /who
        </code>
        in-game
      </span>
    </div>

    <div
      v-if="sortedPlayers.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3"
    >
      <div class="relative">
        <div
          class="animate-pulse-dot absolute inset-0 rounded-full"
          style="
            background: radial-gradient(
              circle,
              rgba(124, 58, 237, 0.12) 0%,
              transparent 70%
            );
            transform: scale(2.2);
          "
        />
        <div
          class="relative flex h-14 w-14 items-center justify-center rounded-full"
          style="
            background: rgba(124, 58, 237, 0.08);
            border: 1px solid rgba(124, 58, 237, 0.2);
          "
        >
          <Users
            :size="22"
            style="color: rgba(184, 154, 255, 0.5)"
          />
        </div>
      </div>
      <div class="text-center">
        <div
          class="mb-0.5 font-semibold"
          style="font-size: 0.85rem; color: var(--color-ink-2)"
        >
          No players yet
        </div>
        <div style="font-size: 0.76rem; color: var(--color-ink-3)">
          Join a game or add players manually.
        </div>
      </div>
    </div>

    <div
      v-else
      class="themed-scroll flex-1 overflow-x-auto overflow-y-auto"
    >
      <table
        class="w-full border-separate"
        style="border-spacing: 0"
      >
        <thead
          v-if="!config.integratedMode && config.columnLabels !== 'HIDDEN'"
          class="sticky top-0 z-10"
          style="background: rgba(4, 6, 15, 0.97); backdrop-filter: blur(8px)"
        >
          <tr>
            <th
              v-for="col in activeColumns"
              :key="col"
              class="border-b px-2.5 py-2 font-bold select-none"
              :class="[
                col === Column.NAME ? 'text-left' : 'text-center',
                COLUMNS[col].sortable ? 'group cursor-pointer' : '',
              ]"
              style="
                border-color: rgba(120, 80, 255, 0.1);
                font-size: 0.68rem;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: var(--color-ink-3);
              "
              @click="COLUMNS[col].sortable && toggleSort(col)"
            >
              <div
                class="inline-flex items-center gap-1"
                :class="col !== Column.NAME ? 'justify-center' : ''"
              >
                <span
                  :style="config.sortBy === col ? 'color:var(--color-accent-light)' : ''"
                >
                  {{ colLabel(col) }}
                </span>
                <template v-if="config.sortBy === col">
                  <component
                    :is="config.sortAscending ? ChevronUp : ChevronDown"
                    :size="8"
                    style="color: var(--color-accent-light)"
                  />
                </template>
              </div>
            </th>
            <th
              class="w-6 border-b"
              style="border-color: rgba(120, 80, 255, 0.1)"
            />
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
      class="no-drag flex shrink-0 items-center justify-between border-t px-3.5 py-1.5"
      style="
        border-color: rgba(120, 80, 255, 0.1);
        background: rgba(4, 6, 15, 0.7);
        backdrop-filter: blur(4px);
      "
    >
      <span style="font-size: 0.75rem; color: var(--color-ink-3); font-weight: 500">
        {{ sortedPlayers.length }} player{{ sortedPlayers.length !== 1 ? 's' : '' }}
      </span>
      <div class="flex items-center gap-4">
        <span
          v-if="players.playersCount"
          style="font-size: 0.75rem; color: var(--color-ink-3)"
        >
          <span
            class="font-semibold"
            style="color: var(--color-accent-light)"
          >
            {{ sortedPlayers.filter((p) => p.source === 'auto').length }}
          </span>
          <span style="opacity: 0.55">/{{ players.playersCount }}</span>
        </span>
        <span
          class="font-semibold"
          style="font-size: 0.75rem"
          :style="{ color: avgFkdrColor }"
        >
          avg {{ avgFkdr }} FKDR
        </span>
      </div>
    </div>
  </div>
</template>
