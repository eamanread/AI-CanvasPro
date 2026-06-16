import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConfiguredImageGenerationModelCatalog,
  getConfiguredImageGenerationModelDisplayName,
  REGISTRY_IMAGE_PROVIDER,
} from "./imageGenerationModelCatalog.js";

test("buildConfiguredImageGenerationModelCatalog only includes configured API image models", () => {
  const catalog = buildConfiguredImageGenerationModelCatalog([
    {
      id: "default-nano",
      modelName: "NanoBanana-2",
      modelId: "",
      apiKey: "",
      baseUrl: "",
      status: "unconfigured",
    },
    {
      id: "ready-image",
      modelName: "Configured Image",
      modelId: "configured-image-model",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
      status: "available",
    },
    {
      id: "deleted-image",
      modelName: "Deleted Image",
      modelId: "deleted-image-model",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
      status: "deleted",
    },
  ]);

  assert.deepEqual(Object.keys(catalog), [REGISTRY_IMAGE_PROVIDER]);
  assert.deepEqual(
    catalog[REGISTRY_IMAGE_PROVIDER].models.map((model) => model.id),
    ["ready-image"]
  );
  assert.equal(catalog[REGISTRY_IMAGE_PROVIDER].models[0].name, "Configured Image");
});

test("buildConfiguredImageGenerationModelCatalog marks API image models as a flat repaint menu", () => {
  const catalog = buildConfiguredImageGenerationModelCatalog([
    {
      id: "nano",
      modelName: "Nano-Banana-2",
      modelId: "nano-banana-2",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
    },
    {
      id: "gpt",
      modelName: "Gpt-Image-2",
      modelId: "gpt-image-2",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
    },
  ]);

  assert.equal(catalog[REGISTRY_IMAGE_PROVIDER].flatMenu, true);
  assert.deepEqual(
    catalog[REGISTRY_IMAGE_PROVIDER].models.map((model) => model.name),
    ["Nano-Banana-2", "Gpt-Image-2"]
  );
});

test("getConfiguredImageGenerationModelDisplayName resolves API registry ids to display names", () => {
  const catalog = buildConfiguredImageGenerationModelCatalog([
    {
      id: "mdl_image_default_nano_banana_2",
      modelName: "Nano-Banana-2",
      modelId: "nano-banana-2",
      apiKey: "secret",
      baseUrl: "https://api.example.com/v1/images/generations",
    },
  ]);

  assert.equal(
    getConfiguredImageGenerationModelDisplayName("mdl_image_default_nano_banana_2", catalog),
    "Nano-Banana-2"
  );
  assert.equal(getConfiguredImageGenerationModelDisplayName("unknown", catalog), "unknown");
});
