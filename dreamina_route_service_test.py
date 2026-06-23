import json
import unittest

from services.dreamina_route_service import DreaminaRouteService


class _StubDreaminaCliService:
    def __init__(self):
        self.start_login_calls = []

    def start_login(self, force=False, mode="headless", region=""):
        self.start_login_calls.append(
            {"force": bool(force), "mode": str(mode or ""), "region": str(region or "")}
        )
        return {"active": True, "phase": "starting", "loginRegion": str(region or "")}

    def submit_text2image(self, data):
        return {"submitId": "img-1", "echo": data}

    def submit_image2image(self, data):
        return {"submitId": "img-2", "echo": data}

    def submit_text2video(self, data):
        return {"submitId": "vid-1", "echo": data}

    def submit_image2video(self, data):
        return {"submitId": "vid-2", "echo": data}

    def submit_frames2video(self, data):
        return {"submitId": "vid-3", "echo": data}

    def submit_multiframe2video(self, data):
        return {"submitId": "vid-4", "echo": data}

    def submit_multimodal2video(self, data):
        return {"submitId": "vid-5", "echo": data}

    def get_status(self, force_refresh=False):
        return {"installed": True, "loggedIn": False}

    def get_login_runtime(self):
        return {"active": True, "phase": "starting"}

    def cancel_login(self):
        return {"active": False, "phase": "cancelled", "message": "cancelled"}


class _StubGateService:
    def __init__(self):
        self.calls = []

    def check_generation_access(
        self,
        handler,
        payload=None,
        required_model_id="",
        provider="",
        node_type="",
    ):
        self.calls.append(
            {
                "payload": dict(payload or {}),
                "required_model_id": required_model_id,
                "provider": provider,
                "node_type": node_type,
            }
        )
        return {"allowed": True}

    def build_subscription_denial_payload(self, decision):
        return {"success": False}


class DreaminaRouteServiceTests(unittest.TestCase):
    def test_image_submit_routes_use_generation_gate(self):
        gate_service = _StubGateService()
        service = DreaminaRouteService(
            cli_service=_StubDreaminaCliService(),
            subscription_gate_service=gate_service,
            video_required_model_id="dreamina/video_vip",
        )

        response = service.handle_post(
            object(),
            "/api/v2/dreamina/text2image",
            json.dumps({"prompt": "test", "installId": "aic-test"}).encode("utf-8"),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(len(gate_service.calls), 1)
        self.assertEqual(gate_service.calls[0]["provider"], "dreamina")
        self.assertEqual(gate_service.calls[0]["node_type"], "image")
        self.assertEqual(gate_service.calls[0]["required_model_id"], "")
        self.assertEqual(gate_service.calls[0]["payload"]["installId"], "aic-test")

    def test_cancel_login_route_uses_cli_cancel_login(self):
        service = DreaminaRouteService(
            cli_service=_StubDreaminaCliService(),
            subscription_gate_service=_StubGateService(),
            video_required_model_id="dreamina/video_vip",
        )

        response = service.handle_post(object(), "/api/v2/dreamina/login/cancel", b"{}")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["runtime"]["phase"], "cancelled")

    def test_web_login_route_passes_selected_region_to_cli_service(self):
        cli_service = _StubDreaminaCliService()
        service = DreaminaRouteService(
            cli_service=cli_service,
            subscription_gate_service=_StubGateService(),
            video_required_model_id="dreamina/video_vip",
        )

        response = service.handle_post(
            object(),
            "/api/v2/dreamina/login/web",
            json.dumps({"force": False, "region": "overseas"}).encode("utf-8"),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(cli_service.start_login_calls[0]["mode"], "web")
        self.assertEqual(cli_service.start_login_calls[0]["region"], "overseas")

    def test_qr_login_image_route_is_removed(self):
        service = DreaminaRouteService(
            cli_service=_StubDreaminaCliService(),
            subscription_gate_service=_StubGateService(),
            video_required_model_id="dreamina/video_vip",
        )

        response = service.handle_get(
            type("Handler", (), {"path": "/api/v2/dreamina/login/qr"})(),
            "/api/v2/dreamina/login/qr",
        )

        self.assertIsNone(response)

    def test_legacy_headless_login_routes_are_removed(self):
        cli_service = _StubDreaminaCliService()
        service = DreaminaRouteService(
            cli_service=cli_service,
            subscription_gate_service=_StubGateService(),
            video_required_model_id="dreamina/video_vip",
        )

        self.assertIsNone(
            service.handle_post(object(), "/api/v2/dreamina/login", b'{"mode":"headless"}')
        )
        self.assertIsNone(
            service.handle_post(object(), "/api/v2/dreamina/relogin", b'{"mode":"headless"}')
        )
        self.assertEqual(cli_service.start_login_calls, [])


if __name__ == "__main__":
    unittest.main()
