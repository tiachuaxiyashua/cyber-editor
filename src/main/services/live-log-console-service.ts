import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

type SpawnLike = (
  command: string,
  args?: ReadonlyArray<string>,
  options?: SpawnOptions
) => ChildProcess;

function escapePowerShellLiteral(value: string) {
  return value.replace(/'/g, "''");
}

export class LiveLogConsoleService {
  private consoleProcess: Pick<ChildProcess, 'kill' | 'unref' | 'pid'> | null = null;

  constructor(
    private readonly options: {
      platform?: NodeJS.Platform;
      spawn?: SpawnLike;
    } = {}
  ) {}

  sync(input: { enabled: boolean; logFilePath: string }) {
    const platform = this.options.platform ?? process.platform;
    if (!input.enabled || platform !== 'win32') {
      this.close();
      return false;
    }
    if (this.consoleProcess?.pid) {
      return false;
    }
    const spawnProcess = this.options.spawn ?? spawn;
    const escapedPath = escapePowerShellLiteral(input.logFilePath);
    const command = [
      "$Host.UI.RawUI.WindowTitle = 'Cyber Editor Live Log'",
      `$path = '${escapedPath}'`,
      "if (!(Test-Path -LiteralPath $path)) { New-Item -ItemType File -Path $path -Force | Out-Null }",
      "Write-Host 'Cyber Editor Live Log'",
      "Write-Host $path",
      "Write-Host ''",
      'Get-Content -LiteralPath $path -Wait -Tail 80'
    ].join('; ');
    const child = spawnProcess(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', command],
      {
        detached: true,
        windowsHide: false,
        stdio: 'ignore'
      }
    );
    child.unref();
    this.consoleProcess = child;
    return true;
  }

  close() {
    if (this.consoleProcess) {
      try {
        this.consoleProcess.kill();
      } catch {
        // best effort
      }
      this.consoleProcess = null;
    }
  }
}
