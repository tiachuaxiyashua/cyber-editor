import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { openActivity } from './helpers/ui-compat';

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

async function mockOpenDialog(app: any, filePaths: string[]) {
  await app.evaluate(({ dialog }: any, nextPaths: string[]) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: nextPaths
    });
  }, filePaths);
}

async function setWindowBounds(app: any, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }: any, bounds: { width: number; height: number }) => {
    BrowserWindow.getAllWindows()[0].setBounds(bounds);
  }, { width, height });
}

async function navigateToActivityView(page: import('@playwright/test').Page, activityView: 'resources' | 'orchestration') {
  await openActivity(page, activityView, { settleMs: 250 });
  const target = activityView === 'resources'
    ? page.getByTestId('resource-center-page')
    : page.getByTestId('orchestration-workspace');
  await expect(target).toBeVisible({ timeout: 15_000 });
}

async function dragResizer(page: import('@playwright/test').Page, selector: string, deltaX: number, index = 0) {
  const handle = page.locator(selector).nth(index);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`missing resizer: ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function dragBetween(page: import('@playwright/test').Page, source: string, target: string) {
  const sourceBox = await page.locator(source).boundingBox();
  const targetBox = await page.locator(target).boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`missing drag endpoints: ${source} -> ${target}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
  await page.mouse.up();
}

async function dragOrchestrationPane(page: import('@playwright/test').Page, index: number, deltaX: number) {
  const handle = page.locator('.orchestration-pane-resizer').nth(index);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`missing orchestration pane resizer: ${index}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 14 });
  await page.mouse.up();
}

async function openResourceManager(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '资源管理' }).click();
}

async function switchToDesignWorkspace(page: import('@playwright/test').Page) {
  const designButton = page.locator('.orchestration-flow-head-actions [aria-label="工作区模式"] button').first();
  await expect(designButton).toHaveCount(1);
  await designButton.evaluate((button: HTMLButtonElement) => button.click());
  await page.waitForTimeout(180);
}

async function openSelectedNodeDeepConfig(page: import('@playwright/test').Page) {
  const nodeInspectorView = page.locator('.orchestration-side-main.flow-node-inspector-view').first();
  const inspector = page.locator('.flow-editor-side-modal [data-testid="orchestration-inspector"]');
  await expect(nodeInspectorView).toBeVisible();
  await nodeInspectorView.getByRole('button', { name: '打开深度配置' }).click();
  await expect(inspector).toBeVisible();
  return inspector;
}

test('critical editor workflows cover resize stability, local skill catalog install, and flow node editing', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-critical-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-critical-userdata-'));
  const skillCatalogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-skill-catalog-'));
  const outputDir = path.resolve(process.cwd(), 'artifacts', 'critical-editor-workflows');
  fs.mkdirSync(outputDir, { recursive: true });

  const localSkillRoot = path.join(skillCatalogRoot, 'local-checker');
  fs.mkdirSync(localSkillRoot, { recursive: true });
  fs.writeFileSync(
    path.join(localSkillRoot, 'manifest.json'),
    JSON.stringify(
      {
        id: 'local-checker',
        name: '本地检查器',
        version: '1.0.0',
        description: '用于验证本地目录安装链路',
        applicableStages: ['discover', 'plan']
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(path.join(localSkillRoot, 'SKILL.md'), '# 本地检查器\n\n- 用于验证本地目录安装。\n', 'utf8');

  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(__dirname, '../..'),
    env: buildElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1560, 1080);
    await page.waitForTimeout(900);

    await page.evaluate(async (rootPath) => {
      await window.api.createProject({
        name: 'critical-editor',
        locationPath: rootPath,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory'
      });
    }, projectRoot);
    await page.reload();
    await page.waitForTimeout(1100);

    const leftSidebar = page.locator('.primary-sidebar');
    const rightSidebar = page.locator('.context-pane');
    const centerPane = page.locator('.document-pane');

    const initialLeftWidth = (await leftSidebar.boundingBox())?.width ?? 0;
    const initialRightWidth = (await rightSidebar.boundingBox())?.width ?? 0;

    await dragResizer(page, '.resizer', -140, 0);
    await page.waitForTimeout(180);
    await dragResizer(page, '.resizer', -120, 1);
    await page.waitForTimeout(180);

    const compactLeftWidth = (await leftSidebar.boundingBox())?.width ?? 0;
    const compactRightWidth = (await rightSidebar.boundingBox())?.width ?? 0;
    const compactCenterWidth = (await centerPane.boundingBox())?.width ?? 0;
    expect(compactLeftWidth).toBeLessThan(initialLeftWidth);
    expect(compactRightWidth).toBeGreaterThan(280);
    expect(compactCenterWidth).toBeGreaterThan(260);
    await page.screenshot({ path: path.join(outputDir, '01-resize-stability.png') });

    await navigateToActivityView(page, 'resources');
    await page.getByTestId('resource-kind-skill').click();
    await mockOpenDialog(app, [localSkillRoot]);
    await page.getByRole('button', { name: '导入资源' }).click();
    await expect(page.locator('.resource-list-item', { hasText: '本地检查器' }).first()).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, '02-local-skill-install.png') });

    await navigateToActivityView(page, 'orchestration');
    await expect(page.locator('.orchestration-workspace')).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator('.react-flow__node-start')).toBeVisible();
    await expect(page.locator('.react-flow__node-end')).toBeVisible();
    const initialEdgeCount = await page.locator('.react-flow__edge').count();
    await expect(page.locator('[data-testid="orchestration-assets"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="orchestration-inspector"]')).toHaveCount(0);

    await page.getByRole('button', { name: '添加卡片' }).click();
    await page.locator('.canvas-add-card-menu button', { hasText: '循环' }).click();
    await page.waitForTimeout(220);
    await expect(page.locator('.react-flow__node-loop').last()).toBeVisible();

    const loopNode = page.locator('.react-flow__node-loop').last();
    const inspector = await openSelectedNodeDeepConfig(page);
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });
    await expect(page.locator('.flow-editor-side-modal')).toHaveCount(0);
    const loopNodeBefore = await loopNode.boundingBox();
    if (!loopNodeBefore) throw new Error('loop node missing before drag');
    await page.mouse.move(loopNodeBefore.x + loopNodeBefore.width / 2, loopNodeBefore.y + 40);
    await page.mouse.down();
    await page.mouse.move(loopNodeBefore.x + loopNodeBefore.width / 2 + 220, loopNodeBefore.y + 180, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(180);
    const loopNodeAfter = await loopNode.boundingBox();
    const loopNodeTransformBeforeAssetModal = await loopNode.evaluate((node) => node.getAttribute('style'));
    expect(loopNodeAfter).not.toBeNull();
    expect(Math.abs((loopNodeAfter?.x ?? 0) - loopNodeBefore.x)).toBeGreaterThan(60);
    await loopNode.click();
    await openSelectedNodeDeepConfig(page);
    await inspector.getByRole('button', { name: '运行语义' }).click();
    await inspector.getByLabel('循环条件').fill('当订单未完成时继续循环');
    await inspector.getByLabel('退出条件').fill('当状态变为已完成时退出');
    await inspector.getByLabel('最大轮次').fill('5');
    await inspector.getByLabel('回边目标').selectOption({ index: 1 });
    await inspector.getByLabel('退出目标').selectOption({ index: 2 });
    await page.waitForTimeout(250);

    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });
    await expect(page.locator('.flow-editor-side-modal')).toHaveCount(0);

    const modulePanel = page.locator('.flow-module-panel');
    await expect(modulePanel).toBeVisible();
    await expect(modulePanel.getByRole('button', { name: '导入子流程' })).toBeVisible();
    await expect(modulePanel.getByRole('button', { name: '导出子流程' })).toBeDisabled();
    await modulePanel.locator('#flow-module-search-input').fill('人工确认');
    await expect(modulePanel.locator('.flow-module-tile', { hasText: '人工确认' }).first()).toBeVisible();
    await expect(modulePanel.locator('.flow-module-tile', { hasText: '角色节点' })).toHaveCount(0);
    await modulePanel.locator('#flow-module-search-input').fill('');
    await openResourceManager(page);
    const assetManager = page.locator('.flow-editor-modal').filter({ has: page.locator('[data-testid="orchestration-assets"]') });
    await expect(assetManager).toBeVisible();
    await assetManager.locator('[data-testid="orchestration-assets"] button[aria-label="角色"]').click();
    await page.waitForTimeout(160);
    await assetManager.locator('[data-testid="orchestration-assets"] button[aria-label="流程"]').click();
    await page.waitForTimeout(160);
    const loopNodeTransformAfterAssetModal = await loopNode.evaluate((node) => node.getAttribute('style'));
    expect(loopNodeTransformAfterAssetModal).toBe(loopNodeTransformBeforeAssetModal);
    await assetManager.getByRole('button', { name: '关闭' }).click();

    const loopSummary = loopNode.locator('.flow-node-summary');
    await expect(loopSummary).toContainText('循环');

    await loopNode.click({ button: 'right' });
    await expect(page.locator('.canvas-context-menu')).toBeVisible();
    await page.screenshot({ path: path.join(outputDir, '03-node-context-menu.png') });
    await page.locator('.canvas-context-menu button', { hasText: '复制节点' }).click();
    await expect(page.locator('.react-flow__node-loop')).toHaveCount(2);
    await page.getByRole('button', { name: '当前选择菜单' }).click();
    await expect(page.locator('.canvas-context-menu')).toBeVisible();
    await page.locator('.canvas-context-menu button', { hasText: '删除节点' }).click();
    await expect(page.locator('.react-flow__node-loop')).toHaveCount(1);

    await dragBetween(
      page,
      '.react-flow__node-loop:last-child .react-flow__handle[data-handleid="loop"]',
      '.react-flow__node-end .react-flow__handle'
    );
    await page.waitForTimeout(250);

    const edgeCount = await page.locator('.react-flow__edge').count();
    expect(edgeCount).toBeGreaterThan(initialEdgeCount);

    await page.getByRole('button', { name: '添加卡片' }).click();
    await page.locator('.canvas-add-card-menu button', { hasText: '智能角色' }).click();
    await page.waitForTimeout(200);
    const agentNode = page.locator('.react-flow__node-agent').last();
    await expect(agentNode).toBeVisible();
    const agentInspector = await openSelectedNodeDeepConfig(page);
    await agentInspector.getByRole('button', { name: '绑定' }).click();
    await agentInspector.getByRole('button', { name: '创建新角色' }).click();
    await expect(page.locator('.role-creator-grid')).toBeVisible();
    await page.getByLabel('名称').fill('架构评审员');
    await page.getByLabel('专注领域').fill('技术方案评审');
    await page.getByLabel('IDENTITY').fill('负责评审流程结构与角色绑定。');
    await page.getByLabel('AGENTS').fill('先核对上下文，再给出明确结论。');
    await page.getByLabel('SOUL').fill('直接、克制。');
    await page.getByLabel('USER').fill('面向需要把复杂流程收敛成可执行方案的用户。');
    await page.getByRole('button', { name: '保存并绑定' }).click();
    await expect(agentNode).toContainText('架构评审员');
    await expect(page.locator('.flow-editor-side-modal')).toHaveCount(0);

    await openResourceManager(page);
    const flowAssetManager = page.locator('.flow-editor-modal').filter({ has: page.locator('[data-testid="orchestration-assets"]') });
    await expect(flowAssetManager).toBeVisible();
    await flowAssetManager.locator('[data-testid="orchestration-assets"] button[aria-label="子流程"]').click();
    await flowAssetManager.getByRole('button', { name: '新建流程' }).click();
    await page.waitForTimeout(240);
    await flowAssetManager.locator('[data-testid="orchestration-assets"] button[aria-label="主流程"]').click();
    await flowAssetManager.locator('.asset-list-main', { hasText: '主流程' }).first().click();
    await flowAssetManager.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '添加卡片' }).click();
    await page.locator('.canvas-add-card-menu button', { hasText: '子流程' }).click();
    await page.waitForTimeout(200);
    const subflowNode = page.locator('.react-flow__node-subflow').last();
    const subflowInspector = await openSelectedNodeDeepConfig(page);
    await subflowInspector.getByRole('button', { name: '绑定' }).click();
    await subflowInspector.getByLabel('子流程绑定').selectOption({ index: 1 });
    await subflowInspector.getByRole('button', { name: '进入子流程编辑' }).click();
    const returnToParent = page.locator('.flow-breadcrumb-back');
    await expect(returnToParent).toBeVisible();
    await returnToParent.click();
    await expect(page.locator('.flow-breadcrumb-back')).toHaveCount(0);

    await page.getByRole('button', { name: '保存当前流程' }).click();
    await page.getByRole('button', { name: '运行与历史' }).click();
    await page.locator('.flow-editor-modal').getByRole('button', { name: '历史', exact: true }).click();
    await expect(page.locator('.flow-history-item').first()).toBeVisible();
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });
    await switchToDesignWorkspace(page);
    await page.screenshot({ path: path.join(outputDir, '04-flow-editor-loop.png') });

    await setWindowBounds(app, 860, 760);
    await page.waitForTimeout(400);
    await expect(page.locator('.orchestration-layout-shell.compact')).toBeVisible();
    await expect(page.locator('[data-testid="orchestration-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="orchestration-assets"]')).toHaveCount(0);
    await openResourceManager(page);
    await expect(page.locator('.flow-editor-modal [data-testid="orchestration-assets"]')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
    await page.screenshot({ path: path.join(outputDir, '05-orchestration-compact.png') });
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    fs.rmSync(skillCatalogRoot, { recursive: true, force: true });
  }
});
