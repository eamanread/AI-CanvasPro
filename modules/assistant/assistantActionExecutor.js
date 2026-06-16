import { createAssistantGenerationTaskStore } from "./assistantGenerationTaskStore.js";
import { createAssistantWorkflowTemplateStore } from "./assistantWorkflowTemplateStore.js";
import { isCanvasSkillActionCandidate } from "./assistantCanvasSkillRegistry.js";
import { cellKey, cellOf, cellRangeOf, cellToPx, firstFreeCellIn, GRID, ZONES, zoneOfCell } from "./canvasSpatialProjection.js";
import { applyNodePosition, isPinnedNode, recordPlacement } from "./canvasMovementGuard.js";
import { tidyCanvas } from "./canvasTidy.js";

const DEFAULT_NODE_SIZE = { width: 320, height: 220 };

// --- canvas-spatial placement resolver (S2) ---------------------------
// The model speaks semantic placement (strategy + anchor/zone/lane);
// this resolver owns all pixel math. Iron rules: model pixels are
// ignored whenever a placement is present, resolution failures degrade
// to the staging band with a visible warning (never stacking, never
// dropping), and every code-made placement records its lineage in
// node.data.placementReason.
export const PLACEMENT_STRATEGIES = new Set([
  "below",
  "above",
  "left-of",
  "right-of",
  "near",
  "in-zone",
  "new-lane",
  "append-lane",
]);
const PRODUCTION_LAST_COL = ZONES.RESULTS_COL - 1;
const PLACEMENT_ZONES = new Set(["dock-left", "production", "results", "staging"]);

// Occupancy is re-scanned from graphStore at every resolution instead
// of being tracked incrementally: the executor adds each node to the
// store immediately after placing it, so a live scan is always
// current — including nodes created by duplicate_nodes, create_group,
// apply_workflow_template, or any future node-producing action. This
// kills the whole staleness class the incremental-claim design had.
function createPlacementContext(graphStore, actions) {
  const feedsFrom = new Map();
  for (const action of safeArray(actions)) {
    if (action?.type === "connect_nodes" && action.from && action.to) {
      feedsFrom.set(String(action.to), String(action.from));
    }
  }
  return {
    feedsFrom,
    scan() {
      const occupied = new Set();
      let maxRow = -1;
      let maxCol = -1;
      let productionMaxRow = -1;
      for (const node of safeArray(graphStore?.nodes)) {
        if (!node) continue;
        // Group frames are containers, not content: their members
        // claim their own cells, and blanketing the frame's whole
        // footprint would falsely exhaust production bands.
        if (String(node.type) === "group") continue;
        // Occupancy covers the node's full rectangular footprint -
        // off-grid nodes spanning cell boundaries block every cell
        // they touch.
        const range = cellRangeOf(node);
        for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
          for (let col = range.colStart; col <= range.colEnd; col += 1) {
            occupied.add(cellKey(row, col));
            if (zoneOfCell(row, col) === "production") {
              productionMaxRow = Math.max(productionMaxRow, row);
            }
          }
        }
        maxRow = Math.max(maxRow, range.rowEnd);
        maxCol = Math.max(maxCol, range.colEnd);
      }
      return { occupied, maxRow, maxCol, productionMaxRow, feedsFrom };
    },
  };
}

function bandFirstFree(context, rows, cols) {
  return firstFreeCellIn(context.occupied, rows, cols);
}

function zoneFirstFree(context, zone) {
  const maxRow = Math.max(context.maxRow, 0);
  const maxCol = Math.max(context.maxCol, 0);
  if (zone === "dock-left") return bandFirstFree(context, [0, maxRow + 1], [0, 0]);
  if (zone === "results") {
    return bandFirstFree(context, [0, maxRow + 1], [ZONES.RESULTS_COL, Math.max(ZONES.RESULTS_COL, maxCol) + 1]);
  }
  if (zone === "staging") {
    return bandFirstFree(
      context,
      [ZONES.STAGING_ROW, Math.max(ZONES.STAGING_ROW, maxRow) + 1],
      [0, Math.max(5, maxCol)]
    );
  }
  return bandFirstFree(
    context,
    [0, Math.min(maxRow + 1, ZONES.STAGING_ROW - 1)],
    [ZONES.PRODUCTION_FIRST_COL, PRODUCTION_LAST_COL]
  );
}

// Ring search for the closest unoccupied cell (Chebyshev radius up to
// 8). Deliberately never enters the staging band: staging is the
// degrade destination, not a search space, so relative placements
// stay inside working zones and degradations stay visible.
function nearestFreeCell(context, row, col) {
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const targetRow = row + dr;
        const targetCol = col + dc;
        if (targetRow < 0 || targetCol < 0) continue;
        if (targetRow >= ZONES.STAGING_ROW) continue;
        if (!context.occupied.has(cellKey(targetRow, targetCol))) {
          return { row: targetRow, col: targetCol };
        }
      }
    }
  }
  return null;
}

function findNodeByRef(graphStore, idMap, ref) {
  const resolved = String(idMap?.get?.(ref) || ref || "");
  return safeArray(graphStore?.nodes).find((node) => node?.id === resolved) || null;
}

function placementSuccess(cell, reason) {
  return { row: cell.row, col: cell.col, reason: `${reason} (${cellKey(cell.row, cell.col)})` };
}

function placementDegrade(context, nodeId, cause) {
  const cell = zoneFirstFree(context, "staging");
  return {
    row: cell.row,
    col: cell.col,
    reason: `staging (${cellKey(cell.row, cell.col)}): ${cause}`,
    warning: `placement degraded to staging: ${cause} (node ${nodeId})`,
  };
}

function resolveCreatePlacement({ placement, nodeId, graphStore, idMap, context }) {
  if (!placement || typeof placement !== "object" || !PLACEMENT_STRATEGIES.has(placement.strategy)) {
    return placementDegrade(context, nodeId, `invalid placement strategy ${String(placement?.strategy || "<missing>")}`);
  }
  const strategy = placement.strategy;

  if (strategy === "in-zone") {
    const zone = PLACEMENT_ZONES.has(placement.zone) ? placement.zone : null;
    if (!zone) return placementDegrade(context, nodeId, `unknown zone ${String(placement.zone || "<missing>")}`);
    return placementSuccess(zoneFirstFree(context, zone), `in-zone ${zone}`);
  }

  if (strategy === "new-lane") {
    const row = context.productionMaxRow + 1;
    if (row >= ZONES.STAGING_ROW) return placementDegrade(context, nodeId, "production lanes are full");
    return placementSuccess({ row, col: ZONES.PRODUCTION_FIRST_COL }, `new-lane${placement.topic ? ` ${placement.topic}` : ""}`);
  }

  const anchorNode = placement.anchor ? findNodeByRef(graphStore, idMap, placement.anchor) : null;
  if (!anchorNode) {
    return placementDegrade(context, nodeId, `anchor not found: ${String(placement.anchor || "<missing>")}`);
  }
  const anchorCell = cellOf(anchorNode);

  if (strategy === "append-lane") {
    const row = anchorCell.row;
    for (let col = ZONES.PRODUCTION_FIRST_COL; col <= PRODUCTION_LAST_COL; col += 1) {
      if (!context.occupied.has(cellKey(row, col))) {
        return placementSuccess({ row, col }, `append-lane ${anchorNode.id}`);
      }
    }
    return placementDegrade(context, nodeId, `lane r${row + 1} is full`);
  }

  const offsets = {
    below: { row: 1, col: 0 },
    above: { row: -1, col: 0 },
    "left-of": { row: 0, col: -1 },
    "right-of": { row: 0, col: 1 },
    near: { row: 0, col: 0 },
  };
  const offset = offsets[strategy];
  const target = {
    row: Math.max(0, anchorCell.row + offset.row),
    col: Math.max(0, anchorCell.col + offset.col),
  };
  const free = nearestFreeCell(context, target.row, target.col);
  if (!free) return placementDegrade(context, nodeId, `no free cell near ${anchorNode.id}`);
  return placementSuccess(free, `${strategy} ${anchorNode.id}`);
}

/**
 * Spatial policy entry for OTHER executors (the canvas-skills path
 * creates drafts at the cursor via nodeFlows and must then honor the
 * same placement contract). Resolves the action's placement - or the
 * magnetic default - for an already-created node, excluding the
 * node's own provisional cursor cell from occupancy, and persists the
 * result through the movement guard. Returns a warning string when
 * resolution degraded.
 */
export function placeCreatedNodeBySpatialPolicy(graphStore, nodeId, action, { idMap = new Map(), actions = [] } = {}) {
  const node = safeArray(graphStore?.nodes).find((item) => String(item?.id) === String(nodeId));
  if (!node) return undefined;
  const context = createPlacementContext(graphStore, actions).scan();
  const selfRange = cellRangeOf(node);
  for (let row = selfRange.rowStart; row <= selfRange.rowEnd; row += 1) {
    for (let col = selfRange.colStart; col <= selfRange.colEnd; col += 1) {
      context.occupied.delete(cellKey(row, col));
    }
  }
  const meta = action?.placement
    ? resolveCreatePlacement({ placement: action.placement, nodeId, graphStore, idMap, context })
    : resolveMagneticDefault({ action: action || {}, nodeId, graphStore, idMap, context });
  const size = {
    width: Number(node.width) || DEFAULT_NODE_SIZE.width,
    height: Number(node.height) || DEFAULT_NODE_SIZE.height,
  };
  const px = cellToPx(meta.row, meta.col, size);
  applyNodePosition(graphStore, node, px.x, px.y);
  recordPlacement(graphStore, node, meta.reason);
  return meta.warning;
}

function resolveMagneticDefault({ action, nodeId, graphStore, idMap, context }) {
  if (isKnowledgeCardCreate(action)) {
    return placementSuccess(zoneFirstFree(context, "dock-left"), "dock-left default");
  }
  const sourceRef = context.feedsFrom.get(String(action.id || nodeId));
  if (sourceRef) {
    const anchorNode = findNodeByRef(graphStore, idMap, sourceRef);
    if (anchorNode) {
      const anchorCell = cellOf(anchorNode);
      const free = nearestFreeCell(context, anchorCell.row + 1, anchorCell.col);
      if (free) return placementSuccess(free, `below ${anchorNode.id}`);
    }
  }
  // Preserve the "appear beside what I'm looking at" UX: with an
  // active selection, coordinate-free nodes land grid-aligned to the
  // selection's right.
  const selection = graphSelectionBounds(graphStore);
  if (selection) {
    const selectionCell = cellOf(selection);
    const free = nearestFreeCell(context, selectionCell.row, selectionCell.col + 1);
    if (free) return placementSuccess(free, "near selection");
  }
  return placementSuccess(zoneFirstFree(context, "production"), "production default");
}
// --- end placement resolver -------------------------------------------

function normalizeActions(actions) {
  return Array.isArray(actions) ? actions : [];
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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nodeTypeDefaults(nodeType, data = {}) {
  if (nodeType === "ai-text") {
    return {
      prompt: "",
      content: "",
      text: "",
      outputText: "",
      isGenerating: false,
      jobStatus: null,
      generationStatus: null,
      ...data,
    };
  }
  if (nodeType === "ai-image") {
    return {
      prompt: "",
      images: [],
      mainImageIndex: 0,
      batchSize: 1,
      isGenerating: false,
      jobStatus: null,
      asyncTaskStatus: null,
      generationStatus: null,
      ...data,
    };
  }
  if (nodeType === "ai-video") {
    return {
      prompt: "",
      isGenerating: false,
      jobStatus: null,
      generationStatus: null,
      ...data,
    };
  }
  return { ...data };
}

function fallbackPosition(index) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: column * 380,
    y: row * 280,
  };
}

// Occupancy-aware chain packing for non-storyboard layout_nodes
// (single_chain / horizontal / branch_flow...). The legacy
// fallbackPosition placed every batch at the same fixed coordinates,
// so each PI generation piled its workflow on top of the previous one
// - the real-canvas "messy drop points" bug. The chain now lands on
// the first production row segment that actually fits it.
function packChainIntoGrid(graphStore, nodes, layoutLabel) {
  const chain = nodes.filter(Boolean);
  if (!chain.length) return;
  const targetIds = new Set(chain.map((node) => String(node.id)));
  const occupied = new Set();
  for (const node of safeArray(graphStore?.nodes)) {
    if (!node || targetIds.has(String(node.id)) || String(node.type) === "group") continue;
    const range = cellRangeOf(node);
    for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
      for (let col = range.colStart; col <= range.colEnd; col += 1) {
        occupied.add(cellKey(row, col));
      }
    }
  }

  const colsAvail = PRODUCTION_LAST_COL - ZONES.PRODUCTION_FIRST_COL + 1;
  const fitSpan = Math.min(chain.length, colsAvail);
  let start = null;
  for (let row = 0; row < ZONES.STAGING_ROW && !start; row += 1) {
    for (let col = ZONES.PRODUCTION_FIRST_COL; col <= PRODUCTION_LAST_COL - fitSpan + 1; col += 1) {
      let free = true;
      for (let offset = 0; offset < fitSpan; offset += 1) {
        if (occupied.has(cellKey(row, col + offset))) {
          free = false;
          break;
        }
      }
      if (free) {
        start = { row, col };
        break;
      }
    }
  }

  chain.forEach((node, index) => {
    const cell = start && index < fitSpan
      ? { row: start.row, col: start.col + index }
      : firstFreeCellIn(occupied, [0, ZONES.STAGING_ROW - 1], [ZONES.PRODUCTION_FIRST_COL, PRODUCTION_LAST_COL]);
    occupied.add(cellKey(cell.row, cell.col));
    const size = {
      width: Number(node.width) || DEFAULT_NODE_SIZE.width,
      height: Number(node.height) || DEFAULT_NODE_SIZE.height,
    };
    const px = cellToPx(cell.row, cell.col, size);
    applyNodePosition(graphStore, node, px.x, px.y);
    recordPlacement(graphStore, node, `layout ${layoutLabel} (${cellKey(cell.row, cell.col)})`);
  });
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nodeRect(node) {
  return {
    x: finiteNumber(node?.x) ?? finiteNumber(node?.position?.x) ?? 0,
    y: finiteNumber(node?.y) ?? finiteNumber(node?.position?.y) ?? 0,
    width: finiteNumber(node?.width) ?? finiteNumber(node?.size?.width) ?? DEFAULT_NODE_SIZE.width,
    height: finiteNumber(node?.height) ?? finiteNumber(node?.size?.height) ?? DEFAULT_NODE_SIZE.height,
  };
}

function boundsForNodes(nodes) {
  const rects = safeArray(nodes).filter(Boolean).map(nodeRect);
  if (!rects.length) {
    return null;
  }
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function graphSelectionBounds(graphStore) {
  const ids = safeArray(graphStore?.selectedNodeIds || graphStore?.selection?.selectedNodeIds)
    .map((id) => String(id || ""))
    .filter(Boolean);
  if (!ids.length) {
    return null;
  }
  const selected = safeArray(graphStore?.nodes).filter((node) => ids.includes(String(node?.id || "")));
  return boundsForNodes(selected);
}

function graphCanvasBounds(graphStore) {
  return boundsForNodes(safeArray(graphStore?.nodes));
}

function computeNonOverlappingPosition({ index = 0, anchor = null, gap = 96, size = DEFAULT_NODE_SIZE } = {}) {
  if (!anchor) {
    return fallbackPosition(index);
  }
  const width = finiteNumber(size.width) ?? DEFAULT_NODE_SIZE.width;
  return {
    x: (finiteNumber(anchor.x) ?? 120) + (finiteNumber(anchor.width) ?? 0) + gap + index * (width + gap),
    y: finiteNumber(anchor.y) ?? 120,
  };
}

function explicitPosition(action, nodeId, index) {
  const positions = action?.positions;
  if (Array.isArray(positions)) {
    const item = positions.find((entry) => String(entry?.nodeId || "") === String(nodeId)) || positions[index];
    if (item && (item.x !== undefined || item.y !== undefined)) {
      return item;
    }
  } else if (positions && typeof positions === "object") {
    const item = positions[nodeId] || positions[String(index)];
    if (item && typeof item === "object") {
      return item;
    }
  }
  if (action?.position && typeof action.position === "object") {
    return action.position;
  }
  return null;
}

function getWorkflowStep(node) {
  return node?.data?.workflowStep || node?.workflowStep || "";
}

function getShotIndex(node) {
  const raw = node?.data?.shotIndex ?? node?.shotIndex;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Unified onto the canvas-spatial GRID so a layout_nodes pass and a
// later tidy/placement land on the same cells - the legacy
// 280/380 spacing created a second grid that every tidy round-trip
// shifted off.
function applyStoryboardGridLayout(graphStore, nodes) {
  const selected = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  const shotColumnByStep = {
    shot_script: 1,
    shot_keyframe: 2,
    shot_video: 3,
  };
  let fallbackIndex = 0;

  const shotIndexes = selected
    .map(getShotIndex)
    .filter((index) => index !== null)
    .sort((a, b) => a - b);
  const uniqueShotIndexes = [...new Set(shotIndexes)];
  const shotRowByIndex = new Map(uniqueShotIndexes.map((index, row) => [index, row]));

  const placeAtCell = (node, row, col) => {
    const size = {
      width: Number(node.width) || DEFAULT_NODE_SIZE.width,
      height: Number(node.height) || DEFAULT_NODE_SIZE.height,
    };
    const px = cellToPx(row, col, size);
    applyNodePosition(graphStore, node, px.x, px.y);
  };

  selected.forEach((node) => {
    const step = getWorkflowStep(node);
    if (step === "story_outline") {
      placeAtCell(node, 0, ZONES.DOCK_COL);
      return;
    }
    if (step === "style_bible") {
      placeAtCell(node, 1, ZONES.DOCK_COL);
      return;
    }
    if (step in shotColumnByStep) {
      const shotIndex = getShotIndex(node);
      const row = shotRowByIndex.get(shotIndex) ?? fallbackIndex++;
      placeAtCell(node, row, shotColumnByStep[step]);
      return;
    }
    placeAtCell(node, uniqueShotIndexes.length + fallbackIndex, ZONES.PRODUCTION_FIRST_COL + (fallbackIndex++ % 4));
  });
}

function resolveNodeId(ref, idMap) {
  return idMap.get(ref) || ref;
}

function createEdgeId(from, to, index) {
  return `assistant-edge-${from}-${to}-${index}`;
}

function sanitizeIdPart(value, fallback = "item") {
  const text = String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function uniqueGraphId(graphStore, wanted) {
  const existing = new Set([
    ...safeArray(graphStore?.nodes).map((node) => String(node?.id || "")),
    ...safeArray(graphStore?.edges).map((edge) => String(edge?.id || "")),
  ]);
  const base = sanitizeIdPart(wanted, "assistant-copy");
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function sourceEdgeEndpoints(edge) {
  return {
    source: String(edge?.source || edge?.from || ""),
    target: String(edge?.target || edge?.to || ""),
  };
}

function duplicateBranchDescriptors(action) {
  const variants = Array.isArray(action?.variants) ? action.variants.filter(Boolean) : [];
  if (variants.length) {
    const capped = variants.slice(0, 5).map((variant, index) => ({
      id: sanitizeIdPart(variant?.id || variant?.label || variant?.name || `branch-${index + 1}`),
      label: String(variant?.label || variant?.name || variant?.id || `Variant ${index + 1}`).trim(),
      difference: String(variant?.difference || variant?.description || variant?.reason || "").trim(),
    }));
    while (capped.length < 3) {
      const index = capped.length;
      capped.push({
        id: `branch-${index + 1}`,
        label: `Variant ${index + 1}`,
        difference: "",
      });
    }
    return capped;
  }
  const requestedCount = Number(action?.branchCount || action?.count || 3);
  const count = Math.max(3, Math.min(5, Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 3));
  return Array.from({ length: count }, (_, index) => ({
    id: `branch-${index + 1}`,
    label: `Variant ${index + 1}`,
    difference: "",
  }));
}

function cloneNodeForVariant(node, { nodeId, branch, branchIndex, sourceNodeId, position }) {
  const data = cloneJson(node?.data || {}) || {};
  return {
    ...cloneJson(node),
    id: nodeId,
    x: position.x,
    y: position.y,
    data: {
      ...data,
      variantBranchId: branch.id,
      variantBranchLabel: branch.label,
      variantDifference: branch.difference,
      variantBranchIndex: branchIndex + 1,
      variantSourceNodeId: sourceNodeId,
    },
  };
}

function isGenerationAction(action) {
  return (
    action?.type === "queue_generation_task" ||
    action?.type === "run_prompt_preset_generation"
  );
}

function existingPromptOf(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  return String(node?.data?.prompt ?? node?.prompt ?? "").trim();
}

function nextPromptFromAction(action, patch) {
  if (action?.nextPrompt !== undefined) {
    return String(action.nextPrompt);
  }
  if (action?.prompt !== undefined) {
    return String(action.prompt);
  }
  if (patch && Object.hasOwn(patch, "prompt")) {
    return String(patch.prompt);
  }
  return "";
}

function defaultPromptDiff(previousPrompt, nextPrompt) {
  if (previousPrompt === nextPrompt || (!previousPrompt && !nextPrompt)) {
    return "";
  }
  return [`- ${previousPrompt}`, `+ ${nextPrompt}`].join("\n");
}

function promptSurgeryRecord(action, nodeId, node, patch) {
  const hasPromptPatch = Boolean(
    action?.previousPrompt !== undefined ||
      action?.nextPrompt !== undefined ||
      action?.promptDiff ||
      action?.undoPatch ||
      action?.prompt !== undefined ||
      (patch && Object.hasOwn(patch, "prompt"))
  );
  if (!hasPromptPatch) {
    return null;
  }
  const previousPrompt =
    action?.previousPrompt !== undefined ? String(action.previousPrompt) : existingPromptOf(node);
  const nextPrompt = nextPromptFromAction(action, patch);
  const promptDiff = String(action?.promptDiff || action?.diff || defaultPromptDiff(previousPrompt, nextPrompt));
  const undoPatch =
    action?.undoPatch && typeof action.undoPatch === "object"
      ? cloneJson(action.undoPatch)
      : {
          type: "update_node_data",
          nodeId,
          data: { prompt: previousPrompt },
        };
  return {
    nodeId,
    previousPrompt,
    nextPrompt,
    promptDiff,
    undoPatch,
  };
}

function getNodeTypeById(graphStore, nodeId) {
  const node = graphStore?.nodes?.find?.((item) => item?.id === nodeId);
  return node?.type || node?.nodeType || node?.data?.nodeType || "";
}

function getGenerationNodeType(action, graphStore, nodeId) {
  return action?.nodeType || action?.data?.nodeType || action?.data?.type || getNodeTypeById(graphStore, nodeId);
}

function findRendererTaskRunner(task) {
  const bridge =
    globalThis.window?.__v2RendererBridge ||
    globalThis.window?.v2Renderer ||
    globalThis.__v2RendererBridge ||
    globalThis.v2Renderer;
  const instance = bridge?.nodeInstances?.get?.(task.nodeId);
  const runner = instance?._onGenerate || instance?.onGenerate;
  if (typeof runner !== "function") {
    return null;
  }
  return { instance, runner };
}

function actionMetadata(action = {}) {
  const metadata = action.metadata && typeof action.metadata === "object" ? action.metadata : {};
  return {
    transactionId: String(action.transactionId || metadata.transactionId || ""),
    conversationId: String(action.conversationId || metadata.conversationId || ""),
    messageId: String(action.messageId || metadata.messageId || ""),
    traceId: String(action.traceId || metadata.traceId || ""),
  };
}

function generationIdempotencyKey(action, { actionId, nodeId }) {
  if (action.idempotencyKey) {
    return String(action.idempotencyKey);
  }
  const metadata = actionMetadata(action);
  if (metadata.transactionId) {
    return [metadata.transactionId, nodeId, action.type].filter(Boolean).join(":");
  }
  return [metadata.conversationId, metadata.messageId, actionId, nodeId].filter(Boolean).join(":");
}

function generationTaskData(action, { actionId, nodeId, nodeType, promptFallback = "" }) {
  const metadata = actionMetadata(action);
  return {
    ...action,
    idempotencyKey: generationIdempotencyKey(action, { actionId, nodeId }),
    transactionId: metadata.transactionId,
    conversationId: metadata.conversationId,
    messageId: metadata.messageId,
    traceId: metadata.traceId,
    nodeId,
    nodeType,
    provider: String(action.provider || action.metadata?.provider || ""),
    model: String(action.model || action.modelId || action.metadata?.model || ""),
    prompt: action.prompt || action.template || promptFallback || "",
    references: safeArray(action.references).map(cloneJson),
  };
}

function setGenerationNodeStatus(graphStore, nodeId, status, patch = {}) {
  graphStore.updateNodeData?.(nodeId, {
    generationStatus: status,
    jobStatus: status,
    asyncTaskStatus: status,
    isGenerating: status === "running",
    ...patch,
  });
}

function didStartGeneration(value) {
  if (value === false) {
    return false;
  }
  if (value && typeof value === "object") {
    return value.started !== false && value.pending !== true;
  }
  return true;
}

function shouldCompleteGeneration(value) {
  if (!didStartGeneration(value)) {
    return false;
  }
  if (value && typeof value === "object") {
    const meaningful = Object.keys(value).filter(
      (key) => !["started", "pending", "duplicate", "retryable", "reason", "message", "taskId"].includes(key)
    );
    return meaningful.length > 0;
  }
  return false;
}

function generationResultPayload(value, nodeId) {
  if (value && typeof value === "object") {
    const { started, pending, duplicate, retryable, reason, message, taskId, ...rest } = value;
    return Object.keys(rest).length ? rest : { nodeId };
  }
  return { nodeId };
}

function rememberTask(result, task) {
  if (task && typeof task === "object") {
    result.generationTasks.push(cloneJson(task));
  }
}

function stringField(value) {
  return String(value ?? "").trim();
}

function sourceField(data, ...keys) {
  for (const key of keys) {
    const text = stringField(data?.[key]);
    if (text) {
      return text;
    }
  }
  return "";
}

function isKnowledgeCardCreate(action) {
  const nodeType = stringField(action?.nodeType);
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  return (
    ["comment", "source-text"].includes(nodeType) &&
    (
      data.workflowKind === "knowledge_card" ||
      data.citationKind === "llm_wiki" ||
      Boolean(sourceField(data, "sourceTitle", "sourceName", "knowledgeTitle", "fileId", "sourceFileId", "knowledgeFileId"))
    )
  );
}

function knowledgeCardDisplay(data) {
  const title = sourceField(data, "sourceTitle", "sourceName", "knowledgeTitle", "title");
  const fileId = sourceField(data, "fileId", "sourceFileId", "knowledgeFileId");
  const explicit = sourceField(data, "citationDisplay");
  return explicit || [title, fileId ? `(${fileId})` : ""].filter(Boolean).join(" ").trim();
}

function formatKnowledgeCardData(action) {
  const data = cloneJson(action.data || {}) || {};
  const title = sourceField(data, "sourceTitle", "sourceName", "knowledgeTitle", "title") || stringField(action.name || action.title);
  const fileId = sourceField(data, "fileId", "sourceFileId", "knowledgeFileId");
  const projectId = sourceField(data, "projectId", "sourceProjectId", "knowledgeProjectId", "citationProjectId");
  const citation = sourceField(data, "citation");
  const display = knowledgeCardDisplay(data) || title || fileId;
  const summary = sourceField(data, "summary", "content", "text");
  const lines = [
    title ? `Title: ${title}` : "",
    summary ? `Summary: ${summary}` : "",
    fileId ? `Source file: ${fileId}` : "",
    projectId ? `Project: ${projectId}` : "",
    citation ? `Citation: ${citation}` : "",
  ].filter(Boolean);
  const content = sourceField(data, "content", "text") || lines.join("\n");
  return {
    ...data,
    workflowKind: data.workflowKind || "knowledge_card",
    workflowStep: data.workflowStep || "llm_wiki_card",
    citationKind: data.citationKind || "llm_wiki",
    citationDisplay: display,
    citationProjectId: projectId,
    content,
  };
}

function knowledgeCardTrace(nodeId, data) {
  return {
    nodeId,
    title: sourceField(data, "sourceTitle", "sourceName", "knowledgeTitle", "title"),
    fileId: sourceField(data, "fileId", "sourceFileId", "knowledgeFileId"),
    projectId: sourceField(data, "projectId", "sourceProjectId", "knowledgeProjectId", "citationProjectId"),
    citation: sourceField(data, "citation"),
    citationDisplay: knowledgeCardDisplay(data),
  };
}

function safeStringList(value, limit = 12) {
  if (!Array.isArray(value)) {
    const text = stringField(value);
    return text ? [text] : [];
  }
  return value
    .map((item) => stringField(item))
    .filter(Boolean)
    .slice(0, limit);
}

function workflowTemplateId(action) {
  return sanitizeIdPart(action?.templateId || action?.id || action?.name || "workflow-template", "workflow-template");
}

function workflowTemplateMetadata(action) {
  const metadata = action?.metadata && typeof action.metadata === "object" ? action.metadata : {};
  return {
    templateId: workflowTemplateId(action),
    name: stringField(action?.name || action?.title || metadata.name || metadata.title),
    description: stringField(action?.description || metadata.description),
    scope: stringField(action?.scope || metadata.scope) || "project",
    projectId: stringField(action?.projectId || metadata.projectId),
    teamId: stringField(action?.teamId || metadata.teamId),
    version: stringField(action?.version || action?.templateVersion || metadata.version || metadata.templateVersion) || "1.0.0",
    author: stringField(action?.author || metadata.author),
    tags: safeStringList(action?.tags ?? metadata.tags),
    reviewStatus: stringField(action?.reviewStatus || metadata.reviewStatus),
    reviewedBy: stringField(action?.reviewedBy || action?.reviewer || metadata.reviewedBy || metadata.reviewer),
    publishedBy: stringField(action?.publishedBy || metadata.publishedBy),
    reuseCount: Number.isFinite(Number(action?.reuseCount ?? metadata.reuseCount))
      ? Number(action?.reuseCount ?? metadata.reuseCount)
      : 0,
    deprecated: action?.deprecated === true || metadata.deprecated === true,
    deprecatedReason: stringField(action?.deprecatedReason || action?.reason || metadata.deprecatedReason || metadata.reason),
    rollbackOf: stringField(action?.rollbackOf || metadata.rollbackOf),
    rollbackToVersion: stringField(action?.rollbackToVersion || metadata.rollbackToVersion),
    metadata: cloneJson(metadata) || {},
  };
}

function buildWorkflowTemplateRecord(action, graphStore, idMap) {
  const sourceNodeIds = safeArray(action.nodeIds || action.nodes)
    .map((nodeId) => resolveNodeId(nodeId, idMap))
    .filter(Boolean);
  const sourceNodes = sourceNodeIds
    .map((nodeId) => graphStore.nodes?.find?.((node) => String(node?.id || "") === String(nodeId)))
    .filter(Boolean);
  const sourceIdSet = new Set(sourceNodes.map((node) => String(node.id)));
  const sourceEdges = safeArray(graphStore.edges).filter((edge) => {
    const { source, target } = sourceEdgeEndpoints(edge);
    return sourceIdSet.has(source) && sourceIdSet.has(target);
  });
  return {
    ...workflowTemplateMetadata(action),
    nodeIds: sourceNodes.map((node) => String(node.id)),
    nodes: sourceNodes.map(cloneJson),
    edges: sourceEdges.map(cloneJson),
  };
}

function saveWorkflowTemplate(templateStore, localTemplates, record) {
  const saved =
    typeof templateStore?.save === "function"
      ? templateStore.save(cloneJson(record))
      : typeof templateStore?.set === "function"
      ? templateStore.set(record.templateId, cloneJson(record))
      : null;
  const finalRecord = saved && typeof saved === "object" && saved.templateId ? saved : record;
  localTemplates.set(finalRecord.templateId, cloneJson(finalRecord));
  return finalRecord;
}

function loadWorkflowTemplate(action, templateStore, localTemplates) {
  const direct = action?.template && typeof action.template === "object" ? action.template : null;
  if (direct) {
    return direct;
  }
  const templateId = workflowTemplateId(action);
  if (localTemplates.has(templateId)) {
    return localTemplates.get(templateId);
  }
  if (typeof templateStore?.get === "function") {
    const version = stringField(action?.version || action?.templateVersion || action?.metadata?.version || action?.metadata?.templateVersion);
    const scope = stringField(action?.scope || action?.metadata?.scope);
    const teamId = stringField(action?.teamId || action?.metadata?.teamId);
    const options = {
      ...(version ? { version } : {}),
      ...(scope ? { scope } : {}),
      ...(teamId ? { teamId } : {}),
    };
    return templateStore.get(templateId, Object.keys(options).length ? options : undefined);
  }
  if (typeof templateStore?.load === "function") {
    return templateStore.load(templateId);
  }
  return null;
}

const TEMPLATE_GOVERNANCE_ACTION_TYPES = new Set([
  "submit_workflow_template_review",
  "review_workflow_template",
  "publish_workflow_template",
  "deprecate_workflow_template",
  "rollback_workflow_template",
  "record_workflow_template_reuse",
]);

function templateGovernanceEvent(action, record) {
  return {
    type: action.type,
    templateId: stringField(record?.templateId || action.templateId || action.id),
    scope: stringField(record?.scope || action.scope || "project"),
    teamId: stringField(record?.teamId || action.teamId),
    version: stringField(record?.version || action.version || action.templateVersion),
    reviewStatus: stringField(record?.reviewStatus || action.reviewStatus),
    reviewer: stringField(record?.reviewedBy || record?.reviewer || action.reviewedBy || action.reviewer),
    publishedBy: stringField(record?.publishedBy || action.publishedBy),
    reuseCount: Number(record?.reuseCount || action.reuseCount || 0) || 0,
    rollbackToVersion: stringField(record?.rollbackToVersion || action.rollbackToVersion || action.toVersion),
    deprecated: record?.deprecated === true || action.deprecated === true,
  };
}

function applyWorkflowTemplateGovernance(action, templateStore) {
  const templateId = workflowTemplateId(action);
  if (!templateStore) {
    return { record: null, warning: "workflow template store unavailable" };
  }
  if (action.type === "submit_workflow_template_review" && typeof templateStore.submitForReview === "function") {
    return {
      record: templateStore.submitForReview(templateId, {
        author: action.author || action.userId,
        note: action.note || action.reviewNote || action.description,
        version: action.version || action.templateVersion,
      }),
    };
  }
  if (action.type === "review_workflow_template" && typeof templateStore.review === "function") {
    return {
      record: templateStore.review(templateId, {
        decision: action.decision || action.reviewDecision || action.reviewStatus,
        reviewer: action.reviewer || action.reviewedBy || action.userId,
        note: action.note || action.reviewComment || action.description,
        version: action.version || action.templateVersion,
      }),
    };
  }
  if (action.type === "publish_workflow_template" && typeof templateStore.publish === "function") {
    return {
      record: templateStore.publish(templateId, {
        teamId: action.teamId,
        publishedBy: action.publishedBy || action.userId || action.author,
        version: action.version || action.templateVersion,
      }),
    };
  }
  if (action.type === "record_workflow_template_reuse" && typeof templateStore.recordReuse === "function") {
    return {
      record: templateStore.recordReuse(templateId, {
        scope: action.scope || "project",
        userId: action.userId || action.reusedBy,
        consumerProjectId: action.consumerProjectId || action.projectId,
      }),
    };
  }
  if (action.type === "deprecate_workflow_template" && typeof templateStore.deprecate === "function") {
    return {
      record: templateStore.deprecate(templateId, {
        scope: action.scope || "project",
        reason: action.reason || action.deprecatedReason || action.description,
        author: action.author || action.deprecatedBy || action.userId,
      }),
    };
  }
  if (action.type === "rollback_workflow_template" && typeof templateStore.rollback === "function") {
    return {
      record: templateStore.rollback(templateId, {
        scope: action.scope || "project",
        toVersion: action.rollbackToVersion || action.toVersion,
        version: action.version || action.templateVersion,
        author: action.author || action.userId,
      }),
    };
  }
  return { record: null, warning: `workflow template governance unsupported: ${action.type}` };
}

function applyWorkflowTemplateRecord(record, action, graphStore) {
  const templateId = stringField(record?.templateId || action?.templateId || action?.id);
  const version = stringField(record?.version || action?.version || action?.templateVersion);
  const offset = action?.offset && typeof action.offset === "object" ? action.offset : {};
  const defaultAnchor = graphCanvasBounds(graphStore);
  const defaultOffset = defaultAnchor
    ? { x: defaultAnchor.x + defaultAnchor.width + 160, y: defaultAnchor.y }
    : { x: 360, y: 0 };
  const offsetX = finiteNumber(offset.x) ?? finiteNumber(action?.offsetX) ?? defaultOffset.x;
  const offsetY = finiteNumber(offset.y) ?? finiteNumber(action?.offsetY) ?? defaultOffset.y;
  const nodeMap = new Map();
  const createdNodeIds = [];
  const createdEdgeIds = [];

  for (const node of safeArray(record?.nodes)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const sourceNodeId = stringField(node.id || node.nodeId);
    if (!sourceNodeId) {
      continue;
    }
    const nextId = uniqueGraphId(graphStore, `${sanitizeIdPart(templateId, "template")}-${sanitizeIdPart(sourceNodeId)}`);
    nodeMap.set(sourceNodeId, nextId);
    const sourceX = finiteNumber(node.x) ?? finiteNumber(node.position?.x) ?? 0;
    const sourceY = finiteNumber(node.y) ?? finiteNumber(node.position?.y) ?? 0;
    const nextNode = {
      ...cloneJson(node),
      id: nextId,
      x: sourceX + offsetX,
      y: sourceY + offsetY,
      data: {
        ...(cloneJson(node.data || {}) || {}),
        templateId,
        templateVersion: version,
        templateSourceNodeId: sourceNodeId,
      },
    };
    graphStore.addNode(nextNode);
    createdNodeIds.push(nextId);
  }

  safeArray(record?.edges).forEach((edge, index) => {
    const { source, target } = sourceEdgeEndpoints(edge);
    const nextSource = nodeMap.get(source);
    const nextTarget = nodeMap.get(target);
    if (!nextSource || !nextTarget) {
      return;
    }
    const nextEdge = {
      ...cloneJson(edge),
      id: uniqueGraphId(graphStore, `${sanitizeIdPart(templateId, "template")}-edge-${index + 1}`),
      source: nextSource,
      target: nextTarget,
      templateId,
    };
    delete nextEdge.from;
    delete nextEdge.to;
    graphStore.addEdge(nextEdge);
    createdEdgeIds.push(nextEdge.id);
  });

  return { createdNodeIds, createdEdgeIds };
}

function defaultWorkflowTemplateStoreForActions(actions) {
  const storage = globalThis.window?.localStorage || globalThis.localStorage;
  if (!storage) {
    return null;
  }
  const templateAction = safeArray(actions).find((action) =>
    ["create_workflow_template", "apply_workflow_template"].includes(action?.type)
  );
  if (!templateAction) {
    return null;
  }
  const metadata = templateAction.metadata && typeof templateAction.metadata === "object" ? templateAction.metadata : {};
  const projectId = stringField(templateAction.projectId || metadata.projectId || "default-project");
  return createAssistantWorkflowTemplateStore({ storage, projectId });
}

function mergeResultArray(current, next) {
  const combined = [...safeArray(current), ...safeArray(next)];
  if (combined.every((item) => typeof item === "string")) {
    return [...new Set(combined)];
  }
  return combined;
}

function mergeExecutionResults(...results) {
  const merged = {};
  for (const result of results) {
    if (!result || typeof result !== "object") {
      continue;
    }
    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        merged[key] = mergeResultArray(merged[key], value);
        continue;
      }
      if (key === "appliedCount" && typeof value === "number") {
        merged[key] = Number(merged[key] || 0) + value;
        continue;
      }
      if (key === "success" && typeof value === "boolean") {
        merged[key] = merged[key] === undefined ? value : merged[key] && value;
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        merged[key] = { ...(merged[key] && typeof merged[key] === "object" ? merged[key] : {}), ...cloneJson(value) };
        continue;
      }
      if (merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function remapNodeId(value, actionNodeIdMap = {}) {
  const key = String(value || "").trim();
  return key && actionNodeIdMap[key] ? actionNodeIdMap[key] : value;
}

function remapLegacyActionReferences(action = {}, actionNodeIdMap = {}) {
  const clone = cloneJson(action) || {};
  for (const key of ["nodeId", "targetNodeId", "from", "to", "source", "target"]) {
    if (clone[key] !== undefined) {
      clone[key] = remapNodeId(clone[key], actionNodeIdMap);
    }
  }
  if (Array.isArray(clone.nodeIds)) {
    clone.nodeIds = clone.nodeIds.map((nodeId) => remapNodeId(nodeId, actionNodeIdMap));
  }
  if (Array.isArray(clone.nodes)) {
    clone.nodes = clone.nodes.map((nodeId) => remapNodeId(nodeId, actionNodeIdMap));
  }
  return clone;
}

export async function defaultGenerationTaskRunner(task) {
  const storage = globalThis.window?.localStorage || globalThis.localStorage;
  const taskStore = createAssistantGenerationTaskStore({ storage });
  const idempotencyKey = String(task?.idempotencyKey || "").trim();
  const existing = idempotencyKey
    ? taskStore.list().find((item) => item.idempotencyKey === idempotencyKey)
    : null;
  if (existing) {
    return { started: false, pending: true, duplicate: true, taskId: existing.id };
  }
  const queuedTask = taskStore.queueOnce(task);
  const target = findRendererTaskRunner(task);
  if (target) {
    const runnableTask = { ...task, id: queuedTask.id };
    taskStore.start(queuedTask.id);
    try {
      await target.runner.call(target.instance, task.prompt || task.template || "", runnableTask);
      return { started: true, taskId: queuedTask.id };
    } catch (error) {
      taskStore.fail(queuedTask.id, error?.message || error);
      throw error;
    }
  }
  return { started: false, pending: true, taskId: queuedTask.id };
}

export async function executeAssistantActions({
  actions,
  graphStore,
  generationTaskRunner = defaultGenerationTaskRunner,
  generationTaskStore = null,
  templateStore = null,
  canvasSkillsRuntime = null,
  agentMode = "plan",
  videoAuthorized = false,
  // Trusted-writer execution option (e.g. "qmai-director"). Set by
  // code at the call site only - never derived from action fields.
  source = "",
} = {}) {
  if (!graphStore) {
    throw new TypeError("graphStore is required");
  }
  const normalizedActions = normalizeActions(actions);
  if (
    canvasSkillsRuntime &&
    typeof canvasSkillsRuntime.executeActions === "function" &&
    normalizedActions.some((action) => isCanvasSkillActionCandidate(action, { graphStore }))
  ) {
    const canvasActions = normalizedActions.filter((action) => isCanvasSkillActionCandidate(action, { graphStore }));
    const legacyActions = normalizedActions.filter((action) => !isCanvasSkillActionCandidate(action, { graphStore }));
    const canvasResult = await canvasSkillsRuntime.executeActions({
      actions: canvasActions,
      graphStore,
      videoAuthorized,
      agentMode,
      source,
    });
    if (!legacyActions.length) {
      return canvasResult;
    }
    const remappedLegacyActions = legacyActions.map((action) =>
      remapLegacyActionReferences(action, canvasResult?.actionNodeIdMap)
    );
    const legacyResult = await executeAssistantActions({
      actions: remappedLegacyActions,
      graphStore,
      generationTaskRunner,
      generationTaskStore,
      templateStore,
      canvasSkillsRuntime: null,
      agentMode,
      videoAuthorized,
      source,
    });
    return mergeExecutionResults(canvasResult, legacyResult);
  }
  const idMap = new Map();
  const placementContext = createPlacementContext(graphStore, normalizedActions);
  const result = {
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
    promptSurgeryPatches: [],
    knowledgeCards: [],
    tidiedNodeIds: [],
    skippedPinnedIds: [],
    createdTemplateIds: [],
    appliedTemplateIds: [],
    workflowTemplates: [],
    governedTemplateIds: [],
    templateGovernanceEvents: [],
    warnings: [],
  };
  const localTemplates = new Map();
  const effectiveTemplateStore = templateStore || defaultWorkflowTemplateStoreForActions(actions);

  for (const [index, action] of normalizedActions.entries()) {
    if (!action || typeof action !== "object") {
      continue;
    }
    if (action.type === "create_node") {
      const nodeId = action.nodeId || action.id || `assistant-node-${Date.now()}-${index}`;
      const size = {
        width: action.size?.width || DEFAULT_NODE_SIZE.width,
        height: action.size?.height || DEFAULT_NODE_SIZE.height,
      };
      // Semantic placement wins over any model-provided pixels; an
      // explicit position is honored only when no placement is given;
      // otherwise the magnetic default decides.
      let placementMeta = null;
      let position = null;
      if (action.placement) {
        placementMeta = resolveCreatePlacement({
          placement: action.placement,
          nodeId,
          graphStore,
          idMap,
          context: placementContext.scan(),
        });
      } else if (action.position) {
        position = action.position;
      } else {
        placementMeta = resolveMagneticDefault({
          action,
          nodeId,
          graphStore,
          idMap,
          context: placementContext.scan(),
        });
      }
      if (placementMeta) {
        position = cellToPx(placementMeta.row, placementMeta.col, size);
      }
      const data = isKnowledgeCardCreate(action)
        ? formatKnowledgeCardData(action)
        : action.data || {};
      const node = {
        id: nodeId,
        type: action.nodeType,
        x: Number(position.x || 0),
        y: Number(position.y || 0),
        width: size.width,
        height: size.height,
        name: action.name || action.title || "",
        data: nodeTypeDefaults(action.nodeType, data),
      };
      if (placementMeta) {
        // Set lineage on the object BEFORE addNode persists it (real
        // stores clone on insert); the store-API write happens after
        // the node exists (updateNodeData throws on unknown ids).
        node.data = { ...(node.data || {}), placementReason: placementMeta.reason };
        if (placementMeta.warning) {
          result.warnings.push(placementMeta.warning);
        }
      }
      graphStore.addNode(node);
      if (placementMeta) {
        recordPlacement(graphStore, node, placementMeta.reason);
      }
      idMap.set(action.id || nodeId, nodeId);
      result.createdNodeIds.push(nodeId);
      if (isKnowledgeCardCreate(action)) {
        result.knowledgeCards.push(knowledgeCardTrace(nodeId, node.data));
      }
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "connect_nodes") {
      const from = resolveNodeId(action.from, idMap);
      const to = resolveNodeId(action.to, idMap);
      const edge = {
        id: action.id || createEdgeId(from, to, index),
        source: from,
        target: to,
        label: action.label || "",
      };
      if (action.sourceHandle || action.fromHandle) {
        edge.sourceHandle = String(action.sourceHandle || action.fromHandle);
      }
      if (action.targetHandle || action.toHandle) {
        edge.targetHandle = String(action.targetHandle || action.toHandle);
      }
      graphStore.addEdge(edge);
      result.createdEdgeIds.push(edge.id);
      result.appliedCount += 1;
      continue;
    }

    if (
      action.type === "update_node" ||
      action.type === "update_node_data" ||
      action.type === "set_node_prompt" ||
      action.type === "set_node_model" ||
      action.type === "rename_node"
    ) {
      const nodeId = resolveNodeId(action.nodeId || action.id, idMap);
      const node = graphStore.nodes?.find?.((item) => item?.id === nodeId);
      if (!node) {
        result.warnings.push(`update target node not found: ${nodeId || "unknown"}`);
        continue;
      }
      const patch = {
        ...(action.data && typeof action.data === "object" ? action.data : {}),
        ...(action.patch && typeof action.patch === "object" ? action.patch : {}),
      };
      if (action.prompt !== undefined) {
        patch.prompt = action.prompt;
      }
      if (action.model !== undefined) {
        patch.model = action.model;
      }
      const promptSurgery = promptSurgeryRecord(action, nodeId, node, patch);
      if (Object.keys(patch).length) {
        graphStore.updateNodeData?.(nodeId, patch);
      }
      if (action.name || action.title) {
        if (typeof graphStore.updateNode === "function") {
          graphStore.updateNode(nodeId, { name: action.name || action.title });
        } else {
          node.name = action.name || action.title;
        }
      }
      if (promptSurgery) {
        result.promptSurgeryPatches.push(promptSurgery);
      }
      result.updatedNodeIds.push(nodeId);
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "layout_nodes") {
      const nodeIds = (action.nodeIds || []).map((nodeId) => resolveNodeId(nodeId, idMap));
      const resolved = nodeIds.map((nodeId) => graphStore.nodes?.find?.((item) => item.id === nodeId));
      // Pinned sovereignty applies to every layout path, not just tidy
      // and semantic moves.
      const pinnedHere = resolved.filter((node) => isPinnedNode(node));
      for (const node of pinnedHere) {
        result.skippedPinnedIds.push(node.id);
      }
      const nodes = resolved.filter((node) => !isPinnedNode(node));
      nodes.forEach((node) => {
        if (node) graphStore.updateNodeData?.(node.id, { layoutStrategy: action.layout || "horizontal" });
      });
      if (action.layout === "storyboard_grid") {
        applyStoryboardGridLayout(graphStore, nodes);
        nodes.forEach((node) => {
          if (node) {
            recordPlacement(graphStore, node, "layout storyboard_grid");
          }
        });
      } else {
        packChainIntoGrid(graphStore, nodes, action.layout || "horizontal");
      }
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "tidy_canvas") {
      const outcome = tidyCanvas(graphStore, action.scope || "all");
      result.tidiedNodeIds.push(...outcome.movedNodeIds);
      result.skippedPinnedIds.push(...outcome.skippedPinnedIds);
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "move_nodes" && action.placement) {
      // Semantic move: the placement resolver owns the target; pinned
      // nodes keep user sovereignty and are skipped with a visible
      // record.
      const nodeIds = (action.nodeIds || []).map((nodeId) => resolveNodeId(nodeId, idMap));
      for (const nodeId of nodeIds) {
        const node = graphStore.nodes?.find?.((item) => item?.id === nodeId);
        if (!node) {
          result.warnings.push(`move target node not found: ${nodeId}`);
          continue;
        }
        if (isPinnedNode(node)) {
          result.skippedPinnedIds.push(nodeId);
          continue;
        }
        const meta = resolveCreatePlacement({
          placement: action.placement,
          nodeId,
          graphStore,
          idMap,
          context: placementContext.scan(),
        });
        const size = { width: Number(node.width) || DEFAULT_NODE_SIZE.width, height: Number(node.height) || DEFAULT_NODE_SIZE.height };
        const px = cellToPx(meta.row, meta.col, size);
        applyNodePosition(graphStore, node, px.x, px.y);
        recordPlacement(graphStore, node, meta.reason);
        if (meta.warning) result.warnings.push(meta.warning);
      }
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "move_nodes") {
      const nodeIds = (action.nodeIds || []).map((nodeId) => resolveNodeId(nodeId, idMap));
      const nodes = nodeIds.map((nodeId) => graphStore.nodes?.find?.((item) => item.id === nodeId));
      const anchor = graphSelectionBounds(graphStore) || graphCanvasBounds(graphStore) || { x: 120, y: 120, width: 0, height: 0 };
      nodes.forEach((node, moveIndex) => {
        if (!node) {
          return;
        }
        if (isPinnedNode(node)) {
          result.skippedPinnedIds.push(node.id);
          return;
        }
        const position = explicitPosition(action, node.id, moveIndex) || computeNonOverlappingPosition({
          index: moveIndex,
          anchor,
          gap: Number(action.gap || 96) || 96,
          size: { width: node.width || DEFAULT_NODE_SIZE.width, height: node.height || DEFAULT_NODE_SIZE.height },
        });
        applyNodePosition(graphStore, node, Number(position.x || 0), Number(position.y || 0));
        recordPlacement(graphStore, node, "move_nodes legacy");
        result.updatedNodeIds.push(node.id);
      });
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "create_group") {
      const nodeIds = (action.nodeIds || []).map((nodeId) => resolveNodeId(nodeId, idMap));
      const nodes = nodeIds.map((nodeId) => graphStore.nodes?.find?.((item) => item.id === nodeId)).filter(Boolean);
      if (!nodes.length) {
        result.warnings.push("create_group target nodes not found");
        continue;
      }
      const bounds = boundsForNodes(nodes) || { x: 120, y: 120, width: 0, height: 0 };
      const padding = Number(action.padding || 48) || 48;
      const groupId = action.nodeId || action.id || `assistant-group-${Date.now()}-${index}`;
      const group = {
        id: groupId,
        type: "group",
        x: bounds.x - padding,
        y: bounds.y - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
        name: action.name || action.title || "Group",
        data: {
          ...(action.data && typeof action.data === "object" ? action.data : {}),
          nodeIds,
        },
      };
      graphStore.addNode(group);
      idMap.set(action.id || groupId, groupId);
      result.createdNodeIds.push(groupId);
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "duplicate_nodes") {
      const sourceNodeIds = safeArray(action.nodeIds || action.nodes)
        .map((nodeId) => resolveNodeId(nodeId, idMap))
        .filter(Boolean);
      const sourceNodes = sourceNodeIds
        .map((nodeId) => graphStore.nodes?.find?.((item) => item?.id === nodeId))
        .filter(Boolean);
      if (!sourceNodes.length) {
        result.warnings.push("duplicate_nodes target nodes not found");
        continue;
      }
      const sourceIdSet = new Set(sourceNodes.map((node) => String(node.id)));
      const sourceEdges = safeArray(graphStore.edges).filter((edge) => {
        const { source, target } = sourceEdgeEndpoints(edge);
        return sourceIdSet.has(source) && sourceIdSet.has(target);
      });
      const bounds = boundsForNodes(sourceNodes) || { x: 120, y: 120, width: 0, height: 0 };
      const gap = Number(action.gap || 140) || 140;
      const branches = duplicateBranchDescriptors(action);
      const actionId = sanitizeIdPart(action.actionId || action.id || `variant-${Date.now()}-${index}`);

      branches.forEach((branch, branchIndex) => {
        const branchMap = new Map();
        const offsetX = (branchIndex + 1) * (bounds.width + gap);
        const branchNodeIds = [];

        sourceNodes.forEach((node) => {
          const nextId = uniqueGraphId(graphStore, `${actionId}-${branch.id}-${sanitizeIdPart(node.id)}`);
          branchMap.set(String(node.id), nextId);
          const clone = cloneNodeForVariant(node, {
            nodeId: nextId,
            branch,
            branchIndex,
            sourceNodeId: String(node.id),
            position: {
              x: (finiteNumber(node.x) ?? finiteNumber(node.position?.x) ?? bounds.x) + offsetX,
              y: finiteNumber(node.y) ?? finiteNumber(node.position?.y) ?? bounds.y,
            },
          });
          graphStore.addNode(clone);
          branchNodeIds.push(nextId);
          result.createdNodeIds.push(nextId);
        });

        sourceEdges.forEach((edge, edgeIndex) => {
          const { source, target } = sourceEdgeEndpoints(edge);
          const nextSource = branchMap.get(source);
          const nextTarget = branchMap.get(target);
          if (!nextSource || !nextTarget) {
            return;
          }
          const nextEdge = {
            ...cloneJson(edge),
            id: uniqueGraphId(graphStore, `${actionId}-${branch.id}-edge-${edgeIndex + 1}`),
            source: nextSource,
            target: nextTarget,
          };
          delete nextEdge.from;
          delete nextEdge.to;
          graphStore.addEdge(nextEdge);
          result.createdEdgeIds.push(nextEdge.id);
        });

        if (action.groupBranches === true) {
          const branchNodes = branchNodeIds
            .map((nodeId) => graphStore.nodes?.find?.((node) => node?.id === nodeId))
            .filter(Boolean);
          const branchBounds = boundsForNodes(branchNodes) || bounds;
          const padding = Number(action.padding || 48) || 48;
          const groupId = uniqueGraphId(graphStore, `${actionId}-${branch.id}-group`);
          graphStore.addNode({
            id: groupId,
            type: "group",
            x: branchBounds.x - padding,
            y: branchBounds.y - padding,
            width: branchBounds.width + padding * 2,
            height: branchBounds.height + padding * 2,
            name: branch.label,
            data: {
              nodeIds: branchNodeIds,
              variantBranchId: branch.id,
              variantBranchLabel: branch.label,
              variantDifference: branch.difference,
              variantBranchIndex: branchIndex + 1,
            },
          });
          result.createdNodeIds.push(groupId);
        }
      });

      result.appliedCount += 1;
      continue;
    }

    if (action.type === "create_workflow_template") {
      const record = buildWorkflowTemplateRecord(action, graphStore, idMap);
      if (!record.nodes.length) {
        result.warnings.push("create_workflow_template target nodes not found");
        continue;
      }
      if (record.scope !== "project") {
        result.warnings.push("workflow template save is limited to project scope");
        record.scope = "project";
      }
      const saved = saveWorkflowTemplate(effectiveTemplateStore, localTemplates, record);
      result.createdTemplateIds.push(saved.templateId);
      result.workflowTemplates.push(cloneJson(saved));
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "apply_workflow_template") {
      const record = loadWorkflowTemplate(action, effectiveTemplateStore, localTemplates);
      if (!record || !Array.isArray(record.nodes)) {
        result.warnings.push(`workflow template not found: ${action.templateId || action.id || "unknown"}`);
        continue;
      }
      const applied = applyWorkflowTemplateRecord(record, action, graphStore);
      result.createdNodeIds.push(...applied.createdNodeIds);
      result.createdEdgeIds.push(...applied.createdEdgeIds);
      result.appliedTemplateIds.push(String(record.templateId || action.templateId || action.id || ""));
      result.appliedCount += 1;
      continue;
    }

    if (TEMPLATE_GOVERNANCE_ACTION_TYPES.has(action.type)) {
      const { record, warning } = applyWorkflowTemplateGovernance(action, effectiveTemplateStore);
      if (warning) {
        result.warnings.push(warning);
        continue;
      }
      if (!record) {
        result.warnings.push(`workflow template governance failed: ${action.templateId || action.id || "unknown"}`);
        continue;
      }
      result.governedTemplateIds.push(String(record.templateId || action.templateId || action.id || ""));
      result.templateGovernanceEvents.push(templateGovernanceEvent(action, record));
      result.workflowTemplates.push(cloneJson(record));
      result.appliedCount += 1;
      continue;
    }

    if (action.type === "focus_nodes") {
      const nodeIds = (action.nodeIds || []).map((nodeId) => resolveNodeId(nodeId, idMap));
      graphStore.setSelectedNodes?.(nodeIds);
      result.appliedCount += 1;
      continue;
    }

    if (isGenerationAction(action)) {
      const nodeId = resolveNodeId(action.nodeId, idMap);
      const nodeType = getGenerationNodeType(action, graphStore, nodeId);
      const actionId = action.actionId || action.id || `action-${index}`;
      const node = graphStore.nodes?.find?.((item) => item?.id === nodeId);
      if (nodeType === "ai-video" && videoAuthorized !== true) {
        result.skippedVideoGenerationNodeIds.push(nodeId);
        result.warnings.push("video generation requires confirmation: explicit confirmation required");
        result.appliedCount += 1;
        continue;
      }
      const task = generationTaskData(action, {
        actionId,
        nodeId,
        nodeType,
        promptFallback: existingPromptOf(node),
      });
      const statusPatch = {
        presetId: action.presetId,
        presetName: action.presetName,
        generationRequestedBy: "claw_assistant",
        generationIdempotencyKey: task.idempotencyKey,
      };
      if (task.prompt) {
        statusPatch.prompt = task.prompt;
      }
      setGenerationNodeStatus(graphStore, nodeId, "queued", statusPatch);

      let queuedTask = null;
      if (generationTaskStore && typeof generationTaskStore.queueOnce === "function") {
        queuedTask = generationTaskStore.queueOnce(task);
        rememberTask(result, queuedTask);
      }
      result.queuedGenerationNodeIds.push(nodeId);

      const runnableTask = { ...task, id: queuedTask?.id || task.id };
      try {
        let runResult;
        if (generationTaskStore && queuedTask) {
          const customRunner = generationTaskRunner !== defaultGenerationTaskRunner;
          const rendererMounted = Boolean(findRendererTaskRunner(runnableTask));
          if (!customRunner && !rendererMounted) {
            result.warnings.push(`generation task queued: renderer not mounted for ${nodeId}`);
            result.appliedCount += 1;
            continue;
          }
          rememberTask(result, generationTaskStore.start(queuedTask.id));
          setGenerationNodeStatus(graphStore, nodeId, "running", { prompt: task.prompt });
          if (customRunner) {
            runResult = await generationTaskRunner(runnableTask);
          } else {
            const target = findRendererTaskRunner(runnableTask);
            const output = await target.runner.call(target.instance, task.prompt || task.template || "", runnableTask);
            runResult = { started: true, result: output };
          }
          if (didStartGeneration(runResult)) {
            result.startedGenerationNodeIds.push(nodeId);
          }
          if (shouldCompleteGeneration(runResult)) {
            const completedTask = generationTaskStore.complete(
              queuedTask.id,
              generationResultPayload(runResult, nodeId)
            );
            rememberTask(result, completedTask);
            result.completedGenerationNodeIds.push(nodeId);
            setGenerationNodeStatus(graphStore, nodeId, "completed", { isGenerating: false });
          }
        } else {
          runResult = await generationTaskRunner(runnableTask);
          if (didStartGeneration(runResult)) {
            result.startedGenerationNodeIds.push(nodeId);
          } else if (runResult?.pending) {
            result.warnings.push(`generation task queued: ${runResult.message || runResult.reason || "renderer not mounted"}`);
          }
        }
      } catch (error) {
        if (generationTaskStore && queuedTask) {
          const failedTask = generationTaskStore.fail(queuedTask.id, error?.message || error);
          rememberTask(result, failedTask);
          result.failedGenerationNodeIds.push(nodeId);
          setGenerationNodeStatus(graphStore, nodeId, "failed", {
            isGenerating: false,
            error: error?.message || String(error || "Generation failed."),
          });
          result.warnings.push(`generation failed for ${nodeId}: ${error?.message || error}`);
        } else {
          throw error;
        }
      }
      result.appliedCount += 1;
      continue;
    }

    // Every handled branch above ends in `continue`; an action that
    // reaches here has an unregistered type. Silent drops hide
    // contract drift (e.g. a new action type missing its handler), so
    // surface it.
    result.warnings.push(`unknown action type skipped: ${String(action.type || "<missing>")}`);
  }

  return result;
}
