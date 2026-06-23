import { CANVAS_SKILLS_MANIFEST, CANVAS_SKILL_IDS } from "./manifest.js";

const AI_NODE_TYPES = new Set(["ai-image", "ai-text", "ai-video"]);
const CONVERTIBLE_ACTION_TYPES = new Set([
  "add_node",
  "create_node",
  "update_node",
  "update_node_data",
  "set_node_prompt",
  "set_node_model",
  "generate_node",
  "queue_generation_task",
  "queue_node_generation",
  "run_prompt_preset_generation",
  "start_generation",
]);
const GENERATION_ACTION_TYPES = new Set([
  "generate_node",
  "queue_generation_task",
  "queue_node_generation",
  "run_prompt_preset_generation",
  "start_generation",
]);
const GENERATION_SKILLS = new Set([
  CANVAS_SKILL_IDS.imageGenerate,
  CANVAS_SKILL_IDS.textGenerate,
  CANVAS_SKILL_IDS.videoGenerate,
]);
const VIDEO_CONFIRMATION_SKILLS = new Set([
  CANVAS_SKILL_IDS.videoApplyPreset,
  CANVAS_SKILL_IDS.videoGenerate,
]);
const ASSET_V2_SKILL_IDS = new Set(["asset_usage", "asset_bind"]);

function text(value) {
  return String(value ?? "").trim();
}

function graphNodes(graphStore) {
  const state = typeof graphStore?.getState === "function" ? graphStore.getState() : graphStore;
  const nodes = state?.nodes || graphStore?.nodes;
  if (Array.isArray(nodes)) return nodes;
  if (nodes instanceof Map) return Array.from(nodes.values());
  if (nodes && typeof nodes === "object") return Object.values(nodes);
  return [];
}

export function actionNodeType(action = {}, graphStore = null) {
  const data = action.data && typeof action.data === "object" ? action.data : {};
  const explicit = text(action.nodeType || action.targetType || data.nodeType || data.type);
  if (explicit) return explicit;
  const nodeId = text(action.nodeId || action.targetNodeId || action.id);
  const node = nodeId
    ? graphNodes(graphStore).find((item) => text(item?.id) === nodeId) || graphStore?.getNode?.(nodeId)
    : null;
  const nodeData = node?.data && typeof node.data === "object" ? node.data : {};
  return text(node?.type || node?.nodeType || nodeData.type || nodeData.nodeType);
}

export function isAiNodeType(nodeType) {
  return AI_NODE_TYPES.has(text(nodeType));
}

export function isAiNodeActionConvertible(action = {}, { graphStore } = {}) {
  const type = text(action.type || action.action || action.kind);
  if (!CONVERTIBLE_ACTION_TYPES.has(type)) return false;
  const nodeType = actionNodeType(action, graphStore);
  return isAiNodeType(nodeType) || (GENERATION_ACTION_TYPES.has(type) && !nodeType);
}

export function nodeTypeToSkillPrefix(nodeType) {
  if (text(nodeType) === "ai-image") return "imageNode";
  if (text(nodeType) === "ai-text") return "textNode";
  if (text(nodeType) === "ai-video") return "videoNode";
  return "";
}

export function skillIdForAiAction(action = {}, { graphStore } = {}) {
  const type = text(action.type || action.action || action.kind);
  const prefix = nodeTypeToSkillPrefix(actionNodeType(action, graphStore));
  if (!prefix) return "";
  if (type === "create_node" || type === "add_node") return `${prefix}.createDraft`;
  if (["update_node", "update_node_data", "set_node_prompt", "set_node_model"].includes(type)) return `${prefix}.update`;
  if (type === "run_prompt_preset_generation") return `${prefix}.applyPreset`;
  if (GENERATION_ACTION_TYPES.has(type)) return `${prefix}.generate`;
  return "";
}

export function isCanvasSkillActionCandidate(action = {}, options = {}) {
  const type = text(action.type || action.action || action.kind);
  if (GENERATION_ACTION_TYPES.has(type)) {
    const nodeType = actionNodeType(action, options.graphStore);
    return !nodeType || isAiNodeType(nodeType);
  }
  return Boolean(skillIdForAiAction(action, options));
}

export function createCanvasSkillRegistry(manifest = CANVAS_SKILLS_MANIFEST) {
  const byId = new Map((manifest?.skills || []).map((skill) => [skill.id, { ...skill }]));
  return {
    list: () => Array.from(byId.values()).map((skill) => ({ ...skill })),
    get: (id) => (byId.has(text(id)) ? { ...byId.get(text(id)) } : null),
    has: (id) => byId.has(text(id)),
  };
}

export function findCanvasSkill(skillId, manifest = CANVAS_SKILLS_MANIFEST) {
  return createCanvasSkillRegistry(manifest).get(skillId);
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function actionTypeFromOptions(options = {}) {
  return text(
    options.actionType ||
      options.type ||
      options.action?.type ||
      options.action?.action ||
      options.action?.kind
  );
}

function actionTypesForV2Skill(skill = {}, options = {}) {
  const requested = actionTypeFromOptions(options);
  const allowed = Array.isArray(skill.allowedActions)
    ? skill.allowedActions.map(text).filter(Boolean)
    : [];
  if (requested) {
    return allowed.length && !allowed.includes(requested) ? [] : [requested];
  }
  return allowed;
}

function nodeTypeFromOptions(options = {}) {
  return text(options.nodeType || options.targetType) || actionNodeType(options.action || {}, options.graphStore);
}

function presetSkillIdForNodeType(nodeType) {
  const prefix = nodeTypeToSkillPrefix(nodeType);
  return prefix ? `${prefix}.applyPreset` : "";
}

function generateSkillIdForNodeType(nodeType) {
  const prefix = nodeTypeToSkillPrefix(nodeType);
  return prefix ? `${prefix}.generate` : "";
}

function v2ActionToCanvasSkillIds(skill = {}, actionType, options = {}) {
  const skillId = text(skill.id);
  const nodeType = nodeTypeFromOptions(options);
  if (ASSET_V2_SKILL_IDS.has(skillId)) {
    return [CANVAS_SKILL_IDS.assetUse, CANVAS_SKILL_IDS.nodeBindReferences];
  }
  if (actionType === "run_prompt_preset_generation") {
    return [presetSkillIdForNodeType(nodeType)];
  }
  if (GENERATION_ACTION_TYPES.has(actionType)) {
    return [generateSkillIdForNodeType(nodeType)];
  }
  const action = {
    ...(options.action && typeof options.action === "object" ? options.action : {}),
    type: actionType,
    nodeType,
  };
  return [skillIdForAiAction(action, options)];
}

export function canvasSkillIdsForV2Skill(skill = {}, options = {}) {
  const actionTypes = actionTypesForV2Skill(skill, options);
  return uniqueItems(
    actionTypes.flatMap((actionType) => v2ActionToCanvasSkillIds(skill, actionType, options))
  );
}

export function canvasSkillCallsForV2Skill(skill = {}, options = {}) {
  const nodeType = nodeTypeFromOptions(options);
  const actionType = actionTypeFromOptions(options);
  return canvasSkillIdsForV2Skill(skill, options).map((skillId) => {
    const canvasSkill = findCanvasSkill(skillId);
    return {
      skillId,
      id: skillId,
      sourceSkillId: text(skill.id),
      actionType,
      nodeType,
      permission: canvasSkill?.permission || "",
      requiresConfirmation: skill.requiresConfirmation === true || VIDEO_CONFIRMATION_SKILLS.has(skillId),
    };
  });
}

export function shouldConfirmCanvasSkillBatch(skillCalls = [], { agentMode = "plan" } = {}) {
  const calls = Array.isArray(skillCalls) ? skillCalls : [];
  const generationCalls = calls.filter((call) => GENERATION_SKILLS.has(text(call.skillId || call.id)));
  if (
    generationCalls.some(
      (call) => text(call.nodeType) === "ai-video" || text(call.skillId || call.id) === CANVAS_SKILL_IDS.videoGenerate
    )
  ) {
    return true;
  }
  if (agentMode === "act") return false;
  return generationCalls.length >= 2;
}
