// B4: A/B 对账门 at the CANVAS-ACTION layer. The A3 golden对账
// (brain/golden_compare.py) proves the external and native runtimes produce
// structurally-equivalent vimax-shotplan/v1; this proves the two plans then
// PROJECT to structurally-equivalent CANVAS output. Because both lanes share
// mapVimaxShotplanToCanvasActions, divergence can only come from the shotplans
// themselves - but this layer also independently asserts canvas HEALTH
// invariants the shotplan layer can't see (trusted lineage on every node, the
// no-self-ignite prep stamp, 1:1:1 card/prep/edge pairing, safe node types),
// so it doubles as a mapper-regression gate.
//
// Pure: no IO. Profiles a canvas action list into a structural fingerprint
// (never free text - prompts/names/rows differ with LLM variance) and compares
// two fingerprints into a verdict, mirroring shotplan_profile/compare_profiles.

import { mapVimaxShotplanToCanvasActions } from "./vimaxCanvasActions.js";

// Mirror of claw_action_schema.SAFE_NODE_TYPES (the canvas-safe set). A node
// type outside this set would be rejected at the claw gate and never land
// (the B0-C1 lesson), so a divergence here is a hard failure, not a note.
const SAFE_NODE_TYPES = new Set([
  "source-text", "source-image", "source-video", "source-audio",
  "ai-text", "ai-image", "ai-video", "ai-audio",
  "comment", "group", "storyboard-script",
]);

function isFiniteInt(v) {
  return Number.isFinite(Number(v));
}

// True iff a prep node is double-stamped to never self-ignite (铁律4): the
// stamp lives top-level OR in data (the executor honors either; claw keeps the
// top-level one).
function isNoAutoStart(action) {
  return action.autoStart === false || (action.data && action.data.autoStart === false);
}

export function canvasActionProfile(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const creates = list.filter((a) => a && a.type === "create_node");
  const edges = list.filter((a) => a && a.type === "connect_nodes");

  const nodeCountByType = {};
  const edgeLabels = {};
  const ids = [];
  const shotIdxs = new Set();
  const lanes = new Set();
  let laneCount = 0;
  let rightOfCount = 0;
  let allNodeTypesSafe = creates.length > 0;
  let lineageComplete = creates.length > 0;
  let prepNoAutoStart = true;
  let cardCount = 0;
  let prepCount = 0;

  for (const a of creates) {
    const type = String(a.nodeType || "");
    nodeCountByType[type] = (nodeCountByType[type] || 0) + 1;
    if (!SAFE_NODE_TYPES.has(type)) allNodeTypesSafe = false;
    ids.push(String(a.id || ""));

    const data = a.data || {};
    const role = String(data.vimaxRole || "");
    // Trusted lineage: every node must carry flowId + role + a finite shotIdx,
    // or claw distrusts it (the V5/B0 lineage invariant). Non-shot comment
    // nodes (role "story"/"cast", B3) use the vimaxShotIdx:-1 sentinel, which
    // isFiniteInt accepts — so they are intentionally lineage-complete and never
    // perturb cardPrepPaired (it counts only card/prep).
    if (!data.vimaxFlowId || !role || !isFiniteInt(data.vimaxShotIdx)) lineageComplete = false;
    if (isFiniteInt(data.vimaxShotIdx)) shotIdxs.add(Number(data.vimaxShotIdx));
    if (role === "card") cardCount += 1;
    if (role === "prep") {
      prepCount += 1;
      if (!isNoAutoStart(a)) prepNoAutoStart = false;
    }

    const p = a.placement || {};
    if (p.strategy === "new-lane") {
      laneCount += 1;
      if (p.topic) lanes.add(String(p.topic));
    } else if (p.strategy === "right-of") {
      rightOfCount += 1;
    }
  }

  for (const e of edges) {
    const label = String(e.label || "");
    edgeLabels[label] = (edgeLabels[label] || 0) + 1;
  }

  const prepEdgeCount = edgeLabels.prep || 0;
  const uniqueIds = ids.length > 0 && new Set(ids).size === ids.length;
  // Each shot -> exactly one card + one prep + one prep edge (the mapper's
  // 1:1:1 contract). A drift here means the mapper changed shape.
  const cardPrepPaired = cardCount > 0 && cardCount === prepCount && prepCount === prepEdgeCount;
  const hasTidy = list.some((a) => a && a.type === "tidy_canvas");

  return {
    totalNodes: creates.length,
    nodeCountByType,
    edgeCount: edges.length,
    edgeLabels,
    laneCount,
    laneTopicCount: lanes.size,
    rightOfCount,
    shotIdxCount: shotIdxs.size,
    hasTidy,
    allNodeTypesSafe,
    lineageComplete,
    prepNoAutoStart,
    cardPrepPaired,
    uniqueIds,
  };
}

// Canvas HEALTH invariants each side must satisfy INDEPENDENTLY. A false here
// is a hard failure (the plan would not land correctly / would be distrusted),
// never a tolerance note.
const HARD_INVARIANTS = ["allNodeTypesSafe", "lineageComplete", "prepNoAutoStart", "cardPrepPaired", "uniqueIds", "hasTidy"];
// Gate the LOGICAL plan size within tolerance (LLM variance is expected; a
// wildly different shot/scene count is not). These are all 1:1 with the plan
// (one prep edge per shot, one lane per scene). totalNodes is DERIVED (2x
// shots via the 1:1:1 contract, which cardPrepPaired already enforces per
// side), so it is reported for diagnostics but NOT gated - gating it would
// double-penalize a shot-count delta.
const GATED_COUNT_KEYS = ["shotIdxCount", "laneCount", "edgeCount"];
const REPORT_COUNT_KEYS = ["totalNodes", "edgeCount", "laneCount", "shotIdxCount"];

export function compareCanvasProfiles(external, native, { countTolerance = 2 } = {}) {
  const ext = external || {};
  const nat = native || {};
  const hardFailures = [];
  for (const [side, prof] of [["external", ext], ["native", nat]]) {
    for (const inv of HARD_INVARIANTS) {
      if (!prof[inv]) hardFailures.push(`${side}.${inv} is false`);
    }
  }

  const countDeltas = {};
  for (const key of REPORT_COUNT_KEYS) {
    countDeltas[key] = { external: Number(ext[key] || 0), native: Number(nat[key] || 0), delta: Number(nat[key] || 0) - Number(ext[key] || 0) };
  }
  const notes = [];
  for (const key of GATED_COUNT_KEYS) {
    const e = Number(ext[key] || 0);
    const n = Number(nat[key] || 0);
    if (Math.abs(n - e) > countTolerance) {
      notes.push(`${key} differs beyond tolerance: external=${e} native=${n}`);
    }
  }
  // Per-type node counts must also stay within tolerance (e.g. a missing prep
  // lane would not show in totalNodes alone if a card count rose to match).
  const types = new Set([...Object.keys(ext.nodeCountByType || {}), ...Object.keys(nat.nodeCountByType || {})]);
  for (const t of types) {
    const e = Number((ext.nodeCountByType || {})[t] || 0);
    const n = Number((nat.nodeCountByType || {})[t] || 0);
    if (Math.abs(n - e) > countTolerance) {
      notes.push(`nodeType "${t}" count differs beyond tolerance: external=${e} native=${n}`);
    }
  }

  return {
    equivalent: hardFailures.length === 0 && notes.length === 0,
    hardFailures,
    countDeltas,
    notes,
  };
}

// Full gate: map BOTH shotplans through the real mapper, profile, compare. A
// shotplan that fails to map (malformed / empty / no flowId) records a hard
// failure for that side rather than throwing, so the gate always returns a
// verdict.
export function reconcileShotplanCanvas(externalShotplan, nativeShotplan, opts = {}) {
  const profileSide = (shotplan, side) => {
    try {
      const { actions } = mapVimaxShotplanToCanvasActions({ shotplan });
      return { profile: canvasActionProfile(actions), mapError: null };
    } catch (error) {
      return { profile: canvasActionProfile([]), mapError: `${side} shotplan did not map: ${error?.message || error}` };
    }
  };
  const ext = profileSide(externalShotplan, "external");
  const nat = profileSide(nativeShotplan, "native");
  const verdict = compareCanvasProfiles(ext.profile, nat.profile, opts);
  const mapErrors = [ext.mapError, nat.mapError].filter(Boolean);
  if (mapErrors.length) {
    verdict.equivalent = false;
    verdict.hardFailures = [...mapErrors, ...verdict.hardFailures];
  }
  return { ...verdict, externalProfile: ext.profile, nativeProfile: nat.profile };
}
