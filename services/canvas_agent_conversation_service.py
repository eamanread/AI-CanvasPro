import copy
import json
import os
import re
import time
import uuid


class CanvasAgentConversationService:
    _SECRET_KEY_RE = re.compile(r"(api[_-]?key|authorization|secret|token|password|credential)", re.I)
    _SECRET_VALUE_RE = re.compile(
        r"(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+|(Bearer\s+)[A-Za-z0-9._-]+|"
        r"s[k]-[A-Za-z0-9_-]{8,}",
        re.I,
    )
    _LOCAL_VALUE_RE = re.compile(
        r"data:[^\s\"'<>]+|blob:[^\s\"'<>]+|[A-Za-z]:\\[^\"'<>|]+",
        re.I,
    )

    def __init__(self, storage_path=None, clock=None, id_factory=None):
        self._storage_path = storage_path
        self._clock = clock or self._now_iso
        self._id_factory = id_factory or self._create_id
        self._conversations = self._load()

    @staticmethod
    def _now_iso():
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    @staticmethod
    def _create_id(prefix):
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _safe_list(value):
        return value if isinstance(value, list) else []

    @classmethod
    def _sanitize_json(cls, value):
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                if cls._SECRET_KEY_RE.search(str(key)):
                    continue
                result[key] = cls._sanitize_json(child)
            return result
        if isinstance(value, list):
            return [cls._sanitize_json(item) for item in value]
        return value

    @classmethod
    def _sanitize_conversation(cls, value):
        if not isinstance(value, dict):
            return None
        conversation_id = str(value.get("id") or "").strip()
        if not conversation_id:
            return None
        created_at = value.get("createdAt") or cls._now_iso()
        assistant_intent = value.get("assistantIntent")
        model = value.get("model")
        return {
            "id": conversation_id,
            "title": str(value.get("title") or "新会话").strip() or "新会话",
            "projectId": str(value.get("projectId") or ""),
            "workspaceId": str(value.get("workspaceId") or ""),
            "canvasId": str(value.get("canvasId") or ""),
            "createdAt": created_at,
            "updatedAt": value.get("updatedAt") or created_at,
            "assistantIntent": copy.deepcopy(assistant_intent) if isinstance(assistant_intent, dict) else None,
            "model": cls._sanitize_json(model) if isinstance(model, dict) else None,
            "messages": cls._sanitize_json(cls._safe_list(value.get("messages"))),
            "contextSnapshots": cls._sanitize_json(cls._safe_list(value.get("contextSnapshots"))),
            "transactions": cls._sanitize_json(cls._safe_list(value.get("transactions"))),
            "generationTasks": cls._sanitize_json(cls._safe_list(value.get("generationTasks"))),
            "receipts": cls._sanitize_json(cls._safe_list(value.get("receipts"))),
        }

    def _load(self):
        if not self._storage_path or not os.path.exists(self._storage_path):
            return []
        try:
            with open(self._storage_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []
        conversations = payload.get("conversations") if isinstance(payload, dict) else payload
        return [
            conversation
            for conversation in (self._sanitize_conversation(item) for item in self._safe_list(conversations))
            if conversation
        ]

    def _persist(self):
        if not self._storage_path:
            return
        directory = os.path.dirname(self._storage_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        payload = {
            "version": 1,
            "updatedAt": self._clock(),
            "conversations": self._conversations,
        }
        with open(self._storage_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    def _touch(self, conversation):
        conversation["updatedAt"] = self._clock()
        self._persist()
        return copy.deepcopy(conversation)

    def _find(self, conversation_id):
        for index, conversation in enumerate(self._conversations):
            if conversation["id"] == conversation_id:
                return index, conversation
        return -1, None

    def list_conversations(self, query=""):
        items = sorted(
            self._conversations,
            key=lambda item: str(item.get("updatedAt") or ""),
            reverse=True,
        )
        text = str(query or "").strip().lower()
        if text:
            items = [
                item
                for item in items
                if text
                in " ".join(
                    str(part)
                    for part in (
                        item.get("title"),
                        item.get("projectId"),
                        (item.get("assistantIntent") or {}).get("id") if isinstance(item.get("assistantIntent"), dict) else "",
                        (item.get("assistantIntent") or {}).get("title") if isinstance(item.get("assistantIntent"), dict) else "",
                        *[message.get("content", "") for message in self._safe_list(item.get("messages")) if isinstance(message, dict)],
                    )
                ).lower()
            ]
        return copy.deepcopy(items)

    def get_conversation(self, conversation_id):
        _, conversation = self._find(str(conversation_id or ""))
        return copy.deepcopy(conversation) if conversation else None

    def create_conversation(self, payload=None):
        payload = payload if isinstance(payload, dict) else {}
        timestamp = self._clock()
        conversation = self._sanitize_conversation(
            {
                "id": self._id_factory("conv"),
                "title": payload.get("title") or "新会话",
                "projectId": payload.get("projectId") or "",
                "workspaceId": payload.get("workspaceId") or "",
                "canvasId": payload.get("canvasId") or "",
                "createdAt": timestamp,
                "updatedAt": timestamp,
                "assistantIntent": payload.get("assistantIntent"),
                "model": payload.get("model"),
                "messages": [],
                "contextSnapshots": [],
                "transactions": [],
                "generationTasks": [],
                "receipts": [],
            }
        )
        self._conversations.append(conversation)
        self._persist()
        return copy.deepcopy(conversation)

    def rename_conversation(self, conversation_id, title):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation:
            return None
        next_title = str(title or "").strip()
        if next_title:
            conversation["title"] = next_title
        return self._touch(conversation)

    def delete_conversation(self, conversation_id):
        index, _ = self._find(str(conversation_id or ""))
        if index < 0:
            return False
        self._conversations.pop(index)
        self._persist()
        return True

    def append_message(self, conversation_id, message):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation or not isinstance(message, dict):
            return None
        conversation["messages"].append(
            {
                "id": str(message.get("id") or self._id_factory("msg")),
                "role": str(message.get("role") or "assistant"),
                "content": str(message.get("content") or ""),
                "status": str(message.get("status") or "done"),
                "createdAt": message.get("createdAt") or self._clock(),
                "traceId": str(message.get("traceId") or ""),
                "actions": copy.deepcopy(self._safe_list(message.get("actions"))),
                "warnings": copy.deepcopy(self._safe_list(message.get("warnings"))),
            }
        )
        return self._touch(conversation)

    def attach_context_snapshot(self, conversation_id, snapshot):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation or not isinstance(snapshot, dict):
            return None
        conversation["contextSnapshots"].append(
            {
                "id": str(snapshot.get("id") or self._id_factory("ctx")),
                "messageId": str(snapshot.get("messageId") or ""),
                "createdAt": snapshot.get("createdAt") or self._clock(),
                "context": copy.deepcopy(snapshot.get("context") if isinstance(snapshot.get("context"), dict) else {}),
            }
        )
        return self._touch(conversation)

    def append_transaction(self, conversation_id, transaction):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation or not isinstance(transaction, dict):
            return None
        conversation["transactions"].append(
            {
                "id": str(transaction.get("id") or self._id_factory("txn")),
                "status": str(transaction.get("status") or "proposed"),
                "createdAt": transaction.get("createdAt") or self._clock(),
                "updatedAt": transaction.get("updatedAt") or self._clock(),
                "actions": copy.deepcopy(self._safe_list(transaction.get("actions"))),
                "receiptId": str(transaction.get("receiptId") or ""),
            }
        )
        return self._touch(conversation)

    def append_receipt(self, conversation_id, receipt):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation or not isinstance(receipt, dict):
            return None
        conversation["receipts"].append(
            {
                "id": str(receipt.get("id") or self._id_factory("rcpt")),
                "transactionId": str(receipt.get("transactionId") or ""),
                "createdAt": receipt.get("createdAt") or self._clock(),
                "success": receipt.get("success") is not False,
                "summary": str(receipt.get("summary") or ""),
                "details": copy.deepcopy(receipt.get("details") if isinstance(receipt.get("details"), dict) else {}),
            }
        )
        return self._touch(conversation)

    def append_generation_task(self, conversation_id, task):
        _, conversation = self._find(str(conversation_id or ""))
        if not conversation or not isinstance(task, dict):
            return None
        conversation["generationTasks"].append(
            {
                "id": str(task.get("id") or self._id_factory("gen")),
                "nodeId": str(task.get("nodeId") or ""),
                "status": str(task.get("status") or "queued"),
                "provider": str(task.get("provider") or ""),
                "model": str(task.get("model") or ""),
                "prompt": str(task.get("prompt") or ""),
                "references": copy.deepcopy(self._safe_list(task.get("references"))),
                "createdAt": task.get("createdAt") or self._clock(),
                "updatedAt": task.get("updatedAt") or self._clock(),
                "error": str(task.get("error") or ""),
            }
        )
        return self._touch(conversation)

    def export_conversation(self, conversation_id):
        conversation = self.get_conversation(conversation_id)
        if not conversation:
            return None
        return self._redact_export(
            {
            "version": 1,
            "exportedAt": self._clock(),
            "conversation": conversation,
            }
        )

    def import_conversations(self, records, project_id=""):
        target_project_id = str(project_id or "").strip()
        imported = 0
        skipped = 0
        for raw in self._safe_list(records):
            conversation = self._sanitize_conversation(raw)
            if not conversation:
                skipped += 1
                continue
            if target_project_id and conversation.get("projectId") != target_project_id:
                skipped += 1
                continue
            index, _existing = self._find(conversation["id"])
            if target_project_id:
                conversation["projectId"] = target_project_id
            if index >= 0:
                self._conversations[index] = conversation
            else:
                self._conversations.append(conversation)
            imported += 1
        if imported:
            self._persist()
        return {"imported": imported, "skipped": skipped}

    @classmethod
    def _redact_export(cls, value):
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                if cls._SECRET_KEY_RE.search(str(key)):
                    continue
                else:
                    result[key] = cls._redact_export(child)
            return result
        if isinstance(value, list):
            return [cls._redact_export(item) for item in value]
        if isinstance(value, str):
            redacted = cls._SECRET_VALUE_RE.sub(
                lambda match: (match.group(1) or match.group(2) or "") + "[redacted]",
                value,
            )
            return cls._LOCAL_VALUE_RE.sub("[redacted]", redacted)
        return value
