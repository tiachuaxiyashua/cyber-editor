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

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  const project = await page.evaluate(async (projectRoot) => {
    return await window.api.createProject({
      name: 'merge-protection-project',
      locationPath: projectRoot,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, rootPath);
  await page.reload();
  await page.waitForTimeout(1200);
  return project;
}

async function ensureProcessPanelOpen(page: import('@playwright/test').Page) {
  const processPanel = page.locator('.process-panel').first();
  if (await processPanel.isVisible().catch(() => false)) {
    return;
  }

  const processPanelToggle = page.locator('.topbar-actions').getByTitle('切换流程面板').first();
  if (await processPanelToggle.isVisible().catch(() => false)) {
    await processPanelToggle.click();
    await expect(processPanel).toBeVisible({ timeout: 15_000 });
    return;
  }

  const settings = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return {
      theme: bootstrap.settings.theme,
      sidebar: bootstrap.settings.sidebar
    };
  });
  await page.evaluate(async ({ theme, sidebar }) => {
    await window.api.saveSettings({
      theme,
      sidebar: { ...sidebar, processPanelOpen: true, processPanelTab: 'stage' }
    });
  }, settings);
  await page.reload();
  await expect(processPanel).toBeVisible({ timeout: 15_000 });
}

test('stage generation protects user edits with a pending AI write proposal before overwrite', async () => {
  test.setTimeout(180_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-merge-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-merge-userdata-'));

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
    await createProject(page, projectRoot);

    const bootstrap = await page.evaluate(async () => window.api.bootstrapLoad());
    const activeDocumentPath = bootstrap.project!.workflow.activeDocumentPath!;
    const activeSessionId = bootstrap.sessions[0]!.id;
    const originalDraft = await page.evaluate(async (filePath) => window.api.readDocument(filePath), activeDocumentPath);
    const humanDraft = `${originalDraft.trim()}\n\n## 人工补充\n- 当前文档已经被用户手动修订，AI 写回前必须进入显式合并确认。\n`;
    await page.evaluate(async ({ filePath, contents }) => {
      await window.api.saveDocument(filePath, contents);
    }, { filePath: activeDocumentPath, contents: humanDraft });

    await ensureProcessPanelOpen(page);
    await expect(page.locator('.process-panel')).toBeVisible();
    await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();
    await page.locator('.process-panel').getByRole('button', { name: '生成阶段草稿' }).click();

    const protectionDialog = page.locator('.document-protection-dialog');
    await expect(protectionDialog).toBeVisible({ timeout: 30_000 });

    const pendingProposal = await page.evaluate(async (filePath) => {
      const pending = await window.api.listPendingDocumentWrites(filePath);
      return pending[0] ?? null;
    }, activeDocumentPath);

    expect(pendingProposal).not.toBeNull();
    expect(pendingProposal?.proposedContent).not.toBe(humanDraft);

    await protectionDialog.locator('.document-protection-section').nth(1).locator('.modal-actions .button-primary').click();
    await expect(protectionDialog).toBeHidden({ timeout: 30_000 });

    const resolved = await page.evaluate(async (filePath) => {
      const contents = await window.api.readDocument(filePath);
      const pending = await window.api.listPendingDocumentWrites(filePath);
      return {
        contents,
        pendingCount: pending.length
      };
    }, activeDocumentPath);

    expect(resolved.pendingCount).toBe(0);
    expect(resolved.contents).toBe(pendingProposal!.proposedContent);

    const refreshed = await page.evaluate(async () => window.api.refreshProject());
    expect(refreshed.runtimeRuns.some((run: { kind: string; status: string }) => run.kind === 'stage' && run.status === 'completed')).toBe(true);
    expect(refreshed.recentDocumentChanges.some((record: { filePath: string }) => record.filePath === activeDocumentPath)).toBe(true);
    expect(activeSessionId).toBeTruthy();
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
