import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    })
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}));

function reviewGate(id: string, summary: string) {
  return {
    id,
    createdAt: '2026-04-21T00:00:00.000Z',
    scope: 'resource-import',
    targetKind: 'template',
    targetId: 'resource-id',
    sourceLabel: 'https://example.com/resource.json',
    trust: 'review',
    compatibility: 'current',
    health: 'warning',
    summary,
    issues: [{ code: 'remote.requires-review', severity: 'warning', message: summary }],
    recommendedAction: 'approve'
  };
}

function verification(id: string) {
  return {
    id,
    createdAt: '2026-04-21T00:00:00.000Z',
    kind: 'template',
    resourceId: 'resource-id',
    sourceLabel: 'https://example.com/resource.json',
    sourcePath: 'https://example.com/resource.json',
    trust: 'review',
    compatibility: 'current',
    health: 'warning',
    issueMessage: 'needs review',
    reviewGateId: 'review-id'
  };
}

describe('registerResourceIpc', () => {
  beforeEach(() => {
    handlers.clear();
    vi.resetModules();
  });

  it('routes template URL installs through completeGovernedInstall and requires approval before installation', async () => {
    const { registerResourceIpc } = await import('../../src/main/ipc/register-resource-ipc.js');
    const governed = {
      packageValue: {
        definition: { id: 'remote-template' }
      },
      review: reviewGate('review-id', 'Remote template requires review.'),
      verification: verification('verification-id')
    };
    const inspectTemplatePackageFromUrl = vi.fn(async () => governed);
    const installTemplatePackage = vi.fn(() => ({ id: 'remote-template' }));
    const markRecentTemplate = vi.fn();
    const markRecentResource = vi.fn();
    const completeGovernedInstall = vi.fn((_kind, targetPath, approved, passed, install) => {
      if (approved) {
        install(passed.packageValue);
        return {
          status: 'installed',
          kind: 'template',
          targetPath,
          bootstrap: { project: null },
          review: passed.review,
          verification: passed.verification
        };
      }
      return {
        status: 'review-required',
        kind: 'template',
        targetPath,
        review: passed.review,
        verification: passed.verification
      };
    });

    registerResourceIpc({
      platformService: {
        inspectTemplatePackageFromUrl,
        installTemplatePackage
      },
      settingsStore: {
        markRecentTemplate,
        markRecentResource
      },
      completeGovernedInstall,
      buildBootstrap: vi.fn(() => ({ project: null })),
      getActiveProjectRoot: vi.fn(() => null),
      getMainWindow: vi.fn(),
      runtimeService: {},
      requireActiveRoot: vi.fn(),
      skillRegistry: { loadCatalog: vi.fn() },
      rolePackageRegistry: { loadCatalog: vi.fn() },
      projectService: { appendAudit: vi.fn(), loadProjectSkillIds: vi.fn(() => []), loadSessionSkillIds: vi.fn(() => ({})) },
      resourceGovernance: {}
    } as any);

    const handler = handlers.get('templates:install-url');
    expect(handler).toBeTypeOf('function');

    await expect(handler?.({}, 'https://example.com/template.json')).resolves.toMatchObject({ status: 'review-required' });
    expect(installTemplatePackage).not.toHaveBeenCalled();
    expect(markRecentTemplate).not.toHaveBeenCalled();

    await expect(handler?.({}, 'https://example.com/template.json', true)).resolves.toMatchObject({ status: 'installed' });
    expect(inspectTemplatePackageFromUrl).toHaveBeenCalledWith('https://example.com/template.json');
    expect(completeGovernedInstall).toHaveBeenCalledWith(
      'template',
      'https://example.com/template.json',
      true,
      governed,
      expect.any(Function)
    );
    expect(installTemplatePackage).toHaveBeenCalledWith(
      governed.packageValue,
      'https://example.com/template.json',
      expect.objectContaining({ verificationId: 'verification-id' })
    );
    expect(markRecentTemplate).toHaveBeenCalledWith('remote-template');
    expect(markRecentResource).toHaveBeenCalledWith('template-url:https://example.com/template.json');
  });

  it('routes skill URL installs through completeGovernedInstall before mutating registries', async () => {
    const { registerResourceIpc } = await import('../../src/main/ipc/register-resource-ipc.js');
    const governed = {
      packageValue: { id: 'remote-skill', name: 'Remote Skill', version: '1.0.0', description: 'remote', source: 'remote', applicableStages: [], files: [] },
      review: { ...reviewGate('skill-review', 'Remote skill requires review.'), targetKind: 'skill' },
      verification: { ...verification('skill-verification'), kind: 'skill' }
    };
    const inspectPackageFromUrl = vi.fn(async () => governed);
    const installPackage = vi.fn(() => ({ id: 'remote-skill', source: 'https://example.com/skill.json' }));
    const appendAudit = vi.fn();
    const completeGovernedInstall = vi.fn((_kind, targetPath, approved, passed, install) => {
      if (approved) {
        install(passed.packageValue);
        return {
          status: 'installed',
          kind: 'skill',
          targetPath,
          bootstrap: { project: null },
          review: passed.review,
          verification: passed.verification
        };
      }
      return {
        status: 'review-required',
        kind: 'skill',
        targetPath,
        review: passed.review,
        verification: passed.verification
      };
    });

    registerResourceIpc({
      platformService: {},
      settingsStore: {
        markRecentResource: vi.fn()
      },
      completeGovernedInstall,
      buildBootstrap: vi.fn(() => ({ project: null })),
      getActiveProjectRoot: vi.fn(() => 'E:/workspace/project'),
      getMainWindow: vi.fn(),
      runtimeService: {},
      requireActiveRoot: vi.fn(),
      skillRegistry: {
        loadCatalog: vi.fn(),
        inspectPackageFromUrl,
        installPackage
      },
      rolePackageRegistry: { loadCatalog: vi.fn() },
      projectService: {
        appendAudit,
        loadProjectSkillIds: vi.fn(() => []),
        loadSessionSkillIds: vi.fn(() => ({}))
      },
      resourceGovernance: {}
    } as any);

    const handler = handlers.get('skills:install-url');
    expect(handler).toBeTypeOf('function');

    await expect(handler?.({}, 'https://example.com/skill.json')).resolves.toMatchObject({ status: 'review-required' });
    expect(installPackage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();

    await expect(handler?.({}, 'https://example.com/skill.json', true)).resolves.toMatchObject({ status: 'installed' });
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });

  it('routes role package URL installs through completeGovernedInstall before mutating registries', async () => {
    const { registerResourceIpc } = await import('../../src/main/ipc/register-resource-ipc.js');
    const governed = {
      packageValue: { id: 'remote-role', name: 'Remote Role', version: '1.0.0', description: 'remote', source: 'remote', files: [] },
      review: { ...reviewGate('role-review', 'Remote role package requires review.'), targetKind: 'role-package' },
      verification: { ...verification('role-verification'), kind: 'role-package' }
    };
    const inspectPackageFromUrl = vi.fn(async () => governed);
    const installPackage = vi.fn(() => ({ id: 'remote-role', source: 'https://example.com/role.json' }));
    const appendAudit = vi.fn();
    const completeGovernedInstall = vi.fn((_kind, targetPath, approved, passed, install) => {
      if (approved) {
        install(passed.packageValue);
        return {
          status: 'installed',
          kind: 'role-package',
          targetPath,
          bootstrap: { project: null },
          review: passed.review,
          verification: passed.verification
        };
      }
      return {
        status: 'review-required',
        kind: 'role-package',
        targetPath,
        review: passed.review,
        verification: passed.verification
      };
    });

    registerResourceIpc({
      platformService: {},
      settingsStore: {
        markRecentResource: vi.fn()
      },
      completeGovernedInstall,
      buildBootstrap: vi.fn(() => ({ project: null })),
      getActiveProjectRoot: vi.fn(() => 'E:/workspace/project'),
      getMainWindow: vi.fn(),
      runtimeService: {},
      requireActiveRoot: vi.fn(),
      skillRegistry: { loadCatalog: vi.fn() },
      rolePackageRegistry: {
        loadCatalog: vi.fn(),
        inspectPackageFromUrl,
        installPackage
      },
      projectService: {
        appendAudit,
        loadProjectSkillIds: vi.fn(() => []),
        loadSessionSkillIds: vi.fn(() => ({}))
      },
      resourceGovernance: {}
    } as any);

    const handler = handlers.get('roles:install-url');
    expect(handler).toBeTypeOf('function');

    await expect(handler?.({}, 'https://example.com/role.json')).resolves.toMatchObject({ status: 'review-required' });
    expect(installPackage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();

    await expect(handler?.({}, 'https://example.com/role.json', true)).resolves.toMatchObject({ status: 'installed' });
    expect(appendAudit).toHaveBeenCalledTimes(1);
  });
});
