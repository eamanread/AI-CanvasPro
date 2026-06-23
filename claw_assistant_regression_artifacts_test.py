import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parent


class ClawAssistantRegressionArtifactsTests(unittest.TestCase):
    def _load_manifest(self):
        manifest_path = ROOT / "docs" / "assistant_live_cases" / "offline_regression_manifest.json"
        with manifest_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def test_offline_regression_manifest_exists(self):
        manifest_path = ROOT / "docs" / "assistant_live_cases" / "offline_regression_manifest.json"

        self.assertTrue(manifest_path.exists())

    def test_manifest_references_existing_artifacts(self):
        manifest = self._load_manifest()

        artifact_paths = [item["path"] for item in manifest["artifacts"]]

        self.assertEqual(len(artifact_paths), len(set(artifact_paths)))
        for relative_path in artifact_paths:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists())

    def test_manifest_json_artifacts_parse(self):
        manifest = self._load_manifest()

        json_paths = [
            item["path"]
            for item in manifest["artifacts"]
            if item["path"].endswith(".json")
        ]

        self.assertIn("docs/assistant_live_cases/story_to_video_expected_actions.json", json_paths)
        for relative_path in json_paths:
            with self.subTest(path=relative_path):
                with (ROOT / relative_path).open("r", encoding="utf-8") as handle:
                    json.load(handle)

    def test_story_to_video_expected_actions_contract_is_locked(self):
        expected_path = ROOT / "docs" / "assistant_live_cases" / "story_to_video_expected_actions.json"
        with expected_path.open("r", encoding="utf-8") as handle:
            expected = json.load(handle)

        self.assertEqual(expected["workflowKind"], "story_to_video")
        self.assertTrue(expected["contract"]["videoRequiresExplicitAuthorization"])
        self.assertEqual(expected["contract"]["storyOutlineCount"], 1)
        self.assertEqual(expected["contract"]["styleBibleCount"], 1)
        self.assertIn("storyboard_grid", expected["contract"]["allowedLayouts"])
        self.assertIn("shotVideoPrompt", expected["contract"]["requiredShotMetadata"])
        self.assertGreaterEqual(len(expected["cases"]), 4)

    def test_governance_docs_cover_live_safety_and_acceptance(self):
        checks = {
            "docs/assistant_live_cases/live_error_ledger.md": [
                "STV-LIVE-001",
                "missing required field nodeIds",
                "unsupported layout storyboard_grid",
                "Class A",
                "8777",
            ],
            "docs/assistant_action_contract_matrix.md": [
                "Action: create_node",
                "Action: connect_nodes",
                "Action: queue_generation_task",
                "run_prompt_preset_generation",
                "Video cannot auto-run",
            ],
            "docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md": [
                "Expected preview",
                "Expected canvas nodes",
                "Expected generation state",
                "Video nodes remain prepared/idle",
                "Undo",
                "P0-P4 completion audit",
                "P4 platform regression",
                "run_canvas_agent_r5_regression.ps1",
                "assistant_live_artifact_validator.mjs",
                "p0-p4-live-artifact-provenance.json",
                "-PreflightOnly",
            ],
            "docs/assistant_live_cases/model_output_quality_scorecard.md": [
                "Structure completeness",
                "Schema legality",
                "Safety boundary",
                "Canvas readability",
                "Generation permission correctness",
                "Average score >= 22/25",
                "CI Scorecard Trend",
                "--trend",
                "regressedFromPrevious",
            ],
            "docs/assistant_live_cases/scorecard_trend_contract.md": [
                "CI Scorecard Trend Contract",
                "averageNormalizedScore",
                "ownerFailureCounts",
                "suggestedRegressions",
                "regressedFromPrevious",
                "tools/score_assistant_live_run.py --trend",
            ],
            "docs/assistant_live_cases/visual_diff_contract.md": [
                "Assistant Visual Diff Contract",
                "comparePngFiles",
                "compareVisualArtifactDirectories",
                "mismatchRatio",
                "visual-diff.json",
                "tools/assistant_visual_diff.mjs",
            ],
            "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md": [
                "P0-P4 Completion Audit",
                "P0-14",
                "P4-06",
                "8777 browser artifact",
                "audit_pi_canvas_agent_p0_p4_completion.py",
                "assistant_live_artifact_validator.mjs",
                "p0-p4-live-artifact-provenance.json",
                "all three required R5 fixture artifacts",
                "artifactSetId",
                "same R5 wrapper run",
                "manifest-relative artifactDir",
                "relative artifactDir must stay within the manifest directory",
                "run-level preflightResults",
                "final P0-P4 completion audit",
                "p0-p4-completion-audit-result.json",
                "run-level secret scan",
                "completionAuditResult",
                "parsed completion audit JSON",
                "-PreflightOnly",
                "nextActions",
                "waiting-for-authorized-live-artifacts",
                "completionAuditCommand",
                "artifactSetAuditCommand",
                "p0-p4-live-artifact-set.json",
                "python tools\\run_claw_assistant_offline_regression.py",
                "285/285",
                "419 tests",
                "npx is not on PATH",
            ],
        }

        for relative_path, needles in checks.items():
            content = (ROOT / relative_path).read_text(encoding="utf-8")
            for needle in needles:
                with self.subTest(path=relative_path, needle=needle):
                    self.assertIn(needle, content)

    def test_governance_docs_have_no_placeholder_markers(self):
        manifest = self._load_manifest()
        forbidden_markers = ("TBD", "TODO", "待定", "占位")

        for item in manifest["artifacts"]:
            content = (ROOT / item["path"]).read_text(encoding="utf-8")
            for marker in forbidden_markers:
                with self.subTest(path=item["path"], marker=marker):
                    self.assertNotIn(marker, content)

    def test_manifest_declares_ci_scorecard_trend_contract(self):
        manifest = self._load_manifest()

        trend_artifacts = [
            item for item in manifest["artifacts"] if item.get("type") == "scorecard_trend"
        ]

        self.assertEqual(len(trend_artifacts), 1)
        self.assertEqual(
            trend_artifacts[0]["path"],
            "docs/assistant_live_cases/scorecard_trend_contract.md",
        )

    def test_manifest_declares_visual_diff_contract(self):
        manifest = self._load_manifest()

        visual_artifacts = [
            item for item in manifest["artifacts"] if item.get("type") == "visual_diff_contract"
        ]

        self.assertEqual(len(visual_artifacts), 1)
        self.assertEqual(
            visual_artifacts[0]["path"],
            "docs/assistant_live_cases/visual_diff_contract.md",
        )

    def test_manifest_declares_live_artifact_validator_tool(self):
        manifest = self._load_manifest()

        validator_artifacts = [
            item for item in manifest["artifacts"] if item.get("type") == "artifact_validator"
        ]

        self.assertEqual(len(validator_artifacts), 1)
        self.assertEqual(
            validator_artifacts[0]["path"],
            "tools/assistant_live_artifact_validator.mjs",
        )

    def test_manifest_declares_p0_p4_completion_audit(self):
        manifest = self._load_manifest()

        audit_artifacts = [
            item for item in manifest["artifacts"] if item.get("type") == "p0_p4_completion_audit"
        ]

        self.assertEqual(len(audit_artifacts), 1)
        self.assertEqual(
            audit_artifacts[0]["path"],
            "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md",
        )

    def test_manifest_declares_p0_p4_completion_audit_tool(self):
        manifest = self._load_manifest()

        audit_tool_artifacts = [
            item for item in manifest["artifacts"] if item.get("type") == "completion_audit_tool"
        ]

        self.assertEqual(len(audit_tool_artifacts), 1)
        self.assertEqual(
            audit_tool_artifacts[0]["path"],
            "tools/audit_pi_canvas_agent_p0_p4_completion.py",
        )


if __name__ == "__main__":
    unittest.main()
