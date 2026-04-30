import json
import os
import tempfile
import unittest

from services.library_file_route_service import LibraryFileRouteService


class LibraryFileRouteServiceTests(unittest.TestCase):
    def _build_service(self, temp_dir, *, preset_definitions_path=None):
        return LibraryFileRouteService(
            user_dir_getter=lambda: temp_dir,
            asset_thumbs_dir_getter=lambda: os.path.join(temp_dir, "asset-thumbs"),
            workflow_thumbs_dir_getter=lambda: os.path.join(temp_dir, "workflow-thumbs"),
            preset_definitions_path_getter=(
                (lambda: preset_definitions_path) if preset_definitions_path else None
            ),
        )

    def test_save_prompt_preset_creates_txt_file_and_returns_grouped_result(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-image",
                        "title": "电影海报",
                        "template": "生成电影海报",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertTrue(
                os.path.exists(os.path.join(temp_dir, "prompt", "ai-image", "电影海报.txt"))
            )

            presets = service.handle_get(handler=None, path="/api/v2/user/presets")
            self.assertEqual(presets["data"]["ai-image"][0]["title"], "电影海报")
            self.assertEqual(presets["data"]["ai-image"][0]["template"], "生成电影海报")

    def test_save_prompt_preset_renames_existing_file_when_original_title_provided(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)
            old_path = os.path.join(temp_dir, "prompt", "ai-text", "旧预设.txt")
            os.makedirs(os.path.dirname(old_path), exist_ok=True)
            with open(old_path, "w", encoding="utf-8") as file:
                file.write("旧模板")

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-text",
                        "title": "新预设",
                        "originalTitle": "旧预设",
                        "template": "新模板",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertFalse(os.path.exists(old_path))
            with open(
                os.path.join(temp_dir, "prompt", "ai-text", "新预设.txt"),
                "r",
                encoding="utf-8",
            ) as file:
                self.assertEqual(file.read(), "新模板")

    def test_delete_prompt_preset_removes_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = self._build_service(temp_dir)
            preset_path = os.path.join(temp_dir, "prompt", "ai-video", "镜头A.txt")
            os.makedirs(os.path.dirname(preset_path), exist_ok=True)
            with open(preset_path, "w", encoding="utf-8") as file:
                file.write("pan shot")

            response = service.handle_delete(
                handler=None,
                path="/api/v2/user/presets/dev/ai-video/%E9%95%9C%E5%A4%B4A",
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertFalse(os.path.exists(preset_path))

    def test_get_preset_definitions_returns_grouped_structure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            os.makedirs(os.path.dirname(definitions_path), exist_ok=True)
            with open(definitions_path, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "ai-image": [
                            {
                                "title": "多宫格",
                                "desc": "分组",
                                "subItems": [
                                    {
                                        "title": "9宫格",
                                        "template": "九宫格模板",
                                    }
                                ],
                            }
                        ]
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )
            response = service.handle_get(
                handler=None,
                path="/api/v2/user/presets/definitions",
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertEqual(response["data"]["ai-image"][0]["title"], "多宫格")
            self.assertEqual(
                response["data"]["ai-image"][0]["subItems"][0]["title"],
                "9宫格",
            )
            self.assertEqual(response["data"]["ai-audio"], [])

    def test_save_preset_definitions_persists_grouped_structure(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/definitions/save",
                body=json.dumps(
                    {
                        "definitions": {
                            "ai-image": [
                                {
                                    "title": "多宫格",
                                    "icon": "📚",
                                    "desc": "分组",
                                    "subItems": [
                                        {
                                            "title": "16宫格",
                                            "template": "十六宫格模板",
                                        }
                                    ],
                                }
                            ],
                            "ai-video": [
                                {
                                    "title": "镜头平移",
                                    "template": "camera pan",
                                }
                            ],
                        }
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)

            self.assertEqual(saved["ai-image"][0]["title"], "多宫格")
            self.assertEqual(saved["ai-image"][0]["subItems"][0]["title"], "16宫格")
            self.assertEqual(saved["ai-video"][0]["template"], "camera pan")
            self.assertEqual(saved["ai-audio"], [])


if __name__ == "__main__":
    unittest.main()
