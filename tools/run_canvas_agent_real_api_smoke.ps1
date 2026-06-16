param(
  [ValidateSet("Module", "Browser", "All")]
  [string]$Mode = "Module",
  [string]$Url = "http://127.0.0.1:8777",
  [string]$Out = "output\regression\real-api-smoke\early-baseline",
  [int]$TimeoutMs = 90000,
  [string]$Node = "D:\Aic\node.exe",
  [string]$Chrome = ""
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path -Path $PSScriptRoot -ChildPath "assistant_real_api_smoke.mjs"
if (!(Test-Path -LiteralPath $scriptPath)) {
  throw "Missing smoke runner: $scriptPath"
}

$args = @($scriptPath, "--mode", $Mode, "--url", $Url, "--out", $Out, "--timeoutMs", $TimeoutMs)
if ($Chrome) {
  $args += @("--chrome", $Chrome)
}

& $Node @args
exit $LASTEXITCODE
