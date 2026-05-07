<script setup lang="ts">
import { useNicksStore } from '@renderer/store/nicks';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'radix-vue';
import { ref } from 'vue';

const nicks = useNicksStore();

const modalOpen = ref(false);
const editId = ref<string | null>(null);
const formNick = ref('');
const formReal = ref('');

function openAdd(): void {
  editId.value = null;
  formNick.value = '';
  formReal.value = '';
  modalOpen.value = true;
}

function openEdit(nick: { id: string; nick: string; realName: string }): void {
  editId.value = nick.id;
  formNick.value = nick.nick;
  formReal.value = nick.realName;
  modalOpen.value = true;
}

function save(): void {
  if (!formNick.value || !formReal.value) return;
  if (editId.value) nicks.update(editId.value, formNick.value, formReal.value);
  else nicks.add(formNick.value, formReal.value);
  modalOpen.value = false;
}
</script>

<template>
  <div class="animate-fade-in flex h-full flex-col overflow-hidden">
    <div
      class="flex shrink-0 items-center justify-between border-b px-3.5 py-2.5"
      style="border-color: var(--color-border); background: rgba(255, 255, 255, 0.015)"
    >
      <div>
        <h2
          class="font-semibold"
          style="font-size: 0.9rem; color: var(--color-ink-1)"
        >
          Nick Manager
        </h2>
        <p
          class="mt-0.5"
          style="font-size: 0.75rem; color: var(--color-ink-3)"
        >
          Map in-game nicks to real usernames.
        </p>
      </div>
      <button
        class="btn-accent no-drag flex items-center gap-1.5 rounded-md"
        style="font-size: 0.76rem; padding: 0.3rem 0.8rem"
        @click="openAdd"
      >
        <Plus :size="11" />
        Add Nick
      </button>
    </div>

    <div class="themed-scroll flex-1 overflow-y-auto">
      <div
        v-if="nicks.nicks.length === 0"
        class="flex h-full flex-col items-center justify-center gap-2.5"
        style="opacity: 0.35"
      >
        <div
          class="flex h-10 w-10 items-center justify-center rounded-full"
          style="
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--color-border);
          "
        >
          <Tag
            :size="18"
            style="color: var(--color-ink-3)"
          />
        </div>
        <p style="font-size: 0.78rem; color: var(--color-ink-3)">No nicks configured.</p>
      </div>

      <table
        v-else
        class="w-full"
      >
        <thead
          class="sticky top-0 z-10"
          style="background: rgba(4, 6, 15, 0.97)"
        >
          <tr
            class="border-b"
            style="border-color: var(--color-border)"
          >
            <th
              class="px-3.5 py-2 text-left font-semibold tracking-widest uppercase"
              style="
                font-size: 0.63rem;
                color: var(--color-ink-3);
                letter-spacing: 0.09em;
              "
            >
              Nick
            </th>
            <th
              class="px-3.5 py-2 text-left font-semibold tracking-widest uppercase"
              style="
                font-size: 0.63rem;
                color: var(--color-ink-3);
                letter-spacing: 0.09em;
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
            style="border-color: rgba(120, 80, 255, 0.07)"
          >
            <td
              class="px-3.5 py-2.5 font-mono font-medium"
              style="font-size: 0.78rem; color: var(--color-nick)"
            >
              {{ nick.nick }}
            </td>
            <td
              class="px-3.5 py-2.5 font-medium"
              style="font-size: 0.82rem; color: var(--color-ink-1)"
            >
              {{ nick.realName }}
            </td>
            <td class="px-2.5 py-2.5">
              <div
                class="no-drag flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <button
                  class="btn h-6 w-6 rounded"
                  @click="openEdit(nick)"
                >
                  <Pencil :size="10" />
                </button>
                <button
                  class="btn hover:text-bad h-6 w-6 rounded"
                  style="color: var(--color-ink-3)"
                  @click="nicks.remove(nick.id)"
                >
                  <Trash2 :size="10" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DialogRoot
      :open="modalOpen"
      @update:open="modalOpen = $event"
    >
      <DialogPortal>
        <DialogOverlay
          class="fixed inset-0 z-50"
          style="background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px)"
        />
        <DialogContent
          class="animate-slide-up fixed top-1/2 left-1/2 z-50 flex w-72 -translate-x-1/2 -translate-y-1/2 flex-col gap-4 shadow-2xl focus:outline-none"
          style="
            background: rgba(9, 6, 22, 0.99);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-xl);
            padding: 1.25rem;
            box-shadow:
              0 24px 64px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(124, 58, 237, 0.1);
          "
        >
          <h3
            class="font-semibold"
            style="font-size: 0.9rem; color: var(--color-ink-1)"
          >
            {{ editId ? 'Edit Nick' : 'Add Nick' }}
          </h3>

          <div class="no-drag flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label style="font-size: 0.76rem; color: var(--color-ink-3)"
                >In-game Nick</label
              >
              <input
                v-model.trim="formNick"
                class="input-field"
                placeholder="Nicked username"
                @keydown.enter="save"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label style="font-size: 0.76rem; color: var(--color-ink-3)"
                >Real Username</label
              >
              <input
                v-model.trim="formReal"
                class="input-field"
                placeholder="Actual username"
                @keydown.enter="save"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button
              class="btn rounded-md"
              style="
                padding: 0.35rem 0.9rem;
                font-size: 0.78rem;
                border: 1px solid var(--color-border);
                color: var(--color-ink-2);
              "
              @click="modalOpen = false"
            >
              Cancel
            </button>
            <button
              class="btn-accent rounded-md"
              style="padding: 0.35rem 0.9rem; font-size: 0.78rem"
              :disabled="!formNick || !formReal"
              @click="save"
            >
              Save
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
