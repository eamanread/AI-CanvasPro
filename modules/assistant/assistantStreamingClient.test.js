import assert from "node:assert/strict";
import test from "node:test";

import { AssistantStreamEventType } from "./assistantProtocol.js";
import { consumeAssistantStream } from "./assistantStreamingClient.js";

test("assistantStreamingClient: consumes async iterable events into a final response", async () => {
  const seen = [];
  const response = await consumeAssistantStream(
    [
      { type: AssistantStreamEventType.MessageDelta, delta: "hello " },
      { type: AssistantStreamEventType.MessageDelta, delta: "canvas" },
      {
        type: AssistantStreamEventType.MessageDone,
        actions: [{ type: "focus_nodes", nodeIds: ["n1"] }],
        warnings: ["check layout"],
      },
    ],
    { onEvent: (event) => seen.push(event.type) }
  );

  assert.deepEqual(seen, [
    AssistantStreamEventType.MessageDelta,
    AssistantStreamEventType.MessageDelta,
    AssistantStreamEventType.MessageDone,
  ]);
  assert.equal(response.reply, "hello canvas");
  assert.deepEqual(response.actions, [{ type: "focus_nodes", nodeIds: ["n1"] }]);
  assert.deepEqual(response.warnings, ["check layout"]);
});

test("assistantStreamingClient: throws on stream error event", async () => {
  await assert.rejects(
    () =>
      consumeAssistantStream([
        { type: AssistantStreamEventType.MessageDelta, delta: "partial" },
        { type: AssistantStreamEventType.Error, message: "agent failed" },
      ]),
    /agent failed/
  );
});

test("assistantStreamingClient: ignores advisory proposed actions when final message has no actions", async () => {
  const response = await consumeAssistantStream([
    { type: AssistantStreamEventType.MessageDelta, delta: "ready" },
    {
      type: AssistantStreamEventType.ActionProposed,
      actions: [{ type: "layout_nodes", layout: "grid", nodeIds: ["a", "b"] }],
    },
    { type: AssistantStreamEventType.MessageDone },
  ]);

  assert.equal(response.reply, "ready");
  assert.deepEqual(response.actions, []);
});

test("assistantStreamingClient: preserves streamed warnings when final message has no warnings", async () => {
  const response = await consumeAssistantStream([
    { type: AssistantStreamEventType.Warning, message: "video requires confirmation" },
    { type: AssistantStreamEventType.MessageDelta, delta: "ready" },
    { type: AssistantStreamEventType.MessageDone },
  ]);

  assert.equal(response.reply, "ready");
  assert.deepEqual(response.warnings, ["video requires confirmation"]);
});
