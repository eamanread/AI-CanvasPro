import json
import os
import time
import uuid


class ClawConversationMemoryService:
    def __init__(self, *, memory_file=None):
        self._memory_file = memory_file or os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "user", "claw_assistant_memory.json")
        )

    def _read(self):
        if not os.path.exists(self._memory_file):
            return {"conversations": []}
        try:
            with open(self._memory_file, "r", encoding="utf-8-sig") as file:
                data = json.load(file)
        except Exception:
            return {"conversations": []}
        return data if isinstance(data, dict) else {"conversations": []}

    def _write(self, data):
        os.makedirs(os.path.dirname(self._memory_file), exist_ok=True)
        with open(self._memory_file, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)

    def list_conversations(self):
        return self._read().get("conversations") or []

    def create_conversation(self, *, title="新话题", project_id=""):
        data = self._read()
        conversation = {
            "id": f"conv_{uuid.uuid4().hex[:12]}",
            "title": title or "新话题",
            "projectId": project_id or "",
            "messages": [],
            "createdAt": int(time.time() * 1000),
            "updatedAt": int(time.time() * 1000),
        }
        data.setdefault("conversations", []).insert(0, conversation)
        self._write(data)
        return conversation

