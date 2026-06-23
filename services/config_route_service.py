import copy
import json
import os
import re


MODEL_NODE_TYPES = ("text", "image", "video", "audio", "other")
VALID_MODEL_STATUSES = {
    "unconfigured",
    "unverified",
    "available",
    "failed",
    "deleted",
}


def _default_model_entry(
    model_id,
    node_type,
    model_name,
    *,
    hinted_model_id="",
    hinted_base_url="",
):
    return {
        "id": model_id,
        "nodeType": node_type,
        "modelName": model_name,
        "modelId": "",
        "apiKey": "",
        "baseUrl": "",
        "adapterType": "openai_compatible",
        "status": "unconfigured",
        "lastTestedAt": None,
        "lastError": "",
        "lastTestResult": None,
        "templateHints": {
            "modelId": hinted_model_id or "",
            "baseUrl": hinted_base_url or "",
        },
    }


DEFAULT_MODEL_REGISTRY = {
    "text": [
        _default_model_entry(
            "mdl_text_default_gemini_3_1",
            "text",
            "gemini-3.1",
            hinted_model_id="gemini-3.1",
            hinted_base_url="https://example.com/v1/chat/completions",
        )
    ],
    "image": [
        _default_model_entry(
            "mdl_image_default_nano_banana_2",
            "image",
            "NanoBanana-2",
            hinted_model_id="nano-banana-2",
            hinted_base_url="https://example.com/v1/images/generations",
        )
    ],
    "video": [
        _default_model_entry(
            "mdl_video_default_seedance_2_0",
            "video",
            "seedance-2.0",
            hinted_model_id="seedance-2.0",
            hinted_base_url="https://example.com/v1/video/generations",
        )
    ],
    "audio": [
        _default_model_entry(
            "mdl_audio_default_minimax",
            "audio",
            "minimax",
            hinted_model_id="minimax",
            hinted_base_url="https://example.com/v1/audio/speech",
        )
    ],
    "other": [],
}


class ConfigRouteService:
    def __init__(self, *, config_file_getter):
        self._get_config_file = config_file_getter

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {
            "kind": "json_err",
            "code": int(code),
            "message": str(message or ""),
        }

    @staticmethod
    def _clone_json(data):
        return copy.deepcopy(data)

    @staticmethod
    def _coerce_text(value):
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _slugify(value):
        slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
        slug = slug.strip("-")
        return slug or "model"

    @staticmethod
    def _parse_json_object(body):
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return None, ConfigRouteService._json_err(400, "Invalid JSON")
        if not isinstance(data, dict):
            return None, ConfigRouteService._json_err(400, "Invalid JSON")
        return data, None

    @classmethod
    def create_default_registry(cls):
        return cls._clone_json(DEFAULT_MODEL_REGISTRY)

    @classmethod
    def _normalize_template_hints(cls, raw_hints):
        if not isinstance(raw_hints, dict):
            return {"modelId": "", "baseUrl": ""}
        return {
            "modelId": cls._coerce_text(
                raw_hints.get("modelId") or raw_hints.get("modelID")
            ),
            "baseUrl": cls._coerce_text(raw_hints.get("baseUrl")),
        }

    @classmethod
    def _normalize_model_status(cls, raw_status, *, is_fully_configured):
        status = cls._coerce_text(raw_status)
        if status == "deleted":
            return status
        if not is_fully_configured:
            return "unconfigured"
        if status in VALID_MODEL_STATUSES - {"unconfigured"}:
            return status
        return "unverified"

    @classmethod
    def _normalize_model_record(cls, node_type, raw_item, index):
        item = raw_item if isinstance(raw_item, dict) else {}
        model_name = cls._coerce_text(item.get("modelName"))
        if not model_name:
            return None

        model_slug = cls._slugify(model_name)
        model_id = cls._coerce_text(item.get("modelId") or item.get("modelID"))
        api_key = cls._coerce_text(item.get("apiKey"))
        base_url = cls._coerce_text(item.get("baseUrl"))
        is_fully_configured = bool(model_id and api_key and base_url)

        normalized = {
            "id": cls._coerce_text(item.get("id"))
            or f"mdl_{node_type}_{model_slug}_{index + 1}",
            "nodeType": node_type,
            "modelName": model_name,
            "modelId": model_id,
            "apiKey": api_key,
            "baseUrl": base_url,
            "adapterType": cls._coerce_text(item.get("adapterType"))
            or "openai_compatible",
            "status": cls._normalize_model_status(
                item.get("status"),
                is_fully_configured=is_fully_configured,
            ),
            "lastTestedAt": item.get("lastTestedAt"),
            "lastError": cls._coerce_text(item.get("lastError")),
            "lastTestResult": item.get("lastTestResult"),
            "templateHints": cls._normalize_template_hints(item.get("templateHints")),
        }
        return normalized

    @classmethod
    def _dedupe_model_names(cls, models):
        used = {}
        deduped = []
        for model in models:
            if not isinstance(model, dict):
                continue
            base_name = cls._coerce_text(model.get("modelName"))
            if not base_name:
                continue
            name_key = base_name.casefold()
            used[name_key] = used.get(name_key, 0) + 1
            if used[name_key] > 1:
                model = {**model, "modelName": f"{base_name} ({used[name_key]})"}
            deduped.append(model)
        return deduped

    @classmethod
    def normalize_registry(cls, raw_registry):
        source = raw_registry if isinstance(raw_registry, dict) else {}
        normalized = {}

        for node_type in MODEL_NODE_TYPES:
            source_value = source.get(node_type)
            has_valid_explicit_list = isinstance(source_value, list)

            models = []
            if has_valid_explicit_list:
                for index, raw_item in enumerate(source_value):
                    item = cls._normalize_model_record(node_type, raw_item, index)
                    if item is not None:
                        models.append(item)

            models = cls._dedupe_model_names(models)

            if not has_valid_explicit_list:
                models = cls._clone_json(DEFAULT_MODEL_REGISTRY[node_type])

            normalized[node_type] = models

        return normalized

    @classmethod
    def normalize_public_config(cls, raw_config):
        config = cls._clone_json(raw_config) if isinstance(raw_config, dict) else {}
        config["modelRegistry"] = cls.normalize_registry(config.get("modelRegistry"))

        providers = config.get("providers")
        backup = config.get("deprecatedProvidersBackup")
        if isinstance(providers, dict) and providers:
            if not isinstance(backup, dict) or not backup:
                config["deprecatedProvidersBackup"] = cls._clone_json(providers)
        elif not isinstance(backup, dict):
            config["deprecatedProvidersBackup"] = {}

        return config

    def _config_file(self):
        return os.path.abspath(self._get_config_file())

    def _read_config(self):
        path = self._config_file()
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8-sig") as file:
            try:
                data = json.load(file)
            except json.JSONDecodeError:
                return {}
        return data if isinstance(data, dict) else {}

    def _write_config(self, data):
        path = self._config_file()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)

    def get_custom_ai_config(self):
        env_url = os.environ.get("CUSTOM_AI_URL", "").strip()
        env_key = os.environ.get("CUSTOM_AI_KEY", "").strip()

        cfg_url = ""
        cfg_key = ""
        try:
            cfg = self._read_config()
            custom_ai = cfg.get("custom_ai", {}) if isinstance(cfg, dict) else {}
            cfg_url = custom_ai.get("apiUrl") or cfg.get("apiUrl", "")
            cfg_key = custom_ai.get("apiKey") or cfg.get("apiKey", "")
        except Exception:
            pass

        return {
            "apiUrl": env_url if env_url else cfg_url,
            "apiKey": env_key if env_key else cfg_key,
            "source": "env" if (env_url or env_key) else "config",
        }

    @staticmethod
    def _masked_key(api_key):
        key = str(api_key or "")
        if len(key) > 4:
            return key[:4] + "*" * (len(key) - 4)
        return "*" * len(key) if key else ""

    def _read_public_config(self):
        cfg = self._read_config()

        env_grsai_key = os.environ.get("GRSAI_API_KEY", "").strip()
        if env_grsai_key:
            old_key = cfg.get("apiKey") or cfg.get("apiKeyInput")
            providers = cfg.get("providers", {})
            if not isinstance(providers, dict):
                providers = {}
                cfg["providers"] = providers
            grsai = providers.get("grsai", {})
            if not isinstance(grsai, dict):
                grsai = {}
            providers["grsai"] = grsai
            if not old_key and not grsai.get("apiKey"):
                grsai["apiKey"] = env_grsai_key

        env_ppio_key = os.environ.get("PPIO_API_KEY", "").strip()
        if env_ppio_key:
            providers = cfg.get("providers", {})
            if not isinstance(providers, dict):
                providers = {}
                cfg["providers"] = providers
            ppio = providers.get("ppio", {})
            if not isinstance(ppio, dict):
                ppio = {}
            providers["ppio"] = ppio
            if not ppio.get("apiKey"):
                ppio["apiKey"] = env_ppio_key

        return self.normalize_public_config(cfg)

    def _read_custom_ai_public_config(self):
        cfg = self.get_custom_ai_config()
        api_key = cfg["apiKey"]
        return {
            "apiUrl": cfg["apiUrl"],
            "apiKeyMasked": self._masked_key(api_key),
            "hasKey": bool(api_key),
            "source": cfg["source"],
        }

    def handle_get(self, handler, path):
        if path == "/api/config":
            return self._json_ok(self._read_public_config())

        if path == "/api/v2/config/custom-ai":
            return self._json_ok(self._read_custom_ai_public_config())

        return None

    def handle_post(self, handler, path, body):
        if path == "/api/config":
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            self._write_config(self.normalize_public_config(data))
            return self._json_ok({"success": True})

        if path == "/api/v2/config/custom-ai":
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            if self.get_custom_ai_config().get("source") == "env":
                return self._json_err(
                    403,
                    "Config is locked by environment variables (CUSTOM_AI_URL / CUSTOM_AI_KEY)",
                )
            try:
                existing = self.normalize_public_config(self._read_config())
                existing["custom_ai"] = {
                    "apiUrl": str(data.get("apiUrl") or "").strip(),
                    "apiKey": str(data.get("apiKey") or "").strip(),
                }
                self._write_config(existing)
                return self._json_ok({"success": True})
            except Exception as exc:
                return self._json_err(500, str(exc))

        return None
