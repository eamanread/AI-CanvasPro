import unittest

from services.subscription_client import SubscriptionRemoteClient


class _StubHandler:
    def __init__(self, *, headers=None, path="/api/v2/proxy/image"):
        self.headers = dict(headers or {})
        self.path = path


class SubscriptionRemoteClientTests(unittest.TestCase):
    def _build_client(self, *, resolver=None):
        return SubscriptionRemoteClient(
            api_base_url="",
            timeout_seconds=5,
            status_active="active",
            err_required="SUBSCRIPTION_REQUIRED",
            required_message="需要订阅",
            contact_text="联系管理员",
            contact_url="",
            local_install_id_resolver=resolver,
        )

    def test_extract_install_id_falls_back_to_local_resolver_when_request_missing(self):
        client = self._build_client(resolver=lambda: "aic-local-fallback")
        handler = _StubHandler(headers={}, path="/api/v2/proxy/image")

        install_id = client.extract_install_id_from_request(handler, payload={})

        self.assertEqual(install_id, "aic-local-fallback")

    def test_extract_install_id_prefers_request_header_over_local_resolver(self):
        client = self._build_client(resolver=lambda: "aic-local-fallback")
        handler = _StubHandler(headers={"X-AIC-Install-Id": "aic-header"})

        install_id = client.extract_install_id_from_request(handler, payload={})

        self.assertEqual(install_id, "aic-header")


if __name__ == "__main__":
    unittest.main()
