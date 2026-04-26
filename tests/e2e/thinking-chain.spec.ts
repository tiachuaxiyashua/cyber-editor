import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { openActivity } from './helpers/ui-compat';
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
  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  return env;
}

test('opens the idea map page, keeps it display-only, supports resizing, and preserves stable zoom viewport behavior', async () => {
  test.setTimeout(240_000);

  const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-thinking-chain-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-thinking-chain-userdata-'));
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1560, height: 1040 });
    });

    await createProjectAndHydrate(page, {
      name: 'thinking-chain-project',
      locationPath: projectBase,
      templateId: 'software-factory'
    });

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
    }, path.join(rootPath, '01-requirements'));

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
              role: 'user',
              content: '核心想法：我想把模糊想法沉淀成结构化文档。',
              createdAt: '2026-04-17T08:01:30.000Z'
            },
            {
              id: 'm5',
              role: 'assistant',
              content: '目标用户：需要把模糊想法快速收敛成可交付方案的用户。',
              createdAt: '2026-04-17T08:01:40.000Z'
            },
            {
              id: 'm6',
              role: 'assistant',
              content: '风险约束：结构要清晰、导出要稳定、不能依赖复杂操作。',
              createdAt: '2026-04-17T08:01:50.000Z'
            },
            {
              id: 'm7',
              role: 'assistant',
              content: '工作壳：主界面保持文档工作台外观，同时满足目标用户和风险约束。',
              createdAt: '2026-04-17T08:02:00.000Z'
            },
            {
              id: 'm8',
              role: 'user',
              content: '浏览器插件这条路先放弃。',
              createdAt: '2026-04-17T08:02:10.000Z'
            }
          ]
        }
      ]);
    }, { docPath });
    await refreshProjectAndHydrate(page);

    await openActivity(page, 'thinkingChain');
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
    await expect(page.locator('.thinking-map-svg')).toBeVisible();
    await expect(page.locator('.thinking-map-stage-header')).toHaveCount(0);
    await expect(page.locator('.context-pane')).toHaveCount(0);
    await expect(page.locator('.thinking-map-detail-resizer')).toBeVisible();
    await expect(page.locator('.thinking-map-edge')).not.toHaveCount(0);
    await expect(page.locator('.thinking-chain-page')).not.toContainText('toolCalls');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('read_artifact');
    await expect(page.locator('.thinking-chain-page')).not.toContainText('capabilityId');

    const shell = page.locator('.thinking-chain-canvas-shell');
    const viewport = page.locator('.thinking-chain-canvas-viewport');
    await expect(shell).toHaveAttribute('data-zoom', '1');
    const backgroundImage = await shell.evaluate((node) => window.getComputedStyle(node).backgroundImage);
    expect(backgroundImage.includes('radial-gradient')).toBe(false);
    expect(backgroundImage.includes('linear-gradient(180deg')).toBe(false);
    const viewportWidthBeforeZoom = await viewport.evaluate((node) => node.clientWidth);

    const activeNode = page.locator('.thinking-chain-node').first();
    const sizeAtOne = await activeNode.boundingBox();
    await shell.hover();
    await page.mouse.wheel(0, -400);
    await expect(shell).not.toHaveAttribute('data-zoom', '1');
    const viewportWidthAfterFirstZoom = await viewport.evaluate((node) => node.clientWidth);
    expect(Math.abs(viewportWidthAfterFirstZoom - viewportWidthBeforeZoom)).toBeLessThanOrEqual(2);

    for (let index = 0; index < 12; index += 1) {
      await page.mouse.wheel(0, -600);
    }
    await expect(shell).toHaveAttribute('data-zoom', '2.4');

    const scrollAtClampBefore = await shell.evaluate((node) => {
      node.scrollLeft = 240;
      node.scrollTop = 180;
      return { left: node.scrollLeft, top: node.scrollTop };
    });
    await page.mouse.wheel(0, -800);
    const scrollAtClampAfter = await shell.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
    expect(scrollAtClampAfter).toEqual(scrollAtClampBefore);

    for (let index = 0; index < 24; index += 1) {
      await page.mouse.wheel(0, 600);
    }
    await expect(shell).toHaveAttribute('data-zoom', '0.35');
    const sizeAtMin = await activeNode.boundingBox();
    expect(sizeAtOne).toBeTruthy();
    expect(sizeAtMin).toBeTruthy();
    const ratioAtOne = sizeAtOne ? sizeAtOne.width / sizeAtOne.height : 0;
    const ratioAtMin = sizeAtMin ? sizeAtMin.width / sizeAtMin.height : 0;
    expect(Math.abs(ratioAtOne - ratioAtMin)).toBeLessThan(0.2);

    await page.getByRole('button', { name: '重新布局' }).click();
    await expect(shell).toHaveAttribute('data-zoom', '1');

    const shellNode = page.locator('.thinking-chain-node', { hasText: '工作壳' }).first();
    const shellSemanticKey = await shellNode.getAttribute('data-node-semantic-key');
    expect(shellSemanticKey).toBeTruthy();
    const beforeDrag = await shellNode.boundingBox();
    expect(beforeDrag).toBeTruthy();
    if (!beforeDrag) {
      throw new Error('working shell node bounding box missing');
    }
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2 + 140, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const afterDrag = await shellNode.boundingBox();
    expect(afterDrag).toBeTruthy();

    await expect.poll(async () => {
      const snapshotAfterDrag = await page.evaluate(async () => window.api.getThinkingChain('session-1'));
      const draggedShellNode = snapshotAfterDrag?.nodes.find((node) => node.semanticKey === shellSemanticKey);
      return draggedShellNode?.manualPosition?.y ?? 0;
    }, { timeout: 10_000 }).toBeGreaterThan(0);

    await page.locator('.thinking-chain-node', { hasText: '文档：idea.md' }).first().click();
    const detailPane = page.locator('.thinking-map-detail-pane');
    await expect(page.locator('.thinking-map-detail-floating')).toHaveCount(0);
    await expect(detailPane).toBeVisible();
    const detailWidthBefore = await detailPane.evaluate((node) => node.getBoundingClientRect().width);
    const detailResizer = page.locator('.thinking-map-detail-resizer');
    const resizerBox = await detailResizer.boundingBox();
    expect(resizerBox).toBeTruthy();
    if (!resizerBox) {
      throw new Error('thinking map detail resizer missing');
    }
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x - 120, resizerBox.y + resizerBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const detailWidthAfter = await detailPane.evaluate((node) => node.getBoundingClientRect().width);
    expect(detailWidthAfter - detailWidthBefore).toBeGreaterThan(80);

    await page.locator('.thinking-map-detail-pane').getByRole('button', { name: '打开来源' }).first().click();
    await expect(page.locator('.document-tab.active .document-tab-main')).toContainText('idea.md');
  } finally {
    await app.close();
    fs.rmSync(projectBase, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
