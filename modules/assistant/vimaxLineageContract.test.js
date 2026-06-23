import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getCanvasNodeSchema } from "./canvasSkills/schemas/index.js";

// Cross-language contract pin for the ViMax lineage write policy
// (α′ F8). The vimax lineage field names live in the JS node schemas
// (trustedSources gate, "vimax-director") AND in the Python claw
// sanitizer's data-key whitelist (_safe_metadata /
// WORKFLOW_METADATA_FIELDS). New channel, separate from the dormant
// qmai-director channel - the two must not be conflated.
const PY_SCHEMA_PATH = fileURLToPath(new URL("../../services/claw_action_schema.py", import.meta.url));

const VIMAX_LINEAGE_FIELDS = [
  "vimaxFlowId", "vimaxShotIdx", "vimaxCamIdx", "vimaxRole", "skillRefs", "assetRole",
  // P3 定妆: charIdx groups a character's three-view set, view names it.
  "vimaxCharIdx", "vimaxView",
];
const ARRAY_FIELDS = new Set(["skillRefs"]);
// shotIdx/camIdx/charIdx are numeric - pinned so the F5 mapper / writeback /
// three-view group selection can match without string/number === traps.
const INTEGER_FIELDS = new Set(["vimaxShotIdx", "vimaxCamIdx", "vimaxCharIdx"]);

test("contract: vimax lineage fields are registered trusted-only in the JS schemas", () => {
  for (const nodeType of ["ai-image", "ai-video"]) {
    const schema = getCanvasNodeSchema(nodeType);
    for (const key of VIMAX_LINEAGE_FIELDS) {
      const field = schema.fields.find((item) => item.key === key);
      assert.ok(field, `${nodeType} schema missing vimax lineage field ${key}`);
      assert.equal(field.agentWritable, false, `${nodeType}.${key} must not be agent-writable`);
      assert.deepEqual([...field.trustedSources], ["vimax-director"], `${nodeType}.${key} trustedSources drifted`);
      if (ARRAY_FIELDS.has(key)) {
        assert.equal(field.type, "array", `${nodeType}.${key} must be an array field`);
      }
      if (INTEGER_FIELDS.has(key)) {
        assert.equal(field.type, "integer", `${nodeType}.${key} must be an integer field (shotplan idx is numeric)`);
      }
    }
  }
});

test("contract: vimax lineage fields do NOT bleed into the dormant qmai channel", () => {
  // The qmai channel stays "qmai-director" only; vimax stays
  // "vimax-director" only. No field carries both.
  for (const nodeType of ["ai-image", "ai-video"]) {
    const schema = getCanvasNodeSchema(nodeType);
    for (const key of ["qmaiPromptId", "qmaiShotId", "continuityAnchors"]) {
      const field = schema.fields.find((item) => item.key === key);
      assert.deepEqual([...field.trustedSources], ["qmai-director"], `${nodeType}.${key} must stay qmai-only`);
    }
    for (const key of VIMAX_LINEAGE_FIELDS) {
      const field = schema.fields.find((item) => item.key === key);
      assert.ok(!field.trustedSources.includes("qmai-director"), `${nodeType}.${key} must not trust qmai`);
    }
  }
});

test("contract: vimax lineage fields survive the Python data-key whitelist (_safe_metadata)", async () => {
  const pySource = await readFile(PY_SCHEMA_PATH, "utf-8");
  const tupleMatch = pySource.match(/WORKFLOW_METADATA_FIELDS\s*=\s*\{([\s\S]*?)\}/);
  assert.ok(tupleMatch, "Python WORKFLOW_METADATA_FIELDS set not found");
  const pyFields = new Set([...tupleMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]));

  for (const key of VIMAX_LINEAGE_FIELDS) {
    assert.ok(
      pyFields.has(key),
      `Python _safe_metadata whitelist missing ${key} - vimax lineage would be stripped in transit`,
    );
  }
});
