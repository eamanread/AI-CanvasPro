import { createAssetDuplicateKey, normalizeAssetRecord } from "./assetCatalog.js";

export function findDuplicateAsset(asset, existingAssets = []) {
  const key = createAssetDuplicateKey(asset);
  if (!key) return null;
  return (Array.isArray(existingAssets) ? existingAssets : [])
    .map(normalizeAssetRecord)
    .find((item) => item.duplicateKey === key || item.id === asset?.id) || null;
}

export function isDuplicateAsset(asset, existingAssets = []) {
  return Boolean(findDuplicateAsset(asset, existingAssets));
}
