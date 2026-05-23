<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { FolderOpen, CheckCircle2, XCircle, Loader } from 'lucide-vue-next';
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import type { LogFilePreset } from '@renderer/types';

const config = useConfigStore();
const players = usePlayersStore();

const validState = ref<boolean | null>(null);

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
];

async function checkPath(): Promise<void> {
  validState.value = null;
  const ok = await window.api.log.checkPath(config.logFilePath);
  validState.value = ok;
  players.logPathValid = ok;
  if (ok) window.api.log.setPath(config.logFilePath);
  else window.api.log.setPath(null);
}

async function applyPreset(preset: LogFilePreset): Promise<void> {
  await config.setLogFilePathFromPreset(preset);
  await checkPath();
}

async function browse(): Promise<void> {
  const result = await window.api.log.openDialog();
  if (!result.canceled && result.filePaths[0]) {
    config.logFilePath = result.filePaths[0];
    config.logFilePathPreset = 'CUSTOM';
    await checkPath();
  }
}

onMounted(() => checkPath());
</script>

<template>
  <div
    class="animate-fade-in themed-scroll flex h-full flex-col gap-3.5 overflow-y-auto px-3.5 py-3.5"
  >
    <div>
      <h2
        class="font-semibold"
        style="font-size: 0.92rem; color: var(--color-ink-1)"
      >
        Setup
      </h2>
      <p
        class="mt-0.5"
        style="font-size: 0.78rem; color: var(--color-ink-3)"
      >
        Point the overlay at your Minecraft log file to enable auto-detection.
      </p>
    </div>

    <div class="card flex flex-col gap-3 p-3.5">
      <div class="flex items-center justify-between">
        <div
          class="font-semibold"
          style="font-size: 0.85rem; color: var(--color-ink-1)"
        >
          Log File
        </div>
        <div
          class="flex shrink-0 items-center gap-1.5"
          style="font-size: 0.78rem"
        >
          <template v-if="validState === true">
            <CheckCircle2
              :size="13"
              style="color: var(--color-good)"
            />
            <span style="color: var(--color-good); font-weight: 500">Valid</span>
          </template>
          <template v-else-if="validState === false">
            <XCircle
              :size="13"
              style="color: var(--color-bad)"
            />
            <span style="color: var(--color-bad); font-weight: 500">Not found</span>
          </template>
          <template v-else>
            <Loader
              :size="13"
              class="animate-spin"
              style="color: var(--color-ink-3)"
            />
            <span style="color: var(--color-ink-3)">Checking…</span>
          </template>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label
          class="font-medium"
          style="
            font-size: 0.75rem;
            color: var(--color-ink-3);
            letter-spacing: 0.05em;
            text-transform: uppercase;
          "
        >
          Client
        </label>
        <div class="no-drag grid grid-cols-3 gap-1.5">
          <button
            v-for="preset in PRESETS"
            :key="preset.value"
            class="rounded-md px-2 py-1.5 font-medium transition-all"
            style="font-size: 0.76rem"
            :style="
              config.logFilePathPreset === preset.value
                ? 'background:var(--color-accent-dim);border:1px solid rgba(var(--color-accent-rgb),0.38);color:var(--color-accent-light)'
                : 'background:rgba(255,255,255,0.03);border:1px solid var(--color-border);color:var(--color-ink-3)'
            "
            @click="applyPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label
          class="font-medium"
          style="
            font-size: 0.75rem;
            color: var(--color-ink-3);
            letter-spacing: 0.05em;
            text-transform: uppercase;
          "
        >
          Path
        </label>
        <div class="no-drag flex gap-2">
          <input
            v-model="config.logFilePath"
            class="input-field flex-1 font-mono"
            style="font-size: 0.72rem"
            placeholder="/path/to/logs/latest.log"
            @blur="checkPath"
          />
          <button
            class="btn flex shrink-0 items-center gap-1.5 rounded-md border"
            style="
              padding: 0 0.7rem;
              font-size: 0.76rem;
              height: 32px;
              border-color: var(--color-border);
              color: var(--color-ink-2);
            "
            @click="browse"
          >
            <FolderOpen :size="12" />
            Browse
          </button>
        </div>
      </div>
    </div>

    <div class="no-drag mt-auto flex justify-end pt-1">
      <router-link
        to="/"
        class="btn-accent rounded-lg px-4 py-1.5 font-medium"
        style="font-size: 0.82rem"
      >
        Done
      </router-link>
    </div>
  </div>
</template>
