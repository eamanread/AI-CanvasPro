## Decisions

### 2026-04-30
- Added repository-level execution docs required by `AGENTS.md` because the source snapshot did not include `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md`, or `docs/DECISIONS.md`.
- Treat slash preset regression and tool/model-config unification as separate tracks:
  - slash preset issue is a P0 bounded bugfix
  - image/text tool unification is a broader architectural repair that needs a documented migration plan before wide edits
- Replaced the shared slash preset runtime with a readable implementation because the previous module had two concrete drift problems:
  - rendered class names diverged from node-local slash menu styling (`preset-slash-*` vs `v2-slash-*`)
  - trigger detection was too brittle for contenteditable prompt structures
- Kept image/text tool model-config unification as a documented phased migration instead of a same-turn broad refactor because the main node generation path is already registry-aware while several tool entrypoints still depend on legacy provider inference.
- Restored RunningHUB and other non-standard provider config as a dedicated "special provider" section directly below Dreamina in settings because these providers still need provider-level credentials that do not fit cleanly into registry model rows yet.
- Introduced `modules/toolModelResolutionService.js` as the shared resolution contract for tool entrypoints:
  - registry-selected `selectedModelId` wins over legacy `provider/model` inference
  - legacy provider config remains as a compatibility fallback only
- Patched `ImageFreeAngleController` via a side-effect wrapper import from a readable module instead of editing the compressed controller file directly:
  - the controller source is bundled into a single high-risk line
  - mutating the exported singleton from `ImageFreeAngleController.registry.js` keeps existing imports working while making the registry migration testable
- Complete slash preset submenu and custom-manager behavior inside `modules/slashMenu.js` by using explicit menu state and delegated menu actions instead of hover-derived submenu state. This keeps preset data, manager APIs, backend routes, and generation payload fields unchanged.
- Added `modules/toolModelUiStateService.js` as the shared UI-state contract for text/image tool model controls:
  - registry-backed tool state locks legacy tool-local model menus
  - visible labels come from resolved model metadata instead of raw model prefixes
  - capability panels can be toggled from resolved model capabilities/family metadata
- Applied the shared UI-state contract through `modules/ImageFreeAngleController.registry.js` instead of directly editing `modules/ImageFreeAngleController.js`, because the controller remains a compressed single-line module.
- Kept image toolbar fixed-workflow actions such as one-click 360 panorama outside the registry-model migration for this cycle:
  - they are RunningHUB workflow integrations, not standard image model adapters
  - they should use the restored special provider configuration section
  - their boundary and any future migration are tracked separately in T008
- Treat AI image `batchSize` as a store-backed node setting, not only local UI state, because task payload builders now resync from the central store before generation.
- Registry-backed image generation now guarantees requested batch size by submitting the remaining count again when an OpenAI-compatible or custom provider returns fewer images than requested; native `n`/`batchSize` is still used first for providers that support it.
- Revised the T008 implementation plan around a hard boundary between standard image model-backed tools and fixed RunningHUB workflow tools:
  - standard tools inherit source image node registry fields through `selectedModelId` and resolve through `toolModelResolutionService`
  - fixed RunningHUB workflows use the special-provider config and a workflow catalog instead of appearing in the standard image model registry
- Standardized planned requested-duration passthrough as `durationSec` and preserved `generationDuration` exclusively for elapsed runtime/task timing.
- Completed T008 by separating standard image model-backed toolbar tools from fixed RunningHUB workflow tools:
  - standard tools inherit source image node registry fields and resolve through `toolModelResolutionService`
  - expand and free-angle use shared image tool model selection and registry payload contracts
  - fixed RunningHUB workflow actions are cataloged separately and use the RunningHUB special-provider config instead of model registry rows
- Added `registry-openai` compatibility to the legacy image generation entrypoint because compressed tool controllers can still call `generateImage`; direct generation now delegates registry payloads to the shared registry runtime so async task polling uses registered model configuration.
- Added `defaultDurationSec` to the RunningHUB special-provider config and preserved it through `getProviderConfig("runninghub")` and `getProviderConfig("runninghubwf")`; `durationSec` remains requested duration and `generationDuration` remains elapsed runtime.
- Planned Windows single-exe distribution as a PyInstaller `--onefile` launcher/server build rather than an Electron/Tauri rewrite because the current app is already a Python local server plus static ES-module frontend.
- For onefile packaging, split runtime roots into bundled read-only `resourceRoot` and stable writable `writableRoot`; this prevents config, prompt presets, uploads, assets, workflows, and outputs from being written into PyInstaller's temporary extraction directory.
- Preserve all existing HTTP API request/response contracts for config, settings, projects, presets, uploads, outputs, assets, workflows, and generation payloads; packaging may only add optional runtime diagnostics to `/api/v2/runtime/info`.
- Treat bundled `config/prompt-presets.json` as a seed file in packaged builds and persist editable preset definitions under user storage so custom/system preset edits survive process restarts.
- Implement onefile detection with an explicit launcher flag (`AIC_PACKAGED_LAUNCHER` / `AIC_DISTRIBUTION=onefile`) instead of assuming every frozen `_MEIPASS` runtime is onefile; this preserves existing onedir storage behavior.
- Keep the existing onedir zip build workflow and add a separate onefile workflow so current distribution users are not forced onto the new runtime layout in the same change.
- Generate sha256 and manifest files beside the onefile exe because GitHub Release consumers need a stable integrity check and machine-readable artifact metadata.
- Added a registry image request adapter for custom image models because users can configure provider root URLs such as `https://yunwu.ai/v1` instead of full generation endpoints:
  - OpenAI-compatible `/v1` image base URLs normalize to `/v1/images/generations`
  - `mj_*` models use Midjourney proxy submit/fetch endpoints
  - model validation and generation share the same adapter to avoid config-test/runtime drift
- Normalize object-shaped API error messages at the shared `ApiError` boundary so remote payloads like `{ error: { message } }` do not reach UI as `[object Object]`.

### 2026-05-01
- Local fixed-CDKEY subscription status now treats the device fingerprint as a set of current MAC addresses instead of only the first `uuid.getnode()` result, because Windows adapter ordering can change after reboot while the original bound adapter is still present.
- Subscription installId recovery now falls back to `license.json:lastInstallId` when browser localStorage and user settings are missing, so a valid local license can survive restart without forcing the user to re-enter the subscription code.

### 2026-05-08
- Registry-backed `grsai/gpt-image-2` image generation now follows the same GRSai `/v1/draw/completions` submit and `/v1/draw/result` polling contract as the legacy image node path, instead of treating it as a generic OpenAI `/v1/images/generations` model.
- Success acknowledgement text such as `msg: "success"` is filtered out of model-validation/image-runtime error extraction, because it is transport status metadata rather than a user-facing failure reason.
