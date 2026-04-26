import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActionableErrorRecord,
  AgentMemory,
  AiRequest,
  AiResponse,
  AiSession,
  AppStage,
  ArtifactQualityTier,
  ArtifactSchemaAsset,
  ContextPack,
  DocumentWriteResolutionInput,
  EvidencePackage,
  FlowValidationIssue,
  KnowledgeIndexState,
  PlatformFlowAsset,
  PlatformFlowNode,
  PlatformRole,
  ProvenanceRecord,
  ProjectTemplatePackage,
  ProjectTemplateSaveInput,
  ResolvedRoleRuntimeBundle,
  RetrievalHit,
  ReviewRound,
  RuntimeCapabilityDefinition,
  RuntimeBudgetPlan,
  RuntimeBranchGroup,
  RuntimeBranchRecord,
  RuntimeGovernorStatus,
  RuntimeApprovalRecord,
  RuntimeCheckpoint,
  RuntimeExecutionBinding,
  RuntimeEvent,
  RuntimeArtifactOutcome,
  RuntimeLoopRecord,
  RuntimeOutputRecord,
  RuntimeRerunPlan,
  RuntimeRunHistoryRecord,
  RuntimeRunRecovery,
  RuntimeRun,
  RuntimeScopeRecord,
  RuntimeScopeStatus,
  RuntimeScopeType,
  RuntimeSnapshotRecord,
  RuntimeSubflowCallRecord,
  RuntimeTemplateAsset,
  RuleDefinition,
  SessionContextControls,
  StageArtifactGuard,
  StageGuardStatus
} from '../../shared/types';
import { resolveArtifactValidationPolicy, validateArtifact } from '../../shared/artifact-validators';
import { downstreamNodeIds, validatePlatformFlow } from '../../shared/flow-validator';
import {
  computeRolePackageStatus,
  ensureRolePackageSections,
  resolveNodeCapabilityIds
} from '../../shared/platform-bindings';
import { assembleExecutionBundle } from '../../shared/execution-bundle';
import { migrateLegacyRoleToRoleProfile } from '../../shared/orchestration-contracts';
import { slugifyChangeName } from '../../shared/openspec';
import { loadRolePackageDirectory } from '../../shared/role-package';
import { resolveRuntimeRunControlState } from '../../shared/runtime-run-controls';
import { normalizeRuntimeTemplate, resolveRuntimeExportMapping, STAGE_ORDER } from '../../shared/runtime-template';
import { CapabilityRuntime } from './capability-runtime';
import { DeliveryExportService } from './delivery-export-service';
import { ModelRouter, type RoutableProviderProfile } from './model-router';
import {
  buildOpenSpecDesign,
  buildOpenSpecProposal,
  buildOpenSpecRoadmapV2,
  buildOpenSpecSpec,
  buildOpenSpecTasks,
  collectOpenSpecSourceArtifacts
} from './openspec-handoff';
import { ProjectService } from './project-service';
import { EvidenceStoreService } from './evidence-store-service';
import { RuntimeAssetService } from './runtime-asset-service';
import { RuntimeError } from './runtime-errors';
import { SideEffectGovernanceService } from './side-effect-governance-service';
import { SkillRegistryService } from './skill-registry-service';
import { StructuredGenerationService } from './structured-generation-service';
import { TemplateAuthoringService } from './template-authoring-service';
import { KnowledgeIndexService } from './knowledge-index-service';
import { HybridRetrievalService } from './hybrid-retrieval-service';
import { ProvenanceService } from './provenance-service';
import { RulesDistillationService } from './rules-distillation-service';
import { RuntimeBudgetGovernor } from './runtime-budget-governor';
import { ConversationCompactionService, type ConversationCompactionResult } from './conversation-compaction-service';
import { RuntimePauseSignal, isRuntimePauseSignal } from './runtime-interrupts';
import { collectOpenSpecSourceDocuments, resolveOpenSpecWorkspaceRoot } from './runtime-template-contracts';
import type { LiveLogService } from './live-log-service';

type LoopToolCall = {
  capabilityId: string;
  input?: Record<string, unknown>;
};

type ActiveRunSnapshot = {
  rootPath: string;
  runId: string;
  status: RuntimeRun['status'];
  heartbeatAt: string;
  currentStep?: string;
  latestCheckpointId?: string;
  latestCheckpointSummary?: string;
  pauseRequestedAt?: string;
  pausedAt?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function usageForText(inputText: string, outputText: string) {
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const outputTokens = Math.max(1, Math.ceil(outputText.length / 4));
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCostUsd: Number(((inputTokens + outputTokens) * 0.000002).toFixed(6))
  };
}

function uniquePaths(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function contentHash(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

function normalizeSessionContextControls(value?: SessionContextControls | null): SessionContextControls {
  return {
    pinnedDocumentPaths: uniquePaths(value?.pinnedDocumentPaths ?? []),
    excludedDocumentPaths: uniquePaths(value?.excludedDocumentPaths ?? []),
    updatedAt: value?.updatedAt ?? ''
  };
}

function checkpoint(
  turn: number,
  summary: string,
  status: RuntimeCheckpoint['status'],
  nodeId?: string,
  contextPackId?: string
): RuntimeCheckpoint {
  return {
    id: randomUUID(),
    createdAt: nowIso(),
    turn,
    summary,
    status,
    nodeId,
    contextPackId
  };
}

function flowOutgoingEdges(flow: PlatformFlowAsset, nodeId: string) {
  return flow.edges.filter((edge) => edge.source === nodeId);
}

function flowIncomingEdges(flow: PlatformFlowAsset, nodeId: string) {
  return flow.edges.filter((edge) => edge.target === nodeId);
}

function flowNode(flow: PlatformFlowAsset, nodeId: string) {
  return flow.nodes.find((node) => node.id === nodeId) ?? null;
}

function upstreamNodeIds(flow: PlatformFlowAsset, startNodeId: string) {
  const queue = [startNodeId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of flowIncomingEdges(flow, current)) {
      if (!visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  visited.delete(startNodeId);
  return Array.from(visited);
}

function parseBindingPairs(values?: string[]) {
  return (values ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [source, target] = item.split(/\s*(?:=>|->|:)\s*/, 2);
      return {
        raw: item,
        source: source?.trim() ?? '',
        target: target?.trim() ?? ''
      };
    })
    .filter((item) => item.source && item.target);
}

function reachableJoinNodeIds(flow: PlatformFlowAsset, startNodeId: string) {
  const queue = [startNodeId];
  const visited = new Set<string>([startNodeId]);
  const joinIds = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of flowOutgoingEdges(flow, current)) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      const targetNode = flowNode(flow, edge.target);
      if (!targetNode) continue;
      if (targetNode.type === 'parallel_join') {
        joinIds.add(targetNode.id);
        continue;
      }
      queue.push(targetNode.id);
    }
  }
  return Array.from(joinIds);
}

function resolveDeterministicJoinNodeId(flow: PlatformFlowAsset, forkNodeId: string) {
  const outgoing = flowOutgoingEdges(flow, forkNodeId);
  if (!outgoing.length) return undefined;
  const candidateLists = outgoing.map((edge) => reachableJoinNodeIds(flow, edge.target));
  const intersection = candidateLists.reduce<string[]>((shared, candidateIds, index) => {
    if (index === 0) return [...candidateIds];
    return shared.filter((candidateId) => candidateIds.includes(candidateId));
  }, []);
  if (!intersection.length) {
    return candidateLists.flat()[0];
  }
  const joinOrder = new Map(
    flow.nodes
      .filter((node) => node.type === 'parallel_join')
      .map((node, index) => [node.id, index] as const)
  );
  return [...intersection].sort((left, right) => (joinOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (joinOrder.get(right) ?? Number.MAX_SAFE_INTEGER))[0];
}

function summarizeSession(session: AiSession) {
  return session.messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join('\n');
}

function slugifyTemplateId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function parseToolEnvelope(raw: string) {
  try {
    const value = JSON.parse(raw) as { toolCalls?: LoopToolCall[]; final?: string };
    if (!Array.isArray(value.toolCalls) || !value.toolCalls.length) return null;
    return value;
  } catch {
    return null;
  }
}

function capabilityAllowed(allowedCapabilities: string[], capabilityId: string) {
  if (!allowedCapabilities.length) return false;
  return allowedCapabilities.includes(capabilityId)
    || allowedCapabilities.includes(capabilityId.replace(/^builtin:/, ''))
    || allowedCapabilities.includes(capabilityId.replace(/^network:/, ''))
    || allowedCapabilities.includes(capabilityId.replace(/^connector:/, ''))
    || allowedCapabilities.includes(capabilityId.replace(/^script:/, ''));
}

function normalizeRuntimeError(error: unknown) {
  if (error instanceof RuntimeError) {
    return error;
  }
  if (error instanceof Error) {
    return new RuntimeError(error.message, 'model_error');
  }
  return new RuntimeError('运行时执行失败。', 'model_error');
}

export class RuntimeService {
  private readonly evidenceStore: EvidenceStoreService;
  private readonly sideEffectGovernance: SideEffectGovernanceService;
  private readonly templateAuthoringService: TemplateAuthoringService;
  private readonly knowledgeIndex: KnowledgeIndexService;
  private readonly hybridRetrieval: HybridRetrievalService;
  private readonly provenanceService: ProvenanceService;
  private readonly budgetGovernor: RuntimeBudgetGovernor;
  private readonly conversationCompaction: ConversationCompactionService;
  private readonly rulesDistillation: RulesDistillationService;
  private readonly stopRequestedRunIds = new Set<string>();
  private readonly pauseRequestedRunIds = new Set<string>();
  private readonly activeRunSnapshots = new Map<string, ActiveRunSnapshot>();

  constructor(
    private readonly projectService: ProjectService,
    private readonly runtimeAssets: RuntimeAssetService,
    private readonly modelRouter: ModelRouter,
    private readonly structuredGeneration: StructuredGenerationService,
    private readonly capabilityRuntime: CapabilityRuntime,
    private readonly skillRegistry: SkillRegistryService,
    private readonly deliveryExporter: DeliveryExportService,
    evidenceStore?: EvidenceStoreService,
    sideEffectGovernance?: SideEffectGovernanceService,
    templateAuthoringService?: TemplateAuthoringService,
    knowledgeIndex?: KnowledgeIndexService,
    hybridRetrieval?: HybridRetrievalService,
    provenanceService?: ProvenanceService,
    budgetGovernor?: RuntimeBudgetGovernor,
    conversationCompaction?: ConversationCompactionService,
    rulesDistillation?: RulesDistillationService,
    private readonly liveLogService?: Pick<LiveLogService, 'recordRuntimeEvent' | 'recordAiOutput' | 'recordQualityDiagnosis'>
  ) {
    this.evidenceStore = evidenceStore ?? new EvidenceStoreService();
    this.sideEffectGovernance = sideEffectGovernance ?? new SideEffectGovernanceService(projectService, this.evidenceStore);
    this.templateAuthoringService = templateAuthoringService ?? new TemplateAuthoringService(projectService, runtimeAssets);
    this.knowledgeIndex = knowledgeIndex ?? new KnowledgeIndexService(projectService);
    this.hybridRetrieval = hybridRetrieval ?? new HybridRetrievalService(this.knowledgeIndex);
    this.provenanceService = provenanceService ?? new ProvenanceService();
    this.budgetGovernor = budgetGovernor ?? new RuntimeBudgetGovernor();
    this.conversationCompaction = conversationCompaction ?? new ConversationCompactionService();
    this.rulesDistillation = rulesDistillation ?? new RulesDistillationService();
  }

  ensureProjectRuntime(rootPath: string) {
    const project = this.projectService.openProject(rootPath);
    const assets = this.projectService.loadPlatformAssets(rootPath);
    const templateId = project.manifest.templateId ?? assets.template?.id;
    if (!templateId) {
      throw new Error('当前工程缺少模板标识。');
    }
    const templateName = assets.template?.name ?? project.template?.name ?? project.manifest.name;
    this.runtimeAssets.ensureProjectRuntime(rootPath, templateId, templateName, assets);
  }

  getRuntimeTemplate(rootPath: string, templateId: string) {
    this.ensureProjectRuntime(rootPath);
    return this.runtimeAssets.loadTemplate(rootPath, templateId);
  }

  listCapabilities(rootPath: string): RuntimeCapabilityDefinition[] {
    this.ensureProjectRuntime(rootPath);
    return this.capabilityRuntime.listCapabilities(rootPath);
  }

  listRuns(rootPath: string) {
    this.ensureProjectRuntime(rootPath);
    return this.runtimeAssets.listRuns(rootPath).map((run) => this.decorateRuntimeRun(rootPath, run));
  }

  listEvents(rootPath: string) {
    this.ensureProjectRuntime(rootPath);
    return this.runtimeAssets.listEvents(rootPath);
  }

  listRunEvents(rootPath: string, runId: string) {
    this.ensureProjectRuntime(rootPath);
    return this.runtimeAssets.listEventsForRun(rootPath, runId);
  }

  private latestCheckpoint(run: RuntimeRun) {
    return run.checkpoints[run.checkpoints.length - 1];
  }

  private syncRunProgress(run: RuntimeRun, options?: { currentStep?: string; heartbeatAt?: string }) {
    const latestCheckpoint = this.latestCheckpoint(run);
    run.latestCheckpointId = latestCheckpoint?.id;
    run.latestCheckpointSummary = latestCheckpoint?.summary;
    if (options?.currentStep !== undefined) {
      run.currentStep = options.currentStep;
    } else if (!run.currentStep && latestCheckpoint?.summary) {
      run.currentStep = latestCheckpoint.summary;
    }
    run.heartbeatAt = options?.heartbeatAt ?? run.updatedAt;
    return latestCheckpoint ?? null;
  }

  private upsertActiveRun(rootPath: string, run: RuntimeRun, options?: { currentStep?: string; heartbeatAt?: string }) {
    const latestCheckpoint = this.syncRunProgress(run, options);
    const activeStatuses: RuntimeRun['status'][] = ['queued', 'running', 'pause-requested', 'waiting-approval', 'merge-required'];
    if (!activeStatuses.includes(run.status)) {
      this.activeRunSnapshots.delete(run.id);
      return;
    }
    this.activeRunSnapshots.set(run.id, {
      rootPath,
      runId: run.id,
      status: run.status,
      heartbeatAt: run.heartbeatAt ?? run.updatedAt,
      currentStep: run.currentStep,
      latestCheckpointId: latestCheckpoint?.id,
      latestCheckpointSummary: latestCheckpoint?.summary,
      pauseRequestedAt: run.pauseRequestedAt,
      pausedAt: run.pausedAt
    });
  }

  private removeActiveRun(runId: string) {
    this.activeRunSnapshots.delete(runId);
  }

  private listPendingMergeProposalIds(rootPath: string, runId: string) {
    if (typeof (this.projectService as { listPendingDocumentWrites?: (rootPath: string) => Array<{ id: string; sourceRunId?: string; status: string }> }).listPendingDocumentWrites !== 'function') {
      return [] as string[];
    }
    return (this.projectService as { listPendingDocumentWrites: (rootPath: string) => Array<{ id: string; sourceRunId?: string; status: string }> })
      .listPendingDocumentWrites(rootPath)
      .filter((proposal) => proposal.sourceRunId === runId && proposal.status === 'pending')
      .map((proposal) => proposal.id);
  }

  private getLatestArtifactRevisionId(rootPath: string, filePath: string) {
    if (typeof (this.projectService as {
      listArtifactRevisions?: (rootPath: string, limit?: number) => Array<{ artifactPath: string; id: string }>;
    }).listArtifactRevisions !== 'function') {
      return undefined;
    }
    const artifactPath = path.relative(rootPath, path.resolve(filePath)).replace(/\\/g, '/');
    return (this.projectService as {
      listArtifactRevisions: (rootPath: string, limit?: number) => Array<{ artifactPath: string; id: string }>;
    })
      .listArtifactRevisions(rootPath, 10_000)
      .find((revision) => revision.artifactPath === artifactPath)
      ?.id;
  }

  private decorateRuntimeRun(rootPath: string, run: RuntimeRun): RuntimeRun {
    const pendingMergeIds = this.listPendingMergeProposalIds(rootPath, run.id);
    const registrySnapshot = this.activeRunSnapshots.get(run.id);
    const normalizedRun = pendingMergeIds.length === 0 && run.status === 'merge-required'
      ? { ...run, status: 'completed' as const, mergeProposalIds: [] }
      : run;
    const projectedRun = registrySnapshot && registrySnapshot.rootPath === rootPath
      ? {
          ...normalizedRun,
          status: registrySnapshot.status,
          heartbeatAt: registrySnapshot.heartbeatAt,
          currentStep: registrySnapshot.currentStep ?? normalizedRun.currentStep,
          latestCheckpointId: registrySnapshot.latestCheckpointId ?? normalizedRun.latestCheckpointId,
          latestCheckpointSummary: registrySnapshot.latestCheckpointSummary ?? normalizedRun.latestCheckpointSummary,
          pauseRequestedAt: registrySnapshot.pauseRequestedAt ?? normalizedRun.pauseRequestedAt,
          pausedAt: registrySnapshot.pausedAt ?? normalizedRun.pausedAt
        }
      : normalizedRun;
    const controlState = resolveRuntimeRunControlState(projectedRun, {
      pendingMergeCount: pendingMergeIds.length
    });
    return {
      ...projectedRun,
      status: controlState.status,
      mergeProposalIds: pendingMergeIds,
      controlState
    };
  }

  private assertRunAction(rootPath: string, run: RuntimeRun, action: 'pause' | 'stop' | 'retry' | 'resume' | 'approve' | 'reject') {
    const decorated = this.decorateRuntimeRun(rootPath, run);
    if (!decorated.controlState?.allowedActions.includes(action)) {
      throw new Error(`Runtime run ${decorated.id} does not allow action "${action}" in state "${decorated.status}".`);
    }
    return decorated;
  }

  listContextPacks(rootPath: string, limit = 12) {
    this.ensureProjectRuntime(rootPath);
    return this.evidenceStore
      .listEntries(rootPath, 'context-packs')
      .slice(0, limit)
      .map((entry) => this.evidenceStore.readContextPack(rootPath, entry.id))
      .filter((entry): entry is ContextPack => Boolean(entry));
  }

  getKnowledgeIndexState(rootPath: string) {
    this.ensureProjectRuntime(rootPath);
    return this.knowledgeIndex.getStatus(rootPath);
  }

  refreshKnowledgeIndex(rootPath: string, mode: 'manual' | 'incremental' = 'manual') {
    this.ensureProjectRuntime(rootPath);
    return this.knowledgeIndex.refresh(rootPath, mode);
  }

  getRuntimeGovernorStatus(rootPath: string): RuntimeGovernorStatus {
    this.ensureProjectRuntime(rootPath);
    return this.budgetGovernor.getStatus(rootPath);
  }

  buildTemplatePackage(rootPath: string, input: ProjectTemplateSaveInput): ProjectTemplatePackage {
    this.ensureProjectRuntime(rootPath);
    return this.templateAuthoringService.buildTemplatePackage(rootPath, input);
  }

  saveRuntimeTemplate(rootPath: string, template: RuntimeTemplateAsset) {
    this.ensureProjectRuntime(rootPath);
    return this.templateAuthoringService.saveRuntimeTemplate(rootPath, template);
  }

  validateFlow(rootPath: string, kind: 'flow' | 'subflow', flowId: string) {
    this.ensureProjectRuntime(rootPath);
    const assets = this.projectService.loadPlatformAssets(rootPath);
    const flow = (kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === flowId);
    if (!flow) {
      throw new Error('未找到目标流程。');
    }
    return validatePlatformFlow(flow, {
      template: this.getTemplate(rootPath),
      subflows: assets.subflows,
      roles: assets.roles,
      taskTemplates: assets.taskTemplates,
      agentProfiles: assets.agentProfiles,
      connectors: assets.connectors,
      tools: assets.tools
    });
  }

  async debugFlowNode(input: {
    rootPath: string;
    kind: 'flow' | 'subflow';
    flowId: string;
    nodeId: string;
    sessionId?: string;
    resumedFromRunId?: string;
    rerunPlan?: RuntimeRerunPlan;
    snapshot?: RuntimeSnapshotRecord;
    profiles: RoutableProviderProfile[];
    activeProviderProfileId: string;
  }) {
    this.ensureProjectRuntime(input.rootPath);
    const assets = this.projectService.loadPlatformAssets(input.rootPath);
    const flow = (input.kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === input.flowId);
    if (!flow) {
      throw new Error('Target flow for debug was not found.');
    }
    const node = flow.nodes.find((item) => item.id === input.nodeId);
    if (!node) {
      throw new Error('Target node for debug was not found.');
    }
    const findings = validatePlatformFlow(flow, {
      template: this.getTemplate(input.rootPath),
      subflows: assets.subflows,
      roles: assets.roles,
      taskTemplates: assets.taskTemplates,
      agentProfiles: assets.agentProfiles,
      connectors: assets.connectors,
      tools: assets.tools
    });
    const blocking = findings.filter((item) => item.severity === 'error' && (!item.nodeId || item.nodeId === node.id));
    if (blocking.length) {
      throw new Error(blocking[0].message);
    }
    const contractValidation = typeof (this.projectService as {
      validateNodeArtifactContracts?: (rootPath: string, flow: PlatformFlowAsset, node: PlatformFlowNode) => { ok: boolean; errors: string[] };
    }).validateNodeArtifactContracts === 'function'
      ? (this.projectService as {
          validateNodeArtifactContracts: (rootPath: string, flow: PlatformFlowAsset, node: PlatformFlowNode) => { ok: boolean; errors: string[] };
        }).validateNodeArtifactContracts(input.rootPath, flow, node)
      : { ok: true, errors: [] };
    if (!contractValidation.ok) {
      const errorRecord: ActionableErrorRecord = {
        id: randomUUID(),
        createdAt: nowIso(),
        scope: 'runtime',
        code: 'artifact_contract_invalid',
        severity: 'error',
        message: contractValidation.errors[0] ?? 'Node artifact contract validation failed.',
        targetId: node.id,
        retryable: true,
        recoverable: true,
        suggestedActions: contractValidation.errors
      };
      this.evidenceStore.persistActionableError(input.rootPath, errorRecord);
      throw new Error(errorRecord.message);
    }

    if (node.type === 'agent') {
      const session = input.sessionId
        ? this.projectService.loadSessions(input.rootPath).find((item) => item.id === input.sessionId) ?? null
        : null;
      const roleId = node.data.roleId
        || (session ? this.getTemplate(input.rootPath).stageRoleIds[session.stage] : this.getTemplate(input.rootPath).stageRoleIds.discover);
      const bundle = this.resolveRoleBundle(
        input.rootPath,
        roleId,
        {
          taskTemplateId: node.data.taskTemplateId,
          agentProfileId: node.data.agentProfileId,
          connectorId: node.data.connectorId,
          toolId: node.data.toolId,
          toolIds: node.data.toolIds,
          skillIds: node.data.skillIds
        }
      );
      const role = this.getRole(input.rootPath, roleId, {
        taskTemplateId: node.data.taskTemplateId,
        agentProfileId: node.data.agentProfileId,
        connectorId: node.data.connectorId,
        toolId: node.data.toolId,
        toolIds: node.data.toolIds,
        skillIds: node.data.skillIds
      });
      const summary = [
        `Node: ${node.data.label}`,
        node.data.description ? `Description: ${node.data.description}` : '',
        node.data.notes ? `Notes: ${node.data.notes}` : '',
        node.data.inputArtifactPaths?.length ? `Read artifacts: ${node.data.inputArtifactPaths.join(', ')}` : '',
        node.data.outputArtifactPaths?.length ? `Write artifacts: ${node.data.outputArtifactPaths.join(', ')}` : '',
        session ? `Session stage: ${session.stage}` : '',
        session ? `Context:\n${summarizeSession(session)}` : ''
      ].filter(Boolean).join('\n');
      const loop = await this.runRoleLoop({
        rootPath: input.rootPath,
        kind: 'template',
        sessionId: session?.id,
        stage: session?.stage,
        role,
        profiles: input.profiles,
        activeProviderProfileId: input.activeProviderProfileId,
        system: [
          'You are debugging a single orchestration node.',
          'Return only the result for the current node and do not advance later nodes.',
          bundle.promptHint || role.promptHint || ''
        ].filter(Boolean).join('\n\n'),
        user: summary,
        allowedCapabilities: bundle.allowedCapabilities,
        toolMode: 'enabled',
        flowId: input.flowId,
        nodeId: node.id,
        boundRuleIds: node.data.ruleBindingIds,
        resumedFromRunId: input.resumedFromRunId,
        provenance: input.rerunPlan ? [`rerun-plan:${input.rerunPlan.id}`] : undefined
      });
      const outputValidation = typeof (this.projectService as {
        validateNodeArtifactOutputs?: (rootPath: string, node: PlatformFlowNode, content: string) => { ok: boolean; errors: string[] };
      }).validateNodeArtifactOutputs === 'function'
        ? (this.projectService as {
            validateNodeArtifactOutputs: (rootPath: string, node: PlatformFlowNode, content: string) => { ok: boolean; errors: string[] };
          }).validateNodeArtifactOutputs(input.rootPath, node, loop.finalText)
        : { ok: true, errors: [] };
      if (!outputValidation.ok) {
        this.persistArtifactContractFailure(input.rootPath, outputValidation.errors, {
          run: loop.run,
          nodeId: node.id
        });
        throw new Error(outputValidation.errors[0]);
      }
      this.recordCheckpoint(input.rootPath, loop.run, {
        turn: loop.run.checkpoints.length + 1,
        summary: `Node debug: ${node.data.label}`,
        status: 'completed',
        nodeId: node.id,
        currentStep: `Node debug completed: ${node.data.label}`
      });
      loop.run.flowId = input.flowId;
      if (input.rerunPlan) {
        loop.run.rerunPlans = [...(loop.run.rerunPlans ?? []), input.rerunPlan];
      }
      if (input.snapshot) {
        loop.run.snapshots = [...(loop.run.snapshots ?? []), input.snapshot];
      }
      const evidencePackage = this.createEvidencePackage(input.rootPath, loop.run);
      this.evidenceStore.persistRunEvidence(input.rootPath, evidencePackage);
      loop.run.evidencePackageId = evidencePackage.id;
      this.saveRunState(input.rootPath, loop.run);
      return {
        run: loop.run,
        events: this.listRunEvents(input.rootPath, loop.run.id),
        findings
      };
    }

    const run = this.createRun(input.rootPath, 'template', input.sessionId, undefined, {
      id: `debug-${node.type}`,
      name: `${node.data.label} debug`,
      description: '',
      promptHint: '',
      allowedCapabilities: [],
      outputSchema: 'debug',
      outputFormat: 'text',
      modelPolicy: {
        mode: 'fallback_to_active',
        preferredProfileIds: [],
        fallbackToActive: true
      }
    }, {
      resumedFromRunId: input.resumedFromRunId
    });
    run.flowId = input.flowId;
    if (input.rerunPlan) {
      run.rerunPlans = [...(run.rerunPlans ?? []), input.rerunPlan];
    }
    if (input.snapshot) {
      run.snapshots = [...(run.snapshots ?? []), input.snapshot];
    }
    this.emit(input.rootPath, run, {
      type: 'run.started',
      message: `Started node debug for ${node.data.label}`,
      metadata: { nodeId: node.id, nodeType: node.type }
    });
    const rootScope = this.rootScope(run);
    if (rootScope) {
      rootScope.status = 'running';
      rootScope.updatedAt = nowIso();
      rootScope.flowId = input.flowId;
    }
    try {
      if (node.type === 'parallel_split') {
        this.executeParallelSplitDebugNode(input.rootPath, run, flow, node);
      } else if (node.type === 'parallel_join') {
        this.executeParallelJoinDebugNode(input.rootPath, run, flow, node);
      } else if (node.type === 'loop') {
        this.executeLoopDebugNode(input.rootPath, run, flow, node);
      } else if (node.type === 'approval') {
        this.suspendApprovalDebugNode(input.rootPath, run, node);
      } else if (node.type === 'subflow') {
        this.executeSubflowDebugNode(input.rootPath, run, flow, node, assets.subflows);
      } else {
        const output = this.debugNonAgentNode(flow, node);
        const outputValidation = typeof (this.projectService as {
          validateNodeArtifactOutputs?: (rootPath: string, node: PlatformFlowNode, content: string) => { ok: boolean; errors: string[] };
        }).validateNodeArtifactOutputs === 'function'
          ? (this.projectService as {
              validateNodeArtifactOutputs: (rootPath: string, node: PlatformFlowNode, content: string) => { ok: boolean; errors: string[] };
            }).validateNodeArtifactOutputs(input.rootPath, node, output.content)
          : { ok: true, errors: [] };
        if (!outputValidation.ok) {
          this.persistArtifactContractFailure(input.rootPath, outputValidation.errors, {
            run,
            nodeId: node.id
          });
          throw new Error(outputValidation.errors[0]);
        }
        run.outputs.push(output);
        this.recordCheckpoint(input.rootPath, run, {
          turn: 1,
          summary: `Node debug: ${node.data.label}`,
          status: 'completed',
          nodeId: node.id,
          currentStep: `Node debug completed: ${node.data.label}`
        });
        run.status = 'completed';
        run.updatedAt = nowIso();
        run.usage = usageForText(node.data.label, output.content);
      }

      if (rootScope) {
        this.finalizeScope(
          run,
          rootScope.id,
          run.status === 'waiting-approval'
            ? 'waiting'
            : run.status === 'failed'
              ? 'failed'
              : run.status === 'stopped'
                ? 'stopped'
                : 'completed',
          {
            checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id,
            errorMessage: run.errorMessage
          }
        );
      }

      const evidencePackage = this.createEvidencePackage(input.rootPath, run);
      this.evidenceStore.persistRunEvidence(input.rootPath, evidencePackage);
      run.evidencePackageId = evidencePackage.id;
      this.saveRunState(input.rootPath, run);
      if (run.status !== 'waiting-approval') {
        this.emit(input.rootPath, run, {
          type: 'run.completed',
          message: `Completed node debug for ${node.data.label}`,
          metadata: { nodeId: node.id, nodeType: node.type }
        });
      }

      return {
        run,
        events: this.listRunEvents(input.rootPath, run.id),
        findings
      };
    } catch (error) {
      if (isRuntimePauseSignal(error)) {
        return {
          run: error.run,
          events: this.listRunEvents(input.rootPath, error.run.id),
          findings
        };
      }
      throw error;
    }
  }

  async resumeRun(rootPath: string, runId: string, profiles: RoutableProviderProfile[], activeProviderProfileId: string) {
    this.ensureProjectRuntime(rootPath);
    const sourceRun = this.runtimeAssets.getRun(rootPath, runId);
    if (!sourceRun) {
      throw new Error('Runtime run to resume was not found.');
    }
    this.assertRunAction(rootPath, sourceRun, 'resume');
    if (!sourceRun.roleId || !sourceRun.resumeContext) {
      throw new Error('The selected run does not support resume.');
    }
    const role = this.getRole(rootPath, sourceRun.roleId);
    const latestCheckpoint = sourceRun.checkpoints[sourceRun.checkpoints.length - 1];
    this.validateResumeCheckpoint(rootPath, sourceRun, latestCheckpoint, profiles);
    this.pauseRequestedRunIds.delete(sourceRun.id);
    sourceRun.pauseRequestedAt = undefined;
    sourceRun.pausedAt = undefined;
    sourceRun.currentStep = latestCheckpoint?.summary ?? 'Resuming from the latest checkpoint.';
    sourceRun.updatedAt = nowIso();
    sourceRun.recovery = this.createRecoveryState(sourceRun, 'resolved', {
      resumedAt: sourceRun.updatedAt,
      resolvedAt: sourceRun.updatedAt
    });
    this.saveRunState(rootPath, sourceRun);
    this.emit(rootPath, sourceRun, {
      type: 'run.resumed',
      message: `Resume requested for ${sourceRun.id}`,
      metadata: {
        sourceRunId: sourceRun.id,
        latestCheckpointId: latestCheckpoint?.id ?? null
      }
    });
    const resumed = await this.runRoleLoop({
      rootPath,
      kind: sourceRun.kind,
      sessionId: sourceRun.sessionId,
      stage: sourceRun.stage,
      role,
      profiles,
      activeProviderProfileId,
      system: sourceRun.resumeContext.system,
      user: [
        sourceRun.resumeContext.user,
        latestCheckpoint ? `\n\nContinue from latest checkpoint: ${latestCheckpoint.summary}` : ''
      ].join(''),
      allowedCapabilities: sourceRun.resumeContext.allowedCapabilities,
      resumedFromRunId: sourceRun.id,
      provenance: [
        sourceRun.contextPackId ? `resume-context-pack:${sourceRun.contextPackId}` : 'resume-context-pack:unknown'
      ]
    });
    resumed.run.flowId = sourceRun.flowId;
    this.saveRunState(rootPath, resumed.run);
    return {
      run: resumed.run,
      events: this.listRunEvents(rootPath, resumed.run.id)
    };
  }

  pauseRun(rootPath: string, runId: string) {
    this.ensureProjectRuntime(rootPath);
    const run = this.runtimeAssets.getRun(rootPath, runId);
    if (!run) {
      throw new Error('Runtime run to pause was not found.');
    }
    this.assertRunAction(rootPath, run, 'pause');
    const requestedAt = nowIso();
    this.pauseRequestedRunIds.add(run.id);
    run.status = 'pause-requested';
    run.updatedAt = requestedAt;
    run.pauseRequestedAt = requestedAt;
    run.currentStep = run.latestCheckpointSummary
      ? `Pause requested after checkpoint: ${run.latestCheckpointSummary}`
      : 'Pause requested. Waiting for the next safe checkpoint boundary.';
    run.diagnostics.push('pause_requested: Waiting for the next safe checkpoint boundary.');
    run.recovery = this.createRecoveryState(run, 'recoverable', {
      reason: 'pause-requested'
    });
    this.saveRunState(rootPath, run);
    this.emit(rootPath, run, {
      type: 'run.pause-requested',
      message: `Pause requested for ${run.id}`,
      metadata: {
        status: run.status,
        latestCheckpointId: run.latestCheckpointId ?? null
      }
    });
    this.upsertActiveRun(rootPath, run, {
      currentStep: run.currentStep,
      heartbeatAt: requestedAt
    });
    return {
      run,
      events: this.listRunEvents(rootPath, run.id)
    };
  }

  async retryRun(rootPath: string, runId: string, profiles: RoutableProviderProfile[], activeProviderProfileId: string) {
    this.ensureProjectRuntime(rootPath);
    const sourceRun = this.runtimeAssets.getRun(rootPath, runId);
    if (!sourceRun) {
      throw new Error('Runtime run to retry was not found.');
    }
    this.assertRunAction(rootPath, sourceRun, 'retry');
    if (!sourceRun.roleId || !sourceRun.resumeContext) {
      throw new Error('The selected run does not support retry.');
    }
    const role = this.getRole(rootPath, sourceRun.roleId);
    sourceRun.updatedAt = nowIso();
    sourceRun.diagnostics.push('retry requested');
    sourceRun.recovery = this.createRecoveryState(sourceRun, 'resolved', {
      resolvedAt: sourceRun.updatedAt,
      reason: 'retry-requested'
    });
    this.saveRunState(rootPath, sourceRun);
    this.emit(rootPath, sourceRun, {
      type: 'run.retry-requested',
      message: `Retry requested for ${sourceRun.id}`,
      metadata: {
        sourceRunId: sourceRun.id,
        previousStatus: sourceRun.status
      }
    });
    const retried = await this.runRoleLoop({
      rootPath,
      kind: sourceRun.kind,
      sessionId: sourceRun.sessionId,
      stage: sourceRun.stage,
      role,
      profiles,
      activeProviderProfileId,
      system: sourceRun.resumeContext.system,
      user: sourceRun.resumeContext.user,
      allowedCapabilities: sourceRun.resumeContext.allowedCapabilities,
      resumedFromRunId: sourceRun.id,
      provenance: [
        sourceRun.contextPackId ? `retry-context-pack:${sourceRun.contextPackId}` : 'retry-context-pack:unknown'
      ]
    });
    retried.run.flowId = sourceRun.flowId;
    this.saveRunState(rootPath, retried.run);
    return {
      run: retried.run,
      events: this.listRunEvents(rootPath, retried.run.id)
    };
  }

  stopRun(rootPath: string, runId: string) {
    this.ensureProjectRuntime(rootPath);
    const run = this.runtimeAssets.getRun(rootPath, runId);
    if (!run) {
      throw new Error('Runtime run to stop was not found.');
    }
    this.assertRunAction(rootPath, run, 'stop');
    this.stopRequestedRunIds.add(run.id);
    this.pauseRequestedRunIds.delete(run.id);
    run.updatedAt = nowIso();
    run.pauseRequestedAt = undefined;
    run.diagnostics.push('cancelled_error: Stop requested by user.');
    run.recovery = this.createRecoveryState(run, 'recoverable', {
      reason: 'stop-requested'
    });
    this.saveRunState(rootPath, run);
    this.emit(rootPath, run, {
      type: 'run.stop-requested',
      message: `Stop requested for ${run.id}`,
      metadata: {
        status: run.status
      }
    });
    return {
      run,
      events: this.listRunEvents(rootPath, run.id)
    };
  }

  resolveRuntimeApproval(
    rootPath: string,
    runId: string,
    approvalId: string,
    approved: boolean,
    reason?: string
  ) {
    this.ensureProjectRuntime(rootPath);
    const run = this.runtimeAssets.getRun(rootPath, runId);
    if (!run) {
      throw new Error('Runtime run was not found.');
    }
    this.assertRunAction(rootPath, run, approved ? 'approve' : 'reject');
    const approval = (run.pendingApprovals ?? []).find((item) => item.id === approvalId);
    if (!approval) {
      throw new Error('Runtime approval record was not found.');
    }
    if (approval.status !== 'pending') {
      return {
        run,
        events: this.listRunEvents(rootPath, run.id)
      };
    }

    const decidedAt = nowIso();
    approval.status = approved ? 'approved' : 'rejected';
    approval.updatedAt = decidedAt;
    approval.decidedAt = decidedAt;
    approval.reason = reason?.trim() || undefined;
    run.updatedAt = decidedAt;

    if (approved) {
      run.status = 'completed';
      run.outputs.push({
        id: randomUUID(),
        createdAt: decidedAt,
        kind: 'final',
        label: 'approval-resolution',
        contentType: 'text',
        content: `Approval granted for node ${approval.nodeId}.`
      });
      this.recordCheckpoint(rootPath, run, {
        turn: run.checkpoints.length + 1,
        summary: `Approval granted for ${approval.nodeId}`,
        status: 'completed',
        nodeId: approval.nodeId,
        contextPackId: run.contextPackId,
        currentStep: `Approval granted for ${approval.nodeId}`
      });
      run.recovery = this.createRecoveryState(run, 'resolved', {
        resolvedAt: decidedAt,
        reason: approval.reason ?? 'approved'
      });
      this.emit(rootPath, run, {
        type: 'approval.approved',
        message: `Approval granted for ${approval.nodeId}`,
        metadata: {
          approvalId,
          nodeId: approval.nodeId,
          reason: approval.reason ?? null
        }
      });
    } else {
      run.status = 'stopped';
      run.errorMessage = reason?.trim() || 'Approval rejected by user.';
      run.diagnostics.push(`approval_rejected: ${run.errorMessage}`);
      this.recordCheckpoint(rootPath, run, {
        turn: run.checkpoints.length + 1,
        summary: run.errorMessage,
        status: 'failed',
        nodeId: approval.nodeId,
        contextPackId: run.contextPackId,
        currentStep: run.errorMessage
      });
      run.recovery = this.createRecoveryState(run, 'discarded', {
        resolvedAt: decidedAt,
        reason: approval.reason ?? 'rejected'
      });
      this.emit(rootPath, run, {
        type: 'approval.rejected',
        message: `Approval rejected for ${approval.nodeId}`,
        metadata: {
          approvalId,
          nodeId: approval.nodeId,
          rollbackNodeId: approval.rollbackNodeId ?? null,
          reason: approval.reason ?? null
        }
      });
      this.emit(rootPath, run, {
        type: 'run.cleanup',
        message: `Cleaned approval-gated run ${run.id} after rejection`,
        metadata: {
          approvalId,
          nodeId: approval.nodeId,
          rollbackNodeId: approval.rollbackNodeId ?? null
        }
      });
    }

    const evidencePackage = this.createEvidencePackage(rootPath, run);
    this.evidenceStore.persistRunEvidence(rootPath, evidencePackage);
    run.evidencePackageId = evidencePackage.id;
    this.saveRunState(rootPath, run);
    if (approved) {
      this.emit(rootPath, run, {
        type: 'run.completed',
        message: `Completed approval-gated run ${run.id}`,
        metadata: { approvalId, nodeId: approval.nodeId }
      });
    } else {
      this.emit(rootPath, run, {
        type: 'run.stopped',
        message: run.errorMessage ?? 'Approval rejected.',
        metadata: { approvalId, nodeId: approval.nodeId }
      });
    }

    return {
      run,
      events: this.listRunEvents(rootPath, run.id)
    };
  }

  resolvePendingDocumentWrite(
    rootPath: string,
    proposalId: string,
    input: DocumentWriteResolutionInput
  ) {
    this.ensureProjectRuntime(rootPath);
    if (typeof (this.projectService as {
      getPendingDocumentWrite?: (rootPath: string, proposalId: string) => {
        id: string;
        filePath: string;
        title: string;
        sourceRunId?: string;
      };
      resolvePendingDocumentWrite?: (
        rootPath: string,
        proposalId: string,
        input: DocumentWriteResolutionInput
      ) => { id: string; filePath: string; title: string; sourceRunId?: string };
    }).resolvePendingDocumentWrite !== 'function') {
      throw new Error('Pending document write resolution is not available.');
    }

    const projectService = this.projectService as {
      getPendingDocumentWrite?: (rootPath: string, proposalId: string) => {
        id: string;
        filePath: string;
        title: string;
        sourceRunId?: string;
      };
      resolvePendingDocumentWrite: (
        rootPath: string,
        proposalId: string,
        input: DocumentWriteResolutionInput
      ) => { id: string; filePath: string; title: string; sourceRunId?: string };
    };
    const proposal = typeof projectService.getPendingDocumentWrite === 'function'
      ? projectService.getPendingDocumentWrite(rootPath, proposalId)
      : null;
    const resolvedProposal = projectService.resolvePendingDocumentWrite(rootPath, proposalId, input);

    if (!proposal?.sourceRunId) {
      return {
        proposal: resolvedProposal,
        run: null,
        events: [] as RuntimeEvent[]
      };
    }

    const run = this.runtimeAssets.getRun(rootPath, proposal.sourceRunId);
    if (!run) {
      return {
        proposal: resolvedProposal,
        run: null,
        events: [] as RuntimeEvent[]
      };
    }

    const resolvedAt = nowIso();
    const decisionLabel = input.decision === 'accept-ai'
      ? 'applied AI write'
      : input.decision === 'manual-merge'
        ? 'applied reviewed merge'
        : 'kept the local document';
    const remainingMergeIds = this.listPendingMergeProposalIds(rootPath, run.id);
    run.updatedAt = resolvedAt;
    run.errorMessage = undefined;
    run.mergeProposalIds = remainingMergeIds;
    run.diagnostics = [...run.diagnostics, `merge-resolution:${proposalId}:${input.decision}`];
    run.outputs.push({
      id: randomUUID(),
      createdAt: resolvedAt,
      kind: 'final',
      label: 'merge-resolution',
      contentType: 'text',
      content: `Merge decision for ${proposal.title}: ${decisionLabel}.`
    });
    if (remainingMergeIds.length) {
      run.status = 'merge-required';
      run.recovery = this.createRecoveryState(run, 'recoverable', {
        reason: 'merge-required'
      });
    } else {
      run.status = 'completed';
      run.recovery = this.createRecoveryState(run, 'resolved', {
        resolvedAt,
        reason: `merge:${input.decision}`
      });
    }

    this.emit(rootPath, run, {
      type: 'merge.resolved',
      message: `Resolved merge proposal for ${proposal.title}.`,
      metadata: {
        proposalId,
        decision: input.decision,
        filePath: proposal.filePath,
        remainingMergeCount: remainingMergeIds.length
      }
    });
    if (!remainingMergeIds.length) {
      this.emit(rootPath, run, {
        type: 'run.completed',
        message: `Completed merge-gated run ${run.id}.`,
        metadata: {
          proposalId,
          decision: input.decision
        }
      });
    }

    const evidencePackage = this.createEvidencePackage(rootPath, run);
    this.evidenceStore.persistRunEvidence(rootPath, evidencePackage);
    run.evidencePackageId = evidencePackage.id;
    this.saveRunState(rootPath, run);

    return {
      proposal: resolvedProposal,
      run: this.decorateRuntimeRun(rootPath, run),
      events: this.listRunEvents(rootPath, run.id)
    };
  }

  previewFlowRerun(input: {
    rootPath: string;
    kind: 'flow' | 'subflow';
    flowId: string;
    nodeId: string;
    sourceRunId?: string;
    mode?: RuntimeRerunPlan['mode'];
  }) {
    this.ensureProjectRuntime(input.rootPath);
    const assets = this.projectService.loadPlatformAssets(input.rootPath);
    const flow = (input.kind === 'subflow' ? assets.subflows : assets.flows).find((item) => item.id === input.flowId);
    if (!flow) {
      throw new Error('Target flow for rerun preview was not found.');
    }
    const node = flow.nodes.find((item) => item.id === input.nodeId);
    if (!node) {
      throw new Error('Target node for rerun preview was not found.');
    }
    const downstreamIds = downstreamNodeIds(flow, node.id);
    const reusableNodeIds = upstreamNodeIds(flow, node.id);
    const invalidatedNodeIds = [node.id, ...downstreamIds];
    const invalidatedArtifacts = new Set<string>();
    const reusableArtifacts = new Set<string>();
    for (const candidate of flow.nodes) {
      for (const artifactPath of candidate.data.outputArtifactPaths ?? []) {
        if (invalidatedNodeIds.includes(candidate.id)) {
          invalidatedArtifacts.add(artifactPath);
        } else if (reusableNodeIds.includes(candidate.id)) {
          reusableArtifacts.add(artifactPath);
        }
      }
    }
    const activeInvalidations = typeof (this.projectService as {
      listArtifactInvalidations?: (rootPath: string, options?: { activeOnly?: boolean }) => Array<{ artifactPath: string; recommendedNodeIds?: string[] }>;
    }).listArtifactInvalidations === 'function'
      ? (this.projectService as {
          listArtifactInvalidations: (rootPath: string, options?: { activeOnly?: boolean }) => Array<{ artifactPath: string; recommendedNodeIds?: string[] }>;
        }).listArtifactInvalidations(input.rootPath, { activeOnly: true })
      : [];
    for (const invalidation of activeInvalidations) {
      if ((invalidation.recommendedNodeIds ?? []).some((nodeId) => invalidatedNodeIds.includes(nodeId))) {
        invalidatedArtifacts.add(invalidation.artifactPath);
      }
    }
    const plan: RuntimeRerunPlan = {
      id: randomUUID(),
      createdAt: nowIso(),
      sourceRunId: input.sourceRunId,
      flowId: flow.id,
      nodeId: node.id,
      mode: input.mode ?? 'continue',
      reusableNodeIds,
      reusableArtifactPaths: Array.from(reusableArtifacts),
      invalidatedNodeIds,
      invalidatedArtifactPaths: Array.from(invalidatedArtifacts),
      downstreamNodeIds: downstreamIds,
      status: 'preview',
      summary: `复用 ${reusableNodeIds.length} 个上游节点，重算 ${invalidatedNodeIds.length} 个节点，影响 ${invalidatedArtifacts.size} 个工件。`
    };
    return {
      flow,
      node,
      plan
    };
  }

  async applyFlowRerun(input: {
    rootPath: string;
    kind: 'flow' | 'subflow';
    flowId: string;
    nodeId: string;
    sourceRunId?: string;
    sessionId?: string;
    mode?: RuntimeRerunPlan['mode'];
    profiles: RoutableProviderProfile[];
    activeProviderProfileId: string;
  }) {
    const preview = this.previewFlowRerun(input);
    const projectSnapshot = typeof (this.projectService as {
      createSnapshot?: (rootPath: string, label: string) => { id: string; label: string; createdAt: string };
    }).createSnapshot === 'function'
      ? (this.projectService as {
          createSnapshot: (rootPath: string, label: string) => { id: string; label: string; createdAt: string };
        }).createSnapshot(input.rootPath, `rerun-${preview.node.data.label}`)
      : null;
    const snapshotRecord: RuntimeSnapshotRecord | undefined = projectSnapshot
      ? {
          id: randomUUID(),
          createdAt: projectSnapshot.createdAt,
          label: projectSnapshot.label,
          projectSnapshotId: projectSnapshot.id,
          reason: 'rerun-plan-apply',
          nodeId: input.nodeId
        }
      : undefined;
    const appliedPlan: RuntimeRerunPlan = {
      ...preview.plan,
      status: 'applied',
      snapshotId: snapshotRecord?.id
    };
    if (snapshotRecord) {
      snapshotRecord.rerunPlanId = appliedPlan.id;
    }
    const result = await this.debugFlowNode({
      rootPath: input.rootPath,
      kind: input.kind,
      flowId: input.flowId,
      nodeId: input.nodeId,
      sessionId: input.sessionId,
      resumedFromRunId: input.sourceRunId,
      rerunPlan: appliedPlan,
      snapshot: snapshotRecord,
      profiles: input.profiles,
      activeProviderProfileId: input.activeProviderProfileId
    });
    this.emit(input.rootPath, result.run, {
      type: 'rerun.plan-created',
      message: appliedPlan.summary,
      metadata: {
        rerunPlanId: appliedPlan.id,
        nodeId: appliedPlan.nodeId,
        sourceRunId: appliedPlan.sourceRunId ?? null
      }
    });
    if (snapshotRecord) {
      this.emit(input.rootPath, result.run, {
        type: 'snapshot.created',
        message: `Created rollback snapshot ${snapshotRecord.label}`,
        metadata: {
          snapshotId: snapshotRecord.id,
          projectSnapshotId: snapshotRecord.projectSnapshotId
        }
      });
    }
    this.emit(input.rootPath, result.run, {
      type: 'rerun.applied',
      message: `Applied rerun plan for ${preview.node.data.label}`,
      metadata: {
        rerunPlanId: appliedPlan.id,
        nodeId: appliedPlan.nodeId,
        mode: appliedPlan.mode
      }
    });
    this.saveRunState(input.rootPath, result.run);
    return {
      plan: appliedPlan,
      snapshot: snapshotRecord ?? null,
      run: result.run,
      events: this.listRunEvents(input.rootPath, result.run.id)
    };
  }

  async sendMessage(rootPath: string, request: AiRequest, profiles: RoutableProviderProfile[], activeProviderProfileId: string): Promise<AiResponse> {
    this.ensureProjectRuntime(rootPath);
    const sessions = this.projectService.loadSessions(rootPath);
    const session = sessions.find((item) => item.id === request.sessionId);
    if (!session) {
      throw new Error('未找到目标会话。');
    }
    const stageExecution = this.resolveStageExecutionBinding(rootPath, request.stage);
    const role = this.getRole(rootPath, stageExecution.roleId, {
      taskTemplateId: stageExecution.taskTemplateId,
      agentProfileId: stageExecution.agentProfileId
    });
    const skillInstructions = this.readSkillInstructionsSafe(
      this.collectRuntimeSkillIds(rootPath, session.id, role.allowedSkillIds)
    );
    const contextSection = this.buildConversationSupportContext(rootPath, request.contextDocuments);
    try {
      const loop = await this.runRoleLoop({
      rootPath,
      kind: 'chat',
      sessionId: session.id,
      stage: request.stage,
      role,
      profiles,
      activeProviderProfileId,
      system: [
        role.promptHint,
        skillInstructions ? `当前启用技能：\n${skillInstructions}` : '',
        '请直接给出当前会话下一步建议。'
      ].filter(Boolean).join('\n\n'),
      user: [request.content, contextSection].filter(Boolean).join('\n\n'),
      allowedCapabilities: role.allowedCapabilities,
      contextDocumentPaths: request.contextDocuments,
      provenance: ['conversation.send-message']
      });
      return {
        message: {
          id: randomUUID(),
          role: 'assistant',
          content: loop.finalText,
          createdAt: nowIso()
        },
        diagnostics: loop.run.diagnostics
      };
    } catch (error) {
      if (isRuntimePauseSignal(error)) {
        return {
          paused: true,
          pausedRunId: error.run.id,
          diagnostics: error.run.diagnostics
        };
      }
      throw error;
    }
  }

  async generateStageDraft(
    rootPath: string,
    sessionId: string,
    profiles: RoutableProviderProfile[],
    activeProviderProfileId: string,
    instructions?: string
  ) {
    this.ensureProjectRuntime(rootPath);
    const sessions = this.projectService.loadSessions(rootPath);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('未找到目标会话。');
    }
    const workflow = this.projectService.loadWorkflow(rootPath);
    const stage = session.stage || workflow.stage;
    const template = this.getTemplate(rootPath);
    const stageExecution = this.resolveStageExecutionBinding(rootPath, stage);
    const role = this.getRole(rootPath, stageExecution.roleId, {
      taskTemplateId: stageExecution.taskTemplateId,
      agentProfileId: stageExecution.agentProfileId
    });
    const memory = this.projectService.loadAgentMemory(rootPath);
    const compactedContext = this.conversationCompaction.compact(session);
    const stageContextPaths = this.resolveStageGenerationContextPaths(
      rootPath,
      template,
      stage,
      workflow.activeDocumentPath
    );
    const stageContextSection = this.buildConversationSupportContext(rootPath, stageContextPaths);
    const reviewRoundContext = this.buildLatestReviewRoundContext(rootPath, sessionId, stage);
    const skillInstructions = this.readSkillInstructionsSafe(
      this.collectRuntimeSkillIds(rootPath, sessionId, role.allowedSkillIds)
    );

    const generatedPaths: string[] = [];
    let lastRun: RuntimeRun | null = null;
    const blockedArtifactMessages: string[] = [];
    for (const target of template.stageDocuments[stage]) {
      const absolutePath = path.join(rootPath, target.path);
      const baseDocumentContents = fs.existsSync(absolutePath) ? this.projectService.readFile(absolutePath) : '';
      const baseRevisionId = this.getLatestArtifactRevisionId(rootPath, absolutePath);
      const baseContentHash = contentHash(baseDocumentContents);
      const promptProfile = this.getPromptProfile(rootPath, target.promptProfileId);
      const schema = this.getArtifactSchema(rootPath, target.validatorId);
      const artifactGuidance = this.buildStageArtifactGuidance(stage, template, target, schema);
      const roleLoop = await this.runRoleLoop({
        rootPath,
        kind: 'stage',
        sessionId,
        stage,
        role,
        profiles,
        activeProviderProfileId,
        system: [
          promptProfile.systemPrompt,
          skillInstructions ? `当前启用技能：\n${skillInstructions}` : '',
          `当前工件目标：${target.title}`,
          `目标说明：${target.purpose}`,
          artifactGuidance
        ].filter(Boolean).join('\n\n'),
        user: [
          memory.productIntent ? `产品意图：${memory.productIntent}` : '',
          memory.constraints.length ? `约束：${memory.constraints.join('；')}` : '',
          instructions ? `阶段补充指令：${instructions}` : '',
          `当前会话摘要：\n${compactedContext.summary || '暂无'}`,
          stageContextSection,
          reviewRoundContext,
          artifactGuidance,
          '请直接输出最终 Markdown。'
        ].filter(Boolean).join('\n\n'),
        allowedCapabilities: role.allowedCapabilities,
        toolMode: 'disabled',
        contextDocumentPaths: stageContextPaths,
        provenance: compactedContext.compacted ? ['context.compacted', 'stage.generate-draft'] : ['stage.generate-draft']
      });
      let structuredOutputs: RuntimeOutputRecord[] = [];
      let artifactOutcome: RuntimeArtifactOutcome | null = null;
      try {
        const structured = await this.structuredGeneration.coerceMarkdown(
          this.profileToSettings(roleLoop.selectedProfile),
          {
            system: promptProfile.systemPrompt,
            user: [
              `工件目标：${target.purpose}`,
              instructions ? `阶段补充指令：${instructions}` : '',
              `当前会话摘要：\n${compactedContext.summary || '暂无'}`,
              stageContextSection,
              reviewRoundContext,
              artifactGuidance
            ].filter(Boolean).join('\n\n')
          },
          schema,
          roleLoop.finalText,
          this.buildArtifactValidationPolicy(target, schema)
        );
        structuredOutputs = structured.outputs.map((output) => ({
          ...output,
          artifactPath: target.path,
          artifactTitle: target.title
        }));
        artifactOutcome = this.createArtifactOutcome({
          artifactPath: target.path,
          artifactTitle: target.title,
          schemaId: schema.id,
          qualityTier: structured.qualityTier,
          qualityScore: structured.qualityScore,
          qualityReasons: structured.qualityReasons,
          verdict: structured.verdict,
          accepted: structured.accepted,
          repaired: structured.repaired,
          usedDeterministicFallback: structured.usedDeterministicFallback,
          message: structured.message
        });
        this.liveLogService?.recordQualityDiagnosis({
          rootPath,
          runId: roleLoop.run.id,
          stage,
          roleId: role.id,
          profileId: roleLoop.selectedProfile.id,
          artifactPath: target.path,
          artifactTitle: target.title,
          verdict: structured.verdict,
          qualityScore: structured.qualityScore,
          qualityReasons: structured.qualityReasons,
          accepted: structured.accepted,
          repaired: structured.repaired,
          usedDeterministicFallback: structured.usedDeterministicFallback,
          message: structured.message
        });
        if (!structured.accepted) {
          const blockedMessage = structured.message ?? `${target.title} failed the artifact quality gate.`;
          blockedArtifactMessages.push(`${target.title}: ${blockedMessage}`);
          lastRun = {
            ...roleLoop.run,
            updatedAt: nowIso(),
            status: 'failed',
            errorMessage: blockedMessage,
            diagnostics: [
              ...roleLoop.run.diagnostics,
              `artifact-quality-blocked:${target.path}:${structured.verdict}:${structured.qualityScore}`
            ],
            outputs: [...roleLoop.run.outputs, ...structuredOutputs],
            artifactOutcomes: [...(roleLoop.run.artifactOutcomes ?? []), artifactOutcome]
          };
          this.saveRunState(rootPath, lastRun);
          this.emit(rootPath, lastRun, {
            type: 'merge.required',
            message: `Artifact quality gate blocked ${target.title}.`,
            metadata: {
              targetPath: absolutePath,
              qualityVerdict: structured.verdict,
              qualityScore: structured.qualityScore
            }
          });
          break;
        }
        const pendingWrite = typeof this.projectService.previewRuntimeDocumentWrite === 'function'
          ? this.projectService.previewRuntimeDocumentWrite(rootPath, absolutePath, structured.content, {
              sourceRunId: roleLoop.run.id,
              sourceLabel: target.title,
              baseRevisionId,
              baseContentHash
            })
          : null;
        if (pendingWrite) {
          lastRun = {
            ...roleLoop.run,
            updatedAt: nowIso(),
            status: 'merge-required',
            diagnostics: [...roleLoop.run.diagnostics, `pending-document-write:${pendingWrite.id}`],
            outputs: [...roleLoop.run.outputs, ...structuredOutputs],
            artifactOutcomes: [...(roleLoop.run.artifactOutcomes ?? []), artifactOutcome],
            mergeProposalIds: [...(roleLoop.run.mergeProposalIds ?? []), pendingWrite.id],
            recovery: this.createRecoveryState(roleLoop.run, 'recoverable', {
              reason: 'merge-required'
            })
          };
          this.saveRunState(rootPath, lastRun);
          this.emit(rootPath, lastRun, {
            type: 'merge.required',
            message: `AI write to ${target.title} requires merge confirmation before overwrite.`,
            metadata: {
              targetPath: absolutePath,
              proposalId: pendingWrite.id
            }
          });
          continue;
        }

        this.projectService.saveFile(absolutePath, structured.content, {
          source: 'runtime-write',
          artifactContext: {
            runId: roleLoop.run.id,
            stage,
            writeMode: 'replace'
          }
        });
        generatedPaths.push(absolutePath);
        lastRun = {
          ...roleLoop.run,
          updatedAt: nowIso(),
          status: 'completed',
          diagnostics: structured.verdict === 'degraded'
            ? [...roleLoop.run.diagnostics, `artifact-quality-degraded:${target.path}:${structured.qualityScore}`]
            : roleLoop.run.diagnostics,
          outputs: [...roleLoop.run.outputs, ...structuredOutputs],
          artifactOutcomes: [...(roleLoop.run.artifactOutcomes ?? []), artifactOutcome]
        };
        this.saveRunState(rootPath, lastRun);
        for (const output of structuredOutputs) {
          this.emit(rootPath, lastRun, {
            type: output.kind === 'repaired' ? 'repair.applied' : 'assistant.output',
            message: `生成 ${target.title} 的 ${output.kind} 输出`,
            metadata: {
              targetPath: absolutePath,
              outputKind: output.kind,
              qualityVerdict: output.qualityVerdict ?? null,
              qualityScore: output.qualityScore ?? null
            }
          });
        }
      } catch (error) {
        const runtimeError = normalizeRuntimeError(error);
        lastRun = {
          ...roleLoop.run,
          updatedAt: nowIso(),
          status: 'failed',
          errorMessage: runtimeError.message,
          diagnostics: [
            ...roleLoop.run.diagnostics,
            `artifact-generation-error:${target.path}:${runtimeError.message}`
          ],
          outputs: [...roleLoop.run.outputs, ...structuredOutputs],
          artifactOutcomes: artifactOutcome
            ? [...(roleLoop.run.artifactOutcomes ?? []), artifactOutcome]
            : (roleLoop.run.artifactOutcomes ?? []),
          recovery: this.createRecoveryState(roleLoop.run, 'recoverable', {
            reason: runtimeError.code
          })
        };
        this.saveRunState(rootPath, lastRun);
        this.emit(rootPath, lastRun, {
          type: 'run.failed',
          message: `${target.title} 生成失败：${runtimeError.message}`,
          metadata: {
            errorCode: runtimeError.code,
            profileId: roleLoop.selectedProfile.id,
            targetPath: absolutePath
          }
        });
        throw runtimeError;
      }
    }

    if (blockedArtifactMessages.length && lastRun) {
      lastRun = {
        ...lastRun,
        updatedAt: nowIso(),
        status: 'failed',
        errorMessage: blockedArtifactMessages.join(' | '),
        diagnostics: [...lastRun.diagnostics, ...blockedArtifactMessages.map((item) => `stage-artifact-blocked:${item}`)]
      };
      this.saveRunState(rootPath, lastRun);
      throw new Error(lastRun.errorMessage);
    }

    const nextMemory: AgentMemory = {
      ...memory,
      productIntent: memory.productIntent || session.messages.find((item) => item.role === 'user')?.content || '',
      updatedAt: nowIso()
    };
    this.projectService.saveAgentMemory(rootPath, nextMemory);
    this.projectService.saveWorkflow(rootPath, {
      ...workflow,
      stage,
      activeDocumentPath: generatedPaths[0] ?? workflow.activeDocumentPath
    });
    return {
      generatedPaths,
      agentMemory: nextMemory,
      runtimeRun: lastRun
    };
  }

  evaluateStageGuard(rootPath: string, sessionId: string, stage?: AppStage): StageGuardStatus {
    this.ensureProjectRuntime(rootPath);
    const workflow = this.projectService.loadWorkflow(rootPath);
    const sessions = this.projectService.loadSessions(rootPath);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('Target session not found.');
    }

    const activeStage = stage ?? session.stage ?? workflow.stage;
    const stageSessions = sessions.filter((item) => (item.stage ?? workflow.stage) === activeStage);
    const stageSessionIds = new Set(stageSessions.map((item) => item.id));
    const template = this.getTemplate(rootPath);
    const stageDocuments = template.stageDocuments[activeStage] ?? [];
    const contract = template.stageContracts?.[activeStage];
    const requiredArtifactPaths = new Set(contract?.requiredArtifactPaths ?? stageDocuments.map((target) => target.path));
    const artifactInvalidations = typeof (this.projectService as {
      recomputeArtifactGovernance?: (rootPath: string) => { invalidations: Array<{ status: string; artifactPath: string; message: string; recommendedNodeIds?: string[] }> };
    }).recomputeArtifactGovernance === 'function'
      ? (this.projectService as {
          recomputeArtifactGovernance: (rootPath: string) => { invalidations: Array<{ status: string; artifactPath: string; message: string; recommendedNodeIds?: string[] }> };
        }).recomputeArtifactGovernance(rootPath).invalidations.filter((item) => item.status === 'active')
      : [];
    const invalidationByPath = new Map(artifactInvalidations.map((item) => [item.artifactPath, item] as const));

    const artifacts: StageArtifactGuard[] = stageDocuments.map((target) => {
      const absolutePath = path.join(rootPath, target.path);
      const exists = fs.existsSync(absolutePath);
      const content = exists ? this.projectService.readFile(absolutePath) : '';
      const nonEmpty = exists && Boolean(content.trim());
      const schema = this.getArtifactSchema(rootPath, target.validatorId);
      const validation = nonEmpty
        ? validateArtifact(content, schema, this.buildArtifactValidationPolicy(target, schema))
        : {
            ok: false,
            structuralOk: false,
            message: exists ? 'Artifact is empty.' : 'Artifact has not been generated.',
            qualityTier: target.qualityTier ?? schema.qualityTier ?? 'assistive',
            qualityVerdict: 'blocked' as const,
            qualityScore: 0,
            qualityReasons: [exists ? 'artifact is empty' : 'artifact has not been generated']
          };
      return {
        path: target.path,
        title: target.title,
        purpose: target.purpose,
        exists,
        nonEmpty,
        valid: Boolean(nonEmpty && validation.ok),
        qualityTier: validation.qualityTier,
        qualityVerdict: validation.qualityVerdict,
        qualityScore: validation.qualityScore,
        qualityReasons: validation.qualityReasons,
        invalidated: Boolean(invalidationByPath.get(target.path)),
        invalidationMessage: invalidationByPath.get(target.path)?.message,
        recommendedNodeIds: invalidationByPath.get(target.path)?.recommendedNodeIds ?? [],
        message: validation.ok ? undefined : validation.message
      };
    });

    const blockers: string[] = [];
    const warnings: string[] = [];
    const lastSuccessfulRun = this.listRuns(rootPath).find((run) =>
      run.kind === 'stage'
      && run.status === 'completed'
      && run.stage === activeStage
      && (!run.sessionId || stageSessionIds.has(run.sessionId))
    );

    const hasStageUserInput = stageSessions.some((stageSession) =>
      stageSession.messages.some((item) => item.role === 'user' && item.content.trim())
    );
    if (!hasStageUserInput) {
      blockers.push('No user input found for the current stage.');
    }
    if (!lastSuccessfulRun) {
      blockers.push('No successful run recorded for the current stage.');
    }

    for (const artifact of artifacts) {
      const invalidation = invalidationByPath.get(artifact.path);
      if (invalidation) {
        const invalidationMessage = `Artifact invalidated: ${artifact.title} (${invalidation.message})`;
        if (requiredArtifactPaths.has(artifact.path)) {
          blockers.push(invalidationMessage);
        } else {
          warnings.push(invalidationMessage);
        }
        continue;
      }
      if (artifact.exists && artifact.nonEmpty && artifact.valid) {
        continue;
      }
      const message = `Artifact check failed: ${artifact.title}${artifact.message ? ` (${artifact.message})` : ''}`;
      const required = requiredArtifactPaths.has(artifact.path);
      if (!required || contract?.blockingPolicy === 'allow_warnings') {
        warnings.push(message);
      } else {
        blockers.push(message);
      }
    }

    if (contract?.allowManualBypass) {
      warnings.push('This stage contract allows manual bypass, but bypass confirmation is not implemented yet.');
    }

    if (activeStage === 'review') {
      const latestRound = this.projectService.loadReviewRounds(rootPath).find((round) =>
        stageSessionIds.has(round.sessionId)
      );
      if (!latestRound) {
        blockers.push('Review stage has no completed review round.');
      } else {
        const pendingCount = latestRound.issues.filter((issue) => issue.state === 'pending').length;
        if (pendingCount) {
          blockers.push(`Review stage still has ${pendingCount} pending issues.`);
        }
      }
    }

    if (workflow.stage !== activeStage) {
      warnings.push('Session stage does not match workflow stage.');
    }

    return {
      ok: blockers.length === 0,
      stage: activeStage,
      sessionId,
      blockers,
      warnings,
      artifacts,
      lastSuccessfulRunId: lastSuccessfulRun?.id
    };
  }

  async runReviewRound(
    rootPath: string,
    sessionId: string,
    documentPath: string,
    profiles: RoutableProviderProfile[],
    activeProviderProfileId: string
  ) {
    this.ensureProjectRuntime(rootPath);
    const template = this.getTemplate(rootPath);
    const source = this.projectService.readFile(documentPath);
    const blueExecution = this.resolveReviewExecutionBinding(rootPath, 'blue');
    const redExecution = this.resolveReviewExecutionBinding(rootPath, 'red');
    const judgeExecution = this.resolveReviewExecutionBinding(rootPath, 'judge');
    const blueRole = this.getRole(rootPath, blueExecution.roleId, {
      taskTemplateId: blueExecution.taskTemplateId,
      agentProfileId: blueExecution.agentProfileId
    });
    const redRole = this.getRole(rootPath, redExecution.roleId, {
      taskTemplateId: redExecution.taskTemplateId,
      agentProfileId: redExecution.agentProfileId
    });
    const judgeRole = this.getRole(rootPath, judgeExecution.roleId, {
      taskTemplateId: judgeExecution.taskTemplateId,
      agentProfileId: judgeExecution.agentProfileId
    });
    const bluePrompt = this.getPromptProfile(rootPath, template.review.bluePromptProfileId);
    const redPrompt = this.getPromptProfile(rootPath, template.review.redPromptProfileId);
    const judgePrompt = this.getPromptProfile(rootPath, template.review.judgePromptProfileId);
    const blueSkillInstructions = this.readSkillInstructionsSafe(
      this.collectRuntimeSkillIds(rootPath, sessionId, blueRole.allowedSkillIds)
    );
    const redSkillInstructions = this.readSkillInstructionsSafe(
      this.collectRuntimeSkillIds(rootPath, sessionId, redRole.allowedSkillIds)
    );
    const judgeSkillInstructions = this.readSkillInstructionsSafe(
      this.collectRuntimeSkillIds(rootPath, sessionId, judgeRole.allowedSkillIds)
    );

    const blue = await this.runRoleLoop({
      rootPath,
      kind: 'review',
      sessionId,
      stage: 'review',
      role: blueRole,
      profiles,
      activeProviderProfileId,
      system: [bluePrompt.systemPrompt, blueSkillInstructions ? `当前启用技能：\n${blueSkillInstructions}` : ''].filter(Boolean).join('\n\n'),
      user: source,
      allowedCapabilities: blueRole.allowedCapabilities,
      contextDocumentPaths: [documentPath],
      provenance: ['review.blue']
    });

    const red = await this.runRoleLoop({
      rootPath,
      kind: 'review',
      sessionId,
      stage: 'review',
      role: redRole,
      profiles,
      activeProviderProfileId,
      system: [redPrompt.systemPrompt, redSkillInstructions ? `当前启用技能：\n${redSkillInstructions}` : ''].filter(Boolean).join('\n\n'),
      user: source,
      allowedCapabilities: redRole.allowedCapabilities,
      contextDocumentPaths: [documentPath],
      provenance: ['review.red']
    });

    const judge = await this.runRoleLoop({
      rootPath,
      kind: 'review',
      sessionId,
      stage: 'review',
      role: judgeRole,
      profiles,
      activeProviderProfileId,
      system: [judgePrompt.systemPrompt, judgeSkillInstructions ? `当前启用技能：\n${judgeSkillInstructions}` : ''].filter(Boolean).join('\n\n'),
      user: `蓝军结果：\n${blue.finalText}\n\n红军结果：\n${red.finalText}`,
      allowedCapabilities: judgeRole.allowedCapabilities,
      contextDocumentPaths: [documentPath],
      provenance: ['review.judge']
    });

    const issueSchema = this.getArtifactSchema(rootPath, template.review.validatorId);
    const redStructured = await this.structuredGeneration.coerceMarkdown(
      this.profileToSettings(red.selectedProfile),
      {
        system: `${redPrompt.systemPrompt}\n\n必须输出 Markdown 列表，每一行都以 "- " 开头。`,
        user: source
      },
      issueSchema,
      red.finalText
    );
    red.run.outputs = [...red.run.outputs, ...redStructured.outputs];
    red.run.updatedAt = nowIso();
    this.saveRunState(rootPath, red.run);
    const issueValidation = validateArtifact(redStructured.content, issueSchema);
    if (!issueValidation.ok || !issueValidation.issues?.length) {
      throw new Error(issueValidation.message || '审查问题列表校验失败。');
    }

    const round: ReviewRound = {
      id: randomUUID(),
      sessionId,
      stage: 'review',
      documentPath,
      createdAt: nowIso(),
      status: 'completed',
      blueOutput: blue.finalText,
      redFeedback: redStructured.content,
      summary: judge.finalText,
      diagnostics: [...blue.run.diagnostics, ...red.run.diagnostics, ...judge.run.diagnostics],
      issues: issueValidation.issues
    };
    this.projectService.saveReviewRounds(rootPath, [round, ...this.projectService.loadReviewRounds(rootPath)]);
    return round;
  }

  async generateOpenSpec(rootPath: string) {
    const workflow = this.projectService.loadWorkflow(rootPath);
    if (!workflow.confirmedStages.includes('plan')) {
      throw new Error('At least the plan stage must be confirmed before generating OpenSpec.');
    }

    const template = this.getTemplate(rootPath);
    const openspecMapping = resolveRuntimeExportMapping(template).openspec;
    if (!openspecMapping.enabled) {
      throw new Error('Current template does not enable OpenSpec handoff.');
    }

    const manifest = this.projectService.openProject(rootPath).manifest;
    const sourceDocuments = collectOpenSpecSourceDocuments(template, workflow);
    const sourceArtifacts = collectOpenSpecSourceArtifacts(
      rootPath,
      sourceDocuments,
      (filePath) => this.projectService.readFile(filePath),
      (filePath) => fs.existsSync(filePath)
    );
    if (!sourceArtifacts.length) {
      throw new Error('Current template has no confirmed artifacts available for OpenSpec handoff.');
    }

    const changeName = `p001-${slugifyChangeName(`deliver-${manifest.name}`)}`;
    const capability = slugifyChangeName(`${manifest.name}-delivery`);
    const openspecRoot = path.join(rootPath, resolveOpenSpecWorkspaceRoot(template));
    const changeRoot = path.join(openspecRoot, 'changes', changeName);
    const exportFormatSummary = (Object.entries(resolveRuntimeExportMapping(template))
      .filter(([, mapping]) => mapping.enabled)
      .map(([format]) => {
        if (format === 'text') return 'txt';
        return format;
      })
      .join(' + ')) || 'template-defined delivery formats';
    this.ensureOpenSpecDirectories(rootPath, openspecRoot, changeRoot, capability);

    const roadmapPath = path.join(openspecRoot, 'roadmap.md');
    this.projectService.saveFile(roadmapPath, buildOpenSpecRoadmapV2(manifest.name, changeName, sourceArtifacts));
    this.projectService.saveFile(path.join(changeRoot, 'proposal.md'), buildOpenSpecProposal(manifest.name, sourceArtifacts));
    this.projectService.saveFile(path.join(changeRoot, 'design.md'), buildOpenSpecDesign(template, sourceArtifacts));
    this.projectService.saveFile(path.join(changeRoot, 'tasks.md'), buildOpenSpecTasks(sourceArtifacts, {
      exportRoot: openspecMapping.outputPathPattern,
      exportFormatSummary
    }));
    this.projectService.saveFile(path.join(changeRoot, 'specs', capability, 'spec.md'), buildOpenSpecSpec(changeName));

    const exportPackage = await this.deliveryExporter.exportDeterministicPackage({
      rootPath,
      template,
      artifactSchemas: this.runtimeAssets.loadArtifactSchemas(rootPath),
      changeName,
      changeRoot,
      roadmapPath
    });

    return {
      changeName,
      changeRoot,
      roadmapPath,
      exportPackage
    };
  }

  private executeParallelSplitDebugNode(
    rootPath: string,
    run: RuntimeRun,
    flow: PlatformFlowAsset,
    node: PlatformFlowNode
  ) {
    this.ensureRunCollections(run);
    const outgoing = flowOutgoingEdges(flow, node.id);
    const joinNodeId = resolveDeterministicJoinNodeId(flow, node.id);
    const joinNode = joinNodeId ? flowNode(flow, joinNodeId) : null;
    const createdAt = nowIso();
    const groupScope = this.createScope(run, 'branch-group', node.data.label, {
      parentScopeId: this.rootScope(run)?.id,
      nodeId: node.id,
      flowId: flow.id,
      metadata: {
        joinNodeId: joinNodeId ?? null
      }
    });
    const branchGroup: RuntimeBranchGroup = {
      id: randomUUID(),
      forkNodeId: node.id,
      joinNodeId,
      strategy: joinNode?.data.mergeStrategy ?? 'collect_all',
      status: 'running',
      createdAt,
      updatedAt: createdAt,
      scopeId: groupScope.id,
      branches: outgoing.map((edge, index) => {
        const branchNode = flowNode(flow, edge.target);
        const branchScope = this.createScope(run, 'branch', branchNode?.data.label ?? `Branch ${index + 1}`, {
          parentScopeId: groupScope.id,
          nodeId: edge.target,
          flowId: flow.id
        });
        return {
          id: randomUUID(),
          nodeId: edge.target,
          label: branchNode?.data.label ?? `Branch ${index + 1}`,
          status: 'pending',
          scopeId: branchScope.id,
          outputIds: []
        } satisfies RuntimeBranchRecord;
      })
    };
    run.branchGroups = [...(run.branchGroups ?? []), branchGroup];
    this.emit(rootPath, run, {
      type: 'branch.group-started',
      message: `Started branch group for ${node.data.label}`,
      metadata: {
        forkNodeId: node.id,
        joinNodeId: joinNodeId ?? null,
        branchCount: branchGroup.branches.length
      }
    });
    this.emit(rootPath, run, {
      type: 'branch.join-waiting',
      message: `Waiting at join ${joinNodeId ?? 'unknown'}`,
      metadata: {
        branchGroupId: branchGroup.id,
        joinNodeId: joinNodeId ?? null,
        completedBranches: 0,
        totalBranches: branchGroup.branches.length
      }
    });

    const summaries: string[] = [];
    const failureStrategy = node.data.parallelFailureStrategy ?? 'manual_review';
    const cancellationPolicy = node.data.parallelCancellationPolicy ?? (branchGroup.strategy === 'first_success' ? 'cancel_pending' : 'wait_all');
    let winningBranchId: string | undefined;
    for (const branch of branchGroup.branches) {
      if (winningBranchId && branchGroup.strategy === 'first_success' && cancellationPolicy === 'cancel_pending') {
        branch.status = 'skipped';
        branch.completedAt = nowIso();
        this.finalizeScope(run, branch.scopeId!, 'skipped');
        continue;
      }
      branch.status = 'running';
      branch.startedAt = nowIso();
      branchGroup.updatedAt = branch.startedAt;
      this.emit(rootPath, run, {
        type: 'branch.started',
        message: `Started branch ${branch.label}`,
        metadata: {
          branchGroupId: branchGroup.id,
          branchId: branch.id,
          nodeId: branch.nodeId
        }
      });
      const branchNode = flowNode(flow, branch.nodeId);
      const failureReason = this.inferDebugNodeFailure(branchNode);
      if (failureReason) {
        branch.status = 'failed';
        branch.errorMessage = failureReason;
        branch.completedAt = nowIso();
        branchGroup.updatedAt = branch.completedAt;
        this.finalizeScope(run, branch.scopeId!, 'failed', { errorMessage: failureReason });
        this.emit(rootPath, run, {
          type: 'branch.completed',
          message: `Branch ${branch.label} failed`,
          metadata: {
            branchGroupId: branchGroup.id,
            branchId: branch.id,
            nodeId: branch.nodeId,
            status: 'failed',
            errorMessage: failureReason
          }
        });
        if (failureStrategy === 'fail_fast') {
          branchGroup.status = 'failed';
          for (const sibling of branchGroup.branches.filter((item) => item.id !== branch.id && item.status === 'pending')) {
            sibling.status = 'skipped';
            sibling.completedAt = nowIso();
            this.finalizeScope(run, sibling.scopeId!, 'skipped');
          }
          run.status = 'failed';
          run.updatedAt = nowIso();
          run.errorMessage = failureReason;
          run.recovery = this.createRecoveryState(run, 'recoverable', {
            reason: 'parallel-branch-failed'
          });
          this.finalizeScope(run, groupScope.id, 'failed', { errorMessage: failureReason });
          break;
        }
        continue;
      }
      const branchOutput = {
        id: randomUUID(),
        createdAt: nowIso(),
        kind: 'final',
        label: `branch-${branch.label}`,
        contentType: 'text',
        content: `Branch ${branch.label} reached ${branch.nodeId}.`
      } satisfies RuntimeOutputRecord;
      run.outputs.push(branchOutput);
      this.attachOutputToScope(run, branch.scopeId, branchOutput);
      branch.outputIds.push(branchOutput.id);
      const branchCheckpoint = this.recordCheckpoint(rootPath, run, {
        turn: run.checkpoints.length + 1,
        summary: `Completed branch ${branch.label}`,
        status: 'completed',
        nodeId: branch.nodeId,
        contextPackId: run.contextPackId,
        scopeId: branch.scopeId,
        currentStep: `Completed branch ${branch.label}`
      });
      branch.status = 'completed';
      branch.completedAt = branchCheckpoint.createdAt;
      branch.checkpointId = branchCheckpoint.id;
      branchGroup.updatedAt = branchCheckpoint.createdAt;
      this.finalizeScope(run, branch.scopeId!, 'completed', { checkpointId: branchCheckpoint.id });
      summaries.push(branchOutput.content);
      if (!winningBranchId && branchGroup.strategy === 'first_success') {
        winningBranchId = branch.id;
      }
      this.emit(rootPath, run, {
        type: 'branch.completed',
        message: `Completed branch ${branch.label}`,
        metadata: {
          branchGroupId: branchGroup.id,
          branchId: branch.id,
          nodeId: branch.nodeId,
          checkpointId: branchCheckpoint.id,
          status: 'completed'
        }
      });
    }

    if (run.status !== 'failed') {
      const completedBranches = branchGroup.branches.filter((item) => item.status === 'completed');
      const failedBranches = branchGroup.branches.filter((item) => item.status === 'failed');
      if (branchGroup.strategy === 'first_success' && completedBranches.length) {
        if (cancellationPolicy === 'cancel_pending') {
          for (const branch of branchGroup.branches.filter((item) => item.status === 'pending' || item.status === 'running')) {
            branch.status = 'skipped';
            branch.completedAt = nowIso();
            this.finalizeScope(run, branch.scopeId!, 'skipped');
          }
        }
        branchGroup.status = 'joined';
      } else if (failedBranches.length && failureStrategy === 'manual_review') {
        branchGroup.status = 'failed';
        run.status = 'failed';
        run.updatedAt = nowIso();
        run.errorMessage = failedBranches[0]?.errorMessage ?? 'Parallel branch failed.';
        run.recovery = this.createRecoveryState(run, 'recoverable', {
          reason: 'parallel-manual-review'
        });
      } else {
        branchGroup.status = 'joined';
      }
    }
    branchGroup.updatedAt = nowIso();
    const summaryOutput = {
      id: randomUUID(),
      createdAt: nowIso(),
      kind: 'final',
      label: 'parallel-join-summary',
      contentType: 'text',
      content: `Parallel branches completed (${branchGroup.branches.length}): ${summaries.join(' | ') || '无成功支路输出'}`
    } satisfies RuntimeOutputRecord;
    run.outputs.push(summaryOutput);
    this.attachOutputToScope(run, groupScope.id, summaryOutput);
    const joinCheckpoint = this.recordCheckpoint(rootPath, run, {
      turn: run.checkpoints.length + 1,
      summary: `Released join ${joinNodeId ?? 'unknown'}`,
      status: 'completed',
      nodeId: joinNodeId ?? node.id,
      contextPackId: run.contextPackId,
      scopeId: groupScope.id,
      currentStep: `Released join ${joinNodeId ?? 'unknown'}`
    });
    this.finalizeScope(run, groupScope.id, branchGroup.status === 'failed' ? 'failed' : 'completed', {
      checkpointId: joinCheckpoint.id,
      errorMessage: run.errorMessage
    });
    if (run.status !== 'failed') {
      run.status = 'completed';
      run.updatedAt = nowIso();
      run.usage = usageForText(node.data.label, summaries.join('\n'));
    }
    this.emit(rootPath, run, {
      type: 'branch.join-released',
      message: `Released join ${joinNodeId ?? 'unknown'}`,
      metadata: {
        branchGroupId: branchGroup.id,
        joinNodeId: joinNodeId ?? null,
        completedBranches: branchGroup.branches.filter((item) => item.status === 'completed').length,
        totalBranches: branchGroup.branches.length,
        status: branchGroup.status
      }
    });
  }

  private executeParallelJoinDebugNode(
    rootPath: string,
    run: RuntimeRun,
    flow: PlatformFlowAsset,
    node: PlatformFlowNode
  ) {
    this.ensureRunCollections(run);
    const incoming = flowIncomingEdges(flow, node.id);
    const createdAt = nowIso();
    const joinScope = this.createScope(run, 'branch-group', node.data.label, {
      parentScopeId: this.rootScope(run)?.id,
      nodeId: node.id,
      flowId: flow.id
    });
    const branchGroup: RuntimeBranchGroup = {
      id: randomUUID(),
      forkNodeId: incoming[0]?.source ?? node.id,
      joinNodeId: node.id,
      strategy: node.data.mergeStrategy ?? 'collect_all',
      status: 'joined',
      createdAt,
      updatedAt: createdAt,
      scopeId: joinScope.id,
      branches: incoming.map((edge, index) => ({
        id: randomUUID(),
        nodeId: edge.source,
        label: flowNode(flow, edge.source)?.data.label ?? `Incoming ${index + 1}`,
        status: 'completed',
        startedAt: createdAt,
        completedAt: createdAt,
        scopeId: this.createScope(run, 'branch', flowNode(flow, edge.source)?.data.label ?? `Incoming ${index + 1}`, {
          parentScopeId: joinScope.id,
          nodeId: edge.source,
          flowId: flow.id
        }).id,
        outputIds: []
      }))
    };
    run.branchGroups = [...(run.branchGroups ?? []), branchGroup];
    this.emit(rootPath, run, {
      type: 'branch.join-waiting',
      message: `Join ${node.id} inspected`,
      metadata: {
        branchGroupId: branchGroup.id,
        joinNodeId: node.id,
        completedBranches: branchGroup.branches.length,
        totalBranches: branchGroup.branches.length
      }
    });
    const output = {
      id: randomUUID(),
      createdAt,
      kind: 'final',
      label: 'parallel-join-node',
      contentType: 'text',
      content: `Join ${node.data.label} merged ${branchGroup.branches.length} incoming branches with ${branchGroup.strategy}.`
    } satisfies RuntimeOutputRecord;
    run.outputs.push(output);
    this.attachOutputToScope(run, joinScope.id, output);
    const joinCheckpoint = this.recordCheckpoint(rootPath, run, {
      turn: run.checkpoints.length + 1,
      summary: `Join ${node.data.label} released`,
      status: 'completed',
      nodeId: node.id,
      contextPackId: run.contextPackId,
      scopeId: joinScope.id,
      currentStep: `Join ${node.data.label} released`
    });
    this.finalizeScope(run, joinScope.id, 'completed', { checkpointId: joinCheckpoint.id });
    run.status = 'completed';
    run.updatedAt = nowIso();
    run.usage = usageForText(node.data.label, String(branchGroup.branches.length));
    this.emit(rootPath, run, {
      type: 'branch.join-released',
      message: `Released join ${node.id}`,
      metadata: {
        branchGroupId: branchGroup.id,
        joinNodeId: node.id,
        completedBranches: branchGroup.branches.length,
        totalBranches: branchGroup.branches.length
      }
    });
  }

  private executeLoopDebugNode(
    rootPath: string,
    run: RuntimeRun,
    flow: PlatformFlowAsset,
    node: PlatformFlowNode
  ) {
    this.ensureRunCollections(run);
    const createdAt = nowIso();
    const loopScope = this.createScope(run, 'loop', node.data.label, {
      parentScopeId: this.rootScope(run)?.id,
      nodeId: node.id,
      flowId: flow.id
    });
    const loopRecord: RuntimeLoopRecord = {
      id: randomUUID(),
      nodeId: node.id,
      status: 'running',
      exitReason: 'exit-condition',
      maxIterations: Math.max(1, node.data.maxIterations ?? 1),
      timeoutMs: node.data.loopTimeoutMs,
      iterationScopeIds: [],
      startedAt: createdAt,
      scopeId: loopScope.id
    };
    run.loops = [...(run.loops ?? []), loopRecord];
    this.emit(rootPath, run, {
      type: 'loop.started',
      message: `Started loop ${node.data.label}`,
      metadata: {
        nodeId: node.id,
        maxIterations: loopRecord.maxIterations
      }
    });

    const timedOut = typeof node.data.loopTimeoutMs === 'number' && node.data.loopTimeoutMs > 0 && node.data.loopTimeoutMs < 100;
    const iterationCount = timedOut ? 1 : (loopRecord.maxIterations === 1 ? 1 : Math.min(2, loopRecord.maxIterations));
    for (let index = 0; index < iterationCount; index += 1) {
      const iterationScope = this.createScope(run, 'loop-iteration', `${node.data.label} / 第 ${index + 1} 轮`, {
        parentScopeId: loopScope.id,
        nodeId: node.id,
        flowId: flow.id,
        metadata: {
          iteration: index + 1
        }
      });
      loopRecord.iterationScopeIds.push(iterationScope.id);
      this.emit(rootPath, run, {
        type: 'loop.iteration.started',
        message: `Started iteration ${index + 1} for ${node.data.label}`,
        metadata: {
          nodeId: node.id,
          iteration: index + 1
        }
      });
      const output = {
        id: randomUUID(),
        createdAt: nowIso(),
        kind: 'final',
        label: `loop-iteration-${index + 1}`,
        contentType: 'text',
        content: `第 ${index + 1} 轮处理：循环回边 ${node.data.loopBackTargetId || '未设置'}，退出目标 ${node.data.exitTargetId || '未设置'}。`
      } satisfies RuntimeOutputRecord;
      run.outputs.push(output);
      this.attachOutputToScope(run, iterationScope.id, output);
      const iterationCheckpoint = this.recordCheckpoint(rootPath, run, {
        turn: run.checkpoints.length + 1,
        summary: `Loop iteration ${index + 1} completed`,
        status: 'completed',
        nodeId: node.id,
        contextPackId: run.contextPackId,
        scopeId: iterationScope.id,
        currentStep: `Loop iteration ${index + 1} completed`
      });
      this.finalizeScope(run, iterationScope.id, 'completed', { checkpointId: iterationCheckpoint.id });
      this.emit(rootPath, run, {
        type: 'loop.iteration.completed',
        message: `Completed iteration ${index + 1} for ${node.data.label}`,
        metadata: {
          nodeId: node.id,
          iteration: index + 1,
          checkpointId: iterationCheckpoint.id
        }
      });
    }

    const summary = {
      id: randomUUID(),
      createdAt: nowIso(),
      kind: 'final',
      label: 'loop-summary',
      contentType: 'text',
      content: `循环 ${node.data.label} 已执行 ${iterationCount} 轮；最大轮次 ${loopRecord.maxIterations}。`
    } satisfies RuntimeOutputRecord;
    run.outputs.push(summary);
    this.attachOutputToScope(run, loopScope.id, summary);
    const loopCheckpoint = this.recordCheckpoint(rootPath, run, {
      turn: run.checkpoints.length + 1,
      summary: `Loop ${node.data.label} finished`,
      status: 'completed',
      nodeId: node.id,
      contextPackId: run.contextPackId,
      scopeId: loopScope.id,
      currentStep: `Loop ${node.data.label} finished`
    });

    if (timedOut) {
      loopRecord.status = 'timed-out';
      loopRecord.exitReason = 'timeout';
      loopRecord.completedAt = nowIso();
      this.finalizeScope(run, loopScope.id, 'failed', { checkpointId: loopCheckpoint.id, errorMessage: 'Loop timed out.' });
      run.status = 'failed';
      run.updatedAt = nowIso();
      run.errorMessage = 'Loop timed out before satisfying exit condition.';
      run.recovery = this.createRecoveryState(run, 'recoverable', {
        reason: 'loop-timeout'
      });
      this.emit(rootPath, run, {
        type: 'loop.guard-stopped',
        message: `Loop ${node.data.label} timed out`,
        metadata: {
          nodeId: node.id,
          timeoutMs: node.data.loopTimeoutMs ?? null
        }
      });
      return;
    }

    if (loopRecord.maxIterations === 1) {
      loopRecord.status = 'guard-stopped';
      loopRecord.exitReason = 'max-iterations';
      loopRecord.completedAt = nowIso();
      this.finalizeScope(run, loopScope.id, 'stopped', { checkpointId: loopCheckpoint.id });
      run.status = 'stopped';
      run.updatedAt = nowIso();
      run.recovery = this.createRecoveryState(run, 'recoverable', {
        reason: 'loop-guard-stopped'
      });
      this.emit(rootPath, run, {
        type: 'loop.guard-stopped',
        message: `Loop ${node.data.label} stopped at max iteration guard`,
        metadata: {
          nodeId: node.id,
          maxIterations: loopRecord.maxIterations
        }
      });
      return;
    }

    loopRecord.status = 'completed';
    loopRecord.exitReason = 'exit-condition';
    loopRecord.completedAt = nowIso();
    this.finalizeScope(run, loopScope.id, 'completed', { checkpointId: loopCheckpoint.id });
    run.status = 'completed';
    run.updatedAt = nowIso();
    run.usage = usageForText(node.data.label, summary.content);
    this.emit(rootPath, run, {
      type: 'loop.exit-satisfied',
      message: `Loop ${node.data.label} satisfied exit condition`,
      metadata: {
        nodeId: node.id,
        iterations: iterationCount
      }
    });
  }

  private executeSubflowDebugNode(
    rootPath: string,
    run: RuntimeRun,
    flow: PlatformFlowAsset,
    node: PlatformFlowNode,
    subflows: PlatformFlowAsset[]
  ) {
    this.ensureRunCollections(run);
    const targetSubflow = subflows.find((item) => item.id === node.data.subflowId) ?? null;
    const inputBindings = parseBindingPairs(node.data.subflowInputBindings).map((item) => item.raw);
    const outputBindings = parseBindingPairs(node.data.subflowOutputBindings).map((item) => item.raw);
    const createdAt = nowIso();
    const scope = this.createScope(run, 'subflow-call', node.data.label, {
      parentScopeId: this.rootScope(run)?.id,
      nodeId: node.id,
      flowId: flow.id,
      metadata: {
        subflowId: targetSubflow?.id ?? node.data.subflowId ?? null
      }
    });
    const call: RuntimeSubflowCallRecord = {
      id: randomUUID(),
      nodeId: node.id,
      subflowId: node.data.subflowId ?? '',
      status: 'running',
      parentFlowId: flow.id,
      childFlowId: targetSubflow?.id ?? node.data.subflowId ?? '',
      inputBindings: inputBindings.length ? inputBindings : (node.data.inputArtifactPaths ?? []).map((item) => `${item}=>${item}`),
      outputBindings: outputBindings.length ? outputBindings : (node.data.outputArtifactPaths ?? []).map((item) => `${item}=>${item}`),
      startedAt: createdAt,
      scopeId: scope.id,
      outputIds: []
    };
    run.subflowCalls = [...(run.subflowCalls ?? []), call];
    this.emit(rootPath, run, {
      type: 'subflow.started',
      message: `Started subflow ${call.childFlowId || 'unknown'}`,
      metadata: {
        nodeId: node.id,
        subflowId: call.childFlowId || null
      }
    });

    if (!targetSubflow) {
      call.status = 'failed';
      call.completedAt = nowIso();
      call.errorMessage = 'Subflow binding is missing or invalid.';
      this.finalizeScope(run, scope.id, 'failed', { errorMessage: call.errorMessage });
      run.status = 'failed';
      run.updatedAt = nowIso();
      run.errorMessage = call.errorMessage;
      run.recovery = this.createRecoveryState(run, 'recoverable', {
        reason: 'subflow-binding-invalid'
      });
      this.emit(rootPath, run, {
        type: 'subflow.failed',
        message: call.errorMessage,
        metadata: {
          nodeId: node.id,
          subflowId: node.data.subflowId ?? null
        }
      });
      return;
    }

    const childSteps = targetSubflow.nodes.filter((item) => !['start', 'end'].includes(item.type));
    const stepLines: string[] = [];
    for (const childNode of childSteps) {
      const childScope = this.createScope(run, 'node-attempt', childNode.data.label, {
        parentScopeId: scope.id,
        nodeId: childNode.id,
        flowId: targetSubflow.id
      });
      call.childScopeId = call.childScopeId ?? childScope.id;
      const childOutput = this.debugNonAgentNode(targetSubflow, childNode);
      run.outputs.push(childOutput);
      call.outputIds.push(childOutput.id);
      this.attachOutputToScope(run, childScope.id, childOutput);
      const childCheckpoint = this.recordCheckpoint(rootPath, run, {
        turn: run.checkpoints.length + 1,
        summary: `Subflow step ${childNode.data.label}`,
        status: 'completed',
        nodeId: childNode.id,
        contextPackId: run.contextPackId,
        scopeId: childScope.id,
        currentStep: `Subflow step ${childNode.data.label}`
      });
      this.finalizeScope(run, childScope.id, 'completed', { checkpointId: childCheckpoint.id });
      stepLines.push(`${childNode.data.label} -> ${childOutput.content}`);
    }

    const summary = {
      id: randomUUID(),
      createdAt: nowIso(),
      kind: 'final',
      label: 'subflow-summary',
      contentType: 'text',
      content: [
        `子流程：${targetSubflow.name}`,
        `输入映射：${call.inputBindings.join(' / ') || '无'}`,
        `输出映射：${call.outputBindings.join(' / ') || '无'}`,
        `执行节点：${childSteps.map((item) => item.data.label).join(' / ') || '无'}`
      ].join('\n')
    } satisfies RuntimeOutputRecord;
    run.outputs.push(summary);
    call.outputIds.push(summary.id);
    this.attachOutputToScope(run, scope.id, summary);
    const subflowCheckpoint = this.recordCheckpoint(rootPath, run, {
      turn: run.checkpoints.length + 1,
      summary: `Subflow ${targetSubflow.name} completed`,
      status: 'completed',
      nodeId: node.id,
      contextPackId: run.contextPackId,
      scopeId: scope.id,
      currentStep: `Subflow ${targetSubflow.name} completed`
    });
    this.finalizeScope(run, scope.id, 'completed', { checkpointId: subflowCheckpoint.id });
    call.status = 'completed';
    call.completedAt = nowIso();
    run.status = 'completed';
    run.updatedAt = nowIso();
    run.usage = usageForText(node.data.label, stepLines.join('\n'));
    this.emit(rootPath, run, {
      type: 'subflow.completed',
      message: `Completed subflow ${targetSubflow.name}`,
      metadata: {
        nodeId: node.id,
        subflowId: targetSubflow.id,
        stepCount: childSteps.length
      }
    });
  }

  private suspendApprovalDebugNode(
    rootPath: string,
    run: RuntimeRun,
    node: PlatformFlowNode
  ) {
    const createdAt = nowIso();
    const approval: RuntimeApprovalRecord = {
      id: randomUUID(),
      nodeId: node.id,
      status: 'pending',
      prompt: node.data.approvalPrompt?.trim() || `Await approval for ${node.data.label}.`,
      createdAt,
      updatedAt: createdAt,
      rollbackNodeId: node.data.approvalRollbackNodeId
    };
    run.pendingApprovals = [...(run.pendingApprovals ?? []), approval];
    run.outputs.push({
      id: randomUUID(),
      createdAt,
      kind: 'final',
      label: 'approval-wait',
      contentType: 'text',
      content: approval.prompt
    });
    this.recordCheckpoint(rootPath, run, {
      turn: run.checkpoints.length + 1,
      summary: `Waiting for approval on ${node.data.label}`,
      status: 'waiting-approval',
      nodeId: node.id,
      contextPackId: run.contextPackId,
      currentStep: `Waiting for approval on ${node.data.label}`
    });
    run.status = 'waiting-approval';
    run.updatedAt = createdAt;
    run.recovery = this.createRecoveryState(run, 'recoverable', {
      reason: 'approval-pending'
    });
    this.emit(rootPath, run, {
      type: 'approval.waiting',
      message: `Waiting for approval on ${node.data.label}`,
      metadata: {
        approvalId: approval.id,
        nodeId: node.id,
        rollbackNodeId: approval.rollbackNodeId ?? null
      }
    });
  }

  private inferDebugNodeFailure(node: PlatformFlowNode | null) {
    if (!node) return 'Branch target node is missing.';
    if (node.type === 'subflow' && !node.data.subflowId) {
      return 'Branch subflow node is missing subflow binding.';
    }
    if (node.type === 'tool' && !node.data.toolId && !node.data.connectorId) {
      return 'Branch tool node has no connector or script binding.';
    }
    if (node.type === 'agent' && !node.data.roleId) {
      return 'Branch agent node has no role binding.';
    }
    if (node.type === 'artifact' && !node.data.artifactPath) {
      return 'Branch artifact node has no artifact path.';
    }
    return null;
  }

  private debugNonAgentNode(flow: { edges: Array<{ source: string; target: string }> }, node: { id: string; type: string; data: Record<string, any> }): RuntimeOutputRecord {
    let content = '';
    switch (node.type) {
      case 'tool':
        content = node.data.toolId
          ? `工具节点已绑定脚本工具：${node.data.toolId}`
          : node.data.connectorId
            ? `工具节点已绑定连接：${node.data.connectorId}`
            : '工具节点尚未绑定连接或脚本工具。';
        break;
      case 'artifact':
        content = node.data.artifactPath
          ? `工件节点指向：${node.data.artifactPath}`
          : '工件节点尚未设置路径。';
        break;
      case 'condition':
        content = [
          `条件表达式：${node.data.conditionExpression || '未设置'}`,
          `是分支：${node.data.trueTargetId || '未设置'}`,
          `否分支：${node.data.falseTargetId || '未设置'}`
        ].join('\n');
        break;
      case 'loop':
        content = [
          `循环条件：${node.data.loopExpression || '未设置'}`,
          `退出条件：${node.data.exitExpression || '未设置'}`,
          `最大轮次：${node.data.maxIterations ?? '未设置'}`,
          `超时保护：${node.data.loopTimeoutMs ?? '未设置'}`,
          `失败策略：${node.data.loopFailurePolicy || 'guard_fail'}`,
          `循环回边：${node.data.loopBackTargetId || '未设置'}`,
          `退出目标：${node.data.exitTargetId || '未设置'}`
        ].join('\n');
        break;
      case 'parallel_split':
        content = [
          `并行模式：${node.data.parallelMode || 'fanout'}`,
          `失败策略：${node.data.parallelFailureStrategy || 'manual_review'}`,
          `取消策略：${node.data.parallelCancellationPolicy || 'wait_all'}`,
          `共享工件：${node.data.sharedBoardArtifactPath || '未设置'}`,
          `向外分支数：${flow.edges.filter((edge) => edge.source === node.id).length}`
        ].join('\n');
        break;
      case 'parallel_join':
        content = [
          `汇合策略：${node.data.mergeStrategy || 'collect_all'}`,
          `进入分支数：${flow.edges.filter((edge) => edge.target === node.id).length}`
        ].join('\n');
        break;
      case 'subflow':
        content = node.data.subflowId
          ? [
              `子流程节点已绑定：${node.data.subflowId}`,
              `输入映射：${(node.data.subflowInputBindings ?? []).join(' / ') || '未设置'}`,
              `输出映射：${(node.data.subflowOutputBindings ?? []).join(' / ') || '未设置'}`
            ].join('\n')
          : '子流程节点尚未绑定子流程。';
        break;
      default:
        content = String(node.data.description || node.data.label || '节点调试结果为空。');
        break;
    }
    return {
      id: randomUUID(),
      createdAt: nowIso(),
      kind: 'final',
      label: 'node-debug',
      contentType: 'text',
      content
    };
  }

  private ensureOpenSpecDirectories(projectRoot: string, openspecRoot: string, changeRoot: string, capability: string) {
    if (!pathExists(path.join(openspecRoot, 'changes'))) {
      this.projectService.createDirectory(projectRoot, openspecRoot, 'changes');
    }
    if (!pathExists(changeRoot)) {
      this.projectService.createDirectory(projectRoot, path.join(openspecRoot, 'changes'), path.basename(changeRoot));
    }
    if (!pathExists(path.join(changeRoot, 'specs'))) {
      this.projectService.createDirectory(projectRoot, changeRoot, 'specs');
    }
    if (!pathExists(path.join(changeRoot, 'specs', capability))) {
      this.projectService.createDirectory(projectRoot, path.join(changeRoot, 'specs'), capability);
    }
  }

  private getTemplate(rootPath: string) {
    const project = this.projectService.openProject(rootPath);
    const templateId = project.manifest.templateId ?? this.projectService.loadPlatformAssets(rootPath).template?.id;
    if (!templateId) {
      throw new Error('Current project is missing a template id.');
    }
    const template = this.runtimeAssets.loadTemplate(rootPath, templateId);
    if (!template) {
      throw new Error(`Runtime template asset not found: ${templateId}`);
    }
    return normalizeRuntimeTemplate(template);
  }

  private getPromptProfile(rootPath: string, promptProfileId: string) {
    const profile = this.runtimeAssets.loadPromptProfiles(rootPath).find((item) => item.id === promptProfileId) ?? null;
    if (!profile) {
      throw new Error(`未找到 Prompt Profile：${promptProfileId}`);
    }
    return profile;
  }

  private getArtifactSchema(rootPath: string, schemaId: string): ArtifactSchemaAsset {
    const schema = this.runtimeAssets.loadArtifactSchemas(rootPath).find((item) => item.id === schemaId) ?? null;
    if (!schema) {
      throw new Error(`未找到 Artifact Schema：${schemaId}`);
    }
    return schema;
  }

  private getBaseRole(rootPath: string, roleId: string): PlatformRole {
    const role = this.projectService.loadPlatformAssets(rootPath).roles.find((item) => item.id === roleId) ?? null;
    if (!role) {
      throw new Error(`未找到角色：${roleId}`);
    }
    return role;
  }

  private getTaskTemplate(rootPath: string, taskTemplateId: string) {
    return this.projectService.loadPlatformAssets(rootPath).taskTemplates.find((item) => item.id === taskTemplateId) ?? null;
  }

  private getAgentProfile(rootPath: string, agentProfileId: string) {
    return this.projectService.loadPlatformAssets(rootPath).agentProfiles.find((item) => item.id === agentProfileId) ?? null;
  }

  private resolveStageExecutionBinding(rootPath: string, stage: AppStage): RuntimeExecutionBinding {
    const template = this.getTemplate(rootPath);
    const explicit = template.stageExecutionProfiles?.[stage];
    const hasExplicitRole = explicit?.roleId
      && this.projectService.loadPlatformAssets(rootPath).roles.some((item) => item.id === explicit.roleId);
    return hasExplicitRole ? explicit : {
      roleId: template.stageRoleIds[stage]
    };
  }

  private resolveReviewExecutionBinding(rootPath: string, reviewer: 'blue' | 'red' | 'judge'): RuntimeExecutionBinding {
    const template = this.getTemplate(rootPath);
    const explicit = template.review.executionProfiles?.[reviewer];
    if (explicit?.roleId && this.projectService.loadPlatformAssets(rootPath).roles.some((item) => item.id === explicit.roleId)) {
      return explicit;
    }

    if (reviewer === 'blue') {
      return { roleId: template.stageRoleIds.review };
    }
    if (reviewer === 'red') {
      return { roleId: this.getRoleIdByName(rootPath, '红军') ?? template.stageRoleIds.review };
    }
    return { roleId: this.getRoleIdByName(rootPath, '裁判') ?? template.stageRoleIds.review };
  }

  private readSkillInstructionsSafe(skillIds: string[]) {
    if (typeof this.skillRegistry.readSkillInstructions !== 'function') {
      return '';
    }
    return this.skillRegistry.readSkillInstructions(Array.from(new Set(skillIds.filter(Boolean))));
  }

  private collectRuntimeSkillIds(rootPath: string, sessionId?: string, roleSkillIds?: string[]) {
    const projectSkillIds = typeof this.projectService.loadProjectSkillIds === 'function'
      ? this.projectService.loadProjectSkillIds(rootPath)
      : [];
    const sessionSkillIds = sessionId && typeof this.projectService.loadSessionSkillIds === 'function'
      ? this.projectService.loadSessionSkillIds(rootPath)[sessionId] ?? []
      : [];
    return Array.from(new Set([
      ...(roleSkillIds ?? []),
      ...projectSkillIds,
      ...sessionSkillIds
    ].filter(Boolean)));
  }

  private resolveRoleBundle(
    rootPath: string,
    roleId: string,
    nodeBindings?: {
      taskTemplateId?: string;
      agentProfileId?: string;
      connectorId?: string;
      toolId?: string;
      toolIds?: string[];
      skillIds?: string[];
    }
  ): ResolvedRoleRuntimeBundle {
    const role = this.getBaseRole(rootPath, roleId);
    const roleDir = path.join(rootPath, '.project', 'platform', 'roles', role.id);
    const snapshot = fs.existsSync(roleDir)
      ? loadRolePackageDirectory(roleDir)
      : {
          rolePackage: {
            id: role.id,
            name: role.name,
            version: role.packageVersion ?? '1.0.0',
            description: role.description,
            source: 'project',
            files: []
          },
          rootPath: roleDir,
          manifestPath: path.join(roleDir, 'role.json'),
          defaultSkillIds: role.allowedSkillIds ?? [],
          allowedCapabilities: role.allowedCapabilities,
          modelPolicy: role.modelPolicy,
          sections: ensureRolePackageSections(role),
          issues: role.packageDiagnostics ?? []
        };
    const { roleProfile, agentProfile: legacyAgentProfile } = migrateLegacyRoleToRoleProfile({
      ...role,
      packageSections: snapshot.sections
    });
    const taskTemplate = nodeBindings?.taskTemplateId ? this.getTaskTemplate(rootPath, nodeBindings.taskTemplateId) : null;
    const agentProfile = nodeBindings?.agentProfileId
      ? this.getAgentProfile(rootPath, nodeBindings.agentProfileId) ?? legacyAgentProfile
      : legacyAgentProfile;
    const executionBundle = assembleExecutionBundle({
      roleProfile,
      taskTemplate: taskTemplate ?? undefined,
      agentProfile,
      nodeOverrides: {
        skillIds: nodeBindings?.skillIds,
        connectorId: nodeBindings?.connectorId,
        toolId: nodeBindings?.toolId,
        toolIds: nodeBindings?.toolIds
      }
    });
    const defaultSkillIds = Array.from(new Set(snapshot.defaultSkillIds));
    const boundToolIds = Array.from(new Set([
      ...(nodeBindings?.toolId ? [nodeBindings.toolId] : []),
      ...(nodeBindings?.toolIds ?? [])
    ].filter(Boolean)));
    const allowedCapabilities = Array.from(new Set(resolveNodeCapabilityIds(
      {
        ...role,
        allowedCapabilities: executionBundle.allowedCapabilities
      },
      {
        connectorId: nodeBindings?.connectorId,
        toolId: nodeBindings?.toolId,
        toolIds: nodeBindings?.toolIds
      }
    )));
    return {
      roleId: role.id,
      roleName: role.name,
      packageRoot: roleDir,
      packageVersion: snapshot.rolePackage.version,
      packageStatus: computeRolePackageStatus(role),
      packageHealth: role.packageHealth ?? (snapshot.issues.some((issue) => issue.severity === 'error') ? 'corrupt' : snapshot.issues.length ? 'warning' : 'healthy'),
      promptHint: [snapshot.sections.identity, snapshot.sections.soul, snapshot.sections.agents].filter(Boolean).join('\n\n'),
      sections: snapshot.sections,
      defaultSkillIds,
      effectiveSkillIds: executionBundle.effectiveSkillIds,
      allowedCapabilities,
      boundConnectorId: nodeBindings?.connectorId,
      boundToolIds,
      modelPolicy: executionBundle.modelPolicy ?? snapshot.modelPolicy ?? role.modelPolicy,
      diagnostics: [
        ...snapshot.issues,
        ...(role.packageDiagnostics ?? [])
      ],
      sourceMap: {
        sections: 'package',
        modelPolicy: executionBundle.sourceMap.modelPolicy,
        skillIds: executionBundle.sourceMap.skillIds,
        capabilities: nodeBindings?.connectorId || boundToolIds.length ? 'node' : executionBundle.sourceMap.capabilities
      }
    };
  }

  private getRole(
    rootPath: string,
    roleId: string,
    nodeBindings?: Parameters<RuntimeService['resolveRoleBundle']>[2]
  ): PlatformRole {
    const bundle = this.resolveRoleBundle(rootPath, roleId, nodeBindings);
    return {
      id: bundle.roleId,
      name: bundle.roleName,
      description: bundle.sections.identity,
      packageSections: bundle.sections,
      packageStatus: bundle.packageStatus,
      packageRoot: bundle.packageRoot,
      packageVersion: bundle.packageVersion,
      packageHealth: bundle.packageHealth,
      packageDiagnostics: bundle.diagnostics,
      promptHint: bundle.promptHint,
      allowedSkillIds: bundle.effectiveSkillIds,
      allowedCapabilities: bundle.allowedCapabilities,
      outputSchema: 'markdown',
      outputFormat: 'markdown',
      modelPolicy: bundle.modelPolicy
    };
  }

  private getRoleIdByName(rootPath: string, keyword: string) {
    return this.projectService.loadPlatformAssets(rootPath).roles.find((role) => role.name.includes(keyword))?.id;
  }

  private validateRuntimeTemplate(rootPath: string, template: RuntimeTemplateAsset) {
    return this.templateAuthoringService.validateRuntimeTemplate(rootPath, template);
  }

  private buildConversationSupportContext(rootPath: string, documentPaths: string[]) {
    const anchors = this.resolveProjectScopedContextPaths(rootPath, documentPaths);
    const documentContext = this.projectService.buildDocumentContext(rootPath, anchors);
    const changeContext = this.projectService.buildRecentChangeContext(rootPath, anchors);
    return [changeContext, documentContext].filter(Boolean).join('\n\n');
  }

  private resolveProjectScopedContextPaths(rootPath: string, documentPaths: string[], requireExisting = true) {
    return uniquePaths(documentPaths)
      .filter(Boolean)
      .flatMap((documentPath) => {
        try {
          const resolvedPath = this.resolveProjectScopedContextPath(rootPath, documentPath);
          if (requireExisting && !this.contextDocumentExists(rootPath, resolvedPath)) {
            return [];
          }
          return [resolvedPath];
        } catch {
          return [];
        }
      });
  }

  private resolveProjectScopedContextPath(rootPath: string, documentPath: string) {
    if (typeof this.projectService.resolveProjectPath === 'function') {
      return this.projectService.resolveProjectPath(rootPath, documentPath);
    }
    const resolvedPath = path.resolve(path.isAbsolute(documentPath) ? documentPath : path.join(rootPath, documentPath));
    const relative = path.relative(path.resolve(rootPath), resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('路径超出当前工程范围。');
    }
    return resolvedPath;
  }

  private contextDocumentExists(rootPath: string, documentPath: string) {
    if (fs.existsSync(documentPath)) {
      return true;
    }
    if (typeof this.projectService.listKnowledgeFiles === 'function') {
      try {
        return this.projectService.listKnowledgeFiles(rootPath).some((candidatePath) => {
          try {
            return this.resolveProjectScopedContextPath(rootPath, candidatePath) === documentPath;
          } catch {
            return false;
          }
        });
      } catch {
        return false;
      }
    }
    return false;
  }

  private resolveStageGenerationContextPaths(
    rootPath: string,
    template: RuntimeTemplateAsset,
    stage: AppStage,
    activeDocumentPath?: string
  ) {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    const currentStageTargets = new Set(
      (template.stageDocuments[stage] ?? []).map((target) => path.join(rootPath, target.path))
    );
    const upstreamPaths = STAGE_ORDER
      .slice(0, Math.max(stageIndex, 0))
      .flatMap((candidateStage) => template.stageDocuments[candidateStage] ?? [])
      .map((target) => path.join(rootPath, target.path));
    const carryForwardPaths = activeDocumentPath && !currentStageTargets.has(activeDocumentPath)
      ? [activeDocumentPath]
      : [];
    return this.resolveProjectScopedContextPaths(rootPath, [...upstreamPaths, ...carryForwardPaths]);
  }

  private buildLatestReviewRoundContext(rootPath: string, sessionId: string, stage: AppStage) {
    if (stage !== 'review' && stage !== 'finalize') {
      return '';
    }
    if (typeof this.projectService.loadReviewRounds !== 'function') {
      return '';
    }
    const rounds = this.projectService.loadReviewRounds(rootPath).filter((round) => round.sessionId === sessionId);
    const latestRound = rounds[rounds.length - 1];
    if (!latestRound) {
      return '';
    }

    const relativeDocumentPath = path.isAbsolute(latestRound.documentPath)
      ? path.relative(rootPath, latestRound.documentPath).replace(/\\/g, '/')
      : latestRound.documentPath.replace(/\\/g, '/');
    const pendingCount = latestRound.issues.filter((issue) => issue.state === 'pending').length;
    const adoptedCount = latestRound.issues.filter((issue) => issue.state === 'adopted').length;
    const ignoredCount = latestRound.issues.filter((issue) => issue.state === 'ignored').length;
    const issueLines = latestRound.issues.map((issue, index) => (
      `${index + 1}. [${issue.state}] ${issue.title}\n${issue.detail}`
    )).join('\n\n');
    const diagnosticLines = latestRound.diagnostics.map((item, index) => `${index + 1}. ${item}`).join('\n');

    return [
      'Latest review round that must be addressed before stage confirmation:',
      `Reviewed document: ${relativeDocumentPath}`,
      `Review status: ${latestRound.status}`,
      `Issue counts: pending=${pendingCount}, adopted=${adoptedCount}, ignored=${ignoredCount}`,
      latestRound.summary ? `Judge summary:\n${latestRound.summary}` : '',
      diagnosticLines ? `Review diagnostics:\n${diagnosticLines}` : '',
      issueLines ? `Review issues:\n${issueLines}` : '',
      'This stage output must either resolve these issues in the artifact or give an explicit disposition rationale the user can adopt.'
    ].filter(Boolean).join('\n\n');
  }

  private buildHarnessPrompt(input: {
    rootPath: string;
    sessionId?: string;
    system: string;
    user: string;
    contextDocumentPaths?: string[];
    selectedProfile: RoutableProviderProfile;
    resumedFromRunId?: string;
    provenance?: string[];
    flowId?: string;
    nodeId?: string;
    boundRuleIds?: string[];
  }) {
    const session = input.sessionId && typeof this.projectService.loadSessions === 'function'
      ? this.projectService.loadSessions(input.rootPath).find((item) => item.id === input.sessionId) ?? null
      : null;
    const compaction = this.conversationCompaction.compact(session);
    const sessionContextControls = normalizeSessionContextControls(session?.contextControls);
    const normalizedExcludedDocumentPaths = this.resolveProjectScopedContextPaths(
      input.rootPath,
      sessionContextControls.excludedDocumentPaths,
      false
    );
    const normalizedPinnedDocumentPaths = this.resolveProjectScopedContextPaths(
      input.rootPath,
      sessionContextControls.pinnedDocumentPaths
    );
    const excludedPathSet = new Set(normalizedExcludedDocumentPaths);
    const requestedContextDocumentPaths = uniquePaths([
      ...this.resolveProjectScopedContextPaths(input.rootPath, input.contextDocumentPaths ?? []),
      ...normalizedPinnedDocumentPaths
    ]).filter((documentPath) => !excludedPathSet.has(documentPath));
    let retrieval: { indexState: KnowledgeIndexState; hits: RetrievalHit[] };
    try {
      retrieval = this.hybridRetrieval.retrieve(
        input.rootPath,
        [input.user, compaction.rollingSummary ?? ''].filter(Boolean).join('\n'),
        requestedContextDocumentPaths
      );
    } catch (error) {
      retrieval = {
        indexState: {
          version: 1,
          status: 'error',
          documentCount: 0,
          staleDocumentPaths: [],
          units: [],
          lastError: error instanceof Error ? error.message : String(error)
        },
        hits: []
      };
    }
    const controlledRetrieval = this.applySessionContextControls(
      input.rootPath,
      retrieval.indexState,
      retrieval.hits,
      requestedContextDocumentPaths,
      {
        ...sessionContextControls,
        pinnedDocumentPaths: normalizedPinnedDocumentPaths,
        excludedDocumentPaths: normalizedExcludedDocumentPaths
      }
    );
    const budgetResult = this.budgetGovernor.planContext({
      profile: input.selectedProfile,
      system: input.system,
      user: input.user,
      rollingSummary: compaction.rollingSummary,
      retrievalHits: controlledRetrieval.retrievalHits
    });
    const budgetPlan: RuntimeBudgetPlan = {
      ...budgetResult.plan,
      omittedMessageCount: compaction.omittedMessageCount
    };
    const rulesSnapshot = this.rulesDistillation.getSnapshot(input.rootPath);
    const effectiveRuleSet = this.rulesDistillation.resolveEffectiveRules(input.rootPath, {
      flowId: input.flowId,
      nodeId: input.nodeId,
      boundRuleIds: input.boundRuleIds
    });
    const promotedKnowledge = rulesSnapshot.knowledgeGraph.nodes
      .filter((item) => item.kind === 'knowledge' && item.status === 'accepted')
      .slice(0, 4);
    const rulesContextSection = [
      effectiveRuleSet.rules.length
        ? `生效规则：\n${effectiveRuleSet.rules.map((rule) => `- ${rule.name}${rule.targetKey ? ` [${rule.targetKey}]` : ''}: ${rule.body}`).join('\n')}`
        : '',
      effectiveRuleSet.conflicts.length
        ? `规则冲突提示：\n${effectiveRuleSet.conflicts.map((item) => `- ${item.message}`).join('\n')}`
        : '',
      promotedKnowledge.length
        ? `已提升知识：\n${promotedKnowledge.map((item) => `- ${item.title}: ${item.summary}`).join('\n')}`
        : ''
    ].filter(Boolean).join('\n\n');
    const provenanceRecords = this.provenanceService.buildRecords({
      retrievalHits: budgetResult.selectedHits,
      contextDocumentPaths: controlledRetrieval.contextDocumentPaths,
      pinnedDocumentPaths: controlledRetrieval.pinnedDocumentPaths,
      rollingSummary: compaction.compacted ? compaction.rollingSummary : undefined,
      resumedFromRunId: input.resumedFromRunId,
      effectiveRules: effectiveRuleSet.rules,
      promotedKnowledge,
      baseProvenance: input.provenance
    });
    const provenance = this.provenanceService.toLegacyTokens(provenanceRecords, [
      ...(input.provenance ?? []),
      input.resumedFromRunId ? `resume-from:${input.resumedFromRunId}` : 'new-run'
    ]);

    return {
      promptUser: [
        input.user,
        rulesContextSection,
        compaction.compacted && compaction.rollingSummary ? `会话滚动摘要：\n${compaction.rollingSummary}` : '',
        budgetResult.contextSection
      ].filter(Boolean).join('\n\n'),
      compaction,
      contextDocumentPaths: controlledRetrieval.contextDocumentPaths,
      pinnedDocumentPaths: controlledRetrieval.pinnedDocumentPaths,
      excludedDocumentPaths: controlledRetrieval.excludedDocumentPaths,
      retrievalHits: budgetResult.selectedHits,
      provenanceRecords,
      provenance,
      effectiveRuleIds: effectiveRuleSet.appliedRuleIds,
      knowledgeNodeIds: promotedKnowledge.map((item) => item.id),
      budgetPlan,
      knowledgeIndexState: retrieval.indexState
    };
  }

  private assertRunNotStopped(run: RuntimeRun) {
    if (!this.stopRequestedRunIds.has(run.id)) {
      return;
    }
    throw new RuntimeError('Run stopped by user.', 'cancelled_error');
  }

  private applySessionContextControls(
    rootPath: string,
    indexState: KnowledgeIndexState,
    retrievalHits: RetrievalHit[],
    contextDocumentPaths: string[],
    controls: SessionContextControls
  ) {
    const excludedPathSet = new Set(uniquePaths(controls.excludedDocumentPaths));
    const pinnedDocumentPaths = uniquePaths(controls.pinnedDocumentPaths).filter((documentPath) => !excludedPathSet.has(documentPath));
    const effectiveContextDocumentPaths = uniquePaths(contextDocumentPaths).filter((documentPath) => !excludedPathSet.has(documentPath));
    const existingPinnedPaths = new Set<string>();
    const filteredHits = retrievalHits
      .filter((hit) => !excludedPathSet.has(hit.path))
      .map((hit) => {
        if (!pinnedDocumentPaths.includes(hit.path)) {
          return hit;
        }
        existingPinnedPaths.add(hit.path);
        return {
          ...hit,
          pinned: true,
          score: hit.score + 1000,
          reason: hit.reason.includes('用户固定上下文') ? hit.reason : `${hit.reason}；用户固定上下文`
        };
      });

    const forcedPinnedHits = this.buildPinnedRetrievalHits(
      rootPath,
      indexState,
      pinnedDocumentPaths.filter((documentPath) => !existingPinnedPaths.has(documentPath))
    );

    const nextHits = [...forcedPinnedHits, ...filteredHits].sort((left, right) =>
      Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      || right.score - left.score
      || left.path.localeCompare(right.path)
    );

    return {
      contextDocumentPaths: effectiveContextDocumentPaths,
      pinnedDocumentPaths,
      excludedDocumentPaths: uniquePaths(controls.excludedDocumentPaths),
      retrievalHits: nextHits
    };
  }

  private buildPinnedRetrievalHits(
    rootPath: string,
    indexState: KnowledgeIndexState,
    pinnedDocumentPaths: string[]
  ): RetrievalHit[] {
    return uniquePaths(pinnedDocumentPaths).map((documentPath) => {
      const indexedUnit = indexState.units.find((unit) => unit.path === documentPath);
      const title = indexedUnit?.title
        ?? path.basename(documentPath, path.extname(documentPath))
        ?? documentPath;
      const excerpt = indexedUnit?.excerpt
        ?? (pathExists(documentPath) && typeof this.projectService.readFile === 'function'
          ? this.projectService.readFile(documentPath).slice(0, 320).trim()
          : '');
      return {
        unitId: indexedUnit?.id ?? `pinned:${documentPath}`,
        path: documentPath,
        title,
        excerpt,
        score: 1000,
        matchedBy: ['reference'],
        reason: '用户固定上下文',
        relatedChangeRecordIds: indexedUnit?.relatedChangeRecordIds ?? [],
        pinned: true
      };
    });
  }

  private buildContextPack(input: {
    rootPath: string;
    runId: string;
    sessionId?: string;
    stage?: AppStage;
    roleId?: string;
    system: string;
    user: string;
    anchorPaths?: string[];
    pinnedDocumentPaths?: string[];
    excludedDocumentPaths?: string[];
    provenance?: string[];
    compaction?: ConversationCompactionResult;
    retrievalHits?: RetrievalHit[];
    provenanceRecords?: ProvenanceRecord[];
    effectiveRuleIds?: string[];
    knowledgeNodeIds?: string[];
    budgetPlan?: RuntimeBudgetPlan;
    knowledgeIndexState?: KnowledgeIndexState;
  }): ContextPack {
    const session = input.sessionId && typeof this.projectService.loadSessions === 'function'
      ? this.projectService.loadSessions(input.rootPath).find((item) => item.id === input.sessionId) ?? null
      : null;
    const sourceMessageCount = input.compaction?.sourceMessageCount ?? session?.messages.length ?? 0;
    const retainedMessages = input.compaction?.retainedMessages ?? (session ? session.messages.slice(-8) : []);
    const omittedMessageCount = input.compaction?.omittedMessageCount ?? Math.max(0, sourceMessageCount - retainedMessages.length);
    const anchorPaths = Array.from(new Set((input.anchorPaths ?? []).filter(Boolean)));
    const relatedChanges = typeof this.projectService.getRelevantDocumentChanges === 'function'
      ? this.projectService.getRelevantDocumentChanges(input.rootPath, anchorPaths, 4)
      : [];
    const documentDigests = anchorPaths
      .filter((documentPath) => fs.existsSync(documentPath))
      .map((documentPath) => ({
        path: documentPath,
        excerpt: typeof this.projectService.readFile === 'function'
          ? this.projectService.readFile(documentPath).slice(0, 800).trim()
          : '',
        modifiedAt: typeof this.projectService.getDocumentMeta === 'function'
          ? this.projectService.getDocumentMeta(documentPath).modifiedAt
          : undefined
      }));

    return {
      id: randomUUID(),
      createdAt: nowIso(),
      runId: input.runId,
      sessionId: input.sessionId,
      stage: input.stage,
      roleId: input.roleId,
      systemPrompt: input.system,
      userPrompt: input.user,
      compacted: omittedMessageCount > 0,
      sourceMessageCount,
      retainedMessageCount: retainedMessages.length,
      omittedMessageCount,
      anchorPaths,
      pinnedDocumentPaths: uniquePaths(input.pinnedDocumentPaths ?? []),
      excludedDocumentPaths: uniquePaths(input.excludedDocumentPaths ?? []),
      changeRecordIds: relatedChanges.map((item) => item.id),
      documentDigests,
      provenance: input.provenance ?? [],
      rollingSummary: input.compaction?.rollingSummary,
      retrievalHits: input.retrievalHits ?? [],
      provenanceRecords: input.provenanceRecords ?? [],
      effectiveRuleIds: input.effectiveRuleIds ?? [],
      knowledgeNodeIds: input.knowledgeNodeIds ?? [],
      budgetPlan: input.budgetPlan,
      knowledgeIndexBuiltAt: input.knowledgeIndexState?.builtAt
    };
  }

  private createEvidencePackage(rootPath: string, run: RuntimeRun): EvidencePackage {
    const eventCount = typeof this.runtimeAssets.listEventsForRun === 'function'
      ? this.listRunEvents(rootPath, run.id).length
      : 0;
    return {
      id: randomUUID(),
      createdAt: nowIso(),
      runId: run.id,
      kind: run.kind,
      status: run.status,
      sessionId: run.sessionId,
      stage: run.stage,
      roleId: run.roleId,
      selectedProfileId: run.selectedProfileId,
      contextPackId: run.contextPackId,
      checkpointIds: run.checkpoints.map((item) => item.id),
      outputIds: run.outputs.map((item) => item.id),
      approvalIds: (run.pendingApprovals ?? []).map((item) => item.id),
      branchGroupIds: (run.branchGroups ?? []).map((item) => item.id),
      scopeIds: (run.scopes ?? []).map((item) => item.id),
      loopIds: (run.loops ?? []).map((item) => item.id),
      subflowCallIds: (run.subflowCalls ?? []).map((item) => item.id),
      rerunPlanIds: (run.rerunPlans ?? []).map((item) => item.id),
      snapshotIds: (run.snapshots ?? []).map((item) => item.id),
      recoveryStatus: run.recovery?.status,
      eventCount,
      diagnostics: [...run.diagnostics]
    };
  }

  private createRunHistoryRecord(run: RuntimeRun): RuntimeRunHistoryRecord {
    const latestCheckpoint = this.latestCheckpoint(run);
    return {
      id: randomUUID(),
      runId: run.id,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      kind: run.kind,
      status: run.status,
      sessionId: run.sessionId,
      stage: run.stage,
      roleId: run.roleId,
      flowId: run.flowId,
      checkpointCount: run.checkpoints.length,
      latestCheckpointId: latestCheckpoint?.id,
      latestCheckpointSummary: latestCheckpoint?.summary,
      outputCount: run.outputs.length,
      heartbeatAt: run.heartbeatAt,
      recoveryStatus: run.recovery?.status
    };
  }

  private createRecoveryState(
    run: RuntimeRun,
    status: RuntimeRunRecovery['status'],
    options?: Partial<Omit<RuntimeRunRecovery, 'status' | 'savedAt' | 'approvalIds' | 'branchGroupIds' | 'latestCheckpointId'>>
  ): RuntimeRunRecovery {
    return {
      status,
      savedAt: nowIso(),
      latestCheckpointId: run.checkpoints[run.checkpoints.length - 1]?.id,
      approvalIds: (run.pendingApprovals ?? []).map((item) => item.id),
      branchGroupIds: (run.branchGroups ?? []).map((item) => item.id),
      scopeIds: (run.scopes ?? []).map((item) => item.id),
      rerunPlanIds: (run.rerunPlans ?? []).map((item) => item.id),
      snapshotIds: (run.snapshots ?? []).map((item) => item.id),
      ...options
    };
  }

  private saveRunState(rootPath: string, run: RuntimeRun) {
    this.syncRunProgress(run);
    this.runtimeAssets.saveRun(rootPath, run);
    if (typeof (this.runtimeAssets as { saveRunHistory?: (rootPath: string, history: RuntimeRunHistoryRecord) => void }).saveRunHistory === 'function') {
      (this.runtimeAssets as { saveRunHistory: (rootPath: string, history: RuntimeRunHistoryRecord) => void })
        .saveRunHistory(rootPath, this.createRunHistoryRecord(run));
    }
    if (run.recovery && typeof (this.runtimeAssets as { saveRunRecovery?: (rootPath: string, runId: string, recovery: RuntimeRunRecovery) => void }).saveRunRecovery === 'function') {
      (this.runtimeAssets as { saveRunRecovery: (rootPath: string, runId: string, recovery: RuntimeRunRecovery) => void })
        .saveRunRecovery(rootPath, run.id, run.recovery);
      this.emit(rootPath, run, {
        type: 'run.recovery-saved',
        message: `Saved recovery material for ${run.id}`,
        metadata: {
          recoveryStatus: run.recovery.status,
          latestCheckpointId: run.recovery.latestCheckpointId ?? null
        }
      });
    }
    this.upsertActiveRun(rootPath, run, {
      currentStep: run.currentStep,
      heartbeatAt: run.heartbeatAt ?? run.updatedAt
    });
  }

  private recordCheckpoint(
    rootPath: string,
    run: RuntimeRun,
    input: {
      turn: number;
      summary: string;
      status: RuntimeCheckpoint['status'];
      nodeId?: string;
      contextPackId?: string;
      scopeId?: string;
      currentStep?: string;
    }
  ) {
    const entry = checkpoint(
      input.turn,
      input.summary,
      input.status,
      input.nodeId,
      input.contextPackId
    );
    entry.scopeId = input.scopeId;
    entry.lineageRunId = run.resumedFromRunId ?? run.id;
    entry.sideEffectPolicy = this.resolveCheckpointSideEffectPolicy(run);
    run.checkpoints.push(entry);
    run.updatedAt = nowIso();
    this.syncRunProgress(run, {
      currentStep: input.currentStep ?? input.summary,
      heartbeatAt: run.updatedAt
    });
    this.emit(rootPath, run, {
      type: 'checkpoint.saved',
      message: `Saved checkpoint ${entry.turn}`,
      metadata: {
        turn: entry.turn,
        checkpointId: entry.id,
        nodeId: entry.nodeId ?? null
      }
    });
    this.saveRunState(rootPath, run);
    this.maybePauseAtCheckpointBoundary(rootPath, run, entry);
    return entry;
  }

  private resolveCheckpointSideEffectPolicy(run: RuntimeRun): RuntimeCheckpoint['sideEffectPolicy'] {
    if ((run.pendingApprovals ?? []).some((approval) => approval.status === 'pending') || (run.mergeProposalIds ?? []).length) {
      return 'manual-review-required';
    }
    return run.resumeContext?.allowedCapabilities?.length ? 'tool-assisted' : 'model-only';
  }

  private maybePauseAtCheckpointBoundary(rootPath: string, run: RuntimeRun, checkpointEntry: RuntimeCheckpoint) {
    const pauseRequested = this.pauseRequestedRunIds.has(run.id) || run.status === 'pause-requested';
    if (!pauseRequested) {
      return;
    }
    const pausedAt = nowIso();
    run.status = 'paused';
    run.updatedAt = pausedAt;
    run.pausedAt = pausedAt;
    run.currentStep = `Paused at checkpoint: ${checkpointEntry.summary}`;
    run.recovery = this.createRecoveryState(run, 'recoverable', {
      reason: 'paused'
    });
    this.saveRunState(rootPath, run);
    this.emit(rootPath, run, {
      type: 'run.paused',
      message: `Paused ${run.id} at checkpoint ${checkpointEntry.summary}`,
      metadata: {
        checkpointId: checkpointEntry.id,
        checkpointSummary: checkpointEntry.summary
      }
    });
    this.pauseRequestedRunIds.delete(run.id);
    this.removeActiveRun(run.id);
    throw new RuntimePauseSignal(run, checkpointEntry);
  }

  private validateResumeCheckpoint(
    rootPath: string,
    run: RuntimeRun,
    checkpointEntry: RuntimeCheckpoint | undefined,
    profiles: RoutableProviderProfile[]
  ) {
    if (!checkpointEntry) {
      throw new Error('The selected run does not have a legal checkpoint to resume from.');
    }
    if (checkpointEntry.contextPackId && !this.evidenceStore.readContextPack(rootPath, checkpointEntry.contextPackId)) {
      throw new Error(`The checkpoint context pack is missing: ${checkpointEntry.contextPackId}`);
    }
    if (checkpointEntry.sideEffectPolicy === 'manual-review-required') {
      throw new Error('The latest checkpoint requires manual review before resume.');
    }
    if (run.selectedProfileId && !profiles.some((profile) => profile.id === run.selectedProfileId)) {
      throw new Error(`The provider profile required by this checkpoint is no longer available: ${run.selectedProfileId}`);
    }
  }

  private persistArtifactContractFailure(
    rootPath: string,
    errors: string[],
    options?: {
      run?: RuntimeRun;
      nodeId?: string;
    }
  ) {
    const message = errors[0] ?? 'Artifact contract validation failed.';
    const record: ActionableErrorRecord = {
      id: randomUUID(),
      createdAt: nowIso(),
      scope: 'runtime',
      code: 'artifact_contract_invalid',
      severity: 'error',
      message,
      runId: options?.run?.id,
      targetId: options?.nodeId,
      retryable: true,
      recoverable: true,
      suggestedActions: errors
    };
    this.evidenceStore.persistActionableError(rootPath, record);
    if (options?.run) {
      options.run.status = 'failed';
      options.run.updatedAt = nowIso();
      options.run.errorMessage = message;
      options.run.actionableErrorId = record.id;
      options.run.diagnostics = [...options.run.diagnostics, ...errors];
      this.saveRunState(rootPath, options.run);
      this.emit(rootPath, options.run, {
        type: 'validation.failed',
        message,
        metadata: {
          actionableErrorId: record.id,
          nodeId: options.nodeId ?? null
        }
      });
    }
    return record;
  }

  private createActionableErrorRecord(
    runtimeError: RuntimeError,
    run: RuntimeRun,
    options?: {
      checkpointId?: string;
      targetId?: string;
    }
  ): ActionableErrorRecord {
    return {
      id: randomUUID(),
      createdAt: nowIso(),
      scope: 'runtime',
      code: runtimeError.code,
      severity: runtimeError.code === 'permission_error' ? 'critical' : 'error',
      message: runtimeError.message,
      runId: run.id,
      targetId: options?.targetId ?? run.roleId,
      checkpointId: options?.checkpointId,
      contextPackId: run.contextPackId,
      retryable: !['permission_error', 'validation_error'].includes(runtimeError.code),
      recoverable: true,
      suggestedActions: runtimeError.code === 'permission_error'
        ? ['Adjust the capability or governance policy.', 'Retry after approval or policy update.']
        : ['Fix the upstream input or model output.', 'Resume from the latest valid checkpoint.']
    };
  }

  private createRun(
    rootPath: string,
    kind: RuntimeRun['kind'],
    sessionId: string | undefined,
    stage: AppStage | undefined,
    role: PlatformRole,
    options?: {
      resumedFromRunId?: string;
      resumeContext?: RuntimeRun['resumeContext'];
    }
  ) {
    const createdAt = nowIso();
    const rootScopeId = randomUUID();
    const run: RuntimeRun = {
      id: randomUUID(),
      kind,
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
      heartbeatAt: createdAt,
      sessionId,
      stage,
      roleId: role.id,
      currentStep: 'Queued',
      diagnostics: [],
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0
      },
      outputs: [],
      artifactOutcomes: [],
      checkpoints: [],
      branchGroups: [],
      scopes: [{
        id: rootScopeId,
        type: 'root-run',
        status: 'pending',
        label: `${role.name} root run`,
        createdAt,
        updatedAt: createdAt,
        flowId: undefined,
        outputIds: [],
        childScopeIds: []
      }],
      loops: [],
      subflowCalls: [],
      rerunPlans: [],
      snapshots: [],
      pendingApprovals: [],
      mergeProposalIds: [],
      resumedFromRunId: options?.resumedFromRunId,
      resumeContext: options?.resumeContext
    };
    this.saveRunState(rootPath, run);
    return run;
  }

  private ensureRunCollections(run: RuntimeRun) {
    run.artifactOutcomes ??= [];
    run.branchGroups ??= [];
    run.pendingApprovals ??= [];
    run.scopes ??= [];
    run.loops ??= [];
    run.subflowCalls ??= [];
    run.rerunPlans ??= [];
    run.snapshots ??= [];
  }

  private buildArtifactValidationPolicy(
    target: { qualityTier?: ArtifactQualityTier; minimumQualityScore?: number },
    schema: ArtifactSchemaAsset
  ) {
    return resolveArtifactValidationPolicy(schema, {
      qualityTier: target.qualityTier,
      minimumQualityScore: target.minimumQualityScore
    });
  }

  private formatRequiredHeadingContract(requiredHeadings?: string[]) {
    if (!requiredHeadings?.length) {
      return '';
    }

    const explicitHeadings = requiredHeadings.filter((heading) => !/^#{1,6}$/.test(heading.trim()));
    const genericHeadings = requiredHeadings.filter((heading) => /^#{1,6}$/.test(heading.trim()));
    const lines: string[] = [];

    if (explicitHeadings.length) {
      lines.push(`- 必须包含标题：${explicitHeadings.join(' ｜ ')}`);
    }

    if (genericHeadings.length) {
      const levelLabels = ['零', '一', '二', '三', '四', '五', '六'];
      const levelCounts = new Map<number, number>();
      for (const heading of genericHeadings) {
        const level = heading.trim().length;
        levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
      }
      const parts = Array.from(levelCounts.entries())
        .sort(([left], [right]) => left - right)
        .map(([level, count]) => `至少包含 ${count} 个${levelLabels[level] ?? level}级标题`);
      const headingSummary = parts.length === 2
        ? `${parts[0]}和 ${parts[1].replace(/^至少包含\s*/, '')}`
        : parts.join('，');
      lines.push(`- 标题结构：${headingSummary}`);
    }

    return lines.join('\n');
  }

  private buildStageArtifactGuidance(
    stage: AppStage,
    template: RuntimeTemplateAsset,
    target: { path: string; title: string; purpose?: string; qualityTier?: ArtifactQualityTier; minimumQualityScore?: number },
    schema: ArtifactSchemaAsset
  ) {
    const policy = this.buildArtifactValidationPolicy(target, schema);
    const lines = [
      '工件写作约束：',
      `- 工件路径：${target.path}`,
      `- 工件标题：${target.title}`,
      target.purpose ? `- 工件目标：${target.purpose}` : '',
      `- 质量等级：${policy.qualityTier ?? 'strict'}`,
      `- 最低质量分：${policy.minimumQualityScore ?? 72}`,
      typeof schema.minimumLength === 'number' ? `- 最小长度：至少 ${schema.minimumLength} 字` : '',
      this.formatRequiredHeadingContract(schema.requiredHeadings),
      '- 不要停留在空泛总结；至少补充具体角色、场景、工件名、目录或路径、输入输出、约束、失败恢复、验收口径和下一步动作中的若干项。',
      '- 尽量使用数字化验收条件、`反引号`包裹的路径/工件名，以及明确的输入/输出合同来提高具体性。'
    ];
    const nextArtifact = this.findNextStageDocument(template, stage, target.path);
    const nextArtifactPathHint = nextArtifact ? `\`${nextArtifact.path}\`` : '模板声明的下一阶段工件';
    const nextArtifactDirectory = nextArtifact ? path.posix.dirname(nextArtifact.path) : '';
    const nextArtifactDirectoryHint = nextArtifactDirectory && nextArtifactDirectory !== '.'
      ? ` 或 \`${nextArtifactDirectory.replace(/\/+$/, '')}/\``
      : '';
    if (schema.id === 'requirements-discovery') {
      lines.push(
        `- 对“${target.title}”：必须明确成功标准、验收方式、下一步澄清动作，并至少出现一个下游工件或目录引用，例如 ${nextArtifactPathHint}${nextArtifactDirectoryHint}。`
      );
    }
    if (schema.id === 'requirements-clarify') {
      lines.push(
        `- 对“${target.title}”：必须明确操作步骤、输入输出格式、目录结构、异常/恢复路径，以及这些结论如何作为下一阶段输入基线，例如 ${nextArtifactPathHint}。`
      );
    }
    return lines.filter(Boolean).join('\n');
  }

  private findNextStageDocument(
    template: RuntimeTemplateAsset,
    currentStage: AppStage,
    currentPath: string
  ) {
    const stageIndex = STAGE_ORDER.indexOf(currentStage);
    if (stageIndex < 0) {
      return null;
    }
    for (const nextStage of STAGE_ORDER.slice(stageIndex + 1)) {
      const nextDocument = (template.stageDocuments[nextStage] ?? []).find((document) => document.path !== currentPath);
      if (nextDocument) {
        return nextDocument;
      }
    }
    return null;
  }
  private createArtifactOutcome(input: {
    artifactPath: string;
    artifactTitle: string;
    schemaId: string;
    qualityTier: ArtifactQualityTier;
    qualityScore: number;
    qualityReasons: string[];
    verdict: RuntimeArtifactOutcome['qualityVerdict'];
    accepted: boolean;
    repaired: boolean;
    usedDeterministicFallback: boolean;
    message?: string;
  }): RuntimeArtifactOutcome {
    return {
      id: randomUUID(),
      createdAt: nowIso(),
      artifactPath: input.artifactPath,
      artifactTitle: input.artifactTitle,
      schemaId: input.schemaId,
      qualityTier: input.qualityTier,
      qualityVerdict: input.verdict,
      qualityScore: input.qualityScore,
      qualityReasons: input.qualityReasons,
      accepted: input.accepted,
      usedRepair: input.repaired,
      usedDeterministicFallback: input.usedDeterministicFallback,
      message: input.message
    };
  }

  private rootScope(run: RuntimeRun) {
    this.ensureRunCollections(run);
    return run.scopes!.find((scope) => scope.type === 'root-run') ?? null;
  }

  private createScope(
    run: RuntimeRun,
    type: RuntimeScopeType,
    label: string,
    options?: {
      parentScopeId?: string;
      nodeId?: string;
      flowId?: string;
      metadata?: Record<string, string | number | boolean | null>;
    }
  ) {
    this.ensureRunCollections(run);
    const createdAt = nowIso();
    const scope: RuntimeScopeRecord = {
      id: randomUUID(),
      type,
      status: 'running',
      label,
      createdAt,
      updatedAt: createdAt,
      parentScopeId: options?.parentScopeId,
      nodeId: options?.nodeId,
      flowId: options?.flowId,
      outputIds: [],
      childScopeIds: [],
      metadata: options?.metadata
    };
    run.scopes!.push(scope);
    if (options?.parentScopeId) {
      const parent = run.scopes!.find((item) => item.id === options.parentScopeId);
      if (parent && !parent.childScopeIds.includes(scope.id)) {
        parent.childScopeIds.push(scope.id);
        parent.updatedAt = createdAt;
      }
    }
    return scope;
  }

  private finalizeScope(
    run: RuntimeRun,
    scopeId: string,
    status: RuntimeScopeStatus,
    options?: {
      checkpointId?: string;
      errorMessage?: string;
    }
  ) {
    const scope = run.scopes?.find((item) => item.id === scopeId);
    if (!scope) return null;
    scope.status = status;
    scope.updatedAt = nowIso();
    if (options?.checkpointId) {
      scope.checkpointId = options.checkpointId;
    }
    if (options?.errorMessage) {
      scope.errorMessage = options.errorMessage;
    }
    return scope;
  }

  private attachOutputToScope(run: RuntimeRun, scopeId: string | undefined, output: RuntimeOutputRecord) {
    if (!scopeId) return;
    const scope = run.scopes?.find((item) => item.id === scopeId);
    if (!scope) return;
    scope.outputIds.push(output.id);
    scope.updatedAt = nowIso();
  }

  private emit(rootPath: string, run: RuntimeRun, event: Omit<RuntimeEvent, 'id' | 'runId' | 'createdAt'>) {
    const persistedEvent = {
      id: randomUUID(),
      runId: run.id,
      createdAt: nowIso(),
      ...event
    };
    this.runtimeAssets.appendEvent(rootPath, persistedEvent);
    this.liveLogService?.recordRuntimeEvent({
      rootPath,
      run,
      event: persistedEvent
    });
  }

  private profileToSettings(profile: RoutableProviderProfile | null) {
    if (!profile) {
      throw new RuntimeError('当前没有可用的模型配置。', 'state_error');
    }
    return {
      profileId: profile.id,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: profile.apiKey ?? ''
    };
  }

  private async runRoleLoop(input: {
    rootPath: string;
    kind: RuntimeRun['kind'];
    sessionId?: string;
    stage?: AppStage;
    flowId?: string;
    nodeId?: string;
    role: PlatformRole;
    profiles: RoutableProviderProfile[];
    activeProviderProfileId: string;
    system: string;
    user: string;
    allowedCapabilities: string[];
    resumedFromRunId?: string;
    toolMode?: 'enabled' | 'disabled';
    contextDocumentPaths?: string[];
    boundRuleIds?: string[];
    provenance?: string[];
  }) {
    const run = this.createRun(input.rootPath, input.kind, input.sessionId, input.stage, input.role, {
      resumedFromRunId: input.resumedFromRunId,
      resumeContext: {
        system: input.system,
        user: input.user,
        allowedCapabilities: input.allowedCapabilities
      }
    });
    if (input.flowId) {
      run.flowId = input.flowId;
      const rootScope = this.rootScope(run);
      if (rootScope) {
        rootScope.flowId = input.flowId;
        rootScope.updatedAt = nowIso();
      }
    }
    const nodeScope = input.nodeId
      ? this.createScope(run, 'node-attempt', input.role.name, {
          parentScopeId: this.rootScope(run)?.id,
          nodeId: input.nodeId,
          flowId: input.flowId,
          metadata: {
            roleId: input.role.id,
            sessionId: input.sessionId ?? null
          }
        })
      : null;
    const rootScope = this.rootScope(run);

    let selectedProfile: RoutableProviderProfile | null = null;
    let contextPack: ContextPack | null = null;
    let permitAcquired = false;

    try {
      const route = this.modelRouter.select(input.role.modelPolicy, input.profiles, input.activeProviderProfileId);
      selectedProfile = route.profile;
      if (!selectedProfile) {
        throw new RuntimeError(route.reason, 'state_error');
      }

      this.budgetGovernor.acquire(input.rootPath, run.id);
      permitAcquired = true;

      run.status = 'running';
      run.updatedAt = nowIso();
      run.selectedProfileId = selectedProfile.id;
      run.currentStep = 'Selecting model and preparing context.';
      run.diagnostics.push(route.reason);
      if (rootScope) {
        rootScope.status = 'running';
        rootScope.updatedAt = nowIso();
      }
      this.saveRunState(input.rootPath, run);
      this.emit(input.rootPath, run, {
        type: 'model.selected',
        message: route.reason,
        metadata: { profileId: selectedProfile.id, provider: selectedProfile.provider }
      });

      const harnessPrompt = this.buildHarnessPrompt({
        rootPath: input.rootPath,
        sessionId: input.sessionId,
        system: input.system,
        user: input.user,
        contextDocumentPaths: input.contextDocumentPaths,
        selectedProfile,
        resumedFromRunId: input.resumedFromRunId,
        provenance: input.provenance,
        flowId: input.flowId,
        nodeId: input.nodeId,
        boundRuleIds: input.boundRuleIds
      });

      contextPack = this.buildContextPack({
        rootPath: input.rootPath,
        runId: run.id,
        sessionId: input.sessionId,
        stage: input.stage,
        roleId: input.role.id,
        system: input.system,
        user: harnessPrompt.promptUser,
        anchorPaths: harnessPrompt.contextDocumentPaths,
        pinnedDocumentPaths: harnessPrompt.pinnedDocumentPaths,
        excludedDocumentPaths: harnessPrompt.excludedDocumentPaths,
        provenance: harnessPrompt.provenance,
        compaction: harnessPrompt.compaction,
        retrievalHits: harnessPrompt.retrievalHits,
        provenanceRecords: harnessPrompt.provenanceRecords,
        effectiveRuleIds: harnessPrompt.effectiveRuleIds,
        knowledgeNodeIds: harnessPrompt.knowledgeNodeIds,
        budgetPlan: harnessPrompt.budgetPlan,
        knowledgeIndexState: harnessPrompt.knowledgeIndexState
      });
      this.evidenceStore.persistContextPack(input.rootPath, contextPack);
      run.contextPackId = contextPack.id;
      run.currentStep = 'Context pack persisted. Waiting for model output.';
      this.saveRunState(input.rootPath, run);
      this.emit(input.rootPath, run, {
        type: input.resumedFromRunId ? 'run.resumed' : 'run.started',
        message: input.resumedFromRunId ? `Resumed ${input.role.name}` : `Started ${input.role.name}` ,
        metadata: { roleId: input.role.id, kind: input.kind, resumedFromRunId: input.resumedFromRunId ?? null }
      });

      const toolLoopEnabled = (input.toolMode ?? 'enabled') === 'enabled' && input.allowedCapabilities.length > 0;
      const loopSystem = toolLoopEnabled
        ? input.system
        : [input.system, 'Do not call tools. Return the final answer directly.'].join('\n\n');
      const messages = toolLoopEnabled
        ? [
            input.system,
            '',
            `If you need tools, output strict JSON like {"toolCalls":[{"capabilityId":"ID","input":{...}}]}. Otherwise return the final answer directly. Available capabilities: ${input.allowedCapabilities.join(', ')}` ,
            '',
            harnessPrompt.promptUser
          ].join('\n')
        : harnessPrompt.promptUser;

      const toolResults: string[] = [];
      let finalText = '';
      const maxTurns = toolLoopEnabled ? 3 : 1;
      for (let turn = 1; turn <= maxTurns; turn += 1) {
        this.assertRunNotStopped(run);
        const prompt = toolResults.length ? `${messages}\n\nTool results:\n${toolResults.join('\n\n')}` : messages;
        const response = await this.structuredGeneration.generateText(this.profileToSettings(selectedProfile), {
          system: loopSystem,
          user: prompt
        });
        this.assertRunNotStopped(run);
        const responseText = response.content;
        this.liveLogService?.recordAiOutput({
          rootPath: input.rootPath,
          runId: run.id,
          kind: input.kind,
          stage: input.stage,
          roleId: input.role.id,
          roleName: input.role.name,
          profileId: selectedProfile.id,
          provider: selectedProfile.provider,
          model: selectedProfile.model,
          turn,
          label: 'model-output',
          text: responseText,
          diagnostics: run.diagnostics
        });
        run.outputs.push({
          id: randomUUID(),
          createdAt: nowIso(),
          kind: 'raw',
          label: `turn-${turn}-raw`,
          contentType: 'text',
          content: responseText
        });
        this.recordCheckpoint(input.rootPath, run, {
          turn,
          summary: `Completed model turn ${turn}`,
          status: 'completed',
          nodeId: input.role.id,
          contextPackId: contextPack?.id,
          scopeId: nodeScope?.id,
          currentStep: `Completed model turn ${turn}`
        });

        const toolEnvelope = toolLoopEnabled ? parseToolEnvelope(responseText) : null;
        if (!toolEnvelope?.toolCalls?.length) {
          finalText = responseText;
          break;
        }

        for (const toolCall of toolEnvelope.toolCalls) {
          this.assertRunNotStopped(run);
          if (!capabilityAllowed(input.allowedCapabilities, toolCall.capabilityId)) {
            const error = new RuntimeError(`Unauthorized capability call: ${toolCall.capabilityId}`, 'permission_error');
            run.diagnostics.push(`${error.code}: ${error.message}`);
            this.emit(input.rootPath, run, {
              type: 'permission.blocked',
              message: error.message,
              metadata: { capabilityId: toolCall.capabilityId }
            });
            toolResults.push(JSON.stringify({
              capabilityId: toolCall.capabilityId,
              error: { code: error.code, message: error.message }
            }, null, 2));
            continue;
          }

          try {
            const capabilityResult = await this.capabilityRuntime.execute(
              input.rootPath,
              toolCall.capabilityId,
              toolCall.input ?? {},
              {
                runId: run.id,
                emit: (event) => this.emit(input.rootPath, run, event)
              }
            );
            this.assertRunNotStopped(run);
            toolResults.push(JSON.stringify({ capabilityId: toolCall.capabilityId, result: capabilityResult }, null, 2));
          } catch (error) {
            const runtimeError = normalizeRuntimeError(error);
            run.diagnostics.push(`${runtimeError.code}: ${runtimeError.message}`);
            toolResults.push(JSON.stringify({
              capabilityId: toolCall.capabilityId,
              error: { code: runtimeError.code, message: runtimeError.message }
            }, null, 2));
          }
        }

        finalText = toolEnvelope.final ?? '';
        if (toolEnvelope.final) {
          break;
        }
      }

      if (!finalText.trim() && toolResults.length) {
        this.assertRunNotStopped(run);
        const fallbackResponse = await this.structuredGeneration.generateText(this.profileToSettings(selectedProfile), {
          system: [
            loopSystem,
            'Do not output JSON or tool calls.',
            'Use the available tool results and return the final human-readable answer only.'
          ].join('\n\n'),
          user: [
            harnessPrompt.promptUser,
            'Tool results:',
            toolResults.join('\n\n')
          ].join('\n\n')
        });
        finalText = fallbackResponse.content.trim();
        this.liveLogService?.recordAiOutput({
          rootPath: input.rootPath,
          runId: run.id,
          kind: input.kind,
          stage: input.stage,
          roleId: input.role.id,
          roleName: input.role.name,
          profileId: selectedProfile.id,
          provider: selectedProfile.provider,
          model: selectedProfile.model,
          label: 'fallback-final-output',
          text: fallbackResponse.content,
          diagnostics: run.diagnostics
        });
        run.outputs.push({
          id: randomUUID(),
          createdAt: nowIso(),
          kind: 'raw',
          label: 'fallback-final-output',
          contentType: 'text',
          content: fallbackResponse.content
        });
      }

      if (!finalText.trim()) {
        throw new RuntimeError('Query loop did not produce a final answer.', 'model_error');
      }

      run.outputs.push({
        id: randomUUID(),
        createdAt: nowIso(),
        kind: 'final',
        label: 'final-output',
        contentType: 'text',
        content: finalText
      });
      this.attachOutputToScope(run, nodeScope?.id, run.outputs[run.outputs.length - 1]!);
      run.usage = usageForText(`${input.system}\n${harnessPrompt.promptUser}`, finalText);
      run.updatedAt = nowIso();
      run.status = 'completed';
      run.pauseRequestedAt = undefined;
      run.pausedAt = undefined;
      run.currentStep = 'Run completed.';
      if (rootScope) {
        this.finalizeScope(run, rootScope.id, 'completed', {
          checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id
        });
      }
      if (nodeScope) {
        this.finalizeScope(run, nodeScope.id, 'completed', {
          checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id
        });
      }
      run.recovery = this.createRecoveryState(run, 'resolved', {
        resolvedAt: run.updatedAt
      });
      const evidencePackage = this.createEvidencePackage(input.rootPath, run);
      this.evidenceStore.persistRunEvidence(input.rootPath, evidencePackage);
      run.evidencePackageId = evidencePackage.id;
      this.saveRunState(input.rootPath, run);
      this.emit(input.rootPath, run, {
        type: 'run.completed',
        message: `Completed ${input.role.name}`,
        metadata: { profileId: selectedProfile.id }
      });
      return { finalText, selectedProfile, run };
    } catch (error) {
      if (isRuntimePauseSignal(error)) {
        throw error;
      }
      const runtimeError = normalizeRuntimeError(error);
      run.status = runtimeError.code === 'cancelled_error' ? 'stopped' : 'failed';
      run.updatedAt = nowIso();
      run.errorMessage = runtimeError.message;
      run.currentStep = runtimeError.code === 'cancelled_error' ? 'Run stopped by user.' : runtimeError.message;
      run.diagnostics.push(`${runtimeError.code}: ${runtimeError.message}`);
      const failureCheckpoint = checkpoint(run.checkpoints.length + 1, runtimeError.message, 'failed', input.role.id, contextPack?.id);
      failureCheckpoint.lineageRunId = run.resumedFromRunId ?? run.id;
      failureCheckpoint.sideEffectPolicy = this.resolveCheckpointSideEffectPolicy(run);
      run.checkpoints.push(failureCheckpoint);
      if (rootScope) {
        this.finalizeScope(run, rootScope.id, runtimeError.code === 'cancelled_error' ? 'stopped' : 'failed', {
          checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id,
          errorMessage: runtimeError.message
        });
      }
      if (nodeScope) {
        run.checkpoints[run.checkpoints.length - 1]!.scopeId = nodeScope.id;
        this.finalizeScope(run, nodeScope.id, runtimeError.code === 'cancelled_error' ? 'stopped' : 'failed', {
          checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id,
          errorMessage: runtimeError.message
        });
      }
      run.recovery = this.createRecoveryState(run, 'recoverable', {
        reason: runtimeError.code
      });
      const evidencePackage = this.createEvidencePackage(input.rootPath, run);
      this.evidenceStore.persistRunEvidence(input.rootPath, evidencePackage);
      run.evidencePackageId = evidencePackage.id;
      if (runtimeError.code !== 'cancelled_error') {
        const actionableError = this.createActionableErrorRecord(runtimeError, run, {
          checkpointId: run.checkpoints[run.checkpoints.length - 1]?.id
        });
        this.evidenceStore.persistActionableError(input.rootPath, actionableError);
        run.actionableErrorId = actionableError.id;
      }
      this.saveRunState(input.rootPath, run);
      this.emit(input.rootPath, run, {
        type: runtimeError.code === 'cancelled_error' ? 'run.stopped' : 'run.failed',
        message: runtimeError.message,
        metadata: {
          errorCode: runtimeError.code,
          profileId: selectedProfile?.id ?? null
        }
      });
      throw runtimeError;
    } finally {
      this.stopRequestedRunIds.delete(run.id);
      this.pauseRequestedRunIds.delete(run.id);
      this.removeActiveRun(run.id);
      if (permitAcquired) {
        this.budgetGovernor.release(input.rootPath, run.id);
      }
    }
  }
}


function pathExists(targetPath: string) {
  try {
    return path.resolve(targetPath).length > 0 && fs.existsSync(targetPath);
  } catch {
    return false;
  }
}
