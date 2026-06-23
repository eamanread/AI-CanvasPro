import test from "node:test";
import assert from "node:assert/strict";

import {
  AssistantCanvasGenerationStatus,
  mapCanvasGenerationState,
  statusPatchForNode,
} from "./generationStateMapper.js";

test("generationStateMapper: maps manual running fields to generating card state", () => {
  const mapped = mapCanvasGenerationState({
    generationStatus: "running",
    jobStatus: "running",
    asyncTaskStatus: "running",
    isGenerating: true,
  });

  assert.equal(mapped.technicalStatus, AssistantCanvasGenerationStatus.Running);
  assert.equal(mapped.cardStatus, "generating");
  assert.equal(mapped.locked, true);
});

test("generationStateMapper: terminal states unlock and retryable stays editable", () => {
  assert.equal(mapCanvasGenerationState({ generationStatus: "completed" }).locked, false);
  assert.equal(mapCanvasGenerationState({ generationStatus: "failed" }).locked, false);
  assert.equal(mapCanvasGenerationState({ generationStatus: "retryable" }).retryable, true);
});

test("generationStateMapper: explicit terminal status wins over stale generating flag", () => {
  const completed = mapCanvasGenerationState({
    generationStatus: "completed",
    isGenerating: true,
  });
  assert.equal(completed.technicalStatus, AssistantCanvasGenerationStatus.Completed);
  assert.equal(completed.cardStatus, "completed");
  assert.equal(completed.locked, false);

  const failed = mapCanvasGenerationState({
    jobStatus: "failed",
    isGenerating: true,
  });
  assert.equal(failed.technicalStatus, AssistantCanvasGenerationStatus.Failed);
  assert.equal(failed.cardStatus, "failed");
  assert.equal(failed.locked, false);
});

test("generationStateMapper: terminal provider fields win over stale generationStatus", () => {
  const completed = mapCanvasGenerationState({
    generationStatus: "running",
    jobStatus: "success",
    isGenerating: true,
  });
  assert.equal(completed.technicalStatus, AssistantCanvasGenerationStatus.Completed);
  assert.equal(completed.cardStatus, "completed");
  assert.equal(completed.locked, false);

  const failed = mapCanvasGenerationState({
    generationStatus: "running",
    asyncTaskStatus: "failed",
    isGenerating: true,
  });
  assert.equal(failed.technicalStatus, AssistantCanvasGenerationStatus.Failed);
  assert.equal(failed.cardStatus, "failed");
  assert.equal(failed.locked, false);
});

test("generationStateMapper: status patch includes manual-compatible canvas fields", () => {
  assert.deepEqual(statusPatchForNode("running", { warning: "submitted" }), {
    generationStatus: "running",
    jobStatus: "running",
    asyncTaskStatus: "running",
    isGenerating: true,
    generationLocked: true,
    generationRetryable: false,
    generationWarning: "submitted",
    generationError: "",
  });
  assert.equal(statusPatchForNode("completed").isGenerating, false);
  assert.equal(statusPatchForNode("completed").generationLocked, false);
  assert.equal(statusPatchForNode("retryable").generationRetryable, true);
});
