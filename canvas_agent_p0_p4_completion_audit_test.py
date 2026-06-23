import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
AUDIT_TOOL = ROOT / "tools" / "audit_pi_canvas_agent_p0_p4_completion.py"
REQUIRED_R5_SCREENSHOTS = [
    "01-open-panel.png",
    "02-model-dropdown.png",
    "03-streaming.png",
    "04-action-preview.png",
    "05-applied-receipt.png",
    "06-history-restore.png",
    "07-generation-pending.png",
    "08-video-strong-confirm.png",
]
REQUIRED_R5_FIXTURES = [
    "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "docs/assistant_live_cases/r5-generation-permission-gate.json",
    "docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json",
]
ARTIFACT_SET_ID = "r5-wrapper-run-test"
ARTIFACT_SET_MANIFEST = "p0-p4-live-artifact-set.json"
COMPLETION_AUDIT_RESULT = "p0-p4-completion-audit-result.json"
REQUIRED_PREFLIGHT_RESULTS = [
    {"name": "frontend regression", "passed": True},
    {"name": "backend regression", "passed": True},
    {"name": "P0-P4 audit", "passed": True},
    {"name": "P4 platform regression", "passed": True},
]


def _write_json(path: Path, value: dict | list) -> None:
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def _create_valid_live_artifact(
    directory: Path,
    fixture: str = REQUIRED_R5_FIXTURES[0],
    artifact_set_id: str = ARTIFACT_SET_ID,
) -> None:
    screenshots_dir = directory / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    scorecard = {
        "passesTarget": True,
        "r5Journey": {
            "total": 110,
            "max": 110,
            "passesTarget": True,
            "checks": {
                "panelOpen": {"pass": True},
                "modelDropdown": {"pass": True},
                "streaming": {"pass": True},
                "actionPreview": {"pass": True},
                "applyReceipt": {"pass": True},
                "historyRestore": {"pass": True},
                "generationGate": {"pass": True},
                "pendingState": {"pass": True},
                "secretSafety": {"pass": True},
            },
        },
    }
    _write_json(directory / "summary.json", {"success": True, "scorecard": scorecard})
    _write_json(directory / "scorecard.json", scorecard)
    _write_json(directory / "trace.json", [])
    _write_json(directory / "console.json", {"consoleErrors": [], "pageErrors": []})
    _write_json(directory / "network.json", {"httpErrors": [], "requestFailures": []})
    _write_json(directory / "assistant-state.json", {"status": "done_pending_actions"})
    _write_json(directory / "graph-before.json", {"nodes": []})
    _write_json(directory / "graph-after.json", {"nodes": []})
    _write_json(
        directory / "p0-p4-live-artifact-provenance.json",
        {
            "schema": "canvas-agent-r5-artifact-provenance-v1",
            "producedBy": "tools/run_canvas_agent_r5_regression.ps1",
            "sourceRequirement": "docs/PI_CANVAS_AGENT_CLAW_PARITY_P0_P4_PRODUCT_REQUIREMENTS.md",
            "p0P4AuditPath": "docs/PI_CANVAS_AGENT_P0_P4_COMPLETION_AUDIT.md",
            "artifactValidator": "tools/assistant_live_artifact_validator.mjs",
            "fixture": fixture,
            "artifactSetId": artifact_set_id,
            "preflightGates": [
                "frontend regression",
                "backend regression",
                "P0-P4 audit",
                "P4 platform regression",
            ],
            "preflightResults": REQUIRED_PREFLIGHT_RESULTS,
            "servicePolicy": {
                "userManaged8777": True,
                "noServiceManagementOrProbe": True,
            },
        },
    )
    (directory / "summary.md").write_text(
        "# Assistant Live R5 Run\n\n- success: true\n- scorecard: scorecard.json\n",
        encoding="utf-8",
    )
    for screenshot_name in REQUIRED_R5_SCREENSHOTS:
        (screenshots_dir / screenshot_name).write_bytes(b"\x89PNG\r\n")


def _create_valid_artifact_set(parent_dir: Path, artifact_set_id: str = ARTIFACT_SET_ID) -> Path:
    artifact_entries = []
    for index, fixture in enumerate(REQUIRED_R5_FIXTURES):
        artifact_dir = parent_dir / f"artifact-{index}"
        artifact_dir.mkdir()
        _create_valid_live_artifact(
            artifact_dir,
            fixture=fixture,
            artifact_set_id=artifact_set_id,
        )
        artifact_entries.append(
            {
                "fixture": fixture,
                "artifactDir": str(artifact_dir),
            }
        )

    manifest_path = parent_dir / ARTIFACT_SET_MANIFEST
    _write_json(
        manifest_path,
        {
            "schema": "canvas-agent-r5-artifact-set-v1",
            "artifactSetId": artifact_set_id,
            "producedBy": "tools/run_canvas_agent_r5_regression.ps1",
            "requiredFixtures": REQUIRED_R5_FIXTURES,
            "completionAuditResult": COMPLETION_AUDIT_RESULT,
            "preflightResults": REQUIRED_PREFLIGHT_RESULTS,
            "artifacts": artifact_entries,
            "servicePolicy": {
                "userManaged8777": True,
                "noServiceManagementOrProbe": True,
            },
        },
    )
    return manifest_path


class PiCanvasAgentP0P4CompletionAuditTests(unittest.TestCase):
    def _run_audit(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            (sys.executable, str(AUDIT_TOOL), *args),
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

    def _load_json_output(self, completed: subprocess.CompletedProcess[str]) -> dict:
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            self.fail(
                "audit output was not JSON: "
                f"{exc}\nstdout={completed.stdout}\nstderr={completed.stderr}"
            )

    def test_audit_reports_offline_ready_but_incomplete_without_live_artifact(self):
        completed = self._run_audit()

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertEqual(payload["schema"], "pi-canvas-agent-p0-p4-completion-audit-v1")
        self.assertFalse(payload["complete"])
        self.assertTrue(payload["offlineReady"])
        self.assertIn("P0-14", payload["missingRequirements"])
        self.assertEqual(payload["liveArtifact"]["status"], "missing")
        self.assertTrue(payload["servicePolicy"]["requiresExplicitUserManaged8777Authorization"])
        self.assertTrue(payload["servicePolicy"]["noServiceManagementOrProbe"])

    def test_audit_reports_machine_readable_live_artifact_next_actions(self):
        completed = self._run_audit()

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        next_actions = payload["nextActions"]

        self.assertEqual(next_actions["status"], "waiting-for-authorized-live-artifacts")
        self.assertEqual(next_actions["authorizationRequired"], "user-managed-8777-ready")
        self.assertEqual(next_actions["preflightCommand"], "tools/run_canvas_agent_r5_regression.ps1 -PreflightOnly")
        self.assertEqual(next_actions["liveRunCommand"], "tools/run_canvas_agent_r5_regression.ps1")
        self.assertEqual(
            next_actions["completionAuditCommand"],
            "python tools/audit_pi_canvas_agent_p0_p4_completion.py --live-artifact <artifact-dir-1> <artifact-dir-2> <artifact-dir-3>",
        )
        self.assertEqual(
            next_actions["artifactSetAuditCommand"],
            "python tools/audit_pi_canvas_agent_p0_p4_completion.py --live-artifact-set <p0-p4-live-artifact-set.json>",
        )
        self.assertEqual(next_actions["artifactSetManifest"], ARTIFACT_SET_MANIFEST)
        self.assertEqual(next_actions["requiredArtifactCount"], 3)
        self.assertEqual(next_actions["requiredFixtures"], REQUIRED_R5_FIXTURES)
        self.assertTrue(next_actions["requiresSameArtifactSetId"])
        self.assertTrue(next_actions["servicePolicy"]["userManaged8777"])
        self.assertTrue(next_actions["servicePolicy"]["noServiceManagementOrProbe"])
        self.assertEqual(next_actions["blockedRequirement"], "P0-14")
        self.assertIn("User confirms 8777 is ready", next_actions["humanChecklist"][0])

    def test_audit_rejects_invalid_live_artifact_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            completed = self._run_audit("--live-artifact", temp_dir)

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "invalid")
        self.assertTrue(
            any("p0-p4-live-artifact-provenance.json" in issue for issue in payload["liveArtifact"]["issues"])
        )

    def test_audit_exposes_required_preflight_gate_names(self):
        completed = self._run_audit()
        payload = self._load_json_output(completed)

        self.assertEqual(
            payload["requiredPreflightGates"],
            [
                "frontend regression",
                "backend regression",
                "P0-P4 audit",
                "P4 platform regression",
            ],
        )

    def test_audit_accounts_for_every_prd_requirement_id(self):
        completed = self._run_audit()
        payload = self._load_json_output(completed)

        requirements = payload["requirements"]
        self.assertEqual(requirements["total"], 50)
        self.assertEqual(requirements["missingFromAudit"], [])
        self.assertEqual(requirements["notOfflineReady"], ["P0-14"])
        self.assertEqual(requirements["statusById"]["P0-01"], "Achieved offline")
        self.assertEqual(requirements["statusById"]["P4-06"], "Achieved offline snapshot contract")
        self.assertEqual(requirements["statusById"]["P0-14"], "Not achieved live")

    def test_audit_can_complete_with_valid_live_artifact(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            artifact_dirs = []
            for index, fixture in enumerate(REQUIRED_R5_FIXTURES):
                artifact_dir = Path(parent_dir) / f"artifact-{index}"
                artifact_dir.mkdir()
                _create_valid_live_artifact(artifact_dir, fixture=fixture)
                artifact_dirs.append(str(artifact_dir))

            completed = self._run_audit("--live-artifact", *artifact_dirs)

        self.assertEqual(completed.returncode, 0)
        payload = self._load_json_output(completed)
        self.assertTrue(payload["complete"])
        self.assertTrue(payload["offlineReady"])
        self.assertEqual(payload["missingRequirements"], [])
        self.assertEqual(payload["liveArtifact"]["status"], "valid")
        self.assertEqual(payload["liveArtifact"]["coveredFixtures"], REQUIRED_R5_FIXTURES)
        self.assertEqual(payload["liveArtifact"]["artifactSetId"], ARTIFACT_SET_ID)
        self.assertEqual(payload["requirements"]["statusById"]["P0-14"], "Achieved live")
        self.assertEqual(payload["requirements"]["notOfflineReady"], [])

    def test_audit_can_complete_with_valid_artifact_set_manifest(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 0)
        payload = self._load_json_output(completed)
        self.assertTrue(payload["complete"])
        self.assertEqual(payload["missingRequirements"], [])
        self.assertEqual(payload["liveArtifact"]["status"], "valid")
        self.assertEqual(payload["liveArtifact"]["artifactSetManifest"], ARTIFACT_SET_MANIFEST)
        self.assertEqual(payload["liveArtifact"]["completionAuditResult"], COMPLETION_AUDIT_RESULT)
        self.assertEqual(payload["liveArtifact"]["artifactSetId"], ARTIFACT_SET_ID)
        self.assertEqual(payload["liveArtifact"]["coveredFixtures"], REQUIRED_R5_FIXTURES)
        self.assertEqual(payload["requirements"]["statusById"]["P0-14"], "Achieved live")
        self.assertEqual(payload["requirements"]["notOfflineReady"], [])

    def test_audit_rejects_artifact_set_manifest_without_completion_audit_result_pointer(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest.pop("completionAuditResult")
            _write_json(manifest_path, manifest)

            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "invalid")
        self.assertTrue(
            any(
                "artifact set manifest completionAuditResult must be p0-p4-completion-audit-result.json" in issue
                for issue in payload["liveArtifact"]["issues"]
            )
        )

    def test_audit_rejects_artifact_set_manifest_without_run_level_preflight_results(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest.pop("preflightResults")
            _write_json(manifest_path, manifest)

            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "invalid")
        self.assertTrue(
            any(
                "artifact set manifest preflightResults must include a passing result" in issue
                for issue in payload["liveArtifact"]["issues"]
            )
        )

    def test_audit_rejects_artifact_set_manifest_with_failed_run_level_preflight(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["preflightResults"][1]["passed"] = False
            _write_json(manifest_path, manifest)

            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "invalid")
        self.assertTrue(
            any(
                "artifact set manifest preflightResults must include a passing result for backend regression" in issue
                for issue in payload["liveArtifact"]["issues"]
            )
        )

    def test_audit_resolves_artifact_set_manifest_dirs_relative_to_manifest(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            for index, artifact in enumerate(manifest["artifacts"]):
                artifact["artifactDir"] = f"artifact-{index}"
            _write_json(manifest_path, manifest)

            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 0)
        payload = self._load_json_output(completed)
        self.assertTrue(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "valid")
        self.assertEqual(payload["liveArtifact"]["coveredFixtures"], REQUIRED_R5_FIXTURES)

    def test_audit_rejects_artifact_set_manifest_relative_dirs_outside_bundle(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            bundle_dir = root / "bundle"
            outside_dir = root / "outside"
            bundle_dir.mkdir()
            outside_dir.mkdir()
            artifact_entries = []
            for index, fixture in enumerate(REQUIRED_R5_FIXTURES):
                artifact_dir = outside_dir / f"artifact-{index}"
                artifact_dir.mkdir()
                _create_valid_live_artifact(artifact_dir, fixture=fixture)
                artifact_entries.append(
                    {
                        "fixture": fixture,
                        "artifactDir": f"../outside/artifact-{index}",
                    }
                )

            manifest_path = bundle_dir / ARTIFACT_SET_MANIFEST
            _write_json(
                manifest_path,
                {
                    "schema": "canvas-agent-r5-artifact-set-v1",
                    "artifactSetId": ARTIFACT_SET_ID,
                    "producedBy": "tools/run_canvas_agent_r5_regression.ps1",
                    "requiredFixtures": REQUIRED_R5_FIXTURES,
                    "completionAuditResult": COMPLETION_AUDIT_RESULT,
                    "preflightResults": REQUIRED_PREFLIGHT_RESULTS,
                    "artifacts": artifact_entries,
                    "servicePolicy": {
                        "userManaged8777": True,
                        "noServiceManagementOrProbe": True,
                    },
                },
            )

            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "invalid")
        self.assertTrue(
            any("must stay within artifact set manifest directory" in issue for issue in payload["liveArtifact"]["issues"])
        )

    def test_audit_rejects_artifact_set_manifest_with_missing_fixture(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            manifest_path = _create_valid_artifact_set(Path(parent_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"] = manifest["artifacts"][:-1]
            _write_json(manifest_path, manifest)
            completed = self._run_audit("--live-artifact-set", str(manifest_path))

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "incomplete")
        self.assertEqual(payload["liveArtifact"]["missingFixtures"], REQUIRED_R5_FIXTURES[-1:])

    def test_audit_rejects_single_artifact_missing_required_r5_fixtures(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            _create_valid_live_artifact(Path(temp_dir))
            completed = self._run_audit("--live-artifact", temp_dir)

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "incomplete")
        self.assertIn("P0-14", payload["missingRequirements"])
        self.assertEqual(
            payload["liveArtifact"]["missingFixtures"],
            REQUIRED_R5_FIXTURES[1:],
        )

    def test_audit_rejects_artifacts_from_different_wrapper_runs(self):
        with tempfile.TemporaryDirectory() as parent_dir:
            artifact_dirs = []
            for index, fixture in enumerate(REQUIRED_R5_FIXTURES):
                artifact_dir = Path(parent_dir) / f"artifact-{index}"
                artifact_dir.mkdir()
                _create_valid_live_artifact(
                    artifact_dir,
                    fixture=fixture,
                    artifact_set_id=f"r5-wrapper-run-{index}",
                )
                artifact_dirs.append(str(artifact_dir))

            completed = self._run_audit("--live-artifact", *artifact_dirs)

        self.assertEqual(completed.returncode, 1)
        payload = self._load_json_output(completed)
        self.assertFalse(payload["complete"])
        self.assertEqual(payload["liveArtifact"]["status"], "mixed-artifact-set")
        self.assertIn("P0-14", payload["missingRequirements"])
        self.assertGreater(len(payload["liveArtifact"]["artifactSetIds"]), 1)


if __name__ == "__main__":
    unittest.main()
