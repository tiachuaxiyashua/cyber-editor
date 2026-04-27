import type { UiContract } from './types.js';

export const deliveryQualityContracts: UiContract[] = [
  {
    id: 'UI-DELIVERY-EXPORT-BUNDLE-COMPLETE',
    pageId: 'delivery',
    kind: 'delivery',
    gateIds: ['QG-DELIVERY-001', 'QG-PKG-003'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '## 发布门禁' },
      { doc: 'docs/05-项目规则/02-变更流程与完成定义.md', section: '## 交付说明必须包含' },
      { doc: 'scripts/run-packaged-project-validation.mjs', section: 'latest export root assertions' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1440, height: 900 },
    },
    assert: {
      quality: {
        minimumRequiredArtifacts: 8,
      },
    },
  },
  {
    id: 'UI-DELIVERY-MARKDOWN-QUALITY-STRICT',
    pageId: 'delivery',
    kind: 'delivery',
    gateIds: ['QG-DELIVERY-001'],
    sourceRefs: [
      { doc: 'docs/04-测试验收/01-验收门禁与测试策略.md', section: '## 发布门禁' },
      { doc: 'docs/05-项目规则/02-变更流程与完成定义.md', section: '## 完成定义' },
      { doc: 'scripts/lib/output-quality-review.mjs', section: 'reviewMarkdownArtifact' },
    ],
    precondition: {
      projectMode: 'none',
      viewport: { width: 1440, height: 900 },
    },
    assert: {
      quality: {
        minimumScore: 90,
        minimumDeliveryScore: 90,
        minimumReviewedMarkdowns: 5,
      },
    },
  },
];
