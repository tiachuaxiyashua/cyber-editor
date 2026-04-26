import fs, { existsSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test.skip(process.platform !== 'win32', '当前仅验证 Windows 打包产物。');
test.skip(process.env.CYBER_EDITOR_RUN_PACKAGED_SMOKE !== '1', '该用例只在打包态验证脚本下运行。');

const executablePath = resolve(
  process.cwd(),
  'out',
  'package',
  'Cyber Editor-win32-x64',
  'Cyber Editor.exe'
);
const packagedManualProjectsRoot = resolve(
  process.cwd(),
  'out',
  'manual-projects'
);
const packagedComplexProjectRoot = resolve(packagedManualProjectsRoot, 'complex-idea-map-project');

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
  const userDataRoot = fs.mkdtempSync(resolve(os.tmpdir(), 'cyber-editor-packaged-complex-'));
  const app = await electron.launch({
    executablePath,
    env: buildElectronEnv(userDataRoot)
  });
  return { app, userDataRoot };
}

test('packaged app renders a layered idea map for a complex project and captures screenshots', async () => {
  test.setTimeout(300_000);

  const { app, userDataRoot } = await launchPackagedApp();
  const screenshotDir = resolve(process.cwd(), 'artifacts', 'manual-checks');
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(packagedManualProjectsRoot, { recursive: true });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1820, height: 1180 });
    });

    await page.evaluate(async ({ projectRoot, projectParent }) => {
      try {
        const exists = await window.api.openProject(projectRoot);
        if (exists?.project) {
          return;
        }
      } catch {
        // ignore invalid/non-project path on first run and create the project below
      }
      await window.api.createProject({
        name: 'complex-idea-map-project',
        locationPath: projectParent,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });
    }, { projectRoot: packagedComplexProjectRoot, projectParent: packagedManualProjectsRoot });
    await page.waitForTimeout(1200);

    const rootPath = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      return bootstrap.project?.rootPath ?? null;
    });
    expect(rootPath).toBeTruthy();
    if (!rootPath) {
      throw new Error('project root path is missing');
    }

    const requirementDir = join(rootPath, '01-requirements');
    const requirementDoc = join(requirementDir, '01-原始需求.md');
    const itineraryDoc = join(requirementDir, '02-行程骨架.md');
    const budgetDoc = join(requirementDir, '03-预算策略.md');
    const visaDoc = join(requirementDir, '04-签证清单.md');

    if (!existsSync(itineraryDoc)) {
      await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '02-行程骨架.md'), requirementDir);
    }
    if (!existsSync(budgetDoc)) {
      await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '03-预算策略.md'), requirementDir);
    }
    if (!existsSync(visaDoc)) {
      await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '04-签证清单.md'), requirementDir);
    }

    await page.evaluate(async ({ requirementDoc, itineraryDoc, budgetDoc, visaDoc }) => {
      await window.api.saveDocument(requirementDoc, '# 原始需求\n\n- 核心目标：做一个欧洲旅行策划工作台\n');
      await window.api.saveDocument(itineraryDoc, '# 行程骨架\n\n- 国家筛选\n- 城市选择\n- 每日路线\n');
      await window.api.saveDocument(budgetDoc, '# 预算策略\n\n- 先锁定机酒上限\n- 再拆每日预算\n');
      await window.api.saveDocument(visaDoc, '# 签证清单\n\n- 材料列表\n- 递交节点\n');

      await window.api.recordExternalDocumentChange(requirementDoc, '# 原始需求\n', '# 原始需求\n\n- 核心目标：做一个欧洲旅行策划工作台\n');
      await window.api.recordExternalDocumentChange(itineraryDoc, '# 行程骨架\n', '# 行程骨架\n\n- 国家筛选\n- 城市选择\n- 每日路线\n');
      await window.api.recordExternalDocumentChange(budgetDoc, '# 预算策略\n', '# 预算策略\n\n- 先锁定机酒上限\n- 再拆每日预算\n');
      await window.api.recordExternalDocumentChange(visaDoc, '# 签证清单\n', '# 签证清单\n\n- 材料列表\n- 递交节点\n');

      await window.api.saveSessions([
        {
          id: 'session-complex',
          title: '欧洲旅行策划',
          stage: 'discover',
          summary: '围绕欧洲旅行策划工作台逐步收敛为结构化文档与规划流程。',
          pinned: false,
          archived: false,
          projectDocumentPaths: [requirementDoc, itineraryDoc, budgetDoc, visaDoc],
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: '核心想法：做一个欧洲旅行策划工作台。',
              createdAt: '2026-04-18T11:00:00.000Z'
            },
            {
              id: 'm2',
              role: 'assistant',
              content: '目标用户：第一次自由行的用户，需要从模糊目的地想法快速收敛出完整计划。',
              createdAt: '2026-04-18T11:00:10.000Z'
            },
            {
              id: 'm3',
              role: 'assistant',
              content: '风险约束：预算必须可控、计划需要离线可读、切换阶段不能太慢。',
              createdAt: '2026-04-18T11:00:20.000Z'
            },
            {
              id: 'm4',
              role: 'assistant',
              content: '行程骨架：先确定国家与天数，再做城市排序和每日路线。',
              createdAt: '2026-04-18T11:00:30.000Z'
            },
            {
              id: 'm5',
              role: 'assistant',
              content: '预算策略：先锁定机酒上限，再分配每日预算，这样能满足风险约束。',
              createdAt: '2026-04-18T11:00:40.000Z'
            },
            {
              id: 'm6',
              role: 'assistant',
              content: '工作壳：以编辑器/规划工作台为外壳，同时承接目标用户、预算约束和行程骨架。',
              createdAt: '2026-04-18T11:00:50.000Z'
            },
            {
              id: 'm7',
              role: 'assistant',
              content: '探索方向：是否支持多人协同分工制定每日路线。',
              createdAt: '2026-04-18T11:01:00.000Z'
            },
            {
              id: 'm8',
              role: 'assistant',
              content: '探索方向：是否允许自动生成签证材料准备清单。',
              createdAt: '2026-04-18T11:01:10.000Z'
            },
            {
              id: 'm9',
              role: 'user',
              content: '废弃方向：直接做纯聊天机器人界面。',
              createdAt: '2026-04-18T11:01:20.000Z'
            }
          ]
        }
      ]);
      await window.api.refreshProject();
    }, { requirementDoc, itineraryDoc, budgetDoc, visaDoc });

    await page.waitForTimeout(1200);

    await page.locator('.activity-bar .activity-button[title="思路地图"]').click();
    await expect(page.getByTestId('thinking-chain-page')).toBeVisible();
    await page.getByRole('button', { name: /重新布局|Fit View/ }).click();
    await expect(page.locator('.thinking-chain-canvas-shell')).toHaveAttribute('data-zoom', '1');
    await expect(page.locator('.thinking-map-stage-header')).toHaveCount(0);
    await expect(page.locator('.context-pane')).toHaveCount(0);

    const nodeLocator = page.locator('.thinking-chain-node');
    expect(await nodeLocator.count()).toBeGreaterThanOrEqual(9);
    await expect(page.locator('.thinking-map-edge')).not.toHaveCount(0);
    await expect(page.locator('.thinking-chain-node', { hasText: '文档：01-原始需求.md' })).toHaveCount(1);
    await expect(page.locator('.thinking-chain-node', { hasText: '文档：02-行程骨架.md' })).toHaveCount(1);
    await expect(page.locator('.thinking-chain-node', { hasText: '文档：03-预算策略.md' })).toHaveCount(1);

    const nodePositions = await page.locator('.thinking-chain-node').evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent ?? '',
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        };
      })
    );
    const uniqueColumns = [...new Set(nodePositions.map((item) => Math.round(item.left / 160)))];
    expect(uniqueColumns.length).toBeGreaterThanOrEqual(6);

    const snapshot = await page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
    const budgetNode = snapshot?.nodes.find((node) => node.stage !== 'materialized' && node.title.includes('预算策略'));
    const budgetDocNode = snapshot?.nodes.find((node) => node.artifactPath?.includes('03-预算策略.md'));
    const budgetDocInbound = snapshot?.edges.filter((edge) => edge.targetId === budgetDocNode?.id && edge.kind === 'materializes') ?? [];
    expect(budgetNode).toBeTruthy();
    expect(budgetDocNode).toBeTruthy();
    expect(budgetDocInbound.some((edge) => edge.sourceId === budgetNode?.id)).toBe(true);

    const shellNode = page.locator('.thinking-chain-node', { hasText: '工作壳' }).first();
    const shellSemanticKey = await shellNode.getAttribute('data-node-semantic-key');
    expect(shellSemanticKey).toBeTruthy();
    const shellBeforeDrag = await shellNode.boundingBox();
    expect(shellBeforeDrag).toBeTruthy();
    if (!shellBeforeDrag) {
      throw new Error('working shell node bounding box missing');
    }
    await page.mouse.move(shellBeforeDrag.x + shellBeforeDrag.width / 2, shellBeforeDrag.y + shellBeforeDrag.height / 2);
    await page.mouse.down();
    await page.mouse.move(shellBeforeDrag.x + shellBeforeDrag.width / 2, shellBeforeDrag.y + shellBeforeDrag.height / 2 + 180, { steps: 16 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const shellAfterDrag = await shellNode.boundingBox();
    expect(shellAfterDrag).toBeTruthy();
    expect(Math.abs((shellAfterDrag?.y ?? 0) - shellBeforeDrag.y)).toBeGreaterThan(80);
    await expect.poll(async () => {
      const snapshotAfterDrag = await page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
      const draggedShellNode = snapshotAfterDrag?.nodes.find((node) => node.semanticKey === shellSemanticKey);
      return draggedShellNode?.manualPosition?.y ?? 0;
    }, { timeout: 10_000 }).toBeGreaterThan(0);

    await page.locator('.thinking-chain-node', { hasText: '工作壳' }).first().click();
    await expect(page.locator('.thinking-map-detail-floating')).toHaveCount(0);
    await expect(page.locator('.thinking-map-detail-pane')).toBeVisible();
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('标签与关系');
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('展开理由与说明');
    await expect(page.locator('.thinking-map-detail-pane')).toContainText('证据来源');

    await page.screenshot({
      path: resolve(screenshotDir, 'idea-map-packaged-complex-overview.png'),
      fullPage: true
    });

    await page.locator('.thinking-map-foldout').getByText('展开理由与说明').click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: resolve(screenshotDir, 'idea-map-packaged-complex-detail.png'),
      fullPage: true
    });

    await page.reload();
    await page.waitForTimeout(1000);
    await page.locator('.activity-bar .activity-button[title="思路地图"]').click();
    await page.getByRole('button', { name: /重新布局|Fit View/ }).click();
    await expect(page.locator('.thinking-chain-canvas-shell')).toHaveAttribute('data-zoom', '1');
    const shellAfterReloadNode = page.locator(`.thinking-chain-node[data-node-semantic-key="${shellSemanticKey}"]`).first();
    const shellAfterReload = await shellAfterReloadNode.boundingBox();
    expect(shellAfterReload).toBeTruthy();
    expect(Math.abs((shellAfterReload?.y ?? 0) - (shellAfterDrag?.y ?? 0))).toBeLessThan(30);
    const snapshotAfterReload = await page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
    const reopenedShellNode = snapshotAfterReload?.nodes.find((node) => node.semanticKey === shellSemanticKey);
    expect(reopenedShellNode?.manualPosition?.y ?? 0).toBeGreaterThan(0);
    await page.screenshot({
      path: resolve(screenshotDir, 'idea-map-packaged-complex-reopen.png'),
      fullPage: true
    });
  } finally {
    await app.close();
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
