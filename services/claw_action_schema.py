import copy
import re


SAFE_NODE_TYPES = {
    "source-text",
    "source-image",
    "source-video",
    "source-audio",
    "ai-text",
    "ai-image",
    "ai-video",
    "ai-audio",
    "comment",
    "group",
    # First-class canvas node for storyboards (StoryboardScriptNode); produced
    # by the ViMax/QMAI director plans. Was erroneously omitted, so EVERY
    # director plan was rejected here ("unsupported nodeType storyboard-script")
    # and nothing landed on the canvas (B0-C1).
    "storyboard-script",
}

SAFE_LAYOUTS = {
    "horizontal",
    "vertical",
    "grid",
    "single_chain",
    "branch_flow",
    "storyboard_grid",
    "asset_lane",
    "problem_lane",
}

WORKFLOW_METADATA_FIELDS = {
    "workflowKind",
    "workflowGroupId",
    "workflowStep",
    "workflowReason",
    "storyboardId",
    "storyboardEditScope",
    "targetShotIndex",
    "storyDurationSec",
    "shotIndex",
    "shotDurationSec",
    "shotTitle",
    "shotVisual",
    "shotCamera",
    "shotStyle",
    "shotPrompt",
    "shotVideoPrompt",
    "shotContinuity",
    # Director lineage (qmai-director-export/v1 -> node -> canvas-dailies,
    # CONTRACTS.md invariant 7). The JS schema validator additionally
    # gates WRITES by trusted execution source - this whitelist only
    # keeps the fields from being stripped in transit.
    "qmaiPromptId",
    "qmaiShotId",
    "dramaticBeat",
    "continuityAnchors",
    "negativePrompt",
    # ViMax lineage (vimax-shotplan/v1 -> node -> render-ticket, α′ F8).
    # Separate trusted channel from qmai-director; the JS validator gates
    # WRITES by trusted execution source, this whitelist keeps the fields
    # from being stripped in transit.
    "vimaxFlowId",
    "vimaxShotIdx",
    "vimaxCamIdx",
    "vimaxCharIdx",
    "vimaxRole",
    "vimaxView",
    "skillRefs",
    "assetRole",
    # storyboard-script node table state (rows + view/media mode). The
    # StoryboardScriptNode renders from node.data.storyboardScript; without
    # whitelisting it here claw strips it and the card renders an EMPTY table
    # (B0-C2/C3). Value passes through verbatim (the component re-normalizes
    # via createDefaultStoryboardScriptState on read).
    "storyboardScript",
    # Auto-start stamp (data form; the top-level form is in the action
    # field tuple). Honored deterministically by the skills executor.
    "autoStart",
    "sourceNodeId",
    "canvasDoctorFindingId",
    "assistantIntent",
    "variantBranchId",
    "variantBranchLabel",
    "variantDifference",
    "variantBranchIndex",
    "variantSourceNodeId",
    "viralReferenceId",
    "viralSourceType",
    "viralHook",
    "viralPacing",
    "viralStructure",
    "viralRemakeAngle",
    "viralRisk",
    "viralReplicationStep",
    "viralBeatIndex",
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
    "citationKind",
    "citationProjectId",
    "summary",
    "templateId",
    "templateName",
    "templateKind",
    "description",
    "scope",
    "projectId",
    "version",
    "templateVersion",
    "author",
    "tags",
    "teamId",
    "reviewStatus",
    "reviewer",
    "reviewedBy",
    "reviewDecision",
    "reviewComment",
    "reviewNote",
    "reviewRequestedBy",
    "publishedBy",
    "deprecatedReason",
    "reason",
    "userId",
    "consumerProjectId",
    "reuseCount",
    "deprecated",
    "rollbackOf",
    "rollbackToVersion",
    "agentRole",
    "agentTaskId",
    "agentHandoffFrom",
    "agentHandoffTo",
    "agentPermissions",
}

TEMPLATE_GOVERNANCE_FIELDS = {
    "templateId",
    "description",
    "scope",
    "projectId",
    "version",
    "templateVersion",
    "author",
    "tags",
    "teamId",
    "reviewStatus",
    "reviewer",
    "reviewedBy",
    "reviewDecision",
    "reviewComment",
    "reviewNote",
    "reviewRequestedBy",
    "publishedBy",
    "deprecatedReason",
    "reason",
    "userId",
    "consumerProjectId",
    "reuseCount",
    "deprecated",
    "rollbackOf",
    "rollbackToVersion",
    "agentRole",
    "agentTaskId",
    "agentHandoffFrom",
    "agentHandoffTo",
    "agentPermissions",
    "offset",
    "offsetX",
    "offsetY",
}

TEAM_TEMPLATE_GOVERNANCE_ACTION_TYPES = {
    "submit_workflow_template_review",
    "review_workflow_template",
    "publish_workflow_template",
    "deprecate_workflow_template",
    "rollback_workflow_template",
    "record_workflow_template_reuse",
}

PROMPT_SURGERY_FIELDS = {
    "previousPrompt",
    "nextPrompt",
    "promptDiff",
    "undoPatch",
}

DANGEROUS_KEY_RE = re.compile(
    r"(api[_-]?key|authorization|secret|token|password|credential|shell|file[_-]?path|local[_-]?path|absolute[_-]?path|(^|[_-])path($|[_-])|(^|[_-])file($|[_-]))",
    re.I,
)
DANGEROUS_VALUE_RE = re.compile(
    r"(Bearer\s+[A-Za-z0-9._-]+|(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{8,}|data:|blob:|[A-Za-z]:\\)",
    re.I,
)


class ClawActionSchema:
    def validate_actions(self, actions, context=None, *, video_authorized=False):
        if not isinstance(actions, list):
            return self._invalid(["actions must be a list"])

        context_nodes = self._context_node_ids(context)
        context_node_types = self._context_node_types(context)
        llm_wiki_sources = self._llm_wiki_source_scope(context)
        created_aliases = {}
        created_node_types = {}
        sanitized_actions = []
        warnings = []
        errors = []

        has_workflow_batch = self._batch_has_workflow_create_nodes(actions)
        for index, raw in enumerate(actions):
            if not isinstance(raw, dict):
                errors.append(f"action[{index}] must be an object")
                continue
            action = copy.deepcopy(raw)
            action_type = str(
                action.get("type")
                or action.get("action")
                or action.get("actionType")
                or action.get("operation")
                or ""
            ).strip()
            if action_type and not action.get("type"):
                action["type"] = action_type
                warnings.append(f"action[{index}] repaired action type alias")
            if not action_type:
                errors.append(f"action[{index}] missing type")
                continue

            if action_type == "run_prompt_preset_generation":
                action = self._pre_sanitize_prompt_preset_generation(action)

            if action_type == "create_group" and self._is_incomplete_group(action):
                if has_workflow_batch:
                    warnings.append(f"action[{index}] ignored incomplete create_group placeholder")
                    continue
                errors.append(f"action[{index}] missing required field nodeIds")
                continue

            if action_type == "connect_nodes" and self._is_empty_connect(action):
                if has_workflow_batch or self._context_has_workflow(context):
                    warnings.append(f"action[{index}] ignored empty connect_nodes placeholder")
                    continue
                errors.append(f"action[{index}] missing required field from/sourceId")
                errors.append(f"action[{index}] missing required field to/targetId")
                continue

            if self._contains_dangerous(action):
                errors.append(f"action[{index}] contains dangerous field or value")
                continue

            action, repair_warnings = self._repair_action(action, created_aliases)
            warnings.extend(f"action[{index}] {message}" for message in repair_warnings)

            validator = getattr(self, f"_validate_{action_type}", None)
            if validator is None:
                errors.append(f"action[{index}] unsupported action {action_type}")
                continue
            action_errors = validator(
                action,
                context_nodes=context_nodes,
                context_node_types=context_node_types,
                created_aliases=created_aliases,
                created_node_types=created_node_types,
                llm_wiki_sources=llm_wiki_sources,
                video_authorized=video_authorized,
            )
            if action_errors:
                errors.extend(f"action[{index}] {message}" for message in action_errors)
                continue

            sanitized = self._sanitize_action(action)
            sanitized_actions.append(sanitized)
            if action_type == "create_node":
                self._register_created_aliases(sanitized, created_aliases, created_node_types)

        if errors:
            return self._invalid(errors, warnings=warnings)
        requires_confirmation = False
        for action in sanitized_actions:
            if action.get("type") in {"create_workflow_template", "apply_workflow_template"} | TEAM_TEMPLATE_GOVERNANCE_ACTION_TYPES:
                action["requiresConfirmation"] = True
                action["riskLevel"] = "high"
                if not action.get("scope"):
                    action["scope"] = "project"
                requires_confirmation = True
        return {
            "success": True,
            "valid": True,
            "actions": sanitized_actions,
            "warnings": warnings,
            "errors": [],
            **({"requiresConfirmation": True} if requires_confirmation else {}),
        }

    @staticmethod
    def _invalid(errors, *, warnings=None):
        return {
            "success": True,
            "valid": False,
            "actions": [],
            "warnings": list(warnings or []),
            "errors": list(errors or []),
        }

    @staticmethod
    def _canonical_action_type(action):
        if not isinstance(action, dict):
            return ""
        return str(
            action.get("type")
            or action.get("action")
            or action.get("actionType")
            or action.get("operation")
            or ""
        ).strip()

    @staticmethod
    def _context_node_ids(context):
        nodes = (((context or {}).get("canvas") or {}).get("nodes") or [])
        result = set()
        for node in nodes:
            if isinstance(node, dict):
                node_id = node.get("id") or node.get("nodeId")
                if node_id:
                    result.add(str(node_id))
        return result

    @staticmethod
    def _context_node_types(context):
        nodes = (((context or {}).get("canvas") or {}).get("nodes") or [])
        result = {}
        for node in nodes:
            if isinstance(node, dict):
                node_id = node.get("id") or node.get("nodeId")
                node_type = node.get("nodeType") or node.get("type")
                if node_id and node_type:
                    result[str(node_id)] = str(node_type)
        return result

    @staticmethod
    def _context_has_workflow(context):
        text = str(context or {})
        return "workflowKind" in text or "story_to_video" in text

    @staticmethod
    def _action_workflow_kind(action):
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        patch = action.get("patch") if isinstance(action.get("patch"), dict) else {}
        candidates = (
            action,
            data.get("metadata") if isinstance(data.get("metadata"), dict) else {},
            data,
            action.get("metadata"),
            patch.get("metadata") if isinstance(patch.get("metadata"), dict) else {},
            patch,
        )
        for container in candidates:
            if isinstance(container, dict) and container.get("workflowKind"):
                return str(container.get("workflowKind"))
        return ""

    def _batch_has_workflow_create_nodes(self, actions):
        for action in actions:
            if not isinstance(action, dict):
                continue
            if self._canonical_action_type(action) == "create_node" and self._action_workflow_kind(action):
                return True
        return False

    @staticmethod
    def _is_incomplete_group(action):
        return action.get("type") == "create_group" and not (
            action.get("nodeIds") or action.get("nodes") or action.get("children")
        )

    @staticmethod
    def _is_empty_connect(action):
        if action.get("type") != "connect_nodes":
            return False
        source = action.get("from") or action.get("sourceId") or action.get("source")
        target = action.get("to") or action.get("targetId") or action.get("target")
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        source = source or data.get("from") or data.get("sourceId") or data.get("source")
        target = target or data.get("to") or data.get("targetId") or data.get("target")
        return not source and not target

    def _contains_dangerous(self, value):
        if isinstance(value, dict):
            for key, child in value.items():
                if DANGEROUS_KEY_RE.search(str(key)):
                    return True
                if self._contains_dangerous(child):
                    return True
        elif isinstance(value, list):
            return any(self._contains_dangerous(item) for item in value)
        elif isinstance(value, str):
            return bool(DANGEROUS_VALUE_RE.search(value))
        return False

    @staticmethod
    def _safe_prompt_preset_inputs(inputs):
        if not isinstance(inputs, dict):
            return {}
        result = {}
        for key, value in inputs.items():
            text_key = str(key).strip()
            if not text_key or DANGEROUS_KEY_RE.search(text_key):
                continue
            if isinstance(value, (str, int, float, bool)):
                text_value = str(value) if not isinstance(value, bool) else value
                if isinstance(text_value, str) and DANGEROUS_VALUE_RE.search(text_value):
                    continue
                result[text_key] = value
        return result

    def _pre_sanitize_prompt_preset_generation(self, action):
        next_action = dict(action)
        data = next_action.get("data") if isinstance(next_action.get("data"), dict) else {}
        for field in ("presetId", "presetName", "nodeType", "nodeId"):
            if not next_action.get(field) and data.get(field):
                next_action[field] = data.get(field)
        if not next_action.get("presetId") and data.get("preset"):
            next_action["presetId"] = data.get("preset")
        inputs = next_action.get("inputs")
        if inputs is None:
            inputs = data.get("inputs")
        safe_inputs = self._safe_prompt_preset_inputs(inputs)
        if safe_inputs:
            next_action["inputs"] = safe_inputs
        else:
            next_action.pop("inputs", None)
        if data:
            safe_data = dict(data)
            if "inputs" in safe_data:
                safe_data["inputs"] = safe_inputs
            next_action["data"] = safe_data
        return next_action

    @staticmethod
    def _first_value(action, keys):
        for key in keys:
            if action.get(key):
                return action.get(key)
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        for key in keys:
            if data.get(key):
                return data.get(key)
        return None

    def _repair_action(self, action, created_aliases):
        warnings = []
        action_type = action.get("type")
        if action_type == "create_node":
            if not action.get("nodeType"):
                data = action.get("data") if isinstance(action.get("data"), dict) else {}
                node_type = (
                    action.get("nodeType")
                    or action.get("node_type")
                    or action.get("nodeKind")
                    or action.get("kind")
                    or data.get("nodeType")
                    or data.get("node_type")
                    or data.get("type")
                    or data.get("kind")
                    or data.get("nodeKind")
                )
                if node_type in SAFE_NODE_TYPES:
                    action["nodeType"] = node_type
                    warnings.append("filled missing nodeType from alias")
            if not action.get("nodeId"):
                node_id = action.get("id") or action.get("node_id")
                if node_id:
                    action["nodeId"] = str(node_id)
            if not action.get("name") and action.get("title"):
                action["name"] = action.get("title")
        elif action_type == "connect_nodes":
            source = self._first_value(
                action,
                (
                    "from",
                    "sourceId",
                    "source",
                    "sourceNodeId",
                    "fromNodeId",
                    "source_node_id",
                    "from_node_id",
                    "sourceRef",
                    "fromRef",
                    "sourceNode",
                    "fromNode",
                ),
            )
            target = self._first_value(
                action,
                (
                    "to",
                    "targetId",
                    "target",
                    "targetNodeId",
                    "toNodeId",
                    "target_node_id",
                    "to_node_id",
                    "targetRef",
                    "toRef",
                    "targetNode",
                    "toNode",
                ),
            )
            if source:
                action["from"] = self._resolve_created_alias(str(source), created_aliases)
            if target:
                action["to"] = self._resolve_created_alias(str(target), created_aliases)
            if source or target:
                warnings.append("repaired connect endpoint aliases")
            source_handle = self._first_value(
                action,
                (
                    "sourceHandle",
                    "fromHandle",
                    "sourcePort",
                    "fromPort",
                    "source_handle",
                    "from_handle",
                    "sourceConnector",
                ),
            )
            target_handle = self._first_value(
                action,
                (
                    "targetHandle",
                    "toHandle",
                    "targetPort",
                    "toPort",
                    "target_handle",
                    "to_handle",
                    "targetConnector",
                ),
            )
            if source_handle:
                action["sourceHandle"] = str(source_handle)
            if target_handle:
                action["targetHandle"] = str(target_handle)
        elif action_type in ("layout_nodes", "focus_nodes", "create_group", "duplicate_nodes", "set_viewport"):
            node_ids = action.get("nodeIds") or action.get("nodes") or action.get("children")
            if node_ids:
                action["nodeIds"] = [
                    self._resolve_created_alias(str(node_id), created_aliases)
                    for node_id in node_ids
                ]
        elif action_type in ("queue_generation_task", "run_prompt_preset_generation"):
            node_id = action.get("nodeId") or action.get("targetNodeId")
            if node_id:
                action["nodeId"] = self._resolve_created_alias(str(node_id), created_aliases)
                if not action.get("nodeId") or action.get("targetNodeId"):
                    warnings.append("repaired generation target alias")
            if not action.get("presetId") and action.get("preset"):
                action["presetId"] = action.get("preset")
                warnings.append("repaired preset alias")
        return action, warnings

    @staticmethod
    def _created_action_id_aliases(action_id):
        aliases = {action_id}
        prefixes = ("act_create_node_", "act_create_", "create_node_", "create_")
        for prefix in prefixes:
            if action_id.startswith(prefix):
                value = action_id[len(prefix) :]
                if "_" in value:
                    aliases.add(value)
                for suffix in ("_canvas_node", "_node"):
                    if value.endswith(suffix):
                        aliases.add(value[: -len(suffix)])
        return aliases

    def _register_created_aliases(self, action, created_aliases, created_node_types):
        action_id = str(action.get("id") or action.get("nodeId") or "")
        node_id = str(action.get("nodeId") or action_id)
        node_type = str(action.get("nodeType") or "")
        if not action_id:
            return
        for alias in self._created_action_id_aliases(action_id):
            created_aliases[alias] = action_id
            if node_type:
                created_node_types[alias] = node_type
        created_aliases[node_id] = action_id
        if node_type:
            created_node_types[action_id] = node_type
            created_node_types[node_id] = node_type

    @staticmethod
    def _resolve_created_alias(value, created_aliases):
        return created_aliases.get(value, value)

    @staticmethod
    def _safe_metadata(data):
        if not isinstance(data, dict):
            return {}
        result = {}
        nested_metadata = data.get("metadata")
        if isinstance(nested_metadata, dict):
            result.update(
                {
                    key: value
                    for key, value in nested_metadata.items()
                    if key in WORKFLOW_METADATA_FIELDS
                }
            )
        result.update(
            {
                key: value
                for key, value in data.items()
                if key in WORKFLOW_METADATA_FIELDS
                or key
                in {
                    "prompt",
                    "content",
                    "text",
                    "images",
                    "model",
                    "provider",
                    "source",
                    "conversationId",
                    "messageId",
                    "traceId",
                    "assistantIntent",
                }
            }
        )
        return result

    @staticmethod
    def _safe_variant_descriptors(variants):
        if not isinstance(variants, list):
            return []
        result = []
        allowed = {"id", "label", "name", "difference", "description", "reason"}
        for item in variants[:5]:
            if not isinstance(item, dict):
                continue
            safe_item = {}
            for key in allowed:
                value = item.get(key)
                if isinstance(value, (str, int, float, bool)):
                    text = str(value).strip()
                    if text:
                        safe_item[key] = text
            if safe_item:
                result.append(safe_item)
        return result

    @staticmethod
    def _safe_tags(value):
        if not isinstance(value, list):
            text = str(value or "").strip()
            return [text] if text else []
        result = []
        for item in value[:12]:
            if isinstance(item, (str, int, float, bool)):
                text = str(item).strip()
                if text:
                    result.append(text)
        return result

    @staticmethod
    def _safe_offset(value):
        if not isinstance(value, dict):
            return None
        result = {}
        for key in ("x", "y"):
            try:
                number = float(value.get(key))
            except (TypeError, ValueError):
                continue
            result[key] = int(number) if number.is_integer() else number
        return result if result else None

    def _safe_undo_patch(self, patch):
        if not isinstance(patch, dict):
            return None
        patch_type = str(patch.get("type") or patch.get("action") or "").strip()
        if patch_type not in {"update_node_data", "set_node_prompt"}:
            return None
        node_id = str(patch.get("nodeId") or patch.get("id") or "").strip()
        if not node_id:
            return None
        result = {"type": patch_type, "nodeId": node_id}
        data = patch.get("data") if isinstance(patch.get("data"), dict) else {}
        prompt = patch.get("prompt", data.get("prompt"))
        if isinstance(prompt, (str, int, float, bool)):
            result["data"] = {"prompt": str(prompt)}
        return result

    def _sanitize_action(self, action):
        action_type = action.get("type")
        result = {"type": action_type}
        for field in (
            "schemaVersion",
            "actionId",
            "clientMutationId",
            "riskLevel",
            "requiresConfirmation",
            "autoStart",
            "id",
            "title",
            "name",
            "nodeId",
            "nodeType",
            "from",
            "to",
            "sourceHandle",
            "targetHandle",
            "layout",
            "nodeIds",
            "position",
            "size",
            "prompt",
            "provider",
            "presetId",
            "presetName",
            "template",
            "inputs",
            "variants",
            "branchCount",
            "count",
            "groupBranches",
            "gap",
            "padding",
            "templateId",
            "description",
            "scope",
            "projectId",
            "version",
            "templateVersion",
            "author",
            "tags",
            "teamId",
            "reviewStatus",
            "reviewer",
            "reviewedBy",
            "reviewDecision",
            "reviewComment",
            "reviewNote",
            "reviewRequestedBy",
            "publishedBy",
            "deprecatedReason",
            "reason",
            "userId",
            "consumerProjectId",
            "reuseCount",
            "deprecated",
            "rollbackOf",
            "rollbackToVersion",
            "agentRole",
            "agentTaskId",
            "agentHandoffFrom",
            "agentHandoffTo",
            "agentPermissions",
            "offset",
            "offsetX",
            "offsetY",
            "previousPrompt",
            "nextPrompt",
            "promptDiff",
            "undoPatch",
            "metadata",
            "data",
            "placement",
        ):
            if field not in action:
                continue
            if field == "placement":
                placement = self._safe_placement(action.get(field))
                if placement:
                    result[field] = placement
            elif field in ("data", "metadata"):
                result[field] = self._safe_metadata(action.get(field))
            elif field == "variants":
                result[field] = self._safe_variant_descriptors(action.get(field))
            elif field == "tags":
                tags = self._safe_tags(action.get(field))
                if tags:
                    result[field] = tags
            elif field == "offset":
                offset = self._safe_offset(action.get(field))
                if offset:
                    result[field] = offset
            elif field == "agentPermissions":
                result[field] = [
                    str(item).strip()
                    for item in action.get(field)
                    if isinstance(item, (str, int, float, bool)) and str(item).strip()
                ][:12] if isinstance(action.get(field), list) else []
            elif field == "undoPatch":
                undo_patch = self._safe_undo_patch(action.get(field))
                if undo_patch:
                    result[field] = undo_patch
            elif field in PROMPT_SURGERY_FIELDS:
                result[field] = str(action.get(field))
            else:
                result[field] = copy.deepcopy(action.get(field))
        return result

    # canvas-spatial placement directive (semantic, never pixels):
    # whitelist of strategies + safe string subfields. Anything else -
    # including raw coordinates - is dropped fail-closed; the placement
    # resolver owns pixel math.
    _PLACEMENT_STRATEGIES = (
        "below",
        "above",
        "left-of",
        "right-of",
        "near",
        "in-zone",
        "new-lane",
        "append-lane",
    )

    _TIDY_SCOPE_PATTERN = re.compile(r"^(all|zone:[a-z-]+|lane:r\d+|cluster:[\w-]+)$")

    def _validate_tidy_canvas(self, action, **_kwargs):
        scope = action.get("scope", "all")
        if not isinstance(scope, str) or not self._TIDY_SCOPE_PATTERN.match(scope):
            return [f"invalid tidy_canvas scope {scope!r}"]
        return []

    def _safe_placement(self, value):
        if not isinstance(value, dict):
            return None
        strategy = value.get("strategy")
        if strategy not in self._PLACEMENT_STRATEGIES:
            return None
        result = {"strategy": strategy}
        for key in ("anchor", "zone", "lane", "topic"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                result[key] = item.strip()[:120]
        return result

    def _node_ref_errors(self, value, context_nodes, created_aliases):
        if not context_nodes:
            return []
        if value in context_nodes or value in created_aliases.values() or value in created_aliases:
            return []
        return [f"unknown node reference {value}"]

    def _validate_create_node(self, action, **_kwargs):
        errors = []
        if action.get("nodeType") not in SAFE_NODE_TYPES:
            errors.append(f"unsupported nodeType {action.get('nodeType') or '<missing>'}")
        errors.extend(self._validate_llm_wiki_source_scope(action, _kwargs.get("llm_wiki_sources") or []))
        return errors

    @staticmethod
    def _llm_wiki_container(context):
        knowledge = (context or {}).get("knowledge")
        if not isinstance(knowledge, dict):
            return {}
        llm_wiki = knowledge.get("llmWiki") or knowledge.get("llm_wiki")
        return llm_wiki if isinstance(llm_wiki, dict) else {}

    @staticmethod
    def _source_text(container, *keys):
        if not isinstance(container, dict):
            return ""
        for key in keys:
            value = container.get(key)
            if value is not None:
                text = str(value).strip()
                if text:
                    return text
        return ""

    def _source_record_from(self, item):
        if not isinstance(item, dict):
            return None
        data = item.get("data") if isinstance(item.get("data"), dict) else {}
        merged = {}
        merged.update(data)
        merged.update(item)
        title = self._source_text(merged, "sourceTitle", "sourceName", "knowledgeTitle", "title", "name")
        file_id = self._source_text(merged, "fileId", "sourceFileId", "knowledgeFileId")
        project_id = self._source_text(
            merged,
            "projectId",
            "sourceProjectId",
            "knowledgeProjectId",
            "citationProjectId",
        )
        citation = self._source_text(merged, "citation")
        citation_display = self._source_text(merged, "citationDisplay")
        if not (title or file_id or project_id or citation or citation_display):
            return None
        return {
            "title": title,
            "fileId": file_id,
            "projectId": project_id,
            "citation": citation,
            "citationDisplay": citation_display,
        }

    def _llm_wiki_source_scope(self, context):
        llm_wiki = self._llm_wiki_container(context)
        if not llm_wiki:
            return []
        candidates = []
        for key in ("searchResults", "results", "canvasActionHints", "actionHints"):
            value = llm_wiki.get(key)
            if isinstance(value, list):
                candidates.extend(value)
        last_search = llm_wiki.get("lastSearch")
        if isinstance(last_search, dict) and isinstance(last_search.get("results"), list):
            candidates.extend(last_search.get("results"))
        records = []
        for item in candidates:
            record = self._source_record_from(item)
            if record:
                records.append(record)
        return records

    @staticmethod
    def _source_claim_present(record):
        return any(record.get(key) for key in ("title", "fileId", "projectId", "citation", "citationDisplay"))

    @staticmethod
    def _source_claim_matches(claim, allowed):
        for key in ("fileId", "projectId", "citation", "citationDisplay", "title"):
            if claim.get(key) and allowed.get(key) and claim.get(key) != allowed.get(key):
                return False
        for key in ("fileId", "projectId", "citation", "citationDisplay", "title"):
            if claim.get(key) and allowed.get(key) == claim.get(key):
                return True
        return False

    def _validate_llm_wiki_source_scope(self, action, source_scope):
        if not source_scope:
            return []
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        claim = self._source_record_from(data) or self._source_record_from(action)
        if not claim or not self._source_claim_present(claim):
            return []
        workflow_kind = str(data.get("workflowKind") or action.get("workflowKind") or "").strip()
        citation_kind = str(data.get("citationKind") or action.get("citationKind") or "").strip()
        if workflow_kind != "knowledge_card" and citation_kind != "llm_wiki":
            return []
        if any(self._source_claim_matches(claim, allowed) for allowed in source_scope):
            return []
        return ["LLM Wiki source metadata is outside current context"]

    def _validate_connect_nodes(self, action, context_nodes, created_aliases, **_kwargs):
        errors = []
        if not action.get("from"):
            errors.append("missing required field from/sourceId")
        if not action.get("to"):
            errors.append("missing required field to/targetId")
        for key in ("from", "to"):
            if action.get(key):
                errors.extend(self._node_ref_errors(action.get(key), context_nodes, created_aliases))
        return errors

    def _validate_layout_nodes(self, action, context_nodes, created_aliases, **_kwargs):
        errors = []
        if action.get("layout") not in SAFE_LAYOUTS:
            errors.append(f"unsupported layout {action.get('layout')}")
        node_ids = action.get("nodeIds")
        if not isinstance(node_ids, list) or not node_ids:
            errors.append("missing required field nodeIds")
        else:
            for node_id in node_ids:
                errors.extend(self._node_ref_errors(node_id, context_nodes, created_aliases))
        return errors

    def _validate_focus_nodes(self, action, context_nodes, created_aliases, **_kwargs):
        node_ids = action.get("nodeIds")
        if not isinstance(node_ids, list) or not node_ids:
            return ["missing required field nodeIds"]
        errors = []
        for node_id in node_ids:
            errors.extend(self._node_ref_errors(node_id, context_nodes, created_aliases))
        return errors

    _validate_move_nodes = _validate_focus_nodes
    _validate_duplicate_nodes = _validate_focus_nodes

    def _validate_create_group(self, action, context_nodes, created_aliases, **_kwargs):
        return self._validate_focus_nodes(action, context_nodes, created_aliases)

    def _validate_queue_generation_task(self, action, context_nodes, created_aliases, video_authorized=False, **_kwargs):
        errors = []
        node_id = action.get("nodeId")
        if not node_id:
            errors.append("missing required field nodeId")
        else:
            errors.extend(self._node_ref_errors(node_id, context_nodes, created_aliases))
        node_type = self._generation_node_type(
            action,
            context_node_types=_kwargs.get("context_node_types") or {},
            created_node_types=_kwargs.get("created_node_types") or {},
        )
        if node_type == "ai-video" and not video_authorized:
            errors.append("video generation requires confirmation")
        return errors

    def _validate_run_prompt_preset_generation(self, action, context_nodes, created_aliases, video_authorized=False, **_kwargs):
        errors = self._validate_queue_generation_task(
            action,
            context_nodes,
            created_aliases,
            video_authorized=video_authorized,
            **_kwargs,
        )
        if not (action.get("presetId") or action.get("presetName")):
            errors.append("missing required field presetId")
        return errors

    @staticmethod
    def _generation_node_type(action, *, context_node_types, created_node_types):
        data = action.get("data") if isinstance(action.get("data"), dict) else {}
        explicit = action.get("nodeType") or data.get("nodeType") or data.get("type")
        if explicit:
            return str(explicit)
        node_id = str(action.get("nodeId") or "")
        return created_node_types.get(node_id) or context_node_types.get(node_id) or ""

    def _validate_update_node_data(self, action, context_nodes, created_aliases, **_kwargs):
        node_id = action.get("nodeId")
        if not node_id:
            return ["missing required field nodeId"]
        return self._node_ref_errors(node_id, context_nodes, created_aliases)

    _validate_rename_node = _validate_update_node_data

    def _validate_create_workflow_template(self, action, **_kwargs):
        if not action.get("name"):
            return ["missing required field name"]
        node_ids = action.get("nodeIds") or action.get("nodes")
        if not node_ids:
            return ["missing required field nodes/nodeIds"]
        errors = []
        for node_id in node_ids if isinstance(node_ids, list) else []:
            errors.extend(self._node_ref_errors(node_id, _kwargs.get("context_nodes") or set(), _kwargs.get("created_aliases") or {}))
        scope = str(action.get("scope") or "project").strip()
        if scope and scope != "project":
            errors.append("workflow template scope must be project")
        return errors

    def _validate_apply_workflow_template(self, action, **_kwargs):
        if not action.get("templateId"):
            return ["missing required field templateId"]
        scope = str(action.get("scope") or "project").strip()
        if scope and scope != "project":
            return ["workflow template scope must be project"]
        return []

    def _validate_submit_workflow_template_review(self, action, **_kwargs):
        if not action.get("templateId"):
            return ["missing required field templateId"]
        return []

    def _validate_review_workflow_template(self, action, **_kwargs):
        if not action.get("templateId"):
            return ["missing required field templateId"]
        return []

    @staticmethod
    def _validate_team_template_governance(action):
        errors = []
        if not action.get("templateId"):
            errors.append("missing required field templateId")
        scope = str(action.get("scope") or "").strip()
        if scope != "team":
            errors.append("team workflow template governance requires team scope")
        if not action.get("teamId"):
            errors.append("missing required field teamId")
        return errors

    def _validate_publish_workflow_template(self, action, **_kwargs):
        return self._validate_team_template_governance(action)

    def _validate_deprecate_workflow_template(self, action, **_kwargs):
        return self._validate_team_template_governance(action)

    def _validate_record_workflow_template_reuse(self, action, **_kwargs):
        return self._validate_team_template_governance(action)

    def _validate_rollback_workflow_template(self, action, **_kwargs):
        errors = self._validate_team_template_governance(action)
        if not (action.get("rollbackToVersion") or action.get("toVersion")):
            errors.append("missing required field rollbackToVersion")
        return errors
