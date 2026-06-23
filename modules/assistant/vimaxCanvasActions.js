// Maps a vimax-shotplan/v1 (from the ViMax runner) onto declarative
// canvas actions. Pure function, zero imports: it emits placement
// hints and lets the executor's placement resolver + movement guard do
// the layout (same contract as directorCanvasActions.mapStoryboardTo-
// CanvasActions). Never emits generation actions - prep nodes are
// double-stamped autoStart:false so they land for review without
// self-igniting (α′ F5, 铁律 4).
//
// Per shot: a storyboard-script card (editable plan + vimax lineage,
// rides the legacy create path so data is preserved wholesale) + an
// ai-image prep node (the render target, carries the prompt + lineage,
// rides the canvas-skills path where the lineage fields are
// trusted-only). One scene = one lane (new-lane); shots within a scene
// grow the row to the right.

const SCHEMA_VERSION = "vimax-shotplan/v1";

function text(value) {
  return String(value ?? "").trim();
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Build the storyboard-script table row for a shot, keyed by the node's REAL
// Chinese column keys (镜号/画面描述/图片提示词/视频提示词/对白/音效). Without
// this the card stored only flat fields the node never reads and rendered an
// EMPTY table (B0-C2). The node re-normalizes via createDefaultStoryboardScript-
// State on read, so a partial row (only the columns we have) is fine; absent
// columns render empty. audio_desc conflates speech + sfx -> route a
// [Sound Effect] line to 音效, otherwise 对白.
function shotRow(shot, idx) {
  const row = { 镜号: String(idx) };
  if (text(shot.visualDesc)) row["画面描述"] = text(shot.visualDesc);
  if (text(shot.ffDesc)) row["图片提示词"] = text(shot.ffDesc);
  if (text(shot.motionDesc)) row["视频提示词"] = text(shot.motionDesc);
  const audio = text(shot.audioDesc);
  if (audio) {
    if (/\[\s*sound\s*effect\s*\]/i.test(audio) && !/\[\s*speaker\s*\]/i.test(audio)) row["音效"] = audio;
    else row["对白"] = audio;
  }
  return row;
}

export function mapVimaxShotplanToCanvasActions({ shotplan } = {}) {
  if (shotplan?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`shotplan schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(shotplan.shots) || shotplan.shots.length === 0) {
    throw new Error("shotplan must contain shots");
  }

  const flowId = text(shotplan.flowId);
  // Ids are keyed on flowId; an empty one would collide across
  // concurrent flows (and the legacy create path uses the literal id).
  if (!flowId) {
    throw new Error("shotplan must carry a non-empty flowId");
  }
  const skillRefs = Array.isArray(shotplan.skillRefs) ? shotplan.skillRefs.map(text).filter(Boolean) : [];
  const actions = [];
  // anchorState.lastPrepInScene: last prep id PER scene, so a non-first shot
  // anchors right-of the previous prep in its OWN lane even if shots arrive
  // interleaved (a global chain would anchor across scene lanes).
  const anchorState = { lastPrepInScene: new Map() };

  for (const shot of shotplan.shots) {
    const acts = shotActions(shot, flowId, skillRefs, anchorState);
    if (acts.length) actions.push(...acts);
  }

  // The placement resolver owns layout; a final tidy aligns the grid.
  actions.push({ type: "tidy_canvas", scope: "all" });

  return { actions };
}

// Build the canvas actions for ONE shot: a storyboard-script card + an ai-image
// prep + a card->prep edge. Returns [] for an unidentifiable shot (null idx).
// anchorState = { lastPrepInScene: Map<sceneIdx, prepId> } is mutated so the
// next shot in the same scene anchors right-of this prep. Extracted from the
// mapper loop so a scene's shots can also be landed incrementally (B3b);
// mapVimaxShotplanToCanvasActions delegates here, so behavior is unchanged.
export function shotActions(shot, flowId, skillRefs = [], anchorState = { lastPrepInScene: new Map() }) {
  const idx = intOrNull(shot.idx);
  if (idx === null) return [];
  if (!(anchorState.lastPrepInScene instanceof Map)) anchorState.lastPrepInScene = new Map();
  const lastPrepInScene = anchorState.lastPrepInScene;
  const camIdx = intOrNull(shot.camIdx) ?? 0;
  const sceneIdx = intOrNull(shot.sceneIdx) ?? 0;
  const cardId = `vimax-${flowId}-shot-${idx}`;
  const prepId = `vimax-${flowId}-prep-${idx}`;
  const firstInScene = !lastPrepInScene.has(sceneIdx);

  const cardData = {
    shotIndex: idx,
    shotPrompt: text(shot.ffDesc),
    shotVideoPrompt: text(shot.motionDesc),
    cameraMove: `机位 ${camIdx}`,
    // The storyboard-script TABLE state - the node renders from this (not the
    // flat fields above, which it never reads). One row per shot card; the
    // node re-normalizes on read (B0-C2). Whitelisted in claw so it survives.
    storyboardScript: { rows: [shotRow(shot, idx)] },
    // ViMax lineage (F8 trusted fields; storyboard-script rides the
    // legacy path so data is preserved wholesale). vimaxRole lets the
    // F6 writeback collector disambiguate the plan card from the
    // render-target prep (both carry vimaxFlowId+vimaxShotIdx) - the
    // prep is the authoritative prompt edit surface.
    vimaxFlowId: flowId,
    vimaxRole: "card",
    vimaxShotIdx: idx,
    vimaxCamIdx: camIdx,
    skillRefs,
  };
  // Editable content fields, shown only when present.
  if (text(shot.lfDesc)) cardData.shotLastFrame = text(shot.lfDesc);
  if (text(shot.audioDesc)) cardData.shotAudio = text(shot.audioDesc);
  if (text(shot.visualDesc)) cardData.shotVisual = text(shot.visualDesc);
  if (text(shot.variationType)) cardData.variationType = text(shot.variationType);
  const duration = intOrNull(shot.durationSeconds);
  if (duration !== null) cardData.durationSeconds = duration;

  const out = [
    {
      type: "create_node",
      id: cardId,
      nodeType: "storyboard-script",
      name: `Shot ${idx}`,
      placement: firstInScene
        ? { strategy: "new-lane", topic: `scene ${sceneIdx}` }
        : { strategy: "right-of", anchor: lastPrepInScene.get(sceneIdx) },
      data: cardData,
    },
    {
      type: "create_node",
      id: prepId,
      nodeType: "ai-image",
      name: `prep · shot ${idx}`,
      // The prep joins its shot card to the right - card then render
      // target, the placement resolver + tidy own the final geometry.
      placement: { strategy: "right-of", anchor: cardId },
      // Double stamp: skills executor honors either form, claw keeps the
      // top-level one. Prep carries a prompt but must never self-ignite.
      autoStart: false,
      data: {
        prompt: text(shot.ffDesc),
        vimaxFlowId: flowId,
        vimaxRole: "prep",
        vimaxShotIdx: idx,
        vimaxCamIdx: camIdx,
        skillRefs,
        autoStart: false,
      },
    },
    {
      type: "connect_nodes",
      from: cardId,
      to: prepId,
      label: "prep",
    },
  ];

  lastPrepInScene.set(sceneIdx, prepId);
  return out;
}
