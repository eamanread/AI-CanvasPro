import test from "node:test";
import assert from "node:assert/strict";

import { initSubscriptionCdkeyVisibility } from "./subscriptionCdkeyVisibility.js";

function createElement(tagName, { id = "", type = "", textContent = "" } = {}) {
  const listeners = new Map();
  const attributes = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    id,
    type,
    textContent,
    title: "",
    disabled: false,
    hidden: false,
    classList: {
      values: new Set(),
      toggle(name, force) {
        const shouldHave = force === undefined ? !this.values.has(name) : Boolean(force);
        if (shouldHave) this.values.add(name);
        else this.values.delete(name);
      },
      contains(name) {
        return this.values.has(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || "";
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    click() {
      listeners.get("click")?.({ preventDefault() {} });
    },
  };
  return element;
}

test("subscription CDKEY input is hidden by default and can be toggled visible", () => {
  const input = createElement("input", { id: "subscriptionCdkeyInput", type: "text" });
  const toggle = createElement("button", { id: "subscriptionCdkeyVisibilityToggle", textContent: "" });
  const documentLike = {
    getElementById(id) {
      return id === input.id ? input : id === toggle.id ? toggle : null;
    },
  };

  const initialized = initSubscriptionCdkeyVisibility({ document: documentLike });

  assert.equal(initialized, true);
  assert.equal(input.type, "password");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.match(toggle.title, /显示/);

  toggle.click();

  assert.equal(input.type, "text");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.match(toggle.title, /隐藏/);

  toggle.click();

  assert.equal(input.type, "password");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
});
