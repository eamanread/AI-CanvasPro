function text(value) {
  return String(value ?? "").trim();
}

export const AssistantCanvasGenerationStatus = Object.freeze({
  Idle: "idle",
  PendingRenderer: "pendingRenderer",
  Queued: "queued",
  Submitting: "submitting",
  Submitted: "submitted",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Retryable: "retryable",
  Cancelled: "cancelled",
  Paused: "paused",
});

const PREPARING = new Set(["pendingrenderer", "queued", "submitting", "submitted", "pending"]);
const RUNNING = new Set(["running", "generating", "processing", "in_progress", "in-progress"]);
const COMPLETED = new Set(["completed", "succeeded", "success", "done"]);
const FAILED = new Set(["failed", "error", "rejected"]);
const CANCELLED = new Set(["cancelled", "canceled", "stopped"]);
const PAUSED = new Set(["paused", "pause"]);

function rawStatusesFromData(data = {}) {
  return [
    data.generationStatus,
    data.jobStatus,
    data.asyncTaskStatus,
    data.taskStatus,
    data.rhTaskStatus,
    data.dreaminaTaskStatus,
    data.status,
  ]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean);
}

function hasAny(values, candidates) {
  return values.some((value) => candidates.has(value));
}

export function normalizeCanvasGenerationStatus(data = {}) {
  const statuses = rawStatusesFromData(data);
  if (!statuses.length) {
    return data?.isGenerating === true
      ? AssistantCanvasGenerationStatus.Running
      : AssistantCanvasGenerationStatus.Idle;
  }
  if (hasAny(statuses, COMPLETED)) return AssistantCanvasGenerationStatus.Completed;
  if (hasAny(statuses, FAILED)) return AssistantCanvasGenerationStatus.Failed;
  if (statuses.includes("retryable")) return AssistantCanvasGenerationStatus.Retryable;
  if (hasAny(statuses, CANCELLED)) return AssistantCanvasGenerationStatus.Cancelled;
  if (hasAny(statuses, PAUSED)) return AssistantCanvasGenerationStatus.Paused;
  if (statuses.includes("pendingrenderer")) return AssistantCanvasGenerationStatus.PendingRenderer;
  if (statuses.includes("submitting")) return AssistantCanvasGenerationStatus.Submitting;
  if (statuses.includes("submitted")) return AssistantCanvasGenerationStatus.Submitted;
  if (hasAny(statuses, RUNNING) || data?.isGenerating === true) return AssistantCanvasGenerationStatus.Running;
  if (hasAny(statuses, PREPARING)) return AssistantCanvasGenerationStatus.Queued;
  return AssistantCanvasGenerationStatus.Queued;
}

export function mapCanvasGenerationState(data = {}) {
  const technicalStatus = normalizeCanvasGenerationStatus(data);
  if (technicalStatus === AssistantCanvasGenerationStatus.Completed) {
    return { cardStatus: "completed", technicalStatus, locked: false, retryable: false };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Failed) {
    return { cardStatus: "failed", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Retryable) {
    return { cardStatus: "retryable", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Cancelled) {
    return { cardStatus: "cancelled", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Paused) {
    return { cardStatus: "paused", technicalStatus, locked: false, retryable: true };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Running) {
    return { cardStatus: "generating", technicalStatus, locked: true, retryable: false };
  }
  if (technicalStatus === AssistantCanvasGenerationStatus.Idle) {
    return { cardStatus: "pending", technicalStatus, locked: false, retryable: false };
  }
  return { cardStatus: "preparing", technicalStatus, locked: true, retryable: false };
}

export function statusPatchForNode(status, { warning = "", error = "" } = {}) {
  const normalized = normalizeCanvasGenerationStatus({ generationStatus: status });
  const mapped = mapCanvasGenerationState({ generationStatus: normalized });
  return {
    generationStatus: normalized,
    jobStatus: normalized,
    asyncTaskStatus: normalized,
    isGenerating: mapped.locked && !mapped.retryable,
    generationLocked: mapped.locked,
    generationRetryable: mapped.retryable,
    generationWarning: text(warning),
    generationError: text(error),
  };
}
