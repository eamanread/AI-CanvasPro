"""Tests for the ViMax route service (P1-M5 / F3): query parsing,
jobId-required guards, and delegation to the bridge."""
import json
import unittest

from services.vimax_route_service import VimaxRouteService


class _Handler:
    """Mimics the http.server handler: .path is the ORIGINAL request path
    (with query); the dispatcher passes a query-stripped path separately.
    .headers carries request headers (e.g. Authorization for /draw)."""
    def __init__(self, path, headers=None):
        self.path = path
        self.headers = headers or {}


class FakeBroker:
    def __init__(self):
        self.calls = []

    def sign(self, payload):
        self.calls.append(("sign", payload))
        return {"success": True, "ticketId": "vtk-1", "capTotal": payload.get("capTotal")}

    def draw(self, authorization, payload):
        self.calls.append(("draw", authorization, payload))
        return {"status": "succeeded", "results": [{"url": "u"}]}


class FakeBridge:
    # C5.2: the bridge is now config + 拍法库 skills only (the venv plan/render/
    # portraits methods were retired).
    def __init__(self):
        self.calls = []

    def skills(self):
        self.calls.append(("skills",))
        return {"success": True, "skills": [{"name": "X", "summary": "s", "coverUrl": ""}]}


class VimaxRouteServiceTest(unittest.TestCase):
    def setUp(self):
        self.bridge = FakeBridge()
        self.svc = VimaxRouteService(vimax_bridge_service=self.bridge)

    def test_skills_delegates(self):
        resp = self.svc.handle_get(_Handler("/api/v2/vimax/skills"), "/api/v2/vimax/skills")
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.bridge.calls, [("skills",)])

    def test_external_venv_routes_retired(self):  # C5.2 - venv plan/render/portraits/status/jobs gone
        for path in ("/api/v2/vimax/plan", "/api/v2/vimax/render",
                     "/api/v2/vimax/portraits", "/api/v2/vimax/jobs/cancel"):
            self.assertIsNone(self.svc.handle_post(None, path, b"{}"), path + " should be retired")
        for path in ("/api/v2/vimax/status", "/api/v2/vimax/jobs"):
            self.assertIsNone(self.svc.handle_get(_Handler(path), path), path + " should be retired")

    def test_unmatched_path_returns_none(self):
        self.assertIsNone(self.svc.handle_get(None, "/api/v2/vimax/unknown"))
        self.assertIsNone(self.svc.handle_post(None, "/api/v2/vimax/unknown", b"{}"))


class VimaxBrokerRoutesTest(unittest.TestCase):
    def setUp(self):
        self.broker = FakeBroker()
        self.svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), vimax_broker=self.broker)

    def test_sign_delegates(self):
        resp = self.svc.handle_post(None, "/api/v2/vimax/sign", json.dumps({"flowId": "f", "capTotal": 5}).encode())
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.broker.calls[0][0], "sign")

    def test_draw_passes_bearer_from_handler_headers(self):
        handler = _Handler("/api/v2/vimax/draw", headers={"Authorization": "Bearer vtk-9"})
        resp = self.svc.handle_post(handler, "/api/v2/vimax/draw", json.dumps({"prompt": "x"}).encode())
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.broker.calls[0][0], "draw")
        self.assertEqual(self.broker.calls[0][1], "Bearer vtk-9", "ticket read from Authorization header")

    def test_broker_routes_503_when_broker_missing(self):
        svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), vimax_broker=None)
        resp = svc.handle_post(None, "/api/v2/vimax/sign", b"{}")
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 503)


class FakeNative:
    def __init__(self):
        self.calls = []

    def status(self):
        self.calls.append(("status",))
        return {"success": True, "mode": "native", "configured": True}

    def plan(self, payload):
        self.calls.append(("plan", payload))
        return {"success": True, "jobId": "vimax-native-1", "status": "running"}

    def job_status(self, job_id, progress_since=0):
        self.calls.append(("job_status", job_id, progress_since))
        return {"success": True, "status": "running", "progress": []}

    def cancel(self, job_id):
        self.calls.append(("cancel", job_id))
        return {"success": True, "status": "cancelling"}

    def resume(self, job_id, characters=None):
        self.calls.append(("resume", job_id, characters))
        return {"success": True, "status": "running"}

    def run_render(self, payload):
        self.calls.append(("run_render", payload))
        return {"success": True, "jobId": "vimax-native-r1", "status": "running"}

    def run_portraits(self, payload):
        self.calls.append(("run_portraits", payload))
        return {"success": True, "jobId": "vimax-native-p1", "status": "running"}


class VimaxNativeRoutesTest(unittest.TestCase):
    """Phase B: the /native/* surface delegates to the orchestrator and is
    inert (not 500) when the orchestrator is absent (flag off)."""
    def setUp(self):
        self.native = FakeNative()
        self.svc = VimaxRouteService(
            vimax_bridge_service=FakeBridge(), native_orchestrator=self.native)

    def test_native_status_delegates(self):
        resp = self.svc.handle_get(_Handler("/api/v2/vimax/native/status"), "/api/v2/vimax/native/status")
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls, [("status",)])

    def test_native_plan_delegates_parsed_body(self):
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/plan", json.dumps({"flowId": "f", "idea": "x"}).encode())
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls[0][0], "plan")
        self.assertEqual(self.native.calls[0][1]["flowId"], "f")

    def test_native_jobs_reads_query_from_handler_path(self):
        handler = _Handler("/api/v2/vimax/native/jobs?jobId=nj1&since=3")
        resp = self.svc.handle_get(handler, "/api/v2/vimax/native/jobs")
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls, [("job_status", "nj1", "3")])

    def test_native_jobs_requires_jobid(self):
        resp = self.svc.handle_get(_Handler("/api/v2/vimax/native/jobs"), "/api/v2/vimax/native/jobs")
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 400)
        self.assertEqual(self.native.calls, [])

    def test_native_cancel_delegates(self):
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/jobs/cancel", json.dumps({"jobId": "nj9"}).encode())
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls, [("cancel", "nj9")])

    def test_native_resume_delegates(self):  # B3b
        body = json.dumps({"jobId": "nj", "characters": [{"idx": 0}]}).encode()
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/resume", body)
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls[0][0], "resume")
        self.assertEqual(self.native.calls[0][1], "nj")
        self.assertEqual(self.native.calls[0][2], [{"idx": 0}])

    def test_native_resume_requires_jobid(self):  # B3b
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/resume", b"{}")
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 400)

    def test_native_render_delegates_parsed_body(self):  # C2
        body = json.dumps({"flowId": "f", "ticketId": "t1"}).encode()
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/render", body)
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls[0][0], "run_render")
        self.assertEqual(self.native.calls[0][1]["flowId"], "f")
        self.assertEqual(self.native.calls[0][1]["ticketId"], "t1")

    def test_native_render_503_when_orchestrator_absent(self):  # C2
        svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), native_orchestrator=None)
        resp = svc.handle_post(None, "/api/v2/vimax/native/render", json.dumps({"flowId": "f"}).encode())
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 503)

    def test_native_portraits_delegates_parsed_body(self):  # C3
        body = json.dumps({"flowId": "f", "ticketId": "t1", "style": "anime"}).encode()
        resp = self.svc.handle_post(None, "/api/v2/vimax/native/portraits", body)
        self.assertEqual(resp["kind"], "json_ok")
        self.assertEqual(self.native.calls[0][0], "run_portraits")
        self.assertEqual(self.native.calls[0][1]["flowId"], "f")
        self.assertEqual(self.native.calls[0][1]["style"], "anime")

    def test_native_portraits_503_when_orchestrator_absent(self):  # C3
        svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), native_orchestrator=None)
        resp = svc.handle_post(None, "/api/v2/vimax/native/portraits", json.dumps({"flowId": "f"}).encode())
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 503)

    def test_native_status_reports_unconfigured_when_orchestrator_absent(self):
        svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), native_orchestrator=None)
        resp = svc.handle_get(_Handler("/api/v2/vimax/native/status"), "/api/v2/vimax/native/status")
        self.assertEqual(resp["kind"], "json_ok")
        self.assertFalse(resp["data"]["configured"])

    def test_native_plan_503_when_orchestrator_absent(self):
        svc = VimaxRouteService(vimax_bridge_service=FakeBridge(), native_orchestrator=None)
        resp = svc.handle_post(None, "/api/v2/vimax/native/plan", json.dumps({"flowId": "f"}).encode())
        self.assertEqual(resp["kind"], "json_err")
        self.assertEqual(resp["code"], 503)


if __name__ == "__main__":
    unittest.main()
