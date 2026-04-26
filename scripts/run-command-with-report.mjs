import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const reportRoot = path.join(repoRoot, 'artifacts', 'test-runs');

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
  const commandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];
  let name = 'command';

  for (let index = 0; index < optionArgs.length; index += 1) {
    if (optionArgs[index] === '--name') {
      name = optionArgs[index + 1] ?? name;
      index += 1;
    }
  }

  if (!commandArgs.length) {
    throw new Error('Missing command after --');
  }

  return {
    name: name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'command',
    command: commandArgs[0],
    args: commandArgs.slice(1),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const { name, command, args } = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const runRoot = path.join(reportRoot, `${stamp}-${name}`);
  const logPath = path.join(runRoot, 'command.log');
  const summaryPath = path.join(runRoot, 'summary.json');
  const latestSummaryPath = path.join(reportRoot, `latest-${name}.json`);
  const latestLogPath = path.join(reportRoot, `latest-${name}.log`);

  ensureDir(runRoot);
  ensureDir(reportRoot);

  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
  });

  const append = (chunk) => {
    process.stdout.write(chunk);
    logStream.write(chunk);
  };

  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const exitCode = await new Promise((resolve) => {
    child.on('error', (error) => {
      const message = `${error.stack ?? error.message}\n`;
      process.stderr.write(message);
      logStream.write(message);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });

  await new Promise((resolve) => logStream.end(resolve));

  const finishedAt = new Date();
  const summary = {
    name,
    command: [command, ...args].join(' '),
    exitCode,
    status: exitCode === 0 ? 'passed' : 'failed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    runRoot,
    logPath,
  };

  writeJson(summaryPath, summary);
  writeJson(latestSummaryPath, summary);
  fs.copyFileSync(logPath, latestLogPath);

  console.log(`\n[command-report] summary -> ${summaryPath}`);
  console.log(`[command-report] latest  -> ${latestSummaryPath}`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
