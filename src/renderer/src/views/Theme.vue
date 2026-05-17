<script setup lang="ts">
import { useConfigStore } from '@renderer/store/config';
import { Blend, Image, Palette, RotateCcw, Sparkles, Square } from 'lucide-vue-next';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';
import { computed, defineComponent, h, ref, watch } from 'vue';

const config = useConfigStore();
const theme = computed(() => config.theme);
const activeTab = ref<'background' | 'colors'>('background');

const TABS = [
  { id: 'background', label: 'Background', icon: Blend },
  { id: 'colors', label: 'Colors', icon: Palette },
];

const BG_TYPES = [
  { id: 'solid', label: 'Solid', icon: Square },
  { id: 'gradient', label: 'Gradient', icon: Blend },
  { id: 'image', label: 'Image', icon: Image },
];

const DIRECTIONS = [
  { label: '→', value: 'to right' },
  { label: '←', value: 'to left' },
  { label: '↓', value: 'to bottom' },
  { label: '↑', value: 'to top' },
  { label: '↘', value: 'to bottom right' },
  { label: '↙', value: 'to bottom left' },
  { label: '↗', value: 'to top right' },
  { label: '↖', value: 'to top left' },
];

const UI_COLORS_DERIVED = [
  { key: 'accentLight', label: 'Accent Light' },
  { key: 'border', label: 'Border' },
  { key: 'ink1', label: 'Text Primary' },
  { key: 'ink2', label: 'Text Secondary' },
  { key: 'ink3', label: 'Text Muted' },
  { key: 'nick', label: 'Nick Color' },
  { key: 'good', label: 'Good Stat' },
  { key: 'bad', label: 'Bad Stat' },
];

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
];

const RANK_KEYS = RANK_COLORS.map((r) => r.key);

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').slice(0, 6);
  if (clean.length < 6) return [263, 76, 58];
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hslToRgba(h: number, s: number, l: number, alpha: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return `rgba(${f(0)},${f(8)},${f(4)},${alpha})`;
}

function applyDynamicColors(): void {
  const accentHex = theme.value.colors.accent;
  if (!/^#[0-9a-fA-F]{6}/.test(accentHex)) return;
  const [h, s, l] = hexToHsl(accentHex);
  const sat = Math.max(s, 55);
  const lit = Math.min(Math.max(l, 45), 62);
  const c = theme.value.colors;
  c.accentLight = hslToHex(h, Math.max(sat - 5, 50), Math.min(lit + 22, 83));
  c.border = hslToRgba(h, Math.max(sat * 0.65, 38), 65, 0.18);
  c.ink1 = hslToHex(h, 14, 93);
  c.ink2 = hslToHex(h, 18, 63);
  c.ink3 = hslToHex(h, 20, 42);
  c.nick = hslToHex((h + 45) % 360, 90, 78);
  c.good = '#34d399';
  c.bad = '#f87171';
  RANK_KEYS.forEach((key, i) => {
    const rh = (h + Math.round((i * 360) / RANK_KEYS.length)) % 360;
    (c as any)[key] = hslToHex(rh, 80, 62);
  });
}

watch(
  [() => theme.value.dynamicColors, () => theme.value.colors.accent],
  ([isDynamic]) => {
    if (isDynamic) applyDynamicColors();
  },
  { immediate: true },
);

function toggleDynamic(): void {
  theme.value.dynamicColors = !theme.value.dynamicColors;
}

const solidHex = computed(() => {
  const h = theme.value.bgColor.replace('#', '').slice(0, 6).padEnd(6, '0');
  return '#' + h;
});

function onSolidColor(e: Event): void {
  theme.value.bgColor = (e.target as HTMLInputElement).value;
}
function onSolidHexInput(val: string): void {
  const v = val.startsWith('#') ? val : '#' + val;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) theme.value.bgColor = v;
}

const gradientPreview = computed(() => {
  const stops = theme.value.bgGradientStops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');
  return `linear-gradient(${theme.value.bgGradientDir}, ${stops})`;
});

function addStop(): void {
  const stops = theme.value.bgGradientStops;
  const last = stops[stops.length - 1]?.position ?? 50;
  stops.push({ color: '#ffffff', position: Math.min(100, Math.round((last + 100) / 2)) });
}
function removeStop(i: number): void {
  theme.value.bgGradientStops.splice(i, 1);
}

const previewBg = computed(() => {
  const t = theme.value;
  if (t.bgType === 'gradient') return gradientPreview.value;
  if (t.bgType === 'image') return 'rgb(6,9,20)';
  return solidHex.value;
});

const imageFilename = computed(() => {
  const url = theme.value.bgImageUrl;
  if (!url) return '';
  if (url.startsWith('data:')) return 'custom image (embedded)';
  const parts = url.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || url;
});

async function pickLocalImage(): Promise<void> {
  const result = await window.api.app.openImageDialog();
  if (!result.canceled && result.filePaths.length > 0) {
    theme.value.bgImageUrl = await window.api.app.readFileBase64(result.filePaths[0]);
  }
}

function resetTheme(): void {
  config.resetTheme();
}

const ColorRow = defineComponent({
  name: 'ColorRow',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  emits: ['update'],
  setup(props, { emit }) {
    const displayColor = () => {
      const v = props.value;
      if (!v || v.startsWith('rgba')) return '#888888';
      return v;
    };
    return () =>
      h('div', { class: 'flex items-center gap-3 px-3 py-2 no-drag' }, [
        h('label', { style: 'position:relative;cursor:pointer;flex-shrink:0' }, [
          h('div', {
            style: `width:20px;height:20px;border-radius:50%;background:${displayColor()};border:1.5px solid rgba(255,255,255,0.18);box-shadow:0 0 6px ${displayColor()}44`,
          }),
          h('input', {
            type: 'color',
            value: displayColor(),
            style: 'position:absolute;opacity:0;width:0;height:0;pointer-events:none',
            onInput: (e: Event) => emit('update', (e.target as HTMLInputElement).value),
          }),
        ]),
        h(
          'span',
          { class: 'text-xs flex-1', style: 'color:var(--color-ink-2)' },
          props.label,
        ),
        h('input', {
          value: props.value,
          class: 'input-field font-mono no-drag',
          style: 'height:22px;width:80px;font-size:0.7rem;padding:0 6px;text-align:right',
          onChange: (e: Event) => emit('update', (e.target as HTMLInputElement).value),
        }),
      ]);
  },
});

function opacitySliderModel(prop: 'opacity' | 'bgImageOpacity') {
  return computed({
    get: () => [theme.value[prop] * 100],
    set: (v: number[]) => {
      theme.value[prop] = v[0] / 100;
    },
  });
}

const opacityModel = opacitySliderModel('opacity');
const bgImageOpacityModel = opacitySliderModel('bgImageOpacity');
</script>

<template>
  <div
    class="flex h-full overflow-hidden"
    style="pointer-events: all"
  >
    <aside
      class="themed-scroll flex shrink-0 flex-col overflow-y-auto border-r py-2"
      style="
        width: 128px;
        border-color: var(--color-border);
        background: rgba(255, 255, 255, 0.012);
      "
    >
      <div class="flex flex-1 flex-col gap-0.5 px-2">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="no-drag relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-all"
          :style="
            activeTab === tab.id
              ? 'color:var(--color-accent-light)'
              : 'color:var(--color-ink-3)'
          "
          @click="activeTab = tab.id as any"
        >
          <div
            v-if="activeTab === tab.id"
            class="absolute inset-0 rounded-md"
            style="background: var(--color-accent-dim)"
          />
          <component
            :is="tab.icon"
            :size="12"
            class="relative shrink-0"
          />
          <span
            class="relative font-medium"
            style="font-size: 0.78rem"
            >{{ tab.label }}</span
          >
        </button>
      </div>
      <div class="mt-auto px-2 pt-1">
        <button
          class="no-drag relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 transition-all"
          style="color: rgba(248, 113, 113, 0.7); font-size: 0.78rem; font-weight: 500"
          @click="resetTheme"
        >
          <RotateCcw :size="11" />
          Reset
        </button>
      </div>
    </aside>

    <div class="themed-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-3">
      <template v-if="activeTab === 'background'">
        <div class="flex gap-1.5">
          <button
            v-for="t in BG_TYPES"
            :key="t.id"
            class="no-drag flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all"
            :style="
              theme.bgType === t.id
                ? 'background:rgba(124,58,237,0.2);color:#b89aff;border:1px solid rgba(124,58,237,0.45);box-shadow:0 0 10px rgba(124,58,237,0.18)'
                : 'background:var(--color-surface-1);color:var(--color-ink-3);border:1px solid var(--color-border)'
            "
            @click="theme.bgType = t.id as any"
          >
            <component
              :is="t.icon"
              :size="11"
            />
            {{ t.label }}
          </button>
        </div>

        <template v-if="theme.bgType === 'solid'">
          <div class="card divide-subtle">
            <div class="no-drag flex items-center gap-3 px-3 py-2.5">
              <label class="relative shrink-0 cursor-pointer">
                <div
                  class="rounded-md border"
                  style="
                    width: 32px;
                    height: 32px;
                    border-color: rgba(255, 255, 255, 0.12);
                  "
                  :style="{ background: solidHex }"
                />
                <input
                  type="color"
                  :value="solidHex"
                  class="pointer-events-none absolute h-0 w-0 opacity-0"
                  @input="onSolidColor($event)"
                />
              </label>
              <div class="flex flex-1 flex-col gap-1">
                <span class="text-ink-2 text-xs font-medium">Color</span>
                <input
                  :value="solidHex"
                  class="input-field font-mono text-xs"
                  style="height: 24px; padding: 0 8px"
                  @change="(e) => onSolidHexInput((e.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div class="no-drag px-3 py-2.5">
              <div class="mb-2 flex justify-between">
                <span class="text-ink-2 text-xs font-medium">Opacity</span>
                <span class="text-accent-light font-mono text-xs tabular-nums">
                  {{ Math.round(theme.opacity * 100) }}%
                </span>
              </div>
              <SliderRoot
                v-model="opacityModel"
                :min="0"
                :max="100"
                :step="1"
                class="relative flex h-4 w-full touch-none items-center select-none"
              >
                <SliderTrack class="bg-border relative h-[3px] grow rounded-full">
                  <SliderRange class="bg-accent absolute h-full rounded-full" />
                </SliderTrack>
                <SliderThumb
                  class="bg-accent-light block h-3 w-3 cursor-pointer rounded-full border-2 border-[rgba(124,58,237,0.6)] focus:outline-none"
                  style="box-shadow: 0 0 6px rgba(124, 58, 237, 0.4)"
                />
              </SliderRoot>
            </div>
          </div>
        </template>

        <template v-if="theme.bgType === 'gradient'">
          <div
            class="h-8 rounded-lg"
            style="border: 1px solid rgba(255, 255, 255, 0.07)"
            :style="{ background: gradientPreview }"
          />

          <div class="card px-3 py-2.5">
            <span
              class="text-ink-3 mb-2 block text-xs font-semibold tracking-widest uppercase"
            >
              Direction
            </span>
            <div class="no-drag flex flex-wrap gap-1">
              <button
                v-for="d in DIRECTIONS"
                :key="d.value"
                class="h-7 w-8 rounded text-sm transition-all"
                :style="
                  theme.bgGradientDir === d.value
                    ? 'background:rgba(124,58,237,0.25);color:#b89aff;border:1px solid rgba(124,58,237,0.5)'
                    : 'background:var(--color-surface-1);color:var(--color-ink-3);border:1px solid var(--color-border)'
                "
                @click="theme.bgGradientDir = d.value"
              >
                {{ d.label }}
              </button>
            </div>
          </div>

          <div class="card divide-subtle">
            <div
              v-for="(stop, i) in theme.bgGradientStops"
              :key="i"
              class="no-drag flex items-center gap-2.5 px-3 py-2"
            >
              <label class="relative shrink-0 cursor-pointer">
                <div
                  class="rounded border"
                  style="
                    width: 22px;
                    height: 22px;
                    border-color: rgba(255, 255, 255, 0.12);
                  "
                  :style="{ background: stop.color }"
                />
                <input
                  type="color"
                  :value="stop.color"
                  class="pointer-events-none absolute h-0 w-0 opacity-0"
                  @input="stop.color = ($event.target as HTMLInputElement).value"
                />
              </label>
              <SliderRoot
                :model-value="[stop.position]"
                :min="0"
                :max="100"
                :step="1"
                class="relative flex h-4 flex-1 touch-none items-center select-none"
                @update:model-value="(value) => (stop.position = value?.[0] ?? 0)"
              >
                <SliderTrack class="bg-border relative h-[3px] grow rounded-full">
                  <SliderRange class="bg-accent absolute h-full rounded-full" />
                </SliderTrack>
                <SliderThumb
                  class="bg-accent-light block h-3 w-3 cursor-pointer rounded-full border-2 border-[rgba(124,58,237,0.6)] focus:outline-none"
                />
              </SliderRoot>
              <span
                class="text-ink-3 min-w-[30px] text-right font-mono text-xs tabular-nums"
              >
                {{ stop.position }}%
              </span>
              <button
                v-if="theme.bgGradientStops.length > 2"
                class="flex h-5 w-5 items-center justify-center rounded bg-[rgba(248,113,113,0.1)] text-xs text-red-400 transition-colors"
                @click="removeStop(i)"
              >
                ✕
              </button>
            </div>
            <div class="no-drag px-3 py-2">
              <button
                class="text-accent-light rounded-md px-3 py-1 text-xs transition-colors"
                style="
                  background: rgba(124, 58, 237, 0.1);
                  border: 1px solid rgba(124, 58, 237, 0.22);
                "
                @click="addStop"
              >
                + Add Stop
              </button>
            </div>
          </div>

          <div class="card no-drag px-3 py-2.5">
            <div class="mb-2 flex justify-between">
              <span class="text-ink-2 text-xs font-medium">Opacity</span>
              <span class="text-accent-light font-mono text-xs tabular-nums">
                {{ Math.round(theme.opacity * 100) }}%
              </span>
            </div>
            <SliderRoot
              v-model="opacityModel"
              :min="0"
              :max="100"
              :step="1"
              class="relative flex h-4 w-full touch-none items-center select-none"
            >
              <SliderTrack class="bg-border relative h-[3px] grow rounded-full">
                <SliderRange class="bg-accent absolute h-full rounded-full" />
              </SliderTrack>
              <SliderThumb
                class="bg-accent-light block h-3 w-3 cursor-pointer rounded-full border-2 border-[rgba(124,58,237,0.6)] focus:outline-none"
                style="box-shadow: 0 0 6px rgba(124, 58, 237, 0.4)"
              />
            </SliderRoot>
          </div>
        </template>

        <template v-if="theme.bgType === 'image'">
          <div class="card divide-subtle">
            <div class="no-drag px-3 py-2.5">
              <span class="text-ink-2 mb-2 block text-xs font-medium">
                Background Image
              </span>
              <div class="flex flex-col gap-2">
                <button
                  class="text-accent-light flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs transition-all"
                  style="
                    background: rgba(124, 58, 237, 0.12);
                    border: 1px solid rgba(124, 58, 237, 0.28);
                  "
                  @click="pickLocalImage"
                >
                  <Image :size="12" />
                  Choose local image…
                </button>
                <div
                  v-if="theme.bgImageUrl"
                  class="flex items-center gap-2 rounded px-2 py-1.5"
                  style="
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid var(--color-border);
                  "
                >
                  <Image
                    :size="10"
                    class="text-good shrink-0"
                  />
                  <span class="text-ink-3 flex-1 truncate font-mono text-xs">
                    {{ imageFilename }}
                  </span>
                  <button
                    class="text-bad shrink-0 text-xs"
                    @click="theme.bgImageUrl = ''"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div class="no-drag px-3 py-2.5">
              <div class="mb-2 flex justify-between">
                <span class="text-ink-2 text-xs font-medium">Image opacity</span>
                <span class="text-accent-light font-mono text-xs tabular-nums">
                  {{ Math.round(theme.bgImageOpacity * 100) }}%
                </span>
              </div>
              <SliderRoot
                v-model="bgImageOpacityModel"
                :min="0"
                :max="100"
                :step="1"
                class="relative flex h-4 w-full touch-none items-center select-none"
              >
                <SliderTrack class="bg-border relative h-[3px] grow rounded-full">
                  <SliderRange class="bg-accent absolute h-full rounded-full" />
                </SliderTrack>
                <SliderThumb
                  class="bg-accent-light block h-3 w-3 cursor-pointer rounded-full border-2 border-[rgba(124,58,237,0.6)] focus:outline-none"
                />
              </SliderRoot>
            </div>

            <div class="no-drag px-3 py-2.5">
              <div class="mb-2 flex justify-between">
                <span class="text-ink-2 text-xs font-medium">Overlay opacity</span>
                <span class="text-accent-light font-mono text-xs tabular-nums">
                  {{ Math.round(theme.opacity * 100) }}%
                </span>
              </div>
              <SliderRoot
                v-model="opacityModel"
                :min="0"
                :max="100"
                :step="1"
                class="relative flex h-4 w-full touch-none items-center select-none"
              >
                <SliderTrack class="bg-border relative h-[3px] grow rounded-full">
                  <SliderRange class="bg-accent absolute h-full rounded-full" />
                </SliderTrack>
                <SliderThumb
                  class="bg-accent-light block h-3 w-3 cursor-pointer rounded-full border-2 border-[rgba(124,58,237,0.6)] focus:outline-none"
                />
              </SliderRoot>
            </div>
          </div>
        </template>

        <div>
          <div class="mb-1.5 flex items-center gap-2">
            <span class="text-ink-3 text-xs font-semibold tracking-widest uppercase">
              Preview
            </span>
            <div class="bg-border h-px flex-1" />
          </div>
          <div
            class="relative overflow-hidden rounded-lg"
            style="height: 64px; border: 1px solid var(--color-border)"
          >
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
            <div
              v-if="theme.bgType !== 'image'"
              class="absolute inset-0"
              :style="{ background: previewBg, opacity: theme.opacity }"
            />
            <div class="absolute inset-0 flex items-center gap-3 px-3">
              <div
                class="h-8 w-8 shrink-0 rounded-md"
                style="
                  background: rgba(124, 58, 237, 0.25);
                  border: 1px solid rgba(124, 58, 237, 0.35);
                "
              />
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <div class="flex items-center gap-3">
                  <span class="text-ink-1 text-xs font-bold">PlayerName</span>
                  <span class="text-good font-mono text-xs">6.50</span>
                  <span class="text-warn font-mono text-xs">2.30</span>
                  <span class="text-accent-light font-mono text-xs">1,204</span>
                </div>
                <div class="bg-border h-px w-full" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-if="activeTab === 'colors'">
        <div
          class="no-drag flex items-center justify-between rounded-lg px-3 py-3 transition-all"
          :style="
            theme.dynamicColors
              ? 'background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.32);box-shadow:0 0 14px rgba(124,58,237,0.08)'
              : 'background:var(--color-surface-1);border:1px solid var(--color-border)'
          "
        >
          <div class="flex items-center gap-2.5">
            <div
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all"
              :style="
                theme.dynamicColors
                  ? 'background:rgba(124,58,237,0.28);color:var(--color-accent-light)'
                  : 'background:var(--color-surface-2);color:var(--color-ink-3)'
              "
            >
              <Sparkles :size="13" />
            </div>
            <div class="flex flex-col gap-0.5">
              <span
                class="text-xs font-semibold transition-colors"
                :style="
                  theme.dynamicColors
                    ? 'color:var(--color-accent-light)'
                    : 'color:var(--color-ink-2)'
                "
                >Dynamic Colors</span
              >
              <span style="font-size: 0.67rem; color: var(--color-ink-3)">
                Derive all colors from accent hue
              </span>
            </div>
          </div>
          <button
            class="no-drag relative h-5 w-9 shrink-0 rounded-full transition-all duration-200"
            :style="
              theme.dynamicColors
                ? 'background:var(--color-accent)'
                : 'background:var(--color-surface-3)'
            "
            @click="toggleDynamic"
          >
            <div
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200"
              :style="theme.dynamicColors ? 'left:calc(100% - 18px)' : 'left:2px'"
            />
          </button>
        </div>

        <div>
          <div class="mb-1.5 flex items-center gap-2">
            <span class="text-ink-3 text-xs font-semibold tracking-widest uppercase">
              Interface
            </span>
            <div class="bg-border h-px flex-1" />
          </div>

          <div class="card mb-1.5">
            <div class="relative">
              <ColorRow
                label="Accent"
                :value="theme.colors.accent"
                @update="theme.colors.accent = $event"
              />
              <div
                v-if="theme.dynamicColors"
                class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              >
                <span
                  style="
                    font-size: 0.58rem;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    color: var(--color-accent-light);
                    opacity: 0.7;
                  "
                  >SOURCE</span
                >
              </div>
            </div>
          </div>

          <div
            class="card divide-subtle transition-opacity duration-200"
            :style="theme.dynamicColors ? 'opacity:0.42;pointer-events:none' : ''"
          >
            <ColorRow
              v-for="c in UI_COLORS_DERIVED"
              :key="c.key"
              :label="c.label"
              :value="(theme.colors as any)[c.key]"
              @update="(theme.colors as any)[c.key] = $event"
            />
          </div>
        </div>

        <div>
          <div class="mb-1.5 flex items-center gap-2">
            <span class="text-ink-3 text-xs font-semibold tracking-widest uppercase">
              Rank Colors
            </span>
            <div class="bg-border h-px flex-1" />
          </div>
          <div
            class="card divide-subtle transition-opacity duration-200"
            :style="theme.dynamicColors ? 'opacity:0.42;pointer-events:none' : ''"
          >
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
