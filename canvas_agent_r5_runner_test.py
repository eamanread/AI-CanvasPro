from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent
RUNNER = ROOT / "tools" / "run_canvas_agent_r5_regression.ps1"


class CanvasAgentR5RunnerTests(unittest.TestCase):
    def _script(self) -> str:
        return RUNNER.read_text(encoding="utf-8")

    def test_runner_requires_p0_p4_audit_before_live_journeys(self):
        script = self._script()

        audit_index = script.index("[R5] P0-P4 audit")
        live_index = script.index("[R5] live fixture journeys")

        self.assertLess(audit_index, live_index)
        self.assertIn("docs\\PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md", script)
        self.assertIn("claw_assistant_regression_artifacts_test.py", script)
        self.assertIn("python tools\\run_pi_canvas_agent_offline_regression.py", script)

    def test_runner_includes_p4_platform_sources_before_live_journeys(self):
        script = self._script()

        p4_index = script.index("[R5] P4 platform regression")
        live_index = script.index("[R5] live fixture journeys")

        self.assertLess(p4_index, live_index)
        self.assertIn("modules\\assistant\\assistantAgentOrchestrator.test.js", script)
        self.assertIn("modules\\assistant\\assistantCreativeHub.test.js", script)
        self.assertIn("modules\\assistant\\assistantExperimentAnalytics.test.js", script)
        self.assertIn("modules\\assistant\\assistantAuditExport.test.js", script)
        self.assertIn("modules\\assistant\\assistantSyncService.test.js", script)


    def test_runner_preflights_live_artifact_validator_tests(self):
        script = self._script()

        live_index = script.index("[R5] live fixture journeys")
        validator_test_index = script.index("tools\\assistant_live_artifact_validator.test.mjs")

        self.assertLess(validator_test_index, live_index)


    def test_runner_validates_each_live_artifact_bundle(self):
        script = self._script()

        function_index = script.index("function Invoke-R5FixtureJourney")
        live_index = script.index("[R5] live fixture journeys")
        validator_index = script.index("assistant_live_artifact_validator.mjs", function_index)
        fixture_call_index = script.index("Invoke-R5FixtureJourney -Fixture", live_index)

        self.assertLess(function_index, live_index)
        self.assertGreater(validator_index, function_index)
        self.assertGreater(fixture_call_index, live_index)
        self.assertIn("artifactDir", script[function_index:live_index])

    def test_runner_retries_only_known_transient_browser_loader_failures(self):
        script = self._script()
        function_index = script.index("function Invoke-R5FixtureJourney")
        live_index = script.index("[R5] live fixture journeys")
        function_body = script[function_index:live_index]

        self.assertIn("$MaxR5FixtureAttempts = 3", script)
        self.assertIn("function Test-R5RetryableJourneyFailure", script)
        self.assertIn("net::ERR_NO_BUFFER_SPACE", script)
        self.assertIn("v2-initial-loader", script)
        self.assertIn("intercepts pointer events", script)
        self.assertIn("for ($attempt = 1; $attempt -le $MaxR5FixtureAttempts; $attempt++)", function_body)
        self.assertIn("$journeyExitCode = $LASTEXITCODE", function_body)
        self.assertIn("Test-R5RetryableJourneyFailure -OutputText $outputText", function_body)
        self.assertIn("Start-Sleep -Seconds 3", function_body)
        self.assertIn("continue", function_body)
        self.assertIn("throw \"R5 fixture journey failed: $Fixture\"", function_body)

    def test_runner_writes_p0_p4_provenance_before_validation(self):
        script = self._script()

        function_index = script.index("function Invoke-R5FixtureJourney")
        live_index = script.index("[R5] live fixture journeys")
        provenance_index = script.index("p0-p4-live-artifact-provenance.json", function_index)
        validator_index = script.index("D:\\Aic\\node.exe tools\\assistant_live_artifact_validator.mjs", function_index)

        self.assertLess(provenance_index, validator_index)
        self.assertLess(provenance_index, live_index)
        self.assertIn("canvas-agent-r5-artifact-provenance-v1", script)
        self.assertIn("tools/run_canvas_agent_r5_regression.ps1", script)
        self.assertIn("P0-P4 audit", script[function_index:validator_index])
        self.assertIn("P4 platform regression", script[function_index:validator_index])

    def test_runner_records_passed_preflight_results_for_provenance(self):
        script = self._script()
        live_index = script.index("[R5] live fixture journeys")

        self.assertIn("$PreflightResults", script[:live_index])
        self.assertIn("Assert-LastCommandSucceeded", script[:live_index])
        self.assertIn("Add-PreflightResult", script[:live_index])
        self.assertIn("preflightResults = $PreflightResults", script)

    def test_runner_writes_same_artifact_set_id_to_each_provenance(self):
        script = self._script()
        function_index = script.index("function Invoke-R5FixtureJourney")
        live_index = script.index("[R5] live fixture journeys")

        self.assertIn("$ArtifactSetId", script[:live_index])
        self.assertIn("artifactSetId = $ArtifactSetId", script[function_index:live_index])

    def test_runner_writes_run_level_artifact_set_manifest_after_all_journeys(self):
        script = self._script()
        live_index = script.index("[R5] live fixture journeys")
        secret_scan_index = script.index("[R5] scoped secret scan")

        self.assertIn("$ArtifactSet = @()", script[:live_index])
        self.assertIn("$script:ArtifactSet += [ordered]@{", script)
        self.assertIn("artifactDir = $relativeArtifactDir", script)
        self.assertIn("p0-p4-live-artifact-set.json", script[live_index:secret_scan_index])
        self.assertIn("requiredFixtures", script[live_index:secret_scan_index])
        self.assertIn("artifactSetId = $ArtifactSetId", script[live_index:secret_scan_index])
        self.assertIn("preflightResults = $PreflightResults", script[live_index:secret_scan_index])
        self.assertIn("artifacts = $ArtifactSet", script[live_index:secret_scan_index])

    def test_runner_writes_preflight_results_to_run_level_artifact_set_manifest(self):
        script = self._script()
        live_index = script.index("[R5] live fixture journeys")
        secret_scan_index = script.index("[R5] scoped secret scan")
        manifest_section = script[live_index:secret_scan_index]

        self.assertIn("preflightResults = $PreflightResults", manifest_section)
        self.assertLess(manifest_section.index("preflightResults = $PreflightResults"), manifest_section.index("artifacts = $ArtifactSet"))

    def test_runner_self_checks_completion_audit_after_writing_artifact_set_manifest(self):
        script = self._script()
        manifest_write_index = script.index("Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath")
        secret_scan_index = script.index("[R5] scoped secret scan")
        audit_section = script[manifest_write_index:secret_scan_index]

        self.assertIn("[R5] final P0-P4 completion audit", audit_section)
        self.assertIn("tools\\audit_pi_canvas_agent_p0_p4_completion.py --live-artifact-set $artifactSetManifestPath", audit_section)
        self.assertIn("Assert-LastCommandSucceeded -Name \"P0-P4 completion audit artifact set\"", audit_section)
        self.assertLess(
            audit_section.index("tools\\audit_pi_canvas_agent_p0_p4_completion.py --live-artifact-set $artifactSetManifestPath"),
            audit_section.index("[R5] scoped secret scan") if "[R5] scoped secret scan" in audit_section else len(audit_section),
        )

    def test_runner_persists_final_completion_audit_json_result(self):
        script = self._script()
        manifest_write_index = script.index("Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath")
        secret_scan_index = script.index("[R5] scoped secret scan")
        audit_section = script[manifest_write_index:secret_scan_index]

        self.assertIn(
            "$completionAuditResultPath = Join-Path -Path $Out -ChildPath 'p0-p4-completion-audit-result.json'",
            audit_section,
        )
        self.assertIn(
            "$completionAuditOutput = & python tools\\audit_pi_canvas_agent_p0_p4_completion.py --live-artifact-set $artifactSetManifestPath",
            audit_section,
        )
        self.assertIn(
            "Write-Utf8NoBomFile -LiteralPath $completionAuditResultPath",
            audit_section,
        )
        self.assertLess(
            audit_section.index("p0-p4-completion-audit-result.json"),
            audit_section.index("Assert-LastCommandSucceeded -Name \"P0-P4 completion audit artifact set\""),
        )

    def test_runner_writes_json_artifacts_without_utf8_bom(self):
        script = self._script()

        self.assertIn("function Write-Utf8NoBomFile", script)
        self.assertIn("Write-Utf8NoBomFile -LiteralPath $provenancePath", script)
        self.assertIn("Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath", script)
        self.assertIn("Write-Utf8NoBomFile -LiteralPath $completionAuditResultPath", script)
        self.assertNotIn("Set-Content -LiteralPath $provenancePath -Encoding UTF8", script)
        self.assertNotIn("Set-Content -LiteralPath $artifactSetManifestPath -Encoding UTF8", script)
        self.assertNotIn("Set-Content -LiteralPath $completionAuditResultPath -Encoding UTF8", script)

    def test_runner_artifact_set_manifest_declares_completion_audit_result(self):
        script = self._script()
        live_index = script.index("[R5] live fixture journeys")
        manifest_write_index = script.index("Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath")
        manifest_section = script[live_index:manifest_write_index]

        self.assertIn("completionAuditResult = 'p0-p4-completion-audit-result.json'", manifest_section)
        self.assertIn("$completionAuditResultPath = Join-Path -Path $Out -ChildPath 'p0-p4-completion-audit-result.json'", script)

    def test_runner_parses_saved_completion_audit_json_before_success(self):
        script = self._script()
        manifest_write_index = script.index("Write-Utf8NoBomFile -LiteralPath $artifactSetManifestPath")
        secret_scan_index = script.index("[R5] scoped secret scan")
        audit_section = script[manifest_write_index:secret_scan_index]

        self.assertIn(
            "$completionAuditPayload = Get-Content -LiteralPath $completionAuditResultPath -Raw | ConvertFrom-Json",
            audit_section,
        )
        self.assertIn("pi-canvas-agent-p0-p4-completion-audit-v1", audit_section)
        self.assertIn("$completionAuditPayload.complete -ne $true", audit_section)
        self.assertLess(
            audit_section.index("Write-Utf8NoBomFile -LiteralPath $completionAuditResultPath"),
            audit_section.index("$completionAuditPayload = Get-Content -LiteralPath $completionAuditResultPath -Raw | ConvertFrom-Json"),
        )
        self.assertLess(
            audit_section.index("$completionAuditPayload.complete -ne $true"),
            audit_section.index("Assert-LastCommandSucceeded -Name \"P0-P4 completion audit artifact set\""),
        )

    def test_runner_secret_scans_run_level_manifest_and_audit_result(self):
        script = self._script()
        secret_scan_index = script.index("[R5] scoped secret scan")
        secret_scan_section = script[secret_scan_index:]

        self.assertIn("$secretScanPaths = @(", secret_scan_section)
        self.assertIn("$artifactSetManifestPath", secret_scan_section)
        self.assertIn("$completionAuditResultPath", secret_scan_section)
        self.assertIn("Select-String -Path $secretScanPaths", secret_scan_section)

    def test_runner_secret_scan_uses_key_shaped_pattern_not_short_prefix(self):
        script = self._script()
        secret_scan_index = script.index("[R5] scoped secret scan")
        secret_scan_section = script[secret_scan_index:]

        self.assertIn("$secretLikePattern", secret_scan_section)
        self.assertIn("s[k]-[A-Za-z0-9", secret_scan_section)
        self.assertIn("{16,}", secret_scan_section)
        self.assertNotIn("-Pattern 's[k]-'", secret_scan_section)

    def test_runner_writes_manifest_artifact_dirs_relative_to_output_root(self):
        script = self._script()
        function_index = script.index("function Invoke-R5FixtureJourney")
        live_index = script.index("[R5] live fixture journeys")
        function_body = script[function_index:live_index]

        self.assertIn("$artifactSetRootPath = (Resolve-Path -LiteralPath $Out).Path", function_body)
        self.assertIn("$artifactSetRootUri.MakeRelativeUri($artifactUri)", function_body)
        self.assertIn(".Replace('\\', '/')", function_body)
        self.assertIn("artifactDir = $relativeArtifactDir", function_body)

    def test_runner_supports_preflight_only_without_live_journeys(self):
        script = self._script()

        live_index = script.index("[R5] live fixture journeys")
        preflight_only_index = script.index("[switch]$PreflightOnly")
        preflight_exit_index = script.index("[R5] preflight-only complete")

        self.assertLess(preflight_only_index, live_index)
        self.assertLess(preflight_exit_index, live_index)
        self.assertIn("return", script[preflight_exit_index:live_index])

    def test_runner_does_not_manage_or_probe_8777(self):
        script = self._script()

        forbidden_terms = (
            "Invoke-WebRequest",
            "Test-NetConnection",
            "Start-Process python",
            "python server.py",
            "Stop-Process",
            "Restart-Service",
        )

        for term in forbidden_terms:
            with self.subTest(term=term):
                self.assertNotIn(term, script)


if __name__ == "__main__":
    unittest.main()
