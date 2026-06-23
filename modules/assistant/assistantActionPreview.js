function countBy(actions, predicate) {
  return actions.filter(predicate).length;
}

function dataOf(action) {
  return action?.data && typeof action.data === "object" ? action.data : {};
}

function metadataOf(action) {
  return action?.metadata && typeof action.metadata === "object" ? action.metadata : {};
}

function metadataValue(action, key) {
  const data = dataOf(action);
  const metadata = metadataOf(action);
  return action?.[key] ?? data[key] ?? metadata[key];
}

function shotIndexOf(action) {
  const value = Number(metadataValue(action, "targetShotIndex") ?? metadataValue(action, "shotIndex"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function promptPresetName(action) {
  const data = dataOf(action);
  return String(action?.presetName || data.presetName || action?.name || action?.title || "").trim();
}

function promptPresetId(action) {
  const data = dataOf(action);
  return String(action?.presetId || action?.preset || data.presetId || data.preset || "").trim();
}

function promptPresetLabel(action) {
  return promptPresetName(action) || promptPresetId(action) || "preset";
}

function promptPresetLabels(actions) {
  return [
    ...new Set(
      actions
        .filter((action) => action?.type === "run_prompt_preset_generation")
        .map(promptPresetLabel)
        .filter(Boolean)
    ),
  ];
}

function knowledgeValue(action, key) {
  return String(metadataValue(action, key) || "").trim();
}

function knowledgeSourceLabel(action) {
  const title =
    knowledgeValue(action, "sourceTitle") ||
    knowledgeValue(action, "sourceName") ||
    knowledgeValue(action, "knowledgeTitle") ||
    knowledgeValue(action, "title");
  const fileId =
    knowledgeValue(action, "fileId") ||
    knowledgeValue(action, "sourceFileId") ||
    knowledgeValue(action, "knowledgeFileId");
  const projectId =
    knowledgeValue(action, "projectId") ||
    knowledgeValue(action, "sourceProjectId") ||
    knowledgeValue(action, "knowledgeProjectId");
  const citation = knowledgeValue(action, "citation");
  const display = knowledgeValue(action, "citationDisplay") || [title, fileId ? `(${fileId})` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  return [display || title, projectId, citation].filter(Boolean).join(" - ");
}

function knowledgeSourceLabels(actions) {
  return [
    ...new Set(
      actions
        .filter((action) => metadataValue(action, "workflowKind") === "knowledge_card")
        .map(knowledgeSourceLabel)
        .filter(Boolean)
    ),
  ];
}

function isStoryboardShotEdit(action) {
  if (!["update_node_data", "set_node_prompt", "rename_node"].includes(action?.type)) {
    return false;
  }
  const scope = String(metadataValue(action, "storyboardEditScope") || "").trim();
  return (
    scope === "single_shot" ||
    metadataValue(action, "targetShotIndex") !== undefined ||
    (metadataValue(action, "workflowKind") === "story_to_video" && shotIndexOf(action) !== null)
  );
}

function storyboardShotEditSummary(actions) {
  const editActions = actions.filter(isStoryboardShotEdit);
  if (!editActions.length) {
    return null;
  }
  const indexes = [...new Set(editActions.map(shotIndexOf).filter((index) => index !== null))].sort((a, b) => a - b);
  return {
    storyboardEditScope: "single_shot",
    targetShotIndex: indexes.length === 1 ? indexes[0] : null,
    editActionCount: editActions.length,
  };
}

export function detectWorkflowKind(actions = []) {
  for (const action of actions || []) {
    const candidates = [
      action?.data?.metadata,
      action?.data,
      action?.metadata,
      action,
    ];
    for (const data of candidates) {
      if (data?.workflowKind) {
        return data.workflowKind;
      }
    }
  }
  return "";
}

export function workflowLabel(kind) {
  if (kind === "story_to_video") {
    return "故事视频工作流";
  }
  if (kind === "text_to_image") {
    return "文生图工作流";
  }
  if (kind === "image_to_video") {
    return "图生视频工作流";
  }
  if (kind === "text_to_image_video") {
    return "图文视频工作流";
  }
  if (kind === "image_variants") {
    return "图片变体工作流";
  }
  if (kind === "viral_lab") {
    return "Viral Lab remake workflow";
  }
  if (kind === "knowledge_card") {
    return "Knowledge card";
  }
  if (kind) {
    return "工作流";
  }
  return "画布操作";
}

export function summarizeAssistantActions(actions = []) {
  const safeActions = Array.isArray(actions) ? actions : [];
  const workflowKind = detectWorkflowKind(safeActions);
  const shotEdit = storyboardShotEditSummary(safeActions);
  const nodeCount = countBy(safeActions, (action) => action?.type === "create_node");
  const updateCount = countBy(
    safeActions,
    (action) => action?.type === "update_node_data" || action?.type === "set_node_prompt" || action?.type === "rename_node"
  );
  const edgeCount = countBy(safeActions, (action) => action?.type === "connect_nodes");
  const generationTaskCount = countBy(
    safeActions,
    (action) =>
      (action?.type === "queue_generation_task" ||
        action?.type === "run_prompt_preset_generation") &&
      action?.nodeType !== "ai-video"
  );
  const promptPresetGenerationCount = countBy(
    safeActions,
    (action) => action?.type === "run_prompt_preset_generation" && action?.nodeType !== "ai-video"
  );
  const videoTaskCount = countBy(
    safeActions,
    (action) =>
      (action?.type === "queue_generation_task" ||
        action?.type === "run_prompt_preset_generation") &&
      action?.nodeType === "ai-video"
  );
  const presetLabels = promptPresetLabels(safeActions);
  const knowledgeLabels = knowledgeSourceLabels(safeActions);
  const title = shotEdit
    ? "Storyboard shot edit"
    : promptPresetGenerationCount > 0 && !workflowKind
      ? "Prompt preset generation"
      : workflowLabel(workflowKind);
  const parts = shotEdit
    ? [
        `Will update ${updateCount} nodes for ${
          shotEdit.targetShotIndex ? `shot ${shotEdit.targetShotIndex}` : "the selected shot"
        }.`,
      ]
    : [`将创建 ${nodeCount} 个节点，连接 ${edgeCount} 条线。`];
  if (!shotEdit && promptPresetGenerationCount > 0) {
    parts.push(`Prompt presets: ${presetLabels.slice(0, 3).join(", ")}. `);
  }
  if (!shotEdit && workflowKind === "knowledge_card" && knowledgeLabels.length) {
    parts.push(`Sources: ${knowledgeLabels.slice(0, 3).join(", ")}. `);
  }
  if (generationTaskCount > 0) {
    parts.push(`文本/图片生成将自动执行 ${generationTaskCount} 个任务。`);
  }
  if (!shotEdit && (workflowKind === "story_to_video" || workflowKind === "image_to_video" || workflowKind === "text_to_image_video" || workflowKind === "viral_lab" || videoTaskCount > 0)) {
    parts.push("视频生成仍需确认。");
  }
  return {
    workflowKind,
    storyboardEditScope: shotEdit?.storyboardEditScope,
    targetShotIndex: shotEdit?.targetShotIndex,
    promptPresetGenerationCount,
    promptPresetLabels: presetLabels,
    title,
    nodeCount,
    updateCount,
    edgeCount,
    generationTaskCount,
    videoTaskCount,
    description: parts.join(""),
  };
}

function generationLifecycleReceipt(result = {}) {
  const parts = [];
  const started = Array.isArray(result.startedGenerationNodeIds) ? result.startedGenerationNodeIds.length : 0;
  const queued = Array.isArray(result.queuedGenerationNodeIds) ? result.queuedGenerationNodeIds.length : 0;
  const waitingVideo = Array.isArray(result.skippedVideoGenerationNodeIds)
    ? result.skippedVideoGenerationNodeIds.length
    : 0;
  const completed = Array.isArray(result.completedGenerationNodeIds) ? result.completedGenerationNodeIds.length : 0;
  const failed = Array.isArray(result.failedGenerationNodeIds) ? result.failedGenerationNodeIds.length : 0;
  if (started > 0) {
    parts.push(`Started ${started} text/image generation task${started === 1 ? "" : "s"}.`);
  } else if (queued > 0) {
    parts.push(`Submitted ${queued} generation task${queued === 1 ? "" : "s"}; waiting for canvas state.`);
  }
  if (waitingVideo > 0) {
    parts.push(`${waitingVideo} video task${waitingVideo === 1 ? "" : "s"} waiting for confirmation.`);
  }
  if (completed > 0) {
    parts.push(`Completed ${completed} generation task${completed === 1 ? "" : "s"}.`);
  }
  if (failed > 0) {
    parts.push(`Failed ${failed} generation task${failed === 1 ? "" : "s"}; queued nodes can be retried.`);
  }
  return parts.join(" ");
}

function knowledgeCardReceipt(result = {}) {
  const cards = Array.isArray(result.knowledgeCards) ? result.knowledgeCards : [];
  if (!cards.length) {
    return "";
  }
  const labels = cards
    .map((card) => {
      const title = String(card?.citationDisplay || card?.title || "").trim();
      const fileId = String(card?.fileId || "").trim();
      const projectId = String(card?.projectId || "").trim();
      const citation = String(card?.citation || "").trim();
      return [title || fileId, projectId, citation].filter(Boolean).join(" - ");
    })
    .filter(Boolean)
    .slice(0, 3);
  return labels.length ? `Knowledge sources: ${labels.join("; ")}.` : "";
}

export function buildAssistantActionReceipt({ actions = [], result = {} } = {}) {
  const summary = summarizeAssistantActions(actions);
  const applied = Number(result.appliedCount ?? actions.length ?? 0);
  const lifecycle = generationLifecycleReceipt(result);
  const knowledge = knowledgeCardReceipt(result);
  return `${summary.title}: applied ${applied}. ${summary.description}${lifecycle ? ` ${lifecycle}` : ""}${knowledge ? ` ${knowledge}` : ""}`;
}
