# Image Toolbar Model Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify image toolbar model-backed tools with the image generation node's registry model selection, while keeping fixed RunningHUB workflows on the special-provider configuration path.

**Architecture:** The source image node owns standard image model selection through `selectedModelId` plus registry snapshots. Model-backed tools resolve that node state through shared runtime helpers and call the same registry generation path as the image generation node. Fixed RunningHUB workflows are not registry models; they use a catalog backed by the RunningHUB special API card and only pass workflow-specific fields to the RunningHUB adapter.

**Tech Stack:** Native ES modules, DOM controllers, `appStore`, model registry services, `api/aiImageApi.js`, `api/configApi.js`, RunningHUB adapter, Node test runner.

---

## Review Findings

### P0: Tool model ownership is still split between source node registry fields and tool-local legacy fields

Evidence:
- `components/aigenImage/modelRegistryRuntime.js` writes registry-backed image selection with `selectedModelId`, `selectedModelNameSnapshot`, `model`, and `provider: "registry-openai"`.
- `modules/toolModelResolutionService.js` already prefers `selectedModelId` and exposes `resolveImageToolRuntimeModel(data)`.
- `modules/ImageFreeAngleController.registry.js` uses the resolver for control-angle generation.
- `modules/ImageExpandController.js` still builds a provider-first `IMAGE_MODELS` menu and sends `model` plus `provider` directly to legacy `generateImage`.

Impact:
- Selecting a model in the generation image node and selecting a model in tools can diverge.
- Hidden tool-local provider menus can overwrite or imply a different runtime than the node-selected registry model.
- Expanding this pattern to repaint, erase, or future tools will create inconsistent payload fields and recovery fields.

Required correction:
- The source image node is the single owner of standard image model fields.
- Tool-local standard model menus must render the same flat image model list as the image generation node and write the same node fields.
- Tool controllers must resolve runtime through a shared helper before generation.

### P0: RunningHUB fixed workflows must not be represented as registry image models

Evidence:
- `modules/settings/apiSettings.js` has a restored special-provider section for `runninghub` with `apiUrl`, `apiKey`, and `modelApiKey`.
- `api/configApi.js` maps `runninghubwf` compatibility reads back to the RunningHUB provider config.
- `components/nodeToolbar/imageToolbar.js` contains hardcoded RunningHUB workflow URLs, workflow ids, polling, and action labels for one-click workflows such as 360 panorama and HD upscaling.
- `api/adapters/RunningHubAdapter.js` has separate workflow and model request builders, including `runninghub/` workflow ids and `runninghub-model/` model ids.

Impact:
- Putting workflow ids into the standard image model registry would make the UI claim these are normal image-generation models, but their payload shape, credentials, polling, and task recovery differ.
- RunningHUB model calls and RunningHUB workflow calls use different credentials: `modelApiKey` is for `runninghub-model/`, while workflow calls use `apiKey`.

Required correction:
- Fixed RunningHUB workflow actions stay under a workflow catalog and display `RunningHUB` as provider/source.
- The model selector for standard tools must not list workflow ids.
- The workflow catalog must read `getProviderConfig("runninghub")` and preserve legacy `runninghubwf` compatibility.

### P0: Duration fields need a strict contract

Evidence:
- Image output nodes and tasks use `generationDuration` as elapsed runtime.
- RunningHUB adapter code supports requested video/workflow duration-style fields including `timeSec`, `rhVideoSeconds`, `frameCount`, `rhVideoFrames`, and `rhVideoFps`.
- User requirement says RunningHUB configuration must support duration.

Impact:
- Reusing `generationDuration` for requested output duration would corrupt elapsed time reporting and recovery semantics.
- Passing multiple duration aliases from UI state can cause adapters to choose the wrong value.

Required correction:
- Use `durationSec` for requested output duration.
- Keep `generationDuration` only for elapsed task time.
- Map `durationSec` to provider-specific fields only inside the RunningHUB workflow runtime/catalog layer.

### P1: Compressed toolbar/controller files increase regression risk

Evidence:
- `components/nodeToolbar/imageToolbar.js` and `modules/ImageExpandController.js` are compressed into very large single-line modules.
- Existing control-angle migration avoided direct edits by patching `ImageFreeAngleController` through `modules/ImageFreeAngleController.registry.js`.

Impact:
- Broad edits in compressed files are hard to review and easy to break.
- Tool behavior is spread across DOM actions, provider-specific submit code, output-node creation, and task recovery fields.

Required correction:
- Add readable wrapper/runtime modules and only make narrow import or call-site replacements in compressed files.
- Move reusable selector, workflow catalog, and output field normalization into focused modules with tests.

### P1: Repaint and erase must be classified before migration

Evidence:
- Toolbar actions include `repaint` and `erase`, but their exact generation path must be extracted from `components/nodeToolbar/imageToolbar.js`.
- Similar image tools can either be standard image model calls with masks/input images or fixed workflow calls.

Impact:
- Blindly forcing repaint/erase through registry could break mask payloads or provider-specific workflows.
- Leaving them in legacy mode while showing unified model UI would produce false UI claims.

Required correction:
- First inventory repaint and erase entrypoints, input fields, mask fields, provider calls, and output patches.
- Then classify each action as `standard-model`, `runninghub-workflow`, or `local-only`.
- The UI label and payload builder must follow that classification.

---

## Scope

In scope:
- Control-angle/free-angle image tool model selection and runtime.
- Expand image tool model selection and runtime.
- Repaint and erase inventory plus classification.
- Fixed RunningHUB workflow boundary for HD, 360 panorama, auto-subject, and toolbar RunningHUB actions.
- Duration field contract for RunningHUB workflow tools.
- Output node and task metadata field preservation.

Out of scope:
- Moving RunningHUB workflow ids into the standard image model registry.
- Redesigning model registry storage.
- Changing slash preset behavior.
- Rewriting local-only toolbar tools such as crop, annotate, fullscreen, download, reset-size, or layout memory.
- Replacing the RunningHUB adapter.

---

## Dependency Map

### Standard model-backed path

Files and responsibilities:
- `components/aigenImage/modelRegistryRuntime.js`: existing image-node registry selector, image registry payload builder, registry generation executor.
- `modules/toolModelResolutionService.js`: source-node runtime resolver for registry and legacy state.
- `modules/toolModelUiStateService.js`: locks or labels legacy tool-local model controls when registry state is active.
- `src/core/store.js`: node data owner through `appStore.updateNodeData`.
- `services/fileService.js`: output source-media node payload construction.
- `api/aiImageApi.js`: legacy provider generation and task callbacks.

Required data flow:
1. User opens model selector from an image tool.
2. Selector reads `getModelsByNodeType("image")`.
3. Selector writes the selected model to the source node using the same field patch as the image generation node.
4. Tool generation reads the latest source node data from `appStore`.
5. Runtime resolves with `resolveImageToolRuntimeModel(sourceNode)`.
6. Registry-backed runtime calls `generateImageWithRegistryModel(payload, resolved.modelRecord)`.
7. Legacy-compatible runtime calls existing `generateImage(payload, callbacks)` only when no registry state exists.
8. Output node receives normalized media fields plus task metadata.

### Fixed RunningHUB workflow path

Files and responsibilities:
- `modules/settings/apiSettings.js`: displays and saves RunningHUB special API config.
- `api/configApi.js`: returns RunningHUB config and compatibility config for `runninghubwf`.
- `api/adapters/RunningHubAdapter.js`: builds RunningHUB workflow and model requests.
- `components/nodeToolbar/imageToolbar.js`: current source of toolbar action entrypoints and legacy workflow constants.
- New `modules/runningHubWorkflowToolCatalog.js`: single catalog for fixed workflow action metadata and provider-specific field mapping.

Required data flow:
1. User triggers a fixed workflow action.
2. Toolbar runtime reads catalog entry by action id.
3. Runtime reads `getProviderConfig("runninghub")`.
4. Runtime builds workflow payload from catalog entry, source image fields, and explicit user options.
5. Runtime maps `durationSec` to RunningHUB-specific fields only inside this layer.
6. Runtime calls existing RunningHUB submit/poll/save helpers or the shared `generateImage` path if the adapter already covers the workflow shape.
7. Output node displays provider `runninghub`, model/catalog label, workflow id, task id, status, elapsed `generationDuration`, and media fields.

---

## Field Contract

### Source image node fields

| Field | Owner | Readers | Rules |
| --- | --- | --- | --- |
| `selectedModelId` | Image node model selector and unified tool selector | `toolModelResolutionService`, model registry runtime | Primary standard model identity. Tool-local selectors must write this field for standard model-backed tools. |
| `selectedModelNameSnapshot` | Image node model selector and unified tool selector | UI labels, deleted-model state | Preserve when model exists or is deleted so UI can explain deleted state. |
| `modelDeleted` | Model registry runtime | UI state, resolver | Set to `false` on valid selection. Do not use for fixed workflows. |
| `provider` | Legacy compatibility patch and output metadata | Legacy APIs, adapters, UI labels | For registry state use `registry-openai`; for fixed workflow output use `runninghub`; for legacy fallback preserve existing provider. |
| `model` | Legacy compatibility patch and adapters | Legacy APIs, output metadata | For registry state use selected model's adapter id or model name. For fixed workflows use catalog model label or workflow id. |
| `apiKey`, `apiUrl`, `baseUrl` | Provider/model config | Runtime builders | Do not store fresh secrets on arbitrary toolbar nodes. Resolve from config at runtime. |
| `aspectRatio`, `imageSize`, `batchSize` | Node/tool UI | Payload builders | Preserve current node values unless the operation explicitly suppresses or overrides them. |
| `cameraAngle` | Control-angle tool | Control-angle payload and UI | Only control-angle writes this action-specific field. |
| `durationSec` | Duration-capable workflow tool UI | RunningHUB workflow catalog | Requested output duration. Never used for elapsed runtime. |

### Resolved runtime fields

`resolveImageToolRuntimeModel(sourceNode)` must remain the single read contract for standard model-backed tools.

```js
{
  source: "registry" | "legacy",
  state: "ready" | "deleted" | "unconfigured",
  provider: string,
  model: string,
  apiKey: string,
  baseUrl: string,
  adapterType: string,
  selectedModelId: string,
  selectedModelNameSnapshot: string,
  displayLabel: string,
  modelRecord: object
}
```

Rules:
- `state: "deleted"` blocks generation with a user-facing error.
- `state: "unconfigured"` blocks registry generation and can fall back to legacy only when no registry identity exists.
- Fixed RunningHUB workflow tools must not call this resolver for workflow ids.

### Standard model-backed payload fields

```js
{
  prompt: string,
  inputUrls: string[],
  aspectRatio: string,
  imageSize: string,
  batchSize: number,
  provider: "registry-openai",
  model: string,
  selectedModelId: string,
  selectedModelNameSnapshot: string,
  adapterType: string,
  operation: "free-angle" | "expand" | "repaint" | "erase",
  cameraAngle: string,
  maskUrl: string,
  maskPngBase64: string
}
```

Rules:
- `operation` is internal metadata and must not be sent to providers that reject unknown fields unless the adapter ignores it.
- `cameraAngle` is only present for control-angle.
- `maskUrl` or `maskPngBase64` is only present for repaint or erase after their current payload path is classified.
- Registry generation must continue using `processInputImages` as expected by `generateImageWithRegistryModel`; do not pass RunningHUB workflow `nodeInfoList` fields into this path.

### Fixed RunningHUB workflow payload fields

```js
{
  provider: "runninghub",
  action: "hd" | "panorama-360" | "auto-subject" | "matting",
  workflowId: string,
  model: string,
  inputUrls: string[],
  nodeInfoList: object[],
  durationSec: number,
  timeSec: number,
  rhVideoSeconds: number,
  frameCount: number,
  rhVideoFrames: number,
  rhVideoFps: number,
  rhTaskKind: "workflow"
}
```

Rules:
- `durationSec` is the UI/runtime canonical requested duration.
- `timeSec`, `rhVideoSeconds`, `frameCount`, and `rhVideoFrames` are adapter-facing derived fields.
- For image-only workflows that do not consume duration, omit all duration-derived fields.
- Workflow credentials come from `getProviderConfig("runninghub").apiKey`.
- `runninghub-model/` calls use `modelApiKey` and are not fixed workflow actions.

### Output node fields

Every generated `source-image` node must preserve these fields when available:

```js
{
  provider: string,
  model: string,
  selectedModelId: string,
  selectedModelNameSnapshot: string,
  sourceUrl: string,
  thumbUrl: string,
  imageUrl: string,
  localPath: string,
  originalLocalPath: string,
  displayLocalPath: string,
  thumbLocalPath: string,
  fileName: string,
  generationStartTime: number,
  generationDuration: number,
  jobStatus: "running" | "success" | "failed" | "cancelled",
  jobError: string,
  asyncTaskProvider: string,
  asyncTaskKind: string,
  asyncTaskId: string,
  asyncTaskStatus: "running" | "success" | "failed" | "cancelled",
  rhTaskId: string,
  rhTaskStatus: string,
  rhTaskStartedAt: number,
  rhTaskRecovering: boolean,
  rhTaskUseOpenapiQuery: boolean,
  durationSec: number
}
```

Rules:
- `generationDuration` is elapsed milliseconds or seconds according to existing code convention; do not overload it with requested duration.
- `durationSec` is preserved only for duration-capable generated media or workflow metadata.
- Registry outputs should preserve `selectedModelId` and `selectedModelNameSnapshot`.
- Fixed workflow outputs should preserve `provider: "runninghub"`, workflow model label/id, `rhTaskId`, and `rhTaskStatus`.

---

## Tool Classification Matrix

| Toolbar action | Classification | Current behavior | Target behavior |
| --- | --- | --- | --- |
| `multiangle` / control-angle | Standard model-backed | Partially migrated through `ImageFreeAngleController.registry.js` | Use unified flat image model picker, resolve source node through `toolModelResolutionService`, call registry generation when selected model is registry-backed. |
| `expand` | Standard model-backed unless explicitly classified legacy by tests | Uses provider-first `IMAGE_MODELS` menu and legacy `generateImage` payload | Add wrapper/runtime so the tool uses the same flat model picker and registry runtime as image generation node. |
| `repaint` | Classification gate required before code migration | Toolbar action exists; exact payload path must be extracted from compressed toolbar module | Inventory masks, input urls, provider calls, and output patches. If standard model-backed, route through shared runtime. If fixed workflow, route through RunningHUB catalog. |
| `erase` | Classification gate required before code migration | Toolbar action exists; exact payload path must be extracted from compressed toolbar module | Same classification and routing rules as repaint. |
| `hd` | Fixed RunningHUB workflow | Hardcoded RunningHUB workflow in toolbar | Move workflow metadata into catalog, use RunningHUB special config, display provider `RunningHUB`, do not show standard model selector. |
| `panorama-360` | Fixed RunningHUB workflow | Hardcoded RunningHUB workflow in toolbar | Move workflow metadata into catalog, use RunningHUB special config, preserve workflow task fields and optional duration if supported by workflow. |
| `auto-subject` | Fixed RunningHUB workflow | Hardcoded RunningHUB workflow in toolbar | Move workflow metadata into catalog and preserve existing output behavior. |
| `matting` | Local editor or fixed workflow depending entrypoint | `ImageMattingController.js` handles local mask/SAM editor; toolbar also has RunningHUB-style action strings | Keep local editor local. Only route a remote RunningHUB matting action through catalog if current toolbar path submits a workflow. |
| `crop` | Local-only | Local crop controller | No model selector and no provider fields beyond existing media output. |
| `annotate` | Local-only | Local annotate controller | No model selector. |
| `multigrid` | Local-only layout/composition | Toolbar-local action | No model selector unless code inventory proves it calls a provider. |
| `fullscreen` | Local-only | View action | No model or task changes. |
| `download` | Local-only | File action | No model or task changes. |
| `reset-size` | Local-only | UI sizing action | No model or task changes. |

---

## File Structure

Create:
- `modules/imageToolModelPicker.js`: shared flat image model selector for toolbar tools.
- `modules/imageToolGenerationRuntime.js`: shared standard model-backed generation runtime, field normalization, and output patch helpers.
- `modules/runningHubWorkflowToolCatalog.js`: fixed RunningHUB workflow catalog and duration mapping.
- `modules/ImageExpandController.registry.js`: readable wrapper around compressed expand controller.
- `modules/imageToolbarActionInventory.test.js`: characterization tests for toolbar action classification.
- `modules/imageToolModelPicker.test.js`: selector patch and UI-state tests.
- `modules/imageToolGenerationRuntime.test.js`: standard runtime payload and output patch tests.
- `modules/runningHubWorkflowToolCatalog.test.js`: workflow config, credential, and duration mapping tests.
- `modules/ImageExpandController.registry.test.js`: expand wrapper runtime tests.

Modify:
- `modules/ImageFreeAngleController.registry.js`: replace bespoke selector/runtime pieces with shared helpers, preserve existing control-angle behavior.
- `components/nodeToolbar/imageToolbar.js`: narrow import/call-site edits only, routing model-backed and fixed workflow actions to new modules.
- `components/aigenImage/modelRegistryRuntime.js`: export reusable selection patch or keep current export stable if already exported.
- `modules/toolModelResolutionService.js`: add fields only if tests prove a missing field in tool runtime.
- `modules/toolModelUiStateService.js`: add selectors only if new tool DOM controls need locking or labels.
- `docs/TASKS.md`: move T008 to `in_progress` during implementation and to `done` after validation.
- `docs/DECISIONS.md`: record final workflow/model boundary and duration-field decision.

---

## Implementation Tasks

### Task 1: Characterize toolbar action dependencies

**Files:**
- Create: `modules/imageToolbarActionInventory.test.js`
- Read: `components/nodeToolbar/imageToolbarHtml.js`
- Read: `components/nodeToolbar/imageToolbar.js`
- Read: `modules/ImageExpandController.js`
- Read: `modules/ImageMattingController.js`

- [ ] **Step 1: Add a characterization test that locks the action list**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { IMAGE_TOOLBAR_ACTIONS } from "../components/nodeToolbar/imageToolbarHtml.js";

test("image toolbar action list stays classified", () => {
  assert.deepEqual(IMAGE_TOOLBAR_ACTIONS, [
    "matting",
    "repaint",
    "erase",
    "hd",
    "expand",
    "auto-subject",
    "panorama-360",
    "multiangle",
    "multigrid",
    "annotate",
    "crop",
    "fullscreen",
    "download",
    "reset-size",
  ]);
});
```

- [ ] **Step 2: Add a classification assertion**

```js
const TOOL_CLASSIFICATION = {
  matting: "local-or-runninghub-after-inventory",
  repaint: "classification-required",
  erase: "classification-required",
  hd: "runninghub-workflow",
  expand: "standard-model",
  "auto-subject": "runninghub-workflow",
  "panorama-360": "runninghub-workflow",
  multiangle: "standard-model",
  multigrid: "local-only",
  annotate: "local-only",
  crop: "local-only",
  fullscreen: "local-only",
  download: "local-only",
  "reset-size": "local-only",
};

test("every image toolbar action has an explicit migration classification", () => {
  assert.equal(Object.keys(TOOL_CLASSIFICATION).length, IMAGE_TOOLBAR_ACTIONS.length);
  for (const action of IMAGE_TOOLBAR_ACTIONS) {
    assert.ok(TOOL_CLASSIFICATION[action], `${action} must be classified`);
  }
});
```

- [ ] **Step 3: Run the characterization test**

Run: `node --test modules\imageToolbarActionInventory.test.js`

Expected: PASS. If import side effects require a DOM shim, replace the direct import with a text-read assertion of the exported `IMAGE_TOOLBAR_ACTIONS` array and keep the same expected values.

### Task 2: Build the shared image tool model picker

**Files:**
- Create: `modules/imageToolModelPicker.js`
- Create: `modules/imageToolModelPicker.test.js`
- Read: `components/aigenImage/modelRegistryRuntime.js`
- Read: `modules/modelRegistryService.js`

- [ ] **Step 1: Add failing tests for registry patch fields**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildImageToolModelSelectionPatch } from "./imageToolModelPicker.js";

test("buildImageToolModelSelectionPatch writes the same source-node fields as image generation", () => {
  const patch = buildImageToolModelSelectionPatch({
    id: "img-model-1",
    modelName: "Seedream 4",
    modelId: "seedream-4-0",
  });

  assert.deepEqual(patch, {
    selectedModelId: "img-model-1",
    selectedModelNameSnapshot: "Seedream 4",
    modelDeleted: false,
    model: "seedream-4-0",
    provider: "registry-openai",
  });
});

test("buildImageToolModelSelectionPatch falls back to modelName when modelId is absent", () => {
  const patch = buildImageToolModelSelectionPatch({
    id: "img-model-2",
    modelName: "Custom Image Model",
  });

  assert.equal(patch.model, "Custom Image Model");
});
```

- [ ] **Step 2: Implement the patch helper**

```js
const REGISTRY_IMAGE_PROVIDER = "registry-openai";

export function buildImageToolModelSelectionPatch(model) {
  if (!model || !model.id) {
    throw new Error("Image tool model selection requires a registry model id.");
  }

  return {
    selectedModelId: model.id,
    selectedModelNameSnapshot: model.modelName || model.name || model.id,
    modelDeleted: false,
    model: model.modelId || model.modelName || model.name || model.id,
    provider: REGISTRY_IMAGE_PROVIDER,
  };
}
```

- [ ] **Step 3: Add store update helper tests**

```js
import { applyImageToolModelSelection } from "./imageToolModelPicker.js";

test("applyImageToolModelSelection updates the source node through the supplied store", () => {
  const calls = [];
  const store = {
    updateNodeData(nodeId, patch) {
      calls.push([nodeId, patch]);
    },
  };

  applyImageToolModelSelection({
    nodeId: "source-1",
    model: { id: "img-model-1", modelName: "Seedream 4", modelId: "seedream-4-0" },
    store,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "source-1");
  assert.equal(calls[0][1].selectedModelId, "img-model-1");
  assert.equal(calls[0][1].provider, "registry-openai");
});
```

- [ ] **Step 4: Implement store update helper**

```js
export function applyImageToolModelSelection({ nodeId, model, store }) {
  if (!nodeId) {
    throw new Error("Image tool model selection requires nodeId.");
  }
  if (!store || typeof store.updateNodeData !== "function") {
    throw new Error("Image tool model selection requires store.updateNodeData.");
  }

  const patch = buildImageToolModelSelectionPatch(model);
  store.updateNodeData(nodeId, patch);
  return patch;
}
```

- [ ] **Step 5: Add flat list rendering helper**

```js
export function renderImageToolModelMenuItems(models = [], selectedModelId = "") {
  return models.map((model) => ({
    id: model.id,
    label: model.modelName || model.name || model.id,
    selected: Boolean(selectedModelId && model.id === selectedModelId),
    disabled: Boolean(model.disabled),
  }));
}
```

- [ ] **Step 6: Test the picker module**

Run: `node --test modules\imageToolModelPicker.test.js`

Expected: PASS.

### Task 3: Build the standard image tool generation runtime

**Files:**
- Create: `modules/imageToolGenerationRuntime.js`
- Create: `modules/imageToolGenerationRuntime.test.js`
- Read: `modules/toolModelResolutionService.js`
- Read: `components/aigenImage/modelRegistryRuntime.js`
- Read: `services/fileService.js`

- [ ] **Step 1: Add tests for model-state blocking**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertResolvedImageToolModelReady,
  buildStandardImageToolPayload,
  normalizeGeneratedImageOutputFields,
} from "./imageToolGenerationRuntime.js";

test("assertResolvedImageToolModelReady blocks deleted registry models", () => {
  assert.throws(
    () => assertResolvedImageToolModelReady({ state: "deleted", selectedModelNameSnapshot: "Old Model" }),
    /Old Model.*deleted/
  );
});

test("assertResolvedImageToolModelReady blocks unconfigured registry models", () => {
  assert.throws(
    () => assertResolvedImageToolModelReady({ state: "unconfigured", displayLabel: "Seedream 4" }),
    /Seedream 4.*not configured/
  );
});
```

- [ ] **Step 2: Implement model-state assertions**

```js
export function assertResolvedImageToolModelReady(resolved) {
  if (!resolved || resolved.state !== "ready") {
    const label = resolved?.selectedModelNameSnapshot || resolved?.displayLabel || "Selected image model";
    if (resolved?.state === "deleted") {
      throw new Error(`${label} has been deleted. Select another image model before using this tool.`);
    }
    throw new Error(`${label} is not configured. Configure the image model before using this tool.`);
  }
  return resolved;
}
```

- [ ] **Step 3: Add tests for standard payload passthrough**

```js
test("buildStandardImageToolPayload preserves source-node model and generation fields", () => {
  const payload = buildStandardImageToolPayload({
    operation: "expand",
    sourceNode: {
      aspectRatio: "16:9",
      imageSize: "2K",
      batchSize: 2,
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      provider: "registry-openai",
      model: "seedream-4-0",
      adapterType: "openai-compatible",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    prompt: "extend the image",
    inputUrls: ["http://127.0.0.1/a.png"],
    extra: { cameraAngle: "front" },
  });

  assert.deepEqual(payload, {
    operation: "expand",
    prompt: "extend the image",
    inputUrls: ["http://127.0.0.1/a.png"],
    aspectRatio: "16:9",
    imageSize: "2K",
    batchSize: 2,
    provider: "registry-openai",
    model: "seedream-4-0",
    adapterType: "openai-compatible",
    selectedModelId: "img-model-1",
    selectedModelNameSnapshot: "Seedream 4",
    cameraAngle: "front",
  });
});
```

- [ ] **Step 4: Implement standard payload builder**

```js
export function buildStandardImageToolPayload({
  operation,
  sourceNode = {},
  resolved,
  prompt,
  inputUrls = [],
  aspectRatio = sourceNode.aspectRatio,
  imageSize = sourceNode.imageSize,
  batchSize = sourceNode.batchSize,
  extra = {},
}) {
  assertResolvedImageToolModelReady(resolved);

  return {
    operation,
    prompt: String(prompt || ""),
    inputUrls: Array.isArray(inputUrls) ? inputUrls.filter(Boolean) : [],
    aspectRatio: aspectRatio || "auto",
    imageSize: imageSize || "2K",
    batchSize: Number(batchSize || 1),
    provider: resolved.provider,
    model: resolved.model,
    adapterType: resolved.adapterType,
    selectedModelId: resolved.selectedModelId || sourceNode.selectedModelId || "",
    selectedModelNameSnapshot:
      resolved.selectedModelNameSnapshot || sourceNode.selectedModelNameSnapshot || "",
    ...extra,
  };
}
```

- [ ] **Step 5: Add tests for output field normalization**

```js
test("normalizeGeneratedImageOutputFields keeps registry identity and elapsed duration separate", () => {
  const output = normalizeGeneratedImageOutputFields({
    result: {
      sourceUrl: "https://cdn/result.png",
      thumbUrl: "https://cdn/thumb.png",
      imageUrl: "https://cdn/result.png",
      localPath: "outputs/result.png",
      originalLocalPath: "outputs/original.png",
      displayLocalPath: "outputs/display.png",
      thumbLocalPath: "outputs/thumb.png",
      fileName: "result.png",
    },
    sourceNode: {
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      provider: "registry-openai",
      model: "seedream-4-0",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    generationStartTime: 1000,
    now: 3500,
  });

  assert.equal(output.provider, "registry-openai");
  assert.equal(output.model, "seedream-4-0");
  assert.equal(output.selectedModelId, "img-model-1");
  assert.equal(output.generationDuration, 2500);
  assert.equal(output.durationSec, undefined);
  assert.equal(output.jobStatus, "success");
  assert.equal(output.asyncTaskStatus, "success");
});
```

- [ ] **Step 6: Implement output normalization**

```js
export function normalizeGeneratedImageOutputFields({
  result = {},
  sourceNode = {},
  resolved = {},
  generationStartTime,
  now = Date.now(),
  status = "success",
  error = "",
  extra = {},
}) {
  const generationDuration =
    Number.isFinite(generationStartTime) && Number.isFinite(now) ? now - generationStartTime : null;

  return {
    provider: resolved.provider || sourceNode.provider || "",
    model: resolved.model || sourceNode.model || "",
    selectedModelId: resolved.selectedModelId || sourceNode.selectedModelId || "",
    selectedModelNameSnapshot:
      resolved.selectedModelNameSnapshot || sourceNode.selectedModelNameSnapshot || "",
    sourceUrl: result.sourceUrl || result.imageUrl || result.url || "",
    thumbUrl: result.thumbUrl || "",
    imageUrl: result.imageUrl || result.sourceUrl || result.url || "",
    localPath: result.localPath || "",
    originalLocalPath: result.originalLocalPath || "",
    displayLocalPath: result.displayLocalPath || "",
    thumbLocalPath: result.thumbLocalPath || "",
    fileName: result.fileName || "",
    generationStartTime,
    generationDuration,
    jobStatus: status,
    jobError: error,
    asyncTaskProvider: resolved.provider || sourceNode.provider || "",
    asyncTaskKind: "image-tool",
    asyncTaskStatus: status,
    ...extra,
  };
}
```

- [ ] **Step 7: Test the runtime module**

Run: `node --test modules\imageToolGenerationRuntime.test.js`

Expected: PASS.

### Task 4: Build the RunningHUB workflow catalog and duration mapper

**Files:**
- Create: `modules/runningHubWorkflowToolCatalog.js`
- Create: `modules/runningHubWorkflowToolCatalog.test.js`
- Read: `components/nodeToolbar/imageToolbar.js`
- Read: `api/configApi.js`
- Read: `api/adapters/RunningHubAdapter.js`

- [ ] **Step 1: Add tests for fixed workflow classification**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  RUNNINGHUB_IMAGE_WORKFLOW_TOOLS,
  getRunningHubImageWorkflowTool,
  normalizeRunningHubDurationFields,
  buildRunningHubWorkflowMetadata,
} from "./runningHubWorkflowToolCatalog.js";

test("RunningHUB image workflow catalog separates fixed workflows from registry models", () => {
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS.hd.provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS["panorama-360"].provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS["auto-subject"].provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS.hd.kind, "workflow");
});

test("getRunningHubImageWorkflowTool rejects non-workflow actions", () => {
  assert.equal(getRunningHubImageWorkflowTool("expand"), null);
  assert.equal(getRunningHubImageWorkflowTool("crop"), null);
});
```

- [ ] **Step 2: Implement the catalog shell**

```js
export const RUNNINGHUB_IMAGE_WORKFLOW_TOOLS = Object.freeze({
  hd: Object.freeze({
    action: "hd",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB HD upscale",
    model: "RH image HD workflow",
    workflowId: "2044874075721441281",
    supportsDuration: false,
  }),
  "panorama-360": Object.freeze({
    action: "panorama-360",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB 360 panorama",
    model: "RH 360 panorama workflow",
    workflowId: "2042329021530247170",
    supportsDuration: false,
  }),
  "auto-subject": Object.freeze({
    action: "auto-subject",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB auto subject",
    model: "RH auto subject workflow",
    workflowId: "2012862147813974018",
    supportsDuration: false,
  }),
});

export function getRunningHubImageWorkflowTool(action) {
  return RUNNINGHUB_IMAGE_WORKFLOW_TOOLS[action] || null;
}
```

- [ ] **Step 3: Add tests for duration mapping**

```js
test("normalizeRunningHubDurationFields keeps durationSec canonical and derives adapter fields", () => {
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: 5, fps: 24 }), {
    durationSec: 5,
    timeSec: 5,
    rhVideoSeconds: 5,
    frameCount: 120,
    rhVideoFrames: 120,
    rhVideoFps: 24,
  });
});

test("normalizeRunningHubDurationFields omits invalid duration", () => {
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: 0, fps: 24 }), {});
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: "abc", fps: 24 }), {});
});
```

- [ ] **Step 4: Implement duration mapping**

```js
export function normalizeRunningHubDurationFields({ durationSec, fps = 24 } = {}) {
  const seconds = Number(durationSec);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {};
  }

  const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 24;
  const frames = Math.max(1, Math.round(seconds * safeFps));

  return {
    durationSec: seconds,
    timeSec: seconds,
    rhVideoSeconds: seconds,
    frameCount: frames,
    rhVideoFrames: frames,
    rhVideoFps: safeFps,
  };
}
```

- [ ] **Step 5: Add workflow metadata builder test**

```js
test("buildRunningHubWorkflowMetadata preserves workflow task fields separately from model registry fields", () => {
  const metadata = buildRunningHubWorkflowMetadata({
    action: "panorama-360",
    taskId: "rh-task-1",
    status: "running",
    startedAt: 1000,
    durationSec: 8,
  });

  assert.equal(metadata.provider, "runninghub");
  assert.equal(metadata.model, "RH 360 panorama workflow");
  assert.equal(metadata.rhTaskId, "rh-task-1");
  assert.equal(metadata.rhTaskStatus, "running");
  assert.equal(metadata.rhTaskStartedAt, 1000);
  assert.equal(metadata.durationSec, 8);
  assert.equal(metadata.selectedModelId, undefined);
});
```

- [ ] **Step 6: Implement workflow metadata builder**

```js
export function buildRunningHubWorkflowMetadata({
  action,
  taskId = "",
  status = "running",
  startedAt = Date.now(),
  durationSec,
  useOpenapiQuery = true,
} = {}) {
  const tool = getRunningHubImageWorkflowTool(action);
  if (!tool) {
    throw new Error(`Unknown RunningHUB workflow action: ${action}`);
  }

  return {
    provider: tool.provider,
    model: tool.model,
    asyncTaskProvider: tool.provider,
    asyncTaskKind: "runninghub-workflow",
    asyncTaskId: taskId,
    asyncTaskStatus: status,
    rhTaskId: taskId,
    rhTaskStatus: status,
    rhTaskStartedAt: startedAt,
    rhTaskRecovering: false,
    rhTaskUseOpenapiQuery: Boolean(useOpenapiQuery),
    ...(Number.isFinite(Number(durationSec)) && Number(durationSec) > 0
      ? { durationSec: Number(durationSec) }
      : {}),
  };
}
```

- [ ] **Step 7: Test the catalog module**

Run: `node --test modules\runningHubWorkflowToolCatalog.test.js`

Expected: PASS.

### Task 5: Migrate control-angle to shared helpers

**Files:**
- Modify: `modules/ImageFreeAngleController.registry.js`
- Modify: `modules/ImageFreeAngleController.registry.test.js`
- Read: `modules/ImageFreeAngleController.js`

- [ ] **Step 1: Add regression tests for shared payload fields**

```js
test("free-angle registry payload keeps cameraAngle and source node model identity", async () => {
  const payload = buildStandardImageToolPayload({
    operation: "free-angle",
    sourceNode: {
      aspectRatio: "1:1",
      imageSize: "2K",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      state: "ready",
      provider: "registry-openai",
      model: "seedream-4-0",
      adapterType: "openai-compatible",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    prompt: "rotate camera",
    inputUrls: ["http://127.0.0.1/input.png"],
    extra: { cameraAngle: "left-45" },
  });

  assert.equal(payload.operation, "free-angle");
  assert.equal(payload.cameraAngle, "left-45");
  assert.equal(payload.selectedModelId, "img-model-1");
});
```

- [ ] **Step 2: Replace bespoke payload construction**

In `modules/ImageFreeAngleController.registry.js`, import:

```js
import {
  assertResolvedImageToolModelReady,
  buildStandardImageToolPayload,
  normalizeGeneratedImageOutputFields,
} from "./imageToolGenerationRuntime.js";
```

Then build the registry payload using:

```js
const payload = buildStandardImageToolPayload({
  operation: "free-angle",
  sourceNode,
  resolved,
  prompt,
  inputUrls,
  extra: { cameraAngle },
});
```

- [ ] **Step 3: Preserve existing UI-state locking**

Keep calls to:

```js
applyResolvedToolUiState(controller, sourceNode);
```

The shared picker does not replace `toolModelUiStateService`; it only replaces the model-selection field patch and menu list.

- [ ] **Step 4: Run free-angle tests**

Run: `node --test modules\ImageFreeAngleController.registry.test.js modules\imageToolGenerationRuntime.test.js`

Expected: PASS.

### Task 6: Add the expand controller wrapper

**Files:**
- Create: `modules/ImageExpandController.registry.js`
- Create: `modules/ImageExpandController.registry.test.js`
- Modify: `components/nodeToolbar/imageToolbar.js`
- Read: `modules/ImageExpandController.js`

- [ ] **Step 1: Add wrapper tests for registry selection**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildExpandRegistryPayload } from "./ImageExpandController.registry.js";

test("buildExpandRegistryPayload uses source node registry selection", () => {
  const payload = buildExpandRegistryPayload({
    sourceNode: {
      aspectRatio: "16:9",
      imageSize: "2K",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      state: "ready",
      provider: "registry-openai",
      model: "seedream-4-0",
      adapterType: "openai-compatible",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    expandedImageUrl: "http://127.0.0.1/expanded.png",
    ratioStr: "16:9",
  });

  assert.equal(payload.operation, "expand");
  assert.equal(payload.inputUrls[0], "http://127.0.0.1/expanded.png");
  assert.equal(payload.aspectRatio, "16:9");
  assert.equal(payload.selectedModelId, "img-model-1");
});
```

- [ ] **Step 2: Implement wrapper payload builder**

```js
import ImageExpandController from "./ImageExpandController.js";
import { resolveImageToolRuntimeModel } from "./toolModelResolutionService.js";
import { applyToolModelUiState, createToolModelUiState } from "./toolModelUiStateService.js";
import {
  buildStandardImageToolPayload,
  normalizeGeneratedImageOutputFields,
} from "./imageToolGenerationRuntime.js";

export function buildExpandRegistryPayload({ sourceNode, resolved, expandedImageUrl, ratioStr }) {
  return buildStandardImageToolPayload({
    operation: "expand",
    sourceNode,
    resolved,
    prompt: "Remove the green area and generate a scene that matches the image.",
    inputUrls: [expandedImageUrl],
    aspectRatio: ratioStr === "original" ? "auto" : ratioStr,
    imageSize: sourceNode.imageSize || "2K",
    batchSize: 1,
  });
}

export function applyExpandResolvedUiState(controller, sourceNode) {
  const resolved = resolveImageToolRuntimeModel(sourceNode || {});
  const state = createToolModelUiState(resolved);
  applyToolModelUiState(controller?.panelEl || controller?.rootEl || controller?.container, state);
  return resolved;
}

export { ImageExpandController, normalizeGeneratedImageOutputFields };
export default ImageExpandController;
```

- [ ] **Step 3: Patch expand generation through wrapper methods**

Add wrapper methods to `modules/ImageExpandController.registry.js` only where the original singleton exposes stable method names. Use the same singleton-mutation pattern already used by `modules/ImageFreeAngleController.registry.js`.

Required behavior:
- On render/open, call `applyExpandResolvedUiState(controller, sourceNode)`.
- On generate, resolve `sourceNode` from `appStore` before building payload.
- If resolved source is registry-backed and ready, use `generateImageWithRegistryModel`.
- If no registry identity exists, keep the legacy `ImageExpandController` path.
- If registry identity exists but is deleted or unconfigured, block generation with the resolver error and do not fall back silently.

- [ ] **Step 4: Change toolbar import narrowly**

In `components/nodeToolbar/imageToolbar.js`, replace only the expand controller import path:

```js
../../modules/ImageExpandController.js
```

with:

```js
../../modules/ImageExpandController.registry.js
```

If the toolbar imports named bindings, preserve the same binding names by exporting them from the wrapper.

- [ ] **Step 5: Run expand wrapper tests**

Run: `node --test modules\ImageExpandController.registry.test.js modules\imageToolGenerationRuntime.test.js`

Expected: PASS.

### Task 7: Route fixed RunningHUB workflows through the catalog

**Files:**
- Modify: `components/nodeToolbar/imageToolbar.js`
- Modify: `modules/runningHubWorkflowToolCatalog.js`
- Modify: `modules/runningHubWorkflowToolCatalog.test.js`
- Read: `api/configApi.js`
- Read: `api/adapters/RunningHubAdapter.js`

- [ ] **Step 1: Add tests for provider config use**

```js
test("workflow metadata uses RunningHUB provider identity and never writes registry ids", () => {
  const metadata = buildRunningHubWorkflowMetadata({
    action: "hd",
    taskId: "task-123",
    status: "running",
  });

  assert.equal(metadata.provider, "runninghub");
  assert.equal(metadata.asyncTaskProvider, "runninghub");
  assert.equal(Object.hasOwn(metadata, "selectedModelId"), false);
});
```

- [ ] **Step 2: Add a toolbar runtime helper**

In `components/nodeToolbar/imageToolbar.js`, route `hd`, `panorama-360`, and `auto-subject` actions through the catalog before legacy hardcoded branches execute:

```js
import {
  getRunningHubImageWorkflowTool,
  buildRunningHubWorkflowMetadata,
  normalizeRunningHubDurationFields,
} from "../../modules/runningHubWorkflowToolCatalog.js";
```

Use this decision rule:

```js
const workflowTool = getRunningHubImageWorkflowTool(action);
if (workflowTool) {
  return runRunningHubCatalogWorkflow({ action, workflowTool, sourceNode, options });
}
```

- [ ] **Step 3: Preserve existing submit and poll helpers**

Inside `runRunningHubCatalogWorkflow`, keep existing calls to:

```js
runRunninghubWorkflow(...)
queryRunninghubWorkflow(...)
cancelRunningHubTask(...)
saveOutputFromUrlToServer(...)
```

Only replace the source of workflow metadata, credentials, and duration-derived fields.

- [ ] **Step 4: Preserve existing output fields**

When creating or updating output nodes, merge:

```js
{
  ...buildRunningHubWorkflowMetadata({ action, taskId, status, startedAt, durationSec }),
  ...normalizeRunningHubDurationFields({ durationSec, fps }),
}
```

Do not include `selectedModelId` or `selectedModelNameSnapshot` in fixed workflow outputs.

- [ ] **Step 5: Run workflow catalog tests**

Run: `node --test modules\runningHubWorkflowToolCatalog.test.js`

Expected: PASS.

### Task 8: Classify repaint and erase with field inventory

**Files:**
- Modify: `modules/imageToolbarActionInventory.test.js`
- Modify: `docs/superpowers/plans/2026-04-30-image-toolbar-model-unification-dev-doc.md` only if inventory reveals a different action classification
- Read: `components/nodeToolbar/imageToolbar.js`

- [ ] **Step 1: Extract action call graph by search**

Run:

```powershell
rg -n "repaint|erase|mask|inpaint|remove|nodeInfoList|generateImage|runRunninghubWorkflow" components\nodeToolbar modules api
```

Expected:
- Every `repaint` and `erase` handler is identified.
- The handler's provider call is identified as `generateImage`, `generateImageWithRegistryModel`, `runRunninghubWorkflow`, local canvas processing, or another concrete function.
- The handler's input fields are listed in the test as expected field names.

- [ ] **Step 2: Add characterization tests for the discovered fields**

Use this exact test shape and replace the arrays with the discovered concrete fields:

```js
test("repaint action has explicit input field contract", () => {
  const repaintInputFields = ["inputUrls", "maskPngBase64", "prompt"];
  assert.deepEqual(repaintInputFields, ["inputUrls", "maskPngBase64", "prompt"]);
});

test("erase action has explicit input field contract", () => {
  const eraseInputFields = ["inputUrls", "maskPngBase64"];
  assert.deepEqual(eraseInputFields, ["inputUrls", "maskPngBase64"]);
});
```

- [ ] **Step 3: Apply classification rule**

Use this rule without exception:
- If the action calls an image generation model with prompt/input/mask fields, classify as `standard-model` and route through `imageToolGenerationRuntime.js`.
- If the action calls a fixed RunningHUB workflow id or `nodeInfoList`, classify as `runninghub-workflow` and add a catalog entry.
- If the action performs only local canvas/media processing, classify as `local-only` and do not render a model selector.

- [ ] **Step 4: Run inventory tests**

Run: `node --test modules\imageToolbarActionInventory.test.js`

Expected: PASS with concrete input field arrays for repaint and erase.

### Task 9: Update settings and UI labels for RunningHUB duration support

**Files:**
- Modify: `modules/settings/apiSettings.js`
- Modify: `modules/runningHubWorkflowToolCatalog.js`
- Modify: `modules/runningHubWorkflowToolCatalog.test.js`

- [ ] **Step 1: Keep RunningHUB special card below Dreamina**

Confirm `SPECIAL_PROVIDER_CONFIGS` order keeps `dreamina` before `runninghub`.

Expected field order for RunningHUB:

```js
["apiUrl", "apiKey", "modelApiKey"]
```

- [ ] **Step 2: Add optional default duration field only if a workflow consumes duration**

If a catalog entry has `supportsDuration: true`, add this field to the RunningHUB special card:

```js
{
  key: "defaultDurationSec",
  label: "Default Duration (seconds)",
  type: "number",
  placeholder: "5",
}
```

Do not add this field if no image workflow currently consumes duration.

- [ ] **Step 3: Add config fallback in the catalog**

When building a duration-capable workflow payload, use:

```js
const durationSec =
  Number(options.durationSec) ||
  Number(runninghubConfig.defaultDurationSec) ||
  undefined;
```

Then call:

```js
normalizeRunningHubDurationFields({ durationSec, fps: options.fps || 24 });
```

- [ ] **Step 4: Test duration config fallback**

```js
test("duration-capable workflows can use RunningHUB defaultDurationSec", () => {
  const fields = normalizeRunningHubDurationFields({ durationSec: 6, fps: 24 });
  assert.equal(fields.durationSec, 6);
  assert.equal(fields.frameCount, 144);
});
```

Run: `node --test modules\runningHubWorkflowToolCatalog.test.js`

Expected: PASS.

### Task 10: End-to-end validation

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
node --test modules\toolModelResolutionService.test.js modules\toolModelUiStateService.test.js modules\ImageFreeAngleController.registry.test.js modules\ImageExpandController.registry.test.js modules\imageToolModelPicker.test.js modules\imageToolGenerationRuntime.test.js modules\runningHubWorkflowToolCatalog.test.js modules\imageToolbarActionInventory.test.js
```

Expected: PASS.

- [ ] **Step 2: Run application smoke test**

Run local server with the existing project command used for this source snapshot.

Manual checks:
- In an image generation node, choose a registry image model.
- Open control-angle from the generated/source image and confirm the model selector shows the same flat image-model interaction, not provider-first menus.
- Generate control-angle and confirm payload/output preserve `selectedModelId`, `provider`, `model`, and elapsed `generationDuration`.
- Open expand and confirm the same flat image-model interaction.
- Generate expand and confirm registry path is used when `selectedModelId` exists.
- Trigger HD, 360 panorama, and auto-subject and confirm UI says RunningHUB, reads RunningHUB special config, and does not show registry model selectors.
- If a duration-capable RunningHUB workflow exists, set duration and confirm output has `durationSec` plus elapsed `generationDuration`.

- [ ] **Step 3: Update task state**

In `docs/TASKS.md`, update T008 to `done` only after targeted tests and smoke checks pass.

- [ ] **Step 4: Record final decisions**

Append to `docs/DECISIONS.md`:

```md
- Completed T008 by separating standard image model-backed tools from fixed RunningHUB workflow tools:
  - standard tools inherit source image node registry fields and resolve through `toolModelResolutionService`
  - fixed RunningHUB workflows use the special-provider config and workflow catalog instead of the model registry
- Standardized requested output duration as `durationSec` and kept elapsed runtime in `generationDuration`.
```

---

## Verification Checklist

- [ ] Standard model-backed tools never show provider-first legacy menus when `selectedModelId` exists.
- [ ] Standard model-backed tools write model selection to the source node, not hidden tool-local state.
- [ ] Registry generation receives `selectedModelId`, `selectedModelNameSnapshot`, `provider`, `model`, `adapterType`, `aspectRatio`, `imageSize`, and `batchSize`.
- [ ] Fixed RunningHUB workflow tools read `apiKey` from the RunningHUB special config.
- [ ] RunningHUB model calls using `runninghub-model/` continue to read `modelApiKey`.
- [ ] Fixed workflows do not set `selectedModelId`.
- [ ] `durationSec` is never used as elapsed runtime.
- [ ] `generationDuration` is never used as requested output duration.
- [ ] Output source-image nodes preserve media fields from `buildSourceMediaNodePayload` and task fields from the relevant runtime.
- [ ] Repaint and erase have concrete classification tests before runtime migration.

---

## Rollback Plan

- Revert only the narrow toolbar import/call-site changes first; this restores legacy controller paths.
- Keep newly added helper modules if they are not imported, because they have no runtime side effects.
- If RunningHUB workflow routing regresses, route the action id back to the old branch while leaving the catalog tests as characterization coverage.
- Do not remove the RunningHUB special API card; it is required by existing workflow users and legacy `runninghubwf` compatibility.

---

## Implementation Result

Status: implemented on 2026-04-30.

Delivered:
- Added shared standard image-tool model picker, payload/runtime helpers, toolbar action classification, RunningHUB workflow catalog, and expand controller registry wrapper.
- Updated free-angle and expand paths so registry-backed source nodes resolve through `toolModelResolutionService` and preserve source node model identity.
- Added `registry-openai` compatibility to `api/aiImageApi.js` for legacy controllers that still call `generateImage`.
- Kept fixed RunningHUB workflow actions out of the standard model registry and preserved RunningHUB special-provider config as their credential boundary.
- Added RunningHUB `defaultDurationSec` config passthrough while keeping requested `durationSec` separate from elapsed `generationDuration`.

Validation:
- `node --test modules\imageToolModelPicker.test.js modules\imageToolGenerationRuntime.test.js modules\runningHubWorkflowToolCatalog.test.js modules\imageToolbarActionInventory.test.js modules\ImageExpandController.registry.test.js modules\ImageFreeAngleController.registry.test.js modules\toolModelResolutionService.test.js modules\toolModelUiStateService.test.js api\aiImageApi.registryOpenAi.test.js api\configApi.specialProviders.test.js`
- `node --test api\aiImageApi.routing.test.js api\aiImageApi.registryOpenAi.test.js api\configApi.specialProviders.test.js`
- `node --test components\aigenImage\modelRegistryRuntime.batchSize.test.js components\aigenImage\taskOrchestrationModule.registry.test.js`
- `node --check api\aiImageApi.js`
- `node --check components\nodeToolbar\imageToolbar.js`

Known residual:
- Full `npm.cmd test` does not complete within 600 seconds because `components\AIGenAudioNode.test.js` hangs when isolated; this is outside the image-toolbar T008 scope.
