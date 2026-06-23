import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasNodeLifecycle } from "./assistantCanvasNodeLifecycle.js";

function runtime({ mounted = true } = {}) {
  const nodes = [];
  const updates = [];
  const selected = [];
  const generated = [];
  const instanceMap = new Map();
  const graphStore = {
    nodes,
    updateNodeData(id, patch) { updates.push({ id, patch }); const node = nodes.find((item) => item.id === id); if (node) node.data = { ...(node.data || {}), ...patch }; },
    setSelectedNodes(ids) { selected.splice(0, selected.length, ...ids); },
  };
  const nodeFlows = {
    createNodeAtCursor(nodeType, width, height, name) {
      const node = { id: `${nodeType}-1`, type: nodeType, width, height, name, data: {} };
      nodes.push(node);
      instanceMap.set(node.id, { async _onGenerate(prompt, task) { generated.push({ prompt, task }); return { started: true }; } });
      return node;
    },
  };
  const rendererBridge = {
    isNodeMounted: () => mounted,
    getMountedWrapper: () => mounted ? {} : null,
    pinNode() {},
    unpinNode() {},
    nodeInstances: { get: (id) => instanceMap.get(id) },
  };
  return { graphStore, nodeFlows, rendererBridge, updates, selected, generated };
}

test("node lifecycle creates editable draft through node flow", async () => {
  const rt = runtime();
  const lifecycle = createAssistantCanvasNodeLifecycle({ ...rt, pollIntervalMs: 1, readinessTimeoutMs: 20 });
  const result = await lifecycle.createDraftNode({ nodeType: "ai-image", name: "?", patch: { prompt: "?" } });
  assert.equal(result.nodeId, "ai-image-1");
  assert.equal(rt.graphStore.nodes[0].data.prompt, "?");
  assert.deepEqual(rt.selected, ["ai-image-1"]);
});

test("node lifecycle waits for renderer and starts generation", async () => {
  const rt = runtime();
  const lifecycle = createAssistantCanvasNodeLifecycle({ ...rt, pollIntervalMs: 1, readinessTimeoutMs: 20 });
  await lifecycle.createDraftNode({ nodeType: "ai-text", patch: { prompt: "??" } });
  const result = await lifecycle.generateNode({ nodeId: "ai-text-1", prompt: "??", task: { id: "task-1" } });
  assert.equal(result.started, true);
  assert.equal(rt.generated[0].prompt, "??");
});

test("node lifecycle timeout keeps draft retryable", async () => {
  const rt = runtime({ mounted: false });
  const lifecycle = createAssistantCanvasNodeLifecycle({ ...rt, pollIntervalMs: 1, readinessTimeoutMs: 5 });
  await lifecycle.createDraftNode({ nodeType: "ai-video", patch: { prompt: "??" } });
  const result = await lifecycle.generateNode({ nodeId: "ai-video-1", prompt: "??" });
  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.match(result.warning, /not ready|timeout/i);
  assert.equal(rt.graphStore.nodes[0].data.prompt, "??");
});

test("node lifecycle uses window.v2Renderer when legacy bridge alias is absent", async () => {
  const previousWindow = globalThis.window;
  const rt = runtime();
  try {
    globalThis.window = { v2Renderer: rt.rendererBridge };
    const lifecycle = createAssistantCanvasNodeLifecycle({
      graphStore: rt.graphStore,
      nodeFlows: rt.nodeFlows,
      pollIntervalMs: 1,
      readinessTimeoutMs: 20,
    });

    await lifecycle.createDraftNode({ nodeType: "ai-image", patch: { prompt: "cat" } });
    const result = await lifecycle.generateNode({ nodeId: "ai-image-1", prompt: "cat" });

    assert.equal(result.started, true);
    assert.equal(rt.generated[0].prompt, "cat");
  } finally {
    globalThis.window = previousWindow;
  }
});
