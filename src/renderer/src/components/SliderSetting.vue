<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';

const props = defineProps<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}>();

const emit = defineEmits<{
  update: [v: number];
}>();

const localValue = ref([props.value]);

watch(
  () => props.value,
  (v) => {
    localValue.value = [v];
  },
);

const displayValue = computed(() =>
  props.format ? props.format(localValue.value[0]) : localValue.value[0],
);
</script>

<template>
  <div class="slider-row">
    <div class="slider-label-wrap">
      <span class="slider-label">
        {{ label }}
      </span>
    </div>

    <div class="slider-control no-drag">
      <SliderRoot
        v-model="localValue"
        :min="min"
        :max="max"
        :step="step"
        class="slider-root"
        @update:model-value="(v) => v?.length && emit('update', v[0])"
      >
        <SliderTrack class="slider-track">
          <div class="slider-track-glow" />

          <SliderRange class="slider-range" />
        </SliderTrack>

        <SliderThumb class="slider-thumb">
          <div class="slider-thumb-core" />
        </SliderThumb>
      </SliderRoot>

      <div class="slider-value-wrap">
        <span class="slider-value">
          {{ displayValue }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 16px;

  padding: 10px 0;

  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.slider-row:hover {
  transform: translateY(-0.5px);
}

.slider-label-wrap {
  min-width: 0;

  flex: 1;
}

.slider-label {
  font-size: 0.8rem;
  font-weight: 600;

  color: rgba(255, 255, 255, 0.72);

  letter-spacing: 0.01em;

  transition:
    color 140ms ease,
    opacity 140ms ease;
}

.slider-row:hover .slider-label {
  color: rgba(255, 255, 255, 0.9);
}

.slider-control {
  display: flex;
  align-items: center;

  gap: 12px;

  flex-shrink: 0;
}

.slider-root {
  position: relative;

  display: flex;
  align-items: center;

  width: 94px;
  height: 18px;

  touch-action: none;
  user-select: none;
}

.slider-track {
  position: relative;

  flex-grow: 1;

  height: 4px;

  border-radius: 999px;

  overflow: hidden;

  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.06),
    rgba(255, 255, 255, 0.03)
  );

  border: 1px solid rgba(255, 255, 255, 0.04);

  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(255, 255, 255, 0.01);

  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.slider-track-glow {
  position: absolute;
  inset: 0;

  background: linear-gradient(
    90deg,
    rgba(var(--color-accent-rgb), 0.06),
    transparent 55%
  );

  pointer-events: none;
}

.slider-range {
  position: absolute;

  height: 100%;

  border-radius: 999px;

  background: linear-gradient(
    90deg,
    var(--color-accent) 0%,
    var(--color-accent-light) 100%
  );

  box-shadow:
    0 0 10px rgba(var(--color-accent-rgb), 0.34),
    0 0 18px rgba(var(--color-accent-rgb), 0.12);

  transition:
    background 140ms ease,
    box-shadow 140ms ease;
}

.slider-thumb {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 14px;
  height: 14px;

  border-radius: 999px;

  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.98),
    rgba(225, 225, 235, 0.96)
  );

  border: 1px solid rgba(var(--color-accent-rgb), 0.4);

  box-shadow:
    0 0 0 4px rgba(var(--color-accent-rgb), 0.08),
    0 2px 10px rgba(0, 0, 0, 0.45),
    0 0 14px rgba(var(--color-accent-rgb), 0.22);

  cursor: grab;

  transition:
    transform 140ms ease,
    box-shadow 140ms ease,
    border-color 140ms ease;

  outline: none;
}

.slider-thumb:hover {
  transform: scale(1.06);

  border-color: rgba(var(--color-accent-rgb), 0.65);

  box-shadow:
    0 0 0 5px rgba(var(--color-accent-rgb), 0.12),
    0 2px 12px rgba(0, 0, 0, 0.48),
    0 0 18px rgba(var(--color-accent-rgb), 0.32);
}

.slider-thumb[data-state='active'] {
  cursor: grabbing;

  transform: scale(1.12);

  border-color: rgba(var(--color-accent-rgb), 0.82);

  box-shadow:
    0 0 0 6px rgba(var(--color-accent-rgb), 0.16),
    0 4px 16px rgba(0, 0, 0, 0.5),
    0 0 22px rgba(var(--color-accent-rgb), 0.42);
}

.slider-thumb:focus-visible {
  box-shadow:
    0 0 0 6px rgba(var(--color-accent-rgb), 0.18),
    0 4px 16px rgba(0, 0, 0, 0.5),
    0 0 24px rgba(var(--color-accent-rgb), 0.48);
}

.slider-thumb-core {
  width: 4px;
  height: 4px;

  border-radius: 999px;

  background: linear-gradient(180deg, var(--color-accent), var(--color-accent-light));

  box-shadow: 0 0 6px rgba(var(--color-accent-rgb), 0.4);
}

.slider-value-wrap {
  display: flex;
  align-items: center;
  justify-content: center;

  min-width: 42px;

  padding: 4px 8px;

  border-radius: 8px;

  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.045),
    rgba(255, 255, 255, 0.02)
  );

  border: 1px solid rgba(255, 255, 255, 0.05);

  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);

  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.slider-value {
  font-family: var(--font-mono);

  font-size: 0.73rem;
  font-weight: 600;

  line-height: 1;

  color: rgba(255, 255, 255, 0.88);

  font-variant-numeric: tabular-nums;
}
</style>
