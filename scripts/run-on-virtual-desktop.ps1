param(
  [Parameter(Mandatory = $true)]
  [string]$Command,

  [string]$DesktopName = 'Codex Validation',

  [string]$LogPath
)

$ErrorActionPreference = 'Stop'

Import-Module VirtualDesktop -DisableNameChecking

$repoRoot = Split-Path -Parent $PSScriptRoot
$runRoot = Join-Path $repoRoot 'artifacts\virtual-desktop-runs'
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $safeName = ($DesktopName -replace '[^A-Za-z0-9_-]+', '-').Trim('-')
  if ([string]::IsNullOrWhiteSpace($safeName)) {
    $safeName = 'validation'
  }
  $LogPath = Join-Path $runRoot "$stamp-$safeName.log"
}

$logDir = Split-Path -Parent $LogPath
if ($logDir) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$workerScript = Join-Path $env:TEMP ("codex-vd-worker-" + [guid]::NewGuid().ToString() + ".ps1")
$statusPath = Join-Path $env:TEMP ("codex-vd-worker-" + [guid]::NewGuid().ToString() + ".json")

$escapedRepoRoot = $repoRoot.Replace("'", "''")
$escapedLogPath = $LogPath.Replace("'", "''")
$escapedStatusPath = $statusPath.Replace("'", "''")
$workerContent = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$escapedRepoRoot'
`$commandText = @'
$Command
'@
try {
  & cmd.exe /d /s /c `$commandText *>&1 | Tee-Object -FilePath '$escapedLogPath'
  `$exitCode = if (`$LASTEXITCODE -ne `$null) { [int]`$LASTEXITCODE } else { 0 }
} catch {
  (`$_ | Out-String) | Tee-Object -FilePath '$escapedLogPath' -Append | Out-Null
  `$exitCode = 1
}
@{
  exitCode = `$exitCode
  finishedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Path '$escapedStatusPath' -Encoding utf8
exit `$exitCode
"@

Set-Content -Path $workerScript -Value $workerContent -Encoding utf8

$originalDesktop = Get-CurrentDesktop
$validationDesktop = New-Desktop
Set-DesktopName -Desktop $validationDesktop -Name $DesktopName | Out-Null

$worker = $null

try {
  Switch-Desktop -Desktop $validationDesktop -NoAnimation
  $worker = Start-Process -FilePath powershell.exe `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $workerScript) `
    -WindowStyle Hidden `
    -PassThru
  Start-Sleep -Milliseconds 600
  try {
    Switch-Desktop -Desktop $originalDesktop -NoAnimation
  } catch {
  }

  while ($true) {
    try {
      if ($worker.HasExited) {
        break
      }
      Start-Sleep -Milliseconds 500
      $worker.Refresh()
    } catch {
      break
    }
  }

  $exitCode = if (Test-Path $statusPath) {
    try {
      (Get-Content $statusPath -Raw | ConvertFrom-Json).exitCode
    } catch {
      if ($worker.ExitCode -ne $null) { [int]$worker.ExitCode } else { 1 }
    }
  } elseif ($worker.ExitCode -ne $null) {
    [int]$worker.ExitCode
  } else {
    1
  }

  Write-Output "LogPath=$LogPath"
  if (Test-Path $statusPath) {
    Write-Output "StatusPath=$statusPath"
  }
  exit ([int]$exitCode)
} finally {
  try {
    $currentDesktop = Get-CurrentDesktop
    if ((Get-DesktopIndex $currentDesktop) -ne (Get-DesktopIndex $originalDesktop)) {
      Switch-Desktop -Desktop $originalDesktop -NoAnimation
    }
  } catch {
  }

  try {
    Remove-Desktop -Desktop $validationDesktop
  } catch {
  }

  Remove-Item -LiteralPath $workerScript -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $statusPath -Force -ErrorAction SilentlyContinue
}
