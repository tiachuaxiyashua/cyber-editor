import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

import {
  assertFileSwitchFeedbackBeforeArtifactLoad,
  assertShellFillsViewport,
  assertWorkbenchEmptyStateSpacing,
} from './helpers/human-experience-assertions';

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

async function createProject(page: any, projectBase: string, name: string) {
  await page.evaluate(async ({ projectBase, name }: { projectBase: string; name: string }) => {
    await window.api.createProject({
      name,
      locationPath: projectBase,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory',
    });
  }, { projectBase, name });
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(1200);
}

test('workbench runtime uses full-window shell, stable right actions, and closable tabs', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-workbench-ui-fixes-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-workbench-ui-fixes-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot),
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);

    await createProject(page, projectBase, 'workbench-runtime-ui-fixes');
    await expect(page.locator('.app-shell.view-project')).toBeVisible();
    await expect(page.locator('.workbench-explorer-toolbar')).toBeVisible();
    await assertShellFillsViewport(page, '.app-shell.view-project');

    const projectState = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      const markdownPaths: string[] = [];
      const walk = (nodes: any[]) => {
        for (const node of nodes ?? []) {
          if (node.type === 'file' && node.name.toLowerCase().endsWith('.md')) {
            markdownPaths.push(node.path);
          }
          if (node.children?.length) {
            walk(node.children);
          }
        }
      };
      walk(bootstrap.project?.tree ?? []);
      return {
        rootPath: bootstrap.project?.rootPath ?? '',
        markdownPaths,
      };
    });

    const alphaPath = await page.evaluate(async (rootPath: string) => window.api.createFile(rootPath, 'alpha-note.md'), projectState.rootPath);
    const betaPath = await page.evaluate(async (rootPath: string) => window.api.createFile(rootPath, 'beta-note.md'), projectState.rootPath);
    expect(alphaPath).toContain('alpha-note.md');
    expect(betaPath).toContain('beta-note.md');

    await page.reload();
    await page.waitForTimeout(1000);

    await page.locator('.workbench-pane-item', { hasText: 'alpha-note.md' }).first().click();
    await page.locator('.workbench-pane-item', { hasText: 'beta-note.md' }).first().click();
    const openTabCount = await page.locator('.document-tab').count();
    expect(openTabCount).toBeGreaterThanOrEqual(2);

    const betaTab = page.locator('.document-tab', { hasText: 'beta-note.md' }).first();
    await expect(betaTab.locator('.document-tab-close')).toBeVisible();

    await page.getByTitle('新建会话').click();
    await expect(page.locator('.app-shell.view-project .workbench-explorer-toolbar')).toBeVisible();
    await expect(page.locator('.session-sidebar-content')).toHaveCount(0);
    await assertWorkbenchEmptyStateSpacing(page);

    await page.getByTitle('打开思路地图').click();
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('workbench switches the active file immediately even when artifact loading is slow', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-workbench-file-switch-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-workbench-file-switch-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot),
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);

    await createProject(page, projectBase, 'workbench-file-switch-latency');
    await expect(page.locator('.app-shell.view-project')).toBeVisible();

    const projectState = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return {
        rootPath: bootstrap.project?.rootPath ?? '',
      };
    });

    await page.evaluate(async (rootPath: string) => {
      await window.api.createFile(rootPath, 'alpha-latency.md');
      await window.api.createFile(rootPath, 'beta-latency.md');
    }, projectState.rootPath);

    await page.reload();
    await page.waitForTimeout(1000);

    await assertFileSwitchFeedbackBeforeArtifactLoad(page, 'beta-latency.md');
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
