import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate } from './helpers/project-fixtures';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.entries(process.env).reduce<Record<string, string>>((all, [key, value]) => {
    if (value !== undefined) {
      all[key] = value;
    }
    return all;
  }, {});
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

test('recent projects can be opened, renamed, revealed, and removed from the welcome screen', async () => {
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-recent-open-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-recent-open-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Cyber Editor').first()).toBeVisible();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();

    await createProjectAndHydrate(page, { name: 'recent-alpha', locationPath: projectBase });
    await page.evaluate(async () => {
      await window.api.closeProject();
    });
    await page.reload();

    const recentOpenButton = page.getByRole('button', { name: '打开最近工程 recent-alpha' });
    await expect(recentOpenButton).toBeVisible();
    await recentOpenButton.click();
    await expect(page.locator('.document-workspace-headline strong')).toHaveText('recent-alpha');

    await page.evaluate(async () => {
      await window.api.closeProject();
    });
    await page.reload();
    await page.evaluate(() => {
      window.prompt = () => '常用工程';
      window.confirm = () => true;
    });

    const recentCard = page.locator('.recent-card').first();
    await recentCard.getByRole('button', { name: '重命名最近工程' }).click();
    await expect(recentCard.getByText('常用工程', { exact: true })).toBeVisible();

    await recentCard.getByRole('button', { name: '在系统中显示最近工程' }).click();
    await expect(page.locator('.statusbar span').first()).toHaveText(/已在系统中打开：常用工程|无法在系统中显示该工程/);

    await recentCard.getByRole('button', { name: '移除最近工程' }).click();
    await expect(page.getByText('还没有最近工程')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('invalid recent projects can be cleaned and the recent list can be cleared', async () => {
  const validBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-recent-valid-'));
  const invalidBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-recent-invalid-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-recent-invalid-userdata-'));
  const env = buildElectronEnv(userDataRoot);

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Cyber Editor').first()).toBeVisible();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();

    await createProjectAndHydrate(page, { name: 'valid-recent', locationPath: validBase });
    await createProjectAndHydrate(page, { name: 'invalid-recent', locationPath: invalidBase });
    await page.evaluate(async () => {
      await window.api.closeProject();
    });

    fs.rmSync(path.join(invalidBase, 'invalid-recent'), { recursive: true, force: true });
    await page.reload();
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    const invalidRecentCard = page.locator('.recent-card').filter({ hasText: 'invalid-recent' }).first();
    await expect(invalidRecentCard.getByText('已失效')).toBeVisible();
    await page.getByRole('button', { name: '清理失效' }).click();
    await expect(page.getByRole('button', { name: '打开最近工程 valid-recent' })).toBeVisible();
    await expect(page.getByText('invalid-recent')).toHaveCount(0);

    await page.getByRole('button', { name: '清空列表' }).click();
    await expect(page.getByText('还没有最近工程')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(validBase, { recursive: true, force: true });
    fs.rmSync(invalidBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
