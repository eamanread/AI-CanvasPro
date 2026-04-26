import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearApiConfig,
  fetchApiConfigFromServer,
} from "../../api/configApi.js";
import { createAIGenerateNodeTaskOrchestrationModule } from "./taskOrchestrationModule.js";
import {
  finalizeGeneratedImages,
  generateImageWithRegistryModel,
  REGISTRY_IMAGE_PROVIDER,
} from "./modelRegistryRuntime.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNodeCtor = globalThis.Node;

if (!globalThis.window) {
  globalThis.window = {};
}

if (typeof globalThis.window.showToast !== "function") {
  globalThis.window.showToast = () => {};
}

if (!globalThis.document) {
  globalThis.document = {
    getElementById() {
      return null;
    },
  };
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
  if (typeof originalDocument === "undefined") {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
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
  const moduleProto = createAIGenerateNodeTaskOrchestrationModule({
    store,
    getRefKindByNodeType(nodeType) {
      if (nodeType === "source-image" || nodeType === "image" || nodeType === "ai-image") {
        return "image";
      }
      if (nodeType === "source-text") {
        return "text";
      }
      return null;
    },
    getImage: async () => null,
    ensureConfig: async () => {},
    getProviderConfig: () => ({ apiKey: "k-test" }),
    api: {
      generateImage: async () => ({ imageUrl: "/output/test.png" }),
    },
    startLoading: () => {},
    stopLoading: () => {},
  });

  const context = Object.assign(Object.create(moduleProto), {
    nodeId: targetId,
    _data: state.nodes[targetId],
    promptEl: createPromptEl(promptText),
    _isRunninghubWorkflowModel() {
      return false;
    },
  });

  return {
    state,
    store,
    proto: moduleProto,
    ctx: context,
  };
}

test("aigenImage task orchestration: selectedModelId 可解析时改走 registry 模型", async () => {
  await withConfig(
    {
      modelRegistry: {
        image: [
          {
            id: "mdl_image_test_1",
            nodeType: "image",
            modelName: "NanoBanana-2",
            modelId: "nano-banana-pro-vt",
            apiKey: "sk-image",
            baseUrl: "https://grsai.example.com/v1/draw/nano-banana",
            adapterType: "openai_compatible",
            status: "available",
          },
        ],
      },
    },
    async () => {
      const targetId = "node-ai-image-ready";
      const { proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_image_test_1",
          selectedModelNameSnapshot: "NanoBanana-2",
          modelDeleted: false,
          aspectRatio: "1:1",
          imageSize: "2K",
          batchSize: 1,
        },
      });

      const payload = await proto._buildPayload.call(ctx);

      assert.equal(payload.provider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(payload.model, "nano-banana-pro-vt");
      assert.equal(payload.apiKey, "sk-image");
      assert.equal(payload.apiUrl, "https://grsai.example.com/v1/draw/nano-banana");
      assert.equal(payload.selectedModelId, "mdl_image_test_1");
      assert.equal(payload.prompt, "hello world");
    }
  );
});

test("aigenImage task orchestration: registry grsai 任务结果按旧查询协议轮询成功", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  try {
    globalThis.window = {
      ...(originalWindow || {}),
      currentProjectId: "proj-test",
      showToast: () => {},
    };

    globalThis.fetch = async (url, options) => {
      const requestUrl = String(url?.url || url || "");

      if (requestUrl === "/api/config" || requestUrl.endsWith("/api/config")) {
        return jsonResponse({
          modelRegistry: {
            image: [
              {
                id: "mdl_image_expired",
                nodeType: "image",
                modelName: "NanoBanana-2",
                modelId: "nano-banana-2",
                apiKey: "sk-image",
                baseUrl: "https://grsai.example.com/v1/draw/nano-banana",
                adapterType: "openai_compatible",
                status: "available",
              },
            ],
          },
        });
      }

      if (requestUrl === "/api/v2/proxy/image") {
        const payload = JSON.parse(String(options?.body || "{}"));

        if (payload.apiUrl === "https://grsai.example.com/v1/draw/nano-banana") {
          return jsonResponse({
            task_id: "task-123",
            status: "submitted",
          });
        }

        if (payload.apiUrl === "https://grsai.example.com/v1/draw/result") {
          assert.equal(payload.id, "task-123");
          return jsonResponse({
            code: 0,
            data: {
              id: "task-123",
              status: "succeeded",
              results: [
                {
                  url: "https://example.com/output.png",
                },
              ],
            },
            msg: "success",
          });
        }
      }

      if (String(url) === "/api/v2/save_output_from_url") {
        return jsonResponse({
          path: "output/test.png",
          localPath: "output/test.png",
          url: "/output/test.png",
          displayUrl: "/output/test.png",
          thumbUrl: "/output/test.png",
        });
      }

      if (String(url).startsWith("/api/v2/proxy/task?apiUrl=")) {
        throw new Error(`unexpected legacy task proxy: ${String(url)}`);
      }

      throw new Error(`unexpected fetch url: ${String(url)}`);
    };

    const result = await generateImageWithRegistryModel({
      apiUrl: "https://grsai.example.com/v1/draw/nano-banana",
      apiKey: "sk-image",
      model: "nano-banana-2",
      prompt: "single gray sphere, plain gray background",
      inputUrls: [],
      batchSize: 1,
      shutProgress: true,
      aspectRatio: "1:1",
      imageSize: "1K",
    });

    assert.equal(result.imageUrl, "/output/test.png");
    assert.equal(result.localPath, "output/test.png");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("aigenImage task orchestration: registry 图片结果会过滤落盘失败项", () => {
  const images = finalizeGeneratedImages([
    {
      sourceUrl: "https://bad.example.com/1.png",
      imageUrl: "https://bad.example.com/1.png",
      error: "Download failed: HTTP Error 404: Not Found",
    },
    {
      sourceUrl: "https://good.example.com/2.png",
      imageUrl: "/output/good.png",
      thumbUrl: "/output/good_thumb.png",
      localPath: "output/good.png",
    },
  ]);

  assert.equal(images.length, 1);
  assert.equal(images[0].imageUrl, "/output/good.png");
});

test("aigenImage task orchestration: registry 图片结果全部落盘失败时直接抛错", () => {
  assert.throws(
    () =>
      finalizeGeneratedImages([
        {
          sourceUrl: "https://bad.example.com/1.png",
          imageUrl: "https://bad.example.com/1.png",
          error: "Download failed: HTTP Error 404: Not Found",
        },
      ]),
    /Download failed: HTTP Error 404: Not Found/
  );
});

test("aigenImage task orchestration: registry 临时结果图过期时给出明确中文错误", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  try {
    if (!globalThis.Node) {
      globalThis.Node = {
        TEXT_NODE: 3,
        ELEMENT_NODE: 1,
      };
    }

    const toasts = [];
    globalThis.window = {
      ...(originalWindow || {}),
      currentProjectId: "proj-test",
      showToast(message, level) {
        toasts.push({ message, level });
      },
      location: { href: "http://localhost/" },
    };

    globalThis.fetch = async (url, options) => {
      const requestUrl = String(url?.url || url || "");

      if (requestUrl === "/api/config" || requestUrl.endsWith("/api/config")) {
        return jsonResponse({
          modelRegistry: {
            image: [
              {
                id: "mdl_image_expired",
                nodeType: "image",
                modelName: "NanoBanana-2",
                modelId: "nano-banana-2",
                apiKey: "sk-image",
                baseUrl: "https://grsai.example.com/v1/draw/nano-banana",
                adapterType: "openai_compatible",
                status: "available",
              },
            ],
          },
        });
      }

      if (requestUrl === "/api/v2/proxy/image") {
        const payload = JSON.parse(String(options?.body || "{}"));

        if (payload.apiUrl === "https://grsai.example.com/v1/draw/nano-banana") {
          return jsonResponse({
            task_id: "task-expired-123",
            status: "submitted",
          });
        }

        if (payload.apiUrl === "https://grsai.example.com/v1/draw/result") {
          return jsonResponse({
            code: 0,
            data: {
              id: "task-expired-123",
              status: "succeeded",
              results: [
                {
                  url: "https://img.example.com/grsai-expired.png",
                },
              ],
            },
            msg: "success",
          });
        }
      }

      if (requestUrl === "/api/v2/save_output_from_url") {
        return jsonResponse({ error: "Download HTTPError: 404" }, 502);
      }

      if (requestUrl === "https://img.example.com/grsai-expired.png") {
        return new Response("file not found, The resource is valid for 2 hours", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      if (requestUrl.startsWith("/api/v2/proxy/task?apiUrl=")) {
        throw new Error(`unexpected legacy task proxy: ${requestUrl}`);
      }

      throw new Error(`unexpected fetch url: ${requestUrl}`);
    };

    await fetchApiConfigFromServer();

    const targetId = "node-ai-image-expired";
    const { state, proto, ctx } = createTaskModuleContext({
      targetId,
      nodeData: {
        id: targetId,
        selectedModelId: "mdl_image_expired",
        selectedModelNameSnapshot: "NanoBanana-2",
        modelDeleted: false,
        aspectRatio: "1:1",
        imageSize: "2K",
        batchSize: 1,
      },
    });

    await proto._onGenerate.call(ctx);

    assert.equal(state.nodes[targetId].jobStatus, "error");
    assert.equal(state.nodes[targetId].error, "结果图片临时链接已过期，请重新生成");
    assert.equal(
      toasts.some((toast) =>
        String(toast.message || "").includes("结果图片临时链接已过期，请重新生成")
      ),
      true
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("aigenImage task orchestration: 模型缺失时拦截并标记 deleted", async () => {
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
        image: [],
      },
    },
    async () => {
      const targetId = "node-ai-image-missing";
      const { state, proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_image_missing",
          selectedModelNameSnapshot: "old-image-model",
          modelDeleted: false,
          aspectRatio: "1:1",
          imageSize: "2K",
          batchSize: 1,
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

test("aigenImage task orchestration: 模型未配置时拦截并提示", async () => {
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
        image: [
          {
            id: "mdl_image_unconfigured",
            nodeType: "image",
            modelName: "NanoBanana-2",
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
      const targetId = "node-ai-image-unconfigured";
      const { proto, ctx } = createTaskModuleContext({
        targetId,
        nodeData: {
          id: targetId,
          selectedModelId: "mdl_image_unconfigured",
          selectedModelNameSnapshot: "NanoBanana-2",
          modelDeleted: false,
          aspectRatio: "1:1",
          imageSize: "2K",
          batchSize: 1,
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
