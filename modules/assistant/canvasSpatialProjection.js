// canvas-spatial/v1: the read-side projection of the canvas into the
// semantic space agents reason in (zones / lanes / cells / relations).
// Pure function over graphStore - no copies, no caches, no Date: the
// pixel truth stays in graphStore and this projection is recomputed on
// demand (spatial truth is single-sourced). Raw pixel coordinates
// never appear in the output.
export const CANVAS_SPATIAL_SCHEMA_VERSION = "canvas-spatial/v1";

// cell = DEFAULT_NODE_SIZE (320x220) + the executor fallback gap (96).
export const GRID = Object.freeze({
  cellWidth: 416,
  cellHeight: 316,
  gap: 96,
  originX: 120,
  originY: 120,
});

// Fixed deterministic zone bands (precedence: staging row band first,
// then column bands). Keeping geometry constant makes the projection
// idempotent under additions.
export const ZONES = Object.freeze({
  DOCK_COL: 0,
  RESULTS_COL: 6,
  STAGING_ROW: 8,
  PRODUCTION_FIRST_COL: 1,
});

const COMPRESS_THRESHOLD = 30;
const PRODUCTION_LAST_COL = ZONES.RESULTS_COL - 1;

export function cellOf(node) {
  const width = Number(node?.width) || 320;
  const height = Number(node?.height) || 220;
  const centerX = (Number(node?.x) || 0) + width / 2;
  const centerY = (Number(node?.y) || 0) + height / 2;
  const col = Math.max(0, Math.floor((centerX - GRID.originX) / GRID.cellWidth));
  const row = Math.max(0, Math.floor((centerY - GRID.originY) / GRID.cellHeight));
  return { row, col, key: cellKey(row, col) };
}

export function cellKey(row, col) {
  return `r${row + 1}c${col + 1}`;
}

// Every cell a node's rectangle intersects - off-grid nodes (legacy
// offsets, duplicates) span cell boundaries, so occupancy must cover
// the whole footprint, not just the center cell.
export function cellRangeOf(node) {
  const width = Number(node?.width) || 320;
  const height = Number(node?.height) || 220;
  const x = Number(node?.x) || 0;
  const y = Number(node?.y) || 0;
  const colStart = Math.max(0, Math.floor((x - GRID.originX) / GRID.cellWidth));
  const colEnd = Math.max(colStart, Math.floor((x + width - 1 - GRID.originX) / GRID.cellWidth));
  const rowStart = Math.max(0, Math.floor((y - GRID.originY) / GRID.cellHeight));
  const rowEnd = Math.max(rowStart, Math.floor((y + height - 1 - GRID.originY) / GRID.cellHeight));
  return { rowStart, rowEnd, colStart, colEnd };
}

export function zoneOfCell(row, col) {
  if (row >= ZONES.STAGING_ROW) return "staging";
  if (col === ZONES.DOCK_COL) return "dock-left";
  if (col >= ZONES.RESULTS_COL) return "results";
  return "production";
}

export function projectCanvasSpatial(graphStore, options = {}) {
  const nodes = Array.isArray(graphStore?.nodes) ? graphStore.nodes.filter(Boolean) : [];
  const edges = Array.isArray(graphStore?.edges) ? graphStore.edges.filter(Boolean) : [];

  const placed = nodes.map((node) => {
    const cell = cellOf(node);
    return {
      id: String(node.id),
      type: String(node.type || ""),
      name: String(node.name || ""),
      data: node.data && typeof node.data === "object" ? node.data : {},
      row: cell.row,
      col: cell.col,
      key: cell.key,
      zone: zoneOfCell(cell.row, cell.col),
    };
  });
  placed.sort((left, right) => left.row - right.row || left.col - right.col || (left.id < right.id ? -1 : 1));

  const occupied = new Map();
  for (const entry of placed) {
    occupied.set(entry.key, (occupied.get(entry.key) || 0) + 1);
  }
  const overlaps = [...occupied.values()].filter((count) => count > 1).length;

  const edgedIds = new Set();
  for (const edge of edges) {
    edgedIds.add(String(edge.source));
    edgedIds.add(String(edge.target));
  }
  const orphans = placed.filter((entry) => !edgedIds.has(entry.id)).length;
  const pinned = placed.filter((entry) => entry.data.pinned === true).map((entry) => entry.id);

  const maxRow = placed.reduce((acc, entry) => Math.max(acc, entry.row), 0);
  const maxCol = placed.reduce((acc, entry) => Math.max(acc, entry.col), 0);

  const compressed = placed.length > COMPRESS_THRESHOLD;
  const byZone = { "dock-left": [], production: [], results: [], staging: [] };
  for (const entry of placed) byZone[entry.zone].push(entry);

  const laneRows = new Map();
  for (const entry of byZone.production) {
    if (!laneRows.has(entry.row)) laneRows.set(entry.row, []);
    laneRows.get(entry.row).push(entry);
  }

  const lanes = [...laneRows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([row, members]) => {
      const ordered = members.slice().sort((left, right) => left.col - right.col);
      const anchor = ordered.find((entry) => entry.type === "storyboard-script") || ordered[0];
      const topic = String(anchor.data.qmaiShotId || anchor.name || anchor.id);
      const usedCols = new Set(ordered.map((entry) => entry.col));
      let freeCol = ZONES.PRODUCTION_FIRST_COL;
      while (usedCols.has(freeCol) && freeCol <= PRODUCTION_LAST_COL) freeCol += 1;
      const nextFreeCell = cellKey(row, Math.min(freeCol, PRODUCTION_LAST_COL + 1));
      if (compressed) {
        return {
          id: `lane-r${row + 1}`,
          topic,
          count: ordered.length,
          first: ordered[0].id,
          last: ordered[ordered.length - 1].id,
          nextFreeCell,
        };
      }
      return {
        id: `lane-r${row + 1}`,
        topic,
        cells: ordered.map((entry) => ({ cell: entry.key, node: entry.id, type: entry.type })),
        nextFreeCell,
      };
    });

  const summarizeZone = (zoneId) => {
    const members = byZone[zoneId];
    return {
      id: zoneId,
      count: members.length,
      nodeIds: members.slice(0, compressed ? 5 : 50).map((entry) => entry.id),
    };
  };

  const zones = [
    summarizeZone("dock-left"),
    { ...summarizeZone("production"), lanes },
    summarizeZone("results"),
    summarizeZone("staging"),
  ];

  const freeCursor = {
    "dock-left": firstFreeCell(occupied, { rows: [0, maxRow + 1], cols: [0, 0] }),
    production: firstFreeCell(occupied, { rows: [0, maxRow + 1], cols: [ZONES.PRODUCTION_FIRST_COL, PRODUCTION_LAST_COL] }),
    results: firstFreeCell(occupied, { rows: [0, maxRow + 1], cols: [ZONES.RESULTS_COL, Math.max(ZONES.RESULTS_COL, maxCol) + 1] }),
    staging: firstFreeCell(occupied, { rows: [ZONES.STAGING_ROW, Math.max(ZONES.STAGING_ROW, maxRow) + 1], cols: [0, Math.max(5, maxCol)] }),
  };

  const relevantIds = Array.isArray(options.relevantIds) ? options.relevantIds.map(String) : [];
  const relevant = relevantIds
    .map((id) => placed.find((entry) => entry.id === id))
    .filter(Boolean)
    .map((entry) => ({ node: entry.id, cell: entry.key, zone: entry.zone, type: entry.type }));

  return {
    schemaVersion: CANVAS_SPATIAL_SCHEMA_VERSION,
    viewport: { rows: maxRow + 1, cols: maxCol + 1 },
    ...(compressed ? { compressed: true } : {}),
    zones,
    freeCursor,
    ...(relevant.length > 0 ? { relevant } : {}),
    pinned,
    stats: { nodes: placed.length, overlaps, orphans },
  };
}

// Shared band scanner: the single implementation behind the executor
// resolver, the tidy engine, and the projection's freeCursor. Accepts
// anything with .has(cellKey) (Set or Map).
export function firstFreeCellIn(occupied, rows, cols) {
  for (let row = rows[0]; row <= rows[1]; row += 1) {
    for (let col = cols[0]; col <= cols[1]; col += 1) {
      if (!occupied.has(cellKey(row, col))) {
        return { row, col };
      }
    }
  }
  return { row: rows[1] + 1, col: cols[0] };
}

export function firstFreeCell(occupied, band) {
  const cell = firstFreeCellIn(occupied, band.rows, band.cols);
  return cellKey(cell.row, cell.col);
}

// Pixel write-back for a cell target: centers the node inside its
// cell. The single pixel-math site shared by resolver, tidy, and
// legacy layouts.
export function cellToPx(row, col, size) {
  const width = Number(size?.width) || 320;
  const height = Number(size?.height) || 220;
  return {
    x: GRID.originX + col * GRID.cellWidth + Math.max(0, (GRID.cellWidth - width) / 2),
    y: GRID.originY + row * GRID.cellHeight + Math.max(0, (GRID.cellHeight - height) / 2),
  };
}

export function buildAmbientDigest(projection) {
  const production = projection.zones.find((zone) => zone.id === "production");
  const staging = projection.zones.find((zone) => zone.id === "staging");
  const laneCount = production?.lanes?.length || 0;
  const parts = [
    `画布 ${projection.stats.nodes} 节点`,
    `泳道 ${laneCount} 条`,
    `暂存 ${staging?.count || 0}`,
  ];
  if (projection.stats.overlaps > 0) parts.push(`重叠 ${projection.stats.overlaps}!`);
  return parts.join(" | ");
}
