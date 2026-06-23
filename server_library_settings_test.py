import json
import os
import tempfile
import unittest
from unittest import mock

import server
from services.library_storage import derive_library_paths, validate_library_dir


class ServerLibrarySettingsTest(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        root = self._td.name
        self.settings_file = os.path.join(root, "user", "settings.json")
        self.system_file = os.path.join(root, "sys", "system-settings.json")
        self.user_dir = os.path.join(root, "user")
        self.lib_dir = os.path.join(root, "nas-lib")
        os.makedirs(os.path.join(root, "user"), exist_ok=True)
        os.makedirs(os.path.join(root, "sys"), exist_ok=True)
        os.makedirs(self.lib_dir, exist_ok=True)
        # 保存被测全局的原值，tearDown 还原，避免污染其它 server 测试。
        self._saved = {
            name: getattr(server, name)
            for name in (
                "SETTINGS_FILE", "SYSTEM_SETTINGS_FILE", "USER_DIR",
                "ASSETS_DIR", "ASSET_THUMBS_DIR", "WORKFLOWS_DIR",
                "WORKFLOW_THUMBS_DIR", "OUTPUT_DIR", "UPLOADS_DIR",
                "WRITABLE_ROOT",
            )
            if hasattr(server, name)
        }
        self._saved_lib = getattr(server, "LIBRARY_DIR", "")
        server.SETTINGS_FILE = self.settings_file
        server.SYSTEM_SETTINGS_FILE = self.system_file
        server.USER_DIR = self.user_dir
        # 把迁移源目录 + WRITABLE_ROOT 全部指向临时子目录，让 migrate_into_library
        # 扫描 0 个真实文件，让 _cleanup_legacy_user_presets 找不到任何真实路径，
        # 从而使 migrate=True 的迁移路径成为真正的 no-op，测试完全隔离。
        self.assets_dir = os.path.join(root, "assets")
        os.makedirs(self.assets_dir, exist_ok=True)
        self.workflows_dir = os.path.join(root, "workflows")
        os.makedirs(self.workflows_dir, exist_ok=True)
        self.output_dir = os.path.join(root, "output")
        os.makedirs(self.output_dir, exist_ok=True)
        self.uploads_dir = os.path.join(root, "uploads")
        os.makedirs(self.uploads_dir, exist_ok=True)
        server.ASSETS_DIR = self.assets_dir
        server.ASSET_THUMBS_DIR = os.path.join(root, "asset-thumbs")
        server.WORKFLOWS_DIR = self.workflows_dir
        server.WORKFLOW_THUMBS_DIR = os.path.join(root, "wf-thumbs")
        server.OUTPUT_DIR = self.output_dir
        server.UPLOADS_DIR = self.uploads_dir
        server.WRITABLE_ROOT = root

    def tearDown(self):
        for name, value in self._saved.items():
            setattr(server, name, value)
        server.LIBRARY_DIR = self._saved_lib
        self._td.cleanup()

    def _read_json(self, path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_save_settings_with_library_dir_validates_and_persists_to_system_settings(self):
        with mock.patch.object(
            server, "validate_library_dir", wraps=validate_library_dir
        ) as spy:
            server._write_user_settings({"libraryDir": self.lib_dir, "foo": "bar"})

        # ① 走了校验
        self.assertTrue(spy.called, "保存 libraryDir 时未调用 validate_library_dir")

        normalized = os.path.abspath(self.lib_dir)
        # ② 落进 system settings（每机各自 LOCALAPPDATA 的 system-settings.json）
        sysdata = self._read_json(self.system_file)
        self.assertEqual(sysdata.get("libraryDir"), normalized)
        # 同时写进 local settings，供 _read_user_settings 回显
        localdata = self._read_json(self.settings_file)
        self.assertEqual(localdata.get("libraryDir"), normalized)
        # ③ LIBRARY_DIR 生效
        self.assertEqual(server.LIBRARY_DIR, normalized)
        # ④ 启用库时 derive 出来的子目录覆盖 globals
        paths = derive_library_paths(normalized)
        self.assertEqual(server.ASSETS_DIR, paths["assetsDir"])
        self.assertEqual(server.WORKFLOWS_DIR, paths["workflowsDir"])
        self.assertEqual(server.OUTPUT_DIR, paths["outputDir"])
        self.assertEqual(server.UPLOADS_DIR, paths["uploadsDir"])
        # 子目录被建出来
        self.assertTrue(os.path.isdir(paths["assetsDir"]))

    def test_empty_library_dir_disables_and_removes_system_key(self):
        # 先启用
        server._write_user_settings({"libraryDir": self.lib_dir})
        self.assertTrue(server.LIBRARY_DIR)
        # 再清空 -> 关闭
        server._write_user_settings({"libraryDir": ""})
        self.assertEqual(server.LIBRARY_DIR, "")
        sysdata = self._read_json(self.system_file)
        self.assertNotIn("libraryDir", sysdata)

    def test_save_settings_without_library_dir_key_is_untouched(self):
        # payload 不带 libraryDir 时，绝不应触碰库逻辑（向后兼容旧三框保存）
        with mock.patch.object(
            server, "validate_library_dir", wraps=validate_library_dir
        ) as spy:
            server._write_user_settings({"installId": "abc123"})
        self.assertFalse(spy.called)
        self.assertEqual(server.LIBRARY_DIR, self._saved_lib)

    def test_invalid_library_dir_raises_and_does_not_persist(self):
        # 库目录嵌套在 user_dir 内 -> validate_library_dir 抛 ValueError，应冒泡且不落盘
        nested = os.path.join(self.user_dir, "lib")
        os.makedirs(nested, exist_ok=True)
        with self.assertRaises(ValueError):
            server._write_user_settings({"libraryDir": nested})
        self.assertFalse(os.path.exists(self.system_file))


if __name__ == "__main__":
    unittest.main()
