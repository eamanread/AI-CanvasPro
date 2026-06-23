import test from "node:test";
import assert from "node:assert/strict";

import {
  removeLeadingMenuItemVisuals,
  removeLeadingModelTriggerVisuals,
  sanitizeModelMenuVisuals,
} from "./modelMenuVisualSanitizer.js";

class FakeClassList {
  constructor(initial = []) {
    this.items = new Set(initial);
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => this.items.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }

  contains(name) {
    return this.items.has(name);
  }
}

class FakeElement {
  constructor(classNames = []) {
    this.classList = new FakeClassList(classNames);
    this.children = [];
    this.parentElement = null;
    this.matchesMap = new Map();
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  matches(selector) {
    return selector
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => {
        if (!part.startsWith(".")) {
          return false;
        }
        return this.classList.contains(part.slice(1));
      });
  }

  querySelectorAll(selector) {
    return this.matchesMap.get(selector) || [];
  }
}

test("removeLeadingMenuItemVisuals removes only the leading icon before content", () => {
  const item = new FakeElement(["floating-menu-item"]);
  const icon = new FakeElement(["provider-icon"]);
  const content = new FakeElement(["fmi-content"]);
  const chevron = new FakeElement(["menu-chevron"]);

  item.appendChild(icon);
  item.appendChild(content);
  item.appendChild(chevron);

  const changed = removeLeadingMenuItemVisuals(item);

  assert.equal(changed, true);
  assert.deepEqual(
    item.children.map((child) => Array.from(child.classList.items).join(" ")),
    ["fmi-content", "menu-chevron"]
  );
});

test("removeLeadingModelTriggerVisuals removes only the leading icon before the label", () => {
  const trigger = new FakeElement(["img-model-btn-trigger"]);
  const icon = new FakeElement(["provider-icon"]);
  const label = new FakeElement(["img-model-label"]);
  const caret = new FakeElement(["trigger-caret"]);

  trigger.appendChild(icon);
  trigger.appendChild(label);
  trigger.appendChild(caret);

  const changed = removeLeadingModelTriggerVisuals(trigger);

  assert.equal(changed, true);
  assert.deepEqual(
    trigger.children.map((child) => Array.from(child.classList.items).join(" ")),
    ["img-model-label", "trigger-caret"]
  );
});

test("sanitizeModelMenuVisuals updates both menu items and model triggers under a root", () => {
  const root = new FakeElement(["root"]);
  const item = new FakeElement(["floating-menu-item"]);
  const itemIcon = new FakeElement(["provider-icon"]);
  const itemContent = new FakeElement(["fmi-content"]);
  item.appendChild(itemIcon);
  item.appendChild(itemContent);

  const trigger = new FakeElement(["img-model-btn-trigger"]);
  const triggerIcon = new FakeElement(["provider-icon"]);
  const triggerLabel = new FakeElement(["img-model-label"]);
  trigger.appendChild(triggerIcon);
  trigger.appendChild(triggerLabel);

  root.matchesMap.set(".floating-menu-item", [item]);
  root.matchesMap.set(
    ".img-model-btn-trigger,.fa-model-btn,[data-model-toggle],.model-toggle",
    [trigger]
  );

  const changedCount = sanitizeModelMenuVisuals(root);

  assert.equal(changedCount, 2);
  assert.equal(item.children[0], itemContent);
  assert.equal(trigger.children[0], triggerLabel);
});
