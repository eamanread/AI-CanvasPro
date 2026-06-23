import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const HUANYING_CANVAS_TOOL_NAME = "huanying_canvas_propose_actions";

export const ALLOWED_HUANYING_ACTION_TYPES = [
  "create_node",
  "update_node_data",
  "rename_node",
  "connect_nodes",
  "layout_nodes",
  "move_nodes",
  "tidy_canvas",
  "focus_nodes",
  "set_viewport",
  "create_group",
  "duplicate_nodes",
  "queue_generation_task",
  "run_prompt_preset_generation",
  "create_workflow_template",
  "apply_workflow_template",
  "submit_workflow_template_review",
  "review_workflow_template",
  "publish_workflow_template",
  "deprecate_workflow_template",
  "rollback_workflow_template",
  "record_workflow_template_reuse"
] ;

const ALLOWED_ACTION_SET = new Set(ALLOWED_HUANYING_ACTION_TYPES);
const DANGEROUS_ACTION_TERMS = [
  "read_file",
  "write_file",
  "edit_file",
  "bash",
  "shell",
  "powershell",
  "browser",
  "package",
  "mcp"
] ;

const SAFE_SKILL_FIELDS = new Set([
  "id",
  "name",
  "version",
  "type",
  "allowedActions",
  "forbiddenActions",
  "requiredContext",
  "triggers",
  "qualityChecks",
  "qualityRules",
  "qualityRubric",
  "riskLevel",
  "requiresConfirmation"
]);

const SECRET_FIELD_PATTERN = /(api|secret|token|key|password|credential)/i;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function readJsonFile(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readTextFile(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function sanitizeSkillDefinition(raw, instructions = "") {
  const id = String(raw.id || "").trim();
  const name = String(raw.name || id || "").trim();
  if (!id || !name || raw.enabled === false) {
    return null;
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!SAFE_SKILL_FIELDS.has(key) || SECRET_FIELD_PATTERN.test(key)) {
      continue;
    }
    sanitized[key] = value;
  }
  const qualityRules = stringList(raw.qualityRules).length
    ? stringList(raw.qualityRules)
    : stringList(raw.qualityRubric);
  return {
    id,
    name,
    version: typeof sanitized.version === "string" ? sanitized.version : undefined,
    type: typeof sanitized.type === "string" ? sanitized.type : undefined,
    allowedActions: stringList(sanitized.allowedActions).filter((action) => ALLOWED_ACTION_SET.has(action)),
    forbiddenActions: stringList(sanitized.forbiddenActions),
    requiredContext: stringList(sanitized.requiredContext),
    triggers: stringList(sanitized.triggers),
    qualityChecks: Array.isArray(sanitized.qualityChecks) ? sanitized.qualityChecks : [],
    qualityRules,
    riskLevel: typeof sanitized.riskLevel === "string" ? sanitized.riskLevel : undefined,
    requiresConfirmation:
      typeof sanitized.requiresConfirmation === "boolean" ? sanitized.requiresConfirmation : undefined,
    instructions
  };
}

export function loadHuanyingSkillDefinitions(skillRoot = "config/assistant-skills-v2") {
  const root = resolve(skillRoot);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const directory = resolve(root, name);
      if (!statSync(directory).isDirectory()) {
        return [];
      }
      const skill = readJsonFile(resolve(directory, "skill.json"));
      if (!skill) {
        return [];
      }
      const instructions = readTextFile(resolve(directory, "instructions.md"));
      const definition = sanitizeSkillDefinition(skill, instructions);
      return definition ? [definition] : [];
    });
}

function clipped(value, max = 360) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function skillRegistryPrompt(skills = []) {
  const usable = skills.filter((skill) => skill && skill.id && skill.name).slice(0, 8);
  if (!usable.length) {
    return [];
  }
  return [
    "Unified Skill Registry v2: before using hard-coded fallbacks, match the user intent against these shared Huanying skills.",
    ...usable.map((skill) => {
      const pieces = [
        `skill=${skill.id}`,
        `name=${skill.name}`,
        skill.allowedActions?.length ? `allowedActions=${skill.allowedActions.join(",")}` : "",
        skill.forbiddenActions?.length ? `forbiddenActions=${skill.forbiddenActions.join(",")}` : "",
        skill.requiredContext?.length ? `requiredContext=${skill.requiredContext.join(",")}` : "",
        skill.qualityRules?.length ? `qualityRules=${skill.qualityRules.slice(0, 4).join(" | ")}` : "",
        skill.riskLevel ? `riskLevel=${skill.riskLevel}` : "",
        typeof skill.requiresConfirmation === "boolean"
          ? `requiresConfirmation=${String(skill.requiresConfirmation)}`
          : "",
        skill.instructions ? `instructions=${clipped(skill.instructions)}` : ""
      ].filter(Boolean);
      return `- ${pieces.join("; ")}`;
    })
  ];
}

function candidateActionNames(action) {
  return ["type", "action", "actionType", "operation", "tool", "toolName"]
    .map((field) => action[field])
    .filter((value) => typeof value === "string");
}

function canonicalActionType(action) {
  const names = ["type", "action", "actionType", "operation"]
    .map((field) => action[field])
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const distinctNames = new Set(names);
  if (distinctNames.size !== 1) {
    return undefined;
  }

  return names[0];
}

function hasDangerousActionName(action) {
  return candidateActionNames(action).some((name) => {
    const normalized = name.trim().toLowerCase();
    return DANGEROUS_ACTION_TERMS.some((term) => normalized.includes(term));
  });
}

export function normalizeProposedActions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((action) => {
    if (!isRecord(action) || hasDangerousActionName(action)) {
      return [];
    }

    const type = canonicalActionType(action);
    if (type === undefined || !ALLOWED_ACTION_SET.has(type)) {
      return [];
    }

    const { action: _action, actionType: _actionType, operation: _operation, ...normalizedAction } = action;
    return [{ ...normalizedAction, type }];
  });
}

export function buildCanvasAgentSystemPrompt(mode, options = {}) {
  const sharedRules = [
    "You are Huanying Canvas Agent, a safe canvas planning assistant for Huanying.",
    "Huanying executes after validation; you only describe or propose canvas actions.",
    "Do not use or request shell, filesystem, browser, network, package, MCP, or project JSON writes.",
    "Video generation requires explicit user authorization before any generation task can start."
  ];

  if (mode === "replyOnly") {
    return [
      ...sharedRules,
      "replyOnly mode: do not propose actions; answer with chat guidance only."
    ].join("\n");
  }

  if (mode === "doctor") {
    return [
      ...sharedRules,
      "Canvas doctor mode: return 3-8 concise diagnostics.",
      "You may propose focus_nodes and create_node comment annotations.",
      "Do not edit prompts, models, assets, or generation tasks.",
      `Only propose actions through ${HUANYING_CANVAS_TOOL_NAME}; never execute them.`
    ].join("\n");
  }

  if (mode === "auto_layout") {
    return [
      ...sharedRules,
      "Auto layout mode: only propose tidy_canvas, layout_nodes, move_nodes, create_group, rename_node, focus_nodes, set_viewport. Prefer tidy_canvas {scope} for whole-canvas or lane cleanups; it aligns zones/lanes/grid deterministically and never moves pinned nodes. Never change prompt/model/assets. Never delete. Never queue or run generation.",
      `Only propose actions through ${HUANYING_CANVAS_TOOL_NAME}; never execute them.`
    ].join("\n");
  }

  return [
    ...sharedRules,
    ...skillRegistryPrompt(options.skills),
    "actions mode: return JSON with reply/actions/warnings/requiresConfirmation.",
    `Only propose actions through ${HUANYING_CANVAS_TOOL_NAME}; never execute them.`,
    `Allowed actions: ${ALLOWED_HUANYING_ACTION_TYPES.join(", ")}.`,
    "Use context.project.preferences when present to keep visualStyle, aspectRatio, preferredModels, naming, and brandVoice consistent; never ask for or expose apiKey, token, secret, or local file paths.",
    "For large canvases, rely on context.canvas.semanticCompression: selectedNodes first, then boundaryNodes, workflowSummaries, generationStatusSummary, and highSignalNodes instead of treating truncated node lists as the whole canvas.",
    "Prompt preset productization: use context.promptPresets catalog metadata and call run_prompt_preset_generation for text/image presets with nodeId, nodeType, presetId or presetName, and inputs; do not paste hidden template text or expose template details; video presets require explicit confirmation before generation.",
    "LLM Wiki knowledge cards: use context.knowledge.llmWiki read-only searchResults/canvasActionHints only; create_node comment or source-text cards with workflowKind=knowledge_card, workflowStep=llm_wiki_card, sourceTitle, fileId, projectId, citation, and citationDisplay; do not write/rescan/save to LLM Wiki and do not invent citations.",
    "Director knowledge cards: searchResults entries with citationKind=qmai are director craft knowledge; when a card's whenToUse matches the request, apply its snippet (the prompt implication) when writing prompts and mention the cardId in the reply; quote the citation text verbatim, never rewrite it.",
    "story_to_video intent: create story_outline, style_bible, 3-8 shot_script, shot_keyframe, and shot_video prep nodes with one workflowGroupId; include shotPrompt and shotVideoPrompt metadata; use storyboard_grid layout; prepare video nodes but do not start video generation without authorization.",
    "Storyboard director edit intent: when the user says only modify shot N, update only nodes with that shotIndex; set storyboardEditScope=single_shot and targetShotIndex; preserve or update shotVisual, shotCamera, shotStyle, shotPrompt, shotVideoPrompt, and shotContinuity; do not rewrite unrelated shots.",
    "User constraints override recipes and intents: when the user explicitly asks not to run, queue, or auto-start generation (for example 只创建节点, 不要生成, 不要排队, 暂不生成, 我自己跑), do not propose queue_generation_task or run_prompt_preset_generation in that turn even if a workflow recipe includes them; only propose create/connect/update/layout actions and tell the user generation is left for them to trigger.",
    "P2 one-sentence workflows: text_to_image = source-text -> ai-image + queue_generation_task + single_chain; image_to_video = source-image -> ai-video prep + single_chain and do not start video generation; text_to_image_video = source-text -> ai-image -> ai-video prep + image queue only + single_chain; image_variants = one source-image to 3 ai-image variants + image queues + branch_flow.",
    "viral_lab intent: analyze provided reference video/image/article attachments, references, or selected assets into a structured remake workflow; set workflowKind=viral_lab plus viralReferenceId, viralSourceType, viralHook, viralPacing, viralStructure, viralRemakeAngle, viralRisk, viralReplicationStep, and optional viralBeatIndex; do not fetch external URLs or copy logos/faces/music/exact timing; create editable analysis/script/keyframe/video-prep nodes, queue only safe text/image generation, and do not start video generation without authorization.",
    "variant_branches intent: use duplicate_nodes to prepare 3-5 variant branches from the selected subgraph; include variants with id/label/difference and groupBranches=true; do not queue generation, do not delete, and do not overwrite the source branch.",
    "Project workflow templates: for explicit template-save intent, propose create_workflow_template with templateId, name, nodeIds, project scope, version, author, tags, and requiresConfirmation=true; for explicit reuse intent, propose apply_workflow_template with templateId. Do not write files, do not push to team libraries, do not queue generation, and do not claim the template was saved until Huanying executor confirms it.",
    "Team template governance: only for explicit team-library intent, use submit_workflow_template_review, review_workflow_template, publish_workflow_template, deprecate_workflow_template, rollback_workflow_template, and record_workflow_template_reuse with templateId, teamId, reviewStatus, reviewer, version, author/tags, reuseCount when known, and strong confirmation; no files/shell/team JSON writes and no generation.",
    "P4 multi-agent planning: when a complex task benefits from division of labor, tag actions with agentRole for storyboard, prompt, layout, generation, or QA; each role must keep least privilege permissions and may not use actions outside its role. Coordinate storyboard -> prompt -> layout -> generation -> QA handoffs without executing anything.",
    "P4 creative hub: compose cross-project workflows from templates, preferences, assets, history, and model capabilities already present in context; do not leak raw paths or secrets.",
    "P4 A/B data loop and enterprise audit: preserve template success, generation success, and user adoption signals when present, and keep traceable audit/export metadata for every AI operation.",
    "P4 model capability routing: prefer models by capabilities such as text, vision, action_planning, low_latency, and high_quality instead of hard-coding one model; cross-device sync uses sanitized project/team snapshots only.",
    "connect_nodes should preserve port semantics when known: include sourceHandle and targetHandle, for example text-output to prompt-input.",
    "Canvas spatial language: the canvas has zones - dock-left (knowledge/reference cards), production (lanes: one row per shot, columns are craft stages script->keyframe->video), results (right band), staging (bottom buffer). To say WHERE a node goes, add the optional create_node placement field: {strategy:'below'|'above'|'left-of'|'right-of'|'near', anchor:'<nodeId>'} or {strategy:'in-zone', zone:'dock-left'|'production'|'results'|'staging'} or {strategy:'new-lane', topic:'<name>'} or {strategy:'append-lane', anchor:'<nodeId>'}. NEVER output pixel coordinates - x/y/position are ignored when placement exists; omit placement when unsure and the system places by rule, recording data.placementReason. Read context.canvas.spatialDigest for ambient awareness; when context.canvas.spatial is present (zones/lanes/cells like r2c3, freeCursor, stats), use it to answer spatial questions and pick anchors instead of guessing."
  ].join("\n");
}

const NO_GEN_ACTION_TYPES = new Set(["queue_generation_task", "run_prompt_preset_generation", "start_generation"]);

/**
 * Deterministic per-turn guard for the user's no-generation constraint.
 * The system-prompt rule is advisory; this is the gate. Returns "all",
 * "video", or "none" describing which generation actions the current
 * user message forbids.
 */
export function noGenerationConstraintScope(message) {
  const text = String(message || "");
  if (!text.trim()) return "none";
  const explicitRun = /(执行|开始|启动|运行|跑)[^。;；！？\n]{0,8}?生成|立即生成|马上生成/.test(text);
  if (explicitRun) return "none";
  const videoScopedNeg = /(不要|别|无需|不用|暂不|先不)[^。;；！？\n]{0,4}(生成视频|视频生成)/.test(text);
  const genericNeg =
    /(绝对不要|请不要|不要|先不|暂不|别|无需|不用)[^。;；！？\n]{0,16}?(生成|排队)/.test(text) ||
    /只(创建|建)[^。;；！？\n]{0,6}节点|我(会)?自己跑/.test(text);
  if (videoScopedNeg && !/任何(的)?生成|包括[^。;；！？\n]{0,10}(文本|图像|图片)/.test(text)) return "video";
  return genericNeg ? "all" : "none";
}

/**
 * Drops generation actions the user's message forbids, mirroring the
 * filtering into actionsByStep, and records an auditable warning.
 */
export function enforceNoGenerationConstraint(message, contract) {
  if (!contract || typeof contract !== "object") return contract;
  const scope = noGenerationConstraintScope(message);
  if (scope === "none") return contract;
  const dropped = new Map();
  const shouldDrop = (action) =>
    action && NO_GEN_ACTION_TYPES.has(action.type) &&
    (scope === "all" || String(action.nodeType || "") === "ai-video");
  let stampedCount = 0;
  const isCreate = (action) =>
    action && (action.type === "create_node" || action.type === "add_node") &&
    (scope === "all" || String(action.nodeType || "") === "ai-video");
  const filterList = (list) =>
    Array.isArray(list)
      ? list
          .filter((action) => {
            if (shouldDrop(action)) {
              dropped.set(`${action.type}:${action.id || action.actionId || dropped.size}`, String(action.type));
              return false;
            }
            return true;
          })
          // Stamp surviving create actions so the Huanying executor's
          // auto-start-on-create policy also honors the constraint.
          .map((action) => {
            if (!isCreate(action)) return action;
            stampedCount += 1;
            // The stamp must ride inside data: the Python action schema
            // strips unknown top-level fields but passes data through.
            return { ...action, autoStart: false, data: { ...(action.data && typeof action.data === "object" ? action.data : {}), autoStart: false } };
          })
      : list;
  const actions = filterList(contract.actions);
  let actionsByStep = contract.actionsByStep;
  if (actionsByStep && typeof actionsByStep === "object" && !Array.isArray(actionsByStep)) {
    actionsByStep = Object.fromEntries(
      Object.entries(actionsByStep).map(([step, list]) => [step, filterList(list)])
    );
  }
  if (!dropped.size && !stampedCount) return contract;
  const warnings = Array.isArray(contract.warnings) ? [...contract.warnings] : [];
  if (dropped.size) {
    warnings.push(
      `User asked not to start generation; dropped ${dropped.size} generation action(s): ${[...dropped.values()].join(", ")}.`
    );
  }
  return { ...contract, actions, actionsByStep, warnings };
}
