import assert from "node:assert/strict";
import test from "node:test";

import {
  V54_VIP_MODEL_ID,
  DREAMINA_VIDEO_VIP_MODEL_ID,
  canAccessGeneration,
  isModelAllowed,
  isVipModel,
  resolveVipGateModelId,
} from "./subscriptionAccess.js";

test("subscription access: unified generation access allows active CDKEY state", () => {
  const state = {
    status: "active",
    activationSource: "cdkey",
    generationScope: "all",
  };

  assert.equal(
    canAccessGeneration(state, { provider: "dreamina", nodeType: "video" }),
    true,
  );
  assert.equal(isModelAllowed("openai/gpt-5.4", state, "openai"), true);
});

test("subscription access: provider and node type restrictions are honored", () => {
  const state = {
    status: "active",
    activationSource: "cdkey",
    generationScope: "all",
    entitledNodeTypes: ["image"],
    entitledProviders: ["dreamina"],
  };

  assert.equal(
    canAccessGeneration(state, { provider: "dreamina", nodeType: "image" }),
    true,
  );
  assert.equal(
    canAccessGeneration(state, { provider: "runninghubwf", nodeType: "image" }),
    false,
  );
  assert.equal(
    canAccessGeneration(state, { provider: "dreamina", nodeType: "video" }),
    false,
  );
});

test("subscription access: unified wrapper blocks inactive generation state", () => {
  const state = {
    status: "none",
    activationSource: "",
    generationScope: "none",
  };

  assert.equal(isModelAllowed("openai/gpt-5.4", state, "openai"), false);
  assert.equal(isModelAllowed(V54_VIP_MODEL_ID, state, "runninghubwf"), false);
});

test("subscription access: legacy video vip helpers remain compatibility-only", () => {
  const legacyState = {
    status: "active",
    entitledModelIds: [DREAMINA_VIDEO_VIP_MODEL_ID],
    entitledModelKeys: [],
  };

  assert.equal(
    resolveVipGateModelId("dreamina/seedance2.0_vip", "dreamina"),
    DREAMINA_VIDEO_VIP_MODEL_ID,
  );
  assert.equal(isVipModel(V54_VIP_MODEL_ID), true);
  assert.equal(isModelAllowed("dreamina/seedance2.0_vip", legacyState, "dreamina"), true);
  assert.equal(isModelAllowed(V54_VIP_MODEL_ID, legacyState, "runninghubwf"), false);
});
