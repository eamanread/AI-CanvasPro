import test from "node:test";
import assert from "node:assert/strict";

import { createAssistantCanvasSkillExecutor } from "./assistantCanvasSkillExecutor.js";

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

function runtime(graphStore, { generateResult = { started: true } } = {}) {
  let nextId = 0;
  const generated = [];
  const nodeLifecycle = {
    async createDraftNode({ nodeType, patch, name }) {
      const node = { id: `${nodeType}-${++nextId}`, type: nodeType, name, data: { ...(patch || {}) } };
      graphStore.addNode(node);
      graphStore.setSelectedNodes([node.id]);
      return { ok: true, nodeId: node.id, node };
    },
    updateNode({ nodeId, patch }) {
      graphStore.updateNodeData(nodeId, patch);
      graphStore.setSelectedNodes([nodeId]);
      return { ok: true, nodeId };
    },
    async generateNode({ nodeId, prompt, task }) {
      generated.push({ nodeId, prompt, task });
      return generateResult;
    },
  };
  return { nodeLifecycle, generated };
}

test("canvas skill executor converts old image actions into draft plus generation", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "role-a", type: "source-image", name: "Role A", data: {} });
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      {
        id: "img",
        type: "create_node",
        nodeType: "ai-image",
        prompt: "make 3 avatars",
        batchSize: 3,
        references: [{ id: "role-a", type: "canvas_node", label: "Role A" }],
      },
      { type: "queue_generation_task", nodeId: "img", nodeType: "ai-image", prompt: "make 3 avatars" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(result.actionNodeIdMap.img, "ai-image-1");
  assert.equal(graphStore.nodes.find((node) => node.id === "ai-image-1").data.batchSize, 3);
  assert.equal(graphStore.edges[0].source, "role-a");
  assert.equal(generated.length, 1);
  assert.equal(generated[0].nodeId, "ai-image-1");
});

test("canvas skill executor auto-starts created AI image drafts when a prompt is present", async () => {
  const graphStore = graph();
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "flying pig" }],
    agentMode: "plan",
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].nodeId, "ai-image-1");
});

test("canvas skill executor resolves same-batch generation aliases without repeated nodeType", async () => {
  const graphStore = graph();
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "flying pig" },
      { type: "queue_generation_task", nodeId: "img", prompt: "flying pig" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.createdNodeIds, ["ai-image-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].nodeId, "ai-image-1");
});

test("canvas skill executor treats start_generation as a generation submit alias", async () => {
  const graphStore = graph();
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      { id: "img", type: "create_node", nodeType: "ai-image", prompt: "flying pig" },
      { type: "start_generation", nodeId: "img", prompt: "flying pig" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.startedGenerationNodeIds, ["ai-image-1"]);
  assert.equal(generated[0].nodeId, "ai-image-1");
});

test("canvas skill executor does not copy unknown create data into editable AI draft", async () => {
  const graphStore = graph();
  const { nodeLifecycle } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      {
        id: "img",
        type: "create_node",
        nodeType: "ai-image",
        data: {
          prompt: "make a clean product shot",
          imageSize: "1024x1024",
          inventedFlag: true,
          shell: "powershell.exe",
        },
      },
    ],
    agentMode: "plan",
  });

  const node = graphStore.nodes.find((item) => item.id === result.createdNodeIds[0]);
  assert.equal(node.data.prompt, "make a clean product shot");
  assert.equal(node.data.imageSize, "1024x1024");
  assert.equal("inventedFlag" in node.data, false);
  assert.equal("shell" in node.data, false);
});

test("canvas skill executor blocks secret fields before writing editable AI draft", async () => {
  const graphStore = graph();
  const { nodeLifecycle } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      {
        id: "img",
        type: "create_node",
        nodeType: "ai-image",
        data: {
          prompt: "make a clean product shot",
          apiKey: "sk-secret-1234567890",
          headers: { Authorization: "Bearer hidden" },
        },
      },
    ],
    agentMode: "plan",
  });

  const node = graphStore.nodes.find((item) => item.id === result.createdNodeIds[0]);
  assert.equal(node.data.prompt, "make a clean product shot");
  assert.equal("apiKey" in node.data, false);
  assert.equal("headers" in node.data, false);
  assert.doesNotMatch(JSON.stringify(result), /sk-secret|Bearer hidden/);
});

test("canvas skill executor blocks plan video generation until authorized", async () => {
  const graphStore = graph();
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const prepared = await executor.executeActions({
    actions: [{ id: "vid", type: "create_node", nodeType: "ai-video", prompt: "camera move" }],
    agentMode: "plan",
  });
  const blocked = await executor.executeActions({
    actions: [{ type: "queue_generation_task", nodeId: "vid", nodeType: "ai-video", prompt: "camera move" }],
    agentMode: "plan",
    videoAuthorized: false,
  });
  const allowed = await executor.executeActions({
    actions: [{ type: "queue_generation_task", nodeId: prepared.actionNodeIdMap.vid, nodeType: "ai-video", prompt: "camera move" }],
    agentMode: "act",
  });

  assert.deepEqual(prepared.createdNodeIds, ["ai-video-1"]);
  assert.deepEqual(blocked.skippedVideoGenerationNodeIds, ["vid"]);
  assert.match(blocked.warnings.join(" "), /video generation requires confirmation/i);
  assert.equal(generated.length, 1);
  assert.deepEqual(allowed.startedGenerationNodeIds, ["ai-video-1"]);
});



test("canvas skill executor preserves retryable draft when renderer is not ready", async () => {
  const graphStore = graph();
  const { nodeLifecycle } = runtime(graphStore, { generateResult: { started: false, retryable: true, warning: "renderer not ready" } });
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      { id: "text", type: "create_node", nodeType: "ai-text", prompt: "draft" },
      { type: "queue_generation_task", nodeId: "text", nodeType: "ai-text", prompt: "draft" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.createdNodeIds, ["ai-text-1"]);
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.match(result.warnings.join(" "), /renderer not ready/i);
  assert.equal(result.canvasSkillReceipts.some((receipt) => receipt.retryable), true);
});

test("canvas skill executor marks missing generation target as failed instead of queued", async () => {
  const graphStore = graph();
  const { nodeLifecycle, generated } = runtime(graphStore);
  const executor = createAssistantCanvasSkillExecutor({ graphStore, nodeLifecycle });

  const result = await executor.executeActions({
    actions: [
      { type: "queue_generation_task", nodeId: "missing-node", nodeType: "ai-image", prompt: "cat" },
    ],
    agentMode: "plan",
  });

  assert.deepEqual(result.queuedGenerationNodeIds, []);
  assert.deepEqual(result.startedGenerationNodeIds, []);
  assert.deepEqual(result.failedGenerationNodeIds, ["missing-node"]);
  assert.equal(result.success, false);
  assert.equal(generated.length, 0);
  assert.match(result.warnings.join(" "), /generation target node not found/i);
});
