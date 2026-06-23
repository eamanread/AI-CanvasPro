import test from "node:test";
import assert from "node:assert/strict";

import { searchAssets } from "./assetSearchIndex.js";

test("assetSearchIndex: searches by name tag category and source node with ranking", () => {
  const assets = [
    { id: "old", name: "Old Hero", category: "character", tags: ["hero"], sourceNodeId: "n1", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "pin", name: "Pinned Hero", category: "character", tags: [], sourceNodeId: "n2", pinned: true, updatedAt: "2025-01-01T00:00:00.000Z" },
    { id: "fav", name: "Favorite Scene", category: "scene", tags: ["hero"], sourceNodeId: "n3", favorite: true, updatedAt: "2026-02-01T00:00:00.000Z" },
  ];

  assert.deepEqual(searchAssets(assets, { query: "hero" }).map((asset) => asset.id), ["pin", "fav", "old"]);
  assert.deepEqual(searchAssets(assets, { category: "scene" }).map((asset) => asset.id), ["fav"]);
  assert.deepEqual(searchAssets(assets, { sourceNodeId: "n1" }).map((asset) => asset.id), ["old"]);
});
