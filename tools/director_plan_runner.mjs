// Director plan runner: the L3 compile entry with filesystem access.
// Reads a QMAI project directory (read-only), derives knowledge cards from
// memory entries, picks up optional director artifacts exported next to the
// project (storyboard.json / action-package.json / continuity-report.json),
// runs buildDirectorBrainCanvasPlan (continuity gate included) and wraps the
// result as a v2 assistant response so the whole execution workbench
// (drawer/queue/undo/confirmation/skill enforcement) is reused as-is.
// CLI: echo '{"message":"..."}' | node tools/director_plan_runner.mjs
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDirectorBrainCanvasPlan } from "../modules/directorBrain/directorBrainService.js";
import { validateDirectorIntent } from "../modules/directorBrain/directorIntent.js";
import { loadDirectorMemoryExport } from "../modules/directorBrain/directorMemoryExportLoader.js";

const KNOWLEDGE_CARD_LIMIT = 6;

async function readOptionalJson(directory, fileName) {
  try {
    const raw = await readFile(join(directory, fileName), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Degraded fallback ONLY: fabricates thin cards from memory entries
// when no envelope carries real director-knowledge-card/v1 cards.
// The degradation is surfaced in reply + warnings (iron rule 1).
function knowledgeCardsFromMemory(memory) {
  return (memory.entries || []).slice(0, KNOWLEDGE_CARD_LIMIT).map((entry) => ({
    id: entry.id,
    title: entry.title,
    craftDomain: entry.type || "directing",
    source: { shortQuote: String(entry.text || "").slice(0, 160) },
  }));
}

// The single-envelope contract (qmai-director-export/v1) is the
// preferred memory source: when HY_QMAI_PROJECT_DIR points at a
// directory, QMAI's headless export drops the envelope at the project
// root - prefer it (full-field knowledge cards included) and fall
// back to the directory layouts otherwise.
async function loadProjectMemory(projectPath) {
  if (projectPath.toLowerCase().endsWith(".json")) {
    return { memory: await loadDirectorMemoryExport(projectPath), envelopeFile: projectPath };
  }
  const envelopeFile = join(projectPath, "qmai-director-export.json");
  try {
    return { memory: await loadDirectorMemoryExport(envelopeFile), envelopeFile };
  } catch {
    return { memory: await loadDirectorMemoryExport(projectPath), envelopeFile: null };
  }
}

async function fileMtimeMs(filePath) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return null;
  }
}

function bucketActions(actions) {
  const buckets = { step_cards: [], step_shots: [], step_layout: [] };
  for (const action of actions) {
    if (action.type === "layout_nodes" || action.type === "tidy_canvas") {
      buckets.step_layout.push(action);
    } else if (String(action.id || "").startsWith("qmai-knowledge-")) {
      buckets.step_cards.push(action);
    } else {
      buckets.step_shots.push(action);
    }
  }
  return buckets;
}

async function writeToDirectorInbox(projectPath, fileName, payload) {
  const inboxDir = join(projectPath, "director", "inbox");
  await mkdir(inboxDir, { recursive: true });
  await writeFile(join(inboxDir, fileName), JSON.stringify(payload, null, 2), "utf8");
  return `director/inbox/${fileName}`;
}

// The eye uplink (L6 -> L2): persists canvas-dailies/v1 into the QMAI
// inbox so dailies review can critique what the canvas actually
// produced. Fail-closed on schema and empty nodes.
async function handleDailiesMode({ projectPath, dailies }) {
  const acceptedDailiesVersions = new Set(["canvas-dailies/v1", "canvas-dailies/v2"]);
  if (!dailies || typeof dailies !== "object" || !acceptedDailiesVersions.has(dailies.schemaVersion)) {
    return { success: false, error: "dailies payload must be canvas-dailies/v1 or canvas-dailies/v2" };
  }
  if (!Array.isArray(dailies.nodes) || dailies.nodes.length === 0) {
    return { success: false, error: "dailies payload must contain nodes" };
  }
  const tag = typeof dailies.flowId === "string" && dailies.flowId.trim()
    ? dailies.flowId.trim()
    : Date.now().toString(36);
  const savedTo = await writeToDirectorInbox(projectPath, `canvas-dailies-${tag}.json`, dailies);
  return { success: true, savedTo, nodeCount: dailies.nodes.length };
}

// director-knowledge-projection/v1: full-field envelope cards
// projected into the llmWiki searchResults entry shape. Scalar-only
// by contract - both context sanitizers drop arrays, so whenToUse is
// joined here.
function projectKnowledgeCards(cards) {
  return cards.map((card) => ({
    title: String(card.title || ""),
    snippet: String(card.promptImplication || card.principle || ""),
    citation: String(card.source?.shortQuote || ""),
    citationKind: "qmai",
    cardId: String(card.id || ""),
    craftDomain: String(card.craftDomain || "directing"),
    whenToUse: Array.isArray(card.whenToUse) ? card.whenToUse.join("、") : String(card.whenToUse || ""),
  }));
}

async function handleKnowledgeMode({ projectPath }) {
  const exportedAt = new Date().toISOString();
  let memory;
  try {
    ({ memory } = await loadProjectMemory(projectPath));
  } catch (error) {
    // Fail-open: knowledge injection is an enhancement, not a gate.
    return {
      success: true,
      schemaVersion: "director-knowledge-projection/v1",
      cards: [],
      exportedAt,
      warning: `knowledge projection unavailable: ${error?.message || error}`,
    };
  }
  const cards = Array.isArray(memory.knowledgeCards) ? memory.knowledgeCards : [];
  return {
    success: true,
    schemaVersion: "director-knowledge-projection/v1",
    cards: projectKnowledgeCards(cards),
    exportedAt,
    ...(cards.length === 0 ? { warning: "no envelope knowledge cards (run a director refresh to export them)" } : {}),
  };
}

export async function buildDirectorPlanResponse({
  qmaiProjectPath,
  mode = "plan",
  message = "",
  intent = null,
  dailies = null,
  storyboard = null,
  prompts = [],
  actionPackage = null,
  continuityReport = null,
  override = false,
  overrideReason,
} = {}) {
  const projectPath = String(qmaiProjectPath || process.env.HY_QMAI_PROJECT_DIR || "").trim();
  if (!projectPath) {
    return { success: false, error: "QMAI project path is required (payload.qmaiProjectPath or HY_QMAI_PROJECT_DIR)" };
  }
  try {
    if (mode === "dailies") {
      return await handleDailiesMode({ projectPath, dailies });
    }
    if (mode === "knowledge") {
      return await handleKnowledgeMode({ projectPath });
    }

    // The ear downlink (L1 -> L2): a conversation-plane intent must be
    // valid and lane=director before it may land in the QMAI inbox.
    let flowId;
    if (intent !== null && intent !== undefined) {
      const validation = validateDirectorIntent(intent);
      if (!validation.valid) {
        return { success: false, error: `invalid director intent: ${validation.errors.join("; ")}` };
      }
      if (intent.lane !== "director") {
        return { success: false, error: "director plan only accepts lane=director intents" };
      }
      flowId = intent.flowId;
      await writeToDirectorInbox(projectPath, `intent-${flowId}.json`, intent);
    }

    const { memory, envelopeFile } = await loadProjectMemory(projectPath);
    // Precedence per artifact: explicit payload > project-root file >
    // envelope artifacts (the envelope carries storyboard/prompts/
    // continuity from the same brain round as its knowledge cards).
    const envelopeArtifacts = memory.artifacts && typeof memory.artifacts === "object" ? memory.artifacts : {};
    const rootStoryboard = storyboard ? null : await readOptionalJson(projectPath, "storyboard.json");
    const rootContinuity = continuityReport ? null : await readOptionalJson(projectPath, "continuity-report.json");
    const rootActionPackage = actionPackage ? null : await readOptionalJson(projectPath, "action-package.json");
    const artifacts = {
      storyboard: storyboard || rootStoryboard || envelopeArtifacts.storyboard || null,
      actionPackage: actionPackage || rootActionPackage,
      continuityReport: continuityReport || rootContinuity || envelopeArtifacts.continuityReport || null,
    };
    // Judgment freshness: the max mtime of artifacts actually read
    // from disk this round (payload-supplied artifacts have no file
    // to date). The UI renders "based on N-minutes-old judgment".
    const artifactMtimes = [];
    if (rootStoryboard) artifactMtimes.push(await fileMtimeMs(join(projectPath, "storyboard.json")));
    if (rootContinuity) artifactMtimes.push(await fileMtimeMs(join(projectPath, "continuity-report.json")));
    if (rootActionPackage) artifactMtimes.push(await fileMtimeMs(join(projectPath, "action-package.json")));
    if (envelopeFile) artifactMtimes.push(await fileMtimeMs(envelopeFile));
    const validMtimes = artifactMtimes.filter((value) => Number.isFinite(value));
    const artifactsGeneratedAt = validMtimes.length ? new Date(Math.max(...validMtimes)).toISOString() : undefined;
    const effectivePrompts = Array.isArray(prompts) && prompts.length > 0
      ? prompts
      : Array.isArray(envelopeArtifacts.prompts)
        ? envelopeArtifacts.prompts
        : [];
    const hasEnvelopeCards = Array.isArray(memory.knowledgeCards) && memory.knowledgeCards.length > 0;
    const knowledgeCards = hasEnvelopeCards
      ? memory.knowledgeCards.slice(0, KNOWLEDGE_CARD_LIMIT)
      : knowledgeCardsFromMemory(memory);
    const planResult = await buildDirectorBrainCanvasPlan({
      qmaiProjectPath: projectPath,
      knowledgeCards,
      storyboard: artifacts.storyboard,
      prompts: effectivePrompts,
      actionPackage: artifacts.actionPackage,
      continuityReport: artifacts.continuityReport,
      override,
      overrideReason,
      flowId,
    });

    const suffix = `${Date.now().toString(36)}`;
    const buckets = bucketActions(planResult.actions);
    const steps = [];
    if (buckets.step_cards.length) {
      steps.push({ id: "step_cards", title: "铺导演知识卡", enabled: true, order: 1, status: "draft" });
    }
    if (buckets.step_shots.length) {
      steps.push({ id: "step_shots", title: "铺分镜与 PREP 节点", enabled: true, order: 2, status: "draft" });
    }
    if (buckets.step_layout.length) {
      steps.push({
        id: "step_layout",
        title: "整理画布布局",
        enabled: true,
        order: 3,
        status: "draft",
        dependsOn: buckets.step_shots.length ? ["step_shots"] : ["step_cards"],
      });
    }
    const actionsByStep = {};
    for (const step of steps) {
      actionsByStep[step.id] = buckets[step.id];
    }

    const knowledgeDegradedLine = hasEnvelopeCards
      ? ""
      : "知识降级：未发现信封真卡，已按记忆条目摘录兜底。";
    const title = `导演计划：${planResult.memory.project.name}`;
    const reply = [
      `已按 QMAI 项目「${planResult.memory.project.name}」生成导演计划（记忆条目 ${planResult.memory.entryCount} 条）。`,
      planResult.status === "warn" ? "连续性存在警告，请确认后执行。" : "",
      planResult.blocked.length ? `已按连续性门拦截 ${planResult.blocked.length} 个生成类动作。` : "",
      // The director panel renders the reply, not response.warnings -
      // degradation must reach the user here.
      knowledgeDegradedLine,
    ].filter(Boolean).join(" ");
    const warnings = planResult.blocked.map((item) => `连续性拦截：${item.reason}`);
    if (knowledgeDegradedLine) warnings.push(knowledgeDegradedLine);

    return {
      success: true,
      reply,
      ...(artifactsGeneratedAt ? { artifactsGeneratedAt } : {}),
      ...(flowId ? { directorFlowId: flowId } : {}),
      intent: { id: "director_plan", mode: "act", matchedSkills: ["director"], ...(flowId ? { flowId } : {}) },
      plan: { id: `plan_director_${suffix}`, title, status: "draft", steps },
      actionsByStep,
      execution: {
        id: `exec_director_${suffix}`,
        status: "draft",
        drawerState: { visible: true, expanded: false, line1: title, line2: reply },
      },
      actions: planResult.actions,
      warnings,
      requiresConfirmation: planResult.status === "warn" || planResult.requiresUserConfirmation === true,
      directorStatus: planResult.status,
    };
  } catch (error) {
    return { success: false, error: String((error && error.message) || error) };
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.stdout.write(JSON.stringify({ success: false, error: "invalid JSON payload" }));
    process.exit(0);
  }
  const response = await buildDirectorPlanResponse(payload);
  process.stdout.write(JSON.stringify(response));
}
