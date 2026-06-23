import test from "node:test";
import assert from "node:assert/strict";

import {
  applyExpandResolvedUiState,
  buildExpandRegistryPayload,
} from "./ImageExpandController.registry.js";

class FakeClassList {
  constructor() {
    this.items = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.items.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }

  toggle(name, enabled) {
    enabled ? this.add(name) : this.remove(name);
  }

  contains(name) {
    return this.items.has(name);
  }
}

class FakeElement {
  constructor() {
    this.dataset = {};
    this.style = { display: "" };
    this.classList = new FakeClassList();
    this.disabled = false;
    this.textContent = "";
    this.title = "";
    this.attributes = {};
    this.matches = new Map();
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelectorAll(selector) {
    return this.matches.get(selector) || [];
  }
}

test("buildExpandRegistryPayload uses source node registry selection", () => {
  const payload = buildExpandRegistryPayload({
    sourceNode: {
      aspectRatio: "16:9",
      imageSize: "2K",
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
    expandedImageUrl: "http://127.0.0.1/expanded.png",
    ratioStr: "16:9",
  });

  assert.equal(payload.operation, "expand");
  assert.equal(payload.inputUrls[0], "http://127.0.0.1/expanded.png");
  assert.equal(payload.aspectRatio, "16:9");
  assert.equal(payload.selectedModelId, "img-model-1");
  assert.equal(payload.apiKey, "k-registry");
});

test("applyExpandResolvedUiState labels expand model controls from resolved runtime", () => {
  const root = new FakeElement();
  const label = new FakeElement();
  const trigger = new FakeElement();
  const menu = new FakeElement();

  root.matches.set(".img-model-label,.fa-model-label,.tool-model-label,.model-text", [label]);
  root.matches.set(".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle", [
    trigger,
  ]);
  root.matches.set(
    ".img-model-menu,.fa-model-menu,.grsai-submenu,.apimart-submenu,.ppio-submenu,.runninghub-submenu,.runninghubwf-submenu,.model-menu",
    [menu]
  );

  const changed = applyExpandResolvedUiState(
    { toolbarEl: root },
    { imageSize: "2K" },
    {
      source: "registry",
      state: "ready",
      provider: "registry-openai",
      model: "seedream-4-0",
      displayLabel: "Seedream 4",
      selectedModelId: "img-model-1",
    }
  );

  assert.equal(changed, true);
  assert.equal(label.textContent, "Seedream 4");
  assert.equal(root.dataset.selectedModelId, "img-model-1");
});
