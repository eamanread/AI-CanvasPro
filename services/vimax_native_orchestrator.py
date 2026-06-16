"""Native ViMax orchestrator (Phase B1.3) - runs the venv-free brain IN-PROCESS.

Mirrors VimaxBridgeService's async-job shape (jobs dict + lock + poll), but
instead of spawning a subprocess it runs brain.plan_shotplan in a worker
THREAD and streams per-stage `step` events into the job's progress so the panel
can land nodes step-by-step ("思考可见", B). No venv, no Popen, no GBK reconfigure
(it imports shotplan_assembly/brain, the side-effect-free modules - B1.1).

Cancellation is COOPERATIVE (you can't kill a thread): a per-job flag checked at
stage boundaries; an in-flight chat() call drains (bounded by its timeout).

client_factory is injectable so tests drive the chain with a fake chat client -
no network, no real LLM.
"""
import os
import sys
import threading
import time
import uuid

from services.vimax_flow_id import is_safe_flow_id


def _ensure_brain_on_path():
    """integrations/vimax must be on sys.path for `from brain import ...` and the
    brain's own `import shotplan_assembly / skills_index` (B-review C4: the
    server runs from repo root where it isn't). Injected lazily, idempotent."""
    here = os.path.dirname(os.path.abspath(__file__))            # .../services
    repo_root = os.path.dirname(here)
    vimax_dir = os.path.join(repo_root, "integrations", "vimax")
    if vimax_dir not in sys.path:
        # APPEND, not insert(0): integrations/vimax has generic top-level
        # modules (skills_index/keyframe_judge/...) that would shadow same-named
        # server modules if prepended (B-review m1). Append is enough since
        # nothing else in the process defines `brain`/`shotplan_assembly`.
        sys.path.append(vimax_dir)


class NativeOrchestratorService:
    def __init__(self, *, user_dir_getter, credentials_getter,
                 skills_dir_getter=None, client_factory=None,
                 broker_url_getter=None, image_gen_factory=None, max_workers=1,
                 max_concurrent_plans=2, job_ttl_seconds=1800, paused_ttl_seconds=7200,
                 clock=time.time):
        self._user_dir_getter = user_dir_getter
        self._credentials_getter = credentials_getter
        self._skills_dir_getter = skills_dir_getter or (lambda: "")
        self._client_factory = client_factory  # tests inject a fake chat client
        # C2: render routes image calls through the broker. broker_url_getter
        # yields the /api/v2/vimax/draw endpoint; image_gen_factory lets tests
        # inject a fake generator (no network/spend). The cost path is unchanged:
        # ImageGeneratorGrsai(api_key=ticketId, base_url=brokerUrl) -> broker.
        self._broker_url_getter = broker_url_getter or (lambda: "")
        self._image_gen_factory = image_gen_factory
        self._max_workers = max(1, int(max_workers))
        # Global cap across DISTINCT flows (parity with the external bridge's
        # plan_concurrency) - else N flows spawn unbounded worker threads, each
        # fanning out max_workers more (B-review M4).
        self._max_concurrent_plans = max(1, int(max_concurrent_plans))
        self._job_ttl = float(job_ttl_seconds)  # reap terminal jobs (B-review M5)
        # paused is a human-in-the-loop state (steer); reaping it at the terminal
        # TTL could delete a job the user is still reviewing, so give it a
        # separate, longer TTL (B3b-review#6).
        self._paused_ttl = float(paused_ttl_seconds)
        self._clock = clock
        self._jobs = {}
        self._lock = threading.Lock()

    # --- client -------------------------------------------------------------
    def _build_client(self):
        if self._client_factory is not None:
            return self._client_factory()
        creds = self._credentials_getter() or {}
        if not creds.get("apiKey"):
            return None
        _ensure_brain_on_path()
        from brain.chat_client import GrsaiChatClient
        # B5: chat timeout tunable at runtime (grsai conditions vary); default 90.
        try:
            timeout = int(os.environ.get("HY_VIMAX_CHAT_TIMEOUT", "90"))
        except (TypeError, ValueError):
            timeout = 90
        return GrsaiChatClient(
            api_key=creds["apiKey"],
            base_url=creds.get("baseUrl"),
            model=creds.get("chatModel") or "gemini-3.1-pro",
            timeout=timeout,
        )

    def _build_image_gen(self, ticket_id, broker_url):
        """Render's draw client: ImageGeneratorGrsai(api_key=ticketId,
        base_url=brokerUrl) so every draw is billed through the broker
        (cost path unchanged). Tests inject a fake via image_gen_factory."""
        if self._image_gen_factory is not None:
            return self._image_gen_factory(ticket_id, broker_url)
        _ensure_brain_on_path()
        from brain.image_gen import ImageGeneratorGrsai
        return ImageGeneratorGrsai(api_key=ticket_id, base_url=broker_url)

    # --- public API (mirrors the bridge) ------------------------------------
    def plan(self, payload=None):
        payload = dict(payload or {})
        flow_id = str(payload.get("flowId") or "")
        if not flow_id:
            return {"success": False, "error": "flowId is required"}
        if not is_safe_flow_id(flow_id):
            # flowId becomes a path segment (vimax_runs/<flowId>); reject
            # traversal/separators so persist can't escape (B1.3b-review#R1).
            return {"success": False, "error": "invalid flowId (allowed: letters, digits, _ and -)"}
        client = self._build_client()
        if client is None:
            return {"success": False, "status": "not-configured",
                    "error": "grsai credentials not configured (user/config.json)"}
        with self._lock:
            self._reap_locked()
            running = [j for j in self._jobs.values() if j["status"] == "running"]
            existing = self._running_for("plan", flow_id)
            if existing:
                return {"success": True, "jobId": existing, "status": "running", "alreadyRunning": True}
            if len(running) >= self._max_concurrent_plans:
                return {"success": False, "status": "busy",
                        "error": f"native plan concurrency limit reached ({len(running)})"}
            job_id = f"vimax-native-{uuid.uuid4().hex[:12]}"
            self._jobs[job_id] = {
                "flowId": flow_id, "mode": "plan", "status": "running", "progress": [],
                "result": None, "error": "", "cancel": False,
                "startedAt": self._clock(), "finishedAt": None,
                # B3b steer: pause after phase1 (characters) so the user can edit
                # the cast before decomposition. phase1 stashes its result here;
                # resume() runs phase2 from it.
                "steer": bool(payload.get("steer")), "phase1": None, "pausedAt": None,
                # working_dir persist is best-effort; if it fails the streamed
                # warn can be dropped (e.g. cancel set mid-persist suppresses
                # _emit), so record it on the job too - it survives to
                # job_status so a poller knows 成片/定妆 will need a re-plan
                # (B1.3b-review concurrency#1).
                "persistError": None,
            }
        threading.Thread(target=self._run, args=(job_id, payload, client), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}

    def job_status(self, job_id, progress_since=0):
        try:
            since = int(progress_since or 0)
        except (TypeError, ValueError):
            since = 0
        with self._lock:
            j = self._jobs.get(job_id)
            if j is None:
                return {"success": True, "status": "not-found"}
            return {
                "success": True, "status": j["status"],
                "progress": list(j["progress"][since:]),
                "progressTotal": len(j["progress"]),
                "result": j["result"], "error": j["error"],
                "persistError": j.get("persistError"),
            }

    def cancel(self, job_id):
        with self._lock:
            j = self._jobs.get(job_id)
            if j is None:
                return {"success": True, "status": "not-found"}
            j["cancel"] = True
            if j["status"] == "paused":
                # A paused job has NO running worker to observe the cancel flag,
                # so terminalize it directly (B3b-review#5).
                j["status"] = "cancelled"
                j["finishedAt"] = self._clock()
                return {"success": True, "status": "cancelled"}
            return {"success": True, "status": "cancelling"}

    def resume(self, job_id, characters=None):
        """B3b steer: continue a paused job into phase2, decomposing against the
        (edited) cast. Re-checks the concurrency cap before spawning (review#4);
        clear errors for not-found / not-paused / busy (review#7)."""
        client = self._build_client()
        if client is None:
            return {"success": False, "status": "not-configured",
                    "error": "grsai credentials not configured (user/config.json)"}
        with self._lock:
            self._reap_locked()
            j = self._jobs.get(job_id)
            if j is None:
                return {"success": False, "status": "not-found",
                        "error": "job not found (server may have restarted; re-plan)"}
            if j["status"] != "paused":
                return {"success": False, "status": "not-paused",
                        "error": f"job is {j['status']}, not paused"}
            running = sum(1 for x in self._jobs.values() if x["status"] == "running")
            if running >= self._max_concurrent_plans:
                return {"success": False, "status": "busy",
                        "error": f"native plan concurrency limit reached ({running})"}
            p1 = dict(j.get("phase1") or {})
            chars = list(characters) if characters else (p1.get("characters") or [])
            payload = {"flowId": j["flowId"], "idea": ""}  # phase2 only needs flowId
            j["status"] = "running"
        threading.Thread(target=self._run_phase2, args=(job_id, payload, client, p1, chars), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}

    def status(self):
        creds = self._credentials_getter() or {}
        return {"success": True, "mode": "native", "configured": bool(creds.get("apiKey"))}

    def run_render(self, payload=None):
        """Native keyframe render. Reads the working_dir a native/external plan
        already persisted; draws route through the broker (ticketId Bearer ->
        brokerUrl). Mirrors plan()'s job shape; deduped on (render, flowId)."""
        payload = dict(payload or {})
        flow_id = str(payload.get("flowId") or "")
        if not flow_id:
            return {"success": False, "error": "flowId is required"}
        if not is_safe_flow_id(flow_id):
            return {"success": False, "error": "invalid flowId (allowed: letters, digits, _ and -)"}
        ticket_id = str(payload.get("ticketId") or "")
        broker_url = str(self._broker_url_getter() or "")
        if not ticket_id or not broker_url:
            # Cost gate: a draw must be billed through the broker (parity with the
            # external runner's ticketId+brokerUrl requirement).
            return {"success": False, "status": "not-configured",
                    "error": "render requires ticketId + brokerUrl (cost gate)"}
        client = self._build_client()
        if client is None:
            return {"success": False, "status": "not-configured",
                    "error": "grsai credentials not configured (user/config.json)"}
        image_gen = self._build_image_gen(ticket_id, broker_url)
        with self._lock:
            self._reap_locked()
            existing = self._running_for("render", flow_id)
            if existing:
                return {"success": True, "jobId": existing, "status": "running", "alreadyRunning": True}
            running = sum(1 for j in self._jobs.values() if j["status"] == "running")
            if running >= self._max_concurrent_plans:
                return {"success": False, "status": "busy",
                        "error": f"native concurrency limit reached ({running})"}
            job_id = f"vimax-native-{uuid.uuid4().hex[:12]}"
            self._jobs[job_id] = {
                "flowId": flow_id, "mode": "render", "status": "running", "progress": [],
                "result": None, "error": "", "cancel": False,
                "startedAt": self._clock(), "finishedAt": None, "persistError": None,
            }
        threading.Thread(target=self._run_render, args=(job_id, payload, client, image_gen), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}

    def run_portraits(self, payload=None):
        """Native 定妆: draws front/side/back portraits through the broker. Needs
        no chat client (it only draws). Mirrors run_render; deduped on
        (portraits, flowId)."""
        payload = dict(payload or {})
        flow_id = str(payload.get("flowId") or "")
        if not flow_id:
            return {"success": False, "error": "flowId is required"}
        if not is_safe_flow_id(flow_id):
            return {"success": False, "error": "invalid flowId (allowed: letters, digits, _ and -)"}
        ticket_id = str(payload.get("ticketId") or "")
        broker_url = str(self._broker_url_getter() or "")
        if not ticket_id or not broker_url:
            return {"success": False, "status": "not-configured",
                    "error": "portraits requires ticketId + brokerUrl (cost gate)"}
        image_gen = self._build_image_gen(ticket_id, broker_url)
        with self._lock:
            self._reap_locked()
            existing = self._running_for("portraits", flow_id)
            if existing:
                return {"success": True, "jobId": existing, "status": "running", "alreadyRunning": True}
            running = sum(1 for j in self._jobs.values() if j["status"] == "running")
            if running >= self._max_concurrent_plans:
                return {"success": False, "status": "busy",
                        "error": f"native concurrency limit reached ({running})"}
            job_id = f"vimax-native-portraits-{uuid.uuid4().hex[:12]}"
            self._jobs[job_id] = {
                "flowId": flow_id, "mode": "portraits", "status": "running", "progress": [],
                "result": None, "error": "", "cancel": False,
                "startedAt": self._clock(), "finishedAt": None, "persistError": None,
            }
        threading.Thread(target=self._run_portraits, args=(job_id, payload, image_gen), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}

    # --- worker -------------------------------------------------------------
    def _running_for(self, mode, flow_id):
        """First RUNNING job for (mode, flowId), or None. Mode-scoped so a render
        and a plan for the same flow don't dedup each other. Caller holds lock."""
        for jid, j in self._jobs.items():
            if j["status"] == "running" and j.get("mode") == mode and j["flowId"] == flow_id:
                return jid
        return None

    def _is_cancelled(self, job_id):
        with self._lock:
            j = self._jobs.get(job_id)
            return bool(j and j.get("cancel"))

    def _reap_locked(self):
        """Drop terminal jobs older than job_ttl, AND paused jobs older than the
        (longer) paused_ttl (B-review M5 + B3b-review#6). Caller holds lock."""
        now = self._clock()
        drop = []
        for jid, j in self._jobs.items():
            if (j["status"] in ("done", "failed", "cancelled")
                    and j.get("finishedAt") and (now - j["finishedAt"]) > self._job_ttl):
                drop.append(jid)
            elif (j["status"] == "paused"
                    and j.get("pausedAt") and (now - j["pausedAt"]) > self._paused_ttl):
                drop.append(jid)
        for jid in drop:
            del self._jobs[jid]

    def _emit(self, job_id, event):
        with self._lock:
            j = self._jobs.get(job_id)
            # Stop streaming once cancel is requested (B-review M2).
            if j is not None and not j.get("cancel"):
                j["progress"].append(event)

    def _finish(self, job_id, status, *, result=None, error=""):
        with self._lock:
            j = self._jobs.get(job_id)
            if j is None:
                return
            # A cancel-requested job that races to completion records as
            # cancelled, never done/failed (B-review M2). A cancelled job's
            # incomplete working_dir is expected, so drop any persistError too -
            # else job_status shows cancelled + a stale failure msg (review#R4).
            if j.get("cancel") and status != "cancelled":
                status = "cancelled"
                result = None
                error = ""
                j["persistError"] = None
            j["status"] = status
            j["finishedAt"] = self._clock()
            if result is not None:
                j["result"] = result
            if error:
                j["error"] = error

    def _run(self, job_id, payload, client):
        """Phase 1 worker: story + characters (streamed). If steer, pause here
        (stash phase1, status=paused) and wait for resume(); else run phase2
        straight through. on_step fires from THIS thread (no lock needed)."""
        _ensure_brain_on_path()
        from brain import planner
        try:
            def on_step(stage, data):
                self._emit(job_id, {"type": "step", "stage": stage, "payload": data})

            p1 = planner.plan_story_and_characters(
                client,
                idea=payload.get("idea", ""),
                user_requirement=payload.get("userRequirement", ""),
                style=payload.get("style", ""),
                flow_id=payload.get("flowId", ""),
                skill_refs=payload.get("skillRefs") or [],
                skills_dir=self._skills_dir_getter() or "",
                on_step=on_step,
                should_cancel=lambda: self._is_cancelled(job_id),
            )

            if payload.get("steer"):
                with self._lock:
                    j = self._jobs.get(job_id)
                    if j is None:
                        return
                    if j.get("cancel"):
                        j["status"] = "cancelled"
                        j["finishedAt"] = self._clock()
                    else:
                        j["phase1"] = p1
                        j["status"] = "paused"
                        j["pausedAt"] = self._clock()
                return  # wait for resume()

            self._run_phase2(job_id, payload, client, p1, p1.get("characters") or [])
        except planner.PlanCancelled:
            self._finish(job_id, "cancelled")
        except Exception as exc:  # noqa: BLE001 - surface to the poller
            self._finish(job_id, "failed", error=str(exc))

    def _run_phase2(self, job_id, payload, client, p1, characters):
        """Phase 2 worker: write_script + per-scene storyboard/decompose against
        `characters` (the edited cast on the steer path), then persist
        working_dir + finish. `characters` is the single source so the EDITED
        cast reaches decompose AND shotplan.characters (M4)."""
        _ensure_brain_on_path()
        from brain import planner
        # Capture the raw scene payloads so the working_dir bridge can
        # re-materialize the ViMax on-disk layout 成片/定妆 need (B-review C3).
        captured = {"characters": characters or [], "scenes": {}}
        try:
            def on_step(stage, data):
                if stage == "scene":
                    captured["scenes"][int(data.get("sceneIdx") or 0)] = data.get("shots") or []
                self._emit(job_id, {"type": "step", "stage": stage, "payload": data})

            shotplan = planner.plan_from_characters(
                client,
                story=p1.get("story", ""),
                characters=characters or [],
                effective_requirement=p1.get("effective_requirement", ""),
                resolved_refs=p1.get("resolved_refs") or [],
                flow_id=payload.get("flowId", ""),
                on_step=on_step,
                max_workers=self._max_workers,
                should_cancel=lambda: self._is_cancelled(job_id),
            )
            # Lay down the working_dir BEFORE marking done, so a poller that
            # sees done can immediately kick off 成片/定妆 (B-review C3).
            self._persist_working_dir(job_id, payload, shotplan, captured)
            captured = None  # free the duplicated payloads now they're on disk
            self._finish(job_id, "done", result=shotplan)
        except planner.PlanCancelled:
            self._finish(job_id, "cancelled")
        except Exception as exc:  # noqa: BLE001 - surface to the poller
            self._finish(job_id, "failed", error=str(exc))

    def _run_render(self, job_id, payload, client, image_gen):
        """Render worker: drives brain.render_runner.run_render in this thread,
        streaming `step` events and polling the cancel flag at shot boundaries.
        run_render reads/writes the working_dir + result.json itself."""
        _ensure_brain_on_path()
        from brain import render_runner
        flow_id = str(payload.get("flowId") or "")
        working_dir = os.path.join(self._user_dir_getter() or ".", "vimax_runs", flow_id)
        try:
            def on_step(stage, data):
                self._emit(job_id, {"type": "step", "stage": stage, "payload": data})

            result = render_runner.run_render(
                working_dir=working_dir, flow_id=flow_id,
                chat_client=client, image_gen=image_gen,
                shot_idxs=payload.get("shotIdxs"),
                edits=payload.get("edits"),
                invalidate_shot_idxs=payload.get("invalidateShotIdxs"),
                retry_budget=int(payload.get("retryBudget") or 0),
                max_reshoots_per_shot=int(payload.get("maxReshootsPerShot") or 1),
                on_step=on_step,
                should_cancel=lambda: self._is_cancelled(job_id),
            )
            if result.get("cancelled"):
                self._finish(job_id, "cancelled")
            else:
                self._finish(job_id, "done", result=result)
        except Exception as exc:  # noqa: BLE001 - surface to the poller
            self._finish(job_id, "failed", error=str(exc))

    def _run_portraits(self, job_id, payload, image_gen):
        """Portraits worker: drives brain.render_runner.run_portraits in this
        thread, streaming `step` events and polling the cancel flag at character
        boundaries. run_portraits reads/writes the working_dir + result.json."""
        _ensure_brain_on_path()
        from brain import render_runner
        flow_id = str(payload.get("flowId") or "")
        working_dir = os.path.join(self._user_dir_getter() or ".", "vimax_runs", flow_id)
        try:
            def on_step(stage, data):
                self._emit(job_id, {"type": "step", "stage": stage, "payload": data})

            result = render_runner.run_portraits(
                working_dir=working_dir, flow_id=flow_id, image_gen=image_gen,
                style=payload.get("style", ""),
                character_idxs=payload.get("characterIdxs"),
                invalidate_character_idxs=payload.get("invalidateCharacterIdxs"),
                on_step=on_step,
                should_cancel=lambda: self._is_cancelled(job_id),
            )
            if result.get("cancelled"):
                self._finish(job_id, "cancelled")
            else:
                self._finish(job_id, "done", result=result)
        except Exception as exc:  # noqa: BLE001 - surface to the poller
            self._finish(job_id, "failed", error=str(exc))

    def _persist_working_dir(self, job_id, payload, shotplan, captured):
        """Re-materialize the ViMax working_dir files (shotplan.json + per-scene
        characters.json + shots/<localIdx>/shot_description.json) so the still-
        external 成片/定妆 runner modes can consume a native plan (B-review C3).
        Path mirrors the bridge exactly: user_dir/vimax_runs/<flowId>.

        Best-effort: a write failure WARNS but never fails the plan - the canvas
        landing doesn't need these files, and render/portraits fail loudly on
        their own if they're missing (so a re-plan recovers)."""
        flow_id = str(payload.get("flowId") or "")
        if not flow_id:
            return
        working_dir = os.path.join(self._user_dir_getter() or ".", "vimax_runs", flow_id)
        scenes = captured.get("scenes") or {}
        # dense list by sceneIdx (gaps -> empty scene), matching enumerate order
        scene_shots = [scenes.get(i, []) for i in range(max(scenes) + 1)] if scenes else []
        try:
            from working_dir_bridge import persist_native_run
            persist_native_run(working_dir, shotplan, captured.get("characters") or [], scene_shots)
        except Exception as exc:  # noqa: BLE001 - non-fatal, surface to poller
            msg = f"working_dir persist failed (成片/定妆 will need a re-plan): {exc}"
            # Record on the job UNCONDITIONALLY: _emit drops events once cancel
            # is set, so a cancel racing this persist would otherwise lose the
            # only signal that the files are incomplete (B1.3b-review concurrency#1).
            with self._lock:
                j = self._jobs.get(job_id)
                if j is not None:
                    j["persistError"] = msg
            self._emit(job_id, {"type": "warn", "stage": "working_dir", "message": msg})
