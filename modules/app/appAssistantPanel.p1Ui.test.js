import assert from "node:assert/strict";
import test from "node:test";

import { createAppAssistantPanel, createAssistantPanelState } from "./appAssistantPanel.js";
import { createAssistantConversationStore } from "../assistant/assistantConversationStore.js";
import { createAssistantExecutionStore } from "../assistant/assistantExecutionStore.js";

// B 行为(铁律: 抽屉不常驻): 已完成执行不再常驻状态线, 需从「执行历史」显式打开后才在抽屉中展示
// (撤销/重放/逐步重生成/指标等入口)。测试以此辅助还原"已打开已完成执行"的状态。
async function reopenCompletedFromHistory(panel) {
  panel.root.querySelector(".hy-canvas-agent-exec-history-btn").click();
  await panel.flush();
  panel.root.querySelector(".hy-canvas-agent-execution-history-item").click();
  await panel.flush();
}

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
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.attributes = {};
    this.dataset = {};
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.type = "";
    this._textContent = "";
    this.scrollTop = 0;
    this.clientHeight = 120;
    this._scrollHeight = null;
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
  set scrollHeight(value) {
    this._scrollHeight = Number(value) || 0;
  }
  get scrollHeight() {
    if (this._scrollHeight !== null) {
      return this._scrollHeight;
    }
    return Math.max(this.clientHeight, (this.children.length || 1) * 64);
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
    const attr = selector.match(/^\.([^\[]+)\[([^=]+)='([^']+)'\]$/);
    if (attr) {
      return this.classList.contains(attr[1]) && this.getAttribute(attr[2]) === attr[3];
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
      return body.querySelector(`#${id}`) || head.querySelector(`#${id}`) || null;
    },
    querySelector(selector) {
      return body.querySelector(selector) || head.querySelector(selector);
    },
    addEventListener() {},
  };
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

test("appAssistantPanel Phase 2 UI: visible execution renders collapsed drawer above input", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-drawer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-drawer",
    title: "整理画布",
    status: "draft",
    progress: { done: 0, total: 3 },
    drawerState: {
      visible: true,
      expanded: false,
      line1: "整理画布 0/3，队列中 1 个",
      line2: "等待确认计划",
      pendingConfirmationCount: 1,
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore });

  panel.init();
  panel.open();

  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  const compose = panel.root.querySelector(".hy-canvas-agent-compose");
  const input = panel.root.querySelector(".hy-canvas-agent-input");

  assert.ok(drawer);
  assert.equal(drawer.hidden, false);
  assert.match(drawer.textContent, /整理画布 0\/3/);
  assert.match(drawer.textContent, /等待确认计划/);
  assert.match(drawer.textContent, /展开/);
  assert.match(drawer.textContent, /确认/);
  assert.equal(drawer.parentElement, compose);
  assert.equal(compose.children.indexOf(drawer) < compose.children.indexOf(input.parentElement), true);
});

test("appAssistantPanel Phase 2 UI: queued_draft summary without pending confirmation auto-hides (不常驻)", async () => {
  // 回归: queued_draft「已入队的滞留草稿摘要」(过去式描述, pendingConfirmationCount=0, 含 plan 动作)
  // 不应常驻于输入框上方; 应自动消隐, 仅留「执行历史」入口回看。
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-stale-draft",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-stale",
    title: "已为您重新整理全画布节点布局",
    status: "queued_draft",
    plan: { steps: [{ id: "s1", title: "rearrange" }] },
    actionsByStep: { s1: [{ id: "a1", type: "update_node", nodeId: "n1" }, { id: "a2", type: "update_node", nodeId: "n2" }] },
    drawerState: {
      visible: true,
      line1: "已为您重新整理全画布节点布局。我们使用了分镜网格。",
      line2: "完成",
      pendingConfirmationCount: 0,
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });
  panel.init();
  panel.open();

  // 不常驻: 摘要不在输入框上方显示
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-line1"), null);
  // 但仍可从「执行历史」回看
  const historyToggle = panel.root.querySelector(".hy-canvas-agent-exec-history-btn");
  assert.ok(historyToggle);
  assert.ok((historyToggle.getAttribute("aria-label") || "").includes("执行历史"));
});

test("appAssistantPanel Phase 2 UI: expanding drawer shows plan and timeline", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-expanded-drawer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-expanded",
    title: "分镜生成",
    status: "executing",
    drawerState: {
      visible: true,
      expanded: false,
      line1: "分镜生成 1/3",
      line2: "正在生成关键帧 01",
    },
    plan: {
      steps: [
        { id: "outline", title: "生成故事大纲", status: "completed" },
        { id: "keyframe", title: "生成关键帧", status: "executing" },
      ],
    },
  });
  executionStore.appendTimelineEvent("exec-expanded", {
    stepId: "outline",
    status: "completed",
    humanSummary: "故事大纲已完成",
  });
  executionStore.appendTimelineEvent("exec-expanded", {
    stepId: "keyframe",
    status: "running",
    humanSummary: "正在生成关键帧 01",
  });
  const panel = createAppAssistantPanel({ document, executionStore });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(drawer.getAttribute("aria-expanded"), "true");
  assert.match(drawer.textContent, /生成故事大纲/);
  assert.match(drawer.textContent, /生成关键帧/);
  assert.match(drawer.textContent, /故事大纲已完成/);
  assert.match(drawer.textContent, /正在生成关键帧 01/);
  assert.ok(panel.root.querySelector(".hy-canvas-agent-execution-plan"));
  assert.ok(panel.root.querySelector(".hy-canvas-agent-execution-timeline"));
});

test("appAssistantPanel Phase 2 UI: expanded drawer shows queue strip and timeline event details", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-expanded-drawer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "当前分镜任务",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "当前分镜任务 1/2",
      line2: "正在生成关键帧",
    },
    plan: {
      steps: [
        { id: "outline", title: "生成故事大纲", status: "completed" },
        { id: "keyframe", title: "生成关键帧", status: "executing" },
      ],
    },
  });
  executionStore.appendTimelineEvent("exec-active", {
    id: "evt-outline",
    stepId: "outline",
    actionId: "act-outline",
    status: "completed",
    humanSummary: "故事大纲已完成",
    durationMs: 1200,
    canRetry: true,
    canUndo: true,
    developer: { actionJson: { type: "create_node", nodeId: "outline-1" } },
  });
  executionStore.createExecution({
    id: "exec-queued",
    title: "排队整理画布",
    status: "queued",
    queueIndex: 1,
    drawerState: {
      visible: false,
      line1: "排队整理画布",
      line2: "等待当前任务完成",
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const queueStrip = panel.root.querySelector(".hy-canvas-agent-execution-queue");
  assert.ok(queueStrip);
  assert.match(queueStrip.textContent, /当前分镜任务/);
  assert.match(queueStrip.textContent, /排队整理画布/);
  assert.match(queueStrip.textContent, /执行中/);
  assert.match(queueStrip.textContent, /排队中/);

  const eventButton = panel.root.querySelector(".hy-canvas-agent-execution-event");
  assert.ok(eventButton);
  eventButton.click();

  const detail = panel.root.querySelector(".hy-canvas-agent-execution-event-detail");
  assert.ok(detail);
  assert.match(detail.textContent, /故事大纲已完成/);
  assert.match(detail.textContent, /outline/);
  assert.match(detail.textContent, /act-outline/);
  assert.match(detail.textContent, /可重试/);
  assert.match(detail.textContent, /可撤销/);
  assert.match(detail.textContent, /1200ms/);
});

test("appAssistantPanel Phase 2 UI: queue card switches expanded detail without changing execution order", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queue-switch",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active storyboard",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Active storyboard 1/2",
      line2: "Running active task",
    },
    plan: {
      steps: [{ id: "active-step", title: "Active plan step", status: "executing" }],
    },
  });
  executionStore.appendTimelineEvent("exec-active", {
    id: "evt-active",
    humanSummary: "Active timeline event",
  });
  executionStore.createExecution({
    id: "exec-queued",
    title: "Queued layout",
    status: "queued",
    queueIndex: 1,
    drawerState: {
      visible: false,
      line1: "Queued layout",
      line2: "Waiting in queue",
    },
    plan: {
      steps: [{ id: "queued-step", title: "Queued plan step", status: "queued" }],
    },
  });
  executionStore.appendTimelineEvent("exec-queued", {
    id: "evt-queued",
    humanSummary: "Queued timeline event",
  });
  const panel = createAppAssistantPanel({ document, executionStore });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  assert.match(panel.root.querySelector(".hy-canvas-agent-execution-plan").textContent, /Active plan step/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-execution-timeline").textContent, /Active timeline event/);

  const queuedCard = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued");
  assert.ok(queuedCard);
  queuedCard.click();

  const plan = panel.root.querySelector(".hy-canvas-agent-execution-plan");
  const timeline = panel.root.querySelector(".hy-canvas-agent-execution-timeline");
  const selectedQueued = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued");

  assert.match(plan.textContent, /Queued plan step/);
  assert.doesNotMatch(plan.textContent, /Active plan step/);
  assert.match(timeline.textContent, /Queued timeline event/);
  assert.equal(selectedQueued.getAttribute("data-selected"), "true");
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), ["exec-queued"]);
});

test("appAssistantPanel Phase 2 UI: queued task controls cancel, top, pause, and resume without interrupting active task", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queue-controls-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Active render",
      line2: "Rendering current task",
    },
    plan: { steps: [{ id: "active-step", title: "Active step" }] },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
    plan: { steps: [{ id: "queued-step-1", title: "Queued first step" }] },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
    plan: { steps: [{ id: "queued-step-2", title: "Queued second step" }] },
  });
  const syncCalls = [];
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true, execution: { id: executionId } });
      },
    },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const secondCard = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued-2");
  assert.ok(secondCard);
  assert.ok(secondCard.querySelector(".hy-canvas-agent-execution-queue-top"));
  assert.ok(secondCard.querySelector(".hy-canvas-agent-execution-queue-pause"));
  assert.ok(secondCard.querySelector(".hy-canvas-agent-execution-queue-cancel"));

  secondCard.querySelector(".hy-canvas-agent-execution-queue-top").click();
  await panel.flush();
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), [
    "exec-queued-2",
    "exec-queued-1",
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");

  const toppedCard = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued-2");
  toppedCard.querySelector(".hy-canvas-agent-execution-queue-pause").click();
  await panel.flush();
  assert.equal(executionStore.getExecution("exec-queued-2").drawerState.queuePaused, true);
  const pausedCard = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued-2");
  assert.match(pausedCard.textContent, /已暂停排队/);
  assert.equal(pausedCard.querySelector(".hy-canvas-agent-execution-queue-pause").textContent, "继续");

  pausedCard.querySelector(".hy-canvas-agent-execution-queue-pause").click();
  await panel.flush();
  assert.equal(executionStore.getExecution("exec-queued-2").drawerState.queuePaused, false);

  const firstCard = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-queue-item")
    .find((item) => item.getAttribute("data-execution-id") === "exec-queued-1");
  firstCard.querySelector(".hy-canvas-agent-execution-queue-cancel").click();
  await panel.flush();

  assert.equal(executionStore.getExecution("exec-queued-1").status, "cancelled");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), ["exec-queued-2"]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [
    ["exec-queued-2", "top"],
    ["exec-queued-2", "pause"],
    ["exec-queued-2", "resume"],
    ["exec-queued-1", "cancel"],
  ]);
});

test("appAssistantPanel spatial lens: spatial wording requests the full projection, plain chat does not", async () => {
  const buildContextCalls = [];
  const state = createAssistantPanelState({
    buildContext: (options = {}) => {
      buildContextCalls.push(options);
      return { canvas: { nodeCount: 0 } };
    },
    api: {
      async chat() {
        return { reply: "ok", actions: [] };
      },
    },
  });

  await state.sendMessage("帮我写一段雨夜的旁白");
  await state.sendMessage("把成片移动到画布右边的空位");

  assert.equal(buildContextCalls.length, 2);
  assert.equal(buildContextCalls[0].includeSpatial, false);
  assert.equal(buildContextCalls[1].includeSpatial, true);
});

test("appAssistantPanel Phase 2 UI: creative text with implicit queue hints flows to the agent when the queue is empty", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-empty-queue-creative-text",
    clock: () => "2026-06-12T00:00:00.000Z",
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "好的，我来帮你拆分镜", actions: [] };
      },
    },
  });

  // Contains an action word (删掉) plus implicit queue-hint characters
  // (第/最后) but the queue is empty - this is a creative request about
  // shot content, not a queue command, and must reach the agent.
  const response = await state.sendMessage(
    "删掉第二镜里的路人对白，最后留一个空镜，雨声盖过一切",
  );

  assert.equal(chatCalls, 1);
  assert.equal(response?.queueControl, undefined);
  const assistantReplies = state.messages.filter((message) => message.role === "assistant");
  assert.equal(
    assistantReplies.some((message) => /没有找到可操作的排队任务/.test(message.content || "")),
    false,
  );
});

test("appAssistantPanel Phase 2 UI: explicit queue command on an empty queue still answers without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-empty-queue-explicit-command",
    clock: () => "2026-06-12T00:00:00.000Z",
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  const response = await state.sendMessage("取消第一个排队任务");

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "cancel");
  assert.match(
    state.messages.at(-1)?.content || "",
    /没有找到可操作的排队任务/,
  );
});

test("appAssistantPanel Phase 2 UI: natural-language queue command cancels before model config guard", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-cancel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("\u53d6\u6d88\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "cancel");
  assert.equal(response?.queueControl?.executionId, "exec-queued-1");
  assert.equal(executionStore.getExecution("exec-queued-1").status, "cancelled");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), ["exec-queued-2"]);
  assert.equal(state.status, "done_no_actions");
  assert.equal(state.messages[0].role, "user");
  assert.equal(state.messages[1].role, "assistant");
  assert.match(state.messages[1].content, /\u5df2\u53d6\u6d88\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [["exec-queued-1", "cancel"]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command cancels all queued tasks without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-cancel-all",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("\u53d6\u6d88\u5168\u90e8\u6392\u961f\u4efb\u52a1");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "cancel_all");
  assert.deepEqual(response?.queueControl?.executionIds, [
    "exec-queued-1",
    "exec-queued-2",
    "exec-queued-3",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), []);
  assert.equal(executionStore.getExecution("exec-queued-1").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-2").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-3").status, "cancelled");
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u53d6\u6d88 3 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    ["exec-queued-1", "cancel"],
    ["exec-queued-2", "cancel"],
    ["exec-queued-3", "cancel"],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue commands top, pause, and resume without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-controls",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("\u628a\u7b2c\u4e8c\u4e2a\u4efb\u52a1\u7f6e\u9876");
  await state.lastExecutionSyncPromise;
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), [
    "exec-queued-2",
    "exec-queued-1",
  ]);

  await state.sendMessage("\u6682\u505c\u4e0b\u4e00\u4e2a\u4efb\u52a1");
  await state.lastExecutionSyncPromise;
  assert.equal(executionStore.getExecution("exec-queued-2").drawerState.queuePaused, true);

  await state.sendMessage("\u7ee7\u7eed\u6682\u505c\u7684\u4efb\u52a1");
  await state.lastExecutionSyncPromise;
  assert.equal(executionStore.getExecution("exec-queued-2").drawerState.queuePaused, false);

  assert.equal(chatCalls, 0);
  assert.deepEqual(syncCalls, [
    ["exec-queued-2", "top"],
    ["exec-queued-2", "pause"],
    ["exec-queued-2", "resume"],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command moves item to requested position without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-move",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("\u628a\u7b2c\u56db\u4e2a\u6392\u961f\u4efb\u52a1\u79fb\u52a8\u5230\u7b2c\u4e8c\u4e2a");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-4");
  assert.equal(response?.queueControl?.targetIndex, 1);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.queueIndex]), [
    ["exec-queued-1", 1],
    ["exec-queued-4", 2],
    ["exec-queued-2", 3],
    ["exec-queued-3", 4],
  ]);
  assert.equal(executionStore.getExecution("exec-queued-4").status, "queued_draft");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u8c03\u6574\u6392\u961f\u4efb\u52a1\u987a\u5e8f/);
  assert.deepEqual(syncCalls, [["exec-queued-4", "move", { targetIndex: 1 }]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command reorders the full queue without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-reorder",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("\u6309 4\u30012\u30011\u30013 \u7684\u987a\u5e8f\u91cd\u6392\u6574\u4e2a\u6392\u961f\u4efb\u52a1");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-4",
    "exec-queued-2",
    "exec-queued-1",
    "exec-queued-3",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-4", "queued_draft", 1],
    ["exec-queued-2", "queued_draft", 2],
    ["exec-queued-1", "queued", 3],
    ["exec-queued-3", "queued", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u91cd\u6392 4 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-4",
      "reorder",
      {
        orderedIds: ["exec-queued-4", "exec-queued-2", "exec-queued-1", "exec-queued-3"],
      },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command swaps two queued tasks without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-swap",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把第二个和第四个排队任务换一下");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-1",
    "exec-queued-4",
    "exec-queued-3",
    "exec-queued-2",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-4", "queued_draft", 2],
    ["exec-queued-3", "queued", 3],
    ["exec-queued-2", "queued_draft", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u91cd\u6392 4 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-1",
      "reorder",
      {
        orderedIds: ["exec-queued-1", "exec-queued-4", "exec-queued-3", "exec-queued-2"],
      },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command applies swap then move-to-last without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-sequence",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把第二个和第四个排队任务换一下，再把第三个排到最后");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-1",
    "exec-queued-4",
    "exec-queued-2",
    "exec-queued-3",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-4", "queued_draft", 2],
    ["exec-queued-2", "queued_draft", 3],
    ["exec-queued-3", "queued", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u91cd\u6392 4 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-1",
      "reorder",
      {
        orderedIds: ["exec-queued-1", "exec-queued-4", "exec-queued-2", "exec-queued-3"],
      },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command applies move-to-last then current-position swap without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-move-then-swap",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("先把第三个排到最后，再把当前第二个和当前第四个换一下");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-1",
    "exec-queued-3",
    "exec-queued-4",
    "exec-queued-2",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-3", "queued", 2],
    ["exec-queued-4", "queued_draft", 3],
    ["exec-queued-2", "queued_draft", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u91cd\u6392 4 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-1",
      "reorder",
      {
        orderedIds: ["exec-queued-1", "exec-queued-3", "exec-queued-4", "exec-queued-2"],
      },
    ],
  ]);
});


test("appAssistantPanel Phase 2 UI: natural-language queue command applies generic multi-step local queue reorder operations without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-operation-plan",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage(
    "先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下"
  );
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-3",
    "exec-queued-4",
    "exec-queued-1",
    "exec-queued-2",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-3", "queued", 1],
    ["exec-queued-4", "queued_draft", 2],
    ["exec-queued-1", "queued", 3],
    ["exec-queued-2", "queued_draft", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.equal(state.status, "done_no_actions");
  assert.match(state.messages.at(-1)?.content || "", /\u5df2\u91cd\u6392 4 \u4e2a\u6392\u961f\u4efb\u52a1/);
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-3",
      "reorder",
      {
        orderedIds: ["exec-queued-3", "exec-queued-4", "exec-queued-1", "exec-queued-2"],
      },
    ],
  ]);
});


test("appAssistantPanel Phase 2 UI: natural-language queue command swaps current leading pair without explicit ordinals", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-leading-pair",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "Queued second",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued second", line2: "Waiting second" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "Queued third",
    drawerState: { visible: false, line1: "Queued third", line2: "Waiting third" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-4",
    title: "Queued fourth",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued fourth", line2: "Waiting fourth" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("先把第一个和第三个排队任务换一下，再把前两个换一下");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "reorder");
  assert.deepEqual(response?.queueControl?.orderedIds, [
    "exec-queued-2",
    "exec-queued-3",
    "exec-queued-1",
    "exec-queued-4",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-2", "queued_draft", 1],
    ["exec-queued-3", "queued", 2],
    ["exec-queued-1", "queued", 3],
    ["exec-queued-4", "queued_draft", 4],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [
    [
      "exec-queued-2",
      "reorder",
      {
        orderedIds: ["exec-queued-2", "exec-queued-3", "exec-queued-1", "exec-queued-4"],
      },
    ],
  ]);
});


test("appAssistantPanel Phase 2 UI: natural-language queue command moves a queued task by title reference without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-title-reference",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "故事大纲",
    drawerState: { visible: false, line1: "故事大纲", line2: "Waiting story" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "海报生成",
    status: "queued_draft",
    drawerState: { visible: false, line1: "海报生成", line2: "Waiting poster" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "视频生成",
    drawerState: { visible: false, line1: "视频生成", line2: "Waiting video" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把海报生成移动到第三个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-2");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-3", "queued", 2],
    ["exec-queued-2", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-2", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous queue title reference asks for clarification without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-title-reference-ambiguous",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "海报生成 A",
    drawerState: { visible: false, line1: "海报生成 A", line2: "Waiting poster A" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "海报生成 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "海报生成 B", line2: "Waiting poster B" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "视频生成",
    drawerState: { visible: false, line1: "视频生成", line2: "Waiting video" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把海报生成移动到第三个排队任务");

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "clarify");
  assert.equal(response?.queueControl?.status, "needs_clarification");
  assert.equal(response?.queueControl?.requestedAction, "move");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(
    response?.queueControl?.candidates?.map((item) => [item.id, item.title]),
    [
      ["exec-queued-1", "海报生成 A"],
      ["exec-queued-2", "海报生成 B"],
    ]
  );
  assert.match(response?.reply || "", /海报生成 A/);
  assert.match(response?.reply || "", /海报生成 B/);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-2", "queued_draft", 2],
    ["exec-queued-3", "queued", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, []);
});

test("appAssistantPanel Phase 2 UI: ambiguous queue title follow-up executes selected candidate without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-title-reference-follow-up",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "海报生成 A",
    drawerState: { visible: false, line1: "海报生成 A", line2: "Waiting poster A" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-2",
    title: "海报生成 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "海报生成 B", line2: "Waiting poster B" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-3",
    title: "视频生成",
    drawerState: { visible: false, line1: "视频生成", line2: "Waiting video" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("把海报生成移动到第三个排队任务");

  assert.equal(state.canSendMessage("第二个"), true);
  const response = await state.sendMessage("第二个");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-2");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-1", "queued", 1],
    ["exec-queued-3", "queued", 2],
    ["exec-queued-2", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-2", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous queue title candidate button executes selected move", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-title-reference-card",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-card",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-card-1",
    title: "海报生成 A",
    drawerState: { visible: false, line1: "海报生成 A", line2: "Waiting poster A" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-card-2",
    title: "海报生成 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "海报生成 B", line2: "Waiting poster B" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-card-3",
    title: "视频生成",
    drawerState: { visible: false, line1: "视频生成", line2: "Waiting video" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("把海报生成移动到第三个排队任务");
  await panel.flush();

  const buttons = panel.root.querySelectorAll(".hy-canvas-agent-queue-title-candidate");
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].textContent || "", /海报生成 A/);
  assert.match(buttons[1].textContent || "", /海报生成 B/);

  buttons[1].click();
  await panel.flush();
  await panel.state.lastExecutionSyncPromise;

  const card = panel.root
    .querySelectorAll(".hy-canvas-agent-card")
    .find((item) => item.getAttribute("data-card-type") === "queue_title_clarification");
  assert.equal(chatCalls, 0);
  assert.equal(card?.getAttribute("data-status"), "completed");
  assert.equal(buttons[1].getAttribute("data-selected"), "true");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-card-1", "queued", 1],
    ["exec-queued-card-3", "queued", 2],
    ["exec-queued-card-2", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active-card");
  assert.deepEqual(syncCalls, [["exec-queued-card-2", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command moves a queued task by generation type without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-generation-type-reference",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-text",
    title: "第一段生成",
    drawerState: { visible: false, line1: "第一段生成", line2: "Waiting text" },
    actionsByStep: {
      "step-text": [{ id: "act-text", type: "queue_generation_task", nodeId: "text-1", nodeType: "ai-text" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-image",
    title: "第二段生成",
    status: "queued_draft",
    drawerState: { visible: false, line1: "第二段生成", line2: "Waiting image" },
    actionsByStep: {
      "step-image": [{ id: "act-image", type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-video",
    title: "第三段生成",
    drawerState: { visible: false, line1: "第三段生成", line2: "Waiting video" },
    actionsByStep: {
      "step-video": [{ id: "act-video", type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把图片生成那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-image");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-text", "queued", 1],
    ["exec-queued-video", "queued", 2],
    ["exec-queued-image", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-image", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous generation type queue reference asks and follow-up moves selected candidate", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-generation-type-ambiguous",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-image-a",
    title: "候选 A",
    drawerState: { visible: false, line1: "候选 A", line2: "Waiting image A" },
    actionsByStep: {
      "step-image-a": [{ id: "act-image-a", type: "queue_generation_task", nodeId: "image-a", nodeType: "ai-image" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-image-b",
    title: "候选 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "候选 B", line2: "Waiting image B" },
    actionsByStep: {
      "step-image-b": [{ id: "act-image-b", type: "queue_generation_task", nodeId: "image-b", nodeType: "ai-image" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-video",
    title: "候选 C",
    drawerState: { visible: false, line1: "候选 C", line2: "Waiting video" },
    actionsByStep: {
      "step-video": [{ id: "act-video", type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const clarification = await state.sendMessage("把图片生成那个排队任务移动到最后");

  assert.equal(chatCalls, 0);
  assert.equal(clarification?.queueControl?.action, "clarify");
  assert.deepEqual(
    clarification?.queueControl?.candidates?.map((item) => [item.id, item.title]),
    [
      ["exec-queued-image-a", "候选 A"],
      ["exec-queued-image-b", "候选 B"],
    ]
  );
  assert.deepEqual(syncCalls, []);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-image-a", "queued", 1],
    ["exec-queued-image-b", "queued_draft", 2],
    ["exec-queued-video", "queued", 3],
  ]);

  const response = await state.sendMessage("第二个");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-image-b");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-image-a", "queued", 1],
    ["exec-queued-video", "queued", 2],
    ["exec-queued-image-b", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-image-b", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command moves a queued task by prompt content without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-prompt-content-reference",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-forest",
    title: "第一组生成",
    drawerState: { visible: false, line1: "第一组生成", line2: "Waiting forest" },
    actionsByStep: {
      "step-forest": [{ id: "act-forest", type: "queue_generation_task", nodeId: "image-forest", nodeType: "ai-image", prompt: "森林晨雾海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-cat",
    title: "第二组生成",
    status: "queued_draft",
    drawerState: { visible: false, line1: "第二组生成", line2: "Waiting cat" },
    actionsByStep: {
      "step-cat": [{ id: "act-cat", type: "queue_generation_task", nodeId: "image-cat", nodeType: "ai-image", prompt: "猫咪海报，暖色光影" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-video",
    title: "第三组生成",
    drawerState: { visible: false, line1: "第三组生成", line2: "Waiting video" },
    actionsByStep: {
      "step-video": [{ id: "act-video", type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "城市夜景视频" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把猫咪海报那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-cat");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-forest", "queued", 1],
    ["exec-queued-video", "queued", 2],
    ["exec-queued-cat", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-cat", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous prompt content queue reference asks and follow-up moves selected candidate", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-prompt-content-ambiguous",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-cat-a",
    title: "候选猫 A",
    drawerState: { visible: false, line1: "候选猫 A", line2: "Waiting cat A" },
    actionsByStep: {
      "step-cat-a": [{ id: "act-cat-a", type: "queue_generation_task", nodeId: "image-cat-a", nodeType: "ai-image", prompt: "猫咪海报，暖色室内" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-cat-b",
    title: "候选猫 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "候选猫 B", line2: "Waiting cat B" },
    actionsByStep: {
      "step-cat-b": [{ id: "act-cat-b", type: "queue_generation_task", nodeId: "image-cat-b", nodeType: "ai-image", prompt: "猫咪海报，户外阳光" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-dog",
    title: "候选狗",
    drawerState: { visible: false, line1: "候选狗", line2: "Waiting dog" },
    actionsByStep: {
      "step-dog": [{ id: "act-dog", type: "queue_generation_task", nodeId: "image-dog", nodeType: "ai-image", prompt: "小狗海报" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const clarification = await state.sendMessage("把猫咪海报那个排队任务移动到最后");

  assert.equal(chatCalls, 0);
  assert.equal(clarification?.queueControl?.action, "clarify");
  assert.deepEqual(
    clarification?.queueControl?.candidates?.map((item) => [item.id, item.title]),
    [
      ["exec-queued-cat-a", "候选猫 A"],
      ["exec-queued-cat-b", "候选猫 B"],
    ]
  );
  assert.deepEqual(syncCalls, []);

  const response = await state.sendMessage("第二个");
  await state.lastExecutionSyncPromise;

  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-cat-b");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-cat-a", "queued", 1],
    ["exec-queued-dog", "queued", 2],
    ["exec-queued-cat-b", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-cat-b", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command moves a queued task by asset reference without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-asset-reference",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-3",
    title: "资产处理 A",
    drawerState: { visible: false, line1: "资产处理 A", line2: "Waiting asset 3" },
    actionsByStep: {
      "step-asset-3": [{ id: "act-asset-3", type: "asset.use", assetId: "asset-3", assetName: "新资产3" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const response = await state.sendMessage("把新资产4那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(response?.queueControl?.targetIndex, 2);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-3", "queued", 1],
    ["exec-queued-prompt", "queued", 2],
    ["exec-queued-asset-4", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-asset-4", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous asset queue reference asks and follow-up moves selected candidate", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-asset-reference-ambiguous",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-a",
    title: "资产候选 A",
    drawerState: { visible: false, line1: "资产候选 A", line2: "Waiting asset A" },
    actionsByStep: {
      "step-asset-a": [{ id: "act-asset-a", type: "asset.use", assetId: "asset-a", assetName: "新资产4 / 人像" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-b",
    title: "资产候选 B",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产候选 B", line2: "Waiting asset B" },
    actionsByStep: {
      "step-asset-b": [{ id: "act-asset-b", type: "node.bindReferences", data: { assetId: "asset-b", assetTitle: "新资产4 / 场景" } }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-c",
    title: "资产候选 C",
    drawerState: { visible: false, line1: "资产候选 C", line2: "Waiting asset C" },
    actionsByStep: {
      "step-asset-c": [{ id: "act-asset-c", type: "asset.use", assetId: "asset-c", assetName: "旧资产" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const clarification = await state.sendMessage("把新资产4那个排队任务移动到最后");

  assert.equal(chatCalls, 0);
  assert.equal(clarification?.queueControl?.action, "clarify");
  assert.deepEqual(
    clarification?.queueControl?.candidates?.map((item) => [item.id, item.title]),
    [
      ["exec-queued-asset-a", "资产候选 A"],
      ["exec-queued-asset-b", "资产候选 B"],
    ]
  );
  assert.deepEqual(syncCalls, []);

  const response = await state.sendMessage("第二个");
  await state.lastExecutionSyncPromise;

  assert.equal(response?.queueControl?.action, "move");
  assert.equal(response?.queueControl?.executionId, "exec-queued-asset-b");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-a", "queued", 1],
    ["exec-queued-asset-c", "queued", 2],
    ["exec-queued-asset-b", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [["exec-queued-asset-b", "move", { targetIndex: 2 }]]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command reuses recent referenced task pronoun without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-reference-pronoun",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "资产处理 C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const first = await state.sendMessage("把新资产4那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  const second = await state.sendMessage("把它移动到第一个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(first?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(second?.queueControl?.action, "move");
  assert.equal(second?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(second?.queueControl?.targetIndex, 0);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-4", "queued", 1],
    ["exec-queued-prompt", "queued", 2],
    ["exec-queued-asset-5", "queued_draft", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 2 }],
    ["exec-queued-asset-4", "move", { targetIndex: 0 }],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command moves item before recent reference without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-reference-neighbor",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "资产处理 C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const first = await state.sendMessage("把新资产4那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  const second = await state.sendMessage("把它前面的那个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(first?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(second?.queueControl?.action, "move");
  assert.equal(second?.queueControl?.executionId, "exec-queued-asset-5");
  assert.equal(second?.queueControl?.targetIndex, 0);
  assert.equal(second?.queueControl?.referenceSource, "recent_queue_neighbor");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-5", "queued_draft", 1],
    ["exec-queued-prompt", "queued", 2],
    ["exec-queued-asset-4", "queued", 3],
  ]);
  assert.equal(executionStore.snapshot().activeExecutionId, "exec-active");
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 2 }],
    ["exec-queued-asset-5", "move", { targetIndex: 0 }],
  ]);
});

test("appAssistantPanel Phase 2 UI: ambiguous neighbor of recent queue reference asks before moving", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-reference-neighbor-clarify",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "资产处理 C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  const first = await state.sendMessage("把新资产4那个排队任务移动到第二个排队任务");
  await state.lastExecutionSyncPromise;
  const clarification = await state.sendMessage("把它旁边那个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(first?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(clarification?.queueControl?.action, "clarify");
  assert.equal(clarification?.queueControl?.requestedAction, "move");
  assert.equal(clarification?.queueControl?.status, "needs_clarification");
  assert.equal(clarification?.queueControl?.targetIndex, 0);
  assert.deepEqual(
    clarification?.queueControl?.candidates?.map((item) => [item.id, item.title]),
    [
      ["exec-queued-prompt", "提示词处理"],
      ["exec-queued-asset-5", "资产处理 C"],
    ]
  );
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-prompt", "queued", 1],
    ["exec-queued-asset-4", "queued", 2],
    ["exec-queued-asset-5", "queued_draft", 3],
  ]);
  assert.deepEqual(syncCalls, [["exec-queued-asset-4", "move", { targetIndex: 1 }]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous recent neighbor clarification accepts side answer without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-reference-neighbor-side-answer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "资产处理 C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("把新资产4那个排队任务移动到第二个排队任务");
  await state.lastExecutionSyncPromise;
  const clarification = await state.sendMessage("把它旁边那个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;
  const resolved = await state.sendMessage("后面的");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(clarification?.queueControl?.action, "clarify");
  assert.equal(resolved?.queueControl?.action, "move");
  assert.equal(resolved?.queueControl?.executionId, "exec-queued-asset-5");
  assert.equal(resolved?.queueControl?.targetIndex, 0);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-5", "queued_draft", 1],
    ["exec-queued-prompt", "queued", 2],
    ["exec-queued-asset-4", "queued", 3],
  ]);
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 1 }],
    ["exec-queued-asset-5", "move", { targetIndex: 0 }],
  ]);
});

test("appAssistantPanel Phase 2 UI: recent two queue references move as a group without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-two-group",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "Asset B",
    drawerState: { visible: false, line1: "Asset B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "\u65b0\u8d44\u4ea74" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "Prompt task",
    drawerState: { visible: false, line1: "Prompt task", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "\u57ce\u5e02\u591c\u666f\u6d77\u62a5" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "Asset C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Asset C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "\u65b0\u8d44\u4ea75" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("\u628a\u65b0\u8d44\u4ea74\u90a3\u4e2a\u6392\u961f\u4efb\u52a1\u79fb\u52a8\u5230\u6700\u540e");
  await state.lastExecutionSyncPromise;
  await state.sendMessage("\u628a\u5b83\u524d\u9762\u7684\u90a3\u4e2a\u79fb\u52a8\u5230\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1");
  await state.lastExecutionSyncPromise;
  const grouped = await state.sendMessage("\u628a\u521a\u624d\u90a3\u4e24\u4e2a\u79fb\u52a8\u5230\u6700\u540e");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(grouped?.queueControl?.action, "reorder");
  assert.equal(grouped?.queueControl?.referenceSource, "recent_queue_multi");
  assert.deepEqual(grouped?.queueControl?.executionIds, ["exec-queued-asset-5", "exec-queued-asset-4"]);
  assert.deepEqual(grouped?.queueControl?.orderedIds, [
    "exec-queued-prompt",
    "exec-queued-asset-5",
    "exec-queued-asset-4",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-prompt", "queued", 1],
    ["exec-queued-asset-5", "queued_draft", 2],
    ["exec-queued-asset-4", "queued", 3],
  ]);
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 2 }],
    ["exec-queued-asset-5", "move", { targetIndex: 0 }],
    [
      "exec-queued-prompt",
      "reorder",
      { orderedIds: ["exec-queued-prompt", "exec-queued-asset-5", "exec-queued-asset-4"] },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: recent three queue references move as a group without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-recent-three-group",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "Asset B",
    drawerState: { visible: false, line1: "Asset B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "Prompt task",
    drawerState: { visible: false, line1: "Prompt task", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "Asset C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Asset C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-text",
    title: "Text task",
    drawerState: { visible: false, line1: "Text task", line2: "Waiting text" },
    actionsByStep: {
      "step-text": [{ id: "act-text", type: "textNode.generate", text: "旁白文本" }],
    },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution(executionId, action, payload) {
        syncCalls.push([executionId, action, payload]);
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("把新资产4那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  await state.sendMessage("把它前面的那个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;
  await state.sendMessage("把城市夜景海报那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  const grouped = await state.sendMessage("把刚才那三个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(grouped?.queueControl?.action, "reorder");
  assert.equal(grouped?.queueControl?.referenceSource, "recent_queue_multi");
  assert.deepEqual(grouped?.queueControl?.executionIds, [
    "exec-queued-text",
    "exec-queued-asset-4",
    "exec-queued-prompt",
  ]);
  assert.deepEqual(grouped?.queueControl?.orderedIds, [
    "exec-queued-text",
    "exec-queued-asset-4",
    "exec-queued-prompt",
    "exec-queued-asset-5",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-text", "queued", 1],
    ["exec-queued-asset-4", "queued", 2],
    ["exec-queued-prompt", "queued", 3],
    ["exec-queued-asset-5", "queued_draft", 4],
  ]);
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 3 }],
    ["exec-queued-text", "move", { targetIndex: 0 }],
    ["exec-queued-prompt", "move", { targetIndex: 3 }],
    [
      "exec-queued-text",
      "reorder",
      {
        orderedIds: [
          "exec-queued-text",
          "exec-queued-asset-4",
          "exec-queued-prompt",
          "exec-queued-asset-5",
        ],
      },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: restored conversation reuses recent two queue references without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-restored-recent-two-group",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "Asset B",
    drawerState: { visible: false, line1: "Asset B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "\u65b0\u8d44\u4ea74" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "Prompt task",
    drawerState: { visible: false, line1: "Prompt task", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "\u57ce\u5e02\u591c\u666f\u6d77\u62a5" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "Asset C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Asset C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "\u65b0\u8d44\u4ea75" }],
    },
  });
  const conversationStore = createAssistantConversationStore({
    storage: memoryStorage(),
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_queue_recent_two_restore`,
  });
  const conversation = conversationStore.create({ title: "Queue recent two restore" });
  const syncCalls = [];
  let chatCalls = 0;
  const executionSyncClient = {
    controlQueuedExecution(executionId, action, payload) {
      syncCalls.push([executionId, action, payload]);
      return Promise.resolve({ success: true });
    },
  };
  const firstState = createAssistantPanelState({
    conversationId: conversation.id,
    conversationStore,
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient,
  });

  await firstState.sendMessage("\u628a\u65b0\u8d44\u4ea74\u90a3\u4e2a\u6392\u961f\u4efb\u52a1\u79fb\u52a8\u5230\u6700\u540e");
  await firstState.lastExecutionSyncPromise;
  await firstState.sendMessage("\u628a\u5b83\u524d\u9762\u7684\u90a3\u4e2a\u79fb\u52a8\u5230\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1");
  await firstState.lastExecutionSyncPromise;
  const persisted = conversationStore.get(conversation.id);
  const restoredState = createAssistantPanelState({
    conversationId: conversation.id,
    conversationStore,
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient,
  });

  assert.equal(restoredState.restoreConversation(persisted), true);
  assert.equal(restoredState.canSendMessage("\u628a\u521a\u624d\u90a3\u4e24\u4e2a\u79fb\u52a8\u5230\u6700\u540e"), true);

  const grouped = await restoredState.sendMessage("\u628a\u521a\u624d\u90a3\u4e24\u4e2a\u79fb\u52a8\u5230\u6700\u540e");
  await restoredState.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(grouped?.queueControl?.action, "reorder");
  assert.equal(grouped?.queueControl?.referenceSource, "recent_queue_multi");
  assert.deepEqual(grouped?.queueControl?.executionIds, ["exec-queued-asset-5", "exec-queued-asset-4"]);
  assert.deepEqual(grouped?.queueControl?.orderedIds, [
    "exec-queued-prompt",
    "exec-queued-asset-5",
    "exec-queued-asset-4",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-prompt", "queued", 1],
    ["exec-queued-asset-5", "queued_draft", 2],
    ["exec-queued-asset-4", "queued", 3],
  ]);
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 2 }],
    ["exec-queued-asset-5", "move", { targetIndex: 0 }],
    [
      "exec-queued-prompt",
      "reorder",
      { orderedIds: ["exec-queued-prompt", "exec-queued-asset-5", "exec-queued-asset-4"] },
    ],
  ]);
});

test("appAssistantPanel Phase 2 UI: restored conversation reuses recent queue reference pronoun without LLM", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-restored-recent-reference",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "资产处理 B",
    drawerState: { visible: false, line1: "资产处理 B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "提示词处理",
    drawerState: { visible: false, line1: "提示词处理", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "资产处理 C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "资产处理 C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  const conversationStore = createAssistantConversationStore({
    storage: memoryStorage(),
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_queue_recent_restore`,
  });
  const conversation = conversationStore.create({ title: "Queue recent restore" });
  const syncCalls = [];
  let chatCalls = 0;
  const executionSyncClient = {
    controlQueuedExecution(executionId, action, payload) {
      syncCalls.push([executionId, action, payload]);
      return Promise.resolve({ success: true });
    },
  };
  const firstState = createAssistantPanelState({
    conversationId: conversation.id,
    conversationStore,
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient,
  });

  const first = await firstState.sendMessage("把新资产4那个排队任务移动到最后");
  await firstState.lastExecutionSyncPromise;
  const persisted = conversationStore.get(conversation.id);
  const restoredState = createAssistantPanelState({
    conversationId: conversation.id,
    conversationStore,
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient,
  });

  assert.equal(first?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(restoredState.restoreConversation(persisted), true);
  assert.equal(restoredState.canSendMessage("把它移动到第一个排队任务"), true);

  const second = await restoredState.sendMessage("把它移动到第一个排队任务");
  await restoredState.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(second?.queueControl?.action, "move");
  assert.equal(second?.queueControl?.executionId, "exec-queued-asset-4");
  assert.equal(second?.queueControl?.targetIndex, 0);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => [item.id, item.status, item.queueIndex]), [
    ["exec-queued-asset-4", "queued", 1],
    ["exec-queued-prompt", "queued", 2],
    ["exec-queued-asset-5", "queued_draft", 3],
  ]);
  assert.deepEqual(syncCalls, [
    ["exec-queued-asset-4", "move", { targetIndex: 2 }],
    ["exec-queued-asset-4", "move", { targetIndex: 0 }],
  ]);
});

test("appAssistantPanel Phase 2 UI: natural-language queue command enables send button when model config is missing", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-send-button",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionSyncClient: false,
    api: {
      async chat() {
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "\u53d6\u6d88\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1";
  input.dispatchEvent({ type: "input" });

  assert.equal(panel.root.querySelector(".hy-canvas-agent-send").disabled, false);
  await panel.send(input.value);
  assert.equal(executionStore.getExecution("exec-queued-1").status, "cancelled");
});

test("appAssistantPanel Phase 2 UI: natural-language active execution pause and resume bypass model guard", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-active-execution-control",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-control",
    title: "Active canvas task",
    status: "executing",
    drawerState: { visible: true, line1: "Active canvas task", line2: "Running current task" },
  });
  const calls = [];
  let chatCalls = 0;
  const executionOrchestrator = {
    pause(executionId) {
      calls.push(["pause", executionId]);
      executionStore.updateStatus(executionId, "paused", {
        drawerState: { visible: true, line2: "Paused locally" },
      });
      return { status: "pause_requested" };
    },
    async resume(executionId, options) {
      calls.push(["resume", executionId, options]);
      executionStore.updateStatus(executionId, "executing", {
        drawerState: { visible: true, line2: "Resumed locally" },
      });
      return { status: "executing" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "\u6682\u505c\u5f53\u524d\u4efb\u52a1";
  input.dispatchEvent({ type: "input" });

  assert.equal(panel.root.querySelector(".hy-canvas-agent-send").disabled, false);
  const pauseResponse = await panel.send(input.value);
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.equal(pauseResponse?.executionControl?.action, "pause");
  assert.equal(pauseResponse?.executionControl?.executionId, "exec-active-control");
  assert.deepEqual(calls, [["pause", "exec-active-control"]]);
  assert.equal(executionStore.getExecution("exec-active-control").status, "paused");
  assert.match(panel.state.messages.at(-1)?.content || "", /\u5df2\u6682\u505c\u5f53\u524d\u4efb\u52a1/);

  input.value = "\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1";
  input.dispatchEvent({ type: "input" });

  assert.equal(panel.root.querySelector(".hy-canvas-agent-send").disabled, false);
  const resumeResponse = await panel.send(input.value);
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.equal(resumeResponse?.executionControl?.action, "resume");
  assert.equal(resumeResponse?.executionControl?.executionId, "exec-active-control");
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], "resume");
  assert.equal(calls[1][1], "exec-active-control");
  assert.equal(calls[1][2].videoAuthorized, false);
  assert.equal(executionStore.getExecution("exec-active-control").status, "executing");
  assert.match(panel.state.messages.at(-1)?.content || "", /\u5df2\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1/);
});

test("appAssistantPanel Phase 2 UI: natural-language active execution cancel bypasses model guard", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-active-execution-cancel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-cancel",
    title: "Active canvas task",
    status: "executing",
    drawerState: { visible: true, line1: "Active canvas task", line2: "Running current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-after-cancel",
    title: "Queued follow-up",
    drawerState: { visible: false, line1: "Queued follow-up", line2: "Waiting" },
  });
  const calls = [];
  let chatCalls = 0;
  const executionOrchestrator = {
    cancel(executionId) {
      calls.push(["cancel", executionId]);
      return executionStore.updateStatus(executionId, "cancelled", {
        progress: { done: 0, total: 2 },
        orchestratorState: { nextActionIndex: 0, pausedAtActionId: "", running: false },
        drawerState: { visible: true, line2: "Cancelled locally" },
      });
    },
  };
  const panel = createAppAssistantPanel({
    document: createFakeDocument(),
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "\u53d6\u6d88\u5f53\u524d\u4efb\u52a1";
  input.dispatchEvent({ type: "input" });

  assert.equal(panel.root.querySelector(".hy-canvas-agent-send").disabled, false);
  const response = await panel.send(input.value);
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.deepEqual(calls, [["cancel", "exec-active-cancel"]]);
  assert.equal(response?.executionControl?.action, "cancel");
  assert.equal(response?.executionControl?.executionId, "exec-active-cancel");
  assert.equal(executionStore.getExecution("exec-active-cancel").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-after-cancel").status, "queued");
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), ["exec-queued-after-cancel"]);
  assert.match(panel.state.messages.at(-1)?.content || "", /\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1/);
});

test("appAssistantPanel Phase 2 UI: natural-language active-task cancel does not cancel queued work", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-active-task-wording",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  const response = await state.sendMessage("\u53d6\u6d88\u5f53\u524d\u4efb\u52a1");

  assert.equal(chatCalls, 0);
  assert.equal(response?.executionControl?.action, "cancel");
  assert.equal(response?.executionControl?.executionId, "exec-active");
  assert.equal(executionStore.getExecution("exec-active").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-1").status, "queued");
  assert.equal(state.status, "done_no_actions");
});

test("appAssistantPanel Phase 2 UI: ambiguous natural-language task control asks before mutating", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-control-ambiguity",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-ambiguous",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-ambiguous",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  let chatCalls = 0;
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionSyncClient: false,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "\u53d6\u6d88\u4efb\u52a1";
  input.dispatchEvent({ type: "input" });

  assert.equal(panel.root.querySelector(".hy-canvas-agent-send").disabled, false);
  const response = await panel.send(input.value);
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.equal(response?.executionControl?.action, "clarify");
  assert.equal(response?.executionControl?.requestedAction, "cancel");
  assert.equal(response?.executionControl?.status, "needs_clarification");
  assert.equal(executionStore.getExecution("exec-active-ambiguous").status, "executing");
  assert.equal(executionStore.getExecution("exec-queued-ambiguous").status, "queued");
  assert.match(panel.state.messages.at(-1)?.content || "", /\u53d6\u6d88\u5f53\u524d\u4efb\u52a1/);
  assert.match(panel.state.messages.at(-1)?.content || "", /\u53d6\u6d88\u6392\u961f\u4efb\u52a1/);
  assert.equal(panel.state.status, "done_no_actions");
});

test("appAssistantPanel Phase 2 UI: ambiguous natural-language pause asks before mutating", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-pause-ambiguity",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-pause-ambiguous",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-pause-ambiguous",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  assert.equal(state.canSendMessage("\u6682\u505c\u4efb\u52a1"), true);
  const response = await state.sendMessage("\u6682\u505c\u4efb\u52a1");

  assert.equal(chatCalls, 0);
  assert.equal(response?.executionControl?.action, "clarify");
  assert.equal(response?.executionControl?.requestedAction, "pause");
  assert.equal(executionStore.getExecution("exec-active-pause-ambiguous").status, "executing");
  assert.equal(executionStore.getExecution("exec-queued-pause-ambiguous").status, "queued");
  assert.match(state.messages.at(-1)?.content || "", /\u6682\u505c\u5f53\u524d\u4efb\u52a1/);
  assert.match(state.messages.at(-1)?.content || "", /\u6682\u505c\u6392\u961f\u4efb\u52a1/);
});

test("appAssistantPanel Phase 2 UI: ambiguous natural-language resume asks before mutating", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-resume-ambiguity",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-resume-ambiguous",
    title: "Active render",
    status: "paused",
    drawerState: { visible: true, line1: "Active render", line2: "Paused current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-resume-ambiguous",
    title: "Queued first",
    drawerState: {
      visible: false,
      line1: "Queued first",
      line2: "Paused queued task",
      queuePaused: true,
    },
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  assert.equal(state.canSendMessage("\u7ee7\u7eed\u4efb\u52a1"), true);
  const response = await state.sendMessage("\u7ee7\u7eed\u4efb\u52a1");

  assert.equal(chatCalls, 0);
  assert.equal(response?.executionControl?.action, "clarify");
  assert.equal(response?.executionControl?.requestedAction, "resume");
  assert.equal(executionStore.getExecution("exec-active-resume-ambiguous").status, "paused");
  assert.equal(executionStore.getExecution("exec-queued-resume-ambiguous").drawerState.queuePaused, true);
  assert.match(state.messages.at(-1)?.content || "", /\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1/);
  assert.match(state.messages.at(-1)?.content || "", /\u7ee7\u7eed\u6392\u961f\u4efb\u52a1/);
});

test("appAssistantPanel Phase 2 UI: ambiguous follow-up current target executes requested active control", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-current",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-current",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-current",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  let chatCalls = 0;
  const cancelCalls = [];
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        cancelCalls.push(executionId);
        executionStore.updateStatus(executionId, "cancelled", {
          drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "cancelled" };
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  await state.sendMessage("\u53d6\u6d88\u4efb\u52a1");

  assert.equal(state.canSendMessage("\u5f53\u524d\u4efb\u52a1"), true);
  const response = await state.sendMessage("\u5f53\u524d\u4efb\u52a1");

  assert.equal(chatCalls, 0);
  assert.deepEqual(cancelCalls, ["exec-active-clarify-current"]);
  assert.equal(response?.executionControl?.action, "cancel");
  assert.equal(response?.executionControl?.executionId, "exec-active-clarify-current");
  assert.equal(executionStore.getExecution("exec-active-clarify-current").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-clarify-current").status, "queued");
});

test("appAssistantPanel Phase 2 UI: ambiguous follow-up queue target executes requested queue control", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-queue",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-queue",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-queue",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true });
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  await state.sendMessage("\u6682\u505c\u4efb\u52a1");

  assert.equal(state.canSendMessage("\u6392\u961f\u4efb\u52a1"), true);
  const response = await state.sendMessage("\u6392\u961f\u4efb\u52a1");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(response?.queueControl?.action, "pause");
  assert.equal(response?.queueControl?.executionId, "exec-queued-clarify-queue");
  assert.equal(executionStore.getExecution("exec-active-clarify-queue").status, "executing");
  assert.equal(executionStore.getExecution("exec-queued-clarify-queue").drawerState.queuePaused, true);
  assert.deepEqual(syncCalls, [["exec-queued-clarify-queue", "pause"]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous clarification card current button executes requested active control", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-current-card",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-current-card",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-current-card",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const cancelCalls = [];
  let chatCalls = 0;
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        cancelCalls.push(executionId);
        executionStore.updateStatus(executionId, "cancelled", {
          drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "cancelled" };
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("\u53d6\u6d88\u4efb\u52a1");
  await panel.flush();

  const currentButton = panel.root.querySelector(".hy-canvas-agent-clarify-current");
  const queueButton = panel.root.querySelector(".hy-canvas-agent-clarify-queue");
  assert.ok(currentButton);
  assert.ok(queueButton);
  assert.match(currentButton.textContent || "", /\u5f53\u524d\u4efb\u52a1/);
  assert.match(queueButton.textContent || "", /\u6392\u961f\u4efb\u52a1/);

  currentButton.click();
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.deepEqual(cancelCalls, ["exec-active-clarify-current-card"]);
  assert.equal(executionStore.getExecution("exec-active-clarify-current-card").status, "cancelled");
  assert.equal(executionStore.getExecution("exec-queued-clarify-current-card").status, "queued");
});

test("appAssistantPanel Phase 2 UI: ambiguous clarification card completes and disables after selection", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-card-complete",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-card-complete",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-card-complete",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const cancelCalls = [];
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        cancelCalls.push(executionId);
        executionStore.updateStatus(executionId, "cancelled", {
          drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "cancelled" };
      },
    },
    api: {
      async chat() {
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("\u53d6\u6d88\u4efb\u52a1");
  await panel.flush();

  panel.root.querySelector(".hy-canvas-agent-clarify-current").click();
  await panel.flush();

  const card = panel.root
    .querySelectorAll(".hy-canvas-agent-card")
    .find((item) => item.getAttribute("data-card-type") === "execution_control_clarification");
  const currentButton = panel.root.querySelector(".hy-canvas-agent-clarify-current");
  const queueButton = panel.root.querySelector(".hy-canvas-agent-clarify-queue");
  assert.equal(card?.getAttribute("data-status"), "completed");
  assert.equal(currentButton?.disabled, true);
  assert.equal(queueButton?.disabled, true);
  assert.equal(currentButton?.getAttribute("data-selected"), "true");

  currentButton.click();
  await panel.flush();

  assert.deepEqual(cancelCalls, ["exec-active-clarify-card-complete"]);
});

test("appAssistantPanel Phase 2 UI: ambiguous clarification card queue button executes requested queue control", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-queue-card",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-queue-card",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-queue-card",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const syncCalls = [];
  let chatCalls = 0;
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    executionSyncClient: {
      controlQueuedExecution(executionId, action) {
        syncCalls.push([executionId, action]);
        return Promise.resolve({ success: true });
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("\u6682\u505c\u4efb\u52a1");
  await panel.flush();

  const queueButton = panel.root.querySelector(".hy-canvas-agent-clarify-queue");
  assert.ok(queueButton);
  queueButton.click();
  await panel.flush();
  await panel.state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(executionStore.getExecution("exec-active-clarify-queue-card").status, "executing");
  assert.equal(executionStore.getExecution("exec-queued-clarify-queue-card").drawerState.queuePaused, true);
  assert.deepEqual(syncCalls, [["exec-queued-clarify-queue-card", "pause"]]);
});

test("appAssistantPanel Phase 2 UI: ambiguous clarification card is persisted to conversation store", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-persist",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-persist",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-persist",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const appended = [];
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    conversationId: "conv-clarify-persist",
    executionStore,
    conversationStore: {
      appendMessage(id, message) {
        appended.push({ id, message });
      },
    },
    api: {
      async chat() {
        throw new Error("LLM should not be called for local clarification");
      },
    },
  });

  await state.sendMessage("\u53d6\u6d88\u4efb\u52a1");

  const assistantMessage = appended.find((item) => item.message.role === "assistant")?.message;
  assert.equal(assistantMessage?.cards?.[0]?.type, "execution_control_clarification");
  assert.equal(assistantMessage?.cards?.[0]?.status, "needs_clarification");
  assert.equal(assistantMessage?.cards?.[0]?.action, "cancel");
});

test("appAssistantPanel Phase 2 UI: restored ambiguous clarification accepts current follow-up", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-restore",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-restore",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-restore",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const cancelCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        cancelCalls.push(executionId);
        executionStore.updateStatus(executionId, "cancelled", {
          drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "cancelled" };
      },
    },
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  const restored = state.restoreConversation({
    id: "conv-clarify-restore",
    title: "Clarify restore",
    messages: [
      { role: "user", content: "\u53d6\u6d88\u4efb\u52a1" },
      {
        role: "assistant",
        content: "\u4f60\u60f3\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\uff0c\u8fd8\u662f\u53d6\u6d88\u6392\u961f\u4efb\u52a1\uff1f",
        kind: "execution_control",
        cards: [
          {
            id: "execution_clarify_restore",
            type: "execution_control_clarification",
            status: "needs_clarification",
            action: "cancel",
            activeExecutionId: "exec-active-clarify-restore",
            queueCount: 1,
          },
        ],
      },
    ],
  });

  assert.equal(restored, true);
  assert.equal(state.canSendMessage("\u5f53\u524d\u4efb\u52a1"), true);

  const response = await state.sendMessage("\u5f53\u524d\u4efb\u52a1");

  assert.equal(chatCalls, 0);
  assert.deepEqual(cancelCalls, ["exec-active-clarify-restore"]);
  assert.equal(response?.executionControl?.executionId, "exec-active-clarify-restore");
  assert.equal(state.messages[1].cards[0].status, "completed");
});

test("appAssistantPanel Phase 2 UI: completed clarification card is persisted after selection", async () => {
  const conversationStore = createAssistantConversationStore({
    storage: memoryStorage(),
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_clarify_complete`,
  });
  const conversation = conversationStore.create({ title: "Clarify complete" });
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-persist-complete",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-persist-complete",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-persist-complete",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    conversationId: conversation.id,
    conversationStore,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        executionStore.updateStatus(executionId, "cancelled", {
          drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "cancelled" };
      },
    },
    api: {
      async chat() {
        throw new Error("LLM should not be called for local clarification");
      },
    },
  });

  await state.sendMessage("\u53d6\u6d88\u4efb\u52a1");
  await state.sendMessage("\u5f53\u524d\u4efb\u52a1");

  const storedCard = conversationStore
    .get(conversation.id)
    .messages.flatMap((message) => message.cards || [])
    .find((card) => card.type === "execution_control_clarification");
  assert.equal(storedCard?.status, "completed");
  assert.equal(storedCard?.selectedTarget, "active");
});

test("appAssistantPanel Phase 2 UI: new ambiguous clarification archives the previous pending card", async () => {
  const conversationStore = createAssistantConversationStore({
    storage: memoryStorage(),
    clock: () => "2026-06-10T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_clarify_archive`,
  });
  const conversation = conversationStore.create({ title: "Clarify archive" });
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-archive",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-archive",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-archive",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const cancelCalls = [];
  const pauseCalls = [];
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    conversationId: conversation.id,
    conversationStore,
    executionStore,
    executionOrchestrator: {
      async cancel(executionId) {
        cancelCalls.push(executionId);
        return { status: "cancelled" };
      },
      async pause(executionId) {
        pauseCalls.push(executionId);
        executionStore.updateStatus(executionId, "paused", {
          drawerState: { visible: true, line2: "\u5df2\u6682\u505c\u5f53\u524d\u4efb\u52a1" },
        });
        return { status: "paused" };
      },
    },
    api: {
      async chat() {
        throw new Error("LLM should not be called for local clarification archive");
      },
    },
  });

  await state.sendMessage("\u53d6\u6d88\u4efb\u52a1");
  await state.sendMessage("\u6682\u505c\u4efb\u52a1");

  const storedCards = conversationStore
    .get(conversation.id)
    .messages.flatMap((message) => message.cards || [])
    .filter((card) => card.type === "execution_control_clarification");
  assert.equal(storedCards.length, 2);
  assert.equal(storedCards[0].status, "archived");
  assert.match(storedCards[0].summary, /\u65b0\u7684\u6f84\u6e05\u8bf7\u6c42/);
  assert.equal(storedCards[1].status, "needs_clarification");
  assert.equal(storedCards[1].action, "pause");
  assert.equal(state.messages[1].cards[0].status, "archived");
  assert.equal(state.messages[3].cards[0].status, "needs_clarification");

  const response = await state.sendMessage("\u5f53\u524d\u4efb\u52a1");

  assert.deepEqual(cancelCalls, []);
  assert.deepEqual(pauseCalls, ["exec-active-clarify-archive"]);
  assert.equal(response?.executionControl?.action, "pause");
  const cardsAfterSelection = conversationStore
    .get(conversation.id)
    .messages.flatMap((message) => message.cards || [])
    .filter((card) => card.type === "execution_control_clarification");
  assert.equal(cardsAfterSelection[0].status, "archived");
  assert.equal(cardsAfterSelection[1].status, "completed");
  assert.equal(cardsAfterSelection[1].selectedTarget, "active");
});

test("appAssistantPanel Phase 2 UI: archived clarification cards render disabled", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-task-clarify-archive-render",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active-clarify-archive-render",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-clarify-archive-render",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        throw new Error("LLM should not be called for local clarification archive render");
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("\u53d6\u6d88\u4efb\u52a1");
  await panel.flush();
  await panel.send("\u6682\u505c\u4efb\u52a1");
  await panel.flush();

  const cards = panel.root
    .querySelectorAll(".hy-canvas-agent-card")
    .filter((item) => item.getAttribute("data-card-type") === "execution_control_clarification");
  assert.equal(cards.length, 2);
  assert.equal(cards[0].getAttribute("data-status"), "archived");
  assert.equal(cards[0].querySelector(".hy-canvas-agent-clarify-current").disabled, true);
  assert.equal(cards[0].querySelector(".hy-canvas-agent-clarify-queue").disabled, true);
  assert.equal(cards[1].getAttribute("data-status"), "needs_clarification");
  assert.equal(cards[1].querySelector(".hy-canvas-agent-clarify-current").disabled, false);
  assert.equal(cards[1].querySelector(".hy-canvas-agent-clarify-queue").disabled, false);
});

test("appAssistantPanel Phase 2 UI: natural-language canvas node wording is not mistaken for queue control", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-node-wording",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.enqueueExecution({
    id: "exec-queued-1",
    title: "Queued first",
    drawerState: { visible: false, line1: "Queued first", line2: "Waiting first" },
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  const response = await state.sendMessage("\u53d6\u6d88\u7b2c\u4e00\u4e2a\u8282\u70b9");

  assert.equal(response, null);
  assert.equal(chatCalls, 0);
  assert.equal(executionStore.getExecution("exec-queued-1").status, "queued");
  assert.equal(state.status, "error");
});


test("appAssistantPanel Phase 2 UI: queue warning appears when queue is longer than five", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queue-warning",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active batch",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Active batch 1/4",
      line2: "Running active task",
    },
    plan: {
      steps: [{ id: "active-step", title: "Active step" }],
    },
  });
  for (let index = 1; index <= 5; index += 1) {
    executionStore.enqueueExecution({
      id: `exec-queued-${index}`,
      title: `Queued task ${index}`,
      drawerState: { visible: false, line1: `Queued task ${index}`, line2: "Waiting in queue" },
      plan: { steps: [{ id: `queued-step-${index}`, title: `Queued step ${index}` }] },
    });
  }
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    api: {
      async chat() {
        return {
          reply: "New queued plan.",
          plan: {
            id: "plan-overflow",
            title: "Overflow queued task",
            steps: [{ id: "step-overflow", title: "Overflow step" }],
          },
          actionsByStep: {
            "step-overflow": [{ type: "layout_nodes", nodeIds: ["node-overflow"] }],
          },
          execution: {
            id: "exec-overflow",
            status: "draft",
            drawerState: {
              visible: true,
              line1: "Overflow queued task 0/1",
              line2: "Waiting behind a long queue",
            },
          },
        };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("queue another task");
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const queued = executionStore.getExecution("exec-overflow");
  assert.equal(queued.status, "queued_draft");
  assert.equal(queued.drawerState.queueWarning, true);
  assert.equal(executionStore.snapshot().queue.length, 6);

  const warning = panel.root.querySelector(".hy-canvas-agent-execution-queue-warning");
  assert.ok(warning);
  assert.match(warning.textContent, new RegExp("\\u961f\\u5217\\u8f83\\u957f"));
  assert.match(warning.textContent, /6/);
});

test("appAssistantPanel Phase 2 UI: queue warning stays hidden at five queued tasks", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-queue-warning-boundary",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active batch",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Active batch 1/4",
      line2: "Running active task",
    },
    plan: {
      steps: [{ id: "active-step", title: "Active step" }],
    },
  });
  for (let index = 1; index <= 5; index += 1) {
    executionStore.enqueueExecution({
      id: `exec-queued-${index}`,
      title: `Queued task ${index}`,
      drawerState: { visible: false, line1: `Queued task ${index}`, line2: "Waiting in queue" },
      plan: { steps: [{ id: `queued-step-${index}`, title: `Queued step ${index}` }] },
    });
  }
  const panel = createAppAssistantPanel({ document, executionStore });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  assert.equal(executionStore.snapshot().queue.length, 5);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-queue-warning"), null);
});

test("appAssistantPanel Phase 2 UI: timeline auto-scroll pauses after manual scroll then resumes", async () => {
  const document = createFakeDocument();
  const timers = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-timeline-scroll",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-scroll",
    title: "Timeline scroll task",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Timeline scroll task",
      line2: "Running timeline",
    },
    plan: {
      steps: [{ id: "scroll-step", title: "Scroll step", status: "executing" }],
    },
  });
  for (let index = 0; index < 5; index += 1) {
    executionStore.appendTimelineEvent("exec-scroll", {
      id: `evt-${index}`,
      humanSummary: `Timeline event ${index}`,
    });
  }
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    setTimeoutFn(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    clearTimeoutFn() {},
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const timeline = panel.root.querySelector(".hy-canvas-agent-execution-timeline");
  assert.equal(timeline.getAttribute("data-auto-scroll-paused"), "false");
  assert.equal(timeline.scrollTop, timeline.scrollHeight - timeline.clientHeight);

  timeline.scrollTop = 12;
  timeline.dispatchEvent({ type: "scroll" });
  assert.equal(timers[0].ms, 5000);

  executionStore.appendTimelineEvent("exec-scroll", {
    id: "evt-late",
    humanSummary: "Late timeline event",
  });
  panel.render();

  const pausedTimeline = panel.root.querySelector(".hy-canvas-agent-execution-timeline");
  assert.equal(pausedTimeline.getAttribute("data-auto-scroll-paused"), "true");
  assert.equal(pausedTimeline.scrollTop, 12);

  timers[0].callback();

  const resumedTimeline = panel.root.querySelector(".hy-canvas-agent-execution-timeline");
  assert.equal(resumedTimeline.getAttribute("data-auto-scroll-paused"), "false");
  assert.equal(resumedTimeline.scrollTop, resumedTimeline.scrollHeight - resumedTimeline.clientHeight);
});

test("appAssistantPanel Phase 2 UI: timeline detail can focus affected canvas nodes", async () => {
  const document = createFakeDocument();
  const graphStore = {
    selectedNodeIds: [],
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-timeline-focus",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-focus",
    title: "Timeline focus task",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Timeline focus task",
      line2: "Created image node",
    },
    plan: {
      steps: [{ id: "focus-step", title: "Create image", status: "completed" }],
    },
  });
  executionStore.appendTimelineEvent("exec-focus", {
    id: "evt-focus",
    humanSummary: "Created image node",
    nodeIds: ["image-1", "text-1"],
  });
  const panel = createAppAssistantPanel({ document, executionStore, graphStore });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  const focusButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-focus");
  assert.ok(focusButton);
  focusButton.click();

  assert.deepEqual(graphStore.selectedNodeIds, ["image-1", "text-1"]);
});

test("appAssistantPanel Phase 3 UI: selected timeline event can retry that action through orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-timeline-event-retry",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-event-retry",
    title: "Timeline event retry task",
    status: "failed",
    drawerState: {
      visible: true,
      line1: "Timeline event retry task",
      line2: "Connect failed",
    },
    orchestratorState: {
      nextActionIndex: 1,
      pausedAtActionId: "act-connect",
      running: false,
    },
    plan: {
      steps: [
        { id: "step-create", title: "Create text" },
        { id: "step-connect", title: "Connect image" },
      ],
    },
    actionsByStep: {
      "step-create": [{ id: "act-create", type: "create_node", nodeId: "text-1" }],
      "step-connect": [{ id: "act-connect", type: "connect_nodes", from: "text-1", to: "image-1" }],
    },
  });
  executionStore.appendTimelineEvent("exec-event-retry", {
    id: "evt-connect-failed",
    stepId: "step-connect",
    actionId: "act-connect",
    status: "failed",
    humanSummary: "连线执行失败",
    canRetry: true,
  });
  const executionOrchestrator = {
    async retry(executionId, options) {
      calls.push(["retry", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Selected event retry completed" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  const retryButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-retry");
  assert.ok(retryButton);
  assert.equal(retryButton.textContent, "重试此步");
  retryButton.click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "retry");
  assert.equal(calls[0][1], "exec-event-retry");
  assert.equal(calls[0][2].actionId, "act-connect");
  assert.equal(calls[0][2].eventId, "evt-connect-failed");
  assert.equal(calls[0][2].agentMode, "plan");
  assert.equal(calls[0][2].videoAuthorized, false);
  assert.equal(executionStore.getExecution("exec-event-retry").status, "completed");
});

test("appAssistantPanel Phase 3 UI: selected timeline event can skip that action through orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-timeline-event-skip",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-event-skip",
    title: "Timeline event skip task",
    status: "failed",
    drawerState: {
      visible: true,
      line1: "Timeline event skip task",
      line2: "Connect failed",
    },
    orchestratorState: {
      nextActionIndex: 1,
      pausedAtActionId: "act-connect",
      running: false,
    },
    plan: {
      steps: [
        { id: "step-create", title: "Create text" },
        { id: "step-connect", title: "Connect image" },
      ],
    },
    actionsByStep: {
      "step-create": [{ id: "act-create", type: "create_node", nodeId: "text-1" }],
      "step-connect": [{ id: "act-connect", type: "connect_nodes", from: "text-1", to: "image-1" }],
    },
  });
  executionStore.appendTimelineEvent("exec-event-skip", {
    id: "evt-connect-failed",
    stepId: "step-connect",
    actionId: "act-connect",
    status: "failed",
    humanSummary: "连线执行失败",
    canRetry: true,
  });
  const executionOrchestrator = {
    async skip(executionId, options) {
      calls.push(["skip", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Selected event skipped" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  const skipButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-skip");
  assert.ok(skipButton);
  assert.equal(skipButton.textContent, "跳过此步");
  skipButton.click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "skip");
  assert.equal(calls[0][1], "exec-event-skip");
  assert.equal(calls[0][2].actionId, "act-connect");
  assert.equal(calls[0][2].eventId, "evt-connect-failed");
  assert.equal(executionStore.getExecution("exec-event-skip").status, "completed");
});

test("appAssistantPanel Phase 3 UI: source event detail lists blocked dependent steps", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dependency-detail",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-dependency-detail",
    title: "Dependency detail task",
    status: "paused",
    drawerState: {
      visible: true,
      line1: "Dependency detail task",
      line2: "已暂停：2 个后续步骤依赖失败步骤",
    },
    plan: {
      steps: [
        { id: "step-source", title: "Create source" },
        { id: "step-image", title: "Generate image", dependsOn: ["step-source"] },
        { id: "step-connect", title: "Connect result", dependsOn: ["step-source"] },
      ],
    },
  });
  executionStore.appendTimelineEvent("exec-dependency-detail", {
    id: "evt-source-failed",
    stepId: "step-source",
    actionId: "act-source",
    status: "failed",
    humanSummary: "执行失败：Create source",
    canRetry: true,
  });
  executionStore.appendTimelineEvent("exec-dependency-detail", {
    id: "evt-image-blocked",
    stepId: "step-image",
    actionId: "act-image",
    status: "dependency_blocked",
    humanSummary: "已暂停：Generate image 依赖失败步骤",
    developer: {
      blockedByStepId: "step-source",
      blockedByActionId: "act-source",
      blockedByEventId: "evt-source-failed",
    },
  });
  executionStore.appendTimelineEvent("exec-dependency-detail", {
    id: "evt-connect-blocked",
    stepId: "step-connect",
    actionId: "act-connect",
    status: "dependency_blocked",
    humanSummary: "已暂停：Connect result 依赖失败步骤",
    developer: {
      blockedByStepId: "step-source",
      blockedByActionId: "act-source",
      blockedByEventId: "evt-source-failed",
    },
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator: { async retry() { return { status: "paused" }; } },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  const dependencyDetail = panel.root.querySelector(".hy-canvas-agent-execution-dependency-detail");
  assert.ok(dependencyDetail);
  assert.match(dependencyDetail.textContent, /后续 2 步依赖这一步/);
  assert.match(dependencyDetail.textContent, /Generate image/);
  assert.match(dependencyDetail.textContent, /Connect result/);
});

test("appAssistantPanel Phase 3 UI: selected video timeline event authorizes that action through orchestrator retry", async () => {
  const document = createFakeDocument();
  const calls = [];
  const skips = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-timeline-video-authorize",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-video-event-authorize",
    title: "Timeline video retry task",
    status: "waiting_video_authorization",
    drawerState: {
      visible: true,
      line1: "Timeline video retry task",
      line2: "需要先授权视频生成",
    },
    orchestratorState: {
      nextActionIndex: 0,
      pausedAtActionId: "act-video",
      running: false,
    },
    plan: {
      steps: [{ id: "step-video", title: "Generate video" }],
    },
    actionsByStep: {
      "step-video": [
        {
          id: "act-video",
          type: "queue_generation_task",
          nodeId: "video-1",
          nodeType: "ai-video",
          title: "Generate video",
        },
      ],
    },
  });
  executionStore.appendTimelineEvent("exec-video-event-authorize", {
    id: "evt-video-waiting",
    stepId: "step-video",
    actionId: "act-video",
    status: "waiting_video_authorization",
    humanSummary: "需要先授权视频生成",
    canRetry: true,
    developer: {
      actionJson: {
        id: "act-video",
        type: "queue_generation_task",
        nodeId: "video-1",
        nodeType: "ai-video",
        title: "Generate video",
      },
    },
  });
  const executionOrchestrator = {
    async retry(executionId, options) {
      calls.push(["retry", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Video event authorized" },
      });
      return { status: "completed" };
    },
    async skip(executionId, options) {
      skips.push(["skip", executionId, options]);
      return { status: "skipped" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    graphStore: { nodes: [{ id: "video-1", type: "ai-video", data: { nodeType: "ai-video" } }] },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  const authorizeButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-authorize-video");
  assert.ok(authorizeButton);
  assert.equal(authorizeButton.textContent, "授权视频");
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-detail-retry"), null);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-detail-skip"), null);

  authorizeButton.click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "retry");
  assert.equal(calls[0][1], "exec-video-event-authorize");
  assert.equal(calls[0][2].actionId, "act-video");
  assert.equal(calls[0][2].eventId, "evt-video-waiting");
  assert.equal(calls[0][2].videoAuthorized, true);
  assert.deepEqual(skips, []);
  assert.equal(executionStore.getExecution("exec-video-event-authorize").status, "completed");
});

test("appAssistantPanel Phase 3 UI: drawer pause and resume call execution orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-buttons",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-orchestrator-buttons",
    title: "Orchestrated task",
    status: "executing",
    drawerState: {
      visible: true,
      line1: "Orchestrated task 1/2",
      line2: "Running first action",
    },
  });
  const executionOrchestrator = {
    pause(executionId) {
      calls.push(["pause", executionId]);
      executionStore.updateStatus(executionId, "paused", {
        drawerState: { visible: true, line2: "Paused by orchestrator" },
      });
      return { status: "pause_requested" };
    },
    resume(executionId) {
      calls.push(["resume", executionId]);
      executionStore.updateStatus(executionId, "executing", {
        drawerState: { visible: true, line2: "Resumed by orchestrator" },
      });
      return Promise.resolve({ status: "executing" });
    },
  };
  const panel = createAppAssistantPanel({ document, executionStore, executionOrchestrator });

  panel.init();
  panel.open();

  const pauseButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(pauseButton.textContent, "暂停");
  pauseButton.click();
  await panel.flush();

  assert.deepEqual(calls, [["pause", "exec-orchestrator-buttons"]]);
  assert.equal(executionStore.getExecution("exec-orchestrator-buttons").status, "paused");
  const resumeButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(resumeButton.textContent, "继续");
  resumeButton.click();
  await panel.flush();

  assert.deepEqual(calls, [
    ["pause", "exec-orchestrator-buttons"],
    ["resume", "exec-orchestrator-buttons"],
  ]);
  assert.equal(executionStore.getExecution("exec-orchestrator-buttons").status, "executing");
});

test("appAssistantPanel Phase 3 UI: drawer confirm routes v2 execution through orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-confirm",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-orchestrator-confirm",
    title: "Confirm orchestrated task",
    status: "waiting_confirmation",
    drawerState: {
      visible: true,
      line1: "Confirm orchestrated task",
      line2: "Ready to run",
      pendingConfirmationCount: 1,
    },
    plan: {
      id: "plan-confirm",
      steps: [{ id: "step-layout", title: "Layout" }],
    },
    actionsByStep: {
      "step-layout": [{ type: "queue_generation_task", nodeId: "node-1", nodeType: "ai-image" }],
    },
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      calls.push(["run", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Completed by orchestrator" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    agentMode: "plan",
  });

  panel.init();
  panel.open();
  const confirmButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(confirmButton.textContent, "确认");
  confirmButton.click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "run");
  assert.equal(calls[0][1], "exec-orchestrator-confirm");
  assert.equal(calls[0][2].agentMode, "plan");
  assert.equal(calls[0][2].videoAuthorized, false);
  assert.equal(executionStore.getExecution("exec-orchestrator-confirm").status, "completed");
});

test("appAssistantPanel Phase 3 UI: default orchestrator prepares queued execution with latest canvas context", async () => {
  const document = createFakeDocument();
  const graphStore = { nodes: [{ id: "fresh-node", type: "text" }] };
  const freshContext = { canvas: { nodeCount: 1 }, selectedNodeIds: ["fresh-node"] };
  const buildContextCalls = [];
  const prepareCalls = [];
  const executions = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-default-queued-prepare",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active task",
    status: "waiting_confirmation",
    drawerState: {
      visible: true,
      line1: "Active task",
      line2: "Ready to run",
      pendingConfirmationCount: 1,
    },
    plan: { id: "plan-active", steps: [{ id: "step-active", title: "Active step" }] },
    actionsByStep: {
      "step-active": [{ id: "act-active", type: "queue_generation_task", nodeId: "active-node", nodeType: "ai-video" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued",
    title: "Queued task",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Queued task", line2: "Waiting in queue" },
    plan: { id: "plan-stale", steps: [{ id: "step-queued", title: "Stale queued step" }] },
    actionsByStep: {
      "step-queued": [{ id: "act-stale", type: "layout_nodes", nodeIds: ["stale-node"] }],
    },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    agentMode: "act",
    buildContext({ graphStore: receivedGraphStore } = {}) {
      buildContextCalls.push(receivedGraphStore);
      return freshContext;
    },
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
      async prepareQueuedExecution(payload) {
        prepareCalls.push(payload);
        return {
          plan: { id: "plan-fresh", steps: [{ id: "step-queued", title: "Fresh queued step" }] },
          actionsByStep: {
            "step-queued": [{ id: "act-fresh", type: "layout_nodes", nodeIds: ["fresh-node"] }],
          },
          drawerState: { line2: "Prepared from latest canvas" },
        };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length, updatedNodeIds: payload.actions[0].nodeIds || [] };
    },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-action").click();
  await panel.flush();

  assert.deepEqual(buildContextCalls, [graphStore]);
  assert.equal(prepareCalls.length, 1);
  assert.equal(prepareCalls[0].executionId, "exec-queued");
  assert.equal(prepareCalls[0].execution.status, "queued_draft");
  assert.deepEqual(prepareCalls[0].context, freshContext);
  assert.equal(prepareCalls[0].agentMode, "act");
  assert.equal(prepareCalls[0].videoAuthorized, true);
  assert.deepEqual(
    executions.map((payload) => [payload.executionId, payload.actions[0].id]),
    [
      ["exec-active", "act-active"],
      ["exec-queued", "act-fresh"],
    ]
  );
  assert.deepEqual(executions[1].context, freshContext);
  assert.equal(executionStore.getExecution("exec-queued").actionsByStep["step-queued"][0].id, "act-fresh");
});

test("appAssistantPanel Phase 3 UI: drawer v2 video execution shows authorization instead of orchestrator confirm", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-video-confirm",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-orchestrator-video-confirm",
    title: "Video needs authorization",
    status: "waiting_confirmation",
    drawerState: {
      visible: true,
      line1: "Video needs authorization",
      line2: "Ready but video is blocked",
      pendingConfirmationCount: 1,
    },
    plan: {
      id: "plan-video-confirm",
      steps: [{ id: "step-video", title: "Generate video" }],
    },
    actionsByStep: {
      "step-video": [
        { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" },
      ],
    },
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      calls.push(["run", executionId, options]);
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    graphStore: { nodes: [{ id: "video-1", type: "ai-video", data: { nodeType: "ai-video" } }] },
  });

  panel.init();
  panel.open();

  const actionButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(actionButton.textContent, "确认");
  assert.equal(calls.length, 0);
});

test("appAssistantPanel Phase 3 UI: drawer v2 video authorization runs execution through orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const legacyExecutions = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-video-authorize",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-orchestrator-video-authorize",
    title: "Video authorization task",
    status: "waiting_video_authorization",
    drawerState: {
      visible: true,
      line1: "Video authorization task",
      line2: "Waiting for explicit authorization",
    },
    plan: {
      id: "plan-video-authorize",
      steps: [{ id: "step-video", title: "Generate video" }],
    },
    actionsByStep: {
      "step-video": [
        { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" },
      ],
    },
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      calls.push(["run", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Video completed by orchestrator" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    graphStore: { nodes: [{ id: "video-1", type: "ai-video", data: { nodeType: "ai-video" } }] },
    async executeActions(payload) {
      legacyExecutions.push(payload);
      return { appliedCount: payload.actions?.length || 0 };
    },
  });

  panel.init();
  panel.open();
  const actionButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(actionButton.textContent, "确认");
  actionButton.click();
  await panel.flush();

  assert.deepEqual(legacyExecutions, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "run");
  assert.equal(calls[0][1], "exec-orchestrator-video-authorize");
  assert.equal(calls[0][2].videoAuthorized, true);
  assert.equal(executionStore.getExecution("exec-orchestrator-video-authorize").status, "completed");
});

test("appAssistantPanel Phase 3 UI: drawer retry routes failed execution through orchestrator", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-orchestrator-retry",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-orchestrator-retry",
    title: "Retry failed task",
    status: "failed",
    drawerState: {
      visible: true,
      line1: "Retry failed task",
      line2: "Action failed",
    },
    orchestratorState: {
      nextActionIndex: 1,
      pausedAtActionId: "act-connect",
      running: false,
    },
    plan: {
      id: "plan-retry",
      steps: [
        { id: "step-create", title: "Create text" },
        { id: "step-connect", title: "Connect image" },
      ],
    },
    actionsByStep: {
      "step-create": [{ id: "act-create", type: "create_node", nodeId: "text-1" }],
      "step-connect": [{ id: "act-connect", type: "connect_nodes", from: "text-1", to: "image-1" }],
    },
  });
  const executionOrchestrator = {
    async retry(executionId, options) {
      calls.push(["retry", executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "Retry completed by orchestrator" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
  });

  panel.init();
  panel.open();
  const actionButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(actionButton.textContent, "重试");
  actionButton.click();
  await panel.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "retry");
  assert.equal(calls[0][1], "exec-orchestrator-retry");
  assert.equal(calls[0][2].agentMode, "plan");
  assert.equal(calls[0][2].videoAuthorized, false);
  assert.equal(executionStore.getExecution("exec-orchestrator-retry").status, "completed");
});

test("appAssistantPanel Phase 2 UI: drawer video authorization button explicitly authorizes current batch", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-video-drawer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const validations = [];
  const executions = [];
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    graphStore: { nodes: [{ id: "video-1", type: "ai-video", data: { nodeType: "ai-video" } }] },
    api: {
      async chat() {
        return {
          reply: "Video plan needs authorization.",
          execution: {
            id: "exec-video-drawer",
            status: "waiting_video_authorization",
            drawerState: {
              visible: true,
              line1: "视频生成待授权",
              line2: "点击授权视频后才会生成",
            },
          },
          actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video", prompt: "make video" }],
        };
      },
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length };
    },
  });

  panel.init();
  panel.open();
  await panel.send("make video");
  panel.root.querySelector(".hy-canvas-agent-execution-action").click();
  await panel.flush();

  assert.equal(validations.length, 1);
  assert.equal(validations[0].videoAuthorized, true);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].videoAuthorized, true);
  assert.equal(panel.state.pendingActions.length, 0);
});

test("appAssistantPanel Phase 2 UI: drawer confirm applies non-video actions without video authorization", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-confirm-drawer",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const validations = [];
  const executions = [];
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    api: {
      async chat() {
        return {
          reply: "Layout plan needs confirmation.",
          execution: {
            id: "exec-confirm-drawer",
            status: "waiting_confirmation",
            drawerState: {
              visible: true,
              line1: "整理画布待确认",
              line2: "点击确认后整理节点",
              pendingConfirmationCount: 1,
            },
          },
          actions: [{ type: "layout_nodes", nodeIds: ["node-1"], layout: "single_chain" }],
        };
      },
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length };
    },
  });

  panel.init();
  panel.open();
  await panel.send("layout canvas");
  await panel.flush();

  const confirmButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.notEqual(confirmButton?.textContent, "确认");
  assert.equal(validations.length, 1);
  assert.notEqual(validations[0].videoAuthorized, true);
  assert.equal(executions.length, 1);
  assert.notEqual(executions[0].videoAuthorized, true);
});

test("appAssistantPanel Phase 2 UI: video pending actions show authorize instead of generic confirm", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-video-label",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    graphStore: { nodes: [{ id: "video-2", type: "ai-video", data: { nodeType: "ai-video" } }] },
    api: {
      async chat() {
        return {
          reply: "Video plan needs explicit authorization.",
          execution: {
            id: "exec-video-label",
            status: "waiting_confirmation",
            drawerState: {
              visible: true,
              line1: "视频生成待确认",
              line2: "视频生成需要明确授权",
              pendingConfirmationCount: 1,
            },
          },
          actions: [{ type: "queue_generation_task", nodeId: "video-2", nodeType: "ai-video", prompt: "make video" }],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("make video");

  const actionButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.ok(actionButton);
  assert.equal(actionButton.textContent, "确认");
});

test("appAssistantPanel P1 UI: new conversation and history buttons use the conversation store", async () => {
  const document = createFakeDocument();
  const conversations = [
    {
      id: "conv-old",
      title: "历史会话",
      messages: [{ role: "user", content: "旧消息" }],
    },
  ];
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    conversationStore: {
      create() {
        const item = { id: "conv-new", title: "新会话", messages: [] };
        conversations.unshift(item);
        return item;
      },
      list() {
        return conversations;
      },
      appendMessage() {},
      attachContextSnapshot() {},
    },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-icon-btn").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-history").hidden, false);
  assert.match(panel.root.querySelector(".hy-canvas-agent-history").textContent, /历史会话/);

  panel.root.querySelectorAll(".hy-canvas-agent-icon-btn")[1].click();
  await panel.flush();
  assert.match(panel.root.querySelector(".hy-canvas-agent-session").textContent, /conv-new/);
});

test("appAssistantPanel P1 UI: model button opens configured text models only", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    modelOptions: [
      {
        provider: "model_registry",
        id: "text-first",
        model: "alpha-chat",
        displayName: "Alpha Text",
        configured: true,
        supportsText: true,
      },
      {
        provider: "model_registry",
        id: "text-second",
        model: "beta-chat",
        displayName: "Beta Text",
        configured: true,
        supportsText: true,
      },
      {
        provider: "pi_canvas_agent",
        model: "agent-model",
        displayName: "Agent Model",
        configured: true,
        supportsText: true,
        supportsTools: true,
      },
      {
        provider: "model_registry",
        id: "text-failed",
        model: "failed-chat",
        displayName: "Failed Text",
        configured: true,
        supportsText: true,
        status: "failed",
      },
    ],
  });

  panel.init();
  panel.open();
  const modelButton = panel.root.querySelector(".hy-canvas-agent-mode-pill");
  assert.match(modelButton.textContent, /Alpha Text/);
  assert.doesNotMatch(modelButton.textContent, /model_registry|alpha-chat/);

  modelButton.click();
  await panel.flush();
  const modelMenu = panel.root.querySelector(".hy-canvas-agent-model-menu");
  assert.equal(modelMenu.hidden, false);
  assert.match(modelMenu.textContent, /Alpha Text/);
  assert.match(modelMenu.textContent, /Beta Text/);
  assert.match(modelMenu.textContent, /Failed Text/);
  assert.doesNotMatch(modelMenu.textContent, /Agent Model/);
});

test("appAssistantPanel P1 UI: model menu mirrors text node rules and allows untested models", async () => {
  const document = createFakeDocument();
  const chatCalls = [];
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat(payload) {
        chatCalls.push(payload);
        return { reply: "ok", actions: [] };
      },
    },
    modelOptions: [
      {
        provider: "model_registry",
        id: "text-failed",
        model: "gemini-3.1-pro",
        displayName: "Gemini 3.1",
        configured: true,
        supportsText: true,
        status: "failed",
      },
      {
        provider: "model_registry",
        id: "text-no-key",
        model: "nokey-chat",
        displayName: "Missing Key",
        configured: false,
        disabledReason: "缺少 API Key",
        supportsText: true,
        status: "unverified",
      },
      {
        provider: "model_registry",
        id: "text-deleted",
        model: "deleted-chat",
        displayName: "Deleted Text",
        configured: true,
        supportsText: true,
        status: "deleted",
      },
    ],
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-mode-pill").click();
  await panel.flush();

  const modelMenu = panel.root.querySelector(".hy-canvas-agent-model-menu");
  assert.match(modelMenu.textContent, /Gemini 3\.1/);
  assert.match(modelMenu.textContent, /Missing Key/);
  assert.doesNotMatch(modelMenu.textContent, /Deleted Text/);

  const optionsEls = panel.root.querySelectorAll(".hy-canvas-agent-model-option");
  const missingKeyOption = optionsEls.find((option) => option.textContent.includes("Missing Key"));
  assert.ok(missingKeyOption.className.includes("is-disabled"));
  assert.match(missingKeyOption.textContent, /缺少 API Key/);

  const failedOption = optionsEls.find((option) => option.textContent.includes("Gemini 3.1"));
  assert.equal(failedOption.className.includes("is-disabled"), false);
  failedOption.click();
  await panel.flush();

  assert.equal(panel.state.selectedModel.id, "text-failed");

  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "你好";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();

  assert.equal(chatCalls.length, 1);
  assert.equal(chatCalls[0].model.id, "text-failed");
});

test("appAssistantPanel P1 UI: history drawer supports search and delete", async () => {
  const document = createFakeDocument();
  const conversations = [
    { id: "conv-story", title: "Story board", messages: [{ role: "user", content: "shots" }] },
    { id: "conv-commerce", title: "Commerce pack", messages: [{ role: "user", content: "sku" }] },
  ];
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    conversationStore: {
      list() {
        return conversations;
      },
      search(query) {
        const text = String(query || "").toLowerCase();
        return conversations.filter((item) => item.title.toLowerCase().includes(text));
      },
      delete(id) {
        const index = conversations.findIndex((item) => item.id === id);
        if (index >= 0) {
          conversations.splice(index, 1);
          return true;
        }
        return false;
      },
    },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-icon-btn").click();
  await panel.flush();
  const search = panel.root.querySelector(".hy-canvas-agent-history-search");
  search.value = "story";
  search.dispatchEvent({ type: "input" });
  await panel.flush();
  assert.match(panel.root.querySelector(".hy-canvas-agent-history").textContent, /Story board/);
  assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-history").textContent, /Commerce pack/);

  panel.root.querySelector(".hy-canvas-agent-history-delete").click();
  await panel.flush();
  assert.equal(conversations.some((item) => item.id === "conv-story"), false);
});

test("appAssistantPanel P1 UI: attachment files use uploader adapter before chip render", async () => {
  const document = createFakeDocument();
  const uploads = [];
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    attachmentStore: {
      items: [],
      async upload(file) {
        uploads.push(file.name);
        this.items.push({
          id: "att-uploaded",
          kind: "image",
          name: file.name,
          mime: file.type,
          assetId: "asset-1",
          previewUrl: "/data/uploads/reference.png",
          usage: "reference",
        });
        return this.items[0];
      },
      toContext() {
        return this.items;
      },
      remove() {},
    },
  });

  panel.init();
  panel.open();
  await panel.attachFiles([{ name: "reference.png", type: "image/png", size: 42 }]);

  assert.deepEqual(uploads, ["reference.png"]);
  assert.equal(
    panel.root.querySelector(".hy-canvas-agent-attachment-thumb").getAttribute("title"),
    "reference.png"
  );
});

test("appAssistantPanel P1 UI: reference uploads render thumbnail tile with remove and preview", async () => {
  const document = createFakeDocument();
  const store = {
    items: [{ id: "ref-1", name: "reference.png", kind: "image", previewUrl: "blob:ref-1", usage: "reference" }],
    list() {
      return this.items;
    },
    toContext() {
      return this.items.map((item) => ({ ...item, previewUrl: "" }));
    },
    remove(id) {
      this.items = this.items.filter((item) => item.id !== id);
    },
  };
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    attachmentStore: store,
  });

  panel.init();
  panel.open();
  panel.render();

  const tile = panel.root.querySelector(".hy-canvas-agent-attachment-thumb");
  assert.ok(tile);
  assert.equal(tile.querySelector("img").getAttribute("src"), "blob:ref-1");

  tile.click();
  const preview = panel.root.querySelector(".hy-canvas-agent-attachment-preview");
  assert.equal(preview.hidden, false);
  assert.equal(preview.querySelector("img").getAttribute("src"), "blob:ref-1");

  tile.querySelector(".hy-canvas-agent-attachment-remove").click();
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-attachment-thumb").length, 0);
});

test("appAssistantPanel P1 UI: attachment files fall back to local chips when no uploader is configured", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });

  panel.init();
  panel.open();
  await panel.attachFiles([{ name: "local-reference.png", type: "image/png", size: 64 }]);

  assert.match(panel.root.querySelector(".hy-canvas-agent-attachments").textContent, /local-reference\.png/);
});

test("appAssistantPanel P1 UI: routine attachment notices stay out of the chat receipt area", async () => {
  const document = createFakeDocument();
  const timers = [];
  const panel = createAppAssistantPanel({
    document,
    noticeDurationMs: 3000,
    noticeFadeMs: 160,
    setTimeoutFn(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    clearTimeoutFn() {},
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });

  panel.init();
  panel.open();
  await panel.attachFiles([{ name: "brief-reference.png", type: "image/png", size: 64 }]);
  const receipt = panel.root.querySelector(".hy-canvas-agent-receipt");

  assert.equal(receipt.hidden, true);
  assert.equal(receipt.textContent, "");
  assert.match(panel.root.querySelector(".hy-canvas-agent-attachments").textContent, /brief-reference\.png/);
  assert.equal(timers[0].ms, 3000);

  timers[0].callback();
  assert.equal(receipt.classList.contains("is-fading"), true);
  assert.equal(timers[1].ms, 160);

  timers[1].callback();
  assert.equal(receipt.hidden, true);
  assert.equal(receipt.textContent, "");
});

test("appAssistantPanel P1 UI: model selector opens a dropdown and selects an option", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    modelOptions: [
      {
        provider: "model_registry",
        id: "text-gpt",
        model: "gpt-5.5",
        displayName: "GPT Text",
        configured: true,
        supportsText: true,
      },
      {
        provider: "model_registry",
        id: "text-local",
        model: "local-agent",
        displayName: "Local Text",
        configured: true,
        supportsText: true,
      },
    ],
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-mode-pill").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-model-menu").hidden, false);

  panel.root.querySelectorAll(".hy-canvas-agent-model-option")[1].click();
  await panel.flush();
  assert.match(panel.root.querySelector(".hy-canvas-agent-mode-pill").textContent, /Local Text/);
  assert.doesNotMatch(panel.root.querySelector(".hy-canvas-agent-mode-pill").textContent, /model_registry/);
  assert.equal(panel.state.selectedModel.model, "local-agent");
});

test("appAssistantPanel P1 UI: model and mention menus toggle and close each other", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
    modelOptions: [
      {
        provider: "model_registry",
        id: "text-gpt",
        model: "gpt-5.5",
        displayName: "GPT Text",
        configured: true,
        supportsText: true,
      },
    ],
  });

  panel.init();
  panel.open();
  const modelButton = panel.root.querySelector(".hy-canvas-agent-mode-pill");
  const mentionButton = panel.root.querySelector(".hy-canvas-agent-mention");
  const modelMenu = panel.root.querySelector(".hy-canvas-agent-model-menu");
  const mentionMenu = panel.root.querySelector(".hy-canvas-agent-mention-menu");

  modelButton.click();
  await panel.flush();
  assert.equal(modelMenu.hidden, false);

  modelButton.click();
  await panel.flush();
  assert.equal(modelMenu.hidden, true);

  mentionButton.click();
  await panel.flush();
  assert.equal(mentionMenu.hidden, false);

  modelButton.click();
  await panel.flush();
  assert.equal(modelMenu.hidden, false);
  assert.equal(mentionMenu.hidden, true);
});

test("appAssistantPanel P1 UI: typing @ opens and filters mention menu, deleting closes it", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    graphStore: {
      nodes: [
        { id: "node-1", title: "Storyboard 1" },
        { id: "node-2", title: "Ending Scene" },
      ],
    },
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  const menu = panel.root.querySelector(".hy-canvas-agent-mention-menu");

  input.value = "@Story";
  input.selectionStart = input.value.length;
  input.selectionEnd = input.value.length;
  input.dispatchEvent({ type: "input" });
  await panel.flush();

  assert.equal(menu.hidden, false);
  const canvasGroup = [...panel.root.querySelectorAll(".hy-canvas-agent-mention-group")]
    .find((item) => /画布节点/.test(item.textContent));
  canvasGroup.dispatchEvent({ type: "mouseenter" });
  await panel.flush();
  assert.match(menu.textContent, /Storyboard 1/);
  assert.doesNotMatch(menu.textContent, /Ending Scene/);

  input.value = "";
  input.selectionStart = 0;
  input.selectionEnd = 0;
  input.dispatchEvent({ type: "input" });
  await panel.flush();

  assert.equal(menu.hidden, true);
});

test("appAssistantPanel P1 UI: empty assets show only in asset submenu", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    buildContext: () => ({ assets: {} }),
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-mention").click();
  await panel.flush();

  const menu = panel.root.querySelector(".hy-canvas-agent-mention-menu");
  assert.equal(menu.hidden, false);
  assert.doesNotMatch(menu.textContent, /暂无资产/);

  const assetsGroup = [...panel.root.querySelectorAll(".hy-canvas-agent-mention-group")]
    .find((item) => /我的资产/.test(item.textContent));
  assetsGroup.dispatchEvent({ type: "mouseenter" });
  await panel.flush();

  assert.match(menu.textContent, /暂无资产/);
});

test("appAssistantPanel P1 UI: mode selector persists act globally", async () => {
  const document = createFakeDocument();
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  };
  const panel = createAppAssistantPanel({
    document,
    localStorage,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });

  panel.init();
  panel.open();
  const modeButton = panel.root.querySelector(".hy-canvas-agent-ask");
  assert.match(modeButton.textContent, /Plan/i);

  modeButton.click();
  await panel.flush();

  assert.match(modeButton.textContent, /Act/i);
  assert.equal(storage.get("huanying.canvasAgent.agentMode.v1"), "act");

  const nextPanel = createAppAssistantPanel({
    document: createFakeDocument(),
    localStorage,
    api: { async chat() { return { reply: "ok", actions: [] }; } },
  });
  nextPanel.init();
  nextPanel.open();
  assert.match(nextPanel.root.querySelector(".hy-canvas-agent-ask").textContent, /Act/i);
});

test("appAssistantPanel P1 UI: mention button inserts token and sends mention context", async () => {
  const document = createFakeDocument();
  let lastPayload = null;
  const panel = createAppAssistantPanel({
    document,
    graphStore: {
      nodes: [{ id: "node-1", title: "Storyboard 1", nodeType: "ai-text", data: { prompt: "draft" } }],
    },
    buildContext: () => ({
      assets: {
        characters: [{ id: "char-1", name: "Little Girl", localPath: "D:\\\\private\\\\girl.png" }],
      },
    }),
    attachmentStore: {
      toContext() {
        return [{ id: "att-1", kind: "image", name: "summer.png" }];
      },
      remove() {},
    },
    api: {
      async chat(payload) {
        lastPayload = payload;
        return { reply: "ok", actions: [] };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  const mentionButton = panel.root.querySelector(".hy-canvas-agent-mention");
  mentionButton.click();
  await panel.flush();

  assert.equal(input.value, "@");
  const menu = panel.root.querySelector(".hy-canvas-agent-mention-menu");
  assert.equal(menu.hidden, false);
  assert.match(menu.textContent, /summer\.png/);
  assert.match(menu.textContent, /画布节点/);
  assert.match(menu.textContent, /我的资产/);

  panel.root.querySelectorAll(".hy-canvas-agent-mention-option")[0].click();
  await panel.flush();
  assert.equal(input.value, "@参考图-summer.png");

  input.value += " make a video";
  await panel.send(input.value);

  assert.equal(lastPayload.context.mentions.items[0].id, "att-1");
  assert.equal(lastPayload.context.mentions.items[0].type, "reference");
  assert.doesNotMatch(JSON.stringify(lastPayload.context.mentions), /D:\\\\/);
});

test("appAssistantPanel P1 UI: disabled model shows config guidance and blocks sends", async () => {
  const document = createFakeDocument();
  let chatCalls = 0;
  const disabledModel = {
    id: "agent-high-quality",
    provider: "pi_canvas_agent",
    model: "agent-high-quality",
    displayName: "Agent 高质量",
    configured: false,
    disabledReason: "缺少 API Key 或 Endpoint",
    capabilities: ["text", "vision", "action_planning", "high_quality"],
  };
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "should not send", actions: [] };
      },
    },
    selectedModel: disabledModel,
    modelOptions: [disabledModel],
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-mode-pill").click();
  await panel.flush();

  assert.equal(panel.state.canSendMessage(), false);
  assert.match(panel.root.querySelector(".hy-canvas-agent-model-menu").textContent, /缺少 API Key 或 Endpoint/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-model-menu").textContent, /去设置文本模型/);

  const response = await panel.send("hello");

  assert.equal(response, null);
  assert.equal(chatCalls, 0);
  assert.equal(panel.state.status, "error");
  assert.match(panel.root.querySelector(".hy-canvas-agent-receipt").textContent, /请先在设置里配置文本模型/);
});

test("appAssistantPanel P1 UI: send button follows input and clears or restores drafts", async () => {
  const document = createFakeDocument();
  let shouldFail = false;
  const sent = [];
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat(payload) {
        sent.push(payload.message);
        if (shouldFail) {
          throw new Error("network failed");
        }
        return { reply: "ok", actions: [] };
      },
    },
  });
  panel.init();
  panel.open();

  const input = panel.root.querySelector(".hy-canvas-agent-input");
  const send = panel.root.querySelector(".hy-canvas-agent-send");
  assert.equal(send.disabled, true);

  input.value = " hello ";
  input.dispatchEvent({ type: "input" });
  assert.equal(send.disabled, false);

  send.click();
  assert.equal(input.value, "");
  await panel.flush();
  assert.deepEqual(sent, ["hello"]);
  assert.equal(input.value, "");

  shouldFail = true;
  input.value = " retry me ";
  input.dispatchEvent({ type: "input" });
  send.click();
  assert.equal(input.value, "");
  await panel.flush();
  assert.equal(input.value, " retry me ");
  assert.match(panel.root.querySelector(".hy-canvas-agent-receipt").textContent, /network failed/);
});

test("appAssistantPanel P1 UI: Enter sends while Shift+Enter and composition do not", async () => {
  const document = createFakeDocument();
  const sent = [];
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat(payload) {
        sent.push(payload.message);
        return { reply: "ok", actions: [] };
      },
    },
  });
  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");

  input.value = "line one";
  input.dispatchEvent({ type: "keydown", key: "Enter", shiftKey: true });
  await panel.flush();
  assert.deepEqual(sent, []);

  input.dispatchEvent({ type: "compositionstart" });
  input.dispatchEvent({ type: "keydown", key: "Enter" });
  await panel.flush();
  assert.deepEqual(sent, []);

  input.dispatchEvent({ type: "compositionend" });
  input.dispatchEvent({ type: "keydown", key: "Enter" });
  await panel.flush();
  assert.deepEqual(sent, ["line one"]);
});

test("appAssistantPanel P1 UI: required unified model config blocks empty first-load sends", async () => {
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
  });

  assert.equal(state.canSendMessage(), false);
  const response = await state.sendMessage("hello before config loads");

  assert.equal(response, null);
  assert.equal(chatCalls, 0);
  assert.equal(state.status, "error");
  assert.match(state.lastReceipt, /请先在设置里配置文本模型/);
});

test("appAssistantPanel P1 UI: selecting a model id changes the next request modelId", async () => {
  const api = {
    lastPayload: null,
    async chat(payload) {
      this.lastPayload = payload;
      return { reply: "ok", actions: [] };
    },
  };
  const state = createAssistantPanelState({
    api,
    selectedModel: {
      id: "text-high-quality",
      provider: "model_registry",
      model: "text-high-quality",
      displayName: "Text High Quality",
      configured: true,
      supportsText: true,
    },
    modelOptions: [
      {
        id: "text-high-quality",
        provider: "model_registry",
        model: "text-high-quality",
        displayName: "Text High Quality",
        configured: true,
        supportsText: true,
      },
      {
        id: "text-low-latency",
        provider: "model_registry",
        model: "text-low-latency",
        displayName: "Text Low Latency",
        configured: true,
        supportsText: true,
      },
    ],
  });

  const selected = state.selectModel("text-low-latency");
  await state.sendMessage("hello");

  assert.equal(selected.modelId, "text-low-latency");
  assert.equal(api.lastPayload.model.modelId, "text-low-latency");
  assert.equal(api.lastPayload.model.provider, "model_registry");
});

test("appAssistantPanel P1 UI: grouped preview keeps video unauthorized after strong confirmation", async () => {
  const document = createFakeDocument();
  let applied = 0;
  const validations = [];
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat() {
        return {
          reply: "Video plan ready.",
          actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
        };
      },
      async validateActions(payload) {
        validations.push(payload);
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    async executeActions() {
      applied += 1;
      return { appliedCount: 1 };
    },
  });

  panel.init();
  panel.open();
  await panel.send("make a video");

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  assert.ok(card);
  assert.match(card.textContent, /将生成 1 个视频节点/);
  assert.ok(card.querySelector(".hy-canvas-agent-card-confirm"));

  panel.root.querySelector(".hy-canvas-agent-card-cancel").click();
  await panel.flush();
  assert.equal(applied, 0);
  assert.equal(validations.length, 0);
  assert.equal(panel.state.pendingActions.length, 0);
  assert.match(panel.root.querySelector(".hy-canvas-agent-card").textContent, /已取消/);
});

test("appAssistantPanel P1 UI: can skip one pending action before apply", async () => {
  const applied = [];
  const state = createAssistantPanelState({
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    executeActions: async ({ actions }) => {
      applied.push(actions);
      return { success: true, appliedCount: actions.length };
    },
  });

  state.setPendingActions([
    { type: "focus_nodes", nodeIds: ["n1"] },
    { type: "layout_nodes", nodeIds: ["n1"], layout: "single_chain" },
  ]);
  state.setActionSelected(1, false);
  await state.applyPendingActions();

  assert.equal(applied[0].length, 1);
  assert.equal(applied[0][0].type, "focus_nodes");
  assert.deepEqual(applied[0][0].nodeIds, ["n1"]);
});

test("appAssistantPanel P1 UI: pending action selection still applies a partial batch", async () => {
  const document = createFakeDocument();
  const applied = [];
  const panel = createAppAssistantPanel({
    document,
    api: {
      async chat() {
        return {
          reply: "Plan ready.",
          actions: [
            { type: "focus_nodes", nodeIds: ["n1"] },
            { type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" },
          ],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    executeActions: async ({ actions }) => {
      applied.push(actions);
      return { success: true, appliedCount: actions.length };
    },
  });

  panel.init();
  panel.open();
  await panel.send("focus and layout");

  assert.equal(panel.state.pendingActions.length, 2);
  panel.state.setActionSelected(1, false);
  await panel.apply();

  assert.equal(applied[0].length, 1);
  assert.equal(applied[0][0].type, "focus_nodes");
});

test("appAssistantPanel P1 UI: restores receipt and generation tasks from history", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { reply: "unused", actions: [] };
      },
    },
  });

  const restored = state.restoreConversation({
    id: "conv-history",
    title: "History",
    messages: [{ role: "assistant", content: "pending" }],
    receipts: [{ success: true, summary: "已启动 1 个图片生成任务" }],
    generationTasks: [{ id: "gen-1", nodeId: "image-1", status: "running" }],
    transactions: [
      {
        status: "pending",
        actions: [{ type: "focus_nodes", nodeIds: ["image-1"] }],
        selectedActionIndexes: [0],
      },
    ],
  });
  const snapshot = state.debugSnapshot();

  assert.equal(restored, true);
  assert.equal(state.lastReceipt, "已启动 1 个图片生成任务");
  assert.deepEqual(state.generationTasks, [{ id: "gen-1", nodeId: "image-1", status: "running" }]);
  assert.equal(snapshot.generationTaskCount, 1);
  assert.equal(snapshot.runningGenerationTaskCount, 1);
});

test("appAssistantPanel P1 UI: debug snapshot is sanitized and includes live state", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    selectedModel: {
      provider: "model_registry",
      modelId: "text-live-fixture",
      model: "text-live-fixture",
      displayName: "Text Live Fixture",
      configured: true,
      supportsText: true,
      supportsImageInput: false,
      supportsImageGeneration: false,
      supportsVideoGeneration: false,
      supportsTools: false,
      maxReferenceImages: 0,
      status: "active",
      nodeType: "text",
      apiKey: "must-not-leak",
    },
    modelOptions: [
      {
        provider: "model_registry",
        modelId: "text-live-fixture",
        model: "text-live-fixture",
        displayName: "Text Live Fixture",
        configured: true,
        supportsText: true,
        supportsImageInput: false,
        supportsImageGeneration: false,
        supportsVideoGeneration: false,
        supportsTools: false,
        maxReferenceImages: 0,
        status: "active",
        nodeType: "text",
        apiKey: "option-secret",
      },
    ],
  });

  await state.sendMessage("hello");
  const snapshot = state.debugSnapshot();
  const serialized = JSON.stringify(snapshot);

  assert.equal(snapshot.status, "done_no_actions");
  assert.equal(snapshot.selectedModel.provider, "model_registry");
  assert.equal(snapshot.selectedModel.modelId, "text-live-fixture");
  assert.equal(snapshot.selectedModel.supportsText, true);
  assert.equal(snapshot.selectedModel.supportsImageInput, false);
  assert.equal(snapshot.selectedModel.supportsImageGeneration, false);
  assert.equal(snapshot.selectedModel.supportsVideoGeneration, false);
  assert.equal(snapshot.selectedModel.supportsTools, false);
  assert.equal(snapshot.selectedModel.maxReferenceImages, 0);
  assert.equal(snapshot.selectedModel.status, "active");
  assert.equal(snapshot.selectedModel.nodeType, "text");
  assert.equal(snapshot.modelOptions[0].supportsText, true);
  assert.equal(snapshot.modelOptions[0].supportsTools, false);
  assert.doesNotMatch(serialized, /must-not-leak|option-secret|apiKey/);
  assert.ok(snapshot.executionMetrics);
  assert.equal(typeof snapshot.executionMetrics.totalExecutions, "number");
  assert.equal(typeof snapshot.executionMetrics.skillHitRate, "number");
});


test("appAssistantPanel P1 UI: receipt includes generation lifecycle counts and stores returned tasks", async () => {
  const state = createAssistantPanelState({
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    executeActions: async () => ({
      appliedCount: 1,
      queuedGenerationNodeIds: ["image-1"],
      startedGenerationNodeIds: ["image-1"],
      completedGenerationNodeIds: ["image-1"],
      generationTasks: [{ id: "gen-1", nodeId: "image-1", status: "completed" }],
    }),
  });

  state.setPendingActions([
    { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "make image" },
  ]);
  await state.applyPendingActions();

  assert.deepEqual(state.generationTasks, [{ id: "gen-1", nodeId: "image-1", status: "completed" }]);
  assert.match(state.lastReceipt, /Started 1 text\/image generation task/);
  assert.match(state.lastReceipt, /Completed 1 generation task/);
});

test("appAssistantPanel P1 UI: debug snapshot exposes redacted receipts and cards for live smoke", async () => {
  const state = createAssistantPanelState({
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
    executeActions: async () => ({
      appliedCount: 1,
      queuedGenerationNodeIds: ["image-1"],
      startedGenerationNodeIds: ["image-1"],
      skillTraceCards: [
        {
          type: "skill_trace",
          title: "创建图片节点",
          summary: "使用 Image Model",
          apiKey: "must-not-leak",
        },
      ],
    }),
  });

  state.messages.push({
    role: "assistant",
    content: "准备生成图片",
    cards: [{ id: "card-1", type: "canvas_actions", title: "确认画布操作", status: "pending", operation: {} }],
  });
  state.setPendingActions([
    { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "make image" },
  ]);
  await state.applyPendingActions();
  const snapshot = state.debugSnapshot();
  const serialized = JSON.stringify(snapshot);

  assert.deepEqual(snapshot.lastReceiptDetails.queuedGenerationNodeIds, ["image-1"]);
  assert.equal(snapshot.messages.some((message) => message.cards?.some((card) => card.type === "skill_trace")), false);
  assert.equal(
    snapshot.messages.some((message) =>
      message.cards?.some((card) => card.executionDetails?.traces?.some((trace) => trace.skillId === "创建图片节点"))
    ),
    true
  );
  assert.doesNotMatch(serialized, /must-not-leak|apiKey/);
});

test("appAssistantPanel P1: renders interaction cards under assistant message", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({ document });
  panel.init();
  panel.open();

  panel.state.messages.push({
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
  });
  panel.render();

  const cards = panel.root.querySelectorAll(".hy-canvas-agent-card");
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent, /将生成 1 个视频节点/);
  assert.ok(cards[0].querySelector(".hy-canvas-agent-card-cancel"));
  assert.ok(cards[0].querySelector(".hy-canvas-agent-card-confirm"));
});

test("appAssistantPanel P1: act cards do not render confirm or cancel buttons", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({ document });
  panel.init();
  panel.open();

  panel.state.messages.push({
    role: "assistant",
    content: "Act 模式直接执行。",
    cards: [{
      id: "card-act",
      type: "canvas_actions",
      status: "running",
      title: "将生成 2 个节点",
      summary: "正在执行。",
      expanded: false,
      requiresConfirmation: false,
      agentMode: "act",
      actions: [],
    }],
  });
  panel.render();

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  assert.ok(card);
  assert.equal(card.querySelector(".hy-canvas-agent-card-cancel"), null);
  assert.equal(card.querySelector(".hy-canvas-agent-card-confirm"), null);
});

test("appAssistantPanel P1: act video authorization card renders confirm and cancel buttons", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({ document });
  panel.init();
  panel.open();

  panel.state.messages.push({
    role: "assistant",
    content: "Act 模式下视频生成仍需授权。",
    cards: [{
      id: "card-act-video",
      type: "canvas_actions",
      status: "needs_confirmation",
      title: "将生成 1 个视频节点",
      summary: "视频生成需要授权。",
      expanded: true,
      requiresConfirmation: true,
      agentMode: "act",
      actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
    }],
  });
  panel.render();

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  assert.ok(card);
  assert.ok(card.querySelector(".hy-canvas-agent-card-cancel"));
  assert.ok(card.querySelector(".hy-canvas-agent-card-confirm"));
});

test("appAssistantPanel P1: success-only system receipts are not shown in chat area", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({ document });
  panel.init();
  panel.open();

  panel.state.lastReceipt = "Selected model: GPT Mini";
  panel.render();

  const receipt = panel.root.querySelector(".hy-canvas-agent-receipt");
  assert.equal(receipt.hidden, true);
  assert.doesNotMatch(document.body.textContent, /Selected model: GPT Mini/);
});

test("appAssistantPanel P1 UI: operation card hides raw JSON and shows execution details", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    agentMode: "act",
    document,
    graphStore: { nodes: [{ id: "image-1", type: "ai-image", data: { generationStatus: "running" } }] },
    api: {
      async chat() {
        return {
          reply: "Start generation",
          actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
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
        canvasSkillReceipts: [{ skillId: "imageNode.generate", nodeId: "image-1", ok: true }],
        skillTraceCards: [{ type: "skill_trace", title: "imageNode.generate", detail: "{ raw: true }" }],
      };
    },
  });

  panel.init();
  panel.open();
  await panel.send("generate cat image");
  const card = panel.root.querySelector(".hy-canvas-agent-card");

  assert.ok(card);
  assert.match(card.textContent, /生成中|准备中|执行中/);
  card.querySelector(".hy-canvas-agent-card-title").click();
  const expandedCard = panel.root.querySelector(".hy-canvas-agent-card");
  assert.match(expandedCard.textContent, /imageNode\.generate/);
  assert.doesNotMatch(expandedCard.textContent, /\{\s*"appliedCount"/);
});

test("appAssistantPanel P1 UI: generation progress stays in message card, not bottom receipt", async () => {
  const document = createFakeDocument();
  const nodes = [{ id: "image-1", type: "ai-image", data: { generationStatus: "running", isGenerating: true } }];
  const graphStore = {
    nodes,
    getState() {
      return { nodes };
    },
    subscribe() {
      return () => {};
    },
  };
  const panel = createAppAssistantPanel({
    agentMode: "act",
    document,
    graphStore,
    api: {
      async chat() {
        return {
          reply: "Start generation",
          actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "cat" }],
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
      };
    },
  });

  panel.init();
  panel.open();
  await panel.send("generate cat image");

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  const receipt = panel.root.querySelector(".hy-canvas-agent-receipt");
  assert.equal(card?.getAttribute("data-status"), "generating");
  assert.match(card?.textContent || "", /生成中/);
  assert.equal(receipt.hidden, true);
  assert.equal(receipt.textContent, "");
});

test("appAssistantPanel P1: title and aria labels use 幻映AI导演 while FAB remains RH", () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({ document });
  panel.init();
  panel.open();

  assert.match(document.body.textContent, /幻映AI导演/);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-launcher")?.textContent.trim(), "RH");
  assert.match(panel.root.getAttribute("aria-label") || "", /幻映AI导演/);
  assert.match(panel.root.querySelector(".hy-canvas-agent-close")?.getAttribute("aria-label") || "", /幻映AI导演/);
});

test("appAssistantPanel Phase 4 UI: selected undoable event undoes through default orchestrator and removes AI nodes", async () => {
  const document = createFakeDocument();
  const removedNodes = [];
  const graphStore = {
    nodes: [{ id: "text-1", name: "标题", data: { text: "hello" } }],
    edges: [],
    removeNode(nodeId) {
      removedNodes.push(nodeId);
      this.nodes = this.nodes.filter((node) => node.id !== nodeId);
    },
    removeEdge() {},
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-undo-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-undo-ui",
    title: "Undo source task",
    status: "completed",
    drawerState: { visible: true, line1: "Undo source task", line2: "执行完成" },
    plan: { steps: [{ id: "step-create", title: "Create text" }] },
    actionsByStep: {
      "step-create": [{ id: "act-create", type: "create_node", nodeId: "text-1" }],
    },
  });
  executionStore.appendTimelineEvent("exec-undo-ui", {
    id: "evt-create-done",
    stepId: "step-create",
    actionId: "act-create",
    status: "completed",
    humanSummary: "已生成节点",
    nodeIds: ["text-1"],
    canRetry: true,
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        {
          type: "remove_node",
          nodeId: "text-1",
          signature: JSON.stringify({ name: "标题", data: { text: "hello" } }),
        },
      ],
    },
    developer: { actionJson: { id: "act-create", type: "create_node", nodeId: "text-1", title: "Create text" } },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-create-done");
  eventRow.click();

  const undoButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-undo");
  assert.ok(undoButton);
  assert.equal(undoButton.textContent, "撤销此步");
  undoButton.click();
  await panel.flush();

  assert.deepEqual(removedNodes, ["text-1"]);
  assert.equal(graphStore.nodes.length, 0);
  const stored = executionStore.getExecution("exec-undo-ui");
  const undoneEvent = stored.timeline.find((event) => event.status === "undone");
  assert.ok(undoneEvent);
  assert.equal(undoneEvent.developer.undoneFromEventId, "evt-create-done");
  assert.equal(stored.status, "completed");
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-detail-undo"), null);
});

test("appAssistantPanel Phase 4 UI: undo keeps user-modified nodes and records conflict", async () => {
  const document = createFakeDocument();
  const removedNodes = [];
  const graphStore = {
    nodes: [{ id: "text-1", name: "标题", data: { text: "user edited" } }],
    edges: [],
    removeNode(nodeId) {
      removedNodes.push(nodeId);
    },
    removeEdge() {},
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-undo-conflict-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-undo-conflict",
    title: "Undo conflict task",
    status: "completed",
    drawerState: { visible: true, line1: "Undo conflict task", line2: "执行完成" },
    plan: { steps: [{ id: "step-create", title: "Create text" }] },
    actionsByStep: {
      "step-create": [{ id: "act-create", type: "create_node", nodeId: "text-1" }],
    },
  });
  executionStore.appendTimelineEvent("exec-undo-conflict", {
    id: "evt-create-done",
    stepId: "step-create",
    actionId: "act-create",
    status: "completed",
    humanSummary: "已生成节点",
    nodeIds: ["text-1"],
    canRetry: true,
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        {
          type: "remove_node",
          nodeId: "text-1",
          signature: JSON.stringify({ name: "标题", data: { text: "hello" } }),
        },
      ],
    },
    developer: { actionJson: { id: "act-create", type: "create_node", nodeId: "text-1" } },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-create-done");
  eventRow.click();
  panel.root.querySelector(".hy-canvas-agent-execution-detail-undo").click();
  await panel.flush();

  assert.deepEqual(removedNodes, []);
  assert.equal(graphStore.nodes.length, 1);
  const stored = executionStore.getExecution("exec-undo-conflict");
  const conflictEvent = stored.timeline.find((event) => event.status === "undo_conflict");
  assert.ok(conflictEvent);
  assert.equal(conflictEvent.developer.undoneFromEventId, "evt-create-done");
  assert.equal(stored.timeline.some((event) => event.status === "undone"), false);
});

test("appAssistantPanel Phase 4 UI: plan steps toggle enable state for unexecuted steps only", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-plan-toggle",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-plan-toggle",
    title: "Editable plan task",
    status: "paused",
    orchestratorState: { nextActionIndex: 1, pausedAtActionId: "act-second", running: false },
    progress: { done: 1, total: 3 },
    drawerState: { visible: true, line1: "Editable plan task", line2: "已暂停" },
    plan: {
      steps: [
        { id: "step-done", title: "Executed step" },
        { id: "step-second", title: "Second step" },
        { id: "step-third", title: "Third step" },
      ],
    },
    actionsByStep: {
      "step-done": [{ id: "act-done", type: "create_node", nodeId: "n-1" }],
      "step-second": [{ id: "act-second", type: "create_node", nodeId: "n-2" }],
      "step-third": [{ id: "act-third", type: "create_node", nodeId: "n-3" }],
    },
  });
  executionStore.appendTimelineEvent("exec-plan-toggle", {
    id: "evt-done",
    stepId: "step-done",
    actionId: "act-done",
    status: "completed",
    humanSummary: "已生成节点",
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const toggles = panel.root.querySelectorAll(".hy-canvas-agent-execution-step-toggle");
  assert.deepEqual(
    toggles.map((toggle) => toggle.getAttribute("data-step-id")),
    ["step-second", "step-third"]
  );
  assert.equal(toggles[1].textContent, "停用");

  toggles[1].click();
  await panel.flush();

  const stored = executionStore.getExecution("exec-plan-toggle");
  assert.equal(stored.plan.steps.find((step) => step.id === "step-third").enabled, false);
  const thirdToggle = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-step-toggle")
    .find((toggle) => toggle.getAttribute("data-step-id") === "step-third");
  assert.equal(thirdToggle.textContent, "启用");
  const stepRows = panel.root.querySelectorAll(".hy-canvas-agent-execution-step");
  assert.ok(stepRows.some((row) => row.textContent.includes("已停用")));

  const executingDocument = createFakeDocument();
  const executingStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-plan-toggle-executing",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executingStore.createExecution({
    id: "exec-running",
    title: "Running task",
    status: "executing",
    drawerState: { visible: true, line1: "Running task", line2: "执行中" },
    plan: { steps: [{ id: "step-a", title: "A" }] },
    actionsByStep: { "step-a": [{ id: "act-a", type: "create_node", nodeId: "n-a" }] },
  });
  const executingPanel = createAppAssistantPanel({
    document: executingDocument,
    executionStore: executingStore,
    executionSyncClient: false,
  });
  executingPanel.init();
  executingPanel.open();
  executingPanel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  assert.equal(
    executingPanel.root.querySelectorAll(".hy-canvas-agent-execution-step-toggle").length,
    0
  );
});

test("appAssistantPanel Phase 4 UI: completed execution auto-hides and reopens from history", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-summary-close",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-finished",
    title: "已完成的整理任务",
    status: "completed",
    drawerState: { visible: true, line1: "已完成的整理任务", line2: "执行完成" },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();

  // B(铁律: 抽屉不常驻): 已完成执行不再常驻状态线, 只保留「执行历史」入口。
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-line1"), null);
  const historyToggle = panel.root.querySelector(".hy-canvas-agent-exec-history-btn");
  assert.ok(historyToggle);
  assert.ok((historyToggle.getAttribute("aria-label") || "").includes("执行历史"));

  historyToggle.click();
  await panel.flush();
  const historyItems = panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item");
  assert.equal(historyItems.length, 1);
  assert.ok(historyItems[0].textContent.includes("已完成的整理任务"));

  // 从历史显式打开 → 抽屉回看该已完成执行
  historyItems[0].click();
  await panel.flush();
  assert.equal(executionStore.getExecution("exec-finished").drawerState.visible, true);
  assert.ok(
    panel.root.querySelector(".hy-canvas-agent-execution-line1").textContent.includes("已完成的整理任务")
  );
});

test("appAssistantPanel Phase 4 UI: clicking chat area collapses expanded drawer to status bar", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-click-outside",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-collapse",
    title: "执行中的任务",
    status: "executing",
    drawerState: { visible: true, line1: "执行中的任务", line2: "正在生成图片" },
    plan: { steps: [{ id: "step-a", title: "A" }] },
    actionsByStep: { "step-a": [{ id: "act-a", type: "create_node", nodeId: "n-a" }] },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(drawer.getAttribute("aria-expanded"), "true");

  panel.root.querySelector(".hy-canvas-agent-messages").click();
  await panel.flush();

  const collapsed = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(collapsed.getAttribute("aria-expanded"), "false");
  assert.notEqual(collapsed.hidden, true);
  assert.ok(panel.root.querySelector(".hy-canvas-agent-execution-line1").textContent.includes("执行中的任务"));
});

test("appAssistantPanel Phase 4 UI: undo restores node attributes for update actions", async () => {
  const document = createFakeDocument();
  const updateCalls = [];
  const graphStore = {
    nodes: [{ id: "n1", name: "新标题", data: { text: "new" } }],
    edges: [],
    removeNode() {},
    removeEdge() {},
    updateNodeData(nodeId, patch) {
      updateCalls.push([nodeId, patch]);
      const node = this.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...node.data, ...patch };
      }
    },
    updateNode(nodeId, patch) {
      const node = this.nodes.find((item) => item.id === nodeId);
      if (node && patch && patch.name !== undefined) {
        node.name = patch.name;
      }
    },
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-restore-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-restore-ui",
    title: "Restore attribute task",
    status: "completed",
    drawerState: { visible: true, line1: "Restore attribute task", line2: "执行完成" },
    plan: { steps: [{ id: "step-update", title: "Update node" }] },
    actionsByStep: {
      "step-update": [{ id: "act-update", type: "update_node", nodeId: "n1", data: { text: "new" } }],
    },
  });
  executionStore.appendTimelineEvent("exec-restore-ui", {
    id: "evt-update-done",
    stepId: "step-update",
    actionId: "act-update",
    status: "completed",
    humanSummary: "已更新节点",
    nodeIds: ["n1"],
    canRetry: true,
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        {
          type: "restore_node",
          nodeId: "n1",
          name: "旧标题",
          data: { text: "old" },
          signature: JSON.stringify({ name: "新标题", data: { text: "new" } }),
        },
      ],
    },
    developer: { actionJson: { id: "act-update", type: "update_node", nodeId: "n1", title: "Update node" } },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-update-done");
  eventRow.click();
  panel.root.querySelector(".hy-canvas-agent-execution-detail-undo").click();
  await panel.flush();

  assert.deepEqual(updateCalls, [["n1", { text: "old" }]]);
  assert.equal(graphStore.nodes[0].name, "旧标题");
  assert.equal(graphStore.nodes[0].data.text, "old");
  const stored = executionStore.getExecution("exec-restore-ui");
  const undoneEvent = stored.timeline.find((event) => event.status === "undone");
  assert.ok(undoneEvent);
  assert.deepEqual(undoneEvent.developer.restoredNodeIds, ["n1"]);
});

test("appAssistantPanel Phase 4 UI: undo-to-here rolls back selected and later events", async () => {
  const document = createFakeDocument();
  const graphStore = {
    nodes: [
      { id: "n1", name: "一", data: {} },
      { id: "n2", name: "二", data: {} },
      { id: "n3", name: "三", data: {} },
    ],
    edges: [],
    removeNode(nodeId) {
      this.nodes = this.nodes.filter((node) => node.id !== nodeId);
    },
    removeEdge() {},
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-undo-to-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-undo-to-ui",
    title: "Undo-to task",
    status: "completed",
    drawerState: { visible: true, line1: "Undo-to task", line2: "执行完成" },
    plan: {
      steps: [
        { id: "s1", title: "Create 1" },
        { id: "s2", title: "Create 2" },
        { id: "s3", title: "Create 3" },
      ],
    },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "create_node", nodeId: "n2" }],
      s3: [{ id: "a3", type: "create_node", nodeId: "n3" }],
    },
  });
  ["1", "2", "3"].forEach((index) => {
    executionStore.appendTimelineEvent("exec-undo-to-ui", {
      id: `evt-${index}`,
      stepId: `s${index}`,
      actionId: `a${index}`,
      status: "completed",
      humanSummary: `已生成节点 ${index}`,
      nodeIds: [`n${index}`],
      canRetry: true,
      canUndo: true,
      inverse: { aiOwned: true, ops: [{ type: "remove_node", nodeId: `n${index}` }] },
      developer: { actionJson: { id: `a${index}`, type: "create_node", nodeId: `n${index}` } },
    });
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-2");
  eventRow.click();

  const undoToButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-undo-to");
  assert.ok(undoToButton);
  assert.equal(undoToButton.textContent, "撤销到这里");
  undoToButton.click();
  await panel.flush();

  assert.deepEqual(graphStore.nodes.map((node) => node.id), ["n1"]);
  const stored = executionStore.getExecution("exec-undo-to-ui");
  assert.equal(stored.timeline.filter((event) => event.status === "undone").length, 2);

  const lastRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-1");
  lastRow.click();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-detail-undo-to"), null);
  assert.ok(panel.root.querySelector(".hy-canvas-agent-execution-detail-undo"));
});

test("appAssistantPanel Phase 4 UI: undo restores node positions and conflicts when user moved nodes", async () => {
  const document = createFakeDocument();
  const graphStore = {
    nodes: [
      { id: "n1", name: "一", data: {}, x: 100, y: 0 },
      { id: "n2", name: "二", data: {}, x: 200, y: 0 },
    ],
    edges: [],
    removeNode() {},
    removeEdge() {},
    updateNodeData() {},
  };
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-position-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-position-ui",
    title: "Layout task",
    status: "completed",
    drawerState: { visible: true, line1: "Layout task", line2: "执行完成" },
    plan: { steps: [{ id: "step-layout", title: "Layout" }] },
    actionsByStep: {
      "step-layout": [{ id: "act-layout", type: "layout_nodes", nodeIds: ["n1", "n2"] }],
    },
  });
  executionStore.appendTimelineEvent("exec-position-ui", {
    id: "evt-layout-done",
    stepId: "step-layout",
    actionId: "act-layout",
    status: "completed",
    humanSummary: "已整理画布",
    nodeIds: ["n1", "n2"],
    canRetry: true,
    canUndo: true,
    inverse: {
      aiOwned: true,
      ops: [
        { type: "restore_node_position", nodeId: "n1", x: 10, y: 20, signature: JSON.stringify({ x: 100, y: 0 }) },
        { type: "restore_node_position", nodeId: "n2", x: 30, y: 40, signature: JSON.stringify({ x: 999, y: 0 }) },
      ],
    },
    developer: { actionJson: { id: "act-layout", type: "layout_nodes", nodeIds: ["n1", "n2"], title: "Layout" } },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore,
    executionStore,
    executionSyncClient: false,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-layout-done");
  eventRow.click();
  panel.root.querySelector(".hy-canvas-agent-execution-detail-undo").click();
  await panel.flush();

  assert.equal(graphStore.nodes[0].x, 10);
  assert.equal(graphStore.nodes[0].y, 20);
  assert.equal(graphStore.nodes[1].x, 200);
  assert.equal(graphStore.nodes[1].y, 0);
  const stored = executionStore.getExecution("exec-position-ui");
  const undoneEvent = stored.timeline.find((event) => event.status === "undone");
  assert.ok(undoneEvent);
  assert.deepEqual(undoneEvent.developer.restoredNodeIds, ["n1"]);
  assert.equal(undoneEvent.developer.conflicts.length, 1);
  assert.equal(undoneEvent.developer.conflicts[0].reason, "node_moved");
});

test("appAssistantPanel Phase 4 UI: plan steps reorder via move buttons and drag drop", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-plan-reorder-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-reorder-ui",
    title: "Reorder plan task",
    status: "paused",
    orchestratorState: { nextActionIndex: 1, pausedAtActionId: "act-2", running: false },
    progress: { done: 1, total: 3 },
    drawerState: { visible: true, line1: "Reorder plan task", line2: "已暂停" },
    plan: {
      steps: [
        { id: "s1", title: "Done step" },
        { id: "s2", title: "Second" },
        { id: "s3", title: "Third" },
      ],
    },
    actionsByStep: {
      s1: [{ id: "act-1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "act-2", type: "create_node", nodeId: "n2" }],
      s3: [{ id: "act-3", type: "create_node", nodeId: "n3" }],
    },
  });
  executionStore.appendTimelineEvent("exec-reorder-ui", {
    id: "evt-done",
    stepId: "s1",
    actionId: "act-1",
    status: "completed",
    humanSummary: "已生成节点",
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const upButtons = panel.root.querySelectorAll(".hy-canvas-agent-execution-step-up");
  assert.deepEqual(
    upButtons.map((button) => button.getAttribute("data-step-id")),
    ["s2", "s3"]
  );
  const downButtons = panel.root.querySelectorAll(".hy-canvas-agent-execution-step-down");
  assert.deepEqual(
    downButtons.map((button) => button.getAttribute("data-step-id")),
    ["s2", "s3"]
  );

  const thirdUp = upButtons.find((button) => button.getAttribute("data-step-id") === "s3");
  thirdUp.click();
  await panel.flush();

  let stored = executionStore.getExecution("exec-reorder-ui");
  assert.deepEqual(stored.plan.steps.map((step) => step.id), ["s1", "s3", "s2"]);
  assert.ok(stored.timeline.some((event) => event.status === "plan_edited"));

  const rows = panel.root.querySelectorAll(".hy-canvas-agent-execution-step");
  const dragRow = rows.find((row) => row.getAttribute("data-step-id") === "s2");
  const dropRow = rows.find((row) => row.getAttribute("data-step-id") === "s3");
  assert.equal(dragRow.getAttribute("draggable"), "true");
  dragRow.dispatchEvent({ type: "dragstart" });
  dropRow.dispatchEvent({ type: "drop" });
  await panel.flush();

  stored = executionStore.getExecution("exec-reorder-ui");
  assert.deepEqual(stored.plan.steps.map((step) => step.id), ["s1", "s2", "s3"]);

  const doneRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-step")
    .find((row) => row.getAttribute("data-step-id") === "s1");
  assert.notEqual(doneRow.getAttribute("draggable"), "true");
});

test("appAssistantPanel Phase 4 UI: execution history supports search filtering", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-history-search",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-poster",
    title: "海报生成任务",
    status: "completed",
    drawerState: { visible: false, line1: "海报生成任务", line2: "执行完成" },
  });
  executionStore.createExecution({
    id: "exec-layout",
    title: "画布整理任务",
    status: "cancelled",
    drawerState: { visible: false, line1: "画布整理任务", line2: "已取消" },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-exec-history-btn").click();
  await panel.flush();

  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 2);

  const search = panel.root.querySelector(".hy-canvas-agent-execution-history-search");
  assert.ok(search);
  search.value = "海报";
  search.dispatchEvent({ type: "input" });
  await panel.flush();

  const filtered = panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item");
  assert.equal(filtered.length, 1);
  assert.ok(filtered[0].textContent.includes("海报生成任务"));

  const statusSearch = panel.root.querySelector(".hy-canvas-agent-execution-history-search");
  statusSearch.value = "已取消";
  statusSearch.dispatchEvent({ type: "input" });
  await panel.flush();
  const byStatus = panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item");
  assert.equal(byStatus.length, 1);
  assert.ok(byStatus[0].textContent.includes("画布整理任务"));
});

test("appAssistantPanel Phase 4 UI: expanded drawer shows blur backdrop that collapses on click", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-backdrop",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-backdrop",
    title: "执行中的任务",
    status: "executing",
    drawerState: { visible: true, line1: "执行中的任务", line2: "正在生成图片" },
    plan: { steps: [{ id: "step-a", title: "A" }] },
    actionsByStep: { "step-a": [{ id: "act-a", type: "create_node", nodeId: "n-a" }] },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();

  let backdrop = panel.root.querySelector(".hy-canvas-agent-execution-backdrop");
  assert.ok(backdrop);
  assert.equal(backdrop.hidden, true);

  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  backdrop = panel.root.querySelector(".hy-canvas-agent-execution-backdrop");
  assert.notEqual(backdrop.hidden, true);

  backdrop.click();
  await panel.flush();

  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(drawer.getAttribute("aria-expanded"), "false");
  assert.notEqual(drawer.hidden, true);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-backdrop").hidden, true);
});

test("appAssistantPanel Phase 4 UI: completed execution offers replay and per-step regenerate", async () => {
  const document = createFakeDocument();
  const calls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-replay-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-replay-ui",
    title: "Replay 任务",
    status: "completed",
    drawerState: { visible: true, line1: "Replay 任务", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }, { id: "s2", title: "Generate" }] },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" }],
    },
  });
  executionStore.appendTimelineEvent("exec-replay-ui", {
    id: "evt-gen-done",
    stepId: "s2",
    actionId: "a2",
    status: "completed",
    humanSummary: "已生成图片",
    nodeIds: ["img-1"],
    canRetry: true,
    developer: { actionJson: { id: "a2", type: "queue_generation_task", nodeId: "img-1", nodeType: "ai-image" } },
  });
  const executionOrchestrator = {
    async replay(executionId, options) {
      calls.push(["replay", executionId, options]);
      return { status: "replayed", replayedCount: 1, skippedGenerationCount: 1 };
    },
    async regenerateStep(executionId, options) {
      calls.push(["regenerateStep", executionId, options]);
      return { status: "regenerated" };
    },
  };
  const panel = createAppAssistantPanel({ document, executionStore, executionOrchestrator, executionSyncClient: false });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const replayButton = panel.root.querySelector(".hy-canvas-agent-execution-replay");
  assert.ok(replayButton);
  assert.equal(replayButton.textContent, "回放结构");
  replayButton.click();
  await panel.flush();
  assert.deepEqual(calls[0].slice(0, 2), ["replay", "exec-replay-ui"]);

  const eventRow = panel.root
    .querySelectorAll(".hy-canvas-agent-execution-event")
    .find((row) => row.getAttribute("data-event-id") === "evt-gen-done");
  eventRow.click();
  const regenButton = panel.root.querySelector(".hy-canvas-agent-execution-detail-regenerate");
  assert.ok(regenButton);
  assert.equal(regenButton.textContent, "重新生成此步");
  regenButton.click();
  await panel.flush();
  assert.equal(calls[1][0], "regenerateStep");
  assert.equal(calls[1][2].actionId, "a2");
  assert.equal(calls[1][2].eventId, "evt-gen-done");
});

test("appAssistantPanel Phase 4 UI: developer mode shows execution metrics summary", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-metrics-ui",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-metrics-ui",
    title: "Metrics 任务",
    status: "completed",
    matchedSkills: ["canvas_layout"],
    drawerState: { visible: true, line1: "Metrics 任务", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }] },
    actionsByStep: { s1: [{ id: "a1", type: "create_node", nodeId: "n1" }] },
  });
  executionStore.appendTimelineEvent("exec-metrics-ui", {
    id: "evt-1",
    stepId: "s1",
    actionId: "a1",
    status: "completed",
    humanSummary: "已生成节点",
    durationMs: 120,
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-metrics"), null);
  panel.root.querySelector(".hy-canvas-agent-execution-dev-toggle").click();
  await panel.flush();

  const metrics = panel.root.querySelector(".hy-canvas-agent-execution-metrics");
  assert.ok(metrics);
  assert.match(metrics.textContent, /技能命中率/);
  assert.match(metrics.textContent, /100%/);
  assert.match(metrics.textContent, /120/);
});

test("appAssistantPanel Phase 4 UI: developer toggle reveals selected event JSON", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dev-panel",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-dev",
    title: "Dev 任务",
    status: "completed",
    drawerState: { visible: true, line1: "Dev 任务", line2: "执行完成" },
    plan: { steps: [{ id: "s1", title: "Create" }] },
    actionsByStep: { s1: [{ id: "a1", type: "create_node", nodeId: "n1" }] },
  });
  executionStore.appendTimelineEvent("exec-dev", {
    id: "evt-dev",
    stepId: "s1",
    actionId: "a1",
    status: "completed",
    humanSummary: "已生成节点",
    nodeIds: ["n1"],
    developer: { actionJson: { id: "a1", type: "create_node", nodeId: "n1" } },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  panel.root.querySelector(".hy-canvas-agent-execution-event").click();

  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-dev-json"), null);
  const devToggle = panel.root.querySelector(".hy-canvas-agent-execution-dev-toggle");
  assert.ok(devToggle);
  devToggle.click();
  await panel.flush();

  const devJson = panel.root.querySelector(".hy-canvas-agent-execution-dev-json");
  assert.ok(devJson);
  assert.match(devJson.textContent, /create_node/);
  assert.match(devJson.textContent, /actionJson/);

  panel.root.querySelector(".hy-canvas-agent-execution-dev-toggle").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-dev-json"), null);
});

test("appAssistantPanel Phase 4 UI: plan area shows readonly dependency DAG", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dag",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-dag",
    title: "DAG 任务",
    status: "paused",
    drawerState: { visible: true, line1: "DAG 任务", line2: "已暂停" },
    plan: {
      steps: [
        { id: "s1", title: "故事大纲" },
        { id: "s2", title: "分镜 01", dependsOn: ["s1"] },
        { id: "s3", title: "关键帧图 01", dependsOn: ["s2"] },
      ],
    },
    actionsByStep: {
      s1: [{ id: "a1", type: "create_node", nodeId: "n1" }],
      s2: [{ id: "a2", type: "create_node", nodeId: "n2" }],
      s3: [{ id: "a3", type: "create_node", nodeId: "n3" }],
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-expand").click();

  const dag = panel.root.querySelector(".hy-canvas-agent-execution-dag");
  assert.ok(dag);
  const rows = panel.root.querySelectorAll(".hy-canvas-agent-execution-dag-edge");
  assert.deepEqual(rows.map((row) => row.textContent), ["故事大纲 → 分镜 01", "分镜 01 → 关键帧图 01"]);
  const graph = panel.root.querySelector(".hy-canvas-agent-execution-dag-graph");
  assert.ok(graph);
  assert.match(graph.textContent, /故事大纲/);
  assert.match(graph.textContent, /└─▶ 分镜 01/);
  assert.match(graph.textContent, /└─▶ 关键帧图 01/);

  const noDepsDocument = createFakeDocument();
  const noDepsStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dag-none",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  noDepsStore.createExecution({
    id: "exec-no-deps",
    title: "无依赖",
    status: "paused",
    drawerState: { visible: true, line1: "无依赖", line2: "已暂停" },
    plan: { steps: [{ id: "s1", title: "单步" }] },
    actionsByStep: { s1: [{ id: "a1", type: "create_node", nodeId: "n1" }] },
  });
  const noDepsPanel = createAppAssistantPanel({
    document: noDepsDocument,
    executionStore: noDepsStore,
    executionSyncClient: false,
  });
  noDepsPanel.init();
  noDepsPanel.open();
  noDepsPanel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  assert.equal(noDepsPanel.root.querySelector(".hy-canvas-agent-execution-dag"), null);
});

test("appAssistantPanel Phase 4 UI: history status chips filter the list", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-history-chips",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "h-done",
    title: "完成的任务",
    status: "completed",
    drawerState: { visible: false, line1: "完成的任务", line2: "执行完成" },
  });
  executionStore.createExecution({
    id: "h-cancelled",
    title: "取消的任务",
    status: "cancelled",
    drawerState: { visible: false, line1: "取消的任务", line2: "已取消" },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-exec-history-btn").click();
  await panel.flush();

  const chips = panel.root.querySelectorAll(".hy-canvas-agent-execution-history-chip");
  assert.deepEqual(chips.map((chip) => chip.textContent), ["全部", "已完成", "失败", "已取消"]);
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 2);

  chips.find((chip) => chip.textContent === "已完成").click();
  await panel.flush();
  const filtered = panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item");
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].textContent, /完成的任务/);

  panel.root.querySelectorAll(".hy-canvas-agent-execution-history-chip")
    .find((chip) => chip.textContent === "全部").click();
  await panel.flush();
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 2);
});

test("appAssistantPanel Phase 4 UI: execution history paginates with load-more", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-history-page",
    clock: () => "2026-06-10T00:00:00.000Z",
    maxExecutions: 60,
  });
  for (let index = 1; index <= 13; index += 1) {
    executionStore.createExecution({
      id: `exec-h-${index}`,
      title: `历史任务 ${index}`,
      status: "completed",
      drawerState: { visible: false, line1: `历史任务 ${index}`, line2: "执行完成" },
    });
  }
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-exec-history-btn").click();
  await panel.flush();

  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 10);
  const more = panel.root.querySelector(".hy-canvas-agent-execution-history-more");
  assert.ok(more);
  assert.equal(more.textContent, "加载更多");

  more.click();
  await panel.flush();
  assert.equal(panel.root.querySelectorAll(".hy-canvas-agent-execution-history-item").length, 13);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-history-more"), null);
});

test("appAssistantPanel Phase 2 UI: recent group reference without count moves all recent references", async () => {
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-natural-queue-group-no-count",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active render",
    status: "executing",
    drawerState: { visible: true, line1: "Active render", line2: "Rendering current task" },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-4",
    title: "Asset B",
    drawerState: { visible: false, line1: "Asset B", line2: "Waiting asset 4" },
    actionsByStep: {
      "step-asset-4": [{ id: "act-asset-4", type: "asset.use", assetId: "asset-4", assetName: "新资产4" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-prompt",
    title: "Prompt task",
    drawerState: { visible: false, line1: "Prompt task", line2: "Waiting prompt" },
    actionsByStep: {
      "step-prompt": [{ id: "act-prompt", type: "queue_generation_task", prompt: "城市夜景海报" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-asset-5",
    title: "Asset C",
    status: "queued_draft",
    drawerState: { visible: false, line1: "Asset C", line2: "Waiting asset 5" },
    actionsByStep: {
      "step-asset-5": [{ id: "act-asset-5", type: "asset.use", assetId: "asset-5", assetName: "新资产5" }],
    },
  });
  executionStore.enqueueExecution({
    id: "exec-queued-text",
    title: "Text task",
    drawerState: { visible: false, line1: "Text task", line2: "Waiting text" },
    actionsByStep: {
      "step-text": [{ id: "act-text", type: "textNode.generate", text: "旁白文本" }],
    },
  });
  let chatCalls = 0;
  const state = createAssistantPanelState({
    modelConfigRequired: true,
    executionStore,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
    },
    executionSyncClient: {
      controlQueuedExecution() {
        return Promise.resolve({ success: true });
      },
    },
  });

  await state.sendMessage("把新资产4那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  await state.sendMessage("把它前面的那个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;
  await state.sendMessage("把城市夜景海报那个排队任务移动到最后");
  await state.lastExecutionSyncPromise;
  const grouped = await state.sendMessage("把刚才那几个移动到第一个排队任务");
  await state.lastExecutionSyncPromise;

  assert.equal(chatCalls, 0);
  assert.equal(grouped?.queueControl?.action, "reorder");
  assert.equal(grouped?.queueControl?.referenceSource, "recent_queue_multi");
  assert.deepEqual(grouped?.queueControl?.executionIds, [
    "exec-queued-text",
    "exec-queued-asset-4",
    "exec-queued-prompt",
  ]);
  assert.deepEqual(executionStore.snapshot().queue.map((item) => item.id), [
    "exec-queued-text",
    "exec-queued-asset-4",
    "exec-queued-prompt",
    "exec-queued-asset-5",
  ]);
});

test("appAssistantPanel Phase 5 UI: director command compiles a QMAI plan into the workbench", async () => {
  const document = createFakeDocument();
  const directorCalls = [];
  let chatCalls = 0;
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-director-wire",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: false,
    modelConfigRequired: true,
    directorLegacyQmai: true,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
      async directorPlan(payload) {
        directorCalls.push(payload);
        return {
          success: true,
          reply: "已按 QMAI 项目「雨屋样例项目」生成导演计划（记忆条目 3 条）。",
          intent: { id: "director_plan", mode: "act", matchedSkills: ["director"] },
          plan: { id: "plan_director_1", title: "导演计划：雨屋样例项目", status: "draft", steps: [{ id: "step_cards", title: "铺导演知识卡" }] },
          actionsByStep: { step_cards: [{ id: "qmai-knowledge-c1", type: "create_node", nodeType: "comment", name: "林侦探" }] },
          execution: { id: "exec_director_1", status: "draft", drawerState: { visible: true, line1: "导演计划：雨屋样例项目", line2: "ready" } },
          actions: [{ id: "qmai-knowledge-c1", type: "create_node", nodeType: "comment", name: "林侦探" }],
          warnings: [],
          requiresConfirmation: false,
        };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "导演：按 QMAI 项目铺一版导演计划";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();

  assert.equal(chatCalls, 0);
  assert.equal(directorCalls.length, 1);
  assert.match(directorCalls[0].message, /铺一版导演计划/);
  // The ear downlink: the explicit director prefix becomes an
  // auditable director-intent/v1 carried with the plan request.
  assert.equal(directorCalls[0].intent?.schemaVersion, "director-intent/v1");
  assert.equal(directorCalls[0].intent?.lane, "director");
  assert.match(String(directorCalls[0].intent?.flowId || ""), /^flow-/);
  assert.match(String(directorCalls[0].intent?.userGoal || ""), /铺一版导演计划/);
  assert.match(String(directorCalls[0].intent?.laneReason || ""), /导演前缀/);
  const stored = executionStore.getExecution("exec_director_1");
  assert.ok(stored);
  assert.deepEqual(stored.matchedSkills, ["director"]);
  assert.equal(stored.drawerState.visible, true);
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.ok(drawer && drawer.hidden !== true);
  assert.match(drawer.textContent, /导演计划：雨屋样例项目/);
  const lastMessage = panel.state.messages[panel.state.messages.length - 1];
  assert.match(String(lastMessage?.content || ""), /导演计划/);
});

test("appAssistantPanel ViMax lane: 导演: routes to vimaxNativePlan (not chat), polls, lands a shotplan execution", async () => {
  let chatCalls = 0;
  const vimaxPlanCalls = [];
  const jobCalls = [];
  const SHOTPLAN = {
    schemaVersion: "vimax-shotplan/v1",
    flowId: "f-test",
    scenes: [{ idx: 0, script: "S0" }],
    characters: [],
    shots: [
      { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide shore", motionDesc: "static", audioDesc: "waves", variationType: "small" },
      { idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close hands", motionDesc: "pries cork", audioDesc: "thwomp", variationType: "medium", lfDesc: "lowered" },
    ],
    skillRefs: ["电影布光大师"],
    elapsedSec: 1.0,
  };
  const state = createAssistantPanelState({
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "unexpected", actions: [] };
      },
      async vimaxNativePlan(payload) {
        vimaxPlanCalls.push(payload);
        return { success: true, jobId: "vjob-1", status: "running" };
      },
      async vimaxNativeJob(jobId, since) {
        jobCalls.push([jobId, since]);
        return { success: true, jobId, status: "done", progress: [{ type: "progress", phase: "done" }], progressTotal: 1, outputs: [], result: SHOTPLAN };
      },
    },
  });

  const result = await state.sendMessage("导演: 用《电影布光大师》拍雨夜告别");

  assert.equal(chatCalls, 0, "vimax lane intercepts the prefix; chat never called");
  assert.equal(vimaxPlanCalls.length, 1, "routed to vimaxNativePlan");
  assert.deepEqual(vimaxPlanCalls[0].skillRefs, ["电影布光大师"], "《》 picks forwarded as skillRefs");
  assert.ok(jobCalls.length >= 1, "polled the async job");
  assert.match(String(result?.reply || ""), /已规划 2 镜/);
  // C5.2: native is the only runtime, so the reply IS marked (原生).
  assert.match(String(result?.reply || ""), /原生/, "native plan reply is marked native");
  const last = state.messages[state.messages.length - 1];
  assert.equal(last.kind, "vimax_plan");
});

test("appAssistantPanel F10: 导演: does NOT hit directorPlan when QMAI is dormant (default)", async () => {
  const directorCalls = [];
  let chatCalls = 0;
  const state = createAssistantPanelState({
    // directorLegacyQmai defaults to false
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "ok", actions: [] };
      },
      async directorPlan(payload) {
        directorCalls.push(payload);
        return { success: true, reply: "should not happen" };
      },
    },
  });
  await state.sendMessage("导演: 铺一版计划");
  assert.equal(directorCalls.length, 0, "dormant -> 导演: never reaches the QMAI bridge");
  assert.equal(chatCalls, 1, "falls through to the normal chat lane instead");
});

test("appAssistantPanel ViMax lane: not-configured native brain fails closed with guidance", async () => {
  const state = createAssistantPanelState({
    api: {
      async chat() {
        return { reply: "x", actions: [] };
      },
      async vimaxNativePlan() {
        return { success: false, status: "not-configured", error: "grsai credentials not configured" };
      },
    },
  });
  await state.sendMessage("成片: 推这支登山杖");
  assert.match(String(state.lastReceipt || ""), /未配置/);
  assert.equal(state.status, "error");
});

test("appAssistantPanel Phase 5 UI: queued director executions prepare through the director bridge", async () => {
  const document = createFakeDocument();
  const directorCalls = [];
  const prepareCalls = [];
  const executions = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-director-prepare",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-active",
    title: "Active task",
    status: "waiting_confirmation",
    drawerState: { visible: true, line1: "Active task", line2: "Ready", pendingConfirmationCount: 1 },
    plan: { id: "plan-active", steps: [{ id: "s1", title: "Active step" }] },
    actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "n1", nodeType: "ai-video" }] },
  });
  executionStore.enqueueExecution({
    id: "exec-director-queued",
    title: "导演计划：雨屋",
    status: "queued_draft",
    matchedSkills: ["director"],
    drawerState: { visible: false, line1: "导演计划：雨屋", line2: "排队中" },
    plan: { id: "plan-stale", steps: [{ id: "step_cards", title: "旧卡" }] },
    actionsByStep: { step_cards: [{ id: "stale", type: "create_node", nodeType: "comment", name: "旧" }] },
  });
  const panel = createAppAssistantPanel({
    document,
    graphStore: { nodes: [] },
    executionStore,
    executionSyncClient: false,
    agentMode: "act",
    directorLegacyQmai: true,
    api: {
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
      async prepareQueuedExecution(payload) {
        prepareCalls.push(payload);
        return { plan: { id: "plan-generic" }, actionsByStep: {} };
      },
      async directorPlan(payload) {
        directorCalls.push(payload);
        return {
          success: true,
          reply: "已按最新 QMAI 记忆重新编排。",
          intent: { id: "director_plan", matchedSkills: ["director"] },
          plan: { id: "plan-fresh-director", title: "导演计划：雨屋", status: "draft", steps: [{ id: "step_cards", title: "铺导演知识卡" }] },
          actionsByStep: { step_cards: [{ id: "qmai-knowledge-fresh", type: "create_node", nodeType: "comment", name: "新卡" }] },
          actions: [{ id: "qmai-knowledge-fresh", type: "create_node", nodeType: "comment", name: "新卡" }],
        };
      },
    },
    async executeActions(payload) {
      executions.push(payload);
      return { appliedCount: payload.actions.length, createdNodeIds: [payload.actions[0].id] };
    },
  });

  panel.init();
  panel.open();
  panel.root.querySelector(".hy-canvas-agent-execution-action").click();
  await panel.flush();

  assert.equal(directorCalls.length, 1);
  assert.equal(directorCalls[0].recompile, true);
  assert.equal(prepareCalls.length, 0);
  const directorExecuted = executions.find((payload) => payload.executionId === "exec-director-queued");
  assert.ok(directorExecuted);
  assert.equal(directorExecuted.actions[0].id, "qmai-knowledge-fresh");
  assert.equal(
    executionStore.getExecution("exec-director-queued").actionsByStep.step_cards[0].id,
    "qmai-knowledge-fresh"
  );
});

test("appAssistantPanel Phase 6 UI: structural v2 plan auto-executes in plan mode without confirmation", async () => {
  const document = createFakeDocument();
  const runCalls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-auto-exec",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      runCalls.push([executionId, options]);
      executionStore.updateStatus(executionId, "completed", {
        drawerState: { visible: true, line2: "执行完成" },
      });
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    executionSyncClient: false,
    agentMode: "plan",
    api: {
      async chat() {
        return {
          reply: "已为您整理画布布局。",
          intent: { id: "layout", mode: "plan", matchedSkills: [] },
          plan: { id: "plan-layout", title: "整理画布", status: "draft", steps: [{ id: "s1", title: "布局" }] },
          actionsByStep: { s1: [{ id: "a1", type: "layout_nodes", layout: "grid", nodeIds: ["n1"] }] },
          execution: { id: "exec-layout-auto", status: "draft", drawerState: { visible: true, line1: "整理画布", line2: "已为您整理画布布局。" } },
          actions: [{ id: "a1", type: "layout_nodes", layout: "grid", nodeIds: ["n1"] }],
        };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "整理画布";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();
  await panel.flush();

  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0][0], "exec-layout-auto");
  // 历史入口已迁到头部 ⟲ 图标:完成的结构性执行不再常驻输入框上方抽屉(归历史按需看)。
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(drawer.hidden, true, "completed structural execution no longer 常驻 (history moved to the header icon)");
  assert.doesNotMatch(panel.root.textContent || "", /确认执行吗/);
  assert.equal(executionStore.getExecution("exec-layout-auto").status, "completed");
});

test("appAssistantPanel: 执行历史 entry lives on the header icon (badge=count); not a bar above the input", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-exec-hist-header",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({ id: "e1", title: "已完成A", status: "completed", drawerState: { visible: false } });
  executionStore.createExecution({ id: "e2", title: "已完成B", status: "completed", drawerState: { visible: false } });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });
  panel.init();
  panel.open();
  await panel.flush();

  // entry is now a header icon with a count badge
  const btn = panel.root.querySelector(".hy-canvas-agent-exec-history-btn");
  assert.ok(btn, "执行历史 header icon exists");
  assert.match(btn.getAttribute("aria-label") || "", /执行历史（2）/);
  assert.equal(panel.root.querySelector(".hy-canvas-agent-exec-history-badge").textContent, "2");
  // the old above-input toggle bar is gone, and the drawer is not 常驻 by default
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-history-toggle"), null, "no toggle bar above the input");
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-drawer").hidden, true, "drawer not 常驻");

  // clicking the header icon opens the history list, clicking again closes it
  btn.click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-drawer").hidden, false, "history list opens");
  assert.ok(panel.root.querySelector(".hy-canvas-agent-execution-history-item"), "history items listed");
  panel.root.querySelector(".hy-canvas-agent-exec-history-btn").click();
  await panel.flush();
  assert.equal(panel.root.querySelector(".hy-canvas-agent-execution-drawer").hidden, true, "history list closes");
});

test("appAssistantPanel Phase 6 UI: plan-mode image generation waits for the counted confirmation card", async () => {
  const document = createFakeDocument();
  const runCalls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-image-confirm",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      runCalls.push([executionId, options]);
      return { status: "completed" };
    },
  };
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    executionSyncClient: false,
    agentMode: "plan",
    api: {
      async chat() {
        return {
          reply: "已准备生成。",
          intent: { id: "gen", mode: "plan", matchedSkills: [] },
          plan: { id: "plan-gen", title: "生成图文", status: "draft", steps: [{ id: "s1", title: "生成" }] },
          actionsByStep: {
            s1: [
              { id: "t1", type: "queue_generation_task", nodeId: "n-text", nodeType: "ai-text" },
              { id: "g1", type: "queue_generation_task", nodeId: "n-img-1", nodeType: "ai-image" },
              { id: "g2", type: "queue_generation_task", nodeId: "n-img-2", nodeType: "ai-image" },
            ],
          },
          execution: { id: "exec-img-confirm", status: "draft", drawerState: { visible: true, line1: "生成图文", line2: "已准备生成。" } },
          actions: [],
        };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "生成图文";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();
  await panel.flush();

  assert.equal(runCalls.length, 0);
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.match(drawer.textContent, /本次将生成 1 个文本节点、2 个图片节点，确认执行吗？/);
  const confirmButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(confirmButton.textContent, "确认");

  confirmButton.click();
  await panel.flush();
  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0][1].videoAuthorized, false);
});

test("appAssistantPanel Phase 6 UI: act-mode image generation auto-executes, video requires one-step confirm", async () => {
  const document = createFakeDocument();
  const runCalls = [];
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-act-video",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const executionOrchestrator = {
    async run(executionId, options) {
      runCalls.push([executionId, options]);
      executionStore.updateStatus(executionId, "completed", { drawerState: { visible: true, line2: "执行完成" } });
      return { status: "completed" };
    },
  };
  const respond = (id, actions) => ({
    reply: "ok",
    intent: { id: "gen", mode: "act", matchedSkills: [] },
    plan: { id: `plan-${id}`, title: id, status: "draft", steps: [{ id: "s1", title: "生成" }] },
    actionsByStep: { s1: actions },
    execution: { id, status: "draft", drawerState: { visible: true, line1: id, line2: "ok" } },
    actions: [],
  });
  let nextResponse = respond("exec-act-image", [
    { id: "g1", type: "queue_generation_task", nodeId: "n-img", nodeType: "ai-image" },
  ]);
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionOrchestrator,
    executionSyncClient: false,
    agentMode: "act",
    api: {
      async chat() {
        return nextResponse;
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "生成图片";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();
  await panel.flush();
  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0][0], "exec-act-image");

  nextResponse = respond("exec-act-video", [
    { id: "v1", type: "queue_generation_task", nodeId: "n-video", nodeType: "ai-video" },
  ]);
  input.value = "生成视频";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();
  await panel.flush();

  assert.equal(runCalls.length, 1);
  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.match(drawer.textContent, /本次将生成 1 个视频节点，确认执行吗？/);
  const confirmButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(confirmButton.textContent, "确认");
  confirmButton.click();
  await panel.flush();
  assert.equal(runCalls.length, 2);
  assert.equal(runCalls[1][0], "exec-act-video");
  assert.equal(runCalls[1][1].videoAuthorized, true);
});

test("appAssistantPanel Phase 6 UI: drawer dedupes line1==line2 into a status line", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-dedupe",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: false,
    agentMode: "plan",
    api: {
      async chat() {
        return {
          reply: "已为您重新整理全画布节点布局。",
          intent: { id: "layout", mode: "plan", matchedSkills: [] },
          plan: { id: "plan-dup", title: "已为您重新整理全画布节点布局。", status: "draft", steps: [{ id: "s1", title: "布局" }] },
          actionsByStep: { s1: [{ id: "a1", type: "queue_generation_task", nodeId: "n-img", nodeType: "ai-image" }] },
          execution: {
            id: "exec-dup",
            status: "draft",
            drawerState: {
              visible: true,
              line1: "已为您重新整理全画布节点布局。",
              line2: "已为您重新整理全画布节点布局。",
            },
          },
          actions: [],
        };
      },
    },
  });

  panel.init();
  panel.open();
  const input = panel.root.querySelector(".hy-canvas-agent-input");
  input.value = "整理";
  input.dispatchEvent({ type: "input" });
  panel.root.querySelector(".hy-canvas-agent-send").click();
  await panel.flush();
  await panel.flush();

  const stored = executionStore.getExecution("exec-dup");
  assert.notEqual(stored.drawerState.line2, stored.drawerState.line1);
});

test("appAssistantPanel Phase 6 UI: confirmation state renders count badges and highlighted confirm", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-confirm-visual",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-visual",
    title: "生成图文",
    status: "draft",
    drawerState: { visible: true, line1: "生成图文", line2: "本次将生成 1 个文本节点、2 个图片节点，确认执行吗？" },
    plan: { id: "p", steps: [{ id: "s1", title: "生成" }] },
    actionsByStep: {
      s1: [
        { id: "t1", type: "queue_generation_task", nodeId: "n-text", nodeType: "ai-text" },
        { id: "g1", type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" },
        { id: "g2", type: "queue_generation_task", nodeId: "n2", nodeType: "ai-image" },
      ],
    },
  });
  const panel = createAppAssistantPanel({
    document,
    executionStore,
    executionSyncClient: false,
    agentMode: "plan",
  });

  panel.init();
  panel.open();

  const drawer = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.equal(drawer.getAttribute("data-confirm"), "true");
  const badges = panel.root.querySelectorAll(".hy-canvas-agent-confirm-badge");
  assert.deepEqual(
    badges.map((badge) => badge.textContent),
    ["文本 ×1", "图片 ×2"]
  );
  const confirmButton = panel.root.querySelector(".hy-canvas-agent-execution-action");
  assert.equal(confirmButton.getAttribute("data-confirm"), "true");

  executionStore.updateStatus("exec-visual", "executing", { drawerState: { visible: true, line2: "执行中" } });
  panel.state.notifyExternalUpdate?.() ?? panel.root.querySelector(".hy-canvas-agent-execution-expand").click();
  const after = panel.root.querySelector(".hy-canvas-agent-execution-drawer");
  assert.notEqual(after.getAttribute("data-confirm"), "true");
});

test("appAssistantPanel Phase 6 UI: technical repair warnings stay out of the user warning strip", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    executionSyncClient: false,
    agentMode: "act",
    api: {
      async chat() {
        return {
          reply: "已创建图像工作流。",
          actions: [{ id: "g1", type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" }],
          warnings: [
            "action[2] repaired connect endpoint aliases",
            "repaired generation target alias",
            "连续性拦截：服装不一致",
          ],
        };
      },
      async validateActions(payload) {
        return { success: true, valid: true, actions: payload.actions };
      },
    },
  });

  panel.init();
  panel.open();
  await panel.send("生成图片");
  await panel.flush();

  const preview = panel.root.querySelector(".hy-canvas-agent-preview");
  const previewText = preview ? preview.textContent : "";
  assert.doesNotMatch(previewText, /repaired/);
  assert.match(previewText, /连续性拦截/);
});

test("appAssistantPanel Phase 6 UI: drawer render dedupes legacy executions with identical lines", async () => {
  const document = createFakeDocument();
  const executionStore = createAssistantExecutionStore({
    storage: memoryStorage(),
    projectId: "project-legacy-dup",
    clock: () => "2026-06-10T00:00:00.000Z",
  });
  executionStore.createExecution({
    id: "exec-legacy-dup",
    title: "已为您重新整理全画布节点布局。我们使用了分镜网格。",
    status: "completed",
    drawerState: {
      visible: true,
      line1: "已为您重新整理全画布节点布局。我们使用了分镜网格。",
      line2: "已为您重新整理全画布节点布局。我们使用了分镜网格。",
    },
  });
  const panel = createAppAssistantPanel({ document, executionStore, executionSyncClient: false });

  panel.init();
  panel.open();
  await reopenCompletedFromHistory(panel);

  const lineOne = panel.root.querySelector(".hy-canvas-agent-execution-line1");
  const lineTwo = panel.root.querySelector(".hy-canvas-agent-execution-line2");
  assert.ok(lineOne.textContent.includes("重新整理全画布"));
  assert.notEqual(lineTwo.textContent, lineOne.textContent);
});
