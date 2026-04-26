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

function seedRequirementMarkdown(note: string) {
  return [
    '# 原始需求',
    '',
    '## 目标用户',
    '- 软件项目负责人，需要把模糊需求快速沉淀为结构化文档、流程说明和最终交付材料。',
    '- 实际执行者，需要理解当前目标、约束、上下游依赖、交付边界以及每个阶段的输入输出。',
    '- 运行时操作者，需要稳定输入来验证失效治理、局部重跑、阶段确认和导出阻塞。',
    '- 审查人员，需要根据同一份需求基线识别方案缺漏、风险和影响范围。',
    '',
    '## 核心问题',
    '- 上游需求如果被修改，系统需要准确标记受影响产物、相关节点和可恢复路径。',
    '- 如果输入文档过于简陋，重跑、导出和阶段确认都可能失真，甚至通过错误校验。',
    '- 缺少统一结构会让测试只覆盖 happy path，无法覆盖治理、恢复和阻塞场景。',
    '- 用户手工编辑上游文档后，如果没有明确影响提示，就会误以为已有产物仍然可用。',
    '',
    '## 核心价值',
    '- 提供稳定的需求基线，让 artifact invalidation、rerun repair 和 export blocker 能真实工作。',
    '- 让 review、plan、draft、delivery export 都围绕同一份可校验文档进行，而不是依赖模糊摘要。',
    '- 为后续方案、测试、交付导出和影响分析提供一致输入与证据来源。',
    '- 让系统在用户修改上游文档后，能够准确定位受影响范围并阻止错误交付继续扩散。',
    '',
    '## 显性限制',
    '- 当前只验证文本和文档型产物，不依赖联网搜索和远程同步。',
    '- 文档需要兼容 plan 阶段导出、治理检查、失效标记和局部重跑。',
    '- 需求文档必须具备完整结构，不能只剩一句摘要或单段说明。',
    '- 工件需要可落盘、可复读、可被后续流程和测试直接引用。',
    '',
    '## 待确认问题',
    `- 当前种子说明：${note}`,
    '- 是否需要更细的影响范围呈现和节点级别失效解释。',
    '- 是否需要联网补证后再允许导出，还是完全坚持本地闭环。',
    '- 是否需要在用户手工修改后立即推送受影响工件与建议重跑列表。',
    ''
  ].join('\n');
}

async function prepareProject(page: import('@playwright/test').Page, parentRoot: string) {
  const initialRequirement = seedRequirementMarkdown('Initial seeded requirement for artifact invalidation.');
  const changedRequirement = seedRequirementMarkdown('Upstream requirement changed after plan confirmation.');
  return page.evaluate(async ({ projectParent, initialRequirement, changedRequirement }) => {
    const created = await window.api.createProject({
      name: 'artifact-governance-project',
      locationPath: projectParent,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });

    const flow = created.platform?.flows.find((item: { id: string }) => item.id === 'sf-flow-main') ?? created.platform?.flows[0];
    if (!flow) {
      throw new Error('Main flow not found.');
    }

    const discoverArtifactPath = created.runtimeTemplate?.stageDocuments.discover[0]?.path ?? '01-requirements/01-原始需求.md';
    const solutionArtifactPath = created.runtimeTemplate?.stageDocuments.plan.find(
      (item: { path: string }) => item.path.startsWith('02-solution/')
    )?.path ?? '02-solution/01-技术方案.md';
    const patchedFlow = {
      ...flow,
      updatedAt: new Date().toISOString(),
      nodes: flow.nodes.map((node: {
        id: string;
        data: Record<string, unknown>;
      }) => {
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
      })
    };

    await window.api.saveFlow(patchedFlow);
    const moved = await window.api.revisitStage('plan');
    const session = moved.sessions[0];
    if (!session) {
      throw new Error('Session not found.');
    }
    const withPlanUserInput = moved.sessions.map((item: {
      stage: string;
      messages: Array<Record<string, unknown>>;
    }, index: number) =>
        index === 0
          ? {
              ...item,
              stage: 'plan',
              messages: [
                ...item.messages,
                {
                  id: `user-plan-${Date.now()}`,
                  role: 'user',
                  content: '请继续规划方案并产出计划阶段文档。',
                  createdAt: new Date().toISOString()
                }
              ]
            }
          : item
      );
    await window.api.saveSessions(withPlanUserInput);

    const projectRoot = moved.project?.rootPath ?? created.project?.rootPath;
    if (!projectRoot) {
      throw new Error('Project root not found.');
    }

    const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');
    const discoverAbsolutePath = `${normalizedProjectRoot}/${discoverArtifactPath}`;
    const workflowStatePath = `${normalizedProjectRoot}/.project/workflow-state.json`;
    await window.api.saveDocument(discoverAbsolutePath, initialRequirement);
    await window.api.generateStageDraft(session.id);
    await window.api.confirmStage(session.id, 'plan');
    const workflow = JSON.parse(await window.api.readDocument(workflowStatePath)) as {
      stage: string;
      confirmedStages: string[];
      activeDocumentPath?: string;
    };
    await window.api.saveDocument(
      workflowStatePath,
      JSON.stringify(
        {
          ...workflow,
          stage: 'plan',
          confirmedStages: Array.from(new Set([...(workflow.confirmedStages ?? []), 'plan']))
        },
        null,
        2
      )
    );
    await window.api.saveSessions(
      withPlanUserInput.map((item: {
        stage: string;
        messages: Array<Record<string, unknown>>;
      }, index: number) =>
        index === 0
          ? {
              ...item,
              stage: 'plan'
            }
          : item
      )
    );
    await window.api.saveDocument(discoverAbsolutePath, changedRequirement);

    return {
      projectRoot,
      sessionId: session.id
    };
  }, { projectParent: parentRoot, initialRequirement, changedRequirement });
}

test('artifact invalidation is surfaced in orchestration UI and blocks export until rerun repair', async () => {
  test.setTimeout(240_000);

  const parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-artifact-parent-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-artifact-userdata-'));

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

    const prepared = await prepareProject(page, parentRoot);
    await page.reload();
    await page.waitForTimeout(1200);

    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();

    await page.getByRole('button', { name: '运行与历史' }).click();
    const runtimeModal = page.locator('.flow-editor-modal').filter({ hasText: '运行与历史' }).first();
    await expect(runtimeModal).toBeVisible();
    await runtimeModal.getByRole('button', { name: '工件' }).click();

    await expect(runtimeModal.getByText('技术方案').first()).toBeVisible();
    await expect(runtimeModal.getByText('建议重跑').first()).toBeVisible();
    await expect(runtimeModal.getByText('方案规划').first()).toBeVisible();

    const blockedExport = await page.evaluate(async () => {
      try {
        await window.api.generateOpenSpec();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    });
    expect(blockedExport.ok).toBe(false);
    expect(blockedExport.message).toContain('Export blocked by invalidated artifacts');

    await page.evaluate(async ({ sessionId }) => {
      await window.api.generateStageDraft(sessionId);
    }, { sessionId: prepared.sessionId });
    await page.reload();
    await page.waitForTimeout(1200);

    await openActivity(page, 'orchestration');
    await expect(page.getByTestId('orchestration-workspace')).toBeVisible();
    await page.getByRole('button', { name: '运行与历史' }).click();
    const resolvedModal = page.locator('.flow-editor-modal').filter({ hasText: '运行与历史' }).first();
    await expect(resolvedModal).toBeVisible();
    await resolvedModal.getByRole('button', { name: '工件' }).click();
    await expect(resolvedModal.getByText('当前阶段没有待处理失效工件')).toBeVisible();

    const successfulExport = await page.evaluate(async () => {
      const payload = await window.api.generateOpenSpec();
      return {
        changeName: payload.result.changeName,
        manifestPath: payload.result.exportPackage.manifestPath
      };
    });

    expect(successfulExport.changeName).toContain('deliver');
    expect(fs.existsSync(successfulExport.manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(successfulExport.manifestPath, 'utf8')) as {
      exports: { markdownPath?: string | null };
    };
    expect(Boolean(manifest.exports.markdownPath)).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(parentRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
});
