import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import type { AgentProfile, PlatformRole, RuntimeRun, TaskTemplate } from '../../src/shared/types.js';

function createRole(): PlatformRole {
  return {
    id: 'role-planner',
    name: 'Planner',
    description: '',
    promptHint: 'Plan the next step',
    allowedCapabilities: [],
    outputSchema: 'markdown',
    modelPolicy: {
      mode: 'fallback_to_active',
      preferredProfileIds: [],
      fallbackToActive: true
    }
  };
}

function createService(overrides?: {
  getRun?: (runId: string) => RuntimeRun | null;
  loadPlatformAssets?: () => { roles: PlatformRole[]; taskTemplates?: TaskTemplate[]; agentProfiles?: AgentProfile[] };
}) {
  const runtimeAssets = {
    getRun: vi.fn((rootPath: string, runId: string) => overrides?.getRun?.(runId) ?? null),
    saveRun: vi.fn(),
    appendEvent: vi.fn(),
    listEvents: vi.fn(() => [])
  };
  const projectService = {
    openProject: vi.fn(() => ({ manifest: { templateId: 'template-1', name: 'Project' } })),
    loadPlatformAssets: vi.fn(() => overrides?.loadPlatformAssets?.() ?? {
      roles: [createRole()],
      taskTemplates: [],
      agentProfiles: []
    })
  };
  const service = new RuntimeService(
    projectService as never,
    runtimeAssets as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  vi.spyOn(service, 'ensureProjectRuntime').mockImplementation(() => undefined);
  vi.spyOn(service, 'listRunEvents').mockReturnValue([]);
  return { service, runtimeAssets, projectService };
}

describe('RuntimeService controls', () => {
  it('marks a running run as pause-requested and records the event', () => {
    const runningRun = {
      id: 'run-pause',
      kind: 'chat',
      status: 'running',
      sessionId: 'session-1',
      stage: 'discover',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      checkpoints: [],
      outputs: []
    } as unknown as RuntimeRun;
    const { service, runtimeAssets } = createService({
      getRun: () => runningRun
    });

    const result = service.pauseRun('E:/tmp/project', runningRun.id);

    expect(result.run).toBe(runningRun);
    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: runningRun.id,
      status: 'pause-requested',
      diagnostics: expect.arrayContaining(['pause_requested: Waiting for the next safe checkpoint boundary.'])
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      runId: runningRun.id,
      type: 'run.pause-requested'
    }));
  });

  it('marks a running run as stop-requested and records the event', () => {
    const runningRun = {
      id: 'run-running',
      kind: 'chat',
      status: 'running',
      sessionId: 'session-1',
      stage: 'discover',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      checkpoints: [],
      outputs: []
    } as unknown as RuntimeRun;
    const { service, runtimeAssets } = createService({
      getRun: () => runningRun
    });

    const result = service.stopRun('E:/tmp/project', runningRun.id);

    expect(result.run).toBe(runningRun);
    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: runningRun.id,
      diagnostics: expect.arrayContaining(['cancelled_error: Stop requested by user.'])
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      runId: runningRun.id,
      type: 'run.stop-requested'
    }));
  });

  it('rejects stop for a completed run with no legal stop action', () => {
    const completedRun = {
      id: 'run-completed',
      kind: 'chat',
      status: 'completed',
      sessionId: 'session-1',
      stage: 'discover',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      checkpoints: [],
      outputs: []
    } as unknown as RuntimeRun;
    const { service } = createService({
      getRun: () => completedRun
    });

    expect(() => service.stopRun('E:/tmp/project', completedRun.id)).toThrow(/does not allow action "stop"/);
  });

  it('retries a resumable run through runRoleLoop and returns the new run', async () => {
    const sourceRun = {
      id: 'run-failed',
      kind: 'chat',
      status: 'failed',
      sessionId: 'session-1',
      stage: 'discover',
      createdAt: '2026-04-15T00:00:00.000Z',
      roleId: 'role-planner',
      contextPackId: 'ctx-1',
      updatedAt: '2026-04-15T00:00:00.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      checkpoints: [],
      outputs: [],
      resumeContext: {
        system: 'system prompt',
        user: 'user prompt',
        allowedCapabilities: []
      }
    } as unknown as RuntimeRun;
    const selectedProfile = {
      id: 'profile-1',
      name: 'Local',
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
        tags: ['structured-output'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'medium'
      }
    };
    const { service, runtimeAssets } = createService({
      getRun: () => sourceRun
    });
    const nextRun = {
      id: 'run-retried',
      kind: 'chat',
      status: 'running',
      createdAt: '2026-04-15T00:00:01.000Z',
      updatedAt: '2026-04-15T00:00:01.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: []
    } as RuntimeRun;
    vi.spyOn(service as never, 'runRoleLoop').mockResolvedValue({
      run: nextRun,
      selectedProfile,
      finalText: 'done'
    } as never);

    const result = await service.retryRun('E:/tmp/project', sourceRun.id, [selectedProfile] as never, selectedProfile.id);

    expect(runtimeAssets.saveRun).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      id: sourceRun.id,
      diagnostics: expect.arrayContaining(['retry requested'])
    }));
    expect(runtimeAssets.appendEvent).toHaveBeenCalledWith('E:/tmp/project', expect.objectContaining({
      runId: sourceRun.id,
      type: 'run.retry-requested'
    }));
    expect((service as any).runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: 'E:/tmp/project',
      resumedFromRunId: sourceRun.id,
      user: sourceRun.resumeContext!.user,
      system: sourceRun.resumeContext!.system
    }));
    expect(result.run).toBe(nextRun);
  });

  it('keeps legacy role fallback available for retry even when split execution assets exist', async () => {
    const role: PlatformRole = {
      ...createRole(),
      allowedSkillIds: ['legacy-skill'],
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-legacy',
        preferredProfileIds: [],
        fallbackToActive: false
      }
    };
    const sourceRun = {
      id: 'run-failed-legacy',
      kind: 'chat',
      status: 'failed',
      sessionId: 'session-1',
      stage: 'discover',
      createdAt: '2026-04-15T00:00:00.000Z',
      roleId: role.id,
      contextPackId: 'ctx-1',
      updatedAt: '2026-04-15T00:00:00.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      checkpoints: [],
      outputs: [],
      resumeContext: {
        system: 'system prompt',
        user: 'user prompt',
        allowedCapabilities: []
      }
    } as unknown as RuntimeRun;
    const selectedProfile = {
      id: 'profile-legacy',
      name: 'Local',
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
        tags: ['structured-output'],
        maxContextTokens: 32000,
        privacy: 'local',
        costTier: 'low',
        latencyTier: 'medium'
      }
    };
    const taskTemplate: TaskTemplate = {
      id: 'task-discover',
      name: '发现任务',
      objective: '发现',
      inputContract: {},
      outputContract: { format: 'markdown' },
      recommendedSkillIds: ['task-skill'],
      requiredCapabilities: []
    };
    const agentProfile: AgentProfile = {
      id: 'agent-discover',
      name: '发现执行配置',
      roleProfileId: role.id,
      defaultSkillBundle: ['agent-skill'],
      capabilityPolicy: { allowedCapabilities: [] },
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-agent',
        preferredProfileIds: [],
        fallbackToActive: false
      },
      dependencySpec: []
    };
    const { service } = createService({
      getRun: () => sourceRun,
      loadPlatformAssets: () => ({
        roles: [role],
        taskTemplates: [taskTemplate],
        agentProfiles: [agentProfile]
      })
    });
    const nextRun = {
      id: 'run-retried-legacy',
      kind: 'chat',
      status: 'running',
      createdAt: '2026-04-15T00:00:01.000Z',
      updatedAt: '2026-04-15T00:00:01.000Z',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: []
    } as RuntimeRun;
    vi.spyOn(service as never, 'runRoleLoop').mockResolvedValue({
      run: nextRun,
      selectedProfile,
      finalText: 'done'
    } as never);

    await service.retryRun('E:/tmp/project', sourceRun.id, [selectedProfile] as never, selectedProfile.id);

    expect((service as any).runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      role: expect.objectContaining({
        id: role.id,
        allowedSkillIds: expect.arrayContaining(['legacy-skill']),
        modelPolicy: expect.objectContaining({
          fixedProfileId: 'profile-legacy'
        })
      })
    }));
  });
});
