import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
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

async function setWindowBounds(app: any, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }: any, bounds: { width: number; height: number }) => {
    BrowserWindow.getAllWindows()[0].setBounds(bounds);
  }, { width, height });
}

async function saveLayout(page: any, activityView: string, overrides: Record<string, unknown> = {}) {
  await page.evaluate(async ({ activityView, overrides }: { activityView: string; overrides: Record<string, unknown> }) => {
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: settings.theme,
      sidebar: {
        ...settings.sidebar,
        activityView,
        ...overrides
      },
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      recentTemplates: settings.recentTemplates,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts
    });
  }, { activityView, overrides });
}

async function createProjectAndOpenFirstDoc(page: any, projectBase: string, name: string) {
  await page.evaluate(async ({ projectBase, name }: { projectBase: string; name: string }) => {
    await window.api.createProject({
      name,
      locationPath: projectBase,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, { projectBase, name });
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(1400);

  const firstMarkdownPath = await page.evaluate(async () => {
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
    return markdownPaths[0] ?? '';
  });

  expect(firstMarkdownPath).not.toBe('');

  await page.evaluate(async (targetPath: string) => {
    if (targetPath) {
      await window.api.setActiveDocument(targetPath);
    }
  }, firstMarkdownPath);
}

test('workbench shell keeps prototype chrome structure', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-shell-align-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-shell-align-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1880, 1180);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);

    await createProjectAndOpenFirstDoc(page, projectBase, 'prototype-shell-alignment');
    await saveLayout(page, 'project', { leftCollapsed: false, rightCollapsed: false });
    await page.reload();
    await page.waitForTimeout(800);

    await expect(page.locator('.app-shell.view-project .workbench-explorer-toolbar')).toBeVisible();
    await expect(page.locator('.app-shell.view-project .document-status-pill')).toBeVisible();
    await expect(page.locator('.app-shell.view-project .workbench-ai-head')).toBeVisible();
    await expect(page.locator('.app-shell.view-project .ai-summary-strip')).toBeVisible();
    await expect(page.locator('.app-shell.view-project .workbench-session-rail')).toBeVisible();
    await expect(page.getByTitle('新建会话')).toBeVisible();
    await expect(page.getByTitle('打开思路地图')).toBeVisible();

    const shellRect = await page.locator('.app-shell.view-project').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        rightGap: window.innerWidth - rect.right,
        bottomGap: window.innerHeight - rect.bottom
      };
    });

    expect(shellRect.left).toBeLessThanOrEqual(1);
    expect(shellRect.top).toBeLessThanOrEqual(1);
    expect(shellRect.rightGap).toBeLessThanOrEqual(1);
    expect(shellRect.bottomGap).toBeLessThanOrEqual(1);
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('thinking-chain shell keeps prototype compact side detail', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-thinking-shell-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-thinking-shell-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1880, 1180);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);

    await createProjectAndOpenFirstDoc(page, projectBase, 'thinking-shell-alignment');
    await saveLayout(page, 'thinking-chain', { leftCollapsed: false, rightCollapsed: true });
    await page.reload();
    await page.waitForTimeout(1000);

    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
    await expect(page.locator('.thinking-map-detail-pane')).toBeVisible();

    const detailWidth = await page.locator('.thinking-map-detail-pane').evaluate((element) => {
      return Math.round(element.getBoundingClientRect().width);
    });

    expect(detailWidth).toBeLessThanOrEqual(332);
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('orchestration shell keeps prototype panel density and tool row', async () => {
  test.setTimeout(180_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-flow-shell-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-flow-shell-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1880, 1180);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);

    await createProjectAndOpenFirstDoc(page, projectBase, 'flow-shell-alignment');
    await saveLayout(page, 'orchestration', { leftCollapsed: false, rightCollapsed: true });
    await page.reload();
    await page.waitForTimeout(1000);

    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    await expect(page.locator('.flow-module-panel')).toBeVisible();
    await expect(page.locator('.orchestration-right-panel')).toBeVisible();
    await expect(page.locator('.orchestration-right-rail')).toBeVisible();

    const widths = await page.evaluate(() => {
      const panelWidth = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return 0;
        return Math.round(element.getBoundingClientRect().width);
      };
      return {
        module: panelWidth('.flow-module-panel'),
        rightPanel: panelWidth('.orchestration-right-panel'),
        rightRail: panelWidth('.orchestration-right-rail'),
        toolCount: document.querySelectorAll('.flow-canvas-toolbar-actions .canvas-rack-button').length
      };
    });

    expect(widths.module).toBeLessThanOrEqual(210);
    expect(widths.rightPanel).toBeLessThanOrEqual(304);
    expect(widths.rightRail).toBeLessThanOrEqual(44);
    expect(widths.toolCount).toBeGreaterThanOrEqual(8);
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
