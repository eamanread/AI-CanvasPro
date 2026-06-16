import { buildAmbientDigest, projectCanvasSpatial } from "./canvasSpatialProjection.js";

const LIMITS = {
  nodes: 80,
  edges: 120,
  selectedNodeIds: 20,
  assets: 30,
  workflows: 20,
  promptPresets: 40,
  attachments: 30,
  references: 40,
  knowledgeSearchResults: 12,
  knowledgeActionHints: 12,
  preferenceTextLength: 240,
  semanticNodes: 16,
  boundaryNodes: 24,
  workflowSummaries: 20,
};

const SENSITIVE_KEY_RE =
  /^(apiKey|api_key|authorization|secret|token|password|credential|file|filePath|path|localPath|absolutePath)$/i;
const OPENAI_KEY_PREFIX = "s" + "k-";
const SENSITIVE_VALUE_PATTERNS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [new RegExp(`\\b${OPENAI_KEY_PREFIX}[A-Za-z0-9_-]+`, "g"), `${OPENAI_KEY_PREFIX}[REDACTED]`],
  [/data:[^\s"'<>]+/gi, "[REDACTED_DATA_URL]"],
  [/blob:[^\s"'<>]+/gi, "[REDACTED_BLOB_URL]"],
  [/\b[A-Za-z]:\\[^"'<>|]+/g, "[REDACTED_PATH]"],
];
const SECRET_QUERY_KEY_RE = /(token|api[_-]?key|key|secret|signature|password|credential|authorization|access[_-]?token)/i;
const PREFERRED_MODEL_KEYS = ["text", "image", "video", "audio", "default", "provider"];
const WORKFLOW_DEFAULT_KEYS = [
  "layout",
  "shotCount",
  "durationSec",
  "shotDurationSec",
  "branchCount",
  "imageBatchSize",
];
const SHOT_METADATA_KEYS = [
  "storyboardId",
  "shotIndex",
  "shotDurationSec",
  "shotTitle",
  "shotVisual",
  "shotCamera",
  "shotStyle",
  "shotPrompt",
  "shotVideoPrompt",
  "shotContinuity",
];
const PROMPT_PRESET_INPUT_KEY_LIMIT = 12;
const KNOWLEDGE_SEARCH_RESULT_FIELDS = [
  "title",
  "fileId",
  "projectId",
  "snippet",
  "citation",
  "citationDisplay",
  "source",
  "score",
  // Director knowledge projection (director-knowledge-projection/v1)
  // rides the same pipe; whenToUse arrives pre-joined as a scalar
  // string because this sanitizer is scalar-only by design. Mirrored
  // in python KNOWLEDGE_SEARCH_FIELDS (canvas_agent_context_service).
  "citationKind",
  "cardId",
  "craftDomain",
  "whenToUse",
];
const KNOWLEDGE_ACTION_HINT_FIELDS = [
  "nodeType",
  "title",
  "sourceTitle",
  "sourceName",
  "knowledgeTitle",
  "fileId",
  "sourceFileId",
  "knowledgeFileId",
  "projectId",
  "sourceProjectId",
  "knowledgeProjectId",
  "citation",
  "citationDisplay",
  "summary",
  "workflowKind",
  "workflowStep",
];

function asState(store) {
  if (store && typeof store.getState === "function") {
    const state = store.getState();
    return state && typeof state === "object" ? state : {};
  }
  return store && typeof store === "object" ? store : {};
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Map || value instanceof Set) {
    return Array.from(value.values());
  }
  if (value && typeof value === "object") {
    if ("items" in value) {
      return toArray(value.items);
    }
    return Object.values(value);
  }
  return [];
}

function firstArray(...values) {
  for (const value of values) {
    const items = toArray(value);
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}

function redactString(value) {
  const withoutSensitiveValues = SENSITIVE_VALUE_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  );
  return sanitizeUrlQuery(withoutSensitiveValues);
}

function sanitizeUrlQuery(value) {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.username = "";
      parsed.password = "";
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (SECRET_QUERY_KEY_RE.test(key)) {
          parsed.searchParams.set(key, "[REDACTED]");
        }
      }
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return url;
    }
  });
}

function redactValue(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = value.map((item) => redactValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        continue;
      }
      const redacted = redactValue(child, seen);
      if (redacted !== undefined) {
        result[key] = redacted;
      }
    }
    seen.delete(value);
    return result;
  }
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return undefined;
}

function takeSanitized(items, limit) {
  return toArray(items).slice(0, limit).map((item) => redactValue(item));
}

// Canvas-spatial trap 1 ("raw pixels never reach the LLM"): agents
// reason in semantic space (zones/lanes/cells via layoutHints and the
// upcoming canvas-spatial/v1 projection); per-node pixel coordinates
// are noise to the model and fuel for hallucinated coordinates.
// Stripping happens on the redacted copy so the original node object
// identity (and redactValue's circular-reference handling) is intact.
function takeSanitizedNodes(items, limit) {
  return toArray(items).slice(0, limit).map((item) => {
    const redacted = redactValue(item);
    if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
      delete redacted.x;
      delete redacted.y;
      delete redacted.position;
    }
    return redacted;
  });
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function firstNonEmptyObject(...values) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) {
      return value;
    }
  }
  return {};
}

function stringPreference(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    return "";
  }
  const text = redactString(String(value)).trim();
  if (!text || text === "[REDACTED_PATH]" || text.includes("[REDACTED_DATA_URL]") || text.includes("[REDACTED_BLOB_URL]")) {
    return "";
  }
  return text.slice(0, LIMITS.preferenceTextLength);
}

function numberPreference(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstStringPreference(raw, ...keys) {
  for (const key of keys) {
    const text = stringPreference(raw?.[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

function sanitizePreferredModels(raw) {
  const source = raw?.preferredModels;
  const result = {};
  if (source && typeof source === "object" && !Array.isArray(source)) {
    for (const key of PREFERRED_MODEL_KEYS) {
      const text = stringPreference(source[key]);
      if (text) {
        result[key] = text;
      }
    }
  }
  const textModel = firstStringPreference(raw, "preferredModel", "preferredTextModel", "textModel");
  if (textModel && !result.text) {
    result.text = textModel;
  }
  const imageModel = firstStringPreference(raw, "preferredImageModel", "imageModel");
  if (imageModel && !result.image) {
    result.image = imageModel;
  }
  const videoModel = firstStringPreference(raw, "preferredVideoModel", "videoModel");
  if (videoModel && !result.video) {
    result.video = videoModel;
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeWorkflowDefaults(raw) {
  const source = raw?.workflowDefaults || raw?.defaults;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const result = {};
  for (const key of WORKFLOW_DEFAULT_KEYS) {
    const value = source[key];
    if (typeof value === "number") {
      const number = numberPreference(value);
      if (number !== null) {
        result[key] = number;
      }
      continue;
    }
    if (typeof value === "boolean") {
      result[key] = value;
      continue;
    }
    const text = stringPreference(value);
    if (text) {
      result[key] = text;
    }
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeProjectPreferences(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const preferences = {};
  const visualStyle = firstStringPreference(raw, "visualStyle", "style", "styleGuide");
  const aspectRatio = firstStringPreference(raw, "aspectRatio", "ratio");
  const naming = firstStringPreference(raw, "naming", "namingRules");
  const brandVoice = firstStringPreference(raw, "brandVoice", "brandTone", "tone");
  const preferredModels = sanitizePreferredModels(raw);
  const workflowDefaults = sanitizeWorkflowDefaults(raw);

  if (visualStyle) {
    preferences.visualStyle = visualStyle;
  }
  if (aspectRatio) {
    preferences.aspectRatio = aspectRatio;
  }
  if (preferredModels) {
    preferences.preferredModels = preferredModels;
  }
  if (naming) {
    preferences.naming = naming;
  }
  if (brandVoice) {
    preferences.brandVoice = brandVoice;
  }
  if (workflowDefaults) {
    preferences.workflowDefaults = workflowDefaults;
  }
  return Object.keys(preferences).length ? preferences : null;
}

function sanitizeKnowledgeScalar(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    return "";
  }
  const redacted = redactString(String(value)).trim();
  if (!redacted || redacted === "[REDACTED_PATH]" || redacted.includes("[REDACTED_DATA_URL]") || redacted.includes("[REDACTED_BLOB_URL]")) {
    return "";
  }
  return redacted.slice(0, LIMITS.preferenceTextLength);
}

function sanitizeKnowledgeEntry(raw, fields) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const result = {};
  for (const field of fields) {
    const value = raw[field];
    if (typeof value === "number") {
      const number = numberOrNull(value);
      if (number !== null) {
        result[field] = number;
      }
      continue;
    }
    if (typeof value === "boolean") {
      result[field] = value;
      continue;
    }
    const text = sanitizeKnowledgeScalar(value);
    if (text) {
      result[field] = text;
    }
  }
  return Object.keys(result).length ? result : null;
}

function sanitizeLlmWikiContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const result = {};
  for (const field of ["mode", "status", "defaultProjectId"]) {
    const text = sanitizeKnowledgeScalar(raw[field]);
    if (text) {
      result[field] = text;
    }
  }
  if (typeof raw.available === "boolean") {
    result.available = raw.available;
  }
  const searchResults = toArray(raw.searchResults || raw.results || raw.lastSearch?.results)
    .slice(0, LIMITS.knowledgeSearchResults)
    .map((item) => sanitizeKnowledgeEntry(item, KNOWLEDGE_SEARCH_RESULT_FIELDS))
    .filter(Boolean);
  const canvasActionHints = toArray(raw.canvasActionHints || raw.actionHints)
    .slice(0, LIMITS.knowledgeActionHints)
    .map((item) => sanitizeKnowledgeEntry(item, KNOWLEDGE_ACTION_HINT_FIELDS))
    .filter(Boolean);
  if (searchResults.length) {
    result.searchResults = searchResults;
  }
  if (canvasActionHints.length) {
    result.canvasActionHints = canvasActionHints;
  }
  return Object.keys(result).length ? result : null;
}

function knowledgeFrom(input, workspaceState) {
  const raw =
    input.knowledge?.llmWiki ||
    input.knowledge?.llm_wiki ||
    workspaceState.knowledge?.llmWiki ||
    workspaceState.knowledge?.llm_wiki;
  // Director knowledge cards ride the same llmWiki pipe (whitelist,
  // limits, citation discipline). Note the raw chain above is an ||
  // short-circuit, not a merge - director entries are therefore
  // prepended HERE, where both sources are visible, in front of the
  // existing search results so the 12-entry cap keeps them alive.
  const directorEntries = toArray(input.directorKnowledge);
  const source = directorEntries.length
    ? {
        ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
        searchResults: [
          ...directorEntries,
          ...toArray(raw?.searchResults || raw?.results || raw?.lastSearch?.results),
        ],
      }
    : raw;
  const llmWiki = sanitizeLlmWikiContext(source);
  return llmWiki ? { llmWiki } : undefined;
}

function slugPart(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text;
}

function presetInputKeys(raw) {
  const inputs = raw?.inputs || raw?.inputSchema || raw?.variables;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return [];
  }
  return Object.keys(inputs)
    .map(stringPreference)
    .filter(Boolean)
    .slice(0, PROMPT_PRESET_INPUT_KEY_LIMIT);
}

function presetTags(raw) {
  const source = Array.isArray(raw?.tags) ? raw.tags : Array.isArray(raw?.keywords) ? raw.keywords : [];
  return source.map(stringPreference).filter(Boolean).slice(0, 8);
}

function promptPresetId(raw, { nodeType, path, fallbackIndex }) {
  const explicit = stringPreference(raw?.id || raw?.presetId || raw?.key);
  if (explicit) {
    return explicit;
  }
  const slug = [nodeType, ...path].map(slugPart).filter(Boolean).join("-");
  return slug || `preset-${fallbackIndex + 1}`;
}

function addPromptPresetLeaf(raw, inherited, result) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return;
  }
  const title = firstStringPreference(raw, "title", "name", "label");
  const nodeType = firstStringPreference(raw, "nodeType", "type") || inherited.nodeType;
  if (!title && !raw.id && !raw.presetId) {
    return;
  }
  const path = [...(inherited.path || []), title || stringPreference(raw.id || raw.presetId)].filter(Boolean);
  const id = promptPresetId(raw, { nodeType, path, fallbackIndex: result.length });
  const entry = {
    id,
    presetId: id,
    title: title || id,
    name: title || id,
  };
  const description = firstStringPreference(raw, "desc", "description", "summary");
  const category = inherited.category || "";
  const tags = presetTags(raw);
  const inputKeys = presetInputKeys(raw);
  const hasTemplate = raw.hasTemplate === true || (typeof raw.template === "string" && raw.template.trim().length > 0);

  if (description) {
    entry.description = description;
  }
  if (nodeType) {
    entry.nodeType = nodeType;
  }
  if (category) {
    entry.category = category;
  }
  if (path.length > 1) {
    entry.path = path;
  }
  if (tags.length) {
    entry.tags = tags;
  }
  if (inputKeys.length) {
    entry.inputKeys = inputKeys;
  }
  if (hasTemplate) {
    entry.hasTemplate = true;
  }
  result.push(entry);
}

function collectPromptPresetItems(source, inherited, result) {
  if (!source || result.length >= LIMITS.promptPresets) {
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      collectPromptPresetItems(item, inherited, result);
      if (result.length >= LIMITS.promptPresets) {
        break;
      }
    }
    return;
  }
  if (source instanceof Map || source instanceof Set) {
    collectPromptPresetItems(Array.from(source.values()), inherited, result);
    return;
  }
  if (typeof source !== "object") {
    return;
  }
  if ("items" in source && !("title" in source) && !("template" in source)) {
    collectPromptPresetItems(source.items, inherited, result);
    return;
  }
  const entries = Object.entries(source);
  const looksLikeNodeTypeMap =
    !("title" in source) &&
    !("template" in source) &&
    entries.some(([, value]) => Array.isArray(value));
  if (looksLikeNodeTypeMap) {
    for (const [nodeType, items] of entries) {
      collectPromptPresetItems(items, { nodeType: stringPreference(nodeType), category: "", path: [] }, result);
      if (result.length >= LIMITS.promptPresets) {
        break;
      }
    }
    return;
  }

  const title = firstStringPreference(source, "title", "name", "label");
  const subItems = Array.isArray(source.subItems) ? source.subItems : Array.isArray(source.children) ? source.children : [];
  const leafCandidate = source.template || source.id || source.presetId || source.hasTemplate === true;
  if (leafCandidate) {
    addPromptPresetLeaf(source, inherited, result);
  }
  if (subItems.length) {
    const nextPath = title ? [...(inherited.path || []), title] : inherited.path || [];
    const nextCategory = inherited.category || title || "";
    for (const child of subItems) {
      collectPromptPresetItems(child, { ...inherited, category: nextCategory, path: nextPath }, result);
      if (result.length >= LIMITS.promptPresets) {
        break;
      }
    }
  }
}

function buildPromptPresetCatalog(source) {
  const result = [];
  collectPromptPresetItems(source, { nodeType: "", category: "", path: [] }, result);
  return result.slice(0, LIMITS.promptPresets);
}

function sanitizeReference(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const targetId = String(raw.targetId || raw.nodeId || raw.assetId || raw.id || "").trim();
  const kind = String(raw.kind || (raw.nodeType ? "node" : "item")).trim() || "item";
  if (!targetId && !raw.id) {
    return null;
  }
  return {
    id: redactString(String(raw.id || `${kind}:${targetId}`)),
    kind: redactString(kind),
    targetId: redactString(targetId),
    label: redactString(String(raw.label || raw.name || raw.title || targetId)),
    nodeType: redactString(String(raw.nodeType || raw.type || "")),
    usage: redactString(String(raw.usage || "target")),
    assetId: redactString(String(raw.assetId || "")),
    thumbnailHint: redactString(String(raw.thumbnailHint || "")),
  };
}

function attachmentDimensions(raw) {
  const dimensions = safeObject(raw.dimensions);
  const width = Number(dimensions.width || raw.width || 0) || 0;
  const height = Number(dimensions.height || raw.height || 0) || 0;
  return width || height ? { width, height } : {};
}

function sanitizeAttachment(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || raw.assetId || "").trim();
  if (!id) {
    return null;
  }
  return {
    id: redactString(id),
    name: redactString(String(raw.name || raw.fileName || id)),
    mime: redactString(String(raw.mime || raw.type || "")),
    kind: redactString(String(raw.kind || "")),
    usage: redactString(String(raw.usage || "general")),
    assetId: redactString(String(raw.assetId || "")),
    dimensions: attachmentDimensions(raw),
    thumbnailHint: redactString(String(raw.thumbnailHint || "")),
  };
}

function projectFrom(input, state, workspaceState) {
  const project = firstNonEmptyObject(input.project, state.project, workspaceState.project);
  const result = {
    id: redactString(String(project.id || project.projectId || input.projectId || "")),
    name: redactString(String(project.name || project.title || input.projectName || "")),
  };
  const preferences = sanitizeProjectPreferences(project.preferences || project.projectPreferences);
  if (preferences) {
    result.preferences = preferences;
  }
  return result;
}

function selectedIdsFrom(input, state, workspaceState) {
  return firstArray(
    input.selection?.selectedNodeIds,
    input.selectedNodeIds,
    state.selection?.selectedNodeIds,
    state.selectedNodeIds,
    workspaceState.selection?.selectedNodeIds,
    workspaceState.selectedNodeIds
  )
    .slice(0, LIMITS.selectedNodeIds)
    .map((nodeId) => redactString(String(nodeId)));
}

function nodeIdOf(node) {
  return String(node?.id || node?.nodeId || "").trim();
}

function nodeTypeOf(node) {
  return String(node?.type || node?.nodeType || node?.data?.nodeType || "").trim();
}

function nodeNameOf(node) {
  return String(node?.name || node?.title || node?.label || "").trim();
}

function nodePromptOf(node) {
  return String(node?.prompt ?? node?.data?.prompt ?? node?.data?.textPrompt ?? "").trim();
}

function nodeStatusOf(node) {
  return String(
    node?.status ||
      node?.data?.status ||
      node?.data?.generationStatus ||
      node?.data?.jobStatus ||
      node?.data?.asyncTaskStatus ||
      ""
  )
    .trim()
    .toLowerCase();
}

function edgeSource(edge) {
  return String(edge?.source || edge?.from || edge?.sourceId || "").trim();
}

function edgeTarget(edge) {
  return String(edge?.target || edge?.to || edge?.targetId || "").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nodeRectOf(node) {
  const position = safeObject(node?.position);
  const size = safeObject(node?.size);
  const data = safeObject(node?.data);
  const x = numberOrNull(node?.x) ?? numberOrNull(position.x) ?? 0;
  const y = numberOrNull(node?.y) ?? numberOrNull(position.y) ?? 0;
  const width = numberOrNull(node?.width) ?? numberOrNull(size.width) ?? numberOrNull(data.width) ?? 320;
  const height = numberOrNull(node?.height) ?? numberOrNull(size.height) ?? numberOrNull(data.height) ?? 220;
  return { x, y, width, height };
}

function boundsForNodes(nodes) {
  const rects = toArray(nodes).filter(Boolean).map(nodeRectOf);
  if (!rects.length) {
    return { x: 120, y: 120, width: 0, height: 0 };
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function buildCanvasLayoutHints(nodes, selectedNodeIds = []) {
  const nodeList = toArray(nodes);
  const nodeById = new Map(nodeList.map((node) => [nodeIdOf(node), node]).filter(([id]) => id));
  const selectedTargets = selectedNodeIds.filter((nodeId) => nodeById.has(nodeId));
  const targetNodeIds = selectedTargets.length ? selectedTargets : nodeList.map(nodeIdOf).filter(Boolean);
  const targetNodes = targetNodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
  const bounds = boundsForNodes(targetNodes.length ? targetNodes : nodeList);
  const defaultGap = 96;
  return {
    coordinateSystem: "absolute_xy_top_left",
    targetNodeIds: targetNodeIds.map((id) => redactString(id)),
    bounds,
    suggestedOrigin: {
      x: bounds.x + bounds.width + defaultGap,
      y: bounds.y,
    },
    defaultGap,
    strategies: ["single_chain", "branch_flow", "storyboard_grid", "asset_lane", "problem_lane"],
    forbiddenEdits: ["prompt", "model", "assets", "generation", "delete"],
  };
}

function buildCanvasDiagnostics(nodes, edges) {
  const nodeList = toArray(nodes);
  const edgeList = toArray(edges);
  const nodeIds = new Set(nodeList.map(nodeIdOf).filter(Boolean));
  const connectedNodeIds = new Set();
  const failedNodeIds = [];
  const missingPromptNodeIds = [];
  const danglingEdgeIds = [];
  const names = new Map();

  for (const node of nodeList) {
    const id = nodeIdOf(node);
    if (!id) {
      continue;
    }
    const status = nodeStatusOf(node);
    if (["failed", "error", "errored"].includes(status) || node?.data?.error) {
      failedNodeIds.push(id);
    }
    if (["ai-text", "ai-image", "ai-video"].includes(nodeTypeOf(node)) && !nodePromptOf(node)) {
      missingPromptNodeIds.push(id);
    }
    const name = nodeNameOf(node);
    if (name) {
      if (!names.has(name)) {
        names.set(name, []);
      }
      names.get(name).push(id);
    }
  }

  for (const edge of edgeList) {
    const source = edgeSource(edge);
    const target = edgeTarget(edge);
    const validSource = source && nodeIds.has(source);
    const validTarget = target && nodeIds.has(target);
    if (!validSource || !validTarget) {
      const edgeId = String(edge?.id || `${source}->${target}`).trim();
      if (edgeId) {
        danglingEdgeIds.push(edgeId);
      }
      continue;
    }
    connectedNodeIds.add(source);
    connectedNodeIds.add(target);
  }

  const duplicateNameGroups = Array.from(names.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({
      name: redactString(name),
      nodeIds: ids.map((id) => redactString(id)),
    }));
  const isolatedNodeIds = nodeList
    .map(nodeIdOf)
    .filter((id) => id && !connectedNodeIds.has(id));
  const recommendedFocusNodeIds = [...new Set([...failedNodeIds, ...missingPromptNodeIds])].slice(0, 8);

  return {
    failedNodeIds: failedNodeIds.map((id) => redactString(id)),
    missingPromptNodeIds: missingPromptNodeIds.map((id) => redactString(id)),
    danglingEdgeIds: danglingEdgeIds.map((id) => redactString(id)),
    isolatedNodeIds: isolatedNodeIds.map((id) => redactString(id)),
    duplicateNameGroups,
    recommendedFocusNodeIds: recommendedFocusNodeIds.map((id) => redactString(id)),
  };
}

function compactNodeSummary(node) {
  const data = safeObject(node?.data);
  const summary = {
    id: redactString(nodeIdOf(node)),
    nodeType: redactString(nodeTypeOf(node)),
    name: redactString(nodeNameOf(node)),
  };
  const workflowKind = stringPreference(data.workflowKind || node?.workflowKind);
  const workflowStep = stringPreference(data.workflowStep || node?.workflowStep);
  const generationStatus = stringPreference(nodeStatusOf(node));
  if (workflowKind) {
    summary.workflowKind = workflowKind;
  }
  if (workflowStep) {
    summary.workflowStep = workflowStep;
  }
  if (generationStatus) {
    summary.generationStatus = generationStatus;
  }
  if (nodePromptOf(node)) {
    summary.hasPrompt = true;
  }
  for (const key of SHOT_METADATA_KEYS) {
    const value = key in data ? data[key] : node?.[key];
    if (key === "shotIndex" || key === "shotDurationSec") {
      const number = numberOrNull(value);
      if (number !== null) {
        summary[key] = number;
      }
      continue;
    }
    const text = stringPreference(value);
    if (text) {
      summary[key] = text;
    }
  }
  const knowledgeSource = knowledgeSourceSummary(data);
  if (knowledgeSource) {
    summary.knowledgeSource = knowledgeSource;
  }
  return summary;
}

function firstKnowledgeText(data, node, keys) {
  for (const key of keys) {
    const text = stringPreference(data[key] ?? node?.[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

function knowledgeSourceSummary(data, node = {}) {
  const workflowKind = stringPreference(data.workflowKind || node?.workflowKind);
  const citationKind = stringPreference(data.citationKind || node?.citationKind);
  const title = firstKnowledgeText(data, node, ["sourceTitle", "sourceName", "knowledgeTitle", "title", "name"]);
  const fileId = firstKnowledgeText(data, node, ["fileId", "sourceFileId", "knowledgeFileId"]);
  const projectId = firstKnowledgeText(data, node, [
    "projectId",
    "sourceProjectId",
    "knowledgeProjectId",
    "citationProjectId",
  ]);
  const citation = firstKnowledgeText(data, node, ["citation"]);
  const explicitDisplay = firstKnowledgeText(data, node, ["citationDisplay"]);
  if (
    workflowKind !== "knowledge_card" &&
    citationKind !== "llm_wiki" &&
    !title &&
    !fileId &&
    !citation
  ) {
    return null;
  }
  const display = explicitDisplay || [title, fileId ? `(${fileId})` : ""].filter(Boolean).join(" ").trim();
  const result = { kind: citationKind || "llm_wiki" };
  if (display) {
    result.display = display;
  }
  if (title) {
    result.title = title;
  }
  if (fileId) {
    result.fileId = fileId;
  }
  if (projectId) {
    result.projectId = projectId;
  }
  if (citation) {
    result.citation = citation;
  }
  return Object.keys(result).length > 1 ? result : null;
}

function buildGenerationStatusSummary(nodes) {
  const summary = {};
  for (const node of toArray(nodes)) {
    const status = nodeStatusOf(node) || "unknown";
    summary[status] = (summary[status] || 0) + 1;
  }
  return summary;
}

function buildWorkflowSummaries(nodes) {
  const groups = new Map();
  for (const node of toArray(nodes)) {
    const data = safeObject(node?.data);
    const workflowKind = String(data.workflowKind || node?.workflowKind || "").trim();
    if (!workflowKind) {
      continue;
    }
    const key = `${workflowKind}:${String(data.workflowGroupId || node?.workflowGroupId || "")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        workflowKind: redactString(workflowKind),
        workflowGroupId: redactString(String(data.workflowGroupId || node?.workflowGroupId || "")),
        nodeCount: 0,
        steps: {},
        nodeIds: [],
      });
    }
    const group = groups.get(key);
    const step = String(data.workflowStep || node?.workflowStep || "unknown").trim() || "unknown";
    group.nodeCount += 1;
    group.steps[step] = (group.steps[step] || 0) + 1;
    const id = nodeIdOf(node);
    if (id && group.nodeIds.length < LIMITS.semanticNodes) {
      group.nodeIds.push(redactString(id));
    }
  }
  return Array.from(groups.values()).slice(0, LIMITS.workflowSummaries);
}

function boundaryNodesForSelection(nodes, edges, selectedNodeIds) {
  const selected = new Set((selectedNodeIds || []).map(String).filter(Boolean));
  if (!selected.size) {
    return [];
  }
  const nodeById = new Map(toArray(nodes).map((node) => [nodeIdOf(node), node]).filter(([id]) => id));
  const boundaryIds = new Set();
  for (const edge of toArray(edges)) {
    const source = edgeSource(edge);
    const target = edgeTarget(edge);
    if (selected.has(source) && target && !selected.has(target)) {
      boundaryIds.add(target);
    }
    if (selected.has(target) && source && !selected.has(source)) {
      boundaryIds.add(source);
    }
  }
  return Array.from(boundaryIds)
    .slice(0, LIMITS.boundaryNodes)
    .map((nodeId) => nodeById.get(nodeId))
    .filter(Boolean)
    .map(compactNodeSummary);
}

function duplicateNameSummary(nodes) {
  const names = new Map();
  for (const node of toArray(nodes)) {
    const name = nodeNameOf(node);
    const id = nodeIdOf(node);
    if (!name || !id) {
      continue;
    }
    if (!names.has(name)) {
      names.set(name, []);
    }
    names.get(name).push(id);
  }
  return Array.from(names.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({
      name: redactString(name),
      nodeIds: ids.slice(0, LIMITS.semanticNodes).map((id) => redactString(id)),
      count: ids.length,
    }));
}

function buildCanvasSemanticCompression(nodes, edges, selectedNodeIds = []) {
  const nodeList = toArray(nodes);
  const edgeList = toArray(edges);
  const selectedSet = new Set((selectedNodeIds || []).map(String).filter(Boolean));
  const selectedNodes = nodeList
    .filter((node) => selectedSet.has(nodeIdOf(node)))
    .slice(0, LIMITS.semanticNodes)
    .map(compactNodeSummary);
  const highSignalNodes = nodeList
    .filter((node) => {
      const status = nodeStatusOf(node);
      return ["failed", "error", "errored", "running", "queued"].includes(status) || !nodePromptOf(node);
    })
    .slice(0, LIMITS.semanticNodes)
    .map(compactNodeSummary);

  return {
    largeCanvas: nodeList.length > LIMITS.nodes || edgeList.length > LIMITS.edges,
    selectedNodeIds: Array.from(selectedSet).slice(0, LIMITS.selectedNodeIds).map((id) => redactString(id)),
    selectedNodes,
    boundaryNodes: boundaryNodesForSelection(nodeList, edgeList, selectedNodeIds),
    highSignalNodes,
    workflowSummaries: buildWorkflowSummaries(nodeList),
    generationStatusSummary: buildGenerationStatusSummary(nodeList),
    duplicateNameGroups: duplicateNameSummary(nodeList),
  };
}

export function buildAssistantCanvasContext(input = {}) {
  const graphState = asState(input.graphStore || input.graph || {});
  const workspaceState = asState(input.workspaceStore || {});
  const nodes = firstArray(input.nodes, graphState.nodes, graphState.canvas?.nodes);
  const edges = firstArray(input.edges, graphState.edges, graphState.canvas?.edges);
  const selectedNodeIds = selectedIdsFrom(input, graphState, workspaceState);
  const promptPresetSource =
    input.promptPresets?.items ??
    input.promptPresets ??
    workspaceState.promptPresets?.items ??
    workspaceState.promptPresets;

  // canvas-spatial perception: the one-line digest is ambient (every
  // turn, ~40 tokens); the full projection is injected only on demand
  // (spatial-keyword lens or explicit request) to keep silent turns
  // free of spatial cost.
  const spatialProjection = projectCanvasSpatial({ nodes, edges }, { relevantIds: selectedNodeIds });

  const result = {
    project: projectFrom(input, graphState, workspaceState),
    canvas: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: takeSanitizedNodes(nodes, LIMITS.nodes),
      edges: takeSanitized(edges, LIMITS.edges),
      diagnostics: buildCanvasDiagnostics(nodes, edges),
      layoutHints: buildCanvasLayoutHints(nodes, selectedNodeIds),
      semanticCompression: buildCanvasSemanticCompression(nodes, edges, selectedNodeIds),
      spatialDigest: buildAmbientDigest(spatialProjection),
      ...(input.includeSpatial === true ? { spatial: spatialProjection } : {}),
    },
    selection: {
      selectedNodeIds,
    },
    assets: {
      items: takeSanitized(
        firstArray(input.assets?.items, input.assets, workspaceState.assets?.items, workspaceState.assets),
        LIMITS.assets
      ),
    },
    workflows: {
      items: takeSanitized(
        firstArray(
          input.workflows?.items,
          input.workflows,
          workspaceState.workflows?.items,
          workspaceState.workflows
        ),
        LIMITS.workflows
      ),
    },
    promptPresets: {
      items: buildPromptPresetCatalog(promptPresetSource),
    },
    references: {
      items: firstArray(input.references?.items, input.references)
        .slice(0, LIMITS.references)
        .map(sanitizeReference)
        .filter(Boolean),
    },
    attachments: {
      items: firstArray(input.attachments?.items, input.attachments)
        .slice(0, LIMITS.attachments)
        .map(sanitizeAttachment)
        .filter(Boolean),
    },
  };
  const knowledge = knowledgeFrom(input, workspaceState);
  if (knowledge) {
    result.knowledge = knowledge;
  }
  return result;
}

export { buildAssistantCanvasContext as buildAssistantContext };
