import { describe, expect, it } from 'vitest';
// @ts-expect-error package script is exercised through runtime tests and is not part of the TS source set
import { clearOutputDirectory } from '../../scripts/package-app.mjs';

describe('package output cleanup', () => {
  it('surfaces a clear action when packaged binaries are still running', () => {
    const removeDirectory = () => {
      const error = new Error('permission denied') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    };

    expect(() =>
      clearOutputDirectory('E:/repo/out/package', {
        removeDirectory,
        exists: () => true,
        findLockingProcesses: () => [
          {
            name: 'Cyber Editor',
            pid: 7092,
            path: 'E:/repo/out/package/Cyber Editor-win32-x64/Cyber Editor.exe'
          }
        ]
      })
    ).toThrowError(/先关闭正在运行的已打包程序后再重试/);
  });
});
