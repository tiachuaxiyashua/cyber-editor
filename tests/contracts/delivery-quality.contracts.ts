import type { UiContract } from './types.js';

export const deliveryQualityContracts: UiContract[] = [
  {
    id: 'UI-DELIVERY-EXPORT-BUNDLE-COMPLETE',
    pageId: 'delivery',
    kind: 'delivery',
    gateIds: ['QG-DELIVERY-001', 'QG-PKG-003'],
    sourceRefs: [
      { doc: 'docs/superpowers/specs/2026-04-23-design-conformance-regression-gate-design.md', section: '8.4 第一批必须完成的体验型 contract' },
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
      { doc: 'docs/superpowers/specs/2026-04-23-design-conformance-regression-gate-design.md', section: '5.3.4 文档质量阈值' },
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
