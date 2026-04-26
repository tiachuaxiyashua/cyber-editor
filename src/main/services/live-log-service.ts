import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppStage, RuntimeEvent, RuntimeRun } from '../../shared/types';
import type { AppLogRecord } from './app-log-service';

export type LiveLogSeverity = 'info' | 'warning' | 'error';

export type LiveLogCategory = 'app' | 'runtime' | 'ai' | 'quality';

export type LiveLogRecord = {
  id: string;
  createdAt: string;
  severity: LiveLogSeverity;
  category: LiveLogCategory;
  source: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
  details?: string[];
  body?: string;
};

export type LiveLogInput = Omit<LiveLogRecord, 'id' | 'createdAt'> & {
  createdAt?: string;
};

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (Array.isArray(value)) {
    if (depth >= 2) return `[Array(${value.length})]`;
    return value.slice(0, 20).map((item) => normalizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[Object]';
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entry]) => [key, normalizeValue(entry, depth + 1)])
    );
  }
  return String(value);
}

function severityLabel(severity: LiveLogSeverity) {
  return severity.toUpperCase();
}

function runtimeEventSeverity(event: Pick<RuntimeEvent, 'type' | 'metadata'>): LiveLogSeverity {
  if (
    event.type.endsWith('.failed')
    || event.type === 'validation.failed'
    || event.metadata?.qualityVerdict === 'blocked'
  ) {
    return 'error';
  }
  if (
    event.type.includes('blocked')
    || event.type.includes('rejected')
    || event.type === 'merge.required'
    || event.type === 'loop.guard-stopped'
    || event.metadata?.qualityVerdict === 'degraded'
  ) {
    return 'warning';
  }
  return 'info';
}

function formatRecord(record: LiveLogRecord) {
  const blocks = [
    `[${record.createdAt}] [${severityLabel(record.severity)}] [${record.category}] ${record.event}`,
    record.message
  ];
  if (record.metadata && Object.keys(record.metadata).length) {
    blocks.push(`metadata: ${JSON.stringify(record.metadata)}`);
  }
  if (record.details?.length) {
    blocks.push(`details:\n${record.details.map((item) => `- ${item}`).join('\n')}`);
  }
  if (record.body?.trim()) {
    blocks.push(`body:\n${record.body.trimEnd()}`);
  }
  blocks.push('-'.repeat(88));
  return `${blocks.join('\n')}\n`;
}

export class LiveLogService {
  private enabled = false;

  constructor(private readonly logsDir = path.join(app.getPath('userData'), 'logs')) {}

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) {
      ensureDir(this.logsDir);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getCurrentLogFilePath() {
    return path.join(this.logsDir, 'live-debug.log');
  }

  append(input: LiveLogInput): LiveLogRecord {
    const record: LiveLogRecord = {
      id: randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
      severity: input.severity,
      category: input.category,
      source: input.source,
      event: input.event,
      message: input.message,
      metadata: input.metadata ? normalizeValue(input.metadata) as Record<string, unknown> : undefined,
      details: input.details?.filter(Boolean),
      body: input.body
    };
    if (this.enabled) {
      ensureDir(this.logsDir);
      fs.appendFileSync(this.getCurrentLogFilePath(), formatRecord(record), 'utf8');
    }
    return record;
  }

  beginSession(reason: 'startup' | 'settings-enabled' = 'startup') {
    return this.append({
      severity: 'info',
      category: 'app',
      source: 'live-log',
      event: 'live-log.session-started',
      message: 'Live log stream is active.',
      metadata: {
        reason,
        filePath: this.getCurrentLogFilePath()
      }
    });
  }

  mirrorAppRecord(record: AppLogRecord) {
    const severity: LiveLogSeverity = record.level === 'error'
      ? 'error'
      : record.level === 'warn'
        ? 'warning'
        : 'info';
    const details = record.error
      ? [record.error.message, record.error.stack].filter((item): item is string => Boolean(item))
      : undefined;
    return this.append({
      severity,
      category: 'app',
      source: record.source,
      event: record.event,
      message: record.message,
      metadata: record.metadata,
      details
    });
  }

  recordRuntimeEvent(input: {
    rootPath: string;
    run: Pick<RuntimeRun, 'id' | 'kind' | 'stage' | 'roleId' | 'flowId' | 'currentStep' | 'status'>;
    event: Pick<RuntimeEvent, 'type' | 'message' | 'metadata'>;
  }) {
    return this.append({
      severity: runtimeEventSeverity(input.event),
      category: 'runtime',
      source: 'runtime-service',
      event: input.event.type,
      message: input.event.message,
      metadata: {
        rootPath: input.rootPath,
        runId: input.run.id,
        runKind: input.run.kind,
        stage: input.run.stage ?? null,
        roleId: input.run.roleId ?? null,
        flowId: input.run.flowId ?? null,
        status: input.run.status,
        currentStep: input.run.currentStep ?? null,
        ...(input.event.metadata ?? {})
      }
    });
  }

  recordAiOutput(input: {
    rootPath: string;
    runId: string;
    kind: RuntimeRun['kind'];
    stage?: AppStage;
    roleId?: string;
    roleName: string;
    profileId: string;
    provider: string;
    model: string;
    turn?: number;
    label: string;
    text: string;
    diagnostics?: string[];
  }) {
    return this.append({
      severity: 'info',
      category: 'ai',
      source: 'runtime-service',
      event: 'ai.output',
      message: `${input.roleName} produced ${input.label}.`,
      metadata: {
        rootPath: input.rootPath,
        runId: input.runId,
        kind: input.kind,
        stage: input.stage ?? null,
        roleId: input.roleId ?? null,
        profileId: input.profileId,
        provider: input.provider,
        model: input.model,
        turn: input.turn ?? null
      },
      details: input.diagnostics?.length ? input.diagnostics : undefined,
      body: input.text
    });
  }

  recordQualityDiagnosis(input: {
    rootPath: string;
    runId: string;
    stage?: AppStage;
    roleId?: string;
    profileId?: string;
    artifactPath: string;
    artifactTitle: string;
    verdict: string;
    qualityScore: number;
    qualityReasons: string[];
    accepted: boolean;
    repaired: boolean;
    usedDeterministicFallback: boolean;
    message?: string;
  }) {
    const severity: LiveLogSeverity = !input.accepted
      ? 'error'
      : input.verdict === 'degraded'
        ? 'warning'
        : 'info';
    const details = [
      input.message,
      ...input.qualityReasons,
      input.repaired ? '修复流程已介入。' : '',
      input.usedDeterministicFallback ? '使用了确定性兜底内容。' : ''
    ].filter(Boolean) as string[];
    return this.append({
      severity,
      category: 'quality',
      source: 'runtime-service',
      event: 'artifact.quality',
      message: `${input.artifactTitle} quality verdict: ${input.verdict}.`,
      metadata: {
        rootPath: input.rootPath,
        runId: input.runId,
        stage: input.stage ?? null,
        roleId: input.roleId ?? null,
        profileId: input.profileId ?? null,
        artifactPath: input.artifactPath,
        artifactTitle: input.artifactTitle,
        verdict: input.verdict,
        qualityScore: input.qualityScore,
        accepted: input.accepted,
        repaired: input.repaired,
        usedDeterministicFallback: input.usedDeterministicFallback
      },
      details
    });
  }
}
