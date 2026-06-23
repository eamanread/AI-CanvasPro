import assert from "node:assert/strict";
import test from "node:test";
import { isHuanyingDebugModeEnabled } from "./debugMode.js";

function makeWindow({ href = "app://index.html#/canvas", storageValue = null } = {}) {
  return {
    location: { href },
    localStorage: {
      getItem(key) {
        assert.equal(key, "huanyingDebugMode");
        return storageValue;
      },
    },
  };
}

test("isHuanyingDebugModeEnabled is off by default", () => {
  assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow() }), false);
});

test("isHuanyingDebugModeEnabled is on when localStorage flag is true", () => {
  assert.equal(isHuanyingDebugModeEnabled({ windowRef: makeWindow({ storageValue: "true" }) }), true);
});

test("isHuanyingDebugModeEnabled is on for normal debug query", () => {
  assert.equal(
    isHuanyingDebugModeEnabled({ windowRef: makeWindow({ href: "app://index.html?debug=1#/canvas" }) }),
    true,
  );
});

test("isHuanyingDebugModeEnabled is on for hash-routed debug query", () => {
  assert.equal(
    isHuanyingDebugModeEnabled({ windowRef: makeWindow({ href: "app://index.html#/canvas?debug=1" }) }),
    true,
  );
});

test("isHuanyingDebugModeEnabled ignores non-enabled values and storage errors", () => {
  const windowRef = {
    location: { href: "app://index.html?debug=0#/canvas" },
    localStorage: {
      getItem() {
        throw new Error("blocked");
      },
    },
  };
  assert.equal(isHuanyingDebugModeEnabled({ windowRef }), false);
});
