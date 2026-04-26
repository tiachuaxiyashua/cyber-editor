import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ArtifactSchemaAsset, PlatformRole, RuntimeTemplateAsset } from '../../src/shared/types.js';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('RuntimeService stage artifact guidance', () => {
  it('injects artifact path, heading contract, and quality bar into stage generation prompts', async () => {
    const role: PlatformRole = {
      id: 'role-discover',
      name: '需求梳理员',
      description: '',
      promptHint: '负责需求梳理',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const schema: ArtifactSchemaAsset = {
      id: 'requirements-discovery',
      title: '原始需求',
      kind: 'markdown',
      requiredHeadings: ['# 原始需求', '## 目标用户', '## 核心问题', '## 核心价值', '## 显性限制', '## 待确认问题'],
      minimumLength: 560,
      qualityTier: 'strict',
      minimumQualityScore: 90
    };

    const template: RuntimeTemplateAsset = {
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
        discover: [{
          path: '01-requirements/01-原始需求.md',
          title: '原始需求',
          purpose: '沉淀原始需求。',
          promptProfileId: 'prompt-1',
          validatorId: 'requirements-discovery',
          qualityTier: 'strict',
          minimumQualityScore: 90
        }],
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
      review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'requirements-discovery' },
      exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
        text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
        pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
        openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
        custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
      }
    };

    const projectService = {
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
      loadAgentMemory: vi.fn(() => ({
        productIntent: '沉淀一套桌面端内容生产工作台',
        constraints: ['只做本地桌面端', '联网功能先不做'],
        decisions: [],
        openQuestions: [],
        updatedAt: new Date().toISOString()
      })),
      loadWorkflow: vi.fn(() => ({
        stage: 'discover',
        confirmedStages: [],
        activeDocumentPath: path.join('E:/tmp/project', 'notes.md')
      })),
      saveAgentMemory: vi.fn(),
      saveWorkflow: vi.fn(),
      loadProjectSkillIds: vi.fn(() => []),
      loadSessionSkillIds: vi.fn(() => ({})),
      buildRecentChangeContext: vi.fn(() => ''),
      buildDocumentContext: vi.fn(() => ''),
      previewRuntimeDocumentWrite: vi.fn(() => null),
      saveFile: vi.fn()
    };

    const runtimeAssets = {
      ensureProjectRuntime: vi.fn(),
      loadTemplate: vi.fn(() => template),
      loadPromptProfiles: vi.fn(() => [{
        id: 'prompt-1',
        name: 'prompt',
        description: '',
        systemPrompt: 'system',
        outputMode: 'markdown',
        outputSchema: 'requirements-discovery'
      }]),
      loadArtifactSchemas: vi.fn(() => [schema]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => ({
        content: '# 原始需求\n\n## 目标用户\n- A\n- B\n\n## 核心问题\n- C\n- D\n\n## 核心价值\n- E\n- F\n\n## 显性限制\n- G\n- H\n\n## 待确认问题\n- I\n- J\n',
        outputs: [],
        repaired: false,
        accepted: true,
        qualityTier: 'strict',
        qualityScore: 92,
        qualityReasons: [],
        verdict: 'validated',
        usedDeterministicFallback: false
      }))
    };

    const service = new RuntimeService(
      projectService as never,
      runtimeAssets as never,
      {} as never,
      structuredGeneration as never,
      {} as never,
      { readSkillInstructions: vi.fn(() => '') } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    const runRoleLoopSpy = vi.spyOn(service as never, 'runRoleLoop' as never).mockResolvedValue({
      finalText: '# raw',
      selectedProfile: { id: 'profile-1', provider: 'mock', baseUrl: '', model: 'mock', apiKey: '' },
      run: {
        id: 'run-1',
        kind: 'stage',
        status: 'completed',
        outputs: [],
        checkpoints: [],
        diagnostics: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        updatedAt: new Date().toISOString()
      }
    });

    await service.generateStageDraft('E:/tmp/project', 'session-1', [], 'profile-1');

    const runRoleLoopInput = runRoleLoopSpy.mock.calls[0]?.[0] as { system: string; user: string };
    expect(runRoleLoopInput.system).toContain('工件路径');
    expect(runRoleLoopInput.system).toContain('01-requirements/01-原始需求.md');
    expect(runRoleLoopInput.system).toContain('最低质量分');
    expect(runRoleLoopInput.system).toContain('# 原始需求');

    const coerceInput = structuredGeneration.coerceMarkdown.mock.calls[0] as unknown as [unknown, { system: string; user: string }];
    expect(coerceInput[1].user).toContain('工件路径');
    expect(coerceInput[1].user).toContain('最低质量分');
    expect(coerceInput[1].user).toContain('## 目标用户');
  });

  it('formats generic heading contracts and resolved default quality bars in stage prompts', async () => {
    const role: PlatformRole = {
      id: 'role-plan',
      name: '方案规划员',
      description: '',
      promptHint: '负责方案规划',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const schema: ArtifactSchemaAsset = {
      id: 'feature-list',
      title: '功能清单',
      kind: 'markdown',
      requiredHeadings: ['#', '##']
    };

    const template: RuntimeTemplateAsset = {
      id: 'template-plan',
      name: 'Template',
      description: '',
      defaultFlowId: 'flow-1',
      stageRoleIds: {
        discover: 'role-plan',
        clarify: 'role-plan',
        plan: 'role-plan',
        draft: 'role-plan',
        review: 'role-plan',
        finalize: 'role-plan'
      },
      stageDocuments: {
        discover: [],
        clarify: [],
        plan: [{
          path: '01-requirements/04-功能清单.md',
          title: '功能清单',
          purpose: '列出原子功能、依赖和完成标准。',
          promptProfileId: 'prompt-plan',
          validatorId: 'feature-list'
        }],
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
      review: { bluePromptProfileId: 'prompt-plan', redPromptProfileId: 'prompt-plan', judgePromptProfileId: 'prompt-plan', validatorId: 'feature-list' },
      exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
        text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
        pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
        openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
        custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
      }
    };

    const projectService = {
      loadSessions: vi.fn(() => [{
        id: 'session-1',
        stage: 'plan',
        title: 'Session',
        summary: '',
        pinned: false,
        archived: false,
        messages: [{ role: 'user', content: '继续拆功能清单' }]
      }]),
      openProject: vi.fn(() => ({ manifest: { templateId: 'template-plan' } })),
      loadPlatformAssets: vi.fn(() => ({
        template: { id: 'template-plan' },
        roles: [role]
      })),
      loadAgentMemory: vi.fn(() => ({
        productIntent: '沉淀编排工作流与交付基线',
        constraints: [],
        decisions: [],
        openQuestions: [],
        updatedAt: new Date().toISOString()
      })),
      loadWorkflow: vi.fn(() => ({
        stage: 'plan',
        confirmedStages: ['discover', 'clarify'],
        activeDocumentPath: path.join('E:/tmp/project', '01-requirements', '03-功能树.md')
      })),
      saveAgentMemory: vi.fn(),
      saveWorkflow: vi.fn(),
      loadProjectSkillIds: vi.fn(() => []),
      loadSessionSkillIds: vi.fn(() => ({})),
      buildRecentChangeContext: vi.fn(() => ''),
      buildDocumentContext: vi.fn(() => ''),
      previewRuntimeDocumentWrite: vi.fn(() => null),
      saveFile: vi.fn()
    };

    const runtimeAssets = {
      ensureProjectRuntime: vi.fn(),
      loadTemplate: vi.fn(() => template),
      loadPromptProfiles: vi.fn(() => [{
        id: 'prompt-plan',
        name: 'prompt',
        description: '',
        systemPrompt: 'system',
        outputMode: 'markdown',
        outputSchema: 'feature-list'
      }]),
      loadArtifactSchemas: vi.fn(() => [schema]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => ({
        content: '# 功能清单\n\n## 输入阶段\n- 生成成功\n',
        outputs: [],
        repaired: false,
        accepted: true,
        qualityTier: 'strict',
        qualityScore: 88,
        qualityReasons: [],
        verdict: 'validated',
        usedDeterministicFallback: false
      }))
    };

    const service = new RuntimeService(
      projectService as never,
      runtimeAssets as never,
      {} as never,
      structuredGeneration as never,
      {} as never,
      { readSkillInstructions: vi.fn(() => '') } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    const runRoleLoopSpy = vi.spyOn(service as never, 'runRoleLoop' as never).mockResolvedValue({
      finalText: '# 功能清单\n\n## 输入阶段\n- 生成成功\n',
      selectedProfile: { id: 'profile-1', provider: 'mock', baseUrl: '', model: 'mock', apiKey: '' },
      run: {
        id: 'run-1',
        kind: 'stage',
        status: 'completed',
        outputs: [],
        checkpoints: [],
        diagnostics: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        updatedAt: new Date().toISOString()
      }
    });

    await service.generateStageDraft('E:/tmp/project', 'session-1', [], 'profile-1');

    const runRoleLoopInput = runRoleLoopSpy.mock.calls[0]?.[0] as { system: string };
    expect(runRoleLoopInput.system).toContain('最低质量分：74');
    expect(runRoleLoopInput.system).toContain('标题结构：至少包含 1 个一级标题和 1 个二级标题');
    expect(runRoleLoopInput.system).not.toContain('必须包含标题：# ｜ ##');
  });

  it('injects the latest review round issues into review-stage generation prompts', async () => {
    const role: PlatformRole = {
      id: 'role-review',
      name: 'Review role',
      description: '',
      promptHint: 'Resolve review blockers.',
      allowedCapabilities: [],
      outputSchema: 'markdown',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    };

    const schema: ArtifactSchemaAsset = {
      id: 'markdown-basic',
      title: 'Markdown artifact',
      kind: 'markdown',
      requiredHeadings: ['# Review'],
      minimumLength: 200,
      qualityTier: 'strict',
      minimumQualityScore: 90
    };

    const template: RuntimeTemplateAsset = {
      id: 'template-review',
      name: 'Template',
      description: '',
      defaultFlowId: 'flow-1',
      stageRoleIds: {
        discover: 'role-review',
        clarify: 'role-review',
        plan: 'role-review',
        draft: 'role-review',
        review: 'role-review',
        finalize: 'role-review'
      },
      stageDocuments: {
        discover: [],
        clarify: [],
        plan: [],
        draft: [{
          path: '02-solution/02-execution.md',
          title: 'Execution SOP',
          purpose: 'Execution SOP',
          promptProfileId: 'prompt-review',
          validatorId: 'markdown-basic',
          qualityTier: 'strict',
          minimumQualityScore: 90
        }],
        review: [{
          path: '02-solution/03-review.md',
          title: 'Risk review',
          purpose: 'Resolve review blockers and produce the review artifact.',
          promptProfileId: 'prompt-review',
          validatorId: 'markdown-basic',
          qualityTier: 'strict',
          minimumQualityScore: 90
        }],
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
      review: { bluePromptProfileId: 'prompt-review', redPromptProfileId: 'prompt-review', judgePromptProfileId: 'prompt-review', validatorId: 'markdown-basic' },
      exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
        text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
        pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
        openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
        custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
      }
    };

    const rootPath = 'E:/tmp/project';
    const reviewDocumentPath = path.join(rootPath, '02-solution', '02-execution.md');
    const projectService = {
      loadSessions: vi.fn(() => [{
        id: 'session-review',
        stage: 'review',
        title: 'Review Session',
        summary: '',
        pinned: false,
        archived: false,
        messages: []
      }]),
      loadReviewRounds: vi.fn(() => [{
        id: 'round-1',
        sessionId: 'session-review',
        stage: 'review',
        documentPath: reviewDocumentPath,
        createdAt: new Date().toISOString(),
        status: 'completed',
        blueOutput: '',
        redFeedback: '',
        summary: 'Judge requests executable acceptance criteria.',
        diagnostics: ['Used fallback provider selection.'],
        issues: [{
          id: 'review-1',
          title: 'Missing executable check contract',
          detail: 'Need authorized_roles.json template and explicit verification steps.',
          state: 'pending' as const
        }]
      }]),
      openProject: vi.fn(() => ({ manifest: { templateId: 'template-review' } })),
      loadPlatformAssets: vi.fn(() => ({
        template: { id: 'template-review' },
        roles: [role]
      })),
      loadAgentMemory: vi.fn(() => ({
        productIntent: 'Build a reproducible solo-company operating system.',
        constraints: ['Desktop only'],
        decisions: [],
        openQuestions: [],
        updatedAt: new Date().toISOString()
      })),
      loadWorkflow: vi.fn(() => ({
        stage: 'review',
        confirmedStages: ['discover', 'clarify', 'plan', 'draft'],
        activeDocumentPath: path.join(rootPath, '02-solution', '03-review.md')
      })),
      saveAgentMemory: vi.fn(),
      saveWorkflow: vi.fn(),
      loadProjectSkillIds: vi.fn(() => []),
      loadSessionSkillIds: vi.fn(() => ({})),
      buildRecentChangeContext: vi.fn(() => ''),
      buildDocumentContext: vi.fn(() => ''),
      previewRuntimeDocumentWrite: vi.fn(() => null),
      saveFile: vi.fn()
    };

    const runtimeAssets = {
      ensureProjectRuntime: vi.fn(),
      loadTemplate: vi.fn(() => template),
      loadPromptProfiles: vi.fn(() => [{
        id: 'prompt-review',
        name: 'prompt',
        description: '',
        systemPrompt: 'system',
        outputMode: 'markdown',
        outputSchema: 'markdown-basic'
      }]),
      loadArtifactSchemas: vi.fn(() => [schema]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => ({
        content: '# Review\n\nResolved review issues with executable criteria.\n',
        outputs: [],
        repaired: false,
        accepted: true,
        qualityTier: 'strict',
        qualityScore: 92,
        qualityReasons: [],
        verdict: 'validated',
        usedDeterministicFallback: false
      }))
    };

    const service = new RuntimeService(
      projectService as never,
      runtimeAssets as never,
      {} as never,
      structuredGeneration as never,
      {} as never,
      { readSkillInstructions: vi.fn(() => '') } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    );

    vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
    const runRoleLoopSpy = vi.spyOn(service as never, 'runRoleLoop' as never).mockResolvedValue({
      finalText: '# raw',
      selectedProfile: { id: 'profile-1', provider: 'mock', baseUrl: '', model: 'mock', apiKey: '' },
      run: {
        id: 'run-1',
        kind: 'stage',
        status: 'completed',
        outputs: [],
        checkpoints: [],
        diagnostics: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        updatedAt: new Date().toISOString()
      }
    });

    await service.generateStageDraft(rootPath, 'session-review', [], 'profile-1');

    const runRoleLoopInput = runRoleLoopSpy.mock.calls[0]?.[0] as { user: string };
    expect(runRoleLoopInput.user).toContain('Latest review round that must be addressed before stage confirmation');
    expect(runRoleLoopInput.user).toContain('02-solution/02-execution.md');
    expect(runRoleLoopInput.user).toContain('Missing executable check contract');
    expect(runRoleLoopInput.user).toContain('authorized_roles.json');

    const coerceInput = structuredGeneration.coerceMarkdown.mock.calls[0] as unknown as [unknown, { user: string }];
    expect(coerceInput[1].user).toContain('Latest review round that must be addressed before stage confirmation');
    expect(coerceInput[1].user).toContain('authorized_roles.json');
  });
});
