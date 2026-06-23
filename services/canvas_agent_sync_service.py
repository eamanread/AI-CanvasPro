import copy
import re


class CanvasAgentSyncService:
    SCHEMA_VERSION = "canvas-agent-sync-v1"
    _SECRET_KEY_RE = re.compile(
        r"api[_-]?key|access[_-]?token|proxy[_-]?token|authorization|secret|password|credential|headers|localPath|filePath|absolutePath",
        re.I,
    )

    def __init__(
        self,
        *,
        conversation_service=None,
        generation_task_service=None,
        template_service=None,
        clock=None,
    ):
        self._conversation_service = conversation_service
        self._generation_task_service = generation_task_service
        self._template_service = template_service
        self._clock = clock or (lambda: "")

    @classmethod
    def _safe_list(cls, value):
        return value if isinstance(value, list) else []

    @classmethod
    def _sanitize(cls, value):
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                if cls._SECRET_KEY_RE.search(str(key)):
                    continue
                result[key] = cls._sanitize(child)
            return result
        if isinstance(value, list):
            return [cls._sanitize(item) for item in value]
        return copy.deepcopy(value)

    @staticmethod
    def _project_matches(item, project_id):
        return not project_id or str(item.get("projectId") or "") == project_id

    @staticmethod
    def _template_matches(item, project_id, team_id):
        scope = str(item.get("scope") or "project").lower()
        if scope == "team":
            return bool(team_id and str(item.get("teamId") or "") == team_id)
        return CanvasAgentSyncService._project_matches(item, project_id)

    def _list_conversations(self, project_id):
        if self._conversation_service is None:
            return []
        items = self._conversation_service.list_conversations("")
        return [
            self._sanitize(item)
            for item in self._safe_list(items)
            if isinstance(item, dict) and self._project_matches(item, project_id)
        ]

    def _list_generation_tasks(self, project_id):
        if self._generation_task_service is None:
            return []
        if hasattr(self._generation_task_service, "list_generation_tasks"):
            items = self._generation_task_service.list_generation_tasks({"projectId": project_id})
        else:
            items = []
        return [
            self._sanitize(item)
            for item in self._safe_list(items)
            if isinstance(item, dict) and self._project_matches(item, project_id)
        ]

    def _list_templates(self, project_id, team_id):
        if self._template_service is None:
            return []
        if hasattr(self._template_service, "list_templates"):
            items = self._template_service.list_templates(
                {
                    "projectId": project_id,
                    "teamId": team_id,
                    "scope": "all",
                    "includeDeprecated": True,
                }
            )
        else:
            items = []
        return [
            self._sanitize(item)
            for item in self._safe_list(items)
            if isinstance(item, dict) and self._template_matches(item, project_id, team_id)
        ]

    def export_project_snapshot(self, project_id="", team_id=""):
        project_id = str(project_id or "").strip()
        team_id = str(team_id or "").strip()
        return {
            "schemaVersion": self.SCHEMA_VERSION,
            "exportedAt": self._clock(),
            "projectId": project_id,
            "teamId": team_id,
            "conversations": self._list_conversations(project_id),
            "generationTasks": self._list_generation_tasks(project_id),
            "workflowTemplates": self._list_templates(project_id, team_id),
        }

    def import_project_snapshot(self, snapshot=None, *, project_id="", team_id=""):
        source = snapshot if isinstance(snapshot, dict) else {}
        project_id = str(project_id or source.get("projectId") or "").strip()
        team_id = str(team_id or source.get("teamId") or "").strip()
        conversations = [
            item for item in self._safe_list(source.get("conversations"))
            if isinstance(item, dict) and self._project_matches(item, project_id)
        ]
        generation_tasks = [
            item for item in self._safe_list(source.get("generationTasks"))
            if isinstance(item, dict) and self._project_matches(item, project_id)
        ]
        templates = [
            item for item in self._safe_list(source.get("workflowTemplates"))
            if isinstance(item, dict) and self._template_matches(item, project_id, team_id)
        ]
        skipped_by_filter = (
            len(self._safe_list(source.get("conversations"))) - len(conversations)
            + len(self._safe_list(source.get("generationTasks"))) - len(generation_tasks)
            + len(self._safe_list(source.get("workflowTemplates"))) - len(templates)
        )
        conversation_result = (
            self._conversation_service.import_conversations(conversations, project_id=project_id)
            if self._conversation_service is not None and hasattr(self._conversation_service, "import_conversations")
            else {"imported": 0, "skipped": len(conversations)}
        )
        generation_result = (
            self._generation_task_service.import_tasks(generation_tasks, project_id=project_id)
            if self._generation_task_service is not None and hasattr(self._generation_task_service, "import_tasks")
            else {"imported": 0, "skipped": len(generation_tasks)}
        )
        template_result = (
            self._template_service.import_templates(templates, project_id=project_id, team_id=team_id)
            if self._template_service is not None and hasattr(self._template_service, "import_templates")
            else {"imported": 0, "skipped": len(templates)}
        )
        return {
            "importedConversations": int(conversation_result.get("imported") or 0),
            "importedGenerationTasks": int(generation_result.get("imported") or 0),
            "importedWorkflowTemplates": int(template_result.get("imported") or 0),
            "skipped": (
                skipped_by_filter
                + int(conversation_result.get("skipped") or 0)
                + int(generation_result.get("skipped") or 0)
                + int(template_result.get("skipped") or 0)
            ),
        }
