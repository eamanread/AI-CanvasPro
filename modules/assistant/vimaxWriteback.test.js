import assert from "node:assert/strict";
import test from "node:test";

import { collectVimaxEdits, selectedRenderShotIdxs } from "./vimaxWriteback.js";

test("collectVimaxEdits: only prep nodes of the matching flow, keyed by canvas shotIdx", () => {
  const nodes = [
    { id: "card0", data: { vimaxFlowId: "f1", vimaxRole: "card", vimaxShotIdx: 0, shotPrompt: "card text" } },
    { id: "prep0", data: { vimaxFlowId: "f1", vimaxRole: "prep", vimaxShotIdx: 0, prompt: "EDITED prompt 0" } },
    { id: "prep1", data: { vimaxFlowId: "f1", vimaxRole: "prep", vimaxShotIdx: 1, prompt: "prompt 1" } },
    { id: "other", data: { vimaxFlowId: "f2", vimaxRole: "prep", vimaxShotIdx: 0, prompt: "other flow" } },
    { id: "plain", data: { prompt: "not a vimax node" } },
  ];
  const edits = collectVimaxEdits(nodes, "f1");
  assert.deepEqual(edits, [
    { shotIdx: 0, ffDesc: "EDITED prompt 0" },
    { shotIdx: 1, ffDesc: "prompt 1" },
  ], "prep nodes only, card ignored, other flow ignored");
});

test("collectVimaxEdits: double-form (flattened top-level) read", () => {
  // Real store flattens data to the node top level (node.data empty).
  const nodes = [
    { id: "p", vimaxFlowId: "f1", vimaxRole: "prep", vimaxShotIdx: 2, prompt: "flat prompt" },
  ];
  const edits = collectVimaxEdits(nodes, "f1");
  assert.deepEqual(edits, [{ shotIdx: 2, ffDesc: "flat prompt" }]);
});

test("selectedRenderShotIdxs: a deleted prep node drops its shot from the render selection", () => {
  const nodes = [
    { id: "prep0", data: { vimaxFlowId: "f1", vimaxRole: "prep", vimaxShotIdx: 0, prompt: "a" } },
    { id: "prep2", data: { vimaxFlowId: "f1", vimaxRole: "prep", vimaxShotIdx: 2, prompt: "c" } },
  ];
  // shot 1's prep was deleted -> only 0 and 2 render
  assert.deepEqual(selectedRenderShotIdxs(nodes, "f1", [0, 1, 2]), [0, 2]);
});
