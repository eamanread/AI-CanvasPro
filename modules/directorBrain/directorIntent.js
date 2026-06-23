import { sanitizeDirectorContext } from "./directorContextSchema.js";

export const DIRECTOR_INTENT_SCHEMA_VERSION = "director-intent/v1";

const VALID_LANES = new Set(["director", "canvas"]);

const PATH_LIKE = /^[A-Za-z]:[\\/]|^\\\\|^\/(?:[^/]|$)/;

/**
 * L1's single authorized decision, made explicit and auditable: which
 * lane handles the request. Everything else is organization, not
 * decision — the intent carries the user's goal, clarified
 * constraints, and a flowId that threads from the conversation
 * through QMAI artifacts to canvas nodes and gate verdicts.
 * Local filesystem paths are rejected up front (projectHint) and
 * deep-redacted everywhere else: the conversation plane must never
 * teach the director plane the machine layout.
 */
export function buildDirectorIntent({
  userMessage,
  lane,
  laneReason,
  flowId,
  userGoal,
  constraints = [],
  clarifications = [],
  projectHint,
} = {}) {
  if (!VALID_LANES.has(lane)) {
    throw new Error(`lane must be one of: ${[...VALID_LANES].join(", ")}`);
  }
  if (typeof laneReason !== "string" || !laneReason.trim()) {
    throw new Error("laneReason is required: the lane decision must be auditable");
  }
  if (typeof flowId !== "string" || !flowId.trim() || !isSafeId(flowId)) {
    throw new Error("flowId must be a safe non-empty string");
  }
  const goal = typeof userGoal === "string" && userGoal.trim()
    ? userGoal.trim()
    : (typeof userMessage === "string" ? userMessage.trim() : "");
  if (!goal) {
    throw new Error("userMessage or userGoal is required");
  }
  if (projectHint !== undefined) {
    if (typeof projectHint !== "string" || !projectHint.trim()) {
      throw new Error("projectHint must be a non-empty string when provided");
    }
    if (PATH_LIKE.test(projectHint.trim())) {
      throw new Error("projectHint must be a project name, not a filesystem path");
    }
  }
  const cleanConstraints = constraints.map((constraint, index) => {
    if (typeof constraint !== "string" || !constraint.trim()) {
      throw new Error(`constraints[${index}] must be a non-empty string`);
    }
    return constraint.trim();
  });
  const cleanClarifications = clarifications.map((entry, index) => {
    if (!entry || typeof entry.question !== "string" || typeof entry.answer !== "string") {
      throw new Error(`clarifications[${index}] must have question and answer strings`);
    }
    return { question: entry.question.trim(), answer: entry.answer.trim() };
  });

  return sanitizeDirectorContext({
    schemaVersion: DIRECTOR_INTENT_SCHEMA_VERSION,
    flowId: flowId.trim(),
    lane,
    laneReason: laneReason.trim(),
    userGoal: goal,
    constraints: cleanConstraints,
    clarifications: cleanClarifications,
    ...(projectHint ? { projectHint: projectHint.trim() } : {}),
  });
}

/**
 * Consumer-side validation mirror (kept in sync with QMAI's
 * director-intent-import.ts). Used by the plan runner before an
 * intent may land in the QMAI inbox.
 */
export function validateDirectorIntent(value) {
  const errors = [];
  const intent = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!intent) {
    return { valid: false, errors: ["director intent must be an object"] };
  }
  if (intent.schemaVersion !== DIRECTOR_INTENT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DIRECTOR_INTENT_SCHEMA_VERSION}`);
  }
  if (typeof intent.flowId !== "string" || !intent.flowId.trim() || !isSafeId(intent.flowId)) {
    errors.push("flowId must be a safe non-empty string");
  }
  if (!VALID_LANES.has(intent.lane)) {
    errors.push("lane must be director or canvas");
  }
  if (typeof intent.laneReason !== "string" || !intent.laneReason.trim()) {
    errors.push("laneReason is required");
  }
  if (typeof intent.userGoal !== "string" || !intent.userGoal.trim()) {
    errors.push("userGoal is required");
  }
  if (!Array.isArray(intent.constraints) || intent.constraints.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push("constraints must contain only non-empty strings");
  }
  return { valid: errors.length === 0, errors };
}

function isSafeId(value) {
  if (/[\\/]/.test(value)) return false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}
