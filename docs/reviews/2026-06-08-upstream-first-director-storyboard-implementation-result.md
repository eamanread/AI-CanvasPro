# Upstream-First Director / Storyboard Implementation Result

Date: 2026-06-08
Project: `D:\Aic\huanying-source-windows-20260430-122116`
Recovered source session: `C:\Users\Administrator\.codex\sessions\2026\06\07\rollout-2026-06-07T16-54-14-019ea14a-3213-70c0-99c0-bcb234e6131c.jsonl`
Active plan: `docs\superpowers\plans\2026-06-08-upstream-first-director-storyboard-implementation.md`

## Files Changed

### Upstream-backed files copied/adapted

- `src\core\storyboardScriptFactory.js`
- `src\core\storyboardScriptGeneration.js`
- `src\core\generationTaskRuntime.js`
- `src\core\generationTaskUiState.js`
- `src\core\generationTaskLifecycle.js`
- `src\utils\localMediaPath.js`
- `components\StoryboardScriptNode.js`
- `components\nodeToolbar\storyboardScriptAction.js`
- `components\nodeToolbar\storyboardScriptToolbarIcon.js`
- `components\aigenImage\defaults.js`
- `components\aigenImage\uiModuleModelHelpers.js`
- `components\aigenImage\uiSchemaRenderer.js`
- `components\aigenText\apimartTextModelMenu.js`
- `components\aigenText\nodeResizeUi.js`
- `components\shared\nodeFooterControls.js`
- `components\sharedPromptPanel.js`
- `modules\modelInputPolicy.js`
- `modules\previewGenerateButtonUi.js`
- `services\canvasMediaLocalService.js`
- `api\storyboardVideoFrameApi.js`
- `manifests\index.js` and upstream manifest tree
- `styles\storyboard-script-node.css`
- `styles\panorama-scene-node.css`
- `styles\panorama-scene-toolbar.css`
- `styles\panorama-scene-popover.css`

### Local glue patched

- `index.html` loads upstream CSS and exposes the `panorama-scene` / `storyboard-script` add entries.
- `main.js` registers `StoryboardScriptNode` while preserving `StoryboardNode` and `PanoramaSceneNode`.
- `modules\nodeMeta.js` adds `storyboard-script` metadata and `storyboard_script` alias without touching `storyboard_director`.
- `src\core\interaction.js` wires `storyboard-script` creation through the upstream factory.
- `modules\interaction\EdgeController.js` allows valid inputs into `storyboard-script` and creates side-plus targets through the upstream factory.
- `components\nodeToolbar\videoToolbarHtml.js` adds the Storyboard Script action button.
- `components\nodeToolbar\videoToolbar.js` binds the upstream Storyboard Script toolbar action.

### Tests added/updated for this migration

- `upstreamDirectorStoryboardProduct.test.js`
- `upstreamScopeGuard.test.js`
- `storyboardScriptUpstreamFactory.test.js`
- `storyboardScriptDependencyClosure.test.js`
- `storyboardScriptToolbarAction.upstream.test.js`
- `storyboardScriptInteractionGlue.test.js`
- `appLifecycleBootWiring.test.js`

## Upstream Gap Decisions

- No custom workflow execution engine was reintroduced.
- `modules\workflows\canvasExecutionEngine.js`, `modules\workflows\groupRuntime.js`, and `modules\workflows\groupExecutionEvents.js` remain absent.
- Group/selected execution was not added because Director and Storyboard Script smoke/tests did not prove it necessary.
- Local work was limited to import-path adaptation, registration, menu/edge/toolbar glue, and tests around the copied upstream dependency closure.
- Existing identities remain separate: old `storyboard`, new `storyboard-script`, and assistant `storyboard_director`.

## Verification

### Syntax checks

Command summary:

```powershell
$files = @(
  'main.js', 'src\core\interaction.js', 'modules\interaction\EdgeController.js',
  'modules\nodeMeta.js', 'components\StoryboardScriptNode.js',
  'components\nodeToolbar\storyboardScriptAction.js',
  'components\nodeToolbar\storyboardScriptToolbarIcon.js',
  'components\nodeToolbar\videoToolbarHtml.js', 'components\nodeToolbar\videoToolbar.js',
  'src\core\storyboardScriptFactory.js', 'src\core\storyboardScriptGeneration.js',
  'src\core\generationTaskRuntime.js', 'src\core\generationTaskUiState.js',
  'src\core\generationTaskLifecycle.js', 'modules\modelInputPolicy.js',
  'modules\previewGenerateButtonUi.js', 'services\canvasMediaLocalService.js',
  'src\utils\localMediaPath.js', 'api\storyboardVideoFrameApi.js',
  'components\aigenImage\defaults.js', 'components\aigenImage\uiModuleModelHelpers.js',
  'components\aigenImage\uiSchemaRenderer.js', 'components\aigenText\apimartTextModelMenu.js',
  'components\aigenText\nodeResizeUi.js', 'components\shared\nodeFooterControls.js',
  'components\sharedPromptPanel.js'
)
foreach ($file in $files) { & 'D:\Aic\node.exe' --check $file }
```

Result: `SYNTAX_CHECKS_OK files=26`.

### Focused migration tests

Command:

```powershell
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js upstreamScopeGuard.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptDependencyClosure.test.js storyboardScriptToolbarAction.upstream.test.js storyboardScriptInteractionGlue.test.js appLifecycleBootWiring.test.js
```

Result: `tests 34`, `pass 34`, `fail 0`.

### Existing assistant/canvas regression

Command:

```powershell
& 'D:\Aic\node.exe' --test indexEncoding.test.js modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js
```

Result: `tests 17`, `pass 17`, `fail 0`.

### Residue scan

Command:

```powershell
rg -n "canvasExecutionEngine|groupRuntime|groupExecutionEvents|workflow:execute-group|video_generation_requires_authorization|execute_selected_nodes|execute_group|workflowExecuteSelectedNodes|workflowExecuteGroup" -g '!output/upstream/**' -g '!.codegraph/**' -g '!node_modules/**' -g '!docs/**' .
```

Result: `RESIDUE_SCAN_OK no matches`.

### Local server

Command:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8777/'
```

Result: HTTP `200`, content length `42510`.

## Browser Smoke

Preferred in-app Browser bootstrap was attempted through the Browser skill path, but the Node REPL browser channel failed before browser control with:

```text
node_repl kernel exited unexpectedly
EPERM: operation not permitted, chdir 'C:\Users\Administrator\.codex\memories' -> 'C:\Users\Administrator'
```

Fallback used Playwright with system Chrome:

- Chrome executable: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Smoke URL: `http://127.0.0.1:8777/?id=codex_final_smoke_1780911922448`
- Persisted JSON evidence: `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\smoke-result.json`

Smoke result:

- App loaded: `true`; initial loader removed: `false` for `loaderPresent`.
- Hover add picker includes `3D???` and `????` entries; static left menu has `data-type="panorama-scene"` and `data-type="storyboard-script"`.
- Director node: `type=panorama-scene`, name `3D???`, DOM class `v2-node node panorama-scene-node`; edit toolbar buttons rendered.
- Storyboard Script node: `type=storyboard-script`, title `????`; rendered table row persisted as `????????`; CSV includes upstream columns and the persisted row value.
- Fullscreen Storyboard Script overlay opened and closed; the open click used a DOM-click fallback after Playwright locator stability timed out, and no page error was raised.
- Video toolbar Storyboard action was visible with `aria-label="????"`; final run used a normal Playwright click.
- Clicking the video toolbar action created `storyboard-script-1780911935791-khhx2bi7t` and an edge `smoke-video -> storyboard-script-1780911935791-khhx2bi7t`.
- No provider generation started automatically: `autoGenerationStarted=false`, generation flag objects empty, source video `isGenerating=false`.
- Browser JS/page errors: `pageErrors=[]`, `requestFailures=[]`, no non-resource console errors.
- Resource 404s observed and recorded: new project JSON probe, `images/volcengine.svg`, and optional Quaternius character GLTF assets.

Screenshot artifacts:

- `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\director-stage.png`
- `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\storyboard-script.png`
- `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\video-toolbar-storyboard.png`

## CodeGraph Status

MCP CodeGraph status was retried and failed with:

```text
Error: Tool execution failed: database is locked
```

CLI was retried through the `.cmd` entry because PowerShell shim execution policy had blocked the shim earlier:

```powershell
& "$env:APPDATA\npm\codegraph.cmd" unlock .
& "$env:APPDATA\npm\codegraph.cmd" sync .
& "$env:APPDATA\npm\codegraph.cmd" status .
```

Result is saved at:

- `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\codegraph-cli-result.txt`

Observed result:

- `unlock_exit=0`, with `No lock file found ? nothing to do`.
- `sync_exit=1`, `Failed to sync: database is locked`.
- `status_exit=1`, `Failed to get status: database is locked`.
- CodeGraph also reported WASM SQLite fallback because `better-sqlite3` is unavailable.

No claim is made that CodeGraph was successfully synced; final structural confidence comes from fresh tests and smoke evidence.

## Historical Plan Guard

The old plan was checked after final verification:

```powershell
Get-Item 'docs\superpowers\plans\2026-06-07-huanying-director-storyboard-workflow-migration.md' | Select-Object FullName,Length,LastWriteTime
```

Observed unchanged values:

- Length: `50807`
- LastWriteTime: `2026/6/7 18:55:12`

## Residual Risks

- CodeGraph database remains locked, so the final CodeGraph sync/status cannot be used as evidence until the lock holder is resolved.
- The in-app Browser channel is blocked by the Node REPL working-directory `EPERM`; Playwright + system Chrome was used as the verified fallback.
- Browser smoke records resource 404s for a generated project JSON probe and optional static assets; no page errors or non-resource JS console errors were observed.
- Storyboard Script UI persistence was verified via store update/render/CSV evidence. Direct keyboard cell editing was explored separately but not included as a passing final smoke assertion in this result.
- Git status remains unreliable in this workspace (`fatal: not a git repository` from `git -C ... status --short`), so this result uses explicit file/test/artifact evidence instead of VCS status.
