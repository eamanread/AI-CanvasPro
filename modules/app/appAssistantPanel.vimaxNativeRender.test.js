import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// Phase C (C2.3): 「确认成片」routes to the NATIVE render lane when the server
// reports the in-process brain configured (HY_VIMAX_NATIVE). The cost sign
// (same broker), keyframe landing, and 收工条 are identical - only the render
// submit + job poll hit /native/*. Native lands keyframes via result.outputs
// (no top-level streaming outputs), so this also locks the final-reconcile path.

function prepNode(id, flowId, shotIdx, prompt) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "prep", vimaxShotIdx: shotIdx, prompt } };
}

function makeGraphStore(nodes) {
  const patches = [];
  return { nodes, patches, updateNodeData(id, patch) { patches.push({ id, patch }); } };
}

function nativeDoneJob(outputs, elapsedSec = 1.2) {
  // Native streams via progress step events, NOT a top-level outputs array, so
  // keyframes land through the final reconcile (status.result.outputs).
  return { success: true, status: "done", progress: [], progressTotal: 0,
           result: { schemaVersion: "vimax-render-result/v1", outputs, elapsedSec } };
}

test("C2.3: 确认成片 routes to the native render lane when native is configured", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  const calls = { nativeRender: null, externalRender: 0 };
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender(p) { calls.nativeRender = p; return { success: true, jobId: "nj-r" }; },
    async vimaxNativeJob() {
      return nativeDoneJob([
        { shotIdx: 0, url: "https://g/0.png", localPath: "/wd/0.png" },
        { shotIdx: 1, url: "https://g/1.png", localPath: "/wd/1.png" },
      ]);
    },
    // external lane present (the dispatch guard requires vimaxRender) but must
    // NOT be exercised when native is on.
    async vimaxRender() { calls.externalRender++; return { success: true, jobId: "x" }; },
    async vimaxJob() { throw new Error("external poll must not be used in native mode"); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const res = await state.sendMessage("确认成片");

  assert.ok(calls.nativeRender, "native render endpoint used");
  assert.equal(calls.externalRender, 0, "external render NOT used");
  assert.equal(calls.nativeRender.ticketId, "tkt", "the signed ticket is carried to native render");
  assert.equal(calls.nativeRender.retryBudget, 1, "judge reshoot budget carried (2 shots -> 1)");
  // Keyframes landed on the prep nodes via the final reconcile.
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("prep-0").imageUrl, "https://g/0.png");
  assert.equal(lastPatch("prep-1").imageUrl, "https://g/1.png");
  assert.match(state.lastReceipt, /收工/);
  assert.equal(res.vimaxRender.done, 2);
  assert.equal(state.pendingVimaxRender, null, "pending cleared on full success");
});

// (C5.2: the "stays on the external lane when unconfigured" test was removed -
// the external render lane no longer exists; native is the only runtime.)
