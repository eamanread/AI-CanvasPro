import {
  buildCanvasAgentSystemPrompt,
  enforceNoGenerationConstraint,
  HUANYING_CANVAS_TOOL_NAME,
  loadHuanyingSkillDefinitions,
  normalizeProposedActions
} from "./huanyingTools.js";
import { type BridgeRequest, type BridgeResponse, safeResponse } from "./protocol.js";
import { fileURLToPath } from "node:url";

export interface PiClientOptions {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  skillRoot?: string;
  skills?: unknown[];
}

export interface PiModelClient {
  complete(request: BridgeRequest, options?: PiClientOptions): Promise<BridgeResponse>;
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/);
  return match ? match[1].trim() : trimmed;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = stripMarkdownCodeFence(text);
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

function safeIdPart(value: unknown): string {
  return String(value || "default")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "default";
}

function withResponseContractV2Defaults(request: BridgeRequest, parsed: Record<string, unknown>, localMatchedSkills: string[] = []): Record<string, unknown> {
  const actions = normalizeProposedActions(parsed.actions);
  const hasV2 = Boolean(parsed.intent || parsed.plan || parsed.actionsByStep || parsed.execution);
  if (hasV2) {
    const existingIntent =
      parsed.intent && typeof parsed.intent === "object" && !Array.isArray(parsed.intent)
        ? (parsed.intent as Record<string, unknown>)
        : null;
    const mergedSkills = [...new Set([
      ...(Array.isArray(existingIntent?.matchedSkills) ? (existingIntent?.matchedSkills as unknown[]) : []),
      ...localMatchedSkills
    ].map((id) => String(id || "").trim()).filter(Boolean))];
    return {
      ...parsed,
      ...(existingIntent || mergedSkills.length
        ? { intent: { ...(existingIntent || {}), matchedSkills: mergedSkills } }
        : {}),
      actions,
      actionsByStep: parsed.actionsByStep || (actions.length ? { step_actions: actions } : {})
    };
  }
  if (!actions.length) {
    return { ...parsed, actions };
  }
  const suffix = safeIdPart(request?.id);
  return {
    ...parsed,
    intent: {
      ...(parsed.intent && typeof parsed.intent === "object" && !Array.isArray(parsed.intent)
        ? (parsed.intent as Record<string, unknown>)
        : {}),
      id: String((parsed.intent as Record<string, unknown> | undefined)?.id || "").trim() || `intent_${suffix}`,
      mode: request?.mode === "actions" ? "act" : "plan",
      matchedSkills: [...new Set([
        ...(Array.isArray((parsed.intent as Record<string, unknown> | undefined)?.matchedSkills)
          ? ((parsed.intent as Record<string, unknown>).matchedSkills as unknown[])
          : []),
        ...localMatchedSkills
      ].map((id) => String(id || "").trim()).filter(Boolean))]
    },
    plan: {
      id: `plan_${suffix}`,
      title: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Canvas actions",
      status: "draft",
      steps: [
        {
          id: "step_actions",
          title: "Apply proposed canvas actions",
          enabled: true,
          order: 1,
          status: "draft",
          estimatedActions: actions.length
        }
      ]
    },
    actionsByStep: { step_actions: actions },
    execution: {
      id: `exec_${suffix}`,
      status: "draft",
      drawerState: { visible: actions.length > 0, expanded: false }
    },
    actions
  };
}

// Semantic-ish trigger matching: exact substring, OR all non-stopword words of
// a multi-word trigger present, OR both halves of a CJK trigger (length >= 4)
// present. Mirrored in piClient.js and services/claw_skill_registry_service.py.
function triggerMatchesText(trigger: unknown, text: string): boolean {
  const normalized = String(trigger || "").toLowerCase().trim();
  if (!normalized) {
    return false;
  }
  if (text.includes(normalized)) {
    return true;
  }
  const stopwords = new Set(["this", "that", "the", "a", "an", "my", "your", "for", "to", "of"]);
  const words = normalized.split(/\s+/).filter((word) => word.length > 0 && !stopwords.has(word));
  if (words.length > 1 && words.every((word) => text.includes(word))) {
    return true;
  }
  const isCjk = /[一-鿿]/.test(normalized);
  if (isCjk && normalized.length >= 4) {
    const half = Math.ceil(normalized.length / 2);
    const head = normalized.slice(0, half);
    const tail = normalized.slice(half);
    if (head && tail && text.includes(head) && text.includes(tail)) {
      return true;
    }
  }
  return false;
}

export function matchedSkillIdsForMessage(message: unknown, skills: unknown[] = []): string[] {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) {
    return [];
  }
  const matched: string[] = [];
  for (const skill of Array.isArray(skills) ? skills : []) {
    const record = skill as Record<string, unknown> | null;
    const id = String(record?.id || "").trim();
    if (!id) {
      continue;
    }
    const triggers = Array.isArray(record?.triggers) ? (record?.triggers as unknown[]) : [];
    const hit = triggers.some((trigger) => triggerMatchesText(trigger, text));
    if (hit && !matched.includes(id)) {
      matched.push(id);
    }
  }
  return matched;
}

export function responseFromModelText(request: BridgeRequest, text: string, skills: unknown[] = []): BridgeResponse {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return safeResponse(request.id, {
      reply: String(text || ""),
      actions: [],
      warnings: ["Model returned plain text without action JSON."],
      requiresConfirmation: false
    });
  }

  const contract = enforceNoGenerationConstraint(
    request?.message,
    withResponseContractV2Defaults(request, parsed, matchedSkillIdsForMessage(request?.message, skills))
  );
  return safeResponse(request.id, {
    ...contract,
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    warnings: [
      ...(Array.isArray(parsed.warnings) ? parsed.warnings : []),
      ...(Array.isArray(contract.warnings) ? (contract.warnings as string[]).filter((w) => /dropped \d+ generation action/.test(w)) : [])
    ],
    requiresConfirmation: Boolean(parsed.requiresConfirmation)
  });
}


function assistantIntentIdFromRequest(request: BridgeRequest): string {
  const direct = (request as unknown as Record<string, unknown>).assistantIntent;
  const context = request.context && typeof request.context === "object" ? request.context as Record<string, unknown> : {};
  const nested = context.assistantIntent;
  const intent = direct && typeof direct === "object" ? direct as Record<string, unknown> : nested && typeof nested === "object" ? nested as Record<string, unknown> : {};
  return String(intent.id || "").trim().toLowerCase();
}

export function canvasAgentModeFromRequest(request: BridgeRequest) {
  if (request.mode !== "actions") {
    return "replyOnly";
  }
  const intentId = assistantIntentIdFromRequest(request);
  if (["auto_layout", "auto-layout", "layout"].includes(intentId)) {
    return "auto_layout";
  }
  if (["canvas_doctor", "doctor"].includes(intentId)) {
    return "doctor";
  }
  return "actions";
}

function modelNameFromRequest(request: BridgeRequest, options: PiClientOptions = {}): string {
  if (options.model) {
    return String(options.model);
  }
  const model = request.model && typeof request.model === "object" ? request.model : {};
  return String(model.model || model.modelId || model.id || process.env.PI_MODEL || "default");
}

function defaultSkillRoot(): string {
  return fileURLToPath(new URL("../../../config/assistant-skills-v2", import.meta.url));
}

function defaultSkillDefinitions(options: PiClientOptions = {}) {
  if (Array.isArray(options.skills)) {
    return options.skills;
  }
  return loadHuanyingSkillDefinitions(options.skillRoot || defaultSkillRoot());
}

export function createPiModelClient(): PiModelClient {
  return {
    async complete(request, options = {}) {
      const { runPiCompletion } = await import("./piSdkAdapter.js");
      const complete = runPiCompletionOverride || runPiCompletion;
      const mode = canvasAgentModeFromRequest(request);
      const skills = defaultSkillDefinitions(options);
      const text = await complete({
        model: modelNameFromRequest(request, options),
        systemPrompt: [buildCanvasAgentSystemPrompt(mode, { skills }), buildStrictActionContractPrompt()].join("\n\n"),
        message: request.message,
        context: request.context || {},
        toolName: HUANYING_CANVAS_TOOL_NAME,
        baseUrl: options.baseUrl || process.env.OPENAI_BASE_URL || "",
        apiKey: options.apiKey || process.env.OPENAI_API_KEY || ""
      });
      return responseFromModelText(request, text, skills);
    }
  };
}
