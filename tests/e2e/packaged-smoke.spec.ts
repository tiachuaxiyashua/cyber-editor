import fs, { existsSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test.skip(process.platform !== 'win32', '当前冒烟只验证 Windows 打包产物。');
test.skip(process.env.CYBER_EDITOR_RUN_PACKAGED_SMOKE !== '1', 'packaged smoke only runs in the dedicated packaged script');

const executablePath = resolve(
  process.cwd(),
  'out',
  'package',
  'Cyber Editor-win32-x64',
  'Cyber Editor.exe'
);

function buildElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = resolve(userDataRoot, 'appdata');
  env.LOCALAPPDATA = resolve(userDataRoot, 'localappdata');
  env.HOME = resolve(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = resolve(userDataRoot, 'userData');
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

async function launchPackagedApp() {
  test.skip(!existsSync(executablePath), '未找到已打包产物，请先运行 npm run package。');
  const userDataRoot = fs.mkdtempSync(resolve(os.tmpdir(), 'cyber-editor-packaged-smoke-'));
  const app = await electron.launch({
    executablePath,
    env: buildElectronEnv(userDataRoot)
  });
  return { app, userDataRoot };
}

test('packaged app boots and shows built-in templates in resource center', async () => {
  const { app, userDataRoot } = await launchPackagedApp();

  try {
    const page = await app.firstWindow();
    await expect(page.locator('.welcome-screen')).toBeVisible();
    await page.getByTestId('welcome-open-resources').click();
    await expect(page.getByTestId('resource-center-page')).toBeVisible();
    await expect(page.locator('.resource-list-item', { hasText: '软件工厂' }).first()).toBeVisible();
    await expect(page.locator('.resource-list-item', { hasText: 'GStack Office Hours' }).first()).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});

test('packaged app idea map hides raw payloads and payload-only placeholder nodes', async () => {
  test.setTimeout(240_000);

  const { app, userDataRoot } = await launchPackagedApp();
  const projectBase = fs.mkdtempSync(resolve(os.tmpdir(), 'cyber-editor-packaged-idea-map-project-'));

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1560, height: 1040 });
    });

    await page.evaluate(async (rootPath) => {
      await window.api.createProject({
        name: 'packaged-idea-map-project',
        locationPath: rootPath,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });
    }, projectBase);
    await page.reload();
    await page.waitForTimeout(1000);

    const rootPath = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.project?.rootPath ?? null;
    });
    expect(rootPath).toBeTruthy();
    if (!rootPath) {
      throw new Error('project root path is missing');
    }

    const docPath = await page.evaluate(async (parentPath) => {
      return window.api.createFile(parentPath, 'idea.md');
    }, join(rootPath, '01-requirements'));

    await page.evaluate(async ({ docPath }) => {
      await window.api.saveDocument(docPath, '# 初始想法\n\n- 先梳理目标\n');
      await window.api.recordExternalDocumentChange(docPath, '# 初始想法\n', '# 初始想法\n\n- 先梳理目标\n');
      await window.api.saveSessions([
        {
          id: 'session-1',
          title: '初始需求会话',
          stage: 'discover',
          summary: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}',
          pinned: false,
          archived: false,
          projectDocumentPaths: [docPath],
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: '我想把模糊想法沉淀成结构化文档。',
              createdAt: '2026-04-17T08:00:00.000Z'
            },
            {
              id: 'm2',
              role: 'assistant',
              content: '请用一句话描述你想做的软件，它要解决什么问题。',
              createdAt: '2026-04-17T08:00:30.000Z'
            },
            {
              id: 'm3',
              role: 'assistant',
              content: '{"toolCalls":[{"capabilityId":"read_artifact","input":{"artifactType":"softwareRequirement","purpose":"A software for reading novels during work breaks"}}]}',
              createdAt: '2026-04-17T08:01:00.000Z'
            },
            {
              id: 'm4',
              role: 'assistant',
              content: '先补齐核心目标，再决定交付结构。',
              createdAt: '2026-04-17T08:01:30.000Z'
            },
            {
              id: 'm5',
              role: 'user',
              content: '浏览器插件这条路先放弃。',
              createdAt: '2026-04-17T08:02:00.000Z'
            }
          ]
        }
      ]);
      await window.api.refreshProject();
    }, { docPath });
    await page.reload();
    await page.waitForTimeout(800);

    await page.locator('.activity-bar .activity-button[title="思路地图"]').click();
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
    await expect(page.locator('.thinking-map-svg')).toBeVisible();
    await expect(page.locator('.thinking-map-edge')).not.toHaveCount(0);
    await expect(page.locator('.thinking-chain-node', { hasText: '结构化文档' }).first()).toBeVisible();
    await expect(page.locator('.thinking-chain-node', { hasText: '放弃' }).first()).toBeVisible();
    await expect(page.locator('.thinking-chain-node', { hasText: '文档：idea.md' })).toHaveCount(1);
    await expect(page.locator('.thinking-chain-page')).not.toContainText('toolCalls');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('read_artifact');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('capabilityId');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('引用已有证据');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('请用一句话描述你想做的软件');
    await expect(page.locator('.thinking-chain-node', { hasText: '待明确：核心目标' }).first()).toBeVisible();

    const shell = page.locator('.thinking-chain-canvas-shell');
    await expect(shell).toHaveAttribute('data-zoom', '1');
    await shell.hover();
    await page.mouse.wheel(0, -400);
    await expect(shell).not.toHaveAttribute('data-zoom', '1');

    const scrollBefore = await shell.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
    const box = await shell.boundingBox();
    if (!box) {
      throw new Error('packaged thinking chain canvas shell box missing');
    }
    const dragStartX = box.x + box.width - 120;
    const dragStartY = box.y + box.height - 120;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragStartX - 160, dragStartY - 60);
    await page.mouse.up();
    const scrollAfter = await shell.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
    expect(scrollAfter.left !== scrollBefore.left || scrollAfter.top !== scrollBefore.top).toBe(true);

    await page.getByRole('button', { name: '隐藏已废弃' }).click();
    await expect(page.locator('.thinking-chain-node', { hasText: '放弃' })).toHaveCount(0);
    await page.getByRole('button', { name: '显示已废弃' }).click();

    await page.locator('.thinking-chain-node', { hasText: '文档：idea.md' }).first().click();
    await expect(page.locator('.thinking-map-detail-floating')).toHaveCount(0);
    await expect(page.locator('.thinking-map-detail-pane')).toBeVisible();
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('当前选中节点');
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('决策理由与思路');
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('引用证据全文与上下文');
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
