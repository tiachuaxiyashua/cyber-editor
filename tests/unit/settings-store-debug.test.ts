import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../src/main/services/store.js';
import type { SidebarLayout } from '../../src/shared/types.js';

const mockedUserDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-settings-debug-'));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot
  },
  safeStorage: {
    isEncryptionAvailable: () => false
  }
}));

const sidebar: SidebarLayout = {
  leftWidth: 280,
  rightWidth: 380,
  leftCollapsed: false,
  rightCollapsed: false,
  activityView: 'project',
  processPanelOpen: false,
  processPanelTab: 'stage',
  documentSplitOpen: false,
  documentSplitRatio: 0.5,
  secondaryDocumentPath: ''
};

afterEach(() => {
  fs.rmSync(mockedUserDataRoot, { recursive: true, force: true });
  fs.mkdirSync(mockedUserDataRoot, { recursive: true });
});

describe('SettingsStore debug settings', () => {
  it('persists the live log console toggle and preserves it across unrelated saves', () => {
    const store = new SettingsStore();

    store.saveSettings({
      theme: 'system',
      sidebar,
      debug: {
        liveLogConsoleEnabled: true
      }
    });

    store.saveSettings({
      theme: 'dark',
      sidebar
    });

    const settings = store.getSettings();
    expect(settings.debug.liveLogConsoleEnabled).toBe(true);
    expect(settings.theme).toBe('dark');
  });
});
