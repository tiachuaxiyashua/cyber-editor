import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AppLogRecord = {
  id: string;
  createdAt: string;
  level: AppLogLevel;
  source: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

export type AppLogInput = {
  level: AppLogLevel;
  source: string;
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

const REDACTED_KEYS = /(api[-_]?key|token|secret|password|authorization)/i;
const MAX_STRING_LENGTH = 1_000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 4;

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function trimString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function normalizeError(error: unknown): AppLogRecord['error'] | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: trimString(error.message),
      stack: error.stack ? trimString(error.stack) : undefined
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: trimString(error)
    };
  }
  return {
    name: 'UnknownError',
    message: trimString(JSON.stringify(normalizeValue(error)))
  };
}

function normalizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return trimString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return normalizeError(value);
  }
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`;
    }
    return '[Object]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => normalizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(entries.map(([key, entryValue]) => [
      key,
      REDACTED_KEYS.test(key) ? '[REDACTED]' : normalizeValue(entryValue, depth + 1)
    ]));
  }
  return String(value);
}

export class AppLogService {
  private readonly listeners = new Set<(record: AppLogRecord) => void>();

  constructor(private readonly logsDir = path.join(app.getPath('userData'), 'logs')) {}

  private getLogFilePath(date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    return path.join(this.logsDir, `app-${day}.jsonl`);
  }

  getCurrentLogFilePath() {
    return this.getLogFilePath();
  }

  private writeRecord(record: AppLogRecord) {
    const filePath = this.getLogFilePath(new Date(record.createdAt));
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  log(input: AppLogInput): AppLogRecord {
    const record: AppLogRecord = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      level: input.level,
      source: input.source,
      event: input.event,
      message: trimString(input.message),
      metadata: input.metadata ? normalizeValue(input.metadata) as Record<string, unknown> : undefined,
      error: normalizeError(input.error)
    };
    this.writeRecord(record);
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        // Logging listeners must never break the main logger.
      }
    }
    return record;
  }

  debug(input: Omit<AppLogInput, 'level'>) {
    return this.log({ ...input, level: 'debug' });
  }

  info(input: Omit<AppLogInput, 'level'>) {
    return this.log({ ...input, level: 'info' });
  }

  warn(input: Omit<AppLogInput, 'level'>) {
    return this.log({ ...input, level: 'warn' });
  }

  error(input: Omit<AppLogInput, 'level'>) {
    return this.log({ ...input, level: 'error' });
  }

  listRecent(limit = 200) {
    const filePath = this.getCurrentLogFilePath();
    if (!fs.existsSync(filePath)) return [] as AppLogRecord[];
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AppLogRecord;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is AppLogRecord => Boolean(entry));
  }

  subscribe(listener: (record: AppLogRecord) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
