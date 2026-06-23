param(
  [string]$Url = "http://127.0.0.1:8777",
  [string]$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$Out = "output\regression\assistant-live",
  [switch]$PreflightOnly,
  [switch]$RealApiSmoke,
  [ValidateSet("Module", "Browser", "All")]
  [string]$RealApiSmokeMode = "Module",
  [switch]$FailOnSmokeFailure
)

$ErrorActionPreference = "Stop"
$PreflightResults = @()
$ArtifactSet = @()
$RealApiSmokeResult = $null
$ArtifactSetId = "r5-wrapper-run-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$MaxR5FixtureAttempts = 3

function Assert-LastCommandSucceeded {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [int]$ExitCode = $LASTEXITCODE
  )

  if ($ExitCode -ne 0) {
    throw "$Name failed with exit $ExitCode"
  }
}

function Add-PreflightResult {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $script:PreflightResults += [ordered]@{
    name = $Name
    passed = $true
  }
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath,
    [AllowEmptyString()]
    [string]$Content
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($LiteralPath, $Content, $encoding)
}

function Test-R5RetryableJourneyFailure {
  param(
    [AllowEmptyString()]
    [string]$OutputText
  )

  $retryableMarkers = @(
    "net::ERR_NO_BUFFER_SPACE",
    "v2-initial-loader",
    "intercepts pointer events"
  )
  foreach ($marker in $retryableMarkers) {
    if ($OutputText -like "*$marker*") {
      return $true
    }
  }
  return $false
}

function Invoke-R5RealApiSmoke {
  if (!$RealApiSmoke) {
    return
  }

  Write-Host "[R5] optional real API smoke ($RealApiSmokeMode)"
  $smokeOut = Join-Path -Path $Out -ChildPath "real-api-smoke"
  $smokeScript = Join-Path -Path $PSScriptRoot -ChildPath "run_canvas_agent_real_api_smoke.ps1"
  $output = & powershell -ExecutionPolicy Bypass -File $smokeScript -Mode $RealApiSmokeMode -Url $Url -Out $smokeOut -Chrome $Chrome 2>&1
  $exitCode = $LASTEXITCODE
  $outputLines = @($output | ForEach-Object { "$_" })
  $outputLines | ForEach-Object { Write-Host $_ }
  $outputJson = ($outputLines -join "`n")
  $script:RealApiSmokeResult = [ordered]@{
    mode = $RealApiSmokeMode
    passed = ($exitCode -eq 0)
    outputDir = $smokeOut
    output = $outputJson
  }
  if ($outputJson.Trim()) {
    try {
      $parsed = $outputJson | ConvertFrom-Json
      $script:RealApiSmokeResult.status = $parsed.status
      $script:RealApiSmokeResult.failureCategory = $parsed.failureCategory
      $script:RealApiSmokeResult.artifactPath = $parsed.artifactPath
    } catch {
      $script:RealApiSmokeResult.parseWarning = $_.Exception.Message
    }
  }
  $script:PreflightResults += [ordered]@{
    name = "real API smoke"
    passed = ($exitCode -eq 0)
    soft = !$FailOnSmokeFailure
  }
  if ($exitCode -ne 0 -and $FailOnSmokeFailure) {
    throw "Real API smoke failed with exit $exitCode"
  }
}

Write-Host "[R5] frontend regression"
D:\Aic\node.exe --test `
  modules\assistant\assistantProtocol.test.js `
  modules\assistant\assistantStreamingClient.test.js `
  modules\assistant\assistantActionContract.test.js `
  modules\assistant\assistantConfirmationPolicy.test.js `
  modules\assistant\assistantConversationStore.test.js `
  modules\assistant\assistantAttachmentStore.test.js `
  modules\assistant\assistantModelRegistry.test.js `
  modules\assistant\assistantGenerationTaskStore.test.js `
  modules\assistant\assistantActionPreviewModel.test.js `
  modules\assistant\assistantActionExecutor.test.js `
  modules\assistant\assistantActionPreview.test.js `
  modules\assistant\assistantContextBuilder.test.js `
  modules\app\appAssistantPanel.streaming.test.js `
  modules\app\appAssistantPanel.context.test.js `
  modules\app\appAssistantPanel.p1Ui.test.js `
  modules\app\appAssistantPanel.autoload.test.js `
  modules\app\appAssistantPanel.test.js `
  api\canvasAgentApi.streaming.test.js `
  api\canvasAgentApi.test.js `
  tools\assistant_live_artifact_utils.test.mjs `
  tools\assistant_panel_live_screenshot_check.test.mjs `
  tools\assistant_live_artifact_validator.test.mjs
Assert-LastCommandSucceeded -Name "frontend regression"
Add-PreflightResult -Name "frontend regression"

Write-Host "[R5] backend regression"
python -m unittest `
  canvas_agent_action_schema_envelope_test `
  canvas_agent_conversation_service_test `
  canvas_agent_action_schema_test `
  canvas_agent_route_service_test `
  pi_bridge_service_test `
  canvas_agent_context_service_test `
  http_route_dispatcher_test `
  assistant_live_run_scorecard_test
Assert-LastCommandSucceeded -Name "backend regression"
Add-PreflightResult -Name "backend regression"

Write-Host "[R5] P0-P4 audit"
if (!(Test-Path -LiteralPath 'docs\PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md')) {
  throw "Missing P0-P4 completion audit."
}
python -m unittest `
  claw_assistant_regression_artifacts_test.py `
  canvas_agent_r5_runner_test.py
Assert-LastCommandSucceeded -Name "P0-P4 audit unit tests"
python tools\run_pi_canvas_agent_offline_regression.py
Assert-LastCommandSucceeded -Name "Pi offline regression"
Add-PreflightResult -Name "P0-P4 audit"

Write-Host "[R5] P4 platform regression"
D:\Aic\node.exe --test `
  modules\assistant\assistantAgentOrchestrator.test.js `
  modules\assistant\assistantCreativeHub.test.js `
  modules\assistant\assistantExperimentAnalytics.test.js `
  modules\assistant\assistantAuditExport.test.js `
  modules\assistant\assistantModelRegistry.test.js `
  modules\assistant\assistantSyncService.test.js `
  integrations\pi_canvas_agent\src\huanyingTools.test.ts
Assert-LastCommandSucceeded -Name "P4 platform regression"
Add-PreflightResult -Name "P4 platform regression"

Invoke-R5RealApiSmoke

if ($PreflightOnly) {
  Write-Host "[R5] preflight-only complete"
  $PreflightResults | ConvertTo-Json -Depth 5
  return
}

function Invoke-R5FixtureJourney {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Fixture
  )

  $outputText = ""
  for ($attempt = 1; $attempt -le $MaxR5FixtureAttempts; $attempt++) {
    if ($attempt -gt 1) {
      Write-Host "[R5] retrying fixture $Fixture after transient browser loader failure ($attempt/$MaxR5FixtureAttempts)"
    }
    $output = & D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url $Url --out $Out --fixture $Fixture --r5-journey --browser-executable $Chrome 2>&1
    $journeyExitCode = $LASTEXITCODE
    $outputLines = @($output | ForEach-Object { "$_" })
    $outputLines | ForEach-Object { Write-Host $_ }
    $outputText = $outputLines -join "`n"
    if ($journeyExitCode -eq 0) {
      break
    }
    if (($attempt -lt $MaxR5FixtureAttempts) -and (Test-R5RetryableJourneyFailure -OutputText $outputText)) {
      Start-Sleep -Seconds 3
      continue
    }
    throw "R5 fixture journey failed: $Fixture"
  }

  $result = $outputText | ConvertFrom-Json
  if (!$result.artifactDir) {
    throw "R5 fixture journey did not return an artifactDir: $Fixture"
  }

  $artifactDir = [string]$result.artifactDir
  $provenancePath = Join-Path -Path $artifactDir -ChildPath 'p0-p4-live-artifact-provenance.json'
  $provenance = [ordered]@{
    schema = "canvas-agent-r5-artifact-provenance-v1"
    producedBy = "tools/run_canvas_agent_r5_regression.ps1"
    sourceRequirement = "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md"
    p0P4AuditPath = "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md"
    artifactValidator = "tools/assistant_live_artifact_validator.mjs"
    fixture = $Fixture.Replace('\', '/')
    artifactSetId = $ArtifactSetId
    preflightGates = @(
      "frontend regression",
      "backend regression",
      "P0-P4 audit",
      "P4 platform regression"
    )
    preflightResults = $PreflightResults
    servicePolicy = [ordered]@{
      userManaged8777 = $true
      noServiceManagementOrProbe = $true
    }
  }
  Write-Utf8NoBomFile -LiteralPath $provenancePath -Content ($provenance | ConvertTo-Json -Depth 5)

  D:\Aic\node.exe tools\assistant_live_artifact_validator.mjs $artifactDir
  if ($LASTEXITCODE -ne 0) {
    throw "R5 artifact validation failed: $artifactDir"
  }
  $artifactSetRootPath = (Resolve-Path -LiteralPath $Out).Path
  $artifactPath = (Resolve-Path -LiteralPath $artifactDir).Path
  $artifactSetRootUri = [Uri]($artifactSetRootPath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar)
  $artifactUri = [Uri]$artifactPath
  $relativeArtifactDir = [Uri]::UnescapeDataString($artifactSetRootUri.MakeRelativeUri($artifactUri).ToString()).Replace('\', '/')
  $script:ArtifactSet += [ordered]@{
    fixture = $Fixture.Replace('\', '/')
    artifactDir = $relativeArtifactDir
  }
  return $result
}

Write-Host "[R5] live fixture journeys"
Invoke-R5FixtureJourney -Fixture docs\assistant_live_cases\r5-basic-create-connect-layout-focus.json
Invoke-R5FixtureJourney -Fixture docs\assistant_live_cases\r5-generation-permission-gate.json
Invoke-R5FixtureJourney -Fixture docs\assistant_live_cases\r5-invalid-delta-actions-do-not-execute.json

$artifactSetManifestPath = Join-Path -Path $Out -ChildPath 'p0-p4-live-artifact-set.json'
$artifactSetManifest = [ordered]@{
  schema = "canvas-agent-r5-artifact-set-v1"
  producedBy = "tools/run_canvas_agent_r5_regression.ps1"
  sourceRequirement = "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md"
  p0P4AuditPath = "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md"
  artifactValidator = "tools/assistant_live_artifact_validator.mjs"
  artifactSetId = $ArtifactSetId
  requiredFixtures = @(
    "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "docs/assistant_live_cases/r5-generation-permission-gate.json",
    "docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json"
  )
  completionAuditResult = 'p0-p4-completion-audit-result.json'
  preflightResults = $PreflightResults
  artifacts = $ArtifactSet
  realApiSmoke = $RealApiSmokeResult
  servicePolicy = [ordered]@{
    userManaged8777 = $true
    noServiceManagementOrProbe = $true
  }
}
Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath -Content ($artifactSetManifest | ConvertTo-Json -Depth 8)
Write-Host "[R5] artifact set manifest $artifactSetManifestPath"

Write-Host "[R5] final P0-P4 completion audit"
$completionAuditResultPath = Join-Path -Path $Out -ChildPath 'p0-p4-completion-audit-result.json'
$completionAuditOutput = & python tools\audit_pi_canvas_agent_p0_p4_completion.py --live-artifact-set $artifactSetManifestPath
$completionAuditExitCode = $LASTEXITCODE
$completionAuditOutput | ForEach-Object { Write-Host $_ }
Write-Utf8NoBomFile -LiteralPath $completionAuditResultPath -Content ($completionAuditOutput -join [Environment]::NewLine)
Write-Host "[R5] completion audit result $completionAuditResultPath"
$completionAuditPayload = Get-Content -LiteralPath $completionAuditResultPath -Raw | ConvertFrom-Json
if ($completionAuditPayload.schema -ne "pi-canvas-agent-p0-p4-completion-audit-v1") {
  throw "P0-P4 completion audit result schema mismatch."
}
if ($completionAuditPayload.complete -ne $true) {
  throw "P0-P4 completion audit result did not report complete=true."
}
Assert-LastCommandSucceeded -Name "P0-P4 completion audit artifact set" -ExitCode $completionAuditExitCode

Write-Host "[R5] scoped secret scan"
$secretScanPaths = @(
  $artifactSetManifestPath,
  $completionAuditResultPath
)
if (Test-Path -LiteralPath $Out) {
  $secretScanPaths += Get-ChildItem -LiteralPath $Out -Recurse -File |
    Where-Object {
      $_.Name -match '\.(json|md|txt|log)$' -and
      (
        $_.Name -like 'real-api-smoke*.json' -or
        $_.Name -like 'skill-trace*.json' -or
        $_.Name -in @(
          'assistant-state.json',
          'graph-after.json',
          'graph-before.json',
          'scorecard.json',
          'fixture-candidate.json',
          'p0-p4-live-artifact-provenance.json',
          'p0-p4-live-artifact-set.json',
          'p0-p4-completion-audit-result.json',
          'run-summary.md'
        )
      )
    } |
    Select-Object -ExpandProperty FullName
}
$secretLikePattern = 's[k]-[A-Za-z0-9_-]{16,}'
$secretScanPaths = @($secretScanPaths | Where-Object { $_ } | Sort-Object -Unique)
$matches = Select-String -Path $secretScanPaths -Pattern $secretLikePattern -ErrorAction SilentlyContinue
if ($matches) {
  $matches | ForEach-Object { "MATCH $($_.Path):$($_.LineNumber)" }
  throw "Secret-prefix scan failed."
}
"TOTAL 0"
