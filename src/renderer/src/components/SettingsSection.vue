<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="settings-section flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div
        style="
          width: 2px;
          height: 12px;
          border-radius: 9999px;
          flex-shrink: 0;
          background: linear-gradient(
            to bottom,
            var(--color-accent-light),
            var(--color-accent)
          );
          opacity: 0.85;
        "
      />
      <span
        style="
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-ink-3);
          white-space: nowrap;
        "
        >{{ title }}</span
      >
      <div
        style="
          flex: 1;
          height: 1px;
          background: linear-gradient(
            to right,
            rgba(var(--color-accent-rgb), 0.18),
            transparent
          );
        "
      />
    </div>
    <p
      v-if="description"
      style="
        font-size: 0.72rem;
        color: var(--color-ink-3);
        line-height: 1.55;
        padding: 0 2px;
      "
    >
      {{ description }}
    </p>
    <div class="section-card divide-subtle px-3">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.section-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(var(--color-accent-rgb), 0.13);
  border-radius: 12px;
  transition: border-color 200ms ease;
}
.section-card:hover {
  border-color: rgba(var(--color-accent-rgb), 0.2);
}
</style>
