import type { UiContract } from './types.js';

export const packagedHandoffContracts: UiContract[] = [
  {
    id: 'UI-PACKAGED-VERIFICATION-ENTRY-PUBLISHED',
    pageId: 'packaged',
    kind: 'packaged',
    gateIds: ['QG-PKG-003'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '## 发布门禁' },
      { doc: 'docs/05-项目规则/02-变更流程与完成定义.md', section: '## 交付说明必须包含' },
      { doc: 'scripts/publish-packaged-verification-entry.mjs', section: 'launcher pointer and readme publication' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1720, height: 1180 },
    },
    assert: {
      quality: {
        requiredPointerArtifacts: 3,
      },
    },
  },
  {
    id: 'UI-PACKAGED-PRESERVED-PROJECT-REOPENS',
    pageId: 'packaged',
    kind: 'packaged',
    gateIds: ['QG-PKG-001', 'QG-PKG-002', 'QG-PKG-003'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '## 发布门禁' },
      { doc: 'docs/05-项目规则/02-变更流程与完成定义.md', section: '## 完成定义' },
      { doc: 'scripts/run-packaged-project-validation.mjs', section: 'main packaged validation flow' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1720, height: 1180 },
    },
    assert: {
      quality: {
        coldStartMaxMs: 10000,
        reopenReadyMaxMs: 8000,
        requiredScreenshots: 6,
        minimumDeliveryScore: 90,
      },
    },
  },
  {
    id: 'UI-PACKAGED-DIRECT-OPEN-RESTORES-PRESERVED-PROJECT',
    pageId: 'packaged',
    kind: 'packaged',
    gateIds: ['QG-PKG-001', 'QG-PKG-002'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '## 发布门禁' },
      { doc: 'docs/05-项目规则/02-变更流程与完成定义.md', section: '## 交付说明必须包含' },
      { doc: 'scripts/run-direct-packaged-open-validation.mjs', section: 'direct packaged open summary assertions' },
    ],
    precondition: {
      projectMode: 'project',
      viewport: { width: 1720, height: 1180 },
    },
    assert: {
      quality: {
        launchToProjectMaxMs: 10000,
      },
    },
  },
];
