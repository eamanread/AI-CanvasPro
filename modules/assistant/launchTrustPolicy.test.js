import test from "node:test";
import assert from "node:assert/strict";
import {
  PROVIDER_LINEAGE,
  RESERVED_LINEAGE_TAGS,
  lineageForProvider,
} from "./launchTrustPolicy.js";

// Phase D · D2 — provider-lineage trust policy (§F-D2, R5: lineage is unforgeable).
// The lineage tag a provider's actions carry to claw is decided HERE by a static
// allowlist keyed on the provider id, never by a runtime string a provider passes.

test("D2: known providers map to their static lineage tag", () => {
  assert.equal(lineageForProvider("vimax"), "vimax-director");
  assert.equal(lineageForProvider("qmai"), "qmai-director");
});

test("D2: lineage does not cross between providers", () => {
  assert.notEqual(lineageForProvider("vimax"), lineageForProvider("qmai"));
});

test("D2: an unregistered provider id yields null (won't land — R5)", () => {
  assert.equal(lineageForProvider("unknownProvider"), null);
  assert.equal(lineageForProvider("evil"), null);
});

test("D2: a reserved name used as a provider id yields null (can't forge admin/claw)", () => {
  assert.equal(lineageForProvider("admin"), null);
  assert.equal(lineageForProvider("system"), null);
  assert.equal(lineageForProvider("panel"), null);
  assert.equal(lineageForProvider("claw"), null);
});

test("D2: empty / nullish provider id yields null", () => {
  assert.equal(lineageForProvider(""), null);
  assert.equal(lineageForProvider(null), null);
  assert.equal(lineageForProvider(undefined), null);
});

test("D2: PROVIDER_LINEAGE is frozen (cannot be mutated to inject a lineage at runtime)", () => {
  assert.ok(Object.isFrozen(PROVIDER_LINEAGE));
});

test("D2: RESERVED_LINEAGE_TAGS guards the dangerous tags", () => {
  for (const t of ["admin", "system", "panel", "claw"]) {
    assert.ok(RESERVED_LINEAGE_TAGS.has(t), `RESERVED must include "${t}"`);
  }
});

test("D2 invariant: no allowlisted provider maps to a reserved tag (would silently fail to land)", () => {
  for (const [id, tag] of Object.entries(PROVIDER_LINEAGE)) {
    assert.ok(!RESERVED_LINEAGE_TAGS.has(tag), `provider "${id}" must not map to reserved tag "${tag}"`);
    // and the helper must actually return it (consistency)
    assert.equal(lineageForProvider(id), tag);
  }
});
