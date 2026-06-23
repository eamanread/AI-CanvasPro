import test from "node:test";
import assert from "node:assert/strict";

import { createGenerationTaskBridge } from "./generationTaskBridge.js";

function createRuntime({ mounted = false, failGenerate = false, result = { started: true, taskId: "task-1" } } = {}) {
  const nodes = [{ id: "node-1", type: "ai-image", data: { prompt: "cat" } }];
  const generated = [];
  const instance = {
    async onGenerate(prompt, task) {
      generated.push({ prompt, task, statusAtCall: nodes[0].data.generationStatus });
      if (failGenerate) throw new Error("provider rejected");
      return result;
    },
  };
  const rendererBridge = {
    isNodeMounted: () => mounted,
    getMountedWrapper: () => (mounted ? {} : null),
    pinCalls: [],
    unpinCalls: [],
    ensureCalls: [],
    pinNode(nodeId, reason) {
      this.pinCalls.push({ nodeId, reason });
    },
    unpinNode(nodeId, reason) {
      this.unpinCalls.push({ nodeId, reason });
    },
    ensureNodeMounted(nodeId, options) {
      this.ensureCalls.push({ nodeId, options });
    },
    nodeInstances: { get: () => (mounted ? instance : null) },
  };
  const graphStore = {
    getState: () => ({ nodes }),
    updateNodeData(id, patch) {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...(node.data || {}), ...patch };
    },
  };
  return { nodes, generated, rendererBridge, graphStore, setMounted(value) { mounted = value; } };
}

test("generationTaskBridge: queues pending renderer and auto-submits after mount", async () => {
  const rt = createRuntime({ mounted: false });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 80,
  });

  const pending = bridge.submit({ nodeId: "node-1", prompt: "cat", task: { id: "a" } });
  assert.equal(rt.nodes[0].data.generationStatus, "pendingRenderer");
  assert.equal(rt.nodes[0].data.isGenerating, true);
  rt.setMounted(true);
  const result = await pending;

  assert.equal(result.started, true);
  assert.deepEqual(rt.generated.map((item) => item.prompt), ["cat"]);
  assert.equal(rt.generated[0].statusAtCall, "running");
  assert.equal(rt.nodes[0].data.generationStatus, "running");
  assert.equal(rt.nodes[0].data.isGenerating, true);
});

test("generationTaskBridge: pins and asks renderer to mount before waiting for readiness", async () => {
  const rt = createRuntime({ mounted: false });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 80,
  });

  const pending = bridge.submit({ nodeId: "node-1", prompt: "cat" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(rt.rendererBridge.pinCalls[0], { nodeId: "node-1", reason: "assistant-generation" });
  assert.equal(rt.rendererBridge.ensureCalls[0].nodeId, "node-1");

  rt.setMounted(true);
  await pending;

  assert.deepEqual(rt.rendererBridge.unpinCalls.at(-1), { nodeId: "node-1", reason: "assistant-generation" });
});

test("generationTaskBridge: resolves renderer lazily when bridge appears after runtime creation", async () => {
  const rt = createRuntime({ mounted: true });
  const lateWindow = {};
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: null,
    windowRef: lateWindow,
    pollIntervalMs: 1,
    readinessTimeoutMs: 80,
  });

  const pending = bridge.submit({ nodeId: "node-1", prompt: "late cat" });
  assert.equal(rt.nodes[0].data.generationStatus, "pendingRenderer");
  await new Promise((resolve) => setTimeout(resolve, 0));
  lateWindow.__v2RendererBridge = rt.rendererBridge;

  const result = await pending;

  assert.equal(result.started, true);
  assert.deepEqual(rt.generated.map((item) => item.prompt), ["late cat"]);
  assert.deepEqual(rt.rendererBridge.pinCalls[0], { nodeId: "node-1", reason: "assistant-generation" });
  assert.deepEqual(rt.rendererBridge.unpinCalls.at(-1), { nodeId: "node-1", reason: "assistant-generation" });
});

test("generationTaskBridge: uses rendererBridgeResolver on every readiness poll", async () => {
  const rt = createRuntime({ mounted: true });
  let currentBridge = null;
  let resolverCalls = 0;
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridgeResolver() {
      resolverCalls += 1;
      return currentBridge;
    },
    pollIntervalMs: 1,
    readinessTimeoutMs: 80,
  });

  const pending = bridge.submit({ nodeId: "node-1", prompt: "resolver cat" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  currentBridge = rt.rendererBridge;
  const result = await pending;

  assert.equal(result.started, true);
  assert.equal(resolverCalls > 1, true);
  assert.deepEqual(rt.generated.map((item) => item.prompt), ["resolver cat"]);
});

test("generationTaskBridge: timeout becomes retryable and keeps node editable", async () => {
  const rt = createRuntime({ mounted: false });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 5,
  });

  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });

  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.equal(rt.nodes[0].data.generationStatus, "retryable");
  assert.equal(rt.nodes[0].data.isGenerating, false);
  assert.equal(rt.nodes[0].data.generationLocked, false);
});

test("generationTaskBridge: hidden document pauses the readiness countdown", async () => {
  const rt = createRuntime({ mounted: false });
  const windowRef = { document: { visibilityState: "hidden" } };
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    windowRef,
    pollIntervalMs: 1,
    hiddenPollIntervalMs: 1,
    readinessTimeoutMs: 10,
    hiddenWaitCapMs: 5000,
  });

  const pending = bridge.submit({ nodeId: "node-1", prompt: "cat" });
  // 远超 readinessTimeoutMs 的隐藏等待不应导致失败
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(rt.nodes[0].data.generationStatus, "pendingRenderer");
  rt.setMounted(true);
  windowRef.document.visibilityState = "visible";
  const result = await pending;

  assert.equal(result.started, true);
  assert.deepEqual(rt.generated.map((item) => item.prompt), ["cat"]);
});

test("generationTaskBridge: hidden wait cap still fails closed as retryable", async () => {
  const rt = createRuntime({ mounted: false });
  const windowRef = { document: { visibilityState: "hidden" } };
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    windowRef,
    pollIntervalMs: 1,
    hiddenPollIntervalMs: 1,
    readinessTimeoutMs: 10,
    hiddenWaitCapMs: 30,
  });

  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });

  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.match(result.warning, /renderer not ready/);
  assert.equal(rt.nodes[0].data.generationStatus, "retryable");
});

test("generationTaskBridge: submit failure marks node retryable", async () => {
  const rt = createRuntime({ mounted: true, failGenerate: true });
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });

  assert.equal(result.started, false);
  assert.equal(result.retryable, true);
  assert.match(result.warning, /provider rejected/);
  assert.equal(rt.nodes[0].data.generationStatus, "retryable");
  assert.equal(rt.nodes[0].data.isGenerating, false);
});

test("generationTaskBridge: preserves renderer terminal state after submit resolves", async () => {
  const rt = createRuntime({ mounted: true });
  rt.rendererBridge.nodeInstances = {
    get: () => ({
      async onGenerate() {
        rt.graphStore.updateNodeData("node-1", {
          generationStatus: "completed",
          jobStatus: "success",
          isGenerating: false,
          generationDuration: 1234,
        });
        return { started: true };
      },
    }),
  };
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });

  assert.equal(result.started, true);
  assert.equal(rt.nodes[0].data.generationStatus, "completed");
  assert.equal(rt.nodes[0].data.jobStatus, "success");
  assert.equal(rt.nodes[0].data.isGenerating, false);
  assert.equal(rt.nodes[0].data.generationDuration, 1234);
});

test("generationTaskBridge: normalizes provider failure fields after submit resolves", async () => {
  const rt = createRuntime({ mounted: true });
  rt.rendererBridge.nodeInstances = {
    get: () => ({
      async onGenerate() {
        rt.graphStore.updateNodeData("node-1", {
          generationStatus: "running",
          jobStatus: "error",
          asyncTaskStatus: "failed",
          isGenerating: false,
          error: "activation required",
        });
        return { started: true };
      },
    }),
  };
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  const result = await bridge.submit({ nodeId: "node-1", prompt: "cat" });

  assert.equal(result.started, true);
  assert.equal(rt.nodes[0].data.generationStatus, "failed");
  assert.equal(rt.nodes[0].data.jobStatus, "error");
  assert.equal(rt.nodes[0].data.asyncTaskStatus, "failed");
  assert.equal(rt.nodes[0].data.isGenerating, false);
});

test("generationTaskBridge: prefers submitGenerationFromAgent over private generate methods", async () => {
  const rt = createRuntime({ mounted: true });
  const calls = [];
  rt.rendererBridge.nodeInstances = {
    get: () => ({
      async submitGenerationFromAgent(prompt, task) {
        calls.push({ method: "submitGenerationFromAgent", prompt, task });
        return { started: true };
      },
      async _onGenerate() {
        calls.push({ method: "_onGenerate" });
        return { started: true };
      },
    }),
  };
  const bridge = createGenerationTaskBridge({
    graphStore: rt.graphStore,
    rendererBridge: rt.rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  await bridge.submit({ nodeId: "node-1", prompt: "cat", task: { actionId: "a-1" } });

  assert.deepEqual(calls.map((call) => call.method), ["submitGenerationFromAgent"]);
  assert.equal(calls[0].task.nodeId, "node-1");
  assert.equal(calls[0].task.source, "assistant");
});

test("generationTaskBridge: patches flat graph nodes without inventing node.data", async () => {
  const nodes = [{ id: "flat-1", type: "ai-image", prompt: "cat" }];
  const instance = {
    async onGenerate() {
      return { started: true };
    },
  };
  const graphStore = {
    getState: () => ({ nodes }),
    updateNodeData(id, patch) {
      const node = nodes.find((item) => item.id === id);
      if (node) Object.assign(node, patch);
    },
  };
  const rendererBridge = {
    isNodeMounted: () => true,
    getMountedWrapper: () => ({}),
    pinNode() {},
    unpinNode() {},
    nodeInstances: { get: () => instance },
  };
  const bridge = createGenerationTaskBridge({
    graphStore,
    rendererBridge,
    pollIntervalMs: 1,
    readinessTimeoutMs: 20,
  });

  await bridge.submit({ nodeId: "flat-1", prompt: "cat" });

  assert.equal(nodes[0].generationStatus, "running");
  assert.equal(Object.hasOwn(nodes[0], "data"), false);
});
