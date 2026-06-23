import test from "node:test";
import assert from "node:assert/strict";

import { createCanvasSkillsRuntime } from "./runtime.js";

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
      if (node) node.data = { ...(node.data || {}), ...(patch || {}) };
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes, edges };
    },
  };
}

test("canvasSkills runtime: creates image draft through node flow and generates through renderer", async () => {
  const graphStore = createGraphStore();
  const generated = [];
  const rendererBridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const node = { id: `${nodeType}-1`, type: nodeType, width, height, name, data: {} };
      graphStore.addNode(node);
      rendererBridge.nodeInstances.set(node.id, {
        async onGenerate(prompt, task) {
          generated.push({ prompt, task });
          return { started: true };
        },
      });
      return node;
    },
  };

  const runtime = createCanvasSkillsRuntime({
    graphStore,
    adapters: {
      nodeFlows,
      rendererBridge,
      modelRegistry: {
        getModelsByNodeType: () => [{ id: "img-1", configured: true }],
        listModels: () => [{ id: "img-1", configured: true }],
      },
    },
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const result = await runtime.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat", modelId: "img-1", batchSize: 2 },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "cat" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(graphStore.nodes[0].data.prompt, "cat");
  assert.equal(graphStore.nodes[0].data.batchSize, 2);
  assert.equal(graphStore.nodes[0].data.modelId, "img-1");
  assert.deepEqual(generated.map((item) => item.prompt), ["cat"]);
});

test("canvasSkills runtime: late renderer bridge still submits generation", async () => {
  const graphStore = createGraphStore();
  const generated = [];
  const lateWindow = {};
  const rendererBridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const node = { id: `${nodeType}-late`, type: nodeType, width, height, name, data: {} };
      graphStore.addNode(node);
      rendererBridge.nodeInstances.set(node.id, {
        submitGenerationFromAgent(prompt, task) {
          generated.push({ prompt, task });
          return { started: true };
        },
      });
      lateWindow.__v2RendererBridge = rendererBridge;
      return node;
    },
  };

  const runtime = createCanvasSkillsRuntime({
    graphStore,
    adapters: {
      nodeFlows,
      rendererBridge: null,
      modelRegistry: {
        getModelsByNodeType: () => [{ id: "img-1", configured: true }],
        listModels: () => [{ id: "img-1", configured: true }],
      },
    },
    windowRef: lateWindow,
    pollIntervalMs: 1,
    readinessTimeoutMs: 40,
  });

  const result = await runtime.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat", modelId: "img-1" },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "cat" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-late"]);
  assert.deepEqual(generated.map((item) => item.prompt), ["cat"]);
  assert.equal(generated[0].task.source, "assistant");
});

test("canvasSkills runtime: created drafts honor placement and never pile at the cursor", async () => {
  const graphStore = createGraphStore();
  const rendererBridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: new Map(),
  };
  let spawnCount = 0;
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      spawnCount += 1;
      const node = { id: `${nodeType}-${spawnCount}`, type: nodeType, x: 50, y: 50, width: width || 320, height: height || 220, name, data: {} };
      graphStore.addNode(node);
      rendererBridge.nodeInstances.set(node.id, { async onGenerate() { return { started: true }; } });
      return node;
    },
  };

  const runtime = createCanvasSkillsRuntime({
    graphStore,
    adapters: {
      nodeFlows,
      rendererBridge,
      modelRegistry: {
        getModelsByNodeType: () => [{ id: "m-1", configured: true }],
        listModels: () => [{ id: "m-1", configured: true }],
      },
    },
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  await runtime.executeActions({
    actions: [
      { id: "txt", type: "create_node", nodeType: "ai-text", prompt: "p", placement: { strategy: "new-lane", topic: "demo" } },
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "p", placement: { strategy: "right-of", anchor: "txt" } },
    ],
  });

  const textNode = graphStore.nodes.find((node) => node.type === "ai-text");
  const imageNode = graphStore.nodes.find((node) => node.type === "ai-image");
  assert.ok(textNode && imageNode);
  assert.notDeepEqual({ x: textNode.x, y: textNode.y }, { x: 50, y: 50 }, "placement must override cursor spawn");
  assert.equal(imageNode.y, textNode.y, "right-of keeps the lane row");
  assert.equal(imageNode.x > textNode.x, true);
  const apart = textNode.x + textNode.width <= imageNode.x || imageNode.x + imageNode.width <= textNode.x;
  assert.equal(apart, true, "no overlap");
  assert.match(String(textNode.data.placementReason || ""), /new-lane/);
});

test("canvasSkills runtime: placement-less drafts get magnetic defaults instead of stacking", async () => {
  const graphStore = createGraphStore();
  const rendererBridge = { isNodeMounted: () => true, getMountedWrapper: () => ({}), pinNode() {}, unpinNode() {}, nodeInstances: new Map() };
  let spawnCount = 0;
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      spawnCount += 1;
      const node = { id: `${nodeType}-${spawnCount}`, type: nodeType, x: 50, y: 50, width: width || 320, height: height || 220, name, data: {} };
      graphStore.addNode(node);
      rendererBridge.nodeInstances.set(node.id, { async onGenerate() { return { started: true }; } });
      return node;
    },
  };
  const runtime = createCanvasSkillsRuntime({
    graphStore,
    adapters: { nodeFlows, rendererBridge, modelRegistry: { getModelsByNodeType: () => [{ id: "m", configured: true }], listModels: () => [{ id: "m", configured: true }] } },
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  await runtime.executeActions({
    actions: [
      { id: "a", type: "create_node", nodeType: "ai-image", prompt: "x" },
      { id: "b", type: "create_node", nodeType: "ai-image", prompt: "y" },
    ],
  });

  const [first, second] = graphStore.nodes;
  const apart = first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y;
  assert.equal(apart, true, `nodes must not stack: ${first.x},${first.y} vs ${second.x},${second.y}`);
});

test("canvasSkills runtime: trusted director source lands lineage fields on the node; untrusted strips them", async () => {
  const makeFixture = () => {
    const graphStore = createGraphStore();
    const rendererBridge = {
      isNodeMounted: () => true,
      getMountedWrapper: () => ({}),
      pinNode() {},
      unpinNode() {},
      nodeInstances: new Map(),
    };
    const nodeFlows = {
      createNodeAtCursor(nodeType, width, height, name) {
        const node = { id: `${nodeType}-1`, type: nodeType, width, height, name, data: {} };
        graphStore.addNode(node);
        rendererBridge.nodeInstances.set(node.id, { async onGenerate() { return { started: true }; } });
        return node;
      },
    };
    const runtime = createCanvasSkillsRuntime({
      graphStore,
      adapters: {
        nodeFlows,
        rendererBridge,
        modelRegistry: {
          getModelsByNodeType: () => [{ id: "img-1", configured: true }],
          listModels: () => [{ id: "img-1", configured: true }],
        },
      },
      pollIntervalMs: 1,
      readinessTimeoutMs: 20,
    });
    return { graphStore, runtime };
  };
  const lineageAction = {
    id: "qmai-image-prompt-shot-001-image",
    type: "create_node",
    nodeType: "ai-image",
    name: "prep · shot-001",
    autoStart: false,
    data: {
      prompt: "雨夜便利店",
      negativePrompt: "禁止暖光",
      qmaiPromptId: "prompt-shot-001-image",
      continuityAnchors: ["灰风衣"],
      dramaticBeat: "establish",
      autoStart: false,
    },
  };

  const trusted = makeFixture();
  await trusted.runtime.executeActions({ actions: [lineageAction], agentMode: "plan", source: "qmai-director" });
  const trustedNode = trusted.graphStore.nodes[0];
  assert.equal(trustedNode.data.qmaiPromptId, "prompt-shot-001-image");
  assert.equal(trustedNode.data.negativePrompt, "禁止暖光");
  assert.deepEqual(trustedNode.data.continuityAnchors, ["灰风衣"]);
  assert.equal(trustedNode.data.dramaticBeat, "establish");

  const untrusted = makeFixture();
  const untrustedResult = await untrusted.runtime.executeActions({ actions: [lineageAction], agentMode: "plan" });
  const untrustedNode = untrusted.graphStore.nodes[0];
  assert.equal(untrustedNode.data.qmaiPromptId, undefined);
  assert.equal(untrustedNode.data.negativePrompt, undefined);
  assert.equal(untrustedResult.warnings.some((w) => /qmaiPromptId/.test(w)), true);
});
