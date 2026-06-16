import {
  consumeAssistantStream,
} from "../modules/assistant/assistantStreamingClient.js";

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "proxytoken",
  "proxy_token",
  "token",
  "authorization",
  "secret",
]);

async function parseJsonResponse(response, url) {
  try {
    return await response.json();
  } catch (cause) {
    const status = Number(response?.status || 0);
    const error = createApiError(
      `Canvas agent response was not valid JSON for ${url}`,
      {},
      status
    );
    error.url = url;
    error.cause = cause;
    throw error;
  }
}

function createApiError(message, response, status) {
  const error = new Error(message);
  error.response = response;
  error.status = status;
  const payload = response && typeof response === "object" ? response : {};
  error.friendlyMessage = String(payload.friendlyMessage || payload.reply || payload.message || message || "").trim();
  error.errorCode = String(payload.errorCode || payload.code || "").trim();
  error.traceId = String(payload.traceId || "").trim();
  error.diagnostics = Array.isArray(payload.diagnostics)
    ? payload.diagnostics.map((item) => String(item || "").trim()).filter(Boolean)
    : Array.isArray(payload.warnings)
      ? payload.warnings.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  error.retryable = payload.retryable !== undefined ? payload.retryable !== false : status === 0 || status >= 500;
  return error;
}

async function requestJson(fetchImpl, url, options) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl is required");
  }

  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (cause) {
    const error = createApiError(
      `Canvas agent request failed for ${url}: ${cause?.message || cause}`,
      {},
      0
    );
    error.url = url;
    error.cause = cause;
    throw error;
  }

  const payload = await parseJsonResponse(response, url);
  const status = Number(response?.status || 0);
  if (response?.ok === false || payload?.success === false) {
    const method = options?.method || "GET";
    const message =
      payload?.error ||
      payload?.message ||
      `Canvas agent request failed: ${method} ${url} returned ${status || "unknown status"}`;
    const error = createApiError(message, payload, status);
    error.url = url;
    throw error;
  }
  return payload;
}

function postJson(fetchImpl, url, payload) {
  return requestJson(fetchImpl, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

function patchJson(fetchImpl, url, payload) {
  return requestJson(fetchImpl, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

function getJson(fetchImpl, url) {
  return requestJson(fetchImpl, url, { method: "GET" });
}

function deleteJson(fetchImpl, url) {
  return requestJson(fetchImpl, url, { method: "DELETE" });
}

function encodedPath(value) {
  return encodeURIComponent(String(value || ""));
}

function conversationUrl(id = "", suffix = "") {
  const base = "/api/v2/canvas-agent/conversations";
  const path = id ? `${base}/${encodedPath(id)}` : base;
  return suffix ? `${path}/${suffix}` : path;
}

function executionUrl(id = "", suffix = "") {
  const base = "/api/v2/canvas-agent/executions";
  const path = id ? `${base}/${encodedPath(id)}` : base;
  return suffix ? `${path}/${suffix}` : path;
}

function generationTasksUrl(id = "", params = {}) {
  const base = "/api/v2/canvas-agent/generation-tasks";
  const path = id ? `${base}/${encodedPath(id)}` : base;
  const query = [];
  for (const [key, value] of Object.entries(params || {})) {
    const text = String(value || "").trim();
    if (text) {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
    }
  }
  const suffix = query.join("&");
  return suffix ? `${path}?${suffix}` : path;
}

function syncProjectUrl(params = {}) {
  const query = [];
  for (const [key, value] of Object.entries(params || {})) {
    const text = String(value || "").trim();
    if (text) {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
    }
  }
  const suffix = query.join("&");
  return suffix ? `/api/v2/canvas-agent/sync/project?${suffix}` : "/api/v2/canvas-agent/sync/project";
}

function redactedPayload(value) {
  if (Array.isArray(value)) {
    return value.map(redactedPayload);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      continue;
    }
    next[key] = redactedPayload(item);
  }
  return next;
}

function prepareExecutionArgs(first, second) {
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const executionId = String(first.executionId || first.id || "").trim();
    return { executionId, payload: first };
  }
  const executionId = String(first || "").trim();
  const payload = second && typeof second === "object" && !Array.isArray(second)
    ? { ...second }
    : {};
  if (!Object.hasOwn(payload, "executionId")) {
    payload.executionId = executionId;
  }
  return { executionId, payload };
}

function streamHandlers(handlers = {}) {
  return {
    onEvent(event) {
      handlers.onEvent?.(event);
      handlers.onFrame?.(event);
      if (event?.type === "message.done") {
        handlers.onDone?.(event);
      }
    },
  };
}

async function postStream(fetchImpl, url, payload, handlers, fallback, options = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl is required");
  }

  const safePayload = redactedPayload(payload || {});
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safePayload),
      signal: options.signal,
    });
  } catch (cause) {
    const error = createApiError(
      `Canvas agent stream request failed for ${url}: ${cause?.message || cause}`,
      {},
      0
    );
    error.url = url;
    error.cause = cause;
    throw error;
  }

  const status = Number(response?.status || 0);
  if (response?.ok === false) {
    if ([404, 405, 501].includes(status) && typeof fallback === "function") {
      return fallback();
    }
    const payload = await parseJsonResponse(response, url);
    const message =
      payload?.error ||
      payload?.message ||
      `Canvas agent stream request failed: POST ${url} returned ${status || "unknown status"}`;
    const error = createApiError(message, payload, status);
    error.url = url;
    throw error;
  }
  return consumeAssistantStream(response, streamHandlers(handlers));
}

export function createCanvasAgentApi({ fetchImpl = globalThis.fetch } = {}) {
  return {
    status() {
      return requestJson(fetchImpl, "/api/v2/canvas-agent/status", { method: "GET" });
    },
    chat(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/chat", payload);
    },
    chatStream(payload, handlers, options) {
      return postStream(fetchImpl, "/api/v2/canvas-agent/chat/stream", payload, handlers, () =>
        postJson(fetchImpl, "/api/v2/canvas-agent/chat", payload)
      , options);
    },
    sendMessageStream(payload, handlers, options) {
      return this.chatStream(payload, handlers, options);
    },
    validateActions(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/actions/validate", payload);
    },
    directorPlan(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/director/plan", payload);
    },
    directorDailies(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/director/dailies", payload);
    },
    directorRefresh(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/director/refresh", payload);
    },
    directorKnowledge() {
      return requestJson(fetchImpl, "/api/v2/canvas-agent/director/knowledge", { method: "GET" });
    },
    directorRefreshStatus(jobId) {
      const query = encodeURIComponent(String(jobId || ""));
      return requestJson(fetchImpl, `/api/v2/canvas-agent/director/refresh/status?jobId=${query}`, { method: "GET" });
    },
    // ViMax cost gate: sign a render/portraits budget ticket (broker). Shared by
    // the native render/portraits lanes (the external venv plan/render/portraits
    // API was retired in C5.2 - native is the only runtime).
    vimaxSign(payload) {
      return postJson(fetchImpl, "/api/v2/vimax/sign", payload);
    },
    // Native orchestrator (Phase B/C): the in-process brain runs plan + render +
    // portraits, streaming step events into the async-job shape.
    vimaxNativeStatus() {
      return requestJson(fetchImpl, "/api/v2/vimax/native/status", { method: "GET" });
    },
    // 拍法库 (slice 7): the film-craft roster for the picker that replaces 爆款实验室.
    // Returns { success, skills:[{name,summary,coverUrl,uses}] } from the bridge.
    vimaxSkills() {
      return requestJson(fetchImpl, "/api/v2/vimax/skills", { method: "GET" });
    },
    vimaxNativePlan(payload) {
      return postJson(fetchImpl, "/api/v2/vimax/native/plan", payload);
    },
    vimaxNativeJob(jobId, since = 0) {
      const q = encodeURIComponent(String(jobId || ""));
      const s = encodeURIComponent(String(since || 0));
      return requestJson(fetchImpl, `/api/v2/vimax/native/jobs?jobId=${q}&since=${s}`, { method: "GET" });
    },
    vimaxNativeCancel(jobId) {
      return postJson(fetchImpl, "/api/v2/vimax/native/jobs/cancel", { jobId });
    },
    vimaxNativeResume(jobId, characters) {
      return postJson(fetchImpl, "/api/v2/vimax/native/resume", { jobId, characters });
    },
    // Native render (Phase C): in-process keyframe render, draws billed through
    // the broker (same ticketId+cap path as the external runner). Polls via
    // vimaxNativeJob (identical job_status shape).
    vimaxNativeRender(payload) {
      return postJson(fetchImpl, "/api/v2/vimax/native/render", payload);
    },
    vimaxNativePortraits(payload) {
      return postJson(fetchImpl, "/api/v2/vimax/native/portraits", payload);
    },
    previewContext(payload) {
      return postJson(fetchImpl, "/api/v2/canvas-agent/context/preview", payload);
    },
    prepareQueuedExecution(first, second) {
      const { executionId, payload } = prepareExecutionArgs(first, second);
      if (!executionId) {
        throw new Error("Missing execution id");
      }
      return postJson(fetchImpl, executionUrl(executionId, "prepare"), payload);
    },
    listConversations({ query = "" } = {}) {
      const text = String(query || "");
      return getJson(
        fetchImpl,
        text ? `${conversationUrl()}?query=${encodeURIComponent(text)}` : conversationUrl()
      );
    },
    createConversation(payload = {}) {
      return postJson(fetchImpl, conversationUrl(), payload);
    },
    getConversation(id) {
      return getJson(fetchImpl, conversationUrl(id));
    },
    renameConversation(id, title) {
      return patchJson(fetchImpl, conversationUrl(id), { title });
    },
    deleteConversation(id) {
      return deleteJson(fetchImpl, conversationUrl(id));
    },
    appendConversationMessage(id, message = {}) {
      return postJson(fetchImpl, conversationUrl(id, "messages"), message);
    },
    appendConversationReceipt(id, receipt = {}) {
      return postJson(fetchImpl, conversationUrl(id, "receipts"), receipt);
    },
    exportConversation(id, { format = "json" } = {}) {
      return getJson(
        fetchImpl,
        `${conversationUrl(id, "export")}?format=${encodeURIComponent(String(format || "json"))}`
      );
    },
    listGenerationTasks({ conversationId = "", nodeId = "", status = "" } = {}) {
      return getJson(fetchImpl, generationTasksUrl("", { conversationId, nodeId, status }));
    },
    createGenerationTask(payload = {}) {
      return postJson(fetchImpl, generationTasksUrl(), payload);
    },
    updateGenerationTask(id, patch = {}) {
      return patchJson(fetchImpl, generationTasksUrl(id), patch);
    },
    exportProjectSyncSnapshot({ projectId = "", teamId = "" } = {}) {
      return getJson(fetchImpl, syncProjectUrl({ projectId, teamId }));
    },
    importProjectSyncSnapshot({ projectId = "", teamId = "", snapshot = {} } = {}) {
      return postJson(fetchImpl, syncProjectUrl(), { projectId, teamId, snapshot });
    },
  };
}
