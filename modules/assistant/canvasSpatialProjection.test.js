import assert from "node:assert/strict";
import test from "node:test";

import { executeAssistantActions } from "./assistantActionExecutor.js";
import {
  buildAmbientDigest,
  CANVAS_SPATIAL_SCHEMA_VERSION,
  cellOf,
  GRID,
  projectCanvasSpatial,
} from "./canvasSpatialProjection.js";

function createGraphStore() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) { nodes.push(node); return node; },
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => item.id === nodeId);
      if (node) node.data = { ...(node.data || {}), ...(patch || {}) };
    },
    setSelectedNodes() {},
  };
}

function pxOf(row, col, width = 320, height = 220) {
  return {
    x: GRID.originX + col * GRID.cellWidth + (GRID.cellWidth - width) / 2,
    y: GRID.originY + row * GRID.cellHeight + (GRID.cellHeight - height) / 2,
  };
}

async function buildSampleCanvas() {
  const graphStore = createGraphStore();
  await executeAssistantActions({
    actions: [
      { id: "card-1", type: "create_node", nodeType: "comment", name: "知识卡", position: pxOf(0, 0), data: { workflowKind: "knowledge_card", sourceTitle: "负空间" } },
      { id: "shot-1", type: "create_node", nodeType: "storyboard-script", name: "shot-001", position: pxOf(0, 1), data: { shotIndex: 1, qmaiShotId: "shot-001" } },
      { id: "img-1", type: "create_node", nodeType: "ai-image", name: "prep-1", position: pxOf(0, 2) },
      { id: "shot-2", type: "create_node", nodeType: "storyboard-script", name: "shot-002", position: pxOf(1, 1), data: { shotIndex: 2, qmaiShotId: "shot-002" } },
      { id: "result-1", type: "create_node", nodeType: "ai-video", name: "成片", position: pxOf(0, 6) },
      { id: "orphan-1", type: "create_node", nodeType: "comment", name: "孤儿", position: pxOf(8, 2) },
      { type: "connect_nodes", from: "shot-1", to: "img-1" },
    ],
    graphStore,
  });
  return graphStore;
}

test("canvasSpatialProjection: cellOf quantizes node centers into 1-based cells", () => {
  assert.deepEqual(cellOf({ x: GRID.originX, y: GRID.originY, width: 320, height: 220 }), { row: 0, col: 0, key: "r1c1" });
  const deep = cellOf({ ...pxOf(2, 3), width: 320, height: 220 });
  assert.deepEqual(deep, { row: 2, col: 3, key: "r3c4" });
});

test("canvasSpatialProjection: projects zones, lanes, cursor and stats from a real executor canvas", async () => {
  const graphStore = await buildSampleCanvas();

  const projection = projectCanvasSpatial(graphStore);

  assert.equal(projection.schemaVersion, CANVAS_SPATIAL_SCHEMA_VERSION);
  assert.equal(projection.stats.nodes, 6);
  assert.equal(projection.stats.overlaps, 0);
  assert.equal(projection.stats.orphans >= 2, true);

  const dock = projection.zones.find((zone) => zone.id === "dock-left");
  assert.equal(dock.nodeIds.includes("card-1"), true);

  const production = projection.zones.find((zone) => zone.id === "production");
  assert.equal(production.lanes.length, 2);
  const lane1 = production.lanes[0];
  assert.equal(lane1.topic, "shot-001");
  assert.deepEqual(lane1.cells.map((cell) => cell.node), ["shot-1", "img-1"]);
  assert.equal(lane1.nextFreeCell, "r1c4");

  const results = projection.zones.find((zone) => zone.id === "results");
  assert.equal(results.nodeIds.includes("result-1"), true);

  const staging = projection.zones.find((zone) => zone.id === "staging");
  assert.equal(staging.nodeIds.includes("orphan-1"), true);

  assert.equal(typeof projection.freeCursor.production, "string");
  assert.equal(projection.freeCursor["dock-left"], "r2c1");
});

test("canvasSpatialProjection: projection is idempotent and leaks no raw pixels", async () => {
  const graphStore = await buildSampleCanvas();

  const first = projectCanvasSpatial(graphStore);
  const second = projectCanvasSpatial(graphStore);

  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  assert.equal(/"x"\s*:/.test(serialized), false, serialized.slice(0, 200));
  assert.equal(/"y"\s*:/.test(serialized), false);
});

test("canvasSpatialProjection: empty canvas projects without throwing", () => {
  const projection = projectCanvasSpatial(createGraphStore());

  assert.equal(projection.stats.nodes, 0);
  assert.equal(projection.zones.length, 4);
  assert.equal(typeof projection.freeCursor.production, "string");
});

test("canvasSpatialProjection: stacked nodes are counted as overlaps", async () => {
  const graphStore = createGraphStore();
  await executeAssistantActions({
    actions: [
      { id: "a", type: "create_node", nodeType: "ai-image", position: pxOf(2, 2) },
      { id: "b", type: "create_node", nodeType: "ai-image", position: pxOf(2, 2) },
    ],
    graphStore,
  });

  const projection = projectCanvasSpatial(graphStore);
  assert.equal(projection.stats.overlaps >= 1, true);
});

test("canvasSpatialProjection: large canvases compress lanes instead of listing every cell", async () => {
  const graphStore = createGraphStore();
  const actions = [];
  for (let index = 0; index < 36; index += 1) {
    actions.push({
      id: `n-${index}`,
      type: "create_node",
      nodeType: "ai-image",
      position: pxOf(Math.floor(index / 5), 1 + (index % 5)),
    });
  }
  await executeAssistantActions({ actions, graphStore });

  const projection = projectCanvasSpatial(graphStore, { relevantIds: ["n-3"] });

  assert.equal(projection.compressed, true);
  const production = projection.zones.find((zone) => zone.id === "production");
  assert.equal(production.lanes.every((lane) => !lane.cells && typeof lane.count === "number"), true);
  assert.equal(projection.relevant.some((entry) => entry.node === "n-3"), true);
  assert.equal(JSON.stringify(projection).length < 3200, true);
});

test("canvasSpatialProjection: ambient digest is one short line", async () => {
  const graphStore = await buildSampleCanvas();

  const digest = buildAmbientDigest(projectCanvasSpatial(graphStore));

  assert.equal(typeof digest, "string");
  assert.equal(digest.includes("6"), true);
  assert.equal(digest.length <= 80, true);
  assert.equal(digest.includes("\n"), false);
});
