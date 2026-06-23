# Upstream-First Director / Storyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate upstream 3D Director stage and Storyboard Script capabilities into Huanying using upstream source first, while excluding group/selected execution unless it is proven necessary for Director or Storyboard upstream interactions.

**Architecture:** Treat `output\upstream\AI-CanvasPro` as the source of truth. Copy isolated upstream files with import-path adaptation, patch compact local entry files minimally, and keep old `storyboard`, new `storyboard-script`, and assistant `storyboard_director` separate. Director stage is a calibration task because local `panorama-scene` defaults already match upstream; Storyboard Script is a dependency-closure migration.

**Tech Stack:** Browser ES modules, Node.js test runner (`D:\Aic\node.exe --test`), PowerShell, local CodeGraph CLI, existing Huanying canvas store/renderer/services.

**Inputs:**
- Product plan: `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\specs\2026-06-08-upstream-first-director-storyboard-product-plan.md`
- Upstream-first design: `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\specs\2026-06-08-upstream-first-director-storyboard-design.md`
- Upstream source: `D:\Aic\huanying-source-windows-20260430-122116\output\upstream\AI-CanvasPro`

**Do not modify:** `D:\Aic\huanying-source-windows-20260430-122116\docs\superpowers\plans\2026-06-07-huanying-director-storyboard-workflow-migration.md`

---

## Execution Rules

1. **Upstream first:** Copy/adapt upstream source before writing local code.
2. **No custom execution engine:** Do not create `modules\workflows\canvasExecutionEngine.js`, `modules\workflows\groupRuntime.js`, or `modules\workflows\groupExecutionEvents.js`.
3. **Group/selected run gate:** Do not add `modules\groupExecution.js` unless a failing Director/Storyboard interaction proves it is required. If needed, copy upstream `output\upstream\AI-CanvasPro\src\modules\groupExecution.js` only.
4. **Keep identities separate:** `storyboard` node, `storyboard-script` node, and `storyboard_director` assistant skill remain separate.
5. **Patch compact files minimally:** Do not wholesale overwrite `main.js`, `index.html`, `src\core\interaction.js`, `modules\interaction\EdgeController.js`, `components\GroupNode.js`, or local Director files.
6. **Verification replaces commits:** The workspace Git metadata is not healthy. Each task ends with verification commands instead of commit commands.
7. **Encoding caution:** Preserve UTF-8 Chinese labels in source and tests. Use `D:\Aic\node.exe` for JS validation.

---

## File Map

### Copy From Upstream

| Local file | Upstream source | Responsibility | Adaptation |
| --- | --- | --- | --- |
| `src\core\storyboardScriptFactory.js` | `output\upstream\AI-CanvasPro\src\core\storyboardScriptFactory.js` | Storyboard node type, defaults, columns, row normalization, CSV, canonical JSON | Copy unchanged |
| `src\core\storyboardScriptGeneration.js` | `output\upstream\AI-CanvasPro\src\core\storyboardScriptGeneration.js` | Text/image/video prompt builders and generation-result normalization | Copy unchanged |
| `components\StoryboardScriptNode.js` | `output\upstream\AI-CanvasPro\src\components\StoryboardScriptNode.js` | Storyboard UI and interactions | Copy with import-path adaptation |
| `components\nodeToolbar\storyboardScriptAction.js` | `output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptAction.js` | Video toolbar action that creates connected Storyboard Script nodes | Copy with import-path adaptation |
| `components\nodeToolbar\storyboardScriptToolbarIcon.js` | `output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptToolbarIcon.js` | Toolbar icon | Copy unchanged |
| `styles\storyboard-script-node.css` | `output\upstream\AI-CanvasPro\styles\storyboard-script-node.css` | Storyboard Script visual behavior | Copy unchanged |
| `styles\panorama-scene-node.css` | `output\upstream\AI-CanvasPro\styles\panorama-scene-node.css` | Director node styling | Copy unchanged |
| `styles\panorama-scene-toolbar.css` | `output\upstream\AI-CanvasPro\styles\panorama-scene-toolbar.css` | Director toolbar styling | Copy unchanged |
| `styles\panorama-scene-popover.css` | `output\upstream\AI-CanvasPro\styles\panorama-scene-popover.css` | Director popover styling | Copy unchanged |

### Copy Missing Storyboard Dependencies

These are required by upstream `StoryboardScriptNode.js` and are currently missing locally.

| Local file | Upstream source | Adaptation |
| --- | --- | --- |
| `src\core\generationTaskRuntime.js` | `output\upstream\AI-CanvasPro\src\core\generationTaskRuntime.js` | Copy; resolve follow-on missing imports by upstream copy |
| `src\core\generationTaskUiState.js` | `output\upstream\AI-CanvasPro\src\core\generationTaskUiState.js` | Copy unchanged |
| `manifests\index.js` | `output\upstream\AI-CanvasPro\src\manifests\index.js` | Copy to root-level `manifests` so `../manifests/index.js` from `components` resolves |
| `manifests\modelRegistry.js` and manifest subfolders | `output\upstream\AI-CanvasPro\src\manifests\...` | Copy the full upstream manifest tree as a hard baseline; do not treat this as optional fallback |
| `modules\modelInputPolicy.js` | `output\upstream\AI-CanvasPro\src\modules\modelInputPolicy.js` | Copy; keep manifest imports resolving to root-level `manifests` |
| `modules\previewGenerateButtonUi.js` | `output\upstream\AI-CanvasPro\src\modules\previewGenerateButtonUi.js` | Copy unchanged after path check |
| `services\canvasMediaLocalService.js` | `output\upstream\AI-CanvasPro\src\services\canvasMediaLocalService.js` | Copy; rewrite `../utils/localMediaPath.js` to `../src/utils/localMediaPath.js` |
| `src\utils\localMediaPath.js` | `output\upstream\AI-CanvasPro\src\utils\localMediaPath.js` | Copy unchanged |
| `api\storyboardVideoFrameApi.js` | `output\upstream\AI-CanvasPro\api\storyboardVideoFrameApi.js` | Copy unchanged; imports existing `api\apiBase.js` |
| `components\aigenImage\defaults.js` | `output\upstream\AI-CanvasPro\src\components\aigenImage\defaults.js` | Copy unchanged |
| `components\aigenImage\uiModuleModelHelpers.js` | `output\upstream\AI-CanvasPro\src\components\aigenImage\uiModuleModelHelpers.js` | Copy with import-path check |
| `components\aigenImage\uiSchemaRenderer.js` | `output\upstream\AI-CanvasPro\src\components\aigenImage\uiSchemaRenderer.js` | Copy with import-path check |
| `components\aigenText\apimartTextModelMenu.js` | `output\upstream\AI-CanvasPro\src\components\aigenText\apimartTextModelMenu.js` | Copy with import-path check |
| `components\aigenText\nodeResizeUi.js` | `output\upstream\AI-CanvasPro\src\components\aigenText\nodeResizeUi.js` | Copy with import-path check |
| `components\shared\nodeFooterControls.js` | `output\upstream\AI-CanvasPro\src\components\shared\nodeFooterControls.js` | Copy unchanged |
| `components\sharedPromptPanel.js` | `output\upstream\AI-CanvasPro\src\components\sharedPromptPanel.js` | Copy with import-path check |

### Patch Existing Local Files

| Local file | Patch responsibility |
| --- | --- |
| `index.html` | Load upstream CSS; add visible `storyboard-script` entry if active menu needs it; keep `panorama-scene` visible |
| `main.js` | Import/register `StoryboardScriptNode`; keep `storyboard` and `panorama-scene` registrations |
| `modules\nodeMeta.js` | Add upstream `storyboard-script` metadata and alias `storyboard_script`; keep existing metadata |
| `src\core\interaction.js` | Add upstream Storyboard Script add-node/context/drop handling around existing creation paths |
| `modules\interaction\EdgeController.js` | Add upstream Storyboard Script side-plus / edge target behavior |
| `components\nodeToolbar\videoToolbarHtml.js` | Add upstream `storyboard-script` toolbar button and icon import |
| `components\nodeToolbar\videoToolbar.js` | Bind upstream `bindStoryboardScriptToolbarAction()` |

### Compact-File Patch Preflight Gates

Before patching any compact local file, validate the exact locator anchors and stop for inspection if any anchor is missing. Do not blind-patch or wholesale overwrite these files.

| File | Required locator anchors |
| --- | --- |
| `main.js` | `StoryboardNode`, `PanoramaSceneNode`, `NODE_COMPONENTS`, `'storyboard': StoryboardNode`, `'panorama-scene': PanoramaSceneNode` |
| `index.html` | `style.css`, existing `data-type="panorama-scene"` add-node entry, add-node menu container for sibling buttons |
| `src\core\interaction.js` | `createPanoramaSceneNodeData`, `createNodeByType`, existing add-node item/catalog blocks, generic node fallback |
| `modules\interaction\EdgeController.js` | `createPanoramaSceneNodeData`, side-plus/add-edge target catalog, target node creation branch, allowed source/target checks |
| `components\nodeToolbar\videoToolbarHtml.js` | `createToolbarIconButton`, existing video toolbar button pool, existing toolbar action attributes |
| `components\nodeToolbar\videoToolbar.js` | existing `bind...Action` imports, toolbar binding setup, shared toolbar context variable |
| `modules\nodeMeta.js` | exported node metadata map/object, existing `storyboard` or media-node metadata entries |

Run this locator script before Task 6, Task 7, and Task 8 patches:

```powershell
$checks = @{
  'main.js' = @('StoryboardNode', 'PanoramaSceneNode', 'NODE_COMPONENTS', "'storyboard': StoryboardNode", "'panorama-scene': PanoramaSceneNode")
  'index.html' = @('style.css', 'data-type="panorama-scene"')
  'src\core\interaction.js' = @('createPanoramaSceneNodeData', 'createNodeByType')
  'modules\interaction\EdgeController.js' = @('createPanoramaSceneNodeData')
  'components\nodeToolbar\videoToolbarHtml.js' = @('createToolbarIconButton')
  'components\nodeToolbar\videoToolbar.js' = @('bind', 'toolbar')
  'modules\nodeMeta.js' = @('storyboard')
}
$missing = @()
foreach ($file in $checks.Keys) {
  $text = Get-Content -LiteralPath $file -Raw -Encoding UTF8
  foreach ($anchor in $checks[$file]) {
    if (-not $text.Contains($anchor)) { $missing += "${file}: $anchor" }
  }
}
if ($missing.Count) { $missing | ForEach-Object { Write-Host $_ }; exit 1 }
Write-Host 'compact-file anchors verified'
```

---

## Task 1: Baseline Guards and Product Tests

**Files:**
- Create: `upstreamDirectorStoryboardProduct.test.js`
- Create: `upstreamScopeGuard.test.js`

- [ ] **Step 1: Create failing product tests**

Create `upstreamDirectorStoryboardProduct.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("./", import.meta.url);
const rootPath = new URL(".", import.meta.url).pathname;
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("director and storyboard product entries are visible and distinct", () => {
  const indexHtml = read("./index.html");
  assert.match(indexHtml, /data-type=["']panorama-scene["']/);
  assert.match(indexHtml, /3D导演台/);
  assert.match(indexHtml, /data-type=["']storyboard-script["']/);
  assert.match(indexHtml, /分镜脚本/);
  assert.doesNotMatch(indexHtml, /storyboard_director/);
});

test("upstream CSS files are loaded by index.html", () => {
  const indexHtml = read("./index.html");
  assert.match(indexHtml, /panorama-scene-node\.css/);
  assert.match(indexHtml, /panorama-scene-toolbar\.css/);
  assert.match(indexHtml, /panorama-scene-popover\.css/);
  assert.match(indexHtml, /storyboard-script-node\.css/);
});

test("main registry keeps old storyboard and adds storyboard-script", () => {
  const mainJs = read("./main.js");
  assert.match(mainJs, /StoryboardNode/);
  assert.match(mainJs, /StoryboardScriptNode/);
  assert.match(mainJs, /["']storyboard["']\s*:\s*StoryboardNode/);
  assert.match(mainJs, /["']storyboard-script["']\s*:\s*StoryboardScriptNode/);
  assert.match(mainJs, /["']panorama-scene["']\s*:\s*PanoramaSceneNode/);
});

test("node meta knows storyboard-script without touching assistant skill", () => {
  const nodeMeta = read("./modules/nodeMeta.js");
  const assistantSkill = read("./config/assistant-skills/storyboard_director.json");
  assert.match(nodeMeta, /["']storyboard-script["']/);
  assert.match(nodeMeta, /storyboard_script/);
  assert.doesNotMatch(nodeMeta, /storyboard_director/);
  assert.match(assistantSkill, /storyboard_director/);
});

test("expected upstream-backed files exist locally", () => {
  for (const path of [
    "src/core/storyboardScriptFactory.js",
    "src/core/storyboardScriptGeneration.js",
    "components/StoryboardScriptNode.js",
    "components/nodeToolbar/storyboardScriptAction.js",
    "components/nodeToolbar/storyboardScriptToolbarIcon.js",
    "styles/storyboard-script-node.css",
    "styles/panorama-scene-node.css",
    "styles/panorama-scene-toolbar.css",
    "styles/panorama-scene-popover.css"
  ]) {
    assert.equal(existsSync(join(rootPath, path)), true, `${path} should exist`);
  }
});
```

Create `upstreamScopeGuard.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rootPath = new URL(".", import.meta.url).pathname;
const readIfExists = (path) => existsSync(join(rootPath, path)) ? readFileSync(join(rootPath, path), "utf8") : "";

test("custom workflow execution engine is not reintroduced", () => {
  assert.equal(existsSync(join(rootPath, "modules/workflows/canvasExecutionEngine.js")), false);
  assert.equal(existsSync(join(rootPath, "modules/workflows/groupRuntime.js")), false);
  assert.equal(existsSync(join(rootPath, "modules/workflows/groupExecutionEvents.js")), false);
});

test("group execution is not in the baseline unless explicitly copied from upstream", () => {
  const groupExecutionPath = join(rootPath, "modules/groupExecution.js");
  if (!existsSync(groupExecutionPath)) {
    assert.equal(true, true);
    return;
  }
  const content = readFileSync(groupExecutionPath, "utf8");
  assert.match(content, /executeGroupGenerateButtons/);
  assert.match(content, /executeSelectedGenerateButtons/);
  assert.match(content, /\.prompt-submit\.img-gen-btn/);
  assert.doesNotMatch(content, /canvasExecutionEngine|groupRuntime|workflow:execute-group/);
});

test("known custom execution tokens stay absent from baseline files", () => {
  const files = [
    "main.js",
    "components/GroupNode.js",
    "modules/assistant/assistantCanvasWorkflowSkills.js",
    "modules/assistant/assistantCanvasSkillExecutor.js"
  ];
  for (const file of files) {
    const content = readIfExists(file);
    assert.doesNotMatch(content, /canvasExecutionEngine|groupRuntime|workflow:execute-group|video_generation_requires_authorization/);
  }
});
```

- [ ] **Step 2: Run tests to verify baseline**

Run:

```powershell
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js upstreamScopeGuard.test.js
```

Expected before implementation: `upstreamDirectorStoryboardProduct.test.js` fails for missing Storyboard Script registration/files/CSS; `upstreamScopeGuard.test.js` passes after rollback.

- [ ] **Step 3: Record CodeGraph state**

Run:

```powershell
codegraph status .
```

Expected: index is up to date. If MCP CodeGraph reports `Transport closed`, use CLI serially.

---

## Task 2: Director Stage Calibration

**Files:**
- Create: `styles\panorama-scene-node.css`
- Create: `styles\panorama-scene-toolbar.css`
- Create: `styles\panorama-scene-popover.css`
- Modify: `index.html`

- [ ] **Step 1: Copy upstream Director CSS**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\styles\panorama-scene-node.css' -Destination 'styles\panorama-scene-node.css' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\styles\panorama-scene-toolbar.css' -Destination 'styles\panorama-scene-toolbar.css' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\styles\panorama-scene-popover.css' -Destination 'styles\panorama-scene-popover.css' -Force
```

- [ ] **Step 2: Load Director CSS in `index.html`**

Add these links next to existing stylesheet links:

```html
<link rel="stylesheet" href="./styles/panorama-scene-node.css">
<link rel="stylesheet" href="./styles/panorama-scene-toolbar.css">
<link rel="stylesheet" href="./styles/panorama-scene-popover.css">
```

- [ ] **Step 3: Confirm Director defaults remain upstream-compatible**

Run:

```powershell
@'
const pathToFileUrl = p => new URL('file:///' + p.replace(/\\/g,'/'));
const root = 'D:\\Aic\\huanying-source-windows-20260430-122116';
const up = await import(pathToFileUrl(root + '\\output\\upstream\\AI-CanvasPro\\src\\modules\\panoramaSceneNode\\sceneNode.js'));
const local = await import(pathToFileUrl(root + '\\modules\\panoramaSceneNode\\sceneNode.js'));
const a = up.createPanoramaSceneNodeData({ id: 'scene', x: 1, y: 2 });
const b = local.createPanoramaSceneNodeData({ id: 'scene', x: 1, y: 2 });
if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error(JSON.stringify({ upstream: a, local: b }, null, 2));
  process.exit(1);
}
console.log('panorama-scene defaults match upstream');
'@ | & 'D:\Aic\node.exe' --input-type=module -
```

Expected: `panorama-scene defaults match upstream`.

- [ ] **Step 4: Run focused syntax checks**

Run:

```powershell
& 'D:\Aic\node.exe' --check components\PanoramaSceneNode.js
& 'D:\Aic\node.exe' --check modules\panoramaSceneNode\sceneNode.js
& 'D:\Aic\node.exe' --check modules\panoramaSceneNode\sceneNodeActions.js
```

Expected: all checks exit `0`.

---

## Task 3: Copy Storyboard Core Factories and Generation Logic

**Files:**
- Create: `src\core\storyboardScriptFactory.js`
- Create: `src\core\storyboardScriptGeneration.js`
- Create: `storyboardScriptUpstreamFactory.test.js`

- [ ] **Step 1: Copy upstream core files**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\storyboardScriptFactory.js' -Destination 'src\core\storyboardScriptFactory.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\storyboardScriptGeneration.js' -Destination 'src\core\storyboardScriptGeneration.js' -Force
```

- [ ] **Step 2: Create upstream factory behavior test**

Create `storyboardScriptUpstreamFactory.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  STORYBOARD_SCRIPT_NODE_TYPE,
  STORYBOARD_SCRIPT_DEFAULT_NAME,
  STORYBOARD_SCRIPT_DEFAULT_SIZE,
  STORYBOARD_SCRIPT_COLUMNS,
  createStoryboardScriptNodeData,
  createDefaultStoryboardScriptState,
  serializeStoryboardScriptRowsToCsv
} from "./src/core/storyboardScriptFactory.js";
import {
  STORYBOARD_SCRIPT_GENERATION_SCHEMA_VERSION,
  buildStoryboardScriptTextOnlyPrompt,
  buildStoryboardScriptImagePrompt,
  buildStoryboardScriptVideoPrompt,
  normalizeStoryboardScriptGenerationResult
} from "./src/core/storyboardScriptGeneration.js";

test("storyboard script factory exposes upstream node defaults", () => {
  assert.equal(STORYBOARD_SCRIPT_NODE_TYPE, "storyboard-script");
  assert.equal(STORYBOARD_SCRIPT_DEFAULT_NAME, "分镜脚本");
  assert.deepEqual(STORYBOARD_SCRIPT_DEFAULT_SIZE, { width: 1024, height: 576 });
  assert.deepEqual(STORYBOARD_SCRIPT_COLUMNS.map((column) => column.key), [
    "镜号", "时长", "景别", "场景", "画面描述", "角色", "角色描述", "角色动作", "情绪", "角色图", "参考", "图片提示词", "视频提示词", "对白", "音效"
  ]);
});

test("createStoryboardScriptNodeData creates normalized upstream state", () => {
  const node = createStoryboardScriptNodeData({ id: "story-1", x: 10, y: 20 });
  assert.equal(node.type, "storyboard-script");
  assert.equal(node.name, "分镜脚本");
  assert.equal(node.width, 1024);
  assert.equal(node.height, 576);
  assert.equal(node.storyboardScript.version, 1);
  assert.equal(node.storyboardScript.viewMode, "list");
  assert.equal(node.storyboardScript.mediaMode, "image");
  assert.match(node.storyboardScript.canonicalJson, /storyboard-script\.v1/);
});

test("default storyboard state and csv serialization use upstream schema", () => {
  const state = createDefaultStoryboardScriptState();
  assert.equal(state.version, 1);
  assert.equal(state.detectedIntent.shotCount, 0);
  const csv = serializeStoryboardScriptRowsToCsv([{ "镜号": "1", "图片提示词": "cinematic frame", "视频提示词": "slow dolly" }]);
  assert.match(csv, /^﻿?镜号,时长,景别,场景,画面描述,角色,角色描述,角色动作,情绪,角色图,参考,图片提示词,视频提示词,对白,音效/);
  assert.match(csv, /cinematic frame/);
  assert.match(csv, /slow dolly/);
});

test("generation module exposes upstream schema and prompt builders", () => {
  assert.equal(STORYBOARD_SCRIPT_GENERATION_SCHEMA_VERSION, "storyboard-script.v1");
  assert.match(buildStoryboardScriptTextOnlyPrompt("一个女孩在雨夜奔跑"), /用户输入/);
  assert.match(buildStoryboardScriptImagePrompt("根据图片拆分镜"), /参考图片/);
  assert.match(buildStoryboardScriptVideoPrompt("根据视频拆分镜"), /参考视频/);
});

test("generation result normalizes rows into storyboard-script schema", () => {
  const result = normalizeStoryboardScriptGenerationResult({
    schemaVersion: "storyboard-script.v1",
    title: "测试",
    detectedIntent: { shotCount: 1 },
    rows: [{ "镜号": "1", "画面描述": "主角回头", "图片提示词": "close up" }]
  });
  assert.equal(result.title, "测试");
  assert.equal(result.detectedIntent.shotCount, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["镜号"], "1");
});
```

- [ ] **Step 3: Run tests**

Run:

```powershell
& 'D:\Aic\node.exe' --check src\core\storyboardScriptFactory.js
& 'D:\Aic\node.exe' --check src\core\storyboardScriptGeneration.js
& 'D:\Aic\node.exe' --test storyboardScriptUpstreamFactory.test.js
```

Expected: all checks and tests pass.

---

## Task 4: Copy Storyboard Dependency Closure

**Files:**
- Create/copy all files listed in "Copy Missing Storyboard Dependencies"
- Create: `storyboardScriptDependencyClosure.test.js`

- [ ] **Step 1: Copy missing upstream dependency files**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'src\core','src\utils','manifests','modules','services','api','components\aigenImage','components\aigenText','components\shared' | Out-Null
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\generationTaskRuntime.js' -Destination 'src\core\generationTaskRuntime.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\core\generationTaskUiState.js' -Destination 'src\core\generationTaskUiState.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\utils\localMediaPath.js' -Destination 'src\utils\localMediaPath.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\modules\modelInputPolicy.js' -Destination 'modules\modelInputPolicy.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\modules\previewGenerateButtonUi.js' -Destination 'modules\previewGenerateButtonUi.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\services\canvasMediaLocalService.js' -Destination 'services\canvasMediaLocalService.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\api\storyboardVideoFrameApi.js' -Destination 'api\storyboardVideoFrameApi.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\aigenImage\defaults.js' -Destination 'components\aigenImage\defaults.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\aigenImage\uiModuleModelHelpers.js' -Destination 'components\aigenImage\uiModuleModelHelpers.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\aigenImage\uiSchemaRenderer.js' -Destination 'components\aigenImage\uiSchemaRenderer.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\aigenText\apimartTextModelMenu.js' -Destination 'components\aigenText\apimartTextModelMenu.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\aigenText\nodeResizeUi.js' -Destination 'components\aigenText\nodeResizeUi.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\shared\nodeFooterControls.js' -Destination 'components\shared\nodeFooterControls.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\sharedPromptPanel.js' -Destination 'components\sharedPromptPanel.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\manifests\*' -Destination 'manifests' -Recurse -Force
```

This full manifest-tree copy is a required upstream baseline, not a fallback. It keeps `manifests\index.js`, `manifests\modelRegistry.js`, and all model subfolders consistent with upstream runtime imports.

- [ ] **Step 2: Apply known import-path rewrites**

Run:

```powershell
@'
from pathlib import Path
root = Path(r"D:\Aic\huanying-source-windows-20260430-122116")
rewrites = {
    "services/canvasMediaLocalService.js": {
        "../utils/localMediaPath.js": "../src/utils/localMediaPath.js"
    },
    "components/sharedPromptPanel.js": {
        "../core/": "../src/core/",
        "../utils/": "../src/utils/"
    },
    "components/aigenImage/uiModuleModelHelpers.js": {
        "../../utils/": "../../src/utils/"
    },
    "components/aigenImage/uiSchemaRenderer.js": {
        "../../utils/": "../../src/utils/"
    }
}
for rel, mapping in rewrites.items():
    path = root / rel
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    for src, dst in mapping.items():
        text = text.replace(src, dst)
    path.write_text(text, encoding="utf-8")
    print(f"adapted {rel}")
'@ | python -
```

- [ ] **Step 3: Create dependency closure test**

Create `storyboardScriptDependencyClosure.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, normalize } from "node:path";

const rootPath = new URL(".", import.meta.url).pathname;
const requiredFiles = [
  "src/core/generationTaskRuntime.js",
  "src/core/generationTaskUiState.js",
  "manifests/index.js",
  "modules/modelInputPolicy.js",
  "modules/previewGenerateButtonUi.js",
  "services/canvasMediaLocalService.js",
  "src/utils/localMediaPath.js",
  "api/storyboardVideoFrameApi.js",
  "components/aigenImage/defaults.js",
  "components/aigenImage/uiModuleModelHelpers.js",
  "components/aigenImage/uiSchemaRenderer.js",
  "components/aigenText/apimartTextModelMenu.js",
  "components/aigenText/nodeResizeUi.js",
  "components/shared/nodeFooterControls.js",
  "components/sharedPromptPanel.js"
];

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const resolved = normalize(join(dirname(join(rootPath, fromFile)), specifier));
  if (existsSync(resolved)) return resolved;
  if (existsSync(`${resolved}.js`)) return `${resolved}.js`;
  return resolved;
}

function collectImports(file) {
  const content = readFileSync(join(rootPath, file), "utf8");
  return [...content.matchAll(/import(?:[^"']+from)?["']([^"']+)["']/g)].map((match) => match[1]);
}

test("storyboard upstream dependency files exist", () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(join(rootPath, file)), true, `${file} should exist`);
  }
});

test("StoryboardScriptNode relative imports resolve locally", () => {
  const files = [
    "components/StoryboardScriptNode.js",
    "components/nodeToolbar/storyboardScriptAction.js",
    "services/canvasMediaLocalService.js",
    "components/sharedPromptPanel.js",
    "components/aigenImage/uiModuleModelHelpers.js",
    "components/aigenImage/uiSchemaRenderer.js",
    "components/aigenText/apimartTextModelMenu.js",
    "components/aigenText/nodeResizeUi.js"
  ];
  const missing = [];
  for (const file of files) {
    for (const specifier of collectImports(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !existsSync(resolved)) {
        missing.push(`${file} -> ${specifier} -> ${resolved}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
```

- [ ] **Step 4: Run dependency syntax and closure checks**

Run:

```powershell
$files = @(
  'src\core\generationTaskRuntime.js',
  'src\core\generationTaskUiState.js',
  'modules\modelInputPolicy.js',
  'modules\previewGenerateButtonUi.js',
  'services\canvasMediaLocalService.js',
  'src\utils\localMediaPath.js',
  'api\storyboardVideoFrameApi.js',
  'components\aigenImage\defaults.js',
  'components\aigenImage\uiModuleModelHelpers.js',
  'components\aigenImage\uiSchemaRenderer.js',
  'components\aigenText\apimartTextModelMenu.js',
  'components\aigenText\nodeResizeUi.js',
  'components\shared\nodeFooterControls.js',
  'components\sharedPromptPanel.js'
)
foreach ($file in $files) { & 'D:\Aic\node.exe' --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& 'D:\Aic\node.exe' --test storyboardScriptDependencyClosure.test.js
```

Expected: all syntax checks and dependency closure tests pass. If a dependency imports another missing upstream module, copy the upstream module and add it to the test list instead of stubbing it.

---

## Task 5: Copy Storyboard Component, Action, Icon, and CSS

**Files:**
- Create: `components\StoryboardScriptNode.js`
- Create: `components\nodeToolbar\storyboardScriptAction.js`
- Create: `components\nodeToolbar\storyboardScriptToolbarIcon.js`
- Create: `styles\storyboard-script-node.css`

- [ ] **Step 1: Copy upstream Storyboard UI files**

Run:

```powershell
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\StoryboardScriptNode.js' -Destination 'components\StoryboardScriptNode.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptAction.js' -Destination 'components\nodeToolbar\storyboardScriptAction.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\src\components\nodeToolbar\storyboardScriptToolbarIcon.js' -Destination 'components\nodeToolbar\storyboardScriptToolbarIcon.js' -Force
Copy-Item -LiteralPath 'output\upstream\AI-CanvasPro\styles\storyboard-script-node.css' -Destination 'styles\storyboard-script-node.css' -Force
```

- [ ] **Step 2: Rewrite Storyboard component imports for local layout**

Run:

```powershell
@'
from pathlib import Path
root = Path(r"D:\Aic\huanying-source-windows-20260430-122116")
rewrites = {
    "components/StoryboardScriptNode.js": {
        "../core/": "../src/core/",
        "../utils/": "../src/utils/"
    },
    "components/nodeToolbar/storyboardScriptAction.js": {
        "../../core/": "../../src/core/"
    }
}
for rel, mapping in rewrites.items():
    path = root / rel
    text = path.read_text(encoding="utf-8")
    for src, dst in mapping.items():
        text = text.replace(src, dst)
    path.write_text(text, encoding="utf-8")
    print(f"adapted {rel}")
'@ | python -
```

- [ ] **Step 3: Run syntax and closure tests**

Run:

```powershell
& 'D:\Aic\node.exe' --check components\StoryboardScriptNode.js
& 'D:\Aic\node.exe' --check components\nodeToolbar\storyboardScriptAction.js
& 'D:\Aic\node.exe' --check components\nodeToolbar\storyboardScriptToolbarIcon.js
& 'D:\Aic\node.exe' --test storyboardScriptDependencyClosure.test.js
```

Expected: all pass.

---

## Task 6: Register Storyboard Script Node and CSS

**Preflight:** Run the Compact-File Patch Preflight Gates script and stop to inspect if any locator anchor is missing.

**Files:**
- Modify: `index.html`
- Modify: `main.js`
- Modify: `modules\nodeMeta.js`

- [ ] **Step 1: Update `index.html` stylesheet links**

Ensure these links exist once:

```html
<link rel="stylesheet" href="./styles/panorama-scene-node.css">
<link rel="stylesheet" href="./styles/panorama-scene-toolbar.css">
<link rel="stylesheet" href="./styles/panorama-scene-popover.css">
<link rel="stylesheet" href="./styles/storyboard-script-node.css">
```

- [ ] **Step 2: Add `分镜脚本` menu entry if missing**

Add this entry as a sibling of existing media/storyboard node buttons, not nested inside another button:

```html
<button type="button" class="nam-item" data-type="storyboard-script">
  <div class="nam-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="4" y="4" width="16" height="16" rx="2"></rect>
      <path d="M8 8h8M8 12h8M8 16h5"></path>
    </svg>
  </div>
  <span>分镜脚本</span>
</button>
```

- [ ] **Step 3: Patch `main.js` imports and registry**

Add import near other component imports:

```js
import { StoryboardScriptNode } from './components/StoryboardScriptNode.js';
```

Add to `NODE_COMPONENTS` while preserving existing `storyboard`:

```js
'storyboard-script': StoryboardScriptNode,
```

The registry must contain both:

```js
'storyboard': StoryboardNode,
'storyboard-script': StoryboardScriptNode,
```

- [ ] **Step 4: Patch `modules\nodeMeta.js`**

Add upstream-compatible metadata without removing existing types:

```js
'storyboard-script': {
  aliases: ['storyboard_script'],
  wrapperClasses: ['storyboard-script-wrapper'],
  refKind: ''
},
```

- [ ] **Step 5: Verify registration**

Run:

```powershell
& 'D:\Aic\node.exe' --check main.js
& 'D:\Aic\node.exe' --check modules\nodeMeta.js
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js
```

Expected: registration/product tests pass except interaction-specific work that is intentionally later.

---

## Task 7: Patch Canvas Creation and Edge/Side-Plus Storyboard Behavior

**Preflight:** Run the Compact-File Patch Preflight Gates script and stop to inspect if any locator anchor is missing.

**Files:**
- Modify: `src\core\interaction.js`
- Modify: `modules\interaction\EdgeController.js`

- [ ] **Step 1: Patch `src\core\interaction.js` imports**

Add upstream imports near existing factory imports:

```js
import { createStoryboardScriptNodeData, STORYBOARD_SCRIPT_DEFAULT_SIZE } from './storyboardScriptFactory.js';
```

- [ ] **Step 2: Add `storyboard-script` to add-node catalogs**

Where the hover picker/context menu builds node items, add an item equivalent to:

```js
{
  key: 'storyboard-script',
  label: '分镜脚本',
  w: STORYBOARD_SCRIPT_DEFAULT_SIZE.width,
  h: STORYBOARD_SCRIPT_DEFAULT_SIZE.height,
  desc: '输入故事、图片或视频，生成可编辑分镜脚本'
}
```

Use the existing object pattern for `panorama-scene` and `storyboard` entries. Do not gate this item behind `DEV_MODE`.

- [ ] **Step 3: Ensure creation uses upstream factory**

In every local branch that creates generic node data from a selected node type, add `storyboard-script` before generic fallback:

```js
if (type === 'storyboard-script') {
  return createStoryboardScriptNodeData({ id, x, y, width, height, name });
}
```

This must cover drag/drop, picker click, and context-menu add-node paths that support custom factories.

- [ ] **Step 4: Patch `modules\interaction\EdgeController.js` imports**

Add upstream imports:

```js
import { createStoryboardScriptNodeData, STORYBOARD_SCRIPT_DEFAULT_SIZE } from '../../src/core/storyboardScriptFactory.js';
```

- [ ] **Step 5: Add upstream Storyboard Script target behavior**

Mirror upstream behavior for `storyboard-script`:

- include `storyboard-script` in allowed input node targets,
- create target node data using `createStoryboardScriptNodeData()` when side-plus/add-edge creates a Storyboard Script target,
- keep existing `storyboard` quick-grid behavior unchanged,
- keep `panorama-360` and `panorama-scene` behavior unchanged.

Minimum allowed input list from upstream for `storyboard-script` target:

```js
['source-text', 'source-image', 'source-video', 'ai-image', 'ai-text', 'ai-video']
```

- [ ] **Step 6: Verify syntax and product tests**

Run:

```powershell
& 'D:\Aic\node.exe' --check src\core\interaction.js
& 'D:\Aic\node.exe' --check modules\interaction\EdgeController.js
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptDependencyClosure.test.js
```

Expected: all pass.

---

## Task 8: Patch Video Toolbar Storyboard Action

**Preflight:** Run the Compact-File Patch Preflight Gates script and stop to inspect if any locator anchor is missing.

**Files:**
- Modify: `components\nodeToolbar\videoToolbarHtml.js`
- Modify: `components\nodeToolbar\videoToolbar.js`
- Create: `storyboardScriptToolbarAction.upstream.test.js`

- [ ] **Step 1: Create toolbar action test**

Create `storyboardScriptToolbarAction.upstream.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createConnectedStoryboardScriptNode, VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT } from "./components/nodeToolbar/storyboardScriptAction.js";

test("video toolbar action creates a connected storyboard-script node", () => {
  const addedNodes = [];
  const addedEdges = [];
  let selected = [];
  const sourceNode = { id: "video-1", type: "source-video", x: 100, y: 200, width: 320, height: 180, name: "源视频" };
  const graphStore = {
    getState: () => ({ nodes: { "video-1": sourceNode }, edges: [] }),
    addNode: (node) => addedNodes.push(node),
    addEdge: (edge) => addedEdges.push(edge),
    setSelectedNodes: (ids) => { selected = ids; }
  };
  const created = createConnectedStoryboardScriptNode({
    sourceNode,
    graphStore,
    generateId: () => "storyboard-script-1",
    commit: () => {},
    showToast: () => {}
  });
  assert.equal(created?.id, "storyboard-script-1");
  assert.equal(addedNodes[0].type, "storyboard-script");
  assert.equal(addedNodes[0].storyboardScript.title, "分镜脚本");
  assert.deepEqual(addedEdges, [{ sourceId: "video-1", targetId: "storyboard-script-1" }]);
  assert.deepEqual(selected, ["storyboard-script-1"]);
});

test("video storyboard default prompt is descriptive and non-empty", () => {
  assert.equal(typeof VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT, "string");
  assert.ok(VIDEO_STORYBOARD_SCRIPT_DEFAULT_PROMPT.length > 10);
});
```

- [ ] **Step 2: Patch `videoToolbarHtml.js`**

Add import:

```js
import { STORYBOARD_SCRIPT_TOOLBAR_ICON_SVG } from './storyboardScriptToolbarIcon.js';
```

Add button to the existing video toolbar button pool:

```js
createToolbarIconButton({
  action: 'storyboard-script',
  tooltip: '生成分镜脚本',
  label: '分镜脚本',
  iconSvg: STORYBOARD_SCRIPT_TOOLBAR_ICON_SVG
})
```

- [ ] **Step 3: Patch `videoToolbar.js`**

Add import:

```js
import { bindStoryboardScriptToolbarAction } from './storyboardScriptAction.js';
```

Inside the existing toolbar binding setup, call:

```js
bindStoryboardScriptToolbarAction(toolbarContext);
```

Use the local variable passed to other `bind...Action()` calls.

- [ ] **Step 4: Verify toolbar behavior**

Run:

```powershell
& 'D:\Aic\node.exe' --check components\nodeToolbar\videoToolbarHtml.js
& 'D:\Aic\node.exe' --check components\nodeToolbar\videoToolbar.js
& 'D:\Aic\node.exe' --check components\nodeToolbar\storyboardScriptAction.js
& 'D:\Aic\node.exe' --test storyboardScriptToolbarAction.upstream.test.js
```

Expected: all pass.

---

## Task 9: Full Regression and Scope Verification

**Files:** Test only.

- [ ] **Step 1: Run syntax checks for all touched implementation files**

Run:

```powershell
$files = @(
  'main.js',
  'src\core\interaction.js',
  'modules\interaction\EdgeController.js',
  'modules\nodeMeta.js',
  'components\StoryboardScriptNode.js',
  'components\nodeToolbar\storyboardScriptAction.js',
  'components\nodeToolbar\storyboardScriptToolbarIcon.js',
  'components\nodeToolbar\videoToolbarHtml.js',
  'components\nodeToolbar\videoToolbar.js',
  'src\core\storyboardScriptFactory.js',
  'src\core\storyboardScriptGeneration.js',
  'src\core\generationTaskRuntime.js',
  'src\core\generationTaskUiState.js',
  'modules\modelInputPolicy.js',
  'modules\previewGenerateButtonUi.js',
  'services\canvasMediaLocalService.js',
  'src\utils\localMediaPath.js',
  'api\storyboardVideoFrameApi.js'
)
foreach ($file in $files) { & 'D:\Aic\node.exe' --check $file; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: all checks exit `0`.

- [ ] **Step 2: Run focused migration tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test upstreamDirectorStoryboardProduct.test.js upstreamScopeGuard.test.js storyboardScriptUpstreamFactory.test.js storyboardScriptDependencyClosure.test.js storyboardScriptToolbarAction.upstream.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run existing Assistant / Canvas regression tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test indexEncoding.test.js modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js
```

Expected: existing tests pass. Previous rollback baseline had `17 pass / 0 fail`; investigate any regression.

- [ ] **Step 4: Run residue scan for excluded custom scope**

Run:

```powershell
rg -n "canvasExecutionEngine|groupRuntime|groupExecutionEvents|workflow:execute-group|video_generation_requires_authorization|execute_selected_nodes|execute_group|workflowExecuteSelectedNodes|workflowExecuteGroup" -g '!output/upstream/**' -g '!.codegraph/**' -g '!node_modules/**' -g '!docs/**' .
```

Expected: no matches outside excluded paths. If `modules\groupExecution.js` was intentionally copied because of a proven dependency, this scan still must not show custom execution engine tokens.

- [ ] **Step 5: Sync CodeGraph after implementation**

Run serially:

```powershell
codegraph unlock .
codegraph sync .
codegraph status .
```

Expected: index is up to date. Use CLI because MCP CodeGraph may still report `Transport closed`.

---

## Task 10: Browser Smoke Checklist

**Files:** No planned file edits.

**Screenshot artifacts:** Save browser verification screenshots under `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\` with these required files:

- `director-stage.png`
- `storyboard-script.png`
- `video-toolbar-storyboard.png`

- [ ] **Step 1: Start local app using existing project command**

Use the project's established local server command. If a server is already running, reuse it. Record the exact URL and project id.

- [ ] **Step 2: Smoke Director stage**

Checklist:

1. Add-node picker/menu shows `3D导演台`.
2. Creating `3D导演台` produces a `panorama-scene` node.
3. The node title is `3D导演台`.
4. Existing `panorama-scene` project data opens and renders.
5. Director toolbar and popover styling are visible.
6. Enter/exit edit controls do not throw console errors.
7. Capture `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\director-stage.png`.

- [ ] **Step 3: Smoke Storyboard Script**

Checklist:

1. Add-node picker/menu shows `分镜脚本`.
2. Creating `分镜脚本` produces a `storyboard-script` node.
3. Node has `storyboardScript` state in the store.
4. Empty state renders.
5. View/media controls render.
6. Row/cell editing persists in store after edit.
7. CSV export includes upstream columns.
8. Fullscreen open/close works.
9. Capture `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\storyboard-script.png`.

- [ ] **Step 4: Smoke video toolbar action**

Checklist:

1. Add or use a `source-video` / `ai-video` node.
2. Video toolbar shows `分镜脚本` action.
3. Clicking it creates a connected `storyboard-script` node.
4. Edge direction is video source -> Storyboard Script.
5. No provider video generation starts automatically.
6. Capture `docs\reviews\artifacts\2026-06-08-upstream-first-director-storyboard\video-toolbar-storyboard.png`.

- [ ] **Step 5: Smoke scope guard**

Checklist:

1. Group node UI does not gain new custom runtime badges unless upstream dependency was explicitly added.
2. Assistant `storyboard_director` skill remains unchanged.
3. No action starts group/selected execution as part of this Storyboard/Director migration.

---

## Task 11: Final Documentation Update After Implementation

**Files:**
- Create after actual implementation: `docs\reviews\2026-06-08-upstream-first-director-storyboard-implementation-result.md`

- [ ] **Step 1: Record implementation evidence**

Create a result review document containing:

```markdown
# Upstream-First Director / Storyboard Implementation Result

## Files Changed

[List copied upstream files, patched local files, and tests.]

## Upstream Gap Decisions

[State "None" if no local self-development was required beyond glue.]

## Verification

- Syntax checks: [command summary]
- Focused tests: [pass/fail count]
- Existing regression tests: [pass/fail count]
- Residue scan: [result]
- Browser smoke: [result]
- CodeGraph status: [result]

## Residual Risks

[List any untested runtime concerns.]
```

- [ ] **Step 2: Verify the old development plan remains untouched**

Run:

```powershell
Get-Item 'docs\superpowers\plans\2026-06-07-huanying-director-storyboard-workflow-migration.md' | Select-Object FullName,Length,LastWriteTime
```

Expected: original plan remains historical and unmodified.

---

## Self-Review Checklist

- Product scope matches the reviewed product plan.
- Group/selected run is excluded unless proven necessary.
- Storyboard migration is upstream dependency closure, not local stubbing.
- Director migration is calibration and style completion, not rewrite.
- All tasks contain exact files and commands.
- No task requires editing the old 2026-06-07 plan.
- No task introduces `canvasExecutionEngine`, `groupRuntime`, or provider-level custom execution.
- Tests cover positive behavior and scope guards.
