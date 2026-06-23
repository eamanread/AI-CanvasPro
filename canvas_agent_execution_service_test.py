import json
import os
import tempfile
import unittest

from services.canvas_agent_execution_service import CanvasAgentExecutionService


class CanvasAgentExecutionServiceTests(unittest.TestCase):
    def _service(self, path=None):
        ticks = iter(
            [
                "2026-06-10T00:00:00Z",
                "2026-06-10T00:00:01Z",
                "2026-06-10T00:00:02Z",
                "2026-06-10T00:00:03Z",
                "2026-06-10T00:00:04Z",
            ]
        )

        def clock():
            return next(ticks, "2026-06-10T00:00:09Z")

        return CanvasAgentExecutionService(
            storage_path=path,
            clock=clock,
            id_factory=lambda prefix: f"{prefix}-fixed",
        )

    def test_upsert_list_get_append_status_clear_and_persist(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)

            execution = service.upsert_execution(
                {
                    "id": "exec-1",
                    "projectId": "project-a",
                    "title": "整理画布",
                    "status": "draft",
                    "developer": {
                        "apiKey": "sk-secret",
                        "actionJson": {"type": "layout_nodes"},
                        "localPath": r"D:\secret\file.png",
                    },
                }
            )
            service.append_timeline_event("exec-1", {"status": "running", "humanSummary": "开始整理"})
            service.update_status("exec-1", "completed", {"drawerState": {"visible": False}})
            listed = service.list_executions({"projectId": "project-a"})
            fetched = service.get_execution("exec-1")
            with open(path, encoding="utf-8") as handle:
                raw = json.dumps(json.load(handle), ensure_ascii=False)

            self.assertEqual(execution["id"], "exec-1")
            self.assertEqual(listed[0]["timeline"][0]["humanSummary"], "开始整理")
            self.assertEqual(fetched["status"], "completed")
            self.assertEqual(fetched["drawerState"]["visible"], False)
            self.assertNotIn("sk-secret", raw)
            self.assertNotIn("apiKey", raw)
            self.assertNotIn("D:\\secret", raw)
            self.assertIn("layout_nodes", raw)

            cleared = service.clear_completed({"projectId": "project-a"})
            self.assertEqual(cleared, 1)
            self.assertEqual(service.list_executions({"projectId": "project-a"}), [])

    def test_project_filter_and_max_history_keep_active_executions(self):
        service = CanvasAgentExecutionService(clock=lambda: "2026-06-10T00:00:00Z", max_executions=2)
        service.upsert_execution({"id": "done-a", "projectId": "project-a", "status": "completed"})
        service.upsert_execution({"id": "done-b", "projectId": "project-a", "status": "completed"})
        service.upsert_execution({"id": "active-a", "projectId": "project-a", "status": "executing"})
        service.upsert_execution({"id": "other", "projectId": "project-b", "status": "executing"})

        project_a = service.list_executions({"projectId": "project-a"})

        self.assertEqual([item["id"] for item in project_a], ["done-b", "active-a"])
        self.assertEqual(service.get_execution("other")["projectId"], "project-b")

    def test_persists_orchestrator_state_and_timeline_extended_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)

            service.upsert_execution(
                {
                    "id": "exec-extended",
                    "projectId": "project-a",
                    "status": "executing",
                    "orchestratorState": {
                        "nextActionIndex": 2,
                        "pausedAtActionId": "action-2",
                        "running": True,
                    },
                    "timeline": [
                        {
                            "id": "evt-existing",
                            "status": "completed",
                            "humanSummary": "已完成图片节点",
                            "nodeIds": ["image-1", "image-1"],
                            "affectedNodeIds": ["text-1"],
                            "createdNodeIds": ["video-1"],
                            "updatedNodeIds": ["image-2"],
                            "queuedGenerationNodeIds": ["queue-1"],
                            "startedGenerationNodeIds": ["start-1"],
                            "error": "Authorization: Bearer token-secret",
                            "canRetry": True,
                            "canUndo": True,
                            "durationMs": 1250,
                        }
                    ],
                }
            )
            service.append_timeline_event(
                "exec-extended",
                {
                    "id": "evt-appended",
                    "status": "failed",
                    "humanSummary": "生成失败",
                    "affectedNodeIds": ["video-2"],
                    "error": "sk-secret-token failed",
                    "canRetry": True,
                    "durationMs": 250,
                },
            )
            service.update_status(
                "exec-extended",
                "paused",
                {
                    "orchestratorState": {
                        "nextActionIndex": 3,
                        "pausedAtActionId": "action-3",
                        "running": True,
                    }
                },
            )

            restored = CanvasAgentExecutionService(
                storage_path=path,
                clock=lambda: "2026-06-10T00:00:09Z",
                id_factory=lambda prefix: f"{prefix}-fixed",
            )
            execution = restored.get_execution("exec-extended")

            self.assertEqual(
                execution["orchestratorState"],
                {"nextActionIndex": 3, "pausedAtActionId": "action-3", "running": False},
            )
            self.assertEqual(
                execution["timeline"][0]["nodeIds"],
                ["image-1", "text-1", "video-1", "image-2", "queue-1", "start-1"],
            )
            self.assertEqual(execution["timeline"][0]["error"], "Authorization: Bearer [redacted]")
            self.assertEqual(execution["timeline"][0]["canRetry"], True)
            self.assertEqual(execution["timeline"][0]["canUndo"], True)
            self.assertEqual(execution["timeline"][0]["durationMs"], 1250)
            self.assertEqual(execution["timeline"][1]["nodeIds"], ["video-2"])
            self.assertEqual(execution["timeline"][1]["error"], "[redacted] failed")
            self.assertEqual(execution["timeline"][1]["canRetry"], True)
            self.assertEqual(execution["timeline"][1]["canUndo"], False)
            self.assertEqual(execution["timeline"][1]["durationMs"], 250)

    def test_restores_interrupted_executing_task_as_paused_after_storage_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "version": 1,
                        "executions": [
                            {
                                "id": "exec-interrupted",
                                "projectId": "project-a",
                                "title": "Interrupted task",
                                "status": "executing",
                                "createdAt": "2026-06-10T00:00:00Z",
                                "updatedAt": "2026-06-10T00:00:01Z",
                                "progress": {"done": 1, "total": 3},
                                "drawerState": {
                                    "visible": True,
                                    "expanded": True,
                                    "line1": "Interrupted task",
                                    "line2": "Running old action",
                                },
                                "orchestratorState": {
                                    "nextActionIndex": 1,
                                    "pausedAtActionId": "act-2",
                                    "running": True,
                                },
                                "timeline": [
                                    {
                                        "id": "evt-running",
                                        "status": "running",
                                        "humanSummary": "Running old action",
                                    }
                                ],
                            },
                            {
                                "id": "exec-queued",
                                "projectId": "project-a",
                                "title": "Queued task",
                                "status": "queued",
                                "queueIndex": 1,
                            },
                            {
                                "id": "exec-draft",
                                "projectId": "project-a",
                                "title": "Queued draft",
                                "status": "queued_draft",
                                "queueIndex": 2,
                            },
                        ],
                    },
                    handle,
                )

            restored = CanvasAgentExecutionService(
                storage_path=path,
                clock=lambda: "2026-06-10T00:01:00Z",
                id_factory=lambda prefix: f"{prefix}-restore",
            )
            execution = restored.get_execution("exec-interrupted")

            self.assertEqual(execution["status"], "paused")
            self.assertEqual(execution["drawerState"]["visible"], True)
            self.assertEqual(execution["drawerState"]["line2"], "重启后已暂停，可继续执行")
            self.assertEqual(
                execution["orchestratorState"],
                {"nextActionIndex": 1, "pausedAtActionId": "act-2", "running": False},
            )
            self.assertEqual(execution["timeline"][-1]["status"], "restored_paused")
            self.assertEqual(execution["timeline"][-1]["developer"]["restoreReason"], "backend_storage_restart")
            self.assertEqual(
                [(item["id"], item["status"], item["queueIndex"]) for item in restored.list_executions({"projectId": "project-a", "status": "queued"})],
                [("exec-queued", "queued", 1), ("exec-draft", "queued_draft", 2)],
            )

            restored_again = CanvasAgentExecutionService(
                storage_path=path,
                clock=lambda: "2026-06-10T00:02:00Z",
                id_factory=lambda prefix: f"{prefix}-restore-again",
            )
            self.assertEqual(restored_again.get_execution("exec-interrupted")["status"], "paused")
            self.assertEqual(
                len(
                    [
                        event
                        for event in restored_again.get_execution("exec-interrupted")["timeline"]
                        if event["status"] == "restored_paused"
                    ]
                ),
                1,
            )

    def test_persists_queue_paused_drawer_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)

            service.upsert_execution(
                {
                    "id": "exec-paused",
                    "projectId": "project-a",
                    "status": "queued",
                    "drawerState": {
                        "visible": False,
                        "line1": "排队任务",
                        "line2": "已暂停排队",
                        "queuePaused": True,
                    },
                }
            )

            restored = CanvasAgentExecutionService(
                storage_path=path,
                clock=lambda: "2026-06-10T00:00:09Z",
                id_factory=lambda prefix: f"{prefix}-fixed",
            )

            self.assertEqual(restored.get_execution("exec-paused")["drawerState"]["queuePaused"], True)

    def test_controls_queued_executions_without_changing_active_execution(self):
        service = self._service()
        service.upsert_execution({"id": "active", "projectId": "project-a", "status": "executing"})
        service.upsert_execution({"id": "queue-1", "projectId": "project-a", "status": "queued", "queueIndex": 1})
        service.upsert_execution({"id": "queue-2", "projectId": "project-a", "status": "queued", "queueIndex": 2})

        topped = service.control_queued_execution("queue-2", "top")
        topped_queue = service.list_executions({"projectId": "project-a", "status": "queued"})
        paused = service.control_queued_execution("queue-2", "pause")
        resumed = service.control_queued_execution("queue-2", "resume")
        cancelled = service.control_queued_execution("queue-1", "cancel")
        queued = service.list_executions({"projectId": "project-a", "status": "queued"})

        self.assertEqual(topped["id"], "queue-2")
        self.assertEqual([item["id"] for item in topped_queue], ["queue-2", "queue-1"])
        self.assertEqual([item["id"] for item in queued], ["queue-2"])
        self.assertEqual(service.get_execution("active")["status"], "executing")
        self.assertEqual(paused["drawerState"]["queuePaused"], True)
        self.assertEqual(resumed["drawerState"]["queuePaused"], False)
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertEqual(cancelled["queueIndex"], 0)

    def test_moves_queued_execution_to_requested_index(self):
        service = self._service()
        service.upsert_execution({"id": "active", "projectId": "project-a", "status": "executing"})
        service.upsert_execution({"id": "queue-1", "projectId": "project-a", "status": "queued", "queueIndex": 1})
        service.upsert_execution({"id": "draft-1", "projectId": "project-a", "status": "queued_draft", "queueIndex": 2})
        service.upsert_execution({"id": "queue-2", "projectId": "project-a", "status": "queued", "queueIndex": 3})
        service.upsert_execution({"id": "draft-2", "projectId": "project-a", "status": "queued_draft", "queueIndex": 4})

        moved = service.control_queued_execution("draft-2", "move", target_index=1)
        queued = service.list_executions({"projectId": "project-a", "status": "queued"})

        self.assertEqual(moved["id"], "draft-2")
        self.assertEqual(moved["status"], "queued_draft")
        self.assertEqual(
            [(item["id"], item["status"], item["queueIndex"]) for item in queued[:4]],
            [
                ("queue-1", "queued", 1),
                ("draft-2", "queued_draft", 2),
                ("draft-1", "queued_draft", 3),
                ("queue-2", "queued", 4),
            ],
        )
        self.assertEqual(service.get_execution("active")["status"], "executing")

    def test_reorders_queued_executions_by_explicit_ordered_ids(self):
        service = self._service()
        service.upsert_execution({"id": "active", "projectId": "project-a", "status": "executing"})
        service.upsert_execution({"id": "queue-1", "projectId": "project-a", "status": "queued", "queueIndex": 1})
        service.upsert_execution({"id": "draft-1", "projectId": "project-a", "status": "queued_draft", "queueIndex": 2})
        service.upsert_execution({"id": "queue-2", "projectId": "project-a", "status": "queued", "queueIndex": 3})
        service.upsert_execution({"id": "draft-2", "projectId": "project-a", "status": "queued_draft", "queueIndex": 4})

        reordered = service.control_queued_execution(
            "draft-2",
            "reorder",
            ordered_ids=["draft-2", "draft-1", "queue-1", "queue-2"],
        )
        queued = service.list_executions({"projectId": "project-a", "status": "queued"})

        self.assertEqual(reordered["id"], "draft-2")
        self.assertEqual(
            [(item["id"], item["status"], item["queueIndex"]) for item in queued[:4]],
            [
                ("draft-2", "queued_draft", 1),
                ("draft-1", "queued_draft", 2),
                ("queue-1", "queued", 3),
                ("queue-2", "queued", 4),
            ],
        )
        self.assertEqual(service.get_execution("active")["status"], "executing")



    def test_queued_draft_lists_with_queue_and_promotes_to_queued_after_prepare(self):
        calls = []

        def prepare_runner(payload):
            calls.append(payload)
            return {
                "plan": {"id": "plan-draft-fresh"},
                "actionsByStep": {"step-1": [{"id": "act-draft-fresh"}]},
                "drawerState": {"line2": "Draft prepared"},
            }

        service = CanvasAgentExecutionService(
            clock=lambda: "2026-06-10T00:00:00Z",
            id_factory=lambda prefix: f"{prefix}-fixed",
            prepare_runner=prepare_runner,
        )
        service.upsert_execution({"id": "active", "projectId": "project-a", "status": "executing"})
        service.upsert_execution({"id": "draft", "projectId": "project-a", "status": "queued_draft", "queueIndex": 1})
        service.upsert_execution({"id": "queued", "projectId": "project-a", "status": "queued", "queueIndex": 2})

        listed = service.list_executions({"projectId": "project-a"})
        paused = service.control_queued_execution("draft", "pause")
        prepared = service.prepare_queued_execution("draft", {"context": {"canvas": {"nodeCount": 2}}})
        stored = service.get_execution("draft")

        self.assertEqual([item["id"] for item in listed[:2]], ["draft", "queued"])
        self.assertEqual(paused["status"], "queued_draft")
        self.assertEqual(paused["drawerState"]["queuePaused"], True)
        self.assertEqual(calls[0]["execution"]["status"], "queued_draft")
        self.assertEqual(prepared["plan"]["id"], "plan-draft-fresh")
        self.assertEqual(stored["status"], "queued")
        self.assertEqual(stored["actionsByStep"]["step-1"][0]["id"], "act-draft-fresh")



    def test_queued_draft_prepare_without_fresh_actions_does_not_promote_or_persist_stale_actions(self):
        def prepare_runner(_payload):
            return {
                "plan": {"id": "plan-only"},
            }

        service = CanvasAgentExecutionService(
            clock=lambda: "2026-06-10T00:00:00Z",
            id_factory=lambda prefix: f"{prefix}-fixed",
            prepare_runner=prepare_runner,
        )
        service.upsert_execution(
            {
                "id": "draft",
                "projectId": "project-a",
                "status": "queued_draft",
                "queueIndex": 1,
                "plan": {"id": "plan-stale"},
                "actionsByStep": {"step-1": [{"id": "act-stale"}]},
            }
        )

        prepared = service.prepare_queued_execution("draft", {"context": {"canvas": {"nodeCount": 2}}})
        stored = service.get_execution("draft")

        self.assertIsNone(prepared)
        self.assertEqual(stored["status"], "queued_draft")
        self.assertEqual(stored["plan"]["id"], "plan-stale")
        self.assertEqual(stored["actionsByStep"]["step-1"][0]["id"], "act-stale")

    def test_prepare_queued_execution_uses_runner_without_persisting_raw_context_or_secrets(self):
        calls = []

        def prepare_runner(payload):
            calls.append(payload)
            return {
                "plan": {"id": "plan-fresh"},
                "actionsByStep": {"step-1": [{"id": "act-fresh", "type": "layout_nodes"}]},
                "drawerState": {"line2": "Prepared from backend"},
                "developer": {"apiKey": "sk-prepare-secret", "note": "safe"},
                "context": {"should": "not persist"},
            }

        service = CanvasAgentExecutionService(
            clock=lambda: "2026-06-10T00:00:00Z",
            id_factory=lambda prefix: f"{prefix}-fixed",
            prepare_runner=prepare_runner,
        )
        service.upsert_execution(
            {
                "id": "exec-prepare",
                "projectId": "project-a",
                "status": "queued",
                "plan": {"id": "plan-stale"},
                "actionsByStep": {"step-1": [{"id": "act-stale"}]},
            }
        )

        prepared = service.prepare_queued_execution(
            "exec-prepare",
            {
                "context": {
                    "canvas": {"nodeCount": 2},
                    "apiKey": "sk-context-secret",
                    "localPath": r"D:\secret\asset.png",
                },
                "agentMode": "act",
                "videoAuthorized": True,
            },
        )
        stored = service.get_execution("exec-prepare")
        raw = json.dumps(stored, ensure_ascii=False)

        self.assertEqual(calls[0]["execution"]["id"], "exec-prepare")
        self.assertEqual(calls[0]["context"]["canvas"]["nodeCount"], 2)
        self.assertNotIn("apiKey", json.dumps(calls[0], ensure_ascii=False))
        self.assertNotIn("sk-context-secret", json.dumps(calls[0], ensure_ascii=False))
        self.assertEqual(calls[0]["agentMode"], "act")
        self.assertEqual(calls[0]["videoAuthorized"], True)
        self.assertEqual(prepared["plan"]["id"], "plan-fresh")
        self.assertEqual(prepared["actionsByStep"]["step-1"][0]["id"], "act-fresh")
        self.assertEqual(prepared["drawerState"]["line2"], "Prepared from backend")
        self.assertNotIn("context", prepared)
        self.assertNotIn("apiKey", raw)
        self.assertNotIn("sk-prepare-secret", raw)
        self.assertNotIn("sk-context-secret", raw)
        self.assertNotIn("D:\\secret", raw)
        self.assertEqual(stored["plan"]["id"], "plan-fresh")
        self.assertEqual(stored["actionsByStep"]["step-1"][0]["id"], "act-fresh")
        self.assertEqual(stored["drawerState"]["line2"], "Prepared from backend")

    def test_persists_timeline_inverse_patch_and_drops_invalid_ops(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)
            service.upsert_execution({"id": "exec-undo", "projectId": "project-a", "status": "completed"})
            service.append_timeline_event(
                "exec-undo",
                {
                    "id": "evt-create",
                    "actionId": "act-create",
                    "status": "completed",
                    "humanSummary": "已生成节点",
                    "canUndo": True,
                    "inverse": {
                        "aiOwned": True,
                        "ops": [
                            {"type": "remove_node", "nodeId": "text-1", "signature": "{\"name\":\"标题\"}"},
                            {"type": "remove_edge", "edgeId": "edge-1"},
                            {"type": "drop_everything", "nodeId": "text-2"},
                            {"type": "remove_node"},
                            {"type": "remove_node", "nodeId": "text-3", "signature": "sk-aaaabbbbccccdddd"},
                        ],
                    },
                },
            )
            service.append_timeline_event(
                "exec-undo",
                {"id": "evt-plain", "status": "undone", "humanSummary": "已撤销", "canUndo": False},
            )

            reloaded = CanvasAgentExecutionService(storage_path=path)
            stored = reloaded.get_execution("exec-undo")
            event = next(item for item in stored["timeline"] if item["id"] == "evt-create")
            self.assertTrue(event["canUndo"])
            self.assertTrue(event["inverse"]["aiOwned"])
            self.assertEqual(
                [op["type"] for op in event["inverse"]["ops"]],
                ["remove_node", "remove_edge", "remove_node"],
            )
            self.assertEqual(event["inverse"]["ops"][0]["nodeId"], "text-1")
            self.assertEqual(event["inverse"]["ops"][1]["edgeId"], "edge-1")
            self.assertNotIn("sk-aaaabbbbccccdddd", json.dumps(event["inverse"]))
            plain = next(item for item in stored["timeline"] if item["id"] == "evt-plain")
            self.assertNotIn("inverse", plain)

    def test_persists_restore_node_inverse_ops_with_prior_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)
            service.upsert_execution({"id": "exec-restore", "projectId": "project-a", "status": "completed"})
            service.append_timeline_event(
                "exec-restore",
                {
                    "id": "evt-update",
                    "actionId": "act-update",
                    "status": "completed",
                    "canUndo": True,
                    "inverse": {
                        "aiOwned": True,
                        "ops": [
                            {
                                "type": "restore_node",
                                "nodeId": "n1",
                                "name": "旧标题",
                                "data": {"text": "old", "apiKey": "sk-secretsecret1234"},
                                "signature": "{\"name\":\"旧标题\"}",
                            },
                            {"type": "restore_node"},
                        ],
                    },
                },
            )

            reloaded = CanvasAgentExecutionService(storage_path=path)
            stored = reloaded.get_execution("exec-restore")
            event = next(item for item in stored["timeline"] if item["id"] == "evt-update")
            ops = event["inverse"]["ops"]
            self.assertEqual(len(ops), 1)
            self.assertEqual(ops[0]["type"], "restore_node")
            self.assertEqual(ops[0]["nodeId"], "n1")
            self.assertEqual(ops[0]["name"], "旧标题")
            self.assertEqual(ops[0]["data"]["text"], "old")
            self.assertNotIn("apiKey", ops[0]["data"])

    def test_persists_restore_node_position_inverse_ops(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)
            service.upsert_execution({"id": "exec-pos", "projectId": "project-a", "status": "completed"})
            service.append_timeline_event(
                "exec-pos",
                {
                    "id": "evt-pos",
                    "actionId": "act-layout",
                    "status": "completed",
                    "canUndo": True,
                    "inverse": {
                        "aiOwned": True,
                        "ops": [
                            {"type": "restore_node_position", "nodeId": "n1", "x": 10.5, "y": -20,
                             "signature": "{\"x\":100,\"y\":0}"},
                            {"type": "restore_node_position", "nodeId": "n2", "x": "bad", "y": 0},
                            {"type": "restore_node_position", "x": 1, "y": 2},
                        ],
                    },
                },
            )

            reloaded = CanvasAgentExecutionService(storage_path=path)
            stored = reloaded.get_execution("exec-pos")
            event = next(item for item in stored["timeline"] if item["id"] == "evt-pos")
            ops = event["inverse"]["ops"]
            self.assertEqual(len(ops), 1)
            self.assertEqual(ops[0]["type"], "restore_node_position")
            self.assertEqual(ops[0]["nodeId"], "n1")
            self.assertEqual(ops[0]["x"], 10.5)
            self.assertEqual(ops[0]["y"], -20)

    def test_persists_matched_skills(self):
        service = self._service()
        service.upsert_execution({
            "id": "exec-skills", "projectId": "project-a", "status": "draft",
            "matchedSkills": ["canvas_layout", "", "asset_usage"],
        })
        stored = service.get_execution("exec-skills")
        self.assertEqual(stored["matchedSkills"], ["canvas_layout", "asset_usage"])

    def test_persists_structured_timeline_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "executions.json")
            service = self._service(path)
            service.upsert_execution({"id": "exec-target", "projectId": "project-a", "status": "completed"})
            service.append_timeline_event(
                "exec-target",
                {
                    "id": "evt-target",
                    "status": "completed",
                    "target": {"actionType": "create_node", "nodeType": "text", "nodeIds": ["n1", ""], "stepId": "s1", "extra": "x"},
                },
            )
            reloaded = CanvasAgentExecutionService(storage_path=path)
            event = next(item for item in reloaded.get_execution("exec-target")["timeline"] if item["id"] == "evt-target")
            self.assertEqual(event["target"], {"actionType": "create_node", "nodeType": "text", "nodeIds": ["n1"], "stepId": "s1"})
            plain = service.append_timeline_event("exec-target", {"id": "evt-plain", "status": "completed"})
            self.assertNotIn("target", [k for k in plain["timeline"][-1]])

    def test_compute_metrics_aggregates_execution_data(self):
        service = self._service()
        service.upsert_execution({
            "id": "m-1", "projectId": "project-a", "status": "completed", "matchedSkills": ["canvas_layout"],
            "timeline": [
                {"id": "e1", "status": "completed", "durationMs": 100},
                {"id": "e2", "status": "completed", "durationMs": 200},
            ],
        })
        service.upsert_execution({
            "id": "m-2", "projectId": "project-a", "status": "failed", "matchedSkills": [],
            "timeline": [
                {"id": "e3", "status": "failed", "canRetry": True},
                {"id": "e4", "status": "skipped"},
            ],
        })
        service.upsert_execution({
            "id": "m-3", "projectId": "project-b", "status": "completed", "matchedSkills": ["asset_usage"],
            "timeline": [{"id": "e5", "status": "blocked_by_skill"}],
        })

        metrics = service.compute_metrics({"projectId": "project-a"})
        self.assertEqual(metrics["totalExecutions"], 2)
        self.assertEqual(metrics["skillHitRate"], 0.5)
        self.assertEqual(metrics["actionCompletedCount"], 2)
        self.assertEqual(metrics["actionFailedCount"], 1)
        self.assertEqual(metrics["failureRecoveryRate"], 1)
        self.assertEqual(metrics["avgActionDurationMs"], 150)

        all_metrics = service.compute_metrics()
        self.assertEqual(all_metrics["totalExecutions"], 3)
        self.assertEqual(all_metrics["actionBlockedBySkillCount"], 1)

    def test_export_receipts_projects_sanitized_execution_history(self):
        service = self._service()
        service.upsert_execution({
            "id": "r-1", "projectId": "project-a", "title": "导演计划", "status": "completed",
            "matchedSkills": ["director"],
            "timeline": [
                {"id": "e1", "status": "completed", "durationMs": 100,
                 "developer": {"apiKey": "sk-secretsecret12", "actionJson": {"type": "create_node"}}},
                {"id": "e2", "status": "undone", "developer": {"undoneFromEventId": "e1"}},
            ],
        })
        service.upsert_execution({"id": "r-2", "projectId": "project-b", "status": "failed", "timeline": []})

        receipts = service.export_receipts({"projectId": "project-a"})

        self.assertEqual(receipts["schemaVersion"], "huanying-execution-receipts/v1")
        self.assertEqual(len(receipts["executions"]), 1)
        execution = receipts["executions"][0]
        self.assertEqual(execution["id"], "r-1")
        self.assertEqual(execution["matchedSkills"], ["director"])
        self.assertEqual(execution["undoneCount"], 1)
        self.assertEqual(execution["timeline"][0]["status"], "completed")
        self.assertEqual(execution["timeline"][0]["durationMs"], 100)
        raw = json.dumps(receipts)
        self.assertNotIn("sk-secretsecret12", raw)
        self.assertIn("metrics", receipts)
        self.assertEqual(receipts["metrics"]["totalExecutions"], 1)

    def test_prepare_queued_execution_returns_unavailable_without_runner(self):
        service = self._service()
        service.upsert_execution({"id": "exec-prepare", "projectId": "project-a", "status": "queued"})

        prepared = service.prepare_queued_execution("exec-prepare", {"context": {}})

        self.assertIsNone(prepared)

if __name__ == "__main__":
    unittest.main()
