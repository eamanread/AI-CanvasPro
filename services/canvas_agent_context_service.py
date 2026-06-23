from services.claw_context_service import ClawContextService


PREFERRED_MODEL_KEYS = ("text", "image", "video", "audio", "default", "provider")
WORKFLOW_DEFAULT_KEYS = (
    "layout",
    "shotCount",
    "durationSec",
    "shotDurationSec",
    "branchCount",
    "imageBatchSize",
)
PROMPT_PRESET_LIMIT = 40
PROMPT_PRESET_INPUT_KEY_LIMIT = 12
KNOWLEDGE_RESULT_LIMIT = 12
KNOWLEDGE_HINT_LIMIT = 12
KNOWLEDGE_SEARCH_FIELDS = (
    "title",
    "fileId",
    "projectId",
    "snippet",
    "citation",
    "citationDisplay",
    "source",
    "score",
    # Director knowledge projection (director-knowledge-projection/v1);
    # mirrored in JS KNOWLEDGE_SEARCH_RESULT_FIELDS. whenToUse arrives
    # pre-joined as a scalar string (both sanitizers are scalar-only).
    "citationKind",
    "cardId",
    "craftDomain",
    "whenToUse",
)
KNOWLEDGE_HINT_FIELDS = (
    "nodeType",
    "title",
    "sourceTitle",
    "sourceName",
    "knowledgeTitle",
    "fileId",
    "sourceFileId",
    "knowledgeFileId",
    "projectId",
    "sourceProjectId",
    "knowledgeProjectId",
    "citation",
    "citationDisplay",
    "summary",
    "workflowKind",
    "workflowStep",
)


def _text_preference(value):
    if not isinstance(value, (str, int, float, bool)):
        return ""
    text = str(value).strip()
    if not text or "[redacted]" in text:
        return ""
    return text[:240]


class CanvasAgentContextService(ClawContextService):
    """Neutral context service for Pi canvas agent routes."""

    def sanitize_context(self, value, warnings=None):
        sanitized = super().sanitize_context(value, warnings)
        if isinstance(sanitized, dict):
            self._normalize_project_preferences(sanitized)
            self._normalize_prompt_presets(sanitized)
            self._normalize_knowledge(sanitized)
        return sanitized

    def _normalize_project_preferences(self, context):
        project = context.get("project")
        if not isinstance(project, dict):
            return
        raw_preferences = project.get("preferences") or project.get("projectPreferences")
        normalized = self._sanitize_project_preferences(raw_preferences)
        if normalized:
            project["preferences"] = normalized
        else:
            project.pop("preferences", None)
        project.pop("projectPreferences", None)

    def _sanitize_project_preferences(self, raw):
        if not isinstance(raw, dict):
            return {}
        preferences = {}
        visual_style = self._first_text(raw, "visualStyle", "style", "styleGuide")
        aspect_ratio = self._first_text(raw, "aspectRatio", "ratio")
        brand_voice = self._first_text(raw, "brandVoice", "brandTone", "tone")
        naming = self._first_text(raw, "naming", "namingRules")
        preferred_models = self._sanitize_preferred_models(raw)
        workflow_defaults = self._sanitize_workflow_defaults(raw)

        if visual_style:
            preferences["visualStyle"] = visual_style
        if aspect_ratio:
            preferences["aspectRatio"] = aspect_ratio
        if preferred_models:
            preferences["preferredModels"] = preferred_models
        if brand_voice:
            preferences["brandVoice"] = brand_voice
        if naming:
            preferences["naming"] = naming
        if workflow_defaults:
            preferences["workflowDefaults"] = workflow_defaults
        return preferences

    def _first_text(self, raw, *keys):
        for key in keys:
            text = _text_preference(raw.get(key))
            if text:
                return text
        return ""

    def _sanitize_preferred_models(self, raw):
        models = {}
        source = raw.get("preferredModels")
        if isinstance(source, dict):
            for key in PREFERRED_MODEL_KEYS:
                text = _text_preference(source.get(key))
                if text:
                    models[key] = text
        text_model = self._first_text(raw, "preferredModel", "preferredTextModel", "textModel")
        if text_model and "text" not in models:
            models["text"] = text_model
        image_model = self._first_text(raw, "preferredImageModel", "imageModel")
        if image_model and "image" not in models:
            models["image"] = image_model
        video_model = self._first_text(raw, "preferredVideoModel", "videoModel")
        if video_model and "video" not in models:
            models["video"] = video_model
        return models

    def _sanitize_workflow_defaults(self, raw):
        source = raw.get("workflowDefaults") or raw.get("defaults")
        if not isinstance(source, dict):
            return {}
        defaults = {}
        for key in WORKFLOW_DEFAULT_KEYS:
            value = source.get(key)
            if isinstance(value, bool):
                defaults[key] = value
            elif isinstance(value, (int, float)):
                defaults[key] = value
            else:
                text = _text_preference(value)
                if text:
                    defaults[key] = text
        return defaults

    def _normalize_prompt_presets(self, context):
        prompt_presets = context.get("promptPresets")
        if not isinstance(prompt_presets, dict):
            return
        source = prompt_presets.get("items", prompt_presets)
        prompt_presets["items"] = self._build_prompt_preset_catalog(source)

    def _build_prompt_preset_catalog(self, source):
        result = []
        self._collect_prompt_preset_items(
            source,
            {"nodeType": "", "category": "", "path": []},
            result,
        )
        return result[:PROMPT_PRESET_LIMIT]

    def _collect_prompt_preset_items(self, source, inherited, result):
        if source is None or len(result) >= PROMPT_PRESET_LIMIT:
            return
        if isinstance(source, list):
            for item in source:
                self._collect_prompt_preset_items(item, inherited, result)
                if len(result) >= PROMPT_PRESET_LIMIT:
                    break
            return
        if not isinstance(source, dict):
            return
        if "items" in source and "title" not in source and "template" not in source:
            self._collect_prompt_preset_items(source.get("items"), inherited, result)
            return

        entries = list(source.items())
        looks_like_node_type_map = (
            "title" not in source
            and "template" not in source
            and any(isinstance(value, list) for _, value in entries)
        )
        if looks_like_node_type_map:
            for node_type, items in entries:
                self._collect_prompt_preset_items(
                    items,
                    {"nodeType": _text_preference(node_type), "category": "", "path": []},
                    result,
                )
                if len(result) >= PROMPT_PRESET_LIMIT:
                    break
            return

        title = self._first_text(source, "title", "name", "label")
        sub_items = source.get("subItems") if isinstance(source.get("subItems"), list) else source.get("children")
        sub_items = sub_items if isinstance(sub_items, list) else []
        leaf_candidate = source.get("template") or source.get("id") or source.get("presetId") or source.get("hasTemplate") is True
        if leaf_candidate:
            self._add_prompt_preset_leaf(source, inherited, result)
        if sub_items:
            next_path = list(inherited.get("path") or [])
            if title:
                next_path.append(title)
            next_inherited = {
                **inherited,
                "category": inherited.get("category") or title or "",
                "path": next_path,
            }
            for child in sub_items:
                self._collect_prompt_preset_items(child, next_inherited, result)
                if len(result) >= PROMPT_PRESET_LIMIT:
                    break

    def _add_prompt_preset_leaf(self, raw, inherited, result):
        if not isinstance(raw, dict):
            return
        title = self._first_text(raw, "title", "name", "label")
        node_type = self._first_text(raw, "nodeType", "type") or inherited.get("nodeType") or ""
        if not title and not raw.get("id") and not raw.get("presetId"):
            return
        path = [*list(inherited.get("path") or [])]
        label = title or _text_preference(raw.get("id") or raw.get("presetId"))
        if label:
            path.append(label)
        preset_id = self._prompt_preset_id(raw, node_type, path, len(result))
        entry = {
            "id": preset_id,
            "presetId": preset_id,
            "title": title or preset_id,
            "name": title or preset_id,
        }
        description = self._first_text(raw, "desc", "description", "summary")
        category = inherited.get("category") or ""
        tags = self._prompt_preset_tags(raw)
        input_keys = self._prompt_preset_input_keys(raw)
        has_template = raw.get("hasTemplate") is True or bool(_text_preference(raw.get("template")))
        if description:
            entry["description"] = description
        if node_type:
            entry["nodeType"] = node_type
        if category:
            entry["category"] = category
        if len(path) > 1:
            entry["path"] = path
        if tags:
            entry["tags"] = tags
        if input_keys:
            entry["inputKeys"] = input_keys
        if has_template:
            entry["hasTemplate"] = True
        result.append(entry)

    def _prompt_preset_id(self, raw, node_type, path, fallback_index):
        explicit = _text_preference(raw.get("id") or raw.get("presetId") or raw.get("key"))
        if explicit:
            return explicit
        slug = "-".join(
            part
            for part in [self._slug_part(node_type), *[self._slug_part(item) for item in path]]
            if part
        )
        return slug or f"preset-{fallback_index + 1}"

    @staticmethod
    def _slug_part(value):
        text = _text_preference(value).lower()
        chars = [char if char.isalnum() or char in "_-" else "-" for char in text]
        slug = "".join(chars).strip("-")
        while "--" in slug:
            slug = slug.replace("--", "-")
        return slug

    @staticmethod
    def _prompt_preset_tags(raw):
        source = raw.get("tags") if isinstance(raw.get("tags"), list) else raw.get("keywords")
        if not isinstance(source, list):
            return []
        return [_text_preference(item) for item in source if _text_preference(item)][:8]

    @staticmethod
    def _prompt_preset_input_keys(raw):
        source = raw.get("inputs") or raw.get("inputSchema") or raw.get("variables")
        if not isinstance(source, dict):
            return []
        return [
            _text_preference(key)
            for key in list(source.keys())[:PROMPT_PRESET_INPUT_KEY_LIMIT]
            if _text_preference(key)
        ]

    def _normalize_knowledge(self, context):
        knowledge = context.get("knowledge")
        if not isinstance(knowledge, dict):
            return
        raw = knowledge.get("llmWiki") or knowledge.get("llm_wiki")
        normalized = self._sanitize_llm_wiki(raw)
        if normalized:
            knowledge.clear()
            knowledge["llmWiki"] = normalized
        else:
            context.pop("knowledge", None)

    def _sanitize_llm_wiki(self, raw):
        if not isinstance(raw, dict):
            return {}
        result = {}
        for key in ("mode", "status", "defaultProjectId"):
            text = _text_preference(raw.get(key))
            if text:
                result[key] = text
        if isinstance(raw.get("available"), bool):
            result["available"] = raw["available"]
        search_results = self._sanitize_knowledge_items(
            raw.get("searchResults") or raw.get("results") or (raw.get("lastSearch") or {}).get("results"),
            KNOWLEDGE_SEARCH_FIELDS,
            KNOWLEDGE_RESULT_LIMIT,
        )
        hints = self._sanitize_knowledge_items(
            raw.get("canvasActionHints") or raw.get("actionHints"),
            KNOWLEDGE_HINT_FIELDS,
            KNOWLEDGE_HINT_LIMIT,
        )
        if search_results:
            result["searchResults"] = search_results
        if hints:
            result["canvasActionHints"] = hints
        return result

    def _sanitize_knowledge_items(self, raw, fields, limit):
        if not isinstance(raw, list):
            return []
        result = []
        for item in raw[:limit]:
            if not isinstance(item, dict):
                continue
            sanitized = {}
            for field in fields:
                value = item.get(field)
                if isinstance(value, bool):
                    sanitized[field] = value
                    continue
                if isinstance(value, (int, float)) and field == "score":
                    sanitized[field] = value
                    continue
                text = _text_preference(value)
                if text:
                    sanitized[field] = text
            if sanitized:
                result.append(sanitized)
        return result
