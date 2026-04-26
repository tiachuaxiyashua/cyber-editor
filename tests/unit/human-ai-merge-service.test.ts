import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DocumentChangeRecord } from '../../src/shared/types.js';
import { HumanAiMergeService } from '../../src/main/services/human-ai-merge-service.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-human-ai-merge-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  return root;
}

function changeRecord(filePath: string, source: DocumentChangeRecord['source']): DocumentChangeRecord {
  return {
    id: `${source}-1`,
    createdAt: new Date().toISOString(),
    filePath,
    title: 'note',
    source,
    summary: 'changed',
    addedLineCount: 1,
    removedLineCount: 1,
    changedLineCount: 1,
    impact: {
      inboundAffectedPaths: [],
      outboundAddedPaths: [],
      outboundRemovedPaths: [],
      artifactPaths: []
    }
  };
}

describe('HumanAiMergeService', () => {
  it('creates pending proposals only for recently human-edited files and supports manual merge', () => {
    const rootPath = createRoot();
    const filePath = path.join(rootPath, 'note.md');
    const service = new HumanAiMergeService();

    const safeProposal = service.createPendingWrite({
      rootPath,
      filePath,
      currentContents: 'a\nb\nc',
      proposedContents: 'a\nB\nc',
      recentChanges: [changeRecord(filePath, 'runtime-write')],
      sourceLabel: '需求草稿'
    });
    expect(safeProposal).toBeNull();

    const pending = service.createPendingWrite({
      rootPath,
      filePath,
      currentContents: 'a\nb\nc',
      proposedContents: 'a\nB\nc\nD',
      recentChanges: [changeRecord(filePath, 'editor-save')],
      sourceLabel: '需求草稿'
    });

    expect(pending).not.toBeNull();
    expect(pending?.hasConflicts).toBe(true);
    expect(pending?.chunks.length).toBeGreaterThan(0);

    const resolution = service.resolvePendingWrite(rootPath, pending!.id, 'a\nb\nc', {
      decision: 'manual-merge',
      chunkSelections: {
        'chunk-1': 'ai',
        'chunk-2': 'human'
      }
    });

    expect(resolution.shouldWrite).toBe(true);
    expect(resolution.nextContents).toBe('a\nB\nc');
    expect(service.getPendingWrite(rootPath, pending!.id).status).toBe('merged');
  });

  it('creates a pending proposal when the base revision diverges before AI write-back', () => {
    const rootPath = createRoot();
    const filePath = path.join(rootPath, 'note.md');
    const service = new HumanAiMergeService();

    const pending = service.createPendingWrite({
      rootPath,
      filePath,
      currentContents: 'alpha\nbeta\nlocal change',
      proposedContents: 'alpha\nbeta\nai rewrite',
      recentChanges: [changeRecord(filePath, 'runtime-write')],
      sourceLabel: '需求草稿',
      baseRevisionId: 'rev-base',
      currentRevisionId: 'rev-current',
      baseContentHash: 'hash-base'
    });

    expect(pending).not.toBeNull();
    expect(pending?.hasConflicts).toBe(true);
    expect(pending?.baseRevisionId).toBe('rev-base');
    expect(pending?.currentRevisionId).toBe('rev-current');
  });
});
