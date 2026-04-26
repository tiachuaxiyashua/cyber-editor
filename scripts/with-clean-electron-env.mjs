import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Missing command.');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const resolveCommand = (input) => {
  if (!input) {
    return input;
  }

  const localBinBase = resolve(process.cwd(), 'node_modules', '.bin', input);
  if (process.platform === 'win32') {
    const cmdPath = `${localBinBase}.cmd`;
    if (existsSync(cmdPath)) {
      return cmdPath;
    }
  }

  if (existsSync(localBinBase)) {
    return localBinBase;
  }

  return input;
};

const resolvedCommand = resolveCommand(command);
const isWindowsBatchScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand);
const spawnCommand = isWindowsBatchScript ? env.ComSpec ?? 'cmd.exe' : resolvedCommand;
const spawnArgs = isWindowsBatchScript
  ? ['/d', '/s', '/c', resolvedCommand, ...args]
  : args;

const child = spawn(spawnCommand, spawnArgs, {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
