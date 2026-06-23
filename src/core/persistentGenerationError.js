function trimText(value) {
  return String(value ?? "").trim();
}

export function normalizeGenerationErrorMessage(value, fallback = "生成失败") {
  const message = trimText(value);
  return message || fallback;
}

export function buildPersistentGenerationStartPatch(extra = {}) {
  return {
    generationStatus: "running",
    generationLocked: true,
    generationRetryable: false,
    isGenerating: true,
    jobStatus: "running",
    jobError: null,
    error: null,
    rhStatusMessage: null,
    rhStatusCode: null,
    generationStartTime: Date.now(),
    generationDuration: null,
    ...extra,
  };
}

export function buildPersistentGenerationSuccessPatch(extra = {}) {
  return {
    generationStatus: "completed",
    generationLocked: false,
    generationRetryable: false,
    isGenerating: false,
    jobStatus: "success",
    jobError: null,
    error: null,
    rhStatusMessage: null,
    rhStatusCode: null,
    ...extra,
  };
}

export function buildPersistentGenerationFailurePatch(message, extra = {}) {
  const errorMessage = normalizeGenerationErrorMessage(message);
  return {
    generationStatus: "failed",
    generationLocked: false,
    generationRetryable: true,
    isGenerating: false,
    jobStatus: "error",
    jobError: errorMessage,
    error: errorMessage,
    rhStatusMessage: errorMessage,
    rhStatusCode: null,
    ...extra,
  };
}

export function persistGenerationFailure(store, nodeId, message, extra = {}) {
  if (!store || !nodeId || typeof store.updateNodeData !== "function") {
    return null;
  }

  const patch = buildPersistentGenerationFailurePatch(message, extra);
  store.updateNodeData(nodeId, patch);
  return patch;
}
