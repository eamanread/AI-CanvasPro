import assert from "node:assert/strict";
import test from "node:test";

import {
  mapVimaxStoryToCanvasActions,
  mapVimaxCastToCanvasActions,
  castContentToCharacters,
} from "./vimaxStoryCastCanvasActions.js";

const CHARS = [
  { idx: 0, identifierInScene: "Alice", isVisible: true, staticFeatures: "三十岁，卷发", dynamicFeatures: "红风衣" },
  { idx: 1, identifierInScene: "Bob", isVisible: false, staticFeatures: "矮个", dynamicFeatures: "礼帽" },
];

test("story mapper: one trusted comment card carrying the story text", () => {
  const { actions } = mapVimaxStoryToCanvasActions({ flowId: "f1", story: "雨夜告别。" });
  assert.equal(actions.length, 1);
  const a = actions[0];
  assert.equal(a.type, "create_node");
  assert.equal(a.nodeType, "comment");
  assert.equal(a.data.content, "雨夜告别。");
  assert.equal(a.data.vimaxRole, "story");
  assert.equal(a.data.vimaxFlowId, "f1");
  assert.equal(a.data.vimaxShotIdx, -1);
});

test("story mapper: empty flowId throws", () => {
  assert.throws(() => mapVimaxStoryToCanvasActions({ flowId: "", story: "x" }));
});

test("cast mapper: one comment card whose content round-trips through the parser", () => {
  const { actions } = mapVimaxCastToCanvasActions({ flowId: "f1", characters: CHARS });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].nodeType, "comment");
  assert.equal(actions[0].data.vimaxRole, "cast");
  assert.equal(actions[0].data.vimaxShotIdx, -1);
  const parsed = castContentToCharacters(actions[0].data.content);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { idx: 0, identifierInScene: "Alice", staticFeatures: "三十岁，卷发", dynamicFeatures: "红风衣", isVisible: true });
  assert.equal(parsed[1].identifierInScene, "Bob");
  assert.equal(parsed[1].isVisible, false);
});

test("parser: idx is block order (M4 stable) even if blocks are reordered/renumbered", () => {
  const content = [
    "角色表（说明行）",
    "【角色 5】Bob",
    "静态: 矮个",
    "动态: 礼帽",
    "出镜: 否",
    "【角色 2】Alice",
    "静态: 卷发",
    "动态: 红风衣",
    "出镜: 是",
  ].join("\n");
  const parsed = castContentToCharacters(content);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].identifierInScene, "Bob");
  assert.equal(parsed[0].idx, 0, "block order, not the bracket number");
  assert.equal(parsed[1].identifierInScene, "Alice");
  assert.equal(parsed[1].idx, 1);
});

test("parser: a | inside a feature value is preserved (labeled-block, not delimiter)", () => {
  const content = ["【角色 0】Eve", "静态: red|black outfit, 20s|30s", "动态: scarf", "出镜: 是"].join("\n");
  const parsed = castContentToCharacters(content);
  assert.equal(parsed[0].staticFeatures, "red|black outfit, 20s|30s");
});

test("parser: blank/unparseable content yields empty (caller decides, no fallback here)", () => {
  assert.deepEqual(castContentToCharacters(""), []);
  assert.deepEqual(castContentToCharacters("just some prose with no blocks"), []);
});
