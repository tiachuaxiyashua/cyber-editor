import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import {
  buildIsolatedElectronEnv,
  ensureAppReady,
  ensureProcessPanelVisible,
  ensureVisible,
  openDocumentFromTree,
  resolveDeliveryExportFile,
  waitForDeliveryExport,
  waitForAssistantMessageCount,
  waitForCurrentStage
} from './closed-loop-helpers.mjs';

const projectName = '闭环验证工程';
const sampleIntent = '我想做一个帮助独立设计师管理客户需求、报价、交付节点和回款提醒的桌面软件。';
const clarifyIntent = '目标用户是自由职业设计师，桌面端优先，需要项目清单、报价记录、里程碑提醒、客户备注和导出交付文档。';
const draftIntent = '请补齐非核心必要功能，包括最近项目、错误恢复、日志、自动测试入口、设置与导出能力。';

function copyDirectory(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyDirectory(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function listFiles(rootPath) {
  const results = [];
  const visit = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        visit(fullPath);
      } else {
        results.push(relativePath);
      }
    }
  };
  visit(rootPath);
  return results.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function validateExportedOpenSpec(validationRoot, changeName) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const args = process.platform === 'win32'
    ? ['/c', 'openspec', 'validate', changeName]
    : ['-lc', `openspec validate ${changeName}`];
  return spawnSync(command, args, {
    cwd: validationRoot,
    encoding: 'utf8'
  });
}

async function waitForFile(filePath) {
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

async function ensureActiveDocument(page, fileName) {
  await ensureVisible(page.locator('.document-header .panel-kicker, .document-tab.active', { hasText: fileName }).first());
}

async function sendMessage(page, message) {
  const assistantCountBefore = await page.locator('.message-thread.assistant').count();
  await page.locator('.composer textarea').fill(message);
  await page.locator('.composer .button-primary').click();
  await ensureVisible(page.getByText(message, { exact: true }).first());
  await waitForAssistantMessageCount(page, assistantCountBefore);
}

async function clickStageAction(page, index) {
  await ensureProcessPanelVisible(page);
  await page.locator('.process-panel .process-tabs button').first().click();
  await page.locator('.process-panel .button-row button').nth(index).click();
}

async function main() {
  const repoRoot = process.cwd();
  const artifactRoot = path.resolve(repoRoot, 'artifacts', 'closed-loop');
  const workspaceRoot = path.join(artifactRoot, 'workspace');
  const validationRoot = path.join(artifactRoot, 'openspec-validation');
  const screenshotsRoot = path.join(artifactRoot, 'screenshots');
  const userDataRoot = path.join(artifactRoot, 'userdata');
  const projectRoot = path.join(workspaceRoot, projectName);

  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(screenshotsRoot, { recursive: true });
  fs.mkdirSync(userDataRoot, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: buildIsolatedElectronEnv(userDataRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1680, height: 1440 });
    });

    await ensureAppReady(page);

    await page.evaluate(async ({ locationPath, name }) => {
      await window.api.createProject({ name, locationPath, directoryMode: 'create-in-parent' });
    }, { locationPath: workspaceRoot, name: projectName });
    await page.reload();

    await ensureVisible(page.locator('.app-shell.view-project .document-pane, .document-header').first());
    await ensureActiveDocument(page, '01-原始需求.md');
    await waitForCurrentStage(page, 'discover');

    await sendMessage(page, sampleIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', '01-原始需求.md'));
    await ensureActiveDocument(page, '01-原始需求.md');
    await page.screenshot({ path: path.join(screenshotsRoot, '01-discover.png'), fullPage: true });

    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'clarify');

    await sendMessage(page, clarifyIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', '02-需求澄清.md'));
    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'plan');

    await sendMessage(page, draftIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', '03-功能树.md'));
    await waitForFile(path.join(projectRoot, '01-requirements', '04-功能清单.md'));
    await waitForFile(path.join(projectRoot, '02-solution', '01-技术方案.md'));
    await page.screenshot({ path: path.join(screenshotsRoot, '02-plan.png'), fullPage: true });

    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'draft');

    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '02-solution', '02-功能实现方案.md'));
    await waitForFile(path.join(projectRoot, '02-solution', '04-自动测试方案.md'));

    await clickStageAction(page, 2);
    const exportedOpenSpecRoot = path.join(projectRoot, '03-openspec');
    await waitForFile(path.join(exportedOpenSpecRoot, 'roadmap.md'));
    const exportRoot = await waitForDeliveryExport(exportedOpenSpecRoot);
    await openDocumentFromTree(page, 'roadmap.md');
    await ensureActiveDocument(page, 'roadmap.md');
    await page.screenshot({ path: path.join(screenshotsRoot, '03-openspec-roadmap.png'), fullPage: true });
    assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.md'));
    assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.txt'));
    assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.pdf'));
  } finally {
    await app.close();
  }

  assert.ok(fs.existsSync(projectRoot), '闭环验证工程未落盘。');

  const exportedOpenSpecRoot = path.join(projectRoot, '03-openspec');
  assert.ok(fs.existsSync(exportedOpenSpecRoot), '未找到导出的 03-openspec 目录。');
  const exportRoot = await waitForDeliveryExport(exportedOpenSpecRoot);

  const changeNames = fs.readdirSync(path.join(exportedOpenSpecRoot, 'changes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(changeNames.length, 1, '导出的 OpenSpec change 数量不为 1。');
  const [changeName] = changeNames;

  fs.rmSync(validationRoot, { recursive: true, force: true });
  copyDirectory(exportedOpenSpecRoot, path.join(validationRoot, 'openspec'));
  fs.mkdirSync(path.join(validationRoot, 'openspec', 'specs'), { recursive: true });

  const validation = validateExportedOpenSpec(validationRoot, changeName);
  const generatedFiles = listFiles(projectRoot);

  fs.writeFileSync(
    path.join(artifactRoot, 'report.md'),
    [
      '# 闭环验证报告',
      '',
      `- 运行时间：${new Date().toISOString()}`,
      `- 样例需求：${sampleIntent}`,
      `- 工程目录：${projectRoot}`,
      `- 导出包目录：${exportRoot}`,
      '- 说明：创建工程时的系统目录选择器仍通过 IPC 绕过；进入工程后的需求输入、阶段推进和 OpenSpec 导出全部通过真实界面完成。',
      `- 导出 change：${changeName}`,
      `- OpenSpec 校验退出码：${validation.status ?? 'null'}`,
      '',
      '## 生成文件',
      '',
      ...generatedFiles.map((filePath) => `- ${filePath}`),
      '',
      '## OpenSpec Validate 输出',
      '',
      '```text',
      [validation.stdout, validation.stderr].filter(Boolean).join('\n').trim(),
      '```',
      ''
    ].join('\n'),
    'utf8'
  );

  assert.equal(validation.status, 0, [validation.stdout, validation.stderr].filter(Boolean).join('\n'));
  assert.match(fs.readFileSync(path.join(projectRoot, '03-openspec', 'roadmap.md'), 'utf8'), /OpenSpec Roadmap/);
  assert.match(fs.readFileSync(path.join(projectRoot, '03-openspec', 'changes', changeName, 'proposal.md'), 'utf8'), /### Why/);
  assert.match(fs.readFileSync(path.join(projectRoot, '03-openspec', 'changes', changeName, 'tasks.md'), 'utf8'), /## 1\.\s+/);
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.md'));
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.txt'));
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.pdf'));
  assert.ok(fs.existsSync(path.join(exportRoot, 'openspec', 'roadmap.md')));

  console.log(`[closed-loop] completed: ${path.join(artifactRoot, 'report.md')}`);
}

main().catch((error) => {
  console.error('[closed-loop] failed');
  console.error(error);
  process.exitCode = 1;
});
