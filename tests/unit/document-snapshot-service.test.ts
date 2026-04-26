import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentSnapshotService } from '../../src/main/services/document-snapshot-service.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-document-snapshots-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  return root;
}

describe('DocumentSnapshotService', () => {
  it('creates, lists, and reads document snapshots', () => {
    const rootPath = createRoot();
    const filePath = path.join(rootPath, 'note.md');
    const service = new DocumentSnapshotService();

    const snapshot = service.createSnapshot(rootPath, filePath, '# 当前版本\n\n内容A\n', {
      label: '手动快照',
      source: 'manual',
      previousContents: '# 旧版本\n'
    });

    const listed = service.listSnapshots(rootPath, filePath);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(snapshot.id);
    expect(listed[0]?.summary).toContain('变更');

    const restored = service.readSnapshotContents(rootPath, filePath, snapshot.id);
    expect(restored.snapshot.id).toBe(snapshot.id);
    expect(restored.contents).toContain('内容A');
  });
});
