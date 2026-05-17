import { defineStore } from 'pinia';
import type {
  Player,
  BedwarsMode,
  Interval,
  PikaProfile,
  PikaBedwarsStats,
} from '@renderer/types';
import { useNicksStore } from './nicks';
import { useConfigStore } from './config';

export interface PlayersState {
  players: Player[];
  playersCount: number | null;
  logPathValid: boolean | null;
  setupVisible: boolean;
  proxyConnectedNetwork: string | null;
}

type FetchResult = {
  profile: PikaProfile | null;
  stats: PikaBedwarsStats | null;
  notFound?: boolean;
  rateLimit?: boolean;
  statsDisabled?: boolean;
};

function makeBlankPlayer(name: string, source: Player['source']): Player {
  return {
    name,
    realName: name,
    uuid: null,
    loading: true,
    error: null,
    nicked: false,
    profile: null,
    stats: null,
    source,
    team: null,
    teamColor: null,
  };
}

function networkApi() {
  const config = useConfigStore();
  return config.network === 'jartexnetwork' ? window.api.jartex : window.api.pika;
}

const CONCURRENCY = 4;
const MAX_FETCH_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 3500;
const NETWORK_RETRY_BASE_MS = 1000;

let _permits = CONCURRENCY;
const _waiters: Array<(ok: boolean) => void> = [];
let _epoch = 0;

function _acquireSlot(): Promise<boolean> {
  if (_permits > 0) {
    _permits--;
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => _waiters.push(resolve));
}

function _releaseSlot(): void {
  const next = _waiters.shift();
  if (next) {
    next(true);
  } else {
    _permits++;
  }
}

function _resetQueue(): void {
  _epoch++;
  let fn: ((ok: boolean) => void) | undefined;
  while ((fn = _waiters.shift())) fn(false);
  _permits = CONCURRENCY;
}

const _sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const _jitter = (): number => Math.random() * 600;

const pendingAdds = new Set<string>();

export const usePlayersStore = defineStore('players', {
  state: (): PlayersState => ({
    players: [],
    playersCount: null,
    logPathValid: null,
    setupVisible: true,
    proxyConnectedNetwork: null,
  }),

  getters: {
    missingCount(state): number {
      if (!state.playersCount) return 0;
      const autoCount = state.players.filter((p) => p.source === 'auto').length;
      return Math.max(0, state.playersCount - autoCount);
    },
  },

  actions: {
    async addByName(rawName: string, source: Player['source'] = 'manual'): Promise<void> {
      const config = useConfigStore();
      const nicks = useNicksStore();
      const api = networkApi();

      const stripped = rawName.split(' ').pop()!;
      const realName = nicks.resolve(stripped);
      const key = realName.toLowerCase();

      if (pendingAdds.has(key)) return;
      if (this.players.some((p) => p.realName.toLowerCase() === key)) return;

      pendingAdds.add(key);

      const player = makeBlankPlayer(stripped, source);
      player.realName = realName;
      player.nicked = key !== stripped.toLowerCase();
      this.players.push(player);

      const capturedEpoch = _epoch;
      const acquired = await _acquireSlot();

      if (!acquired || capturedEpoch !== _epoch) {
        pendingAdds.delete(key);
        const i = this.players.findIndex((p) => p.realName.toLowerCase() === key);
        if (i !== -1) this.players[i].loading = false;
        return;
      }

      try {
        let result: FetchResult | null = null;

        for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
          if (capturedEpoch !== _epoch) break;

          try {
            result = await api.fetch(
              realName,
              config.interval,
              config.mode,
              source !== 'manual',
            );
          } catch {
            if (attempt < MAX_FETCH_RETRIES) {
              await _sleep(NETWORK_RETRY_BASE_MS * Math.pow(2, attempt) + _jitter());
              continue;
            }
            result = null;
            break;
          }

          if (result.rateLimit && attempt < MAX_FETCH_RETRIES) {
            await _sleep(Math.min(RATE_LIMIT_BASE_MS * (attempt + 1), 12000) + _jitter());
            result = null;
            continue;
          }

          break;
        }

        if (capturedEpoch !== _epoch) return;

        const idx = this.players.findIndex((p) => p.realName.toLowerCase() === key);
        if (idx === -1) return;

        const p = this.players[idx];
        if (!result) {
          p.error = 'network';
        } else if (result.notFound) {
          p.nicked = true;
          if (!p.profile && !p.stats) p.error = 'not_found';
        } else if (result.rateLimit) {
          p.error = 'rate_limited';
        } else if (result.statsDisabled) {
          p.profile = result.profile;
          p.stats = null;
          p.error = 'stats_disabled';
          const apiName = result.profile?.username;
          if (apiName) {
            p.name = apiName;
            p.realName = apiName;
          }
        } else {
          p.profile = result.profile;
          p.stats = result.stats;
          const apiName = result.profile?.username;
          if (apiName) {
            p.name = apiName;
            p.realName = apiName;
          }
        }
      } finally {
        _releaseSlot();
        pendingAdds.delete(key);
        const idx = this.players.findIndex((p) => p.realName.toLowerCase() === key);
        if (idx !== -1) this.players[idx].loading = false;
      }
    },

    async refreshAllStats(interval: Interval, mode: BedwarsMode): Promise<void> {
      const api = networkApi();
      const loaded = this.players.filter((p) => !p.loading && p.error !== 'not_found');
      for (const p of loaded) {
        const idx = this.players.findIndex((x) => x.realName === p.realName);
        if (idx !== -1) this.players[idx].loading = true;
      }

      const capturedEpoch = _epoch;

      await Promise.allSettled(
        loaded.map(async (p) => {
          const acquired = await _acquireSlot();
          if (!acquired || capturedEpoch !== _epoch) {
            const idx = this.players.findIndex((x) => x.realName === p.realName);
            if (idx !== -1) this.players[idx].loading = false;
            return;
          }
          try {
            const fetchName = p.profile?.username ?? p.realName;
            let stats: PikaBedwarsStats | null = null;

            for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
              if (capturedEpoch !== _epoch) break;
              try {
                stats = await api.stats(fetchName, interval, mode);
                if (stats !== null) break;
                if (attempt < MAX_FETCH_RETRIES) {
                  await _sleep(NETWORK_RETRY_BASE_MS * (attempt + 1) + _jitter());
                }
              } catch {
                if (attempt < MAX_FETCH_RETRIES) {
                  await _sleep(NETWORK_RETRY_BASE_MS * Math.pow(2, attempt) + _jitter());
                }
              }
            }

            if (capturedEpoch !== _epoch) return;
            const idx = this.players.findIndex((x) => x.realName === p.realName);
            if (idx !== -1) {
              if (stats) this.players[idx].stats = stats;
              this.players[idx].loading = false;
            }
          } finally {
            _releaseSlot();
            const idx = this.players.findIndex((x) => x.realName === p.realName);
            if (idx !== -1) this.players[idx].loading = false;
          }
        }),
      );
    },

    removeByName(name: string): void {
      const lc = name.toLowerCase();
      const idx = this.players.findIndex(
        (p) => p.name.toLowerCase() === lc || p.realName.toLowerCase() === lc,
      );
      if (idx !== -1) this.players.splice(idx, 1);
    },

    clear(): void {
      _resetQueue();
      pendingAdds.clear();
      this.players = [];
      this.playersCount = null;
    },

    setCount(n: number | null): void {
      this.playersCount = n;
    },

    decrementCount(): void {
      if (this.playersCount && this.playersCount > 0) this.playersCount--;
    },

    incrementCount(): void {
      if (this.playersCount !== null) this.playersCount++;
    },

    applyTeams(
      teams: Array<{
        name: string;
        displayName: string;
        color: string;
        players: string[];
      }>,
    ): void {
      for (const p of this.players) {
        p.team = null;
        p.teamColor = null;
      }
      for (const team of teams) {
        for (const memberName of team.players) {
          const lc = memberName.toLowerCase();
          const idx = this.players.findIndex(
            (p) => p.name.toLowerCase() === lc || p.realName.toLowerCase() === lc,
          );
          if (idx !== -1) {
            this.players[idx].team = team.name;
            this.players[idx].teamColor = team.color;
          }
        }
      }
    },

    clearTeams(): void {
      for (const p of this.players) {
        p.team = null;
        p.teamColor = null;
      }
    },

    setProxyConnectedNetwork(network: string | null): void {
      this.proxyConnectedNetwork = network;
    },
  },
});
