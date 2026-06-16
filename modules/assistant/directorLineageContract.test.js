import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getCanvasNodeSchema } from "./canvasSkills/schemas/index.js";

// Cross-language contract pin for the director lineage write policy:
// the lineage field names live in the JS node schemas (trustedSources
// gate) AND in the Python claw sanitizer's data-key whitelist
// (_safe_metadata / WORKFLOW_METADATA_FIELDS - NOT the action-level
// field tuple). Drift must break here, not strip silently in prod.
const PY_SCHEMA_PATH = fileURLToPath(new URL("../../services/claw_action_schema.py", import.meta.url));

const LINEAGE_FIELDS = ["qmaiPromptId", "qmaiShotId", "dramaticBeat", "shotContinuity", "continuityAnchors"];

test("contract: lineage fields are registered trusted-only in the JS schemas", () => {
  for (const nodeType of ["ai-image", "ai-video"]) {
    const schema = getCanvasNodeSchema(nodeType);
    for (const key of LINEAGE_FIELDS) {
      const field = schema.fields.find((item) => item.key === key);
      assert.ok(field, `${nodeType} schema missing lineage field ${key}`);
      assert.equal(field.agentWritable, false, `${nodeType}.${key} must not be agent-writable`);
      assert.deepEqual([...field.trustedSources], ["qmai-director"], `${nodeType}.${key} trustedSources drifted`);
    }
    const negative = schema.fields.find((item) => item.key === "negativePrompt");
    assert.ok(negative, `${nodeType} schema missing negativePrompt`);
    assert.equal(negative.agentWritable, false);
    assert.deepEqual([...negative.trustedSources], ["qmai-director"]);
  }
});

test("contract: lineage fields survive the Python data-key whitelist (_safe_metadata)", async () => {
  const pySource = await readFile(PY_SCHEMA_PATH, "utf-8");
  const tupleMatch = pySource.match(/WORKFLOW_METADATA_FIELDS\s*=\s*\{([\s\S]*?)\}/);
  assert.ok(tupleMatch, "Python WORKFLOW_METADATA_FIELDS set not found");
  const pyFields = new Set([...tupleMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));

  for (const key of [...LINEAGE_FIELDS, "negativePrompt", "autoStart"]) {
    assert.ok(pyFields.has(key), `Python _safe_metadata whitelist missing ${key} - director data would be stripped in transit`);
  }
});

test("contract: forged trust channels stay closed in Python", async () => {
  const pySource = await readFile(PY_SCHEMA_PATH, "utf-8");
  // metadata.source IS whitelisted in _safe_metadata (the inline set) -
  // that is exactly why the JS validator must never read it for trust.
  // Pin the fact so a future "simplification" that starts trusting
  // metadata.source gets a failing breadcrumb pointing here.
  assert.match(pySource, /"source",/, "claw inline whitelist no longer carries source - revisit the trust-channel analysis in directorLineageContract");
});
