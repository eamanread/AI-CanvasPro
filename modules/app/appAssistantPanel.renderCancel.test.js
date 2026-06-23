import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// Slice 0 (doc 23 §4.5 / §9): a 成片 render polls the server for up to 40
// minutes. Before this slice the poll loop had NO cancel check, so the send
// button (disabled = state.streaming) was a dead 40-minute lock with no escape.
// Per the user's single-flight rule #2, a render in flight turns the send
// button into 进行中⏹; clicking it CANCELS the render. This file pins the
// headless core: state.cancelActiveRender() + the poll-loop break + the clean
// 已取消 receipt that keeps the staged budget for 补拍.

function prepNode(id, flowId, shotIdx, prompt) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "prep", vimaxShotIdx: shotIdx, prompt } };
}

function makeGraphStore(nodes) {
  const patches = [];
  return { nodes, patches, updateNodeData(id, patch) { patches.push({ id, patch }); } };
}

test("cancelActiveRender is a no-op (returns false) when no render is in flight", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore([]) });
  assert.equal(state.vimaxRenderInFlight, undefined, "no render in flight at rest");
  assert.equal(state.cancelActiveRender(), false, "no-op returns false");
  assert.ok(!state.vimaxRenderCancelRequested, "no cancel flag raised when nothing to cancel");
});

test("cancelActiveRender raises the cancel flag and returns true while a render is in flight", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore([]) });
  state.vimaxRenderInFlight = true;
  state.vimaxRenderJobId = "nj-r";
  assert.equal(state.cancelActiveRender(), true, "in-flight cancel returns true");
  assert.equal(state.vimaxRenderCancelRequested, true, "cancel flag is raised for the poll loop");
});

test("a cancel during the poll loop breaks out, tells the server, keeps landed frames + the staged budget", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  const calls = { cancel: [], jobPolls: 0 };
  let panelState = null;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj-r" }; },
    async vimaxNativeJob() {
      calls.jobPolls += 1;
      if (calls.jobPolls === 1) {
        // First poll: one frame lands, then the user clicks ⏹ mid-render.
        panelState.vimaxRenderCancelRequested = true;
        return { success: true, status: "running", progress: [], progressTotal: 0,
                 outputs: [{ shotIdx: 0, url: "https://g/0.png" }] };
      }
      // The loop must not keep polling forever after a cancel.
      return { success: true, status: "running", progress: [], progressTotal: 0, outputs: [] };
    },
    async vimaxNativeCancel(jobId) { calls.cancel.push(jobId); return { success: true, status: "cancelled" }; },
  };
  panelState = createAssistantPanelState({ api, graphStore });
  panelState.renderPollIntervalMs = 1; // keep the test fast; prod stays 3000ms
  panelState.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const res = await panelState.sendMessage("确认成片");

  assert.deepEqual(calls.cancel, ["nj-r"], "the server job is cancelled by jobId, best-effort");
  assert.match(panelState.lastReceipt, /取消/, "receipt reports the cancel");
  assert.ok(res && res.vimaxRender && res.vimaxRender.cancelled, "cancel is surfaced on the return value");
  // The frame that landed before the cancel is kept (no double-spend on 补拍).
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("prep-0")?.imageUrl, "https://g/0.png", "the frame landed before cancel is kept");
  // Staged budget is preserved so 「确认成片」 re-render only redraws the gaps.
  assert.ok(panelState.pendingVimaxRender, "the staged render budget is kept for 补拍");
  assert.equal(panelState.streaming, false, "streaming flag is released after cancel");
});
