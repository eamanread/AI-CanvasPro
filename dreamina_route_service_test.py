import json
import unittest

from services.dreamina_route_service import DreaminaRouteService


class _StubDreaminaCliService:
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


if __name__ == "__main__":
    unittest.main()
