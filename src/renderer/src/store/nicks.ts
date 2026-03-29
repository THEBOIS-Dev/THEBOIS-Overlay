import { defineStore } from 'pinia'
import type { Nick } from '@renderer/types'
import { nanoid } from '@renderer/composables/nanoid'

export const useNicksStore = defineStore('nicks', {
  state: () => ({ nicks: [] as Nick[] }),

  actions: {
    resolve(name: string): string {
      const lc = name.toLowerCase()
      return this.nicks.find((n) => n.nick.toLowerCase() === lc)?.realName ?? name
    },
    add(nick: string, realName: string): void {
      if (this.nicks.some((n) => n.nick.toLowerCase() === nick.toLowerCase())) return
      this.nicks.push({ id: nanoid(), nick, realName })
    },
    remove(id: string): void {
      const idx = this.nicks.findIndex((n) => n.id === id)
      if (idx !== -1) this.nicks.splice(idx, 1)
    },
    update(id: string, nick: string, realName: string): void {
      const n = this.nicks.find((x) => x.id === id)
      if (n) { n.nick = nick; n.realName = realName }
    },
  },

  persist: true,
})
