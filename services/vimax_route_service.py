import json
import urllib.parse


class VimaxRouteService:
    """HTTP surface for the ViMax bridge (α′ F3). Thin: parses, delegates
    to VimaxBridgeService, wraps responses. Returns None for unmatched
    paths so the dispatcher can fall through (it has already gated the
    /api/v2/vimax/ prefix against the whitelist)."""

    def __init__(self, *, vimax_bridge_service, vimax_broker=None, native_orchestrator=None):
        self.bridge = vimax_bridge_service
        self.broker = vimax_broker
        # Phase B: in-process native orchestrator (A/B with the external bridge).
        # Separate /native/* surface + own job table, so the two never collide.
        self.native = native_orchestrator

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {"kind": "json_err", "code": int(code), "message": str(message or "")}

    @staticmethod
    def _parse_json_object(body):
        try:
            data = json.loads(body or b"{}")
        except Exception:
            return None, VimaxRouteService._json_err(400, "Invalid JSON")
        if not isinstance(data, dict):
            return None, VimaxRouteService._json_err(400, "Invalid JSON")
        return data, None

    @staticmethod
    def _query(handler, path):
        # server.py strips the query before dispatch (path == self.path
        # .split("?")[0]); the original query lives on handler.path - read
        # it there, mirroring the director/refresh/status precedent.
        raw = getattr(handler, "path", "") or path or ""
        return urllib.parse.parse_qs(urllib.parse.urlsplit(str(raw)).query, keep_blank_values=True)

    def handle_get(self, handler, path):
        base = urllib.parse.urlsplit(str(path or "")).path
        # 拍法库 (skills) reads the skills dir - kept (the external venv plan/
        # render/portraits surface was retired in C5.2; native is the runtime).
        if base == "/api/v2/vimax/skills":
            return self._json_ok(self.bridge.skills())
        # --- native orchestrator (Phase B/C) ---
        if base == "/api/v2/vimax/native/status":
            if self.native is None:
                return self._json_ok({"success": True, "configured": False, "mode": "native"})
            return self._json_ok(self.native.status())
        if base == "/api/v2/vimax/native/jobs":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            query = self._query(handler, path)
            job_id = (query.get("jobId") or [""])[0]
            if not job_id:
                return self._json_err(400, "jobId is required")
            since = (query.get("since") or ["0"])[0]
            return self._json_ok(self.native.job_status(job_id, progress_since=since))
        return None

    def handle_post(self, handler, path, body):
        base = urllib.parse.urlparse(str(path or "")).path
        # The external venv plan/render/portraits/jobs-cancel routes were retired
        # in C5.2 (native is the only runtime). /sign + /draw (broker) + /native/*
        # remain.
        # --- native orchestrator (Phase B/C) ---
        if base == "/api/v2/vimax/native/plan":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._json_ok(self.native.plan(data))
        if base == "/api/v2/vimax/native/jobs/cancel":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            job_id = data.get("jobId") or ""
            if not job_id:
                return self._json_err(400, "jobId is required")
            return self._json_ok(self.native.cancel(job_id))
        if base == "/api/v2/vimax/native/resume":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            job_id = data.get("jobId") or ""
            if not job_id:
                return self._json_err(400, "jobId is required")
            return self._json_ok(self.native.resume(job_id, data.get("characters")))
        if base == "/api/v2/vimax/native/render":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._json_ok(self.native.run_render(data))
        if base == "/api/v2/vimax/native/portraits":
            if self.native is None:
                return self._json_err(503, "native orchestrator unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._json_ok(self.native.run_portraits(data))
        if base == "/api/v2/vimax/sign":
            if self.broker is None:
                return self._json_err(503, "ViMax broker unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._json_ok(self.broker.sign(data))
        if base == "/api/v2/vimax/draw":
            # Called by the runner's grsai adapter; the ticket rides the
            # Authorization: Bearer header. Always 200 (the broker returns
            # a grsai-shaped failed envelope on cap/invalid, never 4xx).
            if self.broker is None:
                return self._json_err(503, "ViMax broker unavailable")
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            auth = ""
            headers = getattr(handler, "headers", None)
            if headers is not None and hasattr(headers, "get"):
                auth = headers.get("Authorization", "") or headers.get("authorization", "") or ""
            return self._json_ok(self.broker.draw(auth, data))
        return None
