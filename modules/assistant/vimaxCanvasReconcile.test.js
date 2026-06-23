import assert from "node:assert/strict";
import test from "node:test";

import { canvasActionProfile, compareCanvasProfiles, reconcileShotplanCanvas } from "./vimaxCanvasReconcile.js";
import { mapVimaxShotplanToCanvasActions } from "./vimaxCanvasActions.js";
import { mapVimaxStoryToCanvasActions, mapVimaxCastToCanvasActions } from "./vimaxStoryCastCanvasActions.js";

// B4: the A/B 对账门 at the canvas layer. Build shotplans with the SAME
// structure but DIFFERENT free text (as the external + native LLMs would) and
// assert their canvas projections are structurally equivalent; assert
// divergent structures + unhealthy plans are flagged.

function shotplan({ flowId = "fA", scenes = 1, shotsPerScene = 2, prefix = "x" } = {}) {
  const shots = [];
  let idx = 0;
  for (let s = 0; s < scenes; s++) {
    for (let k = 0; k < shotsPerScene; k++) {
      shots.push({
        idx, sceneIdx: s, camIdx: k,
        ffDesc: `${prefix} frame ${idx} long enough description`,
        motionDesc: `${prefix} motion ${idx}`, visualDesc: `${prefix} v${idx}`,
        audioDesc: `${prefix} a${idx}`, variationType: "small",
      });
      idx += 1;
    }
  }
  return {
    schemaVersion: "vimax-shotplan/v1", flowId, story: `${prefix} story`,
    characters: [{ idx: 0, identifierInScene: "A", isVisible: true, staticFeatures: "s", dynamicFeatures: "d" }],
    shots, skillRefs: [],
  };
}

function profileOf(sp) {
  return canvasActionProfile(mapVimaxShotplanToCanvasActions({ shotplan: sp }).actions);
}

test("B4 profile: a healthy 2-scene / 4-shot plan fingerprints correctly", () => {
  const p = profileOf(shotplan({ scenes: 2, shotsPerScene: 2 }));
  assert.equal(p.totalNodes, 8, "4 cards + 4 preps");
  assert.deepEqual(p.nodeCountByType, { "storyboard-script": 4, "ai-image": 4 });
  assert.equal(p.edgeCount, 4);
  assert.deepEqual(p.edgeLabels, { prep: 4 });
  assert.equal(p.laneCount, 2, "one new-lane per scene");
  assert.equal(p.shotIdxCount, 4);
  assert.ok(p.hasTidy && p.allNodeTypesSafe && p.lineageComplete && p.prepNoAutoStart && p.cardPrepPaired && p.uniqueIds,
    "all canvas health invariants hold");
});

test("B4: structurally-identical plans with different free text are equivalent", () => {
  const ext = profileOf(shotplan({ flowId: "f-ext", scenes: 2, shotsPerScene: 2, prefix: "external words" }));
  const nat = profileOf(shotplan({ flowId: "f-nat", scenes: 2, shotsPerScene: 2, prefix: "native 完全不同的文本" }));
  const v = compareCanvasProfiles(ext, nat);
  assert.ok(v.equivalent, JSON.stringify(v));
  assert.equal(v.hardFailures.length, 0);
  assert.equal(v.notes.length, 0);
});

test("B4: a count difference within tolerance is still equivalent", () => {
  // 4 shots vs 6 shots: shotIdxCount delta 2 == tolerance 2.
  const ext = profileOf(shotplan({ scenes: 2, shotsPerScene: 2 }));
  const nat = profileOf(shotplan({ scenes: 2, shotsPerScene: 3 }));
  assert.ok(compareCanvasProfiles(ext, nat, { countTolerance: 2 }).equivalent);
});

test("B4: a count difference beyond tolerance is flagged (not equivalent)", () => {
  const ext = profileOf(shotplan({ scenes: 1, shotsPerScene: 2 })); // 2 shots
  const nat = profileOf(shotplan({ scenes: 3, shotsPerScene: 2 })); // 6 shots
  const v = compareCanvasProfiles(ext, nat, { countTolerance: 2 });
  assert.equal(v.equivalent, false);
  assert.ok(v.notes.some((n) => /shotIdxCount differs/.test(n)), JSON.stringify(v.notes));
});

test("B4: a missing-lineage node is a HARD failure (claw would distrust it)", () => {
  const actions = [
    { type: "create_node", id: "c0", nodeType: "storyboard-script", data: { vimaxFlowId: "f", vimaxRole: "card", vimaxShotIdx: 0 } },
    { type: "create_node", id: "p0", nodeType: "ai-image", autoStart: false, data: { vimaxRole: "prep", vimaxShotIdx: 0 } }, // no vimaxFlowId
    { type: "connect_nodes", from: "c0", to: "p0", label: "prep" },
    { type: "tidy_canvas", scope: "all" },
  ];
  const bad = canvasActionProfile(actions);
  assert.equal(bad.lineageComplete, false);
  const good = profileOf(shotplan({ shotsPerScene: 1 }));
  const v = compareCanvasProfiles(good, bad);
  assert.equal(v.equivalent, false);
  assert.ok(v.hardFailures.some((h) => /native\.lineageComplete is false/.test(h)), JSON.stringify(v.hardFailures));
});

test("B4: a prep without the no-self-ignite stamp is a HARD failure (铁律4)", () => {
  const actions = [
    { type: "create_node", id: "c0", nodeType: "storyboard-script", data: { vimaxFlowId: "f", vimaxRole: "card", vimaxShotIdx: 0 } },
    // prep missing autoStart:false anywhere -> would self-ignite
    { type: "create_node", id: "p0", nodeType: "ai-image", data: { vimaxFlowId: "f", vimaxRole: "prep", vimaxShotIdx: 0 } },
    { type: "connect_nodes", from: "c0", to: "p0", label: "prep" },
    { type: "tidy_canvas", scope: "all" },
  ];
  assert.equal(canvasActionProfile(actions).prepNoAutoStart, false);
});

test("B4: an unsafe node type is a HARD failure (B0-C1: claw would reject the plan)", () => {
  const actions = [
    { type: "create_node", id: "c0", nodeType: "knowledge-card", data: { vimaxFlowId: "f", vimaxRole: "card", vimaxShotIdx: 0 } },
    { type: "tidy_canvas", scope: "all" },
  ];
  assert.equal(canvasActionProfile(actions).allNodeTypesSafe, false, "knowledge-card is not claw-safe");
});

test("B4 gate: reconcileShotplanCanvas maps both sides and finds equivalence", () => {
  const v = reconcileShotplanCanvas(
    shotplan({ flowId: "f-ext", scenes: 2, shotsPerScene: 3, prefix: "外置" }),
    shotplan({ flowId: "f-nat", scenes: 2, shotsPerScene: 3, prefix: "原生" }),
  );
  assert.ok(v.equivalent, JSON.stringify(v));
  assert.equal(v.externalProfile.totalNodes, v.nativeProfile.totalNodes);
  assert.equal(v.externalProfile.shotIdxCount, 6);
});

test("B4 gate: a malformed shotplan on one side records a hard failure, never throws", () => {
  const v = reconcileShotplanCanvas(shotplan({ shotsPerScene: 2 }), { schemaVersion: "wrong" });
  assert.equal(v.equivalent, false);
  assert.ok(v.hardFailures.some((h) => /native shotplan did not map/.test(h)), JSON.stringify(v.hardFailures));
});

test("B4 (B2-review#3): the same logical plan via both lanes (different flowId) is equivalent", () => {
  // Each lane generates its own flowId, so node ids differ; structure must not.
  const v = reconcileShotplanCanvas(
    shotplan({ flowId: "vimax-ext-aaaa", scenes: 1, shotsPerScene: 3 }),
    shotplan({ flowId: "vimax-nat-bbbb", scenes: 1, shotsPerScene: 3 }),
  );
  assert.ok(v.equivalent);
  assert.equal(v.externalProfile.shotIdxCount, v.nativeProfile.shotIdxCount);
  assert.deepEqual(v.externalProfile.nodeCountByType, v.nativeProfile.nodeCountByType);
});

test("B3a: a canvas with story + cast + shot nodes profiles HEALTHY", () => {
  const story = mapVimaxStoryToCanvasActions({ flowId: "fA", story: "s" }).actions;
  const cast = mapVimaxCastToCanvasActions({ flowId: "fA", characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] }).actions;
  const shots = mapVimaxShotplanToCanvasActions({ shotplan: shotplan({ flowId: "fA", scenes: 1, shotsPerScene: 2 }) }).actions;
  const p = canvasActionProfile([...story, ...cast, ...shots]);
  assert.ok(p.lineageComplete, "story/cast (-1 sentinel) do not break lineageComplete");
  assert.ok(p.cardPrepPaired, "1:1:1 still holds (story/cast are not card/prep)");
  assert.ok(p.allNodeTypesSafe && p.hasTidy);
});
