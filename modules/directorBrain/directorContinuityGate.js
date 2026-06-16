export const GATE_VERDICT_SCHEMA_VERSION = "gate-verdict/v1";

const GENERATION_ACTION_TYPES = new Set([
  "queue_generation_task",
  "start_generation",
  "run_prompt_preset_generation",
]);

const VALID_STATUSES = new Set(["pass", "warn", "block"]);

const OVERRIDE_PATH = "gateCanvasActionsWithContinuity({ override: true, overrideReason })";

/**
 * RED-LINE-3: continuity is a gate, not a hint — and the absence of a
 * verdict is itself a verdict. A missing report makes the plan
 * `unverified`: generation actions are held exactly like a block
 * (prep/create actions still land for inspection) and user
 * confirmation is required. Block reports stop every generation
 * action. Overrides must carry an auditable reason. Malformed reports
 * fail closed. Every outcome emits a gate-verdict/v1 so L0 renders
 * one kind of "no" regardless of which layer said it.
 */
export function gateCanvasActionsWithContinuity({
  report,
  actions = [],
  override = false,
  overrideReason,
  flowId,
} = {}) {
  const hasReport = report !== null && report !== undefined;
  if (hasReport && (typeof report !== "object" || !VALID_STATUSES.has(report.status))) {
    throw new Error("continuity report status must be pass, warn, or block");
  }
  if (override && (typeof overrideReason !== "string" || !overrideReason.trim())) {
    throw new Error("continuity override requires an auditable overrideReason");
  }

  const status = hasReport ? report.status : "unverified";
  const reasons = hasReport
    ? (Array.isArray(report.issues) ? report.issues : [])
        .filter((issue) => issue && typeof issue.message === "string")
        .map((issue) => ({
          message: issue.message,
          evidence: Array.isArray(issue.evidence) ? issue.evidence.map(String) : [],
          ...(typeof issue.suggestedFix === "string" ? { suggestedFix: issue.suggestedFix } : {}),
        }))
    : [{
        message: "连续性场记报告缺失(unverified):本计划未经过语义连续性审查",
        evidence: [],
        suggestedFix: "从 QMAI 导出 director/outputs/continuity 报告,或由用户显式确认后放行",
      }];

  const shouldHoldGeneration = (status === "block" || status === "unverified") && !override;
  const allowed = [];
  const blocked = [];
  if (shouldHoldGeneration) {
    const holdReason = status === "block"
      ? (reasons.map((reason) => reason.message).join("; ") || "continuity report status is block")
      : reasons[0].message;
    for (const action of actions) {
      if (GENERATION_ACTION_TYPES.has(String(action?.type))) {
        blocked.push({ action, reason: holdReason });
      } else {
        allowed.push(action);
      }
    }
  } else {
    allowed.push(...actions);
  }

  const overrideUsed = override && (status === "block" || status === "unverified")
    ? { reason: overrideReason.trim() }
    : undefined;

  const verdict = {
    schemaVersion: GATE_VERDICT_SCHEMA_VERSION,
    layer: "L3",
    gate: "continuity",
    status,
    reasons,
    overridePath: OVERRIDE_PATH,
    ...(overrideUsed ? { overrideUsed } : {}),
    ...(typeof flowId === "string" && flowId.trim() ? { flowId: flowId.trim() } : {}),
  };

  return {
    status,
    allowed,
    blocked,
    verdict,
    ...(status === "warn" || status === "unverified" ? { requiresUserConfirmation: true } : {}),
    ...(overrideUsed ? { overrideUsed } : {}),
  };
}
