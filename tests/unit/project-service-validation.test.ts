import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-project-validation-user-data-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd()
  }
}));

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createTempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

describe('ProjectService.validateProjectCreateInput', () => {
  it('rejects invalid project names and returns a computed final path', () => {
    const service = new ProjectService();
    const parent = createTempRoot('cyber-editor-project-validation-parent-');

    const validation = service.validateProjectCreateInput({
      name: 'invalid-project.',
      locationPath: parent,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });

    expect(validation.ok).toBe(false);
    expect(validation.finalPath).toBe(path.resolve(parent, 'invalid-project.'));
    expect(validation.issues.some((issue) => issue.code === 'name.invalid-chars')).toBe(true);
  });

  it('rejects create-in-parent when the target directory already exists', () => {
    const service = new ProjectService();
    const parent = createTempRoot('cyber-editor-project-validation-conflict-');
    fs.mkdirSync(path.join(parent, 'existing-project'), { recursive: true });

    const validation = service.validateProjectCreateInput({
      name: 'existing-project',
      locationPath: parent,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'path.target-conflict')).toBe(true);
    expect(validation.finalPath).toBe(path.resolve(parent, 'existing-project'));
  });

  it('rejects use-existing-directory when the selected directory is not empty', () => {
    const service = new ProjectService();
    const target = createTempRoot('cyber-editor-project-validation-nonempty-');
    fs.writeFileSync(path.join(target, 'README.md'), '# occupied\n', 'utf8');

    const validation = service.validateProjectCreateInput({
      name: 'existing-dir-project',
      locationPath: target,
      directoryMode: 'use-existing-directory',
      templateId: 'software-factory'
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'path.target-exists-nonempty')).toBe(true);
    expect(validation.finalPath).toBe(path.resolve(target));
  });

  it('accepts an empty existing directory when use-existing-directory is selected', () => {
    const service = new ProjectService();
    const target = createTempRoot('cyber-editor-project-validation-empty-');

    const validation = service.validateProjectCreateInput({
      name: 'empty-dir-project',
      locationPath: target,
      directoryMode: 'use-existing-directory',
      templateId: 'software-factory'
    });

    expect(validation.ok).toBe(true);
    expect(validation.issues).toHaveLength(0);
    expect(validation.finalPath).toBe(path.resolve(target));
  });

  it('rejects unwritable parent directories before project creation', () => {
    const service = new ProjectService();
    const parent = createTempRoot('cyber-editor-project-validation-readonly-parent-');
    const accessSpy = vi.spyOn(fs, 'accessSync').mockImplementation((targetPath, mode) => {
      if (String(targetPath) === path.resolve(parent) && mode === fs.constants.W_OK) {
        throw new Error('access denied');
      }
      return undefined;
    });

    const validation = service.validateProjectCreateInput({
      name: 'readonly-project',
      locationPath: parent,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.code === 'path.parent-not-writable')).toBe(true);
    accessSpy.mockRestore();
  });
});
