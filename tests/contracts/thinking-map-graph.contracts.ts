import type { UiContract } from './types.js';

export const thinkingMapGraphContracts: UiContract[] = [
  {
    id: 'UI-GRAPH-THINKING-MAP-DEFAULT-COLUMNS-AND-MATERIALIZATION',
    pageId: 'thinking-chain',
    kind: 'graph',
    gateIds: ['QG-UX-003', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/01-需求与PRD/02-用户旅程与信息架构.md', section: '默认理线与文档落点' },
      { doc: 'src/renderer/lib/idea-map-layout.ts', section: 'materializes edge layout' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      graph: {
        minNodeCount: 9,
        minUniqueColumns: 6,
        requiresMaterialization: true,
      },
    },
  },
  {
    id: 'UI-GRAPH-THINKING-MAP-ZOOM-CLAMP-STAYS-STABLE',
    pageId: 'thinking-chain',
    kind: 'graph',
    gateIds: ['QG-UX-003'],
    sourceRefs: [
      { doc: 'docs/01-需求与PRD/02-用户旅程与信息架构.md', section: '缩放体验' },
      { doc: 'src/renderer/components/ThinkingChainPage.tsx', section: 'zoom and viewport persistence' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      graph: {
        zoomMin: 0.35,
        zoomMax: 2.4,
      },
    },
  },
  {
    id: 'UI-GRAPH-THINKING-MAP-NODE-DRAG-PERSISTS-RELOAD',
    pageId: 'thinking-chain',
    kind: 'graph',
    gateIds: ['QG-UX-003', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'docs/01-需求与PRD/02-用户旅程与信息架构.md', section: '节点拖拽与保持' },
      { doc: 'src/renderer/components/ThinkingChainPage.tsx', section: 'manualPosition persistence' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1560, height: 1040 },
    },
    assert: {
      persistence: 'reload',
      graph: {
        draggedNodeLabel: '工作壳',
        minDragDeltaY: 80,
        requiresManualPosition: true,
      },
    },
  },
];
