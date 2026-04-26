import { describe, expect, it } from 'vitest';
import { resolveEffectiveRulesFromSnapshot } from '../../src/shared/rule-resolution.js';
import type { RulesDistillationSnapshot } from '../../src/shared/types.js';

function createSnapshot(): RulesDistillationSnapshot {
  return {
    scopes: [],
    globalRules: [
      {
        id: 'rule-global-style',
        name: 'Global style',
        description: 'Use concise language',
        body: 'Keep sentences concise.',
        scope: 'global',
        enabled: true,
        category: 'style',
        targetKey: 'writing-style',
        appliesTo: 'all',
        priority: 0,
        source: 'manual',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z'
      }
    ],
    projectRules: [
      {
        id: 'rule-project-style',
        name: 'Project style',
        description: 'Prefer numbered output',
        body: 'Always use numbered lists.',
        scope: 'project',
        enabled: true,
        category: 'structure',
        targetKey: 'writing-style',
        appliesTo: 'all',
        priority: 0,
        source: 'manual',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:01.000Z'
      },
      {
        id: 'rule-project-conflict',
        name: 'Project style conflict',
        description: 'Prefer bullet output',
        body: 'Always use bullet lists.',
        scope: 'project',
        enabled: true,
        category: 'structure',
        targetKey: 'writing-style',
        appliesTo: 'all',
        priority: 0,
        source: 'manual',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:01.000Z'
      },
      {
        id: 'rule-project-bound',
        name: 'Bound formatting rule',
        description: 'Only for selected nodes',
        body: 'Output must include a summary paragraph.',
        scope: 'project',
        enabled: true,
        category: 'quality',
        targetKey: 'output-shape',
        appliesTo: 'bound-only',
        priority: 0,
        source: 'manual',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:02.000Z'
      }
    ],
    nodeRules: [
      {
        id: 'rule-node-style',
        name: 'Node style',
        description: 'Node override',
        body: 'Node output must use a table.',
        scope: 'node',
        enabled: true,
        category: 'structure',
        targetKey: 'writing-style',
        appliesTo: 'all',
        priority: 0,
        source: 'manual',
        flowId: 'flow-main',
        nodeId: 'node-plan',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:03.000Z'
      }
    ],
    accumulationEntries: [],
    promotionDrafts: [],
    knowledgeGraph: {
      generatedAt: '2026-04-15T00:00:00.000Z',
      nodes: [],
      edges: []
    }
  };
}

describe('rule resolution', () => {
  it('prefers node rules over project and global rules and keeps bound-only rules gated', () => {
    const snapshot = createSnapshot();

    const effective = resolveEffectiveRulesFromSnapshot(snapshot, {
      flowId: 'flow-main',
      nodeId: 'node-plan',
      boundRuleIds: ['rule-project-bound']
    });

    expect(effective.rules.map((item) => item.id)).toEqual(
      expect.arrayContaining(['rule-node-style', 'rule-project-bound'])
    );
    expect(effective.rules.find((item) => item.targetKey === 'writing-style')?.id).toBe('rule-node-style');
    expect(effective.overrides.some((item) => item.effectiveRuleId === 'rule-node-style')).toBe(true);
  });

  it('reports conflicts when same-scope rules compete for the same target key', () => {
    const snapshot = createSnapshot();
    snapshot.nodeRules = [];

    const effective = resolveEffectiveRulesFromSnapshot(snapshot, {
      flowId: 'flow-main',
      nodeId: 'node-plan'
    });

    expect(effective.conflicts).toHaveLength(1);
    expect(effective.conflicts[0]?.targetKey).toBe('writing-style');
    expect(effective.conflicts[0]?.ruleIds).toEqual(
      expect.arrayContaining(['rule-project-style', 'rule-project-conflict'])
    );
  });
});
