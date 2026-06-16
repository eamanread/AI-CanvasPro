import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// Slice 2 (doc 23 §4, C1 收口): a 成片 render produces a LIVING card in
// message.cards[] (type "vimax_render", background:true) — NOT an executionStore
// entry (its whitelist drops kind/cancel) and NOT a canvas_actions card (whose
// status is synced off node state). The card is created "running" at submit and
// driven to a terminal status (completed | cancelled | failed) by the render
// lane. The receipt / return value / graphStore landing / pending budget stay
// exactly as slice 1 left them (locked by the vimaxNativeRender tests).

function prepNode(id, flowId, shotIdx, prompt) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "prep", vimaxShotIdx: shotIdx, prompt } };
}
function makeGraphStore(nodes) {
  const patches = [];
  return { nodes, patches, updateNodeData(id, patch) { patches.push({ id, patch }); } };
}
function latestRenderCard(state) {
  for (let i = state.messages.length - 1; i >= 0; i -= 1) {
    const m = state.messages[i];
    if (m?.role === "assistant") {
      const cards = Array.isArray(m.cards) ? m.cards : [];
      const rc = cards.find((c) => c?.type === "vimax_render");
      if (rc) return rc;
    }
  }
  return null;
}
function doneJob(outputs, elapsedSec = 1.2) {
  return { success: true, status: "done", progress: [], progressTotal: 0,
           result: { schemaVersion: "vimax-render-result/v1", outputs, elapsedSec } };
}

test("a successful render attaches a completed vimax_render card to the assistant message", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0"), prepNode("p1", "f1", 1, "s1")]);
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob([{ shotIdx: 0, url: "https://g/0.png" }, { shotIdx: 1, url: "https://g/1.png" }]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const res = await state.sendMessage("确认成片");

  const card = latestRenderCard(state);
  assert.ok(card, "a vimax_render card is attached to the assistant message");
  assert.equal(card.type, "vimax_render");
  assert.equal(card.status, "completed", "terminal status reflects the finished render");
  assert.equal(card.background, true, "render card is backgroundable");
  assert.equal(card.shotCount, 2);
  // Parity preserved (slice 1 contract): receipt + return + landing + pending.
  assert.match(state.lastReceipt, /收工/);
  assert.equal(res.vimaxRender.done, 2);
  assert.equal(state.pendingVimaxRender, null, "pending cleared on full success");
});

test("the card is created 'running' and visible on the message BEFORE the render finishes", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0")]);
  let sawRunning = false;
  let panelState = null;
  let polls = 0;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      polls += 1;
      if (polls === 1) {
        const c = latestRenderCard(panelState);
        sawRunning = Boolean(c && c.status === "running");
        return { success: true, status: "running", progress: [{ phase: "drawing" }], progressTotal: 0, outputs: [] };
      }
      return doneJob([{ shotIdx: 0, url: "https://g/0.png" }]);
    },
  };
  panelState = createAssistantPanelState({ api, graphStore });
  panelState.renderPollIntervalMs = 1;
  panelState.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await panelState.sendMessage("确认成片");

  assert.equal(sawRunning, true, "the render card existed with status 'running' during polling");
  assert.equal(latestRenderCard(panelState).status, "completed");
});

test("cancelling a render drives the card to 'cancelled' and keeps the staged budget", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0")]);
  let panelState = null;
  let polls = 0;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      polls += 1;
      if (polls === 1) { panelState.vimaxRenderCancelRequested = true; }
      return { success: true, status: "running", progress: [], progressTotal: 0, outputs: [] };
    },
    async vimaxNativeCancel() { return { success: true, status: "cancelled" }; },
  };
  panelState = createAssistantPanelState({ api, graphStore });
  panelState.renderPollIntervalMs = 1;
  panelState.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await panelState.sendMessage("确认成片");

  const card = latestRenderCard(panelState);
  assert.ok(card, "a render card is present");
  assert.equal(card.status, "cancelled");
  assert.ok(panelState.pendingVimaxRender, "staged budget kept for 补拍");
});

test("a render failure drives the card to 'failed' and keeps pending for retry", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0")]);
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: false, status: "not-configured" }; },
    async vimaxNativeJob() { throw new Error("must not poll after a failed submit"); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  const res = await state.sendMessage("确认成片");

  assert.equal(res, null, "a failed render returns null (parity with the old fail path)");
  const card = latestRenderCard(state);
  assert.ok(card, "a render card is present even on failure");
  assert.equal(card.status, "failed");
  assert.match(state.lastReceipt, /失败/);
  assert.ok(state.pendingVimaxRender, "pending kept so 确认成片 can retry");
});

function makeConvStore() {
  const appended = [];
  return { appended, appendMessage(_convId, msg) { appended.push(msg); }, updateMessageCard() {} };
}

test("conversationStore: a successful render appends user + assistant (assistant carries the render card)", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0")]);
  const conv = makeConvStore();
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob([{ shotIdx: 0, url: "https://g/0.png" }]); },
  };
  const state = createAssistantPanelState({ api, graphStore, conversationStore: conv, conversationId: "c1" });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await state.sendMessage("确认成片");

  assert.equal(conv.appended.length, 2, "user + assistant appended once on success");
  assert.equal(conv.appended[0].role, "user");
  const assistant = conv.appended[1];
  assert.equal(assistant.role, "assistant");
  assert.ok(Array.isArray(assistant.cards) && assistant.cards.some((c) => c.type === "vimax_render"),
    "the persisted assistant message carries the render card (survives reload)");
});

test("conversationStore: a failed render does NOT append (parity with the old fail() path)", async () => {
  const graphStore = makeGraphStore([prepNode("p0", "f1", 0, "s0")]);
  const conv = makeConvStore();
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: false, status: "not-configured" }; },
    async vimaxNativeJob() { throw new Error("must not poll"); },
  };
  const state = createAssistantPanelState({ api, graphStore, conversationStore: conv, conversationId: "c1" });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await state.sendMessage("确认成片");

  assert.equal(conv.appended.length, 0, "no conversationStore append on failure (matches HEAD fail())");
});

test("an unexpected mid-render throw finalizes the render card to 'failed' (defensive finally)", async () => {
  // graphStore.updateNodeData throws -> placeKeyframe throws -> the kernel
  // propagates out of the lane's try; the finally must finalize the stuck
  // "running" card to "failed" (and notify) rather than leave it forever.
  const graphStore = { nodes: [prepNode("p0", "f1", 0, "s0")], updateNodeData() { throw new Error("store boom"); } };
  let panelState = null;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return { success: true, status: "running", progress: [], progressTotal: 0, outputs: [{ shotIdx: 0, url: "https://g/0.png" }] };
    },
  };
  panelState = createAssistantPanelState({ api, graphStore });
  panelState.renderPollIntervalMs = 1;
  panelState.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await assert.rejects(() => panelState.sendMessage("确认成片"), /store boom/);

  const card = latestRenderCard(panelState);
  assert.ok(card, "the render card is present after the throw");
  assert.equal(card.status, "failed", "the stuck card was finalized to failed by the finally");
  assert.equal(panelState.vimaxRenderInFlight, false, "the in-flight lock was released");
});
