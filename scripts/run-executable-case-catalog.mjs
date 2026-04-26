import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { formatDuration, sanitizeStepId } from './lib/release-hardening.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = process.env.CASE_CATALOG_RUN_ROOT
  ? path.resolve(REPO_ROOT, process.env.CASE_CATALOG_RUN_ROOT)
  : path.join(REPO_ROOT, 'artifacts', 'executable-case-catalog-runs', RUN_STAMP);
const WINDOWS_VIRTUAL_DESKTOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-on-virtual-desktop.ps1');
const CASE_CATALOG_PATH = process.env.CASE_CATALOG_PATH
  ? path.resolve(REPO_ROOT, process.env.CASE_CATALOG_PATH)
  : path.join(REPO_ROOT, 'docs', '04-测试验收', 'generated', 'full-executable-test-cases.json');
const QUALITY_GATES_PATH = process.env.QUALITY_GATES_PATH
  ? path.resolve(REPO_ROOT, process.env.QUALITY_GATES_PATH)
  : path.join(REPO_ROOT, 'docs', '04-测试验收', 'generated', 'quality-gates.json');
const CASE_ORACLE_COVERAGE_PATH = process.env.CASE_ORACLE_COVERAGE_PATH
  ? path.resolve(REPO_ROOT, process.env.CASE_ORACLE_COVERAGE_PATH)
  : path.join(REPO_ROOT, 'docs', '04-测试验收', 'generated', 'case-oracle-coverage.json');
const CASE_CATALOG_SUITE_RESULTS_PATH = process.env.CASE_CATALOG_SUITE_RESULTS_PATH
  ? path.resolve(REPO_ROOT, process.env.CASE_CATALOG_SUITE_RESULTS_PATH)
  : '';

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeMarkdown(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listDirectoryNames(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  return fs.readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function findNewestDirectory(rootPath) {
  const names = listDirectoryNames(rootPath);
  if (!names.length) {
    return null;
  }
  return path.join(rootPath, names[names.length - 1]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeCommand(command) {
  return String(command ?? '').trim().replace(/\s+/g, ' ');
}

function buildCommandText(command, env = {}) {
  const envPrefix = Object.entries(env)
    .map(([key, value]) => `set ${key}=${String(value)}&&`)
    .join(' ');
  return `${envPrefix} ${command}`.trim();
}

function runChildProcess(file, args, { logPath, env = process.env }) {
  ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: REPO_ROOT,
      env,
      windowsHide: true
    });

    let output = '';
    let finished = false;

    const appendChunk = (chunk) => {
      const text = chunk.toString();
      output += text;
      logStream.write(text);
      process.stdout.write(text);
    };

    child.stdout.on('data', appendChunk);
    child.stderr.on('data', appendChunk);

    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      const message = `${error.stack ?? error.message}\n`;
      output += message;
      logStream.write(message);
      logStream.end(() => {
        resolve({
          exitCode: 1,
          output,
          durationMs: Date.now() - startedAt,
          error: error.message
        });
      });
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      logStream.end(() => {
        resolve({
          exitCode: code ?? 1,
          output,
          durationMs: Date.now() - startedAt
        });
      });
    });
  });
}

function runCommand(command, { logPath, env = {}, virtualDesktop = false, desktopName }) {
  const mergedEnv = {
    ...process.env,
    ...env
  };

  if (virtualDesktop && process.platform === 'win32') {
    return runChildProcess(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        WINDOWS_VIRTUAL_DESKTOP_SCRIPT,
        '-DesktopName',
        desktopName,
        '-LogPath',
        logPath,
        '-Command',
        buildCommandText(command, env)
      ],
      {
        logPath: `${logPath}.wrapper.log`,
        env: mergedEnv
      }
    );
  }

  return runChildProcess(
    'cmd.exe',
    ['/d', '/s', '/c', buildCommandText(command, env)],
    {
      logPath,
      env: mergedEnv
    }
  );
}

function buildSuiteDefinitions() {
  return [
    {
      id: 'LANE-CI-GUARD',
      title: 'Catalog and anti-false-green guard',
      command: 'npm run test:catalog-integrity',
      virtualDesktop: false,
      providedEvidenceIds: ['EVD-ASSERT']
    },
    {
      id: 'LANE-UNIT',
      title: 'Unit logic',
      command: 'npm run test:unit',
      virtualDesktop: false,
      providedEvidenceIds: ['EVD-ASSERT'],
      releaseHardeningStepId: 'test-unit'
    },
    {
      id: 'LANE-INTEGRATION',
      title: 'Integration logic',
      aliasOf: 'LANE-UNIT',
      providedEvidenceIds: ['EVD-ASSERT'],
      releaseHardeningStepId: 'test-unit'
    },
    {
      id: 'LANE-ELECTRON-E2E',
      title: 'Electron end-to-end',
      command: 'npm run test:e2e',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-TRACE']
    },
    {
      id: 'LANE-UI-REVIEW',
      title: 'UI review',
      command: 'npm run test:ui:pages',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-UX'],
      releaseHardeningStepId: 'ui-pages'
    },
    {
      id: 'LANE-UI-CONTRACTS',
      title: 'UI contract gate',
      command: 'npm run test:ui:contracts',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-TRACE', 'EVD-UX', 'EVD-EXPORT'],
      releaseHardeningStepId: 'ui-contracts'
    },
    {
      id: 'LANE-STRESS-BATCH',
      title: 'Stress and extreme validation',
      command: 'npm run test:post-change-extreme',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-REPORT'],
      releaseHardeningStepId: 'post-change-extreme'
    },
    {
      id: 'LANE-CLOSED-LOOP',
      title: 'Development closed-loop regression',
      command: 'npm run demo:closed-loop:regression',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-REPORT', 'EVD-EXPORT']
    },
    {
      id: 'LANE-PACKAGED-SMOKE',
      title: 'Packaged smoke',
      command: 'npm run package && npm run test:packaged-smoke',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-PACKAGED'],
      releaseHardeningStepId: 'packaged-smoke'
    },
    {
      id: 'LANE-PACKAGED-CLOSED-LOOP',
      title: 'Packaged closed-loop regression',
      command: 'npm run demo:packaged-closed-loop:regression',
      virtualDesktop: true,
      providedEvidenceIds: ['EVD-REPORT', 'EVD-PACKAGED', 'EVD-EXPORT']
    },
    {
      id: 'SUP-PACKAGED-PROJECT-VALIDATION',
      title: 'Packaged preserved-project validation',
      command: 'npm run test:packaged-project-validation',
      virtualDesktop: true,
      supplemental: true,
      providedEvidenceIds: ['EVD-PACKAGED', 'EVD-EXPORT'],
      releaseHardeningStepId: 'packaged-project-validation'
    },
    {
      id: 'SUP-PACKAGED-UI-CONTRACTS',
      title: 'Packaged UI contract gate',
      command: 'npm run test:packaged-ui-contracts',
      virtualDesktop: true,
      supplemental: true,
      providedEvidenceIds: ['EVD-PACKAGED', 'EVD-EXPORT'],
      releaseHardeningStepId: 'packaged-ui-contracts'
    }
  ];
}

function collectSuiteArtifacts(suiteId) {
  const artifactPaths = [];
  const pushIfExists = (candidate) => {
    if (candidate && fs.existsSync(candidate)) {
      artifactPaths.push(candidate);
    }
  };

  const packagedExe = path.join(REPO_ROOT, 'out', 'package', 'Cyber Editor-win32-x64', 'Cyber Editor.exe');

  switch (suiteId) {
    case 'LANE-ELECTRON-E2E':
      pushIfExists(path.join(REPO_ROOT, 'test-results'));
      pushIfExists(path.join(REPO_ROOT, 'playwright-report'));
      break;
    case 'LANE-UI-REVIEW':
      pushIfExists(path.join(REPO_ROOT, 'output', 'playwright', 'ui-page-validation', 'report.json'));
      break;
    case 'LANE-UI-CONTRACTS':
      pushIfExists(path.join(REPO_ROOT, 'test-results'));
      pushIfExists(path.join(REPO_ROOT, 'playwright-report'));
      break;
    case 'LANE-STRESS-BATCH': {
      const latest = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation'));
      pushIfExists(latest);
      if (latest) {
        pushIfExists(path.join(latest, 'summary.json'));
        pushIfExists(path.join(latest, 'summary.md'));
      }
      break;
    }
    case 'LANE-CLOSED-LOOP':
      pushIfExists(path.join(REPO_ROOT, 'artifacts', 'closed-loop-regression'));
      pushIfExists(path.join(REPO_ROOT, 'artifacts', 'closed-loop-regression', 'report.md'));
      break;
    case 'LANE-PACKAGED-SMOKE':
      pushIfExists(packagedExe);
      pushIfExists(path.join(REPO_ROOT, 'test-results'));
      break;
    case 'LANE-PACKAGED-CLOSED-LOOP':
      pushIfExists(packagedExe);
      pushIfExists(path.join(REPO_ROOT, 'artifacts', 'packaged-closed-loop-regression'));
      pushIfExists(path.join(REPO_ROOT, 'artifacts', 'packaged-closed-loop-regression', 'report.md'));
      break;
    case 'SUP-PACKAGED-PROJECT-VALIDATION': {
      const latest = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation'));
      pushIfExists(packagedExe);
      pushIfExists(latest);
      if (latest) {
        pushIfExists(path.join(latest, 'summary.json'));
        pushIfExists(path.join(latest, 'report.md'));
      }
      break;
    }
    case 'SUP-PACKAGED-UI-CONTRACTS': {
      const latestPublish = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish'));
      const latestValidation = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation'));
      const latestDirectOpen = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation'));
      pushIfExists(packagedExe);
      pushIfExists(path.join(REPO_ROOT, 'test-results'));
      pushIfExists(latestPublish);
      pushIfExists(latestValidation);
      pushIfExists(latestDirectOpen);
      if (latestPublish) {
        pushIfExists(path.join(latestPublish, 'summary.json'));
        pushIfExists(path.join(latestPublish, 'report.md'));
      }
      if (latestValidation) {
        pushIfExists(path.join(latestValidation, 'summary.json'));
        pushIfExists(path.join(latestValidation, 'report.md'));
      }
      if (latestDirectOpen) {
        pushIfExists(path.join(latestDirectOpen, 'summary.json'));
        pushIfExists(path.join(latestDirectOpen, 'report.md'));
      }
      break;
    }
    default:
      break;
  }

  return unique(artifactPaths);
}

function loadLatestReleaseHardeningSummary() {
  const latestRunRoot = findNewestDirectory(path.join(REPO_ROOT, 'artifacts', 'release-hardening'));
  if (!latestRunRoot) {
    return null;
  }
  const summaryPath = path.join(latestRunRoot, 'summary.json');
  const summary = readJsonIfExists(summaryPath);
  if (!summary) {
    return null;
  }
  return {
    runRoot: latestRunRoot,
    summaryPath,
    summary
  };
}

function buildReusedSuiteResult(definition, releaseHardeningSummary) {
  if (!definition.releaseHardeningStepId || !releaseHardeningSummary?.summary?.steps) {
    return null;
  }

  const step = releaseHardeningSummary.summary.steps.find((item) => item.id === definition.releaseHardeningStepId);
  if (!step || step.status !== 'passed') {
    return null;
  }

  return {
    id: definition.id,
    title: definition.title,
    status: 'passed',
    reused: true,
    aliasOf: definition.aliasOf ?? null,
    command: definition.command ?? null,
    logPath: step.logPath ?? null,
    durationMs: step.durationMs ?? 0,
    providedEvidenceIds: definition.providedEvidenceIds,
    artifactPaths: unique([
      ...(step.logPath ? [step.logPath] : []),
      ...collectSuiteArtifacts(definition.id)
    ]),
    notes: unique([
      ...(step.notes ?? []),
      `Reused fresh release-hardening step ${step.id} from ${releaseHardeningSummary.runRoot}`
    ])
  };
}

function aliasSuiteResult(definition, baseResult) {
  return {
    id: definition.id,
    title: definition.title,
    status: baseResult?.status ?? 'skipped',
    reused: Boolean(baseResult?.reused),
    aliasOf: definition.aliasOf,
    command: definition.command ?? null,
    logPath: baseResult?.logPath ?? null,
    durationMs: baseResult?.durationMs ?? 0,
    providedEvidenceIds: definition.providedEvidenceIds,
    artifactPaths: unique(baseResult?.artifactPaths ?? []),
    notes: unique([
      ...(baseResult?.notes ?? []),
      `Aliased to ${definition.aliasOf}`
    ])
  };
}

function loadSuiteResultsFixture(fixturePath) {
  const raw = readJson(fixturePath);
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.suites)
      ? raw.suites
      : Object.entries(raw.suites ?? {}).map(([id, value]) => ({ id, ...value }));
  const suiteResults = new Map();

  for (const entry of entries) {
    if (!entry?.id) {
      continue;
    }
    suiteResults.set(entry.id, {
      id: entry.id,
      title: entry.title ?? entry.id,
      status: entry.status ?? 'missing',
      reused: Boolean(entry.reused),
      aliasOf: entry.aliasOf ?? null,
      command: entry.command ?? null,
      logPath: entry.logPath ?? null,
      durationMs: entry.durationMs ?? 0,
      providedEvidenceIds: normalizeArray(entry.providedEvidenceIds),
      artifactPaths: normalizeArray(entry.artifactPaths),
      notes: normalizeArray(entry.notes)
    });
  }

  return suiteResults;
}

const QUALITY_GATE_SUPPORT = {
  'QG-FUNC-001': ['LANE-CI-GUARD', 'LANE-UNIT', 'LANE-INTEGRATION', 'LANE-ELECTRON-E2E', 'LANE-UI-REVIEW', 'LANE-UI-CONTRACTS', 'LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP', 'SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS'],
  'QG-FUNC-002': ['LANE-CI-GUARD', 'LANE-UNIT', 'LANE-INTEGRATION', 'LANE-ELECTRON-E2E', 'LANE-UI-REVIEW', 'LANE-UI-CONTRACTS', 'LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP', 'SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS'],
  'QG-UX-001': ['LANE-ELECTRON-E2E', 'LANE-UI-CONTRACTS', 'LANE-CLOSED-LOOP'],
  'QG-UX-002': ['LANE-ELECTRON-E2E', 'LANE-UI-REVIEW', 'LANE-UI-CONTRACTS'],
  'QG-UX-003': ['LANE-ELECTRON-E2E', 'LANE-UI-REVIEW', 'LANE-UI-CONTRACTS'],
  'QG-UX-004': ['LANE-UI-REVIEW', 'LANE-UI-CONTRACTS'],
  'QG-UX-005': ['LANE-ELECTRON-E2E', 'LANE-UI-REVIEW', 'LANE-UI-CONTRACTS', 'LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP'],
  'QG-UX-006': ['LANE-UI-CONTRACTS'],
  'QG-PKG-001': ['LANE-PACKAGED-SMOKE', 'LANE-PACKAGED-CLOSED-LOOP', 'SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS'],
  'QG-PKG-002': ['SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS', 'LANE-PACKAGED-CLOSED-LOOP'],
  'QG-PKG-003': ['SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS', 'LANE-PACKAGED-CLOSED-LOOP'],
  'QG-STRESS-001': ['LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP'],
  'QG-STRESS-002': ['LANE-STRESS-BATCH', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP'],
  'QG-DELIVERY-001': ['LANE-UI-CONTRACTS', 'LANE-CLOSED-LOOP', 'LANE-PACKAGED-CLOSED-LOOP', 'SUP-PACKAGED-PROJECT-VALIDATION', 'SUP-PACKAGED-UI-CONTRACTS']
};

function loadCaseOracleCoverage() {
  const raw = readJsonIfExists(CASE_ORACLE_COVERAGE_PATH);
  const byCaseId = new Map();
  if (!raw) {
    return {
      manifestPath: CASE_ORACLE_COVERAGE_PATH,
      manifestExists: false,
      byCaseId
    };
  }

  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.cases)
      ? raw.cases
      : Object.entries(raw.cases ?? {}).flatMap(([caseId, value]) =>
          normalizeArray(value).map((item) => ({ caseId, ...item }))
        );

  for (const entry of entries) {
    if (!entry?.caseId) {
      continue;
    }
    const proof = {
      suiteId: entry.suiteId,
      evidenceIds: normalizeArray(entry.evidenceIds),
      qualityGateIds: normalizeArray(entry.qualityGateIds),
      assertionRefs: normalizeArray(entry.assertionRefs),
      artifactPaths: normalizeArray(entry.artifactPaths),
      notes: normalizeArray(entry.notes)
    };
    byCaseId.set(entry.caseId, [...(byCaseId.get(entry.caseId) ?? []), proof]);
  }

  return {
    manifestPath: CASE_ORACLE_COVERAGE_PATH,
    manifestExists: true,
    byCaseId
  };
}

function proofSupportsQualityGate(proof, gateId, executableCase) {
  if (!proof.qualityGateIds.includes(gateId)) {
    return false;
  }
  const supportingSuites = QUALITY_GATE_SUPPORT[gateId] ?? executableCase.laneIds;
  return supportingSuites.includes(proof.suiteId);
}

function evaluateCaseStatus(executableCase, suiteResults, caseOracleCoverage) {
  const laneStatuses = executableCase.laneIds.map((laneId) => {
    const suite = suiteResults.get(laneId);
    return {
      laneId,
      status: suite?.status ?? 'missing',
      reused: Boolean(suite?.reused),
      logPath: suite?.logPath ?? null,
      artifactPaths: suite?.artifactPaths ?? []
    };
  });

  const failedLanes = laneStatuses.filter((item) => item.status !== 'passed');
  const passedLaneIds = laneStatuses.filter((item) => item.status === 'passed').map((item) => item.laneId);
  const passedSuites = laneStatuses
    .filter((item) => item.status === 'passed')
    .map((item) => suiteResults.get(item.laneId))
    .filter(Boolean);

  const providedEvidenceIds = new Set(passedSuites.flatMap((suite) => suite.providedEvidenceIds ?? []));
  const missingEvidenceIds = executableCase.evidenceIds.filter((evidenceId) => !providedEvidenceIds.has(evidenceId));

  const candidateProofs = (caseOracleCoverage.byCaseId.get(executableCase.caseId) ?? [])
    .filter((proof) => {
      const suite = suiteResults.get(proof.suiteId);
      return suite?.status === 'passed' && executableCase.laneIds.includes(proof.suiteId);
    });

  const proofEvidenceIds = new Set(candidateProofs.flatMap((proof) => proof.evidenceIds ?? []));
  const missingProofEvidenceIds = executableCase.evidenceIds.filter((evidenceId) => !proofEvidenceIds.has(evidenceId));
  const missingProofAssertion = candidateProofs.length === 0
    || candidateProofs.every((proof) => !proof.assertionRefs?.length);

  const qualityGateStatuses = executableCase.qualityGateIds.map((gateId) => {
    const passedSupport = candidateProofs
      .filter((proof) => proofSupportsQualityGate(proof, gateId, executableCase))
      .map((proof) => proof.suiteId);
    return {
      gateId,
      status: passedSupport.length > 0 ? 'covered' : 'missing',
      supportingSuites: passedSupport
    };
  });

  const missingQualityGateIds = qualityGateStatuses
    .filter((item) => item.status !== 'covered')
    .map((item) => item.gateId);

  const laneExecutionPassed = failedLanes.length === 0 && missingEvidenceIds.length === 0;
  const caseProofPassed = candidateProofs.length > 0
    && missingProofEvidenceIds.length === 0
    && !missingProofAssertion;
  const executionStatus = !laneExecutionPassed
    ? 'failed'
    : caseProofPassed
      ? 'passed'
      : 'unproven';

  return {
    caseId: executableCase.caseId,
    objectId: executableCase.objectId,
    objectKind: executableCase.objectKind,
    objectDomain: executableCase.objectDomain,
    suiteCategory: executableCase.suiteCategory,
    primaryLaneId: executableCase.primaryLaneId,
    executionStatus,
    caseProofStatus: caseProofPassed ? 'proven' : 'unproven',
    qualityGateStatus: missingQualityGateIds.length === 0 ? 'covered' : 'partial',
    laneStatuses,
    proofSuites: candidateProofs.map((proof) => proof.suiteId),
    assertionRefs: unique(candidateProofs.flatMap((proof) => proof.assertionRefs ?? [])),
    failedLaneIds: failedLanes.map((item) => item.laneId),
    missingEvidenceIds,
    missingProofEvidenceIds,
    missingProofAssertion,
    missingQualityGateIds,
    artifactPaths: unique([
      ...passedSuites.flatMap((suite) => suite.artifactPaths ?? []),
      ...candidateProofs.flatMap((proof) => proof.artifactPaths ?? [])
    ]),
    notes: unique([
      failedLanes.length ? `Failed lanes: ${failedLanes.map((item) => item.laneId).join(', ')}` : null,
      missingEvidenceIds.length ? `Missing evidence ids: ${missingEvidenceIds.join(', ')}` : null,
      executionStatus === 'unproven'
        ? `Missing case-level oracle proof in ${caseOracleCoverage.manifestPath}`
        : null,
      missingProofEvidenceIds.length ? `Missing proof evidence ids: ${missingProofEvidenceIds.join(', ')}` : null,
      missingProofAssertion ? 'Missing assertionRefs for this case proof' : null,
      missingQualityGateIds.length ? `Quality gate support missing: ${missingQualityGateIds.join(', ')}` : null,
      passedLaneIds.length ? `Passed lanes: ${passedLaneIds.join(', ')}` : null
    ])
  };
}

function renderMarkdownReport({ runRoot, reusedReleaseHardening, suiteResults, caseResults, summary }) {
  const lines = [
    '# Executable Case Catalog Run',
    '',
    `- Run Root: ${runRoot}`,
    `- Reused Release Hardening: ${reusedReleaseHardening?.runRoot ?? 'none'}`,
    `- Total Cases: ${summary.totalCases}`,
    `- Execution Passed: ${summary.executionPassed}`,
    `- Execution Failed: ${summary.executionFailed}`,
    `- Execution Unproven: ${summary.executionUnproven}`,
    `- Quality Gates Fully Covered: ${summary.qualityCovered}`,
    `- Quality Gates Partial: ${summary.qualityPartial}`,
    `- Case Oracle Coverage Manifest: ${summary.caseOracleCoverage.manifestExists ? summary.caseOracleCoverage.manifestPath : 'missing'}`,
    ''
  ];

  lines.push('## Suites', '');
  for (const suite of suiteResults.values()) {
    lines.push(`- ${suite.id} | status=${suite.status} | reused=${suite.reused ? 'yes' : 'no'} | duration=${formatDuration(suite.durationMs)}`);
    if (suite.logPath) {
      lines.push(`  - log: ${suite.logPath}`);
    }
    if (suite.aliasOf) {
      lines.push(`  - alias-of: ${suite.aliasOf}`);
    }
    for (const artifactPath of suite.artifactPaths ?? []) {
      lines.push(`  - artifact: ${artifactPath}`);
    }
    for (const note of suite.notes ?? []) {
      lines.push(`  - note: ${note}`);
    }
  }
  lines.push('');

  const failedCases = caseResults.filter((item) => item.executionStatus !== 'passed');
  const unprovenCases = caseResults.filter((item) => item.executionStatus === 'unproven');
  const partialGateCases = caseResults.filter((item) => item.qualityGateStatus !== 'covered');

  lines.push('## Failed Cases', '');
  if (!failedCases.length) {
    lines.push('- none');
  } else {
    for (const result of failedCases.slice(0, 100)) {
      lines.push(`- ${result.caseId} | lanes=${result.failedLaneIds.join(', ') || 'none'} | evidence=${result.missingEvidenceIds.join(', ') || 'none'}`);
    }
  }
  lines.push('');

  lines.push('## Unproven Cases', '');
  if (!unprovenCases.length) {
    lines.push('- none');
  } else {
    for (const result of unprovenCases.slice(0, 100)) {
      lines.push(`- ${result.caseId} | proof-evidence=${result.missingProofEvidenceIds.join(', ') || 'none'} | gates=${result.missingQualityGateIds.join(', ') || 'none'}`);
    }
    if (unprovenCases.length > 100) {
      lines.push(`- ... ${unprovenCases.length - 100} more`);
    }
  }
  lines.push('');

  lines.push('## Partial Gate Coverage', '');
  if (!partialGateCases.length) {
    lines.push('- none');
  } else {
    for (const result of partialGateCases.slice(0, 100)) {
      lines.push(`- ${result.caseId} | gates=${result.missingQualityGateIds.join(', ')}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  ensureDir(RUN_ROOT);
  ensureDir(path.join(RUN_ROOT, 'logs'));

  const cases = readJson(CASE_CATALOG_PATH);
  const qualityGates = readJson(QUALITY_GATES_PATH);
  const caseOracleCoverage = loadCaseOracleCoverage();
  const suiteDefinitions = buildSuiteDefinitions();
  let suiteResults = new Map();
  let reusedReleaseHardening = null;

  if (CASE_CATALOG_SUITE_RESULTS_PATH) {
    suiteResults = loadSuiteResultsFixture(CASE_CATALOG_SUITE_RESULTS_PATH);
  } else {
    reusedReleaseHardening = loadLatestReleaseHardeningSummary();

    for (const definition of suiteDefinitions) {
      if (definition.aliasOf) {
        continue;
      }
      const reused = buildReusedSuiteResult(definition, reusedReleaseHardening);
      if (reused) {
        suiteResults.set(definition.id, reused);
      }
    }

    for (const definition of suiteDefinitions) {
      if (definition.aliasOf) {
        const baseResult = suiteResults.get(definition.aliasOf);
        suiteResults.set(definition.id, aliasSuiteResult(definition, baseResult));
        continue;
      }
      if (suiteResults.has(definition.id)) {
        continue;
      }

      const logPath = path.join(RUN_ROOT, 'logs', `${sanitizeStepId(definition.id)}.log`);
      console.log(`\n[case-catalog] ${definition.id} -> ${definition.title}`);
      const commandResult = await runCommand(definition.command, {
        logPath,
        virtualDesktop: definition.virtualDesktop,
        desktopName: `Codex ${sanitizeStepId(definition.id)}`
      });

      suiteResults.set(definition.id, {
        id: definition.id,
        title: definition.title,
        status: commandResult.exitCode === 0 ? 'passed' : 'failed',
        reused: false,
        aliasOf: null,
        command: definition.command,
        logPath,
        durationMs: commandResult.durationMs,
        providedEvidenceIds: definition.providedEvidenceIds,
        artifactPaths: unique([
          logPath,
          ...collectSuiteArtifacts(definition.id)
        ]),
        notes: commandResult.exitCode === 0 ? [] : ['Command failed. See log.']
      });
    }

    for (const definition of suiteDefinitions) {
      if (!definition.aliasOf) {
        continue;
      }
      const baseResult = suiteResults.get(definition.aliasOf);
      suiteResults.set(definition.id, aliasSuiteResult(definition, baseResult));
    }
  }

  const caseResults = cases.map((executableCase) => evaluateCaseStatus(executableCase, suiteResults, caseOracleCoverage));
  const summary = {
    totalCases: caseResults.length,
    executionPassed: caseResults.filter((item) => item.executionStatus === 'passed').length,
    executionFailed: caseResults.filter((item) => item.executionStatus === 'failed').length,
    executionUnproven: caseResults.filter((item) => item.executionStatus === 'unproven').length,
    qualityCovered: caseResults.filter((item) => item.qualityGateStatus === 'covered').length,
    qualityPartial: caseResults.filter((item) => item.qualityGateStatus !== 'covered').length,
    caseOracleCoverage: {
      manifestPath: caseOracleCoverage.manifestPath,
      manifestExists: caseOracleCoverage.manifestExists,
      caseIdsWithProofs: caseOracleCoverage.byCaseId.size,
      provenCases: caseResults.filter((item) => item.caseProofStatus === 'proven').length,
      unprovenCases: caseResults.filter((item) => item.caseProofStatus !== 'proven').length
    },
    byCategory: Object.fromEntries(
      ['LOG', 'FUN', 'ABU', 'STR', 'EXP', 'SCN'].map((category) => [
        category,
        {
          total: caseResults.filter((item) => item.suiteCategory === category).length,
          executionPassed: caseResults.filter((item) => item.suiteCategory === category && item.executionStatus === 'passed').length,
          executionFailed: caseResults.filter((item) => item.suiteCategory === category && item.executionStatus === 'failed').length,
          executionUnproven: caseResults.filter((item) => item.suiteCategory === category && item.executionStatus === 'unproven').length
        }
      ])
    ),
    laneStatuses: Object.fromEntries(
      [...suiteResults.values()].map((suite) => [
        suite.id,
        {
          status: suite.status,
          reused: suite.reused,
          durationMs: suite.durationMs,
          logPath: suite.logPath,
          artifactPaths: suite.artifactPaths
        }
      ])
    ),
    qualityGateCount: qualityGates.length
  };

  const summaryPath = path.join(RUN_ROOT, 'summary.json');
  const caseResultsPath = path.join(RUN_ROOT, 'case-results.json');
  const reportPath = path.join(RUN_ROOT, 'report.md');

  writeJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    runRoot: RUN_ROOT,
    reusedReleaseHardening: reusedReleaseHardening
      ? {
          runRoot: reusedReleaseHardening.runRoot,
          summaryPath: reusedReleaseHardening.summaryPath
        }
      : null,
    summary
  });
  writeJson(caseResultsPath, caseResults);
  writeMarkdown(reportPath, renderMarkdownReport({
    runRoot: RUN_ROOT,
    reusedReleaseHardening,
    suiteResults,
    caseResults,
    summary
  }));

  console.log(`\n[case-catalog] summary -> ${summaryPath}`);
  console.log(`[case-catalog] cases   -> ${caseResultsPath}`);
  console.log(`[case-catalog] report  -> ${reportPath}`);

  if (summary.executionFailed > 0 || summary.executionUnproven > 0 || summary.qualityPartial > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  ensureDir(RUN_ROOT);
  writeJson(path.join(RUN_ROOT, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error.stack ?? error.message
  });
  console.error(error);
  process.exitCode = 1;
});
