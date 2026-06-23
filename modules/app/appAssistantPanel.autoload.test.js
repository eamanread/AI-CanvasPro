import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanvasAgentGraphStoreAdapter,
  createCanvasSkillsRuntime,
  createCanvasAgentTemplateStore,
  isLowRiskAssistantAction,
  installAppAssistantPanel,
} from "./appAssistantPanel.autoload.js";
import { createAssistantPanelState } from "./appAssistantPanel.js";

const keyPrefix = "s" + "k-";

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

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.hidden = false;
    this.listeners = new Map();
    this.attributes = {};
    this.dataset = {};
    this.textContent = "";
  }

  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
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

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  click() {
    this.listeners.get("click")?.({ type: "click", target: this, currentTarget: this });
  }

  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const id = selector.startsWith("#") ? selector.slice(1) : "";
    const visit = (node) => {
      for (const child of node.children) {
        if (id && child.id === id) {
          return child;
        }
        if (className && String(child.className || "").split(/\s+/).includes(className)) {
          return child;
        }
        const match = visit(child);
        if (match) {
          return match;
        }
      }
      return null;
    };
    return visit(this);
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
    addEventListener() {},
    getElementById(id) {
      return body.querySelector(`#${id}`) || head.querySelector(`#${id}`) || null;
    },
    querySelector(selector) {
      return body.querySelector(selector) || head.querySelector(selector);
    },
  };
}

test("appAssistantPanel.autoload: video prep node is low risk but video queue is not", () => {
  assert.equal(
    isLowRiskAssistantAction({ type: "create_node", nodeType: "ai-video" }),
    true
  );
  assert.equal(
    isLowRiskAssistantAction({
      type: "queue_generation_task",
      nodeType: "ai-video",
      nodeId: "video_1",
    }),
    false
  );
});

test("appAssistantPanel.autoload: installAppAssistantPanel mounts the real panel", () => {
  const document = createFakeDocument();
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    autoInstall: false,
  });

  assert.ok(controller);
  assert.equal(document.body.children.includes(controller.root), true);
  assert.ok(controller.root.querySelector(".hy-canvas-agent-launcher"));
});

test("appAssistantPanel.autoload: installAppAssistantPanel reuses the existing fab button", () => {
  const document = createFakeDocument();
  const fab = document.createElement("button");
  fab.id = "fabBtn";
  fab.className = "fab-btn";
  document.body.appendChild(fab);

  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    autoInstall: false,
  });

  assert.ok(controller);
  assert.equal(controller.root.querySelector(".hy-canvas-agent-launcher"), null);
  assert.match(fab.className, /hy-canvas-agent-fab-bound/);
  assert.equal(fab.textContent, "RH");
});

test("appAssistantPanel.autoload: registry text config feeds model selector without exposing secrets", () => {
  const document = createFakeDocument();
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    apiConfig: {
      modelRegistry: {
        text: [
          {
            id: "text-gpt-55",
            modelName: "GPT 5.5",
            modelId: "gpt-5.5",
            apiKey: `${keyPrefix}test-secret`,
            baseUrl: "https://right.codes/codex/v1",
            status: "unverified",
          },
        ],
      },
    },
    autoInstall: false,
  });

  const modelButton = controller.root.querySelector(".hy-canvas-agent-mode-pill");
  assert.match(modelButton.textContent, /GPT 5\.5/);
  assert.doesNotMatch(modelButton.textContent, /model_registry|text-gpt-55/);
  assert.doesNotMatch(controller.root.textContent, new RegExp(`${keyPrefix}test-secret`));
  assert.equal(controller.state.selectedModel.provider, "model_registry");
  assert.equal(controller.state.selectedModel.model, "gpt-5.5");
});

test("appAssistantPanel.autoload: model selector keeps only configured registry text options selectable", () => {
  const document = createFakeDocument();
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "Ready", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    apiConfig: {
      modelRegistry: {
        text: [
          {
            id: "text-missing-key",
            modelName: "Text Missing Key",
            modelId: "agent-high-quality",
            apiKey: "",
            baseUrl: "https://example.invalid/v1",
            status: "unconfigured",
          },
          {
            id: "text-low-latency",
            modelName: "Text Low Latency",
            modelId: "agent-low-latency",
            apiKey: "configured-key",
            baseUrl: "https://example.invalid/v1",
            status: "unverified",
          },
        ],
      },
      providers: {
        pi_canvas_agent: {
          endpoint: "https://example.invalid/v1",
          apiKeyConfigured: true,
          defaultModel: "legacy-agent",
          displayName: "Legacy Agent",
        },
      },
    },
    autoInstall: false,
  });

  assert.equal(controller.state.selectedModel.provider, "model_registry");
  assert.equal(controller.state.selectedModel.id, "text-low-latency");
  assert.equal(controller.state.selectedModel.model, "agent-low-latency");
  assert.equal(controller.state.modelOptions.length, 2);
  assert.deepEqual(
    controller.state.modelOptions.map((item) => item.displayName),
    ["Text Missing Key", "Text Low Latency"]
  );
  const missingKeyOption = controller.state.modelOptions.find(
    (item) => item.displayName === "Text Missing Key"
  );
  assert.equal(missingKeyOption.configured, false);
  assert.ok(missingKeyOption.disabledReason.includes("API Key"));
  assert.equal(controller.state.rawModelOptions.some((item) => item.provider === "pi_canvas_agent"), true);
});

test("appAssistantPanel.autoload: async registry text config keeps sends blocked until models load", async () => {
  const document = createFakeDocument();
  let chatCalls = 0;
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        chatCalls += 1;
        return { reply: "Ready", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    configLoader: async () => ({
      modelRegistry: {
        text: [
          {
            id: "text-gpt-55",
            modelName: "GPT 5.5",
            modelId: "gpt-5.5",
            apiKey: `${keyPrefix}test-secret`,
            baseUrl: "https://right.codes/codex/v1",
            status: "unverified",
          },
        ],
      },
    }),
    autoInstall: false,
  });

  assert.equal(controller.state.canSendMessage(), false);
  assert.equal(await controller.state.sendMessage("too early"), null);
  assert.equal(chatCalls, 0);

  await controller.modelConfigReady;

  assert.equal(controller.state.canSendMessage(), true);
  assert.equal(controller.state.selectedModel.provider, "model_registry");
  assert.equal(controller.state.selectedModel.model, "gpt-5.5");
  assert.doesNotMatch(controller.root.textContent, new RegExp(`${keyPrefix}test-secret`));
});

test("appAssistantPanel.autoload: configured settings text model can drive agent chat", async () => {
  const document = createFakeDocument();
  let capturedRequest = null;
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat(request) {
        capturedRequest = request;
        return { reply: "registry text model reply", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    apiConfig: {
      modelRegistry: {
        text: [
          {
            id: "mdl_text_gpt_55",
            nodeType: "text",
            modelName: "GPT 5.5",
            modelId: "gpt-5.5",
            apiKey: "registry-text-secret",
            baseUrl: "https://text.example/v1/chat/completions",
            status: "unverified",
            adapterType: "openai_compatible",
          },
        ],
      },
      providers: {
        pi_canvas_agent: {
          proxyBaseUrl: "http://pi.example/v1",
          proxyToken: "legacy-agent-token",
          model: "legacy-agent",
        },
      },
    },
    autoInstall: false,
  });

  assert.equal(controller.state.selectedModel?.provider, "model_registry");
  assert.equal(controller.state.selectedModel?.model, "gpt-5.5");
  assert.equal(controller.state.canSendMessage(), true);
  const response = await controller.state.sendMessage("use settings text model");
  assert.equal(response.reply, "registry text model reply");
  assert.equal(capturedRequest.model.provider, "model_registry");
  assert.equal(capturedRequest.model.id, "mdl_text_gpt_55");
  assert.equal(capturedRequest.model.model, "gpt-5.5");
  assert.doesNotMatch(JSON.stringify(capturedRequest), /registry-text-secret|legacy-agent-token/);
});

test("appAssistantPanel.autoload: configured async registry text model from settings can drive agent chat", async () => {
  const document = createFakeDocument();
  let capturedRequest = null;
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat(request) {
        capturedRequest = request;
        return { reply: "text model reply", actions: [] };
      },
    },
    graphStore: { nodes: [] },
    configLoader: async () => ({
      modelRegistry: {
        text: [
          {
            id: "text-grsai",
            modelName: "GRSAI Text",
            modelId: "grsai",
            apiKey: "configured-text-only-key",
            baseUrl: "https://grsai.example/v1",
            status: "unverified",
          },
        ],
      },
      providers: {
        grsai: {
          apiUrl: "https://grsai.example/v1",
          apiKey: "configured-text-only-key",
          model: "grsai",
        },
        pi_canvas_agent: {
          proxyBaseUrl: "",
          proxyToken: "",
          model: "",
        },
      },
    }),
    autoInstall: false,
  });

  await controller.modelConfigReady;

  assert.equal(controller.state.selectedModel?.provider, "model_registry");
  assert.equal(controller.state.canSendMessage(), true);
  const response = await controller.state.sendMessage("use the configured text model");
  assert.equal(response.reply, "text model reply");
  assert.equal(capturedRequest.model.provider, "model_registry");
  assert.equal(capturedRequest.model.id, "text-grsai");
  assert.equal(capturedRequest.model.model, "grsai");
  assert.doesNotMatch(JSON.stringify(capturedRequest), /configured-text-only-key/);
});

test("appAssistantPanel.autoload: graph adapter flattens assistant node data and normalizes edges", () => {
  const calls = [];
  const realGraphStore = {
    getState() {
      return {
        nodes: {
          node_a: { id: "node_a", type: "ai-text" },
        },
        edges: {},
      };
    },
    addNode(node) {
      calls.push({ type: "addNode", node });
    },
    addEdge(edge) {
      calls.push({ type: "addEdge", edge });
    },
    updateNodeData(nodeId, patch) {
      calls.push({ type: "updateNodeData", nodeId, patch });
    },
    setSelectedNodes(nodeIds) {
      calls.push({ type: "setSelectedNodes", nodeIds });
    },
  };
  const adapter = createCanvasAgentGraphStoreAdapter(realGraphStore);

  assert.deepEqual(adapter.nodes, [{ id: "node_a", type: "ai-text" }]);
  adapter.addNode({
    id: "draft",
    type: "ai-text",
    data: { prompt: "hello", content: "world" },
  });
  adapter.addEdge({ id: "edge_1", source: "draft", target: "node_a" });
  adapter.updateNodeData("draft", { prompt: "next" });
  adapter.setSelectedNodes(["draft"]);

  assert.deepEqual(calls, [
    {
      type: "addNode",
      node: { prompt: "hello", content: "world", id: "draft", type: "ai-text" },
    },
    {
      type: "addEdge",
      edge: {
        id: "edge_1",
        source: "draft",
        target: "node_a",
        sourceId: "draft",
        targetId: "node_a",
      },
    },
    { type: "updateNodeData", nodeId: "draft", patch: { prompt: "next" } },
    { type: "setSelectedNodes", nodeIds: ["draft"] },
  ]);
});

test("appAssistantPanel.autoload: graph adapter subscription keeps generation cards synced", async () => {
  let listener = null;
  const nodes = {
    "image-1": {
      id: "image-1",
      type: "ai-image",
      data: {
        generationStatus: "running",
        isGenerating: true,
        prompt: "flying pig",
      },
    },
  };
  const realGraphStore = {
    getState() {
      return { nodes, edges: {} };
    },
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  const graphStore = createCanvasAgentGraphStoreAdapter(realGraphStore);
  const state = createAssistantPanelState({
    agentMode: "act",
    graphStore,
    api: {
      async chat() {
        return {
          reply: "I will generate an image.",
          actions: [
            {
              type: "queue_generation_task",
              nodeId: "image-1",
              nodeType: "ai-image",
              prompt: "flying pig",
            },
          ],
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

  await state.sendMessage("generate a flying pig image");

  assert.equal(state.messages[1].cards[0].status, "generating");
  assert.equal(typeof listener, "function");

  nodes["image-1"] = {
    ...nodes["image-1"],
    data: {
      ...nodes["image-1"].data,
      generationStatus: "running",
      jobStatus: "error",
      asyncTaskStatus: "failed",
      isGenerating: false,
      error: "activation required",
    },
  };
  listener();

  assert.equal(state.messages[1].cards[0].status, "failed");
  assert.equal(state.messages[1].cards[0].expanded, true);
  assert.equal(state.messages[1].cards[0].items[0].error, "activation required");
});

test("appAssistantPanel.autoload: creates a canvas skills runtime from live canvas adapters", async () => {
  const realGraphStore = {
    nodes: [],
    edges: [],
    addNode(node) {
      this.nodes.push(node);
      return node;
    },
    addEdge(edge) {
      this.edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = this.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...patch };
      }
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes: this.nodes, edges: this.edges };
    },
  };
  const bridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  const graphStore = createCanvasAgentGraphStoreAdapter(realGraphStore);
  const runtime = createCanvasSkillsRuntime({
    graphStore,
    nodeFlows: {
      createNodeAtCursor(nodeType) {
        const node = { id: `${nodeType}-1`, type: nodeType, data: {} };
        realGraphStore.addNode(node);
        bridge.nodeInstances.set(node.id, {
          async onGenerate(prompt) {
            return { started: true, prompt };
          },
        });
        return node;
      },
    },
    rendererBridge: bridge,
  });

  const result = await runtime.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "cat" },
    ],
    agentMode: "plan",
  });

  assert.equal(typeof runtime.executeActions, "function");
  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(realGraphStore.nodes[0].data.prompt, "cat");
});

test("appAssistantPanel.autoload: creates canvas skills runtime from window.v2Renderer bridge", async () => {
  const previousWindow = globalThis.window;
  const realGraphStore = {
    nodes: [],
    edges: [],
    addNode(node) {
      this.nodes.push(node);
      return node;
    },
    addEdge(edge) {
      this.edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = this.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...patch };
      }
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes: this.nodes, edges: this.edges };
    },
  };
  const generated = [];
  const bridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  try {
    globalThis.window = { v2Renderer: bridge };
    const runtime = createCanvasSkillsRuntime({
      graphStore: createCanvasAgentGraphStoreAdapter(realGraphStore),
      nodeFlows: {
        createNodeAtCursor(nodeType) {
          const node = { id: `${nodeType}-1`, type: nodeType, data: {} };
          realGraphStore.addNode(node);
          bridge.nodeInstances.set(node.id, {
            async onGenerate(prompt) {
              generated.push(prompt);
              return { started: true };
            },
          });
          return node;
        },
      },
      pollIntervalMs: 1,
      readinessTimeoutMs: 20,
    });

    const result = await runtime.executeActions({
      actions: [
        { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" },
        { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "cat" },
      ],
    });

    assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
    assert.deepEqual(generated, ["cat"]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("appAssistantPanel.autoload: injects canvas skills runtime into assistant execution", async () => {
  const previousWindow = globalThis.window;
  const document = createFakeDocument();
  const graphStore = {
    nodes: [],
    edges: [],
    addNode(node) {
      this.nodes.push(node);
      return node;
    },
    addEdge(edge) {
      this.edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = this.nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...patch };
      }
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes: this.nodes, edges: this.edges };
    },
  };
  let executePayload = null;
  try {
    globalThis.window = {
      appCanvasNodeFlows: {
        createNodeAtCursor(nodeType) {
          const node = { id: `${nodeType}-1`, type: nodeType, data: {} };
          graphStore.addNode(node);
          return node;
        },
      },
      __v2RendererBridge: {
        isNodeMounted: () => true,
        getMountedWrapper: () => ({}),
        pinNode() {},
        unpinNode() {},
        nodeInstances: new Map([
          [
            "ai-image-1",
            {
              async onGenerate() {
                return { started: true };
              },
            },
          ],
        ]),
      },
    };
    const controller = installAppAssistantPanel({
      document,
      graphStore,
      api: {
        async chat() {
          return { reply: "Ready", actions: [] };
        },
        async validateActions(payload) {
          return { success: true, actions: payload.actions };
        },
      },
      async executeActions(payload) {
        executePayload = payload;
        return { appliedCount: 1 };
      },
      autoInstall: false,
    });

    controller.state.setPendingActions([
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" },
    ]);
    await controller.state.applyPendingActions();

    assert.equal(typeof executePayload.canvasSkillsRuntime?.executeActions, "function");
    assert.equal(executePayload.agentMode, "plan");
  } finally {
    globalThis.window = previousWindow;
  }
});

test("appAssistantPanel.autoload: degraded canvas skills keeps chat available and blocks canvas execution", async () => {
  const document = createFakeDocument();
  const timers = [];
  const controller = installAppAssistantPanel({
    document,
    api: {
      async chat() {
        return { reply: "我可以继续聊天，但不能操作画布。", actions: [] };
      },
    },
    graphStore: { nodes: [], edges: [] },
    autoInstall: false,
    noticeDurationMs: 3000,
    noticeFadeMs: 160,
    setTimeoutFn(callback, ms) {
      timers.push({ callback, ms });
      return timers.length;
    },
    clearTimeoutFn() {},
  });

  assert.equal(controller.state.debugSnapshot().canvasSkills.chatOnly, true);
  assert.match(controller.state.debugSnapshot().canvasSkills.notice, /画布 Skills 未加载/);

  await controller.state.sendMessage("你好");
  const runtime = controller.state.canvasSkillsRuntime;
  const result = await runtime.executeActions({ actions: [{ type: "create_node", nodeType: "ai-image" }] });

  assert.equal(result.success, false);
  assert.match(result.warnings.join("\n"), /画布 Skills 未加载/);
  assert.equal(timers[0].ms, 3000);
});

test("appAssistantPanel.autoload: creates project-scoped workflow template store", () => {
  const storage = createMemoryStorage();
  const workspaceStore = {
    getState() {
      return { currentProjectId: "project-a" };
    },
  };
  const store = createCanvasAgentTemplateStore({ storage, workspaceStore });

  store.save({
    templateId: "tpl-story",
    name: "Story template",
    version: "1.0.0",
    nodes: [{ id: "script", type: "ai-text" }],
    edges: [],
  });

  assert.equal(store.get("tpl-story").projectId, "project-a");
});

test("appAssistantPanel.autoload: creates team-aware workflow template store", () => {
  const storage = createMemoryStorage();
  const workspaceStore = {
    getState() {
      return { currentProjectId: "project-a", currentTeamId: "team-alpha" };
    },
  };
  const store = createCanvasAgentTemplateStore({ storage, workspaceStore });

  store.save({
    templateId: "tpl-team-story",
    name: "Team story workflow",
    scope: "project",
    version: "1.0.0",
    nodes: [{ id: "script", type: "ai-text" }],
    edges: [],
  });
  store.review("tpl-team-story", { decision: "approve", reviewer: "lead" });
  store.publish("tpl-team-story", { teamId: "team-alpha", publishedBy: "lead" });
  const teammateStore = createCanvasAgentTemplateStore({
    storage,
    projectId: "project-b",
    teamId: "team-alpha",
  });

  assert.equal(teammateStore.get("tpl-team-story", { scope: "team" }).teamId, "team-alpha");
});

test("appAssistantPanel.autoload: live fixture injection overrides api graph and models only when provided", () => {
  const document = createFakeDocument();
  const fixtureApi = {
    async chat() {
      return { reply: "fixture", actions: [] };
    },
  };
  const fixtureGraph = { nodes: [], edges: [] };
  const controller = installAppAssistantPanel({
    document,
    liveFixture: {
      api: fixtureApi,
      graphStore: fixtureGraph,
      modelOptions: [
        {
          provider: "model_registry",
          id: "text-live-fixture",
          modelId: "agent-live-fixture",
          model: "agent-live-fixture",
          displayName: "Live Fixture Text",
          configured: true,
          supportsText: true,
        },
      ],
      selectedModel: {
        provider: "model_registry",
        id: "text-live-fixture",
        modelId: "agent-live-fixture",
        model: "agent-live-fixture",
        displayName: "Live Fixture Text",
        configured: true,
        supportsText: true,
      },
    },
    autoInstall: false,
  });

  assert.equal(controller.state.selectedModel.modelId, "agent-live-fixture");
  assert.deepEqual(controller.state.modelOptions.map((item) => item.modelId), ["agent-live-fixture"]);
});

test("appAssistantPanel.autoload: reads guarded window live fixture bootstrap", () => {
  const previousWindow = globalThis.window;
  const fixtureApi = { async chat() { return { reply: "fixture", actions: [] }; } };
  const fixtureGraph = { nodes: [], edges: [] };
  try {
    globalThis.window = {
      __HUANYING_CANVAS_AGENT_ENABLE_LIVE_FIXTURE__: true,
      __HUANYING_CANVAS_AGENT_LIVE_FIXTURE__: { id: "fixture" },
      __HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__(raw) {
        return {
          api: fixtureApi,
          graphStore: fixtureGraph,
          modelOptions: [
            {
              provider: "model_registry",
              id: `text-${raw.id}`,
              modelId: raw.id,
              model: raw.id,
              displayName: "Fixture Text",
              configured: true,
              supportsText: true,
            },
          ],
          selectedModel: {
            provider: "model_registry",
            id: `text-${raw.id}`,
            modelId: raw.id,
            model: raw.id,
            displayName: "Fixture Text",
            configured: true,
            supportsText: true,
          },
        };
      },
    };
    const controller = installAppAssistantPanel({
      document: createFakeDocument(),
      autoInstall: false,
    });

    assert.equal(controller.state.selectedModel.modelId, "fixture");
    assert.deepEqual(controller.state.modelOptions.map((item) => item.modelId), ["fixture"]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("appAssistantPanel.autoload: ignores window live fixture unless explicitly gated", async () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = {
      __HUANYING_CANVAS_AGENT_LIVE_FIXTURE__: { id: "fixture" },
      __HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__(raw) {
        return {
          modelOptions: [
            {
              provider: "model_registry",
              id: `text-${raw.id}`,
              modelId: raw.id,
              model: raw.id,
              displayName: "Fixture Text",
              configured: true,
              supportsText: true,
            },
          ],
          selectedModel: {
            provider: "model_registry",
            id: `text-${raw.id}`,
            modelId: raw.id,
            model: raw.id,
            displayName: "Fixture Text",
            configured: true,
            supportsText: true,
          },
        };
      },
    };
    const controller = installAppAssistantPanel({
      document: createFakeDocument(),
      api: { async chat() { return { reply: "normal", actions: [] }; } },
      graphStore: { nodes: [] },
      configLoader: async () => ({
        modelRegistry: {
          text: [
            {
              id: "text-real-configured-agent",
              modelName: "Real Configured Text",
              modelId: "real-configured-agent",
              apiKey: "real-configured-secret",
              baseUrl: "https://example.invalid/v1",
              status: "unverified",
            },
          ],
        },
      }),
      autoInstall: false,
    });

    assert.equal(controller.state.selectedModel, null);
    await controller.modelConfigReady;
    assert.equal(controller.state.selectedModel.model, "real-configured-agent");
    assert.notEqual(controller.state.selectedModel.modelId, "fixture");
  } finally {
    globalThis.window = previousWindow;
  }
});
