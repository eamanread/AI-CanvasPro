import assert from "node:assert/strict";
import test from "node:test";

import { defaultGenerationTaskRunner, executeAssistantActions } from "./assistantActionExecutor.js";
import {
  AssistantGenerationTaskStatus,
  createAssistantGenerationTaskStore,
} from "./assistantGenerationTaskStore.js";
import { createAssistantWorkflowTemplateStore } from "./assistantWorkflowTemplateStore.js";

function createGraphStore() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) {
      nodes.push(node);
      return node;
    },
    addEdge(edge) {
      edges.push(edge);
      return edge;
    },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => item.id === nodeId);
      if (node) {
        node.data = { ...(node.data || {}), ...(patch || {}) };
      }
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
  };
}

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test("assistantActionExecutor: default workflow template store persists project templates across calls", async () => {
  const storage = createMemoryStorage();
  const templateStore = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    clock: () => "2026-06-05T00:00:00.000Z",
  });
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "script",
    type: "ai-text",
    x: 10,
    y: 20,
    width: 200,
    height: 120,
    data: { prompt: "draft story" },
  });

  await executeAssistantActions({
    actions: [
      {
        type: "create_workflow_template",
        templateId: "tpl-persisted",
        name: "Persisted template",
        nodeIds: ["script"],
        projectId: "project-a",
        version: "1.0.0",
        author: "qa-user",
        tags: ["persisted"],
      },
    ],
    graphStore,
    templateStore,
  });

  const restoredTemplateStore = createAssistantWorkflowTemplateStore({ storage, projectId: "project-a" });
  const applied = await executeAssistantActions({
    actions: [{ type: "apply_workflow_template", templateId: "tpl-persisted", projectId: "project-a" }],
    graphStore,
    templateStore: restoredTemplateStore,
  });

  assert.deepEqual(applied.appliedTemplateIds, ["tpl-persisted"]);
  assert.equal(graphStore.nodes.filter((node) => node.data?.templateId === "tpl-persisted").length, 1);
  assert.equal(restoredTemplateStore.get("tpl-persisted").projectId, "project-a");
});

test("assistantActionExecutor: placement below lands one row under the anchor with lineage", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      { id: "shot-a", type: "create_node", nodeType: "storyboard-script", position: { x: 584, y: 168 } },
      { id: "prep-a", type: "create_node", nodeType: "ai-image", placement: { strategy: "below", anchor: "shot-a" } },
    ],
    graphStore,
  });

  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
  const anchor = graphStore.nodes.find((node) => node.id === "shot-a");
  const prep = graphStore.nodes.find((node) => node.id === "prep-a");
  assert.equal(prep.y > anchor.y, true);
  assert.equal(Math.abs(prep.x - anchor.x) < 416, true);
  assert.match(String(prep.data.placementReason || ""), /below shot-a/);
});

test("assistantActionExecutor: placement wins over raw position from the model", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      { id: "shot-b", type: "create_node", nodeType: "storyboard-script", position: { x: 584, y: 168 } },
      {
        id: "prep-b",
        type: "create_node",
        nodeType: "ai-image",
        position: { x: 99999, y: -500 },
        placement: { strategy: "right-of", anchor: "shot-b" },
      },
    ],
    graphStore,
  });

  const prep = graphStore.nodes.find((node) => node.id === "prep-b");
  assert.equal(prep.x < 5000, true);
  assert.equal(prep.y >= 0, true);
  assert.match(String(prep.data.placementReason || ""), /right-of shot-b/);
});

test("assistantActionExecutor: in-zone results placement lands in the results band", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      { id: "vid-1", type: "create_node", nodeType: "ai-video", placement: { strategy: "in-zone", zone: "results" } },
    ],
    graphStore,
  });

  const node = graphStore.nodes.find((item) => item.id === "vid-1");
  assert.equal(node.x >= 120 + 6 * 416, true, `x=${node.x}`);
  assert.match(String(node.data.placementReason || ""), /in-zone results/);
});

test("assistantActionExecutor: missing anchors degrade to staging with a warning, never stacking", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      { id: "lost-1", type: "create_node", nodeType: "ai-image", placement: { strategy: "below", anchor: "ghost-404" } },
      { id: "lost-2", type: "create_node", nodeType: "ai-image", placement: { strategy: "below", anchor: "ghost-404" } },
    ],
    graphStore,
  });

  assert.equal(result.warnings.filter((warning) => /placement degraded to staging/.test(warning)).length, 2);
  const [a, b] = graphStore.nodes;
  assert.equal(a.y >= 120 + 8 * 316, true, `y=${a.y}`);
  assert.notDeepEqual({ x: a.x, y: a.y }, { x: b.x, y: b.y });
});

test("assistantActionExecutor: knowledge cards without placement default to the dock", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      { id: "k-1", type: "create_node", nodeType: "comment", name: "卡1", data: { workflowKind: "knowledge_card", sourceTitle: "负空间" } },
      { id: "k-2", type: "create_node", nodeType: "comment", name: "卡2", data: { workflowKind: "knowledge_card", sourceTitle: "节拍" } },
    ],
    graphStore,
  });

  for (const node of graphStore.nodes) {
    assert.equal(node.x < 120 + 416, true, `x=${node.x}`);
    assert.match(String(node.data.placementReason || ""), /dock-left/);
  }
  assert.notEqual(graphStore.nodes[0].y, graphStore.nodes[1].y);
});

test("assistantActionExecutor: batch feeds-into without placement defaults below its source", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      { id: "shot-c", type: "create_node", nodeType: "storyboard-script", position: { x: 584, y: 168 } },
      { id: "img-c", type: "create_node", nodeType: "ai-image" },
      { type: "connect_nodes", from: "shot-c", to: "img-c" },
    ],
    graphStore,
  });

  const anchor = graphStore.nodes.find((node) => node.id === "shot-c");
  const follower = graphStore.nodes.find((node) => node.id === "img-c");
  assert.equal(follower.y > anchor.y, true);
  assert.match(String(follower.data.placementReason || ""), /below shot-c/);
});

test("assistantActionExecutor: mixed placement batches never overlap", async () => {
  const graphStore = createGraphStore();
  const actions = [{ id: "hub", type: "create_node", nodeType: "storyboard-script", position: { x: 584, y: 168 } }];
  for (let index = 0; index < 19; index += 1) {
    const strategy = ["near", "right-of", "below", "in-zone"][index % 4];
    actions.push({
      id: `m-${index}`,
      type: "create_node",
      nodeType: "ai-image",
      placement: strategy === "in-zone" ? { strategy, zone: "production" } : { strategy, anchor: "hub" },
    });
  }

  await executeAssistantActions({ actions, graphStore });

  assert.equal(graphStore.nodes.length, 20);
  for (let i = 0; i < graphStore.nodes.length; i += 1) {
    for (let j = i + 1; j < graphStore.nodes.length; j += 1) {
      const a = graphStore.nodes[i];
      const b = graphStore.nodes[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.equal(apart, true, `${a.id} overlaps ${b.id}`);
    }
  }
});

test("assistantActionExecutor: new-lane and append-lane manage production rows", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      { id: "s1", type: "create_node", nodeType: "storyboard-script", placement: { strategy: "new-lane", topic: "场1" } },
      { id: "s1-img", type: "create_node", nodeType: "ai-image", placement: { strategy: "append-lane", anchor: "s1" } },
      { id: "s2", type: "create_node", nodeType: "storyboard-script", placement: { strategy: "new-lane", topic: "场2" } },
    ],
    graphStore,
  });

  const s1 = graphStore.nodes.find((node) => node.id === "s1");
  const s1Img = graphStore.nodes.find((node) => node.id === "s1-img");
  const s2 = graphStore.nodes.find((node) => node.id === "s2");
  assert.equal(s1Img.y, s1.y);
  assert.equal(s1Img.x > s1.x, true);
  assert.equal(s2.y > s1.y, true);
});

test("assistantActionExecutor: tidy_canvas is a registered action that cleans the canvas", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "shot-x", type: "storyboard-script", x: 700, y: 900, width: 320, height: 220, name: "shot-x", data: { shotIndex: 1 } });
  graphStore.addNode({ id: "img-x", type: "ai-image", x: 702, y: 905, width: 320, height: 220, name: "img-x", data: {} });
  graphStore.addEdge({ id: "e1", source: "shot-x", target: "img-x" });

  const result = await executeAssistantActions({
    actions: [{ type: "tidy_canvas", scope: "all" }],
    graphStore,
  });

  assert.equal(result.warnings.some((warning) => /unknown action/.test(warning)), false);
  assert.equal(result.tidiedNodeIds.length > 0, true);
  const shot = graphStore.nodes.find((node) => node.id === "shot-x");
  const img = graphStore.nodes.find((node) => node.id === "img-x");
  assert.equal(img.y, shot.y);
  assert.equal(img.x > shot.x, true);
});

test("assistantActionExecutor: semantic move respects pinned sovereignty", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "anchor-m", type: "storyboard-script", x: 584, y: 168, width: 320, height: 220, name: "anchor", data: {} });
  graphStore.addNode({ id: "free-m", type: "ai-image", x: 3000, y: 3000, width: 320, height: 220, name: "free", data: {} });
  graphStore.addNode({ id: "pinned-m", type: "ai-image", x: 3100, y: 3100, width: 320, height: 220, name: "pinned", data: { pinned: true } });

  const result = await executeAssistantActions({
    actions: [{ type: "move_nodes", nodeIds: ["free-m", "pinned-m"], placement: { strategy: "below", anchor: "anchor-m" } }],
    graphStore,
  });

  const freeNode = graphStore.nodes.find((node) => node.id === "free-m");
  const pinnedNode = graphStore.nodes.find((node) => node.id === "pinned-m");
  assert.equal(freeNode.y > 168 && freeNode.y < 1000, true, `y=${freeNode.y}`);
  assert.deepEqual({ x: pinnedNode.x, y: pinnedNode.y }, { x: 3100, y: 3100 });
  assert.equal(result.skippedPinnedIds.includes("pinned-m"), true);
});

test("assistantActionExecutor: placement sees nodes created by duplicate_nodes in the same batch", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "seed", type: "ai-image", x: 584, y: 168, width: 320, height: 220, name: "seed", data: {} });

  await executeAssistantActions({
    actions: [
      { type: "duplicate_nodes", nodeIds: ["seed"], count: 3 },
      { id: "fresh-1", type: "create_node", nodeType: "ai-image" },
      { id: "fresh-2", type: "create_node", nodeType: "ai-image" },
    ],
    graphStore,
  });

  for (let i = 0; i < graphStore.nodes.length; i += 1) {
    for (let j = i + 1; j < graphStore.nodes.length; j += 1) {
      const a = graphStore.nodes[i];
      const b = graphStore.nodes[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.equal(apart, true, `${a.id}@${a.x},${a.y} overlaps ${b.id}@${b.x},${b.y}`);
    }
  }
});

test("assistantActionExecutor: legacy move_nodes respects pinned sovereignty and records lineage", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "free-l", type: "comment", x: 0, y: 0, width: 100, height: 80, name: "free", data: {} });
  graphStore.addNode({ id: "pin-l", type: "comment", x: 7, y: 7, width: 100, height: 80, name: "pin", data: { pinned: true } });

  const result = await executeAssistantActions({
    actions: [{ type: "move_nodes", nodeIds: ["free-l", "pin-l"] }],
    graphStore,
  });

  const pinnedNode = graphStore.nodes.find((node) => node.id === "pin-l");
  assert.deepEqual({ x: pinnedNode.x, y: pinnedNode.y }, { x: 7, y: 7 });
  assert.equal(result.skippedPinnedIds.includes("pin-l"), true);
  const freeNode = graphStore.nodes.find((node) => node.id === "free-l");
  assert.equal(typeof freeNode.data.placementReason, "string");
  assert.equal(freeNode.data.placementReason.length > 0, true);
});

test("assistantActionExecutor: layout_nodes never moves pinned nodes", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "lay-1", type: "ai-image", x: 50, y: 50, width: 320, height: 220, name: "a", data: {} });
  graphStore.addNode({ id: "lay-pin", type: "ai-image", x: 60, y: 60, width: 320, height: 220, name: "b", data: { pinned: true } });

  const result = await executeAssistantActions({
    actions: [{ type: "layout_nodes", nodeIds: ["lay-1", "lay-pin"], layout: "horizontal" }],
    graphStore,
  });

  const pinnedNode = graphStore.nodes.find((node) => node.id === "lay-pin");
  assert.deepEqual({ x: pinnedNode.x, y: pinnedNode.y }, { x: 60, y: 60 });
  assert.equal(result.skippedPinnedIds.includes("lay-pin"), true);
});

test("assistantActionExecutor: group containers do not blanket placement occupancy", async () => {
  const graphStore = createGraphStore();
  // A wide group frame spanning production cols 1-5 must not push
  // coordinate-free creates into staging - members claim their own
  // cells, containers do not.
  graphStore.addNode({ id: "big-group", type: "group", x: 536, y: 120, width: 2200, height: 600, name: "组", data: {} });

  const result = await executeAssistantActions({
    actions: [{ id: "free-g", type: "create_node", nodeType: "ai-image" }],
    graphStore,
  });

  assert.equal(result.warnings.some((warning) => /staging/.test(warning)), false, JSON.stringify(result.warnings));
  const node = graphStore.nodes.find((item) => item.id === "free-g");
  assert.equal(node.y < 120 + 8 * 316, true, `y=${node.y} must stay out of the staging band`);
});

function createSnapshotGraphStore() {
  // Faithful model of the real app store (src/core/stores): reads
  // return CLONES (direct mutation is lost) and updateNodeData merges
  // the patch top-level - empirically verified on the live instance.
  const internal = [];
  const edges = [];
  return {
    get nodes() {
      return internal.map((node) => JSON.parse(JSON.stringify(node)));
    },
    get edges() {
      return edges.map((edge) => ({ ...edge }));
    },
    addNode(node) { internal.push(JSON.parse(JSON.stringify(node))); return node; },
    addEdge(edge) { edges.push({ ...edge }); return edge; },
    updateNodeData(nodeId, patch) {
      const node = internal.find((item) => item.id === nodeId);
      if (node) Object.assign(node, patch || {});
    },
    setSelectedNodes() {},
    _internal: internal,
  };
}

test("assistantActionExecutor: layouts persist on snapshot-read stores (the real app store)", async () => {
  const graphStore = createSnapshotGraphStore();

  for (let batch = 0; batch < 2; batch += 1) {
    await executeAssistantActions({
      actions: [
        { id: `s-${batch}`, type: "create_node", nodeType: "source-text", name: `提示${batch}` },
        { id: `i-${batch}`, type: "create_node", nodeType: "ai-image", name: `图${batch}` },
        { type: "connect_nodes", from: `s-${batch}`, to: `i-${batch}` },
        { type: "layout_nodes", nodeIds: [`s-${batch}`, `i-${batch}`], layout: "single_chain" },
      ],
      graphStore,
    });
  }

  const persisted = graphStore._internal;
  for (let i = 0; i < persisted.length; i += 1) {
    for (let j = i + 1; j < persisted.length; j += 1) {
      const a = persisted[i];
      const b = persisted[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.equal(apart, true, `${a.id}@${a.x},${a.y} overlaps ${b.id}@${b.x},${b.y} in PERSISTED state`);
    }
  }
  assert.equal(
    persisted.every((node) => {
      const reason = node.placementReason || node.data?.placementReason || "";
      return /layout single_chain/.test(reason);
    }),
    true,
    `the layout pass itself must persist: ${persisted.map((node) => node.placementReason || node.data?.placementReason).join(" | ")}`,
  );
});

test("assistantActionExecutor: tidy persists on snapshot-read stores", async () => {
  const graphStore = createSnapshotGraphStore();
  graphStore.addNode({ id: "m-shot", type: "storyboard-script", x: 700, y: 900, width: 320, height: 220, name: "shot", data: { shotIndex: 1 } });
  graphStore.addNode({ id: "m-img", type: "ai-image", x: 703, y: 905, width: 320, height: 220, name: "img", data: {} });
  graphStore.addEdge({ id: "e", source: "m-shot", target: "m-img" });

  const result = await executeAssistantActions({
    actions: [{ type: "tidy_canvas", scope: "all" }],
    graphStore,
  });

  assert.equal(result.tidiedNodeIds.length > 0, true);
  const persisted = graphStore._internal;
  const shot = persisted.find((node) => node.id === "m-shot");
  const img = persisted.find((node) => node.id === "m-img");
  assert.equal(img.y, shot.y, "tidy result must persist in store state");
  assert.equal(img.x > shot.x, true);
});

test("assistantActionExecutor: repeated chain layouts stack-proof across executions (real 8777 repro)", async () => {
  // Faithful replay of the real canvas-agent-executions.json shape:
  // three consecutive PI text_to_image batches, each create source-text
  // + ai-image with NO position/placement, then layout_nodes
  // single_chain over the pair. The legacy fixed fallbackPosition made
  // every batch land on identical coordinates - three workflows piled
  // on top of each other.
  const graphStore = createGraphStore();

  for (let batch = 0; batch < 3; batch += 1) {
    await executeAssistantActions({
      actions: [
        { id: `src-${batch}`, type: "create_node", nodeType: "source-text", name: `提示词${batch}` },
        { id: `img-${batch}`, type: "create_node", nodeType: "ai-image", name: `生成${batch}` },
        { type: "connect_nodes", from: `src-${batch}`, to: `img-${batch}` },
        { type: "layout_nodes", nodeIds: [`src-${batch}`, `img-${batch}`], layout: "single_chain" },
      ],
      graphStore,
    });
  }

  assert.equal(graphStore.nodes.length, 6);
  for (let i = 0; i < graphStore.nodes.length; i += 1) {
    for (let j = i + 1; j < graphStore.nodes.length; j += 1) {
      const a = graphStore.nodes[i];
      const b = graphStore.nodes[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.equal(apart, true, `${a.id}@${a.x},${a.y} overlaps ${b.id}@${b.x},${b.y}`);
    }
  }
  // Chain order preserved within each batch: source left of its image.
  for (let batch = 0; batch < 3; batch += 1) {
    const source = graphStore.nodes.find((node) => node.id === `src-${batch}`);
    const image = graphStore.nodes.find((node) => node.id === `img-${batch}`);
    assert.equal(source.y, image.y, `batch ${batch} chain stays on one row`);
    assert.equal(source.x < image.x, true, `batch ${batch} keeps chain order`);
  }
});

test("assistantActionExecutor: unknown action types surface a visible warning", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      { id: "n1", type: "create_node", nodeType: "ai-image" },
      { type: "teleport_nodes", scope: "all" },
    ],
    graphStore,
  });

  assert.equal(result.createdNodeIds.length, 1);
  assert.equal(
    result.warnings.some((warning) => /unknown action type.*teleport_nodes/.test(warning)),
    true,
    JSON.stringify(result.warnings)
  );
});

test("assistantActionExecutor: creates story workflow nodes without stacking", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      { id: "outline", type: "create_node", nodeType: "ai-text" },
      { id: "shot", type: "create_node", nodeType: "ai-image" },
      { type: "connect_nodes", from: "outline", to: "shot" },
      { type: "layout_nodes", nodeIds: ["outline", "shot"], layout: "storyboard_grid" },
    ],
    graphStore,
  });

  assert.equal(result.createdNodeIds.length, 2);
  assert.equal(graphStore.edges.length, 1);
  assert.notDeepEqual(
    { x: graphStore.nodes[0].x, y: graphStore.nodes[0].y },
    { x: graphStore.nodes[1].x, y: graphStore.nodes[1].y }
  );
});

test("assistantActionExecutor: storyboard grid lays out story nodes by workflow semantics", async () => {
  const graphStore = createGraphStore();

  await executeAssistantActions({
    actions: [
      {
        id: "shot_2_keyframe",
        type: "create_node",
        nodeType: "ai-image",
        data: { workflowKind: "story_to_video", workflowStep: "shot_keyframe", shotIndex: 2 },
      },
      {
        id: "outline",
        type: "create_node",
        nodeType: "ai-text",
        data: { workflowKind: "story_to_video", workflowStep: "story_outline" },
      },
      {
        id: "shot_1_video",
        type: "create_node",
        nodeType: "ai-video",
        data: { workflowKind: "story_to_video", workflowStep: "shot_video", shotIndex: 1 },
      },
      {
        id: "shot_1_script",
        type: "create_node",
        nodeType: "ai-text",
        data: { workflowKind: "story_to_video", workflowStep: "shot_script", shotIndex: 1 },
      },
      {
        id: "style",
        type: "create_node",
        nodeType: "ai-text",
        data: { workflowKind: "story_to_video", workflowStep: "style_bible" },
      },
      {
        id: "shot_1_keyframe",
        type: "create_node",
        nodeType: "ai-image",
        data: { workflowKind: "story_to_video", workflowStep: "shot_keyframe", shotIndex: 1 },
      },
      {
        id: "shot_2_script",
        type: "create_node",
        nodeType: "ai-text",
        data: { workflowKind: "story_to_video", workflowStep: "shot_script", shotIndex: 2 },
      },
      {
        id: "shot_2_video",
        type: "create_node",
        nodeType: "ai-video",
        data: { workflowKind: "story_to_video", workflowStep: "shot_video", shotIndex: 2 },
      },
      {
        type: "layout_nodes",
        nodeIds: [
          "shot_2_keyframe",
          "outline",
          "shot_1_video",
          "shot_1_script",
          "style",
          "shot_1_keyframe",
          "shot_2_script",
          "shot_2_video",
        ],
        layout: "storyboard_grid",
      },
    ],
    graphStore,
  });

  const byId = Object.fromEntries(graphStore.nodes.map((node) => [node.id, node]));

  // Outline/style dock in column 0 of the unified GRID (no longer the
  // legacy raw-origin pixels).
  assert.equal(byId.outline.x, byId.style.x);
  assert.ok(byId.outline.x < 120 + 416);
  assert.ok(byId.style.y > byId.outline.y);

  assert.ok(byId.shot_1_script.x > byId.outline.x);
  assert.ok(byId.shot_1_keyframe.x > byId.shot_1_script.x);
  assert.ok(byId.shot_1_video.x > byId.shot_1_keyframe.x);
  assert.equal(byId.shot_1_script.y, byId.shot_1_keyframe.y);
  assert.equal(byId.shot_1_keyframe.y, byId.shot_1_video.y);

  assert.equal(byId.shot_2_script.x, byId.shot_1_script.x);
  assert.equal(byId.shot_2_keyframe.x, byId.shot_1_keyframe.x);
  assert.equal(byId.shot_2_video.x, byId.shot_1_video.x);
  assert.ok(byId.shot_2_script.y > byId.shot_1_script.y);
});

test("assistantActionExecutor: queues text and image generation but blocks video", async () => {
  const graphStore = createGraphStore();
  const started = [];

  const result = await executeAssistantActions({
    actions: [
      { id: "text", type: "create_node", nodeType: "ai-text", data: { prompt: "写故事" } },
      { type: "queue_generation_task", nodeId: "text", nodeType: "ai-text", prompt: "写故事" },
      { id: "video", type: "create_node", nodeType: "ai-video" },
    ],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task.nodeId);
    },
  });

  assert.deepEqual(started, ["text"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["text"]);
  assert.equal(graphStore.nodes.find((node) => node.id === "video").data.generationStatus, null);
});

test("assistantActionExecutor: blocks generation targeting video nodes when nodeType is omitted", async () => {
  const graphStore = createGraphStore();
  const started = [];

  const result = await executeAssistantActions({
    actions: [
      { id: "video", type: "create_node", nodeType: "ai-video" },
      {
        type: "queue_generation_task",
        nodeId: "video",
      },
      {
        type: "run_prompt_preset_generation",
        nodeId: "video",
        presetId: "video-preset",
      },
    ],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task.nodeId);
    },
  });

  assert.deepEqual(started, []);
  assert.deepEqual(result.queuedGenerationNodeIds, []);
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.deepEqual(result.skippedVideoGenerationNodeIds, ["video", "video"]);
  assert.match(result.warnings.join(" "), /video generation requires confirmation/);
  assert.equal(graphStore.nodes.find((node) => node.id === "video").data.generationStatus, null);
});

test("assistantActionExecutor: unauthorized video generation does not mark the node queued", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "video",
    type: "ai-video",
    data: {
      generationStatus: "prepared",
      jobStatus: "prepared",
      asyncTaskStatus: "idle",
    },
  });
  const started = [];

  const result = await executeAssistantActions({
    actions: [{ type: "queue_generation_task", nodeId: "video", nodeType: "ai-video", prompt: "make video" }],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task.nodeId);
    },
  });

  assert.deepEqual(started, []);
  assert.deepEqual(result.queuedGenerationNodeIds, []);
  assert.deepEqual(result.skippedVideoGenerationNodeIds, ["video"]);
  const video = graphStore.nodes.find((node) => node.id === "video");
  assert.equal(video.data.generationStatus, "prepared");
  assert.equal(video.data.jobStatus, "prepared");
  assert.equal(video.data.asyncTaskStatus, "idle");
});

test("assistantActionExecutor: runs video generation only with explicit video authorization", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "video", type: "ai-video", data: { generationStatus: null } });
  const started = [];

  const blocked = await executeAssistantActions({
    actions: [{ type: "queue_generation_task", nodeId: "video", nodeType: "ai-video", prompt: "make video" }],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task.nodeId);
      return { started: true };
    },
  });
  const allowed = await executeAssistantActions({
    actions: [{ type: "queue_generation_task", nodeId: "video", nodeType: "ai-video", prompt: "make video" }],
    graphStore,
    videoAuthorized: true,
    generationTaskRunner: async (task) => {
      started.push(task.nodeId);
      return { started: true };
    },
  });

  assert.deepEqual(blocked.queuedGenerationNodeIds, []);
  assert.deepEqual(blocked.skippedVideoGenerationNodeIds, ["video"]);
  assert.match(blocked.warnings.join(" "), /explicit confirmation|video generation requires confirmation/i);
  assert.deepEqual(started, ["video"]);
  assert.deepEqual(allowed.queuedGenerationNodeIds, ["video"]);
  assert.deepEqual(allowed.startedGenerationNodeIds, ["video"]);
});

test("assistantActionExecutor: runs prompt preset generation directly", async () => {
  const graphStore = createGraphStore();
  const started = [];

  const result = await executeAssistantActions({
    actions: [
      { id: "text", type: "create_node", nodeType: "ai-text" },
      {
        type: "run_prompt_preset_generation",
        nodeId: "text",
        nodeType: "ai-text",
        presetId: "preset-story-outline",
        presetName: "story outline",
        prompt: "make a short outline",
      },
      { id: "video", type: "create_node", nodeType: "ai-video" },
      {
        type: "run_prompt_preset_generation",
        nodeId: "video",
        nodeType: "ai-video",
        presetId: "preset-video",
      },
    ],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task);
      return { started: true };
    },
  });

  assert.equal(started.length, 1);
  assert.equal(started[0].type, "run_prompt_preset_generation");
  assert.equal(started[0].nodeId, "text");
  assert.equal(started[0].presetId, "preset-story-outline");
  assert.equal(started[0].presetName, "story outline");
  assert.deepEqual(result.queuedGenerationNodeIds, ["text"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["text"]);
  assert.deepEqual(result.skippedVideoGenerationNodeIds, ["video"]);
  assert.match(result.warnings.join(" "), /video generation requires confirmation/);
  assert.equal(graphStore.nodes.find((node) => node.id === "text").data.generationStatus, "queued");
  assert.equal(graphStore.nodes.find((node) => node.id === "video").data.generationStatus, null);
});

test("assistantActionExecutor: prompt preset generation by id preserves node prompt when template is hidden", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "image-1",
    type: "ai-image",
    data: { prompt: "existing editable image prompt" },
  });
  let runnerTask = null;

  const result = await executeAssistantActions({
    actions: [
      {
        type: "run_prompt_preset_generation",
        nodeId: "image-1",
        nodeType: "ai-image",
        presetId: "product-hero",
        presetName: "Product Hero",
        inputs: { brief: "warm bakery window", style: "soft steam" },
      },
    ],
    graphStore,
    generationTaskRunner: async (task) => {
      runnerTask = task;
      return { started: true };
    },
  });

  assert.equal(runnerTask.presetId, "product-hero");
  assert.equal(runnerTask.presetName, "Product Hero");
  assert.deepEqual(runnerTask.inputs, { brief: "warm bakery window", style: "soft steam" });
  assert.equal("template" in runnerTask, false);
  assert.equal(graphStore.nodes[0].data.prompt, "existing editable image prompt");
  assert.deepEqual(result.startedGenerationNodeIds, ["image-1"]);
});

test("assistantActionExecutor: updates node data and reports affected node ids", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "node_1", type: "note", data: { text: "old" } });

  const result = await executeAssistantActions({
    actions: [{ type: "update_node", nodeId: "node_1", data: { text: "new" } }],
    graphStore,
  });

  assert.deepEqual(graphStore.nodes[0].data, { text: "new" });
  assert.deepEqual(result.updatedNodeIds, ["node_1"]);
  assert.equal(result.appliedCount, 1);
});

test("assistantActionExecutor: records prompt surgery diff and undo metadata", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "prompt-1", type: "ai-image", data: { prompt: "old rainy street" } });

  const result = await executeAssistantActions({
    actions: [
      {
        type: "update_node_data",
        nodeId: "prompt-1",
        data: { prompt: "new rainy neon street" },
        promptDiff: "- old rainy street\n+ new rainy neon street",
      },
    ],
    graphStore,
  });

  assert.equal(graphStore.nodes[0].data.prompt, "new rainy neon street");
  assert.deepEqual(result.promptSurgeryPatches, [
    {
      nodeId: "prompt-1",
      previousPrompt: "old rainy street",
      nextPrompt: "new rainy neon street",
      promptDiff: "- old rainy street\n+ new rainy neon street",
      undoPatch: {
        type: "update_node_data",
        nodeId: "prompt-1",
        data: { prompt: "old rainy street" },
      },
    },
  ]);
});

test("assistantActionExecutor: warns and skips update when target node is missing", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [{ type: "update_node", nodeId: "missing", data: { text: "new" } }],
    graphStore,
  });

  assert.deepEqual(result.updatedNodeIds, []);
  assert.equal(result.appliedCount, 0);
  assert.match(result.warnings.join(" "), /missing/);
});

test("assistantActionExecutor: queues safe image generation idempotently", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "image-1", nodeType: "ai-image", type: "ai-image" });
  const queued = [];
  const generationTaskRunner = async (task) => {
    queued.push(task);
    return { pending: true, taskId: task.idempotencyKey };
  };
  const actions = [
    {
      type: "queue_generation_task",
      actionId: "action-image-1",
      nodeId: "image-1",
      nodeType: "ai-image",
      prompt: "make image",
      conversationId: "conv-1",
      messageId: "msg-1",
    },
  ];

  const first = await executeAssistantActions({ actions, graphStore, generationTaskRunner });
  const second = await executeAssistantActions({ actions, graphStore, generationTaskRunner });

  assert.deepEqual(first.queuedGenerationNodeIds, ["image-1"]);
  assert.deepEqual(second.queuedGenerationNodeIds, ["image-1"]);
  assert.equal(queued[0].idempotencyKey, "conv-1:msg-1:action-image-1:image-1");
});

test("assistantActionExecutor: default generation runner persists and deduplicates pending tasks", async () => {
  const previousWindow = globalThis.window;
  const storage = createMemoryStorage();
  const calls = [];
  try {
    globalThis.window = {
      localStorage: storage,
      __v2RendererBridge: {
        nodeInstances: new Map([
          [
            "image-1",
            {
              async onGenerate(prompt, task) {
                calls.push({ prompt, taskId: task.id });
              },
            },
          ],
        ]),
      },
    };
    const task = {
      idempotencyKey: "conv-1:msg-1:action-image-1:image-1",
      nodeId: "image-1",
      nodeType: "ai-image",
      prompt: "make image",
    };

    const first = await defaultGenerationTaskRunner(task);
    const second = await defaultGenerationTaskRunner(task);
    const restored = createAssistantGenerationTaskStore({ storage }).list();

    assert.equal(first.started, true);
    assert.equal(second.duplicate, true);
    assert.equal(calls.length, 1);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].idempotencyKey, task.idempotencyKey);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("assistantActionExecutor: default generation runner uses window.v2Renderer bridge", async () => {
  const previousWindow = globalThis.window;
  const storage = createMemoryStorage();
  const calls = [];
  try {
    globalThis.window = {
      localStorage: storage,
      v2Renderer: {
        nodeInstances: new Map([
          [
            "image-1",
            {
              async onGenerate(prompt, task) {
                calls.push({ prompt, taskId: task.id });
              },
            },
          ],
        ]),
      },
    };

    const result = await defaultGenerationTaskRunner({
      idempotencyKey: "conv-1:msg-1:action-image-1:image-1:v2",
      nodeId: "image-1",
      nodeType: "ai-image",
      prompt: "make image",
    });

    assert.equal(result.started, true);
    assert.deepEqual(calls.map((call) => call.prompt), ["make image"]);
  } finally {
    globalThis.window = previousWindow;
  }
});


test("assistantActionExecutor: tracks generation task store lifecycle with metadata", async () => {
  let next = 0;
  const store = createAssistantGenerationTaskStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_${++next}`,
  });
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "image-1", type: "ai-image", data: { prompt: "old" } });
  let runnerTask = null;

  const result = await executeAssistantActions({
    actions: [
      {
        type: "queue_generation_task",
        actionId: "act-image",
        nodeId: "image-1",
        nodeType: "ai-image",
        provider: "custom_ai",
        model: "image-model",
        prompt: "make image",
        references: [{ id: "ref-1", usage: "style" }],
        metadata: {
          conversationId: "conv-1",
          messageId: "msg-1",
          transactionId: "txn-1",
          traceId: "trace-1",
        },
      },
    ],
    graphStore,
    generationTaskStore: store,
    generationTaskRunner: async (task) => {
      runnerTask = task;
      return { assetIds: ["asset-1"], outputText: "done" };
    },
  });

  const task = store.list()[0];
  assert.equal(task.status, AssistantGenerationTaskStatus.Completed);
  assert.equal(task.transactionId, "txn-1");
  assert.equal(task.conversationId, "conv-1");
  assert.equal(task.messageId, "msg-1");
  assert.equal(task.traceId, "trace-1");
  assert.equal(task.nodeId, "image-1");
  assert.equal(task.nodeType, "ai-image");
  assert.equal(task.provider, "custom_ai");
  assert.equal(task.model, "image-model");
  assert.deepEqual(task.references, [{ id: "ref-1", usage: "style" }]);
  assert.deepEqual(task.result.assetIds, ["asset-1"]);
  assert.equal(runnerTask.id, task.id);
  assert.equal(runnerTask.idempotencyKey, "txn-1:image-1:queue_generation_task");
  assert.deepEqual(result.startedGenerationNodeIds, ["image-1"]);
  assert.deepEqual(result.completedGenerationNodeIds, ["image-1"]);
  assert.equal(graphStore.nodes[0].data.generationStatus, "completed");
});

test("assistantActionExecutor: renderer-missing generation stays queued and retryable", async () => {
  let next = 0;
  const store = createAssistantGenerationTaskStore({
    storage: createMemoryStorage(),
    clock: () => "2026-06-03T00:00:00.000Z",
    idFactory: (prefix) => `${prefix}_${++next}`,
  });
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "image-1", type: "ai-image", data: {} });

  const result = await executeAssistantActions({
    actions: [{ type: "queue_generation_task", nodeId: "image-1", nodeType: "ai-image", prompt: "make image" }],
    graphStore,
    generationTaskStore: store,
  });

  assert.equal(store.list()[0].status, AssistantGenerationTaskStatus.Queued);
  assert.deepEqual(result.queuedGenerationNodeIds, ["image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.match(result.warnings.join(" "), /queued|renderer/i);
  assert.equal(graphStore.nodes[0].data.generationStatus, "queued");
});


test("assistantActionExecutor: places coordinate-free created nodes beside the selection", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "anchor", type: "comment", x: 100, y: 120, width: 220, height: 100, data: {} });
  graphStore.setSelectedNodes(["anchor"]);

  await executeAssistantActions({
    actions: [
      { id: "note-a", type: "create_node", nodeType: "comment", name: "A" },
      { id: "note-b", type: "create_node", nodeType: "comment", name: "B" },
    ],
    graphStore,
  });

  const anchorNode = graphStore.nodes.find((node) => node.id === "anchor");
  const noteA = graphStore.nodes.find((node) => node.id === "note-a");
  const noteB = graphStore.nodes.find((node) => node.id === "note-b");
  assert.equal(noteA.x > anchorNode.x, true);
  assert.equal(noteB.x > noteA.x, true);
  assert.equal(noteA.y, noteB.y);
  assert.match(String(noteA.data.placementReason || ""), /near selection/);
  const apart = noteA.x + noteA.width <= noteB.x || noteB.x + noteB.width <= noteA.x;
  assert.equal(apart, true);
});

test("assistantActionExecutor: move_nodes without coordinates uses a non-overlapping fallback", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "n1", type: "comment", x: 0, y: 0, width: 100, height: 80, data: {} });
  graphStore.addNode({ id: "n2", type: "comment", x: 0, y: 0, width: 100, height: 80, data: {} });

  const result = await executeAssistantActions({
    actions: [{ type: "move_nodes", nodeIds: ["n1", "n2"] }],
    graphStore,
  });

  assert.equal(result.appliedCount, 1);
  assert.notDeepEqual(
    { x: graphStore.nodes[0].x, y: graphStore.nodes[0].y },
    { x: graphStore.nodes[1].x, y: graphStore.nodes[1].y }
  );
});


test("assistantActionExecutor: create_group creates a group frame around target nodes", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "n1", type: "comment", x: 100, y: 100, width: 100, height: 50, data: {} });
  graphStore.addNode({ id: "n2", type: "comment", x: 260, y: 120, width: 120, height: 80, data: {} });

  const result = await executeAssistantActions({
    actions: [{ id: "group-1", type: "create_group", nodeIds: ["n1", "n2"], name: "Layout group" }],
    graphStore,
  });

  const group = graphStore.nodes.find((node) => node.id === "group-1");
  assert.equal(result.appliedCount, 1);
  assert.equal(group.type, "group");
  assert.deepEqual(group.data.nodeIds, ["n1", "n2"]);
  assert.ok(group.x < 100);
  assert.ok(group.y < 100);
  assert.ok(group.width > 280);
  assert.ok(group.height > 100);
});

test("assistantActionExecutor: duplicate_nodes creates variant branches without generation", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "script",
    type: "ai-text",
    x: 100,
    y: 120,
    width: 200,
    height: 120,
    name: "Script",
    data: { prompt: "original story", generationStatus: "completed" },
  });
  graphStore.addNode({
    id: "image",
    type: "ai-image",
    x: 380,
    y: 120,
    width: 220,
    height: 160,
    name: "Keyframe",
    data: { prompt: "original image", generationStatus: "completed" },
  });
  graphStore.addEdge({ id: "edge-script-image", source: "script", target: "image", label: "feeds" });
  const started = [];

  const result = await executeAssistantActions({
    actions: [
      {
        id: "variant-action",
        type: "duplicate_nodes",
        nodeIds: ["script", "image"],
        variants: [
          { id: "noir", label: "Noir", difference: "rainy monochrome mood" },
          { id: "pop", label: "Pop", difference: "bright playful mood" },
          { id: "doc", label: "Documentary", difference: "handheld realism" },
        ],
        groupBranches: true,
      },
    ],
    graphStore,
    generationTaskRunner: async (task) => {
      started.push(task);
    },
  });

  const variantNodes = graphStore.nodes.filter((node) => node.type !== "group" && node.data?.variantBranchId);
  const variantGroups = graphStore.nodes.filter((node) => node.type === "group");
  const variantEdges = graphStore.edges.filter((edge) => edge.id !== "edge-script-image");

  assert.equal(result.appliedCount, 1);
  assert.equal(variantNodes.length, 6);
  assert.equal(variantGroups.length, 3);
  assert.equal(variantEdges.length, 3);
  assert.deepEqual(started, []);
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.equal(new Set(variantNodes.map((node) => node.data.variantBranchId)).size, 3);
  assert.ok(variantNodes.every((node) => node.data.generationStatus === "completed"));
  assert.ok(variantEdges.every((edge) => edge.source.startsWith("variant-action-")));
  assert.ok(variantGroups.every((group) => group.data.nodeIds.length === 2));
  assert.ok(graphStore.nodes.find((node) => node.id === "script"));
  assert.ok(graphStore.nodes.find((node) => node.id === "image"));
});

test("assistantActionExecutor: duplicate_nodes normalizes branch count to three through five", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "source",
    type: "comment",
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    name: "Source",
    data: { content: "copy me" },
  });

  await executeAssistantActions({
    actions: [
      {
        id: "too-few",
        type: "duplicate_nodes",
        nodeIds: ["source"],
        branchCount: 1,
      },
      {
        id: "too-many",
        type: "duplicate_nodes",
        nodeIds: ["source"],
        variants: [
          { id: "a" },
          { id: "b" },
          { id: "c" },
          { id: "d" },
          { id: "e" },
          { id: "f" },
        ],
      },
    ],
    graphStore,
  });

  const tooFew = graphStore.nodes.filter((node) => node.data?.variantSourceNodeId === "source" && node.id.startsWith("too-few-"));
  const tooMany = graphStore.nodes.filter((node) => node.data?.variantSourceNodeId === "source" && node.id.startsWith("too-many-"));

  assert.equal(tooFew.length, 3);
  assert.equal(tooMany.length, 5);
});

test("assistantActionExecutor: saves and reapplies project workflow templates without generation", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "script",
    type: "ai-text",
    x: 100,
    y: 120,
    width: 200,
    height: 120,
    name: "Script",
    data: { prompt: "original story" },
  });
  graphStore.addNode({
    id: "image",
    type: "ai-image",
    x: 380,
    y: 120,
    width: 220,
    height: 160,
    name: "Keyframe",
    data: { prompt: "original image" },
  });
  graphStore.addEdge({ id: "edge-script-image", source: "script", target: "image", label: "feeds" });
  const records = new Map();
  const templateStore = {
    save(record) {
      records.set(record.templateId, record);
      return record;
    },
    get(templateId) {
      return records.get(templateId);
    },
  };

  const created = await executeAssistantActions({
    actions: [
      {
        type: "create_workflow_template",
        templateId: "tpl-story",
        name: "Reusable story workflow",
        nodeIds: ["script", "image"],
        scope: "project",
        version: "1.0.0",
        author: "qa-user",
        tags: ["story", "video"],
      },
    ],
    graphStore,
    templateStore,
  });

  assert.deepEqual(created.createdTemplateIds, ["tpl-story"]);
  assert.equal(created.workflowTemplates[0].templateId, "tpl-story");
  assert.equal(created.workflowTemplates[0].scope, "project");
  assert.equal(created.workflowTemplates[0].version, "1.0.0");
  assert.equal(created.workflowTemplates[0].author, "qa-user");
  assert.deepEqual(created.workflowTemplates[0].tags, ["story", "video"]);
  assert.equal(created.workflowTemplates[0].nodes.length, 2);
  assert.equal(created.workflowTemplates[0].edges.length, 1);
  assert.equal(graphStore.nodes.length, 2);
  assert.equal(graphStore.edges.length, 1);

  const applied = await executeAssistantActions({
    actions: [
      {
        type: "apply_workflow_template",
        templateId: "tpl-story",
        offset: { x: 640, y: 220 },
      },
    ],
    graphStore,
    templateStore,
    generationTaskRunner: async () => {
      throw new Error("template reuse must not start generation");
    },
  });

  const copiedNodes = graphStore.nodes.filter((node) => node.data?.templateId === "tpl-story");
  const copiedEdges = graphStore.edges.filter((edge) => edge.id !== "edge-script-image");

  assert.deepEqual(applied.appliedTemplateIds, ["tpl-story"]);
  assert.equal(copiedNodes.length, 2);
  assert.equal(copiedEdges.length, 1);
  assert.deepEqual(applied.startedGenerationNodeIds, []);
  assert.ok(copiedNodes.every((node) => node.data.templateSourceNodeId));
  assert.ok(copiedNodes.every((node) => node.x >= 740 && node.y >= 340));
  assert.ok(copiedEdges.every((edge) => copiedNodes.some((node) => node.id === edge.source)));
  assert.ok(copiedEdges.every((edge) => copiedNodes.some((node) => node.id === edge.target)));
});

test("assistantActionExecutor: applies team workflow template governance through the store", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({
    id: "script",
    type: "ai-text",
    x: 100,
    y: 120,
    width: 200,
    height: 120,
    name: "Script",
    data: { prompt: "team story" },
  });
  const templateStore = createAssistantWorkflowTemplateStore({
    storage: createMemoryStorage(),
    projectId: "project-a",
    teamId: "team-alpha",
    clock: () => "2026-06-05T00:00:00.000Z",
  });

  const result = await executeAssistantActions({
    actions: [
      {
        type: "create_workflow_template",
        templateId: "tpl-team-story",
        name: "Team story workflow",
        nodeIds: ["script"],
        scope: "project",
        version: "1.0.0",
        author: "alice",
        tags: ["story"],
      },
      {
        type: "submit_workflow_template_review",
        templateId: "tpl-team-story",
        note: "Ready for team review.",
        author: "alice",
      },
      {
        type: "review_workflow_template",
        templateId: "tpl-team-story",
        decision: "approve",
        reviewer: "lead",
        note: "Reusable and safe.",
      },
      {
        type: "publish_workflow_template",
        templateId: "tpl-team-story",
        teamId: "team-alpha",
        publishedBy: "lead",
      },
      {
        type: "record_workflow_template_reuse",
        templateId: "tpl-team-story",
        scope: "team",
        userId: "designer-b",
        projectId: "project-b",
      },
      {
        type: "deprecate_workflow_template",
        templateId: "tpl-team-story",
        scope: "team",
        reason: "Rollback to safer prompt.",
        author: "lead",
      },
      {
        type: "rollback_workflow_template",
        templateId: "tpl-team-story",
        scope: "team",
        rollbackToVersion: "1.0.0",
        version: "1.0.1",
        author: "lead",
      },
    ],
    graphStore,
    templateStore,
    generationTaskRunner: async () => {
      throw new Error("team template governance must not start generation");
    },
  });

  const latest = templateStore.get("tpl-team-story", { scope: "team" });

  assert.equal(result.appliedCount, 7);
  assert.deepEqual(result.createdTemplateIds, ["tpl-team-story"]);
  assert.deepEqual(result.governedTemplateIds, [
    "tpl-team-story",
    "tpl-team-story",
    "tpl-team-story",
    "tpl-team-story",
    "tpl-team-story",
    "tpl-team-story",
  ]);
  assert.equal(result.templateGovernanceEvents.length, 6);
  assert.equal(result.templateGovernanceEvents[0].type, "submit_workflow_template_review");
  assert.equal(result.templateGovernanceEvents[2].type, "publish_workflow_template");
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.equal(latest.scope, "team");
  assert.equal(latest.teamId, "team-alpha");
  assert.equal(latest.version, "1.0.1");
  assert.equal(latest.reviewStatus, "published");
  assert.equal(latest.reuseCount, 1);
  assert.equal(latest.lastReusedBy, "designer-b");
  assert.equal(latest.rollbackToVersion, "1.0.0");
  assert.equal(latest.deprecated, false);
});

test("assistantActionExecutor: reapplies published team workflow templates across projects", async () => {
  const storage = createMemoryStorage();
  const storeA = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-a",
    teamId: "team-alpha",
    clock: () => "2026-06-05T00:00:00.000Z",
  });
  storeA.save({
    templateId: "tpl-team-story",
    name: "Team story workflow",
    projectId: "project-a",
    version: "1.0.0",
    author: "alice",
    scope: "project",
    nodes: [
      {
        id: "script",
        type: "ai-text",
        x: 100,
        y: 120,
        width: 200,
        height: 120,
        data: { prompt: "team story" },
      },
    ],
    edges: [],
  });
  storeA.review("tpl-team-story", { decision: "approve", reviewer: "lead" });
  storeA.publish("tpl-team-story", { teamId: "team-alpha", publishedBy: "lead" });

  const storeB = createAssistantWorkflowTemplateStore({
    storage,
    projectId: "project-b",
    teamId: "team-alpha",
  });
  const graphStore = createGraphStore();

  const applied = await executeAssistantActions({
    actions: [
      {
        type: "apply_workflow_template",
        templateId: "tpl-team-story",
        scope: "team",
        teamId: "team-alpha",
        offset: { x: 320, y: 40 },
      },
    ],
    graphStore,
    templateStore: storeB,
    generationTaskRunner: async () => {
      throw new Error("team template reuse must not start generation");
    },
  });

  assert.deepEqual(applied.appliedTemplateIds, ["tpl-team-story"]);
  assert.equal(graphStore.nodes.length, 1);
  assert.equal(graphStore.nodes[0].data.templateId, "tpl-team-story");
  assert.equal(graphStore.nodes[0].data.templateVersion, "1.0.0");
  assert.equal(graphStore.nodes[0].data.prompt, "team story");
  assert.deepEqual(applied.startedGenerationNodeIds, []);
});

test("assistantActionExecutor: connect_nodes preserves source and target handles", async () => {
  const graphStore = createGraphStore();
  graphStore.addNode({ id: "text", type: "ai-text", data: {} });
  graphStore.addNode({ id: "image", type: "ai-image", data: {} });

  await executeAssistantActions({
    actions: [
      {
        type: "connect_nodes",
        from: "text",
        to: "image",
        sourceHandle: "text-output",
        targetHandle: "prompt-input",
        label: "prompt",
      },
    ],
    graphStore,
  });

  assert.equal(graphStore.edges[0].sourceHandle, "text-output");
  assert.equal(graphStore.edges[0].targetHandle, "prompt-input");
});

test("assistantActionExecutor: formats LLM Wiki knowledge cards and returns source trace", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      {
        id: "knowledge-card-1",
        type: "create_node",
        nodeType: "source-text",
        name: "Brand Guide",
        data: {
          workflowKind: "knowledge_card",
          workflowStep: "llm_wiki_card",
          sourceTitle: "Brand Guide",
          fileId: "file-brand",
          projectId: "project-brand",
          citation: "p.12",
          summary: "Warm, ingredient-led brand voice.",
        },
      },
    ],
    graphStore,
  });

  const node = graphStore.nodes[0];

  assert.equal(node.id, "knowledge-card-1");
  assert.equal(node.type, "source-text");
  assert.equal(node.data.citationKind, "llm_wiki");
  assert.equal(node.data.citationDisplay, "Brand Guide (file-brand)");
  assert.equal(node.data.citationProjectId, "project-brand");
  assert.match(node.data.content, /Brand Guide/);
  assert.match(node.data.content, /Warm, ingredient-led brand voice/);
  assert.match(node.data.content, /file-brand/);
  assert.match(node.data.content, /p\.12/);
  assert.deepEqual(result.knowledgeCards, [
    {
      nodeId: "knowledge-card-1",
      title: "Brand Guide",
      fileId: "file-brand",
      projectId: "project-brand",
      citation: "p.12",
      citationDisplay: "Brand Guide (file-brand)",
    },
  ]);
});

test("assistantActionExecutor: canvas skills runtime takes priority for convertible AI actions", async () => {
  const graphStore = createGraphStore();
  let runtimePayload = null;
  const runtimeResult = {
    appliedCount: 1,
    createdNodeIds: ["ai-image-runtime"],
    warnings: ["runtime retryable warning"],
  };

  const result = await executeAssistantActions({
    actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }],
    graphStore,
    canvasSkillsRuntime: {
      async executeActions(payload) {
        runtimePayload = payload;
        return runtimeResult;
      },
    },
    agentMode: "act",
    videoAuthorized: true,
    generationTaskRunner: async () => {
      throw new Error("legacy generation runner must not be used");
    },
  });

  assert.equal(result, runtimeResult);
  assert.deepEqual(runtimePayload.actions, [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }]);
  assert.equal(runtimePayload.graphStore, graphStore);
  assert.equal(runtimePayload.agentMode, "act");
  assert.equal(runtimePayload.videoAuthorized, true);
  assert.deepEqual(graphStore.nodes, []);
});

test("assistantActionExecutor: preserves fallback when no canvas skills runtime is provided", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }],
    graphStore,
  });

  assert.deepEqual(result.createdNodeIds, ["img"]);
  assert.equal(graphStore.nodes[0].type, "ai-image");
  assert.equal(graphStore.nodes[0].data.prompt, "");
});

test("assistantActionExecutor: mixed canvas and legacy batches keep non-candidate fallback actions", async () => {
  const graphStore = createGraphStore();

  const result = await executeAssistantActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" },
      { id: "note", type: "create_node", nodeType: "comment", name: "Legacy note" },
    ],
    graphStore,
    canvasSkillsRuntime: {
      async executeActions() {
        return {
          appliedCount: 1,
          createdNodeIds: ["ai-image-runtime"],
          warnings: ["renderer not ready: retryable"],
        };
      },
    },
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-runtime", "note"]);
  assert.equal(graphStore.nodes.some((node) => node.id === "note"), true);
  assert.match(result.warnings.join(" "), /retryable/);
});
