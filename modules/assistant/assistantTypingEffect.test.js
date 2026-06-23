import assert from "node:assert/strict";
import test from "node:test";

import { appendAssistantTypingMessage } from "./assistantTypingEffect.js";

test("assistantTypingEffect: appends reply chunks and notifies after each chunk", async () => {
  const messages = [];
  const updates = [];
  const scheduled = [];

  await appendAssistantTypingMessage({
    messages,
    text: "Hello",
    chunkSize: 2,
    delayMs: 5,
    scheduler(callback, delayMs) {
      scheduled.push(delayMs);
      callback();
      return 1;
    },
    onUpdate: () => updates.push(messages.at(-1).content),
  });

  assert.deepEqual(messages, [{ role: "assistant", content: "Hello" }]);
  assert.deepEqual(updates, ["He", "Hell", "Hello"]);
  assert.deepEqual(scheduled, [5, 5, 5]);
});

test("assistantTypingEffect: stops when cancelled", async () => {
  const messages = [];
  const signal = { aborted: false };
  const updates = [];

  await appendAssistantTypingMessage({
    messages,
    text: "Hello",
    chunkSize: 1,
    delayMs: 1,
    signal,
    scheduler(callback) {
      if (updates.length >= 2) {
        signal.aborted = true;
      }
      callback();
      return 1;
    },
    onUpdate: () => updates.push(messages.at(-1).content),
  });

  assert.equal(messages[0].content, "He");
  assert.deepEqual(updates, ["H", "He"]);
});
