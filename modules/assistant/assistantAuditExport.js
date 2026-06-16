const AUDIT_RECORD_SCHEMA_VERSION = "canvas-agent-audit-record-v1";
const AUDIT_BUNDLE_SCHEMA_VERSION = "canvas-agent-audit-bundle-v1";

function nowIso() {
  return new Date().toISOString();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").trim();
}

function sanitizeString(value) {
  const text = safeString(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+/gi, "sk-[REDACTED]")
    .replace(/\b[A-Za-z]:\\[^"'<>|]+/g, "[REDACTED_PATH]")
    .replace(/data:[^\s"'<>]+/gi, "[REDACTED_DATA_URL]")
    .replace(/blob:[^\s"'<>]+/gi, "[REDACTED_BLOB_URL]");
  try {
    const parsed = new URL(text);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(token|api[_-]?key|key|secret|signature|x-amz-signature|access[_-]?token|authorization)$/i.test(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return changed ? parsed.toString() : text;
  } catch {
    return text;
  }
}

function sanitizeJson(value) {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJson).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/api[_-]?key|access[_-]?token|proxy[_-]?token|authorization|secret|password|credential|headers|localPath|filePath|absolutePath/i.test(key)) {
      continue;
    }
    const sanitized = sanitizeJson(child);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function actionType(action) {
  return safeString(action?.type || action?.action || action?.actionType || action?.operation);
}

function summarizeActions(actions = []) {
  const byType = {};
  for (const action of safeArray(actions)) {
    const type = actionType(action) || "unknown";
    byType[type] = (byType[type] || 0) + 1;
  }
  return {
    total: safeArray(actions).length,
    byType,
  };
}

export function createAssistantAuditRecord({
  operationId = "",
  projectId = "",
  teamId = "",
  userId = "",
  conversationId = "",
  messageId = "",
  traceId = "",
  model = {},
  contextDigest = {},
  actions = [],
  receipt = {},
  createdAt = "",
} = {}) {
  return sanitizeJson({
    schemaVersion: AUDIT_RECORD_SCHEMA_VERSION,
    operationId: safeString(operationId) || `audit_${Math.random().toString(36).slice(2, 12)}`,
    projectId: safeString(projectId),
    teamId: safeString(teamId),
    userId: safeString(userId),
    conversationId: safeString(conversationId),
    messageId: safeString(messageId),
    traceId: safeString(traceId),
    model: {
      provider: safeString(model.provider),
      model: safeString(model.model || model.modelId || model.id),
      displayName: safeString(model.displayName),
    },
    contextDigest,
    actions: safeArray(actions),
    actionSummary: summarizeActions(actions),
    receipt,
    createdAt: safeString(createdAt) || nowIso(),
  });
}

export function exportAssistantAuditBundle(records = [], {
  projectId = "",
  teamId = "",
  exportedBy = "",
  exportedAt = "",
} = {}) {
  const targetProjectId = safeString(projectId);
  const targetTeamId = safeString(teamId);
  const filtered = safeArray(records).filter((record) => {
    if (targetProjectId && safeString(record.projectId) !== targetProjectId) {
      return false;
    }
    if (targetTeamId && safeString(record.teamId) !== targetTeamId) {
      return false;
    }
    return true;
  });
  const sanitized = filtered.map(sanitizeJson);
  return {
    schemaVersion: AUDIT_BUNDLE_SCHEMA_VERSION,
    exportedAt: safeString(exportedAt) || nowIso(),
    exportedBy: safeString(exportedBy),
    projectId: targetProjectId,
    teamId: targetTeamId,
    summary: {
      totalRecords: sanitized.length,
      projects: [...new Set(sanitized.map((record) => record.projectId).filter(Boolean))].sort(),
      teams: [...new Set(sanitized.map((record) => record.teamId).filter(Boolean))].sort(),
    },
    records: cloneJson(sanitized),
  };
}
