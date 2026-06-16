import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PLACEMENT_STRATEGIES } from "./assistantActionExecutor.js";

// Cross-language contract pin: the placement strategy table and the
// tidy scope grammar live in BOTH the JS executor and the Python
// action schema. This test reads the Python source and fails loudly
// when either side drifts - the field-vanishes-silently class of bug
// must break here instead of in production.
const PY_SCHEMA_PATH = fileURLToPath(new URL("../../services/claw_action_schema.py", import.meta.url));

test("contract: placement strategies match between JS executor and Python schema", async () => {
  const pySource = await readFile(PY_SCHEMA_PATH, "utf-8");
  const tupleMatch = pySource.match(/_PLACEMENT_STRATEGIES\s*=\s*\(([\s\S]*?)\)/);
  assert.ok(tupleMatch, "Python _PLACEMENT_STRATEGIES tuple not found");

  const pyStrategies = [...tupleMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort();
  const jsStrategies = [...PLACEMENT_STRATEGIES].sort();

  assert.deepEqual(jsStrategies, pyStrategies);
});

test("contract: tidy scope grammar accepted by Python matches the JS scope parser shapes", async () => {
  const pySource = await readFile(PY_SCHEMA_PATH, "utf-8");
  const patternMatch = pySource.match(/_TIDY_SCOPE_PATTERN\s*=\s*re\.compile\(r"([^"]+)"\)/);
  assert.ok(patternMatch, "Python _TIDY_SCOPE_PATTERN not found");
  const pyPattern = new RegExp(patternMatch[1]);

  // Every scope shape the JS scopeFilter understands must pass the
  // Python gate, and garbage must not.
  for (const scope of ["all", "zone:dock-left", "zone:production", "lane:r2", "cluster:qmai-shot-shot-001"]) {
    assert.ok(pyPattern.test(scope), `Python rejects JS-supported scope: ${scope}`);
  }
  for (const junk of ["everything", "zone:DROP TABLE", "lane:x", "cluster:a/../b"]) {
    assert.equal(pyPattern.test(junk), false, `Python accepts junk scope: ${junk}`);
  }
});
