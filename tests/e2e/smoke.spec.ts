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

test('app boots, creates a templated project, and completes core workbench flows', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-smoke-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-smoke-userdata-'));

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1200 });
    });
    await expect(page.getByText('Cyber Editor').first()).toBeVisible();

    await mockDialogPaths(app, [projectRoot]);
    await page.getByTestId('welcome-create-project').click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByTestId('project-dialog-open-resource-center').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await page.locator('.resource-list-item').first().click();
    await page.getByTestId('resource-center-use-template').click();
    await page.getByLabel(/工程名称|project/i).fill('smoke-project');
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();

    const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
    expect(bootstrap.project?.manifest.name).toBe('smoke-project');
    await expect(page.getByTestId('workbench-explorer-toolbar')).toBeVisible();

    await page.evaluate(async () => {
      const settings = await window.api.getSettings();
      await window.api.saveSettings({
        theme: settings.theme,
        sidebar: settings.sidebar,
        activeProviderProfileId: 'profile-mock'
      });
    });

    await page.getByTitle('资源中心').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await expect(page.locator('.resource-detail-pane')).toContainText('当前选中资源');
    await page.locator('.activity-bar .activity-button[title="主工作台"]').click();

    const assistantCountBefore = await page.locator('.context-pane .workbench-conversation .message-thread.assistant').count();
    await page.locator('.workbench-composer textarea').fill('请帮我梳理这个项目的第一轮需求');
    await page.locator('.workbench-composer .button-primary.small').click();
    await expect
      .poll(async () => page.locator('.context-pane .workbench-conversation .message-thread.assistant').count(), { timeout: 15_000 })
      .toBeGreaterThan(assistantCountBefore);

    await expect(page.locator('.context-pane .workbench-conversation .message-thread.assistant').last()).toBeVisible();
    await expect(page.locator('.context-pane .workbench-ai-head')).toBeVisible();
    await expect(page.locator('.context-pane .workbench-composer')).toBeVisible();

    const bootstrapAfterChat = await page.evaluate(async () => window.api.bootstrapLoad());
    expect(
      bootstrapAfterChat.runtimeRuns.some((run: any) => run.kind === 'chat' && run.status === 'completed')
    ).toBe(true);
    expect(
      bootstrapAfterChat.sessions.some((session: any) =>
        (session.messages ?? []).some((message: any) => message.role === 'assistant')
      )
    ).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
