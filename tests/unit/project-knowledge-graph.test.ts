import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectKnowledgeGraphBuilder } from '../../src/main/services/project-knowledge-graph-builder.js';
import { findKnowledgeGraphPath } from '../../src/shared/project-knowledge-graph.js';
import type { KnowledgeLinkNode, PlatformAssets, ProjectKnowledgeGraph, RuleDefinition } from '../../src/shared/types.js';

describe('ProjectKnowledgeGraphBuilder', () => {
  it('emits flow, artifact, skill, document, rule, accumulation, promotion, and knowledge nodes', () => {
    const rootPath = 'E:/tmp/project';
    const rules: RuleDefinition[] = [
      {
        id: 'rule-1',
        name: 'Review rule',
        description: 'Review outputs must end with action items.',
        body: 'Always end with action items.',
        scope: 'node',
        enabled: true,
        category: 'quality',
        appliesTo: 'bound-only',
        priority: 0,
        source: 'manual',
        tags: [],
        flowId: 'flow-main',
        nodeId: 'node-review',
        provenanceEntryId: 'entry-1',
        createdAt: '2026-04-17T08:00:00.000Z',
        updatedAt: '2026-04-17T08:00:00.000Z'
      }
    ];
    const existingKnowledgeNodes: KnowledgeLinkNode[] = [
      {
        id: 'knowledge:accepted-1',
        kind: 'knowledge',
        title: 'Accepted review knowledge',
        summary: 'Accepted from accumulation.',
        sourceId: 'entry-1',
        status: 'accepted'
      }
    ];
    const platform: Pick<PlatformAssets, 'flows' | 'subflows' | 'roles'> = {
      flows: [
        {
          id: 'flow-main',
          kind: 'flow',
          name: 'Main Flow',
          description: 'Primary delivery flow.',
          createdAt: '2026-04-17T08:00:00.000Z',
          updatedAt: '2026-04-17T08:00:00.000Z',
          nodes: [
            {
              id: 'node-review',
              type: 'agent',
              position: { x: 0, y: 0 },
              data: {
                label: 'Review Node',
                roleId: 'role-review',
                skillIds: ['skill-inline'],
                ruleBindingIds: ['rule-1'],
                outputArtifactPaths: ['02-solution/review.md']
              }
            },
            {
              id: 'node-subflow',
              type: 'subflow',
              position: { x: 100, y: 0 },
              data: {
                label: 'Review Subflow',
                subflowId: 'subflow-review'
              }
            }
          ],
          edges: []
        }
      ],
      subflows: [
        {
          id: 'subflow-review',
          kind: 'subflow',
          name: 'Review Subflow',
          description: 'Subflow for review.',
          createdAt: '2026-04-17T08:00:00.000Z',
          updatedAt: '2026-04-17T08:00:00.000Z',
          nodes: [
            {
              id: 'sub-node-read',
              type: 'tool',
              position: { x: 0, y: 0 },
              data: {
                label: 'Read Artifact',
                inputArtifactPaths: ['01-requirements/brief.md']
              }
            }
          ],
          edges: []
        }
      ],
      roles: [
        {
          id: 'role-review',
          name: 'Reviewer',
          description: 'Handles review.',
          promptHint: 'Review.',
          allowedCapabilities: [],
          allowedSkillIds: ['skill-from-role'],
          outputSchema: 'markdown-basic',
          modelPolicy: {
            mode: 'fallback_to_active',
            preferredProfileIds: [],
            fallbackToActive: true
          }
        }
      ]
    };

    const graph = new ProjectKnowledgeGraphBuilder().build({
      rootPath,
      existingKnowledgeNodes,
      rules,
      accumulationEntries: [
        {
          id: 'entry-1',
          title: 'Review habit',
          summary: 'Always close with action items.',
          details: 'Derived from review reports.',
          category: 'writing-pattern',
          source: 'user',
          sourceDocumentPaths: [path.join(rootPath, '01-requirements', 'brief.md')],
          sourceRunId: 'run-1',
          tags: [],
          status: 'active',
          createdAt: '2026-04-17T08:00:00.000Z',
          updatedAt: '2026-04-17T08:00:00.000Z'
        }
      ],
      promotionDrafts: [
        {
          id: 'promotion-1',
          entryId: 'entry-1',
          targetKind: 'knowledge',
          status: 'accepted',
          proposedName: 'Review knowledge',
          summary: 'Promote to knowledge.',
          createdAt: '2026-04-17T08:00:00.000Z',
          updatedAt: '2026-04-17T08:00:00.000Z',
          appliedKnowledgeNodeId: 'knowledge:accepted-1'
        }
      ],
      platform,
      runtimeRuns: [
        {
          id: 'run-1',
          kind: 'stage',
          status: 'completed',
          createdAt: '2026-04-17T08:10:00.000Z',
          updatedAt: '2026-04-17T08:12:00.000Z',
          diagnostics: [],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.01 },
          outputs: [
            {
              id: 'output-1',
              createdAt: '2026-04-17T08:12:00.000Z',
              kind: 'final',
              label: 'Review Draft',
              contentType: 'markdown',
              content: '# review',
              artifactPath: path.join(rootPath, '03-openspec', 'review.md'),
              artifactTitle: 'review.md',
              accepted: true
            }
          ],
          checkpoints: [],
          flowId: 'flow-main',
          currentStep: 'Review Node'
        }
      ]
    });

    expect(graph.nodes.some((node) => node.kind === 'flow' && node.title === 'Main Flow')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'artifact' && node.summary === '02-solution/review.md')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'skill' && node.title === 'skill-inline')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'skill' && node.title === 'skill-from-role')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'document' && node.title === 'brief.md')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'document' && node.sourceId === '01-requirements/brief.md')).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'run' && node.sourceId === 'run-1')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'binds' && edge.targetId === 'rule:rule-1')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'writes' && edge.targetId === 'artifact:02-solution/review.md')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'reads' && edge.targetId === 'artifact:01-requirements/brief.md')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'contains' && edge.targetId === 'flow:subflow:subflow-review')).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceId === 'flow:flow:flow-main' && edge.targetId === 'run:run-1')).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceId === 'run:run-1' && edge.targetId === 'artifact:03-openspec/review.md')).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceId === 'run:run-1' && edge.targetId === 'accumulation:entry-1')).toBe(true);
  });

  it('finds deterministic shortest paths across persisted graph edges', () => {
    const graph: ProjectKnowledgeGraph = {
      generatedAt: '2026-04-17T08:00:00.000Z',
      nodes: [
        { id: 'flow:main', kind: 'flow', title: 'Main Flow', summary: 'flow' },
        { id: 'artifact:review', kind: 'artifact', title: 'review.md', summary: 'artifact' },
        { id: 'document:brief', kind: 'document', title: 'brief.md', summary: 'document' },
        { id: 'accumulation:entry', kind: 'accumulation', title: 'Entry', summary: 'entry' }
      ],
      edges: [
        { id: 'a', sourceId: 'flow:main', targetId: 'artifact:review', type: 'writes', label: 'writes' },
        { id: 'b', sourceId: 'document:brief', targetId: 'accumulation:entry', type: 'references', label: 'evidence' },
        { id: 'c', sourceId: 'accumulation:entry', targetId: 'artifact:review', type: 'derived-from', label: 'feeds' }
      ]
    };

    const pathResult = findKnowledgeGraphPath(graph, 'document:brief', 'flow:main');
    expect(pathResult).not.toBeNull();
    expect(pathResult?.steps.map((step) => step.edge.id)).toEqual(['b', 'c', 'a']);
    expect(pathResult?.nodes.map((node) => node.id)).toEqual([
      'document:brief',
      'accumulation:entry',
      'artifact:review',
      'flow:main'
    ]);
  });
});
