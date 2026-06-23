// Maps a vimax-portraits-result/v1 (from the ViMax 定妆 runner) onto
// declarative canvas actions (P3-M14 / F5 portraits). Pure function, zero
// imports - same contract as vimaxCanvasActions.js: emits placement hints,
// lets the executor's placement resolver + movement guard do the layout.
//
// Each character lands as ONE three-view group (front/side/back) in its own
// lane, data.assetRole='character' + shared vimaxFlowId/vimaxCharIdx so the
// panel (M15) can act on the whole set (采用整套/重摇整套). The mapper emits
// the group STRUCTURE only - never the portrait image: nodes are double-
// stamped autoStart:false (never self-ignite) and the panel lands each
// view's url via updateNodeData (imageUrl isn't a create-action schema
// field; same pattern as the M11 keyframe landing).

const SCHEMA_VERSION = "vimax-portraits-result/v1";
// Stable view order; the side/back portraits derive from the front, so front
// is always the group anchor.
const VIEW_ORDER = ["front", "side", "back"];
const VIEW_LABELS = { front: "正面", side: "侧面", back: "背面" };

function text(value) {
  return String(value ?? "").trim();
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function mapVimaxPortraitsToCanvasActions({ portraits } = {}) {
  if (portraits?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`portraits schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const flowId = text(portraits.flowId);
  if (!flowId) {
    throw new Error("portraits must carry a non-empty flowId");
  }
  if (!Array.isArray(portraits.characters) || portraits.characters.length === 0) {
    throw new Error("portraits must contain characters");
  }

  const actions = [];
  for (const character of portraits.characters) {
    if (!character || character.error) continue; // failed 定妆 -> no group
    const charIdx = intOrNull(character.idx);
    if (charIdx === null) continue;
    const identifier = text(character.identifier) || `角色 ${charIdx}`;

    // Index the character's views by name, keep only the ones that actually
    // produced a url (a failed view lands no blank node).
    const byView = new Map();
    for (const v of Array.isArray(character.views) ? character.views : []) {
      const name = text(v?.view);
      if (name && text(v?.url)) byView.set(name, v);
    }
    const orderedViews = VIEW_ORDER.filter((name) => byView.has(name));
    if (!orderedViews.length) continue; // nothing usable for this character

    // front is the group anchor; later views chain right-of the previous and
    // edge back to the anchor (they derive from the front portrait).
    const anchorId = `vimax-${flowId}-portrait-${charIdx}-${orderedViews[0]}`;
    let prevId = null;
    for (const view of orderedViews) {
      const nodeId = `vimax-${flowId}-portrait-${charIdx}-${view}`;
      actions.push({
        type: "create_node",
        id: nodeId,
        nodeType: "ai-image",
        name: `${identifier} · ${VIEW_LABELS[view] || view}`,
        placement: prevId === null
          ? { strategy: "new-lane", topic: `定妆 ${identifier}` }
          : { strategy: "right-of", anchor: prevId },
        // Double stamp: portrait nodes are display targets, never self-ignite.
        autoStart: false,
        data: {
          vimaxFlowId: flowId,
          vimaxRole: "portrait",
          assetRole: "character",
          vimaxCharIdx: charIdx,
          vimaxView: view,
          autoStart: false,
        },
      });
      if (prevId !== null) {
        actions.push({
          type: "connect_nodes",
          from: anchorId,
          to: nodeId,
          label: VIEW_LABELS[view] || view,
        });
      }
      prevId = nodeId;
    }
  }

  if (!actions.length) {
    throw new Error("portraits produced no usable views (all characters failed)");
  }

  actions.push({ type: "tidy_canvas", scope: "all" });
  return { actions };
}
