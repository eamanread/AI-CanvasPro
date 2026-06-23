import json
import subprocess
import unittest

from services.canvas_agent_action_schema import CanvasAgentActionSchema
from services.pi_bridge_service import PiBridgeService


KEY_PREFIX = "s" + "k-"


class FakeRuntimeService:
    def __init__(self, launch_spec=None, exception=None):
        self.launch_spec = launch_spec or {
            "command": ["node", "runner.js"],
            "cwd": "sidecar-cwd",
            "env": {"OPENAI_API_KEY": "proxy-token"},
        }
        self.exception = exception
        self.provider_configs = []

    def build_launch_spec(self, provider_config=None):
        self.provider_configs.append(provider_config)
        if self.exception:
            raise self.exception
        return self.launch_spec


class Completed:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class StubActionSchema:
    def __init__(self, result=None, exception=None, mutate_context=False):
        self.result = result
        self.exception = exception
        self.mutate_context = mutate_context

    def validate_actions(self, _actions, *, context, video_authorized):
        if self.mutate_context:
            context["canvas"]["nodes"].append({"id": "schema-mutated"})
        if self.exception:
            raise self.exception
        return self.result


class PiBridgeServiceTest(unittest.TestCase):
    def test_chat_sends_jsonl_and_parses_reply(self):
        calls = []

        def provider_config_getter():
            return {"apiUrl": "http://proxy/v1", "apiKey": "proxy-key"}

        def command_runner(command, **kwargs):
            calls.append((command, kwargs))
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "type": "response",
                        "success": True,
                        "reply": "Pi says hello",
                        "actions": [],
                        "warnings": ["note"],
                        "requiresConfirmation": True,
                    }
                )
                + "\n"
            )

        runtime = FakeRuntimeService()
        service = PiBridgeService(
            runtime,
            provider_config_getter=provider_config_getter,
            command_runner=command_runner,
        )

        result = service.chat(
            "hello",
            context={"canvas": {"nodes": []}},
            conversation_id="project-1",
            mode="actions",
        )

        self.assertTrue(result["success"])
        self.assertEqual("Pi says hello", result["reply"])
        self.assertEqual([], result["actions"])
        self.assertEqual(["note"], result["warnings"])
        self.assertTrue(result["requiresConfirmation"])
        self.assertEqual({"apiUrl": "http://proxy/v1", "apiKey": "proxy-key"}, runtime.provider_configs[0])

        command, kwargs = calls[0]
        self.assertEqual(["node", "runner.js"], command)
        self.assertEqual("sidecar-cwd", kwargs["cwd"])
        self.assertEqual({"OPENAI_API_KEY": "proxy-token"}, kwargs["env"])
        self.assertTrue(kwargs["capture_output"])
        self.assertTrue(kwargs["text"])
        self.assertEqual(120, kwargs["timeout"])
        self.assertTrue(kwargs["input"].endswith("\n"))

        request = json.loads(kwargs["input"].strip())
        self.assertTrue(request["id"].startswith("pi-"))
        self.assertEqual("chat", request["type"])
        self.assertEqual("project-1", request["conversationId"])
        self.assertEqual("actions", request["mode"])
        self.assertEqual("hello", request["message"])
        self.assertEqual({"canvas": {"nodes": []}}, request["context"])

    def test_chat_preserves_assistant_response_contract_v2_fields(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "type": "response",
                        "success": True,
                        "reply": "planned",
                        "intent": {
                            "id": "intent_1",
                            "mode": "act",
                            "matchedSkills": ["canvas_layout"],
                            "apiKey": "must-not-leak",
                        },
                        "plan": {
                            "id": "plan_1",
                            "title": "Layout",
                            "status": "draft",
                            "steps": [{"id": "step_1", "title": "Layout"}],
                        },
                        "actionsByStep": {
                            "step_1": [{"type": "layout_nodes", "nodeIds": ["n1"]}]
                        },
                        "execution": {"id": "exec_1", "status": "draft"},
                        "developer": {
                            "rawModelContractVersion": "v2",
                            "skillWarnings": ["ok"],
                            "localPath": "D:\\secret\\project.json",
                        },
                        "actions": [{"type": "layout_nodes", "nodeIds": ["n1"]}],
                        "warnings": [],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(
                result={
                    "valid": True,
                    "actions": [{"type": "layout_nodes", "nodeIds": ["n1"]}],
                    "warnings": [],
                }
            ),
        )

        result = service.chat("layout", context={"canvas": {"nodes": [{"id": "n1"}]}})

        self.assertTrue(result["success"])
        self.assertEqual(result["intent"], {"id": "intent_1", "mode": "act", "matchedSkills": ["canvas_layout"]})
        self.assertEqual(result["plan"]["id"], "plan_1")
        self.assertEqual(result["actionsByStep"], {"step_1": [{"type": "layout_nodes", "nodeIds": ["n1"]}]})
        self.assertEqual(result["execution"]["id"], "exec_1")
        self.assertEqual(result["developer"], {"rawModelContractVersion": "v2", "skillWarnings": ["ok"]})

    def test_chat_uses_provider_config_for_selected_text_model(self):
        captured_models = []

        def provider_config_getter(model=None):
            captured_models.append(model)
            if model and model.get("provider") == "grsai":
                return {
                    "apiUrl": "https://grsai.example/v1",
                    "apiKey": "text-key",
                    "model": model.get("model") or model.get("modelId"),
                }
            return {"apiUrl": "https://agent.example/v1", "apiKey": "agent-key", "model": "agent"}

        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(stdout=json.dumps({"id": request["id"], "reply": "OK", "actions": []}) + "\n")

        runtime = FakeRuntimeService()
        service = PiBridgeService(
            runtime,
            provider_config_getter=provider_config_getter,
            command_runner=command_runner,
        )

        result = service.chat(
            "hello",
            model={"provider": "grsai", "model": "grsai-chat", "apiKey": "must-not-pass"},
        )

        self.assertTrue(result["success"])
        self.assertEqual([{"provider": "grsai", "model": "grsai-chat"}], captured_models)
        self.assertEqual(
            {"apiUrl": "https://grsai.example/v1", "apiKey": "text-key", "model": "grsai-chat"},
            runtime.provider_configs[0],
        )

    def test_chat_sends_sanitized_model_reference_without_secrets(self):
        captured = {}

        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            captured.update(request)
            return Completed(stdout=json.dumps({"id": request["id"], "reply": "OK"}) + "\n")

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner)

        result = service.chat(
            "hello",
            model={
                "provider": "pi_canvas_agent",
                "modelId": "agent-low-latency",
                "displayName": "Low latency",
                "apiKey": "bad-secret",
                "proxyToken": "bad-token",
                "endpoint": "https://bad.example/v1",
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(
            {
                "provider": "pi_canvas_agent",
                "modelId": "agent-low-latency",
                "displayName": "Low latency",
            },
            captured["model"],
        )
        self.assertNotIn("bad-secret", json.dumps(captured))
        self.assertNotIn("bad-token", json.dumps(captured))
        self.assertNotIn("endpoint", captured["model"])

    def test_chat_timeout_returns_pi_timeout(self):
        def command_runner(_command, **_kwargs):
            raise subprocess.TimeoutExpired(cmd="node", timeout=3)

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner, timeout_seconds=3)

        result = service.chat("hello")

        self.assertEqual(
            {
                "success": False,
                "errorCode": "pi_timeout",
                "reply": "Pi canvas agent timed out.",
                "actions": [],
                "warnings": [],
                "requiresConfirmation": False,
            },
            result,
        )

    def test_invalid_jsonl_stdout_returns_pi_invalid_response(self):
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(stdout="not json\n"),
        )

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_invalid_response", result["errorCode"])
        self.assertEqual([], result["actions"])
        self.assertEqual([], result["warnings"])

    def test_response_id_mismatch_returns_pi_response_mismatch(self):
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(
                stdout=json.dumps({"id": "wrong", "type": "response", "success": True, "reply": "OK"}) + "\n"
            ),
        )

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_response_mismatch", result["errorCode"])
        self.assertEqual([], result["actions"])

    def test_nonzero_returncode_returns_pi_runtime_failed_with_stderr_warning(self):
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(returncode=7, stderr="boom\n"),
        )

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_runtime_failed", result["errorCode"])
        self.assertEqual(["boom"], result["warnings"])
        self.assertEqual([], result["actions"])

    def test_runtime_failed_warning_redacts_secrets_and_windows_paths(self):
        stderr = (
            "failed with " + KEY_PREFIX + "testSecret123 and Bearer bearer-secret-token "
            "from D:\\secret\\file.txt apiKey=abc123 token=tok123 "
            "authorization=auth123 password=pw123 proxyToken=local-secret"
        )
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(returncode=7, stderr=stderr),
        )

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_runtime_failed", result["errorCode"])
        warning = result["warnings"][0]
        self.assertNotIn(KEY_PREFIX + "testSecret123", warning)
        self.assertNotIn("bearer-secret-token", warning)
        self.assertNotIn("D:\\secret\\file.txt", warning)
        self.assertNotIn("abc123", warning)
        self.assertNotIn("tok123", warning)
        self.assertNotIn("auth123", warning)
        self.assertNotIn("pw123", warning)
        self.assertNotIn("local-secret", warning)
        self.assertLessEqual(len(warning), 500)

    def test_build_launch_spec_exception_returns_pi_bridge_failed(self):
        service = PiBridgeService(FakeRuntimeService(exception=RuntimeError("missing config")))

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_bridge_failed", result["errorCode"])
        self.assertEqual(["missing config"], result["warnings"])
        self.assertEqual([], result["actions"])

    def test_empty_launch_command_returns_pi_bridge_failed(self):
        runtime = FakeRuntimeService(launch_spec={"command": [], "cwd": "sidecar-cwd", "env": {}})
        service = PiBridgeService(runtime)

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_bridge_failed", result["errorCode"])
        self.assertEqual(["Pi launch command is empty."], result["warnings"])
        self.assertEqual([], result["actions"])

    def test_bridge_failed_warning_redacts_exception_secret(self):
        service = PiBridgeService(
            FakeRuntimeService(exception=RuntimeError("launch failed apiKey=super-secret at D:\\private\\run"))
        )

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_bridge_failed", result["errorCode"])
        warning = result["warnings"][0]
        self.assertNotIn("super-secret", warning)
        self.assertNotIn("D:\\private\\run", warning)
        self.assertLessEqual(len(warning), 500)

    def test_command_runner_uses_utf8_and_unescaped_unicode_jsonl(self):
        calls = []

        def command_runner(_command, **kwargs):
            calls.append(kwargs)
            request = json.loads(kwargs["input"].strip())
            return Completed(stdout=json.dumps({"id": request["id"], "reply": "OK"}) + "\n")

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner)

        result = service.chat("你好 Pi")

        self.assertTrue(result["success"])
        self.assertEqual("utf-8", calls[0]["encoding"])
        self.assertIn('"message": "你好 Pi"', calls[0]["input"])
        self.assertNotIn("\\u4f60", calls[0]["input"])

    def test_malformed_success_field_returns_pi_invalid_response(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": "false",
                        "reply": {"not": "a string"},
                        "actions": [],
                        "warnings": ["keep", 123, {"secret": "apiKey=bad"}],
                        "errorCode": 42,
                        "requiresConfirmation": True,
                    }
                )
                + "\n"
            )

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner)

        result = service.chat("hello")

        self.assertFalse(result["success"])
        self.assertEqual("pi_invalid_response", result["errorCode"])
        self.assertEqual([], result["actions"])
        self.assertFalse(result["requiresConfirmation"])

    def test_non_dict_context_is_sent_as_empty_object(self):
        captured = {}

        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            captured.update(request)
            return Completed(stdout=json.dumps({"id": request["id"], "reply": "OK"}) + "\n")

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner)

        result = service.chat(123, context=["not", "dict"])

        self.assertTrue(result["success"])
        self.assertEqual("123", captured["message"])
        self.assertEqual("default", captured["conversationId"])
        self.assertEqual("replyOnly", captured["mode"])
        self.assertEqual({}, captured["context"])

    def test_chat_validates_create_comment_node_with_schema(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "reply": "Created comment",
                        "actions": [
                            {
                                "type": "create_node",
                                "nodeType": "comment",
                                "name": "Review note",
                                "data": {"content": "Safe note"},
                            }
                        ],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=CanvasAgentActionSchema(),
        )

        result = service.chat("create a comment")

        self.assertTrue(result["success"], result)
        self.assertEqual("Created comment", result["reply"])
        self.assertEqual(
            [
                {
                    "type": "create_node",
                    "name": "Review note",
                    "nodeType": "comment",
                    "data": {"content": "Safe note"},
                }
            ],
            result["actions"],
        )

    def test_chat_rejects_run_shell_action_with_schema(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "reply": "Running command",
                        "actions": [{"type": "run_shell", "command": "dir"}],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=CanvasAgentActionSchema(),
        )

        result = service.chat("run shell")

        self.assertFalse(result["success"])
        self.assertEqual("invalid_actions", result["errorCode"])
        self.assertEqual("Running command", result["reply"])
        self.assertEqual([], result["actions"])
        self.assertFalse(result["requiresConfirmation"])

    def test_chat_rejects_video_generation_when_video_not_authorized(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "reply": "Queueing video",
                        "actions": [
                            {
                                "type": "queue_generation_task",
                                "nodeId": "video-1",
                                "nodeType": "ai-video",
                            }
                        ],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=CanvasAgentActionSchema(),
        )

        result = service.chat("generate video", context={"canvas": {"nodes": [{"id": "video-1", "type": "ai-video"}]}})

        self.assertFalse(result["success"])
        self.assertEqual("invalid_actions", result["errorCode"])
        self.assertEqual([], result["actions"])
        self.assertIn("video generation requires confirmation", " ".join(result["warnings"]))

    def test_chat_rejects_actions_when_schema_not_injected(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "reply": "Created comment",
                        "actions": [{"type": "create_node", "nodeType": "comment"}],
                        "requiresConfirmation": True,
                    }
                )
                + "\n"
            )

        service = PiBridgeService(FakeRuntimeService(), command_runner=command_runner)

        result = service.chat("create comment")

        self.assertFalse(result["success"])
        self.assertEqual("invalid_actions", result["errorCode"])
        self.assertEqual("Created comment", result["reply"])
        self.assertEqual([], result["actions"])
        self.assertFalse(result["requiresConfirmation"])

    def test_schema_exception_fails_closed_without_leaking_exception_secret(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "reply": "Created comment",
                        "actions": [{"type": "create_node", "nodeType": "comment"}],
                        "requiresConfirmation": True,
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(exception=RuntimeError("apiKey=secret")),
        )

        result = service.chat("create comment")

        self.assertFalse(result["success"])
        self.assertEqual("invalid_actions", result["errorCode"])
        self.assertEqual([], result["actions"])
        self.assertFalse(result["requiresConfirmation"])
        self.assertNotIn("secret", " ".join(result["warnings"]))
        self.assertTrue(result["warnings"])

    def test_schema_string_errors_are_not_split_into_character_warnings(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "actions": [{"type": "create_node", "nodeType": "comment"}],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(result={"valid": False, "errors": "bad"}),
        )

        result = service.chat("create comment")

        self.assertFalse(result["success"])
        self.assertEqual("invalid_actions", result["errorCode"])
        self.assertNotEqual(["b", "a", "d"], result["warnings"])
        self.assertEqual([], result["actions"])

    def test_valid_schema_with_non_list_warnings_does_not_crash(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            action = {"type": "create_node", "nodeType": "comment"}
            return Completed(stdout=json.dumps({"id": request["id"], "success": True, "actions": [action]}) + "\n")

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(
                result={
                    "valid": True,
                    "actions": [{"type": "create_node", "nodeType": "comment"}],
                    "warnings": {"bad": "shape"},
                }
            ),
        )

        result = service.chat("create comment")

        self.assertTrue(result["success"])
        self.assertEqual([], result["warnings"])

    def test_valid_schema_result_without_list_actions_returns_invalid_actions(self):
        schema_results = [
            {"valid": True},
            {"valid": True, "actions": "bad"},
            {"valid": True, "actions": []},
        ]
        for schema_result in schema_results:
            with self.subTest(schema_result=schema_result):
                def command_runner(_command, **kwargs):
                    request = json.loads(kwargs["input"].strip())
                    return Completed(
                        stdout=json.dumps(
                            {
                                "id": request["id"],
                                "success": True,
                                "actions": [{"type": "create_node", "nodeType": "comment"}],
                            }
                        )
                        + "\n"
                    )

                service = PiBridgeService(
                    FakeRuntimeService(),
                    command_runner=command_runner,
                    action_schema=StubActionSchema(result=schema_result),
                )

                result = service.chat("create comment")

                self.assertFalse(result["success"])
                self.assertEqual("invalid_actions", result["errorCode"])
                self.assertEqual([], result["actions"])

    def test_warning_redaction_covers_json_colon_and_env_underscore_secrets(self):
        stderr = (
            '{"apiKey":"json-secret"} authorization: Bearer colon-secret '
            "OPENAI_API_KEY=env-secret api_key=underscore-secret"
        )
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(returncode=7, stderr=stderr),
        )

        result = service.chat("hello")

        warning = result["warnings"][0]
        self.assertNotIn("json-secret", warning)
        self.assertNotIn("colon-secret", warning)
        self.assertNotIn("env-secret", warning)
        self.assertNotIn("underscore-secret", warning)

    def test_schema_context_mutation_does_not_mutate_original_caller_context(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "success": True,
                        "actions": [{"type": "create_node", "nodeType": "comment"}],
                    }
                )
                + "\n"
            )

        caller_context = {"canvas": {"nodes": []}}
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(
                result={"valid": True, "actions": [{"type": "create_node", "nodeType": "comment"}]},
                mutate_context=True,
            ),
        )

        result = service.chat("create comment", context=caller_context)

        self.assertTrue(result["success"])
        self.assertEqual({"canvas": {"nodes": []}}, caller_context)

    def test_chat_stream_yields_delta_and_validates_final_actions_only(self):
        captured = {}

        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            captured.update(request)
            return Completed(
                stdout="\n".join(
                    [
                        json.dumps({"id": request["id"], "type": "message.start", "messageId": "m1"}),
                        json.dumps({
                            "id": request["id"],
                            "type": "message.delta",
                            "delta": "hello",
                            "actions": [{"type": "run_shell", "command": "dir"}],
                        }),
                        json.dumps({
                            "id": request["id"],
                            "type": "message.done",
                            "reply": "hello",
                            "actions": [{"type": "focus_nodes", "nodeIds": ["n1"]}],
                            "warnings": [],
                            "requiresConfirmation": False,
                        }),
                    ]
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(
                result={"valid": True, "actions": [{"type": "focus_nodes", "nodeIds": ["n1"]}], "warnings": []}
            ),
        )

        frames = list(service.chat_stream("focus", context={"canvas": {"nodes": [{"id": "n1"}]}}))

        self.assertEqual([frame["type"] for frame in frames], ["message.start", "message.delta", "message.done"])
        self.assertNotIn("actions", frames[1])
        self.assertEqual(frames[-1]["actions"], [{"type": "focus_nodes", "nodeIds": ["n1"]}])
        self.assertTrue(captured["stream"])

    def test_chat_stream_error_frame_uses_friendly_envelope(self):
        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=lambda _command, **_kwargs: Completed(returncode=7, stderr="missing runner"),
        )

        frames = list(service.chat_stream("hello"))

        self.assertEqual(frames[-1]["type"], "error")
        self.assertEqual(frames[-1]["errorCode"], "pi_runtime_failed")
        self.assertEqual(frames[-1]["friendlyMessage"], "Pi canvas agent failed before producing a response.")
        self.assertEqual(frames[-1]["diagnostics"], ["missing runner"])
        self.assertTrue(frames[-1]["retryable"])
        self.assertIn("traceId", frames[-1])

    def test_chat_stream_accepts_legacy_one_shot_response_frame(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "type": "response",
                        "success": True,
                        "reply": "Legacy one-shot reply.",
                        "actions": [{"type": "focus_nodes", "nodeIds": ["n1"]}],
                        "warnings": ["legacy stream fallback"],
                        "requiresConfirmation": False,
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(
                result={
                    "valid": True,
                    "actions": [{"type": "focus_nodes", "nodeIds": ["n1"]}],
                    "warnings": [],
                }
            ),
        )

        frames = list(service.chat_stream("focus", context={"canvas": {"nodes": [{"id": "n1"}]}}))

        self.assertEqual([frame["type"] for frame in frames], ["message.start", "message.delta", "warning", "message.done"])
        self.assertEqual(frames[1]["delta"], "Legacy one-shot reply.")
        self.assertEqual(frames[2]["message"], "legacy stream fallback")
        self.assertEqual(frames[-1]["actions"], [{"type": "focus_nodes", "nodeIds": ["n1"]}])

    def test_chat_stream_fails_closed_when_final_actions_are_invalid(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "type": "message.done",
                        "reply": "bad",
                        "actions": [{"type": "run_shell", "command": "dir"}],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=CanvasAgentActionSchema(),
        )

        frames = list(service.chat_stream("bad"))

        self.assertEqual(frames[-1]["type"], "error")
        self.assertEqual(frames[-1]["errorCode"], "invalid_actions")
        self.assertNotIn("actions", frames[-1])


    def test_schema_exception_warning_includes_sanitized_exception_message_for_diagnostics(self):
        def command_runner(_command, **kwargs):
            request = json.loads(kwargs["input"].strip())
            return Completed(
                stdout=json.dumps(
                    {
                        "id": request["id"],
                        "type": "message.done",
                        "reply": "bad",
                        "actions": [{"type": "focus_nodes", "nodeIds": ["missing"]}],
                    }
                )
                + "\n"
            )

        service = PiBridgeService(
            FakeRuntimeService(),
            command_runner=command_runner,
            action_schema=StubActionSchema(exception=RuntimeError("apiKey=secret missing node id")),
        )

        frames = list(service.chat_stream("bad"))

        self.assertEqual(frames[-1]["type"], "error")
        self.assertEqual(frames[-1]["errorCode"], "invalid_actions")
        self.assertIn("missing node id", " ".join(frames[-1]["diagnostics"]))
        self.assertNotIn("secret", " ".join(frames[-1]["diagnostics"]))


if __name__ == "__main__":
    unittest.main()
