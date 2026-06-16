import json
import os
import tempfile
import unittest

from services.canvas_agent_conversation_service import CanvasAgentConversationService


class CanvasAgentConversationServiceTests(unittest.TestCase):
    def _service(self, storage_path=None):
        counter = {"value": 0}

        def make_id(prefix):
            counter["value"] += 1
            return f"{prefix}_{counter['value']}"

        return CanvasAgentConversationService(
            storage_path=storage_path,
            clock=lambda: "2026-06-03T00:00:00Z",
            id_factory=make_id,
        )

    def test_create_append_and_export_conversation(self):
        service = self._service()
        conversation = service.create_conversation(
            {"title": "剧情短片", "assistantIntent": {"id": "story_short"}}
        )

        service.append_message(conversation["id"], {"role": "user", "content": "做一个短片"})
        service.attach_context_snapshot(conversation["id"], {"context": {"canvas": {"nodeCount": 2}}})
        service.append_transaction(
            conversation["id"],
            {"actions": [{"type": "create_node", "nodeType": "ai-text"}]},
        )
        service.append_receipt(conversation["id"], {"summary": "applied", "success": True})
        service.append_generation_task(
            conversation["id"],
            {"nodeId": "node-1", "provider": "custom_ai", "model": "image-model"},
        )

        exported = service.export_conversation(conversation["id"])
        saved = exported["conversation"]
        self.assertEqual(saved["title"], "剧情短片")
        self.assertEqual(saved["messages"][0]["content"], "做一个短片")
        self.assertEqual(saved["contextSnapshots"][0]["context"]["canvas"]["nodeCount"], 2)
        self.assertEqual(saved["transactions"][0]["actions"][0]["type"], "create_node")
        self.assertEqual(saved["receipts"][0]["summary"], "applied")
        self.assertEqual(saved["generationTasks"][0]["nodeId"], "node-1")

    def test_persists_to_json_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "conversations.json")
            service = self._service(storage_path=path)
            conversation = service.create_conversation({"title": "电商套图"})

            restored = CanvasAgentConversationService(storage_path=path)

            self.assertEqual(restored.get_conversation(conversation["id"])["title"], "电商套图")

    def test_search_rename_and_delete(self):
        service = self._service()
        first = service.create_conversation({"title": "爆款实验室"})
        second = service.create_conversation({"title": "海报设计"})
        service.append_message(second["id"], {"role": "user", "content": "小红书封面"})

        self.assertEqual([item["id"] for item in service.list_conversations("小红书")], [second["id"]])
        self.assertEqual(service.rename_conversation(first["id"], "爆款复刻")["title"], "爆款复刻")
        self.assertTrue(service.delete_conversation(first["id"]))
        self.assertIsNone(service.get_conversation(first["id"]))

    def test_workspace_canvas_fields_and_export_redaction(self):
        service = self._service()
        conversation = service.create_conversation(
            {
                "title": "Agent 配置测试",
                "workspaceId": "ws-1",
                "canvasId": "canvas-1",
                "model": {
                    "provider": "pi_canvas_agent",
                    "modelId": "agent-high-quality",
                    "apiKey": "secret-token-value",
                },
            }
        )
        service.append_message(
            conversation["id"],
            {
                "role": "assistant",
                "content": "Authorization: Bearer secret-bearer-token",
                "actions": [{"type": "focus_nodes", "nodeIds": ["node-1"]}],
            },
        )

        saved = service.get_conversation(conversation["id"])
        exported = service.export_conversation(conversation["id"])
        encoded = str(exported)

        self.assertEqual(saved["workspaceId"], "ws-1")
        self.assertEqual(saved["canvasId"], "canvas-1")
        self.assertNotIn("secret-token-value", encoded)
        self.assertNotIn("secret-bearer-token", encoded)
        self.assertIn("[redacted]", encoded)

    def test_export_redacts_generation_task_secrets_paths_and_blob_urls(self):
        service = self._service()
        conversation = service.create_conversation({"title": "generation export"})
        service.append_generation_task(
            conversation["id"],
            {
                "nodeId": "n1",
                "prompt": "use blob:http://local/ref and D:\\secret\\a.png and data:image/png;base64,abc",
                "apiKey": "sk-secret-value",
                "references": [
                    {
                        "id": "ref-1",
                        "previewUrl": "blob:http://local/ref",
                        "localPath": "D:\\secret\\ref.png",
                    }
                ],
            },
        )

        exported = service.export_conversation(conversation["id"])
        encoded = json.dumps(exported, ensure_ascii=False)

        self.assertNotIn("sk-secret-value", encoded)
        self.assertNotIn("D:\\secret", encoded)
        self.assertNotIn("blob:", encoded)
        self.assertNotIn("data:image", encoded)

    def test_import_conversations_filters_project_and_redacts_export(self):
        service = self._service()

        result = service.import_conversations(
            [
                {
                    "id": "conv-a",
                    "title": "Project A",
                    "projectId": "project-a",
                    "model": {"apiKey": "must-not-leak"},
                    "messages": [{"role": "user", "content": "safe"}],
                },
                {
                    "id": "conv-b",
                    "title": "Project B",
                    "projectId": "project-b",
                },
            ],
            project_id="project-a",
        )
        encoded = json.dumps(service.export_conversation("conv-a"), ensure_ascii=False)

        self.assertEqual(result, {"imported": 1, "skipped": 1})
        self.assertEqual(service.get_conversation("conv-a")["projectId"], "project-a")
        self.assertIsNone(service.get_conversation("conv-b"))
        self.assertNotIn("must-not-leak", encoded)
        self.assertNotIn("apiKey", encoded)


if __name__ == "__main__":
    unittest.main()
