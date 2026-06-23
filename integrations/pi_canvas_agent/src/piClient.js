import {
  buildCanvasAgentSystemPrompt,
  enforceNoGenerationConstraint,
  HUANYING_CANVAS_TOOL_NAME,
  loadHuanyingSkillDefinitions,
  normalizeProposedActions
} from "./huanyingTools.js";
import { safeResponse } from "./protocol.js";
import { fileURLToPath } from "node:url";

let runPiCompletionOverride = null;

export function setRunPiCompletionForTests(runPiCompletion) {
  runPiCompletionOverride = typeof runPiCompletion === "function" ? runPiCompletion : null;
}

function stripMarkdownCodeFence(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*([\s\S]*?)\s*```$/);
  return match ? match[1].trim() : trimmed;
}

function parseJsonObject(text) {
  const trimmed = stripMarkdownCodeFence(text);
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}$/);
    if (!match) {
      return null;
    }
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function safeIdPart(value) {
  return String(value || "default")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "default";
}

function withResponseContractV2Defaults(request, parsed, localMatchedSkills = []) {
  const actions = normalizeProposedActions(parsed.actions);
  const hasV2 = parsed.intent || parsed.plan || parsed.actionsByStep || parsed.execution;
  if (hasV2) {
    const existingIntent =
      parsed.intent && typeof parsed.intent === "object" && !Array.isArray(parsed.intent) ? parsed.intent : null;
    const mergedSkills = [...new Set([
      ...(Array.isArray(existingIntent?.matchedSkills) ? existingIntent.matchedSkills : []),
      ...(Array.isArray(localMatchedSkills) ? localMatchedSkills : [])
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
      ...(parsed.intent && typeof parsed.intent === "object" && !Array.isArray(parsed.intent) ? parsed.intent : {}),
      id: String(parsed.intent?.id || "").trim() || `intent_${suffix}`,
      mode: request?.mode === "actions" ? "act" : "plan",
      matchedSkills: [...new Set([
        ...(Array.isArray(parsed.intent?.matchedSkills) ? parsed.intent.matchedSkills : []),
        ...(Array.isArray(localMatchedSkills) ? localMatchedSkills : [])
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

// Semantic-ish trigger matching: exact substring, OR all words of a multi-word
// trigger present, OR both halves of a CJK trigger (length >= 4) present. This
// rule is mirrored in services/claw_skill_registry_service.py.
function triggerMatchesText(trigger, text) {
  const normalized = String(trigger || "").toLowerCase().trim();
  if (!normalized) {
    return false;
  }
  if (text.includes(normalized)) {
    return true;
  }
  const stopwords = new Set(["this", "that", "the", "a", "an", "my", "your", "for", "to", "of"]);
  const words = normalized.split(/\s+/).filter((word) => word && !stopwords.has(word));
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

export function matchedSkillIdsForMessage(message, skills = []) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) {
    return [];
  }
  const matched = [];
  for (const skill of Array.isArray(skills) ? skills : []) {
    const id = String(skill?.id || "").trim();
    if (!id) {
      continue;
    }
    const triggers = Array.isArray(skill?.triggers) ? skill.triggers : [];
    const hit = triggers.some((trigger) => triggerMatchesText(trigger, text));
    if (hit && !matched.includes(id)) {
      matched.push(id);
    }
  }
  return matched;
}

export function responseFromModelText(request, text, skills = []) {
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
      ...(Array.isArray(contract.warnings) ? contract.warnings.filter((w) => /dropped \d+ generation action/.test(w)) : [])
    ],
    requiresConfirmation: Boolean(parsed.requiresConfirmation)
  });
}


function assistantIntentIdFromRequest(request) {
  const direct = request && typeof request === "object" ? request.assistantIntent : null;
  const context = request && typeof request.context === "object" && request.context ? request.context : {};
  const nested = context.assistantIntent;
  const intent = direct && typeof direct === "object" ? direct : nested && typeof nested === "object" ? nested : {};
  return String(intent.id || "").trim().toLowerCase();
}

export function canvasAgentModeFromRequest(request) {
  if (request?.mode !== "actions") {
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

export function buildStrictActionContractPrompt() {
  return [
    "Strict action JSON contract:",
    "Return exactly one JSON object: {\"reply\": string, \"actions\": array, \"warnings\": array, \"requiresConfirmation\": boolean}.",
    "Do not use delete actions, shell/browser/file/network/package/MCP actions, or placeholder actions.",
    "create_node requires type=\"create_node\", nodeType, name, and optional stable id/nodeId. Safe nodeType: comment, source-text, source-image, source-video, source-audio, ai-text, ai-image, ai-video, ai-audio, group.",
    "connect_nodes requires from and to. Use ids from context or ids/nodeIds created earlier in the same actions array.",
    "layout_nodes requires layout and nodeIds. Allowed layout: horizontal, vertical, grid, single_chain, branch_flow, storyboard_grid, asset_lane, problem_lane.",
    "focus_nodes requires nodeIds. Never omit nodeIds.",
    "queue_generation_task requires nodeId; ai-video requires explicit confirmation and should normally be avoided unless the user asks for video generation.",
    "create_workflow_template is allowed only for explicit template-save intent; use project scope, templateId, name, nodeIds, version, author, tags, and requiresConfirmation=true. apply_workflow_template is allowed only for explicit template-reuse intent with templateId and requiresConfirmation=true. Do not write files or team libraries and do not claim saved until executor confirmation.",
    "Team template governance actions are allowed only for explicit team-library intent: submit_workflow_template_review, review_workflow_template, publish_workflow_template, deprecate_workflow_template, rollback_workflow_template, and record_workflow_template_reuse. Use team scope, templateId, teamId, reviewStatus/reviewer or reuseCount when known, requiresConfirmation=true, and never write files or start generation.",
    "For 'Run the R5 deterministic canvas assistant journey' on an empty canvas, return a safe non-generative workflow such as: {\"reply\":\"Prepared an R5 canvas review note.\",\"actions\":[{\"type\":\"create_node\",\"id\":\"r5_review_note\",\"nodeType\":\"comment\",\"name\":\"R5 Review Note\",\"data\":{\"content\":\"Live R5 smoke test note\"}},{\"type\":\"focus_nodes\",\"nodeIds\":[\"r5_review_note\"]}],\"warnings\":[],\"requiresConfirmation\":false}."
  ].join("\n");
}

function modelNameFromRequest(request, options = {}) {
  if (options.model) {
    return String(options.model);
  }
  const model = request && typeof request.model === "object" && request.model ? request.model : {};
  return String(model.model || model.modelId || model.id || process.env.PI_MODEL || "default");
}

function defaultSkillRoot() {
  return fileURLToPath(new URL("../../../config/assistant-skills-v2", import.meta.url));
}

function defaultSkillDefinitions(options = {}) {
  if (Array.isArray(options.skills)) {
    return options.skills;
  }
  return loadHuanyingSkillDefinitions(options.skillRoot || defaultSkillRoot());
}

export function createPiModelClient() {
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
