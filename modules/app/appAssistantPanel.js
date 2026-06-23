import {
  buildAssistantActionReceipt,
  summarizeAssistantActions,
} from "../assistant/assistantActionPreview.js";
import {
  buildAssistantActionPreviewModel,
  formatAssistantActionPreviewModel,
} from "../assistant/assistantActionPreviewModel.js";
import { executeAssistantActions } from "../assistant/assistantActionExecutor.js";
import { lineageForProvider } from "../assistant/launchTrustPolicy.js";
import {
  LAUNCH_STRINGS,
  launchStepLabel,
  launchContractNodesText,
  launchPreviewCostText,
  launchRunningCostText,
} from "../assistant/launchStrings.js";
import { createLaunchProviderRegistry } from "../assistant/launchProviderRegistry.js";
import { createVimaxLaunchProvider } from "../assistant/vimaxLaunchProvider.js";
import { envelopeAssistantActions } from "../assistant/assistantActionContract.js";
import { createAssistantAttachmentStore } from "../assistant/assistantAttachmentStore.js";
import { buildAssistantCanvasContext } from "../assistant/assistantContextBuilder.js";
import { createAssistantExecutionApiClient } from "../assistant/assistantExecutionApiClient.js";
import { createAssistantExecutionOrchestrator } from "../assistant/assistantExecutionOrchestrator.js";
import { createAssistantExecutionStore } from "../assistant/assistantExecutionStore.js";
import { buildAssistantMentionContext } from "../assistant/assistantMentionContext.js";
import { buildAssistantMentionMenu } from "../assistant/assistantMentionResolver.js";
import { createFloatingLayerController } from "../assistant/assistantFloatingLayer.js";
import {
  analyzeAssistantActionBatch,
  createInteractionCard,
  createVimaxRenderCard,
  mergeExecutionDetails,
  updateInteractionCardStatus,
} from "../assistant/assistantInteractionCards.js";
import {
  filterConfiguredTextModelOptions,
  filterSelectableTextModelOptions,
  isConfiguredTextModelOption,
} from "../assistant/assistantModelRegistry.js";
import { computeExecutionMetrics } from "../assistant/assistantExecutionMetrics.js";
import {
  countGenerationActions,
  generationConfirmationMessage,
  generationConfirmationRequired,
} from "../assistant/assistantGenerationConfirmation.js";
import { mapCanvasGenerationState } from "../assistant/canvasSkills/generationStateMapper.js";
import {
  AssistantStreamEventType,
  buildAssistantRequest,
  normalizeAssistantIntent,
  normalizeAssistantResponse,
} from "../assistant/assistantProtocol.js";
import { consumeAssistantStream } from "../assistant/assistantStreamingClient.js";
import { appendAssistantTypingMessage } from "../assistant/assistantTypingEffect.js";
import { buildDirectorIntent } from "../directorBrain/directorIntent.js";
import { buildCanvasDailiesExport } from "../directorBrain/directorCanvasDailies.js";
import { parseVimaxCommand } from "../assistant/vimaxCommandParser.js";
import { mapVimaxShotplanToCanvasActions } from "../assistant/vimaxCanvasActions.js";
import { mapVimaxStoryToCanvasActions, mapVimaxCastToCanvasActions, castContentToCharacters } from "../assistant/vimaxStoryCastCanvasActions.js";
import { collectVimaxEdits, selectedRenderShotIdxs } from "../assistant/vimaxWriteback.js";
import { runVimaxRenderJob } from "./vimaxRenderJob.js";
import { appendCurrentCraft, synthesizeFilmCraftCommand, normalizeFilmCraftRoster, isDirectorCommand } from "../assistant/assistantFilmCraft.js";
import { mapVimaxPortraitsToCanvasActions } from "../assistant/vimaxPortraitsCanvasActions.js";

// "确认成片" / "render" - the explicit cost-sovereignty gate before any
// render spend (the budget was shown in the plan receipt).
function parseVimaxRenderConfirm(message) {
  return /^\s*(?:确认成片|确认渲染|开始成片|confirm\s*render)\s*$/i.test(String(message || ""));
}

// "确认定妆" - the cost gate before any portrait draw (the budget was shown
// when the 定妆/重摇 staged the three-view placeholders).
function parseVimaxPortraitsConfirm(message) {
  return /^\s*(?:确认定妆|开始定妆|confirm\s*portraits?)\s*$/i.test(String(message || ""));
}

// "重摇: 男主" / "重摇整套" - re-stage 定妆 for the named characters with an
// invalidate flag (delete the old portraits so they redraw on 确认定妆).
// Returns { names } or null. Empty names = 重摇整套 (all of the last set).
// A colon is REQUIRED for the named form so prose like "重摇一下这个镜头"
// (no colon, not 整套) falls through to the normal PI lane.
function parseVimaxReshootCommand(message) {
  const m = /^\s*重摇(整套)?\s*([:：])?\s*(.*)$/.exec(String(message || ""));
  if (!m) return null;
  const whole = Boolean(m[1]);
  const hasColon = Boolean(m[2]);
  const body = String(m[3] || "").trim();
  // Only a command when it's 「重摇整套」 or has an explicit colon.
  if (!whole && !hasColon) return null;
  const names = body
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { names };
}
import { rankDirectorKnowledge } from "../assistant/directorKnowledgeRanker.js";

// Director knowledge in the everyday PI lane: fetched once per session
// (the server caches the projection), ranked per message by the
// pure-string ranker. Fail-open everywhere - the feature flag
// state.directorKnowledgeInContext === false kills injection.
function ensureDirectorKnowledgeFetched(state, api) {
  if (state.directorKnowledgeFetchStarted || typeof api?.directorKnowledge !== "function") return;
  state.directorKnowledgeFetchStarted = true;
  void Promise.resolve(api.directorKnowledge())
    .then((response) => {
      state.directorKnowledgeCards = Array.isArray(response?.cards) ? response.cards : [];
    })
    .catch(() => {
      state.directorKnowledgeCards = [];
    });
}

function rankDirectorKnowledgeForMessage(state, api, message) {
  try {
    // QMAI knowledge projection is a legacy-QMAI behavior; dormant by
    // default (α′ F10).
    if (!state?.legacyQmaiEnabled) return [];
    if (state.directorKnowledgeInContext === false) return [];
    ensureDirectorKnowledgeFetched(state, api);
    const cards = Array.isArray(state.directorKnowledgeCards) ? state.directorKnowledgeCards : [];
    if (!cards.length) return [];
    return rankDirectorKnowledge(message, cards, { limit: 3 });
  } catch {
    return [];
  }
}

export function formatAssistantPanelReceipt({
  workflowKind = "",
  nodeCount = 0,
  edgeCount = 0,
  generationTaskCount = 0,
  videoRequiresConfirmation = false,
} = {}) {
  const workflowTitles = {
    story_to_video: "Story to video workflow",
    text_to_image: "Text to image workflow",
    image_to_video: "Image to video workflow",
    text_to_image_video: "Text to image to video workflow",
    image_variants: "Image variants workflow",
  };
  const title = workflowTitles[workflowKind] || "Canvas actions";
  const parts = [`${title}: will create ${nodeCount} nodes and ${edgeCount} edges.`];
  if (generationTaskCount > 0) {
    parts.push(`${generationTaskCount} text/image generation tasks can run automatically.`);
  }
  if (
    videoRequiresConfirmation ||
    workflowKind === "story_to_video" ||
    workflowKind === "image_to_video" ||
    workflowKind === "text_to_image_video"
  ) {
    parts.push("Video generation requires confirmation.");
  }
  return parts.join(" ");
}

function normalizeActions(actions) {
  return Array.isArray(actions) ? actions : [];
}

function cloneAction(action) {
  if (!action || typeof action !== "object") {
    return action;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(action);
  }
  return JSON.parse(JSON.stringify(action));
}

function executionActions(execution = {}) {
  const actionsByStep = isPlainObject(execution?.actionsByStep) ? execution.actionsByStep : {};
  const steps = Array.isArray(execution?.plan?.steps) ? execution.plan.steps : [];
  const stepOrder = steps.length ? steps.map((step) => safeTrim(step?.id)).filter(Boolean) : Object.keys(actionsByStep);
  const actions = [];
  stepOrder.forEach((stepId) => {
    cloneActions(actionsByStep[stepId]).forEach((action) => actions.push(action));
  });
  return actions;
}

function isRunnableExecution(execution = {}) {
  return Boolean(safeTrim(execution?.id) && executionActions(execution).length);
}

function cloneActions(actions) {
  return normalizeActions(actions).map(cloneAction);
}

function cloneObjects(items) {
  return Array.isArray(items) ? items.filter((item) => item && typeof item === "object").map(cloneAction) : [];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeDebugValue(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    const next = value.map((item) => sanitizeDebugValue(item, seen));
    seen.delete(value);
    return next;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return {};
    seen.add(value);
    const next = {};
    for (const [key, child] of Object.entries(value)) {
      if (/api[_-]?key|authorization|token|secret|password|credential|cookie/i.test(key)) {
        continue;
      }
      next[key] = sanitizeDebugValue(child, seen);
    }
    seen.delete(value);
    return next;
  }
  if (typeof value === "string") {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED_BEARER]")
      .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]")
      .replace(/\b[A-Za-z0-9+/]{400,}={0,2}\b/g, "[REDACTED_BASE64]");
  }
  return value;
}

function cloneMessage(message) {
  const source = message && typeof message === "object" ? message : {};
  const cloned = {
    role: source.role === "user" ? "user" : "assistant",
    content: String(source.content || ""),
  };
  for (const key of ["status", "kind", "traceId", "errorCode"]) {
    if (source[key] !== undefined) {
      cloned[key] = source[key];
    }
  }
  if (Array.isArray(source.cards)) {
    cloned.cards = cloneObjects(source.cards);
  }
  if (Array.isArray(source.actions)) {
    cloned.actions = cloneActions(source.actions);
  }
  if (source.queueControl && typeof source.queueControl === "object") {
    cloned.queueControl = cloneAction(source.queueControl);
  }
  if (source.executionControl && typeof source.executionControl === "object") {
    cloned.executionControl = cloneAction(source.executionControl);
  }
  return cloned;
}

/**
 * Read canvas nodes from a graphStore regardless of its shape. The real app
 * store exposes nodes via getState().nodes and has NO bare .nodes property,
 * while test fakes and the autoload adapter expose a bare .nodes array. Reading
 * graphStore.nodes directly silently yields undefined on the real store (caught
 * by real-browser e2e, 2026-06-15) — always funnel node reads through here.
 * Mirrors the in-closure graphNodes() helper for module-level call sites.
 */
export function resolveGraphNodes(graphStore) {
  const snapshot = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = snapshot?.nodes || graphStore?.nodes || [];
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

function generationActionNodeType(action, graphStore) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const explicit = action?.nodeType || data.nodeType || data.type;
  if (explicit) {
    return String(explicit).trim();
  }
  const nodeId = String(action?.nodeId || "").trim();
  // The real app store has no bare .nodes — resolve through the shape-aware
  // accessor so an action that only carries a nodeId still resolves its type
  // (otherwise an unauthorized ai-video action would slip past the auth gate).
  const node = nodeId ? resolveGraphNodes(graphStore).find((item) => String(item?.id || "") === nodeId) : null;
  const nodeData = node?.data && typeof node.data === "object" ? node.data : {};
  return String(node?.nodeType || node?.type || nodeData.nodeType || nodeData.type || "").trim();
}

function isUnauthorizedVideoGenerationAction(action, graphStore, videoAuthorized) {
  if (videoAuthorized === true || !action || typeof action !== "object") {
    return false;
  }
  const actionType = String(action.type || "").trim();
  if (actionType !== "queue_generation_task" && actionType !== "run_prompt_preset_generation") {
    return false;
  }
  return generationActionNodeType(action, graphStore) === "ai-video";
}

function isInteractionConfirmationAction(action) {
  if (!action || typeof action !== "object") {
    return false;
  }
  const type = safeTrim(action.type).toLowerCase();
  return type === "create_node" || type === "add_node" || type === "generate_node" || type === "queue_node_generation";
}

function requiresLegacyStrongConfirmation(actions) {
  const actionable = cloneActions(actions).filter((action) => !isInteractionConfirmationAction(action));
  if (!actionable.length) {
    return false;
  }
  return buildAssistantActionPreviewModel(actionable).requiresStrongConfirmation;
}

function contextWithAssistantReferences(context, references, attachments) {
  const base = context && typeof context === "object" ? { ...context } : {};
  const safe = buildAssistantCanvasContext({ references, attachments });
  if (safe.references?.items?.length) {
    base.references = safe.references;
  }
  if (safe.attachments?.items?.length) {
    base.attachments = safe.attachments;
  }
  return base;
}

function validationFailureReceipt(response) {
  const details = [
    response?.error,
    response?.message,
    ...(Array.isArray(response?.errors) ? response.errors : []),
    ...(Array.isArray(response?.warnings) ? response.warnings : []),
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .join("; ");
  return `Action validation failed${details ? `: ${details}` : "."}`;
}

function buildAssistantError(error) {
  const payload = error?.response && typeof error.response === "object" ? error.response : {};
  const friendlyMessage =
    safeTrim(error?.friendlyMessage) ||
    safeTrim(payload.friendlyMessage) ||
    safeTrim(payload.reply) ||
    safeTrim(payload.message) ||
    safeTrim(error?.message) ||
    "Assistant request failed.";
  return {
    friendlyMessage,
    errorCode: safeTrim(error?.errorCode || payload.errorCode || payload.code || "assistant_request_failed"),
    traceId: safeTrim(error?.traceId || payload.traceId || error?.event?.traceId || ""),
    diagnostics: Array.isArray(error?.diagnostics)
      ? error.diagnostics.map(safeTrim).filter(Boolean)
      : Array.isArray(payload.diagnostics)
        ? payload.diagnostics.map(safeTrim).filter(Boolean)
        : Array.isArray(payload.warnings)
          ? payload.warnings.map(safeTrim).filter(Boolean)
          : [],
    retryable:
      error?.retryable !== undefined
        ? error.retryable !== false
        : payload.retryable !== undefined
          ? payload.retryable !== false
          : true,
  };
}

function buildTraceCopyPayload(lastError, lastWarnings) {
  const error = lastError && typeof lastError === "object" ? lastError : buildAssistantError(lastError);
  return {
    errorCode: safeTrim(error.errorCode),
    traceId: safeTrim(error.traceId),
    diagnostics: Array.isArray(error.diagnostics) ? error.diagnostics.map(safeTrim).filter(Boolean) : [],
    lastWarnings: Array.isArray(lastWarnings) ? lastWarnings.map(safeTrim).filter(Boolean) : [],
  };
}

function latestPendingActionsFromConversation(conversation) {
  const transaction = latestPendingTransactionFromConversation(conversation);
  if (transaction) {
    return cloneActions(transaction.actions);
  }
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message &&
      typeof message === "object" &&
      message.role !== "user" &&
      Array.isArray(message.actions) &&
      message.actions.length
    ) {
      return cloneActions(message.actions);
    }
  }
  return [];
}

function latestPendingTransactionFromConversation(conversation) {
  if (!conversation || typeof conversation !== "object") {
    return null;
  }
  const transactions = Array.isArray(conversation.transactions) ? conversation.transactions : [];
  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    const transaction = transactions[index];
    const status = String(transaction?.status || "proposed");
    if (
      transaction &&
      typeof transaction === "object" &&
      (status === "proposed" || status === "pending") &&
      Array.isArray(transaction.actions) &&
      transaction.actions.length
    ) {
      return transaction;
    }
  }
  return null;
}

function latestReceiptSummaryFromConversation(conversation) {
  const receipts = Array.isArray(conversation?.receipts) ? conversation.receipts : [];
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const summary = safeTrim(receipts[index]?.summary);
    if (summary) {
      return summary;
    }
  }
  const transactions = Array.isArray(conversation?.transactions) ? conversation.transactions : [];
  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    const receipt = transactions[index]?.receipt;
    const summary = safeTrim(receipt?.summary);
    if (summary) {
      return summary;
    }
  }
  return "";
}

function pendingExecutionControlClarificationFromMessages(messages = []) {
  if (!Array.isArray(messages) || !messages.length) {
    return null;
  }
  const latestMessage = messages[messages.length - 1];
  const cards = Array.isArray(latestMessage?.cards) ? latestMessage.cards : [];
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (card?.type !== "execution_control_clarification" || card?.status !== "needs_clarification") {
      continue;
    }
    const action = safeTrim(card.action || card.requestedAction);
    if (action !== "cancel" && action !== "pause" && action !== "resume") {
      continue;
    }
    return {
      action,
      all: Boolean(card.all),
      activeExecutionId: safeTrim(card.activeExecutionId),
      queueCount: Number(card.queueCount || 0) || 0,
    };
  }
  return null;
}

function latestContextFromConversation(conversation) {
  const snapshots = Array.isArray(conversation?.contextSnapshots) ? conversation.contextSnapshots : [];
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const context = snapshots[index]?.context;
    if (context && typeof context === "object") {
      return cloneAction(context);
    }
  }
  return undefined;
}

function buildConversationMemory(state) {
  const recentMessages = (Array.isArray(state.messages) ? state.messages : [])
    .slice(-12)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      content: safeTrim(message?.content).slice(0, 2000),
    }))
    .filter((message) => message.content);
  const pendingActions = cloneActions(state.pendingActions)
    .slice(0, 12)
    .map((action) => {
      const summary = {
        type: safeTrim(action.type),
      };
      for (const key of ["nodeId", "nodeType", "templateId"]) {
        const value = safeTrim(action[key]);
        if (value) {
          summary[key] = value;
        }
      }
      return summary;
    })
    .filter((action) => action.type);
  const memory = {};
  if (recentMessages.length) {
    memory.recentMessages = recentMessages;
  }
  if (pendingActions.length) {
    memory.pendingActions = pendingActions;
  }
  const mentionItems = buildAssistantMentionContext(state.mentionBindings).mentions?.items;
  if (Array.isArray(mentionItems) && mentionItems.length) {
    memory.mentions = { items: mentionItems };
  } else if (Array.isArray(state.lastContext?.mentions?.items) && state.lastContext.mentions.items.length) {
    memory.mentions = cloneAction(state.lastContext.mentions);
  }
  if (state.lastContext && typeof state.lastContext === "object") {
    const snapshot = {};
    if (state.lastContext.references) {
      snapshot.references = cloneAction(state.lastContext.references);
    }
    if (state.lastContext.attachments) {
      snapshot.attachments = cloneAction(state.lastContext.attachments);
    }
    if (state.lastContext.assistantIntent) {
      snapshot.assistantIntent = cloneAction(state.lastContext.assistantIntent);
    }
    if (Object.keys(snapshot).length) {
      memory.lastContextSnapshot = snapshot;
    }
  }
  return Object.keys(memory).length ? memory : null;
}

const MODEL_CONFIG_REQUIRED_MESSAGE = "\u8bf7\u5148\u5728\u8bbe\u7f6e\u91cc\u914d\u7f6e\u6587\u672c\u6a21\u578b\u540e\u518d\u53d1\u9001\u3002";
const MODEL_CONFIG_ENTRY_LABEL = "\u53bb\u8bbe\u7f6e\u6587\u672c\u6a21\u578b";
const AGENT_MODE_STORAGE_KEY = "huanying.canvasAgent.agentMode.v1";
const AGENT_MODES = new Set(["plan", "act"]);
const EXECUTION_TIMELINE_SCROLL_PAUSE_MS = 5000;
const EXECUTION_QUEUE_WARNING_THRESHOLD = 5;

function safeTrim(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function waitWithScheduler(scheduler, delayMs) {
  if (typeof scheduler === "function") {
    return new Promise((resolve) => scheduler(resolve, delayMs));
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function typeIntoAssistantMessage({
  message,
  text,
  onUpdate,
  signal,
  chunkSize = 1,
  delayMs = 12,
  scheduler,
} = {}) {
  if (!message || typeof message !== "object") {
    return message;
  }
  const reply = String(text || "");
  const size = Math.max(1, Number(chunkSize || 1));
  for (let index = 0; index < reply.length; index += size) {
    if (signal?.aborted) {
      break;
    }
    message.content = `${message.content || ""}${reply.slice(index, index + size)}`;
    onUpdate?.(message);
    if (delayMs > 0 && !signal?.aborted) {
      await waitWithScheduler(scheduler, delayMs);
    }
  }
  return message;
}

function normalizeAgentMode(mode) {
  const value = safeTrim(mode).toLowerCase();
  return AGENT_MODES.has(value) ? value : "plan";
}

function loadAgentModePreference(storage) {
  try {
    return normalizeAgentMode(storage?.getItem?.(AGENT_MODE_STORAGE_KEY));
  } catch {
    return "plan";
  }
}

function saveAgentModePreference(storage, mode) {
  const normalized = normalizeAgentMode(mode);
  try {
    storage?.setItem?.(AGENT_MODE_STORAGE_KEY, normalized);
  } catch {
    // Storage can be disabled; mode still works for this panel instance.
  }
  return normalized;
}

function normalizeAssistantModel(model) {
  if (!model || typeof model !== "object") {
    return null;
  }
  const explicitId = safeTrim(model.modelId || model.id);
  const provider = safeTrim(model.provider);
  const modelName = safeTrim(model.model);
  const displayName = safeTrim(model.displayName || model.label || model.name);
  const normalized = {};
  if (explicitId) {
    normalized.id = explicitId;
    normalized.modelId = explicitId;
  }
  if (provider) {
    normalized.provider = provider;
  }
  if (modelName) {
    normalized.model = modelName;
  }
  if (displayName) {
    normalized.displayName = displayName;
  }
  if (model.configured !== undefined) {
    normalized.configured = model.configured !== false;
  }
  if (model.disabledReason !== undefined) {
    normalized.disabledReason = safeTrim(model.disabledReason);
  }
  if (Array.isArray(model.capabilities)) {
    normalized.capabilities = model.capabilities.map(safeTrim).filter(Boolean);
  }
  if (model.supportsText !== undefined) {
    normalized.supportsText = Boolean(model.supportsText);
  }
  if (model.supportsImageInput !== undefined) {
    normalized.supportsImageInput = Boolean(model.supportsImageInput);
  }
  if (model.supportsImageGeneration !== undefined) {
    normalized.supportsImageGeneration = Boolean(model.supportsImageGeneration);
  }
  if (model.supportsVideoGeneration !== undefined) {
    normalized.supportsVideoGeneration = Boolean(model.supportsVideoGeneration);
  }
  if (model.supportsTools !== undefined) {
    normalized.supportsTools = Boolean(model.supportsTools);
  }
  if (model.maxReferenceImages !== undefined) {
    normalized.maxReferenceImages = Number(model.maxReferenceImages) || 0;
  }
  if (model.status !== undefined) {
    normalized.status = safeTrim(model.status).toLowerCase();
  }
  if (model.nodeType !== undefined) {
    normalized.nodeType = safeTrim(model.nodeType);
  }
  return normalized;
}

function normalizeModelOptions(options) {
  return Array.isArray(options) ? options.map(normalizeAssistantModel).filter(Boolean) : [];
}

function sanitizeDebugModel(model) {
  const normalized = normalizeAssistantModel(model);
  if (!normalized) {
    return null;
  }
  const {
    provider,
    modelId,
    id,
    model: modelName,
    displayName,
    configured,
    disabledReason,
    capabilities,
    supportsText,
    supportsImageInput,
    supportsImageGeneration,
    supportsVideoGeneration,
    supportsTools,
    maxReferenceImages,
    status,
    nodeType,
  } = normalized;
  return {
    provider,
    modelId,
    id,
    model: modelName,
    displayName,
    configured,
    disabledReason,
    capabilities,
    supportsText,
    supportsImageInput,
    supportsImageGeneration,
    supportsVideoGeneration,
    supportsTools,
    maxReferenceImages,
    status,
    nodeType,
  };
}

function assistantModelKey(model) {
  if (!model || typeof model !== "object") {
    return "";
  }
  return safeTrim(model.modelId || model.id || model.model || model.displayName);
}

function assistantModelMatches(model, value) {
  if (!model || value === undefined || value === null) {
    return false;
  }
  if (typeof value === "object") {
    const valueKey = assistantModelKey(value);
    return (
      (valueKey && assistantModelKey(model) === valueKey) ||
      (safeTrim(value.provider) === safeTrim(model.provider) &&
        safeTrim(value.model) === safeTrim(model.model))
    );
  }
  const key = safeTrim(value);
  return [
    model.modelId,
    model.id,
    model.model,
    model.displayName,
    `${model.provider}/${model.model}`,
  ]
    .map(safeTrim)
    .filter(Boolean)
    .includes(key);
}

function fallbackSelectedModel(options) {
  const normalizedOptions = filterSelectableTextModelOptions(normalizeModelOptions(options));
  return (
    normalizedOptions.find((model) => model.configured !== false) ||
    normalizedOptions[0] ||
    null
  );
}

function modelConfigGuardReason(state) {
  const selected = state?.selectedModel;
  if (selected && !isConfiguredTextModelOption(selected)) {
    const reason = safeTrim(selected.disabledReason);
    return `${MODEL_CONFIG_REQUIRED_MESSAGE}${reason ? ` ${reason}` : ""} ${MODEL_CONFIG_ENTRY_LABEL}`;
  }
  const options = filterSelectableTextModelOptions(Array.isArray(state?.modelOptions) ? state.modelOptions : []);
  if (state?.modelConfigRequired && !selected) {
    return `${MODEL_CONFIG_REQUIRED_MESSAGE} ${MODEL_CONFIG_ENTRY_LABEL}`;
  }
  if (!selected && options.length && !options.some((model) => model.configured !== false)) {
    return `${MODEL_CONFIG_REQUIRED_MESSAGE} ${MODEL_CONFIG_ENTRY_LABEL}`;
  }
  return "";
}

// Spatial-keyword lens: the full canvas-spatial projection is
// injected into agent context only when the user's message carries
// spatial intent; silent turns pay only the one-line ambient digest.
const SPATIAL_INTENT_PATTERN = /位置|摆放|放在|放到|挪|移动|移到|对齐|整理|排列|排布|布局|旁边|空位|空格|泳道|区域|画布.{0,6}(哪|空|满)|layout|tidy|arrange|align/i;

function hasSpatialIntent(message) {
  return SPATIAL_INTENT_PATTERN.test(String(message || ""));
}

function parseDirectorPlanCommand(message) {
  const match = String(message || "").match(/^\s*(?:导演|director)[:：]\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const remainder = match[1].trim();
  return remainder ? { message: remainder } : null;
}

// The front entry for the heavy brain: "刷新导演判断" re-runs the QMAI
// headless pipeline out of band (plan stays the fast zero-LLM compile).
function parseDirectorRefreshCommand(message) {
  return /^\s*(?:刷新导演(?:判断)?|导演刷新|director\s*refresh)\s*$/i.test(String(message || ""));
}

// "based on N-minutes-old judgment" line for director plan replies.
// Exported shape kept pure for tests.
export function formatDirectorJudgmentAge(artifactsGeneratedAt, nowMs = Date.now()) {
  const generated = Date.parse(String(artifactsGeneratedAt || ""));
  if (!Number.isFinite(generated)) return "";
  const minutes = Math.max(0, Math.round((nowMs - generated) / 60000));
  const age = minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes} 分钟前` : `${Math.round(minutes / 60)} 小时前`;
  const stale = minutes > 30 ? ",发送「刷新导演判断」可更新" : "";
  return `(基于 ${age} 的导演判断${stale})`;
}

function normalizeQueueControlText(value) {
  return safeTrim(value)
    .toLowerCase()
    .replace(/[\s,.;:!?，。！？、；：]+/g, "");
}

function parseLocalizedOrdinal(value) {
  const text = safeTrim(value);
  if (!text) {
    return 0;
  }
  if (/^\d+$/.test(text)) {
    return Math.max(0, Number(text) - 1);
  }
  const digits = {
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e24": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6,
    "\u4e03": 7,
    "\u516b": 8,
    "\u4e5d": 9,
    "\u5341": 10,
  };
  if (digits[text]) {
    return digits[text] - 1;
  }
  const tenIndex = text.indexOf("\u5341");
  if (tenIndex >= 0) {
    const tensText = text.slice(0, tenIndex);
    const onesText = text.slice(tenIndex + 1);
    const tens = tensText ? digits[tensText] || 0 : 1;
    const ones = onesText ? digits[onesText] || 0 : 0;
    const number = tens * 10 + ones;
    return Math.max(0, number - 1);
  }
  return 0;
}

function parseQueueControlAction(text) {
  if (/\u53d6\u6d88|\u5220\u6389|\u5220\u9664|\u79fb\u9664|cancel|remove/.test(text)) {
    return "cancel";
  }
  if (/\u91cd\u6392|\u91cd\u65b0\u6392|\u91cd\u65b0\u6392\u5e8f|\u6392\u5e8f|\u987a\u5e8f|\u4ea4\u6362|\u4e92\u6362|\u5bf9\u8c03|\u6362\u4e00\u4e0b|\u6362\u4e2a\u4f4d\u7f6e|reorder|swap/.test(text)) {
    return "reorder";
  }
  if (/\u7f6e\u9876|\u4f18\u5148|\u63d0\u524d|\u6700\u524d|top|priority/.test(text)) {
    return "top";
  }
  if (/\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder/.test(text)) {
    return "move";
  }
  if (/\u7ee7\u7eed|\u6062\u590d|resume/.test(text)) {
    return "resume";
  }
  if (/\u6682\u505c|pause/.test(text)) {
    return "pause";
  }
  return "";
}

function queueControlOrdinalMatches(text) {
  const matches = [];
  for (const match of text.matchAll(/\u7b2c(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)(?:\u4e2a|\u9879|\u6761|\u4f4d|\u4e2a\u4efb\u52a1|\u9879\u4efb\u52a1)?/g)) {
    matches.push({
      index: parseLocalizedOrdinal(match[1]),
      offset: match.index || 0,
    });
  }
  return matches;
}

function queueControlOrderIndexes(rawText, queueLength) {
  if (queueLength <= 0) {
    return [];
  }
  const indexes = [];
  const text = safeTrim(rawText).toLowerCase();
  for (const match of text.matchAll(/(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)/g)) {
    const index = parseLocalizedOrdinal(match[1]);
    if (index < 0 || index >= queueLength || indexes.includes(index)) {
      continue;
    }
    indexes.push(index);
  }
  return indexes;
}

function hasQueueControlHint(text) {
  return /\u6392\u961f|\u961f\u5217|\u7b2c|\u4e0b\u4e00|\u4e0a\u4e00|\u6700\u540e|\u6682\u505c\u7684\u4efb\u52a1|\u987a\u5e8f|\u91cd\u6392|queue|queued|reorder/.test(text);
}

function queueControlTargetIndex(text, queueLength) {
  if (queueLength <= 0) {
    return -1;
  }
  const ordinal = text.match(/\u7b2c(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)(?:\u4e2a|\u9879|\u6761|\u4e2a\u4efb\u52a1|\u9879\u4efb\u52a1)?/);
  if (ordinal) {
    return Math.min(queueLength - 1, parseLocalizedOrdinal(ordinal[1]));
  }
  if (/\u6700\u540e|\u672b\u5c3e|\u4e0a\u4e00|last/.test(text)) {
    return queueLength - 1;
  }
  if (/\u4e0b\u4e00|\u7b2c\u4e00|first|next/.test(text)) {
    return 0;
  }
  return 0;
}

function queueControlExecutionTitle(execution = {}) {
  return safeTrim(execution.title || execution.drawerState?.line1 || execution.id);
}

function queueControlExecutionReferenceCandidates(execution = {}) {
  const values = [
    execution.title,
    execution.drawerState?.line1,
    execution.drawerState?.title,
    execution.plan?.title,
    execution.intent?.title,
  ];
  const candidates = [];
  for (const value of values) {
    const candidate = normalizeQueueControlText(value);
    if (candidate.length < 2 || candidates.includes(candidate)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

function queueControlMoveSourceReferenceText(text) {
  const match = safeTrim(text).match(
    /^(.*?)(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder)/
  );
  let source = match ? safeTrim(match[1]) : "";
  source = source.replace(
    /^(?:\u8bf7|\u5e2e\u6211|\u9ebb\u70e6|\u628a|\u5c06|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9|\u90a3)+/g,
    ""
  );
  source = source.replace(/(?:\u6392\u961f\u4efb\u52a1|\u961f\u5217\u4efb\u52a1|\u4efb\u52a1)$/g, "");
  return source.length >= 2 ? source : "";
}

function queueControlTitleReferenceMatch(text, queue) {
  if (!Array.isArray(queue) || !queue.length) {
    return { index: -1, candidates: [] };
  }
  const normalizedText = safeTrim(text);
  const sourceHint = queueControlMoveSourceReferenceText(normalizedText);
  const scores = new Map();
  queue.forEach((execution, index) => {
    let bestScore = 0;
    for (const candidate of queueControlExecutionReferenceCandidates(execution)) {
      if (normalizedText.includes(candidate)) {
        bestScore = Math.max(bestScore, 1000 + candidate.length);
      }
      if (sourceHint && sourceHint.includes(candidate)) {
        bestScore = Math.max(bestScore, 700 + candidate.length);
      }
      if (sourceHint && candidate.includes(sourceHint)) {
        bestScore = Math.max(bestScore, 500 + sourceHint.length);
      }
    }
    if (bestScore > 0) {
      scores.set(index, bestScore);
    }
  });
  const ranked = Array.from(scores, ([index, score]) => ({ index, score })).sort(
    (a, b) => b.score - a.score
  );
  if (!ranked.length) {
    return { index: -1, candidates: [] };
  }
  const bestScore = ranked[0].score;
  const bestMatches = ranked.filter((item) => item.score === bestScore);
  const candidates = bestMatches.map((item) => ({
    id: safeTrim(queue[item.index]?.id),
    title: queueControlExecutionTitle(queue[item.index]),
    index: item.index,
  })).filter((item) => item.id);
  if (bestMatches.length > 1) {
    return { index: -1, ambiguous: true, candidates };
  }
  return { index: ranked[0].index, candidates };
}

function queueControlTitleReferenceIndex(text, queue) {
  return queueControlTitleReferenceMatch(text, queue).index;
}

function queueControlTitleReferenceClarificationReply(candidates = []) {
  const labels = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.title || candidate.id}`)
    .filter(Boolean);
  const suffix = labels.length ? `\n${labels.join("\n")}` : "";
  return `找到多个可能的排队任务，请先确认要移动哪一个。${suffix}`;
}

function queueControlExecutionActions(execution = {}) {
  const actionsByStep = isPlainObject(execution?.actionsByStep) ? execution.actionsByStep : {};
  const steps = Array.isArray(execution?.plan?.steps) ? execution.plan.steps : [];
  const stepOrder = steps.length ? steps.map((step) => safeTrim(step?.id)).filter(Boolean) : Object.keys(actionsByStep);
  const actions = [];
  stepOrder.forEach((stepId) => {
    cloneActions(actionsByStep[stepId]).forEach((action) => actions.push(action));
  });
  return actions;
}

function queueControlGenerationKindsFromText(text) {
  const kinds = new Set();
  if (/\u56fe\u7247|\u56fe\u50cf|\u56fe\u7247\u751f\u6210|\u751f\u56fe|image/.test(text)) {
    kinds.add("image");
  }
  if (/\u89c6\u9891|\u5f71\u7247|\u77ed\u7247|video/.test(text)) {
    kinds.add("video");
  }
  if (/\u6587\u672c|\u6587\u5b57|\u6587\u6848|\u5927\u7eb2|text/.test(text)) {
    kinds.add("text");
  }
  return kinds;
}

function queueControlGenerationKindFromValue(value) {
  const text = normalizeQueueControlText(value);
  if (!text) {
    return "";
  }
  if (/(?:ai)?image|\u56fe\u7247|\u56fe\u50cf/.test(text)) {
    return "image";
  }
  if (/(?:ai)?video|\u89c6\u9891/.test(text)) {
    return "video";
  }
  if (/(?:ai)?text|\u6587\u672c|\u6587\u5b57|\u6587\u6848/.test(text)) {
    return "text";
  }
  return "";
}

function queueControlExecutionGenerationKinds(execution = {}) {
  const kinds = new Set();
  for (const action of queueControlExecutionActions(execution)) {
    const data = action?.data && typeof action.data === "object" ? action.data : {};
    [
      action?.nodeType,
      action?.type,
      action?.skillId,
      action?.tool,
      action?.kind,
      data.nodeType,
      data.type,
    ].forEach((value) => {
      const kind = queueControlGenerationKindFromValue(value);
      if (kind) {
        kinds.add(kind);
      }
    });
  }
  return kinds;
}

function queueControlContentReferenceHint(text) {
  let hint = normalizeQueueControlText(queueControlMoveSourceReferenceText(text));
  if (!hint) {
    return "";
  }
  hint = hint.replace(
    /\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u4e9b|\u90a3\u4e9b|\u8fd9|\u90a3|\u7684|\u6392\u961f|\u961f\u5217|\u4efb\u52a1|\u64cd\u4f5c|\u6267\u884c|\u751f\u6210/g,
    ""
  );
  return hint.length >= 2 ? hint : "";
}

function queueControlExecutionContentCandidates(execution = {}) {
  const values = [];
  for (const action of queueControlExecutionActions(execution)) {
    const data = action?.data && typeof action.data === "object" ? action.data : {};
    const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
    const params = action?.params && typeof action.params === "object" ? action.params : {};
    values.push(
      action?.prompt,
      action?.text,
      action?.content,
      action?.description,
      action?.summary,
      data.prompt,
      data.text,
      data.content,
      data.description,
      data.summary,
      payload.prompt,
      payload.text,
      payload.content,
      payload.description,
      params.prompt,
      params.text,
      params.content,
      params.description
    );
  }
  return values
    .map(normalizeQueueControlText)
    .filter((value, index, list) => value.length >= 2 && list.indexOf(value) === index);
}

function queueControlAssetCandidateValues(source = {}) {
  if (!isPlainObject(source)) {
    return [];
  }
  const values = [
    source.assetId,
    source.assetName,
    source.assetTitle,
    source.assetLabel,
    source.assetKey,
    source.assetItemId,
    source.assetItemName,
    source.assetItemTitle,
    source.assetItemLabel,
  ];
  const nestedObjects = [source.asset, source.assetItem, source.referenceAsset].filter(isPlainObject);
  nestedObjects.forEach((item) => {
    values.push(item.id, item.name, item.title, item.label, item.assetId, item.assetName, item.assetTitle);
  });
  ["assets", "assetItems", "assetReferences", "references", "referenceAssets"].forEach((key) => {
    if (!Array.isArray(source[key])) {
      return;
    }
    source[key].filter(isPlainObject).forEach((item) => {
      values.push(item.id, item.name, item.title, item.label, item.assetId, item.assetName, item.assetTitle);
    });
  });
  return values;
}

function queueControlExecutionAssetCandidates(execution = {}) {
  const values = [];
  for (const action of queueControlExecutionActions(execution)) {
    const data = action?.data && typeof action.data === "object" ? action.data : {};
    const payload = action?.payload && typeof action.payload === "object" ? action.payload : {};
    const params = action?.params && typeof action.params === "object" ? action.params : {};
    values.push(
      ...queueControlAssetCandidateValues(action),
      ...queueControlAssetCandidateValues(data),
      ...queueControlAssetCandidateValues(payload),
      ...queueControlAssetCandidateValues(params)
    );
  }
  return values
    .map(normalizeQueueControlText)
    .filter((value, index, list) => value.length >= 2 && list.indexOf(value) === index);
}

function queueControlAssetReferenceMatch(text, queue) {
  if (!Array.isArray(queue) || !queue.length) {
    return { index: -1, candidates: [] };
  }
  const hint = queueControlContentReferenceHint(text);
  if (!hint) {
    return { index: -1, candidates: [] };
  }
  const matches = [];
  queue.forEach((execution, index) => {
    const matched = queueControlExecutionAssetCandidates(execution).some(
      (candidate) => candidate.includes(hint) || hint.includes(candidate)
    );
    if (!matched) {
      return;
    }
    matches.push({
      id: safeTrim(execution?.id),
      title: queueControlExecutionTitle(execution),
      index,
    });
  });
  const candidates = matches.filter((item) => item.id);
  if (candidates.length > 1) {
    return { index: -1, ambiguous: true, candidates };
  }
  if (candidates.length === 1) {
    return { index: candidates[0].index, candidates };
  }
  return { index: -1, candidates: [] };
}

function queueControlContentReferenceMatch(text, queue) {
  if (!Array.isArray(queue) || !queue.length) {
    return { index: -1, candidates: [] };
  }
  const hint = queueControlContentReferenceHint(text);
  if (!hint) {
    return { index: -1, candidates: [] };
  }
  const matches = [];
  queue.forEach((execution, index) => {
    const matched = queueControlExecutionContentCandidates(execution).some(
      (candidate) => candidate.includes(hint) || hint.includes(candidate)
    );
    if (!matched) {
      return;
    }
    matches.push({
      id: safeTrim(execution?.id),
      title: queueControlExecutionTitle(execution),
      index,
    });
  });
  const candidates = matches.filter((item) => item.id);
  if (candidates.length > 1) {
    return { index: -1, ambiguous: true, candidates };
  }
  if (candidates.length === 1) {
    return { index: candidates[0].index, candidates };
  }
  return { index: -1, candidates: [] };
}

function queueControlSemanticReferenceMatch(text, queue) {
  if (!Array.isArray(queue) || !queue.length) {
    return { index: -1, candidates: [] };
  }
  const requestedKinds = queueControlGenerationKindsFromText(text);
  if (!requestedKinds.size) {
    const assetMatch = queueControlAssetReferenceMatch(text, queue);
    return assetMatch.index >= 0 || assetMatch.ambiguous
      ? assetMatch
      : queueControlContentReferenceMatch(text, queue);
  }
  const matches = [];
  queue.forEach((execution, index) => {
    const executionKinds = queueControlExecutionGenerationKinds(execution);
    const matched = [...requestedKinds].some((kind) => executionKinds.has(kind));
    if (!matched) {
      return;
    }
    matches.push({
      id: safeTrim(execution?.id),
      title: queueControlExecutionTitle(execution),
      index,
    });
  });
  const candidates = matches.filter((item) => item.id);
  if (candidates.length > 1) {
    return { index: -1, ambiguous: true, candidates };
  }
  if (candidates.length === 1) {
    return { index: candidates[0].index, candidates };
  }
  const assetMatch = queueControlAssetReferenceMatch(text, queue);
  return assetMatch.index >= 0 || assetMatch.ambiguous
    ? assetMatch
    : queueControlContentReferenceMatch(text, queue);
}

function normalizeQueueTitleClarificationCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => {
      const relation = safeTrim(candidate?.relation);
      return {
        id: safeTrim(candidate?.id),
        title: safeTrim(candidate?.title || candidate?.id),
        index: Number.isFinite(Number(candidate?.index)) ? Number(candidate.index) : index,
        relation: relation === "previous" || relation === "next" ? relation : "",
      };
    })
    .filter((candidate) => candidate.id);
}

function queueTitleClarificationRelationAnswer(text) {
  const value = normalizeQueueControlText(text);
  if (/^(?:选|选择)?(?:它|刚才那个|刚才的)?(?:前面|前边|前一个|上一个|previous|prev|before)(?:的)?(?:那个|那一个|一个|任务|排队任务)?$/.test(value)) {
    return "previous";
  }
  if (/^(?:选|选择)?(?:它|刚才那个|刚才的)?(?:后面|后边|后一个|下一个|next|after)(?:的)?(?:那个|那一个|一个|任务|排队任务)?$/.test(value)) {
    return "next";
  }
  return "";
}

function queueTitleClarificationCard(command = {}) {
  const candidates = normalizeQueueTitleClarificationCandidates(command.candidates);
  return {
    id: `queue_title_clarify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: "queue_title_clarification",
    status: "needs_clarification",
    title: "\u9009\u62e9\u8981\u79fb\u52a8\u7684\u6392\u961f\u4efb\u52a1",
    summary: "\u627e\u5230\u591a\u4e2a\u53ef\u80fd\u7684\u6392\u961f\u4efb\u52a1\uff0c\u8bf7\u9009\u62e9\u4e00\u4e2a\u3002",
    action: "move",
    requestedAction: safeTrim(command.requestedAction) || "move",
    targetIndex: Math.max(0, Number(command.targetIndex) || 0),
    candidates,
  };
}

function pendingQueueTitleClarificationFromMessages(messages = []) {
  if (!Array.isArray(messages) || !messages.length) {
    return null;
  }
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const cards = Array.isArray(messages[messageIndex]?.cards) ? messages[messageIndex].cards : [];
    for (let index = cards.length - 1; index >= 0; index -= 1) {
      const card = cards[index];
      if (card?.type !== "queue_title_clarification" || card?.status !== "needs_clarification") {
        continue;
      }
      const candidates = normalizeQueueTitleClarificationCandidates(card.candidates);
      if (!candidates.length) {
        continue;
      }
      return {
        action: safeTrim(card.action || card.requestedAction) || "move",
        requestedAction: safeTrim(card.requestedAction || card.action) || "move",
        targetIndex: Math.max(0, Number(card.targetIndex) || 0),
        candidates,
      };
    }
  }
  return null;
}

function queueControlReferencesFromMessages(messages = []) {
  const references = [];
  const pushReference = (executionId, title = "") => {
    const id = safeTrim(executionId);
    if (!id) {
      return;
    }
    const next = {
      executionId: id,
      title: safeTrim(title),
    };
    const existingIndex = references.findIndex((item) => safeTrim(item?.executionId) === id);
    if (existingIndex >= 0) {
      references.splice(existingIndex, 1);
    }
    references.push(next);
    if (references.length > 4) {
      references.splice(0, references.length - 4);
    }
  };
  for (const message of Array.isArray(messages) ? messages : []) {
    const details =
      message?.queueControl && typeof message.queueControl === "object"
        ? message.queueControl
        : null;
    if (!details) {
      continue;
    }
    const action = safeTrim(details.action);
    if (action === "cancel" || action === "cancel_all") {
      references.length = 0;
      continue;
    }
    if (Array.isArray(details.executionIds) && details.executionIds.length) {
      for (const executionId of details.executionIds) {
        pushReference(executionId);
      }
    }
    pushReference(details.executionId, details.title);
  }
  return references;
}

function queueControlReferenceFromMessages(messages = []) {
  const references = queueControlReferencesFromMessages(messages);
  const reference = references[references.length - 1] || null;
  if (!reference) {
    return null;
  }
  return {
    ...reference,
    recentExecutionIds: references
      .map((item) => safeTrim(item?.executionId))
      .filter(Boolean),
  };
}

function parsePendingQueueTitleClarification(message, clarification = null) {
  if (!clarification || typeof clarification !== "object") {
    return null;
  }
  const action = safeTrim(clarification.requestedAction || clarification.action);
  if (action !== "move") {
    return null;
  }
  const candidates = normalizeQueueTitleClarificationCandidates(clarification.candidates);
  if (!candidates.length) {
    return null;
  }
  const raw = safeTrim(message);
  const text = normalizeQueueControlText(raw);
  if (!text) {
    return null;
  }
  let selected = candidates.find((candidate) => safeTrim(candidate.id) === raw);
  if (!selected) {
    const ordinal = text.match(/^(?:\u9009|\u9009\u62e9)?(?:\u7b2c)?(\d+|[\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)(?:\u4e2a|\u9879|\u6761|\u4f4d|\u53f7)?$/);
    if (ordinal) {
      const index = parseLocalizedOrdinal(ordinal[1]);
      selected = index >= 0 && index < candidates.length ? candidates[index] : null;
    }
  }
  if (!selected) {
    const relation = queueTitleClarificationRelationAnswer(text);
    if (relation) {
      const relationCandidates = candidates.filter((candidate) => candidate.relation === relation);
      selected = relationCandidates.length === 1 ? relationCandidates[0] : null;
    }
  }
  if (!selected) {
    selected =
      candidates.find((candidate) => normalizeQueueControlText(candidate.title) === text) ||
      candidates.find((candidate) => {
        const title = normalizeQueueControlText(candidate.title);
        return title && (text.includes(title) || title.includes(text));
      });
  }
  if (!selected) {
    return null;
  }
  return {
    action,
    executionId: selected.id,
    selectedCandidate: selected,
    targetIndex: Math.max(0, Number(clarification.targetIndex) || 0),
    text,
  };
}

function clarifiedQueueTitleControlCommand(clarification = {}, executionStore) {
  const snapshot = typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : {};
  const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  const executionId = safeTrim(clarification.executionId || clarification.selectedCandidate?.id);
  const execution = queue.find((item) => safeTrim(item?.id) === executionId) || null;
  return {
    action: "move",
    execution,
    targetIndex: Math.max(0, Number(clarification.targetIndex) || 0),
    queue,
    text: clarification.text || "",
  };
}

function queueControlReply(action, execution) {
  const title = queueControlExecutionTitle(execution);
  const suffix = title ? `\uff1a${title}` : "";
  if (action === "move") {
    const targetIndex = Number(execution?.queueIndex || 0) || 0;
    const targetText = targetIndex > 0 ? `\u5230\u7b2c ${targetIndex} \u4f4d` : "";
    return `\u5df2\u8c03\u6574\u6392\u961f\u4efb\u52a1\u987a\u5e8f${suffix}${targetText ? `\uff0c${targetText}` : ""}`;
  }
  const prefixes = {
    cancel: "\u5df2\u53d6\u6d88\u6392\u961f\u4efb\u52a1",
    top: "\u5df2\u7f6e\u9876\u6392\u961f\u4efb\u52a1",
    pause: "\u5df2\u6682\u505c\u6392\u961f\u4efb\u52a1",
    resume: "\u5df2\u7ee7\u7eed\u6392\u961f\u4efb\u52a1",
  };
  return `${prefixes[action] || "\u5df2\u5904\u7406\u6392\u961f\u4efb\u52a1"}${suffix}`;
}

function parseQueueTitleMoveCommand(text, queue) {
  if (!/\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder/.test(text)) {
    return null;
  }
  if (!Array.isArray(queue) || !queue.length) {
    return null;
  }
  const ordinals = queueControlOrdinalMatches(text);
  const hasTargetHint = ordinals.length > 0 || /\u6700\u540e|\u672b\u5c3e|\u6700\u524d|last|first/.test(text);
  if (!hasTargetHint) {
    return null;
  }
  const referenceMatch = queueControlTitleReferenceMatch(text, queue);
  if (referenceMatch.ambiguous) {
    return {
      action: "clarify",
      requestedAction: "move",
      status: "needs_clarification",
      candidates: referenceMatch.candidates,
      targetIndex: ordinals.length
        ? Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index))
        : queueControlTargetIndex(text, queue.length),
      queue,
      text,
    };
  }
  const semanticMatch = referenceMatch.index < 0 ? queueControlSemanticReferenceMatch(text, queue) : null;
  if (semanticMatch?.ambiguous) {
    return {
      action: "clarify",
      requestedAction: "move",
      status: "needs_clarification",
      candidates: semanticMatch.candidates,
      targetIndex: ordinals.length
        ? Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index))
        : queueControlTargetIndex(text, queue.length),
      queue,
      text,
    };
  }
  const sourceIndex = referenceMatch.index >= 0 ? referenceMatch.index : semanticMatch?.index ?? -1;
  if (sourceIndex < 0) {
    return null;
  }
  const targetIndex = ordinals.length
    ? Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index))
    : queueControlTargetIndex(text, queue.length);
  if (targetIndex < 0) {
    return null;
  }
  return {
    action: "move",
    execution: queue[sourceIndex] || null,
    sourceIndex,
    targetIndex,
    queue,
    text,
  };
}

function hasQueueControlRecentReference(text) {
  return /\u5b83|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u9879|\u90a3\u9879|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u521a\u624d\u90a3\u4e2a|\u521a\u624d\u7684|\u521a\u521a\u90a3\u4e2a|\u521a\u521a\u7684|it|that|same/.test(
    text
  );
}

function queueControlRecentReferenceRemainder(text) {
  const match = safeTrim(text).match(
    /^(.*?)(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder)/
  );
  let source = normalizeQueueControlText(match ? match[1] : "");
  source = source.replace(/^(?:\u8bf7|\u5e2e\u6211|\u9ebb\u70e6|\u628a|\u5c06)+/g, "");
  source = source.replace(
    /\u521a\u624d\u90a3\u4e2a|\u521a\u624d\u7684|\u521a\u521a\u90a3\u4e2a|\u521a\u521a\u7684|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u9879|\u90a3\u9879|\u5b83|it|that|same/g,
    ""
  );
  source = source.replace(/\u6392\u961f\u4efb\u52a1|\u961f\u5217\u4efb\u52a1|\u4efb\u52a1/g, "");
  return source;
}

function queueControlRecentNeighborOffset(text) {
  const match = safeTrim(text).match(
    /^(.*?)(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder)/
  );
  let source = normalizeQueueControlText(match ? match[1] : "");
  if (!hasQueueControlRecentReference(source)) {
    return 0;
  }
  source = source.replace(/^(?:\u8bf7|\u5e2e\u6211|\u9ebb\u70e6|\u628a|\u5c06)+/g, "");
  source = source.replace(
    /\u521a\u624d\u90a3\u4e2a|\u521a\u624d\u7684|\u521a\u521a\u90a3\u4e2a|\u521a\u521a\u7684|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u9879|\u90a3\u9879|\u5b83|it|that|same/g,
    ""
  );
  source = source.replace(/\u6392\u961f\u4efb\u52a1|\u961f\u5217\u4efb\u52a1|\u4efb\u52a1|\u7684|\u4e2a|\u9879|\u6761/g, "");
  if (/^(?:\u524d\u9762|\u524d\u4e00|\u4e0a\u4e00|previous|prev|before)$/.test(source)) {
    return -1;
  }
  if (/^(?:\u540e\u9762|\u540e\u4e00|\u4e0b\u4e00|next|after)$/.test(source)) {
    return 1;
  }
  return 0;
}

function queueControlRecentAmbiguousNeighborSource(text) {
  const match = safeTrim(text).match(
    /^(.*?)(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder)/
  );
  let source = normalizeQueueControlText(match ? match[1] : "");
  if (!hasQueueControlRecentReference(source)) {
    return false;
  }
  source = source.replace(/^(?:\u8bf7|\u5e2e\u6211|\u9ebb\u70e6|\u628a|\u5c06)+/g, "");
  source = source.replace(
    /\u521a\u624d\u90a3\u4e2a|\u521a\u624d\u7684|\u521a\u521a\u90a3\u4e2a|\u521a\u521a\u7684|\u8fd9\u4e2a\u4efb\u52a1|\u90a3\u4e2a\u4efb\u52a1|\u8fd9\u4e2a|\u90a3\u4e2a|\u8fd9\u9879|\u90a3\u9879|\u5b83|it|that|same/g,
    ""
  );
  source = source.replace(/\u6392\u961f\u4efb\u52a1|\u961f\u5217\u4efb\u52a1|\u4efb\u52a1|\u7684|\u4e2a|\u9879|\u6761/g, "");
  return /^(?:\u65c1\u8fb9|\u9644\u8fd1|nearby|neighbor)$/.test(source);
}

function queueControlRecentNeighborCandidates(queue, sourceIndex) {
  if (!Array.isArray(queue) || sourceIndex < 0 || sourceIndex >= queue.length) {
    return [];
  }
  return [sourceIndex - 1, sourceIndex + 1]
    .filter((index) => index >= 0 && index < queue.length)
    .map((index) => ({
      id: safeTrim(queue[index]?.id),
      title: queueControlExecutionTitle(queue[index]),
      index,
      relation: index < sourceIndex ? "previous" : "next",
    }))
    .filter((candidate) => candidate.id);
}

function queueControlRecentReferenceIds(recentReference = {}) {
  const ids = [];
  const pushId = (value) => {
    const id = safeTrim(value);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  };
  for (const id of Array.isArray(recentReference?.recentExecutionIds) ? recentReference.recentExecutionIds : []) {
    pushId(id);
  }
  pushId(recentReference?.executionId || recentReference?.id);
  return ids;
}

function queueControlRecentMultiReferenceCount(text) {
  const match = safeTrim(text).match(
    /^(.*?)(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|\u7f6e\u9876|\u63d0\u524d|\u6700\u524d|move|reorder|top|priority)/
  );
  let source = normalizeQueueControlText(match ? match[1] : "");
  source = source.replace(/^(?:\u8bf7|\u5e2e\u6211|\u9ebb\u70e6|\u628a|\u5c06)+/g, "");
  source = source.replace(/\u6392\u961f\u4efb\u52a1|\u961f\u5217\u4efb\u52a1|\u4efb\u52a1|\u7684/g, "");
  if (/^(?:\u521a\u624d|\u521a\u521a|\u4e0a\u9762|\u524d\u9762)?(?:\u90a3\u4e24\u4e2a|\u8fd9\u4e24\u4e2a|\u4e24\u4e2a|\u90a3\u4e24\u9879|\u8fd9\u4e24\u9879|\u4e24\u9879|\u90a3\u4e24\u6761|\u8fd9\u4e24\u6761|\u4e24\u6761|\u90a3\u4fe9|\u8fd9\u4fe9|\u4fe9|both|thosetwo|thesetwo)$/.test(source)) {
    return 2;
  }
  if (/^(?:\u521a\u624d|\u521a\u521a|\u4e0a\u9762|\u524d\u9762)?(?:\u90a3\u4e09\u4e2a|\u8fd9\u4e09\u4e2a|\u4e09\u4e2a|\u90a3\u4e09\u9879|\u8fd9\u4e09\u9879|\u4e09\u9879|\u90a3\u4e09\u6761|\u8fd9\u4e09\u6761|\u4e09\u6761|\u4e09\u4e2a\u4efb\u52a1|three|threerecent)$/.test(source)) {
    return 3;
  }
  if (/^(?:\u521a\u624d|\u521a\u521a|\u4e0a\u9762|\u524d\u9762)?(?:\u90a3\u56db\u4e2a|\u8fd9\u56db\u4e2a|\u56db\u4e2a|\u90a3\u56db\u9879|\u8fd9\u56db\u9879|\u56db\u9879|\u90a3\u56db\u6761|\u8fd9\u56db\u6761|\u56db\u6761|\u56db\u4e2a\u4efb\u52a1|four|fourrecent)$/.test(source)) {
    return 4;
  }
  if (/^(?:刚才|刚刚|上面|前面)?(?:那几个|这几个|几个|那几项|这几项|那一组|这一组|那组|这组|那些|这些|those|them)$/.test(source)) {
    return -1;
  }
  return 0;
}

function queueControlRecentMultiReferenceSource(text) {
  const count = queueControlRecentMultiReferenceCount(text);
  return count >= 2 || count === -1;
}

function queueControlMoveGroupOrderedIds(queue, groupIds, targetIndex) {
  const currentIds = (Array.isArray(queue) ? queue : []).map((item) => safeTrim(item?.id)).filter(Boolean);
  const groupSet = new Set((Array.isArray(groupIds) ? groupIds : []).map(safeTrim).filter(Boolean));
  const groupInCurrentOrder = currentIds.filter((id) => groupSet.has(id));
  if (currentIds.length < 2 || groupInCurrentOrder.length < 2) {
    return { orderedIds: [], groupIds: [] };
  }
  const remainingIds = currentIds.filter((id) => !groupSet.has(id));
  const normalizedTarget = Math.max(0, Number(targetIndex) || 0);
  const insertIndex =
    normalizedTarget >= currentIds.length - 1
      ? remainingIds.length
      : Math.min(remainingIds.length, normalizedTarget);
  const orderedIds = [
    ...remainingIds.slice(0, insertIndex),
    ...groupInCurrentOrder,
    ...remainingIds.slice(insertIndex),
  ];
  return { orderedIds, groupIds: groupInCurrentOrder };
}

function parseQueueRecentMultiReferenceMoveCommand(text, queue, recentReference = null, targetIndexOverride = null) {
  const referenceCount = queueControlRecentMultiReferenceCount(text);
  const allRecent = referenceCount === -1;
  if (!allRecent && referenceCount < 2) {
    return null;
  }
  if (!Array.isArray(queue) || queue.length < 2) {
    return null;
  }
  const allRecentIds = queueControlRecentReferenceIds(recentReference);
  const recentIds = allRecent ? allRecentIds : allRecentIds.slice(-referenceCount);
  const requiredGroupSize = allRecent ? 2 : referenceCount;
  if (recentIds.length < requiredGroupSize) {
    return null;
  }
  const hasTargetIndexOverride = targetIndexOverride !== null && targetIndexOverride !== undefined;
  const targetIndex = hasTargetIndexOverride && Number.isFinite(Number(targetIndexOverride))
    ? Math.max(0, Number(targetIndexOverride))
    : queueControlTargetIndex(text, queue.length);
  if (targetIndex < 0) {
    return null;
  }
  const { orderedIds, groupIds } = queueControlMoveGroupOrderedIds(queue, recentIds, targetIndex);
  if (orderedIds.length !== queue.length || groupIds.length < requiredGroupSize) {
    return null;
  }
  return {
    action: "reorder",
    orderedIds,
    queue,
    text,
    referenceSource: "recent_queue_multi",
    referenceExecutionIds: groupIds,
  };
}

function parseQueueRecentReferenceMoveCommand(text, queue, recentReference = null) {
  if (!hasQueueControlRecentReference(text)) {
    return null;
  }
  if (!Array.isArray(queue) || !queue.length) {
    return null;
  }
  const recentId = safeTrim(recentReference?.executionId || recentReference?.id);
  if (!recentId) {
    return null;
  }
  const sourceIndex = queue.findIndex((execution) => safeTrim(execution?.id) === recentId);
  if (sourceIndex < 0) {
    return null;
  }
  if (queueControlRecentAmbiguousNeighborSource(text)) {
    const targetIndex = queueControlTargetIndex(text, queue.length);
    if (targetIndex < 0) {
      return null;
    }
    const candidates = queueControlRecentNeighborCandidates(queue, sourceIndex);
    if (candidates.length > 1) {
      return {
        action: "clarify",
        requestedAction: "move",
        status: "needs_clarification",
        candidates,
        targetIndex,
        queue,
        text,
        referenceSource: "recent_queue_neighbor_ambiguous",
      };
    }
    if (candidates.length === 1) {
      const neighborIndex = candidates[0].index;
      return {
        action: "move",
        execution: queue[neighborIndex] || null,
        sourceIndex: neighborIndex,
        targetIndex,
        queue,
        text,
        referenceSource: "recent_queue_neighbor",
      };
    }
    return null;
  }
  const neighborOffset = queueControlRecentNeighborOffset(text);
  if (neighborOffset) {
    const neighborIndex = sourceIndex + neighborOffset;
    if (neighborIndex < 0 || neighborIndex >= queue.length) {
      return null;
    }
    const targetIndex = queueControlTargetIndex(text, queue.length);
    if (targetIndex < 0) {
      return null;
    }
    return {
      action: "move",
      execution: queue[neighborIndex] || null,
      sourceIndex: neighborIndex,
      targetIndex,
      queue,
      text,
      referenceSource: "recent_queue_neighbor",
    };
  }
  if (queueControlRecentReferenceRemainder(text)) {
    return null;
  }
  const targetIndex = queueControlTargetIndex(text, queue.length);
  if (targetIndex < 0) {
    return null;
  }
  return {
    action: "move",
    execution: queue[sourceIndex] || null,
    sourceIndex,
    targetIndex,
    queue,
    text,
    referenceSource: "recent_queue_control",
  };
}

function parseQueueMoveCommand(text, queue) {
  if (!/\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move|reorder/.test(text)) {
    return null;
  }
  const ordinals = queueControlOrdinalMatches(text);
  if (ordinals.length < 2) {
    return null;
  }
  const sourceIndex = Math.max(0, Math.min(queue.length - 1, ordinals[0].index));
  const targetIndex = Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index));
  return {
    action: "move",
    execution: queue[sourceIndex] || null,
    sourceIndex,
    targetIndex,
    queue,
    text,
  };
}

function parseQueueSwapCommand(text, queue) {
  if (!/\u4ea4\u6362|\u4e92\u6362|\u5bf9\u8c03|\u6362\u4e00\u4e0b|\u6362\u4e2a\u4f4d\u7f6e|swap/.test(text)) {
    return null;
  }
  const ordinals = queueControlOrdinalMatches(text);
  if (ordinals.length < 2 || queue.length < 2) {
    return null;
  }
  const sourceIndex = Math.max(0, Math.min(queue.length - 1, ordinals[0].index));
  const targetIndex = Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index));
  if (sourceIndex === targetIndex) {
    return null;
  }
  const orderedIds = queue.map((execution) => safeTrim(execution?.id)).filter(Boolean);
  if (orderedIds.length !== queue.length) {
    return null;
  }
  [orderedIds[sourceIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[sourceIndex]];
  return {
    action: "reorder",
    orderedIds,
    queue,
    sourceIndex,
    targetIndex,
    text,
  };
}

function queueControlOperationSegments(text) {
  return safeTrim(text)
    .split(/\u5148|\u518d|\u7136\u540e|\u63a5\u7740|\u968f\u540e|then|next/gi)
    .map((segment) => safeTrim(segment))
    .filter(Boolean);
}

function queueControlAdjacentSwapIndexes(segment, queueLength) {
  if (queueLength < 2) {
    return null;
  }
  if (/\u524d\u4e24\u4e2a|\u6700\u524d\u4e24\u4e2a|\u524d\u4e24\u9879|\u6700\u524d\u4e24\u9879|firsttwo/.test(segment)) {
    return [0, 1];
  }
  if (/\u540e\u4e24\u4e2a|\u6700\u540e\u4e24\u4e2a|\u672b\u5c3e\u4e24\u4e2a|\u540e\u4e24\u9879|\u6700\u540e\u4e24\u9879|lasttwo/.test(segment)) {
    return [queueLength - 2, queueLength - 1];
  }
  return null;
}

function parseQueueOperationPlanCommand(text, queue) {
  if (!Array.isArray(queue) || queue.length < 2) {
    return null;
  }
  const orderedIds = queue.map((execution) => safeTrim(execution?.id)).filter(Boolean);
  if (orderedIds.length !== queue.length) {
    return null;
  }
  const operations = [];
  for (const segment of queueControlOperationSegments(text)) {
    const ordinals = queueControlOrdinalMatches(segment);
    const hasSwap = /\u4ea4\u6362|\u4e92\u6362|\u5bf9\u8c03|\u6362\u4e00\u4e0b|\u6362\u4e2a\u4f4d\u7f6e|swap/.test(
      segment
    );
    const hasMove = /\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230|move/.test(
      segment
    );
    const adjacentSwapIndexes = hasSwap ? queueControlAdjacentSwapIndexes(segment, queue.length) : null;
    if (adjacentSwapIndexes) {
      operations.push({
        type: "swap",
        sourceIndex: adjacentSwapIndexes[0],
        targetIndex: adjacentSwapIndexes[1],
      });
      continue;
    }
    if (hasSwap && ordinals.length >= 2) {
      operations.push({
        type: "swap",
        sourceIndex: ordinals[0].index,
        targetIndex: ordinals[ordinals.length - 1].index,
      });
      continue;
    }
    if (hasMove && ordinals.length >= 1 && /\u6700\u540e|\u672b\u5c3e|last/.test(segment)) {
      operations.push({
        type: "move",
        sourceIndex: ordinals[0].index,
        targetIndex: queue.length - 1,
        targetLast: true,
      });
      continue;
    }
    if (hasMove && ordinals.length >= 2) {
      operations.push({
        type: "move",
        sourceIndex: ordinals[0].index,
        targetIndex: ordinals[ordinals.length - 1].index,
      });
    }
  }
  if (operations.length < 2) {
    return null;
  }
  const nextIds = orderedIds.slice();
  for (const operation of operations) {
    const sourceIndex = Math.max(0, Math.min(nextIds.length - 1, operation.sourceIndex));
    const targetIndex = Math.max(0, Math.min(nextIds.length - 1, operation.targetIndex));
    if (operation.type === "swap") {
      if (sourceIndex === targetIndex) {
        return null;
      }
      [nextIds[sourceIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[sourceIndex]];
      continue;
    }
    const [movedId] = nextIds.splice(sourceIndex, 1);
    if (!movedId) {
      return null;
    }
    if (operation.targetLast) {
      nextIds.push(movedId);
    } else {
      nextIds.splice(Math.max(0, Math.min(nextIds.length, targetIndex)), 0, movedId);
    }
  }
  if (nextIds.every((id, index) => id === orderedIds[index])) {
    return null;
  }
  return {
    action: "reorder",
    orderedIds: nextIds,
    queue,
    operations,
    text,
  };
}

function parseQueueMoveLastThenCurrentSwapCommand(text, queue) {
  const moveIndexInText = text.search(
    /(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230).*(?:\u6700\u540e|\u672b\u5c3e|last)/
  );
  const swapIndexInText = text.search(
    /\u4ea4\u6362|\u4e92\u6362|\u5bf9\u8c03|\u6362\u4e00\u4e0b|\u6362\u4e2a\u4f4d\u7f6e|swap/
  );
  if (moveIndexInText < 0 || swapIndexInText < 0 || moveIndexInText > swapIndexInText) {
    return null;
  }
  const ordinals = queueControlOrdinalMatches(text);
  if (ordinals.length < 3 || queue.length < 3) {
    return null;
  }
  const moveIndex = Math.max(0, Math.min(queue.length - 1, ordinals[0].index));
  const firstSwapIndex = Math.max(0, Math.min(queue.length - 1, ordinals[1].index));
  const secondSwapIndex = Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index));
  if (firstSwapIndex === secondSwapIndex) {
    return null;
  }
  const orderedIds = queue.map((execution) => safeTrim(execution?.id)).filter(Boolean);
  const moveId = safeTrim(queue[moveIndex]?.id);
  if (orderedIds.length !== queue.length || !moveId) {
    return null;
  }
  orderedIds.splice(moveIndex, 1);
  orderedIds.push(moveId);
  [orderedIds[firstSwapIndex], orderedIds[secondSwapIndex]] = [
    orderedIds[secondSwapIndex],
    orderedIds[firstSwapIndex],
  ];
  return {
    action: "reorder",
    orderedIds,
    queue,
    sourceIndex: firstSwapIndex,
    targetIndex: secondSwapIndex,
    moveIndex,
    text,
  };
}

function parseQueueSwapThenMoveLastCommand(text, queue) {
  if (!/\u4ea4\u6362|\u4e92\u6362|\u5bf9\u8c03|\u6362\u4e00\u4e0b|\u6362\u4e2a\u4f4d\u7f6e|swap/.test(text)) {
    return null;
  }
  if (!/(?:\u79fb\u52a8|\u79fb\u5230|\u79fb\u81f3|\u6392\u5230|\u653e\u5230|\u8c03\u6574\u5230|\u632a\u5230).*(?:\u6700\u540e|\u672b\u5c3e|last)/.test(text)) {
    return null;
  }
  const ordinals = queueControlOrdinalMatches(text);
  if (ordinals.length < 3 || queue.length < 3) {
    return null;
  }
  const firstSwapIndex = Math.max(0, Math.min(queue.length - 1, ordinals[0].index));
  const secondSwapIndex = Math.max(0, Math.min(queue.length - 1, ordinals[1].index));
  const moveIndex = Math.max(0, Math.min(queue.length - 1, ordinals[ordinals.length - 1].index));
  if (firstSwapIndex === secondSwapIndex) {
    return null;
  }
  const orderedIds = queue.map((execution) => safeTrim(execution?.id)).filter(Boolean);
  if (orderedIds.length !== queue.length) {
    return null;
  }
  [orderedIds[firstSwapIndex], orderedIds[secondSwapIndex]] = [
    orderedIds[secondSwapIndex],
    orderedIds[firstSwapIndex],
  ];
  const moveId = safeTrim(queue[moveIndex]?.id);
  const currentIndex = orderedIds.indexOf(moveId);
  if (!moveId || currentIndex < 0) {
    return null;
  }
  orderedIds.splice(currentIndex, 1);
  orderedIds.push(moveId);
  return {
    action: "reorder",
    orderedIds,
    queue,
    sourceIndex: firstSwapIndex,
    targetIndex: secondSwapIndex,
    moveIndex,
    text,
  };
}

function parseQueueReorderCommand(rawText, text, queue) {
  if (!/\u91cd\u6392|\u91cd\u65b0\u6392|\u91cd\u65b0\u6392\u5e8f|\u6392\u5e8f|\u987a\u5e8f|reorder/.test(text)) {
    return null;
  }
  const indexes = queueControlOrderIndexes(rawText, queue.length);
  if (indexes.length !== queue.length || indexes.length < 2) {
    return null;
  }
  const orderedIds = indexes.map((index) => safeTrim(queue[index]?.id)).filter(Boolean);
  if (orderedIds.length !== queue.length) {
    return null;
  }
  return {
    action: "reorder",
    orderedIds,
    queue,
    text,
  };
}

function parseNaturalLanguageQueueControl(message, executionStore, recentReference = null) {
  const rawText = safeTrim(message).toLowerCase();
  const text = normalizeQueueControlText(message);
  let action = parseQueueControlAction(text);
  if (action === "cancel" && /\u5168\u90e8|\u6240\u6709|\u5168\u90fd|all/.test(text)) {
    action = "cancel_all";
  }
  if (!action || !hasQueueControlHint(text)) {
    return null;
  }
  if (/\u8282\u70b9|\u753b\u5e03|\u56fe\u5c42|\u7d20\u6750|\u8fde\u7ebf/.test(text) && !/\u6392\u961f|\u961f\u5217|queue|queued/.test(text)) {
    return null;
  }
  const snapshot = typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : {};
  const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  // An empty queue cannot be controlled. Only an explicit queue
  // reference keeps the queue-control interpretation (and its honest
  // empty-queue reply); implicit hints like 第/最后/下一 inside free
  // creative text must flow to the agent instead of being swallowed.
  if (!queue.length && !/排队|队列|queue|queued/.test(text)) {
    return null;
  }
  if (action === "reorder") {
    return (
      parseQueueRecentMultiReferenceMoveCommand(text, queue, recentReference) ||
      parseQueueOperationPlanCommand(text, queue) ||
      parseQueueMoveLastThenCurrentSwapCommand(text, queue) ||
      parseQueueSwapThenMoveLastCommand(text, queue) ||
      parseQueueSwapCommand(text, queue) ||
      parseQueueReorderCommand(rawText, text, queue)
    );
  }
  if (action === "move") {
    return (
      parseQueueRecentMultiReferenceMoveCommand(text, queue, recentReference) ||
      parseQueueOperationPlanCommand(text, queue) ||
      parseQueueRecentReferenceMoveCommand(text, queue, recentReference) ||
      parseQueueTitleMoveCommand(text, queue) ||
      parseQueueMoveCommand(text, queue)
    );
  }
  if (action === "top") {
    const recentMultiCommand = parseQueueRecentMultiReferenceMoveCommand(text, queue, recentReference, 0);
    if (recentMultiCommand) {
      return recentMultiCommand;
    }
  }
  if (action === "cancel_all") {
    return { action, executions: queue, queue, text };
  }
  if (action === "resume" && !/\u7b2c|first|next|last|\u4e0b\u4e00|\u4e0a\u4e00|\u6700\u540e/.test(text)) {
    const pausedExecution = queue.find((execution) => execution?.drawerState?.queuePaused === true) || null;
    return { action, execution: pausedExecution, queue, text };
  }
  const index = queueControlTargetIndex(text, queue.length);
  return {
    action,
    execution: index >= 0 ? queue[index] || null : null,
    queue,
    text,
  };
}

function activeExecutionControlExecution(executionStore) {
  const snapshot = typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : {};
  const activeId = safeTrim(snapshot?.activeExecutionId);
  if (!activeId) {
    return null;
  }
  if (typeof executionStore?.getExecution === "function") {
    const execution = executionStore.getExecution(activeId);
    if (execution) {
      return execution;
    }
  }
  const executions = Array.isArray(snapshot?.executions) ? snapshot.executions : [];
  return executions.find((execution) => safeTrim(execution?.id) === activeId) || null;
}

function parseNaturalLanguageActiveExecutionControl(message, executionStore) {
  const text = normalizeQueueControlText(message);
  const action = parseQueueControlAction(text);
  if (action !== "pause" && action !== "resume" && action !== "cancel") {
    return null;
  }
  if (!/\u5f53\u524d|\u6b63\u5728|\u8fd9\u4e2a|\u6b64|active|current/.test(text)) {
    return null;
  }
  if (/\u6392\u961f|\u961f\u5217|\u4e0b\u4e00|\u4e0a\u4e00|\u7b2c|\u6700\u540e|queue|queued/.test(text)) {
    return null;
  }
  if (/\u8282\u70b9|\u753b\u5e03|\u56fe\u5c42|\u7d20\u6750|\u8fde\u7ebf/.test(text)) {
    return null;
  }
  return {
    action,
    execution: activeExecutionControlExecution(executionStore),
    text,
  };
}

function activeExecutionControlTitle(execution = {}) {
  return safeTrim(execution.title || execution.drawerState?.line1 || execution.id);
}

function activeExecutionControlReply(action, execution) {
  const title = activeExecutionControlTitle(execution);
  const suffix = title ? `\uff1a${title}` : "";
  const prefixes = {
    cancel: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1",
    pause: "\u5df2\u6682\u505c\u5f53\u524d\u4efb\u52a1",
    resume: "\u5df2\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1",
  };
  return `${prefixes[action] || "\u5df2\u5904\u7406\u5f53\u524d\u4efb\u52a1"}${suffix}`;
}

function parseNaturalLanguageAmbiguousExecutionControl(message, executionStore) {
  const text = normalizeQueueControlText(message);
  const action = parseQueueControlAction(text);
  if (action !== "cancel" && action !== "pause" && action !== "resume") {
    return null;
  }
  if (!/\u4efb\u52a1|task/.test(text)) {
    return null;
  }
  if (parseNaturalLanguageActiveExecutionControl(message, executionStore)) {
    return null;
  }
  if (parseNaturalLanguageQueueControl(message, executionStore)) {
    return null;
  }
  if (/\u8282\u70b9|\u753b\u5e03|\u56fe\u5c42|\u7d20\u6750|\u8fde\u7ebf/.test(text)) {
    return null;
  }
  const snapshot = typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : {};
  const activeExecutionId = safeTrim(snapshot?.activeExecutionId);
  const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  if (!activeExecutionId && !queue.length) {
    return null;
  }
  return {
    action,
    activeExecutionId,
    queueCount: queue.length,
    all: /\u5168\u90e8|\u6240\u6709|\u5168\u90fd|all/.test(text),
    text,
  };
}

function ambiguousExecutionControlReply(command = {}) {
  const action = command.action;
  if (action === "cancel" && command.all) {
    return "\u4f60\u60f3\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\uff0c\u8fd8\u662f\u53d6\u6d88\u5168\u90e8\u6392\u961f\u4efb\u52a1\uff1f\u53ef\u4ee5\u8bf4\u201c\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\u201d\u6216\u201c\u53d6\u6d88\u5168\u90e8\u6392\u961f\u4efb\u52a1\u201d\u3002";
  }
  if (action === "cancel") {
    return "\u4f60\u60f3\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\uff0c\u8fd8\u662f\u53d6\u6d88\u6392\u961f\u4efb\u52a1\uff1f\u53ef\u4ee5\u8bf4\u201c\u53d6\u6d88\u5f53\u524d\u4efb\u52a1\u201d\u6216\u201c\u53d6\u6d88\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1\u201d\u3002";
  }
  if (action === "pause") {
    return "\u4f60\u60f3\u6682\u505c\u5f53\u524d\u4efb\u52a1\uff0c\u8fd8\u662f\u6682\u505c\u6392\u961f\u4efb\u52a1\uff1f\u53ef\u4ee5\u8bf4\u201c\u6682\u505c\u5f53\u524d\u4efb\u52a1\u201d\u6216\u201c\u6682\u505c\u7b2c\u4e00\u4e2a\u6392\u961f\u4efb\u52a1\u201d\u3002";
  }
  if (action === "resume") {
    return "\u4f60\u60f3\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1\uff0c\u8fd8\u662f\u7ee7\u7eed\u6392\u961f\u4efb\u52a1\uff1f\u53ef\u4ee5\u8bf4\u201c\u7ee7\u7eed\u5f53\u524d\u4efb\u52a1\u201d\u6216\u201c\u7ee7\u7eed\u6392\u961f\u4efb\u52a1\u201d\u3002";
  }
  return "\u8fd9\u4e2a\u4efb\u52a1\u63a7\u5236\u6307\u4ee4\u8fd8\u4e0d\u591f\u660e\u786e\uff0c\u8bf7\u8bf4\u660e\u662f\u5f53\u524d\u4efb\u52a1\u8fd8\u662f\u6392\u961f\u4efb\u52a1\u3002";
}

function executionControlClarificationCard(command = {}) {
  const action = safeTrim(command.action);
  const verbs = {
    cancel: "\u53d6\u6d88",
    pause: "\u6682\u505c",
    resume: "\u7ee7\u7eed",
  };
  const verb = verbs[action] || "\u5904\u7406";
  const queueLabel = action === "cancel" && command.all
    ? `${verb}\u5168\u90e8\u6392\u961f\u4efb\u52a1`
    : `${verb}\u6392\u961f\u4efb\u52a1`;
  return {
    id: `execution_clarify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: "execution_control_clarification",
    status: "needs_clarification",
    title: "\u9009\u62e9\u8981\u64cd\u4f5c\u7684\u4efb\u52a1",
    summary: `\u8981${verb}\u5f53\u524d\u4efb\u52a1\u8fd8\u662f\u6392\u961f\u4efb\u52a1\uff1f`,
    action,
    all: Boolean(command.all),
    activeExecutionId: safeTrim(command.activeExecutionId),
    queueCount: Number(command.queueCount || 0) || 0,
    activeLabel: `${verb}\u5f53\u524d\u4efb\u52a1`,
    queueLabel,
  };
}

function parsePendingExecutionControlClarification(message, clarification = null) {
  if (!clarification || typeof clarification !== "object") {
    return null;
  }
  const action = safeTrim(clarification.action || clarification.requestedAction);
  if (action !== "cancel" && action !== "pause" && action !== "resume") {
    return null;
  }
  const text = normalizeQueueControlText(message);
  if (!text || /\u8282\u70b9|\u753b\u5e03|\u56fe\u5c42|\u7d20\u6750|\u8fde\u7ebf/.test(text)) {
    return null;
  }
  if (/\u5f53\u524d|\u6b63\u5728|\u8fd9\u4e2a|\u6b64|active|current/.test(text)) {
    return { action, target: "active", all: Boolean(clarification.all), text };
  }
  if (/\u6392\u961f|\u961f\u5217|\u7b2c|\u4e0b\u4e00|\u4e0a\u4e00|\u6700\u540e|queue|queued/.test(text)) {
    return { action, target: "queue", all: Boolean(clarification.all), text };
  }
  return null;
}

function clarifiedQueueControlCommand(clarification = {}, executionStore) {
  const snapshot = typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : {};
  const queue = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  const action = clarification.action;
  if (action === "cancel" && clarification.all) {
    return { action: "cancel_all", executions: queue, queue, text: clarification.text || "" };
  }
  const execution =
    action === "resume"
      ? queue.find((item) => item?.drawerState?.queuePaused === true) || queue[0] || null
      : queue[0] || null;
  return {
    action,
    execution,
    queue,
    text: clarification.text || "",
  };
}


function providerDisplayName(provider) {
  const text = safeTrim(provider);
  if (!text) {
    return "Provider";
  }
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function capabilityText(capabilities) {
  const labels = {
    text: "\u6587\u672c",
    vision: "\u89c6\u89c9",
    action_planning: "\u52a8\u4f5c\u89c4\u5212",
    high_quality: "\u9ad8\u8d28\u91cf",
    low_latency: "\u4f4e\u5ef6\u8fdf",
    image_generation: "\u56fe\u50cf\u751f\u6210",
    video_generation: "\u89c6\u9891\u751f\u6210",
  };
  return (Array.isArray(capabilities) ? capabilities : [])
    .map((item) => labels[item] || item)
    .filter(Boolean)
    .join(" ");
}

function assistantModelLabel(model) {
  if (!model || typeof model !== "object") {
    return "Agent";
  }
  return safeTrim(model.displayName || model.model || model.modelId || model.id || "Agent");
}

export function createAssistantPanelState({
  api,
  buildContext = () => ({}),
  graphStore,
  conversationStore = null,
  conversationId = "",
  attachmentStore = createAssistantAttachmentStore(),
  selectedModel = null,
  modelOptions = [],
  modelConfigRequired = false,
  agentMode = "",
  localStorage = globalThis.localStorage,
  typingDelayMs = 12,
  typingChunkSize = 1,
  typingScheduler = null,
  executeActions = executeAssistantActions,
  templateStore = null,
  canvasSkillsRuntime = null,
  executionStore = createAssistantExecutionStore(),
  executionSyncClient = null,
  executionOrchestrator = null,
  summarizeActions = summarizeAssistantActions,
  directorLegacyQmai = false,
  launchRegistry = null,
} = {}) {
  let applyingPromise = null;
  let activeStream = null;
  let graphUnsubscribe = null;
  const rawModelOptions = normalizeModelOptions(modelOptions);
  const normalizedModelOptions = filterSelectableTextModelOptions(rawModelOptions);
  const usesDefaultSummarizer = summarizeActions === summarizeAssistantActions;

  // D5/D6: launch-provider registry — chip → contract preview → confirm →
  // synthesize → existing dispatch. Injectable for tests; defaults to ViMax as
  // provider #1 (the generic registry/contract layer stays vimax-free — AC8).
  const launchProviders = launchRegistry || (() => {
    const reg = createLaunchProviderRegistry();
    try {
      reg.register(createVimaxLaunchProvider());
    } catch {
      /* defensive: a re-registration / test double must not break panel boot */
    }
    return reg;
  })();

  function notifyUpdate(options) {
    if (typeof options?.onUpdate === "function") {
      options.onUpdate();
    }
  }

  function currentSelectedActionIndexes() {
    if (!(state.selectedActionIndexes instanceof Set)) {
      return state.pendingActions.map((_, index) => index);
    }
    return [...state.selectedActionIndexes].filter((index) => index >= 0 && index < state.pendingActions.length);
  }

  function latestAssistantMessageWithCard() {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (message?.role === "assistant") {
        return message;
      }
    }
    return null;
  }

  function attachCardToLatestAssistant(card) {
    const message = latestAssistantMessageWithCard();
    if (!message) {
      return null;
    }
    message.cards = Array.isArray(message.cards) ? message.cards : [];
    message.cards.push(card);
    return card;
  }

  function latestInteractionCard() {
    const message = latestAssistantMessageWithCard();
    const cards = Array.isArray(message?.cards) ? message.cards : [];
    return cards.length ? { message, index: cards.length - 1, card: cards[cards.length - 1] } : null;
  }

  function latestCanvasActionCardTarget(cardId = "") {
    const targetId = safeTrim(cardId);
    for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = state.messages[messageIndex];
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (card?.type !== "canvas_actions") {
          continue;
        }
        if (!targetId || safeTrim(card.id) === targetId) {
          return { message, index, card };
        }
      }
    }
    return null;
  }

  function latestExecutionControlClarificationCardTarget(cardId = "") {
    const targetId = safeTrim(cardId);
    for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = state.messages[messageIndex];
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (card?.type !== "execution_control_clarification") {
          continue;
        }
        if (!targetId || safeTrim(card.id) === targetId) {
          return { message, index, card };
        }
      }
    }
    return null;
  }

  function latestQueueTitleClarificationCardTarget(cardId = "") {
    const targetId = safeTrim(cardId);
    for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = state.messages[messageIndex];
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (card?.type !== "queue_title_clarification") {
          continue;
        }
        if (!targetId || safeTrim(card.id) === targetId) {
          return { message, index, card };
        }
      }
    }
    return null;
  }

  function archivePendingExecutionControlClarificationCards(summary = "") {
    const archiveSummary =
      safeTrim(summary) || "\u5df2\u6536\u5230\u65b0\u7684\u6f84\u6e05\u8bf7\u6c42\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002";
    let archived = 0;
    for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = state.messages[messageIndex];
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (card?.type !== "execution_control_clarification" || card?.status !== "needs_clarification") {
          continue;
        }
        const updated = updateInteractionCardStatus(card, {
          status: "archived",
          summary: archiveSummary,
        });
        message.cards[index] = updated;
        archived += 1;
        if (state.conversationId && typeof conversationStore?.updateMessageCard === "function") {
          conversationStore.updateMessageCard(state.conversationId, updated.id, updated);
        }
      }
    }
    if (archived) {
      state.pendingExecutionControlClarification = null;
    }
    return archived;
  }

  function archivePendingQueueTitleClarificationCards(summary = "") {
    const archiveSummary =
      safeTrim(summary) || "\u5df2\u6536\u5230\u65b0\u7684\u6392\u961f\u4efb\u52a1\u6307\u4ee4\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002";
    let archived = 0;
    for (let messageIndex = state.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = state.messages[messageIndex];
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      for (let index = cards.length - 1; index >= 0; index -= 1) {
        const card = cards[index];
        if (card?.type !== "queue_title_clarification" || card?.status !== "needs_clarification") {
          continue;
        }
        const updated = updateInteractionCardStatus(card, {
          status: "archived",
          summary: archiveSummary,
        });
        message.cards[index] = updated;
        archived += 1;
        if (state.conversationId && typeof conversationStore?.updateMessageCard === "function") {
          conversationStore.updateMessageCard(state.conversationId, updated.id, updated);
        }
      }
    }
    if (archived) {
      state.pendingQueueTitleClarification = null;
    }
    return archived;
  }

  function completeExecutionControlClarificationCard(target) {
    const selectedTarget = target === "queue" ? "queue" : "active";
    const selectedLabel = selectedTarget === "queue" ? "\u6392\u961f\u4efb\u52a1" : "\u5f53\u524d\u4efb\u52a1";
    const cardTarget = latestExecutionControlClarificationCardTarget();
    if (!cardTarget || cardTarget.card?.status !== "needs_clarification") {
      return null;
    }
    const updated = updateInteractionCardStatus(cardTarget.card, {
      status: "completed",
      selectedTarget,
      summary: `\u5df2\u9009\u62e9${selectedLabel}\uff0c\u6b63\u5728\u6267\u884c\u5bf9\u5e94\u64cd\u4f5c\u3002`,
    });
    cardTarget.message.cards[cardTarget.index] = updated;
    if (state.conversationId && typeof conversationStore?.updateMessageCard === "function") {
      conversationStore.updateMessageCard(state.conversationId, updated.id, updated);
    }
    return updated;
  }

  function completeQueueTitleClarificationCard(candidate = {}) {
    const selectedCandidateId = safeTrim(candidate.id || candidate.executionId);
    const selectedLabel = safeTrim(candidate.title || selectedCandidateId) || "\u8be5\u6392\u961f\u4efb\u52a1";
    const cardTarget = latestQueueTitleClarificationCardTarget();
    if (!cardTarget || cardTarget.card?.status !== "needs_clarification") {
      return null;
    }
    const updated = updateInteractionCardStatus(cardTarget.card, {
      status: "completed",
      selectedCandidateId,
      summary: `\u5df2\u9009\u62e9${selectedLabel}\uff0c\u6b63\u5728\u8c03\u6574\u6392\u961f\u987a\u5e8f\u3002`,
    });
    cardTarget.message.cards[cardTarget.index] = updated;
    if (state.conversationId && typeof conversationStore?.updateMessageCard === "function") {
      conversationStore.updateMessageCard(state.conversationId, updated.id, updated);
    }
    return updated;
  }

  function updateLatestInteractionCard(patch) {
    const target = latestCanvasActionCardTarget() || latestInteractionCard();
    if (!target) {
      return null;
    }
    const updated = updateInteractionCardStatus(target.card, patch);
    target.message.cards[target.index] = updated;
    return updated;
  }

  function updateCanvasActionCard(cardId, patch) {
    const target = latestCanvasActionCardTarget(cardId);
    if (!target) {
      return null;
    }
    const updated = updateInteractionCardStatus(target.card, patch);
    target.message.cards[target.index] = updated;
    return updated;
  }

  // D5: find a card (any type) in state.messages by identity/id and replace it
  // with its patched form (immutable, like the other card-update helpers). Used
  // by the launch chip → preview → confirm/cancel transitions.
  function patchCardInState(card, patch) {
    for (const message of state.messages) {
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      const index = cards.findIndex((entry) => entry === card || (entry?.id && entry.id === card?.id));
      if (index >= 0) {
        const updated = updateInteractionCardStatus(cards[index], patch);
        cards[index] = updated;
        if (state.conversationId && typeof conversationStore?.updateMessageCard === "function") {
          conversationStore.updateMessageCard(state.conversationId, updated.id, updated);
        }
        return updated;
      }
    }
    return updateInteractionCardStatus(card, patch);
  }

  // D5: best-effort count of visible characters in the latest landed cast sheet,
  // for the 定妆 contract's node/draw count. 0 if no cast on canvas yet.
  function countVisibleCastCharacters() {
    const cast = graphNodes().find(
      (n) => n?.data?.vimaxRole === "cast" || n?.vimaxRole === "cast" || (typeof n?.id === "string" && n.id.endsWith("-cast"))
    );
    if (!cast) return 0;
    const content = cast?.data?.content !== undefined ? cast.data.content : (cast?.content || "");
    try {
      return castContentToCharacters(content || "").filter((character) => character.isVisible !== false).length;
    } catch {
      return 0;
    }
  }

  // D5: chip click → contract preview. Resolve the provider from the card's
  // registry-controlled launchProviderId, derive the pure (no-LLM, no-spend)
  // contract, and move the card to `preview`. The chipId is stashed on the
  // contract so [确认开始] can synthesize the matching command.
  function launchChipPreview(card, chipId, options) {
    if (!card) return null;
    const provider = launchProviders.get(card.launchProviderId);
    if (!provider || typeof provider.deriveContract !== "function") return null;
    const ctx = {
      visibleCharacterCount: countVisibleCastCharacters(),
      skillRefs: Array.isArray(card.launchSkillRefs) ? card.launchSkillRefs : [],
    };
    let contract;
    try {
      contract = provider.deriveContract(chipId, card.launchBrief || "", ctx);
    } catch {
      return null;
    }
    const updated = patchCardInState(card, { status: "preview", expanded: true, contract: { ...contract, chipId } });
    notifyUpdate(options);
    return updated;
  }

  // D5: [确认开始] → synthesize the EXISTING command and feed it to the SAME
  // dispatch (parseVimaxCommand → applyVimaxNativePlanCommand). The launch card
  // NEVER lands actions itself — B3 owns landing (no double-land). The card is
  // marked `running` (chips cleared) so it does not re-offer the launch chips.
  async function launchContractConfirm(card, options) {
    if (!card) return null;
    const provider = launchProviders.get(card.launchProviderId);
    const chipId = card?.contract?.chipId;
    if (!provider || typeof provider.synthesizeCommand !== "function" || !chipId) return null;
    const command = provider.synthesizeCommand(chipId, card.launchBrief || "", {
      skillRefs: card?.contract?.skillRefs || [],
    });
    if (!safeTrim(command)) {
      notifyUpdate(options);
      return null;
    }
    const priorOptions = Array.isArray(card.options) ? card.options : [];
    patchCardInState(card, { status: "running", expanded: false, options: [] });
    // D7: a film contract carries an estimated 约N count; remember this card so the
    // real shot count from planning can replace it once the plan lands. Single
    // pending (§16.4): a concurrent film confirm before the first lands overwrites
    // this — the earlier card just keeps its estimate (a lost update, never a
    // mis-attribution to the wrong card).
    state.pendingLaunchContractCardId = card?.contract?.cost?.estimated ? card.id : null;
    try {
      return await state.sendMessage(command, options);
    } catch (error) {
      // The common dispatch failure returns null (applyVimaxNativePlanCommand
      // catches and sets status:error); this is belt-and-suspenders for a real
      // throw — roll the card back so its chips are re-offered.
      patchCardInState(card, { status: "needs_action", options: priorOptions });
      notifyUpdate(options);
      return null;
    }
  }

  // D5: [取消] in preview → back to the chip row (needs_action), drop the contract.
  function launchContractCancel(card, options) {
    if (!card) return null;
    const updated = patchCardInState(card, { status: "needs_action", expanded: false, contract: null });
    notifyUpdate(options);
    return updated;
  }

  // D7: when a film launch flow's plan lands the real shotplan, replace the
  // estimated 约N cost on its living contract card with the real shot count
  // (estimated:false + an `updated` mark for the 已更新 badge — explicit, never
  // silent). The card id is consumed by the caller (the poll done branch clears
  // the stash up front, success or fail, so a failed plan never mis-attributes).
  function updateLaunchContractShotCount(cardId, result) {
    if (!cardId) return;
    const shots = Array.isArray(result?.shots) ? result.shots.length : 0;
    if (!shots) return;
    for (const message of state.messages) {
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      const card = cards.find((entry) => entry?.id === cardId && entry?.type === "launch" && entry?.contract);
      if (!card) continue;
      patchCardInState(card, {
        contract: {
          ...card.contract,
          cost: { ...(card.contract.cost || {}), drawCount: shots, estimated: false },
          updated: true,
        },
      });
      return;
    }
  }

  // D6: offer launch chips on a prefix-less assistant reply. The §6.1 exclusions
  // (command prefix / control word / paused / too-short) are enforced by the
  // provider's match() — we just pass the brief + current ctx. Idempotent: never
  // re-injects if the message already carries a launch card (so a mid-interaction
  // preview/running card is preserved across renders).
  let launchCardSeq = 0;
  function offerLaunchChips(assistantMessage, brief) {
    if (!assistantMessage || assistantMessage.role !== "assistant") return null;
    const cards = Array.isArray(assistantMessage.cards) ? assistantMessage.cards : [];
    // Launch chips are only for a PLAIN chat reply that took no action. If the
    // reply already carries any card — a canvas_actions operation/generation card,
    // a clarification card, or an existing launch card — do not offer: this keeps
    // idempotency AND never shadows an operation card with redundant chips.
    if (cards.length) return null;
    const briefText = safeTrim(brief);
    if (!briefText) return null;
    // canvas-op detection is deferred: PRD §6.1/RK1 accepts aggressive triggering,
    // and parseCanvasOpCommand isn't implemented yet. The provider's isCanvasOp
    // gate stays wired for when a real signal lands; the other §6.1 exclusions
    // (prefix / control word / paused / too-short) are live.
    const ctx = { paused: Boolean(state.pendingVimaxNativeResume), isCanvasOp: false };
    const providers = launchProviders.listMatching(briefText, ctx);
    if (!providers.length) return null;
    // Aggregate the matching providers' chips (registration order). This phase
    // only ViMax is registered; each chip remembers its providerId for the future.
    const chips = providers.flatMap((provider) =>
      (Array.isArray(provider.chips) ? provider.chips : []).map((chip) => ({ ...chip, providerId: provider.id }))
    );
    if (!chips.length) return null;
    const launchCard = {
      id: `launch-${(launchCardSeq += 1)}`,
      type: "launch",
      status: "needs_action",
      title: LAUNCH_STRINGS.offerTitle,
      summary: LAUNCH_STRINGS.offerSummary,
      expanded: true,
      launchProviderId: providers[0].id,
      launchBrief: briefText,
      options: chips,
      contract: null,
      steps: [],
      pausedReason: "",
    };
    assistantMessage.cards = [...cards, launchCard];
    return launchCard;
  }

  // D6: keep launch chips on the LATEST assistant reply only — strip untouched
  // needs_action chips from older replies (§6.4: a new reply replaces old chip
  // rows; a preview/running card the user already engaged is preserved). Runs
  // each render so the offer re-evaluates against current state (frozen, etc.).
  function refreshLaunchChips() {
    const messages = Array.isArray(state.messages) ? state.messages : [];
    let lastAssistant = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant") {
        lastAssistant = i;
        break;
      }
    }
    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      if (message?.role !== "assistant") continue;
      const cards = Array.isArray(message.cards) ? message.cards : [];
      // A reply is eligible for launch chips only if it is the LATEST and took no
      // action. If it produced an operation/clarification card (tookAction) — or
      // it is an older reply — strip its untouched needs_action chips so a launch
      // chip never shadows or co-exists with a real action card (a launch chip
      // can be added during an intermediate render before the action card lands).
      const tookAction = cards.some((card) => card && card.type !== "launch");
      if (i !== lastAssistant || tookAction) {
        if (cards.length) {
          message.cards = cards.filter(
            (card) => !(card?.type === "launch" && card?.status === "needs_action")
          );
        }
        continue;
      }
      let brief = "";
      for (let j = i - 1; j >= 0; j -= 1) {
        if (messages[j]?.role === "user") {
          brief = messages[j].content || "";
          break;
        }
      }
      offerLaunchChips(message, brief);
    }
  }

  function graphNodes() {
    return resolveGraphNodes(graphStore);
  }

  function graphNodeById(nodeId) {
    const id = safeTrim(nodeId);
    if (!id) return null;
    return graphNodes().find((node) => safeTrim(node?.id) === id) || graphStore?.getNode?.(id) || null;
  }

  function nodeIdsFromResult(result = {}, fallbackCard = null) {
    return [
      ...(Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds : []),
      ...(Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds : []),
      ...(Array.isArray(result.completedGenerationNodeIds) ? result.completedGenerationNodeIds : []),
      ...(Array.isArray(result.failedGenerationNodeIds) ? result.failedGenerationNodeIds : []),
      ...(fallbackCard?.operation?.sync === true && Array.isArray(fallbackCard?.operation?.nodeIds) ? fallbackCard.operation.nodeIds : []),
    ].map(safeTrim).filter(Boolean);
  }

  function generationNodeIdsFromResult(result = {}) {
    return [
      ...(Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds : []),
      ...(Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds : []),
      ...(Array.isArray(result.completedGenerationNodeIds) ? result.completedGenerationNodeIds : []),
      ...(Array.isArray(result.failedGenerationNodeIds) ? result.failedGenerationNodeIds : []),
    ].map(safeTrim).filter(Boolean);
  }

  function canvasCardStatusForNodeIds(nodeIds = []) {
    const statuses = [...new Set(nodeIds.map(safeTrim).filter(Boolean).map((nodeId) => {
      const node = graphNodeById(nodeId);
      const data = node?.data && typeof node.data === "object" ? node.data : node || {};
      return mapCanvasGenerationState(data).cardStatus;
    }))];
    if (statuses.some((status) => status === "failed")) return "failed";
    if (statuses.some((status) => status === "retryable")) return "retryable";
    if (statuses.some((status) => status === "cancelled")) return "cancelled";
    if (statuses.some((status) => status === "paused")) return "paused";
    if (statuses.some((status) => status === "generating")) return "generating";
    if (statuses.some((status) => status === "preparing")) return "preparing";
    if (statuses.length && statuses.every((status) => status === "completed")) return "completed";
    return nodeIds.length ? "preparing" : "completed";
  }

  function firstResultUrl(data = {}) {
    const candidates = [
      data.resultPreviewUrl,
      data.previewUrl,
      data.imageUrl,
      data.videoUrl,
      data.url,
      data.src,
      data.localPath,
      ...(Array.isArray(data.images) ? data.images : []),
      ...(Array.isArray(data.videos) ? data.videos : []),
      ...(Array.isArray(data.outputs) ? data.outputs : []),
      ...(Array.isArray(data.results) ? data.results : []),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === "string") {
        const value = safeTrim(candidate);
        if (value) return value;
      }
      if (candidate && typeof candidate === "object") {
        const value = safeTrim(
          candidate.url ||
            candidate.src ||
            candidate.imageUrl ||
            candidate.videoUrl ||
            candidate.previewUrl ||
            candidate.localPath ||
            candidate.path
        );
        if (value) return value;
      }
    }
    return "";
  }

  function operationItemsForNodeIds(nodeIds = []) {
    return [...new Set(nodeIds.map(safeTrim).filter(Boolean))].map((nodeId) => {
      const node = graphNodeById(nodeId);
      const data = node?.data && typeof node.data === "object" ? node.data : node || {};
      const mapped = mapCanvasGenerationState(data);
      return {
        nodeId,
        nodeType: safeTrim(node?.type || node?.nodeType || data.nodeType || data.type),
        name: safeTrim(node?.name || data.name || data.title || nodeId),
        status: mapped.cardStatus,
        technicalStatus: mapped.technicalStatus,
        promptPreview: safeTrim(data.prompt || data.content || data.text).slice(0, 120),
        modelDisplayName: safeTrim(data.modelName || data.modelDisplayName || data.selectedModelName || data.model || data.modelId),
        batchSize: data.batchSize ?? data.generationCount ?? data.count ?? "",
        aspectRatio: safeTrim(data.aspectRatio || data.ratio || data.imageSize || data.size),
        taskId: safeTrim(data.taskId || data.generationTaskId || data.rhTaskId || data.dreaminaTaskId || data.submitId),
        resultPreviewUrl: firstResultUrl(data),
        error: safeTrim(data.generationError || data.error || data.errorMessage),
        warning: safeTrim(data.generationWarning || data.warning),
      };
    });
  }

  function refreshSyncedOperationCards(options = {}) {
    let changed = false;
    for (const message of state.messages) {
      const cards = Array.isArray(message?.cards) ? message.cards : [];
      cards.forEach((card, index) => {
        if (card?.type !== "canvas_actions") return;
        const nodeIds = nodeIdsFromResult(card.result || {}, card);
        if (!nodeIds.length) return;
        const status = canvasCardStatusForNodeIds(nodeIds);
        const items = operationItemsForNodeIds(nodeIds);
        if (status && status !== card.status) {
          message.cards[index] = updateInteractionCardStatus(card, {
            status,
            expanded: status === "failed" || status === "retryable" ? true : card.expanded,
            operation: { ...(card.operation || {}), nodeIds, status },
            items,
          });
          changed = true;
        } else if (JSON.stringify(card.items || []) !== JSON.stringify(items)) {
          message.cards[index] = updateInteractionCardStatus(card, {
            operation: { ...(card.operation || {}), nodeIds, status: status || card.status },
            items,
          });
          changed = true;
        }
      });
    }
    if (changed) notifyUpdate(options);
    return changed;
  }

  function hasAssistantExecutionContract(response = {}) {
    return Boolean(response?.execution || response?.plan || response?.intent || response?.actionsByStep);
  }

  const resolvedExecutionSyncClient =
    executionSyncClient === false ? null : executionSyncClient || createAssistantExecutionApiClient();

  function syncExecutionToBackend(execution, initialEvent = null) {
    if (!execution || !resolvedExecutionSyncClient || typeof resolvedExecutionSyncClient.upsertExecution !== "function") {
      return;
    }
    const executionPayload = {
      ...execution,
      timeline: [],
    };
    state.lastExecutionSyncPromise = Promise.resolve()
      .then(() => resolvedExecutionSyncClient.upsertExecution(executionPayload))
      .then(() => {
        if (
          initialEvent &&
          typeof resolvedExecutionSyncClient.appendTimelineEvent === "function"
        ) {
          return resolvedExecutionSyncClient.appendTimelineEvent(execution.id, initialEvent);
        }
        return null;
      })
      .catch((error) => {
        state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution sync failed";
      });
  }

  function executionHistoryFilters() {
    const projectId = safeTrim(executionStore?.snapshot?.()?.projectId);
    return projectId ? { projectId } : {};
  }

  async function loadExecutionHistoryFromBackend(options = {}) {
    if (
      !executionStore ||
      typeof executionStore.importExecutions !== "function" ||
      !resolvedExecutionSyncClient ||
      typeof resolvedExecutionSyncClient.listExecutions !== "function"
    ) {
      return [];
    }
    try {
      const payload = await resolvedExecutionSyncClient.listExecutions(executionHistoryFilters());
      const items = Array.isArray(payload?.executions)
        ? payload.executions
        : Array.isArray(payload)
          ? payload
          : [];
      const imported = executionStore.importExecutions(items);
      if (imported.length) {
        notifyUpdate(options);
      }
      return imported;
    } catch (error) {
      state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution history load failed";
      notifyUpdate(options);
      return [];
    }
  }

  function rememberQueueControlReference(execution, action = "") {
    const id = safeTrim(execution?.id);
    if (!id || action === "cancel") {
      if (action === "cancel") {
        state.lastQueueControlReference = null;
        state.recentQueueControlReferences = [];
      }
      return;
    }
    const reference = {
      executionId: id,
      title: queueControlExecutionTitle(execution),
    };
    const previousReferences = Array.isArray(state.recentQueueControlReferences)
      ? state.recentQueueControlReferences
      : [];
    state.recentQueueControlReferences = [
      ...previousReferences.filter((item) => safeTrim(item?.executionId) !== id),
      reference,
    ].slice(-4);
    state.lastQueueControlReference = {
      ...reference,
      recentExecutionIds: state.recentQueueControlReferences
        .map((item) => safeTrim(item?.executionId))
        .filter(Boolean),
    };
  }

  function applyNaturalLanguageQueueControl(message, options = {}, command = null) {
    command = command || parseNaturalLanguageQueueControl(message, executionStore, state.lastQueueControlReference);
    if (!command) {
      return null;
    }
    archivePendingExecutionControlClarificationCards(
      "\u5df2\u6536\u5230\u660e\u786e\u7684\u6392\u961f\u4efb\u52a1\u6307\u4ee4\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
    );
    archivePendingQueueTitleClarificationCards(
      "\u5df2\u6536\u5230\u65b0\u7684\u6392\u961f\u4efb\u52a1\u6307\u4ee4\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
    );
    state.pendingExecutionControlClarification = null;
    state.pendingQueueTitleClarification = null;
    const action = command.action;
    if (action === "clarify") {
      const candidates = Array.isArray(command.candidates) ? command.candidates : [];
      const reply = queueControlTitleReferenceClarificationReply(candidates);
      const clarificationCard = queueTitleClarificationCard(command);
      state.pendingQueueTitleClarification = {
        action: "move",
        requestedAction: safeTrim(command.requestedAction) || "move",
        targetIndex: Math.max(0, Number(command.targetIndex) || 0),
        candidates: normalizeQueueTitleClarificationCandidates(candidates),
      };
      state.lastUserMessage = safeTrim(message);
      state.lastError = null;
      state.lastWarnings = [];
      state.lastResponse = {
        reply,
        actions: [],
        queueControl: {
          action: "clarify",
          requestedAction: safeTrim(command.requestedAction) || "move",
          status: "needs_clarification",
          targetIndex: Math.max(0, Number(command.targetIndex) || 0),
          candidates,
        },
      };
      state.status = "done_no_actions";
      state.streaming = false;
      state.setPendingActions([]);
      state.messages.push({ role: "user", content: state.lastUserMessage });
      state.messages.push({
        role: "assistant",
        content: reply,
        kind: "queue_control",
        queueControl: state.lastResponse.queueControl,
        cards: [clarificationCard],
      });
      state.lastReceipt = reply;
      state.lastReceiptDetails = state.lastResponse.queueControl;
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, {
          role: "user",
          content: state.lastUserMessage,
          status: "done",
        });
        conversationStore.appendMessage?.(state.conversationId, {
          role: "assistant",
          content: reply,
          status: "done",
          kind: "queue_control",
          queueControl: state.lastResponse.queueControl,
          cards: [clarificationCard],
        });
      }
      notifyUpdate(options);
      return state.lastResponse;
    }
    if (action === "cancel_all") {
      const cancelled = [];
      if (typeof executionStore?.cancelQueuedExecution === "function") {
        for (const item of Array.isArray(command.executions) ? command.executions : []) {
          const itemId = safeTrim(item?.id);
          if (!itemId) {
            continue;
          }
          const next = executionStore.cancelQueuedExecution(itemId);
          if (next) {
            cancelled.push(next);
          }
        }
      }
      const ids = cancelled.map((item) => safeTrim(item?.id)).filter(Boolean);
      const reply = ids.length
        ? `\u5df2\u53d6\u6d88 ${ids.length} \u4e2a\u6392\u961f\u4efb\u52a1\u3002`
        : "\u6ca1\u6709\u627e\u5230\u53ef\u64cd\u4f5c\u7684\u6392\u961f\u4efb\u52a1\u3002";
      if (
        ids.length &&
        resolvedExecutionSyncClient &&
        typeof resolvedExecutionSyncClient.controlQueuedExecution === "function"
      ) {
        state.lastExecutionSyncPromise = Promise.all(
          ids.map((itemId) => resolvedExecutionSyncClient.controlQueuedExecution(itemId, "cancel"))
        ).catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution queue control sync failed";
        });
      }
      state.lastUserMessage = safeTrim(message);
      state.lastError = null;
      state.lastWarnings = [];
      state.lastResponse = {
        reply,
        actions: [],
        queueControl: {
          action: "cancel_all",
          executionIds: ids,
        },
      };
      state.status = "done_no_actions";
      state.streaming = false;
      state.setPendingActions([]);
      state.messages.push({ role: "user", content: state.lastUserMessage });
      state.messages.push({
        role: "assistant",
        content: reply,
        kind: "queue_control",
        queueControl: state.lastResponse.queueControl,
      });
      state.lastReceipt = reply;
      state.lastReceiptDetails = state.lastResponse.queueControl;
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, {
          role: "user",
          content: state.lastUserMessage,
          status: "done",
        });
        conversationStore.appendMessage?.(state.conversationId, {
          role: "assistant",
          content: reply,
          status: "done",
          kind: "queue_control",
          queueControl: state.lastResponse.queueControl,
        });
      }
      notifyUpdate(options);
      return state.lastResponse;
    }
    if (action === "reorder") {
      const orderedIds = Array.isArray(command.orderedIds) ? command.orderedIds.map(safeTrim).filter(Boolean) : [];
      const reordered =
        orderedIds.length >= 2 && typeof executionStore?.reorderQueuedExecutions === "function"
          ? executionStore.reorderQueuedExecutions(orderedIds)
          : [];
      const reorderedIds = Array.isArray(reordered) ? reordered.map((item) => safeTrim(item?.id)).filter(Boolean) : [];
      const referenceExecutionIds = Array.isArray(command.referenceExecutionIds)
        ? command.referenceExecutionIds.map(safeTrim).filter(Boolean)
        : [];
      const reply = reorderedIds.length
        ? `\u5df2\u91cd\u6392 ${reorderedIds.length} \u4e2a\u6392\u961f\u4efb\u52a1\u3002`
        : "\u6ca1\u6709\u627e\u5230\u53ef\u64cd\u4f5c\u7684\u6392\u961f\u4efb\u52a1\u3002";
      const syncId = orderedIds[0] || reorderedIds[0] || "";
      if (
        reorderedIds.length &&
        syncId &&
        resolvedExecutionSyncClient &&
        typeof resolvedExecutionSyncClient.controlQueuedExecution === "function"
      ) {
        state.lastExecutionSyncPromise = Promise.resolve()
          .then(() => resolvedExecutionSyncClient.controlQueuedExecution(syncId, "reorder", { orderedIds }))
          .catch((error) => {
            state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution queue control sync failed";
          });
      }
      state.lastUserMessage = safeTrim(message);
      state.lastError = null;
      state.lastWarnings = [];
      state.lastResponse = {
        reply,
        actions: [],
        queueControl: {
            action: "reorder",
            orderedIds,
            ...(command.referenceSource ? { referenceSource: command.referenceSource } : {}),
            ...(referenceExecutionIds.length ? { executionIds: referenceExecutionIds } : {}),
          },
      };
      state.status = "done_no_actions";
      state.streaming = false;
      state.setPendingActions([]);
      state.messages.push({ role: "user", content: state.lastUserMessage });
      state.messages.push({
        role: "assistant",
        content: reply,
        kind: "queue_control",
        queueControl: state.lastResponse.queueControl,
      });
      state.lastReceipt = reply;
      state.lastReceiptDetails = state.lastResponse.queueControl;
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, {
          role: "user",
          content: state.lastUserMessage,
          status: "done",
        });
        conversationStore.appendMessage?.(state.conversationId, {
          role: "assistant",
          content: reply,
          status: "done",
          kind: "queue_control",
          queueControl: state.lastResponse.queueControl,
        });
      }
      if (reorderedIds.length && referenceExecutionIds.length) {
        for (const referenceId of referenceExecutionIds) {
          const execution =
            reordered.find((item) => safeTrim(item?.id) === referenceId) ||
            (Array.isArray(command.queue)
              ? command.queue.find((item) => safeTrim(item?.id) === referenceId)
              : null);
          rememberQueueControlReference(execution, "move");
        }
      }
      notifyUpdate(options);
      return state.lastResponse;
    }
    const execution = command.execution;
    const id = safeTrim(execution?.id);
    let result = null;
    let syncAction = action;
    let syncPayload = undefined;
    if (id && action === "cancel" && typeof executionStore?.cancelQueuedExecution === "function") {
      result = executionStore.cancelQueuedExecution(id);
    } else if (id && action === "top" && typeof executionStore?.moveQueuedExecutionToTop === "function") {
      result = executionStore.moveQueuedExecutionToTop(id);
    } else if (id && action === "move" && typeof executionStore?.moveQueuedExecutionToIndex === "function") {
      result = executionStore.moveQueuedExecutionToIndex(id, command.targetIndex);
      syncAction = "move";
      syncPayload = { targetIndex: Math.max(0, Number(command.targetIndex) || 0) };
    } else if (id && action === "pause" && typeof executionStore?.pauseQueuedExecution === "function") {
      result = executionStore.pauseQueuedExecution(id);
    } else if (id && action === "resume" && typeof executionStore?.resumeQueuedExecution === "function") {
      result = executionStore.resumeQueuedExecution(id);
      syncAction = "resume";
    }
    const reply = result
      ? queueControlReply(action, result)
      : "\u6ca1\u6709\u627e\u5230\u53ef\u64cd\u4f5c\u7684\u6392\u961f\u4efb\u52a1\u3002";
    if (result) {
      rememberQueueControlReference(result, action);
    }
    if (
      result &&
      resolvedExecutionSyncClient &&
      typeof resolvedExecutionSyncClient.controlQueuedExecution === "function"
    ) {
      state.lastExecutionSyncPromise = Promise.resolve()
        .then(() => resolvedExecutionSyncClient.controlQueuedExecution(id, syncAction, syncPayload))
        .catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution queue control sync failed";
        });
    }
    state.lastUserMessage = safeTrim(message);
    state.lastError = null;
    state.lastWarnings = [];
    state.lastResponse = {
      reply,
      actions: [],
      queueControl: result
        ? {
            action: syncAction,
            executionId: id,
            title: queueControlExecutionTitle(result),
            ...(command.referenceSource ? { referenceSource: command.referenceSource } : {}),
            ...(syncPayload || {}),
          }
        : {
            action,
            executionId: "",
          },
    };
    state.status = "done_no_actions";
    state.streaming = false;
    state.setPendingActions([]);
    state.messages.push({ role: "user", content: state.lastUserMessage });
    state.messages.push({
      role: "assistant",
      content: reply,
      kind: "queue_control",
      queueControl: state.lastResponse.queueControl,
    });
    state.lastReceipt = reply;
    state.lastReceiptDetails = state.lastResponse.queueControl;
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, {
        role: "user",
        content: state.lastUserMessage,
        status: "done",
      });
      conversationStore.appendMessage?.(state.conversationId, {
        role: "assistant",
        content: reply,
        status: "done",
        kind: "queue_control",
        queueControl: state.lastResponse.queueControl,
      });
    }
    notifyUpdate(options);
    return state.lastResponse;
  }

  async function applyNaturalLanguageActiveExecutionControl(message, options = {}, command = null) {
    command = command || parseNaturalLanguageActiveExecutionControl(message, executionStore);
    if (!command) {
      return null;
    }
    archivePendingExecutionControlClarificationCards(
      "\u5df2\u6536\u5230\u660e\u786e\u7684\u5f53\u524d\u4efb\u52a1\u6307\u4ee4\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
    );
    archivePendingQueueTitleClarificationCards(
      "\u5df2\u6536\u5230\u660e\u786e\u7684\u5f53\u524d\u4efb\u52a1\u6307\u4ee4\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
    );
    state.pendingExecutionControlClarification = null;
    state.pendingQueueTitleClarification = null;
    const action = command.action;
    const execution = command.execution;
    const id = safeTrim(execution?.id);
    let result = null;
    let reply = "\u6ca1\u6709\u627e\u5230\u53ef\u64cd\u4f5c\u7684\u5f53\u524d\u4efb\u52a1\u3002";
    const orchestrator = state.executionOrchestrator;
    if (id && action === "cancel" && typeof orchestrator?.cancel === "function") {
      result = await orchestrator.cancel(id, {
        agentMode: state.agentMode,
        videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
      });
      reply = activeExecutionControlReply(action, execution);
    } else if (id && action === "cancel" && typeof executionStore?.updateStatus === "function") {
      result = executionStore.updateStatus(id, "cancelled", {
        orchestratorState: { nextActionIndex: 0, pausedAtActionId: "", running: false },
        drawerState: { visible: true, line2: "\u5df2\u53d6\u6d88\u5f53\u524d\u4efb\u52a1" },
      });
      reply = activeExecutionControlReply(action, execution);
    } else if (id && action === "pause" && execution?.status !== "executing") {
      reply = "\u5f53\u524d\u4efb\u52a1\u4e0d\u5728\u6267\u884c\u4e2d\uff0c\u65e0\u6cd5\u6682\u505c\u3002";
    } else if (id && action === "resume" && execution?.status !== "paused") {
      reply = "\u5f53\u524d\u4efb\u52a1\u672a\u6682\u505c\uff0c\u65e0\u9700\u7ee7\u7eed\u3002";
    } else if (id && action === "pause" && typeof orchestrator?.pause === "function") {
      result = orchestrator.pause(id);
      reply = activeExecutionControlReply(action, execution);
    } else if (id && action === "resume" && typeof orchestrator?.resume === "function") {
      result = await orchestrator.resume(id, {
        agentMode: state.agentMode,
        videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
      });
      reply = activeExecutionControlReply(action, execution);
    } else if (id) {
      reply = "\u5f53\u524d\u4efb\u52a1\u6682\u65f6\u65e0\u6cd5\u6267\u884c\u8fd9\u4e2a\u63a7\u5236\u3002";
    }
    state.lastUserMessage = safeTrim(message);
    state.lastError = null;
    state.lastWarnings = [];
    state.lastResponse = {
      reply,
      actions: [],
      executionControl: {
        action,
        executionId: result ? id : "",
        status: safeTrim(result?.status),
      },
    };
    state.status = "done_no_actions";
    state.streaming = false;
    state.setPendingActions([]);
    state.messages.push({ role: "user", content: state.lastUserMessage });
    state.messages.push({ role: "assistant", content: reply, kind: "execution_control" });
    state.lastReceipt = reply;
    state.lastReceiptDetails = state.lastResponse.executionControl;
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, {
        role: "user",
        content: state.lastUserMessage,
        status: "done",
      });
      conversationStore.appendMessage?.(state.conversationId, {
        role: "assistant",
        content: reply,
        status: "done",
      });
    }
    notifyUpdate(options);
    return state.lastResponse;
  }

  function applyNaturalLanguageAmbiguousExecutionControl(message, options = {}, command = null) {
    command = command || parseNaturalLanguageAmbiguousExecutionControl(message, executionStore);
    if (!command) {
      return null;
    }
    archivePendingExecutionControlClarificationCards();
    archivePendingQueueTitleClarificationCards();
    state.pendingQueueTitleClarification = null;
    const reply = ambiguousExecutionControlReply(command);
    state.pendingExecutionControlClarification = {
      action: command.action,
      all: Boolean(command.all),
      activeExecutionId: command.activeExecutionId,
      queueCount: command.queueCount,
    };
    state.lastUserMessage = safeTrim(message);
    state.lastError = null;
    state.lastWarnings = [];
    state.lastResponse = {
      reply,
      actions: [],
      executionControl: {
        action: "clarify",
        requestedAction: command.action,
        status: "needs_clarification",
        activeExecutionId: command.activeExecutionId,
        queueCount: command.queueCount,
      },
    };
    state.status = "done_no_actions";
    state.streaming = false;
    state.setPendingActions([]);
    const clarificationCard = executionControlClarificationCard(command);
    state.messages.push({ role: "user", content: state.lastUserMessage });
    state.messages.push({
      role: "assistant",
      content: reply,
      kind: "execution_control",
      cards: [clarificationCard],
    });
    state.lastReceipt = reply;
    state.lastReceiptDetails = state.lastResponse.executionControl;
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, {
        role: "user",
        content: state.lastUserMessage,
        status: "done",
      });
      conversationStore.appendMessage?.(state.conversationId, {
        role: "assistant",
        content: reply,
        status: "done",
        kind: "execution_control",
        cards: [clarificationCard],
      });
    }
    notifyUpdate(options);
    return state.lastResponse;
  }

  async function applyPendingExecutionControlClarification(message, options = {}, clarification = null) {
    clarification =
      clarification || parsePendingExecutionControlClarification(message, state.pendingExecutionControlClarification);
    if (!clarification) {
      return null;
    }
    completeExecutionControlClarificationCard(clarification.target);
    if (clarification.target === "active") {
      return await applyNaturalLanguageActiveExecutionControl(message, options, {
        action: clarification.action,
        execution: activeExecutionControlExecution(executionStore),
        text: clarification.text,
      });
    }
    if (clarification.target === "queue") {
      return applyNaturalLanguageQueueControl(
        message,
        options,
        clarifiedQueueControlCommand(clarification, executionStore)
      );
    }
    return null;
  }

  function applyPendingQueueTitleClarification(message, options = {}, clarification = null) {
    clarification =
      clarification || parsePendingQueueTitleClarification(message, state.pendingQueueTitleClarification);
    if (!clarification) {
      return null;
    }
    completeQueueTitleClarificationCard(clarification.selectedCandidate);
    state.pendingQueueTitleClarification = null;
    return applyNaturalLanguageQueueControl(
      message,
      options,
      clarifiedQueueTitleControlCommand(clarification, executionStore)
    );
  }

  // The heavy-brain front entry: wakes the QMAI headless pipeline in
  // the background and polls the job (the panel has no generic HTTP
  // polling helper - this is a plain sleep-loop, 2s cadence, 5min
  // cap). On success the knowledge projection cache is invalidated
  // and the last director plan is recompiled against the fresh
  // judgment.
  async function applyDirectorRefreshCommand(message, options) {
    state.lastUserMessage = message;
    state.status = "streaming";
    state.streaming = true;
    state.messages.push({ role: "user", content: message });
    notifyUpdate(options);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const finish = (content, status = "done_no_actions") => {
      state.streaming = false;
      state.status = status;
      state.messages.push({ role: "assistant", content, kind: "director_refresh" });
      state.lastReceipt = content;
      notifyUpdate(options);
      return null;
    };
    let started = null;
    try {
      started = await api.directorRefresh({});
    } catch (error) {
      return finish(`导演判断刷新失败：${safeTrim(error?.message) || error}`, "error");
    }
    if (!started || started.success === false || !started.jobId) {
      return finish(`导演判断刷新失败：${safeTrim(started?.error) || "未知错误"}`, "error");
    }
    if (started.alreadyRunning) {
      state.lastReceipt = "导演判断刷新已在进行中,继续等待…";
      notifyUpdate(options);
    }
    const deadline = Date.now() + 10 * 60 * 1000; // B5: 5->10min - sequential decompose of a large plan can exceed 5min on slow grsai
    let status = null;
    while (Date.now() < deadline) {
      await sleep(2000);
      try {
        status = await api.directorRefreshStatus(started.jobId);
      } catch {
        continue;
      }
      const lastPhase = Array.isArray(status?.progress) && status.progress.length
        ? safeTrim(status.progress[status.progress.length - 1]?.phase)
        : "";
      if (lastPhase) {
        state.lastReceipt = `导演思考中：${lastPhase}`;
        notifyUpdate(options);
      }
      if (status && status.status && status.status !== "running") break;
    }
    if (!status || status.status !== "done") {
      const reason = safeTrim(status?.error) || (status?.status === "not-found" ? "任务已丢失(服务可能重启)" : "等待超时");
      return finish(`导演判断刷新未完成：${reason}`, "error");
    }
    // Fresh judgment -> refetch the knowledge projection next message.
    state.directorKnowledgeFetchStarted = false;
    state.directorKnowledgeCards = [];
    const replanMessage = safeTrim(state.lastDirectorPlanMessage);
    if (replanMessage && typeof api.directorPlan === "function") {
      finish("导演判断已更新,正在按新判断重排…");
      return await applyDirectorPlanCommand(`导演: ${replanMessage}`, options, { message: replanMessage });
    }
    return finish("导演判断已更新。发送「导演: <目标>」即可按新判断编排画布。");
  }

  async function applyDirectorPlanCommand(message, options, command) {
    state.lastUserMessage = message;
    state.status = "streaming";
    state.streaming = true;
    notifyUpdate(options);
    let response = null;
    try {
      // The ear downlink: the explicit director-prefix is the lane
      // decision; the intent carries the goal + flowId into the QMAI
      // inbox via the plan runner.
      let intent = null;
      try {
        intent = buildDirectorIntent({
          userMessage: command.message,
          lane: "director",
          laneReason: "用户使用导演前缀显式选择导演道",
          flowId: `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        });
      } catch {
        intent = null;
      }
      response = await api.directorPlan({ message: command.message, ...(intent ? { intent } : {}) });
      if (response && response.directorFlowId) {
        state.lastDirectorFlowId = safeTrim(response.directorFlowId);
      }
    } catch (error) {
      response = { success: false, error: String((error && error.message) || error) };
    }
    state.streaming = false;
    if (!response || response.success === false) {
      state.status = "error";
      state.lastReceipt = `导演计划失败：${safeTrim(response?.error) || "未知错误"}`;
      notifyUpdate(options);
      return null;
    }
    state.status = "done_no_actions";
    state.lastResponse = response;
    state.lastDirectorPlanMessage = command.message;
    const stalenessLine = formatDirectorJudgmentAge(response.artifactsGeneratedAt);
    const reply = `${safeTrim(response.reply) || "导演计划已生成。"}${stalenessLine ? ` ${stalenessLine}` : ""}`;
    state.messages.push({ role: "user", content: message });
    state.messages.push({ role: "assistant", content: reply, kind: "director_plan" });
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
      conversationStore.appendMessage?.(state.conversationId, {
        role: "assistant",
        content: reply,
        status: "done",
        kind: "director_plan",
      });
    }
    const storedExecution = recordAssistantExecutionFromResponse(response, message);
    if (storedExecution?.id) {
      // Mark this execution as director-originated so the executor
      // grants the trusted-writer source for lineage fields.
      if (!(state.directorExecutionIds instanceof Set)) state.directorExecutionIds = new Set();
      state.directorExecutionIds.add(String(storedExecution.id));
    }
    state.lastReceipt = reply;
    notifyUpdate(options);
    return response;
  }

  // The ViMax director lane (α′ F6). plan is async: POST returns a
  // jobId, poll until done, map the shotplan to canvas actions, then
  // wrap them in an execution-contract response so the SAME confirmation
  // gate + orchestrator as every other lane applies (H3). The mapped
  // prep nodes are autoStart:false, so nothing self-ignites; the
  // execution id is marked vimax-trusted so the executor grants the
  // lineage write source. ViMax stays fully decoupled - the only
  // coupling is this bridge call + the shotplan contract.
  // Render one native progress entry as a human "思考可见" receipt. Native
  // entries are objects ({type:"step",stage,payload} | {type:"warn",message}),
  // unlike the external lane's {phase} strings. (B2)
  function nativeStepReceipt(ev) {
    if (!ev || typeof ev !== "object") return "";
    if (ev.type === "warn") {
      const m = safeTrim(ev.message);
      return m ? `提示:${m}` : "";
    }
    if (ev.type !== "step") return "";
    const p = ev.payload || {};
    if (ev.stage === "story") return "故事成型";
    if (ev.stage === "characters") return `角色 ${Array.isArray(p.characters) ? p.characters.length : 0} 位`;
    if (ev.stage === "scene") {
      const n = Number(p.sceneIdx);
      const shots = Array.isArray(p.shots) ? p.shots.length : 0;
      return `场景 ${Number.isFinite(n) ? n + 1 : "?"} 分镜(${shots} 镜)`;
    }
    return safeTrim(ev.stage);
  }

  // Shared finalize for the native plan lane: a completed vimax-shotplan/v1 ->
  // canvas actions -> execution-contract + confirm gate + 成片 staging + trusted
  // lineage. (`native` kept for the receipt label; the external lane was retired
  // in C5.2 so it is always true in practice.)
  function finalizeVimaxPlan({ flowId, command, message, result, native = false, extraNote = "" }) {
    let actions = [];
    try {
      actions = (mapVimaxShotplanToCanvasActions({ shotplan: result }).actions) || [];
    } catch (error) {
      return { error: `分镜映射失败：${safeTrim(error?.message) || error}` };
    }
    if (!actions.length) {
      return { error: "分镜为空" };
    }
    const shotCount = Array.isArray(result.shots) ? result.shots.length : 0;
    const refs = Array.isArray(command.skillRefs) ? command.skillRefs : [];
    const shotIdxs = (result.shots || []).map((s) => s.idx).filter((i) => Number.isFinite(i));
    // A new plan flow begins: drop any portraits staging left over from a
    // PREVIOUS flow, or a later 确认定妆 would sign a budget and land portraits
    // on the old flow's nodes while the user is looking at this one (B0-M2).
    state.pendingVimaxPortraits = null;
    state.lastVimaxPlan = {
      flowId,
      characters: (result.characters || [])
        .map((c) => ({
          idx: Number(c?.idx),
          identifier: safeTrim(c?.identifierInScene || c?.identifier),
          isVisible: c?.isVisible !== false,
        }))
        .filter((c) => Number.isFinite(c.idx)),
    };
    let reply = `ViMax${native ? "(原生)" : ""} 已规划 ${shotCount} 镜${refs.length ? `(拍法:${refs.join("、")})` : ""}。`;
    if (command.wantsFilm && shotIdxs.length) {
      state.pendingVimaxRender = { flowId, shotIdxs, skillRefs: refs };
      reply += ` 在画布上改好提示词后,回复「确认成片」开始渲染(每镜 1 帧关键帧,预算封顶 ${shotIdxs.length} 次出图)。`;
    } else {
      state.pendingVimaxRender = null;
    }
    if (extraNote) reply += extraNote;
    // Execution-contract shape: recordAssistantExecutionFromResponse
    // keys on plan/actionsByStep/execution (hasAssistantExecutionContract).
    const planResponse = {
      plan: { id: flowId, title: command.body, steps: [{ id: "step_layout" }] },
      actionsByStep: { step_layout: actions },
      execution: { title: command.body },
      reply,
      vimaxFlowId: flowId,
    };
    state.status = "done_no_actions";
    state.lastResponse = planResponse;
    state.lastVimaxPlanMessage = command.body;
    state.messages.push({ role: "user", content: message });
    state.messages.push({ role: "assistant", content: reply, kind: "vimax_plan" });
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
      conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: reply, status: "done", kind: "vimax_plan" });
    }
    const storedExecution = recordAssistantExecutionFromResponse(planResponse, message);
    if (storedExecution?.id) {
      // Trusted-writer source for the lineage fields - keyed by exec id,
      // never inferred from action contents.
      if (!(state.vimaxExecutionIds instanceof Set)) state.vimaxExecutionIds = new Set();
      state.vimaxExecutionIds.add(String(storedExecution.id));
    }
    return { planResponse, reply };
  }

  // Land brain step-events (story/cast cards) onto the canvas DURING the native
  // poll, through the trusted action pipeline: mint a per-(flowId,label)
  // executionId into vimaxExecutionIds + stamp source:"vimax-director" so claw
  // stamps the trusted lineage. Best-effort: a failure returns false (the poll
  // loop continues), never throws.
  // Generic trusted-landing primitive (Phase D · D2, §F-D2). The lineage tag a
  // provider's actions carry to claw is resolved HERE from the static trust
  // policy keyed on providerId (R5: never from a runtime string a provider/LLM
  // supplies). providerId must come from a registered provider (panel-controlled
  // code), never from a user message. An unregistered / reserved id => reject,
  // no land. trustedExecutions is the single panel-controlled source of truth.
  async function landTrustedActions(actions, providerId, executionId) {
    const lineage = lineageForProvider(providerId);
    if (!lineage) {
      state.lastReceipt = "未注册的来源,拒绝落地";
      return false;
    }
    if (!Array.isArray(actions) || !actions.length) return false;
    if (!api || typeof api.validateActions !== "function") return false;
    const execId = String(executionId);
    if (!(state.trustedExecutions instanceof Map)) state.trustedExecutions = new Map();
    state.trustedExecutions.set(execId, lineage);
    try {
      const validation = await api.validateActions({ actions, context: state.lastContext, executionId: execId });
      const ok = validation && (validation.success === true || validation.valid === true) && Array.isArray(validation.actions);
      if (!ok) return false;
      const payload = {
        actions: validation.actions,
        executionId: execId,
        source: lineage,
        graphStore,
        agentMode: state.agentMode,
      };
      if (templateStore) payload.templateStore = templateStore;
      if (canvasSkillsRuntime) payload.canvasSkillsRuntime = canvasSkillsRuntime;
      await executeActions(payload);
      return true;
    } catch (error) {
      // non-fatal: the storyboard still lands at done; surface as a soft note
      state.lastReceipt = `增量落地提示：${safeTrim(error?.message) || error}`;
      return false;
    }
  }

  // B3a's ViMax incremental landing is now a thin wrapper over the generic
  // primitive (providerId "vimax" -> static lineage "vimax-director").
  async function landTrustedVimaxActions(flowId, actions, label) {
    return landTrustedActions(actions, "vimax", `vimax-native-${flowId}-${label}`);
  }

  async function applyVimaxNativePlanCommand(message, options, command) {
    state.lastUserMessage = message;
    state.status = "streaming";
    state.streaming = true;
    notifyUpdate(options);
    const flowId = `vimax-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let started = null;
    try {
      started = await api.vimaxNativePlan({
        flowId,
        idea: command.body,
        userRequirement: "",
        style: "",
        skillRefs: Array.isArray(command.skillRefs) ? command.skillRefs : [],
        // B3b: pause after characters so the user can edit the cast before
        // decomposition. The orchestrator returns status:"paused"; the poll
        // below stashes pendingVimaxNativeResume and waits for 「继续」.
        steer: true,
      });
    } catch (error) {
      return failVimaxNative(options, safeTrim(error?.message) || String(error));
    }
    if (!started || started.success === false || !started.jobId) {
      if (started?.status === "busy") return failVimaxNative(options, "原生编排器繁忙(并发上限),请稍后重试");
      if (started?.status === "not-configured") return failVimaxNative(options, "原生编排器未配置 grsai 凭据");
      return failVimaxNative(options, safeTrim(started?.error) || "未知错误");
    }
    return await pollVimaxNative(started.jobId, flowId, command, message, options, { since: 0, landedStages: new Set() });
  }

  function failVimaxNative(options, reason) {
    state.streaming = false;
    state.status = "error";
    state.lastReceipt = `ViMax(原生)规划失败：${reason}`;
    notifyUpdate(options);
    return null;
  }

  // Poll a native job to a terminal/paused state, landing story+cast cards
  // incrementally (trusted, once each via `landedStages`). On `paused` -> stash
  // pendingVimaxNativeResume + prompt and STOP (the user edits the cast, then
  // 「继续」). On `done` -> finalize (storyboard + 成片 staging). `pollState`
  // ({since, landedStages}) is threaded across the pause so resume continues
  // the cursor and never re-lands story/cast. (B3a + B3b)
  // D4: turn a B3 pause into a living `status:"paused"` interaction card — step
  // progress (story✓/cast✓/storyboard⏸) + inline [继续]/[取消] chips that dispatch
  // the SAME 继续/取消 commands as typing them (single pending source, one handler;
  // the dispatch gate routes 继续/取消 to applyVimaxNativeResumeCommand).
  function buildVimaxPausedCard(flowId, reply, landedStages) {
    const landed = landedStages instanceof Set ? landedStages : new Set(landedStages || []);
    const steps = ["story", "cast", "storyboard"].map((stage) => ({
      stage,
      status: stage !== "storyboard" && landed.has(stage) ? "landed" : "pending",
    }));
    return updateInteractionCardStatus(
      createInteractionCard({ id: `vimax-${flowId}-paused`, status: "paused" }),
      {
        title: LAUNCH_STRINGS.pausedTitle,
        summary: reply,
        expanded: true,
        pausedReason: "wait-cast-edit",
        steps,
        options: [
          { id: "resume", label: LAUNCH_STRINGS.resumeLabel, aria: LAUNCH_STRINGS.resumeAria, command: "继续" },
          { id: "cancel", label: LAUNCH_STRINGS.cancelLabel, aria: LAUNCH_STRINGS.cancelAria, command: "取消" },
        ],
      }
    );
  }

  async function pollVimaxNative(jobId, flowId, command, message, options, pollState) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const deadline = Date.now() + 10 * 60 * 1000; // B5: 5->10min - sequential decompose of a large plan can exceed 5min on slow grsai
    let status = null;
    let since = Number(pollState?.since) || 0;
    const landedStages = pollState?.landedStages instanceof Set ? pollState.landedStages : new Set();
    while (Date.now() < deadline) {
      await sleep(2000);
      try {
        status = await api.vimaxNativeJob(jobId, since);
      } catch {
        continue;
      }
      if (Array.isArray(status?.progress) && status.progress.length) {
        const phase = nativeStepReceipt(status.progress[status.progress.length - 1]);
        if (phase) {
          state.lastReceipt = `ViMax(原生)规划中：${phase}`;
          notifyUpdate(options);
        }
        for (const ev of status.progress) {
          if (!ev || ev.type !== "step") continue;
          if (ev.stage === "story" && !landedStages.has("story")) {
            landedStages.add("story");
            await landTrustedVimaxActions(flowId, mapVimaxStoryToCanvasActions({ flowId, story: ev.payload?.story }).actions, "story");
          } else if (ev.stage === "characters" && !landedStages.has("cast")) {
            landedStages.add("cast");
            await landTrustedVimaxActions(flowId, mapVimaxCastToCanvasActions({ flowId, characters: ev.payload?.characters || [] }).actions, "cast");
          }
        }
      }
      if (Number.isFinite(Number(status?.progressTotal))) since = Number(status.progressTotal);
      if (status && status.status && status.status !== "running") break;
    }
    // B3b: paused after the cast - wait for 「继续」 (the user reviews/edits the
    // cast sheet on the canvas). Free the lane while they think.
    if (status && status.status === "paused") {
      state.streaming = false;
      state.pendingVimaxNativeResume = { jobId, flowId, command, message, since, landedStages: [...landedStages] };
      const reply = "已生成故事 + 角色表(已落画布)。改好角色表后回复「继续」开始分镜,或回复「取消」。";
      const pausedCard = buildVimaxPausedCard(flowId, reply, landedStages);
      state.messages.push({ role: "assistant", content: reply, kind: "vimax_plan", cards: [pausedCard] });
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: reply, status: "done", kind: "vimax_plan", cards: [pausedCard] });
      }
      state.lastReceipt = reply;
      notifyUpdate(options);
      return { reply, vimaxFlowId: flowId };
    }
    state.streaming = false;
    // D7: consume the film shot-count stash EXACTLY ONCE at completion — clear it
    // up front (success OR failure) so a failed plan never leaves a stale id that
    // a later unrelated done could mis-attribute the shot count to.
    const launchContractCardId = state.pendingLaunchContractCardId;
    state.pendingLaunchContractCardId = null;
    if (!status || status.status !== "done" || !status.result) {
      const reason = safeTrim(status?.error) || (status?.status === "not-found" ? "任务已丢失(服务可能重启)" : "等待超时");
      return failVimaxNative(options, reason);
    }
    const extraNote = safeTrim(status.persistError)
      ? "（注意:工作目录落盘失败,成片/定妆前需重新规划）"
      : "";
    const finalized = finalizeVimaxPlan({ flowId, command, message, result: status.result, native: true, extraNote });
    if (finalized.error) return failVimaxNative(options, finalized.error);
    updateLaunchContractShotCount(launchContractCardId, status.result); // D7: 约N → real shot count
    state.lastReceipt = finalized.reply;
    notifyUpdate(options);
    return finalized.planResponse;
  }

  // B3b: 「继续」/「取消」 the paused native plan. Gated on pendingVimaxNativeResume
  // (dispatched before parseVimaxCommand, so a normal-prose 继续 is never
  // hijacked). 「继续」 reads the (edited) cast sheet, parses it, and resumes
  // phase2 against it; an unparseable cast is NOT silently dropped (canvas
  // authority) - it keeps pending and asks the user to fix it.
  async function applyVimaxNativeResumeCommand(message, options) {
    const pending = state.pendingVimaxNativeResume;
    const isCancel = /取消/.test(message);
    state.lastUserMessage = message;
    state.messages.push({ role: "user", content: message });
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
    }
    if (isCancel) {
      try { await api.vimaxNativeCancel(pending.jobId); } catch { /* best-effort */ }
      state.pendingVimaxNativeResume = null;
      state.status = "done_no_actions";
      state.lastReceipt = "已取消原生规划。";
      notifyUpdate(options);
      return { reply: state.lastReceipt };
    }
    // Use graphNodes() (handles the real store's getState().nodes) - a bare
    // graphStore.nodes is undefined on the real app store, which silently made
    // castNode null -> resume never fired (only surfaced in real-browser e2e;
    // the B3b unit test's fake graphStore happened to expose .nodes directly).
    // Lineage fields (vimaxRole/vimaxFlowId) are stripped off the landed comment
    // card on store insert (Bug 2 — instrumented: graphNodes() returned the cast
    // card but with no data.vimaxRole). So on the real store the deterministic node
    // id `vimax-${flowId}-cast` is the ONLY live carrier — match on it first. The
    // role/flow branch below is belt-and-suspenders that only fires for test fakes /
    // bare-.nodes stores which preserve data; do NOT delete the id branch thinking
    // the data branch covers production. Id-first is safe here even though
    // findVimaxPrepNodeId (below) deliberately distrusts the id: prep nodes are AI
    // nodes remapped to a fresh id by the canvas-skills create path, whereas
    // cast/story are `comment` nodes that land via the plain executor, which
    // preserves action.id end-to-end.
    const expectCastId = `vimax-${pending.flowId}-cast`;
    const castNode = graphNodes().find((n) => {
      if (n?.id === expectCastId) return true;
      const role = n?.data?.vimaxRole !== undefined ? n.data.vimaxRole : n?.vimaxRole;
      const flow = n?.data?.vimaxFlowId !== undefined ? n.data.vimaxFlowId : n?.vimaxFlowId;
      return role === "cast" && flow === pending.flowId;
    });
    const castContent = castNode?.data?.content !== undefined ? castNode.data.content : (castNode?.content || "");
    const edited = castContentToCharacters(castContent || "");
    if (!edited.length) {
      // No silent fallback (canvas authority): never decompose against a cast
      // the user didn't approve. Keep pending so they can fix + retry.
      state.lastReceipt = "未从角色表解析出角色,请检查格式(每个【角色 N】下 静态:/动态:/出镜:)后再回复「继续」。";
      notifyUpdate(options);
      return { reply: state.lastReceipt };
    }
    let started = null;
    try {
      started = await api.vimaxNativeResume(pending.jobId, edited);
    } catch (error) {
      state.lastReceipt = `继续失败：${safeTrim(error?.message) || error}`;
      state.status = "error";
      notifyUpdate(options);
      return null;
    }
    if (!started || started.success === false) {
      const s = started?.status;
      state.pendingVimaxNativeResume = null;
      state.lastReceipt = s === "not-found"
        ? "任务已过期,请重新「导演:」规划。"
        : `继续失败：${safeTrim(started?.error) || s || "未知"}`;
      state.status = "error";
      notifyUpdate(options);
      return null;
    }
    const { jobId, flowId, command, message: origMessage, since, landedStages } = pending;
    state.pendingVimaxNativeResume = null;
    state.status = "streaming";
    state.streaming = true;
    notifyUpdate(options);
    return await pollVimaxNative(jobId, flowId, command, origMessage, options,
      { since: Number(since) || 0, landedStages: new Set(landedStages || []) });
  }

  // Finds the live prep node for a (flowId, shotIdx). The mapper's literal
  // id (vimax-<flow>-prep-<idx>) may be remapped by the canvas-skills
  // create path, so match on the trusted lineage fields (double-form: the
  // real store flattens data to the node top level) - same authority the
  // F6 writeback collector uses, never the forgeable id.
  function findVimaxPrepNodeId(flowId, shotIdx) {
    const want = Number(shotIdx);
    for (const node of graphNodes()) {
      if (!node) continue;
      const data = node.data && typeof node.data === "object" ? node.data : node;
      const nodeFlow = data.vimaxFlowId !== undefined ? data.vimaxFlowId : node.vimaxFlowId;
      const role = data.vimaxRole !== undefined ? data.vimaxRole : node.vimaxRole;
      const idx = data.vimaxShotIdx !== undefined ? data.vimaxShotIdx : node.vimaxShotIdx;
      if (nodeFlow === flowId && role === "prep" && Number(idx) === want) {
        return safeTrim(node.id);
      }
    }
    return "";
  }

  // P2-M11 (F6). The cost-sovereign render step: collect the user's prompt
  // edits off the prep nodes, sign a render-ticket (the budget cap), render
  // keyframes through the broker, then land the urls back on the prep nodes
  // and post a 收工条. Spend only happens after the explicit「确认成片」
  // confirm (铁律 2 - cost sovereignty before any draw).
  // Shared render lane for both the external bridge and the native orchestrator.
  // `lane.submit(payload)` POSTs the render; `lane.poll(jobId, since)` polls its
  // job. Everything else - the cost sign (same broker), the re-entrancy guard,
  // keyframe landing, the reconcile/收工条 - is IDENTICAL, so both paths run this
  // one proven, test-covered body (C2.3). The two callers below inject the
  // external (vimaxRender/vimaxJob) vs native (vimaxNativeRender/vimaxNativeJob)
  // endpoints; the job_status shape is the same for both.
  async function runVimaxRenderLane(message, options, lane) {
    const pending = state.pendingVimaxRender;
    state.lastUserMessage = message;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fail = (reason) => {
      state.streaming = false;
      state.status = "error";
      state.lastReceipt = `ViMax 成片失败：${reason}`;
      state.messages.push({ role: "user", content: message });
      state.messages.push({ role: "assistant", content: state.lastReceipt, kind: "vimax_render" });
      notifyUpdate(options);
      return null;
    };
    if (!pending || !safeTrim(pending.flowId)) {
      return fail("没有待渲染的成片任务,请先用「成片:」规划分镜");
    }
    // Re-entrancy guard (cost sovereignty): a render runs for many minutes;
    // a second「确认成片」(double Enter, automation, a non-UI caller) must
    // not sign a second ticket against the same staged budget. Set
    // synchronously before the first await so the racing call sees it; the
    // finally clears it so a crash can't wedge the lane.
    if (state.vimaxRenderInFlight) {
      state.lastReceipt = "ViMax 成片正在进行中,请等当前一轮收工。";
      notifyUpdate(options);
      return null;
    }
    state.vimaxRenderInFlight = true;
    // Fresh cancel state per render: a stale flag from a prior cancelled attempt
    // must not insta-abort a re-confirmed 补拍. The job id is stashed once the
    // server hands one back (below) so cancelActiveRender() can target it.
    state.vimaxRenderCancelRequested = false;
    state.vimaxRenderJobId = null;
    // Living render card (slice 2): declared at lane scope so the finally can
    // finalize a stuck "running" card if anything throws mid-render.
    let renderCard = null;
    let renderAssistantMessage = null;
    try {
      const flowId = safeTrim(pending.flowId);
      const nodes = graphNodes();
      const edits = collectVimaxEdits(nodes, flowId);
      const shotIdxs = selectedRenderShotIdxs(nodes, flowId, pending.shotIdxs || []);
      if (!shotIdxs.length) {
        return fail("没有可渲染的镜头(分镜节点都被删除了?)");
      }
      // Re-render after an edit must re-draw the changed shots: the runner skips
      // a shot whose first_frame.png already exists, so without invalidation an
      // edited prompt silently reuses the OLD keyframe and 收工条 reports a false
      // success (B0-M3). Invalidate shots whose ffDesc changed since the last
      // render attempt of this flow (renderedEdits persists on pending across a
      // partial-failure retry; it's cleared with pending on full success).
      const editByShot = {};
      for (const e of edits) editByShot[Number(e.shotIdx)] = e.ffDesc;
      const prevRendered = pending.renderedEdits && typeof pending.renderedEdits === "object" ? pending.renderedEdits : {};
      const invalidateShotIdxs = shotIdxs.filter(
        (idx) => Object.prototype.hasOwnProperty.call(prevRendered, idx) && prevRendered[idx] !== editByShot[idx]
      );
      pending.renderedEdits = editByShot;
      // Keyframe degrade: 1 draw per shot, plus a VLM-判官 reshoot budget
      // (P3-M17) for frames the judge rejects. capTotal is the HARD budget cap
      // the broker enforces; it includes the reshoot allowance so the user
      // confirms the worst-case spend up front.
      const retryBudget = Math.max(1, Math.round(shotIdxs.length / 2));
      const capTotal = shotIdxs.length + retryBudget;
      state.status = "streaming";
      state.streaming = true;
      state.lastReceipt = `ViMax 成片：签预算单(封顶 ${capTotal} 次出图,含最多 ${retryBudget} 次判官重摇)…`;
      notifyUpdate(options);

      let ticket = null;
      try {
        ticket = await api.vimaxSign({ flowId, shotIdxs, capTotal, unit: "draw" });
      } catch (error) {
        return fail(`预算单签字失败：${safeTrim(error?.message) || error}`);
      }
      const ticketId = safeTrim(ticket?.ticketId);
      if (!ticketId) {
        return fail(safeTrim(ticket?.error) || "预算单未生成 ticketId");
      }
      // Sanity-check the minted cap: if the broker handed back a smaller
      // budget than the shots we're about to render, draws would be
      // rejected mid-render - fail before spending instead.
      const mintedCap = Number(ticket?.capTotal);
      if (Number.isFinite(mintedCap) && mintedCap + 1e-9 < capTotal) {
        return fail(`预算单封顶 ${mintedCap} 小于待渲染 ${capTotal} 镜,渲染会中途被拒`);
      }

      // Living render card (slice 2, C1 收口): a 成片 render is a backgroundable
      // job, so it gets a card in message.cards[] — NOT an executionStore entry
      // (its whitelist drops kind/cancel) and NOT a canvas_actions card (synced
      // off node state). Created "running" now and driven to a terminal status
      // below. The user + assistant messages are pushed once, here, and updated
      // in place — the card lives on the assistant message through the render.
      renderCard = createVimaxRenderCard({ flowId, shotCount: shotIdxs.length });
      renderAssistantMessage = { role: "assistant", content: "", kind: "vimax_render", cards: [renderCard] };
      state.messages.push({ role: "user", content: message });
      state.messages.push(renderAssistantMessage);
      const setRenderCard = (patch) => {
        renderCard = updateInteractionCardStatus(renderCard, patch);
        renderAssistantMessage.cards = [renderCard];
      };
      notifyUpdate(options);

      // Render kernel (slice 1): the submit→poll→land→tally core lives in
      // vimaxRenderJob.js, UI-independent and unit-tested. The lane keeps the
      // cost-sovereignty pre-flight (sign/ticket above) and translates the
      // kernel's structured outcome into the card + receipt below.
      const outcome = await runVimaxRenderJob(
        { flowId, ticketId, shotIdxs, edits, invalidateShotIdxs, retryBudget },
        {
          submit: lane.submit,
          poll: lane.poll,
          placeKeyframe: (shotIdx, url) => {
            const nodeId = findVimaxPrepNodeId(flowId, shotIdx);
            if (!nodeId || typeof graphStore?.updateNodeData !== "function") return false;
            graphStore.updateNodeData(nodeId, {
              imageUrl: url,
              src: url,
              url,
              images: [url],
              generationStatus: "completed",
              jobStatus: "success",
              asyncTaskStatus: "success",
              isGenerating: false,
            });
            return true;
          },
          sleep,
          // Overridable (state.renderPollIntervalMs) so the cancel path is
          // testable without waiting real seconds; prod stays 3000ms.
          pollMs: Number(state.renderPollIntervalMs) > 0 ? Number(state.renderPollIntervalMs) : 3000,
          deadlineMs: 40 * 60 * 1000,
          now: () => Date.now(),
          isCancelled: () => state.vimaxRenderCancelRequested === true,
          onStarted: (jobId) => {
            state.vimaxRenderJobId = jobId; // slice 0: cancel target
            setRenderCard({ jobId });
          },
          onPhase: ({ phase, landedCount }) => {
            state.lastReceipt = `ViMax 成片中：${phase}(已出 ${landedCount} 帧)`;
            setRenderCard({ summary: `出图中：${phase}(已出 ${landedCount} 帧)`, landedCount });
            notifyUpdate(options);
          },
        }
      );
      state.streaming = false;

      if (outcome.status === "failed") {
        // Keep pending staged so the user can re-confirm; the runner skips shots
        // whose frame already exists, so a retry only re-draws the gaps. Same
        // observable contract as the old fail() (status error, return null,
        // pending kept) — now reflected on the living card too.
        const failReceipt = `ViMax 成片失败：${outcome.reason}`;
        setRenderCard({ status: "failed", summary: failReceipt, error: outcome.reason });
        renderAssistantMessage.content = failReceipt;
        state.status = "error";
        state.lastReceipt = failReceipt;
        notifyUpdate(options);
        return null;
      }

      if (outcome.status === "cancelled") {
        // Tell the server to stop the job (best-effort; the broker only bills
        // draws actually taken, so an early cancel caps the spend). Keep pending
        // staged so a later「确认成片」re-render only redraws the gaps.
        try {
          if (state.vimaxRenderJobId && typeof api?.vimaxNativeCancel === "function") {
            await api.vimaxNativeCancel(state.vimaxRenderJobId);
          }
        } catch { /* best-effort */ }
        const receipt = `ViMax 成片已取消（已出 ${outcome.landedCount} 帧，可改提示词后重发「确认成片」补拍）。`;
        setRenderCard({ status: "cancelled", summary: receipt, landedCount: outcome.landedCount });
        renderAssistantMessage.content = receipt;
        state.status = "done_no_actions";
        if (state.conversationId && conversationStore) {
          conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
          conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: receipt, status: "done", kind: "vimax_render", cards: [renderCard] });
        }
        state.lastReceipt = receipt;
        notifyUpdate(options);
        return { reply: receipt, vimaxFlowId: flowId, vimaxRender: { done: outcome.landedCount, cancelled: true } };
      }

      // outcome.status === "done": build the 收工条 from the kernel's tally.
      const { done, failedShots, skipped, missing, unplaced, elapsedSec, shotCount } = outcome;
      const parts = [`ViMax 成片收工：${done}/${shotCount} 镜出图`];
      if (skipped) parts.push(`复用 ${skipped} 帧`);
      if (unplaced) parts.push(`${unplaced} 帧未能落到节点(画布上找不到对应分镜)`);
      const outstanding = failedShots + missing;
      if (outstanding) parts.push(`失败/缺失 ${outstanding} 镜(可改提示词后重发「确认成片」补拍)`);
      if (Number.isFinite(elapsedSec)) parts.push(`用时 ${elapsedSec}s`);
      const receipt = `${parts.join("，")}。`;
      setRenderCard({
        status: "completed",
        summary: receipt,
        landedCount: done,
        result: { done, failedShots, skipped, missing, unplaced, elapsedSec, shotCount },
      });
      renderAssistantMessage.content = receipt;
      state.status = "done_no_actions";
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
        conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: receipt, status: "done", kind: "vimax_render", cards: [renderCard] });
      }
      // Clear the staged budget only when nothing is outstanding; on partial
      // failure keep it so「确认成片」补拍 retries the gaps (frame-exists skip
      // makes that a no-spend for the shots already landed).
      if (!outstanding) {
        state.pendingVimaxRender = null;
      }
      state.lastReceipt = receipt;
      notifyUpdate(options);
      return { reply: receipt, vimaxFlowId: flowId, vimaxRender: { done, failed: failedShots, skipped, missing, unplaced } };
    } finally {
      // Defensive: an unexpected throw must never leave a "running" card forever.
      // Notify so the UI actually repaints the stuck→failed transition — the
      // normal terminal branches already notified; this is the only path that
      // otherwise wouldn't.
      if (renderCard && renderCard.status === "running" && renderAssistantMessage) {
        renderAssistantMessage.cards = [
          updateInteractionCardStatus(renderCard, { status: "failed", summary: "ViMax 成片中断。", error: "interrupted" }),
        ];
        notifyUpdate(options);
      }
      state.vimaxRenderInFlight = false;
      state.vimaxRenderJobId = null;
      state.vimaxRenderCancelRequested = false;
    }
  }

  // Native orchestrator render lane (Phase C; the external venv render lane was
  // retired in C5.2 - native is the only runtime).
  async function applyVimaxNativeRenderCommand(message, options) {
    return runVimaxRenderLane(message, options, {
      submit: (payload) => api.vimaxNativeRender(payload),
      poll: (jobId, since) => api.vimaxNativeJob(jobId, since),
    });
  }

  // Finds the live portrait node for a (flowId, charIdx, view). Matches on
  // trusted lineage (double-form), never the forgeable id - same authority
  // as findVimaxPrepNodeId.
  function findVimaxPortraitNodeId(flowId, charIdx, view) {
    const wantChar = Number(charIdx);
    const wantView = safeTrim(view);
    for (const node of graphNodes()) {
      if (!node) continue;
      const data = node.data && typeof node.data === "object" ? node.data : node;
      const nodeFlow = data.vimaxFlowId !== undefined ? data.vimaxFlowId : node.vimaxFlowId;
      const role = data.vimaxRole !== undefined ? data.vimaxRole : node.vimaxRole;
      const cIdx = data.vimaxCharIdx !== undefined ? data.vimaxCharIdx : node.vimaxCharIdx;
      const v = data.vimaxView !== undefined ? data.vimaxView : node.vimaxView;
      if (nodeFlow === flowId && role === "portrait" && Number(cIdx) === wantChar && safeTrim(v) === wantView) {
        return safeTrim(node.id);
      }
    }
    return "";
  }

  // Resolve a 定妆/重摇 character-name list against the last plan's extracted
  // characters. No names -> all visible characters (定妆整组). Exact identifier
  // match wins; only fall back to substring when it's UNAMBIGUOUS - otherwise
  // the name goes in `ambiguous` (so a typo like 男 doesn't silently fan out
  // to 男主+男二 and inflate the budget). Returns {chars, ambiguous}.
  function resolveVimaxPortraitChars(names) {
    const chars = Array.isArray(state.lastVimaxPlan?.characters) ? state.lastVimaxPlan.characters : [];
    const wanted = (Array.isArray(names) ? names : []).map((n) => safeTrim(n)).filter(Boolean);
    if (!wanted.length) {
      return { chars: chars.filter((c) => c.isVisible), ambiguous: [] };
    }
    const picked = [];
    const seen = new Set();
    const ambiguous = [];
    for (const name of wanted) {
      let matches = chars.filter((c) => c.identifier === name);
      if (!matches.length) {
        matches = chars.filter((c) => c.identifier && (c.identifier.includes(name) || name.includes(c.identifier)));
      }
      if (matches.length > 1) {
        ambiguous.push(name);
        continue;
      }
      for (const c of matches) {
        if (!seen.has(c.idx)) {
          seen.add(c.idx);
          picked.push(c);
        }
      }
    }
    return { chars: picked, ambiguous };
  }

  // P3-M15 (F6 定妆). Turn 1: lay out the three-view placeholder group (no
  // spend - empty nodes) and stage the budget. `reshoot` re-stages with an
  // invalidate flag so 确认定妆 redraws. Cost only happens on 确认定妆.
  async function applyVimaxPortraitsCommand(message, options, command, { reshoot = false } = {}) {
    state.lastUserMessage = message;
    const fail = (reason) => {
      state.streaming = false;
      state.status = "error";
      state.lastReceipt = `ViMax 定妆失败：${reason}`;
      state.messages.push({ role: "user", content: message });
      state.messages.push({ role: "assistant", content: state.lastReceipt, kind: "vimax_portraits" });
      notifyUpdate(options);
      return null;
    };
    const flowId = safeTrim(state.lastVimaxPlan?.flowId);
    if (!flowId) {
      return fail("请先用「成片:」或「导演:」规划,定妆需要先提取角色");
    }
    const names = reshoot
      ? (command.names || [])
      : String(command.body || "")
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean);
    const { chars, ambiguous } = resolveVimaxPortraitChars(names);
    if (ambiguous.length) {
      return fail(`角色名有歧义：${ambiguous.join("、")}——请用全名(如「${(state.lastVimaxPlan?.characters || []).map((c) => c.identifier).filter(Boolean).slice(0, 4).join("、")}」)`);
    }
    if (!chars.length) {
      return fail(names.length ? `未找到角色：${names.join("、")}` : "没有可定妆的角色(规划里没有可见角色?)");
    }
    const characterIdxs = chars.map((c) => c.idx);
    const capTotal = chars.length * 3; // front/side/back per character

    // Lay out the three-view placeholders (structure only, autoStart:false,
    // no image). Reuses the plan execution-contract path so the trusted
    // lineage fields survive validation; 确认定妆 lands the urls onto these.
    let actions = [];
    try {
      actions = (mapVimaxPortraitsToCanvasActions({
        portraits: {
          schemaVersion: "vimax-portraits-result/v1",
          flowId,
          // Synthetic result: all three views present (sentinel url forces
          // node creation); the create actions carry no image, so the
          // sentinel is only the mapper's "this view exists" signal.
          characters: chars.map((c) => ({
            idx: c.idx,
            identifier: c.identifier,
            views: [
              { view: "front", url: "pending" },
              { view: "side", url: "pending" },
              { view: "back", url: "pending" },
            ],
          })),
        },
      }).actions) || [];
    } catch (error) {
      return fail(`三视布局失败：${safeTrim(error?.message) || error}`);
    }

    state.pendingVimaxPortraits = {
      flowId,
      characterIdxs,
      capTotal,
      invalidateCharacterIdxs: reshoot ? characterIdxs : [],
      names: chars.map((c) => c.identifier),
    };

    const who = chars.map((c) => c.identifier).join("、");
    const verb = reshoot ? "重摇" : "定妆";
    const reply = `已为 ${chars.length} 个角色(${who})铺好三视卡位。回复「确认定妆」开始${verb}出图(每角色前/侧/背 3 张,预算封顶 ${capTotal} 次出图)。`;

    const planResponse = {
      plan: { id: `${flowId}-portraits`, title: `定妆 ${who}`, steps: [{ id: "step_portraits" }] },
      actionsByStep: { step_portraits: actions },
      execution: { title: `定妆 ${who}` },
      reply,
      vimaxFlowId: flowId,
    };
    state.status = "done_no_actions";
    state.lastResponse = planResponse;
    state.messages.push({ role: "user", content: message });
    state.messages.push({ role: "assistant", content: reply, kind: "vimax_portraits" });
    if (state.conversationId && conversationStore) {
      conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
      conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: reply, status: "done", kind: "vimax_portraits" });
    }
    const storedExecution = recordAssistantExecutionFromResponse(planResponse, message);
    if (storedExecution?.id) {
      if (!(state.vimaxExecutionIds instanceof Set)) state.vimaxExecutionIds = new Set();
      state.vimaxExecutionIds.add(String(storedExecution.id));
    }
    state.lastReceipt = reply;
    notifyUpdate(options);
    return planResponse;
  }

  // P3-M15. Turn 2: the cost-sovereign 定妆 spend. Sign the budget, run the
  // portraits, then land each view's url onto its placeholder node (created
  // by 定妆 turn 1, so it already exists - same landing as M11 keyframes).
  // Shared 定妆 lane for both the external bridge and the native orchestrator.
  // `lane.submit(payload)` POSTs the portraits job; `lane.poll(jobId, since)`
  // polls it. The cost sign (same broker), three-view landing, and 收工条 are
  // identical; the two callers below inject the external (vimaxPortraits/vimaxJob)
  // vs native (vimaxNativePortraits/vimaxNativeJob) endpoints. The job_status
  // shape - result.characters[].views[].url - is the same for both.
  async function runVimaxPortraitsLane(message, options, lane) {
    const pending = state.pendingVimaxPortraits;
    state.lastUserMessage = message;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fail = (reason) => {
      state.streaming = false;
      state.status = "error";
      state.lastReceipt = `ViMax 定妆失败：${reason}`;
      state.messages.push({ role: "user", content: message });
      state.messages.push({ role: "assistant", content: state.lastReceipt, kind: "vimax_portraits" });
      notifyUpdate(options);
      return null;
    };
    if (!pending || !safeTrim(pending.flowId)) {
      return fail("没有待定妆的任务,请先用「定妆:」铺卡位");
    }
    if (state.vimaxPortraitsInFlight) {
      state.lastReceipt = "ViMax 定妆正在进行中,请等当前一轮收工。";
      notifyUpdate(options);
      return null;
    }
    state.vimaxPortraitsInFlight = true;
    try {
      const flowId = safeTrim(pending.flowId);
      const characterIdxs = Array.isArray(pending.characterIdxs) ? pending.characterIdxs : [];
      if (!characterIdxs.length) {
        return fail("没有可定妆的角色");
      }
      // capTotal was staged in turn 1 (= chars × 3); the `||` is a guard, not
      // a real path (turn 1 always stages ≥ 3). The minted-cap check below is
      // the real budget gate.
      const capTotal = Number(pending.capTotal) || characterIdxs.length * 3;
      const isReshoot = Array.isArray(pending.invalidateCharacterIdxs) && pending.invalidateCharacterIdxs.length > 0;
      state.status = "streaming";
      state.streaming = true;
      state.lastReceipt = `ViMax 定妆：签预算单(封顶 ${capTotal} 次出图)…`;
      notifyUpdate(options);

      let ticket = null;
      try {
        ticket = await api.vimaxSign({ flowId, characterIdxs, capTotal, unit: "draw" });
      } catch (error) {
        return fail(`预算单签字失败：${safeTrim(error?.message) || error}`);
      }
      const ticketId = safeTrim(ticket?.ticketId);
      if (!ticketId) {
        return fail(safeTrim(ticket?.error) || "预算单未生成 ticketId");
      }
      const mintedCap = Number(ticket?.capTotal);
      if (Number.isFinite(mintedCap) && mintedCap + 1e-9 < capTotal) {
        return fail(`预算单封顶 ${mintedCap} 小于待出图 ${capTotal} 张,会中途被拒`);
      }

      let started = null;
      try {
        started = await lane.submit({
          flowId,
          ticketId,
          characterIdxs,
          invalidateCharacterIdxs: Array.isArray(pending.invalidateCharacterIdxs) ? pending.invalidateCharacterIdxs : [],
        });
      } catch (error) {
        return fail(`定妆请求失败：${safeTrim(error?.message) || error}`);
      }
      if (!started || started.success === false || !started.jobId) {
        if (started?.status === "not-configured") {
          return fail("ViMax 未配置(请设置 HY_VIMAX_HOME 后重启服务)");
        }
        return fail(safeTrim(started?.error) || "未知错误");
      }

      const landed = new Set();
      const landView = (charIdx, view, url) => {
        const u = safeTrim(url);
        if (!u) return false;
        const key = `${charIdx}/${view}`;
        if (landed.has(key)) return true;
        const nodeId = findVimaxPortraitNodeId(flowId, charIdx, view);
        if (!nodeId || typeof graphStore?.updateNodeData !== "function") return false;
        graphStore.updateNodeData(nodeId, {
          imageUrl: u,
          src: u,
          url: u,
          images: [u],
          generationStatus: "completed",
          jobStatus: "success",
          asyncTaskStatus: "success",
          isGenerating: false,
        });
        landed.add(key);
        return true;
      };
      const landFromCharacters = (characters) => {
        for (const ch of Array.isArray(characters) ? characters : []) {
          for (const v of Array.isArray(ch?.views) ? ch.views : []) {
            landView(ch.idx, safeTrim(v?.view), v?.url);
          }
        }
      };

      const deadline = Date.now() + 40 * 60 * 1000;
      let status = null;
      let since = 0;
      while (Date.now() < deadline) {
        await sleep(3000);
        try {
          status = await lane.poll(started.jobId, since);
        } catch {
          continue;
        }
        // The portraits result streams as the job's result; land progressively
        // if partial character results are exposed on the job.
        landFromCharacters(status?.result?.characters);
        const lastPhase = Array.isArray(status?.progress) && status.progress.length
          ? safeTrim(status.progress[status.progress.length - 1]?.phase)
          : "";
        if (lastPhase) {
          state.lastReceipt = `ViMax 定妆中：${lastPhase}(已出 ${landed.size} 张)`;
          notifyUpdate(options);
        }
        if (Number.isFinite(Number(status?.progressTotal))) since = Number(status.progressTotal);
        if (status && status.status && status.status !== "running") break;
      }
      state.streaming = false;
      if (!status || status.status !== "done" || !status.result) {
        const reason = safeTrim(status?.error) || (status?.status === "not-found" ? "任务已丢失(服务可能重启)" : "等待超时");
        return fail(reason);
      }

      const characters = Array.isArray(status.result.characters) ? status.result.characters : [];
      landFromCharacters(characters);
      let doneChars = 0;
      let failedChars = 0;
      for (const ch of characters) {
        if (ch?.error) failedChars += 1;
        else doneChars += 1;
      }
      const elapsed = Number(status.result.elapsedSec);
      const parts = [`ViMax 定妆收工：${doneChars}/${characterIdxs.length} 角色,出 ${landed.size} 张三视`];
      if (failedChars) parts.push(`失败 ${failedChars} 角色(可「重摇: 角色名」补)`);
      if (Number.isFinite(elapsed)) parts.push(`用时 ${elapsed}s`);
      // 重摇 changed the look: already-rendered keyframes still reference the
      // OLD portraits and won't auto-refresh (the runner skips frames that
      // exist) - tell the user to re-render them.
      const reshootNote = isReshoot
        ? "已用旧定妆渲染过的关键帧不会自动刷新,需对相关镜头重发「确认成片」补拍。"
        : "后续成片会自动带上这套定妆作为角色参考图。";
      const receipt = `${parts.join("，")}。${reshootNote}`;
      state.status = "done_no_actions";
      state.messages.push({ role: "user", content: message });
      state.messages.push({ role: "assistant", content: receipt, kind: "vimax_portraits" });
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, { role: "user", content: message, status: "done" });
        conversationStore.appendMessage?.(state.conversationId, { role: "assistant", content: receipt, status: "done", kind: "vimax_portraits" });
      }
      if (!failedChars) {
        state.pendingVimaxPortraits = null;
      }
      state.lastReceipt = receipt;
      notifyUpdate(options);
      return { reply: receipt, vimaxFlowId: flowId, vimaxPortraits: { done: doneChars, failed: failedChars, landed: landed.size } };
    } finally {
      state.vimaxPortraitsInFlight = false;
    }
  }

  // Native orchestrator 定妆 lane (Phase C; the external venv 定妆 lane was
  // retired in C5.2 - native is the only runtime).
  async function applyVimaxNativePortraitsRenderCommand(message, options) {
    return runVimaxPortraitsLane(message, options, {
      submit: (payload) => api.vimaxNativePortraits(payload),
      poll: (jobId, since) => api.vimaxNativeJob(jobId, since),
    });
  }

  function recordAssistantExecutionFromResponse(response = {}, message = "") {
    if (!executionStore || typeof executionStore.createExecution !== "function" || !hasAssistantExecutionContract(response)) {
      return null;
    }
    const execution = response.execution && typeof response.execution === "object" ? response.execution : {};
    const plan = response.plan && typeof response.plan === "object" ? response.plan : {};
    const intent = response.intent && typeof response.intent === "object" ? response.intent : {};
    const drawerState = execution.drawerState && typeof execution.drawerState === "object" ? execution.drawerState : {};
    const title =
      safeTrim(execution.title) ||
      safeTrim(plan.title) ||
      safeTrim(intent.title) ||
      safeTrim(message) ||
      "AI 执行任务";
    const status = safeTrim(execution.status || plan.status || "draft") || "draft";
    const snapshot = typeof executionStore.snapshot === "function" ? executionStore.snapshot() : {};
    const activeExecutionId = safeTrim(snapshot?.activeExecutionId);
    const executionId = safeTrim(execution.id);
    const shouldQueue =
      Boolean(activeExecutionId) &&
      (!executionId || executionId !== activeExecutionId) &&
      typeof executionStore.enqueueExecution === "function";
    const queuedCount = Array.isArray(snapshot?.queue) ? snapshot.queue.length : 0;
    const queueWarning = drawerState.queueWarning === true || (shouldQueue && queuedCount >= EXECUTION_QUEUE_WARNING_THRESHOLD);
    const responseActionsByStep =
      response.actionsByStep && typeof response.actionsByStep === "object" ? response.actionsByStep : {};
    const generationCounts = countGenerationActions(
      executionActions({ plan, actionsByStep: responseActionsByStep }),
      graphStore
    );
    const needsGenerationConfirmation = generationConfirmationRequired(generationCounts, state.agentMode);
    const confirmationMessage = needsGenerationConfirmation
      ? generationConfirmationMessage(generationCounts)
      : "";
    const line1 = safeTrim(drawerState.line1) || title;
    let line2 = confirmationMessage || safeTrim(drawerState.line2 || response.reply);
    if (!confirmationMessage && line2 === line1) {
      line2 = needsGenerationConfirmation ? "待确认" : "准备执行";
    }
    const stored = (shouldQueue ? executionStore.enqueueExecution : executionStore.createExecution).call(executionStore, {
      ...execution,
      conversationId: safeTrim(execution.conversationId || response.conversationId || state.conversationId),
      intentId: safeTrim(execution.intentId || intent.id),
      matchedSkills: Array.isArray(intent.matchedSkills) ? intent.matchedSkills : [],
      planId: safeTrim(execution.planId || plan.id),
      title,
      status: shouldQueue ? "queued_draft" : status,
      plan,
      actionsByStep: responseActionsByStep,
      drawerState: {
        visible: shouldQueue ? false : (drawerState.visible === true || Boolean(plan.id || execution.id)),
        expanded: drawerState.expanded === true,
        line1,
        line2,
        queueWarning,
        pendingConfirmationCount: drawerState.pendingConfirmationCount,
      },
      summary: safeTrim(execution.summary || response.reply),
    });
    let initialEvent = null;
    if (stored && typeof executionStore.appendTimelineEvent === "function") {
      initialEvent = executionStore.appendTimelineEvent(stored.id, {
        stepId: safeTrim(plan.steps?.[0]?.id),
        status,
        humanSummary: line2 || safeTrim(response.reply || title),
        developer: response.developer && typeof response.developer === "object" ? response.developer : {},
      });
    }
    if (stored) {
      syncExecutionToBackend(
        executionStore.getExecution?.(stored.id) || stored,
        initialEvent
      );
    }
    const autoExecutable =
      stored &&
      !shouldQueue &&
      !needsGenerationConfirmation &&
      ["draft", "waiting_confirmation"].includes(safeTrim(stored.status)) &&
      isRunnableExecution(stored) &&
      typeof state.executionOrchestrator?.run === "function";
    if (autoExecutable) {
      state.lastAutoExecutionPromise = Promise.resolve()
        .then(() =>
          state.executionOrchestrator.run(stored.id, { agentMode: state.agentMode, videoAuthorized: false })
        )
        .catch(() => null);
    }
    return stored;
  }

  function ensureGraphSubscription(options = {}) {
    if (graphUnsubscribe || typeof graphStore?.subscribe !== "function") {
      return;
    }
    graphUnsubscribe = graphStore.subscribe(() => refreshSyncedOperationCards(options));
  }

  function cardStatusFromResult(result = {}, card = null) {
    const generationNodeIds = generationNodeIdsFromResult(result);
    if (!generationNodeIds.length) {
      return "completed";
    }
    const nodeIds = nodeIdsFromResult(result, card);
    return canvasCardStatusForNodeIds(nodeIds.length ? nodeIds : generationNodeIds);
  }

  async function applyPendingActionsOnce(state, options = {}) {
    const pendingToken = state.pendingActions;
    const selectedIndexes = currentSelectedActionIndexes();
    const actions = pendingToken
      .filter((_, index) => selectedIndexes.includes(index))
      .map(cloneAction);
    if (actions.length === 0) {
      state.lastReceipt = pendingToken.length ? "No selected actions to apply." : "No pending actions.";
      updateLatestInteractionCard({ status: "failed", error: state.lastReceipt, expanded: true });
      return state.lastReceipt;
    }
    const previewModel = buildAssistantActionPreviewModel(pendingToken, { selectedIndexes, agentMode: state.agentMode });
    if (previewModel.requiresStrongConfirmation && state.agentMode !== "act" && !state.strongConfirmationApproved) {
      state.lastReceipt = "Strong confirmation required before applying high-risk canvas actions.";
      updateLatestInteractionCard({ status: "needs_confirmation", error: state.lastReceipt, expanded: true });
      return state.lastReceipt;
    }
    if (!api || typeof api.validateActions !== "function") {
      throw new TypeError("api.validateActions is required");
    }
    const assistantIntent = normalizeAssistantIntent(state.assistantIntent);
    const actionMetadata = {
      conversationId: state.lastResponse?.conversationId || "",
      messageId: state.lastResponse?.messageId || "",
      traceId: state.lastResponse?.traceId || "",
    };
    if (assistantIntent) {
      actionMetadata.assistantIntent = assistantIntent.id;
    }
    const videoAuthorized =
      state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true;
    const skippedUnauthorizedVideoNodeIds = actions
      .filter((action) => isUnauthorizedVideoGenerationAction(action, graphStore, videoAuthorized))
      .map((action) => String(action.nodeId || "").trim())
      .filter(Boolean);
    const actionsForValidationInput = actions.filter(
      (action) => !isUnauthorizedVideoGenerationAction(action, graphStore, videoAuthorized)
    );
    if (actionsForValidationInput.length === 0) {
      state.lastReceipt = "Video generation requires explicit authorization before it can be applied.";
      updateLatestInteractionCard({ status: "needs_confirmation", error: state.lastReceipt, expanded: true });
      return state.lastReceipt;
    }
    updateLatestInteractionCard({ status: "running", error: "", expanded: false });
    const actionsForValidation = envelopeAssistantActions(actionsForValidationInput, actionMetadata);
    const validationPayload = {
      actions: actionsForValidation,
      context: state.lastContext,
    };
    if (videoAuthorized) {
      validationPayload.videoAuthorized = true;
    }

    const validation = await api.validateActions(validationPayload);
    const validationPassed = validation?.success === true || validation?.valid === true;
    if (!validationPassed) {
      state.lastReceipt = validationFailureReceipt(validation);
      updateLatestInteractionCard({ status: "failed", error: state.lastReceipt, expanded: true });
      return state.lastReceipt;
    }

    if (!Array.isArray(validation.actions)) {
      state.lastReceipt = validationFailureReceipt({
        ...validation,
        message: "Validator returned no action list.",
      });
      updateLatestInteractionCard({ status: "failed", error: state.lastReceipt, expanded: true });
      return state.lastReceipt;
    }

    const actionsToApply = cloneActions(validation.actions);
    if (actionsToApply.length === 0) {
      if (state.pendingActions === pendingToken) {
        state.pendingActions = [];
      }
      state.lastReceipt = "No validated actions to apply.";
      updateLatestInteractionCard({
        status: "completed",
        result: { summary: state.lastReceipt },
        expanded: false,
      });
      return state.lastReceipt;
    }

    const executePayload = {
      actions: actionsToApply,
      graphStore,
      agentMode: state.agentMode,
    };
    if (templateStore) {
      executePayload.templateStore = templateStore;
    }
    if (canvasSkillsRuntime) {
      executePayload.canvasSkillsRuntime = canvasSkillsRuntime;
    }
    if (videoAuthorized) {
      executePayload.videoAuthorized = true;
    }
    const rawResult = await executeActions(executePayload);
    const result =
      skippedUnauthorizedVideoNodeIds.length && rawResult && typeof rawResult === "object"
        ? {
            ...rawResult,
            skippedVideoGenerationNodeIds: [
              ...new Set([
                ...(Array.isArray(rawResult.skippedVideoGenerationNodeIds)
                  ? rawResult.skippedVideoGenerationNodeIds
                  : []),
                ...skippedUnauthorizedVideoNodeIds,
              ]),
            ],
          }
        : rawResult;
    if (state.pendingActions === pendingToken) {
      state.pendingActions = [];
      state.selectedActionIndexes = new Set();
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
    }
    if (Array.isArray(result?.generationTasks) && result.generationTasks.length) {
      const byId = new Map(state.generationTasks.map((task) => [String(task?.id || ""), task]));
      for (const task of cloneObjects(result.generationTasks)) {
        if (task.id) {
          byId.set(String(task.id), task);
        }
      }
      state.generationTasks = [...byId.values()];
    }
    state.lastReceipt = buildAssistantActionReceipt({
      actions: actionsToApply,
      result,
    });
    state.lastReceiptDetails = result && typeof result === "object" ? cloneAction(result) : {};
    const currentCardTarget = latestCanvasActionCardTarget();
    const nextCardStatus = cardStatusFromResult(result, currentCardTarget?.card);
    let updatedCard = updateCanvasActionCard(currentCardTarget?.card?.id, {
      status: nextCardStatus,
        result: state.lastReceiptDetails || { summary: state.lastReceipt },
        expanded: nextCardStatus === "failed" || nextCardStatus === "retryable",
        error: nextCardStatus === "failed" ? state.lastReceipt : "",
      operation: {
        ...(currentCardTarget?.card?.operation || {}),
        nodeIds: nodeIdsFromResult(result, currentCardTarget?.card),
        status: nextCardStatus,
        sync: generationNodeIdsFromResult(result).length > 0,
      },
      items: operationItemsForNodeIds(nodeIdsFromResult(result, currentCardTarget?.card)),
    });
    if (updatedCard && (Array.isArray(result?.skillTraceCards) || Array.isArray(result?.skillTraces))) {
      const target = latestCanvasActionCardTarget(updatedCard.id);
      if (target?.card) {
        updatedCard = mergeExecutionDetails(target.card, result);
        target.message.cards[target.index] = updatedCard;
      }
    }
    ensureGraphSubscription(options);
    refreshSyncedOperationCards(options);
    if (state.conversationId && conversationStore) {
      for (const task of Array.isArray(result?.generationTasks) ? result.generationTasks : []) {
        conversationStore.appendGenerationTask?.(state.conversationId, task);
      }
      conversationStore.appendReceipt?.(state.conversationId, {
        success: true,
        summary: state.lastReceipt,
        details: result,
      });
    }
    return state.lastReceipt;
  }

  const state = {
    messages: [],
    pendingActions: [],
    selectedActionIndexes: null,
    strongConfirmationApproved: false,
    videoGenerationAuthorized: false,
    lastReceipt: "",
    lastReceiptDetails: null,
    lastContext: undefined,
    assistantIntent: null,
    streaming: false,
    status: "idle",
    lastWarnings: [],
    lastResponse: null,
    pendingExecutionControlClarification: null,
    pendingQueueTitleClarification: null,
    lastQueueControlReference: null,
    recentQueueControlReferences: [],
    lastExecutionSyncError: "",
    lastExecutionSyncPromise: null,
    lastError: null,
    lastUserMessage: "",
    references: [],
    mentionBindings: [],
    generationTasks: [],
    // QMAI director lane is dormant by default (α′ F10): ViMax owns the
    // director prefixes; the legacy QMAI behaviors (knowledge projection,
    // dailies uplink, queued recompile, 导演:->QMAI plan) only fire when
    // this is on (set from GET status legacyQmai by the autoload).
    legacyQmaiEnabled: Boolean(directorLegacyQmai),
    canvasSkillsRuntime,
    executionOrchestrator,
    conversationId: String(conversationId || ""),
    selectedModel: (() => {
      const normalizedSelected = normalizeAssistantModel(selectedModel);
      if (isConfiguredTextModelOption(normalizedSelected)) {
        return normalizedSelected;
      }
      return normalizedModelOptions.length ? fallbackSelectedModel(normalizedModelOptions) : normalizedSelected;
    })(),
    modelOptions: normalizedModelOptions,
    rawModelOptions,
    modelConfigRequired: Boolean(modelConfigRequired),
    agentMode: normalizeAgentMode(agentMode || loadAgentModePreference(localStorage)),

    loadExecutionHistory(options = {}) {
      state.lastExecutionSyncPromise = loadExecutionHistoryFromBackend(options);
      return state.lastExecutionSyncPromise;
    },

    async prepareInteractionCardForPendingActions(options = {}) {
      const actions = cloneActions(state.pendingActions);
      if (!actions.length) {
        return null;
      }
      const analysis = analyzeAssistantActionBatch(actions, { graphStore });
      const card = createInteractionCard({ actions, analysis, agentMode: state.agentMode });
      const generationCounts = countGenerationActions(actions, graphStore);
      const confirmationRequired = generationConfirmationRequired(generationCounts, state.agentMode);
      card.requiresConfirmation = confirmationRequired;
      // C2 收口 (slice 4): the card STATUS must follow the locked generation rule
      // too, not just the flag. The confirm button renders only when BOTH
      // requiresConfirmation AND status==="needs_confirmation" (renderInteractionCard
      // ~6271). createInteractionCard's status comes from the legacy node-count
      // heuristic (shouldRequireCardConfirmation), which disagrees with the spend
      // rule for a lone image in plan mode — leaving the card requiresConfirmation:
      // true + status:"pending" → no confirm button AND no auto-apply = stuck.
      card.status = confirmationRequired ? "needs_confirmation" : "pending";
      card.operation = { ...(card.operation || {}), status: card.status };
      if (confirmationRequired) {
        card.confirmationMessage = generationConfirmationMessage(generationCounts);
      }
      attachCardToLatestAssistant(card);
      notifyUpdate(options);
      const canAutoApply = typeof api?.validateActions === "function" && !confirmationRequired;
      if (canAutoApply) {
        try {
          await state.applyPendingActions(options);
        } catch (error) {
          const message = error?.message || "Applying actions failed.";
          state.lastReceipt = message;
          state.status = "failed";
          updateCanvasActionCard(card.id, { status: "failed", error: message, expanded: true });
        }
      }
      notifyUpdate(options);
      return latestCanvasActionCardTarget(card.id)?.card || card;
    },

    cancelPendingInteractionCard() {
      state.pendingActions = [];
      state.pendingTransaction = null;
      state.selectedActionIndexes = new Set();
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
      const card = updateLatestInteractionCard({ status: "cancelled", expanded: false });
      return card;
    },

    async confirmPendingInteractionCard(options = {}) {
      const target = latestCanvasActionCardTarget();
      if (target?.card?.requiresConfirmation) {
        state.strongConfirmationApproved = true;
        const confirmCounts = countGenerationActions(cloneActions(state.pendingActions), graphStore);
        if (confirmCounts.video > 0 || target.card.analysis?.includesVideoGeneration) {
          state.videoGenerationAuthorized = true;
        }
      }
      try {
        const receipt = await state.applyPendingActions(options);
        notifyUpdate(options);
        return receipt;
      } catch (error) {
        const message = error?.message || "Applying actions failed.";
        state.lastReceipt = message;
        state.status = "failed";
        updateCanvasActionCard(target?.card?.id, { status: "failed", error: message, expanded: true });
        notifyUpdate(options);
        return message;
      }
    },

    setSelectedModel(model) {
      state.selectedModel = normalizeAssistantModel(model);
      return state.selectedModel;
    },

    setPendingActions(actions) {
      state.pendingActions = cloneActions(actions);
      state.selectedActionIndexes = new Set(state.pendingActions.map((_, index) => index));
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
      return state.pendingActions;
    },

    setActionSelected(index, selected) {
      const numericIndex = Number(index);
      if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.pendingActions.length) {
        return false;
      }
      if (!(state.selectedActionIndexes instanceof Set)) {
        state.selectedActionIndexes = new Set(state.pendingActions.map((_, actionIndex) => actionIndex));
      }
      if (selected === false) {
        state.selectedActionIndexes.delete(numericIndex);
      } else {
        state.selectedActionIndexes.add(numericIndex);
      }
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
      return true;
    },

    setModelRegistry({
      modelOptions: nextModelOptions = state.modelOptions,
      selectedModel: nextSelectedModel = null,
      modelConfigRequired: nextModelConfigRequired,
    } = {}) {
      const rawOptions = normalizeModelOptions(nextModelOptions);
      const normalizedOptions = filterSelectableTextModelOptions(rawOptions);
      const normalizedSelected = normalizeAssistantModel(nextSelectedModel);
      state.modelOptions = normalizedOptions;
      state.rawModelOptions = rawOptions;
      if (nextModelConfigRequired !== undefined) {
        state.modelConfigRequired = Boolean(nextModelConfigRequired);
      }
      if (isConfiguredTextModelOption(normalizedSelected)) {
        state.selectedModel = normalizedSelected;
      } else if (
        !state.selectedModel ||
        !isConfiguredTextModelOption(state.selectedModel) ||
        (normalizedOptions.length &&
          !normalizedOptions.some((model) => assistantModelMatches(model, state.selectedModel)))
      ) {
        state.selectedModel = fallbackSelectedModel(normalizedOptions);
      }
      return {
        selectedModel: state.selectedModel,
        modelOptions: state.modelOptions,
      };
    },

    selectModel(modelOrId) {
      const next =
        typeof modelOrId === "string"
          ? state.modelOptions.find((model) => assistantModelMatches(model, modelOrId))
          : modelOrId;
      const normalized = normalizeAssistantModel(next);
      if (!normalized) {
        return null;
      }
      if (!isConfiguredTextModelOption(normalized)) {
        const reason = safeTrim(normalized.disabledReason);
        state.status = "error";
        state.lastError = MODEL_CONFIG_REQUIRED_MESSAGE;
        state.lastReceipt = `${MODEL_CONFIG_REQUIRED_MESSAGE}${reason ? ` ${reason}` : ""} ${MODEL_CONFIG_ENTRY_LABEL}`;
        return null;
      }
      return state.setSelectedModel(normalized);
    },

    canSendMessage(message = "") {
      if (parseNaturalLanguageActiveExecutionControl(message, executionStore)) {
        return true;
      }
      if (parseNaturalLanguageQueueControl(message, executionStore, state.lastQueueControlReference)) {
        return true;
      }
      if (parsePendingQueueTitleClarification(message, state.pendingQueueTitleClarification)) {
        return true;
      }
      if (parsePendingExecutionControlClarification(message, state.pendingExecutionControlClarification)) {
        return true;
      }
      if (parseNaturalLanguageAmbiguousExecutionControl(message, executionStore)) {
        return true;
      }
      if (parseVimaxRenderConfirm(message) && state.pendingVimaxRender && api && typeof api.vimaxNativeRender === "function") {
        return true;
      }
      if (parseVimaxPortraitsConfirm(message) && state.pendingVimaxPortraits && api && typeof api.vimaxNativePortraits === "function") {
        return true;
      }
      if (parseVimaxReshootCommand(message) && state.lastVimaxPlan && api && typeof api.vimaxNativePortraits === "function") {
        return true;
      }
      const vimaxCmd = parseVimaxCommand(message);
      if (vimaxCmd && vimaxCmd.mode === "portraits" && api && typeof api.vimaxNativePortraits === "function") {
        return true;
      }
      if (vimaxCmd && api && typeof api.vimaxNativePlan === "function") {
        return true;
      }
      if (state.legacyQmaiEnabled && parseDirectorPlanCommand(message) && api && typeof api.directorPlan === "function") {
        return true;
      }
      return !modelConfigGuardReason(state);
    },

    // D5: launch chip → contract preview → confirm/cancel (used by the render
    // handlers and exercised directly by tests). launchRegistry = the provider
    // registry (ViMax registered as provider #1).
    launchChipPreview,
    launchContractConfirm,
    launchContractCancel,
    offerLaunchChips,
    refreshLaunchChips,
    launchRegistry: launchProviders,

    setExecutionOrchestrator(orchestrator) {
      state.executionOrchestrator = orchestrator || null;
      return state.executionOrchestrator;
    },

    setAgentMode(mode) {
      state.agentMode = saveAgentModePreference(localStorage, mode);
      return state.agentMode;
    },

    attachments() {
      return typeof attachmentStore?.toContext === "function" ? attachmentStore.toContext() : [];
    },

    attachmentItems() {
      if (typeof attachmentStore?.list === "function") return attachmentStore.list();
      return state.attachments();
    },

    setReferences(references) {
      state.references = cloneObjects(references);
      return state.references;
    },

    addReference(reference) {
      const next = cloneObjects([reference])[0];
      if (!next) {
        return null;
      }
      state.references = [
        ...state.references.filter((item) => String(item.id || "") !== String(next.id || "")),
        next,
      ];
      return next;
    },

    debugSnapshot() {
      return {
        status: state.status,
        streaming: Boolean(state.streaming),
        conversationId: state.conversationId || "",
        messageCount: state.messages.length,
        pendingActionCount: state.pendingActions.length,
        selectedActionCount: currentSelectedActionIndexes().length,
        referenceCount: state.references.length,
        strongConfirmationApproved: Boolean(state.strongConfirmationApproved),
        videoGenerationAuthorized: Boolean(state.videoGenerationAuthorized),
        generationTaskCount: state.generationTasks.length,
        runningGenerationTaskCount: state.generationTasks.filter((task) => String(task?.status || "") === "running").length,
        activeGenerationTaskCount: state.generationTasks.filter((task) =>
          ["pendingRenderer", "queued", "submitting", "running", "retryable", "paused"].includes(String(task?.status || ""))
        ).length,
        lastWarnings: [...state.lastWarnings],
        executionMetrics: computeExecutionMetrics(
          typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : { executions: [] }
        ),
        selectedModel: sanitizeDebugModel(state.selectedModel),
        modelOptions: filterSelectableTextModelOptions(normalizeModelOptions(state.modelOptions)).map(sanitizeDebugModel).filter(Boolean),
        modelConfigRequired: Boolean(state.modelConfigRequired),
        lastReceipt: typeof state.lastReceipt === "string" ? state.lastReceipt : "",
        hasReceiptDetails: Boolean(state.lastReceiptDetails),
        lastReceiptDetails: sanitizeDebugValue(state.lastReceiptDetails || {}),
        messages: sanitizeDebugValue(state.messages.map(cloneMessage)),
        canvasSkills: {
          ready: state.canvasSkillsRuntime?.ready !== false && Boolean(state.canvasSkillsRuntime),
          chatOnly: Boolean(state.canvasSkillsRuntime?.chatOnly),
          notice: String(state.canvasSkillsRuntime?.notice || ""),
        },
      };
    },

    setAssistantIntent(intent) {
      state.assistantIntent = normalizeAssistantIntent(intent);
      return state.assistantIntent;
    },

    refreshOperationCards(options = {}) {
      return refreshSyncedOperationCards(options);
    },

    dispose() {
      graphUnsubscribe?.();
      graphUnsubscribe = null;
    },

    // Phase D (D2): generic trusted-landing primitive, exposed for provider
    // dispatch + the lineage-isolation (AC8b) tests.
    landTrustedActions,

    async sendMessage(text, options = {}) {
      let message = String(text || "").trim();
      if (!message) {
        return null;
      }
      // 拍法库 (slice 7): while a 拍法 is "current" (设为当前拍法), append its
      // 《名》 to a 导演/成片 command so the brain force-includes it — unless the
      // user already typed an explicit 《》 pick (theirs wins). Non-director
      // messages pass through untouched.
      if (state.currentFilmCraft) {
        message = appendCurrentCraft(message, state.currentFilmCraft);
      }
      const activeControlCommand = parseNaturalLanguageActiveExecutionControl(message, executionStore);
      if (activeControlCommand) {
        return await applyNaturalLanguageActiveExecutionControl(message, options, activeControlCommand);
      }
      const queueControlResponse = applyNaturalLanguageQueueControl(message, options);
      if (queueControlResponse) {
        return queueControlResponse;
      }
      const clarifiedQueueTitleCommand = parsePendingQueueTitleClarification(
        message,
        state.pendingQueueTitleClarification
      );
      if (clarifiedQueueTitleCommand) {
        return applyPendingQueueTitleClarification(message, options, clarifiedQueueTitleCommand);
      }
      const clarifiedControlCommand = parsePendingExecutionControlClarification(
        message,
        state.pendingExecutionControlClarification
      );
      if (clarifiedControlCommand) {
        return await applyPendingExecutionControlClarification(message, options, clarifiedControlCommand);
      }
      const ambiguousControlResponse = applyNaturalLanguageAmbiguousExecutionControl(message, options);
      if (ambiguousControlResponse) {
        return ambiguousControlResponse;
      }
      // 「确认成片」consumes a staged render budget (set by a prior 成片:
      // plan) - the cost-sovereignty gate before any draw. Checked before
      // the plan prefixes so the confirm word can't be re-parsed as a plan.
      if (parseVimaxRenderConfirm(message) && state.pendingVimaxRender && api && typeof api.vimaxNativeRender === "function") {
        // 成片 runs on the in-process native brain (Phase C; the external venv
        // render runtime was retired in C5.2). The staged budget + sign are
        // unchanged - only the draw moved in-process.
        return await applyVimaxNativeRenderCommand(message, options);
      }
      // 「确认定妆」consumes a staged 定妆/重摇 budget (the portrait cost gate).
      if (parseVimaxPortraitsConfirm(message) && state.pendingVimaxPortraits && api && typeof api.vimaxNativePortraits === "function") {
        return await applyVimaxNativePortraitsRenderCommand(message, options);
      }
      // 「重摇: 角色」re-stages 定妆 with an invalidate flag (no spend until
      // the following 确认定妆).
      const reshootCommand = parseVimaxReshootCommand(message);
      if (reshootCommand && state.lastVimaxPlan && api && typeof api.vimaxNativePortraits === "function") {
        return await applyVimaxPortraitsCommand(message, options, reshootCommand, { reshoot: true });
      }
      // B3b: 「继续」/「取消」 resume/cancel a PAUSED native plan. Gated on
      // pendingVimaxNativeResume so a normal-prose 继续 is never hijacked; this
      // is checked BEFORE parseVimaxCommand and the chat fallthrough.
      // pending is only ever set by the native lane (which has the resume/cancel
      // api), so gating on it + the exact-match regex is enough; a prose 继续
      // with extra text won't match, and nothing pending means no hijack.
      if (state.pendingVimaxNativeResume && /^\s*(继续|取消)\s*$/.test(message)) {
        return await applyVimaxNativeResumeCommand(message, options);
      }
      // ViMax director lane takes the 导演:/成片:/定妆: prefixes when the native
      // brain is wired. Falls through to the legacy QMAI director path only when
      // ViMax isn't available (api.vimaxNativePlan undefined).
      const vimaxCommand = parseVimaxCommand(message);
      // 定妆: routes to the portrait quick-sign lane (turn 1 places the
      // three-view placeholders) - gated on vimaxNativePortraits, independent of
      // the plan lane. 导演:/成片: go to the plan lane (vimaxNativePlan).
      if (vimaxCommand && vimaxCommand.mode === "portraits" && api && typeof api.vimaxNativePortraits === "function") {
        return await applyVimaxPortraitsCommand(message, options, vimaxCommand);
      }
      if (vimaxCommand && api && typeof api.vimaxNativePlan === "function") {
        // 导演:/成片: plan on the in-process native brain (Phase C). The external
        // venv plan runtime (huanying_runner.run_plan + the bridge) was retired
        // in C5.2; native is the only runtime.
        return await applyVimaxNativePlanCommand(message, options, vimaxCommand);
      }
      // Legacy QMAI director lane only when the flag is on (and ViMax
      // didn't claim the prefix above).
      if (state.legacyQmaiEnabled) {
        if (parseDirectorRefreshCommand(message) && api && typeof api.directorRefresh === "function") {
          return await applyDirectorRefreshCommand(message, options);
        }
        const directorPlanCommand = parseDirectorPlanCommand(message);
        if (directorPlanCommand && api && typeof api.directorPlan === "function") {
          return await applyDirectorPlanCommand(message, options, directorPlanCommand);
        }
      }
      const guardReason = modelConfigGuardReason(state);
      if (guardReason) {
        state.status = "error";
        state.streaming = false;
        state.lastError = MODEL_CONFIG_REQUIRED_MESSAGE;
        state.lastReceipt = guardReason;
        state.setPendingActions([]);
        notifyUpdate(options);
        return null;
      }
      archivePendingExecutionControlClarificationCards(
        "\u5df2\u7ee7\u7eed\u65b0\u7684\u5bf9\u8bdd\u5185\u5bb9\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
      );
      archivePendingQueueTitleClarificationCards(
        "\u5df2\u7ee7\u7eed\u65b0\u7684\u5bf9\u8bdd\u5185\u5bb9\uff0c\u6b64\u9009\u62e9\u5df2\u5f52\u6863\u3002"
      );
      state.pendingExecutionControlClarification = null;
      state.pendingQueueTitleClarification = null;
      const canStream = api && typeof api.chatStream === "function";
      if (!canStream && (!api || typeof api.chat !== "function")) {
        throw new TypeError("api.chat or api.chatStream is required");
      }

      state.lastUserMessage = message;
      state.lastError = null;
      state.messages.push({ role: "user", content: message });
      const attachments = state.attachments();
      const context = contextWithAssistantReferences(
        buildContext({
          graphStore,
          includeSpatial: hasSpatialIntent(message),
          // Director knowledge cards in the everyday PI lane: ranked
          // top-3 from the projection cache (fail-open - empty when
          // the projection is unavailable or nothing is relevant).
          directorKnowledge: rankDirectorKnowledgeForMessage(state, api, message),
        }),
        state.references,
        attachments
      );
      Object.assign(context, buildAssistantMentionContext(state.mentionBindings));
      const assistantIntent = normalizeAssistantIntent(state.assistantIntent);
      if (conversationStore && !state.conversationId && typeof conversationStore.create === "function") {
        state.conversationId = conversationStore.create({
          assistantIntent,
          model: state.selectedModel,
        })?.id || "";
      }
      const conversationMemory = state.conversationId ? buildConversationMemory(state) : null;
      if (conversationMemory) {
        context.conversationMemory = conversationMemory;
      }
      const request = buildAssistantRequest({
        message,
        context,
        assistantIntent,
        mode: "actions",
        conversationId: state.conversationId,
        model: state.selectedModel,
        attachments,
      });
      state.lastContext = request.context;
      state.lastWarnings = [];
      state.setPendingActions([]);
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
      state.status = canStream ? "streaming" : "sending";
      state.streaming = canStream;
      const streamToken = { cancelled: false, controller: null };
      if (canStream && typeof AbortController === "function") {
        streamToken.controller = new AbortController();
        activeStream = streamToken;
      }
      const assistantPlaceholder = { role: "assistant", content: "思考中...", status: "thinking" };
      const activateAssistantPlaceholder = () => {
        if (assistantPlaceholder.status === "thinking") {
          assistantPlaceholder.content = "";
          delete assistantPlaceholder.status;
        }
        return assistantPlaceholder;
      };
      state.messages.push(assistantPlaceholder);
      if (state.conversationId && conversationStore) {
        conversationStore.appendMessage?.(state.conversationId, {
          role: "user",
          content: message,
          status: "done",
        });
        conversationStore.attachContextSnapshot?.(state.conversationId, {
          context: request.context,
        });
      }
      notifyUpdate(options);

      try {
        if (canStream) {
        let assistantMessage = null;
        let receivedDeltaLength = 0;
        let finalReplyFromStream = "";
        let typeQueue = Promise.resolve();
        const ensureAssistantMessage = () => {
          if (!assistantMessage) {
            assistantMessage = activateAssistantPlaceholder();
          }
          return assistantMessage;
        };
        const enqueueAssistantTyping = (text) => {
          const delta = String(text || "");
          if (!delta) {
            return;
          }
          receivedDeltaLength += delta.length;
          const message = ensureAssistantMessage();
          typeQueue = typeQueue.then(() =>
            typeIntoAssistantMessage({
              message,
              text: delta,
              onUpdate: () => notifyUpdate(options),
              chunkSize: typingChunkSize,
              delayMs: typingDelayMs,
              scheduler: typingScheduler,
              signal: streamToken.controller?.signal,
            })
          );
        };
        const handleEvent = (event) => {
          if (event.type === AssistantStreamEventType.MessageDelta) {
            const delta = String(event.delta ?? event.content ?? event.text ?? "");
            enqueueAssistantTyping(delta);
          } else if (event.type === AssistantStreamEventType.MessageDone) {
            finalReplyFromStream = String(event.reply || event.content || "");
          } else if (event.type === AssistantStreamEventType.Warning) {
            const warning = String(event.message || event.warning || "").trim();
            if (warning) {
              state.lastWarnings.push(warning);
            }
          }
        };
        const streamResult = await api.chatStream(
          request,
          { onEvent: handleEvent },
          streamToken.controller ? { signal: streamToken.controller.signal } : {}
        );
        if (streamToken.cancelled || activeStream !== streamToken) {
          state.setPendingActions([]);
          state.status = "cancelled";
          state.streaming = false;
          notifyUpdate(options);
          return null;
        }
        const response =
          streamResult && (typeof streamResult[Symbol.asyncIterator] === "function" || Array.isArray(streamResult))
            ? await consumeAssistantStream(streamResult, { onEvent: handleEvent })
            : normalizeAssistantResponse(streamResult);
        if (streamToken.cancelled || activeStream !== streamToken) {
          state.setPendingActions([]);
          state.status = "cancelled";
          state.streaming = false;
          notifyUpdate(options);
          return null;
        }
        if (!response.reply && finalReplyFromStream) {
          response.reply = finalReplyFromStream;
        }
        const finalReply = String(response.reply || finalReplyFromStream || "");
        await typeQueue;
        if (finalReply && receivedDeltaLength === 0 && !assistantMessage) {
          assistantMessage = activateAssistantPlaceholder();
          await typeIntoAssistantMessage({
            message: assistantMessage,
            text: finalReply,
            onUpdate: () => notifyUpdate(options),
            chunkSize: typingChunkSize,
            delayMs: typingDelayMs,
            scheduler: typingScheduler,
            signal: streamToken.controller?.signal,
          });
        } else if (finalReply && assistantMessage) {
          const currentReply = String(assistantMessage.content || "");
          if (finalReply.startsWith(currentReply) && finalReply.length > currentReply.length) {
            await typeIntoAssistantMessage({
              message: assistantMessage,
              text: finalReply.slice(currentReply.length),
              onUpdate: () => notifyUpdate(options),
              chunkSize: typingChunkSize,
              delayMs: typingDelayMs,
              scheduler: typingScheduler,
              signal: streamToken.controller?.signal,
            });
          }
        } else if (!finalReply) {
          activateAssistantPlaceholder();
        }
        if (Array.isArray(response.cards) && response.cards.length) {
          const latestAssistant = latestAssistantMessageWithCard();
          if (latestAssistant) {
            latestAssistant.cards = [...(Array.isArray(latestAssistant.cards) ? latestAssistant.cards : []), ...cloneObjects(response.cards)];
          }
        }
        state.setPendingActions(response.actions);
        state.lastWarnings = response.warnings.length ? response.warnings : state.lastWarnings;
        state.lastResponse = response;
        if (response.conversationId && !state.conversationId) {
          state.conversationId = response.conversationId;
        }
        recordAssistantExecutionFromResponse(response, message);
        if (state.pendingActions.length) {
          await state.prepareInteractionCardForPendingActions(options);
        }
        if (state.conversationId && conversationStore) {
          const latestAssistant = latestAssistantMessageWithCard();
          conversationStore.appendMessage?.(state.conversationId, {
            role: "assistant",
            content: response.reply || assistantMessage?.content || "",
            status: "done",
            traceId: response.traceId,
            cards: cloneObjects(latestAssistant?.cards),
          });
          if (state.pendingActions.length) {
            conversationStore.appendTransaction?.(state.conversationId, {
              status: "proposed",
              actions: state.pendingActions,
            });
          }
        }
        state.status = state.pendingActions.length ? "done_pending_actions" : "done_no_actions";
        state.streaming = false;
        if (activeStream === streamToken) {
          activeStream = null;
        }
        notifyUpdate(options);
        return response;
        }

        const response = normalizeAssistantResponse(await api.chat(request));
        if (response.reply) {
          await typeIntoAssistantMessage({
            message: activateAssistantPlaceholder(),
            text: response.reply,
            onUpdate: () => notifyUpdate(options),
            chunkSize: typingChunkSize,
            delayMs: typingDelayMs,
            scheduler: typingScheduler,
          });
        } else {
          activateAssistantPlaceholder();
        }
        if (Array.isArray(response.cards) && response.cards.length) {
          const latestAssistant = latestAssistantMessageWithCard();
          if (latestAssistant) {
            latestAssistant.cards = [...(Array.isArray(latestAssistant.cards) ? latestAssistant.cards : []), ...cloneObjects(response.cards)];
          }
        }
        state.setPendingActions(response.actions);
        state.lastWarnings = response.warnings;
        state.lastResponse = response;
        if (response.conversationId && !state.conversationId) {
          state.conversationId = response.conversationId;
        }
        recordAssistantExecutionFromResponse(response, message);
        if (state.pendingActions.length) {
          await state.prepareInteractionCardForPendingActions(options);
        }
        if (state.conversationId && conversationStore) {
          const latestAssistant = latestAssistantMessageWithCard();
          conversationStore.appendMessage?.(state.conversationId, {
            role: "assistant",
            content: response.reply,
            status: "done",
            traceId: response.traceId,
            cards: cloneObjects(latestAssistant?.cards),
          });
          if (state.pendingActions.length) {
            conversationStore.appendTransaction?.(state.conversationId, {
              status: "proposed",
              actions: state.pendingActions,
            });
          }
        }
        state.status = state.pendingActions.length ? "done_pending_actions" : "done_no_actions";
        state.streaming = false;
        notifyUpdate(options);
        return response;
      } catch (error) {
        if (streamToken.cancelled || activeStream === streamToken && streamToken.controller?.signal?.aborted) {
          state.setPendingActions([]);
          state.status = "cancelled";
          state.streaming = false;
          if (activeStream === streamToken) {
            activeStream = null;
          }
          notifyUpdate(options);
          return null;
        }
        const assistantError = buildAssistantError(error);
        activateAssistantPlaceholder().content = assistantError.friendlyMessage;
        assistantPlaceholder.status = "failed";
        state.setPendingActions([]);
        state.status = "failed";
        state.streaming = false;
        state.lastError = assistantError;
        state.lastWarnings = [assistantError.friendlyMessage];
        state.lastReceipt = assistantError.friendlyMessage;
        if (activeStream === streamToken) {
          activeStream = null;
        }
        if (state.conversationId && conversationStore) {
          conversationStore.appendMessage?.(state.conversationId, {
            role: "assistant",
            kind: "error",
            content: assistantError.friendlyMessage,
            status: "failed",
            errorCode: assistantError.errorCode,
            traceId: assistantError.traceId,
          });
        }
        notifyUpdate(options);
        return null;
      }
    },

    stopStreaming() {
      if (!activeStream) {
        return false;
      }
      activeStream.cancelled = true;
      activeStream.controller?.abort?.();
      state.setPendingActions([]);
      state.status = "cancelled";
      state.streaming = false;
      return true;
    },

    cancelActiveRender() {
      // Single-flight rule #2: while a 成片 render polls (up to 40 min), the send
      // button is 进行中⏹. Clicking it lands here, raising a flag the render poll
      // loop checks each tick to break out (and best-effort cancel the server
      // job). Returns false when there's no render in flight so the caller can
      // fall through to a normal send. cancel-by-flow-type (v3 review C4): this
      // is the render lane's cancel; stopStreaming() handles a chat stream.
      if (!state.vimaxRenderInFlight) {
        return false;
      }
      state.vimaxRenderCancelRequested = true;
      state.lastReceipt = "正在取消成片…";
      return true;
    },

    // 拍法库 (slice 7): fetch the film-craft roster for the picker that replaces
    // 爆款实验室. Best-effort — an unconfigured brain returns an empty roster (the
    // picker shows a seed hint), never throws.
    async loadFilmCraftRoster() {
      if (typeof api?.vimaxSkills !== "function") {
        state.filmCraftRoster = [];
        return state.filmCraftRoster;
      }
      try {
        const resp = await api.vimaxSkills();
        state.filmCraftRoster = normalizeFilmCraftRoster(resp);
      } catch {
        state.filmCraftRoster = [];
      }
      return state.filmCraftRoster;
    },

    // 设为当前拍法: persist a 拍法 so subsequent 导演/成片 commands carry it
    // (sendMessage appends 《名》). "" clears it.
    setCurrentFilmCraft(name) {
      state.currentFilmCraft = safeTrim(name);
      return state.currentFilmCraft;
    },

    retryLastMessage(options = {}) {
      if (!state.lastUserMessage) {
        return null;
      }
      return state.sendMessage(state.lastUserMessage, options);
    },

    copyLastErrorTrace() {
      return JSON.stringify(buildTraceCopyPayload(state.lastError, state.lastWarnings), null, 2);
    },

    restoreConversation(conversation) {
      if (!conversation || typeof conversation !== "object") {
        return false;
      }
      state.conversationId = String(conversation.id || "");
      state.assistantIntent =
        conversation.assistantIntent && typeof conversation.assistantIntent === "object"
          ? { ...conversation.assistantIntent }
          : state.assistantIntent;
      state.selectedModel =
        conversation.model && typeof conversation.model === "object"
          ? { ...conversation.model }
          : state.selectedModel;
      state.messages = Array.isArray(conversation.messages)
        ? conversation.messages.map(cloneMessage)
        : [];
      state.pendingExecutionControlClarification =
        pendingExecutionControlClarificationFromMessages(state.messages);
      state.pendingQueueTitleClarification =
        pendingQueueTitleClarificationFromMessages(state.messages);
      state.recentQueueControlReferences = queueControlReferencesFromMessages(state.messages);
      state.lastQueueControlReference = queueControlReferenceFromMessages(state.messages);
      state.references = cloneObjects(conversation.references);
      const pendingTransaction = latestPendingTransactionFromConversation(conversation);
      const activeCard = [...state.messages]
        .reverse()
        .flatMap((message) => (Array.isArray(message?.cards) ? message.cards : []))
        .find((card) => card?.status === "needs_confirmation" && Array.isArray(card.actions) && card.actions.length);
      state.setPendingActions(
        activeCard
          ? activeCard.actions
          : pendingTransaction
            ? pendingTransaction.actions
            : latestPendingActionsFromConversation(conversation)
      );
      if (pendingTransaction && Array.isArray(pendingTransaction.selectedActionIndexes)) {
        state.selectedActionIndexes = new Set(
          pendingTransaction.selectedActionIndexes
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0 && index < state.pendingActions.length)
        );
      }
      state.generationTasks = cloneObjects(conversation.generationTasks);
      state.lastContext = latestContextFromConversation(conversation);
      state.strongConfirmationApproved = false;
      state.videoGenerationAuthorized = false;
      state.lastWarnings = [];
      state.lastReceiptDetails = null;
      state.lastReceipt =
        latestReceiptSummaryFromConversation(conversation) ||
        `Restored conversation: ${conversation.title || conversation.id || ""}`;
      state.status = state.pendingActions.length ? "done_pending_actions" : "done_no_actions";
      state.streaming = false;
      return true;
    },

    previewText() {
      if (usesDefaultSummarizer) {
        return formatAssistantActionPreviewModel(
          buildAssistantActionPreviewModel(state.pendingActions, {
            selectedIndexes: currentSelectedActionIndexes(),
            agentMode: state.agentMode,
          })
        );
      }
      const summary = summarizeActions(state.pendingActions);
      return summary?.description || summary?.title || "";
    },

    previewModel() {
      return buildAssistantActionPreviewModel(state.pendingActions, {
        selectedIndexes: currentSelectedActionIndexes(),
        agentMode: state.agentMode,
      });
    },

    approveStrongConfirmation() {
      state.strongConfirmationApproved = true;
      state.lastReceipt = "Strong confirmation accepted for the current action batch.";
      return true;
    },

    approveVideoGeneration() {
      state.videoGenerationAuthorized = true;
      state.strongConfirmationApproved = true;
      state.lastReceipt = "Video generation explicitly authorized for the current action batch.";
      return true;
    },

    focusReceiptNodes(receiptDetails = state.lastReceiptDetails) {
      const details = receiptDetails && typeof receiptDetails === "object" ? receiptDetails : {};
      const nodeIds = [
        ...(Array.isArray(details.createdNodeIds) ? details.createdNodeIds : []),
        ...(Array.isArray(details.updatedNodeIds) ? details.updatedNodeIds : []),
        ...(Array.isArray(details.queuedGenerationNodeIds) ? details.queuedGenerationNodeIds : []),
        ...(Array.isArray(details.startedGenerationNodeIds) ? details.startedGenerationNodeIds : []),
      ]
        .map((nodeId) => String(nodeId || "").trim())
        .filter(Boolean);
      const uniqueNodeIds = [...new Set(nodeIds)];
      if (!uniqueNodeIds.length || typeof graphStore?.setSelectedNodes !== "function") {
        return false;
      }
      graphStore.setSelectedNodes(uniqueNodeIds);
      return true;
    },

    async applyPendingActions(options = {}) {
      if (applyingPromise) {
        return applyingPromise;
      }
      applyingPromise = applyPendingActionsOnce(state, options).finally(() => {
        applyingPromise = null;
      });
      return applyingPromise;
    },
  };

  return state;
}

const ASSISTANT_STYLE_ID = "hy-canvas-agent-assistant-style";

const DEFAULT_USER_NAME = "user_vgx5kfkl";
const DEFAULT_SESSION_LABEL = "sess-205...542850";

const ASSISTANT_SKILLS = [
  {
    id: "commerce_pack",
    title: "\u7535\u5546\u5957\u56fe",
    detail: "\u5168\u5957\u4e3b\u56fe / \u8be6\u60c5\u5f3a\u5316 / UGC \u5b9e\u62cd / AI \u9020\u578b\u5e08",
    prompt: "\u4ee5\u7535\u5546\u5957\u56fe\u6280\u80fd\u8bca\u65ad\u5f53\u524d\u753b\u5e03\uff0c\u89c4\u5212\u4e3b\u56fe\u3001\u8be6\u60c5\u9875\u5f3a\u5316\u3001UGC \u5b9e\u62cd\u548c AI \u9020\u578b\u5e08\u8282\u70b9\u3002",
  },
  {
    id: "poster_design",
    title: "\u6d77\u62a5\u8bbe\u8ba1",
    detail: "\u8425\u9500 / \u8282\u65e5 / \u6d3b\u52a8\u4e3b\u89c6\u89c9",
    prompt: "\u4ee5\u6d77\u62a5\u8bbe\u8ba1\u6280\u80fd\u4e3a\u5f53\u524d\u753b\u5e03\u89c4\u5212\u8425\u9500\u3001\u8282\u65e5\u6216\u6d3b\u52a8\u4e3b\u89c6\u89c9\u65b9\u6848\u3002",
  },
  {
    id: "brand_design",
    title: "\u54c1\u724c\u8bbe\u8ba1",
    detail: "Logo / VI / \u54c1\u724c\u5168\u5957\u8bc6\u522b",
    prompt: "\u4ee5\u54c1\u724c\u8bbe\u8ba1\u6280\u80fd\u4e3a\u5f53\u524d\u753b\u5e03\u89c4\u5212 Logo\u3001VI \u548c\u54c1\u724c\u8bc6\u522b\u5de5\u4f5c\u6d41\u3002",
  },
  {
    id: "interior_design",
    title: "\u5ba4\u5185\u8bbe\u8ba1",
    detail: "\u6237\u578b\u4e0a\u8272 / \u88c5\u4fee\u65b9\u6848 / \u6750\u8d28\u62fc\u677f",
    prompt: "\u4ee5\u5ba4\u5185\u8bbe\u8ba1\u6280\u80fd\u4e3a\u5f53\u524d\u753b\u5e03\u89c4\u5212\u6237\u578b\u4e0a\u8272\u3001\u88c5\u4fee\u65b9\u6848\u548c\u6750\u8d28\u62fc\u677f\u8282\u70b9\u3002",
  },
  {
    id: "social_media",
    title: "\u793e\u4ea4\u5a92\u4f53",
    detail: "\u5c0f\u7ea2\u4e66\u5c01\u9762 / \u793e\u4ea4\u8f6e\u64ad / \u8de8\u5e73\u53f0\u9002\u914d / \u6295\u653e\u7d20\u6750",
    prompt: "\u4ee5\u793e\u4ea4\u5a92\u4f53\u6280\u80fd\u4e3a\u5f53\u524d\u753b\u5e03\u89c4\u5212\u5c0f\u7ea2\u4e66\u5c01\u9762\u3001\u8f6e\u64ad\u3001\u8de8\u5e73\u53f0\u9002\u914d\u548c\u6295\u653e\u7d20\u6750\u3002",
  },
  {
    id: "story_short",
    title: "\u5267\u60c5\u77ed\u7247",
    detail: "\u6545\u4e8b\u77ed\u7247 / \u5fae\u77ed\u5267 / \u7535\u5f71\u611f / Vlog / \u521b\u610f\u5e7f\u544a",
    prompt: "\u4ee5\u5267\u60c5\u77ed\u7247\u6280\u80fd\u628a\u5f53\u524d\u60f3\u6cd5\u62c6\u6210\u6545\u4e8b\u77ed\u7247\u3001\u5fae\u77ed\u5267\u3001\u7535\u5f71\u611f\u6216 Vlog \u5de5\u4f5c\u6d41\u3002",
  },
  {
    id: "marketing_video",
    title: "\u8425\u9500\u89c6\u9891",
    detail: "\u4fe1\u606f\u6d41 / TVC / \u54c1\u724c\u6545\u4e8b / \u4e9a\u9a6c\u900a\u5e26\u8d27",
    prompt: "\u4ee5\u8425\u9500\u89c6\u9891\u6280\u80fd\u4e3a\u5f53\u524d\u753b\u5e03\u89c4\u5212\u4fe1\u606f\u6d41\u3001TVC\u3001\u54c1\u724c\u6545\u4e8b\u6216\u5e26\u8d27\u89c6\u9891\u5de5\u4f5c\u6d41\u3002",
  },
  {
    id: "comic_drama",
    title: "\u667a\u80fd\u6f2b\u5267",
    detail: "\u5267\u60c5\u5206\u955c / \u89d2\u8272\u4e00\u81f4\u77ed\u7247",
    prompt: "\u4ee5\u667a\u80fd\u6f2b\u5267\u6280\u80fd\u89c4\u5212\u5267\u60c5\u5206\u955c\u3001\u89d2\u8272\u4e00\u81f4\u6027\u548c\u77ed\u7247\u751f\u6210\u8282\u70b9\u3002",
  },
];
// \u7206\u6b3e\u5b9e\u9a8c\u5ba4(viral_lab)start-screen \u5361\u968f slice 7 \u62cd\u6cd5\u5e93\u4e00\u5e76\u4e0b\u7ebf;\u5f00\u5c4f\u6539\u968f\u673a\u5c55\u793a 6 \u4e2a\u62cd\u6cd5\u3002

// Slice 7 follow-up: pick n random crafts for the start-screen cards. Math.random
// is fine here (panel code, not a workflow script). Fisher-Yates, non-mutating.
function pickRandomCrafts(roster, n) {
  const arr = Array.isArray(roster) ? roster.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr.slice(0, Math.max(0, Number(n) || 0));
}

function appendClass(element, className) {
  if (!element || !className) {
    return element;
  }
  element.className = className;
  return element;
}

function createElement(documentRef, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  appendClass(element, className);
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function setHidden(element, hidden) {
  if (element) {
    element.hidden = Boolean(hidden);
  }
}

function addClass(element, className) {
  if (!element || !className) {
    return;
  }
  if (element.classList?.add) {
    element.classList.add(className);
    return;
  }
  const classes = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
  classes.add(className);
  element.className = Array.from(classes).join(" ");
}

// 会话历史信息分层助手: 相对时间 / 末条消息摘要 / 产出资产汇总。
function formatHistoryRelativeTime(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) {
    return "";
  }
  const diff = Date.now() - time;
  if (diff < 60000) return "刚刚";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function historyLastSnippet(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = String(messages[index]?.content || "").replace(/\s+/g, " ").trim();
    if (content) {
      return content;
    }
  }
  return "";
}

function historyGenerationSummary(conversation) {
  const tasks = Array.isArray(conversation?.generationTasks) ? conversation.generationTasks : [];
  let image = 0;
  let video = 0;
  let text = 0;
  for (const task of tasks) {
    const type = String(task?.nodeType || task?.type || "");
    if (/video/.test(type)) video += 1;
    else if (/image/.test(type)) image += 1;
    else if (/text/.test(type)) text += 1;
  }
  const parts = [];
  if (image) parts.push(`${image} 图`);
  if (video) parts.push(`${video} 视频`);
  if (text) parts.push(`${text} 文本`);
  return parts.join(" · ");
}

function removeClass(element, className) {
  if (!element || !className) {
    return;
  }
  if (element.classList?.remove) {
    element.classList.remove(className);
    return;
  }
  element.className = String(element.className || "")
    .split(/\s+/)
    .filter((item) => item && item !== className)
    .join(" ");
}

function bindRequirement(element, requirement) {
  if (!element || !requirement) {
    return element;
  }
  element.setAttribute?.("data-requires-backend", requirement);
  if (element.dataset) {
    element.dataset.requiresBackend = requirement;
  }
  return element;
}

function injectAssistantPanelStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== "function") {
    return;
  }
  if (typeof documentRef.getElementById === "function" && documentRef.getElementById(ASSISTANT_STYLE_ID)) {
    return;
  }
  const style = documentRef.createElement("style");
  style.id = ASSISTANT_STYLE_ID;
  style.textContent = `
.hy-canvas-agent-assistant{position:fixed;inset:0;z-index:2100;pointer-events:none;font-family:Inter,"Microsoft YaHei",system-ui,sans-serif;color:#f6f7f9}
.hy-canvas-agent-launcher{position:fixed;right:18px;bottom:18px;width:48px;height:48px;border:0;border-radius:999px;background:radial-gradient(circle at 38% 32%,#efffe6 0 8%,#a3ff89 18%,#62f06b 36%,#1d372b 72%,#0d1111 100%);color:#102014;box-shadow:0 0 24px rgba(128,255,139,.62),0 8px 30px rgba(0,0,0,.48);cursor:pointer;font-weight:900;letter-spacing:.02em;pointer-events:auto;animation:hyCanvasAgentPulse 3.4s ease-in-out infinite}
.fab-btn.hy-canvas-agent-fab-bound{background:radial-gradient(circle at 38% 32%,#f0ffe8 0 8%,#b8ff9b 18%,#6df875 38%,#234034 72%,#0d1111 100%)!important;box-shadow:0 0 24px rgba(130,255,140,.68),0 0 0 10px rgba(120,255,120,.05),0 12px 36px rgba(0,0,0,.48)!important;color:#102014!important;font-weight:900;letter-spacing:.02em;overflow:hidden}
.fab-btn.hy-canvas-agent-fab-bound svg{display:none}.fab-btn.hy-canvas-agent-fab-bound.is-assistant-open,.hy-canvas-agent-launcher.is-assistant-open{transform:scale(1.08)}
.hy-canvas-agent-fab-face{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;border-radius:inherit}.hy-canvas-agent-fab-face::before{content:"";position:absolute;inset:8px;border-radius:inherit;background:radial-gradient(circle at 50% 50%,rgba(211,255,185,.88),rgba(117,255,120,.48) 52%,rgba(58,198,83,.1) 78%,transparent);filter:blur(1px)}
.hy-canvas-agent-fab-label{position:relative;z-index:1;font-size:12px;font-weight:900;color:#172417}.hy-canvas-agent-fab-eyes{position:absolute;z-index:2;display:flex;gap:8px}.hy-canvas-agent-fab-eyes i{display:block;width:5px;height:8px;border-radius:999px;background:#151b17;box-shadow:0 0 1px rgba(0,0,0,.6)}
.hy-canvas-agent-panel{position:fixed;top:0;right:0;width:min(540px,100vw);height:100vh;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid rgba(255,255,255,.11);background:#101113;box-shadow:-24px 0 80px rgba(0,0,0,.52);pointer-events:auto;color:#f4f5f6}.hy-canvas-agent-panel[hidden]{display:none}
.hy-canvas-agent-head{height:70px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:#111214}.hy-canvas-agent-head-left{display:flex;align-items:center;min-width:0;gap:12px}.hy-canvas-agent-head-avatar{width:42px;height:42px;border-radius:999px;background:radial-gradient(circle,#e7ffd6 0 12%,#a8ff8d 28%,#5bf36d 47%,rgba(91,243,109,.24) 70%,transparent 72%);box-shadow:0 0 22px rgba(119,255,125,.62);position:relative;flex:0 0 auto}.hy-canvas-agent-head-avatar::before,.hy-canvas-agent-head-avatar::after{content:"";position:absolute;top:18px;width:4px;height:7px;border-radius:999px;background:#121714}.hy-canvas-agent-head-avatar::before{left:15px}.hy-canvas-agent-head-avatar::after{right:15px}
.hy-canvas-agent-title-wrap{min-width:0}.hy-canvas-agent-title{font-size:16px;font-weight:700;line-height:1.15;color:#f6f7f8;white-space:nowrap}.hy-canvas-agent-session-row{display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0}.hy-canvas-agent-session{font-size:11px;color:#7d828a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hy-canvas-agent-copy{width:18px;height:18px;border:0;background:transparent;color:#7e858d;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
.hy-canvas-agent-head-actions{display:flex;align-items:center;gap:14px}.hy-canvas-agent-icon-btn,.hy-canvas-agent-close{width:24px;height:24px;border:0;background:transparent;color:#b6bbc3;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;border-radius:999px}.hy-canvas-agent-icon-btn:hover,.hy-canvas-agent-close:hover{background:rgba(255,255,255,.06);color:#fff}.hy-canvas-agent-close{font-size:26px;font-weight:200;line-height:1;transform:translateY(-1px)}
.hy-canvas-agent-body{flex:1 1 auto;min-height:0;overflow:auto;padding:70px 32px 18px;background:#101113}.hy-canvas-agent-hero{display:flex;align-items:flex-start;gap:18px;margin-bottom:30px}.hy-canvas-agent-hero-orb{width:62px;height:62px;border-radius:999px;background:radial-gradient(circle at 50% 50%,#f0ffe7 0 8%,#baff9d 22%,#6dff78 42%,rgba(109,255,120,.2) 70%,transparent 72%);box-shadow:0 0 28px rgba(118,255,128,.72);position:relative;flex:0 0 auto}.hy-canvas-agent-hero-orb::before,.hy-canvas-agent-hero-orb::after{content:"";position:absolute;top:27px;width:5px;height:9px;border-radius:999px;background:#121714}.hy-canvas-agent-hero-orb::before{left:24px}.hy-canvas-agent-hero-orb::after{right:24px}.hy-canvas-agent-hello{margin-top:10px;font-size:18px;font-weight:600;color:#858a93}.hy-canvas-agent-question{margin-top:4px;font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-.04em;color:#f6f7f9}
.hy-canvas-agent-skill-kicker{font-size:12px;color:#7b8088;margin:0 0 18px 0}.hy-canvas-agent-skill-list{display:flex;flex-direction:column;gap:23px;margin:0 0 34px 0}.hy-canvas-agent-skill{appearance:none;border:0;background:transparent;color:inherit;display:grid;grid-template-columns:30px auto;gap:14px;align-items:center;padding:0;text-align:left;cursor:pointer}.hy-canvas-agent-skill:hover .hy-canvas-agent-skill-title{color:#fff}.hy-canvas-agent-skill-icon{width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:#a3a9b2;position:relative}.hy-canvas-agent-skill-icon svg{width:19px;height:19px;stroke:currentColor;fill:none}.hy-canvas-agent-skill:nth-child(4) .hy-canvas-agent-skill-icon::after,.hy-canvas-agent-skill:nth-child(5) .hy-canvas-agent-skill-icon::after{content:"";position:absolute;right:0;top:0;width:6px;height:6px;border-radius:999px;background:#b7ff37;box-shadow:0 0 8px rgba(183,255,55,.8)}.hy-canvas-agent-skill-title{font-size:14px;font-weight:800;color:#e7e9ee;margin-right:10px}.hy-canvas-agent-skill-detail{font-size:13px;color:#8b9098;line-height:1.5}
.hy-canvas-agent-messages{display:flex;flex-direction:column;gap:10px;margin:0 0 12px 0}.hy-canvas-agent-messages[hidden]{display:none}.hy-canvas-agent-message{max-width:88%;padding:10px 12px;border-radius:16px;font-size:13px;line-height:1.55;white-space:pre-wrap}.hy-canvas-agent-message.is-user{align-self:flex-end;background:#24272d;color:#f7f8fa}.hy-canvas-agent-message.is-assistant{align-self:flex-start;background:#17191d;color:#d8dce3;border:1px solid rgba(255,255,255,.06)}
.hy-canvas-agent-message-cards{display:grid;gap:6px;margin-top:8px}.hy-canvas-agent-card{border:1px solid rgba(255,255,255,.1);background:rgba(247,244,236,.08);border-radius:12px;padding:8px 10px;font-size:12px;color:#cfd5dc;white-space:normal}.hy-canvas-agent-card[aria-expanded="true"]{background:rgba(255,250,238,.12)}.hy-canvas-agent-card-title{display:block;width:100%;border:0;background:transparent;padding:0;text-align:left;font:inherit;font-weight:800;color:#f3f6f8;cursor:pointer}.hy-canvas-agent-card-summary{margin-top:2px;color:rgba(216,220,227,.7)}.hy-canvas-agent-card-detail{margin:6px 0 0;white-space:pre-wrap;color:rgba(216,220,227,.72);font:11px/1.45 inherit}.hy-canvas-agent-card-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}.hy-canvas-agent-card-cancel,.hy-canvas-agent-card-confirm{border:0;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}.hy-canvas-agent-card-cancel{background:rgba(255,255,255,.08);color:#d8dce3}.hy-canvas-agent-card-confirm{background:#b8ff37;color:#101714;font-weight:900}.hy-canvas-agent-card-cancel:disabled,.hy-canvas-agent-card-confirm:disabled{opacity:.55;cursor:default}.hy-canvas-agent-card-actions [data-selected="true"]{box-shadow:0 0 0 1px rgba(184,255,55,.45)}
.hy-canvas-agent-preview,.hy-canvas-agent-receipt{margin:0 32px 12px;padding:11px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.09);background:#17191d;color:#d9dde4;font-size:12px;line-height:1.5;pointer-events:auto}.hy-canvas-agent-preview{border-color:rgba(184,255,55,.18);background:rgba(184,255,55,.06)}.hy-canvas-agent-receipt{border-color:rgba(109,248,117,.18);background:rgba(109,248,117,.06)}
.hy-canvas-agent-compose{margin:0 14px 14px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:#17181c;box-shadow:0 18px 46px rgba(0,0,0,.32);padding:14px 16px 10px;pointer-events:auto}.hy-canvas-agent-execution-drawer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(184,255,55,.16);border-radius:16px;background:linear-gradient(135deg,rgba(184,255,55,.09),rgba(255,255,255,.04));box-shadow:0 12px 30px rgba(0,0,0,.22);color:#eef4ea}.hy-canvas-agent-execution-drawer[hidden]{display:none}.hy-canvas-agent-execution-line1{font-size:12px;font-weight:900;color:#f6f8f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hy-canvas-agent-execution-line2{margin-top:3px;font-size:12px;color:#aeb7aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hy-canvas-agent-execution-drawer[data-confirm="true"]{border-color:rgba(184,255,55,.45);background:linear-gradient(135deg,rgba(184,255,55,.16),rgba(184,255,55,.05));box-shadow:0 14px 36px rgba(120,200,40,.18)}.hy-canvas-agent-confirm-badges{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}.hy-canvas-agent-confirm-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px solid rgba(184,255,55,.35);background:rgba(184,255,55,.12);color:#d8f7a8;font-size:11px;font-weight:700}.hy-canvas-agent-execution-action[data-confirm="true"]{box-shadow:0 0 0 2px rgba(184,255,55,.35);font-size:13px;padding:0 14px}.hy-canvas-agent-execution-actions{display:flex;align-items:center;gap:6px}.hy-canvas-agent-execution-expand,.hy-canvas-agent-execution-action{height:28px;border:0;border-radius:999px;padding:0 10px;font-size:12px;font-weight:900;cursor:pointer}.hy-canvas-agent-execution-expand{background:rgba(255,255,255,.08);color:#dce3d7}.hy-canvas-agent-execution-action{background:#b8ff37;color:#101714}.hy-canvas-agent-execution-queue{grid-column:1/-1;margin-top:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}.hy-canvas-agent-execution-queue-warning{margin:0 0 8px;padding:7px 9px;border:1px solid rgba(255,214,102,.18);border-radius:10px;background:rgba(255,214,102,.08);color:#d7c789;font-size:11px;line-height:1.35}.hy-canvas-agent-execution-queue-list{display:flex;gap:8px;overflow:auto;padding-bottom:2px}.hy-canvas-agent-execution-queue-item{min-width:132px;max-width:190px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(15,17,19,.55);color:#dfe8d8;text-align:left;padding:8px 9px;cursor:pointer}.hy-canvas-agent-execution-queue-item[data-active="true"]{border-color:rgba(184,255,55,.32);background:rgba(184,255,55,.1)}.hy-canvas-agent-execution-queue-title,.hy-canvas-agent-execution-queue-status{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hy-canvas-agent-execution-queue-title{font-size:11px;font-weight:900}.hy-canvas-agent-execution-queue-status{margin-top:3px;font-size:10px;color:#98a393}.hy-canvas-agent-execution-detail{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}.hy-canvas-agent-execution-plan,.hy-canvas-agent-execution-timeline,.hy-canvas-agent-execution-event-detail{min-width:0;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(15,17,19,.45);padding:9px}.hy-canvas-agent-execution-timeline{max-height:220px;overflow:auto;scroll-behavior:smooth}.hy-canvas-agent-execution-side{display:grid;gap:8px;min-width:0}.hy-canvas-agent-execution-section-title{font-size:11px;font-weight:900;color:#f6f8f2;margin-bottom:6px}.hy-canvas-agent-execution-step,.hy-canvas-agent-execution-event,.hy-canvas-agent-execution-empty,.hy-canvas-agent-execution-event-detail-text,.hy-canvas-agent-execution-dependency-detail{font-size:11px;line-height:1.45;color:#b7c0b2;margin:0 0 5px}.hy-canvas-agent-execution-dependency-detail{color:#d9e8c8}.hy-canvas-agent-execution-event{display:block;width:100%;border:0;background:transparent;text-align:left;padding:0;cursor:pointer}.hy-canvas-agent-execution-event[data-selected="true"]{color:#f6f8f2}.hy-canvas-agent-execution-empty{color:#777f77}.hy-canvas-agent-body{position:relative}.hy-canvas-agent-execution-backdrop{position:absolute;inset:0;background:rgba(8,10,12,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:4;cursor:pointer}.hy-canvas-agent-execution-backdrop[hidden]{display:none}.hy-canvas-agent-execution-drawer[aria-expanded="true"]{box-shadow:0 -18px 56px rgba(0,0,0,.45);background:linear-gradient(135deg,rgba(184,255,55,.12),rgba(20,22,26,.94));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.hy-canvas-agent-execution-history-toggle{height:28px;border:0;border-radius:999px;padding:0 12px;font-size:12px;font-weight:900;cursor:pointer;background:rgba(255,255,255,.08);color:#dce3d7}.hy-canvas-agent-execution-history-search{grid-column:1/-1;margin-top:8px;height:28px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(15,17,19,.6);color:#eef1f5;padding:0 9px;font-size:12px;outline:none}.hy-canvas-agent-execution-history-list{grid-column:1/-1;display:grid;gap:6px;margin-top:8px}.hy-canvas-agent-execution-history-item{border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(15,17,19,.55);color:#dfe8d8;text-align:left;padding:7px 9px;font-size:11px;cursor:pointer}.hy-canvas-agent-execution-dev-toggle{margin-left:6px;height:20px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.06);color:#cfd8c9;font-size:10px;padding:0 6px;cursor:pointer}.hy-canvas-agent-execution-dev-json{grid-column:1/-1;max-height:180px;overflow:auto;font-size:10px;line-height:1.4;color:#9fb3a0;background:rgba(10,12,14,.7);border-radius:8px;padding:8px;white-space:pre-wrap}.hy-canvas-agent-execution-dag{margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.1)}.hy-canvas-agent-execution-dag-edge{font-size:10px;color:#9fb3a0;margin:0 0 4px}.hy-canvas-agent-execution-history-more{border:1px dashed rgba(255,255,255,.16);border-radius:10px;background:transparent;color:#9fb3a0;font-size:11px;padding:7px 9px;cursor:pointer}.hy-canvas-agent-execution-metrics{grid-column:1/-1;margin-top:6px;font-size:10px;line-height:1.5;color:#9fd8a8;background:rgba(10,14,12,.6);border-radius:8px;padding:6px 8px}.hy-canvas-agent-execution-dag-graph{margin:6px 0 0;font-size:10px;line-height:1.5;color:#cfe3c0;white-space:pre;overflow:auto}.hy-canvas-agent-execution-history-chips{grid-column:1/-1;display:flex;gap:6px;margin-top:8px}.hy-canvas-agent-execution-history-chip{height:22px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.05);color:#cfd8c9;font-size:10px;padding:0 9px;cursor:pointer}.hy-canvas-agent-execution-history-chip[data-selected='true']{border-color:rgba(184,255,55,.4);color:#d8ffb0}.hy-canvas-agent-execution-step-toggle,.hy-canvas-agent-execution-step-up,.hy-canvas-agent-execution-step-down{margin-left:6px;height:20px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.06);color:#cfd8c9;font-size:10px;padding:0 6px;cursor:pointer}.hy-canvas-agent-execution-step[draggable="true"]{cursor:grab}.hy-canvas-agent-compose-main{display:grid;grid-template-columns:50px minmax(0,1fr);gap:10px;align-items:center}.hy-canvas-agent-upload{width:48px;height:64px;border:1px solid rgba(255,255,255,.05);border-radius:8px;background:#26282f;color:#8d949e;font-size:26px;font-weight:200;cursor:pointer}.hy-canvas-agent-input{width:100%;min-height:42px;max-height:110px;resize:none;border:0;background:transparent;color:#eef1f5;outline:none;font:14px/1.5 inherit;padding:0}.hy-canvas-agent-input::placeholder{color:#747982}.hy-canvas-agent-compose-toolbar{display:flex;align-items:center;gap:14px;margin-top:10px;color:#848b95;font-size:13px}.hy-canvas-agent-mode-pill{height:34px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#202229;color:#eef1f4;padding:0 11px;display:inline-flex;align-items:center;gap:6px;font-weight:700}.hy-canvas-agent-tool-btn{height:30px;border:0;background:transparent;color:#858c96;padding:0 2px;cursor:pointer}.hy-canvas-agent-tool-btn:hover{color:#fff}.hy-canvas-agent-toolbar-spacer{flex:1 1 auto}.hy-canvas-agent-ask{display:inline-flex;align-items:center;gap:6px;color:#b4b9c1}.hy-canvas-agent-lab{white-space:nowrap;color:#aeb4bd}.hy-canvas-agent-send,.hy-canvas-agent-apply{border:0;border-radius:999px;min-width:34px;height:34px;color:#0e1117;background:#b8ff37;font-weight:900;cursor:pointer}.hy-canvas-agent-send{background:#22262d;color:#3a3f47}.hy-canvas-agent-send:hover{color:#9ca3ad}.hy-canvas-agent-apply{margin-left:6px}.hy-canvas-agent-send:disabled,.hy-canvas-agent-apply:disabled{opacity:.55;cursor:wait}.hy-canvas-agent-actions{display:flex;align-items:center;gap:4px}
.hy-canvas-agent-attachments{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px 0;padding:0 0 2px 0}.hy-canvas-agent-attachments[hidden]{display:none}.hy-canvas-agent-attachment-thumb{position:relative;width:54px;height:54px;border:1px solid rgba(184,255,55,.2);border-radius:12px;background:#23262d;overflow:hidden;cursor:zoom-in;color:#dfe8d7}.hy-canvas-agent-attachment-thumb img{width:100%;height:100%;object-fit:cover;display:block}.hy-canvas-agent-attachment-file{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:6px;box-sizing:border-box;color:#dfe8d7;font-size:10px;text-align:center;line-height:1.2}.hy-canvas-agent-attachment-remove{position:absolute;right:3px;top:3px;width:16px;height:16px;border:0;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;line-height:16px;padding:0;cursor:pointer}.hy-canvas-agent-attachment-preview{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:28px;pointer-events:auto}.hy-canvas-agent-attachment-preview[hidden]{display:none}.hy-canvas-agent-attachment-preview img{max-width:min(86vw,760px);max-height:82vh;border-radius:18px;box-shadow:0 20px 80px rgba(0,0,0,.58)}.hy-canvas-agent-attachment-preview-close{position:absolute;right:24px;top:20px;width:34px;height:34px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer}
.hy-canvas-agent-history{position:absolute;top:70px;right:14px;width:300px;max-height:420px;overflow:auto;z-index:2;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:#17191d;box-shadow:0 18px 60px rgba(0,0,0,.48);padding:12px;pointer-events:auto}.hy-canvas-agent-history[hidden]{display:none}.hy-canvas-agent-history-title{font-size:12px;font-weight:900;color:#f2f4f7;margin:2px 4px 10px}.hy-canvas-agent-history-search{box-sizing:border-box;width:100%;height:30px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#101216;color:#eef1f5;outline:none;padding:0 9px;margin:0 0 10px;font:12px/1 inherit}.hy-canvas-agent-history-empty{font-size:12px;color:#858b94;padding:12px 4px}.hy-canvas-agent-history-row{display:grid;grid-template-columns:minmax(0,1fr) 28px;gap:6px;align-items:stretch;margin:0 0 8px}.hy-canvas-agent-history-item{width:100%;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#202229;color:#dfe3ea;text-align:left;font-size:12px;line-height:1.35;padding:10px;cursor:pointer}.hy-canvas-agent-history-delete{border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#202229;color:#8e949d;cursor:pointer}.hy-canvas-agent-history-delete:hover,.hy-canvas-agent-history-item:hover{border-color:rgba(184,255,55,.22);background:#252832;color:#fff}
.hy-canvas-agent-model-menu{position:absolute;left:16px;bottom:92px;width:300px;max-height:280px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#17191d;box-shadow:0 18px 60px rgba(0,0,0,.48);padding:10px;pointer-events:auto}.hy-canvas-agent-model-menu[hidden]{display:none}.hy-canvas-agent-model-option{width:100%;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#202229;color:#dfe3ea;text-align:left;font-size:12px;line-height:1.35;padding:10px;margin:0 0 8px;cursor:pointer}.hy-canvas-agent-model-option:hover{border-color:rgba(184,255,55,.22);background:#252832;color:#fff}.hy-canvas-agent-model-provider{display:block;font-weight:900;color:#f2f4f7}.hy-canvas-agent-model-meta{display:block;color:#8e949d;margin-top:2px}
.hy-canvas-agent-mention-menu{position:absolute;left:120px;bottom:92px;width:320px;max-height:360px;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#17191d;box-shadow:0 18px 60px rgba(0,0,0,.48);padding:10px;pointer-events:auto;z-index:3}.hy-canvas-agent-mention-menu[hidden]{display:none}.hy-canvas-agent-mention-option{width:100%;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#202229;color:#dfe3ea;text-align:left;font-size:12px;line-height:1.35;padding:9px 10px;margin:0 0 6px;cursor:pointer}.hy-canvas-agent-mention-option:hover{border-color:rgba(184,255,55,.22);background:#252832;color:#fff}.hy-canvas-agent-mention-empty,.hy-canvas-agent-mention-group,.hy-canvas-agent-mention-category{font-size:12px;font-weight:900;color:#f2f4f7;margin:8px 4px 6px}.hy-canvas-agent-mention-category.is-disabled,.hy-canvas-agent-mention-empty{color:#717882}.hy-canvas-agent-mention-search{box-sizing:border-box;width:100%;height:30px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#101216;color:#eef1f5;outline:none;padding:0 9px;margin:0 0 8px;font:12px/1 inherit}
.hy-canvas-agent-strong-confirm{margin:0 32px 12px;height:34px;border:1px solid rgba(255,190,80,.35);border-radius:999px;background:rgba(255,190,80,.12);color:#ffd29a;font-size:12px;font-weight:900;pointer-events:auto;cursor:pointer}.hy-canvas-agent-strong-confirm[hidden]{display:none}
@keyframes hyCanvasAgentPulse{0%,100%{box-shadow:0 0 24px rgba(128,255,139,.62),0 8px 30px rgba(0,0,0,.48)}50%{box-shadow:0 0 34px rgba(128,255,139,.82),0 0 0 10px rgba(128,255,139,.07),0 8px 30px rgba(0,0,0,.48)}}
@media (max-width:640px){.hy-canvas-agent-panel{width:100vw}.hy-canvas-agent-body{padding:48px 24px 16px}.hy-canvas-agent-question{font-size:28px}.hy-canvas-agent-compose-toolbar{gap:10px;font-size:12px}.hy-canvas-agent-lab{display:none}}`;
  documentRef.head.appendChild(style);
}

// Status label table (slice 5): a COMPLETE map over INTERACTION_CARD_STATUSES —
// appAssistantPanel.statusCoverage.test.js fails if any status lacks a label, so
// adding a status to the set without a label here can't silently degrade to
// "状态未知". needs_clarification/archived are normally rendered by the dedicated
// clarification-card branches, but a canvas_actions card carrying either must
// still read sensibly.
function cardStatusText(status) {
  const map = {
    pending: "等待执行",
    needs_confirmation: "等待确认",
    needs_clarification: "待澄清",
    needs_action: "待选择",
    preview: "待确认",
    running: "执行中",
    preparing: "准备中",
    generating: "生成中",
    retryable: "可重试",
    paused: "已暂停",
    completed: "已完成",
    cancelled: "已取消",
    archived: "已归档",
    failed: "失败",
  };
  return map[status] || "状态未知";
}

function formatOperationCardDetails(card = {}) {
  const result = card.result && typeof card.result === "object" ? card.result : {};
  const nodeIds = [
    ...(Array.isArray(result.createdNodeIds) ? result.createdNodeIds : []),
    ...(Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds : []),
    ...(Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds : []),
    ...(Array.isArray(card.operation?.nodeIds) ? card.operation.nodeIds : []),
  ].map(safeTrim).filter(Boolean);
  const uniqueNodeIds = [...new Set(nodeIds)];
  const lines = [];
  if (uniqueNodeIds.length) lines.push(`节点: ${uniqueNodeIds.join(", ")}`);
  const receipts = Array.isArray(card.executionDetails?.receipts) ? card.executionDetails.receipts : [];
  for (const receipt of receipts.slice(0, 6)) {
    const skill = safeTrim(receipt.skillId || receipt.title || receipt.type || "canvas skill");
    const nodeId = safeTrim(receipt.nodeId);
    const model = safeTrim(receipt.paramsSummary?.modelDisplayName || receipt.modelDisplayName || receipt.modelId);
    const refs = Number(receipt.paramsSummary?.referenceCount ?? receipt.referenceCount ?? 0) || 0;
    lines.push([skill, nodeId ? `节点 ${nodeId}` : "", model ? `模型 ${model}` : "", refs ? `参考 ${refs} 个` : ""].filter(Boolean).join(" / "));
  }
  const traces = Array.isArray(card.executionDetails?.traces) ? card.executionDetails.traces : [];
  if (traces.length) {
    lines.push(`执行明细: ${traces.map((trace) => safeTrim(trace.skillId || trace.title || "skill")).filter(Boolean).join(", ")}`);
  }
  const warnings = [
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...(Array.isArray(card.executionDetails?.warnings) ? card.executionDetails.warnings : []),
  ].map(safeTrim).filter(Boolean);
  if (warnings.length) lines.push(`提示: ${[...new Set(warnings)].join("; ")}`);
  return lines.join("\n");
}

function cardStepLabel(stage) {
  return launchStepLabel(stage);
}

function renderInteractionCard(
  documentRef,
  card,
  { onConfirm, onCancel, onToggle, onClarifyTarget, onCardOption, onLaunchChip, onContractConfirm, onContractCancel } = {}
) {
  const cardEl = createElement(documentRef, "article", "hy-canvas-agent-card");
  cardEl.setAttribute?.("data-card-id", card?.id || "");
  cardEl.setAttribute?.("data-card-type", card?.type || "");
  cardEl.setAttribute?.("data-status", card?.status || "");
  cardEl.setAttribute?.("aria-expanded", card?.expanded ? "true" : "false");
  if (card?.type === "queue_title_clarification") {
    const resolved = card?.status !== "needs_clarification";
    const selectedCandidateId = safeTrim(card?.selectedCandidateId);
    const candidates = normalizeQueueTitleClarificationCandidates(card?.candidates);
    cardEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-card-title", card?.title || "\u9009\u62e9\u6392\u961f\u4efb\u52a1"));
    cardEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-card-summary", card?.summary || ""));
    const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
    candidates.forEach((candidate, index) => {
      const button = createElement(
        documentRef,
        "button",
        "hy-canvas-agent-card-confirm hy-canvas-agent-queue-title-candidate",
        `${index + 1}. ${candidate.title || candidate.id}`
      );
      button.type = "button";
      button.disabled = resolved;
      button.setAttribute?.("aria-disabled", resolved ? "true" : "false");
      button.setAttribute?.("data-candidate-id", candidate.id);
      if (selectedCandidateId && selectedCandidateId === candidate.id) {
        button.setAttribute?.("data-selected", "true");
      }
      if (!resolved) {
        button.addEventListener("click", () => {
          button.setAttribute?.("data-selected", "true");
          onClarifyTarget?.(card, candidate.id);
        });
      }
      actions.appendChild(button);
    });
    cardEl.appendChild(actions);
    return cardEl;
  }
  if (card?.type === "execution_control_clarification") {
    const resolved = card?.status !== "needs_clarification";
    const selectedTarget = safeTrim(card?.selectedTarget);
    cardEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-card-title", card?.title || "\u9009\u62e9\u4efb\u52a1"));
    cardEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-card-summary", card?.summary || ""));
    const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
    const queue = createElement(
      documentRef,
      "button",
      "hy-canvas-agent-card-cancel hy-canvas-agent-clarify-queue",
      card?.queueLabel || "\u6392\u961f\u4efb\u52a1"
    );
    const current = createElement(
      documentRef,
      "button",
      "hy-canvas-agent-card-confirm hy-canvas-agent-clarify-current",
      card?.activeLabel || "\u5f53\u524d\u4efb\u52a1"
    );
    queue.type = "button";
    current.type = "button";
    queue.disabled = resolved;
    current.disabled = resolved;
    queue.setAttribute?.("aria-disabled", resolved ? "true" : "false");
    current.setAttribute?.("aria-disabled", resolved ? "true" : "false");
    if (selectedTarget === "queue") {
      queue.setAttribute?.("data-selected", "true");
    }
    if (selectedTarget === "active") {
      current.setAttribute?.("data-selected", "true");
    }
    if (!resolved) {
      queue.addEventListener("click", () => onClarifyTarget?.(card, "queue"));
      current.addEventListener("click", () => onClarifyTarget?.(card, "active"));
    }
    actions.appendChild(queue);
    actions.appendChild(current);
    cardEl.appendChild(actions);
    return cardEl;
  }
  if (card?.type === "vimax_render") {
    // Slice 3: a 成片 render is a backgroundable 傻卡 (dumb status bar) — a
    // lifecycle status pill + 已出 N/总 帧 progress + the live summary. NO
    // god-card toggle and NO confirm/cancel buttons; cancel is the send-button
    // ⏹ (slice 0), and the status is lane-driven (never node-synced). The
    // background class marks it for the 吸附区 后台细条 (slice 6).
    addClass(cardEl, "hy-canvas-agent-card-render");
    if (card?.background) {
      addClass(cardEl, "hy-canvas-agent-card-background");
    }
    const statusLabel =
      { running: "出图中", completed: "已收工", cancelled: "已取消", failed: "失败" }[card?.status] || "出图中";
    const head = createElement(documentRef, "div", "hy-canvas-agent-card-render-head");
    head.appendChild(createElement(documentRef, "span", "hy-canvas-agent-card-render-title", card?.title || "成片渲染"));
    head.appendChild(
      createElement(documentRef, "span", `hy-canvas-agent-card-render-status is-${card?.status || "running"}`, statusLabel)
    );
    cardEl.appendChild(head);
    const shotCount = Number(card?.shotCount);
    if (Number.isFinite(shotCount) && shotCount > 0) {
      const landed = Number(card?.landedCount) || 0;
      cardEl.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-card-render-progress", `已出 ${landed}/${shotCount} 帧`)
      );
    }
    cardEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-card-summary", card?.summary || ""));
    return cardEl;
  }
  const title = createElement(documentRef, "button", "hy-canvas-agent-card-title", card?.title || "画布交互");
  title.type = "button";
  title.addEventListener("click", () => {
    if (card) {
      card.expanded = !card.expanded;
      onToggle?.(card);
    }
  });
  cardEl.appendChild(title);
  cardEl.appendChild(
    createElement(
      documentRef,
      "div",
      "hy-canvas-agent-card-summary",
      `${cardStatusText(card?.status)} · ${card?.summary || ""}`.trim()
    )
  );

  // D4: living paused card — step progress (story✓/cast✓/storyboard⏸) + inline
  // [继续]/[取消] chips. The chips dispatch the SAME 继续/取消 commands as typing
  // them (option.command), so both entries flow through the one resume handler.
  // Gate on pausedReason: a generation-node-synced canvas_actions card can also
  // carry status:"paused" (refreshSyncedOperationCards) but has no pausedReason —
  // it must fall through to the normal detail block, not this living-card branch.
  if (card?.status === "paused" && card?.pausedReason) {
    const steps = Array.isArray(card.steps) ? card.steps : [];
    if (steps.length) {
      const stepsEl = createElement(documentRef, "div", "hy-canvas-agent-card-steps");
      steps.forEach((step) => {
        const mark = step?.status === "landed" ? "✓" : step?.status === "running" ? "▷" : "⏸";
        stepsEl.appendChild(
          createElement(
            documentRef,
            "div",
            `hy-canvas-agent-card-step is-${step?.status || "pending"}`,
            `${mark} ${cardStepLabel(step?.stage)}`
          )
        );
      });
      cardEl.appendChild(stepsEl);
    }
    const options = Array.isArray(card.options) ? card.options : [];
    if (options.length) {
      const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
      options.forEach((option) => {
        const tone = option?.id === "resume" ? "hy-canvas-agent-card-confirm" : "hy-canvas-agent-card-cancel";
        const btn = createElement(documentRef, "button", `hy-canvas-agent-card-option ${tone}`, option?.label || "");
        btn.type = "button";
        btn.setAttribute?.("data-option-id", option?.id || "");
        if (option?.aria) {
          btn.setAttribute?.("aria-label", option.aria);
        }
        btn.addEventListener("click", () => onCardOption?.(card, option));
        actions.appendChild(btn);
      });
      cardEl.appendChild(actions);
    }
    return cardEl;
  }

  // D5: launch chips (needs_action) — provider-suggested entry chips. Clicking a
  // chip derives its contract PREVIEW (no spend, no execute); it never lands.
  if (card?.status === "needs_action") {
    const chips = Array.isArray(card.options) ? card.options : [];
    if (chips.length) {
      const row = createElement(documentRef, "div", "hy-canvas-agent-card-chips");
      chips.forEach((chip) => {
        const tone = chip?.costTier === "confirm" ? "is-cost-confirm" : "is-cost-free";
        const btn = createElement(documentRef, "button", `hy-canvas-agent-launch-chip ${tone}`, chip?.label || "");
        btn.type = "button";
        btn.setAttribute?.("data-chip-id", chip?.id || "");
        if (chip?.aria) {
          btn.setAttribute?.("aria-label", chip.aria);
        }
        if (chip?.tooltip) {
          btn.setAttribute?.("title", chip.tooltip);
        }
        btn.addEventListener("click", () => onLaunchChip?.(card, chip));
        row.appendChild(btn);
      });
      cardEl.appendChild(row);
    }
    return cardEl;
  }

  // D5: contract preview — show what the chip will produce (N nodes · cost · flow)
  // before committing. [确认开始] synthesizes the command (B3 lands it); [取消]
  // returns to the chip row.
  if (card?.status === "preview" && card?.contract) {
    const contract = card.contract;
    const body = createElement(documentRef, "div", "hy-canvas-agent-card-contract");
    body.appendChild(
      createElement(documentRef, "div", "hy-canvas-agent-contract-nodes", launchContractNodesText(contract.nodeCount))
    );
    const cost = contract.cost || {};
    const costText = launchPreviewCostText(cost);
    body.appendChild(
      createElement(documentRef, "div", `hy-canvas-agent-contract-cost is-${cost.tier || "free"}`, costText)
    );
    if (Array.isArray(contract.flow) && contract.flow.length) {
      body.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-contract-flow", contract.flow.join(LAUNCH_STRINGS.flowSeparator))
      );
    }
    cardEl.appendChild(body);
    const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
    const confirm = createElement(
      documentRef,
      "button",
      "hy-canvas-agent-card-confirm hy-canvas-agent-contract-confirm",
      LAUNCH_STRINGS.contractConfirm
    );
    const cancel = createElement(
      documentRef,
      "button",
      "hy-canvas-agent-card-cancel hy-canvas-agent-contract-cancel",
      LAUNCH_STRINGS.contractCancel
    );
    confirm.type = "button";
    cancel.type = "button";
    confirm.addEventListener("click", () => onContractConfirm?.(card));
    cancel.addEventListener("click", () => onContractCancel?.(card));
    actions.appendChild(confirm);
    actions.appendChild(cancel);
    cardEl.appendChild(actions);
    return cardEl;
  }

  // D7: a launch card past confirm (running) keeps a compact cost row so the
  // 约N → real-count update (+ 已更新 badge) stays visible while B3 runs.
  if (card?.type === "launch" && card?.status === "running" && card?.contract?.cost) {
    const cost = card.contract.cost;
    const costText = launchRunningCostText(cost);
    const row = createElement(documentRef, "div", `hy-canvas-agent-contract-cost is-${cost.tier || "free"}`, costText);
    if (card.contract.updated) {
      row.appendChild(createElement(documentRef, "span", "hy-canvas-agent-cost-updated-badge", LAUNCH_STRINGS.updatedBadge));
    }
    cardEl.appendChild(row);
    return cardEl;
  }

  if (card?.expanded || card?.status === "failed" || card?.status === "cancelled") {
    const detailText = card?.error || formatOperationCardDetails(card);
    if (detailText) {
      cardEl.appendChild(createElement(documentRef, "pre", "hy-canvas-agent-card-detail", detailText));
    }
  }

  const canConfirm =
    card?.requiresConfirmation && card?.status === "needs_confirmation";
  if (canConfirm) {
    const actions = createElement(documentRef, "div", "hy-canvas-agent-card-actions");
    const cancel = createElement(documentRef, "button", "hy-canvas-agent-card-cancel", "取消");
    const confirm = createElement(documentRef, "button", "hy-canvas-agent-card-confirm", "确认生成");
    cancel.type = "button";
    confirm.type = "button";
    cancel.addEventListener("click", () => onCancel?.(card));
    confirm.addEventListener("click", () => onConfirm?.(card));
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    cardEl.appendChild(actions);
  }

    return cardEl;
}

// 消息动作条图标(以 createElement 构建 svg/path, 适配测试 fake DOM 无 innerHTML)。
const MSG_ICON_COPY = [
  { tag: "rect", attrs: { x: "9", y: "9", width: "13", height: "13", rx: "2" } },
  { tag: "path", attrs: { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" } },
];
const MSG_ICON_CHECK = [{ tag: "path", attrs: { d: "M20 6 9 17l-5-5" } }];
const MSG_ICON_UP = [
  { tag: "path", attrs: { d: "M7 10v11" } },
  { tag: "path", attrs: { d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" } },
];
const MSG_ICON_DOWN = [
  { tag: "path", attrs: { d: "M17 14V3" } },
  { tag: "path", attrs: { d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" } },
];

// SVG 元素必须用 createElementNS 创建, 否则浏览器当成未知 HTML 元素不渲染(测试 fake DOM 无此方法 → 兜底)。
const HY_SVG_NS = "http://www.w3.org/2000/svg";
function createSvgNode(documentRef, tag) {
  if (documentRef && typeof documentRef.createElementNS === "function") {
    return documentRef.createElementNS(HY_SVG_NS, tag);
  }
  return documentRef.createElement(tag);
}

function createMsgActionSvg(documentRef, shapes) {
  const svg = createSvgNode(documentRef, "svg");
  svg.setAttribute?.("viewBox", "0 0 24 24");
  svg.setAttribute?.("fill", "none");
  svg.setAttribute?.("stroke", "currentColor");
  svg.setAttribute?.("stroke-width", "2");
  svg.setAttribute?.("stroke-linecap", "round");
  svg.setAttribute?.("stroke-linejoin", "round");
  shapes.forEach((shape) => {
    const node = createSvgNode(documentRef, shape.tag);
    Object.keys(shape.attrs).forEach((key) => node.setAttribute?.(key, shape.attrs[key]));
    svg.appendChild(node);
  });
  return svg;
}

function setMsgActionIcon(documentRef, button, shapes) {
  if (!button) {
    return;
  }
  button.replaceChildren?.();
  button.appendChild(createMsgActionSvg(documentRef, shapes));
}

// 消息动作条: 助手回复 → 复制 / 认同 / 不认同; 用户消息 → 复制。认同/不认同互斥可取消, 状态记在 message.feedback。
function buildMessageActionBar(documentRef, message, role, handlers) {
  const bar = createElement(documentRef, "div", "hy-canvas-agent-msg-actions");
  const makeButton = (variant, label, shapes) => {
    const button = createElement(documentRef, "button", `hy-canvas-agent-msg-act ${variant}`);
    button.type = "button";
    button.setAttribute?.("aria-label", label);
    button.setAttribute?.("title", label);
    setMsgActionIcon(documentRef, button, shapes);
    bar.appendChild(button);
    return button;
  };
  const copyButton = makeButton("hy-msg-copy", "复制", MSG_ICON_COPY);
  copyButton.addEventListener("click", () => handlers.onCopy?.(message, copyButton, documentRef));
  if (role === "assistant") {
    const upButton = makeButton("hy-msg-up", "认同", MSG_ICON_UP);
    const downButton = makeButton("hy-msg-down", "不认同", MSG_ICON_DOWN);
    if (message?.feedback === "up") addClass(upButton, "is-active");
    if (message?.feedback === "down") addClass(downButton, "is-active");
    upButton.addEventListener("click", () => handlers.onFeedback?.(message, "up", upButton, downButton));
    downButton.addEventListener("click", () => handlers.onFeedback?.(message, "down", upButton, downButton));
  }
  return bar;
}

function refreshMessageCards(documentRef, entry, message, cardHandlers) {
  if (!entry) {
    return;
  }
  const cards = message?.role === "assistant" && Array.isArray(message?.cards) ? message.cards : [];
  if (entry.cardsEl) {
    entry.cardsEl.remove?.();
    entry.cardsEl = null;
  }
  if (cards.length) {
    const cardsEl = createElement(documentRef, "div", "hy-canvas-agent-message-cards");
    cards.forEach((card) => cardsEl.appendChild(renderInteractionCard(documentRef, card, cardHandlers)));
    entry.root.appendChild(cardsEl);
    entry.cardsEl = cardsEl;
  }
  // 动作条始终置于消息末尾(卡片重建后再 append 移到最后)。
  if (entry.actionsEl) {
    entry.root.appendChild(entry.actionsEl);
  }
}

// 消息「实时态」: 流式打字中(is-typing 闪烁光标)隐藏动作条; 完成且有内容才显示动作条。
function applyMessageLiveState(entry, isTyping, hasContent) {
  if (!entry?.textEl) {
    return;
  }
  if (isTyping) {
    addClass(entry.textEl, "is-typing");
  } else {
    removeClass(entry.textEl, "is-typing");
  }
  if (entry.actionsEl) {
    setHidden(entry.actionsEl, isTyping || !hasContent);
  }
}

function buildMessageNode(documentRef, messagesEl, message, cardHandlers, animate) {
  const role = message?.role === "user" ? "user" : "assistant";
  const roleClass = role === "user" ? "is-user" : "is-assistant";
  const content = String(message?.content || "");
  const item = createElement(documentRef, "div", `hy-canvas-agent-message ${roleClass}`);
  if (animate) {
    addClass(item, "hy-msg-enter");
  }
  const textEl = createElement(documentRef, "div", "hy-canvas-agent-message-text");
  textEl.textContent = content;
  item.appendChild(textEl);
  messagesEl.appendChild(item);
  const entry = { root: item, textEl, role, content, cardsEl: null, actionsEl: null };
  refreshMessageCards(documentRef, entry, message, cardHandlers);
  entry.actionsEl = buildMessageActionBar(documentRef, message, role, cardHandlers);
  item.appendChild(entry.actionsEl);
  return entry;
}

// 增量协调(流式友好): 既有节点角色与列表前缀一致 → 复用节点, 内容变化(状态层 typeIntoAssistantMessage
//   逐字增长)就地更新文本, 不全量重建 → 流式不闪烁、保滚动; 末尾新增追加 + 入场动画;
//   角色错位(会话切换/历史加载)→ 全量重建兜底。cardHandlers.streaming 时给最后一条标流式光标。
export function renderMessages(documentRef, messagesEl, messages, cardHandlers = {}) {
  if (!messagesEl) {
    return;
  }
  const list = Array.isArray(messages) ? messages : [];
  setHidden(messagesEl, list.length === 0);
  const nodes = messagesEl.__hyMsgNodes || (messagesEl.__hyMsgNodes = []);
  const prevCount = nodes.length;
  const typingIndex = cardHandlers.streaming ? list.length - 1 : -1;

  let reconcilable = list.length >= prevCount;
  if (reconcilable) {
    for (let i = 0; i < prevCount; i += 1) {
      const role = list[i]?.role === "user" ? "user" : "assistant";
      if (!nodes[i] || nodes[i].role !== role) {
        reconcilable = false;
        break;
      }
    }
  }

  if (!reconcilable) {
    messagesEl.replaceChildren?.();
    nodes.length = 0;
    for (let i = 0; i < list.length; i += 1) {
      const content = String(list[i]?.content || "");
      const entry = buildMessageNode(documentRef, messagesEl, list[i], cardHandlers, false);
      applyMessageLiveState(entry, i === typingIndex, content.length > 0);
      nodes.push(entry);
    }
    return;
  }

  // 既有消息: 流式增长就地更新文本(不重建 → 不闪烁) + 刷新卡片 + 打字光标/动作条
  for (let i = 0; i < prevCount; i += 1) {
    const content = String(list[i]?.content || "");
    if (nodes[i].content !== content) {
      nodes[i].textEl.textContent = content;
      nodes[i].content = content;
    }
    refreshMessageCards(documentRef, nodes[i], list[i], cardHandlers);
    applyMessageLiveState(nodes[i], i === typingIndex, content.length > 0);
  }
  // 新增消息: 追加 + 入场动画(1~2 条实时追加才动画, 批量历史加载不动画)
  const appended = list.length - prevCount;
  const animate = appended >= 1 && appended <= 2;
  for (let i = prevCount; i < list.length; i += 1) {
    const content = String(list[i]?.content || "");
    const entry = buildMessageNode(documentRef, messagesEl, list[i], cardHandlers, animate);
    applyMessageLiveState(entry, i === typingIndex, content.length > 0);
    nodes.push(entry);
  }
}

function createIcon(documentRef, name) {
  const icon = createElement(documentRef, "span", "hy-canvas-agent-skill-icon");
  icon.setAttribute?.("aria-hidden", "true");
  const svg = createSvgNode(documentRef, "svg");
  svg.setAttribute?.("viewBox", "0 0 24 24");
  svg.setAttribute?.("stroke-width", "1.8");
  svg.setAttribute?.("stroke-linecap", "round");
  svg.setAttribute?.("stroke-linejoin", "round");
  const path = createSvgNode(documentRef, "path");
  const paths = {
    bag: "M6 8h12l-1 12H7L6 8Zm3 0a3 3 0 0 1 6 0",
    book: "M5 5.5A3.5 3.5 0 0 1 8.5 2H20v17H8.5A3.5 3.5 0 0 0 5 22V5.5Zm0 0A3.5 3.5 0 0 0 1.5 2H1v17h.5A3.5 3.5 0 0 1 5 22",
    shield: "M12 3 19 6v5c0 4.2-2.7 7.5-7 9-4.3-1.5-7-4.8-7-9V6l7-3Z",
    cube: "M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9",
    play: "M8 5v14l11-7-11-7Z",
    film: "M4 5h16v14H4V5Zm4 0v14M16 5v14M4 9h4M16 9h4M4 15h4M16 15h4",
    tv: "M5 7h14v10H5V7Zm5-4 2 3 2-3",
    flame: "M12 21c-3.4 0-6-2.5-6-5.8 0-2.1 1.2-4.2 3.7-6.2.3 1.8 1.1 3 2.4 3.8-.3-2.9 1-5.1 3.9-6.8.2 2.8 2 4.2 2 7.8 0 3.8-2.6 7.2-6 7.2Z",
  };
  path.setAttribute?.("d", paths[name] || paths.play);
  svg.appendChild(path);
  icon.appendChild(svg);
  return icon;
}

function createFabFace(documentRef, label = "RH") {
  const face = createElement(documentRef, "span", "hy-canvas-agent-fab-face");
  const eyes = createElement(documentRef, "span", "hy-canvas-agent-fab-eyes");
  eyes.appendChild(createElement(documentRef, "i", ""));
  eyes.appendChild(createElement(documentRef, "i", ""));
  const text = createElement(documentRef, "span", "hy-canvas-agent-fab-label", label);
  face.appendChild(eyes);
  face.appendChild(text);
  return face;
}

function syncLauncherOpenState(launcher, isOpen) {
  if (!launcher) {
    return;
  }
  if (isOpen) {
    addClass(launcher, "is-assistant-open");
  } else {
    removeClass(launcher, "is-assistant-open");
  }
}

function shouldShowReceipt(text) {
  const value = String(text || "").trim();
  if (!value) {
    return false;
  }
  return /failed|error|invalid|requires|unauthorized|network|缺少|失败|错误|校验|需要|请先|无法|未配置/i.test(value);
}

export function createAppAssistantPanel({
  document: documentRef = globalThis.document,
  api,
  graphStore,
  buildContext = () => ({}),
  conversationStore = null,
  conversationId = "",
  attachmentStore = createAssistantAttachmentStore(),
  selectedModel = null,
  modelOptions = [],
  modelConfigRequired = false,
  agentMode = "",
  localStorage = globalThis.localStorage,
  executeActions = executeAssistantActions,
  templateStore = null,
  canvasSkillsRuntime = null,
  executionStore = createAssistantExecutionStore(),
  executionSyncClient = null,
  executionOrchestrator = null,
  summarizeActions = summarizeAssistantActions,
  launcherElement = null,
  userName = DEFAULT_USER_NAME,
  sessionLabel = DEFAULT_SESSION_LABEL,
  noticeDurationMs = 3000,
  noticeFadeMs = 160,
  setTimeoutFn = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout?.bind(globalThis),
  directorLegacyQmai = false,
} = {}) {
  const state = createAssistantPanelState({
    api,
    graphStore,
    buildContext,
    conversationStore,
    conversationId,
    attachmentStore,
    selectedModel,
    modelOptions,
    modelConfigRequired,
    agentMode,
    localStorage,
    executeActions,
    templateStore,
    canvasSkillsRuntime,
    executionStore,
    executionSyncClient,
    summarizeActions,
    directorLegacyQmai,
  });
  const resolvedExecutionSyncClient =
    executionSyncClient === false ? null : executionSyncClient || createAssistantExecutionApiClient();
  function graphNodeForUndo(nodeId) {
    const id = String(nodeId ?? "").trim();
    if (!id) {
      return null;
    }
    const nodes = resolveGraphNodes(graphStore);
    return nodes.find((node) => String(node?.id ?? "").trim() === id) || null;
  }
  function graphNodeSignature(nodeId) {
    const node = graphNodeForUndo(nodeId);
    if (!node) {
      return "";
    }
    try {
      return JSON.stringify({ name: node.name || "", data: node.data || {} });
    } catch {
      return "";
    }
  }
  function graphNodePositionSignature(nodeId) {
    const node = graphNodeForUndo(nodeId);
    if (!node) {
      return "";
    }
    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return "";
    }
    return JSON.stringify({ x, y });
  }
  function applyGraphInverseOps(ops = []) {
    const removedNodeIds = [];
    const removedEdgeIds = [];
    const restoredNodeIds = [];
    const conflicts = [];
    for (const op of Array.isArray(ops) ? ops : []) {
      const type = String(op?.type ?? "").trim();
      if (type === "remove_node") {
        const nodeId = String(op?.nodeId ?? "").trim();
        const node = graphNodeForUndo(nodeId);
        if (!node) {
          conflicts.push({ type, nodeId, reason: "node_missing" });
          continue;
        }
        const signature = String(op?.signature ?? "").trim();
        if (signature && graphNodeSignature(nodeId) !== signature) {
          conflicts.push({ type, nodeId, reason: "node_modified" });
          continue;
        }
        if (typeof graphStore?.removeNode !== "function") {
          conflicts.push({ type, nodeId, reason: "remove_unsupported" });
          continue;
        }
        graphStore.removeNode(nodeId);
        removedNodeIds.push(nodeId);
        continue;
      }
      if (type === "remove_edge") {
        const edgeId = String(op?.edgeId ?? "").trim();
        const edges = Array.isArray(graphStore?.edges) ? graphStore.edges : [];
        const edge = edges.find((item) => String(item?.id ?? "").trim() === edgeId) || null;
        if (!edge) {
          conflicts.push({ type, edgeId, reason: "edge_missing" });
          continue;
        }
        if (typeof graphStore?.removeEdge !== "function") {
          conflicts.push({ type, edgeId, reason: "remove_unsupported" });
          continue;
        }
        graphStore.removeEdge(edgeId);
        removedEdgeIds.push(edgeId);
        continue;
      }
      if (type === "restore_node_position") {
        const nodeId = String(op?.nodeId ?? "").trim();
        const node = graphNodeForUndo(nodeId);
        if (!node) {
          conflicts.push({ type, nodeId, reason: "node_missing" });
          continue;
        }
        const x = Number(op?.x);
        const y = Number(op?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          conflicts.push({ type, nodeId, reason: "invalid_position" });
          continue;
        }
        const signature = String(op?.signature ?? "").trim();
        if (signature && graphNodePositionSignature(nodeId) !== signature) {
          conflicts.push({ type, nodeId, reason: "node_moved" });
          continue;
        }
        node.x = x;
        node.y = y;
        restoredNodeIds.push(nodeId);
        continue;
      }
      if (type === "restore_node") {
        const nodeId = String(op?.nodeId ?? "").trim();
        const node = graphNodeForUndo(nodeId);
        if (!node) {
          conflicts.push({ type, nodeId, reason: "node_missing" });
          continue;
        }
        const signature = String(op?.signature ?? "").trim();
        if (signature && graphNodeSignature(nodeId) !== signature) {
          conflicts.push({ type, nodeId, reason: "node_modified" });
          continue;
        }
        const priorData = op?.data && typeof op.data === "object" && !Array.isArray(op.data) ? op.data : {};
        if (typeof graphStore?.updateNodeData === "function" && Object.keys(priorData).length) {
          graphStore.updateNodeData(nodeId, priorData);
        }
        const priorName = String(op?.name ?? "");
        if (priorName) {
          if (typeof graphStore?.updateNode === "function") {
            graphStore.updateNode(nodeId, { name: priorName });
          } else {
            node.name = priorName;
          }
        }
        restoredNodeIds.push(nodeId);
        continue;
      }
      conflicts.push({ type: type || "unknown", reason: "unsupported_op" });
    }
    return { removedNodeIds, removedEdgeIds, restoredNodeIds, conflicts };
  }
  function dailiesAssetBaseUrl() {
    try {
      return String(globalThis.window?.location?.origin || "");
    } catch {
      return "";
    }
  }
  // Fire-and-forget dailies uplink; failures surface as warnings in
  // the panel state instead of vanishing in an empty catch.
  function sendDirectorDailies(phase) {
    let dailies;
    try {
      dailies = buildCanvasDailiesExport({
        graphStore,
        flowId: safeTrim(state.lastDirectorFlowId) || undefined,
        exportedAt: new Date().toISOString(),
        phase,
        assetBaseUrl: dailiesAssetBaseUrl(),
      });
    } catch {
      // No production-surface nodes: nothing to report back.
      return;
    }
    void Promise.resolve(api.directorDailies({ dailies })).catch((error) => {
      try {
        const warning = `画布日报上行失败(${phase}): ${safeTrim(error?.message) || error}`;
        state.lastWarnings = [...(Array.isArray(state.lastWarnings) ? state.lastWarnings : []), warning];
        notifyUpdate();
      } catch {
        // Surfacing must never break execution.
      }
    });
  }
  function directorGenerationNodeIds(result = {}) {
    const ids = new Set();
    for (const key of ["queuedGenerationNodeIds", "startedGenerationNodeIds", "createdNodeIds"]) {
      for (const id of Array.isArray(result?.[key]) ? result[key] : []) {
        const value = String(id || "").trim();
        if (value) ids.add(value);
      }
    }
    return [...ids];
  }
  // The eye's second blink: real async generation finishes outside the
  // bridge (orchestration modules write terminal states straight to
  // the store), so the post-generation dailies re-export rides the
  // store subscription - first time the whole watched batch is
  // terminal, debounce 5s and re-export. Hard 10min deadline.
  function watchDirectorGenerationTerminal(nodeIds) {
    const watched = (Array.isArray(nodeIds) ? nodeIds : []).map((id) => String(id)).filter(Boolean);
    if (!watched.length || typeof graphStore?.subscribe !== "function") return;
    let finished = false;
    let debounceTimer = null;
    let unsubscribe = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(deadlineTimer);
      try {
        unsubscribe?.();
      } catch {
        // Subscription already torn down.
      }
    };
    const check = () => {
      if (finished || debounceTimer) return;
      const nodes = resolveGraphNodes(graphStore);
      const present = nodes.filter((node) => watched.includes(String(node?.id)));
      if (!present.length) {
        finish();
        return;
      }
      const generationNodes = present.filter((node) => ["ai-image", "ai-video", "ai-text"].includes(String(node?.type)));
      if (!generationNodes.length) {
        finish();
        return;
      }
      const allTerminal = generationNodes.every((node) => {
        const data = node?.data && typeof node.data === "object" && Object.keys(node.data).length ? node.data : node;
        const cardStatus = mapCanvasGenerationState(data).cardStatus;
        return ["completed", "failed", "retryable", "cancelled"].includes(cardStatus);
      });
      if (!allTerminal) return;
      debounceTimer = setTimeout(() => {
        try {
          sendDirectorDailies("post-generation");
        } finally {
          finish();
        }
      }, 5000);
    };
    unsubscribe = graphStore.subscribe(check);
    const deadlineTimer = setTimeout(finish, 600000);
    check();
  }
  const resolvedExecutionOrchestrator =
    executionOrchestrator ||
    (
      api && typeof api.validateActions === "function" && executionStore
        ? createAssistantExecutionOrchestrator({
            executionStore,
            executionSyncClient: resolvedExecutionSyncClient,
            applyInverseOps({ ops } = {}) {
              return applyGraphInverseOps(ops);
            },
            nodeSignatureProvider(nodeId) {
              return graphNodeSignature(nodeId);
            },
            nodeSnapshotProvider(nodeId) {
              const node = graphNodeForUndo(nodeId);
              if (!node) {
                return null;
              }
              let dataClone = {};
              try {
                dataClone = JSON.parse(JSON.stringify(node.data || {}));
              } catch {
                dataClone = {};
              }
              return { name: node.name || "", data: dataClone };
            },
            nodePositionProvider(nodeId) {
              const node = graphNodeForUndo(nodeId);
              if (!node) {
                return null;
              }
              const x = Number(node.x);
              const y = Number(node.y);
              if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
              }
              return { x, y };
            },
            validateActions(payload) {
              return api.validateActions(payload);
            },
            executeActions(payload) {
              // Trusted-writer source: granted only to executions the
              // PANEL recorded from the director plan endpoint (state-
              // keyed by execution id) - never inferred from action
              // contents, which the LLM can forge (qmai- ids included).
              const executionIdStr = payload?.executionId ? String(payload.executionId) : "";
              // Phase D · D2 (§F-D2): trustedExecutions Map (single source of
              // truth, panel-controlled) wins; the legacy per-lane Sets remain a
              // backward-compat fallback. Source is NEVER inferred from action
              // contents (the LLM can forge qmai-/vimax- ids).
              const mappedLineage = executionIdStr ? state.trustedExecutions?.get(executionIdStr) : "";
              const trustedSource = mappedLineage
                || (executionIdStr && state.vimaxExecutionIds?.has(executionIdStr) ? "vimax-director" : "")
                || (executionIdStr && state.directorExecutionIds?.has(executionIdStr) ? "qmai-director" : "")
                || "";
              const executed = executeActions({
                ...payload,
                graphStore,
                templateStore,
                canvasSkillsRuntime,
                agentMode: state.agentMode,
                source: trustedSource,
                videoAuthorized:
                  payload?.videoAuthorized === true ||
                  (state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true),
              });
              // The eye uplink: after director actions land, the real
              // canvas production surface flows back to the QMAI inbox
              // as canvas-dailies/v2. Fire-and-forget - the uplink must
              // never break or delay execution - but failures surface
              // as warnings instead of vanishing (iron rule 1).
              return Promise.resolve(executed).then((result) => {
                try {
                  const isDirectorBatch = Array.isArray(payload?.actions)
                    && payload.actions.some((action) => String(action?.id || "").startsWith("qmai-"));
                  // dailies uplink is a legacy-QMAI behavior (ViMax
                  // actions are vimax- prefixed, never qmai-) - gated off
                  // by default (α′ F10).
                  if (state.legacyQmaiEnabled && isDirectorBatch && typeof api.directorDailies === "function") {
                    sendDirectorDailies("post-actions");
                    watchDirectorGenerationTerminal(directorGenerationNodeIds(result));
                  }
                } catch {
                  // No production-surface nodes or exporter rejection:
                  // nothing to report back, execution result stands.
                }
                return result;
              });
            },
            prepareQueuedExecution: typeof api.prepareQueuedExecution === "function" || typeof api.directorPlan === "function"
              ? async (payload) => {
                  const queuedMatchedSkills = Array.isArray(payload?.execution?.matchedSkills)
                    ? payload.execution.matchedSkills
                    : [];
                  if (queuedMatchedSkills.includes("director") && !state.legacyQmaiEnabled) {
                    // A leftover QMAI-director queued task dequeued while
                    // the lane is dormant - fail loud, don't silently hit
                    // the dormant QMAI bridge (α′ F10).
                    throw new Error("导演通道已休眠(legacy QMAI dormant)");
                  }
                  if (queuedMatchedSkills.includes("director") && typeof api.directorPlan === "function") {
                    const planned = await api.directorPlan({ recompile: true, executionId: payload?.executionId });
                    if (!planned || planned.success === false) {
                      throw new Error(String(planned?.error || "Director recompile failed"));
                    }
                    if (payload?.executionId) {
                      if (!(state.directorExecutionIds instanceof Set)) state.directorExecutionIds = new Set();
                      state.directorExecutionIds.add(String(payload.executionId));
                    }
                    return {
                      plan: planned.plan,
                      actionsByStep: planned.actionsByStep,
                      drawerState: { line2: "导演已按最新记忆重新编排" },
                    };
                  }
                  if (typeof api.prepareQueuedExecution !== "function") {
                    throw new Error("Queued prepare is not configured");
                  }
                  const context = contextWithAssistantReferences(
                    buildContext({ graphStore }),
                    state.references,
                    state.attachments()
                  );
                  Object.assign(context, buildAssistantMentionContext(state.mentionBindings));
                  const prepared = await api.prepareQueuedExecution({
                    ...payload,
                    context,
                  });
                  return isPlainObject(prepared) ? { ...prepared, context } : { context };
                }
              : null,
          })
        : null
    );
  state.setExecutionOrchestrator?.(resolvedExecutionOrchestrator);
  let root = null;
  let launcher = null;
  let ownsLauncher = false;
  let panel = null;
  let messagesEl = null;
  let inputEl = null;
  let sendButton = null;
  let applyButton = null;
  let previewEl = null;
  let receiptEl = null;
  let craftPickerEl = null;
  let startSkillListEl = null;
  let labButtonEl = null;
  let execHistoryBtnEl = null;
  let execHistoryBadgeEl = null;
  let executionDrawerEl = null;
  let sessionEl = null;
  let attachmentListEl = null;
  let modelButton = null;
  let mentionButton = null;
  let modelMenuEl = null;
  let modeButton = null;
  let mentionMenuEl = null;
  let fileInputEl = null;
  let historyEl = null;
  let strongConfirmButton = null;
  let attachmentPreviewEl = null;
  let previewAttachment = null;
  let historyVisible = false;
  let historyQuery = "";
  let modelMenuVisible = false;
  let mentionMenuVisible = false;
  let mentionQuery = "";
  let mentionTriggerIndex = -1;
  let mentionHoverSection = "";
  let mentionHoverAssetCategory = "";
  let isComposing = false;
  let noticeTimer = null;
  let noticeFadeTimer = null;
  let transientNoticeVisible = false;
  let executionDrawerExpanded = false;
  let executionDrawerSelectedExecutionId = "";
  let executionDrawerSelectedEventId = "";
  let executionHistoryVisible = false;
  let executionDeveloperMode = false;
  let executionHistoryQuery = "";
  let executionHistoryLimit = 10;
  let executionHistoryStatusFilter = "";
  let executionPlanDragStepId = "";
  let executionBackdropEl = null;
  let executionTimelineAutoScrollPaused = false;
  let executionTimelineScrollPauseTimer = null;
  const executionTimelineScrollTopById = new Map();
  let initialized = false;
  let currentTask = Promise.resolve();
  const floatingLayers = createFloatingLayerController({
    document: documentRef,
    onChange(activeId) {
      modelMenuVisible = activeId === "model";
      mentionMenuVisible = activeId === "mention";
      if (!mentionMenuVisible) {
        mentionTriggerIndex = -1;
      }
      render();
    },
  });

  function displaySessionLabel() {
    return state.conversationId || sessionLabel;
  }

  function renderActionPreviewCard(model, summaryText = "") {
    const card = createElement(documentRef, "section", "hy-canvas-agent-preview-card");
    const summary = createElement(
      documentRef,
      "div",
      "hy-canvas-agent-preview-summary",
      summaryText || formatAssistantActionPreviewModel(model)
    );
    card.appendChild(summary);
    for (const section of model?.sections || []) {
      const group = createElement(
        documentRef,
        "div",
        `hy-canvas-agent-preview-group risk-${section.risk || "medium"}`
      );
      group.appendChild(createElement(documentRef, "h4", "", section.title));
      for (const item of section.actions || []) {
        const row = createElement(documentRef, "label", "hy-canvas-agent-preview-row");
        const checkbox = documentRef.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.selected !== false;
        checkbox.disabled = Boolean(item.disabledReason);
        checkbox.addEventListener("change", () => {
          state.setActionSelected(item.index, checkbox.checked);
          render();
        });
        row.appendChild(checkbox);
        const copy = createElement(documentRef, "span", "hy-canvas-agent-preview-copy");
        copy.appendChild(createElement(documentRef, "span", "hy-canvas-agent-preview-title", item.title || item.type));
        if (item.subtitle || item.disabledReason) {
          copy.appendChild(
            createElement(
              documentRef,
              "span",
              "hy-canvas-agent-preview-subtitle",
              item.disabledReason || item.subtitle
            )
          );
        }
        row.appendChild(copy);
        group.appendChild(row);
      }
      card.appendChild(group);
    }
    return card;
  }

  function latestCanvasActionCard() {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const cards = Array.isArray(state.messages[index]?.cards) ? state.messages[index].cards : [];
      for (let cardIndex = cards.length - 1; cardIndex >= 0; cardIndex -= 1) {
        if (cards[cardIndex]?.type === "canvas_actions") {
          return cards[cardIndex];
        }
      }
    }
    return null;
  }

  // Slice 6: a vimax_render living card already shows the 收工条/进度 as its
  // summary, so the green receipt bar above the input is a redundant duplicate.
  // Suppress the bar ONLY when a render card is showing this exact text — so an
  // error (different text) or a card-less flow still surfaces in the bar, and a
  // stale render card can't swallow a later error message.
  function latestReplyRenderCardShowsReceipt(receipt) {
    const want = safeTrim(receipt);
    if (!want) return false;
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (message?.role !== "assistant") continue;
      const cards = Array.isArray(message.cards) ? message.cards : [];
      return cards.some((c) => c?.type === "vimax_render" && safeTrim(c?.summary) === want);
    }
    return false;
  }

  function drawerConfirmationPending(execution) {
    const status = String(execution?.status || "").trim();
    if (status === "waiting_video_authorization") return true;
    const pendingConfirmationCount = Number(execution?.drawerState?.pendingConfirmationCount || 0) || 0;
    if (pendingConfirmationCount > 0 || status === "waiting_confirmation" || status === "draft") {
      const counts = executionGenerationCounts(execution);
      return generationConfirmationRequired(counts, state.agentMode);
    }
    return false;
  }

  // 抽屉是否需要常驻: 仅「需要用户关注/操作」的执行才显示在输入框上方 —— 执行中(有实时进度) /
  // 暂停(可继续) / 失败(可重试) / 待视频授权, 或确认挂起(generationConfirmationRequired)。
  // 草稿/排队/完成/取消等「无待用户操作」的摘要(如"已为您重新整理布局"过去式描述, pendingConfirm=0)
  // → 不常驻(自动消隐), 可从「执行历史」回看。注意: 草稿虽含 plan 动作, 但无待确认 ≠ 需关注。
  function drawerExecutionNeedsAttention(execution) {
    const status = String(execution?.status || "").trim();
    // 进行中(有进度) / 需操作(暂停继续/失败重试/待授权) → 常驻
    if (
      status === "executing" ||
      status === "paused" ||
      status === "failed" ||
      status === "waiting_video_authorization"
    ) {
      return true;
    }
    // 刚编译的草稿计划(draft): 待用户查看/确认/执行 → 常驻。
    // 注意 queued_draft 不同于 draft: 它是「已入队的滞留草稿」(过去式摘要, 如"已为您重新整理布局"),
    // 已不需用户在输入框上方处理 → 不常驻(归入队列/历史)。
    if (status === "draft") {
      return true;
    }
    // 仍待用户确认(计划/生成)→ 常驻; 否则(queued_draft/queued/completed/cancelled 无待办)→ 不常驻
    const pending = Number(execution?.drawerState?.pendingConfirmationCount || 0) || 0;
    if (pending > 0) {
      return true;
    }
    return drawerConfirmationPending(execution);
  }

  function visibleExecutionForDrawer() {
    if (!executionStore || typeof executionStore.snapshot !== "function") {
      return null;
    }
    const snapshot = executionStore.snapshot();
    const executions = Array.isArray(snapshot.executions) ? snapshot.executions : [];
    const active =
      executions.find((execution) => execution.id === snapshot.activeExecutionId) ||
      executions.find((execution) => execution?.drawerState?.visible === true) ||
      null;
    if (active?.drawerState?.visible !== true) {
      return null;
    }
    // 铁律: pi-agent 抽屉不常驻。仅在「需要用户关注/操作」时常驻(见 drawerExecutionNeedsAttention);
    // 完成/取消/无待办的草稿摘要(如"已为您重新整理布局"这类过去式描述)→ 自动消隐。
    // 撤销/重放/逐步重生成等回看, 从「执行历史」按钮显式打开(selected)后照常展示。
    const isSelected = safeTrim(executionDrawerSelectedExecutionId) === safeTrim(active.id);
    if (!isSelected && !drawerExecutionNeedsAttention(active)) {
      return null;
    }
    return active;
  }

  function executionSnapshotForDrawer() {
    if (!executionStore || typeof executionStore.snapshot !== "function") {
      return { executions: [], queue: [], activeExecutionId: "" };
    }
    const snapshot = executionStore.snapshot() || {};
    return {
      executions: Array.isArray(snapshot.executions) ? snapshot.executions : [],
      queue: Array.isArray(snapshot.queue) ? snapshot.queue : [],
      activeExecutionId: safeTrim(snapshot.activeExecutionId),
    };
  }

  function queueStatusText(status, execution = {}) {
    if (status === "executing") return "执行中";
    if ((status === "queued" || status === "queued_draft") && execution?.drawerState?.queuePaused === true) return "已暂停排队";
    if (status === "queued" || status === "queued_draft") return "排队中";
    if (status === "draft" || status === "waiting_confirmation") return "待确认";
    if (status === "waiting_video_authorization") return "待授权";
    return cardStatusText(status);
  }

  function executionHasUnauthorizedVideoAction(execution = {}) {
    const videoAuthorized = state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true;
    return executionActions(execution).some((action) => isUnauthorizedVideoGenerationAction(action, graphStore, videoAuthorized));
  }

  function executionGenerationCounts(execution) {
    return countGenerationActions(
      [...cloneActions(state.pendingActions), ...executionActions(execution)],
      graphStore
    );
  }

  function drawerActionLabel(execution) {
    const status = String(execution?.status || "").trim();
    const pendingConfirmationCount = Number(execution?.drawerState?.pendingConfirmationCount || 0) || 0;
    if (status === "waiting_video_authorization") return "确认";
    if (pendingConfirmationCount > 0 || status === "waiting_confirmation" || status === "draft") {
      const counts = executionGenerationCounts(execution);
      return generationConfirmationRequired(counts, state.agentMode) ? "确认" : "";
    }
    if (status === "paused") return "继续";
    if (status === "failed") return "重试";
    if (status === "executing") return "暂停";
    if (status === "completed") return "关闭";
    return "";
  }

  function executionForExpandedDrawer(activeExecution) {
    const selectedId = safeTrim(executionDrawerSelectedExecutionId);
    if (!selectedId) {
      return activeExecution;
    }
    const snapshot = executionSnapshotForDrawer();
    return snapshot.executions.find((execution) => safeTrim(execution?.id) === selectedId) || activeExecution;
  }

  function handleQueuedExecutionControl(action, execution = {}) {
    const id = safeTrim(execution?.id);
    if (!id || !executionStore) {
      return null;
    }
    let result = null;
    let syncAction = safeTrim(action);
    if (action === "top" && typeof executionStore.moveQueuedExecutionToTop === "function") {
      result = executionStore.moveQueuedExecutionToTop(id);
      state.lastReceipt = result ? "Queued task moved to top." : "Queued task cannot be moved.";
    } else if (action === "cancel" && typeof executionStore.cancelQueuedExecution === "function") {
      result = executionStore.cancelQueuedExecution(id);
      if (executionDrawerSelectedExecutionId === id) {
        executionDrawerSelectedExecutionId = "";
        executionDrawerSelectedEventId = "";
      }
      state.lastReceipt = result ? "Queued task cancelled." : "Queued task cannot be cancelled.";
    } else if (action === "pause") {
      if (execution?.drawerState?.queuePaused === true && typeof executionStore.resumeQueuedExecution === "function") {
        result = executionStore.resumeQueuedExecution(id);
        syncAction = "resume";
        state.lastReceipt = result ? "Queued task resumed." : "Queued task cannot be resumed.";
      } else if (typeof executionStore.pauseQueuedExecution === "function") {
        result = executionStore.pauseQueuedExecution(id);
        syncAction = "pause";
        state.lastReceipt = result ? "Queued task paused." : "Queued task cannot be paused.";
      }
    }
    if (
      result &&
      resolvedExecutionSyncClient &&
      typeof resolvedExecutionSyncClient.controlQueuedExecution === "function"
    ) {
      state.lastExecutionSyncPromise = Promise.resolve()
        .then(() => resolvedExecutionSyncClient.controlQueuedExecution(id, syncAction))
        .catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution queue control sync failed";
        });
    }
    render();
    return result;
  }

  function renderExecutionQueueStrip(activeExecution, viewedExecution = activeExecution) {
    const snapshot = executionSnapshotForDrawer();
    const activeId = safeTrim(activeExecution?.id || snapshot.activeExecutionId);
    const viewedId = safeTrim(viewedExecution?.id || activeId);
    const active =
      snapshot.executions.find((execution) => safeTrim(execution?.id) === activeId) ||
      activeExecution;
    const queued = snapshot.queue.filter((execution) => safeTrim(execution?.id) !== activeId);
    const items = [active, ...queued].filter(Boolean);
    if (!items.length) {
      return null;
    }
    const strip = createElement(documentRef, "div", "hy-canvas-agent-execution-queue");
    strip.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "任务队列"));
    const shouldWarn = items.some((item) => item?.drawerState?.queueWarning === true) || queued.length > EXECUTION_QUEUE_WARNING_THRESHOLD;
    if (shouldWarn) {
      strip.appendChild(
        createElement(
          documentRef,
          "div",
          "hy-canvas-agent-execution-queue-warning",
          `队列较长：当前排队 ${queued.length} 个任务，仍会继续排队。`
        )
      );
    }
    const list = createElement(documentRef, "div", "hy-canvas-agent-execution-queue-list");
    items.forEach((item, index) => {
      const itemId = safeTrim(item?.id);
      const isActiveItem = itemId === activeId;
      const card = createElement(documentRef, "div", "hy-canvas-agent-execution-queue-item");
      card.setAttribute?.("role", "button");
      card.setAttribute?.("tabindex", "0");
      card.setAttribute?.("data-execution-id", safeTrim(item?.id));
      card.setAttribute?.("data-active", isActiveItem ? "true" : "false");
      card.setAttribute?.("data-selected", itemId === viewedId ? "true" : "false");
      const title = safeTrim(item?.title || item?.drawerState?.line1) || `任务 ${index + 1}`;
      card.appendChild(createElement(documentRef, "span", "hy-canvas-agent-execution-queue-title", title));
      card.appendChild(
        createElement(
          documentRef,
          "span",
          "hy-canvas-agent-execution-queue-status",
          queueStatusText(item?.status, item)
        )
      );
      if (!isActiveItem && (item?.status === "queued" || item?.status === "queued_draft")) {
        const controls = createElement(documentRef, "span", "hy-canvas-agent-execution-queue-controls");
        const top = createElement(documentRef, "button", "hy-canvas-agent-execution-queue-top", "置顶");
        top.type = "button";
        top.addEventListener("click", (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          schedule(() => handleQueuedExecutionControl("top", item));
        });
        const pause = createElement(
          documentRef,
          "button",
          "hy-canvas-agent-execution-queue-pause",
          item?.drawerState?.queuePaused === true ? "继续" : "暂停"
        );
        pause.type = "button";
        pause.addEventListener("click", (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          schedule(() => handleQueuedExecutionControl("pause", item));
        });
        const cancel = createElement(documentRef, "button", "hy-canvas-agent-execution-queue-cancel", "取消");
        cancel.type = "button";
        cancel.addEventListener("click", (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          schedule(() => handleQueuedExecutionControl("cancel", item));
        });
        controls.appendChild(top);
        controls.appendChild(pause);
        controls.appendChild(cancel);
        card.appendChild(controls);
      }
      card.addEventListener("click", () => {
        executionDrawerSelectedExecutionId = safeTrim(item?.id);
        executionDrawerSelectedEventId = "";
        executionTimelineAutoScrollPaused = false;
        clearExecutionTimelineScrollPauseTimer();
        render();
      });
      list.appendChild(card);
    });
    strip.appendChild(list);
    return strip;
  }

  function timelineEventDetailText(event) {
    if (!event) {
      return "请选择一条时间线记录";
    }
    return [
      safeTrim(event.humanSummary || event.summary || event.status) || "执行事件",
      safeTrim(event.stepId) ? `步骤：${safeTrim(event.stepId)}` : "",
      safeTrim(event.actionId) ? `动作：${safeTrim(event.actionId)}` : "",
      Number(event.durationMs || 0) > 0 ? `耗时：${Number(event.durationMs || 0)}ms` : "",
      event.canRetry === true ? "可重试" : "",
      event.canUndo === true ? "可撤销" : "",
      safeTrim(event.error) ? `错误：${safeTrim(event.error)}` : "",
    ].filter(Boolean).join(" · ");
  }

  function planStepTitleById(execution = {}, stepId = "") {
    const id = safeTrim(stepId);
    if (!id) {
      return "";
    }
    const steps = Array.isArray(execution?.plan?.steps) ? execution.plan.steps : [];
    const step = steps.find((item) => safeTrim(item?.id) === id);
    return safeTrim(step?.title || step?.name || step?.id);
  }

  function blockedTimelineEventsForSource(execution = {}, sourceEvent = {}) {
    if (!sourceEvent) {
      return [];
    }
    const sourceEventId = safeTrim(sourceEvent?.id);
    const sourceActionId = safeTrim(sourceEvent?.actionId);
    const sourceStepId = safeTrim(sourceEvent?.stepId);
    if (!sourceEventId && !sourceActionId && !sourceStepId) {
      return [];
    }
    const events = Array.isArray(execution?.timeline) ? execution.timeline : [];
    return events.filter((event) => {
      if (safeTrim(event?.status) !== "dependency_blocked") {
        return false;
      }
      const developer = event?.developer && typeof event.developer === "object" ? event.developer : {};
      return (
        (sourceEventId && safeTrim(developer.blockedByEventId) === sourceEventId) ||
        (sourceActionId && safeTrim(developer.blockedByActionId) === sourceActionId) ||
        (sourceStepId && safeTrim(developer.blockedByStepId) === sourceStepId)
      );
    });
  }

  function dependencyBlockedDetailText(execution = {}, sourceEvent = {}) {
    const blockedEvents = blockedTimelineEventsForSource(execution, sourceEvent);
    if (!blockedEvents.length) {
      return "";
    }
    const seenStepIds = new Set();
    const titles = [];
    for (const event of blockedEvents) {
      const stepId = safeTrim(event?.stepId);
      if (stepId && seenStepIds.has(stepId)) {
        continue;
      }
      if (stepId) {
        seenStepIds.add(stepId);
      }
      const developer = event?.developer && typeof event.developer === "object" ? event.developer : {};
      const actionJson = developer.actionJson && typeof developer.actionJson === "object" ? developer.actionJson : {};
      titles.push(
        planStepTitleById(execution, stepId) ||
        safeTrim(actionJson.title || actionJson.name) ||
        safeTrim(event?.humanSummary || event?.summary || event?.actionId || stepId)
      );
    }
    const count = titles.length || blockedEvents.length;
    const suffix = titles.filter(Boolean).slice(0, 4).join("、");
    return `后续 ${count} 步依赖这一步${suffix ? `：${suffix}` : ""}`;
  }

  function timelineEventNodeIds(event = {}) {
    const developer = event?.developer && typeof event.developer === "object" ? event.developer : {};
    const actionJson = developer.actionJson && typeof developer.actionJson === "object" ? developer.actionJson : {};
    const action = event?.action && typeof event.action === "object" ? event.action : {};
    const ids = [
      ...(Array.isArray(event?.nodeIds) ? event.nodeIds : []),
      ...(Array.isArray(event?.affectedNodeIds) ? event.affectedNodeIds : []),
      ...(Array.isArray(event?.createdNodeIds) ? event.createdNodeIds : []),
      ...(Array.isArray(event?.updatedNodeIds) ? event.updatedNodeIds : []),
      ...(Array.isArray(event?.queuedGenerationNodeIds) ? event.queuedGenerationNodeIds : []),
      ...(Array.isArray(event?.startedGenerationNodeIds) ? event.startedGenerationNodeIds : []),
      ...(Array.isArray(actionJson.nodeIds) ? actionJson.nodeIds : []),
      ...(Array.isArray(action.nodeIds) ? action.nodeIds : []),
      event?.nodeId,
      event?.targetNodeId,
      actionJson.nodeId,
      actionJson.targetNodeId,
      action.nodeId,
      action.targetNodeId,
    ].map(safeTrim).filter(Boolean);
    return [...new Set(ids)];
  }

  function timelineEventActionJson(event = {}) {
    const developer = event?.developer && typeof event.developer === "object" ? event.developer : {};
    if (developer.actionJson && typeof developer.actionJson === "object") {
      return developer.actionJson;
    }
    return event?.action && typeof event.action === "object" ? event.action : {};
  }

  function timelineEventNeedsVideoAuthorization(event = {}) {
    const videoAuthorized = state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true;
    return isUnauthorizedVideoGenerationAction(timelineEventActionJson(event), graphStore, videoAuthorized);
  }

  function focusTimelineEventNodes(event) {
    const nodeIds = timelineEventNodeIds(event);
    if (!nodeIds.length || typeof graphStore?.setSelectedNodes !== "function") {
      return false;
    }
    graphStore.setSelectedNodes(nodeIds);
    state.lastReceipt = `Focused nodes: ${nodeIds.join(", ")}`;
    render();
    return true;
  }

  async function retryTimelineEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const actionId = safeTrim(event?.actionId);
    const eventId = safeTrim(event?.id);
    if (!id || !actionId || typeof resolvedExecutionOrchestrator?.retry !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.retry(id, {
        agentMode: state.agentMode,
        videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
        actionId,
        eventId,
      });
    } finally {
      setBusy(false);
      render();
    }
  }

  async function authorizeTimelineVideoEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const actionId = safeTrim(event?.actionId);
    const eventId = safeTrim(event?.id);
    if (!id || !actionId || typeof resolvedExecutionOrchestrator?.retry !== "function") {
      return null;
    }
    state.approveVideoGeneration();
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.retry(id, {
        agentMode: state.agentMode,
        videoAuthorized: true,
        actionId,
        eventId,
      });
    } finally {
      setBusy(false);
      render();
    }
  }

  function timelineEventUndone(execution = {}, event = {}) {
    const eventId = safeTrim(event?.id);
    if (!eventId) {
      return false;
    }
    const events = Array.isArray(execution?.timeline) ? execution.timeline : [];
    return events.some(
      (item) =>
        safeTrim(item?.status) === "undone" &&
        safeTrim(item?.developer?.undoneFromEventId) === eventId
    );
  }

  function timelineEventCanUndo(execution = {}, event = {}) {
    return Boolean(
      event?.canUndo === true &&
      Array.isArray(event?.inverse?.ops) &&
      event.inverse.ops.length &&
      !timelineEventUndone(execution, event) &&
      typeof resolvedExecutionOrchestrator?.undo === "function"
    );
  }

  async function undoTimelineEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const eventId = safeTrim(event?.id);
    if (!id || !eventId || typeof resolvedExecutionOrchestrator?.undo !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.undo(id, { eventId });
    } finally {
      setBusy(false);
      render();
    }
  }

  async function replayExecution(executionId) {
    const id = safeTrim(executionId);
    if (!id || typeof resolvedExecutionOrchestrator?.replay !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.replay(id, { agentMode: state.agentMode });
    } finally {
      setBusy(false);
      render();
    }
  }

  async function regenerateTimelineEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const actionId = safeTrim(event?.actionId);
    if (!id || !actionId || typeof resolvedExecutionOrchestrator?.regenerateStep !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.regenerateStep(id, {
        actionId,
        eventId: safeTrim(event?.id),
        agentMode: state.agentMode,
        videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
      });
    } finally {
      setBusy(false);
      render();
    }
  }

  function timelineEventCanUndoTo(execution = {}, event = {}) {
    if (!timelineEventCanUndo(execution, event) || typeof resolvedExecutionOrchestrator?.undoTo !== "function") {
      return false;
    }
    const events = Array.isArray(execution?.timeline) ? execution.timeline : [];
    const index = events.findIndex((item) => safeTrim(item?.id) === safeTrim(event?.id));
    if (index < 0) {
      return false;
    }
    return events.slice(index + 1).some((item) => timelineEventCanUndo(execution, item));
  }

  async function undoTimelineEventsTo(executionId, event = {}) {
    const id = safeTrim(executionId);
    const eventId = safeTrim(event?.id);
    if (!id || !eventId || typeof resolvedExecutionOrchestrator?.undoTo !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.undoTo(id, { eventId });
    } finally {
      setBusy(false);
      render();
    }
  }

  const PLAN_EDITABLE_STATUSES = new Set([
    "draft",
    "waiting_confirmation",
    "queued",
    "queued_draft",
    "paused",
    "failed",
  ]);

  function planStepExecuted(execution = {}, stepId = "") {
    const id = safeTrim(stepId);
    if (!id) {
      return true;
    }
    const events = Array.isArray(execution?.timeline) ? execution.timeline : [];
    return events.some(
      (event) =>
        safeTrim(event?.stepId) === id &&
        ["running", "completed", "failed"].includes(safeTrim(event?.status))
    );
  }

  function planOrderAfterMove(steps = [], stepId = "", offset = 0) {
    const ids = steps.map((step) => safeTrim(step?.id));
    const index = ids.indexOf(safeTrim(stepId));
    const target = index + offset;
    if (index < 0 || target < 0 || target >= ids.length) {
      return null;
    }
    const next = ids.slice();
    next.splice(index, 1);
    next.splice(target, 0, safeTrim(stepId));
    return next;
  }

  function planOrderAfterDrop(steps = [], draggedStepId = "", targetStepId = "") {
    const ids = steps.map((step) => safeTrim(step?.id));
    const from = ids.indexOf(safeTrim(draggedStepId));
    const to = ids.indexOf(safeTrim(targetStepId));
    if (from < 0 || to < 0 || from === to) {
      return null;
    }
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, safeTrim(draggedStepId));
    return next;
  }

  function handlePlanStepsReorder(execution = {}, orderedStepIds = null) {
    if (!orderedStepIds) {
      return null;
    }
    const updated = executionStore?.reorderPlanSteps?.(safeTrim(execution?.id), orderedStepIds);
    if (!updated) {
      state.lastReceipt = "当前状态不能调整计划顺序";
      render();
      return null;
    }
    if (
      resolvedExecutionSyncClient &&
      typeof resolvedExecutionSyncClient.updateExecutionStatus === "function"
    ) {
      state.lastExecutionSyncPromise = Promise.resolve()
        .then(() => resolvedExecutionSyncClient.updateExecutionStatus(updated.id, updated.status, { plan: updated.plan }))
        .catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution plan sync failed";
        });
    }
    render();
    return updated;
  }

  function handlePlanStepToggle(execution = {}, step = {}) {
    const updated = executionStore?.setPlanStepEnabled?.(
      safeTrim(execution?.id),
      safeTrim(step?.id),
      step?.enabled === false
    );
    if (!updated) {
      state.lastReceipt = "当前状态不能编辑该计划步骤";
      render();
      return null;
    }
    if (
      resolvedExecutionSyncClient &&
      typeof resolvedExecutionSyncClient.updateExecutionStatus === "function"
    ) {
      state.lastExecutionSyncPromise = Promise.resolve()
        .then(() => resolvedExecutionSyncClient.updateExecutionStatus(updated.id, updated.status, { plan: updated.plan }))
        .catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution plan sync failed";
        });
    }
    render();
    return updated;
  }

  async function skipTimelineEvent(executionId, event = {}) {
    const id = safeTrim(executionId);
    const actionId = safeTrim(event?.actionId);
    const eventId = safeTrim(event?.id);
    if (!id || !actionId || typeof resolvedExecutionOrchestrator?.skip !== "function") {
      return null;
    }
    setBusy(true);
    try {
      return await resolvedExecutionOrchestrator.skip(id, {
        actionId,
        eventId,
      });
    } finally {
      setBusy(false);
      render();
    }
  }

  function clearExecutionTimelineScrollPauseTimer() {
    if (executionTimelineScrollPauseTimer && typeof clearTimeoutFn === "function") {
      clearTimeoutFn(executionTimelineScrollPauseTimer);
    }
    executionTimelineScrollPauseTimer = null;
  }

  function maxExecutionTimelineScrollTop(timeline) {
    const scrollHeight = Number(timeline?.scrollHeight || 0);
    const clientHeight = Number(timeline?.clientHeight || 0);
    return Math.max(0, scrollHeight - clientHeight);
  }

  function applyExecutionTimelineScroll(timeline, executionId) {
    if (!timeline) {
      return;
    }
    const id = safeTrim(executionId);
    const paused = executionTimelineAutoScrollPaused === true;
    timeline.setAttribute?.("data-auto-scroll-paused", paused ? "true" : "false");
    if (paused) {
      timeline.scrollTop = Number(executionTimelineScrollTopById.get(id) || 0);
      return;
    }
    timeline.scrollTop = maxExecutionTimelineScrollTop(timeline);
  }

  function pauseExecutionTimelineAutoScroll(timeline, executionId) {
    if (!timeline) {
      return;
    }
    const maxScrollTop = maxExecutionTimelineScrollTop(timeline);
    const currentScrollTop = Number(timeline.scrollTop || 0);
    if (maxScrollTop <= 0 || currentScrollTop >= maxScrollTop - 2) {
      return;
    }
    const id = safeTrim(executionId);
    executionTimelineAutoScrollPaused = true;
    executionTimelineScrollTopById.set(id, currentScrollTop);
    timeline.setAttribute?.("data-auto-scroll-paused", "true");
    clearExecutionTimelineScrollPauseTimer();
    if (typeof setTimeoutFn === "function") {
      executionTimelineScrollPauseTimer = setTimeoutFn(() => {
        executionTimelineAutoScrollPaused = false;
        executionTimelineScrollPauseTimer = null;
        render();
      }, EXECUTION_TIMELINE_SCROLL_PAUSE_MS);
    }
  }

  function reopenExecutionFromHistory(execution = {}) {
    const id = safeTrim(execution?.id);
    if (!id || typeof executionStore?.updateStatus !== "function") {
      return null;
    }
    // 标记为「用户从历史显式打开」, 使已完成的执行可在抽屉中回看/撤销/重放(不常驻铁律的例外)。
    executionDrawerSelectedExecutionId = id;
    const updated = executionStore.updateStatus(id, execution.status, {
      drawerState: { ...(execution.drawerState || {}), visible: true },
    });
    executionHistoryVisible = false;
    if (
      updated &&
      resolvedExecutionSyncClient &&
      typeof resolvedExecutionSyncClient.updateExecutionStatus === "function"
    ) {
      state.lastExecutionSyncPromise = Promise.resolve()
        .then(() =>
          resolvedExecutionSyncClient.updateExecutionStatus(updated.id, updated.status, {
            drawerState: updated.drawerState,
          })
        )
        .catch((error) => {
          state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution history sync failed";
        });
    }
    render();
    return updated;
  }

  // 头部「执行历史」图标入口:打开/收起历史列表。打开时清掉历史下钻选中(显示列表而非某条详情);
  // reopenExecutionFromHistory 点条目时会把 executionHistoryVisible 置 false → 显示该条详情。
  function toggleExecutionHistory() {
    executionHistoryVisible = !executionHistoryVisible;
    executionDrawerSelectedExecutionId = "";
    executionDrawerSelectedEventId = "";
    executionHistoryLimit = 10;
    executionHistoryStatusFilter = "";
    render();
  }

  // 历史列表(搜索/筛选/条目)。入口图标已迁到头部, 这里不再渲染「执行历史(N)」按钮;
  // 仅在 executionHistoryVisible 时由 renderExecutionDrawer 调用渲染列表本身。
  function renderExecutionHistoryEntry() {
    const snapshot = executionSnapshotForDrawer();
    if (!snapshot.executions.length) {
      executionDrawerEl.textContent = "";
      setHidden(executionDrawerEl, true);
      return;
    }
    {
      const search = createElement(documentRef, "input", "hy-canvas-agent-execution-history-search");
      search.setAttribute?.("type", "search");
      search.setAttribute?.("placeholder", "搜索执行历史");
      search.value = executionHistoryQuery;
      search.addEventListener("input", (event) => {
        executionHistoryQuery = String(event?.target?.value ?? search.value ?? "");
        render();
      });
      executionDrawerEl.appendChild(search);
      const chipsBar = createElement(documentRef, "div", "hy-canvas-agent-execution-history-chips");
      [
        { label: "全部", value: "" },
        { label: "已完成", value: "completed" },
        { label: "失败", value: "failed" },
        { label: "已取消", value: "cancelled" },
      ].forEach((chip) => {
        const chipEl = createElement(documentRef, "button", "hy-canvas-agent-execution-history-chip", chip.label);
        chipEl.type = "button";
        chipEl.setAttribute?.("data-selected", executionHistoryStatusFilter === chip.value ? "true" : "false");
        chipEl.addEventListener("click", () => {
          executionHistoryStatusFilter = chip.value;
          executionHistoryLimit = 10;
          render();
        });
        chipsBar.appendChild(chipEl);
      });
      executionDrawerEl.appendChild(chipsBar);
      const query = safeTrim(executionHistoryQuery).toLowerCase();
      const list = createElement(documentRef, "div", "hy-canvas-agent-execution-history-list");
      const filteredItems = snapshot.executions
        .filter((item) =>
          !executionHistoryStatusFilter || safeTrim(item?.status) === executionHistoryStatusFilter
        )
        .filter((item) => {
          if (!query) {
            return true;
          }
          const haystack = [
            safeTrim(item?.title),
            safeTrim(item?.status),
            queueStatusText(item?.status, item),
            safeTrim(item?.drawerState?.line1),
            safeTrim(item?.drawerState?.line2),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
        .sort((left, right) => safeTrim(right?.updatedAt).localeCompare(safeTrim(left?.updatedAt)));
      const items = filteredItems.slice(0, executionHistoryLimit);
      items.forEach((item) => {
        const row = createElement(
          documentRef,
          "button",
          "hy-canvas-agent-execution-history-item",
          `${safeTrim(item?.title) || "AI 执行任务"} · ${queueStatusText(item?.status, item)}`
        );
        row.type = "button";
        row.setAttribute?.("data-execution-id", safeTrim(item?.id));
        row.addEventListener("click", () => schedule(() => reopenExecutionFromHistory(item)));
        list.appendChild(row);
      });
      if (filteredItems.length > executionHistoryLimit) {
        const more = createElement(documentRef, "button", "hy-canvas-agent-execution-history-more", "加载更多");
        more.type = "button";
        more.addEventListener("click", () => {
          executionHistoryLimit += 10;
          render();
        });
        list.appendChild(more);
      }
      executionDrawerEl.appendChild(list);
    }
    executionDrawerEl.setAttribute?.("data-status", "history");
    executionDrawerEl.setAttribute?.("aria-expanded", executionHistoryVisible ? "true" : "false");
    setHidden(executionDrawerEl, false);
  }

  function renderExecutionDrawer() {
    if (!executionDrawerEl) {
      return;
    }
    executionDrawerEl.replaceChildren?.();
    // 执行历史(头部 ⟲ 图标)打开时, 优先渲染历史列表(即使有活动执行)。
    if (executionHistoryVisible) {
      if (executionBackdropEl) {
        setHidden(executionBackdropEl, true);
      }
      renderExecutionHistoryEntry();
      return;
    }
    const execution = visibleExecutionForDrawer();
    if (!execution) {
      if (executionBackdropEl) {
        setHidden(executionBackdropEl, true);
      }
      // 入口已迁到头部图标, 输入框上方不再常驻「执行历史(N)」红条 → 默认隐藏抽屉。
      setHidden(executionDrawerEl, true);
      return;
    }
    const drawerState = execution.drawerState || {};
    const expanded = executionDrawerExpanded || drawerState.expanded === true;
    // 抽屉双形态: 确认挂起 = 完整卡片; 其余状态 = 细状态线(视觉压缩在 CSS 层, DOM 不变)
    executionDrawerEl.setAttribute?.(
      "data-drawer-mode",
      drawerConfirmationPending(execution) ? "confirm" : "slim"
    );
    const progress = execution.progress || {};
    const progressText = progress.total ? ` ${progress.done || 0}/${progress.total}` : "";
    const line1 = safeTrim(drawerState.line1) || `${execution.title || "AI 执行任务"}${progressText}`;
    let line2 = safeTrim(drawerState.line2) || cardStatusText(execution.status);
    if (line2 === line1) {
      const statusText = cardStatusText(execution.status);
      line2 = statusText !== line1 ? statusText : "";
    }
    const copy = createElement(documentRef, "div", "hy-canvas-agent-execution-copy");
    copy.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-line1", line1));
    copy.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-line2", line2));
    const actions = createElement(documentRef, "div", "hy-canvas-agent-execution-actions");
    const expand = createElement(documentRef, "button", "hy-canvas-agent-execution-expand", expanded ? "收起" : "展开");
    expand.type = "button";
    expand.setAttribute?.("aria-label", expanded ? "收起执行计划和时间线" : "展开执行计划和时间线");
    expand.addEventListener("click", () => {
      executionDrawerExpanded = !expanded;
      render();
    });
    actions.appendChild(expand);
    const label = drawerActionLabel(execution);
    const confirmState = label === "确认";
    if (confirmState) {
      const counts = executionGenerationCounts(execution);
      const confirmMessage = generationConfirmationMessage(counts);
      if (confirmMessage) {
        const lineTwoEl = copy.children?.[1] || copy.childNodes?.[1];
        if (lineTwoEl) {
          lineTwoEl.textContent = confirmMessage;
        }
      }
      const badgeRow = createElement(documentRef, "div", "hy-canvas-agent-confirm-badges");
      const badgeEntries = [
        ["文本", Number(counts.text || 0)],
        ["图片", Number(counts.image || 0)],
        ["视频", Number(counts.video || 0)],
      ];
      for (const [labelText, count] of badgeEntries) {
        if (count > 0) {
          badgeRow.appendChild(
            createElement(documentRef, "span", "hy-canvas-agent-confirm-badge", `${labelText} ×${count}`)
          );
        }
      }
      if (badgeRow.children?.length || badgeRow.childNodes?.length) {
        copy.appendChild(badgeRow);
      }
    }
    if (label) {
      const action = createElement(documentRef, "button", "hy-canvas-agent-execution-action", label);
      action.type = "button";
      action.setAttribute?.("aria-label", label);
      if (confirmState) {
        action.setAttribute?.("data-confirm", "true");
      }
      action.addEventListener("click", () => schedule(() => handleExecutionDrawerAction(execution)));
      actions.appendChild(action);
    }
    executionDrawerEl.setAttribute?.("data-confirm", confirmState ? "true" : "false");
    executionDrawerEl.appendChild(copy);
    executionDrawerEl.appendChild(actions);
    if (expanded) {
      const detailExecution = executionForExpandedDrawer(execution);
      const queueStrip = renderExecutionQueueStrip(execution, detailExecution);
      if (queueStrip) {
        executionDrawerEl.appendChild(queueStrip);
      }
      if (
        safeTrim(execution.status) === "completed" &&
        typeof resolvedExecutionOrchestrator?.replay === "function" &&
        isRunnableExecution(execution)
      ) {
        const replayButton = createElement(documentRef, "button", "hy-canvas-agent-execution-replay", "回放结构");
        replayButton.type = "button";
        replayButton.addEventListener("click", () => schedule(() => replayExecution(execution.id)));
        executionDrawerEl.appendChild(replayButton);
      }
      const detail = createElement(documentRef, "div", "hy-canvas-agent-execution-detail");
      const plan = createElement(documentRef, "div", "hy-canvas-agent-execution-plan");
      plan.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "计划"));
      const steps = Array.isArray(detailExecution?.plan?.steps) ? detailExecution.plan.steps : [];
      if (steps.length) {
        const planEditable =
          PLAN_EDITABLE_STATUSES.has(safeTrim(detailExecution?.status)) &&
          typeof executionStore?.setPlanStepEnabled === "function";
        steps.forEach((step, index) => {
          const title = safeTrim(step?.title || step?.name || step?.id) || `步骤 ${index + 1}`;
          const status = safeTrim(step?.status);
          const disabledSuffix = step?.enabled === false ? "（已停用）" : "";
          const stepId = safeTrim(step?.id);
          const row = createElement(
            documentRef,
            "div",
            "hy-canvas-agent-execution-step",
            `${index + 1}. ${title}${status ? ` · ${status}` : ""}${disabledSuffix}`
          );
          if (stepId) {
            row.setAttribute?.("data-step-id", stepId);
          }
          if (planEditable && stepId && !planStepExecuted(detailExecution, stepId)) {
            row.setAttribute?.("draggable", "true");
            row.addEventListener("dragstart", () => {
              executionPlanDragStepId = stepId;
            });
            row.addEventListener("dragover", (event) => {
              event?.preventDefault?.();
            });
            row.addEventListener("drop", (event) => {
              event?.preventDefault?.();
              const draggedStepId = safeTrim(executionPlanDragStepId);
              executionPlanDragStepId = "";
              if (draggedStepId && draggedStepId !== stepId) {
                schedule(() => handlePlanStepsReorder(detailExecution, planOrderAfterDrop(steps, draggedStepId, stepId)));
              }
            });
            const toggle = createElement(
              documentRef,
              "button",
              "hy-canvas-agent-execution-step-toggle",
              step?.enabled === false ? "启用" : "停用"
            );
            toggle.type = "button";
            toggle.setAttribute?.("data-step-id", stepId);
            toggle.addEventListener("click", (event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              schedule(() => handlePlanStepToggle(detailExecution, step));
            });
            row.appendChild(toggle);
            const moveUp = createElement(documentRef, "button", "hy-canvas-agent-execution-step-up", "上移");
            moveUp.type = "button";
            moveUp.setAttribute?.("data-step-id", stepId);
            moveUp.addEventListener("click", (event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              schedule(() => handlePlanStepsReorder(detailExecution, planOrderAfterMove(steps, stepId, -1)));
            });
            row.appendChild(moveUp);
            const moveDown = createElement(documentRef, "button", "hy-canvas-agent-execution-step-down", "下移");
            moveDown.type = "button";
            moveDown.setAttribute?.("data-step-id", stepId);
            moveDown.addEventListener("click", (event) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              schedule(() => handlePlanStepsReorder(detailExecution, planOrderAfterMove(steps, stepId, 1)));
            });
            row.appendChild(moveDown);
          }
          plan.appendChild(row);
        });
      } else {
        plan.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-empty", "暂无计划步骤"));
      }
      const dependencyEdges = [];
      steps.forEach((step) => {
        const stepTitle = safeTrim(step?.title || step?.name || step?.id);
        (Array.isArray(step?.dependsOn) ? step.dependsOn : []).forEach((dependencyId) => {
          const fromTitle = planStepTitleById(detailExecution, dependencyId) || safeTrim(dependencyId);
          if (fromTitle && stepTitle) {
            dependencyEdges.push(`${fromTitle} → ${stepTitle}`);
          }
        });
      });
      if (dependencyEdges.length) {
        const dag = createElement(documentRef, "div", "hy-canvas-agent-execution-dag");
        dag.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "依赖关系"));
        dependencyEdges.forEach((edge) => {
          dag.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-dag-edge", edge));
        });
        const graphLines = [];
        const stepTitleFor = (step) => safeTrim(step?.title || step?.name || step?.id);
        const childrenByStep = new Map();
        steps.forEach((step) => {
          (Array.isArray(step?.dependsOn) ? step.dependsOn : []).map(safeTrim).filter(Boolean).forEach((dep) => {
            if (!childrenByStep.has(dep)) {
              childrenByStep.set(dep, []);
            }
            childrenByStep.get(dep).push(step);
          });
        });
        const renderNode = (step, depth, visited) => {
          const id = safeTrim(step?.id);
          if (!id || visited.has(id)) {
            return;
          }
          visited.add(id);
          graphLines.push(depth === 0 ? `[${stepTitleFor(step)}]` : `${"   ".repeat(depth - 1)} └─▶ ${stepTitleFor(step)}`);
          (childrenByStep.get(id) || []).forEach((child) => renderNode(child, depth + 1, visited));
        };
        const visited = new Set();
        steps
          .filter((step) => !(Array.isArray(step?.dependsOn) && step.dependsOn.some((dep) => safeTrim(dep))))
          .forEach((root) => renderNode(root, 0, visited));
        steps.forEach((step) => renderNode(step, 0, visited));
        const graphEl = createElement(documentRef, "pre", "hy-canvas-agent-execution-dag-graph", graphLines.join("\n"));
        dag.appendChild(graphEl);
        plan.appendChild(dag);
      }
      const timeline = createElement(documentRef, "div", "hy-canvas-agent-execution-timeline");
      timeline.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "时间线"));
      const events = Array.isArray(detailExecution?.timeline) ? detailExecution.timeline : [];
      const selectedEventId = safeTrim(executionDrawerSelectedEventId);
      const selectedEvent =
        events.find((event, index) => (safeTrim(event?.id) || `event-${index}`) === selectedEventId) ||
        null;
      if (events.length) {
        events.forEach((event, index) => {
          const eventId = safeTrim(event?.id) || `event-${index}`;
          const row = createElement(
            documentRef,
            "button",
            "hy-canvas-agent-execution-event",
            safeTrim(event?.humanSummary || event?.summary || event?.status) || "执行事件"
          );
          row.type = "button";
          row.setAttribute?.("data-event-id", eventId);
          row.setAttribute?.("data-selected", safeTrim(selectedEvent?.id) === eventId ? "true" : "false");
          row.addEventListener("click", () => {
            executionDrawerSelectedEventId = eventId;
            render();
          });
          timeline.appendChild(row);
        });
      } else {
        timeline.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-empty", "暂无时间线"));
      }
      const detailExecutionId = safeTrim(detailExecution?.id || execution?.id);
      const eventDetail = createElement(documentRef, "div", "hy-canvas-agent-execution-event-detail");
      eventDetail.appendChild(createElement(documentRef, "div", "hy-canvas-agent-execution-section-title", "详情"));
      const devToggle = createElement(
        documentRef,
        "button",
        "hy-canvas-agent-execution-dev-toggle",
        executionDeveloperMode ? "开发者：开" : "开发者"
      );
      devToggle.type = "button";
      devToggle.addEventListener("click", () => {
        executionDeveloperMode = !executionDeveloperMode;
        render();
      });
      eventDetail.appendChild(devToggle);
      eventDetail.appendChild(
        createElement(
          documentRef,
          "div",
          "hy-canvas-agent-execution-event-detail-text",
          timelineEventDetailText(selectedEvent)
        )
      );
      const dependencyDetailText = dependencyBlockedDetailText(detailExecution, selectedEvent);
      if (dependencyDetailText) {
        eventDetail.appendChild(
          createElement(
            documentRef,
            "div",
            "hy-canvas-agent-execution-dependency-detail",
            dependencyDetailText
          )
        );
      }
      if (
        selectedEvent &&
        (
          timelineEventNodeIds(selectedEvent).length ||
          selectedEvent.canRetry === true ||
          timelineEventCanUndo(detailExecution, selectedEvent)
        )
      ) {
        const detailActions = createElement(documentRef, "div", "hy-canvas-agent-execution-detail-actions");
        if (timelineEventNodeIds(selectedEvent).length) {
          const focusButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-focus", "聚焦对象");
          focusButton.type = "button";
          focusButton.addEventListener("click", () => focusTimelineEventNodes(selectedEvent));
          detailActions.appendChild(focusButton);
        }
        if (timelineEventCanUndo(detailExecution, selectedEvent)) {
          const undoButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-undo", "撤销此步");
          undoButton.type = "button";
          undoButton.addEventListener("click", () => schedule(() => undoTimelineEvent(detailExecutionId, selectedEvent)));
          detailActions.appendChild(undoButton);
          if (timelineEventCanUndoTo(detailExecution, selectedEvent)) {
            const undoToButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-undo-to", "撤销到这里");
            undoToButton.type = "button";
            undoToButton.addEventListener("click", () => schedule(() => undoTimelineEventsTo(detailExecutionId, selectedEvent)));
            detailActions.appendChild(undoToButton);
          }
        }
        if (
          safeTrim(selectedEvent.status) === "completed" &&
          ["queue_generation_task", "run_prompt_preset_generation"].includes(
            safeTrim(timelineEventActionJson(selectedEvent)?.type)
          ) &&
          typeof resolvedExecutionOrchestrator?.regenerateStep === "function"
        ) {
          const regenerateButton = createElement(
            documentRef,
            "button",
            "hy-canvas-agent-execution-detail-regenerate",
            "重新生成此步"
          );
          regenerateButton.type = "button";
          regenerateButton.addEventListener("click", () =>
            schedule(() => regenerateTimelineEvent(detailExecutionId, selectedEvent))
          );
          detailActions.appendChild(regenerateButton);
        }
        if (selectedEvent.canRetry === true && safeTrim(selectedEvent.actionId)) {
          if (timelineEventNeedsVideoAuthorization(selectedEvent)) {
            const authorizeButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-authorize-video", "授权视频");
            authorizeButton.type = "button";
            authorizeButton.addEventListener("click", () => schedule(() => authorizeTimelineVideoEvent(detailExecutionId, selectedEvent)));
            detailActions.appendChild(authorizeButton);
          } else {
            const retryButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-retry", "重试此步");
            retryButton.type = "button";
            retryButton.addEventListener("click", () => schedule(() => retryTimelineEvent(detailExecutionId, selectedEvent)));
            detailActions.appendChild(retryButton);
          }
          if (!timelineEventNeedsVideoAuthorization(selectedEvent) && typeof resolvedExecutionOrchestrator?.skip === "function") {
            const skipButton = createElement(documentRef, "button", "hy-canvas-agent-execution-detail-skip", "跳过此步");
            skipButton.type = "button";
            skipButton.addEventListener("click", () => schedule(() => skipTimelineEvent(detailExecutionId, selectedEvent)));
            detailActions.appendChild(skipButton);
          }
        }
        eventDetail.appendChild(detailActions);
      }
      if (executionDeveloperMode) {
        const metricsData = computeExecutionMetrics(
          typeof executionStore?.snapshot === "function" ? executionStore.snapshot() : { executions: [] }
        );
        const formatPercent = (value) => `${Math.round(Number(value || 0) * 100)}%`;
        const metricsEl = createElement(
          documentRef,
          "div",
          "hy-canvas-agent-execution-metrics",
          [
            `技能命中率 ${formatPercent(metricsData.skillHitRate)}`,
            `动作合法率 ${formatPercent(metricsData.actionValidityRate)}`,
            `失败可恢复率 ${formatPercent(metricsData.failureRecoveryRate)}`,
            `可找回率 ${formatPercent(metricsData.executionFindabilityRate)}`,
            `平均动作耗时 ${Math.round(metricsData.avgActionDurationMs)}ms`,
            `执行数 ${metricsData.totalExecutions}`,
          ].join(" · ")
        );
        eventDetail.appendChild(metricsEl);
      }
      if (executionDeveloperMode && selectedEvent) {
        const devJson = createElement(
          documentRef,
          "pre",
          "hy-canvas-agent-execution-dev-json",
          JSON.stringify(
            {
              id: selectedEvent.id,
              status: selectedEvent.status,
              durationMs: selectedEvent.durationMs,
              target: selectedEvent.target,
              inverse: selectedEvent.inverse,
              developer: selectedEvent.developer,
            },
            null,
            2
          )
        );
        eventDetail.appendChild(devJson);
      }
      const side = createElement(documentRef, "div", "hy-canvas-agent-execution-side");
      side.appendChild(timeline);
      side.appendChild(eventDetail);
      detail.appendChild(plan);
      detail.appendChild(side);
      executionDrawerEl.appendChild(detail);
      applyExecutionTimelineScroll(timeline, detailExecutionId);
      timeline.addEventListener("scroll", () => pauseExecutionTimelineAutoScroll(timeline, detailExecutionId));
    }
    executionDrawerEl.setAttribute?.("data-status", execution.status || "");
    executionDrawerEl.setAttribute?.("aria-expanded", expanded ? "true" : "false");
    setHidden(executionDrawerEl, false);
    if (executionBackdropEl) {
      setHidden(executionBackdropEl, !expanded);
    }
  }

  function render() {
    if (!root) {
      return;
    }
    if (sessionEl) {
      sessionEl.textContent = displaySessionLabel();
    }
    if (modelButton) {
      const model = state.selectedModel;
      modelButton.textContent = model ? `\u2723 ${assistantModelLabel(model)}` : "\u2723 Agent";
    }
    if (modelMenuEl) {
      renderModelMenu();
    }
    if (modelButton && state.selectedModel) {
      const model = state.selectedModel;
      modelButton.textContent = `\u2723 ${assistantModelLabel(model)}`;
    }
    if (modeButton) {
      modeButton.textContent = state.agentMode === "act" ? "Act" : "Plan";
      modeButton.setAttribute?.("aria-label", `Agent mode: ${state.agentMode}`);
    }
    if (attachmentListEl) {
      renderAttachments();
    }
    if (attachmentPreviewEl) {
      renderAttachmentPreview();
    }
    if (mentionMenuEl) {
      renderMentionMenu();
    }
    if (historyEl) {
      renderHistory();
    }
    renderExecutionDrawer();
    // D6: (re)evaluate launch chips on the latest prefix-less reply before paint.
    state.refreshLaunchChips();
    renderMessages(documentRef, messagesEl, state.messages, {
      streaming: state.streaming === true,
      onToggle: () => render(),
      // D4: a living-card chip (e.g. paused [继续]/[取消]) dispatches its bound
      // command through the same path as typing it — no separate execution lane.
      onCardOption: (card, option) => {
        if (option?.command) {
          schedule(() => state.sendMessage(option.command, { onUpdate: render }));
        }
      },
      // D5: launch chip → contract preview → confirm/cancel.
      onLaunchChip: (card, chip) => schedule(() => state.launchChipPreview(card, chip?.id, { onUpdate: render })),
      onContractConfirm: (card) => schedule(() => state.launchContractConfirm(card, { onUpdate: render })),
      onContractCancel: (card) => schedule(() => state.launchContractCancel(card, { onUpdate: render })),
      onConfirm: () => schedule(() => handleConfirmCard()),
      onClarifyTarget: (card, target) => schedule(() => handleClarificationCard(card, target)),
      onCancel: () => {
        state.cancelPendingInteractionCard?.();
        render();
      },
      // 复制: 写入剪贴板 + 图标短暂变对勾反馈
      onCopy: (message, button, docRef) => {
        const text = String(message?.content || "");
        try {
          globalThis.navigator?.clipboard?.writeText?.(text);
        } catch (error) {
          /* 剪贴板不可用时静默 */
        }
        setMsgActionIcon(docRef, button, MSG_ICON_CHECK);
        addClass(button, "hy-msg-copied");
        setTimeout(() => {
          setMsgActionIcon(docRef, button, MSG_ICON_COPY);
          removeClass(button, "hy-msg-copied");
        }, 1400);
      },
      // 认同/不认同: 互斥, 再次点击取消; 记在 message.feedback(本会话)
      onFeedback: (message, type, upButton, downButton) => {
        const next = message.feedback === type ? null : type;
        message.feedback = next;
        upButton.classList?.toggle?.("is-active", next === "up");
        downButton.classList?.toggle?.("is-active", next === "down");
      },
    });
    const userVisibleWarnings = state.lastWarnings.filter(
      (warning) => !(/repaired/i).test(String(warning || ""))
    );
    const warningText = userVisibleWarnings.length > 0 ? userVisibleWarnings.join("\n") : "";
    const actionPreviewText = state.pendingActions.length > 0 ? state.previewText() : "";
    const previewText = [warningText, actionPreviewText].filter(Boolean).join("\n\n");
    const activeCard = latestCanvasActionCard();
    const cardOwnsGeneratedNodeActions = Number(activeCard?.analysis?.generatedNodeCount || 0) > 0;
    if (previewEl) {
      if (typeof previewEl.replaceChildren === "function") {
        previewEl.replaceChildren();
        if (warningText) {
          previewEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-preview-warning", warningText));
        }
        if (state.pendingActions.length > 0 && !cardOwnsGeneratedNodeActions) {
          previewEl.appendChild(renderActionPreviewCard(state.previewModel(), actionPreviewText));
        }
      } else {
        previewEl.textContent = previewText;
      }
      setHidden(previewEl, !warningText && (state.pendingActions.length === 0 || cardOwnsGeneratedNodeActions));
    }
    if (applyButton) {
      setHidden(applyButton, !state.pendingActions.length || Boolean(activeCard?.requiresConfirmation));
    }
    if (strongConfirmButton) {
      // APPLY strong-confirm retired (2026-06-12): one confirmation click now
      // doubles as video authorization, so this extra gate stays hidden.
      setHidden(strongConfirmButton, true);
    }
    if (receiptEl) {
      // Slice 6: don't duplicate the render 收工条 in the green bar when the
      // living card already shows it. Transient notices (copied, etc.) and
      // card-less flows (errors, model-config warnings) still surface here.
      const renderCardOwnsReceipt = latestReplyRenderCardShowsReceipt(state.lastReceipt);
      const receiptText = transientNoticeVisible
        ? state.lastReceipt
        : (shouldShowReceipt(state.lastReceipt) && !renderCardOwnsReceipt ? state.lastReceipt : "");
      receiptEl.textContent = receiptText;
      setHidden(receiptEl, !receiptText);
    }
    if (sendButton) {
      const hasInput = Boolean(String(inputEl?.value || "").trim());
      if (state.vimaxRenderInFlight) {
        // Single-flight rule #2: a 成片 render is the active flow. The send
        // button becomes a clickable 进行中⏹ that cancels it, never a dead lock.
        sendButton.textContent = "⏹"; // ⏹
        sendButton.dataset.canvasAgentControl = "cancel-render";
        sendButton.setAttribute?.("aria-label", "取消成片");
        sendButton.disabled = false;
        sendButton.classList?.toggle?.("is-ready", true);
      } else {
        sendButton.textContent = "▲"; // ▲
        sendButton.dataset.canvasAgentControl = "send";
        sendButton.setAttribute?.("aria-label", "发送");
        sendButton.disabled = state.streaming || !state.canSendMessage(inputEl?.value) || !hasInput;
        sendButton.classList?.toggle?.("is-ready", !sendButton.disabled);
      }
    }
    if (labButtonEl) {
      // Slice 7 follow-up: surface the selected 拍法 ON the toolbar entry, capped
      // at 4 chars then "…" so it stays compact (full name on hover via title).
      const cur = safeTrim(state.currentFilmCraft);
      if (cur) {
        const short = cur.length > 4 ? `${cur.slice(0, 4)}…` : cur;
        labButtonEl.textContent = `☰ ${short}`;
        labButtonEl.setAttribute?.("title", `拍法库 · ${cur}`);
      } else {
        labButtonEl.textContent = "☰ 拍法库";
        labButtonEl.setAttribute?.("title", "拍法库");
      }
    }
    if (execHistoryBtnEl) {
      // 头部「执行历史」图标:数量徽标 + 打开态高亮。
      const count = executionSnapshotForDrawer().executions.length;
      execHistoryBtnEl.classList?.toggle?.("is-active", executionHistoryVisible === true);
      execHistoryBtnEl.setAttribute?.("aria-label", count ? `执行历史（${count}）` : "执行历史");
      execHistoryBtnEl.setAttribute?.("title", count ? `执行历史（${count}）` : "执行历史");
      if (execHistoryBadgeEl) {
        execHistoryBadgeEl.textContent = count > 99 ? "99+" : String(count);
        setHidden(execHistoryBadgeEl, count === 0);
      }
    }
  }

  function setBusy(busy) {
    if (sendButton) {
      const hasInput = Boolean(String(inputEl?.value || "").trim());
      sendButton.disabled = Boolean(busy) || !state.canSendMessage(inputEl?.value) || !hasInput;
    }
    if (applyButton) {
      applyButton.disabled = Boolean(busy);
    }
  }

  async function handleSend(text = inputEl?.value) {
    const draftText = String(text ?? "");
    const message = draftText.trim();
    if (!message) {
      render();
      return null;
    }
    if (inputEl) {
      inputEl.value = "";
    }
    render();
    setBusy(true);
    try {
      const response = await state.sendMessage(message, { onUpdate: render });
      if (state.lastAutoExecutionPromise) {
        try {
          await state.lastAutoExecutionPromise;
        } finally {
          state.lastAutoExecutionPromise = null;
        }
      }
      if (!response && (state.status === "failed" || state.status === "error")) {
        if (inputEl) {
          inputEl.value = draftText;
        }
      }
      return response;
    } catch (error) {
      if (inputEl) {
        inputEl.value = draftText;
      }
      state.lastReceipt = error?.message || "Assistant request failed.";
      return null;
    } finally {
      setBusy(false);
      render();
    }
  }

  async function handleApply() {
    setBusy(true);
    try {
      return await state.applyPendingActions();
    } catch (error) {
      state.lastReceipt = error?.message || "Applying actions failed.";
      return state.lastReceipt;
    } finally {
      setBusy(false);
      render();
    }
  }

  async function handleConfirmCard() {
    setBusy(true);
    try {
      return await state.confirmPendingInteractionCard?.({ onUpdate: render });
    } catch (error) {
      state.lastReceipt = error?.message || "Applying actions failed.";
      return state.lastReceipt;
    } finally {
      setBusy(false);
      render();
    }
  }

  async function handleClarificationCard(card, target) {
    const text =
      card?.type === "queue_title_clarification"
        ? safeTrim(target)
        : target === "queue"
          ? "\u6392\u961f\u4efb\u52a1"
          : "\u5f53\u524d\u4efb\u52a1";
    setBusy(true);
    try {
      return await state.sendMessage(text, { onUpdate: render });
    } finally {
      setBusy(false);
      render();
    }
  }

  async function handleExecutionDrawerAction(execution = null) {
    const targetExecution = execution || visibleExecutionForDrawer();
    const label = drawerActionLabel(targetExecution);
    if (!label) {
      return null;
    }
    if (label === "授权视频") {
      const shouldRunV2Execution =
        isRunnableExecution(targetExecution) &&
        executionHasUnauthorizedVideoAction(targetExecution) &&
        typeof resolvedExecutionOrchestrator?.run === "function";
      state.approveVideoGeneration();
      if (shouldRunV2Execution) {
        setBusy(true);
        try {
          return await resolvedExecutionOrchestrator.run(targetExecution?.id, {
            agentMode: state.agentMode,
            videoAuthorized: true,
          });
        } finally {
          setBusy(false);
          render();
        }
      }
      return await handleApply();
    }
    if (label === "确认") {
      if (isRunnableExecution(targetExecution) && typeof resolvedExecutionOrchestrator?.run === "function") {
        const counts = executionGenerationCounts(targetExecution);
        setBusy(true);
        try {
          return await resolvedExecutionOrchestrator.run(targetExecution?.id, {
            agentMode: state.agentMode,
            videoAuthorized:
              counts.video > 0 ||
              (state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true),
          });
        } finally {
          setBusy(false);
          render();
        }
      }
      return await handleConfirmCard();
    }
    if (label === "暂停" && typeof resolvedExecutionOrchestrator?.pause === "function") {
      const result = resolvedExecutionOrchestrator.pause(targetExecution?.id);
      render();
      return result;
    }
    if (label === "继续" && typeof resolvedExecutionOrchestrator?.resume === "function") {
      setBusy(true);
      try {
        return await resolvedExecutionOrchestrator.resume(targetExecution?.id, {
          agentMode: state.agentMode,
          videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
        });
      } finally {
        setBusy(false);
        render();
      }
    }
    if (label === "重试" && typeof resolvedExecutionOrchestrator?.retry === "function") {
      setBusy(true);
      try {
        return await resolvedExecutionOrchestrator.retry(targetExecution?.id, {
          agentMode: state.agentMode,
          videoAuthorized: state.videoGenerationAuthorized === true && state.strongConfirmationApproved === true,
        });
      } finally {
        setBusy(false);
        render();
      }
    }
    if (label === "关闭" && typeof executionStore?.updateStatus === "function") {
      const updated = executionStore.updateStatus(targetExecution?.id, targetExecution?.status, {
        drawerState: {
          ...(targetExecution?.drawerState || {}),
          visible: false,
          expanded: false,
        },
      });
      executionDrawerExpanded = false;
      if (executionDrawerSelectedExecutionId === safeTrim(targetExecution?.id)) {
        executionDrawerSelectedExecutionId = "";
        executionDrawerSelectedEventId = "";
      }
      if (
        updated &&
        resolvedExecutionSyncClient &&
        typeof resolvedExecutionSyncClient.updateExecutionStatus === "function"
      ) {
        state.lastExecutionSyncPromise = Promise.resolve()
          .then(() =>
            resolvedExecutionSyncClient.updateExecutionStatus(updated.id, updated.status, {
              drawerState: updated.drawerState,
            })
          )
          .catch((error) => {
            state.lastExecutionSyncError = safeTrim(error?.message || error) || "Execution close sync failed";
          });
      }
      render();
      return updated;
    }
    return null;
  }

  function schedule(task) {
    currentTask = Promise.resolve().then(task);
    return currentTask;
  }

  function clearNoticeTimers() {
    if (noticeTimer && typeof clearTimeoutFn === "function") {
      clearTimeoutFn(noticeTimer);
    }
    if (noticeFadeTimer && typeof clearTimeoutFn === "function") {
      clearTimeoutFn(noticeFadeTimer);
    }
    noticeTimer = null;
    noticeFadeTimer = null;
  }

  function showTransientNotice(text) {
    state.lastReceipt = String(text || "");
    transientNoticeVisible = shouldShowReceipt(state.lastReceipt);
    clearNoticeTimers();
    removeClass(receiptEl, "is-fading");
    render();
    if (!state.lastReceipt || typeof setTimeoutFn !== "function") {
      return;
    }
    noticeTimer = setTimeoutFn(() => {
      addClass(receiptEl, "is-fading");
      noticeFadeTimer = setTimeoutFn(() => {
        state.lastReceipt = "";
        transientNoticeVisible = false;
        removeClass(receiptEl, "is-fading");
        render();
      }, noticeFadeMs);
    }, noticeDurationMs);
  }

  function runSend(text) {
    currentTask = Promise.resolve(handleSend(text));
    return currentTask;
  }

  // 拍法库 picker (slice 7). Toggles a list of film-craft skills; selecting one
  // injects 《名》 into the 导演 flow. 立即开拍 sends 导演:<当前输入>《名》
  // now; 设为当前拍法 stashes the craft so subsequent 导演 commands carry it.
  async function toggleCraftPicker() {
    if (!craftPickerEl) return;
    if (craftPickerEl.hidden === false) {
      setHidden(craftPickerEl, true);
      return;
    }
    setHidden(craftPickerEl, false);
    renderCraftPicker("加载拍法库…");
    await state.loadFilmCraftRoster();
    renderCraftPicker();
  }

  function renderCraftPicker(loadingText) {
    if (!craftPickerEl) return;
    if (typeof craftPickerEl.replaceChildren === "function") {
      craftPickerEl.replaceChildren();
    }
    const head = createElement(documentRef, "div", "hy-canvas-agent-craft-head");
    head.appendChild(createElement(documentRef, "span", "hy-canvas-agent-craft-title", "拍法库 · 选拍法注入导演分镜"));
    if (safeTrim(state.currentFilmCraft)) {
      const cur = createElement(documentRef, "button", "hy-canvas-agent-craft-current", `当前拍法:${state.currentFilmCraft} ✕`);
      cur.type = "button";
      cur.addEventListener("click", () => { state.setCurrentFilmCraft(""); renderCraftPicker(); });
      head.appendChild(cur);
    }
    craftPickerEl.appendChild(head);
    if (loadingText) {
      craftPickerEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-craft-empty", loadingText));
      return;
    }
    const roster = Array.isArray(state.filmCraftRoster) ? state.filmCraftRoster : [];
    if (!roster.length) {
      craftPickerEl.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-craft-empty", "拍法库为空——请先把拍法 *.md seed 到 user/skills")
      );
      return;
    }
    const list = createElement(documentRef, "div", "hy-canvas-agent-craft-list");
    roster.slice(0, 60).forEach((craft) => {
      const row = createElement(documentRef, "div", "hy-canvas-agent-craft-row");
      row.setAttribute?.("data-craft-name", craft.name);
      const copy = createElement(documentRef, "div", "hy-canvas-agent-craft-copy");
      copy.appendChild(createElement(documentRef, "div", "hy-canvas-agent-craft-name", craft.name));
      if (craft.summary) {
        copy.appendChild(createElement(documentRef, "div", "hy-canvas-agent-craft-summary", craft.summary));
      }
      copy.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-craft-note", "成片产关键帧图(非视频片)")
      );
      row.appendChild(copy);
      const acts = createElement(documentRef, "div", "hy-canvas-agent-craft-actions");
      const go = createElement(documentRef, "button", "hy-canvas-agent-craft-go", "立即开拍");
      go.type = "button";
      go.addEventListener("click", () => {
        setHidden(craftPickerEl, true);
        const brief = String(inputEl?.value || "").trim();
        runSend(synthesizeFilmCraftCommand(brief, craft.name));
      });
      const set = createElement(documentRef, "button", "hy-canvas-agent-craft-set", "设为当前拍法");
      set.type = "button";
      set.addEventListener("click", () => {
        state.setCurrentFilmCraft(craft.name);
        state.lastReceipt = `已设为当前拍法:${craft.name}(后续「导演:」自动带上《${craft.name}》)`;
        setHidden(craftPickerEl, true);
        render();
      });
      acts.appendChild(go);
      acts.appendChild(set);
      row.appendChild(acts);
      list.appendChild(row);
    });
    craftPickerEl.appendChild(list);
  }

  function resetConversationUi(nextConversationId = "") {
    state.conversationId = String(nextConversationId || "");
    state.messages = [];
    state.pendingActions = [];
    state.strongConfirmationApproved = false;
    state.videoGenerationAuthorized = false;
    state.lastReceipt = "";
    state.lastContext = undefined;
    state.mentionBindings = [];
    state.lastWarnings = [];
    state.lastResponse = null;
    state.status = "idle";
    state.streaming = false;
    render();
  }

  async function copySessionId() {
    const value = displaySessionLabel();
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(value);
        state.lastReceipt = `Copied conversation ID: ${value}`;
      } else {
        state.lastReceipt = `Conversation ID: ${value}`;
      }
    } catch (error) {
      state.lastReceipt = error?.message || `Conversation ID: ${value}`;
    }
    render();
  }

  function createNewConversation() {
    if (conversationStore && typeof conversationStore.create === "function") {
      const conversation = conversationStore.create({
        assistantIntent: state.assistantIntent,
        model: state.selectedModel,
      });
      resetConversationUi(conversation?.id || "");
      state.lastReceipt = `New conversation: ${displaySessionLabel()}`;
      render();
      return;
    }
    resetConversationUi("");
    state.lastReceipt = "New local conversation started.";
    render();
  }

  function openConversationFromHistory(conversation) {
    if (!conversation) {
      return;
    }
    state.restoreConversation(conversation);
    historyVisible = false;
    render();
  }

  function renderHistory() {
    if (!historyEl) {
      return;
    }
    setHidden(historyEl, !historyVisible);
    historyEl.replaceChildren?.();
    if (!historyVisible) {
      return;
    }
    const title = createElement(documentRef, "div", "hy-canvas-agent-history-title", "会话记录");
    historyEl.appendChild(title);
    const search = createElement(documentRef, "input", "hy-canvas-agent-history-search");
    search.type = "search";
    search.placeholder = "搜索会话";
    search.value = historyQuery;
    search.addEventListener("input", () => {
      historyQuery = String(search.value || "");
      render();
    });
    historyEl.appendChild(search);

    const sourceConversations =
      conversationStore && typeof conversationStore.list === "function" ? conversationStore.list() : [];
    const query = historyQuery.trim().toLowerCase();
    const conversations = query && typeof conversationStore?.search === "function"
      ? conversationStore.search(historyQuery)
      : sourceConversations.filter((conversation) => {
          if (!query) {
            return true;
          }
          const haystack = [
            conversation?.id,
            conversation?.title,
            ...(Array.isArray(conversation?.messages)
              ? conversation.messages.map((message) => message?.content)
              : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
    if (!conversations.length) {
      historyEl.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-history-empty", "暂无会话记录")
      );
      return;
    }
    conversations.slice(0, 12).forEach((conversation) => {
      const row = createElement(documentRef, "div", "hy-canvas-agent-history-row");
      const item = createElement(documentRef, "button", "hy-canvas-agent-history-item");
      item.type = "button";
      const itemTitle = String(conversation.title || "").trim() || conversation.id || "未命名会话";
      if (conversation.id && conversation.id === state.conversationId) {
        addClass(item, "is-active");
      }
      const count = Array.isArray(conversation.messages) ? conversation.messages.length : 0;
      const relativeTime = formatHistoryRelativeTime(conversation.updatedAt || conversation.createdAt);
      const snippet = historyLastSnippet(conversation);
      const generationSummary = historyGenerationSummary(conversation);

      // 行1: 标题 + 相对时间
      const head = createElement(documentRef, "div", "hy-ca-hist-head");
      head.appendChild(createElement(documentRef, "span", "hy-ca-hist-title", itemTitle));
      if (relativeTime) {
        head.appendChild(createElement(documentRef, "span", "hy-ca-hist-time", relativeTime));
      }
      item.appendChild(head);
      // 行2: 末条消息摘要
      if (snippet) {
        item.appendChild(createElement(documentRef, "div", "hy-ca-hist-snippet", snippet));
      }
      // 行3: 消息数 + 产出资产
      const foot = createElement(documentRef, "div", "hy-ca-hist-foot");
      foot.appendChild(createElement(documentRef, "span", "hy-ca-hist-count", `${count} 条`));
      if (generationSummary) {
        foot.appendChild(createElement(documentRef, "span", "hy-ca-hist-assets", generationSummary));
      }
      item.appendChild(foot);

      item.addEventListener("click", () => openConversationFromHistory(conversation));
      const remove = createElement(documentRef, "button", "hy-canvas-agent-history-delete", "×");
      remove.type = "button";
      remove.setAttribute?.("aria-label", `删除会话：${itemTitle}`);
      remove.addEventListener("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const deleted = typeof conversationStore?.delete === "function"
          ? conversationStore.delete(conversation.id)
          : typeof conversationStore?.remove === "function"
            ? conversationStore.remove(conversation.id)
            : false;
        state.lastReceipt = deleted
          ? `已删除会话：${itemTitle}`
          : `无法删除会话：${itemTitle}`;
        render();
      });
      row.appendChild(item);
      row.appendChild(remove);
      historyEl.appendChild(row);
    });
  }

  function toggleHistory() {
    historyVisible = !historyVisible;
    render();
  }

  function renderAttachments() {
    if (!attachmentListEl) {
      return;
    }
    attachmentListEl.replaceChildren?.();
    const attachments = state.attachmentItems();
    setHidden(attachmentListEl, attachments.length === 0);
    for (const attachment of attachments) {
      const tile = createElement(documentRef, "button", "hy-canvas-agent-attachment-thumb");
      tile.type = "button";
      tile.setAttribute?.("title", attachment.name || attachment.id || "reference");
      const src = String(attachment.previewUrl || attachment.url || attachment.src || "").trim();
      if (src && String(attachment.kind || "").toLowerCase() !== "text") {
        const img = createElement(documentRef, "img", "");
        img.src = src;
        img.setAttribute?.("src", src);
        img.alt = attachment.name || "reference";
        tile.appendChild(img);
      } else {
        tile.appendChild(createElement(documentRef, "span", "hy-canvas-agent-attachment-file", attachment.name || attachment.id || "file"));
      }
      tile.addEventListener("click", () => {
        previewAttachment = attachment;
        render();
      });
      const remove = createElement(documentRef, "button", "hy-canvas-agent-attachment-remove", "x");
      remove.type = "button";
      remove.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        attachmentStore?.remove?.(attachment.id);
        if (previewAttachment?.id === attachment.id) {
          previewAttachment = null;
        }
        render();
      });
      tile.appendChild(remove);
      attachmentListEl.appendChild(tile);
    }
  }

  function renderAttachmentPreview() {
    attachmentPreviewEl.replaceChildren?.();
    const src = String(previewAttachment?.previewUrl || previewAttachment?.url || previewAttachment?.src || "").trim();
    setHidden(attachmentPreviewEl, !previewAttachment || !src);
    if (!previewAttachment || !src) {
      return;
    }
    const close = createElement(documentRef, "button", "hy-canvas-agent-attachment-preview-close", "x");
    close.type = "button";
    close.addEventListener("click", () => {
      previewAttachment = null;
      render();
    });
    const img = createElement(documentRef, "img", "");
    img.src = src;
    img.setAttribute?.("src", src);
    img.alt = previewAttachment.name || "reference";
    attachmentPreviewEl.appendChild(close);
    attachmentPreviewEl.appendChild(img);
  }

  function currentMentionMenu() {
    const baseContext = buildContext({ graphStore });
    const nodes = resolveGraphNodes(graphStore);
    return buildAssistantMentionMenu({
      attachments: state.attachments(),
      nodes,
      assets: baseContext?.assets || {},
      query: mentionQuery,
    });
  }

  function openMentionMenu(query = "", triggerIndex = mentionTriggerIndex) {
    mentionQuery = String(query || "");
    mentionTriggerIndex = Number.isInteger(triggerIndex) ? triggerIndex : mentionTriggerIndex;
    mentionHoverSection = "";
    mentionHoverAssetCategory = "";
    floatingLayers.open("mention");
  }

  function closeMentionMenu() {
    mentionMenuVisible = false;
    mentionTriggerIndex = -1;
    floatingLayers.close("mention");
  }

  function updateMentionFromInput() {
    if (!inputEl) {
      return;
    }
    const value = String(inputEl.value || "");
    const cursor = Number.isInteger(inputEl.selectionStart) ? inputEl.selectionStart : value.length;
    const beforeCursor = value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex < 0) {
      closeMentionMenu();
      return;
    }
    const query = beforeCursor.slice(atIndex + 1);
    if (/\s/.test(query)) {
      closeMentionMenu();
      return;
    }
    openMentionMenu(query, atIndex);
  }

  function insertTextAtInput(text) {
    if (!inputEl) {
      return;
    }
    const value = String(inputEl.value || "");
    const start = Number.isInteger(inputEl.selectionStart) ? inputEl.selectionStart : value.length;
    const end = Number.isInteger(inputEl.selectionEnd) ? inputEl.selectionEnd : start;
    inputEl.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
    const nextPosition = start + text.length;
    try {
      inputEl.selectionStart = nextPosition;
      inputEl.selectionEnd = nextPosition;
    } catch {
      // Fake DOMs and older browsers can ignore selection updates.
    }
  }

  function selectMention(item) {
    if (!item || !inputEl) {
      return;
    }
    const token = item.displayToken || `@${item.label || item.id}`;
    const value = String(inputEl.value || "");
    const cursor = Number.isInteger(inputEl.selectionStart) ? inputEl.selectionStart : value.length;
    const atIndex = mentionTriggerIndex >= 0 ? mentionTriggerIndex : value.slice(0, cursor).lastIndexOf("@");
    const replaceEnd = atIndex >= 0 ? cursor : value.length;
    inputEl.value = atIndex >= 0
      ? `${value.slice(0, atIndex)}${token}${value.slice(replaceEnd)}`
      : `${value}${token}`;
    const nextPosition = atIndex >= 0 ? atIndex + token.length : inputEl.value.length;
    try {
      inputEl.selectionStart = nextPosition;
      inputEl.selectionEnd = nextPosition;
    } catch {
      // Selection updates are best-effort in fake DOMs.
    }
    state.mentionBindings = [
      ...state.mentionBindings,
      {
        id: item.id,
        type: item.type,
        label: item.label,
        assetType: item.assetType,
        source: item.source,
        raw: item.raw,
      },
    ];
    closeMentionMenu();
    inputEl.focus?.();
    render();
  }

  function renderMentionMenu() {
    if (!mentionMenuEl) {
      return;
    }
    setHidden(mentionMenuEl, !mentionMenuVisible);
    mentionMenuEl.replaceChildren?.();
    if (!mentionMenuVisible) {
      return;
    }
    const menu = currentMentionMenu();
    const addOption = (item) => {
      const option = createElement(documentRef, "button", "hy-canvas-agent-mention-option", item.label);
      option.type = "button";
      option.addEventListener("click", () => selectMention(item));
      mentionMenuEl.appendChild(option);
    };
    if (menu.references.length) {
      menu.references.forEach(addOption);
    } else {
      mentionMenuEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-mention-empty", "暂无参考内容"));
    }

    const canvasGroup = createElement(documentRef, "div", "hy-canvas-agent-mention-group", `${menu.canvasNodes.label} >`);
    canvasGroup.addEventListener("mouseenter", () => {
      mentionHoverSection = "canvas";
      render();
    });
    mentionMenuEl.appendChild(canvasGroup);
    if (mentionHoverSection === "canvas") {
      const search = createElement(documentRef, "input", "hy-canvas-agent-mention-search");
      search.type = "search";
      search.placeholder = "搜索画布节点";
      search.value = mentionQuery;
      search.addEventListener("input", () => {
        mentionQuery = String(search.value || "");
        render();
      });
      mentionMenuEl.appendChild(search);
      if (menu.canvasNodes.children.length) {
        menu.canvasNodes.children.forEach(addOption);
      } else {
        mentionMenuEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-mention-empty", "暂无画布节点"));
      }
    }

    const assetsGroup = createElement(documentRef, "div", "hy-canvas-agent-mention-group", `${menu.assets.label} >`);
    assetsGroup.addEventListener("mouseenter", () => {
      mentionHoverSection = "assets";
      render();
    });
    mentionMenuEl.appendChild(assetsGroup);
    if (mentionHoverSection === "assets") {
      if (menu.assets.emptyText) {
        mentionMenuEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-mention-empty", menu.assets.emptyText));
        return;
      }
      for (const category of menu.assets.categories) {
        const group = createElement(
          documentRef,
          "div",
          `hy-canvas-agent-mention-category${category.disabled ? " is-disabled" : ""}`,
          `${category.label} >`
        );
        group.addEventListener("mouseenter", () => {
          mentionHoverAssetCategory = category.key;
          render();
        });
        mentionMenuEl.appendChild(group);
        if (mentionHoverAssetCategory === category.key) {
          if (category.children.length) {
            category.children.forEach(addOption);
          } else {
            mentionMenuEl.appendChild(createElement(documentRef, "div", "hy-canvas-agent-mention-empty", category.emptyText || "暂无资产"));
          }
        }
      }
    }
  }

  async function attachLocalFiles(files) {
    const list = Array.from(files || []);
    if (!list.length || (!attachmentStore?.add && !attachmentStore?.upload)) {
      return;
    }
    const addLocalAttachment = (file) => {
      if (typeof attachmentStore?.add !== "function") {
        return false;
      }
      let previewUrl = "";
      if (file?.type?.startsWith?.("image/") && globalThis.URL?.createObjectURL) {
        try {
          previewUrl = globalThis.URL.createObjectURL(file);
        } catch {
          previewUrl = "";
        }
      }
      attachmentStore.add({
        name: file?.name,
        mime: file?.type,
        size: file?.size,
        previewUrl,
        usage: "reference",
      });
      return true;
    };
    let attachedCount = 0;
    for (const file of list) {
      if (typeof attachmentStore.upload === "function") {
        try {
          await attachmentStore.upload(file, { usage: "reference" });
          attachedCount += 1;
          continue;
        } catch (error) {
          if (!/uploader is required/i.test(String(error?.message || ""))) {
            throw error;
          }
        }
      }
      if (addLocalAttachment(file)) {
        attachedCount += 1;
      }
    }
    showTransientNotice(`${attachedCount} reference file${attachedCount === 1 ? "" : "s"} attached.`);
  }

  function selectModel(model) {
    const selected = state.selectModel(model);
    if (selected) {
      floatingLayers.close("model");
    }
    render();
  }

  function toggleModelMenu() {
    floatingLayers.toggle("model");
  }

  function renderModelMenu() {
    if (!modelMenuEl) {
      return;
    }
    const options = filterSelectableTextModelOptions(Array.isArray(state.modelOptions) ? state.modelOptions.filter(Boolean) : []);
    const rawOptions = Array.isArray(state.rawModelOptions) ? state.rawModelOptions.filter(Boolean) : [];
    setHidden(modelMenuEl, !modelMenuVisible || !options.length);
    modelMenuEl.replaceChildren?.();
    if (!modelMenuVisible) {
      return;
    }
    if (!options.length) {
      const guidance = createElement(
        documentRef,
        "div",
        "hy-canvas-agent-model-option is-disabled"
      );
      guidance.appendChild(
        createElement(documentRef, "span", "hy-canvas-agent-model-provider", MODEL_CONFIG_REQUIRED_MESSAGE)
      );
      const reason = rawOptions.map((model) => safeTrim(model.disabledReason)).find(Boolean);
      guidance.appendChild(
        createElement(documentRef, "span", "hy-canvas-agent-model-disabled-reason", reason || MODEL_CONFIG_ENTRY_LABEL)
      );
      guidance.appendChild(
        bindRequirement(
          createElement(documentRef, "span", "hy-canvas-agent-model-config-link", MODEL_CONFIG_ENTRY_LABEL),
          "model-registry-settings"
        )
      );
      modelMenuEl.appendChild(guidance);
      return;
    }
    const grouped = new Map();
    options.forEach((model) => {
      const provider = model.provider || "provider";
      if (!grouped.has(provider)) {
        grouped.set(provider, []);
      }
      grouped.get(provider).push(model);
    });
    grouped.forEach((models, provider) => {
      modelMenuEl.appendChild(
        createElement(documentRef, "div", "hy-canvas-agent-model-group", providerDisplayName(provider))
      );
      models.forEach((model) => {
        const option = createElement(
          documentRef,
          "button",
          `hy-canvas-agent-model-option${model.configured === false ? " is-disabled" : ""}`
        );
        option.type = "button";
        if (model.configured === false) {
          option.setAttribute?.("aria-disabled", "true");
        }
        option.appendChild(
          createElement(documentRef, "span", "hy-canvas-agent-model-provider", assistantModelLabel(model))
        );
        option.appendChild(
          createElement(
            documentRef,
            "span",
            "hy-canvas-agent-model-meta",
            capabilityText(model.capabilities) || model.model || model.modelId || "model"
          )
        );
        if (model.configured === false) {
          option.appendChild(
            createElement(
              documentRef,
              "span",
              "hy-canvas-agent-model-disabled-reason",
              model.disabledReason || "缺少 API Key 或 Endpoint"
            )
          );
          option.appendChild(
            bindRequirement(
              createElement(documentRef, "span", "hy-canvas-agent-model-config-link", MODEL_CONFIG_ENTRY_LABEL),
              "model-registry-settings"
            )
          );
        }
        option.addEventListener("click", () => selectModel(model));
        modelMenuEl.appendChild(option);
      });
    });
  }

  function open() {
    if (!root || !panel) {
      return;
    }
    root.classList.remove("is-collapsed");
    root.classList.add("is-open");
    panel.hidden = false;
    syncLauncherOpenState(launcher, true);
    // Slice 7 follow-up: load the 拍法 roster so the start screen can surface 6
    // random 拍法 (re-randomized on each open). Best-effort, fire-and-forget.
    if (typeof state.loadFilmCraftRoster === "function") {
      Promise.resolve(state.loadFilmCraftRoster())
        .then(() => renderStartSkills())
        .catch(() => {});
    }
  }

  function close() {
    if (!root || !panel) {
      return;
    }
    root.classList.remove("is-open");
    root.classList.add("is-collapsed");
    panel.hidden = true;
    syncLauncherOpenState(launcher, false);
  }

  function toggle() {
    if (root?.classList?.contains("is-open")) {
      close();
    } else {
      open();
    }
  }

  function bindLauncher() {
    if (launcherElement) {
      launcher = launcherElement;
      ownsLauncher = false;
      addClass(launcher, "hy-canvas-agent-fab-bound");
    } else {
      launcher = createElement(documentRef, "button", "hy-canvas-agent-launcher");
      ownsLauncher = true;
    }
    launcher.type = "button";
    launcher.setAttribute?.("aria-label", "\u6253\u5f00\u5e7b\u6620AI\u5bfc\u6f14");
    launcher.setAttribute?.("title", "\u5e7b\u6620AI\u5bfc\u6f14");
    if (typeof launcher.replaceChildren === "function") {
      launcher.replaceChildren(createFabFace(documentRef));
    } else {
      launcher.textContent = "RH";
    }
    launcher.addEventListener("click", toggle);
  }

  function addHeader(panelEl) {
    const head = createElement(documentRef, "div", "hy-canvas-agent-head");
    const left = createElement(documentRef, "div", "hy-canvas-agent-head-left");
    left.appendChild(createElement(documentRef, "div", "hy-canvas-agent-head-avatar"));
    const titleWrap = createElement(documentRef, "div", "hy-canvas-agent-title-wrap");
    titleWrap.appendChild(createElement(documentRef, "div", "hy-canvas-agent-title", "\u5e7b\u6620AI\u5bfc\u6f14"));
    const sessionRow = createElement(documentRef, "div", "hy-canvas-agent-session-row");
    sessionEl = createElement(documentRef, "span", "hy-canvas-agent-session", displaySessionLabel());
    sessionRow.appendChild(sessionEl);
    const copy = bindRequirement(createElement(documentRef, "button", "hy-canvas-agent-copy", "\u25a1"), "conversation-copy");
    copy.type = "button";
    copy.setAttribute?.("aria-label", "\u590d\u5236\u4f1a\u8bdd ID");
    copy.addEventListener("click", () => schedule(() => copySessionId()));
    sessionRow.appendChild(copy);
    titleWrap.appendChild(sessionRow);
    left.appendChild(titleWrap);

    const actions = createElement(documentRef, "div", "hy-canvas-agent-head-actions");
    // \u6267\u884c\u5386\u53f2\u5165\u53e3(\u4ece\u8f93\u5165\u6846\u4e0a\u65b9\u8fc1\u5230\u5934\u90e8, \u65b0\u56fe\u6807 \u27f2 + \u6570\u91cf\u5fbd\u6807)\u3002\u70b9\u51fb = \u6253\u5f00/\u6536\u8d77\u5386\u53f2\u5217\u8868\u3002
    const execHistory = createElement(documentRef, "button", "hy-canvas-agent-icon-btn hy-canvas-agent-exec-history-btn", "\u27f2");
    execHistory.type = "button";
    execHistory.dataset.canvasAgentControl = "execution-history";
    execHistory.setAttribute?.("aria-label", "\u6267\u884c\u5386\u53f2");
    execHistoryBadgeEl = createElement(documentRef, "span", "hy-canvas-agent-exec-history-badge");
    setHidden(execHistoryBadgeEl, true);
    execHistory.appendChild(execHistoryBadgeEl);
    execHistory.addEventListener("click", () => schedule(() => toggleExecutionHistory()));
    execHistoryBtnEl = execHistory; // appended after newChat (below) to keep icon-btn[0/1] = \u4f1a\u8bdd\u5386\u53f2/\u65b0\u4f1a\u8bdd
    const history = bindRequirement(createElement(documentRef, "button", "hy-canvas-agent-icon-btn", "\u25f7"), "conversation-history");
    history.type = "button";
    history.dataset.canvasAgentControl = "history";
    history.setAttribute?.("aria-label", "\u4f1a\u8bdd\u5386\u53f2");
    history.addEventListener("click", () => schedule(() => toggleHistory()));
    const newChat = bindRequirement(createElement(documentRef, "button", "hy-canvas-agent-icon-btn", "+"), "conversation-create");
    newChat.type = "button";
    newChat.setAttribute?.("aria-label", "\u65b0\u4f1a\u8bdd");
    newChat.addEventListener("click", () => schedule(() => createNewConversation()));
    const closeButton = createElement(documentRef, "button", "hy-canvas-agent-close", "\u203a");
    closeButton.type = "button";
    closeButton.setAttribute?.("aria-label", "\u6536\u8d77\u5e7b\u6620AI\u5bfc\u6f14");
    closeButton.addEventListener("click", close);
    actions.appendChild(history);
    actions.appendChild(newChat);
    actions.appendChild(execHistory);
    actions.appendChild(closeButton);
    head.appendChild(left);
    head.appendChild(actions);
    panelEl.appendChild(head);
  }

  function addStartScreen(body) {
    const hero = createElement(documentRef, "div", "hy-canvas-agent-hero");
    hero.appendChild(createElement(documentRef, "div", "hy-canvas-agent-hero-orb"));
    const heroText = createElement(documentRef, "div", "hy-canvas-agent-hero-copy");
    heroText.appendChild(createElement(documentRef, "div", "hy-canvas-agent-hello", `Hi ${userName}!`));
    heroText.appendChild(createElement(documentRef, "div", "hy-canvas-agent-question", "\u4eca\u5929\u4e00\u8d77\u521b\u4f5c\u70b9\u4ec0\u4e48\uff1f"));
    hero.appendChild(heroText);
    body.appendChild(hero);
    body.appendChild(createElement(documentRef, "div", "hy-canvas-agent-skill-kicker", "\u9009\u62e9\u6280\u80fd"));

    startSkillListEl = createElement(documentRef, "div", "hy-canvas-agent-skill-list");
    body.appendChild(startSkillListEl);
    renderStartSkills();
  }

  // Slice 7 follow-up: the start screen surfaces 6 RANDOM 拍法 (same card style as
  // the legacy quick-start skills); clicking one sets it as the current 拍法 (the
  // toolbar 拍法库 button + picker then show it, and 导演 commands carry it). Falls
  // back to the legacy skills when the roster isn't loaded (brain unconfigured).
  function renderStartSkills() {
    if (!startSkillListEl) return;
    if (typeof startSkillListEl.replaceChildren === "function") {
      startSkillListEl.replaceChildren();
    }
    const roster = Array.isArray(state.filmCraftRoster) ? state.filmCraftRoster : [];
    if (roster.length) {
      const current = safeTrim(state.currentFilmCraft);
      pickRandomCrafts(roster, 6).forEach((craft) => {
        const button = createElement(documentRef, "button", "hy-canvas-agent-skill hy-canvas-agent-skill-craft");
        button.type = "button";
        button.setAttribute?.("data-skill", craft.name);
        button.setAttribute?.("data-craft", craft.name);
        if (current && current === craft.name) {
          button.setAttribute?.("data-selected", "true");
        }
        button.appendChild(createIcon(documentRef, "film"));
        const copy = createElement(documentRef, "div", "hy-canvas-agent-skill-copy");
        copy.appendChild(createElement(documentRef, "span", "hy-canvas-agent-skill-title", craft.name));
        copy.appendChild(createElement(documentRef, "span", "hy-canvas-agent-skill-detail", craft.summary || "影视拍法"));
        button.appendChild(copy);
        button.addEventListener("click", () => {
          state.setCurrentFilmCraft(craft.name);
          if (inputEl && !isDirectorCommand(inputEl.value)) {
            inputEl.value = "导演:";
          }
          inputEl?.focus?.();
          state.lastReceipt = `已选拍法:${craft.name}(输入「导演:」brief 即用此拍法生成分镜)`;
          render();
        });
        startSkillListEl.appendChild(button);
      });
      return;
    }
    const iconNames = ["bag", "book", "shield", "cube", "shield", "film", "tv", "play", "flame"];
    ASSISTANT_SKILLS.forEach((skill, index) => {
      const button = createElement(documentRef, "button", "hy-canvas-agent-skill");
      button.type = "button";
      button.setAttribute?.("data-skill", skill.title);
      button.appendChild(createIcon(documentRef, iconNames[index]));
      const copy = createElement(documentRef, "div", "hy-canvas-agent-skill-copy");
      copy.appendChild(createElement(documentRef, "span", "hy-canvas-agent-skill-title", skill.title));
      copy.appendChild(createElement(documentRef, "span", "hy-canvas-agent-skill-detail", skill.detail));
      button.appendChild(copy);
      button.addEventListener("click", () => {
        state.setAssistantIntent({ id: skill.id, title: skill.title, source: "rh_skill" });
        if (inputEl) {
          inputEl.value = skill.prompt;
          inputEl.focus?.();
        }
      });
      startSkillListEl.appendChild(button);
    });
  }

  function addCompose(panelEl) {
    const compose = createElement(documentRef, "div", "hy-canvas-agent-compose");
    executionDrawerEl = createElement(documentRef, "div", "hy-canvas-agent-execution-drawer");
    setHidden(executionDrawerEl, true);
    const main = createElement(documentRef, "div", "hy-canvas-agent-compose-main");
    const upload = bindRequirement(createElement(documentRef, "button", "hy-canvas-agent-upload", "+"), "assistant-attachments");
    upload.type = "button";
    upload.setAttribute?.("aria-label", "\u4e0a\u4f20\u53c2\u8003\u56fe");
    upload.addEventListener("click", () => fileInputEl?.click?.());
    inputEl = createElement(documentRef, "textarea", "hy-canvas-agent-input");
    inputEl.placeholder = "\u5148\u4e0a\u4f20\u53c2\u8003\u56fe\uff0c\u518d\u7528 @ \u5f15\u7528\uff0c\u8f93\u5165\u4f60\u7684\u60f3\u6cd5\u3002";
    main.appendChild(upload);
    main.appendChild(inputEl);
    fileInputEl = createElement(documentRef, "input", "hy-canvas-agent-file-input");
    fileInputEl.type = "file";
    fileInputEl.multiple = true;
    fileInputEl.accept = "image/*,video/*,.txt,.md,.pdf,.doc,.docx";
    fileInputEl.hidden = true;
    fileInputEl.addEventListener("change", () => {
      const files = Array.from(fileInputEl.files || []);
      fileInputEl.value = "";
      schedule(() => attachLocalFiles(files));
    });
    attachmentListEl = createElement(documentRef, "div", "hy-canvas-agent-attachments");
    setHidden(attachmentListEl, true);

    const toolbar = createElement(documentRef, "div", "hy-canvas-agent-compose-toolbar");
    modelButton = createElement(documentRef, "button", "hy-canvas-agent-mode-pill", "\u2723 Agent");
    modelButton.type = "button";
    modelButton.dataset.canvasAgentControl = "model";
    modelButton.addEventListener("click", () => toggleModelMenu());
    toolbar.appendChild(modelButton);
    mentionButton = bindRequirement(
      createElement(documentRef, "button", "hy-canvas-agent-tool-btn hy-canvas-agent-mention", "@"),
      "mention-resolver"
    );
    mentionButton.type = "button";
    mentionButton.addEventListener("click", () => {
      if (floatingLayers.isOpen("mention")) {
        closeMentionMenu();
        render();
        return;
      }
      const value = String(inputEl?.value || "");
      const cursor = Number.isInteger(inputEl?.selectionStart) ? inputEl.selectionStart : value.length;
      insertTextAtInput("@");
      openMentionMenu("", cursor);
      inputEl?.focus?.();
      render();
    });
    toolbar.appendChild(mentionButton);
    const docs = bindRequirement(createElement(documentRef, "button", "hy-canvas-agent-tool-btn", "\u25a4"), "assistant-documents");
    docs.type = "button";
    toolbar.appendChild(docs);
    toolbar.appendChild(createElement(documentRef, "span", "hy-canvas-agent-toolbar-spacer"));
    modeButton = createElement(documentRef, "button", "hy-canvas-agent-tool-btn hy-canvas-agent-ask", "Plan");
    modeButton.type = "button";
    modeButton.dataset.canvasAgentControl = "mode";
    modeButton.addEventListener("click", () => {
      state.setAgentMode(state.agentMode === "act" ? "plan" : "act");
      render();
    });
    toolbar.appendChild(modeButton);
    // \u62cd\u6cd5\u5e93 (slice 7): replaces \u7206\u6b3e\u5b9e\u9a8c\u5ba4. Opens a picker of film-craft skills;
    // selecting one injects \u300a\u62cd\u6cd5:\u540d\u300b into the \u5bfc\u6f14 flow (\u7acb\u5373\u5f00\u62cd / \u8bbe\u4e3a\u5f53\u524d\u62cd\u6cd5).
    // \u62cd\u6cd5\u5e93 entry \u2014 not gated on the retired viral-lab-workflow capability; it
    // always opens (an empty roster shows a seed hint rather than being disabled).
    const lab = createElement(documentRef, "button", "hy-canvas-agent-tool-btn hy-canvas-agent-lab", "\u2630 \u62cd\u6cd5\u5e93");
    lab.type = "button";
    lab.setAttribute?.("aria-label", "\u62cd\u6cd5\u5e93");
    lab.addEventListener("click", () => { schedule(() => toggleCraftPicker()); });
    labButtonEl = lab; // render() updates its label to show the current 拍法
    toolbar.appendChild(lab);
    craftPickerEl = createElement(documentRef, "div", "hy-canvas-agent-craft-picker");
    setHidden(craftPickerEl, true);
    const actions = createElement(documentRef, "span", "hy-canvas-agent-actions");
    sendButton = createElement(documentRef, "button", "hy-canvas-agent-send", "\u25b2");
    sendButton.type = "button";
    sendButton.dataset.canvasAgentControl = "send";
    sendButton.setAttribute?.("aria-label", "\u53d1\u9001");
    applyButton = createElement(documentRef, "button", "hy-canvas-agent-apply", "\u5e94\u7528");
    applyButton.type = "button";
    setHidden(applyButton, true);
    actions.appendChild(sendButton);
    actions.appendChild(applyButton);
    toolbar.appendChild(actions);

    compose.appendChild(attachmentListEl);
    compose.appendChild(executionDrawerEl);
    compose.appendChild(main);
    compose.appendChild(craftPickerEl);
    compose.appendChild(fileInputEl);
    compose.appendChild(toolbar);
    panelEl.appendChild(compose);
  }

  function buildDom() {
    if (!documentRef?.body || typeof documentRef.createElement !== "function") {
      return;
    }
    injectAssistantPanelStyle(documentRef);
    root = createElement(documentRef, "section", "hy-canvas-agent-assistant is-collapsed");
    root.setAttribute?.("aria-label", "\u5e7b\u6620AI\u5bfc\u6f14\u52a9\u624b");
    bindLauncher();
    panel = createElement(documentRef, "div", "hy-canvas-agent-panel");
    panel.dataset.canvasAgentPanel = "true";
    panel.hidden = true;

    addHeader(panel);
    historyEl = createElement(documentRef, "div", "hy-canvas-agent-history");
    setHidden(historyEl, true);
    panel.appendChild(historyEl);
    const body = createElement(documentRef, "div", "hy-canvas-agent-body");
    addStartScreen(body);
    messagesEl = createElement(documentRef, "div", "hy-canvas-agent-messages");
    messagesEl.addEventListener("click", () => {
      if (executionDrawerExpanded) {
        executionDrawerExpanded = false;
        render();
      }
    });
    body.appendChild(messagesEl);
    executionBackdropEl = createElement(documentRef, "div", "hy-canvas-agent-execution-backdrop");
    executionBackdropEl.setAttribute?.("aria-hidden", "true");
    executionBackdropEl.addEventListener("click", () => {
      if (executionDrawerExpanded) {
        executionDrawerExpanded = false;
        render();
      }
    });
    setHidden(executionBackdropEl, true);
    body.appendChild(executionBackdropEl);
    panel.appendChild(body);

    previewEl = createElement(documentRef, "div", "hy-canvas-agent-preview");
    strongConfirmButton = createElement(
      documentRef,
      "button",
      "hy-canvas-agent-strong-confirm",
      "Type APPLY to authorize video / high-risk actions"
    );
    strongConfirmButton.type = "button";
    receiptEl = createElement(documentRef, "div", "hy-canvas-agent-receipt");
    modelMenuEl = createElement(documentRef, "div", "hy-canvas-agent-model-menu");
    mentionMenuEl = createElement(documentRef, "div", "hy-canvas-agent-mention-menu");
    attachmentPreviewEl = createElement(documentRef, "div", "hy-canvas-agent-attachment-preview");
    setHidden(previewEl, true);
    setHidden(strongConfirmButton, true);
    setHidden(receiptEl, true);
    setHidden(modelMenuEl, true);
    setHidden(mentionMenuEl, true);
    setHidden(attachmentPreviewEl, true);
    panel.appendChild(previewEl);
    panel.appendChild(strongConfirmButton);
    panel.appendChild(receiptEl);
    panel.appendChild(modelMenuEl);
    panel.appendChild(mentionMenuEl);
    panel.appendChild(attachmentPreviewEl);
    addCompose(panel);
    floatingLayers.registerLayer("model", { sourceEl: modelButton, layerEl: modelMenuEl });
    floatingLayers.registerLayer("mention", { sourceEl: mentionButton, layerEl: mentionMenuEl });
    root.appendChild(panel);
    if (ownsLauncher) {
      root.appendChild(launcher);
    }

    sendButton.addEventListener("click", () => {
      // Single-flight rule #2: while a 成片 render is in flight the button is ⏹;
      // a click cancels the render instead of sending. cancelActiveRender()
      // returns false when there's nothing to cancel, so we fall through to send.
      if (state.cancelActiveRender?.()) {
        render();
        return;
      }
      runSend();
    });
    applyButton.addEventListener("click", () => schedule(() => handleApply()));
    strongConfirmButton.addEventListener("click", () => schedule(() => {
      state.approveStrongConfirmation();
      render();
    }));
    inputEl.addEventListener("input", () => {
      updateMentionFromInput();
      render();
    });
    inputEl.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    inputEl.addEventListener("compositionend", () => {
      isComposing = false;
    });
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !isComposing && !event.isComposing) {
        event.preventDefault?.();
        runSend();
      }
    });
    render();
  }

  const controller = {
    get root() {
      return root;
    },
    state,
    init() {
      if (initialized) {
        return controller;
      }
      initialized = true;
      buildDom();
      if (root && !root.parentElement) {
        documentRef.body.appendChild(root);
      }
      if (state.canvasSkillsRuntime?.chatOnly && state.canvasSkillsRuntime?.notice) {
        showTransientNotice(state.canvasSkillsRuntime.notice);
      }
      if (typeof state.loadExecutionHistory === "function") {
        currentTask = Promise.resolve(state.loadExecutionHistory({ onUpdate: render })).then(() => {
          render();
        });
      }
      return controller;
    },
    open,
    close,
    toggle,
    send(text) {
      return runSend(text);
    },
    apply() {
      return schedule(() => handleApply());
    },
    attachFiles(files) {
      return schedule(() => attachLocalFiles(files));
    },
    updateModelRegistry(registry = {}) {
      state.setModelRegistry(registry);
      render();
      return state.debugSnapshot();
    },
    render,
    async flush() {
      return currentTask;
    },
    destroy() {
      floatingLayers.destroy();
      state.dispose?.();
      root?.remove?.();
      removeClass(launcher, "is-assistant-open");
      root = null;
      initialized = false;
    },
  };

  return controller;
}

export function isLowRiskAssistantAction(action = {}) {
  if (!action || typeof action !== "object") {
    return false;
  }
  if (
    action.type === "queue_generation_task" ||
    action.type === "run_prompt_preset_generation"
  ) {
    return action.nodeType !== "ai-video";
  }
  return [
    "create_node",
    "connect_nodes",
    "layout_nodes",
    "focus_nodes",
    "rename_node",
    "update_node_data",
  ].includes(action.type);
}

export function installAppAssistantPanel(options = {}) {
  const controller = createAppAssistantPanel(options);
  return controller.init();
}
