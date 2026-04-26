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

async function ensureDocumentOpen(page: import('@playwright/test').Page) {
  const openFirstButton = page.getByRole('button', { name: '打开第一份文档' });
  if (await openFirstButton.isVisible().catch(() => false)) {
    await openFirstButton.click();
    await expect(page.locator('.document-heading strong')).toBeVisible();
    return;
  }

  if (await page.locator('.document-heading strong').first().isVisible().catch(() => false)) {
    return;
  }

  const firstTreeFile = page.getByTestId('workbench-tree-file').first();
  await expect(firstTreeFile).toBeVisible();
  await firstTreeFile.click();
  await expect(page.locator('.document-heading strong')).toBeVisible();
}

async function loadBootstrap(page: import('@playwright/test').Page) {
  return page.evaluate(async () => window.api.bootstrapLoad());
}

async function waitForWorkflowStage(page: import('@playwright/test').Page, stage: string, timeout = 120000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    return bootstrap.project?.workflow.stage ?? '';
  }, { timeout }).toBe(stage);
}

async function waitForStageDraftCompletion(
  page: import('@playwright/test').Page,
  stageRunIdsBefore: string[],
  expectedFiles: string[],
  timeout = 480000
) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newStageRuns = bootstrap.runtimeRuns.filter(
      (run) => run.kind === 'stage' && !stageRunIdsBefore.includes(run.id)
    );
    const failedRun = newStageRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newStageRuns.find((run) => run.status === 'completed');
    const filesReady = expectedFiles.every((filePath) => fs.existsSync(filePath));
    return completedRun && filesReady ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

async function resolvePendingDocumentWriteIfOpen(page: import('@playwright/test').Page) {
  const dialog = page.locator('.document-protection-dialog');
  if (!await dialog.isVisible().catch(() => false)) {
    return;
  }
  const acceptButton = dialog.locator('.document-protection-section').nth(1).locator('.modal-actions .button-primary');
  await expect(acceptButton).toBeVisible();
  await acceptButton.click();
  await expect(dialog).toBeHidden({ timeout: 120000 });
}

async function waitForReviewCompletion(
  page: import('@playwright/test').Page,
  reviewRunIdsBefore: string[],
  reviewRoundCountBefore: number,
  timeout = 480000
) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newReviewRuns = bootstrap.runtimeRuns.filter(
      (run) => run.kind === 'review' && !reviewRunIdsBefore.includes(run.id)
    );
    const failedRun = newReviewRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newReviewRuns.find((run) => run.status === 'completed');
    const newRoundCreated = bootstrap.reviewRounds.length > reviewRoundCountBefore;
    return completedRun && newRoundCreated ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

async function waitForChatCompletion(
  page: import('@playwright/test').Page,
  chatRunIdsBefore: string[],
  assistantCountBefore: number,
  timeout = 360000
) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newChatRuns = bootstrap.runtimeRuns.filter(
      (run) => run.kind === 'chat' && !chatRunIdsBefore.includes(run.id)
    );
    const failedRun = newChatRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newChatRuns.find((run) => run.status === 'completed');
    const assistantCount = await page.locator('.message-thread.assistant').count();
    return completedRun && assistantCount > assistantCountBefore ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

test('real user behavior with ollama qwen3:8bm completes chat, stage draft, review, and OpenSpec export', async () => {
  test.setTimeout(900000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-user-ollama-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-user-ollama-userdata-'));
  const projectPath = path.join(projectBase, 'user-behavior-ollama');

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1680, height: 1200 });
    });

    await expect(page.locator('.welcome-screen')).toBeVisible();

    await mockDialogPaths(app, [projectBase]);
    await page.getByTestId('welcome-create-project').click();
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByTestId('project-dialog-open-resource-center').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await page.locator('.template-list-item', { hasText: '软件工厂' }).first().click();
    await page.getByTestId('resource-center-use-template').click();
    await page.getByLabel('工程名称').fill('user-behavior-ollama');
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();

    await expect(page.locator('.document-workspace-headline strong')).toHaveText('user-behavior-ollama');
    await ensureDocumentOpen(page);

    await page.getByRole('button', { name: '源码' }).click();
    await page.locator('.editor').fill('# Requirement\n\nBuild a lightweight planning workspace.\n');
    await page.getByRole('button', { name: '保存更改' }).click();

    await page.getByTitle('打开设置').click();
    await expect(page.locator('.provider-dialog')).toBeVisible();
    await page.getByRole('button', { name: '新建配置' }).click();
    await page.getByLabel('配置名称').fill('本地 qwen3:8bm');
    await page.getByLabel('服务类型').selectOption('ollama');
    await page.getByLabel('接口地址').fill('http://127.0.0.1:11434/v1');
    await page.getByLabel('模型').fill('qwen3:8bm');
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.locator('.provider-dialog').getByText('连接成功')).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.locator('.provider-dialog')).toBeHidden();
    await expect(page.locator('.statusbar')).toContainText('设置已保存');

    const initialBootstrap = await loadBootstrap(page);
    const assistantCountBeforeChat = await page.locator('.message-thread.assistant').count();
    await page.locator('.composer textarea').fill('请基于当前阶段给出下一步建议，用两句话回答。');
    await page.getByRole('button', { name: '发送' }).click();
    await waitForChatCompletion(
      page,
      initialBootstrap.runtimeRuns.filter((run) => run.kind === 'chat').map((run) => run.id),
      assistantCountBeforeChat
    );

    await page.locator('.topbar-actions .icon-button[title="切换流程面板"]').click();
    await expect(page.locator('.process-panel')).toBeVisible();
    await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();

    const discoverBootstrapBefore = await loadBootstrap(page);
    await page.locator('.process-panel').getByRole('button', { name: '生成阶段草稿' }).click();
    await expect(page.locator('.statusbar')).toContainText('正在生成阶段草稿', { timeout: 15000 });
    await waitForStageDraftCompletion(
      page,
      discoverBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'stage').map((run) => run.id),
      [path.join(projectPath, '01-requirements', '01-原始需求.md')]
    );
    await resolvePendingDocumentWriteIfOpen(page);
    await page.locator('.process-panel').getByRole('button', { name: '确认当前阶段' }).click();
    await waitForWorkflowStage(page, 'clarify');

    const clarifyChatBootstrapBefore = await loadBootstrap(page);
    const assistantCountBeforeClarifyChat = await page.locator('.message-thread.assistant').count();
    await page.locator('.composer textarea').fill('补充约束：仅做桌面端文本与图文工作台，聚焦需求、方案和 OpenSpec 文档。');
    await page.getByRole('button', { name: '发送' }).click();
    await waitForChatCompletion(
      page,
      clarifyChatBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'chat').map((run) => run.id),
      assistantCountBeforeClarifyChat
    );

    const clarifyBootstrapBefore = await loadBootstrap(page);
    await page.locator('.process-panel').getByRole('button', { name: '生成阶段草稿' }).click();
    await expect(page.locator('.statusbar')).toContainText('正在生成阶段草稿', { timeout: 15000 });
    await waitForStageDraftCompletion(
      page,
      clarifyBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'stage').map((run) => run.id),
      [path.join(projectPath, '01-requirements', '02-需求澄清.md')]
    );
    await resolvePendingDocumentWriteIfOpen(page);
    await page.locator('.process-panel').getByRole('button', { name: '确认当前阶段' }).click();
    await waitForWorkflowStage(page, 'plan');

    const planChatBootstrapBefore = await loadBootstrap(page);
    const assistantCountBeforePlanChat = await page.locator('.message-thread.assistant').count();
    await page.locator('.composer textarea').fill('请开始拆出功能树、功能清单和技术方案，补齐设置、日志、最近工程和导出能力。');
    await page.getByRole('button', { name: '发送' }).click();
    await waitForChatCompletion(
      page,
      planChatBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'chat').map((run) => run.id),
      assistantCountBeforePlanChat
    );

    const planBootstrapBefore = await loadBootstrap(page);
    await page.locator('.process-panel').getByRole('button', { name: '生成阶段草稿' }).click();
    await expect(page.locator('.statusbar')).toContainText('正在生成阶段草稿', { timeout: 15000 });
    await waitForStageDraftCompletion(
      page,
      planBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'stage').map((run) => run.id),
      [
        path.join(projectPath, '01-requirements', '03-功能树.md'),
        path.join(projectPath, '01-requirements', '04-功能清单.md'),
        path.join(projectPath, '02-solution', '01-技术方案.md')
      ]
    );
    await resolvePendingDocumentWriteIfOpen(page);

    const reviewBootstrapBefore = await loadBootstrap(page);
    await page.locator('.process-tabs').getByRole('button', { name: '审查' }).click();
    await page.locator('.process-grid.review-grid').getByRole('button', { name: '执行红蓝审查' }).click();
    await expect(page.locator('.statusbar')).toContainText('正在执行红蓝审查', { timeout: 15000 });
    await waitForReviewCompletion(
      page,
      reviewBootstrapBefore.runtimeRuns.filter((run) => run.kind === 'review').map((run) => run.id),
      reviewBootstrapBefore.reviewRounds.length
    );
    await expect(page.locator('.review-round-card').first()).toBeVisible();

    await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();
    await page.locator('.process-panel').getByRole('button', { name: '确认当前阶段' }).click();
    await expect.poll(async () => {
      const bootstrap = await loadBootstrap(page);
      return bootstrap.project?.workflow.confirmedStages.includes('plan') ?? false;
    }, { timeout: 120000 }).toBe(true);

    await page.locator('.process-panel').getByRole('button', { name: '导出 OpenSpec' }).click();
    const roadmapPath = path.join(projectPath, '03-openspec', 'roadmap.md');
    await expect.poll(() => fs.existsSync(roadmapPath), { timeout: 240000 }).toBe(true);

    const bootstrap = await loadBootstrap(page);
    expect(bootstrap.settings.providerProfiles.some((profile) => profile.name === '本地 qwen3:8bm')).toBeTruthy();
    expect(bootstrap.runtimeRuns.some((run) => run.kind === 'chat' && run.status === 'completed')).toBeTruthy();
    expect(bootstrap.runtimeRuns.some((run) => run.kind === 'stage' && run.status === 'completed')).toBeTruthy();
    expect(bootstrap.runtimeRuns.some((run) => run.kind === 'review' && run.status === 'completed')).toBeTruthy();
    expect(bootstrap.reviewRounds.length).toBeGreaterThan(0);
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
