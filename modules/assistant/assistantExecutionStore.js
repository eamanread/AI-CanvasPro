const DEFAULT_STORAGE_KEY = "huanying.canvasAgent.executions.v1";

export const AssistantExecutionStatus = Object.freeze({
  Draft: "draft",
  QueuedDraft: "queued_draft",
  Queued: "queued",
  Executing: "executing",
  WaitingConfirmation: "waiting_confirmation",
  WaitingVideoAuthorization: "waiting_video_authorization",
  Paused: "paused",
  Failed: "failed",
  Completed: "completed",
  Cancelled: "cancelled",
});

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

function safeString(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJson(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function looksLikeLocalPath(value) {
  const text = safeString(value);
  return /^[a-z]:\\/i.test(text) || text.startsWith("\\\\") || text.startsWith("/");
}

function isSecretField(key, value) {
  const name = safeString(key);
  if (/api[_-]?key|access[_-]?token|refresh[_-]?token|proxy[_-]?token|authorization|secret|password|credential|headers|cookie/i.test(name)) {
    return true;
  }
  if (/^(localPath|filePath|filesystemPath|absolutePath)$/i.test(name)) {
    return true;
  }
  return /path$/i.test(name) && looksLikeLocalPath(value);
}

function sanitizeJson(value, key = "") {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }
  if (typeof value === "string") {
    if (looksLikeLocalPath(value)) {
      return "";
    }
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/\bsk-[A-Za-z0-9_-]+/gi, "sk-[REDACTED]")
      .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]{80,}/gi, "data:[REDACTED_BASE64]");
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item, key)).filter((item) => item !== undefined);
  }
  const output = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (isSecretField(entryKey, entryValue)) {
      continue;
    }
    const sanitized = sanitizeJson(entryValue, entryKey);
    if (sanitized !== undefined) {
      output[entryKey] = sanitized;
    }
  }
  return output;
}

function normalizeStatus(status, fallback = AssistantExecutionStatus.Draft) {
  const value = safeString(status).toLowerCase();
  return Object.values(AssistantExecutionStatus).includes(value) ? value : fallback;
}

function sanitizeProgress(progress = {}) {
  const done = Number(progress?.done || 0);
  const total = Number(progress?.total || 0);
  return {
    done: Number.isFinite(done) && done > 0 ? done : 0,
    total: Number.isFinite(total) && total > 0 ? total : 0,
  };
}

function sanitizeDrawerState(drawerState = {}) {
  return {
    visible: drawerState?.visible === true,
    expanded: drawerState?.expanded === true,
    line1: safeString(drawerState?.line1),
    line2: safeString(drawerState?.line2),
    queueWarning: drawerState?.queueWarning === true,
    queuePaused: drawerState?.queuePaused === true,
    pendingConfirmationCount: Math.max(0, Number(drawerState?.pendingConfirmationCount || 0) || 0),
  };
}

function sanitizeOrchestratorState(state = {}, status = "") {
  return {
    nextActionIndex: Math.max(0, Number(state?.nextActionIndex || 0) || 0),
    pausedAtActionId: safeString(state?.pausedAtActionId),
    running: state?.running === true && status === AssistantExecutionStatus.Executing,
  };
}

const INVERSE_OP_TYPES = new Set(["remove_node", "remove_edge", "restore_node", "restore_node_position"]);

function sanitizeInverse(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }
  const ops = safeArray(raw.ops)
    .map((op) => {
      if (!isPlainObject(op) || !INVERSE_OP_TYPES.has(safeString(op.type))) {
        return null;
      }
      const type = safeString(op.type);
      const nodeId = safeString(op.nodeId);
      const edgeId = safeString(op.edgeId);
      if (!nodeId && !edgeId) {
        return null;
      }
      if (type === "restore_node_position") {
        const x = Number(op.x);
        const y = Number(op.y);
        if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y)) {
          return null;
        }
        const positionSignature = safeString(sanitizeJson(op.signature, "signature"));
        return {
          type,
          nodeId,
          x,
          y,
          ...(positionSignature ? { signature: positionSignature } : {}),
        };
      }
      const signature = safeString(sanitizeJson(op.signature, "signature"));
      const restorePayload =
        type === "restore_node"
          ? {
              name: safeString(op.name),
              data: isPlainObject(op.data) ? sanitizeJson(op.data) : {},
            }
          : {};
      return {
        type,
        ...(nodeId ? { nodeId } : {}),
        ...(edgeId ? { edgeId } : {}),
        ...restorePayload,
        ...(signature ? { signature } : {}),
      };
    })
    .filter(Boolean);
  if (!ops.length) {
    return null;
  }
  return { aiOwned: raw.aiOwned === true, ops };
}

function sanitizeTimelineEvent(raw, { clock = nowIso, idFactory = createId } = {}) {
  if (!isPlainObject(raw)) {
    return null;
  }
  const createdAt = safeString(raw.createdAt) || clock();
  const nodeIds = [
    ...safeArray(raw.nodeIds),
    ...safeArray(raw.affectedNodeIds),
    ...safeArray(raw.createdNodeIds),
    ...safeArray(raw.updatedNodeIds),
    ...safeArray(raw.queuedGenerationNodeIds),
    ...safeArray(raw.startedGenerationNodeIds),
  ].map(safeString).filter(Boolean);
  const inverse = sanitizeInverse(raw.inverse);
  return {
    ...(inverse ? { inverse } : {}),
    id: safeString(raw.id) || idFactory("evt"),
    stepId: safeString(raw.stepId),
    actionId: safeString(raw.actionId),
    status: safeString(raw.status || "pending") || "pending",
    humanSummary: safeString(raw.humanSummary || raw.summary),
    error: safeString(raw.error),
    nodeIds: [...new Set(nodeIds)],
    canRetry: raw.canRetry === true,
    canUndo: raw.canUndo === true,
    durationMs: Math.max(0, Number(raw.durationMs || 0) || 0),
    ...(isPlainObject(raw.target)
      ? {
          target: {
            actionType: safeString(raw.target.actionType),
            nodeType: safeString(raw.target.nodeType),
            nodeIds: safeArray(raw.target.nodeIds).map(safeString).filter(Boolean),
            stepId: safeString(raw.target.stepId),
          },
        }
      : {}),
    createdAt,
    updatedAt: safeString(raw.updatedAt) || createdAt,
    developer: isPlainObject(raw.developer) ? sanitizeJson(raw.developer) : {},
  };
}

function sanitizeExecution(raw, { projectId = "", clock = nowIso, idFactory = createId } = {}) {
  if (!isPlainObject(raw)) {
    return null;
  }
  const id = safeString(raw.id) || idFactory("exec");
  if (!id) {
    return null;
  }
  const createdAt = safeString(raw.createdAt) || clock();
  const status = normalizeStatus(raw.status);
  return {
    id,
    projectId: safeString(raw.projectId || projectId),
    conversationId: safeString(raw.conversationId),
    intentId: safeString(raw.intentId),
    planId: safeString(raw.planId),
    matchedSkills: safeArray(raw.matchedSkills).map(safeString).filter(Boolean),
    title: safeString(raw.title) || "AI 执行任务",
    status,
    queueIndex: Math.max(0, Number(raw.queueIndex || 0) || 0),
    progress: sanitizeProgress(raw.progress),
    drawerState: sanitizeDrawerState(raw.drawerState),
    createdAt,
    updatedAt: safeString(raw.updatedAt) || createdAt,
    plan: isPlainObject(raw.plan) ? sanitizeJson(raw.plan) : {},
    actionsByStep: isPlainObject(raw.actionsByStep) ? sanitizeJson(raw.actionsByStep) : {},
    orchestratorState: sanitizeOrchestratorState(raw.orchestratorState, status),
    timeline: safeArray(raw.timeline)
      .map((event) => sanitizeTimelineEvent(event, { clock, idFactory }))
      .filter(Boolean),
    summary: safeString(raw.summary),
  };
}

function readStorage(storage, key, options) {
  if (!storage || typeof storage.getItem !== "function") {
    return [];
  }
  const text = storage.getItem(key);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    return safeArray(parsed?.executions || parsed)
      .map((execution) => sanitizeExecution(execution, options))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeStorage(storage, key, executions, clock = nowIso) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  storage.setItem(
    key,
    JSON.stringify({
      version: 1,
      updatedAt: clock(),
      executions,
    })
  );
}

function isActiveStatus(status) {
  return [
    AssistantExecutionStatus.Draft,
    AssistantExecutionStatus.Executing,
    AssistantExecutionStatus.WaitingConfirmation,
    AssistantExecutionStatus.WaitingVideoAuthorization,
    AssistantExecutionStatus.Paused,
    AssistantExecutionStatus.Failed,
  ].includes(status);
}

function isQueueStatus(status) {
  return status === AssistantExecutionStatus.Queued || status === AssistantExecutionStatus.QueuedDraft;
}

const RESTART_RESTORE_LINE = "重启后已暂停，可继续执行";

function restoreInterruptedExecution(
  execution,
  {
    clock = nowIso,
    idFactory = createId,
    reason = "local_storage_restart",
  } = {}
) {
  if (!execution || execution.status !== AssistantExecutionStatus.Executing) {
    return execution;
  }
  const hasRestoreEvent = safeArray(execution.timeline)
    .some((event) => event?.status === "restored_paused");
  const restoreEvent = hasRestoreEvent
    ? null
    : sanitizeTimelineEvent(
      {
        status: "restored_paused",
        humanSummary: RESTART_RESTORE_LINE,
        canRetry: false,
        canUndo: false,
        developer: {
          restoreReason: reason,
          previousStatus: AssistantExecutionStatus.Executing,
          previousRunning: execution.orchestratorState?.running === true,
        },
      },
      { clock, idFactory }
    );
  return {
    ...execution,
    status: AssistantExecutionStatus.Paused,
    updatedAt: clock(),
    drawerState: {
      ...execution.drawerState,
      visible: true,
      line2: RESTART_RESTORE_LINE,
    },
    orchestratorState: {
      ...execution.orchestratorState,
      running: false,
    },
    timeline: restoreEvent ? [...execution.timeline, restoreEvent] : execution.timeline,
  };
}

export function createAssistantExecutionStore({
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
  projectId = "",
  clock = nowIso,
  idFactory = createId,
  maxExecutions = 50,
} = {}) {
  const ownerProjectId = safeString(projectId);
  let restoredInterruptedOnLoad = false;
  let executions = readStorage(storage, storageKey, { projectId: ownerProjectId, clock, idFactory })
    .filter((execution) => !ownerProjectId || execution.projectId === ownerProjectId)
    .map((execution) => {
      const restored = restoreInterruptedExecution(execution, {
        clock,
        idFactory,
        reason: "local_storage_restart",
      });
      if (restored !== execution) {
        restoredInterruptedOnLoad = true;
        return restored;
      }
      // A persisted `draft` is STALE on reload: a freshly-compiled plan to review
      // is always created in-session, never restored from storage. Without this,
      // an old draft (its drawerState.visible persisted) re-surfaces 常驻 above the
      // input every session — the "已为您重新整理布局" ghost bar. Demote it to
      // history (visible:false). paused/failed/waiting genuinely need attention
      // across a restart, so they're left for drawerExecutionNeedsAttention.
      if (restored?.status === AssistantExecutionStatus.Draft && restored?.drawerState?.visible === true) {
        restoredInterruptedOnLoad = true; // also triggers persist() below
        return { ...restored, drawerState: { ...restored.drawerState, visible: false } };
      }
      return restored;
    });

  function persist() {
    const allExecutions = readStorage(storage, storageKey, { projectId: ownerProjectId, clock, idFactory })
      .filter((execution) => ownerProjectId && execution.projectId !== ownerProjectId);
    const merged = [...allExecutions, ...executions];
    writeStorage(storage, storageKey, merged, clock);
  }

  if (restoredInterruptedOnLoad) {
    persist();
  }

  function prune() {
    const limit = Math.max(1, Number(maxExecutions || 50) || 50);
    if (executions.length <= limit) {
      return;
    }
    const indexed = executions.map((execution, index) => ({ execution, index }));
    const active = indexed
      .filter((entry) => isActiveStatus(entry.execution.status))
      .map((entry) => entry.execution);
    const inactive = indexed
      .filter((entry) => !isActiveStatus(entry.execution.status))
      .sort((left, right) => {
        const timeOrder = safeString(right.execution.updatedAt).localeCompare(safeString(left.execution.updatedAt));
        return timeOrder || right.index - left.index;
      })
      .map((entry) => entry.execution);
    const keepIds = new Set([...active, ...inactive].slice(0, limit).map((execution) => execution.id));
    executions = executions.filter((execution) => keepIds.has(execution.id));
  }

  function saveExecution(raw) {
    const execution = sanitizeExecution(
      {
        ...raw,
        projectId: ownerProjectId || raw?.projectId,
        updatedAt: raw?.updatedAt || clock(),
      },
      { projectId: ownerProjectId, clock, idFactory }
    );
    if (!execution) {
      return null;
    }
    const index = executions.findIndex((item) => item.id === execution.id);
    if (index >= 0) {
      executions[index] = execution;
    } else {
      executions.push(execution);
    }
    prune();
    persist();
    return cloneJson(execution);
  }

  function normalizeQueue() {
    const orderedQueue = executions
      .map((execution, index) => ({ execution, index }))
      .filter((entry) => isQueueStatus(entry.execution.status))
      .sort((left, right) => {
        const leftIndex = left.execution.queueIndex > 0 ? left.execution.queueIndex : Number.MAX_SAFE_INTEGER + left.index;
        const rightIndex = right.execution.queueIndex > 0 ? right.execution.queueIndex : Number.MAX_SAFE_INTEGER + right.index;
        return leftIndex - rightIndex || left.index - right.index;
      })
      .map((entry) => entry.execution);
    let queueCursor = 0;
    executions = executions.map((execution) => {
      if (!isQueueStatus(execution.status)) {
        return execution;
      }
      const ordered = orderedQueue[queueCursor++] || execution;
      return { ...ordered, queueIndex: queueCursor };
    });
  }

  function queuedExecution(id) {
    const execution = executions.find((item) => item.id === safeString(id));
    return isQueueStatus(execution?.status) ? execution : null;
  }

  function moveQueuedExecutionToIndexInternal(id, targetIndex = 0) {
    const target = queuedExecution(id);
    if (!target) {
      return null;
    }
    normalizeQueue();
    const queue = executions
      .filter((execution) => isQueueStatus(execution.status))
      .sort((left, right) => left.queueIndex - right.queueIndex);
    const withoutTarget = queue.filter((execution) => execution.id !== target.id);
    const numericIndex = Number(targetIndex);
    const insertIndex = Math.max(
      0,
      Math.min(withoutTarget.length, Number.isFinite(numericIndex) ? Math.trunc(numericIndex) : 0)
    );
    const orderedIds = [
      ...withoutTarget.slice(0, insertIndex).map((execution) => execution.id),
      target.id,
      ...withoutTarget.slice(insertIndex).map((execution) => execution.id),
    ];
    executions = executions.map((execution) => {
      if (!isQueueStatus(execution.status)) {
        return execution;
      }
      return {
        ...execution,
        queueIndex: orderedIds.indexOf(execution.id) + 1,
        updatedAt: execution.id === target.id ? clock() : execution.updatedAt,
      };
    });
    normalizeQueue();
    persist();
    return snapshot().queue.find((execution) => execution.id === target.id) || null;
  }

  function reorderQueuedExecutionsInternal(orderedIds = []) {
    normalizeQueue();
    const queue = executions
      .filter((execution) => isQueueStatus(execution.status))
      .sort((left, right) => left.queueIndex - right.queueIndex);
    const queueIds = new Set(queue.map((execution) => execution.id));
    const requestedIds = [];
    for (const rawId of safeArray(orderedIds)) {
      const id = safeString(rawId);
      if (id && queueIds.has(id) && !requestedIds.includes(id)) {
        requestedIds.push(id);
      }
    }
    if (requestedIds.length < 2) {
      return [];
    }
    const orderedIdsNext = [
      ...requestedIds,
      ...queue.map((execution) => execution.id).filter((id) => !requestedIds.includes(id)),
    ];
    const touched = new Set(requestedIds);
    executions = executions.map((execution) => {
      if (!isQueueStatus(execution.status)) {
        return execution;
      }
      return {
        ...execution,
        queueIndex: orderedIdsNext.indexOf(execution.id) + 1,
        updatedAt: touched.has(execution.id) ? clock() : execution.updatedAt,
      };
    });
    normalizeQueue();
    persist();
    return snapshot().queue;
  }

  function snapshot() {
    normalizeQueue();
    const active = executions.find((execution) => isActiveStatus(execution.status)) || null;
    const queue = executions
      .filter((execution) => isQueueStatus(execution.status))
      .sort((left, right) => left.queueIndex - right.queueIndex);
    const sortedExecutions = executions
      .slice()
      .sort((left, right) => safeString(left.createdAt).localeCompare(safeString(right.createdAt)));
    return {
      projectId: ownerProjectId,
      activeExecutionId: active?.id || "",
      queue: cloneJson(queue),
      executions: cloneJson(sortedExecutions),
    };
  }

  return {
    snapshot,

    list() {
      return snapshot().executions;
    },

    getExecution(id) {
      const execution = executions.find((item) => item.id === safeString(id));
      return execution ? cloneJson(execution) : null;
    },

    createExecution(raw = {}) {
      const status = normalizeStatus(raw.status, AssistantExecutionStatus.Draft);
      return saveExecution({
        ...raw,
        id: raw.id || idFactory("exec"),
        status,
        queueIndex: 0,
      });
    },

    enqueueExecution(raw = {}) {
      const queuedCount = executions.filter((execution) => isQueueStatus(execution.status)).length;
      const requestedStatus = normalizeStatus(raw.status, AssistantExecutionStatus.Queued);
      const status = requestedStatus === AssistantExecutionStatus.QueuedDraft
        ? AssistantExecutionStatus.QueuedDraft
        : AssistantExecutionStatus.Queued;
      return saveExecution({
        ...raw,
        id: raw.id || idFactory("exec"),
        status,
        queueIndex: queuedCount + 1,
      });
    },

    moveQueuedExecutionToTop(id) {
      return moveQueuedExecutionToIndexInternal(id, 0);
    },

    moveQueuedExecutionToIndex(id, targetIndex = 0) {
      return moveQueuedExecutionToIndexInternal(id, targetIndex);
    },

    reorderQueuedExecutions(orderedIds = []) {
      return reorderQueuedExecutionsInternal(orderedIds);
    },

    pauseQueuedExecution(id) {
      const target = queuedExecution(id);
      if (!target) {
        return null;
      }
      return saveExecution({
        ...target,
        drawerState: {
          ...target.drawerState,
          queuePaused: true,
          line2: "已暂停排队",
        },
      });
    },

    resumeQueuedExecution(id) {
      const target = queuedExecution(id);
      if (!target) {
        return null;
      }
      return saveExecution({
        ...target,
        drawerState: {
          ...target.drawerState,
          queuePaused: false,
          line2: "排队中",
        },
      });
    },

    cancelQueuedExecution(id) {
      const target = queuedExecution(id);
      if (!target) {
        return null;
      }
      return saveExecution({
        ...target,
        status: AssistantExecutionStatus.Cancelled,
        queueIndex: 0,
        drawerState: {
          ...target.drawerState,
          visible: false,
          queuePaused: false,
          line2: "已取消",
        },
      });
    },

    importExecutions(items = []) {
      const imported = [];
      for (const item of safeArray(items)) {
        const execution = restoreInterruptedExecution(
          sanitizeExecution(item, { projectId: ownerProjectId, clock, idFactory }),
          {
            clock,
            idFactory,
            reason: "backend_import_restart",
          }
        );
        if (!execution) {
          continue;
        }
        if (ownerProjectId && execution.projectId !== ownerProjectId) {
          continue;
        }
        const saved = saveExecution(execution);
        if (saved) {
          imported.push(saved);
        }
      }
      return imported;
    },

    setPlanStepEnabled(id, stepId, enabled) {
      const execution = this.getExecution(id);
      if (!execution || execution.status === AssistantExecutionStatus.Executing) {
        return null;
      }
      const targetStepId = safeString(stepId);
      const steps = safeArray(execution?.plan?.steps);
      const targetStep = steps.find((step) => safeString(step?.id) === targetStepId);
      if (!targetStep) {
        return null;
      }
      const stepExecuted = safeArray(execution.timeline).some(
        (event) =>
          safeString(event?.stepId) === targetStepId &&
          ["running", "completed", "failed"].includes(safeString(event?.status))
      );
      if (stepExecuted) {
        return null;
      }
      const enabledNext = enabled !== false;
      const hasProgress =
        Number(execution?.orchestratorState?.nextActionIndex || 0) > 0 ||
        Number(execution?.progress?.done || 0) > 0;
      if (enabledNext && targetStep.enabled === false && hasProgress) {
        return null;
      }
      return saveExecution({
        ...execution,
        plan: {
          ...execution.plan,
          steps: steps.map((step) =>
            safeString(step?.id) === targetStepId ? { ...step, enabled: enabledNext } : step
          ),
        },
      });
    },

    reorderPlanSteps(id, orderedStepIds = []) {
      const execution = this.getExecution(id);
      if (!execution || execution.status === AssistantExecutionStatus.Executing) {
        return null;
      }
      const steps = safeArray(execution?.plan?.steps);
      const currentIds = steps.map((step) => safeString(step?.id));
      const requestedIds = safeArray(orderedStepIds).map(safeString);
      if (
        requestedIds.length !== currentIds.length ||
        new Set(requestedIds).size !== requestedIds.length ||
        !requestedIds.every((stepId) => currentIds.includes(stepId))
      ) {
        return null;
      }
      const executedStatuses = new Set(["running", "completed", "failed"]);
      const executedStepIds = new Set(
        safeArray(execution.timeline)
          .filter((event) => executedStatuses.has(safeString(event?.status)))
          .map((event) => safeString(event?.stepId))
          .filter(Boolean)
      );
      const prefixUnchanged = currentIds.every(
        (stepId, index) => !executedStepIds.has(stepId) || requestedIds[index] === stepId
      );
      if (!prefixUnchanged) {
        return null;
      }
      const stepById = new Map(steps.map((step) => [safeString(step?.id), step]));
      const saved = saveExecution({
        ...execution,
        plan: {
          ...execution.plan,
          steps: requestedIds.map((stepId) => stepById.get(stepId)),
        },
      });
      if (!saved) {
        return null;
      }
      this.appendTimelineEvent(id, {
        status: "plan_edited",
        humanSummary: "已调整计划顺序",
        canRetry: false,
        canUndo: false,
        developer: { orderedStepIds: requestedIds },
      });
      return this.getExecution(id);
    },

    updateStatus(id, status, patch = {}) {
      const execution = this.getExecution(id);
      if (!execution) {
        return null;
      }
      return saveExecution({
        ...execution,
        ...patch,
        status: normalizeStatus(status, execution.status),
        drawerState: {
          ...execution.drawerState,
          ...(patch.drawerState || {}),
        },
      });
    },

    appendTimelineEvent(id, event = {}) {
      const execution = this.getExecution(id);
      if (!execution) {
        return null;
      }
      const nextEvent = sanitizeTimelineEvent(event, { clock, idFactory });
      if (!nextEvent) {
        return null;
      }
      saveExecution({
        ...execution,
        timeline: [...execution.timeline, nextEvent],
        updatedAt: clock(),
        drawerState: {
          ...execution.drawerState,
          line2: nextEvent.humanSummary || execution.drawerState.line2,
        },
      });
      return cloneJson(nextEvent);
    },

    clearCompleted() {
      const before = executions.length;
      executions = executions.filter((execution) => execution.status !== AssistantExecutionStatus.Completed);
      persist();
      return before - executions.length;
    },
  };
}
