import test from "node:test";
import assert from "node:assert/strict";

import { renderMessages } from "./appAssistantPanel.js";
import { INTERACTION_CARD_STATUSES } from "../assistant/assistantInteractionCards.js";

// Slice 5 (doc 23 §3.3, C3 收口): the status→render mapping must be COMPLETE —
// every status in the authoritative INTERACTION_CARD_STATUSES set must render a
// card without throwing and must get a real label (never "状态未知"). This is the
// "状态表" as a verified invariant / drift-guard: it fails the moment someone adds
// a status to the set without teaching cardStatusText about it — which is exactly
// how the C3 收口 feared pending/needs_clarification/archived would silently
// degrade. We KEEP the existing type-then-status if-chain (it has a default body
// + a labelled fallback) rather than risk a cosmetic reducer/RENDERERS-map
// refactor of the core renderer that ~135 p1Ui tests depend on.

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
  addEventListener() {}
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
const doc = { createElement: (tag) => new FakeElement(tag) };

test("every INTERACTION_CARD_STATUSES value renders a canvas_actions card without throwing or '状态未知'", () => {
  for (const status of INTERACTION_CARD_STATUSES) {
    const card = {
      id: `c-${status}`, type: "canvas_actions", status, title: "标题", summary: "摘要",
      requiresConfirmation: false, expanded: false, options: [], steps: [], actions: [],
      operation: { nodeIds: [], status }, executionDetails: { traces: [], receipts: [], warnings: [] },
    };
    const messagesEl = new FakeElement("div");
    assert.doesNotThrow(
      () => renderMessages(doc, messagesEl, [{ role: "assistant", content: "", cards: [card] }]),
      `status "${status}" must render without throwing`
    );
    const el = messagesEl.querySelector(".hy-canvas-agent-card");
    assert.ok(el, `status "${status}": a card element is produced`);
    assert.equal(el.getAttribute("data-status"), status, `status "${status}": data-status hook set`);
    assert.ok(
      !el.textContent.includes("状态未知"),
      `status "${status}": must map to a real label (cardStatusText is missing it)`
    );
  }
});
