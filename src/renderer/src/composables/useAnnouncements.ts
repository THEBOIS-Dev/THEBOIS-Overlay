import { computed, ref } from 'vue';

const BASE_URL = 'https://overlay.kyizl.is-a.dev';
const FETCH_TIMEOUT_MS = 5_000;

const CHANGELOGS_SEEN_KEY = 'announcement:changelogs:seen';
const ALERTS_SEEN_KEY = 'announcement:alerts:seen';

export interface ChangelogPayload {
  id: string;
  version: string;
  date: string;
  content: string;
}

export interface AlertPayload {
  id: string;
  type: 'info' | 'warning' | 'update' | 'maintenance';
  title: string;
  content: string;
}

export type AnnouncementQueueItem =
  | { mode: 'changelog'; payload: ChangelogPayload }
  | { mode: 'alert'; payload: AlertPayload };

const queue = ref<AnnouncementQueueItem[]>([]);
const activeAnnouncement = computed<AnnouncementQueueItem | null>(
  () => queue.value[0] ?? null,
);

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

function getSeenIds(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markSeen(key: string, id: string): void {
  try {
    const seen = getSeenIds(key);
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(key, JSON.stringify(seen));
    }
  } catch {
    // localStorage unavailable
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

async function loadChangelog(): Promise<ChangelogPayload | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/changelog`);
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;

    const d = data as Record<string, unknown>;
    if (!isString(d.id) || !isString(d.version) || !isString(d.content)) return null;

    const payload = d as unknown as ChangelogPayload;
    return getSeenIds(CHANGELOGS_SEEN_KEY).includes(payload.id) ? null : payload;
  } catch {
    return null;
  }
}

async function loadAlert(): Promise<AlertPayload | null> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/alert`);
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;

    const d = data as Record<string, unknown>;
    if (
      !isString(d.id) ||
      !isString(d.title) ||
      !isString(d.content) ||
      !isString(d.type)
    )
      return null;

    const payload = d as unknown as AlertPayload;
    return getSeenIds(ALERTS_SEEN_KEY).includes(payload.id) ? null : payload;
  } catch {
    return null;
  }
}

async function fetchAnnouncements(): Promise<void> {
  const [changelog, alert] = await Promise.all([loadChangelog(), loadAlert()]);

  const entries: AnnouncementQueueItem[] = [];
  if (changelog) entries.push({ mode: 'changelog', payload: changelog });
  if (alert) entries.push({ mode: 'alert', payload: alert });

  queue.value = entries;
}

function dismissActive(): void {
  const item = queue.value[0];
  if (!item) return;

  if (item.mode === 'changelog') {
    markSeen(CHANGELOGS_SEEN_KEY, item.payload.id);
  } else {
    markSeen(ALERTS_SEEN_KEY, item.payload.id);
  }

  queue.value = queue.value.slice(1);
}

export function useAnnouncements() {
  return {
    activeAnnouncement,
    fetchAnnouncements,
    dismissActive,
  };
}
