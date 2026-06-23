import json
import os
import urllib.parse


def _legacy_qmai_enabled():
    # QMAI director lane is dormant by default (α′): ViMax owns the
    # director prefixes. Flip HY_DIRECTOR_LEGACY_QMAI=1 to revive the
    # legacy QMAI behaviors (knowledge projection, dailies uplink, the
    # 导演: -> QMAI plan path). Read per request (no restart to toggle).
    return (os.environ.get("HY_DIRECTOR_LEGACY_QMAI", "0") or "0").strip().lower() in ("1", "true", "yes", "on")


class CanvasAgentRouteService:
    PROVIDER_NAMES = ("canvas_agent", "pi_canvas_agent")

    def __init__(
        self,
        *,
        bridge_service=None,
        action_schema=None,
        context_service=None,
        runtime_service=None,
        conversation_service=None,
        generation_task_service=None,
        execution_service=None,
        sync_service=None,
        config_getter=None,
        director_bridge_service=None,
    ):
        self._bridge_service = bridge_service
        self._action_schema = action_schema
        self._context_service = context_service
        self._runtime_service = runtime_service
        self._conversation_service = conversation_service
        self._generation_task_service = generation_task_service
        self._execution_service = execution_service
        self._sync_service = sync_service
        self._config_getter = config_getter or (lambda: {})
        self._director_bridge_service = director_bridge_service

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {"kind": "json_err", "code": int(code), "message": str(message)}

    @staticmethod
    def _parse_json_object(body):
        try:
            data = json.loads(body or b"{}")
        except (TypeError, json.JSONDecodeError, UnicodeDecodeError):
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _normalize_assistant_intent(intent):
        if not isinstance(intent, dict):
            return None
        intent_id = str(intent.get("id") or "").strip()
        if not intent_id:
            return None
        title = str(intent.get("title") or intent_id).strip() or intent_id
        source = str(intent.get("source") or "manual").strip() or "manual"
        return {"id": intent_id, "title": title, "source": source}

    @classmethod
    def _merge_assistant_intent_context(cls, context, assistant_intent):
        next_context = dict(context) if isinstance(context, dict) else {}
        normalized_intent = cls._normalize_assistant_intent(assistant_intent)
        if normalized_intent:
            next_context["assistantIntent"] = normalized_intent
        return next_context

    def handle_get(self, handler, path):
        if path == "/api/v2/canvas-agent/status":
            return self._json_ok(self._status_payload())
        if path.startswith("/api/v2/canvas-agent/conversations"):
            return self._handle_conversation_get(handler, path)
        if path.startswith("/api/v2/canvas-agent/generation-tasks"):
            return self._handle_generation_task_get(handler, path)
        if path.startswith("/api/v2/canvas-agent/executions"):
            return self._handle_execution_get(handler, path)
        if path == "/api/v2/canvas-agent/sync/project":
            return self._handle_sync_get(handler)
        if path == "/api/v2/canvas-agent/metrics":
            return self._handle_metrics_get(handler)
        if path == "/api/v2/canvas-agent/receipts":
            return self._handle_receipts_get(handler)
        if path == "/api/v2/canvas-agent/director/knowledge":
            return self._handle_director_knowledge()
        if path == "/api/v2/canvas-agent/director/refresh/status":
            return self._handle_director_refresh_status(handler)
        return None

    def handle_post(self, handler, path, body):
        if path == "/api/v2/canvas-agent/chat":
            return self._handle_chat(body)
        if path == "/api/v2/canvas-agent/chat/stream":
            return self._handle_chat_stream(body)
        if path.startswith("/api/v2/canvas-agent/conversations"):
            return self._handle_conversation_post(path, body)
        if path.startswith("/api/v2/canvas-agent/generation-tasks"):
            return self._handle_generation_task_post(path, body)
        if path.startswith("/api/v2/canvas-agent/executions"):
            return self._handle_execution_post(path, body)
        if path == "/api/v2/canvas-agent/sync/project":
            return self._handle_sync_post(body)
        if path == "/api/v2/canvas-agent/context/preview":
            return self._handle_context_preview(body)
        if path == "/api/v2/canvas-agent/actions/validate":
            return self._handle_actions_validate(body)
        if path == "/api/v2/canvas-agent/director/plan":
            return self._handle_director_plan(body)
        if path == "/api/v2/canvas-agent/director/dailies":
            return self._handle_director_dailies(body)
        if path == "/api/v2/canvas-agent/director/refresh":
            return self._handle_director_refresh(body)
        return None

    def handle_patch(self, handler, path, body):
        if path.startswith("/api/v2/canvas-agent/conversations"):
            return self._handle_conversation_patch(path, body)
        if path.startswith("/api/v2/canvas-agent/generation-tasks"):
            return self._handle_generation_task_patch(path, body)
        if path.startswith("/api/v2/canvas-agent/executions"):
            return self._handle_execution_patch(path, body)
        return None

    def handle_delete(self, handler, path):
        if path.startswith("/api/v2/canvas-agent/conversations"):
            return self._handle_conversation_delete(path)
        if path.startswith("/api/v2/canvas-agent/executions"):
            return self._handle_execution_delete(handler, path)
        return None

    def _handle_chat(self, body):
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")

        message = str(data.get("message") or "").strip()
        if not message:
            return self._json_err(400, "Missing message")
        if self._bridge_service is None:
            return self._json_err(503, "Canvas agent bridge is not configured")

        chat_kwargs = {
            "message": message,
            "context": self._merge_assistant_intent_context(
                data.get("context"),
                data.get("assistantIntent"),
            ),
            "conversation_id": data.get("conversationId"),
            "mode": data.get("mode") or "actions",
        }
        model = self._sanitize_model_reference(data.get("model"))
        if model is not None:
            chat_kwargs["model"] = model
        return self._json_ok(
            self._bridge_service.chat(
                **chat_kwargs,
            )
        )

    def _handle_chat_stream(self, body):
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")

        message = str(data.get("message") or "").strip()
        if not message:
            return self._json_err(400, "Missing message")
        if self._bridge_service is None:
            return self._json_err(503, "Canvas agent bridge is not configured")

        chat_kwargs = {
            "message": message,
            "context": self._merge_assistant_intent_context(
                data.get("context"),
                data.get("assistantIntent"),
            ),
            "conversation_id": data.get("conversationId"),
            "mode": data.get("mode") or "actions",
        }
        model = self._sanitize_model_reference(data.get("model"))
        if model is not None:
            chat_kwargs["model"] = model
        if hasattr(self._bridge_service, "chat_stream"):
            frames = list(self._bridge_service.chat_stream(**chat_kwargs))
            body_bytes = "\n".join(json.dumps(frame, ensure_ascii=False) for frame in frames).encode("utf-8")
            return {
                "kind": "binary",
                "status": 200,
                "contentType": "application/x-ndjson; charset=utf-8",
                "body": body_bytes,
            }

        response = self._bridge_service.chat(**chat_kwargs)
        if not isinstance(response, dict):
            response = {
                "success": False,
                "reply": "Canvas agent returned an invalid response.",
                "actions": [],
                "warnings": [],
            }
        frames = [
            {
                "type": "message.start",
                "conversationId": data.get("conversationId") or response.get("conversationId") or "",
                "messageId": response.get("messageId") or "",
                "traceId": response.get("traceId") or "",
            }
        ]
        reply = str(response.get("reply") or "")
        if reply:
            frames.append(
                {
                    "type": "message.delta",
                    "delta": reply,
                    "conversationId": response.get("conversationId") or data.get("conversationId") or "",
                    "messageId": response.get("messageId") or "",
                    "traceId": response.get("traceId") or "",
                }
            )
        for warning in response.get("warnings") if isinstance(response.get("warnings"), list) else []:
            if isinstance(warning, str) and warning.strip():
                frames.append({"type": "warning", "message": warning.strip()})
        frames.append(
            {
                "type": "message.done",
                "reply": reply,
                "actions": response.get("actions") if isinstance(response.get("actions"), list) else [],
                "warnings": response.get("warnings") if isinstance(response.get("warnings"), list) else [],
                "requiresConfirmation": bool(response.get("requiresConfirmation")),
                "conversationId": response.get("conversationId") or data.get("conversationId") or "",
                "messageId": response.get("messageId") or "",
                "traceId": response.get("traceId") or "",
            }
        )
        body_bytes = "\n".join(json.dumps(frame, ensure_ascii=False) for frame in frames).encode("utf-8")
        return {
            "kind": "binary",
            "status": 200,
            "contentType": "application/x-ndjson; charset=utf-8",
            "body": body_bytes,
        }

    def _handle_director_plan(self, body):
        if self._director_bridge_service is None:
            return self._json_err(503, "Director bridge is not configured")
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        return self._json_ok(self._director_bridge_service.plan(data))

    def _handle_director_dailies(self, body):
        # The eye uplink (L6 -> L2): canvas dailies land in the QMAI
        # inbox through the same runner subprocess, mode=dailies.
        if self._director_bridge_service is None:
            return self._json_err(503, "Director bridge is not configured")
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        payload = dict(data)
        payload["mode"] = "dailies"
        return self._json_ok(self._director_bridge_service.plan(payload))

    def _handle_director_refresh(self, body):
        # The headless brain: re-runs QMAI director judgment out of
        # band. Only available when the bridge has a refresh command
        # configured (HY_QMAI_HEADLESS_CMD).
        if self._director_bridge_service is None:
            return self._json_err(503, "Director bridge is not configured")
        refresh = getattr(self._director_bridge_service, "refresh", None)
        if not callable(refresh):
            return self._json_err(503, "Director refresh is not configured")
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        return self._json_ok(refresh(data))

    def _handle_director_refresh_status(self, handler):
        if self._director_bridge_service is None:
            return self._json_err(503, "Director bridge is not configured")
        status_fn = getattr(self._director_bridge_service, "refresh_status", None)
        if not callable(status_fn):
            return self._json_err(503, "Director refresh status is not configured")
        raw_path = getattr(handler, "path", "") or ""
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        job_id = (query.get("jobId") or [""])[0]
        if not job_id:
            return self._json_err(400, "jobId is required")
        return self._json_ok(status_fn(job_id))

    def _handle_director_knowledge(self):
        # Director knowledge projection (read-only, cached in the
        # bridge): cards for the PI llmWiki context pipe. Fail-open -
        # knowledge injection is an enhancement, not a gate.
        if self._director_bridge_service is None:
            return self._json_err(503, "Director bridge is not configured")
        knowledge = getattr(self._director_bridge_service, "knowledge", None)
        if not callable(knowledge):
            return self._json_err(503, "Director knowledge is not configured")
        return self._json_ok(knowledge())

    def _handle_actions_validate(self, body):
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        if self._action_schema is None:
            return self._json_err(503, "Canvas agent action schema is not configured")

        actions = data.get("actions")
        if not isinstance(actions, list):
            actions = []
        return self._json_ok(
            self._action_schema.validate_actions(
                actions,
                context=data.get("context"),
                video_authorized=bool(data.get("videoAuthorized")),
                matched_skills=data.get("matchedSkills"),
            )
        )

    def _handle_context_preview(self, body):
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")

        context = data["context"] if "context" in data else data
        if self._context_service is not None and hasattr(self._context_service, "preview_context"):
            return self._json_ok(self._context_service.preview_context(context))
        return self._json_ok({"success": True, "context": context, "warnings": []})

    def _conversation_service_or_error(self):
        if self._conversation_service is None:
            return None, self._json_err(503, "Canvas agent conversation service is not configured")
        return self._conversation_service, None

    @staticmethod
    def _conversation_query(handler):
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            return ""
        return (query.get("query") or query.get("q") or [""])[0]

    @staticmethod
    def _conversation_path_parts(path):
        prefix = "/api/v2/canvas-agent/conversations"
        if path == prefix:
            return []
        if not path.startswith(prefix + "/"):
            return None
        tail = path[len(prefix) + 1 :].strip("/")
        if not tail:
            return []
        return [urllib.parse.unquote(part) for part in tail.split("/") if part]

    def _handle_conversation_get(self, handler, path):
        service, error = self._conversation_service_or_error()
        if error is not None:
            return error
        parts = self._conversation_path_parts(path)
        if parts is None:
            return None
        if not parts:
            return self._json_ok(
                {
                    "success": True,
                    "conversations": service.list_conversations(self._conversation_query(handler)),
                }
            )
        if len(parts) == 1:
            conversation = service.get_conversation(parts[0])
            if not conversation:
                return self._json_err(404, "Conversation not found")
            return self._json_ok({"success": True, "conversation": conversation})
        if len(parts) == 2 and parts[1] == "export":
            exported = service.export_conversation(parts[0])
            if not exported:
                return self._json_err(404, "Conversation not found")
            return self._json_ok({"success": True, "export": exported})
        return self._json_err(404, "Not found")

    def _handle_conversation_post(self, path, body):
        service, error = self._conversation_service_or_error()
        if error is not None:
            return error
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        parts = self._conversation_path_parts(path)
        if parts is None:
            return None
        if not parts:
            return self._json_ok(
                {
                    "success": True,
                    "conversation": service.create_conversation(data),
                }
            )
        if len(parts) == 2 and parts[1] == "export":
            exported = service.export_conversation(parts[0])
            if not exported:
                return self._json_err(404, "Conversation not found")
            return self._json_ok({"success": True, "export": exported})
        operation_map = {
            "messages": "append_message",
            "context-snapshots": "attach_context_snapshot",
            "transactions": "append_transaction",
            "receipts": "append_receipt",
            "generation-tasks": "append_generation_task",
        }
        if len(parts) == 2 and parts[1] in operation_map:
            method = getattr(service, operation_map[parts[1]], None)
            if not callable(method):
                return self._json_err(404, "Not found")
            conversation = method(parts[0], data)
            if not conversation:
                return self._json_err(404, "Conversation not found")
            return self._json_ok({"success": True, "conversation": conversation})
        return self._json_err(404, "Not found")

    def _handle_conversation_patch(self, path, body):
        service, error = self._conversation_service_or_error()
        if error is not None:
            return error
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        parts = self._conversation_path_parts(path)
        if not parts or len(parts) != 1:
            return self._json_err(404, "Not found")
        conversation = service.rename_conversation(parts[0], data.get("title"))
        if not conversation:
            return self._json_err(404, "Conversation not found")
        return self._json_ok({"success": True, "conversation": conversation})

    def _handle_conversation_delete(self, path):
        service, error = self._conversation_service_or_error()
        if error is not None:
            return error
        parts = self._conversation_path_parts(path)
        if not parts or len(parts) != 1:
            return self._json_err(404, "Not found")
        return self._json_ok({"success": bool(service.delete_conversation(parts[0]))})

    def _generation_task_service_or_error(self):
        if self._generation_task_service is None:
            return None, self._json_err(501, "Canvas agent generation task store is not configured")
        return self._generation_task_service, None

    def _sync_service_or_error(self):
        if self._sync_service is None:
            return None, self._json_err(501, "Canvas agent sync service is not configured")
        return self._sync_service, None

    def _execution_service_or_error(self):
        if self._execution_service is None:
            return None, self._json_err(501, "Canvas agent execution store is not configured")
        return self._execution_service, None

    def _handle_metrics_get(self, handler):
        if self._execution_service is None or not hasattr(self._execution_service, "compute_metrics"):
            return self._json_err(503, "Canvas agent execution metrics are not configured")
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            query = {}
        filters = {}
        project_id = str((query.get("projectId") or [""])[0] or "").strip()
        if project_id:
            filters["projectId"] = project_id
        return self._json_ok({"success": True, "metrics": self._execution_service.compute_metrics(filters)})

    def _handle_receipts_get(self, handler):
        if self._execution_service is None or not hasattr(self._execution_service, "export_receipts"):
            return self._json_err(503, "Canvas agent execution receipts are not configured")
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            query = {}
        filters = {}
        project_id = str((query.get("projectId") or [""])[0] or "").strip()
        if project_id:
            filters["projectId"] = project_id
        return self._json_ok({"success": True, "receipts": self._execution_service.export_receipts(filters)})

    @staticmethod
    def _sync_query(handler):
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            query = {}
        return {
            "projectId": str((query.get("projectId") or [""])[0] or "").strip(),
            "teamId": str((query.get("teamId") or [""])[0] or "").strip(),
        }

    def _handle_sync_get(self, handler):
        service, error = self._sync_service_or_error()
        if error is not None:
            return error
        query = self._sync_query(handler)
        snapshot = service.export_project_snapshot(
            project_id=query["projectId"],
            team_id=query["teamId"],
        )
        return self._json_ok({"success": True, "snapshot": snapshot})

    def _handle_sync_post(self, body):
        service, error = self._sync_service_or_error()
        if error is not None:
            return error
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        result = service.import_project_snapshot(
            data.get("snapshot") if isinstance(data.get("snapshot"), dict) else data,
            project_id=data.get("projectId") or "",
            team_id=data.get("teamId") or "",
        )
        return self._json_ok({"success": True, "result": result})

    @staticmethod
    def _generation_task_query(handler):
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            query = {}
        filters = {}
        for key in ("conversationId", "nodeId", "status"):
            value = str((query.get(key) or [""])[0] or "").strip()
            if value:
                filters[key] = value
        return filters

    @staticmethod
    def _generation_task_path_parts(path):
        prefix = "/api/v2/canvas-agent/generation-tasks"
        if path == prefix:
            return []
        if not path.startswith(prefix + "/"):
            return None
        tail = path[len(prefix) + 1 :].strip("/")
        if not tail:
            return []
        return [urllib.parse.unquote(part) for part in tail.split("/") if part]

    def _handle_generation_task_get(self, handler, path):
        service, error = self._generation_task_service_or_error()
        if error is not None:
            return error
        parts = self._generation_task_path_parts(path)
        if parts is None:
            return None
        if parts:
            return self._json_err(404, "Not found")
        return self._json_ok(
            {
                "success": True,
                "tasks": service.list_generation_tasks(self._generation_task_query(handler)),
            }
        )

    def _handle_generation_task_post(self, path, body):
        service, error = self._generation_task_service_or_error()
        if error is not None:
            return error
        parts = self._generation_task_path_parts(path)
        if parts is None:
            return None
        if parts:
            return self._json_err(404, "Not found")
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        return self._json_ok({"success": True, "task": service.create_generation_task(data)})

    def _handle_generation_task_patch(self, path, body):
        service, error = self._generation_task_service_or_error()
        if error is not None:
            return error
        parts = self._generation_task_path_parts(path)
        if parts is None:
            return None
        if len(parts) != 1:
            return self._json_err(404, "Not found")
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        task = service.update_generation_task(parts[0], data)
        if not task:
            return self._json_err(404, "Generation task not found")
        return self._json_ok({"success": True, "task": task})

    @staticmethod
    def _execution_query(handler):
        raw_path = getattr(handler, "path", "") or ""
        try:
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(raw_path).query, keep_blank_values=True)
        except Exception:
            query = {}
        filters = {}
        for key in ("projectId", "conversationId", "status"):
            value = str((query.get(key) or [""])[0] or "").strip()
            if value:
                filters[key] = value
        return filters

    @staticmethod
    def _execution_path_parts(path):
        prefix = "/api/v2/canvas-agent/executions"
        if path == prefix:
            return []
        if not path.startswith(prefix + "/"):
            return None
        tail = path[len(prefix) + 1 :].strip("/")
        if not tail:
            return []
        return [urllib.parse.unquote(part) for part in tail.split("/") if part]

    def _handle_execution_get(self, handler, path):
        service, error = self._execution_service_or_error()
        if error is not None:
            return error
        parts = self._execution_path_parts(path)
        if parts is None:
            return None
        if not parts:
            return self._json_ok(
                {
                    "success": True,
                    "executions": service.list_executions(self._execution_query(handler)),
                }
            )
        if len(parts) == 1:
            execution = service.get_execution(parts[0])
            if not execution:
                return self._json_err(404, "Execution not found")
            return self._json_ok({"success": True, "execution": execution})
        return self._json_err(404, "Not found")

    def _handle_execution_post(self, path, body):
        service, error = self._execution_service_or_error()
        if error is not None:
            return error
        parts = self._execution_path_parts(path)
        if parts is None:
            return None
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        if not parts:
            return self._json_ok({"success": True, "execution": service.upsert_execution(data)})
        if len(parts) == 2 and parts[1] in ("timeline", "events"):
            execution = service.append_timeline_event(parts[0], data)
            if not execution:
                return self._json_err(404, "Execution not found")
            return self._json_ok({"success": True, "execution": execution})
        if len(parts) == 2 and parts[1] == "prepare":
            if not hasattr(service, "prepare_queued_execution"):
                return self._json_err(501, "Execution prepare is not configured")
            prepared = service.prepare_queued_execution(parts[0], data)
            if prepared is None:
                existing = service.get_execution(parts[0]) if hasattr(service, "get_execution") else None
                if not existing:
                    return self._json_err(404, "Execution not found")
                return self._json_err(501, "Execution prepare is not configured")
            return self._json_ok({"success": True, **prepared})
        return self._json_err(404, "Not found")

    def _handle_execution_patch(self, path, body):
        service, error = self._execution_service_or_error()
        if error is not None:
            return error
        parts = self._execution_path_parts(path)
        if parts is None:
            return None
        data = self._parse_json_object(body)
        if data is None:
            return self._json_err(400, "Invalid JSON")
        if len(parts) == 2 and parts[1] == "status":
            status = str(data.get("status") or "").strip()
            if not status:
                return self._json_err(400, "Missing status")
            execution = service.update_status(parts[0], status, data)
            if not execution:
                return self._json_err(404, "Execution not found")
            return self._json_ok({"success": True, "execution": execution})
        if len(parts) == 2 and parts[1] == "queue-control":
            action = str(data.get("action") or "").strip()
            if not action:
                return self._json_err(400, "Missing queue action")
            target_index = data.get("targetIndex", data.get("target_index"))
            if target_index is not None:
                try:
                    target_index = int(target_index)
                except (TypeError, ValueError):
                    target_index = None
            ordered_ids = data.get("orderedIds", data.get("ordered_ids"))
            if not isinstance(ordered_ids, list):
                ordered_ids = None
            execution = service.control_queued_execution(
                parts[0],
                action,
                target_index=target_index,
                ordered_ids=ordered_ids,
            )
            if not execution:
                return self._json_err(404, "Execution not found")
            return self._json_ok({"success": True, "execution": execution})
        return self._json_err(404, "Not found")

    def _handle_execution_delete(self, handler, path):
        service, error = self._execution_service_or_error()
        if error is not None:
            return error
        parts = self._execution_path_parts(path)
        if parts is None:
            return None
        if not parts:
            return self._json_ok({"success": True, "cleared": service.clear_completed(self._execution_query(handler))})
        return self._json_err(404, "Not found")

    def _status_payload(self):
        runtime = self._runtime_status()
        provider = self._provider_summary()
        runtime_configured = bool(runtime.get("configured")) if isinstance(runtime, dict) else False
        provider_configured = bool(provider.get("configured")) if isinstance(provider, dict) else False
        status = runtime.get("status") if isinstance(runtime, dict) else "unconfigured"
        return {
            "success": True,
            "available": bool(runtime_configured and provider_configured),
            "status": status or "unknown",
            "runtime": runtime,
            "provider": provider,
            # F10 down-link: the panel reads this on init and gates the
            # legacy QMAI entry points (default off -> ViMax owns the lane).
            "legacyQmai": _legacy_qmai_enabled(),
        }

    def _runtime_status(self):
        if self._runtime_service is not None and hasattr(self._runtime_service, "status"):
            status = self._runtime_service.status()
            if isinstance(status, dict):
                return status
        return {
            "success": True,
            "configured": bool(self._runtime_service),
            "running": False,
            "status": "ready" if self._runtime_service else "unconfigured",
        }

    def _provider_summary(self):
        cfg = self._config_getter()
        if not isinstance(cfg, dict):
            cfg = {}
        provider_name, provider = self.select_provider_config(cfg)

        endpoint = self._provider_endpoint(provider)
        sanitized_endpoint = self._sanitize_endpoint(endpoint)
        api_key_present = self._provider_flag(provider, "apiKey", "apiKeyConfigured")
        proxy_token_present = self._provider_flag(
            provider,
            "proxyToken",
            "proxyTokenConfigured",
            "token",
            "tokenConfigured",
        )
        model = str(
            provider.get("model") or provider.get("modelName") or provider.get("defaultModel") or ""
        ).strip()
        reasons = []
        if not endpoint:
            reasons.append("missing_endpoint")
        if not (api_key_present or proxy_token_present):
            reasons.append("missing_secret")
        if not model:
            reasons.append("missing_model")
        return {
            "name": provider_name,
            "configured": not reasons,
            "apiUrl": sanitized_endpoint,
            "endpoint": sanitized_endpoint,
            "model": model,
            "defaultModel": model,
            "providerType": provider.get("providerType") or "",
            "apiKeyPresent": api_key_present,
            "proxyTokenPresent": proxy_token_present,
            "reasons": reasons,
        }

    @classmethod
    def select_provider_config(cls, config, model=None):
        providers = config.get("providers") if isinstance(config, dict) else {}
        if not isinstance(providers, dict):
            providers = {}

        registry_name, registry_provider = cls._select_model_registry_text_config(config, model)
        if registry_provider:
            return registry_name, registry_provider

        if isinstance(model, dict):
            requested_provider = str(model.get("provider") or "").strip()
            candidate = providers.get(requested_provider)
            if isinstance(candidate, dict):
                provider = dict(candidate)
                selected_model = str(
                    model.get("model") or model.get("modelId") or model.get("id") or ""
                ).strip()
                if selected_model:
                    provider["model"] = selected_model
                return requested_provider, provider

        fallback_name = ""
        fallback_provider = {}
        for name in cls.PROVIDER_NAMES:
            candidate = providers.get(name)
            if not isinstance(candidate, dict):
                continue
            if not fallback_provider:
                fallback_name = name
                fallback_provider = candidate
            if cls._provider_is_configured(candidate):
                return name, dict(candidate)
        return fallback_name, dict(fallback_provider)

    @classmethod
    def _select_model_registry_text_config(cls, config, model=None):
        registry = config.get("modelRegistry") if isinstance(config, dict) else {}
        text_models = registry.get("text") if isinstance(registry, dict) else []
        if not isinstance(text_models, list):
            return "", {}

        requested = model if isinstance(model, dict) else None
        if requested is not None:
            provider_name = str(requested.get("provider") or "").strip()
            requested_values = {
                str(requested.get(key) or "").strip()
                for key in ("id", "modelId", "model", "displayName")
                if str(requested.get(key) or "").strip()
            }
            wants_registry = provider_name in ("model_registry", "registry-openai", "registry_text")
            match = cls._find_registry_text_model(text_models, requested_values)
            if wants_registry or match is not None:
                selected = match or cls._first_configured_registry_text_model(text_models)
                if selected:
                    return "model_registry", cls._registry_text_model_provider(selected, requested)
                return "model_registry", {}
            return "", {}

        selected = cls._first_configured_registry_text_model(text_models)
        if selected:
            return "model_registry", cls._registry_text_model_provider(selected, None)
        return "", {}

    @classmethod
    def _find_registry_text_model(cls, text_models, requested_values):
        if not requested_values:
            return None
        for model in text_models:
            if not isinstance(model, dict):
                continue
            candidates = {
                str(model.get(key) or "").strip()
                for key in ("id", "modelId", "modelID", "modelName", "name")
                if str(model.get(key) or "").strip()
            }
            if candidates.intersection(requested_values):
                return model
        return None

    @classmethod
    def _first_configured_registry_text_model(cls, text_models):
        fallback = None
        for model in text_models:
            if not isinstance(model, dict) or not cls._registry_text_model_is_configured(model):
                continue
            if fallback is None:
                fallback = model
            if str(model.get("status") or "").strip().lower() != "failed":
                return model
        return fallback

    @staticmethod
    def _registry_text_model_is_configured(model):
        return bool(
            str(model.get("id") or "").strip()
            and str(model.get("modelName") or model.get("name") or "").strip()
            and str(model.get("modelId") or model.get("modelID") or model.get("model") or "").strip()
            and str(model.get("apiKey") or "").strip()
            and str(model.get("baseUrl") or model.get("apiUrl") or model.get("endpoint") or "").strip()
            and str(model.get("status") or "").strip().lower() != "deleted"
            and model.get("disabled") is not True
        )

    @staticmethod
    def _registry_text_model_provider(model, requested=None):
        requested = requested if isinstance(requested, dict) else {}
        selected_model = str(requested.get("model") or requested.get("modelId") or "").strip()
        stored_model = str(
            model.get("modelId") or model.get("modelID") or model.get("model") or model.get("modelName") or ""
        ).strip()
        if selected_model and selected_model != str(model.get("id") or "").strip():
            stored_model = selected_model
        return {
            "apiUrl": str(model.get("baseUrl") or model.get("apiUrl") or model.get("endpoint") or "").strip(),
            "apiKey": str(model.get("apiKey") or "").strip(),
            "model": stored_model,
            "providerType": str(model.get("adapterType") or model.get("providerType") or "openai_compatible").strip(),
            "displayName": str(model.get("modelName") or model.get("name") or stored_model).strip(),
        }

    @staticmethod
    def _provider_is_configured(provider):
        endpoint = CanvasAgentRouteService._provider_endpoint(provider)
        has_secret = bool(
            CanvasAgentRouteService._provider_flag(provider, "apiKey", "apiKeyConfigured")
            or CanvasAgentRouteService._provider_flag(
                provider,
                "proxyToken",
                "proxyTokenConfigured",
                "token",
                "tokenConfigured",
            )
        )
        return bool(endpoint and has_secret)

    @staticmethod
    def _provider_endpoint(provider):
        if not isinstance(provider, dict):
            return ""
        return str(
            provider.get("apiUrl")
            or provider.get("proxyBaseUrl")
            or provider.get("baseUrl")
            or provider.get("endpoint")
            or ""
        ).strip()

    @staticmethod
    def _provider_flag(provider, *keys):
        if not isinstance(provider, dict):
            return False
        for key in keys:
            value = provider.get(key)
            if isinstance(value, bool):
                if value:
                    return True
                continue
            if str(value or "").strip():
                return True
        return False

    @staticmethod
    def _sanitize_model_reference(model):
        if not isinstance(model, dict):
            return None
        allowed = ("provider", "modelId", "id", "model", "displayName")
        sanitized = {}
        for key in allowed:
            value = model.get(key)
            if isinstance(value, (str, int, float)):
                text = str(value).strip()
                if text:
                    sanitized[key] = text
        return sanitized or None

    @staticmethod
    def _sanitize_endpoint(endpoint):
        raw = str(endpoint or "").strip()
        if not raw:
            return ""
        parsed = urllib.parse.urlsplit(raw)
        if not parsed.scheme or not parsed.netloc:
            return raw.split("?", 1)[0].split("#", 1)[0]

        hostname = parsed.hostname or ""
        if not hostname:
            return ""
        netloc = hostname
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        return urllib.parse.urlunsplit((parsed.scheme, netloc, parsed.path, "", ""))
