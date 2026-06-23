import json
import os
import shlex
import subprocess
import threading
import time
import uuid


class DirectorBridgeService:
    """Thin bridge to the node director plan runner (L3 compile layer).

    Mirrors the PI bridge process model: one short-lived node process per
    request, JSON over stdin/stdout, fail-closed error envelopes. The runner
    reads QMAI memory and artifacts read-only; the only writes are into the
    designated cross-plane drop box ``director/inbox`` (intents from the ear
    downlink, canvas dailies from the eye uplink). QMAI curated data is never
    touched.

    ``refresh`` optionally wakes the headless QMAI brain (an out-of-band
    command configured via ``HY_QMAI_HEADLESS_CMD``, typically a vite-node
    script inside the QMAI repo) so new director judgment can be produced
    without opening the desktop app.
    """

    def __init__(
        self,
        runner_path=None,
        node_path=None,
        timeout_seconds=60,
        command_runner=None,
        refresh_command=None,
        refresh_cwd=None,
        refresh_timeout_seconds=None,
        process_spawner=None,
    ):
        self._runner_path = runner_path or os.path.join("tools", "director_plan_runner.mjs")
        self._node_path = node_path or "node"
        self._timeout_seconds = max(5, int(timeout_seconds or 60))
        self._command_runner = command_runner or subprocess.run
        self._refresh_command = refresh_command or os.environ.get("HY_QMAI_HEADLESS_CMD", "")
        self._refresh_cwd = refresh_cwd or os.environ.get("HY_QMAI_REPO_DIR") or None
        self._refresh_timeout_seconds = max(
            30, int(refresh_timeout_seconds or os.environ.get("HY_QMAI_HEADLESS_TIMEOUT", 0) or 300)
        )
        # Knowledge projection cache: one node subprocess per chat
        # message would be too slow, so the projection is cached and
        # invalidated by the envelope file mtime when the project path
        # is a .json envelope; directory paths fall back to a pure TTL
        # (Windows directory mtime does not track nested file edits).
        self._knowledge_cache = None
        self._knowledge_cache_ttl_seconds = 60
        # Background refresh jobs. The HTTP server is a
        # ThreadingTCPServer (one thread per request), so the job table
        # is shared mutable state: every read AND the check-then-create
        # in refresh() sit inside the lock (smart_clip precedent).
        # refresh has its own injection point - command_runner keeps
        # serving plan() with subprocess.run semantics.
        self._process_spawner = process_spawner or subprocess.Popen
        self._refresh_jobs = {}
        self._refresh_lock = threading.Lock()

    def plan(self, payload=None):
        body = json.dumps(payload or {}, ensure_ascii=False)
        try:
            completed = self._command_runner(
                [self._node_path, self._runner_path],
                input=body,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self._timeout_seconds,
            )
        except Exception as error:  # noqa: BLE001 - fail closed with the reason
            return {"success": False, "error": f"director runner failed: {error}"}

        stdout = getattr(completed, "stdout", "") or ""
        try:
            parsed = json.loads(stdout)
        except (TypeError, ValueError):
            stderr = (getattr(completed, "stderr", "") or "")[:300]
            return {"success": False, "error": f"director runner returned invalid JSON{f' ({stderr})' if stderr else ''}"}
        if not isinstance(parsed, dict):
            return {"success": False, "error": "director runner returned a non-object payload"}
        return parsed

    def _knowledge_cache_key(self):
        project_path = (os.environ.get("HY_QMAI_PROJECT_DIR") or "").strip()
        if not project_path:
            return ("", None)
        candidates = [project_path] if project_path.lower().endswith(".json") else [
            os.path.join(project_path, "qmai-director-export.json"),
        ]
        for candidate in candidates:
            try:
                return (project_path, os.stat(candidate).st_mtime)
            except OSError:
                continue
        return (project_path, None)

    def knowledge(self):
        key = self._knowledge_cache_key()
        now = time.time()
        cached = self._knowledge_cache
        if cached is not None and cached["key"] == key:
            mtime_valid = key[1] is not None
            if mtime_valid or (now - cached["at"]) < self._knowledge_cache_ttl_seconds:
                return cached["value"]
        value = self.plan({"mode": "knowledge"})
        if isinstance(value, dict):
            value = dict(value)
            value["cachedAt"] = now
        self._knowledge_cache = {"key": key, "at": now, "value": value}
        return value

    def refresh(self, payload=None):
        """Starts (or joins) the background headless-brain job.

        Returns immediately with {success, jobId, status} - the real
        thinking takes minutes (300s budget); poll refresh_status().
        Only one job runs at a time: a repeated POST joins the running
        job instead of double-spending LLM calls.
        """
        command = (self._refresh_command or "").strip()
        if not command:
            return {"success": False, "error": "director refresh is not configured (HY_QMAI_HEADLESS_CMD)"}
        body = json.dumps(payload or {}, ensure_ascii=False)
        with self._refresh_lock:
            for job_id, job in self._refresh_jobs.items():
                if job["status"] == "running":
                    return {"success": True, "jobId": job_id, "status": "running", "alreadyRunning": True}
            job_id = f"refresh-{uuid.uuid4().hex[:12]}"
            self._refresh_jobs[job_id] = {
                "status": "running",
                "startedAt": time.time(),
                "progress": [],
                "result": None,
                "error": "",
            }
        try:
            process = self._process_spawner(
                shlex.split(command, posix=False),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                cwd=self._refresh_cwd,
            )
        except Exception as error:  # noqa: BLE001 - fail closed with the reason
            with self._refresh_lock:
                self._refresh_jobs[job_id]["status"] = "failed"
                self._refresh_jobs[job_id]["error"] = f"director refresh failed: {error}"
            return {"success": False, "jobId": job_id, "error": f"director refresh failed: {error}"}
        threading.Thread(target=self._run_refresh_job, args=(job_id, process, body), daemon=True).start()
        return {"success": True, "jobId": job_id, "status": "running"}

    def _run_refresh_job(self, job_id, process, body):
        # The headless script only waits ~1.5s for stdin - write and
        # close immediately.
        try:
            if process.stdin:
                process.stdin.write(body)
                process.stdin.close()
        except Exception:  # noqa: BLE001 - stdin refusal must not kill the job
            pass

        # Drain BOTH pipes concurrently: reading only one deadlocks
        # when the other fills its buffer (vite-node writes banner
        # noise to stdout). stderr carries ndjson progress lines from
        # the headless onProgress hook; non-JSON lines are tool noise.
        stdout_lines = []

        def drain_stdout():
            try:
                for line in process.stdout or []:
                    stdout_lines.append(line)
            except Exception:  # noqa: BLE001
                pass

        def drain_stderr():
            try:
                for line in process.stderr or []:
                    text_line = (line or "").strip()
                    if not text_line:
                        continue
                    try:
                        parsed_line = json.loads(text_line)
                    except ValueError:
                        continue
                    if isinstance(parsed_line, dict):
                        with self._refresh_lock:
                            job = self._refresh_jobs.get(job_id)
                            if job is not None:
                                job["progress"].append(parsed_line)
            except Exception:  # noqa: BLE001
                pass

        out_thread = threading.Thread(target=drain_stdout, daemon=True)
        err_thread = threading.Thread(target=drain_stderr, daemon=True)
        out_thread.start()
        err_thread.start()

        try:
            # Popen has no built-in run()-style timeout; wait() is the
            # watchdog, kill on expiry (300s budget preserved).
            process.wait(timeout=self._refresh_timeout_seconds)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except Exception:  # noqa: BLE001
                pass
            with self._refresh_lock:
                job = self._refresh_jobs.get(job_id)
                if job is not None:
                    job["status"] = "failed"
                    job["error"] = f"director refresh timed out after {self._refresh_timeout_seconds}s"
            return
        out_thread.join(timeout=5)
        err_thread.join(timeout=5)

        stdout = "".join(stdout_lines)
        try:
            parsed = json.loads(stdout.strip().splitlines()[-1]) if stdout.strip() else None
        except (TypeError, ValueError):
            parsed = None
        with self._refresh_lock:
            job = self._refresh_jobs.get(job_id)
            if job is None:
                return
            if isinstance(parsed, dict):
                succeeded = parsed.get("success", False) is True
                job["status"] = "done" if succeeded else "failed"
                job["result"] = parsed
                if not succeeded:
                    job["error"] = str(parsed.get("error", "refresh failed"))
            else:
                job["status"] = "failed"
                job["error"] = "director refresh returned invalid JSON"
            # Fresh judgment invalidates the knowledge projection cache.
            self._knowledge_cache = None

    def refresh_status(self, job_id):
        with self._refresh_lock:
            job = self._refresh_jobs.get(str(job_id or ""))
            if job is None:
                # Jobs live in process memory: after a server restart
                # the id is gone - the client treats this as failed.
                return {"success": False, "status": "not-found", "error": "refresh job not found"}
            payload = {
                "success": True,
                "jobId": str(job_id),
                "status": job["status"],
                "startedAt": job["startedAt"],
                "progress": list(job["progress"][-10:]),
            }
            if job["result"]:
                payload["result"] = job["result"]
            if job["error"]:
                payload["error"] = job["error"]
            return payload
