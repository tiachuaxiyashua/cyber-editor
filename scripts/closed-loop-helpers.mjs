import fs from 'node:fs';
import path from 'node:path';

export function buildIsolatedElectronEnv(userDataRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
  delete env.ELECTRON_RUN_AS_NODE;

  env.APPDATA = path.join(userDataRoot, 'appdata');
  env.LOCALAPPDATA = path.join(userDataRoot, 'localappdata');
  env.HOME = path.join(userDataRoot, 'home');
  env.CYBER_EDITOR_USER_DATA = path.join(userDataRoot, 'userData');
  env.TEMP = path.join(userDataRoot, 'temp');
  env.TMP = path.join(userDataRoot, 'temp');

  fs.mkdirSync(env.APPDATA, { recursive: true });
  fs.mkdirSync(env.LOCALAPPDATA, { recursive: true });
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.CYBER_EDITOR_USER_DATA, { recursive: true });
  fs.mkdirSync(env.TEMP, { recursive: true });

  return env;
}

export async function ensureVisible(locator) {
  await locator.waitFor({ state: 'visible', timeout: 30_000 });
}

export async function ensureAppReady(page) {
  await ensureVisible(page.locator('.app-shell, .welcome-screen').first());
}

export async function ensureWelcomeScreen(page) {
  await ensureVisible(page.locator('.welcome-screen'));
}

export async function ensureProcessPanelVisible(page) {
  const panel = page.locator('.process-panel');
  if (await panel.count()) {
    const visible = await panel.first().isVisible().catch(() => false);
    if (visible) return;
  }
  const toggle = page.locator(
    '.activity-rail-bottom .activity-button[title="任务抽屉"], .activity-rail-bottom .activity-button[aria-label="任务抽屉"], .topbar-actions .icon-button[title="切换流程面板"]'
  ).first();
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click();
    await ensureVisible(page.locator('.process-panel'));
    return;
  }

  const settings = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return {
      theme: bootstrap.settings.theme,
      sidebar: bootstrap.settings.sidebar
    };
  });
  await page.evaluate(async ({ theme, sidebar }) => {
    await window.api.saveSettings({
      theme,
      sidebar: { ...sidebar, processPanelOpen: true, processPanelTab: 'stage' }
    });
  }, settings);
  await page.reload();
  await ensureAppReady(page);
  await ensureVisible(page.locator('.process-panel'));
}

export async function waitForStatus(page, text) {
  await page.waitForFunction(
    ({ selector, expected }) => {
      const element = document.querySelector(selector);
      return Boolean(element?.textContent?.includes(expected));
    },
    { selector: '.statusbar span:first-child', expected: text },
    { timeout: 30_000 }
  );
}

export async function waitForAssistantMessageCount(page, previousCount) {
  await page.waitForFunction(
    (expectedCount) => document.querySelectorAll('.message-thread.assistant').length > expectedCount,
    previousCount,
    { timeout: 30_000 }
  );
}

export async function waitForCurrentStage(page, stage) {
  await ensureProcessPanelVisible(page);
  await page.waitForFunction(
    (expected) => {
      const select = document.querySelector('.process-panel select');
      return select instanceof HTMLSelectElement && select.value === expected;
    },
    stage,
    { timeout: 30_000 }
  );
}

export async function ensureProjectSidebarOpen(page) {
  const sidebar = page.locator('.primary-sidebar');
  if (!(await sidebar.isVisible().catch(() => false))) {
    const projectActivity = page.locator(
      '.activity-button[aria-label="主工作台"], .activity-button[title="主工作台"], .activity-button[aria-label="工程"], .activity-button[title="工程"]'
    ).first();
    if (await projectActivity.isVisible().catch(() => false)) {
      await projectActivity.click();
    }
    await ensureVisible(sidebar);
  }
  const projectActivity = page.locator(
    '.activity-button[aria-label="主工作台"], .activity-button[title="主工作台"], .activity-button[aria-label="工程"], .activity-button[title="工程"]'
  ).first();
  const projectActive = await projectActivity.evaluate((element) => element.classList.contains('active')).catch(() => false);
  if (!projectActive) {
    await projectActivity.click();
  }
  await ensureVisible(sidebar);
}

export async function openDocumentFromTree(page, fileName) {
  await ensureProjectSidebarOpen(page);
  const node = page.locator('.tree-node-file, .tree-item.workbench-pane-item', { hasText: fileName }).first();
  await ensureVisible(node);
  await node.click();
}

export function resolveDeliveryExportFile(exportRoot, fileName) {
  const directPath = path.join(exportRoot, fileName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const extension = path.extname(fileName).slice(1);
  const exportFolders = {
    md: 'markdown',
    txt: 'text',
    pdf: 'pdf'
  };
  const folder = exportFolders[extension];
  if (!folder) {
    return null;
  }

  const nestedPath = path.join(exportRoot, folder, fileName);
  return fs.existsSync(nestedPath) ? nestedPath : null;
}

export async function waitForDeliveryExport(openspecRoot) {
  const exportsRoot = path.join(openspecRoot, 'exports');
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    if (fs.existsSync(exportsRoot)) {
      const exportDirs = fs.readdirSync(exportsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(exportsRoot, entry.name))
        .sort();
      const latest = exportDirs.at(-1);
      if (latest) {
        const complete = Boolean(
          resolveDeliveryExportFile(latest, 'delivery-package.md')
          && resolveDeliveryExportFile(latest, 'delivery-package.txt')
          && resolveDeliveryExportFile(latest, 'delivery-package.pdf')
          && fs.existsSync(path.join(latest, 'manifest.json'))
          && fs.existsSync(path.join(latest, 'openspec', 'roadmap.md'))
        );
        if (complete) {
          return latest;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for deterministic export under: ${exportsRoot}`);
}

export async function prepareWelcomeScreen(page, resetRecent) {
  if (resetRecent) {
    await page.evaluate(async () => {
      await window.api.clearAllRecentProjects();
      await window.api.closeProject();
    });
  } else {
    await page.evaluate(async () => {
      await window.api.closeProject();
    });
  }
  await page.reload();
  await ensureWelcomeScreen(page);
}

export async function reopenFromRecent(page, projectName, screenshotPath) {
  await page.evaluate(async () => {
    await window.api.closeProject();
  });
  await page.reload();
  await ensureWelcomeScreen(page);
  const recentCard = page.locator('.recent-card, .simple-row').filter({ hasText: projectName }).first();
  await ensureVisible(recentCard);
  const openAction = recentCard.locator('.recent-item-primary, .simple-row-actions button:not([disabled])').first();
  await ensureVisible(openAction);
  await openAction.click();
  await ensureVisible(page.locator('.app-shell.view-project .document-pane, .document-header').first());
  await openDocumentFromTree(page, 'roadmap.md');
  await ensureVisible(page.locator('.document-header .panel-kicker, .document-tab.active', { hasText: 'roadmap.md' }).first());
  await page.screenshot({ path: screenshotPath, fullPage: true });
}
