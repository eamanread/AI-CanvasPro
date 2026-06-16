# Seedance Web Account Data And Video Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让工作台通过海外版 Dreamina/Seedance 网页真实读取账号数据、提交视频任务、自动生成并拿回视频文件。

**Architecture:** 保留现有 `integrations/seedance_extension_bridge` 可拔插模块。后端负责严格账号状态、任务队列、任务结果和文件落盘；Chrome 扩展后台负责连接海外网页、读取账号数据、领取任务并调用已有 content 脚本能力完成填词、上传、点击生成、找结果、上传视频。

**Tech Stack:** Python `unittest`，Node `node:test` / `node --check`，Chrome MV3 extension，现有本地 HTTP 服务 `server.py`。

---

## 文件结构

- Modify: `integrations/seedance_extension_bridge/bridge_service.py`  
  严格登录状态、账号数据保存、任务提交/查询/状态更新、上传结果登记。
- Modify: `integrations/seedance_extension_bridge/route_service.py`  
  增加 `/tasks`、`/query_result`、`/bridge/api/tasks/*`、`/bridge/api/files/upload` 路由。
- Create: `integrations/seedance_extension_bridge/task_store.py`  
  负责内存任务队列、任务状态、任务结果文件元数据。第一阶段用内存，避免引入复杂持久化；后续可落 `user_data/seedance_web/tasks.json`。
- Modify: `integrations/seedance_extension_bridge/extension/background.js`  
  后台自动轮询任务、读取账号数据、执行任务，不依赖扩展 panel。
- Modify: `integrations/seedance_extension_bridge/extension/content.js`  
  增加严格账号数据提取函数，增强 `getPageInfo()` 返回账号数据和强未登录信号。
- Modify: `integrations/seedance_extension_bridge/extension/manifest.json`  
  升版本号，确保内置浏览器刷新扩展缓存。
- Modify: `api/seedanceWebApi.js`  
  增加提交任务和查询任务 API。
- Modify: `api/index.js`  
  导出新增海外版 API。
- Modify: `modules/settings/seedanceWebSettings.js`  
  设置页显示账号数据返回后的真实登录状态，退出登录后不被旧心跳恢复。
- Modify: `modules/settings/seedanceWebSettings.test.js`  
  覆盖账号数据驱动的显示逻辑。
- Modify: `seedance_web_bridge_service_test.py`  
  覆盖严格登录、退出状态、任务闭环。
- Modify: `seedance_extension_background_test.py`  
  覆盖扩展后台自动任务轮询与账号数据要求。

## Task 1: 严格账号数据登录状态

**Files:**
- Modify: `seedance_web_bridge_service_test.py`
- Modify: `integrations/seedance_extension_bridge/bridge_service.py`

- [ ] **Step 1: Write failing tests for account-backed login**

Add these tests to `SeedanceWebBridgeServiceTests`:

```python
def test_account_data_is_required_for_logged_in_status(self):
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: 1000.0,
    )

    reported = service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "hasPromptEditor": True,
            "hasSubmitButton": True,
            "hasLoginButton": False,
            "isLoginPage": False,
        }
    )

    self.assertFalse(reported["loggedIn"])
    self.assertEqual(reported["connectionState"], "page_connected")
    self.assertFalse(service.get_status()["loggedIn"])


def test_account_data_marks_seedance_web_as_logged_in(self):
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: 1000.0,
    )

    reported = service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "hasPromptEditor": True,
            "hasSubmitButton": True,
            "hasLoginButton": False,
            "isLoginPage": False,
            "account": {
                "displayName": "demo-user",
                "balanceText": "Credits 120",
            },
        }
    )
    status = service.get_status()

    self.assertTrue(reported["loggedIn"])
    self.assertEqual(reported["connectionState"], "account_connected")
    self.assertEqual(status["account"]["balanceText"], "Credits 120")
    self.assertTrue(status["loggedIn"])


def test_sign_in_button_overwrites_previous_account_data(self):
    now = [1000.0]
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: now[0],
    )

    service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "hasLoginButton": False,
            "account": {"displayName": "demo-user", "balanceText": "Credits 120"},
        }
    )
    now[0] += 2.0
    reported = service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/",
            "hasLoginButton": True,
            "loginText": "Sign in",
        }
    )

    self.assertFalse(reported["loggedIn"])
    self.assertEqual(reported["connectionState"], "page_connected")
    self.assertEqual(service.get_status()["account"], {})
    self.assertFalse(service.get_status()["loggedIn"])
```

- [ ] **Step 2: Run tests and verify red**

Run: `python -m unittest seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_account_data_is_required_for_logged_in_status seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_account_data_marks_seedance_web_as_logged_in seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_sign_in_button_overwrites_previous_account_data`

Expected: FAIL because `connectionState` and account-backed login are not implemented.

- [ ] **Step 3: Implement strict status helpers**

In `bridge_service.py`, add helpers near `_fresh_page_status()`:

```python
    @staticmethod
    def _normalize_account(source):
        account = source.get("account") if isinstance(source, dict) else {}
        account = account if isinstance(account, dict) else {}
        display_name = str(
            account.get("displayName")
            or account.get("name")
            or account.get("email")
            or source.get("accountName")
            or ""
        ).strip()
        user_id = str(account.get("userId") or account.get("uid") or source.get("userId") or "").strip()
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

    @classmethod
    def _has_account_data(cls, source):
        return bool(cls._normalize_account(source))
```

Change `report_page_status()` login decision to:

```python
        account = self._normalize_account(source)
        has_account_data = bool(account)
        has_login_button = bool(source.get("hasLoginButton"))
        is_login_page = bool(source.get("isLoginPage"))
        page_connected = bool(str(source.get("url") or "").strip())
        logged_in = bool(page_connected and not is_login_page and not has_login_button and has_account_data)
        connection_state = "account_connected" if logged_in else ("page_connected" if page_connected else "not_connected")
```

In the `status` dict, include:

```python
            "connectionState": connection_state,
            "account": account if logged_in else {},
```

Update `get_status()` to return `account`, `connectionState`, and use `account.balanceText` as `creditText`.

- [ ] **Step 4: Run tests and verify green**

Run the same command from Step 2. Expected: PASS.

- [ ] **Step 5: Run related bridge tests**

Run: `python -m unittest seedance_web_bridge_service_test -v`  
Expected: PASS, or update old tests that expected toolbar-only login to the new stricter account-data behavior.

## Task 2: 退出登录状态锁，防止旧心跳恢复

**Files:**
- Modify: `seedance_web_bridge_service_test.py`
- Modify: `integrations/seedance_extension_bridge/bridge_service.py`

- [ ] **Step 1: Write failing logout lock test**

Add:

```python
def test_logout_blocks_old_heartbeat_until_account_data_returns(self):
    now = [1000.0]
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: now[0],
    )
    service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "account": {"displayName": "demo", "balanceText": "Credits 120"},
        }
    )
    service.logout()
    now[0] += 1.0

    old_page = service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "hasPromptEditor": True,
            "hasSubmitButton": True,
        }
    )

    self.assertFalse(old_page["loggedIn"])
    self.assertFalse(service.get_status()["loggedIn"])
    self.assertEqual(service.get_status()["account"], {})
```

- [ ] **Step 2: Run test and verify red**

Run: `python -m unittest seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_logout_blocks_old_heartbeat_until_account_data_returns`

Expected: FAIL if old page heartbeat can restore login.

- [ ] **Step 3: Implement logout generation guard**

In `__init__`, add:

```python
        self._logout_after = 0
```

In `logout()`:

```python
        self._logout_after = self._now()
```

In `report_page_status()`, after `source = ...`:

```python
        reported_at = float(source.get("reportedAt") or self._now())
        account = self._normalize_account(source)
        if self._logout_after and reported_at < self._logout_after and not account:
            return {
                "loggedIn": False,
                "connectionState": "page_connected",
                "account": {},
                "ignoredStaleAfterLogout": True,
                "updatedAt": self._now(),
            }
```

If no `reportedAt` is present, only account data can restore login after logout.

- [ ] **Step 4: Run test and verify green**

Run the command from Step 2. Expected: PASS.

## Task 3: 扩展提取账号数据

**Files:**
- Modify: `seedance_extension_background_test.py`
- Modify: `integrations/seedance_extension_bridge/extension/content.js`
- Modify: `integrations/seedance_extension_bridge/extension/background.js`
- Modify: `integrations/seedance_extension_bridge/extension/manifest.json`

- [ ] **Step 1: Write failing source-level tests**

Add to `seedance_extension_background_test.py`:

```python
def test_content_page_info_reports_account_data_and_sign_in_text(self):
    source = (
        Path(__file__).resolve().parent
        / "integrations"
        / "seedance_extension_bridge"
        / "extension"
        / "content.js"
    ).read_text(encoding="utf-8")
    block = source.split("function getPageInfo()", 1)[1].split("function findByText", 1)[0]

    self.assertIn("extractSeedanceAccountData", source)
    self.assertIn("account", block)
    self.assertIn("loginText", block)
    self.assertIn("balanceText", source)


def test_background_forwards_account_data_to_workbench(self):
    source = BACKGROUND_PATH.read_text(encoding="utf-8")
    block = source.split("function buildSeedancePageStatusFromInfo", 1)[1].split(
        "function isSeedancePageUrl", 1
    )[0]

    self.assertIn("account", block)
    self.assertIn("balanceText", block)
    self.assertIn("loginText", block)
```

- [ ] **Step 2: Run tests and verify red**

Run: `python -m unittest seedance_extension_background_test -v`

Expected: FAIL because strict account extraction is incomplete.

- [ ] **Step 3: Add content account extraction**

In `content.js`, add before `getPageInfo()`:

```javascript
  function extractSeedanceAccountData(bodyText = '') {
    const text = String(bodyText || document.body?.innerText || '').replace(/\u00a0/g, ' ');
    const account = {};
    const balancePattern = /(Credits?|Balance|Quota|Remaining|余额|额度|可用)[^\n]{0,80}/i;
    const balanceMatch = text.match(balancePattern);
    if (balanceMatch) {
      account.balanceText = balanceMatch[0].trim();
    }
    const accountCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="account" i], [aria-label*="profile" i], [data-testid*="account" i], [data-testid*="profile" i], button, a, [role="button"]'
    ))
      .map((el) => String(el.getAttribute?.('aria-label') || el.textContent || '').trim())
      .filter((value) => value && value.length <= 80 && !/sign in|login|log in/i.test(value));
    const accountText = accountCandidates.find((value) => /@|account|profile|user|credits?|余额|额度/i.test(value));
    if (accountText) {
      account.displayName = accountText;
    }
    return account;
  }
```

In `getPageInfo()`, compute and return:

```javascript
    const account = extractSeedanceAccountData(bodyText);
    const loginText = hasLoginButton ? 'Sign in' : '';
```

Return fields:

```javascript
      account,
      loginText,
      creditText: account.balanceText || creditText,
```

Keep `loggedIn` as a derived best-effort field, but backend will ignore it without account data.

- [ ] **Step 4: Forward account through background**

In `background.js`, inside `buildSeedancePageStatusFromInfo(info)`, add:

```javascript
  const account = source.account && typeof source.account === 'object' ? source.account : {};
  const balanceText = String(account.balanceText || source.creditText || source.credit || '').trim();
```

Return:

```javascript
    account: {
      ...account,
      ...(balanceText ? { balanceText } : {}),
    },
    loginText: String(source.loginText || '').trim(),
    creditText: balanceText,
```

Apply the same shape in `collectSeedanceStatusFromPage()`.

- [ ] **Step 5: Bump extension version**

Change `manifest.json` version from current value to the next patch version, for example:

```json
"version": "1.3.6"
```

- [ ] **Step 6: Verify**

Run:

```bash
python -m unittest seedance_extension_background_test -v
node --check integrations/seedance_extension_bridge/extension/content.js
node --check integrations/seedance_extension_bridge/extension/background.js
```

Expected: all PASS / no syntax errors.

## Task 4: 后端任务队列与结果存储

**Files:**
- Create: `integrations/seedance_extension_bridge/task_store.py`
- Modify: `seedance_web_bridge_service_test.py`
- Modify: `integrations/seedance_extension_bridge/bridge_service.py`

- [ ] **Step 1: Write failing task store tests inside bridge test**

Add:

```python
def test_submit_video_task_creates_pending_seedance_task(self):
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: 1000.0,
    )
    service.report_page_status(
        {
            "url": "https://dreamina.capcut.com/ai-tool/home/",
            "account": {"displayName": "demo", "balanceText": "Credits 120"},
        }
    )

    task = service.submit_video_task(
        {
            "prompt": "a dog running",
            "modelConfig": {"model": "Seedance 2.0", "aspectRatio": "16:9", "duration": "5s"},
            "referenceFiles": [],
        }
    )

    self.assertTrue(task["taskCode"].startswith("SDW-"))
    self.assertEqual(task["status"], "pending")
    self.assertEqual(service.get_pending_tasks("client-1")["total"], 1)


def test_query_completed_task_returns_uploaded_video(self):
    service = SeedanceWebBridgeService(
        browser_launcher=_StubBrowserLauncher(),
        clock=lambda: 1000.0,
    )
    task = service.submit_video_task({"prompt": "a dog"})
    service.update_task_status({"taskCode": task["taskCode"], "status": "completed"})
    service.register_uploaded_file(
        {
            "taskCode": task["taskCode"],
            "filename": "demo.mp4",
            "localPath": "user_data/seedance_web/files/demo.mp4",
            "mimeType": "video/mp4",
        }
    )

    result = service.query_task(task["taskCode"])

    self.assertTrue(result["success"])
    self.assertEqual(result["status"], "completed")
    self.assertEqual(result["videos"][0]["localPath"], "user_data/seedance_web/files/demo.mp4")
```

- [ ] **Step 2: Run tests and verify red**

Run: `python -m unittest seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_submit_video_task_creates_pending_seedance_task seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_query_completed_task_returns_uploaded_video`

Expected: ERROR because methods do not exist.

- [ ] **Step 3: Create task store**

Create `task_store.py`:

```python
import time
import uuid


class SeedanceWebTaskStore:
    def __init__(self, *, clock=None):
        self._clock = clock or time.time
        self._tasks = {}
        self._files = {}

    def _now(self):
        return float(self._clock())

    def create_task(self, payload):
        task_code = "SDW-" + uuid.uuid4().hex[:12].upper()
        task = {
            "taskCode": task_code,
            "prompt": str((payload or {}).get("prompt") or "").strip(),
            "modelConfig": dict((payload or {}).get("modelConfig") or {}),
            "referenceFiles": list((payload or {}).get("referenceFiles") or []),
            "realSubmit": (payload or {}).get("realSubmit") is not False,
            "status": "pending",
            "error": "",
            "createdAt": self._now(),
            "updatedAt": self._now(),
        }
        self._tasks[task_code] = task
        return dict(task)

    def pending(self):
        tasks = [dict(task) for task in self._tasks.values() if task.get("status") == "pending"]
        return {"success": True, "tasks": tasks, "total": len(tasks)}

    def update_status(self, payload):
        task_code = str((payload or {}).get("taskCode") or "").strip()
        if task_code not in self._tasks:
            raise KeyError("任务不存在")
        task = self._tasks[task_code]
        task["status"] = str((payload or {}).get("status") or task.get("status") or "").strip()
        task["error"] = str((payload or {}).get("error") or "").strip()
        task["updatedAt"] = self._now()
        if task["status"] in ("completed", "failed", "timeout"):
            task["completedAt"] = self._now()
        return dict(task)

    def add_file(self, payload):
        task_code = str((payload or {}).get("taskCode") or "").strip()
        if task_code not in self._tasks:
            raise KeyError("任务不存在")
        item = {
            "taskCode": task_code,
            "filename": str((payload or {}).get("filename") or "").strip(),
            "localPath": str((payload or {}).get("localPath") or "").strip(),
            "mimeType": str((payload or {}).get("mimeType") or "").strip(),
            "quality": str((payload or {}).get("quality") or "").strip(),
            "uploadedAt": self._now(),
        }
        self._files.setdefault(task_code, []).append(item)
        return dict(item)

    def get(self, task_code):
        task = self._tasks.get(str(task_code or "").strip())
        if not task:
            return None
        files = [dict(item) for item in self._files.get(task["taskCode"], [])]
        return {**dict(task), "files": files}
```

- [ ] **Step 4: Wire task store into bridge service**

In `bridge_service.py` import and initialize:

```python
from .task_store import SeedanceWebTaskStore
```

In `__init__`:

```python
        self._tasks = SeedanceWebTaskStore(clock=self._clock)
```

Add methods:

```python
    def submit_video_task(self, payload):
        status = self.get_status()
        if not status.get("loggedIn"):
            raise RuntimeError("海外版账号数据未确认，请网页登录后重试")
        return self._tasks.create_task(payload if isinstance(payload, dict) else {})

    def get_pending_tasks(self, client_id=""):
        return self._tasks.pending()

    def update_task_status(self, payload):
        return self._tasks.update_status(payload if isinstance(payload, dict) else {})

    def register_uploaded_file(self, payload):
        return self._tasks.add_file(payload if isinstance(payload, dict) else {})

    def query_task(self, task_code):
        task = self._tasks.get(task_code)
        if not task:
            return {"success": False, "status": "not_found", "error": "任务不存在"}
        videos = [
            {"localPath": item.get("localPath", ""), "mimeType": item.get("mimeType", ""), "quality": item.get("quality", "")}
            for item in task.get("files", [])
        ]
        return {"success": True, **task, "videos": videos}
```

- [ ] **Step 5: Run tests and verify green**

Run: `python -m unittest seedance_web_bridge_service_test -v`  
Expected: PASS.

## Task 5: 后端任务和文件路由

**Files:**
- Modify: `integrations/seedance_extension_bridge/route_service.py`
- Modify: `seedance_web_route_service_test.py`

- [ ] **Step 1: Write route tests**

Create or extend `seedance_web_route_service_test.py` with:

```python
def test_tasks_route_submits_video_task(self):
    bridge = _StubSeedanceWebBridgeService()
    bridge.submit_video_task = lambda payload: {"taskCode": "SDW-1", "status": "pending", **payload}
    service = SeedanceWebRouteService(bridge_service=bridge)

    response = service.handle_post(
        object(),
        "/api/v2/seedance-web/tasks",
        json.dumps({"prompt": "dog"}).encode("utf-8"),
    )

    self.assertTrue(response["data"]["success"])
    self.assertEqual(response["data"]["task"]["taskCode"], "SDW-1")


def test_bridge_pending_route_returns_tasks(self):
    bridge = _StubSeedanceWebBridgeService()
    bridge.get_pending_tasks = lambda client_id="": {"success": True, "tasks": [{"taskCode": "SDW-1"}], "total": 1}
    service = SeedanceWebRouteService(bridge_service=bridge)

    response = service.handle_get(object(), "/api/v2/seedance-web/bridge/api/tasks/pending")

    self.assertEqual(response["data"]["total"], 1)


def test_query_result_route_returns_task_result(self):
    bridge = _StubSeedanceWebBridgeService()
    bridge.query_task = lambda task_code: {"success": True, "taskCode": task_code, "status": "completed"}
    service = SeedanceWebRouteService(bridge_service=bridge)

    response = service.handle_get(object(), "/api/v2/seedance-web/query_result?taskCode=SDW-1")

    self.assertTrue(response["data"]["success"])
    self.assertEqual(response["data"]["taskCode"], "SDW-1")
```

- [ ] **Step 2: Run tests and verify red**

Run: `python -m unittest seedance_web_route_service_test -v`  
Expected: FAIL for missing routes.

- [ ] **Step 3: Implement JSON routes**

In `route_service.py`, import:

```python
from urllib.parse import parse_qs, urlparse
```

Add helper:

```python
    @staticmethod
    def _clean_path(path):
        return str(path or "").split("?", 1)[0]

    @staticmethod
    def _query(path):
        return {k: v[-1] for k, v in parse_qs(urlparse(str(path or "")).query).items()}
```

In `handle_get()` use `clean_path = self._clean_path(path)` and add:

```python
        if clean_path == "/api/v2/seedance-web/bridge/api/tasks/pending":
            query = self._query(path)
            return self._json_ok(self.bridge_service.get_pending_tasks(query.get("clientId", "")))

        if clean_path == "/api/v2/seedance-web/query_result":
            query = self._query(path)
            task_code = query.get("taskCode") or query.get("submitId") or ""
            return self._json_ok(self.bridge_service.query_task(task_code))
```

In `handle_post()` add:

```python
        if path == "/api/v2/seedance-web/tasks":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok({"success": True, "task": self.bridge_service.submit_video_task(data)})
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})

        if path == "/api/v2/seedance-web/bridge/api/tasks/status":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok({"success": True, "task": self.bridge_service.update_task_status(data)})
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})
```

Add `/ack` as a no-op success for compatibility:

```python
        if path == "/api/v2/seedance-web/bridge/api/tasks/ack":
            data, error = self._parse_json_object(body)
            if error:
                return error
            return self._json_ok({"success": True, "acked": data.get("taskCodes") or []})
```

- [ ] **Step 4: Run route tests**

Run: `python -m unittest seedance_web_route_service_test -v`  
Expected: PASS.

## Task 6: 视频文件上传路由

**Files:**
- Modify: `integrations/seedance_extension_bridge/route_service.py`
- Modify: `integrations/seedance_extension_bridge/bridge_service.py`
- Modify: `seedance_web_route_service_test.py`

- [ ] **Step 1: Write minimal upload route test**

Add a test that avoids multipart parsing by sending JSON metadata first:

```python
def test_bridge_file_upload_metadata_registers_result(self):
    bridge = _StubSeedanceWebBridgeService()
    bridge.register_uploaded_file = lambda payload: {"localPath": payload["localPath"], "filename": payload["filename"]}
    service = SeedanceWebRouteService(bridge_service=bridge)

    response = service.handle_post(
        object(),
        "/api/v2/seedance-web/bridge/api/files/upload",
        json.dumps(
            {
                "taskCode": "SDW-1",
                "filename": "demo.mp4",
                "localPath": "user_data/seedance_web/files/demo.mp4",
                "mimeType": "video/mp4",
            }
        ).encode("utf-8"),
    )

    self.assertTrue(response["data"]["success"])
    self.assertEqual(response["data"]["file"]["filename"], "demo.mp4")
```

- [ ] **Step 2: Run test and verify red**

Run: `python -m unittest seedance_web_route_service_test -v`  
Expected: FAIL for missing upload route.

- [ ] **Step 3: Implement metadata upload route**

In `route_service.py` `handle_post()`:

```python
        if path == "/api/v2/seedance-web/bridge/api/files/upload":
            data, error = self._parse_json_object(body)
            if error:
                return error
            try:
                return self._json_ok({"success": True, "file": self.bridge_service.register_uploaded_file(data)})
            except Exception as exc:
                return self._json_ok({"success": False, "error": str(exc)})
```

This first step supports extension JSON metadata upload. If binary multipart is needed during implementation, add a second route path after confirming actual extension upload shape.

- [ ] **Step 4: Run route tests**

Run: `python -m unittest seedance_web_route_service_test -v`  
Expected: PASS.

## Task 7: 扩展后台自动领取并执行任务

**Files:**
- Modify: `seedance_extension_background_test.py`
- Modify: `integrations/seedance_extension_bridge/extension/background.js`

- [ ] **Step 1: Write source-level tests**

Add:

```python
def test_background_auto_polls_pending_tasks_without_panel(self):
    source = BACKGROUND_PATH.read_text(encoding="utf-8")

    self.assertIn("startSeedanceTaskPolling", source)
    self.assertIn("pollSeedancePendingTasks", source)
    self.assertIn("/api/tasks/pending", source)
    self.assertIn("executeSeedanceBridgeTask", source)
    self.assertIn("doGenerate", source)
    self.assertIn("clickGenerate", source)
    self.assertIn("findVideoByTaskCode", source)
    self.assertIn("captureAndUpload", source)
```

- [ ] **Step 2: Run test and verify red**

Run: `python -m unittest seedance_extension_background_test.SeedanceExtensionBackgroundTests.test_background_auto_polls_pending_tasks_without_panel`

Expected: FAIL.

- [ ] **Step 3: Implement background polling skeleton**

In `background.js`, add:

```javascript
const SEEDANCE_BRIDGE_API_BASE = 'http://127.0.0.1:8777/api/v2/seedance-web/bridge';
let seedanceTaskPollTimer = null;
let seedanceExecutingTask = false;

async function findActiveSeedanceTab() {
  const tabs = await chrome.tabs.query({ url: SEEDANCE_PAGE_URL_PATTERNS });
  return (tabs || []).find((tab) => isSeedancePageUrl(tab.url));
}

async function bridgeFetch(path, options = {}) {
  const resp = await fetch(`${SEEDANCE_BRIDGE_API_BASE}${path}`, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function reportBridgeTaskStatus(taskCode, status, error = '') {
  return bridgeFetch('/api/tasks/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskCode, status, error: error || '' }),
  });
}
```

- [ ] **Step 4: Implement task execution using existing content messages**

Add:

```javascript
async function executeSeedanceBridgeTask(task) {
  const tab = await findActiveSeedanceTab();
  if (!tab) throw new Error('海外版网页未连接');
  const taskCode = String(task.taskCode || '').trim();
  await reportBridgeTaskStatus(taskCode, 'processing');
  const filesData = (task.referenceFiles || []).map((file) => ({
    name: file.fileName || file.name || 'reference.png',
    data: file.base64 || file.data || '',
    type: file.fileType || file.type || 'image/png',
  }));
  const promptWithCode = task.prompt ? `${taskCode}，${task.prompt}` : taskCode;
  const generateResp = await chrome.tabs.sendMessage(tab.id, {
    action: 'doGenerate',
    files: filesData,
    prompt: promptWithCode,
    aspectRatio: task.modelConfig && task.modelConfig.aspectRatio,
  });
  if (!generateResp || generateResp.success === false) {
    throw new Error(generateResp && generateResp.error || '海外版网页填词或上传失败');
  }
  await chrome.tabs.sendMessage(tab.id, { action: 'clickGenerate' });
  await reportBridgeTaskStatus(taskCode, 'submitted');
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: 'findVideoByTaskCode',
      taskCode,
    });
    if (result && result.status === 'failed') {
      throw new Error(result.message || '海外版视频生成失败');
    }
    if (result && result.status === 'completed' && result.videoUrl) {
      const uploadResult = await chrome.tabs.sendMessage(tab.id, {
        action: 'captureAndUpload',
        taskCode,
        serverUrl: SEEDANCE_BRIDGE_API_BASE,
        quality: 'standard',
      });
      if (!uploadResult || uploadResult.uploaded <= 0) {
        throw new Error(uploadResult && uploadResult.message || '视频上传回工作台失败');
      }
      await reportBridgeTaskStatus(taskCode, 'completed');
      return;
    }
  }
  throw new Error('海外版视频生成超时');
}
```

- [ ] **Step 5: Implement polling loop**

Add:

```javascript
async function pollSeedancePendingTasks() {
  if (seedanceExecutingTask) return;
  seedanceExecutingTask = true;
  try {
    const data = await bridgeFetch('/api/tasks/pending?clientId=background');
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    for (const task of tasks) {
      try {
        await executeSeedanceBridgeTask(task);
      } catch (err) {
        await reportBridgeTaskStatus(task.taskCode, 'failed', err.message || String(err));
      }
    }
  } catch (err) {
    console.warn('[Seedance BG] 任务轮询失败:', err.message);
  } finally {
    seedanceExecutingTask = false;
  }
}

function startSeedanceTaskPolling() {
  if (seedanceTaskPollTimer) return;
  setTimeout(pollSeedancePendingTasks, 2000);
  seedanceTaskPollTimer = setInterval(pollSeedancePendingTasks, 5000);
}

startSeedanceTaskPolling();
```

- [ ] **Step 6: Verify**

Run:

```bash
python -m unittest seedance_extension_background_test -v
node --check integrations/seedance_extension_bridge/extension/background.js
```

Expected: PASS / no syntax errors.

## Task 8: API wrapper and settings UI state

**Files:**
- Modify: `api/seedanceWebApi.js`
- Modify: `api/index.js`
- Modify: `modules/settings/seedanceWebSettings.js`
- Modify: `modules/settings/seedanceWebSettings.test.js`

- [ ] **Step 1: Add API tests**

Extend `api/seedanceWebApi.test.js`:

```javascript
test("seedanceWebApi: submit video task posts to seedance tasks endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return createJsonResponse({ success: true, task: { taskCode: "SDW-1" } }, url, "POST");
  };
  const { submitSeedanceWebVideoTask } = await import("./seedanceWebApi.js");

  const result = await submitSeedanceWebVideoTask({ prompt: "dog" });

  assert.equal(calls[0].url, "/api/v2/seedance-web/tasks");
  assert.equal(result.taskCode, "SDW-1");
});

test("seedanceWebApi: query result reads seedance task", async () => {
  globalThis.fetch = async (url) =>
    createJsonResponse({ success: true, status: "completed", videos: [{ localPath: "demo.mp4" }] }, url);
  const { querySeedanceWebResult } = await import("./seedanceWebApi.js");

  const result = await querySeedanceWebResult("SDW-1");

  assert.equal(result.status, "completed");
  assert.equal(result.videos[0].localPath, "demo.mp4");
});
```

- [ ] **Step 2: Run tests and verify red**

Run: `node --test api/seedanceWebApi.test.js`  
Expected: FAIL for missing functions.

- [ ] **Step 3: Implement API functions**

In `api/seedanceWebApi.js`:

```javascript
export async function submitSeedanceWebVideoTask(payload = {}) {
  const response = await post("/api/v2/seedance-web/tasks", payload);
  const data = assertSuccess(response, "提交海外版视频任务失败");
  if (data.success === false) {
    throw new Error(data.error || "提交海外版视频任务失败");
  }
  return data.task || data;
}

export async function querySeedanceWebResult(taskCode) {
  const code = String(taskCode || "").trim();
  if (!code) {
    throw new Error("缺少海外版任务号");
  }
  const response = await get(`/api/v2/seedance-web/query_result?taskCode=${encodeURIComponent(code)}`);
  const data = assertSuccess(response, "查询海外版视频任务失败");
  if (data.success === false) {
    throw new Error(data.error || "查询海外版视频任务失败");
  }
  return data;
}
```

Export them from `api/index.js`.

- [ ] **Step 4: Update settings UI tests for account-backed status**

In `modules/settings/seedanceWebSettings.test.js`, update logged-in render test to use:

```javascript
renderSeedanceWebStatus(dom.root, {
  loggedIn: true,
  connectionState: "account_connected",
  account: { displayName: "demo", balanceText: "Credits 120" },
  message: "海外版账号已连接",
});
assert.equal(dom.creditText.textContent, "Credits 120");
```

Add test:

```javascript
test("seedanceWebSettings: page connected without account data is not rendered as logged in", () => {
  const dom = createMockRoot("overseas");
  renderSeedanceWebStatus(dom.root, {
    loggedIn: false,
    connectionState: "page_connected",
    account: {},
  });
  assert.equal(dom.mainStatusText.textContent, "未登录");
  assert.match(dom.creditText.textContent, /登录|账号|确认/);
});
```

- [ ] **Step 5: Update UI render logic**

In `seedanceWebSettings.js`, derive:

```javascript
  const account = status?.account || {};
  const loggedIn = !!status?.loggedIn && !!(
    account.balanceText ||
    account.displayName ||
    account.userId ||
    status?.creditText
  );
```

Show balance from:

```javascript
const creditSource = account.balanceText || status?.creditText || status?.credit;
```

For not logged in but page connected, message:

```javascript
"海外版网页已连接，账号数据未确认"
```

- [ ] **Step 6: Verify**

Run:

```bash
node --test api/seedanceWebApi.test.js modules/settings/seedanceWebSettings.test.js
```

Expected: PASS.

## Task 9: 手动闭环验证

**Files:**
- No code files required.

- [ ] **Step 1: Run automated checks**

Run:

```bash
python -m unittest seedance_extension_background_test seedance_web_bridge_service_test seedance_web_route_service_test seedance_extension_manifest_test
node --test api/seedanceWebApi.test.js modules/settings/seedanceWebSettings.test.js
node --check integrations/seedance_extension_bridge/extension/content.js
node --check integrations/seedance_extension_bridge/extension/background.js
```

Expected: all pass.

- [ ] **Step 2: Start project using user-approved script**

Use the project startup script only when the user has the service stopped or asks for it:

```bat
start_windows_dev.bat
```

Expected: `http://127.0.0.1:8777/api/v2/seedance-web/status` returns JSON.

- [ ] **Step 3: Verify account data**

Open overseas login browser from settings. After logging in, call:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8777/api/v2/seedance-web/status | ConvertTo-Json -Depth 8
```

Expected:

```json
{
  "loggedIn": true,
  "connectionState": "account_connected",
  "account": {
    "balanceText": "..."
  }
}
```

If `Sign in` is visible in the browser, expected `loggedIn` is `false`.

- [ ] **Step 4: Submit a minimal test task**

Use the UI video node if wired, or direct API for backend-extension validation:

```powershell
$body = @{
  prompt = "a cute dog running on grass"
  modelConfig = @{ model = "Seedance 2.0"; aspectRatio = "16:9"; duration = "5s" }
  referenceFiles = @()
  realSubmit = $true
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8777/api/v2/seedance-web/tasks -ContentType "application/json" -Body $body
```

Expected: returns `task.taskCode`.

- [ ] **Step 5: Query until completed**

Run:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8777/api/v2/seedance-web/query_result?taskCode=SDW-REPLACE" | ConvertTo-Json -Depth 8
```

Expected terminal success:

```json
{
  "success": true,
  "status": "completed",
  "videos": [
    { "localPath": "..." }
  ]
}
```

Expected terminal failure must include a concrete `error`, such as `"海外版账号数据未确认，请网页登录后重试"` or `"海外版视频生成超时"`。

## Self-Review

- Spec coverage: 账号数据判定由 Tasks 1-3 覆盖；退出登录由 Task 2 覆盖；任务队列、任务结果、文件回传由 Tasks 4-7 覆盖；UI 展示由 Task 8 覆盖；真实闭环由 Task 9 覆盖。
- Placeholder scan: no TBD/TODO/fill-later placeholders are used.
- Type consistency: `taskCode` is used for Seedance Web tasks; status values are `pending`、`processing`、`submitted`、`completed`、`failed`、`timeout`; account fields are `displayName`、`userId`、`balanceText`.
