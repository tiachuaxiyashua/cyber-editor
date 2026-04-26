import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('runtime rules injection', () => {
  it('injects effective rules and promoted knowledge into prompt assembly and context packs', async () => {
    const persistContextPack = vi.fn();
    const persistRunEvidence = vi.fn();
    const selectedProfile = {
      id: 'profile-1',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      apiKey: '',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: false,
      apiKeyMasked: '',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['json-mode'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'low'
      }
    };
    const role = {
      id: 'role-1',
      name: 'Planner',
      description: '',
      promptHint: 'hint',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const service = new RuntimeService(
      {
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'plan',
          messages: [{ id: 'm1', role: 'user', content: 'hello', createdAt: '' }]
        }]),
        listKnowledgeFiles: vi.fn(() => ['E:/project/01-requirements/brief.md']),
        buildNoteReferenceGraph: vi.fn(() => ({
          documents: [{ path: 'E:/project/01-requirements/brief.md', title: 'Brief', outbound: [], inbound: [] }]
        })),
        getRelevantDocumentChanges: vi.fn(() => []),
        readFile: vi.fn(() => '# Brief'),
        getDocumentMeta: vi.fn(() => ({ modifiedAt: 1 }))
      } as never,
      {
        saveRun: vi.fn(),
        appendEvent: vi.fn(),
        ensureProjectRuntime: vi.fn(),
        listEventsForRun: vi.fn(() => [])
      } as never,
      {
        select: vi.fn(() => ({ profile: selectedProfile, reason: 'selected' }))
      } as never,
      {
        generateText: vi.fn().mockResolvedValue({
          content: 'final answer',
          output: { kind: 'final', label: 'output', contentType: 'text', content: 'final answer' }
        })
      } as never,
      {
        execute: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {
        persistContextPack,
        persistRunEvidence,
        persistActionableError: vi.fn()
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        getSnapshot: vi.fn(() => ({
          scopes: [],
          globalRules: [],
          projectRules: [],
          nodeRules: [],
          accumulationEntries: [],
          promotionDrafts: [],
          knowledgeGraph: {
            generatedAt: '2026-04-15T00:00:00.000Z',
            nodes: [{ id: 'knowledge-1', kind: 'knowledge', title: 'Review rulebook', summary: 'Use factual wording.', status: 'accepted' }],
            edges: []
          }
        })),
        resolveEffectiveRules: vi.fn(() => ({
          rules: [{
            id: 'rule-1',
            name: 'Use numbered headings',
            description: '',
            body: 'Output must use numbered headings.',
            scope: 'project',
            enabled: true,
            category: 'structure',
            targetKey: 'structure',
            appliesTo: 'all',
            priority: 0,
            source: 'manual',
            createdAt: '2026-04-15T00:00:00.000Z',
            updatedAt: '2026-04-15T00:00:00.000Z'
          }],
          conflicts: [],
          overrides: [],
          appliedRuleIds: ['rule-1']
        }))
      } as never
    );

    await (service as any).runRoleLoop({
      rootPath: 'E:/project',
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'plan',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: 'profile-1',
      system: 'system',
      user: 'write the plan',
      allowedCapabilities: [],
      contextDocumentPaths: ['E:/project/01-requirements/brief.md']
    });

    const persistedContextPack = persistContextPack.mock.calls[0]?.[1];
    expect(persistedContextPack?.userPrompt).toContain('生效规则');
    expect(persistedContextPack?.userPrompt).toContain('Use numbered headings');
    expect(persistedContextPack?.userPrompt).toContain('已提升知识');
    expect(persistedContextPack?.effectiveRuleIds).toEqual(['rule-1']);
    expect(persistedContextPack?.knowledgeNodeIds).toEqual(['knowledge-1']);
    expect(persistedContextPack?.provenance).toEqual(expect.arrayContaining(['rule:Use numbered headings', 'knowledge:Review rulebook']));
  });
});
