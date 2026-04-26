import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { openActivity } from './helpers/ui-compat';

test('capture welcome, workbench, and resized page review screenshots', async () => {
  const outputDir = path.resolve(process.cwd(), 'artifacts', 'ui-review');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ui-review-'));
  fs.mkdirSync(outputDir, { recursive: true });

  const env = Object.entries(process.env).reduce<Record<string, string>>((all, [key, value]) => {
    if (value !== undefined) {
      all[key] = value;
    }
    return all;
  }, {});
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1480, height: 1080 });
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outputDir, 'welcome.png') });

    await page.evaluate(async (rootPath) => {
      await window.api.createProject({ name: 'ui-review-project', locationPath: rootPath, directoryMode: 'create-in-parent' });
    }, projectRoot);
    await page.reload();
    await page.waitForTimeout(1200);

    await page.screenshot({ path: path.join(outputDir, 'workbench.png') });

    const leftResizer = page.locator('.resizer').first();
    const leftBox = await leftResizer.boundingBox();
    if (leftBox) {
      await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(320, leftBox.y + leftBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    const rightResizer = page.locator('.resizer').nth(1);
    const rightBox = await rightResizer.boundingBox();
    if (rightBox) {
      await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(940, rightBox.y + rightBox.height / 2, { steps: 10 });
      await page.mouse.up();
    }

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1260, height: 980 });
    });
    await page.waitForTimeout(500);

    const sidebarTitleHeight = await page.locator('.primary-sidebar .sidebar-header-title').first().evaluate((node) => node.getBoundingClientRect().height);
    const sidebarDescriptionHeight = await page.locator('.primary-sidebar .sidebar-header-description').first().evaluate((node) => node.getBoundingClientRect().height);
    expect(sidebarTitleHeight).toBeLessThan(28);
    expect(sidebarDescriptionHeight).toBeLessThan(24);
    await page.screenshot({ path: path.join(outputDir, 'workbench-compact.png') });

    await openActivity(page, 'sessions');
    await page.waitForTimeout(250);
    const sessionTitleHeight = await page.locator('.session-main-copy strong').first().evaluate((node) => node.getBoundingClientRect().height);
    const sessionSummaryHeight = await page.locator('.session-main-copy .muted-line').first().evaluate((node) => node.getBoundingClientRect().height);
    const sessionBadgeHeight = await page.locator('.session-card .stage-badge').first().evaluate((node) => node.getBoundingClientRect().height);
    expect(sessionTitleHeight).toBeLessThan(24);
    expect(sessionSummaryHeight).toBeLessThan(52);
    expect(sessionBadgeHeight).toBeLessThan(28);
    await page.screenshot({ path: path.join(outputDir, 'sessions-compact.png') });

    await page.getByTitle('切换流程面板').click();
    await page.waitForTimeout(400);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 1320 });
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outputDir, 'process-tall.png'), fullPage: true });

    await page.getByTitle('切换浅色/深色').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outputDir, 'process-dark.png'), fullPage: true });

    await openActivity(page, 'orchestration');
    await page.waitForTimeout(400);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1220, height: 960 });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outputDir, 'orchestration.png'), fullPage: true });
    await expect(page.locator('[data-testid="orchestration-assets"]')).toHaveCount(0);
    await page.getByRole('button', { name: '资源管理' }).click();
    await expect(page.locator('.flow-editor-modal [data-testid="orchestration-assets"]')).toBeVisible();
    const orchestrationSegmentText = await page.locator('.flow-editor-modal [data-testid="orchestration-assets"] .segmented.icon-only button').evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? '').trim())
    );
    expect(orchestrationSegmentText.every((text) => text === '')).toBeTruthy();
    await page.locator('.flow-editor-modal').getByRole('button', { name: '关闭' }).click();

    await openActivity(page, 'settings');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outputDir, 'settings.png'), fullPage: true });

    expect(fs.existsSync(path.join(outputDir, 'welcome.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'workbench.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'workbench-compact.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'sessions-compact.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'process-tall.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'process-dark.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'orchestration.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(outputDir, 'settings.png'))).toBeTruthy();
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
