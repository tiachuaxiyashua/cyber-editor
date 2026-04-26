import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import {
  resolveManualProjectsRoot,
  resolvePackagedExecutablePath
} from './lib/packaged-project-paths.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation', RUN_STAMP);
const PRESERVED_PROJECT_ROOT = path.join(resolveManualProjectsRoot(REPO_ROOT), 'validated-extreme-qwen-delivery');
const USER_VISIBLE_PROJECT_SELECTOR = '.app-shell.view-project .document-surface';

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function waitForBootstrap(page, predicate, timeout = 10_000) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeout) {
    latest = await page.evaluate(async () => await window.api.bootstrapLoad());
    if (predicate(latest)) {
      return latest;
    }
    const remaining = timeout - (Date.now() - startedAt);
    if (remaining <= 0) {
      break;
    }
    await page.waitForTimeout(Math.min(250, remaining));
  }
  return latest;
}

async function waitForVisibleProject(page, projectName, timeout = 10_000) {
  await Promise.all([
    page.locator(USER_VISIBLE_PROJECT_SELECTOR).first().waitFor({ state: 'visible', timeout }),
    page.waitForFunction((expectedProjectName) => {
      const isVisibleElement = (element) => {
        let current = element;
        while (current) {
          const style = window.getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
          current = current.parentElement;
        }
        return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeValue?.includes(expectedProjectName)) {
          const parent = node.parentElement;
          if (parent && isVisibleElement(parent)) {
            return true;
          }
        }
        node = walker.nextNode();
      }
      return false;
    }, projectName, { timeout })
  ]);
}

async function main() {
  ensureDir(RUN_ROOT);

  const executablePath = resolvePackagedExecutablePath(REPO_ROOT);
  const preservedManifestPath = path.join(PRESERVED_PROJECT_ROOT, '.project', 'manifest.json');
  assert.ok(fs.existsSync(executablePath), `Missing packaged executable: ${executablePath}`);
  assert.ok(fs.existsSync(preservedManifestPath), `Missing preserved project: ${PRESERVED_PROJECT_ROOT}`);
  const preservedProjectName = readJson(preservedManifestPath)?.name ?? path.basename(PRESERVED_PROJECT_ROOT);

  const launchStartedAt = Date.now();
  const app = await electron.launch({ executablePath });
  try {
    const page = await app.firstWindow();
    const launchToFirstWindowMs = Date.now() - launchStartedAt;
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].setBounds({ width: 1720, height: 1180 });
    });
    await page.waitForLoadState('domcontentloaded');
    const launchToDomContentLoadedMs = Date.now() - launchStartedAt;
    await waitForVisibleProject(page, preservedProjectName, 10_000);
    const launchToProjectVisibleMs = Date.now() - launchStartedAt;
    const bootstrapVerificationStartedAt = Date.now();
    const bootstrap = await waitForBootstrap(
      page,
      (payload) => payload?.project?.rootPath === PRESERVED_PROJECT_ROOT,
      15_000
    );
    const launchToBootstrapProjectMs = Date.now() - launchStartedAt;
    const bootstrapVerificationMs = Date.now() - bootstrapVerificationStartedAt;
    const screenshotPath = path.join(RUN_ROOT, 'direct-open.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const summary = {
      generatedAt: new Date().toISOString(),
      executablePath,
      expectedProjectRoot: PRESERVED_PROJECT_ROOT,
      expectedProjectName: preservedProjectName,
      actualProjectRoot: bootstrap?.project?.rootPath ?? null,
      launchToProjectMs: launchToProjectVisibleMs,
      launchToFirstWindowMs,
      launchToDomContentLoadedMs,
      launchToProjectVisibleMs,
      launchToBootstrapProjectMs,
      bootstrapVerificationMs,
      recentProjects: bootstrap?.settings?.recentProjects ?? [],
      screenshotPath
    };

    writeJson(path.join(RUN_ROOT, 'summary.json'), summary);
    writeMarkdown(
      path.join(RUN_ROOT, 'report.md'),
      [
        '# Direct Packaged Open Validation',
        '',
        `- Packaged executable: ${executablePath}`,
        `- Expected project root: ${PRESERVED_PROJECT_ROOT}`,
        `- Expected project name: ${preservedProjectName}`,
        `- Actual project root: ${summary.actualProjectRoot}`,
        `- Launch to first window: ${summary.launchToFirstWindowMs} ms`,
        `- Launch to DOM content loaded: ${summary.launchToDomContentLoadedMs} ms`,
        `- Launch to project visible: ${summary.launchToProjectVisibleMs} ms`,
        `- Launch to bootstrap project verification: ${summary.launchToBootstrapProjectMs} ms`,
        `- Bootstrap verification duration: ${summary.bootstrapVerificationMs} ms`,
        `- Screenshot: ${screenshotPath}`,
        '',
        '## Recent Projects',
        '',
        ...(summary.recentProjects.length
          ? summary.recentProjects.map((entry) => `- ${entry.alias || entry.name}: ${entry.rootPath}`)
          : ['- none']),
        ''
      ].join('\n')
    );

    assert.equal(summary.actualProjectRoot, PRESERVED_PROJECT_ROOT, 'Direct packaged launch did not restore the preserved validation project.');
    console.log(`[direct-packaged-open-validation] report -> ${path.join(RUN_ROOT, 'report.md')}`);
  } finally {
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  writeJson(path.join(RUN_ROOT, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error)
  });
  console.error('[direct-packaged-open-validation] failed');
  console.error(error);
  process.exitCode = 1;
});
