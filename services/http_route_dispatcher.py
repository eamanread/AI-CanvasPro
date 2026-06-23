import json
import subprocess
import time
import urllib.parse


class HttpRouteDispatcher:
    _TRUE_VALUES = ("1", "true", "yes", "on")
    _CANVAS_AGENT_CONVERSATIONS_PREFIX = "/api/v2/canvas-agent/conversations"
    _CANVAS_AGENT_EXECUTIONS_PREFIX = "/api/v2/canvas-agent/executions"
    _CANVAS_AGENT_SYNC_PROJECT_PATH = "/api/v2/canvas-agent/sync/project"
    _CANVAS_AGENT_GET_PATHS = frozenset((
        "/api/v2/canvas-agent/status",
        "/api/v2/canvas-agent/metrics",
        "/api/v2/canvas-agent/receipts",
        "/api/v2/canvas-agent/director/knowledge",
        "/api/v2/canvas-agent/director/refresh/status",
        _CANVAS_AGENT_SYNC_PROJECT_PATH,
    ))
    _CANVAS_AGENT_POST_PATHS = frozenset(
        (
            "/api/v2/canvas-agent/chat",
            "/api/v2/canvas-agent/chat/stream",
            "/api/v2/canvas-agent/context/preview",
            "/api/v2/canvas-agent/actions/validate",
            "/api/v2/canvas-agent/director/plan",
            "/api/v2/canvas-agent/director/dailies",
            "/api/v2/canvas-agent/director/refresh",
            _CANVAS_AGENT_SYNC_PROJECT_PATH,
        )
    )
    # ViMax bridge (α′ F3). New prefix - the guard block in handle_get/
    # handle_post 404s anything not listed here BEFORE it reaches the
    # route service (V0 lesson). jobs is a GET with a ?jobId= query, so
    # the path check compares the path component only.
    # The external venv plan/render/portraits/status/jobs routes were retired in
    # C5.2 (native is the only runtime). 拍法库 skills + the broker sign/draw +
    # all /native/* remain.
    _VIMAX_GET_PATHS = frozenset((
        "/api/v2/vimax/skills",
        # native orchestrator (Phase B/C): in-process brain, separate job table
        "/api/v2/vimax/native/status",
        "/api/v2/vimax/native/jobs",
    ))
    _VIMAX_POST_PATHS = frozenset((
        "/api/v2/vimax/sign",
        "/api/v2/vimax/draw",
        # native orchestrator (Phase B/C): plan + resume + render + portraits
        "/api/v2/vimax/native/plan",
        "/api/v2/vimax/native/jobs/cancel",
        "/api/v2/vimax/native/resume",
        "/api/v2/vimax/native/render",
        "/api/v2/vimax/native/portraits",
    ))

    def __init__(
        self,
        *,
        local_version,
        is_dev_build,
        is_advanced_mode,
        subscription_client_getter,
        subscription_gate_service_getter,
        config_route_service_getter,
        json_file_route_service_getter,
        library_file_route_service_getter,
        media_file_route_service_getter,
        local_media_processing_route_service_getter,
        remote_proxy_route_service_getter,
        dreamina_route_service_getter,
        seedance_web_route_service_getter,
        sam3_route_service_getter,
        canvas_agent_route_service_getter=None,
        vimax_route_service_getter=None,
        update_service_getter,
        smart_clip_cleanup,
        smart_clip_jobs,
        smart_clip_lock,
        sub_status_none,
        sub_error_invalid_arguments,
        default_sub_contact_text,
        default_sub_contact_url,
        json_ok,
        json_err,
        send_route_response,
        read_body,
        runtime_paths_getter=None,
        library_status_getter=None,
    ):
        self.local_version = str(local_version or "")
        self._is_dev_build = is_dev_build
        self._is_advanced_mode = is_advanced_mode
        self._get_subscription_client = subscription_client_getter
        self._get_subscription_gate_service = subscription_gate_service_getter
        self._get_config_route_service = config_route_service_getter
        self._get_json_file_route_service = json_file_route_service_getter
        self._get_library_file_route_service = library_file_route_service_getter
        self._get_media_file_route_service = media_file_route_service_getter
        self._get_local_media_processing_route_service = local_media_processing_route_service_getter
        self._get_remote_proxy_route_service = remote_proxy_route_service_getter
        self._get_dreamina_route_service = dreamina_route_service_getter
        self._get_seedance_web_route_service = seedance_web_route_service_getter
        self._get_sam3_route_service = sam3_route_service_getter
        self._get_canvas_agent_route_service = (
            canvas_agent_route_service_getter or (lambda: None)
        )
        self._get_vimax_route_service = vimax_route_service_getter or (lambda: None)
        self._get_update_service = update_service_getter
        self._smart_clip_cleanup = smart_clip_cleanup
        self._smart_clip_jobs = smart_clip_jobs
        self._smart_clip_lock = smart_clip_lock
        self._sub_status_none = str(sub_status_none or "")
        self._sub_error_invalid_arguments = str(sub_error_invalid_arguments or "")
        self._default_sub_contact_text = str(default_sub_contact_text or "")
        self._default_sub_contact_url = str(default_sub_contact_url or "")
        self._json_ok = json_ok
        self._json_err = json_err
        self._send_route_response = send_route_response
        self._read_body = read_body
        self._get_runtime_paths = runtime_paths_getter or (lambda: {})
        self._get_library_status = library_status_getter or (lambda: {})

    @classmethod
    def _parse_query(cls, raw_path, *, max_num_fields):
        parsed = urllib.parse.urlparse(str(raw_path or ""))
        return urllib.parse.parse_qs(
            parsed.query,
            keep_blank_values=True,
            max_num_fields=int(max_num_fields),
        )

    @classmethod
    def _parse_query_flag(cls, query, key, *, default=False):
        raw = (query.get(str(key)) or [None])[0]
        if raw is None:
            return bool(default)
        return str(raw).strip().lower() in cls._TRUE_VALUES

    @classmethod
    def _is_canvas_agent_conversation_path(cls, path):
        value = str(path or "")
        prefix = cls._CANVAS_AGENT_CONVERSATIONS_PREFIX
        return value == prefix or value.startswith(prefix + "/")

    @classmethod
    def _is_canvas_agent_execution_path(cls, path):
        value = str(path or "")
        prefix = cls._CANVAS_AGENT_EXECUTIONS_PREFIX
        return value == prefix or value.startswith(prefix + "/")

    @classmethod
    def _is_canvas_agent_get_path(cls, path):
        return path in cls._CANVAS_AGENT_GET_PATHS or cls._is_canvas_agent_conversation_path(path) or cls._is_canvas_agent_execution_path(path)

    @classmethod
    def _is_canvas_agent_post_path(cls, path):
        return path in cls._CANVAS_AGENT_POST_PATHS or cls._is_canvas_agent_conversation_path(path) or cls._is_canvas_agent_execution_path(path)

    @classmethod
    def _is_canvas_agent_patch_or_delete_path(cls, path):
        return cls._is_canvas_agent_conversation_path(path) or cls._is_canvas_agent_execution_path(path)

    @classmethod
    def _vimax_path_component(cls, path):
        return urllib.parse.urlparse(str(path or "")).path

    @classmethod
    def _is_vimax_get_path(cls, path):
        return cls._vimax_path_component(path) in cls._VIMAX_GET_PATHS

    @classmethod
    def _is_vimax_post_path(cls, path):
        return cls._vimax_path_component(path) in cls._VIMAX_POST_PATHS

    def _subscription_missing_payload(self, *, message):
        return {
            "success": False,
            "status": self._sub_status_none,
            "errorCode": self._sub_error_invalid_arguments,
            "message": str(message or ""),
            "contactText": self._default_sub_contact_text,
            "contactUrl": self._default_sub_contact_url,
        }

    def _subscription_unavailable_payload(self):
        return {
            "success": False,
            "status": self._sub_status_none,
            "errorCode": "SUBSCRIPTION_SERVICE_UNAVAILABLE",
            "message": "授权服务不可用",
            "contactText": self._default_sub_contact_text,
            "contactUrl": self._default_sub_contact_url,
        }

    def _activation_missing_payload(self):
        return {
            "success": False,
            "errorCode": self._sub_error_invalid_arguments,
            "message": "Missing installId or cdkey",
            "contactText": self._default_sub_contact_text,
            "contactUrl": self._default_sub_contact_url,
        }

    def _runtime_info_payload(self):
        runtime_paths = self._get_runtime_paths()
        if not isinstance(runtime_paths, dict):
            runtime_paths = {}
        distribution = str(runtime_paths.get("distribution") or "source")
        return {
            "success": True,
            "isDevBuild": bool(self._is_dev_build()),
            "isAdvancedMode": bool(self._is_advanced_mode()),
            "localVersion": self.local_version,
            "distribution": distribution,
            "isPackaged": distribution in ("onedir", "onefile"),
            "isOnefile": distribution == "onefile",
            "storage": {
                "writableRoot": str(runtime_paths.get("writableRoot") or ""),
                "userDir": str(runtime_paths.get("userDir") or ""),
                "outputDir": str(runtime_paths.get("outputDir") or ""),
                "uploadsDir": str(runtime_paths.get("uploadsDir") or ""),
            },
        }

    def _library_status_payload(self):
        status = self._get_library_status()
        if not isinstance(status, dict):
            return {}
        return status

    def _handle_subscription_status(self, handler):
        client = self._get_subscription_client()
        gate_service = self._get_subscription_gate_service()
        query = self._parse_query(handler.path, max_num_fields=20)
        install_id_qs = (query.get("installId") or [""])[0]
        install_id = client.normalize_install_id(install_id_qs)
        if not install_id:
            install_id = gate_service.extract_install_id_from_request(handler)
        if not install_id:
            self._json_ok(
                handler,
                self._subscription_missing_payload(message="Missing installId"),
            )
            return True
        payload = client.fetch_subscription_status(install_id)
        if isinstance(payload, dict):
            self._json_ok(handler, payload)
        else:
            self._json_ok(handler, self._subscription_unavailable_payload())
        return True

    def _handle_heartbeat_stream(self, handler):
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream")
        handler.send_header("Cache-Control", "no-cache")
        handler.send_header("Connection", "keep-alive")
        handler.end_headers()
        try:
            while True:
                handler.wfile.write(b"data: ping\n\n")
                handler.wfile.flush()
                time.sleep(5)
        except Exception:
            pass
        return True

    def _handle_update_check(self, handler):
        query = self._parse_query(handler.path, max_num_fields=10)
        info = self._get_update_service().check_for_updates(
            force=self._parse_query_flag(query, "force", default=False),
            include_current=self._parse_query_flag(
                query,
                "includeCurrent",
                default=False,
            ),
        )
        if info:
            self._json_ok(handler, info)
        else:
            self._json_ok(
                handler,
                {
                    "hasUpdate": False,
                    "localVersion": self.local_version,
                },
            )
        return True

    def _handle_update_local_preview(self, handler):
        self._json_ok(handler, self._get_update_service().build_local_update_preview())
        return True

    def _handle_smart_clip_status(self, handler):
        query = self._parse_query(handler.path, max_num_fields=10)
        job_id = (query.get("jobId") or [""])[0].strip()
        if not job_id:
            self._json_err(handler, 400, "Missing jobId")
            return True
        self._smart_clip_cleanup()
        with self._smart_clip_lock:
            job = self._smart_clip_jobs.get(job_id)
        if not job:
            self._json_err(handler, 404, "Job not found")
            return True
        self._json_ok(handler, job)
        return True

    def _handle_subscription_activate(self, handler):
        body = self._read_body(handler)
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self._json_err(handler, 400, "Invalid JSON")
            return True
        if not isinstance(data, dict):
            self._json_err(handler, 400, "Invalid JSON")
            return True
        client = self._get_subscription_client()
        gate_service = self._get_subscription_gate_service()
        install_id = gate_service.extract_install_id_from_request(handler, data)
        cdkey = str(data.get("cdkey") or "").strip()
        if not install_id:
            self._json_ok(handler, self._activation_missing_payload())
            return True
        payload = client.activate_cdkey(install_id, cdkey)
        gate_service.clear_generation_access_cache(install_id)
        if isinstance(payload, dict):
            self._json_ok(handler, payload)
        else:
            self._json_ok(handler, self._subscription_unavailable_payload())
        return True

    def _handle_update_apply(self, handler):
        try:
            self._json_ok(handler, self._get_update_service().apply_hot_update())
        except subprocess.TimeoutExpired:
            self._json_err(handler, 504, "git pull 超时，请检查网络")
        except Exception as exc:
            self._json_err(handler, 500, str(exc))
        return True

    def handle_get(self, handler, path):
        if path == "/api/v2/runtime/info":
            self._json_ok(handler, self._runtime_info_payload())
            return True

        if path == "/api/v2/library/status":
            self._json_ok(handler, self._library_status_payload())
            return True

        if path.startswith("/api/v2/canvas-agent/"):
            if not self._is_canvas_agent_get_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_canvas_agent_route_service()
                if route_service is None:
                    self._json_err(handler, 503, "Canvas agent route unavailable")
                    return True
                response = route_service.handle_get(handler, path)
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "Canvas agent route failed")
                return True

        if path.startswith("/api/v2/vimax/"):
            if not self._is_vimax_get_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_vimax_route_service()
                if route_service is None:
                    self._json_err(handler, 503, "ViMax route unavailable")
                    return True
                response = route_service.handle_get(handler, path)
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "ViMax route failed")
                return True

        if path == "/api/v2/subscription/status":
            return self._handle_subscription_status(handler)

        config_get_response = self._get_config_route_service().handle_get(
            handler,
            path,
        )
        if config_get_response is not None:
            self._send_route_response(handler, config_get_response)
            return True

        json_file_get_response = self._get_json_file_route_service().handle_get(
            handler,
            path,
        )
        if json_file_get_response is not None:
            self._send_route_response(handler, json_file_get_response)
            return True

        library_file_get_response = self._get_library_file_route_service().handle_get(
            handler,
            path,
        )
        if library_file_get_response is not None:
            self._send_route_response(handler, library_file_get_response)
            return True

        seedance_web_get_response = self._get_seedance_web_route_service().handle_get(
            handler,
            path,
        )
        if seedance_web_get_response is not None:
            self._send_route_response(handler, seedance_web_get_response)
            return True

        dreamina_get_response = self._get_dreamina_route_service().handle_get(
            handler,
            path,
        )
        if dreamina_get_response is not None:
            self._send_route_response(handler, dreamina_get_response)
            return True

        if path == "/api/v2/heartbeat_stream":
            return self._handle_heartbeat_stream(handler)

        if path == "/api/v2/update/check":
            return self._handle_update_check(handler)

        if path == "/api/v2/update/local-preview":
            return self._handle_update_local_preview(handler)

        if path == "/api/v2/video/smart_clip/status":
            return self._handle_smart_clip_status(handler)

        sam3_get_response = self._get_sam3_route_service().handle_get(handler, path)
        if sam3_get_response is not None:
            self._send_route_response(handler, sam3_get_response)
            return True

        remote_proxy_get_response = self._get_remote_proxy_route_service().handle_get(
            handler,
            path,
        )
        if remote_proxy_get_response is not None:
            self._send_route_response(handler, remote_proxy_get_response)
            return True

        return False

    def handle_post(self, handler, path):
        if path == "/api/v2/subscription/activate":
            return self._handle_subscription_activate(handler)

        if path.startswith("/api/v2/canvas-agent/"):
            if not self._is_canvas_agent_post_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_canvas_agent_route_service()
                if route_service is None:
                    self._json_err(handler, 503, "Canvas agent route unavailable")
                    return True
                response = route_service.handle_post(
                    handler,
                    path,
                    self._read_body(handler),
                )
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "Canvas agent route failed")
                return True

        if path.startswith("/api/v2/vimax/"):
            if not self._is_vimax_post_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_vimax_route_service()
                if route_service is None:
                    self._json_err(handler, 503, "ViMax route unavailable")
                    return True
                response = route_service.handle_post(handler, path, self._read_body(handler))
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "ViMax route failed")
                return True

        config_post_response = self._get_config_route_service().handle_post(
            handler,
            path,
            self._read_body(handler)
            if path in ("/api/config", "/api/v2/config/custom-ai")
            else b"",
        )
        if config_post_response is not None:
            self._send_route_response(handler, config_post_response)
            return True

        json_file_post_response = self._get_json_file_route_service().handle_post(
            handler,
            path,
            self._read_body(handler)
            if (
                path in (
                    "/api/v2/projects/save",
                    "/api/v2/assets/save",
                    "/api/v2/workflows/save",
                )
                or (
                    path.startswith("/api/v2/user/")
                    and not path.startswith("/api/v2/user/presets")
                )
            )
            else b"",
        )
        if json_file_post_response is not None:
            self._send_route_response(handler, json_file_post_response)
            return True

        library_file_post_response = self._get_library_file_route_service().handle_post(
            handler,
            path,
            self._read_body(handler)
            if path
            in (
                "/api/v2/user/presets/definitions/save",
                "/api/v2/user/presets/dev/save",
                "/api/v2/assets/thumb/save",
                "/api/v2/workflows/thumb/save",
            )
            else b"",
        )
        if library_file_post_response is not None:
            self._send_route_response(handler, library_file_post_response)
            return True

        seedance_web_post_response = self._get_seedance_web_route_service().handle_post(
            handler,
            path,
            self._read_body(handler) if path.startswith("/api/v2/seedance-web/") else b"",
        )
        if seedance_web_post_response is not None:
            self._send_route_response(handler, seedance_web_post_response)
            return True

        dreamina_post_response = self._get_dreamina_route_service().handle_post(
            handler,
            path,
            self._read_body(handler) if path.startswith("/api/v2/dreamina/") else b"",
        )
        if dreamina_post_response is not None:
            self._send_route_response(handler, dreamina_post_response)
            return True

        sam3_post_response = self._get_sam3_route_service().handle_post(
            handler,
            path,
            self._read_body(handler)
            if path.startswith("/api/v2/matting/sam3/")
            else b"",
        )
        if sam3_post_response is not None:
            self._send_route_response(handler, sam3_post_response)
            return True

        media_file_post_response = self._get_media_file_route_service().handle_post(
            handler,
            path,
        )
        if media_file_post_response is not None:
            self._send_route_response(handler, media_file_post_response)
            return True

        local_media_post_response = self._get_local_media_processing_route_service().handle_post(
            handler,
            path,
        )
        if local_media_post_response is not None:
            self._send_route_response(handler, local_media_post_response)
            return True

        remote_proxy_post_response = self._get_remote_proxy_route_service().handle_post(
            handler,
            path,
        )
        if remote_proxy_post_response is not None:
            self._send_route_response(handler, remote_proxy_post_response)
            return True

        if path == "/api/v2/update/apply":
            return self._handle_update_apply(handler)

        return False

    def handle_delete(self, handler, path):
        if path.startswith("/api/v2/canvas-agent/"):
            if not self._is_canvas_agent_patch_or_delete_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_canvas_agent_route_service()
                if route_service is None or not hasattr(route_service, "handle_delete"):
                    self._json_err(handler, 503, "Canvas agent route unavailable")
                    return True
                response = route_service.handle_delete(handler, path)
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "Canvas agent route failed")
                return True

        library_file_delete_response = self._get_library_file_route_service().handle_delete(
            handler,
            path,
        )
        if library_file_delete_response is not None:
            self._send_route_response(handler, library_file_delete_response)
            return True

        json_file_delete_response = self._get_json_file_route_service().handle_delete(
            handler,
            path,
        )
        if json_file_delete_response is not None:
            self._send_route_response(handler, json_file_delete_response)
            return True
        return False

    def handle_patch(self, handler, path):
        if path.startswith("/api/v2/canvas-agent/"):
            if not self._is_canvas_agent_patch_or_delete_path(path):
                self._json_err(handler, 404, "Not found")
                return True
            try:
                route_service = self._get_canvas_agent_route_service()
                if route_service is None or not hasattr(route_service, "handle_patch"):
                    self._json_err(handler, 503, "Canvas agent route unavailable")
                    return True
                response = route_service.handle_patch(handler, path, self._read_body(handler))
                if response is not None:
                    self._send_route_response(handler, response)
                    return True
                self._json_err(handler, 404, "Not found")
                return True
            except Exception:
                self._json_err(handler, 500, "Canvas agent route failed")
                return True

        json_file_patch_response = self._get_json_file_route_service().handle_patch(
            handler,
            path,
            self._read_body(handler) if path.startswith("/api/v2/projects/") else b"",
        )
        if json_file_patch_response is not None:
            self._send_route_response(handler, json_file_patch_response)
            return True
        return False
