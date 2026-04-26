import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Handle,
  MarkerType,
  type EdgeChange,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Bot,
  Component,
  Copy,
  FilePlus2,
  GitBranchPlus,
  GripVertical,
  Layers3,
  Network,
  MoreHorizontal,
  PencilLine,
  Play,
  Repeat,
  Save,
  ScanSearch,
  Search,
  SplitSquareHorizontal,
  Trash2,
  Wrench,
  Workflow,
  X
} from 'lucide-react';
import type {
  AgentProfile,
  AiSession,
  AppStage,
  AppSettings,
  ArtifactInvalidationRecord,
  ArtifactRevisionRecord,
  ControlledScriptTool,
  FlowHistoryEntry,
  FlowPathConfig,
  FlowValidationIssue,
  InstalledSkill,
  PlatformAssets,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformFlowNode,
  PlatformRole,
  ProviderCapabilityTag,
  RulesDistillationSnapshot,
  RuntimeCapabilityDefinition,
  RuntimeEvent,
  RuntimeRerunPlan,
  RuntimeRun,
  TaskTemplate,
  RuntimeTemplateAsset,
  RuntimeTemplateExportMappingEntry,
  StageOutputContract,
  StageGuardStatus
} from '../../shared/types';
import { assembleExecutionBundle } from '../../shared/execution-bundle';
import { downstreamNodeIds, validatePlatformFlow } from '../../shared/flow-validator';
import { migrateLegacyRoleToRoleProfile } from '../../shared/orchestration-contracts';
import { resolveEffectiveRulesFromSnapshot } from '../../shared/rule-resolution';
import {
  connectorBindingState,
  roleBindingState,
  summarizeBindingHealth,
  toolBindingState
} from '../../shared/platform-bindings';
import { defaultFlowPathConfig, normalizeRuntimeTemplate, resolveRuntimeExportMapping } from '../../shared/runtime-template';
import { resolveModelPolicyPreview } from '../lib/model-policy';
import {
  createEmptyConnector,
  createEmptyFlow,
  createEmptyAgentProfile,
  createEmptyRole,
  createEmptyTaskTemplate,
  createEmptyTool,
  createRoleCreatorDraft,
  flattenTemplateArtifacts,
  rolePackageStatusForSections,
  roleFromCreatorDraft,
  type RoleCreatorDraft,
  type TemplateArtifactItem
} from './orchestration/workspace-helpers';
import { EmptyBlock, IconButton, SidebarHeader } from './ShellPrimitives';

type AssetTab = 'flows' | 'artifacts' | 'roles' | 'task-templates' | 'agent-profiles' | 'connectors' | 'tools';
type FlowCanvasData = {
  label: string;
  subtitle?: string;
  typeLabel: string;
  summary?: string[];
  isSelected?: boolean;
  stale?: boolean;
  hasNotes?: boolean;
  onSelect?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onOpenSubflow?: () => void;
  onDebug?: () => void;
  onConfigure?: () => void;
};

type FlowEdgeData = {
  branch?: PlatformFlowAsset['edges'][number]['branch'];
  description?: string;
};

type FlowCanvasNode = Node<FlowCanvasData>;
type CanvasContextMenuState =
  | { kind: 'pane'; x: number; y: number }
  | { kind: 'node'; x: number; y: number; nodeId: string }
  | { kind: 'edge'; x: number; y: number; edgeId: string }
  | null;

type FlowBreadcrumbEntry = {
  kind: PlatformFlowAsset['kind'];
  flowId: string;
  name: string;
};

type RuntimePanelTab = 'runtime' | 'artifacts' | 'history';
type RuntimeViewMode = 'novice' | 'advanced';
type WorkspaceMode = 'design' | 'runtime';
type RightPanelMode = 'assistant' | 'governance' | 'assets';

type RerunPreviewState = {
  plan: RuntimeRerunPlan;
  mode: RuntimeRerunPlan['mode'];
  sourceRunId?: string;
};

function edgeStyleForBranch(branch?: PlatformFlowAsset['edges'][number]['branch']) {
  switch (branch) {
    case 'loop':
      return { stroke: '#c47d18', strokeWidth: 2.2, strokeDasharray: '8 4' };
    case 'exit':
      return { stroke: '#2f6b9a', strokeWidth: 2 };
    case 'true':
      return { stroke: '#2c7a4b', strokeWidth: 2 };
    case 'false':
      return { stroke: '#a04d3c', strokeWidth: 2 };
    default:
      return { strokeWidth: 1.9 };
  }
}

function edgeLabelForBranch(branch?: PlatformFlowAsset['edges'][number]['branch'], fallback?: string) {
  if (fallback) return fallback;
  switch (branch) {
    case 'loop':
      return '循环';
    case 'exit':
      return '退出';
    case 'true':
      return '是';
    case 'false':
      return '否';
    default:
      return undefined;
  }
}

function branchFromHandle(handleId?: string): PlatformFlowAsset['edges'][number]['branch'] {
  switch (handleId) {
    case 'true':
    case 'false':
    case 'loop':
    case 'exit':
      return handleId;
    default:
      return 'default';
  }
}

const assetTabMeta: Array<{ id: AssetTab; label: string; icon: typeof Workflow }> = [
  { id: 'flows', label: '流程', icon: Workflow },
  { id: 'artifacts', label: '工件', icon: Layers3 },
  { id: 'roles', label: '角色', icon: Bot },
  { id: 'task-templates', label: '任务', icon: PencilLine },
  { id: 'agent-profiles', label: '执行配置', icon: Component },
  { id: 'connectors', label: '连接', icon: Network },
  { id: 'tools', label: '工具', icon: Wrench }
];

const stageLabels: Record<AppStage, string> = {
  discover: '发现',
  clarify: '澄清',
  plan: '规划',
  draft: '起草',
  review: '审查',
  finalize: '定稿'
};

const flowKindMeta: Array<{ id: PlatformFlowAsset['kind']; label: string; icon: typeof Workflow }> = [
  { id: 'flow', label: '主流程', icon: Workflow },
  { id: 'subflow', label: '子流程', icon: Component }
];

function defaultNodeLabel(type: PlatformFlowNode['type']) {
  switch (type) {
    case 'agent':
      return '智能角色';
    case 'tool':
      return '工具';
    case 'condition':
      return '条件';
    case 'loop':
      return '循环';
    case 'approval':
      return '审批';
    case 'parallel_split':
      return '并行分叉';
    case 'parallel_join':
      return '并行汇合';
    case 'subflow':
      return '子流程';
    case 'artifact':
      return '工件';
    case 'start':
      return '开始';
    case 'end':
      return '结束';
    default:
      return '节点';
  }
}

function runtimeStatusLabel(status: RuntimeRun['status']) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '运行中';
    case 'pause-requested':
      return '等待暂停';
    case 'paused':
      return '已暂停';
    case 'waiting-approval':
      return 'Waiting Approval';
    case 'merge-required':
      return '待合并确认';
    case 'stopped':
      return '已停止';
    case 'completed':
      return '已完成';
    case 'failed':
    default:
      return '失败';
  }
}

function rerunModeLabel(mode: RuntimeRerunPlan['mode']) {
  switch (mode) {
    case 'debug':
      return '调试重跑';
    case 'partial-rerun':
      return '局部重跑';
    case 'continue':
    default:
      return '从此继续';
  }
}

function nodeSubtitle(
  node: PlatformFlowNode,
  roles: PlatformRole[],
  connectors: PlatformConnector[],
  tools: ControlledScriptTool[],
  subflows: PlatformFlowAsset[]
) {
  if (node.type === 'agent' && node.data.roleId) {
    const roleName = roles.find((item) => item.id === node.data.roleId)?.name ?? '未绑定角色';
    const connectorName = node.data.connectorId
      ? connectors.find((item) => item.id === node.data.connectorId)?.name ?? '未绑定连接'
      : '';
    return connectorName ? `${roleName} · ${connectorName}` : roleName;
  }
  if (node.type === 'tool') {
    if (node.data.toolIds?.length) {
      return `${node.data.toolIds.length} 个工具`;
    }
    if (node.data.toolId) {
      return tools.find((item) => item.id === node.data.toolId)?.name ?? '未绑定工具';
    }
    if (node.data.connectorId) {
      return connectors.find((item) => item.id === node.data.connectorId)?.name ?? '未绑定连接';
    }
  }
  if (node.type === 'subflow' && node.data.subflowId) {
    return subflows.find((item) => item.id === node.data.subflowId)?.name ?? '未绑定子流程';
  }
  if (node.type === 'artifact' && node.data.artifactPath) {
    return node.data.artifactPath;
  }
  if (node.type === 'condition' && node.data.conditionExpression) {
    return node.data.conditionExpression;
  }
  return node.data.description || undefined;
}

function nodeSummary(
  nodes: PlatformFlowAsset['nodes'],
  node: PlatformFlowNode,
  roles: PlatformRole[],
  connectors: PlatformConnector[],
  tools: ControlledScriptTool[],
  subflows: PlatformFlowAsset[]
) {
  const lookupNodeName = (nodeId?: string) =>
    nodeId
      ? nodes.find((item) => item.id === nodeId)?.data.label
      : undefined;

  const lines: string[] = [];
  if (node.type === 'agent') {
    if (node.data.roleId) {
      lines.push(`角色：${roles.find((item) => item.id === node.data.roleId)?.name ?? '未绑定'}`);
    }
    if (node.data.connectorId) {
      lines.push(`连接：${connectors.find((item) => item.id === node.data.connectorId)?.name ?? '未绑定'}`);
    }
    if (node.data.skillIds?.length) {
      lines.push(`技能：${node.data.skillIds.length} 项覆盖`);
    }
  }
  if (node.type === 'tool') {
    if (node.data.toolIds?.length) {
      lines.push(`工具：${node.data.toolIds.length} 项`);
    } else if (node.data.toolId) {
      lines.push(`工具：${tools.find((item) => item.id === node.data.toolId)?.name ?? '未绑定'}`);
    } else if (node.data.connectorId) {
      lines.push(`连接：${connectors.find((item) => item.id === node.data.connectorId)?.name ?? '未绑定'}`);
    }
  }
  if (node.type === 'subflow') {
    lines.push(`子流程：${subflows.find((item) => item.id === node.data.subflowId)?.name ?? '未绑定'}`);
    if (node.data.subflowInputBindings?.length) lines.push(`输入映射：${node.data.subflowInputBindings.length} 项`);
    if (node.data.subflowOutputBindings?.length) lines.push(`输出回写：${node.data.subflowOutputBindings.length} 项`);
  }
  if (node.type === 'artifact') {
    lines.push(node.data.artifactPath ? `工件：${node.data.artifactPath}` : '工件：未设置路径');
  }
  if (node.data.outputArtifactPaths?.length) {
    lines.push(`输出：${node.data.outputArtifactPaths.length} 项工件`);
  }
  if (node.data.outputMessageKeys?.length || node.data.outputSignalKeys?.length) {
    lines.push(`消息/信号：${(node.data.outputMessageKeys?.length ?? 0) + (node.data.outputSignalKeys?.length ?? 0)} 项`);
  }
  if (node.type === 'condition') {
    lines.push(node.data.conditionExpression ? `条件：${node.data.conditionExpression}` : '条件：未设置');
    if (node.data.trueTargetId) lines.push(`是 → ${lookupNodeName(node.data.trueTargetId) ?? node.data.trueTargetId}`);
    if (node.data.falseTargetId) lines.push(`否 → ${lookupNodeName(node.data.falseTargetId) ?? node.data.falseTargetId}`);
  }
  if (node.type === 'loop') {
    lines.push(node.data.loopExpression ? `循环：${node.data.loopExpression}` : '循环：未设置');
    if (node.data.exitExpression) lines.push(`退出：${node.data.exitExpression}`);
    if (typeof node.data.loopTimeoutMs === 'number') lines.push(`超时：${node.data.loopTimeoutMs}ms`);
    if (node.data.loopBackTargetId) lines.push(`循环回边 → ${lookupNodeName(node.data.loopBackTargetId) ?? node.data.loopBackTargetId}`);
    if (node.data.exitTargetId) lines.push(`退出 → ${lookupNodeName(node.data.exitTargetId) ?? node.data.exitTargetId}`);
  }
  if (node.type === 'parallel_split') {
    if (node.data.parallelFailureStrategy) lines.push(`失败策略：${node.data.parallelFailureStrategy}`);
    if (node.data.parallelCancellationPolicy) lines.push(`取消策略：${node.data.parallelCancellationPolicy}`);
  }
  return lines.slice(0, 3);
}

function toReactNodes(
  nodes: PlatformFlowAsset['nodes'],
  roles: PlatformRole[],
  connectors: PlatformConnector[],
  tools: ControlledScriptTool[],
  subflows: PlatformFlowAsset[],
  staleNodeIds: string[],
  selectedNodeId?: string,
  existingNodes: FlowCanvasNode[] = []
): FlowCanvasNode[] {
  return nodes.map((node) => {
    const existing = existingNodes.find((item) => item.id === node.id);
    return {
      ...existing,
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        ...existing?.data,
        label: node.data.label,
        subtitle: nodeSubtitle(node, roles, connectors, tools, subflows),
        typeLabel: defaultNodeLabel(node.type),
        summary: nodeSummary(nodes, node, roles, connectors, tools, subflows),
        isSelected: node.id === selectedNodeId,
        stale: staleNodeIds.includes(node.id),
        hasNotes: Boolean(node.data.notes?.trim())
      }
    };
  });
}

function toReactEdges(edges: PlatformFlowAsset['edges']): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.branch && edge.branch !== 'default' ? edge.branch : undefined,
    label: edgeLabelForBranch(edge.branch, edge.label),
    data: { branch: edge.branch, description: edge.description } satisfies FlowEdgeData,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: edge.branch === 'loop',
    style: edgeStyleForBranch(edge.branch)
  }));
}

function toPlatformNodes(flowNodes: FlowCanvasNode[], source: PlatformFlowAsset['nodes']) {
  return source.map((node) => {
    const match = flowNodes.find((item) => item.id === node.id);
    return {
      ...node,
      position: match?.position ?? node.position,
      data: {
        ...node.data,
        label: match?.data.label ?? node.data.label
      }
    };
  });
}

function toPlatformEdges(edges: Edge[]): PlatformFlowAsset['edges'] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    branch: branchFromHandle(edge.sourceHandle ?? (edge.data as FlowEdgeData | undefined)?.branch),
    description: (edge.data as FlowEdgeData | undefined)?.description
  }));
}

function FlowNodeCard({ data, selected, type }: NodeProps<FlowCanvasNode>) {
  const isSelected = data.isSelected ?? selected;
  const sourceHandleStyle = (slot: 'single' | 'upper' | 'lower'): CSSProperties => {
    switch (slot) {
      case 'upper':
        return { top: 'calc(100% - 52px)' };
      case 'lower':
        return { top: 'calc(100% - 24px)' };
      case 'single':
      default:
        return { top: 'calc(100% - 24px)' };
    }
  };
  const renderOutputs = () => {
    if (type === 'end') {
      return null;
    }
    if (type === 'condition') {
      return (
        <div className="flow-node-output-stack">
          <div className="flow-node-output">
            <span className="flow-node-output-label success">是</span>
            <Handle id="true" type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('upper')} />
          </div>
          <div className="flow-node-output">
            <span className="flow-node-output-label danger">否</span>
            <Handle id="false" type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('lower')} />
          </div>
        </div>
      );
    }
    if (type === 'loop') {
      return (
        <div className="flow-node-output-stack">
          <div className="flow-node-output">
            <span className="flow-node-output-label warning">循环</span>
            <Handle id="loop" type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('upper')} />
          </div>
          <div className="flow-node-output">
            <span className="flow-node-output-label accent">退出</span>
            <Handle id="exit" type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('lower')} />
          </div>
        </div>
      );
    }
    if (type === 'parallel_split') {
      return (
        <div className="flow-node-output-stack">
          <div className="flow-node-output">
            <span className="flow-node-output-label accent">并行分支</span>
            <Handle type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('single')} />
          </div>
        </div>
      );
    }
    if (type === 'parallel_join') {
      return null;
    }
    return (
      <div className="flow-node-output-stack">
        <div className="flow-node-output">
          <span className="flow-node-output-label accent">下一步</span>
          <Handle type="source" position={Position.Right} className="flow-handle flow-handle-inline" style={sourceHandleStyle('single')} />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`flow-node-card ${isSelected ? 'selected' : ''}`}
      onMouseUpCapture={(event) => {
        if (event.button !== 2) return;
        event.preventDefault();
        event.stopPropagation();
        data.onContextMenu?.(event as ReactMouseEvent<HTMLDivElement>);
      }}
      onContextMenuCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onContextMenu?.(event);
      }}
      onClick={() => data.onSelect?.()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        data.onContextMenu?.(event);
      }}
    >
      {type !== 'start' ? <Handle type="target" position={Position.Left} className="flow-handle" /> : null}
      <div className="flow-node-type">{data.typeLabel || type}</div>
      {data.stale || data.hasNotes ? (
        <div className="flow-node-badges">
          {data.stale ? <span className="small-tag warn" title="该节点下游结果待确认">待确认</span> : null}
          {data.hasNotes ? <span className="small-tag" title="该节点包含备注">备注</span> : null}
        </div>
      ) : null}
      {isSelected ? (
        <div className="flow-node-actions">
          <button type="button" title="调试节点" aria-label="调试节点" onClick={(event) => {
            event.stopPropagation();
            data.onDebug?.();
          }}>
            <Play size={12} strokeWidth={1.8} />
          </button>
          <button type="button" title="配置节点" aria-label="配置节点" onClick={(event) => {
            event.stopPropagation();
            data.onConfigure?.();
          }}>
            <PencilLine size={12} strokeWidth={1.8} />
          </button>
          {type === 'subflow' ? (
            <button type="button" title="进入子流程" aria-label="进入子流程" onClick={(event) => {
              event.stopPropagation();
              data.onOpenSubflow?.();
            }}>
              <Component size={12} strokeWidth={1.8} />
            </button>
          ) : null}
          <button type="button" title="复制节点" aria-label="复制节点" onClick={(event) => {
            event.stopPropagation();
            data.onDuplicate?.();
          }}>
            <Copy size={12} strokeWidth={1.8} />
          </button>
          <button type="button" title="删除节点" aria-label="删除节点" onClick={(event) => {
            event.stopPropagation();
            data.onDelete?.();
          }}>
            <Trash2 size={12} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}
      <strong>{data.label}</strong>
      {data.subtitle ? <div className="muted-line">{data.subtitle}</div> : null}
      {data.summary?.length ? (
        <div className="flow-node-summary">
          {data.summary.map((item: string) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      {renderOutputs()}
    </div>
  );
}

const nodeTypes: any = {
  start: FlowNodeCard,
  end: FlowNodeCard,
  agent: FlowNodeCard,
  tool: FlowNodeCard,
  condition: FlowNodeCard,
  loop: FlowNodeCard,
  approval: FlowNodeCard,
  parallel_split: FlowNodeCard,
  parallel_join: FlowNodeCard,
  subflow: FlowNodeCard,
  artifact: FlowNodeCard
};

function NodeTokenEditor({
  title,
  hint,
  values,
  suggestions = [],
  placeholder,
  onChange,
  emptyLabel = '暂无'
}: {
  title: string;
  hint?: string;
  values: string[];
  suggestions?: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  emptyLabel?: string;
}) {
  const [draft, setDraft] = useState('');
  const normalizedSuggestions = Array.from(new Set(suggestions.map((item) => item.trim()).filter(Boolean)));

  const commitDraft = () => {
    const nextValues = Array.from(new Set([
      ...values,
      ...draft
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    ]));
    onChange(nextValues);
    setDraft('');
  };

  return (
    <section className="node-config-card">
      <div className="node-config-card-head">
        <div>
          <strong>{title}</strong>
          {hint ? <p>{hint}</p> : null}
        </div>
      </div>
      <div className="tag-cloud compact">
        {values.length ? values.map((value) => (
          <button
            key={`${title}-${value}`}
            type="button"
            className="small-tag button-chip active"
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
          </button>
        )) : <span className="muted-inline">{emptyLabel}</span>}
      </div>
      {normalizedSuggestions.length ? (
        <div className="tag-cloud compact">
          {normalizedSuggestions.map((value) => {
            const active = values.includes(value);
            return (
              <button
                key={`${title}-suggestion-${value}`}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => onChange(active ? values.filter((item) => item !== value) : [...values, value])}
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="node-token-editor-row">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!draft.trim()) return;
            commitDraft();
          }}
        />
        <button type="button" className="button-secondary" onClick={commitDraft} disabled={!draft.trim()}>添加</button>
      </div>
    </section>
  );
}

export function OrchestrationWorkspace({
  projectName,
  platform,
  runtimeTemplate,
  settings,
  draftMode = false,
  draftStatus,
  installedSkills,
  activeSession,
  chatInput,
  sending,
  setChatInput,
  sendMessage,
  stageGuard,
  onSaveFlow,
  onDeleteFlow,
  onDuplicateFlow,
  onImportFlow,
  onExportFlow,
  onSaveRoles,
  onSaveTaskTemplates,
  onSaveAgentProfiles,
  onSaveConnectors,
  onSaveTools,
  onTestConnector,
  onRunTool,
  artifactRevisions,
  artifactInvalidations,
  rulesDistillation,
  runtimeRuns,
  runtimeEvents,
  runtimeCapabilities,
  flowHistories,
  onSaveRuntimeTemplate,
  onValidateFlow,
  onRestoreFlowVersion,
  onDebugNode,
  onPreviewRerun,
  onApplyRerun,
  onPauseRun,
  onResumeRun,
  onResolveApproval,
  onRetryRun,
  onStopRun,
  focusRequest,
  onConversationTargetChange,
  onOpenConversation,
  onOpenRunMerge,
  onSaveTemplate,
  onBindToProject,
  onReturnToProject
}: {
  projectName: string;
  platform: PlatformAssets;
  runtimeTemplate: RuntimeTemplateAsset | null;
  settings: AppSettings;
  draftMode?: boolean;
  draftStatus?: string;
  installedSkills: InstalledSkill[];
  activeSession: AiSession | null;
  chatInput: string;
  sending: boolean;
  setChatInput: (value: string) => void;
  sendMessage: () => void | Promise<void>;
  stageGuard: StageGuardStatus | null;
  onSaveFlow: (flow: PlatformFlowAsset) => Promise<void>;
  onDeleteFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => Promise<void>;
  onDuplicateFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => Promise<void>;
  onImportFlow: (kind: PlatformFlowAsset['kind']) => Promise<void>;
  onExportFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => Promise<void>;
  onSaveRoles: (roles: PlatformRole[]) => Promise<void>;
  onSaveTaskTemplates: (taskTemplates: TaskTemplate[]) => Promise<void>;
  onSaveAgentProfiles: (agentProfiles: AgentProfile[]) => Promise<void>;
  onSaveConnectors: (connectors: PlatformConnector[]) => Promise<void>;
  onSaveTools: (tools: ControlledScriptTool[]) => Promise<void>;
  onTestConnector: (connectorId: string) => Promise<{ ok: boolean; message: string }>;
  onRunTool: (toolId: string) => Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>;
  artifactRevisions: ArtifactRevisionRecord[];
  artifactInvalidations: ArtifactInvalidationRecord[];
  rulesDistillation?: RulesDistillationSnapshot | null;
  runtimeRuns: RuntimeRun[];
  runtimeEvents: RuntimeEvent[];
  runtimeCapabilities: RuntimeCapabilityDefinition[];
  flowHistories: Record<string, FlowHistoryEntry[]>;
  onSaveRuntimeTemplate: (template: RuntimeTemplateAsset) => Promise<{ template: RuntimeTemplateAsset; issues: Array<{ severity: 'warning' | 'error'; message: string }> }>;
  onValidateFlow: (kind: PlatformFlowAsset['kind'], flowId: string) => Promise<FlowValidationIssue[]>;
  onRestoreFlowVersion: (kind: PlatformFlowAsset['kind'], flowId: string, versionId: string) => Promise<void>;
  onDebugNode: (kind: PlatformFlowAsset['kind'], flowId: string, nodeId: string) => Promise<{ run: RuntimeRun; events: RuntimeEvent[] }>;
  onPreviewRerun?: (
    kind: PlatformFlowAsset['kind'],
    flowId: string,
    nodeId: string,
    sourceRunId?: string,
    mode?: RuntimeRerunPlan['mode']
  ) => Promise<{ flow: PlatformFlowAsset; node: PlatformFlowNode; plan: RuntimeRerunPlan }>;
  onApplyRerun?: (
    kind: PlatformFlowAsset['kind'],
    flowId: string,
    nodeId: string,
    sourceRunId?: string,
    mode?: RuntimeRerunPlan['mode']
  ) => Promise<{ plan: RuntimeRerunPlan; run: RuntimeRun; snapshot?: { id: string } }>;
  onPauseRun?: (runId: string) => Promise<void>;
  onResumeRun?: (runId: string) => Promise<void>;
  onResolveApproval?: (runId: string, approvalId: string, approved: boolean, reason?: string) => Promise<void>;
  onRetryRun?: (runId: string) => Promise<void>;
  onStopRun?: (runId: string) => Promise<void>;
  focusRequest?: {
    token: string;
    kind: PlatformFlowAsset['kind'];
    flowId: string;
    nodeId?: string;
  } | null;
  onConversationTargetChange?: (flow: PlatformFlowAsset | null) => void;
  onOpenConversation?: () => void;
  onOpenRunMerge?: (runId: string) => Promise<void>;
  onSaveTemplate: () => void;
  onBindToProject?: () => void;
  onReturnToProject: () => void;
}) {
  const [assetTab, setAssetTab] = useState<AssetTab>('flows');
  const [flowKind, setFlowKind] = useState<PlatformFlowAsset['kind']>('flow');
  const [currentFlowId, setCurrentFlowId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState('');
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [selectedToolId, setSelectedToolId] = useState('');
  const [assetStatus, setAssetStatus] = useState('');
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState>(null);
  const [currentFlowName, setCurrentFlowName] = useState('');
  const [currentFlowDescription, setCurrentFlowDescription] = useState('');
  const [currentFlowRoleIds, setCurrentFlowRoleIds] = useState<string[]>([]);
  const [currentFlowPathConfig, setCurrentFlowPathConfig] = useState<FlowPathConfig>(defaultFlowPathConfig());
  const [flowDraftNodes, setFlowDraftNodes] = useState<PlatformFlowNode[]>([]);
  const [rolesDraft, setRolesDraft] = useState<PlatformRole[]>(platform.roles);
  const [taskTemplatesDraft, setTaskTemplatesDraft] = useState<TaskTemplate[]>(platform.taskTemplates);
  const [agentProfilesDraft, setAgentProfilesDraft] = useState<AgentProfile[]>(platform.agentProfiles);
  const [connectorsDraft, setConnectorsDraft] = useState<PlatformConnector[]>(platform.connectors);
  const [toolsDraft, setToolsDraft] = useState<ControlledScriptTool[]>(platform.tools);
  const [assetManagerOpen, setAssetManagerOpen] = useState(false);
  const [selectionInspectorOpen, setSelectionInspectorOpen] = useState(false);
  const [runtimePanelOpen, setRuntimePanelOpen] = useState(false);
  const [runtimePanelTab, setRuntimePanelTab] = useState<RuntimePanelTab>('runtime');
  const [runtimeViewMode, setRuntimeViewMode] = useState<RuntimeViewMode>('novice');
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('assistant');
  const [rerunPreview, setRerunPreview] = useState<RerunPreviewState | null>(null);
  const [rerunBusyMode, setRerunBusyMode] = useState<RuntimeRerunPlan['mode'] | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('design');
  const [addCardMenuOpen, setAddCardMenuOpen] = useState(false);
  const [flowModuleQuery, setFlowModuleQuery] = useState('');
  const [flowBreadcrumbStack, setFlowBreadcrumbStack] = useState<FlowBreadcrumbEntry[]>([]);
  const [roleCreatorNodeId, setRoleCreatorNodeId] = useState<string | null>(null);
  const [roleCreatorDraft, setRoleCreatorDraft] = useState<RoleCreatorDraft>(() => createRoleCreatorDraft(platform.roles.length + 1));
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<FlowCanvasNode, Edge> | null>(null);
  const [flowDirty, setFlowDirty] = useState(false);
  const [staleNodeIds, setStaleNodeIds] = useState<string[]>([]);
  const [templateDraft, setTemplateDraft] = useState<RuntimeTemplateAsset | null>(runtimeTemplate);
  const [flowValidation, setFlowValidation] = useState<FlowValidationIssue[]>([]);
  const flowShellRef = useRef<HTMLDivElement | null>(null);
  const hydratedFlowSignatureRef = useRef('');
  const pendingFocusNodeIdRef = useRef<string | null>(null);
  const flowViewportRef = useRef<Record<string, { x: number; y: number; zoom: number }>>({});
  const templateArtifacts = useMemo(() => flattenTemplateArtifacts(templateDraft), [templateDraft]);
  const isCompact = viewportWidth < 980;
  const currentSessionRuns = useMemo(
    () => activeSession ? runtimeRuns.filter((run) => run.sessionId === activeSession.id) : runtimeRuns,
    [activeSession, runtimeRuns]
  );
  const currentStageRuns = useMemo(
    () => activeSession ? currentSessionRuns.filter((run) => run.stage === activeSession.stage) : currentSessionRuns,
    [activeSession, currentSessionRuns]
  );
  const latestRun = currentStageRuns[0] ?? currentSessionRuns[0] ?? runtimeRuns[0] ?? null;
  const latestRunStatus = latestRun?.controlState?.status ?? latestRun?.status ?? null;
  const latestRunActions = useMemo(
    () => new Set(latestRun?.controlState?.allowedActions ?? []),
    [latestRun]
  );
  const latestRunEvents = useMemo(
    () => latestRun ? runtimeEvents.filter((event) => event.runId === latestRun.id) : [],
    [latestRun, runtimeEvents]
  );
  const activeStageArtifacts = useMemo(
    () => activeSession ? templateArtifacts.filter((artifact) => artifact.stage === activeSession.stage) : templateArtifacts,
    [activeSession, templateArtifacts]
  );
  const activeArtifactInvalidations = useMemo(
    () => artifactInvalidations.filter((item) => item.status === 'active'),
    [artifactInvalidations]
  );
  const artifactInvalidationByPath = useMemo(
    () => new Map(activeArtifactInvalidations.map((item) => [item.artifactPath, item] as const)),
    [activeArtifactInvalidations]
  );
  const latestArtifactRevisionByPath = useMemo(
    () => new Map(artifactRevisions.map((item) => [item.artifactPath, item] as const)),
    [artifactRevisions]
  );
  const nodeLabelById = useMemo(() => {
    const entries = [...platform.flows, ...platform.subflows]
      .flatMap((flow) => flow.nodes.map((node) => [node.id, node.data.label] as const));
    return new Map(entries);
  }, [platform.flows, platform.subflows]);
  const stageArtifactInvalidations = useMemo(
    () => activeStageArtifacts
      .map((artifact) => artifactInvalidationByPath.get(artifact.path) ?? null)
      .filter((item): item is ArtifactInvalidationRecord => Boolean(item)),
    [activeStageArtifacts, artifactInvalidationByPath]
  );
  const currentFlowHistory = flowHistories[`${flowKind}:${currentFlowId}`] ?? [];
  const stageLabel = activeSession ? stageLabels[activeSession.stage] : '未选择阶段';
  const validationErrorCount = flowValidation.filter((issue) => issue.severity === 'error').length;
  const validationWarningCount = flowValidation.filter((issue) => issue.severity === 'warning').length;

  const flowOptions = flowKind === 'subflow' ? platform.subflows : platform.flows;
  const currentFlow = useMemo(
    () => flowOptions.find((item) => item.id === currentFlowId) ?? flowOptions[0] ?? null,
    [flowOptions, currentFlowId]
  );

  const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const selectedCanvasNodes = useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes]
  );

  useEffect(() => {
    setRolesDraft(platform.roles);
    setTaskTemplatesDraft(platform.taskTemplates);
    setAgentProfilesDraft(platform.agentProfiles);
    setConnectorsDraft(platform.connectors);
    setToolsDraft(platform.tools);
  }, [platform.roles, platform.taskTemplates, platform.agentProfiles, platform.connectors, platform.tools]);

  useEffect(() => {
    setTemplateDraft(runtimeTemplate);
  }, [runtimeTemplate]);

  useEffect(() => {
    if (!flowOptions.length) {
      setCurrentFlowId('');
      return;
    }
    if (!flowOptions.some((item) => item.id === currentFlowId)) {
      setCurrentFlowId(flowOptions[0].id);
    }
  }, [flowOptions, currentFlowId]);

  useEffect(() => {
    if (!focusRequest) return;
    pendingFocusNodeIdRef.current = focusRequest.nodeId ?? null;
    setAssetTab('flows');
    setFlowBreadcrumbStack([]);
    setFlowKind(focusRequest.kind);
    if (focusRequest.kind === flowKind && focusRequest.flowId === currentFlowId) {
      if (focusRequest.nodeId) {
        setSelectedNodeId(focusRequest.nodeId);
        setSelectionInspectorOpen(false);
        setRightPanelMode('assistant');
      }
      return;
    }
    setCurrentFlowId(focusRequest.flowId);
  }, [currentFlowId, flowKind, focusRequest]);

  useEffect(() => {
    if (!rolesDraft.length) {
      setSelectedRoleId('');
    } else if (!rolesDraft.some((item) => item.id === selectedRoleId)) {
      setSelectedRoleId(rolesDraft[0].id);
    }
  }, [rolesDraft, selectedRoleId]);

  useEffect(() => {
    if (!connectorsDraft.length) {
      setSelectedConnectorId('');
    } else if (!connectorsDraft.some((item) => item.id === selectedConnectorId)) {
      setSelectedConnectorId(connectorsDraft[0].id);
    }
  }, [connectorsDraft, selectedConnectorId]);

  useEffect(() => {
    if (!toolsDraft.length) {
      setSelectedToolId('');
    } else if (!toolsDraft.some((item) => item.id === selectedToolId)) {
      setSelectedToolId(toolsDraft[0].id);
    }
  }, [toolsDraft, selectedToolId]);

  useEffect(() => {
    if (!taskTemplatesDraft.length) {
      setSelectedTaskTemplateId('');
    } else if (!taskTemplatesDraft.some((item) => item.id === selectedTaskTemplateId)) {
      setSelectedTaskTemplateId(taskTemplatesDraft[0].id);
    }
  }, [taskTemplatesDraft, selectedTaskTemplateId]);

  useEffect(() => {
    if (!agentProfilesDraft.length) {
      setSelectedAgentProfileId('');
    } else if (!agentProfilesDraft.some((item) => item.id === selectedAgentProfileId)) {
      setSelectedAgentProfileId(agentProfilesDraft[0].id);
    }
  }, [agentProfilesDraft, selectedAgentProfileId]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!selectedNodeId && !selectedEdgeId) {
      setSelectionInspectorOpen(false);
    }
  }, [selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    if (!currentFlow) {
      setFlowDraftNodes([]);
      setNodes([]);
      setEdges([]);
      setCurrentFlowName('');
      setCurrentFlowDescription('');
      setCurrentFlowRoleIds([]);
      setStaleNodeIds([]);
      hydratedFlowSignatureRef.current = '';
      return;
    }
    const flowSignature = `${currentFlow.kind}:${currentFlow.id}:${currentFlow.updatedAt}`;
    setFlowDraftNodes(currentFlow.nodes);
    setNodes((current) => toReactNodes(currentFlow.nodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, selectedNodeId, current));
    setEdges(toReactEdges(currentFlow.edges));
    setCurrentFlowName(currentFlow.name);
    setCurrentFlowDescription(currentFlow.description);
    setCurrentFlowRoleIds(currentFlow.roleIds ?? []);
    setCurrentFlowPathConfig(currentFlow.pathConfig ?? defaultFlowPathConfig());
    if (pendingFocusNodeIdRef.current && currentFlow.nodes.some((node) => node.id === pendingFocusNodeIdRef.current)) {
      setSelectedNodeId(pendingFocusNodeIdRef.current);
      setSelectionInspectorOpen(false);
      setRightPanelMode('assistant');
      pendingFocusNodeIdRef.current = null;
    } else {
      setSelectedNodeId('');
    }
    setSelectedEdgeId('');
    setFlowDirty(false);
    setStaleNodeIds([]);
    hydratedFlowSignatureRef.current = flowSignature;
  }, [currentFlow?.id, currentFlow?.updatedAt]);

  useEffect(() => {
    if (!reactFlowInstance || !currentFlow?.id) return;
    window.requestAnimationFrame(() => {
      const savedViewport = flowViewportRef.current[`${currentFlow.kind}:${currentFlow.id}`];
      if (savedViewport) {
        void reactFlowInstance.setViewport(savedViewport, { duration: 0 });
        return;
      }
      reactFlowInstance.fitView({
        padding: 0.12,
        minZoom: 0.82,
        maxZoom: 1.04
      });
    });
  }, [reactFlowInstance, currentFlow?.id, currentFlow?.kind]);

  const draftNodes = useMemo(
    () => toPlatformNodes(nodes, flowDraftNodes),
    [flowDraftNodes, nodes]
  );
  const draftEdges = useMemo(
    () => toPlatformEdges(edges),
    [edges]
  );
  useEffect(() => {
    if (!flowDraftNodes.length) return;
    setNodes((current) => toReactNodes(toPlatformNodes(current, flowDraftNodes), rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, selectedNodeId, current));
  }, [connectorsDraft, flowDraftNodes, platform.subflows, rolesDraft, selectedNodeId, staleNodeIds, toolsDraft]);
  const currentFlowDraft = useMemo(
    () => (currentFlow
      ? {
          ...currentFlow,
          name: currentFlowName.trim() || currentFlow.name,
          description: currentFlowDescription.trim(),
          roleIds: currentFlowRoleIds,
          pathConfig: {
            ...currentFlowPathConfig,
            inputRoot: currentFlowPathConfig.inputRoot.trim() || defaultFlowPathConfig().inputRoot,
            outputRoot: currentFlowPathConfig.outputRoot.trim() || defaultFlowPathConfig().outputRoot
          },
          nodes: draftNodes,
          edges: draftEdges
        }
      : null),
    [currentFlow, currentFlowDescription, currentFlowName, currentFlowPathConfig, currentFlowRoleIds, draftEdges, draftNodes]
  );

  useEffect(() => {
    onConversationTargetChange?.(currentFlowDraft);
  }, [currentFlowDraft, onConversationTargetChange]);

  useEffect(() => {
    if (!currentFlowDraft) {
      setFlowValidation([]);
      return;
    }
    setFlowValidation(validatePlatformFlow(currentFlowDraft, {
      template: templateDraft,
      subflows: platform.subflows,
      roles: rolesDraft,
      taskTemplates: taskTemplatesDraft,
      agentProfiles: agentProfilesDraft,
      connectors: connectorsDraft,
      tools: toolsDraft
    }));
  }, [agentProfilesDraft, connectorsDraft, currentFlowDraft, platform.subflows, rolesDraft, taskTemplatesDraft, templateDraft, toolsDraft]);

  const markStaleFromNode = (nodeId: string) => {
    if (!currentFlowDraft) return;
    const downstream = downstreamNodeIds(currentFlowDraft, nodeId);
    setStaleNodeIds((current) => Array.from(new Set([...current, nodeId, ...downstream])));
  };

  const markAllNodesStale = () => {
    setStaleNodeIds(currentFlowDraft ? currentFlowDraft.nodes.map((node) => node.id) : []);
  };

  const clearStaleNode = (nodeId: string) => {
    setStaleNodeIds((current) => current.filter((item) => item !== nodeId));
  };

  const mutateFlowNodes = (
    updater: (nodes: PlatformFlowNode[]) => PlatformFlowNode[],
    options?: { invalidateFromNodeId?: string; affectRuntime?: boolean }
  ) => {
    const updatedNodes = updater(draftNodes);
    setFlowDraftNodes(updatedNodes);
    setNodes((current) => toReactNodes(updatedNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, selectedNodeId, current));
    setFlowDirty(true);
    if (options?.affectRuntime !== false && options?.invalidateFromNodeId) {
      const nodeId = options.invalidateFromNodeId;
      setTimeout(() => markStaleFromNode(nodeId), 0);
    }
  };

  const onNodesChange = (changes: NodeChange<FlowCanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.some((change) => change.type === 'position' || change.type === 'remove' || change.type === 'replace' || change.type === 'dimensions')) {
      setFlowDraftNodes((current) => {
          const nextNodes = applyNodeChanges(
            changes.map((change) => ({ ...change })) as NodeChange<FlowCanvasNode>[],
            toReactNodes(current, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, selectedNodeId)
          );
        return toPlatformNodes(nextNodes, current);
      });
    }
  };

  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  };

  const selectedNode = draftNodes.find((item) => item.id === selectedNodeId) ?? null;
  const selectedCanvasNode = nodes.find((item) => item.id === selectedNodeId) ?? null;
  const selectedNodeRun = useMemo(() => {
    if (!selectedNodeId) return null;
    return [...currentStageRuns, ...currentSessionRuns, ...runtimeRuns].find((run) => run.checkpoints.some((checkpoint) => checkpoint.nodeId === selectedNodeId)) ?? null;
  }, [currentSessionRuns, currentStageRuns, runtimeRuns, selectedNodeId]);
  const resumableNodeRun = selectedNodeRun?.resumeContext ? selectedNodeRun : latestRun?.resumeContext ? latestRun : null;
  const rerunSourceRunId = selectedNodeRun?.id ?? latestRun?.id;
  const pendingApprovalRun = useMemo(() => {
    return [...currentStageRuns, ...currentSessionRuns, ...runtimeRuns].find((run) =>
      (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending' && (!selectedNodeId || approval.nodeId === selectedNodeId))
    ) ?? null;
  }, [currentSessionRuns, currentStageRuns, runtimeRuns, selectedNodeId]);
  const pendingApprovals = pendingApprovalRun
    ? (pendingApprovalRun.pendingApprovals ?? []).filter((approval) => approval.status === 'pending' && (!selectedNodeId || approval.nodeId === selectedNodeId))
    : [];
  const selectedEdge = edges.find((item) => item.id === selectedEdgeId) ?? null;
  const selectedRole = rolesDraft.find((item) => item.id === selectedRoleId) ?? null;
  const selectedTaskTemplate = taskTemplatesDraft.find((item) => item.id === selectedTaskTemplateId) ?? null;
  const selectedAgentProfile = agentProfilesDraft.find((item) => item.id === selectedAgentProfileId) ?? null;
  const selectedConnector = connectorsDraft.find((item) => item.id === selectedConnectorId) ?? null;
  const selectedTool = toolsDraft.find((item) => item.id === selectedToolId) ?? null;
  const boundRole = selectedNode?.data.roleId ? rolesDraft.find((item) => item.id === selectedNode.data.roleId) ?? null : null;
  const boundTaskTemplate = selectedNode?.data.taskTemplateId ? taskTemplatesDraft.find((item) => item.id === selectedNode.data.taskTemplateId) ?? null : null;
  const boundAgentProfile = selectedNode?.data.agentProfileId ? agentProfilesDraft.find((item) => item.id === selectedNode.data.agentProfileId) ?? null : null;
  const boundConnector = selectedNode?.data.connectorId ? connectorsDraft.find((item) => item.id === selectedNode.data.connectorId) ?? null : null;
  const boundTool = selectedNode?.data.toolId ? toolsDraft.find((item) => item.id === selectedNode.data.toolId) ?? null : null;
  const boundSubflow = selectedNode?.data.subflowId ? platform.subflows.find((item) => item.id === selectedNode.data.subflowId) ?? null : null;
  const currentFlowKey = currentFlow ? `${currentFlow.kind}:${currentFlow.id}` : '';
  const breadcrumbTrail = [...flowBreadcrumbStack, ...(currentFlow ? [{ kind: currentFlow.kind, flowId: currentFlow.id, name: currentFlow.name }] : [])];
  const latestAssistantMessage = [...(activeSession?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant') ?? null;
  const normalizedModuleQuery = flowModuleQuery.trim().toLowerCase();
  const standardModulePalette: Array<{
    id: string;
    type: PlatformFlowNode['type'];
    title: string;
    subtitle: string;
    description: string;
    icon: typeof Bot;
  }> = [
    { id: 'agent', type: 'agent', title: '角色节点', subtitle: 'Role / Task / Agent', description: '绑定角色、任务模板、Skill 与 Agent 执行包。', icon: Bot },
    { id: 'tool', type: 'tool', title: '工具节点', subtitle: 'Tool / Connector', description: '绑定连接器、脚本工具和外部能力调用。', icon: Wrench },
    { id: 'condition', type: 'condition', title: '条件节点', subtitle: 'True / False', description: '显式维护 true / false 分支与条件表达式。', icon: GitBranchPlus },
    { id: 'loop', type: 'loop', title: '循环节点', subtitle: 'Loop / Exit', description: '定义循环条件、退出条件与超时边界。', icon: Repeat },
    { id: 'parallel', type: 'parallel_split', title: '并行分支', subtitle: 'Split / Join', description: '拆分并行分支并定义汇合与失败策略。', icon: SplitSquareHorizontal },
    { id: 'approval', type: 'approval', title: '人工确认', subtitle: 'Approval Gate', description: '把审批、阻断与人工确认显式放进流程。', icon: ScanSearch }
  ];
  const filteredModulePalette = standardModulePalette.filter((item) => {
    if (!normalizedModuleQuery) return true;
    return [item.title, item.subtitle, item.description].join(' ').toLowerCase().includes(normalizedModuleQuery);
  });
  const filteredSubflows = platform.subflows.filter((flow) => {
    if (!normalizedModuleQuery) return true;
    return [flow.name, flow.description].join(' ').toLowerCase().includes(normalizedModuleQuery);
  });
  const selectedNodeBindingLabel = selectedNode
    ? [
        boundRole?.name,
        boundTaskTemplate?.name,
        boundAgentProfile?.name,
        boundTool?.name,
        boundConnector?.name,
        boundSubflow?.name
      ].filter(Boolean).join(' / ') || '未绑定'
    : '';
  const workflowLayerCopy = selectedNode
    ? [
        boundRole ? `角色：${boundRole.name}` : '',
        boundTaskTemplate ? `任务模板：${boundTaskTemplate.name}` : '',
        boundAgentProfile ? `Agent：${boundAgentProfile.name}` : '',
        boundTool ? `工具：${boundTool.name}` : '',
        boundConnector ? `连接器：${boundConnector.name}` : '',
        boundSubflow ? `子流程：${boundSubflow.name}` : '',
        (selectedNode.data.inputArtifactPaths?.length || selectedNode.data.outputArtifactPaths?.length)
          ? `工件输入 ${selectedNode.data.inputArtifactPaths?.length ?? 0} 项，输出 ${selectedNode.data.outputArtifactPaths?.length ?? 0} 项`
          : '',
        (selectedNode.data.inputMessageKeys?.length || selectedNode.data.outputMessageKeys?.length || selectedNode.data.outputSignalKeys?.length)
          ? `消息 / 信号：${[
              selectedNode.data.inputMessageKeys?.length ? `输入消息 ${selectedNode.data.inputMessageKeys.length}` : '',
              selectedNode.data.outputMessageKeys?.length ? `输出消息 ${selectedNode.data.outputMessageKeys.length}` : '',
              selectedNode.data.outputSignalKeys?.length ? `输出信号 ${selectedNode.data.outputSignalKeys.length}` : ''
            ].filter(Boolean).join('，')}`
          : '',
        selectedNode.data.outputFormat ? `输出格式：${selectedNode.data.outputFormat}` : ''
      ].filter(Boolean).join('；')
    : '';
  const runtimeLayerCopy = selectedNode
    ? [
        selectedNode.data.conditionExpression ? `条件表达式：${selectedNode.data.conditionExpression}` : '',
        selectedNode.data.loopExpression ? `循环条件：${selectedNode.data.loopExpression}` : '',
        selectedNode.data.exitExpression ? `退出条件：${selectedNode.data.exitExpression}` : '',
        selectedNode.data.maxIterations ? `最大迭代 ${selectedNode.data.maxIterations} 次` : '',
        selectedNode.data.loopTimeoutMs ? `循环超时 ${selectedNode.data.loopTimeoutMs} ms` : '',
        selectedNode.data.loopFailurePolicy ? `失败策略：${selectedNode.data.loopFailurePolicy}` : '',
        pendingApprovals.length ? `当前有 ${pendingApprovals.length} 个待处理人工确认` : '',
        resumableNodeRun ? '该节点已有可恢复的检查点或恢复上下文。' : '当前尚未挂接恢复上下文，可通过运行后生成检查点。'
      ].filter(Boolean).join('；')
    : '';
  const governanceLayerCopy = selectedNode
    ? [
        selectedNode.data.ruleBindingIds?.length ? `绑定规则 ${selectedNode.data.ruleBindingIds.length} 条` : '未显式绑定规则，使用全局 / 工程默认规则。',
        boundRole ? `权限边界继承自角色 ${boundRole.name}` : '',
        boundConnector ? `连接器健康状态：${boundConnector.health}` : '',
        boundTool?.lastRun ? `工具最近执行：${boundTool.lastRun.ok ? '成功' : '失败'}` : '',
        staleNodeIds.includes(selectedNode.id) ? '该节点被标记为待确认，建议重新运行或复核。' : '当前节点未处于待确认状态。'
      ].filter(Boolean).join('；')
    : '';
  const evolutionLayerCopy = selectedNode
    ? [
        boundRole?.packageVersion ? `角色版本：${boundRole.packageVersion}` : '',
        boundRole?.packageSource ? `角色来源：${boundRole.packageSource}` : '',
        selectedNode.data.skillIds?.length ? `命中 Skill ${selectedNode.data.skillIds.length} 个` : '',
        boundSubflow ? '该节点引用子流程，后续可通过版本替换平滑升级。' : '',
        flowDirty ? '当前 Flow 含未保存调整，保存后会进入版本历史。' : '当前 Flow 已保存，可继续进入版本迁移或导出。'
      ].filter(Boolean).join('；')
    : '';

  useEffect(() => {
    setRerunPreview(null);
  }, [selectedNodeId, currentFlowId]);

  const rememberCurrentViewport = () => {
    if (!reactFlowInstance || !currentFlowKey) return;
    const viewport = reactFlowInstance.getViewport();
    flowViewportRef.current[currentFlowKey] = {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom
    };
  };

  const fitCanvasView = () => {
    if (!reactFlowInstance) return;
    void reactFlowInstance.fitView({
      padding: 0.14,
      minZoom: 0.46,
      maxZoom: 1.06,
      duration: 180
    });
  };

  const openArtifactManager = (tab: AssetTab) => {
    setAssetTab(tab);
    setAssetManagerOpen(true);
    setRightPanelMode('assets');
  };

  const openConversation = () => {
    setRightPanelMode('assistant');
    onOpenConversation?.();
    onConversationTargetChange?.(currentFlowDraft);
  };

  const openPaneContextMenuFromToolbar = () => {
    const shellRect = flowShellRef.current?.getBoundingClientRect();
    if (!shellRect) return;
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setAddCardMenuOpen(false);
    openContextMenu({
      kind: 'pane',
      x: Math.round(shellRect.left + 40),
      y: Math.round(shellRect.top + 84)
    });
  };

  const openSelectedItemMenuFromToolbar = () => {
    const shellRect = flowShellRef.current?.getBoundingClientRect();
    if (!shellRect) return;
    setAddCardMenuOpen(false);
    if (selectedNodeId) {
      openContextMenu({
        kind: 'node',
        x: Math.round(shellRect.right - 300),
        y: Math.round(shellRect.top + 84),
        nodeId: selectedNodeId
      });
      return;
    }
    if (selectedEdgeId) {
      openContextMenu({
        kind: 'edge',
        x: Math.round(shellRect.right - 300),
        y: Math.round(shellRect.top + 84),
        edgeId: selectedEdgeId
      });
      return;
    }
    setAssetStatus('请先选中一个节点或连线');
  };

  const focusSelectionFromToolbar = () => {
    if (selectedNodeId) {
      openSelectionInspectorForNode(selectedNodeId);
      return;
    }
    if (selectedEdgeId) {
      openSelectionInspectorForEdge(selectedEdgeId);
      return;
    }
    if (selectedCanvasNodes[0]) {
      openSelectionInspectorForNode(selectedCanvasNodes[0].id);
      return;
    }
    setAssetStatus('请先选中一个节点或连线');
  };

  const alignSelectedNodesLeft = () => {
    const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id));
    if (selectedIds.size < 2) return;
    const selectedPositions = nodes.filter((node) => selectedIds.has(node.id));
    const minX = Math.min(...selectedPositions.map((node) => node.position.x));
    setNodes((current) => current.map((node) => (
      selectedIds.has(node.id)
        ? { ...node, position: { ...node.position, x: minX } }
        : node
    )));
  };

  const distributeSelectedNodesHorizontally = () => {
    const selectedNodes = nodes.filter((node) => node.selected).sort((left, right) => left.position.x - right.position.x);
    if (selectedNodes.length < 3) return;
    const minX = selectedNodes[0].position.x;
    const maxX = selectedNodes[selectedNodes.length - 1].position.x;
    const gap = (maxX - minX) / (selectedNodes.length - 1);
    const targetX = new Map(selectedNodes.map((node, index) => [node.id, minX + gap * index]));
    setNodes((current) => current.map((node) => (
      targetX.has(node.id)
        ? { ...node, position: { ...node.position, x: targetX.get(node.id)! } }
        : node
    )));
  };

  const relayoutCanvasFromToolbar = () => {
    if (selectedCanvasNodes.length >= 3) {
      distributeSelectedNodesHorizontally();
      setAssetStatus('已重新分布选中节点');
      return;
    }
    if (selectedCanvasNodes.length >= 2) {
      alignSelectedNodesLeft();
      setAssetStatus('已重新对齐选中节点');
      return;
    }
    fitCanvasView();
    setAssetStatus('已重置画布视图');
  };

  const runNodeDebug = async (nodeId: string) => {
    await onDebugNode(flowKind, currentFlowId, nodeId);
    clearStaleNode(nodeId);
    setRerunPreview(null);
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus('已完成节点调试');
  };

  const previewNodeRerun = async (mode: RuntimeRerunPlan['mode']) => {
    if (!selectedNode || !onPreviewRerun) return;
    setRerunBusyMode(mode);
    try {
      const preview = await onPreviewRerun(flowKind, currentFlowId, selectedNode.id, rerunSourceRunId, mode);
      setRerunPreview({
        mode,
        sourceRunId: rerunSourceRunId,
        plan: preview.plan
      });
      setRuntimePanelTab('runtime');
      setWorkspaceMode('runtime');
      setRuntimePanelOpen(true);
      setAssetStatus(`已生成${rerunModeLabel(mode)}计划`);
    } finally {
      setRerunBusyMode(null);
    }
  };

  const applyRerunPreview = async () => {
    if (!selectedNode || !rerunPreview || !onApplyRerun) return;
    const destructive = rerunPreview.plan.invalidatedArtifactPaths.length || rerunPreview.plan.invalidatedNodeIds.length;
    if (
      destructive
      && !window.confirm(`本次${rerunModeLabel(rerunPreview.mode)}将失效 ${rerunPreview.plan.invalidatedArtifactPaths.length} 个工件、重跑 ${rerunPreview.plan.invalidatedNodeIds.length} 个节点。是否继续？`)
    ) {
      return;
    }
    setRerunBusyMode(rerunPreview.mode);
    try {
      await onApplyRerun(flowKind, currentFlowId, selectedNode.id, rerunPreview.sourceRunId, rerunPreview.mode);
      setStaleNodeIds((current) => current.filter((nodeId) => !rerunPreview.plan.invalidatedNodeIds.includes(nodeId)));
      setRerunPreview(null);
      setRuntimePanelTab('runtime');
      setWorkspaceMode('runtime');
      setRuntimePanelOpen(true);
      setAssetStatus(`已应用${rerunModeLabel(rerunPreview.mode)}计划`);
    } finally {
      setRerunBusyMode(null);
    }
  };

  const resumeSelectedRun = async () => {
    if (selectedNode && onPreviewRerun) {
      await previewNodeRerun('continue');
      return;
    }
    if (!resumableNodeRun || !onResumeRun) return;
    await onResumeRun(resumableNodeRun.id);
    setStaleNodeIds([]);
    setRerunPreview(null);
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus(`已继续运行 ${resumableNodeRun.id}`);
  };

  const retrySelectedRun = async () => {
    if (!latestRun || !onRetryRun || !latestRun.resumeContext) return;
    await onRetryRun(latestRun.id);
    setRerunPreview(null);
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus(`已重试运行 ${latestRun.id}`);
  };

  const pauseSelectedRun = async () => {
    if (!latestRun || !onPauseRun || !latestRunActions.has('pause')) return;
    await onPauseRun(latestRun.id);
    setRerunPreview(null);
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus(`已请求暂停运行 ${latestRun.id}`);
  };

  const stopSelectedRun = async () => {
    if (!latestRun || !onStopRun || !latestRunActions.has('stop')) return;
    await onStopRun(latestRun.id);
    setRerunPreview(null);
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus(`已请求停止运行 ${latestRun.id}`);
  };

  const resolveSelectedApproval = async (approved: boolean) => {
    if (!pendingApprovalRun || !pendingApprovals.length || !onResolveApproval) return;
    const currentApproval = pendingApprovals[0]!;
    await onResolveApproval(
      pendingApprovalRun.id,
      currentApproval.id,
      approved,
      approved ? 'approved-from-ui' : 'rejected-from-ui'
    );
    setRuntimePanelTab('runtime');
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAssetStatus(approved ? `已批准审批 ${currentApproval.id}` : `已拒绝审批 ${currentApproval.id}`);
  };

  const openAssetManager = (tab: AssetTab = 'flows') => {
    setAssetTab(tab);
    setAssetManagerOpen(true);
    setSelectionInspectorOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assets');
  };

  const openSelectionInspectorForNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId('');
    setAssetTab('flows');
    setSelectionInspectorOpen(false);
    setAssetManagerOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
  };

  const openSelectionInspectorForEdge = (edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId('');
    setAssetTab('flows');
    setSelectionInspectorOpen(false);
    setAssetManagerOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
  };

  const openRuntimePanel = (tab: RuntimePanelTab) => {
    setRuntimePanelTab(tab);
    setWorkspaceMode('runtime');
    setRuntimePanelOpen(true);
    setAddCardMenuOpen(false);
    setRightPanelMode('governance');
  };

  const selectFlowFromManager = (flowId: string) => {
    rememberCurrentViewport();
    setCurrentFlowId(flowId);
    setFlowBreadcrumbStack([]);
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectionInspectorOpen(false);
  };

  const startRoleCreator = (nodeId?: string) => {
    setRoleCreatorDraft(createRoleCreatorDraft(rolesDraft.length + 1));
    setRoleCreatorNodeId(nodeId ?? '');
    setSelectionInspectorOpen(false);
    setAssetManagerOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
  };

  const saveCreatedRole = async () => {
    const nextRole = roleFromCreatorDraft(crypto.randomUUID(), roleCreatorDraft);
    const nextRoles = [...rolesDraft, nextRole];
    await saveRoleDrafts(nextRoles);
    setSelectedRoleId(nextRole.id);
    if (roleCreatorNodeId) {
      mutateNodeById(roleCreatorNodeId, (node) => ({ ...node, data: { ...node.data, roleId: nextRole.id } }));
      setSelectedNodeId(roleCreatorNodeId);
      setSelectionInspectorOpen(false);
      setRightPanelMode('assistant');
    }
    setRoleCreatorNodeId(null);
    setAssetStatus(`已创建角色 ${nextRole.name}`);
  };

  const openContextMenu = (nextMenu: Exclude<CanvasContextMenuState, null>) => {
    window.requestAnimationFrame(() => {
      setContextMenu(nextMenu);
    });
  };

  useEffect(() => {
    const flowShell = flowShellRef.current;
    if (!flowShell) return;

    const resolveContextTarget = (target: EventTarget | null, clientX: number, clientY: number) => {
      const element = target as HTMLElement | SVGElement | null;
      if (!element || !flowShell.contains(element)) return false;

      const nodeElement = element.closest('.react-flow__node[data-id]') as HTMLElement | null;
      if (nodeElement?.dataset.id) {
        setSelectedNodeId(nodeElement.dataset.id);
        setSelectedEdgeId('');
        openContextMenu({ kind: 'node', x: clientX, y: clientY, nodeId: nodeElement.dataset.id });
        return true;
      }

      const edgeElement = element.closest('.react-flow__edge') as HTMLElement | null;
      const edgeId = edgeElement?.dataset.id || edgeElement?.id;
      if (edgeId) {
        setSelectedEdgeId(edgeId);
        setSelectedNodeId('');
        openContextMenu({ kind: 'edge', x: clientX, y: clientY, edgeId });
        return true;
      }

      setSelectedNodeId('');
      setSelectedEdgeId('');
      openContextMenu({ kind: 'pane', x: clientX, y: clientY });
      return true;
    };

    const onNativeMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (!resolveContextTarget(event.target, event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onNativeContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | SVGElement | null;
      if (!target || !flowShell.contains(target)) return;
      if (!resolveContextTarget(target, event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    flowShell.addEventListener('mousedown', onNativeMouseDown, true);
    flowShell.addEventListener('contextmenu', onNativeContextMenu);
    return () => {
      flowShell.removeEventListener('mousedown', onNativeMouseDown, true);
      flowShell.removeEventListener('contextmenu', onNativeContextMenu);
    };
  }, []);

  const duplicateNode = (nodeId: string) => {
    if (!currentFlowDraft) return;
    const sourceNode = draftNodes.find((item) => item.id === nodeId);
    if (!sourceNode) return;
    const clone: PlatformFlowNode = {
      ...sourceNode,
      id: crypto.randomUUID(),
      position: { x: sourceNode.position.x + 48, y: sourceNode.position.y + 48 },
      data: {
        ...sourceNode.data,
        label: `${sourceNode.data.label} 副本`
      }
    };
    const updatedNodes = [...draftNodes, clone];
    setFlowDraftNodes(updatedNodes);
    setNodes((current) => toReactNodes(updatedNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, clone.id, current));
    setSelectedNodeId(clone.id);
    setContextMenu(null);
  };

  const deleteNode = (nodeId: string) => {
    if (!currentFlowDraft) return;
    const remainingNodes = draftNodes.filter((item) => item.id !== nodeId);
    const remainingEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    setFlowDraftNodes(remainingNodes);
    setNodes((current) => toReactNodes(remainingNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds.filter((item) => item !== nodeId), selectedNodeId === nodeId ? '' : selectedNodeId, current));
    setStaleNodeIds((current) => current.filter((item) => item !== nodeId));
    setEdges(remainingEdges);
    setSelectedNodeId((current) => current === nodeId ? '' : current);
    setSelectedEdgeId('');
    setContextMenu(null);
  };

  const deleteEdge = (edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId((current) => current === edgeId ? '' : current);
    setContextMenu(null);
  };

  const openSubflowEditor = (subflowId?: string) => {
    if (!subflowId) return;
    const targetFlow = platform.subflows.find((item) => item.id === subflowId) ?? null;
    if (!targetFlow || !currentFlow) return;
    rememberCurrentViewport();
    setFlowBreadcrumbStack((current) => [...current, { kind: currentFlow.kind, flowId: currentFlow.id, name: currentFlow.name }]);
    setFlowKind('subflow');
    setCurrentFlowId(subflowId);
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectionInspectorOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
    setAssetStatus('已进入子流程编辑');
  };

  const returnToParentFlow = () => {
    const previous = flowBreadcrumbStack[flowBreadcrumbStack.length - 1];
    if (!previous) return;
    rememberCurrentViewport();
    setFlowBreadcrumbStack((current) => current.slice(0, -1));
    setFlowKind(previous.kind);
    setCurrentFlowId(previous.flowId);
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectionInspectorOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
    setAssetStatus(`已返回 ${previous.name}`);
  };

  const jumpToBreadcrumb = (index: number) => {
    const target = breadcrumbTrail[index];
    if (!target) return;
    rememberCurrentViewport();
    setFlowBreadcrumbStack(breadcrumbTrail.slice(0, index));
    setFlowKind(target.kind);
    setCurrentFlowId(target.flowId);
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectionInspectorOpen(false);
    setAddCardMenuOpen(false);
    setRightPanelMode('assistant');
  };

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onSelect: () => {
          setSelectedNodeId(node.id);
          setSelectedEdgeId('');
        },
        onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => {
          setSelectedNodeId(node.id);
          setSelectedEdgeId('');
          openContextMenu({ kind: 'node', x: event.clientX, y: event.clientY, nodeId: node.id });
        },
        onDelete: () => deleteNode(node.id),
        onDuplicate: () => duplicateNode(node.id),
        onOpenSubflow: () => openSubflowEditor(draftNodes.find((item) => item.id === node.id)?.data.subflowId),
        onConfigure: () => openSelectionInspectorForNode(node.id),
        onDebug: () => void runNodeDebug(node.id),
        stale: staleNodeIds.includes(node.id),
        hasNotes: Boolean(draftNodes.find((item) => item.id === node.id)?.data.notes?.trim())
      }
    })),
    [draftNodes, nodes, staleNodeIds]
  );

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const branch = branchFromHandle(connection.sourceHandle ?? undefined);
    if (branch !== 'default') {
      upsertBranchEdge(connection.source, connection.target, branch, edgeLabelForBranch(branch) ?? '下一步');
      const sourceNode = draftNodes.find((node) => node.id === connection.source);
      if (sourceNode) {
        if (branch === 'true') {
          mutateNodeById(connection.source, (node) => ({ ...node, data: { ...node.data, trueTargetId: connection.target } }));
        } else if (branch === 'false') {
          mutateNodeById(connection.source, (node) => ({ ...node, data: { ...node.data, falseTargetId: connection.target } }));
        } else if (branch === 'loop') {
          mutateNodeById(connection.source, (node) => ({ ...node, data: { ...node.data, loopBackTargetId: connection.target } }));
        } else if (branch === 'exit') {
          mutateNodeById(connection.source, (node) => ({ ...node, data: { ...node.data, exitTargetId: connection.target } }));
        }
      }
      return;
    }
    setEdges((current) => addEdge({
      ...connection,
      id: crypto.randomUUID(),
      label: '下一步',
      data: { branch: 'default' } satisfies FlowEdgeData,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: edgeStyleForBranch('default')
    }, current));
  };

  const saveCurrentFlow = async () => {
    if (!currentFlowDraft) return;
    await onSaveFlow(currentFlowDraft);
    setFlowDirty(false);
    setAssetStatus(`已保存 ${currentFlowDraft.name}`);
  };

  const saveTemplateDraft = async () => {
    if (!templateDraft) return;
    const normalized = normalizeRuntimeTemplate(templateDraft);
    const result = await onSaveRuntimeTemplate(normalized);
    setTemplateDraft(result.template);
    setAssetStatus(
      result.issues.length
        ? result.issues.map((item) => item.message).join(' 路 ')
        : '宸蹭繚瀛樺伐浠跺绾︿笌瀵煎嚭鏄犲皠'
    );
  };

  const updateTemplateDraft = (updater: (template: RuntimeTemplateAsset) => RuntimeTemplateAsset) => {
    setTemplateDraft((current) => (current ? updater(current) : current));
  };

  const mutateNodeById = (
    nodeId: string,
    updater: (node: PlatformFlowNode) => PlatformFlowNode,
    options?: { invalidateRuntime?: boolean }
  ) => {
    if (!currentFlowDraft) return;
    const updatedNodes = draftNodes.map((node) => (node.id === nodeId ? updater(node) : node));
    setFlowDraftNodes(updatedNodes);
    setNodes((current) => toReactNodes(updatedNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, nodeId, current));
    setFlowDirty(true);
    if (options?.invalidateRuntime) {
      setTimeout(() => markStaleFromNode(nodeId), 0);
    }
  };

  const mutateCurrentFlowNode = (updater: (node: PlatformFlowNode) => PlatformFlowNode) => {
    if (!selectedNode) return;
    mutateNodeById(selectedNode.id, updater, { invalidateRuntime: true });
  };

  const updateEdgeBranch = (edgeId: string, branch: PlatformFlowAsset['edges'][number]['branch']) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          label: edgeLabelForBranch(branch, typeof edge.label === 'string' ? edge.label : undefined),
          data: { ...(edge.data as FlowEdgeData | undefined), branch },
          animated: branch === 'loop',
          style: edgeStyleForBranch(branch)
        }
      : edge));
  };

  const updateEdgeLabel = (edgeId: string, label: string) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          label,
          data: { ...(edge.data as FlowEdgeData | undefined) }
        }
      : edge));
  };

  const updateEdgeDescription = (edgeId: string, description: string) => {
    setEdges((current) => current.map((edge) => edge.id === edgeId
      ? {
          ...edge,
          data: { ...(edge.data as FlowEdgeData | undefined), description }
        }
      : edge));
  };

  const upsertBranchEdge = (
    sourceId: string,
    targetId: string | undefined,
    branch: PlatformFlowAsset['edges'][number]['branch'],
    fallbackLabel: string
  ) => {
    setEdges((current) => {
      const branchLabel = edgeLabelForBranch(branch, fallbackLabel);
      const filtered = current.filter((edge) => !(edge.source === sourceId && ((edge.data as FlowEdgeData | undefined)?.branch === branch)));
      if (!targetId) return filtered;
      const existing = current.find((edge) => edge.source === sourceId && edge.target === targetId && (edge.data as FlowEdgeData | undefined)?.branch === branch);
      return [
        ...filtered,
        {
          id: existing?.id ?? crypto.randomUUID(),
          source: sourceId,
          target: targetId,
          sourceHandle: branch !== 'default' ? branch : undefined,
          label: branchLabel,
          data: { branch } satisfies FlowEdgeData,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: branch === 'loop',
          style: edgeStyleForBranch(branch)
        }
      ];
    });
  };

  const addNode = (type: PlatformFlowNode['type'], dataOverrides?: Partial<PlatformFlowNode['data']>) => {
    addNodeAt(type, undefined, dataOverrides);
  };

  const addNodeAt = (
    type: PlatformFlowNode['type'],
    position?: { x: number; y: number },
    dataOverrides?: Partial<PlatformFlowNode['data']>
  ) => {
    if (!currentFlowDraft) return;
    const node: PlatformFlowNode = {
      id: crypto.randomUUID(),
      type,
      position: position ?? { x: 180 + nodes.length * 24, y: 180 + nodes.length * 24 },
      data: {
        ...(type === 'loop'
        ? { label: defaultNodeLabel(type), loopExpression: '继续处理直到满足退出条件', exitExpression: '满足退出条件', maxIterations: 3 }
        : type === 'condition'
          ? { label: defaultNodeLabel(type), conditionExpression: '满足条件时走“是”，否则走“否”' }
          : type === 'parallel_split'
            ? { label: defaultNodeLabel(type), description: '从这里发散为多个并行分支。' }
            : type === 'parallel_join'
              ? { label: defaultNodeLabel(type), description: '在这里汇合多个并行分支。' }
          : { label: defaultNodeLabel(type) }),
        ...(dataOverrides ?? {})
      }
    };
    const updatedNodes = [...draftNodes, node];
    setFlowDraftNodes(updatedNodes);
    setNodes((current) => toReactNodes(updatedNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, staleNodeIds, node.id, current));
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setSelectionInspectorOpen(false);
    setAssetManagerOpen(false);
    setAddCardMenuOpen(false);
    setContextMenu(null);
    setRightPanelMode('assistant');
  };

  const handlePaletteDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    type: PlatformFlowNode['type'],
    dataOverrides?: Partial<PlatformFlowNode['data']>
  ) => {
    event.dataTransfer.setData('application/cyber-editor-node', JSON.stringify({
      type,
      data: dataOverrides ?? null
    }));
    event.dataTransfer.effectAllowed = 'copyMove';
  };

  const createFlow = async (kind: PlatformFlowAsset['kind'] = flowKind) => {
    const next = createEmptyFlow(kind, kind === 'subflow' ? `子流程 ${platform.subflows.length + 1}` : `流程 ${platform.flows.length + 1}`);
    await onSaveFlow(next);
    rememberCurrentViewport();
    setFlowBreadcrumbStack([]);
    setFlowKind(kind);
    setCurrentFlowId(next.id);
    setRightPanelMode('assistant');
    setAssetStatus(`已创建 ${next.name}`);
  };

  const duplicateFlowById = async (kind: PlatformFlowAsset['kind'], flowId: string) => {
    await onDuplicateFlow(kind, flowId);
    setAssetStatus('已复制流程');
  };

  const exportFlowById = async (kind: PlatformFlowAsset['kind'], flowId: string) => {
    await onExportFlow(kind, flowId);
    setAssetStatus('已导出流程');
  };

  const deleteFlowById = async (kind: PlatformFlowAsset['kind'], flowId: string) => {
    await onDeleteFlow(kind, flowId);
    setAssetStatus('已删除流程');
  };

  const saveRoleDrafts = async (nextRoles: PlatformRole[]) => {
    setRolesDraft(nextRoles);
    await onSaveRoles(nextRoles);
    setAssetStatus('角色资产已保存');
  };

  const saveTaskTemplateDrafts = async (nextTaskTemplates: TaskTemplate[]) => {
    setTaskTemplatesDraft(nextTaskTemplates);
    await onSaveTaskTemplates(nextTaskTemplates);
    setAssetStatus('任务模板已保存');
  };

  const saveAgentProfileDrafts = async (nextAgentProfiles: AgentProfile[]) => {
    setAgentProfilesDraft(nextAgentProfiles);
    await onSaveAgentProfiles(nextAgentProfiles);
    setAssetStatus('执行配置已保存');
  };

  const saveConnectorDrafts = async (nextConnectors: PlatformConnector[]) => {
    setConnectorsDraft(nextConnectors);
    await onSaveConnectors(nextConnectors);
    setAssetStatus('连接资产已保存');
  };

  const saveToolDrafts = async (nextTools: ControlledScriptTool[]) => {
    setToolsDraft(nextTools);
    await onSaveTools(nextTools);
    setAssetStatus('工具资产已保存');
  };

  const assetPane = (
    <aside
      className="orchestration-assets modal-surface"
      data-testid="orchestration-assets"
    >
      <SidebarHeader
        title="资产"
        description="流程、工件、角色、连接与工具"
        actions={
          <div className="segmented compact icon-only" role="tablist" aria-label="编排资产类型">
            {assetTabMeta.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={assetTab === id ? 'active' : ''}
                title={label}
                aria-label={label}
                aria-pressed={assetTab === id}
                onClick={() => setAssetTab(id)}
              >
                <Icon size={16} strokeWidth={1.8} />
              </button>
            ))}
          </div>
        }
      />
      <div className="orchestration-assets-body">
        {assetTab === 'flows' ? renderFlowAssets({
          flowKind,
          setFlowKind,
          flowOptions,
          currentFlowId,
          setCurrentFlowId: selectFlowFromManager,
          createFlow,
          onDuplicate: () => currentFlow && onDuplicateFlow(flowKind, currentFlow.id),
          onImport: () => onImportFlow(flowKind),
          onExport: () => currentFlow && exportFlowById(flowKind, currentFlow.id),
          onDelete: () => currentFlow && deleteFlowById(flowKind, currentFlow.id),
          onDuplicateById: (kind, flowId) => duplicateFlowById(kind, flowId),
          onExportById: (kind, flowId) => exportFlowById(kind, flowId),
          onDeleteById: (kind, flowId) => deleteFlowById(kind, flowId),
          currentFlow: currentFlowDraft,
          addNode,
          onPaletteDragStart: handlePaletteDragStart
        }) : null}
        {assetTab === 'artifacts' ? renderArtifactAssetsV2({
          runtimeTemplate: templateDraft,
          templateArtifacts,
          setTemplateDraft: updateTemplateDraft,
          onSaveTemplateDraft: saveTemplateDraft
        }) : null}
        {assetTab === 'roles' ? renderRoleAssets({ rolesDraft, selectedRoleId, setSelectedRoleId, onCreateRole: () => startRoleCreator() }) : null}
        {assetTab === 'task-templates' ? renderTaskTemplateAssets({ taskTemplatesDraft, selectedTaskTemplateId, setSelectedTaskTemplateId, saveTaskTemplateDrafts }) : null}
        {assetTab === 'agent-profiles' ? renderAgentProfileAssets({ agentProfilesDraft, selectedAgentProfileId, setSelectedAgentProfileId, saveAgentProfileDrafts, rolesDraft }) : null}
        {assetTab === 'connectors' ? renderConnectorAssets({ connectorsDraft, selectedConnectorId, setSelectedConnectorId, saveConnectorDrafts }) : null}
        {assetTab === 'tools' ? renderToolAssets({ toolsDraft, selectedToolId, setSelectedToolId, saveToolDrafts }) : null}
        {assetStatus ? <div className="inline-note">{assetStatus}</div> : null}
      </div>
    </aside>
  );

  const inspectorPane = (
    <aside
      className="orchestration-inspector modal-surface"
      data-testid="orchestration-inspector"
    >
      {renderInspector({
        assetTab,
        selectedNode,
        selectedCanvasNode,
        selectedEdge,
        selectedRole,
        selectedTaskTemplate,
        selectedAgentProfile,
        selectedConnector,
        selectedTool,
        rolesDraft,
        taskTemplatesDraft,
        agentProfilesDraft,
        connectorsDraft,
        toolsDraft,
        platform,
        setNodes,
        mutateCurrentFlowNode,
        setEdges,
        saveRoleDrafts,
        saveTaskTemplateDrafts,
        saveAgentProfileDrafts,
        saveConnectorDrafts,
        saveToolDrafts,
        onTestConnector,
        onRunTool,
        setAssetStatus,
        currentFlow: currentFlowDraft,
        currentFlowNodes: draftNodes,
        selectedNodeId,
        setSelectedNodeId,
        selectedEdgeId,
        setSelectedEdgeId,
        edges,
        updateEdgeBranch,
        updateEdgeLabel,
        updateEdgeDescription,
        upsertBranchEdge,
        settings,
        runtimeRuns,
        runtimeEvents,
        runtimeCapabilities,
        rulesDistillation,
        installedSkills,
        templateArtifacts,
        openSubflowEditor,
        startRoleCreator,
        saveCurrentFlow,
        currentFlowName,
        currentFlowDescription,
        currentFlowRoleIds,
        currentFlowPathConfig,
        setCurrentFlowName,
        setCurrentFlowDescription,
        setCurrentFlowRoleIds,
        setCurrentFlowPathConfig,
        setFlowDraftNodes
      })}
    </aside>
  );

  const designCanvas = (
    <div className="orchestration-flow" ref={flowShellRef}>
      <div className="canvas-top-tools flow-canvas-top-tools">
        <div className="flow-canvas-toolbar-copy">
          <h3>{'\u6d41\u7f16\u6392'}</h3>
        </div>
        <div className="flow-canvas-toolbar-actions">
          <div className="tool-group">
            <button type="button" className="canvas-rack-button" onClick={focusSelectionFromToolbar} title="定位当前选择" aria-label="定位当前选择">
              <PencilLine size={15} strokeWidth={1.8} />
            </button>
          <button type="button" className="canvas-rack-button" onClick={() => openAssetManager('flows')} title="资源管理" aria-label="资源管理">
            <Layers3 size={15} strokeWidth={1.8} />
          </button>
          <div className="toolbar-menu-anchor">
            <button
              type="button"
              className="canvas-rack-button canvas-rack-button-primary"
              onClick={() => setAddCardMenuOpen((current) => !current)}
              title="添加卡片"
              aria-label="添加卡片"
            >
              <FilePlus2 size={15} strokeWidth={1.8} />
            </button>
            {addCardMenuOpen ? (
              <div className="canvas-add-card-menu">
                {([
                  ['agent', '智能角色'],
                  ['tool', '工具'],
                  ['condition', '条件'],
                  ['loop', '循环'],
                  ['parallel_split', '并行分叉'],
                  ['parallel_join', '并行汇合'],
                  ['subflow', '子流程'],
                  ['artifact', '工件']
                ] as Array<[PlatformFlowNode['type'], string]>).map(([type, label]) => (
                  <button key={type} type="button" onClick={() => addNode(type)}>{label}</button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="canvas-rack-button" onClick={fitCanvasView} title="适配画布" aria-label="适配画布">
            <Workflow size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="canvas-rack-button" onClick={() => openRuntimePanel('runtime')} title="运行与历史" aria-label="运行与历史">
            <ScanSearch size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="canvas-rack-button" onClick={openPaneContextMenuFromToolbar} title="连接与插入菜单" aria-label="连接与插入菜单">
            <GitBranchPlus size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="canvas-rack-button" onClick={openSelectedItemMenuFromToolbar} title="当前选择菜单" aria-label="当前选择菜单">
            <MoreHorizontal size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="canvas-rack-button" onClick={openConversation} title="打开流程对话" aria-label="打开流程对话">
            <Bot size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="canvas-rack-button" onClick={() => void saveCurrentFlow()} title="保存当前流程" aria-label="保存当前流程">
            <Save size={15} strokeWidth={1.8} />
          </button>
        </div>
        <div className="canvas-chip-rack">
          <span className="canvas-chip active">{draftMode ? '草稿流程' : '当前流程'}</span>
          <span className="canvas-chip">{stageLabel}</span>
          <span className={`canvas-chip ${validationErrorCount ? 'alert' : validationWarningCount ? 'warn' : ''}`}>
            {validationErrorCount ? `校验错误 ${validationErrorCount}` : validationWarningCount ? `校验提醒 ${validationWarningCount}` : '结构校验通过'}
          </span>
        </div>
      </div>
      </div>
      <div className="canvas-side-tool-rail" aria-label="画布内嵌工具列">
        <button type="button" title="添加智能角色" aria-label="添加智能角色" onClick={() => addNode('agent')}><Bot size={15} strokeWidth={1.8} /></button>
        <button type="button" title="添加工具" aria-label="添加工具" onClick={() => addNode('tool')}><Wrench size={15} strokeWidth={1.8} /></button>
        <button type="button" title="添加条件" aria-label="添加条件" onClick={() => addNode('condition')}><GitBranchPlus size={15} strokeWidth={1.8} /></button>
        <button type="button" title="添加循环" aria-label="添加循环" onClick={() => addNode('loop')}><Repeat size={15} strokeWidth={1.8} /></button>
        <button type="button" title="添加子流程" aria-label="添加子流程" onClick={() => addNode('subflow')}><Component size={15} strokeWidth={1.8} /></button>
        <button type="button" title="添加工件" aria-label="添加工件" onClick={() => addNode('artifact')}><PencilLine size={15} strokeWidth={1.8} /></button>
        <button type="button" title="左对齐已选节点" aria-label="左对齐已选节点" onClick={alignSelectedNodesLeft} disabled={selectedCanvasNodes.length < 2}><GripVertical size={15} strokeWidth={1.8} /></button>
        <button type="button" title="水平分布已选节点" aria-label="水平分布已选节点" onClick={distributeSelectedNodesHorizontally} disabled={selectedCanvasNodes.length < 3}><Workflow size={15} strokeWidth={1.8} /></button>
      </div>
      <div className="canvas-lane-grid" aria-hidden="true">
        {['输入', '分析', '审查', '导出'].map((label) => <span key={label}>{label}</span>)}
      </div>
      {currentFlow ? (
        <ReactFlow
          nodes={nodesWithActions}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={setReactFlowInstance}
          onConnect={onConnect}
            onMoveEnd={rememberCurrentViewport}
            onNodeClick={(_event, node) => {
              openSelectionInspectorForNode(node.id);
            }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedNodeId(node.id);
            setSelectedEdgeId('');
            openContextMenu({ kind: 'node', x: event.clientX, y: event.clientY, nodeId: node.id });
          }}
            onEdgeClick={(_event, edge) => {
              openSelectionInspectorForEdge(edge.id);
            }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedEdgeId(edge.id);
            setSelectedNodeId('');
            openContextMenu({ kind: 'edge', x: event.clientX, y: event.clientY, edgeId: edge.id });
          }}
          onPaneClick={() => {
            setSelectedNodeId('');
            setSelectedEdgeId('');
            setAddCardMenuOpen(false);
            setContextMenu(null);
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setSelectedNodeId('');
            setSelectedEdgeId('');
            setAddCardMenuOpen(false);
            openContextMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            const rawNodePayload = event.dataTransfer.getData('application/cyber-editor-node');
            if (!rawNodePayload || !reactFlowInstance) return;
            let nodePayload: { type: PlatformFlowNode['type']; data?: Partial<PlatformFlowNode['data']> | null };
            try {
              nodePayload = JSON.parse(rawNodePayload) as { type: PlatformFlowNode['type']; data?: Partial<PlatformFlowNode['data']> | null };
            } catch {
              nodePayload = { type: rawNodePayload as PlatformFlowNode['type'] };
            }
            if (!nodePayload.type) return;
            const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            addNodeAt(nodePayload.type, position, nodePayload.data ?? undefined);
          }}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          minZoom={0.38}
          maxZoom={1.8}
        >
          <Background gap={20} />
        </ReactFlow>
      ) : (
        <EmptyBlock title="还没有可编辑流程" description="先创建一个主流程或子流程，再开始编排。" />
      )}
      <div className="canvas-status-bar">
        <span className={`canvas-status-chip ${stageGuard?.ok ? 'good' : 'warn'}`}>
          {stageGuard?.ok ? '阶段约束已通过' : `Guard 缺 ${stageGuard?.blockers.length ?? 0} 项`}
        </span>
        <span className="canvas-status-chip">{currentFlowDraft ? `${currentFlowDraft.nodes.length} 节点 · ${currentFlowDraft.edges.length} 连线` : '未选择流程'}</span>
        <span data-testid="orchestration-stale-chip" className={`canvas-status-chip ${staleNodeIds.length ? 'warn' : ''}`}>{staleNodeIds.length ? `${staleNodeIds.length} 个节点待确认` : '节点状态已同步'}</span>
      </div>
      {contextMenu ? (
        <div className="canvas-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.kind === 'pane' ? (
            <>
              <button type="button" onClick={() => addNode('agent')}><Bot size={14} strokeWidth={1.8} />添加智能角色</button>
              <button type="button" onClick={() => addNode('tool')}><Wrench size={14} strokeWidth={1.8} />添加工具</button>
              <button type="button" onClick={() => addNode('condition')}><GitBranchPlus size={14} strokeWidth={1.8} />添加条件</button>
              <button type="button" onClick={() => addNode('loop')}><Repeat size={14} strokeWidth={1.8} />添加循环</button>
              <button type="button" onClick={() => addNode('parallel_split')}><SplitSquareHorizontal size={14} strokeWidth={1.8} />添加并行分叉</button>
              <button type="button" onClick={() => addNode('parallel_join')}><Layers3 size={14} strokeWidth={1.8} />添加并行汇合</button>
              <button type="button" onClick={() => addNode('subflow')}><Component size={14} strokeWidth={1.8} />添加子流程</button>
              <button type="button" onClick={() => addNode('artifact')}><PencilLine size={14} strokeWidth={1.8} />添加工件</button>
            </>
          ) : contextMenu.kind === 'node' ? (
            <>
              <button type="button" onClick={() => openSubflowEditor(draftNodes.find((item) => item.id === contextMenu.nodeId)?.data.subflowId)} disabled={draftNodes.find((item) => item.id === contextMenu.nodeId)?.type !== 'subflow'}><Component size={14} strokeWidth={1.8} />进入子流程</button>
              <button type="button" onClick={() => void runNodeDebug(contextMenu.nodeId)}><Play size={14} strokeWidth={1.8} />调试节点</button>
              <button type="button" onClick={() => { openSelectionInspectorForNode(contextMenu.nodeId); setContextMenu(null); }}><PencilLine size={14} strokeWidth={1.8} />配置节点</button>
              <button type="button" onClick={() => duplicateNode(contextMenu.nodeId)}><Copy size={14} strokeWidth={1.8} />复制节点</button>
              <button type="button" onClick={() => deleteNode(contextMenu.nodeId)}><Trash2 size={14} strokeWidth={1.8} />删除节点</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { openSelectionInspectorForEdge(contextMenu.edgeId); setContextMenu(null); }}><MoreHorizontal size={14} strokeWidth={1.8} />编辑连线</button>
              <button type="button" onClick={() => deleteEdge(contextMenu.edgeId)}><Trash2 size={14} strokeWidth={1.8} />删除连线</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );

  const debugCanvas = (
    <div className="canvas-runtime-view">
      <section className="canvas-runtime-column">
        <div className="stage-guard-card">
          <div className="section-kicker">阶段守卫</div>
          <strong>{activeSession ? `${stageLabels[activeSession.stage]}阶段` : '尚未选中会话'}</strong>
          <div className="muted-line">{stageGuard?.ok ? '当前阶段满足确认条件。' : '当前阶段仍有阻塞项，需要继续运行或补齐工件。'}</div>
          {stageGuard?.blockers.length ? (
            <div className="finding-stack">
              {stageGuard.blockers.map((item) => <div key={item} className="finding-card error">{item}</div>)}
            </div>
          ) : <div className="muted-inline">当前没有阻塞项。</div>}
          {stageGuard?.warnings.length ? (
            <div className="finding-stack">
              {stageGuard.warnings.map((item) => <div key={item} className="finding-card warning">{item}</div>)}
            </div>
          ) : null}
        </div>
        <div className="inspector-card">
          <div className="section-kicker">最近运行</div>
          {latestRun ? (
            <>
                <div className="meta-list">
                  <div><span>状态</span><strong>{latestRunStatus === 'waiting-approval' ? 'Waiting Approval' : runtimeStatusLabel(latestRunStatus ?? latestRun.status)}</strong></div>
                  <div><span>类型</span><strong>{latestRun.kind}</strong></div>
                  <div><span>使用模型</span><strong>{latestRun.selectedProfileId ?? '未记录'}</strong></div>
                  <div><span>Token</span><strong>{latestRun.usage.totalTokens}</strong></div>
                </div>
                {latestRunStatus === 'waiting-approval' ? (
                  <div className="muted-line" data-testid="runtime-approval-waiting">
                    Waiting approval · {(latestRun.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').length} items
                  </div>
                ) : null}
                {latestRunStatus === 'merge-required' ? (
                  <div className="muted-line" data-testid="runtime-merge-required">
                    {latestRun.controlState?.summary ?? 'Merge confirmation is required before the write can continue.'}
                  </div>
                ) : null}
                {latestRunStatus === 'pause-requested' || latestRunStatus === 'paused' ? (
                  <div className="muted-line" data-testid="runtime-pause-summary">
                    {latestRun.controlState?.summary ?? latestRun.latestCheckpointSummary ?? 'The run is waiting at or holding on the latest safe checkpoint.'}
                  </div>
                ) : null}
                {latestRun.latestCheckpointSummary ? (
                  <div className="muted-line">Latest checkpoint: {latestRun.latestCheckpointSummary}</div>
                ) : null}
                <div className="button-row compact">
                  {selectedNode ? <button type="button" className="button-secondary" onClick={() => void runNodeDebug(selectedNode.id)}>调试当前节点</button> : null}
                  {(selectedNode && onPreviewRerun) || (latestRunActions.has('resume') && resumableNodeRun && onResumeRun) ? (
                    <button type="button" className="button-secondary" onClick={() => void resumeSelectedRun()} disabled={rerunBusyMode === 'continue'}>
                      {rerunBusyMode === 'continue' ? '正在生成计划…' : '从此继续'}
                    </button>
                  ) : null}
                  {selectedNode && onPreviewRerun ? (
                    <button type="button" className="button-secondary" onClick={() => void previewNodeRerun('partial-rerun')} disabled={rerunBusyMode === 'partial-rerun'}>
                      {rerunBusyMode === 'partial-rerun' ? '正在生成计划…' : '局部重跑'}
                    </button>
                  ) : null}
                  {latestRunActions.has('pause') && onPauseRun ? <button type="button" className="button-secondary" onClick={() => void pauseSelectedRun()}>暂停</button> : null}
                  {latestRunActions.has('retry') && onRetryRun ? <button type="button" className="button-secondary" onClick={() => void retrySelectedRun()}>重试</button> : null}
                  {latestRunActions.has('stop') && onStopRun ? <button type="button" className="button-secondary" onClick={() => void stopSelectedRun()}>停止</button> : null}
                  {latestRunActions.has('approve') && pendingApprovals.length && onResolveApproval ? <button type="button" className="button-secondary" data-testid="runtime-approval-approve" onClick={() => void resolveSelectedApproval(true)}>Approve</button> : null}
                  {latestRunActions.has('reject') && pendingApprovals.length && onResolveApproval ? <button type="button" className="button-secondary" data-testid="runtime-approval-reject" onClick={() => void resolveSelectedApproval(false)}>Reject</button> : null}
                  {latestRunActions.has('resolve-merge') && latestRun && onOpenRunMerge ? <button type="button" className="button-secondary" onClick={() => void onOpenRunMerge(latestRun.id)}>处理合并</button> : null}
                  <button type="button" className="button-secondary" onClick={openConversation}>打开流程对话</button>
                </div>
                {rerunPreview ? (
                  <div className="runtime-output-card" data-testid="runtime-rerun-preview">
                    <strong>{rerunModeLabel(rerunPreview.mode)}</strong>
                    <div className="muted-line">{rerunPreview.plan.summary}</div>
                    <div className="tag-cloud compact">
                      <span className="small-tag">复用节点 {rerunPreview.plan.reusableNodeIds.length}</span>
                      <span className="small-tag warn">重跑节点 {rerunPreview.plan.invalidatedNodeIds.length}</span>
                      <span className="small-tag warn">失效工件 {rerunPreview.plan.invalidatedArtifactPaths.length}</span>
                    </div>
                    {rerunPreview.plan.invalidatedArtifactPaths.length ? (
                      <div className="tag-cloud compact">
                        {rerunPreview.plan.invalidatedArtifactPaths.slice(0, 6).map((artifactPath) => (
                          <span key={`rerun-artifact-${artifactPath}`} className="small-tag warn">{artifactPath}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="button-row compact">
                      <button type="button" className="button-secondary" onClick={() => void applyRerunPreview()} disabled={rerunBusyMode === rerunPreview.mode}>
                        {rerunBusyMode === rerunPreview.mode ? '应用中…' : '应用重跑计划'}
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setRerunPreview(null)}>取消</button>
                    </div>
                  </div>
                ) : null}
            </>
          ) : <div className="muted-inline">当前阶段还没有运行记录。</div>}
        </div>
        {runtimeViewMode === 'novice' ? (
          <div className="inspector-card">
            <div className="section-kicker">简化运行态</div>
            <div className="muted-line">只展示当前阶段可执行性、最近运行和选中节点的关键输入输出。切换到高级模式可查看详细事件流。</div>
          </div>
        ) : null}
      </section>
      <section className="canvas-runtime-column">
        <div className="inspector-card">
          <div className="section-kicker">节点与事件</div>
          {selectedNode ? (
            <div className="runtime-output-card">
              <strong>{selectedNode.data.label}</strong>
              <div className="muted-line">{selectedNode.data.description || '当前节点还没有说明。'}</div>
              <div className="tag-cloud compact">
                {(selectedNode.data.inputArtifactPaths ?? []).map((artifactPath) => <span key={`debug-in-${artifactPath}`} className="small-tag">读 {artifactPath}</span>)}
                {(selectedNode.data.outputArtifactPaths ?? []).map((artifactPath) => <span key={`debug-out-${artifactPath}`} className="small-tag">写 {artifactPath}</span>)}
                {(selectedNode.data.inputMessageKeys ?? []).map((messageKey) => <span key={`debug-msg-in-${messageKey}`} className="small-tag">收 {messageKey}</span>)}
                {(selectedNode.data.outputMessageKeys ?? []).map((messageKey) => <span key={`debug-msg-out-${messageKey}`} className="small-tag">发 {messageKey}</span>)}
                {(selectedNode.data.outputSignalKeys ?? []).map((signalKey) => <span key={`debug-signal-${signalKey}`} className="small-tag">信号 {signalKey}</span>)}
                <span className="small-tag">{selectedNode.data.outputFormat ?? 'markdown'}</span>
              </div>
              {selectedNode.data.notes ? <div className="muted-line">备注：{selectedNode.data.notes}</div> : null}
              {staleNodeIds.includes(selectedNode.id) ? <div className="muted-inline">该节点下游结果待重新确认。</div> : null}
            </div>
          ) : <div className="muted-inline">选中一个节点后，这里会显示节点的输入输出与运行上下文。</div>}
          {latestRun && ((latestRun.branchGroups?.length ?? 0) || (latestRun.loops?.length ?? 0) || (latestRun.subflowCalls?.length ?? 0) || (latestRun.rerunPlans?.length ?? 0) || (latestRun.snapshots?.length ?? 0)) ? (
            <div className="runtime-output-list">
              {(latestRun.branchGroups ?? []).slice(0, 3).map((group) => (
                <div key={group.id} className="runtime-output-card">
                  <strong>并行分支 · {group.strategy}</strong>
                  <div className="muted-line">{group.branches.length} 个分支，当前状态 {group.status}</div>
                  <div className="tag-cloud compact">
                    {group.branches.slice(0, 4).map((branch) => (
                      <span key={branch.id} className="small-tag">{branch.label}:{branch.status}</span>
                    ))}
                  </div>
                </div>
              ))}
              {(latestRun.loops ?? []).slice(0, 3).map((loop) => (
                <div key={loop.id} className="runtime-output-card">
                  <strong>循环 · {nodeLabelById.get(loop.nodeId) ?? loop.nodeId}</strong>
                  <div className="muted-line">状态 {loop.status}，退出原因 {loop.exitReason}</div>
                  <div className="tag-cloud compact">
                    <span className="small-tag">轮次 {loop.iterationScopeIds.length}/{loop.maxIterations}</span>
                    {typeof loop.timeoutMs === 'number' ? <span className="small-tag">超时 {loop.timeoutMs}ms</span> : null}
                  </div>
                </div>
              ))}
              {(latestRun.subflowCalls ?? []).slice(0, 3).map((call) => (
                <div key={call.id} className="runtime-output-card">
                  <strong>子流程 · {nodeLabelById.get(call.nodeId) ?? call.nodeId}</strong>
                  <div className="muted-line">状态 {call.status}，输入 {call.inputBindings.length}，输出 {call.outputBindings.length}</div>
                  <div className="tag-cloud compact">
                    {call.outputBindings.slice(0, 4).map((binding) => (
                      <span key={`${call.id}-${binding}`} className="small-tag">{binding}</span>
                    ))}
                  </div>
                </div>
              ))}
              {(latestRun.rerunPlans ?? []).slice(0, 2).map((plan) => (
                <div key={plan.id} className="runtime-output-card">
                  <strong>{rerunModeLabel(plan.mode)}</strong>
                  <div className="muted-line">{plan.summary}</div>
                </div>
              ))}
              {(latestRun.snapshots ?? []).slice(0, 2).map((snapshot) => (
                <div key={snapshot.id} className="runtime-output-card">
                  <strong>恢复快照</strong>
                  <div className="muted-line">{snapshot.label}</div>
                </div>
              ))}
            </div>
          ) : null}
          {runtimeViewMode === 'advanced' ? (
            <div className="runtime-output-list">
              {latestRunEvents.length ? latestRunEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="runtime-output-card">
                  <strong>{event.type}</strong>
                  <div className="muted-line">{event.message}</div>
                  {event.metadata ? Object.entries(event.metadata).slice(0, 4).map(([key, value]) => (
                    <div key={`${event.id}-${key}`} className="muted-line">{key}: {String(value)}</div>
                  )) : null}
                </div>
              )) : <div className="muted-inline">当前没有事件流数据。</div>}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );

  const artifactCanvas = (
    <div className="canvas-artifact-view">
      <div className="artifact-contract-grid">
        <div className="artifact-contract-card">
          <div className="section-kicker">失效传播与重跑建议</div>
          <strong>{stageArtifactInvalidations.length ? `${stageArtifactInvalidations.length} 个当前阶段工件待处理` : '当前阶段没有待处理失效工件'}</strong>
          <div className="artifact-contract-list">
            {stageArtifactInvalidations.length ? stageArtifactInvalidations.map((item) => (
              <div key={item.id} className="guard-artifact-row">
                <strong>{item.title ?? item.artifactPath}</strong>
                <div className="muted-line">{item.artifactPath}</div>
                <div className="tag-cloud compact">
                  <span className={`small-tag ${item.severity === 'hard' ? 'state-bad' : 'warn'}`}>{item.severity === 'hard' ? '强阻断' : '待确认'}</span>
                  <span className="small-tag warn">建议重跑 {item.recommendedNodeIds.length}</span>
                </div>
                <div className="muted-line">{item.message}</div>
                {item.sourceArtifactPath ? <div className="muted-inline">上游来源：{item.sourceArtifactPath}</div> : null}
                {item.recommendedNodeIds.length ? (
                  <div className="tag-cloud compact">
                    {item.recommendedNodeIds.map((nodeId) => (
                      <span key={`${item.id}-${nodeId}`} className="small-tag">
                        {nodeLabelById.get(nodeId) ?? nodeId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )) : <div className="muted-inline">当上游工件或节点契约变化后，这里会显示失效结果和建议重跑路径。</div>}
          </div>
        </div>
        <div className="artifact-contract-card">
          <div className="section-kicker">当前阶段工件契约</div>
          <strong>{activeSession ? stageLabels[activeSession.stage] : '未选择阶段'}</strong>
          <div className="artifact-contract-list">
            {activeStageArtifacts.length ? activeStageArtifacts.map((artifact) => {
              const guardArtifact = stageGuard?.artifacts.find((item) => item.path === artifact.path);
              const invalidation = artifactInvalidationByPath.get(artifact.path) ?? null;
              const latestRevision = latestArtifactRevisionByPath.get(artifact.path) ?? null;
              return (
                <div key={artifact.id} className="guard-artifact-row">
                  <strong>{artifact.title}</strong>
                  <div className="muted-line">{artifact.path}</div>
                  <div className="muted-inline">{artifact.purpose}</div>
                  <div className="tag-cloud compact">
                    <span className={`small-tag ${guardArtifact?.exists ? 'state-good' : 'state-bad'}`}>{guardArtifact?.exists ? '已生成' : '缺失'}</span>
                    <span className={`small-tag ${guardArtifact?.valid ? 'state-good' : 'state-bad'}`}>{guardArtifact?.valid ? '已校验' : '未通过校验'}</span>
                    {invalidation ? <span className={`small-tag ${invalidation.severity === 'hard' ? 'state-bad' : 'warn'}`}>失效</span> : null}
                  </div>
                  {guardArtifact?.message ? <div className="muted-line">{guardArtifact.message}</div> : null}
                  {invalidation ? <div className="muted-line">{invalidation.message}</div> : null}
                  {latestRevision ? <div className="muted-inline">最近修订：{latestRevision.createdAt.replace('T', ' ').slice(0, 16)}</div> : null}
                  {invalidation?.recommendedNodeIds.length ? (
                    <div className="tag-cloud compact">
                      {invalidation.recommendedNodeIds.map((nodeId) => (
                        <span key={`${artifact.id}-${nodeId}`} className="small-tag">
                          {nodeLabelById.get(nodeId) ?? nodeId}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {(!guardArtifact?.valid || invalidation) ? (
                    <div className="button-row compact">
                      <button type="button" className="button-secondary" onClick={() => openArtifactManager('artifacts')}>修复工件契约</button>
                    </div>
                  ) : null}
                </div>
              );
            }) : <div className="muted-inline">当前阶段还没有声明工件。</div>}
          </div>
        </div>
        <div className="artifact-contract-card">
          <div className="section-kicker">节点输入输出</div>
          {selectedNode ? (
            <>
              <strong>{selectedNode.data.label}</strong>
              <div className="tag-cloud compact">
                {(selectedNode.data.inputArtifactPaths ?? []).map((artifactPath) => <span key={`artifact-in-${artifactPath}`} className="small-tag">输入 {artifactPath}</span>)}
                {(selectedNode.data.outputArtifactPaths ?? []).map((artifactPath) => <span key={`artifact-out-${artifactPath}`} className="small-tag">输出 {artifactPath}</span>)}
                {(selectedNode.data.inputMessageKeys ?? []).map((messageKey) => <span key={`artifact-msg-in-${messageKey}`} className="small-tag">消息入 {messageKey}</span>)}
                {(selectedNode.data.outputMessageKeys ?? []).map((messageKey) => <span key={`artifact-msg-out-${messageKey}`} className="small-tag">消息出 {messageKey}</span>)}
                {(selectedNode.data.outputSignalKeys ?? []).map((signalKey) => <span key={`artifact-signal-${signalKey}`} className="small-tag">信号 {signalKey}</span>)}
                <span className="small-tag">格式 {selectedNode.data.outputFormat ?? 'markdown'}</span>
              </div>
              <div className="button-row compact">
                <button type="button" className="button-secondary" onClick={() => openSelectionInspectorForNode(selectedNode.id)}>配置节点 IO</button>
              </div>
            </>
          ) : (
            <div className="muted-inline">选中一个节点后，这里会显示它读写哪些工件。</div>
          )}
        </div>
      </div>
    </div>
  );

  const runtimePanelContent = (
    <div className="flow-runtime-modal-body inline">
      {runtimePanelTab === 'runtime' ? debugCanvas : null}
      {runtimePanelTab === 'artifacts' ? artifactCanvas : null}
      {runtimePanelTab === 'history' ? (
        <div className="flow-history-panel">
          <div className="section-kicker">Flow 历史</div>
          {currentFlowHistory.length ? currentFlowHistory.map((entry) => (
            <div key={entry.id} className="asset-list-item flow-history-item">
              <strong>{entry.label}</strong>
              <span className="muted-line">{entry.summary}</span>
              <span className="muted-inline">{`${entry.nodeCount} 节点 · ${entry.edgeCount} 连线 · ${entry.createdAt}`}</span>
              <div className="icon-actions">
                <button type="button" className="button-secondary" onClick={() => void onRestoreFlowVersion(flowKind, currentFlowId, entry.id)}>恢复此版本</button>
              </div>
            </div>
          )) : <EmptyBlock title="还没有历史版本" description="保存当前流程后，这里会累积版本与快照。" />}
        </div>
      ) : null}
    </div>
  );

  const modulePane = (
    <aside className="flow-module-panel" aria-label="模块选择区">
      <div className="flow-module-panel-head">
        <div className="panel-kicker">模块选择区</div>
        <strong>标准节点与子流程</strong>
        <p>拖入画布即可生成节点，编辑与删除入口直接贴在模块图标上。</p>
      </div>
      {flowBreadcrumbStack.length ? (
        <div className="flow-module-breadcrumbs">
          {breadcrumbTrail.map((item, index) => (
            <button
              key={`${item.kind}:${item.flowId}`}
              type="button"
              className={index === breadcrumbTrail.length - 1 ? 'current' : ''}
              onClick={() => jumpToBreadcrumb(index)}
              disabled={index === breadcrumbTrail.length - 1}
            >
              {item.name}
            </button>
          ))}
          <button type="button" className="flow-breadcrumb-back" onClick={returnToParentFlow} aria-label="Return to parent flow">
            <ArrowLeft size={14} strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      <div className="flow-module-actions">
        <button
          type="button"
          className="icon-button compact flow-module-action"
          aria-label="导入子流程"
          title="导入子流程"
          onClick={() => void onImportFlow('subflow')}
        >
          <ArrowDownToLine size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button compact flow-module-action"
          aria-label="创建子流程"
          title="创建子流程"
          onClick={() => void createFlow('subflow')}
        >
          <FilePlus2 size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="icon-button compact flow-module-action"
          aria-label="导出子流程"
          title="导出子流程"
          onClick={() => currentFlow && void exportFlowById('subflow', currentFlow.id)}
          disabled={flowKind !== 'subflow' || !currentFlow}
        >
          <ArrowUpFromLine size={16} strokeWidth={1.8} />
        </button>
      </div>

      <label className="flow-module-search" htmlFor="flow-module-search-input">
        <Search size={15} strokeWidth={1.8} />
        <input
          id="flow-module-search-input"
          type="search"
          value={flowModuleQuery}
          onChange={(event) => setFlowModuleQuery(event.target.value)}
          placeholder="搜索节点 / 子流程"
        />
      </label>

      <div className="flow-module-groups">
        <section className="flow-module-group">
          <div className="flow-module-group-head">
            <span>标准节点</span>
            <em>可拖拽</em>
          </div>
          <div className="flow-module-grid">
            {filteredModulePalette.map((item) => {
              const Icon = item.icon;
              const active = selectedNode?.type === item.type;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`flow-module-tile ${active ? 'active' : ''}`}
                  draggable
                  onDragStart={(event) => handlePaletteDragStart(event, item.type)}
                  onClick={() => addNode(item.type)}
                >
                  <div className="flow-module-tile-top">
                    <span className="flow-module-icon">
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <div className="flow-module-mini-actions">
                      <button
                        type="button"
                        className="flow-module-mini"
                        onClick={(event) => {
                          event.stopPropagation();
                          addNode(item.type);
                        }}
                        aria-label={`编辑${item.title}`}
                        title={`编辑${item.title}`}
                      >
                        <PencilLine size={14} strokeWidth={1.8} />
                      </button>
                      <button
                        type="button"
                        className="flow-module-mini danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAssetStatus('标准节点属于内置模块，当前不能从模块库删除。');
                        }}
                        aria-label={`删除${item.title}`}
                        title={`删除${item.title}`}
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flow-module-group">
          <div className="flow-module-group-head">
            <span>子流程</span>
            <em>创建 / 导入</em>
          </div>
          <div className="flow-module-grid">
            {filteredSubflows.length ? filteredSubflows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                className={`flow-module-tile ${flow.id === currentFlowId ? 'active' : ''}`}
                draggable
                onDragStart={(event) => handlePaletteDragStart(event, 'subflow', { subflowId: flow.id, label: flow.name })}
                onClick={() => addNode('subflow', { subflowId: flow.id, label: flow.name, description: flow.description })}
              >
                <div className="flow-module-tile-top">
                  <span className="flow-module-icon">
                    <Component size={18} strokeWidth={1.8} />
                  </span>
                  <div className="flow-module-mini-actions">
                    <button
                      type="button"
                      className="flow-module-mini"
                      onClick={(event) => {
                        event.stopPropagation();
                        openSubflowEditor(flow.id);
                      }}
                      aria-label={`编辑${flow.name}`}
                      title={`编辑${flow.name}`}
                    >
                      <PencilLine size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      className="flow-module-mini danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteFlowById('subflow', flow.id);
                      }}
                      aria-label={`删除${flow.name}`}
                      title={`删除${flow.name}`}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                <strong>{flow.name}</strong>
                <span>{flow.description || '进入子流程后继续配置更深一层的流程语义。'}</span>
              </button>
            )) : (
              <EmptyBlock title="还没有子流程" description="先导入或创建一个子流程，再拖进当前画布复用。" />
            )}
          </div>
        </section>
        {assetStatus ? <div className="inline-note">{assetStatus}</div> : null}
      </div>
    </aside>
  );

  const assistantPanel = selectedNode ? (
    <div className="orchestration-side-main flow-node-inspector-view">
      <div className="flow-node-inspector-head">
        <div>
          <div className="panel-kicker">节点配置</div>
          <strong>{selectedNode.data.label}</strong>
          <p>聚合工作流语义、运行控制、治理审计和后续升级的核心配置。</p>
        </div>
        <button
          type="button"
          className="icon-button compact flow-node-inspector-close"
          onClick={() => {
            setSelectedNodeId('');
            setSelectedEdgeId('');
          }}
          aria-label="关闭节点配置"
          title="关闭节点配置"
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flow-node-inspector-meta">
        <div className="flow-node-inspector-meta-card">
          <span>节点类型</span>
          <strong>{defaultNodeLabel(selectedNode.type)}</strong>
        </div>
        <div className="flow-node-inspector-meta-card">
          <span>当前绑定</span>
          <strong>{selectedNodeBindingLabel}</strong>
        </div>
      </div>

      <div className="flow-node-layer-stack">
        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>工作流层</span>
            <strong>节点、边与执行关系</strong>
          </div>
          <p>{workflowLayerCopy || '尚未配置节点输入输出、绑定关系和下游承接。'}</p>
        </section>

        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>运行控制层</span>
            <strong>暂停、恢复与重试</strong>
          </div>
          <p>{runtimeLayerCopy || '当前节点还没有显式的运行控制约束。'}</p>
        </section>

        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>治理审计层</span>
            <strong>权限、安全与证据</strong>
          </div>
          <p>{governanceLayerCopy || '当前节点还没有收敛治理与审计信息。'}</p>
        </section>

        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>演进升级层</span>
            <strong>版本迁移与资产晋升</strong>
          </div>
          <p>{evolutionLayerCopy || '当前节点还没有显式的升级与迁移说明。'}</p>
        </section>
      </div>

      <div className="flow-node-inspector-actions">
        <button type="button" className="button-secondary" onClick={() => setSelectionInspectorOpen(true)}>打开深度配置</button>
        <button type="button" className="button-secondary" onClick={() => void saveCurrentFlow()}>保存当前 Flow</button>
      </div>
    </div>
  ) : selectedEdge ? (
    <div className="orchestration-side-main flow-node-inspector-view">
      <div className="flow-node-inspector-head">
        <div>
          <div className="panel-kicker">连线配置</div>
          <strong>{typeof selectedEdge.label === 'string' ? selectedEdge.label : '当前连线'}</strong>
          <p>在这里修改这条连线的分支语义、展示标签和补充说明。</p>
        </div>
        <button
          type="button"
          className="icon-button compact flow-node-inspector-close"
          onClick={() => setSelectedEdgeId('')}
          aria-label="关闭连线配置"
          title="关闭连线配置"
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flow-node-layer-stack">
        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>连线语义</span>
            <strong>分支类型</strong>
          </div>
          <select value={((selectedEdge.data as FlowEdgeData | undefined)?.branch ?? 'default')} onChange={(event) => updateEdgeBranch(selectedEdge.id, event.target.value as PlatformFlowAsset['edges'][number]['branch'])}>
            <option value="default">默认</option>
            <option value="true">是</option>
            <option value="false">否</option>
            <option value="loop">循环</option>
            <option value="exit">退出</option>
          </select>
        </section>
        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>展示文本</span>
            <strong>连线标签</strong>
          </div>
          <input value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''} onChange={(event) => updateEdgeLabel(selectedEdge.id, event.target.value)} />
        </section>
        <section className="flow-node-layer-card">
          <div className="flow-node-layer-head">
            <span>补充说明</span>
            <strong>连线描述</strong>
          </div>
          <textarea value={((selectedEdge.data as FlowEdgeData | undefined)?.description ?? '')} onChange={(event) => updateEdgeDescription(selectedEdge.id, event.target.value)} />
        </section>
      </div>
    </div>
  ) : (
    <div className="orchestration-side-main">
      <div className="orchestration-chat-header">
        <div className="panel-kicker">AI</div>
        <strong>流程建议</strong>
        <p>{latestAssistantMessage?.content ?? '围绕当前流程、当前节点和最近一次结构调整，逐步补齐编排细节。'}</p>
      </div>

      <div className="orchestration-chat-scroll">
        {activeSession?.messages.length ? activeSession.messages.slice(-8).map((message) => (
          <article key={message.id} className={`message-thread ${message.role}`}>
            <div className="message-heading">
              <span>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'AI' : '系统'}</span>
              <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
            </div>
            <div className="message-body">{message.content}</div>
          </article>
        )) : (
          <EmptyBlock title="还没有流程建议" description="先在下方输入你想让 AI 补齐的流程约束、节点契约或审查要求。" />
        )}
      </div>

      <section className="orchestration-chat-composer">
        <textarea
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          placeholder="例如：“把需求分析员节点输出改成 PRD 草稿 + 风险清单，并要求 Markdown 表格格式。”"
        />
        <div className="composer-actions">
          <button type="button" className="button-secondary">节点规则</button>
          <span className="composer-hint">已附带：{currentFlowDraft?.name ?? '当前流程'}</span>
          <button type="button" className="button-primary" onClick={() => void sendMessage()} disabled={sending || !chatInput.trim()}>发送</button>
        </div>
      </section>
    </div>
  );

  const governancePanel = (
    <div className="orchestration-side-main">
      <div className="orchestration-chat-header">
        <div className="panel-kicker">运行与治理</div>
        <strong>阶段守卫与运行状态</strong>
        <p>把阶段守卫、审批等待、恢复上下文和最近运行证据集中到一个侧栏查看。</p>
      </div>

      <div className="orchestration-chat-summary">
        <div className="orchestration-summary-pill">
          <span>阶段</span>
          <strong>{stageLabel}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>阶段守卫</span>
          <strong>{stageGuard?.ok ? '已通过' : `阻塞 ${stageGuard?.blockers.length ?? 0}`}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>最近运行</span>
          <strong>{latestRunStatus ?? '尚未运行'}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>待审批</span>
          <strong>{pendingApprovals.length ? `${pendingApprovals.length} 项` : '无'}</strong>
        </div>
      </div>

      <div className="orchestration-chat-scroll">
        {stageGuard?.blockers.length ? stageGuard.blockers.map((blocker, index) => (
          <div key={`guard-${index}`} className="orchestration-note-card">
            <strong>阶段阻塞</strong>
            <div className="muted-line">{blocker}</div>
          </div>
        )) : (
          <div className="orchestration-note-card">
            <strong>当前阶段守卫已通过</strong>
            <div className="muted-line">没有发现阻塞当前运行或交付的阶段约束。</div>
          </div>
        )}
        {latestRunEvents.slice(0, 5).map((event) => (
          <div key={event.id} className="orchestration-note-card">
            <strong>{event.type}</strong>
            <div className="muted-line">{event.message}</div>
            {event.metadata ? Object.entries(event.metadata).slice(0, 3).map(([key, value]) => (
              <div key={`${event.id}-${key}`} className="muted-line">{key}: {String(value)}</div>
            )) : null}
          </div>
        ))}
      </div>
    </div>
  );

  const assetOverviewPanel = (
    <div className="orchestration-side-main">
      <div className="orchestration-chat-header">
        <div className="panel-kicker">资产概览</div>
        <strong>当前流程与关联资产</strong>
        <p>查看当前 Flow、子流程、模板工件和结构校验的整体状态。</p>
      </div>

      <div className="orchestration-chat-summary">
        <div className="orchestration-summary-pill">
          <span>当前 Flow</span>
          <strong>{currentFlowDraft?.name ?? '未选择'}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>节点 / 连线</span>
          <strong>{currentFlowDraft ? `${currentFlowDraft.nodes.length} / ${currentFlowDraft.edges.length}` : '0 / 0'}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>子流程</span>
          <strong>{platform.subflows.length}</strong>
        </div>
        <div className="orchestration-summary-pill">
          <span>模板工件</span>
          <strong>{templateArtifacts.length}</strong>
        </div>
      </div>

      <div className="orchestration-chat-scroll">
        {currentFlowDraft ? (
          <div className="orchestration-note-card">
            <strong>{currentFlowDraft.name}</strong>
            <div className="muted-line">{currentFlowDraft.description || '当前 Flow 还没有补充说明。'}</div>
            <div className="muted-inline">{`节点 ${currentFlowDraft.nodes.length} · 连线 ${currentFlowDraft.edges.length}`}</div>
          </div>
        ) : null}
        {templateArtifacts.slice(0, 6).map((artifact) => (
          <div key={artifact.id} className="orchestration-note-card">
            <strong>{artifact.title}</strong>
            <div className="muted-line">{artifact.path}</div>
            <div className="muted-inline">{artifact.purpose}</div>
          </div>
        ))}
        {!templateArtifacts.length ? (
          <div className="orchestration-note-card">
            <strong>还没有模板工件</strong>
            <div className="muted-line">当前模板还没有声明工件契约，可在右侧深度配置中补齐。</div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="orchestration-workspace" data-testid="orchestration-workspace">
      <div className="orchestration-flow-head">
        <div className="orchestration-flow-head-copy">
          <div className="canvas-toolbar-breadcrumb">
            {breadcrumbTrail.map((item, index) => (
              <button
                key={`${item.kind}:${item.flowId}`}
                type="button"
                className={index === breadcrumbTrail.length - 1 ? 'current' : ''}
                onClick={() => jumpToBreadcrumb(index)}
                disabled={index === breadcrumbTrail.length - 1}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="section-kicker">{draftMode ? '草稿流程' : '编排工作台'}</div>
          <h2>{currentFlowDraft?.name ?? projectName}</h2>
          <p>{draftMode ? '当前只是流程草稿。决定好结构后再保存到本地模板或直接创建工程。' : '当前画布就是当前流程。高频动作保留在顶部和画布内，深层配置全部下沉到弹层。'}</p>
          <div className="orchestration-flow-badges">
            <span className="small-tag">{platform.template?.name ?? '未命名模板'}</span>
            <span className="small-tag">{flowKind === 'subflow' ? '子流程' : '主流程'}</span>
            <span className="small-tag">{stageLabel}</span>
            {currentFlowDraft ? <span className="small-tag">{`节点 ${currentFlowDraft.nodes.length} · 连线 ${currentFlowDraft.edges.length}`}</span> : null}
            {draftMode && draftStatus ? (
              <span className={`small-tag ${draftStatus === '已保存草稿' ? 'state-good' : draftStatus === '保存失败' ? 'state-bad' : ''}`}>{draftStatus}</span>
            ) : null}
          </div>
        </div>
        <div className="orchestration-flow-head-actions">
          <div className="segmented compact" role="tablist" aria-label="工作区模式">
            <button type="button" data-testid="orchestration-mode-design" className={workspaceMode === 'design' ? 'active' : ''} onClick={() => setWorkspaceMode('design')}>设计</button>
            <button type="button" data-testid="orchestration-mode-runtime" className={workspaceMode === 'runtime' ? 'active' : ''} onClick={() => { setRuntimePanelTab('runtime'); setWorkspaceMode('runtime'); }}>运行</button>
          </div>
          {flowBreadcrumbStack.length ? (
            <button type="button" className="button-secondary icon-text" onClick={returnToParentFlow}>
              <ArrowLeft size={14} strokeWidth={1.8} />
              <span>返回上级流程</span>
            </button>
          ) : null}
          <button type="button" className="button-secondary icon-text" onClick={draftMode ? onSaveTemplate : () => void onImportFlow(flowKind)} title={draftMode ? '保存到本地模板' : '导入已有流程'} aria-label={draftMode ? '保存到本地模板' : '导入已有流程'}>
            {draftMode ? <ArrowDownToLine size={14} strokeWidth={1.8} /> : <ArrowUpFromLine size={14} strokeWidth={1.8} />}
            <span>{draftMode ? '保存到本地模板' : '导入已有流程'}</span>
          </button>
          {onBindToProject ? (
            <button type="button" className="button-primary icon-text" onClick={onBindToProject} title="创建工程" aria-label="创建工程">
              <ArrowUpFromLine size={14} strokeWidth={1.8} />
              <span>创建工程</span>
            </button>
          ) : (
            <button type="button" className="button-secondary icon-text" onClick={onSaveTemplate} title="保存为模板" aria-label="保存为模板">
              <ArrowDownToLine size={14} strokeWidth={1.8} />
              <span>保存为模板</span>
            </button>
          )}
          <button type="button" className="button-ghost icon-text" onClick={onReturnToProject} title={draftMode ? '返回欢迎页' : '返回文档工作台'} aria-label={draftMode ? '返回欢迎页' : '返回文档工作台'}>
            <ArrowLeft size={14} strokeWidth={1.8} />
            <span>{draftMode ? '返回欢迎页' : '返回文档工作台'}</span>
          </button>
        </div>
      </div>
      <div className={`orchestration-layout-shell ${isCompact ? 'compact' : ''}`}>
        {!isCompact ? modulePane : null}
        <section className="orchestration-canvas-region">
          <main className="orchestration-canvas-shell canvas-dominant" data-testid="orchestration-canvas">
            {workspaceMode === 'design' ? designCanvas : runtimePanelContent}
          </main>
        </section>
        {!isCompact ? (
          <aside className="orchestration-right-panel">
            {rightPanelMode === 'governance' ? governancePanel : rightPanelMode === 'assets' ? assetOverviewPanel : assistantPanel}
          </aside>
        ) : null}
        {!isCompact ? (
          <aside className="orchestration-right-rail" aria-label="Orchestration side rail">
            <button
              type="button"
              className={`orchestration-rail-toggle ${rightPanelMode === 'assistant' ? 'active' : ''}`}
              onClick={() => setRightPanelMode('assistant')}
              title="Assistant"
              aria-label="Assistant"
            >
              <Bot size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className={`orchestration-rail-toggle ${rightPanelMode === 'governance' ? 'active' : ''}`}
              onClick={() => setRightPanelMode('governance')}
              title="Governance"
              aria-label="Governance"
            >
              <ScanSearch size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className={`orchestration-rail-toggle ${rightPanelMode === 'assets' ? 'active' : ''}`}
              onClick={() => setRightPanelMode('assets')}
              title="Assets"
              aria-label="Assets"
            >
              <Layers3 size={16} strokeWidth={1.8} />
            </button>
          </aside>
        ) : null}
      </div>
      {assetManagerOpen ? (
        <div className="modal-backdrop" onClick={() => setAssetManagerOpen(false)}>
          <div className="modal flow-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-header">
              <div className="sidebar-header-copy">
                <strong>资源管理</strong>
                <div className="muted-line">流程、工件、角色、连接和工具只在使用时打开，不再常驻占据主画布。</div>
              </div>
              <div className="icon-actions">
                <button type="button" className="button-secondary" onClick={() => setAssetManagerOpen(false)}>关闭</button>
              </div>
            </div>
            <div className="flow-editor-modal-grid">
              {assetPane}
              {inspectorPane}
            </div>
          </div>
        </div>
      ) : null}
      {selectionInspectorOpen ? (
        <div className="modal-backdrop" onClick={() => setSelectionInspectorOpen(false)}>
          <div className="modal flow-editor-side-modal" onClick={(event) => event.stopPropagation()}>
            {inspectorPane}
          </div>
        </div>
      ) : null}
      {runtimePanelOpen ? (
        <div className="modal-backdrop" onClick={() => setRuntimePanelOpen(false)}>
          <div className="modal flow-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-header">
              <div className="sidebar-header-copy">
                <strong>运行与历史</strong>
                <div className="muted-line">低优先级运行信息集中放在轻量面板，不再占据固定画布区域。</div>
              </div>
              <div className="segmented compact" role="tablist" aria-label="运行面板标签">
                <button type="button" className={runtimePanelTab === 'runtime' ? 'active' : ''} onClick={() => { setRuntimePanelTab('runtime'); setWorkspaceMode('runtime'); }}>运行</button>
                <button type="button" className={runtimePanelTab === 'artifacts' ? 'active' : ''} onClick={() => { setRuntimePanelTab('artifacts'); setWorkspaceMode('runtime'); }}>工件</button>
                <button type="button" className={runtimePanelTab === 'history' ? 'active' : ''} onClick={() => { setRuntimePanelTab('history'); setWorkspaceMode('runtime'); }}>历史</button>
              </div>
              <div className="segmented compact" role="tablist" aria-label="运行视图模式">
                <button type="button" className={runtimeViewMode === 'novice' ? 'active' : ''} onClick={() => setRuntimeViewMode('novice')}>简化</button>
                <button type="button" className={runtimeViewMode === 'advanced' ? 'active' : ''} onClick={() => setRuntimeViewMode('advanced')}>高级</button>
              </div>
            </div>
            {runtimePanelContent}
          </div>
        </div>
      ) : null}
      {roleCreatorNodeId !== null ? (
        <div className="modal-backdrop" onClick={() => setRoleCreatorNodeId(null)}>
          <div className="modal flow-editor-side-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sidebar-header">
              <div className="sidebar-header-copy">
                <strong>创建角色</strong>
                <div className="muted-line">按 IDENTITY / SOUL / AGENTS / USER 结构输入，创建后立即绑定到当前节点。</div>
              </div>
            </div>
            <div className="form-grid role-creator-grid">
              <label>
                名称
                <input value={roleCreatorDraft.name} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                专注领域
                <input value={roleCreatorDraft.domain} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, domain: event.target.value }))} />
              </label>
              <label className="full-span">
                描述
                <textarea value={roleCreatorDraft.description} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="full-span">
                IDENTITY
                <textarea value={roleCreatorDraft.identity} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, identity: event.target.value }))} />
              </label>
              <label className="full-span">
                SOUL
                <textarea value={roleCreatorDraft.soul} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, soul: event.target.value }))} />
              </label>
              <label className="full-span">
                AGENTS
                <textarea value={roleCreatorDraft.agents} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, agents: event.target.value }))} />
              </label>
              <label className="full-span">
                USER
                <textarea value={roleCreatorDraft.user} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, user: event.target.value }))} />
              </label>
              <label className="full-span">
                MEMORY
                <textarea value={roleCreatorDraft.memory} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, memory: event.target.value }))} />
              </label>
              <label className="full-span">
                绑定 Skills
                <div className="tag-cloud compact">
                  {installedSkills.length ? installedSkills.map((skill) => {
                    const active = roleCreatorDraft.allowedSkillIds.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={`small-tag button-chip ${active ? 'active' : ''}`}
                        onClick={() => setRoleCreatorDraft((current) => ({
                          ...current,
                          allowedSkillIds: active
                            ? current.allowedSkillIds.filter((item) => item !== skill.id)
                            : [...current.allowedSkillIds, skill.id]
                        }))}
                      >
                        {skill.name}
                      </button>
                    );
                  }) : <span className="muted-inline">当前没有已安装技能。</span>}
                </div>
              </label>
              <label>
                路由模式
                <select value={roleCreatorDraft.modelPolicy.mode} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, modelPolicy: { ...current.modelPolicy, mode: event.target.value as PlatformRole['modelPolicy']['mode'] } }))}>
                  <option value="fallback_to_active">回退到当前激活</option>
                  <option value="fixed">固定模型</option>
                  <option value="prefer_list">优先列表</option>
                  <option value="capability_match">按能力匹配</option>
                  <option value="policy_router">按策略路由</option>
                </select>
              </label>
              <label className="full-span">
                模型策略备注
                <textarea value={roleCreatorDraft.modelPolicy.note ?? ''} onChange={(event) => setRoleCreatorDraft((current) => ({ ...current, modelPolicy: { ...current.modelPolicy, note: event.target.value } }))} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button-secondary" onClick={() => setRoleCreatorNodeId(null)}>取消</button>
              <button type="button" className="button-primary" onClick={() => void saveCreatedRole()}>保存并绑定</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function renderFlowAssets(props: {
  flowKind: PlatformFlowAsset['kind'];
  setFlowKind: (kind: PlatformFlowAsset['kind']) => void;
  flowOptions: PlatformFlowAsset[];
  currentFlowId: string;
  setCurrentFlowId: (flowId: string) => void;
  createFlow: () => Promise<void>;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  onDuplicateById: (kind: PlatformFlowAsset['kind'], flowId: string) => void;
  onExportById: (kind: PlatformFlowAsset['kind'], flowId: string) => void;
  onDeleteById: (kind: PlatformFlowAsset['kind'], flowId: string) => void;
  currentFlow: PlatformFlowAsset | null;
  addNode: (type: PlatformFlowNode['type']) => void;
  onPaletteDragStart: (event: ReactDragEvent<HTMLButtonElement>, type: PlatformFlowNode['type']) => void;
}) {
  const { flowKind, setFlowKind, flowOptions, currentFlowId, setCurrentFlowId, createFlow, onDuplicate, onImport, onExport, onDelete, onDuplicateById, onExportById, onDeleteById, currentFlow, addNode, onPaletteDragStart } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {flowOptions.length} 个{flowKind === 'subflow' ? '子流程' : '主流程'}</div>
        <div className="segmented compact icon-only" role="tablist" aria-label="流程层级">
          {flowKindMeta.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={flowKind === id ? 'active' : ''}
              title={label}
              aria-label={label}
              aria-pressed={flowKind === id}
              onClick={() => setFlowKind(id)}
            >
              <Icon size={16} strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <IconButton title="新建流程" icon={FilePlus2} onClick={() => void createFlow()} />
      </div>
      <div className="asset-list">
        {flowOptions.map((flow) => (
          <div key={flow.id} className={`asset-list-item flow-asset-item ${flow.id === currentFlowId ? 'active' : ''}`}>
            <button type="button" className="asset-list-main" onClick={() => setCurrentFlowId(flow.id)}>
              <div className="asset-item-head">
                <strong>{flow.name}</strong>
                <span className="small-tag">{flow.kind === 'subflow' ? '子流程' : '主流程'}</span>
              </div>
              <span className="muted-line">{flow.description || '未填写描述'}</span>
              <span className="muted-inline">{`节点 ${flow.nodes.length} · 连线 ${flow.edges.length}`}</span>
            </button>
            <div className="flow-asset-actions">
              <IconButton title="打开流程" icon={Workflow} onClick={() => setCurrentFlowId(flow.id)} />
              <IconButton title="复制流程" icon={Copy} onClick={() => onDuplicateById(flow.kind, flow.id)} />
              <IconButton title="导出流程" icon={ArrowUpFromLine} onClick={() => onExportById(flow.kind, flow.id)} />
              <IconButton title="删除流程" icon={Trash2} variant="danger" onClick={() => onDeleteById(flow.kind, flow.id)} />
            </div>
          </div>
        ))}
      </div>
      {currentFlow ? (
        <>
          <div className="asset-tool-row">
            <span className="section-kicker">流程操作</span>
            <div className="icon-actions">
              <IconButton title="复制当前流程" icon={Copy} onClick={onDuplicate} />
              <IconButton title="导入流程" icon={ArrowDownToLine} onClick={onImport} />
              <IconButton title="导出流程" icon={ArrowUpFromLine} onClick={onExport} />
              <IconButton title="删除当前流程" icon={Trash2} variant="danger" onClick={onDelete} />
            </div>
          </div>
          <div className="asset-chip-row">
            <span className="section-kicker">可用节点</span>
            <div className="node-palette-grid">
              {[
                { type: 'agent', label: '智能角色', icon: Bot },
                { type: 'tool', label: '工具', icon: Wrench },
                { type: 'condition', label: '条件', icon: GitBranchPlus },
                { type: 'loop', label: '循环', icon: Repeat },
                { type: 'parallel_split', label: '并行分叉', icon: SplitSquareHorizontal },
                { type: 'parallel_join', label: '并行汇合', icon: Layers3 },
                { type: 'subflow', label: '子流程', icon: Component },
                { type: 'artifact', label: '工件', icon: PencilLine }
              ].map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  draggable
                  className="node-palette-card palette-card"
                  onClick={() => addNode(type as PlatformFlowNode['type'])}
                  onDragStart={(event) => onPaletteDragStart(event, type as PlatformFlowNode['type'])}
                  title={`拖到画布中添加${label}`}
                >
                  <div className="node-palette-card-head">
                    <span className="node-palette-icon">
                      <Icon size={16} strokeWidth={1.8} />
                    </span>
                    <span className="node-palette-dragger" aria-hidden="true">
                      <GripVertical size={14} strokeWidth={1.8} />
                    </span>
                  </div>
                  <strong>{label}</strong>
                  <span>拖入画布，或点击后添加到当前视口中心。</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyBlock title="还没有流程" description="先创建主流程或子流程，再开始编排。" />
      )}
    </>
  );
}

function renderArtifactAssets(props: {
  runtimeTemplate: RuntimeTemplateAsset | null;
  templateArtifacts: TemplateArtifactItem[];
}) {
  const { runtimeTemplate, templateArtifacts } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {templateArtifacts.length} 个工件契约</div>
      </div>
      {runtimeTemplate ? (
        <div className="asset-stack">
          {templateArtifacts.map((artifact) => (
            <div key={artifact.id} className="asset-list-item artifact-contract-item">
              <div className="asset-item-head">
                <strong>{artifact.title}</strong>
                <span className="small-tag">{stageLabels[artifact.stage]}</span>
              </div>
              <span className="muted-line">{artifact.path}</span>
              <span className="muted-inline">{artifact.purpose}</span>
              <span className="muted-inline">校验器：{artifact.validatorId}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock title="模板还没有工件契约" description="当前模板未声明阶段输出物，无法做工件约束和导出映射。" />
      )}
    </>
  );
}

function renderArtifactAssetsV2(props: {
  runtimeTemplate: RuntimeTemplateAsset | null;
  templateArtifacts: TemplateArtifactItem[];
  setTemplateDraft: (updater: (template: RuntimeTemplateAsset) => RuntimeTemplateAsset) => void;
  onSaveTemplateDraft: () => Promise<void>;
}) {
  const { runtimeTemplate, templateArtifacts, setTemplateDraft, onSaveTemplateDraft } = props;
  if (!runtimeTemplate) {
    return (
      <>
        <div className="toolbar-row">
          <div className="toolbar-row-meta">当前没有工件契约</div>
        </div>
        <EmptyBlock title="模板还没有工件契约" description="当前模板未声明阶段工件、阶段契约和导出映射。" />
      </>
    );
  }

  const normalizedTemplate = normalizeRuntimeTemplate(runtimeTemplate);
  const stageContracts = normalizedTemplate.stageContracts as Record<AppStage, StageOutputContract>;
  const exportMapping = normalizedTemplate.exportMapping ?? resolveRuntimeExportMapping(normalizedTemplate);

  const updateStageContract = (
    stage: AppStage,
    updater: (contract: NonNullable<RuntimeTemplateAsset['stageContracts']>[AppStage]) => NonNullable<RuntimeTemplateAsset['stageContracts']>[AppStage]
  ) => {
    setTemplateDraft((current) => {
      const normalized = normalizeRuntimeTemplate(current);
      const nextStageContracts = {
        ...(normalized.stageContracts as Record<AppStage, StageOutputContract>),
        [stage]: updater((normalized.stageContracts as Record<AppStage, StageOutputContract>)[stage])
      } satisfies Record<AppStage, StageOutputContract>;
      return normalizeRuntimeTemplate({
        ...normalized,
        stageContracts: nextStageContracts
      });
    });
  };

  const updateExportMapping = (
    format: keyof typeof exportMapping,
    updater: (entry: RuntimeTemplateExportMappingEntry) => RuntimeTemplateExportMappingEntry
  ) => {
    setTemplateDraft((current) => {
      const normalized = normalizeRuntimeTemplate(current);
      const currentMapping = normalized.exportMapping ?? resolveRuntimeExportMapping(normalized);
      return normalizeRuntimeTemplate({
        ...normalized,
        exportMapping: {
          ...currentMapping,
          [format]: updater(currentMapping[format])
        }
      });
    });
  };

  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {templateArtifacts.length} 个工件契约</div>
        <button type="button" className="button-secondary" onClick={() => void onSaveTemplateDraft()}>保存工件契约与导出映射</button>
      </div>
      <div className="asset-stack">
        {(Object.keys(stageLabels) as AppStage[]).map((stage) => {
          const docs = normalizedTemplate.stageDocuments[stage] ?? [];
          const contract = stageContracts[stage];
          const validatorOptions = Array.from(new Set(docs.map((doc) => doc.validatorId)));
          return (
            <div key={`contract-${stage}`} className="inspector-card">
              <div className="section-kicker">{stageLabels[stage]} 阶段契约</div>
              <div className="muted-line">声明该阶段必须完成哪些工件，以及 Guard 如何阻断确认。</div>
              <div className="tag-cloud compact">
                {docs.map((doc) => {
                  const active = contract?.requiredArtifactPaths.includes(doc.path);
                  return (
                    <button
                      key={`${stage}-${doc.path}`}
                      type="button"
                      className={`small-tag button-chip ${active ? 'active' : ''}`}
                      onClick={() => updateStageContract(stage, (current) => ({
                        ...current,
                        requiredArtifactPaths: active
                          ? current.requiredArtifactPaths.filter((item) => item !== doc.path)
                          : [...current.requiredArtifactPaths, doc.path]
                      }))}
                    >
                      {doc.title}
                    </button>
                  );
                })}
              </div>
              <div className="form-grid two-column">
                <label>
                  阻断策略
                  <select
                    value={contract?.blockingPolicy ?? 'all_required'}
                    onChange={(event) => updateStageContract(stage, (current) => ({
                      ...current,
                      blockingPolicy: event.target.value as typeof current.blockingPolicy
                    }))}
                  >
                    <option value="all_required">全部必需</option>
                    <option value="allow_warnings">允许警告</option>
                  </select>
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(contract?.allowManualBypass)}
                    onChange={(event) => updateStageContract(stage, (current) => ({
                      ...current,
                      allowManualBypass: event.target.checked
                    }))}
                  />
                  <span>允许人工绕过</span>
                </label>
              </div>
              <div className="tag-cloud compact">
                {validatorOptions.map((validatorId) => {
                  const active = contract?.validatorIds.includes(validatorId);
                  return (
                    <button
                      key={`${stage}-validator-${validatorId}`}
                      type="button"
                      className={`small-tag button-chip ${active ? 'active' : ''}`}
                      onClick={() => updateStageContract(stage, (current) => ({
                        ...current,
                        validatorIds: active
                          ? current.validatorIds.filter((item) => item !== validatorId)
                          : [...current.validatorIds, validatorId]
                      }))}
                    >
                      {validatorId}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {(Object.keys(exportMapping) as Array<keyof typeof exportMapping>).map((format) => {
          const mapping = exportMapping[format];
          return (
            <div key={`export-${format}`} className="inspector-card">
              <div className="section-kicker">{format.toUpperCase()} 导出映射</div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={mapping.enabled}
                  onChange={(event) => updateExportMapping(format, (current) => ({
                    ...current,
                    enabled: event.target.checked
                  }))}
                />
                <span>启用该导出格式</span>
              </label>
              <div className="form-grid two-column">
                <label>
                  输出目录模式
                  <input
                    value={mapping.outputPathPattern ?? ''}
                    onChange={(event) => updateExportMapping(format, (current) => ({
                      ...current,
                      outputPathPattern: event.target.value
                    }))}
                  />
                </label>
                <label>
                  文件名模式
                  <input
                    value={mapping.fileNamePattern ?? ''}
                    onChange={(event) => updateExportMapping(format, (current) => ({
                      ...current,
                      fileNamePattern: event.target.value
                    }))}
                  />
                </label>
              </div>
              <div className="tag-cloud compact">
                {templateArtifacts.map((artifact) => {
                  const active = mapping.artifactPaths.includes(artifact.path);
                  return (
                    <button
                      key={`${format}-${artifact.id}`}
                      type="button"
                      className={`small-tag button-chip ${active ? 'active' : ''}`}
                      onClick={() => updateExportMapping(format, (current) => ({
                        ...current,
                        artifactPaths: active
                          ? current.artifactPaths.filter((item) => item !== artifact.path)
                          : [...current.artifactPaths, artifact.path]
                      }))}
                    >
                      {artifact.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function renderRoleAssets(props: {
  rolesDraft: PlatformRole[];
  selectedRoleId: string;
  setSelectedRoleId: (roleId: string) => void;
  onCreateRole: () => void;
}) {
  const { rolesDraft, selectedRoleId, setSelectedRoleId, onCreateRole } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {rolesDraft.length} 个角色</div>
        <IconButton title="新增角色" icon={FilePlus2} onClick={onCreateRole} />
      </div>
      <div className="asset-list">
        {rolesDraft.map((role) => (
          <button key={role.id} type="button" className={`asset-list-item ${role.id === selectedRoleId ? 'active' : ''}`} onClick={() => setSelectedRoleId(role.id)}>
            <strong>{role.name}</strong>
            <span className={`small-tag ${role.packageStatus === 'complete' ? 'state-good' : 'state-bad'}`}>{role.packageStatus === 'complete' ? '完整' : '未完成'}</span>
            <span className="muted-line">{role.description || '未填写描述'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function renderTaskTemplateAssets(props: {
  taskTemplatesDraft: TaskTemplate[];
  selectedTaskTemplateId: string;
  setSelectedTaskTemplateId: (taskTemplateId: string) => void;
  saveTaskTemplateDrafts: (taskTemplates: TaskTemplate[]) => Promise<void>;
}) {
  const { taskTemplatesDraft, selectedTaskTemplateId, setSelectedTaskTemplateId, saveTaskTemplateDrafts } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {taskTemplatesDraft.length} 个任务模板</div>
        <IconButton title="新增任务模板" icon={FilePlus2} onClick={() => void saveTaskTemplateDrafts([...taskTemplatesDraft, createEmptyTaskTemplate(taskTemplatesDraft.length + 1)])} />
      </div>
      <div className="asset-list">
        {taskTemplatesDraft.map((taskTemplate) => (
          <button key={taskTemplate.id} type="button" className={`asset-list-item ${taskTemplate.id === selectedTaskTemplateId ? 'active' : ''}`} onClick={() => setSelectedTaskTemplateId(taskTemplate.id)}>
            <strong>{taskTemplate.name}</strong>
            <span className="muted-line">{taskTemplate.objective || '未填写任务目标'}</span>
            <span className="muted-inline">{`skills ${taskTemplate.recommendedSkillIds?.length ?? 0} · capabilities ${taskTemplate.requiredCapabilities?.length ?? 0}`}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function renderAgentProfileAssets(props: {
  agentProfilesDraft: AgentProfile[];
  selectedAgentProfileId: string;
  setSelectedAgentProfileId: (agentProfileId: string) => void;
  saveAgentProfileDrafts: (agentProfiles: AgentProfile[]) => Promise<void>;
  rolesDraft: PlatformRole[];
}) {
  const { agentProfilesDraft, selectedAgentProfileId, setSelectedAgentProfileId, saveAgentProfileDrafts, rolesDraft } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {agentProfilesDraft.length} 个执行配置</div>
        <IconButton
          title="新增执行配置"
          icon={FilePlus2}
          onClick={() => void saveAgentProfileDrafts([
            ...agentProfilesDraft,
            createEmptyAgentProfile(agentProfilesDraft.length + 1, rolesDraft[0]?.id)
          ])}
        />
      </div>
      <div className="asset-list">
        {agentProfilesDraft.map((agentProfile) => (
          <button key={agentProfile.id} type="button" className={`asset-list-item ${agentProfile.id === selectedAgentProfileId ? 'active' : ''}`} onClick={() => setSelectedAgentProfileId(agentProfile.id)}>
            <strong>{agentProfile.name}</strong>
            <span className="muted-line">{rolesDraft.find((role) => role.id === agentProfile.roleProfileId)?.name ?? '未绑定角色'}</span>
            <span className="muted-inline">{`skills ${agentProfile.defaultSkillBundle?.length ?? 0} · capabilities ${agentProfile.capabilityPolicy.allowedCapabilities?.length ?? 0}`}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function renderConnectorAssets(props: {
  connectorsDraft: PlatformConnector[];
  selectedConnectorId: string;
  setSelectedConnectorId: (connectorId: string) => void;
  saveConnectorDrafts: (connectors: PlatformConnector[]) => Promise<void>;
}) {
  const { connectorsDraft, selectedConnectorId, setSelectedConnectorId, saveConnectorDrafts } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {connectorsDraft.length} 个连接</div>
        <IconButton title="新增连接" icon={FilePlus2} onClick={() => void saveConnectorDrafts([...connectorsDraft, createEmptyConnector(connectorsDraft.length + 1)])} />
      </div>
      <div className="asset-list">
        {connectorsDraft.map((connector) => (
          <button key={connector.id} type="button" className={`asset-list-item ${connector.id === selectedConnectorId ? 'active' : ''}`} onClick={() => setSelectedConnectorId(connector.id)}>
            <strong>{connector.name}</strong>
            <span className={`small-tag ${connector.health === 'healthy' ? 'state-good' : connector.health === 'error' ? 'state-bad' : ''}`}>{connector.health}</span>
            <span className="muted-line">{connector.description || '未填写描述'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function renderToolAssets(props: {
  toolsDraft: ControlledScriptTool[];
  selectedToolId: string;
  setSelectedToolId: (toolId: string) => void;
  saveToolDrafts: (tools: ControlledScriptTool[]) => Promise<void>;
}) {
  const { toolsDraft, selectedToolId, setSelectedToolId, saveToolDrafts } = props;
  return (
    <>
      <div className="toolbar-row">
        <div className="toolbar-row-meta">当前共 {toolsDraft.length} 个工具</div>
        <IconButton title="新增工具" icon={FilePlus2} onClick={() => void saveToolDrafts([...toolsDraft, createEmptyTool(toolsDraft.length + 1)])} />
      </div>
      <div className="asset-list">
        {toolsDraft.map((tool) => (
          <button key={tool.id} type="button" className={`asset-list-item ${tool.id === selectedToolId ? 'active' : ''}`} onClick={() => setSelectedToolId(tool.id)}>
            <strong>{tool.name}</strong>
            <span className="muted-line">{tool.command}</span>
            <span className="muted-inline">{tool.lastRun ? `上次运行：${tool.lastRun.ok ? '成功' : '失败'}` : '尚未运行'}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function renderInspector(props: {
  assetTab: AssetTab;
  selectedNode: PlatformFlowNode | null;
  selectedCanvasNode: FlowCanvasNode | null;
  selectedEdge: Edge | null;
  selectedRole: PlatformRole | null;
  selectedTaskTemplate: TaskTemplate | null;
  selectedAgentProfile: AgentProfile | null;
  selectedConnector: PlatformConnector | null;
  selectedTool: ControlledScriptTool | null;
  rolesDraft: PlatformRole[];
  taskTemplatesDraft: TaskTemplate[];
  agentProfilesDraft: AgentProfile[];
  connectorsDraft: PlatformConnector[];
  toolsDraft: ControlledScriptTool[];
  platform: PlatformAssets;
  setNodes: Dispatch<SetStateAction<FlowCanvasNode[]>>;
  mutateCurrentFlowNode: (updater: (node: PlatformFlowNode) => PlatformFlowNode) => void;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  saveRoleDrafts: (roles: PlatformRole[]) => Promise<void>;
  saveTaskTemplateDrafts: (taskTemplates: TaskTemplate[]) => Promise<void>;
  saveAgentProfileDrafts: (agentProfiles: AgentProfile[]) => Promise<void>;
  saveConnectorDrafts: (connectors: PlatformConnector[]) => Promise<void>;
  saveToolDrafts: (tools: ControlledScriptTool[]) => Promise<void>;
  onTestConnector: (connectorId: string) => Promise<{ ok: boolean; message: string }>;
  onRunTool: (toolId: string) => Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>;
  setAssetStatus: (status: string) => void;
  currentFlow: PlatformFlowAsset | null;
  currentFlowNodes: PlatformFlowNode[];
  selectedNodeId: string;
  setSelectedNodeId: (nodeId: string) => void;
  selectedEdgeId: string;
  setSelectedEdgeId: (edgeId: string) => void;
  edges: Edge[];
  updateEdgeBranch: (edgeId: string, branch: PlatformFlowAsset['edges'][number]['branch']) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  updateEdgeDescription: (edgeId: string, description: string) => void;
  upsertBranchEdge: (sourceId: string, targetId: string | undefined, branch: PlatformFlowAsset['edges'][number]['branch'], fallbackLabel: string) => void;
  settings: AppSettings;
  runtimeRuns: RuntimeRun[];
  runtimeEvents: RuntimeEvent[];
  runtimeCapabilities: RuntimeCapabilityDefinition[];
  rulesDistillation?: RulesDistillationSnapshot | null;
  installedSkills: InstalledSkill[];
  templateArtifacts: TemplateArtifactItem[];
  openSubflowEditor: (subflowId?: string) => void;
  startRoleCreator: (nodeId?: string) => void;
  saveCurrentFlow: () => Promise<void>;
  currentFlowName: string;
  currentFlowDescription: string;
  currentFlowRoleIds: string[];
  currentFlowPathConfig: FlowPathConfig;
  setCurrentFlowName: (value: string) => void;
  setCurrentFlowDescription: (value: string) => void;
  setCurrentFlowRoleIds: (value: string[]) => void;
  setCurrentFlowPathConfig: (value: FlowPathConfig) => void;
  setFlowDraftNodes: (nodes: PlatformFlowNode[]) => void;
}) {
  const { assetTab, selectedNode, selectedCanvasNode, selectedEdge, selectedRole, selectedTaskTemplate, selectedAgentProfile, selectedConnector, selectedTool, rolesDraft, taskTemplatesDraft, agentProfilesDraft, connectorsDraft, toolsDraft, platform, setNodes, mutateCurrentFlowNode, setEdges, saveRoleDrafts, saveTaskTemplateDrafts, saveAgentProfileDrafts, saveConnectorDrafts, saveToolDrafts, onTestConnector, onRunTool, setAssetStatus, currentFlow, currentFlowNodes, selectedNodeId, setSelectedNodeId, selectedEdgeId, setSelectedEdgeId, edges, updateEdgeBranch, updateEdgeLabel, updateEdgeDescription, upsertBranchEdge, settings, runtimeRuns, runtimeEvents, runtimeCapabilities, rulesDistillation, installedSkills, templateArtifacts, openSubflowEditor, startRoleCreator, saveCurrentFlow, currentFlowName, currentFlowDescription, currentFlowRoleIds, currentFlowPathConfig, setCurrentFlowName, setCurrentFlowDescription, setCurrentFlowRoleIds, setCurrentFlowPathConfig, setFlowDraftNodes } = props;
  const title = selectedNode ? '流程卡片配置' : selectedEdge ? '连线配置' : assetTab === 'roles' ? '角色配置' : assetTab === 'task-templates' ? '任务模板配置' : assetTab === 'agent-profiles' ? '执行配置' : assetTab === 'connectors' ? '连接配置' : assetTab === 'tools' ? '工具配置' : '流程配置';
  const subtitle = selectedNode
    ? `${defaultNodeLabel(selectedNode.type)} · ${selectedNode.data.label}`
    : selectedEdge
      ? '编辑连线语义、标签和说明'
      : '在弹窗中维护流程、角色、连接与工具';
  return (
    <>
      <SidebarHeader
        title={title}
        description={`${title} · ${subtitle}`}
        actions={
          selectedNode ? (
            <IconButton
              title="删除选中节点"
              icon={Trash2}
              variant="danger"
              onClick={() => {
                if (!currentFlow || !selectedNodeId) return;
                const remainingNodes = currentFlow.nodes.filter((item) => item.id !== selectedNodeId);
                setFlowDraftNodes(remainingNodes);
                const remainingEdges = edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId);
                setNodes((current) => toReactNodes(remainingNodes, rolesDraft, connectorsDraft, toolsDraft, platform.subflows, [], undefined, current));
                setEdges(remainingEdges);
                setSelectedNodeId('');
              }}
            />
          ) : selectedEdge ? (
            <IconButton
              title="删除选中连线"
              icon={Trash2}
              variant="danger"
              onClick={() => {
                setEdges((current) => current.filter((item) => item.id !== selectedEdgeId));
                setSelectedEdgeId('');
              }}
            />
          ) : null
        }
      />
      <div className="inspector-body">
        {selectedNode ? (
          <NodeInspectorPanel
            selectedNode={selectedNode}
            selectedCanvasNode={selectedCanvasNode}
            currentFlowNodes={currentFlowNodes}
            rolesDraft={rolesDraft}
            taskTemplatesDraft={taskTemplatesDraft}
            agentProfilesDraft={agentProfilesDraft}
            connectorsDraft={connectorsDraft}
            toolsDraft={toolsDraft}
            subflows={platform.subflows}
            installedSkills={installedSkills}
            settings={settings}
            templateArtifacts={templateArtifacts}
            rulesDistillation={rulesDistillation}
            currentFlow={currentFlow}
            setNodes={setNodes}
            mutateCurrentFlowNode={mutateCurrentFlowNode}
            upsertBranchEdge={upsertBranchEdge}
            openSubflowEditor={openSubflowEditor}
            startRoleCreator={startRoleCreator}
          />
        ) : null}
        {selectedEdge ? (
          <div className="form-grid">
            <label>
              连线语义
              <select value={((selectedEdge.data as FlowEdgeData | undefined)?.branch ?? 'default')} onChange={(event) => updateEdgeBranch(selectedEdge.id, event.target.value as PlatformFlowAsset['edges'][number]['branch'])}>
                <option value="default">默认</option>
                <option value="true">是</option>
                <option value="false">否</option>
                <option value="loop">循环</option>
                <option value="exit">退出</option>
              </select>
            </label>
            <label>
              连线标签
              <input value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''} onChange={(event) => updateEdgeLabel(selectedEdge.id, event.target.value)} />
            </label>
            <label>
              连线说明
              <textarea value={((selectedEdge.data as FlowEdgeData | undefined)?.description ?? '')} onChange={(event) => updateEdgeDescription(selectedEdge.id, event.target.value)} />
            </label>
          </div>
        ) : null}
        {!selectedNode && !selectedEdge && assetTab === 'roles' && selectedRole ? renderRoleInspector(selectedRole, rolesDraft, installedSkills, settings, saveRoleDrafts) : null}
        {!selectedNode && !selectedEdge && assetTab === 'task-templates' && selectedTaskTemplate ? renderTaskTemplateInspector(selectedTaskTemplate, taskTemplatesDraft, installedSkills, saveTaskTemplateDrafts) : null}
        {!selectedNode && !selectedEdge && assetTab === 'agent-profiles' && selectedAgentProfile ? renderAgentProfileInspector(selectedAgentProfile, agentProfilesDraft, rolesDraft, installedSkills, settings, saveAgentProfileDrafts) : null}
        {!selectedNode && !selectedEdge && assetTab === 'connectors' && selectedConnector ? renderConnectorInspector(selectedConnector, connectorsDraft, saveConnectorDrafts, onTestConnector, setAssetStatus) : null}
        {!selectedNode && !selectedEdge && assetTab === 'tools' && selectedTool ? renderToolInspector(selectedTool, toolsDraft, connectorsDraft, saveToolDrafts, onRunTool, setAssetStatus) : null}
        {!selectedNode && !selectedEdge && assetTab === 'flows' ? (
          <div className="inspector-card">
            <div className="section-kicker">当前流程</div>
            <strong>{currentFlow?.name ?? '未选择流程'}</strong>
            <div className="muted-line">{currentFlow?.description || '未填写流程说明'}</div>
            <div className="muted-line">节点数：{currentFlow?.nodes.length ?? 0} · 连线数：{currentFlow?.edges.length ?? 0}</div>
            <div className="muted-line">最近运行数：{runtimeRuns.length} · 事件数：{runtimeEvents.length}</div>
            <div className="tag-cloud compact">
              {runtimeCapabilities.filter((item) => item.enabled).slice(0, 8).map((item) => (
                <span key={item.id} className="small-tag">{item.name}</span>
              ))}
            </div>
          </div>
        ) : null}
        {!selectedNode && !selectedEdge && assetTab === 'flows' ? renderFlowInspectorV2(
          currentFlow,
          rolesDraft,
          currentFlowName,
          currentFlowDescription,
          currentFlowRoleIds,
          currentFlowPathConfig,
          setCurrentFlowName,
          setCurrentFlowDescription,
          setCurrentFlowRoleIds,
          setCurrentFlowPathConfig,
          saveCurrentFlow
        ) : null}
        {!selectedNode && !selectedEdge && assetTab === 'flows' ? <EmptyBlock title="选择一个流程、节点或连线" description="右键画布可快速加节点，节点本身也带常用操作。" /> : null}
      </div>
    </>
  );
}

function renderFlowInspector(
  currentFlow: PlatformFlowAsset | null,
  rolesDraft: PlatformRole[],
  currentFlowName: string,
  currentFlowDescription: string,
  currentFlowRoleIds: string[],
  currentFlowPathConfig: FlowPathConfig,
  setCurrentFlowName: (value: string) => void,
  setCurrentFlowDescription: (value: string) => void,
  setCurrentFlowRoleIds: (value: string[]) => void,
  setCurrentFlowPathConfig: (value: FlowPathConfig) => void,
  saveCurrentFlow: () => Promise<void>
) {
  if (!currentFlow) return null;
  return (
    <div className="form-grid">
      <label>
        流程名称
        <input value={currentFlowName} onChange={(event) => setCurrentFlowName(event.target.value)} />
      </label>
      <label>
        流程说明
        <textarea value={currentFlowDescription} onChange={(event) => setCurrentFlowDescription(event.target.value)} />
      </label>
      <label>
        参与角色
        <div className="tag-cloud compact">
          {rolesDraft.map((role) => {
            const active = currentFlowRoleIds.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => {
                  const next = new Set(currentFlowRoleIds);
                  if (next.has(role.id)) next.delete(role.id);
                  else next.add(role.id);
                  setCurrentFlowRoleIds(Array.from(next));
                }}
              >
                {role.name}
              </button>
            );
          })}
        </div>
      </label>
      <button type="button" className="button-secondary" onClick={() => void saveCurrentFlow()}>保存流程元数据</button>
    </div>
  );
}

function renderFlowInspectorV2(
  currentFlow: PlatformFlowAsset | null,
  rolesDraft: PlatformRole[],
  currentFlowName: string,
  currentFlowDescription: string,
  currentFlowRoleIds: string[],
  currentFlowPathConfig: FlowPathConfig,
  setCurrentFlowName: (value: string) => void,
  setCurrentFlowDescription: (value: string) => void,
  setCurrentFlowRoleIds: (value: string[]) => void,
  setCurrentFlowPathConfig: (value: FlowPathConfig) => void,
  saveCurrentFlow: () => Promise<void>
) {
  if (!currentFlow) return null;
  return (
    <div className="form-grid">
      <label>
        流程名称
        <input value={currentFlowName} onChange={(event) => setCurrentFlowName(event.target.value)} />
      </label>
      <label>
        流程说明
        <textarea value={currentFlowDescription} onChange={(event) => setCurrentFlowDescription(event.target.value)} />
      </label>
      <label>
        参与角色
        <div className="tag-cloud compact">
          {rolesDraft.map((role) => {
            const active = currentFlowRoleIds.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => {
                  const next = new Set(currentFlowRoleIds);
                  if (next.has(role.id)) next.delete(role.id);
                  else next.add(role.id);
                  setCurrentFlowRoleIds(Array.from(next));
                }}
              >
                {role.name}
              </button>
            );
          })}
        </div>
      </label>
      <label>
        输入目录
        <input
          value={currentFlowPathConfig.inputRoot}
          onChange={(event) => setCurrentFlowPathConfig({ ...currentFlowPathConfig, inputRoot: event.target.value })}
        />
      </label>
      <label>
        输出目录
        <input
          value={currentFlowPathConfig.outputRoot}
          onChange={(event) => setCurrentFlowPathConfig({ ...currentFlowPathConfig, outputRoot: event.target.value })}
        />
      </label>
      <label className="full-span checkbox-row">
        <input
          type="checkbox"
          checked={currentFlowPathConfig.inheritProjectRoot}
          onChange={(event) => setCurrentFlowPathConfig({ ...currentFlowPathConfig, inheritProjectRoot: event.target.checked })}
        />
        <span>继承工程根目录，否则按绝对路径解析</span>
      </label>
      <button type="button" className="button-secondary" onClick={() => void saveCurrentFlow()}>保存流程元数据</button>
    </div>
  );
}

function NodeInspectorPanel(props: {
  selectedNode: PlatformFlowNode;
  selectedCanvasNode: FlowCanvasNode | null;
  currentFlowNodes: PlatformFlowNode[];
  rolesDraft: PlatformRole[];
  taskTemplatesDraft: TaskTemplate[];
  agentProfilesDraft: AgentProfile[];
  connectorsDraft: PlatformConnector[];
  toolsDraft: ControlledScriptTool[];
  subflows: PlatformFlowAsset[];
  installedSkills: InstalledSkill[];
  settings: AppSettings;
  templateArtifacts: TemplateArtifactItem[];
  rulesDistillation?: RulesDistillationSnapshot | null;
  currentFlow: PlatformFlowAsset | null;
  setNodes: Dispatch<SetStateAction<FlowCanvasNode[]>>;
  mutateCurrentFlowNode: (updater: (node: PlatformFlowNode) => PlatformFlowNode) => void;
  upsertBranchEdge: (sourceId: string, targetId: string | undefined, branch: PlatformFlowAsset['edges'][number]['branch'], fallbackLabel: string) => void;
  openSubflowEditor: (subflowId?: string) => void;
  startRoleCreator: (nodeId?: string) => void;
}) {
  const {
    selectedNode,
    selectedCanvasNode,
    currentFlowNodes,
    rolesDraft,
    taskTemplatesDraft,
    agentProfilesDraft,
    connectorsDraft,
    toolsDraft,
    subflows,
    installedSkills,
    settings,
    templateArtifacts,
    rulesDistillation,
    currentFlow,
    mutateCurrentFlowNode,
    openSubflowEditor,
    startRoleCreator,
    upsertBranchEdge
  } = props;
  const [activeTab, setActiveTab] = useState<'overview' | 'bindings' | 'contracts' | 'runtime'>('overview');

  useEffect(() => {
    setActiveTab('overview');
  }, [selectedNode.id]);

  const availableTargets = currentFlowNodes.filter((node) => node.id !== selectedNode.id && node.type !== 'start');
  const selectedRole = selectedNode.data.roleId ? rolesDraft.find((item) => item.id === selectedNode.data.roleId) ?? null : null;
  const selectedTaskTemplate = selectedNode.data.taskTemplateId ? taskTemplatesDraft.find((item) => item.id === selectedNode.data.taskTemplateId) ?? null : null;
  const selectedAgentProfile = selectedNode.data.agentProfileId ? agentProfilesDraft.find((item) => item.id === selectedNode.data.agentProfileId) ?? null : null;
  const selectedConnector = selectedNode.data.connectorId ? connectorsDraft.find((item) => item.id === selectedNode.data.connectorId) ?? null : null;
  const primaryTool = selectedNode.data.toolId ? toolsDraft.find((item) => item.id === selectedNode.data.toolId) ?? null : null;
  const selectedSubflow = selectedNode.data.subflowId ? subflows.find((item) => item.id === selectedNode.data.subflowId) ?? null : null;
  const roleState = roleBindingState(selectedRole);
  const connectorState = selectedNode.data.connectorId ? connectorBindingState(selectedConnector) : null;
  const primaryToolState = selectedNode.data.toolId ? toolBindingState(primaryTool, connectorsDraft) : null;
  const bindableConnectors = connectorsDraft.filter((item) => connectorBindingState(item).ready);
  const bindableTools = toolsDraft.filter((item) => toolBindingState(item, connectorsDraft).ready);
  const artifactSuggestions = templateArtifacts.map((artifact) => artifact.path);
  const messageSuggestions = useMemo(
    () => Array.from(new Set(currentFlowNodes.flatMap((node) => [
      ...(node.data.inputMessageKeys ?? []),
      ...(node.data.outputMessageKeys ?? [])
    ]))),
    [currentFlowNodes]
  );
  const signalSuggestions = useMemo(
    () => Array.from(new Set(currentFlowNodes.flatMap((node) => node.data.outputSignalKeys ?? []))),
    [currentFlowNodes]
  );
  const selectableRules = useMemo(() => {
    const snapshot = rulesDistillation;
    if (!snapshot) return [];
    return [
      ...snapshot.globalRules,
      ...snapshot.projectRules
    ];
  }, [rulesDistillation]);
  const effectiveRuleSet = useMemo(
    () => rulesDistillation
      ? resolveEffectiveRulesFromSnapshot(rulesDistillation, {
          flowId: currentFlow?.id,
          nodeId: selectedNode.id,
          boundRuleIds: selectedNode.data.ruleBindingIds
        })
      : null,
    [currentFlow?.id, rulesDistillation, selectedNode.data.ruleBindingIds, selectedNode.id]
  );
  const effectiveExecution = useMemo(() => {
    if (!selectedRole) {
      return null;
    }
    const { roleProfile, agentProfile: legacyAgentProfile } = migrateLegacyRoleToRoleProfile(selectedRole);
    const agentProfile = selectedAgentProfile ?? legacyAgentProfile;
    return assembleExecutionBundle({
      roleProfile,
      taskTemplate: selectedTaskTemplate ?? undefined,
      agentProfile,
      nodeOverrides: {
        skillIds: selectedNode.data.skillIds,
        connectorId: selectedNode.data.connectorId,
        toolId: selectedNode.data.toolId,
        toolIds: selectedNode.data.toolIds
      }
    });
  }, [selectedAgentProfile, selectedNode.data.connectorId, selectedNode.data.skillIds, selectedNode.data.toolId, selectedNode.data.toolIds, selectedRole, selectedTaskTemplate]);
  const effectiveModelPreview = useMemo(() => {
    if (!selectedRole || !effectiveExecution) {
      return resolveModelPolicyPreview(selectedRole, settings);
    }
    return resolveModelPolicyPreview({
      ...selectedRole,
      allowedSkillIds: effectiveExecution.effectiveSkillIds,
      allowedCapabilities: effectiveExecution.allowedCapabilities,
      modelPolicy: effectiveExecution.modelPolicy
    }, settings);
  }, [effectiveExecution, selectedRole, settings]);

  const updateNode = (patch: Partial<PlatformFlowNode['data']>) => {
    mutateCurrentFlowNode((node) => ({
      ...node,
      data: {
        ...node.data,
        ...patch
      }
    }));
  };

  type ListFieldKey =
    | 'skillIds'
    | 'ruleBindingIds'
    | 'toolIds'
    | 'inputArtifactPaths'
    | 'outputArtifactPaths'
    | 'inputMessageKeys'
    | 'outputMessageKeys'
    | 'outputSignalKeys';

  const updateList = (key: ListFieldKey, values: string[]) => {
    updateNode({ [key]: values } as Partial<PlatformFlowNode['data']>);
  };

  const toggleListValue = (key: ListFieldKey, value: string) => {
    mutateCurrentFlowNode((node) => {
      const current = new Set((node.data[key] ?? []) as string[]);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return {
        ...node,
        data: {
          ...node.data,
          [key]: Array.from(current)
        } as PlatformFlowNode['data']
      };
    });
  };

  const renderBindingChips = (
    key: ListFieldKey,
    options: Array<{ id: string; label: string; description?: string }>,
    emptyLabel: string
  ) => (
    <div className="node-config-toggle-grid">
      {options.length ? options.map((option) => {
        const active = ((selectedNode.data[key] ?? []) as string[]).includes(option.id);
        return (
          <button
            key={`${key}-${option.id}`}
            type="button"
            className={`node-config-toggle ${active ? 'active' : ''}`}
            onClick={() => toggleListValue(key, option.id)}
          >
            <strong>{option.label}</strong>
            {option.description ? <span>{option.description}</span> : null}
          </button>
        );
      }) : <span className="muted-inline">{emptyLabel}</span>}
    </div>
  );

  return (
    <div className="node-config-panel">
      <section className="node-config-hero">
        <div>
          <div className="section-kicker">{defaultNodeLabel(selectedNode.type)}</div>
          <strong>{selectedCanvasNode?.data.label ?? selectedNode.data.label}</strong>
          <p>{selectedNode.data.description || '当前节点还没有补充职责说明。'}</p>
        </div>
          <div className="node-config-summary-grid">
            <div className="node-config-summary-card">
              <span>角色</span>
              <strong>{selectedRole?.name ?? '未绑定'}</strong>
            </div>
            <div className="node-config-summary-card">
              <span>任务模板</span>
              <strong>{selectedTaskTemplate?.name ?? '未绑定'}</strong>
            </div>
            <div className="node-config-summary-card">
              <span>执行配置</span>
              <strong>{selectedAgentProfile?.name ?? '未绑定'}</strong>
            </div>
            <div className="node-config-summary-card">
              <span>连接/工具</span>
              <strong>{selectedConnector?.name ?? primaryTool?.name ?? '未绑定'}</strong>
            </div>
          </div>
      </section>

      <div className="segmented compact node-config-tabbar" role="tablist" aria-label="节点配置标签">
        {[
          ['overview', '概览'],
          ['bindings', '绑定'],
          ['contracts', '输入输出'],
          ['runtime', '运行语义']
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'active' : ''}
            onClick={() => setActiveTab(id as 'overview' | 'bindings' | 'contracts' | 'runtime')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <div className="node-config-stack">
          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>基础信息</strong>
                <p>先定义节点名称、说明和补充备注，再决定绑定和输入输出。</p>
              </div>
            </div>
            <div className="form-grid two-column">
              <label>
                节点标题
                <input value={selectedCanvasNode?.data.label ?? selectedNode.data.label} onChange={(event) => updateNode({ label: event.target.value })} />
              </label>
              <label>
                节点类型
                <input value={defaultNodeLabel(selectedNode.type)} readOnly />
              </label>
              <label className="full-span">
                节点说明
                <textarea value={selectedNode.data.description ?? ''} onChange={(event) => updateNode({ description: event.target.value })} />
              </label>
              <label className="full-span">
                节点备注
                <textarea value={selectedNode.data.notes ?? ''} onChange={(event) => updateNode({ notes: event.target.value })} />
              </label>
              {selectedNode.type === 'artifact' ? (
                <label className="full-span">
                  工件主路径
                  <input value={selectedNode.data.artifactPath ?? ''} onChange={(event) => updateNode({ artifactPath: event.target.value })} />
                </label>
              ) : null}
            </div>
          </section>

          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>当前生效结果</strong>
                <p>这里显示角色、模型和已绑定对象的最终结果，避免在多个区域反复确认。</p>
              </div>
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>模型预览</span>
                <strong>{effectiveModelPreview.profile?.name ?? '未命中模型配置'}</strong>
                <p>{effectiveModelPreview.profile ? `${effectiveModelPreview.profile.provider} / ${effectiveModelPreview.profile.model}` : '当前没有可用的 provider profile。'}</p>
              </div>
              <div className="node-config-meta">
                <span>主工具</span>
                <strong>{primaryTool?.name ?? '未绑定'}</strong>
                <p>{primaryTool?.description || '当前节点还没有主工具。'}</p>
              </div>
              <div className="node-config-meta">
                <span>子流程</span>
                <strong>{selectedSubflow?.name ?? '未绑定'}</strong>
                <p>{selectedSubflow?.description || '当前节点不是子流程卡片，或尚未指定子流程来源。'}</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'bindings' ? (
        <div className="node-config-stack">
          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>工作流绑定</strong>
                <p>在节点层显式选择角色、任务模板和执行配置，再由运行时装配出最终 execution bundle。</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => startRoleCreator(selectedNode.id)}>创建新角色</button>
            </div>
            <div className="form-grid two-column">
              <label>
                角色绑定
                <select value={selectedNode.data.roleId ?? ''} onChange={(event) => updateNode({ roleId: event.target.value || undefined })}>
                  <option value="">未绑定</option>
                  {rolesDraft.map((role) => {
                    const state = roleBindingState(role);
                    return <option key={role.id} value={role.id}>{`${role.name}${state.ready ? '' : ' · 不可用'}`}</option>;
                  })}
                </select>
              </label>
              <label>
                任务模板
                <select value={selectedNode.data.taskTemplateId ?? ''} onChange={(event) => updateNode({ taskTemplateId: event.target.value || undefined })}>
                  <option value="">未绑定</option>
                  {taskTemplatesDraft.map((taskTemplate) => (
                    <option key={taskTemplate.id} value={taskTemplate.id}>{taskTemplate.name}</option>
                  ))}
                </select>
              </label>
              <label>
                执行配置
                <select value={selectedNode.data.agentProfileId ?? ''} onChange={(event) => updateNode({ agentProfileId: event.target.value || undefined })}>
                  <option value="">未绑定</option>
                  {agentProfilesDraft.map((agentProfile) => (
                    <option key={agentProfile.id} value={agentProfile.id}>{agentProfile.name}</option>
                  ))}
                </select>
              </label>
              <div className="node-config-meta inline-card">
                <span>生效模型</span>
                <strong>{effectiveModelPreview.profile?.name ?? '未命中'}</strong>
                <p>{effectiveModelPreview.reason}</p>
              </div>
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>角色包状态</span>
                <strong>{selectedRole ? summarizeBindingHealth(selectedRole.packageHealth) : '未绑定'}</strong>
                <p>{roleState.reason ?? selectedRole?.packageIssueMessage ?? '角色包可用。'}</p>
              </div>
              <div className="node-config-meta">
                <span>绑定闭合度</span>
                <strong>{[selectedRole, selectedTaskTemplate, selectedAgentProfile].filter(Boolean).length}/3</strong>
                <p>{selectedTaskTemplate && selectedAgentProfile ? '节点绑定已具备 role / task / agent 三层。' : '当前仍有 execution binding 未补齐。'}</p>
              </div>
            </div>
          </section>

          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>Execution Summary</strong>
                <p>这里显示当前节点最终会生效的技能、能力和模型策略来源。</p>
              </div>
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>Skills</span>
                <strong>{effectiveExecution?.effectiveSkillIds.length ?? 0}</strong>
                <p>{effectiveExecution?.effectiveSkillIds.length ? effectiveExecution.effectiveSkillIds.join(', ') : '当前没有生效 skill。'}</p>
              </div>
              <div className="node-config-meta">
                <span>Capabilities</span>
                <strong>{effectiveExecution?.allowedCapabilities.length ?? 0}</strong>
                <p>{effectiveExecution?.allowedCapabilities.length ? effectiveExecution.allowedCapabilities.join(', ') : '当前没有生效 capability。'}</p>
              </div>
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>Skill 来源</span>
                <strong>{effectiveExecution?.sourceMap.skillIds ?? '未解析'}</strong>
                <p>node 表示节点覆盖，task 表示任务模板推荐，agent 表示执行配置默认。</p>
              </div>
              <div className="node-config-meta">
                <span>Capability 来源</span>
                <strong>{effectiveExecution?.sourceMap.capabilities ?? '未解析'}</strong>
                <p>task 表示任务要求，agent 表示执行配置策略。</p>
              </div>
              <div className="node-config-meta">
                <span>模型策略来源</span>
                <strong>{effectiveExecution?.sourceMap.modelPolicy ?? '未解析'}</strong>
                <p>{selectedAgentProfile ? `当前由执行配置“${selectedAgentProfile.name}”主导模型策略。` : '当前回退到角色默认执行配置。'}</p>
              </div>
            </div>
          </section>

          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>Skill 与工具</strong>
                <p>支持在节点级覆盖角色默认 skill，并补充当前节点可用的工具集。</p>
              </div>
            </div>
            <div className="node-config-section">
              <div className="section-kicker">节点 Skill 覆盖</div>
              {renderBindingChips(
                'skillIds',
                installedSkills.map((skill) => ({
                  id: skill.id,
                  label: skill.name,
                  description: skill.description
                })),
                '当前没有可用 skill。'
              )}
            </div>
            <div className="form-grid two-column">
              <label>
                主工具
                <select value={selectedNode.data.toolId ?? ''} onChange={(event) => updateNode({ toolId: event.target.value || undefined })}>
                  <option value="">未绑定</option>
                  {[
                    ...bindableTools,
                    ...(
                      selectedNode.data.toolId && !bindableTools.some((item) => item.id === selectedNode.data.toolId)
                        ? toolsDraft.filter((item) => item.id === selectedNode.data.toolId)
                        : []
                    )
                  ].map((tool) => {
                    const state = toolBindingState(tool, connectorsDraft);
                    return <option key={tool.id} value={tool.id}>{`${tool.name}${state.ready ? '' : ' · 不可用'}`}</option>;
                  })}
                </select>
              </label>
              <label>
                连接器
                <select value={selectedNode.data.connectorId ?? ''} onChange={(event) => updateNode({ connectorId: event.target.value || undefined })}>
                  <option value="">未绑定</option>
                  {[
                    ...bindableConnectors,
                    ...(
                      selectedNode.data.connectorId && !bindableConnectors.some((item) => item.id === selectedNode.data.connectorId)
                        ? connectorsDraft.filter((item) => item.id === selectedNode.data.connectorId)
                        : []
                    )
                  ].map((connector) => {
                    const state = connectorBindingState(connector);
                    return <option key={connector.id} value={connector.id}>{`${connector.name}${state.ready ? '' : ' · 不可用'}`}</option>;
                  })}
                </select>
              </label>
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>连接诊断</span>
                <strong>{selectedConnector ? summarizeBindingHealth(selectedConnector.health) : '未绑定'}</strong>
                <p>{connectorState?.reason ?? selectedConnector?.diagnostic?.summary ?? '当前节点未绑定连接。'}</p>
              </div>
              <div className="node-config-meta">
                <span>工具诊断</span>
                <strong>{primaryTool ? summarizeBindingHealth(primaryTool.health) : '未绑定'}</strong>
                <p>{primaryToolState?.reason ?? primaryTool?.diagnostic?.summary ?? '当前节点未绑定主工具。'}</p>
              </div>
            </div>
            <div className="node-config-section">
              <div className="section-kicker">可用工具集</div>
              {renderBindingChips(
                'toolIds',
                toolsDraft.map((tool) => ({
                  id: tool.id,
                  label: tool.name,
                  description: tool.command
                })),
                '当前没有可用工具。'
              )}
            </div>
          </section>

          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>规则绑定与冲突</strong>
                <p>全局/工程规则可在这里按节点绑定，节点规则会按节点自动参与解析。</p>
              </div>
            </div>
            <div className="node-config-section">
              <div className="section-kicker">可绑定规则</div>
              {renderBindingChips(
                'ruleBindingIds',
                selectableRules.map((rule) => ({
                  id: rule.id,
                  label: rule.name,
                  description: `${rule.scope}${rule.targetKey ? ` / ${rule.targetKey}` : ''}`
                })),
                '当前没有可用规则。'
              )}
            </div>
            <div className="node-config-meta-grid">
              <div className="node-config-meta">
                <span>生效规则</span>
                <strong>{effectiveRuleSet?.rules.length ?? 0}</strong>
                <p>{effectiveRuleSet?.rules.map((rule) => rule.name).join(' / ') || '当前节点还没有生效规则。'}</p>
              </div>
              <div className="node-config-meta">
                <span>冲突提示</span>
                <strong>{effectiveRuleSet?.conflicts.length ?? 0}</strong>
                <p>{effectiveRuleSet?.conflicts[0]?.message ?? '当前没有规则冲突。'}</p>
              </div>
            </div>
            {effectiveRuleSet?.overrides.length ? (
              <div className="asset-list">
                {effectiveRuleSet.overrides.map((item) => (
                  <div key={item.targetKey} className="asset-list-item">
                    <strong>{item.targetKey}</strong>
                    <span className="muted-line">{item.reason}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {selectedNode.type === 'subflow' ? (
            <>
              <section className="node-config-card">
                <div className="node-config-card-head">
                  <div>
                    <strong>子流程来源</strong>
                    <p>子流程卡片可以绑定已有子流程，也可以直接跳入继续编辑。</p>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => openSubflowEditor(selectedNode.data.subflowId)} disabled={!selectedNode.data.subflowId}>
                    进入子流程编辑
                  </button>
                </div>
                <label>
                  子流程绑定
                  <select value={selectedNode.data.subflowId ?? ''} onChange={(event) => updateNode({ subflowId: event.target.value || undefined })}>
                    <option value="">未绑定</option>
                    {subflows.map((subflow) => <option key={subflow.id} value={subflow.id}>{subflow.name}</option>)}
                  </select>
                </label>
              </section>
              <NodeTokenEditor
                title="子流程输入映射"
                hint="使用 source=>target 形式，把父流程工件或消息映射到子流程。"
                values={selectedNode.data.subflowInputBindings ?? []}
                suggestions={artifactSuggestions.map((path) => `${path}=>${path}`)}
                placeholder="例如 input/brief.md=>draft/brief.md"
                onChange={(values) => updateNode({ subflowInputBindings: values })}
                emptyLabel="当前未声明输入映射"
              />
              <NodeTokenEditor
                title="子流程输出回写"
                hint="使用 child=>parent 形式，把子流程输出回写到父流程工件。"
                values={selectedNode.data.subflowOutputBindings ?? []}
                suggestions={artifactSuggestions.map((path) => `${path}=>${path}`)}
                placeholder="例如 draft/result.md=>output/result.md"
                onChange={(values) => updateNode({ subflowOutputBindings: values })}
                emptyLabel="当前未声明输出回写"
              />
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'contracts' ? (
        <div className="node-config-stack">
          <NodeTokenEditor
            title="输入工件"
            hint="从模板工件目录选择，或手动补充自定义路径。"
            values={selectedNode.data.inputArtifactPaths ?? []}
            suggestions={artifactSuggestions}
            placeholder="输入工件路径，按 Enter 添加"
            onChange={(values) => updateList('inputArtifactPaths', values)}
            emptyLabel="当前未声明输入工件"
          />
          <NodeTokenEditor
            title="输出工件"
            hint="输出工件不再硬编码，直接在节点上声明。"
            values={selectedNode.data.outputArtifactPaths ?? []}
            suggestions={artifactSuggestions}
            placeholder="输出工件路径，按 Enter 添加"
            onChange={(values) => updateList('outputArtifactPaths', values)}
            emptyLabel="当前未声明输出工件"
          />
          <NodeTokenEditor
            title="输入消息"
            hint="声明该节点依赖的上游消息键。"
            values={selectedNode.data.inputMessageKeys ?? []}
            suggestions={messageSuggestions}
            placeholder="消息键，例如 plan_brief"
            onChange={(values) => updateList('inputMessageKeys', values)}
            emptyLabel="当前未声明输入消息"
          />
          <NodeTokenEditor
            title="输出消息"
            hint="声明该节点向下游广播的消息键。"
            values={selectedNode.data.outputMessageKeys ?? []}
            suggestions={messageSuggestions}
            placeholder="消息键，例如 review_feedback"
            onChange={(values) => updateList('outputMessageKeys', values)}
            emptyLabel="当前未声明输出消息"
          />
          <NodeTokenEditor
            title="输出控制信号"
            hint="用于并行、裁决或流程调度。"
            values={selectedNode.data.outputSignalKeys ?? []}
            suggestions={signalSuggestions}
            placeholder="信号键，例如 continue_review"
            onChange={(values) => updateList('outputSignalKeys', values)}
            emptyLabel="当前未声明输出控制信号"
          />
          <section className="node-config-card">
            <div className="node-config-card-head">
              <div>
                <strong>契约要求</strong>
                <p>把格式、必填要求和输出约束收进节点本身，而不是藏在固定文案里。</p>
              </div>
            </div>
            <div className="form-grid two-column">
              <label>
                输出格式
                <select value={selectedNode.data.outputFormat ?? 'markdown'} onChange={(event) => updateNode({ outputFormat: event.target.value as PlatformFlowNode['data']['outputFormat'] })}>
                  <option value="markdown">Markdown</option>
                  <option value="json">JSON</option>
                  <option value="text">Text</option>
                  <option value="table">Table</option>
                </select>
              </label>
              <div className="node-config-meta inline-card">
                <span>可选模板工件</span>
                <strong>{templateArtifacts.length} 项</strong>
                <p>{templateArtifacts.length ? templateArtifacts.map((artifact) => artifact.title).slice(0, 4).join(' / ') : '当前模板还没有声明工件目录。'}</p>
              </div>
              <label className="full-span">
                输入要求
                <textarea value={selectedNode.data.inputRequirement ?? ''} onChange={(event) => updateNode({ inputRequirement: event.target.value })} />
              </label>
              <label className="full-span">
                输出要求
                <textarea value={selectedNode.data.outputRequirement ?? ''} onChange={(event) => updateNode({ outputRequirement: event.target.value })} />
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'runtime' ? (
        <div className="node-config-stack">
          {selectedNode.type === 'condition' ? (
            <section className="node-config-card">
              <div className="node-config-card-head">
                <div>
                  <strong>条件分支</strong>
                  <p>配置条件表达式，以及 true / false 分支要去往的目标节点。</p>
                </div>
              </div>
              <div className="form-grid two-column">
                <label className="full-span">
                  条件表达式
                  <textarea value={selectedNode.data.conditionExpression ?? ''} onChange={(event) => updateNode({ conditionExpression: event.target.value })} />
                </label>
                <label>
                  True 分支
                  <select
                    value={selectedNode.data.trueTargetId ?? ''}
                    onChange={(event) => {
                      const nextTargetId = event.target.value || undefined;
                      updateNode({ trueTargetId: nextTargetId });
                      upsertBranchEdge(selectedNode.id, nextTargetId, 'true', '是');
                    }}
                  >
                    <option value="">未设置</option>
                    {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
                  </select>
                </label>
                <label>
                  False 分支
                  <select
                    value={selectedNode.data.falseTargetId ?? ''}
                    onChange={(event) => {
                      const nextTargetId = event.target.value || undefined;
                      updateNode({ falseTargetId: nextTargetId });
                      upsertBranchEdge(selectedNode.id, nextTargetId, 'false', '否');
                    }}
                  >
                    <option value="">未设置</option>
                    {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {selectedNode.type === 'loop' ? (
            <section className="node-config-card">
              <div className="node-config-card-head">
                <div>
                  <strong>循环语义</strong>
                  <p>定义循环条件、退出条件和回边目标，避免图上只能看见形状却看不见语义。</p>
                </div>
              </div>
              <div className="form-grid two-column">
                <label className="full-span">
                  循环条件
                  <textarea value={selectedNode.data.loopExpression ?? ''} onChange={(event) => updateNode({ loopExpression: event.target.value })} />
                </label>
                <label className="full-span">
                  退出条件
                  <textarea value={selectedNode.data.exitExpression ?? ''} onChange={(event) => updateNode({ exitExpression: event.target.value })} />
                </label>
                <label>
                  最大轮次
                  <input type="number" min={1} value={selectedNode.data.maxIterations ?? 3} onChange={(event) => updateNode({ maxIterations: Number(event.target.value) || 1 })} />
                </label>
                <label>
                  超时毫秒
                  <input
                    type="number"
                    min={1}
                    value={selectedNode.data.loopTimeoutMs ?? ''}
                    onChange={(event) => updateNode({ loopTimeoutMs: event.target.value ? Number(event.target.value) || undefined : undefined })}
                    placeholder="留空表示不限制"
                  />
                </label>
                <label>
                  守卫失败策略
                  <select value={selectedNode.data.loopFailurePolicy ?? 'guard_fail'} onChange={(event) => updateNode({ loopFailurePolicy: event.target.value as PlatformFlowNode['data']['loopFailurePolicy'] })}>
                    <option value="guard_fail">阻断并报错</option>
                    <option value="continue_to_exit">转到退出路径</option>
                    <option value="manual_review">进入人工复核</option>
                  </select>
                </label>
                <label>
                  回边目标
                  <select
                    value={selectedNode.data.loopBackTargetId ?? ''}
                    onChange={(event) => {
                      const nextTargetId = event.target.value || undefined;
                      updateNode({ loopBackTargetId: nextTargetId });
                      upsertBranchEdge(selectedNode.id, nextTargetId, 'loop', '循环');
                    }}
                  >
                    <option value="">未设置</option>
                    {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
                  </select>
                </label>
                <label>
                  退出目标
                  <select
                    value={selectedNode.data.exitTargetId ?? ''}
                    onChange={(event) => {
                      const nextTargetId = event.target.value || undefined;
                      updateNode({ exitTargetId: nextTargetId });
                      upsertBranchEdge(selectedNode.id, nextTargetId, 'exit', '退出');
                    }}
                  >
                    <option value="">未设置</option>
                    {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {selectedNode.type === 'parallel_split' ? (
            <section className="node-config-card">
              <div className="node-config-card-head">
                <div>
                  <strong>并行分叉</strong>
                  <p>定义并行模式、失败策略和共享工件板。</p>
                </div>
              </div>
              <div className="form-grid two-column">
                <label>
                  并行模式
                  <select value={selectedNode.data.parallelMode ?? 'fanout'} onChange={(event) => updateNode({ parallelMode: event.target.value as PlatformFlowNode['data']['parallelMode'] })}>
                    <option value="fanout">独立分叉</option>
                    <option value="review">评审协作</option>
                    <option value="research">分工调研</option>
                  </select>
                </label>
                <label>
                  失败策略
                  <select value={selectedNode.data.parallelFailureStrategy ?? 'manual_review'} onChange={(event) => updateNode({ parallelFailureStrategy: event.target.value as PlatformFlowNode['data']['parallelFailureStrategy'] })}>
                    <option value="fail_fast">任一路失败立即中止</option>
                    <option value="continue">继续执行其他支路</option>
                    <option value="manual_review">进入人工复核</option>
                  </select>
                </label>
                <label>
                  取消策略
                  <select value={selectedNode.data.parallelCancellationPolicy ?? 'wait_all'} onChange={(event) => updateNode({ parallelCancellationPolicy: event.target.value as PlatformFlowNode['data']['parallelCancellationPolicy'] })}>
                    <option value="wait_all">等待全部分支</option>
                    <option value="cancel_pending">首个满足后取消剩余</option>
                    <option value="preserve_completed">保留已完成并跳过未开始</option>
                  </select>
                </label>
                <label className="full-span">
                  共享工件板
                  <select value={selectedNode.data.sharedBoardArtifactPath ?? ''} onChange={(event) => updateNode({ sharedBoardArtifactPath: event.target.value || undefined })}>
                    <option value="">未设置</option>
                    {templateArtifacts.map((artifact) => <option key={`shared-${artifact.id}`} value={artifact.path}>{artifact.title}</option>)}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {selectedNode.type === 'parallel_join' ? (
            <section className="node-config-card">
              <div className="node-config-card-head">
                <div>
                  <strong>并行汇合</strong>
                  <p>定义支路结果如何汇合，避免运行时语义不明确。</p>
                </div>
              </div>
              <label>
                汇合策略
                <select value={selectedNode.data.mergeStrategy ?? 'collect_all'} onChange={(event) => updateNode({ mergeStrategy: event.target.value as PlatformFlowNode['data']['mergeStrategy'] })}>
                  <option value="collect_all">收集全部结果</option>
                  <option value="first_success">首个成功即可</option>
                  <option value="judge">裁决合并</option>
                  <option value="manual_merge">人工合并</option>
                </select>
              </label>
            </section>
          ) : null}

          {!['condition', 'loop', 'parallel_split', 'parallel_join'].includes(selectedNode.type) ? (
            <section className="node-config-card">
              <div className="node-config-card-head">
                <div>
                  <strong>运行说明</strong>
                  <p>当前节点没有额外的控制语义，运行表现主要由绑定角色、工件契约和连接线决定。</p>
                </div>
              </div>
              <div className="node-config-meta-grid single">
                <div className="node-config-meta">
                  <span>当前类型</span>
                  <strong>{defaultNodeLabel(selectedNode.type)}</strong>
                  <p>如需复杂分支、循环或并行，请改用专门的控制节点。</p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function renderNodeInspector(
  selectedNode: PlatformFlowNode,
  selectedCanvasNode: FlowCanvasNode | null,
  currentFlowNodes: PlatformFlowNode[],
  rolesDraft: PlatformRole[],
  connectorsDraft: PlatformConnector[],
  toolsDraft: ControlledScriptTool[],
  subflows: PlatformFlowAsset[],
  modelPreview: ReturnType<typeof resolveModelPolicyPreview>,
  templateArtifacts: TemplateArtifactItem[],
  setNodes: Dispatch<SetStateAction<FlowCanvasNode[]>>,
  mutateCurrentFlowNode: (updater: (node: PlatformFlowNode) => PlatformFlowNode) => void,
  upsertBranchEdge: (sourceId: string, targetId: string | undefined, branch: PlatformFlowAsset['edges'][number]['branch'], fallbackLabel: string) => void,
  openSubflowEditor: (subflowId?: string) => void,
  startRoleCreator: (nodeId?: string) => void
) {
  const availableTargets = currentFlowNodes.filter((node) => node.id !== selectedNode.id && node.type !== 'start');
  return (
    <div className="form-grid">
      <label>
        节点标题
        <input value={selectedCanvasNode?.data.label ?? selectedNode.data.label} onChange={(event) => setNodes((current) => current.map((item) => item.id === selectedNode.id ? { ...item, data: { ...item.data, label: event.target.value } } : item))} />
      </label>
      {selectedNode.type === 'agent' ? (
        <>
          <label>
            角色
            <select value={selectedNode.data.roleId ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, roleId: event.target.value || undefined } }))}>
              <option value="">未绑定</option>
              {rolesDraft.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <div className="button-row">
            <button type="button" className="button-secondary" onClick={() => startRoleCreator(selectedNode.id)}>创建新角色</button>
          </div>
          <div className="inspector-card">
            <div className="section-kicker">模型预览</div>
            <strong>{modelPreview.profile?.name ?? '未命中配置'}</strong>
            <div className="muted-line">{modelPreview.profile ? `${modelPreview.profile.provider} / ${modelPreview.profile.model}` : '没有可用的 Provider profile。'}</div>
            <p>{modelPreview.reason}</p>
          </div>
        </>
      ) : null}
      {selectedNode.type === 'tool' ? (
        <>
          <label>
            绑定连接
            <select value={selectedNode.data.connectorId ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, connectorId: event.target.value || undefined } }))}>
              <option value="">未绑定</option>
              {connectorsDraft.map((connector) => <option key={connector.id} value={connector.id}>{connector.name}</option>)}
            </select>
          </label>
          <label>
            绑定工具
            <select value={selectedNode.data.toolId ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, toolId: event.target.value || undefined } }))}>
              <option value="">未绑定</option>
              {toolsDraft.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {selectedNode.type === 'subflow' ? (
        <>
          <label>
            子流程
            <select value={selectedNode.data.subflowId ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, subflowId: event.target.value || undefined } }))}>
              <option value="">未绑定</option>
              {subflows.map((subflow) => <option key={subflow.id} value={subflow.id}>{subflow.name}</option>)}
            </select>
          </label>
          <button type="button" className="button-secondary" onClick={() => openSubflowEditor(selectedNode.data.subflowId)} disabled={!selectedNode.data.subflowId}>进入子流程编辑</button>
          <label>
            输入映射
            <textarea
              value={(selectedNode.data.subflowInputBindings ?? []).join('\n')}
              onChange={(event) => mutateCurrentFlowNode((node) => ({
                ...node,
                data: {
                  ...node.data,
                  subflowInputBindings: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
                }
              }))}
              placeholder="source=>target，每行一条"
            />
          </label>
          <label>
            输出回写
            <textarea
              value={(selectedNode.data.subflowOutputBindings ?? []).join('\n')}
              onChange={(event) => mutateCurrentFlowNode((node) => ({
                ...node,
                data: {
                  ...node.data,
                  subflowOutputBindings: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
                }
              }))}
              placeholder="child=>parent，每行一条"
            />
          </label>
        </>
      ) : null}
      {selectedNode.type === 'artifact' ? (
        <label>
          工件路径
          <input value={selectedNode.data.artifactPath ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, artifactPath: event.target.value } }))} />
        </label>
      ) : null}
      {selectedNode.type === 'condition' ? (
        <>
          <label>
            条件表达式
            <textarea value={selectedNode.data.conditionExpression ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, conditionExpression: event.target.value } }))} />
          </label>
          <label>
            “是”分支目标
            <select
              value={selectedNode.data.trueTargetId ?? ''}
              onChange={(event) => {
                const nextTargetId = event.target.value || undefined;
                mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, trueTargetId: nextTargetId } }));
                upsertBranchEdge(selectedNode.id, nextTargetId, 'true', '是');
              }}
            >
              <option value="">未设置</option>
              {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
            </select>
          </label>
          <label>
            “否”分支目标
            <select
              value={selectedNode.data.falseTargetId ?? ''}
              onChange={(event) => {
                const nextTargetId = event.target.value || undefined;
                mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, falseTargetId: nextTargetId } }));
                upsertBranchEdge(selectedNode.id, nextTargetId, 'false', '否');
              }}
            >
              <option value="">未设置</option>
              {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {selectedNode.type === 'loop' ? (
        <>
          <label>
            循环条件
            <textarea value={selectedNode.data.loopExpression ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, loopExpression: event.target.value } }))} />
          </label>
          <label>
            退出条件
            <textarea value={selectedNode.data.exitExpression ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, exitExpression: event.target.value } }))} />
          </label>
          <label>
            最大轮次
            <input type="number" min={1} value={selectedNode.data.maxIterations ?? 3} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, maxIterations: Number(event.target.value) || 1 } }))} />
          </label>
          <label>
            超时毫秒
            <input
              type="number"
              min={1}
              value={selectedNode.data.loopTimeoutMs ?? ''}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, loopTimeoutMs: event.target.value ? Number(event.target.value) || undefined : undefined } }))}
              placeholder="留空表示不限制"
            />
          </label>
          <label>
            守卫失败策略
            <select
              value={selectedNode.data.loopFailurePolicy ?? 'guard_fail'}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, loopFailurePolicy: event.target.value as PlatformFlowNode['data']['loopFailurePolicy'] } }))}
            >
              <option value="guard_fail">阻断并报错</option>
              <option value="continue_to_exit">转到退出路径</option>
              <option value="manual_review">进入人工复核</option>
            </select>
          </label>
          <label>
            循环回边目标
            <select
              value={selectedNode.data.loopBackTargetId ?? ''}
              onChange={(event) => {
                const nextTargetId = event.target.value || undefined;
                mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, loopBackTargetId: nextTargetId } }));
                upsertBranchEdge(selectedNode.id, nextTargetId, 'loop', '循环');
              }}
            >
              <option value="">未设置</option>
              {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
            </select>
          </label>
          <label>
            退出目标
            <select
              value={selectedNode.data.exitTargetId ?? ''}
              onChange={(event) => {
                const nextTargetId = event.target.value || undefined;
                mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, exitTargetId: nextTargetId } }));
                upsertBranchEdge(selectedNode.id, nextTargetId, 'exit', '退出');
              }}
            >
              <option value="">未设置</option>
              {availableTargets.map((node) => <option key={node.id} value={node.id}>{node.data.label}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {selectedNode.type === 'parallel_split' ? (
        <>
          <label>
            并行模式
            <select
              value={selectedNode.data.parallelMode ?? 'fanout'}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, parallelMode: event.target.value as PlatformFlowNode['data']['parallelMode'] } }))}
            >
              <option value="fanout">独立分叉</option>
              <option value="review">评审协作</option>
              <option value="research">分工调研</option>
            </select>
          </label>
          <label>
            失败策略
            <select
              value={selectedNode.data.parallelFailureStrategy ?? 'manual_review'}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, parallelFailureStrategy: event.target.value as PlatformFlowNode['data']['parallelFailureStrategy'] } }))}
            >
              <option value="fail_fast">任一失败立即中止</option>
              <option value="continue">继续执行其它支路</option>
              <option value="manual_review">进入人工复核</option>
            </select>
          </label>
          <label>
            取消策略
            <select
              value={selectedNode.data.parallelCancellationPolicy ?? 'wait_all'}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, parallelCancellationPolicy: event.target.value as PlatformFlowNode['data']['parallelCancellationPolicy'] } }))}
            >
              <option value="wait_all">等待全部分支</option>
              <option value="cancel_pending">首个满足后取消剩余</option>
              <option value="preserve_completed">保留已完成并跳过未开始</option>
            </select>
          </label>
          <label>
            共享工件板
            <select
              value={selectedNode.data.sharedBoardArtifactPath ?? ''}
              onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, sharedBoardArtifactPath: event.target.value || undefined } }))}
            >
              <option value="">未设置</option>
              {templateArtifacts.map((artifact) => <option key={`shared-${artifact.id}`} value={artifact.path}>{artifact.title}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {selectedNode.type === 'parallel_join' ? (
        <label>
          汇合策略
          <select
            value={selectedNode.data.mergeStrategy ?? 'collect_all'}
            onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, mergeStrategy: event.target.value as PlatformFlowNode['data']['mergeStrategy'] } }))}
          >
            <option value="collect_all">收集全部结果</option>
            <option value="first_success">首个成功即可</option>
            <option value="judge">裁判合并</option>
            <option value="manual_merge">人工合并</option>
          </select>
        </label>
      ) : null}
      <label>
        节点说明
        <textarea value={selectedNode.data.description ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, description: event.target.value } }))} />
      </label>
      <label>
        节点备注
        <textarea value={selectedNode.data.notes ?? ''} onChange={(event) => mutateCurrentFlowNode((node) => ({ ...node, data: { ...node.data, notes: event.target.value } }))} />
      </label>
      <div>
        <div className="section-kicker">读取工件</div>
        <div className="tag-cloud compact">
          {templateArtifacts.length ? templateArtifacts.map((artifact) => {
            const active = selectedNode.data.inputArtifactPaths?.includes(artifact.path) ?? false;
            return (
              <button
                key={`in-${artifact.id}`}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => mutateCurrentFlowNode((node) => {
                  const current = new Set(node.data.inputArtifactPaths ?? []);
                  if (current.has(artifact.path)) current.delete(artifact.path);
                  else current.add(artifact.path);
                  return { ...node, data: { ...node.data, inputArtifactPaths: Array.from(current) } };
                })}
              >
                {artifact.title}
              </button>
            );
          }) : <span className="muted-inline">当前模板没有可绑定工件。</span>}
        </div>
      </div>
      <div>
        <div className="section-kicker">写入工件</div>
        <div className="tag-cloud compact">
          {templateArtifacts.length ? templateArtifacts.map((artifact) => {
            const active = selectedNode.data.outputArtifactPaths?.includes(artifact.path) ?? false;
            return (
              <button
                key={`out-${artifact.id}`}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => mutateCurrentFlowNode((node) => {
                  const current = new Set(node.data.outputArtifactPaths ?? []);
                  if (current.has(artifact.path)) current.delete(artifact.path);
                  else current.add(artifact.path);
                  return { ...node, data: { ...node.data, outputArtifactPaths: Array.from(current) } };
                })}
              >
                {artifact.title}
              </button>
            );
          }) : <span className="muted-inline">当前模板没有可绑定工件。</span>}
        </div>
      </div>
    </div>
  );
}

function renderRoleInspector(selectedRole: PlatformRole, rolesDraft: PlatformRole[], _installedSkills: InstalledSkill[], _settings: AppSettings, saveRoleDrafts: (roles: PlatformRole[]) => Promise<void>) {
  const update = (patch: Partial<PlatformRole>) =>
    saveRoleDrafts(rolesDraft.map((item) => {
      if (item.id !== selectedRole.id) return item;
      const nextRole: PlatformRole = {
        ...item,
        ...patch,
        packageSections: {
          identity: patch.packageSections?.identity ?? item.packageSections?.identity ?? '',
          soul: patch.packageSections?.soul ?? item.packageSections?.soul ?? '',
          agents: patch.packageSections?.agents ?? item.packageSections?.agents ?? '',
          user: patch.packageSections?.user ?? item.packageSections?.user ?? '',
          memory: patch.packageSections?.memory ?? item.packageSections?.memory ?? ''
        }
      };
      nextRole.promptHint = [nextRole.packageSections?.identity ?? '', nextRole.packageSections?.soul ?? '', nextRole.packageSections?.agents ?? '']
        .filter(Boolean)
        .join('\n\n');
      nextRole.packageStatus = rolePackageStatusForSections(nextRole);
      return nextRole;
    }));
  return (
    <div className="form-grid">
      <label>
        名称
        <input value={selectedRole.name} onChange={(event) => void update({ name: event.target.value })} />
      </label>
      <label>
        专注领域
        <input value={selectedRole.domain ?? ''} onChange={(event) => void update({ domain: event.target.value })} />
      </label>
      <label>
        描述
        <textarea value={selectedRole.description} onChange={(event) => void update({ description: event.target.value })} />
      </label>
      <div className="inspector-card">
        <div className="section-kicker">角色包状态</div>
        <strong>{selectedRole.packageStatus === 'complete' ? '完整' : '未完成'}</strong>
        <div className="muted-line">IDENTITY 和 AGENTS 为必填；SOUL / USER 允许先为空草稿。</div>
      </div>
      <label className="full-span">
        IDENTITY
        <textarea value={selectedRole.packageSections?.identity ?? ''} onChange={(event) => void update({ packageSections: { ...(selectedRole.packageSections ?? { identity: '', soul: '', agents: '', user: '', memory: '' }), identity: event.target.value } })} />
      </label>
      <label className="full-span">
        SOUL
        <textarea value={selectedRole.packageSections?.soul ?? ''} onChange={(event) => void update({ packageSections: { ...(selectedRole.packageSections ?? { identity: '', soul: '', agents: '', user: '', memory: '' }), soul: event.target.value } })} />
      </label>
      <label className="full-span">
        AGENTS
        <textarea value={selectedRole.packageSections?.agents ?? ''} onChange={(event) => void update({ packageSections: { ...(selectedRole.packageSections ?? { identity: '', soul: '', agents: '', user: '', memory: '' }), agents: event.target.value } })} />
      </label>
      <label className="full-span">
        USER
        <textarea value={selectedRole.packageSections?.user ?? ''} onChange={(event) => void update({ packageSections: { ...(selectedRole.packageSections ?? { identity: '', soul: '', agents: '', user: '', memory: '' }), user: event.target.value } })} />
      </label>
      <label className="full-span">
        MEMORY
        <textarea value={selectedRole.packageSections?.memory ?? ''} onChange={(event) => void update({ packageSections: { ...(selectedRole.packageSections ?? { identity: '', soul: '', agents: '', user: '', memory: '' }), memory: event.target.value } })} />
      </label>
      <div className="inspector-card full-span">
        <div className="section-kicker">依赖摘要</div>
        <strong>{selectedRole.packageDiagnostics?.length ? `${selectedRole.packageDiagnostics.length} 条诊断` : '当前没有依赖诊断'}</strong>
        <div className="muted-line">角色默认 skill 与模型策略已迁出角色编辑器，改由依赖安装、任务模板和执行配置共同决定。</div>
        {selectedRole.packageDiagnostics?.length ? (
          <div className="asset-list">
            {selectedRole.packageDiagnostics.slice(0, 4).map((diagnostic) => (
              <div key={`${selectedRole.id}-${diagnostic.code}-${diagnostic.message}`} className="asset-list-item">
                <strong>{diagnostic.severity === 'error' ? '错误' : '提示'}</strong>
                <span className="muted-line">{diagnostic.message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="button-danger" onClick={() => void saveRoleDrafts(rolesDraft.filter((item) => item.id !== selectedRole.id))}>删除角色</button>
    </div>
  );
}

function renderTaskTemplateInspector(
  selectedTaskTemplate: TaskTemplate,
  taskTemplatesDraft: TaskTemplate[],
  installedSkills: InstalledSkill[],
  saveTaskTemplateDrafts: (taskTemplates: TaskTemplate[]) => Promise<void>
) {
  const update = (patch: Partial<TaskTemplate>) =>
    saveTaskTemplateDrafts(taskTemplatesDraft.map((item) => item.id === selectedTaskTemplate.id ? { ...item, ...patch } : item));
  return (
    <div className="form-grid">
      <label>
        名称
        <input value={selectedTaskTemplate.name} onChange={(event) => void update({ name: event.target.value })} />
      </label>
      <label>
        输出格式
        <select value={selectedTaskTemplate.outputContract.format} onChange={(event) => void update({ outputContract: { ...selectedTaskTemplate.outputContract, format: event.target.value as TaskTemplate['outputContract']['format'] } })}>
          <option value="markdown">markdown</option>
          <option value="json">json</option>
          <option value="text">text</option>
          <option value="table">table</option>
        </select>
      </label>
      <label className="full-span">
        任务目标
        <textarea value={selectedTaskTemplate.objective} onChange={(event) => void update({ objective: event.target.value })} />
      </label>
      <label className="full-span">
        推荐 Skills
        <div className="tag-cloud compact">
          {installedSkills.length ? installedSkills.map((skill) => {
            const active = selectedTaskTemplate.recommendedSkillIds?.includes(skill.id) ?? false;
            return (
              <button
                key={skill.id}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => {
                  const next = new Set(selectedTaskTemplate.recommendedSkillIds ?? []);
                  if (next.has(skill.id)) next.delete(skill.id);
                  else next.add(skill.id);
                  void update({ recommendedSkillIds: Array.from(next) });
                }}
              >
                {skill.name}
              </button>
            );
          }) : <span className="muted-inline">当前没有已安装技能。</span>}
        </div>
      </label>
      <label className="full-span">
        必需 Capabilities
        <input
          value={(selectedTaskTemplate.requiredCapabilities ?? []).join(', ')}
          onChange={(event) => void update({ requiredCapabilities: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}
        />
      </label>
      <button type="button" className="button-danger" onClick={() => void saveTaskTemplateDrafts(taskTemplatesDraft.filter((item) => item.id !== selectedTaskTemplate.id))}>删除任务模板</button>
    </div>
  );
}

function renderAgentProfileInspector(
  selectedAgentProfile: AgentProfile,
  agentProfilesDraft: AgentProfile[],
  rolesDraft: PlatformRole[],
  installedSkills: InstalledSkill[],
  settings: AppSettings,
  saveAgentProfileDrafts: (agentProfiles: AgentProfile[]) => Promise<void>
) {
  const update = (patch: Partial<AgentProfile>) =>
    saveAgentProfileDrafts(agentProfilesDraft.map((item) => item.id === selectedAgentProfile.id ? { ...item, ...patch } : item));
  const updateModelPolicy = (patch: Partial<AgentProfile['modelPolicy']>) =>
    update({ modelPolicy: { ...selectedAgentProfile.modelPolicy, ...patch } });
  return (
    <div className="form-grid">
      <label>
        名称
        <input value={selectedAgentProfile.name} onChange={(event) => void update({ name: event.target.value })} />
      </label>
      <label>
        角色
        <select value={selectedAgentProfile.roleProfileId} onChange={(event) => void update({ roleProfileId: event.target.value })}>
          <option value="">未绑定</option>
          {rolesDraft.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>
      <label className="full-span">
        默认 Skills
        <div className="tag-cloud compact">
          {installedSkills.length ? installedSkills.map((skill) => {
            const active = selectedAgentProfile.defaultSkillBundle?.includes(skill.id) ?? false;
            return (
              <button
                key={skill.id}
                type="button"
                className={`small-tag button-chip ${active ? 'active' : ''}`}
                onClick={() => {
                  const next = new Set(selectedAgentProfile.defaultSkillBundle ?? []);
                  if (next.has(skill.id)) next.delete(skill.id);
                  else next.add(skill.id);
                  void update({ defaultSkillBundle: Array.from(next) });
                }}
              >
                {skill.name}
              </button>
            );
          }) : <span className="muted-inline">当前没有已安装技能。</span>}
        </div>
      </label>
      <label className="full-span">
        允许 Capabilities
        <input
          value={(selectedAgentProfile.capabilityPolicy.allowedCapabilities ?? []).join(', ')}
          onChange={(event) => void update({ capabilityPolicy: { allowedCapabilities: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) } })}
        />
      </label>
      <label>
        路由模式
        <select value={selectedAgentProfile.modelPolicy.mode} onChange={(event) => void updateModelPolicy({ mode: event.target.value as AgentProfile['modelPolicy']['mode'] })}>
          <option value="fallback_to_active">回退到当前激活</option>
          <option value="fixed">固定模型</option>
          <option value="prefer_list">优先列表</option>
          <option value="capability_match">按能力匹配</option>
          <option value="policy_router">按策略路由</option>
        </select>
      </label>
      <label>
        固定 Profile
        <select value={selectedAgentProfile.modelPolicy.fixedProfileId ?? ''} onChange={(event) => void updateModelPolicy({ fixedProfileId: event.target.value || undefined })}>
          <option value="">未设置</option>
          {settings.providerProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <label className="full-span">
        优先 Profile IDs
        <input value={selectedAgentProfile.modelPolicy.preferredProfileIds.join(', ')} onChange={(event) => void updateModelPolicy({ preferredProfileIds: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
      </label>
      <button type="button" className="button-danger" onClick={() => void saveAgentProfileDrafts(agentProfilesDraft.filter((item) => item.id !== selectedAgentProfile.id))}>删除执行配置</button>
    </div>
  );
}

function renderConnectorInspector(
  selectedConnector: PlatformConnector,
  connectorsDraft: PlatformConnector[],
  saveConnectorDrafts: (connectors: PlatformConnector[]) => Promise<void>,
  onTestConnector: (connectorId: string) => Promise<{ ok: boolean; message: string }>,
  setAssetStatus: (status: string) => void
) {
  const update = (patch: Partial<PlatformConnector>) =>
    saveConnectorDrafts(connectorsDraft.map((item) => item.id === selectedConnector.id ? { ...item, ...patch } : item));

  return (
    <div className="form-grid">
      <label>
        名称
        <input value={selectedConnector.name} onChange={(event) => void update({ name: event.target.value })} />
      </label>
      <label>
        描述
        <textarea value={selectedConnector.description} onChange={(event) => void update({ description: event.target.value })} />
      </label>
      <label>
        作用域
        <select value={selectedConnector.scope} onChange={(event) => void update({ scope: event.target.value as PlatformConnector['scope'] })}>
          <option value="local">本地</option>
          <option value="remote">远程</option>
        </select>
      </label>
      <label>
        传输
        <select value={selectedConnector.transport} onChange={(event) => void update({ transport: event.target.value as PlatformConnector['transport'] })}>
          <option value="stdio">stdio</option>
          <option value="http">http</option>
        </select>
      </label>
      {selectedConnector.transport === 'http' ? (
        <label>
          Endpoint
          <input value={selectedConnector.endpoint ?? ''} onChange={(event) => void update({ endpoint: event.target.value })} />
        </label>
      ) : (
        <>
          <label>
            命令
            <input value={selectedConnector.command ?? ''} onChange={(event) => void update({ command: event.target.value })} />
          </label>
          <label>
            参数
            <input value={selectedConnector.args.join(' ')} onChange={(event) => void update({ args: event.target.value.split(/\s+/).filter(Boolean) })} />
          </label>
        </>
      )}
      <div className="button-grid">
        <button type="button" className="button-secondary icon-text" onClick={() => void onTestConnector(selectedConnector.id).then((result) => setAssetStatus(result.message))}>
          <ScanSearch size={14} strokeWidth={1.8} />
          <span>健康检查</span>
        </button>
        <button type="button" className="button-danger" onClick={() => void saveConnectorDrafts(connectorsDraft.filter((item) => item.id !== selectedConnector.id))}>删除连接</button>
      </div>
    </div>
  );
}

function renderToolInspector(
  selectedTool: ControlledScriptTool,
  toolsDraft: ControlledScriptTool[],
  connectorsDraft: PlatformConnector[],
  saveToolDrafts: (tools: ControlledScriptTool[]) => Promise<void>,
  onRunTool: (toolId: string) => Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>,
  setAssetStatus: (status: string) => void
) {
  const update = (patch: Partial<ControlledScriptTool>) =>
    saveToolDrafts(toolsDraft.map((item) => item.id === selectedTool.id ? { ...item, ...patch } : item));

  return (
    <div className="form-grid">
      <label>
        名称
        <input value={selectedTool.name} onChange={(event) => void update({ name: event.target.value })} />
      </label>
      <label>
        描述
        <textarea value={selectedTool.description} onChange={(event) => void update({ description: event.target.value })} />
      </label>
      <label>
        命令
        <input value={selectedTool.command} onChange={(event) => void update({ command: event.target.value })} />
      </label>
      <label>
        参数
        <input value={selectedTool.args.join(' ')} onChange={(event) => void update({ args: event.target.value.split(/\s+/).filter(Boolean) })} />
      </label>
      <label>
        工作目录
        <input value={selectedTool.cwd} onChange={(event) => void update({ cwd: event.target.value })} />
      </label>
      <label>
        超时毫秒
        <input type="number" value={selectedTool.timeoutMs} onChange={(event) => void update({ timeoutMs: Number(event.target.value) || 5000 })} />
      </label>
      <label>
        关联连接
        <select value={selectedTool.connectorId ?? ''} onChange={(event) => void update({ connectorId: event.target.value || undefined })}>
          <option value="">未绑定</option>
          {connectorsDraft.map((connector) => <option key={connector.id} value={connector.id}>{connector.name}</option>)}
        </select>
      </label>
      <div className="button-grid">
        <button type="button" className="button-secondary icon-text" onClick={() => void onRunTool(selectedTool.id).then((result) => setAssetStatus(result.ok ? '工具运行成功' : `工具运行失败：${result.stderr || result.exitCode}`))}>
          <Play size={14} strokeWidth={1.8} />
          <span>执行</span>
        </button>
        <button type="button" className="button-danger" onClick={() => void saveToolDrafts(toolsDraft.filter((item) => item.id !== selectedTool.id))}>删除工具</button>
      </div>
      {selectedTool.lastRun ? (
        <div className="inspector-card">
          <div className="section-kicker">最近一次运行</div>
          <strong>{selectedTool.lastRun.ok ? '成功' : '失败'}</strong>
          <div className="muted-line">耗时 {selectedTool.lastRun.durationMs} ms，退出码 {selectedTool.lastRun.exitCode ?? 'null'}</div>
          {selectedTool.lastRun.stdoutPreview ? <pre>{selectedTool.lastRun.stdoutPreview}</pre> : null}
          {selectedTool.lastRun.stderrPreview ? <pre>{selectedTool.lastRun.stderrPreview}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
