<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ label: string; value: string }>()
const emit = defineEmits<{ update: [v: string] }>()

const capturing = ref(false)
function startCapture() {
  capturing.value = true
}
function stopCapture() {
  capturing.value = false
}

function onKey(e: KeyboardEvent): void {
  e.preventDefault()
  if (!capturing.value) return
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  emit('update', parts.join('+'))
  stopCapture()
}
</script>

<template>
  <div class="flex items-center justify-between py-2 gap-4">
    <span class="text-xs font-medium" style="color: var(--color-ink-2)">{{ label }}</span>
    <div class="flex items-center gap-1.5 no-drag shrink-0">
      <input
        :value="value || ''"
        readonly
        :placeholder="capturing ? 'Press keys…' : 'None'"
        class="input-field text-xs w-36 cursor-pointer select-none"
        style="font-family: var(--font-mono); font-size: 0.72rem"
        :style="
          capturing
            ? 'border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent-glow);'
            : ''
        "
        @click="startCapture"
        @keydown.stop="onKey"
        @blur="stopCapture"
      />
      <button v-if="value" class="btn w-5 h-5 rounded" @click="$emit('update', '')">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor">
          <path
            d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>
