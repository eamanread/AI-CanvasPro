function text(value) {
  return String(value ?? "").trim();
}

export function checkAssetReferenceHealth({ assets = [], nodes = [] } = {}) {
  const nodeIds = new Set((Array.isArray(nodes) ? nodes : []).map((node) => text(node?.id)).filter(Boolean));
  const warnings = [];
  for (const asset of Array.isArray(assets) ? assets : []) {
    const assetId = text(asset?.id || asset?.assetId);
    const sourceNodeId = text(asset?.sourceNodeId);
    if (sourceNodeId && !nodeIds.has(sourceNodeId)) {
      warnings.push({ assetId, sourceNodeId, reason: "SOURCE_NODE_MISSING" });
    }
    if (!text(asset?.thumbnailUrl || asset?.thumbUrl || asset?.url)) {
      warnings.push({ assetId, reason: "THUMBNAIL_MISSING" });
    }
  }
  return {
    ok: warnings.length === 0,
    warnings,
  };
}
