import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssistantAgentRoster,
  buildAssistantMultiAgentPlan,
  validateAssistantAgentPlan,
} from "./assistantAgentOrchestrator.js";

test("assistantAgentOrchestrator: defines least-privilege specialist agents", () => {
  const roster = buildAssistantAgentRoster();
  const byRole = new Map(roster.agents.map((agent) => [agent.role, agent]));

  assert.deepEqual([...byRole.keys()].sort(), [
    "generation",
    "layout",
    "prompt",
    "qa",
    "storyboard",
  ]);
  assert.deepEqual(byRole.get("layout").allowedActions.sort(), [
    "create_group",
    "focus_nodes",
    "layout_nodes",
    "move_nodes",
    "rename_node",
    "set_viewport",
  ]);
  assert.equal(byRole.get("layout").allowedActions.includes("queue_generation_task"), false);
  assert.equal(byRole.get("qa").allowedActions.length, 0);
  assert.match(byRole.get("generation").permissionSummary, /text\/image/i);
  assert.match(byRole.get("qa").permissionSummary, /read-only/i);
});

test("assistantAgentOrchestrator: validates action plans against agent permissions", () => {
  const layoutResult = validateAssistantAgentPlan({
    agentRole: "layout",
    actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" }],
  });

  assert.equal(layoutResult.valid, false);
  assert.match(layoutResult.errors.join("\n"), /layout/i);
  assert.match(layoutResult.errors.join("\n"), /queue_generation_task/);

  const generationResult = validateAssistantAgentPlan({
    agentRole: "generation",
    actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image" }],
  });

  assert.equal(generationResult.valid, true);

  const videoResult = validateAssistantAgentPlan({
    agentRole: "generation",
    actions: [{ type: "queue_generation_task", nodeId: "video-1", nodeType: "ai-video" }],
    videoAuthorized: false,
  });

  assert.equal(videoResult.valid, false);
  assert.match(videoResult.errors.join("\n"), /video/i);
});

test("assistantAgentOrchestrator: builds a handoff plan from agentRole metadata", () => {
  const plan = buildAssistantMultiAgentPlan({
    intent: "story_to_video",
    actions: [
      {
        type: "create_node",
        nodeType: "ai-text",
        data: { workflowKind: "story_to_video", agentRole: "storyboard" },
      },
      {
        type: "update_node_data",
        nodeId: "script-1",
        data: { prompt: "tighten Chinese prompt", agentRole: "prompt" },
      },
      { type: "layout_nodes", layout: "storyboard_grid", nodeIds: ["script-1"], agentRole: "layout" },
      { type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", agentRole: "generation" },
    ],
  });

  assert.equal(plan.schemaVersion, "canvas-agent-multi-agent-v1");
  assert.equal(plan.validation.valid, true);
  assert.deepEqual(plan.tasks.map((task) => task.agentRole), [
    "storyboard",
    "prompt",
    "layout",
    "generation",
    "qa",
  ]);
  assert.deepEqual(plan.handoffs.map((handoff) => `${handoff.from}->${handoff.to}`), [
    "storyboard->prompt",
    "prompt->layout",
    "layout->generation",
    "generation->qa",
  ]);
  assert.equal(plan.tasks.at(-1).permissions.allowedActions.length, 0);
});
