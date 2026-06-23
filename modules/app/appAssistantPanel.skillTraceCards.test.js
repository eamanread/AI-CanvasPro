import test from "node:test";
import assert from "node:assert/strict";

import { createAppAssistantPanel } from "./appAssistantPanel.js";

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
  get textContent() { return [this._textContent, ...this.children.map((child) => child.textContent || "")].join(""); }
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
  const body = new FakeElement("body");
  const head = new FakeElement("head");
  return { body, head, createElement: (tag) => new FakeElement(tag), addEventListener() {}, readyState: "complete" };
}

test("appAssistantPanel: renders skill_trace card under assistant reply", async () => {
  const document = createFakeDocument();
  const panel = createAppAssistantPanel({
    document,
    modelConfigRequired: false,
    api: {
      async chat() {
        return {
          reply: "已完成",
          actions: [],
          cards: [{ type: "skill_trace", traceId: "trace-1", title: "创建图片节点", summary: "使用 Image Model A" }],
        };
      },
    },
  });

  panel.init();
  await panel.send("生成图片");
  await panel.flush();

  const card = panel.root.querySelector(".hy-canvas-agent-card");
  assert.ok(card);
  assert.equal(card.getAttribute("data-card-type"), "skill_trace");
  assert.match(card.textContent, /创建图片节点|Image Model A/);
});
