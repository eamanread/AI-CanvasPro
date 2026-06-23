# Seedance Extension Wakeup And Foreground Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make overseas Seedance/Dreamina Web tasks start from the canvas without requiring the user to manually click the browser window.

**Architecture:** Add a backend long-poll wait API, make the extension use long-polling plus `chrome.alarms`, remember the Dreamina/CapCut work tab, foreground that tab/window before DOM actions, and launch the dedicated browser with anti-background-throttling flags.

**Tech Stack:** Python `unittest`, `threading.Condition`, local route services, Chrome MV3 extension background JavaScript.

---

## Execution Status: 2026-05-20

- Backend wait API implemented.
- Extension long-polling, alarm wakeup, remembered work tab, and task-before-action foreground activation implemented.
- Dedicated browser launch now disables key background/occlusion throttling paths.
- Targeted Seedance Python tests pass: 100 tests.
- Full Python discovery passes: 172 tests.
- Seedance frontend API tests pass: 7 tests.
- `background.js` syntax check passes.
- Manifest JSON parse check passes.
- Full Node suite still has 2 unrelated GRSai image route failures in `api/aiImageApi.routing.test.js`.
- Manual browser validation is still required with the actual Dreamina/CapCut tab.

---

### Task 1: Backend Wait API Tests

**Files:**
- Modify: `seedance_web_bridge_service_test.py`
- Modify: `seedance_web_route_service_test.py`

- [x] Add tests for `SeedanceWebBridgeService.wait_pending_tasks(...)` returning existing pending tasks and timing out with an empty list.
- [x] Add a route-service test for `GET /api/v2/seedance-web/bridge/api/tasks/wait?clientId=background&timeout=2&includeSubmitted=0`.
- [x] Run the new tests and confirm they fail because the wait API does not exist yet.

### Task 2: Backend Wait API Implementation

**Files:**
- Modify: `integrations/seedance_extension_bridge/task_store.py`
- Modify: `integrations/seedance_extension_bridge/bridge_service.py`
- Modify: `integrations/seedance_extension_bridge/route_service.py`

- [x] Add a `threading.Condition` around the task-store lock.
- [x] Notify waiters when a task is created or status changes.
- [x] Add bounded `wait_pending(timeout=25, include_submitted=False)` using `time.monotonic()` for real elapsed wait time.
- [x] Add `SeedanceWebBridgeService.wait_pending_tasks(...)`.
- [x] Add the route-service wait endpoint.
- [x] Run backend target tests and the full Seedance backend route/service tests.

### Task 3: Browser And Extension Tests

**Files:**
- Modify: `seedance_web_bridge_service_test.py`
- Modify: `seedance_extension_background_test.py`

- [x] Extend the browser-launcher test to assert anti-background-throttling flags.
- [x] Add an extension manifest test for `alarms` permission.
- [x] Add extension background tests for long-poll wait endpoint, alarm wakeup, remembered work tab, and activation before `ensureSeedanceContentScriptReady()`.
- [x] Run the new tests and confirm they fail on the baseline.

### Task 4: Browser And Extension Implementation

**Files:**
- Modify: `integrations/seedance_extension_bridge/browser_launcher.py`
- Modify: `integrations/seedance_extension_bridge/extension/manifest.json`
- Modify: `integrations/seedance_extension_bridge/extension/background.js`

- [x] Add browser launch flags for background timer throttling, renderer backgrounding, occluded windows, and native window occlusion.
- [x] Add `alarms` permission and bump manifest version.
- [x] Add background state for task wait loop and remembered worker tab.
- [x] Add storage/tab/window helper wrappers.
- [x] Make `findActiveSeedanceTab()` prefer the remembered work tab.
- [x] Remember the work tab during page-status reporting.
- [x] Add `activateSeedanceWorkTab(tab)` and call it before task page actions.
- [x] Add `waitRemoteTasks(...)`, `startSeedanceTaskWaiting()`, and `setupSeedanceTaskWakeAlarm()`.
- [x] Keep existing `/tasks/pending` polling as fallback.

### Task 5: Verification And Report

**Files:**
- Create/Modify: `docs/superpowers/reports/2026-05-19-seedance-extension-wakeup-implementation-report.md`
- Modify: `task_plan.md`
- Modify: `progress.md`
- Modify: `findings.md`

- [x] Run targeted Python tests for bridge, route, and extension structural tests.
- [x] Run `node --check integrations/seedance_extension_bridge/extension/background.js`.
- [x] Run a manifest JSON parse check.
- [x] Run broader Python discovery if time allows.
- [x] Write the implementation report with exact verification results and manual validation steps.
