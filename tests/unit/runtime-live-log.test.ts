import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import type {
  AgentMemory,
  PlatformRole,
  RuntimeRun
} from '../../src/shared/types.js';

function createRun(role: PlatformRole): RuntimeRun {
  return {
    id: 'run-1',
    kind: 'stage',
    status: 'completed',
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    heartbeatAt: '2026-04-20T00:00:00.000Z',
    roleId: role.id,
    currentStep: 'done',
    diagnostics: [],
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      estimatedCostUsd: 0
    },
    outputs: [],
    artifactOutcomes: [],
    checkpoints: [],
    branchGroups: [],
    scopes: [],
    loops: [],
    subflowCalls: [],
    rerunPlans: [],
    snapshots: [],
    pendingApprovals: [],
    mergeProposalIds: []
  };
}

describe('RuntimeService live log integration', () => {
  it('mirrors runtime events and model output into the live log stream', async () => {
    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const liveLog = {
      recordRuntimeEvent: vi.fn(),
      recordAiOutput: vi.fn(),
      recordQualityDiagnosis: vi.fn()
    };
    const role: PlatformRole = {
      id: 'role-1',
      name: 'Planner',
      description: '',
      promptHint: 'Plan the work.',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-1',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile: any = {
      id: 'profile-1',
      name: 'Profile',
      provider: 'deepseek',
      baseUrl: 'https://example.com',
      model: 'deepseek-chat',
      apiKey: 'secret',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: true,
      apiKeyMasked: '***',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: [],
        maxContextTokens: 32000,
        privacy: 'cloud',
        costTier: 'medium',
        latencyTier: 'medium'
      }
    };

    const service = new RuntimeService(
      {
        getRelevantDocumentChanges: vi.fn(() => []),
        openProject: vi.fn(() => ({
          manifest: {
            name: 'Test Project',
            templateId: 'template-1'
          }
        })),
        loadPlatformAssets: vi.fn(() => ({
          template: {
            id: 'template-1',
            name: 'Template'
          }
        }))
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn()
      } as never,
      {
        select: vi.fn(() => ({ profile: selectedProfile, reason: 'fixed profile selected' }))
      } as never,
      {
        generateText: vi.fn().mockResolvedValue({
          content: 'Final answer from model',
          output: { kind: 'final', label: 'text-output', contentType: 'text', content: 'Final answer from model' }
        })
      } as never,
      {
        execute: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {
        persistContextPack: vi.fn(),
        persistRunEvidence: vi.fn(),
        persistActionableError: vi.fn()
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        retrieve: vi.fn(() => ({
          indexState: {
            version: 1,
            status: 'ready',
            documentCount: 0,
            staleDocumentPaths: [],
            units: []
          },
          hits: []
        }))
      } as never,
      {
        buildRecords: vi.fn(() => []),
        toLegacyTokens: vi.fn((_records, tokens: string[]) => tokens)
      } as never,
      {
        acquire: vi.fn(),
        release: vi.fn(),
        planContext: vi.fn(() => ({
          plan: {
            maxPromptTokens: 0,
            maxCompletionTokens: 0,
            reservedOutputTokens: 0,
            retrievalTokenBudget: 0,
            selectedHitIds: []
          },
          selectedHits: [],
          contextSection: ''
        }))
      } as never,
      {
        compact: vi.fn(() => ({
          compacted: false,
          rollingSummary: '',
          omittedMessageCount: 0,
          sourceMessageCount: 0,
          retainedMessages: []
        }))
      } as never,
      {
        getSnapshot: vi.fn(() => ({
          id: 'rules-1',
          createdAt: '2026-04-17T00:00:00.000Z',
          updatedAt: '2026-04-17T00:00:00.000Z',
          summary: '',
          knowledgeGraph: {
            nodes: [],
            edges: []
          }
        })),
        resolveEffectiveRules: vi.fn(() => ({
          rules: [],
          conflicts: [],
          appliedRuleIds: []
        }))
      } as never,
      liveLog as never
    );

    await (service as any).runRoleLoop({
      rootPath: 'E:/tmp/project',
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'discover',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: selectedProfile.id,
      system: 'system prompt',
      user: 'user prompt',
      allowedCapabilities: []
    });

    expect(liveLog.recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ type: 'model.selected' })
    }));
    expect(liveLog.recordRuntimeEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ type: 'run.completed' })
    }));
    expect(liveLog.recordAiOutput).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Final answer from model'
    }));
  });

  it('mirrors degraded artifact quality reasons so low output quality can be diagnosed', async () => {
    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const liveLog = {
      recordRuntimeEvent: vi.fn(),
      recordAiOutput: vi.fn(),
      recordQualityDiagnosis: vi.fn()
    };
    const role: PlatformRole = {
      id: 'role-1',
      name: 'Planner',
      description: '',
      promptHint: 'Plan the work.',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-1',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile: any = {
      id: 'profile-1',
      name: 'Profile',
      provider: 'deepseek',
      baseUrl: 'https://example.com',
      model: 'deepseek-chat',
      apiKey: 'secret',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: true,
      apiKeyMasked: '***',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: [],
        maxContextTokens: 32000,
        privacy: 'cloud',
        costTier: 'medium',
        latencyTier: 'medium'
      }
    };
    const memory: AgentMemory = {
      productIntent: '',
      constraints: [],
      decisions: [],
      openQuestions: [],
      updatedAt: '2026-04-20T00:00:00.000Z'
    };

    const service = new RuntimeService(
      {
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          summary: '',
          pinned: false,
          archived: false,
          messages: [{ id: 'msg-1', role: 'user', content: 'Need a plan', createdAt: '2026-04-20T00:00:00.000Z' }]
        }]),
        loadWorkflow: vi.fn(() => ({
          stage: 'discover',
          confirmedStages: [],
          activeDocumentPath: ''
        })),
        loadAgentMemory: vi.fn(() => memory),
        saveFile: vi.fn(),
        saveAgentMemory: vi.fn(),
        saveWorkflow: vi.fn()
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn(),
        saveRunHistory: vi.fn()
      } as never,
      {} as never,
      {
        coerceMarkdown: vi.fn().mockResolvedValue({
          content: '# Draft',
          outputs: [{
            id: 'out-1',
            createdAt: '2026-04-20T00:00:00.000Z',
            kind: 'final',
            label: 'final-output',
            contentType: 'markdown',
            content: '# Draft',
            qualityVerdict: 'degraded',
            qualityScore: 61,
            qualityReasons: ['缺少验收标准']
          }],
          qualityTier: 'strict',
          qualityScore: 61,
          qualityReasons: ['缺少验收标准'],
          verdict: 'degraded',
          accepted: true,
          repaired: false,
          usedDeterministicFallback: false,
          message: 'Quality degraded.'
        })
      } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        compact: vi.fn(() => ({
          compacted: false,
          summary: '',
          rollingSummary: '',
          omittedMessageCount: 0,
          sourceMessageCount: 0,
          retainedMessages: []
        }))
      } as never,
      {} as never,
      liveLog as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service as any, 'getTemplate').mockReturnValue({
      stageDocuments: {
        discover: [{
          path: 'docs/plan.md',
          title: '计划文档',
          purpose: '输出计划',
          promptProfileId: 'prompt-1',
          validatorId: 'schema-1'
        }]
      }
    });
    vi.spyOn(service as any, 'resolveStageExecutionBinding').mockReturnValue({ roleId: role.id });
    vi.spyOn(service as any, 'getRole').mockReturnValue(role);
    vi.spyOn(service as any, 'resolveStageGenerationContextPaths').mockReturnValue([]);
    vi.spyOn(service as any, 'buildConversationSupportContext').mockReturnValue('');
    vi.spyOn(service as any, 'collectRuntimeSkillIds').mockReturnValue([]);
    vi.spyOn(service as any, 'readSkillInstructionsSafe').mockReturnValue('');
    vi.spyOn(service as any, 'getPromptProfile').mockReturnValue({
      id: 'prompt-1',
      systemPrompt: 'system'
    });
    vi.spyOn(service as any, 'getArtifactSchema').mockReturnValue({
      id: 'schema-1',
      title: 'Schema',
      kind: 'markdown'
    });
    vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: 'Generated draft',
      selectedProfile,
      run: createRun(role)
    });

    await service.generateStageDraft('E:/tmp/project', 'session-1', [selectedProfile], selectedProfile.id);

    expect(liveLog.recordQualityDiagnosis).toHaveBeenCalledWith(expect.objectContaining({
      artifactPath: 'docs/plan.md',
      qualityScore: 61,
      qualityReasons: expect.arrayContaining(['缺少验收标准']),
      verdict: 'degraded'
    }));
  });
  it('records accepted deterministic fallback artifacts as repaired without degraded diagnostics', async () => {
    const saveRun = vi.fn();
    const appendEvent = vi.fn();
    const liveLog = {
      recordRuntimeEvent: vi.fn(),
      recordAiOutput: vi.fn(),
      recordQualityDiagnosis: vi.fn()
    };
    const role: PlatformRole = {
      id: 'role-1',
      name: 'Planner',
      description: '',
      promptHint: 'Plan the work.',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-1',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const selectedProfile: any = {
      id: 'profile-1',
      name: 'Profile',
      provider: 'deepseek',
      baseUrl: 'https://example.com',
      model: 'deepseek-chat',
      apiKey: 'secret',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: true,
      apiKeyMasked: '***',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: [],
        maxContextTokens: 32000,
        privacy: 'cloud',
        costTier: 'medium',
        latencyTier: 'medium'
      }
    };
    const memory: AgentMemory = {
      productIntent: '',
      constraints: [],
      decisions: [],
      openQuestions: [],
      updatedAt: '2026-04-20T00:00:00.000Z'
    };

    const service = new RuntimeService(
      {
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          title: 'Session',
          stage: 'discover',
          summary: '',
          pinned: false,
          archived: false,
          messages: [{ id: 'msg-1', role: 'user', content: 'Need a plan', createdAt: '2026-04-20T00:00:00.000Z' }]
        }]),
        loadWorkflow: vi.fn(() => ({
          stage: 'discover',
          confirmedStages: [],
          activeDocumentPath: ''
        })),
        loadAgentMemory: vi.fn(() => memory),
        saveFile: vi.fn(),
        saveAgentMemory: vi.fn(),
        saveWorkflow: vi.fn()
      } as never,
      {
        saveRun,
        appendEvent,
        ensureProjectRuntime: vi.fn(),
        saveRunHistory: vi.fn()
      } as never,
      {} as never,
      {
        coerceMarkdown: vi.fn().mockResolvedValue({
          content: '# Draft',
          outputs: [{
            id: 'out-1',
            createdAt: '2026-04-20T00:00:00.000Z',
            kind: 'final',
            label: 'final-output',
            contentType: 'markdown',
            content: '# Draft',
            qualityVerdict: 'repaired',
            qualityScore: 100,
            qualityReasons: [],
            accepted: true
          }],
          qualityTier: 'strict',
          qualityScore: 100,
          qualityReasons: [],
          verdict: 'repaired',
          accepted: true,
          repaired: true,
          usedDeterministicFallback: true,
          message: 'Validated deterministic fallback.'
        })
      } as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        compact: vi.fn(() => ({
          compacted: false,
          summary: '',
          rollingSummary: '',
          omittedMessageCount: 0,
          sourceMessageCount: 0,
          retainedMessages: []
        }))
      } as never,
      {} as never,
      liveLog as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service as any, 'getTemplate').mockReturnValue({
      stageDocuments: {
        discover: [{
          path: 'docs/plan.md',
          title: '璁″垝鏂囨。',
          purpose: '杈撳嚭璁″垝',
          promptProfileId: 'prompt-1',
          validatorId: 'schema-1'
        }]
      }
    });
    vi.spyOn(service as any, 'resolveStageExecutionBinding').mockReturnValue({ roleId: role.id });
    vi.spyOn(service as any, 'getRole').mockReturnValue(role);
    vi.spyOn(service as any, 'resolveStageGenerationContextPaths').mockReturnValue([]);
    vi.spyOn(service as any, 'buildConversationSupportContext').mockReturnValue('');
    vi.spyOn(service as any, 'collectRuntimeSkillIds').mockReturnValue([]);
    vi.spyOn(service as any, 'readSkillInstructionsSafe').mockReturnValue('');
    vi.spyOn(service as any, 'getPromptProfile').mockReturnValue({
      id: 'prompt-1',
      systemPrompt: 'system'
    });
    vi.spyOn(service as any, 'getArtifactSchema').mockReturnValue({
      id: 'schema-1',
      title: 'Schema',
      kind: 'markdown'
    });
    vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: 'Generated draft',
      selectedProfile,
      run: createRun(role)
    });

    await service.generateStageDraft('E:/tmp/project', 'session-1', [selectedProfile], selectedProfile.id);

    expect(liveLog.recordQualityDiagnosis).toHaveBeenCalledWith(expect.objectContaining({
      artifactPath: 'docs/plan.md',
      qualityScore: 100,
      verdict: 'repaired',
      usedDeterministicFallback: true
    }));
    const savedRun = saveRun.mock.calls.at(-1)?.[1];
    expect(savedRun?.diagnostics ?? []).not.toContain('artifact-quality-degraded:docs/plan.md:100');
  });
});
