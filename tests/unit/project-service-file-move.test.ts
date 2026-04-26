import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-project-move-user-data-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd()
  }
}));

function createRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createProjectFixture(rootPath: string) {
  for (const dirName of ['01-requirements', '02-solution', '03-openspec', 'assets', '.project/platform', '.project/runtime']) {
    fs.mkdirSync(path.join(rootPath, dirName), { recursive: true });
  }
  writeJson(path.join(rootPath, '.project', 'manifest.json'), {
    name: 'Move Project',
    rootPath,
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    version: '0.1.0'
  });
  writeJson(path.join(rootPath, '.project', 'workflow-state.json'), {
    stage: 'discover',
    confirmedStages: []
  });
  fs.writeFileSync(path.join(rootPath, '02-solution', 'plan.md'), '# Plan\n', 'utf8');
  fs.mkdirSync(path.join(rootPath, '02-solution', 'nested'), { recursive: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectService moveEntry', () => {
  it('moves a file into another project directory and returns the next path', () => {
    const rootPath = createRoot('cyber-editor-project-move-success-');
    createProjectFixture(rootPath);
    const service = new ProjectService();

    const moved = service.moveEntry(rootPath, '02-solution/plan.md', '01-requirements');

    expect(moved).toBe(path.join(rootPath, '01-requirements', 'plan.md'));
    expect(fs.existsSync(path.join(rootPath, '02-solution', 'plan.md'))).toBe(false);
    expect(fs.readFileSync(path.join(rootPath, '01-requirements', 'plan.md'), 'utf8')).toContain('# Plan');
  });

  it('blocks moving a directory into its own child directory', () => {
    const rootPath = createRoot('cyber-editor-project-move-invalid-');
    createProjectFixture(rootPath);
    const service = new ProjectService();

    expect(() => service.moveEntry(rootPath, '02-solution', '02-solution/nested')).toThrow(/不能将目录移动到其自身或子目录下/);
  });
});
