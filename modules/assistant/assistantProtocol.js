export const CANVAS_AGENT_PROTOCOL_VERSION = "2026-06-03";

export const AssistantStreamEventType = Object.freeze({
  MessageStart: "message.start",
  MessageDelta: "message.delta",
  MessageDone: "message.done",
  ActionProposed: "action.proposed",
  Warning: "warning",
  ToolStatus: "tool.status",
  Error: "error",
  Receipt: "receipt",
});

const STREAM_EVENT_TYPES = new Set(Object.values(AssistantStreamEventType));
import { SENSITIVE_KEY_PATTERN } from "./sensitiveDataRules.js";

const SECRET_FIELD_PATTERN = SENSITIVE_KEY_PATTERN;

function safeString(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function sanitizeContractObject(value, depth = 0) {
  if (!isRecord(value) || depth > 5) {
    return {};
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      continue;
    }
    if (Array.isArray(item)) {
      result[key] = item
        .map((entry) => (isRecord(entry) ? sanitizeContractObject(entry, depth + 1) : entry))
        .filter((entry) => entry !== undefined);
      continue;
    }
    if (isRecord(item)) {
      result[key] = sanitizeContractObject(item, depth + 1);
      continue;
    }
    if (typeof item === "string" && /^[A-Za-z]:\\/.test(item)) {
      continue;
    }
    if (item !== undefined) {
      result[key] = item;
    }
  }
  return result;
}

function normalizeContractIntent(intent) {
  if (!isRecord(intent)) return undefined;
  const id = safeString(intent.id);
  if (!id) return undefined;
  const normalized = sanitizeContractObject(intent);
  normalized.id = id;
  if (Array.isArray(intent.matchedSkills)) {
    normalized.matchedSkills = stringList(intent.matchedSkills);
  }
  return normalized;
}

function normalizeActionsByStep(actionsByStep) {
  if (!isRecord(actionsByStep)) return {};
  const result = {};
  for (const [stepId, actions] of Object.entries(actionsByStep)) {
    const key = safeString(stepId);
    if (!key) continue;
    result[key] = normalizeAssistantActions(actions);
  }
  return result;
}

function contractV2Fields(payload) {
  const fields = {};
  const intent = normalizeContractIntent(payload.intent);
  if (intent) fields.intent = intent;
  if (isRecord(payload.plan)) fields.plan = sanitizeContractObject(payload.plan);
  if (isRecord(payload.actionsByStep)) fields.actionsByStep = normalizeActionsByStep(payload.actionsByStep);
  if (isRecord(payload.execution)) fields.execution = sanitizeContractObject(payload.execution);
  if (isRecord(payload.developer)) fields.developer = sanitizeContractObject(payload.developer);
  return fields;
}

export function normalizeAssistantIntent(intent) {
  if (!intent || typeof intent !== "object") {
    return null;
  }
  const id = String(intent.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    title: String(intent.title || id).trim() || id,
    source: String(intent.source || "manual").trim() || "manual",
  };
}

export function normalizeAssistantActions(actions) {
  return Array.isArray(actions) ? actions.filter((action) => action && typeof action === "object") : [];
}

export function normalizeAssistantWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.map((warning) => String(warning || "").trim()).filter(Boolean)
    : [];
}

export function buildAssistantRequest({
  message,
  context,
  assistantIntent,
  mode = "actions",
  conversationId,
  model,
  attachments,
} = {}) {
  const text = String(message || "").trim();
  if (!text) {
    return null;
  }

  const normalizedIntent = normalizeAssistantIntent(assistantIntent);
  const safeContext = context && typeof context === "object" ? { ...context } : {};
  if (normalizedIntent) {
    safeContext.assistantIntent = normalizedIntent;
  }

  const request = {
    message: text,
    context: safeContext,
    mode: String(mode || "actions").trim() || "actions",
  };
  if (conversationId) {
    request.conversationId = String(conversationId);
  }
  if (normalizedIntent) {
    request.assistantIntent = normalizedIntent;
  }
  if (model && typeof model === "object") {
    request.model = { ...model };
  }
  if (Array.isArray(attachments) && attachments.length) {
    request.attachments = attachments.map((attachment) => ({ ...attachment }));
  }
  return request;
}

export function normalizeAssistantResponse(response = {}) {
  const payload = response && typeof response === "object" ? response : {};
  return {
    protocolVersion: payload.protocolVersion || CANVAS_AGENT_PROTOCOL_VERSION,
    conversationId: payload.conversationId ? String(payload.conversationId) : "",
    messageId: payload.messageId ? String(payload.messageId) : "",
    traceId: payload.traceId ? String(payload.traceId) : "",
    reply: typeof payload.reply === "string" ? payload.reply : "",
    ...contractV2Fields(payload),
    actions: normalizeAssistantActions(payload.actions),
    cards: Array.isArray(payload.cards) ? payload.cards.filter((card) => card && typeof card === "object") : [],
    warnings: normalizeAssistantWarnings(payload.warnings),
    requiresConfirmation: Boolean(payload.requiresConfirmation),
    usage: payload.usage && typeof payload.usage === "object" ? { ...payload.usage } : {},
  };
}

export function normalizeAssistantStreamEvent(event = {}) {
  const normalized = normalizeAssistantStreamFrame(event);
  return normalized.type === AssistantStreamEventType.Error && normalized.unsupported === true ? null : normalized;
}

export function normalizeAssistantStreamFrame(frame = {}) {
  if (!frame || typeof frame !== "object") {
    return { type: AssistantStreamEventType.Error, message: "Invalid stream frame." };
  }
  const type = STREAM_EVENT_TYPES.has(frame.type) ? frame.type : "";
  if (!type) {
    return {
      type: AssistantStreamEventType.Error,
      message: `Unsupported stream frame: ${safeString(frame.type)}`,
      unsupported: true,
    };
  }
  if (type === AssistantStreamEventType.MessageStart) {
    return {
      type,
      conversationId: safeString(frame.conversationId),
      messageId: safeString(frame.messageId),
      traceId: safeString(frame.traceId),
    };
  }
  if (type === AssistantStreamEventType.MessageDelta) {
    return {
      type,
      delta: String(frame.delta ?? frame.content ?? frame.text ?? ""),
      actions: [],
      conversationId: safeString(frame.conversationId),
      messageId: safeString(frame.messageId),
      traceId: safeString(frame.traceId),
    };
  }
  if (type === AssistantStreamEventType.Warning) {
    return {
      type,
      message: safeString(frame.message ?? frame.warning),
    };
  }
  if (type === AssistantStreamEventType.MessageDone) {
    const payload = frame.response && typeof frame.response === "object" ? frame.response : frame;
    return {
      type,
      reply: typeof payload.reply === "string" ? payload.reply : String(payload.content ?? payload.text ?? ""),
      actions: normalizeAssistantActions(payload.actions),
      ...contractV2Fields(payload),
      warnings: normalizeAssistantWarnings(payload.warnings),
      requiresConfirmation: Boolean(payload.requiresConfirmation),
      conversationId: safeString(payload.conversationId ?? frame.conversationId),
      messageId: safeString(payload.messageId ?? frame.messageId),
      traceId: safeString(payload.traceId ?? frame.traceId),
      response: payload.response,
    };
  }
  if (type === AssistantStreamEventType.ActionProposed) {
    return {
      type,
      actions: [],
      message: "Action proposal events are advisory; final actions must arrive in message.done.",
    };
  }
  if (type === AssistantStreamEventType.Error) {
    return {
      ...frame,
      type,
      message: safeString(frame.message ?? frame.error) || "Canvas agent stream failed.",
    };
  }
  if (type === AssistantStreamEventType.ToolStatus || type === AssistantStreamEventType.Receipt) {
    return {
      ...frame,
      type,
    };
  }
  return {
    type: AssistantStreamEventType.Error,
    message: `Unsupported stream frame: ${safeString(frame.type)}`,
    unsupported: true,
  };
}

export function isTrustedAssistantActionFrame(event = {}) {
  return event?.type === AssistantStreamEventType.MessageDone;
}
