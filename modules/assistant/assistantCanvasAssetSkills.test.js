import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasAssetSkills } from "./assistantCanvasAssetSkills.js";

test("asset skills list assets from store", async () => {
  const skills = createAssistantCanvasAssetSkills({ assetStore: { getState: () => ({ assets: [{ id: "a1", name: "Hero" }] }) } });
  const result = await skills.listAssets();
  assert.deepEqual(result.assets.map((asset) => asset.id), ["a1"]);
});

test("asset skills list supports category tag search and health warnings", async () => {
  const skills = createAssistantCanvasAssetSkills({
    graphStore: { nodes: [{ id: "node-ok" }] },
    assetStore: {
      getState: () => ({
        assets: [
          { id: "a1", name: "Hero", category: "character", tags: ["red"], sourceNodeId: "node-ok", thumbnailUrl: "/t.png" },
          { id: "a2", name: "Broken", category: "scene", tags: ["blue"], sourceNodeId: "missing", thumbnailUrl: "" },
        ],
      }),
    },
  });

  const result = await skills.listAssets({ query: "red", category: "character", includeHealth: true });

  assert.deepEqual(result.assets.map((asset) => asset.id), ["a1"]);
  assert.equal(result.categories.some((item) => item.key === "character"), true);
  assert.deepEqual(result.referenceHealth.warnings.map((item) => item.assetId), ["a2", "a2"]);
});

test("asset skills explicit save persists before local add", async () => {
  const added = [];
  const skills = createAssistantCanvasAssetSkills({
    graphStore: { nodes: [{ id: "n1", type: "ai-image", data: { images: ["img.png"] } }] },
    assetStore: { addAsset: (asset) => added.push(asset) },
    saveAssetToServer: async (payload) => ({ ...payload, id: "asset-1" }),
  });
  const result = await skills.addAsset({ sourceNodeId: "n1", assetType: "??", name: "????", explicitIntent: true });
  assert.equal(result.assetId, "asset-1");
  assert.equal(added.length, 1);
});

test("asset skills reject implicit save", async () => {
  const skills = createAssistantCanvasAssetSkills({ saveAssetToServer: async () => ({ id: "bad" }) });
  const result = await skills.addAsset({ sourceNodeId: "n1", explicitIntent: false });
  assert.equal(result.saved, false);
  assert.match(result.warning, /explicit/i);
});
