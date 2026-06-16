import test from "node:test";
import assert from "node:assert/strict";

import {
  RUNNINGHUB_IMAGE_WORKFLOW_TOOLS,
  buildRunningHubWorkflowMetadata,
  getRunningHubImageWorkflowTool,
  normalizeRunningHubDurationFields,
} from "./runningHubWorkflowToolCatalog.js";

test("RunningHUB workflow catalog separates fixed workflows from registry models", () => {
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS.hd.provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS["panorama-360"].provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS["auto-subject"].provider, "runninghub");
  assert.equal(RUNNINGHUB_IMAGE_WORKFLOW_TOOLS.hd.kind, "workflow");
});

test("getRunningHubImageWorkflowTool rejects standard or local actions", () => {
  assert.equal(getRunningHubImageWorkflowTool("expand"), null);
  assert.equal(getRunningHubImageWorkflowTool("crop"), null);
});

test("normalizeRunningHubDurationFields keeps durationSec canonical and derives adapter fields", () => {
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: 5, fps: 24 }), {
    durationSec: 5,
    timeSec: 5,
    rhVideoSeconds: 5,
    frameCount: 120,
    rhVideoFrames: 120,
    rhVideoFps: 24,
  });
});

test("normalizeRunningHubDurationFields omits invalid duration", () => {
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: 0, fps: 24 }), {});
  assert.deepEqual(normalizeRunningHubDurationFields({ durationSec: "abc", fps: 24 }), {});
});

test("buildRunningHubWorkflowMetadata preserves workflow fields outside registry identity", () => {
  const metadata = buildRunningHubWorkflowMetadata({
    action: "panorama-360",
    taskId: "rh-task-1",
    status: "running",
    startedAt: 1000,
    durationSec: 8,
  });

  assert.equal(metadata.provider, "runninghub");
  assert.equal(metadata.model, "RH 360 panorama workflow");
  assert.equal(metadata.rhTaskId, "rh-task-1");
  assert.equal(metadata.rhTaskStatus, "running");
  assert.equal(metadata.rhTaskStartedAt, 1000);
  assert.equal(metadata.durationSec, 8);
  assert.equal(metadata.selectedModelId, undefined);
});
