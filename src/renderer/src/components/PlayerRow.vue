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

const props = defineProps<{
  player: Player;
  activeColumns: Column[];
}>();

defineEmits<{
  remove: [name: string];
}>();

const nameColor = computed(() => playerNameColor(props.player.profile));
const topRankDisplay = computed(() => getTopRankDisplay(props.player.profile));
const staffPlayer = computed(() => isStaff(props.player.profile));
const clanTag = computed(() => props.player.profile?.clan?.tag ?? null);
const statsDisabled = computed(() => props.player.error === 'stats_disabled');

type ClanSegment = { type: 'icon'; value: string } | { type: 'text'; value: string };

const parsedClanTag = computed<ClanSegment[] | null>(() => {
  const tag = clanTag.value;
  if (!tag) return null;

  const result: ClanSegment[] = [];

  for (const char of tag) {
    const isIcon = !/[a-zA-Z0-9 ]/.test(char);

    if (isIcon) {
      result.push({ type: 'icon', value: char });
    } else {
      const last = result[result.length - 1];

      if (last && last.type === 'text') {
        last.value += char;
      } else {
        result.push({ type: 'text', value: char });
      }
    }
  }

  return result.length > 0 ? result : null;
});

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

    if (def.getNum) {
      return fmt(def.getNum(props.player));
    }

    return '—';
  }

  if (def.getStr) {
    return def.getStr(props.player) ?? '—';
  }

  if (!def.getNum) return '—';

  return fmt(def.getNum(props.player));
}

function cellColor(col: Column): string {
  const def = COLUMNS[col];

  if (def.getColor) {
    return def.getColor(props.player);
  }

  if (!def.thresholds || !def.getNum) {
    return 'var(--color-ink-2)';
  }

  return statColor(def.getNum(props.player), def.thresholds);
}
</script>

<template>
  <tr
    class="group player-row border-b"
    style="border-color: rgba(255, 255, 255, 0.035); overflow: visible !important"
    :class="{
      'opacity-30': player.error === 'not_found' && !player.nicked,
      'nicked-row': player.nicked,
    }"
  >
    <td
      v-for="col in activeColumns"
      :key="col"
      class="cell whitespace-nowrap"
      :style="{ overflow: 'visible !important' }"
      :class="col === Column.NAME ? 'name-cell text-left' : 'text-center'"
    >
      <template v-if="col === Column.NAME">
        <div class="name-wrapper">
          <div
            v-if="player.teamColor"
            class="team-indicator"
            :style="{
              background: player.teamColor,
            }"
          />

          <PlayerAvatar
            :name="player.realName || player.name"
            :size="17"
            class="avatar"
          />

          <span
            v-if="topRankDisplay"
            class="rank-text"
            :style="{ color: nameColor }"
          >
            {{ topRankDisplay }}
          </span>

          <span
            class="name-text truncate"
            :style="{ color: nameColor }"
          >
            <template v-if="player.nicked && player.name !== player.realName">
              <span style="color: var(--color-nick)">
                {{ player.name }}
              </span>

              <span class="arrow-separator"> → </span>

              <span>
                {{ player.realName }}
              </span>
            </template>

            <template v-else>
              {{ player.realName || player.name }}
            </template>
          </span>

          <span
            v-if="parsedClanTag"
            class="clan-tag-wrapper"
          >
            <span class="clan-bracket">[</span>

            <template
              v-for="(seg, i) in parsedClanTag"
              :key="i"
            >
              <span
                v-if="seg.type === 'icon'"
                class="clan-icon"
                >{{ seg.value }}</span
              >

              <span
                v-else
                class="clan-text-inner"
                >{{ seg.value }}</span
              >
            </template>

            <span class="clan-bracket">]</span>
          </span>

          <span
            v-if="player.nicked"
            class="nick-icon-wrapper"
          >
            <img
              src="/nick.svg"
              alt="nick"
              class="nick-badge"
            />
            <span class="tooltip nick-tooltip">The player is nicked</span>
          </span>

          <span
            v-if="staffPlayer"
            class="badge badge-staff"
          >
            STAFF
          </span>

          <span
            v-if="statsDisabled"
            class="lock-icon-wrapper"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
            >
              <defs>
                <filter
                  id="lock-glow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur
                    stdDeviation="1.7"
                    result="blur"
                  />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                <linearGradient
                  id="cc-stroke"
                  x1="1"
                  y1="1"
                  x2="14"
                  y2="14"
                >
                  <stop
                    offset="0%"
                    stop-color="#ff7ad9"
                  />
                  <stop
                    offset="50%"
                    stop-color="#c084fc"
                  />
                  <stop
                    offset="100%"
                    stop-color="#60dfff"
                  />
                </linearGradient>

                <linearGradient
                  id="cc-fill"
                  x1="1"
                  y1="6"
                  x2="14"
                  y2="14"
                >
                  <stop
                    offset="0%"
                    stop-color="#ff7ad9"
                    stop-opacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stop-color="#60dfff"
                    stop-opacity="0.24"
                  />
                </linearGradient>
              </defs>

              <g filter="url(#lock-glow)">
                <path
                  d="M4.5 6.5V4.5a3 3 0 0 1 6 0v2"
                  stroke="url(#cc-stroke)"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />

                <rect
                  x="2.5"
                  y="6.5"
                  width="10"
                  height="7"
                  rx="2"
                  fill="url(#cc-fill)"
                  stroke="url(#cc-stroke)"
                  stroke-width="1.5"
                />

                <circle
                  cx="7.5"
                  cy="10"
                  r="1"
                  fill="#ffffff"
                  opacity="0.98"
                />
              </g>
            </svg>
            <span class="tooltip lock-tooltip"
              >Public stats are disabled for the player</span
            >
          </span>
        </div>
      </template>

      <template v-else-if="player.loading">
        <span
          class="animate-shimmer inline-block rounded"
          style="width: 40px; height: 9px; display: inline-block"
        />
      </template>

      <template v-else-if="player.error">
        <span
          v-if="
            player.error !== 'not_found' &&
            player.error !== 'stats_disabled' &&
            (col === Column.FKDR || activeColumns.indexOf(col) === 1)
          "
          class="stat-text"
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
          class="stat-text"
          :style="{ color: levelColor(privateLevel) }"
        >
          {{ privateLevel }}
        </span>

        <span
          v-else
          class="stat-empty"
        >
          —
        </span>
      </template>

      <template v-else-if="!player.stats && !COLUMNS[col].fromProfile">
        <span class="stat-empty"> — </span>
      </template>

      <template v-else>
        <span
          class="stat-text"
          :style="{ color: cellColor(col) }"
        >
          {{ cellValue(col) }}
        </span>
      </template>
    </td>

    <td
      class="remove-cell"
      style="overflow: visible !important"
    >
      <button
        class="btn remove-btn"
        @click="$emit('remove', player.name)"
      >
        <X :size="10" />
      </button>
    </td>
  </tr>
</template>

<style scoped>
.player-row {
  position: relative;
  overflow: visible !important;

  background: linear-gradient(
    90deg,
    rgba(255, 0, 140, 0.01) 0%,
    rgba(168, 85, 247, 0.008) 50%,
    rgba(0, 229, 255, 0.006) 100%
  );

  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.player-row:hover {
  background: linear-gradient(
    90deg,
    rgba(255, 0, 140, 0.018) 0%,
    rgba(168, 85, 247, 0.014) 50%,
    rgba(0, 229, 255, 0.012) 100%
  );
}

.nicked-row {
  background:
    linear-gradient(
        115deg,
        transparent 25%,
        rgba(255, 255, 255, 0.13) 50%,
        transparent 75%
      )
      no-repeat,
    linear-gradient(
      90deg,
      rgba(255, 0, 98, 0.16) 0%,
      rgba(255, 102, 0, 0.15) 18%,
      rgba(255, 217, 0, 0.12) 38%,
      rgba(174, 0, 255, 0.12) 62%,
      rgba(0, 225, 255, 0.1) 100%
    );

  background-size:
    300% 100%,
    100% 100%;
  background-position:
    -200% center,
    0 0;

  animation: nickShine 3.2s linear infinite;

  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.05),
    inset 0 0 18px rgba(255, 0, 140, 0.08),
    0 0 18px rgba(255, 0, 170, 0.08);
}

.nicked-row:hover {
  transform: translateY(-1px);

  background:
    linear-gradient(
        115deg,
        transparent 25%,
        rgba(255, 255, 255, 0.13) 50%,
        transparent 75%
      )
      no-repeat,
    linear-gradient(
      90deg,
      rgba(255, 0, 98, 0.22) 0%,
      rgba(255, 102, 0, 0.2) 18%,
      rgba(255, 217, 0, 0.16) 38%,
      rgba(174, 0, 255, 0.16) 62%,
      rgba(0, 225, 255, 0.14) 100%
    );

  background-size:
    300% 100%,
    100% 100%;
  background-position:
    -200% center,
    0 0;

  animation: nickShine 3.2s linear infinite;
}

@keyframes nickShine {
  0% {
    background-position:
      -200% center,
      0 0;
  }
  100% {
    background-position:
      200% center,
      0 0;
  }
}

.cell {
  padding: 6px 10px;
  vertical-align: middle;
  position: relative;
  z-index: 1;
  overflow: visible !important;
}

.name-cell {
  padding-left: 8px !important;
  width: 1%;
  text-align: left !important;
  z-index: 10;
}

.name-wrapper {
  display: flex;
  width: 100%;
  align-items: center;
  min-height: 18px;
  gap: 7px;
  min-width: 120px;
  overflow: visible !important;
}

.avatar {
  width: 17px;
  height: 17px;
  border-radius: 4px;
  image-rendering: crisp-edges;
  flex-shrink: 0;
  align-self: center;
}

.team-indicator {
  width: 3px;
  height: 18px;
  border-radius: 999px;
  flex-shrink: 0;
  align-self: center;
  box-shadow: 0 0 6px currentColor;
}

.rank-text,
.name-text,
.stat-text,
.stat-empty {
  display: flex;
  align-items: center;
  align-self: center;
  height: 17px;
  font-family: Inter, system-ui, sans-serif;
  line-height: 1;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: geometricPrecision;
}

.rank-text {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.04);
}

.name-text {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.03);
}

.clan-tag-wrapper {
  display: inline-flex;
  align-items: center;
  align-self: center;
  height: 17px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  flex-shrink: 0;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

.clan-bracket {
  color: rgba(255, 255, 255, 0.28);
  text-shadow: 0 0 6px rgba(255, 255, 255, 0.06);
}

.clan-text-inner {
  color: #ff73dc;
  text-shadow: 0 0 10px rgba(255, 100, 210, 0.22);
}

.clan-icon {
  background: linear-gradient(135deg, #ff7ad9 0%, #c084fc 35%, #60dfff 70%, #4ade80 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 5px rgba(192, 132, 252, 0.55))
    drop-shadow(0 0 10px rgba(96, 223, 255, 0.3));
}

.stat-text {
  justify-content: center;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.stat-empty {
  justify-content: center;
  color: rgba(255, 255, 255, 0.22);
  font-size: 12px;
  font-weight: 800;
}

.arrow-separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 17px;
  color: rgba(255, 255, 255, 0.28);
  margin: 0 3px;
  font-size: 9px;
  font-weight: 800;
}

.badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-width: max-content;
  height: 17px;
  padding: 0 9px;
  border-radius: 999px;
  font-family: Inter, system-ui, sans-serif;
  font-size: 9px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: geometricPrecision;
}

.badge-staff {
  color: #ffe45e;
  background: rgba(255, 208, 0, 0.18);
  border: 1px solid rgba(255, 208, 0, 0.38);
  box-shadow: 0 0 14px rgba(255, 208, 0, 0.14);
}

.nick-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  position: relative;
  cursor: default;
}

.nick-badge {
  width: 22px;
  height: 22px;
  object-fit: contain;
  display: block;
  filter: contrast(1.4) saturate(2.2);
}

.lock-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  position: relative;
  cursor: default;
}

.lock-icon-wrapper svg {
  display: block;
}

.tooltip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 6px 11px;
  border-radius: 8px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.92);
  white-space: nowrap;
  pointer-events: none;
  z-index: 99999;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.16s ease,
    visibility 0.16s ease,
    transform 0.16s ease;
  transition-delay: 0.06s;
  will-change: transform, opacity;
}

.tooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 6px solid;
}

.nick-icon-wrapper:hover .nick-tooltip,
.lock-icon-wrapper:hover .lock-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
  transition-delay: 0.05s;
}

.nick-tooltip {
  background: linear-gradient(
    135deg,
    rgba(220, 30, 60, 0.92),
    rgba(255, 80, 30, 0.88),
    rgba(180, 10, 40, 0.92)
  );

  box-shadow: 0 6px 20px rgba(220, 40, 60, 0.5);
  backdrop-filter: blur(8px);
}

.nick-tooltip::after {
  border-right-color: rgba(220, 30, 60, 0.92);
}

.lock-tooltip {
  background: linear-gradient(
    135deg,
    rgba(160, 60, 210, 0.96),
    rgba(110, 70, 235, 0.96),
    rgba(40, 160, 245, 0.96)
  );

  box-shadow: 0 6px 20px rgba(130, 60, 220, 0.55);
  backdrop-filter: blur(8px);
}

.lock-tooltip::after {
  border-right-color: rgba(200, 80, 220, 0.92);
}

.remove-cell {
  width: 24px;
  padding: 0 6px;
  vertical-align: middle;
  position: relative;
  z-index: 1;
  overflow: visible !important;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  opacity: 0;
  transition: opacity 120ms ease;
  color: var(--color-ink-3);
}

.group:hover .remove-btn {
  opacity: 1;
}
</style>
