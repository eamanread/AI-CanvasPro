# Huanying Director Storyboard Workflow Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the upstream director-stage and storyboard-script capabilities into Huanying while preserving the existing storyboard director skill, adding a real execution engine before group run, and keeping video generation authorization gated.

**Architecture:** Use migration-first for isolated upstream modules, contract adaptation for files that diverged in Huanying, and engine-first sequencing for workflow execution. `panorama-scene` remains the compatible node type for 3D director stage, `storyboard-script` becomes a separate editable table node, and group execution delegates to a shared canvas execution engine instead of wiring bespoke button logic.

**Tech Stack:** JavaScript ES modules, Node `node:test`, Huanying `graphStore`, Canvas Skills runtime, existing node renderer/component registry, existing 3D panorama scene bridge, upstream `AI-CanvasPro` modules under `output/upstream/AI-CanvasPro`.

---

## Source Inventory

- Local project: `D:\Aic\huanying-source-windows-20260430-122116`
- Upstream snapshot: `D:\Aic\huanying-source-windows-20260430-122116\output\upstream\AI-CanvasPro`
- CodeGraph status for this project: `database is locked`, so implementation agents should use `rg` and direct file reads until the index is healthy again.
- Git status note: `git status --short` currently returns `fatal: not a git repository (or any of the parent directories): .git` even though a `.git` directory is visible. Do not repair Git metadata as part of this plan; use verification checkpoints here, and only commit from a healthy clone.

## Product Contracts

- 3D director stage entry is truly visible in the add-node menu, without requiring dev mode.
- Keep persisted node type `panorama-scene`; change user-facing labels/default names to `3D导演台`.
- `storyboard-script` is a node type for editable shot tables, row selection, CSV export, and image/video prep materialization.
- Existing `config/assistant-skills/storyboard_director.json` stays an agent strategy skill for story-to-video planning and must not be renamed to `storyboard-script`.
- Execution engine must exist before wiring group run, so selected-node execution can be tested independently.
- Video generation remains gated: creating `ai-video` prep nodes is allowed, but queueing/running `ai-video` generation requires explicit authorization.

## File Structure

### Create

- `directorStageEntry.test.js`: static regression tests for visible 3D director stage menu and default labels.
- `src/core/storyboardScriptFactory.js`: migrated upstream storyboard-script state, normalization, CSV, and node-data factory.
- `src/core/storyboardScriptFactory.test.js`: factory and CSV tests.
- `src/core/storyboardScriptGeneration.js`: migrated upstream storyboard-script prompt builders and generated JSON normalizer.
- `src/core/storyboardScriptGeneration.test.js`: prompt and generation-result tests.
- `src/core/storyboardScriptMaterialize.js`: converts storyboard-script rows into `ai-image` draft nodes and `ai-video` prep nodes without starting video generation.
- `src/core/storyboardScriptMaterialize.test.js`: materialization tests, including video gate evidence.
- `components/StoryboardScriptNode.js`: migrated/adapted upstream node component for Huanying import paths and available services.
- `styles/storyboard-script-node.css`: upstream storyboard-script styling.
- `components/nodeToolbar/storyboardScriptAction.js`: upstream toolbar action adapted to local paths.
- `components/nodeToolbar/storyboardScriptAction.test.js`: toolbar action tests.
- `modules/workflows/canvasExecutionEngine.js`: shared execution engine for ordered node execution, selected-node execution, and group execution.
- `modules/workflows/canvasExecutionEngine.test.js`: engine tests.
- `modules/workflows/groupRuntime.js`: group child collection and group execution-state patch helpers.
- `modules/workflows/groupRuntime.test.js`: group runtime tests.
- `modules/workflows/groupExecutionEvents.js`: DOM event bridge from `GroupNode` button to execution engine.

### Modify

- `index.html`: visible menu labels, `storyboard-script` menu entry, stylesheet/script includes.
- `main.js`: register `StoryboardScriptNode`, expose `storyboard-script` creation path, and stop treating `panorama-scene` as dev-only.
- `modules/nodeMeta.js`: add `storyboard-script` metadata.
- `modules/panoramaSceneNode/sceneNode.js`: change `PANORAMA_SCENE_DEFAULT_NAME` to `3D导演台`.
- `modules/workflows/workflowPreview.js`: label `panorama-scene` as `3D导演台` and add `storyboard-script` label.
- `modules/assistant/assistantCanvasWorkflowSkills.js`: add execution skills while preserving apply/save/update.
- `modules/assistant/assistantCanvasWorkflowSkills.test.js`: add execution skill tests.
- `modules/assistant/canvasSkills/manifest.js`: add workflow execution skill IDs and mark execution permission as generation-capable.
- `modules/assistant/canvasSkills/docs/manifest.contract.md`: document execution skills and video gate.
- `components/GroupNode.js`: replace disabled toast with `workflow:execute-group` event dispatch and runtime status rendering hooks.

### Do Not Wholesale Overwrite

- `main.js`
- `index.html`
- `components/PanoramaSceneNode.js`
- `modules/panoramaSceneNode/sceneNodeActions.js`
- `components/GroupNode.js`

These local files contain Huanying-specific integration and obfuscated/minified structure. Patch only the targeted imports, registry entries, labels, and handlers.

## Implementation Rules

- Prefer copying upstream files when dependencies are isolated; adapt import paths immediately after copying.
- Keep backward-compatible aliases such as `panorama_scene`, `panorama360`, and `panorama_360`.
- Do not add any action path that queues `queue_generation_task` for `ai-video` unless `allowVideoGeneration === true` or the user authorization text is explicitly passed through.
- Use pure functions and `node:test` for new execution and storyboard data logic before touching UI files.
- For each task, run the listed tests before moving to the next task.
- If implementation happens in a healthy Git clone, commit after each task. In this current worktree, keep verification logs because `git status` is not usable.

---

### Task 1: Baseline And 3D Director Stage Visibility

**Files:**
- Create: `directorStageEntry.test.js`
- Modify: `index.html`
- Modify: `main.js`
- Modify: `modules/panoramaSceneNode/sceneNode.js`
- Modify: `modules/workflows/workflowPreview.js`

- [ ] **Step 1: Write the failing static visibility test**

Create `directorStageEntry.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const mainJs = readFileSync(new URL("./main.js", import.meta.url), "utf8");
const sceneNodeJs = readFileSync(new URL("./modules/panoramaSceneNode/sceneNode.js", import.meta.url), "utf8");
const workflowPreviewJs = readFileSync(new URL("./modules/workflows/workflowPreview.js", import.meta.url), "utf8");

test("3D director stage menu entry is visible and correctly labeled", () => {
  assert.match(indexHtml, /data-type="panorama-scene"[\s\S]*?<span>3D导演台<\/span>/);
  assert.doesNotMatch(indexHtml, /data-type="panorama-scene"[^>]*hidden/);
});

test("panorama-scene is not treated as a dev-only node type", () => {
  assert.doesNotMatch(mainJs, /_isDevOnlyNodeType\s*=\s*[^;]*panorama-scene/);
  assert.doesNotMatch(mainJs, /=>\s*[^;]*===\s*['"]panorama-scene['"]/);
});

test("3D director stage keeps panorama-scene compatibility", () => {
  assert.match(sceneNodeJs, /PANORAMA_SCENE_NODE_TYPE\s*=\s*[^;]*panorama-scene/);
  assert.match(sceneNodeJs, /PANORAMA_SCENE_DEFAULT_NAME\s*=\s*[^;]*3D导演台/);
  assert.match(workflowPreviewJs, /panorama-scene['"]?\s*:\s*['"]3D导演台['"]/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test directorStageEntry.test.js
```

Expected before implementation: at least one failure showing the old `3D场景编辑` label or dev-only `panorama-scene` handling.

- [ ] **Step 3: Patch `index.html` labels**

In `index.html`, change only the `panorama-scene` menu item label:

```html
<button type="button" class="nam-item" data-type="panorama-scene">
  ...
  <span>3D导演台</span>
</button>
```

Keep `data-type="panorama-scene"` unchanged.

- [ ] **Step 4: Patch `main.js` dev visibility logic**

Find the local function equivalent to:

```js
const _isDevOnlyNodeType = (type) => type === "panorama-scene";
```

Change it to a non-matching implementation:

```js
const _isDevOnlyNodeType = (type) => false;
```

If the local obfuscated file cannot be patched cleanly, use the semantically equivalent change: ensure `panorama-scene` is not hidden by `_syncLeftMenuDevVisibility()` and dragging `data-type="panorama-scene"` is never blocked by dev mode.

- [ ] **Step 5: Patch default and preview labels**

In `modules/panoramaSceneNode/sceneNode.js`, set:

```js
const PANORAMA_SCENE_DEFAULT_NAME = "3D导演台";
```

In `modules/workflows/workflowPreview.js`, ensure the node label map contains:

```js
"panorama-scene": "3D导演台",
"panorama-360": "360全景图",
```

- [ ] **Step 6: Run the visibility regression**

Run:

```powershell
& 'D:/Aic/node.exe' --test directorStageEntry.test.js
```

Expected: PASS.

---

### Task 2: Storyboard-Script Core Factory And Generation Normalizer

**Files:**
- Create: `src/core/storyboardScriptFactory.js`
- Create: `src/core/storyboardScriptFactory.test.js`
- Create: `src/core/storyboardScriptGeneration.js`
- Create: `src/core/storyboardScriptGeneration.test.js`

- [ ] **Step 1: Copy upstream core files**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\storyboardScriptFactory.js' -Destination 'src\core\storyboardScriptFactory.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\storyboardScriptGeneration.js' -Destination 'src\core\storyboardScriptGeneration.js' -Force
```

Expected: both files exist under `src/core`.

- [ ] **Step 2: Add factory tests**

Create `src/core/storyboardScriptFactory.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  STORYBOARD_SCRIPT_NODE_TYPE,
  createStoryboardScriptNodeData,
  normalizeStoryboardScriptRows,
  serializeStoryboardScriptRowsToCsv,
} from "./storyboardScriptFactory.js";

test("createStoryboardScriptNodeData creates a storyboard-script node", () => {
  const node = createStoryboardScriptNodeData({
    id: "script-1",
    x: 10,
    y: 20,
    storyboardScript: {
      rows: [{ "镜号": "1", "时长": "2s", "画面描述": "角色入场" }],
    },
  });

  assert.equal(node.id, "script-1");
  assert.equal(node.type, STORYBOARD_SCRIPT_NODE_TYPE);
  assert.equal(node.x, 10);
  assert.equal(node.y, 20);
  assert.equal(node.storyboardScript.rows.length, 1);
  assert.equal(node.storyboardScript.rows[0]["镜号"], "1");
});

test("normalizeStoryboardScriptRows accepts common row containers", () => {
  assert.deepEqual(
    normalizeStoryboardScriptRows({ rows: [{ "镜号": "1", scene: "room" }] }).map((row) => row["镜号"]),
    ["1"]
  );
});

test("serializeStoryboardScriptRowsToCsv emits a BOM CSV table", () => {
  const csv = serializeStoryboardScriptRowsToCsv([{ "镜号": "1", "画面描述": "a,b" }]);
  assert.equal(csv.startsWith("\ufeff"), true);
  assert.match(csv, /"a,b"/);
});
```

- [ ] **Step 3: Add generation normalizer tests**

Create `src/core/storyboardScriptGeneration.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStoryboardScriptPrompt,
  extractRequestedStoryboardShotCount,
  normalizeStoryboardScriptGenerationResult,
} from "./storyboardScriptGeneration.js";

test("extractRequestedStoryboardShotCount reads explicit shot counts", () => {
  assert.equal(extractRequestedStoryboardShotCount("请拆成 12 个镜头"), 12);
  assert.equal(extractRequestedStoryboardShotCount("make 4 shots"), 4);
});

test("buildStoryboardScriptPrompt returns a JSON-oriented prompt", () => {
  const prompt = buildStoryboardScriptPrompt("一个雨夜悬疑短片", { imageCount: 1 });
  assert.match(prompt, /storyboard-script/);
  assert.match(prompt, /rows/);
});

test("normalizeStoryboardScriptGenerationResult keeps storyboard-script separated from storyboard_director", () => {
  const raw = JSON.stringify({
    schemaVersion: "storyboard-script.v1",
    type: "storyboard-script",
    sourceMode: "text",
    title: "雨夜",
    detectedIntent: { shotCount: 1 },
    rows: [{ "镜号": "1", "时长": "2s", "画面描述": "雨夜街口" }],
  });

  const result = normalizeStoryboardScriptGenerationResult(raw, { requireMarker: true, sourceMode: "text" });
  assert.equal(result.ok, true);
  assert.equal(result.sourceMode, "text");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rawJson.includes("storyboard_director"), false);
});
```

- [ ] **Step 4: Run core tests and fix import-only errors**

Run:

```powershell
& 'D:/Aic/node.exe' --test src\core\storyboardScriptFactory.test.js src\core\storyboardScriptGeneration.test.js
```

Expected: PASS. If failures are caused by upstream encoding in Chinese field names, compare with `output\upstream\AI-CanvasPro\src\core\storyboardScriptFactory.js` and keep the upstream schema keys intact while making tests assert the actual exported behavior.

---

### Task 3: Register Storyboard-Script Node Without Conflicting With Storyboard Director

**Files:**
- Create: `components/StoryboardScriptNode.js`
- Create: `styles/storyboard-script-node.css`
- Create: `storyboardScriptRegistration.test.js`
- Modify: `index.html`
- Modify: `main.js`
- Modify: `modules/nodeMeta.js`
- Modify: `modules/workflows/workflowPreview.js`

- [ ] **Step 1: Write registration tests**

Create `storyboardScriptRegistration.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const mainJs = readFileSync(new URL("./main.js", import.meta.url), "utf8");
const nodeMetaJs = readFileSync(new URL("./modules/nodeMeta.js", import.meta.url), "utf8");
const directorSkill = readFileSync(new URL("./config/assistant-skills/storyboard_director.json", import.meta.url), "utf8");

test("storyboard-script appears as a node menu item", () => {
  assert.match(indexHtml, /data-type="storyboard-script"/);
  assert.match(indexHtml, /分镜脚本|Storyboard Script/);
  assert.match(indexHtml, /storyboard-script-node\.css/);
});

test("main registers StoryboardScriptNode", () => {
  assert.match(mainJs, /StoryboardScriptNode/);
  assert.match(mainJs, /['"]storyboard-script['"]\s*:\s*StoryboardScriptNode/);
});

test("node meta knows storyboard-script without aliasing storyboard_director", () => {
  assert.match(nodeMetaJs, /['"]storyboard-script['"]/);
  assert.doesNotMatch(nodeMetaJs, /storyboard_director/);
});

test("storyboard_director skill keeps the video authorization gate", () => {
  assert.match(directorSkill, /queue_generation_task:ai-video/);
  assert.match(directorSkill, /explicitly authorizes video generation|video generation itself must not be queued/i);
});
```

- [ ] **Step 2: Run registration tests and verify they fail**

Run:

```powershell
& 'D:/Aic/node.exe' --test storyboardScriptRegistration.test.js
```

Expected before implementation: failures for missing `storyboard-script` menu, registry, or metadata.

- [ ] **Step 3: Copy upstream component and style**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\StoryboardScriptNode.js' -Destination 'components\StoryboardScriptNode.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\styles\storyboard-script-node.css' -Destination 'styles\storyboard-script-node.css' -Force
```

Then adapt imports in `components/StoryboardScriptNode.js`:

```js
// Upstream -> Huanying local path examples
// "../core/stores/appStore.js" -> "../src/core/stores/appStore.js"
// "../core/math.js" -> "../src/core/math.js"
// "../core/storyboardScriptFactory.js" -> "../src/core/storyboardScriptFactory.js"
// "../core/storyboardScriptGeneration.js" -> "../src/core/storyboardScriptGeneration.js"
// "../modules/history.js" -> "../modules/history.js"
// "../../api/aiTextApi.js" -> "../api/aiTextApi.js"
```

If an upstream import does not exist locally, replace it with a focused local adapter in the same file rather than importing a large missing subsystem. The component must at minimum mount, edit cells, render list/card mode, call `generateText()` for script generation, create image drafts through `storyboardScriptMaterialize.js`, and never queue `ai-video` generation by itself.

- [ ] **Step 4: Add stylesheet include and menu entry**

In `index.html`, add the stylesheet near existing CSS links:

```html
<link rel="stylesheet" href="./styles/storyboard-script-node.css">
```

Add a node menu button in the same section as storyboard/media nodes:

```html
<button type="button" class="nam-item" data-type="storyboard-script">
  <div class="nam-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="16" rx="2"></rect>
      <path d="M8 4v16"></path>
      <path d="M3 9h18"></path>
      <path d="M3 14h18"></path>
    </svg>
  </div>
  <span>分镜脚本</span>
</button>
```

- [ ] **Step 5: Register the component in `main.js`**

Add the import:

```js
import { StoryboardScriptNode } from "./components/StoryboardScriptNode.js";
```

Add the component mapping:

```js
"storyboard-script": StoryboardScriptNode,
```

Add create-node handling equivalent to the existing panorama node special case:

```js
import { createStoryboardScriptNodeData } from "./src/core/storyboardScriptFactory.js";

const _createStoryboardScriptNodeDataByType = ({ type, id, x, y, width, height, name }) => {
  if (type !== "storyboard-script") return null;
  return createStoryboardScriptNodeData({ id, x, y, width, height, name });
};
```

Wire this helper in the same branch where dragged menu node data is created, before generic AI/source fallback, so `storyboard-script` receives its `storyboardScript` state.

- [ ] **Step 6: Update node metadata and workflow labels**

In `modules/nodeMeta.js`, add:

```js
"storyboard-script": {
  aliases: [],
  wrapperClasses: ["storyboard-script-node"],
  refKind: "",
},
```

In `modules/workflows/workflowPreview.js`, add:

```js
"storyboard-script": "分镜脚本",
```

- [ ] **Step 7: Run registration tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test storyboardScriptRegistration.test.js
```

Expected: PASS.

---

### Task 4: Storyboard Row Materialization With Video Gate

**Files:**
- Create: `src/core/storyboardScriptMaterialize.js`
- Create: `src/core/storyboardScriptMaterialize.test.js`
- Modify: `components/StoryboardScriptNode.js`

- [ ] **Step 1: Write materialization tests**

Create `src/core/storyboardScriptMaterialize.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStoryboardImageNodeDrafts,
  buildStoryboardVideoPrepNodeDrafts,
} from "./storyboardScriptMaterialize.js";

const rows = [
  { "镜号": "1", "图片提示词": "wide shot, rain", "视频提示词": "slow push in", "时长": "2s" },
  { "镜号": "2", "图片提示词": "close shot, hand", "视频提示词": "hand trembles", "时长": "3s" },
];

test("buildStoryboardImageNodeDrafts creates ai-image drafts from rows", () => {
  const drafts = buildStoryboardImageNodeDrafts({
    sourceNode: { id: "script", x: 100, y: 100, width: 640, height: 360 },
    rows,
    generateId: (prefix) => `${prefix}-fixed-${draftsSeed.next++}`,
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].type, "ai-image");
  assert.equal(drafts[0].prompt, "wide shot, rain");
  assert.equal(drafts[0].storyboardSourceNodeId, "script");
  assert.equal(drafts[0].storyboardRowIndex, 0);
});

test("buildStoryboardVideoPrepNodeDrafts creates ai-video prep nodes without queueing generation", () => {
  const drafts = buildStoryboardVideoPrepNodeDrafts({
    sourceNode: { id: "script", x: 100, y: 100, width: 640, height: 360 },
    rows,
    generateId: (prefix) => `${prefix}-video-${draftsSeed.next++}`,
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].type, "ai-video");
  assert.equal(drafts[0].prompt, "slow push in");
  assert.equal(drafts[0].generationStatus || "", "");
  assert.equal(drafts[0].autoGenerate === true, false);
  assert.equal(drafts[0].requiresVideoAuthorization, true);
});

const draftsSeed = { next: 1 };
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
& 'D:/Aic/node.exe' --test src\core\storyboardScriptMaterialize.test.js
```

Expected before implementation: module not found.

- [ ] **Step 3: Implement materialization helpers**

Create `src/core/storyboardScriptMaterialize.js`:

```js
function text(value) {
  return String(value ?? "").trim();
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function shotLabel(row, index) {
  return text(row?.["镜号"] || row?.shotNo || row?.shotNumber) || String(index + 1);
}

function imagePrompt(row) {
  return text(row?.["图片提示词"] || row?.imagePrompt || row?.image_prompt || row?.prompt || row?.["画面描述"]);
}

function videoPrompt(row) {
  return text(row?.["视频提示词"] || row?.videoPrompt || row?.video_prompt || row?.["角色动作"] || row?.["画面描述"]);
}

function layoutFor(sourceNode = {}, index = 0, width = 360, height = 260) {
  const sourceX = finiteNumber(sourceNode.x, 0);
  const sourceY = finiteNumber(sourceNode.y, 0);
  const sourceWidth = finiteNumber(sourceNode.width, 640);
  return {
    x: sourceX + sourceWidth + 80,
    y: sourceY + index * (height + 36),
    width,
    height,
  };
}

export function buildStoryboardImageNodeDrafts({ sourceNode = {}, rows = [], generateId } = {}) {
  const idFactory = typeof generateId === "function" ? generateId : (prefix) => `${prefix}-${Date.now()}`;
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index, prompt: imagePrompt(row) }))
    .filter((item) => item.prompt)
    .map(({ row, index, prompt }) => ({
      id: idFactory("ai-image"),
      type: "ai-image",
      name: `分镜 ${shotLabel(row, index)} 图像`,
      prompt,
      ...layoutFor(sourceNode, index, 360, 260),
      storyboardSourceNodeId: text(sourceNode.id),
      storyboardRowIndex: index,
      storyboardShotNo: shotLabel(row, index),
    }));
}

export function buildStoryboardVideoPrepNodeDrafts({ sourceNode = {}, rows = [], generateId } = {}) {
  const idFactory = typeof generateId === "function" ? generateId : (prefix) => `${prefix}-${Date.now()}`;
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index, prompt: videoPrompt(row) }))
    .filter((item) => item.prompt)
    .map(({ row, index, prompt }) => ({
      id: idFactory("ai-video"),
      type: "ai-video",
      name: `分镜 ${shotLabel(row, index)} 视频预备`,
      prompt,
      ...layoutFor(sourceNode, index, 420, 260),
      storyboardSourceNodeId: text(sourceNode.id),
      storyboardRowIndex: index,
      storyboardShotNo: shotLabel(row, index),
      requiresVideoAuthorization: true,
    }));
}
```

- [ ] **Step 4: Wire image draft creation in `StoryboardScriptNode`**

In `components/StoryboardScriptNode.js`, use the helpers above for the node's image-generation action. The event handler must add draft nodes and select them; it must not call video generation:

```js
import { buildStoryboardImageNodeDrafts, buildStoryboardVideoPrepNodeDrafts } from "../src/core/storyboardScriptMaterialize.js";

// Inside the image draft action:
const drafts = buildStoryboardImageNodeDrafts({
  sourceNode: this._data,
  rows: selectedRows.length ? selectedRows : scriptState.rows,
  generateId,
});
drafts.forEach((node) => store.addNode(node));
store.setSelectedNodes?.(drafts.map((node) => node.id));
commit();
```

For video prep, use `buildStoryboardVideoPrepNodeDrafts()` and add nodes only. Show a toast such as `已创建视频预备节点，生成视频需再次授权`.

- [ ] **Step 5: Run materialization tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test src\core\storyboardScriptMaterialize.test.js
```

Expected: PASS.

---

### Task 5: Canvas Execution Engine Before Group Run

**Files:**
- Create: `modules/workflows/canvasExecutionEngine.js`
- Create: `modules/workflows/canvasExecutionEngine.test.js`

- [ ] **Step 1: Write engine tests**

Create `modules/workflows/canvasExecutionEngine.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  createCanvasExecutionEngine,
  resolveExecutionOrder,
} from "./canvasExecutionEngine.js";

test("resolveExecutionOrder orders selected nodes by dependencies", () => {
  const nodes = [
    { id: "a", type: "ai-text" },
    { id: "b", type: "ai-image" },
    { id: "c", type: "ai-video" },
  ];
  const edges = [
    { source: "a", target: "b" },
    { sourceId: "b", targetId: "c" },
  ];

  assert.deepEqual(resolveExecutionOrder({ nodes, edges, selectedNodeIds: ["c", "b", "a"] }).map((node) => node.id), [
    "a",
    "b",
    "c",
  ]);
});

test("executeNodes blocks ai-video generation without authorization", async () => {
  const queued = [];
  const engine = createCanvasExecutionEngine({
    graphStore: {
      getState: () => ({ nodes: { v: { id: "v", type: "ai-video", prompt: "move" } }, edges: [] }),
      updateNodeData: () => {},
    },
    generationRunner: async (node) => queued.push(node.id),
  });

  const result = await engine.executeNodes(["v"], { allowVideoGeneration: false });
  assert.equal(result.results[0].status, "blocked");
  assert.equal(result.results[0].reason, "video_generation_requires_authorization");
  assert.deepEqual(queued, []);
});

test("executeNodes runs image and text nodes through the generation runner", async () => {
  const queued = [];
  const engine = createCanvasExecutionEngine({
    graphStore: {
      getState: () => ({
        nodes: {
          t: { id: "t", type: "ai-text", prompt: "outline" },
          i: { id: "i", type: "ai-image", prompt: "frame" },
        },
        edges: [{ sourceId: "t", targetId: "i" }],
      }),
      updateNodeData: () => {},
    },
    generationRunner: async (node) => {
      queued.push(node.id);
      return { ok: true };
    },
  });

  const result = await engine.executeNodes(["i", "t"]);
  assert.deepEqual(queued, ["t", "i"]);
  assert.equal(result.status, "completed");
});
```

- [ ] **Step 2: Run engine tests and verify they fail**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\workflows\canvasExecutionEngine.test.js
```

Expected before implementation: module not found.

- [ ] **Step 3: Implement execution engine**

Create `modules/workflows/canvasExecutionEngine.js`:

```js
function text(value) {
  return String(value ?? "").trim();
}

function graphState(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore || {};
  const nodes = Array.isArray(state.nodes) ? state.nodes : state.nodes && typeof state.nodes === "object" ? Object.values(state.nodes) : [];
  const edges = Array.isArray(state.edges) ? state.edges : state.edges && typeof state.edges === "object" ? Object.values(state.edges) : [];
  return { nodes, edges };
}

function edgeSource(edge) {
  return text(edge?.sourceId || edge?.source || edge?.from);
}

function edgeTarget(edge) {
  return text(edge?.targetId || edge?.target || edge?.to);
}

function nodeType(node) {
  return text(node?.type || node?.nodeType || node?.data?.type || node?.data?.nodeType);
}

export function resolveExecutionOrder({ nodes = [], edges = [], selectedNodeIds = [] } = {}) {
  const selected = new Set((Array.isArray(selectedNodeIds) ? selectedNodeIds : []).map(text).filter(Boolean));
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map((node) => [text(node?.id), node]).filter(([id]) => id));
  const selectedNodes = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const dependencyMap = new Map(selectedNodes.map((node) => [text(node.id), new Set()]));

  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = edgeSource(edge);
    const target = edgeTarget(edge);
    if (dependencyMap.has(target) && selected.has(source)) {
      dependencyMap.get(target).add(source);
    }
  }

  const ordered = [];
  const remaining = new Map(selectedNodes.map((node) => [text(node.id), node]));
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((node) => {
      const deps = dependencyMap.get(text(node.id)) || new Set();
      return [...deps].every((id) => !remaining.has(id));
    });
    if (ready.length === 0) {
      ordered.push(...remaining.values());
      break;
    }
    ready.sort((left, right) => (Number(left.y) || 0) - (Number(right.y) || 0) || (Number(left.x) || 0) - (Number(right.x) || 0));
    for (const node of ready) {
      ordered.push(node);
      remaining.delete(text(node.id));
    }
  }
  return ordered;
}

export function createCanvasExecutionEngine({ graphStore, generationRunner } = {}) {
  async function executeNode(node, options = {}) {
    const type = nodeType(node);
    if (type === "ai-video" && options.allowVideoGeneration !== true) {
      return { nodeId: text(node.id), nodeType: type, status: "blocked", reason: "video_generation_requires_authorization" };
    }
    if (!["ai-text", "ai-image", "ai-video"].includes(type)) {
      return { nodeId: text(node.id), nodeType: type, status: "skipped", reason: "node_type_not_executable" };
    }
    graphStore?.updateNodeData?.(node.id, { executionStatus: "running" });
    const runResult = typeof generationRunner === "function" ? await generationRunner(node, options) : { ok: true };
    graphStore?.updateNodeData?.(node.id, { executionStatus: runResult?.ok === false ? "failed" : "completed" });
    return { nodeId: text(node.id), nodeType: type, status: runResult?.ok === false ? "failed" : "completed", result: runResult };
  }

  async function executeNodes(selectedNodeIds = [], options = {}) {
    const { nodes, edges } = graphState(graphStore);
    const ordered = resolveExecutionOrder({ nodes, edges, selectedNodeIds });
    const results = [];
    for (const node of ordered) {
      results.push(await executeNode(node, options));
    }
    const failed = results.some((item) => item.status === "failed");
    const blocked = results.some((item) => item.status === "blocked");
    return { status: failed ? "failed" : blocked ? "blocked" : "completed", results };
  }

  function getExecutionStatus(nodeIds = []) {
    const ids = new Set((Array.isArray(nodeIds) ? nodeIds : []).map(text).filter(Boolean));
    const { nodes } = graphState(graphStore);
    return nodes
      .filter((node) => ids.has(text(node.id)))
      .map((node) => ({ nodeId: text(node.id), status: text(node.executionStatus || node.data?.executionStatus) || "idle" }));
  }

  return { executeNode, executeNodes, getExecutionStatus };
}
```

- [ ] **Step 4: Run engine tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\workflows\canvasExecutionEngine.test.js
```

Expected: PASS.

---

### Task 6: Assistant Workflow Execution Skills

**Files:**
- Modify: `modules/assistant/assistantCanvasWorkflowSkills.js`
- Modify: `modules/assistant/assistantCanvasWorkflowSkills.test.js`
- Modify: `modules/assistant/canvasSkills/manifest.js`
- Modify: `modules/assistant/canvasSkills/docs/manifest.contract.md`

- [ ] **Step 1: Extend workflow skill tests**

Append to `modules/assistant/assistantCanvasWorkflowSkills.test.js`:

```js
test("executeSelectedNodes delegates to execution engine with selected nodes", async () => {
  const calls = [];
  const graphStore = {
    getState: () => ({ selectedNodeIds: ["a", "b"], nodes: {}, edges: [] }),
  };
  const skills = createAssistantCanvasWorkflowSkills({
    graphStore,
    executionEngine: {
      executeNodes: async (nodeIds, options) => {
        calls.push({ nodeIds, options });
        return { status: "completed", results: [] };
      },
    },
  });

  const result = await skills.executeSelectedNodes({ allowVideoGeneration: false });
  assert.equal(result.executed, true);
  assert.deepEqual(calls[0].nodeIds, ["a", "b"]);
  assert.equal(calls[0].options.allowVideoGeneration, false);
});

test("executeSelectedNodes preserves video authorization gate", async () => {
  const skills = createAssistantCanvasWorkflowSkills({
    graphStore: { getState: () => ({ selectedNodeIds: ["v"], nodes: {}, edges: [] }) },
    executionEngine: {
      executeNodes: async () => ({
        status: "blocked",
        results: [{ nodeId: "v", status: "blocked", reason: "video_generation_requires_authorization" }],
      }),
    },
  });

  const result = await skills.executeSelectedNodes({});
  assert.equal(result.executed, false);
  assert.equal(result.warning, "video_generation_requires_authorization");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\assistant\assistantCanvasWorkflowSkills.test.js
```

Expected before implementation: `executeSelectedNodes` is not a function.

- [ ] **Step 3: Add workflow execution methods**

Modify the factory signature in `modules/assistant/assistantCanvasWorkflowSkills.js`:

```js
export function createAssistantCanvasWorkflowSkills({
  graphStore,
  workflowService = {},
  workflowCanvas = {},
  executionEngine = null,
} = {}) {
```

Add selected-id normalization:

```js
function selectedNodeIdsFrom(graphStore) {
  const state = stateOf(graphStore);
  const selected = state.selectedNodeIds || state.selectedNodes || graphStore?.selectedNodeIds || [];
  return Array.isArray(selected) ? selected.map(text).filter(Boolean) : [];
}
```

Add execution method:

```js
async function executeSelectedNodes(action = {}) {
  const selectedNodeIds = Array.isArray(action.nodeIds) ? action.nodeIds.map(text).filter(Boolean) : selectedNodeIdsFrom(graphStore);
  if (!selectedNodeIds.length) {
    return { executed: false, createdNodeIds: [], warning: "no selected nodes" };
  }
  if (!executionEngine?.executeNodes) {
    return { executed: false, selectedNodeIds, warning: "execution engine unavailable" };
  }
  const result = await executionEngine.executeNodes(selectedNodeIds, {
    allowVideoGeneration: action.allowVideoGeneration === true,
    source: "assistant-workflow",
  });
  const blockedVideo = result?.results?.find?.((item) => item.reason === "video_generation_requires_authorization");
  return {
    executed: result?.status === "completed",
    selectedNodeIds,
    status: result?.status || "unknown",
    warning: blockedVideo ? "video_generation_requires_authorization" : result?.warning || "",
    results: result?.results || [],
  };
}
```

Return it:

```js
return { applyWorkflow, saveWorkflow, updateWorkflow, executeSelectedNodes };
```

- [ ] **Step 4: Register manifest skill IDs**

In `modules/assistant/canvasSkills/manifest.js`, extend `CANVAS_SKILL_IDS`:

```js
workflowExecuteSelectedNodes: "workflow.executeSelectedNodes",
workflowExecuteGroup: "workflow.executeGroup",
```

Update `skill()` so workflow execution is generation-capable:

```js
function skill(id, key) {
  const isGenerate = id.includes("generate") || id.includes("execute");
  return {
    id,
    key,
    permission: isGenerate ? "generate" : id.startsWith("asset.list") ? "read" : "write",
  };
}
```

Document the new skills in `modules/assistant/canvasSkills/docs/manifest.contract.md`:

```md
- `workflow.executeSelectedNodes`: runs the execution engine against explicit or selected node ids.
- `workflow.executeGroup`: runs the execution engine against nodes inside a group.
- Both workflow execution skills must preserve `ai-video` authorization gating.
```

- [ ] **Step 5: Run assistant workflow tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\canvasSkills\runtime.test.js
```

Expected: PASS.

---

### Task 7: Group Runtime Delegating To Execution Engine

**Files:**
- Create: `modules/workflows/groupRuntime.js`
- Create: `modules/workflows/groupRuntime.test.js`
- Create: `modules/workflows/groupExecutionEvents.js`
- Modify: `components/GroupNode.js`
- Modify: `index.html`

- [ ] **Step 1: Write group runtime tests**

Create `modules/workflows/groupRuntime.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { collectGroupChildNodeIds, createGroupRuntime } from "./groupRuntime.js";

test("collectGroupChildNodeIds returns direct children in visual order", () => {
  const nodes = [
    { id: "g", type: "group" },
    { id: "b", parentId: "g", x: 100, y: 200 },
    { id: "a", parentId: "g", x: 10, y: 100 },
    { id: "out", parentId: "other", x: 0, y: 0 },
  ];

  assert.deepEqual(collectGroupChildNodeIds({ nodes, groupId: "g" }), ["a", "b"]);
});

test("runGroup updates group runtime state and delegates to execution engine", async () => {
  const patches = [];
  const runtime = createGroupRuntime({
    graphStore: {
      getState: () => ({
        nodes: {
          g: { id: "g", type: "group" },
          a: { id: "a", parentId: "g", type: "ai-text" },
        },
      }),
      updateNodeData: (id, patch) => patches.push({ id, patch }),
    },
    executionEngine: {
      executeNodes: async (nodeIds) => ({ status: "completed", results: nodeIds.map((id) => ({ nodeId: id, status: "completed" })) }),
    },
  });

  const result = await runtime.runGroup("g");
  assert.equal(result.status, "completed");
  assert.deepEqual(result.nodeIds, ["a"]);
  assert.equal(patches.at(-1).patch.groupRuntime.execution.status, "completed");
});
```

- [ ] **Step 2: Run group tests and verify they fail**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\workflows\groupRuntime.test.js
```

Expected before implementation: module not found.

- [ ] **Step 3: Implement group runtime**

Create `modules/workflows/groupRuntime.js`:

```js
function text(value) {
  return String(value ?? "").trim();
}

function stateNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore || {};
  const nodes = state.nodes || {};
  return Array.isArray(nodes) ? nodes : Object.values(nodes);
}

export function collectGroupChildNodeIds({ nodes = [], groupId = "" } = {}) {
  const id = text(groupId);
  return (Array.isArray(nodes) ? nodes : [])
    .filter((node) => text(node?.parentId) === id)
    .sort((left, right) => (Number(left.y) || 0) - (Number(right.y) || 0) || (Number(left.x) || 0) - (Number(right.x) || 0))
    .map((node) => text(node.id))
    .filter(Boolean);
}

export function createGroupRuntime({ graphStore, executionEngine } = {}) {
  function patchGroup(groupId, execution) {
    graphStore?.updateNodeData?.(groupId, {
      groupRuntime: {
        execution,
      },
    });
  }

  async function runGroup(groupId, options = {}) {
    const id = text(groupId);
    const nodeIds = collectGroupChildNodeIds({ nodes: stateNodes(graphStore), groupId: id });
    if (!nodeIds.length) {
      const empty = { status: "empty", nodeIds: [], results: [] };
      patchGroup(id, empty);
      return empty;
    }
    patchGroup(id, { status: "running", nodeIds, startedAt: Date.now(), results: [] });
    const result = await executionEngine.executeNodes(nodeIds, {
      ...options,
      source: "group-run",
      allowVideoGeneration: options.allowVideoGeneration === true,
    });
    const execution = { status: result.status, nodeIds, finishedAt: Date.now(), results: result.results || [] };
    patchGroup(id, execution);
    return execution;
  }

  return { runGroup };
}
```

- [ ] **Step 4: Add event bridge**

Create `modules/workflows/groupExecutionEvents.js`:

```js
import appStore from "../../src/core/stores/appStore.js";
import { createCanvasExecutionEngine } from "./canvasExecutionEngine.js";
import { createGroupRuntime } from "./groupRuntime.js";

const runtime = createGroupRuntime({
  graphStore: appStore,
  executionEngine: createCanvasExecutionEngine({ graphStore: appStore }),
});

window.addEventListener("workflow:execute-group", async (event) => {
  const groupId = String(event?.detail?.groupId || "").trim();
  if (!groupId) return;
  try {
    const result = await runtime.runGroup(groupId, { allowVideoGeneration: event?.detail?.allowVideoGeneration === true });
    if (result.status === "blocked") {
      window.showToast?.("整组执行已停止：视频生成需要授权", "warn");
      return;
    }
    window.showToast?.(`整组执行完成：${result.nodeIds.length} 个节点`, "success");
  } catch (error) {
    window.showToast?.(error?.message || "整组执行失败", "error");
  }
});
```

Add the script include after `main.js` in `index.html`:

```html
<script type="module" src="./modules/workflows/groupExecutionEvents.js?v=2026060701"></script>
```

- [ ] **Step 5: Replace the disabled group-run toast**

In `components/GroupNode.js`, replace the run button handler equivalent to:

```js
window.showToast?.("整组执行功能暂未开放", "warn");
```

with:

```js
window.dispatchEvent(
  new CustomEvent("workflow:execute-group", {
    detail: {
      source: "GroupNode",
      groupId: this._data.id,
      allowVideoGeneration: false,
    },
  })
);
```

The hardcoded `allowVideoGeneration: false` preserves the video gate for the button path. A separate explicit authorization flow can call the event with `true`.

- [ ] **Step 6: Run group tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test modules\workflows\groupRuntime.test.js modules\workflows\canvasExecutionEngine.test.js
```

Expected: PASS.

---

### Task 8: Upstream Toolbar Action For Video-To-Storyboard-Script

**Files:**
- Create: `components/nodeToolbar/storyboardScriptAction.js`
- Create: `components/nodeToolbar/storyboardScriptAction.test.js`
- Modify: `components/nodeToolbar/videoToolbarHtml.js`
- Modify: `components/nodeToolbar/videoToolbar.js`

- [ ] **Step 1: Copy upstream toolbar action**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptAction.js' -Destination 'components\nodeToolbar\storyboardScriptAction.js' -Force
```

Adapt imports:

```js
// "../../core/math.js" -> "../../src/core/math.js"
// "../../core/storyboardScriptFactory.js" -> "../../src/core/storyboardScriptFactory.js"
// "../../core/stores/appStore.js" -> "../../src/core/stores/appStore.js"
// "../../modules/history.js" -> "../../modules/history.js"
// "../../modules/nodeSpawn.js" -> "../../modules/nodeSpawn.js"
```

- [ ] **Step 2: Add toolbar action test**

Create `components/nodeToolbar/storyboardScriptAction.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { createConnectedStoryboardScriptNode } from "./storyboardScriptAction.js";

test("createConnectedStoryboardScriptNode creates a storyboard-script node from a video source", () => {
  const added = [];
  const selected = [];
  const edges = [];
  const result = createConnectedStoryboardScriptNode({
    sourceNodeId: "video-1",
    storeInstance: {
      getStateRaw: () => ({ nodes: { "video-1": { id: "video-1", type: "source-video", x: 0, y: 0, width: 320, height: 180 } } }),
      addNode: (node) => added.push(node),
      setSelectedNodes: (ids) => selected.push(...ids),
    },
    addEdgeWithPolicies: ({ sourceId, targetId }) => {
      edges.push({ sourceId, targetId });
      return { id: "edge-1" };
    },
    isValidConnectionFn: () => true,
    commit: () => {},
    generateId: () => "storyboard-script-1",
    calcSafeSpawnPosNearNode: () => ({ x: 420, y: 0 }),
  });

  assert.equal(result.ok, true);
  assert.equal(added[0].type, "storyboard-script");
  assert.equal(added[0].prompt.includes("视频"), true);
  assert.deepEqual(selected, ["storyboard-script-1"]);
  assert.deepEqual(edges, [{ sourceId: "video-1", targetId: "storyboard-script-1" }]);
});
```

- [ ] **Step 3: Run toolbar action test**

Run:

```powershell
& 'D:/Aic/node.exe' --test components\nodeToolbar\storyboardScriptAction.test.js
```

Expected: PASS.

- [ ] **Step 4: Wire the toolbar button only where video toolbar supports it**

In `components/nodeToolbar/videoToolbarHtml.js`, add a toolbar item to `VIDEO_TOOLBAR_HTML`:

```js
createToolbarIconButton({
  action: "storyboard-script",
  tooltip: "生成分镜脚本",
  label: "分镜脚本",
  iconSvg:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16"/><path d="M3 9h18"/><path d="M3 14h18"/></svg>',
}),
```

In `components/nodeToolbar/videoToolbar.js`, import and bind the action:

```js
import { bindStoryboardScriptToolbarAction } from "./storyboardScriptAction.js";

bindStoryboardScriptToolbarAction({
  toolbarEl,
  nodeData,
});
```

Use the actual local function names when binding inside `bindVideoToolbarEvents(toolbarEl, nodeData)`. In the current obfuscated local file this corresponds to `bindVideoToolbarEvents(_0x5cf224, _0x3ab006)`, so the concrete call can be:

```js
bindStoryboardScriptToolbarAction({
  toolbarEl: _0x5cf224,
  nodeData: _0x3ab006,
});
```

Keep the button absent from `storyboard_director`; this is a video-node toolbar action, not an assistant skill trigger.

---

### Task 9: Regression And Manual Smoke Verification

**Files:**
- No new files.
- Test commands exercise all created and modified modules.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test directorStageEntry.test.js storyboardScriptRegistration.test.js src\core\storyboardScriptFactory.test.js src\core\storyboardScriptGeneration.test.js src\core\storyboardScriptMaterialize.test.js modules\workflows\canvasExecutionEngine.test.js modules\workflows\groupRuntime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js components\nodeToolbar\storyboardScriptAction.test.js
```

Expected: all listed tests PASS.

- [ ] **Step 2: Run existing canvas and assistant regressions**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 indexEncoding.test.js src\core\persistentGenerationError.test.js modules\assistant\canvasSkills\generationStateMapper.test.js modules\assistant\canvasSkills\generationTaskBridge.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasSkills.integration.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\settings\apiSettings.test.js
```

Expected: PASS. If a test fails, inspect whether the failure is due to changed skill manifest IDs, node labels, or execution statuses; fix the local behavior and rerun the same command.

- [ ] **Step 3: Manual smoke checklist**

Open the app through the existing local dev/start flow, then verify:

```text
1. Add-node menu shows 3D导演台 without dev mode.
2. Dragging 3D导演台 creates a panorama-scene node whose visible title is 3D导演台.
3. Existing panorama-scene project data still opens.
4. Add-node menu shows 分镜脚本.
5. Dragging 分镜脚本 creates a storyboard-script node and does not alter storyboard_director skill config.
6. Storyboard-script can render rows, edit a cell, switch list/card view, and export CSV.
7. Storyboard-script image materialization creates ai-image draft nodes.
8. Storyboard-script video materialization creates ai-video prep nodes but does not start generation.
9. Assistant workflow.executeSelectedNodes can run selected ai-text/ai-image nodes.
10. Group run button executes child ai-text/ai-image nodes via the execution engine.
11. Group run blocks ai-video generation and shows an authorization warning.
```

Expected: every item is true before implementation is considered complete.

---

## Risk Controls

- **Upstream import drift:** Copy upstream isolated files first, then rewrite imports to Huanying paths. Do not pull missing upstream subsystems unless a focused adapter cannot satisfy the dependency.
- **Obfuscated local files:** Prefer tests that validate visible behavior. Patch small string/import/registry areas instead of reformatting entire obfuscated files.
- **Storyboard naming collision:** Keep `storyboard_director` only in `config/assistant-skills/storyboard_director.json`; keep node type `storyboard-script` only in node registry/meta/component paths.
- **Video gate regression:** Tests must prove `ai-video` prep nodes are created without `generationStatus`, `autoGenerate`, or generation runner calls unless authorization is explicit.
- **Group-run overreach:** Group execution collects direct `parentId === groupId` children only; dynamic group input/output ports remain separate from the first working group execution path.

## Self-Review

- **Spec coverage:** 3D director stage visibility is covered by Task 1; `storyboard-script` migration and non-conflict with `storyboard_director` are covered by Tasks 2, 3, and 8; execution engine before group run is covered by Tasks 5 and 7; video authorization gate is covered by Tasks 4, 5, 6, 7, and 9.
- **Placeholder scan:** This plan does not contain disallowed planning placeholders such as missing task details, empty implementation steps, or unspecified tests. Each task has exact files, commands, expected outcomes, and concrete code or copy/adaptation instructions.
- **Type consistency:** The plan consistently uses node type `storyboard-script`, skill id prefix `workflow.execute*`, group event `workflow:execute-group`, gate reason `video_generation_requires_authorization`, and compatibility node type `panorama-scene`.
- **Execution order:** The sequence is safe: visible 3D entry, storyboard core, storyboard UI registration, materialization, execution engine, assistant skills, group run, toolbar action, then full regression.
