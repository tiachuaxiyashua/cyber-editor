import type { UiContract } from './types.js';

export const pageStateContracts: UiContract[] = [
  {
    id: 'UI-STATE-PROJECT-DIALOG-INVALID-NAME-SHOWS-VALIDATION',
    pageId: 'welcome',
    kind: 'state',
    gateIds: ['QG-UX-004'],
    sourceRefs: [
      { doc: 'src/renderer/components/ProjectTemplateDialog.tsx', section: 'project create validation' },
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '输入阻断与错误反馈' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="project-create-validation"]',
      visible: true,
    },
  },
  {
    id: 'UI-STATE-PROJECT-DIALOG-INVALID-NAME-DISABLES-SUBMIT',
    pageId: 'welcome',
    kind: 'state',
    gateIds: ['QG-UX-004'],
    sourceRefs: [
      { doc: 'src/renderer/components/ProjectTemplateDialog.tsx', section: 'project create submit disabled' },
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '输入阻断与错误反馈' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="project-dialog-submit"]',
      visible: true,
      enabled: false,
    },
  },
  {
    id: 'UI-STATE-PROJECT-DIALOG-EXISTING-TARGET-SHOWS-VALIDATION',
    pageId: 'welcome',
    kind: 'state',
    gateIds: ['QG-UX-004'],
    sourceRefs: [
      { doc: 'src/renderer/components/ProjectTemplateDialog.tsx', section: 'project target conflict validation' },
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '输入阻断与错误反馈' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="project-create-validation"]',
      visible: true,
    },
  },
  {
    id: 'UI-STATE-PROJECT-DIALOG-EXISTING-TARGET-DISABLES-SUBMIT',
    pageId: 'welcome',
    kind: 'state',
    gateIds: ['QG-UX-004'],
    sourceRefs: [
      { doc: 'src/renderer/components/ProjectTemplateDialog.tsx', section: 'project target conflict submit disabled' },
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '输入阻断与错误反馈' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '[data-testid="project-dialog-submit"]',
      visible: true,
      enabled: false,
    },
  },
  {
    id: 'UI-STATE-STAGE-GUARD-DISABLES-CONFIRM',
    pageId: 'workbench',
    kind: 'state',
    gateIds: ['QG-UX-004', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'src/renderer/components/AppShellSections.tsx', section: 'process panel confirm stage guard' },
      { doc: 'docs/03-架构实现/03-数据契约状态机与安全.md', section: 'stage guard blocked state' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      role: 'button',
      name: '确认当前阶段',
      visible: true,
      enabled: false,
    },
  },
  {
    id: 'UI-STATE-STAGE-GUARD-SHOWS-BLOCKERS',
    pageId: 'workbench',
    kind: 'state',
    gateIds: ['QG-UX-004', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'src/renderer/components/AppShellSections.tsx', section: 'stage guard blockers' },
      { doc: 'docs/03-架构实现/03-数据契约状态机与安全.md', section: 'stage guard blocked state' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.stage-guard-card .finding-card.error, .stage-guard-card .guard-artifact-row.blocked',
      visible: true,
    },
  },
  {
    id: 'UI-STATE-CONFLICT-DIALOG-APPEARS-ON-EXTERNAL-CHANGE',
    pageId: 'workbench',
    kind: 'state',
    gateIds: ['QG-UX-004', 'QG-UX-005'],
    sourceRefs: [
      { doc: 'src/renderer/components/ConflictDialog.tsx', section: 'external change conflict dialog' },
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '冲突阻断与恢复提示' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1480, height: 980 },
    },
    assert: {
      locator: '.conflict-dialog',
      visible: true,
    },
  },
];
