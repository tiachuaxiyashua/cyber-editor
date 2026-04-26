import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import type { PlatformFlowAsset } from '../../src/shared/types.js';
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

function seedRequirementMarkdown(note: string) {
  return [
    '# 原始需求',
    '',
    '## 目标用户',
    '- 内容团队负责人，需要把模糊想法快速沉淀为结构化文档、流程说明和最终交付材料。',
    '- 一线执行者，需要在最短时间内理解当前目标、约束、输入来源、依赖关系和交付边界。',
    '- 运行时操作者，需要让 rerun、artifact governance、阶段确认和导出阻塞都拿到稳定输入。',
    '- 审查人员，需要根据同一份上游需求基线判断方案是否偏题、是否缺项以及是否存在明显风险。',
    '',
    '## 核心问题',
    '- 当前需求描述通常来自零散对话、即时想法和口头描述，缺少统一结构，容易遗漏约束。',
    '- 上游文档变化后，影响范围不透明，用户不知道哪些阶段、节点和产物需要重新确认。',
    '- 缺少稳定需求基线会导致 rerun、review、delivery export 的结果不可靠，甚至产生错误结论。',
    '- 如果文档只剩一句摘要，后续测试和治理只能覆盖 happy path，无法覆盖真实失败路径。',
    '',
    '## 核心价值',
    '- 形成可供后续方案、测试、编排运行和导出复用的结构化需求基线。',
    '- 为 rerun、review、stage confirmation 和 export 提供可校验、可追踪、可恢复的输入。',
    '- 让运行时验证场景具备稳定、完整、可被审计的上游工件，从而减少误判和返工。',
    '- 为后续的方案规划、功能拆解、测试设计和交付物组织提供一致的事实来源。',
    '',
    '## 显性限制',
    '- 当前只处理文本与文档产物，不要求联网搜索，也不依赖外部在线服务。',
    '- 文档结构必须兼容局部重跑、失效治理、阶段确认和导出前阻塞检查。',
    '- 输出内容必须包含明确标题、具体要点、可定位的约束和可执行的后续动作。',
    '- 所有关键文档都要能够在文件系统中落盘，并允许用户后续手工修改与再次治理。',
    '',
    '## 待确认问题',
    `- 当前种子说明：${note}`,
    '- 是否需要联网补证，还是严格维持本地输入闭环。',
    '- 是否需要更细粒度的输出目录规则以及跨阶段文档引用规范。',
    '- 当用户手工修改文档后，系统是否需要立即提示影响范围并要求重新确认。',
    ''
  ].join('\n');
}

async function createProject(page: import('@playwright/test').Page, rootPath: string) {
  await createProjectAndHydrate(page, {
    name: 'runtime-ai-project',
    locationPath: rootPath,
    templateId: 'software-factory'
  });
}

async function seedComplexRuntimeFlow(page: import('@playwright/test').Page) {
  const requirement = seedRequirementMarkdown('Used as the seed input for the rerun E2E flow.');
  await page.evaluate(async ({ requirement }) => {
    const bootstrap = await window.api.bootstrapLoad();
    const platform = bootstrap.platform;
    if (!platform) {
      throw new Error('Platform payload not found.');
    }
    const flow = platform.flows[0];
    if (!flow) {
      throw new Error('Main flow not found.');
    }
    const projectRoot = bootstrap.project?.rootPath;
    if (!projectRoot) {
      throw new Error('Project root not found.');
    }
    const endNode = flow.nodes.find((node: { type: string }) => node.type === 'end');
    if (!endNode) {
      throw new Error('End node not found.');
    }
    const discoverArtifactPath = bootstrap.runtimeTemplate?.stageDocuments?.discover?.[0]?.path ?? '01-requirements/01-原始需求.md';
    const solutionArtifactPath = bootstrap.runtimeTemplate?.stageDocuments?.plan?.find((item: { path: string }) => item.path.startsWith('02-solution/'))?.path ?? '02-solution/01-技术方案.md';

    const subflow: PlatformFlowAsset = {
      id: 'e2e-subflow-runtime',
      name: '运行时子流程',
      description: '',
      kind: 'subflow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'sub-start', type: 'start', position: { x: 0, y: 0 }, data: { label: '开始' } },
        { id: 'sub-artifact', type: 'artifact', position: { x: 220, y: 0 }, data: { label: '子流程工件', artifactPath: 'sub/output.md' } },
        { id: 'sub-end', type: 'end', position: { x: 440, y: 0 }, data: { label: '结束' } }
      ],
      edges: [
        { id: 'sub-edge-1', source: 'sub-start', target: 'sub-artifact' },
        { id: 'sub-edge-2', source: 'sub-artifact', target: 'sub-end' }
      ]
    };
    await window.api.saveFlow(subflow);

    const patchedFlow: PlatformFlowAsset = {
      ...flow,
      updatedAt: new Date().toISOString(),
      nodes: [
        ...flow.nodes.map((node: PlatformFlowAsset['nodes'][number]) => {
          if (node.id === 'sf-main-discover') {
            return {
              ...node,
              data: {
                ...node.data,
                outputArtifactPaths: [discoverArtifactPath]
              }
            };
          }
          if (node.id === 'sf-main-plan') {
            return {
              ...node,
              data: {
                ...node.data,
                inputArtifactPaths: [discoverArtifactPath],
                outputArtifactPaths: [solutionArtifactPath]
              }
            };
          }
          return node;
        }),
        {
          id: 'e2e-loop',
          type: 'loop',
          position: { x: endNode.position.x - 280, y: endNode.position.y + 220 },
          data: {
            label: '循环审阅',
            loopExpression: 'needs_more',
            exitExpression: 'ready',
            maxIterations: 3,
            loopTimeoutMs: 250,
            loopFailurePolicy: 'guard_fail',
            loopBackTargetId: 'e2e-loop-buffer',
            exitTargetId: endNode.id
          }
        },
        {
          id: 'e2e-loop-buffer',
          type: 'artifact',
          position: { x: endNode.position.x - 40, y: endNode.position.y + 220 },
          data: {
            label: '循环缓冲',
            artifactPath: 'pipeline/out/loop-buffer.md'
          }
        },
        {
          id: 'e2e-subflow-node',
          type: 'subflow',
          position: { x: endNode.position.x - 160, y: endNode.position.y + 420 },
          data: {
            label: '子流程评审',
            subflowId: subflow.id,
            subflowInputBindings: ['01-requirements/01-原始需求.md=>sub/input.md'],
            subflowOutputBindings: ['sub/output.md=>02-solution/02-功能实现方案.md']
          }
        }
      ],
      edges: [
        ...flow.edges,
        { id: 'e2e-loop-edge', source: 'e2e-loop', target: 'e2e-loop-buffer', branch: 'loop' },
        { id: 'e2e-loop-exit', source: 'e2e-loop', target: endNode.id, branch: 'exit' }
      ]
    };
    await window.api.saveFlow(patchedFlow);
    await window.api.saveDocument(`${projectRoot.replace(/\\/g, '/')}/${discoverArtifactPath}`, requirement);
    await window.api.debugFlowNode({ kind: 'flow', flowId: patchedFlow.id, nodeId: 'e2e-loop' });
    await window.api.debugFlowNode({ kind: 'flow', flowId: patchedFlow.id, nodeId: 'e2e-subflow-node' });
  }, { requirement });
  await page.reload();
  await page.waitForTimeout(1200);
}

async function ensureAiSidebarVisible(page: import('@playwright/test').Page) {
  const composer = page.locator('.context-pane .composer textarea');
  if (await composer.count()) return;
  const toggle = page.locator('button[title*="AI"]').last();
  if (await toggle.count()) {
    await toggle.click();
    await expect(composer).toBeVisible({ timeout: 10_000 });
  }
}

test('orchestration runtime, contracts, and global AI sidebar remain usable end-to-end', async () => {
  test.setTimeout(300_000);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-ai-project-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-runtime-ai-userdata-'));

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
    await seedComplexRuntimeFlow(page);
    await ensureAiSidebarVisible(page);

    const composer = page.locator('.context-pane .composer textarea');
    await expect(composer).toBeVisible();
    await composer.fill('总结当前工程的起始文档');
    await expect(page.getByTestId('ai-composer-send')).toBeEnabled();
    await page.getByTestId('ai-composer-send').click();
    await expect(page.locator('.message-thread.user', { hasText: '总结当前工程的起始文档' })).toBeVisible({ timeout: 15_000 });

    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();

    await page.getByRole('button', { name: '资源管理' }).click();
    const assetManager = page.locator('.flow-editor-modal').filter({ has: page.getByTestId('orchestration-assets') }).first();
    await expect(assetManager).toBeVisible();
    await assetManager.getByLabel('输入目录').fill('pipeline/in');
    await assetManager.getByLabel('输出目录').fill('pipeline/out');
    await assetManager.getByRole('button', { name: '保存流程元数据' }).click();
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });
    await expect(page.locator('.flow-editor-modal').filter({ has: page.getByTestId('orchestration-assets') })).toHaveCount(0);

    await page.getByRole('button', { name: '资源管理' }).click();
    const reopenedAssetManager = page.locator('.flow-editor-modal').filter({ has: page.getByTestId('orchestration-assets') }).first();
    await expect(reopenedAssetManager.getByLabel('输入目录')).toHaveValue('pipeline/in');
    await expect(reopenedAssetManager.getByLabel('输出目录')).toHaveValue('pipeline/out');
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });

    await page.getByRole('button', { name: '添加卡片' }).click();
    await page.locator('.canvas-add-card-menu button', { hasText: '智能角色' }).click();
    await expect(page.locator('.flow-node-inspector-view')).toBeVisible();
    await page.getByRole('button', { name: '打开深度配置' }).click();
    const inspector = page.locator('.flow-editor-side-modal [data-testid="orchestration-inspector"]').first();
    await expect(inspector).toBeVisible();
    await inspector.getByRole('button', { name: '绑定' }).click();
    const roleOptionCount = await inspector.getByLabel('角色绑定').locator('option').count();
    expect(roleOptionCount).toBeGreaterThan(1);
    await inspector.getByLabel('角色绑定').selectOption({ index: 1 });
    await inspector.getByRole('button', { name: '输入输出' }).click();
    await inspector.getByPlaceholder('输入工件路径，按 Enter 添加').fill('pipeline/in/brief.md');
    await inspector.getByPlaceholder('输入工件路径，按 Enter 添加').press('Enter');
    await inspector.getByPlaceholder('输出工件路径，按 Enter 添加').fill('pipeline/out/result.md');
    await inspector.getByPlaceholder('输出工件路径，按 Enter 添加').press('Enter');
    await inspector.getByPlaceholder('消息键，例如 plan_brief').fill('plan_brief');
    await inspector.getByPlaceholder('消息键，例如 plan_brief').press('Enter');
    await inspector.getByPlaceholder('消息键，例如 review_feedback').fill('review_feedback');
    await inspector.getByPlaceholder('消息键，例如 review_feedback').press('Enter');
    await inspector.getByPlaceholder('信号键，例如 continue_review').fill('continue_review');
    await inspector.getByPlaceholder('信号键，例如 continue_review').press('Enter');
    await inspector.getByLabel('输出格式').selectOption('json');
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });
    await expect(page.locator('.flow-editor-side-modal')).toHaveCount(0);

    await page.getByRole('button', { name: '运行与历史' }).click();
    const runtimeModal = page.locator('.flow-editor-modal').filter({ hasText: '运行与历史' }).first();
    await expect(runtimeModal).toBeVisible();
    await expect(runtimeModal.getByText('pipeline/in/brief.md')).toBeVisible();
    await expect(runtimeModal.getByText('review_feedback')).toBeVisible();
    await runtimeModal.getByRole('button', { name: '调试当前节点' }).click();
    await expect(runtimeModal.getByRole('button', { name: '从此继续' })).toBeVisible({ timeout: 20_000 });
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });

    await page.getByTestId('orchestration-mode-runtime').click();
    await expect(page.locator('.canvas-runtime-view')).toBeVisible();
    await expect(page.locator('.canvas-runtime-view .section-kicker').filter({ hasText: '最近运行' })).toBeVisible();
    await page.getByTestId('orchestration-mode-design').click();
    await expect(page.locator('.react-flow__viewport')).toBeVisible();

    const loopNode = page.locator('.react-flow__node-loop').filter({ hasText: '循环审阅' }).first();
    await expect(loopNode).toBeVisible();
    await loopNode.click();
    if (await page.locator('.modal-backdrop').count()) {
      await page.locator('.modal-backdrop').last().click({ position: { x: 16, y: 16 } });
    }
    await page.getByRole('button', { name: '运行与历史' }).click();
    const loopRuntimeModal = page.locator('.flow-editor-modal').filter({ hasText: '运行与历史' }).first();
    await loopRuntimeModal.getByRole('button', { name: '调试当前节点' }).click();
    await expect(loopRuntimeModal.getByText('循环 · 循环审阅')).toBeVisible({ timeout: 20_000 });
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });

    await page.getByTestId('orchestration-mode-design').click();
    if (await page.locator('.modal-backdrop').count()) {
      await page.locator('.modal-backdrop').last().click({ position: { x: 16, y: 16 } });
    }
    const agentNode = page.locator('.react-flow__node-agent').filter({ hasText: '方案规划' }).first();
    await expect(agentNode).toBeVisible();
    await agentNode.click();
    await expect(page.locator('.flow-node-inspector-view')).toBeVisible();
    await page.getByRole('button', { name: '打开深度配置' }).click();
    const overviewInspector = page.locator('.flow-editor-side-modal [data-testid="orchestration-inspector"]').first();
    await expect(overviewInspector).toBeVisible();
    await overviewInspector.getByRole('button', { name: '概览' }).click();
    await overviewInspector.getByLabel('节点说明').fill('更新后的节点说明');
    await expect(page.getByTestId('orchestration-stale-chip')).toContainText('个节点待确认');
    if (await page.locator('.modal-backdrop').count()) {
      await page.locator('.modal-backdrop').last().click({ position: { x: 16, y: 16 } });
      await expect(page.locator('.flow-editor-side-modal')).toHaveCount(0);
    }
    await page.getByTitle('保存当前流程').click();
    await page.waitForTimeout(800);
    const rerunInputDiagnostics = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      const projectRoot = bootstrap.project?.rootPath;
      const artifactPath = bootstrap.runtimeTemplate?.stageDocuments?.discover?.[0]?.path;
      if (!projectRoot || !artifactPath) {
        throw new Error('Rerun input diagnostics missing project root or artifact path.');
      }
      const absolutePath = `${projectRoot.replace(/\\/g, '/')}/${artifactPath}`;
      const content = await window.api.readDocument(absolutePath);
      const headings = [
        '# 原始需求',
        '## 目标用户',
        '## 核心问题',
        '## 核心价值',
        '## 显性限制',
        '## 待确认问题'
      ];
      return {
        absolutePath,
        length: content.trim().length,
        containsAllHeadings: headings.every((heading) => content.includes(heading)),
        headingMatches: headings.map((heading) => ({ heading, ok: content.includes(heading) })),
        preview: content.slice(0, 240)
      };
    });
    expect(rerunInputDiagnostics.length).toBeGreaterThanOrEqual(500);
    expect(rerunInputDiagnostics.containsAllHeadings).toBe(true);
    const rerunResult = await page.evaluate(async () => {
      const bootstrap = await window.api.bootstrapLoad();
      const platform = bootstrap.platform;
      if (!platform) {
        throw new Error('Platform payload not found for rerun preview.');
      }
      const flow = platform.flows[0];
      if (!flow) {
        throw new Error('Main flow not found for rerun preview.');
      }
      const targetNode = flow.nodes.find((node: { id: string }) => node.id === 'sf-main-plan');
      if (!targetNode) {
        throw new Error('Target agent node not found for rerun preview.');
      }
      const preview = await window.api.previewFlowRerun({
        kind: 'flow',
        flowId: flow.id,
        nodeId: targetNode.id,
        mode: 'continue'
      });
      const applied = await window.api.applyFlowRerun({
        kind: 'flow',
        flowId: flow.id,
        nodeId: targetNode.id,
        mode: 'continue'
      });
      return {
        previewPlanId: preview.plan.id,
        invalidatedNodeCount: preview.plan.invalidatedNodeIds.length,
        invalidatedArtifactCount: preview.plan.invalidatedArtifactPaths.length,
        appliedPlanId: applied.result.plan.id,
        runId: applied.result.run.id
      };
    });
    expect(rerunResult.invalidatedNodeCount).toBeGreaterThan(0);
    expect(rerunResult.appliedPlanId).toBeTruthy();
    await page.reload();
    await page.waitForTimeout(1200);
    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    await expect(page.getByTestId('orchestration-stale-chip')).toContainText('节点状态已同步');
    await page.getByRole('button', { name: '运行与历史' }).click();
    const rerunModal = page.locator('.flow-editor-modal').filter({ hasText: '运行与历史' }).first();
    await expect(rerunModal).toBeVisible();
    await rerunModal.getByRole('button', { name: '历史', exact: true }).click();
    await expect(page.locator('.flow-history-item').first()).toBeVisible();
    await page.locator('.modal-backdrop').click({ position: { x: 16, y: 16 } });

    await page.getByTestId('orchestration-mode-design').click();
    const flowNodeCountBeforePreview = await page.locator('.react-flow__node').count();
    await page.getByTestId('orchestration-mode-runtime').click();
    await page.locator('.canvas-runtime-view').getByRole('button', { name: '打开流程对话' }).click();
    await ensureAiSidebarVisible(page);
    const flowComposer = page.locator('.context-pane .composer textarea');
    await flowComposer.fill('添加评审节点');
    await page.locator('.context-pane .composer-actions button').click();
    const previewModal = page.getByTestId('flow-conversation-preview');
    await expect(previewModal).toBeVisible({ timeout: 20_000 });
    await previewModal.getByRole('button', { name: /应用/ }).click();
    if (await previewModal.count()) {
      await expect(previewModal).toHaveCount(0, { timeout: 10_000 }).catch(async () => {
        const backdrop = page.locator('.modal-backdrop').last();
        if (await backdrop.count()) {
          await backdrop.click({ position: { x: 16, y: 16 } });
        }
        await expect(previewModal).toHaveCount(0, { timeout: 10_000 });
      });
    }
    await page.getByTestId('orchestration-mode-design').click();
    await expect.poll(async () => page.locator('.react-flow__node').count()).toBeGreaterThanOrEqual(flowNodeCountBeforePreview);

    await openActivity(page, 'project');
    await ensureAiSidebarVisible(page);
    await expect(page.locator('.document-pane')).toBeVisible();
    await expect(page.locator('.message-thread.user', { hasText: '总结当前工程的起始文档' })).toBeVisible({ timeout: 10_000 });

    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    await page.getByRole('button', { name: '打开流程对话' }).click();
    await ensureAiSidebarVisible(page);
    await expect(page.locator('.message-thread.user', { hasText: '添加评审节点' })).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
