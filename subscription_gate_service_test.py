import unittest

from services.subscription_gate_service import SubscriptionGateService


class _StubClient:
    def __init__(self, *, decision):
        self._decision = dict(decision)

    def extract_install_id_from_request(self, handler, payload=None):
        return "aic-test"

    def evaluate_install_active(self, install_id):
        return dict(self._decision)

    def extract_activation_source(self, payload):
        payload = payload or {}
        return str(payload.get("activationSource") or "").strip()

    def extract_generation_scope(self, payload):
        payload = payload or {}
        return str(payload.get("generationScope") or "").strip()

    def extract_entitled_node_types(self, payload):
        payload = payload or {}
        return list(payload.get("entitledNodeTypes") or [])

    def extract_entitled_providers(self, payload):
        payload = payload or {}
        return list(payload.get("entitledProviders") or [])

    def subscription_required_payload(self, reason=None):
        message = "需要订阅"
        if reason:
            message = f"{message}（{reason}）"
        return {
            "success": False,
            "code": "SUBSCRIPTION_REQUIRED",
            "errorCode": "SUBSCRIPTION_REQUIRED",
            "message": message,
            "contactText": "联系管理员",
            "contactUrl": "",
        }


class SubscriptionGateServiceTests(unittest.TestCase):
    def test_generation_gate_allows_active_subscription(self):
        client = _StubClient(
            decision={
                "allowed": True,
                "installId": "aic-test",
                "status": "active",
                "reasonCode": "ACTIVE",
                "reasonMessage": "",
                "activationSource": "cdkey",
                "generationScope": "all",
                "payload": {
                    "activationSource": "cdkey",
                    "generationScope": "all",
                },
            }
        )
        service = SubscriptionGateService(
            client=client,
            enforce_generation_subscription=True,
            require_cdkey_source=False,
        )

        decision = service.check_generation_access(
            handler=object(),
            payload={},
            required_model_id="runninghub/123",
            provider="runninghubwf",
            node_type="video",
        )

        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["requiredModelId"], "runninghub/123")
        self.assertEqual(decision["provider"], "runninghubwf")
        self.assertEqual(decision["nodeType"], "video")

    def test_generation_gate_allows_active_trial_when_cdkey_source_not_required(self):
        client = _StubClient(
            decision={
                "allowed": True,
                "installId": "aic-test",
                "status": "active",
                "reasonCode": "ACTIVE",
                "reasonMessage": "",
                "activationSource": "trial",
                "generationScope": "all",
                "payload": {
                    "activationSource": "trial",
                    "generationScope": "all",
                },
            }
        )
        service = SubscriptionGateService(
            client=client,
            enforce_generation_subscription=True,
            require_cdkey_source=False,
        )

        decision = service.check_generation_access(
            handler=object(),
            payload={},
            provider="grsai",
            node_type="image",
        )

        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["activationSource"], "trial")
        self.assertEqual(decision["generationScope"], "all")

    def test_generation_gate_blocks_non_cdkey_source_when_required(self):
        client = _StubClient(
            decision={
                "allowed": True,
                "installId": "aic-test",
                "status": "active",
                "reasonCode": "ACTIVE",
                "reasonMessage": "",
                "activationSource": "manual",
                "generationScope": "all",
                "payload": {
                    "activationSource": "manual",
                    "generationScope": "all",
                },
            }
        )
        service = SubscriptionGateService(
            client=client,
            enforce_generation_subscription=True,
            require_cdkey_source=True,
        )

        decision = service.check_generation_access(
            handler=object(),
            payload={},
            provider="text",
            node_type="text",
        )

        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reasonCode"], "SUBSCRIPTION_SOURCE_NOT_ALLOWED")
        denial = service.build_subscription_denial_payload(decision)
        self.assertEqual(denial["activationSource"], "manual")
        self.assertEqual(denial["provider"], "text")
        self.assertEqual(denial["nodeType"], "text")
        self.assertEqual(denial["errorCode"], "SUBSCRIPTION_REQUIRED")


if __name__ == "__main__":
    unittest.main()
