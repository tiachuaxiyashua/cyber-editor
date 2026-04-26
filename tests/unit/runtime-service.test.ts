import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import type { AgentProfile, PlatformRole, TaskTemplate } from '../../src/shared/types.js';

function createQueryLoopService(overrides?: {
  saveRun?: ReturnType<typeof vi.fn>;
  appendEvent?: ReturnType<typeof vi.fn>;
  capabilityExecute?: ReturnType<typeof vi.fn>;
  generateText?: ReturnType<typeof vi.fn>;
  select?: ReturnType<typeof vi.fn>;
}) {
  const saveRun = overrides?.saveRun ?? vi.fn();
  const appendEvent = overrides?.appendEvent ?? vi.fn();
  const capabilityExecute = overrides?.capabilityExecute ?? vi.fn(async () => ({ ok: true, source: 'tool' }));
  const generateText = overrides?.generateText ?? vi.fn();
  const select = overrides?.select ?? vi.fn();

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
      select
    } as never,
    {
      generateText
    } as never,
    {
      execute: capabilityExecute
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
    } as never
  );

  return { service, saveRun, appendEvent, capabilityExecute, generateText, select };
}

describe('RuntimeService query loop', () => {
  it('executes tool calls and returns the final answer through the routed profile', async () => {
    const role: PlatformRole = {
      id: 'role-planner',
      name: '规划代理',
      description: '',
      promptHint: '负责规划',
      allowedCapabilities: ['builtin:list_documents'],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-deepseek',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const selectedProfile = {
      id: 'profile-deepseek',
      name: 'DeepSeek',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'secret',
      enabled: true,
      createdAt: '',
      updatedAt: '',
      hasApiKey: true,
      apiKeyMasked: '***',
      diagnostics: { status: 'unknown' },
      capabilities: {
        tags: ['tools', 'json-mode', 'structured-output'],
        maxContextTokens: 64000,
        privacy: 'cloud',
        costTier: 'medium',
        latencyTier: 'medium'
      }
    };

    const { service, saveRun, appendEvent, capabilityExecute } = createQueryLoopService({
      select: vi.fn(() => ({ profile: selectedProfile, reason: 'fixed profile selected' })),
      generateText: vi
        .fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            toolCalls: [{ capabilityId: 'builtin:list_documents', input: {} }]
          }),
          output: { kind: 'final', label: 'text-output', contentType: 'text', content: '' }
        })
        .mockResolvedValueOnce({
          content: '最终文本结果',
          output: { kind: 'final', label: 'text-output', contentType: 'text', content: '最终文本结果' }
        })
    });

    const result = await (service as any).runRoleLoop({
      rootPath: 'E:/tmp/project',
      kind: 'chat',
      sessionId: 'session-1',
      stage: 'discover',
      role,
      profiles: [selectedProfile],
      activeProviderProfileId: selectedProfile.id,
      system: '系统提示',
      user: '用户输入',
      allowedCapabilities: role.allowedCapabilities
    });

    expect(result.finalText).toBe('最终文本结果');
    expect(result.selectedProfile.id).toBe(selectedProfile.id);
    expect(capabilityExecute).toHaveBeenCalledWith(
      'E:/tmp/project',
      'builtin:list_documents',
      {},
      expect.objectContaining({ runId: expect.any(String) })
    );
    expect(saveRun).toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalled();
  });

  it('uses stage contracts when evaluating stage guards', () => {
    const service = new RuntimeService(
      {
        loadWorkflow: vi.fn(() => ({ stage: 'discover' })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          stage: 'discover',
          title: 'Session',
          messages: [{ id: 'm1', role: 'user', content: 'need a plan', createdAt: '' }]
        }]),
        loadReviewRounds: vi.fn(() => []),
        readFile: vi.fn(() => '# content'),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        recomputeArtifactGovernance: vi.fn(() => ({ invalidations: [] }))
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: 'role-discover',
            clarify: 'role-discover',
            plan: 'role-discover',
            draft: 'role-discover',
            review: 'role-discover',
            finalize: 'role-discover'
          },
          stageDocuments: {
            discover: [
              { path: 'required.md', title: 'Required', purpose: 'required', promptProfileId: 'prompt-1', validatorId: 'schema-1' },
              { path: 'optional.md', title: 'Optional', purpose: 'optional', promptProfileId: 'prompt-1', validatorId: 'schema-1' }
            ],
            clarify: [],
            plan: [],
            draft: [],
            review: [],
            finalize: []
          },
          stageContracts: {
            discover: {
              stageId: 'discover',
              requiredArtifactPaths: ['required.md'],
              validatorIds: ['schema-1'],
              blockingPolicy: 'all_required',
              allowManualBypass: false
            },
            clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            plan: { stageId: 'plan', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
          },
          review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
          exportMapping: {
            markdown: { enabled: true, artifactPaths: ['required.md'], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
            text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
            pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
            openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
            custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
          }
        })),
        loadArtifactSchemas: vi.fn(() => [{ id: 'schema-1', title: 'schema', kind: 'markdown', requiredHeadings: ['#'] }])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service, 'listRuns').mockReturnValue([
      { id: 'run-1', kind: 'stage', status: 'completed', sessionId: 'session-1', stage: 'discover' }
    ] as never);

    const status = service.evaluateStageGuard('E:/tmp/project', 'session-1', 'discover');

    expect(status.ok).toBe(false);
    expect(status.blockers.some((item) => item.includes('Required'))).toBe(true);
    expect(status.blockers.some((item) => item.includes('Optional'))).toBe(false);
  });

  it('accepts stage evidence produced by another session in the same stage', () => {
    const service = new RuntimeService(
      {
        loadWorkflow: vi.fn(() => ({ stage: 'discover' })),
        loadSessions: vi.fn(() => [
          {
            id: 'session-source',
            stage: 'discover',
            title: 'Source session',
            messages: [{ id: 'm1', role: 'user', content: 'define the project boundary', createdAt: '' }]
          },
          {
            id: 'session-generated-doc',
            stage: 'discover',
            title: 'Generated doc session',
            messages: []
          }
        ]),
        loadReviewRounds: vi.fn(() => []),
        readFile: vi.fn(() => '# 单人公司目标与边界\n\n## 边界\n有效内容。\n'),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        recomputeArtifactGovernance: vi.fn(() => ({ invalidations: [] }))
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: 'role-discover',
            clarify: 'role-discover',
            plan: 'role-discover',
            draft: 'role-discover',
            review: 'role-discover',
            finalize: 'role-discover'
          },
          stageDocuments: {
            discover: [
              { path: 'required.md', title: 'Required', purpose: 'required', promptProfileId: 'prompt-1', validatorId: 'schema-1' }
            ],
            clarify: [],
            plan: [],
            draft: [],
            review: [],
            finalize: []
          },
          stageContracts: {
            discover: {
              stageId: 'discover',
              requiredArtifactPaths: ['required.md'],
              validatorIds: ['schema-1'],
              blockingPolicy: 'all_required',
              allowManualBypass: false
            },
            clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            plan: { stageId: 'plan', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
          },
          review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
          exportMapping: {
            markdown: { enabled: true, artifactPaths: ['required.md'], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
            text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
            pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
            openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
            custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
          }
        })),
        loadArtifactSchemas: vi.fn(() => [{ id: 'schema-1', title: 'schema', kind: 'markdown', requiredHeadings: ['#', '##'] }])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service, 'listRuns').mockReturnValue([
      { id: 'run-1', kind: 'stage', status: 'completed', sessionId: 'session-source', stage: 'discover' }
    ] as never);
    const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    try {
      const status = service.evaluateStageGuard('E:/tmp/project', 'session-generated-doc', 'discover');

      expect(status.ok).toBe(true);
      expect(status.blockers).toEqual([]);
    } finally {
      existsSyncSpy.mockRestore();
    }
  });

  it('marks invalidated required artifacts as stage blockers', () => {
    const service = new RuntimeService(
      {
        loadWorkflow: vi.fn(() => ({ stage: 'plan' })),
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          stage: 'plan',
          title: 'Session',
          messages: [{ id: 'm1', role: 'user', content: 'need a plan', createdAt: '' }]
        }]),
        loadReviewRounds: vi.fn(() => []),
        readFile: vi.fn(() => '# Solution\n\n## Plan\n'),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({ template: { id: 'template-1' } })),
        recomputeArtifactGovernance: vi.fn(() => ({
          invalidations: [{
            status: 'active',
            artifactPath: 'required.md',
            message: 'Upstream brief changed.',
            recommendedNodeIds: ['node-plan']
          }]
        }))
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: 'role-discover',
            clarify: 'role-discover',
            plan: 'role-discover',
            draft: 'role-discover',
            review: 'role-discover',
            finalize: 'role-discover'
          },
          stageDocuments: {
            discover: [],
            clarify: [],
            plan: [
              { path: 'required.md', title: 'Required', purpose: 'required', promptProfileId: 'prompt-1', validatorId: 'schema-1' }
            ],
            draft: [],
            review: [],
            finalize: []
          },
          stageContracts: {
            discover: { stageId: 'discover', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            plan: {
              stageId: 'plan',
              requiredArtifactPaths: ['required.md'],
              validatorIds: ['schema-1'],
              blockingPolicy: 'all_required',
              allowManualBypass: false
            },
            draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
          },
          review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
          exportMapping: {
            markdown: { enabled: true, artifactPaths: ['required.md'], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
            text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
            pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
            openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
            custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
          }
        })),
        loadArtifactSchemas: vi.fn(() => [{ id: 'schema-1', title: 'schema', kind: 'markdown', requiredHeadings: ['#', '##'] }])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service, 'listRuns').mockReturnValue([
      { id: 'run-1', kind: 'stage', status: 'completed', sessionId: 'session-1', stage: 'plan' }
    ] as never);

    const status = service.evaluateStageGuard('E:/tmp/project', 'session-1', 'plan');

    expect(status.ok).toBe(false);
    expect(status.artifacts[0]?.invalidated).toBe(true);
    expect(status.artifacts[0]?.invalidationMessage).toContain('Upstream brief changed.');
    expect(status.artifacts[0]?.recommendedNodeIds).toContain('node-plan');
    expect(status.blockers.some((item) => item.includes('Artifact invalidated: Required'))).toBe(true);
  });

  it('injects recent document changes and document context into chat requests', async () => {
    const role: PlatformRole = {
      id: 'role-discover',
      name: '发现代理',
      description: '',
      promptHint: '负责发现',
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
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          stage: 'discover',
          title: 'Session',
          summary: '',
          pinned: false,
          archived: false,
          messages: []
        }]),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({
          template: { id: 'template-1' },
          roles: [role]
        })),
        buildRecentChangeContext: vi.fn(() => '最近文档变更：\n- 01-requirements/01-原始需求.md [external-change]：变更 2 行'),
        buildDocumentContext: vi.fn(() => '相关文档上下文：\n文档：01-requirements/01-原始需求.md\n# 原始需求')
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: 'role-discover',
            clarify: 'role-discover',
            plan: 'role-discover',
            draft: 'role-discover',
            review: 'role-discover',
            finalize: 'role-discover'
          },
          stageDocuments: {
            discover: [],
            clarify: [],
            plan: [],
            draft: [],
            review: [],
            finalize: []
          },
          stageContracts: {
            discover: { stageId: 'discover', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            plan: { stageId: 'plan', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
            finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
          },
          review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
          exportMapping: {
            markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
            text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
            pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
            openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
            custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
          }
        }))
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    const runRoleLoop = vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: 'AI response',
      selectedProfile: { id: 'profile-1' },
      run: { diagnostics: [] }
    });

    await service.sendMessage(
      'E:/tmp/project',
      {
        sessionId: 'session-1',
        stage: 'discover',
        content: '请继续整理需求',
        contextDocuments: ['E:/tmp/project/01-requirements/01-原始需求.md']
      },
      [],
      'profile-1'
    );

    expect(runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.stringContaining('最近文档变更')
    }));
    expect(runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.stringContaining('相关文档上下文')
    }));
  });

  it('resolves stage chat through execution profiles and injects bundle skills', async () => {
    const role: PlatformRole = {
      id: 'role-discover',
      name: '发现代理',
      description: '',
      promptHint: '负责发现',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const taskTemplate: TaskTemplate = {
      id: 'task-discover',
      name: '发现任务',
      objective: '整理需求',
      inputContract: {},
      outputContract: { format: 'markdown' },
      recommendedSkillIds: ['requirements-completeness-check'],
      requiredCapabilities: ['read_artifact']
    };
    const agentProfile: AgentProfile = {
      id: 'agent-discover',
      name: '发现执行配置',
      roleProfileId: role.id,
      defaultSkillBundle: ['verification-before-completion'],
      capabilityPolicy: {
        allowedCapabilities: ['read_artifact']
      },
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-discover',
        preferredProfileIds: [],
        fallbackToActive: false
      },
      dependencySpec: []
    };

    const service = new RuntimeService(
      {
        loadSessions: vi.fn(() => [{
          id: 'session-1',
          stage: 'discover',
          title: 'Session',
          summary: '',
          pinned: false,
          archived: false,
          messages: []
        }]),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({
          template: { id: 'template-1' },
          roles: [role],
          taskTemplates: [taskTemplate],
          agentProfiles: [agentProfile]
        })),
        buildRecentChangeContext: vi.fn(() => ''),
        buildDocumentContext: vi.fn(() => ''),
        loadProjectSkillIds: vi.fn(() => []),
        loadSessionSkillIds: vi.fn(() => ({ 'session-1': [] }))
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: 'role-discover',
            clarify: 'role-discover',
            plan: 'role-discover',
            draft: 'role-discover',
            review: 'role-discover',
            finalize: 'role-discover'
          },
          stageExecutionProfiles: {
            discover: {
              roleId: role.id,
              taskTemplateId: taskTemplate.id,
              agentProfileId: agentProfile.id
            }
          },
          stageDocuments: {
            discover: [],
            clarify: [],
            plan: [],
            draft: [],
            review: [],
            finalize: []
          },
          review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false }
        }))
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        readSkillInstructions: vi.fn(() => '技能说明')
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    const runRoleLoop = vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: 'AI response',
      selectedProfile: { id: 'profile-1' },
      run: { diagnostics: [] }
    });

    await service.sendMessage(
      'E:/tmp/project',
      {
        sessionId: 'session-1',
        stage: 'discover',
        content: '请继续整理需求',
        contextDocuments: []
      },
      [],
      'profile-1'
    );

    expect(runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      role: expect.objectContaining({
        id: role.id,
        modelPolicy: expect.objectContaining({
          mode: 'fixed',
          fixedProfileId: 'profile-discover'
        }),
        allowedSkillIds: expect.arrayContaining([
          'requirements-completeness-check',
          'verification-before-completion'
        ]),
        allowedCapabilities: expect.arrayContaining(['read_artifact'])
      }),
      system: expect.stringContaining('技能说明')
    }));
  });

  it('resolves review runs through reviewer execution profiles', async () => {
    const blueRole: PlatformRole = {
      id: 'role-blue',
      name: '蓝军',
      description: '',
      promptHint: '蓝军',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const redRole: PlatformRole = {
      id: 'role-red',
      name: '红军',
      description: '',
      promptHint: '红军',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const judgeRole: PlatformRole = {
      id: 'role-judge',
      name: '裁判',
      description: '',
      promptHint: '裁判',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };
    const taskTemplates: TaskTemplate[] = [
      { id: 'task-blue', name: '蓝军任务', objective: '补强', inputContract: {}, outputContract: { format: 'markdown' }, recommendedSkillIds: ['blue-skill'], requiredCapabilities: [] },
      { id: 'task-red', name: '红军任务', objective: '挑刺', inputContract: {}, outputContract: { format: 'markdown' }, recommendedSkillIds: ['red-skill'], requiredCapabilities: [] },
      { id: 'task-judge', name: '裁判任务', objective: '裁决', inputContract: {}, outputContract: { format: 'markdown' }, recommendedSkillIds: ['judge-skill'], requiredCapabilities: [] }
    ];
    const agentProfiles: AgentProfile[] = [
      {
        id: 'agent-blue',
        name: '蓝军执行配置',
        roleProfileId: blueRole.id,
        defaultSkillBundle: [],
        capabilityPolicy: { allowedCapabilities: [] },
        modelPolicy: { mode: 'fixed', fixedProfileId: 'profile-blue', preferredProfileIds: [], fallbackToActive: false },
        dependencySpec: []
      },
      {
        id: 'agent-red',
        name: '红军执行配置',
        roleProfileId: redRole.id,
        defaultSkillBundle: [],
        capabilityPolicy: { allowedCapabilities: [] },
        modelPolicy: { mode: 'fixed', fixedProfileId: 'profile-red', preferredProfileIds: [], fallbackToActive: false },
        dependencySpec: []
      },
      {
        id: 'agent-judge',
        name: '裁判执行配置',
        roleProfileId: judgeRole.id,
        defaultSkillBundle: [],
        capabilityPolicy: { allowedCapabilities: [] },
        modelPolicy: { mode: 'fixed', fixedProfileId: 'profile-judge', preferredProfileIds: [], fallbackToActive: false },
        dependencySpec: []
      }
    ];

    const service = new RuntimeService(
      {
        readFile: vi.fn(() => '# 文档'),
        saveReviewRounds: vi.fn(),
        loadReviewRounds: vi.fn(() => []),
        openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
        loadPlatformAssets: vi.fn(() => ({
          template: { id: 'template-1' },
          roles: [blueRole, redRole, judgeRole],
          taskTemplates,
          agentProfiles
        })),
        loadProjectSkillIds: vi.fn(() => []),
        loadSessionSkillIds: vi.fn(() => ({ 'session-1': [] }))
      } as never,
      {
        loadTemplate: vi.fn(() => ({
          id: 'template-1',
          name: 'Template',
          description: '',
          defaultFlowId: 'flow-1',
          stageRoleIds: {
            discover: blueRole.id,
            clarify: blueRole.id,
            plan: blueRole.id,
            draft: blueRole.id,
            review: judgeRole.id,
            finalize: judgeRole.id
          },
          stageDocuments: {
            discover: [],
            clarify: [],
            plan: [],
            draft: [],
            review: [],
            finalize: []
          },
          review: {
            bluePromptProfileId: 'prompt-blue',
            redPromptProfileId: 'prompt-red',
            judgePromptProfileId: 'prompt-judge',
            validatorId: 'schema-review',
            executionProfiles: {
              blue: { roleId: blueRole.id, taskTemplateId: 'task-blue', agentProfileId: 'agent-blue' },
              red: { roleId: redRole.id, taskTemplateId: 'task-red', agentProfileId: 'agent-red' },
              judge: { roleId: judgeRole.id, taskTemplateId: 'task-judge', agentProfileId: 'agent-judge' }
            }
          },
          exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false }
        })),
        loadPromptProfiles: vi.fn(() => [
          { id: 'prompt-blue', name: 'Blue', description: '', systemPrompt: 'blue prompt', outputMode: 'markdown', outputSchema: 'review-issues' },
          { id: 'prompt-red', name: 'Red', description: '', systemPrompt: 'red prompt', outputMode: 'markdown', outputSchema: 'review-issues' },
          { id: 'prompt-judge', name: 'Judge', description: '', systemPrompt: 'judge prompt', outputMode: 'markdown', outputSchema: 'review-issues' }
        ]),
        loadArtifactSchemas: vi.fn(() => [{ id: 'schema-review', title: 'schema', kind: 'review-issues' }])
      } as never,
      {} as never,
      {
        coerceMarkdown: vi.fn(async () => ({
          content: '- issue',
          outputs: [],
          qualityTier: 'standard',
          qualityScore: 90,
          qualityReasons: [],
          verdict: 'pass',
          accepted: true,
          repaired: false,
          usedDeterministicFallback: false,
          message: ''
        }))
      } as never,
      {
        readSkillInstructions: vi.fn(() => '')
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    vi.spyOn(service as any, 'saveRunState').mockImplementation(() => undefined);
    const runRoleLoop = vi.spyOn(service as any, 'runRoleLoop')
      .mockResolvedValueOnce({ finalText: 'blue output', run: { diagnostics: [], outputs: [] }, selectedProfile: { id: 'profile-blue' } })
      .mockResolvedValueOnce({ finalText: 'red output', run: { diagnostics: [], outputs: [] }, selectedProfile: { id: 'profile-red' } })
      .mockResolvedValueOnce({ finalText: 'judge output', run: { diagnostics: [], outputs: [] }, selectedProfile: { id: 'profile-judge' } });

    await service.runReviewRound('E:/tmp/project', 'session-1', 'E:/tmp/project/doc.md', [], 'profile-active');

    expect(runRoleLoop).toHaveBeenNthCalledWith(1, expect.objectContaining({
      role: expect.objectContaining({
        id: blueRole.id,
        modelPolicy: expect.objectContaining({ fixedProfileId: 'profile-blue' }),
        allowedSkillIds: expect.arrayContaining(['blue-skill'])
      })
    }));
    expect(runRoleLoop).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: expect.objectContaining({
        id: redRole.id,
        modelPolicy: expect.objectContaining({ fixedProfileId: 'profile-red' }),
        allowedSkillIds: expect.arrayContaining(['red-skill'])
      })
    }));
    expect(runRoleLoop).toHaveBeenNthCalledWith(3, expect.objectContaining({
      role: expect.objectContaining({
        id: judgeRole.id,
        modelPolicy: expect.objectContaining({ fixedProfileId: 'profile-judge' }),
        allowedSkillIds: expect.arrayContaining(['judge-skill'])
      })
    }));
  });
});
