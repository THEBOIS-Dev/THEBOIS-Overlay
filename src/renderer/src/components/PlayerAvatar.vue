<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const STEVE_URL = 'https://mc-heads.net/avatar/steve/32';

const avatarSrc = ref<string | null>(null);
const errored = ref(false);
const loading = ref(true);
const retried = ref(false);

function cacheKey(u: string): string {
  return `mchead_${u.toLowerCase()}`;
}

function getCached(u: string): string | null {
  try {
    const raw = localStorage.getItem(cacheKey(u));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; ts: number };
    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(cacheKey(u));
      return null;
    }
    return parsed.url;
  } catch {
    return null;
  }
}

function setCache(u: string, dataUrl: string): void {
  try {
    localStorage.setItem(cacheKey(u), JSON.stringify({ url: dataUrl, ts: Date.now() }));
  } catch {}
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadAvatar(username: string): Promise<void> {
  loading.value = true;
  errored.value = false;
  const cached = getCached(username);
  if (cached) {
    avatarSrc.value = cached;
    loading.value = false;
    return;
  }
  const url = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/32`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    setCache(username, dataUrl);
    avatarSrc.value = dataUrl;
  } catch {
    avatarSrc.value = STEVE_URL;
  } finally {
    loading.value = false;
  }
}

function handleError(): void {
  if (!retried.value) {
    retried.value = true;
    avatarSrc.value = STEVE_URL;
  } else {
    errored.value = true;
  }
}

watch(
  () => props.name,
  (n: string) => {
    retried.value = false;
    loadAvatar(n);
  },
);
onMounted(() => loadAvatar(props.name));

const initials = computed(() => props.name.slice(0, 2).toUpperCase());
const avatarColor = computed(() => {
  let h = 0;
  for (let i = 0; i < props.name.length; i++)
    h = props.name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${((h % 360) + 360) % 360}, 48%, 36%)`;
});
</script>

<template>
  <div
    class="relative shrink-0 overflow-hidden"
    :style="{
      width: size + 'px',
      height: size + 'px',
      borderRadius: Math.max(2, size * 0.15) + 'px',
    }"
  >
    <img
      v-if="avatarSrc && !errored"
      :src="avatarSrc"
      :alt="name"
      class="block h-full w-full"
      style="image-rendering: pixelated"
      @error="handleError"
    />
    <div
      v-else-if="loading"
      class="animate-shimmer h-full w-full"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center font-bold text-white"
      :style="{ background: avatarColor, fontSize: Math.max(7, size * 0.36) + 'px' }"
    >
      {{ initials }}
    </div>
  </div>
</template>
