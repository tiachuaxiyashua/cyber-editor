import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';

const roots: string[] = [];
const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-user-data-'));

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

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-note-refs-'));
  roots.push(root);
  return root;
}

describe('ProjectService note reference graph', () => {
  it('indexes markdown and wiki links, backlinks, and unresolved references', () => {
    const root = createRoot();
    fs.writeFileSync(path.join(root, 'note-a.md'), '# A\n\n[To B](note-b.md)\n[[note-c]]\n![img](assets/test.png)\n[[missing-note]]\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-b.md'), '# B\n\n[To C](note-c.md)\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-c.md'), '# C\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-d.txt'), '[[note-a]]\n', 'utf8');

    const service = new ProjectService();
    const graph = service.buildNoteReferenceGraph(root);

    expect(graph.documents).toHaveLength(4);
    expect(graph.edges).toHaveLength(4);
    expect(graph.unresolved).toHaveLength(1);

    const noteA = graph.documents.find((document) => document.title === 'note-a');
    const noteC = graph.documents.find((document) => document.title === 'note-c');
    expect(noteA?.outbound.map((edge) => edge.targetTitle).sort()).toEqual(['note-b', 'note-c']);
    expect(noteA?.inbound.map((edge) => path.basename(edge.sourcePath)).sort()).toEqual(['note-d.txt']);
    expect(noteC?.inbound.map((edge) => path.basename(edge.sourcePath)).sort()).toEqual(['note-a.md', 'note-b.md']);
    expect(graph.unresolved[0]?.rawTarget).toBe('missing-note');
  });

  it('compares note reference relationships', () => {
    const root = createRoot();
    fs.writeFileSync(path.join(root, 'note-a.md'), '# A\n\n[To B](note-b.md)\n[[note-c]]\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-b.md'), '# B\n\n[To C](note-c.md)\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-c.md'), '# C\n', 'utf8');
    fs.writeFileSync(path.join(root, 'note-d.md'), '# D\n\n[[note-a]]\n', 'utf8');

    const service = new ProjectService();
    const comparison = service.compareNoteReferences(
      root,
      path.join(root, 'note-a.md'),
      path.join(root, 'note-b.md')
    );

    expect(comparison.sharedOutbound.map((document) => document.title)).toEqual(['note-c']);
    expect(comparison.baseOnlyOutbound.map((document) => document.title)).toEqual(['note-b']);
    expect(comparison.compareOnlyOutbound).toHaveLength(0);
    expect(comparison.sharedInbound).toHaveLength(0);
    expect(comparison.baseOnlyInbound.map((document) => document.title)).toEqual(['note-d']);
    expect(comparison.compareOnlyInbound.map((document) => document.title)).toEqual(['note-a']);
  });
});
