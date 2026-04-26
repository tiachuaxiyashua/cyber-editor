import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';

import type { UiContract } from '../../contracts/types.js';
import { assertLayoutContract } from './layout-assertions';
import { assertPrototypeEntry, assertPrototypeTargets } from './prototype-reference';
import { openActivity } from './ui-compat';

const pageReadySelectors: Record<string, string> = {
  welcome: '.welcome-screen',
  workbench: '.app-shell.view-project .document-pane',
  'resource-center': '[data-testid="resource-center-page"]',
  'rules-center': '[data-testid="rules-workspace"]',
  settings: '.settings-workspace-page',
  orchestration: '[data-testid="orchestration-workspace"]',
  'thinking-chain': '[data-testid="thinking-chain-page"]',
};

function createElectronEnv(userDataRoot: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined),
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

async function setViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(200);
}

async function waitForPageReady(page: Page, pageId: string) {
  const selector = pageReadySelectors[pageId];
  if (!selector) {
    await page.waitForTimeout(250);
    return;
  }
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 15000 });
}

export async function launchContractApp({ projectMode }: { projectMode: 'none' | 'project' }) {
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-contracts-'));
  const projectRoots: string[] = [];
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(process.cwd()),
    env: createElectronEnv(userDataRoot),
  });

  const page = await app.firstWindow();
  await setViewport(page, 1560, 1040);
  await page.waitForTimeout(900);

  if (projectMode === 'project') {
    const projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-contract-project-'));
    projectRoots.push(projectBase);
    await page.evaluate(async (locationPath) => {
      await window.api.createProject({
        name: 'ui-contracts',
        locationPath,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory',
      });
    }, projectBase);
    await page.reload();
    await page.waitForTimeout(1200);
  }

  return {
    app,
    page,
    async cleanup(instance?: ElectronApplication) {
      await (instance ?? app).close();
      fs.rmSync(userDataRoot, { recursive: true, force: true });
      for (const projectRoot of projectRoots) {
        fs.rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  };
}

export async function applyContractViewport(page: Page, contract: UiContract) {
  const { width, height } = contract.precondition.viewport;
  await setViewport(page, width, height);
}

export async function runtimePageFor(page: Page, contract: UiContract) {
  switch (contract.pageId) {
    case 'welcome':
      await waitForPageReady(page, contract.pageId);
      return;
    case 'workbench':
      await openActivity(page, 'workbench');
      await waitForPageReady(page, contract.pageId);
      return;
    case 'resource-center':
      await openActivity(page, 'resources');
      await waitForPageReady(page, contract.pageId);
      return;
    case 'rules-center':
      await openActivity(page, 'rules');
      await waitForPageReady(page, contract.pageId);
      return;
    case 'settings':
      await openActivity(page, 'settings');
      await waitForPageReady(page, contract.pageId);
      return;
    case 'orchestration':
      await openActivity(page, 'orchestration');
      await waitForPageReady(page, contract.pageId);
      return;
    case 'thinking-chain':
      await openActivity(page, 'thinkingChain');
      await waitForPageReady(page, contract.pageId);
      return;
    default:
      return;
  }
}

async function prepareLayoutScenario(page: Page, contract: UiContract) {
  switch (contract.id) {
    case 'UI-LAYOUT-WORKBENCH-AI-IDLE-COMPACT':
      await page.getByTitle('新建会话').click();
      await expect(page.getByTestId('workbench-conversation-empty')).toBeVisible({ timeout: 15000 });
      return;
    default:
      return;
  }
}

export async function runLayoutContracts(page: Page, contracts: UiContract[]) {
  for (const contract of contracts) {
    await runtimePageFor(page, contract);
    await prepareLayoutScenario(page, contract);
    await assertLayoutContract(page, contract);
  }
}

export function assertPrototypeContractSource(contract: UiContract) {
  assertPrototypeTargets();
  for (const sourceRef of contract.sourceRefs) {
    if (sourceRef.prototypeEntry) {
      assertPrototypeEntry(sourceRef.prototypeEntry);
    }
  }
}
