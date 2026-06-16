import { sanitizeDirectorContext } from "./directorContextSchema.js";

export const QMAI_ACTION_PACKAGE_SCHEMA_VERSION = "qmai-director-action-package/v0";

/**
 * Maps QMAI director knowledge cards onto Huanying knowledge_card
 * canvas nodes. Citation semantics are `qmai` (workflowKind stays
 * knowledge_card so the existing executor formatting and trace path
 * applies). Output is deep-sanitized: local paths never reach canvas.
 */
export function mapKnowledgeCardsToCanvasActions({ cards = [], projectId = "" } = {}) {
  const actions = cards.map((card) => {
    const id = requireText(card?.id, "knowledge card id");
    const title = requireText(card?.title, "knowledge card title");
    const contentLines = [
      card.principle ? `原则: ${card.principle}` : "",
      card.whenToUse?.length ? `适用: ${card.whenToUse.join("、")}` : "",
      card.whenNotToUse?.length ? `避免: ${card.whenNotToUse.join("、")}` : "",
      card.productionRule ? `制作规则: ${card.productionRule}` : "",
      card.promptImplication ? `Prompt 含义: ${card.promptImplication}` : "",
      card.continuityImplication ? `连续性: ${card.continuityImplication}` : "",
      card.source?.shortQuote ? `摘录: ${card.source.shortQuote}` : "",
    ].filter(Boolean);
    return {
      type: "create_node",
      id: `qmai-knowledge-${id}`,
      nodeType: "comment",
      name: title,
      placement: { strategy: "in-zone", zone: "dock-left" },
      data: {
        workflowKind: "knowledge_card",
        workflowStep: "qmai_director_card",
        citationKind: "qmai",
        citationProjectId: projectId,
        sourceTitle: title,
        content: contentLines.join("\n"),
        qmaiCardId: id,
        craftDomain: card.craftDomain || "directing",
      },
    };
  });
  return sanitizeDirectorContext(actions);
}

/**
 * Maps a QMAI director storyboard (plus its prompt drafts) onto canvas
 * actions: storyboard-script shot nodes carrying the existing Huanying
 * shot metadata keys, ai-image PREP nodes for text_to_image prompts
 * (creation only — generation must go through the user-confirmed
 * queue), edges from shots to their prep nodes, and a
 * storyboard_grid layout. Never emits generation actions.
 */
export function mapStoryboardToCanvasActions({ storyboard, prompts = [] } = {}) {
  if (storyboard?.schemaVersion !== "director-storyboard/v1") {
    throw new Error("storyboard schemaVersion must be director-storyboard/v1");
  }
  if (!Array.isArray(storyboard.shots) || storyboard.shots.length === 0) {
    throw new Error("storyboard must contain shots");
  }

  const actions = [];

  for (const shot of storyboard.shots) {
    const shotNodeId = `qmai-shot-${shot.id}`;
    actions.push({
      type: "create_node",
      id: shotNodeId,
      nodeType: "storyboard-script",
      name: `${storyboard.title} · ${shot.id}`,
      // Semantic placement (dogfooding the resolver): each shot opens
      // its own production lane in shotNumber order.
      placement: { strategy: "new-lane", topic: String(shot.id) },
      data: {
        storyboardId: storyboard.projectId,
        shotIndex: shot.shotNumber,
        shotPrompt: `${shot.action} | ${shot.visualFocus}`,
        shotContinuity: (shot.continuityAnchors || []).join("; "),
        dramaticBeat: shot.dramaticBeat || "",
        shotSize: shot.shotSize,
        cameraMove: shot.cameraMove,
        durationSeconds: shot.durationSeconds,
        qmaiShotId: shot.id,
      },
    });
  }

  const validShotIds = new Set(storyboard.shots.map((shot) => String(shot.id)));
  for (const prompt of prompts) {
    if (prompt?.target !== "text_to_image") continue;
    // Fail closed on ghost prompts: an edge to a shot node that does
    // not exist would corrupt the canvas graph topology.
    if (!validShotIds.has(String(prompt.shotId))) {
      throw new Error(`prompt ${prompt.id} references a shot outside the storyboard: ${prompt.shotId}`);
    }
    const imageNodeId = `qmai-image-${prompt.id}`;
    actions.push({
      type: "create_node",
      id: imageNodeId,
      nodeType: "ai-image",
      name: `prep · ${prompt.shotId}`,
      // The prep node joins its shot's lane to the right - rows are
      // shots, columns are craft stages.
      placement: { strategy: "right-of", anchor: `qmai-shot-${prompt.shotId}` },
      // Double stamp: the skills executor honors either form, and the
      // claw sanitizer keeps only the top-level form - prep nodes carry
      // a prompt but must never self-ignite (creation only).
      autoStart: false,
      data: {
        prompt: prompt.positivePrompt,
        negativePrompt: prompt.negativePrompt || "",
        model: prompt.modelHint || "",
        continuityAnchors: prompt.continuityAnchors || [],
        qmaiPromptId: prompt.id,
        generationStatus: null,
        autoStart: false,
      },
    });
    actions.push({
      type: "connect_nodes",
      from: `qmai-shot-${prompt.shotId}`,
      to: imageNodeId,
      label: "prompt",
    });
  }

  // The placement resolver owns the layout now; a scoped tidy pass
  // replaces the legacy storyboard_grid layout action as the final
  // alignment sweep.
  actions.push({
    type: "tidy_canvas",
    scope: "all",
  });

  return { actions: sanitizeDirectorContext(actions) };
}

/**
 * Maps a qmai-director-action-package/v0 onto canvas actions. Defense
 * at the boundary even though QMAI refuses to export bad packages:
 * wrong schema, allowRealSend !== false, or any continuity block
 * evidence makes the mapper fail closed.
 */
export function mapActionPackageToCanvasActions(pkg = {}) {
  if (pkg.schemaVersion !== QMAI_ACTION_PACKAGE_SCHEMA_VERSION) {
    throw new Error(`action package schemaVersion must be ${QMAI_ACTION_PACKAGE_SCHEMA_VERSION}`);
  }
  const allowRealSend = pkg.allowRealSend ?? pkg.exportPolicy?.allowRealSend;
  if (allowRealSend !== false) {
    throw new Error("action package allowRealSend must be false in v0");
  }
  const continuity = pkg.continuity || pkg.continuityReport || {};
  const blocks = Array.isArray(continuity.blocks) ? continuity.blocks : [];
  if (continuity.status === "block" || blocks.length > 0) {
    throw new Error("action package carries continuity block evidence and cannot enter the canvas");
  }
  if (!Array.isArray(pkg.actions)) {
    throw new Error("action package actions must be an array");
  }

  const actions = pkg.actions.map((entry, index) => {
    const id = requireText(entry?.id, `actions[${index}].id`);
    const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
    if (entry.type === "prompt") {
      return {
        type: "create_node",
        id: `qmai-pkg-${id}`,
        nodeType: "ai-image",
        name: `package prompt · ${payload.shotId || id}`,
        autoStart: false,
        data: {
          prompt: String(payload.positivePrompt || payload.prompt || ""),
          negativePrompt: String(payload.negativePrompt || ""),
          qmaiPackageId: pkg.packageId,
          qmaiActionId: id,
          generationStatus: null,
          autoStart: false,
        },
      };
    }
    return {
      type: "create_node",
      id: `qmai-pkg-${id}`,
      nodeType: "comment",
      name: `package ${entry.type || "note"} · ${id}`,
      data: {
        workflowKind: "qmai_action_package",
        content: typeof payload.note === "string" ? payload.note : JSON.stringify(payload),
        qmaiPackageId: pkg.packageId,
        qmaiActionId: id,
      },
    };
  });

  return { actions: sanitizeDirectorContext(actions) };
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}
