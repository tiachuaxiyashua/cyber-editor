import { describe, expect, it } from 'vitest';
import type { RuntimeTemplateAsset } from '../../src/shared/types.js';
import {
  buildDefaultStageContracts,
  normalizeRuntimeTemplate,
  resolveRuntimeExportMapping,
  validateRuntimeTemplateContracts
} from '../../src/shared/runtime-template.js';
import { normalizeFlowAssetPaths, normalizeFlowPathConfig } from '../../src/main/services/runtime-template-paths.js';

function createTemplate(): RuntimeTemplateAsset {
  return {
    id: 'template-1',
    name: 'Template 1',
    description: 'test',
    defaultFlowId: 'flow-1',
    stageRoleIds: {
      discover: 'role-discover',
      clarify: 'role-clarify',
      plan: 'role-plan',
      draft: 'role-draft',
      review: 'role-review',
      finalize: 'role-finalize'
    },
    stageDocuments: {
      discover: [{ path: '01/input.md', title: 'Input', purpose: 'Collect input', promptProfileId: 'prompt-discover', validatorId: 'schema-md' }],
      clarify: [{ path: '01/clarify.md', title: 'Clarify', purpose: 'Clarify input', promptProfileId: 'prompt-clarify', validatorId: 'schema-md' }],
      plan: [{ path: '02/plan.md', title: 'Plan', purpose: 'Plan work', promptProfileId: 'prompt-plan', validatorId: 'schema-md' }],
      draft: [{ path: '02/draft.md', title: 'Draft', purpose: 'Draft output', promptProfileId: 'prompt-draft', validatorId: 'schema-md' }],
      review: [{ path: '02/review.md', title: 'Review', purpose: 'Review output', promptProfileId: 'prompt-review', validatorId: 'schema-md' }],
      finalize: [{ path: '03/final.md', title: 'Final', purpose: 'Finalize output', promptProfileId: 'prompt-finalize', validatorId: 'schema-md' }]
    },
    review: {
      bluePromptProfileId: 'prompt-review',
      redPromptProfileId: 'prompt-review',
      judgePromptProfileId: 'prompt-review',
      validatorId: 'schema-md'
    },
    exportProfile: {
      markdown: true,
      text: true,
      pdf: false,
      openspec: true,
      custom: false
    }
  };
}

describe('runtime-template helpers', () => {
  it('normalizes flow path config against the project root', () => {
    const config = normalizeFlowPathConfig('E:/repo/project', {
      inputRoot: 'docs/in',
      outputRoot: 'docs/out',
      inheritProjectRoot: true
    });

    expect(config.inputRoot).toBe('docs/in');
    expect(config.outputRoot).toBe('docs/out');
    expect(config.resolvedInputRoot).toContain('docs');
    expect(config.resolvedOutputRoot).toContain('out');
  });

  it('builds stage contracts and export mapping defaults from stage documents', () => {
    const template = normalizeRuntimeTemplate(createTemplate());
    const contracts = buildDefaultStageContracts(template);
    const exportMapping = resolveRuntimeExportMapping(template);

    expect(contracts.discover.requiredArtifactPaths).toEqual(['01/input.md']);
    expect(exportMapping.markdown.enabled).toBe(true);
    expect(exportMapping.markdown.outputPathPattern).toBe('exports/markdown');
    expect(exportMapping.openspec.outputPathPattern).toBe('exports/openspec');
    expect(exportMapping.custom.enabled).toBe(false);
  });

  it('normalizes stage and review execution profile bindings while preserving legacy stage roles', () => {
    const template = createTemplate();
    template.stageExecutionProfiles = {
      discover: {
        roleId: 'role-discover',
        taskTemplateId: 'task-discover',
        agentProfileId: 'agent-discover'
      }
    };
    template.review.executionProfiles = {
      blue: {
        roleId: 'role-review',
        taskTemplateId: 'task-review',
        agentProfileId: 'agent-review'
      }
    };

    const normalized = normalizeRuntimeTemplate(template);

    expect(normalized.stageRoleIds.discover).toBe('role-discover');
    expect(normalized.stageExecutionProfiles?.discover).toEqual({
      roleId: 'role-discover',
      taskTemplateId: 'task-discover',
      agentProfileId: 'agent-discover'
    });
    expect(normalized.review.executionProfiles?.blue).toEqual({
      roleId: 'role-review',
      taskTemplateId: 'task-review',
      agentProfileId: 'agent-review'
    });
  });

  it('fills orchestration runtime defaults for loop, parallel, and subflow nodes', () => {
    const normalized = normalizeFlowAssetPaths('E:/repo/project', {
      id: 'flow-runtime-defaults',
      name: 'Flow runtime defaults',
      description: '',
      kind: 'flow',
      createdAt: '2026-04-15T00:00:00.000Z',
      updatedAt: '2026-04-15T00:00:00.000Z',
      nodes: [
        { id: 'loop', type: 'loop', position: { x: 0, y: 0 }, data: { label: 'Loop', loopExpression: 'again', exitExpression: 'done', loopBackTargetId: 'a', exitTargetId: 'b' } },
        { id: 'split', type: 'parallel_split', position: { x: 0, y: 0 }, data: { label: 'Split' } },
        { id: 'join', type: 'parallel_join', position: { x: 0, y: 0 }, data: { label: 'Join' } },
        { id: 'subflow', type: 'subflow', position: { x: 0, y: 0 }, data: { label: 'Subflow', subflowInputBindings: ['a=>b', 'a=>b'], subflowOutputBindings: ['c=>d', ''] } }
      ],
      edges: []
    });

    expect(normalized.nodes.find((node: { id: string }) => node.id === 'loop')?.data.loopFailurePolicy).toBe('guard_fail');
    expect(normalized.nodes.find((node: { id: string }) => node.id === 'loop')?.data.maxIterations).toBe(3);
    expect(normalized.nodes.find((node: { id: string }) => node.id === 'split')?.data.parallelCancellationPolicy).toBe('wait_all');
    expect(normalized.nodes.find((node: { id: string }) => node.id === 'join')?.data.mergeStrategy).toBe('collect_all');
    expect(normalized.nodes.find((node: { id: string }) => node.id === 'subflow')?.data.subflowInputBindings).toEqual(['a=>b']);
    expect(normalized.nodes.find((node: { id: string }) => node.id === 'subflow')?.data.subflowOutputBindings).toEqual(['c=>d']);
  });

  it('reports invalid contract references and invalid export mapping fields', () => {
    const template = createTemplate();
    template.stageContracts = {
      ...buildDefaultStageContracts(template),
      discover: {
        stageId: 'discover',
        requiredArtifactPaths: ['does-not-exist.md'],
        validatorIds: ['missing-schema'],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      }
    };
    template.exportMapping = {
      ...resolveRuntimeExportMapping(template),
      markdown: {
        enabled: true,
        artifactPaths: ['does-not-exist.md'],
        outputPathPattern: '../bad',
        fileNamePattern: 'nested/path.md',
        transformProfile: ''
      }
    };

    const issues = validateRuntimeTemplateContracts(
      template,
      new Set(['prompt-discover', 'prompt-clarify', 'prompt-plan', 'prompt-draft', 'prompt-review', 'prompt-finalize']),
      new Set(['schema-md']),
      new Map()
    );

    expect(issues.some((issue) => issue.message.includes('does-not-exist.md'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('missing-schema'))).toBe(true);
  });
});
