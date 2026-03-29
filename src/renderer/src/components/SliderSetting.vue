<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
}>()
defineEmits<{ update: [v: number] }>()

// Local value tracks drag position — shown in the label but NOT emitted until release (@change)
const localValue = ref(props.value)

// Sync if parent value changes from outside (e.g. reset)
watch(
  () => props.value,
  (v) => {
    localValue.value = v
  },
)
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-2">
    <span class="text-xs font-medium" style="color: var(--color-ink-2)">{{ label }}</span>
    <div class="flex items-center gap-2 shrink-0 no-drag">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="localValue"
        class="w-20 cursor-pointer"
        style="accent-color: var(--color-accent)"
        @input="localValue = parseFloat(($event.target as HTMLInputElement).value)"
        @change="$emit('update', localValue)"
      />
      <span
        class="w-9 text-right text-xs tabular-nums"
        style="color: var(--color-ink-1); font-family: var(--font-mono)"
      >
        {{ format ? format(localValue) : localValue }}
      </span>
    </div>
  </div>
</template>
