import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-project-snapshots-user-data-'));

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
    name: 'Snapshot Project',
    rootPath,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z',
    version: '0.1.0'
  });
  writeJson(path.join(rootPath, '.project', 'workflow-state.json'), {
    stage: 'discover',
    confirmedStages: []
  });
  fs.writeFileSync(path.join(rootPath, '02-solution', 'plan.md'), 'original plan', 'utf8');
  writeJson(path.join(rootPath, '.project', 'runtime', 'state.json'), { step: 'original' });
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectService snapshot restore', () => {
  it('restores snapshot content through the staged restore path', () => {
    const rootPath = createRoot('cyber-editor-project-snapshot-success-');
    createProjectFixture(rootPath);
    const service = new ProjectService();

    const snapshot = service.createSnapshot(rootPath, 'before-change');
    fs.writeFileSync(path.join(rootPath, '02-solution', 'plan.md'), 'changed plan', 'utf8');
    writeJson(path.join(rootPath, '.project', 'runtime', 'state.json'), { step: 'changed' });

    service.restoreSnapshot(rootPath, snapshot.id);

    expect(fs.readFileSync(path.join(rootPath, '02-solution', 'plan.md'), 'utf8')).toBe('original plan');
    expect(JSON.parse(fs.readFileSync(path.join(rootPath, '.project', 'runtime', 'state.json'), 'utf8'))).toEqual({ step: 'original' });
  });

  it('uses compact snapshot ids to preserve Windows path headroom', () => {
    const rootPath = createRoot('cyber-editor-project-snapshot-compact-');
    createProjectFixture(rootPath);
    const service = new ProjectService();

    const snapshot = service.createSnapshot(rootPath, 'before-change');

    expect(snapshot.id).toMatch(/^\d{8}T\d{9}Z-[a-f0-9]{8}$/);
    expect(path.join(rootPath, '.project', 'snapshots', snapshot.id).length).toBeLessThan(160);
  });

  it('rolls back live state if staged restore replacement fails', () => {
    const rootPath = createRoot('cyber-editor-project-snapshot-failure-');
    createProjectFixture(rootPath);
    const service = new ProjectService();

    const snapshot = service.createSnapshot(rootPath, 'before-change');
    fs.writeFileSync(path.join(rootPath, '02-solution', 'plan.md'), 'changed plan', 'utf8');
    writeJson(path.join(rootPath, '.project', 'runtime', 'state.json'), { step: 'changed' });

    const originalCopyFileSync = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation(((source: fs.PathLike, destination: fs.PathLike, mode?: number) => {
      const sourcePath = String(source);
      const destinationPath = String(destination);
      if (
        sourcePath.includes(`${path.sep}.restore${path.sep}`)
        && sourcePath.includes(`${path.sep}stage${path.sep}`)
        && destinationPath === path.join(rootPath, '02-solution', 'plan.md')
      ) {
        throw new Error('simulated staged copy failure');
      }
      return originalCopyFileSync(source, destination, mode);
    }) as typeof fs.copyFileSync);

    expect(() => service.restoreSnapshot(rootPath, snapshot.id)).toThrow(/Recovery material kept at/);

    expect(fs.readFileSync(path.join(rootPath, '02-solution', 'plan.md'), 'utf8')).toBe('changed plan');
    expect(JSON.parse(fs.readFileSync(path.join(rootPath, '.project', 'runtime', 'state.json'), 'utf8'))).toEqual({ step: 'changed' });
    expect(service.listSnapshots(rootPath).map((item) => item.id)).toEqual([snapshot.id]);
  });
});
