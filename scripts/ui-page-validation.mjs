import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'output', 'playwright', 'ui-page-validation');
const requestedPages = parseRequestedPages(process.argv.slice(2));

function parseRequestedPages(argv) {
  const pageArg = argv.find((item) => item.startsWith('--page='));
  if (!pageArg) {
    return null;
  }

  const names = pageArg
    .slice('--page='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return names.length ? new Set(names) : null;
}

function shouldCapture(pageId) {
  return !requestedPages || requestedPages.has(pageId);
}

function buildElectronEnv(userDataRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined)
  );
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

async function setWindowBounds(app, width, height) {
  await app.evaluate(
    ({ BrowserWindow }, bounds) => {
      BrowserWindow.getAllWindows()[0].setBounds(bounds);
    },
    { width, height }
  );
}

async function waitForApp(page, delay = 1000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(delay);
}

async function saveLayout(page, activityView, overrides = {}) {
  await page.evaluate(async ({ activityView, overrides }) => {
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: settings.theme,
      sidebar: {
        ...settings.sidebar,
        activityView,
        ...overrides
      },
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      recentTemplates: settings.recentTemplates,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts
    });
  }, { activityView, overrides });
}

async function reloadIntoView(page, activityView, overrides = {}) {
  await saveLayout(page, activityView, overrides);
  await page.reload();
  await waitForApp(page, 1200);
}

async function createProject(page, basePath, name) {
  await page.evaluate(async ({ basePath, name }) => {
    await window.api.createProject({
      name,
      locationPath: basePath,
      directoryMode: 'create-in-parent',
      templateId: 'software-factory'
    });
  }, { basePath, name });
  await waitForApp(page, 1200);
  return page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return bootstrap.project?.rootPath ?? '';
  });
}

async function seedProjectContent(page, rootPath) {
  const requirementsRoot = path.join(rootPath, '01-requirements');
  const docPath = await page.evaluate(async (requirementsRoot) => {
    const newPath = await window.api.createFile(requirementsRoot, 'ui-note.md');
    await window.api.saveDocument(
      newPath,
      '# UI 校验记录\n\n- 欢迎页\n- 主工作台\n- 思路地图\n- 流编排\n'
    );
    return newPath;
  }, requirementsRoot);

  await page.evaluate(async ({ docPath }) => {
    const bootstrap = await window.api.bootstrapLoad();
    const markdownPaths = [];
    const walk = (nodes) => {
      for (const node of nodes ?? []) {
        if (node.type === 'file' && node.name.toLowerCase().endsWith('.md')) {
          markdownPaths.push(node.path);
        }
        if (node.children?.length) {
          walk(node.children);
        }
      }
    };
    walk(bootstrap.project?.tree ?? []);
    const targetPath = markdownPaths[0] ?? docPath;

    await window.api.saveSessions([
      {
        id: 'session-visual-1',
        title: 'UI 结构回收与网页版对齐',
        stage: 'discover',
        summary: '聚焦欢迎页、主工作台、思路地图和编排页的统一排版。',
        pinned: false,
        archived: false,
        target: {
          targetType: 'project-doc',
          targetId: targetPath
        },
        projectDocumentPaths: [targetPath],
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: '先把 UI 方向收回到网页原型阶段，不再直接改产品。',
            createdAt: '2026-04-20T08:00:00.000Z'
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: '收到。先统一欢迎页、主工作台、思路地图、流编排的骨架，再逐页补功能入口。',
            createdAt: '2026-04-20T08:01:00.000Z'
          },
          {
            id: 'msg-3',
            role: 'assistant',
            content: '关键约束：左侧边栏统一、欢迎页两列自滚动、编排页保留真实画布实现。',
            createdAt: '2026-04-20T08:02:00.000Z'
          },
          {
            id: 'msg-4',
            role: 'user',
            content: '好的，逐页截图验证调整。',
            createdAt: '2026-04-20T08:03:00.000Z'
          }
        ]
      }
    ]);
    await window.api.refreshProject();
  }, { docPath });

  await waitForApp(page, 1000);
  return docPath;
}

async function seedWelcomeRecents(page, projectRoots) {
  const templateIds = await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    return bootstrap.templates.slice(0, 3).map((item) => item.id);
  });

  await page.evaluate(async ({ projectRoots, templateIds }) => {
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: settings.theme,
      sidebar: {
        ...settings.sidebar,
        activityView: 'project',
        leftCollapsed: false,
        rightCollapsed: false
      },
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: [
        {
          rootPath: projectRoots[0],
          name: 'AI 知识底座升级',
          lastOpenedAt: '2026-04-20T09:40:00.000Z',
          available: true
        },
        {
          rootPath: projectRoots[1],
          name: '软件工厂模板重构',
          lastOpenedAt: '2026-04-20T08:25:00.000Z',
          available: true
        },
        {
          rootPath: projectRoots[2],
          name: '平台需求闭环验证',
          lastOpenedAt: '2026-04-19T20:10:00.000Z',
          available: true
        }
      ],
      recentTemplates: templateIds,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts
    });
  }, { projectRoots, templateIds });
}

async function seedDraftSnapshots(page) {
  await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    const templatePackage = await window.api.getTemplatePackage('software-factory');
    if (!bootstrap.platform || !bootstrap.runtimeTemplate || !templatePackage) {
      throw new Error('Missing bootstrap assets for draft snapshot seeding.');
    }

    const sharedSnapshot = {
      platform: bootstrap.platform,
      runtimeTemplate: bootstrap.runtimeTemplate,
      flowHistories: {},
      sessions: [],
      activeSessionId: undefined,
      templatePackage
    };

    await window.api.saveDraftOrchestration({
      id: 'draft-ui-shell-1',
      name: '软件工厂 UI 整理草稿',
      updatedAt: '2026-04-20T09:15:00.000Z',
      ...sharedSnapshot
    });

    await window.api.saveDraftOrchestration({
      id: 'draft-rules-loop-1',
      name: '规则中心回写草稿',
      updatedAt: '2026-04-19T18:40:00.000Z',
      ...sharedSnapshot
    });
  });
}

async function openProjectAt(page, rootPath) {
  await page.evaluate(async (rootPath) => {
    await window.api.openProject(rootPath);
  }, rootPath);
  await waitForApp(page, 1200);
}

async function prepareWorkbench(page, rootPath) {
  await openProjectAt(page, rootPath);
  await page.evaluate(async () => {
    const bootstrap = await window.api.bootstrapLoad();
    const firstMarkdown = [];
    const walk = (nodes) => {
      for (const node of nodes ?? []) {
        if (node.type === 'file' && node.name.toLowerCase().endsWith('.md')) {
          firstMarkdown.push(node.path);
        }
        if (node.children?.length) {
          walk(node.children);
        }
      }
    };
    walk(bootstrap.project?.tree ?? []);
    if (firstMarkdown[0]) {
      await window.api.setActiveDocument(firstMarkdown[0]);
    }
    const settings = await window.api.getSettings();
    await window.api.saveSettings({
      theme: settings.theme,
      sidebar: {
        ...settings.sidebar,
        activityView: 'project',
        leftCollapsed: false,
        rightCollapsed: false,
        processPanelOpen: false
      },
      activeProviderProfileId: settings.activeProviderProfileId,
      recentProjects: settings.recentProjects,
      recentTemplates: settings.recentTemplates,
      recentResources: settings.recentResources,
      recentDrafts: settings.recentDrafts
    });
  });
  await page.reload();
  await waitForApp(page, 1400);
}

async function capturePage(page, fileName, rectSelectors) {
  await page.evaluate(() => {
    let styleTag = document.getElementById('__ui_validation_screenshot_mode__');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = '__ui_validation_screenshot_mode__';
      styleTag.textContent = `
        html[data-screenshot-mode="true"] *,
        html[data-screenshot-mode="true"] *::before,
        html[data-screenshot-mode="true"] *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
        html[data-screenshot-mode="true"] body {
          pointer-events: none !important;
        }
      `;
      document.head.append(styleTag);
    }

    document.documentElement.setAttribute('data-screenshot-mode', 'true');
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  });
  await page.waitForTimeout(120);

  await page.screenshot({
    path: path.join(outputDir, `${fileName}.png`),
    fullPage: false
  });

  const metrics = await page.evaluate((rectSelectors) => {
    const queryRect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    const activityButtons = Array.from(document.querySelectorAll('.activity-bar .activity-button')).map((button) => ({
      title: button.getAttribute('title'),
      disabled: button.hasAttribute('disabled'),
      active: button.classList.contains('active')
    }));

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      shellClass: document.querySelector('.app-shell')?.className ?? '',
      activityButtons,
      rects: Object.fromEntries(
        Object.entries(rectSelectors).map(([key, selector]) => [key, queryRect(selector)])
      )
    };
  }, rectSelectors);

  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-screenshot-mode');
  });

  return metrics;
}

function rectRight(rect) {
  return rect.x + rect.width;
}

function rectBottom(rect) {
  return rect.y + rect.height;
}

function hasRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function createCheck(ok, code, message, details = undefined) {
  return {
    ok,
    code,
    message,
    ...(details ? { details } : {})
  };
}

function pushCheck(checks, ok, code, message, details = undefined) {
  checks.push(createCheck(Boolean(ok), code, message, details));
}

function requireRect(checks, rects, key, label = key) {
  const rect = rects[key] ?? null;
  pushCheck(
    checks,
    hasRect(rect),
    `${key}-present`,
    `${label} 可见且有有效尺寸`,
    rect ? { rect } : undefined
  );
  return hasRect(rect) ? rect : null;
}

function pushRangeCheck(checks, value, min, max, code, label) {
  pushCheck(
    checks,
    value >= min && value <= max,
    code,
    `${label} 位于 ${min}-${max}px`,
    { value, min, max }
  );
}

function pushMinCheck(checks, value, min, code, label) {
  pushCheck(
    checks,
    value >= min,
    code,
    `${label} 不小于 ${min}px`,
    { value, min }
  );
}

function pushApproxCheck(checks, value, expected, tolerance, code, label) {
  pushCheck(
    checks,
    Math.abs(value - expected) <= tolerance,
    code,
    `${label} 与期望 ${expected}px 的偏差不超过 ${tolerance}px`,
    { value, expected, tolerance }
  );
}

function pushEdgeAlignCheck(checks, left, right, tolerance, code, label) {
  pushCheck(
    checks,
    Math.abs(left - right) <= tolerance,
    code,
    `${label} 边缘对齐，允许误差 ${tolerance}px`,
    { left, right, tolerance }
  );
}

function pushHorizontalGapCheck(checks, leftRect, rightRect, minGap, maxGap, code, label) {
  const gap = rightRect.x - rectRight(leftRect);
  pushCheck(
    checks,
    gap >= minGap && gap <= maxGap,
    code,
    `${label} 横向间距位于 ${minGap}-${maxGap}px`,
    { gap, minGap, maxGap }
  );
}

function pushVerticalGapCheck(checks, topRect, bottomRect, minGap, maxGap, code, label) {
  const gap = bottomRect.y - rectBottom(topRect);
  pushCheck(
    checks,
    gap >= minGap && gap <= maxGap,
    code,
    `${label} 纵向间距位于 ${minGap}-${maxGap}px`,
    { gap, minGap, maxGap }
  );
}

function pushContainedCheck(checks, outerRect, innerRect, tolerance, code, label) {
  pushCheck(
    checks,
    innerRect.x >= outerRect.x - tolerance
      && innerRect.y >= outerRect.y - tolerance
      && rectRight(innerRect) <= rectRight(outerRect) + tolerance
      && rectBottom(innerRect) <= rectBottom(outerRect) + tolerance,
    code,
    `${label} 保持在容器内，允许误差 ${tolerance}px`,
    { outerRect, innerRect, tolerance }
  );
}

function summarizeChecks(checks) {
  const failed = checks.filter((item) => !item.ok);
  return {
    checks,
    summary: {
      total: checks.length,
      failed: failed.length,
      passed: checks.length - failed.length
    },
    passed: failed.length === 0
  };
}

function validateActivityRail(pageId, metrics) {
  const configs = {
    welcome: { expectedCount: 7, activeIndex: 0, projectButtonsDisabled: true },
    resourcesNoProject: { expectedCount: 7, activeIndex: 4, projectButtonsDisabled: true },
    rulesNoProject: { expectedCount: 7, activeIndex: 5, projectButtonsDisabled: true },
    settingsNoProject: { expectedCount: 7, activeIndex: 6, projectButtonsDisabled: true },
    resourcesProject: { expectedCount: 7, activeIndex: 4, projectButtonsDisabled: false },
    rulesProject: { expectedCount: 7, activeIndex: 5, projectButtonsDisabled: false },
    settingsProject: { expectedCount: 7, activeIndex: 6, projectButtonsDisabled: false },
    workbench: { expectedCount: 9, activeIndex: 1, projectButtonsDisabled: false },
    thinkingChain: { expectedCount: 9, activeIndex: 2, projectButtonsDisabled: false },
    orchestration: { expectedCount: 9, activeIndex: 3, projectButtonsDisabled: false }
  };
  const config = configs[pageId];
  const checks = [];
  if (!config) {
    return checks;
  }

  pushCheck(
    checks,
    metrics.activityButtons.length === config.expectedCount,
    'activity-count',
    `左侧边栏活动按钮数量为 ${config.expectedCount}`,
    { actual: metrics.activityButtons.length, expected: config.expectedCount }
  );

  const activeIndexes = metrics.activityButtons
    .map((button, index) => (button.active ? index : -1))
    .filter((index) => index >= 0);
  pushCheck(
    checks,
    activeIndexes.length === 1 && activeIndexes[0] === config.activeIndex,
    'activity-active-index',
    `当前页面激活正确的侧栏入口`,
    { activeIndexes, expectedIndex: config.activeIndex }
  );

  const projectButtons = metrics.activityButtons.slice(1, 4);
  if (projectButtons.length === 3) {
    pushCheck(
      checks,
      projectButtons.every((button) => button.disabled === config.projectButtonsDisabled),
      'activity-project-enabled-state',
      config.projectButtonsDisabled
        ? '无工程页禁用主工作台/思路地图/编排入口'
        : '有工程页启用主工作台/思路地图/编排入口',
      {
        expectedDisabled: config.projectButtonsDisabled,
        actual: projectButtons.map((button) => button.disabled)
      }
    );
  } else {
    pushCheck(checks, false, 'activity-project-buttons-missing', '侧栏缺少主工作台/思路地图/编排入口');
  }

  if (config.expectedCount === 9) {
    const bottomToolButtons = metrics.activityButtons.slice(4);
    pushCheck(
      checks,
      bottomToolButtons.length === 5 && bottomToolButtons.every((button) => !button.disabled),
      'activity-project-tool-cluster',
      '工程页保留阶段/未保存/任务抽屉/分屏/资源/规则/设置下半区组合',
      { actualCount: bottomToolButtons.length, disabled: bottomToolButtons.map((button) => button.disabled) }
    );
  }

  return checks;
}

function validateWelcomePage(metrics) {
  const checks = [...validateActivityRail('welcome', metrics)];
  const { rects } = metrics;
  const welcome = requireRect(checks, rects, 'welcome', '欢迎页主体');
  const mainColumn = requireRect(checks, rects, 'mainColumn', '欢迎页主列');
  const sectionsGrid = requireRect(checks, rects, 'sectionsGrid', '欢迎页双列网格');
  const recentProjects = requireRect(checks, rects, 'recentProjects', '最近工程列');
  const templatesAndDrafts = requireRect(checks, rects, 'templatesAndDrafts', '模板与草稿列');
  const firstProjectRow = requireRect(checks, rects, 'firstProjectRow', '最近工程首行');
  const firstDraftRow = requireRect(checks, rects, 'firstDraftRow', '模板/草稿首行');

  if (welcome && mainColumn) {
    pushContainedCheck(checks, welcome, mainColumn, 24, 'welcome-main-contained', '主列');
  }
  if (mainColumn && sectionsGrid) {
    pushContainedCheck(checks, mainColumn, sectionsGrid, 24, 'welcome-grid-contained', '双列区域');
  }
  if (recentProjects && templatesAndDrafts) {
    pushHorizontalGapCheck(checks, recentProjects, templatesAndDrafts, 16, 32, 'welcome-column-gap', '双列');
    pushApproxCheck(checks, recentProjects.width, templatesAndDrafts.width, 8, 'welcome-column-width-match', '双列宽度');
    pushApproxCheck(checks, recentProjects.height, templatesAndDrafts.height, 8, 'welcome-column-height-match', '双列高度');
    pushEdgeAlignCheck(checks, recentProjects.y, templatesAndDrafts.y, 4, 'welcome-column-top-align', '双列顶部');
  }
  if (firstProjectRow && firstDraftRow) {
    pushApproxCheck(checks, firstProjectRow.width, firstDraftRow.width, 8, 'welcome-row-width-match', '首行条目宽度');
    pushApproxCheck(checks, firstProjectRow.height, firstDraftRow.height, 6, 'welcome-row-height-match', '首行条目高度');
    pushRangeCheck(checks, firstProjectRow.width, 620, 760, 'welcome-row-readable-width', '欢迎页条目宽度');
  }

  return summarizeChecks(checks);
}

function validateResourcePage(pageId, metrics) {
  const checks = [...validateActivityRail(pageId, metrics)];
  const { rects } = metrics;
  const page = requireRect(checks, rects, 'page', '资源中心页面');
  const toolbar = requireRect(checks, rects, 'toolbar', '资源中心顶部工具条');
  const typePane = requireRect(checks, rects, 'typePane', '资源类型列');
  const listPane = requireRect(checks, rects, 'listPane', '资源列表列');
  const detailPane = requireRect(checks, rects, 'detailPane', '资源详情列');
  const query = requireRect(checks, rects, 'query', '资源搜索框');
  const controls = requireRect(checks, rects, 'controls', '资源过滤控制区');
  const list = requireRect(checks, rects, 'list', '资源列表');
  const detailHead = requireRect(checks, rects, 'detailHead', '资源详情头部');
  const detailMetaGrid = requireRect(checks, rects, 'detailMetaGrid', '资源详情元信息网格');
  const detailSectionGrid = requireRect(checks, rects, 'detailSectionGrid', '资源详情正文网格');

  if (page && toolbar) {
    pushContainedCheck(checks, page, toolbar, 24, 'resources-toolbar-contained', '顶部工具条');
  }
  if (toolbar && typePane) {
    pushVerticalGapCheck(checks, toolbar, typePane, 30, 40, 'resources-toolbar-to-pane-gap', '工具条与内容列');
  }
  if (typePane && listPane && detailPane) {
    pushHorizontalGapCheck(checks, typePane, listPane, 12, 20, 'resources-type-list-gap', '类型列与列表列');
    pushHorizontalGapCheck(checks, listPane, detailPane, 12, 20, 'resources-list-detail-gap', '列表列与详情列');
    pushEdgeAlignCheck(checks, typePane.y, listPane.y, 4, 'resources-type-list-top-align', '类型列与列表列顶部');
    pushEdgeAlignCheck(checks, listPane.y, detailPane.y, 4, 'resources-list-detail-top-align', '列表列与详情列顶部');
    pushApproxCheck(checks, typePane.height, listPane.height, 12, 'resources-type-list-height-match', '类型列与列表列高度');
    pushApproxCheck(checks, listPane.height, detailPane.height, 12, 'resources-list-detail-height-match', '列表列与详情列高度');
    pushRangeCheck(checks, typePane.width, 200, 240, 'resources-type-width', '类型列宽度');
    pushRangeCheck(checks, listPane.width, 288, 336, 'resources-list-width', '列表列宽度');
    pushMinCheck(checks, detailPane.width, 760, 'resources-detail-width', '详情列宽度');
  }
  if (listPane && query) {
    pushContainedCheck(checks, listPane, query, 16, 'resources-query-contained', '资源搜索框');
  }
  if (listPane && controls) {
    pushContainedCheck(checks, listPane, controls, 16, 'resources-controls-contained', '资源过滤控制区');
  }
  if (listPane && list) {
    pushContainedCheck(checks, listPane, list, 16, 'resources-list-contained', '资源列表');
  }
  if (detailPane && detailHead) {
    pushContainedCheck(checks, detailPane, detailHead, 16, 'resources-detail-head-contained', '资源详情头部');
  }
  if (detailPane && detailMetaGrid) {
    pushContainedCheck(checks, detailPane, detailMetaGrid, 16, 'resources-meta-contained', '资源详情元信息网格');
  }
  if (detailPane && detailSectionGrid) {
    pushContainedCheck(checks, detailPane, detailSectionGrid, 16, 'resources-section-contained', '资源详情正文网格');
    pushMinCheck(checks, detailSectionGrid.height, 180, 'resources-section-height', '资源详情正文区高度');
  }

  return summarizeChecks(checks);
}

function validateRulesPage(pageId, metrics) {
  const checks = [...validateActivityRail(pageId, metrics)];
  const { rects } = metrics;
  const page = requireRect(checks, rects, 'page', '规则中心页面');
  const header = requireRect(checks, rects, 'header', '规则中心页头');
  const scopeSwitch = requireRect(checks, rects, 'scopeSwitch', '规则作用域切换');
  const grid = requireRect(checks, rects, 'grid', '规则中心双列工作区');
  const mainColumn = requireRect(checks, rects, 'mainColumn', '规则中心主列');
  const sideColumn = requireRect(checks, rects, 'sideColumn', '规则中心侧列');
  const listPanel = requireRect(checks, rects, 'listPanel', '规则列表卡片');
  const createRulePanel = requireRect(checks, rects, 'createRulePanel', '新增规则卡片');
  const knowledgePanel = rects.knowledgePanel ?? null;
  const graphCanvas = rects.graphCanvas ?? null;
  const graphNodeList = rects.graphNodeList ?? null;
  const graphDetail = rects.graphDetail ?? null;

  if (page && header) {
    pushContainedCheck(checks, page, header, 24, 'rules-header-contained', '规则中心页头');
    pushMinCheck(checks, header.width, 1200, 'rules-header-width', '规则中心页头宽度');
  }
  if (header && scopeSwitch) {
    pushVerticalGapCheck(checks, header, scopeSwitch, 8, 24, 'rules-header-switch-gap', '页头与作用域切换');
  }
  if (scopeSwitch && grid) {
    pushVerticalGapCheck(checks, scopeSwitch, grid, 28, 40, 'rules-switch-grid-gap', '作用域切换与双列工作区');
  }
  if (page && grid) {
    pushCheck(
      checks,
      grid.x >= page.x - 24 && rectRight(grid) <= rectRight(page) + 24 && grid.y >= page.y - 24,
      'rules-grid-horizontal-contained',
      '规则中心双列工作区在页面宽度内对齐，且从页头下方开始',
      { page, grid }
    );
  }
  if (grid && mainColumn) {
    pushContainedCheck(checks, grid, mainColumn, 8, 'rules-main-column-contained', '规则中心主列');
    pushMinCheck(checks, mainColumn.width, 900, 'rules-main-column-width', '规则中心主列宽度');
  }
  if (grid && sideColumn) {
    pushContainedCheck(checks, grid, sideColumn, 8, 'rules-side-column-contained', '规则中心侧列');
    pushMinCheck(checks, sideColumn.width, 680, 'rules-side-column-width', '规则中心侧列宽度');
  }
  if (mainColumn && sideColumn) {
    pushHorizontalGapCheck(checks, mainColumn, sideColumn, 12, 20, 'rules-column-gap', '规则中心双列');
    pushEdgeAlignCheck(checks, mainColumn.y, sideColumn.y, 4, 'rules-column-top-align', '规则中心双列顶部');
  }
  if (mainColumn && listPanel) {
    pushContainedCheck(checks, mainColumn, listPanel, 8, 'rules-list-panel-contained', '规则列表卡片');
  }
  if (sideColumn && createRulePanel) {
    pushContainedCheck(checks, sideColumn, createRulePanel, 8, 'rules-create-panel-contained', '新增规则卡片');
  }
  if (knowledgePanel && scopeSwitch) {
    pushCheck(
      checks,
      knowledgePanel.y > scopeSwitch.y,
      'rules-knowledge-panel-below-header',
      '知识网络面板位于首屏双列区域之后',
      { knowledgePanelY: knowledgePanel.y, scopeSwitchY: scopeSwitch.y }
    );
  }
  if (knowledgePanel && hasRect(graphCanvas)) {
    pushCheck(
      checks,
      graphCanvas.y > knowledgePanel.y,
      'rules-canvas-below-panel-head',
      '知识网络画布位于知识网络面板正文区域内',
      { knowledgePanelY: knowledgePanel.y, graphCanvasY: graphCanvas.y }
    );
    pushMinCheck(checks, graphCanvas.width, 520, 'rules-canvas-width', '知识网络画布宽度');
    pushRangeCheck(checks, graphCanvas.height, 420, 720, 'rules-canvas-height', '知识网络画布高度');
  }
  if (knowledgePanel && hasRect(graphNodeList)) {
    pushCheck(
      checks,
      graphNodeList.y >= knowledgePanel.y,
      'rules-node-list-below-panel-head',
      '知识网络节点列表位于知识网络面板滚动区内',
      { knowledgePanelY: knowledgePanel.y, graphNodeListY: graphNodeList.y }
    );
    pushRangeCheck(checks, graphNodeList.width, 240, 520, 'rules-node-list-width', '知识网络节点列表宽度');
  }
  if (knowledgePanel && hasRect(graphDetail)) {
    pushCheck(
      checks,
      graphDetail.y >= knowledgePanel.y,
      'rules-detail-below-panel-head',
      '知识网络详情列位于知识网络面板滚动区内',
      { knowledgePanelY: knowledgePanel.y, graphDetailY: graphDetail.y }
    );
    pushMinCheck(checks, graphDetail.width, 320, 'rules-detail-width', '知识网络详情列宽度');
  }
  if (hasRect(graphNodeList) && hasRect(graphDetail)) {
    pushHorizontalGapCheck(checks, graphNodeList, graphDetail, 12, 20, 'rules-node-detail-gap', '节点列表与详情列');
    pushEdgeAlignCheck(checks, graphNodeList.y, graphDetail.y, 4, 'rules-node-detail-top-align', '节点列表与详情列顶部');
  }

  return summarizeChecks(checks);
}

function validateSettingsPage(pageId, metrics) {
  const checks = [...validateActivityRail(pageId, metrics)];
  const { rects } = metrics;
  const page = requireRect(checks, rects, 'page', '设置页面');
  const header = requireRect(checks, rects, 'header', '设置页头');
  const nav = requireRect(checks, rects, 'nav', '设置导航列');
  const main = requireRect(checks, rects, 'main', '设置主列');
  const overviewRow = requireRect(checks, rects, 'overviewRow', '设置概览行');
  const surface = requireRect(checks, rects, 'surface', '设置内容面板');
  const detailGrid = requireRect(checks, rects, 'detailGrid', '设置细节网格');
  const overviewCard1 = requireRect(checks, rects, 'overviewCard1', '设置概览卡片 1');
  const overviewCard2 = requireRect(checks, rects, 'overviewCard2', '设置概览卡片 2');
  const overviewCard3 = requireRect(checks, rects, 'overviewCard3', '设置概览卡片 3');
  const overviewCard4 = requireRect(checks, rects, 'overviewCard4', '设置概览卡片 4');

  if (page && header) {
    pushContainedCheck(checks, page, header, 24, 'settings-header-contained', '设置页头');
  }
  if (header && nav) {
    pushVerticalGapCheck(checks, header, nav, 12, 28, 'settings-header-nav-gap', '页头与内容区');
  }
  if (nav && main) {
    pushHorizontalGapCheck(checks, nav, main, 12, 20, 'settings-nav-main-gap', '设置导航列与主列');
    pushEdgeAlignCheck(checks, nav.y, main.y, 4, 'settings-nav-main-top-align', '设置导航列与主列顶部');
    pushRangeCheck(checks, nav.width, 230, 270, 'settings-nav-width', '设置导航列宽度');
    pushMinCheck(checks, main.width, 1100, 'settings-main-width', '设置主列宽度');
  }
  if (main && overviewRow) {
    pushContainedCheck(checks, main, overviewRow, 16, 'settings-overview-contained', '设置概览行');
  }
  if (main && surface) {
    pushContainedCheck(checks, main, surface, 16, 'settings-surface-contained', '设置内容面板');
  }
  if (surface && detailGrid) {
    pushContainedCheck(checks, surface, detailGrid, 24, 'settings-grid-contained', '设置细节网格');
  }
  const overviewCards = [overviewCard1, overviewCard2, overviewCard3, overviewCard4].filter(Boolean);
  if (overviewCards.length === 4) {
    pushEdgeAlignCheck(checks, overviewCard1.y, overviewCard2.y, 4, 'settings-overview-top-align-1-2', '概览卡片 1/2 顶部');
    pushEdgeAlignCheck(checks, overviewCard2.y, overviewCard3.y, 4, 'settings-overview-top-align-2-3', '概览卡片 2/3 顶部');
    pushEdgeAlignCheck(checks, overviewCard3.y, overviewCard4.y, 4, 'settings-overview-top-align-3-4', '概览卡片 3/4 顶部');
    pushApproxCheck(checks, overviewCard1.width, overviewCard2.width, 12, 'settings-overview-width-1-2', '概览卡片 1/2 宽度');
    pushApproxCheck(checks, overviewCard2.width, overviewCard3.width, 12, 'settings-overview-width-2-3', '概览卡片 2/3 宽度');
    pushApproxCheck(checks, overviewCard3.width, overviewCard4.width, 12, 'settings-overview-width-3-4', '概览卡片 3/4 宽度');
  }

  return summarizeChecks(checks);
}

function validateWorkbenchPage(metrics) {
  const checks = [...validateActivityRail('workbench', metrics)];
  const { rects } = metrics;
  const sidebar = requireRect(checks, rects, 'sidebar', '主工作台左栏');
  const tabs = requireRect(checks, rects, 'tabs', '文档标签栏');
  const body = requireRect(checks, rects, 'body', '主工作台主体');
  const editorSurface = requireRect(checks, rects, 'editorSurface', '编辑区');
  const contextPane = requireRect(checks, rects, 'contextPane', '右侧上下文栏');

  if (sidebar) {
    pushRangeCheck(checks, sidebar.width, 250, 320, 'workbench-sidebar-width', '主工作台左栏宽度');
  }
  if (tabs) {
    pushRangeCheck(checks, tabs.height, 52, 72, 'workbench-tabs-height', '文档标签栏高度');
  }
  if (body && editorSurface) {
    pushContainedCheck(checks, body, editorSurface, 24, 'workbench-editor-contained', '编辑区');
  }
  if (body && contextPane) {
    pushHorizontalGapCheck(checks, body, contextPane, 6, 18, 'workbench-body-context-gap', '主体与右侧栏');
  }
  if (contextPane) {
    pushRangeCheck(checks, contextPane.width, 300, 360, 'workbench-context-width', '右侧上下文栏宽度');
  }

  return summarizeChecks(checks);
}

function validateThinkingChainPage(metrics) {
  const checks = [...validateActivityRail('thinkingChain', metrics)];
  const { rects } = metrics;
  const toolbar = requireRect(checks, rects, 'toolbar', '思路地图页头');
  const board = requireRect(checks, rects, 'board', '思路地图画布区');
  const detail = requireRect(checks, rects, 'detail', '思路地图详情列');

  if (toolbar) {
    pushRangeCheck(checks, toolbar.height, 52, 72, 'thinking-toolbar-height', '思路地图页头高度');
  }
  if (toolbar && board) {
    pushVerticalGapCheck(checks, toolbar, board, 0, 4, 'thinking-toolbar-board-gap', '页头与画布区');
    pushMinCheck(checks, board.width, 1600, 'thinking-board-width', '思路地图画布区宽度');
  }
  if (detail) {
    pushRangeCheck(checks, detail.width, 300, 340, 'thinking-detail-width', '思路地图详情列宽度');
  }

  return summarizeChecks(checks);
}

function validateOrchestrationPage(metrics) {
  const checks = [...validateActivityRail('orchestration', metrics)];
  const { rects } = metrics;
  const page = requireRect(checks, rects, 'page', '编排页面');
  const modulePane = requireRect(checks, rects, 'modulePane', '编排模块列');
  const canvas = requireRect(checks, rects, 'canvas', '编排画布');
  const rightPanel = requireRect(checks, rects, 'rightPanel', '编排右侧面板');
  const rightRail = requireRect(checks, rects, 'rightRail', '编排会话导轨');

  if (page && modulePane) {
    pushContainedCheck(checks, page, modulePane, 4, 'orchestration-module-contained', '模块列');
    pushRangeCheck(checks, modulePane.width, 168, 188, 'orchestration-module-width', '编排模块列宽度');
  }
  if (modulePane && canvas) {
    pushHorizontalGapCheck(checks, modulePane, canvas, 12, 20, 'orchestration-module-canvas-gap', '模块列与画布');
  }
  if (canvas && rightPanel) {
    pushHorizontalGapCheck(checks, canvas, rightPanel, 8, 20, 'orchestration-canvas-panel-gap', '画布与右侧面板');
    pushMinCheck(checks, canvas.width, 1100, 'orchestration-canvas-width', '编排画布宽度');
  }
  if (rightPanel && rightRail) {
    pushHorizontalGapCheck(checks, rightPanel, rightRail, 0, 4, 'orchestration-panel-rail-gap', '右侧面板与会话导轨');
    pushRangeCheck(checks, rightPanel.width, 280, 320, 'orchestration-panel-width', '右侧面板宽度');
    pushRangeCheck(checks, rightRail.width, 36, 44, 'orchestration-rail-width', '会话导轨宽度');
  }

  return summarizeChecks(checks);
}

function validatePage(pageId, metrics) {
  switch (pageId) {
    case 'welcome':
      return validateWelcomePage(metrics);
    case 'resourcesNoProject':
    case 'resourcesProject':
      return validateResourcePage(pageId, metrics);
    case 'rulesNoProject':
    case 'rulesProject':
      return validateRulesPage(pageId, metrics);
    case 'settingsNoProject':
    case 'settingsProject':
      return validateSettingsPage(pageId, metrics);
    case 'workbench':
      return validateWorkbenchPage(metrics);
    case 'thinkingChain':
      return validateThinkingChainPage(metrics);
    case 'orchestration':
      return validateOrchestrationPage(metrics);
    default:
      return summarizeChecks([]);
  }
}

function recordPage(report, pageId, metrics) {
  const validation = validatePage(pageId, metrics);
  report.pages[pageId] = {
    ...metrics,
    ...validation
  };
}

async function main() {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-ui-page-validation-'));
  const projectBase = path.join(runRoot, 'projects');
  const userDataRoot = path.join(runRoot, 'userDataRoot');
  fs.mkdirSync(projectBase, { recursive: true });
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const app = await electron.launch({
    args: ['.'],
    cwd: repoRoot,
    env: buildElectronEnv(userDataRoot)
  });

  const report = {
    generatedAt: new Date().toISOString(),
    outputDir,
    pages: {},
    summary: {
      totalChecks: 0,
      failedChecks: 0,
      pageCount: 0,
      failedPages: []
    }
  };

  try {
    const page = await app.firstWindow();
    await setWindowBounds(app, 1880, 1180);
    await waitForApp(page, 1600);

    const projectNames = [
      'AI知识底座升级',
      '软件工厂模板重构',
      '平台需求闭环验证'
    ];
    const projectRoots = [];

    for (const name of projectNames) {
      const rootPath = await createProject(page, projectBase, name);
      if (!rootPath) {
        throw new Error(`Failed to create project for ${name}`);
      }
      projectRoots.push(rootPath);
    }

    await prepareWorkbench(page, projectRoots[0]);
    await seedProjectContent(page, projectRoots[0]);
    await seedDraftSnapshots(page);
    await seedWelcomeRecents(page, projectRoots);
    await page.evaluate(async () => {
      await window.api.closeProject();
    });
    await waitForApp(page, 1000);
    await reloadIntoView(page, 'project', { leftCollapsed: false, rightCollapsed: false });

    if (shouldCapture('welcome')) {
      recordPage(report, 'welcome', await capturePage(page, '01-welcome', {
        welcome: '.welcome-screen',
        mainColumn: '.welcome-main-column',
        sectionsGrid: '.welcome-sections-grid',
        recentProjects: '.welcome-hub-section:first-child',
        templatesAndDrafts: '.welcome-hub-section:last-child',
        firstProjectRow: '.welcome-hub-section:first-child .simple-row',
        firstDraftRow: '.welcome-hub-section:last-child .simple-row'
      }));
    }

    if (shouldCapture('resources-no-project')) {
      await reloadIntoView(page, 'resources', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'resourcesNoProject', await capturePage(page, '02-resources-no-project', {
        page: '.resource-center-page',
        toolbar: '.resource-toolbar',
        typePane: '.resource-type-pane',
        listPane: '.resource-list-pane',
        detailPane: '.resource-detail-pane',
        query: '.resource-list-query',
        controls: '.resource-list-controls',
        list: '.resource-list',
        detailHead: '.detail-head',
        detailMetaGrid: '.detail-meta-grid',
        detailSectionGrid: '.detail-section-grid'
      }));
    }

    if (shouldCapture('rules-no-project')) {
      await reloadIntoView(page, 'rules', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'rulesNoProject', await capturePage(page, '03-rules-no-project', {
        page: '.rules-workspace-page',
        header: '.document-workspace-bar',
        scopeSwitch: '.rules-workspace-page > .segmented.compact',
        grid: '.rules-workspace-grid',
        mainColumn: '.rules-workspace-column-main',
        sideColumn: '.rules-workspace-column-side',
        listPanel: '[data-testid="rules-panel-list"]',
        createRulePanel: '[data-testid="rules-panel-create-rule"]',
        knowledgePanel: '[data-testid="knowledge-graph-panel"]',
        graphCanvas: '[data-testid="knowledge-graph-canvas"]',
        graphNodeList: '.rules-graph-node-list',
        graphDetail: '.rules-graph-detail'
      }));
    }

    if (shouldCapture('settings-no-project')) {
      await reloadIntoView(page, 'settings', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'settingsNoProject', await capturePage(page, '04-settings-no-project', {
        page: '.settings-workspace-page',
        header: '.settings-workspace-page .workspace-page-head',
        nav: '.settings-section-nav',
        main: '.settings-main-column',
        overviewRow: '.settings-overview-row',
        surface: '.settings-surface',
        detailGrid: '.settings-surface .settings-detail-grid',
        overviewCard1: '.settings-overview-row .settings-overview-card:nth-child(1)',
        overviewCard2: '.settings-overview-row .settings-overview-card:nth-child(2)',
        overviewCard3: '.settings-overview-row .settings-overview-card:nth-child(3)',
        overviewCard4: '.settings-overview-row .settings-overview-card:nth-child(4)'
      }));
    }

    if (
      shouldCapture('workbench')
      || shouldCapture('thinking-chain')
      || shouldCapture('orchestration')
      || shouldCapture('resources-project')
      || shouldCapture('rules-project')
      || shouldCapture('settings-project')
    ) {
      await prepareWorkbench(page, projectRoots[0]);
    }

    if (shouldCapture('workbench')) {
      recordPage(report, 'workbench', await capturePage(page, '05-workbench', {
        sidebar: '.primary-sidebar',
        tabs: '.document-tabs',
        body: '.document-pane',
        editorSurface: '.document-surface',
        contextPane: '.context-pane'
      }));
    }

    if (shouldCapture('thinking-chain')) {
      await reloadIntoView(page, 'thinking-chain', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'thinkingChain', await capturePage(page, '06-thinking-chain', {
        toolbar: '.thinking-chain-toolbar',
        board: '.thinking-chain-board',
        detail: '.thinking-map-detail-pane'
      }));
    }

    if (shouldCapture('orchestration')) {
      await reloadIntoView(page, 'orchestration', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'orchestration', await capturePage(page, '07-orchestration', {
        page: '.orchestration-workspace',
        modulePane: '.flow-module-panel',
        canvas: '.orchestration-flow',
        rightPanel: '.orchestration-right-panel',
        rightRail: '.orchestration-right-rail'
      }));
    }

    if (shouldCapture('resources-project')) {
      await reloadIntoView(page, 'resources', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'resourcesProject', await capturePage(page, '08-resources-project', {
        page: '.resource-center-page',
        toolbar: '.resource-toolbar',
        typePane: '.resource-type-pane',
        listPane: '.resource-list-pane',
        detailPane: '.resource-detail-pane',
        query: '.resource-list-query',
        controls: '.resource-list-controls',
        list: '.resource-list',
        detailHead: '.detail-head',
        detailMetaGrid: '.detail-meta-grid',
        detailSectionGrid: '.detail-section-grid'
      }));
    }

    if (shouldCapture('rules-project')) {
      await reloadIntoView(page, 'rules', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'rulesProject', await capturePage(page, '09-rules-project', {
        page: '.rules-workspace-page',
        header: '.document-workspace-bar',
        scopeSwitch: '.rules-workspace-page > .segmented.compact',
        grid: '.rules-workspace-grid',
        mainColumn: '.rules-workspace-column-main',
        sideColumn: '.rules-workspace-column-side',
        listPanel: '[data-testid="rules-panel-list"]',
        createRulePanel: '[data-testid="rules-panel-create-rule"]',
        knowledgePanel: '[data-testid="knowledge-graph-panel"]',
        graphCanvas: '[data-testid="knowledge-graph-canvas"]',
        graphNodeList: '.rules-graph-node-list',
        graphDetail: '.rules-graph-detail'
      }));
    }

    if (shouldCapture('settings-project')) {
      await reloadIntoView(page, 'settings', { leftCollapsed: false, rightCollapsed: true });
      recordPage(report, 'settingsProject', await capturePage(page, '10-settings-project', {
        page: '.settings-workspace-page',
        header: '.settings-workspace-page .workspace-page-head',
        nav: '.settings-section-nav',
        main: '.settings-main-column',
        overviewRow: '.settings-overview-row',
        surface: '.settings-surface',
        detailGrid: '.settings-surface .settings-detail-grid',
        overviewCard1: '.settings-overview-row .settings-overview-card:nth-child(1)',
        overviewCard2: '.settings-overview-row .settings-overview-card:nth-child(2)',
        overviewCard3: '.settings-overview-row .settings-overview-card:nth-child(3)',
        overviewCard4: '.settings-overview-row .settings-overview-card:nth-child(4)'
      }));
    }

    const pages = Object.entries(report.pages);
    report.summary.pageCount = pages.length;
    report.summary.totalChecks = pages.reduce((sum, [, item]) => sum + (item.summary?.total ?? 0), 0);
    report.summary.failedChecks = pages.reduce((sum, [, item]) => sum + (item.summary?.failed ?? 0), 0);
    report.summary.failedPages = pages
      .filter(([, item]) => item.passed === false)
      .map(([pageId, item]) => ({
        pageId,
        failedChecks: item.checks.filter((check) => !check.ok).map((check) => check.code)
      }));

    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(`Saved page validation artifacts to ${outputDir}`);
    if (report.summary.failedChecks > 0) {
      console.error(JSON.stringify(report.summary.failedPages, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
