import test from "node:test";
import assert from "node:assert/strict";

import { createSkillTraceRecorder } from "./skillTraceRecorder.js";

function memoryTraceStore() {
  let records = [];
  return {
    list: () => records,
    save(next) { records = [...records.filter((item) => item.id !== next.id), next]; },
    clear() { records = []; },
  };
}

test("skillTraceRecorder: records start end status duration and warnings", () => {
  let now = 1000;
  const recorder = createSkillTraceRecorder({ now: () => now, store: memoryTraceStore() });
  const trace = recorder.start({ id: "trace-1", skillId: "imageNode.createDraft", title: "创建图片节点" });
  now = 1450;
  const ended = recorder.end(trace.id, { status: "success", nodeId: "img-1", warnings: ["renderer retryable"] });

  assert.equal(ended.id, "trace-1");
  assert.equal(ended.status, "success");
  assert.equal(ended.durationMs, 450);
  assert.deepEqual(ended.warnings, ["renderer retryable"]);
  assert.equal(recorder.listLocalTraceHistory()[0].nodeId, "img-1");
});

test("skillTraceRecorder: clearLocalTraceHistory clears external debug log", () => {
  const recorder = createSkillTraceRecorder({ store: memoryTraceStore() });
  recorder.record({ id: "trace-1", skillId: "imageNode.createDraft" });
  recorder.clearLocalTraceHistory();
  assert.deepEqual(recorder.listLocalTraceHistory(), []);
});
