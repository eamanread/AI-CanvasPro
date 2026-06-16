# Agent Panel Generation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent-driven canvas generation submit through the real canvas node lifecycle, show manual-equivalent node state, and keep the Agent operation card synchronized with canvas state.

**Architecture:** Add a small canvas-first generation bridge and a shared state mapper. Canvas Skills receipts describe requested work, while node/task state decides final Agent card state. The Agent panel renders one operation card per assistant reply, folds technical traces into that card, renders reference thumbnails in the composer, and applies typewriter fallback for final-only stream replies.

**Tech Stack:** JavaScript ES modules, Node `node:test`, DOM-based panel tests, existing Canvas Skills runtime, existing graph store and renderer bridge APIs.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-06-06-agent-panel-generation-sync-design.md`
- Capability inventory: `docs/agent_canvas_skills.md`
- Runtime entry: `modules/assistant/canvasSkills/runtime.js`
- Panel entry: `modules/app/appAssistantPanel.js`

## Current Code Constraints

- `modules/app/appAssistantPanel.js` marks cards `completed` immediately after `executeActions()` returns.
- `modules/app/appAssistantPanel.js` appends `result.skillTraceCards` as separate cards.
- `modules/assistant/canvasSkills/adapters/nodeLifecycleAdapter.js` converts renderer timeout directly to `retryable`.
- `modules/app/appAssistantPanel.js` stream final-only replies bypass `appendAssistantTypingMessage()`.
- `modules/app/appAssistantPanel.js` attachments render as text chips, not thumbnails.
- `modules/app/appAssistantPanel.js` still renders a persistent `AUTO` badge.
- `modules/assistant/assistantGenerationTaskStore.js` lacks `pendingRenderer`, `submitting`, `retryable`, and `paused`.

## File Structure

### Create

- `modules/assistant/canvasSkills/generationStateMapper.js`: converts node/task status into Agent operation card status and node lock patches.
- `modules/assistant/canvasSkills/generationTaskBridge.js`: queues pending renderer submissions, auto-submits after mount, marks retryable after timeout or submit failure.
- `modules/assistant/canvasSkills/generationStateMapper.test.js`: state mapping tests.
- `modules/assistant/canvasSkills/generationTaskBridge.test.js`: bridge lifecycle tests.

### Modify

- `modules/assistant/canvasSkills/adapters/nodeLifecycleAdapter.js`: delegate generation to the bridge.
- `modules/assistant/assistantCanvasNodeLifecycle.js`: keep the legacy compatibility lifecycle behavior aligned with the same bridge so integration tests and older entrypoints do not drift.
- `modules/assistant/canvasSkills/runtime.js`: instantiate the bridge and inject it into lifecycle adapter.
- `modules/assistant/assistantCanvasSkillExecutor.js`: keep traces as data, not as user-visible cards.
- `modules/assistant/assistantInteractionCards.js`: add `operation`, `items`, and `executionDetails`.
- `modules/app/appAssistantPanel.js`: card state sync, single card rendering, typewriter fallback, thumbnail references, no `AUTO`.
- `modules/assistant/assistantGenerationTaskStore.js`: add intermediate statuses.
- Tests under `modules/assistant/canvasSkills/`, `modules/assistant/`, and `modules/app/`.

## Implementation Rules

- Canvas node/task state is the source of truth. Executor receipts are not final generation truth.
- Do not simulate clicks as the normal generation path.
- Do not show raw JSON or standalone skill trace cards to users.
- Keep one visible operation card per assistant reply.
- Image/text generation auto-submits; video generation follows plan/act confirmation rules.
- Existing tests that assert old behavior must be updated to match the confirmed product behavior.
- This workspace currently has no `.git` metadata at the project root, so this plan uses verification checkpoints instead of commit commands.

## Review Fixes Required Before Implementation

These corrections are authoritative and override any narrower snippets later in this document.

- Operation cards must continue to follow canvas state after `executeActions()` returns. Add a card sync layer that tracks the canvas action card by `card.id` and generated `nodeIds`, uses `graphStore.subscribe()` when available, and falls back to explicit refresh/polling in tests or simple stores.
- Card updates must target the current `canvas_actions` card by id/type. Do not update "the last card" blindly, because response cards or trace cards can be appended after the operation card.
- Node status patches must use manual-compatible fields: `generationStatus`, `jobStatus`, `asyncTaskStatus`, `isGenerating`, `generationLocked`, `generationRetryable`, `generationWarning`, and `generationError`. `generationLocked` is additive only; existing UI is more likely to read the older fields.
- The generation bridge must set `pendingRenderer` while waiting for the renderer, set `submitting` before invoking the renderer generation method, and set `running` before/around submit completion. It must not treat the renderer method returning as final generation completion unless explicit terminal result fields are present.
- Final-only stream replies must not be inserted in the `message.done` handler. That handler should cache the final reply; if no deltas were rendered, the cached final reply must be rendered through `appendAssistantTypingMessage()`.
- Attachment UI must use full local attachment records (`attachmentStore.list()` or a dedicated UI method), while model request context must keep using the sanitized `toContext()`. This preserves `blob:` thumbnails without leaking them to the model context.
- Thumbnail click must open a real preview overlay. Setting a receipt/notice is not a preview implementation.
- `assistantGenerationTaskStore.queue()` must preserve valid input statuses and only default missing/invalid statuses. Retryable tasks must be retryable into `pendingRenderer`.
- `debugSnapshot()` must expose active generation task counts, not only `running`, so pending/submitting/retryable states are visible during debugging.
- If `assistantCanvasSkillExecutor.js` keeps producing `skillTraceCards`, the panel must fold them into `executionDetails`; they must never render as independent visible cards.
- Streamed `message.delta` chunks must also pass through a local typewriter queue. Do not append provider chunks directly to the assistant message, because real providers may emit large chunks even when the API is technically streaming.
- The generation bridge must pin/select/ask the renderer to mount the node before the readiness wait starts. Waiting first and pinning only after readiness is too late for virtualized or offscreen nodes.
- Operation cards must rebuild `items` from live canvas nodes during sync, including node name/type, prompt summary, model, batch/ratio, task id, status, result preview URL, warning, and error.
- Explicit terminal canvas statuses (`completed`, `failed`, `cancelled`, `paused`) must win over stale `isGenerating: true`; `isGenerating` is only a fallback when no explicit status exists.
- Missing or unmapped generation target nodes must become failed execution evidence. They must not be added to queued/started node ids or allow the card to settle as `completed`.

## Second Deep-Review Fixes Required Before Implementation

These corrections are also authoritative and supersede older snippets below that directly patch final generation state from the bridge:

- `generationTaskBridge` must be a submit trigger and sync adapter only. It may set `pendingRenderer`, `submitting`, and a pre-submit `running` hint, but after calling the real renderer generation method it must re-read the node and preserve renderer-owned terminal fields instead of writing a fresh `running` patch.
- Generation method selection must prefer a public/manual-equivalent method such as `submitGenerationFromAgent` when present, then fallback to `_onGenerate` or `onGenerate`. The adapter should pass `{ nodeId, nodeType, source: "assistant", ...task }` while preserving the prompt argument for legacy methods.
- `patchNode()` must be shape-aware. If the graph node has a real `data` object, merge into `node.data`; otherwise merge fields onto the flat node object and do not create a misleading nested `node.data`.
- `generationStateMapper` must collect all raw status fields and let terminal states win globally. Required regression cases: `generationStatus: "running"` plus `jobStatus: "success"` maps to completed, and `generationStatus: "running"` plus `asyncTaskStatus: "failed"` maps to failed.
- `appAssistantPanel` must add an assistant placeholder `思考中...` immediately after the user message is submitted and before the API returns. Stream deltas and final-only typewriter fallback must reuse that placeholder.
- Successful generation lifecycle status must render only in the operation card under the specific assistant reply. The bottom `.hy-canvas-agent-receipt` must remain hidden for generation progress and only show errors/configuration/degraded warnings.
- Browser smoke must verify live node evidence: stop/pause submit button (`data-generation-action="stop"` or equivalent), `generationStartTime`/timer source, locked input while running, card status under the assistant reply, and hidden bottom receipt.

## Current Implementation Delta

Implemented after the deep review:

- `modules/app/appAssistantPanel.js` now typewrites both final-only replies and streamed deltas through a local queue, so large provider chunks are still displayed progressively.
- `modules/assistant/canvasSkills/generationTaskBridge.js` now selects/pins/requests renderer mounting before polling for readiness, then unpins after submit, timeout, or failure.
- `modules/app/appAssistantPanel.js` now keeps operation card `items` synchronized from live graph node data and extracts result previews from common image/video/output fields.
- `modules/assistant/canvasSkills/generationStateMapper.js` now prioritizes explicit terminal statuses over stale `isGenerating`.
- `modules/assistant/assistantCanvasSkillExecutor.js` now fails missing generation targets instead of reporting them as queued.
- Regression tests were added for the five review gaps above.

---

### Task 1: Add Shared Generation State Mapper

**Files:**
- Create: `modules/assistant/canvasSkills/generationStateMapper.js`
- Create: `modules/assistant/canvasSkills/generationStateMapper.test.js`

- [ ] **Step 1: Write the failing mapper test**

Create `modules/assistant/canvasSkills/generationStateMapper.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  AssistantCanvasGenerationStatus,
  mapCanvasGenerationState,
  statusPatchForNode,
} from "./generationStateMapper.js";

test("generationStateMapper: maps pending renderer to preparing", () => {
  const mapped = mapCanvasGenerationState({ generationStatus: "pendingRenderer" });
  assert.equal(mapped.cardStatus, "preparing");
  assert.equal(mapped.technicalStatus, AssistantCanvasGenerationStatus.PendingRenderer);
  assert.equal(mapped.locked, true);
});

test("generationStateMapper: maps running provider fields to generating", () => {
  const mapped = mapCanvasGenerationState({ rhTaskStatus: "RUNNING" });
  assert.equal(mapped.cardStatus, "generating");
  assert.equal(mapped.technicalStatus, AssistantCanvasGenerationStatus.Running);
  assert.equal(mapped.locked, true);
});

test("generationStateMapper: terminal states unlock node editing", () => {
  assert.equal(mapCanvasGenerationState({ generationStatus: "completed" }).locked, false);
  assert.equal(mapCanvasGenerationState({ generationStatus: "failed" }).locked, false);
  assert.equal(mapCanvasGenerationState({ generationStatus: "retryable" }).retryable, true);
});

test("generationStateMapper: builds node status patch", () => {
  assert.deepEqual(statusPatchForNode("pendingRenderer", { warning: "waiting" }), {
    generationStatus: "pendingRenderer",
    generationLocked: true,
    generationRetryable: false,
    generationWarning: "waiting",
    generationError: "",
  });
  assert.equal(statusPatchForNode("completed").generationLocked, false);
  assert.equal(statusPatchForNode("retryable").generationRetryable, true);
});
```

- [ ] **Step 2: Run the mapper test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\generationStateMapper.test.js
```

Expected: fails with module not found for `generationStateMapper.js`.

- [ ] **Step 3: Implement the mapper**

Create `modules/assistant/canvasSkills/generationStateMapper.js`:

```js
function text(value) {
  return String(value ?? "").trim();
}

export const AssistantCanvasGenerationStatus = Object.freeze({
  Idle: "idle",
  PendingRenderer: "pendingRenderer",
  Queued: "queued",
  Submitting: "submitting",
  Submitted: "submitted",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Retryable: "retryable",
  Cancelled: "cancelled",
  Paused: "paused",
});

const PREPARING = new Set(["pendingrenderer", "queued", "submitting", "submitted", "pending"]);
const RUNNING = new Set(["running", "generating", "processing", "in_progress", "in-progress"]);
const COMPLETED = new Set(["completed", "succeeded", "success", "done"]);
const FAILED = new Set(["failed", "error", "rejected"]);
const CANCELLED = new Set(["cancelled", "canceled", "stopped"]);
const PAUSED = new Set(["paused", "pause"]);

function rawStatusFromData(data = {}) {
  return text(
    data.generationStatus ||
      data.taskStatus ||
      data.rhTaskStatus ||
      data.dreaminaTaskStatus ||
      data.asyncTaskStatus ||
      data.status
  );
}

export function normalizeCanvasGenerationStatus(data = {}) {
  const raw = rawStatusFromData(data).toLowerCase();
  if (!raw) return AssistantCanvasGenerationStatus.Idle;
  if (raw === "pendingrenderer") return AssistantCanvasGenerationStatus.PendingRenderer;
  if (raw === "submitting") return AssistantCanvasGenerationStatus.Submitting;
  if (raw === "submitted") return AssistantCanvasGenerationStatus.Submitted;
  if (raw === "retryable") return AssistantCanvasGenerationStatus.Retryable;
  if (PREPARING.has(raw)) return AssistantCanvasGenerationStatus.Queued;
  if (RUNNING.has(raw)) return AssistantCanvasGenerationStatus.Running;
  if (COMPLETED.has(raw)) return AssistantCanvasGenerationStatus.Completed;
  if (FAILED.has(raw)) return AssistantCanvasGenerationStatus.Failed;
  if (CANCELLED.has(raw)) return AssistantCanvasGenerationStatus.Cancelled;
  if (PAUSED.has(raw)) return AssistantCanvasGenerationStatus.Paused;
  return AssistantCanvasGenerationStatus.Queued;
}

export function mapCanvasGenerationState(data = {}) {
  const technicalStatus = normalizeCanvasGenerationStatus(data);
  if (technicalStatus === AssistantCanvasGenerationStatus.Completed) {
    return { cardStatus: "completed", technicalStatus, locked: false, retryable: false };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Failed) {
    return { cardStatus: "failed", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Retryable) {
    return { cardStatus: "retryable", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Cancelled) {
    return { cardStatus: "cancelled", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Paused) {
    return { cardStatus: "paused", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Running) {
    return { cardStatus: "generating", technicalStatus, locked: true, retryable: false };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Idle) {
    return { cardStatus: "pending", technicalStatus, locked: false, retryable: false };
  }
  return { cardStatus: "preparing", technicalStatus, locked: true, retryable: false };
}

export function statusPatchForNode(status, { warning = "", error = "" } = {}) {
  const normalized = normalizeCanvasGenerationStatus({ generationStatus: status });
  const mapped = mapCanvasGenerationState({ generationStatus: normalized });
  return {
    generationStatus: normalized,
    generationLocked: mapped.locked,
    generationRetryable: mapped.retryable,
    generationWarning: text(warning),
    generationError: text(error),
  };
}
```

- [ ] **Step 4: Run mapper tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\generationStateMapper.test.js
```

Expected: all tests pass.

---

### Task 2: Add Generation Task Bridge

**Files:**
- Create: `modules/assistant/canvasSkills/generationTaskBridge.js`
- Create: `modules/assistant/canvasSkills/generationTaskBridge.test.js`
- Modify: `modules/assistant/canvasSkills/adapters/nodeLifecycleAdapter.js`
- Modify: `modules/assistant/assistantCanvasNodeLifecycle.js`
- Modify: `modules/assistant/canvasSkills/runtime.js`

- [ ] **Step 1: Write the failing bridge test**

Create `modules/assistant/canvasSkills/generationTaskBridge.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { createGenerationTaskBridge } from "./generationTaskBridge.js";

function createRuntime({ mounted = false, failGenerate = false } = {}) {
  const nodes = [{ id: "node-1", type: "ai-image", data: { prompt: "cat" } }];
  const generated = [];
  const instance = {
    async onGenerate(prompt, task) {
      generated.push({ prompt, task });
      if (failGenerate) throw new Error("provider rejected");
      return { started: true, taskId: "task-1" };
    },
  };
  const rendererBridge = {
    isNodeMounted: () => mounted,
    getMountedWrapper: () => (mounted ? {} : null),
    pinNode() {},
    unpinNode() {},
    nodeInstances: { get: () => (mounted ? instance : null) },
  };
  const graphStore = {
    getState: () => ({ nodes }),
    updateNodeData(id, patch) {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...(node.data || {}), ...patch };
    },
  };
  return { nodes, generated, rendererBridge, graphStore, setMounted(value) { mounted = value; } };
}

test("generationTaskBridge: queues pending renderer and auto-submits after mount", async () => {
  const rt = createRuntime({ mounted: false });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 60,
  });
  const pending = bridge.submit({ nodeId: "node-1", prompt: "cat", task: { id: "a" } });
  assert.equal(rt.nodes[0].data.generationStatus, "pendingRenderer");
  rt.setMounted(true);
  const result = await pending;
  assert.equal(result.started, true);
  assert.deepEqual(rt.generated.map((item) => item.prompt), ["cat"]);
  assert.equal(rt.nodes[0].data.generationStatus, "running");
});

test("generationTaskBridge: timeout becomes retryable and keeps node editable", async () => {
  const rt = createRuntime({ mounted: false });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 5,
  });
  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });
  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.equal(rt.nodes[0].data.generationStatus, "retryable");
  assert.equal(rt.nodes[0].data.generationLocked, false);
});

test("generationTaskBridge: submit failure marks node retryable", async () => {
  const rt = createRuntime({ mounted: true, failGenerate: true });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });
  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });
  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.match(result.warning, /provider rejected/);
  assert.equal(rt.nodes[0].data.generationStatus, "retryable");
});
```

- [ ] **Step 2: Run bridge test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\generationTaskBridge.test.js
```

Expected: fails with module not found for `generationTaskBridge.js`.

- [ ] **Step 3: Implement the bridge**

Create `modules/assistant/canvasSkills/generationTaskBridge.js`:

```js
import { statusPatchForNode } from "./generationStateMapper.js";

function text(value) {
  return String(value ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function graphNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = state?.nodes || graphStore?.nodes;
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

function findNode(graphStore, nodeId) {
  return graphNodes(graphStore).find((node) => text(node?.id) === text(nodeId));
}

function instanceFromBridge(rendererBridge, nodeId) {
  const instances = rendererBridge?.nodeInstances;
  if (!instances) return null;
  if (typeof instances.get === "function") return instances.get(nodeId) || null;
  if (instances.map && typeof instances.map.get === "function") return instances.map.get(nodeId) || null;
  return instances[nodeId] || null;
}

function generationMethod(instance) {
  if (typeof instance?._onGenerate === "function") return instance._onGenerate;
  if (typeof instance?.onGenerate === "function") return instance.onGenerate;
  return null;
}

function isReady(rendererBridge, nodeId) {
  const hasMountProbe =
    typeof rendererBridge?.isNodeMounted === "function" ||
    typeof rendererBridge?.getMountedWrapper === "function";
  const mounted = rendererBridge?.isNodeMounted?.(nodeId) ?? Boolean(rendererBridge?.getMountedWrapper?.(nodeId));
  const instance = instanceFromBridge(rendererBridge, nodeId);
  return { ready: (hasMountProbe ? mounted : Boolean(instance)) && Boolean(generationMethod(instance)), instance };
}

export function createGenerationTaskBridge({
  graphStore,
  rendererBridge,
  pollIntervalMs = 25,
  readinessTimeoutMs = 2000,
} = {}) {
  const pending = new Map();

  function patchNode(nodeId, status, extra = {}) {
    graphStore?.updateNodeData?.(nodeId, statusPatchForNode(status, extra));
  }

  async function waitForReady(nodeId) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= readinessTimeoutMs) {
      if (!findNode(graphStore, nodeId)) {
        return { ready: false, deleted: true, warning: `node deleted before generation: ${nodeId}` };
      }
      const ready = isReady(rendererBridge, nodeId);
      if (ready.ready) return ready;
      await sleep(pollIntervalMs);
    }
    return { ready: false, warning: `renderer not ready before timeout for ${nodeId}` };
  }

  async function submit({ nodeId, prompt = "", task = {} } = {}) {
    const id = text(nodeId);
    const node = findNode(graphStore, id);
    if (!node) return { started: false, retryable: false, warning: `node not found: ${id || "unknown"}` };
    if (pending.has(id)) return pending.get(id);

    const promise = (async () => {
      patchNode(id, "pendingRenderer", { warning: "waiting for node renderer" });
      const ready = await waitForReady(id);
      if (!ready.ready) {
        const warning = ready.warning || `renderer not ready before timeout for ${id}`;
        patchNode(id, ready.deleted ? "failed" : "retryable", { warning, error: warning });
        return { started: false, retryable: !ready.deleted, warning };
      }
      patchNode(id, "submitting");
      const run = generationMethod(ready.instance);
      rendererBridge?.pinNode?.(id);
      try {
        const data = node?.data && typeof node.data === "object" ? node.data : {};
        const output = await run.call(ready.instance, prompt || data.prompt || "", {
          ...task,
          nodeId: id,
          nodeType: node.type || data.nodeType,
        });
        patchNode(id, "running");
        return { started: output?.started !== false, result: output };
      } catch (error) {
        const warning = error?.message || String(error || "generation submit failed");
        patchNode(id, "retryable", { warning, error: warning });
        return { started: false, retryable: true, warning };
      } finally {
        rendererBridge?.unpinNode?.(id);
        pending.delete(id);
      }
    })();

    pending.set(id, promise);
    return promise;
  }

  function snapshot() {
    return Array.from(pending.keys()).map((nodeId) => ({ nodeId, status: "pendingRenderer" }));
  }

  return { submit, retry: submit, waitForReady, snapshot };
}
```

- [ ] **Step 4: Wire bridge into `nodeLifecycleAdapter.js`**

Modify `modules/assistant/canvasSkills/adapters/nodeLifecycleAdapter.js`:

```js
import { createGenerationTaskBridge } from "../generationTaskBridge.js";
```

Inside `createNodeLifecycleAdapter()`, add `generationTaskBridge = null` to options and create the bridge:

```js
  const bridge =
    generationTaskBridge ||
    createGenerationTaskBridge({ graphStore, rendererBridge, pollIntervalMs, readinessTimeoutMs });
```

Replace `generateNode()` with:

```js
  async function generateNode({ nodeId, prompt = "", task = {} } = {}) {
    return bridge.submit({ nodeId, prompt, task });
  }

  return { createDraftNode, updateNode, generateNode, waitForReady, generationTaskBridge: bridge };
```

- [ ] **Step 5: Mirror bridge wiring in legacy compatibility lifecycle**

Apply the same import, `generationTaskBridge` option, `bridge` initialization, `generateNode()` replacement, and return value update to `modules/assistant/assistantCanvasNodeLifecycle.js`. This file is still used by `modules/assistant/assistantCanvasSkills.integration.test.js`, so it must not keep the old timeout-only behavior.

- [ ] **Step 6: Wire bridge into `runtime.js`**

Modify `modules/assistant/canvasSkills/runtime.js`:

```js
import { createGenerationTaskBridge } from "./generationTaskBridge.js";
```

Before creating `nodeLifecycle`, add:

```js
  const generationTaskBridge =
    adapters.generationTaskBridge ||
    createGenerationTaskBridge({
      graphStore,
      rendererBridge: resolvedRendererBridge,
      pollIntervalMs,
      readinessTimeoutMs,
    });
```

Pass `generationTaskBridge` into `createNodeLifecycleAdapter()`.

- [ ] **Step 7: Run bridge and runtime tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\\assistant\\canvasSkills\\generationTaskBridge.test.js modules\\assistant\\canvasSkills\\runtime.test.js modules\\assistant\\assistantCanvasNodeLifecycle.test.js modules\\assistant\\assistantCanvasSkills.integration.test.js
```

Expected: all tests pass.

---

### Task 3: Fold Skill Traces Into One Operation Card

**Files:**
- Modify: `modules/assistant/assistantInteractionCards.js`
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Add failing single-card trace test**

Add to `modules/app/appAssistantPanel.test.js`:

```js
test("createAssistantPanelState: canvas skill traces fold into one operation card", async () => {
  const executeActions = async () => ({
    appliedCount: 1,
    queuedGenerationNodeIds: ["image-1"],
    startedGenerationNodeIds: ["image-1"],
    canvasSkillReceipts: [{ skillId: "imageNode.createDraft", nodeId: "image-1", ok: true }],
    skillTraceCards: [{ type: "skill_trace", title: "imageNode.createDraft", detail: "raw" }],
  });
  const api = {
    chat: async () => ({
      reply: "OK",
      actions: [
        { id: "image", type: "create_node", nodeType: "ai-image", prompt: "cat" },
        { type: "queue_generation_task", nodeId: "image", nodeType: "ai-image", prompt: "cat" },
      ],
      warnings: [],
    }),
    validateActions: async ({ actions }) => ({ success: true, actions }),
  };
  const state = createAssistantPanelState({ api, executeActions, graphStore: { nodes: [] } });
  await state.sendMessage("generate cat image");
  const cards = state.messages.find((message) => message.role === "assistant").cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "canvas_actions");
  assert.equal(cards[0].executionDetails.traces.length, 1);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "skill traces fold"
```

Expected: fails because current code appends a second trace card.

- [ ] **Step 3: Extend interaction card model**

In `modules/assistant/assistantInteractionCards.js`, add to `createInteractionCard()` return object:

```js
    operation: {
      nodeIds: cloneJson(normalizedAnalysis.generatedNodeIds || []),
      status: requiresConfirmation ? "needs_confirmation" : "pending",
    },
    items: [],
    executionDetails: {
      traces: [],
      receipts: [],
      warnings: [],
    },
```

Add this export:

```js
export function mergeExecutionDetails(card, result = {}) {
  const traces = asArray(result.skillTraces).length
    ? asArray(result.skillTraces)
    : asArray(result.skillTraceCards).map((trace) => ({
        skillId: trace.skillId || trace.title || trace.type || "skill_trace",
        status: trace.status || "success",
        summary: trace.summary || trace.detail || "",
      }));
  return updateInteractionCardStatus(card, {
    executionDetails: {
      traces: cloneJson(traces),
      receipts: cloneJson(asArray(result.canvasSkillReceipts)),
      warnings: cloneJson(asArray(result.warnings)),
    },
  });
}
```

- [ ] **Step 4: Stop rendering standalone trace cards**

Modify the import in `modules/app/appAssistantPanel.js`:

```js
import {
  analyzeAssistantActionBatch,
  createInteractionCard,
  mergeExecutionDetails,
  updateInteractionCardStatus,
} from "../assistant/assistantInteractionCards.js";
```

After `state.lastReceiptDetails = ...`, fold details into the latest card:

```js
    const detailTarget = latestInteractionCard();
    if (detailTarget?.card) {
      detailTarget.message.cards[detailTarget.index] = mergeExecutionDetails(detailTarget.card, result);
    }
```

Delete the block that appends `result.skillTraceCards` to `message.cards`.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "skill traces fold"
```

Expected: pass with exactly one card.

- [ ] **Step 6: Verify executor still returns trace data for folding**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\\assistant\\canvasSkills\\tracing\\skillTraceCards.test.js modules\\assistant\\assistantCanvasSkillExecutor.test.js
```

Expected: pass. The executor may still produce `skillTraceCards` for diagnostics, but the panel must not render them as independent cards.

---

### Task 4: Make Operation Card Follow Canvas State

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Add failing card-state test**

Add to `modules/app/appAssistantPanel.test.js`:

```js
test("createAssistantPanelState: generation card stays generating after submission until canvas completes", async () => {
  const graphStore = {
    nodes: [{ id: "image-1", type: "ai-image", data: { generationStatus: "running" } }],
    getState() { return { nodes: this.nodes }; },
  };
  const executeActions = async () => ({
    appliedCount: 1,
    queuedGenerationNodeIds: ["image-1"],
    startedGenerationNodeIds: ["image-1"],
    canvasSkillReceipts: [{ skillId: "imageNode.generate", nodeId: "image-1", ok: true }],
  });
  const api = {
    chat: async () => ({
      reply: "Start generation",
      actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
      warnings: [],
    }),
    validateActions: async ({ actions }) => ({ success: true, actions }),
  };
  const state = createAssistantPanelState({ api, executeActions, graphStore });
  await state.sendMessage("generate cat image");
  const card = state.messages.find((message) => message.role === "assistant").cards[0];
  assert.equal(card.status, "generating");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "generation card stays generating"
```

Expected: fails because card is `completed`.

- [ ] **Step 3: Import the mapper**

In `modules/app/appAssistantPanel.js`:

```js
import { mapCanvasGenerationState } from "../assistant/canvasSkills/generationStateMapper.js";
```

- [ ] **Step 4: Add graph node and card status helpers**

Inside `createAssistantPanelState()`, near `latestInteractionCard()`:

```js
  function graphNodeById(nodeId) {
    const id = String(nodeId || "").trim();
    if (!id) return null;
    const snapshot = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
    const nodes = snapshot?.nodes || graphStore?.nodes || [];
    const list = Array.isArray(nodes) ? nodes : nodes instanceof Map ? Array.from(nodes.values()) : Object.values(nodes || {});
    return list.find((node) => String(node?.id || "") === id) || null;
  }

  function cardStatusFromResult(result = {}) {
    const nodeIds = [
      ...(Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds : []),
      ...(Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds : []),
      ...(Array.isArray(result.createdNodeIds) ? result.createdNodeIds : []),
    ].map((nodeId) => String(nodeId || "").trim()).filter(Boolean);
    for (const nodeId of nodeIds) {
      const node = graphNodeById(nodeId);
      const mapped = mapCanvasGenerationState(node?.data || node || {});
      if (["preparing", "generating", "failed", "retryable", "paused", "cancelled", "completed"].includes(mapped.cardStatus)) {
        return mapped.cardStatus;
      }
    }
    return nodeIds.length ? "preparing" : "completed";
  }
```

- [ ] **Step 5: Replace immediate completed status**

In `applyPendingActionsOnce()`, replace the fixed `completed` patch with:

```js
    const nextCardStatus = cardStatusFromResult(result);
    updateLatestInteractionCard({
      status: nextCardStatus,
      result: state.lastReceiptDetails || { summary: state.lastReceipt },
      expanded: nextCardStatus === "failed" || nextCardStatus === "retryable",
      error: "",
    });
```

- [ ] **Step 6: Add card status labels**

In `cardStatusText()` in `modules/app/appAssistantPanel.js`, use readable labels:

```js
  const map = {
    pending: "pending",
    needs_confirmation: "needs confirmation",
    running: "running",
    preparing: "preparing",
    generating: "generating",
    completed: "completed",
    cancelled: "cancelled",
    paused: "paused",
    retryable: "retryable",
    failed: "failed",
  };
```

- [ ] **Step 7: Run focused test**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "generation card stays generating"
```

Expected: pass.

---

### Task 5: Render Card Details Without Raw JSON

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Add failing DOM test**

Add to `modules/app/appAssistantPanel.p1Ui.test.js`:

```js
test("appAssistantPanel P1 UI: operation card hides raw JSON details", async () => {
  const panel = createAppAssistantPanel({
    api: {
      chat: async () => ({
        reply: "Start generation",
        actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
        warnings: [],
      }),
      validateActions: async ({ actions }) => ({ success: true, actions }),
    },
    executeActions: async () => ({
      appliedCount: 1,
      queuedGenerationNodeIds: ["image-1"],
      startedGenerationNodeIds: ["image-1"],
      canvasSkillReceipts: [{ skillId: "imageNode.generate", nodeId: "image-1", ok: true }],
      skillTraceCards: [{ type: "skill_trace", title: "imageNode.generate", detail: "{ raw: true }" }],
    }),
    graphStore: { nodes: [{ id: "image-1", type: "ai-image", data: { generationStatus: "running" } }] },
  }).init();
  panel.open();
  panel.input.value = "generate cat image";
  await panel.send();
  const cards = panel.root.querySelectorAll(".hy-canvas-agent-card");
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /generating|preparing/);
  assert.doesNotMatch(cards[0].textContent, /\{\s*"appliedCount"/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "hides raw JSON"
```

Expected: fails because expanded card details use `JSON.stringify(card.result, null, 2)`.

- [ ] **Step 3: Add a friendly detail formatter**

In `modules/app/appAssistantPanel.js`, near `cardStatusText()`:

```js
function formatOperationCardDetails(card = {}) {
  const result = card.result && typeof card.result === "object" ? card.result : {};
  const nodeIds = [
    ...(Array.isArray(result.createdNodeIds) ? result.createdNodeIds : []),
    ...(Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds : []),
    ...(Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds : []),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const uniqueNodeIds = [...new Set(nodeIds)];
  const lines = [];
  if (uniqueNodeIds.length) lines.push(`Nodes: ${uniqueNodeIds.join(", ")}`);
  if (Array.isArray(result.warnings) && result.warnings.length) lines.push(`Warnings: ${result.warnings.join("; ")}`);
  const traces = Array.isArray(card.executionDetails?.traces) ? card.executionDetails.traces : [];
  if (traces.length) lines.push(`Execution details: ${traces.map((trace) => trace.skillId || trace.title || "skill").join(", ")}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Use the formatter in card rendering**

Replace:

```js
const detailText = card?.error || (card?.result ? JSON.stringify(card.result, null, 2) : "");
```

with:

```js
const detailText = card?.error || formatOperationCardDetails(card);
```

- [ ] **Step 5: Run the focused test**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "hides raw JSON"
```

Expected: pass.

---

### Task 6: Add Typewriter Fallback for Final-Only Streams

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.test.js`

- [ ] **Step 1: Add failing final-only stream test**

Add to `modules/app/appAssistantPanel.test.js`:

```js
test("createAssistantPanelState: stream final-only reply uses typewriter fallback", async () => {
  const snapshots = [];
  const api = {
    chatStream: async (_request, { onEvent }) => {
      onEvent({ type: "message.done", reply: "final complete reply" });
      return { reply: "final complete reply", actions: [], warnings: [] };
    },
  };
  let state;
  state = createAssistantPanelState({
    api,
    graphStore: { nodes: [] },
    typingChunkSize: 1,
    typingDelayMs: 0,
    typingScheduler: (resolve) => resolve(),
    onUpdate: () => snapshots.push(state.messages.map((message) => message.content).join("|")),
  });
  await state.sendMessage("hello");
  assert.ok(snapshots.some((text) => text.includes("f")));
  assert.equal(state.messages.at(-1).content, "final complete reply");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "final-only reply"
```

Expected: fails because current stream path inserts the complete reply at once.

- [ ] **Step 3: Track streamed delta length**

Inside the `if (canStream)` block in `sendMessage()`, change the local declarations to:

```js
let assistantMessage = null;
let streamedTextLength = 0;
```

In `MessageDelta`, use:

```js
const delta = String(event.delta ?? event.content ?? event.text ?? "");
streamedTextLength += delta.length;
ensureAssistantMessage().content += delta;
notifyUpdate(options);
```

- [ ] **Step 4: Add final-only typewriter fallback**

After `const response = ...` in the stream branch and before response card handling:

```js
const finalReply = String(response.reply || "");
if (finalReply && streamedTextLength === 0 && !assistantMessage) {
  assistantMessage = await appendAssistantTypingMessage({
    messages: state.messages,
    text: finalReply,
    onUpdate: () => notifyUpdate(options),
    chunkSize: typingChunkSize,
    delayMs: typingDelayMs,
    scheduler: typingScheduler,
    signal: streamToken.controller?.signal,
  });
}
```

Remove the later direct push:

```js
if (response.reply && !assistantMessage) {
  state.messages.push({ role: "assistant", content: response.reply });
}
```

- [ ] **Step 5: Run the focused test**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "final-only reply"
```

Expected: pass.

---

### Task 7: Replace Attachment Chips With Thumbnail Tiles

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Add failing thumbnail test**

Add to `modules/app/appAssistantPanel.p1Ui.test.js`:

```js
test("appAssistantPanel P1 UI: reference uploads render thumbnail tile with remove", async () => {
  const store = {
    items: [{ id: "ref-1", name: "reference.png", kind: "image", previewUrl: "blob:ref-1", usage: "reference" }],
    toContext() { return this.items; },
    remove(id) { this.items = this.items.filter((item) => item.id !== id); },
  };
  const panel = createAppAssistantPanel({ attachmentStore: store }).init();
  panel.open();
  panel.render();
  const tile = panel.root.querySelector(".hy-canvas-agent-attachment-thumb");
  assert.ok(tile);
  assert.equal(tile.querySelector("img").getAttribute("src"), "blob:ref-1");
  tile.querySelector(".hy-canvas-agent-attachment-remove").click();
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-attachment-thumb").length, 0);
});
```

- [ ] **Step 2: Run focused attachment test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "thumbnail tile"
```

Expected: fails because only text chips exist.

- [ ] **Step 3: Update attachment CSS**

In the injected CSS string in `modules/app/appAssistantPanel.js`, replace the attachment chip rules with:

```css
.hy-canvas-agent-attachments{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px 0;padding:0 0 2px 0}.hy-canvas-agent-attachments[hidden]{display:none}.hy-canvas-agent-attachment-thumb{position:relative;width:54px;height:54px;border:1px solid rgba(184,255,55,.2);border-radius:12px;background:#23262d;overflow:hidden;cursor:zoom-in}.hy-canvas-agent-attachment-thumb img{width:100%;height:100%;object-fit:cover;display:block}.hy-canvas-agent-attachment-file{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:6px;box-sizing:border-box;color:#dfe8d7;font-size:10px;text-align:center;line-height:1.2}.hy-canvas-agent-attachment-remove{position:absolute;right:3px;top:3px;width:16px;height:16px;border:0;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;line-height:16px;padding:0;cursor:pointer}.hy-canvas-agent-attachment-preview{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:28px;pointer-events:auto}.hy-canvas-agent-attachment-preview[hidden]{display:none}.hy-canvas-agent-attachment-preview img{max-width:min(86vw,760px);max-height:82vh;border-radius:18px;box-shadow:0 20px 80px rgba(0,0,0,.58)}
```

- [ ] **Step 4: Move attachment list above the input row**

In `addCompose(panelEl)`, append the list before `main`:

```js
compose.appendChild(attachmentListEl);
compose.appendChild(main);
compose.appendChild(fileInputEl);
compose.appendChild(toolbar);
```

Remove the old `compose.appendChild(attachmentListEl)` after `fileInputEl`.

- [ ] **Step 5: Replace `renderAttachments()`**

Use this implementation:

```js
function renderAttachments() {
  if (!attachmentListEl) return;
  attachmentListEl.replaceChildren?.();
  const attachments = state.attachments();
  setHidden(attachmentListEl, attachments.length === 0);
  for (const attachment of attachments) {
    const tile = createElement(documentRef, "button", "hy-canvas-agent-attachment-thumb");
    tile.type = "button";
    tile.setAttribute?.("title", attachment.name || attachment.id || "reference");
    const src = String(attachment.previewUrl || attachment.url || attachment.src || "").trim();
    if (src && String(attachment.kind || "").toLowerCase() !== "text") {
      const img = createElement(documentRef, "img", "");
      img.src = src;
      img.alt = attachment.name || "reference";
      tile.appendChild(img);
    } else {
      tile.appendChild(createElement(documentRef, "span", "hy-canvas-agent-attachment-file", attachment.name || attachment.id || "file"));
    }
    tile.addEventListener("click", () => {
      state.lastReceipt = `Preview reference: ${attachment.name || attachment.id}`;
      render();
    });
    const remove = createElement(documentRef, "button", "hy-canvas-agent-attachment-remove", "x");
    remove.type = "button";
    remove.addEventListener("click", (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      attachmentStore?.remove?.(attachment.id);
      render();
    });
    tile.appendChild(remove);
    attachmentListEl.appendChild(tile);
  }
}
```

- [ ] **Step 6: Run attachment tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "attachment|thumbnail"
```

Expected: pass after updating old text-chip assertions to query `.hy-canvas-agent-attachment-thumb` or `title`.

---

### Task 8: Remove Persistent Skills AUTO Badge

**Files:**
- Modify: `modules/app/appAssistantPanel.js`
- Modify tests: `modules/app/appAssistantPanel.test.js`, `modules/app/appAssistantPanel.autoload.test.js`

- [ ] **Step 1: Update UI expectation**

Replace old `/AUTO/` assertion in `modules/app/appAssistantPanel.test.js` with:

```js
assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-compose-toolbar").textContent, /AUTO/);
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "AUTO|aria labels"
```

Expected: fails while badge still exists.

- [ ] **Step 3: Remove AUTO badge DOM**

In `modules/app/appAssistantPanel.js`, remove:

```js
const auto = bindRequirement(createElement(documentRef, "span", "hy-canvas-agent-auto", "S"), "assistant-auto-policy");
auto.appendChild(createElement(documentRef, "span", "hy-canvas-agent-auto-badge", "AUTO"));
toolbar.appendChild(auto);
```

Keep degraded notice behavior:

```js
if (state.canvasSkillsRuntime?.chatOnly && state.canvasSkillsRuntime?.notice) {
  showTransientNotice(state.canvasSkillsRuntime.notice);
}
```

- [ ] **Step 4: Run AUTO/degraded tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js --test-name-pattern "AUTO|degraded canvas skills|aria labels"
```

Expected: pass.

---

### Task 9: Extend Generation Task Store Intermediate States

**Files:**
- Modify: `modules/assistant/assistantGenerationTaskStore.js`
- Create or modify: `modules/assistant/assistantGenerationTaskStore.test.js`

- [ ] **Step 1: Add failing store tests**

Create or append `modules/assistant/assistantGenerationTaskStore.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { createAssistantGenerationTaskStore, AssistantGenerationTaskStatus } from "./assistantGenerationTaskStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, value); },
  };
}

test("assistantGenerationTaskStore: supports pending renderer to running to completed", () => {
  const store = createAssistantGenerationTaskStore({ storage: memoryStorage(), clock: () => "2026-06-06T00:00:00.000Z" });
  const task = store.queue({ id: "gen-1", nodeId: "image-1", status: AssistantGenerationTaskStatus.PendingRenderer });
  assert.equal(task.status, AssistantGenerationTaskStatus.PendingRenderer);
  assert.equal(store.submit("gen-1").status, AssistantGenerationTaskStatus.Submitting);
  assert.equal(store.start("gen-1").status, AssistantGenerationTaskStatus.Running);
  assert.equal(store.complete("gen-1").status, AssistantGenerationTaskStatus.Completed);
});

test("assistantGenerationTaskStore: retryable task can be retried", () => {
  const store = createAssistantGenerationTaskStore({ storage: memoryStorage(), idFactory: () => "gen-retry" });
  const task = store.queue({ id: "gen-1", nodeId: "image-1" });
  store.markRetryable(task.id, "renderer timeout");
  const retry = store.retry(task.id);
  assert.equal(retry.id, "gen-retry");
  assert.equal(retry.status, AssistantGenerationTaskStatus.PendingRenderer);
});
```

- [ ] **Step 2: Run store test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\assistantGenerationTaskStore.test.js
```

Expected: fails because statuses and methods do not exist.

- [ ] **Step 3: Extend statuses and transitions**

In `modules/assistant/assistantGenerationTaskStore.js`, set:

```js
export const AssistantGenerationTaskStatus = Object.freeze({
  PendingRenderer: "pendingRenderer",
  Queued: "queued",
  Submitting: "submitting",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Retryable: "retryable",
  Cancelled: "cancelled",
  Paused: "paused",
});
```

Use this transition map:

```js
const ALLOWED_TRANSITIONS = Object.freeze({
  [AssistantGenerationTaskStatus.PendingRenderer]: new Set([
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Retryable,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Queued]: new Set([
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Submitting]: new Set([
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Retryable,
    AssistantGenerationTaskStatus.Failed,
  ]),
  [AssistantGenerationTaskStatus.Running]: new Set([
    AssistantGenerationTaskStatus.Completed,
    AssistantGenerationTaskStatus.Failed,
    AssistantGenerationTaskStatus.Paused,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Paused]: new Set([
    AssistantGenerationTaskStatus.Running,
    AssistantGenerationTaskStatus.Cancelled,
    AssistantGenerationTaskStatus.Retryable,
  ]),
  [AssistantGenerationTaskStatus.Retryable]: new Set([
    AssistantGenerationTaskStatus.PendingRenderer,
    AssistantGenerationTaskStatus.Submitting,
    AssistantGenerationTaskStatus.Cancelled,
  ]),
  [AssistantGenerationTaskStatus.Completed]: new Set(),
  [AssistantGenerationTaskStatus.Failed]: new Set([AssistantGenerationTaskStatus.Retryable]),
  [AssistantGenerationTaskStatus.Cancelled]: new Set(),
});
```

Add methods:

```js
submit(id) {
  return transition(id, AssistantGenerationTaskStatus.Submitting, { error: "" });
},

markRetryable(id, error) {
  return transition(id, AssistantGenerationTaskStatus.Retryable, {
    error: String(error || "Generation can be retried."),
    completedAt: clock(),
  });
},

pause(id) {
  return transition(id, AssistantGenerationTaskStatus.Paused, {});
},
```

Update `retry(id)` to accept failed and retryable tasks and queue the new task as `pendingRenderer`.

- [ ] **Step 4: Run store tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\assistantGenerationTaskStore.test.js
```

Expected: pass.

---

### Task 10: Update Receipt Language to Avoid False Completion

**Files:**
- Modify: `modules/assistant/assistantActionPreview.js`
- Test: `modules/app/appAssistantPanel.p1Ui.test.js`

- [ ] **Step 1: Update receipt assertion**

Find the assertion similar to:

```js
assert.match(state.lastReceipt, /Completed 1 generation task/);
```

Replace it with:

```js
assert.match(state.lastReceipt, /Started 1 text\/image generation task|Submitted 1 generation task/);
assert.doesNotMatch(state.lastReceipt, /Completed 1 generation task/);
```

- [ ] **Step 2: Run focused receipt test and verify it fails**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "generation task"
```

Expected: fails if receipt still claims completion from submission data.

- [ ] **Step 3: Adjust lifecycle receipt**

In `modules/assistant/assistantActionPreview.js`, inside `generationLifecycleReceipt(result)`, add queued wording before completed wording:

```js
const queued = Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds.length : 0;
if (started > 0) {
  parts.push(`Started ${started} text/image generation task${started === 1 ? "" : "s"}.`);
} else if (queued > 0) {
  parts.push(`Submitted ${queued} generation task${queued === 1 ? "" : "s"}; waiting for canvas state.`);
}
```

Keep `Completed ...` only for `completedGenerationNodeIds`.

- [ ] **Step 4: Run focused receipt test**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "generation task"
```

Expected: pass.

---

### Task 11: Run Focused Regression Set

**Files:**
- No source edits unless tests reveal regressions in touched behavior.

- [ ] **Step 1: Run Canvas Skills tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\canvasSkills\generationStateMapper.test.js modules\\assistant\\canvasSkills\\generationTaskBridge.test.js modules\\assistant\\canvasSkills\\runtime.test.js modules\\assistant\\assistantCanvasNodeLifecycle.test.js modules\\assistant\\assistantCanvasSkills.integration.test.js modules\assistant\canvasSkills\executor.test.js modules\assistant\canvasSkills\loader.test.js
```

Expected: all pass.

- [ ] **Step 2: Run assistant tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantCanvasSkills.integration.test.js
```

Expected: all pass.

- [ ] **Step 3: Run panel tests**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js
```

Expected: all pass after old assertions are updated.

- [ ] **Step 4: Run complete suite**

Run:

```powershell
& 'D:/Aic/node.exe' --test --test-concurrency=1
```

Expected: all tests pass, or unrelated pre-existing failures are listed with exact failing test names and stack traces.

---

## Manual Acceptance Checklist

- [ ] Agent prompt "generate a cat image" creates an image node and the node enters visible generating state.
- [ ] The node shows manual-equivalent animation, input lock, and pause/stop control while generating.
- [ ] Agent operation card shows preparing/generating instead of completed during generation.
- [ ] When canvas node completes, fails, pauses, cancels, or becomes retryable, the card matches it.
- [ ] Only one operation card appears under one assistant reply.
- [ ] Technical skill traces are visible only in collapsed execution details.
- [ ] Uploaded references appear as thumbnails above the text input.
- [ ] Thumbnail X removes the reference without opening preview.
- [ ] Clicking thumbnail opens a larger preview overlay.
- [ ] Final-only backend stream appears as typewriter text.
- [ ] Agent-created text node is editable after completion or failure.
- [ ] Successful Skills autoload shows no persistent `AUTO`; degraded Skills load shows transient warning.

## Self-Review

- Spec coverage:
  - Generation auto-submit and renderer pending queue: Task 2.
  - Canvas source of truth and card sync: Task 4.
  - Single operation card and folded traces: Task 3 and Task 5.
  - Attachment thumbnails: Task 7.
  - Stream typewriter fallback: Task 6.
  - Text node editability: Task 1, Task 2, and Task 4 via terminal lock mapping.
  - Skills default with no persistent badge: Task 8.
  - Intermediate states: Task 1 and Task 9.
- Placeholder scan target: the plan contains no placeholder markers, no incomplete task, and no unspecified file path.
- Type consistency:
  - Card statuses use `preparing`, `generating`, `completed`, `failed`, `retryable`, `paused`, and `cancelled`.
  - Technical statuses use `pendingRenderer`, `queued`, `submitting`, `submitted`, `running`, `completed`, `failed`, `retryable`, `paused`, and `cancelled`.
  - Node patches use `generationStatus`, `generationLocked`, `generationRetryable`, `generationWarning`, and `generationError`.



