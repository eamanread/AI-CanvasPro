import test from "node:test";
import assert from "node:assert/strict";

import { createAIGenerateNodeTaskOrchestrationModule } from "./taskOrchestrationModule.js";

function createModule() {
  return createAIGenerateNodeTaskOrchestrationModule({
    store: { getState: () => ({ nodes: {} }), updateNodeData() {}, getIncomingEdges: () => [] },
    api: {},
    getRefKindByNodeType: () => null,
    getImage: async () => null,
    ensureConfig: async () => {},
    getProviderConfig: () => ({}),
    startLoading: () => {},
    stopLoading: () => {},
  });
}

test("aigenImage task orchestration: agent submit starts generation without awaiting completion", () => {
  const proto = createModule();
  const calls = [];
  const ctx = {
    nodeId: "image-1",
    _data: { id: "image-1", type: "ai-image" },
    _isGenerating: false,
    _onGenerate(prompt) {
      calls.push(prompt);
      return new Promise(() => {});
    },
  };

  const result = proto.submitGenerationFromAgent.call(ctx, "flying pig", { nodeType: "ai-image" });

  assert.deepEqual(calls, ["flying pig"]);
  assert.equal(result.started, true);
  assert.equal(result.nodeId, "image-1");
  assert.equal(result.source, "assistant");
});

test("aigenImage task orchestration: agent submit does not cancel an already running node", () => {
  const proto = createModule();
  const calls = [];
  const ctx = {
    nodeId: "image-1",
    _data: { id: "image-1", type: "ai-image" },
    _isGenerating: true,
    _onGenerate(prompt) {
      calls.push(prompt);
    },
  };

  const result = proto.submitGenerationFromAgent.call(ctx, "flying pig", { nodeType: "ai-image" });

  assert.deepEqual(calls, []);
  assert.equal(result.started, true);
  assert.equal(result.alreadyRunning, true);
});
