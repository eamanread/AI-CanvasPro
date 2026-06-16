import test from "node:test";
import assert from "node:assert/strict";
import {
  STORYBOARD_SCRIPT_NODE_TYPE,
  STORYBOARD_SCRIPT_DEFAULT_NAME,
  STORYBOARD_SCRIPT_DEFAULT_SIZE,
  STORYBOARD_SCRIPT_COLUMNS,
  createStoryboardScriptNodeData,
  createDefaultStoryboardScriptState,
  serializeStoryboardScriptRowsToCsv
} from "./src/core/storyboardScriptFactory.js";
import {
  STORYBOARD_SCRIPT_GENERATION_SCHEMA_VERSION,
  buildStoryboardScriptTextOnlyPrompt,
  buildStoryboardScriptImagePrompt,
  buildStoryboardScriptVideoPrompt,
  normalizeStoryboardScriptGenerationResult
} from "./src/core/storyboardScriptGeneration.js";

const labels = [
  "\u955c\u53f7", "\u65f6\u957f", "\u666f\u522b", "\u573a\u666f", "\u753b\u9762\u63cf\u8ff0",
  "\u89d2\u8272", "\u89d2\u8272\u63cf\u8ff0", "\u89d2\u8272\u52a8\u4f5c", "\u60c5\u7eea", "\u89d2\u8272\u56fe",
  "\u53c2\u8003", "\u56fe\u7247\u63d0\u793a\u8bcd", "\u89c6\u9891\u63d0\u793a\u8bcd", "\u5bf9\u767d", "\u97f3\u6548"
];

test("storyboard script factory exposes upstream node defaults", () => {
  assert.equal(STORYBOARD_SCRIPT_NODE_TYPE, "storyboard-script");
  assert.equal(STORYBOARD_SCRIPT_DEFAULT_NAME, "\u5206\u955c\u811a\u672c");
  assert.deepEqual(STORYBOARD_SCRIPT_DEFAULT_SIZE, { width: 1024, height: 576 });
  assert.deepEqual(STORYBOARD_SCRIPT_COLUMNS.map((column) => column.key), labels);
});

test("createStoryboardScriptNodeData creates normalized upstream state", () => {
  const node = createStoryboardScriptNodeData({ id: "story-1", x: 10, y: 20 });
  assert.equal(node.type, "storyboard-script");
  assert.equal(node.name, "\u5206\u955c\u811a\u672c");
  assert.equal(node.width, 1024);
  assert.equal(node.height, 576);
  assert.equal(node.storyboardScript.version, 1);
  assert.equal(node.storyboardScript.viewMode, "list");
  assert.equal(node.storyboardScript.mediaMode, "image");
  assert.match(node.storyboardScript.canonicalJson, /storyboard-script\.v1/);
});

test("default storyboard state and csv serialization use upstream schema", () => {
  const state = createDefaultStoryboardScriptState();
  assert.equal(state.version, 1);
  assert.equal(state.detectedIntent.shotCount, 0);
  const csv = serializeStoryboardScriptRowsToCsv([{ "\u955c\u53f7": "1", "\u56fe\u7247\u63d0\u793a\u8bcd": "cinematic frame", "\u89c6\u9891\u63d0\u793a\u8bcd": "slow dolly" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes(labels.join(",")));
  assert.match(csv, /cinematic frame/);
  assert.match(csv, /slow dolly/);
});

test("generation module exposes upstream schema and prompt builders", () => {
  assert.equal(STORYBOARD_SCRIPT_GENERATION_SCHEMA_VERSION, "storyboard-script.v1");
  assert.match(buildStoryboardScriptTextOnlyPrompt("\u4e00\u4e2a\u5973\u5b69\u5728\u96e8\u591c\u5954\u8dd1"), /\u7528\u6237\u8f93\u5165/);
  assert.match(buildStoryboardScriptImagePrompt("\u6839\u636e\u56fe\u7247\u62c6\u5206\u955c"), /\u53c2\u8003\u56fe\u7247/);
  assert.match(buildStoryboardScriptVideoPrompt("\u6839\u636e\u89c6\u9891\u62c6\u5206\u955c"), /\u53c2\u8003\u89c6\u9891/);
});

test("generation result normalizes rows into storyboard-script schema", () => {
  const result = normalizeStoryboardScriptGenerationResult({
    schemaVersion: "storyboard-script.v1",
    type: "storyboard-script",
    title: "\u6d4b\u8bd5",
    detectedIntent: { shotCount: 1 },
    rows: [{ "\u955c\u53f7": "1", "\u753b\u9762\u63cf\u8ff0": "\u4e3b\u89d2\u56de\u5934", "\u56fe\u7247\u63d0\u793a\u8bcd": "close up" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.title, "\u6d4b\u8bd5");
  assert.equal(result.detectedIntent.shotCount, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["\u955c\u53f7"], "1");
});
