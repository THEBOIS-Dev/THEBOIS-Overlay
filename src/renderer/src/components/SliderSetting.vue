<script setup lang="ts">
import { ref, watch } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';

const props = defineProps<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}>();
const emit = defineEmits<{ update: [v: number] }>();

const localValue = ref([props.value]);
watch(
  () => props.value,
  (v) => {
    localValue.value = [v];
  },
);
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-2.5">
    <span
      class="font-medium"
      style="font-size: 0.82rem; color: var(--color-ink-2)"
    >
      {{ label }}
    </span>
    <div class="no-drag flex shrink-0 items-center gap-3">
      <SliderRoot
        v-model="localValue"
        :min="min"
        :max="max"
        :step="step"
        class="relative flex h-4 touch-none items-center select-none"
        style="width: 88px"
        @update:model-value="(v) => v?.length && emit('update', v[0])"
      >
        <SliderTrack
          class="relative grow rounded-full"
          style="height: 2px; background: rgba(255, 255, 255, 0.08)"
        >
          <SliderRange
            class="absolute h-full rounded-full"
            style="background: var(--color-accent)"
          />
        </SliderTrack>
        <SliderThumb
          class="block cursor-pointer rounded-full bg-white focus:outline-none"
          style="
            width: 11px;
            height: 11px;
            border: 1.5px solid rgba(124, 58, 237, 0.7);
            box-shadow:
              0 0 6px rgba(124, 58, 237, 0.45),
              0 1px 3px rgba(0, 0, 0, 0.4);
            transition: transform 120ms ease;
          "
        />
      </SliderRoot>
      <span
        class="text-right font-mono tabular-nums"
        style="width: 36px; font-size: 0.75rem; color: var(--color-ink-1)"
      >
        {{ format ? format(localValue[0]) : localValue[0] }}
      </span>
    </div>
  </div>
</template>
