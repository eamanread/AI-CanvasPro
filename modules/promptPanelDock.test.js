import test from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor(initial = []) {
    this.items = new Set(initial);
  }

  add(...names) {
    names.filter(Boolean).forEach(name => this.items.add(name));
  }

  remove(...names) {
    names.forEach(name => this.items.delete(name));
  }

  contains(name) {
    return this.items.has(name);
  }

  toggle(name, force) {
    const next = force === undefined ? !this.items.has(name) : !!force;
    if (next) this.items.add(name);
    else this.items.delete(name);
    return next;
  }
}

class FakeElement {
  constructor(classNames = [], id = '') {
    this.classList = new FakeClassList(classNames);
    this.children = [];
    this.parentElement = null;
    this.id = id;
    this.dataset = {};
    this.nodeType = 1;
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node === globalThis.document.body) return true;
      node = node.parentElement;
    }
    return false;
  }

  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  matches(selector) {
    return selector.startsWith('.') && this.classList.contains(selector.slice(1));
  }

  querySelectorAll() {
    return [];
  }
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {}

  disconnect() {}

  flush() {
    this.callback([]);
  }
}

test('docked prompt panel survives temporary host disconnects', async () => {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousObserver = globalThis.MutationObserver;

  const body = new FakeElement([]);
  const dockRoot = new FakeElement([], 'v2-wrap');
  body.appendChild(dockRoot);
  globalThis.document = {
    body,
    getElementById: id => (id === 'v2-wrap' ? dockRoot : null),
    querySelectorAll: () => [],
  };
  globalThis.Node = { ELEMENT_NODE: 1 };

  const observers = [];
  globalThis.MutationObserver = class extends FakeMutationObserver {
    constructor(callback) {
      super(callback);
      observers.push(this);
    }
  };

  try {
    const { dockPromptPanel } = await import(`./promptPanelDock.js?test=${Date.now()}`);
    const host = new FakeElement(['v2-node', 'selected'], 'node-a');
    const panel = new FakeElement(['text-prompt-panel']);
    dockRoot.appendChild(host);
    host.appendChild(panel);

    assert.equal(dockPromptPanel(panel), true);
    assert.equal(dockRoot.children.includes(panel), true);
    assert.equal(panel.classList.contains('is-visible'), true);

    host.remove();
    observers.at(-1).flush();
    assert.equal(dockRoot.children.includes(panel), true);
    assert.equal(panel.classList.contains('is-visible'), false);

    dockRoot.appendChild(host);
    observers.at(-1).flush();
    assert.equal(panel.classList.contains('is-visible'), true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    globalThis.MutationObserver = previousObserver;
  }
});
