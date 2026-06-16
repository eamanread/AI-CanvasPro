"""Tests for the native orchestrator (Phase B1.3). No network/LLM: a fake chat
client is injected via client_factory, so the real brain chain runs with canned
replies in a worker thread. Verifies job lifecycle, step streaming, dedup, and
cooperative cancel."""
import json
import os
import tempfile
import threading
import time
import unittest

from services.vimax_native_orchestrator import NativeOrchestratorService

# Canned replies for one full chain: develop_story, extract_characters,
# write_script, design_storyboard, decompose (1 scene, 1 shot).
REPLIES = [
    "a full story",
    '{"characters":[{"identifier_in_scene":"Alice","is_visible":true,"static_features":"s","dynamic_features":"d"}]}',
    '{"script":["INT. ROOM - DAY"]}',
    '{"storyboard":[{"idx":0,"is_last":true,"cam_idx":0,"visual_desc":"<Alice> waits","audio_desc":"quiet"}]}',
    '{"ff_desc":"Alice mid-frame","ff_vis_char_idxs":[0],"lf_desc":"l","lf_vis_char_idxs":[0],"motion_desc":"m","variation_type":"small","variation_reason":"r"}',
]


class QueueClient:
    def __init__(self, replies):
        self.replies = list(replies)
        self._lock = threading.Lock()

    def chat(self, messages, **kw):
        with self._lock:
            return self.replies.pop(0) if self.replies else "{}"


class GatedClient:
    """First chat() call blocks on `gate` (to hold the worker mid-flight for
    dedup/cancel tests); the rest return canned replies."""
    def __init__(self, replies, gate):
        self.replies = list(replies)
        self.gate = gate
        self.calls = 0
        self._lock = threading.Lock()

    def chat(self, messages, **kw):
        with self._lock:
            self.calls += 1
            n = self.calls
        if n == 1:
            self.gate.wait(5)
        with self._lock:
            return self.replies.pop(0) if self.replies else "{}"


CREDS = {"apiKey": "k", "baseUrl": "http://x", "chatModel": "gemini-3.1-pro"}


def _svc(client, user_dir="."):
    return NativeOrchestratorService(
        user_dir_getter=lambda: user_dir,
        credentials_getter=lambda: CREDS,
        client_factory=lambda: client,
    )


def _wait(svc, job_id, timeout=5):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = svc.job_status(job_id)
        if st["status"] != "running":
            return st
        time.sleep(0.01)
    return svc.job_status(job_id)


def _wait_status(svc, job_id, target, timeout=5):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = svc.job_status(job_id)
        if st["status"] == target or st["status"] not in ("running",):
            return st
        time.sleep(0.01)
    return svc.job_status(job_id)


# --- C2.2 render fixtures (no network/spend) -------------------------------
class _RenderChat:
    """Selector chat: returns an empty-selection prompt (no judge when
    retryBudget==0, so only the selector is asked)."""
    def chat(self, messages, **kw):
        return '{"ref_image_indices": [], "text_prompt": "a shot"}'


class _FakeOut:
    data = "https://b/f.png"

    def save(self, path):
        with open(path, "wb") as h:
            h.write(b"\x89PNG stub")


class _FakeImg:
    def __init__(self):
        self.n = 0

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        self.n += 1
        return _FakeOut()


def _seed_run_dir(user_dir, flow_id):
    run = os.path.join(user_dir, "vimax_runs", flow_id)
    os.makedirs(os.path.join(run, "scene_0", "shots", "0"), exist_ok=True)
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": flow_id,
                "scenes": [{"idx": 0}], "characters": [],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0, "camIdx": 0,
                           "variationType": "small", "ffDesc": "hero enters the hall"}]}
    with open(os.path.join(run, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)
    with open(os.path.join(run, "scene_0", "shots", "0", "shot_description.json"), "w", encoding="utf-8") as h:
        json.dump({"ff_desc": "hero enters the hall", "ff_vis_char_idxs": []}, h)
    with open(os.path.join(run, "scene_0", "characters.json"), "w", encoding="utf-8") as h:
        json.dump([], h)
    with open(os.path.join(run, "scene_0", "character_portraits_registry.json"), "w", encoding="utf-8") as h:
        json.dump({}, h)


def _seed_portraits_run_dir(user_dir, flow_id):
    run = os.path.join(user_dir, "vimax_runs", flow_id)
    os.makedirs(run, exist_ok=True)
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": flow_id, "scenes": [{"idx": 0}],
                "characters": [{"idx": 0, "identifierInScene": "Alice", "isVisible": True,
                                "staticFeatures": "tall", "dynamicFeatures": "red coat"}],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0}]}
    with open(os.path.join(run, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)


def _seed_run_dir_2shot(user_dir, flow_id):
    run = os.path.join(user_dir, "vimax_runs", flow_id)
    for li in (0, 1):
        os.makedirs(os.path.join(run, "scene_0", "shots", str(li)), exist_ok=True)
        with open(os.path.join(run, "scene_0", "shots", str(li), "shot_description.json"), "w", encoding="utf-8") as h:
            json.dump({"ff_desc": f"shot {li} in the hall", "ff_vis_char_idxs": []}, h)
    shotplan = {"schemaVersion": "vimax-shotplan/v1", "flowId": flow_id, "scenes": [{"idx": 0}], "characters": [],
                "shots": [{"idx": 0, "sceneIdx": 0, "localIdx": 0, "ffDesc": "shot 0 in the hall"},
                          {"idx": 1, "sceneIdx": 0, "localIdx": 1, "ffDesc": "shot 1 in the hall"}]}
    with open(os.path.join(run, "shotplan.json"), "w", encoding="utf-8") as h:
        json.dump(shotplan, h)
    with open(os.path.join(run, "scene_0", "characters.json"), "w", encoding="utf-8") as h:
        json.dump([], h)
    with open(os.path.join(run, "scene_0", "character_portraits_registry.json"), "w", encoding="utf-8") as h:
        json.dump({}, h)


class _GatedImg:
    """Blocks the FIRST draw on `gate` (to hold a render/portraits worker mid-
    flight for dedup/cancel tests); subsequent draws return immediately."""
    def __init__(self, gate):
        self.gate = gate
        self.n = 0
        self._lock = threading.Lock()

    def generate_single_image(self, prompt, reference_image_paths=None, **kw):
        with self._lock:
            self.n += 1
            n = self.n
        if n == 1:
            self.gate.wait(5)
        return _FakeOut()


class NativeOrchestratorTest(unittest.TestCase):
    def setUp(self):
        # A completed plan now writes user_dir/vimax_runs/<flowId> (C3), so root
        # every test at a throwaway temp dir - never the repo working tree.
        # ignore_cleanup_errors: workers are daemon threads that may still be
        # flushing working_dir files when a test ends; don't let a cleanup race
        # mask the real assertion (tests that care _wait() for their jobs).
        self._tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.user_dir = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def test_plan_runs_to_done_and_streams_steps(self):
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "f1", "idea": "雨夜告别"})
        self.assertTrue(started["success"])
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", st.get("error"))
        # step events streamed in order
        stages = [e["stage"] for e in st["progress"] if e.get("type") == "step"]
        self.assertEqual(stages, ["story", "characters", "scene"])
        # full payloads present (panel needs them to build nodes)
        scene_evt = [e for e in st["progress"] if e.get("stage") == "scene"][0]
        self.assertEqual(scene_evt["payload"]["sceneIdx"], 0)
        self.assertEqual(len(scene_evt["payload"]["shots"]), 1)
        # final result is a valid shotplan
        self.assertEqual(st["result"]["schemaVersion"], "vimax-shotplan/v1")
        self.assertEqual(len(st["result"]["shots"]), 1)

    def test_missing_flowId_rejected(self):
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        self.assertFalse(svc.plan({"idea": "x"})["success"])

    def test_not_configured_without_credentials(self):
        svc = NativeOrchestratorService(user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: {})
        out = svc.plan({"flowId": "f", "idea": "x"})
        self.assertFalse(out["success"])
        self.assertEqual(out["status"], "not-configured")

    def test_dedup_same_flow_while_running(self):
        gate = threading.Event()
        svc = _svc(GatedClient(REPLIES, gate), self.user_dir)
        a = svc.plan({"flowId": "dup", "idea": "x"})
        # worker is blocked in develop_story (gate not set); 2nd plan same flow
        b = svc.plan({"flowId": "dup", "idea": "x"})
        self.assertTrue(b.get("alreadyRunning"))
        self.assertEqual(a["jobId"], b["jobId"])
        gate.set()
        _wait(svc, a["jobId"])

    def test_cooperative_cancel(self):
        gate = threading.Event()
        svc = _svc(GatedClient(REPLIES, gate), self.user_dir)
        started = svc.plan({"flowId": "c", "idea": "x"})
        svc.cancel(started["jobId"])   # flag set while worker blocked in develop_story
        gate.set()                     # develop_story returns -> _check_cancel raises PlanCancelled
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "cancelled")

    def test_concurrency_cap_returns_busy(self):  # B-review M4
        gate = threading.Event()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: GatedClient(REPLIES, gate), max_concurrent_plans=1)
        a = svc.plan({"flowId": "A", "idea": "x"})       # running (blocked in develop_story)
        b = svc.plan({"flowId": "B", "idea": "x"})       # distinct flow, cap=1 -> busy
        self.assertTrue(a["success"])
        self.assertFalse(b["success"])
        self.assertEqual(b["status"], "busy")
        gate.set()
        _wait(svc, a["jobId"])

    def test_working_dir_materialized_after_plan(self):  # B-review C3
        # A completed native plan must lay down shotplan.json + per-scene
        # characters.json + shots/<localIdx>/shot_description.json under
        # user_dir/vimax_runs/<flowId>, so the still-external 成片/定妆 work.
        with tempfile.TemporaryDirectory() as tmp:
            svc = NativeOrchestratorService(
                user_dir_getter=lambda: tmp, credentials_getter=lambda: CREDS,
                client_factory=lambda: QueueClient(REPLIES))
            started = svc.plan({"flowId": "wd1", "idea": "x"})
            st = _wait(svc, started["jobId"])
            self.assertEqual(st["status"], "done", st.get("error"))
            run_dir = os.path.join(tmp, "vimax_runs", "wd1")
            self.assertTrue(os.path.isfile(os.path.join(run_dir, "shotplan.json")))
            chars_path = os.path.join(run_dir, "scene_0", "characters.json")
            self.assertTrue(os.path.isfile(chars_path))
            with open(chars_path, "r", encoding="utf-8") as h:
                chars = json.load(h)
            self.assertEqual(chars[0]["identifier_in_scene"], "Alice")
            sd_path = os.path.join(run_dir, "scene_0", "shots", "0", "shot_description.json")
            self.assertTrue(os.path.isfile(sd_path))
            with open(sd_path, "r", encoding="utf-8") as h:
                sd = json.load(h)
            self.assertEqual(sd["ff_vis_char_idxs"], [0], "ff_vis_char_idxs preserved for render")

    def test_persist_failure_is_nonfatal_and_surfaced(self):  # B1.3b-review conc#1 + test#3
        # working_dir persist is best-effort: a write failure must NOT hang the
        # job in 'running' nor lose the plan - it goes done with result intact,
        # and the failure is recorded on the job (persistError) + streamed as a
        # warn so a poller knows 成片/定妆 will need a re-plan.
        # Force a real failure: make vimax_runs a FILE so the bridge's makedirs
        # raises (exercises the actual except path, no monkeypatch).
        runs_blocker = os.path.join(self.user_dir, "vimax_runs")
        with open(runs_blocker, "w", encoding="utf-8") as h:
            h.write("not a directory")
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "pf1", "idea": "x"})
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", "persist failure must not hang or fail the job")
        self.assertEqual(st["result"]["schemaVersion"], "vimax-shotplan/v1", "plan not lost")
        self.assertTrue(st.get("persistError"), "persist failure recorded on the job")
        self.assertIn("persist failed", st["persistError"])
        warns = [e for e in st["progress"] if e.get("type") == "warn" and e.get("stage") == "working_dir"]
        self.assertTrue(warns, "persist failure streamed as a warn event")

    def test_plan_rejects_unsafe_flowid(self):  # review#R1 (path traversal)
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        for bad in ["../evil", "a/b", "a\\b", "..", "x/../y", "a b", "a.b"]:
            out = svc.plan({"flowId": bad, "idea": "x"})
            self.assertFalse(out["success"], "must reject: " + bad)
            self.assertIn("flowId", out.get("error", ""))
        # a legitimate panel-generated id still passes
        out = svc.plan({"flowId": "vimax-abc12-x9k2", "idea": "x"})
        self.assertTrue(out["success"])
        _wait(svc, out["jobId"])

    def test_finish_clears_persisterror_when_cancelled(self):  # review#R4
        # a cancel racing a persist failure: persistError got recorded, but the
        # job ends cancelled -> the stale persistError must be cleared so
        # job_status isn't a contradictory "cancelled + persist failed".
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        with svc._lock:
            svc._jobs["jx"] = {
                "flowId": "f", "status": "running", "progress": [], "result": None,
                "error": "", "cancel": True, "startedAt": 0, "finishedAt": None,
                "persistError": "working_dir persist failed: boom",
            }
        svc._finish("jx", "done", result={"schemaVersion": "vimax-shotplan/v1"})
        st = svc.job_status("jx")
        self.assertEqual(st["status"], "cancelled", "cancel-requested job forced to cancelled")
        self.assertIsNone(st["persistError"], "stale persistError cleared on cancel")
        self.assertIsNone(st["result"], "result dropped on cancel")

    def test_plan_pauses_after_characters(self):  # B3b
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        st = _wait_status(svc, started["jobId"], "paused")
        self.assertEqual(st["status"], "paused")
        stages = [e["stage"] for e in st["progress"] if e.get("type") == "step"]
        self.assertEqual(stages, ["story", "characters"], "stops before scene")

    def test_resume_decomposes_with_edited_cast_and_persists(self):  # B3b + M4
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        edited = [{"idx": 0, "identifierInScene": "Alice", "isVisible": True,
                   "staticFeatures": "EDITED", "dynamicFeatures": "d"}]
        out = svc.resume(started["jobId"], edited)
        self.assertTrue(out["success"], out)
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", st.get("error"))
        self.assertEqual(st["result"]["characters"][0]["staticFeatures"], "EDITED")
        run_dir = os.path.join(self.user_dir, "vimax_runs", "p")
        with open(os.path.join(run_dir, "scene_0", "characters.json"), "r", encoding="utf-8") as h:
            self.assertEqual(json.load(h)[0]["static_features"], "EDITED", "working_dir uses edited cast")

    def test_resume_non_paused_errors(self):  # B3b review#7
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        self.assertEqual(svc.resume("nope", [])["status"], "not-found")

    def test_cancel_of_paused_is_terminal(self):  # B3b review#5
        svc = _svc(QueueClient(REPLIES), self.user_dir)
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        svc.cancel(started["jobId"])
        self.assertEqual(svc.job_status(started["jobId"])["status"], "cancelled")
        self.assertEqual(svc.resume(started["jobId"], [])["status"], "not-paused")

    def test_resume_rechecks_concurrency_cap(self):  # B3b review#4 (plan-side cap)
        gate = threading.Event()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: GatedClient(REPLIES, gate), max_concurrent_plans=1)
        a = svc.plan({"flowId": "A", "idea": "x"})          # running (blocked in develop_story)
        p = svc.plan({"flowId": "B", "idea": "x", "steer": True})
        self.assertFalse(p["success"])
        self.assertEqual(p["status"], "busy")
        gate.set()
        _wait(svc, a["jobId"])

    def test_paused_job_reaped_after_paused_ttl(self):  # B3b review#6
        now = [1000.0]
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: QueueClient(REPLIES), paused_ttl_seconds=100, clock=lambda: now[0])
        started = svc.plan({"flowId": "p", "idea": "x", "steer": True})
        _wait_status(svc, started["jobId"], "paused")
        now[0] = 2000.0
        q = svc.plan({"flowId": "q", "idea": "x"})          # plan() reaps the stale paused job
        self.assertEqual(svc.job_status(started["jobId"])["status"], "not-found")
        _wait(svc, q["jobId"])                              # let q finish before teardown

    def test_terminal_jobs_evicted_after_ttl(self):  # B-review M5
        now = [1000.0]
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: QueueClient(REPLIES),
            job_ttl_seconds=100, clock=lambda: now[0])
        a = svc.plan({"flowId": "A", "idea": "x"})
        _wait(svc, a["jobId"])
        self.assertEqual(svc.job_status(a["jobId"])["status"], "done")
        now[0] = 2000.0                                  # advance past TTL
        b = svc.plan({"flowId": "B", "idea": "x"})       # plan() reaps terminal jobs
        self.assertEqual(svc.job_status(a["jobId"])["status"], "not-found", "old done job evicted")
        _wait(svc, b["jobId"])                           # let B finish before teardown

    # --- C2.2 native render ------------------------------------------------
    def test_run_render_streams_and_finishes(self):  # C2.2
        _seed_run_dir(self.user_dir, "f1")
        img = _FakeImg()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: _RenderChat(),
            broker_url_getter=lambda: "http://127.0.0.1:0/api/v2/vimax/draw",
            image_gen_factory=lambda ticket, broker: img)
        started = svc.run_render({"flowId": "f1", "ticketId": "t1"})
        self.assertTrue(started["success"], started)
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", st.get("error"))
        self.assertEqual(st["result"]["schemaVersion"], "vimax-render-result/v1")
        self.assertEqual(len(st["result"]["outputs"]), 1)
        self.assertEqual(img.n, 1)

    def test_run_render_requires_ticket_and_broker(self):  # cost gate
        _seed_run_dir(self.user_dir, "f1")
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: _RenderChat(),
            broker_url_getter=lambda: "",  # no broker url -> cost gate trips
            image_gen_factory=lambda t, b: _FakeImg())
        out = svc.run_render({"flowId": "f1", "ticketId": "t1"})
        self.assertFalse(out["success"])
        self.assertEqual(out["status"], "not-configured")

    # --- C3.2 native portraits ---------------------------------------------
    def test_run_portraits_finishes(self):  # C3.2
        _seed_portraits_run_dir(self.user_dir, "f1")
        img = _FakeImg()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            broker_url_getter=lambda: "http://127.0.0.1:0/api/v2/vimax/draw",
            image_gen_factory=lambda ticket, broker: img)
        started = svc.run_portraits({"flowId": "f1", "ticketId": "t1", "style": "anime"})
        self.assertTrue(started["success"], started)
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "done", st.get("error"))
        self.assertEqual(st["result"]["schemaVersion"], "vimax-portraits-result/v1")
        self.assertEqual(len(st["result"]["characters"]), 1)
        self.assertEqual(img.n, 3)  # front/side/back

    def test_run_portraits_requires_ticket_and_broker(self):  # cost gate
        _seed_portraits_run_dir(self.user_dir, "f1")
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            broker_url_getter=lambda: "",
            image_gen_factory=lambda t, b: _FakeImg())
        out = svc.run_portraits({"flowId": "f1", "ticketId": "t1"})
        self.assertFalse(out["success"])
        self.assertEqual(out["status"], "not-configured")

    # --- review: render/portraits dedup + cooperative cancel (orchestrator level) ---
    def test_run_render_dedup_same_flow_while_running(self):
        _seed_run_dir(self.user_dir, "f1")
        gate = threading.Event()
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: GatedClient(['{"ref_image_indices": [], "text_prompt": "a shot"}'], gate),
            broker_url_getter=lambda: "http://h/api/v2/vimax/draw",
            image_gen_factory=lambda t, b: _FakeImg())
        a = svc.run_render({"flowId": "f1", "ticketId": "t1"})  # worker blocks in the selector
        b = svc.run_render({"flowId": "f1", "ticketId": "t1"})  # same (render, f1)
        self.assertTrue(b.get("alreadyRunning"), b)
        self.assertEqual(a["jobId"], b["jobId"])
        gate.set()
        _wait(svc, a["jobId"])

    def test_run_render_cooperative_cancel(self):
        # 2 shots; gate shot-0's draw, cancel mid-flight, release. The cancel is
        # observed at shot 1's boundary -> shot 1 never draws (cost-stop proof).
        _seed_run_dir_2shot(self.user_dir, "f1")
        gate = threading.Event()
        img = _GatedImg(gate)
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            client_factory=lambda: _RenderChat(),
            broker_url_getter=lambda: "http://h/api/v2/vimax/draw",
            image_gen_factory=lambda t, b: img)
        started = svc.run_render({"flowId": "f1", "ticketId": "t1"})  # retry_budget 0 -> judge off
        t0 = time.time()
        while img.n < 1 and time.time() - t0 < 5:
            time.sleep(0.01)
        svc.cancel(started["jobId"])   # cancel while blocked in shot-0 draw
        gate.set()                     # shot-0 draw completes; loop top sees cancel before shot 1
        st = _wait(svc, started["jobId"])
        self.assertEqual(st["status"], "cancelled")
        self.assertEqual(img.n, 1, "shot 1 never drawn (cancelled at the shot boundary)")

    def test_run_portraits_dedup_same_flow_while_running(self):
        _seed_portraits_run_dir(self.user_dir, "f1")
        gate = threading.Event()
        img = _GatedImg(gate)
        svc = NativeOrchestratorService(
            user_dir_getter=lambda: self.user_dir, credentials_getter=lambda: CREDS,
            broker_url_getter=lambda: "http://h/api/v2/vimax/draw",
            image_gen_factory=lambda t, b: img)
        a = svc.run_portraits({"flowId": "f1", "ticketId": "t1"})  # worker blocks in the front draw
        b = svc.run_portraits({"flowId": "f1", "ticketId": "t1"})  # same (portraits, f1)
        self.assertTrue(b.get("alreadyRunning"), b)
        self.assertEqual(a["jobId"], b["jobId"])
        gate.set()
        _wait(svc, a["jobId"])


if __name__ == "__main__":
    unittest.main()
