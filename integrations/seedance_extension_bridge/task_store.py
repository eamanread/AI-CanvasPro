import time
import threading
import uuid


class SeedanceWebTaskStore:
    def __init__(self, *, clock=None):
        self._clock = clock or time.time
        self._tasks = {}
        self._files = {}
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._prompt_marker_session = "HY" + uuid.uuid4().hex[:4].upper()
        self._prompt_marker_seq = 0

    def _now(self):
        return float(self._clock())

    def _next_prompt_marker(self):
        self._prompt_marker_seq += 1
        return f"{self._prompt_marker_session}A{self._prompt_marker_seq:03d}"

    @staticmethod
    def _prompt_marker_tag(prompt_marker):
        marker = str(prompt_marker or "").strip()
        return f"[[{marker}]]" if marker else ""

    @classmethod
    def _marked_prompt(cls, prompt, prompt_marker):
        marker_tag = cls._prompt_marker_tag(prompt_marker)
        prompt = str(prompt or "").strip()
        return f"{prompt} {marker_tag}".strip() if prompt else marker_tag

    @staticmethod
    def _is_transient_bridge_failure(status, error):
        if str(status or "").strip() != "failed":
            return False
        message = str(error or "").strip().lower()
        if not message:
            return False
        transient_markers = (
            "failed to fetch",
            "network request failed",
            "networkerror",
            "network error",
            "load failed",
            "request timeout",
            "请求超时",
            "网络请求失败",
            "message channel closed",
            "message port closed",
            "receiving end does not exist",
            "extension context invalidated",
            "page script did not respond",
            "overseas page result query failed",
            "video upload back to workbench failed",
        )
        return any(marker in message for marker in transient_markers)

    def create_task(self, payload):
        payload = payload if isinstance(payload, dict) else {}
        with self._condition:
            task_code = "SDW-" + uuid.uuid4().hex[:12].upper()
            prompt = str(payload.get("prompt") or "").strip()
            prompt_marker = self._next_prompt_marker()
            task = {
                "taskCode": task_code,
                "prompt": prompt,
                "promptMarker": prompt_marker,
                "promptMarkerTag": self._prompt_marker_tag(prompt_marker),
                "markedPrompt": self._marked_prompt(prompt, prompt_marker),
                "modelConfig": dict(payload.get("modelConfig") or {}),
                "referenceFiles": list(payload.get("referenceFiles") or []),
                "realSubmit": payload.get("realSubmit") is not False,
                "status": "pending",
                "error": "",
                "createdAt": self._now(),
                "updatedAt": self._now(),
            }
            self._tasks[task_code] = task
            self._condition.notify_all()
            return dict(task)

    def _pending_unlocked(self, include_submitted=False):
        statuses = {"pending"}
        if include_submitted:
            statuses.add("submitted")
        tasks = [
            dict(task)
            for task in self._tasks.values()
            if task.get("status") in statuses
        ]
        return {"success": True, "tasks": tasks, "total": len(tasks)}

    def pending(self, include_submitted=False):
        with self._lock:
            return self._pending_unlocked(include_submitted=include_submitted)

    def wait_pending(self, timeout=25, include_submitted=False):
        try:
            timeout = float(timeout)
        except (TypeError, ValueError):
            timeout = 25.0
        timeout = max(0.0, min(timeout, 25.0))
        deadline = time.monotonic() + timeout
        with self._condition:
            result = self._pending_unlocked(include_submitted=include_submitted)
            if result.get("tasks"):
                return {**result, "waited": True}
            remaining = timeout
            while remaining > 0:
                self._condition.wait(remaining)
                result = self._pending_unlocked(include_submitted=include_submitted)
                if result.get("tasks"):
                    return {**result, "waited": True}
                remaining = deadline - time.monotonic()
            return {"success": True, "tasks": [], "total": 0, "waited": True}

    def update_status(self, payload):
        payload = payload if isinstance(payload, dict) else {}
        task_code = str(payload.get("taskCode") or "").strip()
        if task_code not in self._tasks:
            raise KeyError("任务不存在")
        task = self._tasks[task_code]
        next_status = str(payload.get("status") or task.get("status") or "").strip()
        next_error = str(payload.get("error") or "").strip()
        if self._files.get(task_code) and self._is_transient_bridge_failure(next_status, next_error):
            task["status"] = "completed"
            task["error"] = ""
            task.pop("lastTransientError", None)
            if "resultAnchor" in payload:
                task["resultAnchor"] = payload.get("resultAnchor")
            if "resultProbe" in payload:
                task["resultProbe"] = payload.get("resultProbe")
            task["updatedAt"] = self._now()
            task["completedAt"] = self._now()
            with self._condition:
                self._condition.notify_all()
            return dict(task)
        if (
            task.get("status") in ("pending", "processing", "submitted")
            and self._is_transient_bridge_failure(next_status, next_error)
        ):
            task["status"] = "submitted" if task.get("status") == "processing" else task.get("status")
            task["error"] = ""
            task["lastTransientError"] = next_error
            if "resultAnchor" in payload:
                task["resultAnchor"] = payload.get("resultAnchor")
            if "resultProbe" in payload:
                task["resultProbe"] = payload.get("resultProbe")
            task["updatedAt"] = self._now()
            with self._condition:
                self._condition.notify_all()
            return dict(task)
        task["status"] = next_status
        task["error"] = next_error
        if task["status"] != "submitted":
            task.pop("lastTransientError", None)
        if "resultAnchor" in payload:
            task["resultAnchor"] = payload.get("resultAnchor")
        if "resultProbe" in payload:
            task["resultProbe"] = payload.get("resultProbe")
        task["updatedAt"] = self._now()
        if task["status"] in ("completed", "failed", "timeout"):
            task["completedAt"] = self._now()
        with self._condition:
            self._condition.notify_all()
        return dict(task)

    def add_file(self, payload):
        payload = payload if isinstance(payload, dict) else {}
        task_code = str(payload.get("taskCode") or "").strip()
        if task_code not in self._tasks:
            raise KeyError("任务不存在")
        task = self._tasks[task_code]
        original_url = str(payload.get("originalUrl") or "").strip()
        prompt_marker = str(payload.get("promptMarker") or "").strip()
        expected_prompt_marker = str(task.get("promptMarker") or "").strip()
        if original_url and expected_prompt_marker and prompt_marker != expected_prompt_marker:
            raise ValueError("video prompt marker does not match task")
        if original_url:
            for existing_task_code, files in self._files.items():
                if existing_task_code == task_code:
                    continue
                for existing in files:
                    if str(existing.get("originalUrl") or "").strip() == original_url:
                        raise ValueError("视频来源已被其他任务使用")
        item = {
            "taskCode": task_code,
            "filename": str(payload.get("filename") or "").strip(),
            "localPath": str(payload.get("localPath") or "").strip(),
            "mimeType": str(payload.get("mimeType") or "").strip(),
            "quality": str(payload.get("quality") or "").strip(),
            "originalUrl": original_url,
            "promptMarker": prompt_marker,
            "uploadedAt": self._now(),
        }
        self._files.setdefault(task_code, []).append(item)
        return dict(item)

    def get(self, task_code):
        task_code = str(task_code or "").strip()
        task = self._tasks.get(task_code)
        if not task:
            return None
        files = [dict(item) for item in self._files.get(task_code, [])]
        return {**dict(task), "files": files}
