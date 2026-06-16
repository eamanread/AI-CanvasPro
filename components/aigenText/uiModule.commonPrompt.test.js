import test from "node:test";
import assert from "node:assert/strict";

import { COMMON_PROMPT_DEFAULT_LABEL } from "../../modules/promptPresetPillRuntime.js";
import { bindTextCommonPromptAndDebugControls } from "./uiModule.js";

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }

  setFromString(value) {
    this.values = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }
}

class FakeElement {
  constructor({ tagName = "div", classes = [], textContent = "" } = {}) {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList(classes);
    this.className = classes.join(" ");
    this.textContent = textContent;
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.ownerDocument = fakeDocument;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
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
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentNode = null;
  }

  insertAdjacentElement(position, child) {
    if (position !== "afterend" || !this.parentNode) {
      return this.appendChild(child);
    }
    const index = this.parentNode.children.indexOf(this);
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners[type] || []) {
      handler({ target: this, ...event });
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = String(value);
      this.classList.setFromString(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }
    if (selector.startsWith("[data-role='")) {
      const role = selector.match(/\[data-role='([^']+)'\]/)?.[1];
      return this.dataset.role === role;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(",").map((item) => item.trim()).filter(Boolean);
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((candidate) => child.matches(candidate))) {
          result.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return result;
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement({ tagName });
  },
};

function createTextUiDom() {
  const root = new FakeElement({ classes: ["aigen-text-node-root"] });
  const footer = new FakeElement({ classes: ["prompt-panel-footer"] });
  const modelWrap = new FakeElement({ classes: ["img-model-wrap"] });
  const debug = new FakeElement({ classes: ["debug-wrench-btn"] });
  const promptEl = new FakeElement({ classes: ["prompt-textarea"], textContent: "hello" });

  root.appendChild(promptEl);
  root.appendChild(footer);
  footer.appendChild(modelWrap);
  footer.appendChild(debug);

  return { root, footer, modelWrap, debug, promptEl };
}

test("aigenText ui: common prompt button is inserted after model selector and opens picker", () => {
  const { root, footer, modelWrap, debug, promptEl } = createTextUiDom();
  const pickerCalls = [];
  const node = {
    nodeId: "node-text-ui",
    _data: { id: "node-text-ui" },
    _root: root,
    promptEl,
  };

  bindTextCommonPromptAndDebugControls(node, null, null, {
    openPromptPresetPicker(options) {
      pickerCalls.push(options);
    },
    isDebugModeEnabled: () => false,
  });

  const commonButton = footer.querySelector(".common-prompt-btn");
  assert.ok(commonButton);
  assert.equal(commonButton.textContent, COMMON_PROMPT_DEFAULT_LABEL);
  assert.equal(footer.children.indexOf(commonButton), footer.children.indexOf(modelWrap) + 1);
  assert.equal(debug.style.display, "none");

  commonButton.dispatch("click");

  assert.equal(pickerCalls.length, 1);
  assert.equal(pickerCalls[0].promptEl, promptEl);
  assert.equal(pickerCalls[0].nodeType, "ai-text");
  assert.equal(pickerCalls[0].commonPromptButtonEl, commonButton);
});

test("aigenText ui: debug wrench remains visible in debug mode", () => {
  const { root, debug, promptEl } = createTextUiDom();

  bindTextCommonPromptAndDebugControls(
    {
      nodeId: "node-text-ui-debug",
      _data: { id: "node-text-ui-debug" },
      _root: root,
      promptEl,
    },
    null,
    null,
    {
      isDebugModeEnabled: () => true,
    },
  );

  assert.equal(debug.style.display, "");
});
