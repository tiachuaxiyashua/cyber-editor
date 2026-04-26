import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

import type { UiContract } from '../../contracts/types.js';
import { assertNoBlockingAppLogEvents } from './app-log-assertions';
import { openActivity } from './ui-compat';
import {
  assertCompactWorkbenchThreePaneUsable,
  assertFileSwitchFeedbackBeforeArtifactLoad,
} from './human-experience-assertions';

type ExperienceSession = {
  app: ElectronApplication;
  page: Page;
  env: Record<string, string>;
  userDataRoot: string;
  projectBase: string | null;
  projectRootPath: string | null;
  viewport: { width: number; height: number };
  relaunch: () => Promise<void>;
  cleanup: () => Promise<void>;
};

function buildElectronEnv(userDataRoot: string) {
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

async function launchAppInstance(env: Record<string, string>, viewport: { width: number; height: number }) {
  const app = await electron.launch({
    args: ['.'],
    cwd: path.resolve(process.cwd()),
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
  await page.setViewportSize(viewport);
  await page.waitForTimeout(200);
  return { app, page };
}

async function createProject(page: Page, projectBase: string, name: string) {
  await page.evaluate(
    async ({ projectBase, name }: { projectBase: string; name: string }) => {
      await window.api.createProject({
        name,
        locationPath: projectBase,
        directoryMode: 'create-in-parent',
        templateId: 'software-factory',
      });
    },
    { projectBase, name },
  );
  await page.waitForTimeout(250);
  await page.reload();
  await page.waitForTimeout(1200);

  const rootPath = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return bootstrap.project?.rootPath ?? null;
  });

  expect(rootPath).toBeTruthy();
  return rootPath;
}

export async function launchExperienceSession(contract: UiContract, projectName = 'ui-experience-contract'): Promise<ExperienceSession> {
  const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-experience-'));
  const env = buildElectronEnv(userDataRoot);
  const viewport = contract.precondition.viewport;
  const runtime = {
    ...(await launchAppInstance(env, viewport)),
    env,
    userDataRoot,
    projectBase: null as string | null,
    projectRootPath: null as string | null,
    viewport,
    relaunch: async () => {},
    cleanup: async () => {},
  } as ExperienceSession;

  if (contract.precondition.projectMode === 'project') {
    runtime.projectBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-ui-experience-project-'));
    runtime.projectRootPath = await createProject(runtime.page, runtime.projectBase, projectName);
  }

  runtime.relaunch = async () => {
    await runtime.app.close();
    const relaunched = await launchAppInstance(runtime.env, runtime.viewport);
    runtime.app = relaunched.app;
    runtime.page = relaunched.page;
    if (runtime.projectRootPath) {
      await runtime.page.evaluate(async (rootPath) => {
        await window.api.openProject(rootPath);
      }, runtime.projectRootPath);
      await runtime.page.waitForTimeout(250);
      await runtime.page.reload();
      await runtime.page.waitForTimeout(1200);
    }
  };

  runtime.cleanup = async () => {
    await runtime.app.close();
    if (runtime.projectBase) {
      fs.rmSync(runtime.projectBase, { recursive: true, force: true });
    }
    fs.rmSync(runtime.userDataRoot, { recursive: true, force: true });
  };

  return runtime;
}

export async function dragHorizontalResizer(page: Page, selector: string, deltaX: number, index = 0) {
  const handle = page.locator(selector).nth(index);
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`missing resizer: ${selector}#${index}`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
}

export async function prepareWorkbenchLatencyFixture(page: Page, rootPath: string) {
  await page.evaluate(async (targetRoot: string) => {
    await window.api.createFile(targetRoot, 'alpha-latency.md');
    await window.api.createFile(targetRoot, 'beta-latency.md');
  }, rootPath);
  await page.reload();
  await page.waitForTimeout(1000);
  return {
    targetName: 'beta-latency.md',
  };
}

export async function prepareThinkingChainComplexFixture(page: Page, rootPath: string) {
  const requirementDir = path.join(rootPath, '01-requirements');
  const requirementDoc = path.join(requirementDir, '01-原始需求.md');
  const itineraryDoc = await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '02-行程骨架.md'), requirementDir);
  const budgetDoc = await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '03-预算策略.md'), requirementDir);
  const visaDoc = await page.evaluate(async (parentPath) => window.api.createFile(parentPath, '04-签证清单.md'), requirementDir);

  await page.evaluate(
    async ({
      requirementDoc,
      itineraryDoc,
      budgetDoc,
      visaDoc,
    }: {
      requirementDoc: string;
      itineraryDoc: string;
      budgetDoc: string;
      visaDoc: string;
    }) => {
      await window.api.saveDocument(requirementDoc, '# 原始需求\n\n- 核心目标：做一个欧洲旅行策划工作台\n');
      await window.api.saveDocument(itineraryDoc, '# 行程骨架\n\n- 国家筛选\n- 城市选择\n- 每日路线\n');
      await window.api.saveDocument(budgetDoc, '# 预算策略\n\n- 先锁定机酒上限\n- 再拆每日预算\n');
      await window.api.saveDocument(visaDoc, '# 签证清单\n\n- 材料列表\n- 递交节点\n');

      await window.api.recordExternalDocumentChange(requirementDoc, '# 原始需求\n', '# 原始需求\n\n- 核心目标：做一个欧洲旅行策划工作台\n');
      await window.api.recordExternalDocumentChange(itineraryDoc, '# 行程骨架\n', '# 行程骨架\n\n- 国家筛选\n- 城市选择\n- 每日路线\n');
      await window.api.recordExternalDocumentChange(budgetDoc, '# 预算策略\n', '# 预算策略\n\n- 先锁定机酒上限\n- 再拆每日预算\n');
      await window.api.recordExternalDocumentChange(visaDoc, '# 签证清单\n', '# 签证清单\n\n- 材料列表\n- 递交节点\n');

      await window.api.saveSessions([
        {
          id: 'session-complex',
          title: '欧洲旅行策划',
          stage: 'discover',
          summary: '围绕欧洲旅行策划工作台逐步收敛为结构化文档与规划流程。',
          pinned: false,
          archived: false,
          projectDocumentPaths: [requirementDoc, itineraryDoc, budgetDoc, visaDoc],
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: '核心想法：做一个欧洲旅行策划工作台。',
              createdAt: '2026-04-18T11:00:00.000Z',
            },
            {
              id: 'm2',
              role: 'assistant',
              content: '目标用户：第一次自由行的用户，需要从模糊目的地想法快速收敛出完整计划。',
              createdAt: '2026-04-18T11:00:10.000Z',
            },
            {
              id: 'm3',
              role: 'assistant',
              content: '风险约束：预算必须可控、计划需要离线可读、切换阶段不能太慢。',
              createdAt: '2026-04-18T11:00:20.000Z',
            },
            {
              id: 'm4',
              role: 'assistant',
              content: '行程骨架：先确定国家与天数，再做城市排序和每日路线。',
              createdAt: '2026-04-18T11:00:30.000Z',
            },
            {
              id: 'm5',
              role: 'assistant',
              content: '预算策略：先锁定机酒上限，再分配每日预算，这样能满足风险约束。',
              createdAt: '2026-04-18T11:00:40.000Z',
            },
            {
              id: 'm6',
              role: 'assistant',
              content: '工作壳：以编辑器/规划工作台为外壳，同时承接目标用户、预算约束和行程骨架。',
              createdAt: '2026-04-18T11:00:50.000Z',
            },
            {
              id: 'm7',
              role: 'assistant',
              content: '探索方向：是否支持多人协同分工制定每日路线。',
              createdAt: '2026-04-18T11:01:00.000Z',
            },
            {
              id: 'm8',
              role: 'assistant',
              content: '探索方向：是否允许自动生成签证材料准备清单。',
              createdAt: '2026-04-18T11:01:10.000Z',
            },
            {
              id: 'm9',
              role: 'user',
              content: '废弃方向：直接做纯聊天机器人界面。',
              createdAt: '2026-04-18T11:01:20.000Z',
            },
          ],
        },
      ]);
      await window.api.refreshProject();
    },
    { requirementDoc, itineraryDoc, budgetDoc, visaDoc },
  );

  await page.waitForTimeout(1000);
  return {
    sessionId: 'session-complex',
    budgetDocName: '文档：03-预算策略.md',
    shellLabel: '工作壳',
    ideaDocName: '文档：01-原始需求.md',
  };
}

async function fitThinkingMapViewIfPresent(page: Page) {
  const fitViewButton = page.getByRole('button', { name: /重新布局|Fit View/ }).first();
  if (!await fitViewButton.count()) {
    return;
  }
  if (!await fitViewButton.isVisible().catch(() => false)) {
    return;
  }
  await fitViewButton.click();
  await page.waitForTimeout(300);
}

function getLatencyBudget(contract: UiContract) {
  if (typeof contract.assert.latencyMs !== 'number') {
    throw new Error(`latency contract ${contract.id} is missing assert.latencyMs`);
  }
  return contract.assert.latencyMs;
}

async function measureFirstInteractive(
  page: Page,
  selectors: string[],
  timeoutMs: number,
  action: () => Promise<void>,
) {
  await page.evaluate(({ selectors, timeoutMs }) => {
    const runtimeWindow = window as typeof window & {
      __cyberFirstInteractiveProbe?: Promise<{ readyMs?: number; error?: string; diagnostics?: unknown }>;
    };
    runtimeWindow.__cyberFirstInteractiveProbe = new Promise((resolve) => {
      const startedAt = performance.now();
      const isVisible = (element: Element | null) => {
        if (!element) return false;
        const box = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);
        return box.width > 0
          && box.height > 0
          && styles.visibility !== 'hidden'
          && styles.display !== 'none';
      };
      const diagnostics = () => selectors.map((selector) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return {
          selector,
          found: Boolean(element),
          visible: isVisible(element),
          width: box?.width ?? 0,
          height: box?.height ?? 0,
          text: (element?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        };
      });
      const ready = () => selectors.every((selector) => isVisible(document.querySelector(selector)));

      let settled = false;
      let timeoutHandle: number | null = null;
      let observer: MutationObserver | null = null;
      const settle = (value: { readyMs?: number; error?: string; diagnostics?: unknown }) => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        if (timeoutHandle) {
          window.clearTimeout(timeoutHandle);
        }
        resolve(value);
      };
      const checkReady = () => {
        if (ready()) {
          settle({ readyMs: performance.now() - startedAt });
        }
      };

      observer = new MutationObserver(checkReady);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      checkReady();
      timeoutHandle = window.setTimeout(() => {
        settle({
          error: `first interactive selectors were not visible within ${timeoutMs}ms`,
          diagnostics: diagnostics(),
        });
      }, timeoutMs);
    });
  }, { selectors, timeoutMs });

  await action();
  const result = await page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __cyberFirstInteractiveProbe?: Promise<{ readyMs?: number; error?: string; diagnostics?: unknown }>;
    };
    return runtimeWindow.__cyberFirstInteractiveProbe;
  });
  if (!result) {
    throw new Error('first interactive probe was not installed');
  }
  if (result.error) {
    throw new Error(`${result.error}\nFirst interactive diagnostics: ${JSON.stringify(result.diagnostics, null, 2)}`);
  }
  return typeof result.readyMs === 'number' ? result.readyMs : timeoutMs;
}

async function pickVisibleDraggableThinkingNode(page: Page, minDragDeltaY: number, preferredLabel?: string) {
  const shell = page.locator('.thinking-chain-canvas-shell');
  const shellBox = await shell.boundingBox();
  if (!shellBox) {
    throw new Error('thinking-chain canvas shell bounding box missing');
  }

  const candidates = await page.locator('.thinking-chain-node').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        semanticKey: element.getAttribute('data-node-semantic-key') ?? '',
        text: element.textContent ?? '',
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
      };
    }),
  );

  const safeCandidates = candidates.filter((candidate) =>
    candidate.semanticKey
    && candidate.x >= shellBox.x + 24
    && candidate.right <= shellBox.x + shellBox.width - 24
    && candidate.y >= shellBox.y + 24
    && candidate.bottom <= shellBox.y + shellBox.height - (minDragDeltaY + 24),
  );

  const preferredCandidate = preferredLabel
    ? safeCandidates.find((candidate) => candidate.text.includes(preferredLabel))
    : undefined;
  const fallbackCandidate = safeCandidates[0] ?? candidates.find((candidate) => candidate.semanticKey) ?? null;
  const chosen = preferredCandidate ?? fallbackCandidate;
  if (!chosen) {
    throw new Error('no draggable thinking-chain node found');
  }
  return chosen;
}

async function runLatencyCase(contract: UiContract) {
  const runtime = await launchExperienceSession(contract, 'ui-latency-contract');

  try {
    switch (contract.id) {
      case 'UI-LATENCY-WORKBENCH-FILE-SWITCH-FEEDBACK': {
        expect(runtime.projectRootPath).toBeTruthy();
        if (!runtime.projectRootPath) {
          throw new Error('workbench latency contract requires a project root');
        }
        const fixture = await prepareWorkbenchLatencyFixture(runtime.page, runtime.projectRootPath);
        const latencyMs = getLatencyBudget(contract);
        const feedbackMs = await assertFileSwitchFeedbackBeforeArtifactLoad(runtime.page, fixture.targetName, { timeoutMs: latencyMs });
        expect(
          feedbackMs,
          `${contract.id} file switch feedback took ${Math.round(feedbackMs)}ms, budget ${latencyMs}ms`,
        ).toBeLessThanOrEqual(latencyMs);
        break;
      }
      case 'UI-LATENCY-SETTINGS-FIRST-INTERACTIVE': {
        const latencyMs = getLatencyBudget(contract);
        const firstInteractiveMs = await measureFirstInteractive(
          runtime.page,
          ['.settings-workspace-page', '.settings-detail-grid'],
          latencyMs,
          async () => { await openActivity(runtime.page, 'settings', { settleMs: 0 }); },
        );
        expect(
          firstInteractiveMs,
          `${contract.id} settings first interactive took ${Math.round(firstInteractiveMs)}ms, budget ${latencyMs}ms`,
        ).toBeLessThanOrEqual(latencyMs);
        await Promise.all([
          expect(runtime.page.locator('.settings-workspace-page')).toBeVisible(),
          expect(runtime.page.locator('.settings-detail-grid')).toBeVisible(),
        ]);
        break;
      }
      case 'UI-LATENCY-THINKING-CHAIN-FIRST-INTERACTIVE': {
        expect(runtime.projectRootPath).toBeTruthy();
        if (!runtime.projectRootPath) {
          throw new Error('thinking-chain latency contract requires a project root');
        }
        await prepareThinkingChainComplexFixture(runtime.page, runtime.projectRootPath);
        const latencyMs = getLatencyBudget(contract);
        const firstInteractiveMs = await measureFirstInteractive(
          runtime.page,
          ['[data-testid="thinking-chain-page"]', '.thinking-map-detail-resizer'],
          latencyMs,
          async () => { await openActivity(runtime.page, 'thinkingChain', { settleMs: 0 }); },
        );
        expect(
          firstInteractiveMs,
          `${contract.id} thinking chain first interactive took ${Math.round(firstInteractiveMs)}ms, budget ${latencyMs}ms`,
        ).toBeLessThanOrEqual(latencyMs);
        await Promise.all([
          expect(runtime.page.getByTestId('thinking-chain-page')).toBeVisible(),
          expect(runtime.page.locator('.thinking-map-detail-resizer')).toBeVisible(),
        ]);
        break;
      }
      default:
        throw new Error(`missing latency scenario for ${contract.id}`);
    }
    assertNoBlockingAppLogEvents(runtime.env.CYBER_EDITOR_USER_DATA, contract.id);
  } finally {
    await runtime.cleanup();
  }
}

async function runManipulationCase(contract: UiContract) {
  const runtime = await launchExperienceSession(contract, 'ui-manipulation-contract');

  try {
    switch (contract.id) {
      case 'UI-MANIPULATION-WORKBENCH-PANE-WIDTHS-PERSIST-REOPEN': {
        await expect(runtime.page.locator('.app-shell.view-project')).toBeVisible();
        await dragHorizontalResizer(runtime.page, '.resizer', -120, 0);
        await dragHorizontalResizer(runtime.page, '.resizer', -100, 1);
        await runtime.page.waitForTimeout(240);

        const leftBefore = (await runtime.page.locator('.primary-sidebar').boundingBox())?.width ?? 0;
        const rightBefore = (await runtime.page.locator('.context-pane').boundingBox())?.width ?? 0;
        expect(leftBefore).toBeGreaterThan(180);
        expect(rightBefore).toBeGreaterThan(260);

        await runtime.relaunch();

        const leftAfter = (await runtime.page.locator('.primary-sidebar').boundingBox())?.width ?? 0;
        const rightAfter = (await runtime.page.locator('.context-pane').boundingBox())?.width ?? 0;
        expect(Math.abs(leftAfter - leftBefore)).toBeLessThanOrEqual(18);
        expect(Math.abs(rightAfter - rightBefore)).toBeLessThanOrEqual(18);
        break;
      }
      case 'UI-MANIPULATION-WORKBENCH-COMPACT-MIN-WIDTHS': {
        await expect(runtime.page.locator('.app-shell.view-project')).toBeVisible();
        await dragHorizontalResizer(runtime.page, '.resizer', -120, 0);
        await dragHorizontalResizer(runtime.page, '.resizer', -100, 1);
        await runtime.page.waitForTimeout(240);
        await runtime.page.setViewportSize({ width: 900, height: 760 });
        await runtime.page.waitForTimeout(400);
        await assertCompactWorkbenchThreePaneUsable(runtime.page);
        break;
      }
      case 'UI-MANIPULATION-THINKING-DETAIL-RESIZER': {
        expect(runtime.projectRootPath).toBeTruthy();
        if (!runtime.projectRootPath) {
          throw new Error('thinking detail resizer contract requires a project root');
        }
        const fixture = await prepareThinkingChainComplexFixture(runtime.page, runtime.projectRootPath);
        await openActivity(runtime.page, 'thinkingChain');
        await expect(runtime.page.getByTestId('thinking-chain-page')).toBeVisible();
        await runtime.page.locator('.thinking-chain-node', { hasText: fixture.ideaDocName }).first().click();
        const detailPane = runtime.page.locator('.thinking-map-detail-pane');
        await expect(detailPane).toBeVisible();
        const detailWidthBefore = await detailPane.evaluate((node) => node.getBoundingClientRect().width);
        await dragHorizontalResizer(runtime.page, '.thinking-map-detail-resizer', -120);
        await runtime.page.waitForTimeout(200);
        const detailWidthAfter = await detailPane.evaluate((node) => node.getBoundingClientRect().width);
        expect(detailWidthAfter - detailWidthBefore).toBeGreaterThan(80);
        break;
      }
      default:
        throw new Error(`missing manipulation scenario for ${contract.id}`);
    }
    assertNoBlockingAppLogEvents(runtime.env.CYBER_EDITOR_USER_DATA, contract.id);
  } finally {
    await runtime.cleanup();
  }
}

async function runGraphCase(contract: UiContract) {
  const runtime = await launchExperienceSession(contract, 'ui-graph-contract');

  try {
    expect(runtime.projectRootPath).toBeTruthy();
    if (!runtime.projectRootPath) {
      throw new Error('graph contracts require a project root');
    }

    const fixture = await prepareThinkingChainComplexFixture(runtime.page, runtime.projectRootPath);
    await openActivity(runtime.page, 'thinkingChain');
    await expect(runtime.page.getByTestId('thinking-chain-page')).toBeVisible();

    switch (contract.id) {
      case 'UI-GRAPH-THINKING-MAP-DEFAULT-COLUMNS-AND-MATERIALIZATION': {
        await fitThinkingMapViewIfPresent(runtime.page);

        const nodeLocator = runtime.page.locator('.thinking-chain-node');
        expect(await nodeLocator.count()).toBeGreaterThanOrEqual(9);
        await expect(runtime.page.locator('.thinking-map-edge')).not.toHaveCount(0);
        await expect(runtime.page.locator('.thinking-chain-node', { hasText: fixture.ideaDocName })).toHaveCount(1);
        await expect(runtime.page.locator('.thinking-chain-node', { hasText: fixture.budgetDocName })).toHaveCount(1);

        const nodePositions = await nodeLocator.evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              text: element.textContent ?? '',
              left: Math.round(rect.left),
            };
          }),
        );
        const uniqueColumns = [...new Set(nodePositions.map((item) => Math.round(item.left / 160)))];
        expect(uniqueColumns.length).toBeGreaterThanOrEqual(6);

        const snapshot = await runtime.page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
        const budgetNode = snapshot?.nodes.find((node) => node.stage !== 'materialized' && node.title.includes('预算策略'));
        const budgetDocNode = snapshot?.nodes.find((node) => node.artifactPath?.includes('03-预算策略.md'));
        const budgetDocInbound = snapshot?.edges.filter((edge) => edge.targetId === budgetDocNode?.id && edge.kind === 'materializes') ?? [];
        expect(budgetNode).toBeTruthy();
        expect(budgetDocNode).toBeTruthy();
        expect(budgetDocInbound.some((edge) => edge.sourceId === budgetNode?.id)).toBe(true);
        break;
      }
      case 'UI-GRAPH-THINKING-MAP-ZOOM-CLAMP-STAYS-STABLE': {
        const shell = runtime.page.locator('.thinking-chain-canvas-shell');
        const viewport = runtime.page.locator('.thinking-chain-canvas-viewport');
        await expect(shell).toHaveAttribute('data-zoom', '1');
        const viewportWidthBeforeZoom = await viewport.evaluate((node) => node.clientWidth);
        const activeNode = runtime.page.locator('.thinking-chain-node').first();
        const sizeAtOne = await activeNode.boundingBox();

        await shell.hover();
        await runtime.page.mouse.wheel(0, -400);
        await expect(shell).not.toHaveAttribute('data-zoom', '1');
        const viewportWidthAfterFirstZoom = await viewport.evaluate((node) => node.clientWidth);
        expect(Math.abs(viewportWidthAfterFirstZoom - viewportWidthBeforeZoom)).toBeLessThanOrEqual(2);

        for (let index = 0; index < 12; index += 1) {
          await runtime.page.mouse.wheel(0, -600);
        }
        await expect(shell).toHaveAttribute('data-zoom', '2.4');

        const scrollAtClampBefore = await shell.evaluate((node) => {
          node.scrollLeft = 240;
          node.scrollTop = 180;
          return { left: node.scrollLeft, top: node.scrollTop };
        });
        await runtime.page.mouse.wheel(0, -800);
        const scrollAtClampAfter = await shell.evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
        expect(scrollAtClampAfter).toEqual(scrollAtClampBefore);

        for (let index = 0; index < 24; index += 1) {
          await runtime.page.mouse.wheel(0, 600);
        }
        await expect(shell).toHaveAttribute('data-zoom', '0.35');
        const sizeAtMin = await activeNode.boundingBox();
        expect(sizeAtOne).toBeTruthy();
        expect(sizeAtMin).toBeTruthy();
        const ratioAtOne = sizeAtOne ? sizeAtOne.width / sizeAtOne.height : 0;
        const ratioAtMin = sizeAtMin ? sizeAtMin.width / sizeAtMin.height : 0;
        expect(Math.abs(ratioAtOne - ratioAtMin)).toBeLessThan(0.2);
        break;
      }
      case 'UI-GRAPH-THINKING-MAP-NODE-DRAG-PERSISTS-RELOAD': {
        await fitThinkingMapViewIfPresent(runtime.page);
        const minDragDeltaY = typeof contract.assert.graph?.minDragDeltaY === 'number'
          ? contract.assert.graph.minDragDeltaY
          : 80;
        const preferredLabel = typeof contract.assert.graph?.draggedNodeLabel === 'string'
          ? contract.assert.graph.draggedNodeLabel
          : fixture.shellLabel;
        const targetNode = await pickVisibleDraggableThinkingNode(runtime.page, minDragDeltaY, preferredLabel);
        const shellNode = runtime.page.locator(`.thinking-chain-node[data-node-semantic-key="${targetNode.semanticKey}"]`).first();
        const shellSemanticKey = await shellNode.getAttribute('data-node-semantic-key');
        expect(shellSemanticKey).toBeTruthy();
        const beforeDrag = await shellNode.boundingBox();
        expect(beforeDrag).toBeTruthy();
        if (!beforeDrag) {
          throw new Error('working shell node bounding box missing');
        }
        const shellBox = await runtime.page.locator('.thinking-chain-canvas-shell').boundingBox();
        if (!shellBox) {
          throw new Error('thinking-chain canvas shell bounding box missing');
        }
        const dragStartX = beforeDrag.x + beforeDrag.width / 2;
        const dragStartY = beforeDrag.y + beforeDrag.height / 2;
        const dragEndY = Math.min(dragStartY + minDragDeltaY + 32, shellBox.y + shellBox.height - 20);
        await runtime.page.mouse.move(dragStartX, dragStartY);
        await runtime.page.mouse.down();
        await runtime.page.mouse.move(dragStartX, dragEndY, { steps: 16 });
        await runtime.page.mouse.up();
        await runtime.page.waitForTimeout(400);

        const shellAfterDrag = await shellNode.boundingBox();
        expect(shellAfterDrag).toBeTruthy();
        expect(Math.abs((shellAfterDrag?.y ?? 0) - beforeDrag.y)).toBeGreaterThan(minDragDeltaY);
        await expect.poll(async () => {
          const snapshotAfterDrag = await runtime.page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
          const draggedShellNode = snapshotAfterDrag?.nodes.find((node) => node.semanticKey === shellSemanticKey);
          return draggedShellNode?.manualPosition?.y ?? 0;
        }, { timeout: 10_000 }).toBeGreaterThan(0);

        await runtime.page.reload();
        await runtime.page.waitForTimeout(1000);
        await openActivity(runtime.page, 'thinkingChain');
        await fitThinkingMapViewIfPresent(runtime.page);

        const shellAfterReloadNode = runtime.page.locator(`.thinking-chain-node[data-node-semantic-key="${shellSemanticKey}"]`).first();
        const shellAfterReload = await shellAfterReloadNode.boundingBox();
        expect(shellAfterReload).toBeTruthy();
        expect(Math.abs((shellAfterReload?.y ?? 0) - (shellAfterDrag?.y ?? 0))).toBeLessThan(30);

        const snapshotAfterReload = await runtime.page.evaluate(async () => await window.api.getThinkingChain('session-complex'));
        const reopenedShellNode = snapshotAfterReload?.nodes.find((node) => node.semanticKey === shellSemanticKey);
        expect(reopenedShellNode?.manualPosition?.y ?? 0).toBeGreaterThan(0);
        break;
      }
      default:
        throw new Error(`missing graph scenario for ${contract.id}`);
    }
    assertNoBlockingAppLogEvents(runtime.env.CYBER_EDITOR_USER_DATA, contract.id);
  } finally {
    await runtime.cleanup();
  }
}

export async function runExperienceContract(contract: UiContract) {
  switch (contract.kind) {
    case 'latency':
      await runLatencyCase(contract);
      return;
    case 'manipulation':
      await runManipulationCase(contract);
      return;
    case 'graph':
      await runGraphCase(contract);
      return;
    default:
      throw new Error(`unsupported experience contract kind: ${contract.kind}`);
  }
}
