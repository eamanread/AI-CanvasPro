import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// Phase C (C3.3): 「确认定妆」routes to the NATIVE portraits lane when the server
// reports the in-process brain configured. Same cost sign + three-view landing;
// only the portraits submit + job poll hit /native/*.

function portraitNode(id, flowId, charIdx, view) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "portrait", vimaxCharIdx: charIdx, vimaxView: view } };
}

function makeGraphStore(nodes = []) {
  const patches = [];
  return { nodes, patches, updateNodeData(id, patch) { patches.push({ id, patch }); } };
}

function threeViewChar(idx, identifier) {
  return { idx, identifier, views: [
    { view: "front", url: `u-${idx}-front` },
    { view: "side", url: `u-${idx}-side` },
    { view: "back", url: `u-${idx}-back` },
  ] };
}

function nativePortraitsJob(characters, elapsedSec = 2.1) {
  return { success: true, status: "done", progress: [], progressTotal: 0,
           result: { schemaVersion: "vimax-portraits-result/v1", characters, elapsedSec } };
}

test("C3.3: 确认定妆 routes to the native portraits lane when native is configured", async () => {
  const graphStore = makeGraphStore([
    portraitNode("p-0-front", "f1", 0, "front"),
    portraitNode("p-0-side", "f1", 0, "side"),
    portraitNode("p-0-back", "f1", 0, "back"),
  ]);
  const calls = { nativePortraits: null, externalPortraits: 0 };
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativePortraits(p) { calls.nativePortraits = p; return { success: true, jobId: "nj-p" }; },
    async vimaxNativeJob() { return nativePortraitsJob([threeViewChar(0, "Alice")]); },
    // external present (the dispatch guard requires vimaxPortraits) but must NOT
    // be exercised when native is on.
    async vimaxPortraits() { calls.externalPortraits++; return { success: true, jobId: "x" }; },
    async vimaxJob() { throw new Error("external poll must not be used in native mode"); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxPortraits = { flowId: "f1", characterIdxs: [0], capTotal: 3 };

  const res = await state.sendMessage("确认定妆");

  assert.ok(calls.nativePortraits, "native portraits endpoint used");
  assert.equal(calls.externalPortraits, 0, "external portraits NOT used");
  assert.equal(calls.nativePortraits.ticketId, "tkt", "the signed ticket is carried to native portraits");
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("p-0-front").imageUrl, "u-0-front");
  assert.equal(lastPatch("p-0-side").imageUrl, "u-0-side");
  assert.equal(lastPatch("p-0-back").imageUrl, "u-0-back");
  assert.match(state.lastReceipt, /定妆收工/);
  assert.equal(res.vimaxPortraits.done, 1);
});

// (C5.2: the "stays on the external lane when unconfigured" test was removed -
// the external 定妆 lane no longer exists; native is the only runtime.)
