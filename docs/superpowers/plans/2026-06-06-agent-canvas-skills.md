# Agent Canvas Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent 面板通过内部 Canvas Skills 调用现有画布、节点、资产、工作流能力，修复 Agent 生成图片时节点不可编辑、不可提交生成的问题，并让 plan/act 确认规则符合用户确认口径。

**Architecture:** 第一阶段不新增后端 `canvas_skill` action 协议；继续接收现有 Assistant actions，在前端 executor 内把 AI 节点相关旧动作转换为内部 Canvas Skill 调用。Canvas Skills 通过运行时 adapter 调用 `createNodeAtCursor`、`window.__v2RendererBridge`、workflow service、asset persistence 和 slash preset helper，不重复实现图片/文本/视频生成。

**Tech Stack:** Browser DOM + ES Modules + Node built-in `node:test`；测试命令使用 `D:\Aic\node.exe --test --test-concurrency=1`；当前目录不是 git repo，执行时用变更文件清单替代 commit。

---

## File Structure

- Create `modules/assistant/assistantCanvasSkillRegistry.js`: 技能 ID、旧 action 可转换判断、plan/act 确认策略。
- Create `modules/assistant/assistantCanvasSkillRegistry.test.js`: 覆盖技能清单、旧 AI action 判断、确认策略。
- Create `modules/assistant/assistantCanvasParameterMapper.js`: 把 Agent 参数映射为节点已有字段，校验 `advancedOptions` 白名单。
- Create `modules/assistant/assistantCanvasParameterMapper.test.js`: 覆盖图片/文本/视频参数、未知高级参数 warning。
- Create `modules/assistant/assistantCanvasNodeLifecycle.js`: 用 `createNodeAtCursor` 创建节点，等待 renderer mount，调用节点已有 `_onGenerate/onGenerate`。
- Create `modules/assistant/assistantCanvasNodeLifecycle.test.js`: 覆盖节点创建、等待、生成、超时保留草稿。
- Create `modules/assistant/assistantCanvasReferenceBinder.js`: 把 `@` 引用写成真实画布边和节点引用元数据。
- Create `modules/assistant/assistantCanvasReferenceBinder.test.js`: 覆盖画布节点引用、缺失引用 warning。
- Create `modules/assistant/assistantCanvasWorkflowSkills.js`: 包装 `applyWorkflowToCanvas`、`saveNewWorkflowFromCanvas`、`saveUpdatedWorkflowFromCanvas`。
- Create `modules/assistant/assistantCanvasWorkflowSkills.test.js`: 覆盖工作流应用、保存、更新。
- Create `modules/assistant/assistantCanvasAssetSkills.js`: 包装资产读取和显式保存，保存先持久化再写本地 store。
- Create `modules/assistant/assistantCanvasAssetSkills.test.js`: 覆盖资产列表、显式保存、隐式保存拒绝。
- Create `modules/assistant/assistantCanvasSkillExecutor.js`: 串联 registry、mapper、binder、lifecycle、workflow、asset skills 执行旧 actions。
- Create `modules/assistant/assistantCanvasSkillExecutor.test.js`: 覆盖旧 actions 转技能、单图生成、视频授权阻断。
- Modify `modules/assistant/assistantActionExecutor.js`: 有 `canvasSkillsRuntime` 时优先走 Canvas Skills，其他旧逻辑保留。
- Modify `modules/assistant/assistantActionExecutor.test.js`: 覆盖 runtime 优先、fallback 保留、retryable warning。
- Modify `modules/assistant/assistantActionPreviewModel.js`: strong confirmation 按 `agentMode` 对齐，act 模式不拦截视频生成。
- Modify `modules/app/appAssistantPanel.js`: 接收并透传 `canvasSkillsRuntime`，preview 强确认按 `agentMode` 对齐。
- Modify `modules/app/appAssistantPanel.test.js`: 覆盖 runtime 透传、act 视频无需强确认、单图自动执行。
- Modify `modules/app/appAssistantPanel.autoload.js`: 创建运行时 adapter，注入 node flow、renderer bridge、workflow、asset。
- Modify `modules/app/appAssistantPanel.autoload.test.js`: 覆盖 autoload 注入 runtime。
- Modify `main.js`: 暴露 `appCanvasNodeFlows` 给 autoload 的 Agent runtime 使用。
- Modify `modules/slashMenu.js`: 导出 `applyPromptPresetToPromptEl`，供 Agent 直接调用。
- Modify `modules/slashMenu.test.js`: 覆盖 slash helper。
- Create `docs/agent_canvas_skills.md`: 维护技能能力清单。

## Existing Code Anchors

- `modules/app/appAssistantPanel.js`: `applyPendingActionsOnce(state)` validate 后调用 `executeActions(executePayload)`。
- `modules/app/appAssistantPanel.autoload.js`: `installAppAssistantPanel()` 当前注入 graph/template/executeActions，需要新增 `canvasSkillsRuntime`。
- `modules/app/canvasNodeFlows.js`: `createAppCanvasNodeFlows()` 返回 `createNodeAtCursor`，应作为 Agent 创建 AI 节点主路径。
- `src/core/renderer.js`: `window.__v2RendererBridge` 暴露 `nodeInstances`、`wrapperMap`、`isNodeMounted`、`getMountedWrapper`、`pinNode`、`unpinNode`。
- `modules/nodePromptShared.js`: 已有 ref pill 和 incoming edge 逻辑，Agent `@` 绑定应写入同类画布关系。
- `modules/slashMenu.js`: `selectPresetTemplate` 是私有函数，需要抽 helper，不模拟菜单点击。
- `modules/workflows/workflowCanvas.js`: 已有 `applyWorkflowToCanvas`、`createWorkflowFromCanvas`、`updateWorkflowFromCanvas`。
- `modules/workflows/workflowService.js`: 已有 `loadWorkflowsFromServer`、`saveNewWorkflowFromCanvas`、`saveUpdatedWorkflowFromCanvas`、`saveWorkflowUsage`。

---

### Task 1: Registry, Policy, And Capability Inventory

**Files:**
- Create: `modules/assistant/assistantCanvasSkillRegistry.js`
- Create: `modules/assistant/assistantCanvasSkillRegistry.test.js`
- Create: `docs/agent_canvas_skills.md`

- [ ] **Step 1: Write failing tests**

Create `modules/assistant/assistantCanvasSkillRegistry.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  CANVAS_SKILL_IDS,
  createAssistantCanvasSkillRegistry,
  isAiNodeActionConvertible,
  shouldConfirmCanvasSkillBatch,
} from "./assistantCanvasSkillRegistry.js";

test("registry exposes first-phase canvas skills", () => {
  const ids = createAssistantCanvasSkillRegistry().list().map((item) => item.id);
  assert.ok(ids.includes(CANVAS_SKILL_IDS.imageGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.textGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.videoGenerate));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.workflowApply));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.assetAdd));
  assert.ok(ids.includes(CANVAS_SKILL_IDS.nodeBindReferences));
});

test("registry detects old AI node actions", () => {
  assert.equal(isAiNodeActionConvertible({ type: "create_node", nodeType: "ai-image" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "update_node_data", nodeType: "ai-text" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "queue_generation_task", nodeType: "ai-video" }), true);
  assert.equal(isAiNodeActionConvertible({ type: "create_node", nodeType: "comment" }), false);
});

test("registry confirmation policy matches plan and act rules", () => {
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.imageGenerate, nodeType: "ai-image" }], { agentMode: "plan" }), false);
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.videoGenerate, nodeType: "ai-video" }], { agentMode: "plan" }), true);
  assert.equal(shouldConfirmCanvasSkillBatch([
    { skillId: CANVAS_SKILL_IDS.imageGenerate, nodeType: "ai-image" },
    { skillId: CANVAS_SKILL_IDS.textGenerate, nodeType: "ai-text" },
  ], { agentMode: "plan" }), true);
  assert.equal(shouldConfirmCanvasSkillBatch([{ skillId: CANVAS_SKILL_IDS.videoGenerate, nodeType: "ai-video" }], { agentMode: "act" }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js
```

Expected: FAIL because `assistantCanvasSkillRegistry.js` does not exist.

- [ ] **Step 3: Implement registry**

Create `modules/assistant/assistantCanvasSkillRegistry.js`:

```js
export const CANVAS_SKILL_IDS = Object.freeze({
  imageCreateDraft: "imageNode.createDraft",
  imageUpdate: "imageNode.update",
  imageBindReferences: "imageNode.bindReferences",
  imageApplyPreset: "imageNode.applyPreset",
  imageGenerate: "imageNode.generate",
  textCreateDraft: "textNode.createDraft",
  textUpdate: "textNode.update",
  textBindReferences: "textNode.bindReferences",
  textApplyPreset: "textNode.applyPreset",
  textGenerate: "textNode.generate",
  videoCreateDraft: "videoNode.createDraft",
  videoUpdate: "videoNode.update",
  videoBindReferences: "videoNode.bindReferences",
  videoApplyPreset: "videoNode.applyPreset",
  videoGenerate: "videoNode.generate",
  workflowApply: "workflow.apply",
  workflowSave: "workflow.save",
  workflowUpdate: "workflow.update",
  assetList: "asset.list",
  assetUse: "asset.use",
  assetAdd: "asset.add",
  nodeBindReferences: "node.bindReferences",
});

const AI_NODE_TYPES = new Set(["ai-image", "ai-text", "ai-video"]);
const GENERATION_SKILLS = new Set([CANVAS_SKILL_IDS.imageGenerate, CANVAS_SKILL_IDS.textGenerate, CANVAS_SKILL_IDS.videoGenerate]);
const CONVERTIBLE_ACTION_TYPES = new Set(["create_node", "update_node", "update_node_data", "set_node_prompt", "set_node_model", "queue_generation_task", "run_prompt_preset_generation"]);

function text(value) { return String(value ?? "").trim(); }

function actionNodeType(action = {}, graphStore = null) {
  const data = action.data && typeof action.data === "object" ? action.data : {};
  const explicit = text(action.nodeType || action.targetType || data.nodeType || data.type);
  if (explicit) return explicit;
  const nodeId = text(action.nodeId || action.targetNodeId || action.id);
  const node = nodeId ? graphStore?.nodes?.find?.((item) => text(item?.id) === nodeId) || graphStore?.getNode?.(nodeId) : null;
  const nodeData = node?.data && typeof node.data === "object" ? node.data : {};
  return text(node?.type || node?.nodeType || nodeData.type || nodeData.nodeType);
}

export function isAiNodeType(nodeType) { return AI_NODE_TYPES.has(text(nodeType)); }

export function isAiNodeActionConvertible(action = {}, { graphStore } = {}) {
  const type = text(action.type || action.action || action.kind);
  return CONVERTIBLE_ACTION_TYPES.has(type) && isAiNodeType(actionNodeType(action, graphStore));
}

export function nodeTypeToSkillPrefix(nodeType) {
  if (text(nodeType) === "ai-image") return "imageNode";
  if (text(nodeType) === "ai-text") return "textNode";
  if (text(nodeType) === "ai-video") return "videoNode";
  return "";
}

export function skillIdForAiAction(action = {}, { graphStore } = {}) {
  const type = text(action.type || action.action || action.kind);
  const prefix = nodeTypeToSkillPrefix(actionNodeType(action, graphStore));
  if (!prefix) return "";
  if (type === "create_node") return `${prefix}.createDraft`;
  if (["update_node", "update_node_data", "set_node_prompt", "set_node_model"].includes(type)) return `${prefix}.update`;
  if (type === "run_prompt_preset_generation") return `${prefix}.applyPreset`;
  if (type === "queue_generation_task") return `${prefix}.generate`;
  return "";
}

const SKILLS = Object.freeze(Object.entries(CANVAS_SKILL_IDS).map(([key, id]) => ({
  id,
  key,
  permission: id.includes("generate") ? "generate" : id.startsWith("asset.list") ? "read" : "write",
})));

export function createAssistantCanvasSkillRegistry(skills = SKILLS) {
  const byId = new Map(skills.map((skill) => [skill.id, { ...skill }]));
  return {
    list: () => Array.from(byId.values()).map((skill) => ({ ...skill })),
    get: (id) => byId.has(text(id)) ? { ...byId.get(text(id)) } : null,
    has: (id) => byId.has(text(id)),
  };
}

export function shouldConfirmCanvasSkillBatch(skillCalls = [], { agentMode = "plan" } = {}) {
  if (agentMode === "act") return false;
  const calls = Array.isArray(skillCalls) ? skillCalls : [];
  const generationCalls = calls.filter((call) => GENERATION_SKILLS.has(text(call.skillId || call.id)));
  if (generationCalls.some((call) => text(call.nodeType) === "ai-video" || text(call.skillId || call.id) === CANVAS_SKILL_IDS.videoGenerate)) return true;
  return generationCalls.length >= 2;
}
```

- [ ] **Step 4: Create capability inventory**

Create `docs/agent_canvas_skills.md`:

```md
# Agent Canvas Skills Capability Inventory

Date: 2026-06-06

| Skill ID | Description | Required context | Main dependency | Confirmation policy | Failure behavior |
| --- | --- | --- | --- | --- | --- |
| `imageNode.createDraft` | Create editable image draft | graph store, node flow | `createNodeAtCursor` | none | return failed receipt if no node id |
| `imageNode.generate` | Submit image generation | mounted image node | `_onGenerate/onGenerate` | plan confirms only multi-node | keep draft and return retry warning |
| `textNode.createDraft` | Create editable text draft | graph store, node flow | `createNodeAtCursor` | none | return failed receipt if no node id |
| `textNode.generate` | Submit text generation | mounted text node | `_onGenerate/onGenerate` | plan confirms only multi-node | keep draft and return retry warning |
| `videoNode.createDraft` | Create editable video draft | graph store, node flow | `createNodeAtCursor` | none | keep editable draft |
| `videoNode.generate` | Submit video generation | mounted video node | `_onGenerate/onGenerate` | plan confirm, act none | keep draft and return retry warning |
| `node.bindReferences` | Bind `@` references | graph store | `addEdge`, `updateNodeData` | none | bind valid refs and warn invalid refs |
| `workflow.apply` | Apply workflow | graph/workspace store | `applyWorkflowToCanvas` | none | success only after nodes/edges added |
| `workflow.save` | Save workflow | graph/workspace store | `saveNewWorkflowFromCanvas` | broad inferred scope confirms in plan | success only after persistence |
| `workflow.update` | Update workflow | graph/workspace store | `saveUpdatedWorkflowFromCanvas` | plan confirm, act none | success only after persistence |
| `asset.list` | Read assets | asset store | existing asset state | none | empty groups are valid |
| `asset.use` | Use asset as reference | asset store, graph store | reference binder | none | warn if asset missing |
| `asset.add` | Save asset explicitly | graph store, asset API | `saveAssetToServer` | explicit save intent required | no local success until persistence |
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js
```

Expected: PASS.

---

### Task 2: Parameter Mapper And Reference Binder

**Files:**
- Create: `modules/assistant/assistantCanvasParameterMapper.js`
- Create: `modules/assistant/assistantCanvasParameterMapper.test.js`
- Create: `modules/assistant/assistantCanvasReferenceBinder.js`
- Create: `modules/assistant/assistantCanvasReferenceBinder.test.js`

- [ ] **Step 1: Write failing mapper tests**

Create `modules/assistant/assistantCanvasParameterMapper.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mapAssistantNodeParameters } from "./assistantCanvasParameterMapper.js";

test("mapper maps image parameters and preserves existing defaults", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-image",
    existingData: { imageSize: "1024x1024", batchSize: 1 },
    action: { prompt: "赛博猫", modelId: "seedream", provider: "apimart", aspectRatio: "16:9", quality: "高清", batchSize: 3 },
  });
  assert.equal(result.patch.prompt, "赛博猫");
  assert.equal(result.patch.model, "seedream");
  assert.equal(result.patch.modelId, "seedream");
  assert.equal(result.patch.imageSize, "1024x1024");
  assert.equal(result.patch.batchSize, 3);
});

test("mapper rejects unknown advanced options", () => {
  const result = mapAssistantNodeParameters({ nodeType: "ai-video", action: { advancedOptions: { duration: 5, fps: 24, inventedFlag: true } } });
  assert.equal(result.patch.duration, 5);
  assert.equal(result.patch.fps, 24);
  assert.equal("inventedFlag" in result.patch, false);
  assert.deepEqual(result.rejectedAdvancedOptions, ["inventedFlag"]);
});
```

- [ ] **Step 2: Write failing reference tests**

Create `modules/assistant/assistantCanvasReferenceBinder.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { bindAssistantCanvasReferences } from "./assistantCanvasReferenceBinder.js";

function graph() {
  const nodes = [{ id: "target", type: "ai-image", data: {} }, { id: "source", type: "source-image", name: "角色A", data: {} }];
  const edges = [];
  return {
    nodes,
    edges,
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(id, patch) { const node = nodes.find((item) => item.id === id); node.data = { ...(node.data || {}), ...patch }; },
  };
}

test("binder writes edges and node reference metadata", () => {
  const graphStore = graph();
  const result = bindAssistantCanvasReferences({ graphStore, targetNodeId: "target", references: [{ id: "source", type: "canvas_node", label: "角色A" }] });
  assert.equal(result.boundReferences.length, 1);
  assert.equal(graphStore.edges[0].source, "source");
  assert.equal(graphStore.edges[0].target, "target");
  assert.equal(graphStore.nodes[0].data.assistantReferences[0].label, "角色A");
});

test("binder warns missing canvas node references", () => {
  const graphStore = graph();
  const result = bindAssistantCanvasReferences({ graphStore, targetNodeId: "target", references: [{ id: "missing", type: "canvas_node" }] });
  assert.equal(result.boundReferences.length, 0);
  assert.match(result.warnings.join(" "), /missing/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasReferenceBinder.test.js
```

Expected: FAIL because both modules do not exist.
- [ ] **Step 4: Implement mapper**

Create `modules/assistant/assistantCanvasParameterMapper.js`:

```js
const KEY_MAP = Object.freeze({
  prompt: "prompt",
  provider: "provider",
  aspectRatio: "aspectRatio",
  imageSize: "imageSize",
  quality: "quality",
  batchSize: "batchSize",
  presetId: "presetId",
  presetName: "presetName",
  duration: "duration",
  fps: "fps",
  resolution: "resolution",
});
const ADVANCED = Object.freeze({
  "ai-image": new Set(["negativePrompt", "seed", "steps", "guidanceScale", "styleStrength", "aspectRatio", "imageSize", "quality", "batchSize"]),
  "ai-text": new Set(["temperature", "maxTokens", "topP", "systemPrompt"]),
  "ai-video": new Set(["duration", "fps", "resolution", "aspectRatio", "seed", "cameraMotion", "routeMode"]),
});
function present(value) { return value !== undefined && value !== null && value !== ""; }
function text(value) { return String(value ?? "").trim(); }
function batch(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(1, Math.min(8, Math.floor(n))) : undefined; }
function normalize(key, value) {
  if (key === "batchSize") return batch(value);
  if (["duration", "fps"].includes(key)) { const n = Number(value); return Number.isFinite(n) ? n : undefined; }
  return value;
}
export function mapAssistantNodeParameters({ nodeType = "", action = {}, existingData = {} } = {}) {
  const type = text(nodeType);
  const data = action.data && typeof action.data === "object" ? action.data : {};
  const source = { ...data, ...action };
  const patch = {};
  const warnings = [];
  const rejectedAdvancedOptions = [];
  for (const [from, to] of Object.entries(KEY_MAP)) {
    if (!present(source[from])) continue;
    const value = normalize(to, source[from]);
    if (value !== undefined) patch[to] = value;
  }
  const model = text(source.modelId || source.model || source.modelName);
  if (model) { patch.model = model; patch.modelId = model; }
  if (source.modelName) patch.modelName = text(source.modelName);
  if (type === "ai-image" && !present(patch.imageSize) && present(existingData.imageSize)) patch.imageSize = existingData.imageSize;
  if (type === "ai-image" && !present(patch.batchSize) && present(existingData.batchSize)) patch.batchSize = batch(existingData.batchSize) ?? existingData.batchSize;
  const advancedOptions = source.advancedOptions && typeof source.advancedOptions === "object" ? source.advancedOptions : {};
  const allowed = ADVANCED[type] || new Set();
  for (const [key, value] of Object.entries(advancedOptions)) {
    if (!allowed.has(key)) { rejectedAdvancedOptions.push(key); continue; }
    const normalized = normalize(key, value);
    if (normalized !== undefined) patch[key] = normalized;
  }
  if (rejectedAdvancedOptions.length) warnings.push(`Unknown advanced options skipped: ${rejectedAdvancedOptions.join(", ")}`);
  return { patch, warnings, rejectedAdvancedOptions };
}
```

- [ ] **Step 5: Implement reference binder**

Create `modules/assistant/assistantCanvasReferenceBinder.js`:

```js
function text(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function clone(value) { if (value == null) return value; return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function findNode(graphStore, id) { return graphStore?.nodes?.find?.((node) => text(node?.id) === text(id)) || graphStore?.getNode?.(id) || null; }
function edgeId(sourceId, targetId, index) { return `assistant-ref-${sourceId}-${targetId}-${index}`.replace(/[^a-z0-9_-]+/gi, "-"); }
function normalize(reference, index) {
  const id = text(reference?.id || reference?.nodeId || reference?.assetId || reference?.sourceId);
  return { id, type: text(reference?.type || reference?.source || "canvas_node"), label: text(reference?.label || reference?.name || reference?.title || id), usage: text(reference?.usage || reference?.kind || "reference"), order: index, raw: clone(reference) };
}
export function bindAssistantCanvasReferences({ graphStore, targetNodeId, references = [] } = {}) {
  const targetId = text(targetNodeId);
  const targetNode = findNode(graphStore, targetId);
  const warnings = [];
  const boundReferences = [];
  const promptRefPills = [];
  if (!targetNode) return { boundReferences, warnings: [`target node not found: ${targetId || "unknown"}`] };
  asArray(references).map(normalize).forEach((reference, index) => {
    if (!reference.id) { warnings.push(`reference missing id at index ${index}`); return; }
    const sourceNode = findNode(graphStore, reference.id);
    if (!sourceNode && reference.type === "canvas_node") { warnings.push(`reference node not found: ${reference.id}`); return; }
    const sourceId = sourceNode?.id || reference.id;
    const bound = { ...reference, sourceId, targetNodeId: targetId };
    boundReferences.push(bound);
    promptRefPills.push({ label: reference.label ? `@${reference.label}` : `@${sourceId}`, nodeId: sourceId, usage: reference.usage });
    graphStore?.addEdge?.({ id: edgeId(sourceId, targetId, index), source: sourceId, target: targetId, sourceId, targetId, label: reference.usage, kind: "assistant_reference" });
  });
  if (boundReferences.length) graphStore?.updateNodeData?.(targetId, { assistantReferences: boundReferences.map(clone), promptRefPills: promptRefPills.map(clone) });
  return { boundReferences, warnings };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasReferenceBinder.test.js
```

Expected: PASS.

---

### Task 3: Node Lifecycle Adapter

**Files:**
- Create: `modules/assistant/assistantCanvasNodeLifecycle.js`
- Create: `modules/assistant/assistantCanvasNodeLifecycle.test.js`

- [ ] **Step 1: Write failing tests**

Create `modules/assistant/assistantCanvasNodeLifecycle.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasNodeLifecycle } from "./assistantCanvasNodeLifecycle.js";

function graph() {
  const nodes = [];
  return { nodes, selectedNodeIds: [], addNode(node) { nodes.push(node); return node; }, updateNodeData(id, patch) { const node = nodes.find((item) => item.id === id); if (node) node.data = { ...(node.data || {}), ...patch }; }, setSelectedNodes(ids) { this.selectedNodeIds = ids; } };
}

test("lifecycle creates draft through createNodeAtCursor", async () => {
  const graphStore = graph();
  const calls = [];
  const lifecycle = createAssistantCanvasNodeLifecycle({
    graphStore,
    nodeFlows: { createNodeAtCursor(type, width, height, name) { calls.push({ type, width, height, name }); const node = { id: "img-1", type, data: {} }; graphStore.addNode(node); return node; } },
    rendererBridge: { isNodeMounted: () => true, nodeInstances: new Map() },
  });
  const result = await lifecycle.createDraftNode({ nodeType: "ai-image", name: "生成图片", patch: { prompt: "猫" } });
  assert.equal(result.nodeId, "img-1");
  assert.deepEqual(calls[0], { type: "ai-image", width: 320, height: 220, name: "生成图片" });
  assert.deepEqual(graphStore.selectedNodeIds, ["img-1"]);
  assert.equal(graphStore.nodes[0].data.prompt, "猫");
});

test("lifecycle waits for renderer and calls existing generator", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "img-1", type: "ai-image", data: { prompt: "猫" } });
  const generated = [];
  const bridge = { isNodeMounted: () => true, getMountedWrapper: () => ({}), pinNode() {}, unpinNode() {}, nodeInstances: new Map([["img-1", { async _onGenerate(prompt, task) { generated.push({ prompt, task }); return { started: true }; } }]]) };
  const lifecycle = createAssistantCanvasNodeLifecycle({ graphStore, rendererBridge: bridge, pollIntervalMs: 1, readinessTimeoutMs: 50 });
  const result = await lifecycle.generateNode({ nodeId: "img-1", nodeType: "ai-image", prompt: "猫", task: { id: "task-1" } });
  assert.equal(result.started, true);
  assert.equal(generated[0].prompt, "猫");
});

test("lifecycle timeout is retryable and keeps node", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "img-1", type: "ai-image", data: {} });
  const lifecycle = createAssistantCanvasNodeLifecycle({ graphStore, rendererBridge: { isNodeMounted: () => false, nodeInstances: new Map() }, pollIntervalMs: 1, readinessTimeoutMs: 5 });
  const result = await lifecycle.generateNode({ nodeId: "img-1", nodeType: "ai-image", prompt: "猫" });
  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.equal(result.reason, "renderer_not_ready");
  assert.equal(graphStore.nodes.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasNodeLifecycle.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement lifecycle adapter**

Create `modules/assistant/assistantCanvasNodeLifecycle.js`:

```js
const DEFAULT_SIZE = Object.freeze({ width: 320, height: 220 });
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function text(value) { return String(value ?? "").trim(); }
function bridgeOf(explicit) { return explicit || globalThis.window?.__v2RendererBridge || globalThis.__v2RendererBridge || null; }
function findNode(graphStore, id) { return graphStore?.nodes?.find?.((node) => text(node?.id) === text(id)) || graphStore?.getNode?.(id) || null; }
function generator(instance) { return typeof instance?._onGenerate === "function" ? instance._onGenerate : typeof instance?.onGenerate === "function" ? instance.onGenerate : typeof instance?._onGenerateImpl === "function" ? instance._onGenerateImpl : typeof instance?.onGenerateImpl === "function" ? instance.onGenerateImpl : null; }
export function createAssistantCanvasNodeLifecycle({ graphStore, nodeFlows = null, rendererBridge = null, pollIntervalMs = 50, readinessTimeoutMs = 3000, defaultSize = DEFAULT_SIZE } = {}) {
  async function waitForRendererReady(nodeId) {
    const bridge = bridgeOf(rendererBridge);
    const start = Date.now();
    while (Date.now() - start <= readinessTimeoutMs) {
      const wrapper = bridge?.getMountedWrapper?.(nodeId) || bridge?.wrapperMap?.get?.(nodeId) || null;
      const instance = bridge?.nodeInstances?.get?.(nodeId) || null;
      if (bridge?.isNodeMounted?.(nodeId) && wrapper && instance) return { ok: true, bridge, wrapper, instance };
      await sleep(pollIntervalMs);
    }
    return { ok: false, bridge, reason: "renderer_not_ready" };
  }
  async function createDraftNode({ nodeType, name = "", patch = {}, width = defaultSize.width, height = defaultSize.height } = {}) {
    if (typeof nodeFlows?.createNodeAtCursor !== "function") throw new TypeError("nodeFlows.createNodeAtCursor is required");
    const node = nodeFlows.createNodeAtCursor(nodeType, width, height, name || nodeType);
    const nodeId = text(node?.id);
    if (!nodeId) throw new Error("createNodeAtCursor returned no node id");
    if (Object.keys(patch).length) graphStore?.updateNodeData?.(nodeId, patch);
    graphStore?.setSelectedNodes?.([nodeId]);
    return { nodeId, node };
  }
  async function updateNode({ nodeId, patch = {} } = {}) {
    const id = text(nodeId);
    if (!findNode(graphStore, id)) throw new Error(`node not found: ${id}`);
    if (Object.keys(patch).length) graphStore?.updateNodeData?.(id, patch);
    graphStore?.setSelectedNodes?.([id]);
    return { nodeId: id, patch };
  }
  async function generateNode({ nodeId, nodeType = "", prompt = "", task = {} } = {}) {
    const id = text(nodeId);
    const bridge = bridgeOf(rendererBridge);
    bridge?.pinNode?.(id, "assistant-generate");
    try {
      const ready = await waitForRendererReady(id);
      if (!ready.ok) { graphStore?.updateNodeData?.(id, { generationStatus: "ready_timeout", isGenerating: false }); return { started: false, retryable: true, reason: ready.reason, nodeId: id }; }
      const run = generator(ready.instance);
      if (!run) { graphStore?.updateNodeData?.(id, { generationStatus: "generator_missing", isGenerating: false }); return { started: false, retryable: true, reason: "generator_missing", nodeId: id }; }
      graphStore?.updateNodeData?.(id, { generationStatus: "running", jobStatus: "running", isGenerating: true });
      const value = await run.call(ready.instance, prompt, { ...task, nodeId: id, nodeType });
      return value && typeof value === "object" ? { started: value.started !== false, nodeId: id, ...value } : { started: true, nodeId: id };
    } finally {
      bridge?.unpinNode?.(id, "assistant-generate");
    }
  }
  return { createDraftNode, updateNode, generateNode, waitForRendererReady };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasNodeLifecycle.test.js
```

Expected: PASS.

---

### Task 4: Workflow And Asset Skills

**Files:**
- Create: `modules/assistant/assistantCanvasWorkflowSkills.js`
- Create: `modules/assistant/assistantCanvasWorkflowSkills.test.js`
- Create: `modules/assistant/assistantCanvasAssetSkills.js`
- Create: `modules/assistant/assistantCanvasAssetSkills.test.js`

- [ ] **Step 1: Write failing workflow tests**

Create `modules/assistant/assistantCanvasWorkflowSkills.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasWorkflowSkills } from "./assistantCanvasWorkflowSkills.js";

function graph() { const nodes = []; const edges = []; return { nodes, edges, selectedNodeIds: [], getState: () => ({ nodes, edges }), addNode(node) { nodes.push(node); }, addEdge(edge) { edges.push(edge); }, setSelectedNodes(ids) { this.selectedNodeIds = ids; } }; }

test("workflow skills apply workflow and select new nodes", async () => {
  const graphStore = graph();
  const used = [];
  const skills = createAssistantCanvasWorkflowSkills({ graphStore, workflowService: { loadWorkflowsFromServer: async () => [{ id: "wf-1", name: "故事流", workflowData: {} }], saveWorkflowUsage: async (workflow) => used.push(workflow.id) }, workflowCanvas: { applyWorkflowToCanvas: () => ({ nodes: [{ id: "n1", type: "ai-text" }], edges: [{ id: "e1", source: "n1", target: "n1" }] }) } });
  const result = await skills.applyWorkflow({ workflowId: "wf-1" });
  assert.deepEqual(result.createdNodeIds, ["n1"]);
  assert.deepEqual(result.createdEdgeIds, ["e1"]);
  assert.deepEqual(graphStore.selectedNodeIds, ["n1"]);
  assert.deepEqual(used, ["wf-1"]);
});

test("workflow skills save and update through service", async () => {
  const saved = [];
  const skills = createAssistantCanvasWorkflowSkills({ graphStore: graph(), workflowService: { saveNewWorkflowFromCanvas: async (state, meta) => { saved.push(["save", meta.name]); return { id: "wf-new" }; }, saveUpdatedWorkflowFromCanvas: async (id, state, meta) => { saved.push(["update", id, meta.name]); return { id }; } } });
  assert.equal((await skills.saveWorkflow({ name: "新工作流" })).workflowId, "wf-new");
  assert.equal((await skills.updateWorkflow({ workflowId: "wf-old", name: "旧工作流新版" })).workflowId, "wf-old");
  assert.deepEqual(saved, [["save", "新工作流"], ["update", "wf-old", "旧工作流新版"]]);
});
```

- [ ] **Step 2: Write failing asset tests**

Create `modules/assistant/assistantCanvasAssetSkills.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasAssetSkills } from "./assistantCanvasAssetSkills.js";

test("asset skills list assets", async () => {
  const skills = createAssistantCanvasAssetSkills({ assetStore: { getState: () => ({ assets: [{ id: "a1", name: "角色A", category: "角色" }] }) } });
  const result = await skills.listAssets({ query: "角色" });
  assert.equal(result.assets.length, 1);
});

test("asset skills require explicit intent before persistence", async () => {
  const localAssets = [];
  const skills = createAssistantCanvasAssetSkills({ graphStore: { nodes: [{ id: "img-1", type: "ai-image", data: {} }] }, assetStore: { addAsset: (asset) => localAssets.push(asset) }, saveAssetToServer: async (payload) => ({ ...payload, id: "saved" }) });
  assert.equal((await skills.addAsset({ explicitIntent: true, sourceNodeId: "img-1", assetType: "角色", name: "角色A" })).assetId, "saved");
  assert.equal(localAssets.length, 1);
  await assert.rejects(() => skills.addAsset({ explicitIntent: false, sourceNodeId: "img-1" }), /explicit save intent/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasAssetSkills.test.js
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement workflow skills**

Create `modules/assistant/assistantCanvasWorkflowSkills.js`:

```js
function text(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function stateOf(graphStore) { return typeof graphStore?.getState === "function" ? graphStore.getState() : { nodes: graphStore?.nodes || [], edges: graphStore?.edges || [] }; }
function findWorkflow(workflows, workflowId, name) {
  const id = text(workflowId);
  const label = text(name);
  return workflows.find((workflow) => text(workflow.id) === id) || workflows.find((workflow) => text(workflow.name) === label) || null;
}
export function createAssistantCanvasWorkflowSkills({ graphStore, workflowCanvas = {}, workflowService = {} } = {}) {
  async function applyWorkflow({ workflowId = "", name = "", placement = {} } = {}) {
    const workflows = typeof workflowService.loadWorkflowsFromServer === "function" ? await workflowService.loadWorkflowsFromServer() : [];
    const workflow = findWorkflow(asArray(workflows), workflowId, name) || { id: workflowId, name, workflowData: {} };
    if (!text(workflow.id) && !text(workflow.name)) throw new Error("workflow id or name is required");
    const applied = await workflowCanvas.applyWorkflowToCanvas?.(workflow, placement) || { nodes: [], edges: [] };
    const nodes = asArray(applied.nodes);
    const edges = asArray(applied.edges);
    nodes.forEach((node) => graphStore?.addNode?.(node));
    edges.forEach((edge) => graphStore?.addEdge?.(edge));
    const createdNodeIds = nodes.map((node) => text(node.id)).filter(Boolean);
    const createdEdgeIds = edges.map((edge) => text(edge.id)).filter(Boolean);
    if (createdNodeIds.length) graphStore?.setSelectedNodes?.(createdNodeIds);
    if (typeof workflowService.saveWorkflowUsage === "function") await workflowService.saveWorkflowUsage(workflow);
    return { workflowId: text(workflow.id), createdNodeIds, createdEdgeIds };
  }
  async function saveWorkflow({ name, scope = "selection", selectedNodeIds = [], cover = "", tags = [] } = {}) {
    const label = text(name);
    if (!label) throw new Error("workflow name is required");
    const saved = await workflowService.saveNewWorkflowFromCanvas?.(stateOf(graphStore), { name: label, scope, selectedNodeIds, cover, tags });
    if (!saved?.id) throw new Error("workflow persistence failed");
    return { workflowId: text(saved.id), name: saved.name || label };
  }
  async function updateWorkflow({ workflowId, name, scope = "selection", selectedNodeIds = [], cover = "", tags = [] } = {}) {
    const id = text(workflowId);
    if (!id) throw new Error("workflow id is required");
    const updated = await workflowService.saveUpdatedWorkflowFromCanvas?.(id, stateOf(graphStore), { name: text(name), scope, selectedNodeIds, cover, tags });
    if (!updated?.id) throw new Error("workflow persistence failed");
    return { workflowId: text(updated.id), name: updated.name || text(name) };
  }
  return { applyWorkflow, saveWorkflow, updateWorkflow };
}
```

- [ ] **Step 5: Implement asset skills**

Create `modules/assistant/assistantCanvasAssetSkills.js`:

```js
function text(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function findNode(graphStore, id) { return graphStore?.nodes?.find?.((node) => text(node?.id) === text(id)) || graphStore?.getNode?.(id) || null; }
function assetsOf(assetStore) {
  const state = typeof assetStore?.getState === "function" ? assetStore.getState() : assetStore || {};
  if (Array.isArray(state.assets)) return state.assets;
  if (state.assetsByCategory && typeof state.assetsByCategory === "object") return Object.values(state.assetsByCategory).flat();
  return [];
}
function matches(asset, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  return [asset?.name, asset?.title, asset?.category, asset?.type, ...(asArray(asset?.tags))].some((value) => text(value).toLowerCase().includes(q));
}
export function createAssistantCanvasAssetSkills({ graphStore = null, assetStore = null, saveAssetToServer = null } = {}) {
  async function listAssets({ query = "", category = "" } = {}) {
    const cat = text(category);
    const assets = assetsOf(assetStore).filter((asset) => (!cat || text(asset.category || asset.type) === cat) && matches(asset, query));
    return { assets: assets.map((asset) => ({ ...asset })) };
  }
  async function useAsset({ assetId = "", query = "" } = {}) {
    const assets = (await listAssets({ query })).assets;
    const asset = assets.find((item) => text(item.id) === text(assetId)) || assets[0] || null;
    if (!asset) return { asset: null, warnings: [`asset not found: ${assetId || query || "empty query"}`] };
    return { asset, warnings: [] };
  }
  async function addAsset({ explicitIntent = false, sourceNodeId = "", resultId = "", assetType = "自定义", name = "", tags = [] } = {}) {
    if (!explicitIntent) throw new Error("explicit save intent is required before adding assets");
    const sourceNode = sourceNodeId ? findNode(graphStore, sourceNodeId) : null;
    if (sourceNodeId && !sourceNode) throw new Error(`source node not found: ${sourceNodeId}`);
    const payload = { sourceNodeId: text(sourceNodeId), resultId: text(resultId), assetType: text(assetType) || "自定义", name: text(name) || text(sourceNode?.name || sourceNode?.data?.name || sourceNodeId || resultId), tags: asArray(tags), sourceNode };
    const persisted = typeof saveAssetToServer === "function" ? await saveAssetToServer(payload) : null;
    if (!persisted?.id) throw new Error("asset persistence failed");
    assetStore?.addAsset?.(persisted);
    return { assetId: text(persisted.id), asset: persisted };
  }
  return { listAssets, useAsset, addAsset };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasAssetSkills.test.js
```

Expected: PASS.

---

### Task 5: Slash Preset Helper Extraction

**Files:**
- Modify: `modules/slashMenu.js`
- Modify: `modules/slashMenu.test.js`

- [ ] **Step 1: Write failing slash helper test**

Append to `modules/slashMenu.test.js`:

```js
import { applyPromptPresetToPromptEl } from "./slashMenu.js";

test("applyPromptPresetToPromptEl inserts preset text without opening the menu", async () => {
  const input = { value: "开头", selectionStart: 2, selectionEnd: 2, dispatched: [], dispatchEvent(event) { this.dispatched.push(event.type); } };
  const result = applyPromptPresetToPromptEl(input, { title: "海报", prompt: "生成电影海报" });
  assert.equal(input.value, "开头生成电影海报");
  assert.equal(result.insertedText, "生成电影海报");
  assert.ok(input.dispatched.includes("input"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\slashMenu.test.js
```

Expected: FAIL because `applyPromptPresetToPromptEl` is not exported.

- [ ] **Step 3: Implement helper and reuse existing selection logic**

Modify `modules/slashMenu.js` by adding this exported helper near the existing private `selectPresetTemplate` helper, then call it from `selectPresetTemplate` instead of duplicating insertion logic:

```js
function text(value) { return String(value ?? ""); }
function dispatchInputEvent(promptEl) {
  if (!promptEl || typeof promptEl.dispatchEvent !== "function") return;
  const event = typeof Event === "function" ? new Event("input", { bubbles: true }) : { type: "input" };
  promptEl.dispatchEvent(event);
}
export function applyPromptPresetToPromptEl(promptEl, template = {}) {
  if (!promptEl) throw new TypeError("promptEl is required");
  const insertedText = text(template.prompt || template.content || template.text || template.title || template.name);
  const value = text(promptEl.value);
  const start = Number.isFinite(promptEl.selectionStart) ? promptEl.selectionStart : value.length;
  const end = Number.isFinite(promptEl.selectionEnd) ? promptEl.selectionEnd : start;
  promptEl.value = `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
  const cursor = start + insertedText.length;
  if (typeof promptEl.setSelectionRange === "function") promptEl.setSelectionRange(cursor, cursor);
  else { promptEl.selectionStart = cursor; promptEl.selectionEnd = cursor; }
  dispatchInputEvent(promptEl);
  return { insertedText, value: promptEl.value, cursor };
}
```

Then update the existing private preset selection path so the final prompt mutation calls:

```js
const applied = applyPromptPresetToPromptEl(context.promptEl, template);
return { ...applied, template };
```

- [ ] **Step 4: Run slash test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\slashMenu.test.js
```

Expected: PASS.

---

### Task 6: Canvas Skill Executor And Action Routing

**Files:**
- Create: `modules/assistant/assistantCanvasSkillExecutor.js`
- Create: `modules/assistant/assistantCanvasSkillExecutor.test.js`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantActionExecutor.test.js`

- [ ] **Step 1: Write failing Canvas Skill executor tests**

Create `modules/assistant/assistantCanvasSkillExecutor.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasSkillExecutor } from "./assistantCanvasSkillExecutor.js";

function graph() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) { nodes.push(node); return node; },
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(nodeId, patch) { const node = nodes.find((item) => item.id === nodeId); if (node) node.data = { ...(node.data || {}), ...patch }; },
    setSelectedNodes(nodeIds) { this.selectedNodeIds = nodeIds; },
  };
}

test("canvas skill executor converts create and generation actions into editable generated node", async () => {
  const graphStore = graph();
  const generated = [];
  const executor = createAssistantCanvasSkillExecutor({
    graphStore,
    nodeLifecycle: {
      async createDraftNode({ nodeType, patch }) { const node = { id: "img-1", type: nodeType, data: { ...patch } }; graphStore.addNode(node); return { nodeId: node.id, node }; },
      async updateNode({ nodeId, patch }) { graphStore.updateNodeData(nodeId, patch); return { nodeId, patch }; },
      async generateNode({ nodeId, prompt }) { generated.push({ nodeId, prompt }); return { started: true, nodeId }; },
    },
  });
  const result = await executor.executeActions({
    actions: [
      { id: "draft", type: "create_node", nodeType: "ai-image", prompt: "赛博猫", modelId: "seedream" },
      { type: "queue_generation_task", nodeId: "draft", nodeType: "ai-image", prompt: "赛博猫" },
    ],
    agentMode: "plan",
  });
  assert.deepEqual(result.createdNodeIds, ["img-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["img-1"]);
  assert.equal(graphStore.nodes[0].data.prompt, "赛博猫");
  assert.equal(graphStore.nodes[0].data.modelId, "seedream");
  assert.deepEqual(generated, [{ nodeId: "img-1", prompt: "赛博猫" }]);
});

test("canvas skill executor blocks plan video generation without confirmation", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "video-1", type: "ai-video", data: { prompt: "镜头" } });
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle: { async generateNode() { throw new Error("must not run"); } } });
  const result = await executor.executeActions({ actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "镜头" }], agentMode: "plan", videoAuthorized: false });
  assert.deepEqual(result.skippedVideoGenerationNodeIds, ["video-1"]);
  assert.match(result.warnings.join(" "), /confirmation/);
});
```

- [ ] **Step 2: Write failing action executor routing tests**

Append to `modules/assistant/assistantActionExecutor.test.js`:

```js
test("assistantActionExecutor: routes AI node actions through canvas skills runtime first", async () => {
  const graphStore = createGraphStore();
  const calls = [];
  const result = await executeAssistantActions({
    actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }],
    graphStore,
    canvasSkillsRuntime: {
      canHandleActions(actions) { calls.push(["can", actions.length]); return true; },
      async executeActions(payload) { calls.push(["execute", payload.actions.length, payload.graphStore === graphStore]); return { appliedCount: 1, createdNodeIds: ["skill-img"], warnings: ["skill path"] }; },
    },
  });
  assert.deepEqual(calls, [["can", 1], ["execute", 1, true]]);
  assert.deepEqual(result.createdNodeIds, ["skill-img"]);
  assert.deepEqual(result.warnings, ["skill path"]);
  assert.equal(graphStore.nodes.length, 0);
});

test("assistantActionExecutor: keeps legacy fallback when canvas skills cannot handle actions", async () => {
  const graphStore = createGraphStore();
  const result = await executeAssistantActions({
    actions: [{ id: "note", type: "create_node", nodeType: "comment", data: { text: "legacy" } }],
    graphStore,
    canvasSkillsRuntime: { canHandleActions() { return false; } },
  });
  assert.deepEqual(result.createdNodeIds, ["note"]);
  assert.equal(graphStore.nodes[0].type, "comment");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantActionExecutor.test.js
```

Expected: FAIL because executor module and runtime routing do not exist.

- [ ] **Step 4: Implement Canvas Skill executor**

Create `modules/assistant/assistantCanvasSkillExecutor.js`:

```js
import { bindAssistantCanvasReferences } from "./assistantCanvasReferenceBinder.js";
import { mapAssistantNodeParameters } from "./assistantCanvasParameterMapper.js";
import { CANVAS_SKILL_IDS, isAiNodeActionConvertible, shouldConfirmCanvasSkillBatch, skillIdForAiAction } from "./assistantCanvasSkillRegistry.js";

function text(value) { return String(value ?? "").trim(); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function clone(value) { if (value == null) return value; return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function findNode(graphStore, id) { return graphStore?.nodes?.find?.((node) => text(node?.id) === text(id)) || graphStore?.getNode?.(id) || null; }
function nodeTypeOf(action, graphStore, idMap) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const explicit = text(action?.nodeType || data.nodeType || data.type);
  if (explicit) return explicit;
  const nodeId = idMap.get(text(action?.nodeId || action?.id)) || text(action?.nodeId || action?.id);
  const node = findNode(graphStore, nodeId);
  return text(node?.type || node?.nodeType || node?.data?.nodeType || node?.data?.type);
}
function defaultName(nodeType) {
  if (nodeType === "ai-image") return "生成图片";
  if (nodeType === "ai-text") return "生成文本";
  if (nodeType === "ai-video") return "生成视频";
  return "生成节点";
}
function createEmptyResult() {
  return { appliedCount: 0, createdNodeIds: [], updatedNodeIds: [], queuedGenerationNodeIds: [], startedGenerationNodeIds: [], failedGenerationNodeIds: [], skippedVideoGenerationNodeIds: [], boundReferenceNodeIds: [], warnings: [], canvasSkillReceipts: [] };
}
function mergeWarnings(result, warnings) { asArray(warnings).filter(Boolean).forEach((warning) => result.warnings.push(String(warning))); }

export function createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle, referenceBinder = bindAssistantCanvasReferences, workflowSkills = null, assetSkills = null, presetAdapter = null } = {}) {
  function canHandleActions(actions = []) {
    return asArray(actions).some((action) => isAiNodeActionConvertible(action, { graphStore }) || ["apply_workflow", "save_workflow", "update_workflow", "add_asset", "save_asset", "use_asset"].includes(text(action?.type)));
  }
  async function executeActions({ actions = [], agentMode = "plan", videoAuthorized = false } = {}) {
    const result = createEmptyResult();
    const idMap = new Map();
    const calls = asArray(actions).map((action) => ({ skillId: skillIdForAiAction(action, { graphStore }), nodeType: nodeTypeOf(action, graphStore, idMap) })).filter((call) => call.skillId);
    const needsConfirm = shouldConfirmCanvasSkillBatch(calls, { agentMode });
    if (needsConfirm && agentMode !== "act" && videoAuthorized !== true) {
      for (const action of asArray(actions)) {
        if (nodeTypeOf(action, graphStore, idMap) === "ai-video" && ["queue_generation_task", "run_prompt_preset_generation"].includes(text(action.type))) {
          result.skippedVideoGenerationNodeIds.push(text(action.nodeId || action.id));
        }
      }
      result.warnings.push("canvas skill generation requires confirmation before execution");
      return result;
    }
    for (const [index, action] of asArray(actions).entries()) {
      const type = text(action.type);
      const nodeType = nodeTypeOf(action, graphStore, idMap);
      if (type === "create_node" && isAiNodeActionConvertible(action, { graphStore })) {
        const mapped = mapAssistantNodeParameters({ nodeType, action, existingData: {} });
        const created = await nodeLifecycle.createDraftNode({ nodeType, name: text(action.name || action.title) || defaultName(nodeType), patch: mapped.patch, width: action.size?.width, height: action.size?.height });
        const nodeId = text(created.nodeId);
        idMap.set(text(action.id || action.nodeId || `action-${index}`), nodeId);
        result.createdNodeIds.push(nodeId);
        mergeWarnings(result, mapped.warnings);
        if (asArray(action.references).length) {
          const bound = referenceBinder({ graphStore, targetNodeId: nodeId, references: action.references });
          result.boundReferenceNodeIds.push(...bound.boundReferences.map((ref) => ref.sourceId));
          mergeWarnings(result, bound.warnings);
        }
        result.canvasSkillReceipts.push({ skillId: skillIdForAiAction(action, { graphStore }), nodeId, status: "completed" });
        result.appliedCount += 1;
        continue;
      }
      if (["update_node", "update_node_data", "set_node_prompt", "set_node_model"].includes(type) && isAiNodeActionConvertible(action, { graphStore })) {
        const nodeId = idMap.get(text(action.nodeId || action.id)) || text(action.nodeId || action.id);
        const existingData = findNode(graphStore, nodeId)?.data || {};
        const mapped = mapAssistantNodeParameters({ nodeType, action, existingData });
        await nodeLifecycle.updateNode({ nodeId, patch: mapped.patch });
        result.updatedNodeIds.push(nodeId);
        mergeWarnings(result, mapped.warnings);
        if (asArray(action.references).length) {
          const bound = referenceBinder({ graphStore, targetNodeId: nodeId, references: action.references });
          result.boundReferenceNodeIds.push(...bound.boundReferences.map((ref) => ref.sourceId));
          mergeWarnings(result, bound.warnings);
        }
        result.canvasSkillReceipts.push({ skillId: skillIdForAiAction(action, { graphStore }), nodeId, status: "completed" });
        result.appliedCount += 1;
        continue;
      }
      if (["queue_generation_task", "run_prompt_preset_generation"].includes(type) && isAiNodeActionConvertible(action, { graphStore })) {
        const nodeId = idMap.get(text(action.nodeId || action.id)) || text(action.nodeId || action.id);
        if (type === "run_prompt_preset_generation" && presetAdapter?.applyPresetToNode) await presetAdapter.applyPresetToNode({ nodeId, action: clone(action) });
        const node = findNode(graphStore, nodeId);
        const prompt = text(action.prompt || node?.data?.prompt || action.template);
        result.queuedGenerationNodeIds.push(nodeId);
        const generated = await nodeLifecycle.generateNode({ nodeId, nodeType, prompt, task: clone(action) });
        if (generated?.started) result.startedGenerationNodeIds.push(nodeId);
        else if (generated?.retryable) result.warnings.push(`generation retryable for ${nodeId}: ${generated.reason || "not ready"}`);
        else result.failedGenerationNodeIds.push(nodeId);
        result.canvasSkillReceipts.push({ skillId: skillIdForAiAction(action, { graphStore }), nodeId, status: generated?.started ? "started" : "retryable", reason: generated?.reason || "" });
        result.appliedCount += 1;
        continue;
      }
      if (type === "apply_workflow" && workflowSkills?.applyWorkflow) {
        const applied = await workflowSkills.applyWorkflow(action);
        result.createdNodeIds.push(...asArray(applied.createdNodeIds));
        result.appliedCount += 1;
        continue;
      }
      if (["save_workflow", "create_workflow"].includes(type) && workflowSkills?.saveWorkflow) {
        const saved = await workflowSkills.saveWorkflow(action);
        result.canvasSkillReceipts.push({ skillId: CANVAS_SKILL_IDS.workflowSave, workflowId: saved.workflowId, status: "completed" });
        result.appliedCount += 1;
        continue;
      }
      if (type === "update_workflow" && workflowSkills?.updateWorkflow) {
        const updated = await workflowSkills.updateWorkflow(action);
        result.canvasSkillReceipts.push({ skillId: CANVAS_SKILL_IDS.workflowUpdate, workflowId: updated.workflowId, status: "completed" });
        result.appliedCount += 1;
        continue;
      }
      if (["add_asset", "save_asset"].includes(type) && assetSkills?.addAsset) {
        const saved = await assetSkills.addAsset({ ...action, explicitIntent: action.explicitIntent !== false });
        result.canvasSkillReceipts.push({ skillId: CANVAS_SKILL_IDS.assetAdd, assetId: saved.assetId, status: "completed" });
        result.appliedCount += 1;
      }
    }
    return result;
  }
  return { canHandleActions, executeActions };
}
```

- [ ] **Step 5: Route from legacy action executor to Canvas Skills**

Modify the `executeAssistantActions` signature in `modules/assistant/assistantActionExecutor.js` to accept `canvasSkillsRuntime`:

```js
export async function executeAssistantActions({
  actions,
  graphStore,
  generationTaskRunner = defaultGenerationTaskRunner,
  generationTaskStore = null,
  templateStore = null,
  videoAuthorized = false,
  canvasSkillsRuntime = null,
  agentMode = "plan",
} = {}) {
```

After the graphStore guard and before creating `idMap`, add:

```js
  if (canvasSkillsRuntime && typeof canvasSkillsRuntime.canHandleActions === "function" && canvasSkillsRuntime.canHandleActions(actions)) {
    return canvasSkillsRuntime.executeActions({ actions, graphStore, videoAuthorized, agentMode });
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantActionExecutor.test.js
```

Expected: PASS.

---

### Task 7: Runtime Injection From Autoload And Main Canvas Flow

**Files:**
- Modify: `main.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Modify: `modules/app/appAssistantPanel.autoload.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Write failing autoload runtime injection test**

Append to `modules/app/appAssistantPanel.autoload.test.js`:

```js
test("appAssistantPanel.autoload: injects canvas skills runtime into execute payload", async () => {
  const document = createFakeDocument();
  const executed = [];
  const graphStore = { nodes: [], edges: [], addNode(node) { this.nodes.push(node); return node; }, updateNodeData() {}, setSelectedNodes() {}, getState() { return { nodes: this.nodes, edges: this.edges }; } };
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() { return { reply: "ok", actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }] }; },
      async validateActions(payload) { return { success: true, actions: payload.actions }; },
    },
    graphStore,
    nodeFlows: { createNodeAtCursor() { return { id: "img-1", type: "ai-image", data: {} }; } },
    rendererBridge: { isNodeMounted: () => false, nodeInstances: new Map() },
    executeActions: async (payload) => { executed.push(payload); return { appliedCount: 1, createdNodeIds: ["img-1"] }; },
    autoInstall: false,
  });
  await controller.state.sendMessage("generate image");
  assert.ok(executed[0].canvasSkillsRuntime);
  assert.equal(typeof executed[0].canvasSkillsRuntime.executeActions, "function");
});
```

- [ ] **Step 2: Write failing panel state passthrough test**

Append to `modules/app/appAssistantPanel.test.js`:

```js
test("createAssistantPanelState: passes canvas skills runtime and agent mode to executor", async () => {
  const payloads = [];
  const canvasSkillsRuntime = { canHandleActions: () => false, executeActions: async () => ({ appliedCount: 0 }) };
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore: { nodes: [], edges: [] },
    api: { async chat() { return { reply: "ok", actions: [{ id: "img", type: "create_node", nodeType: "ai-image" }] }; }, async validateActions(payload) { return { success: true, actions: payload.actions }; } },
    canvasSkillsRuntime,
    executeActions: async (payload) => { payloads.push(payload); return { appliedCount: 1, createdNodeIds: ["img"] }; },
    modelOptions: [{ provider: "model_registry", model: "m", id: "m", displayName: "M", configured: true, supportsText: true }],
    selectedModel: { provider: "model_registry", model: "m", id: "m", displayName: "M", configured: true, supportsText: true },
  });
  await state.sendMessage("make image");
  assert.equal(payloads[0].canvasSkillsRuntime, canvasSkillsRuntime);
  assert.equal(payloads[0].agentMode, "act");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js
```

Expected: FAIL because state/autoload does not pass runtime yet.

- [ ] **Step 4: Expose real node flow from main runtime**

In `main.js`, immediately after `const appCanvasNodeFlows = createAppCanvasNodeFlows(...)` is initialized, add a stable window hook before `appBusinessEvents` uses it:

```js
window.__huanyingAppCanvasNodeFlows = appCanvasNodeFlows;
```

If direct patching minified `main.js` is risky, use a minimal exact replacement around the existing `const appCanvasNodeFlows=createAppCanvasNodeFlows(` segment and do not reformat the file.

- [ ] **Step 5: Build Canvas Skills runtime in autoload**

Modify imports in `modules/app/appAssistantPanel.autoload.js`:

```js
import { createAssistantCanvasSkillExecutor } from "../assistant/assistantCanvasSkillExecutor.js";
import { createAssistantCanvasNodeLifecycle } from "../assistant/assistantCanvasNodeLifecycle.js";
import { createAssistantCanvasWorkflowSkills } from "../assistant/assistantCanvasWorkflowSkills.js";
import { createAssistantCanvasAssetSkills } from "../assistant/assistantCanvasAssetSkills.js";
import * as workflowCanvas from "../workflows/workflowCanvas.js";
import * as workflowService from "../workflows/workflowService.js";
import { saveAssetToServer } from "../../api/index.js";
```

Add helper:

```js
export function createCanvasSkillsRuntime({ graphStore, nodeFlows = globalThis.window?.__huanyingAppCanvasNodeFlows, rendererBridge = globalThis.window?.__v2RendererBridge, assetStore = null } = {}) {
  const nodeLifecycle = createAssistantCanvasNodeLifecycle({ graphStore, nodeFlows, rendererBridge });
  const workflowSkills = createAssistantCanvasWorkflowSkills({ graphStore, workflowCanvas, workflowService });
  const effectiveAssetStore = assetStore || graphStore;
  const assetSkills = createAssistantCanvasAssetSkills({ graphStore, assetStore: effectiveAssetStore, saveAssetToServer });
  return createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle, workflowSkills, assetSkills });
}
```

Update `installAppAssistantPanel` parameters to accept:

```js
  nodeFlows = globalThis.window?.__huanyingAppCanvasNodeFlows,
  rendererBridge = globalThis.window?.__v2RendererBridge,
  assetStore = null,
  canvasSkillsRuntime = null,
```

After `graphAdapter` is created, add:

```js
  const effectiveCanvasSkillsRuntime =
    canvasSkillsRuntime ||
    createCanvasSkillsRuntime({ graphStore: graphAdapter, nodeFlows: resolvedLiveFixture?.nodeFlows || nodeFlows, rendererBridge: resolvedLiveFixture?.rendererBridge || rendererBridge, assetStore: resolvedLiveFixture?.assetStore || assetStore });
```

Pass it into `createAppAssistantPanel`:

```js
    canvasSkillsRuntime: effectiveCanvasSkillsRuntime,
```

- [ ] **Step 6: Pass runtime through panel state**

Modify `createAssistantPanelState` and `createAppAssistantPanel` in `modules/app/appAssistantPanel.js` to accept `canvasSkillsRuntime = null`.

In `applyPendingActionsOnce`, extend `executePayload`:

```js
      canvasSkillsRuntime,
      agentMode: state.agentMode,
```

In `createAppAssistantPanel`, pass `canvasSkillsRuntime` into `createAssistantPanelState`.

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js
```

Expected: PASS.

---

### Task 8: Confirmation Policy Alignment And Operation Cards

**Files:**
- Modify: `modules/assistant/assistantActionPreviewModel.js`
- Modify: `modules/assistant/assistantActionPreviewModel.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Write failing preview policy tests**

Append to `modules/assistant/assistantActionPreviewModel.test.js`:

```js
test("assistantActionPreviewModel: act mode does not strong-confirm video generation", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" },
  ], { agentMode: "act" });
  assert.equal(model.riskSummary.videoGeneration, 1);
  assert.equal(model.requiresStrongConfirmation, false);
  assert.equal(model.requiresConfirmation, false);
  assert.doesNotMatch(formatAssistantActionPreviewModel(model), /Strong confirmation required/);
});

test("assistantActionPreviewModel: plan mode still strong-confirms video generation", () => {
  const model = buildAssistantActionPreviewModel([
    { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" },
  ], { agentMode: "plan" });
  assert.equal(model.requiresStrongConfirmation, true);
  assert.equal(model.requiresConfirmation, true);
});
```

- [ ] **Step 2: Write failing panel preview test**

Append to `modules/app/appAssistantPanel.test.js`:

```js
test("createAssistantPanelState: act video generation is not blocked by strong preview confirmation", async () => {
  const executions = [];
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore: { nodes: [{ id: "video-1", type: "ai-video", data: {} }], edges: [] },
    api: {
      async chat() { return { reply: "ok", actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" }] }; },
      async validateActions(payload) { return { success: true, actions: payload.actions }; },
    },
    executeActions: async (payload) => { executions.push(payload); return { appliedCount: 1, queuedGenerationNodeIds: ["video-1"], startedGenerationNodeIds: ["video-1"] }; },
    modelOptions: [{ provider: "model_registry", model: "m", id: "m", displayName: "M", configured: true, supportsText: true }],
    selectedModel: { provider: "model_registry", model: "m", id: "m", displayName: "M", configured: true, supportsText: true },
  });
  await state.sendMessage("生成视频");
  assert.equal(executions.length, 1);
  assert.equal(executions[0].videoAuthorized, true);
  assert.equal(executions[0].agentMode, "act");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.test.js
```

Expected: FAIL because preview model ignores `agentMode` for strong confirmation.

- [ ] **Step 4: Implement preview policy alignment**

Modify `modules/assistant/assistantActionPreviewModel.js` inside `buildAssistantActionPreviewModel` after `selectedActions` is computed:

```js
  const normalizedAgentMode = options.agentMode === "act" ? "act" : "plan";
```

Replace the existing strong confirmation block:

```js
  const confirmation = summarizeAssistantConfirmation(selectedActions, options);
  const requiresStrongConfirmation =
    confirmation === AssistantConfirmationDecision.StrongConfirm || videoGenerationCount > 0;
```

with:

```js
  const confirmation = summarizeAssistantConfirmation(selectedActions, options);
  const requiresStrongConfirmation =
    normalizedAgentMode !== "act" &&
    (confirmation === AssistantConfirmationDecision.StrongConfirm || videoGenerationCount > 0);
```

Replace the returned `requiresConfirmation` expression:

```js
    requiresConfirmation:
      requiresStrongConfirmation ||
      confirmation === AssistantConfirmationDecision.Confirm ||
      confirmation === AssistantConfirmationDecision.StrongConfirm,
```

with:

```js
    requiresConfirmation:
      normalizedAgentMode !== "act" &&
      (requiresStrongConfirmation ||
        confirmation === AssistantConfirmationDecision.Confirm ||
        confirmation === AssistantConfirmationDecision.StrongConfirm),
```

Modify `formatAssistantActionPreviewModel` so the strong warning only prints when the model actually requires strong confirmation. Replace:

```js
  if (model.riskSummary?.videoGeneration) {
    lines.push(`Strong confirmation required for ${model.riskSummary.videoGeneration} video generation task${model.riskSummary.videoGeneration > 1 ? "s" : ""}.`);
  } else if (model.requiresConfirmation) {
```

with:

```js
  if (model.riskSummary?.videoGeneration && model.requiresStrongConfirmation) {
    lines.push(`Strong confirmation required for ${model.riskSummary.videoGeneration} video generation task${model.riskSummary.videoGeneration > 1 ? "s" : ""}.`);
  } else if (model.requiresConfirmation) {
```

- [ ] **Step 5: Pass `agentMode` wherever preview models are built**

In `modules/app/appAssistantPanel.js`, replace:

```js
const previewModel = buildAssistantActionPreviewModel(pendingToken, { selectedIndexes });
```

with:

```js
const previewModel = buildAssistantActionPreviewModel(pendingToken, { selectedIndexes, agentMode: state.agentMode });
```

In the state `previewModel()` method, replace:

```js
return buildAssistantActionPreviewModel(state.pendingActions, { selectedIndexes: currentSelectedActionIndexes() });
```

with:

```js
return buildAssistantActionPreviewModel(state.pendingActions, { selectedIndexes: currentSelectedActionIndexes(), agentMode: state.agentMode });
```

If the exact second line differs, keep the same method body shape and pass `{ selectedIndexes: currentSelectedActionIndexes(), agentMode: state.agentMode }` to `buildAssistantActionPreviewModel`.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.test.js
```

Expected: PASS.

---

### Task 9: End-To-End Canvas Skills Integration Tests

**Files:**
- Create: `modules/assistant/assistantCanvasSkills.integration.test.js`

- [ ] **Step 1: Write integration tests**

Create `modules/assistant/assistantCanvasSkills.integration.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasSkillExecutor } from "./assistantCanvasSkillExecutor.js";
import { createAssistantCanvasNodeLifecycle } from "./assistantCanvasNodeLifecycle.js";
import { createAssistantCanvasWorkflowSkills } from "./assistantCanvasWorkflowSkills.js";
import { createAssistantCanvasAssetSkills } from "./assistantCanvasAssetSkills.js";

function graph() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) { nodes.push(node); return node; },
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(nodeId, patch) { const node = nodes.find((item) => item.id === nodeId); if (node) node.data = { ...(node.data || {}), ...patch }; },
    setSelectedNodes(nodeIds) { this.selectedNodeIds = nodeIds; },
    getState() { return { nodes, edges }; },
  };
}

function runtime(graphStore) {
  let nextId = 0;
  const generated = [];
  const bridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: {
      map: new Map(),
      get(id) { return this.map.get(id); },
      set(id, value) { this.map.set(id, value); return this; },
    },
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const id = `${nodeType}-${++nextId}`;
      const node = { id, type: nodeType, width, height, name, data: {} };
      graphStore.addNode(node);
      bridge.nodeInstances.set(id, { async _onGenerate(prompt, task) { generated.push({ nodeId: id, prompt, task }); return { started: true }; } });
      return node;
    },
  };
  const nodeLifecycle = createAssistantCanvasNodeLifecycle({ graphStore, nodeFlows, rendererBridge: bridge, pollIntervalMs: 1, readinessTimeoutMs: 20 });
  const workflowSkills = createAssistantCanvasWorkflowSkills({
    graphStore,
    workflowService: { loadWorkflowsFromServer: async () => [{ id: "wf-1", name: "故事工作流", workflowData: {} }], saveWorkflowUsage: async () => null, saveNewWorkflowFromCanvas: async () => ({ id: "wf-new" }), saveUpdatedWorkflowFromCanvas: async (id) => ({ id }) },
    workflowCanvas: { applyWorkflowToCanvas: () => ({ nodes: [{ id: "wf-node", type: "ai-text", data: {} }], edges: [] }) },
  });
  const savedAssets = [];
  const assetSkills = createAssistantCanvasAssetSkills({ graphStore, assetStore: { getState: () => ({ assets: [] }), addAsset: (asset) => savedAssets.push(asset) }, saveAssetToServer: async (payload) => ({ ...payload, id: "asset-1" }) });
  return { executor: createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle, workflowSkills, assetSkills }), generated, savedAssets };
}

test("canvas skills integration: image generation creates editable node and starts generator", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "role-a", type: "source-image", name: "角色A", data: {} });
  const { executor, generated } = runtime(graphStore);
  const result = await executor.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "用 @角色A 生成 3 张头像", batchSize: 3, references: [{ id: "role-a", type: "canvas_node", label: "角色A" }] },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "用 @角色A 生成 3 张头像" },
    ],
    agentMode: "plan",
  });
  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(graphStore.nodes.find((node) => node.id === "ai-image-1").data.batchSize, 3);
  assert.equal(graphStore.edges[0].source, "role-a");
  assert.equal(generated.length, 1);
});

test("canvas skills integration: video prep is editable and plan video generation waits", async () => {
  const graphStore = graph();
  const { executor } = runtime(graphStore);
  const prep = await executor.executeActions({ actions: [{ id: "video", type: "create_node", nodeType: "ai-video", prompt: "镜头" }], agentMode: "plan" });
  const blocked = await executor.executeActions({ actions: [{ type: "queue_generation_task", nodeId: "video", nodeType: "ai-video", prompt: "镜头" }], agentMode: "plan", videoAuthorized: false });
  assert.deepEqual(prep.createdNodeIds, ["ai-video-1"]);
  assert.deepEqual(blocked.skippedVideoGenerationNodeIds, ["video"]);
});

test("canvas skills integration: workflow apply and explicit asset save use existing adapters", async () => {
  const graphStore = graph();
  const { executor, savedAssets } = runtime(graphStore);
  await executor.executeActions({ actions: [{ type: "apply_workflow", workflowId: "wf-1" }], agentMode: "act" });
  const saved = await executor.executeActions({ actions: [{ type: "save_asset", sourceNodeId: "wf-node", assetType: "角色", name: "角色资产", explicitIntent: true }], agentMode: "act" });
  assert.equal(graphStore.nodes.some((node) => node.id === "wf-node"), true);
  assert.equal(saved.canvasSkillReceipts[0].assetId, "asset-1");
  assert.equal(savedAssets.length, 1);
});
```

- [ ] **Step 2: Run integration tests**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkills.integration.test.js
```

Expected: PASS.

- [ ] **Step 3: Run all Canvas Skills focused tests together**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasReferenceBinder.test.js modules\assistant\assistantCanvasNodeLifecycle.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasAssetSkills.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantCanvasSkills.integration.test.js
```

Expected: PASS.

---

### Task 10: Final Regression, Manual Acceptance, And Changed-File Report

**Files:**
- Modify: `docs/agent_canvas_skills.md`
- No commit step because this workspace is not a git repo.

- [ ] **Step 1: Update the capability document with test coverage**

Replace `docs/agent_canvas_skills.md` with this expanded content:

```md
# Agent Canvas Skills Capability Inventory

Date: 2026-06-06

| Skill ID | Description | Parameters | Required context | Main dependency | Confirmation policy | Failure behavior | Test coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `imageNode.createDraft` | Create editable image draft | `prompt`, `modelId`, `aspectRatio`, `imageSize`, `quality`, `batchSize`, `references`, `advancedOptions` | graph store, node flow | `createNodeAtCursor` | none | failed receipt if no node id | `assistantCanvasNodeLifecycle.test.js`, `assistantCanvasSkills.integration.test.js` |
| `imageNode.update` | Update editable image node | same as create patch | graph store | `updateNodeData` | none | warn missing target | `assistantCanvasParameterMapper.test.js` |
| `imageNode.bindReferences` | Bind image references | `references` | graph store | reference binder | none | bind valid refs, warn invalid refs | `assistantCanvasReferenceBinder.test.js` |
| `imageNode.applyPreset` | Apply prompt preset | `presetId`, `presetName`, `inputs` | prompt preset adapter | `applyPromptPresetToPromptEl` | none | warn missing preset | `slashMenu.test.js` |
| `imageNode.generate` | Submit image generation | `prompt`, `provider`, `modelId`, `references` | mounted image node | `_onGenerate/onGenerate` | plan confirms only multi-node | keep editable draft and retry warning | `assistantCanvasSkillExecutor.test.js` |
| `textNode.createDraft` | Create editable text draft | `prompt`, `modelId`, `provider`, `references`, `advancedOptions` | graph store, node flow | `createNodeAtCursor` | none | failed receipt if no node id | `assistantCanvasNodeLifecycle.test.js` |
| `textNode.update` | Update editable text node | text patch | graph store | `updateNodeData` | none | warn missing target | `assistantCanvasParameterMapper.test.js` |
| `textNode.bindReferences` | Bind text references | `references` | graph store | reference binder | none | bind valid refs, warn invalid refs | `assistantCanvasReferenceBinder.test.js` |
| `textNode.applyPreset` | Apply text preset | `presetId`, `presetName`, `inputs` | prompt preset adapter | `applyPromptPresetToPromptEl` | none | warn missing preset | `slashMenu.test.js` |
| `textNode.generate` | Submit text generation | `prompt`, `provider`, `modelId` | mounted text node | `_onGenerate/onGenerate` | plan confirms only multi-node | keep editable draft and retry warning | `assistantCanvasSkillExecutor.test.js` |
| `videoNode.createDraft` | Create editable video draft | `prompt`, `duration`, `fps`, `resolution`, `references`, `advancedOptions` | graph store, node flow | `createNodeAtCursor` | none | keep editable draft | `assistantCanvasSkills.integration.test.js` |
| `videoNode.update` | Update editable video node | video patch | graph store | `updateNodeData` | none | warn missing target | `assistantCanvasParameterMapper.test.js` |
| `videoNode.bindReferences` | Bind video references | `references` | graph store | reference binder | none | bind valid refs, warn invalid refs | `assistantCanvasReferenceBinder.test.js` |
| `videoNode.applyPreset` | Apply video preset | `presetId`, `presetName`, `inputs` | prompt preset adapter | `applyPromptPresetToPromptEl` | none | warn missing preset | `slashMenu.test.js` |
| `videoNode.generate` | Submit video generation | `prompt`, `provider`, `modelId` | mounted video node | `_onGenerate/onGenerate` | plan confirm, act none | keep editable draft and retry warning | `assistantCanvasSkillExecutor.test.js`, `assistantActionPreviewModel.test.js` |
| `node.bindReferences` | Bind `@` references | uploaded references, canvas nodes, assets | graph store | `addEdge`, `updateNodeData` | none | bind valid refs and warn invalid refs | `assistantCanvasReferenceBinder.test.js` |
| `workflow.apply` | Apply workflow | `workflowId`, `name`, `placement` | graph/workspace store | `applyWorkflowToCanvas` | none | success only after nodes/edges are returned | `assistantCanvasWorkflowSkills.test.js` |
| `workflow.save` | Save current canvas or selection | `name`, `scope`, `selectedNodeIds`, `cover`, `tags` | graph/workspace store | `saveNewWorkflowFromCanvas` | broad inferred scope confirms in plan | success only after persistence | `assistantCanvasWorkflowSkills.test.js` |
| `workflow.update` | Update existing workflow | `workflowId`, `name`, `scope`, `selectedNodeIds`, `cover`, `tags` | graph/workspace store | `saveUpdatedWorkflowFromCanvas` | plan confirm, act none | success only after persistence | `assistantCanvasWorkflowSkills.test.js` |
| `asset.list` | Read assets | `query`, `category` | asset store | existing asset state | none | empty groups are valid | `assistantCanvasAssetSkills.test.js` |
| `asset.use` | Use asset as reference | `assetId`, `query` | asset store, graph store | reference binder | none | warn if asset missing | `assistantCanvasAssetSkills.test.js` |
| `asset.add` | Save asset explicitly | `sourceNodeId`, `resultId`, `assetType`, `name`, `tags` | graph store, asset API | `saveAssetToServer` | explicit save intent required | no local success until persistence | `assistantCanvasAssetSkills.test.js` |
```

- [ ] **Step 2: Run final focused regression**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantCanvasParameterMapper.test.js modules\assistant\assistantCanvasReferenceBinder.test.js modules\assistant\assistantCanvasNodeLifecycle.test.js modules\assistant\assistantCanvasWorkflowSkills.test.js modules\assistant\assistantCanvasAssetSkills.test.js modules\assistant\assistantCanvasSkillExecutor.test.js modules\assistant\assistantCanvasSkills.integration.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\slashMenu.test.js
```

Expected: PASS.

- [ ] **Step 3: Manual browser acceptance checklist**

Run the app with the existing local startup path used by this project, then verify these exact scenarios in the browser:

```md
- [ ] Agent input `生成一张赛博猫 16:9 高清图`: editable image node appears, prompt box and controls are visible, generation starts.
- [ ] Agent input `用 @角色A 生成 3 张头像`: reference edge/pill is created, `batchSize` is 3, generation starts.
- [ ] Agent input `/已有预设 生成一段宣传文案`: editable text node uses the preset helper and generates text.
- [ ] Agent input `准备一个视频节点，不生成`: editable video node appears and generation does not start.
- [ ] Plan mode input `生成视频`: confirmation card appears before video generation.
- [ ] Act mode input `生成视频`: generation submits without confirmation.
- [ ] Agent input `把这张结果保存到我的资产`: asset is added only after persistence succeeds.
- [ ] Agent input `套用某个工作流`: workflow nodes and edges are created through workflow adapter and selected.
- [ ] Simulated renderer readiness timeout: draft node remains editable and card says retryable.
```

- [ ] **Step 4: Record changed files because there is no git repo**

Run:

```powershell
Get-ChildItem -LiteralPath modules\assistant -Filter 'assistantCanvas*.js' | Select-Object -ExpandProperty FullName
Get-ChildItem -LiteralPath docs -Filter 'agent_canvas_skills.md' | Select-Object -ExpandProperty FullName
```

Expected: output includes every new `assistantCanvas*.js` source/test file and `docs\agent_canvas_skills.md`.

---

## Self-Review

### Spec Coverage

- Confirmed: Agent AI text/image/video node creation routes through Canvas Skills and `createNodeAtCursor` in Tasks 3, 6, and 7.
- Confirmed: Generation waits for mounted renderer and calls existing `_onGenerate/onGenerate` in Task 3.
- Confirmed: Old action compatibility remains because Task 6 only adds runtime-first routing and keeps fallback logic.
- Confirmed: `@` references create real graph edges and node metadata in Task 2 and integration coverage in Task 9.
- Confirmed: Slash preset support uses an exported helper instead of UI click simulation in Task 5.
- Confirmed: plan/act confirmation rules are implemented in Tasks 1, 6, and 8.
- Confirmed: workflows and assets use existing adapters/persistence in Task 4 and Task 9.
- Confirmed: unknown advanced options become warnings and are not written in Task 2.
- Confirmed: readiness timeout preserves the draft node and returns retryable metadata in Task 3.
- Confirmed: capability inventory is created and expanded in Tasks 1 and 10.

### Placeholder Scan

- Placeholder scan found no banned placeholder phrases or unspecified test steps.
- Each code-changing task includes exact file paths, code blocks, commands, and expected results.
- Commit steps are intentionally replaced by a changed-file report because `git status` returned a non-repository state.

### Type Consistency

- `canvasSkillsRuntime` is passed from `installAppAssistantPanel` to `createAppAssistantPanel`, from `createAppAssistantPanel` to `createAssistantPanelState`, and from state execution to `executeAssistantActions`.
- `createAssistantCanvasSkillExecutor().executeActions({ actions, graphStore, videoAuthorized, agentMode })` matches the runtime call inserted into `assistantActionExecutor.js`.
- Registry skill IDs match executor receipt IDs and capability inventory rows.
- `nodeLifecycle.createDraftNode`, `nodeLifecycle.updateNode`, and `nodeLifecycle.generateNode` signatures are consistent across unit and integration tests.


