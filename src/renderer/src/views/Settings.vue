<script setup lang="ts">
import Section from '@renderer/components/SettingsSection.vue';
import ShortcutInput from '@renderer/components/ShortcutInput.vue';
import ToggleSetting from '@renderer/components/ToggleSetting.vue';
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import { Column, COLUMNS, type Network, NETWORKS } from '@renderer/types';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Download,
  Keyboard,
  Palette,
  RefreshCw,
  Sliders,
  X,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';

const config = useConfigStore();
const players = usePlayersStore();
const activeTab = ref('appearance');

type UpdateStatus =
  | 'idle'
  | 'dev'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';
const updateStatus = ref<UpdateStatus>('idle');
const updateVersion = ref('');
const updatePercent = ref(0);
const updateError = ref('');

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'dev':
      return 'Updates disabled in dev mode';
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return 'You are on the latest version';
    case 'available':
      return `Update available: v${updateVersion.value}`;
    case 'downloading':
      return `Downloading… ${updatePercent.value}%`;
    case 'downloaded':
      return `v${updateVersion.value} ready to install`;
    case 'error':
      return `Error: ${updateError.value}`;
    default:
      return 'Check for updates';
  }
});

function checkUpdate(): void {
  window.api.updater.check();
}
function installUpdate(): void {
  window.api.updater.install();
}

let unsubUpdater: (() => void) | null = null;
onMounted(() => {
  unsubUpdater = window.api.updater.onStatus((payload) => {
    updateStatus.value = payload.status as UpdateStatus;
    if (payload.version) updateVersion.value = payload.version;
    if (payload.percent !== undefined) updatePercent.value = payload.percent;
    if (payload.error) updateError.value = payload.error;
  });
});
onUnmounted(() => {
  unsubUpdater?.();
});

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'columns', label: 'Columns', icon: Columns3 },
  { id: 'sorting', label: 'Sorting', icon: ArrowUpDown },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: Sliders },
];

const ALL_COLUMNS = Object.values(Column);
const SORTABLE_COLUMNS = computed(() =>
  ALL_COLUMNS.filter((c) => COLUMNS[c]?.sortable === true),
);
const inactiveColumns = computed(() => {
  if (!config.activeColumns) return [];
  return ALL_COLUMNS.filter((c) => !config.activeColumns.includes(c));
});

function toggleColumn(col: Column): void {
  const idx = config.activeColumns.indexOf(col);
  if (idx === -1) config.activeColumns.push(col);
  else if (config.activeColumns.length > 1) config.activeColumns.splice(idx, 1);
}

function moveColumn(idx: number, dir: -1 | 1): void {
  const cols = [...config.activeColumns];
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= cols.length) return;
  [cols[idx], cols[swapIdx]] = [cols[swapIdx], cols[idx]];
  config.activeColumns = cols;
}

async function onShortcutChange(
  key: 'shortcutMinimize' | 'shortcutClearPlayers',
  value: string,
): Promise<void> {
  config[key] = value;
  await window.api.shortcuts.register([
    config.shortcutMinimize,
    config.shortcutClearPlayers,
  ]);
}

function onNetworkChange(net: Network): void {
  if (config.network === net) return;
  config.network = net;
  window.api.rpc.setNetwork(net);
  players.clear();
}

const NETWORK_COLORS: Record<Network, string> = {
  pikanetwork: '#ffea00',
  jartexnetwork: '#06b6d4',
};
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
      <div class="flex flex-col gap-0.5 px-2">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left transition-all"
          :style="
            activeTab === tab.id
              ? 'color:var(--color-accent-light)'
              : 'color:var(--color-ink-3)'
          "
          @click="activeTab = tab.id"
        >
          <div
            v-if="activeTab === tab.id"
            class="absolute top-1/2 left-0 -translate-y-1/2 rounded-full"
            style="width: 2px; height: 14px; background: var(--color-accent)"
          />
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
    </aside>

    <div class="themed-scroll flex flex-1 flex-col gap-3.5 overflow-y-auto p-3">
      <div
        v-if="activeTab === 'appearance'"
        class="animate-fade-in flex flex-col gap-3.5"
      >
        <Section title="Appearance">
          <ToggleSetting
            label="Rounded corners"
            :value="config.roundedCorners"
            @update="config.roundedCorners = $event"
          />
          <ToggleSetting
            label="Text shadow"
            :value="config.textShadow"
            @update="config.textShadow = $event"
          />
          <ToggleSetting
            label="Integrated mode"
            :value="config.integratedMode"
            @update="config.integratedMode = $event"
          />
          <div class="flex items-center justify-between py-2.5">
            <span
              class="font-medium"
              style="font-size: 0.82rem; color: var(--color-ink-2)"
            >
              Column labels
            </span>
            <div class="no-drag flex gap-1">
              <button
                v-for="opt in ['FULL', 'SHORT', 'HIDDEN'] as const"
                :key="opt"
                class="rounded px-2.5 py-1 transition-all"
                style="font-size: 0.72rem; font-weight: 600"
                :style="
                  config.columnLabels === opt
                    ? 'background:var(--color-accent-dim);color:var(--color-accent-light);border:1px solid rgba(124,58,237,0.35)'
                    : 'background:rgba(255,255,255,0.04);color:var(--color-ink-3);border:1px solid var(--color-border)'
                "
                @click="config.columnLabels = opt"
              >
                {{ opt.charAt(0) + opt.slice(1).toLowerCase() }}
              </button>
            </div>
          </div>
        </Section>
      </div>

      <div
        v-if="activeTab === 'columns'"
        class="animate-fade-in flex flex-col gap-3.5"
      >
        <Section title="Columns">
          <div
            v-if="config.activeColumns?.length"
            class="flex flex-col gap-3 py-1"
          >
            <div v-if="config.activeColumns.length">
              <p
                class="mb-1.5 tracking-widest uppercase"
                style="
                  font-size: 0.62rem;
                  color: var(--color-ink-3);
                  letter-spacing: 0.09em;
                "
              >
                Active
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(col, idx) in config.activeColumns"
                  :key="col"
                  class="flex items-center justify-between rounded-md px-2.5 py-1.5"
                  style="
                    background: var(--color-accent-dim);
                    border: 1px solid rgba(124, 58, 237, 0.25);
                  "
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="rounded-full"
                      style="
                        width: 5px;
                        height: 5px;
                        background: var(--color-accent);
                        opacity: 0.8;
                      "
                    />
                    <span
                      class="font-medium"
                      style="font-size: 0.78rem; color: var(--color-accent-light)"
                    >
                      {{ COLUMNS[col].label }}
                    </span>
                  </div>
                  <div class="flex items-center gap-0.5">
                    <button
                      class="btn h-5 w-5 rounded"
                      :disabled="idx === 0"
                      @click="moveColumn(idx, -1)"
                    >
                      <ArrowUp :size="9" />
                    </button>
                    <button
                      class="btn h-5 w-5 rounded"
                      :disabled="idx === config.activeColumns.length - 1"
                      @click="moveColumn(idx, 1)"
                    >
                      <ArrowDown :size="9" />
                    </button>
                    <button
                      class="btn h-5 w-5 rounded"
                      :disabled="config.activeColumns.length <= 1"
                      style="color: var(--color-bad)"
                      @click="toggleColumn(col)"
                    >
                      <X :size="9" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="inactiveColumns.length">
              <p
                class="mb-1.5 tracking-widest uppercase"
                style="
                  font-size: 0.62rem;
                  color: var(--color-ink-3);
                  letter-spacing: 0.09em;
                "
              >
                Available
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="col in inactiveColumns"
                  :key="col"
                  class="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 transition-all"
                  style="
                    background: rgba(255, 255, 255, 0.025);
                    border: 1px solid var(--color-border);
                  "
                  @click="toggleColumn(col)"
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="rounded-full"
                      style="
                        width: 5px;
                        height: 5px;
                        background: rgba(255, 255, 255, 0.12);
                      "
                    />
                    <span
                      class="font-medium"
                      style="font-size: 0.78rem; color: var(--color-ink-3)"
                    >
                      {{ COLUMNS[col].label }}
                    </span>
                  </div>
                  <span
                    style="
                      font-size: 0.72rem;
                      color: var(--color-accent-light);
                      opacity: 0.7;
                    "
                  >
                    + Add
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="py-4 text-center"
            style="font-size: 0.78rem; color: var(--color-ink-3)"
          >
            No columns configured. Reset settings to fix.
          </div>
        </Section>
      </div>

      <div
        v-if="activeTab === 'sorting'"
        class="animate-fade-in flex flex-col gap-3.5"
      >
        <Section title="Sort By">
          <div
            v-if="SORTABLE_COLUMNS.length"
            class="no-drag flex flex-col gap-1 py-1"
          >
            <div
              v-for="col in SORTABLE_COLUMNS"
              :key="col"
              class="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-all"
              style="font-size: 0.82rem"
              :style="
                config.sortBy === col
                  ? 'background:var(--color-accent-dim);border:1px solid rgba(124,58,237,0.28);color:var(--color-accent-light)'
                  : 'background:rgba(255,255,255,0.025);border:1px solid var(--color-border);color:var(--color-ink-3)'
              "
              @click="config.sortBy = col"
            >
              <div
                class="rounded-full"
                style="width: 5px; height: 5px; flex-shrink: 0"
                :style="{
                  background:
                    config.sortBy === col
                      ? 'var(--color-accent)'
                      : 'rgba(255,255,255,0.14)',
                }"
              />
              {{ COLUMNS[col].label }}
            </div>
          </div>
          <div
            v-else
            class="py-4 text-center"
            style="font-size: 0.78rem; color: var(--color-ink-3)"
          >
            No sortable columns available.
          </div>
          <ToggleSetting
            label="Sort ascending"
            :value="config.sortAscending"
            @update="config.sortAscending = $event"
          />
        </Section>
      </div>

      <div
        v-if="activeTab === 'shortcuts'"
        class="animate-fade-in flex flex-col gap-3.5"
      >
        <Section
          title="Keyboard Shortcuts"
          description="Click a field then press your desired key combination."
        >
          <ShortcutInput
            label="Minimize / Restore"
            :value="config.shortcutMinimize"
            @update="onShortcutChange('shortcutMinimize', $event)"
          />
          <ShortcutInput
            label="Clear Players"
            :value="config.shortcutClearPlayers"
            @update="onShortcutChange('shortcutClearPlayers', $event)"
          />
        </Section>
      </div>

      <div
        v-if="activeTab === 'advanced'"
        class="animate-fade-in flex flex-col gap-3.5"
      >
        <Section title="Network">
          <div class="flex flex-col gap-2 py-2">
            <p style="font-size: 0.76rem; color: var(--color-ink-3); line-height: 1.5">
              Determines which API is used to fetch player stats. Changing the network
              clears the player list.
            </p>
            <div class="no-drag flex gap-2">
              <button
                v-for="net in NETWORKS"
                :key="net.value"
                class="flex-1 rounded-md py-2 font-semibold transition-all"
                style="font-size: 0.78rem"
                :style="{
                  background:
                    config.network === net.value
                      ? `${NETWORK_COLORS[net.value]}14`
                      : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${config.network === net.value ? NETWORK_COLORS[net.value] + '50' : 'var(--color-border)'}`,
                  color:
                    config.network === net.value
                      ? NETWORK_COLORS[net.value]
                      : 'var(--color-ink-3)',
                  boxShadow:
                    config.network === net.value
                      ? `0 0 12px ${NETWORK_COLORS[net.value]}15`
                      : 'none',
                }"
                @click="onNetworkChange(net.value)"
              >
                {{ net.label }}
              </button>
            </div>
          </div>
        </Section>

        <Section title="Auto-detection">
          <ToggleSetting
            label="Auto-add on join"
            :value="config.autoAddPlayers"
            @update="config.autoAddPlayers = $event"
          />
          <ToggleSetting
            label="Clear list on /who"
            :value="config.autoRemoveAllOnWho"
            @update="config.autoRemoveAllOnWho = $event"
          />
          <ToggleSetting
            label="Remove on final kill"
            :value="config.autoRemoveFinalDeath"
            @update="config.autoRemoveFinalDeath = $event"
          />
          <ToggleSetting
            label="Remove on quit"
            :value="config.autoRemoveOnQuit"
            @update="config.autoRemoveOnQuit = $event"
          />
          <ToggleSetting
            label="Missing players warning"
            :value="config.missingPlayersWarning"
            @update="config.missingPlayersWarning = $event"
          />
        </Section>

        <Section title="Updates">
          <ToggleSetting
            label="Auto-update on launch"
            :value="config.autoUpdateEnabled"
            @update="config.autoUpdateEnabled = $event"
          />
          <div class="flex items-center justify-between py-2.5">
            <span style="font-size: 0.8rem; color: var(--color-ink-2)">{{
              updateStatusText
            }}</span>
            <button
              class="btn no-drag flex items-center gap-1.5 rounded-md"
              style="
                font-size: 0.75rem;
                padding: 0.3rem 0.75rem;
                border: 1px solid var(--color-border);
                color: var(--color-ink-2);
              "
              :disabled="updateStatus === 'checking' || updateStatus === 'downloading'"
              @click="checkUpdate"
            >
              <RefreshCw :size="10" />
              Check
            </button>
          </div>
          <div
            v-if="updateStatus === 'downloaded'"
            class="flex items-center justify-between py-2.5"
          >
            <span style="font-size: 0.8rem; color: var(--color-good)"
              >Ready to install</span
            >
            <button
              class="btn no-drag flex items-center gap-1.5 rounded-md"
              style="
                font-size: 0.75rem;
                padding: 0.3rem 0.75rem;
                border: 1px solid rgba(52, 211, 153, 0.3);
                color: var(--color-good);
              "
              @click="installUpdate"
            >
              <Download :size="10" />
              Restart & install
            </button>
          </div>
        </Section>

        <Section title="Danger Zone">
          <div class="flex items-center justify-between py-2.5">
            <span style="font-size: 0.82rem; color: var(--color-ink-2)">
              Reset all settings to defaults
            </span>
            <button
              class="btn no-drag rounded-md"
              style="
                font-size: 0.75rem;
                padding: 0.3rem 0.75rem;
                border: 1px solid rgba(248, 113, 113, 0.25);
                color: var(--color-bad);
              "
              @click="config.$reset()"
            >
              Reset
            </button>
          </div>
        </Section>
      </div>
    </div>
  </div>
</template>
