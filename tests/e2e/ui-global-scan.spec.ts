import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { openActivity } from './helpers/ui-compat';
import { createProjectAndHydrate } from './helpers/project-fixtures';

async function setWindowBounds(app: any, width: number, height: number) {
  await app.evaluate(
    (
      { BrowserWindow }: { BrowserWindow: { getAllWindows: () => Array<{ setBounds: (bounds: { width: number; height: number }) => void }> } },
      bounds: { width: number; height: number }
    ) => {
      BrowserWindow.getAllWindows()[0].setBounds(bounds);
    },
    { width, height }
  );
}

function createIsolatedEnv(userDataRoot: string) {
  const env = Object.entries(process.env).reduce<Record<string, string>>((all, [key, value]) => {
    if (value !== undefined) all[key] = value;
    return all;
  }, {});
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

async function dragResizer(page: any, selector: string, deltaX: number) {
  const handle = page.locator(selector).first();
  const box = await handle.boundingBox();
  if (!box) throw new Error(`未找到可拖拽分隔条：${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

test('global UI scan covers first-launch, dialogs, sidebars, resizing, process panel, orchestration, compact mode, and dark mode', async () => {
  test.setTimeout(240_000);

  const outputDir = path.resolve(process.cwd(), 'artifacts', 'ui-global-scan');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-global-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-global-user-'));
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: createIsolatedEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1480, 1080);
    await page.waitForTimeout(1200);

    await expect(page.locator('.welcome-screen')).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, '01-welcome-light.png') });

    await page.getByTestId('welcome-create-project').click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, '02-project-dialog-light.png') });
    await page.getByTestId('project-dialog-close').click();
    await expect(page.getByTestId('project-template-dialog')).toBeHidden();

    await createProjectAndHydrate(page, { name: 'ui-global-scan', locationPath: projectRoot });
    await page.screenshot({ path: path.join(outputDir, '03-workbench-project-light.png') });

    await page.evaluate(() => {
      window.prompt = () => '扫描记录.md';
    });
    await page.getByTitle('新建文件').first().click();
    await page.locator('.document-tab', { hasText: '扫描记录.md' }).first().click();
    await page.getByRole('button', { name: '源码' }).click();
    await page.locator('.editor').fill('# 扫描记录\n\n统一视觉检查\n拖拽宽度检查\n流程面板检查\n');
    await page.getByRole('button', { name: '保存更改' }).click();

    await page.locator('.topbar-menu-trigger[title="文件"]').click();
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputDir, '04-topbar-file-menu.png') });
    await page.locator('.topbar-menu-trigger[title="编辑"]').click();
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputDir, '05-topbar-edit-menu.png') });
    await page.locator('.topbar-menu-trigger[title="视图"]').click();
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputDir, '06-topbar-view-menu.png') });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: '打开命令面板' }).click();
    await expect(page.locator('.command-palette')).toBeVisible();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outputDir, '07-command-palette-light.png') });
    await page.locator('.command-palette').getByRole('button', { name: '关闭命令面板' }).click();
    await expect(page.locator('.command-palette')).toBeHidden();

    await openActivity(page, 'project');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outputDir, '08-sidebar-project-light.png') });

    await openActivity(page, 'sessions');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outputDir, '09-sidebar-sessions-light.png') });

    await dragResizer(page, '.resizer', -120);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, '10-sidebar-sessions-resized.png') });

    await setWindowBounds(app, 1180, 940);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputDir, '11-sidebar-sessions-compact.png') });

    await setWindowBounds(app, 1480, 1080);
    await page.waitForTimeout(250);

    await openActivity(page, 'resources');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outputDir, '12-sidebar-skills-light.png') });

    await openActivity(page, 'search');
    await page.getByPlaceholder('搜索文档正文或标题…').fill('统一视觉检查');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, '13-sidebar-search-light.png') });

    await openActivity(page, 'settings');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outputDir, '14-sidebar-settings-light.png') });
    await page.getByRole('button', { name: '打开完整设置' }).click();
    await expect(page.locator('.provider-dialog')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, '15-provider-dialog-light.png') });
    await page.locator('.provider-dialog').getByRole('button', { name: '关闭设置' }).click();
    await expect(page.locator('.provider-dialog')).toBeHidden();

    await openActivity(page, 'project');
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(outputDir, '16-document-chat-light.png') });

    await page.locator('.topbar-actions').getByRole('button', { name: '切换流程面板' }).click();
    await expect(page.locator('.process-panel')).toBeVisible();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '17-process-stage-light.png') });
    await page.locator('.process-tabs .process-tab').nth(1).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '18-process-review-light.png') });
    await page.locator('.process-tabs .process-tab').nth(2).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '19-process-history-light.png') });
    await page.locator('.process-header').getByRole('button', { name: '收起' }).click();
    await expect(page.locator('.process-panel')).toBeHidden();

    const activePath = (await page.locator('.document-heading span').textContent())?.trim() ?? '';
    await page.getByRole('button', { name: '源码' }).click();
    await page.locator('.editor').fill('# 扫描记录\n\n本地未保存版本\n');
    fs.writeFileSync(activePath, '# 扫描记录\n\n外部变更版本\n', 'utf8');
    await page.getByRole('button', { name: '检查外部变更' }).click();
    await expect(page.locator('.conflict-dialog')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: path.join(outputDir, '20-conflict-dialog-light.png') });
    await page.getByRole('button', { name: '重新加载外部版本' }).click();
    await page.waitForTimeout(220);

    await openActivity(page, 'orchestration');
    await page.waitForTimeout(450);
    await expect(page.locator('.orchestration-workspace')).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, '21-orchestration-flows-light.png') });

    await page.getByRole('button', { name: '资源管理' }).click();
    const orchestrationAssetModal = page.locator('.flow-editor-modal').filter({ has: page.locator('[data-testid="orchestration-assets"]') });
    await expect(orchestrationAssetModal).toBeVisible();

    await orchestrationAssetModal.locator('[data-testid="orchestration-assets"] .sidebar-header .segmented.icon-only button[title="角色"]').click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '22-orchestration-roles-light.png') });

    await orchestrationAssetModal.locator('[data-testid="orchestration-assets"] .sidebar-header .segmented.icon-only button[title="连接"]').click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '23-orchestration-connectors-light.png') });

    await orchestrationAssetModal.locator('[data-testid="orchestration-assets"] .sidebar-header .segmented.icon-only button[title="工具"]').click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '24-orchestration-tools-light.png') });

    await orchestrationAssetModal.locator('[data-testid="orchestration-assets"] .sidebar-header .segmented.icon-only button[title="流程"]').click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '25-orchestration-flows-return-light.png') });
    await orchestrationAssetModal.getByRole('button', { name: '关闭' }).click();

    await setWindowBounds(app, 1220, 930);
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(outputDir, '26-orchestration-compact.png') });

    await setWindowBounds(app, 1480, 1080);
    await page.waitForTimeout(220);
    await page.getByRole('button', { name: '切换浅色/深色' }).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outputDir, '27-orchestration-dark.png') });

    await page.getByRole('button', { name: '返回文档工作台' }).click();
    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(outputDir, '28-workbench-dark.png') });

    const files = fs.readdirSync(outputDir).filter((file) => file.endsWith('.png'));
    expect(files.length).toBe(28);
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
