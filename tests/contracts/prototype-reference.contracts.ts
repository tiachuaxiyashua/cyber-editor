import type { UiContract } from './types.js';

export const prototypeContracts: UiContract[] = [
  {
    id: 'UI-PROTOTYPE-WELCOME-ENTRY',
    pageId: 'welcome',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'open-ui-prototype.bat',
        section: 'launch target',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=welcome',
      },
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '.welcome-screen',
      visible: true,
    },
  },
  {
    id: 'UI-PROTOTYPE-WORKBENCH-ENTRY',
    pageId: 'workbench',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=workbench',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=workbench',
      },
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '.app-shell.view-project',
      visible: true,
    },
  },
  {
    id: 'UI-PROTOTYPE-RESOURCE-ENTRY',
    pageId: 'resource-center',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=resource-center',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=resource-center',
      },
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '页面目标',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '[data-testid="resource-center-page"]',
      visible: true,
    },
  },
  {
    id: 'UI-PROTOTYPE-RULES-ENTRY',
    pageId: 'rules-center',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=rules-center',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=rules-center',
      },
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '[data-testid="rules-workspace"]',
      visible: true,
    },
  },
  {
    id: 'UI-PROTOTYPE-SETTINGS-ENTRY',
    pageId: 'settings',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=settings',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=settings',
      },
      {
        doc: 'docs/02-产品设计/01-页面与交互PRD.md',
        section: '首层显示（小白默认）',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '.settings-workspace-page',
      visible: true,
    },
  },
  {
    id: 'UI-PROTOTYPE-ORCHESTRATION-ENTRY',
    pageId: 'orchestration',
    kind: 'prototype',
    gateIds: ['QG-UX-006'],
    sourceRefs: [
      {
        doc: 'prototypes/ui-rebuild/index.html',
        section: 'data-screen=orchestration',
        prototypeRef: 'prototypes/ui-rebuild/index.html',
        prototypeEntry: 'data-screen-target=orchestration',
      },
      {
        doc: 'docs/02-产品设计/02-编排工作台PRD.md',
        section: '页面目标',
      },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      locator: '[data-testid="orchestration-workspace"]',
      visible: true,
    },
  },
];
