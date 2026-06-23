import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearApiConfig,
  fetchApiConfigFromServer,
} from "../../api/configApi.js";
import { createAIGenTextNodeTaskOrchestrationModule } from "./taskOrchestrationModule.js";
import { REGISTRY_TEXT_PROVIDER } from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalNodeCtor = globalThis.Node;

if (!globalThis.window) {
  globalThis.window = {};
}

if (typeof globalThis.window.showToast !== "function") {
  globalThis.window.showToast = () => {};
}

if (!globalThis.Node) {
  globalThis.Node = {
    TEXT_NODE: 3,
    ELEMENT_NODE: 1,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiConfig();
  if (typeof originalWindow === "undefined") {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
  if (typeof originalNodeCtor === "undefined") {
    delete globalThis.Node;
  } else {
    globalThis.Node = originalNodeCtor;
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function withConfig(config, fn) {
  globalThis.fetch = async (input) => {
    const url = String(input || "");
    if (url === "/api/config" || url.endsWith("/api/config")) {
      return jsonResponse(config);
    }
    throw new Error(`unexpected fetch url: ${url}`);
  };

  await fetchApiConfigFromServer();
  return fn();
}

function createStore(state, incomingEdges = []) {
  return {
    getState() {
      return state;
    },
    getIncomingEdges(nodeId) {
      return incomingEdges.filter((edge) => edge.targetId === nodeId);
    },
    updateNodeData(nodeId, patch) {
      const current = state.nodes?.[nodeId] || {};
      state.nodes[nodeId] = {
        ...current,
        ...patch,
      };
    },
  };
}

function createPromptEl(text = "hello world") {
  if (!globalThis.Node) {
    globalThis.Node = {
      TEXT_NODE: 3,
      ELEMENT_NODE: 1,
    };
  }
  const TEXT_NODE = globalThis.Node?.TEXT_NODE ?? 3;
  return {
    childNodes: [
      {
        nodeType: TEXT_NODE,
        textContent: text,
      },
    ],
  };
}

function createPromptElWithPreset({ title, text }) {
  if (!globalThis.Node) {
    globalThis.Node = {
      TEXT_NODE: 3,
      ELEMENT_NODE: 1,
    };
  }
  const TEXT_NODE = globalThis.Node?.TEXT_NODE ?? 3;
  const ELEMENT_NODE = globalThis.Node?.ELEMENT_NODE ?? 1;

  const makeTextNode = (value) => ({
    nodeType: TEXT_NODE,
    textContent: value,
    cloneNode() {
      return makeTextNode(value);
    },
  });

  const makePresetPill = () => ({
    nodeType: ELEMENT_NODE,
    tagName: "SPAN",
    textContent: title,
    parentNode: null,
    classList: {
      contains(className) {
        return className === "prompt-preset-pill";
      },
    },
    dataset: {
      promptPresetTitle: title,
    },
    getAttribute(name) {
      return name === "data-prompt-preset-title" ? title : null;
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      this.parentNode.childNodes = this.parentNode.childNodes.filter((child) => child !== this);
      this.parentNode = null;
    },
    cloneNode() {
      return makePresetPill();
    },
    childNodes: [makeTextNode(title)],
  });

  const promptEl = {
    childNodes: [],
    get textContent() {
      return this.childNodes.map((child) => child.textContent || "").join("");
    },
    get innerHTML() {
      return this.textContent;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (selector !== ".prompt-preset-pill") {
        return [];
      }
      return this.childNodes.filter((child) => child.classList?.contains?.("prompt-preset-pill"));
    },
    cloneNode(deep = false) {
      const clone = createPromptElWithPreset({ title, text });
      if (!deep) {
        clone.childNodes = [];
      }
      return clone;
    },
  };

  const pill = makePresetPill();
  pill.parentNode = promptEl;
  const textNode = makeTextNode(` ${text}`);
  textNode.parentNode = promptEl;
  promptEl.childNodes = [pill, textNode];
  return promptEl;
}

function createTaskModuleContext({
  targetId,
  nodeData,
  nodes = {},
  incomingEdges = [],
  promptText = "hello world",
  promptEl = null,
}) {
  const state = {
    nodes: {
      ...nodes,
      [targetId]: {
        ...nodeData,
      },
    },
  };

  const store = createStore(state, incomingEdges);
  const moduleProto = createAIGenTextNodeTaskOrchestrationModule({
    store,
    api: {},
    ensureThumbDecoded: () => {},
    revealRefThumbMedia: () => {},
    commit: () => {},
    startLoading: () => {},
    stopLoading: () => {},
    bindRefThumbHoverPreview: () => {},
    getPromptPresets: () => [],
    getCustomTextModels: () => [],
    saveCustomTextModels: () => {},
  });

  const context = Object.assign(Object.create(moduleProto), {
    nodeId: targetId,
    _data: state.nodes[targetId],
    promptEl: promptEl || createPromptEl(promptText),
    previewEl: null,
    btnEl: null,
    outputEl: null,
    _placeholderEl: null,
  });

  return {
    state,
    store,
    proto: moduleProto,
    ctx: context,
  };
}

test("aigenText task orchestration: selectedModelId 可解析时改走 registry 模型", async () => {
  await withConfig(
    {
      modelRegistry: {
        text: [
          {
            id: "mdl_text_test_1",
            nodeType: "text",
            modelName: "gemini-3.1",
            modelId: "gemini-3.1",
            apiKey: "sk-test",
            baseUrl: "https://example.com/v1/chat/completions",
            adapterType: "openai_compatible",
            status: "available",
          },
        ],
      },
    },
    async () => {
      const targetId = "node-ai-text-ready";
      const { proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_text_test_1",
          selectedModelNameSnapshot: "gemini-3.1",
          modelDeleted: false,
        },
      });

      const payload = await proto._buildPayload.call(ctx);

      assert.equal(payload.provider, REGISTRY_TEXT_PROVIDER);
      assert.equal(payload.model, "gemini-3.1");
      assert.equal(payload.apiKey, "sk-test");
      assert.equal(payload.apiUrl, "https://example.com/v1/chat/completions");
      assert.equal(payload.selectedModelId, "mdl_text_test_1");
      assert.equal(payload.prompt, "hello world");
    }
  );
});

test("aigenText task orchestration: common prompt preset is resolved before legacy payload branch", async () => {
  const targetId = "node-ai-text-common-prompt";
  const { proto, ctx } = createTaskModuleContext({
    targetId,
    promptEl: createPromptElWithPreset({
      title: "短视频标题",
      text: "雪山咖啡馆",
    }),
    nodeData: {
      id: targetId,
      model: "gpt-test",
      provider: "openai",
      promptPresetSelection: {
        title: "短视频标题",
        template: "写一个短视频标题：{用户输入}",
      },
    },
  });

  const payload = await proto._buildPayload.call(ctx);

  assert.equal(payload.prompt, "写一个短视频标题：雪山咖啡馆");
});

test("aigenText task orchestration: runninghub generation shows a visible stop affordance", () => {
  const targetId = "node-ai-text-runninghub-stop";
  const { proto, ctx } = createTaskModuleContext({
    targetId,
    nodeData: {
      id: targetId,
      model: "runninghub-model/rhart-text-g-3-flash-preview-cv/image-to-text",
      provider: "runninghub",
    },
  });

  const btnEl = {
    disabled: false,
    innerHTML: "",
    title: "",
    style: {},
    dataset: {},
    setAttribute(name, value) {
      this.dataset[name] = value;
    },
    removeAttribute(name) {
      delete this.dataset[name];
    },
  };

  ctx.btnEl = btnEl;
  ctx._isGenerating = true;
  ctx._rhAbortController = new AbortController();
  ctx._rhCancelRequested = false;
  ctx._rhCancelInFlight = false;

  proto._updateSubmitButtonState.call(ctx);

  assert.equal(btnEl.disabled, false);
  assert.equal(btnEl.title, "停止生成");
  assert.match(btnEl.innerHTML, /<rect[^>]+width="10"[^>]+height="10"/);
  assert.equal(btnEl.dataset["data-tooltip"], "点击即可停止当前生成");
});

test("aigenText task orchestration: 模型缺失时拦截并标记 deleted", async () => {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  const toasts = [];
  globalThis.window.showToast = (message, level) => {
    toasts.push({ message, level });
  };

  await withConfig(
    {
      modelRegistry: {
        text: [],
      },
    },
    async () => {
      const targetId = "node-ai-text-missing";
      const { state, proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_text_missing",
          selectedModelNameSnapshot: "old-model",
          modelDeleted: false,
        },
      });

      const payload = await proto._buildPayload.call(ctx);

      assert.equal(payload, null);
      assert.equal(state.nodes[targetId].modelDeleted, true);
      assert.equal(
        toasts.some((toast) => toast.message.includes("模型已删除，请重新选择")),
        true
      );
    }
  );
});

test("aigenText task orchestration: unconfigured model is blocked", async () => {
  if (!globalThis.window) {
    globalThis.window = {};
  }
  const toasts = [];
  globalThis.window.showToast = (message, level) => {
    toasts.push({ message, level });
  };

  await withConfig(
    {
      modelRegistry: {
        text: [
          {
            id: "mdl_text_unconfigured",
            nodeType: "text",
            modelName: "Nano Text",
            modelId: "",
            apiKey: "",
            baseUrl: "",
            adapterType: "openai_compatible",
            status: "unconfigured",
          },
        ],
      },
    },
    async () => {
      const targetId = "node-ai-text-unconfigured";
      const { proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_text_unconfigured",
          selectedModelNameSnapshot: "Nano Text",
          modelDeleted: false,
        },
      });

      const payload = await proto._buildPayload.call(ctx);

      assert.equal(payload, null);
      assert.equal(
        toasts.some((toast) => toast.message.includes("该模型未配置")),
        true
      );
    }
  );
});

test("aigenText task orchestration: agent submit starts generation without awaiting completion", () => {
  const targetId = "node-ai-text-agent-submit";
  const { proto, ctx } = createTaskModuleContext({
    targetId,
    nodeData: {
      id: targetId,
      model: "test-model",
      provider: "openai",
    },
  });
  const calls = [];
  ctx._onGenerate = (prompt) => {
    calls.push(prompt);
    return new Promise(() => {});
  };

  const result = proto.submitGenerationFromAgent.call(ctx, "write a flying pig", { nodeType: "ai-text" });

  assert.deepEqual(calls, ["write a flying pig"]);
  assert.equal(result.started, true);
  assert.equal(result.nodeId, targetId);
  assert.equal(result.source, "assistant");
});

test("aigenText task orchestration: agent submit does not cancel an already running node", () => {
  const targetId = "node-ai-text-agent-running";
  const { proto, ctx } = createTaskModuleContext({
    targetId,
    nodeData: {
      id: targetId,
      model: "test-model",
      provider: "openai",
    },
  });
  const calls = [];
  ctx._isGenerating = true;
  ctx._onGenerate = (prompt) => {
    calls.push(prompt);
  };

  const result = proto.submitGenerationFromAgent.call(ctx, "write a flying pig", { nodeType: "ai-text" });

  assert.deepEqual(calls, []);
  assert.equal(result.started, true);
  assert.equal(result.alreadyRunning, true);
});
