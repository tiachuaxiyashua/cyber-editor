import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

function buildElectronEnv(userDataRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  return env;
}

async function ensureVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
}

async function ensureProjectSidebarOpen(page) {
  const sidebar = page.locator('.primary-sidebar');
  if (!(await sidebar.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '切换主侧栏' }).click();
    await ensureVisible(sidebar);
  }
  const projectActivity = page.locator('.activity-button[aria-label="工程"]');
  const projectActive = await projectActivity.evaluate((element) => element.classList.contains('active')).catch(() => false);
  if (!projectActive) {
    await projectActivity.click();
  }
  await ensureVisible(sidebar);
  await ensureVisible(page.locator('.primary-sidebar [aria-label="新建文档"]').first());
}

async function createDocument(page, name) {
  await ensureProjectSidebarOpen(page);
  await page.evaluate((nextName) => {
    window.prompt = () => nextName;
  }, name);
  await page.locator('.primary-sidebar [aria-label="新建文档"]').first().evaluate((element) => element.click());
  await ensureVisible(page.locator('.document-tab', { hasText: name }));
}

async function mockDialogPaths(app, filePaths) {
  await app.evaluate(({ dialog }, nextPaths) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: nextPaths
    });
  }, filePaths);
}

async function main() {
  const repoRoot = process.cwd();
  const artifactRoot = path.join(repoRoot, 'artifacts', 'p018-user-self-test');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-p018-project-'));
  const importRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-p018-import-'));
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-p018-userdata-'));
  const importFileName = '会议纪要.md';
  const importFilePath = path.join(importRoot, importFileName);
  fs.writeFileSync(importFilePath, '# 会议纪要\n\n这里是一份用于导入测试的外部文档。\n', 'utf8');

  fs.rmSync(artifactRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(artifactRoot, 'screenshots'), { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: buildElectronEnv(userDataRoot)
  });

  const steps = [];

  try {
    const page = await app.firstWindow();
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
    await page.reload();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1680, height: 1380 });
    });
    await ensureVisible(page.getByText('Cyber Editor'));

    steps.push('打开应用并进入欢迎页');

    await mockDialogPaths(app, [workspaceRoot]);
    await page.evaluate(() => {
      window.prompt = () => 'p018-self-test';
    });
    await page.getByRole('button', { name: '新建工程' }).click();
    await ensureVisible(page.getByText('p018-self-test', { exact: true }).first());
    await page.screenshot({ path: path.join(artifactRoot, 'screenshots', '01-project-created.png'), fullPage: true });
    steps.push('通过欢迎页按钮创建新工程');

    await createDocument(page, '需求澄清.md');
    await createDocument(page, '任务拆解.md');
    await ensureVisible(page.locator('.document-tab', { hasText: '任务拆解.md' }));
    steps.push('通过左侧工程栏新建多个文档并形成多标签页');

    await page.locator('.tree-node-file', { hasText: '01-原始需求.md' }).click();
    await page.getByRole('button', { name: '源码' }).click();
    const editor = page.locator('.editor');
    await editor.fill('# 原始需求\n\n客户回款提醒\n客户回款提醒\n');
    await page.getByRole('button', { name: '保存更改' }).click();

    await page.locator('.tree-node-file', { hasText: '需求澄清.md' }).click();
    await editor.fill('# 需求澄清\n\n包含交付节点和客户回款提醒。\n');
    await page.getByRole('button', { name: '保存更改' }).click();
    steps.push('在多个文档中编辑并保存内容');

    await page.getByRole('button', { name: '打开命令面板' }).click();
    await page.getByLabel('搜索命令').fill('工程搜索');
    await page.locator('.command-palette-item', { hasText: '工程搜索' }).click();
    await page.getByPlaceholder('搜索文档正文或标题…').fill('客户回款提醒');
    await ensureVisible(page.locator('.search-result-card').first());
    await page.locator('.search-result-card').first().click();
    await ensureVisible(page.locator('.find-replace-bar'));
    await page.screenshot({ path: path.join(artifactRoot, 'screenshots', '02-project-search.png'), fullPage: true });
    steps.push('通过命令面板进入工程搜索，并从搜索结果跳转到命中文档');

    await page.getByLabel('查找当前文档').fill('客户回款提醒');
    await page.getByLabel('替换为').fill('客户回款计划');
    await page.getByRole('button', { name: '全部替换' }).click();
    await page.getByRole('button', { name: '保存更改' }).click();
    steps.push('在当前文档内执行查找与全部替换');

    await mockDialogPaths(app, [importFilePath]);
    await page.getByRole('button', { name: '导入文本文档' }).first().click();
    await ensureVisible(page.getByText(importFileName).first());
    steps.push('通过导入入口把外部 Markdown 文档导入工程');

    await ensureVisible(page.locator('.document-heading', { hasText: importFileName }));
    await page.getByRole('button', { name: '源码' }).click();
    await page.evaluate(() => {
      const textarea = document.querySelector('.editor');
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const file = new File([new Uint8Array([137, 80, 78, 71])], '流程图.png', { type: 'image/png' });
      const clipboard = new DataTransfer();
      clipboard.items.add(file);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: clipboard });
      textarea.dispatchEvent(event);
    });
    await ensureVisible(page.getByText('流程图').first());
    steps.push('在编辑器中通过粘贴图片导入资源并插入 Markdown 引用');

    const importedDocumentPath = path.join(workspaceRoot, 'p018-self-test', '01-requirements', importFileName);
    await editor.fill('# 会议纪要\n\n本地未保存修改\n');
    fs.writeFileSync(importedDocumentPath, '# 会议纪要\n\n外部修改版本一\n', 'utf8');
    await page.locator('.document-toolbar .button-ghost.icon-text').first().click();
    await ensureVisible(page.getByText('检测到外部变更'));
    await page.getByRole('button', { name: '稍后处理' }).click();
    fs.writeFileSync(importedDocumentPath, '# 会议纪要\n\n外部修改版本二\n', 'utf8');
    await page.locator('.document-toolbar .button-ghost.icon-text').first().click();
    await ensureVisible(page.getByText('检测到外部变更'));
    await page.getByRole('button', { name: '重新加载外部版本' }).click();
    await ensureVisible(page.getByText('外部修改版本二'));
    await editor.fill('# 会议纪要\n\n保留本地版本\n');
    fs.writeFileSync(importedDocumentPath, '# 会议纪要\n\n外部修改版本三\n', 'utf8');
    await page.locator('.document-toolbar .button-ghost.icon-text').first().click();
    await ensureVisible(page.getByText('检测到外部变更'));
    await page.getByRole('button', { name: '保留当前内容并覆盖外部文件' }).click();
    await ensureVisible(page.getByText('保留本地版本'));
    await page.screenshot({ path: path.join(artifactRoot, 'screenshots', '03-conflict-dialog.png'), fullPage: true });
    steps.push('触发并验证外部变更冲突的稍后处理、重新加载和覆盖外部文件三条路径');

    await page.locator('.document-tab', { hasText: '需求澄清.md' }).getByRole('button', { name: '关闭文档 需求澄清.md' }).click();
    await page.getByRole('button', { name: '重新打开已关闭文档' }).click();
    await ensureVisible(page.locator('.document-tab', { hasText: '需求澄清.md' }));
    steps.push('关闭并重新打开最近关闭的标签页');

    const reportPath = path.join(artifactRoot, 'report.md');
    fs.writeFileSync(
      reportPath,
      [
        '# P018 用户级自测报告',
        '',
        `- 运行时间：${new Date().toISOString()}`,
        `- 工程目录：${path.join(workspaceRoot, 'p018-self-test')}`,
        '',
        '## 已验证步骤',
        '',
        ...steps.map((step) => `- ${step}`),
        '',
        '## 截图',
        '',
        '- screenshots/01-project-created.png',
        '- screenshots/02-project-search.png',
        '- screenshots/03-conflict-dialog.png',
        ''
      ].join('\n'),
      'utf8'
    );

    console.log(`[p018-self-test] 完成。报告：${reportPath}`);
  } finally {
    await app.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(importRoot, { recursive: true, force: true });
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('[p018-self-test] failed');
  console.error(error);
  process.exitCode = 1;
});
