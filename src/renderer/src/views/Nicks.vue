<script setup lang="ts">
import { ref } from 'vue'
import { useNicksStore } from '@renderer/store/nicks'

const nicks = useNicksStore()

const modalOpen = ref(false)
const editId = ref<string | null>(null)
const formNick = ref('')
const formReal = ref('')

function openAdd(): void {
  editId.value = null
  formNick.value = ''
  formReal.value = ''
  modalOpen.value = true
}

function openEdit(nick: { id: string; nick: string; realName: string }): void {
  editId.value = nick.id
  formNick.value = nick.nick
  formReal.value = nick.realName
  modalOpen.value = true
}

function closeModal(): void {
  modalOpen.value = false
}

function save(): void {
  if (!formNick.value || !formReal.value) return
  if (editId.value) nicks.update(editId.value, formNick.value, formReal.value)
  else nicks.add(formNick.value, formReal.value)
  closeModal()
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden animate-fade-in">
    <div
      class="flex items-center justify-between px-4 py-3 shrink-0 border-b"
      style="border-color: var(--color-border)"
    >
      <div>
        <h2 class="text-sm font-semibold" style="color: var(--color-ink-1)">Nick Manager</h2>
        <p class="text-xs mt-0.5" style="color: var(--color-ink-3)">
          Map in-game nicks to real usernames.
        </p>
      </div>
      <button class="btn-accent rounded-lg text-xs px-3 py-1.5 no-drag" @click="openAdd">
        + Add
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-if="nicks.nicks.length === 0"
        class="flex flex-col items-center justify-center h-full gap-2"
        style="opacity: 0.35"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="currentColor"
          style="color: var(--color-ink-3)"
        >
          <path
            d="M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
          />
        </svg>
        <p class="text-xs" style="color: var(--color-ink-3)">No nicks configured.</p>
      </div>

      <table v-else class="w-full text-xs">
        <thead>
          <tr style="border-bottom: 1px solid var(--color-border)">
            <th
              class="text-left px-4 py-2 font-medium"
              style="
                color: var(--color-ink-3);
                text-transform: uppercase;
                font-size: 0.65rem;
                letter-spacing: 0.08em;
              "
            >
              Nick
            </th>
            <th
              class="text-left px-4 py-2 font-medium"
              style="
                color: var(--color-ink-3);
                text-transform: uppercase;
                font-size: 0.65rem;
                letter-spacing: 0.08em;
              "
            >
              Real Name
            </th>
            <th class="w-16 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="nick in nicks.nicks"
            :key="nick.id"
            class="group glass-row border-b"
            style="border-color: var(--color-border)"
          >
            <td
              class="px-4 py-2.5"
              style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-nick)"
            >
              {{ nick.nick }}
            </td>
            <td class="px-4 py-2.5" style="color: var(--color-ink-1)">{{ nick.realName }}</td>
            <td class="px-3 py-2.5">
              <div
                class="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity no-drag"
              >
                <button class="btn w-6 h-6 rounded" @click="openEdit(nick)">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                </button>
                <button
                  class="btn w-6 h-6 rounded"
                  style="color: var(--color-ink-3)"
                  onmouseover="this.style.background='rgba(248,113,113,0.15)';this.style.color='var(--color-bad)'"
                  onmouseout="this.style.background='';this.style.color='var(--color-ink-3)'"
                  @click="nicks.remove(nick.id)"
                >
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
                    <path
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="modalOpen"
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px)"
          @mousedown.self="closeModal"
        >
          <div
            class="w-72 p-5 flex flex-col gap-4 shadow-2xl animate-slide-up"
            style="
              background: rgba(10, 12, 26, 0.99);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-xl);
            "
          >
            <h3 class="text-sm font-semibold" style="color: var(--color-ink-1)">
              {{ editId ? 'Edit Nick' : 'Add Nick' }}
            </h3>

            <div class="flex flex-col gap-3 no-drag">
              <div class="flex flex-col gap-1">
                <label class="text-xs" style="color: var(--color-ink-2)">In-game Nick</label>
                <input
                  v-model.trim="formNick"
                  class="input-field"
                  placeholder="Nicked Username"
                  @keydown.enter="save"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs" style="color: var(--color-ink-2)">Real Username</label>
                <input
                  v-model.trim="formReal"
                  class="input-field"
                  placeholder="Actual Username"
                  @keydown.enter="save"
                />
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <button
                class="btn px-4 py-1.5 rounded-lg text-xs"
                style="border: 1px solid var(--color-border)"
                @click="closeModal"
              >
                Cancel
              </button>
              <button
                class="btn-accent rounded-lg px-4 py-1.5 text-xs"
                :disabled="!formNick || !formReal"
                @click="save"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
