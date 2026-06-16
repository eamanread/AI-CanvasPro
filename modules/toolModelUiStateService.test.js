import test from "node:test";
import assert from "node:assert/strict";

import {
  applyToolModelUiState,
  createToolModelUiState,
} from "./toolModelUiStateService.js";

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

  contains(name) {
    return this.items.has(name);
  }
}

class FakeElement {
  constructor(selector = "") {
    this.selector = selector;
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

function createFakeToolRoot() {
  const root = new FakeElement("root");
  const label = new FakeElement(".img-model-label");
  const trigger = new FakeElement(".img-model-btn-trigger");
  const menu = new FakeElement(".img-model-menu");
  const legacySubmenu = new FakeElement(".runninghub-submenu");
  const nanoPanel = new FakeElement(".fa-nb-mode-wrap");

  root.matches.set(".img-model-label,.fa-model-label,.tool-model-label,.model-text", [label]);
  root.matches.set(".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle", [
    trigger,
  ]);
  root.matches.set(
    ".img-model-menu,.fa-model-menu,.grsai-submenu,.apimart-submenu,.ppio-submenu,.runninghub-submenu,.runninghubwf-submenu,.model-menu",
    [menu, legacySubmenu]
  );
  root.matches.set(".fa-nb-mode-wrap,.nb-mode-wrap,[data-capability-panel=\"nano-banana-mode\"]", [
    nanoPanel,
  ]);

  return {
    root,
    label,
    trigger,
    menu,
    legacySubmenu,
    nanoPanel,
  };
}

test("toolModelUiStateService: registry model locks legacy model menus and labels with resolved metadata", () => {
  const uiState = createToolModelUiState({
    source: "registry",
    state: "ready",
    provider: "registry-openai",
    model: "nano-banana-2",
    displayLabel: "Configured Banana",
    selectedModelId: "mdl_image_banana",
    modelRecord: {
      id: "mdl_image_banana",
      modelName: "Configured Banana",
      modelId: "nano-banana-2",
    },
  });

  assert.equal(uiState.isRegistryBacked, true);
  assert.equal(uiState.locksModelSelection, true);
  assert.equal(uiState.capabilities.nanoBananaModePanel, true);
  assert.equal(uiState.capabilities.imageSizeControl, true);

  const fake = createFakeToolRoot();
  const changed = applyToolModelUiState(fake.root, uiState);

  assert.equal(changed, true);
  assert.equal(fake.root.dataset.toolModelSource, "registry");
  assert.equal(fake.root.dataset.toolModelState, "ready");
  assert.equal(fake.root.classList.contains("is-registry-model-locked"), true);
  assert.equal(fake.label.textContent, "Configured Banana");
  assert.equal(fake.trigger.disabled, true);
  assert.equal(fake.trigger.attributes["aria-disabled"], "true");
  assert.equal(fake.menu.style.display, "none");
  assert.equal(fake.legacySubmenu.style.display, "none");
  assert.equal(fake.nanoPanel.style.display, "");
});

test("toolModelUiStateService: non-nano registry image model hides nano-only tool capability panel", () => {
  const uiState = createToolModelUiState({
    source: "registry",
    state: "ready",
    provider: "registry-openai",
    model: "seedream-v5-lite",
    displayLabel: "Seedream Registry",
    selectedModelId: "mdl_seedream",
    modelRecord: {
      id: "mdl_seedream",
      modelName: "Seedream Registry",
      modelId: "seedream-v5-lite",
    },
  });

  const fake = createFakeToolRoot();
  applyToolModelUiState(fake.root, uiState);

  assert.equal(uiState.capabilities.nanoBananaModePanel, false);
  assert.equal(fake.nanoPanel.style.display, "none");
});

test("toolModelUiStateService: legacy model leaves model selection interactive", () => {
  const uiState = createToolModelUiState({
    source: "legacy",
    state: "ready",
    provider: "runninghub",
    model: "runninghub-model/seedream-v4.5",
    displayLabel: "Legacy Seedream",
  });

  const fake = createFakeToolRoot();
  applyToolModelUiState(fake.root, uiState);

  assert.equal(uiState.isRegistryBacked, false);
  assert.equal(uiState.locksModelSelection, false);
  assert.equal(fake.root.classList.contains("is-registry-model-locked"), false);
  assert.equal(fake.trigger.disabled, false);
  assert.equal(fake.menu.style.display, "");
});
