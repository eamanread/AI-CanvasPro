# Common Prompts And Storyboard Image Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重做节点主体、不把 StoryboardScriptNode 改造成 Generate Text 的前提下，给生成文本/生成图片节点补齐“常用提示词”入口，并修复分镜脚本选择分镜生成图片时的图片模型显示、生成数量同步、MJ 控件状态和卡片编号复制。

**Architecture:** 新增两个很小的共享 seam：`modules/promptPresetPillRuntime.js` 负责 preset pill 的 UI 状态、持久化和 payload 文本解析；`modules/debugMode.js` 负责 debug 控件显示规则。生成文本、生成图片只接入这个共享 runtime；StoryboardScriptNode 主体保持上游迁移优先，只在现有尾部 wrapper 上修复图片模型 label、`batchSize`、可见禁用控件和卡片复制。

**Tech Stack:** 原生 ES modules、浏览器 DOM/Electron、Node `--test`、现有 `modules/slashMenu.js`、`modules/promptPresets.js`、`modules/promptPresetTemplate.js`、`components/aigenText/*`、`components/aigenImage/*`、`components/StoryboardScriptNode.js`。

---

## 0. 已确认需求

1. **“常用提示词”只加到生成文本和生成图片节点**
   - 内容完全复用输入框输入 `/` 后出现的预设提示词列表。
   - 常用提示词按钮打开的列表只展示 preset，不展示自定义管理入口。
   - 选择 preset 后不提交生成，只在输入框插入一个显示 `title` 的原子 pill。
   - 每个节点最多一个 preset pill；再次选择替换旧 pill。
   - pill 只能整体保留或整体删除，不能拆字编辑。
   - 按钮文案等于当前 preset `title`；删除 pill 后恢复 `常用提示词`。
   - 通过 `/` 选择 preset 也必须同步同一个按钮文案。

2. **底部操作栏布局**
   - 生成文本：文本模型选择 -> 常用提示词 -> 生成；debug/wrench 只在调试模式显示。
   - 生成图片：图片模型选择 -> 常用提示词 -> 画质 -> 比例 -> 生成数量 -> 生成；debug/wrench 只在调试模式显示。
   - 画质/比例在生成数量左侧；常用提示词在模型选择右侧。

3. **debug 显示规则**
   - 默认隐藏现有 debug/wrench 按钮。
   - 仅 `localStorage.huanyingDebugMode === "true"` 或当前 URL 含查询参数 `debug=1` 时显示。
   - Electron/hash 路由可能把 query 放在 hash 内，判断必须解析 `window.location.href`。

4. **分镜脚本选择分镜生成图片**
   - 下方图片模型选择框显示当前选中或 registry 解析出的可用/未配置状态名称，不能显示空白或泛化的 `AI`。
   - 图片模型选择逻辑必须接入生成图片节点 registry runtime；不要硬编码默认供应商/模型。
   - 生成数量选择必须同步到后续创建图片节点的 `batchSize`。
   - MJ 场景下底部按钮保持可见；不支持的控件禁用/灰显，而不是隐藏。

5. **分镜脚本卡片复制**
   - 卡片视图中点击左上角编号热区复制该卡片当前可见字段。
   - 热区比数字略大，点击后阻止进入字段编辑。
   - 复制内容按屏幕显示顺序，跳过空值。
   - 成功 toast：`已复制分镜提示词`；失败 toast：`复制失败，请手动复制`。

---

## 1. 真实代码地图

### 1.1 Prompt preset 与 slash 菜单

- `modules/promptPresetTemplate.js` 只导出 `resolvePromptPresetTemplate`，没有 `applyPromptPresetTemplate` 可导入。
- `modules/promptPresets.js` 的 `normalizePresetItem()` 会把 `value.template` 转成字符串；当前 preset template 在数据层是字符串，不要设计依赖 object template。
- `modules/slashMenu.js` 当前行为：
  - `removeSlashTriggerFromPrompt(context)` 已用 `triggerRange.deleteContents()` 删除 slash，应该复用。
  - `applyPromptPresetToPromptEl(template, context, { delayMs })` 会调用 `context.onGenerate(safeTemplate)`，这是 agent 直接执行 preset 的旧 API。
  - `modules/assistant/canvasSkills/adapters/promptPresetAdapter.js` 依赖这个旧 API，因此不能直接改掉它的提交语义。
  - 菜单事件是 `mousedown`；测试也应该用 `mousedown`。
  - `renderMenu(presets, context)` 目前会给 `ai-text`/`ai-image` 加自定义管理入口；常用提示词 picker 需要可关闭该入口。
  - `checkSlashTrigger()` 当前要求 `onGenerate` 是函数；新 UI 选择 preset 不再依赖提交函数，因此要支持 `onPresetSelected`。

### 1.2 Prompt DOM 与 sanitizer

- `src/utils/dom.js` 的 `sanitizePromptHtml()` 只对白名单的 `.ref-pill` 做特殊保留；新增 `.prompt-preset-pill` 时不要把完整 template 放入 DOM 属性。
- `modules/nodePromptShared.js` 的原子删除逻辑主要围绕 `.ref-pill`；preset pill 应该有独立 class，不要伪装成 ref pill。
- 因为 template 不进入 DOM，sanitizer 最多只需要保留 `class="prompt-preset-pill"`、`contenteditable="false"`、`data-prompt-preset-title`。payload 模板内容从 node data 读，但只有 DOM 中仍存在对应 `.prompt-preset-pill` 时才认为 selection 有效，避免删除 pill 后继续套用旧模板。

### 1.3 生成文本与生成图片 payload

- `components/aigenText/taskOrchestrationModule.js` 的 `_buildPayload(userInput)` 在没有 registry selection 时会提前回到 legacy `originalBuildPayload.call(this, userInput)`。
- `components/aigenImage/taskOrchestrationModule.js` 的 `_buildPayload(userInput)` 在 `!isRegistryImageNodeData(this._data)` 时也会提前回到 legacy。
- 因此 preset-aware user input 必须在这些 early return 之前计算，否则非 registry 路径会漏掉 preset 模板。

### 1.4 生成图片 UI seam

- `components/aigenImage/uiModule.js` 已有清晰 wrapper：`bindBatchSizeControlStoreSync(node, store, mountResult)` 和 `createAIGenerateNodeUiModule(deps).mount()`。
- 常用提示词按钮、footer reorder、debug gating 都优先在这个 wrapper 的 mount 后 DOM patch 做，避免重写混淆的 `uiModule.impl.js`。

### 1.5 生成文本 UI seam

- `components/aigenText/uiModule.js` 导出 `createAIGenTextNodeUiModule`，文件较混淆。
- 优先在导出的 factory wrapper 或 mount 后 DOM patch 增加常用提示词按钮，不做大范围重排。
- 如果某个生成文本 UI 仍走 `components/AIGenTextNode.js` 的 `_buildSharedPanel`，只加同一套 helper，不分叉行为。

### 1.6 StoryboardScriptNode seam

`components/StoryboardScriptNode.js` 尾部已有本地 wrapper，应该继续在这些 seam 上修，不改上游主体：

- `updateStoryboardScriptRegistryImagePatch(node, patch)`：图片模型字段的正确 patch helper。
- `applyStoryboardScriptRegistryImageModelSelector(node)`：接入生成图片模型选择器的入口。
- `suppressStoryboardScriptSelectionImageSchemaControls(node)`：当前会隐藏 `.ui-schema-mode-slot, .rh-adv-wrap`，与“可见但禁用”需求冲突，必须替换语义。
- `decorateStoryboardScriptGeneratedImageNode(sourceNode, nodeData)`：当前只同步 model/provider/selectedModelId/snapshot 等，必须补 `batchSize`。
- `updateStoryboardScriptRegistryPatch(node, patch)`：文本模型 helper，只适合文本 registry patch，不要用它写 `batchSize`，否则容易把 `storyboardScript` 嵌套错。
- `_createCardView()` 会创建 `.storyboard-script-shot storyboard-script-editable`，编号复制热区应只包住编号区域并阻止冒泡，避免破坏单元格编辑。

---

## 2. 非协商实现原则

- 不把 StoryboardScriptNode 主体替换为 Generate Text 或 Generate Image 的结构。
- 不把完整 preset template 存到 DOM 属性；DOM 只保存 title，template 存在 node data 的 `promptPresetSelection`。
- 不破坏 `applyPromptPresetToPromptEl()` 的 agent 直接执行语义；slash UI 和常用按钮走新的 selection runtime。
- 不硬编码图片默认模型；显示和可用性都走 `components/aigenImage/modelRegistryRuntime.js`。
- 不在混淆 UI 文件里做大段手工重写；优先新增 helper + mount 后 DOM patch。
- 不再新增或保留 Storyboard 文本缩略图 DOM hack。
- 每个行为都要先写失败验收，再写最小实现。

---

## 3. 文件职责

### 新建

- `modules/promptPresetPillRuntime.js`
  - 创建/替换/删除 preset pill。
  - 同步常用提示词按钮 label。
  - 保存 `prompt` 和 `promptPresetSelection` 到 store。
  - 从 prompt DOM 与 node data 计算最终发送文本。

- `modules/debugMode.js`
  - 暴露 `isHuanyingDebugModeEnabled({ windowRef } = {})`。
  - 支持 localStorage 与 `href` 内任意 query 位置。

- `modules/promptPresetPillRuntime.test.js`
  - 覆盖 preset pill 的 DOM 行为和 payload 解析。

- `modules/debugMode.test.js`
  - 覆盖 localStorage、normal query、hash query。

### 修改

- `modules/slashMenu.js`
  - 新增 UI preset selection path，保留 agent direct path。
  - `renderMenu()` 支持 `includeCustomManager` 和 `anchorEl`。
  - 导出 `openPromptPresetPicker()` 给常用提示词按钮复用。

- `modules/slashMenu.test.js`
  - 更新 UI 选择 preset 的测试语义：插入 pill、不提交、store patch 正确。
  - 保留 agent direct preset execution 测试。

- `src/utils/dom.js`
  - 最小扩展 prompt sanitizer，让 `.prompt-preset-pill` 的 title/class/contenteditable 可保留。
  - 不保留 template。

- `modules/nodePromptShared.js`
  - 最小接入 `.prompt-preset-pill` 的原子键盘删除或调用 runtime helper。

- `components/aigenText/uiModule.js`
  - 在生成文本底部模型选择后插入常用提示词按钮。
  - debug 控件按 `modules/debugMode.js` 控制显示。

- `components/aigenText/taskOrchestrationModule.js`
  - 在 `_buildPayload()` 开头先计算 preset-aware `userInput`，再进入 registry/legacy 分支。

- `components/aigenImage/uiModule.js`
  - 在 mount wrapper 中插入常用提示词按钮、重排 footer 控件、debug gating。

- `components/aigenImage/taskOrchestrationModule.js`
  - 在 `_buildPayload()` 开头先计算 preset-aware `userInput`，再进入 registry/legacy 分支。

- `components/StoryboardScriptNode.js`
  - 使用图片 registry runtime 修复 label。
  - 新增 batchSize patch helper，不复用文本 registry patch helper。
  - 替换隐藏控件逻辑为可见禁用逻辑。
  - 编号区域复制卡片内容。
  - 删除上一轮文本缩略图 hack 相关代码。

- `storyboardScriptTextModelRegistry.test.js`
  - 删除上一轮文本缩略图 DOM hack 测试。
  - 添加或修正 Storyboard 图片模型 label、batchSize、MJ 控件、卡片复制测试。

---

## 4. Task 1：Preset pill runtime

**Files:**
- Create: `modules/promptPresetPillRuntime.js`
- Create: `modules/promptPresetPillRuntime.test.js`

### Step 1：写失败测试

在 `modules/promptPresetPillRuntime.test.js` 新建测试文件，测试 DOM 只保存 title，store 保存 selection，payload 用 `resolvePromptPresetTemplate` 注入用户输入。测试必须断言 `data-prompt-preset-template` 不存在。

Required cases:

- `applyPromptPresetSelection()` 插入 `.prompt-preset-pill`，button label 变成 preset title。
- 再选一个 preset 会替换旧 pill。
- `getPromptTextWithPresetSelection()` 用 node data 中的 template 解析 `{用户输入}`，并从用户输入中移除 pill title。
- 删除 pill 后 `syncCommonPromptButtonLabel()` 恢复 `常用提示词`，并通过 store 清空 `promptPresetSelection`。
- `handlePromptPresetPillKeyboard()` 删除整个 pill。

Run:

```powershell
D:\Aic\node.exe --test modules\promptPresetPillRuntime.test.js
```

Expected: fails because runtime does not exist.

### Step 2：实现 runtime

Create `modules/promptPresetPillRuntime.js` with these public APIs:

```js
import { resolvePromptPresetTemplate } from "./promptPresetTemplate.js";

export const PROMPT_PRESET_PILL_CLASS = "prompt-preset-pill";
export const PROMPT_PRESET_PILL_SELECTOR = ".prompt-preset-pill";
export const COMMON_PROMPT_DEFAULT_LABEL = "常用提示词";

export function applyPromptPresetSelection({ promptEl, nodeId, store, preset, buttonEl = null, triggerRange = null } = {}) {}
export function getPromptTextWithPresetSelection({ promptEl, nodeData = {}, fallbackText = "", context = {} } = {}) {}
export function rehydratePromptPresetPills(promptEl, buttonEl = null, nodeData = {}) {}
export function syncCommonPromptButtonLabel(promptEl, buttonEl, nodeData = {}) {}
export function handlePromptPresetPillKeyboard(promptEl, event, { nodeId = null, store = null, buttonEl = null, onChange } = {}) {}
export function clearPromptPresetSelection({ promptEl, nodeId, store, buttonEl } = {}) {}
```

Implementation details:

- `applyPromptPresetSelection()` validates `preset.title` and string `preset.template`.
- Remove existing `.prompt-preset-pill` before inserting a new one.
- Insert at `triggerRange` if provided, otherwise append at prompt end. If tests use `modules/slashMenu.test.js` fake `TestRange`, add `insertNode()` support there or use a fallback insertion path in runtime.
- Persist `{ prompt: promptEl.innerHTML, promptPresetSelection: { title, template } }` through `store.updateNodeData(nodeId, patch)`.
- DOM pill stores only `data-prompt-preset-title` and text title.
- `clearPromptPresetSelection()` persists `{ prompt: promptEl.innerHTML, promptPresetSelection: null }` and resets button label.
- `syncCommonPromptButtonLabel()` must not fall back to stale node data when `promptEl` exists and no `.prompt-preset-pill` remains. On mount, call `rehydratePromptPresetPills()` first to recreate the pill from node data, then sync label.
- `getPromptTextWithPresetSelection()` clones promptEl, removes preset pills, extracts user text, and calls `resolvePromptPresetTemplate(template, userInput, context)` only when a matching `.prompt-preset-pill` still exists. If the pill is missing, return user text and ignore stale `nodeData.promptPresetSelection`.

### Step 3：跑测试

```powershell
D:\Aic\node.exe --test modules\promptPresetPillRuntime.test.js
```

Expected: PASS.

---

## 5. Task 2：slash UI 选择与常用提示词 picker 共用 runtime

**Files:**
- Modify: `modules/slashMenu.js`
- Modify: `modules/slashMenu.test.js`

### Step 1：写失败测试

Use existing `dispatchMouseDown(element)` helper. Do not use pointer events.

Required cases in `modules/slashMenu.test.js`:

- Slash selecting a preset inserts `.prompt-preset-pill`, writes `promptPresetSelection` to store, updates common button label, and does not call `onGenerate`.
- `openPromptPresetPicker()` opens the same preset list without `[data-action='open-custom-manager']`.
- Existing agent direct execution test for `applyPromptPresetToPromptEl(template, context, { delayMs: 0 })` still passes.

Run:

```powershell
D:\Aic\node.exe --test modules\slashMenu.test.js
```

Expected: new tests fail because UI path still calls direct execution and picker export does not exist.

### Step 2：修改 slash menu

- Import `applyPromptPresetSelection` and `syncCommonPromptButtonLabel` from `./promptPresetPillRuntime.js`.
- Add `findCommonPromptButtonForPrompt(promptEl)` to locate nearest `.common-prompt-btn`.
- Add `selectPreset(preset, context)` that calls `applyPromptPresetSelection()` with full preset object, syncs prompt, closes menu, and calls optional `context.onPresetSelected?.(preset)`.
- Keep `applyPromptPresetToPromptEl()` as the legacy direct execution API and require `typeof context.onGenerate === "function"`.
- Replace UI calls from `selectPresetTemplate(preset?.template, ...)` to `selectPreset(preset, ...)` and same for child preset.
- Change `renderMenu(presets, context)` to `renderMenu(presets, context, { includeCustomManager = true, anchorEl = null } = {})`.
- Only append `createCustomPresetItem()` when `includeCustomManager` is true.
- Add and export `openPromptPresetPicker({ promptEl, nodeType, nodeId, anchorEl, commonPromptButtonEl, onPresetSelected })`, with `includeCustomManager: false`.
- Change `checkSlashTrigger(event, options)` so `onGenerate` is optional and `onPresetSelected/commonPromptButtonEl` flow through context.

### Step 3：跑测试

```powershell
D:\Aic\node.exe --test modules\slashMenu.test.js modules\promptPresetPillRuntime.test.js
```

Expected: PASS.

---

## 6. Task 3：debug mode helper

**Files:**
- Create: `modules/debugMode.js`
- Create: `modules/debugMode.test.js`

### Step 1：写失败测试

Cover default off, localStorage on, normal query, and query inside hash:

```js
assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow() }), false);
assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow({ storageValue: "true" }) }), true);
assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow({ href: "app://index.html?debug=1#/canvas" }) }), true);
assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow({ href: "app://index.html#/canvas?debug=1" }) }), true);
```

Run:

```powershell
D:\Aic\node.exe --test modules\debugMode.test.js
```

Expected: fails because helper does not exist.

### Step 2：实现 helper

```js
export function isHuanyingDebugModeEnabled({ windowRef = typeof window !== "undefined" ? window : null } = {}) {
  if (!windowRef) return false;
  try {
    if (windowRef.localStorage?.getItem?.("huanyingDebugMode") === "true") return true;
  } catch {}
  const href = String(windowRef.location?.href || "");
  if (!href) return false;
  const parts = [];
  const firstQuestion = href.indexOf("?");
  if (firstQuestion >= 0) parts.push(href.slice(firstQuestion + 1));
  const hashIndex = href.indexOf("#");
  const hashQuestion = hashIndex >= 0 ? href.indexOf("?", hashIndex) : -1;
  if (hashQuestion >= 0) parts.push(href.slice(hashQuestion + 1));
  return parts.some((part) => new URLSearchParams(part.split("#")[0]).get("debug") === "1");
}
```

### Step 3：跑测试

```powershell
D:\Aic\node.exe --test modules\debugMode.test.js
```

Expected: PASS.

---

## 7. Task 4：生成文本节点接入常用提示词与 payload

**Files:**
- Modify: `components/aigenText/uiModule.js`
- Modify: `components/aigenText/taskOrchestrationModule.js`
- Test: `components/aigenText/taskOrchestrationModule.test.js`

### Step 1：写 payload 失败测试

Use existing `createTaskModuleContext` helper; do not invent `createTextNodeContext`. Extend that helper in-place with optional `promptHtml` and a richer fake prompt element only if needed.

Required assertion: prompt containing `<span class="prompt-preset-pill" ...>短视频标题</span> 雪山咖啡馆` and node data `promptPresetSelection.template = "写一个短视频标题：{用户输入}"` produces payload prompt containing `写一个短视频标题：雪山咖啡馆` and not treating pill title as user input. Current helper's `createPromptEl()` is text-only; add `cloneNode(true)`, `querySelectorAll()`, and `textContent` behavior for `.prompt-preset-pill` removal, or use a real DOM shim already present in tests.

Run:

```powershell
D:\Aic\node.exe --test components\aigenText\taskOrchestrationModule.test.js
```

Expected: fails until preset-aware input is applied before registry/legacy branching.

### Step 2：实现 payload 接入

- Import `getPromptTextWithPresetSelection`.
- At the start of `_buildPayload(userInput = null)` compute `resolvedUserInput` from `this.promptEl`, `this._data`, and fallback `userInput ?? this.promptEl?.textContent ?? ""`.
- Pass `resolvedUserInput` into both legacy and registry branches. This must happen before the current early return to `originalBuildPayload.call(this, userInput)`.

### Step 3：实现 UI 按钮

- In `components/aigenText/uiModule.js` mount wrapper, add a small DOM patch helper.
- Locate promptEl and text model wrap using tolerant selectors.
- Insert `.common-prompt-btn` immediately after text model selector.
- Button click calls `openPromptPresetPicker({ promptEl, nodeType: "ai-text", nodeId, anchorEl: button, commonPromptButtonEl: button })`.
- Call `rehydratePromptPresetPills()` on mount and `syncCommonPromptButtonLabel()` on prompt input; if input removed the pill, call `clearPromptPresetSelection()` so payload does not use stale template.
- Hide debug/wrench with `isHuanyingDebugModeEnabled()`.

### Step 4：跑测试

```powershell
D:\Aic\node.exe --test components\aigenText\taskOrchestrationModule.test.js modules\promptPresetPillRuntime.test.js modules\slashMenu.test.js
```

Expected: PASS.

---

## 8. Task 5：生成图片节点接入常用提示词、footer 顺序与 payload

**Files:**
- Modify: `components/aigenImage/uiModule.js`
- Modify: `components/aigenImage/taskOrchestrationModule.js`
- Test: `components/aigenImage/taskOrchestrationModule.test.js`
- Test: `components/aigenImage/uiModule.batchSize.test.js`

### Step 1：写 payload 失败测试

Use existing test harness (`createTestContext`, `createStore`, `createPromptEl` as present in file). Do not invent `mountImageNodeForBatchTest`. If the existing prompt fake is text-only, extend it in-place with the same minimal `cloneNode/querySelectorAll/textContent` behavior used by the runtime test.

Required assertion: prompt with preset pill and node data template `电影海报画面：{用户输入}` produces payload prompt using the resolved template before `!isRegistryImageNodeData(this._data)` legacy return.

Run:

```powershell
D:\Aic\node.exe --test components\aigenImage\taskOrchestrationModule.test.js
```

Expected: fails until `_buildPayload()` computes preset-aware input first.

### Step 2：实现 payload 接入

- Import `getPromptTextWithPresetSelection`.
- At the start of `_buildPayload(userInput = null)` compute `resolvedUserInput` from prompt DOM/node data/fallback.
- Pass `resolvedUserInput` to the legacy `originalBuildPayload.call(this, resolvedUserInput)` and registry branch.
- If prompt template context needs `hasImageInput`,优先复用现有图片参考解析结果，不要重写图片参考发现流程。

### Step 3：写 UI 失败测试

In `components/aigenImage/uiModule.batchSize.test.js` use existing `createBatchDom` and `createStore` helpers. Extend the local `FakeElement` only as needed for this helper: `style`, `hidden`, `setAttribute/getAttribute`, `matches`, `insertAdjacentElement`, multi-selector `querySelectorAll`, and reparenting in `appendChild`.

Required assertions:

- `bindImageCommonPromptAndFooterControls()` inserts `.common-prompt-btn` after image model selector.
- Footer order is model -> common -> quality -> ratio -> batch.
- Debug/wrench is hidden by default and visible when debug helper returns true.

### Step 4：实现 UI wrapper

In `components/aigenImage/uiModule.js`:

- Import picker, prompt preset runtime helpers, debug helper.
- Export `bindImageCommonPromptAndFooterControls(node, store, mountResult = null)` for tests.
- In the helper, find root from `mountResult?.root || node?.el || node?.element || node?.container`.
- Find prompt, footer, model wrap with tolerant selectors.
- Insert common button after model wrap, bind picker with `nodeType: "ai-image"`.
- Reappend common, quality, ratio, batch in that order immediately after the model control. When moving nodes, preserve existing event listeners and do not clone controls.
- Hide `.debug-wrench-btn` / `[data-role='debug-wrench']` unless debug mode.
- Call this helper immediately after existing `bindBatchSizeControlStoreSync(this, deps?.store, result)` in mount wrapper.

### Step 5：跑测试

```powershell
D:\Aic\node.exe --test components\aigenImage\taskOrchestrationModule.test.js components\aigenImage\uiModule.batchSize.test.js modules\promptPresetPillRuntime.test.js modules\slashMenu.test.js
```

Expected: PASS.

---

## 9. Task 6：Storyboard 图片模型 label 与 batchSize patch

**Files:**
- Modify: `components/StoryboardScriptNode.js`
- Test: `storyboardScriptTextModelRegistry.test.js`

### Step 1：写失败测试

Do not assume nonexistent `createMountedStoryboardScriptNode`. Use current helpers such as `createStoryboardModelSelectorDom` / `createStoryboardRegistryPayloadHarness` if present, or create a minimal node/root inside the test.

Required assertions:

- Selected registry image snapshot name is displayed in `.img-model-label`; label is not generic `AI`.
- `updateStoryboardScriptSelectionBatchSize(node, 4)` returns/writes patch with top-level `batchSize: 4` and `storyboardScript.batchSize: 4`.
- `decorateStoryboardScriptGeneratedImageNode()` copies batchSize into created image node data.

Run:

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: fails because current label/batch behavior is incomplete.

### Step 2：实现 label 修复

- Import `getImageNodeModelLabel` from `./aigenImage/modelRegistryRuntime.js`.
- Add/export `syncStoryboardScriptImageModelLabel(node)`.
- Build image state from real current fields `node._data.storyboardScript.imageModel/imageProvider/imageSelectedModelId/imageSelectedModelNameSnapshot/imageModelDeleted` plus top-level fallbacks. Do not introduce a new `imageModelSnapshot` object field unless the code already has it.
- Set label text using `getImageNodeModelLabel(imageState)`.
- Call after `applyImageModelSelectorUi()` and after model patch callback.

### Step 3：实现 batch helper

Do not call `updateStoryboardScriptRegistryPatch(node, { storyboardScript: ..., batchSize })`. Add/export:

```js
export function updateStoryboardScriptSelectionBatchSize(node, batchSize) {
  const normalized = Number(batchSize);
  const nextBatchSize = Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : 1;
  const currentScript = node?._data?.storyboardScript || {};
  const nextScript = { ...currentScript, batchSize: nextBatchSize, updatedAt: Date.now() };
  const patch = { batchSize: nextBatchSize, storyboardScript: nextScript };
  node._data = { ...node._data, ...patch };
  a302_0x41493.updateNodeData?.(node.nodeId, patch);
  node.updateNodeData?.(patch);
  return patch;
}
```

- Bind this helper to the selection-mode quantity control.
- Add `batchSize` copy inside `decorateStoryboardScriptGeneratedImageNode(sourceNode, nodeData)`.

### Step 4：跑测试

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: PASS for label and batch tests.

---

## 10. Task 7：Storyboard MJ 控件可见但禁用

**Files:**
- Modify: `components/StoryboardScriptNode.js`
- Test: `storyboardScriptTextModelRegistry.test.js`

### Step 1：写失败测试

Create minimal DOM with `.ui-schema-mode-slot`, `.rh-adv-wrap`, `.img-ratio-wrap`; node data uses `imageProvider: "midjourney"` or model containing `mj`. Assert controls are not hidden and unsupported wrappers have `aria-disabled="true"` and child controls disabled.

Run:

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: fails while old suppress helper hides controls.

### Step 2：替换隐藏 helper

- Replace old `suppressStoryboardScriptSelectionImageSchemaControls(node)` semantic with exported `applyStoryboardScriptSelectionImageControlState(node)`.
- It must set wrappers visible (`hidden = false` and `style.display = ""`), toggle `is-disabled`, set `aria-disabled`, and disable child controls only for unsupported/MJ state.
- Update every wrapper call from old suppress helper to the new helper.

### Step 3：跑测试

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: PASS.

---

## 11. Task 8：Storyboard 卡片编号复制

**Files:**
- Modify: `components/StoryboardScriptNode.js`
- Test: `storyboardScriptTextModelRegistry.test.js`

### Step 1：写失败测试

Required assertions:

- `bindStoryboardScriptCardCopy(card)` binds only the number/shot button.
- Clicking `.storyboard-script-shot-copy` calls clipboard with visible fields in order.
- Click prevents default and stops propagation so field editing is not triggered.
- Success and failure toasts match required Chinese copy.

Run:

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: fails because copy binding does not exist.

### Step 2：实现复制 helper

- Add/export `collectStoryboardScriptCardCopyText(card)` and `bindStoryboardScriptCardCopy(card)`.
- Collect `[data-storyboard-field]`, `.storyboard-script-field`, `.storyboard-script-editable` in DOM order.
- Resolve label from `data-storyboard-field` or `dataset.storyboardEditKey`.
- Skip hidden/empty values.
- Format rows as `字段：内容` joined by newline.
- If `.storyboard-script-shot` is editable text, wrap only its numeric content in a button `.storyboard-script-shot-copy` and bind click there.
- After `_createCardView()` creates card DOM, call `bindStoryboardScriptCardCopy` for each card.

### Step 3：跑测试

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: PASS.

---

## 12. Task 9：删除上一轮文本缩略图 hack 与冗余测试

**Files:**
- Modify: `components/StoryboardScriptNode.js`
- Modify: `storyboardScriptTextModelRegistry.test.js`

### Step 1：定位并删除

Delete previous wrong-direction code:

- Manual text reference thumbnail/chip DOM hack in `components/StoryboardScriptNode.js`.
- Test that only validates that hack DOM in `storyboardScriptTextModelRegistry.test.js`.

Keep these real acceptance paths:

- Shared ref bar can display text refs.
- Generated Storyboard prompt includes text reference content.

### Step 2：补真实验收测试

Use existing Storyboard payload harness. Assert generated prompt contains both user storyboard input and stored text reference content.

Run:

```powershell
D:\Aic\node.exe --test storyboardScriptTextModelRegistry.test.js
```

Expected: PASS after deleting hack and preserving text-ref prompt path.

---

## 13. Task 10：完整验证与人工 diff review

### Step 1：运行目标测试

```powershell
D:\Aic\node.exe --test modules\promptPresetPillRuntime.test.js modules\slashMenu.test.js modules\debugMode.test.js components\aigenText\taskOrchestrationModule.test.js components\aigenImage\taskOrchestrationModule.test.js components\aigenImage\uiModule.batchSize.test.js storyboardScriptTextModelRegistry.test.js
```

Expected: PASS.

### Step 2：搜索错误模式

```powershell
rg -n "data-prompt-preset-template|selectPresetTemplate\(|suppressStoryboardScriptSelectionImageSchemaControls\(" modules components storyboardScriptTextModelRegistry.test.js
```

Expected:

- No `data-prompt-preset-template`.
- `selectPresetTemplate(` 不再作为 UI path 存在。
- `suppressStoryboardScriptSelectionImageSchemaControls(` 不再存在。

### Step 3：人工 diff review checklist

Review `git diff -- components modules src storyboardScriptTextModelRegistry.test.js`，逐项确认：

- `applyPromptPresetToPromptEl()` 仍支持 `promptPresetAdapter` 直接执行。
- slash UI 和 common button 都调用同一个 `applyPromptPresetSelection()`。
- DOM pill 没有保存完整 template。
- `promptPresetSelection` patch 同时保存 `title` 和 `template`。
- 文本/图片 `_buildPayload()` 在 registry early return 前解析 preset-aware 输入。
- debug helper 同时覆盖 localStorage、普通 query、hash query。
- Storyboard batch 写入 `batchSize` 和 `storyboardScript.batchSize`，没有通过文本 registry patch helper 写。
- Storyboard 图片模型 label 使用 `getImageNodeModelLabel()`。
- MJ 控件可见，禁用态有 `disabled`/`aria-disabled`/灰显 class。
- 卡片编号复制阻止冒泡，不影响其它字段编辑。
- 上一轮文本缩略图 hack 和对应测试已删除。

---

## 14. 验收标准

- 生成文本节点模型选择右侧显示“常用提示词”，选择 preset 后按钮变成 preset 标题，输入框出现原子 pill，不自动生成。
- 生成图片节点模型选择右侧显示“常用提示词”，footer 顺序为模型、常用提示词、画质、比例、生成数量、生成。
- 在输入框通过 `/` 选择 preset，与点击“常用提示词”按钮选择 preset 的结果完全一致。
- 删除 preset pill 后，按钮恢复“常用提示词”，payload 不再套用旧模板。
- agent 直接执行 preset 的路径仍能直接触发生成。
- 普通用户看不到 debug/wrench；debug 模式能看到。
- 分镜脚本选择分镜生成图片时，图片模型选择框显示真实模型名称或 registry 未配置提示，不显示 `AI` 或空白。
- 分镜脚本生成数量同步到后续图片节点 `batchSize`。
- MJ 模型时底部控件不消失；不支持项灰显禁用。
- 分镜卡片编号点击复制当前卡片可见提示词字段，复制成功/失败 toast 正确。

---

## 15. 风险与回滚点

- **混淆 UI selector 不稳定：** 所有 UI patch helper 必须容忍找不到节点并安全返回；测试覆盖 helper，人工用真实节点验证 selector。
- **prompt sanitizer 误伤：** 只白名单 preset pill 的 title/class，不允许 template 入 DOM，降低 XSS 和持久化风险。
- **旧 agent preset 路径回归：** 保留 `applyPromptPresetToPromptEl()` direct execution，并保留现有 adapter 测试。
- **Storyboard helper 误用：** batchSize 只用新的 `updateStoryboardScriptSelectionBatchSize()`，不要复用文本 registry patch helper。
- **卡片复制影响编辑：** 监听只绑在编号 button，必须 `preventDefault()` 和 `stopPropagation()`。

---

## 16. 执行顺序

1. Task 1：先建 preset pill runtime 和测试。
2. Task 2：改 slash 菜单，让 `/` 与常用按钮共用 runtime，同时保护 agent direct path。
3. Task 3：加 debug helper。
4. Task 4：接生成文本 UI 和 payload。
5. Task 5：接生成图片 UI、footer、payload。
6. Task 6：修 Storyboard 图片模型 label 与 batchSize。
7. Task 7：修 Storyboard MJ 控件可见禁用。
8. Task 8：修 Storyboard 卡片编号复制。
9. Task 9：删文本缩略图 hack，补真实文本参考验收。
10. Task 10：跑全量目标测试并做人工 diff review。
