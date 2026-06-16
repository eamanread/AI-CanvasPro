import { AssistantExecutionStatus } from "./assistantExecutionStore.js";

function safeString(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function actionIdFor(action = {}, stepId = "", index = 0) {
  return (
    safeString(action.id) ||
    safeString(action.actionId) ||
    `${safeString(stepId) || "step"}:action-${index + 1}`
  );
}

function actionLabel(action = {}) {
  return safeString(action.title || action.label || action.name || action.type) || "执行动作";
}

function actionHumanObject(action = {}) {
  const nodeType = generationActionNodeType(action);
  const actionType = safeString(action.type);
  if (nodeType === "ai-image") return "图片";
  if (nodeType === "ai-text") return "文本";
  if (nodeType === "ai-video") return "视频";
  if (actionType === "create_node") return "节点";
  if (actionType === "connect_nodes") return "连线";
  if (actionType === "asset_use" || actionType === "use_asset") return "资产";
  if (actionType === "run_prompt_preset_generation") return "预设提示词";
  return actionLabel(action);
}

function timelineSummary(action = {}, status = "") {
  const title = safeString(action.title || action.label || action.name);
  if (title) {
    if (status === "running") return `正在处理：${title}`;
    if (status === "completed") return `已完成：${title}`;
    if (status === "failed") return `执行失败：${title}`;
    return title;
  }
  const target = actionHumanObject(action);
  if (status === "running") return `正在${target === "连线" ? "连接" : `生成${target}`}`;
  if (status === "completed") return `已${target === "连线" ? "连接" : `生成${target}`}`;
  if (status === "failed") return `${target}执行失败`;
  return target;
}

function errorMessage(value) {
  if (Array.isArray(value)) {
    return value.map(errorMessage).filter(Boolean).join("; ");
  }
  return safeString(value?.message || value?.error || value);
}

function nodeIdsFromResult(result = {}) {
  return [
    ...safeArray(result.createdNodeIds),
    ...safeArray(result.updatedNodeIds),
    ...safeArray(result.queuedGenerationNodeIds),
    ...safeArray(result.startedGenerationNodeIds),
    ...safeArray(result.completedGenerationNodeIds),
    ...safeArray(result.failedGenerationNodeIds),
    ...safeArray(result.skippedVideoGenerationNodeIds),
  ].map(safeString).filter(Boolean);
}

function generationActionNodeType(action = {}) {
  const data = isPlainObject(action?.data) ? action.data : {};
  return safeString(action.nodeType || action.targetNodeType || data.nodeType || data.type || action.type);
}

function isVideoGenerationAction(action = {}) {
  const actionType = safeString(action.type);
  if (actionType !== "queue_generation_task" && actionType !== "run_prompt_preset_generation") {
    return false;
  }
  return generationActionNodeType(action) === "ai-video";
}

const UNDOABLE_ACTION_TYPES = new Set(["create_node", "connect_nodes"]);
const STRUCTURAL_REPLAY_TYPES = new Set([
  "create_node",
  "connect_nodes",
  "layout_nodes",
  "move_nodes",
  "create_group",
]);
const GENERATION_ACTION_TYPES = new Set(["queue_generation_task", "run_prompt_preset_generation"]);
const RESTORABLE_ACTION_TYPES = new Set([
  "update_node",
  "update_node_data",
  "set_node_prompt",
  "set_node_model",
  "rename_node",
]);
const POSITIONAL_ACTION_TYPES = new Set(["layout_nodes", "move_nodes"]);

function updateActionNodeId(action = {}) {
  return safeString(action.nodeId || action.id);
}

function inverseForActionResult(action = {}, result = {}, signatureFor = null, snapshot = null, priorPositions = null, positionFor = null) {
  const actionType = safeString(action.type);
  const ops = [];
  if (UNDOABLE_ACTION_TYPES.has(actionType)) {
    for (const nodeId of safeArray(result?.createdNodeIds).map(safeString).filter(Boolean)) {
      const op = { type: "remove_node", nodeId };
      if (typeof signatureFor === "function") {
        const signature = safeString(signatureFor(nodeId));
        if (signature) {
          op.signature = signature;
        }
      }
      ops.push(op);
    }
    for (const edgeId of safeArray(result?.createdEdgeIds).map(safeString).filter(Boolean)) {
      ops.push({ type: "remove_edge", edgeId });
    }
  }
  if (RESTORABLE_ACTION_TYPES.has(actionType) && isPlainObject(snapshot)) {
    const nodeId = updateActionNodeId(action);
    if (nodeId) {
      const op = {
        type: "restore_node",
        nodeId,
        name: safeString(snapshot.name),
        data: isPlainObject(snapshot.data) ? snapshot.data : {},
      };
      if (typeof signatureFor === "function") {
        const signature = safeString(signatureFor(nodeId));
        if (signature) {
          op.signature = signature;
        }
      }
      ops.push(op);
    }
  }
  if (POSITIONAL_ACTION_TYPES.has(actionType) && Array.isArray(priorPositions)) {
    for (const prior of priorPositions) {
      const nodeId = safeString(prior?.nodeId);
      const x = Number(prior?.x);
      const y = Number(prior?.y);
      if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const op = { type: "restore_node_position", nodeId, x, y };
      if (typeof positionFor === "function") {
        try {
          const post = positionFor(nodeId);
          const postX = Number(post?.x);
          const postY = Number(post?.y);
          if (Number.isFinite(postX) && Number.isFinite(postY)) {
            op.signature = JSON.stringify({ x: postX, y: postY });
          }
        } catch {
          // Position signature is best-effort; undo still works without conflict detection.
        }
      }
      ops.push(op);
    }
  }
  return ops.length ? { aiOwned: true, ops } : null;
}

// Step-by-step execution loses the in-batch alias map the executor builds, so
// the orchestrator keeps its own alias table across actions (mirrors the key
// list of remapLegacyActionReferences in assistantActionExecutor.js).
function collectNodeAliases(action = {}, result = {}, aliasMap) {
  const reported = isPlainObject(result?.actionNodeIdMap) ? result.actionNodeIdMap : {};
  for (const [alias, real] of Object.entries(reported)) {
    const key = safeString(alias);
    const value = safeString(real);
    if (key && value && key !== value) {
      aliasMap.set(key, value);
    }
  }
  const created = safeArray(result?.createdNodeIds).map(safeString).filter(Boolean);
  if (safeString(action.type) === "create_node" && created.length === 1) {
    for (const alias of [safeString(action.id), safeString(action.nodeId)]) {
      if (alias && alias !== created[0]) {
        aliasMap.set(alias, created[0]);
      }
    }
  }
}

function remapActionAliases(action = {}, aliasMap) {
  if (!aliasMap?.size || !isPlainObject(action)) {
    return action;
  }
  const clone = JSON.parse(JSON.stringify(action));
  const remap = (value) => {
    const key = safeString(value);
    return key && aliasMap.has(key) ? aliasMap.get(key) : value;
  };
  for (const key of ["nodeId", "targetNodeId", "from", "to", "source", "target"]) {
    if (clone[key] !== undefined) {
      clone[key] = remap(clone[key]);
    }
  }
  if (Array.isArray(clone.nodeIds)) {
    clone.nodeIds = clone.nodeIds.map(remap);
  }
  if (Array.isArray(clone.nodes)) {
    clone.nodes = clone.nodes.map(remap);
  }
  return clone;
}

function compilePlanActions(execution = {}) {
  const steps = safeArray(execution?.plan?.steps);
  const actionsByStep = isPlainObject(execution?.actionsByStep) ? execution.actionsByStep : {};
  const compiled = [];
  const stepOrder = steps.length ? steps : Object.keys(actionsByStep).map((id) => ({ id }));
  for (const step of stepOrder) {
    if (step?.enabled === false) {
      continue;
    }
    const stepId = safeString(step?.id);
    const actions = safeArray(actionsByStep[stepId]);
    actions.forEach((action, index) => {
      if (!isPlainObject(action) || action.enabled === false) {
        return;
      }
      compiled.push({
        stepId,
        stepTitle: safeString(step?.title || step?.name || stepId),
        dependsOn: safeArray(step?.dependsOn).map(safeString).filter(Boolean),
        action,
        actionId: actionIdFor(action, stepId, index),
        actionIndex: index,
      });
    });
  }
  return compiled;
}

function hasExecutableActionsByStep(actionsByStep = {}) {
  if (!isPlainObject(actionsByStep)) {
    return false;
  }
  return Object.values(actionsByStep).some((actions) => safeArray(actions).length > 0);
}

function actionIndexById(compiled = [], actionId = "") {
  const id = safeString(actionId);
  if (!id) {
    return -1;
  }
  return compiled.findIndex((item) => safeString(item.actionId) === id);
}

function dependencyMapFor(compiled = []) {
  const map = new Map();
  for (const item of compiled) {
    if (!map.has(item.stepId)) {
      map.set(item.stepId, new Set());
    }
    for (const dependency of safeArray(item.dependsOn)) {
      if (dependency) {
        map.get(item.stepId).add(dependency);
      }
    }
  }
  return map;
}

function hasDependencyEdges(dependencyMap = new Map()) {
  for (const dependencies of dependencyMap.values()) {
    if (dependencies.size > 0) {
      return true;
    }
  }
  return false;
}

function dependencyBlockerForStep(stepId = "", failedSteps = new Map(), dependencyMap = new Map(), seen = new Set()) {
  const id = safeString(stepId);
  if (!id || seen.has(id)) {
    return "";
  }
  seen.add(id);
  for (const dependency of dependencyMap.get(id) || []) {
    if (failedSteps.has(dependency)) {
      return dependency;
    }
    const transitive = dependencyBlockerForStep(dependency, failedSteps, dependencyMap, seen);
    if (transitive) {
      return transitive;
    }
  }
  return "";
}

export function createAssistantExecutionOrchestrator({
  executionStore,
  validateActions,
  executeActions,
  executionSyncClient = null,
  prepareQueuedExecution = null,
  applyInverseOps = null,
  nodeSignatureProvider = null,
  nodeSnapshotProvider = null,
  nodePositionProvider = null,
  now = () => Date.now(),
} = {}) {
  if (!executionStore || typeof executionStore.getExecution !== "function") {
    throw new TypeError("executionStore is required");
  }
  if (typeof validateActions !== "function") {
    throw new TypeError("validateActions is required");
  }
  if (typeof executeActions !== "function") {
    throw new TypeError("executeActions is required");
  }
  let activeExecutionId = "";
  const pauseRequests = new Set();
  const cancelRequests = new Set();

  async function syncTimeline(executionId, event) {
    if (typeof executionSyncClient?.appendTimelineEvent !== "function") {
      return;
    }
    try {
      await executionSyncClient.appendTimelineEvent(executionId, event);
    } catch {
      // Backend sync is best-effort; local execution state is authoritative for UI continuity.
    }
  }

  async function syncStatus(executionId, status, patch = {}) {
    if (typeof executionSyncClient?.updateExecutionStatus !== "function") {
      return;
    }
    try {
      await executionSyncClient.updateExecutionStatus(executionId, status, patch);
    } catch {
      // Keep executing locally even if backend status PATCH is temporarily unavailable.
    }
  }

  async function appendTimeline(executionId, event) {
    const stored = executionStore.appendTimelineEvent(executionId, event);
    if (stored) {
      await syncTimeline(executionId, stored);
    }
    return stored;
  }

  async function setExecutionStatus(executionId, status, patch = {}) {
    const stored = executionStore.updateStatus(executionId, status, patch);
    if (stored) {
      await syncStatus(executionId, status, patch);
    }
    return stored;
  }

  async function runNextQueuedExecution(options = {}) {
    if (typeof executionStore.snapshot !== "function") {
      return null;
    }
    const snapshot = executionStore.snapshot() || {};
    const next = safeArray(snapshot.queue)
      .find((execution) => execution?.drawerState?.queuePaused !== true);
    const nextId = safeString(next?.id);
    if (!nextId) {
      return null;
    }
    let runOptions = { ...options };
    const latest = executionStore.getExecution(nextId) || next;
    const requiresPrepare = latest.status === AssistantExecutionStatus.QueuedDraft;
    async function failPrepareClosed(message, kind = "prepare_failed") {
      const errorText = safeString(message) || "Queued prepare failed";
      await appendTimeline(nextId, {
        status: "prepare_failed",
        humanSummary: "Queued prepare failed",
        error: errorText,
        canRetry: true,
        canUndo: false,
        developer: {
          preparedFromQueue: true,
          prepareErrorKind: kind,
          prepareErrorMessage: errorText,
        },
      });
      const failed = await setExecutionStatus(nextId, AssistantExecutionStatus.Failed, {
        orchestratorState: {
          nextActionIndex: 0,
          pausedAtActionId: "",
          running: false,
        },
        drawerState: {
          ...(latest.drawerState || {}),
          visible: true,
          line1: latest.drawerState?.line1 || latest.title || "Queued execution",
          line2: errorText,
        },
      });
      activeExecutionId = "";
      return failed;
    }
    if (requiresPrepare && typeof prepareQueuedExecution !== "function") {
      return failPrepareClosed("Queued draft prepare is not configured", "missing_prepare_hook");
    }
    if (typeof prepareQueuedExecution === "function") {
      let prepared = null;
      try {
        prepared = await prepareQueuedExecution({
          execution: latest,
          executionId: nextId,
          context: options.context,
          agentMode: options.agentMode,
          videoAuthorized: options.videoAuthorized,
        });
      } catch (error) {
        const message = errorMessage(error) || "Queued prepare failed";
        return failPrepareClosed(message, "prepare_threw");
      }
      if (requiresPrepare && !isPlainObject(prepared)) {
        return failPrepareClosed("Queued draft prepare returned no plan or actions", "invalid_prepare_result");
      }
      if (isPlainObject(prepared)) {
        if (
          requiresPrepare &&
          !hasExecutableActionsByStep(prepared.actionsByStep)
        ) {
          return failPrepareClosed("Queued draft prepare returned no plan or actions", "missing_fresh_actions");
        }
        const hasContext = Object.prototype.hasOwnProperty.call(prepared, "context");
        const hasExecutionContext = Object.prototype.hasOwnProperty.call(prepared, "executionContext");
        if (hasContext || hasExecutionContext) {
          runOptions = {
            ...runOptions,
            context: hasContext ? prepared.context : prepared.executionContext,
          };
        }
        const {
          context: _preparedContext,
          executionContext: _preparedExecutionContext,
          ...preparedPatch
        } = prepared;
        if (Object.keys(preparedPatch).length > 0) {
          await setExecutionStatus(nextId, AssistantExecutionStatus.Queued, {
            ...preparedPatch,
            drawerState: {
              ...(latest.drawerState || {}),
              ...(preparedPatch.drawerState || {}),
            },
          });
          await appendTimeline(nextId, {
            status: "prepared",
            humanSummary: safeString(preparedPatch.humanSummary || preparedPatch.summary) || "Prepared from latest canvas",
            canRetry: false,
            canUndo: false,
            developer: { preparedFromQueue: true },
          });
        }
      }
    }
    activeExecutionId = "";
    return run(nextId, {
      ...runOptions,
      startActionIndex: 0,
    });
  }

  async function run(executionId, options = {}) {
    const id = safeString(executionId);
    if (!id) {
      throw new Error("Missing execution id");
    }
    if (activeExecutionId && activeExecutionId !== id) {
      throw new Error(`Execution already running: ${activeExecutionId}`);
    }
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    const compiled = compilePlanActions(execution);
    const dependencyMap = dependencyMapFor(compiled);
    const hasDependencies = hasDependencyEdges(dependencyMap);
    const total = compiled.length;
    const failedSteps = new Map();
    const blockedActions = [];
    const nodeAliasMap = new Map();
    let completed = Math.min(
      total,
      Math.max(0, Number(options.startActionIndex ?? execution?.orchestratorState?.nextActionIndex ?? 0) || 0)
    );
    activeExecutionId = id;
    try {
      await setExecutionStatus(id, AssistantExecutionStatus.Executing, {
        progress: { done: completed, total },
        orchestratorState: {
          nextActionIndex: completed,
          pausedAtActionId: "",
          running: true,
        },
        drawerState: {
          visible: true,
          line1: execution.drawerState?.line1 || execution.title,
          line2: total ? "准备执行" : "没有可执行动作",
        },
      });
      if (!total) {
        await setExecutionStatus(id, AssistantExecutionStatus.Completed, {
          progress: { done: 0, total: 0 },
          orchestratorState: { nextActionIndex: 0, pausedAtActionId: "", running: false },
          drawerState: { visible: true, line2: "没有可执行动作" },
        });
        return { status: AssistantExecutionStatus.Completed, actionCount: 0 };
      }
      for (let actionCursor = completed; actionCursor < compiled.length; actionCursor += 1) {
        const compiledItem = compiled[actionCursor];
        const item = { ...compiledItem, action: remapActionAliases(compiledItem.action, nodeAliasMap) };
        const blockedByStepId = dependencyBlockerForStep(item.stepId, failedSteps, dependencyMap);
        if (blockedByStepId) {
          const blockedBy = failedSteps.get(blockedByStepId) || {};
          const blockedSummary = `已暂停：${actionLabel(item.action)} 依赖失败步骤`;
          await appendTimeline(id, {
            stepId: item.stepId,
            actionId: item.actionId,
            status: "dependency_blocked",
            humanSummary: blockedSummary,
            canRetry: false,
            canUndo: false,
            developer: {
              actionJson: item.action,
              blockedByActionId: safeString(blockedBy.actionId),
              blockedByEventId: safeString(blockedBy.eventId),
              blockedByStepId,
            },
          });
          blockedActions.push({ ...item, actionCursor, blockedByStepId });
          continue;
        }
        const runningSummary = timelineSummary(item.action, "running");
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "running",
          humanSummary: runningSummary,
          developer: { actionJson: item.action },
        });
        await setExecutionStatus(id, AssistantExecutionStatus.Executing, {
          progress: { done: completed, total },
          orchestratorState: {
            nextActionIndex: actionCursor,
            pausedAtActionId: item.actionId,
            running: true,
          },
          drawerState: { visible: true, line2: runningSummary },
        });

        const actionStartedAt = now();
        const validation = await validateActions({
          actions: [item.action],
          executionId: id,
          stepId: item.stepId,
          actionId: item.actionId,
          eventId: options.eventId,
          agentMode: options.agentMode,
          videoAuthorized: options.videoAuthorized,
          context: options.context,
          matchedSkills: safeArray(execution.matchedSkills),
        });
        if (validation?.valid === false || validation?.success === false) {
          const message = errorMessage(validation?.errors) || errorMessage(validation) || "Action validation failed";
          const blockedBySkill = validation?.blockedBySkill === true;
          const failedEvent = await appendTimeline(id, {
            stepId: item.stepId,
            actionId: item.actionId,
            status: blockedBySkill ? "blocked_by_skill" : "failed",
            humanSummary: blockedBySkill
              ? `已被技能约束拦截：${actionLabel(item.action)}`
              : timelineSummary(item.action, "failed"),
            error: message,
            canRetry: !blockedBySkill,
            durationMs: Math.max(0, now() - actionStartedAt),
            developer: { actionJson: item.action, validation },
          });
          if (hasDependencies) {
            failedSteps.set(item.stepId, {
              actionId: item.actionId,
              eventId: failedEvent?.id,
              message,
            });
            continue;
          }
          await setExecutionStatus(id, AssistantExecutionStatus.Failed, {
            progress: { done: completed, total },
            orchestratorState: {
              nextActionIndex: actionCursor,
              pausedAtActionId: item.actionId,
              running: false,
            },
            drawerState: { visible: true, line2: message },
          });
          return { status: AssistantExecutionStatus.Failed, actionCount: completed, error: message };
        }

        const executableActions = safeArray(validation?.actions).length ? validation.actions : [item.action];
        let preActionSnapshot = null;
        if (
          RESTORABLE_ACTION_TYPES.has(safeString(item.action.type)) &&
          typeof nodeSnapshotProvider === "function"
        ) {
          try {
            const snapshot = nodeSnapshotProvider(updateActionNodeId(item.action));
            preActionSnapshot = isPlainObject(snapshot) ? snapshot : null;
          } catch {
            preActionSnapshot = null;
          }
        }
        let preActionPositions = null;
        if (
          POSITIONAL_ACTION_TYPES.has(safeString(item.action.type)) &&
          typeof nodePositionProvider === "function"
        ) {
          preActionPositions = [];
          for (const rawNodeId of safeArray(item.action.nodeIds).map(safeString).filter(Boolean)) {
            try {
              const position = nodePositionProvider(rawNodeId);
              const x = Number(position?.x);
              const y = Number(position?.y);
              if (Number.isFinite(x) && Number.isFinite(y)) {
                preActionPositions.push({ nodeId: rawNodeId, x, y });
              }
            } catch {
              // Skip nodes whose prior position cannot be read; they stay non-undoable.
            }
          }
        }
        let result;
        try {
          result = await executeActions({
            ...options,
            actions: executableActions,
            executionId: id,
            stepId: item.stepId,
            actionId: item.actionId,
          });
        } catch (error) {
          const message = errorMessage(error) || "Action execution failed";
          const failedEvent = await appendTimeline(id, {
            stepId: item.stepId,
            actionId: item.actionId,
            status: "failed",
            humanSummary: timelineSummary(item.action, "failed"),
            error: message,
            canRetry: true,
            durationMs: Math.max(0, now() - actionStartedAt),
            developer: { actionJson: item.action },
          });
          if (hasDependencies) {
            failedSteps.set(item.stepId, {
              actionId: item.actionId,
              eventId: failedEvent?.id,
              message,
            });
            continue;
          }
          await setExecutionStatus(id, AssistantExecutionStatus.Failed, {
            progress: { done: completed, total },
            orchestratorState: {
              nextActionIndex: actionCursor,
              pausedAtActionId: item.actionId,
              running: false,
            },
            drawerState: { visible: true, line2: message },
          });
          return { status: AssistantExecutionStatus.Failed, actionCount: completed, error: message };
        }

        completed += 1;
        collectNodeAliases(item.action, result, nodeAliasMap);
        const inverse = inverseForActionResult(
          item.action,
          result,
          nodeSignatureProvider,
          preActionSnapshot,
          preActionPositions,
          nodePositionProvider
        );
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "completed",
          humanSummary: timelineSummary(item.action, "completed"),
          createdNodeIds: safeArray(result?.createdNodeIds),
          updatedNodeIds: safeArray(result?.updatedNodeIds),
          queuedGenerationNodeIds: safeArray(result?.queuedGenerationNodeIds),
          startedGenerationNodeIds: safeArray(result?.startedGenerationNodeIds),
          completedGenerationNodeIds: safeArray(result?.completedGenerationNodeIds),
          failedGenerationNodeIds: safeArray(result?.failedGenerationNodeIds),
          nodeIds: nodeIdsFromResult(result),
          canRetry: true,
          canUndo: Boolean(inverse),
          ...(inverse ? { inverse } : {}),
          durationMs: Math.max(0, now() - actionStartedAt),
          target: {
            actionType: safeString(item.action.type),
            nodeType: generationActionNodeType(item.action) === safeString(item.action.type) ? "" : generationActionNodeType(item.action),
            nodeIds: nodeIdsFromResult(result),
            stepId: item.stepId,
          },
          developer: { actionJson: item.action, result },
        });
        if (cancelRequests.has(id)) {
          cancelRequests.delete(id);
          pauseRequests.delete(id);
          await appendTimeline(id, {
            status: "cancelled",
            humanSummary: "已取消当前任务",
            canRetry: false,
            canUndo: false,
            developer: { cancelledByUser: true },
          });
          await setExecutionStatus(id, AssistantExecutionStatus.Cancelled, {
            progress: { done: completed, total },
            orchestratorState: {
              nextActionIndex: completed,
              pausedAtActionId: "",
              running: false,
            },
            drawerState: { visible: true, line2: "已取消当前任务" },
          });
          return { status: AssistantExecutionStatus.Cancelled, actionCount: completed };
        }
        if (pauseRequests.has(id) && completed < total) {
          pauseRequests.delete(id);
          const nextAction = compiled[completed];
          await setExecutionStatus(id, AssistantExecutionStatus.Paused, {
            progress: { done: completed, total },
            orchestratorState: {
              nextActionIndex: completed,
              pausedAtActionId: safeString(nextAction?.actionId),
              running: false,
            },
            drawerState: { visible: true, line2: "已暂停" },
          });
          return { status: AssistantExecutionStatus.Paused, actionCount: completed };
        }
      }
      if (failedSteps.size) {
        const firstBlocked = blockedActions[0];
        const firstFailed = failedSteps.values().next().value || {};
        const hasBlockedActions = blockedActions.length > 0;
        const status = hasBlockedActions ? AssistantExecutionStatus.Paused : AssistantExecutionStatus.Failed;
        const line2 = hasBlockedActions
          ? `已暂停：${blockedActions.length} 个后续步骤依赖失败步骤`
          : (firstFailed.message || "Action execution failed");
        await setExecutionStatus(id, status, {
          progress: { done: completed, total },
          orchestratorState: {
            nextActionIndex: hasBlockedActions
              ? Math.max(0, Number(firstBlocked?.actionCursor ?? completed) || 0)
              : Math.min(total, Math.max(0, completed)),
            pausedAtActionId: hasBlockedActions ? safeString(firstBlocked?.actionId) : safeString(firstFailed.actionId),
            running: false,
          },
          drawerState: { visible: true, line2 },
        });
        return { status, actionCount: completed, blockedActionCount: blockedActions.length };
      }
      await setExecutionStatus(id, AssistantExecutionStatus.Completed, {
        progress: { done: completed, total },
        orchestratorState: {
          nextActionIndex: completed,
          pausedAtActionId: "",
          running: false,
        },
        drawerState: { visible: true, line2: "执行完成" },
      });
      const result = { status: AssistantExecutionStatus.Completed, actionCount: completed };
      await runNextQueuedExecution(options);
      return result;
    } finally {
      pauseRequests.delete(id);
      cancelRequests.delete(id);
      activeExecutionId = "";
    }
  }

  function pause(executionId) {
    const id = safeString(executionId || activeExecutionId);
    if (!id || activeExecutionId !== id) {
      return { status: "idle" };
    }
    pauseRequests.add(id);
    return { status: "pause_requested" };
  }

  function cancel(executionId) {
    const id = safeString(executionId || activeExecutionId);
    if (!id) {
      return { status: "idle" };
    }
    if (activeExecutionId === id) {
      cancelRequests.add(id);
      pauseRequests.delete(id);
      return { status: "cancel_requested" };
    }
    const execution = executionStore.getExecution(id);
    if (!execution) {
      return { status: "idle" };
    }
    const cancellableStatuses = new Set([
      AssistantExecutionStatus.Draft,
      AssistantExecutionStatus.Executing,
      AssistantExecutionStatus.WaitingConfirmation,
      AssistantExecutionStatus.WaitingVideoAuthorization,
      AssistantExecutionStatus.Paused,
      AssistantExecutionStatus.Failed,
    ]);
    if (!cancellableStatuses.has(execution.status)) {
      return { status: "idle" };
    }
    executionStore.appendTimelineEvent(id, {
      status: "cancelled",
      humanSummary: "已取消当前任务",
      canRetry: false,
      canUndo: false,
      developer: { cancelledByUser: true },
    });
    return executionStore.updateStatus(id, AssistantExecutionStatus.Cancelled, {
      progress: execution.progress,
      orchestratorState: {
        nextActionIndex: Math.max(
          0,
          Number(execution?.orchestratorState?.nextActionIndex ?? execution?.progress?.done ?? 0) || 0
        ),
        pausedAtActionId: "",
        running: false,
      },
      drawerState: { visible: true, line2: "已取消当前任务" },
    });
  }

  function resume(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    return run(id, {
      ...options,
      startActionIndex: execution?.orchestratorState?.nextActionIndex || 0,
    });
  }

  async function retry(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    const compiled = compilePlanActions(execution);
    const total = compiled.length;
    const requestedActionIndex = actionIndexById(compiled, options.actionId);
    const startActionIndex = requestedActionIndex >= 0 ? requestedActionIndex : Math.min(
      total,
      Math.max(0, Number(execution?.orchestratorState?.nextActionIndex ?? execution?.progress?.done ?? 0) || 0)
    );
    const retryAction = compiled[startActionIndex];
    if (retryAction && isVideoGenerationAction(retryAction.action) && options.videoAuthorized !== true) {
      const summary = "需要先授权视频生成";
      await appendTimeline(id, {
        stepId: retryAction.stepId,
        actionId: retryAction.actionId,
        status: "waiting_video_authorization",
        humanSummary: summary,
        canRetry: true,
        developer: { actionJson: retryAction.action },
      });
      await setExecutionStatus(id, AssistantExecutionStatus.WaitingVideoAuthorization, {
        progress: { done: startActionIndex, total },
        orchestratorState: {
          nextActionIndex: startActionIndex,
          pausedAtActionId: retryAction.actionId,
          running: false,
        },
        drawerState: { visible: true, line2: summary },
      });
      return {
        status: AssistantExecutionStatus.WaitingVideoAuthorization,
        actionCount: startActionIndex,
        requiresVideoAuthorization: true,
      };
    }
    return run(id, {
      ...options,
      startActionIndex,
    });
  }

  async function skip(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    const compiled = compilePlanActions(execution);
    const dependencyMap = dependencyMapFor(compiled);
    const hasDependencies = hasDependencyEdges(dependencyMap);
    const total = compiled.length;
    const requestedActionIndex = actionIndexById(compiled, options.actionId);
    const skipActionIndex = requestedActionIndex >= 0 ? requestedActionIndex : Math.min(
      total,
      Math.max(0, Number(execution?.orchestratorState?.nextActionIndex ?? execution?.progress?.done ?? 0) || 0)
    );
    const item = compiled[skipActionIndex];
    if (!item) {
      await setExecutionStatus(id, AssistantExecutionStatus.Completed, {
        progress: { done: total, total },
        orchestratorState: { nextActionIndex: total, pausedAtActionId: "", running: false },
        drawerState: { visible: true, line2: "执行完成" },
      });
      return { status: AssistantExecutionStatus.Completed, actionCount: total };
    }

    const done = Math.min(total, skipActionIndex + 1);
    const isComplete = done >= total;
    const nextAction = compiled[done];
    const skippedEvent = await appendTimeline(id, {
      stepId: item.stepId,
      actionId: item.actionId,
      status: "skipped",
      humanSummary: `已跳过：${actionLabel(item.action)}`,
      canRetry: true,
      canUndo: false,
      durationMs: 0,
      developer: {
        skippedFromEventId: safeString(options.eventId),
        actionJson: item.action,
      },
    });
    if (hasDependencies) {
      const skippedSteps = new Map([
        [
          item.stepId,
          {
            actionId: item.actionId,
            eventId: skippedEvent?.id,
          },
        ],
      ]);
      const blockedActions = [];
      for (let actionCursor = done; actionCursor < compiled.length; actionCursor += 1) {
        const candidate = compiled[actionCursor];
        const blockedByStepId = dependencyBlockerForStep(candidate.stepId, skippedSteps, dependencyMap);
        if (!blockedByStepId) {
          continue;
        }
        const blockedBy = skippedSteps.get(blockedByStepId) || {};
        const blockedSummary = `已暂停：${actionLabel(candidate.action)} 依赖跳过步骤`;
        await appendTimeline(id, {
          stepId: candidate.stepId,
          actionId: candidate.actionId,
          status: "dependency_blocked",
          humanSummary: blockedSummary,
          canRetry: false,
          canUndo: false,
          developer: {
            actionJson: candidate.action,
            blockedByActionId: safeString(blockedBy.actionId),
            blockedByEventId: safeString(blockedBy.eventId),
            blockedByStepId,
          },
        });
        blockedActions.push({ ...candidate, actionCursor, blockedByStepId });
      }
      if (blockedActions.length) {
        const firstBlocked = blockedActions[0];
        await setExecutionStatus(id, AssistantExecutionStatus.Paused, {
          progress: { done, total },
          orchestratorState: {
            nextActionIndex: Math.max(0, Number(firstBlocked.actionCursor) || 0),
            pausedAtActionId: safeString(firstBlocked.actionId),
            running: false,
          },
          drawerState: {
            visible: true,
            line2: `已暂停：${blockedActions.length} 个后续步骤依赖跳过步骤`,
          },
        });
        return {
          status: AssistantExecutionStatus.Paused,
          actionCount: total,
          blockedActionCount: blockedActions.length,
        };
      }
    }
    const status = isComplete ? AssistantExecutionStatus.Completed : AssistantExecutionStatus.Paused;
    await setExecutionStatus(id, status, {
      progress: { done, total },
      orchestratorState: {
        nextActionIndex: done,
        pausedAtActionId: isComplete ? "" : safeString(nextAction?.actionId),
        running: false,
      },
      drawerState: { visible: true, line2: isComplete ? "执行完成" : "已跳过当前步骤" },
    });
    return { status, actionCount: total };
  }

  async function undo(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "undo_unavailable", reason: "execution_running" };
    }
    const eventId = safeString(options.eventId);
    const events = safeArray(execution.timeline);
    const sourceEvent = events.find((event) => safeString(event?.id) === eventId) || null;
    const ops = safeArray(sourceEvent?.inverse?.ops);
    if (!sourceEvent || sourceEvent.canUndo !== true || !ops.length) {
      return { status: "undo_unavailable", reason: "missing_inverse" };
    }
    const alreadyUndone = events.some(
      (event) =>
        safeString(event?.status) === "undone" &&
        safeString(event?.developer?.undoneFromEventId) === eventId
    );
    if (alreadyUndone) {
      return { status: "undo_unavailable", reason: "already_undone" };
    }
    if (typeof applyInverseOps !== "function") {
      return { status: "undo_unavailable", reason: "missing_undo_hook" };
    }
    let applied;
    try {
      applied = await applyInverseOps({
        executionId: id,
        eventId,
        ops,
        aiOwned: sourceEvent.inverse?.aiOwned === true,
      });
    } catch (error) {
      const message = errorMessage(error) || "Undo failed";
      await appendTimeline(id, {
        stepId: sourceEvent.stepId,
        actionId: sourceEvent.actionId,
        status: "undo_failed",
        humanSummary: "撤销失败",
        error: message,
        canRetry: false,
        canUndo: false,
        developer: { undoneFromEventId: eventId, undoErrorMessage: message },
      });
      return { status: "undo_failed", error: message };
    }
    const removedNodeIds = safeArray(applied?.removedNodeIds).map(safeString).filter(Boolean);
    const removedEdgeIds = safeArray(applied?.removedEdgeIds).map(safeString).filter(Boolean);
    const restoredNodeIds = safeArray(applied?.restoredNodeIds).map(safeString).filter(Boolean);
    const conflicts = safeArray(applied?.conflicts);
    if (!removedNodeIds.length && !removedEdgeIds.length && !restoredNodeIds.length) {
      await appendTimeline(id, {
        stepId: sourceEvent.stepId,
        actionId: sourceEvent.actionId,
        status: "undo_conflict",
        humanSummary: "撤销冲突：内容已被修改，已保留当前画布",
        canRetry: false,
        canUndo: false,
        developer: { undoneFromEventId: eventId, conflicts },
      });
      return { status: "undo_conflict", conflicts };
    }
    const undoneLabel = actionLabel(sourceEvent?.developer?.actionJson || {});
    await appendTimeline(id, {
      stepId: sourceEvent.stepId,
      actionId: sourceEvent.actionId,
      status: "undone",
      humanSummary: `已撤销：${undoneLabel}`,
      nodeIds: [...removedNodeIds, ...removedEdgeIds, ...restoredNodeIds],
      canRetry: false,
      canUndo: false,
      developer: { undoneFromEventId: eventId, removedNodeIds, removedEdgeIds, restoredNodeIds, conflicts },
    });
    await setExecutionStatus(id, execution.status, {
      drawerState: {
        ...execution.drawerState,
        visible: true,
        line2: `已撤销：${undoneLabel}`,
      },
    });
    return { status: "undone", removedNodeIds, removedEdgeIds, restoredNodeIds, conflicts };
  }

  async function undoTo(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "undo_unavailable", reason: "execution_running" };
    }
    const eventId = safeString(options.eventId);
    const events = safeArray(execution.timeline);
    const selectedIndex = events.findIndex((event) => safeString(event?.id) === eventId);
    if (selectedIndex < 0) {
      return { status: "undo_unavailable", reason: "missing_inverse" };
    }
    const undoneFromIds = new Set(
      events
        .filter((event) => safeString(event?.status) === "undone")
        .map((event) => safeString(event?.developer?.undoneFromEventId))
        .filter(Boolean)
    );
    const targets = events
      .slice(selectedIndex)
      .filter(
        (event) =>
          event?.canUndo === true &&
          safeArray(event?.inverse?.ops).length &&
          !undoneFromIds.has(safeString(event?.id))
      )
      .map((event) => safeString(event?.id))
      .reverse();
    if (!targets.length) {
      return { status: "undo_unavailable", reason: "missing_inverse" };
    }
    const results = [];
    let undoneCount = 0;
    let conflictCount = 0;
    for (const targetEventId of targets) {
      const result = await undo(id, { eventId: targetEventId });
      results.push({ eventId: targetEventId, ...result });
      if (result.status === "undone") {
        undoneCount += 1;
      } else if (result.status === "undo_conflict") {
        conflictCount += 1;
      } else if (result.status === "undo_failed") {
        break;
      }
    }
    const status = undoneCount > 0 ? "undone" : conflictCount > 0 ? "undo_conflict" : "undo_unavailable";
    return { status, undoneCount, conflictCount, results };
  }

  async function replay(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "replay_unavailable", reason: "execution_running" };
    }
    const compiled = compilePlanActions(execution);
    let replayedCount = 0;
    let skippedGenerationCount = 0;
    const nodeAliasMap = new Map();
    for (const compiledItem of compiled) {
      const item = { ...compiledItem, action: remapActionAliases(compiledItem.action, nodeAliasMap) };
      const actionType = safeString(item.action.type);
      if (GENERATION_ACTION_TYPES.has(actionType)) {
        skippedGenerationCount += 1;
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "replay_skipped_generation",
          humanSummary: `回放跳过生成步骤：${actionLabel(item.action)}`,
          canRetry: false,
          canUndo: false,
          developer: { actionJson: item.action, replay: true },
        });
        continue;
      }
      if (!STRUCTURAL_REPLAY_TYPES.has(actionType)) {
        continue;
      }
      const actionStartedAt = now();
      let result;
      try {
        result = await executeActions({
          ...options,
          actions: [item.action],
          executionId: id,
          stepId: item.stepId,
          actionId: item.actionId,
        });
      } catch (error) {
        await appendTimeline(id, {
          stepId: item.stepId,
          actionId: item.actionId,
          status: "failed",
          humanSummary: `回放失败：${actionLabel(item.action)}`,
          error: errorMessage(error) || "Replay failed",
          canRetry: false,
          canUndo: false,
          durationMs: Math.max(0, now() - actionStartedAt),
          developer: { actionJson: item.action, replay: true },
        });
        return { status: "replay_failed", replayedCount, skippedGenerationCount };
      }
      replayedCount += 1;
      collectNodeAliases(item.action, result, nodeAliasMap);
      const inverse = inverseForActionResult(item.action, result, nodeSignatureProvider, null, null, nodePositionProvider);
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "replayed",
        humanSummary: `已回放：${actionLabel(item.action)}`,
        nodeIds: nodeIdsFromResult(result),
        canRetry: false,
        canUndo: Boolean(inverse),
        ...(inverse ? { inverse } : {}),
        durationMs: Math.max(0, now() - actionStartedAt),
        developer: { actionJson: item.action, result, replay: true },
      });
    }
    await setExecutionStatus(id, execution.status, {
      drawerState: { ...execution.drawerState, visible: true, line2: `已回放 ${replayedCount} 步结构动作` },
    });
    return { status: "replayed", replayedCount, skippedGenerationCount };
  }

  async function regenerateStep(executionId, options = {}) {
    const id = safeString(executionId);
    const execution = executionStore.getExecution(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    if (activeExecutionId === id) {
      return { status: "regenerate_unavailable", reason: "execution_running" };
    }
    const compiled = compilePlanActions(execution);
    const index = actionIndexById(compiled, options.actionId);
    const item = compiled[index];
    if (!item) {
      return { status: "regenerate_unavailable", reason: "missing_action" };
    }
    if (isVideoGenerationAction(item.action) && options.videoAuthorized !== true) {
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "waiting_video_authorization",
        humanSummary: "需要先授权视频生成",
        canRetry: true,
        canUndo: false,
        developer: { actionJson: item.action, regenerate: true },
      });
      return { status: "waiting_video_authorization", requiresVideoAuthorization: true };
    }
    const actionStartedAt = now();
    let result;
    try {
      result = await executeActions({
        ...options,
        actions: [item.action],
        executionId: id,
        stepId: item.stepId,
        actionId: item.actionId,
      });
    } catch (error) {
      await appendTimeline(id, {
        stepId: item.stepId,
        actionId: item.actionId,
        status: "failed",
        humanSummary: timelineSummary(item.action, "failed"),
        error: errorMessage(error) || "Regenerate failed",
        canRetry: true,
        canUndo: false,
        durationMs: Math.max(0, now() - actionStartedAt),
        developer: { actionJson: item.action, regenerate: true, regeneratedFromEventId: safeString(options.eventId) },
      });
      return { status: "regenerate_failed" };
    }
    await appendTimeline(id, {
      stepId: item.stepId,
      actionId: item.actionId,
      status: "completed",
      humanSummary: timelineSummary(item.action, "completed"),
      nodeIds: nodeIdsFromResult(result),
      canRetry: true,
      canUndo: false,
      durationMs: Math.max(0, now() - actionStartedAt),
      developer: { actionJson: item.action, result, regenerate: true, regeneratedFromEventId: safeString(options.eventId) },
    });
    return { status: "regenerated" };
  }

  return {
    cancel,
    pause,
    regenerateStep,
    replay,
    retry,
    resume,
    run,
    skip,
    undo,
    undoTo,
  };
}
