import type {
  RetrievalHit,
  RuntimeBudgetPlan,
  RuntimeGovernorStatus
} from '../../shared/types';
import type { RoutableProviderProfile } from './model-router';
import { RuntimeError } from './runtime-errors';

function nowIso() {
  return new Date().toISOString();
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function formatHit(hit: RetrievalHit) {
  return [
    `- ${hit.title}`,
    `  路径：${hit.path}`,
    `  原因：${hit.reason}`,
    `  摘要：${hit.excerpt}`
  ].join('\n');
}

type GovernorRuntimeState = {
  activeRunIds: Set<string>;
  lastUpdatedAt: string;
  lastDecision: string;
};

export class RuntimeBudgetGovernor {
  private readonly byRoot = new Map<string, GovernorRuntimeState>();

  constructor(private readonly maxConcurrentRuns = 2) {}

  acquire(rootPath: string, runId: string) {
    const state = this.getOrCreateState(rootPath);
    if (!state.activeRunIds.has(runId) && state.activeRunIds.size >= this.maxConcurrentRuns) {
      state.lastUpdatedAt = nowIso();
      state.lastDecision = `rejected:${runId}`;
      throw new RuntimeError(`Too many concurrent runtime executions. Limit is ${this.maxConcurrentRuns}.`, 'rate_limit');
    }
    state.activeRunIds.add(runId);
    state.lastUpdatedAt = nowIso();
    state.lastDecision = `acquired:${runId}`;
  }

  release(rootPath: string, runId: string) {
    const state = this.getOrCreateState(rootPath);
    state.activeRunIds.delete(runId);
    state.lastUpdatedAt = nowIso();
    state.lastDecision = `released:${runId}`;
  }

  getStatus(rootPath: string): RuntimeGovernorStatus {
    const state = this.getOrCreateState(rootPath);
    return {
      activeRunCount: state.activeRunIds.size,
      maxConcurrentRuns: this.maxConcurrentRuns,
      lastUpdatedAt: state.lastUpdatedAt,
      lastDecision: state.lastDecision
    };
  }

  planContext(input: {
    profile: RoutableProviderProfile;
    system: string;
    user: string;
    rollingSummary?: string;
    retrievalHits: RetrievalHit[];
  }) {
    const modelContextTokens = Math.max(4096, input.profile.capabilities.maxContextTokens || 32768);
    const reservedOutputTokens = Math.max(768, Math.floor(modelContextTokens * 0.2));
    const maxPromptTokens = Math.max(2048, modelContextTokens - reservedOutputTokens);
    const basePromptTokens = estimateTokens(input.system) + estimateTokens(input.user) + estimateTokens(input.rollingSummary ?? '');
    const selectedHits: RetrievalHit[] = [];
    let estimatedContextTokens = 0;
    let truncatedRetrievalHitCount = 0;

    for (const hit of input.retrievalHits) {
      const hitTokens = estimateTokens(formatHit(hit));
      if ((basePromptTokens + estimatedContextTokens + hitTokens) > maxPromptTokens) {
        truncatedRetrievalHitCount += 1;
        continue;
      }
      selectedHits.push(hit);
      estimatedContextTokens += hitTokens;
    }

    const contextSection = selectedHits.length
      ? [
          '知识命中与引用来源：',
          ...selectedHits.map((hit) => formatHit(hit))
        ].join('\n')
      : '';

    const plan: RuntimeBudgetPlan = {
      maxPromptTokens,
      reservedOutputTokens,
      estimatedPromptTokens: basePromptTokens + estimatedContextTokens,
      estimatedContextTokens,
      selectedRetrievalHitCount: selectedHits.length,
      truncatedRetrievalHitCount,
      compactedConversation: Boolean(input.rollingSummary),
      omittedMessageCount: 0
    };

    return {
      contextSection,
      selectedHits,
      plan
    };
  }

  private getOrCreateState(rootPath: string) {
    const existing = this.byRoot.get(rootPath);
    if (existing) return existing;
    const created: GovernorRuntimeState = {
      activeRunIds: new Set<string>(),
      lastUpdatedAt: nowIso(),
      lastDecision: 'idle'
    };
    this.byRoot.set(rootPath, created);
    return created;
  }
}
