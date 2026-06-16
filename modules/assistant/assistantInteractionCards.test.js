import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAssistantActionBatch,
  createInteractionCard,
  shouldRequireCardConfirmation,
  updateInteractionCardStatus,
} from "./assistantInteractionCards.js";

function createNodeAction(id, nodeType = "text") {
  return {
    type: "create_node",
    node: { id, type: nodeType, title: `${nodeType} ${id}` },
  };
}

test("assistantInteractionCards: plan confirms single video generation", () => {
  const analysis = analyzeAssistantActionBatch([createNodeAction("video-1", "video")]);

  assert.equal(analysis.generatedNodeCount, 1);
  assert.equal(analysis.includesVideoGeneration, true);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), true);
});

test("assistantInteractionCards: plan confirms multi-node generation", () => {
  const analysis = analyzeAssistantActionBatch([
    createNodeAction("text-1", "text"),
    createNodeAction("image-1", "image"),
  ]);

  assert.equal(analysis.generatedNodeCount, 2);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), true);
});

test("assistantInteractionCards: plan does not confirm single ordinary node", () => {
  const analysis = analyzeAssistantActionBatch([createNodeAction("text-1", "text")]);

  assert.equal(analysis.generatedNodeCount, 1);
  assert.equal(analysis.includesVideoGeneration, false);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "plan" }), false);
});

test("assistantInteractionCards: act never requires UI confirmation", () => {
  const analysis = analyzeAssistantActionBatch([
    createNodeAction("video-1", "video"),
    createNodeAction("image-1", "image"),
  ]);

  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "act" }), false);
});

test("assistantInteractionCards: act still confirms real video generation tasks", () => {
  const analysis = analyzeAssistantActionBatch([
    { type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" },
  ]);

  assert.equal(analysis.includesVideoGeneration, true);
  assert.equal(analysis.includesVideoGenerationTask, true);
  assert.equal(shouldRequireCardConfirmation(analysis, { agentMode: "act" }), true);
});

test("assistantInteractionCards: creates expanded confirmation card for plan video", () => {
  const actions = [createNodeAction("video-1", "video")];
  const analysis = analyzeAssistantActionBatch(actions);
  const card = createInteractionCard({ id: "card-fixed", actions, analysis, agentMode: "plan" });

  assert.equal(card.id, "card-fixed");
  assert.equal(card.type, "canvas_actions");
  assert.equal(card.status, "needs_confirmation");
  assert.equal(card.requiresConfirmation, true);
  assert.equal(card.expanded, true);
  assert.match(card.title, /1/);
  assert.deepEqual(card.actions, actions);
});

test("assistantInteractionCards: creates collapsed pending card for act", () => {
  const actions = [createNodeAction("video-1", "video")];
  const analysis = analyzeAssistantActionBatch(actions);
  const card = createInteractionCard({ id: "card-act", actions, analysis, agentMode: "act" });

  assert.equal(card.status, "pending");
  assert.equal(card.requiresConfirmation, false);
  assert.equal(card.expanded, false);
  assert.equal(card.agentMode, "act");
});

test("assistantInteractionCards: updates card status without mutating original", () => {
  const actions = [createNodeAction("text-1", "text")];
  const card = createInteractionCard({
    id: "card-update",
    actions,
    analysis: analyzeAssistantActionBatch(actions),
    agentMode: "plan",
  });

  const updated = updateInteractionCardStatus(card, {
    status: "completed",
    result: { applied: 1 },
  });

  assert.equal(card.status, "pending");
  assert.equal(updated.status, "completed");
  assert.deepEqual(updated.result, { applied: 1 });
});
