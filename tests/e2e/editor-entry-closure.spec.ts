import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate } from './helpers/project-fixtures';

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

async function createProject(page: import('@playwright/test').Page, rootPath: string, name: string) {
  await createProjectAndHydrate(page, { name, locationPath: rootPath, templateId: 'software-factory' });
}

test('project creation dialog blocks invalid names and conflicting targets before submit', async () => {
  test.setTimeout(120_000);

  const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-entry-validation-parent-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-entry-validation-userdata-'));
  fs.mkdirSync(path.join(parentRoot, 'existing-project'), { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1540, height: 980 });
    });

    await page.getByTestId('welcome-create-project').click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();

    await mockDialogPaths(app, [parentRoot]);
    await page.getByTestId('project-dialog-choose-location').click();
    await expect(page.locator('.project-template-location input')).toHaveValue(parentRoot);

    await page.getByLabel('工程名称').fill('invalid/project');
    await expect(page.getByTestId('project-create-validation')).toContainText('工程名称包含不支持的字符');
    await expect(page.getByTestId('project-dialog-submit')).toBeDisabled();

    await page.getByLabel('工程名称').fill('existing-project');
    await mockDialogPaths(app, [parentRoot]);
    await page.getByTestId('project-dialog-choose-location').click();
    await expect(page.locator('.project-template-location input')).toHaveValue(parentRoot);
    await expect(page.getByTestId('project-create-validation')).toContainText('目标目录已存在');
    await expect(page.getByTestId('project-dialog-submit')).toBeDisabled();
  } finally {
    await app.close();
    fs.rmSync(parentRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('structured markdown editor supports slash commands, keyboard navigation, and fenced-block guard', async () => {
  test.setTimeout(120_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-structured-markdown-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-structured-markdown-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1040 });
    });

    await createProject(page, projectRoot, 'structured-markdown-project');

    const editor = page.locator('textarea.editor');
    if (!await editor.isVisible().catch(() => false)) {
      const sourceButton = page.getByRole('button', { name: /源码|Source/ }).first();
      await expect(sourceButton).toBeVisible();
      await sourceButton.click();
    }
    await expect(editor).toBeVisible();

    await editor.fill('/');
    await expect(page.getByTestId('markdown-slash-menu')).toBeVisible();
    await expect(page.getByTestId('markdown-command-heading-1')).toHaveAttribute('aria-selected', 'true');
    await editor.press('ArrowDown');
    await expect(page.getByTestId('markdown-command-heading-2')).toHaveAttribute('aria-selected', 'true');
    await editor.press('ArrowUp');
    await expect(page.getByTestId('markdown-command-heading-1')).toHaveAttribute('aria-selected', 'true');

    await editor.fill('/mer');
    await expect(page.getByTestId('markdown-command-mermaid')).toBeVisible();
    await editor.press('Enter');
    await expect(editor).toHaveValue(/```mermaid[\s\S]*graph TD/);

    await page.keyboard.press('Control+S');
    const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
    const activeDocumentPath = bootstrap.project?.workflow.activeDocumentPath;
    expect(activeDocumentPath).toBeTruthy();
    if (!activeDocumentPath) {
      throw new Error('bootstrap did not provide an active document path');
    }
    const savedMarkdown = fs.readFileSync(activeDocumentPath, 'utf8');
    expect(savedMarkdown).toContain('```mermaid');
    expect(savedMarkdown.includes('/mer')).toBe(false);

    await editor.fill('```ts\n/guard\n```');
    await editor.evaluate((element) => {
      const node = element as HTMLTextAreaElement;
      const cursor = node.value.indexOf('/guard') + '/guard'.length;
      node.focus();
      node.setSelectionRange(cursor, cursor);
      node.dispatchEvent(new Event('select', { bubbles: true }));
    });
    await expect(page.getByTestId('markdown-slash-menu')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
