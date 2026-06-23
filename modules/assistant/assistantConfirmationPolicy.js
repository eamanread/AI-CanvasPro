import {
  AssistantActionRiskLevel,
  inferAssistantActionRisk,
} from "./assistantActionContract.js";

export const AssistantConfirmationDecision = Object.freeze({
  AutoApply: "auto_apply",
  Confirm: "confirm",
  StrongConfirm: "strong_confirm",
});

function normalizeAutoPolicy(policy) {
  return String(policy || "safe_only").trim() || "safe_only";
}

export function decideAssistantActionConfirmation(action = {}, { autoPolicy = "safe_only" } = {}) {
  if (action.requiresConfirmation === true) {
    const risk = inferAssistantActionRisk(action);
    return risk === AssistantActionRiskLevel.High
      ? AssistantConfirmationDecision.StrongConfirm
      : AssistantConfirmationDecision.Confirm;
  }

  const risk = inferAssistantActionRisk(action);
  if (risk === AssistantActionRiskLevel.High) {
    return AssistantConfirmationDecision.StrongConfirm;
  }
  if (risk === AssistantActionRiskLevel.Medium) {
    return AssistantConfirmationDecision.Confirm;
  }

  const policy = normalizeAutoPolicy(autoPolicy);
  if (policy === "off" || policy === "manual") {
    return AssistantConfirmationDecision.Confirm;
  }
  return AssistantConfirmationDecision.AutoApply;
}

export function summarizeAssistantConfirmation(actions = [], options = {}) {
  const decisions = Array.isArray(actions)
    ? actions.map((action) => decideAssistantActionConfirmation(action, options))
    : [];
  if (decisions.includes(AssistantConfirmationDecision.StrongConfirm)) {
    return AssistantConfirmationDecision.StrongConfirm;
  }
  if (decisions.includes(AssistantConfirmationDecision.Confirm)) {
    return AssistantConfirmationDecision.Confirm;
  }
  return AssistantConfirmationDecision.AutoApply;
}

