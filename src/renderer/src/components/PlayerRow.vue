<script setup lang="ts">
import { computed } from 'vue'
import PlayerAvatar from './PlayerAvatar.vue'
import {
  Column,
  COLUMNS,
  statColor,
  fmt,
  getTopRankDisplay,
  playerNameColor,
  isStaff,
  type Player,
} from '@renderer/types'

const props = defineProps<{ player: Player; activeColumns: Column[] }>()
defineEmits<{ remove: [name: string] }>()

const nameColor = computed(() => playerNameColor(props.player.profile))
const topRankDisplay = computed(() => getTopRankDisplay(props.player.profile))
const staffPlayer = computed(() => isStaff(props.player.profile))

const clanTag = computed(() => props.player.profile?.clan?.tag ?? null)

const CLAN_GRADIENT_STOPS = [
  '#a78bfa', // violet
  '#818cf8', // indigo
  '#38bdf8', // sky
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#a78bfa', // loop back
]

const clanTagStyle = computed(() => {
  const stops = CLAN_GRADIENT_STOPS.join(', ')
  return {
    background: 'rgba(129,140,248,0.08)',
    backgroundImage: 'linear-gradient(90deg, ' + stops + ')',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    border: '1px solid rgba(167,139,250,0.35)',
    boxShadow: '0 0 8px rgba(129,140,248,0.18), inset 0 0 6px rgba(167,139,250,0.06)',
    padding: '1px 6px',
    fontWeight: '600',
    letterSpacing: '0.04em',
    fontSize: '0.72rem',
  }
})

const errorLabel = computed(() => {
  switch (props.player.error) {
    case 'not_found':
      return 'N/A'
    case 'rate_limited':
      return '429'
    case 'network':
      return 'ERR'
    default:
      return '?'
  }
})

const errorColor = computed(() => {
  switch (props.player.error) {
    case 'not_found':
      return 'var(--color-ink-3)'
    case 'rate_limited':
      return '#f97316'
    default:
      return 'var(--color-bad)'
  }
})

function cellValue(col: Column): string {
  const def = COLUMNS[col]
  if (def.getStr) return def.getStr(props.player) ?? '—'
  if (!def.getNum) return '—'
  const n = def.getNum(props.player)
  return fmt(n)
}

function cellColor(col: Column): string {
  const def = COLUMNS[col]
  if (!def.thresholds || !def.getNum) return 'var(--color-ink-2)'
  return statColor(def.getNum(props.player), def.thresholds)
}
</script>

<template>
  <tr
    class="group glass-row border-b animate-row-in"
    style="border-color: rgba(120, 80, 255, 0.08)"
    :class="{ 'opacity-35': player.error === 'not_found' }"
  >
    <td
      v-for="col in activeColumns"
      :key="col"
      class="px-2.5 py-2 whitespace-nowrap"
      :class="col === Column.NAME ? 'text-left' : 'text-center'"
    >
      <!-- NAME cell -->
      <template v-if="col === Column.NAME">
        <div class="flex items-center gap-2 min-w-0">
          <!-- Minecraft head avatar -->
          <PlayerAvatar
            :name="player.realName || player.name"
            :size="18"
            class="shrink-0"
            style="border-radius: 3px; border: 1px solid rgba(124, 58, 237, 0.22)"
          />

          <!-- Rank tag -->
          <span
            v-if="topRankDisplay"
            class="tag shrink-0"
            :style="{
              color: nameColor,
              background: nameColor + '22',
              border: '1px solid ' + nameColor + '55',
            }"
          >
            {{ topRankDisplay }}
          </span>

          <!-- Username in Russo One font, colored by rank -->
          <!-- Username — when nicked show: nick → realName -->
          <span
            class="truncate"
            :style="{
              color: nameColor,
              fontFamily: 'var(--font-vt)',
              fontSize: '0.82rem',
              letterSpacing: '0.02em',
              textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            }"
          >
            <template v-if="player.nicked && player.name !== player.realName">
              <span style="color: var(--color-nick)">{{ player.name }}</span>
              <span style="color: rgba(255, 255, 255, 0.25); margin: 0 3px; font-size: 0.7rem">
                →
              </span>
              <span>{{ player.realName }}</span>
            </template>
            <template v-else>{{ player.realName || player.name }}</template>
          </span>

          <!-- NICK badge -->
          <span
            v-if="player.nicked"
            class="tag shrink-0"
            style="
              background: rgba(253, 230, 138, 0.12);
              color: var(--color-nick);
              border: 1px solid rgba(253, 230, 138, 0.25);
            "
          >
            NICK
          </span>

          <!-- STAFF badge -->
          <span
            v-if="staffPlayer"
            class="tag shrink-0"
            style="
              background: rgba(255, 215, 0, 0.12);
              color: #ffd700;
              border: 1px solid rgba(255, 215, 0, 0.35);
            "
          >
            STAFF
          </span>

          <!-- CLAN tag -->
          <span v-if="clanTag" class="tag shrink-0" :style="clanTagStyle">{{ clanTag }}</span>
        </div>
      </template>

      <!-- LOADING shimmer -->
      <template v-else-if="player.loading">
        <span class="inline-block w-12 h-2.5 rounded animate-shimmer" />
      </template>

      <!-- ERROR -->
      <template v-else-if="player.error">
        <span
          v-if="col === Column.FKDR || activeColumns.indexOf(col) === 1"
          style="font-size: 0.78rem; font-family: var(--font-mono)"
          :style="{ color: errorColor }"
        >
          {{ errorLabel }}
        </span>
        <span v-else style="color: var(--color-ink-3); font-size: 0.82rem">—</span>
      </template>

      <!-- NULL STATS — fetched OK but no BW data returned -->
      <template v-else-if="!player.stats">
        <span style="color: var(--color-ink-3); font-size: 0.82rem">—</span>
      </template>

      <!-- NUMERIC stat -->
      <template v-else>
        <span
          :style="{ color: cellColor(col) }"
          style="
            font-family: var(--font-mono);
            font-size: 0.88rem;
            font-weight: 500;
            letter-spacing: 0.02em;
          "
        >
          {{ cellValue(col) }}
        </span>
      </template>
    </td>

    <!-- Remove button -->
    <td class="pl-1 pr-2 w-6">
      <button
        class="btn w-5 h-5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style="color: var(--color-ink-3)"
        @click="$emit('remove', player.name)"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
          <path
            d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </td>
  </tr>
</template>
