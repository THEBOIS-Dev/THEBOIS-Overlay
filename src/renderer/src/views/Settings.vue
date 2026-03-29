<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@renderer/store/config'
import { Column, COLUMNS } from '@renderer/types'
import ToggleSetting from '@renderer/components/ToggleSetting.vue'
import SliderSetting from '@renderer/components/SliderSetting.vue'
import ShortcutInput from '@renderer/components/ShortcutInput.vue'
import Section from '@renderer/components/SettingsSection.vue'

const config = useConfigStore()
const activeTab = ref('appearance')

type UpdateStatus =
  | 'idle'
  | 'dev'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'
const updateStatus = ref<UpdateStatus>('idle')
const updateVersion = ref('')
const updatePercent = ref(0)
const updateError = ref('')

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'dev':
      return 'Updates disabled in dev mode'
    case 'checking':
      return 'Checking for updates...'
    case 'up-to-date':
      return 'You are on the latest version'
    case 'available':
      return `Update available: v${updateVersion.value}`
    case 'downloading':
      return `Downloading... ${updatePercent.value}%`
    case 'downloaded':
      return `v${updateVersion.value} downloaded`
    case 'error':
      return `Update error: ${updateError.value}`
    default:
      return 'Click to check for updates'
  }
})

function checkUpdate(): void {
  window.api.updater.check()
}

function installUpdate(): void {
  window.api.updater.install()
}

let unsubUpdater: (() => void) | null = null

onMounted(() => {
  unsubUpdater = window.api.updater.onStatus((payload) => {
    updateStatus.value = payload.status as UpdateStatus
    if (payload.version) updateVersion.value = payload.version
    if (payload.percent !== undefined) updatePercent.value = payload.percent
    if (payload.error) updateError.value = payload.error
  })
})

onUnmounted(() => {
  unsubUpdater?.()
})

const TABS = [
  {
    id: 'appearance',
    label: 'Appearance',
    iconPath:
      'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  },
  {
    id: 'columns',
    label: 'Columns',
    iconPath:
      'M3 5h8V3H3v2zm0 8h8v-2H3v2zm0 8h8v-2H3v2zm10-8h8v-2h-8v2zm0 8h8v-2h-8v2zm0-16v2h8V5h-8z',
  },
  { id: 'sorting', label: 'Sorting', iconPath: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z' },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    iconPath:
      'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm9 0H8v-2h8v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 6h-2v-2h2v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2z',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    iconPath:
      'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  },
]

const ALL_COLUMNS = Object.values(Column)
const SORTABLE_COLUMNS = computed(() => ALL_COLUMNS.filter((c) => COLUMNS[c]?.sortable === true))

const inactiveColumns = computed(() => {
  if (!config.activeColumns) return []
  return ALL_COLUMNS.filter((c) => !config.activeColumns.includes(c))
})

function toggleColumn(col: Column): void {
  const idx = config.activeColumns.indexOf(col)
  if (idx === -1) {
    config.activeColumns.push(col)
  } else if (config.activeColumns.length > 1) {
    config.activeColumns.splice(idx, 1)
  }
}

function moveColumn(idx: number, dir: -1 | 1): void {
  const cols = [...config.activeColumns]
  const swapIdx = idx + dir
  if (swapIdx < 0 || swapIdx >= cols.length) return
  ;[cols[idx], cols[swapIdx]] = [cols[swapIdx], cols[idx]]
  config.activeColumns = cols
}

async function onShortcutChange(
  key: 'shortcutMinimize' | 'shortcutClearPlayers',
  value: string,
): Promise<void> {
  config[key] = value
  await window.api.shortcuts.register([config.shortcutMinimize, config.shortcutClearPlayers])
}
</script>

<template>
  <div class="flex h-full overflow-hidden" style="pointer-events: all">
    <!-- Sidebar -->
    <aside
      class="shrink-0 flex flex-col gap-0.5 p-2 border-r overflow-y-auto themed-scroll"
      style="width: 132px; border-color: var(--color-border)"
    >
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors"
        :style="
          activeTab === tab.id
            ? 'background: var(--color-accent-dim); color: var(--color-accent-light);'
            : 'color: var(--color-ink-2);'
        "
        @click="activeTab = tab.id"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" class="shrink-0">
          <path :d="tab.iconPath" />
        </svg>
        {{ tab.label }}
      </button>
    </aside>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-4 themed-scroll">
      <!-- Appearance -->
      <div v-if="activeTab === 'appearance'">
        <Section title="Appearance">
          <SliderSetting
            label="Font size"
            :value="config.fontSize"
            :min="9"
            :max="28"
            :step="1"
            :format="(v) => v + 'px'"
            @update="config.fontSize = $event"
          />
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
          <div class="flex items-center justify-between py-2">
            <span class="text-xs font-medium" style="color: var(--color-ink-2)">Column labels</span>
            <div class="flex gap-1 no-drag">
              <button
                v-for="opt in ['FULL', 'SHORT', 'HIDDEN'] as const"
                :key="opt"
                class="px-2 py-1 rounded text-xs transition-colors"
                :style="
                  config.columnLabels === opt
                    ? 'background: var(--color-accent-dim); color: var(--color-accent-light); border: 1px solid rgba(124,58,237,0.35);'
                    : 'background: rgba(255,255,255,0.04); color: var(--color-ink-3); border: 1px solid var(--color-border);'
                "
                @click="config.columnLabels = opt"
              >
                {{ opt.charAt(0) + opt.slice(1).toLowerCase() }}
              </button>
            </div>
          </div>
          <ToggleSetting
            label="Integrated Mode"
            :value="config.integratedMode"
            @update="config.integratedMode = $event"
          />
          <p
            v-if="config.integratedMode"
            class="text-xs px-1 pb-1"
            style="color: var(--color-ink-3); line-height: 1.5"
          >
            Footer &amp; column labels hidden, background fully transparent. Hover the header to
            reveal controls.
          </p>
        </Section>
      </div>

      <!-- Columns -->
      <div v-if="activeTab === 'columns'">
        <Section
          title="Active Columns"
          description="Toggle columns on/off. Use ↑↓ arrows to reorder."
        >
          <div
            v-if="config.activeColumns && config.activeColumns.length"
            class="flex flex-col gap-1.5 no-drag py-1"
          >
            <!-- Active columns with reorder controls -->
            <div class="mb-1">
              <p
                class="text-xs mb-1.5"
                style="
                  color: var(--color-ink-3);
                  font-size: 0.7rem;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                "
              >
                Active (in order)
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(col, idx) in config.activeColumns"
                  :key="col"
                  class="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                  style="
                    background: var(--color-accent-dim);
                    border: 1px solid rgba(124, 58, 237, 0.3);
                  "
                >
                  <div class="flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full" style="background: var(--color-accent)" />
                    <span class="text-xs font-medium" style="color: var(--color-accent-light)">
                      {{ COLUMNS[col].label }}
                    </span>
                  </div>
                  <div class="flex items-center gap-0.5">
                    <button
                      class="btn w-5 h-5 rounded"
                      :disabled="idx === 0"
                      style="font-size: 10px"
                      @click="moveColumn(idx, -1)"
                    >
                      ↑
                    </button>
                    <button
                      class="btn w-5 h-5 rounded"
                      :disabled="idx === config.activeColumns.length - 1"
                      style="font-size: 10px"
                      @click="moveColumn(idx, 1)"
                    >
                      ↓
                    </button>
                    <button
                      class="btn w-5 h-5 rounded"
                      style="color: var(--color-bad); font-size: 10px"
                      :disabled="config.activeColumns.length <= 1"
                      @click="toggleColumn(col)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Inactive columns to add -->
            <div>
              <p
                class="text-xs mb-1.5"
                style="
                  color: var(--color-ink-3);
                  font-size: 0.7rem;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                "
              >
                Available
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="col in inactiveColumns"
                  :key="col"
                  class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style="
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--color-border);
                  "
                  @click="toggleColumn(col)"
                >
                  <div class="flex items-center gap-2">
                    <div
                      class="w-1.5 h-1.5 rounded-full"
                      style="background: rgba(255, 255, 255, 0.15)"
                    />
                    <span class="text-xs font-medium" style="color: var(--color-ink-3)">
                      {{ COLUMNS[col].label }}
                    </span>
                  </div>
                  <span class="text-xs" style="color: var(--color-ink-3)">+ Add</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-center py-4" style="color: var(--color-ink-3)">
            No columns configured. Reset settings to fix.
          </div>
        </Section>
      </div>

      <!-- Sorting -->
      <div v-if="activeTab === 'sorting'">
        <Section title="Sort By">
          <div v-if="SORTABLE_COLUMNS.length" class="flex flex-col gap-1.5 no-drag py-1">
            <div
              v-for="col in SORTABLE_COLUMNS"
              :key="col"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-all"
              :style="
                config.sortBy === col
                  ? 'background: var(--color-accent-dim); border: 1px solid rgba(124,58,237,0.3); color: var(--color-accent-light);'
                  : 'background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); color: var(--color-ink-3);'
              "
              @click="config.sortBy = col"
            >
              <div
                class="w-1.5 h-1.5 rounded-full"
                :style="{
                  background:
                    config.sortBy === col ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)',
                }"
              />
              {{ COLUMNS[col].label }}
            </div>
          </div>
          <div v-else class="text-xs text-center py-4" style="color: var(--color-ink-3)">
            No sortable columns available.
          </div>
          <ToggleSetting
            label="Sort ascending"
            :value="config.sortAscending"
            @update="config.sortAscending = $event"
          />
        </Section>
      </div>

      <!-- Shortcuts -->
      <div v-if="activeTab === 'shortcuts'">
        <Section
          title="Keyboard Shortcuts"
          description="Click a field then press your desired key combo."
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

      <!-- Discord RPC -->
      <Section title="Discord Rich Presence">
        <div class="flex flex-col gap-3">
          <ToggleSetting
            label="Enable Discord RPC"
            :value="config.discordRpcEnabled"
            @update="config.discordRpcEnabled = $event"
          />
          <p class="text-[11px] px-1" style="color: var(--color-ink-3); line-height: 1.5">
            Shows your status in Discord. Active when log is streaming, Idle after 15 seconds of
            inactivity.
          </p>
        </div>
      </Section>

      <!-- Advanced -->
      <div v-if="activeTab === 'advanced'">
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

        <Section title="Updates" class="mt-1">
          <ToggleSetting
            label="Auto-update on launch"
            :value="config.autoUpdateEnabled"
            @update="config.autoUpdateEnabled = $event"
          />
          <p class="text-[11px] px-1" style="color: var(--color-ink-3); line-height: 1.5">
            Automatically checks for updates from GitHub on launch. Downloads and installs on next
            exit.
          </p>
          <div class="flex items-center justify-between py-2">
            <span class="text-xs" style="color: var(--color-ink-2)">
              {{ updateStatusText }}
            </span>
            <button
              class="btn px-3 py-1.5 rounded-lg text-xs no-drag"
              style="border: 1px solid var(--color-border); color: var(--color-ink-2)"
              :disabled="updateStatus === 'checking' || updateStatus === 'downloading'"
              @click="checkUpdate"
            >
              Check now
            </button>
          </div>
          <div v-if="updateStatus === 'downloaded'" class="flex items-center justify-between py-2">
            <span class="text-xs" style="color: var(--color-good)">Ready to install</span>
            <button
              class="btn px-3 py-1.5 rounded-lg text-xs no-drag"
              style="border: 1px solid rgba(52, 211, 153, 0.3); color: var(--color-good)"
              @click="installUpdate"
            >
              Restart and install
            </button>
          </div>
        </Section>

        <Section title="Danger Zone" class="mt-1">
          <div class="flex items-center justify-between py-2">
            <span class="text-xs" style="color: var(--color-ink-2)">
              Reset all settings to defaults
            </span>
            <button
              class="btn px-3 py-1.5 rounded-lg text-xs no-drag"
              style="border: 1px solid rgba(248, 113, 113, 0.3); color: var(--color-bad)"
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
