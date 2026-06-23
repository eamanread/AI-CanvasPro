import time

from .task_store import SeedanceWebTaskStore


class SeedanceWebBridgeService:
    PAGE_STATUS_TTL_SECONDS = 300

    def __init__(self, *, browser_launcher, clock=None, logger=None):
        self.browser_launcher = browser_launcher
        self._clock = clock or time.time
        self._logger = logger
        self._last_runtime = {
            "active": False,
            "phase": "idle",
        }
        self._page_status = {
            "loggedIn": False,
            "updatedAt": 0,
            "connectionState": "not_connected",
            "account": {},
        }
        self._logout_after = 0
        self._tasks = SeedanceWebTaskStore(clock=self._clock)

    def _now(self):
        try:
            return float(self._clock())
        except Exception:
            return time.time()

    def _log(self, message):
        if self._logger is None:
            return
        try:
            self._logger(str(message or ""))
        except Exception:
            pass

    def _fresh_page_status(self):
        status = dict(self._page_status or {})
        updated_at = float(status.get("updatedAt") or 0)
        if updated_at <= 0:
            return {
                "loggedIn": False,
                "updatedAt": 0,
                "connectionState": "not_connected",
                "account": {},
            }
        if self._now() - updated_at > self.PAGE_STATUS_TTL_SECONDS:
            return {
                **status,
                "loggedIn": False,
                "stale": True,
                "connectionState": "not_connected",
                "account": {},
            }
        return status

    def _is_page_connected(self):
        page_status = self._fresh_page_status()
        return page_status.get("connectionState") in ("page_connected", "account_connected")

    @staticmethod
    def _normalize_account(source):
        source = source if isinstance(source, dict) else {}
        account = source.get("account") if isinstance(source.get("account"), dict) else {}
        display_name = str(
            account.get("displayName")
            or account.get("name")
            or account.get("email")
            or source.get("accountName")
            or ""
        ).strip()
        user_id = str(
            account.get("userId")
            or account.get("uid")
            or source.get("userId")
            or ""
        ).strip()
        balance_text = str(
            account.get("balanceText")
            or account.get("creditText")
            or source.get("creditText")
            or source.get("credit")
            or ""
        ).strip()
        normalized = {}
        if display_name:
            normalized["displayName"] = display_name
        if user_id:
            normalized["userId"] = user_id
        if balance_text:
            normalized["balanceText"] = balance_text
        return normalized

    def get_status(self):
        runtime = self.browser_launcher.get_runtime_info()
        page_status = self._fresh_page_status()
        logged_in = bool(page_status.get("loggedIn"))
        account = dict(page_status.get("account") or {}) if logged_in else {}
        credit_text = (
            account.get("balanceText")
            or page_status.get("creditText")
            or page_status.get("credit")
            or ""
        )
        connection_state = page_status.get("connectionState") or (
            "account_connected" if logged_in else "not_connected"
        )
        connected = connection_state in ("page_connected", "account_connected")
        return {
            "provider": "seedance_web",
            "available": bool(runtime.get("browserAvailable"))
            and bool(runtime.get("extensionAvailable", True)),
            "loggedIn": logged_in,
            "message": "海外版网页已连接" if connected else "海外版网页未连接",
            "connectionState": connection_state,
            "account": account,
            "creditText": credit_text,
            "credit": page_status.get("credit"),
            "runtime": runtime,
            "lastLogin": dict(self._last_runtime),
            "pageStatus": page_status,
        }

    def start_login(self, *, force=False):
        self._last_runtime = self.browser_launcher.launch_login(force=bool(force))
        self._log(
            "seedance web login browser started: "
            f"url={self._last_runtime.get('url', '')} "
            f"profile={self._last_runtime.get('profileDir', '')} "
            f"extension={self._last_runtime.get('extensionDir', '')}"
        )
        return dict(self._last_runtime)

    def logout(self):
        self._logout_after = self._now()
        page_connected = bool((self._page_status or {}).get("url"))
        self._last_runtime = {
            "active": False,
            "phase": "profile_preserved",
        }
        self._page_status = {
            "loggedIn": False,
            "updatedAt": self._now(),
            "connectionState": "page_connected" if page_connected else "not_connected",
            "account": {},
            "message": "海外版已退出登录",
        }
        return dict(self._last_runtime)

    def report_page_status(self, payload):
        source = payload if isinstance(payload, dict) else {}
        reported_at = float(source.get("reportedAt") or self._now())
        account = self._normalize_account(source)
        url = str(source.get("url") or "").strip()
        page_connected = bool(url)
        is_login_page = bool(source.get("isLoginPage"))
        has_login_button = bool(source.get("hasLoginButton"))
        authenticated = bool(source.get("authenticated"))
        has_explicit_login_status = bool(source.get("hasExplicitLoginStatus"))
        has_user_avatar = bool(source.get("hasUserAvatar"))

        if self._logout_after and reported_at < self._logout_after:
            return {
                "loggedIn": False,
                "connectionState": "page_connected" if page_connected else "not_connected",
                "account": {},
                "ignoredStaleAfterLogout": True,
                "updatedAt": self._now(),
            }

        has_workspace_signal = bool(
            source.get("hasSubmitButton")
            and (
                source.get("hasPromptEditor")
                or source.get("hasTextarea")
                or source.get("hasFileInput")
                or source.get("hasUploadArea")
                or source.get("hasToolbar")
            )
        )
        logged_in = bool(
            page_connected
            and not is_login_page
            and not has_login_button
            and (account or has_user_avatar)
        )
        connection_state = (
            "account_connected"
            if logged_in
            else ("page_connected" if page_connected else "not_connected")
        )
        if is_login_page or has_login_button or (
            has_explicit_login_status and not authenticated
        ):
            logged_in = False
            account = {}
            connection_state = "page_connected" if page_connected else "not_connected"

        status = {
            "loggedIn": logged_in,
            "connectionState": connection_state,
            "account": account if logged_in else {},
            "url": url,
            "title": str(source.get("title") or "").strip(),
            "message": str(source.get("message") or "").strip(),
            "loginText": str(source.get("loginText") or "").strip(),
            "creditText": account.get("balanceText", "") if logged_in else "",
            "credit": source.get("credit"),
            "authenticated": authenticated,
            "hasExplicitLoginStatus": has_explicit_login_status,
            "updatedAt": self._now(),
        }
        for key in (
            "hasToolbar",
            "hasFileInput",
            "hasSubmitButton",
            "hasTextarea",
            "hasPromptEditor",
            "hasUploadArea",
            "hasLoginButton",
            "hasLogoutButton",
            "hasAccountMenu",
            "hasUserAvatar",
            "isLoginPage",
            "authenticated",
            "hasExplicitLoginStatus",
        ):
            if key in source:
                status[key] = bool(source.get(key))
        self._page_status = status
        self._log(
            "seedance web page status: "
            f"loggedIn={status.get('loggedIn')} "
            f"connectionState={status.get('connectionState')} "
            f"url={status.get('url', '')} "
            f"title={status.get('title', '')}"
        )
        if logged_in:
            self._last_runtime = {
                **dict(self._last_runtime),
                "active": False,
                "phase": "page_logged_in",
            }
        return dict(status)

    def submit_video_task(self, payload):
        if not self._is_page_connected():
            raise RuntimeError("海外版网页未连接，请先打开海外网页")
        return self._tasks.create_task(payload if isinstance(payload, dict) else {})

    def get_pending_tasks(self, client_id="", include_submitted=False):
        return self._tasks.pending(include_submitted=bool(include_submitted))

    def wait_pending_tasks(self, client_id="", timeout=25, include_submitted=True):
        return self._tasks.wait_pending(
            timeout=timeout,
            include_submitted=bool(include_submitted),
        )

    def update_task_status(self, payload):
        return self._tasks.update_status(payload if isinstance(payload, dict) else {})

    def register_uploaded_file(self, payload):
        return self._tasks.add_file(payload if isinstance(payload, dict) else {})

    def query_task(self, task_code):
        task = self._tasks.get(task_code)
        if not task:
            return {"success": False, "status": "not_found", "error": "任务不存在"}
        if task.get("files") and task.get("status") == "failed":
            task = {
                **task,
                "status": "completed",
                "error": "",
            }
        videos = [
            {
                "localPath": item.get("localPath", ""),
                "mimeType": item.get("mimeType", ""),
                "quality": item.get("quality", ""),
                "filename": item.get("filename", ""),
                "originalUrl": item.get("originalUrl", ""),
            }
            for item in task.get("files", [])
        ]
        return {"success": True, **task, "videos": videos}
