import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { _electron as electron } from 'playwright';
import { closedLoopScenarios } from './closed-loop-scenarios.mjs';
import {
  buildIsolatedElectronEnv,
  ensureAppReady,
  ensureProcessPanelVisible,
  ensureVisible,
  openDocumentFromTree,
  prepareWelcomeScreen,
  reopenFromRecent,
  resolveDeliveryExportFile,
  waitForDeliveryExport,
  waitForAssistantMessageCount,
  waitForCurrentStage
} from './closed-loop-helpers.mjs';

const REQUIREMENT_DOC = '01-原始需求.md';
const CLARIFY_DOC = '02-需求澄清.md';
const FEATURE_TREE_DOC = '03-功能树.md';
const FEATURE_LIST_DOC = '04-功能清单.md';
const SOLUTION_DOC = '01-技术方案.md';
const IMPLEMENTATION_DOC = '02-功能实现方案.md';
const AUTO_TEST_DOC = '04-自动测试方案.md';

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

async function runScenario({ executablePath, suiteArtifactRoot, scenario, resetRecent }) {
  const scenarioArtifactRoot = path.join(suiteArtifactRoot, scenario.id);
  const workspaceRoot = path.join(suiteArtifactRoot, 'workspace');
  const validationRoot = path.join(scenarioArtifactRoot, 'openspec-validation');
  const screenshotsRoot = path.join(scenarioArtifactRoot, 'screenshots');
  const runtimeRoot = path.join(suiteArtifactRoot, 'runtime', scenario.id);
  const projectRoot = path.join(workspaceRoot, scenario.projectName);

  fs.rmSync(scenarioArtifactRoot, { recursive: true, force: true });
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  fs.rmSync(projectRoot, { recursive: true, force: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(screenshotsRoot, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const app = await electron.launch({
    executablePath,
    env: buildIsolatedElectronEnv(runtimeRoot)
  });

  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1680, height: 1440 });
    });

    await ensureAppReady(page);
    await prepareWelcomeScreen(page, resetRecent);

    await page.evaluate(async ({ locationPath, name }) => {
      await window.api.createProject({ name, locationPath, directoryMode: 'create-in-parent' });
    }, { locationPath: workspaceRoot, name: scenario.projectName });
    await page.reload();

    await ensureVisible(page.locator('.app-shell.view-project .document-pane, .document-header').first());
    await ensureActiveDocument(page, REQUIREMENT_DOC);
    await waitForCurrentStage(page, 'discover');

    await sendMessage(page, scenario.sampleIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', REQUIREMENT_DOC));
    await page.screenshot({ path: path.join(screenshotsRoot, '01-discover.png'), fullPage: true });

    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'clarify');

    await sendMessage(page, scenario.clarifyIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', CLARIFY_DOC));
    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'plan');

    await sendMessage(page, scenario.draftIntent);
    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '01-requirements', FEATURE_TREE_DOC));
    await waitForFile(path.join(projectRoot, '01-requirements', FEATURE_LIST_DOC));
    await waitForFile(path.join(projectRoot, '02-solution', SOLUTION_DOC));
    await page.screenshot({ path: path.join(screenshotsRoot, '02-plan.png'), fullPage: true });

    await clickStageAction(page, 1);
    await waitForCurrentStage(page, 'draft');

    await clickStageAction(page, 0);
    await waitForFile(path.join(projectRoot, '02-solution', IMPLEMENTATION_DOC));
    await waitForFile(path.join(projectRoot, '02-solution', AUTO_TEST_DOC));

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

    await reopenFromRecent(page, scenario.projectName, path.join(screenshotsRoot, '04-reopen-from-recent.png'));
  } finally {
    await app.close();
  }

  assert.ok(fs.existsSync(projectRoot), `Project was not created: ${scenario.projectName}`);

  const exportedOpenSpecRoot = path.join(projectRoot, '03-openspec');
  assert.ok(fs.existsSync(exportedOpenSpecRoot), `Missing exported OpenSpec directory: ${scenario.projectName}`);
  const exportRoot = await waitForDeliveryExport(exportedOpenSpecRoot);

  const changeNames = fs.readdirSync(path.join(exportedOpenSpecRoot, 'changes'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(changeNames.length, 1, `Expected one OpenSpec change for ${scenario.projectName}`);
  const [changeName] = changeNames;

  fs.rmSync(validationRoot, { recursive: true, force: true });
  copyDirectory(exportedOpenSpecRoot, path.join(validationRoot, 'openspec'));
  fs.mkdirSync(path.join(validationRoot, 'openspec', 'specs'), { recursive: true });

  const validation = validateExportedOpenSpec(validationRoot, changeName);
  const generatedFiles = listFiles(projectRoot);

  fs.writeFileSync(
    path.join(scenarioArtifactRoot, 'report.md'),
    [
      `# ${scenario.projectName} 打包产物闭环验证报告`,
      '',
      `- 运行时间：${new Date().toISOString()}`,
      `- 样例需求：${scenario.sampleIntent}`,
      `- 可执行文件：${executablePath}`,
      `- 工程目录：${projectRoot}`,
      `- 导出包目录：${exportRoot}`,
      '- 说明：本次使用打包后的桌面产物执行真实页面闭环；创建工程时的系统目录选择器仍通过 IPC 绕过，其余步骤均为界面操作。',
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
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.md'));
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.txt'));
  assert.ok(resolveDeliveryExportFile(exportRoot, 'delivery-package.pdf'));
  assert.ok(fs.existsSync(path.join(exportRoot, 'openspec', 'roadmap.md')));

  return {
    scenarioId: scenario.id,
    projectName: scenario.projectName,
    changeName,
    reportPath: path.join(scenarioArtifactRoot, 'report.md'),
    screenshotPaths: listFiles(screenshotsRoot).map((filePath) => path.join(screenshotsRoot, filePath)),
    validationStatus: validation.status ?? null,
    generatedFileCount: generatedFiles.length
  };
}

function resolveExecutablePath() {
  if (process.platform === 'win32') {
    return path.resolve(process.cwd(), 'out', 'package', 'Cyber Editor-win32-x64', 'Cyber Editor.exe');
  }
  if (process.platform === 'darwin') {
    return path.resolve(process.cwd(), 'out', 'package', 'Cyber Editor-darwin-arm64', 'Cyber Editor.app', 'Contents', 'MacOS', 'Cyber Editor');
  }
  return path.resolve(process.cwd(), 'out', 'package', 'Cyber Editor-linux-x64', 'cyber-editor');
}

async function main() {
  const executablePath = resolveExecutablePath();
  assert.ok(fs.existsSync(executablePath), `Missing packaged executable: ${executablePath}`);

  const suiteArtifactRoot = path.resolve(process.cwd(), 'artifacts', 'packaged-closed-loop-regression');
  fs.rmSync(suiteArtifactRoot, { recursive: true, force: true });
  fs.mkdirSync(suiteArtifactRoot, { recursive: true });

  const summaries = [];
  for (const [index, scenario] of closedLoopScenarios.entries()) {
    summaries.push(await runScenario({
      executablePath,
      suiteArtifactRoot,
      scenario,
      resetRecent: index === 0
    }));
  }

  fs.writeFileSync(
    path.join(suiteArtifactRoot, 'report.md'),
    [
      '# 打包产物闭环回归总报告',
      '',
      `- 运行时间：${new Date().toISOString()}`,
      `- 可执行文件：${executablePath}`,
      `- 场景数量：${summaries.length}`,
      '',
      '| 场景 | 导出 change | Validate | 生成文件数 | 报告 |',
      '| --- | --- | --- | --- | --- |',
      ...summaries.map((summary) => `| ${summary.projectName} | ${summary.changeName} | ${summary.validationStatus} | ${summary.generatedFileCount} | ${path.relative(suiteArtifactRoot, summary.reportPath).replace(/\\/g, '/')} |`),
      '',
      '## 截图',
      '',
      ...summaries.flatMap((summary) => summary.screenshotPaths.map((filePath) => `- ${path.relative(suiteArtifactRoot, filePath).replace(/\\/g, '/')}`)),
      ''
    ].join('\n'),
    'utf8'
  );

  console.log(`[packaged-closed-loop] completed: ${path.join(suiteArtifactRoot, 'report.md')}`);
}

main().catch((error) => {
  console.error('[packaged-closed-loop] failed');
  console.error(error);
  process.exitCode = 1;
});
