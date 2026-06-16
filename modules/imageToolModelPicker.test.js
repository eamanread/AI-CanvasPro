import test from "node:test";
import assert from "node:assert/strict";

import {
  applyImageToolModelSelection,
  buildImageToolModelSelectionPatch,
  renderImageToolModelMenuItems,
} from "./imageToolModelPicker.js";
import { getModelMenuSubtitle } from "./modelMenuDescriptions.js";

test("buildImageToolModelSelectionPatch writes registry image selection fields", () => {
  const patch = buildImageToolModelSelectionPatch({
    id: "img-model-1",
    modelName: "Seedream 4",
    modelId: "seedream-4-0",
  });

  assert.deepEqual(patch, {
    selectedModelId: "img-model-1",
    selectedModelNameSnapshot: "Seedream 4",
    modelDeleted: false,
    model: "seedream-4-0",
    provider: "registry-openai",
  });
});

test("buildImageToolModelSelectionPatch falls back to display name for adapter model", () => {
  const patch = buildImageToolModelSelectionPatch({
    id: "img-model-2",
    modelName: "Custom Image Model",
  });

  assert.equal(patch.model, "Custom Image Model");
});

test("applyImageToolModelSelection updates the source node through store", () => {
  const calls = [];
  const store = {
    updateNodeData(nodeId, patch) {
      calls.push([nodeId, patch]);
    },
  };

  const patch = applyImageToolModelSelection({
    nodeId: "source-1",
    model: {
      id: "img-model-1",
      modelName: "Seedream 4",
      modelId: "seedream-4-0",
    },
    store,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "source-1");
  assert.equal(calls[0][1], patch);
  assert.equal(calls[0][1].selectedModelId, "img-model-1");
  assert.equal(calls[0][1].provider, "registry-openai");
});

test("renderImageToolModelMenuItems returns a flat image model list", () => {
  const items = renderImageToolModelMenuItems(
    [
      {
        id: "img-a",
        modelName: "NanoBanana-2",
        modelId: "nano-banana-2",
        apiKey: "key-a",
        baseUrl: "https://api.example.com/v1/images/generations",
        status: "available",
      },
      {
        id: "img-b",
        modelName: "gpt-image-2",
        modelId: "gpt-image-2",
        apiKey: "key-b",
        baseUrl: "https://api.example.com/v1/images/generations",
        status: "unverified",
      },
    ],
    "img-b"
  );

  assert.deepEqual(items, [
    {
      id: "img-a",
      label: "NanoBanana-2",
      subText: "适合快速出图",
      selected: false,
      disabled: false,
    },
    {
      id: "img-b",
      label: "gpt-image-2",
      subText: "适合高质量细节",
      selected: true,
      disabled: false,
    },
  ]);
});

test("renderImageToolModelMenuItems hides image models that are not configured in API settings", () => {
  const items = renderImageToolModelMenuItems([
    {
      id: "mdl_image_default_nano_banana_2",
      modelName: "NanoBanana-2",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      status: "unconfigured",
    },
    {
      id: "img-ready",
      modelName: "Configured Image API",
      modelId: "configured-image-api",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
      status: "available",
    },
    {
      id: "img-deleted",
      modelName: "Deleted Image API",
      modelId: "deleted-image-api",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
      status: "deleted",
    },
  ]);

  assert.deepEqual(
    items.map((item) => item.label),
    ["Configured Image API"]
  );
});

test("getModelMenuSubtitle prefers explicit model menu description", () => {
  const subtitle = getModelMenuSubtitle(
    {
      modelName: "Custom Model",
      modelId: "custom-model",
      menuDescription: "适合品牌文案润色",
    },
    { nodeType: "text" }
  );

  assert.equal(subtitle, "适合品牌文案润色");
});

test("getModelMenuSubtitle falls back to node type when model is unknown", () => {
  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "Mystery Painter",
        modelId: "mystery-painter",
      },
      { nodeType: "image" }
    ),
    "通用图像生成"
  );

  assert.equal(
    getModelMenuSubtitle(
      {
        modelName: "Mystery Writer",
        modelId: "mystery-writer",
      },
      { nodeType: "text" }
    ),
    "通用文本生成"
  );
});
