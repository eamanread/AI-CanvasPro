export class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.cancelable = init.cancelable !== false;
    this.target = init.target || null;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    Object.assign(this, init);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

class TestClassList {
  constructor(owner) {
    this.owner = owner;
  }

  _values() {
    return new Set(String(this.owner.className || "").split(/\s+/).filter(Boolean));
  }

  _write(values) {
    this.owner.className = Array.from(values).join(" ");
  }

  add(...names) {
    const values = this._values();
    names.filter(Boolean).forEach((name) => values.add(String(name)));
    this._write(values);
  }

  remove(...names) {
    const values = this._values();
    names.filter(Boolean).forEach((name) => values.delete(String(name)));
    this._write(values);
  }

  contains(name) {
    return this._values().has(String(name));
  }

  toggle(name, force) {
    const values = this._values();
    const key = String(name);
    const shouldAdd = force === undefined ? !values.has(key) : Boolean(force);
    if (shouldAdd) values.add(key);
    else values.delete(key);
    this._write(values);
    return shouldAdd;
  }
}

class TestTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.parentNode = null;
    this.textContent = String(text ?? "");
  }

  remove() {
    this.parentNode?.removeChild?.(this);
  }
}

function dataKeyFromAttribute(name) {
  return String(name || "")
    .slice(5)
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function attrNameFromDataKey(key) {
  return `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function matchesSimpleSelector(element, selector) {
  const raw = String(selector || "").trim();
  if (!raw || raw === "*") return true;
  const attrMatch = raw.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attrMatch) {
    const [, attr, expected] = attrMatch;
    const actual = element.getAttribute?.(attr);
    return expected === undefined ? actual != null : actual === expected;
  }
  const tagAndClasses = raw.split(".");
  const tag = tagAndClasses[0];
  const classes = tagAndClasses.slice(tag ? 1 : 1).filter(Boolean);
  const leadingClasses = raw.startsWith(".") ? raw.slice(1).split(".").filter(Boolean) : classes;
  const requiredClasses = raw.startsWith(".") ? leadingClasses : classes;
  if (tag && tag !== element.tagName?.toLowerCase()) return false;
  return requiredClasses.every((name) => element.classList.contains(name));
}

function matchesSelector(element, selector) {
  const parts = String(selector || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  if (!matchesSimpleSelector(element, parts.at(-1))) return false;
  let ancestor = element.parentNode;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) {
      ancestor = ancestor.parentNode;
    }
    if (!ancestor) return false;
    ancestor = ancestor.parentNode;
  }
  return true;
}

export class TestElement {
  constructor(tagName = "div") {
    this.nodeType = 1;
    this.tagName = String(tagName || "div").toLowerCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = new TestClassList(this);
    this.attributes = new Map();
    this.eventListeners = new Map();
    this._textContent = "";
    this._innerHTML = "";
    this.hidden = false;
    this.checked = false;
    this.indeterminate = false;
    this.disabled = false;
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || "").join("");
  }

  set innerHTML(value) {
    this._innerHTML = String(value ?? "");
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  append(...items) {
    items.forEach((item) => this.appendChild(typeof item === "string" ? new TestTextNode(item) : item));
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode?.removeChild?.(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    if (child) child.parentNode = null;
    return child;
  }

  replaceChildren(...items) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this._textContent = "";
    this._innerHTML = "";
    this.append(...items);
  }

  remove() {
    this.parentNode?.removeChild?.(this);
  }

  setAttribute(name, value) {
    const key = String(name || "");
    const normalized = String(value ?? "");
    this.attributes.set(key, normalized);
    if (key === "class") this.className = normalized;
    if (key === "type") this.type = normalized;
    if (key === "id") this.id = normalized;
    if (key.startsWith("data-")) this.dataset[dataKeyFromAttribute(key)] = normalized;
  }

  getAttribute(name) {
    const key = String(name || "");
    if (key === "class") return this.className;
    if (key === "id") return this.id || null;
    if (key.startsWith("data-")) {
      const dataValue = this.dataset[dataKeyFromAttribute(key)];
      return dataValue == null ? null : String(dataValue);
    }
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }

  addEventListener(type, listener) {
    const key = String(type);
    if (!this.eventListeners.has(key)) this.eventListeners.set(key, []);
    this.eventListeners.get(key).push(listener);
  }

  removeEventListener(type, listener) {
    const listeners = this.eventListeners.get(String(type)) || [];
    this.eventListeners.set(
      String(type),
      listeners.filter((item) => item !== listener)
    );
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    const listeners = this.eventListeners.get(String(event.type)) || [];
    listeners.forEach((listener) => listener.call(this, event));
    const handler = this[`on${event.type}`];
    if (typeof handler === "function") handler.call(this, event);
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent(new TestEvent("click", { target: this }));
  }

  focus() {
    globalThis.document.activeElement = this;
  }

  blur() {
    this.dispatchEvent(new TestEvent("blur", { target: this }));
    if (globalThis.document?.activeElement === this) globalThis.document.activeElement = null;
  }

  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child?.contains?.(target));
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (!node || node.nodeType !== 1) return;
      if (matchesSelector(node, selector)) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

export function installDomStubs() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    CustomEvent: globalThis.CustomEvent,
  };
  const document = {
    body: new TestElement("body"),
    head: new TestElement("head"),
    activeElement: null,
    createElement: (tagName) => new TestElement(tagName),
    createElementNS: (_namespace, tagName) => new TestElement(tagName),
    createTextNode: (text) => new TestTextNode(text),
    querySelector(selector) {
      return this.body.querySelector(selector) || this.head.querySelector(selector);
    },
    querySelectorAll(selector) {
      return [...this.body.querySelectorAll(selector), ...this.head.querySelectorAll(selector)];
    },
    getElementById(id) {
      return this.querySelector(`[id="${id}"]`);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = document;
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener() {},
    removeEventListener() {},
    showToast() {},
    dispatchEvent() {},
  };
  globalThis.CustomEvent = class extends TestEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail;
    }
  };
  return () => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.CustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previous.CustomEvent;
  };
}
