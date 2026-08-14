<script setup lang="ts">
import type {
  MatchMode,
  QueueMetric,
  QueueRule,
  ValueComparator,
} from '@renderer/types/queue-safety';
import Select from '@renderer/components/queue/Select.vue';
import Section from '@renderer/components/SettingsSection.vue';
import { Button } from '@renderer/components/ui/button';
import { Switch } from '@renderer/components/ui/switch';
import { useConfigStore } from '@renderer/store/config';
import { usePlayersStore } from '@renderer/store/players';
import {
  comparators,
  createRule,
  evaluateQueueSafety,
  isBooleanMetric,
  isUsernameMetric,
  QueueMetricOptions,
} from '@renderer/types/queue-safety';
import { Check, Plus, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';

const config = useConfigStore();
const players = usePlayersStore();
const queueSafety = computed(() => config.queueSafety);
const verdict = computed(() => evaluateQueueSafety(queueSafety.value, players.players));
const pendingRuleIds = ref<Set<string>>(new Set());

const matchModes: { value: MatchMode; label: string; description: string }[] = [
  {
    value: 'any',
    label: 'Any',
    description: 'Flag the lobby as soon as one condition matches.',
  },
  {
    value: 'all',
    label: 'All',
    description: 'Flag the lobby only once every condition matches together.',
  },
];

function addRule(): void {
  const rule = createRule();
  queueSafety.value.rules.push(rule);
  pendingRuleIds.value = new Set(pendingRuleIds.value).add(rule.id);
}

function confirmRule(ruleId: string): void {
  if (!pendingRuleIds.value.has(ruleId)) return;
  const next = new Set(pendingRuleIds.value);
  next.delete(ruleId);
  pendingRuleIds.value = next;
}

function removeRule(ruleId: string): void {
  queueSafety.value.rules = queueSafety.value.rules.filter((rule) => rule.id !== ruleId);
  if (pendingRuleIds.value.has(ruleId)) {
    const next = new Set(pendingRuleIds.value);
    next.delete(ruleId);
    pendingRuleIds.value = next;
  }
}

function onMetricChange(rule: QueueRule, metric: QueueMetric): void {
  rule.metric = metric;
  if (isUsernameMetric(metric)) rule.minPlayers = 1;
}

function clampMinPlayers(rule: QueueRule): void {
  const clamped = Math.min(16, Math.max(1, Math.round(rule.minPlayers) || 1));
  if (rule.minPlayers !== clamped) rule.minPlayers = clamped;
}

function clampValue(rule: QueueRule): void {
  if (!Number.isFinite(rule.value)) rule.value = 0;
}

function capitalize(text: string): string {
  return text.length ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
</script>

<template>
  <div class="queue-outer flex h-full flex-col overflow-hidden">
    <div
      class="no-drag queue-banner flex shrink-0 items-center justify-between gap-3 px-3 py-2"
    >
      <div class="flex min-w-0 items-center gap-2">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          :style="{
            background: verdict.unsafe
              ? 'rgba(248, 113, 113, 0.14)'
              : 'rgba(var(--color-accent-rgb), 0.12)',
            border: verdict.unsafe
              ? '1px solid rgba(248, 113, 113, 0.35)'
              : '1px solid rgba(var(--color-accent-rgb), 0.28)',
          }"
        >
          <ShieldAlert
            v-if="verdict.unsafe"
            :size="16"
            style="color: var(--color-bad)"
          />
          <ShieldCheck
            v-else
            :size="16"
            style="color: var(--color-accent-light)"
          />
        </div>
        <div class="min-w-0">
          <div class="queue-banner-title">Queue Safety</div>
          <div class="queue-banner-desc truncate">
            Auto-flag lobbies that match your risk conditions.
          </div>
        </div>
      </div>
      <Switch
        class="no-drag shrink-0"
        :model-value="queueSafety.enabled"
        @update:model-value="queueSafety.enabled = $event"
      />
    </div>

    <div
      class="queue-content themed-scroll flex flex-1 flex-col gap-4 overflow-y-auto p-3"
    >
      <Section
        title="Conditions"
        description="Add the risk signals that should flag a lobby."
      >
        <div class="settings-row flex items-center justify-between gap-4">
          <div class="flex min-w-0 flex-col">
            <span class="row-label">Flag lobby when</span>
            <span class="row-desc">{{
              matchModes.find((mode) => mode.value === queueSafety.matchMode)?.description
            }}</span>
          </div>
          <div class="no-drag flex shrink-0 gap-1">
            <Button
              v-for="mode in matchModes"
              :key="mode.value"
              variant="control"
              size="sm"
              class="min-w-[56px]"
              :class="{ 'btn-control-v2--active': queueSafety.matchMode === mode.value }"
              @click="queueSafety.matchMode = mode.value"
            >
              {{ mode.label }}
            </Button>
          </div>
        </div>
      </Section>

      <div class="rule-list">
        <div
          v-for="rule in queueSafety.rules"
          :key="rule.id"
          class="rule-row"
        >
          <template v-if="isUsernameMetric(rule.metric)">
            <span class="rule-text">Flag when</span>

            <Select
              class="rule-select-metric"
              :model-value="rule.metric"
              :options="QueueMetricOptions"
              @update:model-value="(value) => onMetricChange(rule, value as QueueMetric)"
            />

            <span class="rule-text">is exactly</span>
            <input
              v-model.trim="rule.username"
              type="text"
              maxlength="16"
              spellcheck="false"
              placeholder="e.g. Steve123"
              class="input-field rule-username"
            />
          </template>

          <template v-else>
            <span class="rule-text">Flag when</span>
            <input
              v-model.number="rule.minPlayers"
              type="number"
              min="1"
              max="16"
              class="input-field rule-count"
              @blur="clampMinPlayers(rule)"
            />
            <span class="rule-text"
              >or more player{{ rule.minPlayers === 1 ? '' : 's' }}</span
            >

            <Select
              class="rule-select-metric"
              :model-value="rule.metric"
              :options="QueueMetricOptions"
              @update:model-value="(value) => onMetricChange(rule, value as QueueMetric)"
            />

            <template v-if="!isBooleanMetric(rule.metric)">
              <Select
                class="rule-select-comparator"
                :model-value="rule.comparator"
                :options="comparators"
                @update:model-value="
                  (value) => (rule.comparator = value as ValueComparator)
                "
              />
              <input
                v-model.number="rule.value"
                type="number"
                step="0.1"
                class="input-field rule-value"
                @blur="clampValue(rule)"
              />
            </template>
          </template>

          <Button
            v-if="pendingRuleIds.has(rule.id)"
            variant="ghost"
            size="icon-sm"
            class="rule-confirm ml-auto"
            @click="confirmRule(rule.id)"
          >
            <Check :size="12" />
          </Button>
          <Button
            v-else
            variant="ghost"
            size="icon-sm"
            class="ml-auto"
            @click="removeRule(rule.id)"
          >
            <Trash2 :size="12" />
          </Button>
        </div>

        <p
          v-if="queueSafety.rules.length === 0"
          class="rule-empty"
        >
          No conditions yet. Add one to start flagging risky lobbies.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        class="gap-1.5 self-start"
        @click="addRule"
      >
        <Plus :size="11" />
        Add condition
      </Button>

      <Section title="Live Preview">
        <div class="settings-row flex items-center justify-between">
          <span class="row-label">Tracked players</span>
          <span class="row-desc">{{ players.players.length }}</span>
        </div>
        <div
          class="preview-verdict"
          :class="{ 'preview-verdict--unsafe': verdict.unsafe }"
        >
          <div class="preview-verdict-icon">
            <ShieldAlert
              v-if="verdict.unsafe"
              :size="13"
            />
            <ShieldCheck
              v-else
              :size="13"
            />
          </div>
          <div class="preview-verdict-body min-w-0">
            <span class="preview-verdict-headline">
              <template v-if="verdict.unsafe"
                >This lobby matches your safety conditions.</template
              >
              <template v-else>No conditions currently match this lobby.</template>
            </span>
            <div
              v-if="verdict.reasons.length"
              class="preview-reasons"
            >
              <span
                v-for="(reason, i) in verdict.reasons"
                :key="i"
                class="preview-reason-chip"
              >
                {{ capitalize(reason) }}
              </span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  </div>
</template>

<style scoped>
.queue-outer {
  border-radius: 0;
}

@media (min-width: 640px) {
  .queue-outer {
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }
}

.queue-banner {
  position: relative;
  overflow: hidden;
  margin-bottom: 10px;
  background: var(--panel-bg);
  backdrop-filter: var(--panel-blur);
  -webkit-backdrop-filter: var(--panel-blur);
  border-bottom: 1px solid rgba(var(--color-accent-rgb), 0.18);
}
.queue-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  width: 300%;
  left: -100%;
  background: linear-gradient(
    105deg,
    rgba(var(--color-accent-rgb), 0.07) 0%,
    rgba(var(--color-accent-rgb), 0.03) 50%,
    rgba(var(--color-accent-rgb), 0.05) 100%
  );
  will-change: transform;
  animation: banner-shimmer 6s ease-in-out infinite;
  animation-play-state: var(--anim-play-state, running);
  pointer-events: none;
}

.queue-banner-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-accent-light);
  line-height: 1.2;
}

.queue-banner-desc {
  font-size: 0.8rem;
  color: var(--color-ink-3);
  line-height: 1.35;
  margin-top: 1px;
}

.queue-content {
  font-size: 0.98rem;
  scrollbar-gutter: stable;
}

.queue-content :deep(.settings-section) {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.018) !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  border-radius: 16px !important;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 22px 70px 4px rgba(0, 0, 0, 0.56),
    inset 0 1px rgba(255, 255, 255, 0.035) !important;
}

.queue-content :deep(.section-title) {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  margin: 0 -0.75rem;
  padding: 0.65rem 0.75rem;
  transition: background 160ms ease;
}

.settings-row:hover {
  background: rgba(var(--color-accent-rgb), 0.055);
}

.row-label {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-ink-2);
}

.row-desc {
  font-size: 0.71rem;
  color: var(--color-ink-3);
  margin-top: 1px;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding: 0.7rem 0.75rem;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.018);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.4),
    0 14px 42px rgba(0, 0, 0, 0.4),
    inset 0 1px rgba(255, 255, 255, 0.035);
}

.rule-text {
  font-size: 0.79rem;
  font-weight: 500;
  color: var(--color-ink-2);
  white-space: nowrap;
}

.rule-count {
  width: 52px;
  text-align: center;
}

.rule-value {
  width: 76px;
}

.rule-username {
  width: 140px;
}

.rule-select-metric {
  width: 150px;
}

.rule-select-comparator {
  width: 110px;
}

.rule-empty {
  margin: 0;
  padding: 1rem 0.25rem;
  text-align: center;
  font-size: 0.79rem;
  color: var(--color-ink-3);
}

.preview-verdict {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin: 0.4rem 0;
  padding: 0.6rem 0.7rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.preview-verdict-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 999px;
  background: rgba(var(--color-accent-rgb), 0.12);
  border: 1px solid rgba(var(--color-accent-rgb), 0.28);
  color: var(--color-accent-light);
}

.preview-verdict-body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 1px;
}

.preview-verdict-headline {
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-ink-2);
}

.preview-verdict--unsafe {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.28);
}

.preview-verdict--unsafe .preview-verdict-icon {
  background: rgba(248, 113, 113, 0.16);
  border-color: rgba(248, 113, 113, 0.35);
  color: var(--color-bad);
}

.preview-verdict--unsafe .preview-verdict-headline {
  color: var(--color-bad);
}

.preview-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.preview-reason-chip {
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-ink-2);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 0.16rem 0.55rem;
}

.preview-verdict--unsafe .preview-reason-chip {
  color: rgba(248, 113, 113, 0.92);
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.22);
}

.rule-confirm {
  color: var(--color-accent-light);
}

.rule-confirm:hover {
  background: rgba(var(--color-accent-rgb), 0.14);
  color: var(--color-accent-light);
}
</style>
