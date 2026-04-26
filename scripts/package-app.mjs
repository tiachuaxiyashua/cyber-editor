import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import * as packagerModule from '@electron/packager';

delete process.env.ELECTRON_RUN_AS_NODE;

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const packager = packagerModule.default ?? packagerModule.packager ?? packagerModule;
const electronVersion = JSON.parse(
  readFileSync(resolve(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8')
).version;
const traceFile = resolve(repoRoot, 'out/logs/package-trace.log');

const trace = (message) => {
  mkdirSync(dirname(traceFile), { recursive: true });
  appendFileSync(traceFile, `[${new Date().toISOString()}] ${message}\n`);
};

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

const nodeRoot = dirname(process.execPath);
const npmCli = resolve(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const electronDistDir = resolve(repoRoot, 'node_modules', 'electron', 'dist');
const electronPackagerTempDir = resolve(process.env.TEMP ?? process.env.TMP ?? tmpdir(), 'electron-packager');

const runNode = (args, cwd) =>
  new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(process.execPath, args, {
      cwd,
      stdio: 'inherit',
      env
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }

      rejectPromise(new Error(`命令执行失败: node ${args.join(' ')}`));
    });

    child.on('error', rejectPromise);
  });

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

const runProcess = (command, args, cwd = repoRoot) =>
  new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }

      rejectPromise(new Error(`命令执行失败: ${command} ${args.join(' ')}`));
    });

    child.on('error', rejectPromise);
  });

const quoteForPowerShell = (input) => `'${input.replace(/'/g, "''")}'`;

const isDirectoryLockError = (error) =>
  Boolean(error && typeof error === 'object' && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code));

const findLockingProcesses = (targetDir) => {
  if (process.platform !== 'win32' || !existsSync(targetDir)) {
    return [];
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const targetPattern = `${targetDir}\\*`;
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$target = ${quoteForPowerShell(targetPattern)}`,
    "$items = Get-Process | Where-Object { $_.Path -like $target } | Select-Object @{Name='name';Expression={$_.ProcessName}}, @{Name='pid';Expression={$_.Id}}, @{Name='path';Expression={$_.Path}}",
    "if ($items) { $items | ConvertTo-Json -Compress }"
  ].join('; ');

  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env,
    encoding: 'utf8'
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

export const clearOutputDirectory = (targetDir, dependencies = {}) => {
  const removeDirectory = dependencies.removeDirectory ?? ((directoryPath) => {
    rmSync(directoryPath, { recursive: true, force: true });
  });
  const pathExists = dependencies.exists ?? existsSync;
  const findProcesses = dependencies.findLockingProcesses ?? findLockingProcesses;

  try {
    removeDirectory(targetDir);
  } catch (error) {
    if (!isDirectoryLockError(error) || !pathExists(targetDir)) {
      throw error;
    }

    const lockingProcesses = findProcesses(targetDir);
    if (lockingProcesses.length) {
      const detail = lockingProcesses
        .map((processInfo) => `- ${processInfo.name ?? 'unknown'} (PID ${processInfo.pid ?? '?'}) ${processInfo.path ?? ''}`)
        .join('\n');
      throw new Error(
        `无法清理打包输出目录 ${targetDir}。\n检测到该目录下的已打包程序仍在运行，请先关闭正在运行的已打包程序后再重试，或使用 --out 指定新的输出目录。\n${detail}`,
        { cause: error }
      );
    }

    throw new Error(
      `无法清理打包输出目录 ${targetDir}。\nWindows 拒绝删除该目录，请检查是否有程序、资源管理器窗口或安全软件占用了该目录，然后重试，或使用 --out 指定新的输出目录。`,
      { cause: error }
    );
  }
};

const isPackagerTempError = (error) => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = error.code;
  const relatedPath = [error.path, error.dest]
    .filter(Boolean)
    .some((value) => String(value).includes('electron-packager'));

  return ['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY'].includes(code) && relatedPath;
};

const resetPackagerTempDirectory = () => {
  trace(`packager-temp:reset ${electronPackagerTempDir}`);
  clearOutputDirectory(electronPackagerTempDir);
  mkdirSync(electronPackagerTempDir, { recursive: true });
};

const ensureElectronZip = async (platform, arch) => {
  const zipDir = resolve(repoRoot, 'out/cache/electron-zips');
  const zipPath = resolve(zipDir, `electron-v${electronVersion}-${platform}-${arch}.zip`);

  if (platform !== process.platform || arch !== defaultArch) {
    throw new Error(`当前环境只能自动生成 ${process.platform}/${defaultArch} 的 Electron zip，收到 ${platform}/${arch}`);
  }

  mkdirSync(zipDir, { recursive: true });

  if (!readFileSync(resolve(electronDistDir, 'version'), 'utf8').trim()) {
    throw new Error('本地 Electron dist 不完整，无法创建离线 zip。');
  }

  if (!existsSync(zipPath)) {
    trace(`electronZip:create ${zipPath}`);

    if (process.platform === 'win32') {
      const sourcePattern = resolve(electronDistDir, '*');
      await runPowerShell(
        `Compress-Archive -Path ${quoteForPowerShell(sourcePattern)} -DestinationPath ${quoteForPowerShell(zipPath)} -Force`
      );
    } else {
      await runProcess('zip', ['-r', zipPath, '.'], electronDistDir);
    }

    trace(`electronZip:done ${zipPath}`);
  }

  return { zipDir, zipPath };
};

const prepareStage = async (stageDir) => {
  trace(`prepareStage:start ${stageDir}`);
  rmSync(stageDir, { recursive: true, force: true });

  cpSync(resolve(repoRoot, '.vite'), resolve(stageDir, '.vite'), { recursive: true });
  cpSync(resolve(repoRoot, 'src', 'shared', 'template-packages'), resolve(stageDir, 'src', 'shared', 'template-packages'), { recursive: true });
  cpSync(resolve(repoRoot, 'src', 'shared', 'template-manifests'), resolve(stageDir, 'src', 'shared', 'template-manifests'), { recursive: true });
  cpSync(resolve(repoRoot, 'package.json'), resolve(stageDir, 'package.json'));
  cpSync(resolve(repoRoot, 'package-lock.json'), resolve(stageDir, 'package-lock.json'));

  console.log(`[package] staging=${stageDir}`);
  await runNode([npmCli, 'ci', '--omit=dev', '--ignore-scripts'], stageDir);
  trace(`prepareStage:done ${stageDir}`);
};

export const packageApp = async (rawOptions = {}) => {
  const platform = rawOptions.platform || defaultPlatform;
  const arch = rawOptions.arch || defaultArch;
  const outDir = resolve(repoRoot, rawOptions.out || 'out/package');
  const stageDir = resolve(repoRoot, rawOptions.stage || 'out/stage/app');
  const executableName = packageJson.productName || packageJson.name;

  clearOutputDirectory(outDir);
  await prepareStage(stageDir);
  const { zipDir } = await ensureElectronZip(platform, arch);

  console.log(`[package] platform=${platform} arch=${arch}`);
  console.log(`[package] out=${outDir}`);
  trace(`packager:start platform=${platform} arch=${arch}`);

  const packagerOptions = {
    dir: stageDir,
    out: outDir,
    platform,
    arch,
    electronVersion,
    electronZipDir: zipDir,
    overwrite: true,
    asar: true,
    prune: false,
    junk: true,
    name: executableName,
    executableName,
    appVersion: packageJson.version,
    appCopyright: `Copyright (c) ${new Date().getFullYear()} ${packageJson.author}`,
    afterInitialize: [(hook) => {
      trace(`hook:afterInitialize platform=${hook.platform} arch=${hook.arch} version=${hook.electronVersion}`);
    }],
    afterCopy: [(hook) => {
      trace(`hook:afterCopy platform=${hook.platform} arch=${hook.arch} version=${hook.electronVersion}`);
    }],
    afterAsar: [(hook) => {
      trace(`hook:afterAsar platform=${hook.platform} arch=${hook.arch} version=${hook.electronVersion}`);
    }],
    afterComplete: [(hook) => {
      trace(
        `hook:afterComplete platform=${hook.platform} arch=${hook.arch} version=${hook.electronVersion} buildPath=${hook.buildPath}`
      );
    }],
    win32metadata: {
      CompanyName: packageJson.author,
      FileDescription: packageJson.description,
      InternalName: packageJson.name,
      OriginalFilename: `${executableName}.exe`,
      ProductName: executableName
    }
  };

  resetPackagerTempDirectory();

  let appPaths;
  try {
    appPaths = await packager(packagerOptions);
  } catch (error) {
    if (!isPackagerTempError(error)) {
      throw error;
    }

    trace(`packager:retry-after-temp-error code=${error.code ?? 'unknown'} path=${error.path ?? ''} dest=${error.dest ?? ''}`);
    resetPackagerTempDirectory();
    appPaths = await packager(packagerOptions);
  }

  const result = appPaths.map((appPath) => ({
    appPath,
    name: basename(appPath),
    parent: dirname(appPath)
  }));

  trace(`packager:done count=${result.length}`);
  console.log('[package] done');
  for (const item of result) {
    console.log(`[package] app=${item.appPath}`);
  }

  return result;
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  packageApp(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error('[package] failed');
    console.error(error);
    process.exit(1);
  });
}
