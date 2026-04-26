import fs from 'node:fs';
import path from 'node:path';
import type {
  AiMessage,
  AiSession,
  ArtifactRevisionRecord,
  DocumentChangeRecord,
  ReviewIssue,
  ReviewRound,
  RuntimeEvent,
  RuntimeRun,
  ThinkingChainDetailItem,
  ThinkingChainEdge,
  ThinkingChainEdgeKind,
  ThinkingChainEvidenceRef,
  ThinkingChainLayoutState,
  ThinkingChainNode,
  ThinkingChainNodeKind,
  ThinkingChainNodeLane,
  ThinkingChainNodeStage,
  ThinkingChainNodeStatus,
  ThinkingChainSnapshot
} from '../../shared/types';
import type { ProjectService } from './project-service';
import type { RuntimeService } from './runtime-service';
import { ThinkingChainLayoutStore } from './thinking-chain-layout-store';

type ThinkingChainProjectionInput = {
  rootPath: string;
  session: AiSession;
  runs: RuntimeRun[];
  events: RuntimeEvent[];
  reviewRounds: ReviewRound[];
  artifactRevisions: ArtifactRevisionRecord[];
  documentChanges: DocumentChangeRecord[];
};

type ProjectionItem =
  | { type: 'message'; createdAt: string; message: AiMessage }
  | { type: 'run'; createdAt: string; run: RuntimeRun }
  | { type: 'review'; createdAt: string; round: ReviewRound; issue?: ReviewIssue }
  | { type: 'artifact'; createdAt: string; revision: ArtifactRevisionRecord }
  | { type: 'change'; createdAt: string; record: DocumentChangeRecord };

function ensureDir(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function pathExists(filePath?: string) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function uniqueById<T extends { id: string }>(values: T[]) {
  return Array.from(new Map(values.map((item) => [item.id, item])).values());
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/[`*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipText(value: string, limit = 120) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function isRuntimePayload(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes('toolcalls')
    || normalized.includes('capabilityid')
    || normalized.includes('read_artifact')
    || normalized.includes('write_artifact')
    || (normalized.startsWith('{') && normalized.includes('"input"'));
}

function summarizeText(value: string, limit = 72) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '待补充思路';
  return clipText(normalized, limit);
}

function visibleThoughtText(value: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return {
      title: '待补充思路',
      summary: '当前还没有足够内容形成可阅读的思路节点。'
    };
  }
  if (isRuntimePayload(normalized)) {
    return {
      title: '技术载荷',
      summary: '该内容属于运行时技术载荷，只作为证据保留，不直接展示为思路节点。'
    };
  }
  return {
    title: summarizeText(normalized, 64),
    summary: clipText(normalized, 180)
  };
}

function isPayloadOnlyThought(value: string) {
  return isRuntimePayload(normalizeWhitespace(value));
}

function isGuidancePrompt(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(请用一句话描述|请先描述|先补齐|请补充|请说明|需要先明确|先确认|先梳理)/.test(normalized);
}

function guidanceThoughtText(value: string) {
  const normalized = normalizeWhitespace(value);
  if (/(一句话描述|核心目标|想做的软件|解决什么问题)/.test(normalized)) {
    return {
      title: '待明确：核心目标',
      summary: '需要先用一句话说明要做什么，以及它解决的核心问题。'
    };
  }
  if (/(交付|输出|文档结构|产物|目录结构)/.test(normalized)) {
    return {
      title: '待明确：交付结构',
      summary: '需要先明确最终产物的结构、格式或目录组织方式。'
    };
  }
  if (/(用户|场景|使用方式|谁来用|什么时候用)/.test(normalized)) {
    return {
      title: '待明确：使用场景',
      summary: '需要先明确目标用户、主要场景和使用边界。'
    };
  }
  if (/(流程|角色|模板|技能|节点)/.test(normalized)) {
    return {
      title: '待明确：流程与角色',
      summary: '需要先明确流程节点、角色分工或模板化方式。'
    };
  }
  return {
    title: '待明确：关键问题',
    summary: '当前存在尚未回答的关键问题，后续推导依赖这部分输入。'
  };
}

function projectedThoughtText(value: string, mode: 'node' | 'evidence' = 'node') {
  if (isGuidancePrompt(value)) {
    return guidanceThoughtText(value);
  }
  if (isPayloadOnlyThought(value)) {
    return {
      title: mode === 'node' ? '技术载荷' : '技术证据',
      summary: '该内容属于技术载荷或工具调用记录，保留为证据，不直接作为用户可读节点。'
    };
  }
  return visibleThoughtText(value);
}

function branchLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(外观|方式|场景|交互|内容组织|结构|工作壳|模式|角色|流程|模板|方向|思路|主题|章节|分支|路线|入口|导航|功能层级)/.test(normalized);
}

function explorationLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(待确认|是否|探索|再看|后续|延伸|进一步|可选|评估|验证|可能|需要不要)/.test(normalized);
}

function premiseLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(目标用户|使用场景|外观|伪装方式|定位|前提|输入范围|对象模型|用户画像|核心输入)/.test(normalized);
}

function constraintLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(约束|风险|限制|必须|不能|预算|边界|上限|下限|criteria|constraint|must)/.test(normalized);
}

function conclusionLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(工作壳|交互思路|内容组织|流程骨架|预算策略|方案结构|架构方案|章节结构|执行策略|信息架构|流程设计)/.test(normalized);
}

function coreLikeMessage(value: string) {
  const normalized = normalizeWhitespace(value);
  return /(核心想法|核心目标|一句话需求|一句话描述|要做什么|想做的软件|核心命题)/.test(normalized);
}

function classifyMessage(message: AiMessage): {
  stage: ThinkingChainNodeStage;
  kind: ThinkingChainNodeKind;
  status: ThinkingChainNodeStatus;
  lane: ThinkingChainNodeLane;
  detailItems: ThinkingChainDetailItem[];
} {
  const normalized = normalizeWhitespace(message.content);
  const lowered = normalized.toLowerCase();
  if (/(废弃|放弃|否决|不用|discard|reject|abandon)/.test(lowered)) {
    return {
      stage: 'discarded',
      kind: 'rejected',
      status: 'rejected',
      lane: 'discarded',
      detailItems: [{ id: `${message.id}:reason`, label: '处理结果', value: '该方向被明确标记为废弃，不再作为主线继续展开。' }]
    };
  }
  if (coreLikeMessage(normalized) || (message.role === 'user' && normalized.length <= 72 && !branchLikeMessage(normalized) && !constraintLikeMessage(normalized))) {
    return {
      stage: 'core',
      kind: 'goal',
      status: 'active',
      lane: 'focus',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表当前思路地图的核心命题。' }]
    };
  }
  if (explorationLikeMessage(normalized)) {
    return {
      stage: 'exploration',
      kind: 'branch',
      status: 'active',
      lane: 'exploration',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表待验证、待延伸或待选择的探索方向。' }]
    };
  }
  if (conclusionLikeMessage(normalized)) {
    return {
      stage: 'conclusion',
      kind: 'decision',
      status: 'accepted',
      lane: 'formed',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表由前提和约束共同推导出的阶段性结论。' }]
    };
  }
  if (constraintLikeMessage(lowered)) {
    return {
      stage: 'constraint',
      kind: 'criterion',
      status: message.role === 'assistant' ? 'accepted' : 'active',
      lane: 'formed',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点用于约束后续方案，不直接代表最终结论。' }]
    };
  }
  if (premiseLikeMessage(normalized)) {
    return {
      stage: 'premise',
      kind: 'branch',
      status: message.role === 'assistant' ? 'accepted' : 'active',
      lane: 'formed',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表核心命题的拆解前提或背景输入。' }]
    };
  }
  if (message.role === 'assistant') {
    return {
      stage: 'conclusion',
      kind: 'decision',
      status: 'accepted',
      lane: 'formed',
      detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表由前提和约束共同推导出的阶段性结论。' }]
    };
  }
  return {
    stage: 'premise',
    kind: 'branch',
    status: 'active',
    lane: 'formed',
    detailItems: [{ id: `${message.id}:reason`, label: '作用', value: '该节点代表用户补充的前提、场景或背景信息。' }]
  };
}

function laneLabel(lane: ThinkingChainNodeLane) {
  switch (lane) {
    case 'focus':
      return '当前焦点';
    case 'formed':
      return '已形成思路';
    case 'exploration':
      return '探索方向';
    case 'landed':
      return '已落地产物';
    case 'discarded':
      return '已废弃分支';
    default:
      return lane;
  }
}

function stageLabel(stage: ThinkingChainNodeStage) {
  switch (stage) {
    case 'core':
      return '核心命题';
    case 'premise':
      return '拆解前提';
    case 'constraint':
      return '约束条件';
    case 'conclusion':
      return '推导结论';
    case 'exploration':
      return '探索分支';
    case 'discarded':
      return '废弃分支';
    case 'materialized':
      return '文档沉淀';
    default:
      return stage;
  }
}

function laneFromStage(stage: ThinkingChainNodeStage): ThinkingChainNodeLane {
  switch (stage) {
    case 'core':
      return 'focus';
    case 'exploration':
      return 'exploration';
    case 'discarded':
      return 'discarded';
    case 'materialized':
      return 'landed';
    default:
      return 'formed';
  }
}

function stageRank(stage: ThinkingChainNodeStage) {
  switch (stage) {
    case 'core':
      return 0;
    case 'premise':
      return 1;
    case 'constraint':
      return 2;
    case 'conclusion':
      return 3;
    case 'exploration':
      return 4;
    case 'discarded':
      return 5;
    case 'materialized':
      return 6;
    default:
      return 0;
  }
}

function artifactNodeTitle(filePath: string, title?: string) {
  const baseName = path.basename(filePath);
  const anchor = title?.trim();
  return anchor ? `文档：${baseName}#${anchor}` : `文档：${baseName}`;
}

function artifactNodeSummary(filePath: string, title?: string) {
  const baseName = path.basename(filePath);
  if (title?.trim()) {
    return `${baseName} 的“${title.trim()}”章节已经承接了当前思路中的部分结论或约束。`;
  }
  return `${baseName} 已经承接了当前思路中的部分结论或约束。`;
}

function buildMessageEvidenceRef(sessionId: string, message: AiMessage): ThinkingChainEvidenceRef {
  const visible = projectedThoughtText(message.content, 'evidence');
  return {
    id: `message:${message.id}`,
    kind: 'session-message',
    label: '会话消息',
    summary: visible.summary,
    createdAt: message.createdAt,
    sessionId,
    targetId: message.id,
    metadata: {
      role: message.role
    }
  };
}

function buildRunEvidenceRefs(run: RuntimeRun, events: RuntimeEvent[]): ThinkingChainEvidenceRef[] {
  const refs: ThinkingChainEvidenceRef[] = [
    {
      id: `run:${run.id}`,
      kind: 'runtime-run',
      label: `${run.kind} / ${run.status}`,
      summary: projectedThoughtText(run.latestCheckpointSummary || run.currentStep || run.outputs[0]?.content || run.id, 'evidence').summary,
      createdAt: run.createdAt,
      sessionId: run.sessionId,
      runId: run.id,
      targetId: run.id,
      metadata: {
        status: run.status,
        stage: run.stage ?? ''
      }
    }
  ];
  for (const event of [...events].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-3)) {
    refs.push({
      id: `event:${event.id}`,
      kind: 'runtime-event',
      label: event.type,
      summary: projectedThoughtText(event.message, 'evidence').summary,
      createdAt: event.createdAt,
      runId: event.runId,
      targetId: event.id,
      metadata: Object.fromEntries(Object.entries(event.metadata ?? {}).map(([key, value]) => [key, String(value ?? '')]))
    });
  }
  return refs;
}

function buildReviewEvidenceRefs(round: ReviewRound, issue?: ReviewIssue): ThinkingChainEvidenceRef[] {
  const refs: ThinkingChainEvidenceRef[] = [
    {
      id: `review:${round.id}`,
      kind: 'review-round',
      label: round.summary || `${round.stage} review`,
      summary: projectedThoughtText(round.redFeedback || round.blueOutput || round.summary, 'evidence').summary,
      createdAt: round.createdAt,
      sessionId: round.sessionId,
      reviewRoundId: round.id,
      path: round.documentPath,
      targetId: round.id
    }
  ];
  if (issue) {
    refs.push({
      id: `review-issue:${issue.id}`,
      kind: 'review-issue',
      label: issue.title,
      summary: clipText(normalizeWhitespace(issue.detail), 120),
      createdAt: round.createdAt,
      sessionId: round.sessionId,
      reviewRoundId: round.id,
      path: round.documentPath,
      targetId: issue.id,
      metadata: {
        state: issue.state
      }
    });
  }
  return refs;
}

function buildArtifactEvidenceRef(revision: ArtifactRevisionRecord): ThinkingChainEvidenceRef {
  const missing = !pathExists(revision.absolutePath);
  return {
    id: `artifact-revision:${revision.id}`,
    kind: 'artifact-revision',
    label: revision.title || revision.artifactPath,
    summary: clipText(normalizeWhitespace(revision.contentSummary || revision.validationMessage || revision.artifactPath), 120),
    createdAt: revision.createdAt,
    runId: revision.runId,
    path: revision.absolutePath,
    targetId: revision.id,
    missing,
    metadata: {
      artifactPath: revision.artifactPath,
      writeMode: revision.writeMode
    }
  };
}

function buildDocumentChangeEvidenceRef(record: DocumentChangeRecord): ThinkingChainEvidenceRef {
  const missing = !pathExists(record.filePath);
  return {
    id: `document-change:${record.id}`,
    kind: 'document-change',
    label: record.title,
    summary: clipText(normalizeWhitespace(record.summary), 120),
    createdAt: record.createdAt,
    path: record.filePath,
    targetId: record.id,
    missing,
    metadata: {
      source: record.source
    }
  };
}

function nodeLevel(stage: ThinkingChainNodeStage) {
  return stageRank(stage);
}

function statusPriority(status: ThinkingChainNodeStatus) {
  switch (status) {
    case 'accepted':
      return 4;
    case 'active':
      return 3;
    case 'rejected':
      return 2;
    case 'abandoned':
      return 1;
    case 'orphaned':
      return 0;
    default:
      return 0;
  }
}

function strongerStatus(left: ThinkingChainNodeStatus, right: ThinkingChainNodeStatus) {
  return statusPriority(right) > statusPriority(left) ? right : left;
}

function semanticTopicFromText(value: string, fallback = '') {
  const normalized = normalizeWhitespace(value);
  const prefixed = normalized.match(/^([^:：]{1,32})[:：]/)?.[1]?.trim();
  const topic = prefixed || fallback || normalized || 'thought';
  return clipText(topic.toLowerCase(), 48);
}

function semanticKeyFromSource(args: {
  rawText: string;
  fallbackTitle: string;
  kind: ThinkingChainNodeKind;
  stage: ThinkingChainNodeStage;
  artifactPath?: string;
  artifactAnchor?: string;
}) {
  if (args.artifactPath) {
    return `artifact:${path.normalize(args.artifactPath).toLowerCase()}`;
  }
  const topic = semanticTopicFromText(args.rawText, args.fallbackTitle);
  if (args.stage === 'core') return `focus:${topic}`;
  if (args.stage === 'discarded') return `discarded:${topic}`;
  if (args.stage === 'exploration') return `exploration:${topic}`;
  if (args.stage === 'constraint') return `constraint:${topic}`;
  if (args.stage === 'conclusion') return `decision:${topic}`;
  if (args.stage === 'premise') return `premise:${topic}`;
  if (args.kind === 'criterion') return `criterion:${topic}`;
  if (args.kind === 'decision') return `decision:${topic}`;
  return `idea:${topic}`;
}

function semanticTopicFromKey(value: string) {
  const index = value.indexOf(':');
  return index >= 0 ? value.slice(index + 1) : value;
}

export class ThinkingChainProjector {
  constructor(private readonly layoutStore = new ThinkingChainLayoutStore()) {}

  private snapshotFile(rootPath: string, sessionId: string) {
    return path.join(rootPath, '.project', 'runtime', 'thinking-chains', `${sessionId}.json`);
  }

  saveLayout(rootPath: string, sessionId: string, layout: {
    nodes?: Record<string, { x: number; y: number; pinned?: boolean }>;
    view?: Partial<ThinkingChainLayoutState['view']>;
  }) {
    return this.layoutStore.save(rootPath, sessionId, layout);
  }

  resetLayout(rootPath: string, sessionId: string) {
    this.layoutStore.reset(rootPath, sessionId);
  }

  private applyLayoutState(snapshot: ThinkingChainSnapshot, layoutState: ThinkingChainLayoutState | null): ThinkingChainSnapshot {
    if (!layoutState) {
      return {
        ...snapshot,
        layoutState: null
      };
    }
    return {
      ...snapshot,
      layoutState,
      nodes: snapshot.nodes.map((node) => ({
        ...node,
        manualPosition: layoutState.nodes[node.semanticKey] ?? node.manualPosition
      }))
    };
  }

  private selectSession(sessions: AiSession[], requestedSessionId?: string) {
    const requested = requestedSessionId
      ? sessions.find((item) => item.id === requestedSessionId) ?? null
      : sessions[0] ?? null;
    const score = (session: AiSession) =>
      (session.messages.length * 10)
      + ((session.projectDocumentPaths?.length ?? 0) * 2)
      + (session.summary ? 1 : 0);
    if (requested && (requested.messages.length > 0 || (requested.projectDocumentPaths?.length ?? 0) > 0)) {
      return requested;
    }
    return [...sessions].sort((left, right) => score(right) - score(left))[0] ?? requested;
  }

  getSnapshot(input: {
    rootPath: string;
    sessionId?: string;
    projectService: ProjectService;
    runtimeService: RuntimeService;
  }): ThinkingChainSnapshot | null {
    const sessions = input.projectService.loadSessions(input.rootPath);
    const session = this.selectSession(sessions, input.sessionId);
    if (!session) return null;

    const runs = input.runtimeService.listRuns(input.rootPath).filter((run) => run.sessionId === session.id);
    const runIds = new Set(runs.map((run) => run.id));
    const events = input.runtimeService.listEvents(input.rootPath).filter((event) => runIds.has(event.runId));
    const reviewRounds = input.projectService.loadReviewRounds(input.rootPath).filter((round) => round.sessionId === session.id);
    const sessionDocumentPaths = new Set(session.projectDocumentPaths ?? []);
    const artifactRevisions = input.projectService
      .listArtifactRevisions(input.rootPath, 200)
      .filter((revision) => runIds.has(revision.runId ?? '') || sessionDocumentPaths.has(revision.absolutePath));
    const trackedArtifactPaths = new Set(artifactRevisions.map((revision) => revision.absolutePath));
    const documentChanges = input.projectService
      .listRecentDocumentChanges(input.rootPath, 200)
      .filter((record) => sessionDocumentPaths.has(record.filePath) || trackedArtifactPaths.has(record.filePath));

    const snapshot = this.build({
      rootPath: input.rootPath,
      session,
      runs,
      events,
      reviewRounds,
      artifactRevisions,
      documentChanges
    });
    const mergedSnapshot = this.applyLayoutState(snapshot, this.layoutStore.load(input.rootPath, session.id));

    const targetFile = this.snapshotFile(input.rootPath, session.id);
    ensureDir(path.dirname(targetFile));
    fs.writeFileSync(targetFile, JSON.stringify(mergedSnapshot, null, 2), 'utf8');
    return mergedSnapshot;
  }

  build(input: ThinkingChainProjectionInput): ThinkingChainSnapshot {
    const hasEvidence = Boolean(
      input.session.messages.length
      || input.runs.length
      || input.reviewRounds.length
      || input.artifactRevisions.length
      || input.documentChanges.length
    );

    if (!hasEvidence) {
      return {
        sessionId: input.session.id,
        sessionTitle: input.session.title,
        generatedAt: new Date().toISOString(),
        nodes: [],
        edges: [],
        sourceRefs: [],
        layoutState: null,
        counts: {
          totalNodes: 0,
          rejectedNodes: 0,
          orphanedNodes: 0
        }
      };
    }

    const nodes: ThinkingChainNode[] = [];
    const edges: ThinkingChainEdge[] = [];
    const nodeBySemanticKey = new Map<string, ThinkingChainNode>();
    const landedNodeByPath = new Map<string, ThinkingChainNode>();
    const edgeIds = new Set<string>();
    let order = 0;
    let deferredEvidenceRefs: ThinkingChainEvidenceRef[] = [];

    const firstUserMessage = input.session.messages.find((message) => message.role === 'user') ?? input.session.messages[0] ?? null;
    const focusVisible = visibleThoughtText(firstUserMessage?.content || input.session.summary || input.session.title);
    const sanitizedSessionSummary = input.session.summary && !isPayloadOnlyThought(input.session.summary)
      ? clipText(normalizeWhitespace(input.session.summary), 180)
      : focusVisible.summary;
    const focusSemanticKey = semanticKeyFromSource({
      rawText: firstUserMessage?.content || input.session.summary || input.session.title,
      fallbackTitle: focusVisible.title,
      kind: 'goal',
      stage: 'core'
    });
    const focusNode: ThinkingChainNode = {
      id: `thinking-focus:${input.session.id}`,
      semanticKey: focusSemanticKey,
      kind: 'goal',
      status: 'active',
      lane: 'focus',
      stage: 'core',
      title: focusVisible.title,
      summary: sanitizedSessionSummary,
      order,
      level: nodeLevel('core'),
      evidenceRefs: firstUserMessage ? [buildMessageEvidenceRef(input.session.id, firstUserMessage)] : [],
      detailItems: [
        {
          id: `${input.session.id}:focus`,
          label: '当前焦点',
          value: `当前思路地图围绕“${focusVisible.title}”展开。`
        },
        {
          id: `${input.session.id}:stage`,
          label: '阶段',
          value: stageLabel('core')
        }
      ]
    };
    order += 1;
    nodes.push(focusNode);
    nodeBySemanticKey.set(focusNode.semanticKey, focusNode);

    const eventByRunId = new Map<string, RuntimeEvent[]>();
    for (const event of input.events) {
      const bucket = eventByRunId.get(event.runId) ?? [];
      bucket.push(event);
      eventByRunId.set(event.runId, bucket);
    }

    const timeline: ProjectionItem[] = [
      ...input.session.messages
        .filter((message) => message.id !== firstUserMessage?.id)
        .map((message) => ({ type: 'message' as const, createdAt: message.createdAt, message })),
      ...input.runs.map((run) => ({ type: 'run' as const, createdAt: run.createdAt, run })),
      ...input.reviewRounds.flatMap((round) => [
        { type: 'review' as const, createdAt: round.createdAt, round },
        ...round.issues.map((issue) => ({ type: 'review' as const, createdAt: round.createdAt, round, issue }))
      ]),
      ...input.artifactRevisions.map((revision) => ({ type: 'artifact' as const, createdAt: revision.createdAt, revision })),
      ...input.documentChanges.map((record) => ({ type: 'change' as const, createdAt: record.createdAt, record }))
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    const canonicalArtifactPath = (targetPath?: string) => {
      if (!targetPath) return '';
      return path.normalize(path.isAbsolute(targetPath) ? targetPath : path.join(input.rootPath, targetPath));
    };

    const normalizeLookup = (value: string) => normalizeWhitespace(value).toLowerCase();

    const aliasTermsForNode = (node: ThinkingChainNode) => {
      const aliases = new Set<string>();
      const pushAlias = (value?: string) => {
        const normalized = normalizeLookup(value ?? '');
        if (normalized.length >= 2) {
          aliases.add(normalized);
        }
      };
      pushAlias(node.title);
      pushAlias(semanticTopicFromKey(node.semanticKey));
      if (node.summary.length <= 96) {
        pushAlias(node.summary);
      }
      pushAlias(node.artifactAnchor);
      if (node.artifactPath) {
        pushAlias(path.basename(node.artifactPath));
      }
      return [...aliases];
    };

    const relationBetween = (source: ThinkingChainNode, target: Pick<ThinkingChainNode, 'lane' | 'kind' | 'status' | 'stage'>): { kind: ThinkingChainEdgeKind; label: string } => {
      if (target.stage === 'materialized') {
        return { kind: 'materializes', label: '落地到' };
      }
      if (target.stage === 'discarded' || target.status === 'rejected' || target.status === 'abandoned' || target.lane === 'discarded') {
        return { kind: 'replaces', label: '替代/已废弃' };
      }
      if (source.stage === 'constraint' || target.stage === 'constraint' || source.kind === 'criterion' || target.kind === 'criterion') {
        return { kind: 'constrains', label: '约束' };
      }
      if (target.stage === 'exploration' || target.lane === 'exploration') {
        return { kind: 'explores', label: '延伸探索' };
      }
      if (source.stage === 'core' && target.stage === 'premise') {
        return { kind: 'supports', label: '拆解' };
      }
      return { kind: 'derives', label: '推导' };
    };

    const appendEdge = (sourceId: string, targetId: string, relation: { kind: ThinkingChainEdgeKind; label: string }) => {
      if (!sourceId || !targetId || sourceId === targetId) return;
      const edgeId = `edge:${sourceId}:${targetId}:${relation.kind}`;
      if (edgeIds.has(edgeId)) return;
      edgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        sourceId,
        targetId,
        kind: relation.kind,
        label: relation.label
      });
    };

    const recentReasoningNode = (predicate?: (node: ThinkingChainNode) => boolean) =>
      [...nodes]
        .reverse()
        .find((node) => node.lane !== 'landed' && node.semanticKey !== focusSemanticKey && (!predicate || predicate(node)))
      ?? focusNode;

    const recentByStage = (stages: ThinkingChainNodeStage[], predicate?: (node: ThinkingChainNode) => boolean) =>
      [...nodes]
        .reverse()
        .find((node) => stages.includes(node.stage) && node.semanticKey !== focusSemanticKey && (!predicate || predicate(node)))
      ?? focusNode;

    const recentManyByStage = (stages: ThinkingChainNodeStage[], limit = 3) =>
      [...nodes]
        .filter((node) => stages.includes(node.stage) && node.semanticKey !== focusSemanticKey && node.status !== 'rejected' && node.status !== 'abandoned')
        .slice(-limit)
        .map((node) => node.semanticKey);

    const findMentionedParentKeys = (rawText: string, currentSemanticKey: string) => {
      const normalized = normalizeLookup(rawText);
      if (!normalized) return [] as string[];
      const matches = [...nodes]
        .filter((node) => node.semanticKey !== currentSemanticKey && node.lane !== 'landed')
        .filter((node) => aliasTermsForNode(node).some((alias) => normalized.includes(alias)))
        .sort((left, right) => left.order - right.order)
        .map((node) => node.semanticKey);
      return [...new Set(matches)];
    };

    const splitSearchTerms = (rawText: string) => {
      const normalized = normalizeLookup(rawText);
      if (!normalized) return [] as string[];
      return [...new Set(
        normalized
          .split(/[\s/\\#._:-]+/u)
          .map((term) => term.replace(/^\d+/, ''))
          .filter((term) => term.length >= 2)
      )];
    };

    const materializationParentScore = (
      candidate: ThinkingChainNode,
      normalizedRawText: string,
      searchTerms: string[]
    ) => {
      let score = 0;
      for (const alias of aliasTermsForNode(candidate)) {
        const normalizedAlias = normalizeLookup(alias).replace(/^\d+/, '');
        if (!normalizedAlias) continue;
        if (normalizedRawText.includes(normalizedAlias)) {
          score = Math.max(score, 140 + normalizedAlias.length);
        }
        for (const term of searchTerms) {
          if (normalizedAlias.includes(term) || term.includes(normalizedAlias)) {
            score = Math.max(score, 84 + Math.min(term.length, normalizedAlias.length));
          }
        }
      }
      if (candidate.stage === 'conclusion') score += 24;
      if (candidate.stage === 'constraint') score += 12;
      if (candidate.stage === 'premise') score += 8;
      score += candidate.order / 1000;
      return score;
    };

    const pickMaterializationParentKeys = (rawText: string, candidateKeys?: string[]) => {
      const normalizedRawText = normalizeLookup(rawText);
      const searchTerms = splitSearchTerms(rawText);
      const candidateNodes = (candidateKeys?.length
        ? candidateKeys
            .map((key) => nodeBySemanticKey.get(key) ?? null)
            .filter((node): node is ThinkingChainNode => Boolean(node))
        : nodes.filter((node) => node.semanticKey !== focusSemanticKey && node.lane !== 'landed'))
        .filter((node) => node.status !== 'rejected' && node.status !== 'abandoned');
      const ranked = candidateNodes
        .map((node) => ({
          node,
          score: materializationParentScore(node, normalizedRawText, searchTerms)
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length > 0) {
        return [ranked[0].node.semanticKey];
      }
      return [];
    };

    const resolveParentKeys = (draft: {
      semanticKey: string;
      rawText: string;
      kind: ThinkingChainNodeKind;
      lane: ThinkingChainNodeLane;
      stage: ThinkingChainNodeStage;
      status: ThinkingChainNodeStatus;
    }) => {
      const explicit = findMentionedParentKeys(draft.rawText, draft.semanticKey);
      if (draft.stage === 'materialized') {
        const materialized = pickMaterializationParentKeys(draft.rawText, explicit);
        if (materialized.length > 0) {
          return materialized;
        }
      }
      if (explicit.length > 0) {
        return explicit;
      }
      if (draft.stage === 'materialized') {
        return [recentByStage(['conclusion', 'premise', 'constraint']).semanticKey];
      }
      if (draft.stage === 'core') {
        return [];
      }
      if (draft.stage === 'premise') {
        return [focusSemanticKey];
      }
      if (draft.stage === 'constraint' || draft.kind === 'criterion') {
        return [focusSemanticKey];
      }
      if (draft.stage === 'discarded' || draft.lane === 'discarded' || draft.status === 'rejected' || draft.status === 'abandoned') {
        return [recentByStage(['conclusion', 'premise', 'constraint', 'exploration']).semanticKey];
      }
      if (draft.stage === 'exploration') {
        return [recentByStage(['conclusion']).semanticKey];
      }
      if (draft.stage === 'conclusion') {
        const fallback = recentManyByStage(['premise', 'constraint']);
        if (fallback.length > 0) {
          return [...new Set(fallback)];
        }
        return [recentReasoningNode((node) => node.status !== 'rejected' && node.status !== 'abandoned').semanticKey];
      }
      return [recentReasoningNode((node) => node.status !== 'rejected' && node.status !== 'abandoned').semanticKey];
    };

    const mergeStage = (current: ThinkingChainNodeStage, incoming: ThinkingChainNodeStage, incomingStatus: ThinkingChainNodeStatus) => {
      if (current === 'core') return 'core';
      if (incoming === 'materialized' || current === 'materialized') return 'materialized';
      if (current === 'discarded' && incoming !== 'discarded' && incomingStatus !== 'rejected' && incomingStatus !== 'abandoned') {
        return incoming;
      }
      if (current === 'exploration' && incoming === 'conclusion' && incomingStatus === 'accepted') {
        return 'conclusion';
      }
      return stageRank(incoming) >= stageRank(current) ? incoming : current;
    };

    const mergeLane = (current: ThinkingChainNodeLane, incoming: ThinkingChainNodeLane, incomingStatus: ThinkingChainNodeStatus) => {
      if (current === 'focus' || incoming === 'focus') return 'focus';
      if (current === 'landed' || incoming === 'landed') return 'landed';
      if (incomingStatus === 'accepted' && current === 'exploration' && incoming === 'formed') return 'formed';
      if (current === 'discarded' && incoming !== 'discarded' && incomingStatus !== 'rejected' && incomingStatus !== 'abandoned') {
        return incoming;
      }
      return current;
    };

    const mergeKind = (current: ThinkingChainNodeKind, incoming: ThinkingChainNodeKind) => {
      if (current === 'artifact' || incoming === 'artifact') return 'artifact';
      if (current === 'criterion' || incoming === 'criterion') return 'criterion';
      if (current === 'decision' || incoming === 'decision') return 'decision';
      if (current === 'rejected' || incoming === 'rejected') return 'rejected';
      if (current === 'goal' || incoming === 'goal') return 'goal';
      return incoming;
    };

    const attachEdges = (target: ThinkingChainNode, parentKeys: string[]) => {
      for (const parentKey of [...new Set(parentKeys)]) {
        const parent = nodeBySemanticKey.get(parentKey);
        if (!parent) continue;
        appendEdge(parent.id, target.id, relationBetween(parent, target));
      }
    };

    const createOrMergeNode = (draft: {
      id: string;
      semanticKey: string;
      kind: ThinkingChainNodeKind;
      status: ThinkingChainNodeStatus;
      lane: ThinkingChainNodeLane;
      stage: ThinkingChainNodeStage;
      title: string;
      summary: string;
      evidenceRefs?: ThinkingChainEvidenceRef[];
      detailItems?: ThinkingChainDetailItem[];
      artifactPath?: string;
      artifactAnchor?: string;
      rawText: string;
      parentKeys?: string[];
    }) => {
      const parentKeys = draft.parentKeys?.length
        ? draft.parentKeys
        : resolveParentKeys({
            semanticKey: draft.semanticKey,
            rawText: draft.rawText,
            kind: draft.kind,
            lane: draft.lane,
            stage: draft.stage,
            status: draft.status
          });
      const canonicalPath = draft.artifactPath ? canonicalArtifactPath(draft.artifactPath) : '';
      const existing = (canonicalPath ? landedNodeByPath.get(canonicalPath) : undefined) ?? nodeBySemanticKey.get(draft.semanticKey);

      if (existing) {
        existing.kind = mergeKind(existing.kind, draft.kind);
        existing.status = strongerStatus(existing.status, draft.status);
        existing.stage = mergeStage(existing.stage, draft.stage, draft.status);
        existing.lane = mergeLane(existing.lane, draft.lane, draft.status);
        existing.level = nodeLevel(existing.stage);
        existing.title = existing.title.length >= draft.title.length ? existing.title : draft.title;
        existing.summary = existing.summary.length >= draft.summary.length ? existing.summary : draft.summary;
        existing.evidenceRefs = uniqueById([...existing.evidenceRefs, ...deferredEvidenceRefs, ...(draft.evidenceRefs ?? [])]);
        existing.detailItems = uniqueById([...(existing.detailItems ?? []), ...(draft.detailItems ?? [])]);
        if (!existing.artifactPath && draft.artifactPath) {
          existing.artifactPath = draft.artifactPath;
        }
        if (!existing.artifactAnchor && draft.artifactAnchor) {
          existing.artifactAnchor = draft.artifactAnchor;
        }
        deferredEvidenceRefs = [];
        nodeBySemanticKey.set(existing.semanticKey, existing);
        if (canonicalPath) {
          landedNodeByPath.set(canonicalPath, existing);
        }
        attachEdges(existing, parentKeys);
        return existing;
      }

      const created: ThinkingChainNode = {
        id: draft.id,
        semanticKey: draft.semanticKey,
        kind: draft.kind,
        status: draft.status,
        lane: draft.lane,
        stage: draft.stage,
        title: draft.title,
        summary: draft.summary,
        order,
        level: nodeLevel(draft.stage),
        evidenceRefs: uniqueById([...(draft.evidenceRefs ?? []), ...deferredEvidenceRefs]),
        detailItems: draft.detailItems,
        artifactPath: draft.artifactPath,
        artifactAnchor: draft.artifactAnchor
      };
      deferredEvidenceRefs = [];
      order += 1;
      nodes.push(created);
      nodeBySemanticKey.set(created.semanticKey, created);
      if (canonicalPath) {
        landedNodeByPath.set(canonicalPath, created);
      }
      attachEdges(created, parentKeys);
      return created;
    };

    for (const item of timeline) {
      if (item.type === 'message') {
        const evidenceRef = buildMessageEvidenceRef(input.session.id, item.message);
        if (isPayloadOnlyThought(item.message.content)) {
          deferredEvidenceRefs = uniqueById([...deferredEvidenceRefs, evidenceRef]);
          continue;
        }

        const isGuidance = item.message.role === 'assistant' && isGuidancePrompt(item.message.content);
        const semantic = isGuidance
          ? {
              stage: 'exploration' as const,
              kind: 'branch' as const,
              status: 'active' as const,
              lane: 'exploration' as const,
              detailItems: [{ id: `${item.message.id}:reason`, label: '作用', value: '该节点代表当前尚待明确的关键问题，不是最终结论。' }]
            }
          : classifyMessage(item.message);
        const visible = projectedThoughtText(item.message.content);
        createOrMergeNode({
          id: `thinking-message:${item.message.id}`,
          semanticKey: semanticKeyFromSource({
            rawText: item.message.content,
            fallbackTitle: visible.title,
            kind: semantic.kind,
            stage: semantic.stage
          }),
          kind: semantic.kind,
          status: semantic.status,
          lane: semantic.lane,
          stage: semantic.stage,
          title: visible.title,
          summary: visible.summary,
          rawText: item.message.content,
          evidenceRefs: [evidenceRef],
          detailItems: [
            ...semantic.detailItems,
            { id: `${item.message.id}:stage`, label: '阶段', value: stageLabel(semantic.stage) },
            { id: `${item.message.id}:lane`, label: '分区', value: laneLabel(semantic.lane) }
          ]
        });
        continue;
      }

      if (item.type === 'run') {
        const summarySource = item.run.outputs[0]?.content || item.run.latestCheckpointSummary || item.run.currentStep || item.run.id;
        const evidenceRefs = buildRunEvidenceRefs(item.run, eventByRunId.get(item.run.id) ?? []);
        if (isPayloadOnlyThought(summarySource)) {
          deferredEvidenceRefs = uniqueById([...deferredEvidenceRefs, ...evidenceRefs]);
          continue;
        }
        const visible = projectedThoughtText(summarySource);
        createOrMergeNode({
          id: `thinking-run:${item.run.id}`,
          semanticKey: semanticKeyFromSource({
            rawText: summarySource,
            fallbackTitle: visible.title,
            kind: 'decision',
            stage: 'conclusion'
          }),
          kind: 'decision',
          status: item.run.status === 'failed' ? 'orphaned' : 'accepted',
          lane: 'formed',
          stage: 'conclusion',
          title: visible.title,
          summary: visible.summary,
          rawText: summarySource,
          evidenceRefs,
          detailItems: [
            { id: `${item.run.id}:stage`, label: '阶段', value: stageLabel('conclusion') },
            { id: `${item.run.id}:lane`, label: '分区', value: laneLabel('formed') },
            { id: `${item.run.id}:status`, label: '运行状态', value: item.run.status }
          ]
        });
        continue;
      }

      if (item.type === 'review') {
        if (!item.issue) {
          const summarySource = item.round.summary || item.round.redFeedback || item.round.blueOutput;
          const evidenceRefs = buildReviewEvidenceRefs(item.round);
          if (isPayloadOnlyThought(summarySource)) {
            deferredEvidenceRefs = uniqueById([...deferredEvidenceRefs, ...evidenceRefs]);
            continue;
          }
          const visible = projectedThoughtText(summarySource);
          createOrMergeNode({
            id: `thinking-review:${item.round.id}`,
            semanticKey: semanticKeyFromSource({
              rawText: summarySource,
              fallbackTitle: visible.title,
              kind: 'decision',
              stage: 'conclusion'
            }),
            kind: 'decision',
            status: item.round.status === 'failed' ? 'orphaned' : 'accepted',
            lane: 'formed',
            stage: 'conclusion',
            title: visible.title,
            summary: visible.summary,
            rawText: summarySource,
            evidenceRefs,
            detailItems: [
              { id: `${item.round.id}:stage-semantic`, label: '阶段', value: stageLabel('conclusion') },
              { id: `${item.round.id}:lane`, label: '分区', value: laneLabel('formed') },
              { id: `${item.round.id}:stage`, label: '审查阶段', value: item.round.stage }
            ]
          });
        } else {
          const lane: ThinkingChainNodeLane = item.issue.state === 'ignored' ? 'discarded' : 'formed';
          const stage: ThinkingChainNodeStage = item.issue.state === 'ignored' ? 'discarded' : 'constraint';
          const rawText = `${item.issue.title} ${item.issue.detail}`;
          createOrMergeNode({
            id: `thinking-review-issue:${item.issue.id}`,
            semanticKey: semanticKeyFromSource({
              rawText,
              fallbackTitle: item.issue.title,
              kind: item.issue.state === 'ignored' ? 'rejected' : 'criterion',
              stage
            }),
            kind: item.issue.state === 'ignored' ? 'rejected' : 'criterion',
            status: item.issue.state === 'ignored' ? 'rejected' : item.issue.state === 'adopted' ? 'accepted' : 'active',
            lane,
            stage,
            title: summarizeText(item.issue.title, 64),
            summary: clipText(normalizeWhitespace(item.issue.detail), 180),
            rawText,
            evidenceRefs: buildReviewEvidenceRefs(item.round, item.issue),
            detailItems: [
              { id: `${item.issue.id}:stage`, label: '阶段', value: stageLabel(stage) },
              { id: `${item.issue.id}:lane`, label: '分区', value: laneLabel(lane) },
              { id: `${item.issue.id}:state`, label: '审查结果', value: item.issue.state }
            ]
          });
        }
        continue;
      }

      if (item.type === 'artifact') {
        const evidenceRef = buildArtifactEvidenceRef(item.revision);
        const artifactPath = item.revision.absolutePath || item.revision.artifactPath;
        const rawText = `${item.revision.title ?? ''} ${item.revision.contentSummary ?? ''} ${item.revision.artifactPath}`;
        createOrMergeNode({
          id: `thinking-artifact:${item.revision.id}`,
          semanticKey: semanticKeyFromSource({
            rawText,
            fallbackTitle: item.revision.title || artifactNodeTitle(artifactPath, item.revision.title),
            kind: 'artifact',
            stage: 'materialized',
            artifactPath,
            artifactAnchor: item.revision.title
          }),
          kind: 'artifact',
          status: evidenceRef.missing ? 'orphaned' : 'accepted',
          lane: 'landed',
          stage: 'materialized',
          title: artifactNodeTitle(artifactPath, item.revision.title),
          summary: artifactNodeSummary(artifactPath, item.revision.title),
          rawText,
          evidenceRefs: [evidenceRef],
          detailItems: [
            { id: `${item.revision.id}:stage`, label: '阶段', value: stageLabel('materialized') },
            { id: `${item.revision.id}:lane`, label: '分区', value: laneLabel('landed') },
            { id: `${item.revision.id}:path`, label: '产物路径', value: item.revision.artifactPath }
          ],
          artifactPath,
          artifactAnchor: item.revision.title
        });
        continue;
      }

      const evidenceRef = buildDocumentChangeEvidenceRef(item.record);
      const rawText = `${item.record.title} ${item.record.summary} ${item.record.filePath}`;
      createOrMergeNode({
        id: `thinking-change:${item.record.id}`,
        semanticKey: semanticKeyFromSource({
          rawText,
          fallbackTitle: item.record.title,
          kind: 'artifact',
          stage: 'materialized',
          artifactPath: item.record.filePath,
          artifactAnchor: item.record.title
        }),
        kind: 'artifact',
        status: evidenceRef.missing ? 'orphaned' : 'active',
        lane: 'landed',
        stage: 'materialized',
        title: artifactNodeTitle(item.record.filePath, item.record.title),
        summary: artifactNodeSummary(item.record.filePath, item.record.title),
        rawText,
        evidenceRefs: [evidenceRef],
        detailItems: [
          { id: `${item.record.id}:stage`, label: '阶段', value: stageLabel('materialized') },
          { id: `${item.record.id}:lane`, label: '分区', value: laneLabel('landed') },
          { id: `${item.record.id}:path`, label: '文档路径', value: item.record.filePath }
        ],
        artifactPath: item.record.filePath,
        artifactAnchor: item.record.title
      });
    }

    if (deferredEvidenceRefs.length > 0) {
      focusNode.evidenceRefs = uniqueById([...focusNode.evidenceRefs, ...deferredEvidenceRefs]);
    }

    const rebindMaterializedEdges = () => {
      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const preservedEdges = edges.filter((edge) => {
        const target = nodeById.get(edge.targetId);
        return !(target?.stage === 'materialized' && edge.kind === 'materializes');
      });
      edges.length = 0;
      edgeIds.clear();
      for (const edge of preservedEdges) {
        edges.push(edge);
        edgeIds.add(edge.id);
      }

      for (const node of nodes.filter((item) => item.stage === 'materialized')) {
        const rawText = [
          node.title,
          node.summary,
          node.artifactPath ?? '',
          node.artifactAnchor ?? '',
          ...node.evidenceRefs.map((ref) => `${ref.label} ${ref.summary ?? ''} ${ref.path ?? ''}`)
        ].join(' ');
        const parentKeys = pickMaterializationParentKeys(rawText);
        if (parentKeys.length > 0) {
          attachEdges(node, parentKeys);
          continue;
        }
        attachEdges(node, [recentByStage(['conclusion', 'premise', 'constraint']).semanticKey]);
      }
    };

    rebindMaterializedEdges();

    const sourceRefs = uniqueById(nodes.flatMap((node) => node.evidenceRefs));
    return {
      sessionId: input.session.id,
      sessionTitle: input.session.title,
      generatedAt: new Date().toISOString(),
      nodes,
      edges,
      sourceRefs,
      layoutState: null,
      counts: {
        totalNodes: nodes.length,
        rejectedNodes: nodes.filter((node) => node.status === 'rejected').length,
        orphanedNodes: nodes.filter((node) => node.status === 'orphaned').length
      }
    };
  }
}
