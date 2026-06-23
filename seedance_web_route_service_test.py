import json
import os
import tempfile
import unittest
from email.message import Message

from integrations.seedance_extension_bridge.route_service import SeedanceWebRouteService


class _StubSeedanceWebBridgeService:
    def __init__(self):
        self.login_calls = []
        self.logout_calls = 0

    def get_status(self):
        return {"available": True, "loggedIn": False}

    def start_login(self, force=False):
        self.login_calls.append({"force": bool(force)})
        return {"started": True, "force": bool(force)}

    def logout(self):
        self.logout_calls += 1
        return {"loggedOut": True}

    def report_page_status(self, payload):
        self.reported_payload = payload
        return {"loggedIn": bool(payload.get("loggedIn"))}

    def wait_pending_tasks(self, client_id="", timeout=25, include_submitted=True):
        self.wait_call = {
            "client_id": client_id,
            "timeout": timeout,
            "include_submitted": include_submitted,
        }
        return {
            "success": True,
            "tasks": [{"taskCode": "SDW-WAIT"}],
            "total": 1,
            "waited": True,
        }


class _MultipartHandler:
    def __init__(self, content_type):
        self.headers = Message()
        self.headers["Content-Type"] = content_type


class _PathHandler:
    def __init__(self, path):
        self.path = path


class SeedanceWebRouteServiceTests(unittest.TestCase):
    def test_status_route_returns_bridge_status(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        response = service.handle_get(object(), "/api/v2/seedance-web/status")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertTrue(response["data"]["status"]["available"])

    def test_login_route_passes_force_flag(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(
            object(),
            "/api/v2/seedance-web/login",
            json.dumps({"force": True}).encode("utf-8"),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(bridge.login_calls, [{"force": True}])
        self.assertTrue(response["data"]["runtime"]["started"])

    def test_logout_route_uses_bridge_logout(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(object(), "/api/v2/seedance-web/logout", b"{}")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(bridge.logout_calls, 1)

    def test_invalid_json_returns_400(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        response = service.handle_post(object(), "/api/v2/seedance-web/login", b"{")

        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 400)

    def test_page_status_route_updates_bridge_status(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(
            object(),
            "/api/v2/seedance-web/page-status",
            json.dumps({"loggedIn": True, "url": "https://dreamina.capcut.com/"}).encode("utf-8"),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertTrue(response["data"]["status"]["loggedIn"])
        self.assertTrue(bridge.reported_payload["loggedIn"])

    def test_tasks_route_submits_video_task(self):
        bridge = _StubSeedanceWebBridgeService()
        bridge.submit_video_task = lambda payload: {
            "taskCode": "SDW-1",
            "status": "pending",
            **payload,
        }
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(
            object(),
            "/api/v2/seedance-web/tasks",
            json.dumps({"prompt": "dog"}).encode("utf-8"),
        )

        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["task"]["taskCode"], "SDW-1")

    def test_bridge_pending_route_returns_tasks(self):
        bridge = _StubSeedanceWebBridgeService()
        bridge.get_pending_tasks = lambda client_id="", include_submitted=False: {
            "success": True,
            "tasks": [{"taskCode": "SDW-1"}],
            "total": 1,
        }
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_get(
            object(),
            "/api/v2/seedance-web/bridge/api/tasks/pending?clientId=background",
        )

        self.assertEqual(response["data"]["total"], 1)

    def test_bridge_pending_route_can_include_submitted_tasks(self):
        bridge = _StubSeedanceWebBridgeService()
        captured = {}

        def get_pending_tasks(client_id="", include_submitted=False):
            captured["client_id"] = client_id
            captured["include_submitted"] = include_submitted
            return {
                "success": True,
                "tasks": [{"taskCode": "SDW-1", "status": "submitted"}],
                "total": 1,
            }

        bridge.get_pending_tasks = get_pending_tasks
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_get(
            _PathHandler(
                "/api/v2/seedance-web/bridge/api/tasks/pending?clientId=background&includeSubmitted=1"
            ),
            "/api/v2/seedance-web/bridge/api/tasks/pending",
        )

        self.assertEqual(response["data"]["total"], 1)
        self.assertEqual(captured["client_id"], "background")
        self.assertTrue(captured["include_submitted"])

    def test_bridge_wait_route_waits_for_tasks(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_get(
            _PathHandler(
                "/api/v2/seedance-web/bridge/api/tasks/wait?clientId=background&timeout=2&includeSubmitted=0"
            ),
            "/api/v2/seedance-web/bridge/api/tasks/wait",
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["tasks"][0]["taskCode"], "SDW-WAIT")
        self.assertEqual(bridge.wait_call["client_id"], "background")
        self.assertEqual(bridge.wait_call["timeout"], 2)
        self.assertFalse(bridge.wait_call["include_submitted"])

    def test_seedance_bridge_routes_are_identified_for_extension_access(self):
        self.assertTrue(
            SeedanceWebRouteService.is_bridge_route(
                "/api/v2/seedance-web/bridge/api/tasks/pending?clientId=background"
            )
        )
        self.assertTrue(
            SeedanceWebRouteService.is_bridge_route(
                "/api/v2/seedance-web/bridge/api/tasks/status"
            )
        )
        self.assertFalse(
            SeedanceWebRouteService.is_bridge_route("/api/v2/seedance-web/status")
        )
        self.assertFalse(
            SeedanceWebRouteService.is_bridge_route("/api/v2/dreamina/status")
        )

    def test_query_result_route_returns_task_result(self):
        bridge = _StubSeedanceWebBridgeService()
        bridge.query_task = lambda task_code: {
            "success": True,
            "taskCode": task_code,
            "status": "completed",
        }
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_get(
            object(),
            "/api/v2/seedance-web/query_result?taskCode=SDW-1",
        )

        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["taskCode"], "SDW-1")

    def test_query_result_reads_query_from_handler_path_when_dispatcher_strips_path(self):
        bridge = _StubSeedanceWebBridgeService()
        bridge.query_task = lambda task_code: {
            "success": True,
            "taskCode": task_code,
            "status": "pending",
        }
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_get(
            _PathHandler("/api/v2/seedance-web/query_result?taskCode=SDW-DISPATCH"),
            "/api/v2/seedance-web/query_result",
        )

        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["taskCode"], "SDW-DISPATCH")

    def test_bridge_file_upload_metadata_registers_result(self):
        bridge = _StubSeedanceWebBridgeService()
        bridge.register_uploaded_file = lambda payload: {
            "localPath": payload["localPath"],
            "filename": payload["filename"],
        }
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(
            object(),
            "/api/v2/seedance-web/bridge/api/files/upload",
            json.dumps(
                {
                    "taskCode": "SDW-1",
                    "filename": "demo.mp4",
                    "localPath": "user_data/seedance_web/files/demo.mp4",
                    "mimeType": "video/mp4",
                }
            ).encode("utf-8"),
        )

        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["file"]["filename"], "demo.mp4")

    def test_bridge_file_upload_multipart_saves_file_and_registers_result(self):
        boundary = "----seedance-test"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="taskCode"\r\n\r\n'
            "SDW-1\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="quality"\r\n\r\n'
            "standard\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="originalUrl"\r\n\r\n'
            "https://dreamina.example/video-a.mp4\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="promptMarker"\r\n\r\n'
            "HYAB12A001\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="demo.mp4"\r\n'
            "Content-Type: video/mp4\r\n\r\n"
        ).encode("utf-8") + b"video-bytes" + f"\r\n--{boundary}--\r\n".encode("utf-8")
        bridge = _StubSeedanceWebBridgeService()
        captured = {}

        def register(payload):
            captured.update(payload)
            return payload

        bridge.register_uploaded_file = register
        service = SeedanceWebRouteService(
            bridge_service=bridge,
            upload_dir="user_data/seedance_web/files",
        )

        response = service.handle_post(
            _MultipartHandler(f"multipart/form-data; boundary={boundary}"),
            "/api/v2/seedance-web/bridge/api/files/upload",
            body,
        )

        self.assertTrue(response["data"]["success"])
        self.assertEqual(captured["taskCode"], "SDW-1")
        self.assertEqual(captured["filename"], "demo.mp4")
        self.assertEqual(captured["originalUrl"], "https://dreamina.example/video-a.mp4")
        self.assertEqual(captured["promptMarker"], "HYAB12A001")
        self.assertIn("user_data/seedance_web/files", captured["localPath"])

    def test_bridge_file_upload_uses_virtual_output_path_for_packaged_runtime(self):
        boundary = "----seedance-test"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="taskCode"\r\n\r\n'
            "SDW-1\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="quality"\r\n\r\n'
            "standard\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="originalUrl"\r\n\r\n'
            "https://dreamina.example/video-a.mp4\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="demo.mp4"\r\n'
            "Content-Type: video/mp4\r\n\r\n"
        ).encode("utf-8") + b"video-bytes" + f"\r\n--{boundary}--\r\n".encode("utf-8")
        bridge = _StubSeedanceWebBridgeService()
        captured = {}

        def register(payload):
            captured.update(payload)
            return payload

        bridge.register_uploaded_file = register
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = os.path.join(temp_dir, "output", "seedance_web")
            service = SeedanceWebRouteService(
                bridge_service=bridge,
                upload_dir_getter=lambda: output_dir,
                upload_local_prefix="output/seedance_web",
            )

            response = service.handle_post(
                _MultipartHandler(f"multipart/form-data; boundary={boundary}"),
                "/api/v2/seedance-web/bridge/api/files/upload",
                body,
            )

            saved_path = os.path.join(output_dir, os.path.basename(captured["localPath"]))
            self.assertTrue(response["data"]["success"])
            self.assertTrue(captured["localPath"].startswith("output/seedance_web/"))
            self.assertTrue(os.path.isfile(saved_path))
            with open(saved_path, "rb") as saved_file:
                self.assertEqual(saved_file.read(), b"video-bytes")

    def test_unknown_route_returns_none(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        self.assertIsNone(service.handle_get(object(), "/api/v2/dreamina/status"))
        self.assertIsNone(service.handle_post(object(), "/api/v2/dreamina/login", b"{}"))


if __name__ == "__main__":
    unittest.main()
