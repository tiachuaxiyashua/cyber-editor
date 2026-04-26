import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

async function loadHelpers() {
  const module = await import('../../scripts/lib/packaged-project-paths.mjs');
  return {
    resolvePackagedExecutablePath: module.resolvePackagedExecutablePath as (
      repoRoot: string,
      platform?: string
    ) => string,
    resolveManualProjectsRoot: module.resolveManualProjectsRoot as (repoRoot: string) => string,
    findLatestExtremeValidationProject: module.findLatestExtremeValidationProject as (
      repoRoot: string,
      options?: { requireExportSuite?: boolean }
    ) => null | {
      suiteName: string;
      suiteRoot: string;
      projectRoot: string;
      qualityReportPath: string | null;
    }
  };
}

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('packaged project path helpers', () => {
  it('resolves the stable preserved project root outside out/package', async () => {
    const { resolveManualProjectsRoot } = await loadHelpers();

    expect(resolveManualProjectsRoot('E:/repo')).toBe(path.resolve('E:/repo', 'out', 'manual-projects'));
  });

  it('resolves the packaged executable path per platform', async () => {
    const { resolvePackagedExecutablePath } = await loadHelpers();

    expect(resolvePackagedExecutablePath('E:/repo', 'win32')).toContain(path.join('out', 'package', 'Cyber Editor-win32-x64', 'Cyber Editor.exe'));
    expect(resolvePackagedExecutablePath('E:/repo', 'darwin')).toContain(path.join('out', 'package', 'Cyber Editor-darwin-arm64'));
    expect(resolvePackagedExecutablePath('E:/repo', 'linux')).toContain(path.join('out', 'package', 'Cyber Editor-linux-x64', 'cyber-editor'));
  });

  it('finds the newest extreme validation project that still has a project manifest', async () => {
    const { findLatestExtremeValidationProject } = await loadHelpers();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-paths-'));
    tempRoots.push(repoRoot);

    const olderProject = path.join(
      repoRoot,
      'artifacts',
      'post-change-extreme-validation',
      '2026-04-21T08-00-00-000Z',
      'real-qwen-closed-loop-delivery',
      'workspace',
      'extreme-qwen-delivery',
      '.project'
    );
    fs.mkdirSync(olderProject, { recursive: true });

    const newerSuiteRoot = path.join(
      repoRoot,
      'artifacts',
      'post-change-extreme-validation',
      '2026-04-22T09-58-10-557Z',
      'real-qwen-closed-loop-delivery'
    );
    fs.mkdirSync(path.join(newerSuiteRoot, 'workspace', 'extreme-qwen-delivery', '.project'), { recursive: true });
    fs.writeFileSync(path.join(newerSuiteRoot, 'doc-quality-review.json'), '{}', 'utf8');

    const found = findLatestExtremeValidationProject(repoRoot);
    expect(found?.suiteName).toBe('2026-04-22T09-58-10-557Z');
    expect(found?.projectRoot).toContain(path.join('workspace', 'extreme-qwen-delivery'));
    expect(found?.qualityReportPath).toContain('doc-quality-review.json');
  });

  it('supports requiring at least one export suite under 03-openspec/exports', async () => {
    const { findLatestExtremeValidationProject } = await loadHelpers();
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-editor-packaged-paths-'));
    tempRoots.push(repoRoot);

    const newestWithoutExports = path.join(
      repoRoot,
      'artifacts',
      'post-change-extreme-validation',
      '2026-04-24T11-11-11-111Z',
      'real-qwen-closed-loop-delivery',
      'workspace',
      'extreme-qwen-delivery',
      '.project'
    );
    fs.mkdirSync(newestWithoutExports, { recursive: true });

    const matchingExportSuite = path.join(
      repoRoot,
      'artifacts',
      'post-change-extreme-validation',
      '2026-04-23T10-10-10-999Z',
      'real-qwen-closed-loop-delivery'
    );
    const matchingExportProject = path.join(
      matchingExportSuite,
      'workspace',
      'extreme-qwen-delivery',
      '.project'
    );
    fs.mkdirSync(matchingExportProject, { recursive: true });
    fs.mkdirSync(path.join(matchingExportProject, '..', '03-openspec', 'exports', 'latest-suite'), { recursive: true });

    const foundNoFilter = findLatestExtremeValidationProject(repoRoot);
    expect(foundNoFilter?.suiteName).toBe('2026-04-24T11-11-11-111Z');

    const foundWithExportFilter = findLatestExtremeValidationProject(
      repoRoot,
      { requireExportSuite: true },
    );
    expect(foundWithExportFilter?.suiteName).toBe('2026-04-23T10-10-10-999Z');
    expect(foundWithExportFilter?.projectRoot).toContain(path.join('workspace', 'extreme-qwen-delivery'));
  });
});
