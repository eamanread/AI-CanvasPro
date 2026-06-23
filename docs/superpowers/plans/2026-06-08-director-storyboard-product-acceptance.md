# Director / Storyboard Product Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish product-level acceptance for 3D Director character placement, 3D scene image fusion, Storyboard Script local text-model selection, and Storyboard Script left/right side-plus guidance.

**Architecture:** Keep upstream 3D and Storyboard identities intact, then connect missing local delivery pieces: static GLTF assets, panorama input state/rendering, local text model registry semantics, and real canvas DOM side-plus behavior. Use TDD for each product gap and finish with browser smoke evidence.

**Tech Stack:** Browser ES modules, Node test runner via `D:\Aic\node.exe --test`, Three.js GLTF assets, local model registry modules, Playwright/system Chrome or in-app Browser when available.

---

## Current Evidence

- Project root: `D:\Aic\huanying-source-windows-20260430-122116`.
- Upstream root: `D:\Aic\huanying-source-windows-20260430-122116\output\upstream\AI-CanvasPro`.
- CodeGraph is currently locked for this project; do not claim CodeGraph verification until `codegraph status` succeeds.
- Existing focused migration tests pass: `34 pass / 0 fail`.
- Existing assistant/canvas regression tests pass: `17 pass / 0 fail`.
- Browser smoke recorded missing local character assets: `assets/characters/quaternius/universal-base/Superhero_Male_FullBody.gltf` and `Superhero_Female_FullBody.gltf` returned 404.
- Local text generation model registry already exists in `components/aigenText/modelRegistryRuntime.js` and `modules/modelRegistryService.js`.
- `EdgeController` data-layer side-plus inputs already include `storyboard-script`, but DOM/browser hover needs product verification.

---

## File Map

- Copy static assets from `output/upstream/AI-CanvasPro/assets/characters/quaternius/universal-base/*` to `assets/characters/quaternius/universal-base/*`.
- Add `panoramaCharacterAssets.test.js`.
- Modify `modules/panoramaSceneNode/sceneNode.js` for normalized scene-image state.
- Modify `modules/panoramaSceneNode/sceneNodeActions.js` for apply/remove scene image actions.
- Modify `modules/panoramaSceneNode/scene3dBridge.js` to consume `environmentImage` / `referencePlane`.
- Modify `components/panoramaScene/PanoramaSceneToolbar.js` and `styles/panorama-scene-node.css` for scene-image UI state.
- Add `panoramaSceneImageFusion.test.js`.
- Modify `modules/modelRegistryFilters.js` to separate selectable model filtering from execution-ready filtering.
- Modify `components/aigenText/modelRegistryRuntime.js` to expose selectable text model helpers.
- Modify `components/StoryboardScriptNode.js` to use local text model registry.
- Modify `src/core/storyboardScriptFactory.js` to preserve Storyboard Script text model state fields.
- Add `storyboardScriptTextModelRegistry.test.js`.
- Modify `modules/interaction/EdgeController.js`, `src/core/renderer.js`, and `styles/storyboard-script-node.css` for both side-plus handles.
- Add `storyboardScriptSidePlusProduct.test.js`.
- Add `tools/smoke/director-storyboard-product-smoke.mjs`.
- Add final result doc after implementation: `docs/reviews/2026-06-08-director-storyboard-product-acceptance-result.md`.

---

## Task 1: Restore 3D Character Static Assets

**Files:**
- Copy: `output/upstream/AI-CanvasPro/assets/characters/quaternius/universal-base/*`
- Create: `assets/characters/quaternius/universal-base/*`
- Create: `panoramaCharacterAssets.test.js`

- [ ] **Step 1: Write the failing test**

Create `panoramaCharacterAssets.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = dirname(fileURLToPath(import.meta.url));
const assetRoot = join(rootPath, "assets/characters/quaternius/universal-base");

const requiredFiles = [
  "SOURCE.md",
  "Superhero_Male_FullBody.gltf",
  "Superhero_Male_FullBody.bin",
  "Superhero_Female_FullBody.gltf",
  "Superhero_Female_FullBody.bin",
  "T_Eye_Brown.png",
  "T_Eye_Normal_png.png",
  "T_Hair_1_BaseColor.png",
  "T_Hair_1_Normal_png.png",
  "T_Hair_2_BaseColor.png",
  "T_Hair_2_Normal.png",
  "T_Superhero_Female_Dark_BaseColor.png",
  "T_Superhero_Female_Normal.png",
  "T_Superhero_Female_Roughness.png",
  "T_Superhero_Male_Dark.png",
  "T_Superhero_Male_Normal.png",
  "T_Superhero_Male_Roughness.png"
];

test("Quaternius character asset bundle exists locally", () => {
  for (const fileName of requiredFiles) {
    assert.equal(existsSync(join(assetRoot, fileName)), true, `${fileName} should exist`);
  }
});

test("character GLTF files reference only files present in the copied bundle", () => {
  for (const fileName of ["Superhero_Male_FullBody.gltf", "Superhero_Female_FullBody.gltf"]) {
    const gltf = JSON.parse(readFileSync(join(assetRoot, fileName), "utf8"));
    const referencedUris = [
      ...(gltf.buffers || []).map((item) => item.uri),
      ...(gltf.images || []).map((item) => item.uri)
    ].filter(Boolean);
    assert.ok(referencedUris.length > 0, `${fileName} should reference binary/texture files`);
    for (const uri of referencedUris) {
      assert.equal(existsSync(join(assetRoot, uri)), true, `${fileName} references missing ${uri}`);
    }
  }
});

test("character model registry points to local Quaternius asset paths", () => {
  const source = readFileSync(join(rootPath, "modules/panoramaSceneNode/characterModelRegistry.js"), "utf8");
  assert.match(source, /assets\/characters\/quaternius\/universal-base\/Superhero_Male_FullBody\.gltf/);
  assert.match(source, /assets\/characters\/quaternius\/universal-base\/Superhero_Female_FullBody\.gltf/);
});
```

- [ ] **Step 2: Verify the test fails before asset copy**

Run:

```powershell
& 'D:\Aic\node.exe' --test panoramaCharacterAssets.test.js
```

Expected: FAIL because `assets\characters\quaternius\universal-base` is missing.

- [ ] **Step 3: Copy the upstream asset bundle**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'assets\characters\quaternius\universal-base' | Out-Null
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\assets\characters\quaternius\universal-base\*' -Destination 'assets\characters\quaternius\universal-base' -Force
```

- [ ] **Step 4: Verify the asset test passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test panoramaCharacterAssets.test.js
```

Expected: PASS, `fail 0`.

- [ ] **Step 5: Verify HTTP serving**

With local server on `8777`, run:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8777/assets/characters/quaternius/universal-base/Superhero_Male_FullBody.gltf'
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8777/assets/characters/quaternius/universal-base/Superhero_Female_FullBody.gltf'
```

Expected: both return HTTP `200`.

---

## Task 2: Implement 3D Scene Image Fusion State and UI

**Files:**
- Modify: `modules/panoramaSceneNode/sceneNode.js`
- Modify: `modules/panoramaSceneNode/sceneNodeActions.js`
- Modify: `modules/panoramaSceneNode/scene3dBridge.js`
- Modify: `components/panoramaScene/PanoramaSceneToolbar.js`
- Modify: `styles/panorama-scene-node.css`
- Create: `panoramaSceneImageFusion.test.js`

- [ ] **Step 1: Write failing tests**

Create `panoramaSceneImageFusion.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultPanoramaSceneState,
  normalizePanoramaSceneState
} from "./modules/panoramaSceneNode/sceneNode.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("default 3D director state includes empty scene image fusion fields", () => {
  const state = createDefaultPanoramaSceneState();
  assert.deepEqual(state.inputImage, {
    mode: "none",
    localPath: "",
    imageUrl: "",
    fileName: "",
    sourceSignature: null,
    width: 0,
    height: 0,
    aspectRatio: 0,
    mimeType: "",
    appliedAt: 0
  });
  assert.deepEqual(state.environmentImage, {
    enabled: false,
    imageUrl: "",
    opacity: 1
  });
  assert.deepEqual(state.referencePlane, {
    enabled: false,
    imageUrl: "",
    fit: "contain",
    opacity: 1,
    depth: -8
  });
});

test("2:1 image normalizes as panorama environment", () => {
  const state = normalizePanoramaSceneState({
    inputImage: {
      localPath: "outputs/panorama.png",
      imageUrl: "/outputs/panorama.png",
      fileName: "panorama.png",
      width: 2048,
      height: 1024,
      mimeType: "image/png",
      appliedAt: 100
    }
  });
  assert.equal(state.inputImage.mode, "panorama");
  assert.equal(state.inputImage.aspectRatio, 2);
  assert.equal(state.environmentImage.enabled, true);
  assert.equal(state.environmentImage.imageUrl, "/outputs/panorama.png");
  assert.equal(state.referencePlane.enabled, false);
});

test("non-2:1 image normalizes as reference plane", () => {
  const state = normalizePanoramaSceneState({
    inputImage: {
      localPath: "outputs/room.png",
      imageUrl: "/outputs/room.png",
      fileName: "room.png",
      width: 1200,
      height: 900,
      mimeType: "image/png",
      appliedAt: 100
    }
  });
  assert.equal(state.inputImage.mode, "reference");
  assert.equal(state.environmentImage.enabled, false);
  assert.equal(state.referencePlane.enabled, true);
  assert.equal(state.referencePlane.imageUrl, "/outputs/room.png");
});

test("scene actions write image fusion fields", () => {
  const actions = read("modules/panoramaSceneNode/sceneNodeActions.js");
  assert.match(actions, /ensurePersistedPanoramaInputPng/);
  assert.match(actions, /uploadPanoramaSceneImage/);
  assert.match(actions, /removePanoramaSceneImage/);
  assert.match(actions, /inputImage/);
});

test("runtime bridge consumes image fusion fields", () => {
  const bridge = read("modules/panoramaSceneNode/scene3dBridge.js");
  assert.match(bridge, /environmentImage|inputImage|referencePlane/);
});

test("toolbar exposes upload replace and remove affordances", () => {
  const toolbar = read("components/panoramaScene/PanoramaSceneToolbar.js");
  assert.match(toolbar, /上传全景图|上传场景图|场景图/);
  assert.match(toolbar, /替换|移除|删除/);
});
```

- [ ] **Step 2: Verify tests fail before implementation**

Run:

```powershell
& 'D:\Aic\node.exe' --test panoramaSceneImageFusion.test.js
```

Expected: FAIL because normalized fields and remove action are absent or incomplete.

- [ ] **Step 3: Add normalized scene image fields**

Modify `modules/panoramaSceneNode/sceneNode.js`. Add helpers near state normalization:

```js
const EQUIRECTANGULAR_RATIO = 2;
const EQUIRECTANGULAR_RATIO_TOLERANCE = 0.02;

function normalizeSceneImageNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function isNearEquirectangularRatio(width, height) {
  const normalizedWidth = normalizeSceneImageNumber(width);
  const normalizedHeight = normalizeSceneImageNumber(height);
  if (!normalizedWidth || !normalizedHeight) return false;
  return Math.abs(normalizedWidth / normalizedHeight - EQUIRECTANGULAR_RATIO) <= EQUIRECTANGULAR_RATIO_TOLERANCE;
}

function normalizePanoramaInputImage(inputImage = {}) {
  const source = inputImage && typeof inputImage === "object" && !Array.isArray(inputImage) ? inputImage : {};
  const localPath = String(source.localPath || "").trim();
  const imageUrl = String(source.imageUrl || source.url || "").trim();
  const fileName = String(source.fileName || source.filename || "").trim();
  const width = normalizeSceneImageNumber(source.width || source.naturalWidth || source.imageWidth);
  const height = normalizeSceneImageNumber(source.height || source.naturalHeight || source.imageHeight);
  const aspectRatio = width > 0 && height > 0 ? Number((width / height).toFixed(6)) : 0;
  const hasImage = Boolean(localPath || imageUrl);
  const mode = hasImage ? (isNearEquirectangularRatio(width, height) ? "panorama" : "reference") : "none";
  return {
    mode,
    localPath,
    imageUrl,
    fileName,
    sourceSignature: source.sourceSignature || null,
    width,
    height,
    aspectRatio,
    mimeType: String(source.mimeType || "").trim(),
    appliedAt: Number.isFinite(Number(source.appliedAt)) ? Number(source.appliedAt) : 0
  };
}

function buildEnvironmentImage(inputImage) {
  return {
    enabled: inputImage.mode === "panorama" && Boolean(inputImage.imageUrl),
    imageUrl: inputImage.mode === "panorama" ? inputImage.imageUrl : "",
    opacity: 1
  };
}

function buildReferencePlane(inputImage) {
  return {
    enabled: inputImage.mode === "reference" && Boolean(inputImage.imageUrl),
    imageUrl: inputImage.mode === "reference" ? inputImage.imageUrl : "",
    fit: "contain",
    opacity: 1,
    depth: -8
  };
}
```

Ensure `createDefaultPanoramaSceneState()` and `normalizePanoramaSceneState()` include:

```js
const inputImage = normalizePanoramaInputImage(source.inputImage);
state.inputImage = inputImage;
state.environmentImage = buildEnvironmentImage(inputImage);
state.referencePlane = buildReferencePlane(inputImage);
```

- [ ] **Step 4: Update upload action**

Modify `modules/panoramaSceneNode/sceneNodeActions.js` inside `uploadPanoramaSceneImage`. After `ensurePersistedPanoramaInputPng`, write:

```js
const inputImage = {
  localPath: persisted.localPath,
  imageUrl: persisted.imageUrl,
  fileName: persisted.fileName,
  sourceSignature: persisted.sourceSignature || null,
  width: naturalSize?.width || persisted.width || 0,
  height: naturalSize?.height || persisted.height || 0,
  mimeType: "image/png",
  appliedAt: Date.now()
};

writeSceneState(storeInstance, nodeId, (current) => ({
  ...current,
  inputImage
}));
```

If the file already uses obfuscated aliases for `storeInstance`, `nodeId`, or `naturalSize`, adapt the same patch shape without duplicating state.

- [ ] **Step 5: Add remove action**

Export from `modules/panoramaSceneNode/sceneNodeActions.js`:

```js
export function removePanoramaSceneImage(nodeId, storeInstance = appStore) {
  return writeSceneState(storeInstance, nodeId, (current) => ({
    ...current,
    inputImage: {
      mode: "none",
      localPath: "",
      imageUrl: "",
      fileName: "",
      sourceSignature: null,
      width: 0,
      height: 0,
      aspectRatio: 0,
      mimeType: "",
      appliedAt: 0
    }
  }));
}
```

Use the same default store variable used by neighboring exported actions.

- [ ] **Step 6: Wire toolbar UI**

Modify `components/panoramaScene/PanoramaSceneToolbar.js` to include stable selectors:

```html
<button class="panorama-toolbar-btn act-upload-scene-image" type="button" data-action="upload-scene-image">上传场景图</button>
<div class="panorama-scene-image-status" data-scene-image-status="empty">
  <span class="panorama-scene-image-status__label">未应用场景图</span>
  <button class="panorama-scene-image-status__replace" type="button" data-action="upload-scene-image">替换</button>
  <button class="panorama-scene-image-status__remove" type="button" data-action="remove-scene-image">移除</button>
</div>
```

- [ ] **Step 7: Wire runtime render fields**

Modify `modules/panoramaSceneNode/scene3dBridge.js` so render state reads:

```js
const environmentImage = sceneState.environmentImage || {};
const referencePlane = sceneState.referencePlane || {};
```

Required behavior:

- Use `environmentImage.imageUrl` as panorama/background texture when `environmentImage.enabled === true`.
- Use `referencePlane.imageUrl` as a 3D reference/backplate plane when `referencePlane.enabled === true`.
- Clear old texture/plane when disabled or URL changes.
- Keep gizmo and character rendering above/independent from the reference image.

- [ ] **Step 8: Verify tests pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test panoramaSceneImageFusion.test.js
```

Expected: PASS, `fail 0`.

---

## Task 3: Reuse Local Text Model Registry in Storyboard Script

**Files:**
- Modify: `modules/modelRegistryFilters.js`
- Modify: `components/aigenText/modelRegistryRuntime.js`
- Modify: `components/StoryboardScriptNode.js`
- Modify: `src/core/storyboardScriptFactory.js`
- Create: `storyboardScriptTextModelRegistry.test.js`

- [ ] **Step 1: Write failing registry tests**

Create `storyboardScriptTextModelRegistry.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterSelectableTextModels,
  filterConfiguredApiModels
} from "./modules/modelRegistryFilters.js";
import {
  buildTextModelSelectionPatch,
  buildRegistryTextPayload
} from "./components/aigenText/modelRegistryRuntime.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("selectable text models include modelId even when not test-passed", () => {
  const models = [
    { id: "mdl_text_unverified", nodeType: "text", modelName: "Unverified", modelId: "unverified-model", apiKey: "", baseUrl: "", status: "unverified", disabled: false },
    { id: "mdl_text_deleted", nodeType: "text", modelName: "Deleted", modelId: "deleted-model", apiKey: "key", baseUrl: "https://example.test/v1", status: "deleted", disabled: false },
    { id: "mdl_text_empty", nodeType: "text", modelName: "No ID", modelId: "", apiKey: "key", baseUrl: "https://example.test/v1", status: "available", disabled: false }
  ];

  assert.deepEqual(filterSelectableTextModels(models).map((model) => model.id), ["mdl_text_unverified"]);
});

test("configured API model filter remains strict for execution readiness", () => {
  const models = [
    { id: "mdl_text_unverified", nodeType: "text", modelName: "Unverified", modelId: "unverified-model", apiKey: "", baseUrl: "", status: "unverified", disabled: false },
    { id: "mdl_text_ready", nodeType: "text", modelName: "Ready", modelId: "ready-model", apiKey: "key", baseUrl: "https://example.test/v1", status: "available", disabled: false }
  ];

  assert.deepEqual(filterConfiguredApiModels(models).map((model) => model.id), ["mdl_text_ready"]);
});

test("selection patch stores registry id and model id without API secrets", () => {
  const patch = buildTextModelSelectionPatch({
    id: "mdl_text_storyboard",
    modelName: "Storyboard Model",
    modelId: "storyboard-model",
    apiKey: "secret-key",
    baseUrl: "https://example.test/v1"
  });

  assert.equal(patch.selectedModelId, "mdl_text_storyboard");
  assert.equal(patch.selectedModelNameSnapshot, "Storyboard Model");
  assert.equal(patch.model, "storyboard-model");
  assert.equal(patch.provider, "registry-openai");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "apiKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "baseUrl"), false);
});

test("registry text payload resolves execution fields only at submit time", () => {
  const payload = buildRegistryTextPayload(
    { prompt: "make storyboard", systemPrompt: "return JSON" },
    { id: "mdl_text_storyboard", modelName: "Storyboard Model", modelId: "storyboard-model", apiKey: "secret-key", baseUrl: "https://example.test/v1" }
  );

  assert.equal(payload.model, "storyboard-model");
  assert.equal(payload.provider, "registry-openai");
  assert.equal(payload.apiUrl, "https://example.test/v1");
  assert.equal(payload.apiKey, "secret-key");
  assert.equal(payload.selectedModelId, "mdl_text_storyboard");
});

test("StoryboardScriptNode imports local registry model helpers", () => {
  const source = read("components/StoryboardScriptNode.js");
  assert.match(source, /modelRegistryRuntime/);
  assert.match(source, /applyTextModelSelectorUi|buildRegistryTextPayload|resolveTextNodeModelState/);
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test storyboardScriptTextModelRegistry.test.js
```

Expected: FAIL because `filterSelectableTextModels` and Storyboard Script registry wiring are absent.

- [ ] **Step 3: Add selectable filter**

Modify `modules/modelRegistryFilters.js`:

```js
export function isSelectableApiModel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) return false;

  return Boolean(
    trimText(model.id) &&
      trimText(model.modelName || model.name) &&
      trimText(model.modelId) &&
      trimText(model.status).toLowerCase() !== "deleted" &&
      model.disabled !== true
  );
}

export function filterSelectableTextModels(models) {
  return Array.isArray(models)
    ? models.filter((model) => trimText(model.nodeType).toLowerCase() === "text" && isSelectableApiModel(model))
    : [];
}
```

Keep `isConfiguredApiModel` strict: execution readiness still requires `apiKey` and `baseUrl`.

- [ ] **Step 4: Expose selectable text models**

Modify `components/aigenText/modelRegistryRuntime.js`:

```js
import { filterSelectableTextModels } from "../../modules/modelRegistryFilters.js";

function getTextModels() {
  return filterSelectableTextModels(getModelsByNodeType("text"));
}

export function getSelectableTextModels() {
  return getTextModels();
}
```

- [ ] **Step 5: Add Storyboard Script state fields**

Modify `src/core/storyboardScriptFactory.js` so `createDefaultStoryboardScriptState()` preserves or initializes:

```js
textModelSource: "local-registry",
selectedModelId: "",
selectedModelNameSnapshot: "",
modelDeleted: false,
model: STORYBOARD_SCRIPT_TEXT_MODEL,
provider: STORYBOARD_SCRIPT_TEXT_PROVIDER
```

Keep compatibility fields `model` and `provider`.

- [ ] **Step 6: Wire Storyboard Script to registry helpers**

Modify `components/StoryboardScriptNode.js`:

```js
import {
  applyTextModelSelectorUi,
  buildRegistryTextPayload,
  resolveTextNodeModelState,
  REGISTRY_TEXT_PROVIDER
} from "./aigenText/modelRegistryRuntime.js";
```

Ensure the model wrapper has selectors compatible with the text node runtime:

```html
<div class="img-model-wrap storyboard-text-model-wrap">
  <button class="img-model-btn-trigger" type="button" aria-label="选择文本模型">
    <span class="img-model-label"></span>
  </button>
  <div class="img-model-menu floating-menu"></div>
</div>
```

After mount/render of the wrapper:

```js
applyTextModelSelectorUi({
  node: this,
  data: this._data?.storyboardScript || this._data,
  store: storyboardStoreAdapter
});
```

Use this adapter so registry helper writes into `storyboardScript`:

```js
const storyboardStoreAdapter = {
  getState: () => appStore.getState(),
  updateNodeData: (nodeId, patch) => {
    const current = this._getScriptState();
    appStore.updateNodeData(nodeId, {
      storyboardScript: {
        ...current,
        ...patch,
        textModelSource: "local-registry"
      }
    });
  }
};
```

In payload build:

```js
const modelState = resolveTextNodeModelState(scriptState);
if (modelState.state === "ready") {
  return buildRegistryTextPayload(basePayload, modelState.model);
}
if (scriptState.textModelSource === "local-registry" && modelState.state !== "ready") {
  throw new Error(modelState.state === "deleted" ? "模型已删除，请重新选择" : "该模型未配置完整，无法生成");
}
```

- [ ] **Step 7: Verify tests pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test storyboardScriptTextModelRegistry.test.js
```

Expected: PASS, `fail 0`.

---

## Task 4: Render Storyboard Script Left and Right Side Plus

**Files:**
- Modify: `modules/interaction/EdgeController.js`
- Modify: `src/core/renderer.js`
- Modify: `styles/storyboard-script-node.css`
- Create: `storyboardScriptSidePlusProduct.test.js`

- [ ] **Step 1: Write failing side-plus tests**

Create `storyboardScriptSidePlusProduct.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllowedInputNodeTypesForSidePlus,
  getAllowedGenerationNodeTypesForQuoteMenu,
  resolveSidePlusRenderState,
  isValidConnection
} from "./modules/interaction/EdgeController.js";
import { createStoryboardScriptNodeData } from "./src/core/storyboardScriptFactory.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("storyboard-script exposes left input side-plus node types", () => {
  assert.deepEqual(getAllowedInputNodeTypesForSidePlus("storyboard-script"), [
    "source-text",
    "source-image",
    "source-video",
    "ai-image",
    "ai-text",
    "ai-video"
  ]);
});

test("storyboard-script exposes right output generation node types", () => {
  assert.deepEqual(getAllowedGenerationNodeTypesForQuoteMenu([{ type: "storyboard-script" }]), [
    "ai-text",
    "ai-image",
    "ai-video"
  ]);
});

test("storyboard-script allows incoming and outgoing product connections", () => {
  const story = createStoryboardScriptNodeData({ id: "story-1" });
  assert.equal(isValidConnection({ id: "source-text-1", type: "source-text", text: "plot" }, story), true);
  assert.equal(isValidConnection(story, { id: "ai-image-1", type: "ai-image" }), true);
  assert.equal(isValidConnection(story, { id: "ai-video-1", type: "ai-video" }), true);
});

test("side-plus render state keeps both sides for storyboard-script", () => {
  const state = resolveSidePlusRenderState({ type: "storyboard-script", width: 1024, height: 576 });
  assert.equal(state.shouldClear, false);
  assert.equal(state.selectionOnly, false);
  assert.equal(state.left, true);
  assert.equal(state.right, true);
});

test("renderer has stable selectors for left and right side-plus buttons", () => {
  const renderer = read("src/core/renderer.js");
  assert.match(renderer, /data-side=["']left["']/);
  assert.match(renderer, /data-side=["']right["']/);
  assert.match(renderer, /side-plus-btn/);
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test storyboardScriptSidePlusProduct.test.js
```

Expected: FAIL because output menu/render state/stable DOM selectors are incomplete.

- [ ] **Step 3: Update output generation menu**

Modify `modules/interaction/EdgeController.js` so:

```js
getAllowedGenerationNodeTypesForQuoteMenu([{ type: "storyboard-script" }])
```

returns:

```js
["ai-text", "ai-image", "ai-video"]
```

- [ ] **Step 4: Update render state contract**

Modify `resolveSidePlusRenderState`:

```js
if (nodeType === "storyboard-script") {
  return {
    shouldClear: false,
    selectionOnly: false,
    left: true,
    right: true
  };
}
```

Keep existing fields for other node types.

- [ ] **Step 5: Ensure renderer emits left/right data attributes**

Modify `src/core/renderer.js` where `.side-plus-btn` elements are created:

```js
leftButton.dataset.side = "left";
leftButton.classList.add("side-plus-btn", "side-plus-btn--left");
rightButton.dataset.side = "right";
rightButton.classList.add("side-plus-btn", "side-plus-btn--right");
```

If renderer creates only one button, split the render path so `storyboard-script` uses both `state.left` and `state.right`.

- [ ] **Step 6: Prevent clipping**

Modify `styles/storyboard-script-node.css`:

```css
.storyboard-script-wrapper {
  overflow: visible;
}

.storyboard-script-node {
  overflow: visible;
}
```

Keep overflow restrictions only on inner scroll regions such as `.storyboard-script-table-wrap`.

- [ ] **Step 7: Verify tests pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test storyboardScriptSidePlusProduct.test.js storyboardScriptInteractionGlue.test.js
```

Expected: PASS, `fail 0`.

---

## Task 5: Browser Product Smoke

**Files:**
- Create: `tools/smoke/director-storyboard-product-smoke.mjs`
- Output: `docs/reviews/artifacts/2026-06-08-director-storyboard-product-acceptance/product-smoke-result.json`

- [ ] **Step 1: Create smoke script**

Create `tools/smoke/director-storyboard-product-smoke.mjs`:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const artifactDir = join(root, "docs/reviews/artifacts/2026-06-08-director-storyboard-product-acceptance");
mkdirSync(artifactDir, { recursive: true });

const chromeExecutable = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.env.SMOKE_URL || "http://127.0.0.1:8777/?id=director_storyboard_product_acceptance";

const browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const httpErrors = [];

page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
page.on("response", (response) => {
  if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);

const result = await page.evaluate(() => ({
  appLoaded: Boolean(document.querySelector("#canvas") || document.querySelector(".canvas")),
  leftMenuHasDirector: Boolean(document.querySelector('[data-type="panorama-scene"]')),
  leftMenuHasStoryboardScript: Boolean(document.querySelector('[data-type="storyboard-script"]')),
  maleAssetUrl: new URL("/assets/characters/quaternius/universal-base/Superhero_Male_FullBody.gltf", location.origin).href,
  femaleAssetUrl: new URL("/assets/characters/quaternius/universal-base/Superhero_Female_FullBody.gltf", location.origin).href
}));

async function probe(urlToProbe) {
  const response = await page.request.get(urlToProbe);
  return { url: urlToProbe, status: response.status() };
}

result.characterAssetProbes = [await probe(result.maleAssetUrl), await probe(result.femaleAssetUrl)];

await page.evaluate(() => {
  const store = window.appStore || window.graphStore;
  if (!store?.addNode) return;
  const id = "smoke-storyboard-side-plus";
  store.addNode({ id, type: "storyboard-script", x: 300, y: 220, width: 1024, height: 576, name: "分镜脚本" });
  store.setSelectedNodes?.([id]);
});

await page.waitForTimeout(500);
await page.locator('[data-node-id="smoke-storyboard-side-plus"], #smoke-storyboard-side-plus, .v2-node:has-text("分镜脚本")').first().hover({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(500);

result.sidePlus = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll(".side-plus-btn")].map((button) => ({
    side: button.dataset.side || "",
    visible: button.offsetParent !== null,
    className: button.className,
    text: button.textContent
  }));
  return {
    buttons,
    hasLeft: buttons.some((button) => button.side === "left" && button.visible),
    hasRight: buttons.some((button) => button.side === "right" && button.visible)
  };
});

await page.screenshot({ path: join(artifactDir, "storyboard-side-plus.png"), fullPage: true });

result.pageErrors = pageErrors;
result.httpErrors = httpErrors;
result.pass = Boolean(
  result.appLoaded &&
    result.leftMenuHasDirector &&
    result.leftMenuHasStoryboardScript &&
    result.characterAssetProbes.every((item) => item.status === 200) &&
    result.sidePlus.hasLeft &&
    result.sidePlus.hasRight &&
    pageErrors.length === 0
);

writeFileSync(join(artifactDir, "product-smoke-result.json"), JSON.stringify(result, null, 2));
await browser.close();

if (!result.pass) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
```

- [ ] **Step 2: Run smoke**

With local server on `8777`, run:

```powershell
& 'D:\Aic\node.exe' tools\smoke\director-storyboard-product-smoke.mjs
```

Expected: exit `0`, `pass: true`, GLTF probes `200`, `sidePlus.hasLeft: true`, `sidePlus.hasRight: true`.

---

## Task 6: Full Verification

- [ ] **Step 1: Syntax-check changed JS files**

Run:

```powershell
$files = @(
  'modules\panoramaSceneNode\sceneNode.js',
  'modules\panoramaSceneNode\sceneNodeActions.js',
  'modules\panoramaSceneNode\scene3dBridge.js',
  'components\panoramaScene\PanoramaSceneToolbar.js',
  'components\StoryboardScriptNode.js',
  'src\core\storyboardScriptFactory.js',
  'modules\modelRegistryFilters.js',
  'components\aigenText\modelRegistryRuntime.js',
  'modules\interaction\EdgeController.js',
  'src\core\renderer.js',
  'tools\smoke\director-storyboard-product-smoke.mjs'
)
foreach ($file in $files) { & 'D:\Aic\node.exe' --check $file }
```

Expected: no syntax errors.

- [ ] **Step 2: Run new product tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test panoramaCharacterAssets.test.js panoramaSceneImageFusion.test.js storyboardScriptTextModelRegistry.test.js storyboardScriptSidePlusProduct.test.js
```

Expected: `fail 0`.

- [ ] **Step 3: Run existing migration tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js upstreamScopeGuard.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptDependencyClosure.test.js storyboardScriptToolbarAction.upstream.test.js storyboardScriptInteractionGlue.test.js appLifecycleBootWiring.test.js
```

Expected: `fail 0`.

- [ ] **Step 4: Run existing assistant/canvas regression tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test indexEncoding.test.js modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js
```

Expected: `fail 0`.

- [ ] **Step 5: Run browser product smoke**

Run:

```powershell
& 'D:\Aic\node.exe' tools\smoke\director-storyboard-product-smoke.mjs
```

Expected: `pass: true`.

- [ ] **Step 6: Write final result doc**

Create `docs/reviews/2026-06-08-director-storyboard-product-acceptance-result.md`:

```markdown
# Director / Storyboard Product Acceptance Result

Date: 2026-06-08
Project: `D:\Aic\huanying-source-windows-20260430-122116`

## Implemented

- 3D Director character assets restored locally.
- 3D Director scene image fusion state and toolbar/runtime wiring completed.
- Storyboard Script text model selector uses local text model registry semantics.
- Storyboard Script side-plus renders left and right product affordances.

## Verification

- Syntax checks: [paste command summary and result]
- New product tests: [paste pass/fail count]
- Existing migration tests: [paste pass/fail count]
- Existing assistant/canvas regression: [paste pass/fail count]
- Browser smoke: [paste result path and pass/fail]

## Acceptance Status

- 3D character placement: passed / failed with evidence
- 3D scene image fusion: passed / failed with evidence
- Storyboard Script model selector: passed / failed with evidence
- Storyboard Script side-plus: passed / failed with evidence

## Residual Risks

- CodeGraph status: locked or healthy
- Browser tool status: in-app Browser or Playwright fallback
- Known non-blocking resource 404s: list any remaining ones
```

Replace bracketed result lines with actual command output evidence before final delivery.

---

## Self-Review Checklist

- [x] 3D character placement has asset tests and HTTP probe acceptance.
- [x] 3D scene image fusion has state, action, toolbar, runtime, and smoke acceptance.
- [x] Storyboard Script model selector separates selectable models from execution-ready models.
- [x] Storyboard Script side-plus has data-layer tests and browser DOM hover acceptance.
- [x] No step requires killing CodeGraph or destructive Git commands.
- [x] Verification commands use `D:\Aic\node.exe`.
- [x] If workspace is not a Git repo, commit steps are skipped and evidence is recorded by file/test/artifact paths.
