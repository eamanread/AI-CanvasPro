import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools import build_windows_bundle
from tools import build_windows_onefile


class WindowsRuntimeResourcesTests(unittest.TestCase):
    def test_seedance_integration_is_bundled_for_onefile_runtime(self):
        self.assertIn("integrations", build_windows_onefile.RUNTIME_DIRS)

    def test_seedance_integration_is_copied_for_onedir_runtime(self):
        self.assertIn("integrations", build_windows_bundle.RUNTIME_DIRS)

    def test_pi_sidecar_and_bundled_node_are_in_onefile_runtime_manifest(self):
        manifest = build_windows_onefile.build_release_manifest(
            exe_name="huanying-workbench-test.exe",
            version="test",
            digest="0" * 64,
            size_bytes=123,
            build_utc="2026-06-05T00:00:00+00:00",
        )

        self.assertIn("integrations", manifest["runtimeDirs"])
        self.assertIn("vendor", manifest["runtimeDirs"])
        self.assertEqual(
            {
                "node": "vendor/node/windows-x64/node.exe",
                "nodeLicense": "vendor/node/windows-x64/LICENSE.node.txt",
                "runner": "integrations/pi_canvas_agent/dist/runner.js",
                "manifest": "integrations/pi_canvas_agent/packaging/sidecar-manifest.json",
                "launcher": "integrations/pi_canvas_agent/packaging/start-pi-canvas-agent.bat",
                "requiresGlobalNode": False,
                "requiresGlobalPi": False,
                "requiresDevDependencies": False,
            },
            manifest["piCanvasAgentSidecar"],
        )

    def test_private_defaults_are_bundled_for_onefile_runtime(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "user").mkdir()
            (root / "user" / "config.json").write_text("{}", encoding="utf-8")
            staging_root = root / "release" / ".private-defaults"

            private_defaults = build_windows_onefile.prepare_private_defaults(
                source_root=root,
                staging_root=staging_root,
            )

            self.assertTrue((private_defaults / "user" / "config.json").is_file())
            data_args = build_windows_onefile.add_data_args(
                source_root=root,
                private_defaults_root=private_defaults,
            )
            self.assertIn(f"{private_defaults}{build_windows_onefile.os.pathsep}private_defaults", data_args)

    def test_private_defaults_exclude_settings_and_browser_profiles(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "user").mkdir()
            (root / "user" / "config.json").write_text("{}", encoding="utf-8")
            (root / "user" / "settings.json").write_text('{"fileSavePaths":{}}', encoding="utf-8")
            (root / "user_data" / "seedance_web" / "profile").mkdir(parents=True)
            (root / "user_data" / "seedance_web" / "profile" / "Cookies").write_text("secret", encoding="utf-8")

            private_defaults = build_windows_onefile.prepare_private_defaults(
                source_root=root,
                staging_root=root / "release" / ".private-defaults",
            )

            self.assertFalse((private_defaults / "user" / "settings.json").exists())
            self.assertFalse((private_defaults / "user_data").exists())

    def test_onefile_collects_runtime_dependency_packages(self):
        args = build_windows_onefile.pyinstaller_collect_args()

        for package_name in ("PIL", "cv2", "numpy", "requests", "onnxruntime", "transformers"):
            self.assertIn("--collect-all", args)
            self.assertIn(package_name, args)

    def test_browser_runtime_static_assets_exist(self):
        root = Path(__file__).resolve().parent

        self.assertTrue((root / "styles" / "preset-menu.css").is_file())
        for cursor_name in ("pointer", "link", "beam"):
            for size in ("small", "medium", "large"):
                self.assertTrue((root / "images" / f"{cursor_name}-{size}.cur").is_file())
                self.assertTrue((root / "images" / f"{cursor_name}-{size}.png").is_file())


if __name__ == "__main__":
    unittest.main()
