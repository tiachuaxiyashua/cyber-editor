import type {
  EffectiveRuleSet,
  RuleConflict,
  RuleDefinition,
  RuleOverrideExplanation,
  RuleScope,
  RuleScopeSummary,
  RulesDistillationSnapshot
} from './types';

type ResolveRuleSetInput = {
  rules: RuleDefinition[];
  flowId?: string;
  nodeId?: string;
  boundRuleIds?: string[];
};

function ruleScopeWeight(scope: RuleScope) {
  switch (scope) {
    case 'node':
      return 300;
    case 'project':
      return 200;
    case 'global':
    default:
      return 100;
  }
}

function parseUpdatedAt(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applicableToContext(rule: RuleDefinition, input: ResolveRuleSetInput) {
  if (!rule.enabled) return false;
  if (rule.scope === 'node') {
    if (!input.nodeId || rule.nodeId !== input.nodeId) return false;
    if (rule.flowId && rule.flowId !== input.flowId) return false;
    return true;
  }
  if (rule.appliesTo === 'all') {
    return true;
  }
  return new Set(input.boundRuleIds ?? []).has(rule.id);
}

function compareRules(left: RuleDefinition, right: RuleDefinition) {
  return ruleScopeWeight(right.scope) - ruleScopeWeight(left.scope)
    || right.priority - left.priority
    || parseUpdatedAt(right.updatedAt) - parseUpdatedAt(left.updatedAt)
    || left.id.localeCompare(right.id);
}

function stableGroupKey(rule: RuleDefinition) {
  return rule.targetKey?.trim() || `__standalone__:${rule.id}`;
}

function buildOverrideExplanation(targetKey: string, winner: RuleDefinition, losers: RuleDefinition[]): RuleOverrideExplanation {
  const highestOverriddenScope = losers[0]?.scope ?? 'global';
  return {
    targetKey,
    effectiveRuleId: winner.id,
    overriddenRuleIds: losers.map((item) => item.id),
    reason: `${winner.name} (${winner.scope}) overrides ${highestOverriddenScope}-scoped rules for ${targetKey}.`
  };
}

function buildConflict(targetKey: string, group: RuleDefinition[], winner: RuleDefinition): RuleConflict | null {
  if (!targetKey || group.length <= 1) return null;
  const contenders = group.filter((item) =>
    item.id !== winner.id
    && item.body.trim() !== winner.body.trim()
    && ruleScopeWeight(item.scope) === ruleScopeWeight(winner.scope)
    && item.priority === winner.priority
  );
  if (!contenders.length) return null;
  return {
    id: `rule-conflict:${targetKey}:${winner.id}`,
    targetKey,
    ruleIds: [winner.id, ...contenders.map((item) => item.id)],
    winningRuleId: winner.id,
    severity: 'warning',
    message: `Multiple ${winner.scope}-scoped rules compete for ${targetKey}.`,
    actionableSuggestions: [
      'Disable one of the conflicting rules or adjust its target key.',
      'Raise the priority of the intended winner if both rules must remain active.'
    ]
  };
}

export function collectRuleScopeSummary(snapshot: Pick<RulesDistillationSnapshot, 'globalRules' | 'projectRules' | 'nodeRules'>): RuleScopeSummary[] {
  const groups: Array<{ scope: RuleScope; rules: RuleDefinition[] }> = [
    { scope: 'global', rules: snapshot.globalRules },
    { scope: 'project', rules: snapshot.projectRules },
    { scope: 'node', rules: snapshot.nodeRules }
  ];
  return groups.map(({ scope, rules }) => ({
    scope,
    count: rules.length,
    enabledCount: rules.filter((item) => item.enabled).length
  }));
}

export function resolveEffectiveRuleSet(input: ResolveRuleSetInput): EffectiveRuleSet {
  const applicable = input.rules
    .filter((rule) => applicableToContext(rule, input))
    .sort(compareRules);
  const grouped = new Map<string, RuleDefinition[]>();
  for (const rule of applicable) {
    const key = stableGroupKey(rule);
    const current = grouped.get(key) ?? [];
    current.push(rule);
    grouped.set(key, current);
  }

  const rules: RuleDefinition[] = [];
  const conflicts: RuleConflict[] = [];
  const overrides: RuleOverrideExplanation[] = [];

  for (const [groupKey, group] of grouped.entries()) {
    const ordered = [...group].sort(compareRules);
    const winner = ordered[0];
    if (!winner) continue;
    rules.push(winner);
    const losers = ordered.slice(1);
    const targetKey = groupKey.startsWith('__standalone__') ? '' : groupKey;
    if (targetKey && losers.length) {
      overrides.push(buildOverrideExplanation(targetKey, winner, losers));
    }
    const conflict = buildConflict(targetKey, ordered, winner);
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return {
    rules: rules.sort(compareRules),
    conflicts,
    overrides,
    appliedRuleIds: rules.map((item) => item.id)
  };
}

export function resolveEffectiveRulesFromSnapshot(
  snapshot: Pick<RulesDistillationSnapshot, 'globalRules' | 'projectRules' | 'nodeRules'>,
  input: Omit<ResolveRuleSetInput, 'rules'>
) {
  return resolveEffectiveRuleSet({
    ...input,
    rules: [...snapshot.globalRules, ...snapshot.projectRules, ...snapshot.nodeRules]
  });
}
