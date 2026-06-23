import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERACTION_CARD_STATUSES,
  createInteractionCard,
  updateInteractionCardStatus,
} from "./assistantInteractionCards.js";

// Phase D · D1 — living contract card schema + status whitelist (§F-D1).
// These lock in: the 4 new fields default-initialized, an explicit status is
// honored + validated, and the status whitelist is a COMPLETE superset of every
// status the real app already puts on a card (verified by reading every
// card-update site in appAssistantPanel.js + canvasCardStatusForNodeIds).

test("D1: createInteractionCard initializes the 4 living-card fields", () => {
  const card = createInteractionCard({ id: "c1", actions: [] });
  assert.deepEqual(card.options, []);
  assert.equal(card.contract, null);
  assert.deepEqual(card.steps, []);
  assert.equal(card.pausedReason, "");
});

test("D1: createInteractionCard honors an explicit (valid) status", () => {
  const card = createInteractionCard({ id: "c2", actions: [], status: "needs_action" });
  assert.equal(card.status, "needs_action");
});

test("D1: createInteractionCard without status keeps the legacy requiresConfirmation calc", () => {
  // no actions => no confirmation => pending (unchanged legacy behavior)
  assert.equal(createInteractionCard({ id: "c3", actions: [] }).status, "pending");
});

test("D1: createInteractionCard throws on a typo'd status (catches `need_action`)", () => {
  assert.throws(() => createInteractionCard({ id: "c4", actions: [], status: "need_action" }), /status/);
});

test("D1: updateInteractionCardStatus throws on an unknown status", () => {
  const card = createInteractionCard({ id: "c5", actions: [] });
  assert.throws(() => updateInteractionCardStatus(card, { status: "previw" }), /status/);
});

test("D1: updateInteractionCardStatus can patch the 4 living-card fields", () => {
  const card = createInteractionCard({ id: "c6", actions: [] });
  const updated = updateInteractionCardStatus(card, {
    status: "preview",
    options: [{ id: "director", label: "导演" }],
    contract: { mode: "director", nodeCount: 3 },
    steps: [{ stage: "story", status: "landed" }],
    pausedReason: "wait-cast-edit",
  });
  assert.equal(updated.status, "preview");
  assert.equal(updated.options[0].id, "director");
  assert.equal(updated.contract.nodeCount, 3);
  assert.equal(updated.steps[0].stage, "story");
  assert.equal(updated.pausedReason, "wait-cast-edit");
  // immutability preserved
  assert.deepEqual(card.options, []);
});

test("D1: updateInteractionCardStatus with no status patch never throws (mergeExecutionDetails path)", () => {
  const card = createInteractionCard({ id: "c7", actions: [] });
  assert.doesNotThrow(() => updateInteractionCardStatus(card, { items: [{ a: 1 }] }));
});

test("D1: legacy status `completed` still valid (existing behavior unchanged)", () => {
  const card = createInteractionCard({ id: "c8", actions: [] });
  assert.equal(updateInteractionCardStatus(card, { status: "completed" }).status, "completed");
});

test("D1: INTERACTION_CARD_STATUSES is a COMPLETE superset of every real card status", () => {
  // Regression guard encoding the investigation: these are all statuses the app
  // already applies to interaction cards (createInteractionCard, the 21 card-update
  // sites, clarification cards, and the dynamic canvasCardStatusForNodeIds set).
  // Do NOT shrink this set — removing one silently breaks a real lane.
  for (const s of [
    "pending", "needs_confirmation", "needs_clarification", "running",
    "generating", "preparing", "paused", "retryable",
    "completed", "failed", "cancelled", "archived",
    // Phase D additions:
    "needs_action", "preview",
  ]) {
    assert.ok(INTERACTION_CARD_STATUSES.has(s), `INTERACTION_CARD_STATUSES must include "${s}"`);
  }
});
