import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

import type { UiContract } from '../../contracts/types.js';
import { applyContractViewport, launchContractApp } from './contract-harness';
import { openActivity } from './ui-compat';

async function mockDialogPaths(app: any, filePaths: string[]) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await app.evaluate(({ dialog }: any, nextPaths: string[]) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: nextPaths,
        });
      }, filePaths);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function scratchDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function openProjectDialog(page: Page) {
  await page.getByTestId('welcome-create-project').click();
  await expect(page.getByTestId('project-template-dialog')).toBeVisible();
}

async function chooseProjectLocation(page: Page, app: any, parentRoot: string) {
  await mockDialogPaths(app, [parentRoot]);
  await page.getByTestId('project-dialog-choose-location').click();
  await expect(page.locator('.project-template-location input')).toHaveValue(parentRoot);
}

async function showProcessPanel(page: Page) {
  await page.evaluate(async () => {
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: settings.theme,
      sidebar: {
        ...settings.sidebar,
        processPanelOpen: true,
        processPanelTab: 'stage',
      },
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      recentTemplates: settings.recentTemplates,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts,
    });
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.locator('.process-panel')).toBeVisible();
}

async function ensureTextEditorVisible(page: Page) {
  const editor = page.locator('textarea.editor').first();
  if (await editor.isVisible().catch(() => false)) {
    return editor;
  }

  await expect(page.locator('.document-pane')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.document-tab-main').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.document-tab-main').first().click();
  await page.waitForTimeout(200);

  // Ctrl+F is a stable built-in path that forces the current text document into source mode.
  await page.keyboard.press('Control+f');
  await expect(editor).toBeVisible({ timeout: 15000 });
  return editor;
}

async function prepareExternalConflict(page: Page) {
  await openActivity(page, 'workbench');
  await expect(page.locator('.app-shell.view-project .document-pane')).toBeVisible({ timeout: 15000 });

  const activeDocumentPath = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return bootstrap.project?.workflow.activeDocumentPath ?? '';
  });

  expect(activeDocumentPath).not.toBe('');

  const editor = await ensureTextEditorVisible(page);
  await editor.fill('# 本地未保存版本\n\n这里保留一份尚未保存的本地修改。\n');

  const beforeMeta = await page.evaluate(async (targetPath) => window.api.getDocumentMeta(targetPath), activeDocumentPath);
  await page.waitForTimeout(1200);
  fs.writeFileSync(activeDocumentPath, '# 外部变更版本\n\n该文档在磁盘上被改写。\n', 'utf8');
  const afterMeta = await page.evaluate(async (targetPath) => window.api.getDocumentMeta(targetPath), activeDocumentPath);
  expect(afterMeta.modifiedAt).toBeGreaterThan(beforeMeta.modifiedAt);

  await page.keyboard.press('Control+Shift+P');
  const commandInput = page.locator('.command-palette input').first();
  await expect(commandInput).toBeVisible();
  await commandInput.fill('doc-check-external');
  await page.locator('.command-palette-item').first().click();
}

function resolveContractTarget(page: Page, contract: UiContract): Locator {
  if (contract.assert.role && contract.assert.name) {
    return page.getByRole(contract.assert.role as Parameters<Page['getByRole']>[0], {
      name: contract.assert.name,
      exact: true,
    }).first();
  }
  if (contract.assert.locator) {
    return page.locator(contract.assert.locator).first();
  }
  throw new Error(`contract ${contract.id} does not define a target locator`);
}

async function prepareActionScenario(contract: UiContract, page: Page) {
  switch (contract.id) {
    case 'UI-ACTION-WELCOME-OPEN-PROJECT-DIALOG':
    case 'UI-ACTION-WELCOME-OPEN-RESOURCE-CENTER':
      return;
    case 'UI-ACTION-PROJECT-DIALOG-OPEN-RESOURCE-CENTER':
      await openProjectDialog(page);
      return;
    case 'UI-ACTION-PROJECT-OPEN-THINKING-CHAIN':
    case 'UI-ACTION-PROJECT-OPEN-RULES-CENTER':
    case 'UI-ACTION-PROJECT-OPEN-SETTINGS':
      await openActivity(page, 'workbench');
      return;
    default:
      throw new Error(`missing action setup for ${contract.id}`);
  }
}

async function assertActionOutcome(contract: UiContract, page: Page) {
  if (contract.assert.routeTarget) {
    await expect(page.locator(contract.assert.routeTarget).first()).toBeVisible({ timeout: 15000 });
  }
  if (contract.assert.forbidden?.length) {
    for (const selector of contract.assert.forbidden) {
      await expect(page.locator(selector).first()).toHaveCount(0);
    }
  }
}

async function prepareStateScenario(contract: UiContract, page: Page, app: any, scratchPaths: string[]) {
  switch (contract.id) {
    case 'UI-STATE-PROJECT-DIALOG-INVALID-NAME-SHOWS-VALIDATION':
    case 'UI-STATE-PROJECT-DIALOG-INVALID-NAME-DISABLES-SUBMIT': {
      const parentRoot = scratchDir('ce-ui-contract-invalid-name-');
      scratchPaths.push(parentRoot);
      await openProjectDialog(page);
      await chooseProjectLocation(page, app, parentRoot);
      await page.getByLabel('工程名称').fill('invalid/project');
      return;
    }
    case 'UI-STATE-PROJECT-DIALOG-EXISTING-TARGET-SHOWS-VALIDATION':
    case 'UI-STATE-PROJECT-DIALOG-EXISTING-TARGET-DISABLES-SUBMIT': {
      const parentRoot = scratchDir('ce-ui-contract-existing-target-');
      scratchPaths.push(parentRoot);
      fs.mkdirSync(path.join(parentRoot, 'existing-project'), { recursive: true });
      await openProjectDialog(page);
      await chooseProjectLocation(page, app, parentRoot);
      await page.getByLabel('工程名称').fill('existing-project');
      return;
    }
    case 'UI-STATE-STAGE-GUARD-DISABLES-CONFIRM':
    case 'UI-STATE-STAGE-GUARD-SHOWS-BLOCKERS':
      await showProcessPanel(page);
      return;
    case 'UI-STATE-CONFLICT-DIALOG-APPEARS-ON-EXTERNAL-CHANGE':
      await prepareExternalConflict(page);
      return;
    default:
      throw new Error(`missing state setup for ${contract.id}`);
  }
}

async function assertStateOutcome(contract: UiContract, page: Page) {
  const target = resolveContractTarget(page, contract);
  if (contract.assert.visible ?? true) {
    await expect(target).toBeVisible({ timeout: 15000 });
  }
  if (typeof contract.assert.enabled === 'boolean') {
    if (contract.assert.enabled) {
      await expect(target).toBeEnabled();
    } else {
      await expect(target).toBeDisabled();
    }
  }
  if (contract.assert.forbidden?.length) {
    for (const selector of contract.assert.forbidden) {
      await expect(page.locator(selector).first()).toHaveCount(0);
    }
  }
}

export async function runActionContract(contract: UiContract) {
  const { app, page, cleanup } = await launchContractApp({ projectMode: contract.precondition.projectMode });

  try {
    await applyContractViewport(page, contract);
    await prepareActionScenario(contract, page);
    const trigger = resolveContractTarget(page, contract);
    await expect(trigger).toBeVisible();
    await trigger.click();
    await assertActionOutcome(contract, page);
  } finally {
    await cleanup(app);
  }
}

export async function runStateContract(contract: UiContract) {
  const scratchPaths: string[] = [];
  const { app, page, cleanup } = await launchContractApp({ projectMode: contract.precondition.projectMode });

  try {
    await applyContractViewport(page, contract);
    await prepareStateScenario(contract, page, app, scratchPaths);
    await assertStateOutcome(contract, page);
  } finally {
    await cleanup(app);
    for (const scratchPath of scratchPaths) {
      fs.rmSync(scratchPath, { recursive: true, force: true });
    }
  }
}
