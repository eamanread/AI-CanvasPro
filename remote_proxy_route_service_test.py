import json
import unittest

from services.remote_proxy_route_service import RemoteProxyRouteService


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


class _CapturingRemoteProxyRouteService(RemoteProxyRouteService):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.last_remote_payload = None

    def _post_json_to_remote(self, api_url, payload, *, timeout, error_prefix):
        self.last_remote_payload = {
            "api_url": api_url,
            "payload": dict(payload or {}),
            "timeout": timeout,
            "error_prefix": error_prefix,
        }
        return self._json_ok({"success": True})


class RemoteProxyRouteServiceTests(unittest.TestCase):
    def test_runninghub_run_strips_internal_control_fields_before_forward(self):
        gate_service = _StubGateService()
        body = {
            "apiKey": "secret",
            "workflowId": "2041741496667348994",
            "nodeInfoList": [{"nodeId": "1"}],
            "instanceType": "48g",
            "rhInstanceType": "pro",
            "installId": "aic-test",
            "activationSource": "cdkey",
            "generationScope": "all",
            "entitledNodeTypes": ["video"],
            "entitledProviders": ["runninghubwf"],
        }
        service = _CapturingRemoteProxyRouteService(
            read_body=lambda handler: json.dumps(body).encode("utf-8"),
            subscription_gate_service_getter=lambda: gate_service,
            video_vip_workflow_ids={"2041741496667348994"},
        )

        response = service.handle_post(object(), "/api/v2/runninghubwf/run")

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(len(gate_service.calls), 1)
        self.assertEqual(gate_service.calls[0]["payload"]["installId"], "aic-test")
        forwarded = service.last_remote_payload["payload"]
        self.assertEqual(forwarded["instanceType"], "plus")
        self.assertEqual(forwarded["workflowId"], "2041741496667348994")
        self.assertNotIn("installId", forwarded)
        self.assertNotIn("activationSource", forwarded)
        self.assertNotIn("generationScope", forwarded)
        self.assertNotIn("entitledNodeTypes", forwarded)
        self.assertNotIn("entitledProviders", forwarded)
        self.assertNotIn("rhInstanceType", forwarded)


if __name__ == "__main__":
    unittest.main()
