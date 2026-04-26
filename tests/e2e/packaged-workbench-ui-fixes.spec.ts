import fs, { existsSync } from 'node:fs';
import os from 'node:os';
import path, { resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

import {
  assertFileSwitchFeedbackBeforeArtifactLoad,
  assertShellFillsViewport,
  assertWorkbenchEmptyStateSpacing,
} from './helpers/human-experience-assertions';
import { assertNoBlockingAppLogEvents } from './helpers/app-log-assertions';

test.skip(process.platform !== 'win32', 'packaged runtime verification only runs on Windows');
test.skip(
  process.env.CYBER_EDITOR_RUN_PACKAGED_UI_CONTRACTS !== '1',
  'packaged workbench checks only run in the dedicated packaged ui contract script',
);

const executablePath = resolve(
  process.cwd(),
  'out',
  'package',
  'Cyber Editor-win32-x64',
  'Cyber Editor.exe',
);

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

test('packaged app keeps full-window workbench shell and stable runtime actions', async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(executablePath), 'packaged executable is missing');

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-workbench-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-workbench-userdata-'));

  const app = await electron.launch({
    executablePath,
    env: buildElectronEnv(userDataRoot),
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await page.evaluate(async ({ projectBase }: { projectBase: string }) => {
      await window.api.createProject({
        name: 'packaged-workbench-ui-fixes',
        locationPath: projectBase,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory',
      });
    }, { projectBase });

    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForTimeout(1200);

    await expect(page.locator('.app-shell.view-project')).toBeVisible();
    await expect(page.locator('.workbench-explorer-toolbar')).toBeVisible();
    await assertShellFillsViewport(page, '.app-shell.view-project');

    const rootPath = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.project?.rootPath ?? '';
    });
    expect(rootPath).not.toBe('');

    await page.evaluate(async (targetRoot: string) => {
      await window.api.createFile(targetRoot, 'packaged-alpha.md');
      await window.api.createFile(targetRoot, 'packaged-beta.md');
    }, rootPath);

    await page.reload();
    await page.waitForTimeout(1000);

    await page.locator('.workbench-pane-item', { hasText: 'packaged-alpha.md' }).first().click();
    await page.locator('.workbench-pane-item', { hasText: 'packaged-beta.md' }).first().click();

    const betaTab = page.locator('.document-tab', { hasText: 'packaged-beta.md' }).first();
    await expect(betaTab.locator('.document-tab-close')).toBeVisible();

    await page.getByTitle('新建会话').click();
    await expect(page.locator('.workbench-explorer-toolbar')).toBeVisible();
    await expect(page.locator('.session-sidebar-content')).toHaveCount(0);
    await assertWorkbenchEmptyStateSpacing(page);

    await page.getByTitle('打开思路地图').click();
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
  } finally {
    await app.close();
    assertNoBlockingAppLogEvents(path.join(userDataRoot, 'userData'), 'packaged workbench shell');
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('packaged app switches the active file immediately even when artifact loading is slow', async () => {
  test.setTimeout(180_000);
  test.skip(!existsSync(executablePath), 'packaged executable is missing');

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-switch-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-switch-userdata-'));

  const app = await electron.launch({
    executablePath,
    env: buildElectronEnv(userDataRoot),
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await page.evaluate(async ({ projectBase }: { projectBase: string }) => {
      await window.api.createProject({
        name: 'packaged-workbench-file-switch',
        locationPath: projectBase,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory',
      });
    }, { projectBase });

    await page.waitForTimeout(250);
    await page.reload();
    await page.waitForTimeout(1200);

    const rootPath = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.project?.rootPath ?? '';
    });
    expect(rootPath).not.toBe('');

    await page.evaluate(async (targetRoot: string) => {
      await window.api.createFile(targetRoot, 'packaged-latency-alpha.md');
      await window.api.createFile(targetRoot, 'packaged-latency-beta.md');
    }, rootPath);

    await page.reload();
    await page.waitForTimeout(1000);

    await assertFileSwitchFeedbackBeforeArtifactLoad(page, 'packaged-latency-beta.md', { timeoutMs: 250 });
  } finally {
    await app.close();
    assertNoBlockingAppLogEvents(path.join(userDataRoot, 'userData'), 'packaged file switch latency');
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
