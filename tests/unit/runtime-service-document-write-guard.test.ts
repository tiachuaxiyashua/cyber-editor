import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PlatformRole, RuntimeTemplateAsset } from '../../src/shared/types.js';
import { RuntimeService } from '../../src/main/services/runtime-service.js';

describe('RuntimeService document write guard', () => {
  it('stages a pending write instead of overwriting a recently human-edited stage document', async () => {
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
          purpose: '沉淀需求',
          promptProfileId: 'prompt-1',
          validatorId: 'schema-1'
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
      review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
      exportProfile: { markdown: true, text: false, pdf: false, openspec: false, custom: false },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'exports/markdown', fileNamePattern: 'x.md', transformProfile: 'markdown' },
        text: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/text', fileNamePattern: 'x.txt', transformProfile: 'text' },
        pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/pdf', fileNamePattern: 'x.pdf', transformProfile: 'pdf' },
        openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/openspec', fileNamePattern: 'openspec', transformProfile: 'openspec' },
        custom: { enabled: false, artifactPaths: [], outputPathPattern: 'exports/custom', fileNamePattern: 'x.out', transformProfile: 'copy' }
      }
    };

    const saveFile = vi.fn();
    const previewRuntimeDocumentWrite = vi.fn(() => ({
      id: 'proposal-1',
      filePath: 'E:/tmp/project/01-requirements/01-原始需求.md',
      title: '原始需求',
      sourceLabel: '原始需求',
      createdAt: new Date().toISOString(),
      status: 'pending',
      hasConflicts: true,
      changeSummary: 'summary',
      proposedContent: '# AI',
      chunks: []
    }));

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
        productIntent: '',
        constraints: [],
        decisions: [],
        openQuestions: [],
        updatedAt: new Date().toISOString()
      })),
      loadWorkflow: vi.fn(() => ({
        stage: 'discover',
        confirmedStages: [],
        activeDocumentPath: path.join('E:/tmp/project', '01-requirements', '01-原始需求.md')
      })),
      saveAgentMemory: vi.fn(),
      saveWorkflow: vi.fn(),
      loadProjectSkillIds: vi.fn(() => []),
      loadSessionSkillIds: vi.fn(() => ({})),
      buildRecentChangeContext: vi.fn(() => ''),
      buildDocumentContext: vi.fn(() => ''),
      previewRuntimeDocumentWrite,
      saveFile
    };

    const runtimeAssets = {
      ensureProjectRuntime: vi.fn(),
      loadTemplate: vi.fn(() => template),
      loadPromptProfiles: vi.fn(() => [{ id: 'prompt-1', name: 'prompt', description: '', systemPrompt: 'system', outputMode: 'markdown', outputSchema: 'markdown' }]),
      loadArtifactSchemas: vi.fn(() => [{ id: 'schema-1', title: 'schema', kind: 'markdown', requiredHeadings: ['#'] }]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => ({
        content: '# AI\n\n提议版本\n',
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
    const runRoleLoopSpy = vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: '# AI\n\n提议版本\n',
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

    expect(previewRuntimeDocumentWrite).toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      status: 'merge-required',
      mergeProposalIds: expect.arrayContaining(['proposal-1']),
      diagnostics: expect.arrayContaining(['pending-document-write:proposal-1'])
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      type: 'merge.required'
    }));
    expect(projectService.buildDocumentContext).toHaveBeenCalledWith('E:/tmp/project', []);
    expect(runRoleLoopSpy).toHaveBeenCalledWith(expect.objectContaining({
      contextDocumentPaths: []
    }));
  });

  it('persists a failed stage run when structured repair aborts after model output', async () => {
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
          purpose: '沉淀需求',
          promptProfileId: 'prompt-1',
          validatorId: 'schema-1'
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
      review: { bluePromptProfileId: 'prompt-1', redPromptProfileId: 'prompt-1', judgePromptProfileId: 'prompt-1', validatorId: 'schema-1' },
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
        productIntent: '',
        constraints: [],
        decisions: [],
        openQuestions: [],
        updatedAt: new Date().toISOString()
      })),
      loadWorkflow: vi.fn(() => ({
        stage: 'discover',
        confirmedStages: [],
        activeDocumentPath: path.join('E:/tmp/project', '01-requirements', '01-原始需求.md')
      })),
      saveAgentMemory: vi.fn(),
      saveWorkflow: vi.fn(),
      loadProjectSkillIds: vi.fn(() => []),
      loadSessionSkillIds: vi.fn(() => ({})),
      buildRecentChangeContext: vi.fn(() => ''),
      buildDocumentContext: vi.fn(() => ''),
      saveFile: vi.fn()
    };

    const runtimeAssets = {
      ensureProjectRuntime: vi.fn(),
      loadTemplate: vi.fn(() => template),
      loadPromptProfiles: vi.fn(() => [{ id: 'prompt-1', name: 'prompt', description: '', systemPrompt: 'system', outputMode: 'markdown', outputSchema: 'markdown' }]),
      loadArtifactSchemas: vi.fn(() => [{ id: 'schema-1', title: 'schema', kind: 'markdown', requiredHeadings: ['#'] }]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => {
        throw new Error('Structured generation repair failed: quality score 82 below minimum 90');
      })
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
    vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: '# 执行 SOP 与治理清单\n\n有效但待校验内容\n',
      selectedProfile: { id: 'profile-1', provider: 'mock', baseUrl: '', model: 'mock', apiKey: '' },
      run: {
        id: 'run-1',
        kind: 'stage',
        status: 'completed',
        outputs: [
          {
            id: 'out-1',
            createdAt: new Date().toISOString(),
            kind: 'raw',
            label: 'turn-1-raw',
            contentType: 'text',
            content: '# 执行 SOP 与治理清单\n\n有效但待校验内容\n'
          }
        ],
        checkpoints: [],
        diagnostics: [],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        updatedAt: new Date().toISOString()
      }
    });

    await expect(service.generateStageDraft('E:/tmp/project', 'session-1', [], 'profile-1')).rejects.toThrow(/Structured generation repair failed/);

    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: 'run-1',
      status: 'failed',
      errorMessage: expect.stringContaining('Structured generation repair failed')
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      type: 'run.failed'
    }));
  });

  it('stops stage generation immediately after a blocked artifact instead of continuing to later documents', async () => {
    const role: PlatformRole = {
      id: 'role-plan',
      name: '方案代理',
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

    const template: RuntimeTemplateAsset = {
      id: 'template-1',
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
        plan: [
          {
            path: '01-requirements/04-功能清单.md',
            title: '功能清单',
            purpose: '列出原子功能。',
            promptProfileId: 'prompt-1',
            validatorId: 'schema-1'
          },
          {
            path: '02-solution/01-技术方案.md',
            title: '技术方案',
            purpose: '输出技术方案。',
            promptProfileId: 'prompt-1',
            validatorId: 'schema-1'
          }
        ],
        draft: [],
        review: [],
        finalize: []
      },
      stageContracts: {
        discover: { stageId: 'discover', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        plan: { stageId: 'plan', requiredArtifactPaths: ['01-requirements/04-功能清单.md', '02-solution/01-技术方案.md'], validatorIds: ['schema-1'], blockingPolicy: 'all_required', allowManualBypass: false },
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
    };

    const saveFile = vi.fn();
    const projectService = {
      loadSessions: vi.fn(() => [{
        id: 'session-1',
        stage: 'plan',
        title: 'Session',
        summary: '',
        pinned: false,
        archived: false,
        messages: [{ role: 'user', content: '请继续方案规划' }]
      }]),
      openProject: vi.fn(() => ({ manifest: { templateId: 'template-1' } })),
      loadPlatformAssets: vi.fn(() => ({
        template: { id: 'template-1' },
        roles: [role]
      })),
      loadAgentMemory: vi.fn(() => ({
        productIntent: '沉淀内容工作台',
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
      saveFile
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
        outputSchema: 'schema-1'
      }]),
      loadArtifactSchemas: vi.fn(() => [{
        id: 'schema-1',
        title: 'schema',
        kind: 'markdown',
        requiredHeadings: ['#', '##']
      }]),
      saveRun: vi.fn(),
      appendEvent: vi.fn()
    };

    const structuredGeneration = {
      coerceMarkdown: vi.fn(async () => ({
        content: '# 功能清单\n\n## 占位\n\n- bad\n',
        outputs: [],
        repaired: true,
        accepted: false,
        qualityTier: 'strict',
        qualityScore: 17,
        qualityReasons: ['length 184 below target 600'],
        verdict: 'blocked',
        usedDeterministicFallback: true,
        message: 'length 184 below target 600'
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
    const runRoleLoopSpy = vi.spyOn(service as any, 'runRoleLoop').mockResolvedValue({
      finalText: '# 功能清单\n\n## 占位\n\n- bad\n',
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

    await expect(service.generateStageDraft('E:/tmp/project', 'session-1', [], 'profile-1')).rejects.toThrow(/功能清单|length 184 below target 600/);

    expect(runRoleLoopSpy).toHaveBeenCalledTimes(1);
    expect(structuredGeneration.coerceMarkdown).toHaveBeenCalledTimes(1);
    expect(saveFile).not.toHaveBeenCalled();
    expect(projectService.saveWorkflow).not.toHaveBeenCalled();
    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: 'run-1',
      status: 'failed',
      errorMessage: expect.stringContaining('length 184 below target 600')
    }));
  });
});
