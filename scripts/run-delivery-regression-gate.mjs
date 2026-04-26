import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  findLatestExtremeValidationProject,
  resolvePackagedExecutablePath,
} from './lib/packaged-project-paths.mjs';
import {
  buildStepLogPath,
  formatDuration,
  getDependencyBlockers,
  sanitizeStepId,
} from './lib/release-hardening.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = path.join(REPO_ROOT, 'artifacts', 'delivery-regression-gate', RUN_STAMP);
const WINDOWS_VIRTUAL_DESKTOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-on-virtual-desktop.ps1');
const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_STEP_TIMEOUT_MS = 90 * 60 * 1000;

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

function killProcessTree(pid) {
  if (!pid) {
    return { success: false, details: `Missing pid for process tree cleanup: ${pid ?? 'unknown'}` };
  }

  if (process.platform === 'win32') {
    try {
      const result = spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        stdio: 'ignore',
      });
      if (result.status === 0) {
        return {
          success: true,
          status: result.status,
        };
      }
      return {
        success: false,
        status: result.status,
        error: result.error?.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  try {
    process.kill(pid, 'SIGKILL');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function buildCommandText(command, env = {}) {
  const envPrefix = Object.entries(env)
    .map(([key, value]) => `set ${key}=${String(value)}&&`)
    .join(' ');
  return `${envPrefix} ${command}`.trim();
}

function runChildProcess(file, args, { logPath, env = process.env, timeoutMs = DEFAULT_STEP_TIMEOUT_MS }) {
  ensureDir(path.dirname(logPath));
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const startedAt = Date.now();
  const timeoutLimit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_STEP_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: REPO_ROOT,
      env,
      windowsHide: true,
    });

    let output = '';
    let finished = false;

    const endRun = (result) => {
      if (finished) return;
      finished = true;
      logStream.end(() => {
        resolve(result);
      });
    };

    const appendChunk = (chunk) => {
      const text = chunk.toString();
      output += text;
      logStream.write(text);
      process.stdout.write(text);
    };

    const timer = setTimeout(() => {
      if (finished) return;
      const timeoutMessage = `[run-child] Timeout after ${timeoutLimit}ms; attempting process tree cleanup.\n`;
      output += timeoutMessage;
      logStream.write(timeoutMessage);

      const killResult = killProcessTree(child.pid);
      if (!killResult.success) {
        const fallbackMessage = `Process tree cleanup failed: ${killResult.error ?? killResult.details ?? 'unknown reason'}\n`;
        output += fallbackMessage;
        logStream.write(fallbackMessage);
      } else {
        const successMessage = `Process tree cleanup command executed (PID ${child.pid}).\n`;
        output += successMessage;
        logStream.write(successMessage);
      }

      endRun({
        exitCode: 1,
        output,
        durationMs: Date.now() - startedAt,
        error: `Command timed out after ${timeoutLimit}ms`,
        timeout: true,
      });
      child.unref();
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, timeoutLimit);

    timer.unref();

    child.stdout.on('data', appendChunk);
    child.stderr.on('data', appendChunk);

    child.on('error', (error) => {
      clearTimeout(timer);
      if (finished) return;

      const message = `${error.stack ?? error.message}\n`;
      output += message;
      logStream.write(message);
      endRun({
        exitCode: 1,
        output,
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      endRun({
        exitCode: code ?? 1,
        output,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function runCommand(command, {
  logPath,
  env = {},
  virtualDesktop = false,
  desktopName,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
}) {
  const mergedEnv = {
    ...process.env,
    ...env,
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
        buildCommandText(command, env),
      ],
      {
        logPath: `${logPath}.wrapper.log`,
        env: mergedEnv,
        timeoutMs,
      },
    );
  }

  return runChildProcess(
    'cmd.exe',
    ['/d', '/s', '/c', buildCommandText(command, env)],
    {
      logPath,
      env: mergedEnv,
      timeoutMs,
    },
  );
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

function findNewestDirectory(rootPath, previousNames = []) {
  const currentNames = listDirectoryNames(rootPath);
  const previous = new Set(previousNames);
  const created = currentNames.filter((name) => !previous.has(name));
  const candidates = created.length ? created : currentNames;
  if (!candidates.length) {
    return null;
  }
  return path.join(rootPath, candidates[candidates.length - 1]);
}

function createStepDefinitions() {
  return [
    {
      id: 'catalog-integrity',
      title: 'Catalog integrity',
      command: 'npm run test:catalog-integrity',
      required: true,
    },
    {
      id: 'ui-pages',
      title: 'Page-by-page UI validation',
      command: 'npm run test:ui:pages',
      required: true,
      virtualDesktop: true,
    },
    {
      id: 'ui-contracts',
      title: 'UI contract gate',
      command: 'npm run test:ui:contracts',
      required: true,
      virtualDesktop: true,
    },
    {
      id: 'post-change-extreme',
      title: 'Post-change extreme validation',
      command: 'npm run test:post-change-extreme',
      required: true,
      virtualDesktop: true,
    },
    {
      id: 'delivery-quality-contracts',
      title: 'Delivery quality contract gate',
      command: 'npm run test:delivery-quality-contracts',
      required: true,
      dependsOn: ['post-change-extreme'],
    },
    {
      id: 'package',
      title: 'Windows package',
      command: 'npm run package',
      required: true,
    },
    {
      id: 'packaged-ui-contracts',
      title: 'Packaged UI contract gate',
      command: 'npm run test:packaged-ui-contracts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['post-change-extreme', 'package'],
      precheck: () => {
        const failures = [];
        const packagedExecutablePath = resolvePackagedExecutablePath(REPO_ROOT);
        if (!fs.existsSync(packagedExecutablePath)) {
          failures.push(`missing packaged executable: ${packagedExecutablePath}`);
        }
        const latestValidationSuite = findLatestExtremeValidationProject(REPO_ROOT);
        if (!latestValidationSuite) {
          failures.push('missing post-change extreme validation artifacts');
        }
        return failures;
      },
    },
  ];
}

function captureArtifacts(report, extremeRootBefore, packagedPublishBefore, packagedValidationBefore, directOpenBefore) {
  const latestExtremeSuite = findNewestDirectory(
    path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation'),
    extremeRootBefore,
  );
  if (latestExtremeSuite) {
    report.artifacts.latestExtremeSuite = latestExtremeSuite;
  }

  const latestPublishSuite = findNewestDirectory(
    path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish'),
    packagedPublishBefore,
  );
  if (latestPublishSuite) {
    report.artifacts.latestPackagedPublish = latestPublishSuite;
  }

  const latestPackagedValidationSuite = findNewestDirectory(
    path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation'),
    packagedValidationBefore,
  );
  if (latestPackagedValidationSuite) {
    report.artifacts.latestPackagedValidation = latestPackagedValidationSuite;
  }

  const latestDirectOpenSuite = findNewestDirectory(
    path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation'),
    directOpenBefore,
  );
  if (latestDirectOpenSuite) {
    report.artifacts.latestDirectPackagedOpen = latestDirectOpenSuite;
  }

  const packagedExecutablePath = resolvePackagedExecutablePath(REPO_ROOT);
  if (fs.existsSync(packagedExecutablePath)) {
    report.artifacts.packagedExecutable = packagedExecutablePath;
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Delivery Regression Gate',
    '',
    `- Generated At: ${report.generatedAt}`,
    `- Run Root: ${report.runRoot}`,
    `- Overall Status: ${report.overallStatus}`,
    `- Dry Run: ${report.dryRun ? 'yes' : 'no'}`,
    '',
    '## Steps',
    '',
  ];

  for (const step of report.steps) {
    lines.push(`- ${step.id} | ${step.title} | status=${step.status} | required=${step.required ? 'yes' : 'no'} | duration=${formatDuration(step.durationMs)}`);
    if (step.logPath) {
      lines.push(`  - log: ${step.logPath}`);
    }
    for (const note of step.notes ?? []) {
      lines.push(`  - note: ${note}`);
    }
  }

  lines.push('', '## Artifacts', '');
  if (!Object.keys(report.artifacts).length) {
    lines.push('- none');
  } else {
    for (const [key, value] of Object.entries(report.artifacts)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  if (report.failures.length) {
    lines.push('', '## Failures', '');
    for (const failure of report.failures) {
      lines.push(`- ${failure.id}: ${failure.reason}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  ensureDir(RUN_ROOT);
  ensureDir(path.join(RUN_ROOT, 'logs'));

  const report = {
    generatedAt: new Date().toISOString(),
    runRoot: RUN_ROOT,
    dryRun: DRY_RUN,
    overallStatus: 'passed',
    steps: [],
    artifacts: {},
    failures: [],
  };

  const extremeRootBefore = listDirectoryNames(path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation'));
  const packagedPublishBefore = listDirectoryNames(path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish'));
  const packagedValidationBefore = listDirectoryNames(path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation'));
  const directOpenBefore = listDirectoryNames(path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation'));
  const stepDefinitions = createStepDefinitions();
  const stepResults = [];

  for (const step of stepDefinitions) {
    const logPath = buildStepLogPath(RUN_ROOT, step.id);
    const blockers = getDependencyBlockers(step, stepResults);
    const precheckFailures = step.precheck ? step.precheck() : [];

    if (blockers.length > 0 || precheckFailures.length > 0) {
      const notes = [];
      if (blockers.length > 0) {
        notes.push(`Skipped because dependencies failed: ${blockers.join(', ')}`);
      }
      if (precheckFailures.length > 0) {
        notes.push(...precheckFailures);
      }
      const skippedStep = {
        id: step.id,
        title: step.title,
        status: 'failed',
        required: step.required,
        logPath,
        durationMs: 0,
        notes,
      };
      stepResults.push(skippedStep);
      report.steps.push(skippedStep);
      if (step.required) {
        report.failures.push({
          id: step.id,
          reason: notes.join(' | '),
        });
      }
      continue;
    }

    if (DRY_RUN) {
      const dryRunStep = {
        id: step.id,
        title: step.title,
        status: 'dry-run',
        required: step.required,
        logPath,
        durationMs: 0,
        notes: [step.command],
      };
      stepResults.push(dryRunStep);
      report.steps.push(dryRunStep);
      continue;
    }

    console.log(`\n[delivery-gate] ${step.id} -> ${step.title}`);
    const result = await runCommand(step.command, {
      logPath,
      virtualDesktop: step.virtualDesktop,
      desktopName: `Codex ${sanitizeStepId(step.id)}`,
      timeoutMs: step.timeoutMs,
    });

    const stepRecord = {
      id: step.id,
      title: step.title,
      status: result.exitCode === 0 ? 'passed' : 'failed',
      required: step.required,
      logPath,
      durationMs: result.durationMs,
      notes: result.exitCode === 0
        ? []
        : [result.error ? `Command failed: ${result.error}` : 'Command failed. See log.'],
    };

    stepResults.push(stepRecord);
    report.steps.push(stepRecord);

    if (stepRecord.status !== 'passed' && step.required) {
      report.failures.push({
        id: step.id,
        reason: result.error ? `Command failed: ${result.error} (see ${logPath})` : `Command failed. See ${logPath}`,
      });
    }
  }

  captureArtifacts(report, extremeRootBefore, packagedPublishBefore, packagedValidationBefore, directOpenBefore);

  const requiredFailures = report.steps.some((step) => step.required && step.status === 'failed');
  report.overallStatus = requiredFailures ? 'failed' : DRY_RUN ? 'dry-run' : 'passed';

  const summaryPath = path.join(RUN_ROOT, 'summary.json');
  const reportPath = path.join(RUN_ROOT, 'report.md');
  writeJson(summaryPath, report);
  writeMarkdown(reportPath, renderMarkdown(report));

  console.log(`\n[delivery-gate] summary -> ${summaryPath}`);
  console.log(`[delivery-gate] report  -> ${reportPath}`);

  if (report.overallStatus === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  ensureDir(RUN_ROOT);
  writeJson(path.join(RUN_ROOT, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error.stack ?? error.message,
  });
  console.error(error);
  process.exitCode = 1;
});
