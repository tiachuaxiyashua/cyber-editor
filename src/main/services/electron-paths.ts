import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';

export function resolveElectronUserDataRoot() {
  if (process.env.CYBER_EDITOR_USER_DATA?.trim()) {
    return process.env.CYBER_EDITOR_USER_DATA.trim();
  }
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Fall back outside Electron, especially in unit tests.
  }
  return path.join(os.tmpdir(), 'cyber-editor-user-data');
}

export function resolveElectronAppRoot() {
  try {
    if (app && typeof app.getAppPath === 'function') {
      return app.getAppPath();
    }
  } catch {
    // Fall back outside Electron, especially in unit tests.
  }
  return process.cwd();
}
