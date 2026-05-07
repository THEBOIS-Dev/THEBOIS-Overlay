import { defineStore } from 'pinia';
import type { Player, BedwarsMode, Interval } from '@renderer/types';
import { useNicksStore } from './nicks';
import { useConfigStore } from './config';

export interface PlayersState {
  players: Player[];
  playersCount: number | null;
  logPathValid: boolean | null;
  setupVisible: boolean;
}

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
  };
}

function networkApi() {
  const config = useConfigStore();
  return config.network === 'jartexnetwork' ? window.api.jartex : window.api.pika;
}

const pendingAdds = new Set<string>();

export const usePlayersStore = defineStore('players', {
  state: (): PlayersState => ({
    players: [],
    playersCount: null,
    logPathValid: null,
    setupVisible: true,
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

      try {
        const result = await api.fetch(realName, config.interval, config.mode);

        const idx = this.players.findIndex((p) => p.realName.toLowerCase() === key);
        if (idx === -1) return;

        const p = this.players[idx];
        if (result.notFound) {
          p.nicked = true;
          if (!p.profile && !p.stats) p.error = 'not_found';
        } else if (result.rateLimit) {
          p.error = 'rate_limited';
        } else {
          p.profile = result.profile;
          p.stats = result.stats;

          const apiName = result.profile?.username;
          if (apiName) {
            p.name = apiName;
            p.realName = apiName;
          }
        }
      } catch {
        const idx = this.players.findIndex((p) => p.realName.toLowerCase() === key);
        if (idx !== -1) this.players[idx].error = 'network';
      } finally {
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
      await Promise.allSettled(
        loaded.map(async (p) => {
          const fetchName = p.profile?.username ?? p.realName;
          const stats = await api.stats(fetchName, interval, mode);
          const idx = this.players.findIndex((x) => x.realName === p.realName);
          if (idx !== -1 && stats) {
            this.players[idx].stats = stats;
            this.players[idx].loading = false;
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
  },
});
