# Seedance Extension Wakeup And Foreground Activation Design

Date: 2026-05-19

## Problem

The overseas Seedance/Dreamina Web bridge can receive tasks from the canvas, but it is not reliable when the dedicated browser is in the background. The first attempt may work if the page is still active, then later attempts can stall until the user manually clicks the overseas browser window to the top.

This is separate from the canvas-side "query failed" status problem. This design only targets the overseas browser/extension task pickup and page-operation path.

## Goal

After the user submits a Seedance Web task from the canvas, the extension should pick up and execute the task without requiring a manual browser click.

The implementation should keep the existing architecture:

- Local Python bridge service and route service.
- Chrome MV3 extension background worker.
- Existing `content.js` DOM automation for Dreamina/CapCut.
- Existing task status and query-result contracts.

## Root Cause Model

There are two independent failure layers:

1. MV3 background wakeup: `setInterval` in a service worker is not enough. Chrome can suspend the worker, so the extension may not fetch the task until browser activity wakes it.
2. Background page execution: even when the extension wakes and fetches a task, the Dreamina/CapCut tab can be throttled or not focused enough for upload, React events, and click simulation to run reliably.

The previous wakeup-only implementation addressed layer 1. The remaining failures show layer 2 must be handled as well.

## Chosen Design

Use a four-layer fix:

1. Backend long-poll wait API.
   - Add `GET /api/v2/seedance-web/bridge/api/tasks/wait`.
   - The extension can wait for tasks instead of only scanning every few seconds.

2. Extension long-poll and alarm wakeup.
   - Start a background wait loop against the wait API.
   - Add `chrome.alarms` as a periodic MV3 wakeup fallback.
   - Keep existing `/tasks/pending` polling as a fallback.

3. Remember and reuse the work tab.
   - Store `seedanceWorkerTabId` in `chrome.storage.local`.
   - Prefer that tab over whichever tab is currently active.
   - Refresh the remembered tab from page-status events and successful task execution.

4. Foreground the work tab before page actions.
   - Before `applyPreset`, `doGenerate`, and `clickGenerate`, call `chrome.tabs.update(tab.id, { active: true })`.
   - Call `chrome.windows.update(tab.windowId, { focused: true, state: 'normal' })`.
   - Wait briefly before pinging/injecting the content script.
   - This makes the system perform the manual "click browser to top" step.

The dedicated browser launch also gets anti-background-throttling flags:

- `--disable-background-timer-throttling`
- `--disable-renderer-backgrounding`
- `--disable-backgrounding-occluded-windows`
- `--disable-features=DisableLoadExtensionCommandLineSwitch,CalculateNativeWinOcclusion`

## Files

- `integrations/seedance_extension_bridge/task_store.py`
  - Add `threading.Condition`.
  - Notify waiters when tasks are created or status changes.
  - Add bounded `wait_pending(...)`.

- `integrations/seedance_extension_bridge/bridge_service.py`
  - Add `wait_pending_tasks(...)`.

- `integrations/seedance_extension_bridge/route_service.py`
  - Add wait route under the existing bridge prefix.

- `integrations/seedance_extension_bridge/browser_launcher.py`
  - Add Chrome flags that reduce background and occlusion throttling.

- `integrations/seedance_extension_bridge/extension/manifest.json`
  - Add `alarms` permission.
  - Bump extension version so the existing extension-cache cleanup path sees a new version.

- `integrations/seedance_extension_bridge/extension/background.js`
  - Add wait loop, alarm setup, remembered-tab helpers, and foreground activation helper.

- Tests:
  - `seedance_web_bridge_service_test.py`
  - `seedance_web_route_service_test.py`
  - `seedance_extension_background_test.py`

## Risks

- Chrome may still prevent focus stealing in some OS/browser policy scenarios. In that case the browser flags and alarm/wait path still improve pickup, but a manual validation is required.
- Dreamina/CapCut may show CAPTCHA, login expiry, rate limiting, selector drift, or anti-automation messages. This design does not bypass platform restrictions.
- Foreground activation can briefly bring the overseas browser to the front. That is intentional because it replaces the user's manual click.

## Verification

Automated:

- Backend wait API unit tests.
- Route parsing tests for `timeout`, `clientId`, and `includeSubmitted`.
- Browser launcher argument test for anti-background flags.
- Extension structural tests for wait endpoint, alarms, remembered tab, and foreground activation order.
- `node --check` for `background.js`.
- Manifest JSON parse check.

Manual:

1. Open the overseas browser through the workbench login action.
2. Log in to Dreamina/CapCut and leave the tab open.
3. Put another app or the workbench over the browser.
4. Submit 3 to 5 Seedance Web tasks from the canvas without touching the overseas browser.
5. Confirm each task moves from pending to processing/submitted and the overseas browser is automatically activated before page actions.
6. Confirm no unrelated domestic Dreamina or RunningHub path is affected.
