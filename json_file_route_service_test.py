import os
import tempfile
import unittest
from unittest import mock

from services.json_file_route_service import JsonFileRouteService


class JsonFileRouteServiceTests(unittest.TestCase):
    def _build_service(self, temp_dir, *, atomic_write_json=None):
        return JsonFileRouteService(
            canvas_dir_getter=lambda: temp_dir,
            assets_dir_getter=lambda: temp_dir,
            workflows_dir_getter=lambda: temp_dir,
            user_dir_getter=lambda: temp_dir,
            read_user_settings=lambda: {},
            write_user_settings=lambda data: None,
            atomic_write_json=(atomic_write_json or (lambda path, data: None)),
        )

    def test_missing_default_project_returns_empty_canvas_payload(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)

            result = service.handle_get(
                handler=None,
                path="/api/v2/projects/default_v2_project.json",
            )

            self.assertEqual(result["kind"], "json_ok")
            self.assertEqual(result["data"]["activeCanvasId"], "canvas_1")
            self.assertEqual(len(result["data"]["canvases"]), 1)
            self.assertEqual(result["data"]["canvases"][0]["nodes"], [])
            self.assertEqual(result["data"]["canvases"][0]["edges"], [])

    def test_missing_non_default_project_still_returns_404(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)

            result = service.handle_get(
                handler=None,
                path="/api/v2/projects/demo.json",
            )

            self.assertEqual(result["kind"], "json_err")
            self.assertEqual(result["code"], 404)
            self.assertEqual(result["message"], "Project not found")

    def test_user_preset_dev_paths_are_not_handled_as_generic_user_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)

            result = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=b"{}",
            )

            self.assertIsNone(result)


    def test_save_asset_uses_injected_atomic_writer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            calls = []
            service = self._build_service(
                temp_dir,
                atomic_write_json=lambda path, data: calls.append((path, data)),
            )

            result = service.handle_post(
                handler=None,
                path="/api/v2/assets/save",
                body=b'{"id": "asset-1", "name": "demo"}',
            )

            self.assertEqual(result["kind"], "json_ok")
            self.assertEqual(result["data"]["id"], "asset-1")
            self.assertEqual(len(calls), 1)
            written_path, written_data = calls[0]
            self.assertEqual(written_path, os.path.join(temp_dir, "asset-1.json"))
            self.assertEqual(written_data["id"], "asset-1")

    def test_save_workflow_uses_injected_atomic_writer_and_defaults_scope(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            calls = []
            service = self._build_service(
                temp_dir,
                atomic_write_json=lambda path, data: calls.append((path, data)),
            )

            result = service.handle_post(
                handler=None,
                path="/api/v2/workflows/save",
                body=b'{"id": "wf-1"}',
            )

            self.assertEqual(result["kind"], "json_ok")
            self.assertEqual(len(calls), 1)
            written_path, written_data = calls[0]
            self.assertEqual(written_path, os.path.join(temp_dir, "wf-1.json"))
            self.assertEqual(written_data["scope"], "private")


if __name__ == "__main__":
    unittest.main()
