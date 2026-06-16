import assert from "node:assert/strict";
import test from "node:test";

import { AssistantStreamEventType } from "../assistant/assistantProtocol.js";
import { createAssistantPanelState } from "./appAssistantPanel.js";

test("createAssistantPanelState: streams assistant deltas before final actions", async () => {
  const updates = [];
  const state = createAssistantPanelState({
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chatStream() {
        return [
          { type: AssistantStreamEventType.MessageDelta, delta: "I will " },
          { type: AssistantStreamEventType.MessageDelta, delta: "focus the node." },
          {
            type: AssistantStreamEventType.MessageDone,
            actions: [{ type: "focus_nodes", nodeIds: ["node-1"] }],
            traceId: "trace-stream-1",
          },
        ];
      },
    },
  });

  const response = await state.sendMessage("focus selected", {
    onUpdate: () => updates.push(state.messages.map((message) => message.content).join("|")),
  });

  assert.ok(updates.some((text) => text.includes("I will ")));
  assert.deepEqual(state.messages.map((message) => ({ role: message.role, content: message.content })), [
    { role: "user", content: "focus selected" },
    { role: "assistant", content: "I will focus the node." },
  ]);
  assert.equal(state.messages[1].cards[0].status, "pending");
  assert.equal(state.messages[1].cards[0].title, "将执行画布操作");
  assert.deepEqual(state.pendingActions, [{ type: "focus_nodes", nodeIds: ["node-1"] }]);
  assert.equal(response.traceId, "trace-stream-1");
});

test("createAssistantPanelState: stops streaming without applying final actions", async () => {
  let resolveStream;
  let signalFromRequest = null;
  const state = createAssistantPanelState({
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chatStream(_request, _handlers, options = {}) {
        signalFromRequest = options.signal;
        return new Promise((resolve) => {
          resolveStream = resolve;
        });
      },
      async validateActions() {
        throw new Error("validateActions should not be called after stop");
      },
    },
  });

  const pending = state.sendMessage("focus selected");
  state.stopStreaming();
  resolveStream([{ type: AssistantStreamEventType.MessageDone, actions: [{ type: "focus_nodes", nodeIds: ["node-1"] }] }]);
  const response = await pending;

  assert.equal(signalFromRequest.aborted, true);
  assert.equal(state.status, "cancelled");
  assert.equal(state.streaming, false);
  assert.deepEqual(state.pendingActions, []);
  assert.equal(response, null);
});

test("createAssistantPanelState: retries the last failed user message", async () => {
  let callCount = 0;
  const state = createAssistantPanelState({
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chatStream() {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("agent failed");
        }
        return [
          { type: AssistantStreamEventType.MessageDelta, delta: "ok" },
          { type: AssistantStreamEventType.MessageDone, reply: "ok", actions: [] },
        ];
      },
    },
  });

  const failed = await state.sendMessage("focus selected");
  assert.equal(failed, null);
  assert.equal(state.status, "failed");

  const response = await state.retryLastMessage();

  assert.equal(callCount, 2);
  assert.equal(response.reply, "ok");
  assert.equal(state.status, "done_no_actions");
});


test("createAssistantPanelState: stream failure clears pending actions and stores copyable trace diagnostics", async () => {
  const appended = [];
  const error = new Error("raw transport details");
  error.friendlyMessage = "Pi runner is not configured.";
  error.errorCode = "missing_runner";
  error.traceId = "trace-failed-1";
  error.diagnostics = ["missing endpoint"];
  error.retryable = true;
  const state = createAssistantPanelState({
    conversationId: "conv-1",
    api: {
      async chatStream() {
        throw error;
      },
    },
    conversationStore: {
      appendMessage(id, message) {
        appended.push({ id, message });
      },
      attachContextSnapshot() {},
    },
  });
  state.setPendingActions([{ type: "focus_nodes", nodeIds: ["stale"] }]);

  const response = await state.sendMessage("hello");
  const trace = state.copyLastErrorTrace();

  assert.equal(response, null);
  assert.equal(state.status, "failed");
  assert.equal(state.streaming, false);
  assert.deepEqual(state.pendingActions, []);
  assert.deepEqual(state.lastWarnings, ["Pi runner is not configured."]);
  assert.deepEqual(state.lastError, {
    friendlyMessage: "Pi runner is not configured.",
    errorCode: "missing_runner",
    traceId: "trace-failed-1",
    diagnostics: ["missing endpoint"],
    retryable: true,
  });
  assert.deepEqual(JSON.parse(trace), {
    errorCode: "missing_runner",
    traceId: "trace-failed-1",
    diagnostics: ["missing endpoint"],
    lastWarnings: ["Pi runner is not configured."],
  });
  assert.equal(appended.at(-1).message.kind, "error");
  assert.equal(appended.at(-1).message.content, "Pi runner is not configured.");
  assert.equal(appended.at(-1).message.errorCode, "missing_runner");
  assert.equal(appended.at(-1).message.traceId, "trace-failed-1");
});

test("createAssistantPanelState: non-streaming replies use typewriter updates", async () => {
  const updates = [];
  const scheduled = [];
  const state = createAssistantPanelState({
    typingDelayMs: 4,
    typingChunkSize: 2,
    typingScheduler(callback, delayMs) {
      scheduled.push(delayMs);
      callback();
      return 1;
    },
    api: {
      async chat() {
        return { reply: "Hello", actions: [] };
      },
    },
  });

  await state.sendMessage("say hi", {
    onUpdate: () => updates.push(state.messages.map((message) => message.content).join("|")),
  });

  assert.ok(updates.some((text) => text.endsWith("|He")));
  assert.ok(updates.some((text) => text.endsWith("|Hell")));
  assert.deepEqual(state.messages, [
    { role: "user", content: "say hi" },
    { role: "assistant", content: "Hello" },
  ]);
  assert.deepEqual(scheduled, [4, 4, 4]);
});
