<template>
  <div
    class="relative shrink-0 overflow-hidden"
    :style="{ width: size + 'px', height: size + 'px', borderRadius: Math.max(2, size * 0.15) + 'px' }"
  >
    <img
      v-if="avatarSrc && !errored"
      :src="avatarSrc"
      :alt="name"
      class="block w-full h-full"
      style="image-rendering: pixelated;"
      @error="handleError"
    />
    <div
      v-else-if="loading"
      class="w-full h-full animate-shimmer"
    />
    <div
      v-else
      class="w-full h-full flex items-center justify-center font-bold"
      :style="{ background: avatarColor, color: '#fff', fontSize: Math.max(7, size * 0.36) + 'px' }"
    >
      {{ initials }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{ name: string; size?: number }>(),
  { size: 20 }
)

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
const STEVE_URL = 'https://mc-heads.net/avatar/steve/32'

const avatarSrc = ref<string | null>(null)
const errored   = ref(false)
const loading   = ref(true)
const retried   = ref(false)

function cacheKey(username: string): string {
  return `mchead_${username.toLowerCase()}`
}

function getCached(username: string): string | null {
  try {
    const raw = localStorage.getItem(cacheKey(username))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { url: string; ts: number }
    if (Date.now() - parsed.ts > CACHE_TTL) {
      localStorage.removeItem(cacheKey(username))
      return null
    }
    return parsed.url
  } catch { return null }
}

function setCache(username: string, dataUrl: string): void {
  try {
    localStorage.setItem(cacheKey(username), JSON.stringify({ url: dataUrl, ts: Date.now() }))
  } catch { /* quota exceeded — silently skip */ }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function loadAvatar(username: string): Promise<void> {
  loading.value = true
  errored.value = false

  const cached = getCached(username)
  if (cached) {
    avatarSrc.value = cached
    loading.value = false
    return
  }

  const url = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/32`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const dataUrl = await blobToDataUrl(blob)
    setCache(username, dataUrl)
    avatarSrc.value = dataUrl
  } catch {
    avatarSrc.value = STEVE_URL
  } finally {
    loading.value = false
  }
}

function handleError(): void {
  if (!retried.value) {
    retried.value = true
    avatarSrc.value = STEVE_URL
  } else {
    errored.value = true
  }
}

watch(() => props.name, (n) => { retried.value = false; loadAvatar(n) })
onMounted(() => loadAvatar(props.name))

const initials    = computed(() => props.name.slice(0, 2).toUpperCase())
const avatarColor = computed(() => {
  let h = 0
  for (let i = 0; i < props.name.length; i++) h = props.name.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${((h % 360) + 360) % 360}, 48%, 36%)`
})
</script>
