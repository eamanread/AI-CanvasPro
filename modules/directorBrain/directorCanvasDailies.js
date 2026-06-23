import { normalizeCanvasGenerationStatus } from "../assistant/canvasSkills/generationStateMapper.js";
import { sanitizeDirectorContext } from "./directorContextSchema.js";

export const CANVAS_DAILIES_SCHEMA_VERSION = "canvas-dailies/v2";

const PRODUCTION_NODE_TYPES = new Set(["storyboard-script", "ai-image", "ai-video"]);
const TERMINAL_GENERATION_STATUSES = new Set(["completed", "failed", "retryable", "cancelled"]);

// The real app store flattens node data to the top level (node.data is
// usually empty) while test stores keep fields nested - every read
// must support both shapes (iron rule 3: the canvas is the truth).
function pick(node, key) {
  const data = node?.data;
  if (data && typeof data === "object" && data[key] !== undefined) return data[key];
  return node?.[key];
}

function statusSourceOf(node) {
  const data = node?.data;
  return data && typeof data === "object" && Object.keys(data).length > 0 ? data : node || {};
}

// Outputs carry URL references only: http(s) passes, site-relative
// paths (/output/gen_*.png is the real generated-asset shape) are
// absolutized against assetBaseUrl, everything else (file://, drive
// letters) never leaves the canvas (RED-LINE-1 second gate - the
// shared path redaction misses file:/// forward-slash forms).
function sanitizeOutputUrl(raw, assetBaseUrl) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) {
    const base = String(assetBaseUrl || "").trim().replace(/\/+$/, "");
    return base ? `${base}${value}` : "";
  }
  return "";
}

function outputsOf(node, assetBaseUrl) {
  const kind = String(node?.type) === "ai-video" ? "video" : "image";
  const candidates = [];
  if (kind === "video") {
    candidates.push(pick(node, "videoUrl"));
    for (const item of Array.isArray(pick(node, "videos")) ? pick(node, "videos") : []) {
      if (item && typeof item === "object") candidates.push(item.videoUrl || item.url);
      else if (typeof item === "string") candidates.push(item);
    }
  } else {
    candidates.push(pick(node, "imageUrl") || pick(node, "thumbUrl") || pick(node, "sourceUrl"));
    for (const item of Array.isArray(pick(node, "images")) ? pick(node, "images") : []) {
      if (item && typeof item === "object") candidates.push(item.imageUrl || item.url || item.sourceUrl);
      else if (typeof item === "string") candidates.push(item);
    }
  }
  const thumbnailUrl = sanitizeOutputUrl(pick(node, "thumbUrl"), assetBaseUrl);
  const seen = new Set();
  const outputs = [];
  for (const candidate of candidates) {
    const url = sanitizeOutputUrl(candidate, assetBaseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    outputs.push({ kind, url, ...(thumbnailUrl && thumbnailUrl !== url ? { thumbnailUrl } : {}) });
  }
  return outputs;
}

function normalizedGenerationStatus(node) {
  const status = normalizeCanvasGenerationStatus(statusSourceOf(node));
  // Idle means "never generated" - keep the v1 null semantics so the
  // QMAI review side can tell prep nodes from finished takes.
  return status === "idle" ? null : status;
}

/**
 * The L6 -> L2 uplink (the brain's eyes): exports the real canvas
 * production surface - shot nodes, generation prep/results with their
 * output URLs, edges - as canvas-dailies/v2 so QMAI dailies review can
 * critique what the canvas actually produced instead of what the
 * brain imagined. Only production-surface nodes are included,
 * deep-sanitized; user notes and unrelated canvas content never leave
 * the canvas.
 */
export function buildCanvasDailiesExport({
  graphStore,
  flowId,
  projectId,
  exportedAt,
  phase,
  assetBaseUrl = "",
} = {}) {
  if (!graphStore || !Array.isArray(graphStore.nodes)) {
    throw new Error("graphStore with nodes is required");
  }
  if (!isIsoTimestamp(exportedAt)) {
    throw new Error("exportedAt must be a strict ISO timestamp");
  }
  if (flowId !== undefined && (typeof flowId !== "string" || !flowId.trim() || !isSafeId(flowId))) {
    throw new Error("flowId must be a safe non-empty string");
  }
  if (phase !== undefined && !["post-actions", "post-generation"].includes(phase)) {
    throw new Error("phase must be post-actions or post-generation");
  }

  const nodes = [];
  for (const node of graphStore.nodes) {
    if (!node || !PRODUCTION_NODE_TYPES.has(String(node.type))) continue;
    const generationStatus = normalizedGenerationStatus(node);
    const outputs = outputsOf(node, assetBaseUrl);
    const stringField = (key) => {
      const value = pick(node, key);
      return typeof value === "string" && value ? { [key]: value } : {};
    };
    nodes.push({
      id: String(node.id),
      type: String(node.type),
      name: String(node.name || ""),
      ...stringField("qmaiShotId"),
      ...stringField("qmaiPromptId"),
      ...(typeof pick(node, "shotIndex") === "number" ? { shotIndex: pick(node, "shotIndex") } : {}),
      ...stringField("dramaticBeat"),
      ...(typeof pick(node, "prompt") === "string" ? { prompt: pick(node, "prompt") } : {}),
      ...stringField("negativePrompt"),
      ...stringField("shotContinuity"),
      generationStatus,
      outputs,
      ...(pick(node, "userEdited") === true ? { userEdited: true } : {}),
    });
  }

  if (nodes.length === 0) {
    throw new Error("canvas has no production-surface nodes to export as dailies");
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(graphStore.edges) ? graphStore.edges : [])
    .filter((edge) => edge && nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)))
    .map((edge) => ({
      source: String(edge.source),
      target: String(edge.target),
      label: String(edge.label || ""),
    }));

  const shotCount = nodes.filter((node) => node.type === "storyboard-script").length;
  const imageCount = nodes.filter((node) => node.type === "ai-image").length;
  const generatedCount = nodes.filter((node) => node.generationStatus === "completed").length;
  const failedCount = nodes.filter((node) => node.generationStatus === "failed").length;

  return sanitizeDirectorContext({
    schemaVersion: CANVAS_DAILIES_SCHEMA_VERSION,
    ...(flowId ? { flowId: flowId.trim() } : {}),
    ...(typeof projectId === "string" && projectId.trim() ? { projectId: projectId.trim() } : {}),
    exportedAt,
    ...(phase ? { phase } : {}),
    nodes,
    edges,
    stats: { nodeCount: nodes.length, shotCount, imageCount, generatedCount, failedCount },
  });
}

export function isTerminalDailiesGenerationStatus(status) {
  return TERMINAL_GENERATION_STATUSES.has(String(status || ""));
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isSafeId(value) {
  if (/[\\/]/.test(value)) return false;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}
