import assert from "node:assert/strict";
import test from "node:test";
import { computeExecutionMetrics } from "./assistantExecutionMetrics.js";

test("assistantExecutionMetrics: derives PRD success metrics from a store snapshot", () => {
  const metrics = computeExecutionMetrics({
    executions: [
      {
        id: "e1", status: "completed", agentMode: "act", matchedSkills: ["canvas_layout"],
        timeline: [
          { status: "completed", durationMs: 120 },
          { status: "completed", durationMs: 80 },
        ],
      },
      {
        id: "e2", status: "failed", matchedSkills: [],
        timeline: [
          { status: "failed", canRetry: true },
          { status: "completed", durationMs: 50, developer: { retriedFromEventId: "x" } },
        ],
      },
      {
        id: "e3", status: "completed", matchedSkills: ["asset_usage"],
        timeline: [{ status: "blocked_by_skill" }, { status: "completed", durationMs: 30 }],
      },
    ],
  });

  assert.equal(metrics.totalExecutions, 3);
  assert.equal(metrics.skillHitRate, 2 / 3);
  assert.equal(metrics.actionCompletedCount, 4);
  assert.equal(metrics.actionFailedCount, 1);
  assert.equal(metrics.actionBlockedBySkillCount, 1);
  assert.equal(metrics.actionValidityRate, 4 / 6);
  assert.equal(metrics.failedExecutionsWithRecovery, 1);
  assert.equal(metrics.failureRecoveryRate, 1);
  assert.equal(metrics.executionFindabilityRate, 1);
  assert.equal(metrics.avgActionDurationMs, (120 + 80 + 50 + 30) / 4);
});

test("assistantExecutionMetrics: empty snapshot returns zeroed metrics", () => {
  const metrics = computeExecutionMetrics({ executions: [] });
  assert.equal(metrics.totalExecutions, 0);
  assert.equal(metrics.skillHitRate, 0);
  assert.equal(metrics.actionValidityRate, 0);
});
