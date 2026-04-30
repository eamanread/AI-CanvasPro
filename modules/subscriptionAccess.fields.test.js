import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultSubscriptionState,
  normalizeSubscriptionPayload,
} from "./subscriptionAccess.js";

test("subscription access: default state exposes generation metadata fields", () => {
  const state = createDefaultSubscriptionState();
  assert.equal(state.activationSource, "");
  assert.equal(state.generationScope, "");
  assert.deepEqual(state.entitledNodeTypes, []);
  assert.deepEqual(state.entitledProviders, []);
});

test("subscription access: normalize payload reads new generation metadata aliases", () => {
  const state = normalizeSubscriptionPayload({
    data: {
      status: "active",
      activation_source: "cdkey",
      generation_scope: "all",
      entitled_node_types: ["text", "image"],
      entitled_providers: ["dreamina", "runninghubwf"],
      contact_text: "联系管理员",
      contact_url: "https://example.com/contact",
    },
  });

  assert.equal(state.status, "active");
  assert.equal(state.activationSource, "cdkey");
  assert.equal(state.generationScope, "all");
  assert.deepEqual(state.entitledNodeTypes, ["text", "image"]);
  assert.deepEqual(state.entitledProviders, ["dreamina", "runninghubwf"]);
  assert.equal(state.contactText, "联系管理员");
  assert.equal(state.contactUrl, "https://example.com/contact");
});
