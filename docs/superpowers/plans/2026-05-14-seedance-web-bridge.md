# 海外版 Seedance Web Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个可拔插的海外版 Seedance/Dreamina 网页扩展桥接入口，让设置页“海外版”登录调用独立接口，同时不影响国内版 Dreamina CLI。

**Architecture:** 后端新增 `integrations/seedance_extension_bridge` 模块，提供状态、登录、退出与扩展任务桥接骨架；`server.py` 只负责实例化并注册路由。前端新增独立 `api/seedanceWebApi.js` 和设置页增强模块，海外版按钮转调 `/api/v2/seedance-web/*`，国内版仍使用原 `/api/v2/dreamina/*`。

**Tech Stack:** Python `unittest` 后端路由测试，Node `node:test` 前端 API/DOM 测试，Chrome MV3 扩展资源，PowerShell/Windows 本地开发环境。

---

## 文件结构

- Create: `integrations/seedance_extension_bridge/__init__.py`  
  标记独立集成包，导出主要服务。
- Create: `integrations/seedance_extension_bridge/browser_launcher.py`  
  负责解析内置扩展目录、独立 profile 目录、浏览器可执行文件，并启动 Chromium/Chrome/Edge。
- Create: `integrations/seedance_extension_bridge/bridge_service.py`  
  提供 `get_status()`、`start_login()`、`logout()`，后续任务桥接也只从这里扩展。
- Create: `integrations/seedance_extension_bridge/route_service.py`  
  提供 `/api/v2/seedance-web/*` 的 HTTP 路由适配。
- Create: `integrations/seedance_extension_bridge/README.md`  
  中文说明边界、目录和调试方式。
- Create: `integrations/seedance_extension_bridge/extension/`  
  从桌面 `Seedance2-Chrome-Extensions-master` 复制扩展资源，排除运行数据。
- Create: `seedance_web_route_service_test.py`  
  覆盖状态、登录、退出路由和 JSON 错误。
- Create: `seedance_web_bridge_service_test.py`  
  覆盖登录启动参数、profile 路径、状态返回。
- Modify: `services/http_route_dispatcher.py`  
  注入并分发 `seedance_web_route_service_getter`，只读取 `/api/v2/seedance-web/` 请求体。
- Modify: `http_route_dispatcher_test.py`  
  增加海外路由分发测试，确保 Dreamina 路由不吞海外请求。
- Modify: `server.py`  
  实例化 Seedance Web bridge/route service，加入敏感 API 前缀。
- Create: `api/seedanceWebApi.js`  
  独立前端 API 包装。
- Create: `api/seedanceWebApi.test.js`  
  覆盖 status/login/logout 请求路径、错误处理。
- Modify: `api/index.js`  
  导出海外版 API。
- Create: `modules/settings/seedanceWebSettings.js`  
  设置页海外版增强：海外版隐藏国内 JSON/QR 提示区域，登录/退出走新接口。
- Create: `modules/settings/seedanceWebSettings.test.js`  
  用最小 DOM 验证海外版 UI 增强不会改国内版行为。
- Modify: `modules/settings/apiSettings.js`  
  在初始化设置扩展时调用 `initSeedanceWebSettings()`。
- Modify: `style.css`  
  只添加海外版状态提示需要的少量 scoped 样式。

## Task 1: 后端 Route Service 测试

**Files:**
- Create: `seedance_web_route_service_test.py`
- Create: `integrations/seedance_extension_bridge/route_service.py`

- [ ] **Step 1: Write the failing route service tests**

```python
import json
import unittest

from integrations.seedance_extension_bridge.route_service import SeedanceWebRouteService


class _StubSeedanceWebBridgeService:
    def __init__(self):
        self.login_calls = []
        self.logout_calls = 0

    def get_status(self):
        return {"available": True, "loggedIn": False}

    def start_login(self, force=False):
        self.login_calls.append({"force": bool(force)})
        return {"started": True, "force": bool(force)}

    def logout(self):
        self.logout_calls += 1
        return {"loggedOut": True}


class SeedanceWebRouteServiceTests(unittest.TestCase):
    def test_status_route_returns_bridge_status(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        response = service.handle_get(object(), "/api/v2/seedance-web/status")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertTrue(response["data"]["status"]["available"])

    def test_login_route_passes_force_flag(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(
            object(),
            "/api/v2/seedance-web/login",
            json.dumps({"force": True}).encode("utf-8"),
        )

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(bridge.login_calls, [{"force": True}])
        self.assertTrue(response["data"]["runtime"]["started"])

    def test_logout_route_uses_bridge_logout(self):
        bridge = _StubSeedanceWebBridgeService()
        service = SeedanceWebRouteService(bridge_service=bridge)

        response = service.handle_post(object(), "/api/v2/seedance-web/logout", b"{}")

        self.assertEqual(response["kind"], "json_ok")
        self.assertTrue(response["data"]["success"])
        self.assertEqual(bridge.logout_calls, 1)

    def test_invalid_json_returns_400(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        response = service.handle_post(object(), "/api/v2/seedance-web/login", b"{")

        self.assertEqual(response["kind"], "json_err")
        self.assertEqual(response["code"], 400)

    def test_unknown_route_returns_none(self):
        service = SeedanceWebRouteService(bridge_service=_StubSeedanceWebBridgeService())

        self.assertIsNone(service.handle_get(object(), "/api/v2/dreamina/status"))
        self.assertIsNone(service.handle_post(object(), "/api/v2/dreamina/login", b"{}"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest seedance_web_route_service_test.py -v`  
Expected: FAIL/ERROR because `integrations.seedance_extension_bridge.route_service` does not exist.

- [ ] **Step 3: Implement minimal route service**

```python
import json


class SeedanceWebRouteService:
    _TRUE_VALUES = ("1", "true", "yes", "on")

    def __init__(self, *, bridge_service):
        self.bridge_service = bridge_service

    @staticmethod
    def _json_ok(data):
        return {"kind": "json_ok", "data": data}

    @staticmethod
    def _json_err(code, message):
        return {"kind": "json_err", "code": int(code), "message": str(message or "")}

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

    def handle_get(self, handler, path):
        if path == "/api/v2/seedance-web/status":
            return self._json_ok(
                {
                    "success": True,
                    "status": self.bridge_service.get_status(),
                }
            )
        return None

    def handle_post(self, handler, path, body):
        if path == "/api/v2/seedance-web/login":
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

        if path == "/api/v2/seedance-web/logout":
            try:
                return self._json_ok(
                    {
                        "success": True,
                        "status": self.bridge_service.logout(),
                    }
                )
            except Exception as exc:
                return self._json_ok({"success": False, "message": str(exc)})

        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest seedance_web_route_service_test.py -v`  
Expected: PASS.

## Task 2: 后端 Bridge Service 和浏览器启动测试

**Files:**
- Create: `seedance_web_bridge_service_test.py`
- Create: `integrations/seedance_extension_bridge/browser_launcher.py`
- Create: `integrations/seedance_extension_bridge/bridge_service.py`
- Create: `integrations/seedance_extension_bridge/__init__.py`
- Create: `integrations/seedance_extension_bridge/README.md`

- [ ] **Step 1: Write failing bridge service tests**

```python
import os
import tempfile
import unittest

from integrations.seedance_extension_bridge.bridge_service import SeedanceWebBridgeService


class _StubBrowserLauncher:
    def __init__(self):
        self.calls = []

    def get_runtime_info(self):
        return {
            "extensionDir": "C:/app/integrations/seedance_extension_bridge/extension",
            "profileDir": "C:/state/user_data/seedance_web/profile",
            "browserPath": "C:/Program Files/Google/Chrome/Application/chrome.exe",
            "browserAvailable": True,
        }

    def launch_login(self, *, force=False):
        self.calls.append({"force": bool(force)})
        return {
            "active": True,
            "phase": "browser_started",
            "url": "https://dreamina.capcut.com/",
        }


class SeedanceWebBridgeServiceTests(unittest.TestCase):
    def test_status_includes_runtime_paths_and_provider(self):
        service = SeedanceWebBridgeService(browser_launcher=_StubBrowserLauncher())

        status = service.get_status()

        self.assertTrue(status["available"])
        self.assertEqual(status["provider"], "seedance_web")
        self.assertTrue(status["runtime"]["browserAvailable"])
        self.assertIn("profile", status["runtime"]["profileDir"])

    def test_start_login_uses_browser_launcher(self):
        launcher = _StubBrowserLauncher()
        service = SeedanceWebBridgeService(browser_launcher=launcher)

        runtime = service.start_login(force=True)

        self.assertEqual(launcher.calls, [{"force": True}])
        self.assertTrue(runtime["active"])
        self.assertEqual(runtime["phase"], "browser_started")

    def test_logout_returns_profile_preserved_status(self):
        service = SeedanceWebBridgeService(browser_launcher=_StubBrowserLauncher())

        status = service.logout()

        self.assertFalse(status["active"])
        self.assertEqual(status["phase"], "profile_preserved")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest seedance_web_bridge_service_test.py -v`  
Expected: FAIL/ERROR because bridge service does not exist.

- [ ] **Step 3: Implement browser launcher and bridge service**

Add `browser_launcher.py` with:

```python
import os
import shutil
import subprocess
import sys


class SeedanceBrowserLauncher:
    DEFAULT_LOGIN_URL = "https://dreamina.capcut.com/"

    def __init__(
        self,
        *,
        resource_root,
        writable_root,
        browser_path="",
        login_url="",
        popen_factory=None,
    ):
        self.resource_root = os.path.abspath(resource_root)
        self.writable_root = os.path.abspath(writable_root)
        self.browser_path = str(browser_path or "").strip()
        self.login_url = str(login_url or "").strip() or self.DEFAULT_LOGIN_URL
        self._popen_factory = popen_factory or subprocess.Popen

    @property
    def extension_dir(self):
        return os.path.join(
            self.resource_root,
            "integrations",
            "seedance_extension_bridge",
            "extension",
        )

    @property
    def profile_dir(self):
        return os.path.join(self.writable_root, "user_data", "seedance_web", "profile")

    def _candidate_browser_paths(self):
        if self.browser_path:
            yield self.browser_path
        if sys.platform.startswith("win"):
            program_files = [
                os.environ.get("PROGRAMFILES", ""),
                os.environ.get("PROGRAMFILES(X86)", ""),
                os.environ.get("LOCALAPPDATA", ""),
            ]
            for root in program_files:
                if not root:
                    continue
                yield os.path.join(root, "Google", "Chrome", "Application", "chrome.exe")
                yield os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe")
        for name in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
            found = shutil.which(name)
            if found:
                yield found

    def resolve_browser_path(self):
        for candidate in self._candidate_browser_paths():
            if candidate and os.path.exists(candidate):
                return os.path.abspath(candidate)
        return ""

    def get_runtime_info(self):
        browser_path = self.resolve_browser_path()
        return {
            "extensionDir": self.extension_dir,
            "extensionAvailable": os.path.isdir(self.extension_dir),
            "profileDir": self.profile_dir,
            "browserPath": browser_path,
            "browserAvailable": bool(browser_path),
            "loginUrl": self.login_url,
        }

    def launch_login(self, *, force=False):
        browser_path = self.resolve_browser_path()
        if not browser_path:
            raise RuntimeError("未找到 Chrome/Edge 浏览器，请先安装 Chrome 或 Edge")
        if not os.path.isdir(self.extension_dir):
            raise RuntimeError("未找到内置 Seedance 扩展目录")
        os.makedirs(self.profile_dir, exist_ok=True)
        args = [
            browser_path,
            f"--user-data-dir={self.profile_dir}",
            f"--disable-extensions-except={self.extension_dir}",
            f"--load-extension={self.extension_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            self.login_url,
        ]
        self._popen_factory(args)
        return {
            "active": True,
            "phase": "browser_started",
            "force": bool(force),
            "url": self.login_url,
            "profileDir": self.profile_dir,
            "extensionDir": self.extension_dir,
        }
```

Add `bridge_service.py` with:

```python
class SeedanceWebBridgeService:
    def __init__(self, *, browser_launcher):
        self.browser_launcher = browser_launcher
        self._last_runtime = {
            "active": False,
            "phase": "idle",
        }

    def get_status(self):
        runtime = self.browser_launcher.get_runtime_info()
        return {
            "provider": "seedance_web",
            "available": bool(runtime.get("browserAvailable")) and bool(runtime.get("extensionAvailable", True)),
            "loggedIn": False,
            "runtime": runtime,
            "lastLogin": dict(self._last_runtime),
        }

    def start_login(self, *, force=False):
        self._last_runtime = self.browser_launcher.launch_login(force=bool(force))
        return dict(self._last_runtime)

    def logout(self):
        self._last_runtime = {
            "active": False,
            "phase": "profile_preserved",
        }
        return dict(self._last_runtime)
```

Add `__init__.py` with:

```python
from .browser_launcher import SeedanceBrowserLauncher
from .bridge_service import SeedanceWebBridgeService
from .route_service import SeedanceWebRouteService

__all__ = [
    "SeedanceBrowserLauncher",
    "SeedanceWebBridgeService",
    "SeedanceWebRouteService",
]
```

Add `README.md` in Chinese describing the module boundary.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest seedance_web_bridge_service_test.py seedance_web_route_service_test.py -v`  
Expected: PASS.

## Task 3: HTTP Dispatcher 和 Server 注册

**Files:**
- Modify: `services/http_route_dispatcher.py`
- Modify: `http_route_dispatcher_test.py`
- Modify: `server.py`

- [ ] **Step 1: Write failing dispatcher tests**

Add to `http_route_dispatcher_test.py`:

```python
    def test_seedance_web_post_body_is_only_read_for_seedance_route(self):
        seedance_service = _StubRouteService(
            post_response={
                "kind": "json_ok",
                "data": {"success": True},
            }
        )
        dreamina_service = _StubRouteService()
        read_calls = []

        def read_body(_handler):
            read_calls.append("read")
            return b'{"force":true}'

        dispatcher = self._build_dispatcher(
            json_service=_StubRouteService(),
            library_service=_StubRouteService(),
            read_body=read_body,
            seedance_service=seedance_service,
            dreamina_service=dreamina_service,
        )

        handled = dispatcher.handle_post(handler=None, path="/api/v2/seedance-web/login")

        self.assertTrue(handled)
        self.assertEqual(read_calls, ["read"])
        self.assertEqual(seedance_service.post_calls[0][1], b'{"force":true}')
        self.assertEqual(dreamina_service.post_calls, [])
```

Update `_build_dispatcher()` signature to accept `seedance_service=None, dreamina_service=None`, then pass:

```python
dreamina_route_service_getter=lambda: dreamina_service or _StubRouteService(),
seedance_web_route_service_getter=lambda: seedance_service or _StubRouteService(),
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest http_route_dispatcher_test.py -v`  
Expected: FAIL because constructor does not accept `seedance_web_route_service_getter`.

- [ ] **Step 3: Implement dispatcher injection and routing**

In `HttpRouteDispatcher.__init__`, add keyword `seedance_web_route_service_getter` after `dreamina_route_service_getter`, assign `self._get_seedance_web_route_service`.

In `handle_get`, before Dreamina route:

```python
        seedance_web_get_response = self._get_seedance_web_route_service().handle_get(
            handler,
            path,
        )
        if seedance_web_get_response is not None:
            self._send_route_response(handler, seedance_web_get_response)
            return True
```

In `handle_post`, before Dreamina route:

```python
        seedance_web_post_response = self._get_seedance_web_route_service().handle_post(
            handler,
            path,
            self._read_body(handler) if path.startswith("/api/v2/seedance-web/") else b"",
        )
        if seedance_web_post_response is not None:
            self._send_route_response(handler, seedance_web_post_response)
            return True
```

In `server.py`, import services:

```python
from integrations.seedance_extension_bridge import (
    SeedanceBrowserLauncher,
    SeedanceWebBridgeService,
    SeedanceWebRouteService,
)
```

Instantiate after Dreamina route service:

```python
SEEDANCE_WEB_BROWSER_LAUNCHER = SeedanceBrowserLauncher(
    resource_root=RESOURCE_ROOT,
    writable_root=WRITABLE_ROOT,
)
SEEDANCE_WEB_BRIDGE_SERVICE = SeedanceWebBridgeService(
    browser_launcher=SEEDANCE_WEB_BROWSER_LAUNCHER,
)
SEEDANCE_WEB_ROUTE_SERVICE = SeedanceWebRouteService(
    bridge_service=SEEDANCE_WEB_BRIDGE_SERVICE,
)
```

Pass to dispatcher:

```python
seedance_web_route_service_getter=lambda: SEEDANCE_WEB_ROUTE_SERVICE,
```

Add `"/api/v2/seedance-web"` to `_SENSITIVE_API_PREFIXES`.

- [ ] **Step 4: Run tests**

Run: `python -m unittest http_route_dispatcher_test.py seedance_web_route_service_test.py seedance_web_bridge_service_test.py dreamina_route_service_test.py -v`  
Expected: PASS.

## Task 4: 前端 Seedance Web API

**Files:**
- Create: `api/seedanceWebApi.test.js`
- Create: `api/seedanceWebApi.js`
- Modify: `api/index.js`

- [ ] **Step 1: Write failing API tests**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;

function mockJsonResponse(payload, expectedUrl, expectedMethod = "GET", inspectBody = null) {
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), expectedUrl);
    assert.equal(String(options?.method || "GET"), expectedMethod);
    if (typeof inspectBody === "function") {
      inspectBody(options?.body);
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
}

test("seedanceWebApi: fetch status uses seedance-web endpoint", async () => {
  try {
    mockJsonResponse({ success: true, status: { available: true } }, "/api/v2/seedance-web/status");
    const { fetchSeedanceWebStatusFromServer } = await import("./seedanceWebApi.js");
    const status = await fetchSeedanceWebStatusFromServer();
    assert.equal(status.available, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: login posts force flag", async () => {
  try {
    mockJsonResponse(
      { success: true, runtime: { phase: "browser_started" } },
      "/api/v2/seedance-web/login",
      "POST",
      (body) => {
        const payload = JSON.parse(String(body || "{}"));
        assert.equal(payload.force, true);
      }
    );
    const { startSeedanceWebLoginFromServer } = await import("./seedanceWebApi.js");
    const runtime = await startSeedanceWebLoginFromServer({ force: true });
    assert.equal(runtime.phase, "browser_started");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("seedanceWebApi: logout posts to logout endpoint", async () => {
  try {
    mockJsonResponse({ success: true, status: { phase: "profile_preserved" } }, "/api/v2/seedance-web/logout", "POST");
    const { logoutSeedanceWebFromServer } = await import("./seedanceWebApi.js");
    const status = await logoutSeedanceWebFromServer();
    assert.equal(status.phase, "profile_preserved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test api/seedanceWebApi.test.js`  
Expected: FAIL because `api/seedanceWebApi.js` does not exist.

- [ ] **Step 3: Implement API wrapper**

```javascript
import { get, post } from "./apiBase.js";

function assertSuccess(response, fallbackMessage) {
  if (!response?.success) {
    throw new Error(response?.error || fallbackMessage);
  }
  return response.data || {};
}

export async function fetchSeedanceWebStatusFromServer() {
  const response = await get("/api/v2/seedance-web/status");
  const data = assertSuccess(response, "获取海外版 Seedance 状态失败");
  return data.status || data;
}

export async function startSeedanceWebLoginFromServer(options = {}) {
  const response = await post("/api/v2/seedance-web/login", {
    force: Boolean(options?.force),
  });
  const data = assertSuccess(response, "发起海外版 Seedance 登录失败");
  if (data.success === false) {
    throw new Error(data.message || "发起海外版 Seedance 登录失败");
  }
  return data.runtime || data;
}

export async function logoutSeedanceWebFromServer() {
  const response = await post("/api/v2/seedance-web/logout", {});
  const data = assertSuccess(response, "退出海外版 Seedance 登录失败");
  if (data.success === false) {
    throw new Error(data.message || "退出海外版 Seedance 登录失败");
  }
  return data.status || data;
}
```

Add exports to `api/index.js`:

```javascript
export {
  fetchSeedanceWebStatusFromServer,
  startSeedanceWebLoginFromServer,
  logoutSeedanceWebFromServer,
} from "./seedanceWebApi.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test api/seedanceWebApi.test.js`  
Expected: PASS.

## Task 5: 设置页海外版 UI 增强

**Files:**
- Create: `modules/settings/seedanceWebSettings.test.js`
- Create: `modules/settings/seedanceWebSettings.js`
- Modify: `modules/settings/apiSettings.js`
- Modify: `style.css`

- [ ] **Step 1: Write failing DOM tests**

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  applySeedanceWebRegionUi,
  findDreaminaRegion,
} from "./seedanceWebSettings.js";

function createMockDocument(region = "overseas") {
  const manualPanel = { hidden: false, dataset: { dreaminaDomesticOnly: "1" } };
  const qrButton = { hidden: false, disabled: false, dataset: { dreaminaDomesticOnly: "1" } };
  const loginButton = { textContent: "网页登录", dataset: {}, disabled: false };
  const statusText = { textContent: "" };
  const root = {
    dataset: { dreaminaRegion: region },
    querySelectorAll(selector) {
      if (selector === "[data-dreamina-domestic-only]") {
        return [manualPanel, qrButton];
      }
      return [];
    },
    querySelector(selector) {
      if (selector === "[data-dreamina-web-login]") {
        return loginButton;
      }
      if (selector === "[data-seedance-web-status]") {
        return statusText;
      }
      return null;
    },
  };
  return { root, manualPanel, qrButton, loginButton, statusText };
}

test("seedanceWebSettings: overseas hides domestic-only login controls", () => {
  const dom = createMockDocument("overseas");

  applySeedanceWebRegionUi(dom.root);

  assert.equal(dom.manualPanel.hidden, true);
  assert.equal(dom.qrButton.hidden, true);
  assert.equal(dom.loginButton.textContent, "登录海外版");
  assert.match(dom.statusText.textContent, /海外版/);
});

test("seedanceWebSettings: domestic leaves controls visible", () => {
  const dom = createMockDocument("domestic");

  applySeedanceWebRegionUi(dom.root);

  assert.equal(dom.manualPanel.hidden, false);
  assert.equal(dom.qrButton.hidden, false);
  assert.equal(dom.loginButton.textContent, "网页登录");
});

test("seedanceWebSettings: findDreaminaRegion reads selected dataset", () => {
  assert.equal(findDreaminaRegion({ dataset: { dreaminaRegion: "overseas" } }), "overseas");
  assert.equal(findDreaminaRegion({ dataset: { dreaminaRegion: "" } }), "domestic");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test modules/settings/seedanceWebSettings.test.js`  
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement UI helper module**

Implement exported pure helpers plus `initSeedanceWebSettings()`:

```javascript
import {
  fetchSeedanceWebStatusFromServer,
  logoutSeedanceWebFromServer,
  startSeedanceWebLoginFromServer,
} from "../../api/seedanceWebApi.js";
import { showError, showToast } from "../../services/toastService.js";

export function findDreaminaRegion(root) {
  const direct = String(root?.dataset?.dreaminaRegion || "").trim().toLowerCase();
  if (direct === "overseas") {
    return "overseas";
  }
  const active = root?.querySelector?.("[data-dreamina-region].active, [data-region].active");
  const activeValue = String(active?.dataset?.dreaminaRegion || active?.dataset?.region || "").trim().toLowerCase();
  return activeValue === "overseas" ? "overseas" : "domestic";
}

export function applySeedanceWebRegionUi(root) {
  if (!root) {
    return "domestic";
  }
  const region = findDreaminaRegion(root);
  const isOverseas = region === "overseas";
  root.querySelectorAll?.("[data-dreamina-domestic-only]")?.forEach((el) => {
    el.hidden = isOverseas;
  });
  const loginButton = root.querySelector?.("[data-dreamina-web-login]");
  if (loginButton) {
    loginButton.textContent = isOverseas ? "登录海外版" : "网页登录";
  }
  const statusText = root.querySelector?.("[data-seedance-web-status]");
  if (statusText) {
    statusText.textContent = isOverseas
      ? "海外版会打开独立浏览器登录，登录态保存在本机。"
      : "";
  }
  return region;
}

export function initSeedanceWebSettings({ documentRef = document } = {}) {
  const root = documentRef.getElementById?.("dreaminaSettingsCard");
  if (!root || root.dataset.seedanceWebEnhanced === "1") {
    return;
  }
  root.dataset.seedanceWebEnhanced = "1";
  if (!root.querySelector("[data-seedance-web-status]")) {
    const status = documentRef.createElement("div");
    status.className = "seedance-web-status settings-desc";
    status.dataset.seedanceWebStatus = "1";
    root.appendChild(status);
  }
  applySeedanceWebRegionUi(root);
  root.addEventListener("click", async (event) => {
    const target = event.target?.closest?.("[data-dreamina-web-login], [data-dreamina-logout], [data-dreamina-region], [data-region]");
    if (!target) {
      return;
    }
    setTimeout(() => applySeedanceWebRegionUi(root), 0);
    if (findDreaminaRegion(root) !== "overseas") {
      return;
    }
    if (target.matches?.("[data-dreamina-web-login]")) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await startSeedanceWebLoginFromServer({ force: false });
        showToast("已打开海外版登录浏览器", "success");
      } catch (error) {
        showError(error?.message || "发起海外版登录失败");
      }
    }
    if (target.matches?.("[data-dreamina-logout]")) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await logoutSeedanceWebFromServer();
        showToast("海外版已退出登录", "success");
      } catch (error) {
        showError(error?.message || "退出海外版登录失败");
      }
    }
  }, true);
  fetchSeedanceWebStatusFromServer().catch(() => null);
}
```

Before final code, inspect real Dreamina DOM selectors in `index.html`; if existing buttons lack data attributes, add attributes using runtime selector matching by button text inside this module rather than editing compressed HTML.

- [ ] **Step 4: Wire module from `apiSettings.js`**

Add import:

```javascript
import { initSeedanceWebSettings } from "./seedanceWebSettings.js";
```

Call it in the settings init path after special provider section is ensured:

```javascript
initSeedanceWebSettings();
```

Add scoped CSS:

```css
.seedance-web-status {
  margin-top: 10px;
}
```

- [ ] **Step 5: Run frontend tests**

Run: `node --test modules/settings/seedanceWebSettings.test.js modules/settings/apiSettings.test.js api/seedanceWebApi.test.js`  
Expected: PASS.

## Task 6: 复制并最小调整内置扩展

**Files:**
- Create/Copy: `integrations/seedance_extension_bridge/extension/*`
- Modify: `integrations/seedance_extension_bridge/extension/manifest.json`

- [ ] **Step 1: Copy desktop extension into repo**

Run PowerShell copy from:

`C:\Users\Administrator\Desktop\Seedance2-Chrome-Extensions-master`

to:

`D:\Aic\huanying-source-windows-20260430-122116\integrations\seedance_extension_bridge\extension`

Exclude `.git`, `node_modules`, generated `data`, `uploads`, `playwright/user-data`, screenshots.

- [ ] **Step 2: Patch manifest host permissions**

Ensure `manifest.json` contains:

```json
"https://dreamina.capcut.com/*",
"https://www.dreamina.ai/*"
```

and keeps localhost permission for bridge access.

- [ ] **Step 3: Validate extension files are present**

Run: `Test-Path integrations/seedance_extension_bridge/extension/manifest.json`  
Expected: `True`.

Run: `python -m json.tool integrations/seedance_extension_bridge/extension/manifest.json`  
Expected: valid JSON output.

## Task 7: Full Verification

**Files:**
- All touched files

- [ ] **Step 1: Run Python targeted tests**

Run: `python -m unittest seedance_web_route_service_test.py seedance_web_bridge_service_test.py http_route_dispatcher_test.py dreamina_route_service_test.py server_runtime_paths_test.py -v`  
Expected: PASS.

- [ ] **Step 2: Run Node targeted tests**

Run: `node --test api/seedanceWebApi.test.js modules/settings/seedanceWebSettings.test.js api/dreaminaCliApi.test.js api/dreaminaCliApi.region.test.js modules/settings/apiSettings.test.js`  
Expected: PASS.

- [ ] **Step 3: Check git diff scope**

Run: `git status --short` and `git diff --stat`  
Expected: only planned files changed.

- [ ] **Step 4: Commit**

Run:

```bash
git add integrations/seedance_extension_bridge seedance_web_route_service_test.py seedance_web_bridge_service_test.py http_route_dispatcher_test.py services/http_route_dispatcher.py server.py api/seedanceWebApi.js api/seedanceWebApi.test.js api/index.js modules/settings/seedanceWebSettings.js modules/settings/seedanceWebSettings.test.js modules/settings/apiSettings.js style.css docs/superpowers/plans/2026-05-14-seedance-web-bridge.md
git commit -m "feat: add seedance web bridge"
```

Expected: commit succeeds on branch `jimeng`.

## 自检

- Spec coverage: 覆盖独立 provider、独立路由、独立 profile、UI 海外登录入口、扩展内置、国内 Dreamina CLI 不改动。
- Placeholder scan: 无 `TBD`、无“后续实现”占位作为本期必需功能。
- Type consistency: 后端统一 `SeedanceWebBridgeService` / `SeedanceWebRouteService`；前端统一 `fetchSeedanceWebStatusFromServer` / `startSeedanceWebLoginFromServer` / `logoutSeedanceWebFromServer`。
