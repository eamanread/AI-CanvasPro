import json
import unittest

from services.canvas_agent_conversation_service import CanvasAgentConversationService
from services.canvas_agent_sync_service import CanvasAgentSyncService


class _GenerationTaskService:
    def __init__(self):
        self.tasks = []

    def list_generation_tasks(self, filters=None):
        filters = filters or {}
        return [
            task
            for task in self.tasks
            if not filters.get("projectId") or task.get("projectId") == filters["projectId"]
        ]

    def import_tasks(self, records, project_id=""):
        imported = 0
        skipped = 0
        for task in records:
            if project_id and task.get("projectId") != project_id:
                skipped += 1
                continue
            self.tasks = [item for item in self.tasks if item.get("id") != task.get("id")]
            self.tasks.append(dict(task))
            imported += 1
        return {"imported": imported, "skipped": skipped}


class _TemplateService:
    def __init__(self):
        self.templates = []

    def list_templates(self, filters=None):
        filters = filters or {}
        project_id = filters.get("projectId") or ""
        team_id = filters.get("teamId") or ""
        result = []
        for template in self.templates:
            scope = template.get("scope") or "project"
            if scope == "team":
                if team_id and template.get("teamId") == team_id:
                    result.append(template)
            elif project_id and template.get("projectId") == project_id:
                result.append(template)
        return result

    def import_templates(self, records, project_id="", team_id=""):
        imported = 0
        skipped = 0
        for template in records:
            scope = template.get("scope") or "project"
            allowed = (
                scope == "project" and template.get("projectId") == project_id
            ) or (
                scope == "team" and team_id and template.get("teamId") == team_id
            )
            if not allowed:
                skipped += 1
                continue
            self.templates = [
                item for item in self.templates if item.get("templateId") != template.get("templateId")
            ]
            self.templates.append(dict(template))
            imported += 1
        return {"imported": imported, "skipped": skipped}


class CanvasAgentSyncServiceTests(unittest.TestCase):
    def _conversation_service(self):
        counter = {"value": 0}

        def make_id(prefix):
            counter["value"] += 1
            return f"{prefix}_{counter['value']}"

        return CanvasAgentConversationService(
            clock=lambda: "2026-06-05T00:00:00Z",
            id_factory=make_id,
        )

    def test_export_project_snapshot_filters_project_team_and_redacts_secrets(self):
        conversations = self._conversation_service()
        conv_a = conversations.create_conversation(
            {
                "id": "ignored",
                "title": "Project A",
                "projectId": "project-a",
                "model": {"apiKey": "must-not-leak"},
            }
        )
        conversations.create_conversation({"title": "Project B", "projectId": "project-b"})
        generation = _GenerationTaskService()
        generation.tasks = [
            {"id": "gen-a", "projectId": "project-a", "prompt": "safe"},
            {"id": "gen-b", "projectId": "project-b", "prompt": "skip"},
        ]
        templates = _TemplateService()
        templates.templates = [
            {"templateId": "tpl-a", "projectId": "project-a", "nodes": [{"data": {"apiKey": "must-not-leak"}}]},
            {"templateId": "tpl-b", "projectId": "project-b"},
            {"templateId": "tpl-team", "scope": "team", "projectId": "project-b", "teamId": "team-alpha"},
        ]
        service = CanvasAgentSyncService(
            conversation_service=conversations,
            generation_task_service=generation,
            template_service=templates,
            clock=lambda: "2026-06-05T00:00:00Z",
        )

        snapshot = service.export_project_snapshot(project_id="project-a", team_id="team-alpha")
        encoded = json.dumps(snapshot, ensure_ascii=False)

        self.assertEqual(snapshot["schemaVersion"], "canvas-agent-sync-v1")
        self.assertEqual([item["id"] for item in snapshot["conversations"]], [conv_a["id"]])
        self.assertEqual([item["id"] for item in snapshot["generationTasks"]], ["gen-a"])
        self.assertEqual(
            sorted(item["templateId"] for item in snapshot["workflowTemplates"]),
            ["tpl-a", "tpl-team"],
        )
        self.assertNotIn("Project B", encoded)
        self.assertNotIn("gen-b", encoded)
        self.assertNotIn("tpl-b", encoded)
        self.assertNotIn("must-not-leak", encoded)
        self.assertNotIn("apiKey", encoded)

    def test_import_project_snapshot_respects_project_and_team_scope(self):
        conversations = self._conversation_service()
        generation = _GenerationTaskService()
        templates = _TemplateService()
        service = CanvasAgentSyncService(
            conversation_service=conversations,
            generation_task_service=generation,
            template_service=templates,
        )

        result = service.import_project_snapshot(
            {
                "schemaVersion": "canvas-agent-sync-v1",
                "projectId": "project-a",
                "teamId": "team-alpha",
                "conversations": [
                    {"id": "conv-a", "projectId": "project-a", "title": "A"},
                    {"id": "conv-b", "projectId": "project-b", "title": "B"},
                ],
                "generationTasks": [
                    {"id": "gen-a", "projectId": "project-a"},
                    {"id": "gen-b", "projectId": "project-b"},
                ],
                "workflowTemplates": [
                    {"templateId": "tpl-a", "projectId": "project-a"},
                    {"templateId": "tpl-team", "scope": "team", "projectId": "project-b", "teamId": "team-alpha"},
                    {"templateId": "tpl-other-team", "scope": "team", "projectId": "project-a", "teamId": "team-beta"},
                ],
            },
            project_id="project-a",
            team_id="team-alpha",
        )

        self.assertEqual(result["importedConversations"], 1)
        self.assertEqual(result["importedGenerationTasks"], 1)
        self.assertEqual(result["importedWorkflowTemplates"], 2)
        self.assertEqual(result["skipped"], 3)
        self.assertIsNotNone(conversations.get_conversation("conv-a"))
        self.assertIsNone(conversations.get_conversation("conv-b"))
        self.assertEqual([task["id"] for task in generation.tasks], ["gen-a"])
        self.assertEqual(
            sorted(template["templateId"] for template in templates.templates),
            ["tpl-a", "tpl-team"],
        )


if __name__ == "__main__":
    unittest.main()
