// The single sovereignty + lineage + PERSISTENCE chokepoint for every
// code path that moves or places canvas nodes. New movement paths
// must import these instead of re-implementing the checks - pinned
// sovereignty and placement lineage are invariants (CONTRACTS.md 8/9).
//
// Persistence matters because the real app store (src/core/stores)
// returns snapshot clones from reads: direct `node.x = ...` mutation
// is silently lost (empirically verified on the live instance - the
// "ghost layout" bug behind messy real-canvas drop points). Writes
// therefore also go through graphStore.updateNodeData, which the real
// store merges top-level (absolute x/y) and test stores merge into
// node.data (harmless).

export function isPinnedNode(node) {
  return Boolean(node && node.data && node.data.pinned === true);
}

export function applyNodePosition(graphStore, node, x, y) {
  if (!node) return;
  node.x = x;
  node.y = y;
  graphStore?.updateNodeData?.(node.id, { x, y });
}

export function recordPlacement(graphStore, node, reason) {
  if (!node) return;
  const value = String(reason);
  node.data = { ...(node.data || {}), placementReason: value };
  graphStore?.updateNodeData?.(node.id, { placementReason: value });
}
