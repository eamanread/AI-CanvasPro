import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearApiConfig,
  fetchApiConfigFromServer,
} from "../api/configApi.js";
import {
  resolveImageToolRuntimeModel,
  resolveTextToolRuntimeModel,
} from "./toolModelResolutionService.js";

const originalFetch = globalThis.fetch;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildConfig(overrides = {}) {
  return {
    providers: {
      grsai: {
        apiUrl: "https://grsai.example.com",
        apiKey: "grs-key",
      },
      runninghub: {
        apiUrl: "https://www.runninghub.cn",
        apiKey: "rh-workflow-key",
        modelApiKey: "rh-model-key",
      },
      ppio: {
        apiUrl: "https://api.ppio.com",
        apiKey: "ppio-key",
      },
      apimart: {
        apiUrl: "https://api.apimart.ai",
        apiKey: "apimart-key",
      },
    },
    modelRegistry: {
      text: [
        {
          id: "mdl_text_registry_1",
          nodeType: "text",
          modelName: "Registry Text",
          modelId: "gemini-3.1-pro",
          apiKey: "sk-text-registry",
          baseUrl: "https://registry.example.com/v1/chat/completions",
          adapterType: "openai_compatible",
          status: "available",
        },
      ],
      image: [
        {
          id: "mdl_image_registry_1",
          nodeType: "image",
          modelName: "Registry Banana",
          modelId: "nano-banana-pro-vt",
          apiKey: "sk-image-registry",
          baseUrl: "https://registry.example.com/v1/draw/nano-banana",
          adapterType: "openai_compatible",
          status: "available",
        },
      ],
      video: [],
      audio: [],
      other: [],
    },
    ...overrides,
  };
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiConfig();
});

test("toolModelResolutionService: image tool 优先解析 selectedModelId 对应的 registry 模型", async () => {
  await withConfig(buildConfig(), async () => {
    const resolved = resolveImageToolRuntimeModel({
      selectedModelId: "mdl_image_registry_1",
      selectedModelNameSnapshot: "Old Snapshot",
      provider: "runninghub",
      model: "runninghub-model/seedream-v4.5",
    });

    assert.equal(resolved.source, "registry");
    assert.equal(resolved.state, "ready");
    assert.equal(resolved.provider, "registry-openai");
    assert.equal(resolved.model, "nano-banana-pro-vt");
    assert.equal(resolved.apiKey, "sk-image-registry");
    assert.equal(
      resolved.baseUrl,
      "https://registry.example.com/v1/draw/nano-banana"
    );
    assert.equal(resolved.selectedModelId, "mdl_image_registry_1");
    assert.equal(resolved.displayLabel, "Registry Banana");
  });
});

test("toolModelResolutionService: image tool 选中的 registry 模型不存在时返回 deleted 状态", async () => {
  await withConfig(buildConfig(), async () => {
    const resolved = resolveImageToolRuntimeModel({
      selectedModelId: "mdl_image_missing",
      selectedModelNameSnapshot: "Deleted Registry Model",
      model: "runninghub-model/seedream-v4.5",
      provider: "runninghub",
    });

    assert.equal(resolved.source, "registry");
    assert.equal(resolved.state, "deleted");
    assert.equal(resolved.provider, "registry-openai");
    assert.equal(resolved.model, "runninghub-model/seedream-v4.5");
    assert.equal(resolved.displayLabel, "Deleted Registry Model");
  });
});

test("toolModelResolutionService: legacy runninghub-model 使用 modelApiKey", async () => {
  await withConfig(buildConfig(), async () => {
    const resolved = resolveImageToolRuntimeModel({
      model: "runninghub-model/seedream-v4.5",
    });

    assert.equal(resolved.source, "legacy");
    assert.equal(resolved.state, "ready");
    assert.equal(resolved.provider, "runninghub");
    assert.equal(resolved.model, "runninghub-model/seedream-v4.5");
    assert.equal(resolved.apiKey, "rh-model-key");
    assert.equal(resolved.baseUrl, "https://www.runninghub.cn");
  });
});

test("toolModelResolutionService: legacy runninghubwf 继续使用 workflow apiKey", async () => {
  await withConfig(buildConfig(), async () => {
    const resolved = resolveImageToolRuntimeModel({
      provider: "runninghubwf",
      model: "runninghub/2041177685895946242",
    });

    assert.equal(resolved.source, "legacy");
    assert.equal(resolved.state, "ready");
    assert.equal(resolved.provider, "runninghubwf");
    assert.equal(resolved.apiKey, "rh-workflow-key");
    assert.equal(resolved.baseUrl, "https://www.runninghub.cn");
  });
});

test("toolModelResolutionService: text tool 也优先解析 registry 模型", async () => {
  await withConfig(buildConfig(), async () => {
    const resolved = resolveTextToolRuntimeModel({
      selectedModelId: "mdl_text_registry_1",
      provider: "grsai",
      model: "legacy-text-model",
    });

    assert.equal(resolved.source, "registry");
    assert.equal(resolved.state, "ready");
    assert.equal(resolved.provider, "registry-openai");
    assert.equal(resolved.model, "gemini-3.1-pro");
    assert.equal(resolved.apiKey, "sk-text-registry");
    assert.equal(
      resolved.baseUrl,
      "https://registry.example.com/v1/chat/completions"
    );
    assert.equal(resolved.displayLabel, "Registry Text");
  });
});
