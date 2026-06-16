import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantPanelState } from "./appAssistantPanel.js";

// Phase D · D2 — landTrustedActions + provider-lineage whitelist (§F-D2, R5/AC8b).
// The lineage a provider's actions carry to claw is resolved from the static
// trust policy by providerId; it is never a forgeable runtime argument, and it
// never crosses between providers.

function harness() {
  const calls = [];
  const api = {
    async validateActions(p) { return { success: true, actions: p.actions }; },
  };
  const graphStore = { getState: () => ({ nodes: [] }), updateNodeData() {} };
  const executeActions = (payload) => { calls.push(payload); return { applied: (payload.actions || []).length }; };
  const state = createAssistantPanelState({ api, graphStore, executeActions });
  return { state, calls };
}

const ACT = [{ type: "create_node", nodeType: "comment", data: { content: "x" } }];

test("D2: landTrustedActions lands vimax with the static lineage vimax-director", async () => {
  const { state, calls } = harness();
  const ok = await state.landTrustedActions(ACT, "vimax", "exec-1");
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, "vimax-director");
  assert.equal(calls[0].executionId, "exec-1");
});

test("D2: AC8b — lineage does not cross between providers", async () => {
  const { state, calls } = harness();
  await state.landTrustedActions(ACT, "vimax", "exec-v");
  await state.landTrustedActions(ACT, "qmai", "exec-q");
  assert.deepEqual(calls.map((c) => c.source), ["vimax-director", "qmai-director"]);
});

test("D2: an unregistered provider is rejected — no land, no execute (R5)", async () => {
  const { state, calls } = harness();
  const ok = await state.landTrustedActions(ACT, "unknownProvider", "exec-x");
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
  assert.match(state.lastReceipt, /未注册|拒绝/);
});

test("D2: a reserved/forged providerId cannot mint trust (admin / raw lineage string)", async () => {
  const { state, calls } = harness();
  assert.equal(await state.landTrustedActions(ACT, "admin", "exec-a"), false);
  // a rogue caller passing the lineage tag itself as the id must NOT work:
  assert.equal(await state.landTrustedActions(ACT, "vimax-director", "exec-b"), false);
  assert.equal(calls.length, 0);
});

test("D2: empty actions never land even for a valid provider", async () => {
  const { state, calls } = harness();
  assert.equal(await state.landTrustedActions([], "vimax", "exec-e"), false);
  assert.equal(calls.length, 0);
});
