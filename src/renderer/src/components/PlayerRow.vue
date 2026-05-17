<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import PlayerAvatar from './PlayerAvatar.vue';
import {
  Column,
  COLUMNS,
  statColor,
  fmt,
  getTopRankDisplay,
  playerNameColor,
  isStaff,
  levelColor,
  type Player,
} from '@renderer/types';

const props = defineProps<{ player: Player; activeColumns: Column[] }>();
defineEmits<{ remove: [name: string] }>();

const nameColor = computed(() => playerNameColor(props.player.profile));
const topRankDisplay = computed(() => getTopRankDisplay(props.player.profile));
const staffPlayer = computed(() => isStaff(props.player.profile));
const clanTag = computed(() => props.player.profile?.clan?.tag ?? null);
const statsDisabled = computed(() => props.player.error === 'stats_disabled');

const privateLevel = computed(() => {
  if (!statsDisabled.value) return null;
  const lvl = props.player.profile?.rank?.level;
  return typeof lvl === 'number' ? lvl : null;
});

const errorLabel = computed(() => {
  switch (props.player.error) {
    case 'rate_limited':
      return '429';
    case 'network':
      return 'ERR';
    case 'stats_disabled':
      return 'PRIVATE';
    default:
      return '?';
  }
});

const errorColor = computed(() => {
  switch (props.player.error) {
    case 'not_found':
      return 'var(--color-ink-3)';
    case 'rate_limited':
      return '#f97316';
    case 'stats_disabled':
      return 'var(--color-ink-3)';
    default:
      return 'var(--color-bad)';
  }
});

function cellValue(col: Column): string {
  const def = COLUMNS[col];
  if (def.fromProfile) {
    if (!props.player.profile) return '—';
    if (def.getNum) return fmt(def.getNum(props.player));
    return '—';
  }
  if (def.getStr) return def.getStr(props.player) ?? '—';
  if (!def.getNum) return '—';
  return fmt(def.getNum(props.player));
}

function cellColor(col: Column): string {
  const def = COLUMNS[col];
  if (def.getColor) return def.getColor(props.player);
  if (!def.thresholds || !def.getNum) return 'var(--color-ink-2)';
  return statColor(def.getNum(props.player), def.thresholds);
}
</script>

<template>
  <tr
    class="group glass-row animate-row-in border-b"
    style="border-color: rgba(120, 80, 255, 0.07)"
    :class="{
      'opacity-30': player.error === 'not_found',
    }"
  >
    <td
      v-for="col in activeColumns"
      :key="col"
      class="px-2.5 py-1.5 whitespace-nowrap"
      :class="col === Column.NAME ? 'text-left' : 'text-center'"
    >
      <template v-if="col === Column.NAME">
        <div class="flex min-w-0 items-center gap-1.5">
          <div
            v-if="player.teamColor"
            class="shrink-0 rounded-full"
            :style="{
              width: '3px',
              height: '18px',
              background: `linear-gradient(180deg, ${player.teamColor}ff 0%, ${player.teamColor}88 100%)`,
              boxShadow: `0 0 6px 1px ${player.teamColor}77`,
            }"
          />
          <PlayerAvatar
            :name="player.realName || player.name"
            :size="17"
            class="shrink-0"
            style="border-radius: 3px; opacity: 0.9"
          />
          <span
            v-if="topRankDisplay"
            class="tag shrink-0"
            :style="{
              color: nameColor,
              background: nameColor + '18',
              border: '1px solid ' + nameColor + '40',
            }"
          >
            {{ topRankDisplay }}
          </span>
          <span
            class="truncate"
            :style="{
              color: nameColor,
              fontFamily: 'var(--font-vt)',
              fontSize: '0.8rem',
              letterSpacing: '0.02em',
              textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
            }"
          >
            <template v-if="player.nicked && player.name !== player.realName">
              <span style="color: var(--color-nick)">{{ player.name }}</span>
              <span
                style="color: rgba(255, 255, 255, 0.2); margin: 0 3px; font-size: 0.68rem"
                >→</span
              >
              <span>{{ player.realName }}</span>
            </template>
            <template v-else>{{ player.realName || player.name }}</template>
          </span>
          <span
            v-if="player.nicked"
            class="tag shrink-0"
            style="
              background: rgba(253, 230, 138, 0.1);
              color: var(--color-nick);
              border: 1px solid rgba(253, 230, 138, 0.22);
            "
          >
            NICK
          </span>
          <span
            v-if="staffPlayer"
            class="tag shrink-0"
            style="
              background: rgba(255, 215, 0, 0.1);
              color: #ffd700;
              border: 1px solid rgba(255, 215, 0, 0.28);
            "
          >
            STAFF
          </span>
          <span
            v-if="clanTag"
            class="clan-badge shrink-0"
          >
            <span class="clan-badge-text">{{ clanTag }}</span>
          </span>
          <span
            v-if="statsDisabled"
            class="private-badge shrink-0"
            >PRIVATE</span
          >
        </div>
      </template>

      <template v-else-if="player.loading">
        <span
          class="animate-shimmer inline-block rounded"
          style="width: 40px; height: 9px; display: inline-block; vertical-align: middle"
        />
      </template>

      <template v-else-if="player.error">
        <span
          v-if="
            player.error !== 'not_found' &&
            player.error !== 'stats_disabled' &&
            (col === Column.FKDR || activeColumns.indexOf(col) === 1)
          "
          class="font-mono"
          style="font-size: 0.75rem"
          :style="{ color: errorColor }"
        >
          {{ errorLabel }}
        </span>
        <span
          v-else-if="
            player.error === 'stats_disabled' &&
            col === Column.LEVEL &&
            privateLevel !== null
          "
          class="font-mono font-medium tabular-nums"
          style="font-size: 0.85rem; letter-spacing: 0.01em"
          :style="{ color: levelColor(privateLevel) }"
        >
          {{ privateLevel }}
        </span>
        <span
          v-else
          style="color: var(--color-ink-3); font-size: 0.8rem"
          >—</span
        >
      </template>

      <template v-else-if="!player.stats && !COLUMNS[col].fromProfile">
        <span style="color: var(--color-ink-3); font-size: 0.8rem">—</span>
      </template>

      <template v-else>
        <span
          :style="{ color: cellColor(col) }"
          class="font-mono font-medium tabular-nums"
          style="font-size: 0.85rem; letter-spacing: 0.01em"
        >
          {{ cellValue(col) }}
        </span>
      </template>
    </td>

    <td class="w-6 pr-1.5 pl-1">
      <button
        class="btn h-5 w-5 rounded opacity-0 transition-opacity group-hover:opacity-100"
        style="color: var(--color-ink-3)"
        @click="$emit('remove', player.name)"
      >
        <X :size="10" />
      </button>
    </td>
  </tr>
</template>
