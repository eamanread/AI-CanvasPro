param(
  [string]$ExePath = "",
  [int]$Port = 18777,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ExePath)) {
  $latest = Get-ChildItem -Path "release/windows/*onefile.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No onefile exe found under release/windows"
  }
  $ExePath = $latest.FullName
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Exe not found: $ExePath"
}

$env:AICANVAS_PORT = [string]$Port
$env:AIC_OPEN_BROWSER = "0"
$env:AIC_PACKAGED_LAUNCHER = "1"
$env:AIC_DISTRIBUTION = "onefile"

$process = Start-Process -FilePath $ExePath -PassThru -WindowStyle Hidden
try {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $runtime = $null
  do {
    Start-Sleep -Milliseconds 500
    try {
      $runtime = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/v2/runtime/info" -TimeoutSec 2
    } catch {
      $runtime = $null
    }
  } while (-not $runtime -and (Get-Date) -lt $deadline)

  if (-not $runtime) {
    throw "Runtime info endpoint did not respond within $TimeoutSeconds seconds"
  }
  if (-not $runtime.success) {
    throw "Runtime info returned success=false"
  }
  if (-not $runtime.isOnefile) {
    throw "Runtime info did not report isOnefile=true"
  }

  $index = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
  if ($index.StatusCode -ne 200) {
    throw "Index request returned status $($index.StatusCode)"
  }

  Write-Host "Smoke passed: $ExePath"
  Write-Host "Storage: $($runtime.storage.writableRoot)"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  Get-CimInstance Win32_Process |
    Where-Object { $_.ExecutablePath -eq $ExePath } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
