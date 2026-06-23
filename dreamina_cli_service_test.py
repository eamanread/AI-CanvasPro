import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from services.dreamina_cli_service import DreaminaCliService


class DreaminaCliServiceManualLoginTests(unittest.TestCase):
    def test_login_page_url_uses_official_ai_tool_login_page(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))

            self.assertEqual(
                service.get_login_runtime()["loginPageUrl"],
                "https://jimeng.jianying.com/ai-tool/login",
            )

    def test_start_login_with_overseas_region_uses_overseas_login_page_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))
            service._run_login_sequence = lambda *args, **kwargs: None

            runtime = service.start_login(mode="web", region="overseas")

            self.assertEqual(runtime["loginRegion"], "overseas")
            self.assertEqual(
                runtime["loginPageUrl"],
                "https://dreamina.capcut.com/ai-tool/login",
            )

    def test_configured_overseas_region_initializes_runtime_login_page_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            config_file.write_text(
                '{"dreaminaCli":{"region":"overseas"}}',
                encoding="utf-8",
            )
            service = DreaminaCliService(str(config_file))

            runtime = service.get_login_runtime()

            self.assertEqual(runtime["loginRegion"], "overseas")
            self.assertEqual(
                runtime["loginPageUrl"],
                "https://dreamina.capcut.com/ai-tool/login",
            )

    def test_overseas_region_rewrites_manual_authorize_url_to_overseas_domain(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))
            service._login_runtime["loginRegion"] = "overseas"
            service._login_runtime["outputTail"] = [
                "继续登录链接: https://jimeng.jianying.com/passport/web_login?redirect_url=https%3A%2F%2Fjimeng.jianying.com%2Fdreamina%2Fcli%2Fv1%2Fdreamina_cli_login%3Fcb%3Dabc123",
            ]

            service._sync_manual_login_links_locked()

            self.assertEqual(
                service._login_runtime["authorizeUrl"],
                "https://dreamina.capcut.com/passport/web_login?redirect_url=https%3A%2F%2Fdreamina.capcut.com%2Fdreamina%2Fcli%2Fv1%2Fdreamina_cli_login%3Fcb%3Dabc123",
            )
            self.assertNotIn("jimeng.jianying.com", service._login_runtime["authorizeUrl"])

    def test_resolve_command_path_skips_invalid_executable_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_exe = Path(tmpdir) / "dreamina.exe"
            fake_exe.write_text("not a windows executable", encoding="utf-8")
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))
            service._candidate_commands = lambda: [str(fake_exe)]

            self.assertEqual(service._resolve_command_path(), "")

    def test_sync_manual_login_links_prefers_real_authorize_url_over_homepage_verification_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))

            service._login_runtime["verificationUrl"] = "https://jimeng.jianying.com/"
            service._login_runtime["outputTail"] = [
                "请在浏览器中打开以下链接: https://jimeng.jianying.com/",
                "继续登录链接: https://jimeng.jianying.com/passport/web_login?redirect_url=https%3A%2F%2Fjimeng.jianying.com%2Fdreamina%2Fcli%2Fv1%2Fdreamina_cli_login%3Fcb%3Dabc123",
            ]

            service._sync_manual_login_links_locked()

            self.assertEqual(
                service._login_runtime["authorizeUrl"],
                "https://jimeng.jianying.com/passport/web_login?redirect_url=https%3A%2F%2Fjimeng.jianying.com%2Fdreamina%2Fcli%2Fv1%2Fdreamina_cli_login%3Fcb%3Dabc123",
            )
            self.assertEqual(
                service._login_runtime["callbackUrl"],
                "",
            )

    def test_sync_manual_login_links_ignores_homepage_verification_url_without_real_authorize_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))

            service._login_runtime["verificationUrl"] = "https://jimeng.jianying.com/"
            service._login_runtime["outputTail"] = [
                "请在浏览器中打开以下链接: https://jimeng.jianying.com/",
            ]

            service._sync_manual_login_links_locked()

            self.assertEqual(service._login_runtime["authorizeUrl"], "")
            self.assertEqual(service._login_runtime["callbackUrl"], "")
            self.assertTrue(service._login_runtime["manualLoginAvailable"])

    def test_cancel_login_stops_active_login_without_waiting_for_timeout(self):
        class FakeProc:
            pid = 123

            def __init__(self):
                self.terminated = False
                self.waited = False

            def terminate(self):
                self.terminated = True

            def wait(self, timeout=None):
                self.waited = True
                return -15

        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))
            proc = FakeProc()
            service._terminate_process_tree = lambda pid: False
            service._login_runtime["active"] = True
            service._login_runtime["phase"] = "starting"
            service._login_runtime["loginMode"] = "web"
            service._login_runtime["startedAt"] = 1000
            service._active_login_proc = proc

            runtime = service.cancel_login()

            self.assertFalse(runtime["active"])
            self.assertEqual(runtime["phase"], "cancelled")
            self.assertIn("取消", runtime["message"])
            self.assertTrue(proc.terminated)
            self.assertTrue(proc.waited)
            self.assertIsNone(service._active_login_proc)

    def test_cancel_login_during_cli_prepare_prevents_late_login_process_start(self):
        class FakeStdout:
            def readline(self):
                return ""

        class FakeProc:
            pid = 456
            stdout = FakeStdout()

            def poll(self):
                return 0

            def wait(self, timeout=None):
                return 0

        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))
            prepare_entered = threading.Event()
            release_prepare = threading.Event()
            popen_called = threading.Event()

            def slow_prepare():
                prepare_entered.set()
                release_prepare.wait(timeout=2)
                return str(Path(tmpdir) / "dreamina.exe")

            def fake_popen(*args, **kwargs):
                popen_called.set()
                return FakeProc()

            service._resolve_command_path = lambda: ""
            service._ensure_managed_cli = slow_prepare
            service._cleanup_stale_login_processes = lambda: 0

            with patch("services.dreamina_cli_service.subprocess.Popen", side_effect=fake_popen):
                service.start_login(mode="web")
                self.assertTrue(prepare_entered.wait(timeout=1))

                runtime = service.cancel_login()
                release_prepare.set()

                self.assertFalse(runtime["active"])
                self.assertEqual(runtime["phase"], "cancelled")
                self.assertFalse(popen_called.wait(timeout=0.3))
                self.assertEqual(service.get_login_runtime()["phase"], "cancelled")

    def test_login_runtime_snapshot_has_no_qr_image_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_file = Path(tmpdir) / "config.json"
            service = DreaminaCliService(str(config_file))

            runtime = service.get_login_runtime()

            self.assertNotIn("qrPath", runtime)
            self.assertNotIn("qrAvailable", runtime)
            self.assertNotIn("qrVersion", runtime)
            self.assertNotIn("qrUpdatedAt", runtime)
            self.assertFalse(hasattr(service, "get_qr_png"))


if __name__ == "__main__":
    unittest.main()
