import test from "node:test";
import assert from "node:assert/strict";

import { renderMessages } from "./appAssistantPanel.js";
import { createVimaxRenderCard, updateInteractionCardStatus } from "../assistant/assistantInteractionCards.js";

// Slice 3: a vimax_render card renders as a backgroundable 傻卡 (dumb status
// bar) — title + lifecycle status pill + 已出 N/总 帧 progress + summary. No
// god-card toggle, no confirm/cancel buttons (cancel is the send-button ⏹,
// slice 0). data-card-type / data-status drive the 吸附区 styling (slice 6).

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.hidden = false;
    this.listeners = new Map();
    this.attributes = {};
    this.dataset = {};
    this._textContent = "";
  }
  appendChild(child) { child.remove?.(); child.parentElement = this; this.children.push(child); return child; }
  remove() { if (!this.parentElement) return; const list = this.parentElement.children; const i = list.indexOf(this); if (i >= 0) list.splice(i, 1); this.parentElement = null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === "class") this.className = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  set textContent(value) { this._textContent = String(value || ""); }
  get textContent() { return [this._textContent, ...this.children.map((c) => c.textContent || "")].join(""); }
  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const visit = (node) => {
      for (const child of node.children) {
        if (className && String(child.className || "").split(/\s+/).includes(className)) return child;
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    return visit(this);
  }
}
function createFakeDocument() {
  return { createElement: (tag) => new FakeElement(tag) };
}
function renderCardEl(card) {
  const doc = createFakeDocument();
  const messagesEl = new FakeElement("div");
  renderMessages(doc, messagesEl, [{ role: "assistant", content: "", kind: "vimax_render", cards: [card] }]);
  return messagesEl.querySelector(".hy-canvas-agent-card");
}

test("a running render card renders as a background 傻卡 with 已出 N/总 progress and no buttons", () => {
  let card = createVimaxRenderCard({ flowId: "f1", shotCount: 3 });
  card = updateInteractionCardStatus(card, { landedCount: 1, summary: "出图中：drawing(已出 1 帧)" });
  const el = renderCardEl(card);

  assert.ok(el, "the render card is rendered");
  assert.equal(el.getAttribute("data-card-type"), "vimax_render");
  assert.equal(el.getAttribute("data-status"), "running");
  assert.ok(String(el.className).includes("hy-canvas-agent-card-background"), "marked background for the 吸附区");
  assert.match(el.textContent, /成片渲染/, "shows the title");
  assert.match(el.textContent, /出图中/, "shows the running summary");
  assert.match(el.textContent, /1\/3/, "shows landed/total frame progress");
  // 傻卡: no confirm / cancel / toggle controls.
  assert.equal(el.querySelector(".hy-canvas-agent-card-confirm"), null, "no confirm button");
  assert.equal(el.querySelector(".hy-canvas-agent-card-cancel"), null, "no cancel button");
});

test("terminal render cards (completed / cancelled / failed) show the terminal status + label", () => {
  for (const [status, label] of [["completed", "收工"], ["cancelled", "取消"], ["failed", "失败"]]) {
    let card = createVimaxRenderCard({ flowId: "f1", shotCount: 2 });
    card = updateInteractionCardStatus(card, { status, summary: `状态-${status}` });
    const el = renderCardEl(card);
    assert.equal(el.getAttribute("data-status"), status, `data-status is ${status}`);
    assert.ok(el.querySelector(".hy-canvas-agent-card-render-status"), `${status}: has a status pill`);
    assert.match(el.textContent, new RegExp(label), `${status}: shows the ${label} label`);
  }
});
