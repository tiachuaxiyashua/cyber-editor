import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-project-evidence-user-data-'));

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

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ProjectService evidence migration', () => {
  it('creates the fixed .project/evidence store when opening an older project layout', () => {
    const rootPath = createRoot('cyber-editor-project-evidence-');
    fs.mkdirSync(path.join(rootPath, '.project'), { recursive: true });
    fs.writeFileSync(path.join(rootPath, '.project', 'manifest.json'), JSON.stringify({
      name: 'Legacy Project',
      rootPath,
      createdAt: '2026-04-14T00:00:00.000Z',
      updatedAt: '2026-04-14T00:00:00.000Z',
      version: '0.1.0'
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(rootPath, '.project', 'workflow-state.json'), JSON.stringify({
      stage: 'discover',
      confirmedStages: []
    }, null, 2), 'utf8');

    const service = new ProjectService({
      loadAssets: vi.fn(() => ({ template: null }))
    } as never);

    service.openProject(rootPath);

    expect(fs.existsSync(path.join(rootPath, '.project', 'evidence', 'index.json'))).toBe(true);
  });
});
