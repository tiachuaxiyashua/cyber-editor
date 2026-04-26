import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogService } from '../../src/main/services/app-log-service.js';

const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-app-log-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot
  }
}));

afterEach(() => {
  fs.rmSync(mockedUserDataRoot, { recursive: true, force: true });
  fs.mkdirSync(mockedUserDataRoot, { recursive: true });
});

describe('AppLogService', () => {
  it('writes redacted JSONL records and can read them back', () => {
    const service = new AppLogService();

    service.error({
      source: 'test',
      event: 'sample.error',
      message: 'Sample failure.',
      metadata: {
        apiKey: 'secret-key',
        nested: {
          token: 'secret-token'
        },
        visible: 'ok'
      },
      error: new Error('Boom')
    });

    const entries = service.listRecent();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('error');
    expect(entries[0]?.metadata).toMatchObject({
      apiKey: '[REDACTED]',
      nested: {
        token: '[REDACTED]'
      },
      visible: 'ok'
    });
    expect(entries[0]?.error).toMatchObject({
      name: 'Error',
      message: 'Boom'
    });
    expect(fs.existsSync(service.getCurrentLogFilePath())).toBe(true);
  });
});
