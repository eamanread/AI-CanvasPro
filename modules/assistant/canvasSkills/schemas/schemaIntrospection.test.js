import test from "node:test";
import assert from "node:assert/strict";

import { introspectSupportedFields } from "./schemaIntrospection.js";

test("schemaIntrospection: mapper-supported fields must be classified in schema", () => {
  const drift = introspectSupportedFields({
    nodeType: "ai-image",
    mapperSnapshot: { writableKeys: ["prompt", "modelId", "batchSize", "newUiField"] },
    uiControlSnapshot: { writableKeys: ["quality"] },
    nodeDefaults: { prompt: "", modelId: "", batchSize: 1, quality: "standard" },
  }).unclassifiedFields;

  assert.deepEqual(drift, ["newUiField"]);
});
