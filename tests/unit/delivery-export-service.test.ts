import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactSchemaAsset, RuntimeTemplateAsset } from '../../src/shared/types.js';

const browserWindowState = {
  options: null as null | {
    show?: boolean;
    webPreferences?: {
      sandbox?: boolean;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
    };
  },
  loadFile: vi.fn(async () => undefined),
  executeJavaScript: vi.fn(async () => true),
  printToPDF: vi.fn(async () => Buffer.from('pdf-output')),
  destroy: vi.fn(),
  isDestroyed: vi.fn(() => false)
};

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: typeof browserWindowState.options) {
      browserWindowState.options = options;
    }

    webContents = {
      executeJavaScript: browserWindowState.executeJavaScript,
      printToPDF: browserWindowState.printToPDF
    };

    loadFile = browserWindowState.loadFile;
    isDestroyed = browserWindowState.isDestroyed;
    destroy = browserWindowState.destroy;
  }
}));

describe('DeliveryExportService', () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    browserWindowState.options = null;
    while (roots.length) {
      fs.rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it('exports files using runtime export mapping definitions', async () => {
    const { DeliveryExportService } = await import('../../src/main/services/delivery-export-service.js');
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-export-'));
    roots.push(rootPath);

    const discoverPath = path.join(rootPath, '01-requirements', '原始需求.md');
    const clarifyPath = path.join(rootPath, '01-requirements', '需求澄清.md');
    fs.mkdirSync(path.dirname(discoverPath), { recursive: true });
    fs.writeFileSync(discoverPath, '# 原始需求\n\n内容 A\n', 'utf8');
    fs.writeFileSync(clarifyPath, '# 需求澄清\n\n内容 B\n', 'utf8');

    const roadmapPath = path.join(rootPath, 'roadmap.md');
    fs.writeFileSync(roadmapPath, '# roadmap', 'utf8');
    const changeRoot = path.join(rootPath, 'changes', 'p029');
    fs.mkdirSync(changeRoot, { recursive: true });
    fs.writeFileSync(path.join(changeRoot, 'proposal.md'), '# proposal', 'utf8');

    const template: RuntimeTemplateAsset = {
      id: 'software-factory',
      name: '软件工厂',
      description: '',
      defaultFlowId: 'flow-1',
      stageRoleIds: {
        discover: 'role',
        clarify: 'role',
        plan: 'role',
        draft: 'role',
        review: 'role',
        finalize: 'role'
      },
      stageDocuments: {
        discover: [
          { path: '01-requirements/原始需求.md', title: '原始需求', purpose: 'source', promptProfileId: 'prompt', validatorId: 'schema-md' }
        ],
        clarify: [
          { path: '01-requirements/需求澄清.md', title: '需求澄清', purpose: 'clarify', promptProfileId: 'prompt', validatorId: 'schema-md' }
        ],
        plan: [],
        draft: [],
        review: [],
        finalize: []
      },
      stageContracts: {
        discover: { stageId: 'discover', requiredArtifactPaths: ['01-requirements/原始需求.md'], validatorIds: ['schema-md'], blockingPolicy: 'all_required', allowManualBypass: false },
        clarify: { stageId: 'clarify', requiredArtifactPaths: ['01-requirements/需求澄清.md'], validatorIds: ['schema-md'], blockingPolicy: 'all_required', allowManualBypass: false },
        plan: { stageId: 'plan', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
      },
      review: {
        bluePromptProfileId: 'prompt',
        redPromptProfileId: 'prompt',
        judgePromptProfileId: 'prompt',
        validatorId: 'schema-md'
      },
      exportProfile: {
        markdown: true,
        text: true,
        pdf: true,
        openspec: true,
        custom: true
      },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'deliverables/md', fileNamePattern: '交付文档.md', transformProfile: 'markdown' },
        text: { enabled: true, artifactPaths: [], outputPathPattern: 'deliverables/txt', fileNamePattern: '交付文档.txt', transformProfile: 'text' },
        pdf: { enabled: true, artifactPaths: [], outputPathPattern: 'deliverables/pdf', fileNamePattern: '交付文档.pdf', transformProfile: 'pdf' },
        openspec: { enabled: true, artifactPaths: [], outputPathPattern: 'deliverables/openspec', fileNamePattern: 'spec-bundle', transformProfile: 'openspec' },
        custom: { enabled: true, artifactPaths: ['01-requirements/需求澄清.md'], outputPathPattern: 'deliverables/custom', fileNamePattern: '{stage}-{artifact}.md', transformProfile: 'copy' }
      }
    };

    const artifactSchemas: ArtifactSchemaAsset[] = [
      { id: 'schema-md', title: 'markdown', kind: 'markdown', requiredHeadings: ['#'] }
    ];

    const projectService = {
      loadWorkflow: vi.fn(() => ({
        stage: 'clarify',
        confirmedStages: ['discover', 'clarify']
      })),
      readFile: vi.fn((filePath: string) => fs.readFileSync(filePath, 'utf8'))
    };

    const service = new DeliveryExportService(projectService as any);

    const result = await service.exportDeterministicPackage({
      rootPath,
      template,
      artifactSchemas,
      changeName: 'p029',
      changeRoot,
      roadmapPath
    });

    expect(result.markdownPath).toBeTruthy();
    expect(result.textPath).toBeTruthy();
    expect(result.pdfPath).toBeTruthy();
    expect(result.openspecRoot).toBeTruthy();
    expect(result.customPaths).toHaveLength(1);

    expect(fs.existsSync(result.markdownPath!)).toBe(true);
    expect(fs.existsSync(result.textPath!)).toBe(true);
    expect(fs.existsSync(result.pdfPath!)).toBe(true);
    expect(fs.existsSync(path.join(result.openspecRoot!, 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.openspecRoot!, 'changes', 'p029', 'proposal.md'))).toBe(true);
    expect(fs.existsSync(result.customPaths[0])).toBe(true);
    expect(browserWindowState.options?.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    });

    expect(path.relative(result.exportRoot, path.dirname(result.markdownPath!)).replace(/\\/g, '/')).toBe('md');
    expect(path.relative(result.exportRoot, path.dirname(result.textPath!)).replace(/\\/g, '/')).toBe('txt');
    expect(path.relative(result.exportRoot, path.dirname(result.pdfPath!)).replace(/\\/g, '/')).toBe('pdf');
    expect(path.relative(result.exportRoot, result.openspecRoot!).replace(/\\/g, '/')).toBe('openspec/spec-bundle');
    expect(path.relative(result.exportRoot, path.dirname(result.customPaths[0])).replace(/\\/g, '/')).toBe('custom');

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')) as {
      exports: { customPaths: string[] };
    };
    expect(manifest.exports.customPaths).toHaveLength(1);
  });

  it('blocks export when required artifacts remain invalidated', async () => {
    const { DeliveryExportService } = await import('../../src/main/services/delivery-export-service.js');
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-export-blocked-'));
    roots.push(rootPath);

    const template: RuntimeTemplateAsset = {
      id: 'software-factory',
      name: '软件工厂',
      description: '',
      defaultFlowId: 'flow-1',
      stageRoleIds: {
        discover: 'role',
        clarify: 'role',
        plan: 'role',
        draft: 'role',
        review: 'role',
        finalize: 'role'
      },
      stageDocuments: {
        discover: [],
        clarify: [],
        plan: [],
        draft: [],
        review: [],
        finalize: []
      },
      stageContracts: {
        discover: { stageId: 'discover', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        clarify: { stageId: 'clarify', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        plan: { stageId: 'plan', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        draft: { stageId: 'draft', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        review: { stageId: 'review', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false },
        finalize: { stageId: 'finalize', requiredArtifactPaths: [], validatorIds: [], blockingPolicy: 'all_required', allowManualBypass: false }
      },
      review: {
        bluePromptProfileId: 'prompt',
        redPromptProfileId: 'prompt',
        judgePromptProfileId: 'prompt',
        validatorId: 'schema-md'
      },
      exportProfile: {
        markdown: true,
        text: false,
        pdf: false,
        openspec: false,
        custom: false
      },
      exportMapping: {
        markdown: { enabled: true, artifactPaths: [], outputPathPattern: 'deliverables/md', fileNamePattern: '交付文档.md', transformProfile: 'markdown' },
        text: { enabled: false, artifactPaths: [], outputPathPattern: 'deliverables/txt', fileNamePattern: '交付文档.txt', transformProfile: 'text' },
        pdf: { enabled: false, artifactPaths: [], outputPathPattern: 'deliverables/pdf', fileNamePattern: '交付文档.pdf', transformProfile: 'pdf' },
        openspec: { enabled: false, artifactPaths: [], outputPathPattern: 'deliverables/openspec', fileNamePattern: 'spec-bundle', transformProfile: 'openspec' },
        custom: { enabled: false, artifactPaths: [], outputPathPattern: 'deliverables/custom', fileNamePattern: '{stage}-{artifact}.md', transformProfile: 'copy' }
      }
    };

    const blocker = {
      id: 'invalidation-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifactPath: '02-solution/solution.md',
      title: 'Solution',
      purpose: 'Downstream solution',
      stage: 'plan' as const,
      status: 'active' as const,
      cause: 'upstream-revision' as const,
      severity: 'hard' as const,
      flowIds: ['flow-1'],
      nodeIds: ['node-plan'],
      downstreamArtifactPaths: [],
      recommendedNodeIds: ['node-plan'],
      requiredForExport: true,
      blockedExportFormats: ['markdown'] as const,
      message: 'Solution is stale.'
    };
    const persistExportBlock = vi.fn();

    const service = new DeliveryExportService(
      {
        loadWorkflow: vi.fn(() => ({ stage: 'plan', confirmedStages: ['plan'] })),
        readFile: vi.fn()
      } as any,
      {
        listExportBlockers: vi.fn(() => [blocker]),
        persistExportBlock: persistExportBlock
      } as any
    );

    await expect(service.exportDeterministicPackage({
      rootPath,
      template,
      artifactSchemas: [],
      changeName: 'p043',
      changeRoot: path.join(rootPath, 'change'),
      roadmapPath: path.join(rootPath, 'roadmap.md')
    })).rejects.toThrow(/Export blocked by invalidated artifacts: 02-solution\/solution\.md/);

    expect(persistExportBlock).toHaveBeenCalledWith(rootPath, [blocker]);
  });
});
