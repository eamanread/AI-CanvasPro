import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantConversationStore } from "./assistantConversationStore.js";

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test("assistantConversationStore: creates and persists conversations", () => {
  const storage = createMemoryStorage();
  const store = createAssistantConversationStore({
    storage,
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_1`,
  });

  const conversation = store.create({
    title: "电商套图规划",
    projectId: "project-1",
    assistantIntent: { id: "commerce_pack", title: "电商套图" },
  });

  assert.equal(conversation.id, "conv_1");
  assert.equal(conversation.title, "电商套图规划");
  assert.deepEqual(store.list().map((item) => item.id), ["conv_1"]);

  const restored = createAssistantConversationStore({ storage });
  assert.equal(restored.get("conv_1").title, "电商套图规划");
});

test("assistantConversationStore: prunes instead of throwing when storage quota is exceeded", () => {
  // 仅当序列化体积 <= LIMIT 时接受写入, 否则抛 QuotaExceededError(还原线上报错场景)。
  const LIMIT = 900;
  const data = new Map();
  const storage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (String(value).length > LIMIT) {
        const error = new Error("Setting the value of 'x' exceeded the quota.");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
  let tick = 0;
  const store = createAssistantConversationStore({
    storage,
    clock: () => `2026-06-03T00:00:00.${String(tick++).padStart(3, "0")}Z`,
    idFactory: (prefix) => `${prefix}_${tick}`,
  });

  // 写入远超配额的多会话(每条含长消息 + 大上下文快照), 全程不得抛错。
  assert.doesNotThrow(() => {
    for (let i = 0; i < 6; i += 1) {
      const conversation = store.create({ title: `会话${i}`, projectId: "p" });
      store.appendMessage(conversation.id, { role: "user", content: "x".repeat(160) });
      store.attachContextSnapshot(conversation.id, {
        messageId: "m",
        context: { blob: "y".repeat(500) },
      });
    }
  });

  // 仍可用, 且持久化体积已被裁剪到配额内(或为空), 不再反复触发报错。
  assert.ok(Array.isArray(store.list()));
  const raw = storage.getItem("huanying.canvasAgent.conversations.v1");
  assert.ok(raw === null || raw.length <= LIMIT, "persisted payload must fit the quota or be cleared");
});

test("assistantConversationStore: records messages, context snapshots, transactions, receipts, and generation tasks", () => {
  let next = 0;
  const store = createAssistantConversationStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_${++next}`,
  });
  const conversation = store.create({ title: "story" });

  store.appendMessage(conversation.id, { role: "user", content: "做一个剧情短片" });
  store.appendMessage(conversation.id, {
    role: "assistant",
    content: "准备生成视频节点",
    cards: [{ id: "card-video", status: "needs_confirmation", actions: [{ type: "create_node" }] }],
  });
  store.attachContextSnapshot(conversation.id, { context: { canvas: { nodeCount: 2 } } });
  store.appendTransaction(conversation.id, {
    actions: [{ type: "create_node", nodeType: "ai-text" }],
  });
  store.appendReceipt(conversation.id, { success: true, summary: "applied" });
  store.appendGenerationTask(conversation.id, {
    nodeId: "node-1",
    provider: "custom_ai",
    model: "image-model",
    prompt: "cinematic shot",
  });

  const saved = store.get(conversation.id);
  assert.equal(saved.messages[0].content, "做一个剧情短片");
  assert.equal(saved.messages[1].cards[0].id, "card-video");
  assert.equal(saved.contextSnapshots[0].context.canvas.nodeCount, 2);
  assert.equal(saved.transactions[0].actions[0].type, "create_node");
  assert.equal(saved.receipts[0].summary, "applied");
  assert.equal(saved.generationTasks[0].nodeId, "node-1");
});

test("assistantConversationStore: updates a persisted message card by id", () => {
  const store = createAssistantConversationStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_1`,
  });
  const conversation = store.create({ title: "clarify" });
  store.appendMessage(conversation.id, {
    role: "assistant",
    content: "请选择任务",
    cards: [
      {
        id: "execution_clarify_1",
        type: "execution_control_clarification",
        status: "needs_clarification",
      },
    ],
  });

  const updated = store.updateMessageCard(conversation.id, "execution_clarify_1", {
    status: "completed",
    selectedTarget: "active",
    summary: "已选择当前任务，正在执行对应操作。",
  });

  assert.equal(updated.messages[0].cards[0].status, "completed");
  assert.equal(updated.messages[0].cards[0].selectedTarget, "active");
  assert.equal(store.get(conversation.id).messages[0].cards[0].summary, "已选择当前任务，正在执行对应操作。");
});

test("assistantConversationStore: stores pending transactions with selection validation and receipt", () => {
  const store = createAssistantConversationStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_1`,
  });
  const conversation = store.create({ title: "workflow" });

  store.appendTransaction(conversation.id, {
    id: "tx1",
    messageId: "msg1",
    status: "pending",
    actions: [
      { type: "focus_nodes", nodeIds: ["n1"] },
      { type: "layout_nodes", nodeIds: ["n1"], layout: "single_chain" },
    ],
    selectedActionIndexes: [0],
    validation: { valid: true },
    receipt: { success: true, summary: "ready" },
  });

  const restored = store.get(conversation.id);

  assert.deepEqual(restored.transactions[0].selectedActionIndexes, [0]);
  assert.deepEqual(restored.transactions[0].validation, { valid: true });
  assert.deepEqual(restored.transactions[0].receipt, { success: true, summary: "ready" });
  assert.equal(restored.transactions[0].status, "pending");
});

test("assistantConversationStore: searches and exports without mutating internal state", () => {
  const store = createAssistantConversationStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 6)}`,
  });
  const first = store.create({ title: "爆款实验室" });
  const second = store.create({ title: "海报设计" });
  store.appendMessage(second.id, { role: "user", content: "小红书封面" });

  assert.deepEqual(store.search("小红书").map((item) => item.id), [second.id]);
  const exported = store.export(first.id);
  exported.conversation.title = "mutated";
  assert.equal(store.get(first.id).title, "爆款实验室");
});

test("assistantConversationStore: can sync create and append operations through remote API", async () => {
  const calls = [];
  const store = createAssistantConversationStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_local`,
    api: {
      async createConversation(payload) {
        calls.push(["createConversation", payload]);
        return {
          success: true,
          conversation: {
            id: "conv_remote",
            title: "Remote conversation",
            workspaceId: payload.workspaceId,
            canvasId: payload.canvasId,
            messages: [],
            receipts: [],
          },
        };
      },
      async appendConversationMessage(id, message) {
        calls.push(["appendConversationMessage", id, message]);
        return { success: true };
      },
      async appendConversationReceipt(id, receipt) {
        calls.push(["appendConversationReceipt", id, receipt]);
        return { success: true };
      },
    },
  });

  const conversation = await store.ensureConversation({
    workspaceId: "ws_1",
    canvasId: "canvas_1",
  });
  await store.syncMessage(conversation.id, { role: "user", content: "hello" });
  await store.syncReceipt(conversation.id, { success: true, summary: "Applied" });

  assert.equal(conversation.id, "conv_remote");
  assert.equal(store.get("conv_remote").workspaceId, "ws_1");
  assert.deepEqual(calls.map((call) => call[0]), [
    "createConversation",
    "appendConversationMessage",
    "appendConversationReceipt",
  ]);
});

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

test("assistantConversationStore: sanitizes restored generation tasks before list and export", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "huanying.canvasAgent.conversations.v1",
    JSON.stringify({
      version: 1,
      conversations: [
        {
          id: "conv-restored",
          title: "Restored",
          generationTasks: [
            {
              id: "gen-restored",
              nodeId: "image-1",
              status: "queued",
              provider: "pi_canvas_agent",
              model: "gpt-image",
              prompt: "safe prompt",
              apiKey: "must-not-leak",
              headers: { authorization: "Bearer must-not-leak" },
              references: [{
                id: "ref-1",
                apiKey: "must-not-leak",
                previewUrl: "https://example.test/asset.png?token=must-not-leak&safe=1",
                localPath: "D:\\private\\asset.png",
              }],
            },
          ],
        },
      ],
    })
  );

  const store = createAssistantConversationStore({ storage });
  const listed = store.list();
  const exported = store.export("conv-restored");
  const serialized = JSON.stringify({ listed, exported });

  assert.equal(listed[0].generationTasks[0].id, "gen-restored");
  assert.equal(exported.conversation.generationTasks[0].prompt, "safe prompt");
  assert.doesNotMatch(serialized, /must-not-leak|apiKey|authorization|headers|localPath|D:\\private|token=/);
});

test("assistantConversationStore: imports remote project conversations without cross-project overwrite", () => {
  const storage = createMemoryStorage();
  const store = createAssistantConversationStore({ storage });

  const imported = store.importConversations([
    {
      id: "conv-project-a",
      title: "Project A",
      projectId: "project-a",
      messages: [{ role: "user", content: "safe" }],
      model: { apiKey: "must-not-leak" },
    },
    {
      id: "conv-project-b",
      title: "Project B",
      projectId: "project-b",
      messages: [],
    },
  ], { projectId: "project-a" });
  const serialized = JSON.stringify(store.export("conv-project-a"));

  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped, 1);
  assert.equal(store.get("conv-project-a").projectId, "project-a");
  assert.equal(store.get("conv-project-b"), null);
  assert.doesNotMatch(serialized, /must-not-leak|apiKey/);
});

test("assistantConversationStore: deleting conversation removes skill trace cards", () => {
  const store = createAssistantConversationStore({ storage: createMemoryStorage() });
  const conversation = store.create({ title: "trace" });
  store.appendMessage(conversation.id, {
    role: "assistant",
    content: "已完成",
    cards: [{ type: "skill_trace", traceId: "trace-1", paramsSummary: { promptPreview: "cat" } }],
  });

  store.deleteConversation?.(conversation.id);

  assert.equal(JSON.stringify(store.exportAll?.() || store.list?.() || []).includes("trace-1"), false);
});

test("assistantConversationStore: stores only redacted skill trace summaries", () => {
  const store = createAssistantConversationStore({ storage: createMemoryStorage() });
  const conversation = store.create({ title: "trace" });
  store.appendMessage(conversation.id, {
    role: "assistant",
    content: "已完成",
    cards: [
      {
        type: "skill_trace",
        traceId: "trace-1",
        apiKey: "sk-secret-1234567890",
        headers: { Authorization: "Bearer hidden" },
        paramsSummary: { promptPreview: "cat" },
      },
    ],
  });

  const serialized = JSON.stringify(store.export(conversation.id));

  assert.match(serialized, /trace-1/);
  assert.doesNotMatch(serialized, /sk-secret|Bearer hidden|apiKey|Authorization/);
});
