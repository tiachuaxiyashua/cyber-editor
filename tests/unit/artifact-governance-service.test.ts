import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ArtifactSchemaAsset,
  PlatformFlowAsset,
  RuntimeTemplateAsset
} from '../../src/shared/types.js';
import { ArtifactGovernanceService } from '../../src/main/services/artifact-governance-service.js';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function sleep(ms = 8) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTemplate(): RuntimeTemplateAsset {
  return {
    id: 'template-artifact-governance',
    name: 'Artifact Governance Template',
    description: '',
    defaultFlowId: 'flow-main',
    stageRoleIds: {
      discover: 'role-discover',
      clarify: 'role-discover',
      plan: 'role-plan',
      draft: 'role-plan',
      review: 'role-plan',
      finalize: 'role-plan'
    },
    stageDocuments: {
      discover: [
        {
          path: '01-requirements/brief.md',
          title: 'Brief',
          purpose: 'Upstream brief',
          promptProfileId: 'prompt-discover',
          validatorId: 'schema-brief'
        }
      ],
      clarify: [],
      plan: [
        {
          path: '02-solution/solution.md',
          title: 'Solution',
          purpose: 'Downstream solution',
          promptProfileId: 'prompt-plan',
          validatorId: 'schema-solution'
        }
      ],
      draft: [],
      review: [],
      finalize: []
    },
    stageContracts: {
      discover: {
        stageId: 'discover',
        requiredArtifactPaths: ['01-requirements/brief.md'],
        validatorIds: ['schema-brief'],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      },
      clarify: {
        stageId: 'clarify',
        requiredArtifactPaths: [],
        validatorIds: [],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      },
      plan: {
        stageId: 'plan',
        requiredArtifactPaths: ['02-solution/solution.md'],
        validatorIds: ['schema-solution'],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      },
      draft: {
        stageId: 'draft',
        requiredArtifactPaths: [],
        validatorIds: [],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      },
      review: {
        stageId: 'review',
        requiredArtifactPaths: [],
        validatorIds: [],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      },
      finalize: {
        stageId: 'finalize',
        requiredArtifactPaths: [],
        validatorIds: [],
        blockingPolicy: 'all_required',
        allowManualBypass: false
      }
    },
    review: {
      bluePromptProfileId: 'prompt-plan',
      redPromptProfileId: 'prompt-plan',
      judgePromptProfileId: 'prompt-plan',
      validatorId: 'schema-solution'
    },
    exportProfile: {
      markdown: true,
      text: false,
      pdf: false,
      openspec: false,
      custom: false
    },
    exportMapping: {
      markdown: {
        enabled: true,
        artifactPaths: ['02-solution/solution.md'],
        outputPathPattern: 'exports/markdown',
        fileNamePattern: 'delivery.md',
        transformProfile: 'markdown'
      },
      text: {
        enabled: false,
        artifactPaths: [],
        outputPathPattern: 'exports/text',
        fileNamePattern: 'delivery.txt',
        transformProfile: 'text'
      },
      pdf: {
        enabled: false,
        artifactPaths: [],
        outputPathPattern: 'exports/pdf',
        fileNamePattern: 'delivery.pdf',
        transformProfile: 'pdf'
      },
      openspec: {
        enabled: false,
        artifactPaths: [],
        outputPathPattern: 'exports/openspec',
        fileNamePattern: 'openspec',
        transformProfile: 'openspec'
      },
      custom: {
        enabled: false,
        artifactPaths: [],
        outputPathPattern: 'exports/custom',
        fileNamePattern: 'artifact-{index}.md',
        transformProfile: 'copy'
      }
    }
  };
}

function createSchemas(): ArtifactSchemaAsset[] {
  return [
    {
      id: 'schema-brief',
      title: 'Brief schema',
      kind: 'markdown',
      requiredHeadings: ['#']
    },
    {
      id: 'schema-solution',
      title: 'Solution schema',
      kind: 'markdown',
      requiredHeadings: ['#', '##']
    }
  ];
}

function createFlow(): PlatformFlowAsset {
  return {
    id: 'flow-main',
    name: 'Flow Main',
    description: '',
    kind: 'flow',
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    nodes: [
      {
        id: 'node-discover',
        type: 'agent',
        position: { x: 80, y: 120 },
        data: {
          label: 'Discover',
          roleId: 'role-discover',
          outputArtifactPaths: ['01-requirements/brief.md'],
          outputFormat: 'markdown'
        }
      },
      {
        id: 'node-plan',
        type: 'agent',
        position: { x: 360, y: 120 },
        data: {
          label: 'Plan',
          roleId: 'role-plan',
          inputArtifactPaths: ['01-requirements/brief.md'],
          outputArtifactPaths: ['02-solution/solution.md'],
          outputFormat: 'markdown'
        }
      }
    ],
    edges: [
      {
        id: 'edge-discover-plan',
        source: 'node-discover',
        target: 'node-plan',
        branch: 'default'
      }
    ]
  };
}

function seedRuntime(rootPath: string, flowOverride?: PlatformFlowAsset) {
  const template = createTemplate();
  const schemas = createSchemas();
  const flow = flowOverride ?? createFlow();
  writeJson(path.join(rootPath, '.project', 'runtime', 'templates', 'template.json'), template);
  for (const schema of schemas) {
    writeJson(path.join(rootPath, '.project', 'runtime', 'artifact-schemas', `${schema.id}.json`), schema);
  }
  writeJson(path.join(rootPath, '.project', 'platform', 'flows', `${flow.id}.json`), flow);
}

describe('ArtifactGovernanceService', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('tracks revisions, propagates invalidation, and resolves after downstream rewrite', async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-artifact-governance-'));
    roots.push(rootPath);
    seedRuntime(rootPath);

    const service = new ArtifactGovernanceService();
    const briefPath = path.join(rootPath, '01-requirements', 'brief.md');
    const solutionPath = path.join(rootPath, '02-solution', 'solution.md');
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.mkdirSync(path.dirname(solutionPath), { recursive: true });

    fs.writeFileSync(briefPath, '# Brief\n\nInitial brief\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: briefPath,
      previousContents: '',
      nextContents: '# Brief\n\nInitial brief\n',
      source: 'editor-save',
      nodeId: 'node-discover',
      stage: 'discover'
    });
    await sleep();

    fs.writeFileSync(solutionPath, '# Solution\n\n## Plan\n\nInitial solution\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: solutionPath,
      previousContents: '',
      nextContents: '# Solution\n\n## Plan\n\nInitial solution\n',
      source: 'editor-save',
      nodeId: 'node-plan',
      stage: 'plan'
    });

    expect(service.listArtifactInvalidations(rootPath, { activeOnly: true })).toHaveLength(0);
    expect(service.listArtifactRevisions(rootPath)).toHaveLength(2);

    await sleep();
    fs.writeFileSync(briefPath, '# Brief\n\nUpdated brief\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: briefPath,
      previousContents: '# Brief\n\nInitial brief\n',
      nextContents: '# Brief\n\nUpdated brief\n',
      source: 'editor-save',
      nodeId: 'node-discover',
      stage: 'discover'
    });

    const activeInvalidations = service.listArtifactInvalidations(rootPath, { activeOnly: true });
    expect(activeInvalidations).toHaveLength(1);
    expect(activeInvalidations[0]?.artifactPath).toBe('02-solution/solution.md');
    expect(activeInvalidations[0]?.cause).toBe('upstream-revision');
    expect(activeInvalidations[0]?.recommendedNodeIds).toContain('node-plan');
    expect(activeInvalidations[0]?.requiredForExport).toBe(true);

    await sleep();
    fs.writeFileSync(solutionPath, '# Solution\n\n## Plan\n\nUpdated solution\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: solutionPath,
      previousContents: '# Solution\n\n## Plan\n\nInitial solution\n',
      nextContents: '# Solution\n\n## Plan\n\nUpdated solution\n',
      source: 'editor-save',
      nodeId: 'node-plan',
      stage: 'plan'
    });

    expect(service.listArtifactInvalidations(rootPath, { activeOnly: true })).toHaveLength(0);
    expect(
      service.listArtifactInvalidations(rootPath).some(
        (item) => item.artifactPath === '02-solution/solution.md' && item.status === 'resolved'
      )
    ).toBe(true);

    const artifactEvidenceDir = path.join(rootPath, '.project', 'evidence', 'artifacts');
    expect(fs.existsSync(artifactEvidenceDir)).toBe(true);
    expect(fs.readdirSync(artifactEvidenceDir).length).toBeGreaterThan(0);
  });

  it('invalidates downstream artifacts when the producer contract changes', async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-artifact-contract-drift-'));
    roots.push(rootPath);
    seedRuntime(rootPath);

    const service = new ArtifactGovernanceService();
    const briefPath = path.join(rootPath, '01-requirements', 'brief.md');
    const solutionPath = path.join(rootPath, '02-solution', 'solution.md');
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.mkdirSync(path.dirname(solutionPath), { recursive: true });

    fs.writeFileSync(briefPath, '# Brief\n\nInitial brief\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: briefPath,
      previousContents: '',
      nextContents: '# Brief\n\nInitial brief\n',
      source: 'editor-save',
      nodeId: 'node-discover',
      stage: 'discover'
    });
    await sleep();

    fs.writeFileSync(solutionPath, '# Solution\n\n## Plan\n\nInitial solution\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: solutionPath,
      previousContents: '',
      nextContents: '# Solution\n\n## Plan\n\nInitial solution\n',
      source: 'editor-save',
      nodeId: 'node-plan',
      stage: 'plan'
    });

    const driftedFlow = createFlow();
    driftedFlow.updatedAt = '2026-04-15T00:01:00.000Z';
    driftedFlow.nodes = driftedFlow.nodes.map((node) =>
      node.id === 'node-plan'
        ? {
            ...node,
            data: {
              ...node.data,
              outputFormat: 'json'
            }
          }
        : node
    );
    writeJson(path.join(rootPath, '.project', 'platform', 'flows', `${driftedFlow.id}.json`), driftedFlow);

    const recomputed = service.recompute(rootPath);
    const activeInvalidation = recomputed.invalidations.find(
      (item) => item.artifactPath === '02-solution/solution.md' && item.status === 'active'
    );
    expect(activeInvalidation?.cause).toBe('contract-changed');
    expect(activeInvalidation?.recommendedNodeIds).toContain('node-plan');
  });

  it('treats new orchestration contract fields as producer-signature drift', async () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-artifact-runtime-contract-drift-'));
    roots.push(rootPath);
    seedRuntime(rootPath);

    const service = new ArtifactGovernanceService();
    const briefPath = path.join(rootPath, '01-requirements', 'brief.md');
    const solutionPath = path.join(rootPath, '02-solution', 'solution.md');
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.mkdirSync(path.dirname(solutionPath), { recursive: true });

    fs.writeFileSync(briefPath, '# Brief\n\nInitial brief\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: briefPath,
      previousContents: '',
      nextContents: '# Brief\n\nInitial brief\n',
      source: 'editor-save',
      nodeId: 'node-discover',
      stage: 'discover'
    });
    await sleep();

    fs.writeFileSync(solutionPath, '# Solution\n\n## Plan\n\nInitial solution\n', 'utf8');
    service.recordTrackedArtifactWrite({
      rootPath,
      filePath: solutionPath,
      previousContents: '',
      nextContents: '# Solution\n\n## Plan\n\nInitial solution\n',
      source: 'editor-save',
      nodeId: 'node-plan',
      stage: 'plan'
    });

    const driftedFlow = createFlow();
    driftedFlow.updatedAt = '2026-04-15T00:02:00.000Z';
    driftedFlow.nodes = driftedFlow.nodes.map((node) =>
      node.id === 'node-plan'
        ? {
            ...node,
            type: 'subflow',
            data: {
              ...node.data,
              subflowId: 'subflow-review',
              subflowInputBindings: ['01-requirements/brief.md=>sub/input.md'],
              subflowOutputBindings: ['sub/output.md=>02-solution/solution.md']
            }
          }
        : node
    );
    writeJson(path.join(rootPath, '.project', 'platform', 'flows', `${driftedFlow.id}.json`), driftedFlow);

    const recomputed = service.recompute(rootPath);
    const activeInvalidation = recomputed.invalidations.find(
      (item) => item.artifactPath === '02-solution/solution.md' && item.status === 'active'
    );
    expect(activeInvalidation?.cause).toBe('contract-changed');
    expect(activeInvalidation?.recommendedNodeIds).toContain('node-plan');
  });
});
