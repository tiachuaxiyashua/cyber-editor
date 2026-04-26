import { describe, expect, it } from 'vitest';
import { RuntimeBudgetGovernor } from '../../src/main/services/runtime-budget-governor.js';
import { RuntimeError } from '../../src/main/services/runtime-errors.js';

describe('RuntimeBudgetGovernor', () => {
  it('limits concurrent runs and exposes status', () => {
    const governor = new RuntimeBudgetGovernor(2);

    governor.acquire('E:/project', 'run-1');
    governor.acquire('E:/project', 'run-2');

    expect(() => governor.acquire('E:/project', 'run-3')).toThrowError(RuntimeError);
    expect(() => governor.acquire('E:/project', 'run-3')).toThrow(/Too many concurrent runtime executions/);

    const status = governor.getStatus('E:/project');
    expect(status.activeRunCount).toBe(2);
    expect(status.maxConcurrentRuns).toBe(2);
    expect(status.lastDecision).toBe('rejected:run-3');

    governor.release('E:/project', 'run-1');
    expect(governor.getStatus('E:/project').activeRunCount).toBe(1);
  });

  it('truncates retrieval hits to fit the prompt budget', () => {
    const governor = new RuntimeBudgetGovernor(1);

    const result = governor.planContext({
      profile: {
        id: 'profile-1',
        provider: 'ollama',
        model: 'qwen3:8b',
        baseUrl: 'http://localhost:11434',
        apiKey: '',
        hasApiKey: false,
        apiKeyMasked: '',
        enabled: true,
        createdAt: '',
        updatedAt: '',
        name: 'Local',
        diagnostics: { status: 'unknown' },
        capabilities: {
          tags: ['json-mode'],
          maxContextTokens: 4096,
          privacy: 'local',
          costTier: 'low',
          latencyTier: 'low'
        }
      } as never,
      system: 'system prompt',
      user: 'user prompt',
      rollingSummary: 'summary',
      retrievalHits: Array.from({ length: 12 }, (_, index) => ({
        unitId: `unit-${index}`,
        path: `E:/project/doc-${index}.md`,
        title: `Doc ${index}`,
        excerpt: 'x'.repeat(2_000),
        score: 10 - index,
        matchedBy: ['keyword'],
        reason: `reason ${index}`,
        relatedChangeRecordIds: []
      }))
    });

    expect(result.plan.selectedRetrievalHitCount).toBeGreaterThan(0);
    expect(result.plan.truncatedRetrievalHitCount).toBeGreaterThan(0);
    expect(result.plan.estimatedPromptTokens).toBeLessThanOrEqual(result.plan.maxPromptTokens);
    expect(result.contextSection).toContain('知识命中与引用来源');
  });
});
