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

function createTaskModuleContext({
  targetId,
  nodeData,
  nodes = {},
  incomingEdges = [],
  promptText = "hello world",
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
    promptEl: createPromptEl(promptText),
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

test("aigenText task orchestration: 模型未配置时拦截并提示", async () => {
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
