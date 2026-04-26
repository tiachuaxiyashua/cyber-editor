import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlledScriptTool } from '../../src/shared/types.js';

const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-platform-tool-output-user-data-'));
const tempRoots: string[] = [];
const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataRoot,
    getAppPath: () => process.cwd()
  }
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
}));

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

describe('PlatformService runTool output guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  });

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('truncates oversized stdout and stderr instead of buffering unbounded output', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();

      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('a'.repeat(150_000)));
        child.stderr.emit('data', Buffer.from('b'.repeat(150_000)));
        child.emit('close', 0);
      });

      return child;
    });

    const { PlatformService } = await import('../../src/main/services/platform-service.js');
    const service = new PlatformService();
    const rootPath = tempRoot('cyber-editor-platform-tool-output-root-');

    service.saveTools(rootPath, [{
      id: 'tool-overflow',
      name: 'Overflow Tool',
      description: 'Emits too much output.',
      command: process.execPath,
      args: [],
      cwd: '.',
      timeoutMs: 1000,
      enabled: true,
      inputSchemaRef: 'tool-args',
      health: 'unknown'
    } satisfies ControlledScriptTool]);

    const { result } = await service.runTool(rootPath, 'tool-overflow');

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('[output truncated after 131072 bytes]');
    expect(result.stderr).toContain('[output truncated after 131072 bytes]');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(131200);
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThanOrEqual(131200);
  });
});
