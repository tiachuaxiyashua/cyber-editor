import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';

type AppLogRecord = {
  createdAt?: string;
  level?: string;
  source?: string;
  event?: string;
  message?: string;
};

const BLOCKING_APP_EVENTS = new Set([
  'app-log.unparseable',
  'window.unresponsive',
  'renderer.process-gone',
  'process.uncaught-exception',
  'process.unhandled-rejection',
]);

function readAppLogRecords(userDataPath: string) {
  const logsDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logsDir)) {
    return [] as AppLogRecord[];
  }

  const records: AppLogRecord[] = [];
  for (const entry of fs.readdirSync(logsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
      continue;
    }
    const filePath = path.join(logsDir, entry.name);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        records.push(JSON.parse(line) as AppLogRecord);
      } catch {
        records.push({
          level: 'error',
          source: 'test',
          event: 'app-log.unparseable',
          message: `${filePath} contains an unparseable log line`,
        });
      }
    }
  }
  return records;
}

export function findBlockingAppLogEvents(userDataPath: string) {
  return readAppLogRecords(userDataPath)
    .filter((record) => record.event && BLOCKING_APP_EVENTS.has(record.event))
    .map((record) => ({
      createdAt: record.createdAt ?? 'unknown-time',
      level: record.level ?? 'unknown-level',
      source: record.source ?? 'unknown-source',
      event: record.event ?? 'unknown-event',
      message: record.message ?? '',
    }));
}

export function assertNoBlockingAppLogEvents(userDataPath: string, label: string) {
  const blockingEvents = findBlockingAppLogEvents(userDataPath);
  expect(
    blockingEvents,
    `${label} must not emit blocking app log events`,
  ).toEqual([]);
}
