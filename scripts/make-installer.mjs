import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { clearOutputDirectory, packageApp } from './package-app.mjs';

delete process.env.ELECTRON_RUN_AS_NODE;

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));

const parseArgs = (argv) => {
  const options = {};

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }

    const [key, value] = arg.slice(2).split('=');
    options[key] = value ?? true;
  }

  return options;
};

const defaultPlatform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
const defaultArch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : 'x64';
const installerSlug = (packageJson.productName || packageJson.name).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const quoteForPowerShell = (input) => `'${String(input).replace(/'/g, "''")}'`;

const runPowerShell = (command) =>
  new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'inherit',
      env
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }

      rejectPromise(new Error(`PowerShell 命令执行失败: ${command}`));
    });

    child.on('error', rejectPromise);
  });

export const makeInstaller = async (rawOptions = {}) => {
  const platform = rawOptions.platform || defaultPlatform;
  const arch = rawOptions.arch || defaultArch;

  if (platform !== 'win32') {
    throw new Error(`当前安装器脚本只支持 win32，收到 platform=${platform}`);
  }

  const packaged = await packageApp({
    platform,
    arch,
    out: rawOptions.packageOut || 'out/package',
    stage: rawOptions.stage || 'out/stage/make-app'
  });

  const appDirectory = packaged[0]?.appPath;

  if (!appDirectory) {
    throw new Error('未找到可用于安装器构建的打包结果。');
  }

  const outputDirectory = resolve(repoRoot, rawOptions.out || 'out/make/portable.windows', arch);
  clearOutputDirectory(outputDirectory);
  mkdirSync(outputDirectory, { recursive: true });
  const archiveName = `${installerSlug}-${packageJson.version}-${platform}-${arch}.zip`;
  const archivePath = resolve(outputDirectory, archiveName);
  const distributionManifestPath = resolve(outputDirectory, `${installerSlug}-${packageJson.version}-${platform}-${arch}.json`);

  console.log(`[make] app=${appDirectory}`);
  console.log(`[make] out=${outputDirectory}`);
  console.log(`[make] archive=${archivePath}`);

  if (platform === 'win32') {
    await runPowerShell(
      `Compress-Archive -Path ${quoteForPowerShell(appDirectory)} -DestinationPath ${quoteForPowerShell(archivePath)} -Force`
    );
  } else {
    throw new Error(`当前可交付压缩链仅支持 win32，收到 platform=${platform}`);
  }

  writeFileSync(distributionManifestPath, JSON.stringify({
    packagingStrategy: 'portable-zip',
    platform,
    arch,
    version: packageJson.version,
    archivePath,
    appDirectory,
    generatedAt: new Date().toISOString(),
    note: 'Default make path intentionally avoids the legacy Windows installer chain so routine packaging stays warning-clean.'
  }, null, 2), 'utf8');

  console.log('[make] done');
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  makeInstaller(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error('[make] failed');
    console.error(error);
    process.exit(1);
  });
}
