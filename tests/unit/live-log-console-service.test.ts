import { describe, expect, it, vi } from 'vitest';
import { LiveLogConsoleService } from '../../src/main/services/live-log-console-service.js';

describe('LiveLogConsoleService', () => {
  it('opens one detached console window on Windows when enabled', () => {
    const kill = vi.fn();
    const unref = vi.fn();
    const spawn = vi.fn(() => ({
      pid: 1234,
      kill,
      unref
    }));
    const service = new LiveLogConsoleService({
      platform: 'win32',
      spawn: spawn as never
    });

    service.sync({
      enabled: true,
      logFilePath: 'E:/tmp/live-debug.log'
    });
    service.sync({
      enabled: true,
      logFilePath: 'E:/tmp/live-debug.log'
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it('closes the console process when the feature is disabled', () => {
    const kill = vi.fn();
    const unref = vi.fn();
    const spawn = vi.fn(() => ({
      pid: 1234,
      kill,
      unref
    }));
    const service = new LiveLogConsoleService({
      platform: 'win32',
      spawn: spawn as never
    });

    service.sync({
      enabled: true,
      logFilePath: 'E:/tmp/live-debug.log'
    });
    service.sync({
      enabled: false,
      logFilePath: 'E:/tmp/live-debug.log'
    });

    expect(kill).toHaveBeenCalled();
  });
});
