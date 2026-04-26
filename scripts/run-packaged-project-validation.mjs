irrmport assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import {
  findLatestExtremeValidationProject,
  resolveManualProjectsRoot,
  resolvePackagedExecutablePath
} from './lib/packaged-project-paths.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation', RUN_STAMP);
const PRESERVED_PROJECT_NAME = 'validated-extreme-qwen-delivery';
const ACTIVITY_TITLES = {
  thinkingChain: '\u601d\u8def\u5730\u56fe',
  orchestration: '\u6d41\u7f16\u6392',
  resourceCenter: '\u8d44\u6e90\u4e2d\u5fc3',
  rulesCenter: '\u89c4\u5219\u4e0e\u6c89\u6dc0\u4e2d\u5fc3',
  settings: '\u8bbe\u7f6e'
};

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeMarkdown(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

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

function listRelativeFiles(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  const results = [];
  const visit = (currentPath) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      results.push(path.relative(rootPath, fullPath).replace(/\\/g, '/'));
    }
  };
  visit(rootPath);
  return results.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function buildElectronEnv(userDataRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;
  env.APPDATA = path.resolve(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.resolve(userDataRoot, 'localappdata');
  env.HOME = path.resolve(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.resolve(userDataRoot, 'userData');
  ensureDir(env.APPDATA);
  ensureDir(env.LOCALAPPDATA);
  ensureDir(env.HOME);
  ensureDir(env.CYBER_EDITOR_USER_DATA);
  return env;
}

async function waitForVisible(locator, timeout = 20_000) {
  await locator.first().waitFor({ state: 'visible', timeout });
}

async function captureActivityPage(page, title, visibleTarget, screenshotPath, checks, detail) {
  await page.locator(`.activity-bar .activity-button[title="${title}"]`).click();
  await waitForVisible(visibleTarget);
  checks.push({ id: detail.id, ok: true, detail: detail.message });
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

function pushCheck(checks, id, ok, detail) {
  checks.push({ id, ok, detail });
  if (!ok) {
    throw new Error(`${id}: ${detail}`);
  }
}

async function main() {
  ensureDir(RUN_ROOT);

  const executablePath = resolvePackagedExecutablePath(REPO_ROOT);
  assert.ok(fs.existsSync(executablePath), `Missing packaged executable: ${executablePath}`);

  const source = findLatestExtremeValidationProject(REPO_ROOT);
  assert.ok(source, 'No post-change extreme validation project was found.');
  console.log(`[packaged-project-validation] source project -> ${source.projectRoot}`);

  const preservedProjectsRoot = resolveManualProjectsRoot(REPO_ROOT);
  const preservedProjectRoot = path.join(preservedProjectsRoot, PRESERVED_PROJECT_NAME);
  fs.rmSync(preservedProjectRoot, { recursive: true, force: true });
  copyDirectory(source.projectRoot, preservedProjectRoot);
  console.log(`[packaged-project-validation] preserved project -> ${preservedProjectRoot}`);

  const qualityReport = readJsonIfExists(source.qualityReportPath);
  const docScores = Object.values(qualityReport ?? {}).map((item) => ({
    filePath: item.filePath,
    verdict: item.verdict,
    band: item.band,
    score: item.score,
    deliveryScore: item.deliveryScore
  }));

  for (const relativePath of ['.project', '01-requirements', '02-solution', '03-openspec']) {
    const fullPath = path.join(preservedProjectRoot, relativePath);
    assert.ok(fs.existsSync(fullPath), `Missing preserved project path: ${relativePath}`);
  }

  const exportRoot = path.join(preservedProjectRoot, '03-openspec', 'exports');
  const exportSuites = fs.existsSync(exportRoot)
    ? fs.readdirSync(exportRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];
  assert.ok(exportSuites.length > 0, 'No delivery export exists under 03-openspec/exports.');

  const latestExportRoot = path.join(exportRoot, exportSuites[exportSuites.length - 1]);
  assert.ok(fs.existsSync(path.join(latestExportRoot, 'manifest.json')), 'Missing export manifest.json.');
  assert.ok(fs.existsSync(path.join(latestExportRoot, 'markdown', 'delivery-package.md')), 'Missing markdown/delivery-package.md.');
  assert.ok(fs.existsSync(path.join(latestExportRoot, 'text', 'delivery-package.txt')), 'Missing text/delivery-package.txt.');
  assert.ok(fs.existsSync(path.join(latestExportRoot, 'pdf', 'delivery-package.pdf')), 'Missing pdf/delivery-package.pdf.');
  assert.ok(fs.existsSync(path.join(latestExportRoot, 'openspec', 'roadmap.md')), 'Missing openspec/roadmap.md.');

  const userDataRoot = fs.mkdtempSync(path.resolve(os.tmpdir(), 'cyber-editor-packaged-project-validation-'));
  const screenshotDir = path.join(RUN_ROOT, 'screenshots');
  ensureDir(screenshotDir);

  const checks = [];
  const screenshotPaths = [];
  let app = null;
  let reopenedApp = null;

  try {
    app = await electron.launch({
      executablePath,
      env: buildElectronEnv(userDataRoot)
    });
    console.log('[packaged-project-validation] launch packaged app');

    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1720, height: 1180 });
    });

    await waitForVisible(page.locator('.welcome-screen, .app-shell'));
    const launchShot = path.join(screenshotDir, '01-launch.png');
    await page.screenshot({ path: launchShot, fullPage: true });
    screenshotPaths.push(launchShot);

    await page.evaluate(async (rootPath) => {
      await window.api.openProject(rootPath);
    }, preservedProjectRoot);
    console.log('[packaged-project-validation] project open invoked');
    await page.reload();
    await page.waitForTimeout(1200);

    const bootstrap = await page.evaluate(async () => await window.api.bootstrapLoad());
    pushCheck(
      checks,
      'project-root',
      bootstrap?.project?.rootPath === preservedProjectRoot,
      `expected ${preservedProjectRoot}, got ${bootstrap?.project?.rootPath ?? 'null'}`
    );

    await waitForVisible(page.locator('.document-surface'));
    const workbenchShot = path.join(screenshotDir, '02-workbench.png');
    await page.screenshot({ path: workbenchShot, fullPage: true });
    screenshotPaths.push(workbenchShot);

    const thinkingShot = path.join(screenshotDir, '03-thinking-chain.png');
    await captureActivityPage(
      page,
      ACTIVITY_TITLES.thinkingChain,
      page.getByTestId('thinking-chain-page'),
      thinkingShot,
      checks,
      { id: 'thinking-chain', message: 'thinking chain page is visible' }
    );
    screenshotPaths.push(thinkingShot);

    const orchestrationShot = path.join(screenshotDir, '04-orchestration.png');
    await captureActivityPage(
      page,
      ACTIVITY_TITLES.orchestration,
      page.getByTestId('orchestration-workspace'),
      orchestrationShot,
      checks,
      { id: 'orchestration', message: 'orchestration workspace is visible' }
    );
    screenshotPaths.push(orchestrationShot);

    await page.locator(`.activity-bar .activity-button[title="${ACTIVITY_TITLES.resourceCenter}"]`).click();
    await waitForVisible(page.getByTestId('resource-center-page'));
    checks.push({ id: 'resource-center', ok: true, detail: 'resource center is visible' });

    await page.locator(`.activity-bar .activity-button[title="${ACTIVITY_TITLES.rulesCenter}"]`).click();
    await waitForVisible(page.getByTestId('rules-workspace'));
    checks.push({ id: 'rules-center', ok: true, detail: 'rules workspace is visible' });

    await page.locator(`.activity-bar .activity-button[title="${ACTIVITY_TITLES.settings}"]`).click();
    await waitForVisible(page.locator('.settings-workspace-page'));
    checks.push({ id: 'settings', ok: true, detail: 'settings workspace is visible' });
    const sidePagesShot = path.join(screenshotDir, '05-side-pages.png');
    await page.screenshot({ path: sidePagesShot, fullPage: true });
    screenshotPaths.push(sidePagesShot);

    await app.close();
    app = null;
    console.log('[packaged-project-validation] first launch closed, starting reopen check');

    reopenedApp = await electron.launch({
      executablePath,
      env: buildElectronEnv(userDataRoot)
    });

    const reopenedPage = await reopenedApp.firstWindow();
    await reopenedApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1720, height: 1180 });
    });
    await reopenedPage.waitForLoadState('domcontentloaded');
    await reopenedPage.waitForTimeout(1500);

    const reopenedBootstrap = await reopenedPage.evaluate(async () => await window.api.bootstrapLoad());
    pushCheck(
      checks,
      'reopen-persisted-project',
      reopenedBootstrap?.project?.rootPath === preservedProjectRoot ||
        (Array.isArray(reopenedBootstrap?.recentProjects) &&
          reopenedBootstrap.recentProjects.some((item) => item.rootPath === preservedProjectRoot)),
      'reopen keeps the project loaded or retains it in recent projects'
    );

    const reopenShot = path.join(screenshotDir, '06-reopen.png');
    await reopenedPage.screenshot({ path: reopenShot, fullPage: true });
    screenshotPaths.push(reopenShot);
  } finally {
    if (reopenedApp) {
      await reopenedApp.close().catch(() => {});
    }
    if (app) {
      await app.close().catch(() => {});
    }
    fs.rmSync(userDataRoot, { recursive: true, force: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    executablePath,
    sourceSuiteRoot: source.suiteRoot,
    sourceProjectRoot: source.projectRoot,
    preservedProjectRoot,
    latestExportRoot,
    screenshotPaths,
    checks,
    docScores,
    preservedProjectFiles: listRelativeFiles(preservedProjectRoot)
  };

  writeJson(path.join(RUN_ROOT, 'summary.json'), summary);
  writeMarkdown(
    path.join(RUN_ROOT, 'report.md'),
    [
      '# Packaged Project Validation',
      '',
      `- Generated at: ${summary.generatedAt}`,
      `- Packaged executable: ${executablePath}`,
      `- Source validation project: ${source.projectRoot}`,
      `- Preserved project root: ${preservedProjectRoot}`,
      `- Latest export root: ${latestExportRoot}`,
      '',
      '## Checks',
      '',
      ...checks.map((check) => `- [${check.ok ? 'x' : ' '}] ${check.id}: ${check.detail}`),
      '',
      '## Document Scores',
      '',
      ...(docScores.length
        ? docScores.map((item) => `- ${item.filePath}: ${item.deliveryScore ?? item.score} (${item.verdict}/${item.band})`)
        : ['- No doc-quality-review.json found for the source suite.']),
      '',
      '## Screenshots',
      '',
      ...screenshotPaths.map((filePath) => `- ${path.relative(RUN_ROOT, filePath).replace(/\\/g, '/')}`),
      '',
      '## Preserved Project Files',
      '',
      ...summary.preservedProjectFiles.map((filePath) => `- ${filePath}`),
      ''
    ].join('\n')
  );

  console.log(`[packaged-project-validation] report -> ${path.join(RUN_ROOT, 'report.md')}`);
}

main().catch((error) => {
  writeJson(path.join(RUN_ROOT, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error)
  });
  console.error('[packaged-project-validation] failed');
  console.error(error);
  process.exitCode = 1;
});
