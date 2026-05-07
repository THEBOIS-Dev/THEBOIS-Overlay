<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'radix-vue';
defineProps<{ label: string; description?: string; value: boolean }>();
defineEmits<{ update: [value: boolean] }>();
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-2.5">
    <div class="flex min-w-0 flex-col">
      <span
        class="font-medium"
        style="font-size: 0.82rem; color: var(--color-ink-2)"
      >
        {{ label }}
      </span>
      <span
        v-if="description"
        class="mt-0.5 leading-relaxed"
        style="font-size: 0.72rem; color: var(--color-ink-3)"
      >
        {{ description }}
      </span>
    </div>
    <SwitchRoot
      class="no-drag relative inline-flex shrink-0 cursor-pointer rounded-full focus:outline-none"
      style="width: 30px; height: 16px; transition: background 180ms ease"
      :checked="value"
      :style="{
        background: value ? 'var(--color-accent)' : 'rgba(255,255,255,0.09)',
        boxShadow: value ? '0 0 8px rgba(124,58,237,0.35)' : 'none',
      }"
      @update:checked="$emit('update', $event)"
    >
      <SwitchThumb
        class="block rounded-full bg-white"
        style="
          width: 12px;
          height: 12px;
          margin-top: 2px;
          margin-left: 2px;
          transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        "
        :style="{ transform: value ? 'translateX(14px)' : 'translateX(0)' }"
      />
    </SwitchRoot>
  </div>
</template>
