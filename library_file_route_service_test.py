import json
import os
import tempfile
import unittest
from unittest import mock

from services.library_file_route_service import LibraryFileRouteService


class LibraryFileRouteServiceTests(unittest.TestCase):
    def _build_service(
        self,
        temp_dir,
        *,
        preset_definitions_path=None,
        preset_definitions_seed_path=None,
        preset_root=None,
    ):
        return LibraryFileRouteService(
            user_dir_getter=lambda: temp_dir,
            asset_thumbs_dir_getter=lambda: os.path.join(temp_dir, "asset-thumbs"),
            workflow_thumbs_dir_getter=lambda: os.path.join(temp_dir, "workflow-thumbs"),
            preset_definitions_path_getter=(
                (lambda: preset_definitions_path) if preset_definitions_path else None
            ),
            preset_definitions_seed_path_getter=(
                (lambda: preset_definitions_seed_path) if preset_definitions_seed_path else None
            ),
            preset_root_getter=((lambda: preset_root) if preset_root else None),
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

    def test_save_preset_definitions_allows_empty_group(self):
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
                                    "title": "场景参考",
                                    "icon": "◺",
                                    "desc": "一键生成场景多视图",
                                    "subItems": [],
                                }
                            ],
                        }
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)

            self.assertEqual(
                saved["ai-image"][0],
                {
                    "title": "场景参考",
                    "icon": "◺",
                    "desc": "一键生成场景多视图",
                    "subItems": [],
                },
            )

    def test_get_preset_definitions_reads_seed_when_writable_file_is_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_path = os.path.join(temp_dir, "user", "prompt-presets.json")
            seed_path = os.path.join(temp_dir, "bundle", "config", "prompt-presets.json")
            os.makedirs(os.path.dirname(seed_path), exist_ok=True)
            with open(seed_path, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "ai-text": [
                            {
                                "title": "Draft outline",
                                "template": "Write an outline",
                            }
                        ]
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            service = self._build_service(
                temp_dir,
                preset_definitions_path=writable_path,
                preset_definitions_seed_path=seed_path,
            )
            response = service.handle_get(
                handler=None,
                path="/api/v2/user/presets/definitions",
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertEqual(response["data"]["ai-text"][0]["title"], "Draft outline")
            self.assertFalse(os.path.exists(writable_path))

    def test_save_preset_definitions_writes_writable_file_without_modifying_seed(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_path = os.path.join(temp_dir, "user", "prompt-presets.json")
            seed_path = os.path.join(temp_dir, "bundle", "config", "prompt-presets.json")
            os.makedirs(os.path.dirname(seed_path), exist_ok=True)
            with open(seed_path, "w", encoding="utf-8") as file:
                json.dump(
                    {
                        "ai-text": [
                            {
                                "title": "Seed",
                                "template": "Seed template",
                            }
                        ]
                    },
                    file,
                    ensure_ascii=False,
                    indent=2,
                )

            service = self._build_service(
                temp_dir,
                preset_definitions_path=writable_path,
                preset_definitions_seed_path=seed_path,
            )
            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/definitions/save",
                body=json.dumps(
                    {
                        "definitions": {
                            "ai-text": [
                                {
                                    "title": "Saved",
                                    "template": "Saved template",
                                }
                            ]
                        }
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            with open(writable_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            with open(seed_path, "r", encoding="utf-8") as file:
                seed = json.load(file)

            self.assertEqual(saved["ai-text"][0]["title"], "Saved")
            self.assertEqual(seed["ai-text"][0]["title"], "Seed")

    def test_preset_root_getter_redirects_custom_presets_to_library_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            user_dir = os.path.join(temp_dir, "user")
            library_root = os.path.join(temp_dir, "library", "presets", "prompt")
            os.makedirs(user_dir, exist_ok=True)
            service = self._build_service(user_dir, preset_root=library_root)

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-image",
                        "title": "共享海报",
                        "template": "团队共享模板",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            # 自定义预设落到库目录，而不是用户目录
            self.assertTrue(
                os.path.exists(os.path.join(library_root, "ai-image", "共享海报.txt"))
            )
            self.assertFalse(
                os.path.exists(os.path.join(user_dir, "prompt", "ai-image", "共享海报.txt"))
            )

            # 读取也从库目录回放
            presets = service.handle_get(handler=None, path="/api/v2/user/presets")
            self.assertEqual(presets["data"]["ai-image"][0]["title"], "共享海报")
            self.assertEqual(presets["data"]["ai-image"][0]["template"], "团队共享模板")

    def test_preset_root_getter_falls_back_to_user_prompt_when_absent(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 不传 preset_root：保持旧行为，落 <user_dir>/prompt
            service = self._build_service(temp_dir)

            response = service.handle_post(
                handler=None,
                path="/api/v2/user/presets/dev/save",
                body=json.dumps(
                    {
                        "nodeType": "ai-text",
                        "title": "本机预设",
                        "template": "仅本机",
                    }
                ).encode("utf-8"),
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertTrue(
                os.path.exists(os.path.join(temp_dir, "prompt", "ai-text", "本机预设.txt"))
            )

    def test_preset_root_getter_delete_targets_library_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            user_dir = os.path.join(temp_dir, "user")
            library_root = os.path.join(temp_dir, "library", "presets", "prompt")
            os.makedirs(user_dir, exist_ok=True)
            service = self._build_service(user_dir, preset_root=library_root)
            preset_path = os.path.join(library_root, "ai-video", "镜头B.txt")
            os.makedirs(os.path.dirname(preset_path), exist_ok=True)
            with open(preset_path, "w", encoding="utf-8") as file:
                file.write("dolly shot")

            response = service.handle_delete(
                handler=None,
                path="/api/v2/user/presets/dev/ai-video/%E9%95%9C%E5%A4%B4B",
            )

            self.assertEqual(response["kind"], "json_ok")
            self.assertFalse(os.path.exists(preset_path))


    def test_save_preset_definitions_writes_via_atomic_replace_no_partial(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            os.makedirs(os.path.dirname(definitions_path), exist_ok=True)
            # 先放一份完好旧内容，验证失败时不被写半截覆盖
            with open(definitions_path, "w", encoding="utf-8") as file:
                json.dump({"ai-image": [{"title": "OLD", "template": "old"}]}, file)
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )

            with mock.patch(
                "services.library_file_route_service.atomic_replace_with_retry",
                side_effect=OSError("boom"),
            ) as replace_mock:
                response = service.handle_post(
                    handler=None,
                    path="/api/v2/user/presets/definitions/save",
                    body=json.dumps(
                        {"definitions": {"ai-image": [{"title": "NEW", "template": "new"}]}}
                    ).encode("utf-8"),
                )

            # 走了原子替换路径
            self.assertTrue(replace_mock.called)
            tmp_arg, dst_arg = replace_mock.call_args.args[0], replace_mock.call_args.args[1]
            self.assertEqual(dst_arg, definitions_path)
            self.assertTrue(tmp_arg.endswith(".tmp"))
            # 失败被收口成 json_err，旧整表内容完好（没被写半截）
            self.assertEqual(response["kind"], "json_err")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-image"][0]["title"], "OLD")
            # 临时文件已清理
            self.assertFalse(os.path.exists(definitions_path + ".tmp"))

    def test_save_preset_definitions_retries_replace_then_succeeds(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            definitions_path = os.path.join(temp_dir, "config", "prompt-presets.json")
            service = self._build_service(
                temp_dir,
                preset_definitions_path=definitions_path,
            )

            calls = {"n": 0}
            real_replace = os.replace

            def flaky_replace(tmp_path, dst_path, attempts=5, base_delay=0.05):
                calls["n"] += 1
                if calls["n"] < 3:
                    raise PermissionError(13, "Sharing violation")
                real_replace(tmp_path, dst_path)

            with mock.patch(
                "services.library_file_route_service.atomic_replace_with_retry",
                side_effect=flaky_replace,
            ):
                response = service.handle_post(
                    handler=None,
                    path="/api/v2/user/presets/definitions/save",
                    body=json.dumps(
                        {"definitions": {"ai-video": [{"title": "pan", "template": "camera pan"}]}}
                    ).encode("utf-8"),
                )

            self.assertEqual(response["kind"], "json_ok")
            self.assertEqual(calls["n"], 3)
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-video"][0]["template"], "camera pan")
            self.assertFalse(os.path.exists(definitions_path + ".tmp"))

    def test_save_preset_definitions_uses_real_retry_helper_to_persist(self):
        # 不 patch helper，端到端验证真实 atomic_replace_with_retry 落盘
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
                    {"definitions": {"ai-image": [{"title": "real", "template": "t"}]}}
                ).encode("utf-8"),
            )
            self.assertEqual(response["kind"], "json_ok")
            with open(definitions_path, "r", encoding="utf-8") as file:
                saved = json.load(file)
            self.assertEqual(saved["ai-image"][0]["title"], "real")


if __name__ == "__main__":
    unittest.main()
