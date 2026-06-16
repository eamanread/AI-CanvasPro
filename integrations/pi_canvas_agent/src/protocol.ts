export interface BridgeRequest {
  id: string;
  type: "chat";
  conversationId?: string;
  mode?: string;
  message: string;
  context?: unknown;
  model?: Record<string, string>;
}

export interface BridgeResponse {
  id: string;
  type: "response";
  success: boolean;
  reply?: string;
  errorCode?: string;
  actions: unknown[];
  warnings: string[];
  requiresConfirmation: boolean;
}

export type BridgeStreamFrameType =
  | "message.start"
  | "message.delta"
  | "tool.status"
  | "warning"
  | "message.done"
  | "error";

export interface BridgeStreamFrame {
  id: string;
  type: BridgeStreamFrameType;
  conversationId?: string;
  messageId?: string;
  traceId?: string;
  delta?: string;
  message?: string;
  reply?: string;
  actions?: unknown[];
  warnings?: string[];
  requiresConfirmation?: boolean;
  errorCode?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SECRET_FIELD_PATTERN = /(api|secret|token|key|password|credential|localpath|filepath|path)/i;

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  return value;
}

function sanitizedModelReference(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const allowed = ["provider", "modelId", "id", "model", "displayName"];
  const model: Record<string, string> = {};
  for (const key of allowed) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const text = String(item).trim();
      if (text) {
        model[key] = text;
      }
    }
  }
  return Object.keys(model).length ? model : undefined;
}

function cleanWarnings(warnings: unknown): string[] {
  return Array.isArray(warnings)
    ? warnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
    : [];
}

function cleanActions(actions: unknown): Record<string, unknown>[] {
  return Array.isArray(actions) ? actions.filter(isRecord) : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function sanitizeContractObject(value: unknown, depth = 0): Record<string, unknown> {
  if (!isRecord(value) || depth > 5) {
    return {};
  }
  const result: Record<string, unknown> = {};
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

function cleanIntent(intent: unknown): Record<string, unknown> | undefined {
  if (!isRecord(intent)) {
    return undefined;
  }
  const id = String(intent.id || "").trim();
  if (!id) {
    return undefined;
  }
  const result = sanitizeContractObject(intent);
  result.id = id;
  if (Array.isArray(intent.matchedSkills)) {
    result.matchedSkills = stringList(intent.matchedSkills);
  }
  return result;
}

function cleanActionsByStep(actionsByStep: unknown): Record<string, Record<string, unknown>[]> | undefined {
  if (!isRecord(actionsByStep)) {
    return undefined;
  }
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const [stepId, actions] of Object.entries(actionsByStep)) {
    const key = String(stepId || "").trim();
    if (!key) {
      continue;
    }
    result[key] = cleanActions(actions);
  }
  return result;
}

function contractV2Fields(data: Record<string, unknown> = {}): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const intent = cleanIntent(data.intent);
  if (intent) fields.intent = intent;
  if (isRecord(data.plan)) fields.plan = sanitizeContractObject(data.plan);
  const actionsByStep = cleanActionsByStep(data.actionsByStep);
  if (actionsByStep) fields.actionsByStep = actionsByStep;
  if (isRecord(data.execution)) fields.execution = sanitizeContractObject(data.execution);
  if (isRecord(data.developer)) fields.developer = sanitizeContractObject(data.developer);
  return fields;
}

function streamBase(id: string, data: Partial<BridgeStreamFrame> = {}) {
  return {
    id,
    conversationId: typeof data.conversationId === "string" ? data.conversationId : "",
    messageId: typeof data.messageId === "string" ? data.messageId : "",
    traceId: typeof data.traceId === "string" ? data.traceId : ""
  };
}

export function normalizeBridgeRequest(value: unknown): BridgeRequest {
  if (!isRecord(value)) {
    throw new Error("request must be an object");
  }

  const id = requiredString(value.id, "id");
  const type = requiredString(value.type, "type");
  if (type !== "chat") {
    throw new Error("type must be chat");
  }

  const request: BridgeRequest = {
    id,
    type: "chat",
    message: requiredString(value.message, "message")
  };

  const conversationId = optionalString(value.conversationId, "conversationId");
  if (conversationId !== undefined) {
    request.conversationId = conversationId;
  }

  const mode = optionalString(value.mode, "mode");
  if (mode !== undefined) {
    request.mode = mode;
  }

  if ("context" in value) {
    request.context = value.context;
  }

  const model = sanitizedModelReference(value.model);
  if (model !== undefined) {
    request.model = model;
  }

  return request;
}

export function safeResponse(
  id: string,
  data: Partial<Omit<BridgeResponse, "id" | "type">> = {}
): BridgeResponse {
  const errorCode = typeof data.errorCode === "string" && data.errorCode.trim().length > 0
    ? data.errorCode
    : undefined;

  return {
    id,
    type: "response",
    success: typeof data.success === "boolean" ? data.success : true,
    reply: typeof data.reply === "string" ? data.reply : "",
    ...(errorCode !== undefined ? { errorCode } : {}),
    actions: cleanActions(data.actions),
    ...contractV2Fields(data as Record<string, unknown>),
    warnings: cleanWarnings(data.warnings),
    requiresConfirmation: Boolean(data.requiresConfirmation)
  };
}

export function safeStreamFrame(
  id: string,
  data: Partial<BridgeStreamFrame> = {}
): BridgeStreamFrame {
  const type = typeof data.type === "string" ? data.type : "error";
  const base = streamBase(id, data);

  if (type === "message.start") {
    return { ...base, type };
  }

  if (type === "message.delta") {
    return {
      ...base,
      type,
      delta: typeof data.delta === "string" ? data.delta : "",
      actions: []
    };
  }

  if (type === "tool.status" || type === "warning") {
    return {
      ...base,
      type,
      message: typeof data.message === "string" ? data.message.trim() : ""
    };
  }

  if (type === "message.done") {
    return {
      ...base,
      type,
      reply: typeof data.reply === "string" ? data.reply : "",
      actions: cleanActions(data.actions),
      ...contractV2Fields(data as Record<string, unknown>),
      warnings: cleanWarnings(data.warnings),
      requiresConfirmation: Boolean(data.requiresConfirmation)
    };
  }

  return {
    ...base,
    type: "error",
    message:
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : "Pi canvas agent stream failed.",
    errorCode:
      typeof data.errorCode === "string" && data.errorCode.trim()
        ? data.errorCode.trim()
        : "pi_stream_error"
  };
}
