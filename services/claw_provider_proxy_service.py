import json
import urllib.error
import urllib.request

from services.claw_runtime_service import LOCAL_PROXY_TOKEN


class ClawProviderProxyService:
    def __init__(self, *, config_getter):
        self._config_getter = config_getter

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {"kind": "json_err", "code": int(code), "message": str(message or "")}

    def _provider_config(self):
        config = self._config_getter() or {}
        providers = config.get("providers") if isinstance(config, dict) else {}
        provider = providers.get("claw_assistant") if isinstance(providers, dict) else {}
        return provider if isinstance(provider, dict) else {}

    @staticmethod
    def _endpoint(api_url):
        base = str(api_url or "").strip().rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/openai"):
            return base + "/v1/chat/completions"
        return base + "/chat/completions"

    def handle_post(self, handler, path, body):
        if path != "/api/v2/assistant/provider-proxy/v1/chat/completions":
            return None
        auth = str(getattr(handler, "headers", {}).get("Authorization", "") or "")
        if auth != f"Bearer {LOCAL_PROXY_TOKEN}":
            return self._json_err(403, "Forbidden")
        provider = self._provider_config()
        if not provider.get("apiUrl") or not provider.get("apiKey"):
            return self._json_err(400, "Claw assistant provider is not configured")
        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            return self._json_err(400, "Invalid JSON")
        if not isinstance(payload, dict):
            return self._json_err(400, "Invalid JSON")
        payload.setdefault("model", provider.get("model") or "")
        req = urllib.request.Request(
            self._endpoint(provider.get("apiUrl")),
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {provider.get('apiKey')}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 HuanyingAssistant",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=900) as response:
                return self._json_ok(json.loads(response.read().decode("utf-8")))
        except urllib.error.HTTPError as exc:
            return self._json_err(exc.code, exc.read().decode("utf-8", errors="ignore"))
        except Exception as exc:
            return self._json_err(502, str(exc))

