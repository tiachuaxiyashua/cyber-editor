import fs from 'node:fs';
import path from 'node:path';

export const BLOCKING_APP_EVENTS = new Set([
  'app-log.unparseable',
  'window.unresponsive',
  'renderer.process-gone',
  'process.uncaught-exception',
  'process.unhandled-rejection'
]);

export function readAppLogRecords(userDataPath) {
  const logsDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logsDir)) {
    return [];
  }

  const records = [];
  for (const entry of fs.readdirSync(logsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
      continue;
    }
    const filePath = path.join(logsDir, entry.name);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {
        records.push({
          createdAt: new Date().toISOString(),
          level: 'error',
          source: 'validation',
          event: 'app-log.unparseable',
          message: `${filePath} contains an unparseable log line`
        });
      }
    }
  }
  return records;
}

export function findBlockingAppLogEvents(userDataPath, blockingEvents = BLOCKING_APP_EVENTS) {
  return readAppLogRecords(userDataPath)
    .filter((record) => record?.event && blockingEvents.has(record.event))
    .map((record) => ({
      createdAt: record.createdAt ?? 'unknown-time',
      level: record.level ?? 'unknown-level',
      source: record.source ?? 'unknown-source',
      event: record.event ?? 'unknown-event',
      message: record.message ?? ''
    }));
}

export function formatBlockingAppLogEvents(events) {
  return events
    .map((event) => `${event.createdAt} ${event.level}/${event.source} ${event.event}: ${event.message}`)
    .join('\n');
}

export function assertNoBlockingAppLogEvents(userDataPath, label) {
  const events = findBlockingAppLogEvents(userDataPath);
  if (events.length) {
    throw new Error(`${label} emitted blocking app log events:\n${formatBlockingAppLogEvents(events)}`);
  }
  return events;
}
