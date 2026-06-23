import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantActionRiskLevel,
  actionRequiresConfirmation,
  envelopeAssistantActions,
  inferAssistantActionRisk,
  isForbiddenAssistantAction,
  withAssistantActionEnvelope,
} from "./assistantActionContract.js";

test("assistantActionContract: classifies low, medium, and high risk actions", () => {
  assert.equal(
    inferAssistantActionRisk({ type: "focus_nodes", nodeIds: ["n1"] }),
    AssistantActionRiskLevel.Low
  );
  assert.equal(
    inferAssistantActionRisk({ type: "create_node", nodeType: "ai-text" }),
    AssistantActionRiskLevel.Medium
  );
  assert.equal(
    inferAssistantActionRisk({ type: "queue_generation_task", nodeType: "ai-video" }),
    AssistantActionRiskLevel.High
  );
});

test("assistantActionContract: treats ai-video prep nodes differently from video generation", () => {
  assert.equal(
    inferAssistantActionRisk({ type: "create_node", nodeType: "ai-video" }),
    AssistantActionRiskLevel.Medium
  );
  assert.equal(
    inferAssistantActionRisk({ type: "queue_generation_task", nodeType: "ai-video" }),
    AssistantActionRiskLevel.High
  );
});

test("assistantActionContract: prompt preset video generation is high risk", () => {
  assert.equal(
    inferAssistantActionRisk({
      type: "run_prompt_preset_generation",
      nodeType: "ai-video",
      presetId: "video-teaser",
    }),
    AssistantActionRiskLevel.High
  );
  assert.equal(
    inferAssistantActionRisk({
      type: "run_prompt_preset_generation",
      nodeType: "ai-image",
      presetId: "product-hero",
    }),
    AssistantActionRiskLevel.Medium
  );
});

test("assistantActionContract: workflow template save and reuse are high risk", () => {
  assert.equal(
    inferAssistantActionRisk({
      type: "create_workflow_template",
      name: "Reusable story workflow",
      nodeIds: ["script", "image"],
    }),
    AssistantActionRiskLevel.High
  );
  assert.equal(
    actionRequiresConfirmation({
      type: "create_workflow_template",
      name: "Reusable story workflow",
      nodeIds: ["script", "image"],
    }),
    true
  );
  assert.equal(
    inferAssistantActionRisk({
      type: "apply_workflow_template",
      templateId: "tpl-story",
    }),
    AssistantActionRiskLevel.High
  );
});

test("assistantActionContract: team workflow template governance actions are high risk", () => {
  for (const type of [
    "submit_workflow_template_review",
    "review_workflow_template",
    "publish_workflow_template",
    "deprecate_workflow_template",
    "rollback_workflow_template",
    "record_workflow_template_reuse",
  ]) {
    assert.equal(
      inferAssistantActionRisk({
        type,
        templateId: "tpl-team-story",
        scope: "team",
      }),
      AssistantActionRiskLevel.High,
      type
    );
    assert.equal(
      actionRequiresConfirmation({
        type,
        templateId: "tpl-team-story",
        scope: "team",
      }),
      true,
      type
    );
  }
});

test("assistantActionContract: low risk actions do not require confirmation by default", () => {
  assert.equal(actionRequiresConfirmation({ type: "layout_nodes", layout: "grid" }), false);
  assert.equal(actionRequiresConfirmation({ type: "create_node", nodeType: "ai-image" }), true);
  assert.equal(
    actionRequiresConfirmation({ type: "focus_nodes", requiresConfirmation: true }),
    true
  );
});

test("assistantActionContract: envelopes actions with schema version, risk, confirmation, and provenance", () => {
  const action = withAssistantActionEnvelope(
    { type: "create_node", nodeId: "n1", nodeType: "ai-text" },
    { conversationId: "conv-1", messageId: "msg-1" }
  );

  assert.equal(action.schemaVersion, "2026-06-03");
  assert.match(action.actionId, /^act_/);
  assert.equal(action.riskLevel, "medium");
  assert.equal(action.requiresConfirmation, true);
  assert.deepEqual(action.metadata, {
    conversationId: "conv-1",
    messageId: "msg-1",
    source: "canvas_agent",
  });
});

test("assistantActionContract: envelopes action lists", () => {
  assert.deepEqual(
    envelopeAssistantActions([{ type: "focus_nodes", nodeIds: ["n1"] }], {
      conversationId: "conv-1",
    }).map((action) => ({
      type: action.type,
      riskLevel: action.riskLevel,
      requiresConfirmation: action.requiresConfirmation,
      conversationId: action.metadata.conversationId,
    })),
    [
      {
        type: "focus_nodes",
        riskLevel: "low",
        requiresConfirmation: false,
        conversationId: "conv-1",
      },
    ]
  );
});

test("assistantActionContract: agent cannot lower local confirmation requirements", () => {
  const action = withAssistantActionEnvelope({
    type: "queue_generation_task",
    nodeType: "ai-video",
    requiresConfirmation: false,
  });

  assert.equal(action.riskLevel, "high");
  assert.equal(action.requiresConfirmation, true);
});

test("assistantActionContract: classifies shell and file actions as forbidden", () => {
  assert.equal(isForbiddenAssistantAction({ type: "run_shell", command: "whoami" }), true);
  assert.equal(isForbiddenAssistantAction({ type: "write_file", path: "x.txt" }), true);
  assert.equal(inferAssistantActionRisk({ type: "run_shell", command: "whoami" }), "forbidden");
  assert.equal(actionRequiresConfirmation({ type: "run_shell", command: "whoami" }), true);
});
