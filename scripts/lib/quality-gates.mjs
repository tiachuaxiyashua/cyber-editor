const allSuiteCategories = ['LOG', 'FUN', 'ABU', 'STR', 'EXP', 'SCN'];

const uiLikeLanes = [
  'LANE-ELECTRON-E2E',
  'LANE-UI-REVIEW',
  'LANE-STRESS-BATCH',
  'LANE-CLOSED-LOOP',
  'LANE-PACKAGED-SMOKE',
  'LANE-PACKAGED-CLOSED-LOOP',
];

const fileSwitchFamilies = new Set(['LOG-05', 'FUN-07', 'FUN-08', 'FUN-10', 'EXP-04', 'SCN-03']);
const layoutFamilies = new Set(['EXP-01', 'EXP-02', 'EXP-03', 'EXP-04', 'EXP-05', 'EXP-06', 'EXP-07', 'EXP-08']);
const exportFamilies = new Set(['LOG-12', 'FUN-24', 'SCN-07', 'SCN-08']);

function unique(values) {
  return [...new Set(values)];
}

export const qualityGates = [
  {
    id: 'QG-FUNC-001',
    name: '功能描述零偏差',
    dimension: 'correctness',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: allSuiteCategories,
      laneIds: ['*'],
    },
    metricType: 'zero-defect',
    thresholdText: '任何与 F-* / INF-* 功能描述、对象 focus、页面入口、输出合同不符的结果都必须为 0。',
    thresholds: {
      mismatches: 0,
    },
    evidenceIds: ['EVD-ASSERT', 'EVD-TRACE', 'EVD-REPORT', 'EVD-PACKAGED'],
    ownerCommands: ['npm run test:unit', 'npm run test:e2e', 'npm run test:packaged-smoke'],
    repoEvidence: [
      'tests/unit/full-test-decomposition-coverage.test.ts',
      'tests/unit/executable-test-catalog-coverage.test.ts',
      'docs/01-需求与PRD/03-功能范围与优先级.md',
      'docs/03-架构实现/01-系统架构与分层Owner.md',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://platform.openai.com/docs/guides/trace-grading',
    ],
  },
  {
    id: 'QG-FUNC-002',
    name: '低级错误零容忍',
    dimension: 'correctness',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: allSuiteCategories,
      laneIds: ['*'],
    },
    metricType: 'zero-defect',
    thresholdText: '空白壳层、错误跳转、静默失败、缺按钮、假成功、未落盘、未导出等低级错误数量必须为 0。',
    thresholds: {
      visibleLowLevelDefects: 0,
    },
    evidenceIds: ['EVD-ASSERT', 'EVD-TRACE', 'EVD-REPORT', 'EVD-PACKAGED', 'EVD-EXPORT'],
    ownerCommands: ['npm run test:unit', 'npm run test:e2e', 'npm run demo:closed-loop:regression'],
    repoEvidence: [
      'tests/e2e/workbench-basics.spec.ts',
      'tests/e2e/packaged-smoke.spec.ts',
      'scripts/run-packaged-project-validation.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-UX-001',
    name: '文件切换反馈 250ms',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'EXP', 'SCN'],
      laneIds: ['LANE-ELECTRON-E2E', 'LANE-CLOSED-LOOP'],
    },
    metricType: 'latency-ms',
    thresholdText: '文件树点击后，活动文件高亮、标签页和面包屑反馈必须在 250ms 内可见。',
    thresholds: {
      visibleMs: 250,
    },
    evidenceIds: ['EVD-TRACE'],
    ownerCommands: ['npm run build && npm run test:e2e', 'npm run test:ui:contracts'],
    repoEvidence: [
      'tests/e2e/workbench-runtime-ui-fixes.spec.ts',
      'tests/e2e/ui-latency-contracts.spec.ts',
      'tests/e2e/helpers/experience-contract-harness.ts',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://playwright.dev/docs/api/class-electron',
    ],
  },
  {
    id: 'QG-UX-002',
    name: '壳层贴边无缝',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'EXP', 'SCN'],
      laneIds: ['LANE-ELECTRON-E2E', 'LANE-UI-REVIEW'],
    },
    metricType: 'geometry',
    thresholdText: '主壳层与窗口四边的 gap 必须 <= 1px，不能出现空白边、漂移边或双层壳。',
    thresholds: {
      maxGapPx: 1,
    },
    evidenceIds: ['EVD-TRACE', 'EVD-UX'],
    ownerCommands: ['npm run build && npm run test:e2e', 'npm run build && npm run test:ui:pages'],
    repoEvidence: [
      'tests/e2e/workbench-runtime-ui-fixes.spec.ts',
      'scripts/ui-page-validation.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-UX-003',
    name: '紧凑宽度三栏下限',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['EXP', 'SCN'],
      laneIds: ['LANE-ELECTRON-E2E', 'LANE-UI-REVIEW'],
    },
    metricType: 'geometry',
    thresholdText: '980px 窗宽下，左栏 >= 180px，中栏 >= 260px，右栏 >= 240px，不能挤爆或不可用。',
    thresholds: {
      compactViewportWidthPx: 980,
      leftPaneMinPx: 180,
      centerPaneMinPx: 260,
      rightPaneMinPx: 240,
    },
    evidenceIds: ['EVD-TRACE', 'EVD-UX'],
    ownerCommands: ['npm run build && npm run test:e2e', 'npm run build && npm run test:ui:pages'],
    repoEvidence: [
      'tests/e2e/shell-responsive-consistency.spec.ts',
      'scripts/ui-page-validation.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-UX-004',
    name: '页面几何校验零失败',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['EXP'],
      laneIds: ['LANE-UI-REVIEW'],
    },
    metricType: 'zero-defect',
    thresholdText: 'ui-page-validation 的 failedChecks 必须为 0，任何布局/可发现性/信息密度异常都算体验失败。',
    thresholds: {
      failedChecks: 0,
    },
    evidenceIds: ['EVD-UX'],
    ownerCommands: ['npm run build && npm run test:ui:pages'],
    repoEvidence: [
      'scripts/ui-page-validation.mjs',
      'docs/04-测试验收/01-验收门禁与测试策略.md',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-UX-005',
    name: '长链路无卡死',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['STR', 'SCN', 'EXP'],
      laneIds: ['LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP', 'LANE-ELECTRON-E2E', 'LANE-PACKAGED-SMOKE'],
    },
    metricType: 'zero-defect',
    thresholdText: '整个执行过程中 window.unresponsive 事件必须为 0，不能出现 UI 卡死、假死或失去响应。',
    thresholds: {
      unresponsiveEvents: 0,
    },
    evidenceIds: ['EVD-TRACE', 'EVD-REPORT', 'EVD-PACKAGED'],
    ownerCommands: [
      'npm run test:ui:contracts',
      'npm run build && npm run test:post-change-extreme',
      'npm run demo:closed-loop:regression',
      'npm run test:packaged-smoke',
      'npm run test:packaged-ui-contracts',
    ],
    repoEvidence: [
      'src/main/main.ts',
      'scripts/lib/app-log-events.mjs',
      'scripts/run-post-change-extreme-validation.mjs',
      'scripts/run-packaged-project-validation.mjs',
      'tests/e2e/helpers/app-log-assertions.ts',
    ],
    officialSources: [
      'https://playwright.dev/docs/api/class-electron',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-UX-006',
    name: '原型 / 布局 / 动作契约零失败',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'EXP', 'SCN'],
      laneIds: ['LANE-UI-CONTRACTS'],
    },
    metricType: 'zero-defect',
    thresholdText: 'open-ui-prototype 参考原型一致性、页面布局和动作 contract 的 failed contract 数量必须为 0。',
    thresholds: {
      failedContracts: 0,
    },
    evidenceIds: ['EVD-TRACE', 'EVD-UX'],
    ownerCommands: ['npm run test:ui:contracts'],
    repoEvidence: [
      'tests/e2e/ui-prototype-contracts.spec.ts',
      'tests/e2e/ui-design-contracts.spec.ts',
      'tests/e2e/ui-action-contracts.spec.ts',
    ],
    officialSources: [
      'https://playwright.dev/docs/best-practices',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-PKG-001',
    name: 'Packaged 冷启动可交互',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'EXP', 'SCN'],
      laneIds: ['LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'latency-ms',
    thresholdText: 'packaged 应用从启动到欢迎页或工作台首屏可交互，必须 <= 10000ms。',
    thresholds: {
      launchToInteractiveMs: 10000,
    },
    evidenceIds: ['EVD-PACKAGED'],
    ownerCommands: ['npm run package && npm run test:packaged-smoke', 'npm run test:packaged-project-validation', 'npm run test:packaged-ui-contracts'],
    repoEvidence: [
      'tests/e2e/packaged-smoke.spec.ts',
      'scripts/run-packaged-project-validation.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/api/class-electron',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-PKG-002',
    name: 'Packaged 重开恢复时延',
    dimension: 'experience',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'SCN'],
      laneIds: ['LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'latency-ms',
    thresholdText: 'packaged 重开到保留项目恢复或 recent 可见，必须 <= 8000ms。',
    thresholds: {
      reopenReadyMs: 8000,
    },
    evidenceIds: ['EVD-PACKAGED'],
    ownerCommands: ['npm run test:packaged-project-validation', 'npm run test:packaged-ui-contracts', 'npm run test:packaged-closed-loop'],
    repoEvidence: [
      'scripts/run-packaged-project-validation.mjs',
      'scripts/run-packaged-closed-loop-regression.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/api/class-electron',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-PKG-003',
    name: 'Packaged 保留项目与指针完整',
    dimension: 'correctness',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'ABU', 'SCN', 'STR'],
      laneIds: ['LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'zero-defect',
    thresholdText: '保留项目、导出目录、launcher/pointer、重开路径、manifest/md/txt/pdf/openspec 必须全部齐全。',
    thresholds: {
      missingRequiredArtifacts: 0,
    },
    evidenceIds: ['EVD-PACKAGED', 'EVD-EXPORT'],
    ownerCommands: ['npm run test:packaged-project-validation', 'npm run test:packaged-ui-contracts', 'npm run test:packaged-closed-loop'],
    repoEvidence: [
      'scripts/run-packaged-project-validation.mjs',
      'scripts/publish-packaged-verification-entry.mjs',
      'scripts/run-direct-packaged-open-validation.mjs',
    ],
    officialSources: [
      'https://playwright.dev/docs/api/class-electron',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-STRESS-001',
    name: '压力场景零失败',
    dimension: 'stress',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['STR', 'SCN'],
      laneIds: ['LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'zero-defect',
    thresholdText: 'summary.json / result.json / report.md 里的失败场景数量必须为 0。',
    thresholds: {
      failedScenarios: 0,
    },
    evidenceIds: ['EVD-REPORT'],
    ownerCommands: ['npm run build && npm run test:post-change-extreme', 'npm run demo:closed-loop:regression', 'npm run test:packaged-closed-loop'],
    repoEvidence: [
      'scripts/run-post-change-extreme-validation.mjs',
      'scripts/run-closed-loop-regression.mjs',
      'scripts/run-packaged-closed-loop-regression.mjs',
    ],
    officialSources: [
      'https://platform.openai.com/docs/guides/trace-grading',
      'https://www.electronjs.org/docs/latest/development/testing',
    ],
  },
  {
    id: 'QG-STRESS-002',
    name: '长链路证据包完整',
    dimension: 'stress',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['STR', 'SCN'],
      laneIds: ['LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'binary',
    thresholdText: '每次长链路执行都必须保留 summary.json、result.json 或 report.md 级证据，缺任何一个都算未完成。',
    thresholds: {
      missingEvidenceBundles: 0,
    },
    evidenceIds: ['EVD-REPORT'],
    ownerCommands: ['npm run build && npm run test:post-change-extreme', 'npm run demo:closed-loop:regression', 'npm run test:packaged-closed-loop'],
    repoEvidence: [
      'scripts/run-post-change-extreme-validation.mjs',
      'scripts/run-closed-loop-regression.mjs',
      'docs/04-测试验收/01-验收门禁与测试策略.md',
    ],
    officialSources: [
      'https://platform.openai.com/docs/guides/trace-grading',
      'https://playwright.dev/docs/best-practices',
    ],
  },
  {
    id: 'QG-DELIVERY-001',
    name: '导出交付包完整对齐',
    dimension: 'correctness',
    severity: 'release-blocker',
    appliesTo: {
      suiteCategories: ['LOG', 'FUN', 'SCN', 'STR'],
      laneIds: ['LANE-INTEGRATION', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP'],
    },
    metricType: 'binary',
    thresholdText: 'manifest、markdown、text、pdf、openspec 与 revision 必须同源对齐，缺项或版本漂移都失败。',
    thresholds: {
      missingFormats: 0,
      revisionMismatches: 0,
    },
    evidenceIds: ['EVD-EXPORT'],
    ownerCommands: ['npm run test:delivery-quality-contracts', 'npm run demo:closed-loop:regression', 'npm run test:packaged-project-validation', 'npm run test:packaged-ui-contracts'],
    repoEvidence: [
      'scripts/run-packaged-project-validation.mjs',
      'scripts/run-post-change-extreme-validation.mjs',
      'docs/04-测试验收/02-核心旅程测试矩阵.md',
    ],
    officialSources: [
      'https://platform.openai.com/docs/guides/trace-grading',
      'https://playwright.dev/docs/best-practices',
    ],
  },
];

export const qualityGateById = new Map(qualityGates.map((gate) => [gate.id, gate]));

export function qualityGateIdsForCase(objectRow, family, laneIds) {
  const ids = ['QG-FUNC-001', 'QG-FUNC-002'];

  if (fileSwitchFamilies.has(family.id)) {
    ids.push('QG-UX-001');
  }

  if (layoutFamilies.has(family.id) || laneIds.includes('LANE-UI-REVIEW')) {
    ids.push('QG-UX-002', 'QG-UX-003', 'QG-UX-004');
  }

  if (
    layoutFamilies.has(family.id) ||
    fileSwitchFamilies.has(family.id) ||
    family.category === 'SCN' ||
    laneIds.includes('LANE-UI-REVIEW')
  ) {
    ids.push('QG-UX-006');
  }

  if (laneIds.some((laneId) => uiLikeLanes.includes(laneId))) {
    ids.push('QG-UX-005');
  }

  if (laneIds.includes('LANE-PACKAGED-SMOKE') || laneIds.includes('LANE-PACKAGED-CLOSED-LOOP')) {
    ids.push('QG-PKG-001', 'QG-PKG-002', 'QG-PKG-003');
  }

  if (
    laneIds.includes('LANE-STRESS-BATCH') ||
    laneIds.includes('LANE-CLOSED-LOOP') ||
    laneIds.includes('LANE-PACKAGED-CLOSED-LOOP')
  ) {
    ids.push('QG-STRESS-001', 'QG-STRESS-002');
  }

  if (exportFamilies.has(family.id)) {
    ids.push('QG-DELIVERY-001');
  }

  if (objectRow.focus.includes('导出') || objectRow.focus.includes('交付') || objectRow.focus.includes('packaged')) {
    ids.push('QG-DELIVERY-001');
  }

  return unique(ids);
}
