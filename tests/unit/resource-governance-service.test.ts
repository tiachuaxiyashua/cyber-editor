import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceGovernanceService } from '../../src/main/services/resource-governance-service.js';
import type { ProjectTemplatePackage } from '../../src/shared/types.js';

const roots: string[] = [];

function createRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function loadTemplateFixture(): ProjectTemplatePackage {
  const filePath = path.join(process.cwd(), 'src', 'shared', 'template-packages', 'software-factory.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProjectTemplatePackage;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ResourceGovernanceService', () => {
  it('marks template imports with tools as review-required', () => {
    const root = createRoot('cyber-editor-template-governance-');
    const templatePath = path.join(root, 'template-package.json');
    const templatePackage = loadTemplateFixture();
    templatePackage.platform.tools = [
      {
        id: 'tool-1',
        name: 'Local Tool',
        description: 'Runs locally',
        command: 'cmd',
        args: ['/c', 'echo', 'ok'],
        cwd: '.',
        timeoutMs: 1000,
        enabled: true
      }
    ];
    fs.writeFileSync(templatePath, JSON.stringify(templatePackage, null, 2), 'utf8');

    const governed = new ResourceGovernanceService().verifyTemplateImportFromPath(templatePath);

    expect(governed.review.trust).toBe('review');
    expect(governed.review.issues.some((issue) => issue.code === 'template.tools.present')).toBe(true);
  });

  it('marks skill imports without a root SKILL.md as review-required', () => {
    const root = createRoot('cyber-editor-skill-governance-');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
      id: 'skill-no-root',
      name: 'Skill Without Root',
      version: '1.0.0',
      description: 'No root file'
    }, null, 2), 'utf8');
    fs.mkdirSync(path.join(root, 'references'), { recursive: true });
    fs.writeFileSync(path.join(root, 'references', 'guide.md'), '# guide\n', 'utf8');

    const governed = new ResourceGovernanceService().verifySkillImportFromPath(root);

    expect(governed.review.trust).toBe('review');
    expect(governed.review.summary).toContain('SKILL.md');
  });

  it('blocks local imports that contain executable files', () => {
    const root = createRoot('cyber-editor-role-governance-');
    fs.writeFileSync(path.join(root, 'IDENTITY.md'), '# identity\n', 'utf8');
    fs.writeFileSync(path.join(root, 'danger.ps1'), 'Write-Host hacked', 'utf8');

    const governed = new ResourceGovernanceService().verifyRolePackageImportFromPath(root);

    expect(governed.packageValue).toBeNull();
    expect(governed.review.trust).toBe('blocked');
    expect(governed.actionableError?.code).toBe('LOCAL_IMPORT_TRUST_BLOCKED');
  });

  it('normalizes malformed template imports into blocked governance results', () => {
    const root = createRoot('cyber-editor-template-malformed-');
    const templatePath = path.join(root, 'template-package.json');
    fs.writeFileSync(templatePath, '{"definition":', 'utf8');

    const governed = new ResourceGovernanceService().verifyTemplateImportFromPath(templatePath);

    expect(governed.packageValue).toBeNull();
    expect(governed.review.trust).toBe('blocked');
    expect(governed.review.summary).toContain('Failed to parse local template package');
    expect(governed.actionableError?.code).toBe('LOCAL_IMPORT_PARSE_FAILED');
  });

  it('normalizes malformed skill imports into blocked governance results', () => {
    const root = createRoot('cyber-editor-skill-malformed-');
    const packagePath = path.join(root, 'skill-package.json');
    fs.writeFileSync(packagePath, '{"id": "broken-skill"', 'utf8');

    const governed = new ResourceGovernanceService().verifySkillImportFromPath(packagePath);

    expect(governed.packageValue).toBeNull();
    expect(governed.review.trust).toBe('blocked');
    expect(governed.actionableError?.code).toBe('LOCAL_IMPORT_PARSE_FAILED');
  });

  it('normalizes malformed role-package directories into blocked governance results', () => {
    const root = createRoot('cyber-editor-role-malformed-');
    fs.writeFileSync(path.join(root, 'role-package.json'), '{"id":"broken-role"', 'utf8');
    fs.writeFileSync(path.join(root, 'IDENTITY.md'), '# identity\n', 'utf8');

    const governed = new ResourceGovernanceService().verifyRolePackageImportFromPath(root);

    expect(governed.packageValue).toBeNull();
    expect(governed.review.trust).toBe('blocked');
    expect(governed.actionableError?.code).toBe('LOCAL_IMPORT_PARSE_FAILED');
  });
});
