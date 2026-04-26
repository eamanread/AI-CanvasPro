import tempfile
import unittest

from services.json_file_route_service import JsonFileRouteService


class JsonFileRouteServiceTests(unittest.TestCase):
    def _build_service(self, temp_dir):
        return JsonFileRouteService(
            canvas_dir_getter=lambda: temp_dir,
            assets_dir_getter=lambda: temp_dir,
            workflows_dir_getter=lambda: temp_dir,
            user_dir_getter=lambda: temp_dir,
            read_user_settings=lambda: {},
            write_user_settings=lambda data: None,
            atomic_write_json=lambda path, data: None,
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


if __name__ == "__main__":
    unittest.main()
