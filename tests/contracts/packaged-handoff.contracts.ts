import type { UiContract } from './types.js';

export const packagedHandoffContracts: UiContract[] = [
  {
    id: 'UI-PACKAGED-VERIFICATION-ENTRY-PUBLISHED',
    pageId: 'packaged',
    kind: 'packaged',
    gateIds: ['QG-PKG-003'],
    sourceRefs: [
      { doc: 'docs/superpowers/specs/2026-04-23-design-conformance-regression-gate-design.md', section: '第五组：文档交付质量与 packaged handoff 契约' },
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
      { doc: 'docs/superpowers/specs/2026-04-23-design-conformance-regression-gate-design.md', section: '9.2 交付前门禁' },
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
      { doc: 'docs/superpowers/specs/2026-04-23-design-conformance-regression-gate-design.md', section: '第五组：文档交付质量与 packaged handoff 契约' },
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
