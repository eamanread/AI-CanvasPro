import { CANVAS_AGENT_PROTOCOL_VERSION } from "./assistantProtocol.js";

export const AssistantActionRiskLevel = Object.freeze({
  Low: "low",
  Medium: "medium",
  High: "high",
  Forbidden: "forbidden",
});

const LOW_RISK_TYPES = new Set(["focus_nodes", "select_nodes", "zoom_to_fit", "layout_nodes", "tidy_canvas"]);
const MEDIUM_RISK_TYPES = new Set([
  "create_node",
  "connect_nodes",
  "update_node_data",
  "rename_node",
  "create_group",
  "duplicate_nodes",
  "run_prompt_preset_generation",
]);
const HIGH_RISK_TYPES = new Set([
  "delete_node",
  "delete_nodes",
  "restore_snapshot",
  "rollback_transaction",
  "create_workflow_template",
  "apply_workflow_template",
  "submit_workflow_template_review",
  "review_workflow_template",
  "publish_workflow_template",
  "deprecate_workflow_template",
  "rollback_workflow_template",
  "record_workflow_template_reuse",
]);
const FORBIDDEN_TYPES = new Set([
  "run_shell",
  "execute_shell",
  "write_file",
  "read_file",
  "delete_file",
  "move_file",
]);

function actionType(action) {
  return String(action?.type || action?.action || action?.actionType || action?.operation || "").trim();
}

function actionNodeType(action) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  return String(action?.nodeType || data.nodeType || data.type || "").trim();
}

function hasBatchGeneration(action) {
  const inputs = action?.inputs && typeof action.inputs === "object" ? action.inputs : {};
  const count = Number(action?.taskCount || inputs.taskCount || inputs.count || 0);
  return Number.isFinite(count) && count > 3;
}

export function inferAssistantActionRisk(action = {}) {
  const type = actionType(action);
  const nodeType = actionNodeType(action);
  if (FORBIDDEN_TYPES.has(type)) {
    return AssistantActionRiskLevel.Forbidden;
  }
  if (
    nodeType === "ai-video" &&
    (type === "queue_generation_task" || type === "run_prompt_preset_generation" || type === "start_generation")
  ) {
    return AssistantActionRiskLevel.High;
  }
  if (type === "queue_generation_task" && hasBatchGeneration(action)) {
    return AssistantActionRiskLevel.High;
  }
  if (HIGH_RISK_TYPES.has(type)) {
    return AssistantActionRiskLevel.High;
  }
  if (MEDIUM_RISK_TYPES.has(type) || type === "queue_generation_task") {
    return AssistantActionRiskLevel.Medium;
  }
  if (LOW_RISK_TYPES.has(type)) {
    return AssistantActionRiskLevel.Low;
  }
  return AssistantActionRiskLevel.Medium;
}

export function actionRequiresConfirmation(action = {}) {
  if (action.requiresConfirmation === true) {
    return true;
  }
  return inferAssistantActionRisk(action) !== AssistantActionRiskLevel.Low;
}

export function isForbiddenAssistantAction(action = {}) {
  return inferAssistantActionRisk(action) === AssistantActionRiskLevel.Forbidden;
}

export function withAssistantActionEnvelope(action = {}, metadata = {}) {
  const source = action && typeof action === "object" ? action : {};
  const riskLevel = source.riskLevel || inferAssistantActionRisk(source);
  const actionId =
    source.actionId ||
    source.id ||
    `act_${String(actionType(source) || "canvas").replace(/[^a-z0-9_-]+/gi, "_")}_${Date.now()}`;
  return {
    schemaVersion: source.schemaVersion || CANVAS_AGENT_PROTOCOL_VERSION,
    actionId: String(actionId),
    ...source,
    riskLevel,
    requiresConfirmation:
      riskLevel !== AssistantActionRiskLevel.Low || source.requiresConfirmation === true,
    metadata: {
      ...(source.metadata && typeof source.metadata === "object" ? source.metadata : {}),
      ...metadata,
      source: metadata.source || source.metadata?.source || "canvas_agent",
    },
  };
}

export function envelopeAssistantActions(actions = [], metadata = {}) {
  return Array.isArray(actions)
    ? actions.map((action) => withAssistantActionEnvelope(action, metadata))
    : [];
}
