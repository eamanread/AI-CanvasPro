import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  filterSelectableTextModels,
  filterConfiguredApiModels,
} from "./modules/modelRegistryFilters.js";
import {
  buildTextModelSelectionPatch,
  buildRegistryTextPayload,
  applyTextModelSelectorUi,
  resolveTextNodeModelState,
} from "./components/aigenText/modelRegistryRuntime.js";
import {
  applyImageModelSelectorUi,
  REGISTRY_IMAGE_PROVIDER,
  resolveImageNodeModelState,
} from "./components/aigenImage/modelRegistryRuntime.js";
import {
  clearApiConfig,
  fetchApiConfigFromServer,
} from "./api/configApi.js";
import { createDefaultStoryboardScriptState } from "./src/core/storyboardScriptFactory.js";
import {
  getPromptAssetInputRefsFromNode,
  resolvePromptTextWithTextRefs,
} from "./modules/nodePromptShared.js";
import {
  _resetAssetMentionRegistryForTests,
  setAssetMentionAssets,
} from "./modules/assetMentionRegistry.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");
const TEXT_MODEL_DELETED_MESSAGE = "\u6a21\u578b\u5df2\u5220\u9664\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9";
const TEXT_MODEL_UNCONFIGURED_MESSAGE = "\u8be5\u6a21\u578b\u672a\u914d\u7f6e";

function createJsonResponse(data) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) =>
        String(name || "").toLowerCase() === "content-type"
          ? "application/json"
          : "",
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

async function withTextModelRegistry(models, callback) {
  return withModelRegistry({ text: models }, callback);
}

async function withImageModelRegistry(models, callback) {
  return withModelRegistry({ image: models }, callback);
}

async function withModelRegistry({ text = [], image = [] } = {}, callback) {
  const originalFetch = globalThis.fetch;
  clearApiConfig();
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "/api/config");
    return createJsonResponse({
      modelRegistry: {
        text,
        image,
        video: [],
        audio: [],
        other: [],
      },
    });
  };

  try {
    await fetchApiConfigFromServer();
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    clearApiConfig();
  }
}

function createClassList(initialClassName = "") {
  const classes = new Set(String(initialClassName).split(/\s+/).filter(Boolean));
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toggle: (name, force) => {
      if (force === true) {
        classes.add(name);
        return true;
      }
      if (force === false) {
        classes.delete(name);
        return false;
      }
      if (classes.has(name)) {
        classes.delete(name);
        return false;
      }
      classes.add(name);
      return true;
    },
    toString: () => [...classes].join(" "),
  };
}

function createMenuItem({ className, modelId }) {
  const item = {
    dataset: { modelId },
    classList: createClassList(className),
  };
  item.closest = (selector) => (selector === "[data-model-id]" ? item : null);
  return item;
}

function createStoryboardModelSelectorDom() {
  let labelText = "";
  const legacyIcon = {
    tagName: "IMG",
    outerHTML: '<img alt="grsai" src="grsai.svg">',
  };
  const trigger = {
    title: "",
    style: {},
    disabled: false,
    firstElementChild: legacyIcon,
    innerHTML:
      '<img alt="grsai" src="grsai.svg"><span class="img-model-label"></span>',
    classList: createClassList("img-model-btn-trigger"),
  };
  const renderTriggerHtml = () => {
    trigger.innerHTML = `${trigger.firstElementChild?.outerHTML || ""}<span class="img-model-label">${labelText}</span>`;
  };
  legacyIcon.replaceWith = (nextIcon) => {
    trigger.firstElementChild = nextIcon;
    renderTriggerHtml();
  };
  const label = {
    classList: createClassList("img-model-label"),
  };
  Object.defineProperty(label, "textContent", {
    get() {
      return labelText;
    },
    set(value) {
      labelText = String(value || "");
      renderTriggerHtml();
    },
  });
  const menu = {
    dataset: {},
    classList: createClassList("img-model-menu"),
    __items: [],
    __listeners: {},
    addEventListener(type, handler) {
      this.__listeners[type] = handler;
    },
    dispatchClick(item) {
      this.__listeners.click?.({ target: item });
    },
    findItemByModelId(modelId) {
      return this.__items.find((item) => item.dataset.modelId === modelId) || null;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (selector === ".floating-menu-item.active") {
        return this.__items.filter((item) => item.classList.contains("active"));
      }
      if (selector === ".floating-menu-item") {
        return this.__items.slice();
      }
      return [];
    },
  };
  Object.defineProperty(menu, "innerHTML", {
    get() {
      return this.__html || "";
    },
    set(value) {
      this.__html = String(value || "");
      this.__items = [];
      const itemRegex =
        /class="([^"]*\bfloating-menu-item\b[^"]*)"[^>]*data-model-id="([^"]*)"/g;
      let match;
      while ((match = itemRegex.exec(this.__html))) {
        this.__items.push(createMenuItem({ className: match[1], modelId: match[2] }));
      }
    },
  });
  const wrap = {
    trigger,
    label,
    menu,
    classList: createClassList("img-model-wrap"),
    querySelector(selector) {
      if (selector === ".img-model-btn-trigger") return trigger;
      if (selector === ".img-model-label") return label;
      if (selector === ".img-model-menu") return menu;
      return null;
    },
  };
  return wrap;
}

function createStoryboardRegistryPayloadHarness({
  applyTextModelSelectorUiImpl = () => {},
  applyImageModelSelectorUiImpl = () => {},
} = {}) {
  const source = read("components/StoryboardScriptNode.js");
  const start = source.indexOf("const STORYBOARD_TEXT_MODEL_DELETED_MESSAGE");
  const end = source.indexOf(
    "function applyStoryboardScriptStoredTextRefsToSubmitInput"
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const adapterSource = source.slice(start, end);
  const nodes = {};
  const updates = [];
  const appStore = {
    getState: () => ({ nodes }),
    updateNodeData: (nodeId, patch) => {
      updates.push({ nodeId, patch });
      nodes[nodeId] = {
        ...(nodes[nodeId] || {}),
        ...patch,
      };
    },
  };
  const buildHarness = new Function(
    "a302_0x41493",
    "createDefaultStoryboardScriptState",
    "resolveTextNodeModelState",
    "buildRegistryTextPayload",
    "applyTextModelSelectorUi",
    "applyImageModelSelectorUi",
    "resolveImageNodeModelState",
    "REGISTRY_IMAGE_PROVIDER",
`${adapterSource}
return {
  applyStoryboardScriptRegistryModelSelector,
  applyStoryboardScriptRegistryImageModelSelector,
  applyStoryboardScriptRegistryPayload,
  decorateStoryboardScriptGeneratedImageNode,
  suppressStoryboardScriptSelectionImageSchemaControls,
  isStoryboardScriptSelectionControlTarget,
};`
  );
  return {
    ...buildHarness(
      appStore,
      createDefaultStoryboardScriptState,
      resolveTextNodeModelState,
      buildRegistryTextPayload,
      applyTextModelSelectorUiImpl,
      applyImageModelSelectorUiImpl,
      resolveImageNodeModelState,
      REGISTRY_IMAGE_PROVIDER
    ),
    nodes,
    updates,
  };
}

test("selectable text models include modelId even when not test-passed", () => {
  const models = [
    {
      id: "mdl_text_unverified",
      nodeType: "text",
      modelName: "Unverified",
      modelId: "unverified-model",
      apiKey: "",
      baseUrl: "",
      status: "unverified",
      disabled: false,
    },
    {
      id: "mdl_text_deleted",
      nodeType: "text",
      modelName: "Deleted",
      modelId: "deleted-model",
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      status: "deleted",
      disabled: false,
    },
    {
      id: "mdl_text_empty",
      nodeType: "text",
      modelName: "No ID",
      modelId: "",
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      status: "available",
      disabled: false,
    },
  ];

  assert.deepEqual(filterSelectableTextModels(models).map((model) => model.id), [
    "mdl_text_unverified",
  ]);
});

test("configured API model filter remains strict for execution readiness", () => {
  const models = [
    {
      id: "mdl_text_unverified",
      nodeType: "text",
      modelName: "Unverified",
      modelId: "unverified-model",
      apiKey: "",
      baseUrl: "",
      status: "unverified",
      disabled: false,
    },
    {
      id: "mdl_text_ready",
      nodeType: "text",
      modelName: "Ready",
      modelId: "ready-model",
      apiKey: "key",
      baseUrl: "https://example.test/v1",
      status: "available",
      disabled: false,
    },
  ];

  assert.deepEqual(filterConfiguredApiModels(models).map((model) => model.id), [
    "mdl_text_ready",
  ]);
});

test("selection patch stores registry id and model id without API secrets", () => {
  const patch = buildTextModelSelectionPatch({
    id: "mdl_text_storyboard",
    modelName: "Storyboard Model",
    modelId: "storyboard-model",
    apiKey: "secret-key",
    baseUrl: "https://example.test/v1",
  });

  assert.equal(patch.selectedModelId, "mdl_text_storyboard");
  assert.equal(patch.selectedModelNameSnapshot, "Storyboard Model");
  assert.equal(patch.model, "storyboard-model");
  assert.equal(patch.provider, "registry-openai");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "apiKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "baseUrl"), false);
});

test("registry text payload resolves execution fields only at submit time", () => {
  const payload = buildRegistryTextPayload(
    { prompt: "make storyboard", systemPrompt: "return JSON" },
    {
      id: "mdl_text_storyboard",
      modelName: "Storyboard Model",
      modelId: "storyboard-model",
      apiKey: "secret-key",
      baseUrl: "https://example.test/v1",
    }
  );

  assert.equal(payload.model, "storyboard-model");
  assert.equal(payload.provider, "registry-openai");
  assert.equal(payload.apiUrl, "https://example.test/v1");
  assert.equal(payload.apiKey, "secret-key");
  assert.equal(payload.selectedModelId, "mdl_text_storyboard");
});

test("default storyboard script state matches Generate Text registry default", () => {
  const state = createDefaultStoryboardScriptState();
  assert.equal(state.textModelSource, "local-registry");
  assert.equal(state.selectedModelId, "mdl_text_default_gemini_3_1");
  assert.equal(state.selectedModelNameSnapshot, "gemini-3.1");
  assert.equal(state.modelDeleted, false);
  assert.equal(state.provider, "registry-openai");
  assert.equal(state.model, "gemini-3.1");
});

test("StoryboardScriptNode imports local registry model helpers", () => {
  const source = read("components/StoryboardScriptNode.js");
  assert.match(source, /modelRegistryRuntime/);
  assert.match(
    source,
    /applyTextModelSelectorUi|buildRegistryTextPayload|resolveTextNodeModelState/
  );
});

test("Storyboard script model selector mirrors text node default and success display", async () => {
  await withTextModelRegistry(
    [
      {
        id: "mdl_text_storyboard_a",
        nodeType: "text",
        modelName: "Storyboard Local A",
        modelId: "storyboard-local-a",
        apiKey: "",
        baseUrl: "",
        status: "unverified",
        disabled: false,
      },
      {
        id: "mdl_text_storyboard_b",
        nodeType: "text",
        modelName: "Storyboard Local B",
        modelId: "storyboard-local-b",
        apiKey: "",
        baseUrl: "",
        status: "unverified",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const currentData = {
        selectedModelId: "mdl_text_storyboard_a",
        selectedModelNameSnapshot: "Storyboard Local A",
        modelDeleted: false,
      };
      const node = {
        nodeId: "storyboard-script-1",
        modelWrap,
        _data: currentData,
      };
      const store = {
        getState: () => ({ nodes: { [node.nodeId]: node._data } }),
        updateNodeData: (_nodeId, patch) => {
          node._data = { ...node._data, ...patch };
        },
      };

      applyTextModelSelectorUi({ node, data: currentData, store });

      assert.equal(modelWrap.label.textContent, "Storyboard Local A");
      assert.equal(modelWrap.trigger.title, "Storyboard Local A");
      assert.equal(modelWrap.trigger.disabled, false);
      assert.equal(modelWrap.menu.querySelectorAll(".floating-menu-item").length, 2);
      assert.equal(
        modelWrap.menu.querySelector(".floating-menu-item.active")?.dataset.modelId,
        "mdl_text_storyboard_a"
      );

      modelWrap.menu.classList.add("show");
      modelWrap.menu.dispatchClick(modelWrap.menu.findItemByModelId("mdl_text_storyboard_b"));

      assert.equal(node._data.selectedModelId, "mdl_text_storyboard_b");
      assert.equal(node._data.selectedModelNameSnapshot, "Storyboard Local B");
      assert.equal(node._data.model, "storyboard-local-b");
      assert.equal(modelWrap.label.textContent, "Storyboard Local B");
      assert.equal(modelWrap.trigger.title, "Storyboard Local B");
      assert.equal(modelWrap.menu.classList.contains("show"), false);
      assert.equal(
        modelWrap.menu.querySelector(".floating-menu-item.active")?.dataset.modelId,
        "mdl_text_storyboard_b"
      );
    }
  );
});

test("text registry selector rebinding writes through the latest node context", async () => {
  await withTextModelRegistry(
    [
      {
        id: "mdl_text_storyboard_a",
        nodeType: "text",
        modelName: "Storyboard Local A",
        modelId: "storyboard-local-a",
        apiKey: "",
        baseUrl: "",
        status: "unverified",
        disabled: false,
      },
      {
        id: "mdl_text_storyboard_b",
        nodeType: "text",
        modelName: "Storyboard Local B",
        modelId: "storyboard-local-b",
        apiKey: "",
        baseUrl: "",
        status: "unverified",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const firstNode = {
        nodeId: "storyboard-script-1",
        modelWrap,
        _data: {
          selectedModelId: "mdl_text_storyboard_a",
          selectedModelNameSnapshot: "Storyboard Local A",
          modelDeleted: false,
        },
      };
      const firstStore = {
        getState: () => ({ nodes: { [firstNode.nodeId]: firstNode._data } }),
        updateNodeData: (_nodeId, patch) => {
          firstNode._data = { ...firstNode._data, ...patch };
        },
      };

      applyTextModelSelectorUi({
        node: firstNode,
        data: firstNode._data,
        store: firstStore,
      });

      const secondNode = {
        nodeId: "storyboard-script-2",
        modelWrap,
        _data: {
          selectedModelId: "mdl_text_storyboard_a",
          selectedModelNameSnapshot: "Storyboard Local A",
          modelDeleted: false,
        },
      };
      const secondStore = {
        getState: () => ({ nodes: { [secondNode.nodeId]: secondNode._data } }),
        updateNodeData: (_nodeId, patch) => {
          secondNode._data = { ...secondNode._data, ...patch };
        },
      };

      applyTextModelSelectorUi({
        node: secondNode,
        data: secondNode._data,
        store: secondStore,
      });
      modelWrap.menu.dispatchClick(
        modelWrap.menu.findItemByModelId("mdl_text_storyboard_b")
      );

      assert.equal(firstNode._data.selectedModelId, "mdl_text_storyboard_a");
      assert.equal(secondNode._data.selectedModelId, "mdl_text_storyboard_b");
      assert.equal(secondNode._data.model, "storyboard-local-b");
    }
  );
});

test("image registry selector rebinding writes through the latest node context", async () => {
  await withImageModelRegistry(
    [
      {
        id: "mdl_image_storyboard_a",
        nodeType: "image",
        modelName: "Storyboard Image A",
        modelId: "storyboard-image-a",
        apiKey: "key-a",
        baseUrl: "https://image-a.test/v1",
        status: "available",
        disabled: false,
      },
      {
        id: "mdl_image_storyboard_b",
        nodeType: "image",
        modelName: "Storyboard Image B",
        modelId: "storyboard-image-b",
        apiKey: "key-b",
        baseUrl: "https://image-b.test/v1",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const firstNode = {
        nodeId: "image-node-1",
        modelWrap,
        _data: {
          selectedModelId: "mdl_image_storyboard_a",
          selectedModelNameSnapshot: "Storyboard Image A",
          modelDeleted: false,
        },
      };
      const firstStore = {
        getState: () => ({ nodes: { [firstNode.nodeId]: firstNode._data } }),
        updateNodeData: (_nodeId, patch) => {
          firstNode._data = { ...firstNode._data, ...patch };
        },
      };

      applyImageModelSelectorUi({
        node: firstNode,
        data: firstNode._data,
        store: firstStore,
      });

      const secondNode = {
        nodeId: "image-node-2",
        modelWrap,
        _data: {
          selectedModelId: "mdl_image_storyboard_a",
          selectedModelNameSnapshot: "Storyboard Image A",
          modelDeleted: false,
        },
      };
      const secondStore = {
        getState: () => ({ nodes: { [secondNode.nodeId]: secondNode._data } }),
        updateNodeData: (_nodeId, patch) => {
          secondNode._data = { ...secondNode._data, ...patch };
        },
      };

      applyImageModelSelectorUi({
        node: secondNode,
        data: secondNode._data,
        store: secondStore,
      });
      modelWrap.menu.dispatchClick(
        modelWrap.menu.findItemByModelId("mdl_image_storyboard_b")
      );

      assert.equal(firstNode._data.selectedModelId, "mdl_image_storyboard_a");
      assert.equal(secondNode._data.selectedModelId, "mdl_image_storyboard_b");
      assert.equal(secondNode._data.model, "storyboard-image-b");
      assert.equal(secondNode._data.provider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(modelWrap.label.textContent, "Storyboard Image B");
      assert.equal(
        modelWrap.menu.querySelector(".floating-menu-item.active")?.dataset.modelId,
        "mdl_image_storyboard_b"
      );
    }
  );
});

test("Storyboard selection mode image selector uses Generate Image registry models", async () => {
  await withImageModelRegistry(
    [
      {
        id: "mdl_image_storyboard_a",
        nodeType: "image",
        modelName: "Storyboard Image A",
        modelId: "storyboard-image-a",
        apiKey: "key-a",
        baseUrl: "https://image-a.test/v1",
        status: "available",
        disabled: false,
      },
      {
        id: "mdl_image_storyboard_b",
        nodeType: "image",
        modelName: "Storyboard Image B",
        modelId: "storyboard-image-b",
        apiKey: "key-b",
        baseUrl: "https://image-b.test/v1",
        status: "available",
        disabled: false,
      },
      {
        id: "mdl_image_unconfigured",
        nodeType: "image",
        modelName: "Unconfigured Image",
        modelId: "unconfigured-image",
        apiKey: "",
        baseUrl: "",
        status: "unconfigured",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const { applyStoryboardScriptRegistryImageModelSelector, nodes } =
        createStoryboardRegistryPayloadHarness({
          applyImageModelSelectorUiImpl: applyImageModelSelectorUi,
        });
      const node = {
        nodeId: "storyboard-script-image-selector",
        _promptPanelEl: {
          querySelector: (selector) =>
            selector === ".img-model-wrap" ? modelWrap : null,
        },
        _data: {
          storyboardScript: {
            selectionMode: true,
            rows: [{ "图片提示词": "shot prompt" }],
            imageModel: "storyboard-image-a",
            imageProvider: REGISTRY_IMAGE_PROVIDER,
            imageSelectedModelId: "mdl_image_storyboard_a",
            imageSelectedModelNameSnapshot: "Storyboard Image A",
            imageModelDeleted: false,
          },
        },
      };
      nodes[node.nodeId] = node._data;

      applyStoryboardScriptRegistryImageModelSelector(node);

      assert.equal(modelWrap.label.textContent, "Storyboard Image A");
      assert.equal(modelWrap.trigger.title, "Storyboard Image A");
      assert.equal(modelWrap.trigger.disabled, false);
      assert.equal(modelWrap.menu.querySelectorAll(".floating-menu-item").length, 2);
      assert.doesNotMatch(modelWrap.menu.innerHTML, /grsai/i);
      assert.doesNotMatch(modelWrap.menu.innerHTML, /Unconfigured Image/);

      modelWrap.menu.classList.add("show");
      modelWrap.menu.dispatchClick(
        modelWrap.menu.findItemByModelId("mdl_image_storyboard_b")
      );

      assert.equal(
        node._data.storyboardScript.imageSelectedModelId,
        "mdl_image_storyboard_b"
      );
      assert.equal(
        node._data.storyboardScript.imageSelectedModelNameSnapshot,
        "Storyboard Image B"
      );
      assert.equal(node._data.storyboardScript.imageModel, "storyboard-image-b");
      assert.equal(node._data.storyboardScript.imageProvider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(node._data.model, "storyboard-image-b");
      assert.equal(node._data.provider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(node._data.selectedModelId, "mdl_image_storyboard_b");
      assert.equal(node._data.selectedModelNameSnapshot, "Storyboard Image B");
      assert.equal(modelWrap.label.textContent, "Storyboard Image B");
      assert.equal(modelWrap.trigger.title, "Storyboard Image B");
    }
  );
});

test("Storyboard selection mode image selector does not surface legacy grsai model names", async () => {
  await withImageModelRegistry(
    [
      {
        id: "mdl_image_storyboard_a",
        nodeType: "image",
        modelName: "Storyboard Image A",
        modelId: "storyboard-image-a",
        apiKey: "key-a",
        baseUrl: "https://image-a.test/v1",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const { applyStoryboardScriptRegistryImageModelSelector, nodes } =
        createStoryboardRegistryPayloadHarness({
          applyImageModelSelectorUiImpl: applyImageModelSelectorUi,
        });
      const node = {
        nodeId: "storyboard-script-legacy-image-selector",
        _promptPanelEl: {
          querySelector: (selector) =>
            selector === ".img-model-wrap" ? modelWrap : null,
        },
        _data: {
          storyboardScript: {
            selectionMode: true,
            rows: [{ "图片提示词": "shot prompt" }],
            imageModel: "grsai",
            imageProvider: "grsai",
          },
        },
      };
      nodes[node.nodeId] = node._data;

      applyStoryboardScriptRegistryImageModelSelector(node);

      assert.doesNotMatch(modelWrap.label.textContent, /grsai/i);
      assert.doesNotMatch(modelWrap.trigger.title, /grsai/i);
      assert.doesNotMatch(modelWrap.trigger.innerHTML, /grsai/i);
      assert.equal(modelWrap.trigger.disabled, false);
      assert.match(modelWrap.menu.innerHTML, /Storyboard Image A/);
    }
  );
});

test("Storyboard selection mode image selector clears legacy image model persistence", async () => {
  await withImageModelRegistry(
    [
      {
        id: "mdl_image_storyboard_a",
        nodeType: "image",
        modelName: "Storyboard Image A",
        modelId: "storyboard-image-a",
        apiKey: "key-a",
        baseUrl: "https://image-a.test/v1",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const { applyStoryboardScriptRegistryImageModelSelector, nodes } =
        createStoryboardRegistryPayloadHarness({
          applyImageModelSelectorUiImpl: applyImageModelSelectorUi,
        });
      const node = {
        nodeId: "storyboard-script-legacy-persistence",
        _promptPanelEl: {
          querySelector: (selector) =>
            selector === ".img-model-wrap" ? modelWrap : null,
        },
        _data: {
          storyboardScript: {
            selectionMode: true,
            rows: [{ "图片提示词": "shot prompt" }],
            imageModel: "grsai",
            imageProvider: "grsai",
          },
        },
      };
      nodes[node.nodeId] = node._data;

      applyStoryboardScriptRegistryImageModelSelector(node);

      assert.equal(node._data.model, "");
      assert.equal(node._data.provider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(node._data.storyboardScript.imageModel, "");
      assert.equal(
        node._data.storyboardScript.imageProvider,
        REGISTRY_IMAGE_PROVIDER
      );
      assert.equal(node._data.storyboardScript.imageModelDeleted, true);
    }
  );
});

test("Storyboard selection mode image selector normalizes selected registry provider", async () => {
  await withImageModelRegistry(
    [
      {
        id: "mdl_image_storyboard_a",
        nodeType: "image",
        modelName: "Storyboard Image A",
        modelId: "storyboard-image-a",
        apiKey: "key-a",
        baseUrl: "https://image-a.test/v1",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const modelWrap = createStoryboardModelSelectorDom();
      const { applyStoryboardScriptRegistryImageModelSelector, nodes } =
        createStoryboardRegistryPayloadHarness({
          applyImageModelSelectorUiImpl: applyImageModelSelectorUi,
        });
      const node = {
        nodeId: "storyboard-script-selected-legacy-provider",
        _promptPanelEl: {
          querySelector: (selector) =>
            selector === ".img-model-wrap" ? modelWrap : null,
        },
        _data: {
          storyboardScript: {
            selectionMode: true,
            rows: [{ "图片提示词": "shot prompt" }],
            imageModel: "storyboard-image-a",
            imageProvider: "grsai",
            imageSelectedModelId: "mdl_image_storyboard_a",
            imageSelectedModelNameSnapshot: "Storyboard Image A",
            imageModelDeleted: false,
          },
        },
      };
      nodes[node.nodeId] = node._data;

      applyStoryboardScriptRegistryImageModelSelector(node);

      assert.equal(node._data.provider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(node._data.storyboardScript.imageProvider, REGISTRY_IMAGE_PROVIDER);
      assert.equal(modelWrap.label.textContent, "Storyboard Image A");
    }
  );
});

test("Storyboard script registry selector clears legacy grsai text-provider icon", () => {
  const modelWrap = createStoryboardModelSelectorDom();
  const { applyStoryboardScriptRegistryModelSelector } =
    createStoryboardRegistryPayloadHarness({
      applyTextModelSelectorUiImpl: ({ node }) => {
        const labelEl = node.modelWrap.querySelector(".img-model-label");
        const triggerEl = node.modelWrap.querySelector(".img-model-btn-trigger");
        labelEl.textContent = "Storyboard Local A";
        triggerEl.title = "Storyboard Local A";
      },
    });
  const node = {
    nodeId: "storyboard-script-1",
    _promptPanelEl: {
      querySelector: (selector) =>
        selector === ".img-model-wrap" ? modelWrap : null,
    },
    _data: {
      storyboardScript: {
        selectionMode: false,
        selectedModelId: "mdl_text_storyboard_a",
        selectedModelNameSnapshot: "Storyboard Local A",
        modelDeleted: false,
      },
    },
  };

  assert.match(modelWrap.trigger.innerHTML, /grsai/i);

  applyStoryboardScriptRegistryModelSelector(node);

  assert.doesNotMatch(modelWrap.trigger.innerHTML, /grsai/i);
  assert.match(modelWrap.trigger.innerHTML, /text-model-icon-small/);
  assert.equal(modelWrap.label.textContent, "Storyboard Local A");
});

test("Storyboard script registry selector keeps selected model name visible after icon sync", () => {
  const modelWrap = createStoryboardModelSelectorDom();
  const { applyStoryboardScriptRegistryModelSelector } =
    createStoryboardRegistryPayloadHarness({
      applyTextModelSelectorUiImpl: ({ node }) => {
        const labelEl = node.modelWrap.querySelector(".img-model-label");
        const triggerEl = node.modelWrap.querySelector(".img-model-btn-trigger");
        labelEl.textContent = "Storyboard Local B";
        triggerEl.title = "Storyboard Local B";
      },
    });
  const node = {
    nodeId: "storyboard-script-1",
    _promptPanelEl: {
      querySelector: (selector) =>
        selector === ".img-model-wrap" ? modelWrap : null,
    },
    _data: {
      storyboardScript: {
        selectionMode: false,
        selectedModelId: "mdl_text_storyboard_b",
        selectedModelNameSnapshot: "Storyboard Local B",
        modelDeleted: false,
      },
    },
  };

  applyStoryboardScriptRegistryModelSelector(node);

  assert.doesNotMatch(modelWrap.trigger.innerHTML, /grsai/i);
  assert.doesNotMatch(modelWrap.trigger.innerHTML, />AI</);
  assert.match(modelWrap.trigger.innerHTML, /Storyboard Local B/);
  assert.equal(modelWrap.label.textContent, "Storyboard Local B");
  assert.equal(modelWrap.trigger.title, "Storyboard Local B");
});

test("Storyboard script selection mode treats prompt footer controls as inside targets", () => {
  const { isStoryboardScriptSelectionControlTarget } =
    createStoryboardRegistryPayloadHarness();
  const promptFooterButton = {};
  const imageMenuButton = {};
  const outsideButton = {
    closest: () => null,
  };
  const node = {
    _promptPanelEl: {
      contains: (target) => target === promptFooterButton,
    },
    _storyboardImageModelMenu: {
      contains: (target) => target === imageMenuButton,
    },
  };

  assert.equal(
    isStoryboardScriptSelectionControlTarget(node, promptFooterButton),
    true
  );
  assert.equal(
    isStoryboardScriptSelectionControlTarget(node, imageMenuButton),
    true
  );
  assert.equal(
    isStoryboardScriptSelectionControlTarget(
      node,
      {
        closest: (selector) =>
          selector.includes(".prompt-panel-footer") ? {} : null,
      }
    ),
    true
  );
  assert.equal(isStoryboardScriptSelectionControlTarget(node, outsideButton), false);
});

function createControlElement(className = "") {
  return {
    hidden: false,
    innerHTML: "content",
    style: { display: "" },
    classList: createClassList(className),
  };
}

test("Storyboard selection mode suppresses standard and advanced image controls", () => {
  const { suppressStoryboardScriptSelectionImageSchemaControls } =
    createStoryboardRegistryPayloadHarness();
  const modeSlot = createControlElement("ui-schema-mode-slot");
  const advWrap = createControlElement("rh-adv-wrap");
  const advPanel = createControlElement("show");
  const panelModeSlot = createControlElement("ui-schema-mode-slot");
  const panelAdvWrap = createControlElement("rh-adv-wrap");
  const node = {
    _data: {
      storyboardScript: {
        selectionMode: true,
        rows: [{ "图片提示词": "shot prompt" }],
      },
    },
    uiSchemaModeSlot: modeSlot,
    rhAdvWrap: advWrap,
    rhAdvPanelEl: advPanel,
    _promptPanelEl: {
      querySelectorAll: (selector) => {
        if (selector.includes(".ui-schema-mode-slot")) {
          return [panelModeSlot, panelAdvWrap];
        }
        return [];
      },
    },
  };

  suppressStoryboardScriptSelectionImageSchemaControls(node);

  for (const el of [modeSlot, advWrap, panelModeSlot, panelAdvWrap]) {
    assert.equal(el.hidden, true);
    assert.equal(el.style.display, "none");
    assert.equal(el.innerHTML, "");
  }
  assert.equal(advPanel.hidden, true);
  assert.equal(advPanel.style.display, "none");
  assert.equal(advPanel.classList.contains("show"), false);
});

test("Storyboard generated image nodes carry selected registry image model", () => {
  const { decorateStoryboardScriptGeneratedImageNode } =
    createStoryboardRegistryPayloadHarness();
  const sourceNode = {
    _data: {
      storyboardScript: {
        selectionMode: true,
        imageModel: "storyboard-image-b",
        imageProvider: REGISTRY_IMAGE_PROVIDER,
        imageSelectedModelId: "mdl_image_storyboard_b",
        imageSelectedModelNameSnapshot: "Storyboard Image B",
        imageModelDeleted: false,
      },
    },
  };
  const groupNode = { id: "group-1", type: "group", model: "legacy" };
  const imageNode = {
    id: "image-1",
    type: "ai-image",
    model: "legacy-image",
    provider: "grsai",
  };

  assert.equal(
    decorateStoryboardScriptGeneratedImageNode(sourceNode, groupNode),
    groupNode
  );
  assert.deepEqual(decorateStoryboardScriptGeneratedImageNode(sourceNode, imageNode), {
    id: "image-1",
    type: "ai-image",
    model: "storyboard-image-b",
    provider: REGISTRY_IMAGE_PROVIDER,
    selectedModelId: "mdl_image_storyboard_b",
    selectedModelNameSnapshot: "Storyboard Image B",
    modelDeleted: false,
  });
});

test("Storyboard generated image nodes do not inherit legacy image model without registry selection", () => {
  const { decorateStoryboardScriptGeneratedImageNode } =
    createStoryboardRegistryPayloadHarness();
  const sourceNode = {
    _data: {
      storyboardScript: {
        selectionMode: true,
        imageModel: "",
        imageProvider: REGISTRY_IMAGE_PROVIDER,
        imageSelectedModelId: "",
        imageSelectedModelNameSnapshot: "",
        imageModelDeleted: true,
      },
    },
  };
  const imageNode = {
    id: "image-legacy-default",
    type: "ai-image",
    model: "apimart/nano-banana-2",
    provider: "apimart",
  };

  assert.deepEqual(decorateStoryboardScriptGeneratedImageNode(sourceNode, imageNode), {
    id: "image-legacy-default",
    type: "ai-image",
    model: "",
    provider: REGISTRY_IMAGE_PROVIDER,
    selectedModelId: "",
    selectedModelNameSnapshot: "",
    modelDeleted: true,
  });
});

test("Storyboard generated image nodes normalize selected registry provider", () => {
  const { decorateStoryboardScriptGeneratedImageNode } =
    createStoryboardRegistryPayloadHarness();
  const sourceNode = {
    _data: {
      storyboardScript: {
        selectionMode: true,
        imageModel: "storyboard-image-a",
        imageProvider: "grsai",
        imageSelectedModelId: "mdl_image_storyboard_a",
        imageSelectedModelNameSnapshot: "Storyboard Image A",
        imageModelDeleted: false,
      },
    },
  };
  const imageNode = {
    id: "image-selected-legacy-provider",
    type: "ai-image",
    model: "legacy-image",
    provider: "grsai",
  };

  assert.deepEqual(decorateStoryboardScriptGeneratedImageNode(sourceNode, imageNode), {
    id: "image-selected-legacy-provider",
    type: "ai-image",
    model: "storyboard-image-a",
    provider: REGISTRY_IMAGE_PROVIDER,
    selectedModelId: "mdl_image_storyboard_a",
    selectedModelNameSnapshot: "Storyboard Image A",
    modelDeleted: false,
  });
});


test("Storyboard script registry selector writes nested storyboardScript fields", async () => {
  await withTextModelRegistry(
    [
      {
        id: "mdl_text_storyboard_a",
        nodeType: "text",
        modelName: "Storyboard Local A",
        modelId: "storyboard-local-a",
        apiKey: "key-a",
        baseUrl: "https://example.test/a",
        status: "available",
        disabled: false,
      },
      {
        id: "mdl_text_storyboard_b",
        nodeType: "text",
        modelName: "Storyboard Local B",
        modelId: "storyboard-local-b",
        apiKey: "key-b",
        baseUrl: "https://example.test/b",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const source = read("components/StoryboardScriptNode.js");
      assert.match(source, /updateStoryboardScriptRegistryPatch/);
      assert.match(source, /storyboardScript:\s*nextScript/);
      assert.doesNotMatch(source, /selectedModelId['\"]?\s*:\s*['\"]mdl_text_storyboard_b/);
    }
  );
});

test("Storyboard script registry payload resolves default model through Generate Text rules", async () => {
  await withTextModelRegistry(
    [
      {
        id: "mdl_text_default_gemini_3_1",
        nodeType: "text",
        modelName: "gemini-3.1",
        modelId: "gemini-3.1-runtime",
        apiKey: "key-gemini",
        baseUrl: "https://registry.example.com/v1/chat/completions",
        status: "available",
        disabled: false,
      },
    ],
    () => {
      const state = createDefaultStoryboardScriptState();
      const modelState = resolveTextNodeModelState(state);
      assert.equal(modelState.state, "ready");
      const payload = buildRegistryTextPayload(
        { prompt: "make storyboard", provider: state.provider, model: state.model },
        modelState.model
      );
      assert.equal(payload.provider, "registry-openai");
      assert.equal(payload.model, "gemini-3.1-runtime");
      assert.equal(payload.apiKey, "key-gemini");
      assert.equal(payload.apiUrl, "https://registry.example.com/v1/chat/completions");
      assert.equal(payload.selectedModelId, "mdl_text_default_gemini_3_1");
    }
  );
});

test("StoryboardScriptNode no longer bypasses registry payload for default text model", () => {
  const source = read("components/StoryboardScriptNode.js");
  assert.doesNotMatch(
    source,
    /!scriptState\.selectedModelId\s*&&\s*payload\.provider\s*!==\s*REGISTRY_TEXT_PROVIDER/
  );
  assert.match(source, /resolveTextNodeModelState\(scriptState\)/);
  assert.match(source, /buildRegistryTextPayload\(payload,\s*modelState\.model\)/);
});

test("StoryboardScriptNode dispatches registry payload through Generate Text runtime", () => {
  const source = read("components/StoryboardScriptNode.js");
  const start = source.indexOf("function runStoryboardScriptTextGeneration");
  assert.notEqual(start, -1);
  const functionSource = source.slice(start, start + 500);

  assert.match(functionSource, /provider\s*={0,3}\s*REGISTRY_TEXT_PROVIDER/);
  assert.match(functionSource, /generateTextWithRegistryModel\(payload\)/);
  assert.match(functionSource, /generateText\(payload\)/);
});

test("StoryboardScriptNode matches Generate Text deleted-model failure behavior", async () => {
  await withTextModelRegistry([], () => {
    const { applyStoryboardScriptRegistryPayload, nodes } =
      createStoryboardRegistryPayloadHarness();
    const toasts = [];
    const originalToast = globalThis.showToast;
    globalThis.showToast = (message, level) => {
      toasts.push({ message, level });
    };
    const node = {
      nodeId: "storyboard-script-deleted",
      _data: {
        storyboardScript: {
          selectedModelId: "mdl_text_deleted_storyboard",
          selectedModelNameSnapshot: "Deleted Storyboard Model",
          modelDeleted: false,
          provider: "registry-openai",
          model: "deleted-storyboard-model",
        },
      },
    };
    nodes[node.nodeId] = node._data;

    try {
      const result = applyStoryboardScriptRegistryPayload(node, {
        prompt: "make storyboard",
        provider: "registry-openai",
        model: "deleted-storyboard-model",
      });

      assert.equal(result, null);
      assert.equal(node._data.storyboardScript.status, "failed");
      assert.equal(node._data.storyboardScript.error, TEXT_MODEL_DELETED_MESSAGE);
      assert.equal(nodes[node.nodeId].storyboardScript.status, "failed");
      assert.equal(nodes[node.nodeId].storyboardScript.error, TEXT_MODEL_DELETED_MESSAGE);
      assert.deepEqual(toasts, [
        { message: TEXT_MODEL_DELETED_MESSAGE, level: "error" },
      ]);
    } finally {
      globalThis.showToast = originalToast;
    }
  });
});

test("StoryboardScriptNode matches Generate Text unconfigured-model failure behavior", async () => {
  await withTextModelRegistry(
    [
      {
        id: "mdl_text_unconfigured_storyboard",
        nodeType: "text",
        modelName: "Storyboard Needs Config",
        modelId: "storyboard-needs-config",
        apiKey: "",
        baseUrl: "",
        status: "unverified",
        disabled: false,
      },
    ],
    () => {
      const { applyStoryboardScriptRegistryPayload, nodes } =
        createStoryboardRegistryPayloadHarness();
      const toasts = [];
      const originalToast = globalThis.showToast;
      globalThis.showToast = (message, level) => {
        toasts.push({ message, level });
      };
      const node = {
        nodeId: "storyboard-script-unconfigured",
        _data: {
          storyboardScript: {
            selectedModelId: "mdl_text_unconfigured_storyboard",
            selectedModelNameSnapshot: "Storyboard Needs Config",
            modelDeleted: false,
            provider: "registry-openai",
            model: "storyboard-needs-config",
          },
        },
      };
      nodes[node.nodeId] = node._data;

      try {
        const result = applyStoryboardScriptRegistryPayload(node, {
          prompt: "make storyboard",
          provider: "registry-openai",
          model: "storyboard-needs-config",
        });

        assert.equal(result, null);
        assert.equal(node._data.storyboardScript.status, "failed");
        assert.equal(
          node._data.storyboardScript.error,
          TEXT_MODEL_UNCONFIGURED_MESSAGE
        );
        assert.equal(nodes[node.nodeId].storyboardScript.status, "failed");
        assert.equal(
          nodes[node.nodeId].storyboardScript.error,
          TEXT_MODEL_UNCONFIGURED_MESSAGE
        );
        assert.deepEqual(toasts, [
          { message: TEXT_MODEL_UNCONFIGURED_MESSAGE, level: "warn" },
        ]);
      } finally {
        globalThis.showToast = originalToast;
      }
    }
  );
});

test("StoryboardScriptNode text references are visible and included in submit prompt", () => {
  const source = read("components/StoryboardScriptNode.js");
  assert.match(source, /_renderSharedRefBar\(this\)/);
  assert.match(source, /resolvePromptTextWithTextRefs/);
  assert.match(source, /['"`"]?allowedAssetTypes['"`"]?\s*:\s*\[[^\]]*['"`"]text['"`"]?/);
  assert.match(source, /getPromptAssetInputRefsFromNode\([\s\S]*?\{\s*allowedTypes\s*:\s*\[[^\]]*["']text["']/);
  assert.match(source, /applyStoryboardScriptStoredTextRefsToSubmitInput/);
  assert.match(source, /promptText:\s*\[missingTextParts\.join\("\\n"\),\s*currentPrompt\]/);

  const resolved = resolvePromptTextWithTextRefs({
    promptEl: {
      childNodes: [],
      innerText: "base prompt",
      textContent: "base prompt",
    },
    inEdges: [{ id: "edge-1", sourceId: "text-1", targetId: "storyboard-1" }],
    nodes: {
      "text-1": {
        id: "text-1",
        type: "ai-text",
        outputText: "hello ref",
      },
    },
    allowedAssetTypes: ["text", "image", "video"],
  });

  assert.match(resolved, /hello ref/);
  assert.match(resolved, /base prompt/);
});

test("StoryboardScriptNode uses shared ref bar for text references instead of DOM hacks", () => {
  const source = read("components/StoryboardScriptNode.js");

  assert.match(source, /_renderSharedRefBar\(this\)/);
  assert.doesNotMatch(source, /normalizeStoryboardScriptTextRefBar/);
  assert.doesNotMatch(source, /renderStoryboardScriptTextRefThumb/);
  assert.doesNotMatch(source, /isStoryboardScriptTextReferenceNode/);
  assert.doesNotMatch(source, /setAttribute\("draggable",\s*"true"\)/);
  assert.doesNotMatch(source, /dataset\.type\s*=\s*"text"/);
  assert.doesNotMatch(source, />TXT</);
});

test("StoryboardScriptNode reapplies registry selector after selection mode UI sync", () => {
  const source = read("components/StoryboardScriptNode.js");
  const patchStart = source.indexOf("storyboardScriptSyncSelectionModeUiKey");
  assert.notEqual(patchStart, -1);
  const patchSource = source.slice(patchStart);

  assert.match(patchSource, /a302_0x273bb8\(0x31d\)/);
  assert.match(patchSource, /applyStoryboardScriptRegistryModelSelector\(this\)/);
  assert.match(patchSource, /selectionMode\s*!==\s*true/);
});

test("stored text asset references survive normalization and can feed prompts", () => {
  _resetAssetMentionRegistryForTests();
  setAssetMentionAssets([
    {
      id: "asset-text-1",
      name: "Reference Text Asset",
      items: [
        {
          type: "text",
          name: "Reference Text Item",
          content: "asset text payload",
        },
      ],
    },
  ]);

  try {
    const nodeData = {
      promptAssetInputRefs: [
        {
          assetId: "asset-text-1",
          itemIndex: 0,
          type: "text",
        },
      ],
    };

    const refs = getPromptAssetInputRefsFromNode(nodeData, {
      allowedTypes: ["text", "image", "video"],
    });

    assert.equal(refs.length, 1);
    assert.equal(refs[0].assetId, "asset-text-1");
    assert.equal(refs[0].itemIndex, 0);
    assert.equal(refs[0].type, "text");
    assert.equal(refs[0].content, "asset text payload");
  } finally {
    _resetAssetMentionRegistryForTests();
  }
});

