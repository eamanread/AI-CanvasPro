import test from "node:test";
import assert from "node:assert/strict";

import { createCanvasSkillExecutor } from "./executor.js";

test("canvasSkills executor: exposes schema-backed assistant executor from the new module", async () => {
  const nodes = [];
  const graphStore = {
    nodes,
    addNode(node) {
      nodes.push(node);
      return node;
    },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => item.id === nodeId);
      if (node) node.data = { ...(node.data || {}), ...patch };
    },
    setSelectedNodes(nodeIds) {
      this.selectedNodeIds = nodeIds;
    },
    getState() {
      return { nodes, edges: [] };
    },
  };
  const nodeLifecycle = {
    async createDraftNode({ nodeType, patch }) {
      const node = { id: `${nodeType}-1`, type: nodeType, data: { ...patch } };
      graphStore.addNode(node);
      return { ok: true, nodeId: node.id, node };
    },
  };

  const executor = createCanvasSkillExecutor({
    graphStore,
    nodeLifecycle,
    modelRegistry: {
      getModelsByNodeType: () => [{ id: "img-1", configured: true }],
      listModels: () => [{ id: "img-1", configured: true }],
    },
  });
  const result = await executor.executeActions({
    actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat", modelId: "img-1", seed: 7 }],
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.equal(nodes[0].data.modelId, "img-1");
  assert.equal(nodes[0].data.seed, undefined);
  assert.match(result.warnings.join("\n"), /seed.*planned/);
});
