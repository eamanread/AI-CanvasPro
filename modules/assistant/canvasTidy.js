// tidy_canvas: the deterministic four-pass layout engine. Aesthetics
// are encoded as rules (zone assignment -> ordering -> grid packing ->
// alignment), the passes are idempotent (re-running converges to the
// same layout), and user sovereignty is absolute: nodes the user
// pinned (data.pinned) are never moved. Pixel math lives here and in
// the placement resolver only - never in the model.
import { cellKey, cellOf, cellToPx, firstFreeCellIn, ZONES, zoneOfCell } from "./canvasSpatialProjection.js";
import { applyNodePosition, isPinnedNode, recordPlacement } from "./canvasMovementGuard.js";

const PRODUCTION_LAST_COL = ZONES.RESULTS_COL - 1;

function nodeSize(node) {
  return {
    width: Number(node?.width) || 320,
    height: Number(node?.height) || 220,
  };
}


function isKnowledgeCardNode(node) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  return (
    ["comment", "source-text"].includes(String(node?.type)) &&
    (data.workflowKind === "knowledge_card" || data.citationKind)
  );
}

function connectedComponent(graphStore, rootId) {
  const edges = Array.isArray(graphStore?.edges) ? graphStore.edges : [];
  const adjacency = new Map();
  for (const edge of edges) {
    if (!edge) continue;
    const source = String(edge.source);
    const target = String(edge.target);
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    if (!adjacency.has(target)) adjacency.set(target, new Set());
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  }
  const seen = new Set([String(rootId)]);
  const queue = [String(rootId)];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function scopeFilter(graphStore, scope) {
  const value = String(scope || "all");
  if (value === "all") return () => true;
  if (value.startsWith("zone:")) {
    const zone = value.slice(5);
    return (node) => {
      const cell = cellOf(node);
      return zoneOfCell(cell.row, cell.col) === zone;
    };
  }
  if (value.startsWith("lane:r")) {
    const row = Number(value.slice(6)) - 1;
    return (node) => cellOf(node).row === row;
  }
  if (value.startsWith("cluster:")) {
    const members = connectedComponent(graphStore, value.slice(8));
    return (node) => members.has(String(node.id));
  }
  return () => true;
}

/**
 * Deterministic ordering keys only (shotIndex, current cell, name,
 * id) - after the first run the current cells equal the target
 * cells, so the second run computes identical targets (idempotence).
 */
export function tidyCanvas(graphStore, scope = "all") {
  const nodes = (Array.isArray(graphStore?.nodes) ? graphStore.nodes : []).filter(Boolean);
  const edges = Array.isArray(graphStore?.edges) ? graphStore.edges : [];
  const inScope = scopeFilter(graphStore, scope);

  const movedNodeIds = [];
  const skippedPinnedIds = [];
  const targets = new Map();
  const claimed = new Set();

  // Cells held by nodes we are not allowed to (or asked to) move stay
  // occupied so tidy never stacks onto them.
  for (const node of nodes) {
    const pinned = isPinnedNode(node);
    if (!inScope(node) || pinned) {
      claimed.add(cellOf(node).key);
      if (pinned && inScope(node)) skippedPinnedIds.push(String(node.id));
    }
  }
  const movable = nodes.filter((node) => inScope(node) && !isPinnedNode(node));

  const claim = (row, col) => {
    claimed.add(cellKey(row, col));
    return { row, col };
  };
  const nextFreeInBand = (rowStart, rowEnd, colStart, colEnd) => {
    const cell = firstFreeCellIn(claimed, [rowStart, rowEnd], [colStart, colEnd]);
    return claim(cell.row, cell.col);
  };

  const byStableOrder = (left, right) => {
    const leftCell = cellOf(left);
    const rightCell = cellOf(right);
    return (
      leftCell.row - rightCell.row ||
      leftCell.col - rightCell.col ||
      String(left.name).localeCompare(String(right.name)) ||
      String(left.id).localeCompare(String(right.id))
    );
  };

  // Pass 1+2: classify and order.
  const dockCards = movable.filter(isKnowledgeCardNode).sort(byStableOrder);
  const shots = movable
    .filter((node) => String(node.type) === "storyboard-script")
    .sort((left, right) => {
      const leftIndex = Number(left.data?.shotIndex);
      const rightIndex = Number(right.data?.shotIndex);
      if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return byStableOrder(left, right);
    });

  const followerOf = new Map();
  const shotIds = new Set(shots.map((node) => String(node.id)));
  for (const edge of edges) {
    if (!edge) continue;
    const source = String(edge.source);
    const target = String(edge.target);
    if (shotIds.has(source)) {
      if (!followerOf.has(source)) followerOf.set(source, []);
      followerOf.get(source).push(target);
    }
  }
  // Edge-less stage nodes (PI story flows tag them with shotIndex +
  // workflowStep instead of edges) join the lane of the shot sharing
  // their shotIndex.
  const shotByIndex = new Map();
  for (const shot of shots) {
    const index = Number(shot.data?.shotIndex);
    if (Number.isFinite(index) && !shotByIndex.has(index)) shotByIndex.set(index, String(shot.id));
  }
  const edgeFollowerIds = new Set([...followerOf.values()].flat());
  for (const node of movable) {
    const id = String(node.id);
    if (shotIds.has(id) || edgeFollowerIds.has(id) || isKnowledgeCardNode(node)) continue;
    const index = Number(node.data?.shotIndex);
    if (!Number.isFinite(index) || !shotByIndex.has(index)) continue;
    const shotId = shotByIndex.get(index);
    if (!followerOf.has(shotId)) followerOf.set(shotId, []);
    followerOf.get(shotId).push(id);
  }

  const followerIds = new Set([...followerOf.values()].flat());
  const followers = new Map(
    movable
      .filter((node) => followerIds.has(String(node.id)) && !shotIds.has(String(node.id)) && !isKnowledgeCardNode(node))
      .map((node) => [String(node.id), node]),
  );
  const restless = movable.filter(
    (node) =>
      !isKnowledgeCardNode(node) &&
      !shotIds.has(String(node.id)) &&
      !followers.has(String(node.id)),
  );

  const stageRank = (node) => {
    const step = String(node.data?.workflowStep || "");
    if (step === "shot_keyframe") return 0;
    if (step === "shot_video") return 1;
    const type = String(node.type);
    if (type === "ai-image") return 0;
    if (type === "ai-video") return 1;
    return 2;
  };

  // Pass 3: grid packing per class.
  dockCards.forEach((node, index) => {
    targets.set(String(node.id), { node, cell: claim(index, ZONES.DOCK_COL), reason: "tidy dock" });
  });

  // Lanes get as many rows as their stage chain needs: overflow
  // followers wrap onto continuation rows instead of stacking on the
  // last production column.
  const STAGE_COLS_PER_ROW = PRODUCTION_LAST_COL - ZONES.PRODUCTION_FIRST_COL;
  let nextLaneRow = 0;
  shots.forEach((node) => {
    const laneRow = nextLaneRow;
    targets.set(String(node.id), { node, cell: claim(laneRow, ZONES.PRODUCTION_FIRST_COL), reason: "tidy lane" });
    const followerNodes = (followerOf.get(String(node.id)) || [])
      .map((id) => followers.get(id))
      .filter(Boolean)
      .sort((left, right) => stageRank(left) - stageRank(right) || byStableOrder(left, right));
    followerNodes.forEach((follower, stageIndex) => {
      const row = laneRow + Math.floor(stageIndex / STAGE_COLS_PER_ROW);
      const col = ZONES.PRODUCTION_FIRST_COL + 1 + (stageIndex % STAGE_COLS_PER_ROW);
      targets.set(String(follower.id), { node: follower, cell: claim(row, col), reason: "tidy stage" });
    });
    nextLaneRow = laneRow + 1 + Math.floor(Math.max(0, followerNodes.length - 1) / STAGE_COLS_PER_ROW);
  });

  const productionRows = Math.max(nextLaneRow, 0);
  restless.sort(byStableOrder).forEach((node) => {
    const currentZone = zoneOfCell(cellOf(node).row, cellOf(node).col);
    const cell =
      currentZone === "results"
        ? nextFreeInBand(0, Math.min(productionRows + restless.length, ZONES.STAGING_ROW - 1), ZONES.RESULTS_COL, ZONES.RESULTS_COL + 1)
        : currentZone === "staging"
          ? nextFreeInBand(ZONES.STAGING_ROW, ZONES.STAGING_ROW + restless.length, 0, 5)
          : nextFreeInBand(productionRows, Math.min(ZONES.STAGING_ROW - 1, productionRows + restless.length), ZONES.PRODUCTION_FIRST_COL, PRODUCTION_LAST_COL);
    targets.set(String(node.id), { node, cell, reason: "tidy pack" });
  });

  // Pass 4: alignment write-back (cell centering is the alignment).
  // Writes go through the movement guard so they persist on
  // snapshot-read stores (the real app store).
  for (const { node, cell, reason } of targets.values()) {
    const px = cellToPx(cell.row, cell.col, nodeSize(node));
    if (node.x !== px.x || node.y !== px.y) {
      applyNodePosition(graphStore, node, px.x, px.y);
      recordPlacement(graphStore, node, `${reason} (${cellKey(cell.row, cell.col)})`);
      movedNodeIds.push(String(node.id));
    }
  }

  return { movedNodeIds, skippedPinnedIds };
}

export function lintCanvasSpatial(graphStore) {
  const nodes = (Array.isArray(graphStore?.nodes) ? graphStore.nodes : []).filter(Boolean);
  const overlaps = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const sizeA = nodeSize(a);
      const sizeB = nodeSize(b);
      const apart =
        a.x + sizeA.width <= b.x ||
        b.x + sizeB.width <= a.x ||
        a.y + sizeA.height <= b.y ||
        b.y + sizeB.height <= a.y;
      if (!apart) overlaps.push([String(a.id), String(b.id)]);
    }
  }

  const columnX = new Map();
  const misaligned = new Set();
  for (const node of nodes) {
    const cell = cellOf(node);
    const key = `${cell.col}:${nodeSize(node).width}`;
    if (columnX.has(key) && columnX.get(key) !== node.x) {
      misaligned.add(`c${cell.col + 1}`);
    } else if (!columnX.has(key)) {
      columnX.set(key, node.x);
    }
  }

  return { overlaps, misalignedColumns: [...misaligned] };
}
