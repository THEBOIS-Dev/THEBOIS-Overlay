<script setup lang="ts">
import Section from '@renderer/components/SettingsSection.vue';
import ShortcutInput from '@renderer/components/ShortcutInput.vue';
import ToggleSetting from '@renderer/components/ToggleSetting.vue';
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import { Column, COLUMNS, type Network, NETWORKS } from '@renderer/types';
import type { ProxyStatusAll } from '@renderer/types';
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  Keyboard,
  Palette,
  RefreshCw,
  Sliders,
  ArrowUpDown,
  X,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

const config = useConfigStore();
const players = usePlayersStore();
const route = useRoute();
const activeTab = ref(
  typeof route.query['tab'] === 'string' ? route.query['tab'] : 'appearance',
);

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
let proxyPollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  unsubUpdater = window.api.updater.onStatus((payload) => {
    updateStatus.value = payload.status as UpdateStatus;
    if (payload.version) updateVersion.value = payload.version;
    if (payload.percent !== undefined) updatePercent.value = payload.percent;
    if (payload.error) updateError.value = payload.error;
  });
  void refreshProxyStatus();
  proxyPollTimer = setInterval(() => void refreshProxyStatus(), 3000);
});
onUnmounted(() => {
  unsubUpdater?.();
  if (proxyPollTimer) clearInterval(proxyPollTimer);
});

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'columns', label: 'Columns', icon: Columns3 },
  { id: 'sorting', label: 'Sorting', icon: ArrowUpDown },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: Sliders },
];

const proxyStatus = ref<ProxyStatusAll | null>(null);
const pikaPortInput = ref<string>(String(config.pikaProxyPort));
const jartexPortInput = ref<string>(String(config.jartexProxyPort));
const proxyPortError = ref<string>('');

async function refreshProxyStatus(): Promise<void> {
  proxyStatus.value = await window.api.proxy.getStatus();
}

async function applyProxyPort(network: 'pikanetwork' | 'jartexnetwork'): Promise<void> {
  const raw = network === 'pikanetwork' ? pikaPortInput.value : jartexPortInput.value;
  const port = parseInt(raw, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    proxyPortError.value = 'Port must be between 1024 and 65535';
    return;
  }
  proxyPortError.value = '';
  if (network === 'pikanetwork') config.pikaProxyPort = port;
  else config.jartexProxyPort = port;
  await window.api.proxy.setPort(network, port);
  await refreshProxyStatus();
}

async function applyBindHost(host: '0.0.0.0' | '127.0.0.1'): Promise<void> {
  config.proxyBindHost = host;
  config.proxyBannerDismissed = false;
  await window.api.proxy.setBindHost(host);
  await refreshProxyStatus();
}

const ALL_COLUMNS = Object.values(Column);
const SORTABLE_COLUMNS = computed(() =>
  ALL_COLUMNS.filter((c) => COLUMNS[c]?.sortable === true),
);
const inactiveColumns = computed(() =>
  config.activeColumns
    ? ALL_COLUMNS.filter((c) => !config.activeColumns.includes(c))
    : [],
);

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

const PROXY_ENTRIES = computed(() => [
  {
    label: 'PikaNetwork',
    network: 'pikanetwork' as const,
    host: 'pika.host',
    color: '#ffea00',
    status: proxyStatus.value?.pika,
    portInput: pikaPortInput,
    port: config.pikaProxyPort,
  },
  {
    label: 'JartexNetwork',
    network: 'jartexnetwork' as const,
    host: 'jartex.fun',
    color: '#06b6d4',
    status: proxyStatus.value?.jartex,
    portInput: jartexPortInput,
    port: config.jartexProxyPort,
  },
]);
</script>

<template>
  <div
    class="flex h-full overflow-hidden"
    style="pointer-events: all"
  >
    <aside
      class="settings-sidebar themed-scroll flex shrink-0 flex-col overflow-y-auto border-r py-2"
    >
      <div class="flex flex-col gap-px px-2">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="settings-tab relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-left"
          :class="{ 'settings-tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <div
            v-if="activeTab === tab.id"
            class="tab-bg absolute inset-0 rounded-lg"
          />
          <component
            :is="tab.icon"
            :size="12"
            class="relative shrink-0"
          />
          <span class="tab-label relative">{{ tab.label }}</span>
        </button>
      </div>
    </aside>

    <div
      class="settings-content themed-scroll flex flex-1 flex-col gap-4 overflow-y-auto p-3"
    >
      <div
        v-if="activeTab === 'appearance'"
        class="animate-fade-in flex flex-col gap-4"
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
            <span style="font-size: 0.82rem; font-weight: 500; color: var(--color-ink-2)"
              >Column labels</span
            >
            <div class="no-drag flex gap-1">
              <button
                v-for="opt in ['FULL', 'SHORT', 'HIDDEN'] as const"
                :key="opt"
                class="label-btn rounded px-2.5 py-1"
                :class="{ 'label-btn--active': config.columnLabels === opt }"
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
        class="animate-fade-in flex flex-col gap-4"
      >
        <Section title="Columns">
          <div
            v-if="config.activeColumns?.length"
            class="flex flex-col gap-4 py-2"
          >
            <div v-if="config.activeColumns.length">
              <p class="group-label mb-1.5">Active</p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(col, idx) in config.activeColumns"
                  :key="col"
                  class="active-col-row flex items-center justify-between rounded-lg px-2.5 py-1.5"
                >
                  <div class="flex items-center gap-2">
                    <span class="col-dot col-dot--active" />
                    <span
                      style="
                        font-size: 0.8rem;
                        font-weight: 500;
                        color: var(--color-accent-light);
                      "
                      >{{ COLUMNS[col].label }}</span
                    >
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
              <p class="group-label mb-1.5">Available</p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="col in inactiveColumns"
                  :key="col"
                  class="inactive-col-row flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5"
                  @click="toggleColumn(col)"
                >
                  <div class="flex items-center gap-2">
                    <span class="col-dot col-dot--inactive" />
                    <span
                      style="
                        font-size: 0.8rem;
                        font-weight: 500;
                        color: var(--color-ink-3);
                      "
                      >{{ COLUMNS[col].label }}</span
                    >
                  </div>
                  <span class="add-label">+ Add</span>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="py-4 text-center"
            style="font-size: 0.78rem; color: var(--color-ink-3)"
          >
            No columns configured.
          </div>
        </Section>
      </div>

      <div
        v-if="activeTab === 'sorting'"
        class="animate-fade-in flex flex-col gap-4"
      >
        <Section title="Sort By">
          <div
            v-if="SORTABLE_COLUMNS.length"
            class="no-drag flex flex-col gap-1 py-1.5"
          >
            <div
              v-for="col in SORTABLE_COLUMNS"
              :key="col"
              class="sort-row flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2"
              :class="{ 'sort-row--active': config.sortBy === col }"
              @click="config.sortBy = col"
            >
              <span
                class="sort-dot"
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
          <ToggleSetting
            label="Sort ascending"
            :value="config.sortAscending"
            @update="config.sortAscending = $event"
          />
        </Section>
      </div>

      <div
        v-if="activeTab === 'shortcuts'"
        class="animate-fade-in flex flex-col gap-4"
      >
        <Section
          title="Keyboard Shortcuts"
          description="Click a field, then press your desired key combination."
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
        class="animate-fade-in flex flex-col gap-4"
      >
        <Section title="Network">
          <div class="flex flex-col gap-3 py-2">
            <div
              class="setting-panel flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            >
              <div>
                <div class="panel-label">Auto-detect via proxy</div>
                <div class="panel-desc mt-0.5">
                  Automatically switches the active network when your client connects
                  through the proxy
                </div>
              </div>
              <button
                class="no-drag mini-toggle relative shrink-0 rounded-full"
                :style="{
                  background: config.autoDetectNetwork
                    ? 'var(--color-accent)'
                    : 'rgba(140,100,255,0.14)',
                  border: config.autoDetectNetwork
                    ? '1px solid rgba(140,80,255,0.5)'
                    : '1px solid rgba(140,100,255,0.25)',
                  boxShadow: config.autoDetectNetwork
                    ? '0 0 10px rgba(124,58,237,0.35)'
                    : 'none',
                }"
                @click="config.autoDetectNetwork = !config.autoDetectNetwork"
              >
                <span
                  class="mini-toggle-thumb"
                  :style="{ left: config.autoDetectNetwork ? '19px' : '3px' }"
                />
              </button>
            </div>

            <div
              :style="{
                opacity: config.autoDetectNetwork ? 0.4 : 1,
                pointerEvents: config.autoDetectNetwork ? 'none' : 'auto',
                transition: 'opacity 0.2s',
              }"
            >
              <p class="panel-desc mb-2">
                Manual selection — determines which API is used to fetch player stats.
              </p>
              <div class="no-drag flex gap-2">
                <button
                  v-for="net in NETWORKS"
                  :key="net.value"
                  class="network-btn flex-1 rounded-xl py-2"
                  :style="{
                    background:
                      config.network === net.value
                        ? `${NETWORK_COLORS[net.value]}12`
                        : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${config.network === net.value ? NETWORK_COLORS[net.value] + '45' : 'rgba(255,255,255,0.07)'}`,
                    color:
                      config.network === net.value
                        ? NETWORK_COLORS[net.value]
                        : 'var(--color-ink-3)',
                    boxShadow:
                      config.network === net.value
                        ? `0 0 16px ${NETWORK_COLORS[net.value]}12`
                        : 'none',
                  }"
                  @click="onNetworkChange(net.value)"
                >
                  {{ net.label }}
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Proxy">
          <div class="flex flex-col gap-2.5 py-2">
            <p
              class="panel-desc"
              style="line-height: 1.6"
            >
              Route your Minecraft client through the proxy to enable team detection,
              player tracking, and automatic network switching.
            </p>

            <div
              class="setting-panel flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            >
              <div>
                <div class="panel-label">Allow LAN access</div>
                <div class="panel-desc mt-0.5">
                  Binds to
                  <span
                    class="font-mono"
                    style="color: var(--color-ink-2); font-size: 0.69rem"
                    >0.0.0.0</span
                  >
                  — other devices on your local network can connect
                </div>
              </div>
              <button
                class="no-drag mini-toggle relative shrink-0 rounded-full"
                :style="{
                  background:
                    config.proxyBindHost === '0.0.0.0'
                      ? 'var(--color-accent)'
                      : 'rgba(140,100,255,0.14)',
                  border:
                    config.proxyBindHost === '0.0.0.0'
                      ? '1px solid rgba(140,80,255,0.5)'
                      : '1px solid rgba(140,100,255,0.25)',
                  boxShadow:
                    config.proxyBindHost === '0.0.0.0'
                      ? '0 0 10px rgba(124,58,237,0.35)'
                      : 'none',
                }"
                @click="
                  applyBindHost(
                    config.proxyBindHost === '0.0.0.0' ? '127.0.0.1' : '0.0.0.0',
                  )
                "
              >
                <span
                  class="mini-toggle-thumb"
                  :style="{ left: config.proxyBindHost === '0.0.0.0' ? '19px' : '3px' }"
                />
              </button>
            </div>

            <div
              v-if="config.proxyBindHost === '0.0.0.0'"
              class="rounded-xl px-3 py-2"
              style="
                background: rgba(251, 191, 36, 0.05);
                border: 1px solid rgba(251, 191, 36, 0.18);
              "
            >
              <span style="font-size: 0.71rem; color: #fbbf24; line-height: 1.5">
                LAN mode active. Any device on your local network can route traffic
                through this proxy.
              </span>
            </div>

            <div class="flex flex-col gap-2">
              <div
                v-for="entry in PROXY_ENTRIES"
                :key="entry.network"
                class="proxy-card rounded-xl p-3"
              >
                <div class="mb-2.5 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span
                      class="proxy-status-dot"
                      :class="{ 'animate-status-blink': entry.status?.running }"
                      :style="{
                        background: entry.status?.running
                          ? '#34d399'
                          : entry.status?.error
                            ? '#f87171'
                            : 'rgba(255,255,255,0.15)',
                        boxShadow: entry.status?.running
                          ? '0 0 6px rgba(52,211,153,0.6)'
                          : 'none',
                      }"
                    />
                    <span
                      class="font-semibold"
                      :style="{ color: entry.color, fontSize: '0.78rem' }"
                      >{{ entry.label }}</span
                    >
                    <span
                      v-if="entry.status?.running"
                      class="status-pill status-pill--active"
                      >ACTIVE</span
                    >
                    <span
                      v-else-if="entry.status?.error"
                      class="status-pill status-pill--error"
                      >ERROR</span
                    >
                  </div>
                  <span style="font-size: 0.7rem; color: var(--color-ink-3)"
                    >{{ entry.host }}:25565</span
                  >
                </div>

                <div class="flex gap-2">
                  <div class="flex flex-col gap-1.5">
                    <span class="field-label">Local port</span>
                    <div class="no-drag flex items-center gap-1.5">
                      <input
                        class="proxy-port-input font-mono"
                        type="number"
                        min="1024"
                        max="65535"
                        :value="
                          entry.network === 'pikanetwork'
                            ? pikaPortInput
                            : jartexPortInput
                        "
                        @input="
                          entry.network === 'pikanetwork'
                            ? (pikaPortInput = ($event.target as HTMLInputElement).value)
                            : (jartexPortInput = ($event.target as HTMLInputElement)
                                .value)
                        "
                        @keydown.enter="applyProxyPort(entry.network)"
                      />
                      <button
                        class="apply-btn btn no-drag"
                        @click="applyProxyPort(entry.network)"
                      >
                        Apply
                      </button>
                    </div>
                  </div>

                  <div
                    class="flex flex-1 flex-col justify-between rounded-lg p-2"
                    style="
                      background: rgba(0, 0, 0, 0.2);
                      border: 1px solid rgba(255, 255, 255, 0.04);
                    "
                  >
                    <span class="field-label">Point your client to</span>
                    <div
                      class="font-mono font-semibold"
                      style="font-size: 0.75rem; margin-top: 3px"
                      :style="{ color: entry.color }"
                    >
                      {{
                        config.proxyBindHost === '0.0.0.0'
                          ? '&lt;your-ip&gt;'
                          : 'localhost'
                      }}:{{ entry.port }}
                    </div>
                    <div
                      v-if="entry.status?.clientCount"
                      style="font-size: 0.64rem; color: #34d399; margin-top: 2px"
                    >
                      {{ entry.status.clientCount }} client{{
                        entry.status.clientCount !== 1 ? 's' : ''
                      }}
                      connected
                    </div>
                  </div>
                </div>

                <div
                  v-if="entry.status?.error"
                  class="mt-2 rounded-lg px-2.5 py-1.5"
                  style="
                    background: rgba(248, 113, 113, 0.06);
                    border: 1px solid rgba(248, 113, 113, 0.15);
                  "
                >
                  <span style="font-size: 0.68rem; color: #f87171">{{
                    entry.status.error
                  }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="proxyPortError"
              class="rounded-lg px-2.5 py-1.5"
              style="
                background: rgba(248, 113, 113, 0.06);
                border: 1px solid rgba(248, 113, 113, 0.15);
              "
            >
              <span style="font-size: 0.68rem; color: #f87171">{{ proxyPortError }}</span>
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
              class="action-btn btn no-drag flex items-center gap-1.5 rounded-lg"
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
              class="action-btn action-btn--good btn no-drag flex items-center gap-1.5 rounded-lg"
              @click="installUpdate"
            >
              <Download :size="10" />
              Restart &amp; install
            </button>
          </div>
        </Section>

        <Section title="Danger Zone">
          <div class="flex items-center justify-between py-2.5">
            <span style="font-size: 0.8rem; color: var(--color-ink-2)"
              >Reset all settings to defaults</span
            >
            <button
              class="action-btn action-btn--danger btn no-drag rounded-lg"
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

<style scoped>
.settings-sidebar {
  width: 126px;
  border-color: rgba(120, 80, 255, 0.12);
  background: rgba(255, 255, 255, 0.01);
}

.settings-tab {
  color: var(--color-ink-3);
  transition: color 150ms ease;
  cursor: pointer;
}

.settings-tab:hover:not(.settings-tab--active) {
  color: var(--color-ink-2);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.settings-tab--active {
  color: var(--color-accent-light);
}

.tab-bg {
  background: linear-gradient(
    105deg,
    rgba(124, 58, 237, 0.14) 0%,
    rgba(124, 58, 237, 0.06) 100%
  );
  border: 1px solid rgba(124, 58, 237, 0.18);
}

.tab-label {
  font-size: 0.78rem;
  font-weight: 500;
}

.label-btn {
  font-size: 0.71rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-ink-3);
  border: 1px solid rgba(120, 80, 255, 0.15);
  cursor: pointer;
  transition: all 150ms ease;
}

.label-btn:hover {
  color: var(--color-ink-2);
  border-color: rgba(120, 80, 255, 0.28);
}

.label-btn--active {
  background: rgba(124, 58, 237, 0.14);
  color: var(--color-accent-light);
  border-color: rgba(124, 58, 237, 0.35);
}

.group-label {
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-ink-3);
}

.col-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.col-dot--active {
  background: var(--color-accent);
  opacity: 0.8;
}
.col-dot--inactive {
  background: rgba(255, 255, 255, 0.12);
}

.active-col-row {
  background: rgba(124, 58, 237, 0.1);
  border: 1px solid rgba(124, 58, 237, 0.2);
}

.inactive-col-row {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 120ms ease;
}

.inactive-col-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(120, 80, 255, 0.2);
}

.add-label {
  font-size: 0.72rem;
  color: var(--color-accent-light);
  opacity: 0.7;
}

.sort-row {
  font-size: 0.82rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--color-ink-3);
  transition: all 120ms ease;
}

.sort-row:hover:not(.sort-row--active) {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(120, 80, 255, 0.2);
  color: var(--color-ink-2);
}

.sort-row--active {
  background: rgba(124, 58, 237, 0.12);
  border-color: rgba(124, 58, 237, 0.28);
  color: var(--color-accent-light);
}

.sort-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: background 150ms ease;
}

.setting-panel {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: border-color 150ms ease;
}

.setting-panel:hover {
  border-color: rgba(255, 255, 255, 0.1);
}

.panel-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-ink-1);
}

.panel-desc {
  font-size: 0.71rem;
  color: var(--color-ink-3);
  line-height: 1.45;
}

.mini-toggle {
  width: 36px;
  height: 20px;
  transition:
    background 200ms ease,
    box-shadow 200ms ease,
    border-color 200ms ease;
  cursor: pointer;
}

.mini-toggle-thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: white;
  top: 50%;
  transform: translateY(-50%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  transition: left 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.network-btn {
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.proxy-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: border-color 150ms ease;
}

.proxy-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
}

.proxy-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.status-pill {
  border-radius: 4px;
  padding: 0.07rem 0.4rem;
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.status-pill--active {
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
  border: 1px solid rgba(52, 211, 153, 0.22);
}

.status-pill--error {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.22);
}

.field-label {
  font-size: 0.67rem;
  color: var(--color-ink-3);
}

.proxy-port-input {
  width: 78px;
  padding: 5px 9px;
  border-radius: 7px;
  font-size: 0.78rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-ink-1);
  outline: none;
  transition:
    border-color 140ms ease,
    background 140ms ease;
  -webkit-app-region: no-drag;
}

.proxy-port-input:focus {
  border-color: rgba(124, 58, 237, 0.45);
  background: rgba(124, 58, 237, 0.06);
}

.apply-btn {
  font-size: 0.72rem;
  padding: 5px 10px;
  border: 1px solid rgba(120, 80, 255, 0.2);
  color: var(--color-ink-2);
  border-radius: 7px;
  transition: all 140ms ease;
}

.apply-btn:hover {
  border-color: rgba(124, 58, 237, 0.38);
  color: var(--color-ink-1);
  background: rgba(124, 58, 237, 0.08);
}

.action-btn {
  font-size: 0.74rem;
  padding: 5px 11px;
  border: 1px solid rgba(120, 80, 255, 0.18);
  color: var(--color-ink-2);
  transition: all 150ms ease;
}

.action-btn:hover {
  color: var(--color-ink-1);
  border-color: rgba(120, 80, 255, 0.32);
  background: rgba(255, 255, 255, 0.05);
}

.action-btn--good {
  border-color: rgba(52, 211, 153, 0.25);
  color: var(--color-good);
}

.action-btn--good:hover {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.06);
}

.action-btn--danger {
  border-color: rgba(248, 113, 113, 0.22);
  color: var(--color-bad);
}

.action-btn--danger:hover {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.06);
}
</style>
