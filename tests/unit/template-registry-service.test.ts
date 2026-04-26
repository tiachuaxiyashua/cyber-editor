import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectTemplatePackage } from '../../src/shared/types.js';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-template-registry-user-data-'));
const tempRoots: string[] = [];
const lookupMock = vi.hoisted(() => vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]));

vi.mock('node:dns/promises', () => ({
  lookup: lookupMock
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd()
  }
}));

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function loadTemplateFixture(): ProjectTemplatePackage {
  const filePath = path.join(process.cwd(), 'src', 'shared', 'template-packages', 'software-factory.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProjectTemplatePackage;
}

function makeTemplatePackage(id: string, name: string, version: string) {
  const templatePackage = loadTemplateFixture();
  templatePackage.definition = {
    ...templatePackage.definition,
    id,
    name,
    source: 'local',
    version
  };
  templatePackage.runtime.template = {
    ...templatePackage.runtime.template,
    id,
    name
  };
  return templatePackage;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fs.rmSync(path.join(userDataRoot, 'templates'), { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('TemplateRegistryService lifecycle metadata', () => {
  it('keeps installed templates data-driven even when the id was historically retired', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js');
    const service = new TemplateRegistryService();

    const registryRoot = path.join(userDataRoot, 'templates');
    const installedRoot = path.join(registryRoot, 'installed', 'video-script-lab');
    fs.mkdirSync(installedRoot, { recursive: true });
    const packageFile = path.join(installedRoot, 'template-package.json');
    fs.writeFileSync(packageFile, '{bad json', 'utf8');
    fs.writeFileSync(
      path.join(registryRoot, 'index.json'),
      JSON.stringify([
        {
          id: 'video-script-lab',
          name: 'Legacy Template Still Visible',
          packageFile,
          installedAt: '2026-04-17T00:00:00.000Z',
          packageUrl: 'local:C:/templates/video-script-lab',
          version: '1.0.0'
        }
      ], null, 2),
      'utf8'
    );

    const legacy = service.listTemplates().find((template) => template.id === 'video-script-lab');

    expect(legacy).toBeTruthy();
    expect(legacy?.health).toBe('corrupt');
    expect(fs.existsSync(installedRoot)).toBe(true);
  });

  it('keeps corrupt installed templates visible as blocked entries', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js');
    const service = new TemplateRegistryService();

    const registryRoot = path.join(userDataRoot, 'templates');
    const installedRoot = path.join(registryRoot, 'installed', 'broken-template');
    fs.mkdirSync(installedRoot, { recursive: true });
    const packageFile = path.join(installedRoot, 'template-package.json');
    fs.writeFileSync(packageFile, '{bad json', 'utf8');
    fs.writeFileSync(
      path.join(registryRoot, 'index.json'),
      JSON.stringify([
        {
          id: 'broken-template',
          name: 'Broken Template',
          packageFile,
          installedAt: '2026-04-13T00:00:00.000Z',
          packageUrl: 'local:C:/templates/broken-template',
          version: '1.0.0'
        }
      ], null, 2),
      'utf8'
    );

    const broken = service.listTemplates().find((template) => template.id === 'broken-template');

    expect(broken).toBeTruthy();
    expect(broken?.health).toBe('corrupt');
    expect(broken?.trust).toBe('blocked');
    expect(broken?.repairable).toBe(true);
    expect(broken?.issueMessage).toBeTruthy();
  });

  it('repairs a corrupt local template from its recorded source', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js');
    const service = new TemplateRegistryService();

    const sourceRoot = tempRoot('cyber-editor-template-source-');
    const packagePath = path.join(sourceRoot, 'template-package.json');
    fs.writeFileSync(packagePath, JSON.stringify(makeTemplatePackage('repairable-template', 'Repairable Template', '1.0.0'), null, 2), 'utf8');

    service.installFromPath(sourceRoot, { approved: true });

    const installedPackageFile = path.join(userDataRoot, 'templates', 'installed', 'repairable-template', 'template-package.json');
    fs.writeFileSync(installedPackageFile, '{broken json', 'utf8');

    const brokenBeforeRepair = service.listTemplates().find((template) => template.id === 'repairable-template');
    expect(brokenBeforeRepair?.health).toBe('corrupt');

    await service.repairTemplate('repairable-template');

    const repaired = service.listTemplates().find((template) => template.id === 'repairable-template');
    expect(repaired?.health).toBe('healthy');
    expect(repaired?.trust).toBe('trusted');
  });

  it('marks remote templates as update-available after checking the upstream package', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js');
    const service = new TemplateRegistryService();

    const currentPackage = makeTemplatePackage('remote-template', 'Remote Template', '1.0.0');
    service.installPackageObject(currentPackage, 'https://example.com/remote-template.json');

    const newerPackage = makeTemplatePackage('remote-template', 'Remote Template', '1.2.0');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(newerPackage)
    }));

    await service.checkForUpdate('remote-template');

    const remoteTemplate = service.listTemplates().find((template) => template.id === 'remote-template');
    expect(remoteTemplate?.health).toBe('update-available');
    expect(remoteTemplate?.updatable).toBe(true);
    expect(remoteTemplate?.source).toBe('remote');
  });

  it('requires explicit approval before installing remote templates from url payloads', async () => {
    const { TemplateRegistryService } = await import('../../src/main/services/template-registry-service.js');
    const service = new TemplateRegistryService();
    const remotePackage = makeTemplatePackage('remote-template-approved', 'Remote Template Approved', '1.0.0');
    remotePackage.definition.source = 'remote';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify(remotePackage)
    }));

    await expect(service.installFromUrl('https://example.com/remote-template-approved.json')).rejects.toThrow('requires explicit review approval');

    const installed = await service.installFromUrl('https://example.com/remote-template-approved.json', { approved: true });
    expect(installed.id).toBe('remote-template-approved');
    expect(service.listTemplates().find((template) => template.id === 'remote-template-approved')?.trust).toBe('review');
  });
});
