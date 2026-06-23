import json


class ClawAssistantRouteService:
    def __init__(
        self,
        *,
        config_getter=None,
        bridge_service=None,
        action_schema=None,
        context_service=None,
        provider_proxy_service=None,
        runtime_service=None,
        conversation_memory_service=None,
    ):
        self._config_getter = config_getter or (lambda: {})
        self._bridge_service = bridge_service
        self._action_schema = action_schema
        self._context_service = context_service
        self._provider_proxy_service = provider_proxy_service
        self._runtime_service = runtime_service
        self._conversation_memory_service = conversation_memory_service

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {"kind": "json_err", "code": int(code), "message": str(message or "")}

    @staticmethod
    def _parse_body(body):
        try:
            data = json.loads(body or b"{}")
        except json.JSONDecodeError:
            return None, ClawAssistantRouteService._json_err(400, "Invalid JSON")
        if not isinstance(data, dict):
            return None, ClawAssistantRouteService._json_err(400, "Invalid JSON")
        return data, None

    def _provider_config(self):
        config = self._config_getter() or {}
        providers = config.get("providers") if isinstance(config, dict) else {}
        provider = providers.get("claw_assistant") if isinstance(providers, dict) else {}
        return provider if isinstance(provider, dict) else {}

    def handle_get(self, handler, path):
        if path != "/api/v2/assistant/status":
            return None
        provider = self._provider_config()
        runtime = (
            self._runtime_service.status()
            if self._runtime_service and hasattr(self._runtime_service, "status")
            else {"configured": False, "running": False}
        )
        provider_configured = bool(provider.get("apiUrl") and provider.get("apiKey"))
        available = bool(provider_configured and runtime.get("configured", True))
        status = "ready" if available else ("missing_runtime" if provider_configured else "missing_provider")
        return self._json_ok(
            {
                "success": True,
                "available": available,
                "status": status,
                "runtime": runtime,
                "provider": {
                    "configured": provider_configured,
                    "apiUrl": provider.get("apiUrl") or "",
                    "model": provider.get("model") or "",
                    "providerType": provider.get("providerType") or "openai_compatible",
                    "apiKeyPresent": bool(provider.get("apiKey")),
                },
            }
        )

    def handle_post(self, handler, path, body):
        if self._provider_proxy_service and path.startswith("/api/v2/assistant/provider-proxy/"):
            return self._provider_proxy_service.handle_post(handler, path, body)

        data, error = self._parse_body(body)
        if error is not None:
            return error

        if path == "/api/v2/assistant/chat":
            message = str(data.get("message") or "").strip()
            if not message:
                return self._json_err(400, "Missing message")
            if not self._bridge_service:
                return self._json_ok(
                    {
                        "success": True,
                        "reply": "Claw Code assistant route is available.",
                        "actions": [],
                        "warnings": [],
                        "requiresConfirmation": False,
                    }
                )
            return self._json_ok(
                self._bridge_service.chat(
                    message=message,
                    context=data.get("context") or {},
                    conversation_id=data.get("conversationId"),
                )
            )

        if path == "/api/v2/assistant/actions/validate":
            if not self._action_schema:
                return self._json_err(503, "Action schema is not configured")
            return self._json_ok(
                self._action_schema.validate_actions(
                    data.get("actions") or [],
                    context=data.get("context"),
                    video_authorized=bool(data.get("videoAuthorized")),
                )
            )

        if path == "/api/v2/assistant/context/preview":
            context = data.get("context") if "context" in data else data
            if self._context_service and hasattr(self._context_service, "preview_context"):
                return self._json_ok(self._context_service.preview_context(context))
            return self._json_ok({"success": True, "context": context or {}, "warnings": []})

        if path == "/api/v2/assistant/runtime/start" and self._runtime_service:
            return self._json_ok(self._runtime_service.start())

        if path == "/api/v2/assistant/runtime/stop" and self._runtime_service:
            return self._json_ok(self._runtime_service.stop())

        return None

