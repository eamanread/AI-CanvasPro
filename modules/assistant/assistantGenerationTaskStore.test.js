import test from "node:test";
import assert from "node:assert/strict";

import { createAssistantGenerationTaskStore, AssistantGenerationTaskStatus } from "./assistantGenerationTaskStore.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.get(key) || null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

test("assistantGenerationTaskStore: supports pending renderer to running to completed", () => {
  const store = createAssistantGenerationTaskStore({
    storage: memoryStorage(),
    clock: () => "2026-06-06T00:00:00.000Z",
  });
  const task = store.queue({ id: "gen-1", nodeId: "image-1", status: AssistantGenerationTaskStatus.PendingRenderer });

  assert.equal(task.status, AssistantGenerationTaskStatus.PendingRenderer);
  assert.equal(store.submit("gen-1").status, AssistantGenerationTaskStatus.Submitting);
  assert.equal(store.start("gen-1").status, AssistantGenerationTaskStatus.Running);
  assert.equal(store.complete("gen-1").status, AssistantGenerationTaskStatus.Completed);
});

test("assistantGenerationTaskStore: retryable task can be retried as pending renderer", () => {
  const store = createAssistantGenerationTaskStore({ storage: memoryStorage(), idFactory: () => "gen-retry" });
  const task = store.queue({ id: "gen-1", nodeId: "image-1", status: AssistantGenerationTaskStatus.PendingRenderer });

  store.markRetryable(task.id, "renderer timeout");
  const retry = store.retry(task.id);

  assert.equal(retry.id, "gen-retry");
  assert.equal(retry.status, AssistantGenerationTaskStatus.PendingRenderer);
  assert.equal(retry.error, "");
});
