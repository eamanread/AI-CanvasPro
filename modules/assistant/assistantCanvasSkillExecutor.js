import {
  CANVAS_SKILL_IDS,
  actionNodeType,
  isAiNodeActionConvertible,
  isCanvasSkillActionCandidate,
  skillIdForAiAction,
} from "./assistantCanvasSkillRegistry.js";
import { mapAssistantNodeParameters } from "./assistantCanvasParameterMapper.js";
import { placeCreatedNodeBySpatialPolicy } from "./assistantActionExecutor.js";
import { bindAssistantCanvasReferences } from "./assistantCanvasReferenceBinder.js";
import { createSkillTraceCard } from "./canvasSkills/tracing/skillTraceCards.js";

function text(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function graphNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = state?.nodes;
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

function findNode(graphStore, nodeId) {
  const id = text(nodeId);
  return graphNodes(graphStore).find((node) => text(node?.id) === id);
}

function nodeData(node) {
  return node?.data && typeof node.data === "object" ? node.data : {};
}

function createEmptyResult() {
  return {
    success: true,
    appliedCount: 0,
    createdNodeIds: [],
    createdEdgeIds: [],
    updatedNodeIds: [],
    queuedGenerationNodeIds: [],
    startedGenerationNodeIds: [],
    completedGenerationNodeIds: [],
    failedGenerationNodeIds: [],
    skippedVideoGenerationNodeIds: [],
    generationTasks: [],
    canvasSkillReceipts: [],
    skillTraces: [],
    warnings: [],
    actionNodeIdMap: {},
  };
}

function pushUnique(target, values) {
  for (const value of safeArray(values).map(text).filter(Boolean)) {
    if (!target.includes(value)) target.push(value);
  }
}

function nodeDisplayName(action = {}, nodeType = "") {
  return text(action.name || action.title) || (nodeType === "ai-video" ? "Video" : nodeType === "ai-text" ? "Text" : "Image");
}

function actionType(action = {}) {
  return text(action.type || action.action || action.kind);
}

function isCreateActionType(type) {
  return type === "create_node" || type === "add_node";
}

function isGenerateActionType(type) {
  return (
    type === "queue_generation_task" ||
    type === "run_prompt_preset_generation" ||
    type === "generate_node" ||
    type === "queue_node_generation" ||
    type === "start_generation"
  );
}

function isWorkflowActionType(type) {
  return [
    "apply_workflow",
    "save_workflow",
    "update_workflow",
    CANVAS_SKILL_IDS.workflowApply,
    CANVAS_SKILL_IDS.workflowSave,
    CANVAS_SKILL_IDS.workflowUpdate,
  ].includes(type);
}

function workflowSkillIdForAction(type) {
  if (type === "apply_workflow" || type === CANVAS_SKILL_IDS.workflowApply) return CANVAS_SKILL_IDS.workflowApply;
  if (type === "save_workflow" || type === CANVAS_SKILL_IDS.workflowSave) return CANVAS_SKILL_IDS.workflowSave;
  if (type === "update_workflow" || type === CANVAS_SKILL_IDS.workflowUpdate) return CANVAS_SKILL_IDS.workflowUpdate;
  return `workflow.${type.split("_")[0]}`;
}

function resolveMappedNodeId(action, idMap) {
  const candidates = [
    action?.nodeId,
    action?.targetNodeId,
    action?.id,
    action?.data?.nodeId,
    action?.data?.id,
  ].map(text).filter(Boolean);
  for (const candidate of candidates) {
    if (idMap.has(candidate)) return idMap.get(candidate);
    return candidate;
  }
  return "";
}

function shouldAutoStartCreatedDraft(action, nodeId, generatedNodeIds, nodeType) {
  // The agent stamps autoStart=false on create actions when the user's
  // message forbids generation this turn — honor it deterministically.
  if (action?.autoStart === false || action?.data?.autoStart === false) return false;
  if (!text(nodeId) || generatedNodeIds.has(text(nodeId))) return false;
  if (nodeType !== "ai-image" && nodeType !== "ai-text") return false;
  const mapped = mapAssistantNodeParameters({ nodeType, action, existingData: {} });
  return text(action.prompt || action.template || mapped.patch.prompt);
}

function registerActionId(action, nodeId, idMap, result) {
  for (const key of [action?.id, action?.nodeId, action?.targetNodeId].map(text).filter(Boolean)) {
    idMap.set(key, nodeId);
    result.actionNodeIdMap[key] = nodeId;
  }
}

function videoBlocked({ nodeType, skillId, agentMode, videoAuthorized }) {
  return (
    (nodeType === "ai-video" || skillId === CANVAS_SKILL_IDS.videoGenerate) &&
    agentMode !== "act" &&
    videoAuthorized !== true
  );
}

function referencesFromAction(action = {}) {
  const data = action.data && typeof action.data === "object" ? action.data : {};
  return safeArray(action.references || data.references || action.assistantReferences || data.assistantReferences);
}

function traceFromReceipt(receipt = {}) {
  if (!receipt || typeof receipt !== "object") return null;
  const trace = {
    id: receipt.traceId || `trace_${receipt.skillId || "skill"}_${receipt.nodeId || Math.random().toString(36).slice(2, 8)}`,
    skillId: receipt.skillId,
    title: receipt.skillId,
    status: receipt.ok === false ? "failed" : "success",
    nodeId: receipt.nodeId,
    nodeType: receipt.nodeType,
    paramsSummary: receipt.paramsSummary || {},
    referencesSummary: receipt.referenceCount ? { total: receipt.referenceCount } : receipt.referencesSummary || {},
    warnings: Array.isArray(receipt.warnings) ? receipt.warnings : receipt.warning ? [receipt.warning] : [],
  };
  return trace;
}

function pushReceipt(result, receipt) {
  result.canvasSkillReceipts.push(receipt);
  const trace = traceFromReceipt(receipt);
  if (trace) result.skillTraces.push(trace);
}

async function maybeApplyPreset({ promptPresetAdapter, action, nodeId, warnings }) {
  if (!promptPresetAdapter) return null;
  const hasPreset = text(action.presetId || action.presetName || action.template) || action.inputs;
  if (!hasPreset) return null;
  const apply =
    typeof promptPresetAdapter.applyPromptPreset === "function"
      ? promptPresetAdapter.applyPromptPreset
      : typeof promptPresetAdapter.applyPromptPresetToPromptEl === "function"
        ? promptPresetAdapter.applyPromptPresetToPromptEl
        : typeof promptPresetAdapter === "function"
          ? promptPresetAdapter
          : null;
  if (!apply) return null;
  try {
    return await apply({ ...action, nodeId });
  } catch (error) {
    warnings.push(`prompt preset failed for ${nodeId}: ${error?.message || error}`);
    return null;
  }
}

export function createAssistantCanvasSkillExecutor({
  graphStore,
  nodeLifecycle,
  workflowSkills = {},
  assetSkills = {},
  promptPresetAdapter = null,
  modelRegistry = null,
} = {}) {
  async function createDraft(action, { idMap, result, actions = [], source = "" }) {
    const nodeType = actionNodeType(action, graphStore);
    const existingData = action.data && typeof action.data === "object" ? action.data : {};
    const mapped = mapAssistantNodeParameters({ nodeType, action, existingData, modelRegistry, trustedSource: source });
    const created = await nodeLifecycle?.createDraftNode?.({
      nodeType,
      name: nodeDisplayName(action, nodeType),
      patch: mapped.patch,
      width: action.size?.width || action.width,
      height: action.size?.height || action.height,
    });
    result.warnings.push(...mapped.warnings);
    if (!created?.ok || !created.nodeId) {
      const warning = created?.warning || `failed to create ${nodeType || "node"}`;
      result.success = false;
      result.warnings.push(warning);
      pushReceipt(result, {
        skillId: skillIdForAiAction(action, { graphStore }) || `${nodeType}.createDraft`,
        ok: false,
        warning,
      });
      return "";
    }
    const nodeId = text(created.nodeId);
    registerActionId(action, nodeId, idMap, result);
    result.createdNodeIds.push(nodeId);
    result.appliedCount += 1;
    // nodeFlows spawns drafts at the cursor; the spatial policy
    // (placement directive or magnetic default) owns the real drop
    // point - same contract as the legacy create path (CONTRACTS.md 9).
    const placementWarning = placeCreatedNodeBySpatialPolicy(graphStore, nodeId, action, { idMap, actions });
    if (placementWarning) result.warnings.push(placementWarning);
    const bound = bindAssistantCanvasReferences({ graphStore, targetNodeId: nodeId, references: referencesFromAction(action) });
    result.warnings.push(...bound.warnings);
    pushUnique(result.createdEdgeIds, bound.boundReferences.map((reference) => reference.edgeId).filter(Boolean));
    pushReceipt(result, {
      skillId: skillIdForAiAction(action, { graphStore }) || `${nodeType}.createDraft`,
      ok: true,
      nodeId,
      nodeType,
      paramsSummary: {
        promptPreview: text(mapped.patch.prompt).slice(0, 80),
        modelDisplayName: text(mapped.patch.modelName || mapped.patch.modelId),
        batchSize: mapped.patch.batchSize,
        aspectRatio: mapped.patch.aspectRatio,
      },
      referenceCount: bound.boundReferences.length,
      warnings: [...mapped.warnings, ...bound.warnings],
    });
    return nodeId;
  }

  async function updateDraft(action, { idMap, result, source = "" }) {
    const nodeId = resolveMappedNodeId(action, idMap);
    const node = findNode(graphStore, nodeId);
    const nodeType = actionNodeType(action, graphStore) || node?.type || node?.nodeType;
    const mapped = mapAssistantNodeParameters({ nodeType, action, existingData: nodeData(node), modelRegistry, trustedSource: source });
    result.warnings.push(...mapped.warnings);
    const updated = nodeLifecycle?.updateNode?.({ nodeId, patch: mapped.patch });
    if (!updated?.ok) {
      const warning = updated?.warning || `update target node not found: ${nodeId || "unknown"}`;
      result.warnings.push(warning);
      pushReceipt(result, { skillId: skillIdForAiAction(action, { graphStore }), ok: false, nodeId, nodeType, warning });
      return;
    }
    const bound = bindAssistantCanvasReferences({ graphStore, targetNodeId: nodeId, references: referencesFromAction(action) });
    result.warnings.push(...bound.warnings);
    pushUnique(result.createdEdgeIds, bound.boundReferences.map((reference) => reference.edgeId).filter(Boolean));
    result.updatedNodeIds.push(nodeId);
    result.appliedCount += 1;
    pushReceipt(result, {
      skillId: skillIdForAiAction(action, { graphStore }),
      ok: true,
      nodeId,
      nodeType,
      paramsSummary: {
        promptPreview: text(mapped.patch.prompt).slice(0, 80),
        modelDisplayName: text(mapped.patch.modelName || mapped.patch.modelId),
        batchSize: mapped.patch.batchSize,
        aspectRatio: mapped.patch.aspectRatio,
      },
      referenceCount: bound.boundReferences.length,
      warnings: [...mapped.warnings, ...bound.warnings],
    });
  }

  async function generateDraft(action, { idMap, result, agentMode, videoAuthorized, source = "" }) {
    const nodeId = resolveMappedNodeId(action, idMap);
    const node = findNode(graphStore, nodeId);
    const nodeType = actionNodeType(action, graphStore) || node?.type || node?.nodeType;
    const skillId = skillIdForAiAction({ ...action, nodeId, nodeType }, { graphStore }) || CANVAS_SKILL_IDS.nodeBindReferences;
    if (videoBlocked({ nodeType, skillId, agentMode, videoAuthorized })) {
      result.skippedVideoGenerationNodeIds.push(nodeId || text(action.nodeId || action.id));
      result.warnings.push("video generation requires confirmation: explicit confirmation required");
      result.appliedCount += 1;
      pushReceipt(result, { skillId, ok: false, nodeId, nodeType, skipped: true, warning: "video generation requires confirmation" });
      return;
    }
    if (!text(nodeId) || !node) {
      const missingId = text(nodeId || action.nodeId || action.id || "unknown");
      const warning = `generation target node not found: ${missingId}`;
      result.success = false;
      result.failedGenerationNodeIds.push(missingId);
      result.warnings.push(warning);
      pushReceipt(result, { skillId, ok: false, nodeId: missingId, nodeType, retryable: false, warning });
      return;
    }
    const mapped = mapAssistantNodeParameters({ nodeType, action, existingData: nodeData(node), modelRegistry, trustedSource: source });
    result.warnings.push(...mapped.warnings);
    if (Object.keys(mapped.patch).length && nodeLifecycle?.updateNode) {
      const updated = nodeLifecycle.updateNode({ nodeId, patch: mapped.patch });
      if (updated?.ok) pushUnique(result.updatedNodeIds, [nodeId]);
    }
    await maybeApplyPreset({ promptPresetAdapter, action, nodeId, warnings: result.warnings });
    const prompt = text(action.prompt || action.template || mapped.patch.prompt || nodeData(node).prompt);
    const generation = await nodeLifecycle?.generateNode?.({ nodeId, prompt, task: { ...action, nodeId, nodeType } });
    if (generation?.started !== false) {
      result.queuedGenerationNodeIds.push(nodeId);
      result.startedGenerationNodeIds.push(nodeId);
    } else {
      const warning = generation?.warning || generation?.message || generation?.reason || `generation did not start for ${nodeId}`;
      result.warnings.push(warning);
      pushUnique(result.failedGenerationNodeIds, [nodeId]);
      if (generation?.retryable !== true) {
        result.success = false;
      }
    }
    result.appliedCount += 1;
    pushReceipt(result, {
      skillId,
      ok: generation?.started !== false,
      nodeId,
      nodeType,
      paramsSummary: {
        promptPreview: prompt.slice(0, 80),
        modelDisplayName: text(mapped.patch.modelName || mapped.patch.modelId || nodeData(node).modelName || nodeData(node).modelId),
        batchSize: mapped.patch.batchSize || nodeData(node).batchSize,
        aspectRatio: mapped.patch.aspectRatio || nodeData(node).aspectRatio,
      },
      retryable: generation?.retryable === true,
      warning: generation?.warning,
    });
  }

  async function executeWorkflow(action, result) {
    let receipt = null;
    const type = actionType(action);
    if (type === "apply_workflow" || type === CANVAS_SKILL_IDS.workflowApply) {
      receipt = await workflowSkills.applyWorkflow?.(action);
      pushUnique(result.createdNodeIds, receipt?.createdNodeIds);
      pushUnique(result.createdEdgeIds, receipt?.createdEdgeIds);
    } else if (type === "save_workflow" || type === CANVAS_SKILL_IDS.workflowSave) {
      receipt = await workflowSkills.saveWorkflow?.(action);
    } else if (type === "update_workflow" || type === CANVAS_SKILL_IDS.workflowUpdate) {
      receipt = await workflowSkills.updateWorkflow?.(action);
    }
    if (!receipt) {
      receipt = { warning: `workflow skill unavailable: ${workflowSkillIdForAction(type)}` };
    }
    if (receipt?.warning) result.warnings.push(receipt.warning);
    pushReceipt(result, { skillId: workflowSkillIdForAction(type), ok: !receipt?.warning, ...receipt });
    result.appliedCount += receipt ? 1 : 0;
  }

  async function executeAsset(action, result) {
    let receipt = null;
    if (action.type === "list_assets") receipt = await assetSkills.listAssets?.(action);
    if (action.type === "use_asset") receipt = await assetSkills.useAsset?.(action);
    if (action.type === "save_asset" || action.type === "add_asset") receipt = await assetSkills.addAsset?.(action);
    if (receipt?.warning) result.warnings.push(receipt.warning);
    pushReceipt(result, { skillId: action.type === "list_assets" ? CANVAS_SKILL_IDS.assetList : action.type === "use_asset" ? CANVAS_SKILL_IDS.assetUse : CANVAS_SKILL_IDS.assetAdd, ok: !receipt?.warning, ...receipt });
    result.appliedCount += receipt ? 1 : 0;
  }

  // `source` is the trusted-writer execution option (e.g.
  // "qmai-director"): set by code at the call site, never derived from
  // the actions themselves - see schemaValidator trustedSources.
  async function executeActions({ actions = [], agentMode = "plan", videoAuthorized = false, source = "" } = {}) {
    const result = createEmptyResult();
    const idMap = new Map();
    const generatedNodeIds = new Set();
    for (const node of graphNodes(graphStore)) {
      const id = text(node?.id);
      if (id) idMap.set(id, id);
    }

    const normalizedActions = safeArray(actions);
    for (const action of normalizedActions) {
      if (!action || typeof action !== "object") continue;
      if (isAiNodeActionConvertible(action, { graphStore })) {
        const type = actionType(action);
        if (isCreateActionType(type)) {
          await createDraft(action, { idMap, result, actions: normalizedActions, source });
        } else if (isGenerateActionType(type)) {
          await generateDraft(action, { idMap, result, agentMode, videoAuthorized, source });
          const generatedNodeId = resolveMappedNodeId(action, idMap);
          if (generatedNodeId) generatedNodeIds.add(generatedNodeId);
        } else {
          await updateDraft(action, { idMap, result, source });
        }
        continue;
      }
      if (isWorkflowActionType(actionType(action))) {
        await executeWorkflow(action, result);
        continue;
      }
      if (["list_assets", "use_asset", "save_asset", "add_asset"].includes(action.type)) {
        await executeAsset(action, result);
      }
    }

    for (const action of normalizedActions) {
      if (!action || typeof action !== "object") continue;
      const type = actionType(action);
      if (!isCreateActionType(type)) continue;
      const nodeId = resolveMappedNodeId(action, idMap);
      const node = findNode(graphStore, nodeId);
      const nodeType = actionNodeType(action, graphStore) || node?.type || node?.nodeType;
      if (!shouldAutoStartCreatedDraft(action, nodeId, generatedNodeIds, nodeType)) continue;
      await generateDraft(
        {
          ...action,
          type: "queue_generation_task",
          nodeId,
          nodeType,
        },
        { idMap, result, agentMode, videoAuthorized, source }
      );
      if (nodeId) generatedNodeIds.add(nodeId);
    }

    result.skillTraceCards = result.skillTraces.map(createSkillTraceCard);
    return result;
  }

  return { executeActions };
}
