import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersistentGenerationFailurePatch,
  buildPersistentGenerationStartPatch,
  buildPersistentGenerationSuccessPatch,
  normalizeGenerationErrorMessage,
  persistGenerationFailure,
} from "./persistentGenerationError.js";

test("persistent generation errors: normalizes empty messages", () => {
  assert.equal(normalizeGenerationErrorMessage(""), "生成失败");
  assert.equal(normalizeGenerationErrorMessage("  失败详情  "), "失败详情");
});

test("persistent generation errors: start and success clear stored errors", () => {
  const startPatch = buildPersistentGenerationStartPatch({ provider: "grsai" });
  assert.equal(startPatch.generationStatus, "running");
  assert.equal(startPatch.generationLocked, true);
  assert.equal(startPatch.generationRetryable, false);
  assert.equal(startPatch.jobError, null);
  assert.equal(startPatch.error, null);
  assert.equal(startPatch.rhStatusMessage, null);
  assert.equal(startPatch.provider, "grsai");

  const successPatch = buildPersistentGenerationSuccessPatch();
  assert.equal(successPatch.generationStatus, "completed");
  assert.equal(successPatch.generationLocked, false);
  assert.equal(successPatch.generationRetryable, false);
  assert.equal(successPatch.jobStatus, "success");
  assert.equal(successPatch.jobError, null);
  assert.equal(successPatch.error, null);
});

test("persistent generation errors: failure writes all node-visible error fields", () => {
  const patch = buildPersistentGenerationFailurePatch("API key missing", {
    asyncTaskStatus: "failed",
  });
  assert.equal(patch.generationStatus, "failed");
  assert.equal(patch.jobStatus, "error");
  assert.equal(patch.jobError, "API key missing");
  assert.equal(patch.error, "API key missing");
  assert.equal(patch.rhStatusMessage, "API key missing");
  assert.equal(patch.asyncTaskStatus, "failed");
});

test("persistent generation errors: can be stored on a node", () => {
  const state = { nodes: { n1: { id: "n1" } } };
  const store = {
    updateNodeData(nodeId, patch) {
      state.nodes[nodeId] = { ...state.nodes[nodeId], ...patch };
    },
  };

  persistGenerationFailure(store, "n1", "preflight failed");

  assert.equal(state.nodes.n1.generationStatus, "failed");
  assert.equal(state.nodes.n1.jobError, "preflight failed");
  assert.equal(state.nodes.n1.error, "preflight failed");
  assert.equal(state.nodes.n1.rhStatusMessage, "preflight failed");
});
