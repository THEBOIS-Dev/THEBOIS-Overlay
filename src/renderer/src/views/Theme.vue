<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@renderer/store/config'

const config = useConfigStore()
const theme = computed(() => config.theme)

const TABS = [
  {
    id: 'background',
    label: 'Background',
    icon: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  },
  {
    id: 'colors',
    label: 'Colors',
    icon: 'M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67A2.5 2.5 0 0 1 12 22zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65a2.5 2.5 0 0 1 2.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7z M7.5 13a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm2-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm2 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  },
]

const activeTab = ref<'background' | 'colors'>('background')

const BG_TYPES = [
  { id: 'solid', label: 'Solid', icon: 'M3 3h18v18H3z' },
  {
    id: 'gradient',
    label: 'Gradient',
    icon: 'M11 9h2v2h-2zm-2 2h2v2H9zm4 0h2v2h-2zm2-2h2v2h-2zM7 9h2v2H7zm12-6H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM9 13h2v2H9zm-2 0h2v2H7zm4 0h2v2h-2zm2 0h2v2h-2zm2 0h2v2h-2z',
  },
  {
    id: 'image',
    label: 'Image',
    icon: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  },
]

const DIRECTIONS = [
  { label: '→', value: 'to right' },
  { label: '←', value: 'to left' },
  { label: '↓', value: 'to bottom' },
  { label: '↑', value: 'to top' },
  { label: '↘', value: 'to bottom right' },
  { label: '↙', value: 'to bottom left' },
  { label: '↗', value: 'to top right' },
  { label: '↖', value: 'to top left' },
]

const UI_COLORS = [
  { key: 'accent', label: 'Accent' },
  { key: 'accentLight', label: 'Accent Light' },
  { key: 'border', label: 'Border' },
  { key: 'ink1', label: 'Text Primary' },
  { key: 'ink2', label: 'Text Secondary' },
  { key: 'ink3', label: 'Text Muted' },
  { key: 'nick', label: 'Nick Color' },
  { key: 'good', label: 'Good Stat' },
  { key: 'bad', label: 'Bad Stat' },
]

const RANK_COLORS = [
  { key: 'rankOwner', label: 'Owner' },
  { key: 'rankDeveloper', label: 'Developer' },
  { key: 'rankManager', label: 'Manager' },
  { key: 'rankAdmin', label: 'Admin' },
  { key: 'rankSrmod', label: 'Sr. Mod' },
  { key: 'rankModerator', label: 'Moderator' },
  { key: 'rankHelper', label: 'Helper' },
  { key: 'rankTrial', label: 'Trial' },
  { key: 'rankYoutuber', label: 'YouTuber' },
  { key: 'rankChampion', label: 'Champion' },
  { key: 'rankTitan', label: 'Titan' },
  { key: 'rankElite', label: 'Elite' },
  { key: 'rankVip', label: 'VIP' },
]

const solidHex = computed(() => {
  const h = theme.value.bgColor.replace('#', '').slice(0, 6).padEnd(6, '0')
  return '#' + h
})

function onSolidColor(e: Event): void {
  theme.value.bgColor = (e.target as HTMLInputElement).value
}
function onSolidHexInput(val: string): void {
  const v = val.startsWith('#') ? val : '#' + val
  if (/^#[0-9a-fA-F]{6}$/.test(v)) theme.value.bgColor = v
}

const gradientPreview = computed(() => {
  const stops = theme.value.bgGradientStops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ')
  return `linear-gradient(${theme.value.bgGradientDir}, ${stops})`
})

function addStop(): void {
  const stops = theme.value.bgGradientStops
  const last = stops[stops.length - 1]?.position ?? 50
  stops.push({ color: '#ffffff', position: Math.min(100, Math.round((last + 100) / 2)) })
}
function removeStop(i: number): void {
  theme.value.bgGradientStops.splice(i, 1)
}

const previewBg = computed(() => {
  const t = theme.value
  if (t.bgType === 'gradient') return gradientPreview.value
  if (t.bgType === 'image') return 'rgb(6,9,20)'
  return solidHex.value
})

const imageFilename = computed(() => {
  const url = theme.value.bgImageUrl
  if (!url) return ''
  if (url.startsWith('data:')) return 'custom image (embedded)'
  const parts = url.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || url
})

async function pickLocalImage(): Promise<void> {
  const result = await window.api.app.openImageDialog()
  if (!result.canceled && result.filePaths.length > 0) {
    theme.value.bgImageUrl = await window.api.app.readFileBase64(result.filePaths[0])
  }
}

function resetTheme(): void {
  config.resetTheme()
}
</script>

<script lang="ts">
import { defineComponent, h } from 'vue'

export const ColorRow = defineComponent({
  name: 'ColorRow',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  emits: ['update'],
  setup(props, { emit }) {
    const displayColor = () => {
      const v = props.value
      if (!v || v.startsWith('rgba')) return '#888888'
      return v
    }

    return () =>
      h('div', { class: 'flex items-center gap-3 px-3 py-2 no-drag' }, [
        h('label', { style: 'position: relative; cursor: pointer; flex-shrink: 0;' }, [
          h('div', {
            style: `
              width: 20px; height: 20px;
              border-radius: 50%;
              background: ${displayColor()};
              border: 1.5px solid rgba(255,255,255,0.18);
              box-shadow: 0 0 6px ${displayColor()}44;
            `,
          }),
          h('input', {
            type: 'color',
            value: displayColor(),
            style: 'position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;',
            onInput: (e: Event) => emit('update', (e.target as HTMLInputElement).value),
          }),
        ]),
        h(
          'span',
          {
            class: 'text-xs flex-1',
            style: 'color: var(--color-ink-2);',
          },
          props.label,
        ),
        h('input', {
          value: props.value,
          class: 'input-field font-mono no-drag',
          style: 'height: 22px; width: 80px; font-size: 0.7rem; padding: 0 6px; text-align: right;',
          onChange: (e: Event) => emit('update', (e.target as HTMLInputElement).value),
        }),
      ])
  },
})
</script>

<!-- ── Inline ColorRow component ─────────────────────────────────────────────── -->
<template>
  <div class="flex h-full overflow-hidden" style="pointer-events: all">
    <!-- ── Sidebar ── -->
    <aside
      class="shrink-0 flex flex-col gap-0.5 p-2 border-r overflow-y-auto themed-scroll"
      style="width: 132px; border-color: var(--color-border)"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors no-drag"
        :style="
          activeTab === tab.id
            ? 'background: var(--color-accent-dim); color: var(--color-accent-light);'
            : 'color: var(--color-ink-2);'
        "
        @click="activeTab = tab.id"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" class="shrink-0">
          <path :d="tab.icon" />
        </svg>
        {{ tab.label }}
      </button>

      <div class="flex-1" />

      <button
        class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors no-drag"
        style="color: #f87171"
        @click="resetTheme"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
          <path
            d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
          />
        </svg>
        Reset
      </button>
    </aside>

    <!-- ── Content ── -->
    <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-3 themed-scroll">
      <!-- ────────────── BACKGROUND TAB ────────────── -->
      <template v-if="activeTab === 'background'">
        <!-- BG Type selector -->
        <div class="flex gap-1.5">
          <button
            v-for="t in BG_TYPES"
            :key="t.id"
            class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all no-drag"
            :style="
              theme.bgType === t.id
                ? 'background: rgba(124,58,237,0.2); color: #b89aff; border: 1px solid rgba(124,58,237,0.45); box-shadow: 0 0 10px rgba(124,58,237,0.18);'
                : 'background: var(--color-surface-1); color: var(--color-ink-3); border: 1px solid var(--color-border);'
            "
            @click="theme.bgType = t.id as any"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path :d="t.icon" />
            </svg>
            {{ t.label }}
          </button>
        </div>

        <!-- ── SOLID ── -->
        <template v-if="theme.bgType === 'solid'">
          <div class="card divide-subtle">
            <!-- Color row -->
            <div class="flex items-center gap-3 px-3 py-2.5 no-drag">
              <label class="cursor-pointer relative shrink-0">
                <div
                  class="rounded-md border"
                  style="width: 32px; height: 32px; border-color: rgba(255, 255, 255, 0.12)"
                  :style="{ background: solidHex }"
                />
                <input
                  type="color"
                  :value="solidHex"
                  class="absolute opacity-0 w-0 h-0 pointer-events-none"
                  @input="onSolidColor($event)"
                />
              </label>
              <div class="flex flex-col flex-1 gap-1">
                <span class="text-xs font-medium" style="color: var(--color-ink-2)">Color</span>
                <input
                  :value="solidHex"
                  class="input-field font-mono text-xs"
                  style="height: 24px; padding: 0 8px"
                  @change="(e) => onSolidHexInput((e.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <!-- Opacity row -->
            <div class="px-3 py-2.5 no-drag">
              <div class="flex justify-between mb-1.5">
                <span class="text-xs font-medium" style="color: var(--color-ink-2)">Opacity</span>
                <span
                  class="text-xs font-mono tabular-nums"
                  style="color: var(--color-accent-light)"
                >
                  {{ Math.round(theme.opacity * 100) }}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="theme.opacity"
                class="themed-range w-full"
                @input="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
                @change="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </template>

        <!-- ── GRADIENT ── -->
        <template v-if="theme.bgType === 'gradient'">
          <!-- Live gradient bar -->
          <div
            class="h-8 rounded-lg"
            style="border: 1px solid rgba(255, 255, 255, 0.07)"
            :style="{ background: gradientPreview }"
          />

          <!-- Direction -->
          <div class="card px-3 py-2.5">
            <span
              class="text-xs font-semibold uppercase tracking-widest mb-2 block"
              style="color: var(--color-ink-3)"
            >
              Direction
            </span>
            <div class="flex flex-wrap gap-1 no-drag">
              <button
                v-for="d in DIRECTIONS"
                :key="d.value"
                class="w-8 h-7 rounded text-sm transition-all"
                :style="
                  theme.bgGradientDir === d.value
                    ? 'background: rgba(124,58,237,0.25); color: #b89aff; border: 1px solid rgba(124,58,237,0.5);'
                    : 'background: var(--color-surface-1); color: var(--color-ink-3); border: 1px solid var(--color-border);'
                "
                @click="theme.bgGradientDir = d.value"
              >
                {{ d.label }}
              </button>
            </div>
          </div>

          <!-- Color stops -->
          <div class="card divide-subtle">
            <div
              v-for="(stop, i) in theme.bgGradientStops"
              :key="i"
              class="flex items-center gap-2.5 px-3 py-2 no-drag"
            >
              <label class="cursor-pointer relative shrink-0">
                <div
                  class="rounded border"
                  style="width: 22px; height: 22px; border-color: rgba(255, 255, 255, 0.12)"
                  :style="{ background: stop.color }"
                />
                <input
                  type="color"
                  :value="stop.color"
                  class="absolute opacity-0 w-0 h-0 pointer-events-none"
                  @input="stop.color = ($event.target as HTMLInputElement).value"
                />
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="stop.position"
                class="themed-range flex-1"
                @input="stop.position = parseInt(($event.target as HTMLInputElement).value)"
              />
              <span
                class="text-xs font-mono tabular-nums"
                style="color: var(--color-ink-3); min-width: 30px; text-align: right"
              >
                {{ stop.position }}%
              </span>
              <button
                v-if="theme.bgGradientStops.length > 2"
                class="w-5 h-5 flex items-center justify-center rounded text-xs transition-colors"
                style="color: #f87171; background: rgba(248, 113, 113, 0.1)"
                @click="removeStop(i)"
              >
                ✕
              </button>
            </div>

            <div class="px-3 py-2 no-drag">
              <button
                class="text-xs px-3 py-1 rounded-md transition-colors"
                style="
                  background: rgba(124, 58, 237, 0.1);
                  color: #b89aff;
                  border: 1px solid rgba(124, 58, 237, 0.22);
                "
                @click="addStop"
              >
                + Add Stop
              </button>
            </div>
          </div>

          <!-- Opacity -->
          <div class="card px-3 py-2.5 no-drag">
            <div class="flex justify-between mb-1.5">
              <span class="text-xs font-medium" style="color: var(--color-ink-2)">Opacity</span>
              <span class="text-xs font-mono tabular-nums" style="color: var(--color-accent-light)">
                {{ Math.round(theme.opacity * 100) }}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="theme.opacity"
              class="themed-range w-full"
              @input="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
              @change="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
            />
          </div>
        </template>

        <!-- ── IMAGE ── -->
        <template v-if="theme.bgType === 'image'">
          <div class="card divide-subtle">
            <div class="px-3 py-2.5 no-drag">
              <span class="text-xs font-medium block mb-2" style="color: var(--color-ink-2)">
                Background Image
              </span>
              <div class="flex flex-col gap-2">
                <button
                  class="flex items-center justify-center gap-2 rounded-lg text-xs py-2 px-3 transition-all"
                  style="
                    background: rgba(124, 58, 237, 0.12);
                    color: #b89aff;
                    border: 1px solid rgba(124, 58, 237, 0.28);
                  "
                  @click="pickLocalImage"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <path
                      d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.54 15.96.5 13.5.5c-1.5 0-2.81.75-3.6 1.87l-.9 1.13-.9-1.14C7.31 1.25 6 .5 4.5.5 2.04.5 0 2.54 0 4.64c0 .48.11.92.18 1.36H0v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM13.5 2c1.21 0 2.5.64 2.5 2.64 0 1.36-.79 2.36-2.5 2.36H10V4.5C10 3.12 11.12 2 13.5 2zM2 4.64C2 3.57 2.96 2.5 4.5 2.5 6.88 2.5 8 3.62 8 5v2H4.5C2.79 7 2 6 2 4.64zM2 17V8h7v9H2zm9 0V8h7l.001 9H11z"
                    />
                  </svg>
                  Choose local image…
                </button>
                <div
                  v-if="theme.bgImageUrl"
                  class="flex items-center gap-2 px-2 py-1.5 rounded"
                  style="
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid var(--color-border);
                  "
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="10"
                    height="10"
                    fill="currentColor"
                    style="color: var(--color-good); flex-shrink: 0"
                  >
                    <path
                      d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                    />
                  </svg>
                  <span
                    class="text-xs truncate flex-1"
                    style="color: var(--color-ink-3); font-family: var(--font-mono)"
                  >
                    {{ imageFilename }}
                  </span>
                  <button
                    class="text-xs shrink-0"
                    style="color: var(--color-bad)"
                    @click="theme.bgImageUrl = ''"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div class="px-3 py-2.5 no-drag">
              <div class="flex justify-between mb-1.5">
                <span class="text-xs font-medium" style="color: var(--color-ink-2)">
                  Image opacity
                </span>
                <span
                  class="text-xs font-mono tabular-nums"
                  style="color: var(--color-accent-light)"
                >
                  {{ Math.round(theme.bgImageOpacity * 100) }}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="theme.bgImageOpacity"
                class="themed-range w-full"
                @input="
                  theme.bgImageOpacity = parseFloat(($event.target as HTMLInputElement).value)
                "
                @change="
                  theme.bgImageOpacity = parseFloat(($event.target as HTMLInputElement).value)
                "
              />
            </div>

            <div class="px-3 py-2.5 no-drag">
              <div class="flex justify-between mb-1.5">
                <span class="text-xs font-medium" style="color: var(--color-ink-2)">
                  Overlay opacity
                </span>
                <span
                  class="text-xs font-mono tabular-nums"
                  style="color: var(--color-accent-light)"
                >
                  {{ Math.round(theme.opacity * 100) }}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="theme.opacity"
                class="themed-range w-full"
                @input="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
                @change="theme.opacity = parseFloat(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </template>

        <!-- Preview -->
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span
              class="text-xs font-semibold uppercase tracking-widest"
              style="color: var(--color-ink-3)"
            >
              Preview
            </span>
            <div class="flex-1 h-px" style="background: var(--color-border)" />
          </div>
          <div
            class="relative rounded-lg overflow-hidden"
            style="height: 64px; border: 1px solid var(--color-border)"
          >
            <!-- image layer -->
            <div
              v-if="theme.bgType === 'image' && theme.bgImageUrl"
              class="absolute inset-0"
              :style="{
                backgroundImage: `url('${theme.bgImageUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: theme.bgImageOpacity,
              }"
            />
            <!-- color/gradient overlay (hidden when image bg is active) -->
            <div
              v-if="theme.bgType !== 'image'"
              class="absolute inset-0"
              :style="{ background: previewBg, opacity: theme.opacity }"
            />
            <!-- content -->
            <div class="absolute inset-0 flex items-center px-3 gap-3">
              <div
                class="w-8 h-8 rounded-md shrink-0"
                style="
                  background: rgba(124, 58, 237, 0.25);
                  border: 1px solid rgba(124, 58, 237, 0.35);
                "
              />
              <div class="flex flex-col gap-1 min-w-0 flex-1">
                <div class="flex gap-3 items-center">
                  <span class="text-xs font-bold" style="color: var(--color-ink-1)">
                    PlayerName
                  </span>
                  <span class="text-xs font-mono" style="color: var(--color-good)">6.50</span>
                  <span class="text-xs font-mono" style="color: var(--color-warn, #fbbf24)">
                    2.30
                  </span>
                  <span class="text-xs font-mono" style="color: var(--color-accent-light)">
                    1,204
                  </span>
                </div>
                <div class="h-px w-full" style="background: var(--color-border)" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ────────────── COLORS TAB ────────────── -->
      <template v-if="activeTab === 'colors'">
        <!-- UI colors -->
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span
              class="text-xs font-semibold uppercase tracking-widest"
              style="color: var(--color-ink-3)"
            >
              Interface
            </span>
            <div class="flex-1 h-px" style="background: var(--color-border)" />
          </div>
          <div class="card divide-subtle">
            <ColorRow
              v-for="c in UI_COLORS"
              :key="c.key"
              :label="c.label"
              :value="(theme.colors as any)[c.key]"
              @update="(theme.colors as any)[c.key] = $event"
            />
          </div>
        </div>

        <!-- Rank colors -->
        <div>
          <div class="flex items-center gap-2 mb-1.5">
            <span
              class="text-xs font-semibold uppercase tracking-widest"
              style="color: var(--color-ink-3)"
            >
              Rank Colors
            </span>
            <div class="flex-1 h-px" style="background: var(--color-border)" />
          </div>
          <div class="card divide-subtle">
            <ColorRow
              v-for="r in RANK_COLORS"
              :key="r.key"
              :label="r.label"
              :value="(theme.colors as any)[r.key]"
              @update="(theme.colors as any)[r.key] = $event"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.themed-range {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  background: var(--color-border);
  outline: none;
  cursor: pointer;
}
.themed-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--color-accent-light);
  border: 2px solid rgba(124, 58, 237, 0.6);
  box-shadow: 0 0 6px rgba(124, 58, 237, 0.4);
  cursor: pointer;
  transition:
    transform 100ms,
    box-shadow 100ms;
}
.themed-range::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.6);
}
.themed-range::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--color-accent-light);
  border: 2px solid rgba(124, 58, 237, 0.6);
  cursor: pointer;
}
</style>
