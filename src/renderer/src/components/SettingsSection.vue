<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center gap-2 mb-0.5">
      <span
        class="text-xs font-semibold uppercase tracking-widest"
        style="color: var(--color-ink-3)"
      >
        {{ title }}
      </span>
      <div class="flex-1 h-px" style="background: var(--color-border)" />
    </div>
    <p v-if="description" class="text-xs mb-1" style="color: var(--color-ink-3)">
      {{ description }}
    </p>
    <div class="card px-3 divide-subtle">
      <slot />
    </div>
  </div>
</template>
