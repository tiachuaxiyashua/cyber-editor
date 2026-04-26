import type { UiContract } from './types.js';

export const responseLatencyContracts: UiContract[] = [
  {
    id: 'UI-LATENCY-WORKBENCH-FILE-SWITCH-FEEDBACK',
    pageId: 'workbench',
    kind: 'latency',
    gateIds: ['QG-UX-001', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '响应速度阈值' },
      { doc: 'src/renderer/App.tsx', section: 'workbench file switching and openDocument feedback' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      latencyMs: 250,
      locator: '.workbench-pane-item.active',
      visible: true,
    },
  },
  {
    id: 'UI-LATENCY-SETTINGS-FIRST-INTERACTIVE',
    pageId: 'settings',
    kind: 'latency',
    gateIds: ['QG-UX-003'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '响应速度阈值' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: '页面目标' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      latencyMs: 800,
      locator: '.settings-workspace-page',
      visible: true,
    },
  },
  {
    id: 'UI-LATENCY-THINKING-CHAIN-FIRST-INTERACTIVE',
    pageId: 'thinking-chain',
    kind: 'latency',
    gateIds: ['QG-UX-003', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '响应速度阈值' },
      { doc: 'docs/01-需求与PRD/02-用户旅程与信息架构.md', section: '首层显示' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      latencyMs: 800,
      locator: '[data-testid="thinking-chain-page"]',
      visible: true,
    },
  },
];
