import type { UiContract } from './types.js';

export const dragResizeContracts: UiContract[] = [
  {
    id: 'UI-MANIPULATION-WORKBENCH-PANE-WIDTHS-PERSIST-REOPEN',
    pageId: 'workbench',
    kind: 'manipulation',
    gateIds: ['QG-UX-003', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '拖拽与缩放关系' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: '三栏结构与工作方式' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      persistence: 'reopen',
      drag: {
        leftDeltaPx: -120,
        rightDeltaPx: -100,
        widthTolerancePx: 18,
      },
    },
  },
  {
    id: 'UI-MANIPULATION-WORKBENCH-COMPACT-MIN-WIDTHS',
    pageId: 'workbench',
    kind: 'manipulation',
    gateIds: ['QG-UX-003'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '拖拽与缩放关系' },
      { doc: 'docs/02-产品设计/01-页面与交互PRD.md', section: '紧凑宽度下的最小可用关系' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 900, height: 760 },
    },
    assert: {
      drag: {
        leftPaneMinPx: 180,
        centerPaneMinPx: 260,
        rightPaneMinPx: 240,
      },
    },
  },
  {
    id: 'UI-MANIPULATION-THINKING-DETAIL-RESIZER',
    pageId: 'thinking-chain',
    kind: 'manipulation',
    gateIds: ['QG-UX-003', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '拖拽与缩放关系' },
      { doc: 'docs/01-需求与PRD/02-用户旅程与信息架构.md', section: '详情栏与画布关系' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      drag: {
        detailWidthIncreaseMinPx: 80,
      },
      persistence: 'same-session',
    },
  },
];
