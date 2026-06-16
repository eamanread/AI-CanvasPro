import json
import os
import tempfile
import unittest
from pathlib import Path

from services.runtime_paths import (
    apply_private_defaults,
    cleanup_legacy_user_presets,
    summarize_model_registry_for_log,
)


class PrivateDefaultsTests(unittest.TestCase):
    def test_private_defaults_overwrite_config_once_per_manifest(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            (defaults_root / "user").mkdir(parents=True)
            (writable_root / "user").mkdir(parents=True)
            (defaults_root / "user" / "config.json").write_text(
                '{"modelRegistry":{"image":[{"modelName":"bundled"}]}}',
                encoding="utf-8",
            )
            target_config = writable_root / "user" / "config.json"
            target_config.write_text('{"modelRegistry":{"image":[{"modelName":"old"}]}}', encoding="utf-8")

            first = apply_private_defaults(
                defaults_root,
                writable_root,
                manifest={"buildId": "build-1"},
            )

            self.assertTrue(first["applied"])
            self.assertEqual(
                json.loads(target_config.read_text(encoding="utf-8"))["modelRegistry"]["image"][0]["modelName"],
                "bundled",
            )

            target_config.write_text('{"modelRegistry":{"image":[{"modelName":"user-change"}]}}', encoding="utf-8")
            second = apply_private_defaults(
                defaults_root,
                writable_root,
                manifest={"buildId": "build-1"},
            )
            self.assertFalse(second["applied"])
            self.assertEqual(
                json.loads(target_config.read_text(encoding="utf-8"))["modelRegistry"]["image"][0]["modelName"],
                "user-change",
            )

            third = apply_private_defaults(
                defaults_root,
                writable_root,
                manifest={"buildId": "build-2"},
            )
            self.assertTrue(third["applied"])
            self.assertEqual(
                json.loads(target_config.read_text(encoding="utf-8"))["modelRegistry"]["image"][0]["modelName"],
                "bundled",
            )

    def test_private_defaults_skip_settings_file_with_absolute_save_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            defaults_root.mkdir(parents=True)
            (defaults_root / "settings.json").write_text(
                json.dumps(
                    {
                        "fileSavePaths": {
                            "userDir": r"D:\Aic\huanying-source-windows-20260430-122116\user",
                            "outputDir": r"D:\Aic\huanying-source-windows-20260430-122116\output",
                            "tempDir": r"D:\Aic\huanying-source-windows-20260430-122116\data\uploads",
                        }
                    }
                ),
                encoding="utf-8",
            )
            (defaults_root / "user").mkdir()
            (defaults_root / "user" / "settings.json").write_text(
                '{"fileSavePaths":{"userDir":"D:/bad","outputDir":"D:/bad-output","tempDir":"D:/bad-temp"}}',
                encoding="utf-8",
            )

            apply_private_defaults(defaults_root, writable_root, manifest={"buildId": "settings"})

            self.assertFalse((writable_root / "settings.json").exists())
            self.assertFalse((writable_root / "user" / "settings.json").exists())

    def test_private_defaults_copy_assets_and_referenced_output_without_overwriting_existing_assets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            (defaults_root / "data" / "assets").mkdir(parents=True)
            (defaults_root / "output").mkdir(parents=True)
            (writable_root / "data" / "assets").mkdir(parents=True)
            asset = defaults_root / "data" / "assets" / "asset-a.json"
            asset.write_text('{"imageUrl":"/output/gen_a.png"}', encoding="utf-8")
            (defaults_root / "output" / "gen_a.png").write_bytes(b"bundled-output")
            existing_asset = writable_root / "data" / "assets" / "asset-a.json"
            existing_asset.write_text('{"imageUrl":"/output/existing.png"}', encoding="utf-8")

            result = apply_private_defaults(defaults_root, writable_root, manifest={"buildId": "assets"})

            self.assertTrue(result["applied"])
            self.assertEqual(existing_asset.read_text(encoding="utf-8"), '{"imageUrl":"/output/existing.png"}')
            self.assertEqual((writable_root / "output" / "gen_a.png").read_bytes(), b"bundled-output")

    def test_model_registry_log_summary_excludes_api_keys(self):
        summary = summarize_model_registry_for_log(
            {
                "modelRegistry": {
                    "image": [
                        {
                            "modelName": "Gpt-Image-2",
                            "modelId": "gpt-image-2",
                            "apiKey": "secret-api-key",
                            "baseUrl": "https://example.test/v1",
                            "status": "available",
                        }
                    ]
                }
            }
        )

        rendered = json.dumps(summary, ensure_ascii=False)
        self.assertIn("Gpt-Image-2", rendered)
        self.assertIn("https://example.test/v1", rendered)
        self.assertIn("hasApiKey", rendered)
        self.assertNotIn("secret-api-key", rendered)

    def test_library_style_preset_paths_are_never_force_overwritten(self):
        # 回归锁定:迁库后预设落 libraryDir/presets/...,不在 writable_root/user/ 下,
        # 出厂私有默认绝不能强制覆盖它。这里用 presets/ 与 library/presets/ 两种
        # "库风格"相对路径,断言 _should_overwrite_private_default 判定为 False,
        # 且 _copy_private_defaults 在目标已存在时跳过(不打回用户/团队改动)。
        from services.runtime_paths import (
            _copy_private_defaults,
            _should_overwrite_private_default,
        )

        for rel in (
            "presets/prompt-presets.json",
            "presets/prompt/my-style.txt",
            "library/presets/prompt-presets.json",
        ):
            self.assertFalse(
                _should_overwrite_private_default(rel),
                f"{rel} 不应被出厂强制覆盖",
            )

        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            (defaults_root / "presets" / "prompt").mkdir(parents=True)
            (writable_root / "presets" / "prompt").mkdir(parents=True)

            # 出厂带的"库风格"预设
            (defaults_root / "presets" / "prompt-presets.json").write_text(
                '{"presets":["bundled"]}', encoding="utf-8"
            )
            (defaults_root / "presets" / "prompt" / "my-style.txt").write_text(
                "bundled-style", encoding="utf-8"
            )
            # 目标已存在团队/用户改动
            target_json = writable_root / "presets" / "prompt-presets.json"
            target_txt = writable_root / "presets" / "prompt" / "my-style.txt"
            target_json.write_text('{"presets":["team-edited"]}', encoding="utf-8")
            target_txt.write_text("team-edited-style", encoding="utf-8")

            stats = _copy_private_defaults(defaults_root, writable_root)

            # 已存在 + 非覆盖 => 全部跳过,内容原封不动
            self.assertEqual(stats["overwritten"], 0)
            self.assertEqual(
                target_json.read_text(encoding="utf-8"), '{"presets":["team-edited"]}'
            )
            self.assertEqual(
                target_txt.read_text(encoding="utf-8"), "team-edited-style"
            )

    def test_marker_lands_in_writable_root_never_in_library_dir(self):
        # marker 必须写在本机 writable_root,绝不写进共享库目录,
        # 否则 A 机写库 marker 会让 B 机误判 already-applied、跳过出厂初始化。
        with tempfile.TemporaryDirectory() as temp_dir:
            defaults_root = Path(temp_dir) / "defaults"
            writable_root = Path(temp_dir) / "writable"
            library_dir = Path(temp_dir) / "nas" / "team-lib"
            (defaults_root / "user").mkdir(parents=True)
            writable_root.mkdir(parents=True)
            library_dir.mkdir(parents=True)
            (defaults_root / "user" / "config.json").write_text(
                '{"modelRegistry":{}}', encoding="utf-8"
            )

            marker_name = ".private_defaults_applied.json"
            result = apply_private_defaults(
                defaults_root,
                writable_root,
                manifest={"buildId": "marker-loc"},
                marker_name=marker_name,
            )

            self.assertTrue(result["applied"])
            # marker 落本机
            self.assertTrue((writable_root / marker_name).exists())
            # marker 绝不落库
            self.assertFalse((library_dir / marker_name).exists())
            # 库目录完全没被这条出厂流程写入任何东西
            self.assertEqual(list(library_dir.iterdir()), [])

    def test_cleanup_legacy_user_presets_dry_run_reports_without_deleting(self):
        # 默认策略=忽略:dry_run=True 只报告残留、不删,出厂行为不惊扰用户。
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_root = Path(temp_dir) / "writable"
            (writable_root / "user" / "prompt").mkdir(parents=True)
            legacy_json = writable_root / "user" / "prompt-presets.json"
            legacy_txt = writable_root / "user" / "prompt" / "old-style.txt"
            legacy_json.write_text('{"presets":["legacy"]}', encoding="utf-8")
            legacy_txt.write_text("legacy-style", encoding="utf-8")

            report = cleanup_legacy_user_presets(writable_root)  # dry_run 默认 True

            self.assertFalse(report["removed"])
            self.assertTrue(report["dryRun"])
            found_posix = {p.replace("\\", "/") for p in report["found"]}
            self.assertIn("user/prompt-presets.json", found_posix)
            self.assertIn("user/prompt", found_posix)
            # 真没删
            self.assertTrue(legacy_json.exists())
            self.assertTrue(legacy_txt.exists())

    def test_cleanup_legacy_user_presets_removes_when_enabled(self):
        # 显式 dry_run=False 才真删旧 user/ 预设残留;缺失项安全降级、不报错。
        with tempfile.TemporaryDirectory() as temp_dir:
            writable_root = Path(temp_dir) / "writable"
            (writable_root / "user" / "prompt").mkdir(parents=True)
            legacy_json = writable_root / "user" / "prompt-presets.json"
            legacy_txt = writable_root / "user" / "prompt" / "old-style.txt"
            legacy_json.write_text('{"presets":["legacy"]}', encoding="utf-8")
            legacy_txt.write_text("legacy-style", encoding="utf-8")
            # user/config.json 等其它文件不在清理范围,必须保留
            (writable_root / "user" / "config.json").write_text("{}", encoding="utf-8")

            report = cleanup_legacy_user_presets(writable_root, dry_run=False)

            self.assertFalse(report["dryRun"])
            removed_posix = {p.replace("\\", "/") for p in report["removed"]}
            self.assertIn("user/prompt-presets.json", removed_posix)
            self.assertIn("user/prompt", removed_posix)
            self.assertFalse(legacy_json.exists())
            self.assertFalse((writable_root / "user" / "prompt").exists())
            # 非预设文件不动
            self.assertTrue((writable_root / "user" / "config.json").exists())

            # 二次调用:残留已不存在,安全降级、报告为空、不抛
            again = cleanup_legacy_user_presets(writable_root, dry_run=False)
            self.assertEqual(again["found"], [])
            self.assertEqual(again["removed"], [])


if __name__ == "__main__":
    unittest.main()
