import test from "node:test";
import assert from "node:assert/strict";
import { mapAssistantNodeParameters } from "./assistantCanvasParameterMapper.js";

function fakeModelRegistry(models = {}) {
  return {
    getModelsByNodeType(nodeType) {
      if (nodeType === "ai-image" || nodeType === "image") return models.image || [];
      if (nodeType === "ai-text" || nodeType === "text") return models.text || [];
      if (nodeType === "ai-video" || nodeType === "video") return models.video || [];
      return [];
    },
    listModels() {
      return [models.image || [], models.text || [], models.video || []].flat();
    },
  };
}

test("mapper maps image parameters and preserves existing defaults", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-image",
    existingData: { imageSize: "1024x1024", batchSize: 1 },
    action: { prompt: "cat", modelId: "seedream", provider: "apimart", aspectRatio: "16:9", quality: "high", batchSize: 3 },
    modelRegistry: fakeModelRegistry({ image: [{ id: "seedream", configured: true, provider: "apimart" }] }),
  });
  assert.equal(result.patch.prompt, "cat");
  assert.equal(result.patch.model, "seedream");
  assert.equal(result.patch.modelId, "seedream");
  assert.equal(result.patch.imageSize, "1024x1024");
  assert.equal(result.patch.batchSize, 3);
});

test("mapper rejects unknown advanced options", () => {
  const result = mapAssistantNodeParameters({ nodeType: "ai-video", action: { advancedOptions: { duration: 5, fps: 24, inventedFlag: true } } });
  assert.equal(result.patch.duration, 5);
  assert.equal(result.patch.fps, 24);
  assert.equal("inventedFlag" in result.patch, false);
  assert.deepEqual(result.rejectedAdvancedOptions, ["inventedFlag"]);
});

test("mapper maps text parameters without writing unknown direct fields", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-text",
    action: { prompt: "text", modelName: "qwen", foo: "bar" },
    modelRegistry: fakeModelRegistry({ text: [{ id: "qwen", displayName: "qwen", configured: true }] }),
  });
  assert.equal(result.patch.prompt, "text");
  assert.equal(result.patch.modelId, "qwen");
  assert.equal("foo" in result.patch, false);
});

test("assistantCanvasParameterMapper: rejects planned image fields seed and negativePrompt", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-image",
    action: { prompt: "cat", seed: 123, negativePrompt: "rain" },
  });

  assert.equal(result.patch.prompt, "cat");
  assert.equal(result.patch.seed, undefined);
  assert.equal(result.patch.negativePrompt, undefined);
  assert.match(result.warnings.join("\n"), /seed.*planned|negativePrompt.*planned/);
});

test("assistantCanvasParameterMapper: rejects planned text sampling controls", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-text",
    action: { prompt: "write", advancedOptions: { temperature: 0.7, maxTokens: 1200 } },
  });

  assert.equal(result.patch.prompt, "write");
  assert.equal(result.patch.temperature, undefined);
  assert.equal(result.patch.maxTokens, undefined);
  assert.match(result.warnings.join("\n"), /temperature.*planned|maxTokens.*planned/);
});

test("assistantCanvasParameterMapper: rejects model id from the wrong node type", () => {
  const result = mapAssistantNodeParameters({
    nodeType: "ai-image",
    action: { modelId: "text-1" },
    modelRegistry: fakeModelRegistry({
      text: [{ id: "text-1", configured: true }],
      image: [{ id: "img-1", configured: true }],
    }),
  });

  assert.equal(result.patch.modelId, undefined);
  assert.match(result.warnings.join("\n"), /model.*ai-image|not usable/i);
});
