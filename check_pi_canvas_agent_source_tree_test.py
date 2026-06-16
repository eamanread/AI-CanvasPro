import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "tools" / "check_pi_canvas_agent_source_tree.py"

spec = importlib.util.spec_from_file_location("check_pi_canvas_agent_source_tree", SCRIPT)
check_pi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_pi)

EXPECTED_LICENSE_PATHS = (
    "integrations/pi_canvas_agent/LICENSE",
    "integrations/pi_canvas_agent/LICENSE.pi.txt",
)


class PiCanvasAgentSourceTreePreflightTests(unittest.TestCase):
    def _write_required_files(self, root: Path, *, include_lock=True, include_license=True):
        required_paths = list(check_pi.REQUIRED_PATHS) + [
            "integrations/pi_canvas_agent/package-lock.json",
            "integrations/pi_canvas_agent/src/protocol.js",
            "integrations/pi_canvas_agent/src/huanyingTools.js",
            "integrations/pi_canvas_agent/src/runner.js",
            "integrations/pi_canvas_agent/src/runner.test.ts",
            "integrations/pi_canvas_agent/dist/protocol.js",
            "integrations/pi_canvas_agent/dist/huanyingTools.js",
            "integrations/pi_canvas_agent/dist/runner.js",
            "integrations/pi_canvas_agent/packaging/sidecar-manifest.json",
            "integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat",
            "vendor/node/windows-x64/node.exe",
            "vendor/node/windows-x64/LICENSE.node.txt",
        ]
        for rel in required_paths:
            if rel == "integrations/pi_canvas_agent/package-lock.json" and not include_lock:
                continue
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}\n" if path.suffix == ".json" else "// source\n", encoding="utf-8")
        if include_license:
            license_path = root / EXPECTED_LICENSE_PATHS[0]
            license_path.parent.mkdir(parents=True, exist_ok=True)
            license_path.write_text("Pi license placeholder for package distribution.\n", encoding="utf-8")

    def test_preflight_requires_lockfile_and_license(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self._write_required_files(root, include_lock=False, include_license=False)

            result = check_pi.check_source_tree(root)

            self.assertFalse(result.ok)
            self.assertIn("integrations/pi_canvas_agent/package-lock.json", result.missing)
            self.assertTrue(any(path in result.missing for path in EXPECTED_LICENSE_PATHS))

    def test_preflight_passes_with_required_source_compiled_js_lockfile_and_license(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self._write_required_files(root)

            result = check_pi.check_source_tree(root)

            self.assertTrue(result.ok, result.missing)
            self.assertEqual([], result.missing)

    def test_preflight_requires_bundled_node_dist_runner_and_packaging_contract(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self._write_required_files(root)
            for rel in (
                "integrations/pi_canvas_agent/dist/runner.js",
                "integrations/pi_canvas_agent/packaging/sidecar-manifest.json",
                "integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat",
                "vendor/node/windows-x64/node.exe",
                "vendor/node/windows-x64/LICENSE.node.txt",
            ):
                (root / rel).unlink()

            result = check_pi.check_source_tree(root)

            self.assertFalse(result.ok)
            self.assertIn("integrations/pi_canvas_agent/dist/runner.js", result.missing)
            self.assertIn("integrations/pi_canvas_agent/packaging/sidecar-manifest.json", result.missing)
            self.assertIn("integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat", result.missing)
            self.assertIn("vendor/node/windows-x64/node.exe", result.missing)
            self.assertIn("vendor/node/windows-x64/LICENSE.node.txt", result.missing)


if __name__ == "__main__":
    unittest.main()
