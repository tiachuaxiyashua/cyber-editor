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

function createProjectRoot() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-doc-change-'));
  roots.push(base);
  const service = new ProjectService();
  const project = service.createProject({
    name: 'doc-change-project',
    locationPath: base,
    directoryMode: 'create-in-parent',
    templateId: 'software-factory'
  });
  return { service, rootPath: project.rootPath };
}

describe('ProjectService recent document changes', () => {
  it('records diff summary, link impact, and affected upstream documents', () => {
    const { service, rootPath } = createProjectRoot();
    const targetPath = path.join(rootPath, '01-requirements', '01-原始需求.md');
    const oldTargetPath = path.join(rootPath, '02-solution', 'old-target.md');
    const newTargetPath = path.join(rootPath, '02-solution', 'new-target.md');
    const upstreamPath = path.join(rootPath, '02-solution', '引用说明.md');

    fs.writeFileSync(oldTargetPath, '# Old\n', 'utf8');
    fs.writeFileSync(newTargetPath, '# New\n', 'utf8');
    fs.writeFileSync(upstreamPath, '[需求](../01-requirements/01-原始需求.md)\n', 'utf8');

    const previousContents = '# 原始需求\n\n[旧目标](../02-solution/old-target.md)\n';
    const nextContents = '# 原始需求\n\n[新目标](../02-solution/new-target.md)\n新增一行说明\n';
    fs.writeFileSync(targetPath, previousContents, 'utf8');

    const record = service.recordDocumentChange(targetPath, previousContents, nextContents, 'external-change');

    expect(record).not.toBeNull();
    expect(record?.filePath).toBe(targetPath);
    expect(record?.source).toBe('external-change');
    expect(record?.changedLineCount).toBeGreaterThan(0);
    expect(record?.impact.inboundAffectedPaths).toContain(upstreamPath);
    expect(record?.impact.outboundAddedPaths).toContain(newTargetPath);
    expect(record?.impact.outboundRemovedPaths).toContain(oldTargetPath);
    expect(record?.impact.artifactPaths).toContain('01-requirements/01-原始需求.md');
    expect(record?.summary).toContain('affected 1 inbound docs');

    const recent = service.listRecentDocumentChanges(rootPath);
    expect(recent[0]?.id).toBe(record?.id);
  });
});
