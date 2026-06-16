import json
import copy
import inspect
import re
import subprocess
import time
import uuid


class PiBridgeService:
    DEFAULT_TIMEOUT_SECONDS = 120
    MAX_WARNING_LENGTH = 500
    _OPENAI_KEY_PREFIX = "s" + "k-"
    _REDACTION_PATTERNS = (
        (re.compile(r"\b" + re.escape(_OPENAI_KEY_PREFIX) + r"[A-Za-z0-9_-]+"), _OPENAI_KEY_PREFIX + "[REDACTED]"),
        (re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE), "Bearer [REDACTED]"),
        (re.compile(r"\b[A-Za-z]:\\[^\s\"'<>|]+"), "[REDACTED_PATH]"),
        (
            re.compile(
                r"((?:[\"']?\b(?:apiKey|api_key|OPENAI_API_KEY|token|authorization|password|proxyToken)\b[\"']?)\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s&;,'\")]+)",
                re.IGNORECASE,
            ),
            r"\1[REDACTED]",
        ),
    )

    def __init__(
        self,
        runtime_service,
        provider_config_getter=None,
        command_runner=None,
        timeout_seconds=None,
        action_schema=None,
    ):
        self._runtime_service = runtime_service
        self._provider_config_getter = provider_config_getter or (lambda: None)
        self._command_runner = command_runner or subprocess.run
        self._timeout_seconds = (
            self.DEFAULT_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
        )
        self._action_schema = action_schema

    def chat(self, message, context=None, conversation_id=None, mode="replyOnly", model=None):
        request = self._build_request(
            message=message,
            context=context,
            conversation_id=conversation_id,
            mode=mode,
            model=model,
        )
        completed = self._run_sidecar(request)
        if isinstance(completed, dict):
            return completed

        if getattr(completed, "returncode", 0) != 0:
            stderr = (getattr(completed, "stderr", "") or "").strip()
            return self._error(
                "pi_runtime_failed",
                "Pi canvas agent failed before producing a response.",
                warnings=[stderr] if stderr else [],
            )

        response = self._parse_first_response_line(getattr(completed, "stdout", "") or "")
        if not isinstance(response, dict):
            return self._error(
                "pi_invalid_response",
                "Pi canvas agent returned an invalid response.",
            )
        if response.get("id") != request["id"]:
            return self._error(
                "pi_response_mismatch",
                "Pi canvas agent returned a response for a different request.",
            )
        if "success" in response and not isinstance(response.get("success"), bool):
            return self._error(
                "pi_invalid_response",
                "Pi canvas agent returned an invalid response.",
            )
        sanitized = self._sanitize_response(response)
        return self._validate_response_actions(sanitized, context=request["context"])

    def chat_stream(self, message, context=None, conversation_id=None, mode="actions", model=None):
        request = self._build_request(
            message=message,
            context=context,
            conversation_id=conversation_id,
            mode=mode,
            model=model,
            stream=True,
        )
        completed = self._run_sidecar(request)
        if isinstance(completed, dict):
            yield self._error_frame(completed.get("errorCode"), completed.get("reply"), completed.get("warnings"))
            return

        if getattr(completed, "returncode", 0) != 0:
            stderr = (getattr(completed, "stderr", "") or "").strip()
            error = self._error(
                "pi_runtime_failed",
                "Pi canvas agent failed before producing a response.",
                warnings=[stderr] if stderr else [],
            )
            yield self._error_frame(error.get("errorCode"), error.get("reply"), error.get("warnings"))
            return

        final_seen = False
        for line in str(getattr(completed, "stdout", "") or "").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                yield self._error_frame("pi_invalid_response", "Pi canvas agent returned an invalid stream frame.")
                return
            if not isinstance(frame, dict):
                yield self._error_frame("pi_invalid_response", "Pi canvas agent returned an invalid stream frame.")
                return
            if frame.get("id") not in (None, request["id"]):
                yield self._error_frame("pi_response_mismatch", "Pi canvas agent returned a response for a different request.")
                return

            frame_type = frame.get("type")
            if frame_type == "message.delta":
                sanitized = self._stream_base(frame, "message.delta")
                sanitized["delta"] = str(frame.get("delta") or "")
                yield sanitized
                continue
            if frame_type == "message.start":
                yield self._stream_base(frame, "message.start")
                continue
            if frame_type == "tool.status":
                sanitized = self._stream_base(frame, "tool.status")
                sanitized["message"] = self._redact_warning(str(frame.get("message") or ""))
                yield sanitized
                continue
            if frame_type == "warning":
                sanitized = self._stream_base(frame, "warning")
                sanitized["message"] = self._redact_warning(str(frame.get("message") or frame.get("warning") or ""))
                yield sanitized
                continue
            if frame_type == "error":
                yield self._error_frame(frame.get("errorCode"), frame.get("message") or frame.get("error"))
                return
            if frame_type == "response":
                final_seen = True
                yield from self._response_frame_to_stream_frames(frame, request)
                return
            if frame_type == "message.done":
                final_seen = True
                response = self._sanitize_response(
                    {
                        "success": True,
                        "reply": frame.get("reply"),
                        "intent": frame.get("intent"),
                        "plan": frame.get("plan"),
                        "actionsByStep": frame.get("actionsByStep"),
                        "execution": frame.get("execution"),
                        "developer": frame.get("developer"),
                        "actions": frame.get("actions"),
                        "warnings": frame.get("warnings"),
                        "requiresConfirmation": frame.get("requiresConfirmation"),
                    }
                )
                validated = self._validate_response_actions(response, context=request["context"])
                if validated.get("success") is False:
                    yield self._error_frame(
                        validated.get("errorCode"),
                        validated.get("reply"),
                        validated.get("warnings"),
                    )
                    return
                sanitized = self._stream_base(frame, "message.done")
                sanitized["reply"] = validated.get("reply") or ""
                sanitized["actions"] = validated.get("actions") or []
                self._copy_contract_v2_fields(validated, sanitized)
                sanitized["warnings"] = validated.get("warnings") or []
                sanitized["requiresConfirmation"] = bool(validated.get("requiresConfirmation"))
                yield sanitized
                continue

            yield self._error_frame("pi_invalid_response", "Pi canvas agent returned an unsupported stream frame.")
            return

        if not final_seen:
            yield self._error_frame("pi_stream_incomplete", "Pi canvas agent stream ended before message.done.")

    def _run_sidecar(self, request):
        try:
            provider_config = self._provider_config_for_request(request)
            spec = self._runtime_service.build_launch_spec(provider_config)
            command = list(spec.get("command") or [])
            if not command:
                return self._error(
                    "pi_bridge_failed",
                    "Pi canvas agent failed before producing a response.",
                    warnings=["Pi launch command is empty."],
                )
            return self._command_runner(
                command,
                input=json.dumps(request, ensure_ascii=False) + "\n",
                cwd=spec.get("cwd"),
                env=spec.get("env"),
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=self._timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return self._error(
                "pi_timeout",
                "Pi canvas agent timed out.",
            )
        except Exception as exc:
            return self._error(
                "pi_bridge_failed",
                "Pi canvas agent failed before producing a response.",
                warnings=[str(exc)],
            )

    def _provider_config_for_request(self, request):
        model = request.get("model") if isinstance(request, dict) else None
        getter = self._provider_config_getter
        try:
            signature = inspect.signature(getter)
            accepts_model = any(
                param.kind == inspect.Parameter.VAR_POSITIONAL
                or param.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
                for param in signature.parameters.values()
            )
        except (TypeError, ValueError):
            accepts_model = False
        if accepts_model:
            return getter(model)
        return getter()

    @classmethod
    def _build_request(cls, *, message, context=None, conversation_id=None, mode="replyOnly", model=None, stream=False):
        request = {
            "id": cls._request_id(),
            "type": "chat",
            "conversationId": conversation_id or "default",
            "mode": mode,
            "message": str(message),
            "context": copy.deepcopy(context) if isinstance(context, dict) else {},
        }
        sanitized_model = cls._sanitize_model_reference(model)
        if sanitized_model:
            request["model"] = sanitized_model
        if stream:
            request["stream"] = True
        return request

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
    def _request_id():
        return "pi-%d-%s" % (time.time_ns(), uuid.uuid4().hex[:8])

    @staticmethod
    def _parse_first_response_line(stdout):
        for line in str(stdout or "").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                return None
        return None

    @staticmethod
    def _sanitize_response(response):
        sanitized = {
            "success": response.get("success") if isinstance(response.get("success"), bool) else True,
            "actions": PiBridgeService._sanitize_actions(response.get("actions")),
            "warnings": PiBridgeService._sanitize_warnings(response.get("warnings")),
            "requiresConfirmation": bool(response.get("requiresConfirmation")),
        }
        if isinstance(response.get("reply"), str):
            sanitized["reply"] = response.get("reply")
        if isinstance(response.get("errorCode"), str):
            sanitized["errorCode"] = response.get("errorCode")
        sanitized.update(PiBridgeService._contract_v2_fields(response))
        return sanitized

    @classmethod
    def _contract_v2_fields(cls, response):
        if not isinstance(response, dict):
            return {}
        fields = {}
        intent = cls._sanitize_intent(response.get("intent"))
        if intent:
            fields["intent"] = intent
        if isinstance(response.get("plan"), dict):
            fields["plan"] = cls._sanitize_contract_object(response.get("plan"))
        if isinstance(response.get("actionsByStep"), dict):
            fields["actionsByStep"] = cls._sanitize_actions_by_step(response.get("actionsByStep"))
        if isinstance(response.get("execution"), dict):
            fields["execution"] = cls._sanitize_contract_object(response.get("execution"))
        if isinstance(response.get("developer"), dict):
            fields["developer"] = cls._sanitize_contract_object(response.get("developer"))
        return fields

    @classmethod
    def _sanitize_contract_object(cls, value, depth=0):
        if not isinstance(value, dict) or depth > 5:
            return {}
        sanitized = {}
        for key, item in value.items():
            key_text = str(key or "")
            if re.search(r"(api|secret|token|key|password|credential|localpath|filepath|path)", key_text, re.I):
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
            sanitized[step_key] = cls._sanitize_actions(actions)
        return sanitized

    @staticmethod
    def _copy_contract_v2_fields(source, target):
        for key in ("intent", "plan", "actionsByStep", "execution", "developer"):
            if key in source:
                target[key] = copy.deepcopy(source[key])

    def _validate_response_actions(self, response, *, context):
        actions = response.get("actions") or []
        if not actions:
            return response
        if self._action_schema is None:
            return self._invalid_actions_response(response)

        try:
            result = self._action_schema.validate_actions(
                actions,
                context=context,
                video_authorized=False,
            )
        except Exception as exc:
            return self._invalid_actions_response(
                response,
                schema_warnings=[
                    "Pi action schema validation failed.",
                    self._redact_warning(str(exc)),
                ],
            )
        if not isinstance(result, dict) or result.get("valid") is not True:
            schema_warnings = self._schema_messages(result, "warnings")
            schema_warnings.extend(self._schema_messages(result, "errors"))
            return self._invalid_actions_response(response, schema_warnings=schema_warnings)

        if not isinstance(result.get("actions"), list):
            return self._invalid_actions_response(
                response,
                schema_warnings=["Pi action schema returned invalid actions."],
            )
        sanitized_actions = self._sanitize_actions(result.get("actions"))
        if len(sanitized_actions) != len(actions):
            return self._invalid_actions_response(
                response,
                schema_warnings=["Pi action schema returned invalid actions."],
            )

        validated = dict(response)
        validated["actions"] = sanitized_actions
        validated["warnings"] = self._sanitize_warnings(
            self._warning_list(response.get("warnings")) + self._warning_list(result.get("warnings"))
        )
        return validated

    @staticmethod
    def _schema_messages(result, key):
        if not isinstance(result, dict) or key not in result:
            return []
        value = result.get(key)
        if isinstance(value, list):
            return [message for message in value if isinstance(message, str)]
        return ["Pi action schema returned malformed validation messages."]

    @staticmethod
    def _warning_list(warnings):
        if not isinstance(warnings, list):
            return []
        return [warning for warning in warnings if isinstance(warning, str)]

    @staticmethod
    def _invalid_actions_response(response, schema_warnings=None):
        return {
            "success": False,
            "errorCode": "invalid_actions",
            "reply": response.get("reply") or "Pi canvas agent returned actions that failed validation.",
            "actions": [],
            "warnings": PiBridgeService._sanitize_warnings(
                (response.get("warnings") or []) + (schema_warnings or [])
            ),
            "requiresConfirmation": False,
        }

    @staticmethod
    def _error(error_code, reply, warnings=None):
        return {
            "success": False,
            "errorCode": error_code,
            "reply": reply,
            "actions": [],
            "warnings": PiBridgeService._sanitize_warnings(warnings),
            "requiresConfirmation": False,
        }

    @staticmethod
    def _stream_base(frame, frame_type):
        return {
            "type": frame_type,
            "conversationId": str(frame.get("conversationId") or ""),
            "messageId": str(frame.get("messageId") or ""),
            "traceId": str(frame.get("traceId") or ""),
        }

    def _response_frame_to_stream_frames(self, frame, request):
        response = self._sanitize_response(frame)
        if response.get("success") is False:
            yield self._error_frame(
                response.get("errorCode"),
                response.get("reply"),
                response.get("warnings"),
            )
            return

        validated = self._validate_response_actions(response, context=request["context"])
        if validated.get("success") is False:
            yield self._error_frame(
                validated.get("errorCode"),
                validated.get("reply"),
                validated.get("warnings"),
            )
            return

        base = {
            "conversationId": frame.get("conversationId") or request.get("conversationId") or "",
            "messageId": frame.get("messageId") or "",
            "traceId": frame.get("traceId") or "",
        }
        yield self._stream_base(base, "message.start")
        reply = str(validated.get("reply") or "")
        if reply:
            delta = self._stream_base(base, "message.delta")
            delta["delta"] = reply
            yield delta
        for warning in validated.get("warnings") if isinstance(validated.get("warnings"), list) else []:
            if isinstance(warning, str) and warning.strip():
                warning_frame = self._stream_base(base, "warning")
                warning_frame["message"] = self._redact_warning(warning.strip())
                yield warning_frame
        done = self._stream_base(base, "message.done")
        done["reply"] = reply
        done["actions"] = validated.get("actions") or []
        self._copy_contract_v2_fields(validated, done)
        done["warnings"] = validated.get("warnings") or []
        done["requiresConfirmation"] = bool(validated.get("requiresConfirmation"))
        yield done

    @staticmethod
    def _error_frame(error_code, message, warnings=None):
        sanitized_warnings = PiBridgeService._sanitize_warnings(warnings)
        frame = {
            "type": "error",
            "errorCode": str(error_code or "pi_stream_error"),
            "message": str(message or "Pi canvas agent stream failed."),
            "friendlyMessage": str(message or "Pi canvas agent stream failed."),
            "traceId": "trace_%s" % uuid.uuid4().hex[:12],
            "diagnostics": sanitized_warnings,
            "retryable": True,
        }
        if sanitized_warnings:
            frame["warnings"] = sanitized_warnings
        return frame

    @staticmethod
    def _sanitize_actions(actions):
        if not isinstance(actions, list):
            return []
        return [copy.deepcopy(action) for action in actions if isinstance(action, dict)]

    @staticmethod
    def _sanitize_warnings(warnings):
        if not isinstance(warnings, list):
            return []
        return [
            PiBridgeService._redact_warning(warning)
            for warning in warnings
            if isinstance(warning, str)
        ]

    @staticmethod
    def _redact_warning(warning):
        redacted = warning
        for pattern, replacement in PiBridgeService._REDACTION_PATTERNS:
            redacted = pattern.sub(replacement, redacted)
        if len(redacted) > PiBridgeService.MAX_WARNING_LENGTH:
            redacted = redacted[: PiBridgeService.MAX_WARNING_LENGTH]
        return redacted
