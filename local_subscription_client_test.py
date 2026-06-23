import json
import os
import tempfile
import unittest

from services.local_subscription_client import LocalSubscriptionClient


class LocalSubscriptionClientTests(unittest.TestCase):
    def _build_client(self, *, state_dir, mac_reader, now=1770000000, tiered_cdkeys=None):
        if tiered_cdkeys is None:
            tiered_cdkeys = [
                {"code": "wkfh0701", "duration_seconds": 7 * 24 * 60 * 60},
                {"code": "mofh3001", "duration_seconds": 30 * 24 * 60 * 60},
                {"code": "byfh1801", "duration_seconds": 180 * 24 * 60 * 60},
            ]
        return LocalSubscriptionClient(
            state_dir=state_dir,
            fixed_cdkey="ycfh5566",
            one_time_cdkey="fcyh0012",
            tiered_cdkeys=tiered_cdkeys,
            status_active="active",
            err_required="SUBSCRIPTION_REQUIRED",
            required_message="需要订阅",
            contact_text="联系管理员",
            contact_url="",
            invalid_cdkey_error_code="INVALID_CDKEY",
            cdkey_already_used_error_code="CDKEY_ALREADY_USED",
            time_provider=lambda: now,
            mac_reader=mac_reader,
        )

    def test_activate_admin_cdkey_binds_current_mac_and_persists_license(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "aa-bb-cc-dd-ee-ff",
            )

            payload = client.activate_cdkey("aic-test", "ycfh5566")

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

    def test_activate_cdkey_sets_seven_day_expiry_and_status_returns_it(self):
        now = 1770000000
        seven_days_seconds = 7 * 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )

            activated = client.activate_cdkey("aic-test", "ycfh5566")
            status = client.fetch_subscription_status("aic-test")

            self.assertEqual(activated["expiresAt"], now + seven_days_seconds)
            self.assertEqual(status["expiresAt"], now + seven_days_seconds)

            with open(os.path.join(temp_dir, "license.json"), "r", encoding="utf-8") as f:
                stored = json.load(f)
            self.assertEqual(stored["expiresAt"], now + seven_days_seconds)

    def test_reusing_admin_cdkey_extends_from_current_expiry(self):
        now = 1770000000
        seven_days_seconds = 7 * 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            first_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            first_client.activate_cdkey("aic-test", "ycfh5566")

            second_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 100,
            )
            payload = second_client.activate_cdkey("aic-test", "ycfh5566")

            self.assertTrue(payload["success"])
            self.assertEqual(payload["expiresAt"], now + seven_days_seconds * 2)

    def test_reusing_one_time_cdkey_is_rejected_without_extending_license(self):
        now = 1770000000
        seven_days_seconds = 7 * 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            first_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            first = first_client.activate_cdkey("aic-test", "fcyh0012")

            second_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 100,
            )
            second = second_client.activate_cdkey("aic-test", "fcyh0012")

            self.assertTrue(first["success"])
            self.assertEqual(first["activationSource"], "cdkey")
            self.assertEqual(first["expiresAt"], now + seven_days_seconds)
            self.assertFalse(second["success"])
            self.assertEqual(second["errorCode"], "CDKEY_ALREADY_USED")

            status = second_client.fetch_subscription_status("aic-test")
            self.assertTrue(status["success"])
            self.assertEqual(status["expiresAt"], now + seven_days_seconds)

    def test_blank_cdkey_grants_first_use_trial_once_per_machine(self):
        now = 1770000000
        seven_days_seconds = 7 * 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )

            first = client.activate_cdkey("aic-test", "")
            second = client.activate_cdkey("aic-test", "")

            self.assertTrue(first["success"])
            self.assertEqual(first["activationSource"], "trial")
            self.assertEqual(first["expiresAt"], now + seven_days_seconds)
            self.assertFalse(second["success"])
            self.assertEqual(second["errorCode"], "LOCAL_TRIAL_ALREADY_USED")

    def test_fetch_subscription_status_marks_license_expired_after_seven_days(self):
        now = 1770000000
        with tempfile.TemporaryDirectory() as temp_dir:
            activator = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            activator.activate_cdkey("aic-test", "ycfh5566")

            expired_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 7 * 24 * 60 * 60 + 1,
            )

            payload = expired_client.fetch_subscription_status("aic-test")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["status"], "expired")
            self.assertEqual(payload["expiresAt"], now + 7 * 24 * 60 * 60)

    def test_fetch_subscription_status_blocks_when_system_clock_moves_back(self):
        now = 1770000000
        with tempfile.TemporaryDirectory() as temp_dir:
            activator = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            activator.activate_cdkey("aic-test", "ycfh5566")

            later_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 600,
            )
            self.assertTrue(later_client.fetch_subscription_status("aic-test")["success"])

            rollback_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 300,
            )
            payload = rollback_client.fetch_subscription_status("aic-test")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["errorCode"], "LOCAL_CLOCK_ROLLBACK_DETECTED")
            self.assertEqual(payload["status"], "none")

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
            activator.activate_cdkey("aic-one", "ycfh5566")

            copied_machine_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "11:22:33:44:55:66",
            )

            payload = copied_machine_client.fetch_subscription_status("aic-two")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["status"], "none")
            self.assertEqual(payload["errorCode"], "SUBSCRIPTION_REQUIRED")

    def test_fetch_subscription_status_allows_bound_mac_when_adapter_order_changes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            activator = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: ["AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"],
            )
            activator.activate_cdkey("aic-one", "ycfh5566")

            restarted_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: ["11:22:33:44:55:66", "AA:BB:CC:DD:EE:FF"],
            )

            payload = restarted_client.fetch_subscription_status("aic-two")

            self.assertTrue(payload["success"])
            self.assertEqual(payload["status"], "active")
            self.assertEqual(payload["boundMac"], "AA:BB:CC:DD:EE:FF")

    def test_read_last_install_id_returns_persisted_license_install_id(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )
            client.activate_cdkey("aic-persisted", "ycfh5566")

            self.assertEqual(client.read_last_install_id(), "aic-persisted")

    def test_evaluate_install_active_returns_allowed_when_mac_matches(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )
            client.activate_cdkey("aic-test", "ycfh5566")

            decision = client.evaluate_install_active("aic-test")

            self.assertTrue(decision["allowed"])
            self.assertEqual(decision["status"], "active")
            self.assertEqual(decision["activationSource"], "cdkey")
            self.assertTrue(client.is_install_entitled_for_model("aic-test", "runninghub/123"))

    def test_tiered_cdkeys_apply_their_own_duration(self):
        now = 1770000000
        day = 24 * 60 * 60
        cases = [
            ("wkfh0701", 7 * day),
            ("mofh3001", 30 * day),
            ("byfh1801", 180 * day),
        ]
        for code, expected_duration in cases:
            with self.subTest(code=code):
                with tempfile.TemporaryDirectory() as temp_dir:
                    client = self._build_client(
                        state_dir=temp_dir,
                        mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                        now=now,
                    )

                    activated = client.activate_cdkey("aic-test", code)
                    status = client.fetch_subscription_status("aic-test")

                    self.assertTrue(activated["success"])
                    self.assertEqual(activated["activationSource"], "cdkey")
                    self.assertEqual(activated["expiresAt"], now + expected_duration)
                    self.assertEqual(status["expiresAt"], now + expected_duration)

    def test_reusing_tiered_cdkey_is_rejected_without_extending_license(self):
        now = 1770000000
        thirty_days_seconds = 30 * 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            first_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            first = first_client.activate_cdkey("aic-test", "mofh3001")

            second_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 100,
            )
            second = second_client.activate_cdkey("aic-test", "mofh3001")

            self.assertTrue(first["success"])
            self.assertEqual(first["expiresAt"], now + thirty_days_seconds)
            self.assertFalse(second["success"])
            self.assertEqual(second["errorCode"], "CDKEY_ALREADY_USED")

            status = second_client.fetch_subscription_status("aic-test")
            self.assertTrue(status["success"])
            self.assertEqual(status["expiresAt"], now + thirty_days_seconds)

    def test_stacking_different_tiered_cdkeys_extends_from_current_expiry(self):
        now = 1770000000
        day = 24 * 60 * 60
        with tempfile.TemporaryDirectory() as temp_dir:
            week_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
            )
            week_client.activate_cdkey("aic-test", "wkfh0701")

            month_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 100,
            )
            stacked = month_client.activate_cdkey("aic-test", "mofh3001")

            self.assertTrue(stacked["success"])
            self.assertEqual(stacked["expiresAt"], now + (7 + 30) * day)

    def test_unknown_tiered_like_code_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
            )

            payload = client.activate_cdkey("aic-test", "wkfh9999")

            self.assertFalse(payload["success"])
            self.assertEqual(payload["errorCode"], "INVALID_CDKEY")
            self.assertFalse(os.path.exists(os.path.join(temp_dir, "license.json")))

    def test_tiered_table_cannot_override_existing_fixed_and_one_time_keys(self):
        now = 1770000000
        seven_days_seconds = 7 * 24 * 60 * 60
        # 即便有人把现有两个密钥错配到分级表，也不得改变它们的语义/有效期
        tiered_with_collisions = [
            {"code": "ycfh5566", "duration_seconds": 999 * 24 * 60 * 60},
            {"code": "fcyh0012", "duration_seconds": 999 * 24 * 60 * 60},
            {"code": "wkfh0701", "duration_seconds": seven_days_seconds},
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            admin_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now,
                tiered_cdkeys=tiered_with_collisions,
            )
            admin = admin_client.activate_cdkey("aic-test", "ycfh5566")
            self.assertEqual(admin["expiresAt"], now + seven_days_seconds)

            # 固定密钥仍可复用累加（语义未变）
            reuse_client = self._build_client(
                state_dir=temp_dir,
                mac_reader=lambda: "AA:BB:CC:DD:EE:FF",
                now=now + 100,
                tiered_cdkeys=tiered_with_collisions,
            )
            reused = reuse_client.activate_cdkey("aic-test", "ycfh5566")
            self.assertTrue(reused["success"])
            self.assertEqual(reused["expiresAt"], now + seven_days_seconds * 2)


if __name__ == "__main__":
    unittest.main()
