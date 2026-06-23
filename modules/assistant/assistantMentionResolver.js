const NODE_LIMIT = 30;

export const ASSET_CATEGORIES = Object.freeze([
  { key: "characters", label: "角色", aliases: ["roles", "role", "characters", "character"] },
  { key: "scenes", label: "场景", aliases: ["scene", "scenes"] },
  { key: "objects", label: "物品", aliases: ["objects", "items", "props", "products"] },
  { key: "clothing", label: "服装", aliases: ["clothing", "clothes", "costumes"] },
  { key: "styles", label: "风格", aliases: ["style", "styles"] },
  { key: "custom", label: "自定义", aliases: ["custom", "others"] },
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Map || value instanceof Set) return Array.from(value.values());
  if (value && typeof value === "object") {
    if (Array.isArray(value.items)) return value.items;
    return Object.values(value);
  }
  return [];
}

function text(value) {
  return String(value ?? "").trim();
}

function itemLabel(raw, fallback) {
  return text(raw?.label || raw?.name || raw?.title || raw?.displayName || raw?.id || fallback) || fallback;
}

function matchesQuery(label, query) {
  const needle = text(query).toLowerCase();
  return !needle || text(label).toLowerCase().includes(needle);
}

function cloneRaw(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (typeof structuredClone === "function") return structuredClone(raw);
  return JSON.parse(JSON.stringify(raw));
}

function normalizeReference(raw) {
  const id = text(raw?.id || raw?.assetId || raw?.name);
  if (!id) return null;
  const label = itemLabel(raw, id);
  return {
    id,
    type: "reference",
    label,
    displayToken: `@参考图-${label}`,
    category: "参考内容",
    source: "attachment",
    raw: cloneRaw(raw),
  };
}

function normalizeNode(raw) {
  const id = text(raw?.id || raw?.nodeId);
  if (!id) return null;
  const label = itemLabel(raw, id);
  return {
    id,
    type: "canvas_node",
    label,
    displayToken: `@节点-${label}`,
    category: "画布节点",
    source: "canvas",
    raw: cloneRaw(raw),
  };
}

function assetSourceForCategory(assets, category) {
  const source = assets && typeof assets === "object" ? assets : {};
  for (const key of [category.key, ...category.aliases]) {
    const value = source[key];
    const items = asArray(value);
    if (items.length) return items;
  }
  const flatItems = asArray(source.items || source.assets);
  return flatItems.filter((item) => {
    const marker = text(item?.assetType || item?.category || item?.type || item?.kind).toLowerCase();
    return [category.label, category.key, ...category.aliases].some((alias) => marker === text(alias).toLowerCase());
  });
}

function normalizeAsset(raw, category) {
  const id = text(raw?.id || raw?.assetId || raw?.name || raw?.title);
  if (!id) return null;
  const label = itemLabel(raw, id);
  return {
    id,
    type: "asset",
    assetType: category.label,
    label,
    displayToken: `@资产-${category.label}-${label}`,
    category: category.label,
    source: "asset_library",
    raw: cloneRaw(raw),
  };
}

export function buildAssistantMentionMenu({ attachments = [], nodes = [], assets = {}, query = "" } = {}) {
  const references = asArray(attachments)
    .map(normalizeReference)
    .filter(Boolean)
    .filter((reference) => matchesQuery(reference.label, query));
  const canvasChildren = asArray(nodes)
    .map(normalizeNode)
    .filter(Boolean)
    .filter((node) => matchesQuery(node.label, query))
    .slice(0, NODE_LIMIT);
  const categories = ASSET_CATEGORIES.map((category) => {
    const rawChildren = assetSourceForCategory(assets, category)
      .map((item) => normalizeAsset(item, category))
      .filter(Boolean)
    const children = rawChildren.filter((asset) => matchesQuery(asset.label, query));
    return {
      key: category.key,
      label: category.label,
      disabled: children.length === 0,
      emptyText: children.length === 0 ? "暂无资产" : "",
      rawCount: rawChildren.length,
      children,
    };
  });
  const assetCount = categories.reduce((total, category) => total + category.rawCount, 0);
  return {
    references,
    canvasNodes: {
      label: "画布节点",
      children: canvasChildren,
    },
    assets: {
      label: "我的资产",
      emptyText: assetCount === 0 ? "暂无资产" : "",
      categories,
    },
  };
}
