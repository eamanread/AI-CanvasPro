import { envelopeAssistantActions } from "../assistant/assistantActionContract.js";
import { sanitizeDirectorContext } from "./directorContextSchema.js";
import {
  mapActionPackageToCanvasActions,
  mapKnowledgeCardsToCanvasActions,
  mapStoryboardToCanvasActions,
} from "./directorCanvasActions.js";
import { gateCanvasActionsWithContinuity } from "./directorContinuityGate.js";
import { loadDirectorMemoryExport } from "./directorMemoryExportLoader.js";

/**
 * The pi-agent brain entry point. Reads real QMAI memory read-only
 * (RED-LINE-1), maps director artifacts onto canvas actions through
 * the assistant action contract, and applies the continuity gate
 * (RED-LINE-3) before anything reaches the executor. The returned
 * plan executes through the real executeAssistantActions
 * (RED-LINE-2 is proven by the integration test).
 */
export async function buildDirectorBrainCanvasPlan({
  qmaiProjectPath,
  knowledgeCards = [],
  storyboard = null,
  prompts = [],
  actionPackage = null,
  extraActions = [],
  continuityReport = null,
  override = false,
  overrideReason,
  flowId,
  readFile,
  listFiles,
} = {}) {
  const memory = await loadDirectorMemoryExport(qmaiProjectPath, { readFile, listFiles });

  const actions = [
    ...mapKnowledgeCardsToCanvasActions({ cards: knowledgeCards, projectId: memory.project.id }),
    ...(storyboard ? mapStoryboardToCanvasActions({ storyboard, prompts }).actions : []),
    ...(actionPackage ? mapActionPackageToCanvasActions(actionPackage).actions : []),
    ...extraActions,
  ];

  // The gate always runs: a missing continuity report is `unverified`
  // (generation held, confirmation required), never a silent pass.
  const gated = gateCanvasActionsWithContinuity({
    report: continuityReport,
    actions,
    override,
    overrideReason,
    flowId,
  });

  // The gate verdict travels with the actions: a held plan must not
  // self-ignite through the executor's auto-start side channel either.
  // Recomputed with the same expression as the gate's internal
  // shouldHoldGeneration (directorContinuityGate.js:53) - the gate
  // return value does not expose it.
  const holdGeneration = (gated.status === "block" || gated.status === "unverified") && !gated.overrideUsed;
  const downlinked = holdGeneration
    ? gated.allowed.map((action) =>
        action?.type === "create_node"
          ? { ...action, autoStart: false, data: { ...(action.data || {}), autoStart: false } }
          : action,
      )
    : gated.allowed;

  return {
    memory: {
      project: memory.project,
      entryCount: memory.entries.length,
    },
    status: gated.status,
    actions: envelopeAssistantActions(downlinked, { source: "qmai_director_brain" }),
    blocked: gated.blocked,
    // Verdicts surface to L0; reports can arrive from direct callers,
    // so the verdict is re-sanitized at the plan boundary.
    verdicts: [sanitizeDirectorContext(gated.verdict)],
    ...(gated.requiresUserConfirmation ? { requiresUserConfirmation: true } : {}),
    ...(gated.overrideUsed ? { overrideUsed: gated.overrideUsed } : {}),
  };
}
