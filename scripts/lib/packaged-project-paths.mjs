import fs from 'node:fs';
import path from 'node:path';

export function resolvePackagedExecutablePath(repoRoot, platform = process.platform) {
  if (platform === 'win32') {
    return path.resolve(repoRoot, 'out', 'package', 'Cyber Editor-win32-x64', 'Cyber Editor.exe');
  }
  if (platform === 'darwin') {
    return path.resolve(repoRoot, 'out', 'package', 'Cyber Editor-darwin-arm64', 'Cyber Editor.app', 'Contents', 'MacOS', 'Cyber Editor');
  }
  return path.resolve(repoRoot, 'out', 'package', 'Cyber Editor-linux-x64', 'cyber-editor');
}

export function resolveManualProjectsRoot(repoRoot) {
  return path.resolve(repoRoot, 'out', 'manual-projects');
}

export function findLatestExtremeValidationProject(repoRoot, options = {}) {
  const suitesRoot = path.resolve(repoRoot, 'artifacts', 'post-change-extreme-validation');
  if (!fs.existsSync(suitesRoot)) {
    return null;
  }

  const { requireExportSuite = false } = options;

  const hasExportSuite = (projectRoot) => {
    if (!requireExportSuite) {
      return true;
    }

    const exportRoot = path.join(projectRoot, '03-openspec', 'exports');
    if (!fs.existsSync(exportRoot)) {
      return false;
    }
    const entries = fs.readdirSync(exportRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));

    return entries.length > 0;
  };

  const suiteNames = fs.readdirSync(suitesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const suiteName of suiteNames) {
    const suiteRoot = path.join(suitesRoot, suiteName);
    const projectRoot = path.join(
      suiteRoot,
      'real-qwen-closed-loop-delivery',
      'workspace',
      'extreme-qwen-delivery'
    );
    const manifestRoot = path.join(projectRoot, '.project');
    if (!fs.existsSync(manifestRoot) || !hasExportSuite(projectRoot)) {
      continue;
    }

    const qualityReportPath = path.join(
      suiteRoot,
      'real-qwen-closed-loop-delivery',
      'doc-quality-review.json'
    );

    return {
      suiteName,
      suiteRoot,
      projectRoot,
      qualityReportPath: fs.existsSync(qualityReportPath) ? qualityReportPath : null
    };
  }

  return null;
}
