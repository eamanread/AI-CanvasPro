import copy
import json
import os
import re
import time
import uuid


class CanvasAgentExecutionService:
    _RESTART_RESTORE_LINE = "重启后已暂停，可继续执行"
    _SECRET_KEY_RE = re.compile(r"(api[_-]?key|authorization|secret|token|password|credential|headers|cookie)", re.I)
    _SECRET_VALUE_RE = re.compile(
        r"(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+|(Bearer\s+)[A-Za-z0-9._-]+|"
        r"s[k]-[A-Za-z0-9_-]{8,}",
        re.I,
    )
    _LOCAL_KEY_RE = re.compile(r"(local[_-]?path|file[_-]?path|filesystem[_-]?path|absolute[_-]?path)", re.I)
    _LOCAL_VALUE_RE = re.compile(
        r"data:[^\s\"'<>]+|blob:[^\s\"'<>]+|[A-Za-z]:\\[^\"'<>|]+",
        re.I,
    )
    _QUEUE_STATUSES = {"queued", "queued_draft"}
    _ACTIVE_STATUSES = {
        "draft",
        "queued",
        "queued_draft",
        "executing",
        "waiting_confirmation",
        "waiting_video_authorization",
        "paused",
        "failed",
    }

    def __init__(self, storage_path=None, clock=None, id_factory=None, max_executions=50, prepare_runner=None):
        self._storage_path = storage_path
        self._clock = clock or self._now_iso
        self._id_factory = id_factory or self._create_id
        self._max_executions = max(1, int(max_executions or 50))
        self._prepare_runner = prepare_runner
        self._executions = self._load()

    @staticmethod
    def _now_iso():
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    @staticmethod
    def _create_id(prefix):
        return f"{prefix}_{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _safe_list(value):
        return value if isinstance(value, list) else []

    @staticmethod
    def _safe_dict(value):
        return value if isinstance(value, dict) else {}

    @classmethod
    def _sanitize_json(cls, value, key=""):
        if cls._SECRET_KEY_RE.search(str(key)) or cls._LOCAL_KEY_RE.search(str(key)):
            return None
        if isinstance(value, dict):
            result = {}
            for child_key, child in value.items():
                sanitized = cls._sanitize_json(child, child_key)
                if sanitized is not None:
                    result[child_key] = sanitized
            return result
        if isinstance(value, list):
            return [item for item in (cls._sanitize_json(child, key) for child in value) if item is not None]
        if isinstance(value, str):
            if cls._LOCAL_VALUE_RE.search(value):
                return ""
            return cls._SECRET_VALUE_RE.sub(lambda match: (match.group(1) or match.group(2) or "") + "[redacted]", value)
        return copy.deepcopy(value)

    @classmethod
    def _sanitize_drawer_state(cls, value):
        data = cls._safe_dict(value)
        return {
            "visible": data.get("visible") is True,
            "expanded": data.get("expanded") is True,
            "line1": str(data.get("line1") or ""),
            "line2": str(data.get("line2") or ""),
            "queueWarning": data.get("queueWarning") is True,
            "queuePaused": data.get("queuePaused") is True,
            "pendingConfirmationCount": max(0, int(data.get("pendingConfirmationCount") or 0)),
        }

    @classmethod
    def _sanitize_progress(cls, value):
        data = cls._safe_dict(value)
        return {
            "done": max(0, int(data.get("done") or 0)),
            "total": max(0, int(data.get("total") or 0)),
            "currentStepId": str(data.get("currentStepId") or ""),
        }

    @classmethod
    def _sanitize_orchestrator_state(cls, value, status):
        data = cls._safe_dict(value)
        return {
            "nextActionIndex": max(0, int(data.get("nextActionIndex") or 0)),
            "pausedAtActionId": str(data.get("pausedAtActionId") or ""),
            "running": data.get("running") is True and status == "executing",
        }

    @classmethod
    def _sanitize_timeline_node_ids(cls, value):
        node_ids = []
        for key in (
            "nodeIds",
            "affectedNodeIds",
            "createdNodeIds",
            "updatedNodeIds",
            "queuedGenerationNodeIds",
            "startedGenerationNodeIds",
        ):
            for node_id in cls._safe_list(value.get(key)):
                text = str(node_id or "").strip()
                if text and text not in node_ids:
                    node_ids.append(text)
        return node_ids

    @staticmethod
    def _sanitize_duration_ms(value):
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    _INVERSE_OP_TYPES = {"remove_node", "remove_edge", "restore_node", "restore_node_position"}

    @classmethod
    def _sanitize_inverse(cls, value):
        data = cls._safe_dict(value)
        ops = []
        for op in cls._safe_list(data.get("ops")):
            if not isinstance(op, dict):
                continue
            op_type = str(op.get("type") or "")
            if op_type not in cls._INVERSE_OP_TYPES:
                continue
            node_id = str(op.get("nodeId") or "").strip()
            edge_id = str(op.get("edgeId") or "").strip()
            if not node_id and not edge_id:
                continue
            if op_type == "restore_node_position":
                try:
                    x = float(op.get("x"))
                    y = float(op.get("y"))
                except (TypeError, ValueError):
                    continue
                if not node_id:
                    continue
                sanitized = {"type": op_type, "nodeId": node_id, "x": x, "y": y}
                signature = op.get("signature")
                if isinstance(signature, str) and signature:
                    clean_signature = cls._sanitize_json(signature, "signature")
                    if clean_signature:
                        sanitized["signature"] = clean_signature
                ops.append(sanitized)
                continue
            sanitized = {"type": op_type}
            if node_id:
                sanitized["nodeId"] = node_id
            if edge_id:
                sanitized["edgeId"] = edge_id
            if op_type == "restore_node":
                sanitized["name"] = str(op.get("name") or "")
                sanitized["data"] = (
                    cls._sanitize_json(op.get("data"))
                    if isinstance(op.get("data"), dict)
                    else {}
                )
            signature = op.get("signature")
            if isinstance(signature, str) and signature:
                clean_signature = cls._sanitize_json(signature, "signature")
                if clean_signature:
                    sanitized["signature"] = clean_signature
            ops.append(sanitized)
        if not ops:
            return None
        return {"aiOwned": data.get("aiOwned") is True, "ops": ops}

    @classmethod
    def _sanitize_timeline_event(cls, value, *, clock, id_factory):
        if not isinstance(value, dict):
            return None
        inverse = cls._sanitize_inverse(value.get("inverse"))
        return {
            **({"inverse": inverse} if inverse else {}),
            "id": str(value.get("id") or id_factory("evt")),
            "stepId": str(value.get("stepId") or ""),
            "actionId": str(value.get("actionId") or ""),
            "status": str(value.get("status") or "pending"),
            "humanSummary": str(value.get("humanSummary") or value.get("summary") or ""),
            "error": str(cls._sanitize_json(value.get("error")) or ""),
            "nodeIds": cls._sanitize_timeline_node_ids(value),
            "canRetry": value.get("canRetry") is True,
            "canUndo": value.get("canUndo") is True,
            "durationMs": cls._sanitize_duration_ms(value.get("durationMs")),
            **({"target": {
                "actionType": str(value["target"].get("actionType") or ""),
                "nodeType": str(value["target"].get("nodeType") or ""),
                "nodeIds": [str(n).strip() for n in cls._safe_list(value["target"].get("nodeIds")) if str(n).strip()],
                "stepId": str(value["target"].get("stepId") or ""),
            }} if isinstance(value.get("target"), dict) else {}),
            "createdAt": value.get("createdAt") or clock(),
            "updatedAt": value.get("updatedAt") or value.get("createdAt") or clock(),
            "developer": cls._sanitize_json(value.get("developer")) if isinstance(value.get("developer"), dict) else {},
        }

    @classmethod
    def _sanitize_execution(cls, value, *, clock, id_factory):
        if not isinstance(value, dict):
            return None
        execution_id = str(value.get("id") or "").strip()
        if not execution_id:
            return None
        created_at = value.get("createdAt") or clock()
        timeline = [
            event
            for event in (
                cls._sanitize_timeline_event(item, clock=clock, id_factory=id_factory)
                for item in cls._safe_list(value.get("timeline"))
            )
            if event
        ]
        status = str(value.get("status") or "draft")
        return {
            "id": execution_id,
            "projectId": str(value.get("projectId") or ""),
            "conversationId": str(value.get("conversationId") or ""),
            "intentId": str(value.get("intentId") or ""),
            "planId": str(value.get("planId") or ""),
            "matchedSkills": [str(s).strip() for s in cls._safe_list(value.get("matchedSkills")) if str(s).strip()],
            "title": str(value.get("title") or "AI 执行任务").strip() or "AI 执行任务",
            "status": status,
            "queueIndex": max(0, int(value.get("queueIndex") or 0)),
            "progress": cls._sanitize_progress(value.get("progress")),
            "drawerState": cls._sanitize_drawer_state(value.get("drawerState")),
            "orchestratorState": cls._sanitize_orchestrator_state(value.get("orchestratorState"), status),
            "summary": str(value.get("summary") or ""),
            "plan": cls._sanitize_json(value.get("plan")) if isinstance(value.get("plan"), dict) else {},
            "actionsByStep": cls._sanitize_json(value.get("actionsByStep")) if isinstance(value.get("actionsByStep"), dict) else {},
            "developer": cls._sanitize_json(value.get("developer")) if isinstance(value.get("developer"), dict) else {},
            "createdAt": created_at,
            "updatedAt": value.get("updatedAt") or created_at,
            "timeline": timeline,
        }

    def _load(self):
        if not self._storage_path or not os.path.exists(self._storage_path):
            return []
        try:
            with open(self._storage_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return []
        items = payload.get("executions") if isinstance(payload, dict) else payload
        restored_any = False
        executions = [
            execution
            for execution in (
                self._sanitize_execution(item, clock=self._clock, id_factory=self._id_factory)
                for item in self._safe_list(items)
            )
            if execution
        ]
        restored = []
        for execution in executions:
            next_execution = self._restore_interrupted_execution(
                execution,
                reason="backend_storage_restart",
            )
            if next_execution is not execution:
                restored_any = True
            restored.append(next_execution)
        self._executions = restored
        if restored_any:
            self._persist()
        return restored

    def _restore_interrupted_execution(self, execution, *, reason):
        if not execution or execution.get("status") != "executing":
            return execution
        has_restore_event = any(event.get("status") == "restored_paused" for event in execution.get("timeline", []))
        next_execution = {
            **execution,
            "status": "paused",
            "updatedAt": self._clock(),
            "drawerState": {
                **execution.get("drawerState", {}),
                "visible": True,
                "line2": self._RESTART_RESTORE_LINE,
            },
            "orchestratorState": {
                **execution.get("orchestratorState", {}),
                "running": False,
            },
            "timeline": list(execution.get("timeline") or []),
        }
        if not has_restore_event:
            restore_event = self._sanitize_timeline_event(
                {
                    "status": "restored_paused",
                    "humanSummary": self._RESTART_RESTORE_LINE,
                    "canRetry": False,
                    "canUndo": False,
                    "developer": {
                        "restoreReason": reason,
                        "previousStatus": "executing",
                        "previousRunning": execution.get("orchestratorState", {}).get("running") is True,
                    },
                },
                clock=self._clock,
                id_factory=self._id_factory,
            )
            next_execution["timeline"].append(restore_event)
        return self._sanitize_execution(next_execution, clock=self._clock, id_factory=self._id_factory)

    def _persist(self):
        if not self._storage_path:
            return
        directory = os.path.dirname(self._storage_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        payload = {"version": 1, "updatedAt": self._clock(), "executions": self._executions}
        with open(self._storage_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)

    def _find(self, execution_id):
        for index, execution in enumerate(self._executions):
            if execution["id"] == execution_id:
                return index, execution
        return -1, None

    def _prune(self):
        by_project = {}
        for execution in self._executions:
            by_project.setdefault(str(execution.get("projectId") or ""), []).append(execution)
        keep_ids = set()
        for items in by_project.values():
            if len(items) <= self._max_executions:
                keep_ids.update(item["id"] for item in items)
                continue
            active = [item for item in items if item.get("status") in self._ACTIVE_STATUSES]
            index_by_id = {item["id"]: index for index, item in enumerate(items)}
            inactive = sorted(
                [item for item in items if item.get("status") not in self._ACTIVE_STATUSES],
                key=lambda item: (str(item.get("updatedAt") or ""), index_by_id.get(item["id"], 0)),
                reverse=True,
            )
            keep_ids.update(item["id"] for item in (active + inactive)[: self._max_executions])
        self._executions = [item for item in self._executions if item["id"] in keep_ids]

    def list_executions(self, filters=None):
        filters = filters or {}
        items = list(self._executions)
        for key in ("projectId", "conversationId"):
            value = str(filters.get(key) or "").strip()
            if value:
                items = [item for item in items if str(item.get(key) or "") == value]
        status_value = str(filters.get("status") or "").strip()
        if status_value:
            if status_value == "queued":
                items = [item for item in items if str(item.get("status") or "") in self._QUEUE_STATUSES]
            else:
                items = [item for item in items if str(item.get("status") or "") == status_value]
        return copy.deepcopy(
            sorted(
                items,
                key=lambda item: (
                    0 if item.get("status") in self._QUEUE_STATUSES else 1,
                    int(item.get("queueIndex") or 0) if item.get("status") in self._QUEUE_STATUSES else 0,
                    str(item.get("createdAt") or ""),
                ),
            )
        )

    def get_execution(self, execution_id):
        _, execution = self._find(str(execution_id or ""))
        return copy.deepcopy(execution) if execution else None

    def upsert_execution(self, payload):
        payload = payload if isinstance(payload, dict) else {}
        timestamp = self._clock()
        execution = self._sanitize_execution(
            {
                **payload,
                "id": payload.get("id") or self._id_factory("exec"),
                "createdAt": payload.get("createdAt") or timestamp,
                "updatedAt": timestamp,
            },
            clock=self._clock,
            id_factory=self._id_factory,
        )
        index, _existing = self._find(execution["id"])
        if index >= 0:
            self._executions[index] = execution
        else:
            self._executions.append(execution)
        self._prune()
        self._persist()
        return copy.deepcopy(execution)

    def append_timeline_event(self, execution_id, event):
        _, execution = self._find(str(execution_id or ""))
        if not execution:
            return None
        next_event = self._sanitize_timeline_event(
            event if isinstance(event, dict) else {},
            clock=self._clock,
            id_factory=self._id_factory,
        )
        execution["timeline"].append(next_event)
        execution["updatedAt"] = self._clock()
        if next_event.get("humanSummary"):
            execution["drawerState"]["line2"] = next_event["humanSummary"]
        self._persist()
        return copy.deepcopy(execution)

    def update_status(self, execution_id, status, patch=None):
        _, execution = self._find(str(execution_id or ""))
        if not execution:
            return None
        patch = patch if isinstance(patch, dict) else {}
        merged = {**execution, **patch, "status": str(status or execution.get("status") or "draft")}
        if "drawerState" in patch:
            merged["drawerState"] = {**execution.get("drawerState", {}), **self._safe_dict(patch.get("drawerState"))}
        if "orchestratorState" in patch:
            merged["orchestratorState"] = {
                **execution.get("orchestratorState", {}),
                **self._safe_dict(patch.get("orchestratorState")),
            }
        merged["updatedAt"] = self._clock()
        sanitized = self._sanitize_execution(merged, clock=self._clock, id_factory=self._id_factory)
        index, _ = self._find(execution["id"])
        self._executions[index] = sanitized
        self._persist()
        return copy.deepcopy(sanitized)

    def prepare_queued_execution(self, execution_id, payload=None):
        _, execution = self._find(str(execution_id or ""))
        if not execution or not callable(self._prepare_runner):
            return None
        payload = payload if isinstance(payload, dict) else {}
        safe_payload = self._sanitize_json(payload)
        if not isinstance(safe_payload, dict):
            safe_payload = {}
        runner_payload = {
            **safe_payload,
            "execution": copy.deepcopy(execution),
            "executionId": execution["id"],
            "context": safe_payload.get("context") if isinstance(safe_payload.get("context"), dict) else {},
            "agentMode": str(safe_payload.get("agentMode") or ""),
            "videoAuthorized": safe_payload.get("videoAuthorized") is True,
        }
        prepared = self._prepare_runner(runner_payload)
        if not isinstance(prepared, dict):
            prepared = {}
        sanitized = self._sanitize_json(prepared)
        if not isinstance(sanitized, dict):
            sanitized = {}
        sanitized.pop("context", None)
        sanitized.pop("executionContext", None)
        update_patch = dict(sanitized)
        if execution.get("status") == "queued_draft":
            actions_by_step = update_patch.get("actionsByStep")
            has_fresh_actions = isinstance(actions_by_step, dict) and any(
                isinstance(actions, list) and actions for actions in actions_by_step.values()
            )
            if not has_fresh_actions:
                return None
        if "drawerState" in update_patch:
            update_patch["drawerState"] = {
                **execution.get("drawerState", {}),
                **self._safe_dict(update_patch.get("drawerState")),
            }
        next_status = "queued" if execution.get("status") == "queued_draft" else (execution.get("status") or "queued")
        updated = self.update_status(execution["id"], next_status, update_patch)
        if not updated:
            return None
        return {
            key: copy.deepcopy(updated.get(key))
            for key in ("plan", "actionsByStep", "drawerState", "developer", "summary")
            if key in update_patch
        }

    def _queued_executions(self, project_id):
        queued = [
            execution
            for execution in self._executions
            if execution.get("status") in self._QUEUE_STATUSES
            and str(execution.get("projectId") or "") == str(project_id or "")
        ]
        return sorted(queued, key=lambda item: (int(item.get("queueIndex") or 0), str(item.get("createdAt") or "")))

    def _renumber_queue(self, project_id):
        for index, execution in enumerate(self._queued_executions(project_id), 1):
            execution["queueIndex"] = index

    def control_queued_execution(self, execution_id, action, target_index=None, ordered_ids=None):
        action = str(action or "").strip().lower()
        if action not in {"top", "move", "reorder", "pause", "resume", "cancel"}:
            return None
        _, execution = self._find(str(execution_id or ""))
        if not execution or execution.get("status") not in self._QUEUE_STATUSES:
            return None
        status = execution.get("status") or "queued"
        project_id = execution.get("projectId") or ""
        if action == "pause":
            return self.update_status(
                execution["id"],
                status,
                {"drawerState": {**execution.get("drawerState", {}), "queuePaused": True, "line2": "已暂停排队"}},
            )
        if action == "resume":
            return self.update_status(
                execution["id"],
                status,
                {"drawerState": {**execution.get("drawerState", {}), "queuePaused": False, "line2": "排队中"}},
            )
        if action == "cancel":
            return self.update_status(
                execution["id"],
                "cancelled",
                {
                    "queueIndex": 0,
                    "drawerState": {
                        **execution.get("drawerState", {}),
                        "visible": False,
                        "queuePaused": False,
                        "line2": "已取消",
                    },
                },
            )
        if action == "move":
            try:
                requested_index = int(target_index)
            except (TypeError, ValueError):
                return None
            queued = self._queued_executions(project_id)
            without_target = [item for item in queued if item.get("id") != execution.get("id")]
            insert_index = max(0, min(len(without_target), requested_index))
            ordered = without_target[:insert_index] + [execution] + without_target[insert_index:]
            for index, item in enumerate(ordered, 1):
                item["queueIndex"] = index
            execution["updatedAt"] = self._clock()
            self._renumber_queue(project_id)
            sanitized = self._sanitize_execution(execution, clock=self._clock, id_factory=self._id_factory)
            index, _ = self._find(execution["id"])
            self._executions[index] = sanitized
            self._persist()
            return copy.deepcopy(sanitized)
        if action == "reorder":
            queued = self._queued_executions(project_id)
            queued_by_id = {str(item.get("id") or ""): item for item in queued}
            requested_ids = []
            for raw_id in ordered_ids or []:
                item_id = str(raw_id or "").strip()
                if item_id and item_id in queued_by_id and item_id not in requested_ids:
                    requested_ids.append(item_id)
            if len(requested_ids) < 2:
                return None
            ordered = [queued_by_id[item_id] for item_id in requested_ids] + [
                item for item in queued if str(item.get("id") or "") not in requested_ids
            ]
            for index, item in enumerate(ordered, 1):
                item["queueIndex"] = index
                if str(item.get("id") or "") in requested_ids:
                    item["updatedAt"] = self._clock()
            self._renumber_queue(project_id)
            sanitized = self._sanitize_execution(execution, clock=self._clock, id_factory=self._id_factory)
            index, _ = self._find(execution["id"])
            self._executions[index] = sanitized
            self._persist()
            return copy.deepcopy(sanitized)
        first_index = min((item.get("queueIndex") or 0 for item in self._queued_executions(project_id)), default=1)
        execution["queueIndex"] = first_index - 1
        execution["updatedAt"] = self._clock()
        self._renumber_queue(project_id)
        sanitized = self._sanitize_execution(execution, clock=self._clock, id_factory=self._id_factory)
        index, _ = self._find(execution["id"])
        self._executions[index] = sanitized
        self._persist()
        return copy.deepcopy(sanitized)

    def compute_metrics(self, filters=None):
        """Server-side mirror of assistantExecutionMetrics.computeExecutionMetrics."""
        filters = filters or {}
        project_id = str(filters.get("projectId") or "").strip()
        executions = [
            item for item in self._executions
            if not project_id or str(item.get("projectId") or "") == project_id
        ]
        total = len(executions)
        with_skill = 0
        action_completed = 0
        action_failed = 0
        action_blocked = 0
        duration_sum = 0
        duration_count = 0
        failed_executions = 0
        failed_with_recovery = 0
        findable = 0
        for execution in executions:
            if self._safe_list(execution.get("matchedSkills")):
                with_skill += 1
            if str(execution.get("id") or "").strip():
                findable += 1
            saw_failed = False
            saw_recovery = False
            for event in self._safe_list(execution.get("timeline")):
                status = str(event.get("status") or "")
                if status == "completed":
                    action_completed += 1
                    duration = self._sanitize_duration_ms(event.get("durationMs"))
                    if duration > 0:
                        duration_sum += duration
                        duration_count += 1
                    if saw_failed:
                        saw_recovery = True
                elif status == "failed":
                    action_failed += 1
                    saw_failed = True
                elif status == "blocked_by_skill":
                    action_blocked += 1
                elif saw_failed and status in ("skipped", "undone"):
                    saw_recovery = True
            if str(execution.get("status") or "") == "failed" or saw_failed:
                failed_executions += 1
                if saw_recovery:
                    failed_with_recovery += 1
        terminal_actions = action_completed + action_failed + action_blocked
        return {
            "totalExecutions": total,
            "skillHitRate": (with_skill / total) if total else 0,
            "actionCompletedCount": action_completed,
            "actionFailedCount": action_failed,
            "actionBlockedBySkillCount": action_blocked,
            "actionValidityRate": (action_completed / terminal_actions) if terminal_actions else 0,
            "failedExecutionsCount": failed_executions,
            "failedExecutionsWithRecovery": failed_with_recovery,
            "failureRecoveryRate": (failed_with_recovery / failed_executions) if failed_executions else 0,
            "executionFindabilityRate": (findable / total) if total else 1,
            "avgActionDurationMs": (duration_sum / duration_count) if duration_count else 0,
        }

    RECEIPTS_SCHEMA_VERSION = "huanying-execution-receipts/v1"

    def export_receipts(self, filters=None):
        """Read-only receipts projection for the QMAI review-memory flywheel.

        Symmetric counterpart of the QMAI->Huanying memory file bridge:
        Huanying exports execution receipts, QMAI consumes them read-only.
        Output is sanitized; nothing is written back into the QMAI project.
        """
        filters = filters or {}
        project_id = str(filters.get("projectId") or "").strip()
        executions = [
            item for item in self._executions
            if not project_id or str(item.get("projectId") or "") == project_id
        ]
        projected = []
        for execution in executions:
            timeline = []
            undone_count = 0
            for event in self._safe_list(execution.get("timeline")):
                status = str(event.get("status") or "")
                if status == "undone":
                    undone_count += 1
                timeline.append({
                    "status": status,
                    "durationMs": self._sanitize_duration_ms(event.get("durationMs")),
                    **({"error": str(self._sanitize_json(event.get("error")) or "")} if event.get("error") else {}),
                })
            projected.append({
                "id": str(execution.get("id") or ""),
                "title": str(execution.get("title") or ""),
                "status": str(execution.get("status") or ""),
                "matchedSkills": [str(s) for s in self._safe_list(execution.get("matchedSkills"))],
                "undoneCount": undone_count,
                "timeline": timeline,
            })
        return self._sanitize_json({
            "schemaVersion": self.RECEIPTS_SCHEMA_VERSION,
            "generatedAt": self._clock(),
            **({"projectId": project_id} if project_id else {}),
            "metrics": self.compute_metrics(filters),
            "executions": projected,
        })

    def clear_completed(self, filters=None):
        filters = filters or {}
        project_id = str(filters.get("projectId") or "").strip()
        before = len(self._executions)
        self._executions = [
            execution
            for execution in self._executions
            if execution.get("status") != "completed"
            or (project_id and execution.get("projectId") != project_id)
        ]
        removed = before - len(self._executions)
        self._persist()
        return removed
