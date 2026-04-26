import type {
  AgentProfile,
  ControlledScriptTool,
  FlowValidationIssue,
  PlatformConnector,
  PlatformFlowAsset,
  PlatformFlowEdge,
  PlatformFlowNode,
  PlatformRole,
  RuntimeTemplateAsset,
  TaskTemplate
} from './types';
import {
  connectorBindingState,
  roleBindingState,
  toolBindingState
} from './platform-bindings';

function issue(
  code: string,
  severity: FlowValidationIssue['severity'],
  scope: FlowValidationIssue['scope'],
  message: string,
  options?: Pick<FlowValidationIssue, 'nodeId' | 'edgeId'>
): FlowValidationIssue {
  return {
    id: `${code}:${options?.nodeId ?? options?.edgeId ?? 'flow'}`,
    code,
    severity,
    scope,
    message,
    ...options
  };
}

function outgoingEdges(flow: PlatformFlowAsset, nodeId: string) {
  return flow.edges.filter((edge) => edge.source === nodeId);
}

function incomingEdges(flow: PlatformFlowAsset, nodeId: string) {
  return flow.edges.filter((edge) => edge.target === nodeId);
}

function findNode(flow: PlatformFlowAsset, nodeId: string) {
  return flow.nodes.find((node) => node.id === nodeId);
}

function hasValidBindingPair(value: string) {
  const [source, target, ...rest] = value.split('=>').map((part) => part.trim());
  return Boolean(source && target && rest.length === 0);
}

function findArtifactPaths(template: RuntimeTemplateAsset | null) {
  if (!template) return new Set<string>();
  return new Set(
    Object.values(template.stageDocuments)
      .flat()
      .map((document) => document.path)
  );
}

function hasReachableNodeType(
  flow: PlatformFlowAsset,
  startNodeId: string,
  direction: 'outgoing' | 'incoming',
  targetType: PlatformFlowNode['type']
) {
  const queue = [startNodeId];
  const visited = new Set<string>([startNodeId]);
  while (queue.length) {
    const current = queue.shift()!;
    const edges = direction === 'outgoing' ? outgoingEdges(flow, current) : incomingEdges(flow, current);
    for (const edge of edges) {
      const nextNodeId = direction === 'outgoing' ? edge.target : edge.source;
      if (visited.has(nextNodeId)) continue;
      visited.add(nextNodeId);
      const nextNode = findNode(flow, nextNodeId);
      if (!nextNode) continue;
      if (nextNode.type === targetType) return true;
      queue.push(nextNodeId);
    }
  }
  return false;
}

function validateConditionNode(flow: PlatformFlowAsset, node: PlatformFlowNode) {
  const findings: FlowValidationIssue[] = [];
  const outgoing = outgoingEdges(flow, node.id);
  const trueEdge = outgoing.find((edge) => edge.branch === 'true');
  const falseEdge = outgoing.find((edge) => edge.branch === 'false');
  if (!node.data.conditionExpression?.trim()) {
    findings.push(issue('condition.expression.missing', 'error', 'node', '条件节点缺少条件表达式。', { nodeId: node.id }));
  }
  if (!node.data.trueTargetId || !trueEdge) {
    findings.push(issue('condition.true-target.missing', 'error', 'node', '条件节点缺少“是”分支目标。', { nodeId: node.id }));
  }
  if (!node.data.falseTargetId || !falseEdge) {
    findings.push(issue('condition.false-target.missing', 'error', 'node', '条件节点缺少“否”分支目标。', { nodeId: node.id }));
  }
  return findings;
}

function validateLoopNode(flow: PlatformFlowAsset, node: PlatformFlowNode) {
  const findings: FlowValidationIssue[] = [];
  const outgoing = outgoingEdges(flow, node.id);
  const loopEdge = outgoing.find((edge) => edge.branch === 'loop');
  const exitEdge = outgoing.find((edge) => edge.branch === 'exit');
  if (!node.data.loopExpression?.trim()) {
    findings.push(issue('loop.expression.missing', 'error', 'node', '循环节点缺少继续循环条件。', { nodeId: node.id }));
  }
  if (!node.data.exitExpression?.trim()) {
    findings.push(issue('loop.exit-expression.missing', 'error', 'node', '循环节点缺少退出条件。', { nodeId: node.id }));
  }
  if (!node.data.maxIterations || node.data.maxIterations < 1) {
    findings.push(issue('loop.max-iterations.invalid', 'error', 'node', '循环节点的最大轮次必须大于等于 1。', { nodeId: node.id }));
  }
  if (typeof node.data.loopTimeoutMs === 'number' && node.data.loopTimeoutMs < 1) {
    findings.push(issue('loop.timeout.invalid', 'error', 'node', 'Loop timeout must be greater than 0ms.', { nodeId: node.id }));
  }
  if (!node.data.loopBackTargetId || !loopEdge) {
    findings.push(issue('loop.back-target.missing', 'error', 'node', '循环节点缺少循环回边目标。', { nodeId: node.id }));
  }
  if (!node.data.exitTargetId || !exitEdge) {
    findings.push(issue('loop.exit-target.missing', 'error', 'node', '循环节点缺少退出目标。', { nodeId: node.id }));
  }
  if (node.data.loopBackTargetId && node.data.exitTargetId && node.data.loopBackTargetId === node.data.exitTargetId) {
    findings.push(issue('loop.targets.conflict', 'error', 'node', '循环回边和退出目标不能指向同一个节点。', { nodeId: node.id }));
  }
  return findings;
}

function validateParallelSplitNode(flow: PlatformFlowAsset, node: PlatformFlowNode, artifactPaths: Set<string>) {
  const findings: FlowValidationIssue[] = [];
  const outgoing = outgoingEdges(flow, node.id);
  if (outgoing.length < 2) {
    findings.push(issue('parallel.split.branches', 'error', 'node', '并行分叉至少需要两条向外连线。', { nodeId: node.id }));
  }
  if (!node.data.parallelFailureStrategy) {
    findings.push(issue('parallel.split.failure-strategy.missing', 'error', 'node', '并行分叉缺少失败策略。', { nodeId: node.id }));
  }
  if ((node.data.parallelMode === 'review' || node.data.parallelMode === 'research') && !node.data.sharedBoardArtifactPath) {
    findings.push(issue('parallel.split.shared-artifact.missing', 'error', 'node', '评审或调研并行模式必须指定共享工件。', { nodeId: node.id }));
  }
  if (node.data.sharedBoardArtifactPath && !artifactPaths.has(node.data.sharedBoardArtifactPath)) {
    findings.push(issue('parallel.split.shared-artifact.invalid', 'error', 'node', '并行分叉引用了模板中不存在的共享工件。', { nodeId: node.id }));
  }
  for (const edge of outgoing) {
    if (!hasReachableNodeType(flow, edge.target, 'outgoing', 'parallel_join')) {
      findings.push(issue('parallel.split.branch-without-join', 'error', 'edge', '每个并行分支都必须最终汇合到并行汇合节点。', {
        nodeId: node.id,
        edgeId: edge.id
      }));
    }
  }
  return findings;
}

function validateParallelJoinNode(flow: PlatformFlowAsset, node: PlatformFlowNode) {
  const findings: FlowValidationIssue[] = [];
  const incoming = incomingEdges(flow, node.id);
  if (incoming.length < 2) {
    findings.push(issue('parallel.join.sources', 'error', 'node', '并行汇合至少需要两条进入连线。', { nodeId: node.id }));
  }
  if (!node.data.mergeStrategy) {
    findings.push(issue('parallel.join.merge-strategy.missing', 'error', 'node', '并行汇合缺少合并策略。', { nodeId: node.id }));
  }
  if (!hasReachableNodeType(flow, node.id, 'incoming', 'parallel_split')) {
    findings.push(issue('parallel.join.split.missing', 'error', 'node', '并行汇合节点必须由至少一个并行分叉驱动。', { nodeId: node.id }));
  }
  return findings;
}

function validateArtifactBindings(node: PlatformFlowNode, artifactPaths: Set<string>) {
  const findings: FlowValidationIssue[] = [];
  for (const artifactPath of node.data.inputArtifactPaths ?? []) {
    if (!artifactPaths.has(artifactPath)) {
      findings.push(issue('artifact.input.invalid', 'warning', 'node', `节点读取了模板中不存在的工件：${artifactPath}`, { nodeId: node.id }));
    }
  }
  for (const artifactPath of node.data.outputArtifactPaths ?? []) {
    if (!artifactPaths.has(artifactPath)) {
      findings.push(issue('artifact.output.invalid', 'warning', 'node', `节点写入了模板中不存在的工件：${artifactPath}`, { nodeId: node.id }));
    }
  }
  return findings;
}

function validateSubflowNode(flow: PlatformFlowAsset, node: PlatformFlowNode, subflowIds: Set<string>) {
  const findings: FlowValidationIssue[] = [];
  if (!node.data.subflowId) {
    findings.push(issue('subflow.binding.missing', 'error', 'node', '子流程节点缺少子流程绑定。', { nodeId: node.id }));
  } else if (!subflowIds.has(node.data.subflowId)) {
    findings.push(issue('subflow.binding.invalid', 'error', 'node', '子流程节点引用了不存在的子流程。', { nodeId: node.id }));
  }
  for (const binding of node.data.subflowInputBindings ?? []) {
    if (!hasValidBindingPair(binding)) {
      findings.push(issue('subflow.input-binding.invalid', 'error', 'node', `Invalid subflow input binding: ${binding}`, { nodeId: node.id }));
    }
  }
  for (const binding of node.data.subflowOutputBindings ?? []) {
    if (!hasValidBindingPair(binding)) {
      findings.push(issue('subflow.output-binding.invalid', 'error', 'node', `Invalid subflow output binding: ${binding}`, { nodeId: node.id }));
    }
  }
  return findings;
}

function validateEdge(edge: PlatformFlowEdge, nodeIds: Set<string>) {
  const findings: FlowValidationIssue[] = [];
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
    findings.push(issue('edge.endpoint.invalid', 'error', 'edge', '连线引用了不存在的节点。', { edgeId: edge.id }));
  }
  return findings;
}

function validateBindingNode(
  node: PlatformFlowNode,
  roles: PlatformRole[],
  taskTemplates: TaskTemplate[],
  agentProfiles: AgentProfile[],
  connectors: PlatformConnector[],
  tools: ControlledScriptTool[]
) {
  const findings: FlowValidationIssue[] = [];
  const role = node.data.roleId ? roles.find((item) => item.id === node.data.roleId) ?? null : null;
  const taskTemplate = node.data.taskTemplateId ? taskTemplates.find((item) => item.id === node.data.taskTemplateId) ?? null : null;
  const agentProfile = node.data.agentProfileId ? agentProfiles.find((item) => item.id === node.data.agentProfileId) ?? null : null;
  const connector = node.data.connectorId ? connectors.find((item) => item.id === node.data.connectorId) ?? null : null;
  const tool = node.data.toolId ? tools.find((item) => item.id === node.data.toolId) ?? null : null;

  if (node.type === 'agent') {
    if (!node.data.roleId) {
      findings.push(issue('binding.role.missing', 'error', 'node', 'Agent 节点必须绑定角色。', { nodeId: node.id }));
    } else {
      const roleState = roleBindingState(role);
      if (!roleState.ready) {
        findings.push(issue('binding.role.invalid', 'error', 'node', roleState.reason || '绑定角色不可用。', { nodeId: node.id }));
      }
    }
    if (!node.data.taskTemplateId) {
      findings.push(issue('binding.task-template.missing', 'error', 'node', 'Agent 节点必须绑定任务模板。', { nodeId: node.id }));
    } else if (!taskTemplate) {
      findings.push(issue('binding.task-template.invalid', 'error', 'node', '绑定的任务模板不存在或不可用。', { nodeId: node.id }));
    }
    if (!node.data.agentProfileId) {
      findings.push(issue('binding.agent-profile.missing', 'error', 'node', 'Agent 节点必须绑定执行配置。', { nodeId: node.id }));
    } else if (!agentProfile) {
      findings.push(issue('binding.agent-profile.invalid', 'error', 'node', '绑定的执行配置不存在或不可用。', { nodeId: node.id }));
    } else if (node.data.roleId && agentProfile.roleProfileId !== node.data.roleId) {
      findings.push(issue('binding.agent-profile.role-mismatch', 'error', 'node', '执行配置绑定的角色与节点角色不一致。', { nodeId: node.id }));
    }
  }

  if (node.data.connectorId) {
    const connectorState = connectorBindingState(connector);
    if (!connectorState.ready) {
      findings.push(issue('binding.connector.invalid', 'error', 'node', connectorState.reason || '绑定连接不可用。', { nodeId: node.id }));
    }
  }

  if (node.type === 'tool' && !node.data.connectorId && !node.data.toolId) {
    findings.push(issue('binding.tool-node.empty', 'error', 'node', '工具节点至少要绑定一个连接或工具。', { nodeId: node.id }));
  }

  if (node.type === 'tool' && !node.data.connectorId && !node.data.toolId) {
    const latestFinding = findings[findings.length - 1];
    if (latestFinding?.code === 'binding.tool-node.empty' && latestFinding.nodeId === node.id) {
      latestFinding.severity = 'warning';
      latestFinding.message = '工具节点尚未绑定连接或工具，可以先作为占位节点保存。';
    }
  }

  if (node.data.toolId) {
    const toolState = toolBindingState(tool, connectors);
    if (!toolState.ready) {
      findings.push(issue('binding.tool.invalid', 'error', 'node', toolState.reason || '绑定工具不可用。', { nodeId: node.id }));
    }
  }

  for (const toolId of node.data.toolIds ?? []) {
    const toolState = toolBindingState(tools.find((item) => item.id === toolId) ?? null, connectors);
    if (!toolState.ready) {
      findings.push(issue('binding.tool-list.invalid', 'error', 'node', `${toolId}: ${toolState.reason || '绑定工具不可用。'}`, { nodeId: node.id }));
    }
  }

  return findings;
}

export function validatePlatformFlow(
  flow: PlatformFlowAsset,
  options?: {
    template?: RuntimeTemplateAsset | null;
    subflows?: PlatformFlowAsset[];
    roles?: PlatformRole[];
    taskTemplates?: TaskTemplate[];
    agentProfiles?: AgentProfile[];
    connectors?: PlatformConnector[];
    tools?: ControlledScriptTool[];
  }
) {
  const findings: FlowValidationIssue[] = [];
  const artifactPaths = findArtifactPaths(options?.template ?? null);
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const subflowIds = new Set((options?.subflows ?? []).map((subflow) => subflow.id));
  const roles = options?.roles ?? [];
  const taskTemplates = options?.taskTemplates ?? [];
  const agentProfiles = options?.agentProfiles ?? [];
  const connectors = options?.connectors ?? [];
  const tools = options?.tools ?? [];

  const startNodes = flow.nodes.filter((node) => node.type === 'start');
  if (startNodes.length !== 1) {
    findings.push(issue('flow.start.count', 'error', 'flow', '每个流程必须且只能有一个开始节点。'));
  }
  const endNodes = flow.nodes.filter((node) => node.type === 'end');
  if (!endNodes.length) {
    findings.push(issue('flow.end.missing', 'error', 'flow', '每个流程至少需要一个结束节点。'));
  }

  for (const node of flow.nodes) {
    findings.push(...validateArtifactBindings(node, artifactPaths));
    findings.push(...validateBindingNode(node, roles, taskTemplates, agentProfiles, connectors, tools));
    if (!node.data.label?.trim()) {
      findings.push(issue('node.label.missing', 'warning', 'node', '节点缺少显示标题。', { nodeId: node.id }));
    }
    switch (node.type) {
      case 'condition':
        findings.push(...validateConditionNode(flow, node));
        break;
      case 'loop':
        findings.push(...validateLoopNode(flow, node));
        break;
      case 'parallel_split':
        findings.push(...validateParallelSplitNode(flow, node, artifactPaths));
        break;
      case 'parallel_join':
        findings.push(...validateParallelJoinNode(flow, node));
        break;
      case 'subflow':
        findings.push(...validateSubflowNode(flow, node, subflowIds));
        break;
      case 'artifact':
        if (!node.data.artifactPath?.trim()) {
          findings.push(issue('artifact.path.missing', 'error', 'node', '工件节点缺少工件路径。', { nodeId: node.id }));
        }
        break;
      default:
        break;
    }
  }

  for (const edge of flow.edges) {
    findings.push(...validateEdge(edge, nodeIds));
  }

  const hasParallelSplit = flow.nodes.some((node) => node.type === 'parallel_split');
  const hasParallelJoin = flow.nodes.some((node) => node.type === 'parallel_join');
  if (hasParallelSplit && !hasParallelJoin) {
    findings.push(issue('parallel.join.missing', 'warning', 'flow', '流程中存在并行分叉，但没有并行汇合节点。'));
  }

  return findings;
}

export function downstreamNodeIds(flow: PlatformFlowAsset, startNodeId: string) {
  const queue = [startNodeId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of flow.edges.filter((item) => item.source === current)) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }
  visited.delete(startNodeId);
  return Array.from(visited);
}
