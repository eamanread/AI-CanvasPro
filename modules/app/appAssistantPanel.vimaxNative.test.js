import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// B2: the NATIVE plan lane. 导演:/成片: route to the in-process brain
// (/api/v2/vimax/native/*) when the server reports it configured; the brain
// streams per-stage step events (surfaced as live receipts) and returns a
// vimax-shotplan/v1 that lands through the SAME trusted confirm-gate as the
// external lane. When native isn't configured, the proven external lane runs
// unchanged.

function makeGraphStore(nodes = []) {
  const patches = [];
  return { nodes, patches, updateNodeData(id, patch) { patches.push({ id, patch }); } };
}

const SHOTPLAN = {
  schemaVersion: "vimax-shotplan/v1",
  flowId: "f-native",
  story: "雨夜,两人告别。",
  characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }],
  shots: [
    { idx: 0, sceneIdx: 0, camIdx: 0, ffDesc: "wide", motionDesc: "pan", visualDesc: "v", audioDesc: "a" },
    { idx: 1, sceneIdx: 0, camIdx: 1, ffDesc: "close", motionDesc: "push" },
  ],
};

function streamedProgress() {
  return [
    { type: "step", stage: "story", payload: { story: "雨夜" } },
    { type: "step", stage: "characters", payload: { characters: SHOTPLAN.characters } },
    { type: "step", stage: "scene", payload: { sceneIdx: 0, shots: SHOTPLAN.shots } },
  ];
}

function doneJob(extra = {}) {
  return {
    success: true, status: "done",
    progress: streamedProgress(), progressTotal: 3,
    result: SHOTPLAN, persistError: null,
    ...extra,
  };
}

test("B2: native lane lands a storyboard plan through the trusted gate (导演:)", async () => {
  const calls = { nativePlan: 0, externalPlan: 0, planPayload: null };
  const api = {
    async vimaxNativeStatus() { return { success: true, configured: true }; },
    async vimaxNativePlan(p) { calls.nativePlan++; calls.planPayload = p; return { success: true, jobId: "nj1" }; },
    async vimaxNativeJob() { return doneJob(); },
    async vimaxPlan() { calls.externalPlan++; return { success: true, jobId: "x" }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:雨夜告别");

  assert.equal(calls.nativePlan, 1, "native plan endpoint used");
  assert.equal(calls.externalPlan, 0, "external plan endpoint NOT used");
  assert.ok(calls.planPayload.flowId, "a flowId was generated and sent");
  assert.equal(calls.planPayload.idea, "雨夜告别", "idea forwarded");
  assert.ok(res && res.actionsByStep && res.actionsByStep.step_layout.length, "canvas actions produced");
  const types = res.actionsByStep.step_layout.map((a) => a.nodeType).filter(Boolean);
  assert.ok(types.includes("storyboard-script"), "storyboard-script cards created");
  assert.match(res.reply, /原生/, "reply marks the native engine");
  assert.ok(res.vimaxFlowId, "execution carries flowId lineage");
  assert.ok(state.vimaxExecutionIds instanceof Set && state.vimaxExecutionIds.size >= 1,
    "execution id trusted for lineage (V5)");
});

test("C5.2: 导演: routes native-only (the external venv plan lane was retired)", async () => {
  // No api.vimaxPlan exists anymore; the plan dispatch goes native whenever
  // api.vimaxNativePlan is present (no shouldUseNativeVimax probe, no fallback).
  const calls = { nativePlan: 0 };
  const api = {
    async vimaxNativePlan() { calls.nativePlan++; return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:测试");
  assert.equal(calls.nativePlan, 1, "native lane used (no external fallback)");
  assert.match(res.reply, /原生/, "native reply");
});

test("B2: 成片 stages a pending render on the native flow (cost gate preserved)", async () => {
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("成片:雨夜告别");

  assert.ok(state.pendingVimaxRender, "render staged");
  assert.equal(state.pendingVimaxRender.flowId, res.vimaxFlowId, "staged on the native flow's id");
  assert.deepEqual(state.pendingVimaxRender.shotIdxs, [0, 1], "all shots staged");
  assert.match(res.reply, /确认成片/, "prompts for the cost confirm");
});

test("B2: a working_dir persist failure is surfaced so the user re-plans before 成片", async () => {
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob({ persistError: "working_dir persist failed: disk full" }); },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("成片:雨夜");
  assert.match(res.reply, /工作目录落盘失败/, "persist failure warned in the reply");
});

test("B2: a busy native orchestrator fails gracefully (no spend, clear message)", async () => {
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: false, status: "busy", error: "limit reached" }; },
    async vimaxNativeJob() { throw new Error("should not poll"); },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:x");
  assert.equal(res, null, "no plan response");
  assert.equal(state.status, "error");
  assert.match(state.lastReceipt, /繁忙/, "busy surfaced");
});

test("B2: brain thinking is visible — step milestones stream into the receipt", async () => {
  let poll = 0;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      poll += 1;
      if (poll === 1) {
        return { success: true, status: "running", progressTotal: 1,
          progress: [{ type: "step", stage: "story", payload: { story: "x" } }] };
      }
      return doneJob();
    },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
  };
  const receipts = [];
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  await state.sendMessage("导演:雨夜", { onUpdate: () => receipts.push(state.lastReceipt) });

  assert.ok(poll >= 2, "polled until done");
  assert.ok(receipts.some((r) => /规划中：故事成型/.test(String(r || ""))),
    "a 思考可见 milestone reached the receipt during polling");
});

// --- B2-review#1: native failure-mode coverage (the code handles these; lock them) ---

function nativeApi(jobImpl) {
  return {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob(id, since) { return jobImpl(id, since); },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
  };
}

test("B2-edge: status=failed surfaces the error, no plan landed", async () => {
  const api = nativeApi(() => ({ success: true, status: "failed", error: "brain crashed", progress: [], progressTotal: 0 }));
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:x");
  assert.equal(res, null);
  assert.equal(state.status, "error");
  assert.match(state.lastReceipt, /brain crashed/);
});

test("B2-edge: done without a result fails gracefully (no crash, no actions)", async () => {
  const api = nativeApi(() => ({ success: true, status: "done", result: null, progress: [], progressTotal: 0 }));
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:x");
  assert.equal(res, null);
  assert.equal(state.status, "error");
});

test("B2-edge: not-found (server restarted) is reported, not hung", async () => {
  const api = nativeApi(() => ({ success: true, status: "not-found" }));
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:x");
  assert.equal(res, null);
  assert.match(state.lastReceipt, /任务已丢失/);
});

test("B2-edge: an empty shotplan (no shots) fails the mapping, no empty landing", async () => {
  const api = nativeApi(() => ({
    success: true, status: "done", progress: [], progressTotal: 0,
    result: { schemaVersion: "vimax-shotplan/v1", flowId: "f-empty", story: "s", characters: [], shots: [] },
  }));
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  const res = await state.sendMessage("导演:x");
  assert.equal(res, null);
  assert.equal(state.status, "error");
  assert.match(state.lastReceipt, /分镜映射失败|分镜为空/);
});

test("B2-edge: a warn event in the native stream reaches the receipt", async () => {
  let poll = 0;
  const api = nativeApi(() => {
    poll += 1;
    if (poll === 1) {
      return { success: true, status: "running", progressTotal: 1,
        progress: [{ type: "warn", stage: "working_dir", message: "429 退避中" }] };
    }
    return doneJob();
  });
  const receipts = [];
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  await state.sendMessage("导演:x", { onUpdate: () => receipts.push(state.lastReceipt) });
  assert.ok(receipts.some((r) => /提示:429 退避中/.test(String(r || ""))), "warn surfaced in receipt");
});

// (C5.2: the shouldUseNativeVimax status-probe-and-cache test was removed - the
// probe is gone; native is the only runtime, dispatched directly on api.vimaxNativePlan.)

// --- B3a: incremental story + cast landing during the native poll ---

test("B3a: native plan lands story + cast cards DURING the poll (trusted), before done", async () => {
  const landed = [];
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(payload) { return { success: true, actions: payload.actions }; },
  };
  const state = createAssistantPanelState({
    api, graphStore: makeGraphStore(),
    executeActions: (p) => { for (const a of p.actions || []) if (a.type === "create_node") landed.push(a); return {}; },
  });
  await state.sendMessage("导演:雨夜");
  const roles = landed.map((a) => a?.data?.vimaxRole).filter(Boolean);
  assert.ok(roles.includes("story"), "story card landed during poll");
  assert.ok(roles.includes("cast"), "cast sheet landed during poll");
  // D2: B3a landing now records trusted ids in the unified trustedExecutions Map
  // (single source of truth, §F-D2), each statically mapped to the vimax lineage.
  assert.ok(state.trustedExecutions instanceof Map && state.trustedExecutions.size >= 2, "trusted execution ids registered");
  assert.ok([...state.trustedExecutions.values()].every((l) => l === "vimax-director"), "all carry the vimax lineage");
});

test("B3a: story/cast land once even if a stage repeats across polls", async () => {
  let n = 0;
  const landed = [];
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      n += 1;
      if (n === 1) {
        return { success: true, status: "running", progressTotal: 2,
          progress: [
            { type: "step", stage: "story", payload: { story: "s" } },
            { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] } },
          ] };
      }
      return doneJob();
    },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({
    api, graphStore: makeGraphStore(),
    executeActions: (p) => { for (const a of p.actions || []) if (a.type === "create_node") landed.push(a); return {}; },
  });
  await state.sendMessage("导演:雨夜");
  assert.equal(landed.filter((a) => a?.data?.vimaxRole === "story").length, 1, "story landed exactly once");
  assert.equal(landed.filter((a) => a?.data?.vimaxRole === "cast").length, 1, "cast landed exactly once");
});

// --- B3b: steer pause (continue / cancel) ---

import { castContentToCharacters } from "../assistant/vimaxStoryCastCanvasActions.js";

test("B3b: native plan pauses after characters; 继续 reads the edited cast + resumes", async () => {
  let resumed = null;
  let phase = 0;
  const graphStore = makeGraphStore([]);
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return phase === 0
        ? { success: true, status: "paused", progressTotal: 2,
            progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                       { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }] } }] }
        : doneJob();
    },
    async vimaxNativeResume(jobId, characters) { resumed = { jobId, characters }; phase = 1; return { success: true, status: "running" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  assert.ok(state.pendingVimaxNativeResume, "paused -> pending set");
  assert.match(state.lastReceipt, /继续/, "prompt mentions 继续");
  // The panel generates its own flowId; the edited cast sheet on the canvas
  // carries it. Seed a cast node under the REAL flowId before 继续.
  const fid = state.pendingVimaxNativeResume.flowId;
  graphStore.nodes.push({ id: `vimax-${fid}-cast`, data: {
    vimaxFlowId: fid, vimaxRole: "cast", content: "【角色 0】Alice\n静态: EDITED\n动态: d\n出镜: 是" } });
  await state.sendMessage("继续");
  assert.ok(resumed, "resume called");
  assert.equal(resumed.characters[0].staticFeatures, "EDITED", "edited cast forwarded");
  assert.equal(state.pendingVimaxNativeResume, null, "pending cleared after resume");
});

test("B3b: 继续 resumes with a REAL store-shaped graphStore (getState().nodes, not bare .nodes)", async () => {
  // The real app graphStore exposes nodes via getState().nodes (graphNodes()),
  // NOT a bare .nodes property. applyVimaxNativeResumeCommand used to read
  // graphStore.nodes directly -> undefined on the real store -> castNode null ->
  // 「继续」 silently never resumed. Only caught in real-browser e2e (2026-06-15);
  // the other B3b tests' fake graphStore happened to expose .nodes.
  let resumed = null;
  let phase = 0;
  const nodes = [];
  const graphStore = { getState: () => ({ nodes }), updateNodeData() {} }; // NO bare .nodes
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return phase === 0
        ? { success: true, status: "paused", progressTotal: 2,
            progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                       { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }] } }] }
        : doneJob();
    },
    async vimaxNativeResume(jobId, characters) { resumed = { jobId, characters }; phase = 1; return { success: true, status: "running" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  const fid = state.pendingVimaxNativeResume.flowId;
  nodes.push({ id: `vimax-${fid}-cast`, data: {
    vimaxFlowId: fid, vimaxRole: "cast", content: "【角色 0】Alice\n静态: EDITED\n动态: d\n出镜: 是" } });
  await state.sendMessage("继续");
  assert.ok(resumed, "继续 triggered resume even with a store-shaped graphStore");
  assert.equal(resumed.characters[0].staticFeatures, "EDITED", "edited cast forwarded");
});

test("B3b: 继续 resumes when the landed cast card lost its data.vimaxRole/vimaxFlowId lineage (id-based fallback)", async () => {
  // Real-browser e2e (2026-06-15) proved that after claw + executeActions +
  // store insert, the landed cast comment card no longer carries
  // data.vimaxRole / data.vimaxFlowId (instrumented graphNodes() returned all
  // nodes but castFlows=[]). The deterministic node id `vimax-${flowId}-cast`
  // survives end-to-end (claw preserves it). applyVimaxNativeResumeCommand must
  // therefore find the cast by id, not solely by the data lineage fields.
  let resumed = null;
  let phase = 0;
  const nodes = [];
  const graphStore = { getState: () => ({ nodes }), updateNodeData() {} };
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return phase === 0
        ? { success: true, status: "paused", progressTotal: 2,
            progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                       { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }] } }] }
        : doneJob();
    },
    async vimaxNativeResume(jobId, characters) { resumed = { jobId, characters }; phase = 1; return { success: true, status: "running" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  const fid = state.pendingVimaxNativeResume.flowId;
  // Landed form: data carries ONLY content — vimaxRole/vimaxFlowId were stripped
  // by the store insert; the deterministic id is the sole surviving lineage.
  nodes.push({ id: `vimax-${fid}-cast`, type: "comment", data: {
    content: "【角色 0】Alice\n静态: EDITED\n动态: d\n出镜: 是" } });
  await state.sendMessage("继续");
  assert.ok(resumed, "继续 resumes via the deterministic cast node id even when data lineage was stripped");
  assert.equal(resumed.characters[0].staticFeatures, "EDITED", "edited cast forwarded");
});

test("B3b: 继续 with an unparseable cast sheet does NOT resume (no silent fallback)", async () => {
  let resumeCalls = 0;
  const graphStore = makeGraphStore([
    { id: "vimax-F-cast", data: { vimaxFlowId: "F", vimaxRole: "cast", content: "（内容被删光了）" } },
  ]);
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj", flowId: "F" }; },
    async vimaxNativeJob() { return { success: true, status: "paused", progressTotal: 2,
      progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                 { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "A", isVisible: true }] } }] }; },
    async vimaxNativeResume() { resumeCalls += 1; return { success: true, status: "running" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  await state.sendMessage("继续");
  assert.equal(resumeCalls, 0, "did not resume on empty parse");
  assert.ok(state.pendingVimaxNativeResume, "pending kept so the user can fix + retry");
  assert.match(state.lastReceipt, /未从角色表解析|检查格式/, "clarification posted");
});

test("B3b: 取消 cancels the paused job and clears pending", async () => {
  let cancelled = false;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj", flowId: "F" }; },
    async vimaxNativeJob() { return { success: true, status: "paused", progressTotal: 1,
      progress: [{ type: "step", stage: "story", payload: { story: "s" } }] }; },
    async vimaxNativeCancel() { cancelled = true; return { success: true, status: "cancelled" }; },
    async vimaxPlan() { return { success: true, jobId: "x" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  await state.sendMessage("取消");
  assert.ok(cancelled);
  assert.equal(state.pendingVimaxNativeResume, null);
});

test("B3b: a bare 继续 with NOTHING pending does not trigger resume", async () => {
  let resumeCalls = 0;
  const api = {
    async chat() { return { reply: "ok", actions: [] }; },
    async vimaxNativeResume() { resumeCalls += 1; return { success: true, status: "running" }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore() });
  await state.sendMessage("继续");          // exact match, but no pending
  await state.sendMessage("继续讲下去这个故事"); // prose, never matches the gate regex
  assert.equal(resumeCalls, 0, "no pending -> the resume gate never fires");
});

test("B3b: parser sanity - the cast sheet a paused plan lands round-trips", () => {
  const content = "角色表(说明)\n【角色 0】Alice\n静态: a\n动态: b\n出镜: 否";
  const parsed = castContentToCharacters(content);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].isVisible, false);
});

// D4: the B3 pause must surface as a living `status:"paused"` interaction card
// (steps + [继续]/[取消]), not a dead text line. The card chips dispatch the SAME
// 继续/取消 commands as typing them — single pending source, one resume handler.
function pausedPlanApi(onResume) {
  let phase = 0;
  return {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      return phase === 0
        ? { success: true, status: "paused", progressTotal: 2,
            progress: [{ type: "step", stage: "story", payload: { story: "s" } },
                       { type: "step", stage: "characters", payload: { characters: [{ idx: 0, identifierInScene: "Alice", isVisible: true }] } }] }
        : doneJob();
    },
    async vimaxNativeResume(jobId, characters) { if (onResume) onResume({ jobId, characters }); phase = 1; return { success: true, status: "running" }; },
    async vimaxNativeCancel() { return { success: true, status: "cancelled" }; },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
}

function pausedCardOf(state) {
  return state.messages
    .flatMap((m) => (Array.isArray(m.cards) ? m.cards : []))
    .find((c) => c.status === "paused");
}

test("D4: a paused native plan surfaces a status:paused interaction card (not only prose)", async () => {
  const graphStore = makeGraphStore([]);
  const state = createAssistantPanelState({ api: pausedPlanApi(), graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");

  const paused = pausedCardOf(state);
  assert.ok(paused, "a status:paused interaction card was pushed (not only text)");
  assert.equal(paused.pausedReason, "wait-cast-edit", "pausedReason marks the cast-edit wait");
  const optionIds = (paused.options || []).map((o) => o.id);
  assert.ok(optionIds.includes("resume") && optionIds.includes("cancel"), "card carries 继续 + 取消 options");
  const landed = (paused.steps || []).filter((s) => s.status === "landed").map((s) => s.stage);
  assert.ok(landed.includes("story") && landed.includes("cast"), "steps show story + cast landed");
  const storyboardStep = (paused.steps || []).find((s) => s.stage === "storyboard");
  assert.equal(storyboardStep && storyboardStep.status, "pending", "storyboard still pending at the pause");
  assert.ok(state.pendingVimaxNativeResume, "the single pending pause source is intact");
});

test("D4: the paused card's 继续 option carries the 继续 command and resumes via the same dispatch", async () => {
  let resumed = null;
  const nodes = [];
  const graphStore = { getState: () => ({ nodes }), updateNodeData() {} };
  const state = createAssistantPanelState({ api: pausedPlanApi((r) => { resumed = r; }), graphStore, executeActions: () => ({}) });
  await state.sendMessage("导演:雨夜");
  const fid = state.pendingVimaxNativeResume.flowId;
  nodes.push({ id: `vimax-${fid}-cast`, type: "comment", data: { content: "【角色 0】Alice\n静态: EDITED\n动态: d\n出镜: 是" } });

  const paused = pausedCardOf(state);
  const resumeCmd = (paused.options.find((o) => o.id === "resume") || {}).command;
  assert.equal(resumeCmd, "继续", "resume option carries the 继续 command (1:1 with the typed path)");
  await state.sendMessage(resumeCmd); // exactly what clicking [继续] dispatches
  assert.ok(resumed, "dispatching the card's 继续 command resumes");
  assert.equal(resumed.characters[0].staticFeatures, "EDITED", "edited cast forwarded");
  assert.equal(state.pendingVimaxNativeResume, null, "pending cleared after resume");
});

// D5: the launch chip → contract preview → confirm chain. ViMax is registered as
// provider #1; clicking a chip derives the (pure, no-spend) contract; [确认开始]
// synthesizes the existing 导演:/成片:/定妆: command and hands it to B3 — the
// launch card never lands actions itself (no double-land).
function launchCard(over = {}) {
  return { id: "launch-1", type: "launch", status: "needs_action", launchProviderId: "vimax",
    launchBrief: "雨夜便利店", options: [{ id: "director", label: "导演" }], ...over };
}
function cardInState(state, id) {
  return state.messages.flatMap((m) => (Array.isArray(m.cards) ? m.cards : [])).find((c) => c.id === id);
}

test("D5: the launch registry has ViMax registered as provider #1", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  assert.ok(state.launchRegistry, "registry exposed");
  assert.deepEqual(state.launchRegistry.ids(), ["vimax"]);
});

test("D5: clicking a launch chip derives its contract and moves the card to preview (no spend)", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const card = launchCard();
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  const updated = state.launchChipPreview(card, "director");
  assert.equal(updated.status, "preview", "card moved to preview");
  assert.equal(updated.contract.mode, "director");
  assert.equal(updated.contract.nodeCount, 3);
  assert.equal(updated.contract.cost.tier, "free");
  assert.equal(updated.contract.chipId, "director", "chipId stashed for synthesize");
  assert.equal(cardInState(state, "launch-1").status, "preview", "reflected in state.messages");
});

test("D5: a 定妆 chip's contract uses the visible cast count x3 from the canvas", () => {
  const graphStore = makeGraphStore([
    { id: "vimax-F-cast", data: { vimaxRole: "cast", content: "【角色 0】A\n静态: a\n动态: b\n出镜: 是\n【角色 1】B\n静态: c\n动态: d\n出镜: 是" } },
  ]);
  const state = createAssistantPanelState({ api: {}, graphStore });
  const card = launchCard({ id: "launch-p", options: [{ id: "portraits", label: "定妆" }] });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  const updated = state.launchChipPreview(card, "portraits");
  assert.equal(updated.contract.mode, "portraits");
  assert.equal(updated.contract.nodeCount, 2, "two visible characters");
  assert.equal(updated.contract.cost.drawCount, 6, "x3 per character");
});

test("D5: [确认开始] synthesizes the command and hands it to B3 (B3 lands, no double-land)", async () => {
  const calls = { nativePlan: 0, planPayload: null };
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan(p) { calls.nativePlan++; calls.planPayload = p; return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  const card = launchCard({ id: "launch-2" });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  state.launchChipPreview(card, "director");
  await state.launchContractConfirm(cardInState(state, "launch-2"));

  assert.equal(calls.nativePlan, 1, "the synthesized 导演: command ran the native plan exactly once (one lane)");
  assert.equal(calls.planPayload.idea, "雨夜便利店", "the synthesized command carried the brief");
  assert.equal(cardInState(state, "launch-2").status, "running", "launch card consumed (chips cleared), B3 takes over");
});

test("D5: [取消] in preview returns the card to the chip row", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const card = launchCard({ id: "launch-3" });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  state.launchChipPreview(card, "director");
  assert.equal(cardInState(state, "launch-3").status, "preview");
  state.launchContractCancel(cardInState(state, "launch-3"));
  const back = cardInState(state, "launch-3");
  assert.equal(back.status, "needs_action", "returned to chip row");
  assert.equal(back.contract, null, "contract dropped");
});

// D6: the launch-chip TRIGGER. A prefix-less brief grows launch chips on the
// assistant reply (§6.1 exclusions are the provider's match); prefixed/control/
// paused inputs do not; only the latest reply keeps the (untouched) chip row.
test("D6: a prefix-less brief offers ViMax launch chips on the assistant reply", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const reply = { role: "assistant", content: "好的" };
  const card = state.offerLaunchChips(reply, "雨夜便利店，陌生人递来一把伞");
  assert.ok(card, "a launch card was offered");
  assert.equal(card.type, "launch");
  assert.equal(card.status, "needs_action");
  assert.equal(card.launchProviderId, "vimax");
  assert.equal(card.launchBrief, "雨夜便利店，陌生人递来一把伞");
  assert.deepEqual(card.options.map((c) => c.id), ["director", "film", "portraits", "skills"]);
  assert.equal(reply.cards.filter((c) => c.type === "launch").length, 1, "attached to the reply");
});

test("D6: a command-prefixed message offers no launch chips (prefix priority)", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const reply = { role: "assistant", content: "已规划" };
  assert.equal(state.offerLaunchChips(reply, "导演:雨夜便利店"), null);
  assert.equal(state.offerLaunchChips(reply, "成片:雨夜"), null);
  assert.ok(!reply.cards || reply.cards.length === 0, "no card attached");
});

test("D6: launch chips are frozen while a native plan is paused", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  state.pendingVimaxNativeResume = { jobId: "nj", flowId: "F" };
  const reply = { role: "assistant", content: "x" };
  assert.equal(state.offerLaunchChips(reply, "雨夜便利店的故事"), null, "no chips while paused");
});

test("D6: a control word (继续) offers no chips", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const reply = { role: "assistant", content: "x" };
  assert.equal(state.offerLaunchChips(reply, "继续"), null);
});

test("D6: offering is idempotent — a second offer adds no second card (preserves engagement)", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  const reply = { role: "assistant", content: "好的" };
  state.offerLaunchChips(reply, "雨夜便利店");
  state.offerLaunchChips(reply, "雨夜便利店");
  assert.equal(reply.cards.filter((c) => c.type === "launch").length, 1);
});

test("D6: refreshLaunchChips offers on the latest reply and strips untouched chips from older ones", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  state.messages.push({ role: "user", content: "雨夜便利店" });
  state.messages.push({ role: "assistant", content: "好的" });
  state.refreshLaunchChips();
  const firstReply = state.messages[1];
  assert.equal(firstReply.cards.filter((c) => c.type === "launch" && c.status === "needs_action").length, 1, "first reply got chips");
  state.messages.push({ role: "user", content: "海边日落的告别" });
  state.messages.push({ role: "assistant", content: "好的" });
  state.refreshLaunchChips();
  assert.equal(firstReply.cards.filter((c) => c.type === "launch" && c.status === "needs_action").length, 0, "older untouched chips stripped");
  assert.equal(state.messages[3].cards.filter((c) => c.type === "launch").length, 1, "latest reply has chips");
});

test("D6: refreshLaunchChips preserves an older reply's preview/running launch card (user engaged)", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  state.messages.push({ role: "user", content: "雨夜便利店" });
  const reply1 = { role: "assistant", content: "好的", cards: [
    { id: "launch-x", type: "launch", status: "preview", launchProviderId: "vimax", launchBrief: "雨夜便利店", contract: { mode: "director", chipId: "director" } }] };
  state.messages.push(reply1);
  state.messages.push({ role: "user", content: "新故事" });
  state.messages.push({ role: "assistant", content: "好的" });
  state.refreshLaunchChips();
  assert.equal(reply1.cards.filter((c) => c.type === "launch" && c.status === "preview").length, 1, "engaged preview card preserved");
});

test("D6: a reply that produced an operation card gets NO launch chips (no shadowing; P1 UI regression)", () => {
  const state = createAssistantPanelState({ api: {}, graphStore: makeGraphStore() });
  state.messages.push({ role: "user", content: "雨夜便利店" });
  // The reply took action (operation card) + carries a stale launch card that an
  // intermediate render added before the action card landed.
  const reply = { role: "assistant", content: "已生成", cards: [
    { id: "op-1", type: "canvas_actions", status: "running" },
    { id: "launch-stale", type: "launch", status: "needs_action", options: [{ id: "director" }] },
  ] };
  state.messages.push(reply);
  state.refreshLaunchChips();
  assert.equal(reply.cards.filter((c) => c.type === "launch" && c.status === "needs_action").length, 0,
    "stale launch chips stripped from an action-taking reply");
  assert.equal(reply.cards.filter((c) => c.type === "canvas_actions").length, 1, "operation card preserved");
  assert.equal(state.offerLaunchChips(reply, "雨夜便利店"), null, "no chips offered onto an action reply");
});

// D7: a film launch flow previews an estimated 约N shot count; once planning lands
// the real shotplan, the living card's cost flips to the real count (+ 已更新).
test("D7: a film launch flow updates 约N → the real shot count after planning lands", async () => {
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); }, // SHOTPLAN has 2 shots, straight to done
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  const card = launchCard({ id: "launch-film", options: [{ id: "film", label: "成片" }] });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });

  state.launchChipPreview(card, "film");
  const preview = cardInState(state, "launch-film");
  assert.equal(preview.contract.cost.estimated, true, "film starts estimated (约N)");
  assert.equal(preview.contract.cost.drawCount, null, "no real count before planning");

  await state.launchContractConfirm(preview);
  const updated = cardInState(state, "launch-film");
  assert.equal(updated.contract.cost.estimated, false, "estimated flips off after planning");
  assert.equal(updated.contract.cost.drawCount, 2, "real shot count from the landed shotplan (2 shots)");
  assert.equal(updated.contract.updated, true, "marked 已更新 (explicit, not silent)");
  assert.equal(state.pendingLaunchContractCardId, null, "one-shot stash cleared");
});

test("D7: a free director flow does NOT stash a shot-count update (no estimated cost)", async () => {
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() { return doneJob(); },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  const card = launchCard({ id: "launch-dir", options: [{ id: "director", label: "导演" }] });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  state.launchChipPreview(card, "director");
  await state.launchContractConfirm(cardInState(state, "launch-dir"));
  assert.equal(state.pendingLaunchContractCardId, null, "director (free) never stashes a film-count update");
  assert.notEqual(cardInState(state, "launch-dir").contract.updated, true, "no 已更新 mark on a free flow");
});

test("D7: a FAILED film plan clears the stash — a later plan can't mis-attribute its count (review F1)", async () => {
  let phase = 0;
  const api = {
    async vimaxNativeStatus() { return { configured: true }; },
    async vimaxNativePlan() { return { success: true, jobId: "nj" }; },
    async vimaxNativeJob() {
      // first (film) plan FAILS with no result; a later plan returns a real shotplan.
      return phase === 0 ? { success: true, status: "failed", error: "boom" } : doneJob();
    },
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const state = createAssistantPanelState({ api, graphStore: makeGraphStore(), executeActions: () => ({}) });
  const card = launchCard({ id: "launch-fail", options: [{ id: "film", label: "成片" }] });
  state.messages.push({ role: "assistant", content: "建议", cards: [card] });
  state.launchChipPreview(card, "film");
  await state.launchContractConfirm(cardInState(state, "launch-fail")); // film plan FAILS
  assert.equal(state.pendingLaunchContractCardId, null, "stash cleared on failure (no stale id leaks)");

  phase = 1;
  await state.sendMessage("导演:别的故事"); // a later, unrelated plan completes
  assert.notEqual(cardInState(state, "launch-fail").contract.updated, true,
    "the failed film card is NOT retro-updated by a later plan's shot count");
});
