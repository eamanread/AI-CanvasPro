import assert from "node:assert/strict";
import test from "node:test";

import {
  createAppAssistantPanel,
  createAssistantPanelState,
  formatAssistantPanelReceipt,
  isLowRiskAssistantAction,
  renderMessages,
  resolveGraphNodes,
} from "./appAssistantPanel.js";
import { createAssistantExecutionStore } from "../assistant/assistantExecutionStore.js";

class FakeClassList {
  constructor() {
    this.items = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.items.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }

  contains(name) {
    return this.items.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.items.has(name) : Boolean(force);
    if (enabled) {
      this.items.add(name);
    } else {
      this.items.delete(name);
    }
    return enabled;
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this._textContent = "";
  }

  set className(value) {
    this.classList = new FakeClassList();
    String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => this.classList.add(name));
  }

  get className() {
    return Array.from(this.classList.items).join(" ");
  }

  set id(value) {
    this.attributes.id = String(value || "");
  }

  get id() {
    return this.attributes.id || "";
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return [this._textContent, ...this.children.map((child) => child.textContent || "")]
      .filter(Boolean)
      .join("");
  }

  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = value;
    }
    if (name === "id") {
      this.id = value;
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    const payload = {
      preventDefault() {},
      stopPropagation() {},
      ...event,
      target: event?.target || this,
      currentTarget: this,
    };
    for (const listener of this.listeners.get(payload.type) || []) {
      listener(payload);
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith("#")) {
      return this.id === selector.slice(1);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

function memoryStorage() {
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

function createFakeDocument() {
  const body = new FakeElement("body");
  const head = new FakeElement("head");
  return {
    body,
    head,
    readyState: "complete",
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    getElementById(id) {
      return (
        body.querySelector(`#${id}`) ||
        head.querySelector(`#${id}`) ||
        null
      );
    },
    querySelector(selector) {
      return body.querySelector(selector) || head.querySelector(selector);
    },
    addEventListener() {},
  };
}

test("appAssistantPanel: formats story to video receipt", () => {
  const text = formatAssistantPanelReceipt({
    workflowKind: "story_to_video",
    nodeCount: 6,
    edgeCount: 4,
    generationTaskCount: 3,
    videoRequiresConfirmation: true,
  });

  assert.match(text, /Story to video workflow/);
  assert.match(text, /6 nodes/);
  assert.match(text, /4 edges/);
  assert.match(text, /3 text\/image generation tasks/);
  assert.match(text, /Video generation requires confirmation/);
});

test("appAssistantPanel: formats one-sentence workflow receipts", () => {
  const text = formatAssistantPanelReceipt({
    workflowKind: "image_variants",
    nodeCount: 4,
    edgeCount: 3,
    generationTaskCount: 3,
  });

  assert.match(text, /Image variants workflow/);
  assert.match(text, /4 nodes/);
  assert.match(text, /3 edges/);
  assert.match(text, /3 text\/image generation tasks/);
  assert.doesNotMatch(text, /Video generation requires confirmation/);

  const videoText = formatAssistantPanelReceipt({
    workflowKind: "text_to_image_video",
    nodeCount: 3,
    edgeCount: 2,
    generationTaskCount: 1,
  });
  assert.match(videoText, /Text to image to video workflow/);
  assert.match(videoText, /Video generation requires confirmation/);
});

test("appAssistantPanel: video prep node is low risk but video queue is not", () => {
  assert.equal(isLowRiskAssistantAction({ type: "create_node", nodeType: "ai-video" }), true);
  assert.equal(
    isLowRiskAssistantAction({
      type: "queue_generation_task",
      nodeType: "ai-video",
      nodeId: "video-1",
    }),
    false
  );
});

test("createAppAssistantPanel: mounts a bottom-right assistant panel and toggles open", () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
  });

  panel.init();

  assert.equal(document.body.querySelector(".hy-canvas-agent-assistant"), panel.root);
  assert.equal(panel.root.classList.contains("is-collapsed"), true);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-panel").hidden, true);

  panel.root.querySelector(".hy-canvas-agent-launcher").click();

  assert.equal(panel.root.classList.contains("is-open"), true);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-panel").hidden, false);
  assert.match(panel.root.querySelector(".hy-canvas-agent-title").textContent, /幻映AI导演/);
});

test("createAppAssistantPanel: can reuse the existing fab button as the assistant launcher", () => {
  const document = createFakeDocument();
  const fab = document.createElement("button");
  fab.id = "fabBtn";
  fab.className = "fab-btn";
  document.body.appendChild(fab);

  const panel = createAppAssistantPanel({
    document,
    launcherElement: fab,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
  });

  panel.init();

  assert.equal(panel.root.querySelector(".hy-canvas-agent-launcher"), null);
  assert.equal(fab.classList.contains("hy-canvas-agent-fab-bound"), true);
  assert.match(fab.textContent, /RH/);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-panel").hidden, true);

  fab.click();

  assert.equal(panel.root.classList.contains("is-open"), true);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-panel").hidden, false);
  assert.equal(fab.classList.contains("is-assistant-open"), true);
});

test("createAppAssistantPanel: renders the Huanying reference start screen and unsupported affordances", () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    userName: "user_vgx5kfkl",
    sessionLabel: "sess-205...542850",
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();

  assert.match(panel.root.querySelector(".hy-canvas-agent-title").textContent, /幻映AI导演/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-session").textContent, /sess-205\.\.\.542850/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-hero").textContent, /Hi user_vgx5kfkl!/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-hero").textContent, /今天一起创作点什么？/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-skill-list").textContent, /电商套图/);
  // Slice 7: 爆款实验室 retired — the start screen surfaces 拍法 (or the legacy
  // skills as fallback when the roster isn't loaded), never 爆款实验室.
  assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-skill-list").textContent, /爆款实验室/);
  assert.equal(
    panel.root.querySelector(".hy-canvas-agent-upload").getAttribute("data-requires-backend"),
    "assistant-attachments"
  );
  assert.equal(
    panel.root.querySelector(".hy-canvas-agent-mention").getAttribute("data-requires-backend"),
    "mention-resolver"
  );
  assert.equal(
    panel.root.querySelector(".hy-canvas-agent-input").placeholder,
    "先上传参考图，再用 @ 引用，输入你的想法。"
  );
  assert.match(panel.root.querySelector(".hy-canvas-agent-compose-toolbar").textContent, /Agent/);
  assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-compose-toolbar").textContent, /AUTO/);
  // Slice 7: the toolbar entry 爆款实验室 was replaced by the 拍法库 picker.
  assert.match(panel.root.querySelector(".hy-canvas-agent-compose-toolbar").textContent, /拍法库/);
});

test("createAppAssistantPanel: sends a prompt and auto-applies structural actions with a receipt", async () => {
  const document = createFakeDocument();
  const calls = [];
  const graphStore = { nodes: [] };
  const actions = [{ type: "focus_nodes", nodeIds: ["draft-node"] }];
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    buildContext: () => ({ canvas: { nodeCount: 0 } }),
    summarizeActions: () => ({ description: "Focus draft node" }),
    api: {
      async chat(payload) {
        calls.push({ type: "chat", payload });
        return { reply: "I prepared a node.", actions };
      },
      async validateActions(payload) {
        calls.push({ type: "validate", payload });
        return { success: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      calls.push({ type: "execute", payload });
      return { appliedCount: 1 };
    },
  });
  panel.init();
  panel.open();

  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = " diagnose canvas ";
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();

  assert.deepEqual(calls[0], {
    type: "chat",
    payload: {
      message: "diagnose canvas",
      context: { canvas: { nodeCount: 0 } },
      mode: "actions",
    },
  });
  assert.match(panel.root.querySelector(".hy-canvas-agent-messages").textContent, /I prepared/);
  assert.equal(calls.at(-1).type, "execute");
  assert.match(panel.state.lastReceipt, /applied|应用|搴旂敤/i);
  assert.equal(panel.state.pendingActions.length, 0);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-receipt").hidden, true);
});

test("renderMessages: streaming content updates the assistant node in place (no rebuild)", () => {
  // 状态层 typeIntoAssistantMessage 逐字增长内容并每步 render; renderMessages 须就地更新文本、
  // 复用同一 DOM 节点(不全量重建)→ 流式不闪烁、保滚动。
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");

  renderMessages(document, messagesEl, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "你" },
  ], {});
  const firstAssistantText = messagesEl.__hyMsgNodes[1].textEl;
  assert.equal(firstAssistantText.textContent, "你");

  // 内容增长(流式) → 同一节点就地更新
  renderMessages(document, messagesEl, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "你好世界" },
  ], { streaming: true });
  const grownAssistantText = messagesEl.__hyMsgNodes[1].textEl;
  assert.equal(grownAssistantText, firstAssistantText, "assistant text node reused in place");
  assert.equal(grownAssistantText.textContent, "你好世界");
  assert.equal(messagesEl.__hyMsgNodes.length, 2, "no extra nodes created");
  assert.ok(grownAssistantText.classList.contains("is-typing"), "streaming marks the caret");

  // 流式结束(streaming=false) → 去掉打字光标, 末尾追加新消息复用前缀
  renderMessages(document, messagesEl, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "你好世界" },
    { role: "user", content: "再来一句" },
  ], {});
  assert.equal(messagesEl.__hyMsgNodes[1].textEl, firstAssistantText, "prefix nodes preserved on append");
  assert.equal(messagesEl.__hyMsgNodes[1].textEl.classList.contains("is-typing"), false, "caret cleared after streaming");
  assert.equal(messagesEl.__hyMsgNodes.length, 3);

  // 角色错位(会话切换)→ 全量重建
  renderMessages(document, messagesEl, [{ role: "assistant", content: "新会话首条" }], {});
  assert.equal(messagesEl.__hyMsgNodes.length, 1);
  assert.equal(messagesEl.__hyMsgNodes[0].textEl.textContent, "新会话首条");
});

test("D4: renderMessages paints the paused card's steps + 继续/取消 chips; clicking dispatches the bound command", () => {
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");
  const dispatched = [];
  const pausedCard = {
    id: "vimax-F-paused", type: "canvas_actions", status: "paused", pausedReason: "wait-cast-edit",
    title: "导演规划 · 已暂停", summary: "已暂停", expanded: true,
    steps: [
      { stage: "story", status: "landed" },
      { stage: "cast", status: "landed" },
      { stage: "storyboard", status: "pending" },
    ],
    options: [
      { id: "resume", label: "继续", command: "继续", aria: "继续分镜" },
      { id: "cancel", label: "取消", command: "取消", aria: "取消导演规划" },
    ],
  };
  renderMessages(document, messagesEl, [{ role: "assistant", content: "已暂停", cards: [pausedCard] }], {
    onCardOption: (card, option) => dispatched.push(option.command),
  });

  assert.equal(messagesEl.querySelectorAll(".hy-canvas-agent-card-step").length, 3, "three step rows rendered");
  const options = messagesEl.querySelectorAll(".hy-canvas-agent-card-option");
  assert.equal(options.length, 2, "继续 + 取消 chips rendered");
  const labels = options.map((b) => b.textContent);
  assert.ok(labels.includes("继续") && labels.includes("取消"), "chip labels present");

  options.find((b) => b.getAttribute("data-option-id") === "resume").click();
  assert.deepEqual(dispatched, ["继续"], "clicking 继续 dispatched its bound 继续 command");
});

test("D4: a generation-synced paused card (no pausedReason) still renders its detail, not the living-card chips", () => {
  // refreshSyncedOperationCards can set a canvas_actions card to status:"paused"
  // (a generation node paused) — that card has no pausedReason/steps/options and
  // must keep falling through to the detail <pre>, NOT get swallowed by the D4
  // living-paused branch. Regression guard for the review's WARNING.
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");
  const legacyPaused = {
    id: "op-1", type: "canvas_actions", status: "paused",
    title: "节点", summary: "已暂停", expanded: true, error: "node-1 暂停中",
    steps: [], options: [],
  };
  renderMessages(document, messagesEl, [{ role: "assistant", content: "x", cards: [legacyPaused] }], {});
  assert.ok(
    messagesEl.querySelectorAll(".hy-canvas-agent-card-detail").length >= 1,
    "legacy paused card still renders its detail <pre>"
  );
  assert.equal(
    messagesEl.querySelectorAll(".hy-canvas-agent-card-option").length,
    0,
    "no living-card chips for a generation-synced paused card (no pausedReason)"
  );
});

test("D5: renderMessages paints launch chips (needs_action) and a contract preview", () => {
  const document = createFakeDocument();

  // needs_action: a row of launch chips with data-chip-id; clicking fires onLaunchChip
  const chipEvents = [];
  const chipsEl = document.createElement("div");
  const chipCard = {
    id: "L1", type: "launch", status: "needs_action", title: "创作", summary: "选择启动方式", expanded: true,
    options: [
      { id: "director", label: "导演", costTier: "free", aria: "启动导演规划流程" },
      { id: "film", label: "成片", costTier: "confirm", aria: "启动成片渲染" },
    ],
  };
  renderMessages(document, chipsEl, [{ role: "assistant", content: "建议", cards: [chipCard] }], {
    onLaunchChip: (card, chip) => chipEvents.push(chip.id),
  });
  const summaryRow = chipsEl.querySelector(".hy-canvas-agent-card-summary");
  assert.ok(summaryRow && !summaryRow.textContent.includes("状态未知"), "needs_action summary is not 状态未知");
  assert.ok(summaryRow.textContent.includes("待选择"), "needs_action shows 待选择 status text");
  const chips = chipsEl.querySelectorAll(".hy-canvas-agent-launch-chip");
  assert.equal(chips.length, 2, "two launch chips rendered");
  assert.deepEqual(chips.map((b) => b.getAttribute("data-chip-id")), ["director", "film"]);
  chips.find((b) => b.getAttribute("data-chip-id") === "director").click();
  assert.deepEqual(chipEvents, ["director"], "clicking a chip fires onLaunchChip with its id");

  // preview: contract body (N · cost · flow) + 确认开始/取消
  const previewEvents = [];
  const previewEl = document.createElement("div");
  const previewCard = {
    id: "L2", type: "launch", status: "preview", title: "导演计划", summary: "", expanded: true,
    contract: { mode: "director", nodeCount: 3, cost: { tier: "free" }, flow: ["story", "cast", "PAUSE", "storyboard"], chipId: "director" },
  };
  renderMessages(document, previewEl, [{ role: "assistant", content: "预览", cards: [previewCard] }], {
    onContractConfirm: () => previewEvents.push("confirm"),
    onContractCancel: () => previewEvents.push("cancel"),
  });
  assert.equal(previewEl.querySelectorAll(".hy-canvas-agent-card-contract").length, 1, "contract body rendered");
  assert.ok(previewEl.querySelector(".hy-canvas-agent-contract-confirm"), "确认开始 button present");
  previewEl.querySelector(".hy-canvas-agent-contract-confirm").click();
  assert.deepEqual(previewEvents, ["confirm"], "确认开始 fires onContractConfirm");
});

test("D7: a running film launch card shows the updated shot-count cost row with a 已更新 badge", () => {
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");
  const runningCard = {
    id: "Lf", type: "launch", status: "running", title: "成片计划", summary: "", expanded: false,
    contract: { mode: "film", cost: { tier: "confirm", drawCount: 2, estimated: false }, updated: true, chipId: "film" },
  };
  renderMessages(document, messagesEl, [{ role: "assistant", content: "成片中", cards: [runningCard] }], {});
  const costRow = messagesEl.querySelector(".hy-canvas-agent-contract-cost");
  assert.ok(costRow, "cost row rendered on the running launch card");
  assert.ok(costRow.textContent.includes("2"), "shows the real shot count (2)");
  assert.ok(!costRow.textContent.includes("约"), "no longer shows 约 (estimate replaced)");
  assert.ok(messagesEl.querySelector(".hy-canvas-agent-cost-updated-badge"), "已更新 badge present");
});

test("renderMessages: assistant reply gets copy/认同/不认同, user message gets copy only", () => {
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");
  const copied = [];
  renderMessages(document, messagesEl, [
    { role: "user", content: "用户消息" },
    { role: "assistant", content: "助手回复" },
  ], {
    onCopy: (message) => copied.push(String(message.content || "")),
    onFeedback: (message, type, up, down) => {
      message.feedback = message.feedback === type ? null : type;
      up.classList.toggle("is-active", message.feedback === "up");
      down.classList.toggle("is-active", message.feedback === "down");
    },
  });
  const userActions = messagesEl.__hyMsgNodes[0].actionsEl;
  const assistantActions = messagesEl.__hyMsgNodes[1].actionsEl;
  // 用户消息: 仅复制
  assert.equal(userActions.querySelectorAll(".hy-canvas-agent-msg-act").length, 1);
  assert.ok(userActions.querySelector(".hy-msg-copy"));
  assert.equal(userActions.querySelector(".hy-msg-up"), null);
  // 助手回复: 复制 + 认同 + 不认同
  assert.equal(assistantActions.querySelectorAll(".hy-canvas-agent-msg-act").length, 3);
  assert.ok(assistantActions.querySelector(".hy-msg-copy"));
  assert.ok(assistantActions.querySelector(".hy-msg-up"));
  assert.ok(assistantActions.querySelector(".hy-msg-down"));

  // 复制触发 onCopy(消息原文)
  assistantActions.querySelector(".hy-msg-copy").click();
  assert.deepEqual(copied, ["助手回复"]);

  // 认同/不认同互斥, 再次点击取消
  const up = assistantActions.querySelector(".hy-msg-up");
  const down = assistantActions.querySelector(".hy-msg-down");
  up.click();
  assert.ok(up.classList.contains("is-active"));
  assert.equal(down.classList.contains("is-active"), false);
  down.click();
  assert.equal(up.classList.contains("is-active"), false);
  assert.ok(down.classList.contains("is-active"));
  down.click();
  assert.equal(down.classList.contains("is-active"), false);
});

test("renderMessages: action bar hidden while a message is streaming", () => {
  const document = createFakeDocument();
  const messagesEl = document.createElement("div");
  // 流式中(streaming): 最后一条(助手)正在打字 → 隐藏动作条
  renderMessages(document, messagesEl, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "正在生成" },
  ], { streaming: true });
  assert.equal(messagesEl.__hyMsgNodes[1].actionsEl.hidden, true, "streaming message hides actions");
  // 用户消息(非流式)动作条照常显示
  assert.equal(messagesEl.__hyMsgNodes[0].actionsEl.hidden, false);
  // 流式结束 → 动作条出现
  renderMessages(document, messagesEl, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "生成完成的完整回复" },
  ], { streaming: false });
  assert.equal(messagesEl.__hyMsgNodes[1].actionsEl.hidden, false, "actions appear when streaming ends");
});

test("createAppAssistantPanel: skill click sends assistantIntent with chat request", async () => {
  const document = createFakeDocument();
  const calls = [];
  const panel = createAppAssistantPanel({
    document,
    buildContext: () => ({ canvas: { nodeCount: 2 } }),
    api: {
      async chat(payload) {
        calls.push(payload);
        return { reply: "Intent received.", actions: [] };
      },
    },
  });
  panel.init();
  panel.open();

  panel.root.querySelectorAll(".hy-canvas-agent-skill")[0].click();
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].assistantIntent, {
    id: "commerce_pack",
    title: "电商套图",
    source: "rh_skill",
  });
  assert.deepEqual(calls[0].context.assistantIntent, calls[0].assistantIntent);
});

test("createAppAssistantPanel: pure text replies do not show an empty action preview", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "No actions needed.", actions: [] };
      },
    },
  });
  panel.init();
  panel.open();

  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "status only";
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();

  assert.match(panel.root.querySelector(".hy-canvas-agent-messages").textContent, /No actions needed/);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-preview").hidden, true);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-apply").hidden, true);
});

test("createAssistantPanelState: sendMessage sends trimmed message, context, and actions mode to API", async () => {
  const graphStore = { nodes: [{ id: "node-1" }] };
  const context = { selectedNodeIds: ["node-1"] };
  const calls = [];
  const state = createAssistantPanelState({
    graphStore,
    buildContext({ graphStore: receivedGraphStore }) {
      calls.push({ type: "buildContext", graphStore: receivedGraphStore });
      return context;
    },
    api: {
      async chat(payload) {
        calls.push({ type: "chat", payload });
        return { reply: "Received", actions: [] };
      },
    },
  });

  await state.sendMessage("  Check canvas  ");

  assert.deepEqual(calls, [
    { type: "buildContext", graphStore },
    {
      type: "chat",
      payload: { message: "Check canvas", context, mode: "actions" },
    },
  ]);
  assert.deepEqual(state.messages, [
    { role: "user", content: "Check canvas" },
    { role: "assistant", content: "Received" },
  ]);
});

test("createAssistantPanelState: selected assistantIntent is included in request and context", async () => {
  const calls = [];
  const state = createAssistantPanelState({
    buildContext: () => ({ canvas: { nodeCount: 1 } }),
    api: {
      async chat(payload) {
        calls.push(payload);
        return { reply: "ok", actions: [] };
      },
    },
  });
  state.setAssistantIntent({
    id: "poster_design",
    title: "海报设计",
    source: "rh_skill",
    ignored: "not part of contract",
  });

  await state.sendMessage("plan poster");

  assert.deepEqual(calls[0], {
    message: "plan poster",
    context: {
      canvas: { nodeCount: 1 },
      assistantIntent: {
        id: "poster_design",
        title: "海报设计",
        source: "rh_skill",
      },
    },
    mode: "actions",
    assistantIntent: {
      id: "poster_design",
      title: "海报设计",
      source: "rh_skill",
    },
  });
});

test("createAssistantPanelState: same conversation sends recent memory and pending action summary", async () => {
  const calls = [];
  let responseIndex = 0;
  const state = createAssistantPanelState({
    conversationId: "conv-memory",
    api: {
      async chat(payload) {
        calls.push(payload);
        responseIndex += 1;
        if (responseIndex === 1) {
          return {
            reply: "First answer",
            actions: [{ type: "create_node", nodeId: "node-1", nodeType: "ai-text" }],
          };
        }
        return { reply: "Second answer", actions: [] };
      },
    },
  });

  await state.sendMessage("first question");
  await state.sendMessage("follow up");

  assert.equal(calls[1].conversationId, "conv-memory");
  assert.deepEqual(
    calls[1].context.conversationMemory.recentMessages.map((message) => `${message.role}:${message.content}`),
    ["user:first question", "assistant:First answer", "user:follow up"]
  );
  assert.deepEqual(calls[1].context.conversationMemory.pendingActions, [
    { type: "create_node", nodeId: "node-1", nodeType: "ai-text" },
  ]);
});

test("createAssistantPanelState: response actions enter pendingActions", async () => {
  const actions = [{ type: "create_node", id: "draft-node", data: { text: "original" } }];
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { actions };
      },
    },
  });

  await state.sendMessage("Check canvas");
  actions[0].id = "mutated-after-response";
  actions[0].data.text = "nested mutation";

  assert.deepEqual(state.pendingActions, [
    { type: "create_node", id: "draft-node", data: { text: "original" } },
  ]);
});

test("createAssistantPanelState: v2 response creates a project execution record", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fallback`,
  });
  const state = createAssistantPanelState({
    conversationId: "conv-v2",
    executionStore,
    api: {
      async chat() {
        return {
          reply: "Plan ready.",
          intent: { id: "intent-layout", matchedSkills: ["canvas_layout"] },
          plan: {
            id: "plan-layout",
            title: "整理画布",
            steps: [{ id: "step-layout", title: "排列节点", status: "pending" }],
          },
          actionsByStep: {
            "step-layout": [{ type: "layout_nodes", nodeIds: ["node-1"] }],
          },
          execution: {
            id: "exec-layout",
            status: "draft",
            drawerState: {
              visible: true,
              expanded: false,
              line1: "整理画布 0/1",
              line2: "等待确认计划",
            },
          },
          developer: {
            apiKey: "sk-secret",
            actionJson: { type: "layout_nodes", nodeIds: ["node-1"] },
          },
          actions: [{ type: "layout_nodes", nodeIds: ["node-1"] }],
        };
      },
    },
  });

  await state.sendMessage("整理画布");

  const stored = executionStore.getExecution("exec-layout");
  assert.equal(stored.conversationId, "conv-v2");
  assert.equal(stored.intentId, "intent-layout");
  assert.equal(stored.planId, "plan-layout");
  assert.equal(stored.title, "整理画布");
  assert.equal(stored.status, "draft");
  assert.equal(stored.drawerState.line1, "整理画布 0/1");
  assert.deepEqual(stored.actionsByStep["step-layout"], [{ type: "layout_nodes", nodeIds: ["node-1"] }]);
  assert.equal(stored.timeline[0].status, "draft");
  assert.equal(stored.timeline[0].developer.apiKey, undefined);
  assert.deepEqual(stored.timeline[0].developer.actionJson, { type: "layout_nodes", nodeIds: ["node-1"] });
});

test("createAssistantPanelState: v2 response is queued while another execution is active", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "正在执行的任务",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "正在执行的任务 1/3",
      line2: "正在处理第一步",
    },
  });
  const state = createAssistantPanelState({
    conversationId: "conv-queue",
    executionStore,
    api: {
      async chat() {
        return {
          reply: "New plan queued.",
          intent: { id: "intent-queued" },
          plan: {
            id: "plan-queued",
            title: "排队整理画布",
            steps: [{ id: "step-queued", title: "整理节点" }],
          },
          actionsByStep: {
            "step-queued": [{ type: "layout_nodes", nodeIds: ["node-2"] }],
          },
          execution: {
            id: "exec-queued",
            status: "draft",
            drawerState: {
              visible: true,
              line1: "排队整理画布 0/1",
              line2: "等待前一个任务完成",
            },
          },
        };
      },
    },
  });

  await state.sendMessage("再整理一个画布");

  const snapshot = executionStore.snapshot();
  const queued = executionStore.getExecution("exec-queued");
  assert.equal(snapshot.activeExecutionId, "exec-active");
  assert.deepEqual(snapshot.queue.map((item) => item.id), ["exec-queued"]);
  assert.equal(queued.status, "queued_draft");
  assert.equal(queued.queueIndex, 1);
  assert.equal(queued.drawerState.visible, false);
  assert.equal(queued.drawerState.line2, "等待前一个任务完成");
});

test("createAssistantPanelState: v2 response syncs execution and initial timeline to backend client", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}-fallback`,
  });
  const synced = [];
  const state = createAssistantPanelState({
    conversationId: "conv-sync",
    executionStore,
    executionSyncClient: {
      async upsertExecution(execution) {
        synced.push(["upsert", execution]);
        return { success: true, execution };
      },
      async appendTimelineEvent(id, event) {
        synced.push(["timeline", id, event]);
        return { success: true };
      },
    },
    api: {
      async chat() {
        return {
          reply: "Plan ready.",
          intent: { id: "intent-sync" },
          plan: {
            id: "plan-sync",
            title: "同步执行记录",
            steps: [{ id: "step-sync", title: "写入后端", status: "pending" }],
          },
          actionsByStep: {
            "step-sync": [{ type: "layout_nodes", nodeIds: ["node-1"] }],
          },
          execution: {
            id: "exec-sync",
            projectId: "project-panel",
            status: "draft",
            drawerState: { visible: true, line1: "同步执行记录 0/1", line2: "等待确认计划" },
          },
          developer: {
            apiKey: "sk-secret",
            actionJson: { type: "layout_nodes", nodeIds: ["node-1"] },
          },
        };
      },
    },
  });

  await state.sendMessage("同步执行记录");
  await state.lastExecutionSyncPromise;

  assert.equal(synced.length, 2);
  assert.equal(synced[0][0], "upsert");
  assert.equal(synced[0][1].id, "exec-sync");
  assert.equal(synced[0][1].developer, undefined);
  assert.deepEqual(synced[0][1].timeline, []);
  assert.equal(synced[1][0], "timeline");
  assert.equal(synced[1][1], "exec-sync");
  assert.equal(synced[1][2].developer.apiKey, undefined);
  assert.deepEqual(synced[1][2].developer.actionJson, { type: "layout_nodes", nodeIds: ["node-1"] });
});

test("createAssistantPanelState: backend execution sync failure keeps local execution available", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const state = createAssistantPanelState({
    conversationId: "conv-sync-fallback",
    executionStore,
    executionSyncClient: {
      async upsertExecution() {
        throw new Error("backend unavailable");
      },
      async appendTimelineEvent() {
        throw new Error("backend unavailable");
      },
    },
    api: {
      async chat() {
        return {
          reply: "Local record remains.",
          intent: { id: "intent-local" },
          plan: { id: "plan-local", title: "本地记录", steps: [{ id: "step-local", title: "写本地" }] },
          execution: { id: "exec-local", status: "draft", drawerState: { visible: true } },
        };
      },
    },
  });

  await state.sendMessage("本地记录");
  await state.lastExecutionSyncPromise;

  const stored = executionStore.getExecution("exec-local");
  assert.equal(stored.id, "exec-local");
  assert.equal(stored.timeline.length, 1);
  assert.equal(state.lastExecutionSyncError, "backend unavailable");
});

test("createAppAssistantPanel: init loads backend execution history into the drawer", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const calls = [];
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: {
      async listExecutions(filters) {
        calls.push(filters);
        return {
          success: true,
          executions: [
            {
              id: "exec-history",
              projectId: "project-panel",
              title: "Backend execution",
              status: "executing",
              drawerState: {
                visible: true,
                line1: "Backend execution 1/2",
                line2: "Loaded from backend",
              },
              plan: { steps: [{ id: "step-history", title: "History step" }] },
              timeline: [{ id: "evt-history", humanSummary: "History timeline event" }],
            },
          ],
        };
      },
    },
  });

  panel.init();
  await panel.flush();

  assert.deepEqual(calls, [{ projectId: "project-panel" }]);
  assert.equal(executionStore.getExecution("exec-history").title, "Backend execution");
  assert.equal(executionStore.getExecution("exec-history").status, "paused");
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.ok(drawer);
  assert.equal(drawer.hidden, false);
  assert.match(drawer.textContent, /Backend execution 1\/2/);
  assert.match(drawer.textContent, /重启后已暂停/);
});

test("createAppAssistantPanel: backend execution history load failure keeps local drawer available", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-local",
    title: "Local execution",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Local execution",
      line2: "Still available",
    },
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: {
      async listExecutions() {
        throw new Error("history unavailable");
      },
    },
  });

  panel.init();
  await panel.flush();

  assert.equal(panel.state.lastExecutionSyncError, "history unavailable");
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.ok(drawer);
  assert.equal(drawer.hidden, false);
  assert.match(drawer.textContent, /Local execution/);
  assert.match(drawer.textContent, /Still available/);
});

test("createAssistantPanelState: plan single ordinary node creates card and auto applies", async () => {
  const executions = [];
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return {
          reply: "I prepared a text node.",
          actions: [{ type: "create_node", node: { id: "text-1", type: "text" } }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: 1 };
    },
  });

  await state.sendMessage("make text");

  assert.equal(executions.length, 1);
  assert.equal(state.pendingActions.length, 0);
  assert.equal(state.messages[1].cards.length, 1);
  assert.equal(state.messages[1].cards[0].status, "completed");
  assert.equal(state.messages[1].cards[0].requiresConfirmation, false);
});

test("createAssistantPanelState: act single AI image generation card auto applies through canvas runtime", async () => {
  const executions = [];
  const canvasSkillsRuntime = {
    async executeActions() {
      throw new Error("runtime is passed to executor, not called by panel state");
    },
  };
  const state = createAssistantPanelState({
    graphStore: { nodes: [] },
    canvasSkillsRuntime,
    agentMode: "act",
    api: {
      async chat() {
        return {
          reply: "I will generate an image.",
          actions: [
            { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" },
            { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "cat" },
          ],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length, createdNodeIds: ["ai-image-1"] };
    },
  });

  await state.sendMessage("generate one cat image");

  assert.equal(executions.length, 1);
  assert.equal(executions[0].canvasSkillsRuntime, canvasSkillsRuntime);
  assert.equal(executions[0].agentMode, "act");
  assert.equal(state.pendingActions.length, 0);
  assert.equal(state.messages[1].cards[0].requiresConfirmation, false);
  assert.equal(state.messages[1].cards[0].status, "completed");
});

test("createAssistantPanelState: generation card follows canvas node status changes", async () => {
  let listener = null;
  const nodes = [{ id: "image-1", type: "ai-image", data: { generationStatus: "running", isGenerating: true } }];
  const graphStore = {
    nodes,
    getState() {
      return { nodes };
    },
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore,
    api: {
      async chat() {
        return {
          reply: "I will generate.",
          actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions() {
      return {
        appliedCount: 1,
        queuedGenerationNodeIds: ["image-1"],
        startedGenerationNodeIds: ["image-1"],
      };
    },
  });

  await state.sendMessage("generate cat");
  const card = state.messages[1].cards[0];
  assert.equal(card.status, "generating");

  nodes[0].data = { ...nodes[0].data, generationStatus: "completed", isGenerating: false };
  listener?.();
  state.refreshOperationCards();

  assert.equal(state.messages[1].cards[0].status, "completed");
});

test("createAssistantPanelState: generation card items mirror canvas node details", async () => {
  let listener = null;
  const nodes = [
    {
      id: "image-1",
      type: "ai-image",
      name: "Cat draft",
      data: {
        generationStatus: "running",
        isGenerating: true,
        prompt: "make a cat portrait",
        modelName: "Model A",
        batchSize: 2,
        aspectRatio: "1:1",
        taskId: "task-1",
      },
    },
  ];
  const graphStore = {
    nodes,
    getState() {
      return { nodes };
    },
    subscribe(callback) {
      listener = callback;
      return () => {};
    },
  };
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore,
    api: {
      async chat() {
        return {
          reply: "I will generate.",
          actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions() {
      return {
        appliedCount: 1,
        queuedGenerationNodeIds: ["image-1"],
        startedGenerationNodeIds: ["image-1"],
      };
    },
  });

  await state.sendMessage("generate cat");
  assert.equal(state.messages[1].cards[0].items[0].modelDisplayName, "Model A");
  assert.equal(state.messages[1].cards[0].items[0].taskId, "task-1");

  nodes[0].data = {
    ...nodes[0].data,
    generationStatus: "completed",
    isGenerating: false,
    images: [{ url: "/outputs/cat.png" }],
  };
  listener?.();
  state.refreshOperationCards();

  const item = state.messages[1].cards[0].items[0];
  assert.equal(state.messages[1].cards[0].status, "completed");
  assert.equal(item.status, "completed");
  assert.equal(item.resultPreviewUrl, "/outputs/cat.png");
});

test("createAssistantPanelState: canvas skill traces fold into one operation card", async () => {
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore: { nodes: [] },
    api: {
      async chat() {
        return {
          reply: "OK",
          actions: [
            { id: "image", type: "create_node", nodeType: "ai-image", prompt: "cat" },
            { type: "queue_generation_task", nodeId: "image", nodeType: "ai-image", prompt: "cat" },
          ],
          warnings: [],
        };
      },
      async validateActions({ actions }) {
        return { success: true, actions };
      },
    },
    async executeActions() {
      return {
        appliedCount: 1,
        queuedGenerationNodeIds: ["image-1"],
        startedGenerationNodeIds: ["image-1"],
        canvasSkillReceipts: [{ skillId: "imageNode.createDraft", nodeId: "image-1", ok: true }],
        skillTraceCards: [{ type: "skill_trace", title: "imageNode.createDraft", detail: "raw" }],
      };
    },
  });

  await state.sendMessage("generate cat image");

  const cards = state.messages.find((message) => message.role === "assistant").cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "canvas_actions");
  assert.equal(cards[0].executionDetails.traces.length, 1);
});

test("createAssistantPanelState: stream final-only reply uses typewriter fallback", async () => {
  const snapshots = [];
  let state;
  state = createAssistantPanelState({
    graphStore: { nodes: [] },
    api: {
      async chatStream(_request, { onEvent }) {
        onEvent({ type: "message.done", reply: "final complete reply" });
        return { reply: "final complete reply", actions: [], warnings: [] };
      },
    },
    typingChunkSize: 1,
    typingDelayMs: 0,
    typingScheduler: (resolve) => resolve(),
  });
  const options = {
    onUpdate: () => snapshots.push(state.messages.map((message) => message.content).join("|")),
  };

  await state.sendMessage("hello", options);

  assert.ok(snapshots.includes("hello|f"));
  assert.equal(state.messages.at(-1).content, "final complete reply");
});

test("createAssistantPanelState: sendMessage shows thinking placeholder until reply arrives", async () => {
  let resolveChat;
  const chatPromise = new Promise((resolve) => {
    resolveChat = resolve;
  });
  const state = createAssistantPanelState({
    graphStore: { nodes: [] },
    api: {
      chat: () => chatPromise,
    },
    typingChunkSize: 1,
    typingDelayMs: 0,
    typingScheduler: (resolve) => resolve(),
  });

  const pending = state.sendMessage("hello");

  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[0].role, "user");
  assert.equal(state.messages[1].role, "assistant");
  assert.equal(state.messages[1].content, "思考中...");

  resolveChat({ reply: "ready", actions: [], warnings: [] });
  await pending;

  assert.equal(state.messages.filter((message) => message.role === "assistant").length, 1);
  assert.equal(state.messages[1].content, "ready");
});

test("createAssistantPanelState: streamed deltas are locally typewritten instead of appended in one chunk", async () => {
  const snapshots = [];
  const scheduled = [];
  let state;
  state = createAssistantPanelState({
    graphStore: { nodes: [] },
    api: {
      async chatStream(_request, { onEvent }) {
        onEvent({ type: "message.delta", delta: "abcd" });
        onEvent({ type: "message.done", reply: "abcd" });
        return { reply: "abcd", actions: [], warnings: [] };
      },
    },
    typingChunkSize: 1,
    typingDelayMs: 1,
    typingScheduler: (resolve) => scheduled.push(resolve),
  });

  const sendPromise = state.sendMessage("hello", {
    onUpdate: () => snapshots.push(state.messages.map((message) => message.content).join("|")),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(snapshots.includes("hello|a"));
  assert.equal(snapshots.includes("hello|abcd"), false);
  while (scheduled.length) {
    scheduled.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await sendPromise;

  assert.equal(state.messages.at(-1).content, "abcd");
});

test("createAssistantPanelState: plan video node waits for confirmation card", async () => {
  let executeCount = 0;
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return {
          reply: "I prepared a video generation.",
          actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions() {
      executeCount += 1;
      return { appliedCount: 1 };
    },
  });

  await state.sendMessage("make video");

  assert.equal(executeCount, 0);
  assert.equal(state.pendingActions.length, 1);
  assert.equal(state.messages[1].cards[0].status, "needs_confirmation");
  assert.equal(state.messages[1].cards[0].expanded, true);
});

test("createAssistantPanelState: confirming plan video card applies the pending actions", async () => {
  const executions = [];
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return {
          reply: "I prepared a video generation.",
          actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: 1, createdNodeIds: ["video-1"] };
    },
  });

  await state.sendMessage("make video");
  await state.confirmPendingInteractionCard();

  assert.equal(executions.length, 1);
  assert.equal(state.pendingActions.length, 0);
  assert.equal(state.messages[1].cards[0].status, "completed");
  assert.deepEqual(state.messages[1].cards[0].result.createdNodeIds, ["video-1"]);
});

test("createAssistantPanelState: execution failure updates the pending interaction card", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return {
          reply: "I prepared a text node.",
          actions: [{ type: "create_node", node: { id: "text-1", type: "text" } }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions() {
      throw new Error("executor offline");
    },
  });

  await state.sendMessage("make text");

  assert.equal(state.messages[1].cards[0].status, "failed");
  assert.match(state.messages[1].cards[0].error, /executor offline/);
});

test("createAssistantPanelState: cancelling plan card clears pending actions and preserves history", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return {
          reply: "I prepared a video node.",
          actions: [{ type: "create_node", node: { id: "video-1", type: "video" } }],
        };
      },
    },
  });

  await state.sendMessage("make video");
  const card = state.cancelPendingInteractionCard();

  assert.equal(state.pendingActions.length, 0);
  assert.equal(card.status, "cancelled");
  assert.equal(state.messages[1].cards[0].status, "cancelled");
});

test("createAssistantPanelState: act multi-node card has no confirmation and auto applies", async () => {
  const executions = [];
  const state = createAssistantPanelState({
    agentMode: "act",
    api: {
      async chat() {
        return {
          reply: "Act will create nodes.",
          actions: [
            { type: "create_node", node: { id: "text-1", type: "text" } },
            { type: "create_node", node: { id: "video-1", type: "video" } },
          ],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length };
    },
  });

  await state.sendMessage("act create nodes");

  assert.equal(executions.length, 1);
  assert.equal(state.pendingActions.length, 0);
  assert.equal(state.messages[1].cards[0].agentMode, "act");
  assert.equal(state.messages[1].cards[0].requiresConfirmation, false);
  assert.equal(state.messages[1].cards[0].status, "completed");
});

test("createAssistantPanelState: previewText uses injected summarizer description and title fallback", () => {
  const state = createAssistantPanelState({
    summarizeActions(actions) {
      assert.deepEqual(actions, [{ type: "focus_nodes" }]);
      return { description: "Preview description", title: "Preview title" };
    },
  });
  state.pendingActions = [{ type: "focus_nodes" }];

  assert.equal(state.previewText(), "Preview description");

  state.pendingActions = [];
  const titleOnlyState = createAssistantPanelState({
    summarizeActions() {
      return { title: "Only title" };
    },
  });
  assert.equal(titleOnlyState.previewText(), "Only title");
});

test("createAssistantPanelState: schema invalid does not call executor and records validation failure receipt", async () => {
  let executeCalled = false;
  const actions = [{ type: "create_node", id: "draft-node" }];
  const state = createAssistantPanelState({
    api: {
      async validateActions() {
        return { success: false, error: "bad schema" };
      },
    },
    executeActions() {
      executeCalled = true;
    },
  });
  state.pendingActions = actions;

  const receipt = await state.applyPendingActions();

  assert.equal(executeCalled, false);
  assert.match(receipt, /validation/i);
  assert.match(receipt, /bad schema/);
  assert.equal(state.lastReceipt, receipt);
  assert.deepEqual(state.pendingActions, actions);
});

test("createAssistantPanelState: schema valid calls executor and clears pendingActions", async () => {
  const graphStore = { nodes: [] };
  const actions = [{ type: "create_node", id: "draft-node" }];
  const validatedActions = [{ type: "create_node", id: "safe-node" }];
  const calls = [];
  const state = createAssistantPanelState({
    graphStore,
    api: {
      async validateActions(payload) {
        calls.push({ type: "validate", payload });
        return { success: true, actions: validatedActions };
      },
    },
    async executeActions(payload) {
      calls.push({ type: "execute", payload });
      return { appliedCount: 1 };
    },
  });
  state.pendingActions = actions;

  const receipt = await state.applyPendingActions();

  assert.deepEqual(calls, [
    {
      type: "validate",
      payload: {
        actions: [
          {
            type: "create_node",
            id: "draft-node",
            schemaVersion: "2026-06-03",
            actionId: "draft-node",
            riskLevel: "medium",
            requiresConfirmation: true,
            metadata: {
              conversationId: "",
              messageId: "",
              traceId: "",
              source: "canvas_agent",
            },
          },
        ],
        context: undefined,
      },
    },
    { type: "execute", payload: { actions: validatedActions, graphStore, agentMode: "plan" } },
  ]);
  assert.equal(state.pendingActions.length, 0);
  assert.equal(state.lastReceipt, receipt);
});

test("createAssistantPanelState: passes templateStore to executor for project template reuse", async () => {
  let executePayload = null;
  const templateStore = {
    get(templateId) {
      return { templateId, nodes: [], edges: [] };
    },
  };
  const state = createAssistantPanelState({
    graphStore: {},
    templateStore,
    api: {
      async validateActions(payload) {
        return { success: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executePayload = payload;
      return { appliedCount: 1, appliedTemplateIds: ["tpl-story"] };
    },
  });
  state.pendingActions = [{ type: "apply_workflow_template", templateId: "tpl-story" }];
  state.approveStrongConfirmation();

  await state.applyPendingActions();

  assert.equal(executePayload.templateStore, templateStore);
});

test("createAssistantPanelState: strong confirmation does not grant explicit video authorization", async () => {
  const validations = [];
  const executions = [];
  const state = createAssistantPanelState({
    graphStore: { nodes: [] },
    api: {
      async validateActions(payload) {
        validations.push(payload);
        return {
          success: true,
          valid: true,
          actions: payload.actions.filter((action) => action.nodeType !== "ai-video"),
        };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { success: true, appliedCount: payload.actions.length };
    },
  });
  state.setPendingActions([
    { type: "queue_generation_task", nodeId: "text_node", nodeType: "ai-text", prompt: "write copy" },
    { type: "queue_generation_task", nodeId: "image_node", nodeType: "ai-image", prompt: "make image" },
    {
      type: "queue_generation_task",
      nodeId: "video_node",
      nodeType: "ai-video",
      prompt: "make video",
      requiresConfirmation: true,
    },
  ]);
  state.approveStrongConfirmation();

  await state.applyPendingActions();

  assert.equal(validations.length, 1);
  assert.equal(validations[0].videoAuthorized, undefined);
  assert.deepEqual(
    validations[0].actions.map((action) => action.nodeId),
    ["text_node", "image_node"]
  );
  assert.equal(executions.length, 1);
  assert.equal(executions[0].videoAuthorized, undefined);
  assert.deepEqual(
    executions[0].actions.map((action) => action.nodeId),
    ["text_node", "image_node"]
  );
  assert.match(state.lastReceipt, /video task.*waiting for confirmation/i);
});

test("resolveGraphNodes: reads nodes from a real store-shaped graphStore (getState().nodes, no bare .nodes)", () => {
  const nodes = [{ id: "a" }, { id: "b" }];
  // The real app store exposes nodes via getState().nodes and has NO bare
  // .nodes property — the shape that silently broke direct graphStore.nodes
  // reads in real-browser e2e (2026-06-15).
  assert.deepEqual(resolveGraphNodes({ getState: () => ({ nodes }) }), nodes);
  // Bare {nodes} fakes and the autoload adapter still resolve.
  assert.deepEqual(resolveGraphNodes({ nodes }), nodes);
  // getState().nodes wins over a stale bare .nodes.
  assert.deepEqual(resolveGraphNodes({ getState: () => ({ nodes }), nodes: [] }), nodes);
  // Map / object node collections normalize to arrays.
  assert.deepEqual(
    resolveGraphNodes({ getState: () => ({ nodes: new Map([["a", { id: "a" }]]) }) }),
    [{ id: "a" }]
  );
  assert.deepEqual(resolveGraphNodes({ getState: () => ({ nodes: { a: { id: "a" } } }) }), [{ id: "a" }]);
  // Missing / nullish stores -> empty array, never throws.
  assert.deepEqual(resolveGraphNodes(null), []);
  assert.deepEqual(resolveGraphNodes(undefined), []);
  assert.deepEqual(resolveGraphNodes({ getState: () => ({}) }), []);
});

test("createAssistantPanelState: video auth gate resolves ai-video via a store-shaped graphStore (type only on the node)", async () => {
  // Regression: generationActionNodeType used graphStore?.nodes directly, which
  // is undefined on the real store-shaped graphStore -> the node type never
  // resolved -> an unauthorized ai-video action (type carried only on the
  // canvas node, not on the action) slipped past the video-authorization gate.
  const validations = [];
  const executions = [];
  const nodes = [{ id: "video_node", type: "ai-video" }];
  const state = createAssistantPanelState({
    graphStore: { getState: () => ({ nodes }) }, // NO bare .nodes
    api: {
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { success: true, appliedCount: payload.actions.length };
    },
  });
  state.setPendingActions([
    // Action carries only the nodeId; its ai-video type lives on the canvas node.
    { type: "queue_generation_task", nodeId: "video_node", prompt: "make video", requiresConfirmation: true },
  ]);
  state.approveStrongConfirmation();

  await state.applyPendingActions();

  // The lone action is recognized as unauthorized ai-video and filtered out, so
  // nothing reaches validation/execution and the auth receipt is shown.
  assert.equal(validations.length, 0, "store-resolved ai-video is gated, not validated");
  assert.equal(executions.length, 0, "store-resolved ai-video is gated, not executed");
  assert.match(state.lastReceipt, /Video generation requires explicit authorization/);
});

test("createAssistantPanelState: act mode does not authorize video generation without explicit approval", async () => {
  const validations = [];
  const executions = [];
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore: { nodes: [] },
    api: {
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { success: true, appliedCount: payload.actions.length };
    },
  });
  state.setPendingActions([
    { type: "queue_generation_task", nodeId: "video_node", nodeType: "ai-video", prompt: "make video" },
  ]);

  state.messages.push({ role: "assistant", content: "Video task pending.", cards: [] });
  const card = await state.prepareInteractionCardForPendingActions();

  assert.equal(card.status, "needs_confirmation");
  assert.equal(card.requiresConfirmation, true);
  assert.equal(validations.length, 0);
  assert.equal(executions.length, 0);
  assert.equal(state.pendingActions.length, 1);
  assert.equal(state.messages.at(-1)?.cards?.at(-1)?.status, "needs_confirmation");
});

test("createAssistantPanelState: explicit video approval lets act mode validate and execute video generation", async () => {
  const validations = [];
  const executions = [];
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore: { nodes: [] },
    api: {
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { success: true, appliedCount: payload.actions.length };
    },
  });
  state.setPendingActions([
    { type: "queue_generation_task", nodeId: "video_node", nodeType: "ai-video", prompt: "make video" },
  ]);
  state.approveVideoGeneration();

  await state.applyPendingActions();

  assert.equal(validations.length, 1);
  assert.equal(validations[0].videoAuthorized, true);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].videoAuthorized, true);
  assert.equal(executions[0].agentMode, "act");
  assert.equal(state.pendingActions.length, 0);
});

test("createAssistantPanelState: validation and execution receive deep-cloned actions", async () => {
  const actions = [{ type: "update_node_data", nodeId: "node-1", data: { text: "original" } }];
  const validatedActions = [
    { type: "update_node_data", nodeId: "node-1", data: { text: "validated" } },
  ];
  const calls = [];
  const state = createAssistantPanelState({
    api: {
      async validateActions(payload) {
        payload.actions[0].data.text = "mutated by validator";
        calls.push({ type: "validate", payload });
        return { success: true, actions: validatedActions };
      },
    },
    async executeActions(payload) {
      calls.push({ type: "execute", payload });
      return { appliedCount: 1 };
    },
  });
  state.pendingActions = actions;

  await state.applyPendingActions();
  validatedActions[0].data.text = "mutated after execute";

  assert.equal(actions[0].data.text, "original");
  assert.equal(calls[1].payload.actions[0].data.text, "validated");
});

test("createAssistantPanelState: empty validated actions do not execute originals", async () => {
  let executeCalled = false;
  const state = createAssistantPanelState({
    api: {
      async validateActions() {
        return { success: true, actions: [] };
      },
    },
    executeActions() {
      executeCalled = true;
    },
  });
  state.pendingActions = [{ type: "create_node", id: "unsafe-original" }];

  const receipt = await state.applyPendingActions();

  assert.equal(executeCalled, false);
  assert.match(receipt, /No validated actions/);
  assert.equal(state.pendingActions.length, 0);
});

test("createAssistantPanelState: malformed validation responses fail closed", async () => {
  const malformedResponses = [{}, null, { errors: ["bad shape"] }];
  for (const validationResponse of malformedResponses) {
    let executeCalled = false;
    const state = createAssistantPanelState({
      api: {
        async validateActions() {
          return validationResponse;
        },
      },
      executeActions() {
        executeCalled = true;
      },
    });
    state.pendingActions = [{ type: "create_node", id: "draft-node" }];

    const receipt = await state.applyPendingActions();

    assert.equal(executeCalled, false);
    assert.match(receipt, /validation/i);
    assert.equal(state.pendingActions.length, 1);
  }
});

test("createAssistantPanelState: buildContext always receives graphStore argument", async () => {
  const calls = [];
  const graphStore = { nodes: [] };
  const state = createAssistantPanelState({
    graphStore,
    buildContext: ({ graphStore: receivedGraphStore } = {}) => {
      calls.push(receivedGraphStore);
      return {};
    },
    api: {
      async chat() {
        return {};
      },
    },
  });

  await state.sendMessage("Check canvas");

  assert.deepEqual(calls, [graphStore]);
});

test("createAssistantPanelState: applyPendingActions does not clear newer pending actions", async () => {
  let resolveValidation;
  const firstActions = [{ type: "create_node", id: "first" }];
  const newerActions = [{ type: "create_node", id: "newer" }];
  const state = createAssistantPanelState({
    api: {
      validateActions() {
        return new Promise((resolve) => {
          resolveValidation = resolve;
        });
      },
    },
    async executeActions() {
      return { appliedCount: 1 };
    },
  });
  state.pendingActions = firstActions;

  const applyPromise = state.applyPendingActions();
  state.pendingActions = newerActions;
  resolveValidation({ success: true, actions: [{ type: "create_node", id: "validated-first" }] });
  await applyPromise;

  assert.deepEqual(state.pendingActions, newerActions);
});

test("createAssistantPanelState: concurrent apply does not execute the same pending batch twice", async () => {
  let resolveValidation;
  let executeCount = 0;
  const actions = [{ type: "create_node", id: "first" }];
  const state = createAssistantPanelState({
    api: {
      validateActions() {
        return new Promise((resolve) => {
          resolveValidation = resolve;
        });
      },
    },
    async executeActions() {
      executeCount += 1;
      return { appliedCount: 1 };
    },
  });
  state.pendingActions = actions;

  const firstApply = state.applyPendingActions();
  const secondApply = state.applyPendingActions();
  resolveValidation({ success: true, actions: [{ type: "create_node", id: "validated-first" }] });
  await Promise.all([firstApply, secondApply]);

  assert.equal(executeCount, 1);
  assert.equal(state.pendingActions.length, 0);
});

test("createAssistantPanelState: receipt details keep affected nodes and can focus them", async () => {
  const receipts = [];
  const graphStore = {
    selectedNodeIds: [],
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
  };
  const conversationStore = {
    appendReceipt(_conversationId, receipt) {
      receipts.push(receipt);
    },
  };
  const state = createAssistantPanelState({
    graphStore,
    conversationStore,
    conversationId: "conv-1",
    api: {
      async validateActions(payload) {
        return { success: true, actions: payload.actions };
      },
    },
    async executeActions() {
      return {
        appliedCount: 2,
        createdNodeIds: ["created-1"],
        updatedNodeIds: ["updated-1"],
        queuedGenerationNodeIds: ["queued-1"],
        createdEdgeIds: ["edge-1"],
        warnings: [],
      };
    },
  });
  state.pendingActions = [{ type: "focus_nodes", nodeIds: ["created-1"] }];

  await state.applyPendingActions();
  const focused = state.focusReceiptNodes();

  assert.deepEqual(receipts[0].details.createdNodeIds, ["created-1"]);
  assert.deepEqual(receipts[0].details.updatedNodeIds, ["updated-1"]);
  assert.equal(focused, true);
  assert.deepEqual(graphStore.selectedNodeIds, ["created-1", "updated-1", "queued-1"]);
});

test("createAssistantPanelState: restoreConversation restores pending actions without executing", async () => {
  let executeCount = 0;
  const state = createAssistantPanelState({
    api: {
      async validateActions() {
        return { success: true, actions: [] };
      },
    },
    async executeActions() {
      executeCount += 1;
      return { appliedCount: 1 };
    },
  });

  const restored = state.restoreConversation({
    id: "conv-restore",
    title: "Restore test",
    messages: [
      { role: "user", content: "create node" },
      {
        role: "assistant",
        content: "ready",
        actions: [{ type: "create_node", nodeType: "note" }],
      },
    ],
    receipts: [],
  });

  assert.equal(restored, true);
  assert.equal(executeCount, 0);
  assert.equal(state.conversationId, "conv-restore");
  assert.deepEqual(state.pendingActions, [{ type: "create_node", nodeType: "note" }]);
  assert.equal(state.status, "done_pending_actions");
});
