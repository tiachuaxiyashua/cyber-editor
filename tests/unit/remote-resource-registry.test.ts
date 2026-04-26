import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-registry-'));
const lookupMock = vi.hoisted(() => vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]));

vi.mock('node:dns/promises', () => ({
  lookup: lookupMock
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot
  }
}));

describe('remote resource registries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fs.rmSync(path.join(userDataRoot, 'skills'), { recursive: true, force: true });
    fs.rmSync(path.join(userDataRoot, 'role-packages'), { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries transient skill catalog failures and returns the remote list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'remote-skill',
            name: 'Remote Skill',
            version: '1.0.0',
            description: 'remote',
            source: 'catalog',
            packageUrl: 'https://example.com/skill.json',
            applicableStages: ['discover']
          }
        ]
      });
    vi.stubGlobal('fetch', fetchMock);

    const { SkillRegistryService } = await import('../../src/main/services/skill-registry-service.js');
    const service = new SkillRegistryService();

    const catalog = await service.loadCatalog('https://example.com/catalog.json');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe('remote-skill');
  });

  it('wraps skill install parse failures as install errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '{"broken":true}'
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SkillRegistryService } = await import('../../src/main/services/skill-registry-service.js');
    const service = new SkillRegistryService();

    await expect(service.installFromUrl('https://example.com/skill.json')).rejects.toThrow('Failed to parse remote skill package');
  });

  it('requires explicit approval before installing remote skills from url payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        id: 'remote-skill',
        name: 'Remote Skill',
        version: '1.0.0',
        description: 'remote',
        source: 'https://example.com/skill.json',
        applicableStages: ['discover'],
        files: [
          { path: 'SKILL.md', content: '# Remote Skill' }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SkillRegistryService } = await import('../../src/main/services/skill-registry-service.js');
    const service = new SkillRegistryService();

    await expect(service.installFromUrl('https://example.com/skill.json')).rejects.toThrow('requires explicit review approval');

    const installed = await service.installFromUrl('https://example.com/skill.json', { approved: true });
    expect(installed.id).toBe('remote-skill');
    expect(installed.trust).toBe('review');
  });

  it('loads remote role catalogs when a remote catalog url is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'remote-role',
          name: 'Remote Role',
          version: '1.0.0',
          description: 'remote',
          source: 'catalog',
          packageUrl: 'https://example.com/role.json',
          tags: ['remote']
        }
      ]
    });
    vi.stubGlobal('fetch', fetchMock);

    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();

    const catalog = await service.loadCatalog('https://example.com/role-catalog.json');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe('remote-role');
  });

  it('requires explicit approval before installing remote role packages from url payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        id: 'remote-role',
        name: 'Remote Role',
        version: '1.0.0',
        description: 'remote',
        source: 'https://example.com/role.json',
        files: [
          {
            path: 'role.json',
            content: JSON.stringify({
              id: 'remote-role',
              name: 'Remote Role',
              version: '1.0.0',
              description: 'remote',
              source: 'https://example.com/role.json',
              defaultSkillIds: [],
              allowedCapabilities: ['read_artifact']
            }, null, 2)
          },
          { path: 'IDENTITY.md', content: '# Remote Role' },
          { path: 'AGENTS.md', content: '# Agents' },
          { path: 'SOUL.md', content: '# Soul' },
          { path: 'USER.md', content: '# User' }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();

    await expect(service.installFromUrl('https://example.com/role.json')).rejects.toThrow('requires explicit review approval');

    const installed = await service.installFromUrl('https://example.com/role.json', { approved: true });

    expect(installed.id).toBe('remote-role');
    expect(installed.source).toBe('https://example.com/role.json');
    expect(installed.trust).toBe('review');
  });

  it('wraps remote role install parse failures as install errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => '{"broken":true}'
    });
    vi.stubGlobal('fetch', fetchMock);

    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();

    await expect(service.installFromUrl('https://example.com/role.json')).rejects.toThrow('Failed to parse remote role-package package');
  });

  it('still installs builtin role packages through builtin urls', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();

    const installed = await service.installFromUrl('builtin://general-writer');

    expect(installed.id).toBe('general-writer');
    expect(service.listInstalled().map((item: { id: string }) => item.id)).toContain('general-writer');
  });
});
