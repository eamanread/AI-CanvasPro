import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { mapVimaxShotplanToCanvasActions, shotActions } from "./vimaxCanvasActions.js";

// Fixture shaped after a real ViMax plan (γ report.json camelCased to
// vimax-shotplan/v1): 2 scenes, 3 shots, shot 1 carries a last-frame.
const SHOTPLAN = {
  schemaVersion: "vimax-shotplan/v1",
  flowId: "flow-abc123",
  scenes: [
    { idx: 0, script: "EXT. ROCKY COAST - MORNING" },
    { idx: 1, script: "EXT. SHORE - LATER" },
  ],
  characters: [
    { idx: 0, identifierInScene: "Elias", isVisible: true, staticFeatures: "late sixties, weathered", dynamicFeatures: "stiff gait" },
  ],
  shots: [
    { idx: 0, sceneIdx: 0, camIdx: 0, visualDesc: "shore wide", ffDesc: "medium full shot at eye level, man on rocky shore", motionDesc: "static camera, man walks left to center", audioDesc: "water lapping", variationType: "small" },
    { idx: 1, sceneIdx: 0, camIdx: 1, visualDesc: "hands insert", ffDesc: "extreme close-up high angle on calloused hands", lfDesc: "hands lower the bottle", motionDesc: "pries cork", audioDesc: "soft thwomp", variationType: "medium" },
    { idx: 2, sceneIdx: 1, camIdx: 2, visualDesc: "boat low angle", ffDesc: "wide low angle, lighthouse looms", motionDesc: "pushes boat to sea", audioDesc: "scrape of wood", variationType: "small" },
  ],
  skillRefs: ["电影布光大师", "一图成片:顶级执行导演 Skill"],
  elapsedSec: 123.4,
};

function byType(actions, type) {
  return actions.filter((a) => a.type === type);
}

test("vimaxCanvasActions: each shot yields a storyboard card + an ai-image prep + an edge, ending in tidy", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const cards = byType(actions, "create_node").filter((a) => a.nodeType === "storyboard-script");
  const preps = byType(actions, "create_node").filter((a) => a.nodeType === "ai-image");
  const edges = byType(actions, "connect_nodes");
  assert.equal(cards.length, 3, "one storyboard card per shot");
  assert.equal(preps.length, 3, "one ai-image prep per shot");
  assert.equal(edges.length, 3, "one edge per shot (card -> prep)");
  assert.equal(actions[actions.length - 1].type, "tidy_canvas", "last action is tidy_canvas");
});

test("vimaxCanvasActions: storyboard card reuses keys + carries numeric vimax lineage", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const card0 = actions.find((a) => a.nodeType === "storyboard-script" && a.data.vimaxShotIdx === 0);
  assert.ok(card0, "shot 0 card present");
  assert.equal(card0.data.shotIndex, 0);
  assert.equal(card0.data.shotPrompt, SHOTPLAN.shots[0].ffDesc, "shotPrompt <- ffDesc");
  assert.equal(card0.data.shotVideoPrompt, SHOTPLAN.shots[0].motionDesc, "shotVideoPrompt <- motionDesc");
  assert.match(String(card0.data.cameraMove), /0/, "cameraMove references camIdx");
  assert.equal(card0.data.vimaxFlowId, "flow-abc123");
  assert.equal(typeof card0.data.vimaxShotIdx, "number", "shotIdx numeric (no string === trap)");
  assert.equal(card0.data.vimaxCamIdx, 0);
  assert.deepEqual(card0.data.skillRefs, SHOTPLAN.skillRefs);
});

test("vimaxCanvasActions: lfDesc shown only when present", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const card0 = actions.find((a) => a.nodeType === "storyboard-script" && a.data.vimaxShotIdx === 0);
  const card1 = actions.find((a) => a.nodeType === "storyboard-script" && a.data.vimaxShotIdx === 1);
  assert.ok(!card0.data.shotLastFrame, "shot 0 has no last frame -> no key");
  assert.equal(card1.data.shotLastFrame, SHOTPLAN.shots[1].lfDesc, "shot 1 last frame shown");
});

test("vimaxCanvasActions: prep node double-stamps autoStart:false and carries prompt+lineage", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const prep0 = actions.find((a) => a.nodeType === "ai-image" && a.data.vimaxShotIdx === 0);
  assert.equal(prep0.autoStart, false, "top-level autoStart stamp");
  assert.equal(prep0.data.autoStart, false, "data autoStart stamp");
  assert.equal(prep0.data.prompt, SHOTPLAN.shots[0].ffDesc, "prep prompt <- ffDesc");
  assert.equal(prep0.data.vimaxFlowId, "flow-abc123");
  assert.deepEqual(prep0.data.skillRefs, SHOTPLAN.skillRefs);
});

test("vimaxCanvasActions: role discriminator makes the prep the writeback authority", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  // Both card and prep carry vimaxFlowId+vimaxShotIdx; vimaxRole
  // disambiguates so the F6 writeback collector picks exactly one
  // authoritative prompt source per shot.
  const card0 = actions.find((a) => a.nodeType === "storyboard-script" && a.data.vimaxShotIdx === 0);
  const prep0 = actions.find((a) => a.nodeType === "ai-image" && a.data.vimaxShotIdx === 0);
  assert.equal(card0.data.vimaxRole, "card");
  assert.equal(prep0.data.vimaxRole, "prep");
  const authorities = actions.filter(
    (a) => a.data?.vimaxFlowId === "flow-abc123" && a.data?.vimaxRole === "prep" && a.data?.vimaxShotIdx === 0,
  );
  assert.equal(authorities.length, 1, "exactly one prep authority per shot");
});

test("vimaxCanvasActions: non-empty flowId required (id collision guard)", () => {
  const noFlow = { ...SHOTPLAN, flowId: "" };
  assert.throws(() => mapVimaxShotplanToCanvasActions({ shotplan: noFlow }), /flowId/);
});

test("vimaxCanvasActions: interleaved scene order still anchors within own lane", () => {
  // scenes arrive 0,1,0 - the third shot (scene 0, not first) must
  // anchor right-of scene 0's prep, not scene 1's.
  const interleaved = {
    ...SHOTPLAN,
    shots: [
      { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "a", motionDesc: "m" },
      { idx: 1, sceneIdx: 1, camIdx: 0, ffDesc: "b", motionDesc: "m" },
      { idx: 2, sceneIdx: 0, camIdx: 1, ffDesc: "c", motionDesc: "m" },
    ],
  };
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: interleaved });
  const card2 = actions.find((a) => a.nodeType === "storyboard-script" && a.data.vimaxShotIdx === 2);
  // shot 2 is scene 0's second shot -> right-of scene 0's prep (shot 0), NOT scene 1's prep (shot 1)
  assert.equal(card2.placement.strategy, "right-of");
  assert.equal(card2.placement.anchor, "vimax-flow-abc123-prep-0", "anchored within scene 0's lane");
});

test("vimaxCanvasActions: lane per scene (new-lane), shots within laid out right-of", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const newLanes = actions.filter((a) => a.placement?.strategy === "new-lane");
  assert.equal(newLanes.length, 2, "2 scenes -> 2 new-lane cards (first shot of each scene)");
  assert.ok(actions.some((a) => a.placement?.strategy === "right-of"), "right-of placement used for columns");
});

test("vimaxCanvasActions: edge connects card to its prep", () => {
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const edge = byType(actions, "connect_nodes")[0];
  const cardIds = new Set(actions.filter((a) => a.nodeType === "storyboard-script").map((a) => a.id));
  const prepIds = new Set(actions.filter((a) => a.nodeType === "ai-image").map((a) => a.id));
  assert.ok(cardIds.has(edge.from), "edge from a storyboard card");
  assert.ok(prepIds.has(edge.to), "edge to an ai-image prep");
});

test("vimaxCanvasActions: fail closed on wrong schema / empty shots", () => {
  assert.throws(() => mapVimaxShotplanToCanvasActions({ shotplan: { schemaVersion: "x", shots: [] } }), /schemaVersion/);
  assert.throws(() => mapVimaxShotplanToCanvasActions({ shotplan: { schemaVersion: "vimax-shotplan/v1", shots: [] } }), /shots/);
});

test("contract: a REAL ViMax runner shotplan (golden) is consumed cleanly (F2 <-> F5)", () => {
  // 铁律 7: cross-process golden generated by the real runner, not hand-
  // written. Pins that what F2 (huanying_runner plan mode) emits is what
  // F5 (this mapper) consumes.
  const goldenPath = fileURLToPath(new URL("../../integrations/vimax/__fixtures__/shotplan.golden.json", import.meta.url));
  const shotplan = JSON.parse(readFileSync(goldenPath, "utf-8"));
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan });
  const cards = actions.filter((a) => a.nodeType === "storyboard-script");
  const preps = actions.filter((a) => a.nodeType === "ai-image");
  assert.equal(cards.length, shotplan.shots.length, "one card per real shot");
  assert.equal(preps.length, shotplan.shots.length, "one prep per real shot");
  assert.equal(actions[actions.length - 1].type, "tidy_canvas");
  for (const prep of preps) {
    assert.equal(prep.autoStart, false);
    assert.equal(prep.data.autoStart, false);
    assert.ok(prep.data.prompt, "prep carries a prompt from real ffDesc");
    assert.equal(typeof prep.data.vimaxShotIdx, "number");
  }
});

// B0-C2/C3 regression: the storyboard-script card must carry a TABLE row the
// node renders - not just inert flat fields (which left the table empty). This
// goes THROUGH the real factory (createDefaultStoryboardScriptState, what the
// node calls on read), the gap the original test missed.
test("storyboard-script cards carry a renderable storyboardScript row", async () => {
  const { createDefaultStoryboardScriptState } = await import("../../src/core/storyboardScriptFactory.js");
  const { actions } = mapVimaxShotplanToCanvasActions({ shotplan: SHOTPLAN });
  const cards = actions.filter((a) => a.type === "create_node" && a.nodeType === "storyboard-script");
  assert.ok(cards.length >= 1, "at least one storyboard-script card");
  const card0 = cards[0];
  const rows = card0.data?.storyboardScript?.rows;
  assert.ok(Array.isArray(rows) && rows.length === 1, "card carries one table row");
  assert.ok(rows[0]["图片提示词"], "row has the keyframe prompt (图片提示词) from ffDesc");
  // Feed the row through the REAL factory the node uses on render: it must
  // normalize to a non-empty table (this is what failed before - empty render).
  const state = createDefaultStoryboardScriptState(card0.data.storyboardScript);
  assert.equal(state.rows.length, 1, "factory normalizes the row -> renders one row");
  assert.ok(state.rows[0]["图片提示词"], "rendered row keeps the keyframe prompt");
  assert.ok(state.canonicalJson && state.canonicalJson.length, "canonical JSON built (table renders, not empty)");
});

// B3b: shotActions extraction — per-shot builder reused for incremental landing.

test("shotActions: one shot -> card + prep + edge with correct lineage/placement", () => {
  const anchor = { lastPrepInScene: new Map() };
  const acts = shotActions({ idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide", motionDesc: "pan" }, "f1", [], anchor);
  const types = acts.map((a) => `${a.type}:${a.nodeType || a.label || ""}`);
  assert.deepEqual(types, ["create_node:storyboard-script", "create_node:ai-image", "connect_nodes:prep"]);
  assert.equal(acts[0].placement.strategy, "new-lane", "first shot in a scene opens a lane");
  assert.equal(acts[1].data.autoStart, false, "prep never self-ignites");
  const acts2 = shotActions({ idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close" }, "f1", [], anchor);
  assert.equal(acts2[0].placement.strategy, "right-of", "next shot in the scene grows the row");
});

test("shotActions: an unidentifiable shot (non-numeric idx) yields no actions", () => {
  const anchor = { lastPrepInScene: new Map() };
  assert.deepEqual(shotActions({ idx: "nope", sceneIdx: 0 }, "f1", [], anchor), []);
});

test("mapVimaxShotplanToCanvasActions still produces the expected shape (delegates to shotActions)", () => {
  const sp = { schemaVersion: "vimax-shotplan/v1", flowId: "f1", shots: [
    { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide enough description", motionDesc: "pan" },
    { idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close enough description", motionDesc: "push" },
  ] };
  const acts = mapVimaxShotplanToCanvasActions({ shotplan: sp }).actions;
  assert.equal(acts.filter((a) => a.type === "create_node").length, 4, "2 cards + 2 preps");
  assert.equal(acts.filter((a) => a.type === "connect_nodes").length, 2);
  assert.ok(acts.some((a) => a.type === "tidy_canvas"));
});
