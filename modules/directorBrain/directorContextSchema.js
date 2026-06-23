export const DIRECTOR_CONTEXT_SCHEMA_VERSION = "director-context/v1";

import { isSensitiveKey, redactSensitiveText } from "../assistant/sensitiveDataRules.js";


export function isSensitiveContextKey(key) {
  return isSensitiveKey(key);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactString(value) {
  return redactSensitiveText(value);
}

export function sanitizeDirectorContext(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = value.map((item) => sanitizeDirectorContext(item, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      result[key] = sanitizeDirectorContext(child, seen);
    }
    seen.delete(value);
    return result;
  }
  return value;
}

function requireString(errors, object, key) {
  if (typeof object?.[key] !== "string" || !object[key].trim()) {
    errors.push(`${key} is required`);
  }
}

export function validateDirectorContext(input) {
  const context = sanitizeDirectorContext(input);
  const errors = [];
  if (!isRecord(context)) {
    return { valid: false, errors: ["context must be an object"] };
  }
  if (context.schemaVersion !== DIRECTOR_CONTEXT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${DIRECTOR_CONTEXT_SCHEMA_VERSION}`);
  }
  requireString(errors, context, "contextId");
  requireString(errors, context, "createdAt");
  requireString(errors, context, "mode");
  if (!isRecord(context.project)) {
    errors.push("project is required");
  } else {
    requireString(errors, context.project, "id");
    requireString(errors, context.project, "name");
  }
  if (!isRecord(context.retrieval) || !Array.isArray(context.retrieval.sources)) {
    errors.push("retrieval.sources is required");
  }
  if (!isRecord(context.constraints) || !Array.isArray(context.constraints.positive) || !Array.isArray(context.constraints.negative)) {
    errors.push("constraints.positive and constraints.negative are required");
  }
  if (!isRecord(context.sourcePolicy)) {
    errors.push("sourcePolicy is required");
  } else {
    if (context.sourcePolicy.readOnly !== true) errors.push("sourcePolicy.readOnly must be true");
    if (context.sourcePolicy.redactedLocalPaths !== true) errors.push("sourcePolicy.redactedLocalPaths must be true");
    if (context.sourcePolicy.writeBackAllowed !== false) errors.push("sourcePolicy.writeBackAllowed must be false");
    if (context.sourcePolicy.videoGenerationRequiresConfirmation !== true) {
      errors.push("sourcePolicy.videoGenerationRequiresConfirmation must be true");
    }
  }
  return { valid: errors.length === 0, errors, context };
}
