import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import type { AppStage, RuntimeTemplateAsset } from '../../src/shared/types.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const TEMPLATE_PACKAGE_PATH = path.resolve(process.cwd(), 'artifacts', 'solo-company-workflow', 'solo-company-template-package.json');
const SOURCE_INDEX_PATH = path.resolve(process.cwd(), 'artifacts', 'solo-company-workflow', 'github-source-index.json');
const PROJECT_NAME = 'deepseek-solo-company-real-user';
const SOURCE_DOC_NAME = 'github-top20-solo-company-sources.md';
const STAGE_ORDER: AppStage[] = ['discover', 'clarify', 'plan', 'draft', 'review', 'finalize'];

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.TEMP = path.join(userDataRoot, 'temp');
  env.TMP = path.join(userDataRoot, 'temp');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.TEMP, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

function createRunDirs() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runRoot = path.resolve(process.cwd(), 'artifacts', 'real-user-deepseek-solo-company', stamp);
  const inputRoot = path.join(runRoot, 'input');
  const workspaceRoot = path.join(runRoot, 'workspace');
  const userDataRoot = path.join(runRoot, 'user-data');
  const screenshotsRoot = path.join(runRoot, 'screenshots');
  const projectRoot = path.join(workspaceRoot, PROJECT_NAME);
  fs.mkdirSync(inputRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(userDataRoot, { recursive: true });
  fs.mkdirSync(screenshotsRoot, { recursive: true });
  return {
    runRoot,
    inputRoot,
    workspaceRoot,
    userDataRoot,
    screenshotsRoot,
    projectRoot
  };
}

function findFilePathByName(rootPath: string, expectedName: string): string {
  const pending = [rootPath];
  while (pending.length) {
    const currentPath = pending.pop()!;
    if (!fs.existsSync(currentPath)) {
      continue;
    }
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.name === expectedName) {
        return entryPath;
      }
    }
  }
  return '';
}

function buildSourceEvidenceMarkdown() {
  const records = JSON.parse(fs.readFileSync(SOURCE_INDEX_PATH, 'utf8')) as Array<{
    roleId: string;
    skillId: string;
    roleName: string;
    sourceRepo: string;
    stars: number;
    checkedAt: string;
    url: string;
    responsibility: string;
    whySelected: string;
  }>;

  const lines = [
    '# GitHub 高星单人公司来源证据',
    '',
    '## 使用说明',
    '- 本文档是本次 Cyber Editor 真实用户模拟的上游输入证据。',
    '- 目标是把 GitHub 高星的一人公司相关角色、skill 和工作流来源，映射成可执行的编排工作流与最终交付文档。',
    '- 这 20 条记录已经过来源整理，保留仓库、星标、职责和入选理由，供 DeepSeek 在当前工程内继续提炼。',
    '',
    '## 汇总要求',
    '- 把来源按发现、构建、自动化运营、增长、治理与升级几个主线收敛。',
    '- 对每一条来源提炼角色、skill、输入、输出、在主流程或子流程中的位置。',
    '- 最终交付文档必须能给另一个 AI 直接复现，不依赖额外口头背景。',
    ''
  ];

  records.forEach((record, index) => {
    lines.push(`## ${index + 1}. ${record.roleName}`);
    lines.push(`- roleId: ${record.roleId}`);
    lines.push(`- skillId: ${record.skillId}`);
    lines.push(`- sourceRepo: ${record.sourceRepo}`);
    lines.push(`- stars: ${record.stars}`);
    lines.push(`- checkedAt: ${record.checkedAt}`);
    lines.push(`- url: ${record.url}`);
    lines.push(`- responsibility: ${record.responsibility}`);
    lines.push(`- whySelected: ${record.whySelected}`);
    lines.push('');
  });

  lines.push('## 生成时必须满足');
  lines.push('- 输出不能只列名单，必须形成角色到节点、节点到阶段、阶段到文档的闭环。');
  lines.push('- 如果需要做判断，必须显式写出判断标准、风险和回滚条件。');
  lines.push('- 如果文档是执行型文档，必须细到步骤、输入、输出、证据与验收标准。');
  lines.push('');
  return lines.join('\n');
}

function readTemplateDefinition() {
  const payload = JSON.parse(fs.readFileSync(TEMPLATE_PACKAGE_PATH, 'utf8')) as {
    definition: { id: string; name: string };
  };
  return payload.definition;
}

async function setWindowBounds(app: ElectronApplication, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }: { BrowserWindow: { getAllWindows: () => Array<{ setBounds: (bounds: { width: number; height: number }) => void }> } }, bounds: { width: number; height: number }) => {
    BrowserWindow.getAllWindows()[0].setBounds(bounds);
  }, { width, height });
}

async function mockDialogPaths(app: ElectronApplication, filePaths: string[]) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await app.evaluate(({ dialog }: any, nextPaths: string[]) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: nextPaths
        });
      }, filePaths);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function loadBootstrap(page: Page) {
  return page.evaluate(async () => window.api.bootstrapLoad());
}

function writeJsonArtifact(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function countAssistantMessagesFromProject(projectRoot: string) {
  const sessionsPath = path.join(projectRoot, '.project', 'sessions.json');
  if (!fs.existsSync(sessionsPath)) {
    return 0;
  }
  const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8')) as Array<{ messages?: Array<{ role?: string }> }>;
  return sessions.reduce((total, session) => total + (session.messages ?? []).filter((message) => message.role === 'assistant').length, 0);
}

async function waitForChatCompletion(page: Page, projectRoot: string, previousRunIds: string[], assistantCountBefore: number, timeout = 480_000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newRuns = bootstrap.runtimeRuns.filter((run) => run.kind === 'chat' && !previousRunIds.includes(run.id));
    const failedRun = newRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newRuns.find((run) => run.status === 'completed');
    const assistantCount = countAssistantMessagesFromProject(projectRoot);
    return completedRun || assistantCount > assistantCountBefore ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

async function waitForReviewCompletion(page: Page, previousRunIds: string[], previousRoundCount: number, timeout = 600_000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newRuns = bootstrap.runtimeRuns.filter((run) => run.kind === 'review' && !previousRunIds.includes(run.id));
    const failedRun = newRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newRuns.find((run) => run.status === 'completed');
    return completedRun && bootstrap.reviewRounds.length > previousRoundCount ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

async function waitForStageDraftCompletion(page: Page, previousRunIds: string[], expectedFiles: string[], timeout = 900_000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    const newRuns = bootstrap.runtimeRuns.filter((run) => run.kind === 'stage' && !previousRunIds.includes(run.id));
    const failedRun = newRuns.find((run) => run.status === 'failed');
    if (failedRun) {
      return `failed:${failedRun.errorMessage ?? 'unknown'}`;
    }
    const completedRun = newRuns.find((run) => run.status === 'completed');
    const filesReady = expectedFiles.every((filePath) => fs.existsSync(filePath));
    return completedRun && filesReady ? 'completed' : 'running';
  }, { timeout }).toBe('completed');
}

async function waitForWorkflowStage(page: Page, expectedStage: AppStage, timeout = 240_000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    return bootstrap.project?.workflow.stage ?? '';
  }, { timeout }).toBe(expectedStage);
}

async function waitForProjectReady(page: Page, expectedRootPath: string, timeout = 120_000) {
  await expect.poll(async () => {
    const bootstrap = await loadBootstrap(page);
    return bootstrap.project?.rootPath ?? '';
  }, { timeout }).toBe(expectedRootPath);
}

async function resolvePendingDocumentWriteIfOpen(page: Page) {
  const dialog = page.locator('.document-protection-dialog');
  if (!await dialog.isVisible().catch(() => false)) {
    return;
  }
  const acceptButton = dialog.locator('.document-protection-section').nth(1).locator('.modal-actions .button-primary');
  await expect(acceptButton).toBeVisible();
  await acceptButton.click();
  await expect(dialog).toBeHidden({ timeout: 180_000 });
}

async function ensureContextPaneVisible(page: Page) {
  const composer = page.locator('.context-pane .composer textarea');
  if (await composer.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTitle('切换 AI 侧栏').click();
  await expect(composer).toBeVisible({ timeout: 30_000 });
}

async function ensureProcessPanelVisible(page: Page) {
  const panel = page.locator('.process-panel');
  if (await panel.isVisible().catch(() => false)) {
    return;
  }
  const topbarToggle = page.getByTitle('切换流程面板');
  if (await topbarToggle.isVisible().catch(() => false)) {
    await topbarToggle.click();
  } else {
    const railToggle = page.getByTitle('任务抽屉');
    await expect(railToggle).toBeVisible({ timeout: 30_000 });
    await railToggle.click();
  }
  await expect(panel).toBeVisible({ timeout: 30_000 });
}

async function openProviderSettings(page: Page) {
  const directButton = page.getByTitle('打开设置');
  if (await directButton.isVisible().catch(() => false)) {
    await directButton.click();
    return;
  }

  await page.getByTitle('设置').click();
  const workspaceEntry = page.getByRole('button', { name: '打开完整设置' });
  await expect(workspaceEntry).toBeVisible({ timeout: 30_000 });
  await workspaceEntry.click();
}

async function waitForDocumentEntry(page: Page, fileName: string, timeout = 60_000) {
  const legacyNode = page.locator('.tree-node-file', { hasText: fileName }).first();
  const workbenchTitleNode = page.locator(`.workbench-pane-item[title="${fileName}"]`).first();
  const workbenchTextNode = page.locator('.workbench-pane-item', { hasText: fileName }).first();

  await expect.poll(async () => {
    if (await legacyNode.isVisible().catch(() => false)) {
      return 'legacy';
    }
    if (await workbenchTitleNode.isVisible().catch(() => false)) {
      return 'workbench-title';
    }
    if (await workbenchTextNode.isVisible().catch(() => false)) {
      return 'workbench-text';
    }
    return '';
  }, { timeout }).not.toBe('');

  if (await workbenchTitleNode.isVisible().catch(() => false)) {
    return workbenchTitleNode;
  }
  if (await workbenchTextNode.isVisible().catch(() => false)) {
    return workbenchTextNode;
  }
  return legacyNode;
}

async function openDocumentFromTree(page: Page, fileName: string) {
  const node = await waitForDocumentEntry(page, fileName);
  await node.click();
}

async function sendWorkbenchChat(page: Page, projectRoot: string, message: string) {
  await ensureContextPaneVisible(page);
  const bootstrapBefore = await loadBootstrap(page);
  const assistantCountBefore = countAssistantMessagesFromProject(projectRoot);
  await page.locator('.context-pane .composer textarea').fill(message);
  const currentSendButton = page.locator('.context-pane .workbench-composer .button-primary').last();
  if (await currentSendButton.isVisible().catch(() => false)) {
    await currentSendButton.click();
  } else {
    await page.locator('.context-pane .composer-actions button').last().click();
  }
  await waitForChatCompletion(
    page,
    projectRoot,
    bootstrapBefore.runtimeRuns.filter((run) => run.kind === 'chat').map((run) => run.id),
    assistantCountBefore
  );
}

async function sendOrchestrationChat(page: Page, message: string) {
  const assistantCountBefore = await page.locator('.message-thread.assistant').count();
  await page.locator('.orchestration-chat-composer textarea').fill(message);
  await page.locator('.orchestration-chat-composer .composer-actions .button-primary').click();
  await expect(page.getByTestId('flow-conversation-preview')).toBeVisible({ timeout: 480_000 });
  await expect.poll(async () => page.locator('.message-thread.assistant').count(), { timeout: 60_000 }).toBeGreaterThan(assistantCountBefore);
}

async function generateStage(page: Page, expectedFiles: string[]) {
  await ensureProcessPanelVisible(page);
  await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();
  const bootstrapBefore = await loadBootstrap(page);
  await page.locator('.process-panel').getByRole('button', { name: '生成阶段草稿' }).click();
  await waitForStageDraftCompletion(
    page,
    bootstrapBefore.runtimeRuns.filter((run) => run.kind === 'stage').map((run) => run.id),
    expectedFiles
  );
  await resolvePendingDocumentWriteIfOpen(page);
}

async function confirmCurrentStage(page: Page, expectedNextStage: AppStage) {
  await ensureProcessPanelVisible(page);
  await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();
  await page.locator('.process-panel').getByRole('button', { name: '确认当前阶段' }).click();
  await waitForWorkflowStage(page, expectedNextStage);
}

async function runRedBlueReview(page: Page) {
  await ensureProcessPanelVisible(page);
  await page.locator('.process-tabs').getByRole('button', { name: '审查' }).click();
  const bootstrapBefore = await loadBootstrap(page);
  await page.locator('.process-grid.review-grid').getByRole('button', { name: '执行红蓝审查' }).click();
  await waitForReviewCompletion(
    page,
    bootstrapBefore.runtimeRuns.filter((run) => run.kind === 'review').map((run) => run.id),
    bootstrapBefore.reviewRounds.length
  );
}

async function adoptLatestReviewIssues(page: Page) {
  await ensureProcessPanelVisible(page);
  await page.locator('.process-tabs').getByRole('button', { name: '审查' }).click();

  const latestRound = page.locator('.review-round-card').last();
  await expect(latestRound).toBeVisible({ timeout: 30_000 });

  let updates = 0;
  for (let pass = 0; pass < 80; pass += 1) {
    const before = await loadBootstrap(page);
    const latestRoundState = before.reviewRounds[before.reviewRounds.length - 1];
    const remainingBefore = (latestRoundState?.issues ?? []).filter((item) => item.state === 'pending').length;
    if (!remainingBefore) {
      break;
    }

    const pendingIndex = await latestRound.locator('.review-issue-card').evaluateAll((cards) => cards.findIndex((card) => {
      const pendingButton = card.querySelector('.segmented.compact button:first-child');
      return pendingButton?.classList.contains('active') ?? false;
    }));
    if (pendingIndex < 0) {
      throw new Error(`review round still has ${remainingBefore} pending issues, but no pending card is visible in UI`);
    }

    const issueCard = latestRound.locator('.review-issue-card').nth(pendingIndex);
    await issueCard.scrollIntoViewIfNeeded();
    await issueCard.locator('.segmented.compact button').nth(1).click();
    await expect.poll(async () => {
      const bootstrap = await loadBootstrap(page);
      const round = bootstrap.reviewRounds[bootstrap.reviewRounds.length - 1];
      return (round?.issues ?? []).filter((item) => item.state === 'pending').length;
    }, { timeout: 30_000 }).toBe(remainingBefore - 1);
    updates += 1;
  }

  const result = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    const round = bootstrap.reviewRounds[bootstrap.reviewRounds.length - 1];
    return {
      updated: (round?.issues ?? []).filter((item) => item.state === 'adopted').length,
      remaining: (round?.issues ?? []).filter((item) => item.state === 'pending').length
    };
  });

  expect(result.remaining).toBe(0);
  expect(result.updated).toBeGreaterThanOrEqual(updates);

  await page.locator('.process-tabs').getByRole('button', { name: '阶段' }).click();
  await expect(page.locator('.process-panel').getByRole('button', { name: '确认当前阶段' })).toBeEnabled({ timeout: 30_000 });
}

async function capture(page: Page, screenshotsRoot: string, name: string) {
  await page.screenshot({
    path: path.join(screenshotsRoot, name),
    fullPage: true
  });
}

async function clickWelcomeCreateProject(page: Page) {
  const testIdButton = page.getByTestId('welcome-create-project');
  if (await testIdButton.isVisible().catch(() => false)) {
    await testIdButton.click();
    return;
  }
  await page.getByRole('button', { name: '新建工程' }).first().click();
}

function getStageAbsolutePaths(projectRoot: string, template: RuntimeTemplateAsset, stage: AppStage) {
  return (template.stageDocuments[stage] ?? []).map((target) => path.join(projectRoot, target.path));
}

test('real user uses DeepSeek with solo-company template to generate delivery documents', async () => {
  test.setTimeout(7_200_000);
  test.skip(!DEEPSEEK_API_KEY, 'DEEPSEEK_API_KEY is required for real provider validation.');

  const templateDefinition = readTemplateDefinition();
  const dirs = createRunDirs();
  const sourceDocPath = path.join(dirs.inputRoot, SOURCE_DOC_NAME);
  fs.writeFileSync(sourceDocPath, buildSourceEvidenceMarkdown(), 'utf8');

  const productFindings: string[] = [];
  const fallbacksUsed: string[] = [];
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(dirs.userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    page.on('dialog', (dialog) => dialog.accept());

    await setWindowBounds(app, 1680, 1200);
    await expect(page.locator('.welcome-screen')).toBeVisible();

    await clickWelcomeCreateProject(page);
    await expect(page.getByTestId('project-template-dialog')).toBeVisible();
    await page.getByTestId('project-dialog-open-resource-center').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();

    await mockDialogPaths(app, [TEMPLATE_PACKAGE_PATH]);
    const writeTemplateImportDiagnostics = async () => {
      const bootstrapAfterTemplateImport = await loadBootstrap(page);
      writeJsonArtifact(path.join(dirs.runRoot, 'resource-center-after-template-import.json'), {
        templates: bootstrapAfterTemplateImport.templates.map((template) => ({
          id: template.id,
          name: template.name,
          source: template.source,
          health: template.health,
          trust: template.trust
        })),
        recentResources: bootstrapAfterTemplateImport.settings.recentResources,
        pageMessages: await page.locator('.project-dialog-status, .workspace-status').allTextContents().catch(() => [])
      });
    };
    await page.getByRole('button', { name: '导入本地模板' }).click();
    await writeTemplateImportDiagnostics();
    const importedTemplateItem = page.locator(`[data-resource-id="template:${templateDefinition.id}"]`).first();
    await expect(importedTemplateItem).toBeVisible({ timeout: 60_000 });
    await importedTemplateItem.click();
    await capture(page, dirs.screenshotsRoot, '01-resource-center-template-imported.png');

    await page.getByTestId('resource-center-use-template').click();
    await page.getByLabel('工程名称').fill(PROJECT_NAME);
    await mockDialogPaths(app, [dirs.workspaceRoot]);
    await page.getByTestId('project-dialog-choose-location').click();
    await page.getByTestId('project-dialog-submit').click();

    await waitForProjectReady(page, dirs.projectRoot);
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 60_000 });
    const bootstrapAfterCreate = await loadBootstrap(page);
    expect(bootstrapAfterCreate.project?.rootPath).toBe(dirs.projectRoot);

    await openProviderSettings(page);
    await expect(page.getByTestId('provider-dialog')).toBeVisible();
    await page.getByTestId('provider-profile-profile-deepseek').click();
    await page.getByLabel('接口地址').fill('https://api.deepseek.com');
    await page.getByLabel('模型').fill('deepseek-chat');
    await page.getByLabel('API 密钥').fill(DEEPSEEK_API_KEY);
    await page.getByRole('button', { name: '测试连接' }).click();
    await expect(page.locator('.provider-dialog').getByText('连接成功')).toBeVisible({ timeout: 60_000 });
    await capture(page, dirs.screenshotsRoot, '02-provider-deepseek-connected.png');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByTestId('provider-dialog')).toBeHidden({ timeout: 30_000 });
    await page.getByTitle('主工作台').click();
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 30_000 });

    const bootstrapAfterSettings = await loadBootstrap(page);
    expect(bootstrapAfterSettings.settings.activeProviderProfileId).toBe('profile-deepseek');
    expect(['ok', 'healthy']).toContain(
      bootstrapAfterSettings.settings.providerProfiles.find((profile) => profile.id === 'profile-deepseek')?.diagnostics?.status
    );

    await mockDialogPaths(app, [sourceDocPath]);
    const importButton = page.locator('[data-testid="workbench-explorer-toolbar"] [title="导入"]').first();
    let importedSourcePath = '';
    if (await importButton.isVisible().catch(() => false)) {
      await importButton.click();
    } else {
      fallbacksUsed.push('project-import-documents-fallback');
      importedSourcePath = await page.evaluate(async () => {
        const bootstrap = await window.api.bootstrapLoad();
        if (!bootstrap.project?.rootPath) {
          throw new Error('project not ready');
        }
        const importedPaths = await window.api.importDocuments(bootstrap.project.rootPath);
        if (importedPaths[0]) {
          await window.api.setActiveDocument(importedPaths[0]);
          await window.api.refreshProject();
        }
        return importedPaths[0] ?? '';
      });
    }

    await expect.poll(async () => importedSourcePath || findFilePathByName(dirs.projectRoot, SOURCE_DOC_NAME), { timeout: 60_000 }).not.toBe('');
    const importedSourceAbsolutePath = importedSourcePath || findFilePathByName(dirs.projectRoot, SOURCE_DOC_NAME);
    await expect.poll(async () => {
      const bootstrap = await loadBootstrap(page);
      return (bootstrap.project?.workflow.activeDocumentPath ?? '').endsWith(SOURCE_DOC_NAME);
    }, { timeout: 60_000 }).toBe(true);
    const sourceEntry = await waitForDocumentEntry(page, SOURCE_DOC_NAME).catch(() => null);
    if (sourceEntry) {
      await sourceEntry.click();
    } else {
      fallbacksUsed.push('project-open-imported-document-fallback');
      await page.evaluate(async (targetPath) => {
        await window.api.setActiveDocument(targetPath);
        await window.api.refreshProject();
      }, importedSourceAbsolutePath);
    }
    await expect(page.locator('.document-pane')).toContainText('GitHub 高星单人公司来源证据');
    await capture(page, dirs.screenshotsRoot, '03-source-evidence-imported.png');

    await sendWorkbenchChat(
      page,
      dirs.projectRoot,
      '请基于当前 GitHub 来源证据，先给出 20 个角色的主线分组和工作流骨架。要求分成发现、构建、运营、增长、治理五类，并指出在当前工程里下一步最应该先生成哪一份阶段文档。'
    );
    await capture(page, dirs.screenshotsRoot, '04-workbench-chat-response.png');

    await page.getByTitle('流编排').click();
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible({ timeout: 30_000 });
    await sendOrchestrationChat(
      page,
      '在当前主流程中新增一个工具节点，标题固定为 GitHub 证据刷新，职责是用无头浏览器补充 GitHub 星标、README 摘要和最新变更证据。不要删除任何现有节点，只允许新增节点和必要连线。'
    );
    const previewModal = page.getByTestId('flow-conversation-preview');
    await expect(previewModal).toContainText('GitHub 证据刷新');
    await capture(page, dirs.screenshotsRoot, '05-orchestration-patch-preview.png');
    await previewModal.getByRole('button', { name: '应用修改' }).click();
    await expect(previewModal).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.react-flow__node', { hasText: 'GitHub 证据刷新' }).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: '保存当前流程' }).click();
    await capture(page, dirs.screenshotsRoot, '06-orchestration-after-patch.png');

    await page.getByTitle('主工作台').click();
    await expect(page.locator('.document-pane')).toBeVisible();

    const bootstrapBeforeStages = await loadBootstrap(page);
    const runtimeTemplate = bootstrapBeforeStages.runtimeTemplate;
    if (!runtimeTemplate) {
      throw new Error('Runtime template was not loaded after project creation.');
    }

    const stagePrompts: Array<{ stage: AppStage; prompt: string }> = [
      {
        stage: 'discover',
        prompt: '先把单人公司目标、边界、时间预算、收入目标、不做项和验证范围写扎实，明确这次工程要服务的对象和交付边界。'
      },
      {
        stage: 'clarify',
        prompt: '把 20 个 GitHub 来源显式映射成角色、skill、输入、输出、所在主流程或子流程位置，并说明为什么这样编排。'
      },
      {
        stage: 'plan',
        prompt: '主流程和子流程要覆盖工作流层、运行控制层、治理审计层、演进升级层，节点关系要清楚，供另一个 AI 直接复现。'
      },
      {
        stage: 'draft',
        prompt: '执行 SOP、治理、证据、审批、失败恢复、重试、局部重跑、升级与回滚要写成可执行操作清单。'
      },
      {
        stage: 'review',
        prompt: '风险、升级、回滚和治理审计要保守而完整，不能只有原则，要有触发条件、证据和责任归属。'
      },
      {
        stage: 'finalize',
        prompt: '最终交付文档必须能给人或另一个 AI 直接执行，不需要额外背景，不允许只写抽象说明。'
      }
    ];

    for (const [index, stagePrompt] of stagePrompts.entries()) {
      await openDocumentFromTree(page, SOURCE_DOC_NAME);
      await sendWorkbenchChat(page, dirs.projectRoot, stagePrompt.prompt);
      await generateStage(page, getStageAbsolutePaths(dirs.projectRoot, runtimeTemplate, stagePrompt.stage));

      const currentStageDocument = getStageAbsolutePaths(dirs.projectRoot, runtimeTemplate, stagePrompt.stage)[0];
      if (currentStageDocument) {
        await openDocumentFromTree(page, path.basename(currentStageDocument));
      }
      await capture(page, dirs.screenshotsRoot, `07-stage-${String(index + 1).padStart(2, '0')}-${stagePrompt.stage}.png`);

      if (stagePrompt.stage === 'draft') {
        await runRedBlueReview(page);
        await capture(page, dirs.screenshotsRoot, '08-red-blue-review-round.png');
      }

      if (stagePrompt.stage === 'review') {
        await adoptLatestReviewIssues(page);
        await capture(page, dirs.screenshotsRoot, '08b-review-issues-adopted.png');
      }

      if (stagePrompt.stage !== 'finalize') {
        await confirmCurrentStage(page, STAGE_ORDER[index + 1]!);
      }
    }

    const finalDocPath = getStageAbsolutePaths(dirs.projectRoot, runtimeTemplate, 'finalize')[0];
    if (!finalDocPath) {
      throw new Error('Final delivery document path not found in runtime template.');
    }
    await openDocumentFromTree(page, path.basename(finalDocPath));
    await expect(page.locator('.document-pane')).toContainText('最终交付');
    await capture(page, dirs.screenshotsRoot, '09-final-delivery-document.png');

    const finalBootstrap = await loadBootstrap(page);
    const failedRuns = finalBootstrap.runtimeRuns.filter((run) => run.status === 'failed');
    if (failedRuns.length) {
      productFindings.push(...failedRuns.map((run) => `runtime-run-failed:${run.kind}:${run.errorMessage ?? run.id}`));
    }
    const stageOutcomes = finalBootstrap.runtimeRuns
      .filter((run) => run.kind === 'stage')
      .flatMap((run) => run.artifactOutcomes ?? []);
    const repairedArtifacts = stageOutcomes.filter((outcome) => outcome.usedRepair);
    const deterministicFallbackArtifacts = stageOutcomes.filter((outcome) => outcome.usedDeterministicFallback);
    if (repairedArtifacts.length) {
      productFindings.push(...repairedArtifacts.map((outcome) => `artifact-repaired:${outcome.artifactPath}`));
    }
    if (deterministicFallbackArtifacts.length) {
      productFindings.push(...deterministicFallbackArtifacts.map((outcome) => `artifact-deterministic-fallback:${outcome.artifactPath}`));
    }

    const generatedDocs = STAGE_ORDER.flatMap((stage) => getStageAbsolutePaths(dirs.projectRoot, runtimeTemplate, stage));
    const runSummary = {
      runRoot: dirs.runRoot,
      projectRoot: dirs.projectRoot,
      screenshotsRoot: dirs.screenshotsRoot,
      sourceDocPath,
      generatedDocs,
      templateId: templateDefinition.id,
      activeProviderProfileId: finalBootstrap.settings.activeProviderProfileId,
      providerDiagnostics: finalBootstrap.settings.providerProfiles.map((profile) => ({
        id: profile.id,
        provider: profile.provider,
        model: profile.model,
        status: profile.diagnostics?.status ?? 'unknown',
        checkedAt: profile.diagnostics?.checkedAt ?? null
      })),
      runtimeRunCounts: {
        chat: finalBootstrap.runtimeRuns.filter((run) => run.kind === 'chat').length,
        stage: finalBootstrap.runtimeRuns.filter((run) => run.kind === 'stage').length,
        review: finalBootstrap.runtimeRuns.filter((run) => run.kind === 'review').length
      },
      reviewRoundCount: finalBootstrap.reviewRounds.length,
      productFindings,
      fallbacksUsed
    };
    fs.writeFileSync(path.join(dirs.runRoot, 'run-summary.json'), JSON.stringify(runSummary, null, 2), 'utf8');

    expect(fs.existsSync(finalDocPath)).toBe(true);
    expect(finalBootstrap.runtimeRuns.some((run) => run.kind === 'chat' && run.status === 'completed')).toBeTruthy();
    expect(finalBootstrap.runtimeRuns.some((run) => run.kind === 'stage' && run.status === 'completed')).toBeTruthy();
    expect(finalBootstrap.reviewRounds.length).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
