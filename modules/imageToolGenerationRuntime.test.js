import test from "node:test";
import assert from "node:assert/strict";

import {
  assertResolvedImageToolModelReady,
  buildStandardImageToolPayload,
  normalizeGeneratedImageOutputFields,
} from "./imageToolGenerationRuntime.js";

test("assertResolvedImageToolModelReady blocks deleted registry models", () => {
  assert.throws(
    () =>
      assertResolvedImageToolModelReady({
        state: "deleted",
        selectedModelNameSnapshot: "Old Model",
      }),
    /Old Model.*deleted/
  );
});

test("assertResolvedImageToolModelReady blocks unconfigured registry models", () => {
  assert.throws(
    () =>
      assertResolvedImageToolModelReady({
        state: "unconfigured",
        displayLabel: "Seedream 4",
      }),
    /Seedream 4.*not configured/
  );
});

test("buildStandardImageToolPayload preserves source-node model and generation fields", () => {
  const payload = buildStandardImageToolPayload({
    operation: "expand",
    sourceNode: {
      aspectRatio: "16:9",
      imageSize: "2K",
      batchSize: 2,
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      state: "ready",
      provider: "registry-openai",
      model: "seedream-4-0",
      apiKey: "k-registry",
      baseUrl: "https://image.example.com/v1/images/generations",
      adapterType: "openai-compatible",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    prompt: "extend the image",
    inputUrls: ["http://127.0.0.1/a.png"],
    extra: { cameraAngle: "front" },
  });

  assert.deepEqual(payload, {
    operation: "expand",
    prompt: "extend the image",
    inputUrls: ["http://127.0.0.1/a.png"],
    aspectRatio: "16:9",
    imageSize: "2K",
    batchSize: 2,
    provider: "registry-openai",
    model: "seedream-4-0",
    apiUrl: "https://image.example.com/v1/images/generations",
    apiKey: "k-registry",
    adapterType: "openai-compatible",
    selectedModelId: "img-model-1",
    selectedModelNameSnapshot: "Seedream 4",
    cameraAngle: "front",
  });
});

test("normalizeGeneratedImageOutputFields keeps registry identity and duration separate", () => {
  const output = normalizeGeneratedImageOutputFields({
    result: {
      sourceUrl: "https://cdn/result.png",
      thumbUrl: "https://cdn/thumb.png",
      imageUrl: "https://cdn/result.png",
      localPath: "outputs/result.png",
      originalLocalPath: "outputs/original.png",
      displayLocalPath: "outputs/display.png",
      thumbLocalPath: "outputs/thumb.png",
      fileName: "result.png",
    },
    sourceNode: {
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    resolved: {
      provider: "registry-openai",
      model: "seedream-4-0",
      selectedModelId: "img-model-1",
      selectedModelNameSnapshot: "Seedream 4",
    },
    generationStartTime: 1000,
    now: 3500,
  });

  assert.equal(output.provider, "registry-openai");
  assert.equal(output.model, "seedream-4-0");
  assert.equal(output.selectedModelId, "img-model-1");
  assert.equal(output.generationDuration, 2500);
  assert.equal(output.durationSec, undefined);
  assert.equal(output.jobStatus, "success");
  assert.equal(output.asyncTaskStatus, "success");
});
