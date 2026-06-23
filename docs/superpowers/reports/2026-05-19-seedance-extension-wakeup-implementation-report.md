# Seedance Extension Wakeup And Foreground Activation Implementation Report

Date: 2026-05-20

## Goal

Solve the practical friction where a canvas-submitted overseas Seedance/Dreamina task only starts after the user manually clicks the browser window to the top.

This implementation intentionally separates that browser/extension issue from the canvas-side "query failed" status problem.

## Implemented Changes

- Added backend wait API:
  - `SeedanceWebTaskStore.wait_pending(...)`
  - `SeedanceWebBridgeService.wait_pending_tasks(...)`
  - `GET /api/v2/seedance-web/bridge/api/tasks/wait`
- Added task-store notifications with `threading.Condition` so newly created tasks wake long-poll requests immediately.
- Kept wait deadlines on `time.monotonic()` so deterministic task clocks do not freeze blocking waits.
- Added dedicated browser anti-background flags:
  - `--disable-background-timer-throttling`
  - `--disable-renderer-backgrounding`
  - `--disable-backgrounding-occluded-windows`
  - `--disable-features=DisableLoadExtensionCommandLineSwitch,CalculateNativeWinOcclusion`
- Added Chrome extension `alarms` permission and bumped the manifest version to refresh the bundled extension cache path.
- Added extension long-polling against `/api/tasks/wait?clientId=background&includeSubmitted=1`.
- Added Chrome alarm fallback named `seedance-task-wakeup` every 0.5 minutes.
- Added remembered Dreamina/CapCut work tab storage under `seedanceWorkerTabId`.
- Changed task tab selection to prefer the remembered work tab before falling back to active or recently accessed matching tabs.
- Added `activateSeedanceWorkTab(tab)` so task execution focuses the target window and activates the target tab before `applyPreset`, `doGenerate`, and `clickGenerate`.
- Preserved existing `/tasks/pending` polling as a fallback.

## Files Changed

- `integrations/seedance_extension_bridge/task_store.py`
- `integrations/seedance_extension_bridge/bridge_service.py`
- `integrations/seedance_extension_bridge/route_service.py`
- `integrations/seedance_extension_bridge/browser_launcher.py`
- `integrations/seedance_extension_bridge/extension/background.js`
- `integrations/seedance_extension_bridge/extension/manifest.json`
- `seedance_web_bridge_service_test.py`
- `seedance_web_route_service_test.py`
- `seedance_extension_background_test.py`
- `docs/superpowers/specs/2026-05-19-seedance-extension-wakeup-design.md`
- `docs/superpowers/plans/2026-05-19-seedance-extension-wakeup-implementation.md`

## Verification

- Passed: new RED/GREEN target set
  - Command: `python -m unittest seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_wait_pending_tasks_returns_existing_pending_task seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_wait_pending_tasks_times_out_with_empty_result seedance_web_bridge_service_test.SeedanceWebBridgeServiceTests.test_login_launches_dedicated_extension_window seedance_web_route_service_test.SeedanceWebRouteServiceTests.test_bridge_wait_route_waits_for_tasks seedance_extension_background_test.SeedanceExtensionBackgroundTests.test_manifest_requests_alarm_permission_for_background_wakeup seedance_extension_background_test.SeedanceExtensionBackgroundTests.test_background_wait_loop_and_alarm_wake_task_polling seedance_extension_background_test.SeedanceExtensionBackgroundTests.test_background_remembers_seedance_work_tab_before_fallback_lookup seedance_extension_background_test.SeedanceExtensionBackgroundTests.test_background_activates_work_tab_before_page_actions`
  - Result: 8 tests passed.
- Passed: Seedance related Python tests
  - Command: `python -m unittest seedance_web_bridge_service_test seedance_web_route_service_test seedance_extension_background_test`
  - Result: 100 tests passed.
- Passed: extension syntax check
  - Command: `node --check integrations/seedance_extension_bridge/extension/background.js`
- Passed: manifest JSON parse check
  - Command: `node -e "JSON.parse(require('fs').readFileSync('integrations/seedance_extension_bridge/extension/manifest.json','utf8')); console.log('manifest ok')"`
  - Result: `manifest ok`
- Passed: full Python discovery
  - Command: `python -m unittest discover -p "*test.py"`
  - Result: 172 tests passed.
- Passed: Seedance frontend API tests
  - Command: `cmd /c node --test api/seedanceWebApi.test.js api/aiVideoApi.seedanceWeb.test.js`
  - Result: 7 tests passed.
- Full Node suite status:
  - Command: `cmd /c npm test`
  - Result: 443 tests run, 441 passed, 2 failed.
  - Remaining failures are in `api/aiImageApi.routing.test.js` for GRSai `gpt-image-2` image route assertions expecting `resolution` to be undefined while actual value is `'4K'`.
  - These failures are outside the Seedance files changed here.
- Passed: `git diff --check`
  - Only line-ending warnings were printed.

## Manual Browser Validation Still Required

1. Reload or relaunch the bundled Seedance/Dreamina extension profile.
2. Open and log in to the overseas Dreamina/CapCut page.
3. Put the overseas browser behind the workbench or another window.
4. Submit 3 to 5 overseas video tasks from the canvas without touching the overseas browser.
5. Confirm the overseas browser is automatically brought forward before page actions.
6. Confirm tasks move through `pending`, `processing`, `submitted`, then result polling/upload.

## Known Boundaries

- This does not bypass CAPTCHA, login expiry, rate limits, selector drift, or platform anti-automation behavior.
- If Chrome or the OS refuses focus stealing in a specific environment, the wait/alarm layers still improve task pickup, but manual browser validation may expose that the foreground layer needs a native-window fallback.
- CodeGraph MCP was unavailable for this run because the project reported "not initialized"; local file inspection and tests were used instead.
