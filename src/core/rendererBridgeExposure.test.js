import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("renderer bridge exposes stable assistant alias and mount helpers", () => {
  const source = readFileSync(new URL("./renderer.js", import.meta.url), "utf8");

  assert.match(source, /__v2RendererBridge/);
  assert.match(source, /ensureNodeMounted/);
  assert.match(source, /scrollNodeIntoView/);
  assert.match(source, /focusNode/);
});
