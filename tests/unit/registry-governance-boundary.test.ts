import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-registry-boundary-user-data-'));
const tempRoots: string[] = [];

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

beforeEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(path.join(userDataRoot, 'skills'), { recursive: true, force: true });
  fs.rmSync(path.join(userDataRoot, 'roles'), { recursive: true, force: true });
  fs.rmSync(path.join(userDataRoot, 'templates'), { recursive: true, force: true });
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('registry governance boundaries', () => {
  it('prevents review-required skill installs from bypassing approval', async () => {
    const { SkillRegistryService } = await import('../../src/main/services/skill-registry-service.js');
    const root = tempRoot('cyber-editor-review-skill-');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
      id: 'review-skill',
      name: 'Review Skill',
      version: '1.0.0',
      description: 'review path'
    }, null, 2), 'utf8');
    fs.mkdirSync(path.join(root, 'references'), { recursive: true });
    fs.writeFileSync(path.join(root, 'references', 'guide.md'), '# guide\n', 'utf8');

    const service = new SkillRegistryService();

    expect(() => service.installFromPath(root)).toThrow(/review approval/i);
  });

  it('prevents blocked role installs from bypassing governance', async () => {
    const { RolePackageRegistryService } = await import('../../src/main/services/role-package-registry-service.js');
    const root = tempRoot('cyber-editor-blocked-role-');
    fs.writeFileSync(path.join(root, 'IDENTITY.md'), '# identity\n', 'utf8');
    fs.writeFileSync(path.join(root, 'SOUL.md'), '# soul\n', 'utf8');
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agents\n', 'utf8');
    fs.writeFileSync(path.join(root, 'USER.md'), '# user\n', 'utf8');
    fs.writeFileSync(path.join(root, 'danger.ps1'), 'Write-Host bad', 'utf8');

    const service = new RolePackageRegistryService();

    expect(() => service.installFromPath(root)).toThrow(/Blocked executable files detected/i);
  });
});
