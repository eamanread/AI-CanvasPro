import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultRegistry,
  isModelNameUnique,
  normalizeRegistry,
} from "./modelRegistryService.js";

test("modelRegistryService: 缺失 registry 时自动注入四类默认模型", () => {
  const registry = createDefaultRegistry();

  assert.equal(registry.text[0].modelName, "gemini-3.1");
  assert.equal(registry.image[0].modelName, "NanoBanana-2");
  assert.equal(registry.video[0].modelName, "seedance-2.0");
  assert.equal(registry.audio[0].modelName, "minimax");
  assert.deepEqual(registry.other, []);
});

test("modelRegistryService: 显式空数组会保留，缺失节点类型才注入默认值", () => {
  const registry = normalizeRegistry({
    text: [],
  });

  assert.deepEqual(registry.text, []);
  assert.equal(registry.image[0].modelName, "NanoBanana-2");
  assert.equal(registry.video[0].modelName, "seedance-2.0");
  assert.equal(registry.audio[0].modelName, "minimax");
});

test("modelRegistryService: 同节点类型重名会自动去重并保持配置状态规范化", () => {
  const registry = normalizeRegistry({
    text: [
      {
        modelName: "demo-model",
        modelId: "m1",
        apiKey: "k1",
        baseUrl: "https://example.com/v1/chat/completions",
        status: "available",
      },
      {
        modelName: "demo-model",
        modelID: "m2",
        apiKey: "k2",
        baseUrl: "https://example.com/v1/chat/completions",
      },
      {
        modelName: "partial-model",
        modelId: "m3",
      },
    ],
    image: [],
    video: [],
    audio: [],
    other: [],
  });

  assert.equal(registry.text[0].modelName, "demo-model");
  assert.equal(registry.text[0].status, "available");
  assert.equal(registry.text[1].modelName, "demo-model (2)");
  assert.equal(registry.text[1].modelId, "m2");
  assert.equal(registry.text[1].status, "unverified");
  assert.equal(registry.text[2].status, "unconfigured");

  assert.equal(isModelNameUnique("text", "another-model", registry), true);
  assert.equal(isModelNameUnique("text", "demo-model", registry), false);
  assert.equal(
    isModelNameUnique("text", "demo-model", registry, registry.text[0].id),
    true
  );
});
