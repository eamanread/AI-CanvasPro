import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createCanvasAgentApi } from "../api/canvasAgentApi.js";
import { buildAssistantCanvasContext } from "../modules/assistant/assistantContextBuilder.js";
import { buildAssistantModelRegistry, filterConfiguredTextModelOptions } from "../modules/assistant/assistantModelRegistry.js";
import { buildAssistantRequest, normalizeAssistantResponse } from "../modules/assistant/assistantProtocol.js";
import { consumeAssistantStream } from "../modules/assistant/assistantStreamingClient.js";
import { getModelsByNodeType } from "../modules/modelRegistryService.js";
import {
  createCanvasSkillsSmokeRuntime,
  normalizeBrowserSmokeResult,
} from "../modules/assistant/canvasSkills/smoke/realApiSmokeRunner.js";
import { writeSmokeJsonArtifact } from "../modules/assistant/canvasSkills/smoke/realApiSmokeArtifacts.js";

export const FAILURE_CATEGORIES = Object.freeze({
  CONFIG_MISSING_TEXT_MODEL: "CONFIG_MISSING_TEXT_MODEL",
  CONFIG_MISSING_IMAGE_MODEL: "CONFIG_MISSING_IMAGE_MODEL",
  AUTH_FAILED: "AUTH_FAILED",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  PROVIDER_REJECTED: "PROVIDER_REJECTED",
  NODE_CREATE_FAILED: "NODE_CREATE_FAILED",
  GENERATION_SUBMIT_FAILED: "GENERATION_SUBMIT_FAILED",
  TIMEOUT: "TIMEOUT",
  SECRET_SCAN_FAILED: "SECRET_SCAN_FAILED",
  UNKNOWN: "UNKNOWN",
});

const ACCEPTED_NODE_STATES = new Set(["submitted", "queued", "running", "generating"]);
const TASK_ID_KEYS = ["taskId", "jobId", "requestId", "rhTaskId", "dreaminaSubmitId", "asyncTaskId"];
const DEFAULT_BASE_URL = "http://127.0.0.1:8777";
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_OUT_DIR = "output/regression/real-api-smoke/early-baseline";

const SECRET_KEY_RE = /^(apiKey|api_key|authorization|headers|token|proxyToken|accessToken|refreshToken|secret|password|credential|cookie)$/i;
const SECRET_QUERY_KEY_RE = /^(token|api[_-]?key|key|secret|signature|X-Amz-Signature|access_token|authorization|password|credential)$/i;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const OPENAI_SECRET_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const LONG_BASE64_RE = /\b[A-Za-z0-9+/]{400,}={0,2}\b/g;
const DATA_URL_RE = /data:[^"'\s<>]+/gi;

function text(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function statusText(value) {
  return text(value).toLowerCase();
}

function modelConfigured(model = {}) {
  if (model.configured === true || model.usableByImageNode === true) {
    return true;
  }
  const status = statusText(model.status);
  if (status === "deleted" || status === "failed" || status === "unconfigured") {
    return false;
  }
  const hasModel = Boolean(text(model.modelId || model.model || model.id));
  const hasEndpoint = Boolean(text(model.baseUrl || model.apiUrl || model.endpoint));
  const hasSecret = Boolean(text(model.apiKey || model.token || model.proxyToken)) ||
    model.apiKeyConfigured === true ||
    model.tokenConfigured === true ||
    model.proxyTokenConfigured === true;
  return hasModel && hasEndpoint && hasSecret;
}

function isTextNodeModel(model = {}) {
  const nodeType = statusText(model.nodeType || model.type);
  const status = statusText(model.status);
  return Boolean(
    model &&
      typeof model === "object" &&
      (nodeType === "text" || nodeType === "ai-text" || model.provider === "model_registry") &&
      modelConfigured(model) &&
      model.supportsText !== false &&
      model.supportsImageGeneration !== true &&
      model.supportsVideoGeneration !== true &&
      model.supportsTools !== true &&
      status !== "failed" &&
      status !== "deleted"
  );
}

function isImageNodeModel(model = {}) {
  const nodeType = statusText(model.nodeType || model.type);
  const status = statusText(model.status);
  return Boolean(
    model &&
      typeof model === "object" &&
      (nodeType === "image" || nodeType === "ai-image" || model.supportsImageGeneration === true || model.usableByImageNode === true) &&
      modelConfigured(model) &&
      status !== "deleted" &&
      status !== "failed"
  );
}

export function selectSmokeTextModel({ registryModels = null, config = null } = {}) {
  const configured = Array.isArray(registryModels)
    ? registryModels.filter(isTextNodeModel)
    : filterConfiguredTextModelOptions(buildAssistantModelRegistry(config || {}).options);
  return configured[0] || null;
}

export function selectSmokeImageModel({ imageModels = null, registry = null } = {}) {
  const models = Array.isArray(imageModels) ? imageModels : getModelsByNodeType("image", registry);
  return models.filter(isImageNodeModel)[0] || null;
}

export function isAcceptedSmokeSubmission(submission = {}) {
  const payload = isPlainObject(submission) ? submission : {};
  if (TASK_ID_KEYS.some((key) => Boolean(text(payload[key])))) {
    return true;
  }
  if (ACCEPTED_NODE_STATES.has(statusText(payload.nodeState || payload.state || payload.status || payload.generationStatus))) {
    return true;
  }
  if (
    safeArray(payload.queuedGenerationNodeIds).length > 0 ||
    safeArray(payload.startedGenerationNodeIds).length > 0 ||
    payload.queued === true ||
    payload.submitted === true
  ) {
    return true;
  }
  const receipts = safeArray(payload.canvasSkillReceipts || payload.receipts);
  return receipts.some((receipt) => {
    if (!receipt || typeof receipt !== "object") {
      return false;
    }
    if (TASK_ID_KEYS.some((key) => Boolean(text(receipt[key])))) {
      return true;
    }
    if (ACCEPTED_NODE_STATES.has(statusText(receipt.nodeState || receipt.state || receipt.status || receipt.generationStatus))) {
      return true;
    }
    return safeArray(receipt.queuedGenerationNodeIds).length > 0 ||
      safeArray(receipt.startedGenerationNodeIds).length > 0 ||
      receipt.queued === true ||
      receipt.submitted === true;
  });
}

function redactString(value) {
  let next = String(value ?? "");
  next = next.replace(BEARER_RE, "[REDACTED_BEARER]");
  next = next.replace(OPENAI_SECRET_RE, "sk-[REDACTED]");
  next = next.replace(DATA_URL_RE, "[REDACTED_DATA_URL]");
  next = next.replace(LONG_BASE64_RE, "[REDACTED_BASE64]");
  next = next.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (SECRET_QUERY_KEY_RE.test(key)) {
          parsed.searchParams.delete(key);
        }
      }
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "[REDACTED_URL]";
    }
  });
  return next;
}

export function redactSmokeArtifact(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = value.map((item) => redactSmokeArtifact(item, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSmokeArtifact(child, seen);
      }
    }
    seen.delete(value);
    return result;
  }
  return value;
}

export function scanSmokeArtifactForSecrets(value) {
  const body = JSON.stringify(value || {});
  const findings = [];
  const patterns = [
    ["authorization", /\bAuthorization\b/i],
    ["bearer", /\bBearer\s+[A-Za-z0-9._~+/=-]+/i],
    ["openai-secret", OPENAI_SECRET_RE],
    ["secret-query", /[?&](token|api[_-]?key|secret|signature|X-Amz-Signature|access_token)=((?!%5BREDACTED%5D|\[REDACTED\])[^&#]+)/i],
    ["long-base64", LONG_BASE64_RE],
    ["raw-data-url", DATA_URL_RE],
  ];
  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(body)) {
      findings.push(name);
    }
  }
  return {
    status: findings.length ? "failed" : "passed",
    totalFindings: findings.length,
    findings,
  };
}

function normalizeBaseUrl(url) {
  return text(url || DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

function fetchWithBaseUrl(baseUrl, fetchImpl = globalThis.fetch) {
  const root = normalizeBaseUrl(baseUrl);
  return (url, options) => {
    const target = /^https?:\/\//i.test(String(url)) ? String(url) : `${root}${String(url).startsWith("/") ? "" : "/"}${url}`;
    return fetchImpl(target, options);
  };
}

async function fetchConfig({ baseUrl, fetchImpl, adapters }) {
  if (typeof adapters?.loadConfig === "function") {
    return await adapters.loadConfig();
  }
  if (adapters?.config) {
    return cloneJson(adapters.config);
  }
  const response = await fetchWithBaseUrl(baseUrl, fetchImpl)("/api/config", { method: "GET" });
  const payload = await response.json();
  if (response.ok === false || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || `Failed to load /api/config (${response.status || "unknown"})`);
  }
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

function modelSummary(model) {
  return {
    provider: text(model?.provider || "model_registry"),
    id: text(model?.id || model?.modelId || model?.model),
    displayName: text(model?.displayName || model?.modelName || model?.name || model?.model || model?.id),
    configured: modelConfigured(model),
  };
}

function graphStoreFixture() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) {
      nodes.push(node);
      return node;
    },
    addEdge(edge) {
      edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => text(item?.id) === text(nodeId));
      if (node) {
        node.data = { ...(node.data || {}), ...(patch || {}) };
      }
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes, edges, selectedNodeIds: this.selectedNodeIds || [] };
    },
  };
}

export function createModuleSmokeCanvasRuntime({ graphStore = graphStoreFixture() } = {}) {
  let nextId = 0;
  return {
    graphStore,
    async onCreateImageDraft(action = {}) {
      const nodeId = text(action.nodeId || action.id).startsWith("ai-image-")
        ? text(action.nodeId || action.id)
        : `ai-image-smoke-${++nextId}`;
      const node = {
        id: nodeId,
        type: "ai-image",
        name: text(action.name || action.title || "Smoke Image"),
        data: {
          prompt: text(action.prompt || action.data?.prompt),
          modelId: text(action.modelId || action.data?.modelId),
          provider: text(action.provider || action.data?.provider),
          batchSize: Number(action.batchSize || action.data?.batchSize || 1) || 1,
        },
      };
      graphStore.addNode?.(node);
      graphStore.setSelectedNodes?.([nodeId]);
      return { ok: true, nodeId, node };
    },
    async onSubmitGeneration(action = {}) {
      const nodeId = text(action.nodeId);
      const node = safeArray(graphStore.getState?.().nodes).find((item) => text(item?.id) === nodeId);
      if (!node) {
        return { accepted: false, nodeState: "missing", warning: `node not found: ${nodeId || "unknown"}` };
      }
      const taskId = `module-smoke-${Date.now()}`;
      const patch = {
        generationStatus: "submitted",
        taskStatus: "submitted",
        taskId,
        lastPrompt: text(action.prompt),
      };
      graphStore.updateNodeData?.(nodeId, patch);
      node.data = { ...(node.data || {}), ...patch };
      return {
        accepted: true,
        taskId,
        nodeState: "submitted",
        createdNodeId: nodeId,
        canvasSkillReceipts: [{ submitted: true, nodeId, taskId }],
      };
    },
  };
}

function defaultImageCreateAction(prompt, imageModel) {
  return {
    id: "smoke-image",
    type: "create_node",
    nodeType: "ai-image",
    prompt,
    modelId: text(imageModel?.id || imageModel?.modelId || imageModel?.model),
    provider: text(imageModel?.provider || "model_registry"),
    batchSize: 1,
  };
}

function firstImageCreateAction(actions) {
  return safeArray(actions).find((action) => {
    const type = text(action?.type || action?.action || action?.kind);
    const nodeType = text(action?.nodeType || action?.data?.nodeType || action?.data?.type);
    return type === "create_node" && nodeType === "ai-image";
  }) || null;
}

async function runTextModelChat({ api, request, adapters, events }) {
  if (typeof adapters?.onChatStream === "function") {
    const stream = await adapters.onChatStream(request);
    const response = await consumeAssistantStream(stream, { onEvent: (event) => events.push(event) });
    return { response, fallback: false };
  }
  if (typeof adapters?.onChat === "function") {
    const response = normalizeAssistantResponse(await adapters.onChat(request));
    return { response, fallback: true };
  }
  if (typeof api?.chatStream === "function") {
    const response = normalizeAssistantResponse(await api.chatStream(request, { onEvent: (event) => events.push(event) }));
    return { response, fallback: false };
  }
  if (typeof api?.chat === "function") {
    const response = normalizeAssistantResponse(await api.chat(request));
    return { response, fallback: true };
  }
  throw new Error("No Agent chat API is available.");
}

async function createImageDraft({ adapters, action, executionOrder }) {
  executionOrder.push("imageNode.createDraft");
  if (typeof adapters?.onCreateImageDraft === "function") {
    const created = await adapters.onCreateImageDraft(action);
    return {
      ok: created?.ok !== false && Boolean(text(created?.nodeId || created?.id)),
      nodeId: text(created?.nodeId || created?.id),
      raw: created,
    };
  }
  if (adapters?.canvasSkillsRuntime?.executeActions) {
    const result = await adapters.canvasSkillsRuntime.executeActions({ actions: [action], agentMode: "act" });
    const nodeId = text(result?.createdNodeIds?.[0] || result?.actionNodeIdMap?.[action.id]);
    return { ok: Boolean(nodeId), nodeId, raw: result };
  }
  return { ok: false, nodeId: "", raw: { warning: "No image draft adapter is available." } };
}

async function submitImageGeneration({ adapters, action, nodeId, executionOrder }) {
  executionOrder.push("imageNode.generate");
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const generationAction = {
    type: "queue_generation_task",
    nodeId,
    nodeType: text(action.nodeType || data.nodeType || "ai-image"),
    prompt: text(action.prompt || data.prompt),
  };
  const modelId = text(action.modelId || data.modelId);
  const provider = text(action.provider || data.provider);
  if (modelId) generationAction.modelId = modelId;
  if (provider) generationAction.provider = provider;
  if (typeof adapters?.onSubmitGeneration === "function") {
    return await adapters.onSubmitGeneration(generationAction);
  }
  if (adapters?.canvasSkillsRuntime?.executeActions) {
    return await adapters.canvasSkillsRuntime.executeActions({ actions: [generationAction], agentMode: "act" });
  }
  return { accepted: false, warning: "No generation submission adapter is available." };
}

function classifyError(error) {
  const message = text(error?.friendlyMessage || error?.message || error).toLowerCase();
  const status = Number(error?.status || 0);
  if (error?.name === "AbortError" || /timeout|timed out|etimedout|aborted/.test(message)) {
    return FAILURE_CATEGORIES.TIMEOUT;
  }
  if (status === 401 || status === 403 || /auth|unauthorized|forbidden|api key|apikey|permission/.test(message)) {
    return FAILURE_CATEGORIES.AUTH_FAILED;
  }
  if (status === 402 || status === 429 || /quota|limit|rate/.test(message)) {
    return FAILURE_CATEGORIES.QUOTA_EXHAUSTED;
  }
  if (status >= 400 || /provider|reject|invalid request/.test(message)) {
    return FAILURE_CATEGORIES.PROVIDER_REJECTED;
  }
  return FAILURE_CATEGORIES.UNKNOWN;
}

function failedArtifact({ mode, category, warning, timeoutMs, textModel = null, imageModel = null, executionOrder = [], startedAt }) {
  return {
    schemaVersion: "canvas-agent-real-api-smoke-v1",
    mode,
    status: "failed",
    failureCategory: category,
    timeoutMs,
    textModel: textModel ? modelSummary(textModel) : { configured: false },
    imageModel: imageModel ? modelSummary(imageModel) : { configured: false },
    createdNodeId: "",
    submission: { accepted: false },
    executionOrder,
    warnings: [warning].filter(Boolean),
    secretScan: { status: "not_run", totalFindings: 0 },
    startedAt,
    endedAt: new Date().toISOString(),
  };
}

function finalizeSmokeResult(artifact, { writeArtifact = false, outputDir = DEFAULT_OUT_DIR } = {}) {
  const redacted = redactSmokeArtifact(artifact);
  const secretScan = scanSmokeArtifactForSecrets(redacted);
  redacted.secretScan = secretScan;
  if (secretScan.status !== "passed") {
    redacted.status = "failed";
    redacted.failureCategory = FAILURE_CATEGORIES.SECRET_SCAN_FAILED;
  }
  if (writeArtifact) {
    redacted.artifactPath = writeJsonArtifact({ artifact: redacted, outputDir });
  }
  return redacted;
}

function writeJsonArtifact({ artifact, outputDir = DEFAULT_OUT_DIR }) {
  return writeSmokeJsonArtifact({ artifact, outputDir });
}

function resolveImageModels(adapters, config) {
  if (Object.prototype.hasOwnProperty.call(adapters || {}, "imageModels")) {
    return adapters.imageModels;
  }
  if (config?.modelRegistry) {
    return getModelsByNodeType("image", config.modelRegistry);
  }
  return [];
}

async function readJsonFileIfExists(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseLastJsonObject(output = "") {
  const source = String(output || "");
  const objectStarts = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "{") {
      objectStarts.push(index);
    }
  }
  for (const start of objectStarts.reverse()) {
    const candidate = source.slice(start).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep walking backward; preceding log lines may contain braces.
    }
  }
  return {};
}

function snapshotListFromArtifacts(state = {}, graphAfter = {}) {
  const snapshots = [];
  if (state.duringStream) {
    snapshots.push(state.duringStream);
  }
  const final = state.final || state.afterApply || state.afterPreview || {};
  snapshots.push({
    ...final,
    graph: final.graph || graphAfter,
  });
  return snapshots;
}

export function createAssistantPanelBrowserSmokeHarness({
  node = "D:\\Aic\\node.exe",
  script = path.join("tools", "assistant_panel_live_screenshot_check.mjs"),
  chrome = "",
  runCommand = spawnSync,
} = {}) {
  return {
    async run({
      baseUrl = DEFAULT_BASE_URL,
      outputDir = "output/regression/real-api-smoke",
      timeoutMs = DEFAULT_TIMEOUT_MS,
      prompt = "Create one simple smoke-test image. Return an image node generation action.",
    } = {}) {
      const args = [
        script,
        "--url", baseUrl,
        "--out", outputDir,
        "--prompt", prompt,
        "--r5-journey",
        "--real-api-smoke",
        "--allow-real-api-smoke",
      ];
      if (chrome) {
        args.push("--browser-executable", chrome);
      }
      const completed = runCommand(node, args, {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: timeoutMs,
      });
      if (completed?.error) {
        throw completed.error;
      }
      const stdout = String(completed?.stdout || "").trim();
      const stderr = String(completed?.stderr || "").trim();
      const payload = parseLastJsonObject(stdout);
      const artifactDir = payload.artifactDir || "";
      const assistantState = artifactDir ? await readJsonFileIfExists(path.join(artifactDir, "assistant-state.json")) : null;
      const graphAfter = artifactDir ? await readJsonFileIfExists(path.join(artifactDir, "graph-after.json")) : null;
      const assistantSnapshots = snapshotListFromArtifacts(assistantState || {}, graphAfter || {});
      const normalized = normalizeBrowserSmokeResult({
        status: Number(completed?.status || 0) === 0 ? "passed" : "failed",
        mode: "Browser",
        artifactDir,
        scorecardPath: payload.scorecardPath || "",
        assistantSnapshots,
      });
      return {
        ...normalized,
        mode: "Browser",
        artifactDir,
        scorecardPath: payload.scorecardPath || "",
        assistantSnapshots,
        warnings: stderr ? [stderr] : [],
      };
    },
  };
}

function maybeCanvasSkillsRuntime({ adapters, textModel, imageModel }) {
  if (adapters?.canvasSkillsRuntime?.executeActions) {
    return adapters.canvasSkillsRuntime;
  }
  if (typeof adapters?.createCanvasSkillsRuntime === "function") {
    return adapters.createCanvasSkillsRuntime({ textModel, imageModel, graphStore: adapters.graphStore });
  }
  const runtime = createCanvasSkillsSmokeRuntime({ textModel, imageModel, graphStore: adapters.graphStore });
  if (runtime.graphStore && !adapters.graphStore) {
    adapters.graphStore = runtime.graphStore;
  }
  return runtime;
}

export async function runRealApiSmoke({
  mode = "Module",
  prompt = "Create one simple smoke-test image. Return an image node generation action.",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUT_DIR,
  writeArtifact = true,
  fetchImpl = globalThis.fetch,
  adapters = {},
} = {}) {
  const normalizedMode = text(mode || "Module");
  const startedAt = new Date().toISOString();
  if (normalizedMode !== "Module") {
    const artifact = failedArtifact({
      mode: normalizedMode,
      category: FAILURE_CATEGORIES.UNKNOWN,
      warning: "Only Module mode is implemented in Phase 1. Browser and All modes are Phase 8.",
      timeoutMs,
      startedAt,
    });
    return finalizeSmokeResult(artifact, { writeArtifact, outputDir });
  }

  const executionOrder = [];
  let config = null;
  let textModel = null;
  let imageModel = null;

  try {
    const effectiveAdapters = {
      ...createModuleSmokeCanvasRuntime({ graphStore: adapters.graphStore }),
      ...adapters,
    };
    config = await fetchConfig({ baseUrl, fetchImpl, adapters });
    const assistantRegistry = buildAssistantModelRegistry(config || {});
    textModel = selectSmokeTextModel({
      registryModels: Object.prototype.hasOwnProperty.call(adapters || {}, "textModels")
        ? adapters.textModels
        : assistantRegistry.options,
      config,
    });
    if (!textModel) {
      return finalizeSmokeResult(failedArtifact({
        mode: normalizedMode,
        category: FAILURE_CATEGORIES.CONFIG_MISSING_TEXT_MODEL,
        warning: "No configured text-node model is available.",
        timeoutMs,
        startedAt,
      }), { writeArtifact, outputDir });
    }
    imageModel = selectSmokeImageModel({
      imageModels: resolveImageModels(adapters, config),
      registry: config?.modelRegistry,
    });
    if (!imageModel) {
      return finalizeSmokeResult(failedArtifact({
        mode: normalizedMode,
        category: FAILURE_CATEGORIES.CONFIG_MISSING_IMAGE_MODEL,
        warning: "No configured image-node model is available.",
        timeoutMs,
        textModel,
        startedAt,
      }), { writeArtifact, outputDir });
    }
    if (effectiveAdapters.forceCanvasSkillsRuntime && !effectiveAdapters.canvasSkillsRuntime) {
      effectiveAdapters.canvasSkillsRuntime = maybeCanvasSkillsRuntime({ adapters: effectiveAdapters, textModel, imageModel });
    }

    const graphStore = effectiveAdapters.graphStore || graphStoreFixture();
    const context = adapters.context || buildAssistantCanvasContext({ graphStore });
    const request = buildAssistantRequest({
      message: prompt,
      context,
      mode: "actions",
      model: textModel,
    });
    const api = adapters.api || createCanvasAgentApi({ fetchImpl: fetchWithBaseUrl(baseUrl, fetchImpl) });
    const events = [];
    executionOrder.push("textModel.chat");
    const chat = await runTextModelChat({ api, request, adapters: effectiveAdapters, events });
    const textConnected = Boolean(
      chat.response?.reply ||
        safeArray(chat.response?.actions).length ||
        events.some((event) => event?.type === "message.delta" || event?.type === "message.done")
    );
    if (!textConnected) {
      return finalizeSmokeResult(failedArtifact({
        mode: normalizedMode,
        category: FAILURE_CATEGORIES.PROVIDER_REJECTED,
        warning: "Text model returned no reply, stream delta, done event, or action.",
        timeoutMs,
        textModel,
        imageModel,
        executionOrder,
        startedAt,
      }), { writeArtifact, outputDir });
    }

    const imageAction = firstImageCreateAction(chat.response?.actions) || {
      ...defaultImageCreateAction(prompt, imageModel),
      fallbackImageAction: true,
    };
    const created = await createImageDraft({ adapters: effectiveAdapters, action: imageAction, executionOrder });
    if (!created.ok) {
      return finalizeSmokeResult(failedArtifact({
        mode: normalizedMode,
        category: FAILURE_CATEGORIES.NODE_CREATE_FAILED,
        warning: created.raw?.warning || "Image node draft was not created.",
        timeoutMs,
        textModel,
        imageModel,
        executionOrder,
        startedAt,
      }), { writeArtifact, outputDir });
    }
    const submissionRaw = await submitImageGeneration({
      adapters: effectiveAdapters,
      action: imageAction,
      nodeId: created.nodeId,
      executionOrder,
    });
    const submission = {
      ...((submissionRaw && typeof submissionRaw === "object") ? submissionRaw : {}),
      accepted: isAcceptedSmokeSubmission(submissionRaw),
    };
    if (!submission.accepted) {
      return finalizeSmokeResult(failedArtifact({
        mode: normalizedMode,
        category: FAILURE_CATEGORIES.GENERATION_SUBMIT_FAILED,
        warning: submission.warning || "Image generation submission was not accepted.",
        timeoutMs,
        textModel,
        imageModel,
        executionOrder,
        startedAt,
      }), { writeArtifact, outputDir });
    }

    const artifact = {
      schemaVersion: "canvas-agent-real-api-smoke-v1",
      mode: normalizedMode,
      status: "passed",
      failureCategory: "",
      timeoutMs,
      textModel: { ...modelSummary(textModel), connected: true, fallback: chat.fallback },
      imageModel: modelSummary(imageModel),
      createdNodeId: created.nodeId,
      submission,
      executionOrder,
      warnings: imageAction.fallbackImageAction ? ["fallbackImageAction: model returned no image create action"] : [],
      secretScan: { status: "not_run", totalFindings: 0 },
      startedAt,
      endedAt: new Date().toISOString(),
    };
    return finalizeSmokeResult(artifact, { writeArtifact, outputDir });
  } catch (error) {
    return finalizeSmokeResult(failedArtifact({
      mode: normalizedMode,
      category: classifyError(error),
      warning: error?.friendlyMessage || error?.message || String(error),
      timeoutMs,
      textModel,
      imageModel,
      executionOrder,
      startedAt,
    }), { writeArtifact, outputDir });
  }
}

export async function runCanvasSkillsRealApiSmoke({
  mode = "Module",
  prompt = "Create one simple smoke-test image. Return an image node generation action.",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl = DEFAULT_BASE_URL,
  outputDir = "output/regression/real-api-smoke",
  writeArtifact = true,
  fetchImpl = globalThis.fetch,
  adapters = {},
  browserHarness = null,
} = {}) {
  const normalizedMode = text(mode || "Module");
  if (normalizedMode === "Browser") {
    if (!browserHarness || typeof browserHarness.run !== "function") {
      const artifact = failedArtifact({
        mode: "Browser",
        category: FAILURE_CATEGORIES.UNKNOWN,
        warning: "Browser smoke requires a browser harness.",
        timeoutMs,
        startedAt: new Date().toISOString(),
      });
      return artifact;
    }
    const startedAt = new Date().toISOString();
    let raw;
    try {
      raw = await browserHarness.run({ prompt, baseUrl, outputDir, timeoutMs });
    } catch (error) {
      return finalizeSmokeResult(failedArtifact({
        mode: "Browser",
        category: classifyError(error),
        warning: error?.friendlyMessage || error?.message || String(error),
        timeoutMs,
        startedAt,
      }), { writeArtifact, outputDir });
    }
    const normalized = {
      schemaVersion: "canvas-agent-real-api-smoke-v1",
      timeoutMs,
      textModel: raw.textModel || { configured: true },
      imageModel: raw.imageModel || { configured: true },
      startedAt,
      endedAt: new Date().toISOString(),
      ...normalizeBrowserSmokeResult(raw),
    };
    const redacted = redactSmokeArtifact(normalized);
    const secretScan = scanSmokeArtifactForSecrets(redacted);
    redacted.secretScan = secretScan;
    if (secretScan.status !== "passed") {
      redacted.status = "failed";
      redacted.failureCategory = FAILURE_CATEGORIES.SECRET_SCAN_FAILED;
    }
    if (writeArtifact) {
      redacted.artifactPath = writeJsonArtifact({ artifact: redacted, outputDir });
    }
    return redacted;
  }
  if (normalizedMode === "All") {
    const moduleResult = await runCanvasSkillsRealApiSmoke({
      mode: "Module",
      prompt,
      timeoutMs,
      baseUrl,
      outputDir,
      writeArtifact,
      fetchImpl,
      adapters,
    });
    if (moduleResult.status !== "passed") {
      return { ...moduleResult, mode: "All", moduleResult };
    }
    const browserResult = await runCanvasSkillsRealApiSmoke({
      mode: "Browser",
      prompt,
      timeoutMs,
      baseUrl,
      outputDir,
      writeArtifact,
      fetchImpl,
      adapters,
      browserHarness,
    });
    return {
      ...browserResult,
      mode: "All",
      moduleResult,
      browserResult,
      status: moduleResult.status === "passed" && browserResult.status === "passed" ? "passed" : "failed",
      failureCategory: browserResult.failureCategory || moduleResult.failureCategory || "",
    };
  }

  const wrappedAdapters = {
    ...adapters,
    forceCanvasSkillsRuntime: true,
    onCreateImageDraft: undefined,
    onSubmitGeneration: undefined,
  };
  return await runRealApiSmoke({
    mode: "Module",
    prompt,
    timeoutMs,
    baseUrl,
    outputDir,
    writeArtifact,
    fetchImpl,
    adapters: wrappedAdapters,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawArgs = JSON.stringify(args);
  if (/(apiKey|api_key|token|authorization|secret|password|credential)/i.test(rawArgs)) {
    console.error("Raw key/token CLI input is not allowed for real API smoke.");
    process.exitCode = 2;
    return;
  }
  const mode = args.mode || args.Mode || "Module";
  const browserHarness =
    mode === "Browser" || mode === "All"
      ? createAssistantPanelBrowserSmokeHarness({ chrome: args.chrome || args.Chrome || "" })
      : null;
  const result = await runCanvasSkillsRealApiSmoke({
    mode,
    baseUrl: args.url || args.Url || DEFAULT_BASE_URL,
    outputDir: args.out || args.Out || DEFAULT_OUT_DIR,
    timeoutMs: Number(args.timeoutMs || args.TimeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    browserHarness,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "passed") {
    process.exitCode = 1;
  }
}

const isCli = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
if (isCli) {
  await main();
}
