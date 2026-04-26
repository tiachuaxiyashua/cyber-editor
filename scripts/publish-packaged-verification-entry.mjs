import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findLatestExtremeValidationProject,
  resolveManualProjectsRoot,
  resolvePackagedExecutablePath
} from './lib/packaged-project-paths.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish', RUN_STAMP);
const PRESERVED_PROJECT_NAME = 'validated-extreme-qwen-delivery';
const POINTER_DIR_NAME = '00-validation-project';
const LAUNCHER_NAME = '00-open-validation-project.cmd';
const README_NAME = '00-validation-project-readme.txt';

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function upsertRecentProject(current, projectRoot) {
  const currentEntries = Array.isArray(current.recentProjects) ? current.recentProjects : [];
  const normalized = currentEntries
    .map((entry) => typeof entry === 'string'
      ? {
          rootPath: path.resolve(entry),
          name: path.basename(path.resolve(entry)) || path.resolve(entry),
          lastOpenedAt: new Date(0).toISOString()
        }
      : {
          rootPath: path.resolve(entry.rootPath),
          name: entry.name || path.basename(path.resolve(entry.rootPath)) || path.resolve(entry.rootPath),
          alias: entry.alias,
          lastOpenedAt: entry.lastOpenedAt || new Date(0).toISOString()
        })
    .filter((entry, index, array) => array.findIndex((item) => item.rootPath === entry.rootPath) === index)
    .filter((entry) => entry.rootPath !== projectRoot);

  return [
    {
      rootPath: projectRoot,
      name: PRESERVED_PROJECT_NAME,
      alias: '验证工程',
      lastOpenedAt: new Date().toISOString()
    },
    ...normalized
  ].slice(0, 8);
}

function buildMergedSettings(current, projectRoot) {
  return {
    ...current,
    sidebar: {
      leftWidth: 280,
      rightWidth: 380,
      leftCollapsed: false,
      rightCollapsed: false,
      activityView: 'project',
      processPanelOpen: false,
      processPanelTab: 'stage',
      documentSplitOpen: false,
      documentSplitRatio: 0.5,
      secondaryDocumentPath: '',
      ...(current.sidebar ?? {})
    },
    recentProjects: upsertRecentProject(current, projectRoot),
    lastProjectPath: projectRoot
  };
}

function createJunction(linkPath, targetPath) {
  fs.rmSync(linkPath, { recursive: true, force: true });
  const result = spawnSync(
    'cmd.exe',
    ['/d', '/s', '/c', 'mklink', '/J', linkPath, targetPath],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n') || `Failed to create junction: ${linkPath}`);
  }
}

function main() {
  ensureDir(RUN_ROOT);

  const executablePath = resolvePackagedExecutablePath(REPO_ROOT);
  assert.ok(fs.existsSync(executablePath), `Missing packaged executable: ${executablePath}`);

  const packageDir = path.dirname(executablePath);
  const source = findLatestExtremeValidationProject(REPO_ROOT);
  assert.ok(source, 'No post-change extreme validation project found.');

  const manualProjectsRoot = resolveManualProjectsRoot(REPO_ROOT);
  const preservedProjectRoot = path.join(manualProjectsRoot, PRESERVED_PROJECT_NAME);
  assert.ok(fs.existsSync(path.join(preservedProjectRoot, '.project', 'manifest.json')), `Missing preserved project: ${preservedProjectRoot}`);

  const dedicatedUserDataRoot = path.join(manualProjectsRoot, '.validation-userdata');
  ensureDir(dedicatedUserDataRoot);

  const dedicatedSettingsPath = path.join(dedicatedUserDataRoot, 'settings.json');
  const dedicatedSettings = buildMergedSettings(readJsonIfExists(dedicatedSettingsPath, {}), preservedProjectRoot);
  writeJson(dedicatedSettingsPath, dedicatedSettings);

  const roamingSettingsPath = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Cyber Editor', 'settings.json');
  const roamingSettings = buildMergedSettings(readJsonIfExists(roamingSettingsPath, {}), preservedProjectRoot);
  writeJson(roamingSettingsPath, roamingSettings);

  const launcherPath = path.join(packageDir, LAUNCHER_NAME);
  const launcherContent = [
    '@echo off',
    'setlocal',
    'set "CYBER_EDITOR_USER_DATA=%~dp0..\\..\\manual-projects\\.validation-userdata"',
    'start "" "%~dp0Cyber Editor.exe"',
    'endlocal',
    ''
  ].join('\r\n');
  writeText(launcherPath, launcherContent);

  const pointerPath = path.join(packageDir, POINTER_DIR_NAME);
  createJunction(pointerPath, preservedProjectRoot);

  const readmePath = path.join(packageDir, README_NAME);
  writeText(
    readmePath,
    [
      'Validation project entry',
      '',
      `Launcher: ${launcherPath}`,
      `Pointer folder: ${pointerPath}`,
      `Real project path: ${preservedProjectRoot}`,
      '',
      'Open 00-open-validation-project.cmd to launch the packaged app into the preserved validation project.',
      'The real project stays under out/manual-projects so repackaging does not delete it.',
      ''
    ].join('\r\n')
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    executablePath,
    packageDir,
    sourceProjectRoot: source.projectRoot,
    preservedProjectRoot,
    dedicatedUserDataRoot,
    dedicatedSettingsPath,
    roamingSettingsPath,
    launcherPath,
    pointerPath,
    readmePath
  };

  writeJson(path.join(RUN_ROOT, 'summary.json'), summary);
  console.log(`[packaged-project-publish] launcher -> ${launcherPath}`);
  console.log(`[packaged-project-publish] pointer  -> ${pointerPath}`);
  console.log(`[packaged-project-publish] summary  -> ${path.join(RUN_ROOT, 'summary.json')}`);
}

try {
  main();
} catch (error) {
  writeJson(path.join(RUN_ROOT, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error)
  });
  console.error('[packaged-project-publish] failed');
  console.error(error);
  process.exitCode = 1;
}
