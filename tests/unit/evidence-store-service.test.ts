import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EvidenceStoreService } from '../../src/main/services/evidence-store-service.js';
import type { CapabilityExecutionEvidence, ReviewGateReport } from '../../src/shared/types.js';

const roots: string[] = [];

function createRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.project'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('EvidenceStoreService', () => {
  it('persists index entries and loads category records from the fixed .project/evidence store', () => {
    const rootPath = createRoot('cyber-editor-evidence-');
    const service = new EvidenceStoreService();

    const review: ReviewGateReport = {
      id: 'review-1',
      createdAt: '2026-04-14T00:00:00.000Z',
      scope: 'resource-import',
      targetKind: 'template',
      targetId: 'software-factory',
      sourceLabel: 'local:test',
      trust: 'review',
      compatibility: 'current',
      health: 'warning',
      summary: 'Needs review.',
      issues: [{ code: 'template.tools.present', severity: 'warning', message: 'Contains tools.' }],
      recommendedAction: 'approve'
    };

    service.persistReview(rootPath, review);
    service.persistContextPack(rootPath, {
      id: 'context-1',
      createdAt: '2026-04-14T00:01:00.000Z',
      runId: 'run-1',
      systemPrompt: 'system',
      userPrompt: 'user',
      compacted: false,
      sourceMessageCount: 0,
      retainedMessageCount: 0,
      omittedMessageCount: 0,
      anchorPaths: [],
      pinnedDocumentPaths: [],
      excludedDocumentPaths: [],
      changeRecordIds: [],
      documentDigests: [],
      provenance: ['test']
    });
    service.persistRunEvidence(rootPath, {
      id: 'evidence-1',
      createdAt: '2026-04-14T00:02:00.000Z',
      runId: 'run-1',
      kind: 'chat',
      status: 'completed',
      checkpointIds: ['checkpoint-1'],
      outputIds: ['output-1'],
      eventCount: 3,
      diagnostics: []
    });

    const indexEntries = service.listEntries(rootPath);
    expect(indexEntries).toHaveLength(3);
    expect(fs.existsSync(path.join(rootPath, '.project', 'evidence', 'index.json'))).toBe(true);
    expect(service.readRunEvidence(rootPath, 'evidence-1')?.runId).toBe('run-1');
    expect(service.readContextPack(rootPath, 'context-1')?.provenance).toContain('test');
  });

  it('persists capability execution evidence in its own evidence category', () => {
    const rootPath = createRoot('cyber-editor-evidence-');
    const service = new EvidenceStoreService();

    const record: CapabilityExecutionEvidence = {
      id: 'capability-1',
      createdAt: '2026-04-20T00:00:00.000Z',
      runId: 'run-capability',
      capabilityId: 'network:headless_browser',
      status: 'completed',
      targetId: 'https://example.com/',
      timeout: {
        requestedMs: 12000,
        appliedMs: 12000
      },
      selector: {
        requestedSelector: 'main',
        usedSelector: 'main',
        usedFallback: false
      },
      truncation: {
        requestedMaxLength: 800,
        appliedMaxLength: 800,
        sourceTextLength: 640,
        returnedTextLength: 640,
        truncated: false
      },
      response: {
        ok: true,
        status: 200,
        statusText: 'OK',
        finalUrl: 'https://example.com/',
        title: 'Example Domain',
        linkCount: 2
      },
      logs: [
        {
          id: 'log-1',
          createdAt: '2026-04-20T00:00:00.100Z',
          phase: 'navigate',
          level: 'info',
          message: 'Loaded https://example.com/'
        }
      ]
    };

    service.persistCapabilityExecution(rootPath, record);

    const indexEntries = service.listEntries(rootPath, 'capabilities');
    expect(indexEntries).toHaveLength(1);
    expect(indexEntries[0]?.targetId).toBe('https://example.com/');
    expect(service.readCapabilityExecution(rootPath, 'capability-1')?.response?.title).toBe('Example Domain');
  });
});
