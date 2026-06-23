# Agent 面板二次交互优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Agent 面板二次交互优化：统一浮层关闭、支持输入 `@` 唤起引用菜单、用回复下交互卡片承载画布操作状态、按 `plan/act` 规则执行确认，并将面板命名改为 `幻映智能体`。

**Architecture:** 采用用户确认的 B 方案“适度模块化增强”：`modules/app/appAssistantPanel.js` 继续负责 DOM、状态串联和事件入口；新增 `assistantFloatingLayer.js` 管理菜单开关与外部关闭；新增 `assistantInteractionCards.js` 管理动作批次分析、确认规则和卡片状态。保持现有 mention resolver、conversation store、action validation、executor、streaming 机制，只在其边界处补齐交互能力。

**Tech Stack:** Browser DOM + ES Modules + Node built-in `node:test`；测试命令使用 `D:\Aic\node.exe --test --test-concurrency=1`。

---

## File Structure

- Create `modules/assistant/assistantFloatingLayer.js`: 悬浮层注册、打开、关闭、toggle、点击外部关闭、Esc 关闭和销毁监听。
- Create `modules/assistant/assistantFloatingLayer.test.js`: 覆盖来源按钮 toggle、菜单互斥、外部点击、Esc 和 destroy。
- Create `modules/assistant/assistantInteractionCards.js`: 分析 action batch、判断是否需要确认、创建 card model、更新 card 状态。
- Create `modules/assistant/assistantInteractionCards.test.js`: 覆盖 `plan/act` 确认规则、视频节点识别、多节点识别、状态更新不可变性。
- Modify `modules/assistant/assistantMentionResolver.js`: 补 query 过滤 references/assets，补资产整体空态仅在资产子菜单层表达。
- Modify `modules/assistant/assistantMentionResolver.test.js`: 覆盖 reference/query 过滤、资产根空态、分类空态。
- Modify `modules/app/appAssistantPanel.js`: 接入浮层控制器、输入 `@` 查询范围、mention 选择替换、卡片挂载/渲染/确认/取消、系统提示收敛、历史恢复、标题改名。
- Modify `modules/app/appAssistantPanel.p1Ui.test.js`: 覆盖模型菜单、mention 菜单、标题、系统提示不展示和卡片按钮 UI。
- Modify `modules/app/appAssistantPanel.test.js`: 覆盖 state 层卡片挂载、确认规则自动应用、取消规则、执行结果更新同卡片。
- Modify `modules/app/appAssistantPanel.context.test.js`: 覆盖历史会话恢复 cards 与上下文隔离。

---

### Task 1: Floating Layer Controller

**Files:**
- Create: `modules/assistant/assistantFloatingLayer.js`
- Create: `modules/assistant/assistantFloatingLayer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `modules/assistant/assistantFloatingLayer.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createFloatingLayerController } from "./assistantFloatingLayer.js";

function createFakeDocument() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    },
  };
}

function createFakeElement(name) {
  return {
    name,
    contains(target) {
      return target === this || target?.owner === this;
    },
  };
}

test("assistantFloatingLayer: source toggle opens and closes the same layer", () => {
  const documentRef = createFakeDocument();
  const changes = [];
  const controller = createFloatingLayerController({
    document: documentRef,
    onChange: (activeId) => changes.push(activeId),
  });
  const sourceEl = createFakeElement("source");
  const layerEl = createFakeElement("layer");

  controller.registerLayer("model", { sourceEl, layerEl });

  assert.equal(controller.toggle("model"), "model");
  assert.equal(controller.isOpen("model"), true);
  assert.equal(controller.activeId, "model");

  assert.equal(controller.toggle("model"), "");
  assert.equal(controller.isOpen("model"), false);
  assert.equal(controller.activeId, "");
  assert.deepEqual(changes, ["model", ""]);
});

test("assistantFloatingLayer: opening a second layer closes the first", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });

  controller.registerLayer("model", {
    sourceEl: createFakeElement("modelSource"),
    layerEl: createFakeElement("modelLayer"),
  });
  controller.registerLayer("mention", {
    sourceEl: createFakeElement("mentionSource"),
    layerEl: createFakeElement("mentionLayer"),
  });

  controller.open("model");
  assert.equal(controller.isOpen("model"), true);

  controller.open("mention");
  assert.equal(controller.isOpen("model"), false);
  assert.equal(controller.isOpen("mention"), true);
  assert.equal(controller.activeId, "mention");
});

test("assistantFloatingLayer: pointer outside closes active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("mention", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  controller.open("mention");
  documentRef.dispatch("pointerdown", { target: createFakeElement("outside") });

  assert.equal(controller.isOpen("mention"), false);
});

test("assistantFloatingLayer: pointer on source or layer does not close active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  const sourceEl = createFakeElement("source");
  const layerEl = createFakeElement("layer");
  controller.registerLayer("mention", { sourceEl, layerEl });

  controller.open("mention");
  documentRef.dispatch("pointerdown", { target: sourceEl });
  assert.equal(controller.isOpen("mention"), true);

  documentRef.dispatch("pointerdown", { target: layerEl });
  assert.equal(controller.isOpen("mention"), true);
});

test("assistantFloatingLayer: Escape closes active layer", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("model", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  controller.open("model");
  documentRef.dispatch("keydown", { key: "Escape" });

  assert.equal(controller.isOpen("model"), false);
});

test("assistantFloatingLayer: destroy removes document listeners", () => {
  const documentRef = createFakeDocument();
  const controller = createFloatingLayerController({ document: documentRef });
  controller.registerLayer("model", {
    sourceEl: createFakeElement("source"),
    layerEl: createFakeElement("layer"),
  });

  assert.equal(documentRef.listeners.has("pointerdown"), true);
  assert.equal(documentRef.listeners.has("keydown"), true);

  controller.destroy();

  assert.equal(documentRef.listeners.has("pointerdown"), false);
  assert.equal(documentRef.listeners.has("keydown"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantFloatingLayer.test.js
```

Expected: FAIL because `assistantFloatingLayer.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `modules/assistant/assistantFloatingLayer.js`:

```js
function callOnChange(onChange, activeId, previousId) {
  if (typeof onChange === "function" && activeId !== previousId) {
    onChange(activeId, previousId);
  }
}

function containsElement(container, target) {
  return Boolean(container && target && typeof container.contains === "function" && container.contains(target));
}

export function createFloatingLayerController({ document: documentRef, onChange } = {}) {
  const layers = new Map();
  let activeLayerId = "";

  function open(id) {
    const nextId = layers.has(id) ? String(id) : "";
    const previousId = activeLayerId;
    activeLayerId = nextId;
    callOnChange(onChange, activeLayerId, previousId);
    return activeLayerId;
  }

  function close(id = activeLayerId) {
    if (!id || activeLayerId !== id) return activeLayerId;
    const previousId = activeLayerId;
    activeLayerId = "";
    callOnChange(onChange, activeLayerId, previousId);
    return activeLayerId;
  }

  function closeAll() {
    return close(activeLayerId);
  }

  function toggle(id) {
    return activeLayerId === id ? close(id) : open(id);
  }

  function isOpen(id) {
    return Boolean(id) && activeLayerId === id;
  }

  function registerLayer(id, { sourceEl, layerEl } = {}) {
    if (!id) return;
    layers.set(String(id), { sourceEl, layerEl });
  }

  function handlePointerDown(event) {
    if (!activeLayerId) return;
    const activeLayer = layers.get(activeLayerId);
    if (!activeLayer) {
      closeAll();
      return;
    }
    const target = event?.target;
    if (containsElement(activeLayer.sourceEl, target) || containsElement(activeLayer.layerEl, target)) return;
    closeAll();
  }

  function handleKeyDown(event) {
    if (event?.key === "Escape") closeAll();
  }

  if (documentRef && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("pointerdown", handlePointerDown);
    documentRef.addEventListener("keydown", handleKeyDown);
  }

  function destroy() {
    if (documentRef && typeof documentRef.removeEventListener === "function") {
      documentRef.removeEventListener("pointerdown", handlePointerDown);
      documentRef.removeEventListener("keydown", handleKeyDown);
    }
    layers.clear();
    activeLayerId = "";
  }

  return {
    open,
    close,
    toggle,
    closeAll,
    isOpen,
    registerLayer,
    destroy,
    get activeId() {
      return activeLayerId;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantFloatingLayer.test.js
```

Expected: PASS.

---

### Task 2: Interaction Card Model

**Files:**
- Create: `modules/assistant/assistantInteractionCards.js`
- Create: `modules/assistant/assistantInteractionCards.test.js`

- [ ] **Step 1: Write the failing tests**

Create `modules/assistant/assistantInteractionCards.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAssistantActionBatch,
  createInteractionCard,
  shouldRequireCardConfirmation,
  updateInteractionCardStatus,
} from "./assistantInteractionCards.js";

function createNodeAction(id, nodeType = "text") {
  return {
    type: "create_node",
    node: { id, type: nodeType, title: `${nodeType} ${id}` },
  };
}

test("assistantInteractionCards: plan confirms single video generation", () => {
  const analysis = analyzeAssistantActionBatch([createNodeAction("video-1", "video")]);

  assert.equal(analysis.generatedNodeCount, 1);
  assert.equal(analysis.includesVideoGeneration, true);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), true);
});

test("assistantInteractionCards: plan confirms multi-node generation", () => {
  const analysis = analyzeAssistantActionBatch([
    createNodeAction("text-1", "text"),
    createNodeAction("image-1", "image"),
  ]);

  assert.equal(analysis.generatedNodeCount, 2);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), true);
});

test("assistantInteractionCards: plan does not confirm single ordinary node", () => {
  const analysis = analyzeAssistantActionBatch([createNodeAction("text-1", "text")]);

  assert.equal(analysis.generatedNodeCount, 1);
  assert.equal(analysis.includesVideoGeneration, false);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), false);
});

test("assistantInteractionCards: act never requires UI confirmation", () => {
  const analysis = analyzeAssistantActionBatch([
    createNodeAction("video-1", "video"),
    createNodeAction("image-1", "image"),
  ]);

  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "act" }), false);
});

test("assistantInteractionCards: creates expanded confirmation card for plan video", () => {
  const actions = [createNodeAction("video-1", "video")];
  const analysis = analyzeAssistantActionBatch(actions);
  const card = createInteractionCard({ id: "card-fixed", actions, analysis, agentMode: "plan" });

  assert.equal(card.id, "card-fixed");
  assert.equal(card.type, "canvas_actions");
  assert.equal(card.status, "needs_confirmation");
  assert.equal(card.requiresConfirmation, true);
  assert.equal(card.expanded, true);
  assert.match(card.title, /1/);
  assert.deepEqual(card.actions, actions);
});

test("assistantInteractionCards: creates collapsed pending card for act", () => {
  const actions = [createNodeAction("video-1", "video")];
  const analysis = analyzeAssistantActionBatch(actions);
  const card = createInteractionCard({ id: "card-act", actions, analysis, agentMode: "act" });

  assert.equal(card.status, "pending");
  assert.equal(card.requiresConfirmation, false);
  assert.equal(card.expanded, false);
  assert.equal(card.agentMode, "act");
});

test("assistantInteractionCards: updates card status without mutating original", () => {
  const actions = [createNodeAction("text-1", "text")];
  const card = createInteractionCard({
    id: "card-update",
    actions,
    analysis: analyzeAssistantActionBatch(actions),
    agentMode: "plan",
  });

  const updated = updateInteractionCardStatus(card, {
    status: "completed",
    result: { applied: 1 },
  });

  assert.equal(card.status, "pending");
  assert.equal(updated.status, "completed");
  assert.deepEqual(updated.result, { applied: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantInteractionCards.test.js
```

Expected: FAIL because `assistantInteractionCards.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `modules/assistant/assistantInteractionCards.js`:

```js
const NODE_GENERATION_ACTIONS = new Set([
  "create_node",
  "add_node",
  "generate_node",
  "queue_node_generation",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function actionType(action) {
  return text(action?.type || action?.action || action?.kind).toLowerCase();
}

function actionNode(action) {
  return action?.node || action?.payload?.node || action?.data?.node || action?.params?.node || null;
}

function actionNodeId(action, index) {
  const node = actionNode(action);
  return text(node?.id || action?.nodeId || action?.targetNodeId || action?.id || `action_${index}`);
}

function actionNodeType(action, graphStore) {
  const node = actionNode(action);
  const directType = text(node?.type || node?.nodeType || action?.nodeType || action?.targetType).toLowerCase();
  if (directType) return directType;
  const nodeId = text(action?.nodeId || action?.targetNodeId || node?.id);
  const graphNode = nodeId && typeof graphStore?.getNode === "function" ? graphStore.getNode(nodeId) : null;
  return text(graphNode?.type || graphNode?.nodeType).toLowerCase();
}

function isNodeGenerationAction(action) {
  const type = actionType(action);
  if (NODE_GENERATION_ACTIONS.has(type)) return true;
  if (type.includes("create") && type.includes("node")) return true;
  if (type.includes("generate") && type.includes("node")) return true;
  return false;
}

function isVideoType(type) {
  return ["video", "video_node", "generated_video"].includes(text(type).toLowerCase());
}

function createCardId() {
  return `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cardTitle(analysis) {
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) return `将生成 ${generatedNodeCount} 个节点`;
  if (generatedNodeCount === 1 && analysis?.includesVideoGeneration) return "将生成 1 个视频节点";
  if (generatedNodeCount === 1) return "将生成 1 个节点";
  return "将执行画布操作";
}

function cardSummary(analysis) {
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) return "多节点生成需要确认后提交。";
  if (generatedNodeCount === 1 && analysis?.includesVideoGeneration) return "视频节点生成需要确认后提交。";
  if (generatedNodeCount === 1) return "普通单节点将自动提交。";
  return "画布交互状态将在这里更新。";
}

export function analyzeAssistantActionBatch(actions, { graphStore } = {}) {
  const generatedNodeIds = new Set();
  let includesVideoGeneration = false;

  asArray(actions).forEach((action, index) => {
    if (!isNodeGenerationAction(action)) return;
    generatedNodeIds.add(actionNodeId(action, index));
    if (isVideoType(actionNodeType(action, graphStore))) {
      includesVideoGeneration = true;
    }
  });

  return {
    actionCount: asArray(actions).length,
    generatedNodeCount: generatedNodeIds.size,
    generatedNodeIds: Array.from(generatedNodeIds),
    includesVideoGeneration,
  };
}

export function shouldRequireCardConfirmation(analysis, { agentMode } = {}) {
  if (agentMode === "act") return false;
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) return true;
  return generatedNodeCount === 1 && Boolean(analysis?.includesVideoGeneration);
}

export function createInteractionCard({ actions = [], analysis, agentMode = "plan", id } = {}) {
  const normalizedAnalysis = analysis || analyzeAssistantActionBatch(actions);
  const requiresConfirmation = shouldRequireCardConfirmation(normalizedAnalysis, { agentMode });
  return {
    id: id || createCardId(),
    type: "canvas_actions",
    status: requiresConfirmation ? "needs_confirmation" : "pending",
    title: cardTitle(normalizedAnalysis),
    summary: cardSummary(normalizedAnalysis),
    expanded: requiresConfirmation,
    requiresConfirmation,
    agentMode: agentMode === "act" ? "act" : "plan",
    analysis: cloneJson(normalizedAnalysis),
    actions: cloneJson(actions),
    result: null,
    error: "",
  };
}

export function updateInteractionCardStatus(card, patch = {}) {
  return {
    ...cloneJson(card),
    ...cloneJson(patch),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantInteractionCards.test.js
```

Expected: PASS.

---

### Task 3: Mention Resolver Query and Asset Empty State

**Files:**
- Modify: `modules/assistant/assistantMentionResolver.js`
- Modify: `modules/assistant/assistantMentionResolver.test.js`

- [ ] **Step 1: Write failing tests**

Append to `modules/assistant/assistantMentionResolver.test.js`:

```js
test("assistantMentionResolver: query filters references, canvas nodes, and assets", () => {
  const menu = buildAssistantMentionMenu({
    query: "hero",
    attachments: [{ id: "ref-hero", name: "Hero Reference" }, { id: "ref-bg", name: "Background" }],
    nodes: [{ id: "node-hero", name: "Hero Node" }, { id: "node-bg", name: "Background Node" }],
    assets: {
      characters: [{ id: "asset-hero", name: "Hero Asset" }],
      scenes: [{ id: "asset-room", name: "Room Asset" }],
    },
  });

  assert.deepEqual(menu.references.map((item) => item.label), ["Hero Reference"]);
  assert.deepEqual(menu.canvasNodes.children.map((item) => item.label), ["Hero Node"]);
  assert.deepEqual(menu.assets.categories.find((item) => item.key === "characters").children.map((item) => item.label), ["Hero Asset"]);
  assert.deepEqual(menu.assets.categories.find((item) => item.key === "scenes").children, []);
});

test("assistantMentionResolver: empty asset library exposes empty text only under asset submenu", () => {
  const menu = buildAssistantMentionMenu({ assets: {}, attachments: [], nodes: [] });

  assert.equal(menu.assets.emptyText, "暂无资产");
  assert.equal(menu.assets.categories.every((category) => category.emptyText === "暂无资产"), true);
  assert.equal(menu.assets.categories.every((category) => category.disabled === false), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantMentionResolver.test.js
```

Expected: FAIL because references are not query-filtered and asset root empty metadata is missing.

- [ ] **Step 3: Update resolver**

Modify `buildAssistantMentionMenu` in `modules/assistant/assistantMentionResolver.js` to:

```js
export function buildAssistantMentionMenu({ attachments = [], nodes = [], assets = {}, query = "" } = {}) {
  const references = asArray(attachments)
    .map(normalizeReference)
    .filter(Boolean)
    .filter((reference) => matchesQuery(reference.label, query));
  const canvasChildren = asArray(nodes)
    .map(normalizeNode)
    .filter(Boolean)
    .filter((node) => matchesQuery(node.label, query))
    .slice(0, NODE_LIMIT);
  const categories = ASSET_CATEGORIES.map((category) => {
    const children = assetSourceForCategory(assets, category)
      .map((item) => normalizeAsset(item, category))
      .filter(Boolean)
      .filter((asset) => matchesQuery(asset.label, query));
    return {
      key: category.key,
      label: category.label,
      disabled: false,
      emptyText: children.length === 0 ? "暂无资产" : "",
      children,
    };
  });
  const hasAnyAsset = categories.some((category) => category.children.length > 0);
  return {
    references,
    referencesEmptyText: references.length === 0 ? "暂无参考内容" : "",
    canvasNodes: {
      label: "画布节点",
      emptyText: canvasChildren.length === 0 ? "暂无画布节点" : "",
      children: canvasChildren,
    },
    assets: {
      label: "我的资产",
      emptyText: hasAnyAsset ? "" : "暂无资产",
      categories,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\assistant\assistantMentionResolver.test.js
```

Expected: PASS. If an older assertion expected `disabled: true` for empty categories, update that assertion to expect `emptyText === "暂无资产"` and `children.length === 0`, because empty category rows must remain hoverable.

---

### Task 4: Panel Floating Menus and Typed @

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Write failing UI tests**

Add these tests to `modules/app/appAssistantPanel.p1Ui.test.js` near existing model/mention tests:

```js
test("appAssistantPanel P1: model button toggles menu without cycling selected model", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({
    document: documentRef,
    modelOptions: [
      { provider: "openai", model: "gpt-4.1-mini", label: "GPT Mini" },
      { provider: "anthropic", model: "claude-sonnet", label: "Claude Sonnet" },
    ],
  });
  panel.open();

  const modelButton = documentRef.querySelector(".hy-canvas-agent-model");
  const before = modelButton.textContent;
  modelButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-model-menu")?.hidden, false);
  assert.equal(modelButton.textContent, before);

  modelButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-model-menu")?.hidden, true);
  assert.equal(modelButton.textContent, before);
});

test("appAssistantPanel P1: floating menus close on outside click and Escape", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  const modelButton = documentRef.querySelector(".hy-canvas-agent-model");
  modelButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-model-menu")?.hidden, false);

  documentRef.body.dispatchEvent(new documentRef.defaultView.PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-model-menu")?.hidden, true);

  const mentionButton = documentRef.querySelector(".hy-canvas-agent-mention");
  mentionButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-mention-menu")?.hidden, false);

  documentRef.dispatchEvent(new documentRef.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(documentRef.querySelector(".hy-canvas-agent-mention-menu")?.hidden, true);
});

test("appAssistantPanel P1: typing at-sign opens mention menu and filters candidates", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({
    document: documentRef,
    attachmentStore: {
      list: () => [{ id: "ref-hero", name: "Hero Reference" }, { id: "ref-bg", name: "Background" }],
      toContext: () => [],
    },
    graphStore: {
      listNodes: () => [{ id: "node-hero", name: "Hero Node" }, { id: "node-bg", name: "Background Node" }],
    },
  });
  panel.open();

  const input = documentRef.querySelector(".hy-canvas-agent-input");
  input.value = "use @hero";
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  input.dispatchEvent(new documentRef.defaultView.InputEvent("input", { bubbles: true }));

  const menu = documentRef.querySelector(".hy-canvas-agent-mention-menu");
  assert.equal(menu.hidden, false);
  assert.match(menu.textContent, /Hero Reference/);
  assert.doesNotMatch(menu.textContent, /Background/);

  input.value = "use ";
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  input.dispatchEvent(new documentRef.defaultView.InputEvent("input", { bubbles: true }));

  assert.equal(menu.hidden, true);
});

test("appAssistantPanel P1: mention button toggles menu without inserting duplicate at-sign", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  const input = documentRef.querySelector(".hy-canvas-agent-input");
  const mentionButton = documentRef.querySelector(".hy-canvas-agent-mention");

  mentionButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(input.value, "@");
  assert.equal(documentRef.querySelector(".hy-canvas-agent-mention-menu")?.hidden, false);

  mentionButton.dispatchEvent(new documentRef.defaultView.MouseEvent("click", { bubbles: true }));
  assert.equal(input.value, "@");
  assert.equal(documentRef.querySelector(".hy-canvas-agent-mention-menu")?.hidden, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because the panel does not use the floating controller and manual `@` is not tracked.

- [ ] **Step 3: Wire floating controller**

In `modules/app/appAssistantPanel.js`, add:

```js
import { createFloatingLayerController } from "../assistant/assistantFloatingLayer.js";
```

Inside `createAppAssistantPanel`, add:

```js
  let mentionTriggerRange = null;
  let mentionQuery = "";
  let floatingLayerController = null;

  function syncFloatingLayerState(activeId = "") {
    modelMenuVisible = activeId === "model";
    mentionMenuVisible = activeId === "mention";
    render();
  }

  function closeFloatingMenus() {
    if (floatingLayerController) floatingLayerController.closeAll();
    else {
      modelMenuVisible = false;
      mentionMenuVisible = false;
      render();
    }
  }
```

Change `openOrCycleModelMenu()` to:

```js
  function openOrCycleModelMenu() {
    if (floatingLayerController) floatingLayerController.toggle("model");
    else {
      modelMenuVisible = !modelMenuVisible;
      if (modelMenuVisible) mentionMenuVisible = false;
      render();
    }
  }
```

Change `selectModel(model)` so it only closes and renders:

```js
  function selectModel(model) {
    const selected = state.selectModel(model);
    if (selected) {
      if (floatingLayerController) floatingLayerController.close("model");
      else modelMenuVisible = false;
      render();
    }
  }
```

At the end of compose DOM creation, after `modelButton`, `modelMenuEl`, `mentionButton`, and `mentionMenuEl` exist, register layers:

```js
    floatingLayerController = createFloatingLayerController({
      document: documentRef,
      onChange: syncFloatingLayerState,
    });
    floatingLayerController.registerLayer("model", {
      sourceEl: modelButton,
      layerEl: modelMenuEl,
    });
    floatingLayerController.registerLayer("mention", {
      sourceEl: mentionButton,
      layerEl: mentionMenuEl,
    });
```

- [ ] **Step 4: Add typed mention helpers**

Add near existing input helpers:

```js
  function currentInputSelection() {
    return {
      start: Number(inputEl?.selectionStart ?? String(inputEl?.value || "").length),
      end: Number(inputEl?.selectionEnd ?? String(inputEl?.value || "").length),
    };
  }

  function updateMentionFromInput() {
    const value = String(inputEl?.value || "");
    const selection = currentInputSelection();
    const beforeCursor = value.slice(0, selection.start);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex < 0) {
      mentionTriggerRange = null;
      mentionQuery = "";
      if (floatingLayerController?.isOpen("mention")) floatingLayerController.close("mention");
      return;
    }
    const between = value.slice(atIndex + 1, selection.start);
    if (/\s/.test(between)) {
      mentionTriggerRange = null;
      mentionQuery = "";
      if (floatingLayerController?.isOpen("mention")) floatingLayerController.close("mention");
      return;
    }
    mentionTriggerRange = { start: atIndex, end: selection.start };
    mentionQuery = between;
    if (floatingLayerController) floatingLayerController.open("mention");
    else {
      mentionMenuVisible = true;
      modelMenuVisible = false;
      render();
    }
  }

  function replaceMentionTrigger(token) {
    const value = String(inputEl?.value || "");
    const selection = currentInputSelection();
    const range = mentionTriggerRange || { start: selection.start, end: selection.end };
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    inputEl.value = `${before}${token}${after}`;
    const cursor = before.length + token.length;
    if (typeof inputEl.setSelectionRange === "function") inputEl.setSelectionRange(cursor, cursor);
    mentionTriggerRange = null;
    mentionQuery = "";
  }
```

Update `currentMentionMenu()`:

```js
  function currentMentionMenu() {
    return buildAssistantMentionMenu({
      attachments: typeof attachmentStore?.list === "function" ? attachmentStore.list() : [],
      nodes: typeof graphStore?.listNodes === "function" ? graphStore.listNodes() : [],
      assets: typeof assetStore?.list === "function" ? assetStore.list() : {},
      query: mentionQuery,
    });
  }
```

Change mention selection to call:

```js
    replaceMentionTrigger(item.displayToken || item.label || "@");
    if (floatingLayerController) floatingLayerController.close("mention");
    else mentionMenuVisible = false;
```

Change the mention button listener to:

```js
    mentionButton.addEventListener("click", () => {
      if (floatingLayerController?.isOpen("mention") || mentionMenuVisible) {
        closeFloatingMenus();
        return;
      }
      insertTextAtInput("@");
      updateMentionFromInput();
    });
```

Merge this into the existing input listener or add it if none exists:

```js
    inputEl.addEventListener("input", () => {
      updateMentionFromInput();
      render();
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS for the new menu and typed mention tests. If existing tests still expect model click cycling or success receipts, update them to the confirmed behavior.

---

### Task 5: Interaction Cards in Panel State

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Write failing state tests**

Add near pending action tests in `modules/app/appAssistantPanel.test.js`:

```js
test("appAssistantPanel state: plan video node waits for confirmation card", async () => {
  const state = createAssistantPanelState({});
  const actions = [{ type: "create_node", node: { id: "video-1", type: "video" } }];

  state.messages.push({ role: "assistant", content: "我准备生成视频节点。" });
  state.setPendingActions(actions);
  await state.prepareInteractionCardForPendingActions();

  assert.equal(state.messages.at(-1).cards[0].requiresConfirmation, true);
  assert.equal(state.messages.at(-1).cards[0].status, "needs_confirmation");
  assert.deepEqual(state.pendingActions, actions);
});

test("appAssistantPanel state: cancelling pending confirmation keeps cancelled card in history", async () => {
  const state = createAssistantPanelState({});
  const actions = [{ type: "create_node", node: { id: "video-1", type: "video" } }];

  state.messages.push({ role: "assistant", content: "我准备生成视频节点。" });
  state.setPendingActions(actions);
  await state.prepareInteractionCardForPendingActions();

  state.cancelPendingInteractionCard();

  assert.deepEqual(state.pendingActions, []);
  assert.equal(state.messages.at(-1).cards[0].status, "cancelled");
});

test("appAssistantPanel state: act mode auto-applies and never shows confirmation card", async () => {
  const applied = [];
  const state = createAssistantPanelState({
    initialAgentMode: "act",
    api: {
      validateActions: async (actions) => ({ ok: true, actions }),
      applyActions: async (actions) => {
        applied.push(...actions);
        return { applied: actions.length };
      },
    },
  });
  const actions = [
    { type: "create_node", node: { id: "video-1", type: "video" } },
    { type: "create_node", node: { id: "image-1", type: "image" } },
  ];

  state.messages.push({ role: "assistant", content: "Act 模式直接执行。" });
  state.setPendingActions(actions);
  await state.prepareInteractionCardForPendingActions();

  assert.equal(state.messages.at(-1).cards[0].requiresConfirmation, false);
  assert.equal(state.messages.at(-1).cards[0].agentMode, "act");
  assert.equal(state.messages.at(-1).cards[0].status, "completed");
  assert.equal(applied.length, 2);
});
```

If the existing state has no `setPendingActions`, use the current method or directly assign `state.pendingActions = actions` and keep the assertion.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js
```

Expected: FAIL because card state helpers are not wired.

- [ ] **Step 3: Import card helpers**

Add to `modules/app/appAssistantPanel.js`:

```js
import {
  analyzeAssistantActionBatch,
  createInteractionCard,
  updateInteractionCardStatus,
} from "../assistant/assistantInteractionCards.js";
```

- [ ] **Step 4: Add state card helpers**

Inside `createAssistantPanelState`, before `applyPendingActionsOnce`, add:

```js
  function latestAssistantMessageWithCard() {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (message?.role === "assistant") return message;
    }
    return null;
  }

  function attachCardToLatestAssistant(card) {
    const message = latestAssistantMessageWithCard();
    if (!message) return null;
    message.cards = Array.isArray(message.cards) ? message.cards : [];
    message.cards.push(card);
    return card;
  }

  function latestInteractionCard() {
    const message = latestAssistantMessageWithCard();
    const cards = Array.isArray(message?.cards) ? message.cards : [];
    return cards.length ? { message, index: cards.length - 1, card: cards[cards.length - 1] } : null;
  }

  function updateLatestInteractionCard(patch) {
    const target = latestInteractionCard();
    if (!target) return null;
    const updated = updateInteractionCardStatus(target.card, patch);
    target.message.cards[target.index] = updated;
    return updated;
  }
```

Expose on `state`:

```js
    async prepareInteractionCardForPendingActions() {
      const actions = cloneActions(state.pendingActions);
      if (!actions.length) return null;
      const analysis = analyzeAssistantActionBatch(actions, { graphStore });
      const card = createInteractionCard({ actions, analysis, agentMode: state.agentMode });
      attachCardToLatestAssistant(card);
      notifyUpdate();
      if (!card.requiresConfirmation || state.agentMode === "act") {
        await state.applyPendingActions();
      }
      return latestInteractionCard()?.card || card;
    },
    cancelPendingInteractionCard() {
      state.pendingActions = [];
      state.pendingTransaction = null;
      const card = updateLatestInteractionCard({ status: "cancelled", expanded: false });
      notifyUpdate();
      return card;
    },
```

- [ ] **Step 5: Update action application status**

Inside `applyPendingActionsOnce(state)`, add before validation:

```js
    updateLatestInteractionCard({ status: "running", error: "" });
```

On validation failure, set the latest card failed before returning:

```js
      const failure = validationFailureReceipt(validation);
      updateLatestInteractionCard({ status: "failed", error: failure, expanded: true });
      state.lastReceipt = failure;
      return state.lastReceipt;
```

After successful apply, set the latest card completed:

```js
    updateLatestInteractionCard({
      status: "completed",
      result: state.lastReceiptDetails || { summary: state.lastReceipt },
      expanded: false,
    });
```

In `handleApply` catch blocks, set failed:

```js
      const message = error?.message || "Applying actions failed.";
      state.lastReceipt = message;
      updateLatestInteractionCard({ status: "failed", error: message, expanded: true });
```

- [ ] **Step 6: Attach cards after assistant response actions**

In `createAssistantPanelState.sendMessage`, after the assistant message is appended and `state.pendingActions` is assigned, add:

```js
        if (state.pendingActions.length) {
          await state.prepareInteractionCardForPendingActions();
        }
```

- [ ] **Step 7: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js
```

Expected: PASS.

---

### Task 6: Render Message Cards and Hide Success System Prompts

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Write failing UI tests**

Append to `modules/app/appAssistantPanel.p1Ui.test.js`:

```js
test("appAssistantPanel P1: renders interaction cards under assistant message", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  panel.state.messages.push({
    role: "assistant",
    content: "我准备生成视频节点。",
    cards: [{
      id: "card-video",
      type: "canvas_actions",
      status: "needs_confirmation",
      title: "将生成 1 个视频节点",
      summary: "视频节点生成需要确认后提交。",
      expanded: true,
      requiresConfirmation: true,
      agentMode: "plan",
      actions: [{ type: "create_node", node: { id: "video-1", type: "video" } }],
    }],
  });
  panel.render();

  const cards = documentRef.querySelectorAll(".hy-canvas-agent-card");
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /将生成 1 个视频节点/);
  assert.ok(cards[0].querySelector(".hy-canvas-agent-card-cancel"));
  assert.ok(cards[0].querySelector(".hy-canvas-agent-card-confirm"));
});

test("appAssistantPanel P1: act cards do not render confirm or cancel buttons", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  panel.state.messages.push({
    role: "assistant",
    content: "Act 模式直接执行。",
    cards: [{
      id: "card-act",
      type: "canvas_actions",
      status: "running",
      title: "将生成 2 个节点",
      summary: "正在执行。",
      expanded: false,
      requiresConfirmation: false,
      agentMode: "act",
      actions: [],
    }],
  });
  panel.render();

  const card = documentRef.querySelector(".hy-canvas-agent-card");
  assert.ok(card);
  assert.equal(card.querySelector(".hy-canvas-agent-card-cancel"), null);
  assert.equal(card.querySelector(".hy-canvas-agent-card-confirm"), null);
});

test("appAssistantPanel P1: success-only system receipts are not shown in chat area", async () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  panel.state.lastReceipt = "Selected model: GPT Mini";
  panel.render();

  const receipt = documentRef.querySelector(".hy-canvas-agent-receipt");
  assert.ok(receipt.hidden);
  assert.doesNotMatch(documentRef.body.textContent, /Selected model: GPT Mini/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because cards are not rendered and success receipt remains visible.

- [ ] **Step 3: Add card CSS and rendering helpers**

Add CSS to `injectAssistantPanelStyle`:

```css
.hy-canvas-agent-message-cards { display: grid; gap: 6px; margin-top: 8px; }
.hy-canvas-agent-card { border: 1px solid rgba(20, 38, 35, 0.14); background: rgba(247, 244, 236, 0.82); border-radius: 12px; padding: 8px 10px; font-size: 12px; color: #31423e; }
.hy-canvas-agent-card[aria-expanded="true"] { background: rgba(255, 250, 238, 0.96); }
.hy-canvas-agent-card-title { font-weight: 700; color: #142623; }
.hy-canvas-agent-card-summary { margin-top: 2px; color: rgba(20, 38, 35, 0.68); }
.hy-canvas-agent-card-detail { margin-top: 6px; white-space: pre-wrap; color: rgba(20, 38, 35, 0.72); }
.hy-canvas-agent-card-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.hy-canvas-agent-card-cancel,
.hy-canvas-agent-card-confirm { border: 0; border-radius: 999px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.hy-canvas-agent-card-cancel { background: rgba(20, 38, 35, 0.08); color: #31423e; }
.hy-canvas-agent-card-confirm { background: #1f6f5b; color: white; }
```

Near `renderMessages`, add:

```js
function cardStatusText(status) {
  const map = {
    pending: "等待执行",
    needs_confirmation: "等待确认",
    running: "执行中",
    completed: "已完成",
    cancelled: "已取消",
    failed: "失败",
  };
  return map[status] || "状态未知";
}

function renderInteractionCard(documentRef, card, { onConfirm, onCancel } = {}) {
  const cardEl = createElement(documentRef, "article", "hy-canvas-agent-card");
  cardEl.setAttribute?.("data-card-id", card.id || "");
  cardEl.setAttribute?.("data-status", card.status || "");
  cardEl.setAttribute?.("aria-expanded", card.expanded ? "true" : "false");

  const title = createElement(documentRef, "div", "hy-canvas-agent-card-title", card.title || "画布交互");
  const summary = createElement(
    documentRef,
    "div",
    "hy-canvas-agent-card-summary",
    `${cardStatusText(card.status)} · ${card.summary || ""}`.trim()
  );
  cardEl.append(title, summary);

  if (card.expanded || card.status === "failed" || card.status === "cancelled") {
    const detailText = card.error || (card.result ? JSON.stringify(card.result, null, 2) : "");
    if (detailText) cardEl.append(createElement(documentRef, "pre", "hy-canvas-agent-card-detail", detailText));
  }

  const canConfirm = card.requiresConfirmation && card.agentMode !== "act" && card.status === "needs_confirmation";
  if (canConfirm) {
    const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
    const cancel = createElement(documentRef, "button", "hy-canvas-agent-card-cancel", "取消");
    const confirm = createElement(documentRef, "button", "hy-canvas-agent-card-confirm", "确认生成");
    cancel.type = "button";
    confirm.type = "button";
    cancel.addEventListener("click", () => onCancel?.(card));
    confirm.addEventListener("click", () => onConfirm?.(card));
    actions.append(cancel, confirm);
    cardEl.append(actions);
  }

  return cardEl;
}
```

- [ ] **Step 4: Render cards and hide success receipts**

Change `renderMessages` signature:

```js
function renderMessages(documentRef, messagesEl, messages, cardHandlers = {}) {
```

Inside assistant message rendering:

```js
    if (message.role === "assistant" && Array.isArray(message.cards) && message.cards.length) {
      const cardsEl = createElement(documentRef, "div", "hy-canvas-agent-message-cards");
      message.cards.forEach((card) => {
        cardsEl.append(renderInteractionCard(documentRef, card, cardHandlers));
      });
      bubble.append(cardsEl);
    }
```

In `render()` call:

```js
    renderMessages(documentRef, messagesEl, state.messages, {
      onConfirm: () => schedule(() => handleApply()),
      onCancel: () => {
        state.cancelPendingInteractionCard?.();
        render();
      },
    });
```

Add:

```js
  function shouldShowReceipt(text) {
    const value = String(text || "");
    if (!value) return false;
    return /failed|error|invalid|requires|unauthorized|失败|错误|校验|需要/i.test(value);
  }
```

Render receipt as:

```js
      const receiptText = shouldShowReceipt(state.lastReceipt) ? state.lastReceipt : "";
      receiptEl.textContent = receiptText;
      setHidden(receiptEl, !receiptText);
```

Remove success-only `state.lastReceipt` assignments for model select, mode switch, upload success, and new conversation success.

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS.

---

### Task 7: Conversation Card Persistence

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.context.test.js`

- [ ] **Step 1: Write failing restore test**

Append to `modules/app/appAssistantPanel.context.test.js`:

```js
test("appAssistantPanel context: restores assistant message cards from conversation history", () => {
  const state = createAssistantPanelState({});
  const conversation = {
    id: "conv-cards",
    messages: [
      { role: "user", content: "生成一个视频节点" },
      {
        role: "assistant",
        content: "我准备生成视频节点。",
        cards: [{
          id: "card-video",
          type: "canvas_actions",
          status: "cancelled",
          title: "将生成 1 个视频节点",
          summary: "视频节点生成需要确认后提交。",
          expanded: false,
          requiresConfirmation: true,
          agentMode: "plan",
          actions: [{ type: "create_node", node: { id: "video-1", type: "video" } }],
        }],
      },
    ],
  };

  state.restoreConversation(conversation);

  assert.equal(state.conversationId, "conv-cards");
  assert.equal(state.messages[1].cards[0].id, "card-video");
  assert.equal(state.messages[1].cards[0].status, "cancelled");
});
```

- [ ] **Step 2: Run test to verify it fails if cards are dropped**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.context.test.js
```

Expected: FAIL if `restoreConversation` strips cards. PASS is acceptable if the current clone logic already preserves unknown fields; still perform Step 3 inspection.

- [ ] **Step 3: Preserve cards when storing and restoring messages**

Add or update message cloning:

```js
  function cloneMessage(message) {
    const cloned = { ...message };
    if (Array.isArray(message?.cards)) cloned.cards = cloneObjects(message.cards);
    return cloned;
  }
```

Use `cloneMessage` when:

```js
state.messages = asArray(conversation.messages).map(cloneMessage);
```

and when persisting messages to conversation store:

```js
messages: state.messages.map(cloneMessage)
```

- [ ] **Step 4: Restore pending actions from active confirmation card**

In `restoreConversation(conversation)`, after messages are restored:

```js
      const activeCard = [...state.messages]
        .reverse()
        .flatMap((message) => (Array.isArray(message?.cards) ? message.cards : []))
        .find((card) => card?.status === "needs_confirmation" && Array.isArray(card.actions) && card.actions.length);
      if (activeCard) {
        state.pendingActions = cloneActions(activeCard.actions);
        state.pendingTransaction = null;
      }
```

If no active card exists, keep the existing `latestPendingActionsFromConversation` fallback for old conversations.

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.context.test.js
```

Expected: PASS.

---

### Task 8: Title Rename and Accessibility Text

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Write failing title test**

Append to `modules/app/appAssistantPanel.p1Ui.test.js`:

```js
test("appAssistantPanel P1: title and aria labels use 幻映智能体 while FAB remains RH", () => {
  const documentRef = createTestDocument();
  const panel = createAppAssistantPanel({ document: documentRef });
  panel.open();

  assert.match(documentRef.body.textContent, /幻映智能体/);
  assert.equal(documentRef.querySelector(".hy-canvas-agent-launcher")?.textContent.trim(), "RH");
  assert.match(documentRef.querySelector(".hy-canvas-agent-root")?.getAttribute("aria-label") || "", /幻映智能体/);
  assert.match(documentRef.querySelector(".hy-canvas-agent-close")?.getAttribute("aria-label") || "", /幻映智能体/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: FAIL because title and aria labels still use `RH 智能体`.

- [ ] **Step 3: Replace title and aria copy**

In `modules/app/appAssistantPanel.js`, replace:

```js
"RH 智能体"
"打开 RH 智能体"
"收起 RH 智能体"
"RH 智能体助手"
```

with:

```js
"幻映智能体"
"打开幻映智能体"
"收起幻映智能体"
"幻映智能体助手"
```

Do not change FAB text `RH`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js
```

Expected: PASS.

---

### Task 9: Full Regression and Syntax Verification

**Files:**
- Test only; no source edits unless a regression identifies a concrete failure.

- [ ] **Step 1: Run focused assistant/app panel regression**

Run:

```powershell
& 'D:\Aic\node.exe' --test --test-concurrency=1 `
  modules\assistant\assistantFloatingLayer.test.js `
  modules\assistant\assistantInteractionCards.test.js `
  modules\assistant\assistantMentionResolver.test.js `
  modules\assistant\assistantMentionContext.test.js `
  modules\assistant\assistantModelRegistry.test.js `
  modules\assistant\assistantTypingEffect.test.js `
  modules\app\appAssistantPanel.test.js `
  modules\app\appAssistantPanel.p1Ui.test.js `
  modules\app\appAssistantPanel.context.test.js `
  modules\app\appAssistantPanel.streaming.test.js `
  modules\app\appAssistantPanel.autoload.test.js
```

Expected: PASS, with zero failed tests.

- [ ] **Step 2: Run broad assistant and app panel regression**

Run:

```powershell
$assistantTests = Get-ChildItem -LiteralPath 'modules\assistant' -Filter '*.test.js' | Sort-Object Name | ForEach-Object { $_.FullName }
$appTests = Get-ChildItem -LiteralPath 'modules\app' -Filter 'appAssistantPanel*.test.js' | Sort-Object Name | ForEach-Object { $_.FullName }
& 'D:\Aic\node.exe' --test --test-concurrency=1 @assistantTests @appTests
```

Expected: PASS, with zero failed tests.

- [ ] **Step 3: Run syntax checks for new and modified modules**

Run:

```powershell
& 'D:\Aic\node.exe' --check modules\assistant\assistantFloatingLayer.js
& 'D:\Aic\node.exe' --check modules\assistant\assistantInteractionCards.js
& 'D:\Aic\node.exe' --check modules\assistant\assistantMentionResolver.js
& 'D:\Aic\node.exe' --check modules\app\appAssistantPanel.js
```

Expected: no output and exit code 0 for every file.

- [ ] **Step 4: Manual acceptance checklist**

Verify:

```text
1. 点 @ 打开，再点 @ 关闭；点外部或 Esc 关闭。
2. 输入框手打 @ 打开菜单，继续输入 query 过滤候选，删除 @ 关闭。
3. 模型按钮只开关菜单，不切换模型；点击模型项才切换。
4. 我的资产为空时，一级菜单不显示“暂无资产”，只在资产子菜单显示。
5. 聊天区不展示成功类系统提示，只展示对话和小卡片。
6. plan：单普通节点自动提交，单视频节点和多节点需要确认。
7. act：不展示确认/取消按钮，仍显示执行状态/结果/错误。
8. 取消后 pending actions 清空，卡片保留为 cancelled。
9. 历史会话恢复 cards、状态和待确认 actions。
10. 左上角标题是“幻映智能体”，FAB 仍是“RH”。
```

---

## Self-Review

- Spec coverage: 本计划覆盖浮层关闭、输入 `@`、菜单层级空态、聊天卡片、确认规则、取消规则、历史恢复、标题命名和回归测试。
- Placeholder scan: 计划内每个代码步骤给出具体函数、测试或命令，没有保留未定义实现项。
- Type consistency: 新模块接口在计划中保持一致：`createFloatingLayerController`、`analyzeAssistantActionBatch`、`shouldRequireCardConfirmation`、`createInteractionCard`、`updateInteractionCardStatus`。
- Risk note: `appAssistantPanel.js` 是大文件，执行时如果现有测试工具的 selector 名称不同，应优先复用文件内已有 class 和 helper，不做大规模重构。
