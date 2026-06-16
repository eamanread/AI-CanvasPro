import assert from "node:assert/strict";
import test from "node:test";
import store from "../src/core/stores/appStore.js";
import { PROMPT_PRESET_PILL_SELECTOR } from "./promptPresetPillRuntime.js";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

class TestClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  _sync() {
    this.element._className = Array.from(this.values).join(" ");
  }

  setFromString(value) {
    this.values = new Set(String(value || "").split(/\s+/).filter(Boolean));
    this._sync();
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.add(token));
    this._sync();
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
    this._sync();
  }

  contains(token) {
    return this.values.has(token);
  }

  toggle(token, force) {
    const shouldAdd = force === undefined ? !this.values.has(token) : Boolean(force);
    if (shouldAdd) {
      this.values.add(token);
    } else {
      this.values.delete(token);
    }
    this._sync();
    return shouldAdd;
  }
}

class TestNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.childNodes.forEach((child) => {
      child.parentNode = null;
    });
    this.childNodes = [];
    children.forEach((child) => this.appendChild(child));
  }

  contains(target) {
    if (target === this) {
      return true;
    }
    return this.childNodes.some((child) => child.contains?.(target));
  }

  get textContent() {
    return this.childNodes.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this.replaceChildren(new TestTextNode(value));
  }
}

class TestTextNode extends TestNode {
  constructor(text) {
    super(TEXT_NODE);
    this._text = String(text || "");
  }

  contains(target) {
    return target === this;
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value || "");
  }
}

class TestElement extends TestNode {
  constructor(tagName, ownerDocument) {
    super(ELEMENT_NODE);
    this.tagName = String(tagName || "div").toUpperCase();
    this.ownerDocument = ownerDocument;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.attributes = {};
    this.classList = new TestClassList(this);
    this._className = "";
    this._id = "";
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || "");
    if (this.ownerDocument && this._id) {
      this.ownerDocument._ids.set(this._id, this);
    }
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get children() {
    return this.childNodes.filter((child) => child.nodeType === ELEMENT_NODE);
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get innerHTML() {
    return this.textContent;
  }

  set innerHTML(value) {
    this.textContent = value;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") {
      this.id = value;
    }
    if (name === "class") {
      this.className = value;
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((candidate) => candidate !== handler),
    );
  }

  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler(event);
      if (event.cancelBubble) {
        return !event.defaultPrevented;
      }
    }
    if (event.bubbles && this.parentNode && !event.cancelBubble) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }

  matches(selector) {
    if (selector === ":hover") {
      return false;
    }
    if (selector.startsWith(".")) {
      return this.classList.contains(selector.slice(1));
    }
    const attrMatch = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
    if (attrMatch) {
      const [, rawName, rawValue] = attrMatch;
      const actual = readAttributeSelectorValue(this, rawName);
      return rawValue == null ? actual != null : actual === rawValue;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches?.(selector)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
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

  scrollIntoView() {}

  getBoundingClientRect() {
    return {
      top: 100,
      left: 100,
      right: 420,
      bottom: 154,
      width: 320,
      height: 54,
    };
  }

  get offsetHeight() {
    return Number(this.style.height) || 280;
  }
}

class TestRange {
  constructor() {
    this.startContainer = null;
    this.startOffset = 0;
    this.endContainer = null;
    this.endOffset = 0;
    this.collapsed = true;
    this.contentsRoot = null;
  }

  setStart(node, offset) {
    this.startContainer = node;
    this.startOffset = offset;
    this.collapsed = this.startContainer === this.endContainer && this.startOffset === this.endOffset;
  }

  setEnd(node, offset) {
    this.endContainer = node;
    this.endOffset = offset;
    this.collapsed = this.startContainer === this.endContainer && this.startOffset === this.endOffset;
  }

  selectNodeContents(root) {
    this.contentsRoot = root;
    const firstText = collectTextNodes(root)[0] || null;
    this.startContainer = firstText;
    this.startOffset = 0;
    this.endContainer = firstText;
    this.endOffset = firstText?.textContent.length || 0;
    this.collapsed = false;
  }

  cloneRange() {
    const clone = new TestRange();
    clone.startContainer = this.startContainer;
    clone.startOffset = this.startOffset;
    clone.endContainer = this.endContainer;
    clone.endOffset = this.endOffset;
    clone.collapsed = this.collapsed;
    clone.contentsRoot = this.contentsRoot;
    return clone;
  }

  toString() {
    if (this.startContainer && this.startContainer === this.endContainer) {
      return this.startContainer.textContent.slice(this.startOffset, this.endOffset);
    }
    if (this.contentsRoot && this.endContainer) {
      return this.contentsRoot.textContent.slice(0, this.endOffset);
    }
    return "";
  }

  deleteContents() {
    if (!this.startContainer || this.startContainer !== this.endContainer) {
      return;
    }
    const text = this.startContainer.textContent;
    this.startContainer.textContent = `${text.slice(0, this.startOffset)}${text.slice(this.endOffset)}`;
    this.endOffset = this.startOffset;
    this.collapsed = true;
  }
}

class TestDocument extends TestElement {
  constructor() {
    super("#document", null);
    this.ownerDocument = this;
    this._ids = new Map();
    this.body = new TestElement("body", this);
    this.appendChild(this.body);
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  createTextNode(text) {
    return new TestTextNode(text);
  }

  createRange() {
    return new TestRange();
  }

  createTreeWalker(root, whatToShow) {
    const nodes = whatToShow === globalThis.NodeFilter.SHOW_TEXT ? collectTextNodes(root) : [];
    let index = 0;
    return {
      nextNode() {
        return nodes[index++] || null;
      },
    };
  }

  getElementById(id) {
    return this._ids.get(id) || null;
  }
}

class TestEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.defaultPrevented = false;
    this.cancelBubble = false;
    this.target = options.target || null;
    this.key = options.key || "";
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.cancelBubble = true;
  }
}

function readAttributeSelectorValue(element, name) {
  if (name.startsWith("data-")) {
    const key = name
      .slice(5)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return element.dataset[key] ?? null;
  }
  return element.getAttribute(name);
}

function collectTextNodes(root) {
  const nodes = [];
  const visit = (node) => {
    if (node.nodeType === TEXT_NODE) {
      nodes.push(node);
      return;
    }
    node.childNodes?.forEach(visit);
  };
  visit(root);
  return nodes;
}

function makeJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return "application/json";
      },
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function setupSlashMenuTest({ nodeType, definitions, promptText = "/", commonPromptButtonEl = null }) {
  const document = new TestDocument();
  const promptEl = document.createElement("div");
  promptEl.id = "prompt";
  promptEl.appendChild(document.createTextNode(promptText));
  document.body.appendChild(promptEl);

  const selectionRange = document.createRange();
  const textNode = collectTextNodes(promptEl)[0];
  selectionRange.setStart(textNode, promptText.length);
  selectionRange.setEnd(textNode, promptText.length);

  const selection = {
    rangeCount: 1,
    range: selectionRange,
    getRangeAt() {
      return this.range;
    },
    removeAllRanges() {
      this.rangeCount = 0;
    },
    addRange(range) {
      this.range = range;
      this.rangeCount = 1;
    },
  };

  const managerCalls = [];
  const originalGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
    MouseEvent: globalThis.MouseEvent,
    fetch: globalThis.fetch,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    BroadcastChannel: globalThis.BroadcastChannel,
  };

  globalThis.BroadcastChannel = undefined;
  globalThis.document = document;
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    screen: { width: 1280, height: 720 },
    getSelection() {
      return selection;
    },
    open(url, name, features) {
      managerCalls.push({ url, name, features });
      return {
        focus() {
          managerCalls.push({ focus: true });
        },
      };
    },
    addEventListener() {},
    removeEventListener() {},
    showToast() {},
  };
  globalThis.Node = { ELEMENT_NODE };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.MouseEvent = TestEvent;
  globalThis.requestAnimationFrame = (callback) => {
    callback();
    return 1;
  };

  globalThis.fetch = async (url) => {
    if (String(url) === "/api/v2/user/presets/definitions") {
      return makeJsonResponse(definitions);
    }
    if (String(url) === "/api/v2/user/presets") {
      return makeJsonResponse({ "ai-image": [], "ai-text": [], "ai-video": [], "ai-audio": [] });
    }
    throw new Error(`unexpected fetch url: ${String(url)}`);
  };

  const storeUpdates = [];
  const originalUpdateNodeData = store.updateNodeData;
  store.updateNodeData = (id, patch) => {
    storeUpdates.push({ id, patch });
  };

  const promptPresets = await import("./promptPresets.js");
  await promptPresets.loadCustomPresets();
  const slashMenu = await import(`./slashMenu.js?slash=${Date.now()}-${Math.random()}`);
  const generated = [];
  const selectedPresets = [];

  slashMenu.checkSlashTrigger(
    { inputType: "insertText" },
    {
      promptEl,
      nodeType,
      nodeId: "node-1",
      commonPromptButtonEl,
      onGenerate(template) {
        generated.push(template);
      },
      onPresetSelected(preset) {
        selectedPresets.push(preset);
      },
    },
  );

  return {
    document,
    generated,
    managerCalls,
    promptEl,
    selectedPresets,
    slashMenu,
    storeUpdates,
    cleanup() {
      slashMenu.closeSlashMenu();
      store.updateNodeData = originalUpdateNodeData;
      globalThis.document = originalGlobals.document;
      globalThis.window = originalGlobals.window;
      globalThis.Node = originalGlobals.Node;
      globalThis.NodeFilter = originalGlobals.NodeFilter;
      globalThis.MouseEvent = originalGlobals.MouseEvent;
      globalThis.fetch = originalGlobals.fetch;
      globalThis.requestAnimationFrame = originalGlobals.requestAnimationFrame;
      globalThis.BroadcastChannel = originalGlobals.BroadcastChannel;
    },
  };
}

function dispatchMouseDown(element) {
  element.dispatchEvent(new TestEvent("mousedown", { bubbles: true }));
}

function makeDefinitions(nodeType, items) {
  return {
    "ai-image": [],
    "ai-text": [],
    "ai-video": [],
    "ai-audio": [],
    [nodeType]: items,
  };
}

test("slashMenu: mouse selection of a second-level preset inserts a preset pill without generating", async () => {
  const document = new TestDocument();
  const commonButton = document.createElement("button");
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Group",
        desc: "Grouped presets",
        subItems: [{ title: "Child", template: "child-template" }],
      },
    ]),
    commonPromptButtonEl: commonButton,
  });

  try {
    const child = testContext.document.querySelector('[data-action="select-child"]');
    assert.ok(child);

    dispatchMouseDown(child);
    await new Promise((resolve) => setTimeout(resolve, 60));

    const pill = testContext.promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR);
    assert.ok(pill);
    assert.equal(pill.textContent, "Child");
    assert.equal(pill.getAttribute("data-prompt-preset-template"), null);
    assert.equal(commonButton.textContent, "Child");
    assert.equal(testContext.slashMenu.getSlashMenu().classList.contains("open"), false);
    assert.equal(testContext.generated.length, 0);
    assert.deepEqual(testContext.selectedPresets.map((preset) => preset.title), ["Child"]);
    assert.deepEqual(testContext.storeUpdates.at(-1).patch.promptPresetSelection, {
      title: "Child",
      template: "child-template",
    });
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: mouse selection of a top-level leaf removes only the slash trigger and inserts a pill", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    promptText: "draft /",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Leaf",
        desc: "Top-level leaf preset",
        template: "leaf-template",
      },
    ]),
  });

  try {
    const leaf = testContext.document.querySelector('[data-action="select-leaf"]');
    assert.ok(leaf);

    dispatchMouseDown(leaf);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(testContext.promptEl.textContent, "draft Leaf");
    assert.equal(testContext.promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR).textContent, "Leaf");
    assert.equal(testContext.generated.length, 0);
    assert.deepEqual(testContext.storeUpdates.at(-1).patch.promptPresetSelection, {
      title: "Leaf",
      template: "leaf-template",
    });
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: clicking a group opens submenu and does not generate", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-text",
    definitions: makeDefinitions("ai-text", [
      {
        title: "Text Group",
        desc: "Grouped text presets",
        subItems: [{ title: "Child", template: "text-child-template" }],
      },
    ]),
  });

  try {
    const group = testContext.document.querySelector('[data-action="open-group"]');
    assert.ok(group);

    dispatchMouseDown(group);

    assert.equal(testContext.generated.length, 0);
    assert.equal(group.classList.contains("active"), true);
    assert.equal(testContext.document.querySelectorAll('[data-slash-role="child-item"]').length, 1);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: empty system group is shown as a top-level item without submenu", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Empty Group",
        desc: "No children yet",
        subItems: [],
      },
    ]),
  });

  try {
    const emptyGroup = testContext.document.querySelector('[data-action="empty-group"]');
    assert.ok(emptyGroup);
    assert.equal(testContext.document.querySelectorAll(".preset-slash-submenu").length, 0);

    dispatchMouseDown(emptyGroup);
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(testContext.generated.length, 0);
    assert.equal(testContext.slashMenu.getSlashMenu().classList.contains("open"), true);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: custom entry opens manager for the active node type", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-text",
    definitions: makeDefinitions("ai-text", [{ title: "Leaf", template: "leaf-template" }]),
  });

  try {
    const custom = testContext.document.querySelector('[data-action="open-custom-manager"]');
    assert.ok(custom);

    dispatchMouseDown(custom);

    assert.equal(testContext.generated.length, 0);
    assert.equal(testContext.promptEl.textContent, "");
    assert.equal(testContext.managerCalls[0].url, "/dev/preset-manager.html?nodeType=ai-text");
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: custom manager entry uses the Chinese preset manager name", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [{ title: "Leaf", template: "leaf-template" }]),
  });

  try {
    const custom = testContext.document.querySelector('[data-action="open-custom-manager"]');
    assert.ok(custom);
    assert.match(custom.textContent, /外部 Web 预设管理器/);
    assert.match(custom.textContent, /编辑或创建当前节点预设/);
    assert.doesNotMatch(custom.textContent, /Custom presets|Edit or create presets/);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: top-level menu scrolls after three visible rows", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      { title: "Leaf 1", template: "one" },
      { title: "Leaf 2", template: "two" },
      { title: "Leaf 3", template: "three" },
      { title: "Leaf 4", template: "four" },
    ]),
  });

  try {
    const scrollRegion = testContext.document.querySelector('[data-slash-role="top-scroll"]');
    assert.ok(scrollRegion);
    assert.equal(scrollRegion.style.overflowY, "auto");
    assert.equal(scrollRegion.style.maxHeight, "198px");
    assert.equal(testContext.document.querySelectorAll("[data-slash-role='top-item']").length, 4);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: second-level submenu scrolls after three visible rows", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Grid",
        subItems: [
          { title: "4 Grid", template: "four" },
          { title: "9 Grid", template: "nine" },
          { title: "16 Grid", template: "sixteen" },
          { title: "25 Grid", template: "twenty-five" },
        ],
      },
    ]),
  });

  try {
    const group = testContext.document.querySelector('[data-action="open-group"]');
    assert.ok(group);

    dispatchMouseDown(group);

    const submenu = testContext.document.querySelector(".preset-slash-submenu");
    assert.ok(submenu);
    assert.equal(submenu.style.overflowY, "auto");
    assert.equal(submenu.style.maxHeight, "198px");
    assert.equal(submenu.style.gap, "4px");
    assert.equal(
      testContext.document.querySelector("[data-slash-role='child-item']").style.minHeight,
      "64px",
    );
    assert.equal(testContext.document.querySelectorAll("[data-slash-role='child-item']").length, 4);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: submenu child without desc does not render the full template preview", async () => {
  const longTemplate = "long prompt ".repeat(80);
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Scene Group",
        subItems: [{ title: "Scene Child", template: longTemplate }],
      },
    ]),
  });

  try {
    const group = testContext.document.querySelector('[data-action="open-group"]');
    assert.ok(group);

    dispatchMouseDown(group);

    const submenu = testContext.document.querySelector(".preset-slash-submenu");
    const child = testContext.document.querySelector('[data-action="select-child"]');
    const desc = child?.querySelector(".preset-slash-desc");

    assert.ok(submenu);
    assert.ok(desc);
    assert.equal(submenu.style.width, "280px");
    assert.equal(desc.textContent, "");
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: keyboard opens a group and selects a second-level preset", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    definitions: makeDefinitions("ai-image", [
      {
        title: "Group",
        desc: "Grouped presets",
        subItems: [{ title: "First Child", template: "first-child-template" }],
      },
    ]),
  });

  try {
    let prevented = 0;
    const preventDefault = () => {
      prevented += 1;
    };

    const opened = testContext.slashMenu.handleSlashKeyboardNavigation({
      key: "ArrowRight",
      preventDefault,
    });
    const selected = testContext.slashMenu.handleSlashKeyboardNavigation({
      key: "Enter",
      preventDefault,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(opened, true);
    assert.equal(selected, true);
    assert.equal(prevented, 2);
    assert.deepEqual(testContext.generated, []);
    assert.equal(testContext.promptEl.querySelector(PROMPT_PRESET_PILL_SELECTOR).textContent, "First Child");
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: openPromptPresetPicker shows preset list without custom manager", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-text",
    definitions: makeDefinitions("ai-text", [{ title: "Leaf", template: "leaf-template" }]),
  });

  try {
    testContext.slashMenu.closeSlashMenu();
    testContext.slashMenu.openPromptPresetPicker({
      promptEl: testContext.promptEl,
      nodeType: "ai-text",
      nodeId: "node-1",
    });

    assert.ok(testContext.document.querySelector('[data-action="select-leaf"]'));
    assert.equal(testContext.document.querySelector('[data-action="open-custom-manager"]'), null);
  } finally {
    testContext.cleanup();
  }
});

test("slashMenu: applyPromptPresetToPromptEl supports agent direct preset execution", async () => {
  const testContext = await setupSlashMenuTest({
    nodeType: "ai-image",
    promptText: "draft /",
    definitions: makeDefinitions("ai-image", [{ title: "Leaf", template: "leaf-template" }]),
  });

  try {
    testContext.generated.length = 0;
    testContext.storeUpdates.length = 0;

    const applied = testContext.slashMenu.applyPromptPresetToPromptEl(
      "agent-template",
      {
        promptEl: testContext.promptEl,
        nodeId: "node-1",
        nodeType: "ai-image",
        onGenerate(template) {
          testContext.generated.push(template);
        },
      },
      { delayMs: 0 },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    assert.equal(applied, true);
    assert.equal(testContext.promptEl.textContent, "draft ");
    assert.deepEqual(testContext.storeUpdates, [{ id: "node-1", patch: { prompt: "draft " } }]);
    assert.deepEqual(testContext.generated, ["agent-template"]);
  } finally {
    testContext.cleanup();
  }
});
