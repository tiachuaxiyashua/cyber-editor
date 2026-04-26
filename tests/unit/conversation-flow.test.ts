import { describe, expect, it } from 'vitest';
import {
  applyFlowPatch,
  buildFlowDraftFromPlan,
  buildFlowPatchFromPrompt,
  buildFlowPlanFromPrompt
} from '../../src/shared/conversation-flow.js';

describe('conversation-flow helpers', () => {
  it('builds a flow plan from natural language steps', () => {
    const plan = buildFlowPlanFromPrompt('梳理需求。条件判断是否可行。循环完善方案。');

    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].type).toBe('agent');
    expect(plan.steps[1].type).toBe('condition');
    expect(plan.steps[2].type).toBe('loop');
  });

  it('builds a flow draft with start and end nodes', () => {
    const plan = buildFlowPlanFromPrompt('梳理需求。产出方案。');
    const draft = buildFlowDraftFromPlan(plan);

    expect(draft.nodes[0].type).toBe('start');
    expect(draft.nodes.at(-1)?.type).toBe('end');
    expect(draft.edges).toHaveLength(draft.nodes.length - 1);
  });

  it('applies add-node patches by rewiring outgoing edges', () => {
    const draft = buildFlowDraftFromPlan(buildFlowPlanFromPrompt('梳理需求。产出方案。'));
    const patch = buildFlowPatchFromPrompt(draft, '添加 审查 节点');
    const patched = applyFlowPatch(draft, patch);
    const addedNode = patched.nodes.find((node) => node.data.label.includes('审查'));

    expect(addedNode).toBeTruthy();
    expect(patched.edges.some((edge) => edge.target === addedNode?.id)).toBe(true);
    expect(patched.edges.some((edge) => edge.source === addedNode?.id)).toBe(true);
  });
});
