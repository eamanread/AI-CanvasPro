import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMON_PROMPT_DEFAULT_LABEL,
  PROMPT_PRESET_PILL_SELECTOR,
  applyPromptPresetSelection,
  clearPromptPresetSelection,
  getPromptTextWithPresetSelection,
  handlePromptPresetPillKeyboard,
  syncCommonPromptButtonLabel,
} from "./promptPresetPillRuntime.js";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

class TestClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  setFromString(value) {
    this.values = new Set(String(value || "").split(/\s+/).filter(Boolean));
    this.element._className = Array.from(this.values).join(" ");
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.add(token));
    this.element._className = Array.from(this.values).join(" ");
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
    this.element._className = Array.from(this.values).join(" ");
  }

  contains(token) {
    return this.values.has(token);
  }
}

class TestNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, reference) {
    if (!reference) {
      return this.appendChild(child);
    }
    const index = this.childNodes.indexOf(reference);
    if (index < 0) {
      return this.appendChild(child);
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    this.parentNode?.removeChild?.(this);
  }

  replaceChildren(...children) {
    this.childNodes.forEach((child) => {
      child.parentNode = null;
    });
    this.childNodes = [];
    children.forEach((child) => this.appendChild(child));
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.replaceChildren(new TestTextNode(value));
  }

  cloneNode(deep = false) {
    const clone = new TestNode(this.nodeType);
    if (deep) {
      this.childNodes.forEach((child) => clone.appendChild(child.cloneNode(true)));
    }
    return clone;
  }
}

class TestTextNode extends TestNode {
  constructor(text) {
    super(TEXT_NODE);
    this._text = String(text || "");
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value || "");
  }

  cloneNode() {
    return new TestTextNode(this._text);
  }
}

class TestElement extends TestNode {
  constructor(tagName, ownerDocument) {
    super(ELEMENT_NODE);
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.dataset = {};
    this.attributes = {};
    this.classList = new TestClassList(this);
    this._className = "";
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get innerHTML() {
    return this.childNodes.map((child) => child.outerHTML || child.textContent || "").join("");
  }

  set innerHTML(value) {
    this.textContent = value;
  }

  get outerHTML() {
    const attrs = [];
    if (this.className) {
      attrs.push(`class="${this.className}"`);
    }
    Object.entries(this.attributes).forEach(([name, value]) => {
      if (name !== "class") {
        attrs.push(`${name}="${value}"`);
      }
    });
    Object.entries(this.dataset).forEach(([key, value]) => {
      const attrName = `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
      if (!this.attributes[attrName]) {
        attrs.push(`${attrName}="${value}"`);
      }
    });
    const attrText = attrs.length ? ` ${attrs.join(" ")}` : "";
    return `<${this.tagName.toLowerCase()}${attrText}>${this.innerHTML}</${this.tagName.toLowerCase()}>`;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.className = value;
    }
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name) {
    if (name.startsWith("data-")) {
      const key = name
        .slice(5)
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] ?? null;
    }
    return this.attributes[name] ?? null;
  }

  hasAttribute(name) {
    return this.getAttribute(name) != null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === ELEMENT_NODE) {
          if (child.matches(selector)) {
            result.push(child);
          }
          visit(child);
        }
      });
    };
    visit(this);
    return result;
  }

  cloneNode(deep = false) {
    const clone = new TestElement(this.tagName.toLowerCase(), this.ownerDocument);
    clone.className = this.className;
    clone.attributes = { ...this.attributes };
    clone.dataset = { ...this.dataset };
    if (deep) {
      this.childNodes.forEach((child) => clone.appendChild(child.cloneNode(true)));
    }
    return clone;
  }
}

class TestDocument {
  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  createTextNode(text) {
    return new TestTextNode(text);
  }
}

class TestRange {
  constructor(promptEl) {
    this.promptEl = promptEl;
    this.deleted = false;
  }

  deleteContents() {
    this.deleted = true;
    if (this.promptEl.textContent.endsWith("/")) {
      this.promptEl.textContent = this.promptEl.textContent.slice(0, -1);
    }
  }
}

function createPrompt(text = "") {
  const document = new TestDocument();
  const promptEl = document.createElement("div");
  promptEl.appendChild(document.createTextNode(text));
  return { document, promptEl };
}

function createStore() {
  const updates = [];
  return {
    updates,
    updateNodeData(id, patch) {
      updates.push({ id, patch });
    },
  };
}

test("applyPromptPresetSelection inserts title-only pill and stores full selection", () => {
  const { document, promptEl } = createPrompt("snow mountain /");
  globalThis.document = document;
  const buttonEl = document.createElement("button");
  const store = createStore();

  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store,
    buttonEl,
    triggerRange: new TestRange(promptEl),
    preset: { title: "Short title", template: "Title: {\u7528\u6237\u8f93\u5165}" },
  });

  const pill = promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR);
  assert.ok(pill);
  assert.equal(pill.textContent, "Short title");
  assert.equal(pill.getAttribute("data-prompt-preset-title"), "Short title");
  assert.equal(pill.hasAttribute("data-prompt-preset-template"), false);
  assert.equal(buttonEl.textContent, "Short title");
  assert.deepEqual(store.updates.at(-1).patch.promptPresetSelection, {
    title: "Short title",
    template: "Title: {\u7528\u6237\u8f93\u5165}",
  });
});

test("applyPromptPresetSelection replaces the previous preset pill", () => {
  const { document, promptEl } = createPrompt("coffee");
  globalThis.document = document;
  const store = createStore();

  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store,
    preset: { title: "First", template: "first {\u7528\u6237\u8f93\u5165}" },
  });
  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store,
    preset: { title: "Second", template: "second {\u7528\u6237\u8f93\u5165}" },
  });

  assert.equal(promptEl.querySelectorAll(PROMPT_PRESET_PILL_SELECTOR).length, 1);
  assert.equal(promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR).textContent, "Second");
  assert.equal(store.updates.at(-1).patch.promptPresetSelection.title, "Second");
});

test("getPromptTextWithPresetSelection resolves template only while pill exists", () => {
  const { document, promptEl } = createPrompt("desert city");
  globalThis.document = document;

  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store: createStore(),
    preset: { title: "Poster", template: "Poster: {\u7528\u6237\u8f93\u5165}" },
  });

  assert.equal(
    getPromptTextWithPresetSelection({
      promptEl,
      nodeData: { promptPresetSelection: { title: "Poster", template: "Poster: {\u7528\u6237\u8f93\u5165}" } },
    }),
    "Poster: desert city",
  );

  promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR).remove();

  assert.equal(
    getPromptTextWithPresetSelection({
      promptEl,
      nodeData: { promptPresetSelection: { title: "Poster", template: "Poster: {\u7528\u6237\u8f93\u5165}" } },
    }),
    "desert city",
  );
});

test("sync and clear reset button label and clear stale selection", () => {
  const { document, promptEl } = createPrompt("forest");
  globalThis.document = document;
  const buttonEl = document.createElement("button");
  const store = createStore();

  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store,
    buttonEl,
    preset: { title: "Scene", template: "Scene: {\u7528\u6237\u8f93\u5165}" },
  });
  promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR).remove();

  syncCommonPromptButtonLabel(promptEl, buttonEl, {
    promptPresetSelection: { title: "Scene", template: "Scene: {\u7528\u6237\u8f93\u5165}" },
  });
  assert.equal(buttonEl.textContent, COMMON_PROMPT_DEFAULT_LABEL);

  clearPromptPresetSelection({ promptEl, nodeId: "node-1", store, buttonEl });
  assert.equal(buttonEl.textContent, COMMON_PROMPT_DEFAULT_LABEL);
  assert.equal(store.updates.at(-1).patch.promptPresetSelection, null);
});

test("handlePromptPresetPillKeyboard removes the whole pill", () => {
  const { document, promptEl } = createPrompt("train station");
  globalThis.document = document;
  const buttonEl = document.createElement("button");
  const store = createStore();
  let changed = 0;

  applyPromptPresetSelection({
    promptEl,
    nodeId: "node-1",
    store,
    buttonEl,
    preset: { title: "Camera", template: "Camera: {\u7528\u6237\u8f93\u5165}" },
  });

  const event = {
    key: "Backspace",
    target: promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };

  assert.equal(
    handlePromptPresetPillKeyboard(promptEl, event, {
      nodeId: "node-1",
      store,
      buttonEl,
      onChange() {
        changed += 1;
      },
    }),
    true,
  );

  assert.equal(event.defaultPrevented, true);
  assert.equal(promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR), null);
  assert.equal(buttonEl.textContent, COMMON_PROMPT_DEFAULT_LABEL);
  assert.equal(store.updates.at(-1).patch.promptPresetSelection, null);
  assert.equal(changed, 1);
});
