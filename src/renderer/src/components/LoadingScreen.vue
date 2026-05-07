<script setup lang="ts">
import { useConfigStore } from '@renderer/store/config';
import { onMounted, onUnmounted, ref } from 'vue';

const emit = defineEmits<{ done: [] }>();
const config = useConfigStore();

const fading = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);

let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function finish(): void {
  if (fading.value) return;
  fading.value = true;
  setTimeout(() => emit('done'), 350);
}

onMounted(() => {
  const video = videoRef.value;
  if (!video) {
    finish();
    return;
  }
  video.addEventListener('ended', finish, { once: true });
  video.addEventListener('error', finish, { once: true });
  safetyTimer = setTimeout(finish, 12_000);
});

onUnmounted(() => {
  if (safetyTimer) clearTimeout(safetyTimer);
  videoRef.value?.removeEventListener('ended', finish);
  videoRef.value?.removeEventListener('error', finish);
});
</script>

<template>
  <div
    class="fixed inset-0 z-10000 overflow-hidden"
    :style="{
      background: '#010208',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease-in-out',
      pointerEvents: fading ? 'none' : 'all',
      borderRadius: config.roundedCorners ? '14px' : '0px',
    }"
  >
    <video
      ref="videoRef"
      src="/loading.mp4"
      autoplay
      muted
      playsinline
      disablepictureinpicture
      class="block h-full w-full object-cover"
    />
  </div>
</template>
