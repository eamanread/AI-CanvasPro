# Storyboard Script Upstream-First Redo Implementation Plan

> Status: implemented and verified. Primary goal: keep the upstream `StoryboardScriptNode` body and only connect text model selection/execution to the Generate Text registry runtime.

## Goal

Restore the upstream-first direction for Storyboard Script. The node remains a Storyboard Script node, not a Generate Text clone.

Keep upstream capabilities intact:

- Storyboard Script identity, default shape, and schema
- header, beta badge, image/video mode switch, list/card view, fullscreen, CSV, queue button
- storyboard rows, table/card editing, selection mode, selected-shot image generation
- text/image/video/multimodal prompt building
- image/video references, video-frame preprocessing, submit task runtime
- JSON parsing, canonical result storage, failed/loading states

## Final User Review Constraints

- Do not turn Storyboard Script into Generate Text.
- Keep `StoryboardScriptNode` body upstream-first.
- Only wire text model selection and text model execution through Generate Text registry runtime.
- Delete the previous text-thumbnail DOM hack and its tests.
- Add the important runner dispatch: `registry-openai` -> `generateTextWithRegistryModel`.
- Fix `applyTextModelSelectorUi` stale closure so reused menu DOM writes the latest node/store.
- Split text reference acceptance into two checks: shared ref bar is used; generated prompt contains text reference content.
- When no default model is configured, behave like Generate Text: warn/fail/stop, do not pretend a default model is available.

## Implemented Changes

### `components/StoryboardScriptNode.js`

- Kept shared prompt panel and `_renderSharedRefBar(this)`.
- Removed Storyboard-only text thumbnail DOM helpers/hacks:
  - `isStoryboardScriptTextReferenceNode`
  - `renderStoryboardScriptTextRefThumb`
  - `normalizeStoryboardScriptTextRefBar`
  - private `_renderRefBar` wrapper / DOM normalization hack
- `applyStoryboardScriptRegistryModelSelector(node)` only owns the prompt-panel `.img-model-wrap` in normal mode; selection mode keeps the upstream image-model behavior.
- Model selection patches nested `storyboardScript` fields and synchronizes top-level `model/provider` for legacy runtime compatibility.
- `mount`, `update`, and `_syncSelectionModeUi` reapply the text registry selector after upstream UI sync when not in selection mode.
- `_buildPayload` still uses upstream Storyboard payload construction first, then resolves registry fields with `resolveTextNodeModelState` and `buildRegistryTextPayload`.
- Deleted/unconfigured registry models persist `storyboardScript.status = "failed"`, set `storyboardScript.error`, show a warning toast, and return `null` to stop execution.
- `runStoryboardScriptTextGeneration(payload)` dispatches `REGISTRY_TEXT_PROVIDER` to `generateTextWithRegistryModel(payload)` and keeps legacy providers on `generateText(payload)`.
- Stored text refs from `promptAssetInputRefs` are prepended to `promptText` when missing so text references affect generation.

### `components/aigenText/modelRegistryRuntime.js`

- `applyTextModelSelectorUi` now stores the latest `{ node, store, labelEl, triggerEl }` on `menuEl.__registryContext` every time it is applied.
- The click handler reads `menuEl.__registryContext` instead of the first bound closure, preventing stale node/store writes when a menu DOM is reused.

### `storyboardScriptTextModelRegistry.test.js`

Added/updated acceptance coverage for:

- selector rebinding writes through the latest node context
- Storyboard selector writes nested `storyboardScript` registry fields
- Storyboard `_buildPayload` uses `buildRegistryTextPayload(payload, modelState.model)`
- `registry-openai` dispatch uses `generateTextWithRegistryModel(payload)`
- unconfigured/deleted registry models fail with status/toast instead of continuing
- text references use shared ref bar instead of DOM hacks
- text reference content enters Storyboard submit prompt

## Obsolete Plans Kept As Marked History

- `2026-06-09-storyboard-script-model-selector-reference-fix.md`
- `2026-06-09-storyboard-script-reference-thumbnail-parity-fix.md`

Both are marked superseded/obsolete instead of deleted to avoid removing untracked history without explicit confirmation.

## Verification Command

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js storyboardScriptInteractionGlue.test.js storyboardScriptSidePlusProduct.test.js storyboardScriptDependencyClosure.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptToolbarAction.upstream.test.js components\aigenText\modelRegistryRuntime.test.js components\aigenText\taskOrchestrationModule.test.js
```

## Verification Result

Fresh automated verification passed on 2026-06-09:

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js storyboardScriptInteractionGlue.test.js storyboardScriptSidePlusProduct.test.js storyboardScriptDependencyClosure.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptToolbarAction.upstream.test.js components\aigenText\modelRegistryRuntime.test.js components\aigenText\taskOrchestrationModule.test.js
```

Result: 54 pass, 0 fail.

## Manual UI Checks Still Recommended

- Create a Storyboard Script node and verify upstream UI features are still present.
- Open the red-circled text model selector and verify label, active item, and selection behavior match Generate Text.
- Enter and exit selected-shot mode; normal mode should restore the text registry selector.
- Connect/reference Generate Text or source text; shared ref bar should show the reference and generation prompt should include the reference text.
- With no configured text model, verify the UI warns/fails/stops instead of running with a fake default.

## Residual Risk

Automated tests cover the adapter and payload behavior. Real browser focus/hover/menu layering still deserves one manual pass because `components/StoryboardScriptNode.js` is obfuscated/minified and hard to review structurally.
