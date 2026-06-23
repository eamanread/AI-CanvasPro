import test from "node:test";
import assert from "node:assert/strict";

import { checkAssetReferenceHealth } from "./assetReferenceHealth.js";

test("assetReferenceHealth: warns deleted source node and broken thumbnail", () => {
  const result = checkAssetReferenceHealth({
    assets: [
      { id: "a1", sourceNodeId: "missing", thumbnailUrl: "" },
      { id: "a2", sourceNodeId: "ok", thumbnailUrl: "/thumb.png" },
    ],
    nodes: [{ id: "ok" }],
  });

  assert.deepEqual(result.warnings.map((item) => item.reason), ["SOURCE_NODE_MISSING", "THUMBNAIL_MISSING"]);
});
