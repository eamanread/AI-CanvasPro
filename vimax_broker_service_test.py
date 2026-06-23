"""Tests for the ViMax render broker (P2-M9 / F4): ticket sign,
Bearer-ticket verification, lock-in cap billing, 200+failed reject
semantics, and concurrent cap safety. Injected grsai_draw_fn - no real
spend."""
import json
import os
import tempfile
import threading
import unittest

from services.vimax_broker_service import VimaxBroker


def make_broker(home, draw_fn=None, clock=None):
    calls = []

    def default_draw(payload, api_key, base_url):
        calls.append(payload)
        return "https://file.example.com/" + str(len(calls)) + ".png"

    broker = VimaxBroker(
        user_dir_getter=lambda: home,
        credentials_getter=lambda: {"apiKey": "k", "baseUrl": "https://grsai/v1"},
        grsai_draw_fn=draw_fn or default_draw,
        clock=clock or (lambda: 1000.0),
    )
    broker._test_calls = calls
    return broker


class SignTest(unittest.TestCase):
    def test_sign_mints_and_persists_ticket(self):
        home = tempfile.mkdtemp()
        b = make_broker(home)
        out = b.sign({"flowId": "f1", "shotIdxs": [0, 1], "capTotal": 5.0, "retryBudget": 0, "ttlSeconds": 3600})
        self.assertTrue(out["success"])
        tid = out["ticketId"]
        self.assertTrue(tid)
        self.assertEqual(out["capTotal"], 5.0)
        self.assertEqual(out["expiresAt"], 1000.0 + 3600)
        # persisted
        path = os.path.join(home, "vimax_tickets", tid + ".json")
        self.assertTrue(os.path.isfile(path))

    def test_sign_requires_flow_and_cap(self):
        b = make_broker(tempfile.mkdtemp())
        self.assertFalse(b.sign({"capTotal": 5})["success"])  # no flowId
        self.assertFalse(b.sign({"flowId": "f", "capTotal": 0})["success"])  # cap must be > 0


class DrawTest(unittest.TestCase):
    def _signed(self, home, cap=5.0):
        b = make_broker(home)
        tid = b.sign({"flowId": "f1", "shotIdxs": [0, 1, 2], "capTotal": cap, "retryBudget": 0})["ticketId"]
        return b, tid

    def test_draw_succeeds_and_bills(self):
        home = tempfile.mkdtemp()
        b, tid = self._signed(home, cap=5.0)
        out = b.draw(f"Bearer {tid}", {"model": "nano-banana-2", "prompt": "x", "cost": 1.0})
        self.assertEqual(out["status"], "succeeded")
        self.assertTrue(out["results"][0]["url"])
        ledger = b._read_ledger()
        self.assertEqual(ledger[tid]["spent"], 1.0)
        self.assertEqual(ledger[tid]["draws"], 1)

    def test_draw_rejects_when_cap_exceeded_with_failed_status(self):
        home = tempfile.mkdtemp()
        b, tid = self._signed(home, cap=2.0)
        b.draw(f"Bearer {tid}", {"prompt": "a", "cost": 1.0})
        b.draw(f"Bearer {tid}", {"prompt": "b", "cost": 1.0})
        out = b.draw(f"Bearer {tid}", {"prompt": "c", "cost": 1.0})  # would be 3 > 2
        self.assertEqual(out["status"], "failed", "cap exceeded -> 200 + failed (not HTTP 4xx)")
        self.assertIn("HY_TICKET_CAP_EXCEEDED", out["failure_reason"])
        self.assertEqual(len(b._test_calls), 2, "no grsai call once over cap")

    def test_draw_unknown_ticket_fails_closed(self):
        home = tempfile.mkdtemp()
        b = make_broker(home)
        out = b.draw("Bearer nope", {"prompt": "x"})
        self.assertEqual(out["status"], "failed")
        self.assertIn("HY_TICKET_INVALID", out["failure_reason"])

    def test_draw_expired_ticket_fails(self):
        home = tempfile.mkdtemp()
        b = make_broker(home, clock=lambda: 1000.0)
        tid = b.sign({"flowId": "f", "capTotal": 5, "ttlSeconds": 10})["ticketId"]
        b._clock = lambda: 2000.0  # past expiry
        out = b.draw(f"Bearer {tid}", {"prompt": "x"})
        self.assertEqual(out["status"], "failed")
        self.assertIn("HY_TICKET_INVALID", out["failure_reason"])

    def test_grsai_failure_refunds_the_reservation(self):
        home = tempfile.mkdtemp()

        def boom(payload, api_key, base_url):
            raise RuntimeError("grsai down")

        b = make_broker(home, draw_fn=boom)
        tid = b.sign({"flowId": "f", "capTotal": 5})["ticketId"]
        out = b.draw(f"Bearer {tid}", {"prompt": "x", "cost": 1.0})
        self.assertEqual(out["status"], "failed")
        self.assertNotIn("HY_TICKET", out.get("failure_reason", ""), "upstream failure, not a ticket failure")
        ledger = b._read_ledger()
        self.assertEqual((ledger.get(tid) or {}).get("spent", 0), 0, "failed draw refunds - not billed")

    def test_concurrent_draws_do_not_overshoot_cap(self):
        home = tempfile.mkdtemp()
        # slow draw so threads overlap; cap=5, 10 threads each cost 1 -> only 5 may pass
        evt = threading.Event()

        def slow(payload, api_key, base_url):
            evt.wait(0.05)
            return "u"

        b = make_broker(home, draw_fn=slow)
        tid = b.sign({"flowId": "f", "capTotal": 5.0})["ticketId"]
        results = []
        lock = threading.Lock()

        def worker():
            r = b.draw(f"Bearer {tid}", {"prompt": "x", "cost": 1.0})
            with lock:
                results.append(r["status"])

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        evt.set()
        for t in threads:
            t.join()
        ok = results.count("succeeded")
        self.assertLessEqual(ok, 5, "cap never overshot under concurrency")
        self.assertEqual(b._read_ledger()[tid]["spent"], float(ok))


if __name__ == "__main__":
    unittest.main()
