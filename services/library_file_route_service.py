import base64
import json
import os
import re
from urllib.parse import unquote


class LibraryFileRouteService:
    _DEFAULT_PRESET_TYPES = ("ai-image", "ai-text", "ai-video", "ai-audio")
    _PRESET_NODE_TYPE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

    def __init__(
        self,
        *,
        user_dir_getter,
        asset_thumbs_dir_getter,
        workflow_thumbs_dir_getter,
        preset_definitions_path_getter=None,
    ):
        self._get_user_dir = user_dir_getter
        self._get_asset_thumbs_dir = asset_thumbs_dir_getter
        self._get_workflow_thumbs_dir = workflow_thumbs_dir_getter
        self._get_preset_definitions_path = (
            preset_definitions_path_getter or self._default_preset_definitions_path
        )

    @staticmethod
    def _default_preset_definitions_path():
        service_dir = os.path.abspath(os.path.dirname(__file__))
        project_root = os.path.dirname(service_dir)
        return os.path.join(project_root, "config", "prompt-presets.json")

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
    def _parse_json_object(body):
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return None, LibraryFileRouteService._json_err(400, "Invalid JSON")
        if not isinstance(data, dict):
            return None, LibraryFileRouteService._json_err(400, "Invalid JSON")
        return data, None

    @staticmethod
    def _safe_name(value):
        return re.sub(r'[\\/:*?"<>|]', "_", str(value))

    @staticmethod
    def _extension_from_data_url_header(header):
        mime = "image/jpeg"
        try:
            mime = str(header or "")[5:].split(";", 1)[0]
        except Exception:
            pass
        if mime.endswith("png"):
            return ".png"
        if mime.endswith("webp"):
            return ".webp"
        return ".jpg"

    def _preset_definitions_path(self):
        return os.path.abspath(str(self._get_preset_definitions_path() or "").strip())

    def _normalize_preset_definition_item(self, value, *, allow_subitems, path):
        if not isinstance(value, dict):
            raise ValueError(f"{path} must be an object")

        title = str(value.get("title") or "").strip()
        if not title:
            raise ValueError(f"{path}.title is required")

        normalized = {"title": title}

        icon = str(value.get("icon") or "")
        if icon.strip():
            normalized["icon"] = icon

        desc = str(value.get("desc") or "")
        if desc.strip():
            normalized["desc"] = desc

        raw_subitems = value.get("subItems")
        if allow_subitems and isinstance(raw_subitems, list) and raw_subitems:
            normalized["subItems"] = self._normalize_preset_definition_items(
                raw_subitems,
                allow_subitems=False,
                path=f"{path}.subItems",
            )
            return normalized

        template = str(value.get("template") or "")
        if not template.strip():
            raise ValueError(f"{path}.template is required")
        normalized["template"] = template
        return normalized

    def _normalize_preset_definition_items(self, items, *, allow_subitems, path):
        if not isinstance(items, list):
            raise ValueError(f"{path} must be an array")

        normalized = []
        seen_titles = set()
        for index, item in enumerate(items):
            normalized_item = self._normalize_preset_definition_item(
                item,
                allow_subitems=allow_subitems,
                path=f"{path}[{index}]",
            )
            title_key = normalized_item["title"]
            if title_key in seen_titles:
                raise ValueError(f"{path} contains duplicate title: {title_key}")
            seen_titles.add(title_key)
            normalized.append(normalized_item)
        return normalized

    def _normalize_preset_definitions(self, value):
        if not isinstance(value, dict):
            raise ValueError("Preset definitions must be an object")

        normalized = {}
        for raw_node_type, items in value.items():
            node_type = self._normalize_preset_node_type(raw_node_type)
            if not node_type:
                raise ValueError(f"Invalid nodeType: {raw_node_type}")
            normalized[node_type] = self._normalize_preset_definition_items(
                items,
                allow_subitems=True,
                path=node_type,
            )

        for node_type in self._DEFAULT_PRESET_TYPES:
            normalized.setdefault(node_type, [])

        return normalized

    def _read_preset_definitions(self):
        path = self._preset_definitions_path()
        if not path or not os.path.exists(path):
            return {node_type: [] for node_type in self._DEFAULT_PRESET_TYPES}
        try:
            with open(path, "r", encoding="utf-8") as file:
                raw = json.load(file)
            return self._normalize_preset_definitions(raw)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Failed to read preset definitions: {exc}") from exc

    def _write_preset_definitions(self, definitions):
        path = self._preset_definitions_path()
        if not path:
            raise ValueError("Preset definitions path is not configured")
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            json.dump(definitions, file, ensure_ascii=False, indent=2)
            file.write("\n")

    def _read_presets(self):
        prompt_dir = os.path.join(self._get_user_dir(), "prompt")
        for preset_type in self._DEFAULT_PRESET_TYPES:
            os.makedirs(os.path.join(prompt_dir, preset_type), exist_ok=True)

        result = {}
        if os.path.exists(prompt_dir):
            for node_type in os.listdir(prompt_dir):
                type_dir = os.path.join(prompt_dir, node_type)
                if not os.path.isdir(type_dir):
                    continue
                result[node_type] = []
                for filename in os.listdir(type_dir):
                    if not filename.endswith(".txt"):
                        continue
                    path = os.path.join(type_dir, filename)
                    try:
                        with open(path, "r", encoding="utf-8") as file:
                            content = file.read().strip()
                        if content:
                            result[node_type].append(
                                {
                                    "title": filename[:-4],
                                    "template": content,
                                }
                            )
                    except Exception as exc:
                        print(f"Error reading preset {path}: {exc}")
        return result

    def _preset_root_dir(self):
        prompt_dir = os.path.join(self._get_user_dir(), "prompt")
        os.makedirs(prompt_dir, exist_ok=True)
        for preset_type in self._DEFAULT_PRESET_TYPES:
            os.makedirs(os.path.join(prompt_dir, preset_type), exist_ok=True)
        return prompt_dir

    def _normalize_preset_node_type(self, value):
        node_type = str(value or "").strip().lower()
        if not node_type or not self._PRESET_NODE_TYPE_RE.match(node_type):
            return ""
        return node_type

    def _normalize_preset_title(self, value):
        title = self._safe_name(str(value or "").strip())
        title = title.strip().strip(".")
        return title

    def _preset_type_dir(self, node_type):
        safe_node_type = self._normalize_preset_node_type(node_type)
        if not safe_node_type:
            return "", None
        type_dir = os.path.join(self._preset_root_dir(), safe_node_type)
        os.makedirs(type_dir, exist_ok=True)
        return safe_node_type, type_dir

    def _preset_file_path(self, node_type, title):
        safe_node_type, type_dir = self._preset_type_dir(node_type)
        safe_title = self._normalize_preset_title(title)
        if not safe_node_type or not safe_title:
            return "", "", None
        return safe_node_type, safe_title, os.path.join(type_dir, f"{safe_title}.txt")

    def _save_prompt_preset(self, body):
        data, error = self._parse_json_object(body)
        if error is not None:
            return error

        node_type = data.get("nodeType")
        title = data.get("title")
        template = data.get("template")
        original_title = data.get("originalTitle")

        safe_node_type, safe_title, target_path = self._preset_file_path(node_type, title)
        if not target_path:
            return self._json_err(400, "Invalid nodeType or title")
        if not isinstance(template, str) or not template.strip():
            return self._json_err(400, "Template required")

        original_path = None
        original_safe_title = ""
        if str(original_title or "").strip():
            _, original_safe_title, original_path = self._preset_file_path(
                safe_node_type,
                original_title,
            )
            if not original_path:
                return self._json_err(400, "Invalid originalTitle")

        if not original_path and os.path.exists(target_path):
            return self._json_err(409, "Preset title already exists")
        if original_path and original_path != target_path and os.path.exists(target_path):
            return self._json_err(409, "Preset title already exists")

        with open(target_path, "w", encoding="utf-8") as file:
            file.write(template)

        if (
            original_path
            and original_safe_title
            and original_path != target_path
            and os.path.exists(original_path)
        ):
            os.remove(original_path)

        return self._json_ok(
            {
                "success": True,
                "nodeType": safe_node_type,
                "title": safe_title,
                "template": template,
            }
        )

    def _delete_prompt_preset(self, path):
        prefix = "/api/v2/user/presets/dev/"
        raw_fragment = unquote(path[len(prefix) :])
        parts = [part for part in raw_fragment.split("/") if part]
        if len(parts) != 2:
            return self._json_err(400, "Invalid request")

        safe_node_type, safe_title, preset_path = self._preset_file_path(parts[0], parts[1])
        if not preset_path:
            return self._json_err(400, "Invalid request")
        if not os.path.exists(preset_path):
            return self._json_err(404, "Preset not found")

        os.remove(preset_path)
        return self._json_ok(
            {
                "success": True,
                "nodeType": safe_node_type,
                "title": safe_title,
            }
        )

    def _save_preset_definitions(self, body):
        data, error = self._parse_json_object(body)
        if error is not None:
            return error

        raw_definitions = data.get("definitions", data)
        try:
            normalized = self._normalize_preset_definitions(raw_definitions)
            self._write_preset_definitions(normalized)
        except ValueError as exc:
            return self._json_err(400, str(exc))

        return self._json_ok(
            {
                "success": True,
                "definitions": normalized,
            }
        )

    def _save_thumb(
        self,
        *,
        data,
        id_fields,
        default_key,
        id_required_message,
        target_dir,
        relative_prefix,
    ):
        item_id = ""
        for field in id_fields:
            item_id = data.get(field) or item_id
            if item_id:
                break
        key = data.get("key") or data.get("idx") or default_key
        data_url = data.get("dataUrl") or ""

        if not item_id:
            return self._json_err(400, id_required_message)
        if not isinstance(data_url, str) or not data_url.startswith("data:image/"):
            return self._json_err(400, "Invalid dataUrl")

        try:
            header, encoded = data_url.split(",", 1)
        except Exception:
            return self._json_err(400, "Invalid dataUrl")

        try:
            raw = base64.b64decode(encoded)
        except Exception:
            return self._json_err(400, "Invalid base64")

        extension = self._extension_from_data_url_header(header)
        filename = f"{self._safe_name(item_id)}_{self._safe_name(key)}{extension}"
        os.makedirs(target_dir, exist_ok=True)
        with open(os.path.join(target_dir, filename), "wb") as file:
            file.write(raw)

        local_path = f"{relative_prefix}/{filename}"
        return self._json_ok(
            {
                "success": True,
                "url": f"/{local_path}",
                "localPath": local_path,
                "filename": filename,
            }
        )

    def handle_get(self, handler, path):
        if path == "/api/v2/user/presets/definitions":
            try:
                return self._json_ok(self._read_preset_definitions())
            except ValueError as exc:
                return self._json_err(500, str(exc))

        if path == "/api/v2/user/presets":
            return self._json_ok(self._read_presets())
        return None

    def handle_post(self, handler, path, body):
        if path == "/api/v2/user/presets/definitions/save":
            return self._save_preset_definitions(body)

        if path == "/api/v2/user/presets/dev/save":
            return self._save_prompt_preset(body)

        if path == "/api/v2/assets/thumb/save":
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._save_thumb(
                data=data,
                id_fields=("assetId", "id"),
                default_key="0",
                id_required_message="Asset ID required",
                target_dir=self._get_asset_thumbs_dir(),
                relative_prefix="data/assets/thumbs",
            )

        if path == "/api/v2/workflows/thumb/save":
            data, error = self._parse_json_object(body)
            if error is not None:
                return error
            return self._save_thumb(
                data=data,
                id_fields=("workflowId", "id"),
                default_key="cover",
                id_required_message="Workflow ID required",
                target_dir=self._get_workflow_thumbs_dir(),
                relative_prefix="data/workflows/thumbs",
            )

        return None

    def handle_delete(self, handler, path):
        if path.startswith("/api/v2/user/presets/dev/"):
            return self._delete_prompt_preset(path)
        return None
