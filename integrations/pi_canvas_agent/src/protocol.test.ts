import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBridgeRequest, safeResponse } from "./protocol.js";

test("normalizes a valid chat request", () => {
  const request = normalizeBridgeRequest({
    id: "req-1",
    type: "chat",
    conversationId: "project-default",
    message: "Check the canvas",
    context: { canvas: { nodes: [], edges: [] } }
  });

  assert.deepEqual(request, {
    id: "req-1",
    type: "chat",
    conversationId: "project-default",
    message: "Check the canvas",
    context: { canvas: { nodes: [], edges: [] } }
  });
});

test("rejects missing message", () => {
  assert.throws(
    () => normalizeBridgeRequest({ id: "req-2", type: "chat" }),
    /message is required/
  );
});

test("safeResponse fills safe response defaults", () => {
  const response = safeResponse("req-3", { reply: "Ready" });

  assert.deepEqual(response, {
    id: "req-3",
    type: "response",
    success: true,
    reply: "Ready",
    actions: [],
    warnings: [],
    requiresConfirmation: false
  });
});

test("safeResponse preserves explicit false success", () => {
  assert.equal(safeResponse("req-4", { success: false }).success, false);
});

test("safeResponse defaults non-boolean success to true", () => {
  assert.equal(safeResponse("req-5", { success: "no" as any }).success, true);
});

test("safeResponse defaults non-string reply to empty string", () => {
  assert.equal(safeResponse("req-6", { reply: 123 as any }).reply, "");
});

test("safeResponse drops blank and non-string warning entries", () => {
  assert.deepEqual(
    safeResponse("req-7", { warnings: ["keep", 123 as any, "", false as any, "  warn  "] }).warnings,
    ["keep", "warn"]
  );
});

test("safeResponse omits non-string errorCode and preserves string errorCode", () => {
  assert.equal("errorCode" in safeResponse("req-8", { errorCode: 404 as any }), false);
  assert.equal(safeResponse("req-9", { errorCode: "E_READY" }).errorCode, "E_READY");
});

test("safeResponse omits empty and whitespace-only errorCode", () => {
  assert.equal("errorCode" in safeResponse("req-10", { errorCode: "" }), false);
  assert.equal("errorCode" in safeResponse("req-11", { errorCode: "   " }), false);
});

test("safeResponse drops non-object actions", () => {
  assert.deepEqual(
    safeResponse("req-12", {
      actions: [{ type: "note" }, null as any, "skip" as any, ["skip"] as any]
    }).actions,
    [{ type: "note" }]
  );
});
