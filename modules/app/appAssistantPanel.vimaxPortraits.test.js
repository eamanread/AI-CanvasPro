import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// P3-M15 (F6 定妆): the cost-sovereign portrait quick-sign. 定妆: lays out
// empty three-view placeholders + stages a budget (no spend); 确认定妆 signs,
// runs the portraits, and lands each view url onto its placeholder (created
// by turn 1, so it already exists - same landing as M11 keyframes).

function portraitNode(id, flowId, charIdx, view) {
  return { id, data: { vimaxFlowId: flowId, vimaxRole: "portrait", vimaxCharIdx: charIdx, vimaxView: view } };
}

function makeGraphStore(nodes = []) {
  const patches = [];
  return {
    nodes,
    patches,
    updateNodeData(id, patch) {
      patches.push({ id, patch });
    },
  };
}

const PLAN_CHARS = [
  { idx: 0, identifier: "男主", isVisible: true },
  { idx: 1, identifier: "女主", isVisible: true },
  { idx: 2, identifier: "旁白", isVisible: false },
];

function portraitsJob(characters, elapsedSec = 2.1) {
  return { status: "done", result: { characters, elapsedSec }, progress: [], progressTotal: 0 };
}

function threeViewChar(idx, identifier) {
  return {
    idx,
    identifier,
    views: [
      { view: "front", url: `u-${idx}-front` },
      { view: "side", url: `u-${idx}-side` },
      { view: "back", url: `u-${idx}-back` },
    ],
  };
}

test("定妆: stages a budget + lays three-view placeholders, with NO spend", async () => {
  let signed = false;
  const api = {
    async vimaxPlan() { return { success: true, jobId: "j" }; },
    async vimaxNativePortraits() { return { success: true, jobId: "p" }; },
    async vimaxSign() { signed = true; return { success: true, ticketId: "t" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  state.lastVimaxPlan = { flowId: "f1", characters: PLAN_CHARS };

  const response = await state.sendMessage("定妆:");

  assert.equal(signed, false, "定妆 (turn 1) must not spend");
  // visible characters only (男主 + 女主) -> 2 chars × 3 views = 6 cap.
  assert.equal(state.pendingVimaxPortraits.capTotal, 6);
  assert.deepEqual(state.pendingVimaxPortraits.characterIdxs, [0, 1]);
  // placeholder create actions: 2 chars × 3 views = 6 create_node.
  const creates = response.actionsByStep.step_portraits.filter((a) => a.type === "create_node");
  assert.equal(creates.length, 6);
  assert.ok(creates.every((a) => a.autoStart === false && a.data.assetRole === "character" && a.data.vimaxRole === "portrait"));
});

test("定妆: 男主 resolves the named character only", async () => {
  const api = {
    async vimaxNativePortraits() { return { success: true }; },
    async vimaxSign() { return { success: true, ticketId: "t" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  state.lastVimaxPlan = { flowId: "f1", characters: PLAN_CHARS };

  await state.sendMessage("定妆: 男主");

  assert.deepEqual(state.pendingVimaxPortraits.characterIdxs, [0]);
  assert.equal(state.pendingVimaxPortraits.capTotal, 3);
});

test("定妆 without a prior plan fails (needs extracted characters)", async () => {
  const api = {
    async vimaxNativePortraits() { return { success: true }; },
    async vimaxSign() { return { success: true, ticketId: "t" }; },
    async vimaxPlan() { return { success: true, jobId: "j" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  // no state.lastVimaxPlan
  await state.sendMessage("定妆: 男主");
  assert.match(state.lastReceipt, /请先/);
  assert.equal(state.pendingVimaxPortraits ?? null, null);
});

test("确认定妆 signs the budget, runs portraits, lands all views, posts 收工条, clears pending", async () => {
  const graphStore = makeGraphStore([
    portraitNode("p-0-front", "f1", 0, "front"),
    portraitNode("p-0-side", "f1", 0, "side"),
    portraitNode("p-0-back", "f1", 0, "back"),
  ]);
  const calls = { sign: null, portraits: null };
  const api = {
    async vimaxSign(payload) { calls.sign = payload; return { success: true, ticketId: "tkt-p", capTotal: payload.capTotal }; },
    async vimaxNativePortraits(payload) { calls.portraits = payload; return { success: true, jobId: "job-p" }; },
    async vimaxNativeJob() { return portraitsJob([threeViewChar(0, "男主")]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxPortraits = { flowId: "f1", characterIdxs: [0], capTotal: 3, invalidateCharacterIdxs: [] };

  const response = await state.sendMessage("确认定妆");

  assert.equal(calls.sign.capTotal, 3);
  assert.equal(calls.portraits.ticketId, "tkt-p");
  assert.deepEqual(calls.portraits.characterIdxs, [0]);
  const lastPatch = (id) => graphStore.patches.filter((p) => p.id === id).pop()?.patch;
  assert.equal(lastPatch("p-0-front").imageUrl, "u-0-front");
  assert.equal(lastPatch("p-0-side").imageUrl, "u-0-side");
  assert.equal(lastPatch("p-0-back").imageUrl, "u-0-back");
  assert.equal(lastPatch("p-0-front").generationStatus, "completed");
  assert.match(state.lastReceipt, /1\/1 角色/);
  assert.equal(response.vimaxPortraits.landed, 3);
  assert.equal(state.pendingVimaxPortraits, null);
});

test("确认定妆 with no staged budget never signs or runs portraits (no spend)", async () => {
  let signed = false, ran = false;
  const api = {
    async vimaxSign() { signed = true; return { success: true, ticketId: "t" }; },
    async vimaxNativePortraits() { ran = true; return { success: true, jobId: "p" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
    async chat() { return { reply: "ok", actions: [] }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  await state.sendMessage("确认定妆");
  assert.equal(signed, false);
  assert.equal(ran, false);
});

test("重摇: 男主 re-stages with an invalidate flag, and 确认定妆 forwards it", async () => {
  const graphStore = makeGraphStore([
    portraitNode("p-0-front", "f1", 0, "front"),
    portraitNode("p-0-side", "f1", 0, "side"),
    portraitNode("p-0-back", "f1", 0, "back"),
  ]);
  let portraitsPayload = null;
  const api = {
    async vimaxSign(payload) { return { success: true, ticketId: "tkt-r", capTotal: payload.capTotal }; },
    async vimaxNativePortraits(payload) { portraitsPayload = payload; return { success: true, jobId: "job-r" }; },
    async vimaxNativeJob() { return portraitsJob([threeViewChar(0, "男主")]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.lastVimaxPlan = { flowId: "f1", characters: PLAN_CHARS };

  await state.sendMessage("重摇: 男主");
  assert.deepEqual(state.pendingVimaxPortraits.invalidateCharacterIdxs, [0]);

  await state.sendMessage("确认定妆");
  assert.deepEqual(portraitsPayload.invalidateCharacterIdxs, [0], "reshoot invalidation forwarded to the runner");
});

test("定妆: an ambiguous name (男 -> 男主/男二) is rejected with no spend", async () => {
  let signed = false;
  const api = {
    async vimaxNativePortraits() { return { success: true }; },
    async vimaxSign() { signed = true; return { success: true, ticketId: "t" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  state.lastVimaxPlan = { flowId: "f1", characters: [
    { idx: 0, identifier: "男主", isVisible: true },
    { idx: 1, identifier: "男二", isVisible: true },
  ] };

  await state.sendMessage("定妆: 男");
  assert.match(state.lastReceipt, /歧义/);
  assert.equal(state.pendingVimaxPortraits ?? null, null);
  assert.equal(signed, false);

  // ...but the exact full name resolves to just that character.
  await state.sendMessage("定妆: 男主");
  assert.deepEqual(state.pendingVimaxPortraits.characterIdxs, [0]);
});

test("重摇 in prose (no colon, not 整套) is NOT hijacked into the portrait lane", async () => {
  let chatCalled = false;
  const api = {
    async vimaxNativePortraits() { return { success: true }; },
    async vimaxSign() { return { success: true, ticketId: "t" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
    async chat() { chatCalled = true; return { reply: "ok", actions: [] }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  state.lastVimaxPlan = { flowId: "f1", characters: PLAN_CHARS };

  await state.sendMessage("重摇一下这个镜头感觉怎么样");
  assert.equal(state.pendingVimaxPortraits ?? null, null, "prose must not stage a reshoot");
  assert.equal(chatCalled, true, "falls through to the normal PI chat lane");
});

test("重摇整套 (no colon) re-stages all visible characters with invalidate", async () => {
  const api = {
    async vimaxNativePortraits() { return { success: true }; },
    async vimaxSign() { return { success: true, ticketId: "t" }; },
    async vimaxNativeJob() { return portraitsJob([]); },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  state.lastVimaxPlan = { flowId: "f1", characters: PLAN_CHARS };

  await state.sendMessage("重摇整套");
  assert.deepEqual(state.pendingVimaxPortraits.characterIdxs, [0, 1]);
  assert.deepEqual(state.pendingVimaxPortraits.invalidateCharacterIdxs, [0, 1]);
});

test("确认定妆 re-entrancy: a concurrent second confirm does not sign twice", async () => {
  const graphStore = makeGraphStore([portraitNode("p-0-front", "f1", 0, "front")]);
  let signCount = 0;
  const api = {
    async vimaxSign(payload) { signCount += 1; return { success: true, ticketId: "t", capTotal: payload.capTotal }; },
    async vimaxNativePortraits() { return { success: true, jobId: "p" }; },
    async vimaxNativeJob() { return portraitsJob([threeViewChar(0, "男主")]); },
  };
  const state = createAssistantPanelState({ api, graphStore });
  state.pendingVimaxPortraits = { flowId: "f1", characterIdxs: [0], capTotal: 3, invalidateCharacterIdxs: [] };

  const a = state.sendMessage("确认定妆");
  const b = state.sendMessage("确认定妆");
  await Promise.all([a, b]);
  assert.equal(signCount, 1);
});
