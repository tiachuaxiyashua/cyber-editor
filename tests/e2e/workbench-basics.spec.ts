import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { openActivity } from './helpers/ui-compat';

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  return env;
}

async function mockDialogPaths(app: any, filePaths: string[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await app.evaluate(({ dialog }: any, nextPaths: string[]) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: nextPaths
        });
      }, filePaths);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

test('workbench basics support command palette, tabs, search, import, replace, and conflict prompts', async () => {
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-workbench-'));
  const externalBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-import-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-workbench-userdata-'));
  const externalDocPath = path.join(externalBase, '导入说明.md');
  fs.writeFileSync(externalDocPath, '# 导入说明\n\n这是外部导入的 Markdown 文档。\n', 'utf8');

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Cyber Editor').first()).toBeVisible();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();
    await expect(page.getByTestId('welcome-create-project')).toBeVisible();

    await mockDialogPaths(app, [projectBase]);
    await page.getByTestId('welcome-create-project').click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByTestId('project-dialog-open-resource-center').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await page.locator('.template-list-item', { hasText: '软件工厂' }).first().click();
    await page.getByTestId('resource-center-use-template').click();
    await page.getByLabel('工程名称').fill('workbench-basics');
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();

    await expect(page.locator('.document-workspace-headline strong')).toHaveText('workbench-basics');
    await expect(page.getByTestId('workbench-tree-file').filter({ hasText: '01-原始需求.md' }).first()).toBeVisible();

    await page.evaluate(() => {
      window.prompt = () => '规划记录.md';
    });
    await page.getByTitle('新建文件').first().click();
    await expect(page.getByTestId('workbench-tree-file').filter({ hasText: '规划记录.md' }).first()).toBeVisible();
    await page.getByTestId('workbench-tree-file').filter({ hasText: '规划记录.md' }).first().click();
    await expect(page.locator('.document-heading')).toContainText('规划记录.md');
    await expect(page.locator('.document-tab')).toHaveCount(2);
    await expect(page.locator('.document-tab', { hasText: '规划记录.md' }).first().getByRole('button', { name: '关闭文档 规划记录.md' })).toBeVisible();

    await page.getByTitle('打开命令面板').first().click();
    await expect(page.locator('.command-palette')).toBeVisible();
    await page.locator('.command-palette').getByRole('button', { name: '关闭命令面板' }).click();
    await expect(page.locator('.command-palette')).toBeHidden();

    await expect(page.locator('.app-shell.view-project')).toBeVisible();
    await page.getByTitle('新建会话').click();
    await expect(page.locator('.app-shell.view-project')).toBeVisible();
    await page.getByTitle('打开思路地图').click();
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
    await openActivity(page, 'workbench');
    await expect(page.locator('.app-shell.view-project')).toBeVisible();

    await page.locator('.document-tab', { hasText: '规划记录.md' }).first().click();
    await page.getByRole('button', { name: '源码' }).click();
    const editor = page.locator('.editor');
    await editor.fill('# 规划记录\n\n客户回款提醒\n客户回款提醒\n');
    await page.getByRole('button', { name: '保存更改' }).click();
    await page.getByTitle('文档保护').click();
    await expect(page.getByRole('dialog', { name: '文档保护' })).toBeVisible();
    await page.getByRole('button', { name: '创建快照' }).click();
    await page.getByRole('button', { name: '关闭' }).last().click();
    await editor.fill('# 规划记录\n\n恢复前的新版本\n');
    await page.getByRole('button', { name: '保存更改' }).click();
    await page.getByTitle('文档保护').click();
    await page.getByRole('button', { name: '恢复' }).first().click();
    await expect(editor).toContainText('客户回款提醒');
    await page.getByRole('button', { name: '关闭' }).last().click();

    await page.locator('.document-tab', { hasText: '01-原始需求.md' }).first().click();
    await editor.fill('# 原始需求\n\n交付节点\n客户回款提醒\n');
    await page.getByRole('button', { name: '保存更改' }).click();

    await page.getByRole('button', { name: '打开命令面板' }).click();
    await page.getByLabel('搜索命令').fill('工程搜索');
    await page.locator('.command-palette-item', { hasText: '工程搜索' }).click();
    await page.getByPlaceholder('搜索文档正文或标题…').fill('客户回款提醒');
    await expect(page.locator('.search-result-card').filter({ hasText: '规划记录.md' }).first()).toBeVisible();
    await page.locator('.search-result-card').filter({ hasText: '规划记录.md' }).first().click();
    await expect(page.locator('.document-heading')).toContainText('规划记录.md');
    await expect(editor).toContainText('客户回款提醒');

    await page.getByRole('button', { name: '查找', exact: true }).click();
    await page.getByLabel('查找当前文档').fill('客户回款提醒');
    await page.getByLabel('替换为').fill('客户回款计划');
    await page.getByRole('button', { name: '全部替换' }).click();
    await page.getByRole('button', { name: '保存更改' }).click();
    await expect(editor).toContainText('客户回款计划');

    const planningPath = (await page.locator('.document-heading span').textContent())?.trim() ?? '';
    expect(planningPath).toContain('规划记录.md');
    await editor.fill('# 规划记录\n\n本地未保存修改\n');
    await expect(page.getByRole('button', { name: '保存更改' })).toBeVisible();
    const beforeMeta = await page.evaluate(async (targetPath) => window.api.getDocumentMeta(targetPath), planningPath);
    await page.waitForTimeout(1200);
    fs.writeFileSync(planningPath, '# 规划记录\n\n外部修改版本\n', 'utf8');
    const afterMeta = await page.evaluate(async (targetPath) => window.api.getDocumentMeta(targetPath), planningPath);
    expect(afterMeta.modifiedAt).toBeGreaterThan(beforeMeta.modifiedAt);
    await page.getByRole('button', { name: '检查外部变更' }).click();
    await expect(page.getByText('检测到外部变更')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '重新加载外部版本' }).click();
    await expect(editor).toContainText('外部修改版本');
    await expect(page.locator('.context-pane .section-kicker', { hasText: '最近变更' })).toBeVisible();
    await expect(page.locator('.context-pane .small-tag', { hasText: '外部修改' })).toBeVisible();

    await mockDialogPaths(app, [externalDocPath]);
    await openActivity(page, 'project');
    await page.getByTitle('导入文本文档').click();
    await expect(page.getByText('导入说明.md').first()).toBeVisible();
    await expect(page.locator('.document-heading')).toContainText('导入说明.md');
    await page.getByRole('button', { name: '源码' }).click();
    await page.evaluate(() => {
      const textarea = document.querySelector('.editor');
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const file = new File([new Uint8Array([137, 80, 78, 71])], 'diagram.png', { type: 'image/png' });
      const clipboard = new DataTransfer();
      clipboard.items.add(file);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: clipboard });
      textarea.dispatchEvent(event);
    });
    await expect(editor).toContainText('diagram');

    await page.locator('.document-tab', { hasText: '规划记录.md' }).first().getByRole('button', { name: '关闭文档 规划记录.md' }).click();
    await expect(page.locator('.document-tab')).toHaveCount(2);
    await page.getByRole('button', { name: '重新打开已关闭文档' }).click();
    await expect(page.locator('.document-tab', { hasText: '规划记录.md' })).toBeVisible();

    await page.locator('.document-tab', { hasText: '规划记录.md' }).first().click();
    await page.getByTitle('开启分屏').click();
    await expect(page.locator('.secondary-pane-header')).toContainText('01-原始需求.md');

    await page.evaluate(() => {
      window.prompt = () => '01-requirements';
    });
    await page.locator('.workbench-pane-row').filter({ hasText: '规划记录.md' }).first().getByTitle('移动').click();
    await expect(page.locator('.document-heading span')).toContainText('01-requirements');
    await expect(page.locator('.secondary-pane-header')).toContainText('01-原始需求.md');

    await page.reload();
    await expect(page.locator('.document-heading span')).toContainText('01-requirements');
    await expect(page.locator('.secondary-pane-header')).toContainText('01-原始需求.md');

    const reopenedDocumentPath = ((await page.locator('.document-heading span').textContent()) ?? '').trim();
    expect(reopenedDocumentPath).toContain('01-requirements');

    const childWindowPromise = app.waitForEvent('window');
    await page.locator('.document-toolbar').getByRole('button', { name: '在新窗口打开' }).click();
    const childWindow = await childWindowPromise;
    await childWindow.waitForLoadState('domcontentloaded');
    await expect(childWindow.locator('.document-heading')).toContainText('01-requirements');
    await childWindow.getByRole('button', { name: '源码' }).click();
    const childEditor = childWindow.locator('.editor').first();
    await childEditor.fill('# 规划记录\n\n来自子窗口的保存内容\n');
    await childWindow.getByRole('button', { name: '保存更改' }).click();
    expect(fs.readFileSync(reopenedDocumentPath, 'utf8')).toContain('来自子窗口的保存内容');
    await childWindow.close();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(externalBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
