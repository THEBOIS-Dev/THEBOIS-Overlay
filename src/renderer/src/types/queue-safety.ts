import { nanoid } from '@renderer/composables/nanoid';
import type { Player } from '@renderer/types';
import { Column, COLUMNS, isStaff } from '@renderer/types';

export type QueueMetric = Exclude<Column, Column.NAME> | 'NICKED' | 'STAFF' | 'USERNAME';
export type ValueComparator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type MatchMode = 'any' | 'all';
export type MetricKind = 'numeric' | 'boolean' | 'username';

export interface QueueRule {
  id: string;
  metric: QueueMetric;
  comparator: ValueComparator;
  value: number;
  minPlayers: number;
  username: string;
}

export interface QueueSafetyConfig {
  enabled: boolean;
  matchMode: MatchMode;
  rules: QueueRule[];
}

interface MetricDef {
  label: string;
  kind: MetricKind;
  connector: string;
  getValue?: (player: Player) => number;
}

const METRIC_DEFS: Record<QueueMetric, MetricDef> = {
  [Column.LEVEL]: {
    label: 'Level',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.LEVEL].getNum!(player),
  },
  [Column.FKDR]: {
    label: 'FKDR',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.FKDR].getNum!(player),
  },
  [Column.WLR]: {
    label: 'WLR',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.WLR].getNum!(player),
  },
  [Column.KDR]: {
    label: 'KDR',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.KDR].getNum!(player),
  },
  [Column.BBLR]: {
    label: 'BBLR',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.BBLR].getNum!(player),
  },
  [Column.WINS]: {
    label: 'Wins',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.WINS].getNum!(player),
  },
  [Column.LOSSES]: {
    label: 'Losses',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.LOSSES].getNum!(player),
  },
  [Column.KILLS]: {
    label: 'Kills',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.KILLS].getNum!(player),
  },
  [Column.DEATHS]: {
    label: 'Deaths',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.DEATHS].getNum!(player),
  },
  [Column.FINAL_KILLS]: {
    label: 'Final Kills',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.FINAL_KILLS].getNum!(player),
  },
  [Column.FINAL_DEATHS]: {
    label: 'Final Deaths',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.FINAL_DEATHS].getNum!(player),
  },
  [Column.BEDS_BROKEN]: {
    label: 'Beds Broken',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.BEDS_BROKEN].getNum!(player),
  },
  [Column.WIN_STREAK]: {
    label: 'Winstreak',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.WIN_STREAK].getNum!(player),
  },
  [Column.PLAYED]: {
    label: 'Games Played',
    kind: 'numeric',
    connector: 'have',
    getValue: (player) => COLUMNS[Column.PLAYED].getNum!(player),
  },
  USERNAME: {
    label: 'Username',
    kind: 'username',
    connector: 'is',
  },
  NICKED: {
    label: 'Nicked',
    kind: 'boolean',
    connector: 'are',
    getValue: (player) => (player.nicked ? 1 : 0),
  },
  STAFF: {
    label: 'Staff',
    kind: 'boolean',
    connector: 'have',
    getValue: (player) => (isStaff(player.profile) ? 1 : 0),
  },
};

export const QUEUE_METRICS: QueueMetric[] = [
  Column.LEVEL,
  Column.FKDR,
  Column.WLR,
  Column.KDR,
  Column.BBLR,
  Column.WINS,
  Column.LOSSES,
  Column.KILLS,
  Column.DEATHS,
  Column.FINAL_KILLS,
  Column.FINAL_DEATHS,
  Column.BEDS_BROKEN,
  Column.WIN_STREAK,
  Column.PLAYED,
  'USERNAME',
  'NICKED',
  'STAFF',
];

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

export const QUEUE_METRIC_OPTIONS: SelectOption<QueueMetric>[] = QUEUE_METRICS.map(
  (metric) => ({ value: metric, label: METRIC_DEFS[metric].label }),
);

export const VALUE_COMPARATOR_OPTIONS: SelectOption<ValueComparator>[] = [
  { value: '>=', label: 'at least' },
  { value: '>', label: 'more than' },
  { value: '<=', label: 'at most' },
  { value: '<', label: 'less than' },
  { value: '==', label: 'exactly' },
  { value: '!=', label: 'not' },
];

export function metricDef(metric: QueueMetric): MetricDef {
  return METRIC_DEFS[metric];
}

export function isBooleanMetric(metric: QueueMetric): boolean {
  return METRIC_DEFS[metric].kind === 'boolean';
}

export function isUsernameMetric(metric: QueueMetric): boolean {
  return METRIC_DEFS[metric].kind === 'username';
}

function usernameOf(player: Player): string {
  return player.realName || player.name;
}

function comparatorLabel(comparator: ValueComparator): string {
  return VALUE_COMPARATOR_OPTIONS.find((option) => option.value === comparator)!.label;
}

function compareValue(
  actual: number,
  comparator: ValueComparator,
  target: number,
): boolean {
  switch (comparator) {
    case '>':
      return actual > target;
    case '>=':
      return actual >= target;
    case '<':
      return actual < target;
    case '<=':
      return actual <= target;
    case '==':
      return actual === target;
    case '!=':
      return actual !== target;
  }
}

export function createRule(overrides: Partial<QueueRule> = {}): QueueRule {
  return {
    id: nanoid(10),
    metric: Column.FKDR,
    comparator: '>=',
    value: 6,
    minPlayers: 1,
    username: '',
    ...overrides,
  };
}

export function defaultQueueSafetyConfig(): QueueSafetyConfig {
  return {
    enabled: false,
    matchMode: 'any',
    rules: [],
  };
}

export interface RuleMatch {
  rule: QueueRule;
  matchedPlayers: Player[];
  satisfied: boolean;
}

export interface QueueVerdict {
  unsafe: boolean;
  ruleMatches: RuleMatch[];
  triggeredRules: RuleMatch[];
  reasons: string[];
}

export function evaluateRule(rule: QueueRule, players: Player[]): RuleMatch {
  const def = METRIC_DEFS[rule.metric];
  // Defensive floor: a rule saved (or hand-edited) with minPlayers <= 0 would
  // otherwise be trivially "satisfied" by zero matching players - an empty/
  // unset condition should never read as unsafe.
  const minPlayers = Math.max(1, Math.round(rule.minPlayers) || 1);

  if (def.kind === 'username') {
    const target = (rule.username ?? '').trim().toLowerCase();
    const matchedPlayers = target
      ? players.filter((player) => usernameOf(player).toLowerCase() === target)
      : [];

    return {
      rule,
      matchedPlayers,
      // A username condition matches a single specific player, not a count
      // - "N or more" doesn't apply here the way it does for other metrics,
      // so this is satisfied purely by presence, never by an unset value.
      satisfied: target.length > 0 && matchedPlayers.length > 0,
    };
  }

  const comparator = def.kind === 'boolean' ? '==' : rule.comparator;
  const target =
    def.kind === 'boolean' ? 1 : Number.isFinite(rule.value) ? rule.value : 0;

  const matchedPlayers = players.filter((player) =>
    compareValue(def.getValue!(player), comparator, target),
  );

  return {
    rule,
    matchedPlayers,
    satisfied: matchedPlayers.length >= minPlayers,
  };
}

function subjectPhrase(count: number): string {
  return `${count} player${count === 1 ? '' : 's'}`;
}

export function describeRule(rule: QueueRule): string {
  const def = METRIC_DEFS[rule.metric];

  if (def.kind === 'username') {
    const username = (rule.username ?? '').trim();
    return username
      ? `a player's username is exactly "${username}"`
      : `a player's username (not yet set)`;
  }

  const subject = `${rule.minPlayers} or more player${rule.minPlayers === 1 ? '' : 's'}`;

  if (def.kind === 'boolean') {
    return `${subject} ${def.connector} ${def.label}`;
  }

  return `${subject} ${def.connector} ${def.label} ${comparatorLabel(rule.comparator)} ${rule.value}`;
}

export function describeRuleMatch(match: RuleMatch): string {
  const def = METRIC_DEFS[match.rule.metric];

  if (def.kind === 'username') {
    return `a player's username is exactly "${(match.rule.username ?? '').trim()}"`;
  }

  const subject = subjectPhrase(match.matchedPlayers.length);

  if (def.kind === 'boolean') {
    return `${subject} ${def.connector} ${def.label}`;
  }

  return `${subject} ${def.connector} ${def.label} ${comparatorLabel(match.rule.comparator)} ${match.rule.value}`;
}

export const QUEUE_SAFETY_MESSAGE = 'This lobby matches your safety conditions.';

export function evaluateQueueSafety(
  config: QueueSafetyConfig,
  players: Player[],
): QueueVerdict {
  if (!config.enabled || config.rules.length === 0) {
    return { unsafe: false, ruleMatches: [], triggeredRules: [], reasons: [] };
  }

  const ruleMatches = config.rules.map((rule) => evaluateRule(rule, players));

  const unsafe =
    config.matchMode === 'all'
      ? ruleMatches.every((match) => match.satisfied)
      : ruleMatches.some((match) => match.satisfied);

  const triggeredRules = ruleMatches.filter((match) => match.satisfied);
  const reasons = unsafe ? triggeredRules.map(describeRuleMatch) : [];

  return { unsafe, ruleMatches, triggeredRules, reasons };
}
