<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';

defineProps<{ label: string; value: string }>();
const emit = defineEmits<{ update: [v: string] }>();

const capturing = ref(false);

function onKey(e: KeyboardEvent): void {
  e.preventDefault();
  if (!capturing.value) return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  emit('update', parts.join('+'));
  capturing.value = false;
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-2.5">
    <span
      class="font-medium"
      style="font-size: 0.82rem; color: var(--color-ink-2)"
    >
      {{ label }}
    </span>
    <div class="no-drag flex shrink-0 items-center gap-1.5">
      <input
        :value="value || ''"
        readonly
        :placeholder="capturing ? 'Press keys…' : 'None'"
        class="input-field cursor-pointer font-mono select-none"
        :style="{
          fontSize: '0.72rem',
          width: '140px',
          color: capturing ? 'var(--color-accent-light)' : 'var(--color-ink-1)',
          borderColor: capturing ? 'rgba(124,58,237,0.55)' : undefined,
          boxShadow: capturing ? '0 0 0 2.5px rgba(124,58,237,0.16)' : undefined,
          background: capturing ? 'rgba(124,58,237,0.07)' : undefined,
        }"
        @click="capturing = true"
        @keydown.stop="onKey"
        @blur="capturing = false"
      />
      <button
        v-if="value"
        class="btn h-5 w-5 rounded"
        @click="emit('update', '')"
      >
        <X :size="10" />
      </button>
    </div>
  </div>
</template>
