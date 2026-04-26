import { describe, expect, it, vi } from 'vitest';
import { ConversationFlowService } from '../../src/main/services/conversation-flow-service.js';
import type { PlatformFlowAsset, PlatformRole } from '../../src/shared/types.js';

function createProfile(overrides: Partial<{
  id: string;
  provider: 'mock' | 'deepseek' | 'ollama' | 'openai-compatible';
  enabled: boolean;
}> = {}) {
  return {
    id: overrides.id ?? 'profile-1',
    name: 'Profile 1',
    provider: overrides.provider ?? 'deepseek',
    baseUrl: 'https://api.example.com',
    model: 'model-1',
    apiKey: 'secret',
    enabled: overrides.enabled ?? true,
    createdAt: '',
    updatedAt: '',
    hasApiKey: true,
    apiKeyMasked: '***',
    diagnostics: { status: 'unknown' as const },
    capabilities: {
      tags: ['json-mode' as const],
      maxContextTokens: 64000,
      privacy: 'cloud' as const,
      costTier: 'medium' as const,
      latencyTier: 'medium' as const
    }
  };
}

const roles: PlatformRole[] = [{
  id: 'role-1',
  name: 'Planner',
  description: 'Planning role',
  promptHint: 'Plan the flow',
  allowedCapabilities: [],
  outputSchema: 'json',
  modelPolicy: {
    mode: 'fixed',
    fixedProfileId: 'profile-1',
    preferredProfileIds: [],
    fallbackToActive: true
  }
}];

function createFlow(): PlatformFlowAsset {
  return {
    id: 'flow-1',
    name: 'Test Flow',
    description: 'Flow for testing',
    kind: 'flow',
    createdAt: '',
    updatedAt: '',
    nodes: [
      { id: 'start', type: 'start', position: { x: 120, y: 140 }, data: { label: '开始' } },
      { id: 'end', type: 'end', position: { x: 420, y: 140 }, data: { label: '结束' } }
    ],
    edges: [{ id: 'edge-1', source: 'start', target: 'end' }]
  };
}

describe('ConversationFlowService', () => {
  it('falls back to heuristic planning when no usable provider is selected', async () => {
    const aiService = { complete: vi.fn() };
    const service = new ConversationFlowService(aiService as any);

    const plan = await service.planFromPrompt({
      prompt: '先收集信息。再产出结论。',
      roles,
      profiles: [createProfile({ provider: 'mock' })],
      activeProviderProfileId: 'profile-1'
    });

    expect(plan.steps).toHaveLength(2);
    expect(aiService.complete).not.toHaveBeenCalled();
  });

  it('uses the provider response when it returns valid JSON', async () => {
    const aiService = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        name: '访谈流程',
        description: '从输入到结论',
        steps: [
          { title: '收集背景', type: 'agent', description: '收集上下文' },
          { title: '条件判断', type: 'condition', description: '判断是否继续' }
        ]
      }))
    };
    const service = new ConversationFlowService(aiService as any);

    const plan = await service.planFromPrompt({
      prompt: '做一个访谈流程。',
      roles,
      profiles: [createProfile()],
      activeProviderProfileId: 'profile-1'
    });

    expect(plan.name).toBe('访谈流程');
    expect(plan.steps.map((step) => step.type)).toEqual(['agent', 'condition']);
    expect(aiService.complete).toHaveBeenCalledTimes(1);
  });

  it('produces and applies patches for an existing flow', async () => {
    const aiService = {
      complete: vi.fn().mockResolvedValue(JSON.stringify({
        summary: '插入审查节点',
        operations: [{
          op: 'add_node',
          afterNodeId: 'start',
          node: {
            title: '审查',
            type: 'agent',
            description: '审查当前结果'
          }
        }]
      }))
    };
    const service = new ConversationFlowService(aiService as any);
    const flow = createFlow();

    const patch = await service.patchFromPrompt({
      flow,
      prompt: '在开始后增加审查节点',
      profiles: [createProfile()],
      activeProviderProfileId: 'profile-1'
    });
    const nextFlow = service.applyPatch(flow, patch);

    expect(patch.operations).toHaveLength(1);
    expect(nextFlow.nodes.some((node) => node.data.label.includes('审查'))).toBe(true);
  });
});
