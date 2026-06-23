import assert from "node:assert/strict";
import test from "node:test";

import {
  AssistantConfirmationDecision,
  decideAssistantActionConfirmation,
  summarizeAssistantConfirmation,
} from "./assistantConfirmationPolicy.js";

test("assistantConfirmationPolicy: auto-applies low risk actions by default", () => {
  assert.equal(
    decideAssistantActionConfirmation({ type: "focus_nodes", nodeIds: ["n1"] }),
    AssistantConfirmationDecision.AutoApply
  );
});

test("assistantConfirmationPolicy: asks confirmation for medium risk actions", () => {
  assert.equal(
    decideAssistantActionConfirmation({ type: "create_node", nodeType: "ai-text" }),
    AssistantConfirmationDecision.Confirm
  );
});

test("assistantConfirmationPolicy: strong-confirms video generation", () => {
  assert.equal(
    decideAssistantActionConfirmation({
      type: "queue_generation_task",
      nodeType: "ai-video",
    }),
    AssistantConfirmationDecision.StrongConfirm
  );
});

test("assistantConfirmationPolicy: summarizes the strictest decision", () => {
  assert.equal(
    summarizeAssistantConfirmation([
      { type: "focus_nodes", nodeIds: ["n1"] },
      { type: "queue_generation_task", nodeType: "ai-video" },
    ]),
    AssistantConfirmationDecision.StrongConfirm
  );
});

