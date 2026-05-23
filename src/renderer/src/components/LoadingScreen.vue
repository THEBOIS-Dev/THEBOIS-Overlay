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
  if (config.lowEndMode) {
    safetyTimer = setTimeout(finish, 1600);
    return;
  }

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
      background: 'var(--color-bg)',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease-in-out',
      pointerEvents: fading ? 'none' : 'all',
      borderRadius: config.roundedCorners ? '14px' : '0px',
    }"
  >
    <template v-if="config.lowEndMode">
      <div class="low-end-screen">
        <div class="le-content">
          <img
            src="/nick.svg"
            alt="logo"
            class="le-logo"
          />
          <div class="le-dots">
            <span
              class="le-dot"
              style="animation-delay: 0s"
            />
            <span
              class="le-dot"
              style="animation-delay: 0.18s"
            />
            <span
              class="le-dot"
              style="animation-delay: 0.36s"
            />
          </div>
        </div>
      </div>
    </template>

    <video
      v-else
      ref="videoRef"
      src="/loading.mp4"
      autoplay
      muted
      playsinline
      preload="auto"
      disablepictureinpicture
      class="block h-full w-full object-cover"
      style="will-change: transform"
    />
  </div>
</template>

<style scoped>
.low-end-screen {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.le-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  animation: le-appear 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.le-logo {
  width: 72px;
  height: 72px;
  opacity: 0.92;
}

.le-dots {
  display: flex;
  align-items: center;
  gap: 7px;
}

.le-dot {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--color-accent);
  opacity: 0.5;
  animation: le-bounce 0.9s ease-in-out infinite;
}

@keyframes le-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: translateY(-7px);
    opacity: 1;
  }
}

@keyframes le-appear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
