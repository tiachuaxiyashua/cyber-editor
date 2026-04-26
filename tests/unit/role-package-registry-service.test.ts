import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RolePackage } from '../../src/shared/types.js';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-role-registry-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot
  }
}));

describe('RolePackageRegistryService', () => {
  beforeEach(() => {
    fs.rmSync(path.join(userDataRoot, 'role-packages'), { recursive: true, force: true });
  });

  it('persists validation metadata for installed local role packages', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();
    const rolePackage: RolePackage = {
      id: 'planner',
      name: 'Planner',
      version: '1.0.0',
      description: 'Planner role',
      source: 'local',
      files: [
        {
          path: 'role.json',
          content: JSON.stringify({
            id: 'planner',
            name: 'Planner',
            version: '1.0.0',
            description: 'Planner role',
            source: 'local',
            defaultSkillIds: ['outline'],
            allowedCapabilities: ['read_artifact']
          }, null, 2)
        },
        { path: 'IDENTITY.md', content: '# Planner' },
        { path: 'AGENTS.md', content: 'Follow the plan.' },
        { path: 'SOUL.md', content: 'Keep structure.' },
        { path: 'USER.md', content: 'For planners.' },
        { path: 'Skills/skills.json', content: JSON.stringify({ skillIds: ['outline'] }, null, 2) }
      ]
    };

    const installed = service.installPackage(rolePackage, 'local:test');
    const listed = service.listInstalled();

    expect(installed.health).toBe('warning');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.defaultSkillIds).toEqual(['outline']);
    expect(listed[0]?.allowedCapabilities).toEqual(['read_artifact']);
    expect(listed[0]?.validationIssues.some((item) => item.code === 'ROLE_PACKAGE_OPTIONAL_FILE_MISSING')).toBe(true);
  });

  it('marks broken packages as corrupt after revalidation', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();
    const rolePackage: RolePackage = {
      id: 'broken-role',
      name: 'Broken',
      version: '1.0.0',
      description: 'Broken role',
      source: 'local',
      files: [
        {
          path: 'role.json',
          content: JSON.stringify({
            id: 'broken-role',
            name: 'Broken',
            version: '1.0.0',
            description: 'Broken role',
            source: 'local',
            defaultSkillIds: [],
            allowedCapabilities: []
          }, null, 2)
        },
        { path: 'IDENTITY.md', content: '# Broken' }
      ]
    };

    const installed = service.installPackage(rolePackage, 'local:test');
    expect(installed.health).toBe('corrupt');

    const listed = service.listInstalled();
    expect(listed[0]?.health).toBe('corrupt');
    expect(listed[0]?.validationIssues.some((item) => item.code === 'ROLE_PACKAGE_REQUIRED_FILE_MISSING')).toBe(true);
  });

  it('records dependency install summary and warning health when required dependency install fails', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const service = new RolePackageRegistryService();
    const rolePackage: RolePackage = {
      id: 'dep-role',
      name: 'Dependency Role',
      version: '1.0.0',
      description: 'Role with dependency spec',
      source: 'local',
      files: [
        {
          path: 'role.json',
          content: JSON.stringify({
            id: 'dep-role',
            name: 'Dependency Role',
            version: '1.0.0',
            description: 'Role with dependency spec',
            source: 'local',
            defaultSkillIds: [],
            allowedCapabilities: ['read_artifact'],
            dependencySpec: [
              {
                id: 'missing-skill',
                kind: 'skill',
                required: true,
                installMode: 'registry',
                source: 'builtin://missing-skill'
              }
            ]
          }, null, 2)
        },
        { path: 'IDENTITY.md', content: '# Dependency Role' },
        { path: 'AGENTS.md', content: 'Check dependencies.' },
        { path: 'SOUL.md', content: 'Stay strict.' },
        { path: 'USER.md', content: 'For runtime validation.' },
        { path: 'MEMORY/MEMORY.md', content: 'Remember failures.' }
      ]
    };

    const installed = service.installPackage(rolePackage, 'local:test');

    expect(installed.health).toBe('warning');
    expect((installed as any).dependencySummary?.skills?.[0]?.id).toBe('missing-skill');
    expect((installed as any).dependencySummary?.skills?.[0]?.state).toBe('failed');
  });
});
