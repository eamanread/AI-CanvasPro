const NODE_GENERATION_ACTIONS = new Set([
  "create_node",
  "add_node",
  "generate_node",
  "queue_node_generation",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function actionType(action) {
  return text(action?.type || action?.action || action?.kind).toLowerCase();
}

function actionNode(action) {
  return action?.node || action?.payload?.node || action?.data?.node || action?.params?.node || null;
}

function actionNodeId(action, index) {
  const node = actionNode(action);
  return text(node?.id || action?.nodeId || action?.targetNodeId || action?.id || `action_${index}`);
}

function actionNodeType(action, graphStore) {
  const node = actionNode(action);
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const directType = text(
    node?.type ||
      node?.nodeType ||
      action?.nodeType ||
      action?.targetType ||
      data.nodeType ||
      data.type
  ).toLowerCase();
  if (directType) {
    return directType;
  }
  const nodeId = text(action?.nodeId || action?.targetNodeId || node?.id);
  const graphNode = nodeId
    ? typeof graphStore?.getNode === "function"
      ? graphStore.getNode(nodeId)
      : graphStore?.nodes?.find?.((item) => text(item?.id) === nodeId)
    : null;
  const nodeData = graphNode?.data && typeof graphNode.data === "object" ? graphNode.data : {};
  return text(graphNode?.type || graphNode?.nodeType || nodeData.type || nodeData.nodeType).toLowerCase();
}

function isNodeGenerationAction(action) {
  const type = actionType(action);
  if (NODE_GENERATION_ACTIONS.has(type)) {
    return true;
  }
  if (type === "queue_generation_task" || type === "run_prompt_preset_generation") {
    return true;
  }
  if (type.includes("create") && type.includes("node")) {
    return true;
  }
  if (type.includes("generate") && type.includes("node")) {
    return true;
  }
  return false;
}

function isVideoType(type) {
  const value = text(type).toLowerCase();
  return value === "video" || value === "video_node" || value === "generated_video" || value === "ai-video";
}

function isVideoGenerationTask(action, graphStore) {
  const type = actionType(action);
  if (type !== "queue_generation_task" && type !== "run_prompt_preset_generation") {
    return false;
  }
  return isVideoType(actionNodeType(action, graphStore));
}

function createCardId() {
  return `card_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cardTitle(analysis) {
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) {
    return `将生成 ${generatedNodeCount} 个节点`;
  }
  if (generatedNodeCount === 1 && analysis?.includesVideoGeneration) {
    return "将生成 1 个视频节点";
  }
  if (generatedNodeCount === 1) {
    return "将生成 1 个节点";
  }
  return "将执行画布操作";
}

function cardSummary(analysis) {
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) {
    return "多节点生成需要确认后提交。";
  }
  if (generatedNodeCount === 1 && analysis?.includesVideoGeneration) {
    return "视频节点生成需要确认后提交。";
  }
  if (generatedNodeCount === 1) {
    return "普通单节点将自动提交。";
  }
  return "画布交互状态会在这里更新。";
}

export function analyzeAssistantActionBatch(actions, { graphStore } = {}) {
  const generatedNodeIds = new Set();
  let includesVideoGeneration = false;
  let includesVideoGenerationTask = false;

  asArray(actions).forEach((action, index) => {
    if (!isNodeGenerationAction(action)) {
      return;
    }
    generatedNodeIds.add(actionNodeId(action, index));
    if (isVideoType(actionNodeType(action, graphStore))) {
      includesVideoGeneration = true;
    }
    if (isVideoGenerationTask(action, graphStore)) {
      includesVideoGenerationTask = true;
    }
  });

  return {
    actionCount: asArray(actions).length,
    generatedNodeCount: generatedNodeIds.size,
    generatedNodeIds: Array.from(generatedNodeIds),
    includesVideoGeneration,
    includesVideoGenerationTask,
  };
}

export function shouldRequireCardConfirmation(analysis, { agentMode } = {}) {
  if (analysis?.includesVideoGenerationTask) {
    return true;
  }
  if (agentMode === "act") {
    return false;
  }
  const generatedNodeCount = Number(analysis?.generatedNodeCount || 0);
  if (generatedNodeCount > 1) {
    return true;
  }
  return generatedNodeCount === 1 && Boolean(analysis?.includesVideoGeneration);
}

// Complete whitelist of statuses an interaction card may hold. This is a
// VERIFIED superset of every status the app already applies to cards — the 12
// legacy ones come from reading all 21 card-update sites in appAssistantPanel.js,
// the clarification-card creation sites, and the bounded canvasCardStatusForNodeIds
// output (failed/retryable/cancelled/paused/generating/preparing/completed). The
// last two are Phase D's living-contract-card additions. `idle/thinking/proposed/
// done` are message/transaction/job statuses and never land on a card.
// Do NOT shrink this set — removing one silently breaks a real card lane.
export const INTERACTION_CARD_STATUSES = new Set([
  "pending",
  "needs_confirmation",
  "needs_clarification",
  "running",
  "generating",
  "preparing",
  "paused",
  "retryable",
  "completed",
  "failed",
  "cancelled",
  "archived",
  // Phase D (action chips / living contract card):
  "needs_action",
  "preview",
]);

function assertCardStatus(status) {
  // Only an explicitly-provided status is checked; `undefined` means "leave as-is".
  if (status !== undefined && !INTERACTION_CARD_STATUSES.has(status)) {
    throw new Error(
      `[interactionCard] unknown status "${status}" — not in INTERACTION_CARD_STATUSES`
    );
  }
}

export function createInteractionCard({ actions = [], analysis, agentMode = "plan", id, status } = {}) {
  const normalizedAnalysis = analysis || analyzeAssistantActionBatch(actions);
  const normalizedMode = agentMode === "act" ? "act" : "plan";
  const requiresConfirmation = shouldRequireCardConfirmation(normalizedAnalysis, { agentMode: normalizedMode });
  assertCardStatus(status);
  const resolvedStatus = status || (requiresConfirmation ? "needs_confirmation" : "pending");
  return {
    id: id || createCardId(),
    type: "canvas_actions",
    status: resolvedStatus,
    title: cardTitle(normalizedAnalysis),
    summary: cardSummary(normalizedAnalysis),
    expanded: requiresConfirmation,
    requiresConfirmation,
    agentMode: normalizedMode,
    analysis: cloneJson(normalizedAnalysis),
    operation: {
      nodeIds: cloneJson(normalizedAnalysis.generatedNodeIds || []),
      status: requiresConfirmation ? "needs_confirmation" : "pending",
    },
    items: [],
    executionDetails: {
      traces: [],
      receipts: [],
      warnings: [],
    },
    actions: cloneJson(actions),
    result: null,
    error: "",
    // Phase D (D1) living-contract-card fields:
    options: [],        // LaunchChip[] — transient (provider re-supplies; not persisted)
    contract: null,     // ContractPreview | null — persisted with the message
    steps: [],          // [{stage,status}] — persisted; B3 on_step / poll driven
    pausedReason: "",   // "" | "wait-cast-edit" | "wait-film-confirm" | "wait-portraits-confirm"
  };
}

// A 成片 render is a background job, NOT a canvas_actions batch: it has its own
// lifecycle (running → completed | cancelled | failed) driven by the render lane,
// not by node generation state. A distinct `type` keeps refreshSyncedOperationCards
// (which only syncs canvas_actions cards off node state) from flipping its status
// when placeKeyframe marks the prep nodes "completed" mid-render. background:true
// marks it for the 吸附区 后台细条 (slice 3). Update via updateInteractionCardStatus
// — its statuses (running/completed/cancelled/failed) are all in the status set.
export function createVimaxRenderCard({ flowId, shotCount = 0, status = "running", jobId = "" } = {}) {
  assertCardStatus(status);
  const count = Number(shotCount);
  return {
    id: `vimax-render-${flowId}`,
    type: "vimax_render",
    status,
    background: true,
    title: "成片渲染",
    summary: "出图中…",
    flowId: flowId || "",
    shotCount: Number.isFinite(count) && count > 0 ? count : 0,
    landedCount: 0,
    jobId: jobId || "",
    result: null,
    error: "",
  };
}

export function updateInteractionCardStatus(card, patch = {}) {
  if (patch && Object.prototype.hasOwnProperty.call(patch, "status")) {
    assertCardStatus(patch.status);
  }
  return {
    ...cloneJson(card),
    ...cloneJson(patch),
  };
}

export function mergeExecutionDetails(card, result = {}) {
  const traces = asArray(result.skillTraces).length
    ? asArray(result.skillTraces)
    : asArray(result.skillTraceCards).map((trace) => ({
        skillId: trace.skillId || trace.title || trace.type || "skill_trace",
        status: trace.status || "success",
        summary: trace.summary || trace.detail || "",
      }));
  return updateInteractionCardStatus(card, {
    executionDetails: {
      traces: cloneJson(traces),
      receipts: cloneJson(asArray(result.canvasSkillReceipts)),
      warnings: cloneJson(asArray(result.warnings)),
    },
  });
}
