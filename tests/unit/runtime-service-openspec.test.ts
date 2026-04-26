import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../../src/main/services/runtime-service.js';
import { parseTemplatePackage } from '../../src/shared/template-package.js';
import { normalizeRuntimeTemplate, resolveRuntimeExportMapping } from '../../src/shared/runtime-template.js';
import type { RuntimeTemplateAsset } from '../../src/shared/types.js';

function loadTemplate(fileName: string): RuntimeTemplateAsset {
  const raw = fs.readFileSync(path.join(process.cwd(), 'src', 'shared', 'template-packages', fileName), 'utf8');
  return normalizeRuntimeTemplate(parseTemplatePackage(raw).runtime.template);
}

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('RuntimeService OpenSpec handoff', () => {
  it('builds handoff artifacts from template-selected source documents instead of fixed software-factory paths', async () => {
    const template = loadTemplate('gstack-office-hours.json');
    template.exportMapping = {
      ...resolveRuntimeExportMapping(template),
      openspec: {
        enabled: true,
        artifactPaths: [],
        outputPathPattern: 'handoff/openspec/exports',
        fileNamePattern: 'package',
        transformProfile: 'openspec'
      }
    };

    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-openspec-'));
    tempRoots.push(rootPath);
    fs.mkdirSync(path.join(rootPath, '01-office-hours'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, '01-office-hours', '01-demand-reality.md'), '# Demand Reality\n\nNeed office hours.\n', 'utf8');
    fs.writeFileSync(path.join(rootPath, '01-office-hours', '02-status-quo.md'), '# Status Quo\n\nCurrent onboarding is manual.\n', 'utf8');
    fs.writeFileSync(path.join(rootPath, '01-office-hours', '03-ideal-profile.md'), '# Ideal Profile\n\nTeam leads.\n', 'utf8');
    fs.writeFileSync(path.join(rootPath, '01-office-hours', '04-narrowest-wedge.md'), '# Narrowest Wedge\n\nStart with onboarding.\n', 'utf8');
    fs.writeFileSync(path.join(rootPath, '01-office-hours', '05-observation-and-surprise.md'), '# Observation\n\nUsers ask the same questions.\n', 'utf8');

    const projectService = {
      loadWorkflow: vi.fn(() => ({ stage: 'plan', confirmedStages: ['discover', 'clarify', 'plan'] })),
      openProject: vi.fn(() => ({ manifest: { name: 'Office Hours', templateId: 'gstack-office-hours' } })),
      readFile: vi.fn((filePath: string) => fs.readFileSync(filePath, 'utf8')),
      saveFile: vi.fn((filePath: string, content: string) => {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf8');
      }),
      createDirectory: vi.fn((projectRoot: string, parentPath: string, name: string) => {
        const absoluteParent = path.isAbsolute(parentPath) ? parentPath : path.join(projectRoot, parentPath);
        const target = path.join(absoluteParent, name);
        fs.mkdirSync(target, { recursive: true });
        return target;
      })
    };

    const deliveryExporter = {
      exportDeterministicPackage: vi.fn(async () => ({
        exportRoot: path.join(rootPath, 'handoff', 'openspec', 'exports', 'mock-run'),
        markdownPath: null,
        textPath: null,
        pdfPath: null,
        openspecRoot: path.join(rootPath, 'handoff', 'openspec'),
        customPaths: [],
        manifestPath: path.join(rootPath, 'handoff', 'openspec', 'exports', 'mock-run', 'manifest.json')
      }))
    };

    const service = new RuntimeService(
      projectService as never,
      {
        loadTemplate: vi.fn(() => template),
        loadArtifactSchemas: vi.fn(() => [])
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      deliveryExporter as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    const result = await service.generateOpenSpec(rootPath);
    const proposal = fs.readFileSync(path.join(result.changeRoot, 'proposal.md'), 'utf8');
    const roadmap = fs.readFileSync(path.join(result.roadmapPath), 'utf8');
    const tasks = fs.readFileSync(path.join(result.changeRoot, 'tasks.md'), 'utf8');

    expect(result.changeRoot).toContain(path.join('handoff', 'openspec', 'changes'));
    expect(proposal).toContain('01-office-hours/01-demand-reality.md');
    expect(proposal).toContain('01-office-hours/04-narrowest-wedge.md');
    expect(proposal).not.toContain('01-requirements/');
    expect(tasks).toContain('`01-office-hours/`');
    expect(tasks).toContain('`handoff/openspec/exports/`');
    expect(tasks).not.toContain('03-openspec/exports/');
    expect(roadmap).toContain('Office Hours');
    expect(deliveryExporter.exportDeterministicPackage).toHaveBeenCalled();
  });

  it('rejects OpenSpec handoff when the template does not enable it', async () => {
    const template = loadTemplate('gstack-office-hours.json');
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-openspec-disabled-'));
    tempRoots.push(rootPath);

    const service = new RuntimeService(
      {
        loadWorkflow: vi.fn(() => ({ stage: 'plan', confirmedStages: ['discover', 'clarify', 'plan'] })),
        openProject: vi.fn(() => ({ manifest: { name: 'Office Hours', templateId: 'gstack-office-hours' } }))
      } as never,
      {
        loadTemplate: vi.fn(() => template)
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { exportDeterministicPackage: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.generateOpenSpec(rootPath)).rejects.toThrow('Current template does not enable OpenSpec handoff.');
  });
});
