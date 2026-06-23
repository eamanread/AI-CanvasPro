import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasAgentApi } from "./canvasAgentApi.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function ndjsonResponse(lines, status = 200) {
  const encoded = new TextEncoder().encode(`${lines.join("\n")}\n`);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type"
          ? "application/x-ndjson; charset=utf-8"
          : "";
      },
    },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  };
}

test("chat() sends a JSON POST to the canvas agent chat endpoint", async () => {
  const calls = [];
  const payload = { message: "Create a story arc", context: { sceneId: "s1" } };
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true, data: { reply: "ok" } });
    },
  });

  const result = await api.chat(payload);

  assert.deepEqual(result, { success: true, data: { reply: "ok" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v2/canvas-agent/chat");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, JSON.stringify(payload));
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
});

test("success=false responses throw and preserve the parsed response", async () => {
  const response = { success: false, error: "Invalid action" };
  const api = createCanvasAgentApi({
    fetchImpl: async () => jsonResponse(response, 200),
  });

  await assert.rejects(
    () => api.validateActions({ actions: [] }),
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(error.response, response);
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("status() sends a GET request to the canvas agent status endpoint", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true, status: "ready" });
    },
  });

  const result = await api.status();

  assert.deepEqual(result, { success: true, status: "ready" });
  assert.deepEqual(calls, [
    {
      url: "/api/v2/canvas-agent/status",
      options: { method: "GET" },
    },
  ]);
});

test("validateActions() and previewContext() use their canvas agent endpoints", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true });
    },
  });

  await api.validateActions({ actions: [{ type: "focus_nodes" }] });
  await api.previewContext({ context: { canvas: {} } });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method, call.options.headers["Content-Type"]]),
    [
      ["/api/v2/canvas-agent/actions/validate", "POST", "application/json"],
      ["/api/v2/canvas-agent/context/preview", "POST", "application/json"],
    ]
  );
});

test("HTTP failures include endpoint and status", async () => {
  const api = createCanvasAgentApi({
    fetchImpl: async () => jsonResponse({}, 500),
  });

  await assert.rejects(
    () => api.chat({ message: "hello" }),
    (error) => {
      assert.match(error.message, /POST \/api\/v2\/canvas-agent\/chat returned 500/);
      assert.equal(error.status, 500);
      assert.equal(error.url, "/api/v2/canvas-agent/chat");
      return true;
    }
  );
});

test("invalid JSON responses fail with endpoint context", async () => {
  const api = createCanvasAgentApi({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }),
  });

  await assert.rejects(
    () => api.status(),
    (error) => {
      assert.match(error.message, /not valid JSON/);
      assert.equal(error.status, 200);
      assert.equal(error.url, "/api/v2/canvas-agent/status");
      return true;
    }
  );
});

test("network failures are wrapped with endpoint context and cause", async () => {
  const cause = new Error("fetch failed");
  const api = createCanvasAgentApi({
    fetchImpl: async () => {
      throw cause;
    },
  });

  await assert.rejects(
    () => api.previewContext({ context: {} }),
    (error) => {
      assert.match(error.message, /\/api\/v2\/canvas-agent\/context\/preview/);
      assert.equal(error.cause, cause);
      assert.equal(error.url, "/api/v2/canvas-agent/context/preview");
      return true;
    }
  );
});

test("chatStream() parses NDJSON frames and exposes frame and done callbacks", async () => {
  const calls = [];
  const frames = [];
  let doneFrame = null;
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return ndjsonResponse([
        JSON.stringify({ type: "message.start", conversationId: "conv_1" }),
        JSON.stringify({ type: "message.delta", delta: "hello" }),
        JSON.stringify({
          type: "message.done",
          reply: "hello",
          actions: [{ type: "focus_nodes", nodeIds: ["node_1"] }],
          conversationId: "conv_1",
        }),
      ]);
    },
  });

  const result = await api.chatStream(
    {
      message: "focus",
      conversationId: "conv_1",
      mode: "actions",
      model: { provider: "pi_canvas_agent", modelId: "agent-high-quality" },
      context: { canvas: {}, selection: {}, attachments: [] },
    },
    {
      onFrame(frame) {
        frames.push(frame);
      },
      onDone(frame) {
        doneFrame = frame;
      },
    }
  );

  assert.equal(calls[0].url, "/api/v2/canvas-agent/chat/stream");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).model.modelId, "agent-high-quality");
  assert.deepEqual(frames.map((frame) => frame.type), [
    "message.start",
    "message.delta",
    "message.done",
  ]);
  assert.equal(doneFrame.reply, "hello");
  assert.equal(result.reply, "hello");
  assert.deepEqual(result.actions, [{ type: "focus_nodes", nodeIds: ["node_1"] }]);
});

test("chatStream() passes AbortSignal to fetch without leaking secrets", async () => {
  const controller = new AbortController();
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return ndjsonResponse([
        JSON.stringify({ type: "message.done", reply: "ok", actions: [] }),
      ]);
    },
  });

  await api.sendMessageStream(
    {
      message: "hello",
      context: {},
      model: { provider: "pi_canvas_agent", modelId: "agent", apiKey: "secret-value" },
    },
    {},
    { signal: controller.signal }
  );

  const body = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(body.model.modelId, "agent");
  assert.equal(Object.hasOwn(body.model, "apiKey"), false);
});

test("conversation API methods use canvas agent conversation routes", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true, conversation: { id: "conv_1" }, conversations: [] });
    },
  });

  await api.listConversations({ query: "图片" });
  await api.createConversation({ workspaceId: "ws_1", canvasId: "canvas_1" });
  await api.getConversation("conv_1");
  await api.renameConversation("conv_1", "图片工作流");
  await api.deleteConversation("conv_1");
  await api.appendConversationMessage("conv_1", { role: "user", content: "hello" });
  await api.appendConversationReceipt("conv_1", { success: true, summary: "Applied" });
  await api.exportConversation("conv_1", { format: "json" });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      ["/api/v2/canvas-agent/conversations?query=%E5%9B%BE%E7%89%87", "GET"],
      ["/api/v2/canvas-agent/conversations", "POST"],
      ["/api/v2/canvas-agent/conversations/conv_1", "GET"],
      ["/api/v2/canvas-agent/conversations/conv_1", "PATCH"],
      ["/api/v2/canvas-agent/conversations/conv_1", "DELETE"],
      ["/api/v2/canvas-agent/conversations/conv_1/messages", "POST"],
      ["/api/v2/canvas-agent/conversations/conv_1/receipts", "POST"],
      ["/api/v2/canvas-agent/conversations/conv_1/export?format=json", "GET"],
    ]
  );
  assert.equal(JSON.parse(calls[1].options.body).workspaceId, "ws_1");
  assert.equal(JSON.parse(calls[3].options.body).title, "图片工作流");
});


test("generation task API methods use canvas agent generation task routes", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true, task: { id: "gen_1" }, tasks: [] });
    },
  });

  await api.listGenerationTasks({ conversationId: "conv_1", nodeId: "node 1", status: "queued" });
  await api.createGenerationTask({ nodeId: "node 1", prompt: "make image" });
  await api.updateGenerationTask("gen_1", { status: "cancelled" });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      ["/api/v2/canvas-agent/generation-tasks?conversationId=conv_1&nodeId=node%201&status=queued", "GET"],
      ["/api/v2/canvas-agent/generation-tasks", "POST"],
      ["/api/v2/canvas-agent/generation-tasks/gen_1", "PATCH"],
    ]
  );
  assert.equal(JSON.parse(calls[1].options.body).prompt, "make image");
  assert.equal(JSON.parse(calls[2].options.body).status, "cancelled");
});

test("sync API methods use project-scoped canvas agent sync routes", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ success: true, snapshot: { schemaVersion: "canvas-agent-sync-v1" } });
    },
  });

  await api.exportProjectSyncSnapshot({ projectId: "project a", teamId: "team-alpha" });
  await api.importProjectSyncSnapshot({
    projectId: "project a",
    teamId: "team-alpha",
    snapshot: { schemaVersion: "canvas-agent-sync-v1" },
  });

  assert.deepEqual(
    calls.map((call) => [call.url, call.options.method]),
    [
      ["/api/v2/canvas-agent/sync/project?projectId=project%20a&teamId=team-alpha", "GET"],
      ["/api/v2/canvas-agent/sync/project", "POST"],
    ]
  );
  assert.equal(JSON.parse(calls[1].options.body).projectId, "project a");
});

test("prepareQueuedExecution() posts app payloads to the execution prepare route", async () => {
  const calls = [];
  const api = createCanvasAgentApi({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        success: true,
        plan: { id: "plan-fresh" },
        actionsByStep: { "step-1": [{ id: "act-fresh" }] },
        drawerState: { line2: "Prepared" },
      });
    },
  });

  const payload = {
    executionId: "exec prepare",
    context: { canvas: { nodeCount: 2 } },
    agentMode: "act",
    videoAuthorized: false,
  };
  const result = await api.prepareQueuedExecution(payload);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v2/canvas-agent/executions/exec%20prepare/prepare");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
  assert.equal(result.plan.id, "plan-fresh");
  assert.equal(result.actionsByStep["step-1"][0].id, "act-fresh");
});
