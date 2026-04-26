import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { expect } from '@playwright/test';

import type { UiContract } from '../../contracts/types.js';
import { reviewMarkdownArtifact } from '../../../scripts/lib/output-quality-review.mjs';
import {
  findLatestExtremeValidationProject,
  resolveManualProjectsRoot,
  resolvePackagedExecutablePath,
} from '../../../scripts/lib/packaged-project-paths.mjs';

const REPO_ROOT = process.cwd();
const VIRTUAL_DESKTOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-on-virtual-desktop.ps1');
const PRESERVED_PROJECT_NAME = 'validated-extreme-qwen-delivery';

function ensureDir(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function newestDirectory(rootPath: string) {
  const entries = fs.existsSync(rootPath)
    ? fs.readdirSync(rootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left))
    : [];
  expect(entries.length, `expected at least one run under ${rootPath}`).toBeGreaterThan(0);
  if (!entries.length) {
    throw new Error(`missing run root: ${rootPath}`);
  }
  return path.join(rootPath, entries[0]);
}

function copyDirectory(sourcePath: string, targetPath: string) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      copyDirectory(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function listFilesRecursive(rootPath: string, matcher: (filePath: string) => boolean) {
  const results: string[] = [];
  const visit = (currentPath: string) => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (matcher(fullPath)) {
        results.push(fullPath);
      }
    }
  };
  visit(rootPath);
  return results.sort((left, right) => left.localeCompare(right, 'en'));
}

function runNodeScript(scriptRelativePath: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRelativePath)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function runVirtualDesktopNodeScript(scriptRelativePath: string, logFileName: string, desktopName: string) {
  const logPath = path.join(REPO_ROOT, 'artifacts', 'virtual-desktop-runs', logFileName);
  ensureDir(path.dirname(logPath));
  return {
    logPath,
    result: spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        VIRTUAL_DESKTOP_SCRIPT,
        '-DesktopName',
        desktopName,
        '-LogPath',
        logPath,
        '-Command',
        `node "${scriptRelativePath}"`,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      },
      ) as SpawnSyncReturns<string>,
  };
}

function expectCommandSucceeded(result: SpawnSyncReturns<string>, label: string, logPath?: string) {
  if (result.status === 0) {
    return;
  }
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  const parts = [
    `${label} failed`,
    stdout ? `stdout:\n${stdout}` : '',
    stderr ? `stderr:\n${stderr}` : '',
    logPath ? `log: ${logPath}` : '',
  ].filter(Boolean);
  throw new Error(parts.join('\n\n'));
}

function requireLatestValidationSuite() {
  const source = findLatestExtremeValidationProject(REPO_ROOT, { requireExportSuite: true });
  expect(source, 'delivery and packaged contracts require post-change extreme validation artifacts').toBeTruthy();
  if (!source) {
    throw new Error('missing post-change extreme validation artifacts');
  }
  return source;
}

function resolveLatestExportRoot() {
  const source = requireLatestValidationSuite();
  const exportRoot = path.join(source.projectRoot, '03-openspec', 'exports');
  const exportSuites = fs.existsSync(exportRoot)
    ? fs.readdirSync(exportRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    : [];
  expect(exportSuites.length, `expected at least one export suite under ${exportRoot}`).toBeGreaterThan(0);
  if (!exportSuites.length) {
    throw new Error(`missing export suites under ${exportRoot}`);
  }
  return {
    source,
    latestExportRoot: path.join(exportRoot, exportSuites[exportSuites.length - 1]),
  };
}

function ensurePackagedExecutable() {
  const executablePath = resolvePackagedExecutablePath(REPO_ROOT);
  expect(fs.existsSync(executablePath), `packaged executable is missing: ${executablePath}`).toBe(true);
  return executablePath;
}

function ensurePreservedProjectFixture() {
  const source = requireLatestValidationSuite();
  const manualProjectsRoot = resolveManualProjectsRoot(REPO_ROOT);
  const preservedProjectRoot = path.join(manualProjectsRoot, PRESERVED_PROJECT_NAME);
  const manifestPath = path.join(preservedProjectRoot, '.project', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fs.rmSync(preservedProjectRoot, { recursive: true, force: true });
    copyDirectory(source.projectRoot, preservedProjectRoot);
  }
  expect(fs.existsSync(manifestPath), `preserved project manifest is missing: ${manifestPath}`).toBe(true);
  return preservedProjectRoot;
}

type PackagedPublishSummary = {
  launcherPath: string;
  pointerPath: string;
  readmePath: string;
  preservedProjectRoot: string;
  dedicatedUserDataRoot: string;
};

type PackagedProjectValidationSummary = {
  preservedProjectRoot: string;
  latestExportRoot: string;
  coldStartVisibleMs: number | null;
  reopenReadyMs: number | null;
  screenshotPaths: string[];
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  docScores: Array<{
    filePath: string;
    verdict: string;
    band: string;
    score: number;
    deliveryScore?: number;
    deliveryVerdict?: string;
  }>;
  appLogBlockingEvents?: Array<{ createdAt: string; level: string; source: string; event: string; message: string }>;
};

type DirectOpenSummary = {
  expectedProjectRoot: string;
  expectedProjectName?: string;
  actualProjectRoot: string | null;
  launchToProjectMs: number;
  launchToFirstWindowMs?: number;
  launchToDomContentLoadedMs?: number;
  launchToProjectVisibleMs?: number;
  launchToBootstrapProjectMs?: number;
  bootstrapVerificationMs?: number;
  screenshotPath: string;
};

async function runDeliveryContract(contract: UiContract) {
  switch (contract.id) {
    case 'UI-DELIVERY-EXPORT-BUNDLE-COMPLETE': {
      const { latestExportRoot } = resolveLatestExportRoot();
      const requiredFiles = [
        path.join(latestExportRoot, 'manifest.json'),
        path.join(latestExportRoot, 'markdown', 'delivery-package.md'),
        path.join(latestExportRoot, 'text', 'delivery-package.txt'),
        path.join(latestExportRoot, 'pdf', 'delivery-package.pdf'),
        path.join(latestExportRoot, 'openspec', 'roadmap.md'),
      ];
      for (const filePath of requiredFiles) {
        expect(fs.existsSync(filePath), `required delivery artifact is missing: ${filePath}`).toBe(true);
      }

      const changeMarkdownFiles = listFilesRecursive(
        path.join(latestExportRoot, 'openspec', 'changes'),
        (filePath) => filePath.toLowerCase().endsWith('.md'),
      );
      const minimumRequiredArtifacts = typeof contract.assert.quality?.minimumRequiredArtifacts === 'number'
        ? contract.assert.quality.minimumRequiredArtifacts
        : 8;
      expect(requiredFiles.length + changeMarkdownFiles.length).toBeGreaterThanOrEqual(minimumRequiredArtifacts);
      return;
    }
    case 'UI-DELIVERY-MARKDOWN-QUALITY-STRICT': {
      const { latestExportRoot } = resolveLatestExportRoot();
      const markdownFiles = [
        path.join(latestExportRoot, 'markdown', 'delivery-package.md'),
        path.join(latestExportRoot, 'openspec', 'roadmap.md'),
        ...listFilesRecursive(
          path.join(latestExportRoot, 'openspec', 'changes'),
          (filePath) => ['proposal.md', 'design.md', 'tasks.md'].includes(path.basename(filePath).toLowerCase()),
        ),
      ];
      const minimumReviewedMarkdowns = typeof contract.assert.quality?.minimumReviewedMarkdowns === 'number'
        ? contract.assert.quality.minimumReviewedMarkdowns
        : 5;
      const minimumScore = typeof contract.assert.quality?.minimumScore === 'number'
        ? contract.assert.quality.minimumScore
        : 90;
      const minimumDeliveryScore = typeof contract.assert.quality?.minimumDeliveryScore === 'number'
        ? contract.assert.quality.minimumDeliveryScore
        : 90;

      for (const filePath of markdownFiles) {
        expect(fs.existsSync(filePath), `required reviewed markdown is missing: ${filePath}`).toBe(true);
      }
      expect(markdownFiles.length).toBeGreaterThanOrEqual(minimumReviewedMarkdowns);
      const reviews = markdownFiles.map((filePath) =>
        reviewMarkdownArtifact(filePath, { qualityTier: 'strict' }),
      );

      for (const review of reviews) {
        expect(review.fallbackHits, `${review.filePath} contains fallback markers`).toEqual([]);
        expect(review.placeholderHits, `${review.filePath} contains placeholder markers`).toEqual([]);
        expect(review.verdict, `${review.filePath} verdict`).toBe('pass');
        expect(
          review.score,
          `${review.filePath} score ${review.score} is below ${minimumScore}`,
        ).toBeGreaterThanOrEqual(minimumScore);
        expect(review.deliveryVerdict, `${review.filePath} delivery verdict`).toBe('pass');
        expect(
          review.deliveryScore,
          `${review.filePath} delivery score ${review.deliveryScore} is below ${minimumDeliveryScore}`,
        ).toBeGreaterThanOrEqual(minimumDeliveryScore);
      }
      return;
    }
    default:
      throw new Error(`unsupported delivery contract: ${contract.id}`);
  }
}

async function runPackagedContract(contract: UiContract) {
  ensurePackagedExecutable();

  switch (contract.id) {
    case 'UI-PACKAGED-VERIFICATION-ENTRY-PUBLISHED': {
      ensurePreservedProjectFixture();
      const publishResult = runNodeScript('scripts/publish-packaged-verification-entry.mjs');
      expectCommandSucceeded(publishResult, contract.id);

      const latestRun = newestDirectory(path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish'));
      const summary = loadJson<PackagedPublishSummary>(path.join(latestRun, 'summary.json'));
      expect(fs.existsSync(summary.launcherPath), `launcher is missing: ${summary.launcherPath}`).toBe(true);
      expect(fs.existsSync(summary.pointerPath), `pointer is missing: ${summary.pointerPath}`).toBe(true);
      expect(fs.existsSync(summary.readmePath), `readme is missing: ${summary.readmePath}`).toBe(true);
      expect(summary.preservedProjectRoot.startsWith(resolveManualProjectsRoot(REPO_ROOT))).toBe(true);
      expect(summary.dedicatedUserDataRoot.startsWith(resolveManualProjectsRoot(REPO_ROOT))).toBe(true);
      return;
    }
    case 'UI-PACKAGED-PRESERVED-PROJECT-REOPENS': {
      ensurePreservedProjectFixture();
      const { logPath, result } = runVirtualDesktopNodeScript(
        'scripts/run-packaged-project-validation.mjs',
        'task5-packaged-project-validation.log',
        'Codex Task5 Packaged Project Validation',
      );
      expectCommandSucceeded(result, contract.id, logPath);

      const latestRun = newestDirectory(path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation'));
      const summary = loadJson<PackagedProjectValidationSummary>(path.join(latestRun, 'summary.json'));
      expect(summary.preservedProjectRoot.startsWith(resolveManualProjectsRoot(REPO_ROOT))).toBe(true);
      expect(fs.existsSync(path.join(summary.latestExportRoot, 'manifest.json'))).toBe(true);
      expect(summary.screenshotPaths.length).toBeGreaterThanOrEqual(
        typeof contract.assert.quality?.requiredScreenshots === 'number'
          ? contract.assert.quality.requiredScreenshots
          : 6,
      );
      expect(summary.checks.every((check) => check.ok)).toBe(true);
      expect(summary.appLogBlockingEvents ?? [], 'packaged validation must not emit blocking app log events').toEqual([]);

      const coldStartMaxMs = typeof contract.assert.quality?.coldStartMaxMs === 'number'
        ? contract.assert.quality.coldStartMaxMs
        : 10_000;
      const reopenReadyMaxMs = typeof contract.assert.quality?.reopenReadyMaxMs === 'number'
        ? contract.assert.quality.reopenReadyMaxMs
        : 8_000;
      expect(summary.coldStartVisibleMs ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(coldStartMaxMs);
      expect(summary.reopenReadyMs ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(reopenReadyMaxMs);

      const minimumDeliveryScore = typeof contract.assert.quality?.minimumDeliveryScore === 'number'
        ? contract.assert.quality.minimumDeliveryScore
        : 90;
      expect(summary.docScores.length, 'packaged validation must preserve source document quality scores').toBeGreaterThan(0);
      const failingDocScores = summary.docScores.filter((item) =>
        item.deliveryVerdict !== 'pass' || (item.deliveryScore ?? 0) < minimumDeliveryScore
      );
      expect(
        failingDocScores,
        `packaged validation doc scores must all pass delivery bar ${minimumDeliveryScore}`,
      ).toEqual([]);
      return;
    }
    case 'UI-PACKAGED-DIRECT-OPEN-RESTORES-PRESERVED-PROJECT': {
      ensurePreservedProjectFixture();
      const publishResult = runNodeScript('scripts/publish-packaged-verification-entry.mjs');
      expectCommandSucceeded(publishResult, `${contract.id} publish prerequisite`);

      const { logPath, result } = runVirtualDesktopNodeScript(
        'scripts/run-direct-packaged-open-validation.mjs',
        'task5-direct-packaged-open.log',
        'Codex Task5 Direct Packaged Open',
      );
      expectCommandSucceeded(result, contract.id, logPath);

      const latestRun = newestDirectory(path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation'));
      const summary = loadJson<DirectOpenSummary>(path.join(latestRun, 'summary.json'));
      expect(summary.actualProjectRoot).toBe(summary.expectedProjectRoot);
      expect(fs.existsSync(summary.screenshotPath)).toBe(true);

      const launchToProjectMaxMs = typeof contract.assert.quality?.launchToProjectMaxMs === 'number'
        ? contract.assert.quality.launchToProjectMaxMs
        : 10_000;
      expect(summary.launchToProjectMs).toBeLessThanOrEqual(launchToProjectMaxMs);
      return;
    }
    default:
      throw new Error(`unsupported packaged contract: ${contract.id}`);
  }
}

export async function runHandoffOrQualityContract(contract: UiContract) {
  if (contract.kind === 'delivery') {
    await runDeliveryContract(contract);
    return;
  }
  if (contract.kind === 'packaged') {
    await runPackagedContract(contract);
    return;
  }
  throw new Error(`unsupported handoff/quality contract kind: ${contract.kind}`);
}
