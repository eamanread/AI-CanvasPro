// Generation-confirmation policy (user-locked spec, 2026-06-12):
// confirmation gates REAL generation dispatch only — creating blank nodes
// (including ai-image/ai-video PREP nodes) is a structural action and never
// gates nor counts. Plan mode confirms image or video generation; Act mode
// confirms video generation only. One confirmation releases the whole plan
// and doubles as video authorization.

const GENERATION_ACTION_TYPES = new Set(["queue_generation_task", "run_prompt_preset_generation"]);

function safeTrim(value) {
  return String(value ?? "").trim();
}

function nodeTypeFromGraph(nodeId, graphStore) {
  const id = safeTrim(nodeId);
  if (!id) {
    return "";
  }
  const nodes = Array.isArray(graphStore?.nodes) ? graphStore.nodes : [];
  const node = nodes.find((item) => safeTrim(item?.id) === id);
  return safeTrim(node?.type || node?.nodeType);
}

export function generationActionNodeType(action = {}, graphStore = null) {
  const data = action?.data && typeof action.data === "object" && !Array.isArray(action.data) ? action.data : {};
  const declared = safeTrim(action.nodeType || action.targetNodeType || data.nodeType || data.type);
  if (declared) {
    return declared;
  }
  return nodeTypeFromGraph(action.nodeId || action.id, graphStore);
}

export function countGenerationActions(actions = [], graphStore = null) {
  const counts = { text: 0, image: 0, video: 0 };
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || typeof action !== "object" || !GENERATION_ACTION_TYPES.has(safeTrim(action.type))) {
      continue;
    }
    const nodeType = generationActionNodeType(action, graphStore);
    if (nodeType === "ai-video") {
      counts.video += 1;
    } else if (nodeType === "ai-image") {
      counts.image += 1;
    } else {
      counts.text += 1;
    }
  }
  return counts;
}

export function generationConfirmationRequired(counts = {}, agentMode = "plan") {
  const image = Number(counts?.image || 0);
  const video = Number(counts?.video || 0);
  if (String(agentMode || "plan") === "act") {
    return video > 0;
  }
  return image > 0 || video > 0;
}

export function generationConfirmationMessage(counts = {}) {
  const parts = [];
  const text = Number(counts?.text || 0);
  const image = Number(counts?.image || 0);
  const video = Number(counts?.video || 0);
  if (text > 0) {
    parts.push(`${text} 个文本节点`);
  }
  if (image > 0) {
    parts.push(`${image} 个图片节点`);
  }
  if (video > 0) {
    parts.push(`${video} 个视频节点`);
  }
  if (!parts.length) {
    return "";
  }
  return `本次将生成 ${parts.join("、")}，确认执行吗？`;
}
