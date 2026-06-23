import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantStreamEventType,
  buildAssistantRequest,
  normalizeAssistantStreamFrame,
  normalizeAssistantResponse,
  normalizeAssistantStreamEvent,
} from "./assistantProtocol.js";

test("assistantProtocol: builds request with sanitized assistantIntent in top-level and context", () => {
  const request = buildAssistantRequest({
    message: "  plan canvas  ",
    context: { canvas: { nodeCount: 2 } },
    assistantIntent: {
      id: "commerce_pack",
      title: "电商套图",
      source: "rh_skill",
      ignored: "not part of the contract",
    },
  });

  assert.deepEqual(request, {
    message: "plan canvas",
    context: {
      canvas: { nodeCount: 2 },
      assistantIntent: {
        id: "commerce_pack",
        title: "电商套图",
        source: "rh_skill",
      },
    },
    mode: "actions",
    assistantIntent: {
      id: "commerce_pack",
      title: "电商套图",
      source: "rh_skill",
    },
  });
});

test("assistantProtocol: normalizes response and rejects unknown stream event types", () => {
  assert.deepEqual(normalizeAssistantResponse({ reply: "ok", actions: null, warnings: [" warn "] }), {
    protocolVersion: "2026-06-03",
    conversationId: "",
    messageId: "",
    traceId: "",
    reply: "ok",
    actions: [],
    cards: [],
    warnings: ["warn"],
    requiresConfirmation: false,
    usage: {},
  });
  assert.equal(normalizeAssistantStreamEvent({ type: "unknown" }), null);
  assert.equal(
    normalizeAssistantStreamEvent({ type: AssistantStreamEventType.MessageDelta, delta: "hi" }).type,
    AssistantStreamEventType.MessageDelta
  );
});

test("assistantProtocol: preserves assistant response contract v2 fields", () => {
  const response = normalizeAssistantResponse({
    reply: "planned",
    intent: {
      id: "intent_1",
      mode: "act",
      matchedSkills: ["canvas_layout"],
      apiKey: "must-not-leak",
    },
    plan: {
      id: "plan_1",
      title: "整理画布",
      status: "draft",
      steps: [{ id: "step_1", title: "整理", enabled: true }],
    },
    actionsByStep: {
      step_1: [{ type: "layout_nodes", nodeIds: ["n1"] }, "bad"],
    },
    execution: {
      id: "exec_1",
      status: "draft",
      drawerState: { visible: true, expanded: false },
    },
    developer: {
      rawModelContractVersion: "v2",
      skillWarnings: ["ok"],
      localPath: "D:\\secret\\project.json",
    },
    actions: [{ type: "layout_nodes", nodeIds: ["n1"] }],
  });

  assert.deepEqual(response.intent, {
    id: "intent_1",
    mode: "act",
    matchedSkills: ["canvas_layout"],
  });
  assert.equal(response.plan.id, "plan_1");
  assert.deepEqual(response.actionsByStep, {
    step_1: [{ type: "layout_nodes", nodeIds: ["n1"] }],
  });
  assert.equal(response.execution.id, "exec_1");
  assert.deepEqual(response.developer, {
    rawModelContractVersion: "v2",
    skillWarnings: ["ok"],
  });
});

test("assistantProtocol: normalizes legal stream frames and only trusts done actions", () => {
  const start = normalizeAssistantStreamFrame({
    type: "message.start",
    conversationId: "conv_1",
    messageId: "msg_1",
    traceId: "trace_1",
  });
  const delta = normalizeAssistantStreamFrame({
    type: "message.delta",
    delta: "hello",
    actions: [{ type: "create_node", nodeType: "note" }],
  });
  const warning = normalizeAssistantStreamFrame({ type: "warning", message: " selection is empty " });
  const done = normalizeAssistantStreamFrame({
    type: "message.done",
    reply: "done",
    intent: { id: "intent_stream", matchedSkills: ["prompt_preset_generation"] },
    plan: { id: "plan_stream", steps: [] },
    actionsByStep: { step_1: [{ type: "focus_nodes", nodeIds: ["node_1"] }] },
    execution: { id: "exec_stream", status: "draft" },
    actions: [{ type: "focus_nodes", nodeIds: ["node_1"] }],
    warnings: ["check layout"],
    requiresConfirmation: true,
    conversationId: "conv_1",
    messageId: "msg_1",
    traceId: "trace_1",
  });

  assert.deepEqual(start, {
    type: "message.start",
    conversationId: "conv_1",
    messageId: "msg_1",
    traceId: "trace_1",
  });
  assert.deepEqual(delta, {
    type: "message.delta",
    delta: "hello",
    actions: [],
    conversationId: "",
    messageId: "",
    traceId: "",
  });
  assert.deepEqual(warning, { type: "warning", message: "selection is empty" });
  assert.deepEqual(done.actions, [{ type: "focus_nodes", nodeIds: ["node_1"] }]);
  assert.equal(done.intent.id, "intent_stream");
  assert.equal(done.plan.id, "plan_stream");
  assert.deepEqual(done.actionsByStep.step_1, [{ type: "focus_nodes", nodeIds: ["node_1"] }]);
  assert.equal(done.execution.id, "exec_stream");
  assert.equal(done.requiresConfirmation, true);
});

test("assistantProtocol: contract sanitizer drops authorization/header/cookie keys via shared rules", () => {
  const response = normalizeAssistantResponse({
    reply: "ok",
    intent: { id: "x", authorization: "Bearer abc", headers: { a: 1 }, cookie: "sid=1", title: "T" },
    actions: [],
  });
  assert.equal(response.intent.authorization, undefined);
  assert.equal(response.intent.headers, undefined);
  assert.equal(response.intent.cookie, undefined);
  assert.equal(response.intent.title, "T");
});
