# Huanying Canvas Agent R1-R4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the R1-R4 production loop for Huanying Canvas Agent: streaming chat, validated canvas action execution, persistent conversations, and unified API key/model configuration.

**Architecture:** Keep Assistant Core decoupled from Huanying internals. The Agent/Pi sidecar only proposes `reply/actions/warnings/requiresConfirmation`; Huanying validates actions, previews risk, confirms, executes through a graphStore adapter, records receipts, and persists the whole conversation as an auditable creation log.

**Tech Stack:** Browser ES modules, Node test runner via `D:\Aic\node.exe --test`, Python `unittest`, Huanying graphStore/workspaceStore adapters, Python route services, Pi JSONL sidecar, NDJSON streaming.

---

## 0. Source Of Truth

Product requirement document:

- `docs/canvas_agent_r1_r4_product_requirements.md`

Implementation must preserve these rules:

- Do not edit obfuscated/minified `main.js`.
- Do not let Pi/Agent execute shell, write files, or mutate Huanying directly.
- Only `message.done` may carry trusted actions; `message.delta` is display-only.
- Every action batch must pass Huanying `CanvasAgentActionSchema` before execution.
- High-risk actions require strong confirmation.
- API keys must never appear in UI, logs, status payloads, screenshots, diagnostics, exports, or test fixtures.
- Assistant modules should stay decoupled from Huanying internals through adapters.

---

## 1. Current Implementation Map

### Existing Modules To Reuse

| Area | File | Current role |
|---|---|---|
| Panel UI | `modules/app/appAssistantPanel.js` | Assistant launcher/panel, state, history drawer, model selector, attachment entry, preview/receipt UI |
| Panel autoload | `modules/app/appAssistantPanel.autoload.js` | Mounts assistant into Huanying runtime and wires API/graph/workspace/model config |
| API client | `api/canvasAgentApi.js` | Calls `/api/v2/canvas-agent/*`, including chat stream and action validation |
| Protocol | `modules/assistant/assistantProtocol.js` | Stream/action protocol normalization baseline |
| Stream client | `modules/assistant/assistantStreamingClient.js` | Browser-side stream handling baseline |
| Action contract | `modules/assistant/assistantActionContract.js` | Action envelope/contract baseline |
| Action preview | `modules/assistant/assistantActionPreview.js` | Human-readable action summary and receipt text |
| Preview model | `modules/assistant/assistantActionPreviewModel.js` | Risk aware action preview structure |
| Confirmation | `modules/assistant/assistantConfirmationPolicy.js` | Risk/strong confirmation policy baseline |
| Executor | `modules/assistant/assistantActionExecutor.js` | Applies validated actions through graphStore |
| Context | `modules/assistant/assistantContextBuilder.js` | Builds canvas/workspace/selection context |
| Conversation | `modules/assistant/assistantConversationStore.js` | Frontend conversation store baseline |
| Attachment | `modules/assistant/assistantAttachmentStore.js` | Attachment/reference chip baseline |
| Model registry | `modules/assistant/assistantModelRegistry.js` | Assistant model options from API config baseline |
| Backend route | `services/canvas_agent_route_service.py` | Chat, stream, validate, context, status, conversation route entry |
| Backend bridge | `services/pi_bridge_service.py` | Pi JSONL bridge, response sanitization, schema validation |
| Backend schema | `services/canvas_agent_action_schema.py` | Canvas agent action validation wrapper |
| Backend conversations | `services/canvas_agent_conversation_service.py` | Conversation persistence baseline |
| HTTP dispatcher | `services/http_route_dispatcher.py` | Delegates canvas-agent route methods |
| Server wiring | `server.py` | Instantiates and wires services |
| Live screenshot | `tools/assistant_panel_live_screenshot_check.mjs` | Real browser regression flow |

### Main Test Commands

Run focused frontend tests:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantModelRegistry.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js api\canvasAgentApi.test.js
```

Expected result:

```text
pass
```

Run focused backend tests:

```powershell
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_context_service_test http_route_dispatcher_test
```

Expected result:

```text
OK
```

Run live assistant screenshot regression:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected result:

```text
pass
```

---

## 2. File Structure Plan

### Files To Modify

| File | Change responsibility |
|---|---|
| `api/canvasAgentApi.js` | Harden streaming request, NDJSON parsing, abort, final-frame handling, conversation/model payloads |
| `api/canvasAgentApi.test.js` | Add stream, abort, invalid frame, conversation/model tests |
| `modules/assistant/assistantProtocol.js` | Normalize stream frames, action batches, errors, metadata, final-frame trust contract |
| `modules/assistant/assistantProtocol.test.js` | Protocol fixtures for start/delta/warning/done/error |
| `modules/assistant/assistantStreamingClient.js` | Browser stream state machine and abort/retry helpers |
| `modules/assistant/assistantStreamingClient.test.js` | State-machine tests for stream success, abort, malformed frames |
| `modules/assistant/assistantActionContract.js` | Enforce action envelope metadata/risk and forbidden actions |
| `modules/assistant/assistantActionContract.test.js` | Contract tests for allowed/forbidden/high-risk actions |
| `modules/assistant/assistantActionPreviewModel.js` | Group actions by user-facing impact and strong confirmation state |
| `modules/assistant/assistantActionPreviewModel.test.js` | Preview grouping and risk tests |
| `modules/assistant/assistantConfirmationPolicy.js` | Define strong-confirmation policy for video/high-risk/bulk actions |
| `modules/assistant/assistantConfirmationPolicy.test.js` | Confirmation policy tests |
| `modules/assistant/assistantActionExecutor.js` | Add/verify P0 actions: create, connect, update, layout, focus, safe generation queue |
| `modules/assistant/assistantActionExecutor.test.js` | Executor tests with fake graphStore and generation runner |
| `modules/assistant/assistantConversationStore.js` | Add remote-sync adapter semantics, receipts, pending action persistence, export sanitization |
| `modules/assistant/assistantConversationStore.test.js` | CRUD/search/restore/delete/export/no-auto-execute tests |
| `modules/assistant/assistantModelRegistry.js` | Build configured/disabled model list from unified API config snapshot |
| `modules/assistant/assistantModelRegistry.test.js` | Configured/default/disabled/secret-redaction tests |
| `modules/assistant/assistantContextBuilder.js` | Include selected model, assistantIntent, pending action summary, attachments metadata |
| `modules/assistant/assistantContextBuilder.test.js` | Context tests for model/intent/attachments/selection limits |
| `modules/app/appAssistantPanel.js` | Wire R1-R4 UI states: streaming, stop/retry, preview/apply, history sync, model guard |
| `modules/app/appAssistantPanel.streaming.test.js` | Streaming panel state tests |
| `modules/app/appAssistantPanel.p1Ui.test.js` | UI button/preview/history/model tests |
| `modules/app/appAssistantPanel.autoload.js` | Use unified API key/model config and graphStore adapter without leaking secrets |
| `modules/app/appAssistantPanel.autoload.test.js` | Autoload/model provider tests |
| `services/canvas_agent_route_service.py` | Harden stream/status/conversation/action-validate routes and model/provider resolution |
| `canvas_agent_route_service_test.py` | Route tests for stream, status redaction, conversations, validation |
| `services/pi_bridge_service.py` | Ensure JSONL request model/config injection, response sanitation, timeout, final actions validation |
| `pi_bridge_service_test.py` | Bridge tests for model, no key leak, invalid/forbidden actions |
| `services/canvas_agent_action_schema.py` | Expand or wrap schema coverage for P0 actions and risk metadata |
| `canvas_agent_action_schema_test.py` | Schema tests for create/connect/update/layout/focus/generation |
| `services/canvas_agent_conversation_service.py` | Persist conversations/messages/actions/receipts, search, export redaction |
| `canvas_agent_conversation_service_test.py` | Persistence/search/export/restore tests |
| `services/http_route_dispatcher.py` | Confirm GET/POST/PATCH/DELETE conversation dispatch and stream route dispatch |
| `http_route_dispatcher_test.py` | Dispatcher route tests |
| `server.py` | Ensure services are wired once and config getter is shared |
| `tools/assistant_panel_live_screenshot_check.mjs` | Add screenshot flows for R1-R4 acceptance |
| `tools/assistant_panel_live_screenshot_check.test.mjs` | Assert live flow route/runtime errors fail correctly |
| `docs/canvas_agent_p0_p1_implementation_log.md` | Append implementation evidence after each sprint |

### Optional Files To Create If Current Files Grow Too Large

Create only if implementation makes `appAssistantPanel.js` harder to maintain:

| File | Responsibility |
|---|---|
| `modules/app/appAssistantPanelStateMachine.js` | Extract pure streaming/applying/history state transitions |
| `modules/app/appAssistantPanelStateMachine.test.js` | Test state transitions without DOM |
| `modules/assistant/assistantConversationRemoteStore.js` | Backend-backed conversation adapter if local store becomes mixed with remote API concerns |
| `modules/assistant/assistantGraphStoreAdapter.js` | Pure adapter interface if autoload graph adapter needs reuse outside app layer |

---

## 3. Task 0: Freeze Baseline And Regression Gate

**Files:**

- Read: `docs/canvas_agent_r1_r4_product_requirements.md`
- Read: `docs/canvas_agent_p0_p1_implementation_log.md`
- Modify after run: `docs/canvas_agent_p0_p1_implementation_log.md`

- [ ] **Step 1: Confirm CodeGraph index health**

Run:

```powershell
codegraph status
```

Expected:

```text
Files indexed
```

- [ ] **Step 2: Run current focused frontend baseline**

Run from project root:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantModelRegistry.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js api\canvasAgentApi.test.js
```

Expected:

```text
pass
```

- [ ] **Step 3: Run current focused backend baseline**

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
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 5: Append baseline evidence**

Append to `docs/canvas_agent_p0_p1_implementation_log.md`:

```markdown
## R1-R4 Baseline Evidence - 2026-06-03

- Frontend focused tests: pass/fail, command recorded above.
- Backend focused tests: pass/fail, command recorded above.
- Live screenshot regression: pass/fail, screenshot path recorded when available.
- Known risks: git status may be unreliable in this environment; do not rely on git reset/checkout.
```

---

## 4. Task 1: R1 Protocol And Streaming Client

**Files:**

- Modify: `modules/assistant/assistantProtocol.js`
- Modify: `modules/assistant/assistantProtocol.test.js`
- Modify: `modules/assistant/assistantStreamingClient.js`
- Modify: `modules/assistant/assistantStreamingClient.test.js`
- Modify: `api/canvasAgentApi.js`
- Modify: `api/canvasAgentApi.test.js`

### Goal

Create a stable browser-side stream contract: start/delta/warning/done/error frames are normalized, malformed frames fail safely, abort works, and actions are only accepted from `message.done`.

- [ ] **Step 1: Add protocol tests for legal frames**

Use frames:

```javascript
const frames = [
  { type: "message.start", conversationId: "conv_1", messageId: "msg_1", traceId: "trace_1" },
  { type: "message.delta", delta: "hello", conversationId: "conv_1", messageId: "msg_1", traceId: "trace_1" },
  { type: "warning", message: "selection is empty" },
  {
    type: "message.done",
    reply: "done",
    actions: [{ type: "focus_nodes", nodeIds: ["node_1"] }],
    warnings: [],
    requiresConfirmation: false,
    conversationId: "conv_1",
    messageId: "msg_1",
    traceId: "trace_1",
  },
];
```

Expected assertions:

```javascript
assert.equal(normalized[0].type, "message.start");
assert.equal(normalized[1].delta, "hello");
assert.equal(normalized[2].message, "selection is empty");
assert.equal(normalized[3].actions.length, 1);
```

- [ ] **Step 2: Add protocol tests that reject actions in delta**

Test fixture:

```javascript
const frame = {
  type: "message.delta",
  delta: "creating node",
  actions: [{ type: "create_node", nodeType: "note" }],
};
```

Expected:

```javascript
assert.deepEqual(normalizeAssistantStreamFrame(frame).actions, []);
```

- [ ] **Step 3: Implement or harden frame normalization**

Ensure `assistantProtocol.js` exposes stable helpers with these semantics:

```javascript
export function normalizeAssistantStreamFrame(frame = {}) {
  if (!frame || typeof frame !== "object") {
    return { type: "error", message: "Invalid stream frame." };
  }
  if (frame.type === "message.start") {
    return {
      type: "message.start",
      conversationId: safeString(frame.conversationId),
      messageId: safeString(frame.messageId),
      traceId: safeString(frame.traceId),
    };
  }
  if (frame.type === "message.delta") {
    return {
      type: "message.delta",
      delta: safeString(frame.delta),
      actions: [],
      conversationId: safeString(frame.conversationId),
      messageId: safeString(frame.messageId),
      traceId: safeString(frame.traceId),
    };
  }
  if (frame.type === "warning") {
    return { type: "warning", message: safeString(frame.message) };
  }
  if (frame.type === "message.done") {
    return {
      type: "message.done",
      reply: safeString(frame.reply),
      actions: Array.isArray(frame.actions) ? frame.actions : [],
      warnings: Array.isArray(frame.warnings) ? frame.warnings.filter((item) => typeof item === "string") : [],
      requiresConfirmation: frame.requiresConfirmation === true,
      conversationId: safeString(frame.conversationId),
      messageId: safeString(frame.messageId),
      traceId: safeString(frame.traceId),
    };
  }
  return { type: "error", message: `Unsupported stream frame: ${safeString(frame.type)}` };
}
```

If `safeString` already exists, reuse it. If not, add a small local helper.

- [ ] **Step 4: Add API client tests for NDJSON parsing**

Mock `fetchImpl` with a `ReadableStream` or equivalent body that emits:

```text
{"type":"message.start","conversationId":"conv_1"}
{"type":"message.delta","delta":"hello"}
{"type":"message.done","reply":"hello","actions":[]}
```

Expected:

```javascript
assert.deepEqual(events.map((event) => event.type), ["message.start", "message.delta", "message.done"]);
assert.equal(final.reply, "hello");
```

- [ ] **Step 5: Harden `createCanvasAgentApi().sendMessageStream`**

The API method must:

- post to `/api/v2/canvas-agent/chat/stream`;
- send `message`, `context`, `conversationId`, `assistantIntent`, `model`, `mode: "actions"`;
- accept an `AbortSignal`;
- call `handlers.onFrame(normalizedFrame)` for each frame;
- call `handlers.onDone(finalFrame)` once;
- convert network errors into an API error object;
- never attach API keys to payloads.

Expected payload shape:

```javascript
{
  message: "create node",
  conversationId: "conv_1",
  mode: "actions",
  model: { provider: "pi_canvas_agent", modelId: "agent-high-quality" },
  assistantIntent: { id: "canvas_create", title: "创建画布节点", source: "quick_intent" },
  context: { canvas: {}, selection: {}, attachments: [] },
}
```

- [ ] **Step 6: Add streaming client abort test**

Expected behavior:

```javascript
const controller = new AbortController();
controller.abort();
await assert.rejects(
  () => client.send({ message: "x", signal: controller.signal }),
  /aborted|Abort/i
);
```

- [ ] **Step 7: Run R1 protocol/API tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js api\canvasAgentApi.test.js
```

Expected:

```text
pass
```

---

## 5. Task 2: R1 Panel Streaming State Machine

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.streaming.test.js`
- Modify: `modules/app/appAssistantPanel.test.js`
- Optional create: `modules/app/appAssistantPanelStateMachine.js`
- Optional test: `modules/app/appAssistantPanelStateMachine.test.js`

### Goal

Wire the stream client into the assistant panel so the user sees immediate state feedback, incremental text, stop, retry, final actions, and safe errors.

- [ ] **Step 1: Add state test for send lifecycle**

Test sequence:

```javascript
const api = createFakeStreamingApi([
  { type: "message.start", conversationId: "conv_1", messageId: "msg_1", traceId: "trace_1" },
  { type: "message.delta", delta: "我会创建节点。" },
  { type: "message.done", reply: "已准备动作。", actions: [{ type: "focus_nodes", nodeIds: ["node_1"] }], warnings: [] },
]);
const state = createAssistantPanelState({ api, graphStore: fakeGraphStore, buildContext: () => ({ canvas: {} }) });
await state.sendMessage("创建节点");
assert.equal(state.status, "done_pending_actions");
assert.equal(state.pendingActions.length, 1);
assert.match(state.lastResponse.reply, /已准备动作/);
```

- [ ] **Step 2: Add state test for stop**

Expected:

```javascript
state.sendMessage("创建节点");
state.stopStreaming();
assert.equal(state.status, "cancelled");
assert.deepEqual(state.pendingActions, []);
```

- [ ] **Step 3: Add state test for retry**

Expected:

```javascript
await state.sendMessage("创建节点");
assert.equal(state.status, "error");
await state.retryLastMessage();
assert.equal(state.status, "done_no_actions");
```

- [ ] **Step 4: Implement panel status transitions**

The panel state should support:

```javascript
const STREAM_STATUSES = {
  IDLE: "idle",
  PREPARING: "preparing",
  STREAMING: "streaming",
  DONE_NO_ACTIONS: "done_no_actions",
  DONE_PENDING_ACTIONS: "done_pending_actions",
  APPLYING: "applying",
  ERROR: "error",
  CANCELLED: "cancelled",
};
```

Keep this internal unless existing tests require exports.

- [ ] **Step 5: Wire UI controls**

Required behavior:

- `Enter` sends when input is non-empty.
- `Shift+Enter` inserts a newline.
- Send button becomes stop button while streaming.
- Stop calls abort and never applies actions.
- Retry resends the last user message with fresh context.
- Final actions show preview; no actions show normal assistant reply.

- [ ] **Step 6: Make errors user-readable**

Error card content must include:

```text
请求失败
重试
复制诊断
```

Diagnostics should include trace/provider/model when available and never include keys.

- [ ] **Step 7: Run panel stream tests**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.test.js
```

Expected:

```text
pass
```

---

## 6. Task 3: R1 Backend Stream Route Hardening

**Files:**

- Modify: `services/canvas_agent_route_service.py`
- Modify: `services/pi_bridge_service.py`
- Modify: `canvas_agent_route_service_test.py`
- Modify: `pi_bridge_service_test.py`

### Goal

Backend stream route returns stable NDJSON frames, handles invalid input, applies provider/model config, and sanitizes bridge errors.

- [ ] **Step 1: Add route test for invalid JSON**

Expected:

```python
response = service.handle_post(None, "/api/v2/canvas-agent/chat/stream", b"{")
self.assertEqual(response["kind"], "json_err")
self.assertEqual(response["code"], 400)
```

- [ ] **Step 2: Add route test for blank message**

Expected:

```python
response = service.handle_post(None, "/api/v2/canvas-agent/chat/stream", b'{"message":""}')
self.assertEqual(response["kind"], "json_err")
self.assertEqual(response["code"], 400)
```

- [ ] **Step 3: Add route test for legal NDJSON frames**

Fake bridge response:

```python
{
    "success": True,
    "reply": "已准备动作。",
    "actions": [{"type": "focus_nodes", "nodeIds": ["node_1"]}],
    "warnings": ["selection is empty"],
    "requiresConfirmation": False,
    "conversationId": "conv_1",
    "messageId": "msg_1",
    "traceId": "trace_1",
}
```

Expected decoded frame types:

```python
self.assertEqual([frame["type"] for frame in frames], ["message.start", "message.delta", "warning", "message.done"])
self.assertEqual(frames[-1]["actions"][0]["type"], "focus_nodes")
```

- [ ] **Step 4: Harden `_handle_chat_stream`**

Implementation requirements:

- parse JSON object only;
- require non-empty `message`;
- pass merged `assistantIntent` into context;
- pass `conversationId` and `mode: actions` into bridge;
- if bridge returns non-dict, emit safe failed final frame;
- encode NDJSON as `application/x-ndjson; charset=utf-8`;
- include `conversationId`, `messageId`, `traceId` on start/delta/done when available;
- never include provider key or raw exception secrets.

- [ ] **Step 5: Add bridge test for model/config request**

Expected JSONL request contains:

```python
self.assertEqual(request["message"], "hello")
self.assertEqual(request["conversationId"], "conv_1")
self.assertEqual(request["mode"], "actions")
self.assertIn("context", request)
```

It must not contain:

```python
self.assertNotIn("apiKey", request)
self.assertNotIn("Authorization", json.dumps(request))
```

- [ ] **Step 6: Run backend stream tests**

Run:

```powershell
python -m unittest canvas_agent_route_service_test pi_bridge_service_test
```

Expected:

```text
OK
```

---

## 7. Task 4: R2 Action Contract And Schema

**Files:**

- Modify: `modules/assistant/assistantActionContract.js`
- Modify: `modules/assistant/assistantActionContract.test.js`
- Modify: `modules/assistant/assistantConfirmationPolicy.js`
- Modify: `modules/assistant/assistantConfirmationPolicy.test.js`
- Modify: `services/canvas_agent_action_schema.py`
- Modify: `canvas_agent_action_schema_test.py`
- Modify: `canvas_agent_action_schema_envelope_test.py`

### Goal

Make the P0 action contract explicit, safe, and versionable before UI/executor changes rely on it.

- [ ] **Step 1: Add contract test for P0 allowed actions**

Allowed examples:

```javascript
const actions = [
  { type: "create_node", id: "a1", nodeType: "note", position: { x: 100, y: 100 }, data: { text: "brief" } },
  { type: "connect_nodes", id: "a2", from: "node_a", to: "node_b" },
  { type: "update_node", id: "a3", nodeId: "node_a", data: { prompt: "new prompt" } },
  { type: "layout_nodes", id: "a4", nodeIds: ["node_a", "node_b"], layout: "horizontal" },
  { type: "focus_nodes", id: "a5", nodeIds: ["node_a"] },
];
```

Expected:

```javascript
const enveloped = envelopeAssistantActions(actions, { conversationId: "conv_1", messageId: "msg_1", traceId: "trace_1" });
assert.equal(enveloped.length, actions.length);
assert.equal(enveloped[0].metadata.conversationId, "conv_1");
```

- [ ] **Step 2: Add contract test for forbidden actions**

Forbidden examples:

```javascript
const actions = [
  { type: "run_shell", command: "whoami" },
  { type: "write_file", path: "x.txt", content: "x" },
];
```

Expected:

```javascript
assert.equal(isForbiddenAssistantAction(actions[0]), true);
assert.equal(isForbiddenAssistantAction(actions[1]), true);
```

- [ ] **Step 3: Add backend schema tests for forbidden actions**

Expected:

```python
result = schema.validate_actions([{"type": "run_shell", "command": "whoami"}], context={})
self.assertFalse(result["valid"])
self.assertIn("forbidden", " ".join(result.get("errors", [])).lower())
```

- [ ] **Step 4: Add backend schema tests for video high risk**

Expected:

```python
result = schema.validate_actions([
    {"type": "start_generation", "nodeId": "video_1", "nodeType": "ai-video", "prompt": "make video"}
], context={})
self.assertTrue(result["valid"])
self.assertTrue(result.get("requiresConfirmation"))
```

- [ ] **Step 5: Implement risk policy**

Required policy:

```javascript
export function getAssistantActionRisk(action = {}) {
  if (["run_shell", "write_file", "delete_file"].includes(action.type)) return "forbidden";
  if (action.type === "start_generation" && (action.nodeType === "ai-video" || action.mediaType === "video")) return "high";
  if (action.type === "delete_node" || action.type === "overwrite_node") return "high";
  if (action.type === "update_node" || action.type === "start_generation") return "medium";
  if (action.type === "layout_nodes" && Array.isArray(action.nodeIds) && action.nodeIds.length > 20) return "medium";
  return "low";
}
```

If equivalent helpers already exist, adjust them to match this behavior.

- [ ] **Step 6: Run action contract/schema tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js
python -m unittest canvas_agent_action_schema_test canvas_agent_action_schema_envelope_test
```

Expected:

```text
pass
OK
```

---

## 8. Task 5: R2 Preview Card And Confirmation UI

**Files:**

- Modify: `modules/assistant/assistantActionPreviewModel.js`
- Modify: `modules/assistant/assistantActionPreviewModel.test.js`
- Modify: `modules/assistant/assistantActionPreview.js`
- Modify: `modules/assistant/assistantActionPreview.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

### Goal

Give users a clear, grouped, risk aware preview before any canvas mutation.

- [ ] **Step 1: Add preview grouping test**

Input actions:

```javascript
const actions = [
  { type: "create_node", nodeType: "ai-image", name: "Image" },
  { type: "connect_nodes", from: "prompt", to: "image" },
  { type: "layout_nodes", nodeIds: ["prompt", "image"], layout: "horizontal" },
  { type: "focus_nodes", nodeIds: ["image"] },
];
```

Expected groups:

```javascript
assert.deepEqual(model.groups.map((group) => group.id), ["create", "connect", "layout", "focus"]);
assert.equal(model.totalActionCount, 4);
assert.equal(model.requiresStrongConfirmation, false);
```

- [ ] **Step 2: Add strong confirmation preview test**

Input:

```javascript
const actions = [{ type: "start_generation", nodeId: "video_1", nodeType: "ai-video", prompt: "video" }];
```

Expected:

```javascript
assert.equal(model.riskLevel, "high");
assert.equal(model.requiresStrongConfirmation, true);
```

- [ ] **Step 3: Implement preview model fields**

The model must expose:

```javascript
{
  totalActionCount: 4,
  riskLevel: "low",
  requiresStrongConfirmation: false,
  groups: [
    { id: "create", title: "创建节点", count: 1, items: [] },
    { id: "connect", title: "连接节点", count: 1, items: [] },
    { id: "layout", title: "整理布局", count: 1, items: [] },
    { id: "focus", title: "聚焦节点", count: 1, items: [] }
  ],
  warnings: []
}
```

- [ ] **Step 4: Wire preview card UI**

Required visible elements:

```text
准备应用 N 个画布动作
创建节点
连接节点
整理布局
聚焦节点
查看 JSON
取消
应用到画布
```

For high-risk batches, visible elements additionally include:

```text
需要强确认
我确认执行高风险动作
```

- [ ] **Step 5: Add duplicate apply lock test**

Expected:

```javascript
const first = state.applyPendingActions();
const second = state.applyPendingActions();
assert.strictEqual(first, second);
```

If the existing state returns a receipt instead of a promise, assert executor call count is one.

- [ ] **Step 6: Run preview UI tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected:

```text
pass
```

---

## 9. Task 6: R2 Executor And Receipt Loop

**Files:**

- Modify: `modules/assistant/assistantActionExecutor.js`
- Modify: `modules/assistant/assistantActionExecutor.test.js`
- Modify: `modules/assistant/assistantActionPreview.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.test.js`

### Goal

After user confirmation, validate actions, execute through graphStore, display a receipt, and persist the receipt to the active conversation.

- [ ] **Step 1: Add executor test for `update_node`**

Fake graphStore:

```javascript
const graphStore = {
  nodes: [{ id: "node_1", type: "note", data: { text: "old" } }],
  updateNodeDataCalls: [],
  updateNodeData(nodeId, data) {
    this.updateNodeDataCalls.push({ nodeId, data });
  },
};
```

Action:

```javascript
{ type: "update_node", nodeId: "node_1", data: { text: "new" } }
```

Expected:

```javascript
assert.deepEqual(graphStore.updateNodeDataCalls[0], { nodeId: "node_1", data: { text: "new" } });
assert.equal(result.appliedCount, 1);
```

- [ ] **Step 2: Add executor test for create/connect id mapping**

Actions:

```javascript
[
  { type: "create_node", id: "draft_prompt", nodeType: "note", name: "Prompt" },
  { type: "create_node", id: "draft_image", nodeType: "ai-image", name: "Image" },
  { type: "connect_nodes", from: "draft_prompt", to: "draft_image" }
]
```

Expected:

```javascript
assert.equal(result.createdNodeIds.length, 2);
assert.equal(result.createdEdgeIds.length, 1);
```

- [ ] **Step 3: Add panel test for validate-before-execute**

Expected call order:

```javascript
assert.deepEqual(calls, ["validateActions", "executeActions", "appendReceipt"]);
```

- [ ] **Step 4: Implement or harden `update_node` execution**

Required behavior:

- resolve `nodeId` through temporary id map;
- call `graphStore.updateNodeData(nodeId, action.data)` when data exists;
- if name/title update is supported by graphStore, call the existing graphStore update method;
- if target node missing, add warning and do not increment `appliedCount`;
- never mutate unknown graphStore internals directly when an adapter method exists.

- [ ] **Step 5: Build receipt fields**

Receipt result should support:

```javascript
{
  appliedCount: 3,
  createdNodeIds: ["node_a"],
  createdEdgeIds: ["edge_a_b"],
  updatedNodeIds: ["node_old"],
  queuedGenerationNodeIds: [],
  startedGenerationNodeIds: [],
  warnings: []
}
```

Existing receipt text can remain, but the structured details must be passed to conversation store.

- [ ] **Step 6: Add focus changed nodes behavior**

After successful apply, if result has created/updated/queued node IDs, panel should expose a button equivalent to:

```javascript
state.focusReceiptNodes(receipt);
```

Expected graphStore call:

```javascript
graphStore.setSelectedNodes(["node_a", "node_old"]);
```

- [ ] **Step 7: Run executor loop tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js
```

Expected:

```text
pass
```

---

## 10. Task 7: R3 Backend Conversation Persistence

**Files:**

- Modify: `services/canvas_agent_conversation_service.py`
- Modify: `services/canvas_agent_route_service.py`
- Modify: `services/http_route_dispatcher.py`
- Modify: `server.py`
- Modify: `canvas_agent_conversation_service_test.py`
- Modify: `canvas_agent_route_service_test.py`
- Modify: `http_route_dispatcher_test.py`

### Goal

Persist conversation list/detail/messages/actions/receipts with search, rename, delete, export, and secret redaction.

- [ ] **Step 1: Add conversation create/list/get test**

Expected:

```python
created = service.create_conversation({"workspaceId": "ws_1", "canvasId": "canvas_1"})
items = service.list_conversations()
loaded = service.get_conversation(created["id"])
self.assertEqual(items[0]["id"], created["id"])
self.assertEqual(loaded["workspaceId"], "ws_1")
```

- [ ] **Step 2: Add append messages/receipts test**

Expected:

```python
service.append_message(conversation_id, {"role": "user", "content": "创建节点"})
service.append_message(conversation_id, {"role": "assistant", "content": "已准备", "actions": []})
service.append_receipt(conversation_id, {"success": True, "summary": "Applied 1 action"})
loaded = service.get_conversation(conversation_id)
self.assertEqual(len(loaded["messages"]), 2)
self.assertEqual(len(loaded["receipts"]), 1)
```

- [ ] **Step 3: Add search/delete/rename/export tests**

Expected:

```python
service.rename_conversation(conversation_id, "图片工作流")
self.assertEqual(service.search_conversations("图片")[0]["id"], conversation_id)
exported = service.export_conversation(conversation_id, format="json")
self.assertNotRegex(exported, r"s[k]-")
service.delete_conversation(conversation_id)
self.assertIsNone(service.get_conversation(conversation_id))
```

- [ ] **Step 4: Implement persistence semantics**

Required conversation fields:

```python
{
    "id": "conv_x",
    "title": "未命名会话",
    "createdAt": "...",
    "updatedAt": "...",
    "workspaceId": "ws_1",
    "canvasId": "canvas_1",
    "model": {"provider": "pi_canvas_agent", "modelId": "agent", "displayName": "Agent"},
    "messages": [],
    "receipts": [],
    "metadata": {},
}
```

- [ ] **Step 5: Wire route methods**

Route behavior:

```text
GET    /api/v2/canvas-agent/conversations
POST   /api/v2/canvas-agent/conversations
GET    /api/v2/canvas-agent/conversations/{id}
PATCH  /api/v2/canvas-agent/conversations/{id}
DELETE /api/v2/canvas-agent/conversations/{id}
POST   /api/v2/canvas-agent/conversations/{id}/messages
POST   /api/v2/canvas-agent/conversations/{id}/receipts
GET    /api/v2/canvas-agent/conversations/{id}/export
```

If existing route matching is already consolidated, keep implementation compatible and add missing cases.

- [ ] **Step 6: Ensure export redaction**

Redact these patterns in all exports:

```text
secret-token-prefix...
Authorization: Bearer ...
apiKey
secret
```

Expected replacement:

```text
[redacted]
```

- [ ] **Step 7: Run backend conversation tests**

Run:

```powershell
python -m unittest canvas_agent_conversation_service_test canvas_agent_route_service_test http_route_dispatcher_test
```

Expected:

```text
OK
```

---

## 11. Task 8: R3 Frontend Conversation Sync And History UI

**Files:**

- Modify: `modules/assistant/assistantConversationStore.js`
- Modify: `modules/assistant/assistantConversationStore.test.js`
- Modify: `api/canvasAgentApi.js`
- Modify: `api/canvasAgentApi.test.js`
- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`

### Goal

Make the history drawer backend-backed while preserving local responsiveness and preventing restored pending actions from auto-executing.

- [ ] **Step 1: Add API client tests for conversations**

Expected methods:

```javascript
await api.listConversations({ query: "图片" });
await api.createConversation({ workspaceId: "ws_1", canvasId: "canvas_1" });
await api.getConversation("conv_1");
await api.renameConversation("conv_1", "图片工作流");
await api.deleteConversation("conv_1");
await api.appendConversationMessage("conv_1", { role: "user", content: "hello" });
await api.appendConversationReceipt("conv_1", { success: true, summary: "Applied" });
await api.exportConversation("conv_1", { format: "json" });
```

- [ ] **Step 2: Add conversation store sync tests**

Expected:

```javascript
const store = createAssistantConversationStore({ api: fakeApi });
const conversation = await store.ensureConversation({ workspaceId: "ws_1", canvasId: "canvas_1" });
await store.appendMessage(conversation.id, { role: "user", content: "hello" });
const items = await store.list({ query: "hello" });
assert.equal(items.length, 1);
```

- [ ] **Step 3: Add restore-pending-no-auto-execute test**

Fixture:

```javascript
const conversation = {
  id: "conv_1",
  messages: [{ role: "assistant", content: "ready", actions: [{ type: "create_node", nodeType: "note" }] }],
  receipts: [],
};
```

Expected:

```javascript
await state.restoreConversation("conv_1");
assert.equal(executeActionsCallCount, 0);
assert.equal(state.pendingActions.length, 1);
```

- [ ] **Step 4: Implement optimistic local updates**

Required semantics:

- Add user message locally immediately when sending.
- Persist user message through API when conversationId exists.
- Save assistant final reply/actions on `message.done`.
- Save receipt after action apply.
- If backend sync fails, keep local draft and mark `syncStatus: "failed"`.

- [ ] **Step 5: Wire history drawer to backend store**

Required UI states:

```text
历史会话
搜索会话
无历史记录
同步失败，稍后重试
删除会话
恢复会话
```

Deletion rules:

- Deleting non-active conversation removes it from list.
- Deleting active conversation clears current messages and starts a new draft conversation.
- Delete requires confirmation.

- [ ] **Step 6: Add cross-canvas restore warning**

If restored `canvasId` differs from current canvas:

```text
这是另一个画布的助手记录，恢复后不会自动应用历史动作。
```

- [ ] **Step 7: Run frontend conversation tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantConversationStore.test.js api\canvasAgentApi.test.js modules\app\appAssistantPanel.p1Ui.test.js
```

Expected:

```text
pass
```

---

## 12. Task 9: R4 Unified API Key And Model Registry

**Files:**

- Modify: `modules/assistant/assistantModelRegistry.js`
- Modify: `modules/assistant/assistantModelRegistry.test.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Modify: `modules/app/appAssistantPanel.autoload.test.js`
- Modify: `services/canvas_agent_route_service.py`
- Modify: `pi_bridge_service_test.py`
- Modify: `canvas_agent_route_service_test.py`

### Goal

Use Huanying unified API configuration to build assistant model options, block unconfigured sends, and keep keys out of payloads/status/errors.

- [ ] **Step 1: Add model registry test for configured provider**

Config fixture:

```javascript
const config = {
  providers: {
    pi_canvas_agent: {
      endpoint: "https://example.invalid/v1",
      apiKeyConfigured: true,
      defaultModel: "agent-high-quality",
    },
  },
};
```

Expected:

```javascript
const registry = buildAssistantModelRegistry(config);
assert.equal(registry.defaultModel.id, "agent-high-quality");
assert.equal(registry.options[0].configured, true);
assert.equal(JSON.stringify(registry).includes("s" + "k-"), false);
```

- [ ] **Step 2: Add model registry test for disabled provider**

Expected:

```javascript
assert.equal(option.configured, false);
assert.match(option.disabledReason, /API Key|Endpoint|配置/);
```

- [ ] **Step 3: Add autoload test for selected model**

Expected:

```javascript
const panel = installAppAssistantPanel({ autoInstall: false, api: fakeApi, graphStore, workspaceStore });
assert.equal(panel.state.selectedModel.provider, "pi_canvas_agent");
```

- [ ] **Step 4: Implement registry semantics**

Each option should contain:

```javascript
{
  id: "agent-high-quality",
  provider: "pi_canvas_agent",
  displayName: "Agent 高质量",
  configured: true,
  disabledReason: "",
  capabilities: ["text", "vision", "action_planning", "high_quality"]
}
```

Unconfigured model:

```javascript
{
  configured: false,
  disabledReason: "缺少 API Key 或 Endpoint"
}
```

- [ ] **Step 5: Add backend status redaction test**

Expected status payload:

```python
payload = service._status_payload()
encoded = json.dumps(payload)
self.assertNotRegex(encoded, r"s[k]-")
self.assertNotIn("api_key_value", encoded)
self.assertIn("configured", encoded)
```

- [ ] **Step 6: Harden provider summary**

Status may expose:

```json
{
  "id": "pi_canvas_agent",
  "configured": true,
  "endpoint": "https://example.invalid/...",
  "apiKey": "configured",
  "defaultModel": "agent-high-quality"
}
```

Status must not expose:

```json
{"apiKey":"real-secret-value"}
```

- [ ] **Step 7: Run model/config tests**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantModelRegistry.test.js modules\app\appAssistantPanel.autoload.test.js
python -m unittest canvas_agent_route_service_test pi_bridge_service_test
```

Expected:

```text
pass
OK
```

---

## 13. Task 10: R4 Model Selector And Send Guard UI

**Files:**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.p1Ui.test.js`
- Modify: `modules/app/appAssistantPanel.autoload.test.js`

### Goal

Make the model selector operational: users can see configured/disabled models, switch models, and cannot send to an unconfigured model.

- [ ] **Step 1: Add UI test for disabled model**

Expected visible text:

```text
缺少 API Key 或 Endpoint
去配置 API Key
```

Expected behavior:

```javascript
assert.equal(state.canSendMessage(), false);
```

- [ ] **Step 2: Add UI test for model switching**

Expected:

```javascript
state.selectModel("agent-low-latency");
await state.sendMessage("hello");
assert.equal(api.lastPayload.model.modelId, "agent-low-latency");
```

- [ ] **Step 3: Implement selector grouped by provider**

Visible structure:

```text
Pi Canvas Agent
  Agent 高质量    文本 视觉 动作规划 高质量
  Agent 低延迟    文本 动作规划 低延迟
```

Disabled item structure:

```text
Agent 高质量
缺少 API Key 或 Endpoint
```

- [ ] **Step 4: Implement send guard**

Before send:

```javascript
if (!state.selectedModel?.configured) {
  state.status = "error";
  state.lastError = "请先配置 Agent 模型后再发送。";
  return;
}
```

If current implementation uses a different status field, map this behavior into the existing error state.

- [ ] **Step 5: Run model selector tests**

Run:

```powershell
D:\Aic\node.exe --test modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js
```

Expected:

```text
pass
```

---

## 14. Task 11: R1-R4 Live Screenshot Validation

**Files:**

- Modify: `tools/assistant_panel_live_screenshot_check.mjs`
- Modify: `tools/assistant_panel_live_screenshot_check.test.mjs`
- Append: `docs/canvas_agent_p0_p1_implementation_log.md`

### Goal

Prove the implementation works in the real Huanying page, not only in isolated unit tests.

- [ ] **Step 1: Add live scenario for open panel**

Assertions:

```text
assistant launcher exists
assistant panel opens
input composer visible
```

Screenshot name should include:

```text
assistant-panel-open
```

- [ ] **Step 2: Add live scenario for model menu**

Assertions:

```text
model button visible
model dropdown visible
configured or disabled state visible
```

Screenshot name should include:

```text
assistant-panel-model-menu
```

- [ ] **Step 3: Add live scenario for streaming**

Use a fake route or configured test bridge that does not expose keys. Assertions:

```text
streaming state visible
assistant delta visible
final reply visible
```

Screenshot name should include:

```text
assistant-panel-streaming
```

- [ ] **Step 4: Add live scenario for action preview and receipt**

Assertions:

```text
preview card visible
apply button visible
receipt visible after apply
```

Screenshot name should include:

```text
assistant-panel-preview-receipt
```

- [ ] **Step 5: Add live scenario for history restore**

Assertions:

```text
history drawer visible
search input visible
conversation restore works
```

Screenshot name should include:

```text
assistant-panel-history
```

- [ ] **Step 6: Ensure console/route failures fail the test**

The screenshot tool must fail on:

```text
JavaScript runtime error
assistant module load error
/api/v2/canvas-agent route failure
unexpected unhandled promise rejection
```

It may ignore unrelated host-page static asset 404s only if they do not affect assistant behavior.

- [ ] **Step 7: Run live screenshot validation**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 8: Append screenshot evidence**

Append to `docs/canvas_agent_p0_p1_implementation_log.md`:

```markdown
## R1-R4 Live Screenshot Evidence - 2026-06-03

- Open panel screenshot: `output/regression/...assistant-panel-open...png`
- Model menu screenshot: `output/regression/...assistant-panel-model-menu...png`
- Streaming screenshot: `output/regression/...assistant-panel-streaming...png`
- Preview/receipt screenshot: `output/regression/...assistant-panel-preview-receipt...png`
- History screenshot: `output/regression/...assistant-panel-history...png`
```

---

## 15. Task 12: Full Regression And Documentation Closeout

**Files:**

- Append: `docs/canvas_agent_p0_p1_implementation_log.md`
- Read: all modified test outputs

### Goal

Run the full focused regression set, record evidence, and leave a clear handoff for the next feature layer.

- [ ] **Step 1: Run full frontend focused regression**

Run:

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.test.js
```

Expected:

```text
pass
```

- [ ] **Step 2: Run full backend focused regression**

Run:

```powershell
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_context_service_test http_route_dispatcher_test
```

Expected:

```text
OK
```

- [ ] **Step 3: Run live screenshot regression**

Run:

```powershell
D:\Aic\node.exe --test tools\assistant_panel_live_screenshot_check.test.mjs
```

Expected:

```text
pass
```

- [ ] **Step 4: Search for accidental key exposure in changed docs/tests**

Run only literal text search because this checks secret-like strings:

```powershell
Select-String -Path docs\canvas_agent_r1_r4_*.md,docs\canvas_agent_p0_p1_implementation_log.md,modules\assistant\*.js,modules\assistant\*.test.js,modules\app\appAssistantPanel*.js,modules\app\appAssistantPanel*.test.js,api\canvasAgentApi*.js,services\canvas_agent*.py,services\pi_bridge_service.py,*canvas_agent*_test.py,pi_bridge_service_test.py -Pattern 's[k]-'
```

Expected:

```text
no matches
```

- [ ] **Step 5: Append final implementation evidence**

Append:

```markdown
## R1-R4 Completion Evidence - 2026-06-03

- Frontend focused regression: pass, command recorded.
- Backend focused regression: pass, command recorded.
- Live screenshot regression: pass, screenshots recorded.
- Secret scan: no secret-prefix matches in changed assistant docs/tests/source.
- Completed scope: R1 stream, R2 action execution loop, R3 conversation sync, R4 unified model/key config.
- Next scope: R5 live screenshot expansion hardening, R6 Canvas Doctor, R7 Auto Layout, R8 one-sentence workflow.
```

---

## 16. Development Order And Checkpoints

Recommended order:

1. Task 0 baseline.
2. Task 1 R1 protocol/API stream.
3. Task 2 R1 panel state.
4. Task 3 R1 backend stream.
5. Task 4 R2 contract/schema.
6. Task 5 R2 preview/confirmation.
7. Task 6 R2 executor/receipt.
8. Task 7 R3 backend persistence.
9. Task 8 R3 frontend sync/history.
10. Task 9 R4 unified config/model registry.
11. Task 10 R4 selector/send guard.
12. Task 11 live screenshots.
13. Task 12 full regression and closeout.

Checkpoint rules:

- After each task, run that task's tests before touching the next task.
- After every UI task, run at least one live screenshot flow.
- After every backend route or bridge task, run `canvas_agent_route_service_test` and `pi_bridge_service_test`.
- If a failure occurs three times, stop and record the failed attempts in `docs/canvas_agent_p0_p1_implementation_log.md` before changing strategy.
- Never fix a live failure only in the screenshot script; add a unit or route regression for the root cause.

---

## 17. Acceptance Criteria

R1-R4 are complete only when all criteria pass:

- R1: The assistant panel sends a real stream request, shows delta text, supports stop/retry, and stores only final-frame actions.
- R2: Final actions are previewed, risk scored, confirmed, validated by backend schema, executed by local graphStore adapter, and recorded as receipts.
- R3: Conversations persist across refresh, can be listed/searched/restored/renamed/deleted/exported, and restored pending actions never auto-execute.
- R4: Assistant model options come from unified Huanying API config, unconfigured models are disabled, send is blocked when required config is missing, and keys are never exposed.
- Frontend focused tests pass.
- Backend focused tests pass.
- Live screenshot regression passes on the real Huanying page.
- `docs/canvas_agent_p0_p1_implementation_log.md` includes commands, results, and screenshot paths.

---

## 18. Implementation Handoff

Plan complete. Recommended execution approach:

1. **Subagent-driven execution:** assign independent tasks to workers with disjoint write scopes, especially R1 protocol/API, R2 schema/executor, R3 conversation backend, and R4 model registry.
2. **Inline execution:** execute tasks sequentially in this session if avoiding merge conflicts is more important than speed.

For either approach, keep CodeGraph as the first tool for structural questions and use literal search only for strings, logs, comments, config values, and secret scans.

