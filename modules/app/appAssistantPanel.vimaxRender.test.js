import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// P2-M11 (F6): the cost-sovereign render orchestration. A prior 成片: plan
// stages state.pendingVimaxRender (flowId + shotIdxs); the explicit
// 「确认成片」then collects the prep-node prompt edits, signs a render-ticket
// (budget cap), renders keyframes through the broker, lands the urls back on
// the prep nodes, and posts a 收工条.

function prepNode(id, flowId, shotIdx, prompt) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "prep", vimaxShotIdx: shotIdx, prompt } };
}

function makeGraphStore(nodes) {
  const patches = [];
  return {
    nodes,
    patches,
    updateNodeData(id, patch) {
      patches.push({ id, patch });
    },
  };
}

function doneJob(outputs, elapsedSec = 1.2) {
  return { status: "done", outputs, progress: [], progressTotal: outputs.length, result: { outputs, elapsedSec } };
}

test("B0-M3: re-render invalidates only the shots whose prompt changed since last render", async () => {
  // prep-0 was edited (prompt now differs from what was last rendered);
  // prep-1 unchanged. Re-confirm must invalidate only shot 0 so its old
  // keyframe is re-drawn, while shot 1 reuses its frame.
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "EDITED prompt 0"),
    prepNode("prep-1", "f1", 1, "prompt 1"),
  ]);
  const calls = { render: null };
  const api = {
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender(p) { calls.render = p; return { success: true, jobId: "j" }; },
    async vimaxNativeJob() { return doneJob([{ shotIdx: 0, url: "https://g/0.png" }, { shotIdx: 1, url: "https://g/1.png" }]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  // pending carries what was rendered before: shot 0 had the OLD prompt.
  state.pendingVimaxRender = {
    flowId: "f1", shotIdxs: [0, 1],
    renderedEdits: { 0: "OLD prompt 0", 1: "prompt 1" },
  };

  await state.sendMessage("确认成片");

  assert.deepEqual(calls.render.invalidateShotIdxs, [0], "only the edited shot is invalidated");
});

test("B0-M3: first render (no prior renderedEdits) invalidates nothing", async () => {
  const graphStore = makeGraphStore([prepNode("prep-0", "f1", 0, "p0")]);
  const calls = { render: null };
  const api = {
    async vimaxSign(p) { return { success: true, ticketId: "tkt", capTotal: p.capTotal }; },
    async vimaxNativeRender(p) { calls.render = p; return { success: true, jobId: "j" }; },
    async vimaxNativeJob() { return doneJob([{ shotIdx: 0, url: "https://g/0.png" }]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  await state.sendMessage("确认成片");

  assert.deepEqual(calls.render.invalidateShotIdxs, [], "fresh render invalidates nothing");
});

test("M11 render: 确认成片 signs the budget, renders, lands keyframes, posts 收工条, clears pending", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "EDITED shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  const calls = { sign: null, render: null };
  const api = {
    async vimaxSign(payload) {
      calls.sign = payload;
      return { success: true, ticketId: "tkt-1", capTotal: payload.capTotal };
    },
    async vimaxNativeRender(payload) {
      calls.render = payload;
      return { success: true, jobId: "job-1" };
    },
    async vimaxNativeJob() {
      return doneJob([
        { shotIdx: 0, url: "https://grsai/img0.png", localPath: "/wd/s0.png" },
        { shotIdx: 1, url: "https://grsai/img1.png", localPath: "/wd/s1.png" },
      ]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const response = await state.sendMessage("确认成片");

  // Budget signed for the selected shots + the VLM-判官 reshoot allowance
  // (M17): 2 shots -> retryBudget round(2/2)=1 -> capTotal 3.
  assert.equal(calls.sign.flowId, "f1");
  assert.equal(calls.sign.capTotal, 3);
  assert.deepEqual(calls.sign.shotIdxs, [0, 1]);

  // Render carries the ticket + the prep-node prompt edits + the retry budget.
  assert.equal(calls.render.ticketId, "tkt-1");
  assert.equal(calls.render.retryBudget, 1);
  assert.equal(calls.render.maxReshootsPerShot, 1);
  assert.deepEqual(calls.render.shotIdxs, [0, 1]);
  assert.deepEqual(calls.render.edits, [
    { shotIdx: 0, ffDesc: "EDITED shot 0" },
    { shotIdx: 1, ffDesc: "shot 1" },
  ]);

  // Keyframe urls landed on the matching prep nodes.
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("prep-0").imageUrl, "https://grsai/img0.png");
  assert.equal(lastPatch("prep-0").generationStatus, "completed");
  assert.equal(lastPatch("prep-1").imageUrl, "https://grsai/img1.png");

  // 收工条 + pending cleared so a stray 确认成片 can't re-spend.
  assert.match(state.lastReceipt, /收工/);
  assert.match(state.lastReceipt, /2\/2/);
  assert.equal(state.pendingVimaxRender, null);
  assert.equal(response.vimaxRender.done, 2);
});

test("M11 render: a deleted prep node drops its shot from the budget and the render selection", async () => {
  // Shot 1's prep was deleted on the canvas -> only shot 0 should render.
  const graphStore = makeGraphStore([prepNode("prep-0", "f1", 0, "shot 0")]);
  const calls = { sign: null, render: null };
  const api = {
    async vimaxSign(payload) {
      calls.sign = payload;
      return { success: true, ticketId: "tkt-2", capTotal: payload.capTotal };
    },
    async vimaxNativeRender(payload) {
      calls.render = payload;
      return { success: true, jobId: "job-2" };
    },
    async vimaxNativeJob() {
      return doneJob([{ shotIdx: 0, url: "https://grsai/only0.png" }]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  await state.sendMessage("确认成片");

  // 1 shot -> retryBudget round(1/2)=1 -> capTotal 2.
  assert.equal(calls.sign.capTotal, 2);
  assert.deepEqual(calls.sign.shotIdxs, [0]);
  assert.deepEqual(calls.render.shotIdxs, [0]);
  assert.match(state.lastReceipt, /1\/1/);
});

test("M11 render: 确认成片 with no staged budget never signs or renders (no spend)", async () => {
  let signed = false;
  let rendered = false;
  const api = {
    async vimaxSign() {
      signed = true;
      return { success: true, ticketId: "x" };
    },
    async vimaxNativeRender() {
      rendered = true;
      return { success: true, jobId: "x" };
    },
    async chat() {
      return { reply: "ok", actions: [] };
    },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore([]) });
  // No state.pendingVimaxRender.

  await state.sendMessage("确认成片");

  assert.equal(signed, false, "must not sign a budget without a staged render");
  assert.equal(rendered, false, "must not render without a staged budget");
  assert.equal(state.pendingVimaxRender ?? null, null);
});

test("M11 render: a failed shot is reported in the 收工条 and does not block the others", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  const api = {
    async vimaxSign(payload) {
      return { success: true, ticketId: "tkt-3", capTotal: payload.capTotal };
    },
    async vimaxNativeRender() {
      return { success: true, jobId: "job-3" };
    },
    async vimaxNativeJob() {
      return doneJob([
        { shotIdx: 0, url: "https://grsai/ok0.png" },
        { shotIdx: 1, error: "HY_TICKET_CAP_EXCEEDED" },
      ]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const response = await state.sendMessage("确认成片");

  assert.equal(response.vimaxRender.done, 1);
  assert.equal(response.vimaxRender.failed, 1);
  assert.match(state.lastReceipt, /1\/2/);
  assert.match(state.lastReceipt, /失败\/缺失 1/);
  // The succeeded shot still landed.
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("prep-0").imageUrl, "https://grsai/ok0.png");
  // A shot still outstanding -> budget stays staged so 重发确认成片 can 补拍.
  assert.notEqual(state.pendingVimaxRender, null);
});

test("M11 render: out-of-order / repeated streamed outputs land on the right node exactly once", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  let poll = 0;
  const api = {
    async vimaxSign(payload) {
      return { success: true, ticketId: "tkt-4", capTotal: payload.capTotal };
    },
    async vimaxNativeRender() {
      return { success: true, jobId: "job-4" };
    },
    async vimaxNativeJob() {
      poll += 1;
      // Poll 1: shot 1 arrives BEFORE shot 0 (reordered), still running.
      if (poll === 1) {
        return {
          status: "running",
          outputs: [{ shotIdx: 1, url: "https://grsai/b1.png" }, { shotIdx: 0, url: "https://grsai/a0.png" }],
          progress: [{ phase: "frame-0-1" }],
          progressTotal: 2,
        };
      }
      // Poll 2: done; outputs repeat the same frames (must not re-paint).
      return doneJob([
        { shotIdx: 0, url: "https://grsai/a0.png" },
        { shotIdx: 1, url: "https://grsai/b1.png" },
      ]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  await state.sendMessage("确认成片");

  // Each shot's url landed on ITS node despite the reorder...
  const patchesFor = (id) => graphStore.patches.filter((p) => p.id === id);
  assert.equal(patchesFor("prep-0").at(-1).patch.imageUrl, "https://grsai/a0.png");
  assert.equal(patchesFor("prep-1").at(-1).patch.imageUrl, "https://grsai/b1.png");
  // ...and exactly once each (dedup by shotIdx across polls + reconcile).
  assert.equal(patchesFor("prep-0").length, 1);
  assert.equal(patchesFor("prep-1").length, 1);
});

test("M11 render: a concurrent second 确认成片 does not sign a second budget (no double-spend)", async () => {
  const graphStore = makeGraphStore([prepNode("prep-0", "f1", 0, "shot 0")]);
  let signCount = 0;
  let renderCount = 0;
  const api = {
    async vimaxSign(payload) {
      signCount += 1;
      return { success: true, ticketId: "tkt-5", capTotal: payload.capTotal };
    },
    async vimaxNativeRender() {
      renderCount += 1;
      return { success: true, jobId: "job-5" };
    },
    async vimaxNativeJob() {
      return doneJob([{ shotIdx: 0, url: "https://grsai/x.png" }]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0] };

  // Fire two confirms without awaiting the first - the in-flight guard
  // (set synchronously before the first await) must reject the second.
  const first = state.sendMessage("确认成片");
  const second = state.sendMessage("确认成片");
  await Promise.all([first, second]);

  assert.equal(signCount, 1, "must sign exactly one budget for two racing confirms");
  assert.equal(renderCount, 1, "must render exactly once");
});

test("M11 render: a shot the server drops entirely is reported as missing, budget kept", async () => {
  const graphStore = makeGraphStore([
    prepNode("prep-0", "f1", 0, "shot 0"),
    prepNode("prep-1", "f1", 1, "shot 1"),
  ]);
  const api = {
    async vimaxSign(payload) {
      return { success: true, ticketId: "tkt-6", capTotal: payload.capTotal };
    },
    async vimaxNativeRender() {
      return { success: true, jobId: "job-6" };
    },
    async vimaxNativeJob() {
      // Only shot 0 came back; shot 1 vanished (no url, no error, no skip).
      return doneJob([{ shotIdx: 0, url: "https://grsai/only.png" }]);
    },
  };

  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxRender = { flowId: "f1", shotIdxs: [0, 1] };

  const response = await state.sendMessage("确认成片");

  assert.equal(response.vimaxRender.done, 1);
  assert.equal(response.vimaxRender.missing, 1);
  assert.match(state.lastReceipt, /失败\/缺失 1/);
  assert.notEqual(state.pendingVimaxRender, null, "outstanding shot keeps the budget staged for 补拍");
});
