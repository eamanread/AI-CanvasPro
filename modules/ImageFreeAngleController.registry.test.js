import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearApiConfig,
  fetchApiConfigFromServer,
} from "../api/configApi.js";
import appStore from "../src/core/stores/appStore.js";
import ImageFreeAngleController, {
  applyResolvedToolUiState,
} from "./ImageFreeAngleController.registry.js";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalStoreMethods = {
  addNode: appStore.addNode,
  getState: appStore.getState,
  getStateRaw: appStore.getStateRaw,
  setSelectedNodes: appStore.setSelectedNodes,
  updateNodeData: appStore.updateNodeData,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function installStore(state) {
  appStore.getState = () => state;
  appStore.getStateRaw = () => state;
  appStore.addNode = (node) => {
    state.nodes[node.id] = node;
  };
  appStore.updateNodeData = (nodeId, patch) => {
    state.nodes[nodeId] = {
      ...(state.nodes[nodeId] || {}),
      ...patch,
    };
  };
  appStore.setSelectedNodes = (ids) => {
    state.selectedNodeIds = Array.isArray(ids) ? ids.slice() : [];
  };
}

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
    if (enabled) {
      this.add(name);
      return;
    }
    this.remove(name);
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

function createFakeFreeAngleRoot() {
  const root = new FakeElement();
  const label = new FakeElement();
  const trigger = new FakeElement();
  const menu = new FakeElement();
  const nanoPanel = new FakeElement();

  root.matches.set(".img-model-label,.fa-model-label,.tool-model-label,.model-text", [label]);
  root.matches.set(".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle", [
    trigger,
  ]);
  root.matches.set(
    ".img-model-menu,.fa-model-menu,.grsai-submenu,.apimart-submenu,.ppio-submenu,.runninghub-submenu,.runninghubwf-submenu,.model-menu",
    [menu]
  );
  root.matches.set(".fa-nb-mode-wrap,.nb-mode-wrap,[data-capability-panel=\"nano-banana-mode\"]", [
    nanoPanel,
  ]);

  return {
    root,
    label,
    trigger,
    menu,
    nanoPanel,
  };
}

test("ImageFreeAngleController registry wrapper: render ui locks legacy model menu for registry-backed tool model", () => {
  const fake = createFakeFreeAngleRoot();

  const changed = applyResolvedToolUiState(
    {
      nodeData: {
        imageSize: "2K",
      },
    },
    {
      imageSize: "2K",
    },
    {
      source: "registry",
      state: "ready",
      provider: "registry-openai",
      model: "nano-banana-pro",
      displayLabel: "Registry Banana Pro",
      selectedModelId: "mdl_registry_banana",
      modelRecord: {
        id: "mdl_registry_banana",
        modelName: "Registry Banana Pro",
        modelId: "nano-banana-pro",
      },
    },
    fake.root
  );

  assert.equal(changed, true);
  assert.equal(fake.root.classList.contains("is-registry-model-locked"), true);
  assert.equal(fake.label.textContent, "Registry Banana Pro");
  assert.equal(fake.trigger.disabled, true);
  assert.equal(fake.trigger.attributes["aria-disabled"], "true");
  assert.equal(fake.menu.style.display, "none");
  assert.equal(fake.nanoPanel.style.display, "");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearApiConfig();

  appStore.addNode = originalStoreMethods.addNode;
  appStore.getState = originalStoreMethods.getState;
  appStore.getStateRaw = originalStoreMethods.getStateRaw;
  appStore.setSelectedNodes = originalStoreMethods.setSelectedNodes;
  appStore.updateNodeData = originalStoreMethods.updateNodeData;

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
});

test("ImageFreeAngleController registry wrapper: registry 模型已删除时直接拦截而不新增结果节点", async () => {
  const state = {
    nodes: {
      "node-image-source": {
        id: "node-image-source",
        type: "ai-image",
        selectedModelId: "mdl_image_missing",
        selectedModelNameSnapshot: "Deleted Registry Model",
        modelDeleted: false,
        provider: "runninghub",
        model: "runninghub-model/seedream-v4.5",
        aspectRatio: "1:1",
        imageSize: "2K",
      },
    },
  };
  installStore(state);

  const toasts = [];
  globalThis.window = {
    showToast(message, level) {
      toasts.push({ message, level });
    },
  };
  globalThis.document = {
    getElementById() {
      return null;
    },
  };
  globalThis.fetch = async (input) => {
    const url = String(input?.url || input || "");
    if (url === "/api/config" || url.endsWith("/api/config")) {
      return jsonResponse({
        providers: {
          runninghub: {
            apiUrl: "https://www.runninghub.cn",
            apiKey: "rh-workflow-key",
            modelApiKey: "rh-model-key",
          },
        },
        modelRegistry: {
          text: [],
          image: [],
          video: [],
          audio: [],
          other: [],
        },
      });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  };

  await fetchApiConfigFromServer();

  const controller = {
    ...ImageFreeAngleController,
    nodeId: "node-image-source",
    state: {
      rotation: 15,
      pitch: 25,
      scale: 0.8,
    },
  };

  await controller._handleGenerate.call(controller);

  assert.deepEqual(Object.keys(state.nodes), ["node-image-source"]);
  assert.equal(
    toasts.some((item) => String(item.message || "").includes("模型已删除")),
    true
  );
});
