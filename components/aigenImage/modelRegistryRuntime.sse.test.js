import assert from "node:assert/strict";
import test from "node:test";

import { parseRegistryImageSubmitResponse } from "./modelRegistryRuntime.js";

test("model registry image runtime parses SSE submit response text", () => {
  const response = parseRegistryImageSubmitResponse(
    'data: {"id":"task-123","status":"submitted"}\n\ndata: [DONE]\n'
  );

  assert.deepEqual(response, {
    id: "task-123",
    status: "submitted",
  });
});
