import json
import unittest

from services.canvas_agent_route_service import CanvasAgentRouteService


KEY_PREFIX = "s" + "k-"


class _Bridge:
    def __init__(self):
        self.calls = []

    def chat(self, **kwargs):
        self.calls.append(kwargs)
        return {"success": True, "reply": "ok", "actions": [], "warnings": []}


class _ActionSchema:
    def __init__(self):
        self.calls = []

    def validate_actions(self, actions, *, context=None, video_authorized=False, matched_skills=None):
        self.calls.append(
            {
                "actions": actions,
                "context": context,
                "video_authorized": video_authorized,
            }
        )
        return {"valid": True, "actions": actions, "warnings": []}


class _ContextService:
    def __init__(self):
        self.calls = []

    def preview_context(self, context):
        self.calls.append(context)
        return {"success": True, "context": context, "warnings": ["previewed"]}


class _RuntimeService:
    def status(self):
        return {
            "success": True,
            "configured": True,
            "running": False,
            "status": "ready",
            "source": "project_sidecar",
        }


class _ConversationService:
    def __init__(self):
        self.calls = []
        self.items = {
            "conv-1": {
                "id": "conv-1",
                "title": "Existing",
                "messages": [],
            }
        }

    def list_conversations(self, query=""):
        self.calls.append(("list", query))
        return list(self.items.values())

    def get_conversation(self, conversation_id):
        self.calls.append(("get", conversation_id))
        return self.items.get(conversation_id)

    def create_conversation(self, payload=None):
        self.calls.append(("create", payload))
        item = {"id": "conv-new", "title": (payload or {}).get("title") or "New", "messages": []}
        self.items[item["id"]] = item
        return item

    def rename_conversation(self, conversation_id, title):
        self.calls.append(("rename", conversation_id, title))
        item = self.items.get(conversation_id)
        if not item:
            return None
        item["title"] = title
        return item

    def delete_conversation(self, conversation_id):
        self.calls.append(("delete", conversation_id))
        return self.items.pop(conversation_id, None) is not None

    def append_message(self, conversation_id, message):
        self.calls.append(("message", conversation_id, message))
        item = self.items.get(conversation_id)
        if not item:
            return None
        item["messages"].append(message)
        return item

    def export_conversation(self, conversation_id):
        self.calls.append(("export", conversation_id))
        item = self.items.get(conversation_id)
        return {"version": 1, "conversation": item} if item else None


class _GenerationTaskService:
    def __init__(self):
        self.calls = []
        self.tasks = {
            "gen-1": {
                "id": "gen-1",
                "conversationId": "conv-1",
                "nodeId": "node-1",
                "status": "queued",
            }
        }

    def list_generation_tasks(self, filters=None):
        filters = filters or {}
        self.calls.append(("list", filters))
        tasks = list(self.tasks.values())
        if filters.get("conversationId"):
            tasks = [task for task in tasks if task.get("conversationId") == filters["conversationId"]]
        if filters.get("nodeId"):
            tasks = [task for task in tasks if task.get("nodeId") == filters["nodeId"]]
        if filters.get("status"):
            tasks = [task for task in tasks if task.get("status") == filters["status"]]
        return tasks

    def create_generation_task(self, payload):
        self.calls.append(("create", payload))
        task = {"id": "gen-new", "status": "queued", **payload}
        self.tasks[task["id"]] = task
        return task

    def update_generation_task(self, task_id, patch):
        self.calls.append(("update", task_id, patch))
        task = self.tasks.get(task_id)
        if not task:
            return None
        task.update(patch)
        return task


class _ExecutionService:
    def __init__(self):
        self.calls = []
        self.executions = {
            "exec-1": {
                "id": "exec-1",
                "projectId": "project-a",
                "status": "draft",
                "timeline": [],
            }
        }

    def list_executions(self, filters=None):
        filters = filters or {}
        self.calls.append(("list", filters))
        executions = list(self.executions.values())
        if filters.get("projectId"):
            executions = [item for item in executions if item.get("projectId") == filters["projectId"]]
        if filters.get("status"):
            executions = [item for item in executions if item.get("status") == filters["status"]]
        return executions

    def get_execution(self, execution_id):
        self.calls.append(("get", execution_id))
        return self.executions.get(execution_id)

    def upsert_execution(self, payload):
        self.calls.append(("upsert", payload))
        execution = {"id": payload.get("id") or "exec-new", **payload}
        self.executions[execution["id"]] = execution
        return execution

    def append_timeline_event(self, execution_id, event):
        self.calls.append(("append", execution_id, event))
        execution = self.executions.get(execution_id)
        if not execution:
            return None
        execution.setdefault("timeline", []).append(event)
        return execution

    def update_status(self, execution_id, status, patch=None):
        self.calls.append(("status", execution_id, status, patch or {}))
        execution = self.executions.get(execution_id)
        if not execution:
            return None
        execution.update(patch or {})
        execution["status"] = status
        return execution

    def control_queued_execution(self, execution_id, action, target_index=None, ordered_ids=None):
        self.calls.append(("queue-control", execution_id, action, target_index, ordered_ids))
        execution = self.executions.get(execution_id)
        if not execution:
            return None
        execution["queueAction"] = action
        if target_index is not None:
            execution["targetIndex"] = target_index
        if ordered_ids is not None:
            execution["orderedIds"] = ordered_ids
        return execution

    def prepare_queued_execution(self, execution_id, payload):
        self.calls.append(("prepare", execution_id, payload))
        execution = self.executions.get(execution_id)
        if not execution:
            return None
        return {
            "plan": {"id": "plan-fresh"},
            "actionsByStep": {"step-1": [{"id": "act-fresh"}]},
            "drawerState": {"line2": "Prepared from route"},
        }

    def clear_completed(self, filters=None):
        self.calls.append(("clear", filters or {}))
        before = len(self.executions)
        self.executions = {
            key: value
            for key, value in self.executions.items()
            if value.get("status") != "completed"
        }
        return before - len(self.executions)


class _SyncService:
    def __init__(self):
        self.calls = []

    def export_project_snapshot(self, project_id="", team_id=""):
        self.calls.append(("export", project_id, team_id))
        return {
            "schemaVersion": "canvas-agent-sync-v1",
            "projectId": project_id,
            "teamId": team_id,
            "conversations": [],
            "generationTasks": [],
            "workflowTemplates": [],
        }

    def import_project_snapshot(self, snapshot=None, *, project_id="", team_id=""):
        self.calls.append(("import", project_id, team_id, snapshot))
        return {"importedConversations": 1, "importedGenerationTasks": 0, "importedWorkflowTemplates": 0}


class _Handler:
    def __init__(self, path):
        self.path = path


class CanvasAgentRouteServiceTests(unittest.TestCase):
    def test_chat_delegates_to_bridge_with_trimmed_message_context_conversation_and_mode(self):
        bridge = _Bridge()
        service = CanvasAgentRouteService(bridge_service=bridge)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/chat",
            b'{"message":"  hello  ","context":{"canvasId":"c1"},"conversationId":"thread-1","mode":"reply"}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["reply"], "ok")
        self.assertEqual(
            bridge.calls,
            [
                {
                    "message": "hello",
                    "context": {"canvasId": "c1"},
                    "conversation_id": "thread-1",
                    "mode": "reply",
                }
            ],
        )

    def test_chat_merges_top_level_assistant_intent_into_context(self):
        bridge = _Bridge()
        service = CanvasAgentRouteService(bridge_service=bridge)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/chat",
            (
                b'{"message":"plan","context":{"canvasId":"c1"},'
                b'"assistantIntent":{"id":"commerce_pack","title":"Commerce","source":"rh_skill","extra":"ignored"}}'
            ),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(
            bridge.calls[0]["context"],
            {
                "canvasId": "c1",
                "assistantIntent": {
                    "id": "commerce_pack",
                    "title": "Commerce",
                    "source": "rh_skill",
                },
            },
        )

    def test_chat_delegates_sanitized_model_reference_to_bridge(self):
        bridge = _Bridge()
        service = CanvasAgentRouteService(bridge_service=bridge)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/chat",
            (
                b'{"message":"hello","model":{"provider":"pi_canvas_agent",'
                b'"modelId":"agent-low-latency","apiKey":"bad",'
                b'"proxyToken":"bad-token","endpoint":"https://bad.example"}}'
            ),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(
            bridge.calls[0]["model"],
            {"provider": "pi_canvas_agent", "modelId": "agent-low-latency"},
        )
        self.assertNotIn("bad", json.dumps(bridge.calls[0]))
        self.assertNotIn("endpoint", bridge.calls[0]["model"])

    def test_actions_validate_delegates_to_schema(self):
        schema = _ActionSchema()
        service = CanvasAgentRouteService(action_schema=schema)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/actions/validate",
            b'{"actions":[{"type":"noop"}],"context":{"nodeIds":["a"]},"videoAuthorized":true}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["valid"], True)
        self.assertEqual(
            schema.calls,
            [
                {
                    "actions": [{"type": "noop"}],
                    "context": {"nodeIds": ["a"]},
                    "video_authorized": True,
                }
            ],
        )

    def test_context_preview_delegates_to_context_service(self):
        context_service = _ContextService()
        service = CanvasAgentRouteService(context_service=context_service)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/context/preview",
            b'{"context":{"selection":["n1"]}}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["warnings"], ["previewed"])
        self.assertEqual(context_service.calls, [{"selection": ["n1"]}])

    def test_blank_message_returns_400(self):
        service = CanvasAgentRouteService(bridge_service=_Bridge())

        response = service.handle_post(None, "/api/v2/canvas-agent/chat", b'{"message":"   "}')

        self.assertEqual(response, {"kind": "json_err", "code": 400, "message": "Missing message"})

    def test_invalid_json_returns_400(self):
        service = CanvasAgentRouteService()

        response = service.handle_post(None, "/api/v2/canvas-agent/chat", b"{not json")

        self.assertEqual(response, {"kind": "json_err", "code": 400, "message": "Invalid JSON"})

    def test_status_redacts_key_and_uses_runtime_status(self):
        service = CanvasAgentRouteService(
            runtime_service=_RuntimeService(),
            config_getter=lambda: {
                "providers": {
                    "canvas_agent": {
                        "apiUrl": "https://api.example.test/v1",
                        "apiKey": KEY_PREFIX + "secret",
                        "model": "pi-model",
                        "providerType": "openai_compatible",
                    },
                    "custom_ai": {
                        "apiUrl": "https://should-not-use.test",
                        "apiKey": KEY_PREFIX + "should-not-leak",
                    },
                }
            },
        )

        response = service.handle_get(None, "/api/v2/canvas-agent/status")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertTrue(response["data"]["available"])
        self.assertEqual(response["data"]["runtime"]["status"], "ready")
        self.assertEqual(response["data"]["provider"]["apiUrl"], "https://api.example.test/v1")
        self.assertEqual(response["data"]["provider"]["model"], "pi-model")
        self.assertTrue(response["data"]["provider"]["apiKeyPresent"])
        self.assertNotIn("apiKey", response["data"]["provider"])
        self.assertNotIn(KEY_PREFIX + "secret", str(response))
        self.assertNotIn("should-not-use", str(response))

    def test_select_provider_config_prefers_non_failed_settings_text_model(self):
        name, provider = CanvasAgentRouteService.select_provider_config(
            {
                "modelRegistry": {
                    "text": [
                        {
                            "id": "mdl_text_failed",
                            "nodeType": "text",
                            "modelName": "Failed text",
                            "modelId": "failed-model",
                            "apiKey": "failed-key",
                            "baseUrl": "https://failed.example/v1",
                            "status": "failed",
                            "adapterType": "openai_compatible",
                        },
                        {
                            "id": "mdl_text_unverified",
                            "nodeType": "text",
                            "modelName": "Unverified text",
                            "modelId": "gpt-5.5",
                            "apiKey": "text-key",
                            "baseUrl": "https://right.example/v1",
                            "status": "unverified",
                            "adapterType": "openai_compatible",
                        },
                    ]
                }
            }
        )

        self.assertEqual(name, "model_registry")
        self.assertEqual(provider["model"], "gpt-5.5")
        self.assertEqual(provider["apiUrl"], "https://right.example/v1")

    def test_select_provider_config_uses_selected_settings_text_model(self):
        name, provider = CanvasAgentRouteService.select_provider_config(
            {
                "modelRegistry": {
                    "text": [
                        {
                            "id": "mdl_text_gpt_55",
                            "nodeType": "text",
                            "modelName": "GPT 5.5",
                            "modelId": "gpt-5.5",
                            "apiKey": "registry-text-key",
                            "baseUrl": "https://text.example/v1/chat/completions",
                            "status": "unverified",
                            "adapterType": "openai_compatible",
                        }
                    ]
                },
                "providers": {
                    "pi_canvas_agent": {
                        "proxyBaseUrl": "http://legacy.example/v1",
                        "proxyToken": "legacy-token",
                        "model": "legacy-agent",
                    }
                },
            },
            model={"provider": "model_registry", "id": "mdl_text_gpt_55", "model": "gpt-5.5"},
        )

        self.assertEqual(name, "model_registry")
        self.assertEqual(provider["apiUrl"], "https://text.example/v1/chat/completions")
        self.assertEqual(provider["apiKey"], "registry-text-key")
        self.assertEqual(provider["model"], "gpt-5.5")
        self.assertNotIn("legacy-token", json.dumps(provider))

    def test_select_provider_config_uses_selected_text_model_provider(self):
        name, provider = CanvasAgentRouteService.select_provider_config(
            {
                "providers": {
                    "canvas_agent": {"apiUrl": "", "apiKey": "", "model": "blank"},
                    "grsai": {
                        "apiUrl": "https://grsai.example/v1",
                        "apiKey": "text-key",
                        "model": "default-text",
                    },
                }
            },
            model={"provider": "grsai", "model": "grsai-chat"},
        )

        self.assertEqual(name, "grsai")
        self.assertEqual(provider["apiUrl"], "https://grsai.example/v1")
        self.assertEqual(provider["model"], "grsai-chat")
        self.assertNotIn("must-not-pass", json.dumps(provider))

    def test_status_uses_configured_pi_canvas_agent_when_canvas_agent_is_blank(self):
        service = CanvasAgentRouteService(
            runtime_service=_RuntimeService(),
            config_getter=lambda: {
                "providers": {
                    "canvas_agent": {"apiUrl": "", "apiKey": "", "model": "blank"},
                    "pi_canvas_agent": {
                        "proxyBaseUrl": "http://local-proxy/v1",
                        "proxyToken": "proxy-secret",
                        "model": "pi-model",
                    },
                }
            },
        )

        response = service.handle_get(None, "/api/v2/canvas-agent/status")

        self.assertTrue(response["data"]["available"])
        self.assertEqual(response["data"]["provider"]["name"], "pi_canvas_agent")
        self.assertEqual(response["data"]["provider"]["apiUrl"], "http://local-proxy/v1")
        self.assertTrue(response["data"]["provider"]["proxyTokenPresent"])
        self.assertNotIn("proxy-secret", str(response))

    def test_status_sanitizes_provider_endpoint_before_returning_it(self):
        service = CanvasAgentRouteService(
            runtime_service=_RuntimeService(),
            config_getter=lambda: {
                "providers": {
                    "canvas_agent": {
                        "apiUrl": "https://user:secret@example.test/v1?token=abc#frag",
                        "apiKey": KEY_PREFIX + "secret",
                    }
                }
            },
        )

        response = service.handle_get(None, "/api/v2/canvas-agent/status")

        self.assertEqual(response["data"]["provider"]["apiUrl"], "https://example.test/v1")
        self.assertNotIn("secret", str(response))
        self.assertNotIn("token=abc", str(response))

    def test_status_supports_unified_config_aliases_and_configured_flags_without_leaks(self):
        service = CanvasAgentRouteService(
            runtime_service=_RuntimeService(),
            config_getter=lambda: {
                "providers": {
                    "pi_canvas_agent": {
                        "endpoint": "https://user:secret@example.invalid/v1?token=abc#frag",
                        "apiKey": "api_key_value",
                        "apiKeyConfigured": True,
                        "defaultModel": "agent-high-quality",
                        "providerType": "openai-compatible",
                    }
                }
            },
        )

        response = service.handle_get(None, "/api/v2/canvas-agent/status")
        provider = response["data"]["provider"]
        payload_text = json.dumps(response, ensure_ascii=False)

        self.assertTrue(response["data"]["available"])
        self.assertEqual("pi_canvas_agent", provider["name"])
        self.assertTrue(provider["configured"])
        self.assertEqual("https://example.invalid/v1", provider["apiUrl"])
        self.assertEqual("https://example.invalid/v1", provider["endpoint"])
        self.assertEqual("agent-high-quality", provider["model"])
        self.assertEqual("agent-high-quality", provider["defaultModel"])
        self.assertTrue(provider["apiKeyPresent"])
        self.assertNotIn("api_key_value", payload_text)
        self.assertNotIn("secret", payload_text)
        self.assertNotIn("token=abc", payload_text)
        self.assertNotIn("apiKey", provider)

    def test_status_explains_missing_provider_without_leaking_secret_fields(self):
        service = CanvasAgentRouteService(
            runtime_service=_RuntimeService(),
            config_getter=lambda: {
                "providers": {
                    "canvas_agent": {
                        "apiUrl": "https://x/v1",
                        "apiKey": KEY_PREFIX + "secret",
                        "model": "",
                    }
                }
            },
        )

        response = service.handle_get(None, "/api/v2/canvas-agent/status")

        provider = response["data"]["provider"]
        self.assertNotIn("apiKey", provider)
        self.assertTrue(provider["apiKeyPresent"])
        self.assertFalse(response["data"]["available"])
        self.assertIn("missing_model", provider["reasons"])
        self.assertNotIn(KEY_PREFIX + "secret", json.dumps(response, ensure_ascii=False))

    def test_unknown_path_returns_none(self):
        service = CanvasAgentRouteService()

        self.assertIsNone(service.handle_get(None, "/api/v2/canvas-agent/unknown"))
        self.assertIsNone(service.handle_post(None, "/api/v2/canvas-agent/unknown", b"{}"))

    def test_conversation_routes_list_get_create_rename_delete_and_export(self):
        conversations = _ConversationService()
        service = CanvasAgentRouteService(conversation_service=conversations)

        listed = service.handle_get(
            _Handler("/api/v2/canvas-agent/conversations?query=recent"),
            "/api/v2/canvas-agent/conversations",
        )
        fetched = service.handle_get(
            _Handler("/api/v2/canvas-agent/conversations/conv-1"),
            "/api/v2/canvas-agent/conversations/conv-1",
        )
        created = service.handle_post(
            None,
            "/api/v2/canvas-agent/conversations",
            b'{"title":"New project"}',
        )
        renamed = service.handle_patch(
            None,
            "/api/v2/canvas-agent/conversations/conv-new",
            b'{"title":"Renamed"}',
        )
        exported = service.handle_post(
            None,
            "/api/v2/canvas-agent/conversations/conv-new/export",
            b"{}",
        )
        exported_get = service.handle_get(
            _Handler("/api/v2/canvas-agent/conversations/conv-new/export?format=json"),
            "/api/v2/canvas-agent/conversations/conv-new/export",
        )
        deleted = service.handle_delete(
            None,
            "/api/v2/canvas-agent/conversations/conv-new",
        )

        self.assertEqual(listed["data"]["conversations"][0]["id"], "conv-1")
        self.assertEqual(fetched["data"]["conversation"]["id"], "conv-1")
        self.assertEqual(created["data"]["conversation"]["id"], "conv-new")
        self.assertEqual(renamed["data"]["conversation"]["title"], "Renamed")
        self.assertEqual(exported["data"]["export"]["conversation"]["id"], "conv-new")
        self.assertEqual(exported_get["data"]["export"]["conversation"]["id"], "conv-new")
        self.assertEqual(deleted["data"]["success"], True)
        self.assertIn(("list", "recent"), conversations.calls)

    def test_conversation_operation_route_appends_messages(self):
        conversations = _ConversationService()
        service = CanvasAgentRouteService(conversation_service=conversations)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/conversations/conv-1/messages",
            b'{"role":"user","content":"hello"}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["conversation"]["messages"][0]["content"], "hello")

    def test_generation_task_routes_delegate_to_task_service(self):
        tasks = _GenerationTaskService()
        service = CanvasAgentRouteService(generation_task_service=tasks)

        listed = service.handle_get(
            _Handler("/api/v2/canvas-agent/generation-tasks?conversationId=conv-1&nodeId=node-1&status=queued"),
            "/api/v2/canvas-agent/generation-tasks",
        )
        created = service.handle_post(
            None,
            "/api/v2/canvas-agent/generation-tasks",
            b'{"conversationId":"conv-1","nodeId":"node-2","prompt":"make image"}',
        )
        patched = service.handle_patch(
            None,
            "/api/v2/canvas-agent/generation-tasks/gen-new",
            b'{"status":"cancelled"}',
        )

        self.assertEqual(listed["kind"], "json_ok")
        self.assertEqual(listed["data"]["tasks"][0]["id"], "gen-1")
        self.assertEqual(created["data"]["task"]["id"], "gen-new")
        self.assertEqual(patched["data"]["task"]["status"], "cancelled")
        self.assertIn(("list", {"conversationId": "conv-1", "nodeId": "node-1", "status": "queued"}), tasks.calls)

    def test_generation_task_routes_return_501_when_no_store_is_configured(self):
        service = CanvasAgentRouteService()

        response = service.handle_get(
            _Handler("/api/v2/canvas-agent/generation-tasks"),
            "/api/v2/canvas-agent/generation-tasks",
        )

        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 501)
        self.assertIn("generation task", response["message"].lower())

    def test_execution_routes_delegate_to_execution_service(self):
        executions = _ExecutionService()
        service = CanvasAgentRouteService(execution_service=executions)

        listed = service.handle_get(
            _Handler("/api/v2/canvas-agent/executions?projectId=project-a&status=draft"),
            "/api/v2/canvas-agent/executions",
        )
        fetched = service.handle_get(
            _Handler("/api/v2/canvas-agent/executions/exec-1"),
            "/api/v2/canvas-agent/executions/exec-1",
        )
        upserted = service.handle_post(
            None,
            "/api/v2/canvas-agent/executions",
            b'{"id":"exec-2","projectId":"project-a","status":"queued"}',
        )
        appended = service.handle_post(
            None,
            "/api/v2/canvas-agent/executions/exec-2/timeline",
            b'{"status":"running","humanSummary":"Started"}',
        )
        patched = service.handle_patch(
            None,
            "/api/v2/canvas-agent/executions/exec-2/status",
            b'{"status":"completed","drawerState":{"visible":false}}',
        )
        cleared = service.handle_delete(
            _Handler("/api/v2/canvas-agent/executions?projectId=project-a"),
            "/api/v2/canvas-agent/executions",
        )

        self.assertEqual(listed["kind"], "json_ok")
        self.assertEqual(listed["data"]["executions"][0]["id"], "exec-1")
        self.assertEqual(fetched["data"]["execution"]["id"], "exec-1")
        self.assertEqual(upserted["data"]["execution"]["id"], "exec-2")
        self.assertEqual(appended["data"]["execution"]["timeline"][0]["humanSummary"], "Started")
        self.assertEqual(patched["data"]["execution"]["status"], "completed")
        self.assertEqual(cleared["data"]["cleared"], 1)
        self.assertIn(("list", {"projectId": "project-a", "status": "draft"}), executions.calls)

    def test_execution_queue_control_route_delegates_to_execution_service(self):
        executions = _ExecutionService()
        service = CanvasAgentRouteService(execution_service=executions)

        response = service.handle_patch(
            None,
            "/api/v2/canvas-agent/executions/exec-1/queue-control",
            b'{"action":"pause"}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["execution"]["id"], "exec-1")
        self.assertEqual(response["data"]["execution"]["queueAction"], "pause")
        self.assertIn(("queue-control", "exec-1", "pause", None, None), executions.calls)

    def test_execution_queue_control_route_forwards_move_target_index(self):
        executions = _ExecutionService()
        service = CanvasAgentRouteService(execution_service=executions)

        response = service.handle_patch(
            None,
            "/api/v2/canvas-agent/executions/exec-1/queue-control",
            b'{"action":"move","targetIndex":1}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["execution"]["queueAction"], "move")
        self.assertEqual(response["data"]["execution"]["targetIndex"], 1)
        self.assertIn(("queue-control", "exec-1", "move", 1, None), executions.calls)

    def test_execution_queue_control_route_forwards_reorder_ordered_ids(self):
        executions = _ExecutionService()
        service = CanvasAgentRouteService(execution_service=executions)

        response = service.handle_patch(
            None,
            "/api/v2/canvas-agent/executions/exec-1/queue-control",
            b'{"action":"reorder","orderedIds":["exec-4","exec-2","exec-1","exec-3"]}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["execution"]["queueAction"], "reorder")
        self.assertEqual(response["data"]["execution"]["orderedIds"], ["exec-4", "exec-2", "exec-1", "exec-3"])
        self.assertIn(
            ("queue-control", "exec-1", "reorder", None, ["exec-4", "exec-2", "exec-1", "exec-3"]),
            executions.calls,
        )

    def test_execution_prepare_route_delegates_to_execution_service(self):
        executions = _ExecutionService()
        service = CanvasAgentRouteService(execution_service=executions)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/executions/exec-1/prepare",
            b'{"context":{"canvas":{"nodeCount":2}},"agentMode":"act","videoAuthorized":false}',
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["plan"]["id"], "plan-fresh")
        self.assertEqual(response["data"]["actionsByStep"]["step-1"][0]["id"], "act-fresh")
        self.assertEqual(response["data"]["drawerState"]["line2"], "Prepared from route")
        self.assertIn(
            (
                "prepare",
                "exec-1",
                {
                    "context": {"canvas": {"nodeCount": 2}},
                    "agentMode": "act",
                    "videoAuthorized": False,
                },
            ),
            executions.calls,
        )

    def test_execution_routes_return_501_when_no_store_is_configured(self):
        service = CanvasAgentRouteService()

        response = service.handle_get(
            _Handler("/api/v2/canvas-agent/executions"),
            "/api/v2/canvas-agent/executions",
        )

        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 501)
        self.assertIn("execution", response["message"].lower())

    def test_sync_routes_delegate_to_project_sync_service(self):
        sync = _SyncService()
        service = CanvasAgentRouteService(sync_service=sync)

        exported = service.handle_get(
            _Handler("/api/v2/canvas-agent/sync/project?projectId=project-a&teamId=team-alpha"),
            "/api/v2/canvas-agent/sync/project",
        )
        imported = service.handle_post(
            None,
            "/api/v2/canvas-agent/sync/project",
            b'{"projectId":"project-a","teamId":"team-alpha","snapshot":{"schemaVersion":"canvas-agent-sync-v1"}}',
        )

        self.assertEqual(exported["kind"], "json_ok")
        self.assertEqual(exported["data"]["snapshot"]["projectId"], "project-a")
        self.assertEqual(imported["kind"], "json_ok")
        self.assertEqual(imported["data"]["result"]["importedConversations"], 1)
        self.assertEqual(sync.calls[0], ("export", "project-a", "team-alpha"))
        self.assertEqual(sync.calls[1][0:3], ("import", "project-a", "team-alpha"))

    def test_chat_stream_returns_ndjson_without_partial_actions(self):
        bridge = _Bridge()
        service = CanvasAgentRouteService(bridge_service=bridge)

        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/chat/stream",
            b'{"message":"focus","conversationId":"conv-1"}',
        )

        self.assertEqual(response["kind"], "binary")
        self.assertIn("application/x-ndjson", response["contentType"])
        lines = [json.loads(line) for line in response["body"].decode("utf-8").splitlines()]
        self.assertEqual([line["type"] for line in lines], ["message.start", "message.delta", "message.done"])
        self.assertNotIn("actions", lines[1])
        self.assertEqual(lines[-1]["actions"], [])


    def test_metrics_route_returns_backend_aggregation(self):
        executions = _ExecutionService()
        executions.compute_metrics_calls = []

        def compute_metrics(filters=None):
            executions.compute_metrics_calls.append(filters or {})
            return {"totalExecutions": 1, "skillHitRate": 1}

        executions.compute_metrics = compute_metrics
        service = CanvasAgentRouteService(execution_service=executions)

        response = service.handle_get(
            _Handler("/api/v2/canvas-agent/metrics?projectId=project-a"),
            "/api/v2/canvas-agent/metrics",
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(response["data"]["metrics"]["totalExecutions"], 1)
        self.assertEqual(executions.compute_metrics_calls, [{"projectId": "project-a"}])


    def test_director_plan_route_delegates_to_director_bridge(self):
        calls = []

        class _DirectorBridge:
            def plan(self, payload):
                calls.append(payload)
                return {"success": True, "reply": "ok", "intent": {"id": "director_plan"}}

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/director/plan",
            '{"message":"导演计划"}'.encode("utf-8"),
        )
        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(calls[0]["message"], "导演计划")

    def test_director_plan_route_503_when_not_configured(self):
        service = CanvasAgentRouteService()
        response = service.handle_post(None, "/api/v2/canvas-agent/director/plan", b"{}")
        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 503)

    def test_director_dailies_route_injects_mode_and_delegates(self):
        calls = []

        class _DirectorBridge:
            def plan(self, payload):
                calls.append(payload)
                return {"success": True, "savedTo": "director/inbox/canvas-dailies-x.json", "nodeCount": 2}

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_post(
            None,
            "/api/v2/canvas-agent/director/dailies",
            '{"dailies":{"schemaVersion":"canvas-dailies/v1"},"qmaiProjectPath":"D:/p"}'.encode("utf-8"),
        )
        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(calls[0]["mode"], "dailies")
        self.assertEqual(calls[0]["dailies"]["schemaVersion"], "canvas-dailies/v1")

    def test_director_refresh_route_delegates_when_configured(self):
        calls = []

        class _DirectorBridge:
            def plan(self, payload):
                return {"success": True}

            def refresh(self, payload):
                calls.append(payload)
                return {"success": True, "rounds": 1}

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_post(None, "/api/v2/canvas-agent/director/refresh", b"{}")
        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(len(calls), 1)

    def test_director_refresh_route_503_without_refresh_capability(self):
        class _DirectorBridge:
            def plan(self, payload):
                return {"success": True}

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_post(None, "/api/v2/canvas-agent/director/refresh", b"{}")
        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 503)


    def test_receipts_route_returns_projection(self):
        executions = _ExecutionService()
        executions.export_receipts = lambda filters=None: {
            "schemaVersion": "huanying-execution-receipts/v1",
            "executions": [],
            "metrics": {"totalExecutions": 0},
        }
        service = CanvasAgentRouteService(execution_service=executions)
        response = service.handle_get(
            _Handler("/api/v2/canvas-agent/receipts?projectId=project-a"),
            "/api/v2/canvas-agent/receipts",
        )
        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["receipts"]["schemaVersion"], "huanying-execution-receipts/v1")


if __name__ == "__main__":
    unittest.main()


class DirectorRefreshStatusRouteTests(unittest.TestCase):
    def test_refresh_status_route_parses_job_id_query(self):
        class _DirectorBridge:
            def plan(self, payload):
                return {"success": True}

            def refresh_status(self, job_id):
                return {"success": True, "jobId": job_id, "status": "done"}

        class _Handler:
            path = "/api/v2/canvas-agent/director/refresh/status?jobId=refresh-abc123"

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_get(_Handler(), "/api/v2/canvas-agent/director/refresh/status")
        self.assertEqual(response["kind"], "json_ok")
        self.assertEqual(response["data"]["jobId"], "refresh-abc123")
        self.assertEqual(response["data"]["status"], "done")

    def test_refresh_status_route_requires_job_id(self):
        class _DirectorBridge:
            def plan(self, payload):
                return {"success": True}

            def refresh_status(self, job_id):
                return {"success": True}

        class _Handler:
            path = "/api/v2/canvas-agent/director/refresh/status"

        service = CanvasAgentRouteService(director_bridge_service=_DirectorBridge())
        response = service.handle_get(_Handler(), "/api/v2/canvas-agent/director/refresh/status")
        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 400)
