import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

import { assertCompactWorkbenchThreePaneUsable } from './helpers/human-experience-assertions';
import { openActivity } from './helpers/ui-compat';

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

async function setWindowBounds(app: any, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }: any, bounds: { width: number; height: number }) => {
    BrowserWindow.getAllWindows()[0].setBounds(bounds);
  }, { width, height });
}

async function assertHorizontalFit(page: import('@playwright/test').Page, selector: string) {
  const fit = await page.locator(selector).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
    };
  });
  expect(fit.width).toBeGreaterThan(120);
  expect(fit.left).toBeGreaterThanOrEqual(0);
  expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth + 4);
}

async function persistTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.evaluate(async (nextTheme) => {
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: nextTheme,
      sidebar: settings.sidebar,
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      recentTemplates: settings.recentTemplates,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts,
    });
  }, theme);
}

test('keeps theme and shell layout coherent across main pages at normal and compact widths', async () => {
  test.setTimeout(240_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-shell-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-shell-userdata-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot),
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1480, 980);
    await page.waitForTimeout(500);

    await assertHorizontalFit(page, '.welcome-screen');

    await page.evaluate(async (rootPath) => {
      await window.api.createProject({
        name: 'shell-project',
        locationPath: rootPath,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory',
      });
    }, projectRoot);
    await page.reload();
    await page.waitForTimeout(1000);
    await persistTheme(page, 'dark');
    await page.reload();
    await page.waitForTimeout(900);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

    await openActivity(page, 'workbench');
    await assertHorizontalFit(page, '.document-pane');

    await openActivity(page, 'rules');
    await assertHorizontalFit(page, '[data-testid="rules-workspace"]');

    await openActivity(page, 'resources');
    await assertHorizontalFit(page, '[data-testid="resource-center-page"]');

    await openActivity(page, 'settings');
    await assertHorizontalFit(page, '.settings-workspace-page');

    await openActivity(page, 'orchestration');
    await assertHorizontalFit(page, '[data-testid="orchestration-workspace"]');

    await setWindowBounds(app, 980, 760);
    await page.waitForTimeout(400);

    await openActivity(page, 'workbench');
    await assertCompactWorkbenchThreePaneUsable(page);
    await assertHorizontalFit(page, '.document-pane');

    await openActivity(page, 'rules');
    await assertHorizontalFit(page, '[data-testid="rules-workspace"]');

    await openActivity(page, 'resources');
    await assertHorizontalFit(page, '[data-testid="resource-center-page"]');

    await openActivity(page, 'settings');
    await assertHorizontalFit(page, '.settings-workspace-page');

    await openActivity(page, 'orchestration');
    await assertHorizontalFit(page, '[data-testid="orchestration-workspace"]');
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
