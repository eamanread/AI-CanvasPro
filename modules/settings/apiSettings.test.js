import assert from "node:assert/strict";
import test from "node:test";

import { prepareRegistryForPersistence } from "./apiSettings.js";

function makeEmptyRegistry() {
  return {
    text: [],
    image: [],
    video: [],
    audio: [],
    other: [],
  };
}

test("apiSettings: 保存时会自动去重同节点类型下的重名模型", () => {
  const previousRegistry = makeEmptyRegistry();
  previousRegistry.text = [
    {
      id: "model-1",
      nodeType: "text",
      modelName: "demo-model",
      modelId: "m1",
      apiKey: "k1",
      baseUrl: "https://example.com/v1/chat/completions",
      status: "available",
      lastTestedAt: "2026-04-26T10:00:00.000Z",
      lastError: "",
      lastTestResult: { ok: true },
      templateHints: {
        modelId: "m1",
        baseUrl: "https://example.com/v1/chat/completions",
      },
    },
  ];

  const draftRegistry = makeEmptyRegistry();
  draftRegistry.text = [
    {
      ...previousRegistry.text[0],
    },
    {
      id: "model-2",
      nodeType: "text",
      modelName: "demo-model",
      modelId: "m2",
      apiKey: "k2",
      baseUrl: "https://example.com/v1/chat/completions",
      status: "unverified",
      lastTestedAt: null,
      lastError: "",
      lastTestResult: null,
      templateHints: {
        modelId: "m2",
        baseUrl: "https://example.com/v1/chat/completions",
      },
    },
  ];

  const result = prepareRegistryForPersistence(draftRegistry, previousRegistry);

  assert.equal(result.errors.length, 0);
  assert.equal(result.registry.text[0].status, "available");
  assert.equal(result.registry.text[1].modelName, "demo-model (2)");
  assert.equal(result.registry.text[1].status, "unverified");
  assert.ok(result.warnings[0].includes("demo-model (2)"));
});

test("apiSettings: 连接参数变化后会清空旧测试状态并回退为 unverified", () => {
  const previousRegistry = makeEmptyRegistry();
  previousRegistry.text = [
    {
      id: "model-1",
      nodeType: "text",
      modelName: "demo-model",
      modelId: "m1",
      apiKey: "k1",
      baseUrl: "https://example.com/v1/chat/completions",
      status: "available",
      lastTestedAt: "2026-04-26T10:00:00.000Z",
      lastError: "",
      lastTestResult: { ok: true, previewText: "OK" },
      templateHints: {
        modelId: "m1",
        baseUrl: "https://example.com/v1/chat/completions",
      },
    },
  ];

  const draftRegistry = makeEmptyRegistry();
  draftRegistry.text = [
    {
      ...previousRegistry.text[0],
      apiKey: "k2",
    },
  ];

  const result = prepareRegistryForPersistence(draftRegistry, previousRegistry);
  const model = result.registry.text[0];

  assert.equal(model.status, "unverified");
  assert.equal(model.lastTestedAt, null);
  assert.equal(model.lastError, "");
  assert.equal(model.lastTestResult, null);
});

test("apiSettings: 缺少 modelName 时会返回错误", () => {
  const draftRegistry = makeEmptyRegistry();
  draftRegistry.image = [
    {
      id: "model-1",
      nodeType: "image",
      modelName: "",
      modelId: "nano-banana-2",
      apiKey: "k1",
      baseUrl: "https://example.com/v1/draw/nano-banana",
    },
  ];

  const result = prepareRegistryForPersistence(draftRegistry, makeEmptyRegistry());
  assert.equal(result.registry.image.length, 0);
  assert.match(result.errors[0], /缺少 modelName/);
});

test("apiSettings: assistant does not expose a separate canvas agent model config entry", async () => {
  const module = await import("./apiSettings.js");
  const configs = module.getSpecialProviderConfigs();
  const byId = Object.fromEntries(configs.map((config) => [config.providerId, config]));

  assert.equal(byId.canvas_agent, undefined);
  assert.equal(byId.pi_canvas_agent, undefined);
});
