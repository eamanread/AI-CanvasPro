import json
import os
import tempfile
import unittest

from services.local_subscription_client import LocalSubscriptionClient


class LocalSubscriptionClientTests(unittest.TestCase):
    def _build_client(self, *, state_dir, mac_reader, now=1770000000):
        return LocalSubscriptionClient(
            state_dir=state_dir,
            fixed_cdkey="fcyh0012",
            status_active="active",
            err_required="SUBSCRIPTION_REQUIRED",
            required_message="需要订阅",
            contact_text="联系管理员",
            contact_url="",
            invalid_cdkey_error_code="INVALID_CDKEY",
            time_provider=lambda: now,
            mac_reader=mac_reader,
        )

    def test_activate_cdkey_binds_current_mac_and_persists_license(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "aa-bb-cc-dd-ee-ff",
            )

            payload = client.activate_cdkey("aic-test", "fcyh0012")

            self.assertTrue(payload["success"])
            self.assertEqual(payload["status"], "active")
            self.assertEqual(payload["activationSource"], "cdkey")
            self.assertEqual(payload["boundMac"], "AA:BB:CC:DD:EE:FF")

            with open(os.path.join(temp_dir, "license.json"), "r", encoding="utf-8") as f:
                stored = json.load(f)
            self.assertTrue(stored["activated"])
            self.assertEqual(stored["boundMac"], "AA:BB:CC:DD:EE:FF")
            self.assertEqual(stored["lastInstallId"], "aic-test")
            self.assertTrue(str(stored["cdkeyHash"]).startswith("sha256:"))

    def test_activate_cdkey_rejects_wrong_code_without_writing_license(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )

            payload = client.activate_cdkey("aic-test", "wrong-code")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["errorCode"], "INVALID_CDKEY")
            self.assertFalse(os.path.exists(os.path.join(temp_dir, "license.json")))

    def test_fetch_subscription_status_blocks_when_license_is_copied_to_other_machine(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            activator = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )
            activator.activate_cdkey("aic-one", "fcyh0012")

            copied_machine_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "11:22:33:44:55:66",
            )

            payload = copied_machine_client.fetch_subscription_status("aic-two")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["status"], "none")
            self.assertEqual(payload["errorCode"], "SUBSCRIPTION_REQUIRED")

    def test_evaluate_install_active_returns_allowed_when_mac_matches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )
            client.activate_cdkey("aic-test", "fcyh0012")

            decision = client.evaluate_install_active("aic-test")

            self.assertTrue(decision["allowed"])
            self.assertEqual(decision["status"], "active")
            self.assertEqual(decision["activationSource"], "cdkey")
            self.assertTrue(client.is_install_entitled_for_model("aic-test", "runninghub/123"))


if __name__ == "__main__":
    unittest.main()
