import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate, refreshProjectAndHydrate } from './helpers/project-fixtures';

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

test('opens table artifacts, edits cells, and jumps from markdown links to linked artifacts', async () => {
  test.slow();
  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-table-ui-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-table-ui-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();

    await createProjectAndHydrate(page, { name: 'table-artifact-project', locationPath: projectBase });

    const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
    const rootPath = bootstrap.project?.rootPath;
    expect(rootPath).toBeTruthy();
    if (!rootPath) {
      throw new Error('project root path is missing');
    }

    const requirementsDir = path.join(rootPath, '01-requirements');
    const tablePath = await page.evaluate(async (parentPath) => window.api.createFile(parentPath, 'table.csv'), requirementsDir);
    const guidePath = await page.evaluate(async (parentPath) => window.api.createFile(parentPath, 'table-guide.md'), requirementsDir);
    await page.evaluate(async ({ tablePath, guidePath }) => {
      await window.api.saveDocument(tablePath, 'title,status\nCyber Editor,draft\n');
      await window.api.saveDocument(guidePath, '# 表格说明\n\n');
    }, { tablePath, guidePath });
    await refreshProjectAndHydrate(page);

    await page.getByTestId('workbench-tree-file').filter({ hasText: 'table.csv' }).first().click();
    await expect(page.locator('.table-artifact-grid')).toBeVisible();
    await expect(page.locator('.table-artifact-grid thead input').first()).toHaveValue('title');
    const statusCell = page.locator('.table-artifact-grid tbody tr').first().locator('input').nth(1);
    await statusCell.fill('done');
    await page.getByRole('button', { name: /保存|Save/ }).last().click();
    await expect.poll(() => fs.readFileSync(tablePath, 'utf8')).toContain('done');

    await page.getByTestId('workbench-tree-file').filter({ hasText: 'table-guide.md' }).first().click();
    await page.getByRole('button', { name: '源码' }).click();
    await page.getByTitle('插入工件嵌入').click();
    await expect(page.locator('.artifact-reference-dialog')).toBeVisible();
    await page.locator('.artifact-reference-dialog .asset-list-item', { hasText: 'table.csv' }).first().click();
    await page.locator('.artifact-reference-dialog').getByRole('button', { name: '插入嵌入' }).click();
    await page.getByTitle('插入工件链接').click();
    await expect(page.locator('.artifact-reference-dialog')).toBeVisible();
    await page.locator('.artifact-reference-dialog .asset-list-item', { hasText: 'table.csv' }).first().click();
    await page.locator('.artifact-reference-dialog input[placeholder=\"为空则使用文件名\"]').fill('打开表格');
    await page.locator('.artifact-reference-dialog').getByRole('button', { name: '插入链接' }).click();
    await page.getByRole('button', { name: /保存|Save/ }).last().click();
    await expect.poll(() => fs.readFileSync(guidePath, 'utf8')).toContain('[[table.csv|打开表格]]');
    await page.getByRole('button', { name: '阅读' }).click();
    await expect(page.locator('.embedded-table-preview')).toBeVisible();
    await page.locator('.inline-artifact-link', { hasText: '打开表格' }).click();
    await expect(page.locator('.document-heading')).toContainText('table.csv');
    await expect(page.locator('.table-artifact-grid')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
