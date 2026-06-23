import os
import tempfile
import unittest

from services.sam3_service import Sam3Service


def _is_path_inside(target, base):
    try:
        target_abs = os.path.abspath(target)
        base_abs = os.path.abspath(base)
        common = os.path.commonpath([target_abs, base_abs])
        return common == base_abs
    except Exception:
        return False


class Sam3ServiceAssetsProviderTests(unittest.TestCase):
    def _build_service(self, directory, assets_dir_provider):
        return Sam3Service(
            directory=directory,
            assets_dir_provider=assets_dir_provider,
            uploads_dir_provider=lambda: os.path.join(directory, "data", "uploads"),
            output_dir_provider=lambda: os.path.join(directory, "output"),
            path_inside_checker=_is_path_inside,
        )

    def test_safe_resolve_image_path_follows_mutable_assets_provider(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            # 真实磁盘上的素材文件：<dir>/data/assets/pic.png
            assets_dir = os.path.join(temp_dir, "data", "assets")
            os.makedirs(assets_dir, exist_ok=True)
            asset_file = os.path.join(assets_dir, "pic.png")
            with open(asset_file, "wb") as handle:
                handle.write(b"\x89PNG\r\n")

            # 一个起初指向"错误"目录的可变 provider
            state = {"assets_dir": os.path.join(temp_dir, "wrong_assets")}
            provider = lambda: state["assets_dir"]

            service = self._build_service(temp_dir, provider)

            # provider 指向错误目录时：data/assets/pic.png 不在 assets_dir 内 -> None
            self.assertIsNone(service.safe_resolve_image_path("data/assets/pic.png"))

            # 改变 provider 返回值为真实素材目录（不重建 service）
            state["assets_dir"] = assets_dir

            # path-inside 校验应跟随新目录通过，解析出真实绝对路径
            resolved = service.safe_resolve_image_path("data/assets/pic.png")
            self.assertEqual(resolved, os.path.abspath(asset_file))

    def test_assets_dir_not_frozen_at_construction(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            assets_dir = os.path.join(temp_dir, "data", "assets")
            os.makedirs(assets_dir, exist_ok=True)
            asset_file = os.path.join(assets_dir, "frame.png")
            with open(asset_file, "wb") as handle:
                handle.write(b"\x89PNG\r\n")

            calls = {"count": 0}

            def provider():
                calls["count"] += 1
                return assets_dir

            service = self._build_service(temp_dir, provider)

            # 构造期不得调用 provider（不冻结）
            self.assertEqual(calls["count"], 0)

            resolved = service.safe_resolve_image_path("data/assets/frame.png")
            self.assertEqual(resolved, os.path.abspath(asset_file))
            # 用到时才调用 provider
            self.assertGreaterEqual(calls["count"], 1)


if __name__ == "__main__":
    unittest.main()
