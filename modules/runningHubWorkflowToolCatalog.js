function trimText(value) {
  return String(value ?? "").trim();
}

export const RUNNINGHUB_IMAGE_WORKFLOW_TOOLS = Object.freeze({
  hd: Object.freeze({
    action: "hd",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB HD upscale",
    model: "RH image HD workflow",
    workflowId: "2044874075721441281",
    supportsDuration: false,
  }),
  "panorama-360": Object.freeze({
    action: "panorama-360",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB 360 panorama",
    model: "RH 360 panorama workflow",
    workflowId: "2042329021530247170",
    supportsDuration: false,
  }),
  "auto-subject": Object.freeze({
    action: "auto-subject",
    provider: "runninghub",
    kind: "workflow",
    displayProvider: "RunningHUB",
    displayName: "RunningHUB auto subject",
    model: "RH auto subject workflow",
    workflowId: "2012862147813974018",
    supportsDuration: false,
  }),
});

export function getRunningHubImageWorkflowTool(action) {
  return RUNNINGHUB_IMAGE_WORKFLOW_TOOLS[trimText(action)] || null;
}

export function normalizeRunningHubDurationFields({ durationSec, fps = 24 } = {}) {
  const seconds = Number(durationSec);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return {};
  }

  const safeFps = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps) : 24;
  const frames = Math.max(1, Math.round(seconds * safeFps));
  return {
    durationSec: seconds,
    timeSec: seconds,
    rhVideoSeconds: seconds,
    frameCount: frames,
    rhVideoFrames: frames,
    rhVideoFps: safeFps,
  };
}

export function buildRunningHubWorkflowMetadata({
  action,
  taskId = "",
  status = "running",
  startedAt = Date.now(),
  durationSec,
  useOpenapiQuery = true,
} = {}) {
  const tool = getRunningHubImageWorkflowTool(action);
  if (!tool) {
    throw new Error(`Unknown RunningHUB workflow action: ${action}`);
  }

  const duration = Number(durationSec);
  return {
    provider: tool.provider,
    model: tool.model,
    asyncTaskProvider: tool.provider,
    asyncTaskKind: "runninghub-workflow",
    asyncTaskId: trimText(taskId),
    asyncTaskStatus: trimText(status) || "running",
    rhTaskId: trimText(taskId),
    rhTaskStatus: trimText(status) || "running",
    rhTaskStartedAt: Number(startedAt || 0),
    rhTaskRecovering: false,
    rhTaskUseOpenapiQuery: Boolean(useOpenapiQuery),
    ...(Number.isFinite(duration) && duration > 0 ? { durationSec: duration } : {}),
  };
}

export function buildRunningHubWorkflowPayload({
  action,
  inputUrls = [],
  nodeInfoList = [],
  options = {},
} = {}) {
  const tool = getRunningHubImageWorkflowTool(action);
  if (!tool) {
    throw new Error(`Unknown RunningHUB workflow action: ${action}`);
  }

  return {
    provider: tool.provider,
    action: tool.action,
    workflowId: tool.workflowId,
    model: tool.model,
    inputUrls: Array.isArray(inputUrls) ? inputUrls.map(trimText).filter(Boolean) : [],
    nodeInfoList: Array.isArray(nodeInfoList) ? nodeInfoList : [],
    rhTaskKind: "workflow",
    ...normalizeRunningHubDurationFields(options),
  };
}
