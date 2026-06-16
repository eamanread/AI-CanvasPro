// Collects render writeback edits from the canvas (P2-M11). The prep
// node (vimaxRole==="prep", an ai-image render target) is the single
// authoritative prompt edit surface - the storyboard-script card shares
// vimaxFlowId+vimaxShotIdx but is the plan display, not the edit source
// (M2 role discriminator). Reads are double-form: the real store
// flattens data to the node top level (node.data is often empty), test
// stores keep it nested - so try data.<key> then node.<key> (H5).
//
// Edits are keyed by the CANVAS shot idx (vimaxShotIdx); run_render maps
// that to ViMax's (sceneIdx, localIdx) via shotplan.json server-side.

function pick(node, key) {
  const data = node && typeof node.data === "object" && node.data ? node.data : null;
  if (data && data[key] !== undefined) return data[key];
  return node ? node[key] : undefined;
}

export function collectVimaxEdits(nodes, flowId) {
  const edits = [];
  const seen = new Set();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node) continue;
    if (pick(node, "vimaxFlowId") !== flowId) continue;
    if (pick(node, "vimaxRole") !== "prep") continue;
    const rawIdx = pick(node, "vimaxShotIdx");
    const shotIdx = Number(rawIdx);
    if (!Number.isFinite(shotIdx) || seen.has(shotIdx)) continue;
    seen.add(shotIdx);
    const prompt = pick(node, "prompt");
    edits.push({ shotIdx, ffDesc: typeof prompt === "string" ? prompt : "" });
  }
  return edits;
}

// Shot ids the user removed (deleted the prep node) - these are dropped
// from the render selection (取消勾选 semantics, no physical delete).
export function selectedRenderShotIdxs(nodes, flowId, allShotIdxs) {
  const present = new Set(collectVimaxEdits(nodes, flowId).map((e) => e.shotIdx));
  return (Array.isArray(allShotIdxs) ? allShotIdxs : []).filter((idx) => present.has(Number(idx)));
}
