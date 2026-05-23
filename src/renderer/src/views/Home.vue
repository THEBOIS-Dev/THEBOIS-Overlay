<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  AlertTriangle,
  Info,
  Users,
  ChevronUp,
  ChevronDown,
  Swords,
  Wifi,
  X,
} from 'lucide-vue-next';
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
  getRankSortIndex,
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

function getDataTier(p: Player): number {
  if (p.loading || p.error || !p.stats) return 2;
  const s = p.stats;
  const hasAny =
    statVal(s['Final kills']) > 0 ||
    statVal(s['Final deaths']) > 0 ||
    statVal(s['Wins']) > 0 ||
    statVal(s['Losses']) > 0 ||
    statVal(s['Kills']) > 0 ||
    statVal(s['Deaths']) > 0;
  return hasAny ? 0 : 1;
}

function sortPlayers(list: Player[]): Player[] {
  return [...list].sort((a, b) => {
    if (a.loading && !b.loading) return 1;
    if (!a.loading && b.loading) return -1;
    const ak = getSortKey(a);
    const bk = getSortKey(b);
    const dir = config.sortAscending ? 1 : -1;
    if (config.sortBy === Column.NAME) {
      const ra = getRankSortIndex(a.profile);
      const rb = getRankSortIndex(b.profile);
      if (ra !== rb) return ra - rb;
      const ta = getDataTier(a);
      const tb = getDataTier(b);
      if (ta !== tb) return ta - tb;
      if (typeof ak === 'number' && typeof bk === 'number') return (ak - bk) * dir;
      return String(ak).localeCompare(String(bk)) * dir;
    }
    if (typeof ak === 'number' && typeof bk === 'number') return (bk - ak) * dir;
    return String(ak).localeCompare(String(bk)) * dir;
  });
}

const sortedPlayers = computed((): Player[] => sortPlayers(players.players));

const hasTeamData = computed(() => players.players.some((p) => p.team !== null));

interface TeamGroup {
  name: string;
  color: string;
  players: Player[];
  avgFkdr: string;
  avgFkdrColor: string;
}

const teamGroups = computed((): TeamGroup[] => {
  if (!hasTeamData.value) return [];
  const map = new Map<string, { name: string; color: string; players: Player[] }>();
  for (const p of players.players) {
    if (!p.team) continue;
    const key = p.team;
    if (!map.has(key))
      map.set(key, { name: p.team, color: p.teamColor ?? '#AAAAAA', players: [] });
    map.get(key)!.players.push(p);
  }
  return [...map.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const sorted = sortPlayers(g.players);
      const loaded = sorted.filter((p) => p.stats && !p.loading);
      let fkdrVal = '—';
      let fkdrColor = 'var(--color-ink-3)';
      if (loaded.length) {
        const sum = loaded.reduce(
          (acc, p) =>
            acc +
            ratio(statVal(p.stats?.['Final kills']), statVal(p.stats?.['Final deaths'])),
          0,
        );
        const avg = sum / loaded.length;
        fkdrVal = fmt(avg);
        fkdrColor = statColor(avg, [0, 1, 2, 4, 7, 12, 20, 35]);
      }
      return {
        name: g.name,
        color: g.color,
        players: sorted,
        avgFkdr: fkdrVal,
        avgFkdrColor: fkdrColor,
      };
    });
});

const ungroupedPlayers = computed((): Player[] =>
  hasTeamData.value ? sortPlayers(players.players.filter((p) => !p.team)) : [],
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

const proxyConnected = computed(() => players.proxyConnectedNetwork !== null);
const showProxyBanner = computed(
  () => !proxyConnected.value && !config.proxyBannerDismissed,
);

watch(
  () => players.proxyConnectedNetwork,
  (newVal, oldVal) => {
    if (newVal === null && oldVal !== null) {
      config.proxyBannerDismissed = false;
    }
  },
);

function dismissProxyBanner(): void {
  config.proxyBannerDismissed = true;
}

const activeNetworkLabel = computed(() =>
  config.network === 'jartexnetwork' ? 'JartexNetwork' : 'PikaNetwork',
);
const activeNetworkPort = computed(() =>
  config.network === 'jartexnetwork' ? config.jartexProxyPort : config.pikaProxyPort,
);

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

const headerBackground = computed(() => {
  const t = config.theme;
  let hex = t.bgColor;
  if (t.bgType === 'gradient' && t.bgGradientStops.length) {
    hex = [...t.bgGradientStops].sort((a, b) => a.position - b.position)[0].color;
  } else if (t.bgType === 'image') {
    hex = '#0b0f19';
  }
  const [r, g, b] = hexToRgb(hex);
  const alpha = Math.max(0.05, t.opacity * 0.13);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      v-if="showProxyBanner"
      class="no-drag proxy-banner flex shrink-0 items-center justify-between gap-3 px-3 py-2"
    >
      <div class="flex min-w-0 items-center gap-2">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style="
            background: rgba(var(--color-accent-rgb), 0.12);
            border: 1px solid rgba(var(--color-accent-rgb), 0.28);
          "
        >
          <Wifi
            :size="16"
            style="color: var(--color-accent-light)"
          />
        </div>
        <div class="min-w-0">
          <div
            style="
              font-size: 0.85rem;
              font-weight: 600;
              color: var(--color-accent-light);
              line-height: 1.2;
            "
          >
            Proxy not connected
          </div>
          <div
            class="truncate"
            style="
              font-size: 0.8rem;
              color: var(--color-ink-3);
              line-height: 1.35;
              margin-top: 1px;
            "
          >
            Connect to {{ activeNetworkLabel }} using
            <span
              class="font-mono"
              style="color: var(--color-ink-2)"
            >
              {{
                config.proxyBindHost === '0.0.0.0' ? '&lt;your-ip&gt;' : 'localhost'
              }}:{{ activeNetworkPort }}
            </span>
            to enable team detection and automation features.
          </div>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <router-link
          to="/settings?tab=advanced"
          class="rounded-md px-2 py-1 font-semibold transition-all"
          style="
            font-size: 0.68rem;
            background: rgba(var(--color-accent-rgb), 0.12);
            border: 1px solid rgba(var(--color-accent-rgb), 0.28);
            color: var(--color-accent-light);
          "
        >
          Configure
        </router-link>
        <button
          class="flex h-5 w-5 items-center justify-center rounded transition-opacity hover:opacity-60"
          style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--color-ink-3);
          "
          @click="dismissProxyBanner"
        >
          <X :size="9" />
        </button>
      </div>
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
          >/who</code
        >
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
              rgba(var(--color-accent-rgb), 0.12) 0%,
              transparent 70%
            );
            transform: scale(2.2);
          "
        />
        <div
          class="relative flex h-14 w-14 items-center justify-center rounded-full"
          style="
            background: rgba(var(--color-accent-rgb), 0.08);
            border: 1px solid rgba(var(--color-accent-rgb), 0.2);
          "
        >
          <Users
            :size="22"
            style="color: rgba(var(--color-accent-rgb), 0.5)"
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
      style="
        background: radial-gradient(
          ellipse at 50% 35%,
          rgba(255, 45, 85, 0.06) 0%,
          transparent 70%
        );
      "
    >
      <template v-if="hasTeamData">
        <table
          class="w-full border-separate"
          style="border-spacing: 0"
        >
          <thead
            v-if="!config.integratedMode && config.columnLabels !== 'HIDDEN'"
            class="sticky top-0 z-10"
            :style="{
              background: headerBackground,
              backdropFilter: 'blur(8px)',
              opacity: config.theme.opacity,
            }"
          >
            <tr>
              <th
                v-for="col in activeColumns"
                :key="col"
                class="border-b px-2.5 py-2 font-bold select-none"
                :class="[
                  col === Column.NAME ? 'text-left' : 'text-center',
                  COLUMNS[col].sortable ? 'cursor-pointer' : '',
                ]"
                style="
                  border-color: rgba(var(--color-accent-rgb), 0.1);
                  font-size: 0.68rem;
                  letter-spacing: 0.1em;
                  text-transform: uppercase;
                  color: var(--color-ink-2);
                "
                @click="COLUMNS[col].sortable && toggleSort(col)"
              >
                <div
                  class="inline-flex items-center gap-1"
                  :class="col !== Column.NAME ? 'justify-center' : ''"
                >
                  <span
                    :style="
                      config.sortBy === col ? 'color:var(--color-accent-light)' : ''
                    "
                    >{{ colLabel(col) }}</span
                  >
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
                style="border-color: rgba(var(--color-accent-rgb), 0.1)"
              />
            </tr>
          </thead>
          <tbody>
            <template
              v-for="group in teamGroups"
              :key="group.name"
            >
              <tr class="team-header-row-tr">
                <td
                  :colspan="activeColumns.length + 1"
                  style="padding: 0"
                >
                  <div
                    class="team-header-row flex items-center justify-between px-3 py-2"
                    :style="{
                      '--team-color': group.color,
                      background: `linear-gradient(90deg, ${group.color}20 0%, ${group.color}0a 45%, transparent 100%)`,
                      borderTop: `1px solid ${group.color}28`,
                      borderBottom: `1px solid ${group.color}1a`,
                    }"
                  >
                    <div class="flex items-center gap-2.5">
                      <div
                        class="team-pip-wrap relative flex items-center justify-center"
                      >
                        <div
                          class="team-pip-glow absolute rounded-full"
                          :style="{
                            background: group.color,
                            width: '14px',
                            height: '14px',
                            opacity: 0.18,
                            filter: 'blur(4px)',
                          }"
                        />
                        <div
                          class="team-pip relative rounded-full"
                          :style="{
                            background: group.color,
                            width: '6px',
                            height: '6px',
                            boxShadow: `0 0 5px 1px ${group.color}cc`,
                          }"
                        />
                      </div>
                      <span
                        class="team-name font-black uppercase"
                        :style="{
                          color: group.color,
                          fontSize: '0.6rem',
                          letterSpacing: '0.18em',
                        }"
                      >
                        {{ group.name }}
                      </span>
                      <span
                        class="team-badge rounded-full font-bold tabular-nums"
                        :style="{
                          fontSize: '0.56rem',
                          color: group.color,
                          background: group.color + '18',
                          border: `1px solid ${group.color}30`,
                          padding: '1px 6px',
                        }"
                      >
                        {{ group.players.length }}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <div
                        class="team-divider"
                        :style="{ background: group.color + '30' }"
                      />
                      <span
                        class="font-mono font-bold tabular-nums"
                        style="
                          font-size: 0.62rem;
                          letter-spacing: 0.04em;
                          display: inline-flex;
                          align-items: baseline;
                          gap: 2px;
                        "
                        :style="{ color: group.avgFkdrColor }"
                      >
                        <span
                          style="display: inline-block; min-width: 5ch; text-align: right"
                          >{{ group.avgFkdr }}</span
                        ><span style="opacity: 0.45; font-size: 0.54rem">FKDR</span>
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
              <PlayerRow
                v-for="player in group.players"
                :key="player.realName"
                :player="player"
                :active-columns="activeColumns"
                @remove="removePlayer"
              />
            </template>
            <template v-if="ungroupedPlayers.length > 0">
              <tr>
                <td
                  :colspan="activeColumns.length + 1"
                  style="padding: 0"
                >
                  <div
                    class="flex items-center gap-2.5 px-3 py-2"
                    style="
                      background: rgba(255, 255, 255, 0.015);
                      border-top: 1px solid rgba(255, 255, 255, 0.045);
                      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
                    "
                  >
                    <div class="relative flex items-center justify-center">
                      <div
                        class="absolute rounded-full"
                        style="
                          width: 14px;
                          height: 14px;
                          background: rgba(150, 150, 150, 0.08);
                          filter: blur(3px);
                        "
                      />
                      <div
                        class="relative rounded-full"
                        style="
                          width: 6px;
                          height: 6px;
                          background: rgba(120, 120, 120, 0.35);
                          border: 1px solid rgba(150, 150, 150, 0.2);
                        "
                      />
                    </div>
                    <span
                      class="font-black uppercase"
                      style="
                        font-size: 0.6rem;
                        letter-spacing: 0.18em;
                        color: var(--color-ink-3);
                      "
                      >Unassigned</span
                    >
                    <span
                      class="rounded-full font-bold tabular-nums"
                      style="
                        font-size: 0.56rem;
                        padding: 1px 6px;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        color: var(--color-ink-3);
                      "
                    >
                      {{ ungroupedPlayers.length }}
                    </span>
                  </div>
                </td>
              </tr>
              <PlayerRow
                v-for="player in ungroupedPlayers"
                :key="player.realName"
                :player="player"
                :active-columns="activeColumns"
                @remove="removePlayer"
              />
            </template>
          </tbody>
        </table>
      </template>

      <template v-else>
        <table
          class="w-full border-separate"
          style="border-spacing: 0"
        >
          <thead
            v-if="!config.integratedMode && config.columnLabels !== 'HIDDEN'"
            class="sticky top-0 z-10"
            :style="{
              background: headerBackground,
              backdropFilter: 'blur(8px)',
              opacity: config.theme.opacity,
            }"
          >
            <tr>
              <th
                v-for="col in activeColumns"
                :key="col"
                class="border-b px-2.5 py-2 font-bold select-none"
                :class="[
                  col === Column.NAME ? 'text-left' : 'text-center',
                  COLUMNS[col].sortable ? 'cursor-pointer' : '',
                ]"
                style="
                  border-color: rgba(var(--color-accent-rgb), 0.1);
                  font-size: 0.68rem;
                  letter-spacing: 0.1em;
                  text-transform: uppercase;
                  color: var(--color-ink-2);
                "
                @click="COLUMNS[col].sortable && toggleSort(col)"
              >
                <div
                  class="inline-flex items-center gap-1"
                  :class="col !== Column.NAME ? 'justify-center' : ''"
                >
                  <span
                    :style="
                      config.sortBy === col ? 'color:var(--color-accent-light)' : ''
                    "
                    >{{ colLabel(col) }}</span
                  >
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
                style="border-color: rgba(var(--color-accent-rgb), 0.1)"
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
      </template>
    </div>

    <div
      v-if="sortedPlayers.length > 0 && !config.integratedMode"
      class="no-drag flex shrink-0 items-center justify-between px-3.5 py-1.5"
      :style="{
        borderTop: '0.5px solid rgba(var(--color-accent-rgb), 0.08)',
        background: headerBackground,
        backdropFilter: 'blur(4px)',
        opacity: config.theme.opacity,
      }"
    >
      <div class="flex items-center gap-2">
        <span style="font-size: 0.74rem; color: var(--color-ink-3); font-weight: 500">
          {{ sortedPlayers.length }} player{{ sortedPlayers.length !== 1 ? 's' : '' }}
        </span>
        <span
          v-if="hasTeamData"
          class="flex items-center gap-1 rounded px-1.5 py-0.5"
          style="
            font-size: 0.6rem;
            font-weight: 600;
            background: rgba(var(--color-accent-rgb), 0.12);
            border: 1px solid rgba(var(--color-accent-rgb), 0.25);
            color: var(--color-accent-light);
          "
        >
          <Swords :size="8" />
          {{ teamGroups.length }} teams
        </span>
      </div>
      <span
        class="font-semibold"
        style="font-size: 0.74rem"
        :style="{ color: avgFkdrColor }"
        >avg {{ avgFkdr }} FKDR</span
      >
    </div>
  </div>
</template>

<style scoped>
.proxy-banner {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid rgba(var(--color-accent-rgb), 0.18);
}
.proxy-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  width: 300%;
  left: -100%;
  background: linear-gradient(
    105deg,
    rgba(var(--color-accent-rgb), 0.07) 0%,
    rgba(var(--color-accent-rgb), 0.03) 50%,
    rgba(var(--color-accent-rgb), 0.05) 100%
  );
  will-change: transform;
  animation: banner-shimmer 6s ease-in-out infinite;
  pointer-events: none;
}
.team-header-row {
  position: relative;
  overflow: hidden;
}
.team-header-row::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.025) 50%,
    transparent 100%
  );
  width: 200%;
  left: -100%;
  animation: team-scan 7s ease-in-out infinite;
  pointer-events: none;
}
.team-pip {
  animation: pip-breathe 2.8s ease-in-out infinite;
}
.team-pip-glow {
  animation: pip-breathe 2.8s ease-in-out infinite;
}
.team-name {
  animation: name-settle 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.team-divider {
  width: 1px;
  height: 10px;
  border-radius: 1px;
  flex-shrink: 0;
}
@keyframes pip-breathe {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
@keyframes team-scan {
  0% {
    transform: translateX(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  50% {
    transform: translateX(60%);
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateX(0);
    opacity: 0;
  }
}
@keyframes name-settle {
  from {
    opacity: 0;
    transform: translateX(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
