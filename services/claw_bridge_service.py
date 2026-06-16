import json
import re
import subprocess

from services.claw_action_schema import ClawActionSchema
from services.claw_skill_registry_service import ClawSkillRegistryService


class ClawBridgeService:
    MAX_PROMPT_ARGUMENT_CHARS = 24000
    DEFAULT_TIMEOUT_SECONDS = 900
    SECRET_FIELD_PATTERN = re.compile(
        r"(api|secret|token|key|password|credential|localpath|filepath|path)",
        re.I,
    )

    def __init__(
        self,
        *,
        runtime_service,
        command_runner=None,
        action_schema=None,
        skill_registry=None,
        timeout_seconds=None,
    ):
        self._runtime_service = runtime_service
        self._command_runner = command_runner or subprocess.run
        self._action_schema = action_schema or ClawActionSchema()
        self._skill_registry = skill_registry or ClawSkillRegistryService()
        self._timeout_seconds = timeout_seconds or self.DEFAULT_TIMEOUT_SECONDS

    def _action_protocol(self, *, compact=False):
        story = (
            "story_to_video: when the user asks for a story short, story video, "
            "15 second short, or turning a story into video, create one "
            "story_outline ai-text node, one style_bible ai-text node, multiple "
            "shot_script ai-text nodes, matching shot_keyframe ai-image nodes, "
            "and matching shot_video ai-video prep nodes. Each shot must keep "
            "workflowKind, workflowGroupId, workflowStep, shotIndex, "
            "shotDurationSec, shotPrompt, and shotVideoPrompt. Text and image "
            "generation may be queued automatically. Video generation must wait "
            "for explicit user authorization."
        )
        if compact:
            return {
                "format": "return JSON with reply/actions/warnings/requiresConfirmation",
                "story_to_video": story,
                "allowedActions": [
                    "create_node",
                    "connect_nodes",
                    "layout_nodes",
                    "queue_generation_task",
                    "run_prompt_preset_generation",
                    "focus_nodes",
                ],
            }
        return {
            "responseContract": {
                "reply": "string",
                "actions": "array",
                "warnings": "array",
                "requiresConfirmation": "boolean",
            },
            "storyToVideoRules": story,
            "generationPermission": (
                "text/image may auto-run; video queue requires explicit authorization"
            ),
            "videoBoundaryZh": "视频生成必须等待用户明确授权",
            "safeLayouts": [
                "horizontal",
                "vertical",
                "grid",
                "single_chain",
                "branch_flow",
                "storyboard_grid",
            ],
        }

    def _build_prompt_payload(
        self,
        *,
        message,
        context=None,
        compact_protocol=False,
        compact_skills=False,
    ):
        context = context if isinstance(context, dict) else {}
        assistant_skills = (
            self._skill_registry.match(message, context, compact=compact_skills)
            if self._skill_registry
            else {"applied": False, "items": []}
        )
        return {
            "message": str(message or ""),
            "context": context,
            "assistantSkills": assistant_skills,
            "actionProtocol": self._action_protocol(compact=compact_protocol),
        }

    def _build_prompt_argument(self, message, context=None):
        payload = self._build_prompt_payload(message=message, context=context)
        text = json.dumps(payload, ensure_ascii=False)
        if len(text) <= self.MAX_PROMPT_ARGUMENT_CHARS:
            return text
        compact = self._build_prompt_payload(
            message=message,
            context=context,
            compact_protocol=True,
            compact_skills=True,
        )
        return json.dumps(compact, ensure_ascii=False)

    def _build_command(self, message, context=None):
        spec = self._runtime_service.build_launch_spec()
        command = list(spec.get("command") or [])
        command.append(self._build_prompt_argument(message, context))
        return spec, command

    def chat(self, *, message, context=None, conversation_id=None):
        spec, command = self._build_command(message, context)
        try:
            completed = self._command_runner(
                command,
                cwd=spec.get("cwd"),
                env=spec.get("env"),
                capture_output=True,
                text=True,
                timeout=self._timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "errorCode": "claw_timeout",
                "reply": "Claw Code assistant timed out.",
                "actions": [],
                "warnings": [],
                "requiresConfirmation": False,
            }

        if getattr(completed, "returncode", 0) != 0:
            return {
                "success": False,
                "errorCode": "claw_runtime_failed",
                "reply": (
                    getattr(completed, "stderr", "") or "Claw Code assistant failed."
                ).strip(),
                "actions": [],
                "warnings": [],
                "requiresConfirmation": False,
            }
        parsed = self.parse_claw_output(getattr(completed, "stdout", "") or "")
        if parsed.get("actions"):
            validation = self._action_schema.validate_actions(
                parsed["actions"],
                context=context,
            )
            if not validation.get("valid"):
                return {
                    "success": False,
                    "errorCode": "invalid_actions",
                    "reply": "Assistant actions did not pass safety validation.",
                    "actions": [],
                    "warnings": validation.get("warnings", []),
                    "errors": validation.get("errors", []),
                    "requiresConfirmation": False,
                }
            parsed["actions"] = validation.get("actions", [])
            parsed["warnings"] = list(parsed.get("warnings") or []) + list(
                validation.get("warnings") or []
            )
        return parsed

    @staticmethod
    def _parse_json_payload(raw):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, re.S | re.I)
        if fence_match:
            try:
                return json.loads(fence_match.group(1).strip())
            except json.JSONDecodeError:
                pass

        decoder = json.JSONDecoder()
        for index, char in enumerate(raw):
            if char not in "{[":
                continue
            try:
                value, _end = decoder.raw_decode(raw[index:])
            except json.JSONDecodeError:
                continue
            return value
        return None

    @classmethod
    def parse_claw_output(cls, output):
        raw = str(output or "").strip()
        if not raw:
            return {
                "success": True,
                "reply": "",
                "actions": [],
                "warnings": [],
                "requiresConfirmation": False,
            }
        data = cls._parse_json_payload(raw)
        if data is None:
            return {
                "success": True,
                "reply": raw,
                "actions": [],
                "warnings": [],
                "requiresConfirmation": False,
            }
        if isinstance(data, dict) and isinstance(data.get("message"), str):
            nested = cls._parse_json_payload(data["message"].strip())
            if isinstance(nested, dict):
                data = nested
            else:
                data = {"reply": data.get("message")}
        if not isinstance(data, dict):
            data = {"reply": str(data)}
        result = {
            "success": bool(data.get("success", True)),
            "reply": str(data.get("reply") or data.get("message") or ""),
            "actions": data.get("actions") if isinstance(data.get("actions"), list) else [],
            "warnings": data.get("warnings") if isinstance(data.get("warnings"), list) else [],
            "requiresConfirmation": bool(data.get("requiresConfirmation")),
        }
        result.update(cls._contract_v2_fields(data))
        return result

    @classmethod
    def _contract_v2_fields(cls, data):
        if not isinstance(data, dict):
            return {}
        result = {}
        intent = cls._sanitize_intent(data.get("intent"))
        if intent:
            result["intent"] = intent
        if isinstance(data.get("plan"), dict):
            result["plan"] = cls._sanitize_contract_object(data.get("plan"))
        if isinstance(data.get("actionsByStep"), dict):
            result["actionsByStep"] = cls._sanitize_actions_by_step(data.get("actionsByStep"))
        if isinstance(data.get("execution"), dict):
            result["execution"] = cls._sanitize_contract_object(data.get("execution"))
        if isinstance(data.get("developer"), dict):
            result["developer"] = cls._sanitize_contract_object(data.get("developer"))
        return result

    @classmethod
    def _sanitize_contract_object(cls, value, depth=0):
        if not isinstance(value, dict) or depth > 5:
            return {}
        sanitized = {}
        for key, item in value.items():
            key_text = str(key or "")
            if cls.SECRET_FIELD_PATTERN.search(key_text):
                continue
            if isinstance(item, dict):
                sanitized[key_text] = cls._sanitize_contract_object(item, depth + 1)
            elif isinstance(item, list):
                sanitized[key_text] = [
                    cls._sanitize_contract_object(entry, depth + 1)
                    if isinstance(entry, dict)
                    else entry
                    for entry in item
                ]
            elif isinstance(item, str) and re.match(r"^[A-Za-z]:\\", item):
                continue
            else:
                sanitized[key_text] = item
        return sanitized

    @classmethod
    def _sanitize_intent(cls, intent):
        if not isinstance(intent, dict):
            return None
        intent_id = str(intent.get("id") or "").strip()
        if not intent_id:
            return None
        sanitized = cls._sanitize_contract_object(intent)
        sanitized["id"] = intent_id
        if isinstance(intent.get("matchedSkills"), list):
            sanitized["matchedSkills"] = [
                str(item or "").strip()
                for item in intent.get("matchedSkills")
                if str(item or "").strip()
            ]
        return sanitized

    @classmethod
    def _sanitize_actions_by_step(cls, actions_by_step):
        sanitized = {}
        for step_id, actions in actions_by_step.items():
            step_key = str(step_id or "").strip()
            if not step_key:
                continue
            if not isinstance(actions, list):
                sanitized[step_key] = []
                continue
            sanitized[step_key] = [
                cls._sanitize_contract_object(action)
                for action in actions
                if isinstance(action, dict)
            ]
        return sanitized
