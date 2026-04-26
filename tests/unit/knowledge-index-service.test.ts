import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectService } from '../../src/main/services/project-service.js';
import { KnowledgeIndexService } from '../../src/main/services/knowledge-index-service.js';

const tempRoots: string[] = [];

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-knowledge-index-'));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('KnowledgeIndexService', () => {
  it('builds status, captures reference links, and refreshes stale files incrementally', () => {
    const root = createRoot();
    const docA = path.join(root, '01-requirements', 'overview.md');
    const docB = path.join(root, '02-solution', 'plan.md');
    writeFile(docA, '# Overview\n\nLink to [Plan](../02-solution/plan.md)\n\nalpha beta gamma');
    writeFile(docB, '# Plan\n\nbeta gamma delta');

    const documentChangeService = {
      getRelevantDocumentChanges: vi.fn((_: string, anchorPaths: string[]) => anchorPaths.map((filePath) => ({
        id: `change:${path.basename(filePath)}`
      })))
    };
    const projectService = new ProjectService({} as never, {} as never, documentChangeService as never);
    const service = new KnowledgeIndexService(projectService);

    const initialStatus = service.getStatus(root);
    expect(initialStatus.status).toBe('missing');
    expect(initialStatus.documentCount).toBe(2);
    expect(initialStatus.staleDocumentPaths).toEqual([docA, docB]);

    const ready = service.refresh(root, 'manual');
    expect(ready.status).toBe('ready');
    expect(ready.documentCount).toBe(2);

    const overviewUnit = ready.units.find((unit) => unit.path === docA);
    const planUnit = ready.units.find((unit) => unit.path === docB);
    expect(overviewUnit?.outboundPaths).toContain(docB);
    expect(planUnit?.inboundPaths).toContain(docA);
    expect(overviewUnit?.keywords).toContain('overview');
    expect(overviewUnit?.relatedChangeRecordIds).toContain('change:overview.md');

    const staleAt = Date.now() + 10_000;
    writeFile(docB, '# Plan\n\nbeta gamma delta epsilon');
    fs.utimesSync(docB, staleAt / 1000, staleAt / 1000);

    const staleStatus = service.getStatus(root);
    expect(staleStatus.status).toBe('stale');
    expect(staleStatus.staleDocumentPaths).toContain(docB);
    expect(staleStatus.staleDocumentPaths).not.toContain(docA);

    const incremental = service.refresh(root, 'incremental');
    const refreshedPlan = incremental.units.find((unit) => unit.path === docB);
    expect(incremental.status).toBe('ready');
    expect(refreshedPlan?.excerpt).toContain('epsilon');
  });
});
