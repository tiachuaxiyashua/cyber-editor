import path from 'node:path';
import { defaultFlowPathConfig } from '../../shared/runtime-template';
import type { FlowPathConfig, PlatformFlowAsset, PlatformFlowNode } from '../../shared/types';

export function normalizeFlowPathConfig(rootPath: string, config?: FlowPathConfig): FlowPathConfig {
  const safe = {
    ...defaultFlowPathConfig(),
    ...config
  };
  const inputRoot = safe.inputRoot.trim() || 'input';
  const outputRoot = safe.outputRoot.trim() || 'output';
  const resolvedInputRoot = safe.inheritProjectRoot ? path.resolve(rootPath, inputRoot) : path.resolve(inputRoot);
  const resolvedOutputRoot = safe.inheritProjectRoot ? path.resolve(rootPath, outputRoot) : path.resolve(outputRoot);
  return {
    inputRoot,
    outputRoot,
    inheritProjectRoot: safe.inheritProjectRoot,
    resolvedInputRoot,
    resolvedOutputRoot
  };
}

export function normalizeFlowAssetPaths(rootPath: string, flow: PlatformFlowAsset): PlatformFlowAsset {
  const normalizedNodes = flow.nodes.map((node) => normalizeFlowNodeContracts(node));
  return {
    ...flow,
    nodes: normalizedNodes,
    pathConfig: normalizeFlowPathConfig(rootPath, flow.pathConfig)
  };
}

function normalizeFlowNodeContracts(node: PlatformFlowNode): PlatformFlowNode {
  const next = {
    ...node,
    data: {
      ...node.data
    }
  };
  if (node.type === 'loop') {
    next.data.maxIterations = Math.max(1, node.data.maxIterations ?? 3);
    next.data.loopFailurePolicy = node.data.loopFailurePolicy ?? 'guard_fail';
    next.data.loopTimeoutMs = typeof node.data.loopTimeoutMs === 'number' && node.data.loopTimeoutMs > 0
      ? node.data.loopTimeoutMs
      : undefined;
  }
  if (node.type === 'parallel_split') {
    next.data.parallelMode = node.data.parallelMode ?? 'fanout';
    next.data.parallelFailureStrategy = node.data.parallelFailureStrategy ?? 'manual_review';
    next.data.parallelCancellationPolicy = node.data.parallelCancellationPolicy ?? 'wait_all';
  }
  if (node.type === 'parallel_join') {
    next.data.mergeStrategy = node.data.mergeStrategy ?? 'collect_all';
  }
  if (node.type === 'subflow') {
    next.data.subflowInputBindings = Array.from(new Set((node.data.subflowInputBindings ?? []).filter(Boolean)));
    next.data.subflowOutputBindings = Array.from(new Set((node.data.subflowOutputBindings ?? []).filter(Boolean)));
  }
  return next;
}
