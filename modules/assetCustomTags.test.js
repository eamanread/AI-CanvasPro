import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_CUSTOM_CATEGORY,
  canDeleteAssetCustomTag,
  collectAssetCustomTags,
  filterAssetsForCategory,
  getAssetCustomTag,
  validateCustomTagForAsset,
  withAssetCustomTag,
} from "./assetCustomTags.js";

test("collects custom asset tags with extra tags first and no duplicates", () => {
  const tags = collectAssetCustomTags(
    [
      { category: ASSET_CUSTOM_CATEGORY, customTag: "角色" },
      { category: ASSET_CUSTOM_CATEGORY, customSubCategory: "角色" },
      { category: ASSET_CUSTOM_CATEGORY, customTagName: " 场景  道具 " },
      { category: "人物", customTag: "忽略" },
    ],
    ["默认", "角色"],
  );

  assert.deepEqual(tags, ["默认", "角色", "场景 道具"]);
});

test("filters custom assets by selected custom tag", () => {
  const assets = [
    { id: "a", category: ASSET_CUSTOM_CATEGORY, customTag: "角色" },
    { id: "b", category: ASSET_CUSTOM_CATEGORY, customTag: "场景" },
    { id: "c", category: "人物", customTag: "角色" },
  ];

  assert.deepEqual(
    filterAssetsForCategory(assets, ASSET_CUSTOM_CATEGORY, "角色").map((asset) => asset.id),
    ["a"],
  );
});

test("keeps normal category filtering unchanged", () => {
  const assets = [
    { id: "a", category: "人物" },
    { id: "b", category: "场景" },
    { id: "c", category: "人物", customTag: "角色" },
  ];

  assert.deepEqual(
    filterAssetsForCategory(assets, "人物", "角色").map((asset) => asset.id),
    ["a", "c"],
  );
});

test("requires a custom tag when creating a custom asset", () => {
  assert.deepEqual(validateCustomTagForAsset(ASSET_CUSTOM_CATEGORY, " "), {
    ok: false,
    tagName: "",
    message: "请选择或创建一个自定义标签",
  });

  assert.deepEqual(validateCustomTagForAsset("人物", " "), { ok: true, tagName: "" });
});

test("prevents deleting a custom tag while assets still use it", () => {
  const assets = [{ category: ASSET_CUSTOM_CATEGORY, customTag: "角色" }];

  assert.deepEqual(canDeleteAssetCustomTag(assets, "角色"), {
    ok: false,
    message: "该标签有资产，无法删除",
  });
  assert.deepEqual(canDeleteAssetCustomTag(assets, "场景"), { ok: true, message: "" });
});

test("writes normalized custom tag fields onto an asset", () => {
  const asset = withAssetCustomTag({ id: "asset-1" }, "  角色  标签 ");

  assert.equal(asset.id, "asset-1");
  assert.equal(asset.customSubCategory, "角色 标签");
  assert.equal(asset.customTag, "角色 标签");
  assert.equal(getAssetCustomTag(asset), "角色 标签");
});
