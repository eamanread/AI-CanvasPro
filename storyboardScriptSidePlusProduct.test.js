import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllowedInputNodeTypesForSidePlus,
  getAllowedGenerationNodeTypesForQuoteMenu,
  resolveSidePlusRenderState,
  isValidConnection,
} from "./modules/interaction/EdgeController.js";
import { createStoryboardScriptNodeData } from "./src/core/storyboardScriptFactory.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

test("storyboard-script exposes left input side-plus node types", () => {
  assert.deepEqual(getAllowedInputNodeTypesForSidePlus("storyboard-script"), [
    "source-text",
    "source-image",
    "source-video",
    "ai-image",
    "ai-text",
    "ai-video",
  ]);
});

test("storyboard-script exposes right output generation node types", () => {
  assert.deepEqual(getAllowedGenerationNodeTypesForQuoteMenu([{ type: "storyboard-script" }]), [
    "ai-text",
    "ai-image",
    "ai-video",
  ]);
});

test("storyboard-script allows incoming and outgoing product connections", () => {
  const story = createStoryboardScriptNodeData({ id: "story-1" });
  assert.equal(isValidConnection({ id: "source-text-1", type: "source-text", text: "plot" }, story), true);
  assert.equal(isValidConnection(story, { id: "ai-image-1", type: "ai-image" }), true);
  assert.equal(isValidConnection(story, { id: "ai-video-1", type: "ai-video" }), true);
});

test("side-plus render state keeps both sides for storyboard-script", () => {
  const state = resolveSidePlusRenderState({ type: "storyboard-script", width: 1024, height: 576 });
  assert.equal(state.shouldClear, false);
  assert.equal(state.selectionOnly, false);
  assert.equal(state.left, true);
  assert.equal(state.right, true);
});

test("renderer has stable selectors for left and right side-plus buttons", () => {
  const renderer = read("src/core/renderer.js");
  assert.match(renderer, /data-side=["']left["']/);
  assert.match(renderer, /data-side=["']right["']/);
  assert.match(renderer, /side-plus-btn/);
});
