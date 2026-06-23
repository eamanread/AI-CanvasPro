const RUNNING_TOOLTIP = "\u70b9\u51fb\u5373\u53ef\u505c\u6b62\u5f53\u524d\u751f\u6210";
const STOP_TITLE = "\u505c\u6b62\u751f\u6210";
const IDLE_TITLE = "\u751f\u6210";

export const GENERATION_STOP_ICON_HTML =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>';

export const GENERATION_ARROW_ICON_HTML =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

let nextRunId = 1;

function trimText(value) {
  return String(value ?? "").trim();
}

function getNodeId(node, explicitNodeId) {
  return trimText(explicitNodeId) || trimText(node?.nodeId) || trimText(node?._data?.id) || trimText(node?.id);
}

function safeCall(fn, ...args) {
  if (typeof fn !== "function") return undefined;
  try {
    return fn(...args);
  } catch {
    return undefined;
  }
}

function updateNodeData(store, nodeId, patch) {
  if (!store || !nodeId || !patch) return;
  safeCall(store.updateNodeData?.bind(store), nodeId, patch);
}

function normalizeState(state) {
  return state === "running" || state === "stop" ? "running" : "idle";
}

function isStopSubmitButton(btnEl) {
  if (!btnEl) return false;
  if (btnEl.dataset?.generationAction === "stop" || btnEl.getAttribute?.("data-generation-action") === "stop") {
    return true;
  }
  if (btnEl.dataset?.generationState === "running" || btnEl.getAttribute?.("data-generation-state") === "running") {
    return true;
  }
  const html = String(btnEl.innerHTML || "");
  return /<rect\b[^>]*\bx=["']?7["']?[^>]*\bwidth=["']?10["']?/i.test(html);
}

export function applyGenerationSubmitButtonState(nodeOrButton, state = "idle") {
  const btnEl = nodeOrButton?.btnEl || nodeOrButton;
  if (!btnEl) return false;

  const normalizedState = normalizeState(state);
  if (normalizedState === "running") {
    btnEl.disabled = false;
    if (btnEl.style) btnEl.style.color = "var(--red)";
    btnEl.setAttribute?.("data-generation-state", "running");
    btnEl.setAttribute?.("data-generation-action", "stop");
    btnEl.setAttribute?.("data-tooltip", RUNNING_TOOLTIP);
    btnEl.setAttribute?.("aria-label", STOP_TITLE);
    btnEl.title = STOP_TITLE;
    btnEl.innerHTML = GENERATION_STOP_ICON_HTML;
    return true;
  }

  const wasStopButton = isStopSubmitButton(btnEl);
  btnEl.disabled = false;
  if (btnEl.style) btnEl.style.color = "";
  btnEl.setAttribute?.("data-generation-state", "idle");
  btnEl.removeAttribute?.("data-generation-action");
  btnEl.removeAttribute?.("data-tooltip");
  btnEl.setAttribute?.("aria-label", IDLE_TITLE);
  btnEl.title = IDLE_TITLE;
  if (wasStopButton || btnEl.innerHTML === GENERATION_STOP_ICON_HTML || !trimText(btnEl.innerHTML)) {
    btnEl.innerHTML = GENERATION_ARROW_ICON_HTML;
  }
  return true;
}

export function isGenerationAbortError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  const message = trimText(error.message || error).toLowerCase();
  return message.includes("abort") || message.includes("aborted") || message.includes("cancelled") || message.includes("canceled") || message.includes("cancel");
}

export function getCurrentGenerationRun(node) {
  return node?._generationRun || null;
}

export function isCurrentGenerationRun(node, run) {
  return Boolean(node && run && node._generationRun === run && node._generationRunId === run.id);
}

export function beginGenerationRun(node, options = {}) {
  const runId = `gen-${Date.now()}-${nextRunId++}`;
  const nodeId = getNodeId(node, options.nodeId);
  const abortController = new AbortController();
  const startedAt = Number(options.startedAt || Date.now());
  let cancelled = false;
  let remoteCancelSent = false;
  let taskId = "";
  let apiKey = trimText(options.apiKey);

  const releaseUi = (patch = {}) => {
    if (node) {
      node._isGenerating = false;
      node._rhCancelRequested = false;
      node._rhCancelInFlight = false;
      applyGenerationSubmitButtonState(node, "idle");
    }
    updateNodeData(options.store, nodeId, {
      isGenerating: false,
      jobStatus: null,
      ...patch,
    });
    safeCall(options.stopLoading, options.previewEl || node?.previewEl);
  };

  const fireRemoteCancel = () => {
    if (remoteCancelSent || !taskId) return;
    remoteCancelSent = true;
    const meta = { taskId, apiKey };
    Promise.resolve()
      .then(() => options.cancelRemote?.(meta))
      .catch(() => {});
  };

  const run = {
    id: runId,
    nodeId,
    startedAt,
    controller: abortController,
    signal: abortController.signal,
    get cancelled() {
      return cancelled;
    },
    isCurrent() {
      return isCurrentGenerationRun(node, run);
    },
    setTaskMeta(meta = {}) {
      const nextTaskId = trimText(meta.taskId);
      const nextApiKey = trimText(meta.apiKey);
      if (nextTaskId) taskId = nextTaskId;
      if (nextApiKey) apiKey = nextApiKey;
      if (node) {
        node._rhTaskId = taskId;
        node._rhApiKey = apiKey;
      }
      if (cancelled) fireRemoteCancel();
    },
    cancelNow(patch = {}) {
      if (cancelled) return false;
      cancelled = true;
      if (node) {
        node._rhCancelRequested = true;
        node._rhCancelInFlight = false;
      }
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      releaseUi({
        generationDuration: Date.now() - startedAt,
        ...patch,
      });
      fireRemoteCancel();
      return true;
    },
    finish({ clearTaskMeta = true } = {}) {
      if (!isCurrentGenerationRun(node, run)) return false;
      if (node) {
        node._isGenerating = false;
        node._rhCancelRequested = false;
        node._rhCancelInFlight = false;
        if (clearTaskMeta) {
          node._rhTaskId = "";
          node._rhApiKey = "";
        }
        node._generationRun = null;
        node._generationRunId = "";
        applyGenerationSubmitButtonState(node, "idle");
      }
      safeCall(options.stopLoading, options.previewEl || node?.previewEl);
      return true;
    },
  };

  if (node) {
    node._generationRun = run;
    node._generationRunId = runId;
    node._rhAbortController = abortController;
    node._rhTaskId = "";
    node._rhApiKey = apiKey;
    node._rhCancelRequested = false;
    node._rhCancelInFlight = false;
    node._isGenerating = true;
    applyGenerationSubmitButtonState(node, "running");
  }
  safeCall(options.startLoading, options.previewEl || node?.previewEl);

  return run;
}
