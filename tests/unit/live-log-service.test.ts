import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppLogRecord } from '../../src/main/services/app-log-service.js';
import { LiveLogService } from '../../src/main/services/live-log-service.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-live-log-'));

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
});

describe('LiveLogService', () => {
  it('writes human-readable records with info/warning/error severity', () => {
    const service = new LiveLogService(path.join(tempRoot, 'logs'));
    service.setEnabled(true);

    service.append({
      severity: 'info',
      category: 'runtime',
      source: 'runtime',
      event: 'run.started',
      message: 'Runtime run started.',
      metadata: {
        runId: 'run-1'
      }
    });

    const mirrored = service.mirrorAppRecord({
      id: 'app-record-1',
      createdAt: '2026-04-20T00:00:00.000Z',
      level: 'warn',
      source: 'ipc',
      event: 'ipc.handler.failed',
      message: 'IPC handler failed.',
      metadata: {
        channel: 'settings:save'
      }
    } satisfies AppLogRecord);

    expect(mirrored?.severity).toBe('warning');
    expect(fs.readFileSync(service.getCurrentLogFilePath(), 'utf8')).toContain('[WARNING]');
  });

  it('records quality diagnosis with reasons that explain degraded output', () => {
    const service = new LiveLogService(path.join(tempRoot, 'logs'));
    service.setEnabled(true);

    const record = service.recordQualityDiagnosis({
      rootPath: 'E:/tmp/project',
      runId: 'run-1',
      stage: 'draft',
      artifactPath: 'docs/plan.md',
      artifactTitle: '计划文档',
      verdict: 'degraded',
      qualityScore: 61,
      qualityReasons: ['缺少验收标准', '步骤过于笼统'],
      accepted: true,
      repaired: false,
      usedDeterministicFallback: false,
      message: 'Quality degraded.'
    });

    expect(record.severity).toBe('warning');
    expect(record.details).toEqual(expect.arrayContaining(['缺少验收标准', '步骤过于笼统']));
    expect(fs.readFileSync(service.getCurrentLogFilePath(), 'utf8')).toContain('docs/plan.md');
  });
});
