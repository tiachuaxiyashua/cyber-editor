import type { UiContract } from './types.js';

export const pageActionContracts: UiContract[] = [
  {
    id: 'UI-ACTION-WELCOME-OPEN-PROJECT-DIALOG',
    pageId: 'welcome',
    kind: 'action',
    gateIds: ['QG-UX-001', 'QG-UX-006'],
    sourceRefs: [
      { doc: 'prototypes/ui-rebuild/index.html', section: 'welcome create project action', prototypeEntry: 'data-screen-target=welcome' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'welcome primary actions' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="welcome-create-project"]',
      routeTarget: '[data-testid="project-template-dialog"]',
      visible: true,
    },
  },
  {
    id: 'UI-ACTION-WELCOME-OPEN-RESOURCE-CENTER',
    pageId: 'welcome',
    kind: 'action',
    gateIds: ['QG-UX-001', 'QG-UX-006'],
    sourceRefs: [
      { doc: 'prototypes/ui-rebuild/index.html', section: 'welcome resource entry', prototypeEntry: 'data-screen-target=resource-center' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'welcome primary actions' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="welcome-open-resources"]',
      routeTarget: '[data-testid="resource-center-page"]',
      visible: true,
    },
  },
  {
    id: 'UI-ACTION-PROJECT-DIALOG-OPEN-RESOURCE-CENTER',
    pageId: 'welcome',
    kind: 'action',
    gateIds: ['QG-UX-001'],
    sourceRefs: [
      { doc: 'src/renderer/components/ProjectTemplateDialog.tsx', section: 'open resource center action' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'project creation dialog' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="project-dialog-open-resource-center"]',
      routeTarget: '[data-testid="resource-center-page"]',
      visible: true,
    },
  },
  {
    id: 'UI-ACTION-PROJECT-OPEN-THINKING-CHAIN',
    pageId: 'thinking-chain',
    kind: 'action',
    gateIds: ['QG-UX-001', 'QG-UX-006'],
    sourceRefs: [
      { doc: 'prototypes/ui-rebuild/index.html', section: 'activity button thinking-chain', prototypeEntry: 'data-screen-target=thinking-chain' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'project activity navigation' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: 'button[title="打开思路地图"]',
      routeTarget: '[data-testid="thinking-chain-page"]',
      visible: true,
    },
  },
  {
    id: 'UI-ACTION-PROJECT-OPEN-RULES-CENTER',
    pageId: 'rules-center',
    kind: 'action',
    gateIds: ['QG-UX-001', 'QG-UX-006'],
    sourceRefs: [
      { doc: 'prototypes/ui-rebuild/index.html', section: 'activity button rules-center', prototypeEntry: 'data-screen-target=rules-center' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'project activity navigation' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.activity-bar .activity-button[title="规则与沉淀中心"]',
      routeTarget: '[data-testid="rules-workspace"]',
      visible: true,
    },
  },
  {
    id: 'UI-ACTION-PROJECT-OPEN-SETTINGS',
    pageId: 'settings',
    kind: 'action',
    gateIds: ['QG-UX-001', 'QG-UX-006'],
    sourceRefs: [
      { doc: 'prototypes/ui-rebuild/index.html', section: 'activity button settings', prototypeEntry: 'data-screen-target=settings' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: 'project activity navigation' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.activity-bar .activity-button[title="设置"]',
      routeTarget: '.settings-workspace-page',
      visible: true,
    },
  },
];
