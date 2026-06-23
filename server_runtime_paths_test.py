import os
import sys
import tempfile
import unittest
from unittest import mock

from services.runtime_paths import build_runtime_paths, get_distribution_kind


class RuntimePathsTest(unittest.TestCase):
    def test_source_distribution_uses_source_root_for_resources_and_writes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            paths = build_runtime_paths(
                source_root=temp_dir,
                bundle_root=os.path.join(temp_dir, "_bundle"),
                executable_dir=os.path.join(temp_dir, "dist"),
                distribution="source",
            )

        self.assertEqual(paths["distribution"], "source")
        self.assertEqual(paths["resourceRoot"], os.path.abspath(temp_dir))
        self.assertEqual(paths["writableRoot"], os.path.abspath(temp_dir))
        self.assertTrue(paths["presetDefinitionsPath"].endswith(os.path.join("user", "prompt-presets.json")))

    def test_onedir_distribution_preserves_legacy_executable_directory_storage(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            executable_dir = os.path.join(temp_dir, "AI Canvas Pro")
            paths = build_runtime_paths(
                source_root=os.path.join(temp_dir, "src"),
                bundle_root=os.path.join(temp_dir, "_bundle"),
                executable_dir=executable_dir,
                distribution="onedir",
            )

        self.assertEqual(paths["distribution"], "onedir")
        self.assertEqual(paths["resourceRoot"], os.path.abspath(executable_dir))
        self.assertEqual(paths["writableRoot"], os.path.abspath(executable_dir))

    def test_onefile_distribution_reads_from_bundle_and_writes_to_local_app_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            local_app_data = os.path.join(temp_dir, "LocalAppData")
            with mock.patch.dict(os.environ, {"LOCALAPPDATA": local_app_data}, clear=False):
                paths = build_runtime_paths(
                    source_root=os.path.join(temp_dir, "src"),
                    bundle_root=os.path.join(temp_dir, "_MEI123"),
                    executable_dir=os.path.join(temp_dir, "release"),
                    distribution="onefile",
                )

        self.assertEqual(paths["distribution"], "onefile")
        self.assertEqual(paths["resourceRoot"], os.path.abspath(os.path.join(temp_dir, "_MEI123")))
        self.assertEqual(paths["writableRoot"], os.path.abspath(os.path.join(local_app_data, "AI-CanvasPro")))
        self.assertTrue(paths["seedPresetDefinitionsPath"].endswith(os.path.join("config", "prompt-presets.json")))

    def test_environment_overrides_resource_and_writable_roots(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = os.path.join(temp_dir, "resource")
            writable_root = os.path.join(temp_dir, "writable")
            with mock.patch.dict(
                os.environ,
                {
                    "AIC_RESOURCE_ROOT": resource_root,
                    "AIC_WRITABLE_ROOT": writable_root,
                },
                clear=False,
            ):
                paths = build_runtime_paths(
                    source_root=os.path.join(temp_dir, "src"),
                    bundle_root=os.path.join(temp_dir, "_MEI123"),
                    executable_dir=os.path.join(temp_dir, "release"),
                    distribution="onefile",
                )

        self.assertEqual(paths["resourceRoot"], os.path.abspath(resource_root))
        self.assertEqual(paths["writableRoot"], os.path.abspath(writable_root))
        self.assertEqual(paths["userDir"], os.path.abspath(os.path.join(writable_root, "user")))

    def test_onefile_detection_uses_launcher_flag_not_only_frozen_meipass(self):
        with mock.patch.object(sys, "frozen", True, create=True):
            with mock.patch.dict(os.environ, {"AIC_PACKAGED_LAUNCHER": "", "AIC_DISTRIBUTION": ""}, clear=False):
                self.assertEqual(get_distribution_kind(), "onedir")

            with mock.patch.dict(os.environ, {"AIC_PACKAGED_LAUNCHER": "1"}, clear=False):
                self.assertEqual(get_distribution_kind(), "onefile")


if __name__ == "__main__":
    unittest.main()
