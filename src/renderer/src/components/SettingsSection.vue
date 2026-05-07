<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2.5">
      <div
        class="h-3 w-0.5 rounded-full"
        style="background: var(--color-accent); opacity: 0.7"
      />
      <span
        class="font-semibold tracking-widest uppercase"
        style="font-size: 0.65rem; color: var(--color-ink-3); letter-spacing: 0.1em"
      >
        {{ title }}
      </span>
      <div
        class="h-px flex-1"
        style="background: linear-gradient(90deg, var(--color-border), transparent)"
      />
    </div>
    <p
      v-if="description"
      class="px-0.5 text-xs leading-relaxed"
      style="color: var(--color-ink-3)"
    >
      {{ description }}
    </p>
    <div class="card divide-subtle px-3">
      <slot />
    </div>
  </div>
</template>
