# Huanying Canvas Agent R5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan stepwise. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the R5 product-quality live calibration gate for Huanying Canvas Agent: deterministic browser journeys, screenshot artifacts, generation permission gates, pending-state persistence, failure-to-regression conversion, and secret-safe release preflight.

**Architecture:** Keep Assistant Core decoupled from Huanying internals. R5 adds a test/runtime harness around the existing panel, API client, graph adapter, executor, conversation store, and generation task store instead of letting Pi/Agent mutate Huanying directly. The live harness drives the real page, injects deterministic fixtures, records sanitized artifacts, and converts failures into focused regression candidates.

**Tech Stack:** Browser ES modules, Node test runner via `D:\Aic\node.exe --test`, Playwright/Chrome live checks, Python `unittest`, Huanying graphStore adapter, `tools/assistant_panel_live_screenshot_check.mjs`, `tools/score_assistant_live_run.py`, local JSON fixture/artifact files.

---

## 0. Source Of Truth And Hard Rules

Product requirement document:

- `docs/canvas_agent_r5_product_requirements.md`

Existing R1-R4 development evidence:

- `docs/canvas_agent_r1_r4_product_requirements.md`
- `docs/canvas_agent_r1_r4_development_plan.md`
- `docs/canvas_agent_p0_p1_implementation_log.md`

Hard rules:

- Do not edit obfuscated/minified `main.js`.
- Do not let Pi/Agent execute shell, write files, or mutate Huanying directly.
- Only `message.done` may carry trusted actions; `message.delta` is display-only.
- Video generation is high risk and must require strong confirmation.
- Text/image low-risk generation may queue through the local generation task path.
- Pending generation state must survive renderer remount/refresh and must not duplicate tasks.
- Every live failure must produce artifacts and a regression candidate.
- API keys must never appear in docs, tests, fixtures, logs, screenshots, scorecards, exports, or artifacts.
- If a live smoke run needs a real model, use Huanying unified API key configuration or runtime environment injection only. Never write the real key into source, docs, fixtures, test output, or command logs.

---

## 1. Current Implementation Map

| Area | File | Current role | R5 responsibility |
|---|---|---|---|
| Panel UI/state | `modules/app/appAssistantPanel.js` | Assistant launcher/panel, state, stream, preview, apply, history, model guard | Expose stable live debug snapshot, strengthen generation/pending UI states, ensure restore never auto-executes |
| Autoload | `modules/app/appAssistantPanel.autoload.js` | Mounts panel into real Huanying runtime and exposes `window.__huanyingCanvasAgentAssistant` | Allow deterministic live fixture injection without changing production behavior |
| API client | `api/canvasAgentApi.js` | Chat, chatStream, validate, status, conversations | Support fixture/mocked stream in live harness through injected API object |
| Protocol | `modules/assistant/assistantProtocol.js` | Request/response/frame normalization | Preserve final-frame-only action trust in live fixtures |
| Stream client | `modules/assistant/assistantStreamingClient.js` | Stream state and frame consumption | Used by fixture API and panel state |
| Executor | `modules/assistant/assistantActionExecutor.js` | Applies canvas actions through graphStore; `defaultGenerationTaskRunner` calls renderer bridge or returns pending | Add/verify generation idempotency and task metadata for R5 |
| Generation tasks | `modules/assistant/assistantGenerationTaskStore.js` | Local persistent generation task store | Use as R5 pending persistence source and remount/refresh proof |
| Conversation | `modules/assistant/assistantConversationStore.js` | Local/remote conversation persistence | Store proposed transactions, receipts, and generation task references |
| Preview | `modules/assistant/assistantActionPreviewModel.js` | Action grouping/risk/strong confirmation UI model | Verify text/image vs video risk gates in real UI |
| Model registry | `modules/assistant/assistantModelRegistry.js` | Unified API config -> model options/default model/disabled reasons | Verify configured/disabled/default model dropdown in live journey |
| Live screenshot | `tools/assistant_panel_live_screenshot_check.mjs` | Opens page, clicks panel, checks basic UI, screenshots once | Upgrade into multi-step journey runner with artifacts |
| Live screenshot tests | `tools/assistant_panel_live_screenshot_check.test.mjs` | Noise filter and assistant-route blocking tests | Add fixture/artifact/scorecard/failure-regression tests |
| Scorecard | `tools/score_assistant_live_run.py` | Scores action/schema/browser acceptance payloads | Extend to R5 UI/stream/preview/apply/history/generation/secret dimensions |
| Scorecard tests | `assistant_live_run_scorecard_test.py` | Existing Python scorecard tests | Add R5 scorecard coverage |
| Release checks | `tools/check_pi_canvas_agent_source_tree.py`, `tools/run_claw_assistant_offline_regression.py` | Offline/source-tree checks | Add R5 preflight or call them from R5 regression script |

---

## 2. Files To Modify Or Create

### 2.1 Files To Modify

| File | R5 change responsibility |
|---|---|
| `tools/assistant_panel_live_screenshot_check.mjs` | Convert from one-shot screenshot into deterministic journey runner; add artifact bundle, fixture injection, state snapshots, failure candidate output |
| `tools/assistant_panel_live_screenshot_check.test.mjs` | Unit tests for artifact path, sanitization, failure classification, fixture frame order, secret-safe summary |
| `tools/score_assistant_live_run.py` | Add R5 dimensions: panelOpen, modelDropdown, streaming, actionPreview, applyReceipt, historyRestore, generationGate, pendingState, secretSafety |
| `assistant_live_run_scorecard_test.py` | Tests for pass/fail R5 scorecard payloads and failure owner suggestion |
| `modules/app/appAssistantPanel.js` | Add debug snapshot hooks and stable data attributes/labels where needed; preserve UI behavior |
| `modules/app/appAssistantPanel.p1Ui.test.js` | Add tests for debug snapshot and video strong confirmation UI state if missing |
| `modules/app/appAssistantPanel.autoload.js` | Add guarded fixture injection hook for live checks; production default remains unchanged |
| `modules/app/appAssistantPanel.autoload.test.js` | Test fixture injection does not leak into production and still reuses `#fabBtn` |
| `modules/assistant/assistantActionExecutor.js` | Add deterministic generation task ID / idempotent queue semantics if not already sufficient |
| `modules/assistant/assistantActionExecutor.test.js` | Add text/image queue idempotency and video blocked/strong-confirmed flow tests |
| `modules/assistant/assistantGenerationTaskStore.js` | Add optional upsert/queueOnce semantics if needed by executor |
| `modules/assistant/assistantGenerationTaskStore.test.js` | Add remount/refresh persistence and no duplicate task tests |
| `modules/assistant/assistantConversationStore.js` | Ensure generation task references can be recorded/restored without auto-run |
| `modules/assistant/assistantConversationStore.test.js` | Add restore pending generation/action does not execute |
| `docs/canvas_agent_p0_p1_implementation_log.md` | Append R5 evidence after implementation |

### 2.2 Files To Create

| File | Responsibility |
|---|---|
| `tools/assistant_live_fixture_runtime.mjs` | Browser-side deterministic fixtures and fake API/graph helpers for live runner |
| `tools/assistant_live_artifact_utils.mjs` | Sanitization, artifact directory creation, summary/scorecard/fixture-candidate writing |
| `tools/assistant_live_artifact_utils.test.mjs` | Unit tests for secret redaction and artifact metadata |
| `docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json` | Deterministic fixture for stream -> preview -> apply -> receipt -> history |
| `docs/assistant_live_cases/r5-generation-permission-gate.json` | Fixture for text/image queue and video strong confirmation |
| `docs/assistant_live_cases/r5-history-restore-pending-actions.json` | Fixture for history restore without auto execution |
| `docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json` | Fixture proving delta actions are advisory and ignored |
| `tools/run_canvas_agent_r5_regression.ps1` | Optional convenience runner for frontend/backend/live/secret scan preflight |

---

## 3. R5 Development Strategy

Implementation order is intentionally quality-gate first:

1. Build artifact/sanitization utilities before the live runner records more data.
2. Build deterministic fixtures before expanding browser journeys.
3. Extend scorecard before relying on it as a gate.
4. Add panel/autoload debug hooks through explicit, guarded APIs.
5. Add generation idempotency and pending persistence tests before live checks.
6. Expand the live runner into the complete journey.
7. Add release preflight and implementation evidence.

Run with TDD:

- Write the failing test.
- Run it and confirm the expected failure.
- Implement minimal code.
- Run the focused test.
- Run the relevant regression group.

Do not skip the live screenshot verification after changing UI, autoload, executor, generation, or fixture runtime.

---

## 4. Task 0: Baseline And Safety Gate

**Files:**

- Read: `docs/canvas_agent_r5_product_requirements.md`
- Read: `docs/canvas_agent_p0_p1_implementation_log.md`
- Modify after verification: `docs/canvas_agent_p0_p1_implementation_log.md`

- [ ] **Step 1: Confirm CodeGraph index health**

Run:

```powershell
codegraph status
```

Expected:

```text
Files indexed
```

- [ ] **Step 2: Run current R1-R4 frontend baseline**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.streaming.test.js api\canvasAgentApi.test.js tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 3: Run current backend baseline**

Run:

```powershell
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_context_service_test http_route_dispatcher_test
```

Expected:

```text
OK
```

- [ ] **Step 4: Run current live screenshot baseline**

Run:

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```json
{"success": true}
```

- [ ] **Step 5: Run scoped secret-prefix scan**

Run:

```powershell
$paths = @('docs\canvas_agent_r*.md','docs\canvas_agent_p0_p1_implementation_log.md','modules\assistant\*.js','modules\assistant\*.test.js','modules\app\appAssistantPanel*.js','modules\app\appAssistantPanel*.test.js','api\canvasAgentApi*.js','services\canvas_agent*.py','services\pi_bridge_service.py','*canvas_agent*_test.py','pi_bridge_service_test.py','tools\assistant*_*.mjs','tools\assistant*_*.test.mjs')
$matches = Select-String -Path $paths -Pattern 's[k]-' -ErrorAction SilentlyContinue
if ($matches) { $matches | ForEach-Object { "MATCH $($_.Path):$($_.LineNumber)" }; "TOTAL $($matches.Count)" } else { 'TOTAL 0' }
```

Expected:

```text
TOTAL 0
```

---

## 5. Task 1: Artifact Utilities And Secret-Safe Output

**Files:**

- Create: `tools/assistant_live_artifact_utils.mjs`
- Create: `tools/assistant_live_artifact_utils.test.mjs`
- Modify: `tools/assistant_panel_live_screenshot_check.mjs`

### Goal

Before collecting richer live artifacts, define a reusable sanitizer and artifact writer so no key, token, signed URL, local path, or bearer credential can be written to disk.

- [ ] **Step 1: Write failing tests for redaction**

Create `tools/assistant_live_artifact_utils.test.mjs` with:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeArtifactValue, buildArtifactSummary } from "./assistant_live_artifact_utils.mjs";

const keyPrefix = "s" + "k-";

test("assistant live artifacts redact secrets, signed URLs, and local paths", () => {
  const input = {
    apiKey: `${keyPrefix}fixtureSecret`,
    authorization: "Bearer bearer-secret",
    url: "https://user:pass@example.test/v1?token=abc&safe=1#frag",
    file: "D:\\private\\asset.png",
    nested: {
      note: `OpenAI ${keyPrefix}nestedSecret`,
      keep: "safe text",
    },
  };

  const sanitized = sanitizeArtifactValue(input);
  const serialized = JSON.stringify(sanitized);

  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}fixtureSecret|${keyPrefix}nestedSecret`));
  assert.doesNotMatch(serialized, /bearer-secret|user:pass|token=abc|D:\\private/);
  assert.match(serialized, /safe text/);
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.url, "https://example.test/v1");
});

test("buildArtifactSummary keeps command-safe public run metadata only", () => {
  const summary = buildArtifactSummary({
    runId: "run-1",
    success: false,
    failedStep: "apply-actions",
    artifactDir: "output/regression/assistant-live/run-1",
    issues: ["console: boom"],
    model: { provider: "pi_canvas_agent", modelId: "agent-live-fixture", apiKey: `${keyPrefix}secret` },
  });

  const serialized = JSON.stringify(summary);
  assert.equal(summary.runId, "run-1");
  assert.equal(summary.failedStep, "apply-actions");
  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}secret`));
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_live_artifact_utils.test.mjs
```

Expected:

```text
FAIL
Cannot find module './assistant_live_artifact_utils.mjs'
```

- [ ] **Step 3: Implement artifact utilities**

Create `tools/assistant_live_artifact_utils.mjs`:

```javascript
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OPENAI_KEY_PREFIX = "s" + "k-";
const SECRET_KEY_RE = /^(apiKey|api_key|authorization|secret|token|password|credential|proxyToken)$/i;
const SECRET_QUERY_RE = /^(token|api[_-]?key|key|secret|signature|password|credential|authorization|access[_-]?token|x-amz-signature)$/i;

function redactString(value) {
  let text = String(value ?? "");
  text = text.replace(new RegExp(`\\b${OPENAI_KEY_PREFIX}[A-Za-z0-9_-]+`, "g"), `${OPENAI_KEY_PREFIX}[REDACTED]`);
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  text = text.replace(/\b[A-Za-z]:\\[^"'<>|]+/g, "[REDACTED_PATH]");
  try {
    const url = new URL(text);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_RE.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.search ? url.toString() : `${url.origin}${url.pathname}`;
  } catch {
    return text;
  }
}

export function sanitizeArtifactValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeArtifactValue);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = sanitizeArtifactValue(child);
      }
    }
    return result;
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  return value;
}

export function buildRunId(prefix = "assistant-live") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export async function createArtifactBundle({ outputDir = "output/regression/assistant-live", runId = buildRunId() } = {}) {
  const artifactDir = path.resolve(outputDir, runId);
  const screenshotsDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  return { runId, artifactDir, screenshotsDir };
}

export async function writeSanitizedJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(sanitizeArtifactValue(value), null, 2), "utf8");
}

export async function writeTextArtifact(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, redactString(text), "utf8");
}

export function buildArtifactSummary({
  runId,
  success,
  failedStep = "",
  artifactDir = "",
  issues = [],
  model = null,
  screenshotPaths = [],
  scorecard = null,
} = {}) {
  return sanitizeArtifactValue({
    runId,
    success: Boolean(success),
    failedStep,
    artifactDir,
    issues,
    model,
    screenshotPaths,
    scorecard,
  });
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_live_artifact_utils.test.mjs
```

Expected:

```text
pass
```

---

## 6. Task 2: Deterministic Live Fixture Runtime

**Files:**

- Create: `tools/assistant_live_fixture_runtime.mjs`
- Create: `docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json`
- Create: `docs/assistant_live_cases/r5-generation-permission-gate.json`
- Create: `docs/assistant_live_cases/r5-history-restore-pending-actions.json`
- Create: `docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json`
- Modify: `tools/assistant_panel_live_screenshot_check.test.mjs`

### Goal

Make live journeys deterministic and offline. The runner must not depend on a real external model by default. Real API smoke is opt-in only and must use runtime config.

- [ ] **Step 1: Add fixture runtime tests**

Append to `tools/assistant_panel_live_screenshot_check.test.mjs`:

```javascript
import {
  createFixtureCanvasAgentApi,
  createFixtureGraphStore,
  graphSnapshot,
  loadLiveFixtureFromObject,
} from "./assistant_live_fixture_runtime.mjs";

test("assistant live fixture runtime streams deterministic frames", async () => {
  const fixture = loadLiveFixtureFromObject({
    id: "fixture-1",
    streamFrames: [
      { type: "message.start", conversationId: "conv-1" },
      { type: "message.delta", delta: "hello" },
      { type: "message.done", reply: "done", actions: [{ type: "focus_nodes", nodeIds: ["n1"] }] },
    ],
    validationResult: { valid: true, actions: [{ type: "focus_nodes", nodeIds: ["n1"] }], warnings: [] },
  });
  const api = createFixtureCanvasAgentApi(fixture);
  const events = [];
  const result = await api.chatStream({ message: "x" }, { onEvent: (event) => events.push(event) });

  assert.equal(result.reply, "done");
  assert.deepEqual(events.map((event) => event.type), ["message.start", "message.delta", "message.done"]);
  assert.deepEqual((await api.validateActions([{ type: "focus_nodes", nodeIds: ["n1"] }])).actions, [
    { type: "focus_nodes", nodeIds: ["n1"] },
  ]);
});

test("assistant live fixture graph store snapshots nodes and edges", () => {
  const graph = createFixtureGraphStore({
    nodes: [{ id: "seed", nodeType: "source-text", name: "Seed" }],
    edges: [],
    selectedNodeIds: ["seed"],
  });
  graph.addNode({ id: "note", nodeType: "comment", name: "Note" });
  graph.addEdge({ id: "edge-1", source: "seed", target: "note" });
  graph.setSelectedNodes(["note"]);

  assert.deepEqual(graphSnapshot(graph), {
    nodeCount: 2,
    edgeCount: 1,
    nodes: [
      { id: "seed", nodeType: "source-text", type: "", name: "Seed", x: 0, y: 0 },
      { id: "note", nodeType: "comment", type: "", name: "Note", x: 0, y: 0 },
    ],
    edges: [{ id: "edge-1", source: "seed", target: "note" }],
    selectedNodeIds: ["note"],
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
FAIL
Cannot find module './assistant_live_fixture_runtime.mjs'
```

- [ ] **Step 3: Implement fixture runtime**

Create `tools/assistant_live_fixture_runtime.mjs`:

```javascript
import { readFile } from "node:fs/promises";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function loadLiveFixtureFromObject(raw = {}) {
  return {
    id: String(raw.id || "fixture"),
    title: String(raw.title || raw.id || "Fixture"),
    initialCanvas: {
      nodes: safeArray(raw.initialCanvas?.nodes).map(clone),
      edges: safeArray(raw.initialCanvas?.edges).map(clone),
      selectedNodeIds: safeArray(raw.initialCanvas?.selectedNodeIds).map(String),
    },
    modelOptions: safeArray(raw.modelOptions).map(clone),
    streamFrames: safeArray(raw.streamFrames).map(clone),
    validationResult: raw.validationResult && typeof raw.validationResult === "object"
      ? clone(raw.validationResult)
      : null,
    expected: raw.expected && typeof raw.expected === "object" ? clone(raw.expected) : {},
  };
}

export async function loadLiveFixture(filePath) {
  return loadLiveFixtureFromObject(JSON.parse(await readFile(filePath, "utf8")));
}

export function createFixtureCanvasAgentApi(fixture) {
  const normalized = loadLiveFixtureFromObject(fixture);
  return {
    async status() {
      return { success: true, available: true, status: "ready" };
    },
    async chat() {
      const done = normalized.streamFrames.find((frame) => frame.type === "message.done") || {};
      return clone(done);
    },
    async chatStream(_payload, handlers = {}) {
      let final = null;
      for (const frame of normalized.streamFrames) {
        handlers.onEvent?.(clone(frame));
        handlers.onFrame?.(clone(frame));
        if (frame.type === "message.done") {
          final = clone(frame);
        }
        await Promise.resolve();
      }
      handlers.onDone?.(clone(final || {}));
      return final || { reply: "", actions: [], warnings: [] };
    },
    async validateActions(actions) {
      if (normalized.validationResult) {
        return clone(normalized.validationResult);
      }
      return { valid: true, actions: clone(actions), warnings: [] };
    },
    async previewContext(context) {
      return { success: true, context: clone(context), warnings: [] };
    },
  };
}

export function createFixtureGraphStore(initialCanvas = {}) {
  const state = {
    nodes: safeArray(initialCanvas.nodes).map((node) => ({ x: 0, y: 0, ...clone(node) })),
    edges: safeArray(initialCanvas.edges).map(clone),
    selectedNodeIds: safeArray(initialCanvas.selectedNodeIds).map(String),
  };
  return {
    get nodes() {
      return state.nodes;
    },
    get edges() {
      return state.edges;
    },
    getState() {
      return { nodes: state.nodes, edges: state.edges, selectedNodeIds: state.selectedNodeIds };
    },
    addNode(node = {}) {
      state.nodes.push({ x: 0, y: 0, ...clone(node) });
    },
    addEdge(edge = {}) {
      state.edges.push(clone(edge));
    },
    updateNodeData(nodeId, patch = {}) {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...clone(patch) };
      }
    },
    updateNode(nodeId, patch = {}) {
      const node = state.nodes.find((item) => item.id === nodeId);
      if (node) {
        Object.assign(node, clone(patch));
      }
    },
    setSelectedNodes(nodeIds = []) {
      state.selectedNodeIds = safeArray(nodeIds).map(String);
    },
  };
}

export function graphSnapshot(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore || {};
  const nodes = safeArray(state.nodes || graphStore?.nodes);
  const edges = safeArray(state.edges || graphStore?.edges);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes: nodes.map((node) => ({
      id: String(node?.id || ""),
      nodeType: String(node?.nodeType || ""),
      type: String(node?.type || ""),
      name: String(node?.name || node?.title || ""),
      x: Number(node?.x || 0),
      y: Number(node?.y || 0),
    })),
    edges: edges.map((edge) => ({
      id: String(edge?.id || ""),
      source: String(edge?.source || edge?.sourceId || edge?.from || ""),
      target: String(edge?.target || edge?.targetId || edge?.to || ""),
    })),
    selectedNodeIds: safeArray(state.selectedNodeIds).map(String),
  };
}
```

- [ ] **Step 4: Create R5 fixture files**

Create `docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json`:

```json
{
  "id": "r5-basic-create-connect-layout-focus",
  "title": "R5 basic create/connect/layout/focus",
  "initialCanvas": {
    "nodes": [{"id": "seed_prompt", "nodeType": "source-text", "name": "Seed Prompt", "x": 0, "y": 0}],
    "edges": [],
    "selectedNodeIds": ["seed_prompt"]
  },
  "modelOptions": [
    {"provider": "pi_canvas_agent", "modelId": "agent-live-fixture", "displayName": "R5 Live Fixture", "configured": true},
    {"provider": "pi_canvas_agent", "modelId": "agent-disabled", "displayName": "Disabled Agent", "configured": false, "disabledReason": "缺少 API Key 或 Endpoint"}
  ],
  "streamFrames": [
    {"type": "message.start", "conversationId": "conv_r5_basic", "messageId": "msg_r5_basic", "traceId": "trace_r5_basic"},
    {"type": "message.delta", "delta": "我会创建评论节点、连线、整理布局并聚焦。"},
    {"type": "warning", "message": "使用当前选中节点作为连接起点。"},
    {
      "type": "message.done",
      "conversationId": "conv_r5_basic",
      "messageId": "msg_r5_basic",
      "traceId": "trace_r5_basic",
      "reply": "已准备好画布更新方案。",
      "actions": [
        {"id": "r5_note", "type": "create_node", "nodeType": "comment", "name": "R5 Review Note", "data": {"content": "Live fixture note"}},
        {"type": "connect_nodes", "from": "seed_prompt", "to": "r5_note"},
        {"type": "layout_nodes", "nodeIds": ["seed_prompt", "r5_note"], "layout": "horizontal"},
        {"type": "focus_nodes", "nodeIds": ["r5_note"]}
      ],
      "warnings": [],
      "requiresConfirmation": false
    }
  ],
  "expected": {
    "createdNodes": 1,
    "createdEdges": 1,
    "receiptContains": ["R5 Review Note"],
    "historyRestores": true
  }
}
```

Create `docs/assistant_live_cases/r5-generation-permission-gate.json`:

```json
{
  "id": "r5-generation-permission-gate",
  "title": "R5 generation permission gate",
  "initialCanvas": {
    "nodes": [
      {"id": "text_node", "nodeType": "ai-text", "name": "Text Node"},
      {"id": "image_node", "nodeType": "ai-image", "name": "Image Node"},
      {"id": "video_node", "nodeType": "ai-video", "name": "Video Node"}
    ],
    "edges": [],
    "selectedNodeIds": ["text_node"]
  },
  "streamFrames": [
    {"type": "message.start", "conversationId": "conv_r5_generation"},
    {"type": "message.delta", "delta": "我会排队文本和图片生成，并阻止视频误生成。"},
    {
      "type": "message.done",
      "reply": "文本和图片可以排队；视频需要强确认。",
      "actions": [
        {"type": "queue_generation_task", "nodeId": "text_node", "nodeType": "ai-text", "prompt": "write copy"},
        {"type": "queue_generation_task", "nodeId": "image_node", "nodeType": "ai-image", "prompt": "make image"},
        {"type": "queue_generation_task", "nodeId": "video_node", "nodeType": "ai-video", "prompt": "make video", "requiresConfirmation": true}
      ],
      "requiresConfirmation": true
    }
  ],
  "expected": {
    "safeQueuedNodeIds": ["text_node", "image_node"],
    "videoRequiresStrongConfirmation": true
  }
}
```

Create `docs/assistant_live_cases/r5-history-restore-pending-actions.json`:

```json
{
  "id": "r5-history-restore-pending-actions",
  "title": "R5 history restore pending actions",
  "initialCanvas": {
    "nodes": [{"id": "seed_prompt", "nodeType": "source-text", "name": "Seed Prompt"}],
    "edges": [],
    "selectedNodeIds": ["seed_prompt"]
  },
  "streamFrames": [
    {"type": "message.start", "conversationId": "conv_r5_history"},
    {"type": "message.delta", "delta": "我先提出一个待应用动作。"},
    {
      "type": "message.done",
      "reply": "已提出待应用动作。",
      "actions": [{"id": "history_note", "type": "create_node", "nodeType": "comment", "name": "History Pending Note"}],
      "requiresConfirmation": false
    }
  ],
  "expected": {
    "restoreKeepsPendingActions": true,
    "restoreDoesNotAutoExecute": true
  }
}
```

Create `docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json`:

```json
{
  "id": "r5-invalid-delta-actions-do-not-execute",
  "title": "R5 delta actions are ignored",
  "initialCanvas": {
    "nodes": [{"id": "seed_prompt", "nodeType": "source-text", "name": "Seed Prompt"}],
    "edges": [],
    "selectedNodeIds": ["seed_prompt"]
  },
  "streamFrames": [
    {"type": "message.start", "conversationId": "conv_r5_delta"},
    {"type": "message.delta", "delta": "不应执行这里的动作。", "actions": [{"type": "create_node", "nodeType": "comment", "name": "Should Not Exist"}]},
    {"type": "message.done", "reply": "没有 final actions。", "actions": [], "requiresConfirmation": false}
  ],
  "expected": {
    "createdNodes": 0,
    "deltaActionsIgnored": true
  }
}
```

- [ ] **Step 5: Run fixture tests**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

---

## 7. Task 3: R5 Scorecard Expansion

**Files:**

- Modify: `tools/score_assistant_live_run.py`
- Modify: `assistant_live_run_scorecard_test.py`

### Goal

Extend the scorecard from action-batch scoring into R5 journey scoring: UI, model dropdown, streaming, preview, apply, history, generation gate, pending state, and secret safety.

- [ ] **Step 1: Add failing scorecard tests**

Append to `assistant_live_run_scorecard_test.py`:

```python
def test_r5_scorecard_passes_complete_live_journey(self):
    payload = {
        "r5Journey": {
            "panelOpen": {"pass": True},
            "modelDropdown": {"pass": True},
            "streaming": {"pass": True},
            "actionPreview": {"pass": True},
            "applyReceipt": {"pass": True},
            "historyRestore": {"pass": True},
            "generationGate": {"pass": True},
            "pendingState": {"pass": True},
            "secretSafety": {"pass": True},
        }
    }

    result = score_live_run(payload)

    self.assertTrue(result["passesTarget"], result)
    self.assertIn("r5Journey", result)
    self.assertEqual(result["r5Journey"]["failedStep"], "")


def test_r5_scorecard_suggests_regression_owner_for_apply_failure(self):
    payload = {
        "r5Journey": {
            "panelOpen": {"pass": True},
            "modelDropdown": {"pass": True},
            "streaming": {"pass": True},
            "actionPreview": {"pass": True},
            "applyReceipt": {"pass": False, "owner": "executor", "suggestedRegression": "modules/assistant/assistantActionExecutor.test.js"},
            "historyRestore": {"pass": False},
            "generationGate": {"pass": True},
            "pendingState": {"pass": True},
            "secretSafety": {"pass": True},
        }
    }

    result = score_live_run(payload)

    self.assertFalse(result["passesTarget"])
    self.assertEqual(result["r5Journey"]["failedStep"], "applyReceipt")
    self.assertEqual(result["r5Journey"]["likelyOwner"], "executor")
    self.assertEqual(result["r5Journey"]["suggestedRegression"], "modules/assistant/assistantActionExecutor.test.js")
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
python -m unittest assistant_live_run_scorecard_test
```

Expected:

```text
FAIL
'r5Journey'
```

- [ ] **Step 3: Implement R5 scoring**

Add helpers to `tools/score_assistant_live_run.py`:

```python
R5_CHECKS = (
    ("panelOpen", 10, "ui", "modules/app/appAssistantPanel.test.js"),
    ("modelDropdown", 10, "model", "modules/assistant/assistantModelRegistry.test.js"),
    ("streaming", 15, "stream", "modules/assistant/assistantStreamingClient.test.js"),
    ("actionPreview", 15, "ui", "modules/assistant/assistantActionPreviewModel.test.js"),
    ("applyReceipt", 15, "executor", "modules/assistant/assistantActionExecutor.test.js"),
    ("historyRestore", 10, "history", "modules/assistant/assistantConversationStore.test.js"),
    ("generationGate", 15, "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
    ("pendingState", 10, "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
    ("secretSafety", 10, "sanitizer", "tools/assistant_live_artifact_utils.test.mjs"),
)


def _score_r5_journey(payload: dict[str, Any]) -> dict[str, Any] | None:
    journey = _as_dict(payload.get("r5Journey"))
    if not journey:
        return None
    checks: dict[str, dict[str, Any]] = {}
    total = 0
    max_score = 0
    failed_step = ""
    likely_owner = ""
    suggested_regression = ""
    for name, weight, default_owner, default_regression in R5_CHECKS:
        item = _as_dict(journey.get(name))
        passed = item.get("pass") is True
        score = weight if passed else 0
        max_score += weight
        total += score
        checks[name] = {
            "pass": passed,
            "score": score,
            "max": weight,
            "owner": str(item.get("owner") or default_owner),
            "suggestedRegression": str(item.get("suggestedRegression") or default_regression),
        }
        if not passed and not failed_step:
            failed_step = name
            likely_owner = checks[name]["owner"]
            suggested_regression = checks[name]["suggestedRegression"]
    return {
        "total": total,
        "max": max_score,
        "passesTarget": total == max_score,
        "checks": checks,
        "failedStep": failed_step,
        "likelyOwner": likely_owner,
        "suggestedRegression": suggested_regression,
    }
```

Modify `score_live_run()` after dimensions are built:

```python
    r5_journey = _score_r5_journey(payload)
    if r5_journey is not None:
        passes_target = passes_target and r5_journey["passesTarget"]
```

And include it in returned dict:

```python
    result = {
        "total": total,
        "max": 25,
        "passesTarget": passes_target,
        "dimensions": dimensions,
        "warnings": warnings,
    }
    if r5_journey is not None:
        result["r5Journey"] = r5_journey
    return result
```

- [ ] **Step 4: Run scorecard tests**

Run:

```powershell
python -m unittest assistant_live_run_scorecard_test
```

Expected:

```text
OK
```

---

## 8. Task 4: Panel Debug Snapshot And Stable Live Selectors

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

### Goal

Expose a sanitized, stable panel state snapshot for the live runner and ensure critical UI nodes have stable selectors/labels. This is a debug/test hook only; it must not leak secrets or alter production behavior.

- [ ] **Step 1: Add failing state snapshot test**

Append to `modules/app/appAssistantPanel.p1Ui.test.js`:

```javascript
test("appAssistantPanel P1 UI: debug snapshot is sanitized and includes live state", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    selectedModel: {
      provider: "pi_canvas_agent",
      modelId: "agent-live-fixture",
      apiKey: "must-not-leak",
    },
  });

  await state.sendMessage("hello");
  const snapshot = state.debugSnapshot();
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.status, "done_no_actions");
  assert.equal(snapshot.selectedModel.provider, "pi_canvas_agent");
  assert.equal(snapshot.selectedModel.modelId, "agent-live-fixture");
  assert.doesNotMatch(serialized, /must-not-leak|apiKey/);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.p1Ui.test.js
```

Expected:

```text
FAIL
state.debugSnapshot is not a function
```

- [ ] **Step 3: Implement `debugSnapshot()` in panel state**

In `modules/app/appAssistantPanel.js`, add a local sanitizer near model helpers:

```javascript
function sanitizeDebugModel(model) {
  const normalized = normalizeAssistantModel(model);
  if (!normalized) {
    return null;
  }
  const {
    provider,
    modelId,
    id,
    model: modelName,
    displayName,
    configured,
    disabledReason,
    capabilities,
  } = normalized;
  return {
    provider,
    modelId,
    id,
    model: modelName,
    displayName,
    configured,
    disabledReason,
    capabilities,
  };
}
```

Add method to returned state object:

```javascript
    debugSnapshot() {
      return {
        status: state.status,
        streaming: Boolean(state.streaming),
        conversationId: state.conversationId || "",
        messageCount: state.messages.length,
        pendingActionCount: state.pendingActions.length,
        lastWarnings: [...state.lastWarnings],
        selectedModel: sanitizeDebugModel(state.selectedModel),
        modelOptions: normalizeModelOptions(state.modelOptions).map(sanitizeDebugModel).filter(Boolean),
        lastReceipt: typeof state.lastReceipt === "string" ? state.lastReceipt : "",
        hasReceiptDetails: Boolean(state.lastReceiptDetails),
      };
    },
```

- [ ] **Step 4: Add stable DOM data attributes if missing**

In render functions for key elements, ensure:

```javascript
panel.dataset.canvasAgentPanel = "true";
modelButton.dataset.canvasAgentControl = "model";
historyButton.dataset.canvasAgentControl = "history";
sendButton.dataset.canvasAgentControl = "send";
```

Do not remove existing classes/aria labels.

- [ ] **Step 5: Run UI tests**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
```

Expected:

```text
pass
```

---

## 9. Task 5: Autoload Fixture Injection Hook

**Files:**

- Modify: `modules/app/appAssistantPanel.autoload.js`
- Modify: `modules/app/appAssistantPanel.autoload.test.js`

### Goal

Allow the live runner to install the real panel with deterministic fake API/graph/model options without changing production behavior.

- [ ] **Step 1: Add failing autoload test**

Append to `modules/app/appAssistantPanel.autoload.test.js`:

```javascript
test("appAssistantPanel.autoload: live fixture injection overrides api graph and models only when provided", () => {
  const document = createFakeDocument();
  const fixtureApi = {
    async chat() {
      return { reply: "fixture", actions: [] };
    },
  };
  const fixtureGraph = { nodes: [], edges: [] };
  const controller = installAppAssistantPanel({
    document,
    liveFixture: {
      api: fixtureApi,
      graphStore: fixtureGraph,
      modelOptions: [{ provider: "pi_canvas_agent", modelId: "agent-live-fixture", configured: true }],
      selectedModel: { provider: "pi_canvas_agent", modelId: "agent-live-fixture", configured: true },
    },
    autoInstall: false,
  });

  assert.equal(controller.state.selectedModel.modelId, "agent-live-fixture");
  assert.deepEqual(controller.state.modelOptions.map((item) => item.modelId), ["agent-live-fixture"]);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.autoload.test.js
```

Expected:

```text
FAIL
selectedModel did not use fixture
```

- [ ] **Step 3: Implement guarded fixture injection**

In `installAppAssistantPanel` signature add:

```javascript
  liveFixture = null,
```

Then derive runtime objects:

```javascript
  const effectiveApi = liveFixture?.api || api;
  const effectiveGraphStore = liveFixture?.graphStore || graphStore;
  const graphAdapter = createCanvasAgentGraphStoreAdapter(effectiveGraphStore);
```

Model selection:

```javascript
  const modelRegistry = buildAssistantModelRegistry(apiConfig || {});
  const modelOptions = Array.isArray(liveFixture?.modelOptions) ? liveFixture.modelOptions : modelRegistry.options;
  const selectedModel = liveFixture?.selectedModel || modelRegistry.defaultModel || modelRegistry.defaultAgentModel();
```

Pass `effectiveApi` to `createAppAssistantPanel`.

- [ ] **Step 4: Ensure production behavior unchanged**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.autoload.test.js
```

Expected:

```text
pass
```

---

## 10. Task 6: Generation Task Idempotency And Pending Persistence

**Files:**

- Modify: `modules/assistant/assistantGenerationTaskStore.js`
- Modify: `modules/assistant/assistantGenerationTaskStore.test.js`
- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantActionExecutor.test.js`

### Goal

Ensure low-risk text/image generation can queue safely, video remains gated, and remount/refresh cannot duplicate pending tasks.

- [ ] **Step 1: Add failing `queueOnce` store test**

Append to `modules/assistant/assistantGenerationTaskStore.test.js`:

```javascript
test("assistantGenerationTaskStore: queueOnce keeps pending task idempotent across store instances", () => {
  const storage = createMemoryStorage();
  const storeA = createAssistantGenerationTaskStore({ storage });
  const first = storeA.queueOnce({
    idempotencyKey: "conv-1:msg-1:action-1",
    nodeId: "image-1",
    nodeType: "ai-image",
    prompt: "make image",
  });
  const second = storeA.queueOnce({
    idempotencyKey: "conv-1:msg-1:action-1",
    nodeId: "image-1",
    nodeType: "ai-image",
    prompt: "make image",
  });
  const storeB = createAssistantGenerationTaskStore({ storage });

  assert.equal(first.id, second.id);
  assert.equal(storeB.list({ nodeId: "image-1" }).length, 1);
  assert.equal(storeB.list({ status: "queued" }).length, 1);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantGenerationTaskStore.test.js
```

Expected:

```text
FAIL
storeA.queueOnce is not a function
```

- [ ] **Step 3: Implement `queueOnce`**

In `sanitizeTask`, add:

```javascript
    idempotencyKey: raw.idempotencyKey ? String(raw.idempotencyKey) : "",
```

In returned store object add:

```javascript
    queueOnce(raw = {}) {
      const idempotencyKey = String(raw.idempotencyKey || "").trim();
      if (idempotencyKey) {
        const existing = tasks.find((task) => task.idempotencyKey === idempotencyKey);
        if (existing) {
          return cloneJson(existing);
        }
      }
      return this.queue(raw);
    },
```

- [ ] **Step 4: Add executor idempotency test**

Append to `modules/assistant/assistantActionExecutor.test.js`:

```javascript
test("assistantActionExecutor: queues safe image generation idempotently", async () => {
  const graphStore = createFakeGraphStore({
    nodes: [{ id: "image-1", nodeType: "ai-image", type: "ai-image" }],
  });
  const queued = [];
  const generationTaskRunner = async (task) => {
    queued.push(task);
    return { pending: true, taskId: task.idempotencyKey };
  };
  const actions = [
    {
      type: "queue_generation_task",
      actionId: "action-image-1",
      nodeId: "image-1",
      nodeType: "ai-image",
      prompt: "make image",
      conversationId: "conv-1",
      messageId: "msg-1",
    },
  ];

  const first = await executeAssistantActions({ actions, graphStore, generationTaskRunner });
  const second = await executeAssistantActions({ actions, graphStore, generationTaskRunner });

  assert.deepEqual(first.queuedGenerationNodeIds, ["image-1"]);
  assert.deepEqual(second.queuedGenerationNodeIds, ["image-1"]);
  assert.equal(queued[0].idempotencyKey, "conv-1:msg-1:action-image-1:image-1");
});
```

- [ ] **Step 5: Implement executor task metadata**

In generation action branch, build task:

```javascript
const actionId = action.actionId || action.id || `action-${index}`;
const conversationId = action.conversationId || action.metadata?.conversationId || "";
const messageId = action.messageId || action.metadata?.messageId || "";
const idempotencyKey = [conversationId, messageId, actionId, nodeId].filter(Boolean).join(":");
const task = {
  ...action,
  nodeId,
  nodeType,
  prompt: action.prompt || action.template || "",
  conversationId,
  messageId,
  idempotencyKey,
};
```

Pass `task` to `generationTaskRunner`.

- [ ] **Step 6: Run generation tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionExecutor.test.js
```

Expected:

```text
pass
```

---

## 11. Task 7: Conversation Restore Never Auto-Executes Pending Work

**Files:**

- Modify: `modules/assistant/assistantConversationStore.test.js`
- Modify: `modules/app/appAssistantPanel.context.test.js`
- Modify: `modules/app/appAssistantPanel.js` only if tests expose a bug

### Goal

R5 history restore must show pending actions/generation state without executing or restarting them.

- [ ] **Step 1: Add state restore test**

Append to `modules/app/appAssistantPanel.context.test.js`:

```javascript
test("createAssistantPanelState: restoring generation pending actions does not execute them", async () => {
  let executeCount = 0;
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { reply: "unused", actions: [] };
      },
    },
    executeActions: async () => {
      executeCount += 1;
      return { appliedCount: 1 };
    },
  });

  const restored = state.restoreConversation({
    id: "conv-history",
    messages: [{ role: "assistant", content: "pending" }],
    transactions: [
      {
        status: "proposed",
        actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" }],
      },
    ],
    generationTasks: [{ id: "gen-1", nodeId: "image-1", status: "queued" }],
  });

  assert.equal(restored, true);
  assert.equal(state.pendingActions.length, 1);
  assert.equal(executeCount, 0);
});
```

- [ ] **Step 2: Run test**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.context.test.js
```

Expected:

```text
pass
```

If it fails because restore auto-executes, fix `restoreConversation()` so it only sets state and never calls executor.

- [ ] **Step 3: Add conversation export generation task test**

Append to `modules/assistant/assistantConversationStore.test.js`:

```javascript
test("assistantConversationStore: exports generation tasks without secrets", () => {
  const storage = createMemoryStorage();
  const store = createAssistantConversationStore({ storage });
  const conversation = store.create({ title: "Generation pending" });
  store.appendGenerationTask?.(conversation.id, {
    id: "gen-1",
    nodeId: "image-1",
    status: "queued",
    apiKey: "must-not-leak",
  });

  const exported = store.export(conversation.id);
  const serialized = JSON.stringify(exported);

  assert.doesNotMatch(serialized, /must-not-leak|apiKey/);
  assert.match(serialized, /gen-1/);
});
```

- [ ] **Step 4: Implement `appendGenerationTask` if missing**

If `createAssistantConversationStore()` lacks `appendGenerationTask`, add a method that stores sanitized tasks under `generationTasks` and strips sensitive keys using the store's existing sanitize/export pattern.

- [ ] **Step 5: Run conversation tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantConversationStore.test.js modules\app\appAssistantPanel.context.test.js
```

Expected:

```text
pass
```

---

## 12. Task 8: Upgrade Live Runner To Multi-Step R5 Journey

**Files:**

- Modify: `tools/assistant_panel_live_screenshot_check.mjs`
- Modify: `tools/assistant_panel_live_screenshot_check.test.mjs`
- Use: `tools/assistant_live_artifact_utils.mjs`
- Use: `tools/assistant_live_fixture_runtime.mjs`

### Goal

Replace the one-shot live screenshot with a journey runner that records open panel, model dropdown, streaming, preview, apply, receipt, history restore, generation gate, artifacts, and scorecard.

- [ ] **Step 1: Add CLI parsing tests**

Append to `tools/assistant_panel_live_screenshot_check.test.mjs`:

```javascript
import { parseLiveRunnerArgs, buildR5JourneyScorePayload } from "./assistant_panel_live_screenshot_check.mjs";

test("assistant live screenshot check parses R5 fixture and artifact options", () => {
  const args = parseLiveRunnerArgs([
    "--url", "http://127.0.0.1:8777",
    "--out", "output/regression",
    "--fixture", "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "--r5-journey",
  ]);

  assert.equal(args.url, "http://127.0.0.1:8777");
  assert.equal(args.outputDir, "output/regression");
  assert.equal(args.fixturePath, "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json");
  assert.equal(args.r5Journey, true);
});

test("assistant live screenshot check builds score payload from journey checks", () => {
  const payload = buildR5JourneyScorePayload({
    panelOpen: true,
    modelDropdown: true,
    streaming: true,
    actionPreview: true,
    applyReceipt: true,
    historyRestore: true,
    generationGate: true,
    pendingState: true,
    secretSafety: true,
  });

  assert.equal(payload.r5Journey.panelOpen.pass, true);
  assert.equal(payload.r5Journey.secretSafety.pass, true);
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
FAIL
parseLiveRunnerArgs is not exported
```

- [ ] **Step 3: Export CLI helpers**

In `tools/assistant_panel_live_screenshot_check.mjs`, replace top-level const parsing with:

```javascript
export function parseLiveRunnerArgs(argv = process.argv.slice(2)) {
  const value = (name, fallback = "") => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    url: value("--url", "http://127.0.0.1:8777"),
    outputDir: value("--out", "output/regression"),
    browserExecutable: value("--browser-executable", process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || ""),
    fixturePath: value("--fixture", ""),
    r5Journey: argv.includes("--r5-journey"),
    headed: argv.includes("--headed"),
  };
}

export function buildR5JourneyScorePayload(checks = {}) {
  const check = (name, owner = "") => ({ pass: checks[name] === true, ...(owner ? { owner } : {}) });
  return {
    r5Journey: {
      panelOpen: check("panelOpen", "ui"),
      modelDropdown: check("modelDropdown", "model"),
      streaming: check("streaming", "stream"),
      actionPreview: check("actionPreview", "ui"),
      applyReceipt: check("applyReceipt", "executor"),
      historyRestore: check("historyRestore", "history"),
      generationGate: check("generationGate", "generation"),
      pendingState: check("pendingState", "generation"),
      secretSafety: check("secretSafety", "sanitizer"),
    },
  };
}
```

- [ ] **Step 4: Implement browser fixture injection**

When a fixture is provided, before clicking the launcher:

```javascript
await page.addInitScript({
  path: path.resolve("tools/assistant_live_fixture_runtime.mjs"),
});
```

If module injection by path is not supported in the current Playwright context, inject a small browser script that sets:

```javascript
window.__HUANYING_CANVAS_AGENT_LIVE_FIXTURE__ = fixtureJson;
```

Then in the page context, import or use existing autoload fixture hook:

```javascript
await page.evaluate(async (fixture) => {
  window.__HUANYING_CANVAS_AGENT_LIVE_FIXTURE__ = fixture;
}, fixture);
```

The implementation must avoid real network calls for fixture runs.

- [ ] **Step 5: Implement R5 journey steps**

Inside `main()` add a `runR5Journey(page, fixture, bundle)` function that:

1. opens panel and screenshots `01-open-panel.png`;
2. opens model dropdown and screenshots `02-model-dropdown.png`;
3. sends prompt and screenshots `03-streaming.png`;
4. waits for preview and screenshots `04-action-preview.png`;
5. applies actions and screenshots `05-applied-receipt.png`;
6. opens history and screenshots `06-history-restore.png`;
7. runs generation permission fixture or checks generation preview and screenshots `07-generation-pending.png`;
8. checks video strong confirmation and screenshots `08-video-strong-confirm.png`;
9. saves graph before/after and panel debug snapshots;
10. builds score payload and writes scorecard.

Use selectors already present:

```javascript
const launcher = page.locator("#fabBtn, .hy-canvas-agent-launcher").first();
const panel = page.locator(".hy-canvas-agent-panel");
const input = page.locator(".hy-canvas-agent-input, textarea").first();
const modelButton = page.locator("[data-canvas-agent-control='model'], .hy-canvas-agent-mode-pill").first();
const historyButton = page.locator("[data-canvas-agent-control='history'], .hy-canvas-agent-icon-btn[aria-label*='历史']").first();
```

- [ ] **Step 6: Write artifacts**

Use `writeSanitizedJson()` and `writeTextArtifact()` to write:

```text
trace.json
console.json
network.json
assistant-state.json
graph-before.json
graph-after.json
scorecard.json
fixture-candidate.json
summary.md
```

If a step fails, write `fixture-candidate.json` with:

```json
{
  "failedStep": "applyReceipt",
  "likelyOwner": "executor",
  "suggestedRegression": "modules/assistant/assistantActionExecutor.test.js",
  "lastFrame": {},
  "pendingActions": [],
  "graphBefore": {},
  "graphAfter": {}
}
```

- [ ] **Step 7: Run R5 live runner unit tests**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_live_artifact_utils.test.mjs tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

---

## 13. Task 9: Real Browser R5 Screenshot Journey

**Files:**

- Modify only if failures expose bugs:
  - `tools/assistant_panel_live_screenshot_check.mjs`
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.autoload.js`
  - `modules/assistant/*`

### Goal

Run the R5 journey on a real Huanying page and verify screenshots/artifacts are generated.

- [ ] **Step 1: Verify local Huanying server**

Run:

```powershell
try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8777' -UseBasicParsing -TimeoutSec 3; "STATUS=$($r.StatusCode)" } catch { "NO_SERVER: $($_.Exception.Message)" }
```

Expected:

```text
STATUS=200
```

If no server is running, start it in a separate terminal:

```powershell
python server.py --host=127.0.0.1 --port=8777
```

- [ ] **Step 2: Run R5 basic live journey**

Run:

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-basic-create-connect-layout-focus.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```json
{
  "success": true,
  "artifactDir": "...",
  "scorecardPath": "...\\scorecard.json"
}
```

- [ ] **Step 3: Run generation permission live journey**

Run:

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-generation-permission-gate.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```text
success=true
video strong confirmation visible
```

- [ ] **Step 4: Run invalid delta action live journey**

Run:

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-invalid-delta-actions-do-not-execute.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```text
success=true
graph-after nodeCount equals graph-before nodeCount
```

- [ ] **Step 5: Inspect artifacts**

For each run, verify these files exist:

```text
screenshots\01-open-panel.png
screenshots\02-model-dropdown.png
screenshots\03-streaming.png
screenshots\04-action-preview.png
screenshots\05-applied-receipt.png
screenshots\06-history-restore.png
trace.json
console.json
network.json
assistant-state.json
graph-before.json
graph-after.json
scorecard.json
summary.md
```

---

## 14. Task 10: Secret Safety And Real-Key Opt-In Policy

**Files:**

- Modify: `tools/assistant_live_artifact_utils.test.mjs`
- Modify: `tools/assistant_panel_live_screenshot_check.mjs`
- Modify: `docs/canvas_agent_p0_p1_implementation_log.md`

### Goal

Guarantee that R5 docs/tests/artifacts never contain real keys. Real model smoke is allowed only through runtime config and explicit opt-in.

- [ ] **Step 1: Add no-key policy to live runner**

In CLI helper, support:

```text
--real-api-smoke
```

Default behavior:

- use fixture/mock only;
- do not read or print real API keys;
- do not require network.

If `--real-api-smoke` is present:

- read model config from Huanying unified API config or environment;
- do not print env values;
- sanitize all artifacts;
- require `--fixture` to be absent or explicitly marked as smoke fixture.

- [ ] **Step 2: Add secret scan test for artifacts**

Add to `tools/assistant_live_artifact_utils.test.mjs`:

```javascript
test("assistant live sanitizer removes real-key-shaped strings from nested artifacts", () => {
  const keyPrefix = "s" + "k-";
  const sanitized = sanitizeArtifactValue({
    logs: [`using ${keyPrefix}abc123456789`, "safe"],
    network: [{ requestHeaders: { authorization: "Bearer private-token" } }],
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, new RegExp(`${keyPrefix}abc123456789|private-token`));
});
```

- [ ] **Step 3: Run artifact tests**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_live_artifact_utils.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 4: Run scoped secret scan**

Run:

```powershell
$paths = @('docs\canvas_agent_r*.md','docs\canvas_agent_p0_p1_implementation_log.md','docs\assistant_live_cases\*.json','modules\assistant\*.js','modules\assistant\*.test.js','modules\app\appAssistantPanel*.js','modules\app\appAssistantPanel*.test.js','api\canvasAgentApi*.js','services\canvas_agent*.py','services\pi_bridge_service.py','*canvas_agent*_test.py','pi_bridge_service_test.py','tools\assistant*.mjs','tools\assistant*.test.mjs')
$matches = Select-String -Path $paths -Pattern 's[k]-' -ErrorAction SilentlyContinue
if ($matches) { $matches | ForEach-Object { "MATCH $($_.Path):$($_.LineNumber)" }; "TOTAL $($matches.Count)" } else { 'TOTAL 0' }
```

Expected:

```text
TOTAL 0
```

---

## 15. Task 11: R5 Regression Convenience Runner

**Files:**

- Create: `tools/run_canvas_agent_r5_regression.ps1`
- Optional modify: `tools/run_claw_assistant_offline_regression.py`

### Goal

Provide one command that runs frontend/backend/live/secret R5 gates. This is a convenience script; individual commands remain the source of truth.

- [ ] **Step 1: Create PowerShell runner**

Create `tools/run_canvas_agent_r5_regression.ps1`:

```powershell
param(
  [string]$Url = "http://127.0.0.1:8777",
  [string]$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe",
  [string]$Out = "output\regression\assistant-live"
)

$ErrorActionPreference = "Stop"

Write-Host "[R5] frontend regression"
D:\Aic\node.exe --test `
  modules\assistant\assistantProtocol.test.js `
  modules\assistant\assistantStreamingClient.test.js `
  modules\assistant\assistantActionContract.test.js `
  modules\assistant\assistantConfirmationPolicy.test.js `
  modules\assistant\assistantConversationStore.test.js `
  modules\assistant\assistantAttachmentStore.test.js `
  modules\assistant\assistantModelRegistry.test.js `
  modules\assistant\assistantGenerationTaskStore.test.js `
  modules\assistant\assistantActionPreviewModel.test.js `
  modules\assistant\assistantActionExecutor.test.js `
  modules\assistant\assistantActionPreview.test.js `
  modules\assistant\assistantContextBuilder.test.js `
  modules\app\appAssistantPanel.streaming.test.js `
  modules\app\appAssistantPanel.context.test.js `
  modules\app\appAssistantPanel.p1Ui.test.js `
  modules\app\appAssistantPanel.autoload.test.js `
  modules\app\appAssistantPanel.test.js `
  api\canvasAgentApi.streaming.test.js `
  api\canvasAgentApi.test.js `
  tools\assistant_live_artifact_utils.test.mjs `
  tools\assistant_panel_live_screenshot_check.test.mjs

Write-Host "[R5] backend regression"
python -m unittest `
  canvas_agent_action_schema_envelope_test `
  canvas_agent_conversation_service_test `
  canvas_agent_action_schema_test `
  canvas_agent_route_service_test `
  pi_bridge_service_test `
  canvas_agent_context_service_test `
  http_route_dispatcher_test `
  assistant_live_run_scorecard_test

Write-Host "[R5] live fixture journeys"
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url $Url --out $Out --fixture docs\assistant_live_cases\r5-basic-create-connect-layout-focus.json --r5-journey --browser-executable $Chrome
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url $Url --out $Out --fixture docs\assistant_live_cases\r5-generation-permission-gate.json --r5-journey --browser-executable $Chrome
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url $Url --out $Out --fixture docs\assistant_live_cases\r5-invalid-delta-actions-do-not-execute.json --r5-journey --browser-executable $Chrome

Write-Host "[R5] scoped secret scan"
$paths = @('docs\canvas_agent_r*.md','docs\canvas_agent_p0_p1_implementation_log.md','docs\assistant_live_cases\*.json','modules\assistant\*.js','modules\assistant\*.test.js','modules\app\appAssistantPanel*.js','modules\app\appAssistantPanel*.test.js','api\canvasAgentApi*.js','services\canvas_agent*.py','services\pi_bridge_service.py','*canvas_agent*_test.py','pi_bridge_service_test.py','tools\assistant*.mjs','tools\assistant*.test.mjs')
$matches = Select-String -Path $paths -Pattern 's[k]-' -ErrorAction SilentlyContinue
if ($matches) {
  $matches | ForEach-Object { "MATCH $($_.Path):$($_.LineNumber)" }
  throw "Secret-prefix scan failed."
}
"TOTAL 0"
```

- [ ] **Step 2: Run script syntax check**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\run_canvas_agent_r5_regression.ps1 -Url http://127.0.0.1:8777
```

Expected:

```text
[R5] frontend regression
[R5] backend regression
[R5] live fixture journeys
[R5] scoped secret scan
TOTAL 0
```

---

## 16. Task 12: Full Verification And Implementation Log

**Files:**

- Modify: `docs/canvas_agent_p0_p1_implementation_log.md`

### Goal

Run final verification and record evidence.

- [ ] **Step 1: Run full frontend regression**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.streaming.test.js api\canvasAgentApi.test.js tools\assistant_live_artifact_utils.test.mjs tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 2: Run full backend regression**

Run:

```powershell
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_context_service_test http_route_dispatcher_test assistant_live_run_scorecard_test
```

Expected:

```text
OK
```

- [ ] **Step 3: Run R5 live journeys**

Run:

```powershell
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-basic-create-connect-layout-focus.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-generation-permission-gate.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression\assistant-live --fixture docs\assistant_live_cases\r5-invalid-delta-actions-do-not-execute.json --r5-journey --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Expected:

```text
success=true for all three runs
```

- [ ] **Step 4: Run secret scan**

Run the scoped scan from Task 10.

Expected:

```text
TOTAL 0
```

- [ ] **Step 5: Append implementation evidence**

Append to `docs/canvas_agent_p0_p1_implementation_log.md`:

```markdown
---

## R5 Live Calibration Evidence - 2026-06-03

- Frontend regression: pass, command recorded in `docs/canvas_agent_r5_development_plan.md`.
- Backend regression: pass, command recorded in `docs/canvas_agent_r5_development_plan.md`.
- R5 basic live journey: pass, artifact dir recorded below.
- R5 generation permission journey: pass, artifact dir recorded below.
- R5 invalid delta-actions journey: pass, artifact dir recorded below.
- Secret scan: `TOTAL 0`.
- Completed scope: deterministic fixture runner, artifact sanitizer, R5 scorecard, generation permission gate, pending-state persistence, failure-to-regression bundle.
- Next scope: R6 Canvas Doctor scorecard and R7 Auto Layout live diff.
```

Replace the artifact lines with actual paths from the final run.

---

## 17. Final Acceptance Checklist

R5 is complete only if all items are true:

- [ ] `tools/assistant_panel_live_screenshot_check.mjs` can run a deterministic R5 journey with no real API.
- [ ] Basic create/connect/layout/focus live fixture passes and writes screenshots/artifacts.
- [ ] Generation permission fixture passes: text/image queue and video strong confirmation is visible.
- [ ] Invalid delta-actions fixture passes: delta actions never mutate graph.
- [ ] History restore shows pending actions and never auto-executes them.
- [ ] Generation pending state persists across store instances and does not duplicate tasks.
- [ ] Scorecard includes R5 journey checks and failure owner/suggested regression.
- [ ] All artifacts are sanitized.
- [ ] Scoped `s[k]-` scan returns `TOTAL 0`.
- [ ] Full frontend and backend regressions pass.
- [ ] Implementation evidence is appended to `docs/canvas_agent_p0_p1_implementation_log.md`.

---

## 18. Notes For Real API Smoke

Default R5 development must use deterministic fixtures. If a real model smoke is explicitly requested:

- Use Huanying unified API Key configuration or runtime environment injection only.
- Do not put the real key in command history, docs, fixtures, tests, screenshots, artifacts, or logs.
- Use model name `gpt-5.5` and endpoint only as runtime configuration values.
- Use a prompt that cannot trigger real video generation.
- Run secret scan immediately after the smoke.

No implementation step in this plan requires writing a real key.
