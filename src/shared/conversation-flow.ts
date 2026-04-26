import { randomUUID } from 'node:crypto';
import type {
  FlowPatch,
  FlowPatchOperation,
  FlowPlan,
  FlowPlanStep,
  PlatformFlowAsset,
  PlatformFlowNode
} from './types';

const STEP_SPLIT = /\r?\n+|[。；;]+/;

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function guessNodeType(line: string): PlatformFlowNode['type'] {
  const text = line.toLowerCase();
  if (/条件|如果|判断|whether|if /.test(text)) return 'condition';
  if (/循环|重复|直到|loop/.test(text)) return 'loop';
  if (/并行|同时|parallel/.test(text)) return 'parallel_split';
  if (/汇合|收敛|join/.test(text)) return 'parallel_join';
  if (/子流程|subflow/.test(text)) return 'subflow';
  if (/工具|调用|执行脚本|tool/.test(text)) return 'tool';
  if (/工件|文档|输出|artifact/.test(text)) return 'artifact';
  return 'agent';
}

function normalizeSteps(prompt: string) {
  return prompt
    .split(STEP_SPLIT)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createStep(line: string, index: number): FlowPlanStep {
  const type = guessNodeType(line);
  return {
    id: `step-${index + 1}-${slug(line) || index + 1}`,
    title: line.length > 24 ? line.slice(0, 24) : line,
    description: line,
    type,
    maxIterations: type === 'loop' ? 3 : undefined,
    conditionExpression: type === 'condition' ? 'result == true' : undefined,
    loopExpression: type === 'loop' ? 'continue == true' : undefined
  };
}

export function buildFlowPlanFromPrompt(prompt: string): FlowPlan {
  const steps = normalizeSteps(prompt);
  const normalizedSteps = (steps.length ? steps : ['需求梳理', '方案规划', '产物整理']).map(createStep);
  return {
    id: randomUUID(),
    name: normalizedSteps[0]?.title || '新流程',
    description: prompt.trim() || '通过自然语言生成的流程草稿',
    steps: normalizedSteps
  };
}

function buildNodeFromStep(step: FlowPlanStep, index: number): PlatformFlowNode {
  return {
    id: step.id,
    type: step.type,
    position: { x: 260 + index * 240, y: 180 },
    data: {
      label: step.title,
      description: step.description,
      roleId: step.roleId,
      toolId: step.toolId,
      subflowId: step.subflowId,
      conditionExpression: step.conditionExpression,
      loopExpression: step.loopExpression,
      maxIterations: step.maxIterations,
      inputArtifactPaths: step.inputArtifactPaths,
      outputArtifactPaths: step.outputArtifactPaths
    }
  };
}

export function buildFlowDraftFromPlan(plan: FlowPlan, kind: PlatformFlowAsset['kind'] = 'flow'): PlatformFlowAsset {
  const now = new Date().toISOString();
  const startId = 'generated-start';
  const endId = 'generated-end';
  const nodes: PlatformFlowAsset['nodes'] = [
    {
      id: startId,
      type: 'start',
      position: { x: 80, y: 180 },
      data: { label: '开始' }
    },
    ...plan.steps.map(buildNodeFromStep),
    {
      id: endId,
      type: 'end',
      position: { x: 260 + plan.steps.length * 240, y: 180 },
      data: { label: '结束' }
    }
  ];
  const chain = [startId, ...plan.steps.map((step) => step.id), endId];
  const edges = chain.slice(0, -1).map((source, index) => ({
    id: `edge-${index + 1}-${source}-${chain[index + 1]}`,
    source,
    target: chain[index + 1],
    branch: 'default' as const,
    label: '下一步'
  }));
  return {
    id: `flow-${slug(plan.name) || randomUUID()}`,
    kind,
    name: plan.name,
    description: plan.description,
    createdAt: now,
    updatedAt: now,
    nodes,
    edges
  };
}

function parseTargetTitle(prompt: string) {
  const match = /(?:命名为|改名为|重命名为|rename to)\s*[:：]?\s*["“]?([^"”]+)["”]?/i.exec(prompt);
  return match?.[1]?.trim();
}

export function buildFlowPatchFromPrompt(flow: PlatformFlowAsset, prompt: string): FlowPatch {
  const operations: FlowPatchOperation[] = [];
  const rename = parseTargetTitle(prompt);
  if (rename) {
    operations.push({ op: 'rename_flow', name: rename });
  }

  const addMatch = /(?:添加|新增|加入)\s*(.+?)(?:节点|步骤)?$/m.exec(prompt);
  if (addMatch) {
    const node = createStep(addMatch[1].trim(), flow.nodes.length);
    const candidates = flow.nodes.filter((item) => item.type !== 'end');
    operations.push({
      op: 'add_node',
      afterNodeId: candidates[candidates.length - 1]?.id,
      node
    });
  }

  const deleteMatch = /(?:删除|移除)\s*([^\n，。,；;]+)(?:节点|步骤)?/m.exec(prompt);
  if (deleteMatch) {
    const target = flow.nodes.find((item) => item.data.label.includes(deleteMatch[1].trim()));
    if (target && target.type !== 'start' && target.type !== 'end') {
      operations.push({
        op: 'delete_node',
        nodeId: target.id
      });
    }
  }

  const updateMatch = /(?:把|将)\s*([^\n，。,；;]+)\s*(?:改成|修改为)\s*([^\n，。,；;]+)/m.exec(prompt);
  if (updateMatch) {
    const target = flow.nodes.find((item) => item.data.label.includes(updateMatch[1].trim()));
    if (target) {
      operations.push({
        op: 'update_node',
        nodeId: target.id,
        patch: { label: updateMatch[2].trim(), description: prompt.trim() }
      });
    }
  }

  if (!operations.length) {
    operations.push({
      op: 'add_node',
      afterNodeId: flow.nodes.filter((item) => item.type !== 'end').at(-1)?.id,
      node: createStep(prompt.trim() || '新增步骤', flow.nodes.length)
    });
  }

  return {
    id: randomUUID(),
    summary: prompt.trim() || '修改当前流程',
    operations
  };
}

export function applyFlowPatch(flow: PlatformFlowAsset, patch: FlowPatch): PlatformFlowAsset {
  let next: PlatformFlowAsset = {
    ...flow,
    nodes: flow.nodes.map((node) => ({ ...node, data: { ...node.data } })),
    edges: flow.edges.map((edge) => ({ ...edge })),
    updatedAt: new Date().toISOString()
  };

  for (const operation of patch.operations) {
    if (operation.op === 'rename_flow') {
      next = {
        ...next,
        name: operation.name,
        description: operation.description ?? next.description
      };
      continue;
    }

    if (operation.op === 'update_node') {
      next = {
        ...next,
        nodes: next.nodes.map((node) => node.id === operation.nodeId
          ? { ...node, data: { ...node.data, ...operation.patch } }
          : node)
      };
      continue;
    }

    if (operation.op === 'delete_node') {
      next = {
        ...next,
        nodes: next.nodes.filter((node) => node.id !== operation.nodeId),
        edges: next.edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId)
      };
      continue;
    }

    if (operation.op === 'add_node') {
      const afterIndex = operation.afterNodeId
        ? next.nodes.findIndex((node) => node.id === operation.afterNodeId)
        : next.nodes.findIndex((node) => node.type === 'start');
      const insertIndex = afterIndex >= 0 ? afterIndex + 1 : next.nodes.length - 1;
      const newNode = buildNodeFromStep(operation.node, insertIndex);
      next.nodes.splice(Math.max(1, insertIndex), 0, newNode);
      const sourceId = operation.afterNodeId ?? next.nodes[0].id;
      const outgoing = next.edges.filter((edge) => edge.source === sourceId);
      next.edges = next.edges.filter((edge) => edge.source !== sourceId);
      next.edges.push({
        id: `edge-${sourceId}-${newNode.id}`,
        source: sourceId,
        target: newNode.id,
        branch: 'default',
        label: '下一步'
      });
      if (outgoing.length) {
        for (const edge of outgoing) {
          next.edges.push({
            ...edge,
            id: `${edge.id}-via-${newNode.id}`,
            source: newNode.id
          });
        }
      } else {
        const endNode = next.nodes.find((node) => node.type === 'end');
        if (endNode) {
          next.edges.push({
            id: `edge-${newNode.id}-${endNode.id}`,
            source: newNode.id,
            target: endNode.id,
            branch: 'default',
            label: '下一步'
          });
        }
      }
    }
  }

  return next;
}
