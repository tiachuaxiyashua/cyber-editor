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

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  await createProjectAndHydrate(page, {
    name: 'knowledge-index-project',
    locationPath: rootPath,
    templateId: 'software-factory'
  });
}

async function ensureAiSidebarVisible(page: import('@playwright/test').Page) {
  const composer = page.locator('.context-pane .composer textarea');
  if (await composer.isVisible().catch(() => false)) {
    return;
  }
  const toggle = page.locator('button[title*="AI"]').last();
  if (await toggle.count()) {
    await toggle.click();
    await expect(composer).toBeVisible({ timeout: 10_000 });
  }
}

async function loadBootstrap(page: import('@playwright/test').Page) {
  return page.evaluate(async () => window.api.bootstrapLoad());
}

test('knowledge index becomes stale after file changes and can be refreshed from the AI harness panel', async () => {
  test.setTimeout(180_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-knowledge-index-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-knowledge-index-userdata-'));

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
    await createProject(page, projectRoot);
    await ensureAiSidebarVisible(page);

    const bootstrap = await loadBootstrap(page);
    const notePath = bootstrap.project!.workflow.activeDocumentPath!;
    const existingChatRunIds = bootstrap.runtimeRuns
      .filter((run) => run.kind === 'chat')
      .map((run) => run.id);

    await page.evaluate(async ({ notePath }) => {
      const bootstrap = await window.api.bootstrapLoad();
      const session = bootstrap.sessions[0];
      if (!session) {
        throw new Error('Expected an active session before triggering knowledge retrieval.');
      }
      await window.api.sendAiMessage({
        sessionId: session.id,
        stage: session.stage,
        content: '请总结当前上下文并说明主要引用证据。',
        contextDocuments: [notePath]
      });
    }, { notePath });

    await expect.poll(async () => {
      const latestBootstrap = await loadBootstrap(page);
      const newRun = latestBootstrap.runtimeRuns.find(
        (run) => run.kind === 'chat' && !existingChatRunIds.includes(run.id)
      );
      return newRun?.status ?? 'missing';
    }, { timeout: 20_000 }).toBe('completed');

    const readyState = await loadBootstrap(page);
    expect(readyState.knowledgeIndexState?.status).toBe('ready');
    expect((readyState.contextPacks[0]?.retrievalHits?.length ?? 0) > 0).toBe(true);

    const future = Date.now() + 10_000;
    fs.writeFileSync(notePath, '# Updated Requirement\n\nThis file changed after indexing.\n', 'utf8');
    fs.utimesSync(notePath, future / 1000, future / 1000);

    await expect.poll(async () => {
      const refreshed = await page.evaluate(async () => window.api.refreshProject());
      return refreshed.knowledgeIndexState?.status ?? '';
    }, { timeout: 20_000 }).toBe('stale');

    await expect(page.getByTestId('knowledge-index-refresh')).toBeVisible();
    await page.getByTestId('knowledge-index-refresh').click();

    await expect.poll(async () => {
      const refreshed = await loadBootstrap(page);
      return {
        status: refreshed.knowledgeIndexState?.status ?? '',
        staleCount: refreshed.knowledgeIndexState?.staleDocumentPaths?.length ?? -1
      };
    }, { timeout: 20_000 }).toEqual({
      status: 'ready',
      staleCount: 0
    });
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
