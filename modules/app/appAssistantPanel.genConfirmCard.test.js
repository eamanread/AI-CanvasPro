import test from "node:test";
import assert from "node:assert/strict";

import { createAssistantPanelState } from "./appAssistantPanel.js";

// Slice 4 (doc 23 §3.5, C2 收口): the canvas_actions card's STATUS — not just its
// requiresConfirmation flag — must follow the locked generation rule
// (generationConfirmationRequired: plan confirms image|video; act confirms video
// only). The confirm button renders only when BOTH requiresConfirmation AND
// status==="needs_confirmation" (renderInteractionCard ~6271). Before this slice,
// prepareInteractionCardForPendingActions set requiresConfirmation from the locked
// rule but left status from the legacy shouldRequireCardConfirmation heuristic — so
// a single image generation in plan mode landed requiresConfirmation:true +
// status:"pending" → no confirm button AND no auto-apply = a STUCK card.

const imageGen = { type: "queue_generation_task", nodeId: "n1", nodeType: "ai-image" };
const videoGen = { type: "queue_generation_task", nodeId: "v1", nodeType: "ai-video" };

function setup(agentMode) {
  const graphStore = { nodes: [], updateNodeData() {} };
  const state = createAssistantPanelState({ api: {}, graphStore, agentMode });
  state.messages.push({ role: "assistant", content: "ok" }); // card attaches here
  return state;
}

test("plan + single image generation: status follows the locked rule → needs_confirmation (not stuck at pending)", async () => {
  const state = setup("plan");
  state.setPendingActions([imageGen]);
  const card = await state.prepareInteractionCardForPendingActions();
  assert.equal(card.requiresConfirmation, true, "plan mode confirms image generation");
  assert.equal(card.status, "needs_confirmation", "status follows generationConfirmationRequired (was stuck at 'pending')");
  assert.equal(card.operation?.status, "needs_confirmation", "operation.status kept consistent");
});

test("act + single image generation: no confirmation → status is not needs_confirmation (act confirms video only)", async () => {
  const state = setup("act");
  state.setPendingActions([imageGen]);
  const card = await state.prepareInteractionCardForPendingActions();
  assert.equal(card.requiresConfirmation, false, "act mode does not confirm image");
  assert.notEqual(card.status, "needs_confirmation", "no needs_confirmation status when the rule says no confirm");
});

test("act + video generation: confirmation required → status needs_confirmation", async () => {
  const state = setup("act");
  state.setPendingActions([videoGen]);
  const card = await state.prepareInteractionCardForPendingActions();
  assert.equal(card.requiresConfirmation, true, "act mode confirms video generation");
  assert.equal(card.status, "needs_confirmation");
});
