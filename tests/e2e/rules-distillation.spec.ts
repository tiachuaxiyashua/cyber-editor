import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createProjectAndHydrate } from './helpers/project-fixtures';
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

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  await createProjectAndHydrate(page, {
    name: 'rules-project',
    locationPath: rootPath,
    templateId: 'software-factory'
  });
}

test('rules center, knowledge graph navigation, promotion drafts, and node rule binding remain usable end-to-end', async () => {
  test.setTimeout(240_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-rules-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-rules-userdata-'));
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
    await page.waitForTimeout(500);
    await createProject(page, projectRoot);

    const seed = await page.evaluate(async () => {
      await window.api.saveRule({
        name: 'Global concise rule',
        body: 'Keep the output concise.',
        scope: 'global',
        targetKey: 'writing-style',
        category: 'style'
      });
      await window.api.saveRule({
        name: 'Project numbered rule',
        body: 'Always use numbered headings.',
        scope: 'project',
        targetKey: 'writing-style',
        category: 'structure'
      });
      await window.api.saveRule({
        name: 'Project bullet rule',
        body: 'Always use bullet headings.',
        scope: 'project',
        targetKey: 'writing-style',
        category: 'structure'
      });
      await window.api.saveRule({
        name: 'Bound review rule',
        body: 'Include a final checklist paragraph.',
        scope: 'project',
        targetKey: 'review-shape',
        category: 'quality',
        appliesTo: 'bound-only'
      });

      const bootstrap = await window.api.bootstrapLoad();
      const baseFlow = bootstrap.platform?.flows?.[0];
      if (!baseFlow) {
        throw new Error('Expected at least one platform flow in bootstrap data.');
      }

      await window.api.saveFlow({
        ...baseFlow,
        id: 'focus-flow',
        name: 'Focused Flow',
        description: 'Flow created for graph jump verification.',
        updatedAt: new Date().toISOString()
      });

      const graphDocumentPath = await window.api.createFile(bootstrap.project!.rootPath, 'graph-brief.md');
      await window.api.saveDocument(graphDocumentPath, '# Graph Brief\n\nThis file is referenced by a distillation entry.\n');
      await window.api.saveAccumulationEntry({
        title: 'Graph entry',
        summary: 'Distillation linked to a concrete markdown file.',
        details: 'Used by the rules knowledge graph e2e to verify document jumps.',
        category: 'quality',
        source: 'runtime',
        sourceDocumentPaths: [graphDocumentPath]
      });

      return {
        baseFlowName: baseFlow.name,
        graphDocumentName: graphDocumentPath.replace(/\\/g, '/').split('/').pop() ?? 'graph-brief.md'
      };
    });

    await page.reload();

    await openActivity(page, 'rules');
    const rulesWorkspace = page.getByTestId('rules-workspace');
    const graphPanel = page.getByTestId('knowledge-graph-panel');
    const graphSearchInput = graphPanel.getByLabel('搜索对象');
    const objectDetail = graphPanel.locator('.rules-graph-detail .list-card').first();
    const pathList = graphPanel.getByTestId('knowledge-graph-path');

    await expect(rulesWorkspace).toBeVisible();
    await expect(
      rulesWorkspace.locator('.asset-list-item strong').filter({ hasText: 'Global concise rule' }).first()
    ).toBeVisible();
    await expect(graphPanel).toBeVisible();

    await graphSearchInput.fill(seed.baseFlowName);
    await graphPanel.locator('.rules-graph-node strong', { hasText: seed.baseFlowName }).first().click();
    await objectDetail.getByRole('button', { name: '设为起点' }).click();

    await graphSearchInput.fill('03-openspec');
    await graphPanel.locator('.rules-graph-node strong', { hasText: '03-openspec' }).first().click();
    await objectDetail.getByRole('button', { name: '设为终点' }).click();
    await expect(pathList).toContainText('03-openspec');

    await graphSearchInput.fill('Focused Flow');
    await graphPanel.locator('.rules-graph-node strong', { hasText: 'Focused Flow' }).first().click();
    await objectDetail.getByRole('button', { name: '打开对象' }).click();
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    await expect(page.getByTestId('orchestration-workspace')).toContainText('Focused Flow');

    await openActivity(page, 'rules');
    await expect(rulesWorkspace).toBeVisible();
    await graphSearchInput.fill(seed.graphDocumentName);
    await graphPanel.locator('.rules-graph-node strong', { hasText: seed.graphDocumentName }).first().click();
    await objectDetail.getByRole('button', { name: '打开对象' }).click();
    await expect(page.locator('.document-tab.active .document-tab-main')).toContainText(seed.graphDocumentName);

    await openActivity(page, 'rules');
    await rulesWorkspace.getByLabel('标题').fill('评审沉淀');
    await rulesWorkspace.getByLabel('摘要').fill('评审输出需要行动项。');
    await rulesWorkspace.getByLabel('详细内容').fill('每次评审报告末尾都应补充行动项列表。');
    await rulesWorkspace.getByRole('button', { name: '保存沉淀条目' }).click();
    const savedAccumulationCard = rulesWorkspace
      .locator('.asset-list-item')
      .filter({ hasText: '评审沉淀' })
      .filter({ hasText: '升为Skill' })
      .first();
    await expect(savedAccumulationCard).toBeVisible();

    await savedAccumulationCard.getByRole('button', { name: '升为规则' }).dispatchEvent('click');
    const promotedRuleDraft = rulesWorkspace
      .locator('.asset-list-item')
      .filter({ hasText: '评审沉淀 规则' })
      .first();
    await expect(promotedRuleDraft).toBeVisible();
    await promotedRuleDraft.getByRole('button', { name: '接受草案' }).dispatchEvent('click');
    await rulesWorkspace.getByRole('button', { name: '工程规则' }).click();
    await expect(
      rulesWorkspace.locator('.asset-list-item strong').filter({ hasText: '评审沉淀 规则' }).first()
    ).toBeVisible();

    await savedAccumulationCard.getByRole('button', { name: '升为Skill' }).dispatchEvent('click');
    const promotedSkillDraft = rulesWorkspace
      .locator('.asset-list-item')
      .filter({ hasText: '评审沉淀 Skill' })
      .first();
    await expect(promotedSkillDraft).toBeVisible();
    await promotedSkillDraft.getByRole('button', { name: '接受草案' }).dispatchEvent('click');
    await expect(promotedSkillDraft).toContainText('Skill:');

    await openActivity(page, 'resources');
    const resourceCenter = page.getByTestId('resource-center-page');
    await expect(resourceCenter).toBeVisible();
    await resourceCenter.locator('.segmented.compact').getByRole('button', { name: 'Skill', exact: true }).click();
    await expect(resourceCenter.getByText('评审沉淀 Skill').first()).toBeVisible();

    await openActivity(page, 'orchestration');
    const orchestrationWorkspace = page.getByTestId('orchestration-workspace');
    await expect(orchestrationWorkspace).toBeVisible();
    await page.getByRole('button', { name: '添加卡片' }).click();
    await page.locator('.canvas-add-card-menu button', { hasText: '智能角色' }).click();

    const inspector = page.locator('.flow-editor-side-modal [data-testid="orchestration-inspector"]').first();
    await expect(page.locator('.flow-node-inspector-view')).toBeVisible();
    await page.getByRole('button', { name: '打开深度配置' }).click();
    await expect(inspector).toBeVisible();
    await inspector.getByRole('button', { name: '绑定' }).click();
    await expect(inspector.getByText('规则绑定与冲突')).toBeVisible();
    await inspector.getByRole('button', { name: 'Bound review rule' }).click();
    await expect(inspector.getByRole('button', { name: 'Bound review rule' })).toBeVisible();
    await expect(inspector.getByText('Multiple project-scoped rules compete for writing-style.')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
