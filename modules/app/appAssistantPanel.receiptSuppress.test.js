import test from "node:test";
import assert from "node:assert/strict";

import { createAppAssistantPanel } from "./appAssistantPanel.js";

// Slice 6 (minimal/reversible scope, user-chosen): now that the render living
// card (slice 2) shows the 收工条/进度 inline, the redundant green receipt bar
// above the input is suppressed WHEN a render card already shows that exact
// text. Card-less flows (errors, model-config warnings) and transient notices
// still surface in the bar — and state.lastReceipt is untouched (other
// consumers + the card itself rely on it). The execution drawer (legacy
// assistant-execution surface, ~288 p1Ui refs) is deliberately NOT touched here.

class FakeClassList {
  constructor() { this.items = new Set(); }
  add(...names) { names.filter(Boolean).forEach((n) => this.items.add(n)); }
  remove(...names) { names.forEach((n) => this.items.delete(n)); }
  contains(name) { return this.items.has(name); }
  toggle(name, force) {
    const has = this.items.has(name);
    const want = force === undefined ? !has : force;
    if (want) this.items.add(name); else this.items.delete(name);
    return want;
  }
}
class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.attributes = {};
    this.dataset = {};
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
    this.type = "";
    this._textContent = "";
    this.scrollTop = 0;
    this.clientHeight = 120;
    this._scrollHeight = null;
  }
  set className(value) { this.classList = new FakeClassList(); String(value || "").split(/\s+/).filter(Boolean).forEach((n) => this.classList.add(n)); }
  get className() { return Array.from(this.classList.items).join(" "); }
  set id(value) { this.attributes.id = String(value || ""); }
  get id() { return this.attributes.id || ""; }
  set textContent(value) { this._textContent = String(value ?? ""); this.children = []; }
  get textContent() { return [this._textContent, ...this.children.map((c) => c.textContent || "")].filter(Boolean).join(""); }
  set scrollHeight(value) { this._scrollHeight = Number(value) || 0; }
  get scrollHeight() { return this._scrollHeight !== null ? this._scrollHeight : Math.max(this.clientHeight, (this.children.length || 1) * 64); }
  appendChild(child) { child.remove?.(); child.parentElement = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children.forEach((c) => { c.parentElement = null; }); this.children = []; children.forEach((c) => this.appendChild(c)); }
  remove() { if (!this.parentElement) return; const sib = this.parentElement.children; const i = sib.indexOf(this); if (i >= 0) sib.splice(i, 1); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "class") this.className = value; if (name === "id") this.id = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
  removeEventListener() {}
  dispatchEvent(event) {
    const payload = { preventDefault() {}, stopPropagation() {}, ...event, target: event?.target || this, currentTarget: this };
    for (const l of this.listeners.get(payload.type) || []) l(payload);
    return true;
  }
  click() { this.dispatchEvent({ type: "click" }); }
  focus() {}
  matches(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const attr = selector.match(/^\.([^\[]+)\[([^=]+)='([^']+)'\]$/);
    if (attr) return this.classList.contains(attr[1]) && this.getAttribute(attr[2]) === attr[3];
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const out = [];
    const visit = (node) => { for (const c of node.children || []) { if (c.matches?.(selector)) out.push(c); visit(c); } };
    visit(this);
    return out;
  }
}
function createFakeDocument() {
  const body = new FakeElement("body");
  const head = new FakeElement("head");
  return {
    body, head, readyState: "complete",
    createElement(tag) { return new FakeElement(tag); },
    createElementNS(_ns, tag) { return new FakeElement(tag); },
    getElementById(id) { return body.querySelector(`#${id}`) || head.querySelector(`#${id}`) || null; },
    querySelector(selector) { return body.querySelector(selector) || head.querySelector(selector); },
    addEventListener() {},
  };
}
function prepNode(id, flowId, shotIdx) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "prep", vimaxShotIdx: shotIdx } };
}

test("slice 6: render 收工条 shows in the living card, not duplicated in the green receipt bar", async () => {
  const document = createFakeDocument();
  const graphStore = {
    nodes: [prepNode("p0", "f1", 0), prepNode("p1", "f1", 1)],
    updateNodeData() {},
    subscribe() { return () => {}; },
  };
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return { success: true, status: "done", progress: [], progressTotal: 0,
        result: { outputs: [{ shotIdx: 0, url: "https://g/0.png" }, { shotIdx: 1, url: "https://g/1.png" }], elapsedSec: 2 } };
    },
  };
  const panel = createAppAssistantPanel({ document, api, graphStore });
  panel.init();
  panel.open();
  panel.state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  await panel.send("确认成片");
  await panel.flush();

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  assert.equal(card?.getAttribute("data-card-type"), "vimax_render", "a render living card is rendered");
  assert.match(card?.textContent || "", /收工/, "the living card shows the 收工条");

  const receipt = panel.root.querySelector(".hy-canvas-agent-receipt");
  assert.equal(receipt.hidden, true, "the green receipt bar is suppressed (no duplicate of the card)");
  assert.equal(receipt.textContent, "", "receipt bar text is empty");

  assert.match(panel.state.lastReceipt, /收工/, "state.lastReceipt value is preserved for other consumers");
});
