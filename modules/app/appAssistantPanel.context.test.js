import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

test("createAssistantPanelState: includes conversationId, selected model, and attachments in requests", async () => {
  const calls = [];
  const state = createAssistantPanelState({
    conversationId: "conv-existing",
    selectedModel: {
      provider: "model_registry",
      id: "text-model",
      modelId: "text-model",
      model: "text-model",
      displayName: "Text Model",
      configured: true,
      supportsText: true,
    },
    attachmentStore: {
      toContext() {
        return [
          {
            id: "att-1",
            kind: "image",
            name: "reference.png",
            assetId: "asset-1",
            usage: "style_reference",
          },
        ];
      },
    },
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chat(payload) {
        calls.push(payload);
        return { reply: "ok", actions: [] };
      },
    },
  });

  await state.sendMessage("use this reference");

  assert.equal(calls[0].conversationId, "conv-existing");
  assert.deepEqual(calls[0].model, {
    provider: "model_registry",
    id: "text-model",
    modelId: "text-model",
    model: "text-model",
    displayName: "Text Model",
    configured: true,
    supportsText: true,
  });
  assert.deepEqual(calls[0].attachments, [
    {
      id: "att-1",
      kind: "image",
      name: "reference.png",
      assetId: "asset-1",
      usage: "style_reference",
    },
  ]);
});

test("createAssistantPanelState: includes references and attachment usages in context", async () => {
  const calls = [];
  const state = createAssistantPanelState({
    attachmentStore: {
      toContext() {
        return [
          {
            id: "att-style",
            kind: "image",
            name: "style.png",
            assetId: "asset-style",
            usage: "style",
            dimensions: { width: 512, height: 512 },
            localPath: "D:\\secret\\style.png",
          },
        ];
      },
    },
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chat(payload) {
        calls.push(payload);
        return { reply: "ok", actions: [] };
      },
    },
  });

  state.setReferences([
    {
      id: "node:n1",
      kind: "node",
      targetId: "n1",
      label: "脚本",
      nodeType: "ai-text",
      usage: "target",
    },
  ]);
  await state.sendMessage("use @脚本 and the style reference");

  assert.equal(calls[0].context.references.items[0].targetId, "n1");
  assert.equal(calls[0].context.attachments.items[0].usage, "style");
  assert.equal(calls[0].context.attachments.items[0].assetId, "asset-style");
  assert.doesNotMatch(JSON.stringify(calls[0].context), /D:\\secret|localPath/);
});

test("createAssistantPanelState: creates a conversation and records user/context/assistant/actions", async () => {
  const operations = [];
  const state = createAssistantPanelState({
    conversationStore: {
      create(payload) {
        operations.push({ type: "create", payload });
        return { id: "conv-new" };
      },
      appendMessage(id, message) {
        operations.push({ type: "message", id, message });
      },
      attachContextSnapshot(id, snapshot) {
        operations.push({ type: "context", id, snapshot });
      },
      appendTransaction(id, transaction) {
        operations.push({ type: "transaction", id, transaction });
      },
    },
    buildContext: () => ({ canvas: { nodeCount: 2 } }),
    api: {
      async chat(payload) {
        operations.push({ type: "chat", payload });
        return {
          conversationId: "conv-new",
          traceId: "trace-1",
          reply: "I proposed a focus action.",
          actions: [{ type: "focus_nodes", nodeIds: ["node-1"] }],
        };
      },
    },
  });

  await state.sendMessage("focus problem");

  assert.equal(state.conversationId, "conv-new");
  assert.equal(operations[0].type, "create");
  assert.equal(operations[1].type, "message");
  assert.equal(operations[1].message.role, "user");
  assert.equal(operations[2].type, "context");
  assert.equal(operations[3].type, "chat");
  assert.equal(operations[3].payload.conversationId, "conv-new");
  assert.equal(operations[4].message.role, "assistant");
  assert.equal(operations[5].transaction.actions[0].type, "focus_nodes");
});

test("createAssistantPanelState: writes apply receipts to conversation store", async () => {
  const receipts = [];
  const state = createAssistantPanelState({
    conversationId: "conv-apply",
    buildContext: () => ({}),
    api: {
      async chat() {
        return { reply: "Apply this.", actions: [{ type: "focus_nodes", nodeIds: ["n1"] }] };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    conversationStore: {
      appendMessage() {},
      attachContextSnapshot() {},
      appendTransaction() {},
      appendReceipt(id, receipt) {
        receipts.push({ id, receipt });
      },
    },
    async executeActions() {
      return { appliedCount: 1 };
    },
  });

  await state.sendMessage("apply focus");
  await state.applyPendingActions();

  assert.equal(receipts[0].id, "conv-apply");
  assert.equal(receipts[0].receipt.success, true);
  assert.match(receipts[0].receipt.summary, /applied|Canvas actions|focus|已应用|画布操作/i);
});

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

test("appAssistantPanel context: restores pending actions from active confirmation card", () => {
  const state = createAssistantPanelState({});

  state.restoreConversation({
    id: "conv-active-card",
    messages: [
      { role: "user", content: "生成一个视频节点" },
      {
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
      },
    ],
  });

  assert.deepEqual(state.pendingActions, [{ type: "create_node", node: { id: "video-1", type: "video" } }]);
  assert.equal(state.status, "done_pending_actions");
});
