import type { UiContract } from './types.js';

export const pageLayoutContracts: UiContract[] = [
  {
    id: 'UI-LAYOUT-WELCOME-DUAL-COLUMN',
    pageId: 'welcome',
    kind: 'layout',
    gateIds: ['QG-UX-002', 'QG-UX-006'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=welcome',
        prototypeEntry: 'data-screen-target=welcome',
      },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.welcome-screen',
      visible: true,
      geometry: {
        requiresMainColumn: true,
        requiresSectionsGrid: true,
      },
    },
  },
  {
    id: 'UI-LAYOUT-WORKBENCH-THREE-COLUMN',
    pageId: 'workbench',
    kind: 'layout',
    gateIds: ['QG-UX-002', 'QG-UX-003'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=workbench',
        prototypeEntry: 'data-screen-target=workbench',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 980, height: 760 },
    },
    assert: {
      locator: '.app-shell.view-project .document-pane',
      visible: true,
      geometry: {
        leftPaneMinPx: 180,
        centerPaneMinPx: 260,
        rightPaneMinPx: 240,
      },
    },
  },
  {
    id: 'UI-LAYOUT-WORKBENCH-AI-IDLE-COMPACT',
    pageId: 'workbench',
    kind: 'layout',
    gateIds: ['QG-UX-002', 'QG-UX-006'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '交互要求',
      },
      {
        doc: 'docs/03-架构实现/03-数据契约状态机与安全.md',
        section: '5. AI 会话栏',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=workbench',
        prototypeEntry: 'data-screen-target=workbench',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="workbench-conversation-empty"]',
      visible: true,
      geometry: {
        maxWorkbenchIdleGapAbovePx: 28,
        maxWorkbenchIdleGapBelowPx: 28,
        maxWorkbenchIdleComposerOffsetPx: 36,
        maxWorkbenchIdleSummaryToComposerTopPx: 180,
        maxWorkbenchIdleSummaryToComposerCenterPx: 260,
        minWorkbenchContextMainGridRows: 4,
        maxWorkbenchIdleSpacerHeightPx: 24,
        maxWorkbenchIdleEmptyHeightPx: 220,
        forbidGenericSessionTitle: true,
        forbidStageSuffixInWorkbenchTitle: true,
        forbidAssistantMechanicsCopy: true,
        maxWorkbenchSummaryInternalGapPx: 8,
      },
    },
  },
  {
    id: 'UI-LAYOUT-RESOURCE-CENTER',
    pageId: 'resource-center',
    kind: 'layout',
    gateIds: ['QG-UX-002'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '页面目标',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=resource-center',
        prototypeEntry: 'data-screen-target=resource-center',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="resource-center-page"]',
      visible: true,
      geometry: {
        requiresResourceTypePane: true,
        requiresResourceListPane: true,
        requiresResourceDetailPane: true,
      },
    },
  },
  {
    id: 'UI-LAYOUT-RULES-CENTER',
    pageId: 'rules-center',
    kind: 'layout',
    gateIds: ['QG-UX-002'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=rules-center',
        prototypeEntry: 'data-screen-target=rules-center',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="rules-workspace"]',
      visible: true,
      geometry: {
        requiresRulesListPane: true,
        requiresRulesGraphPane: true,
        requiresRulesCreatePane: true,
      },
    },
  },
  {
    id: 'UI-LAYOUT-SETTINGS',
    pageId: 'settings',
    kind: 'layout',
    gateIds: ['QG-UX-002'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=settings',
        prototypeEntry: 'data-screen-target=settings',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.settings-workspace-page',
      visible: true,
      geometry: {
        requiresSettingsSectionNav: true,
        requiresSettingsMainColumn: true,
        requiresSettingsDetailGrid: true,
      },
    },
  },
  {
    id: 'UI-LAYOUT-ORCHESTRATION-FIVE-COLUMN',
    pageId: 'orchestration',
    kind: 'layout',
    gateIds: ['QG-UX-002'],
    sourceRefs: [
      {
        doc: 'docs/02-产品设计/02-编排工作台PRD.md',
        section: '最新原型规则',
      },
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=orchestration',
        prototypeEntry: 'data-screen-target=orchestration',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="orchestration-workspace"]',
      visible: true,
      geometry: {
        requiresModulePane: true,
        requiresRightPanel: true,
        requiresRightRail: true,
      },
    },
  },
];
