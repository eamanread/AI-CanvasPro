import assert from "node:assert/strict";
import test from "node:test";

import { handleLine, setPiModelClientForTests } from "./runner.js";

test("runner source JS entry delegates one offline JSONL chat request", async () => {
  setPiModelClientForTests({
    async complete(request) {
      return {
        id: request.id,
        type: "response",
        success: true,
        reply: "Injected model response",
        actions: [],
        warnings: [],
        requiresConfirmation: false
      };
    }
  });

  const line = JSON.stringify({
    id: "offline-1",
    type: "chat",
    mode: "replyOnly",
    message: "Check canvas",
    context: { canvas: { nodeCount: 0 } }
  });

  const responseLine = await handleLine(line);
  const response = JSON.parse(responseLine ?? "");

  assert.deepEqual(response, {
    id: "offline-1",
    type: "response",
    success: true,
    reply: "Injected model response",
    actions: [],
    warnings: [],
    requiresConfirmation: false
  });
});

test("runner returns explicit provider configuration error without injected model", async () => {
  setPiModelClientForTests(undefined as any);

  const responseLine = await handleLine(JSON.stringify({
    id: "offline-2",
    type: "chat",
    mode: "replyOnly",
    message: "Check canvas"
  }));
  const response = JSON.parse(responseLine ?? "");

  assert.equal(response.success, false);
  assert.equal(response.errorCode, "pi_agent_failed");
  assert.match(response.warnings.join(" "), /provider is not configured/i);
});
