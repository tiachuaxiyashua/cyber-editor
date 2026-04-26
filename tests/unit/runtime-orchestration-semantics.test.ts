import { describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import type {
  AgentProfile,
  PlatformFlowAsset,
  PlatformRole,
  RuntimeRun,
  TaskTemplate,
  RuntimeTemplateAsset
} from '../../src/shared/types.js';
import { validatePlatformFlow } from '../../src/shared/flow-validator.js';

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

function createTemplate(): RuntimeTemplateAsset {
  return {
    id: 'template-1',
    name: 'Template',
    description: '',
    stageRoleIds: {
      discover: 'role-planner',
      clarify: 'role-planner',
      plan: 'role-planner',
      draft: 'role-planner',
      review: 'role-planner',
      finalize: 'role-planner'
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
      bluePromptProfileId: 'blue',
      redPromptProfileId: 'red',
      judgePromptProfileId: 'judge',
      validatorId: 'validator'
    },
    exportProfile: {
      markdown: true,
      text: true,
      pdf: false,
      openspec: false,
      custom: false
    }
  };
}

function createFlow(nodes: PlatformFlowAsset['nodes'], edges: PlatformFlowAsset['edges']): PlatformFlowAsset {
  return {
    id: 'flow-1',
    name: 'Flow',
    description: '',
    kind: 'flow',
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    nodes,
    edges
  };
}

function createService(
  flow: PlatformFlowAsset,
  options?: {
    subflows?: PlatformFlowAsset[];
    taskTemplates?: TaskTemplate[];
    agentProfiles?: AgentProfile[];
    listArtifactInvalidations?: () => Array<{ artifactPath: string; recommendedNodeIds?: string[] }>;
    createSnapshot?: (rootPath: string, label: string) => { id: string; label: string; createdAt: string };
  }
) {
  const role = createRole();
  const runs = new Map<string, RuntimeRun>();
  const events: Array<{ runId: string; type: string; metadata?: Record<string, unknown> }> = [];
  const runtimeAssets = {
    saveRun: vi.fn((rootPath: string, run: RuntimeRun) => {
      runs.set(run.id, JSON.parse(JSON.stringify(run)) as RuntimeRun);
    }),
    getRun: vi.fn((rootPath: string, runId: string) => runs.get(runId) ?? null),
    appendEvent: vi.fn((rootPath: string, event: { runId: string; type: string; metadata?: Record<string, unknown> }) => {
      events.push(event);
    }),
    listEventsForRun: vi.fn((rootPath: string, runId: string) => events.filter((event) => event.runId === runId)),
    loadTemplate: vi.fn(() => createTemplate()),
    saveRunHistory: vi.fn(),
    saveRunRecovery: vi.fn()
  };
  const projectService = {
    openProject: vi.fn(() => ({ manifest: { templateId: 'template-1', name: 'Project' } })),
    loadPlatformAssets: vi.fn(() => ({
      template: { id: 'template-1' },
      flows: [flow],
      subflows: options?.subflows ?? [],
      roles: [role],
      taskTemplates: options?.taskTemplates ?? [],
      agentProfiles: options?.agentProfiles ?? [],
      connectors: [],
      tools: []
    })),
    loadSessions: vi.fn(() => []),
    listArtifactInvalidations: vi.fn(() => options?.listArtifactInvalidations?.() ?? []),
    createSnapshot: vi.fn((rootPath: string, label: string) => options?.createSnapshot?.(rootPath, label))
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
  vi.spyOn(service, 'listRunEvents').mockImplementation((rootPath: string, runId: string) => events.filter((event) => event.runId === runId) as never);
  return { service, runtimeAssets, events, runs, role };
}

describe('runtime orchestration semantics', () => {
  it('resolves role bundles from task template, agent profile, and node overrides', () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'end', type: 'end', position: { x: 220, y: 0 }, data: { label: 'End' } }
      ],
      []
    );
    const taskTemplate: TaskTemplate = {
      id: 'task-review',
      name: '回归审查',
      objective: '判断当前变更是否存在回归风险',
      inputContract: {},
      outputContract: {
        format: 'markdown'
      },
      recommendedSkillIds: ['regression-risk-check'],
      requiredCapabilities: ['read_artifact']
    };
    const agentProfile: AgentProfile = {
      id: 'agent-review',
      name: 'Review Agent',
      roleProfileId: 'role-planner',
      defaultSkillBundle: ['verification-before-completion'],
      capabilityPolicy: {
        allowedCapabilities: ['read_artifact']
      },
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-review',
        preferredProfileIds: [],
        fallbackToActive: false
      },
      dependencySpec: []
    };
    const { service, role } = createService(flow, {
      taskTemplates: [taskTemplate],
      agentProfiles: [agentProfile]
    });

    const bundle = (service as any).resolveRoleBundle('E:/tmp/project', role.id, {
      taskTemplateId: taskTemplate.id,
      agentProfileId: agentProfile.id,
      skillIds: ['node-skill']
    });

    expect(bundle.effectiveSkillIds.sort()).toEqual([
      'node-skill',
      'regression-risk-check',
      'verification-before-completion'
    ]);
    expect(bundle.modelPolicy.mode).toBe('fixed');
    expect(bundle.modelPolicy.fixedProfileId).toBe('profile-review');
  });

  it('passes agent-profile model policy into agent debug runs', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'agent',
          type: 'agent',
          position: { x: 220, y: 0 },
          data: {
            label: 'Planner Agent',
            roleId: 'role-planner',
            taskTemplateId: 'task-review',
            agentProfileId: 'agent-review'
          }
        },
        { id: 'end', type: 'end', position: { x: 440, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'agent' },
        { id: 'e-end', source: 'agent', target: 'end' }
      ]
    );
    const taskTemplate: TaskTemplate = {
      id: 'task-review',
      name: 'Review Task',
      objective: 'Review the change.',
      inputContract: {},
      outputContract: {
        format: 'markdown'
      },
      recommendedSkillIds: ['regression-risk-check'],
      requiredCapabilities: ['read_artifact']
    };
    const agentProfile: AgentProfile = {
      id: 'agent-review',
      name: 'Review Agent',
      roleProfileId: 'role-planner',
      defaultSkillBundle: ['verification-before-completion'],
      capabilityPolicy: {
        allowedCapabilities: ['review_artifact']
      },
      modelPolicy: {
        mode: 'fixed',
        fixedProfileId: 'profile-review',
        preferredProfileIds: [],
        fallbackToActive: false
      },
      dependencySpec: []
    };
    const { service } = createService(flow, {
      taskTemplates: [taskTemplate],
      agentProfiles: [agentProfile]
    });

    const runRoleLoop = vi.spyOn(service as never, 'runRoleLoop').mockImplementation(async (input: any) => {
      expect(input.role.modelPolicy).toEqual(expect.objectContaining({
        mode: 'fixed',
        fixedProfileId: 'profile-review'
      }));
      throw new Error('stop-after-assert');
    });

    await expect(service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'agent',
      profiles: [],
      activeProviderProfileId: ''
    })).rejects.toThrow('stop-after-assert');

    expect(runRoleLoop).toHaveBeenCalledOnce();
  });

  it('requires task template and agent profile bindings for agent nodes', () => {
    const role = createRole();
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'agent',
          type: 'agent',
          position: { x: 220, y: 0 },
          data: {
            label: 'Planner Agent',
            roleId: role.id
          }
        },
        { id: 'end', type: 'end', position: { x: 440, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'agent' },
        { id: 'e-end', source: 'agent', target: 'end' }
      ]
    );

    const findings = validatePlatformFlow(flow, {
      template: createTemplate(),
      roles: [role],
      taskTemplates: [],
      agentProfiles: [],
      connectors: [],
      tools: []
    } as any);

    expect(findings.some((item) => item.code === 'binding.task-template.missing')).toBe(true);
    expect(findings.some((item) => item.code === 'binding.agent-profile.missing')).toBe(true);
  });

  it('persists deterministic branch-group state for parallel split debug runs', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'split',
          type: 'parallel_split',
          position: { x: 200, y: 0 },
          data: {
            label: 'Split',
            parallelMode: 'fanout',
            parallelFailureStrategy: 'continue',
            parallelCancellationPolicy: 'wait_all'
          }
        },
        { id: 'branch-a', type: 'artifact', position: { x: 420, y: -80 }, data: { label: 'Branch A', artifactPath: 'artifacts/branch-a.md' } },
        { id: 'branch-b', type: 'artifact', position: { x: 420, y: 80 }, data: { label: 'Branch B', artifactPath: 'artifacts/branch-b.md' } },
        {
          id: 'join',
          type: 'parallel_join',
          position: { x: 620, y: 0 },
          data: { label: 'Join', mergeStrategy: 'collect_all' }
        },
        { id: 'end', type: 'end', position: { x: 840, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'split' },
        { id: 'e-a', source: 'split', target: 'branch-a' },
        { id: 'e-b', source: 'split', target: 'branch-b' },
        { id: 'e-aj', source: 'branch-a', target: 'join' },
        { id: 'e-bj', source: 'branch-b', target: 'join' },
        { id: 'e-end', source: 'join', target: 'end' }
      ]
    );
    const { service, events } = createService(flow);

    const result = await service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'split',
      profiles: [],
      activeProviderProfileId: ''
    });

    expect(result.run.status).toBe('completed');
    expect(result.run.branchGroups?.length).toBe(1);
    expect(result.run.branchGroups?.[0]?.joinNodeId).toBe('join');
    expect(result.run.branchGroups?.[0]?.branches).toHaveLength(2);
    expect(result.run.branchGroups?.[0]?.branches.every((branch) => branch.status === 'completed')).toBe(true);
    expect(events.filter((event) => event.type === 'branch.group-started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'branch.started')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'branch.completed')).toHaveLength(2);
    expect(events.some((event) => event.type === 'branch.join-waiting')).toBe(true);
    expect(events.some((event) => event.type === 'branch.join-released')).toBe(true);
  });

  it('captures loop iterations and timeout/guard semantics in loop debug runs', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'loop',
          type: 'loop',
          position: { x: 200, y: 0 },
          data: {
            label: 'Refine',
            loopExpression: 'needs_more',
            exitExpression: 'ready',
            maxIterations: 3,
            loopTimeoutMs: 250,
            loopFailurePolicy: 'guard_fail',
            loopBackTargetId: 'tool',
            exitTargetId: 'end'
          }
        },
        { id: 'tool', type: 'tool', position: { x: 420, y: 0 }, data: { label: 'Worker' } },
        { id: 'end', type: 'end', position: { x: 640, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'loop' },
        { id: 'e-loop-tool', source: 'loop', target: 'tool', branch: 'loop' },
        { id: 'e-loop-exit', source: 'loop', target: 'end', branch: 'exit' }
      ]
    );
    const { service, events } = createService(flow);

    const result = await service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'loop',
      profiles: [],
      activeProviderProfileId: ''
    });

    expect(result.run.status).toBe('completed');
    expect(result.run.loops?.length).toBe(1);
    expect(result.run.loops?.[0]?.iterationScopeIds.length).toBe(2);
    expect(result.run.loops?.[0]?.exitReason).toBe('exit-condition');
    expect(events.some((event) => event.type === 'loop.started')).toBe(true);
    expect(events.filter((event) => event.type === 'loop.iteration.started')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'loop.iteration.completed')).toHaveLength(2);
    expect(events.some((event) => event.type === 'loop.exit-satisfied')).toBe(true);
  });

  it('records subflow input/output mappings in subflow debug runs', async () => {
    const subflow: PlatformFlowAsset = {
      id: 'subflow-1',
      name: 'Child flow',
      description: '',
      kind: 'subflow',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      nodes: [
        { id: 'child-start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'child-tool',
          type: 'tool',
          position: { x: 180, y: 0 },
          data: {
            label: 'Transform',
            inputArtifactPaths: ['sub/input.md'],
            outputArtifactPaths: ['sub/output.md']
          }
        },
        { id: 'child-end', type: 'end', position: { x: 360, y: 0 }, data: { label: 'End' } }
      ],
      edges: [
        { id: 'child-e1', source: 'child-start', target: 'child-tool' },
        { id: 'child-e2', source: 'child-tool', target: 'child-end' }
      ]
    };
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'subflow-node',
          type: 'subflow',
          position: { x: 240, y: 0 },
          data: {
            label: 'Subflow node',
            subflowId: subflow.id,
            subflowInputBindings: ['input/brief.md=>sub/input.md'],
            subflowOutputBindings: ['sub/output.md=>output/result.md']
          }
        },
        { id: 'end', type: 'end', position: { x: 480, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'subflow-node' },
        { id: 'e-end', source: 'subflow-node', target: 'end' }
      ]
    );
    const { service, events } = createService(flow, { subflows: [subflow] });

    const result = await service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'subflow-node',
      profiles: [],
      activeProviderProfileId: ''
    });

    expect(result.run.status).toBe('completed');
    expect(result.run.subflowCalls?.length).toBe(1);
    expect(result.run.subflowCalls?.[0]?.inputBindings).toEqual(['input/brief.md=>sub/input.md']);
    expect(result.run.subflowCalls?.[0]?.outputBindings).toEqual(['sub/output.md=>output/result.md']);
    expect(events.some((event) => event.type === 'subflow.started')).toBe(true);
    expect(events.some((event) => event.type === 'subflow.completed')).toBe(true);
  });

  it('builds rerun plans, snapshots, and resumed lineage for scoped reruns', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'draft',
          type: 'artifact',
          position: { x: 220, y: 0 },
          data: {
            label: 'Draft',
            artifactPath: 'output/draft.md',
            outputArtifactPaths: ['output/draft.md']
          }
        },
        {
          id: 'review',
          type: 'artifact',
          position: { x: 440, y: 0 },
          data: {
            label: 'Review',
            artifactPath: 'output/review.md',
            inputArtifactPaths: ['output/draft.md'],
            outputArtifactPaths: ['output/review.md']
          }
        },
        { id: 'end', type: 'end', position: { x: 660, y: 0 }, data: { label: 'End' } }
      ],
      [
        { id: 'e-start', source: 'start', target: 'draft' },
        { id: 'e-review', source: 'draft', target: 'review' },
        { id: 'e-end', source: 'review', target: 'end' }
      ]
    );
    const { service, events } = createService(flow, {
      listArtifactInvalidations: () => [{ artifactPath: 'output/review.md', recommendedNodeIds: ['review'] }],
      createSnapshot: () => ({ id: 'snapshot-1', label: 'rerun-Draft', createdAt: '2026-04-15T01:00:00.000Z' })
    });

    const preview = service.previewFlowRerun({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'draft',
      sourceRunId: 'run-old',
      mode: 'partial-rerun'
    });
    expect(preview.plan.reusableNodeIds).toEqual(['start']);
    expect(preview.plan.invalidatedNodeIds).toEqual(['draft', 'review', 'end']);
    expect(preview.plan.invalidatedArtifactPaths).toContain('output/review.md');

    const applied = await service.applyFlowRerun({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'draft',
      sourceRunId: 'run-old',
      mode: 'partial-rerun',
      profiles: [],
      activeProviderProfileId: ''
    });

    expect(applied.plan.status).toBe('applied');
    expect(applied.snapshot?.projectSnapshotId).toBe('snapshot-1');
    expect(applied.run.resumedFromRunId).toBe('run-old');
    expect(applied.run.rerunPlans?.[0]?.id).toBe(applied.plan.id);
    expect(applied.run.snapshots?.[0]?.projectSnapshotId).toBe('snapshot-1');
    expect(events.some((event) => event.type === 'rerun.plan-created')).toBe(true);
    expect(events.some((event) => event.type === 'snapshot.created')).toBe(true);
    expect(events.some((event) => event.type === 'rerun.applied')).toBe(true);
  });

  it('suspends approval nodes and resolves them through explicit approval', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'approval',
          type: 'approval',
          position: { x: 200, y: 0 },
          data: { label: 'Approval', approvalPrompt: 'Please approve publishing.' }
        },
        { id: 'end', type: 'end', position: { x: 400, y: 0 }, data: { label: 'End' } }
      ],
      [{ id: 'e-start', source: 'start', target: 'approval' }, { id: 'e-end', source: 'approval', target: 'end' }]
    );
    const { service, events, runtimeAssets } = createService(flow);

    const pending = await service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'approval',
      profiles: [],
      activeProviderProfileId: ''
    });

    expect(pending.run.status).toBe('waiting-approval');
    expect(pending.run.pendingApprovals?.[0]?.status).toBe('pending');
    expect(pending.run.recovery?.status).toBe('recoverable');
    expect(events.some((event) => event.type === 'approval.waiting')).toBe(true);
    expect(runtimeAssets.saveRunRecovery).toHaveBeenCalled();

    const approvalId = pending.run.pendingApprovals?.[0]?.id;
    expect(approvalId).toBeTruthy();

    const resolved = service.resolveRuntimeApproval('E:/tmp/project', pending.run.id, approvalId!, true, 'approved');

    expect(resolved.run.status).toBe('completed');
    expect(resolved.run.pendingApprovals?.[0]?.status).toBe('approved');
    expect(resolved.run.recovery?.status).toBe('resolved');
    expect(events.some((event) => event.type === 'approval.approved')).toBe(true);
    expect(events.some((event) => event.type === 'run.completed')).toBe(true);
  });

  it('cleans approval-gated runs on rejection', async () => {
    const flow = createFlow(
      [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        {
          id: 'approval',
          type: 'approval',
          position: { x: 200, y: 0 },
          data: {
            label: 'Approval',
            approvalPrompt: 'Need sign-off.',
            approvalRollbackNodeId: 'start'
          }
        },
        { id: 'end', type: 'end', position: { x: 400, y: 0 }, data: { label: 'End' } }
      ],
      [{ id: 'e-start', source: 'start', target: 'approval' }, { id: 'e-end', source: 'approval', target: 'end' }]
    );
    const { service, events } = createService(flow);

    const pending = await service.debugFlowNode({
      rootPath: 'E:/tmp/project',
      kind: 'flow',
      flowId: flow.id,
      nodeId: 'approval',
      profiles: [],
      activeProviderProfileId: ''
    });

    const approvalId = pending.run.pendingApprovals?.[0]?.id!;
    const resolved = service.resolveRuntimeApproval('E:/tmp/project', pending.run.id, approvalId, false, 'rejected');

    expect(resolved.run.status).toBe('stopped');
    expect(resolved.run.pendingApprovals?.[0]?.status).toBe('rejected');
    expect(resolved.run.recovery?.status).toBe('discarded');
    expect(events.some((event) => event.type === 'approval.rejected')).toBe(true);
    expect(events.some((event) => event.type === 'run.cleanup')).toBe(true);
  });

  it('marks source recovery as resolved before resume continuity continues', async () => {
    const flow = createFlow(
      [{ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
      []
    );
    const { service, runs, events } = createService(flow);
    const sourceRun = {
      id: 'run-source',
      kind: 'chat',
      status: 'failed',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      sessionId: 'session-1',
      stage: 'discover',
      roleId: 'role-planner',
      flowId: 'flow-1',
      diagnostics: [],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: [{ id: 'cp-1', createdAt: '', turn: 1, status: 'completed', summary: 'checkpoint' }],
      resumeContext: {
        system: 'system prompt',
        user: 'user prompt',
        allowedCapabilities: []
      },
      contextPackId: 'ctx-1',
      branchGroups: [],
      pendingApprovals: []
    } as unknown as RuntimeRun;
    runs.set(sourceRun.id, sourceRun);

    const nextRun = {
      id: 'run-resumed',
      kind: 'chat',
      status: 'completed',
      createdAt: '',
      updatedAt: '',
      diagnostics: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      outputs: [],
      checkpoints: [],
      branchGroups: [],
      pendingApprovals: []
    } as unknown as RuntimeRun;
    const runRoleLoop = vi.spyOn(service as never, 'runRoleLoop').mockResolvedValue({
      run: nextRun
    } as never);

    const result = await service.resumeRun('E:/tmp/project', sourceRun.id, [], '');

    expect(runs.get(sourceRun.id)?.recovery?.status).toBe('resolved');
    expect(runRoleLoop).toHaveBeenCalledWith(expect.objectContaining({
      resumedFromRunId: sourceRun.id,
      provenance: ['resume-context-pack:ctx-1']
    }));
    expect(events.some((event) => event.type === 'run.resumed' && event.runId === sourceRun.id)).toBe(true);
    expect(result.run.id).toBe(nextRun.id);
  });
});
