import assert from "node:assert/strict";
import test from "node:test";

import { ASSET_CATEGORIES, buildAssistantMentionMenu } from "./assistantMentionResolver.js";

test("assistantMentionResolver: orders references, canvas nodes, then asset categories", () => {
  const menu = buildAssistantMentionMenu({
    attachments: [{ id: "att-1", kind: "image", name: "summer.png", metadata: { localPath: "D:\\secret.png" } }],
    nodes: [{ id: "node-1", title: "Storyboard 1", type: "ai-text" }],
    assets: {
      characters: [{ id: "char-1", name: "Little Girl" }],
      scenes: [],
    },
  });

  assert.equal(menu.references[0].displayToken, "@参考图-summer.png");
  assert.equal(menu.canvasNodes.label, "画布节点");
  assert.equal(menu.canvasNodes.children[0].displayToken, "@节点-Storyboard 1");
  assert.equal(menu.assets.label, "我的资产");
  assert.deepEqual(menu.assets.categories.map((category) => category.key), ASSET_CATEGORIES.map((category) => category.key));
  assert.equal(menu.assets.categories[0].children[0].displayToken, "@资产-角色-Little Girl");
  assert.equal(menu.assets.categories.find((category) => category.key === "scenes").disabled, true);
  assert.equal(menu.assets.categories.find((category) => category.key === "scenes").emptyText, "暂无资产");
});

test("assistantMentionResolver: limits canvas nodes to 30 and searches by name", () => {
  const nodes = Array.from({ length: 40 }, (_, index) => ({ id: `node-${index + 1}`, title: `Shot ${index + 1}` }));
  const menu = buildAssistantMentionMenu({ nodes });
  assert.equal(menu.canvasNodes.children.length, 30);

  const filtered = buildAssistantMentionMenu({ nodes, query: "Shot 39" });
  assert.deepEqual(filtered.canvasNodes.children.map((item) => item.id), ["node-39"]);
});

test("assistantMentionResolver: maps flat asset-library items into fixed categories", () => {
  const menu = buildAssistantMentionMenu({
    assets: {
      items: [
        { id: "asset-character", name: "Hero", assetType: "角色" },
        { id: "asset-scene", name: "Beach", type: "scene" },
        { id: "asset-style", name: "Watercolor", category: "styles" },
      ],
    },
  });

  assert.deepEqual(menu.assets.categories[0].children.map((item) => item.displayToken), ["@资产-角色-Hero"]);
  assert.deepEqual(menu.assets.categories[1].children.map((item) => item.displayToken), ["@资产-场景-Beach"]);
  assert.deepEqual(menu.assets.categories[4].children.map((item) => item.displayToken), ["@资产-风格-Watercolor"]);
});

test("assistantMentionResolver: filters references and assets by query", () => {
  const menu = buildAssistantMentionMenu({
    attachments: [
      { id: "att-summer", name: "summer.png" },
      { id: "att-winter", name: "winter.png" },
    ],
    assets: {
      characters: [
        { id: "hero", name: "Little Hero" },
        { id: "villain", name: "Dark Villain" },
      ],
    },
    query: "winter",
  });

  assert.deepEqual(menu.references.map((item) => item.id), ["att-winter"]);
  assert.deepEqual(menu.assets.categories[0].children, []);

  const assetMenu = buildAssistantMentionMenu({
    attachments: [{ id: "att-summer", name: "summer.png" }],
    assets: { characters: [{ id: "hero", name: "Little Hero" }] },
    query: "hero",
  });

  assert.deepEqual(assetMenu.references, []);
  assert.deepEqual(assetMenu.assets.categories[0].children.map((item) => item.id), ["hero"]);
});

test("assistantMentionResolver: reports asset library empty state on assets submenu only", () => {
  const menu = buildAssistantMentionMenu({
    assets: {},
  });

  assert.equal(menu.assets.emptyText, "暂无资产");
  assert.equal(menu.assets.categories.every((category) => category.disabled), true);
});

test("assistantMentionResolver: asset root empty state depends on raw library, not search result", () => {
  const menu = buildAssistantMentionMenu({
    assets: {
      characters: [{ id: "hero", name: "Little Hero" }],
    },
    query: "no-match",
  });

  assert.equal(menu.assets.emptyText, "");
  assert.equal(menu.assets.categories[0].emptyText, "暂无资产");
  assert.equal(menu.assets.categories[0].disabled, true);
});
