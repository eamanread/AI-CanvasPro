import test from "node:test";
import assert from "node:assert/strict";

import { createAssistantCanvasAssetSkills } from "./assistantCanvasAssetSkills.js";
import { createAssistantCanvasNodeLifecycle } from "./assistantCanvasNodeLifecycle.js";
import { createAssistantCanvasSkillExecutor } from "./assistantCanvasSkillExecutor.js";
import { createAssistantCanvasWorkflowSkills } from "./assistantCanvasWorkflowSkills.js";

function graph() {
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
      if (node) node.data = { ...(node.data || {}), ...patch };
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes, edges };
    },
  };
}

function runtime(graphStore) {
  let nextId = 0;
  const generated = [];
  const bridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: {
      map: new Map(),
      get(id) {
        return this.map.get(id);
      },
      set(id, value) {
        this.map.set(id, value);
        return this;
      },
    },
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const id = `${nodeType}-${++nextId}`;
      const node = { id, type: nodeType, width, height, name, data: {} };
      graphStore.addNode(node);
      bridge.nodeInstances.set(id, {
        async _onGenerate(prompt, task) {
          generated.push({ nodeId: id, prompt, task });
          return { started: true };
        },
      });
      return node;
    },
  };
  const nodeLifecycle = createAssistantCanvasNodeLifecycle({
    graphStore,
    nodeFlows,
    rendererBridge: bridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });
  const workflowSkills = createAssistantCanvasWorkflowSkills({
    graphStore,
    workflowService: {
      loadWorkflowsFromServer: async () => [{ id: "wf-1", name: "Story workflow", workflowData: {} }],
      saveWorkflowUsage: async () => null,
      saveNewWorkflowFromCanvas: async () => ({ id: "wf-new" }),
      saveUpdatedWorkflowFromCanvas: async (id) => ({ id }),
    },
    workflowCanvas: {
      applyWorkflowToCanvas: () => ({ nodes: [{ id: "wf-node", type: "ai-text", data: {} }], edges: [] }),
    },
  });
  const savedAssets = [];
  const assetSkills = createAssistantCanvasAssetSkills({
    graphStore,
    assetStore: {
      getState: () => ({ assets: [] }),
      addAsset: (asset) => savedAssets.push(asset),
    },
    saveAssetToServer: async (payload) => ({ ...payload, id: "asset-1" }),
  });
  return {
    executor: createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle, workflowSkills, assetSkills }),
    generated,
    savedAssets,
  };
}

test("canvas skills integration: image generation creates editable node and starts generator", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "role-a", type: "source-image", name: "Role A", data: {} });
  const { executor, generated } = runtime(graphStore);
  const result = await executor.executeActions({
    actions: [
      {
        id: "img",
        type: "create_node",
        nodeType: "ai-image",
        prompt: "use Role A for 3 avatars",
        batchSize: 3,
        references: [{ id: "role-a", type: "canvas_node", label: "Role A" }],
      },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "use Role A for 3 avatars" },
    ],
    agentMode: "plan",
  });
  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(graphStore.nodes.find((node) => node.id === "ai-image-1").data.batchSize, 3);
  assert.equal(graphStore.edges[0].source, "role-a");
  assert.equal(generated.length, 1);
});

test("canvas skills integration: video prep is editable and plan video generation waits", async () => {
  const graphStore = graph();
  const { executor } = runtime(graphStore);
  const prep = await executor.executeActions({
    actions: [{ id: "video", type: "create_node", nodeType: "ai-video", prompt: "shot" }],
    agentMode: "plan",
  });
  const blocked = await executor.executeActions({
    actions: [{ type: "queue_generation_task", nodeId: "video", nodeType: "ai-video", prompt: "shot" }],
    agentMode: "plan",
    videoAuthorized: false,
  });
  assert.deepEqual(prep.createdNodeIds, ["ai-video-1"]);
  assert.deepEqual(blocked.skippedVideoGenerationNodeIds, ["video"]);
});

test("canvas skills integration: workflow apply and explicit asset save use existing adapters", async () => {
  const graphStore = graph();
  const { executor, savedAssets } = runtime(graphStore);
  await executor.executeActions({ actions: [{ type: "apply_workflow", workflowId: "wf-1" }], agentMode: "act" });
  const saved = await executor.executeActions({
    actions: [{ type: "save_asset", sourceNodeId: "wf-node", assetType: "role", name: "Role asset", explicitIntent: true }],
    agentMode: "act",
  });
  assert.equal(graphStore.nodes.some((node) => node.id === "wf-node"), true);
  assert.equal(saved.canvasSkillReceipts[0].assetId, "asset-1");
  assert.equal(savedAssets.length, 1);
});

