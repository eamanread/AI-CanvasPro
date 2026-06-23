# Director / Storyboard Workflow Migration Review

Review date: 2026-06-08

Project: `D:\Aic\huanying-source-windows-20260430-122116`

Plan reviewed: `docs\superpowers\plans\2026-06-07-huanying-director-storyboard-workflow-migration.md`

## Review Result

No blocking findings remain after review fixes.

During review, I found and fixed two important integration gaps:

- `modules\assistant\canvasSkills\manifest.js` and docs exposed `workflow.executeGroup`, but the assistant workflow factory, skill executor, and default Canvas Skills runtime did not fully route it to a real execution engine. This could have made the advertised skill unavailable or partially callable.
- The implementation now returns `executeGroup` from `createAssistantCanvasWorkflowSkills`, routes `execute_group` and `workflow.executeGroup` through `createAssistantCanvasSkillExecutor`, injects the shared `canvasExecutionEngine` plus `groupRuntime` in `modules\assistant\canvasSkills\runtime.js`, and fails closed when a workflow adapter is missing.
- A later runtime smoke found the new hover add-node picker in `src\core\interaction.js` still hid `panorama-scene` behind `DEV_MODE` and did not expose `storyboard-script`, even though the legacy left menu already did. This would have made Task 9 fail for the current UI entry point.
- `src\core\interaction.js` now imports `createStoryboardScriptNodeData` / `STORYBOARD_SCRIPT_DEFAULT_SIZE`, creates stateful `storyboard-script` nodes, shows `3D导演台` without a `DEV_MODE` gate, and exposes `分镜脚本` in both the hover picker and canvas context-menu add-node path.

## Follow-up Development Update

After the initial review, I completed and verified the remaining integration fixes requested by the plan:

- `components\StoryboardScriptNode.js` now supports row-level selection in both table and card views, including a select-all checkbox and visible selection count.
- Storyboard materialization now uses selected rows when any are selected and falls back to all rows otherwise. Selected-row materialization preserves the original row index through `__storyboardRowIndex` / `storyboardOriginalRowIndex`, so generated draft nodes keep the correct `storyboardRowIndex`.
- `components\GroupNode.js` now renders live group execution status from `groupRuntime.execution`, including running/completed/blocked/failed states and the `视频生成需要授权` message for blocked video generation.
- `index.html` now keeps `test-video`, `audio`, `storyboard-script`, `panorama-scene`, and `panorama-360` as sibling legacy add-node buttons; the malformed nested-button block was replaced with a targeted valid block that preserves labels and node types.
- `modules\assistant\canvasSkills\docs\manifest.contract.md` now explicitly documents the `video_generation_requires_authorization` workflow gate reason, covered by a manifest contract regression test.

## Scope Reviewed

- 3D director stage entry remains a real visible entry while persisted type stays `panorama-scene`, including the current hover add-node picker.
- `storyboard-script` is registered as a separate node type, appears in the current hover add-node picker, and does not replace or alias `storyboard_director`.
- Storyboard materialization creates `ai-image` drafts and `ai-video` prep nodes only.
- Shared execution engine exists before selected-node and group execution paths.
- Group run delegates to the shared execution engine and keeps video generation authorization disabled by default.
- Assistant canvas workflow skills expose selected-node and group execution through executable adapters.
- Video generation remains authorization-gated across storyboard prep, execution engine, group button, and assistant execution paths.
- Legacy left add-node menu entries remain valid sibling buttons for `test-video`, `audio`, `storyboard-script`, `panorama-scene`, and `panorama-360`.
- `storyboard-script` row selection drives image/video materialization while preserving original row indexes.
- Group nodes render runtime execution status badges for running, completed, blocked, failed, and empty execution outcomes.
- Canvas Skills manifest docs explicitly record the workflow video authorization gate reason used by execution results.

## Evidence

- `modules\workflows\canvasExecutionEngine.js:83` blocks `ai-video` when `allowVideoGeneration !== true` with reason `video_generation_requires_authorization`.
- `src\core\storyboardScriptMaterialize.js:110` creates video prep node drafts and `src\core\storyboardScriptMaterialize.js:127` marks them with `requiresVideoAuthorization: true`.
- `components\GroupNode.js` dispatches `workflow:execute-group` with `allowVideoGeneration: false` in the button path.
- `modules\workflows\groupExecutionEvents.js:36` listens for `workflow:execute-group`; `modules\workflows\groupExecutionEvents.js:41` only enables video generation when the event detail explicitly passes `allowVideoGeneration === true`.
- `modules\assistant\assistantCanvasWorkflowSkills.js:109` implements `executeGroup`; `modules\assistant\assistantCanvasWorkflowSkills.js:151` returns it from the workflow skill factory.
- `modules\assistant\assistantCanvasSkillExecutor.js:86` recognizes workflow execution actions; `modules\assistant\assistantCanvasSkillExecutor.js:356` and `modules\assistant\assistantCanvasSkillExecutor.js:358` route selected-node and group execution to workflow skills.
- `modules\assistant\canvasSkills\runtime.js:77` creates the shared execution engine and `modules\assistant\canvasSkills\runtime.js:92` creates group runtime for default Canvas Skills runtime execution.
- `config\assistant-skills\storyboard_director.json:2` keeps the existing `storyboard_director` skill id, and `config\assistant-skills\storyboard_director.json:32` still references `queue_generation_task:ai-video` under its authorization-gated strategy contract.
- `src\core\interaction.js` contains visible hover-picker/context-menu entries for `3D导演台` and `分镜脚本`; `storyboard-script` creation uses `createStoryboardScriptNodeData`, so new nodes receive `storyboardScript` state instead of a generic node payload.
- `components\StoryboardScriptNode.js` renders editable storyboard rows, switches list/card view, exports CSV, and routes image/video materialization through `storyboardScriptMaterialize`.
- `components\nodeToolbar\storyboardScriptAction.js` creates a connected `storyboard-script` node from `source-video` / `ai-video` sources without starting generation.
- `components\StoryboardScriptNode.js:114` normalizes `selectedRowIndexes`; `components\StoryboardScriptNode.js:197` materializes selected rows or all rows; `components\StoryboardScriptNode.js:402` and `components\StoryboardScriptNode.js:467` render table/card row checkboxes.
- `src\core\storyboardScriptMaterialize.js:41` reads `__storyboardRowIndex` / `storyboardOriginalRowIndex`; `src\core\storyboardScriptMaterialize.js:110` and `src\core\storyboardScriptMaterialize.js:132` write the preserved `storyboardRowIndex` onto image/video draft nodes.
- `components\GroupNode.js:45` syncs the runtime-status element; `components\GroupNode.js:64` and `components\GroupNode.js:71` hook mount/update without rewriting the obfuscated component body.
- `styles\storyboard-script-node.css` styles selected storyboard table rows and cards; `styles\layout.css` styles `.group-runtime-status` badges.
- `storyboardScriptRegistration.test.js:42` prevents regression of nested legacy add-node menu buttons, and `index.html:1` now contains sibling `test-video`, `audio`, `storyboard-script`, `panorama-scene`, and `panorama-360` buttons labeled `测试视频`, `音频`, `分镜脚本`, `3D导演台`, and `360全景图`.

## Verification

All verification below includes the latest follow-up development fixes and was run after the final code changes.

### Syntax Checks

Command:

```powershell
& 'D:\Aic\node.exe' --check src\core\storyboardScriptMaterialize.js
& 'D:\Aic\node.exe' --check components\StoryboardScriptNode.js
& 'D:\Aic\node.exe' --check components\GroupNode.js
& 'D:\Aic\node.exe' --check components\testDomStub.js
& 'D:\Aic\node.exe' --check main.js
& 'D:\Aic\node.exe' --check src\core\interaction.js
& 'D:\Aic\node.exe' --check modules\workflows\groupExecutionEvents.js
& 'D:\Aic\node.exe' --check modules\assistant\canvasSkills\manifest.test.js
```

Result: exit code `0`.

### Targeted Legacy Menu / Visibility / Encoding Regression

Command:

```powershell
& 'D:\Aic\node.exe' --test storyboardScriptRegistration.test.js directorStageEntry.test.js indexEncoding.test.js
```

Result: `10 pass / 0 fail`.

### Workflow / Engine / Runtime Regression

Command:

```powershell
& 'D:\Aic\node.exe' --test modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\canvasSkills\manifest.test.js modules\workflows\groupRuntime.test.js modules\workflows\canvasExecutionEngine.test.js components\StoryboardScriptNode.test.js components\GroupNode.runtimeStatus.test.js
```

Result: `40 pass / 0 fail`.

### Focused Migration Regression

Command:

```powershell
& 'D:\Aic\node.exe' --test directorStageEntry.test.js storyboardScriptRegistration.test.js src\core\storyboardScriptFactory.test.js src\core\storyboardScriptGeneration.test.js src\core\storyboardScriptMaterialize.test.js modules\workflows\canvasExecutionEngine.test.js modules\workflows\groupRuntime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\canvasSkills\manifest.test.js components\nodeToolbar\storyboardScriptAction.test.js components\StoryboardScriptNode.test.js components\GroupNode.runtimeStatus.test.js
```

Result: `62 pass / 0 fail`.

### Existing Canvas / Assistant Regression

Command:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 indexEncoding.test.js src\core\persistentGenerationError.test.js modules\assistant\canvasSkills\generationStateMapper.test.js modules\assistant\canvasSkills\generationTaskBridge.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasSkills.integration.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\settings\apiSettings.test.js
```

Result: `134 pass / 0 fail`.


### Browser Smoke: Current Add-Node Picker And Workflow Runtime

Command: Playwright smoke was run with local `D:\Aic\node.exe`, bundled `playwright`, and system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`) against `http://localhost:8777/?id=codex_review_storyboard_<timestamp>`. The in-app Browser connection was attempted first but timed out on local navigation, so system Chrome was used as the stable browser-control fallback.

Result: exit code `0`.

Verified:

- App loaded with title `幻映工作台`.
- Current hover picker text included `3D导演台` and `分镜脚本`.
- Creating `3D导演台` from the picker produced a `panorama-scene` node named `3D导演台`.
- Creating `分镜脚本` from the picker produced a `storyboard-script` node with normalized `storyboardScript` state.
- Existing compatible `panorama-scene` project data still opens and receives visible default name `3D导演台`.
- `storyboard-script` rendered rows, persisted edits to `图片提示词` and `视频提示词`, switched `列表` / `卡片` / `列表`, and exported a CSV containing the edited prompts.
- `生成图像草稿` created an `ai-image` draft with `storyboardSourceNodeId`.
- `创建视频预备` created an `ai-video` prep node with `requiresVideoAuthorization: true`; it did not set queued/generating generation state, `isGenerating`, or `autoGenerate`.
- The video toolbar action helper created a connected `storyboard-script` node from a `source-video` node.
- Assistant `workflow.executeSelectedNodes` ran selected `ai-text` / `ai-image` nodes through the execution engine path and marked both completed under a stubbed runner.
- The group run button dispatched the real `workflow:execute-group` path; `ai-text` / `ai-image` completed under a stubbed renderer runner, while child `ai-video` was blocked with `video_generation_requires_authorization` and an authorization-warning toast was observed.

Smoke run id: `codex_review_storyboard_1780873987111`.

### Browser Smoke: Legacy Add-Node Menu Sibling Check

Command: In-app Browser plugin smoke was run through `node_repl` against `http://127.0.0.1:8777/?id=codex_storyboard_menu_1780883511756`.

Result: `ok: true`.

Verified:

- App loaded with title `幻映工作台`.
- `#nodeMenu` contains `text`, `image`, `video`, `test-video`, `audio`, `storyboard-script`, `panorama-scene`, and `panorama-360` entries.
- Each checked legacy menu entry has `nestedButtonCount: 0`, proving the previously malformed nested `<button>` structure is fixed at runtime.
- Labels render as `测试视频`, `音频`, `分镜脚本`, `3D导演台`, and `360全景图`.

Smoke run id: `codex_storyboard_menu_1780883511756`.

### CodeGraph Recheck

Command:

```powershell
codegraph unlock .
codegraph sync .
codegraph status .
```

Result: the stale MCP-held lock was cleared, sync completed, and status reports `Index is up to date` with `1,290 files / 26,587 nodes / 63,758 edges`. The CLI uses the WASM SQLite backend because `better-sqlite3` is unavailable; the MCP tool still reports `Transport closed`, so this review uses CodeGraph CLI evidence.

## Review Notes

- The implementation follows the requested engine-first sequence: `canvasExecutionEngine` is tested independently, then selected-node execution and group execution delegate to it.
- The current add-node picker path now matches the legacy left menu: both expose `3D导演台` and `分镜脚本`, and both preserve the `panorama-scene` / `storyboard-script` node-type split.
- `workflow.executeGroup` is now more than a manifest entry: it is implemented in workflow skills, routed by the assistant canvas skill executor, and backed by the default Canvas Skills runtime.
- The group button path keeps `allowVideoGeneration: false`, so it can run text/image nodes but blocks `ai-video` unless a separate explicit authorization path opts in.
- `storyboard-script` and `storyboard_director` remain separate: the former is a canvas node type for editable shot tables; the latter remains an assistant strategy skill.
- Existing obfuscated/single-line files were only touched through targeted patches and static tests, avoiding broad rewrites.
- Follow-up tests now cover row selection, selected-only materialization, original row-index preservation, group runtime status rendering, and legacy menu sibling-button structure.
- Canvas Skills manifest contract docs now name the exact video-gate reason, so assistant/UI callers have a documented status code for authorization warnings.

## Residual Risks

- Human manual smoke was not performed. Automated browser smoke now covers the full Task 9 checklist in Chrome, including picker creation, compatible `panorama-scene` data, row editing, CSV export, image/video materialization, toolbar-to-storyboard action, assistant selected-node execution, group-run execution, and video-block warning.
- Browser smoke intentionally stubbed provider-backed generation for assistant/group `ai-text` and `ai-image` nodes so review could prove routing and status behavior without calling external generation services.
- The automated picker smoke used the current hover picker creation path rather than a literal drag gesture; static tests and runtime state checks cover the same node creation payloads, but a final human drag check can still be done if desired.
- Git metadata remains unusable in this worktree (`fatal: not a git repository...`), so this review uses test/browser/CodeGraph CLI evidence rather than commit/diff evidence.
- CodeGraph CLI is unlocked, synced, and up to date; the MCP transport still reports `Transport closed`, so structural recheck evidence is from the CLI. Run CodeGraph CLI queries serially on the current WASM backend to avoid transient read-lock contention.
- The latest runtime smoke rechecked the legacy left menu after the final `index.html` patch; the broader workflow smoke from the prior review remains representative for routing/materialization because the final patch only changed the legacy menu HTML structure.
