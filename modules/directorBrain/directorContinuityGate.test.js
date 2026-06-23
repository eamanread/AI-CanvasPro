import assert from "node:assert/strict";
import test from "node:test";

import { gateCanvasActionsWithContinuity } from "./directorContinuityGate.js";

const PREP_ACTION = { type: "create_node", id: "n1", nodeType: "ai-image", data: { prompt: "rainy night" } };
const GENERATION_ACTION = { type: "queue_generation_task", nodeId: "n1", nodeType: "ai-video" };

const BLOCK_REPORT = {
  schemaVersion: "director-continuity-report/v1",
  status: "block",
  issues: [{
    id: "semantic-character-1",
    severity: "block",
    dimension: "character",
    message: "外套颜色语义漂移",
    evidence: ["beige trench coat", "深色湿外套必须连续"],
    suggestedFix: "改为 dark wet coat",
    confidence: 0.95,
  }],
};

test("directorContinuityGate: blockers stop generation actions but allow prep nodes", () => {
  const result = gateCanvasActionsWithContinuity({
    report: BLOCK_REPORT,
    actions: [PREP_ACTION, GENERATION_ACTION],
  });

  assert.equal(result.status, "block");
  assert.deepEqual(result.allowed, [PREP_ACTION]);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].action, GENERATION_ACTION);
  assert.match(result.blocked[0].reason, /外套颜色/);
  assert.equal(result.overrideUsed, undefined);
});

test("directorContinuityGate: explicit override releases blockers and stays auditable", () => {
  const result = gateCanvasActionsWithContinuity({
    report: BLOCK_REPORT,
    actions: [PREP_ACTION, GENERATION_ACTION],
    override: true,
    overrideReason: "导演确认外套换色是剧情需要",
  });

  assert.equal(result.allowed.length, 2);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.overrideUsed.reason, "导演确认外套换色是剧情需要");
});

test("directorContinuityGate: override without a reason is rejected", () => {
  assert.throws(
    () => gateCanvasActionsWithContinuity({
      report: BLOCK_REPORT,
      actions: [GENERATION_ACTION],
      override: true,
    }),
    /reason/i,
  );
});

test("directorContinuityGate: override on warn does not mint an override record", () => {
  const result = gateCanvasActionsWithContinuity({
    report: { ...BLOCK_REPORT, status: "warn", issues: [{ ...BLOCK_REPORT.issues[0], severity: "warn", confidence: 0.6 }] },
    actions: [PREP_ACTION, GENERATION_ACTION],
    override: true,
    overrideReason: "多余的理由",
  });

  assert.equal(result.status, "warn");
  assert.equal(result.allowed.length, 2);
  assert.equal(result.overrideUsed, undefined);
  assert.equal(result.requiresUserConfirmation, true);
});

test("directorContinuityGate: warn status passes actions but flags confirmation", () => {
  const result = gateCanvasActionsWithContinuity({
    report: { ...BLOCK_REPORT, status: "warn", issues: [{ ...BLOCK_REPORT.issues[0], severity: "warn", confidence: 0.6 }] },
    actions: [PREP_ACTION, GENERATION_ACTION],
  });

  assert.equal(result.status, "warn");
  assert.equal(result.allowed.length, 2);
  assert.equal(result.requiresUserConfirmation, true);
});

test("directorContinuityGate: malformed reports fail closed", () => {
  assert.throws(
    () => gateCanvasActionsWithContinuity({ report: { status: "fine" }, actions: [PREP_ACTION] }),
    /status/,
  );
});

test("directorContinuityGate: a missing report is unverified, not a pass", () => {
  const result = gateCanvasActionsWithContinuity({
    report: null,
    actions: [PREP_ACTION, GENERATION_ACTION],
  });

  assert.equal(result.status, "unverified");
  assert.deepEqual(result.allowed, [PREP_ACTION]);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].reason, /report|报告/i);
  assert.equal(result.requiresUserConfirmation, true);
});

test("directorContinuityGate: unverified can be overridden with an auditable reason", () => {
  const result = gateCanvasActionsWithContinuity({
    report: undefined,
    actions: [GENERATION_ACTION],
    override: true,
    overrideReason: "用户确认在无场记报告下继续",
  });

  assert.equal(result.status, "unverified");
  assert.equal(result.allowed.length, 1);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.overrideUsed.reason, "用户确认在无场记报告下继续");
});

test("directorContinuityGate: every outcome carries a gate-verdict/v1", () => {
  const blockResult = gateCanvasActionsWithContinuity({ report: BLOCK_REPORT, actions: [GENERATION_ACTION] });
  assert.equal(blockResult.verdict.schemaVersion, "gate-verdict/v1");
  assert.equal(blockResult.verdict.gate, "continuity");
  assert.equal(blockResult.verdict.layer, "L3");
  assert.equal(blockResult.verdict.status, "block");
  assert.equal(blockResult.verdict.reasons.length > 0, true);
  assert.match(blockResult.verdict.reasons[0].message, /外套/);
  assert.equal(typeof blockResult.verdict.overridePath, "string");

  const unverified = gateCanvasActionsWithContinuity({ report: null, actions: [] });
  assert.equal(unverified.verdict.status, "unverified");

  const pass = gateCanvasActionsWithContinuity({
    report: { ...BLOCK_REPORT, status: "pass", issues: [] },
    actions: [PREP_ACTION],
  });
  assert.equal(pass.verdict.status, "pass");
  assert.equal(pass.verdict.reasons.length, 0);
});
