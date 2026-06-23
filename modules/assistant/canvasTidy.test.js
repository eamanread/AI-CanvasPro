import assert from "node:assert/strict";
import test from "node:test";

import { lintCanvasSpatial, tidyCanvas } from "./canvasTidy.js";
import { GRID } from "./canvasSpatialProjection.js";

function createGraphStore(nodes = [], edges = []) {
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

function node(id, type, x, y, data = {}) {
  return { id, type, x, y, width: 320, height: 220, name: id, data };
}

function messyCanvas() {
  return createGraphStore(
    [
      node("card-1", "comment", 2000, 1500, { workflowKind: "knowledge_card", sourceTitle: "负空间" }),
      node("shot-2", "storyboard-script", 700, 900, { shotIndex: 2 }),
      node("shot-1", "storyboard-script", 710, 905, { shotIndex: 1 }),
      node("img-1", "ai-image", 50, 50),
      node("vid-1", "ai-video", 53, 55),
      node("loose-1", "comment", 3000, 200),
    ],
    [
      { id: "e1", source: "shot-1", target: "img-1" },
      { id: "e2", source: "shot-1", target: "vid-1" },
    ],
  );
}

test("canvasTidy: four passes produce a lint-clean canvas", () => {
  const graphStore = messyCanvas();

  const outcome = tidyCanvas(graphStore, "all");

  assert.equal(outcome.movedNodeIds.length > 0, true);
  const lint = lintCanvasSpatial(graphStore);
  assert.deepEqual(lint.overlaps, []);
  assert.deepEqual(lint.misalignedColumns, []);

  const card = graphStore.nodes.find((item) => item.id === "card-1");
  assert.equal(card.x < GRID.originX + GRID.cellWidth, true, `card x=${card.x}`);

  const shot1 = graphStore.nodes.find((item) => item.id === "shot-1");
  const shot2 = graphStore.nodes.find((item) => item.id === "shot-2");
  assert.equal(shot1.y < shot2.y, true);

  const img = graphStore.nodes.find((item) => item.id === "img-1");
  const vid = graphStore.nodes.find((item) => item.id === "vid-1");
  assert.equal(img.y, shot1.y);
  assert.equal(vid.y, shot1.y);
  assert.equal(img.x > shot1.x, true);
  assert.equal(vid.x > img.x, true);
  assert.match(String(img.data.placementReason || ""), /tidy/);
});

test("canvasTidy: running twice is idempotent", () => {
  const graphStore = messyCanvas();

  tidyCanvas(graphStore, "all");
  const snapshot = graphStore.nodes.map((item) => ({ id: item.id, x: item.x, y: item.y }));
  const second = tidyCanvas(graphStore, "all");

  assert.deepEqual(second.movedNodeIds, []);
  assert.deepEqual(
    graphStore.nodes.map((item) => ({ id: item.id, x: item.x, y: item.y })),
    snapshot,
  );
});

test("canvasTidy: pinned nodes are never moved", () => {
  const graphStore = messyCanvas();
  const pinnedNode = graphStore.nodes.find((item) => item.id === "img-1");
  pinnedNode.data.pinned = true;
  const before = { x: pinnedNode.x, y: pinnedNode.y };

  const outcome = tidyCanvas(graphStore, "all");

  assert.deepEqual({ x: pinnedNode.x, y: pinnedNode.y }, before);
  assert.equal(outcome.skippedPinnedIds.includes("img-1"), true);
  assert.equal(outcome.movedNodeIds.includes("img-1"), false);
});

test("canvasTidy: cluster scope only touches the connected component", () => {
  const graphStore = messyCanvas();
  const loose = graphStore.nodes.find((item) => item.id === "loose-1");
  const looseBefore = { x: loose.x, y: loose.y };
  const card = graphStore.nodes.find((item) => item.id === "card-1");
  const cardBefore = { x: card.x, y: card.y };

  tidyCanvas(graphStore, "cluster:shot-1");

  assert.deepEqual({ x: loose.x, y: loose.y }, looseBefore);
  assert.deepEqual({ x: card.x, y: card.y }, cardBefore);
  const img = graphStore.nodes.find((item) => item.id === "img-1");
  const shot1 = graphStore.nodes.find((item) => item.id === "shot-1");
  assert.equal(img.y, shot1.y);
});

test("canvasTidy: a shot with many followers wraps to continuation rows without overlap", () => {
  const nodes = [node("shot-big", "storyboard-script", 700, 900, { shotIndex: 1 })];
  const edges = [];
  for (let index = 0; index < 7; index += 1) {
    nodes.push(node(`f-${index}`, "ai-image", 40 + index * 7, 40, {}));
    edges.push({ id: `fe-${index}`, source: "shot-big", target: `f-${index}` });
  }
  nodes.push(node("shot-after", "storyboard-script", 700, 1300, { shotIndex: 2 }));
  const graphStore = createGraphStore(nodes, edges);

  tidyCanvas(graphStore, "all");

  const lint = lintCanvasSpatial(graphStore);
  assert.deepEqual(lint.overlaps, []);
  const shotBig = graphStore.nodes.find((item) => item.id === "shot-big");
  const shotAfter = graphStore.nodes.find((item) => item.id === "shot-after");
  assert.equal(shotAfter.y > shotBig.y, true);
  const followerYs = new Set(
    graphStore.nodes.filter((item) => item.id.startsWith("f-")).map((item) => item.y),
  );
  assert.equal(followerYs.size >= 2, true, "7 followers must wrap to at least two rows");
  for (const y of followerYs) {
    assert.equal(y < shotAfter.y, true, "continuation rows stay above the next shot lane");
  }
});

test("canvasTidy: edge-less stage nodes with shotIndex join their shot's lane", () => {
  const graphStore = createGraphStore([
    node("shot-s1", "storyboard-script", 700, 900, { shotIndex: 1, workflowStep: "shot_script" }),
    node("kf-s1", "ai-image", 40, 40, { shotIndex: 1, workflowStep: "shot_keyframe" }),
    node("vid-s1", "ai-video", 80, 80, { shotIndex: 1, workflowStep: "shot_video" }),
  ]);

  tidyCanvas(graphStore, "all");

  const shot = graphStore.nodes.find((item) => item.id === "shot-s1");
  const keyframe = graphStore.nodes.find((item) => item.id === "kf-s1");
  const video = graphStore.nodes.find((item) => item.id === "vid-s1");
  assert.equal(keyframe.y, shot.y);
  assert.equal(video.y, shot.y);
  assert.equal(keyframe.x > shot.x, true);
  assert.equal(video.x > keyframe.x, true);
});

test("canvasTidy: lint reports overlaps and column misalignment on a messy canvas", () => {
  const graphStore = messyCanvas();

  const lint = lintCanvasSpatial(graphStore);

  assert.equal(lint.overlaps.length > 0, true);
});
