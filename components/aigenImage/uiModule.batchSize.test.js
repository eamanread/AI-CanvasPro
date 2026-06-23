import test from "node:test";
import assert from "node:assert/strict";

import {
  bindBatchSizeControlStoreSync,
  bindImageCommonPromptAndFooterControls,
} from "./uiModule.js";
import { COMMON_PROMPT_DEFAULT_LABEL } from "../../modules/promptPresetPillRuntime.js";

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor({ classes = [], dataset = {}, textContent = "" } = {}) {
    this.classList = new FakeClassList(classes);
    this.className = classes.join(" ");
    this.dataset = { ...dataset };
    this.textContent = textContent;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.attributes = {};
    this.ownerDocument = fakeDocument;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((candidate) => candidate !== child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    if (!reference) {
      return this.appendChild(child);
    }
    const index = this.children.indexOf(reference);
    if (index < 0) {
      return this.appendChild(child);
    }
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((candidate) => candidate !== child);
    }
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }

  insertAdjacentElement(position, child) {
    if (position !== "afterend" || !this.parentNode) {
      return this.appendChild(child);
    }
    const index = this.parentNode.children.indexOf(this);
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((candidate) => candidate !== child);
    }
    child.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = String(value);
      this.classList.values = new Set(this.className.split(/\s+/).filter(Boolean));
    }
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.attributes[name] ?? null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = (element) => {
      if (matchesSelector(element, selector)) {
        results.push(element);
      }
      for (const child of element.children) {
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) {
        return current;
      }
      current = current.parentNode || null;
    }
    return null;
  }
}

function matchesSelector(element, selector) {
  const selectors = selector.split(",").map((item) => item.trim()).filter(Boolean);
  if (selectors.length > 1) {
    return selectors.some((item) => matchesSelector(element, item));
  }
  if (selector === "[data-role='debug-wrench']") {
    return element.dataset.role === "debug-wrench";
  }
  if (selector === "[data-role='image-model-selector']") {
    return element.dataset.role === "image-model-selector";
  }
  if (selector === ".batch-wrap") {
    return element.classList.contains("batch-wrap");
  }
  if (selector === ".batch-menu .floating-menu-item[data-value]") {
    return (
      element.classList.contains("floating-menu-item") &&
      element.dataset.value !== undefined &&
      Boolean(element.closest(".batch-menu"))
    );
  }
  if (selector === ".batch-menu") {
    return element.classList.contains("batch-menu");
  }
  if (selector === ".floating-menu-item[data-value]") {
    return element.classList.contains("floating-menu-item") && element.dataset.value !== undefined;
  }
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  return false;
}

const fakeDocument = {
  createElement() {
    return new FakeElement();
  },
};

function createBatchDom() {
  const root = new FakeElement();
  const batchWrap = new FakeElement({ classes: ["batch-wrap"] });
  const menu = new FakeElement({ classes: ["batch-menu"] });
  const item1 = new FakeElement({
    classes: ["floating-menu-item", "active"],
    dataset: { value: "1" },
  });
  const item2 = new FakeElement({
    classes: ["floating-menu-item"],
    dataset: { value: "2" },
  });
  const item4 = new FakeElement({
    classes: ["floating-menu-item"],
    dataset: { value: "4" },
  });

  root.appendChild(batchWrap);
  batchWrap.appendChild(menu);
  menu.appendChild(item1);
  menu.appendChild(item2);
  menu.appendChild(item4);

  return { root, batchWrap, item1, item2, item4 };
}

function createStore(nodeId, batchSize = 1) {
  const state = {
    nodes: {
      [nodeId]: { id: nodeId, batchSize },
    },
  };
  return {
    getState() {
      return state;
    },
    updateNodeData(targetId, patch) {
      state.nodes[targetId] = {
        ...state.nodes[targetId],
        ...patch,
      };
    },
  };
}

test("aigenImage ui: batch menu click writes selected count to store and node data", () => {
  const nodeId = "node-ai-image-batch-ui";
  const { root, batchWrap, item1, item2 } = createBatchDom();
  const store = createStore(nodeId, 1);
  const node = {
    nodeId,
    _data: store.getState().nodes[nodeId],
    _root: root,
  };

  bindBatchSizeControlStoreSync(node, store);
  assert.equal(batchWrap.listeners.click.length, 1);

  batchWrap.listeners.click[0]({
    target: item2,
  });

  assert.equal(store.getState().nodes[nodeId].batchSize, 2);
  assert.equal(node._data.batchSize, 2);
  assert.equal(item1.classList.contains("active"), false);
  assert.equal(item2.classList.contains("active"), true);
});

function createImageFooterDom() {
  const root = new FakeElement();
  const promptEl = new FakeElement({ classes: ["prompt-textarea"] });
  const footer = new FakeElement({ classes: ["prompt-panel-footer"] });
  const modelWrap = new FakeElement({ classes: ["img-model-wrap"], dataset: { role: "image-model-selector" } });
  const qualityWrap = new FakeElement({ classes: ["quality-wrap"] });
  const ratioWrap = new FakeElement({ classes: ["ratio-wrap"] });
  const batchWrap = new FakeElement({ classes: ["batch-wrap"] });
  const debug = new FakeElement({ classes: ["debug-wrench-btn"] });

  root.appendChild(promptEl);
  root.appendChild(footer);
  footer.appendChild(modelWrap);
  footer.appendChild(batchWrap);
  footer.appendChild(qualityWrap);
  footer.appendChild(ratioWrap);
  footer.appendChild(debug);

  return { root, promptEl, footer, modelWrap, qualityWrap, ratioWrap, batchWrap, debug };
}

test("aigenImage ui: common prompt button is inserted after model and footer controls are ordered", () => {
  const nodeId = "node-ai-image-common-ui";
  const { root, promptEl, footer, modelWrap, qualityWrap, ratioWrap, batchWrap, debug } = createImageFooterDom();
  const pickerCalls = [];
  const store = createStore(nodeId, 1);
  const node = {
    nodeId,
    _data: store.getState().nodes[nodeId],
    _root: root,
    promptEl,
  };

  bindImageCommonPromptAndFooterControls(node, store, null, {
    openPromptPresetPicker(options) {
      pickerCalls.push(options);
    },
    isDebugModeEnabled: () => false,
  });

  const commonButton = footer.querySelector(".common-prompt-btn");
  assert.ok(commonButton);
  assert.equal(commonButton.textContent, COMMON_PROMPT_DEFAULT_LABEL);
  assert.deepEqual(footer.children.slice(0, 5), [modelWrap, commonButton, qualityWrap, ratioWrap, batchWrap]);
  assert.equal(debug.style.display, "none");
  assert.equal(debug.hidden, true);

  commonButton.listeners.click[0]({ preventDefault() {}, stopPropagation() {} });

  assert.equal(pickerCalls.length, 1);
  assert.equal(pickerCalls[0].promptEl, promptEl);
  assert.equal(pickerCalls[0].nodeType, "ai-image");
  assert.equal(pickerCalls[0].commonPromptButtonEl, commonButton);
});

test("aigenImage ui: debug wrench remains visible in debug mode", () => {
  const nodeId = "node-ai-image-common-ui-debug";
  const { root, promptEl, debug } = createImageFooterDom();
  const store = createStore(nodeId, 1);

  bindImageCommonPromptAndFooterControls(
    {
      nodeId,
      _data: store.getState().nodes[nodeId],
      _root: root,
      promptEl,
    },
    store,
    null,
    {
      isDebugModeEnabled: () => true,
    },
  );

  assert.equal(debug.style.display, "");
  assert.equal(debug.hidden, false);
});
