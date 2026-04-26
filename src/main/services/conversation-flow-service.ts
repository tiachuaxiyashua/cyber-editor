import type { FlowPatch, FlowPlan, PlatformFlowAsset, PlatformRole } from '../../shared/types';
import { applyFlowPatch, buildFlowDraftFromPlan, buildFlowPatchFromPrompt, buildFlowPlanFromPrompt } from '../../shared/conversation-flow';
import type { RoutableProviderProfile } from './model-router';
import type { ProviderSettings } from './ai-service';
import { AiService } from './ai-service';

function sanitizeJsonFence(raw: string) {
  return raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
}

export class ConversationFlowService {
  constructor(private readonly aiService: AiService) {}

  async planFromPrompt(input: {
    prompt: string;
    roles: PlatformRole[];
    profiles: RoutableProviderProfile[];
    activeProviderProfileId: string;
  }): Promise<FlowPlan> {
    const fallback = buildFlowPlanFromPrompt(input.prompt);
    const selected = input.profiles.find((profile) => profile.id === input.activeProviderProfileId && profile.enabled);
    if (!selected || selected.provider === 'mock') {
      return fallback;
    }
    try {
      const raw = await this.aiService.complete(this.profileToSettings(selected), {
        system: [
          '你是流程规划器。',
          '请把用户描述转成 JSON。',
          'JSON 结构：{ "name": string, "description": string, "steps": [{ "title": string, "type": "agent|tool|condition|loop|parallel_split|parallel_join|subflow|artifact", "description": string }] }。',
          '只输出 JSON，不要解释。'
        ].join('\n'),
        user: input.prompt
      });
      const parsed = JSON.parse(sanitizeJsonFence(raw)) as Partial<FlowPlan>;
      if (!parsed.name || !Array.isArray(parsed.steps) || !parsed.steps.length) {
        return fallback;
      }
      return {
        id: fallback.id,
        name: parsed.name,
        description: parsed.description?.trim() || input.prompt.trim(),
        steps: parsed.steps.map((step, index) => ({
          id: `step-${index + 1}`,
          title: step.title?.trim() || `步骤 ${index + 1}`,
          type: step.type ?? 'agent',
          description: step.description?.trim()
        }))
      };
    } catch {
      return fallback;
    }
  }

  async patchFromPrompt(input: {
    flow: PlatformFlowAsset;
    prompt: string;
    profiles: RoutableProviderProfile[];
    activeProviderProfileId: string;
  }): Promise<FlowPatch> {
    const fallback = buildFlowPatchFromPrompt(input.flow, input.prompt);
    const selected = input.profiles.find((profile) => profile.id === input.activeProviderProfileId && profile.enabled);
    if (!selected || selected.provider === 'mock') {
      return fallback;
    }
    try {
      const raw = await this.aiService.complete(this.profileToSettings(selected), {
        system: [
          '你是流程 patch 生成器。',
          '请把用户修改要求转成 JSON。',
          'JSON 结构：{ "summary": string, "operations": Array<rename_flow|add_node|update_node|delete_node> }。',
          'add_node 需要 { op, afterNodeId?, node:{ title, type, description? } }。',
          'update_node 需要 { op, nodeId, patch:{ label?, description? } }。',
          '只输出 JSON，不要解释。'
        ].join('\n'),
        user: [
          `当前流程：${input.flow.name}`,
          `节点：${input.flow.nodes.map((node) => `${node.id}:${node.data.label}`).join(' | ')}`,
          `修改要求：${input.prompt}`
        ].join('\n')
      });
      const parsed = JSON.parse(sanitizeJsonFence(raw)) as Partial<FlowPatch>;
      if (!Array.isArray(parsed.operations) || !parsed.operations.length) {
        return fallback;
      }
      return {
        id: fallback.id,
        summary: parsed.summary?.trim() || input.prompt.trim(),
        operations: parsed.operations as FlowPatch['operations']
      };
    } catch {
      return fallback;
    }
  }

  draftFromPlan(plan: FlowPlan, kind: PlatformFlowAsset['kind'] = 'flow') {
    return buildFlowDraftFromPlan(plan, kind);
  }

  applyPatch(flow: PlatformFlowAsset, patch: FlowPatch) {
    return applyFlowPatch(flow, patch);
  }

  private profileToSettings(profile: RoutableProviderProfile): ProviderSettings {
    return {
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: profile.apiKey ?? ''
    };
  }
}
