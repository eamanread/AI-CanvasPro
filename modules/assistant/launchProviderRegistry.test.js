import test from "node:test";
import assert from "node:assert/strict";
import {
  createLaunchProviderRegistry,
  validateLaunchProvider,
} from "./launchProviderRegistry.js";

// Phase D · D3 — generic launch-provider registry (provider-agnostic; AC8).
// Registration is fail-fast: a provider that violates the contract throws at
// register time, never silently half-registers.

function mkProvider(over = {}) {
  return {
    id: "vimax",
    match: () => true,
    synthesizeCommand: () => "导演:x",
    deriveContract: () => ({ mode: "director" }),
    chips: [{ id: "director", label: "导演", costTier: "free" }],
    ...over,
  };
}

test("D3: a valid provider registers and is returned by listMatching when it matches", () => {
  const reg = createLaunchProviderRegistry();
  reg.register(mkProvider());
  assert.deepEqual(reg.ids(), ["vimax"]);
  assert.equal(reg.listMatching("雨夜便利店").length, 1);
});

test("D3: a non-matching provider is omitted from listMatching", () => {
  const reg = createLaunchProviderRegistry();
  reg.register(mkProvider({ match: () => false }));
  assert.equal(reg.listMatching("anything").length, 0);
});

test("D3: duplicate id is rejected (fail-fast)", () => {
  const reg = createLaunchProviderRegistry();
  reg.register(mkProvider());
  assert.throws(() => reg.register(mkProvider()), /duplicate/i);
});

test("D3: an id not in the lineage allowlist is rejected (ties to R5)", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(() => reg.register(mkProvider({ id: "ghost" })), /allowlist|lineage/i);
});

test("D3: a reserved name used as id is rejected", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(() => reg.register(mkProvider({ id: "admin" })), /allowlist|lineage|reserved/i);
});

test("D3: missing required functions are rejected", () => {
  const reg = createLaunchProviderRegistry();
  for (const fn of ["match", "synthesizeCommand", "deriveContract"]) {
    assert.throws(() => reg.register(mkProvider({ [fn]: undefined })), new RegExp(fn));
  }
});

test("D3: empty chips are rejected", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(() => reg.register(mkProvider({ chips: [] })), /chip/i);
});

test("D3: a chip with an invalid costTier is rejected", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(
    () => reg.register(mkProvider({ chips: [{ id: "x", label: "x", costTier: "expensive" }] })),
    /costTier/i
  );
});

test("D3: AC8b — multiple matching providers are returned in registration order", () => {
  const reg = createLaunchProviderRegistry();
  reg.register(mkProvider({ id: "vimax" }));
  reg.register(mkProvider({ id: "qmai", synthesizeCommand: () => "qmai:x" }));
  assert.deepEqual(reg.listMatching("雨夜便利店").map((p) => p.id), ["vimax", "qmai"]);
});

test("D3: validateLaunchProvider is reusable and returns the id on success", () => {
  assert.equal(validateLaunchProvider(mkProvider(), new Map()), "vimax");
});

test("D3: a provider whose match() throws is treated as non-matching (never breaks listMatching)", () => {
  const reg = createLaunchProviderRegistry();
  reg.register(mkProvider({ match: () => { throw new Error("boom"); } }));
  assert.doesNotThrow(() => reg.listMatching("x"));
  assert.equal(reg.listMatching("x").length, 0);
});

test("D3: an empty or non-string id is rejected", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(() => reg.register(mkProvider({ id: "" })), /id is required/i);
  assert.throws(() => reg.register(mkProvider({ id: 123 })), /id is required/i);
});

test("D3: a chip missing its id is rejected", () => {
  const reg = createLaunchProviderRegistry();
  assert.throws(
    () => reg.register(mkProvider({ chips: [{ label: "x", costTier: "free" }] })),
    /missing an id/i
  );
});
