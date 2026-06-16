export const DEFAULT_ASSET_CATEGORIES = Object.freeze([
  { key: "character", label: "角色", aliases: ["characters", "role", "roles", "人物"] },
  { key: "scene", label: "场景", aliases: ["scenes"] },
  { key: "object", label: "物品", aliases: ["objects", "item", "items", "prop", "props", "product"] },
  { key: "clothing", label: "服装", aliases: ["clothes", "costume", "costumes"] },
  { key: "style", label: "风格", aliases: ["styles"] },
  { key: "custom", label: "自定义", aliases: ["other", "others"] },
]);

function text(value) {
  return String(value ?? "").trim();
}

export function listAssetCategories(extraCategories = []) {
  const byKey = new Map(DEFAULT_ASSET_CATEGORIES.map((category) => [category.key, { ...category }]));
  for (const category of Array.isArray(extraCategories) ? extraCategories : []) {
    const key = text(category?.key);
    if (key) byKey.set(key, { key, label: text(category.label) || key, aliases: Array.isArray(category.aliases) ? category.aliases : [] });
  }
  return [...byKey.values()];
}

export function normalizeAssetCategory(value) {
  const marker = text(value).toLowerCase();
  if (!marker) return "custom";
  for (const category of DEFAULT_ASSET_CATEGORIES) {
    if ([category.key, category.label, ...category.aliases].map((item) => text(item).toLowerCase()).includes(marker)) {
      return category.key;
    }
  }
  return marker;
}

export function createAssetDuplicateKey(asset = {}) {
  const existingKey = text(asset.duplicateKey);
  if (existingKey) return existingKey;
  const sourceNodeId = text(asset.sourceNodeId);
  const resultId = text(asset.resultId);
  if (sourceNodeId && resultId) return `canvas_result:${sourceNodeId}:${resultId}`;
  const fileName = text(asset.fileName || asset.name);
  const size = Number(asset.size || asset.fileSize || 0) || 0;
  if (fileName) return `file:${fileName}:${size}`;
  return text(asset.id || asset.url || asset.thumbnailUrl);
}

export function normalizeAssetRecord(raw = {}) {
  const id = text(raw.id || raw.assetId || raw.duplicateKey || raw.name || raw.fileName);
  const category = normalizeAssetCategory(raw.category || raw.assetType || raw.type || raw.kind);
  const now = new Date(0).toISOString();
  const record = {
    id,
    name: text(raw.name || raw.title || raw.fileName || id),
    category,
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
    sourceType: text(raw.sourceType) || (raw.sourceNodeId ? "canvas_result" : "asset_library"),
    sourceNodeId: text(raw.sourceNodeId),
    resultId: text(raw.resultId),
    fileName: text(raw.fileName || raw.name),
    size: Number(raw.size || raw.fileSize || 0) || 0,
    url: text(raw.url || raw.media || raw.previewUrl),
    thumbnailUrl: text(raw.thumbnailUrl || raw.thumbUrl || raw.previewUrl || raw.url),
    promptPreview: text(raw.promptPreview).slice(0, 120),
    modelDisplayName: text(raw.modelDisplayName),
    createdAt: text(raw.createdAt) || now,
    updatedAt: text(raw.updatedAt) || text(raw.createdAt) || now,
    lastUsedAt: text(raw.lastUsedAt),
    favorite: Boolean(raw.favorite),
    pinned: Boolean(raw.pinned),
    duplicateKey: text(raw.duplicateKey) || "",
    contentHash: text(raw.contentHash),
    perceptualHash: text(raw.perceptualHash),
    embeddingId: text(raw.embeddingId),
    semanticIndexStatus: text(raw.semanticIndexStatus) || "not_indexed",
    referenceHealth: text(raw.referenceHealth) || "ok",
  };
  record.duplicateKey = record.duplicateKey || createAssetDuplicateKey(record);
  return record;
}
