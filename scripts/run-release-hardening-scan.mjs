import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildStepLogPath,
  getDependencyBlockers,
  renderReleaseHardeningMarkdown,
  sanitizeStepId,
  summarizeAuditReport,
  summarizeHardcodeGate
} from './lib/release-hardening.mjs';

const REPO_ROOT = process.cwd();
const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ROOT = path.join(REPO_ROOT, 'artifacts', 'release-hardening', RUN_STAMP);
const WINDOWS_VIRTUAL_DESKTOP_SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-on-virtual-desktop.ps1');
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
    .map((entry) => entry.name);
}

function findNewestDirectory(rootPath, previousNames = []) {
  const currentNames = listDirectoryNames(rootPath).sort();
  const previous = new Set(previousNames);
  const created = currentNames.filter((name) => !previous.has(name));
  const candidates = created.length ? created : currentNames;
  if (!candidates.length) {
    return null;
  }
  return path.join(rootPath, candidates[candidates.length - 1]);
}

function extractJsonPayload(rawOutput) {
  const source = String(rawOutput ?? '').trim();
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) {
    return null;
  }
  const payload = source.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(payload);
  } catch {
    return null;
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
      windowsHide: true
    });

    let combinedOutput = '';
    let finished = false;

    const finishRun = (result) => {
      if (finished) return;
      finished = true;
      logStream.end(() => {
        resolve(result);
      });
    };

    const timer = setTimeout(() => {
      if (finished) return;
      const timeoutMessage = `[run-child] Timeout after ${timeoutLimit}ms; attempting process tree cleanup.\n`;
      combinedOutput += timeoutMessage;
      logStream.write(timeoutMessage);

      const killResult = killProcessTree(child.pid);
      if (!killResult.success) {
        const fallbackMessage = `Process tree cleanup failed: ${killResult.error ?? killResult.details ?? 'unknown reason'}\n`;
        combinedOutput += fallbackMessage;
        logStream.write(fallbackMessage);
      } else {
        const successMessage = `Process tree cleanup command executed (PID ${child.pid}).\n`;
        combinedOutput += successMessage;
        logStream.write(successMessage);
      }

      finishRun({
        exitCode: 1,
        output: combinedOutput,
        durationMs: Date.now() - startedAt,
        error: `Command timed out after ${timeoutLimit}ms`,
        timeout: true,
      });
      child.unref();
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, timeoutLimit);

    timer.unref();

    const writeChunk = (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      logStream.write(text);
      process.stdout.write(text);
    };

    child.stdout.on('data', writeChunk);
    child.stderr.on('data', writeChunk);

    child.on('error', (error) => {
      if (finished) return;
      clearTimeout(timer);
      const message = `${error.stack ?? error.message}\n`;
      combinedOutput += message;
      logStream.write(message);
      finishRun({
        exitCode: 1,
        output: combinedOutput,
        durationMs: Date.now() - startedAt,
        error: error.message
      });
    });

    child.on('close', (code) => {
      if (finished) return;
      clearTimeout(timer);
      finishRun({
        exitCode: code ?? 1,
        output: combinedOutput,
        durationMs: Date.now() - startedAt
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
        env: mergedEnv,
        timeoutMs
      }
    );
  }

  return runChildProcess(
    'cmd.exe',
    ['/d', '/s', '/c', buildCommandText(command, env)],
    {
      logPath,
      env: mergedEnv,
      timeoutMs
    }
  );
}

function createStepDefinitions() {
  return [
    {
      id: 'lint',
      title: 'Type check',
      command: 'npm run lint',
      required: true
    },
    {
      id: 'test-unit',
      title: 'Unit tests',
      command: 'npm run test:unit',
      required: true
    },
    {
      id: 'build',
      title: 'Renderer/main build',
      command: 'npm run build',
      required: true
    },
    {
      id: 'review-hardcode',
      title: 'Hardcode gate',
      command: 'npm run review:hardcode',
      required: true
    },
    {
      id: 'audit-production',
      title: 'Production npm audit',
      command: 'npm audit --omit=dev --json',
      required: true,
      collectJson: true,
      auditScope: 'production'
    },
    {
      id: 'audit-full',
      title: 'Full npm audit',
      command: 'npm audit --json',
      required: false,
      collectJson: true,
      auditScope: 'full'
    },
    {
      id: 'ui-shell',
      title: 'Prototype shell alignment',
      command: 'node scripts/with-clean-electron-env.mjs playwright test tests/e2e/prototype-shell-alignment.spec.ts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'ui-pages',
      title: 'Page-by-page UI validation',
      command: 'node scripts/with-clean-electron-env.mjs node scripts/ui-page-validation.mjs',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'ui-contracts',
      title: 'UI contract gate',
      command: 'node scripts/with-clean-electron-env.mjs playwright test tests/e2e/ui-prototype-contracts.spec.ts tests/e2e/ui-design-contracts.spec.ts tests/e2e/ui-action-contracts.spec.ts tests/e2e/ui-state-contracts.spec.ts tests/e2e/ui-latency-contracts.spec.ts tests/e2e/ui-manipulation-contracts.spec.ts tests/e2e/thinking-map-contracts.spec.ts tests/e2e/delivery-quality-contracts.spec.ts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'ui-orchestration',
      title: 'Critical orchestration workflows',
      command: 'node scripts/with-clean-electron-env.mjs playwright test tests/e2e/critical-editor-workflows.spec.ts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'smoke',
      title: 'Smoke regression',
      command: 'node scripts/with-clean-electron-env.mjs playwright test tests/e2e/smoke.spec.ts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'package',
      title: 'Windows package',
      command: 'node scripts/package-app.mjs',
      required: true,
      dependsOn: ['build']
    },
    {
      id: 'packaged-smoke',
      title: 'Packaged smoke regression',
      command: 'node scripts/with-clean-electron-env.mjs playwright test tests/e2e/packaged-smoke.spec.ts',
      env: {
        CYBER_EDITOR_RUN_PACKAGED_SMOKE: '1'
      },
      required: true,
      virtualDesktop: true,
      dependsOn: ['package']
    },
    {
      id: 'post-change-extreme',
      title: 'Post-change extreme validation',
      command: 'node scripts/with-clean-electron-env.mjs node scripts/run-post-change-extreme-validation.mjs',
      required: true,
      virtualDesktop: true,
      dependsOn: ['build']
    },
    {
      id: 'packaged-project-validation',
      title: 'Packaged preserved-project reopen validation',
      command: 'node scripts/run-packaged-project-validation.mjs',
      required: true,
      virtualDesktop: true,
      dependsOn: ['package', 'post-change-extreme']
    },
    {
      id: 'packaged-ui-contracts',
      title: 'Packaged UI contract gate',
      command: 'npm run test:packaged-ui-contracts',
      required: true,
      virtualDesktop: true,
      dependsOn: ['package', 'post-change-extreme', 'packaged-project-validation']
    }
  ];
}

function captureArtifacts(report) {
  const artifacts = {};

  const hardcodeReportPath = path.join(REPO_ROOT, 'artifacts', 'hardcode-gate', 'latest.json');
  if (fs.existsSync(hardcodeReportPath)) {
    artifacts.hardcodeGate = hardcodeReportPath;
    const hardcode = readJsonIfExists(hardcodeReportPath);
    if (hardcode?.summary) {
      report.hardcodeSummary = hardcode.summary;
    }
  }

  const uiPageReportPath = path.join(REPO_ROOT, 'output', 'playwright', 'ui-page-validation', 'report.json');
  if (fs.existsSync(uiPageReportPath)) {
    artifacts.uiPageValidation = uiPageReportPath;
    const uiReport = readJsonIfExists(uiPageReportPath);
    if (uiReport?.summary) {
      report.uiPageValidationSummary = uiReport.summary;
    }
  }

  const packageExePath = path.join(REPO_ROOT, 'out', 'package', 'Cyber Editor-win32-x64', 'Cyber Editor.exe');
  if (fs.existsSync(packageExePath)) {
    artifacts.packagedExe = packageExePath;
  }

  const packagedProjectValidationRoot = path.join(REPO_ROOT, 'artifacts', 'packaged-project-validation');
  if (fs.existsSync(packagedProjectValidationRoot)) {
    const newestValidationSuite = findNewestDirectory(packagedProjectValidationRoot);
    if (newestValidationSuite) {
      artifacts.packagedProjectValidation = newestValidationSuite;
    }
  }

  const packagedPublishRoot = path.join(REPO_ROOT, 'artifacts', 'packaged-project-publish');
  if (fs.existsSync(packagedPublishRoot)) {
    const newestPublishSuite = findNewestDirectory(packagedPublishRoot);
    if (newestPublishSuite) {
      artifacts.packagedProjectPublish = newestPublishSuite;
    }
  }

  const directPackagedOpenRoot = path.join(REPO_ROOT, 'artifacts', 'direct-packaged-open-validation');
  if (fs.existsSync(directPackagedOpenRoot)) {
    const newestDirectOpenSuite = findNewestDirectory(directPackagedOpenRoot);
    if (newestDirectOpenSuite) {
      artifacts.directPackagedOpenValidation = newestDirectOpenSuite;
    }
  }

  const extremeRoot = path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation');
  if (fs.existsSync(extremeRoot)) {
    const newestExtremeSuite = findNewestDirectory(extremeRoot);
    if (newestExtremeSuite) {
      artifacts.postChangeExtremeSuite = newestExtremeSuite;
      const summaryPath = path.join(newestExtremeSuite, 'summary.json');
      const summary = readJsonIfExists(summaryPath);
      if (summary) {
        report.extremeSummary = summary;
      }

      const qualityPath = path.join(newestExtremeSuite, 'real-qwen-closed-loop-delivery', 'doc-quality-review.json');
      if (fs.existsSync(qualityPath)) {
        artifacts.outputQuality = qualityPath;
        const quality = readJsonIfExists(qualityPath);
        if (quality) {
          report.quality = Object.values(quality).map((item) => ({
            filePath: item.filePath,
            verdict: item.verdict,
            band: item.band,
            score: item.score,
            deliveryScore: item.deliveryScore
          }));
        }
      }
    }
  }

  report.artifacts = artifacts;
}

async function main() {
  ensureDir(RUN_ROOT);
  ensureDir(path.join(RUN_ROOT, 'logs'));

  const report = {
    generatedAt: new Date().toISOString(),
    runRoot: RUN_ROOT,
    overallStatus: 'passed',
    steps: [],
    audits: [],
    artifacts: {},
    failures: []
  };

  const stepResults = [];
  const stepDefinitions = createStepDefinitions();
  const extremeRootBefore = listDirectoryNames(path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation'));

  for (const step of stepDefinitions) {
    const blockers = getDependencyBlockers(step, stepResults);
    const logPath = buildStepLogPath(RUN_ROOT, step.id);

    if (blockers.length > 0) {
      const skippedStep = {
        id: step.id,
        title: step.title,
        status: 'skipped',
        required: step.required,
        logPath,
        durationMs: 0,
        notes: [`Skipped because dependencies failed: ${blockers.join(', ')}`]
      };
      stepResults.push(skippedStep);
      report.steps.push(skippedStep);
      if (step.required) {
        report.failures.push({
          id: step.id,
          reason: skippedStep.notes[0]
        });
      }
      continue;
    }

    console.log(`\n[release-hardening] ${step.id} -> ${step.title}`);
    const result = await runCommand(step.command, {
      logPath,
      env: step.env,
      virtualDesktop: step.virtualDesktop,
      desktopName: `Codex ${sanitizeStepId(step.id)}`,
      timeoutMs: step.timeoutMs,
    });

    let status = result.exitCode === 0 ? 'passed' : 'failed';
    const notes = [];
    if (result.error) {
      notes.push(`Command failed: ${result.error}`);
    }

    if (step.auditScope) {
      const auditPayload = extractJsonPayload(result.output);
      if (auditPayload) {
        const audit = summarizeAuditReport(auditPayload, { scope: step.auditScope });
        report.audits.push(audit);
        notes.push(audit.summary);
        status = audit.status;
      } else {
        notes.push('Failed to parse npm audit JSON payload.');
      }
    }

    if (step.id === 'review-hardcode') {
      const hardcodeReport = readJsonIfExists(path.join(REPO_ROOT, 'artifacts', 'hardcode-gate', 'latest.json'));
      if (hardcodeReport) {
        const hardcode = summarizeHardcodeGate(hardcodeReport);
        notes.push(hardcode.summary);
        status = hardcode.status;
      } else {
        notes.push('Hardcode report missing after review:hardcode run.');
        status = 'failed';
      }
    }

    const stepRecord = {
      id: step.id,
      title: step.title,
      status,
      required: step.required,
      logPath,
      durationMs: result.durationMs,
      notes
    };

    stepResults.push(stepRecord);
    report.steps.push(stepRecord);

    if (status === 'failed' && step.required) {
      report.failures.push({
        id: step.id,
        reason: result.error ? `Command failed: ${result.error} (see ${logPath})` : `Command failed. See ${logPath}`
      });
    }
  }

  const extremeRoot = path.join(REPO_ROOT, 'artifacts', 'post-change-extreme-validation');
  const newestExtremeSuite = findNewestDirectory(extremeRoot, extremeRootBefore);
  if (newestExtremeSuite) {
    report.artifacts.latestExtremeSuiteFromRun = newestExtremeSuite;
  }

  captureArtifacts(report);

  const requiredFailures = report.steps.some((step) => step.required && step.status !== 'passed');
  const warnings = report.steps.some((step) => step.status === 'warn');
  report.overallStatus = requiredFailures ? 'failed' : warnings ? 'warn' : 'passed';

  const summaryPath = path.join(RUN_ROOT, 'summary.json');
  const reportPath = path.join(RUN_ROOT, 'report.md');
  writeJson(summaryPath, report);
  writeMarkdown(reportPath, renderReleaseHardeningMarkdown(report));

  console.log(`\n[release-hardening] summary -> ${summaryPath}`);
  console.log(`[release-hardening] report  -> ${reportPath}`);

  if (report.overallStatus === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const failureRoot = RUN_ROOT || path.join(REPO_ROOT, 'artifacts', 'release-hardening', 'failed-startup');
  ensureDir(failureRoot);
  writeJson(path.join(failureRoot, 'fatal.json'), {
    generatedAt: new Date().toISOString(),
    error: error.stack ?? error.message
  });
  console.error(error);
  process.exitCode = 1;
});
