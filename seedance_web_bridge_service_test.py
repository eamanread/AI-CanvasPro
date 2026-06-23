import unittest
import os
import tempfile
from unittest import mock

from integrations.seedance_extension_bridge.bridge_service import SeedanceWebBridgeService
from integrations.seedance_extension_bridge.browser_launcher import SeedanceBrowserLauncher


class _StubBrowserLauncher:
    def __init__(self):
        self.calls = []

    def get_runtime_info(self):
        return {
            "extensionDir": "C:/app/integrations/seedance_extension_bridge/extension",
            "extensionAvailable": True,
            "profileDir": "C:/state/user_data/seedance_web/profile",
            "browserPath": "C:/Program Files/Google/Chrome/Application/chrome.exe",
            "browserAvailable": True,
        }

    def launch_login(self, *, force=False):
        self.calls.append({"force": bool(force)})
        return {
            "active": True,
            "phase": "browser_started",
            "url": "https://dreamina.capcut.com/",
        }


class _RecordingPopen:
    def __init__(self):
        self.calls = []

    def __call__(self, args):
        self.calls.append(list(args))


class SeedanceWebBridgeServiceTests(unittest.TestCase):
    def test_status_includes_runtime_paths_and_provider(self):
        service = SeedanceWebBridgeService(browser_launcher=_StubBrowserLauncher())

        status = service.get_status()

        self.assertTrue(status["available"])
        self.assertEqual(status["provider"], "seedance_web")
        self.assertTrue(status["runtime"]["browserAvailable"])
        self.assertIn("profile", status["runtime"]["profileDir"])

    def test_start_login_uses_browser_launcher(self):
        launcher = _StubBrowserLauncher()
        service = SeedanceWebBridgeService(browser_launcher=launcher)

        runtime = service.start_login(force=True)

        self.assertEqual(launcher.calls, [{"force": True}])
        self.assertTrue(runtime["active"])
        self.assertEqual(runtime["phase"], "browser_started")

    def test_logout_returns_profile_preserved_status(self):
        service = SeedanceWebBridgeService(browser_launcher=_StubBrowserLauncher())

        status = service.logout()

        self.assertFalse(status["active"])
        self.assertEqual(status["phase"], "profile_preserved")

    def test_logout_blocks_old_heartbeat_until_account_data_returns(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "reportedAt": 1000.0,
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )
        now[0] += 10.0
        service.logout()

        old_page = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "reportedAt": 1005.0,
                "hasPromptEditor": True,
                "hasSubmitButton": True,
            }
        )

        self.assertFalse(old_page["loggedIn"])
        self.assertTrue(old_page["ignoredStaleAfterLogout"])
        self.assertFalse(service.get_status()["loggedIn"])
        self.assertEqual(service.get_status()["account"], {})

    def test_logout_blocks_stale_account_heartbeat_reported_before_logout(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "reportedAt": 1000.0,
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )
        now[0] += 10.0
        service.logout()

        stale_account_page = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "reportedAt": 1005.0,
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )

        self.assertFalse(stale_account_page["loggedIn"])
        self.assertTrue(stale_account_page["ignoredStaleAfterLogout"])
        self.assertFalse(service.get_status()["loggedIn"])
        self.assertEqual(service.get_status()["account"], {})

    def test_reported_page_status_marks_overseas_login_as_logged_in(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "loggedIn": True,
                "url": "https://dreamina.capcut.com/ai-tool/home",
                "title": "Dreamina",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
                "account": {
                    "displayName": "demo-user",
                    "balanceText": "Credits 120",
                },
            }
        )
        status = service.get_status()

        self.assertTrue(reported["loggedIn"])
        self.assertTrue(status["loggedIn"])
        self.assertEqual(status["pageStatus"]["url"], "https://dreamina.capcut.com/ai-tool/home")

    def test_account_data_is_required_for_logged_in_status(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "page_connected")
        self.assertFalse(service.get_status()["loggedIn"])

    def test_account_data_marks_seedance_web_as_logged_in(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
                "account": {
                    "displayName": "demo-user",
                    "balanceText": "Credits 120",
                },
            }
        )
        status = service.get_status()

        self.assertTrue(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "account_connected")
        self.assertEqual(status["account"]["balanceText"], "Credits 120")
        self.assertTrue(status["loggedIn"])

    def test_visible_user_avatar_marks_seedance_web_as_logged_in(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasUserAvatar": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        status = service.get_status()

        self.assertTrue(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "account_connected")
        self.assertTrue(status["loggedIn"])
        self.assertEqual(status["account"], {})

    def test_sign_in_button_overwrites_previous_account_data(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )

        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasLoginButton": False,
                "account": {"displayName": "demo-user", "balanceText": "Credits 120"},
            }
        )
        now[0] += 2.0
        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/",
                "hasLoginButton": True,
                "loginText": "Sign in",
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "page_connected")
        self.assertEqual(service.get_status()["account"], {})
        self.assertFalse(service.get_status()["loggedIn"])

    def test_reported_page_status_requires_account_even_with_explicit_web_login_status(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/",
                "authenticated": True,
                "hasExplicitLoginStatus": True,
                "hasToolbar": False,
                "hasLoginButton": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_explicit_authenticated_workspace_requires_real_account_data(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "authenticated": True,
                "hasExplicitLoginStatus": True,
                "hasAccountMenu": True,
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
                "account": {},
            }
        )
        status = service.get_status()

        self.assertFalse(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "page_connected")
        self.assertEqual(status["account"], {})
        self.assertFalse(status["loggedIn"])

    def test_explicit_logged_out_status_blocks_account_menu_workspace_fallback(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "authenticated": False,
                "hasExplicitLoginStatus": True,
                "hasAccountMenu": True,
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
                "account": {},
            }
        )
        status = service.get_status()

        self.assertFalse(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "page_connected")
        self.assertEqual(status["account"], {})
        self.assertFalse(status["loggedIn"])

    def test_reported_page_status_rejects_explicit_logged_out_status(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "loggedIn": True,
                "url": "https://dreamina.capcut.com/",
                "authenticated": False,
                "hasExplicitLoginStatus": True,
                "hasPromptEditor": True,
                "hasLoginButton": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_low_confidence_logged_out_page_does_not_overwrite_fresh_logged_in_workspace(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )

        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
                "account": {
                    "displayName": "demo-user",
                    "balanceText": "Credits 120",
                },
            }
        )
        now[0] += 2.0
        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/",
                "hasToolbar": False,
                "hasFileInput": False,
                "hasSubmitButton": False,
                "hasTextarea": False,
                "hasPromptEditor": False,
                "hasUploadArea": False,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertEqual(reported["connectionState"], "page_connected")
        self.assertFalse(service.get_status()["loggedIn"])

    def test_explicit_logged_out_homepage_overwrites_fresh_logged_in_workspace(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )

        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        now[0] += 2.0
        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/",
                "authenticated": False,
                "hasExplicitLoginStatus": True,
                "hasToolbar": False,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_reported_page_status_keeps_balance_text(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "loggedIn": True,
                "url": "https://dreamina.capcut.com/ai-tool/home",
                "title": "Dreamina",
                "creditText": "余额：128",
            }
        )
        status = service.get_status()

        self.assertEqual(reported["creditText"], "余额：128")
        self.assertEqual(status["pageStatus"]["creditText"], "余额：128")
        self.assertEqual(status["creditText"], "余额：128")

    def test_reported_page_status_requires_real_login_evidence(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "loggedIn": True,
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "title": "Dreamina",
                "hasToolbar": False,
                "hasFileInput": False,
                "hasSubmitButton": False,
                "hasTextarea": False,
                "hasPromptEditor": False,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_toolbar_only_does_not_count_as_logged_in(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        reported = service.report_page_status(
            {
                "loggedIn": True,
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "title": "Dreamina",
                "hasToolbar": True,
                "hasFileInput": False,
                "hasSubmitButton": False,
                "hasTextarea": False,
                "hasPromptEditor": False,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_explicit_logged_out_status_overwrites_previous_logged_in_status(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )

        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        now[0] += 2.0
        reported = service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/",
                "authenticated": False,
                "hasExplicitLoginStatus": True,
                "hasToolbar": False,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        self.assertFalse(reported["loggedIn"])
        self.assertFalse(service.get_status()["loggedIn"])

    def test_stale_page_status_does_not_keep_login_alive_forever(self):
        now = [1000.0]
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: now[0],
        )

        service.report_page_status({"loggedIn": True})
        now[0] += 600.0
        status = service.get_status()

        self.assertFalse(status["loggedIn"])

    def test_submit_video_task_creates_pending_seedance_task(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )

        task = service.submit_video_task(
            {
                "prompt": "a dog running",
                "modelConfig": {
                    "model": "Seedance 2.0",
                    "aspectRatio": "16:9",
                    "duration": "5s",
                },
                "referenceFiles": [],
            }
        )

        self.assertTrue(task["taskCode"].startswith("SDW-"))
        self.assertEqual(task["status"], "pending")
        self.assertEqual(service.get_pending_tasks("client-1")["total"], 1)

    def test_submit_video_task_appends_ordered_prompt_marker(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        first = service.submit_video_task({"prompt": "吃饭"})
        second = service.submit_video_task({"prompt": "吃面"})

        self.assertEqual(first["prompt"], "吃饭")
        self.assertRegex(first["promptMarker"], r"^HY[A-F0-9]{4}A001$")
        self.assertRegex(second["promptMarker"], r"^HY[A-F0-9]{4}A002$")
        self.assertEqual(first["promptMarker"][:-3], second["promptMarker"][:-3])
        self.assertEqual(
            first["markedPrompt"],
            f"吃饭 [[{first['promptMarker']}]]",
        )
        self.assertEqual(
            second["markedPrompt"],
            f"吃面 [[{second['promptMarker']}]]",
        )

    def test_submit_video_task_allows_connected_page_without_account_data(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )

        task = service.submit_video_task({"prompt": "a dog running"})

        self.assertTrue(task["taskCode"].startswith("SDW-"))
        self.assertEqual(task["status"], "pending")

    def test_get_pending_tasks_can_include_submitted_tasks_for_result_polling(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "a dog running"})
        service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "submitted",
                "resultAnchor": {"anchorToken": "anchor-1"},
            }
        )

        self.assertEqual(service.get_pending_tasks("client-1")["total"], 0)
        active = service.get_pending_tasks("background", include_submitted=True)

        self.assertEqual(active["total"], 1)
        self.assertEqual(active["tasks"][0]["status"], "submitted")
        self.assertEqual(active["tasks"][0]["resultAnchor"]["anchorToken"], "anchor-1")

    def test_update_task_status_persists_result_probe_diagnostics(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "a dog running"})

        service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "submitted",
                "resultProbe": {
                    "expectedPromptMarker": task["promptMarker"],
                    "markerMatchedCount": 1,
                    "videoCandidateCount": 0,
                    "generatingCandidateCount": 1,
                },
            }
        )

        result = service.query_task(task["taskCode"])

        self.assertEqual(result["resultProbe"]["expectedPromptMarker"], task["promptMarker"])
        self.assertEqual(result["resultProbe"]["markerMatchedCount"], 1)
        self.assertEqual(result["resultProbe"]["videoCandidateCount"], 0)
        self.assertEqual(result["resultProbe"]["generatingCandidateCount"], 1)

    def test_submitted_task_ignores_transient_failed_to_fetch_status_report(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "a dog running"})
        service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "submitted",
                "resultProbe": {
                    "expectedPromptMarker": task["promptMarker"],
                    "generatingCandidateCount": 1,
                },
            }
        )

        updated = service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "failed",
                "error": "Failed to fetch",
            }
        )
        result = service.query_task(task["taskCode"])

        self.assertEqual(updated["status"], "submitted")
        self.assertEqual(result["status"], "submitted")
        self.assertEqual(result["error"], "")
        self.assertEqual(result["lastTransientError"], "Failed to fetch")
        self.assertEqual(result["resultProbe"]["generatingCandidateCount"], 1)

    def test_processing_task_transient_failure_moves_to_submitted_for_result_polling(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "a dog running"})
        service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "processing",
            }
        )

        updated = service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "failed",
                "error": "Failed to fetch",
            }
        )
        result = service.query_task(task["taskCode"])
        active = service.get_pending_tasks("background", include_submitted=True)

        self.assertEqual(updated["status"], "submitted")
        self.assertEqual(result["status"], "submitted")
        self.assertEqual(result["error"], "")
        self.assertEqual(active["total"], 1)
        self.assertEqual(active["tasks"][0]["taskCode"], task["taskCode"])

    def test_query_completed_task_returns_uploaded_video(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )
        task = service.submit_video_task({"prompt": "a dog"})
        service.update_task_status({"taskCode": task["taskCode"], "status": "completed"})
        service.register_uploaded_file(
            {
                "taskCode": task["taskCode"],
                "filename": "demo.mp4",
                "localPath": "user_data/seedance_web/files/demo.mp4",
                "mimeType": "video/mp4",
            }
        )

        result = service.query_task(task["taskCode"])

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(
            result["videos"][0]["localPath"],
            "user_data/seedance_web/files/demo.mp4",
        )

    def test_uploaded_original_url_cannot_be_reused_by_another_task(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )
        task_one = service.submit_video_task({"prompt": "first"})
        task_two = service.submit_video_task({"prompt": "second"})
        original_url = "https://dreamina.example/video-a.mp4"

        uploaded = service.register_uploaded_file(
            {
                "taskCode": task_one["taskCode"],
                "filename": "first.mp4",
                "localPath": "user_data/seedance_web/files/first.mp4",
                "mimeType": "video/mp4",
                "originalUrl": original_url,
                "promptMarker": task_one["promptMarker"],
            }
        )

        self.assertEqual(uploaded["originalUrl"], original_url)
        with self.assertRaises(ValueError):
            service.register_uploaded_file(
                {
                    "taskCode": task_two["taskCode"],
                    "filename": "second.mp4",
                    "localPath": "user_data/seedance_web/files/second.mp4",
                    "mimeType": "video/mp4",
                    "originalUrl": original_url,
                    "promptMarker": task_two["promptMarker"],
                }
            )

        result = service.query_task(task_one["taskCode"])
        self.assertEqual(result["videos"][0]["originalUrl"], original_url)

    def test_uploaded_web_video_requires_matching_prompt_marker(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "hasPromptEditor": True,
                "hasSubmitButton": True,
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "吃饭"})

        with self.assertRaisesRegex(ValueError, "prompt marker"):
            service.register_uploaded_file(
                {
                    "taskCode": task["taskCode"],
                    "filename": "wrong.mp4",
                    "localPath": "user_data/seedance_web/files/wrong.mp4",
                    "mimeType": "video/mp4",
                    "originalUrl": "https://dreamina.example/wrong.mp4",
                    "promptMarker": "HYFFFFA999",
                }
            )

        uploaded = service.register_uploaded_file(
            {
                "taskCode": task["taskCode"],
                "filename": "right.mp4",
                "localPath": "user_data/seedance_web/files/right.mp4",
                "mimeType": "video/mp4",
                "originalUrl": "https://dreamina.example/right.mp4",
                "promptMarker": task["promptMarker"],
            }
        )

        self.assertEqual(uploaded["promptMarker"], task["promptMarker"])

    def test_query_task_with_uploaded_file_returns_completed_even_if_status_was_failed(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
            }
        )
        task = service.submit_video_task({"prompt": "a landscape"})
        service.register_uploaded_file(
            {
                "taskCode": task["taskCode"],
                "filename": "demo.mp4",
                "localPath": "user_data/seedance_web/files/demo.mp4",
                "mimeType": "video/mp4",
            }
        )
        service.update_task_status(
            {
                "taskCode": task["taskCode"],
                "status": "failed",
                "error": "上传失败: Failed to fetch",
            }
        )

        result = service.query_task(task["taskCode"])

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["error"], "")
        self.assertEqual(
            result["videos"][0]["localPath"],
            "user_data/seedance_web/files/demo.mp4",
        )

    def test_wait_pending_tasks_returns_existing_pending_task(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )
        service.report_page_status(
            {
                "url": "https://dreamina.capcut.com/ai-tool/home/",
                "account": {"displayName": "demo", "balanceText": "Credits 120"},
                "hasLoginButton": False,
                "isLoginPage": False,
            }
        )
        task = service.submit_video_task({"prompt": "dog"})

        result = service.wait_pending_tasks(timeout=0.01)

        self.assertTrue(result["success"])
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["tasks"][0]["taskCode"], task["taskCode"])
        self.assertTrue(result["waited"])

    def test_wait_pending_tasks_times_out_with_empty_result(self):
        service = SeedanceWebBridgeService(
            browser_launcher=_StubBrowserLauncher(),
            clock=lambda: 1000.0,
        )

        result = service.wait_pending_tasks(timeout=0.01)

        self.assertTrue(result["success"])
        self.assertEqual(result["tasks"], [])
        self.assertEqual(result["total"], 0)
        self.assertTrue(result["waited"])

    def test_login_launches_dedicated_extension_window(self):
        popen = _RecordingPopen()
        launcher = SeedanceBrowserLauncher(
            resource_root="D:/app",
            writable_root="D:/state",
            browser_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            popen_factory=popen,
        )
        launcher.resolve_browser_path = lambda: "C:/Program Files/Google/Chrome/Application/chrome.exe"

        with mock.patch("os.path.isdir", return_value=True):
            runtime = launcher.launch_login(force=True)

        self.assertTrue(runtime["active"])
        args = popen.calls[0]
        self.assertIn("--new-window", args)
        self.assertIn("--disable-background-timer-throttling", args)
        self.assertIn("--disable-renderer-backgrounding", args)
        self.assertIn("--disable-backgrounding-occluded-windows", args)
        disable_features = next(arg for arg in args if str(arg).startswith("--disable-features="))
        self.assertIn("DisableLoadExtensionCommandLineSwitch", disable_features)
        self.assertIn("CalculateNativeWinOcclusion", disable_features)
        self.assertTrue(any(str(arg).startswith("--load-extension=") for arg in args))
        self.assertTrue(any(str(arg).startswith("--disable-extensions-except=") for arg in args))

    def test_resolve_browser_prefers_playwright_chromium_over_system_chrome(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            playwright_chromium = os.path.join(
                temp_dir,
                "ms-playwright",
                "chromium-1217",
                "chrome-win64",
                "chrome.exe",
            )
            system_chrome = os.path.join(
                temp_dir,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe",
            )
            os.makedirs(os.path.dirname(playwright_chromium), exist_ok=True)
            os.makedirs(os.path.dirname(system_chrome), exist_ok=True)
            open(playwright_chromium, "w", encoding="utf-8").close()
            open(system_chrome, "w", encoding="utf-8").close()

            launcher = SeedanceBrowserLauncher(
                resource_root="D:/app",
                writable_root="D:/state",
            )

            with mock.patch.dict(
                os.environ,
                {
                    "LOCALAPPDATA": temp_dir,
                    "PROGRAMFILES": temp_dir,
                    "PROGRAMFILES(X86)": "",
                    "AIC_SEEDANCE_WEB_BROWSER_PATH": "",
                },
                clear=False,
            ):
                self.assertEqual(
                    os.path.normcase(launcher.resolve_browser_path()),
                    os.path.normcase(os.path.abspath(playwright_chromium)),
                )

    def test_login_clears_extension_runtime_cache_without_removing_cookies(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = os.path.join(temp_dir, "app")
            writable_root = os.path.join(temp_dir, "state")
            extension_dir = os.path.join(
                resource_root,
                "integrations",
                "seedance_extension_bridge",
                "extension",
            )
            os.makedirs(extension_dir, exist_ok=True)
            with open(os.path.join(extension_dir, "manifest.json"), "w", encoding="utf-8") as f:
                f.write('{"version":"9.9.9"}')

            browser_path = os.path.join(temp_dir, "chrome.exe")
            open(browser_path, "w", encoding="utf-8").close()

            profile_default = os.path.join(
                writable_root,
                "user_data",
                "seedance_web",
                "profile",
                "Default",
            )
            cache_dir = os.path.join(profile_default, "Service Worker", "ScriptCache")
            extension_state_dir = os.path.join(profile_default, "Extension State")
            os.makedirs(cache_dir, exist_ok=True)
            os.makedirs(extension_state_dir, exist_ok=True)
            cookies_path = os.path.join(profile_default, "Cookies")
            with open(cookies_path, "w", encoding="utf-8") as f:
                f.write("keep-login")

            popen = _RecordingPopen()
            launcher = SeedanceBrowserLauncher(
                resource_root=resource_root,
                writable_root=writable_root,
                browser_path=browser_path,
                popen_factory=popen,
            )

            launcher.launch_login(force=True)

            self.assertFalse(os.path.exists(cache_dir))
            self.assertFalse(os.path.exists(extension_state_dir))
            self.assertTrue(os.path.exists(cookies_path))


if __name__ == "__main__":
    unittest.main()
