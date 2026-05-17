<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'radix-vue';
defineProps<{ label: string; description?: string; value: boolean }>();
defineEmits<{ update: [value: boolean] }>();
</script>

<template>
  <div class="toggle-row flex items-center justify-between gap-4 py-2.5">
    <div class="flex min-w-0 flex-col">
      <span class="toggle-label font-medium">{{ label }}</span>
      <span
        v-if="description"
        class="toggle-desc mt-0.5 leading-relaxed"
        >{{ description }}</span
      >
    </div>
    <SwitchRoot
      class="no-drag relative inline-flex shrink-0 cursor-pointer items-center rounded-full focus:outline-none"
      :checked="value"
      style="
        width: 30px;
        height: 17px;
        flex-shrink: 0;
        transition:
          background 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      "
      :style="{
        background: value ? 'var(--color-accent)' : 'rgba(140, 100, 255, 0.14)',
        border: value
          ? '1px solid rgba(140, 80, 255, 0.5)'
          : '1px solid rgba(140, 100, 255, 0.25)',
        boxShadow: value
          ? '0 0 10px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.15)'
          : 'inset 0 1px 2px rgba(0,0,0,0.25)',
      }"
      @update:checked="$emit('update', $event)"
    >
      <SwitchThumb
        class="block rounded-full"
        style="
          width: 11px;
          height: 11px;
          background: white;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
          margin-left: 2px;
          transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
          will-change: transform;
        "
        :style="{ transform: value ? 'translateX(13px)' : 'translateX(0px)' }"
      />
    </SwitchRoot>
  </div>
</template>

<style scoped>
.toggle-label {
  font-size: 0.82rem;
  color: var(--color-ink-2);
  transition: color 150ms ease;
}

.toggle-row:hover .toggle-label {
  color: var(--color-ink-1);
}

.toggle-desc {
  font-size: 0.72rem;
  color: var(--color-ink-3);
  line-height: 1.45;
}
</style>
