import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBridgeRequest, safeResponse, safeStreamFrame } from "./protocol.js";

test("normalizes a valid chat request", () => {
  const request = normalizeBridgeRequest({
    id: "req-1",
    type: "chat",
    conversationId: "project-default",
    message: "Check the canvas",
    context: { canvas: { nodes: [], edges: [] } }
  });

  assert.deepEqual(request, {
    id: "req-1",
    type: "chat",
    conversationId: "project-default",
    message: "Check the canvas",
    context: { canvas: { nodes: [], edges: [] } }
  });
});

test("normalizes optional model reference without secrets", () => {
  const request = normalizeBridgeRequest({
    id: "req-model",
    type: "chat",
    message: "Use model",
    model: {
      provider: "pi_canvas_agent",
      modelId: "agent-fast",
      model: "agent-fast",
      displayName: "Agent Fast",
      apiKey: "secret",
      endpoint: "https://example.test"
    }
  });

  assert.deepEqual(request.model, {
    provider: "pi_canvas_agent",
    modelId: "agent-fast",
    model: "agent-fast",
    displayName: "Agent Fast"
  });
});

test("rejects missing message", () => {
  assert.throws(
    () => normalizeBridgeRequest({ id: "req-2", type: "chat" }),
    /message is required/
  );
});

test("safeResponse fills safe response defaults", () => {
  const response = safeResponse("req-3", { reply: "Ready" });

  assert.deepEqual(response, {
    id: "req-3",
    type: "response",
    success: true,
    reply: "Ready",
    actions: [],
    warnings: [],
    requiresConfirmation: false
  });
});

test("safeResponse preserves sanitized assistant response contract v2 fields", () => {
  const response = safeResponse("req-v2", {
    reply: "planned",
    intent: {
      id: "intent_1",
      mode: "act",
      matchedSkills: ["prompt_preset_generation"],
      apiKey: "must-not-leak"
    },
    plan: {
      id: "plan_1",
      title: "预设生成",
      status: "draft",
      steps: [{ id: "step_1", title: "生成图片" }]
    },
    actionsByStep: {
      step_1: [{ type: "run_prompt_preset_generation", nodeType: "ai-image", nodeId: "img_1" }, "bad"]
    },
    execution: {
      id: "exec_1",
      status: "draft",
      drawerState: { visible: true }
    },
    developer: {
      rawModelContractVersion: "v2",
      skillWarnings: ["ok"],
      localPath: "D:\\secret\\project.json"
    }
  });

  assert.equal(response.intent.id, "intent_1");
  assert.deepEqual(response.intent.matchedSkills, ["prompt_preset_generation"]);
  assert.equal("apiKey" in response.intent, false);
  assert.equal(response.plan.id, "plan_1");
  assert.deepEqual(response.actionsByStep.step_1, [
    { type: "run_prompt_preset_generation", nodeType: "ai-image", nodeId: "img_1" }
  ]);
  assert.equal(response.execution.id, "exec_1");
  assert.deepEqual(response.developer, {
    rawModelContractVersion: "v2",
    skillWarnings: ["ok"]
  });
});

test("safeResponse preserves explicit false success", () => {
  assert.equal(safeResponse("req-4", { success: false }).success, false);
});

test("safeResponse defaults non-boolean success to true", () => {
  assert.equal(safeResponse("req-5", { success: "no" }).success, true);
});

test("safeResponse defaults non-string reply to empty string", () => {
  assert.equal(safeResponse("req-6", { reply: 123 }).reply, "");
});

test("safeResponse drops blank and non-string warning entries", () => {
  assert.deepEqual(
    safeResponse("req-7", { warnings: ["keep", 123, "", false, "  warn  "] }).warnings,
    ["keep", "warn"]
  );
});

test("safeResponse omits non-string errorCode and preserves string errorCode", () => {
  assert.equal("errorCode" in safeResponse("req-8", { errorCode: 404 }), false);
  assert.equal(safeResponse("req-9", { errorCode: "E_READY" }).errorCode, "E_READY");
});

test("safeResponse omits empty and whitespace-only errorCode", () => {
  assert.equal("errorCode" in safeResponse("req-10", { errorCode: "" }), false);
  assert.equal("errorCode" in safeResponse("req-11", { errorCode: "   " }), false);
});

test("safeResponse drops non-object actions", () => {
  assert.deepEqual(
    safeResponse("req-12", {
      actions: [{ type: "note" }, null, "skip", ["skip"]]
    }).actions,
    [{ type: "note" }]
  );
});

test("safeStreamFrame strips executable actions from delta frames", () => {
  const frame = safeStreamFrame("req-stream", {
    type: "message.delta",
    delta: "thinking",
    actions: [{ type: "create_node" }]
  });

  assert.deepEqual(frame, {
    id: "req-stream",
    type: "message.delta",
    delta: "thinking",
    actions: [],
    conversationId: "",
    messageId: "",
    traceId: ""
  });
});

test("safeStreamFrame preserves final actions only on message.done", () => {
  const frame = safeStreamFrame("req-stream", {
    type: "message.done",
    reply: "done",
    intent: { id: "intent_stream", matchedSkills: ["canvas_layout"] },
    plan: { id: "plan_stream", steps: [] },
    actionsByStep: { step_1: [{ type: "focus_nodes", nodeIds: ["n1"] }] },
    execution: { id: "exec_stream", status: "draft" },
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }, "bad"],
    warnings: [" ok ", ""],
    requiresConfirmation: true,
    conversationId: "conv-1",
    messageId: "msg-1",
    traceId: "trace-1"
  });

  assert.deepEqual(frame, {
    id: "req-stream",
    type: "message.done",
    reply: "done",
    actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
    intent: { id: "intent_stream", matchedSkills: ["canvas_layout"] },
    plan: { id: "plan_stream", steps: [] },
    actionsByStep: { step_1: [{ type: "focus_nodes", nodeIds: ["n1"] }] },
    execution: { id: "exec_stream", status: "draft" },
    warnings: ["ok"],
    requiresConfirmation: true,
    conversationId: "conv-1",
    messageId: "msg-1",
    traceId: "trace-1"
  });
});
