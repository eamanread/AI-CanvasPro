from services.claw_action_schema import ClawActionSchema


class CanvasAgentActionSchema(ClawActionSchema):
    """Neutral canvas-agent schema wrapper around the restored Claw schema."""

    _FORBIDDEN_TYPES = {
        "run_shell",
        "execute_shell",
        "write_file",
        "read_file",
        "delete_file",
        "move_file",
    }
    _FORBIDDEN_ACTION_TERMS = (
        "shell",
        "bash",
        "powershell",
        "file",
        "browser",
        "mcp",
        "package",
    )
    _AUTO_LAYOUT_ALLOWED_TYPES = {
        "layout_nodes",
        "move_nodes",
        "create_group",
        "rename_node",
        "focus_nodes",
        "set_viewport",
    }

    _SKILL_DIR = "config/assistant-skills-v2"

    def _skill_constraints_for(self, matched_skills):
        import json
        import os

        constraints = []
        skill_dir = getattr(self, "_skill_dir", self._SKILL_DIR)
        for skill_id in matched_skills or []:
            safe_id = str(skill_id or "").strip()
            if not safe_id or "/" in safe_id or "\\" in safe_id or ".." in safe_id:
                continue
            path = os.path.join(skill_dir, safe_id, "skill.json")
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
            except (OSError, ValueError):
                continue
            if isinstance(data, dict):
                constraints.append({
                    "id": safe_id,
                    "allowed": [str(a) for a in data.get("allowedActions") or [] if str(a).strip()],
                    "forbidden": [str(a) for a in data.get("forbiddenActions") or [] if str(a).strip()],
                })
        return constraints

    def _skill_violations(self, actions, matched_skills):
        constraints = self._skill_constraints_for(matched_skills)
        if not constraints:
            return []
        allowed_union = set()
        forbidden = set()
        has_allowed = False
        for entry in constraints:
            if entry["allowed"]:
                has_allowed = True
                allowed_union.update(entry["allowed"])
            forbidden.update(entry["forbidden"])
        errors = []
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                continue
            action_type = str(action.get("type") or action.get("action") or "").strip()
            if not action_type:
                continue
            if action_type in forbidden:
                errors.append(f"action[{index}] {action_type} is forbidden by matched skill constraints")
            elif has_allowed and action_type not in allowed_union:
                errors.append(f"action[{index}] {action_type} is outside the allowedActions of matched skills")
        return errors

    def validate_actions(self, actions, context=None, *, video_authorized=False, matched_skills=None):
        if not isinstance(actions, list):
            return self._invalid(["actions must be a list"])

        skill_errors = self._skill_violations(actions, matched_skills)
        if skill_errors:
            result = self._invalid(skill_errors)
            result["blockedBySkill"] = True
            return result

        forbidden_errors = []
        prepared = []
        type_by_index = {}
        auto_layout_intent = self._is_auto_layout_context(context)
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                prepared.append(action)
                continue
            if self._has_forbidden_action_name(action):
                forbidden_errors.append(f"action[{index}] forbidden action requested by canvas agent")
                continue
            action_type = str(
                action.get("type")
                or action.get("action")
                or action.get("actionType")
                or action.get("operation")
                or ""
            ).strip()
            if action_type in self._FORBIDDEN_TYPES:
                forbidden_errors.append(f"action[{index}] forbidden action {action_type}")
                continue
            policy_type = self._policy_action_type(action_type)
            if auto_layout_intent and self._is_auto_layout_forbidden(policy_type):
                forbidden_errors.append(f"action[{index}] auto_layout forbids {action_type or '<missing>'}")
                continue
            if action_type == "update_node":
                next_action = dict(action)
                next_action["type"] = "update_node_data"
                prepared.append(next_action)
                type_by_index[len(prepared) - 1] = "update_node"
                continue
            if action_type == "start_generation":
                next_action = dict(action)
                next_action["type"] = "queue_generation_task"
                prepared.append(next_action)
                type_by_index[len(prepared) - 1] = "start_generation"
                continue
            prepared.append(action)

        if forbidden_errors:
            return self._invalid(forbidden_errors)

        # start_generation is a proposal-level action. Video starts are valid but
        # must be strong-confirmed before the executor can actually run them.
        parent_video_authorized = bool(video_authorized or any(
            type_by_index.get(index) == "start_generation"
            for index in range(len(prepared))
        ))
        result = super().validate_actions(
            prepared,
            context=context,
            video_authorized=parent_video_authorized,
        )
        if not result.get("valid"):
            return result

        sanitized_actions = []
        requires_confirmation = bool(result.get("requiresConfirmation"))
        for index, action in enumerate(result.get("actions") or []):
            restored = dict(action)
            original_type = type_by_index.get(index)
            if original_type:
                restored["type"] = original_type
            if original_type == "start_generation":
                node_type = str(restored.get("nodeType") or ((restored.get("data") or {}).get("nodeType") if isinstance(restored.get("data"), dict) else "") or "")
                if node_type == "ai-video":
                    restored["requiresConfirmation"] = True
                    restored["riskLevel"] = "high"
                    requires_confirmation = True
            sanitized_actions.append(restored)

        next_result = dict(result)
        next_result["actions"] = sanitized_actions
        if requires_confirmation:
            next_result["requiresConfirmation"] = True
        return next_result

    @staticmethod
    def _is_auto_layout_context(context):
        intent = (context or {}).get("assistantIntent") or (((context or {}).get("context") or {}).get("assistantIntent"))
        if not isinstance(intent, dict):
            return False
        return str(intent.get("id") or "").strip().lower() == "auto_layout"

    @classmethod
    def _policy_action_type(cls, action_type):
        if action_type == "update_node":
            return "update_node_data"
        if action_type == "start_generation":
            return "queue_generation_task"
        return str(action_type or "").strip()

    @classmethod
    def _is_auto_layout_forbidden(cls, action_type):
        text = str(action_type or "").strip()
        if not text:
            return True
        if text.startswith("delete"):
            return True
        return text not in cls._AUTO_LAYOUT_ALLOWED_TYPES

    def _validate_set_viewport(self, action, context_nodes, created_aliases, **_kwargs):
        node_ids = action.get("nodeIds")
        if not node_ids:
            return []
        return self._validate_focus_nodes(action, context_nodes, created_aliases)

    @classmethod
    def _has_forbidden_action_name(cls, action):
        candidates = (
            action.get("type"),
            action.get("action"),
            action.get("actionType"),
            action.get("operation"),
            action.get("tool"),
            action.get("toolName"),
        )
        for candidate in candidates:
            text = str(candidate or "").strip().lower()
            if not text:
                continue
            if text in cls._FORBIDDEN_TYPES:
                return True
            if any(term in text for term in cls._FORBIDDEN_ACTION_TERMS):
                return True
        return False
