param(
  [string]$ExePath = "E:\chuan_project\software_factory\out\package\Cyber Editor-win32-x64\Cyber Editor.exe",
  [string]$ScreenshotPath = "E:\chuan_project\software_factory\artifacts\direct-packaged-open-validation\manual-direct-open.png",
  [int]$WaitSeconds = 8
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screenshotDir = Split-Path -Parent $ScreenshotPath
if (-not (Test-Path $screenshotDir)) {
  New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null
}

$proc = Start-Process -FilePath $ExePath -PassThru
try {
  Start-Sleep -Seconds $WaitSeconds
  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bmp.Save($ScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $gfx.Dispose()
    $bmp.Dispose()
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
