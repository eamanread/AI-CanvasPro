import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_ASSET_CATEGORIES, normalizeAssetRecord, listAssetCategories } from "./assetCatalog.js";

test("assetCatalog: supports default categories plus future custom category", () => {
  const categories = listAssetCategories([{ key: "vehicle", label: "载具" }]);
  assert.deepEqual(DEFAULT_ASSET_CATEGORIES.map((item) => item.key), ["character", "scene", "object", "clothing", "style", "custom"]);
  assert.equal(categories.find((item) => item.key === "vehicle").label, "载具");
});

test("assetCatalog: normalizes asset record contract", () => {
  const asset = normalizeAssetRecord({
    id: "a1",
    name: "红衣女主角",
    category: "character",
    tags: ["女主", "红衣"],
    sourceNodeId: "node-1",
    resultId: "result-1",
    url: "/asset.png",
  });

  assert.equal(asset.category, "character");
  assert.equal(asset.sourceNodeId, "node-1");
  assert.equal(asset.duplicateKey, "canvas_result:node-1:result-1");
  assert.equal(asset.semanticIndexStatus, "not_indexed");
});
