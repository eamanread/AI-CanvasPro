export const ASSET_CUSTOM_CATEGORY = "自定义";

const CUSTOM_TAG_KEYS = [
  "customSubCategory",
  "customSubCategoryName",
  "customTag",
  "customTagName",
  "customCategory",
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function getAssetCategory(asset) {
  return cleanText(asset?.category ?? asset?.cat);
}

export function isCustomAsset(asset) {
  return getAssetCategory(asset) === ASSET_CUSTOM_CATEGORY;
}

export function normalizeAssetCustomTagName(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

export function getAssetCustomTag(asset) {
  if (!asset || typeof asset !== "object") {
    return "";
  }
  for (const key of CUSTOM_TAG_KEYS) {
    const value = normalizeAssetCustomTagName(asset[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

export function withAssetCustomTag(asset, tagName) {
  const normalizedTag = normalizeAssetCustomTagName(tagName);
  return {
    ...(asset && typeof asset === "object" ? asset : {}),
    customSubCategory: normalizedTag,
    customTag: normalizedTag,
  };
}

export function collectAssetCustomTags(assets = [], extraTags = []) {
  const seen = new Set();
  const result = [];
  const addTag = (value) => {
    const tag = normalizeAssetCustomTagName(value);
    if (!tag || seen.has(tag)) {
      return;
    }
    seen.add(tag);
    result.push(tag);
  };

  for (const tag of Array.isArray(extraTags) ? extraTags : []) {
    addTag(tag);
  }
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (isCustomAsset(asset)) {
      addTag(getAssetCustomTag(asset));
    }
  }
  return result;
}

export function filterAssetsForCategory(assets = [], category, customTag = "") {
  const normalizedCategory = cleanText(category);
  const normalizedTag = normalizeAssetCustomTagName(customTag);
  return (Array.isArray(assets) ? assets : []).filter((asset) => {
    if (getAssetCategory(asset) !== normalizedCategory) {
      return false;
    }
    if (normalizedCategory !== ASSET_CUSTOM_CATEGORY) {
      return true;
    }
    return Boolean(normalizedTag) && getAssetCustomTag(asset) === normalizedTag;
  });
}

export function validateCustomTagForAsset(category, tagName) {
  if (cleanText(category) !== ASSET_CUSTOM_CATEGORY) {
    return { ok: true, tagName: "" };
  }
  const normalizedTag = normalizeAssetCustomTagName(tagName);
  if (!normalizedTag) {
    return {
      ok: false,
      tagName: "",
      message: "请选择或创建一个自定义标签",
    };
  }
  return { ok: true, tagName: normalizedTag };
}

export function canDeleteAssetCustomTag(assets = [], tagName) {
  const normalizedTag = normalizeAssetCustomTagName(tagName);
  if (!normalizedTag) {
    return { ok: false, message: "请选择要删除的自定义标签" };
  }
  const hasAssets = (Array.isArray(assets) ? assets : []).some(
    (asset) => isCustomAsset(asset) && getAssetCustomTag(asset) === normalizedTag,
  );
  if (hasAssets) {
    return { ok: false, message: "该标签有资产，无法删除" };
  }
  return { ok: true, message: "" };
}
