import path from 'node:path';
import type {
  AccumulationEntry,
  KnowledgeLinkEdge,
  KnowledgeLinkNode,
  PlatformAssets,
  ProjectKnowledgeGraph,
  PromotionDraft,
  RuleDefinition,
  RuntimeRun
} from '../../shared/types';

type BuildProjectKnowledgeGraphInput = {
  rootPath: string;
  existingKnowledgeNodes: KnowledgeLinkNode[];
  rules: RuleDefinition[];
  accumulationEntries: AccumulationEntry[];
  promotionDrafts: PromotionDraft[];
  platform: Pick<PlatformAssets, 'flows' | 'subflows' | 'roles'>;
  runtimeRuns?: RuntimeRun[];
};

function uniqueById<T extends { id: string }>(values: T[]) {
  return Array.from(new Map(values.map((item) => [item.id, item])).values());
}

function documentNodeId(documentPath: string) {
  return `document:${documentPath}`;
}

function accumulationNodeId(entryId: string) {
  return `accumulation:${entryId}`;
}

function ruleNodeId(ruleId: string) {
  return `rule:${ruleId}`;
}

function promotionNodeId(promotionId: string) {
  return `promotion:${promotionId}`;
}

function flowNodeId(kind: 'flow' | 'subflow', flowId: string) {
  return `flow:${kind}:${flowId}`;
}

function skillNodeId(skillId: string) {
  return `skill:${skillId}`;
}

function artifactNodeId(artifactPath: string) {
  return `artifact:${artifactPath}`;
}

function runNodeId(runId: string) {
  return `run:${runId}`;
}

function normalizeProjectPath(rootPath: string, targetPath: string) {
  if (!targetPath.trim()) return targetPath;
  if (path.isAbsolute(targetPath)) {
    const relative = path.relative(rootPath, targetPath).replace(/\\/g, '/');
    return relative.startsWith('..') ? targetPath.replace(/\\/g, '/') : relative;
  }
  return targetPath.replace(/\\/g, '/');
}

function artifactTitle(artifactPath: string) {
  const normalized = artifactPath.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').pop() || normalized;
}

function graphStatusFromRun(run: RuntimeRun): KnowledgeLinkNode['status'] {
  if (run.status === 'completed') return 'accepted';
  if (run.status === 'failed' || run.status === 'stopped') return 'archived';
  return 'active';
}

function runSummary(run: RuntimeRun) {
  return run.latestCheckpointSummary
    || run.currentStep
    || run.errorMessage
    || `${run.kind} / ${run.status}`;
}

function runTitle(run: RuntimeRun) {
  const parts: string[] = [run.kind];
  if (run.stage) parts.push(run.stage);
  if (run.flowId) parts.push(run.flowId);
  return parts.join(' / ');
}

function pushNode(nodes: KnowledgeLinkNode[], node: KnowledgeLinkNode) {
  nodes.push(node);
}

function pushEdge(edges: KnowledgeLinkEdge[], edge: KnowledgeLinkEdge) {
  edges.push(edge);
}

export class ProjectKnowledgeGraphBuilder {
  build(input: BuildProjectKnowledgeGraphInput): ProjectKnowledgeGraph {
    const nodes: KnowledgeLinkNode[] = [];
    const edges: KnowledgeLinkEdge[] = [];
    const knownRuleIds = new Set(input.rules.map((rule) => rule.id));
    const runtimeRunsById = new Map((input.runtimeRuns ?? []).map((run) => [run.id, run] as const));

    for (const node of input.existingKnowledgeNodes.filter((item) => item.kind === 'knowledge')) {
      pushNode(nodes, {
        ...node,
        status: node.status ?? 'accepted'
      });
    }

    for (const rule of input.rules) {
      pushNode(nodes, {
        id: ruleNodeId(rule.id),
        kind: 'rule',
        title: rule.name,
        summary: rule.description || rule.body.slice(0, 120),
        sourceId: rule.id,
        status: rule.enabled ? 'active' : 'archived',
        metadata: {
          scope: rule.scope,
          category: rule.category,
          targetKey: rule.targetKey ?? '',
          appliesTo: rule.appliesTo
        }
      });
      if (rule.provenanceEntryId) {
        pushEdge(edges, {
          id: `derived:${rule.provenanceEntryId}:${rule.id}`,
          sourceId: accumulationNodeId(rule.provenanceEntryId),
          targetId: ruleNodeId(rule.id),
          type: 'derived-from',
          label: 'promoted-to-rule'
        });
      }
      if (rule.flowId) {
        pushEdge(edges, {
          id: `binds:${rule.flowId}:${rule.id}`,
          sourceId: flowNodeId('flow', rule.flowId),
          targetId: ruleNodeId(rule.id),
          type: 'binds',
          label: rule.nodeId ? `node:${rule.nodeId}` : 'flow-rule'
        });
      }
    }

    const ensureRunNode = (runId: string) => {
      const run = runtimeRunsById.get(runId);
      pushNode(nodes, {
        id: runNodeId(runId),
        kind: 'run',
        title: run ? runTitle(run) : `run / ${runId}`,
        summary: run ? runSummary(run) : `runtime run ${runId}`,
        sourceId: runId,
        status: run ? graphStatusFromRun(run) : 'archived',
        metadata: run ? {
          runKind: run.kind,
          runStatus: run.status,
          stage: run.stage ?? '',
          flowId: run.flowId ?? '',
          roleId: run.roleId ?? ''
        } : {
          runStatus: 'missing'
        }
      });
      return runNodeId(runId);
    };

    const ensureDocumentNode = (documentPath: string) => {
      const normalizedPath = normalizeProjectPath(input.rootPath, documentPath);
      pushNode(nodes, {
        id: documentNodeId(normalizedPath),
        kind: 'document',
        title: normalizedPath.split(/[\\/]/).pop() ?? normalizedPath,
        summary: normalizedPath,
        sourceId: normalizedPath,
        status: 'active'
      });
      return normalizedPath;
    };

    for (const entry of input.accumulationEntries) {
      pushNode(nodes, {
        id: accumulationNodeId(entry.id),
        kind: 'accumulation',
        title: entry.title,
        summary: entry.summary,
        sourceId: entry.id,
        status: entry.status === 'active' ? 'active' : 'archived',
        metadata: {
          category: entry.category,
          source: entry.source
        }
      });
      for (const documentPath of entry.sourceDocumentPaths) {
        const normalizedDocumentPath = ensureDocumentNode(documentPath);
        pushEdge(edges, {
          id: `reference:${entry.id}:${normalizedDocumentPath}`,
          sourceId: documentNodeId(normalizedDocumentPath),
          targetId: accumulationNodeId(entry.id),
          type: 'references',
          label: 'evidence'
        });
      }
      if (entry.sourceRunId) {
        pushEdge(edges, {
          id: `run-evidence:${entry.sourceRunId}:${entry.id}`,
          sourceId: ensureRunNode(entry.sourceRunId),
          targetId: accumulationNodeId(entry.id),
          type: 'derived-from',
          label: 'runtime-source'
        });
      }
      if (entry.sourceNodeId) {
        const parentFlow = [...input.platform.flows, ...input.platform.subflows].find((flow) => flow.nodes.some((node) => node.id === entry.sourceNodeId));
        if (parentFlow) {
          pushEdge(edges, {
            id: `flow-derived:${parentFlow.id}:${entry.id}`,
            sourceId: flowNodeId(parentFlow.kind, parentFlow.id),
            targetId: accumulationNodeId(entry.id),
            type: 'derived-from',
            label: `node:${entry.sourceNodeId}`
          });
        }
      }
    }

    for (const promotion of input.promotionDrafts) {
      pushNode(nodes, {
        id: promotionNodeId(promotion.id),
        kind: 'promotion',
        title: promotion.proposedName,
        summary: promotion.summary,
        sourceId: promotion.id,
        status: promotion.status === 'rejected' ? 'archived' : promotion.status
      });
      pushEdge(edges, {
        id: `promotes:${promotion.entryId}:${promotion.id}`,
        sourceId: accumulationNodeId(promotion.entryId),
        targetId: promotionNodeId(promotion.id),
        type: 'promotes-to',
        label: promotion.targetKind
      });
      if (promotion.appliedRuleId) {
        pushEdge(edges, {
          id: `activates-rule:${promotion.id}:${promotion.appliedRuleId}`,
          sourceId: promotionNodeId(promotion.id),
          targetId: ruleNodeId(promotion.appliedRuleId),
          type: 'activates',
          label: 'accepted'
        });
      }
      if (promotion.appliedKnowledgeNodeId) {
        pushEdge(edges, {
          id: `activates-knowledge:${promotion.id}:${promotion.appliedKnowledgeNodeId}`,
          sourceId: promotionNodeId(promotion.id),
          targetId: promotion.appliedKnowledgeNodeId,
          type: 'activates',
          label: 'accepted'
        });
      }
      if (promotion.appliedSkillId) {
        pushNode(nodes, {
          id: skillNodeId(promotion.appliedSkillId),
          kind: 'skill',
          title: promotion.proposedName,
          summary: promotion.appliedSkillPackagePath || promotion.summary,
          sourceId: promotion.appliedSkillId,
          status: 'accepted'
        });
        pushEdge(edges, {
          id: `activates-skill:${promotion.id}:${promotion.appliedSkillId}`,
          sourceId: promotionNodeId(promotion.id),
          targetId: skillNodeId(promotion.appliedSkillId),
          type: 'activates',
          label: 'accepted'
        });
      }
    }

    for (const knowledgeNode of input.existingKnowledgeNodes.filter((item) => item.kind === 'knowledge' && item.sourceId)) {
      const sourceEntry = input.accumulationEntries.find((entry) => entry.id === knowledgeNode.sourceId);
      if (!sourceEntry) continue;
      pushEdge(edges, {
        id: `knowledge-derived:${sourceEntry.id}:${knowledgeNode.id}`,
        sourceId: accumulationNodeId(sourceEntry.id),
        targetId: knowledgeNode.id,
        type: 'derived-from',
        label: 'promoted-to-knowledge'
      });
    }

    const rolesById = new Map(input.platform.roles.map((role) => [role.id, role]));
    const skillNodeIds = new Set<string>();
    const ensureSkillNode = (skillId: string, sourceSummary: string) => {
      const id = skillNodeId(skillId);
      if (skillNodeIds.has(id)) return id;
      skillNodeIds.add(id);
      pushNode(nodes, {
        id,
        kind: 'skill',
        title: skillId,
        summary: sourceSummary,
        sourceId: skillId,
        status: 'active'
      });
      return id;
    };
    const ensureArtifactNode = (artifactPath: string, sourceSummary: string) => {
      const normalizedPath = normalizeProjectPath(input.rootPath, artifactPath);
      pushNode(nodes, {
        id: artifactNodeId(normalizedPath),
        kind: 'artifact',
        title: artifactTitle(normalizedPath),
        summary: normalizedPath,
        sourceId: normalizedPath,
        status: 'active',
        metadata: {
          source: sourceSummary
        }
      });
      return normalizedPath;
    };

    for (const run of input.runtimeRuns ?? []) {
      ensureRunNode(run.id);
      if (run.flowId) {
        const flow =
          input.platform.flows.find((item) => item.id === run.flowId)
          ?? input.platform.subflows.find((item) => item.id === run.flowId)
          ?? null;
        if (flow) {
          pushEdge(edges, {
            id: `flow-run:${flow.id}:${run.id}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: runNodeId(run.id),
            type: 'contains',
            label: run.kind
          });
        }
      }

      const runArtifactPaths = [
        ...run.outputs.flatMap((output) => output.artifactPath ? [output.artifactPath] : []),
        ...(run.artifactOutcomes ?? []).map((outcome) => outcome.artifactPath)
      ];
      for (const artifactPath of runArtifactPaths) {
        const normalizedPath = ensureArtifactNode(artifactPath, `runtime / ${run.id}`);
        pushEdge(edges, {
          id: `run-writes:${run.id}:${normalizedPath}`,
          sourceId: runNodeId(run.id),
          targetId: artifactNodeId(normalizedPath),
          type: 'writes',
          label: 'runtime-output'
        });
      }
    }

    for (const flow of [...input.platform.flows, ...input.platform.subflows]) {
      pushNode(nodes, {
        id: flowNodeId(flow.kind, flow.id),
        kind: 'flow',
        title: flow.name,
        summary: flow.description,
        sourceId: flow.id,
        status: 'active',
        metadata: {
          flowKind: flow.kind,
          nodeCount: String(flow.nodes.length),
          edgeCount: String(flow.edges.length)
        }
      });

      for (const node of flow.nodes) {
        for (const ruleId of node.data.ruleBindingIds ?? []) {
          if (!knownRuleIds.has(ruleId)) continue;
          pushEdge(edges, {
            id: `flow-node-rule:${flow.id}:${node.id}:${ruleId}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: ruleNodeId(ruleId),
            type: 'binds',
            label: node.data.label || node.id
          });
        }

        const skillIds = new Set([
          ...(node.data.skillIds ?? []),
          ...((node.data.roleId ? rolesById.get(node.data.roleId)?.allowedSkillIds : undefined) ?? [])
        ]);
        for (const boundSkillId of skillIds) {
          const nextSkillNodeId = ensureSkillNode(boundSkillId, `${flow.name} / ${node.data.label || node.id}`);
          pushEdge(edges, {
            id: `flow-skill:${flow.id}:${node.id}:${boundSkillId}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: nextSkillNodeId,
            type: 'uses',
            label: node.data.label || node.id
          });
        }

        const outputArtifactPaths = [
          ...(node.data.artifactPath ? [node.data.artifactPath] : []),
          ...(node.data.outputArtifactPaths ?? []),
          ...(node.data.sharedBoardArtifactPath ? [node.data.sharedBoardArtifactPath] : [])
        ];
        for (const artifactPath of outputArtifactPaths) {
          const normalizedPath = ensureArtifactNode(artifactPath, `${flow.name} / ${node.data.label || node.id}`);
          pushEdge(edges, {
            id: `flow-writes:${flow.id}:${node.id}:${normalizedPath}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: artifactNodeId(normalizedPath),
            type: 'writes',
            label: node.data.label || 'writes'
          });
        }

        for (const artifactPath of node.data.inputArtifactPaths ?? []) {
          const normalizedPath = ensureArtifactNode(artifactPath, `${flow.name} / ${node.data.label || node.id}`);
          pushEdge(edges, {
            id: `flow-reads:${flow.id}:${node.id}:${normalizedPath}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: artifactNodeId(normalizedPath),
            type: 'reads',
            label: node.data.label || 'reads'
          });
        }

        if (node.data.subflowId) {
          pushEdge(edges, {
            id: `flow-subflow:${flow.id}:${node.id}:${node.data.subflowId}`,
            sourceId: flowNodeId(flow.kind, flow.id),
            targetId: flowNodeId('subflow', node.data.subflowId),
            type: 'contains',
            label: node.data.label || 'subflow'
          });
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      nodes: uniqueById(nodes),
      edges: uniqueById(edges)
    };
  }
}
