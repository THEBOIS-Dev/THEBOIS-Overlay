<script setup lang="ts">
defineProps<{ label: string; description?: string; value: boolean }>()
defineEmits<{ update: [value: boolean] }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-2">
    <div class="flex flex-col min-w-0">
      <span class="text-xs font-medium" style="color: var(--color-ink-2)">{{ label }}</span>
      <span v-if="description" class="text-xs mt-0.5" style="color: var(--color-ink-3)">
        {{ description }}
      </span>
    </div>
    <button
      class="no-drag relative inline-flex shrink-0 rounded-full transition-all duration-200 focus:outline-none"
      style="width: 32px; height: 17px"
      :style="{ background: value ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)' }"
      :aria-checked="value"
      role="switch"
      @click="$emit('update', !value)"
    >
      <span
        class="absolute top-[2px] left-[2px] inline-block rounded-full bg-white shadow transition-transform duration-200"
        style="width: 13px; height: 13px"
        :style="{ transform: value ? 'translateX(15px)' : 'translateX(0)' }"
      />
    </button>
  </div>
</template>
