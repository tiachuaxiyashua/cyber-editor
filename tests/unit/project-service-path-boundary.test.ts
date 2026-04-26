import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-project-path-user-data-'));

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
  fs.mkdirSync(path.join(rootPath, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, '.project', 'platform'), { recursive: true });
  fs.mkdirSync(path.join(rootPath, '.project', 'runtime'), { recursive: true });
  writeJson(path.join(rootPath, '.project', 'manifest.json'), {
    name: 'Path Boundary Project',
    rootPath,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    version: '0.1.0'
  });
  writeJson(path.join(rootPath, '.project', 'workflow-state.json'), {
    stage: 'discover',
    confirmedStages: []
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectService path boundary', () => {
  it('blocks linked directories that resolve outside the project root', () => {
    const rootPath = createRoot('cyber-editor-project-path-root-');
    const outsidePath = createRoot('cyber-editor-project-path-outside-');
    createProjectFixture(rootPath);

    const linkedPath = path.join(rootPath, 'linked-outside');
    fs.symlinkSync(
      outsidePath,
      linkedPath,
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    const service = new ProjectService();

    expect(() => service.resolveProjectPath(rootPath, path.join('linked-outside', 'escape.md'))).toThrow();
    expect(fs.existsSync(path.join(outsidePath, 'escape.md'))).toBe(false);
  });
});
