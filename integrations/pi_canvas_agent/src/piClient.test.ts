import assert from "node:assert/strict";
import test from "node:test";

import { canvasAgentModeFromRequest } from "./piClient.js";

test("canvasAgentModeFromRequest maps auto layout and doctor intents to locked prompts", () => {
  assert.equal(
    canvasAgentModeFromRequest({ mode: "actions", assistantIntent: { id: "auto_layout" } }),
    "auto_layout"
  );
  assert.equal(
    canvasAgentModeFromRequest({ mode: "actions", context: { assistantIntent: { id: "canvas_doctor" } } }),
    "doctor"
  );
  assert.equal(canvasAgentModeFromRequest({ mode: "actions" }), "actions");
});
