import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImageQueryCandidates,
  extractErrorMessage,
  extractTaskId,
  extractTaskStatus,
} from "./modelValidationService.js";

test("modelValidationService extracts Midjourney proxy task metadata", () => {
  assert.equal(extractTaskId({ code: 1, result: "mj-task-1" }), "mj-task-1");
  assert.equal(
    extractTaskStatus({ result: { status: "IN_PROGRESS" } }),
    "in_progress"
  );
  assert.deepEqual(
    buildImageQueryCandidates("https://yunwu.ai/mj/submit/imagine", "mj-task-1"),
    ["https://yunwu.ai/mj/task/mj-task-1/fetch"]
  );
});

test("modelValidationService unwraps object-shaped error messages", () => {
  assert.equal(
    extractErrorMessage({ error: { message: "invalid endpoint" } }),
    "invalid endpoint"
  );
});
