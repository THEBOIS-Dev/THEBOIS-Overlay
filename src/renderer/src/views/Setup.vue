<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfigStore } from '@renderer/store/config'
import { usePlayersStore } from '@renderer/store/players'
import type { LogFilePreset } from '@renderer/types'
import ToggleSetting from '@renderer/components/ToggleSetting.vue'

const config = useConfigStore()
const players = usePlayersStore()

const validState = ref<boolean | null>(null)

const PRESETS: { label: string; value: LogFilePreset }[] = [
  { label: 'Standard', value: 'STANDARD' },
  { label: 'Lunar', value: 'LUNAR_CLIENT' },
  { label: 'TLauncher', value: 'TLAUNCHER' },
  { label: 'Silent', value: 'SILENT_CLIENT' },
  { label: 'Feather', value: 'FEATHER_CLIENT' },
  { label: 'SK', value: 'SK_CLIENT' },
  { label: 'CM', value: 'CM_CLIENT' },
  { label: 'Salwyrr', value: 'SALWYRR' },
  { label: 'Badlion', value: 'BADLION_CLIENT' },
  { label: 'PvPLounge', value: 'PVPLOUNGE' },
  { label: 'Custom', value: 'CUSTOM' },
]

async function checkPath(): Promise<void> {
  validState.value = null
  const ok = await window.api.log.checkPath(config.logFilePath)
  validState.value = ok
  players.logPathValid = ok
  if (ok) window.api.log.setPath(config.logFilePath)
  else window.api.log.setPath(null)
}

async function applyPreset(preset: LogFilePreset): Promise<void> {
  await config.setLogFilePathFromPreset(preset)
  await checkPath()
}

async function browse(): Promise<void> {
  const result = await window.api.log.openDialog()
  if (!result.canceled && result.filePaths[0]) {
    config.logFilePath = result.filePaths[0]
    config.logFilePathPreset = 'CUSTOM'
    await checkPath()
  }
}

onMounted(() => checkPath())
</script>

<template>
  <div class="flex flex-col h-full overflow-y-auto px-4 py-4 gap-4 animate-fade-in">
    <div>
      <h2 class="text-sm font-semibold" style="color: var(--color-ink-1)">Setup</h2>
      <p class="text-xs mt-0.5" style="color: var(--color-ink-3)">
        Point THEBOIS at your Minecraft log file to enable auto-detection.
      </p>
    </div>

    <div class="card p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium" style="color: var(--color-ink-1)">Log File</div>
          <div class="text-xs mt-0.5" style="color: var(--color-ink-3)">
            Minecraft writes chat here. THEBOIS reads it live.
          </div>
        </div>

        <div class="flex items-center gap-1.5 text-xs shrink-0">
          <template v-if="validState === true">
            <span
              class="w-2 h-2 rounded-full animate-pulse-dot"
              style="background: var(--color-good)"
            />
            <span style="color: var(--color-good)">Valid</span>
          </template>
          <template v-else-if="validState === false">
            <span class="w-2 h-2 rounded-full" style="background: var(--color-bad)" />
            <span style="color: var(--color-bad)">Not found</span>
          </template>
          <template v-else>
            <span class="w-2 h-2 rounded-full" style="background: var(--color-ink-3)" />
            <span style="color: var(--color-ink-3)">Checking…</span>
          </template>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium" style="color: var(--color-ink-2)">Client</label>
        <div class="grid grid-cols-3 gap-1.5 no-drag">
          <button
            v-for="preset in PRESETS"
            :key="preset.value"
            class="rounded-lg px-2 py-2 text-xs font-medium transition-all"
            :style="
              config.logFilePathPreset === preset.value
                ? 'background: var(--color-accent-dim); border: 1px solid rgba(124,58,237,0.4); color: var(--color-accent-light);'
                : 'background: rgba(255,255,255,0.04); border: 1px solid var(--color-border); color: var(--color-ink-2);'
            "
            @click="applyPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium" style="color: var(--color-ink-2)">Path</label>
        <div class="flex gap-2 no-drag">
          <input
            v-model="config.logFilePath"
            class="input-field flex-1"
            style="font-family: var(--font-mono); font-size: 0.72rem"
            placeholder="/path/to/logs/latest.log"
            @blur="checkPath"
          />
          <button
            class="btn px-3 py-1.5 rounded-lg text-xs shrink-0"
            style="border: 1px solid var(--color-border)"
            @click="browse"
          >
            Browse
          </button>
        </div>
        <p class="text-xs" style="color: var(--color-ink-3)">
          Tip: type
          <code
            class="px-1 rounded"
            style="background: rgba(255, 255, 255, 0.07); font-family: var(--font-mono)"
            >/who</code
          >
          in-game to instantly populate the overlay.
        </p>
      </div>
    </div>

    <div class="card p-4 flex flex-col gap-0">
      <div
        class="text-xs font-semibold uppercase tracking-widest mb-2"
        style="color: var(--color-ink-3)"
      >
        Auto-detection
      </div>
      <div class="divide-subtle">
        <ToggleSetting
          label="Auto-add on join"
          :value="config.autoAddPlayers"
          @update="config.autoAddPlayers = $event"
        />
        <ToggleSetting
          label="Auto-remove on quit"
          :value="config.autoRemoveOnQuit"
          @update="config.autoRemoveOnQuit = $event"
        />
        <ToggleSetting
          label="Remove on final kill"
          :value="config.autoRemoveFinalDeath"
          @update="config.autoRemoveFinalDeath = $event"
        />
        <ToggleSetting
          label="Clear on /who"
          :value="config.autoRemoveAllOnWho"
          @update="config.autoRemoveAllOnWho = $event"
        />
        <ToggleSetting
          label="Missing players warning"
          :value="config.missingPlayersWarning"
          @update="config.missingPlayersWarning = $event"
        />
      </div>
    </div>

    <div class="no-drag flex justify-end mt-auto pt-1">
      <router-link to="/" class="btn-accent rounded-lg px-5 py-2 text-xs font-medium">
        Done →
      </router-link>
    </div>
  </div>
</template>
