import { normalizeAssetCategory, normalizeAssetRecord } from "./assetCatalog.js";

function text(value) {
  return String(value ?? "").trim();
}

function matches(asset, { query = "", category = "", sourceNodeId = "" } = {}) {
  const needle = text(query).toLowerCase();
  const normalizedCategory = text(category) ? normalizeAssetCategory(category) : "";
  if (normalizedCategory && asset.category !== normalizedCategory) return false;
  if (sourceNodeId && asset.sourceNodeId !== text(sourceNodeId)) return false;
  if (!needle) return true;
  const haystack = [asset.name, asset.id, asset.category, asset.sourceNodeId, ...(asset.tags || [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function rank(left, right) {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  if (Boolean(left.favorite) !== Boolean(right.favorite)) return left.favorite ? -1 : 1;
  return text(right.lastUsedAt || right.updatedAt || right.createdAt).localeCompare(text(left.lastUsedAt || left.updatedAt || left.createdAt));
}

export function searchAssets(assets = [], options = {}) {
  return (Array.isArray(assets) ? assets : [])
    .map(normalizeAssetRecord)
    .filter((asset) => asset.id && matches(asset, options))
    .sort(rank);
}
