import json
import os
import re
import time
from urllib.parse import parse_qs, urlparse


class SeedanceWebRouteService:
    _TRUE_VALUES = ("1", "true", "yes", "on")

    def __init__(
        self,
        *,
        bridge_service,
        upload_dir=None,
        upload_dir_getter=None,
        upload_local_prefix="",
    ):
        self.bridge_service = bridge_service
        self.upload_dir = upload_dir or os.path.join(
            "user_data",
            "seedance_web",
            "files",
        )
        self.upload_dir_getter = upload_dir_getter
        self.upload_local_prefix = self._normalize_virtual_prefix(upload_local_prefix)

    @staticmethod
    def _normalize_virtual_prefix(value):
        return str(value or "").replace("\\", "/").strip("/")

    def _upload_dir(self):
        if callable(self.upload_dir_getter):
            return os.path.abspath(os.fspath(self.upload_dir_getter()))
        return os.fspath(self.upload_dir)

    def _response_local_path(self, filename, local_path):
        if self.upload_local_prefix:
            return f"{self.upload_local_prefix}/{filename}".replace("\\", "/")
        return local_path

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {
            "kind": "json_err",
            "code": int(code),
            "message": str(message or ""),
        }

    @classmethod
    def _parse_payload_flag(cls, value):
        if isinstance(value, str):
            return value.strip().lower() in cls._TRUE_VALUES
        return bool(value)

    @classmethod
    def _parse_json_object(cls, body):
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return None, cls._json_err(400, "Invalid JSON")
        if not isinstance(data, dict):
            return None, cls._json_err(400, "Invalid JSON")
        return data, None

    @staticmethod
    def _safe_filename(filename):
        raw = os.path.basename(str(filename or "video.mp4"))
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("._")
        return cleaned or "video.mp4"

    @staticmethod
    def _parse_content_disposition(header_text):
        result = {}
        match = re.search(r'content-disposition:\s*form-data;([^\r\n]*)', header_text, re.I)
        if not match:
            return result
        for key, value in re.findall(r'([A-Za-z0-9_-]+)="([^"]*)"', match.group(1)):
            result[key] = value
        return result

    @staticmethod
    def _parse_part_content_type(header_text):
        match = re.search(r'content-type:\s*([^\r\n]+)', header_text, re.I)
        return match.group(1).strip() if match else ""

    def _parse_multipart_upload(self, handler, body):
        content_type = str(handler.headers.get("Content-Type") or "")
        boundary_match = re.search(r'boundary="?([^";]+)"?', content_type, re.I)
        if not boundary_match:
            raise ValueError("缺少 multipart boundary")
        boundary = ("--" + boundary_match.group(1)).encode("utf-8")
        fields = {}
        files = {}
        for raw_part in (body or b"").split(boundary):
            part = raw_part.strip(b"\r\n")
            if not part or part == b"--":
                continue
            if part.endswith(b"--"):
                part = part[:-2].rstrip(b"\r\n")
            if b"\r\n\r\n" not in part:
                continue
            header_bytes, content = part.split(b"\r\n\r\n", 1)
            header_text = header_bytes.decode("utf-8", errors="ignore")
            disposition = self._parse_content_disposition(header_text)
            name = disposition.get("name", "")
            if not name:
                continue
            filename = disposition.get("filename")
            if filename is not None:
                files[name] = {
                    "filename": filename,
                    "content": content,
                    "mimeType": self._parse_part_content_type(header_text),
                }
            else:
                fields[name] = content.decode("utf-8", errors="ignore").strip()
        task_code = str(fields.get("taskCode") or "").strip()
        quality = str(fields.get("quality") or "").strip()
        mime_type = str(fields.get("mimeType") or "").strip()
        original_url = str(fields.get("originalUrl") or "").strip()
        prompt_marker = str(fields.get("promptMarker") or "").strip()
        file_item = files.get("file")
        if not task_code:
            raise ValueError("缺少任务号")
        if file_item is None:
            raise ValueError("缺少上传文件")
        filename = self._safe_filename(file_item.get("filename") or "video.mp4")
        root, ext = os.path.splitext(filename)
        unique_name = f"{root}_{int(time.time() * 1000)}{ext or '.mp4'}"
        upload_dir = self._upload_dir()
        os.makedirs(upload_dir, exist_ok=True)
        local_path = os.path.join(upload_dir, unique_name)
        with open(local_path, "wb") as f:
            f.write(file_item.get("content") or b"")
        return {
            "taskCode": task_code,
            "filename": filename,
            "localPath": self._response_local_path(unique_name, local_path),
            "mimeType": mime_type or file_item.get("mimeType") or "video/mp4",
            "quality": quality,
            "originalUrl": original_url,
            "promptMarker": prompt_marker,
        }

    @staticmethod
    def _clean_path(path):
        return str(path or "").split("?", 1)[0]

    @staticmethod
    def is_bridge_route(path):
        clean_path = SeedanceWebRouteService._clean_path(path).rstrip("/")
        return clean_path == "/api/v2/seedance-web/bridge" or clean_path.startswith(
            "/api/v2/seedance-web/bridge/"
        )

    @staticmethod
    def _query(path):
        parsed = parse_qs(urlparse(str(path or "")).query)
        return {key: values[-1] for key, values in parsed.items() if values}

    @staticmethod
    def _request_path(handler, fallback_path):
        return str(getattr(handler, "path", "") or fallback_path or "")

    def handle_get(self, handler, path):
        clean_path = self._clean_path(path)
        if clean_path == "/api/v2/seedance-web/status":
            return self._json_ok(
                {
                    "success": True,
                    "status": self.bridge_service.get_status(),
                }
            )
        if clean_path == "/api/v2/seedance-web/bridge/api/tasks/pending":
            query = self._query(self._request_path(handler, path))
            return self._json_ok(
                self.bridge_service.get_pending_tasks(
                    query.get("clientId", ""),
                    include_submitted=self._parse_payload_flag(
                        query.get("includeSubmitted")
                    ),
                )
            )
        if clean_path == "/api/v2/seedance-web/bridge/api/tasks/wait":
            query = self._query(self._request_path(handler, path))
            try:
                timeout = float(query.get("timeout") or 25)
            except (TypeError, ValueError):
                timeout = 25
            return self._json_ok(
                self.bridge_service.wait_pending_tasks(
                    query.get("clientId", ""),
                    timeout=timeout,
                    include_submitted=self._parse_payload_flag(
                        query.get("includeSubmitted", "1")
                    ),
                )
            )
        if clean_path == "/api/v2/seedance-web/query_result":
            query = self._query(self._request_path(handler, path))
            task_code = query.get("taskCode") or query.get("submitId") or ""
            return self._json_ok(self.bridge_service.query_task(task_code))
        return None

    def handle_post(self, handler, path, body):
        clean_path = self._clean_path(path)
        if clean_path == "/api/v2/seedance-web/login":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                runtime = self.bridge_service.start_login(
                    force=self._parse_payload_flag(data.get("force"))
                )
                return self._json_ok({"success": True, "runtime": runtime})
            except Exception as exc:
                return self._json_ok({"success": False, "message": str(exc)})

        if clean_path == "/api/v2/seedance-web/logout":
            try:
                return self._json_ok(
                    {
                        "success": True,
                        "status": self.bridge_service.logout(),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "message": str(exc)})

        if clean_path == "/api/v2/seedance-web/page-status":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok(
                    {
                        "success": True,
                        "status": self.bridge_service.report_page_status(data),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "message": str(exc)})

        if clean_path == "/api/v2/seedance-web/tasks":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok(
                    {
                        "success": True,
                        "task": self.bridge_service.submit_video_task(data),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})

        if clean_path == "/api/v2/seedance-web/bridge/api/tasks/status":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok(
                    {
                        "success": True,
                        "task": self.bridge_service.update_task_status(data),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})

        if clean_path == "/api/v2/seedance-web/bridge/api/tasks/ack":
            data, error = self._parse_json_object(body)
            if error:
                return error
            return self._json_ok(
                {"success": True, "acked": data.get("taskCodes") or []}
            )

        if clean_path == "/api/v2/seedance-web/bridge/api/files/upload":
            try:
                headers = getattr(handler, "headers", {}) or {}
                content_type = str(headers.get("Content-Type") or "")
                if content_type.lower().startswith("multipart/form-data"):
                    data = self._parse_multipart_upload(handler, body)
                else:
                    data, error = self._parse_json_object(body)
                    if error:
                        return error
                return self._json_ok(
                    {
                        "success": True,
                        "file": self.bridge_service.register_uploaded_file(data),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})

        return None
