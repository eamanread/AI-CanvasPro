import {
  AssistantActionRiskLevel,
  inferAssistantActionRisk,
} from "./assistantActionContract.js";
import {
  AssistantConfirmationDecision,
  summarizeAssistantConfirmation,
} from "./assistantConfirmationPolicy.js";
import {
  CANVAS_SKILL_IDS,
  isAiNodeActionConvertible,
  skillIdForAiAction,
  shouldConfirmCanvasSkillBatch,
} from "./assistantCanvasSkillRegistry.js";

function actionType(action) {
  return String(action?.type || action?.action || action?.actionType || action?.operation || "").trim();
}

function nodeName(action) {
  return String(action?.name || action?.title || action?.nodeId || action?.id || "").trim();
}

function targetName(action) {
  return String(action?.nodeId || action?.targetNodeId || action?.id || "").trim();
}

function countBy(actions, predicate) {
  return actions.filter(predicate).length;
}

function generationKind(action, nodeTypeById = new Map()) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const explicit = String(action?.nodeType || data.nodeType || data.type || "").trim();
  if (explicit) {
    return explicit;
  }
  return nodeTypeById.get(targetName(action)) || "";
}

function promptPresetId(action) {
  const data = actionData(action);
  return String(action?.presetId || action?.preset || data.presetId || data.preset || "").trim();
}

function promptPresetName(action) {
  const data = actionData(action);
  return String(action?.presetName || data.presetName || action?.name || action?.title || "").trim();
}

function promptPresetLabel(action) {
  return promptPresetName(action) || promptPresetId(action) || "preset";
}

function promptPresetInputKeys(action) {
  const inputs = action?.inputs && typeof action.inputs === "object" ? action.inputs : {};
  return Object.keys(inputs).slice(0, 6);
}

function isPromptPresetGeneration(action) {
  return actionType(action) === "run_prompt_preset_generation";
}

function canvasSkillCallForPreview(action, nodeTypeById = new Map()) {
  if (!isAiNodeActionConvertible(action)) {
    return null;
  }
  const type = actionType(action);
  const nodeType = generationKind(action, nodeTypeById);
  let skillId = skillIdForAiAction({ ...action, nodeType });
  if (type === "run_prompt_preset_generation") {
    if (nodeType === "ai-image") skillId = CANVAS_SKILL_IDS.imageGenerate;
    if (nodeType === "ai-text") skillId = CANVAS_SKILL_IDS.textGenerate;
    if (nodeType === "ai-video") skillId = CANVAS_SKILL_IDS.videoGenerate;
  }
  return skillId ? { skillId, nodeType } : null;
}

function selectedCanvasSkillCalls(actions, nodeTypeById) {
  return actions
    .map((action) => canvasSkillCallForPreview(action, nodeTypeById))
    .filter(Boolean);
}

function canvasSkillPreviewOverride(actions, nodeTypeById, { agentMode } = {}) {
  const calls = selectedCanvasSkillCalls(actions, nodeTypeById);
  const generationCalls = calls.filter((call) =>
    [
      CANVAS_SKILL_IDS.imageGenerate,
      CANVAS_SKILL_IDS.textGenerate,
      CANVAS_SKILL_IDS.videoGenerate,
    ].includes(call.skillId)
  );
  if (!calls.length || !generationCalls.length || generationCalls.length !== actions.length) {
    return null;
  }
  return shouldConfirmCanvasSkillBatch(generationCalls, { agentMode })
    ? AssistantConfirmationDecision.Confirm
    : AssistantConfirmationDecision.AutoApply;
}

function workflowStep(action) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  return String(action?.workflowStep || data.workflowStep || "").trim();
}

function actionData(action) {
  return action?.data && typeof action.data === "object" ? action.data : {};
}

function actionMetadata(action) {
  return action?.metadata && typeof action.metadata === "object" ? action.metadata : {};
}

function workflowKind(action) {
  const data = actionData(action);
  const metadata = actionMetadata(action);
  return String(action?.workflowKind || data.workflowKind || metadata.workflowKind || "").trim();
}

function storyboardValue(action, key) {
  const data = actionData(action);
  const metadata = actionMetadata(action);
  return action?.[key] ?? data[key] ?? metadata[key];
}

function storyboardShotIndex(action) {
  const value = Number(storyboardValue(action, "targetShotIndex") ?? storyboardValue(action, "shotIndex"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isStoryboardShotEditAction(action) {
  const type = actionType(action);
  if (!["update_node_data", "set_node_prompt", "rename_node"].includes(type)) {
    return false;
  }
  const scope = String(storyboardValue(action, "storyboardEditScope") || "").trim().toLowerCase();
  return (
    scope === "single_shot" ||
    storyboardValue(action, "targetShotIndex") !== undefined ||
    (
      String(storyboardValue(action, "workflowKind") || "").trim() === "story_to_video" &&
      storyboardShotIndex(action) !== null
    )
  );
}

function storyboardShotEditSummary(actions) {
  const indexes = [
    ...new Set(
      actions
        .map(storyboardShotIndex)
        .filter((index) => index !== null)
    ),
  ].sort((a, b) => a - b);
  if (indexes.length === 1) {
    return `shot ${indexes[0]}`;
  }
  if (indexes.length > 1) {
    return `shots ${indexes.join(", ")}`;
  }
  return `${actions.length} shot edit${actions.length > 1 ? "s" : ""}`;
}

function variantBranchSummary(action) {
  const variants = Array.isArray(action?.variants) ? action.variants.filter(Boolean) : [];
  const explicitCount = Number(action?.branchCount || action?.count || 0);
  const count = variants.length || (Number.isFinite(explicitCount) && explicitCount > 0 ? explicitCount : 0);
  if (!count) {
    return "";
  }
  return `${count} variant branch${count > 1 ? "es" : ""}`;
}

function templateValue(action, key) {
  const data = actionData(action);
  const metadata = actionMetadata(action);
  return action?.[key] ?? data[key] ?? metadata[key];
}

const TEMPLATE_GOVERNANCE_ACTION_TYPES = new Set([
  "create_workflow_template",
  "apply_workflow_template",
  "submit_workflow_template_review",
  "review_workflow_template",
  "publish_workflow_template",
  "deprecate_workflow_template",
  "rollback_workflow_template",
  "record_workflow_template_reuse",
]);

function templateId(action) {
  return String(templateValue(action, "templateId") || templateValue(action, "id") || "").trim();
}

function templateLabel(action) {
  return String(action?.name || action?.title || templateValue(action, "templateName") || templateId(action) || "").trim();
}

function templateTags(action) {
  const tags = templateValue(action, "tags");
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 6);
  }
  const text = String(tags || "").trim();
  return text ? [text] : [];
}

function workflowTemplateSummary(action) {
  const pieces = [
    templateId(action),
    templateLabel(action),
    templateValue(action, "scope"),
    templateValue(action, "teamId"),
    templateValue(action, "version"),
    templateValue(action, "author"),
    templateValue(action, "reviewStatus"),
    templateValue(action, "reviewer"),
    templateValue(action, "reviewedBy"),
    templateValue(action, "publishedBy"),
    templateValue(action, "deprecatedReason"),
    templateValue(action, "rollbackToVersion"),
    templateValue(action, "reuseCount"),
    ...templateTags(action),
  ]
    .map((piece) => String(piece || "").trim())
    .filter(Boolean);
  return [...new Set(pieces)].join(" - ");
}

function isDiagnosticAction(action) {
  return Boolean(action?.diagnosticKind || action?.diagnosticSeverity || action?.diagnosticSuggestion);
}

function isPromptSurgeryAction(action) {
  const type = actionType(action);
  if (!["update_node_data", "set_node_prompt"].includes(type)) {
    return false;
  }
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  const patch = action?.patch && typeof action.patch === "object" ? action.patch : {};
  return Boolean(
    action?.previousPrompt !== undefined ||
      action?.nextPrompt !== undefined ||
      action?.promptDiff ||
      action?.undoPatch ||
      action?.prompt !== undefined ||
      data.prompt !== undefined ||
      patch.prompt !== undefined
  );
}

function promptDiffText(action) {
  return String(action?.promptDiff || action?.diff || "").trim();
}

function hasWorkflowKind(actions, kind) {
  return actions.some((action) => workflowKind(action) === kind);
}

function actionTitle(action) {
  const type = actionType(action);
  if (type === "connect_nodes") {
    return `${action?.from || action?.source || "?"} -> ${action?.to || action?.target || "?"}`;
  }
  if (type === "layout_nodes") {
    return `Layout ${String(action?.layout || "nodes")}`;
  }
  if (type === "focus_nodes") {
    const count = Array.isArray(action?.nodeIds) ? action.nodeIds.length : 0;
    return `Focus ${count || 1} node${count > 1 ? "s" : ""}`;
  }
  if (type === "run_prompt_preset_generation") {
    return `Prompt preset ${promptPresetLabel(action)} -> ${targetName(action) || "target"}`;
  }
  if (type === "queue_generation_task") {
    return `${generationKind(action) || "generation"} ${targetName(action) || "target"}`.trim();
  }
  if (type === "create_workflow_template") {
    return `Workflow template ${templateLabel(action) || templateId(action) || "save"}`;
  }
  if (type === "apply_workflow_template") {
    return `Apply workflow template ${templateLabel(action) || templateId(action) || "reuse"}`;
  }
  if (type === "submit_workflow_template_review") {
    return `Submit workflow template ${templateLabel(action) || templateId(action) || "review"}`;
  }
  if (type === "review_workflow_template") {
    return `Review workflow template ${templateLabel(action) || templateId(action) || "review"}`;
  }
  if (type === "publish_workflow_template") {
    return `Publish workflow template ${templateLabel(action) || templateId(action) || "publish"}`;
  }
  if (type === "deprecate_workflow_template") {
    return `Deprecate workflow template ${templateLabel(action) || templateId(action) || "deprecate"}`;
  }
  if (type === "rollback_workflow_template") {
    return `Rollback workflow template ${templateLabel(action) || templateId(action) || "rollback"}`;
  }
  if (type === "record_workflow_template_reuse") {
    return `Record workflow template reuse ${templateLabel(action) || templateId(action) || "reuse"}`;
  }
  if (type === "duplicate_nodes") {
    return variantBranchSummary(action) || "Variant branches";
  }
  return nodeName(action) || targetName(action) || type || "Canvas action";
}

function diagnosticNodeList(action) {
  if (Array.isArray(action?.diagnosticNodeIds)) {
    return action.diagnosticNodeIds.join(", ");
  }
  if (Array.isArray(action?.nodeIds)) {
    return action.nodeIds.join(", ");
  }
  return String(action?.nodeId || action?.targetNodeId || "").trim();
}

function actionSubtitle(action) {
  const pieces = [
    action?.diagnosticKind || "",
    action?.diagnosticSeverity || "",
    diagnosticNodeList(action),
    action?.diagnosticSuggestion || "",
    storyboardValue(action, "storyboardEditScope") || "",
    storyboardValue(action, "targetShotIndex") ? `shot ${storyboardValue(action, "targetShotIndex")}` : "",
    storyboardValue(action, "shotIndex") ? `shot ${storyboardValue(action, "shotIndex")}` : "",
    storyboardValue(action, "shotTitle") || "",
    storyboardValue(action, "shotCamera") || "",
    storyboardValue(action, "shotStyle") || "",
    storyboardValue(action, "shotContinuity") || "",
    storyboardValue(action, "workflowKind") || "",
    storyboardValue(action, "viralReferenceId") || "",
    storyboardValue(action, "viralSourceType") || "",
    storyboardValue(action, "viralHook") || "",
    storyboardValue(action, "viralPacing") || "",
    storyboardValue(action, "viralStructure") || "",
    storyboardValue(action, "viralRemakeAngle") || "",
    storyboardValue(action, "viralRisk") || "",
    storyboardValue(action, "viralReplicationStep") || "",
    storyboardValue(action, "viralBeatIndex") ? `beat ${storyboardValue(action, "viralBeatIndex")}` : "",
    storyboardValue(action, "sourceTitle") || "",
    storyboardValue(action, "sourceName") || "",
    storyboardValue(action, "knowledgeTitle") || "",
    storyboardValue(action, "fileId") || "",
    storyboardValue(action, "sourceFileId") || "",
    storyboardValue(action, "knowledgeFileId") || "",
    storyboardValue(action, "projectId") || "",
    storyboardValue(action, "sourceProjectId") || "",
    storyboardValue(action, "knowledgeProjectId") || "",
    storyboardValue(action, "citation") || "",
    storyboardValue(action, "citationDisplay") || "",
    storyboardValue(action, "summary") || "",
    promptPresetName(action),
    promptPresetId(action),
    promptPresetInputKeys(action).length ? `inputs: ${promptPresetInputKeys(action).join(", ")}` : "",
    workflowTemplateSummary(action),
    generationKind(action) || action?.nodeType || "",
    variantBranchSummary(action),
    workflowStep(action),
    actionType(action),
  ]
    .map((piece) => String(piece || "").trim())
    .filter(Boolean);
  return [...new Set(pieces)].join(" - ");
}

function groupActions(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const diagnostics = list.filter(isDiagnosticAction);
  const nonDiagnostic = list.filter((action) => !isDiagnosticAction(action));
  const storyboardShotEdits = nonDiagnostic.filter(isStoryboardShotEditAction);
  const nonStoryboardShotEdit = nonDiagnostic.filter((action) => !isStoryboardShotEditAction(action));
  const promptSurgery = nonStoryboardShotEdit.filter(isPromptSurgeryAction);
  const nonPromptSurgery = nonStoryboardShotEdit.filter((action) => !isPromptSurgeryAction(action));
  return {
    diagnostics,
    storyboardShotEdits,
    promptSurgery,
    createNodes: nonPromptSurgery.filter((action) => actionType(action) === "create_node"),
    connectNodes: nonPromptSurgery.filter((action) => actionType(action) === "connect_nodes"),
    updateNodes: nonPromptSurgery.filter((action) =>
      ["update_node_data", "rename_node", "set_node_prompt", "set_node_model"].includes(actionType(action))
    ),
    layout: nonPromptSurgery.filter((action) => ["layout_nodes", "focus_nodes", "select_nodes", "zoom_to_fit", "set_viewport", "move_nodes"].includes(actionType(action))),
    generation: nonPromptSurgery.filter((action) =>
      ["queue_generation_task", "run_prompt_preset_generation"].includes(actionType(action))
    ),
    workflow: nonPromptSurgery.filter((action) =>
      TEMPLATE_GOVERNANCE_ACTION_TYPES.has(actionType(action)) ||
      ["create_storyboard", "create_variant_branch", "duplicate_nodes"].includes(actionType(action))
    ),
    other: nonPromptSurgery.filter((action) => {
      const type = actionType(action);
      return ![
        "create_node",
        "connect_nodes",
        "update_node_data",
        "rename_node",
        "set_node_prompt",
        "set_node_model",
        "layout_nodes",
        "focus_nodes",
        "select_nodes",
        "zoom_to_fit",
        "set_viewport",
        "move_nodes",
        "queue_generation_task",
        "run_prompt_preset_generation",
        ...TEMPLATE_GOVERNANCE_ACTION_TYPES,
        "create_storyboard",
        "create_variant_branch",
        "duplicate_nodes",
      ].includes(type);
    }),
  };
}

function buildCreatedNodeTypeMap(actions) {
  const nodeTypes = new Map();
  for (const action of Array.isArray(actions) ? actions : []) {
    if (actionType(action) !== "create_node") {
      continue;
    }
    const kind = generationKind(action);
    const id = targetName(action);
    if (id && kind) {
      nodeTypes.set(id, kind);
    }
  }
  return nodeTypes;
}

function sampleNames(actions, mapper) {
  return actions
    .map(mapper)
    .filter(Boolean)
    .slice(0, 3);
}

function buildSectionActions(list, actions, selectedSet) {
  return actions.map((action) => {
    const index = list.indexOf(action);
    const disabledReason = String(action?.disabledReason || "").trim();
    const item = {
      index,
      actionId: String(action?.actionId || action?.id || `act_${index + 1}`),
      type: actionType(action),
      title: actionTitle(action),
      subtitle: actionSubtitle(action),
      selected: selectedSet.has(index),
      disabledReason,
    };
    const diff = promptDiffText(action);
    if (diff) {
      item.diff = diff;
    }
    if (action?.undoPatch && typeof action.undoPatch === "object") {
      item.hasUndoPatch = true;
    }
    return item;
  });
}

export function buildAssistantActionPreviewModel(actions = [], options = {}) {
  const list = Array.isArray(actions) ? actions : [];
  const normalizedAgentMode = options.agentMode === "act" ? "act" : "plan";
  const createdNodeTypes = buildCreatedNodeTypeMap(list);
  const selectedIndexes = Array.isArray(options.selectedIndexes)
    ? options.selectedIndexes
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < list.length)
    : list.map((_, index) => index);
  const selectedSet = new Set(selectedIndexes);
  const selectedActions = list.filter((_, index) => selectedSet.has(index));
  const groups = groupActions(list);
  const selectedGroups = groupActions(selectedActions);
  const highRiskCount = countBy(selectedActions, (action) => inferAssistantActionRisk(action) === AssistantActionRiskLevel.High);
  const mediumRiskCount = countBy(selectedActions, (action) => inferAssistantActionRisk(action) === AssistantActionRiskLevel.Medium);
  const videoGenerationCount = countBy(
    selectedGroups.generation,
    (action) => generationKind(action, createdNodeTypes) === "ai-video"
  );
  const diagnosticCount = groups.diagnostics.length;
  const highSeverityDiagnosticCount = countBy(
    selectedGroups.diagnostics,
    (action) => String(action?.diagnosticSeverity || "").trim().toLowerCase() === "high"
  );
  const canvasConfirmation = canvasSkillPreviewOverride(selectedActions, createdNodeTypes, {
    agentMode: normalizedAgentMode,
  });
  const confirmation = canvasConfirmation || summarizeAssistantConfirmation(selectedActions, options);
  const requiresStrongConfirmation =
    videoGenerationCount > 0 ||
    (normalizedAgentMode !== "act" && confirmation === AssistantConfirmationDecision.StrongConfirm);
  const sections = [];

  const pushSection = (id, title, actionsForSection, items, risk) => {
    if (!actionsForSection.length) {
      return;
    }
    sections.push({
      id,
      title,
      items,
      actions: buildSectionActions(list, actionsForSection, selectedSet),
      risk,
    });
  };

  pushSection(
    "diagnostics",
    `Review ${groups.diagnostics.length} canvas diagnostic${groups.diagnostics.length > 1 ? "s" : ""}`,
    groups.diagnostics,
    sampleNames(groups.diagnostics, (action) => action.diagnosticKind || action.diagnosticSuggestion || actionType(action)),
    AssistantActionRiskLevel.Low
  );
  pushSection(
    "storyboard_shot_edit",
    `Storyboard shot edit: ${storyboardShotEditSummary(groups.storyboardShotEdits)}`,
    groups.storyboardShotEdits,
    sampleNames(groups.storyboardShotEdits, (action) =>
      storyboardValue(action, "shotTitle") || `shot ${storyboardShotIndex(action) || ""}`.trim() || targetName(action)
    ),
    AssistantActionRiskLevel.Medium
  );
  pushSection(
    "prompt_surgery",
    `Prompt surgery: review ${groups.promptSurgery.length} prompt diff${groups.promptSurgery.length > 1 ? "s" : ""}`,
    groups.promptSurgery,
    sampleNames(groups.promptSurgery, (action) => targetName(action) || promptDiffText(action)),
    AssistantActionRiskLevel.Medium
  );
  pushSection(
    "create_nodes",
    hasWorkflowKind(groups.createNodes, "knowledge_card")
      ? `Knowledge card: create ${groups.createNodes.length} node${groups.createNodes.length > 1 ? "s" : ""}`
      : hasWorkflowKind(groups.createNodes, "viral_lab")
      ? `Viral Lab remake workflow: create ${groups.createNodes.length} node${groups.createNodes.length > 1 ? "s" : ""}`
      : `Create ${groups.createNodes.length} node${groups.createNodes.length > 1 ? "s" : ""}`,
    groups.createNodes,
    sampleNames(groups.createNodes, nodeName),
    AssistantActionRiskLevel.Medium
  );
  pushSection(
    "connect_nodes",
    `Connect ${groups.connectNodes.length} edge${groups.connectNodes.length > 1 ? "s" : ""}`,
    groups.connectNodes,
    sampleNames(groups.connectNodes, (action) => `${action.from || action.source || "?"} -> ${action.to || action.target || "?"}`),
    AssistantActionRiskLevel.Medium
  );
  pushSection(
    "update_nodes",
    `Update ${groups.updateNodes.length} node${groups.updateNodes.length > 1 ? "s" : ""}`,
    groups.updateNodes,
    sampleNames(groups.updateNodes, targetName),
    AssistantActionRiskLevel.Medium
  );
  pushSection(
    "layout",
    `Adjust view/layout with ${groups.layout.length} action${groups.layout.length > 1 ? "s" : ""}`,
    groups.layout,
    sampleNames(groups.layout, (action) => action.layout || actionType(action)),
    AssistantActionRiskLevel.Low
  );
  pushSection(
    "generation",
    groups.generation.some(isPromptPresetGeneration)
      ? `Prompt preset generation: run ${groups.generation.filter(isPromptPresetGeneration).length} preset${groups.generation.filter(isPromptPresetGeneration).length > 1 ? "s" : ""}`
      : `Queue ${groups.generation.length} generation task${groups.generation.length > 1 ? "s" : ""}`,
    groups.generation,
    sampleNames(groups.generation, (action) =>
      isPromptPresetGeneration(action)
        ? `${promptPresetLabel(action)} - ${targetName(action) || "target"}`
        : `${generationKind(action, createdNodeTypes) || "generation"} - ${targetName(action) || "target"}`
    ),
    videoGenerationCount ? AssistantActionRiskLevel.High : AssistantActionRiskLevel.Medium
  );
  pushSection(
    "workflow",
    groups.workflow.some((action) => ["create_workflow_template", "apply_workflow_template"].includes(actionType(action)))
      ? `Workflow template: review ${groups.workflow.length} template action${groups.workflow.length > 1 ? "s" : ""}`
      : groups.workflow.some((action) => TEMPLATE_GOVERNANCE_ACTION_TYPES.has(actionType(action)))
      ? `Team template governance: review ${groups.workflow.length} template action${groups.workflow.length > 1 ? "s" : ""}`
      : groups.workflow.some((action) => actionType(action) === "duplicate_nodes")
      ? `Prepare ${groups.workflow.length} workflow/variant action${groups.workflow.length > 1 ? "s" : ""}`
      : `Prepare ${groups.workflow.length} workflow action${groups.workflow.length > 1 ? "s" : ""}`,
    groups.workflow,
    sampleNames(groups.workflow, (action) => workflowTemplateSummary(action) || variantBranchSummary(action) || action.name || action.template || actionType(action)),
    AssistantActionRiskLevel.High
  );
  pushSection(
    "other",
    `${groups.other.length} additional action${groups.other.length > 1 ? "s" : ""}`,
    groups.other,
    sampleNames(groups.other, actionType),
    AssistantActionRiskLevel.Medium
  );

  return {
    actionCount: list.length,
    selectedActionCount: selectedActions.length,
    selectedIndexes,
    sections,
    riskSummary: {
      high: highRiskCount,
      medium: mediumRiskCount,
      low: selectedActions.length - highRiskCount - mediumRiskCount,
      videoGeneration: videoGenerationCount,
      diagnostics: diagnosticCount,
      highSeverityDiagnostics: highSeverityDiagnosticCount,
    },
    confirmation,
    requiresStrongConfirmation,
    requiresConfirmation:
      requiresStrongConfirmation ||
      (normalizedAgentMode !== "act" && confirmation === AssistantConfirmationDecision.Confirm),
  };
}

export function formatAssistantActionPreviewModel(model) {
  if (!model || !model.actionCount) {
    return "";
  }
  const lines = [];
  lines.push(`Preview ${model.actionCount} canvas action${model.actionCount > 1 ? "s" : ""}:`);
  if (model.selectedActionCount !== undefined && model.selectedActionCount !== model.actionCount) {
    lines.push(`${model.selectedActionCount} selected, ${model.actionCount - model.selectedActionCount} skipped.`);
  }
  for (const section of model.sections || []) {
    lines.push(`- ${section.title}`);
    if (section.items?.length) {
      lines.push(`  ${section.items.join("; ")}`);
    }
  }
  if (model.riskSummary?.diagnostics) {
    lines.push(`Canvas doctor: ${model.riskSummary.diagnostics} diagnostic action${model.riskSummary.diagnostics > 1 ? "s" : ""}.`);
    if (model.riskSummary.highSeverityDiagnostics) {
      lines.push(`High severity: ${model.riskSummary.highSeverityDiagnostics}.`);
    }
  }
  if (model.riskSummary?.videoGeneration && model.requiresStrongConfirmation) {
    lines.push(`Strong confirmation required for ${model.riskSummary.videoGeneration} video generation task${model.riskSummary.videoGeneration > 1 ? "s" : ""}.`);
  } else if (model.requiresConfirmation) {
    lines.push("Confirmation required before applying these changes.");
  }
  const promptDiffs = (model.sections || [])
    .filter((section) => section.id === "prompt_surgery")
    .flatMap((section) => section.actions || [])
    .map((action) => action.diff)
    .filter(Boolean)
    .slice(0, 3);
  if (promptDiffs.length) {
    lines.push("Prompt diff:");
    lines.push(promptDiffs.join("\n---\n"));
  }
  return lines.join("\n");
}
