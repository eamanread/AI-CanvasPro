import assert from "node:assert/strict";
import test from "node:test";

import { mapVimaxPortraitsToCanvasActions } from "./vimaxPortraitsCanvasActions.js";

const SCHEMA = "vimax-portraits-result/v1";

function portraits(characters, flowId = "f1") {
  return { schemaVersion: SCHEMA, flowId, characters };
}

function threeViews() {
  return [
    { view: "front", url: "u-front", localPath: "/p/front.png" },
    { view: "side", url: "u-side", localPath: "/p/side.png" },
    { view: "back", url: "u-back", localPath: "/p/back.png" },
  ];
}

test("maps one character to a three-view group: lineage, placement, no self-igniting image", () => {
  const { actions } = mapVimaxPortraitsToCanvasActions({
    portraits: portraits([{ idx: 0, identifier: "男主", views: threeViews() }]),
  });
  const creates = actions.filter((a) => a.type === "create_node");
  assert.equal(creates.length, 3, "front/side/back");

  const front = creates.find((a) => a.id === "vimax-f1-portrait-0-front");
  const side = creates.find((a) => a.id === "vimax-f1-portrait-0-side");
  const back = creates.find((a) => a.id === "vimax-f1-portrait-0-back");
  assert.ok(front && side && back, "all three view nodes by namespaced id");

  for (const node of [front, side, back]) {
    assert.equal(node.nodeType, "ai-image");
    assert.equal(node.autoStart, false, "top-level autoStart stamp");
    assert.equal(node.data.autoStart, false, "data autoStart stamp");
    assert.equal(node.data.vimaxFlowId, "f1");
    assert.equal(node.data.assetRole, "character");
    assert.equal(node.data.vimaxRole, "portrait");
    assert.equal(node.data.vimaxCharIdx, 0);
    assert.ok(!("imageUrl" in node.data), "mapper lands no image - M15 does that via updateNodeData");
  }
  assert.equal(front.data.vimaxView, "front");
  assert.equal(side.data.vimaxView, "side");
  assert.equal(back.data.vimaxView, "back");
  assert.equal(front.name, "男主 · 正面");
  assert.equal(side.name, "男主 · 侧面");
  assert.equal(back.name, "男主 · 背面");

  // front opens a lane; side/back grow right within it.
  assert.equal(front.placement.strategy, "new-lane");
  assert.equal(side.placement.strategy, "right-of");
  assert.equal(side.placement.anchor, "vimax-f1-portrait-0-front");
  assert.equal(back.placement.strategy, "right-of");
  assert.equal(back.placement.anchor, "vimax-f1-portrait-0-side");

  // side/back derive from front -> edges from the front anchor.
  const edges = actions.filter((a) => a.type === "connect_nodes");
  assert.deepEqual(
    edges.map((e) => [e.from, e.to]).sort(),
    [["vimax-f1-portrait-0-front", "vimax-f1-portrait-0-back"], ["vimax-f1-portrait-0-front", "vimax-f1-portrait-0-side"]].sort(),
  );
  assert.equal(actions.at(-1).type, "tidy_canvas");
});

test("two characters land in two lanes, ids namespaced by charIdx, no cross-lane anchor", () => {
  const { actions } = mapVimaxPortraitsToCanvasActions({
    portraits: portraits([
      { idx: 0, identifier: "男主", views: threeViews() },
      { idx: 1, identifier: "女主", views: threeViews() },
    ]),
  });
  const lanes = actions.filter((a) => a.type === "create_node" && a.placement.strategy === "new-lane");
  assert.deepEqual(lanes.map((a) => a.id), ["vimax-f1-portrait-0-front", "vimax-f1-portrait-1-front"]);
  // 女主's side anchors to 女主's front, never 男主's nodes.
  const womanSide = actions.find((a) => a.id === "vimax-f1-portrait-1-side");
  assert.equal(womanSide.placement.anchor, "vimax-f1-portrait-1-front");
});

test("a view without a url is skipped; a character with an error is skipped entirely", () => {
  const { actions } = mapVimaxPortraitsToCanvasActions({
    portraits: portraits([
      { idx: 0, identifier: "男主", views: [
        { view: "front", url: "u-front" },
        { view: "side", url: "" },           // failed view -> no node
        { view: "back", url: "u-back" },
      ] },
      { idx: 1, identifier: "女主", error: "draw failed" }, // whole char skipped
    ]),
  });
  const ids = actions.filter((a) => a.type === "create_node").map((a) => a.id);
  assert.deepEqual(ids, ["vimax-f1-portrait-0-front", "vimax-f1-portrait-0-back"]);
  // back now anchors to front (side was skipped).
  const back = actions.find((a) => a.id === "vimax-f1-portrait-0-back");
  assert.equal(back.placement.anchor, "vimax-f1-portrait-0-front");
});

test("rejects a bad schema version, empty flowId, or empty characters", () => {
  assert.throws(() => mapVimaxPortraitsToCanvasActions({ portraits: { schemaVersion: "x", flowId: "f1", characters: [] } }));
  assert.throws(() => mapVimaxPortraitsToCanvasActions({ portraits: portraits([{ idx: 0, identifier: "男主", views: threeViews() }], "") }));
  assert.throws(() => mapVimaxPortraitsToCanvasActions({ portraits: portraits([]) }));
  // characters with only errors/no usable views -> no nodes -> reject (nothing to land)
  assert.throws(() => mapVimaxPortraitsToCanvasActions({ portraits: portraits([{ idx: 0, identifier: "x", error: "e" }]) }));
});
