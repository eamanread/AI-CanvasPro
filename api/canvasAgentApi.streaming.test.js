import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasAgentApi } from "./canvasAgentApi.js";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

test("canvasAgentApi: chatStream consumes JSONL stream events", async () => {
  const events = [];
  const api = createCanvasAgentApi({
    async fetchImpl(url) {
      assert.equal(url, "/api/v2/canvas-agent/chat/stream");
      return new Response(
        [
          JSON.stringify({ type: "message.delta", delta: "hello " }),
          JSON.stringify({ type: "message.delta", delta: "canvas" }),
          JSON.stringify({
            type: "message.done",
            actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
          }),
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
      );
    },
  });

  const response = await api.chatStream(
    { message: "focus", context: {} },
    { onEvent: (event) => events.push(event.type) }
  );

  assert.deepEqual(events, ["message.delta", "message.delta", "message.done"]);
  assert.equal(response.reply, "hello canvas");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
});

test("canvasAgentApi: chatStream falls back to the old chat route when stream is unavailable", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    async fetchImpl(url) {
      calls.push(url);
      if (url === "/api/v2/canvas-agent/chat/stream") {
        return jsonResponse({ success: false, message: "Not found" }, { status: 404 });
      }
      return jsonResponse({ reply: "fallback ok", actions: [] });
    },
  });

  const response = await api.chatStream({ message: "hello" });

  assert.deepEqual(calls, ["/api/v2/canvas-agent/chat/stream", "/api/v2/canvas-agent/chat"]);
  assert.equal(response.reply, "fallback ok");
  assert.deepEqual(response.actions, []);
});


test("canvasAgentApi: normalizes stream HTTP errors into a friendly envelope", async () => {
  const api = createCanvasAgentApi({
    async fetchImpl() {
      return jsonResponse(
        {
          success: false,
          friendlyMessage: "Pi runner is not configured.",
          errorCode: "missing_runner",
          traceId: "trace-http-1",
          diagnostics: ["missing endpoint"],
          retryable: true,
        },
        { status: 503 }
      );
    },
  });

  await assert.rejects(
    () => api.chatStream({ message: "hello" }),
    (error) => {
      assert.equal(error.friendlyMessage, "Pi runner is not configured.");
      assert.equal(error.errorCode, "missing_runner");
      assert.equal(error.traceId, "trace-http-1");
      assert.deepEqual(error.diagnostics, ["missing endpoint"]);
      assert.equal(error.retryable, true);
      return true;
    }
  );
});
