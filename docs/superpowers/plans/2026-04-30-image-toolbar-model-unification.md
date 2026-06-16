# Image Toolbar Model Unification Plan

## Goal

Unify image-node tool model selection with the main image generation node:

- Standard image-generation tools use the same flat registry model picker and node-selected model state.
- Fixed RunningHUB workflow tools are explicitly treated as RunningHUB workflows, not standard image models.
- Tool payloads and output nodes preserve model identity, task metadata, duration, and source/result fields consistently.

## Current Inventory

### Main Image Generation Node

Files:

- `components/aigenImage/modelRegistryRuntime.js`
- `components/aigenImage/taskOrchestrationModule.js`
- `components/aigenImage/stateSyncModule.js`

Current behavior:

- Uses registry-backed `selectedModelId` and `selectedModelNameSnapshot`.
- Renders a flat image model list, not provider-first selection.
- Builds registry payload fields: `model`, `provider`, `apiUrl`, `apiKey`, `adapterType`, `selectedModelId`, `selectedModelNameSnapshot`.
- Sends registry image requests through `/api/v2/proxy/image`.
- Persists result fields including `images`, `sourceUrl`, `thumbUrl`, `imageUrl`, `localPath`, `jobStatus`, `generationStartTime`, and `generationDuration`.

### Image Toolbar Actions

Declared toolbar actions:

- `matting`
- `repaint`
- `erase`
- `hd`
- `expand`
- `auto-subject`
- `panorama-360`
- `multiangle`
- `multigrid`
- `annotate`
- `crop`
- `fullscreen`
- `download`
- `reset-size`

Action classes:

- Standard model-backed generation candidates: `multiangle`, `expand`, `repaint`, `erase`
- Fixed RunningHUB workflow tools: `hd`, `matting`, `auto-subject`, `panorama-360`
- Local/non-model tools: `multigrid`, `annotate`, `crop`, `fullscreen`, `download`, `reset-size`

### Free-Angle / Control Angle

Files:

- `modules/ImageFreeAngleController.js`
- `modules/ImageFreeAngleController.registry.js`
- `modules/toolModelResolutionService.js`
- `modules/toolModelUiStateService.js`

Current behavior:

- Registry wrapper resolves the source node through `resolveImageToolRuntimeModel`.
- Registry-ready control-angle generation uses `buildRegistryImagePayload` and `generateImageWithRegistryModel`.
- It writes `cameraAngle` to the source node and creates a `source-image-rotate` output node.
- The original controller still owns legacy provider/model UI; the wrapper mostly locks or overwrites it instead of replacing it with the same flat picker.

Gap:

- Interaction is not truly identical to the main image node model selector.

### Expand

File:

- `modules/ImageExpandController.js`

Current behavior:

- Builds its own provider-first model catalog from `IMAGE_MODELS`.
- Tracks local `this.model` and `this.provider`.
- Calls legacy `generateImage`.
- Creates `source-image-expand` output nodes and preserves RunningHUB/Dreamina/async task metadata.

Gap:

- Does not consume registry model state.
- Can diverge from the model selected on the source image node.

### Repaint / Erase

Files:

- `components/nodeToolbar/imageToolbar.js`
- related mask/editor logic embedded in compressed toolbar/controller code

Current behavior:

- The toolbar has `repaint` and `erase` actions.
- Some erase/mask behavior is embedded alongside video/image keying style controller logic.
- Exact generation path is not cleanly separated from the compressed toolbar module.

Gap:

- Needs extraction into an explicit tool runtime before safely changing model selection and payload fields.

### RunningHUB Special Config

Files:

- `modules/settings/apiSettings.js`
- `api/configApi.js`
- `api/adapters/RunningHubAdapter.js`
- `components/nodeToolbar/imageToolbar.js`

Current behavior:

- Settings contains a special RunningHUB card with `apiUrl`, `apiKey`, and `modelApiKey`.
- `runninghubwf` reuses the RunningHUB config.
- RunningHUB model API uses `modelApiKey`.
- RunningHUB workflow paths use `apiKey`.
- Adapter supports workflow task fields including `rhInstanceType`, `rhVideoFps`, `rhVideoFrames`, `timeSec`, `frameCount`, and `rhVideoSeconds`.
- Toolbar still hardcodes some workflow IDs and output text in compressed code.

Gap:

- Fixed workflows should display as RunningHUB workflow tools, not models.
- Duration/time fields must be schema-driven and passed through consistently where the RunningHUB workflow supports them.

## Target Contracts

### Standard Model-Backed Tool Contract

Applies to `multiangle`, `expand`, and any repaint/erase flow that submits to a standard image-generation model.

- Model selection uses the same flat image model list as the main image generation node.
- Selection writes the same node-level fields used by the main node: `selectedModelId`, `selectedModelNameSnapshot`, `modelDeleted`, `model`, `provider`.
- Tool runtime resolves via `resolveImageToolRuntimeModel`.
- Registry-backed tools submit through `buildRegistryImagePayload` and `generateImageWithRegistryModel`.
- Legacy provider/model fallback is only used when the source node is legacy and has no registry model state.

### Fixed RunningHUB Workflow Contract

Applies to `hd`, `matting`, `auto-subject`, `panorama-360`, and other fixed RunningHUB app/workflow IDs.

- UI displays `RunningHUB 工作流` and the workflow label.
- UI does not show a registry model picker or provider-first model selector.
- Credentials resolve from the special RunningHUB settings card.
- Payload uses workflow metadata: `workflowId`, `nodeInfoList`, `inputUrls`, `rhInstanceType`, and optional duration/time fields.
- Output nodes persist `provider: runninghub` or `provider: runninghubwf`, workflow label, `rhTaskId`, `rhTaskStatus`, `rhTaskStartedAt`, `rhTaskUseOpenapiQuery`, `generationStartTime`, and `generationDuration`.

### Local Tool Contract

Applies to `crop`, `annotate`, `multigrid`, `fullscreen`, `download`, and `reset-size`.

- No model selector.
- No provider state.
- Preserve only image source/result metadata.

## Data Contract

### Source Node Model Fields

- `selectedModelId`
- `selectedModelNameSnapshot`
- `modelDeleted`
- `model`
- `provider`
- `adapterType`
- `imageSize`
- `aspectRatio`
- `batchSize`

### Resolved Runtime Fields

- `source`
- `state`
- `provider`
- `model`
- `apiKey`
- `baseUrl`
- `adapterType`
- `selectedModelId`
- `selectedModelNameSnapshot`
- `displayLabel`
- `modelRecord`

### Common Tool Payload Fields

- `prompt`
- `inputUrls`
- `inputMaskUrls`
- `maskImageDataUrl`
- `aspectRatio`
- `imageSize`
- `batchSize`
- `cameraAngle`
- `operation`
- `workflowId`
- `durationSec`
- `timeSec`
- `rhVideoSeconds`
- `rhVideoFrames`
- `frameCount`
- `rhInstanceType`

### Output Node Fields

- `provider`
- `model`
- `selectedModelId`
- `selectedModelNameSnapshot`
- `outputText`
- `jobStatus`
- `jobError`
- `isGenerating`
- `generationStartTime`
- `generationDuration`
- `asyncTaskProvider`
- `asyncTaskKind`
- `asyncTaskId`
- `asyncTaskStatus`
- `rhTaskId`
- `rhTaskStatus`
- `rhTaskStartedAt`
- `rhTaskRecovering`
- `rhTaskUseOpenapiQuery`
- `dreaminaSubmitId`
- `dreaminaTaskStatus`
- `sourceUrl`
- `thumbUrl`
- `imageUrl`
- `localPath`
- `displayLocalPath`
- `thumbLocalPath`
- `width`
- `height`

## Implementation Plan

### Phase 1: Shared Image Tool Picker

Create a reusable picker module, for example `modules/imageToolModelPicker.js`.

Responsibilities:

- Render the same flat image registry model list as `applyImageModelSelectorUi`.
- Reuse `buildImageModelSelectionPatch`.
- Write selection back to the source node through the store.
- Expose an embeddable API for controllers: `mountImageToolModelPicker({ root, nodeId, store })`.
- Show missing/deleted/unconfigured state consistently.

### Phase 2: Shared Tool Runtime Service

Create or extend a runtime module, for example `modules/imageToolGenerationRuntime.js`.

Responsibilities:

- Resolve source node model through `resolveImageToolRuntimeModel`.
- Build standard registry payloads for tool operations.
- Normalize result fields for output nodes.
- Centralize task patches for registry, legacy async, RunningHUB, and Dreamina.
- Preserve generation duration for success, failure, cancellation, and timeout.

### Phase 3: Control Angle Migration

Modify `modules/ImageFreeAngleController.registry.js` and the controller integration.

Changes:

- Replace legacy model menu lock/override with the shared flat picker.
- Default to source node selected model.
- On picker change, update source node model fields, not a hidden tool-only model.
- Keep current registry generation behavior and `cameraAngle` payload.
- Preserve legacy fallback only when the source node has no registry model state.

### Phase 4: Expand Migration

Modify `modules/ImageExpandController.js` using a wrapper or a readable facade instead of directly editing compressed branches where possible.

Changes:

- Replace provider-first expand model catalog with the shared flat picker for registry-backed nodes.
- Submit registry-backed expand through `buildRegistryImagePayload` and `generateImageWithRegistryModel`.
- Preserve expand-specific fields: fixed prompt, expanded source image URL, `aspectRatio`, `imageSize`, `batchSize: 1`.
- Preserve output node fields and task resume patches.
- Keep legacy expand path for old nodes without `selectedModelId`.

### Phase 5: Repaint / Erase Extraction

Extract repaint and erase submit logic out of `components/nodeToolbar/imageToolbar.js` into a readable module.

Target module:

- `modules/imageEditToolRuntime.js`

Changes:

- Define operations such as `repaint` and `erase` with explicit payload shape.
- For standard image-model repaint/erase, use the shared picker and registry runtime.
- For fixed workflow repaint/erase variants, register them in the RunningHUB workflow catalog instead of showing as model-backed tools.
- Preserve mask fields: `maskImageDataUrl`, `inputMaskUrls`, brush marks, erase mode, and source image URL.

### Phase 6: RunningHUB Workflow Catalog

Create `modules/runningHubWorkflowToolCatalog.js`.

Each entry should define:

- `action`
- `label`
- `workflowId`
- `providerMode`
- `requiredConfig`
- `inputFields`
- `durationFields`
- `nodeInfoListBuilder`
- `outputNodePrefix`
- `resultExtractor`

Known candidates:

- `hd`
- `matting`
- `auto-subject`
- `panorama-360`
- any hardcoded RunningHUB workflow currently embedded in toolbar or adapter code

Duration support:

- If workflow supports duration, expose one normalized UI/store field first: `durationSec`.
- Convert to provider-specific fields at the edge: `timeSec`, `rhVideoSeconds`, `frameCount`, or `rhVideoFrames`.
- Keep `generationDuration` reserved for elapsed task duration and do not reuse it as requested output duration.

### Phase 7: Settings Alignment

Keep RunningHUB below Dreamina as a special provider section.

Changes:

- Preserve fields: `apiUrl`, `apiKey`, `modelApiKey`.
- Add optional defaults only if workflow catalog needs them: `defaultRhInstanceType`, `defaultDurationSec`.
- Ensure `getProviderConfig("runninghubwf")` continues to reuse RunningHUB workflow credentials.
- Do not put fixed workflow app IDs into the registry model list.

### Phase 8: UI Capability Cleanup

Replace raw model-prefix checks where feasible.

Changes:

- Derive image size, aspect ratio, nano mode, RunningHUB resolution, and special panels from resolved model metadata/capabilities.
- For special workflows, render workflow-specific controls from catalog fields.
- For standard registry models, hide provider-first submenu branches.

## Verification Plan

Focused unit tests:

- `modules/toolModelResolutionService.test.js`
- `modules/imageToolModelPicker.test.js`
- `modules/imageToolGenerationRuntime.test.js`
- `modules/ImageFreeAngleController.registry.test.js`
- `modules/ImageExpandController.registry.test.js`
- `modules/runningHubWorkflowToolCatalog.test.js`

Manual smoke tests:

- Main image node model selection remains flat and generates normally.
- Control angle opens with the same selected model as the source node.
- Changing model inside control angle updates source node selected model.
- Expand uses the same selected registry model and output node keeps `selectedModelId`.
- RunningHUB HD/matting/subject/360 show `RunningHUB 工作流`, not model picker.
- RunningHUB workflow runs with only special RunningHUB settings configured.
- Duration-capable RunningHUB workflows pass `durationSec` to provider-specific fields and still record elapsed `generationDuration`.
- Legacy nodes without `selectedModelId` still work through legacy fallback.

## Risks

- `components/nodeToolbar/imageToolbar.js`, `modules/ImageExpandController.js`, and `api/adapters/RunningHubAdapter.js` are compressed one-line files. Direct large edits are risky.
- Repaint/erase behavior is not cleanly isolated, so extraction should happen before behavior changes.
- RunningHUB fixed workflows and RunningHUB model API must stay separate; mixing them in the registry picker would recreate the original ambiguity.

## Recommended Execution Order

1. Mark `T008` ready and split it into picker/runtime/workflow-catalog subtasks.
2. Build shared image tool picker and tests.
3. Migrate control-angle UI to the shared picker.
4. Migrate expand runtime to registry-backed generation.
5. Extract repaint/erase runtime and classify each path as standard model or fixed workflow.
6. Add RunningHUB workflow catalog and duration field mapping.
7. Run full focused tests and a manual smoke pass.
