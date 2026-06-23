import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildArtifactSummary,
  createArtifactBundle,
  detectUnsafeArtifactSecrets,
  sanitizeArtifactValue,
  writeSanitizedJson,
  writeTextArtifact,
} from "./assistant_live_artifact_utils.mjs";
import { loadLiveFixture } from "./assistant_live_fixture_runtime.mjs";
import { compareVisualArtifactDirectories } from "./assistant_visual_diff.mjs";

function argValue(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return fallback;
}

export function parseLiveRunnerArgs(argv = process.argv.slice(2)) {
  return {
    url: argValue(argv, "--url", "http://127.0.0.1:8777"),
    outputDir: argValue(argv, "--out", "output/regression"),
    prompt: argValue(argv, "--prompt", ""),
    browserExecutable: argValue(
      argv,
      "--browser-executable",
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || ""
    ),
    fixturePath: argValue(argv, "--fixture", ""),
    r5Journey: argv.includes("--r5-journey"),
    headed: argv.includes("--headed"),
    realApiSmoke: argv.includes("--real-api-smoke"),
    allowRealApiSmoke: argv.includes("--allow-real-api-smoke"),
    visualDiff: argv.includes("--visual-diff"),
    visualBaseline: argValue(argv, "--visual-baseline", ""),
    visualMaxMismatchRatio: Number(argValue(argv, "--visual-max-mismatch-ratio", "0")),
  };
}

export function resolveR5JourneyPrompt({ fixture = null, prompt = "" } = {}) {
  return String(prompt || fixture?.prompt || "Run the R5 deterministic canvas assistant journey.");
}

export function validateLiveRunnerArgs(args = {}) {
  if (args.r5Journey && !args.fixturePath) {
    if (!args.realApiSmoke) {
      throw new Error("R5 journey requires --fixture unless --real-api-smoke is explicitly provided.");
    }
    if (!args.allowRealApiSmoke) {
      throw new Error("R5 real API smoke requires --allow-real-api-smoke as a second explicit opt-in.");
    }
  }
  return args;
}

export function buildR5JourneyScorePayload(checks = {}) {
  const check = (name, owner = "", suggestedRegression = "") => ({
    pass: checks[name] === true,
    ...(owner ? { owner } : {}),
    ...(suggestedRegression ? { suggestedRegression } : {}),
  });
  return {
    r5Journey: {
      panelOpen: check("panelOpen", "ui", "modules/app/appAssistantPanel.test.js"),
      modelDropdown: check("modelDropdown", "model", "modules/assistant/assistantModelRegistry.test.js"),
      streaming: check("streaming", "stream", "modules/assistant/assistantStreamingClient.test.js"),
      actionPreview: check("actionPreview", "ui", "modules/assistant/assistantActionPreviewModel.test.js"),
      applyReceipt: check("applyReceipt", "executor", "modules/assistant/assistantActionExecutor.test.js"),
      historyRestore: check("historyRestore", "history", "modules/assistant/assistantConversationStore.test.js"),
      generationGate: check("generationGate", "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
      pendingState: check("pendingState", "generation", "modules/assistant/assistantGenerationTaskStore.test.js"),
      secretSafety: check("secretSafety", "sanitizer", "tools/assistant_live_artifact_utils.test.mjs"),
    },
  };
}

export function scoreR5JourneyPayload(payload = {}, {
  payloadPath = "",
  pythonExecutable = process.env.PYTHON || "python",
  scorerPath = path.resolve("tools", "score_assistant_live_run.py"),
  runCommand = spawnSync,
} = {}) {
  if (!payloadPath) {
    throw new TypeError("payloadPath is required to score an R5 journey");
  }
  const result = runCommand(pythonExecutable, [scorerPath, payloadPath], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  if (result?.error) {
    throw result.error;
  }
  const stdout = String(result?.stdout || "").trim();
  if (!stdout) {
    throw new Error(`R5 scorecard produced no output: ${String(result?.stderr || "").trim()}`);
  }
  return {
    ...JSON.parse(stdout),
    pythonStatus: Number(result?.status || 0),
  };
}

export function checkArtifactSecretSafety(value) {
  const sanitized = sanitizeArtifactValue(value);
  const detection = detectUnsafeArtifactSecrets(sanitized);
  return {
    ...detection,
    sanitized,
  };
}

export function isGenericResourceConsoleError(text = "") {
  return /Failed to load resource/i.test(String(text || ""));
}

export function isAssistantPanelUrl(rawUrl = "") {
  const value = String(rawUrl || "");
  return /\/api\/v2\/canvas-agent\b/.test(value) ||
    /\/modules\/app\/appAssistantPanel(?:\.autoload)?\.js\b/.test(value) ||
    /\/modules\/assistant\//.test(value);
}

export function collectBlockingBrowserIssues({
  consoleErrors = [],
  pageErrors = [],
  httpErrors = [],
  requestFailures = [],
} = {}) {
  const issues = [];
  for (const error of consoleErrors) {
    if (!isGenericResourceConsoleError(error)) {
      issues.push(`console: ${error}`);
    }
  }
  for (const error of pageErrors) {
    issues.push(`pageerror: ${error}`);
  }
  for (const error of httpErrors) {
    if (isAssistantPanelUrl(error?.url)) {
      issues.push(`http ${error.status}: ${error.url}`);
    }
  }
  for (const failure of requestFailures) {
    if (isAssistantPanelUrl(failure?.url)) {
      issues.push(`requestfailed: ${failure.url} ${failure.failure || ""}`.trim());
    }
  }
  return issues;
}

export function getR5JourneySelectors() {
  return {
    launcher: "#fabBtn, .hy-canvas-agent-launcher",
    panel: ".hy-canvas-agent-panel",
    input: ".hy-canvas-agent-panel .hy-canvas-agent-input",
    startupOverlay: "#v2-initial-loader",
    modelButton:
      ".hy-canvas-agent-panel [data-canvas-agent-control='model'], .hy-canvas-agent-panel .hy-canvas-agent-mode-pill",
    historyButton:
      ".hy-canvas-agent-panel [data-canvas-agent-control='history'], .hy-canvas-agent-panel .hy-canvas-agent-icon-btn[aria-label*='历史']",
    sendButton:
      ".hy-canvas-agent-panel [data-canvas-agent-control='send'], .hy-canvas-agent-panel .hy-canvas-agent-send",
    applyButton:
      ".hy-canvas-agent-panel .hy-canvas-agent-apply, .hy-canvas-agent-panel .hy-canvas-agent-card-confirm",
    legacyApplyButton: ".hy-canvas-agent-panel .hy-canvas-agent-apply",
    preview: ".hy-canvas-agent-panel .hy-canvas-agent-preview, .hy-canvas-agent-panel .hy-canvas-agent-card",
    receipt: ".hy-canvas-agent-panel .hy-canvas-agent-receipt",
    history: ".hy-canvas-agent-panel .hy-canvas-agent-history",
    strongConfirm:
      ".hy-canvas-agent-panel .hy-canvas-agent-strong-confirm, .hy-canvas-agent-panel .hy-canvas-agent-card-confirm",
    modelMenu: ".hy-canvas-agent-panel .hy-canvas-agent-model-menu",
    modelOption: ".hy-canvas-agent-panel .hy-canvas-agent-model-option",
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function fixtureFinalFrame(fixture = {}) {
  return safeArray(fixture.streamFrames).findLast?.((frame) => frame?.type === "message.done") ||
    [...safeArray(fixture.streamFrames)].reverse().find((frame) => frame?.type === "message.done") ||
    {};
}

function fixtureFinalActions(fixture = {}) {
  return safeArray(fixtureFinalFrame(fixture).actions);
}

function hasGenerationActions(fixture = {}) {
  return fixtureFinalActions(fixture).some((action) =>
    action?.type === "queue_generation_task" || action?.type === "run_prompt_preset_generation"
  );
}

function hasVideoGenerationActions(fixture = {}) {
  return fixtureFinalActions(fixture).some((action) =>
    (action?.type === "queue_generation_task" || action?.type === "run_prompt_preset_generation") &&
    action?.nodeType === "ai-video"
  );
}

function generationActionNodeIds(fixture = {}, nodeType = "") {
  return fixtureFinalActions(fixture)
    .filter((action) =>
      (action?.type === "queue_generation_task" || action?.type === "run_prompt_preset_generation") &&
      (!nodeType || action?.nodeType === nodeType)
    )
    .map((action) => String(action?.nodeId || ""))
    .filter(Boolean);
}

function graphNodeById(graph = {}, nodeId = "") {
  return safeArray(graph?.nodes).find((node) => String(node?.id || "") === String(nodeId || "")) || null;
}

function nodeLooksQueued(node) {
  const text = JSON.stringify(node || {}).toLowerCase();
  return /\bqueued\b|\brunning\b/.test(text);
}

function generationNodesQueued(graph = {}, nodeIds = []) {
  return safeArray(nodeIds).every((nodeId) => nodeLooksQueued(graphNodeById(graph, nodeId)));
}

function generationNodesNotQueued(graph = {}, nodeIds = []) {
  return safeArray(nodeIds).every((nodeId) => !nodeLooksQueued(graphNodeById(graph, nodeId)));
}

function graphChangedForNodes(before = {}, after = {}, nodeIds = []) {
  return safeArray(nodeIds).some((nodeId) =>
    JSON.stringify(graphNodeById(before, nodeId) || null) !==
    JSON.stringify(graphNodeById(after, nodeId) || null)
  );
}

export function evaluateGenerationPermissionChecks({
  fixture = {},
  strongConfirmVisible = false,
  graphBeforeUnconfirmedApply = null,
  graphAfterUnconfirmedApply = null,
  graphAfterConfirmedApply = null,
  pendingActionCountAfterUnconfirmedApply = 0,
} = {}) {
  const safeExpected = safeArray(fixture?.expected?.safeQueuedNodeIds).map(String).filter(Boolean);
  const safeGenerationNodeIds = safeExpected.length
    ? safeExpected
    : [
        ...generationActionNodeIds(fixture, "ai-text"),
        ...generationActionNodeIds(fixture, "ai-image"),
      ];
  const videoNodeIds = generationActionNodeIds(fixture, "ai-video");
  const hasVideo = videoNodeIds.length > 0;
  const hasGeneration = hasGenerationActions(fixture);
  const videoBlockedBeforeConfirmation =
    !hasVideo ||
    (
      strongConfirmVisible &&
      pendingActionCountAfterUnconfirmedApply > 0 &&
      generationNodesNotQueued(graphAfterUnconfirmedApply || {}, videoNodeIds) &&
      !graphChangedForNodes(graphBeforeUnconfirmedApply || {}, graphAfterUnconfirmedApply || {}, videoNodeIds)
    );
  const safeQueuedAfterConfirmation = safeGenerationNodeIds.length
    ? generationNodesQueued(graphAfterConfirmedApply || {}, safeGenerationNodeIds)
    : !hasGeneration || Boolean(graphAfterConfirmedApply);
  const videoQueuedAfterConfirmation =
    !hasVideo || generationNodesQueued(graphAfterConfirmedApply || {}, videoNodeIds);
  return {
    generationGate: hasVideo ? videoBlockedBeforeConfirmation : true,
    pendingState: hasGeneration
      ? safeQueuedAfterConfirmation && (!hasVideo || (videoBlockedBeforeConfirmation && videoQueuedAfterConfirmation))
      : true,
  };
}

function assistantSnapshotFailed(snapshot = {}) {
  const status = String(snapshot?.assistant?.status || "").toLowerCase();
  return status === "failed" || status === "error";
}

function assistantSnapshotCompleted(snapshot = {}) {
  const status = String(snapshot?.assistant?.status || "").toLowerCase();
  return status === "done_no_actions" || status === "done_pending_actions";
}

const LOW_RISK_AUTO_APPLY_FIXTURE_ACTIONS = new Set([
  "connect_nodes",
  "create_node",
  "focus_nodes",
  "layout_nodes",
  "move_nodes",
]);

function actionType(action = {}) {
  return String(action?.type || action?.action || "").trim();
}

function actionNodeType(action = {}) {
  const data = action?.data && typeof action.data === "object" ? action.data : {};
  return String(action?.nodeType || action?.node_type || data.nodeType || data.type || "").trim();
}

function fixtureActionsCanAutoApply(finalActions = []) {
  return safeArray(finalActions).length > 0 && safeArray(finalActions).every((action) => {
    if (action?.requiresConfirmation === true) {
      return false;
    }
    const type = actionType(action);
    if (!LOW_RISK_AUTO_APPLY_FIXTURE_ACTIONS.has(type)) {
      return false;
    }
    if (type === "create_node" && actionNodeType(action) === "ai-video") {
      return false;
    }
    return true;
  });
}

function assistantSnapshotAutoApplied(snapshot = {}) {
  const pendingCount = Number(snapshot?.assistant?.pendingActionCount || 0);
  const receipt = String(snapshot?.assistant?.lastReceipt || "").trim();
  return assistantSnapshotCompleted(snapshot) &&
    pendingCount === 0 &&
    (Boolean(receipt) || snapshot?.assistant?.hasReceiptDetails === true);
}

export function evaluateActionPreviewCheck({ fixture = null, afterPreview = {}, previewVisible = false } = {}) {
  if (assistantSnapshotFailed(afterPreview)) {
    return false;
  }
  const finalActions = fixtureFinalActions(fixture || {});
  if (finalActions.length) {
    if (afterPreview.assistant?.pendingActionCount === finalActions.length && previewVisible) {
      return true;
    }
    return fixtureActionsCanAutoApply(finalActions) && assistantSnapshotAutoApplied(afterPreview);
  }
  const pendingCount = Number(afterPreview.assistant?.pendingActionCount || 0);
  if (pendingCount > 0) {
    return true;
  }
  return assistantSnapshotCompleted(afterPreview);
}

export function r5JourneyStateChecks(stateSnapshots = {}, { fixture = null } = {}) {
  const finalActions = fixtureFinalActions(fixture || {});
  const afterPreview = stateSnapshots.afterPreview || {};
  const afterApply = stateSnapshots.afterApply || {};
  const afterHistory = stateSnapshots.afterHistory || stateSnapshots.final || {};
  const noFinalActions = finalActions.length === 0;
  return {
    streaming: !assistantSnapshotFailed(stateSnapshots.duringStream || {}),
    actionPreview:
      !assistantSnapshotFailed(afterPreview) &&
      (
        finalActions.length
          ? afterPreview.assistant?.pendingActionCount === finalActions.length ||
            (fixtureActionsCanAutoApply(finalActions) && assistantSnapshotAutoApplied(afterPreview))
          : noFinalActions && assistantSnapshotCompleted(afterPreview)
      ),
    applyReceipt:
      !assistantSnapshotFailed(afterApply) &&
      (
        finalActions.length
          ? Boolean(afterApply.assistant?.lastReceipt) || afterApply.assistant?.pendingActionCount === 0
          : noFinalActions && assistantSnapshotCompleted(afterApply)
      ),
    historyRestore: !assistantSnapshotFailed(afterHistory),
  };
}

export function createLiveFixtureInitScript(fixture) {
  return `(() => {
    const fixture = ${JSON.stringify(fixture)};
    const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const safeArray = (value) => Array.isArray(value) ? value : [];
    const normalize = (raw = {}) => ({
      id: String(raw.id || "fixture"),
      title: String(raw.title || raw.id || "Fixture"),
      initialCanvas: {
        nodes: safeArray(raw.initialCanvas && raw.initialCanvas.nodes).map(clone),
        edges: safeArray(raw.initialCanvas && raw.initialCanvas.edges).map(clone),
        selectedNodeIds: safeArray(raw.initialCanvas && raw.initialCanvas.selectedNodeIds).map(String),
      },
      modelOptions: safeArray(raw.modelOptions).map(clone),
      streamFrames: safeArray(raw.streamFrames).map(clone),
      validationResult: raw.validationResult && typeof raw.validationResult === "object" ? clone(raw.validationResult) : null,
      expected: raw.expected && typeof raw.expected === "object" ? clone(raw.expected) : {},
    });
    window.__HUANYING_CANVAS_AGENT_ENABLE_LIVE_FIXTURE__ = true;
    window.__HUANYING_CANVAS_AGENT_LIVE_FIXTURE__ = fixture;
    window.__HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__ = (raw) => {
      const normalized = normalize(raw || fixture);
      const state = {
        nodes: normalized.initialCanvas.nodes.map((node) => ({ x: 0, y: 0, ...clone(node) })),
        edges: normalized.initialCanvas.edges.map(clone),
        selectedNodeIds: normalized.initialCanvas.selectedNodeIds.map(String),
      };
      const graphStore = {
        get nodes() { return state.nodes; },
        get edges() { return state.edges; },
        getState() { return { nodes: state.nodes, edges: state.edges, selectedNodeIds: state.selectedNodeIds }; },
        addNode(node = {}) {
          const next = { x: 0, y: 0, ...clone(node) };
          state.nodes.push(next);
          ensureNodeInstance(next);
          return next;
        },
        addEdge(edge = {}) { state.edges.push(clone(edge)); return edge; },
        updateNodeData(nodeId, patch = {}) {
          const node = state.nodes.find((item) => item && item.id === nodeId);
          if (node) { node.data = { ...(node.data || {}), ...clone(patch) }; }
        },
        updateNode(nodeId, patch = {}) {
          const node = state.nodes.find((item) => item && item.id === nodeId);
          if (node) { Object.assign(node, clone(patch)); }
        },
        setSelectedNodes(nodeIds = []) { state.selectedNodeIds = safeArray(nodeIds).map(String); },
      };
      const nodeInstancesMap = new Map();
      const nodeTypeOf = (node) => String((node && (node.nodeType || node.type || (node.data && node.data.nodeType))) || "");
      const isAiNode = (node) => /^ai-(text|image|video)$/.test(nodeTypeOf(node));
      const markNodeGenerationStarted = (nodeId, prompt, task = {}) => {
        const node = state.nodes.find((item) => item && item.id === nodeId);
        if (!node) { return { started: false, reason: "node not found" }; }
        node.data = {
          ...(node.data || {}),
          prompt: String(prompt || task.prompt || node.data?.prompt || ""),
          generationStatus: "queued",
          jobStatus: "queued",
          asyncTaskStatus: "queued",
          isGenerating: true,
          generationRequestedBy: "r5-live-fixture",
        };
        return { started: true, pending: true, taskId: "fixture-task-" + nodeId };
      };
      const ensureNodeInstance = (node) => {
        const nodeId = String(node && node.id || "");
        if (!nodeId || !isAiNode(node) || nodeInstancesMap.has(nodeId)) { return; }
        nodeInstancesMap.set(nodeId, {
          async _onGenerate(prompt, task = {}) { return markNodeGenerationStarted(nodeId, prompt, task); },
          async onGenerate(prompt, task = {}) { return markNodeGenerationStarted(nodeId, prompt, task); },
        });
      };
      state.nodes.forEach(ensureNodeInstance);
      const rendererBridge = {
        nodeInstances: {
          get(nodeId) { return nodeInstancesMap.get(String(nodeId || "")) || null; },
          set(nodeId, value) { nodeInstancesMap.set(String(nodeId || ""), value); return this; },
          map: nodeInstancesMap,
        },
        isNodeMounted(nodeId) { return nodeInstancesMap.has(String(nodeId || "")); },
        getMountedWrapper(nodeId) { return nodeInstancesMap.has(String(nodeId || "")) ? {} : null; },
        pinNode() {},
        unpinNode() {},
      };
      const api = {
        async status() { return { success: true, available: true, status: "ready" }; },
        async chat() {
          return clone(normalized.streamFrames.find((frame) => frame.type === "message.done") || { reply: "", actions: [] });
        },
        async chatStream(_payload, handlers = {}) {
          let final = null;
          for (const frame of normalized.streamFrames) {
            const next = clone(frame);
            handlers.onEvent && handlers.onEvent(next);
            handlers.onFrame && handlers.onFrame(clone(frame));
            if (frame.type === "message.done") { final = clone(frame); }
            await new Promise((resolve) => setTimeout(resolve, frame.type === "message.delta" ? 80 : 20));
          }
          handlers.onDone && handlers.onDone(clone(final || {}));
          return final || { reply: "", actions: [], warnings: [] };
        },
        async validateActions(payload) {
          if (normalized.validationResult) { return clone(normalized.validationResult); }
          const actions = Array.isArray(payload) ? payload : safeArray(payload && payload.actions);
          return { success: true, valid: true, actions: clone(actions), warnings: [] };
        },
        async previewContext(context) { return { success: true, context: clone(context), warnings: [] }; },
      };
      const modelOptions = normalized.modelOptions.length ? normalized.modelOptions : [{
        provider: "model_registry",
        id: "text-live-fixture",
        modelId: "agent-live-fixture",
        model: "agent-live-fixture",
        displayName: "R5 Live Fixture",
        configured: true,
        supportsText: true,
      }];
      const selectedModel = modelOptions.find((item) => item && item.configured !== false) || modelOptions[0];
      const snapshot = () => ({
        nodeCount: state.nodes.length,
        edgeCount: state.edges.length,
        nodes: state.nodes.map((node) => ({
          id: String((node && node.id) || ""),
          nodeType: String((node && (node.nodeType || node.type || (node.data && node.data.nodeType))) || ""),
          type: String((node && node.type) || ""),
          name: String((node && (node.name || node.title)) || ""),
          x: Number((node && node.x) || 0),
          y: Number((node && node.y) || 0),
          data: clone((node && node.data) || {}),
        })),
        edges: state.edges.map((edge) => ({
          id: String((edge && edge.id) || ""),
          source: String((edge && (edge.source || edge.sourceId || edge.from)) || ""),
          target: String((edge && (edge.target || edge.targetId || edge.to)) || ""),
        })),
        selectedNodeIds: state.selectedNodeIds.map(String),
      });
      window.__HUANYING_CANVAS_AGENT_LIVE_DEBUG__ = { graphStore, rendererBridge, snapshot, fixture: normalized };
      return { api, graphStore, rendererBridge, modelOptions, selectedModel };
    };
  })();`;
}

async function maybeInjectFixture(page, fixture) {
  if (!fixture) {
    return;
  }
  await page.addInitScript({ content: createLiveFixtureInitScript(fixture) });
}

async function screenshotStep(page, bundle, name, screenshotPaths) {
  const filePath = path.join(bundle.screenshotsDir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  screenshotPaths.push(filePath);
  return filePath;
}

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function count(locator) {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

async function debugSnapshot(page) {
  try {
    return await page.evaluate(() => ({
      assistant: window.__huanyingCanvasAgentAssistant?.state?.debugSnapshot?.() || null,
      graph: window.__HUANYING_CANVAS_AGENT_LIVE_DEBUG__?.snapshot?.() || null,
    }));
  } catch {
    return { assistant: null, graph: null };
  }
}

function likelyFailureOwner(step = "") {
  if (/model/i.test(step)) {
    return ["model", "modules/assistant/assistantModelRegistry.test.js"];
  }
  if (/stream|send/i.test(step)) {
    return ["stream", "modules/assistant/assistantStreamingClient.test.js"];
  }
  if (/apply|receipt/i.test(step)) {
    return ["executor", "modules/assistant/assistantActionExecutor.test.js"];
  }
  if (/history/i.test(step)) {
    return ["history", "modules/assistant/assistantConversationStore.test.js"];
  }
  if (/generation|video/i.test(step)) {
    return ["generation", "modules/assistant/assistantGenerationTaskStore.test.js"];
  }
  return ["ui", "modules/app/appAssistantPanel.test.js"];
}

async function writeR5Artifacts({
  bundle,
  success,
  failedStep = "",
  issues = [],
  trace = [],
  consoleErrors = [],
  pageErrors = [],
  httpErrors = [],
  requestFailures = [],
  stateSnapshots = {},
  graphBefore = null,
  graphAfter = null,
  scorecard = null,
  visualDiffReport = null,
  fixture = null,
  screenshotPaths = [],
  lastFrame = null,
} = {}) {
  const [likelyOwner, suggestedRegression] = likelyFailureOwner(failedStep);
  await writeSanitizedJson(path.join(bundle.artifactDir, "trace.json"), trace);
  await writeSanitizedJson(path.join(bundle.artifactDir, "console.json"), { consoleErrors, pageErrors });
  await writeSanitizedJson(path.join(bundle.artifactDir, "network.json"), { httpErrors, requestFailures });
  await writeSanitizedJson(path.join(bundle.artifactDir, "assistant-state.json"), stateSnapshots);
  await writeSanitizedJson(path.join(bundle.artifactDir, "graph-before.json"), graphBefore || {});
  await writeSanitizedJson(path.join(bundle.artifactDir, "graph-after.json"), graphAfter || {});
  await writeSanitizedJson(path.join(bundle.artifactDir, "scorecard.json"), scorecard || {});
  await writeSanitizedJson(path.join(bundle.artifactDir, "visual-diff.json"), visualDiffReport || {});
  await writeSanitizedJson(path.join(bundle.artifactDir, "fixture-candidate.json"), {
    failedStep,
    likelyOwner,
    suggestedRegression,
    lastFrame,
    pendingActions: stateSnapshots.afterPreview?.assistant?.pendingActionCount || 0,
    graphBefore,
    graphAfter,
  });
  const summary = buildArtifactSummary({
    runId: bundle.runId,
    success,
    failedStep,
    artifactDir: bundle.artifactDir,
    issues,
    model: stateSnapshots.final?.assistant?.selectedModel || stateSnapshots.afterOpen?.assistant?.selectedModel,
    screenshotPaths,
    scorecard,
  });
  await writeSanitizedJson(path.join(bundle.artifactDir, "summary.json"), summary);
  await writeTextArtifact(
    path.join(bundle.artifactDir, "summary.md"),
    [
      `# Assistant Live R5 Run ${bundle.runId}`,
      ``,
      `- success: ${success}`,
      `- fixture: ${fixture?.id || "real-api-smoke"}`,
      `- failedStep: ${failedStep || ""}`,
      `- issues: ${issues.length ? issues.join(" | ") : "none"}`,
      `- scorecard: scorecard.json`,
      `- visualDiff: visual-diff.json`,
    ].join("\n")
  );
}

export async function runR5Journey({
  page,
  fixture,
  bundle,
  monitors = {},
  prompt = "",
  visualDiff = false,
  visualBaselineDir = "",
  visualMaxMismatchRatio = 0,
} = {}) {
  if (!page || !bundle) {
    throw new TypeError("page and bundle are required");
  }
  const screenshotPaths = [];
  const trace = [];
  const checks = {
    panelOpen: false,
    modelDropdown: false,
    streaming: false,
    actionPreview: false,
    applyReceipt: false,
    historyRestore: false,
    generationGate: false,
    pendingState: false,
    secretSafety: false,
  };
  const stateSnapshots = {};
  let failedStep = "";
  let graphBefore = null;
  let graphAfter = null;
  let scorecard = null;
  let visualDiffReport = null;
  let strongConfirmVisibleAtPreview = false;
  const finalFrame = fixtureFinalFrame(fixture || {});

  const step = async (name, fn) => {
    failedStep = name;
    trace.push({ step: name, status: "start", at: new Date().toISOString() });
    const value = await fn();
    trace.push({ step: name, status: "ok", at: new Date().toISOString() });
    return value;
  };

  try {
    const selectors = getR5JourneySelectors();
    const launcher = page.locator(selectors.launcher).first();
    const startupOverlay = page.locator(selectors.startupOverlay).first();
    const panel = page.locator(selectors.panel).first();
    const input = page.locator(selectors.input).first();
    const modelButton = page.locator(selectors.modelButton).first();
    const historyButton = page.locator(selectors.historyButton).first();
    const sendButton = page.locator(selectors.sendButton).first();
    const applyButton = page.locator(selectors.applyButton).first();
    const legacyApplyButton = page.locator(selectors.legacyApplyButton).first();
    const preview = page.locator(selectors.preview).first();
    const receipt = page.locator(selectors.receipt).first();
    const history = page.locator(selectors.history).first();
    const strongConfirm = page.locator(selectors.strongConfirm).first();

    await step("open-panel", async () => {
      await startupOverlay.waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
      await launcher.waitFor({ state: "visible", timeout: 15000 });
      await launcher.click();
      await panel.waitFor({ state: "visible", timeout: 15000 });
      stateSnapshots.afterOpen = await debugSnapshot(page);
      graphBefore = stateSnapshots.afterOpen.graph;
      checks.panelOpen = await isVisible(panel);
      await screenshotStep(page, bundle, "01-open-panel.png", screenshotPaths);
    });

    await step("model-dropdown", async () => {
      await modelButton.click();
      const menu = page.locator(selectors.modelMenu).first();
      await page.waitForTimeout(50);
      checks.modelDropdown = (await isVisible(menu)) || (await count(page.locator(selectors.modelOption))) > 0;
      await screenshotStep(page, bundle, "02-model-dropdown.png", screenshotPaths);
      await modelButton.click().catch(() => {});
    });

    await step("send-streaming", async () => {
      await input.fill(resolveR5JourneyPrompt({ fixture, prompt }));
      await sendButton.click();
      await page.waitForTimeout(60);
      stateSnapshots.duringStream = await debugSnapshot(page);
      checks.streaming = Boolean(stateSnapshots.duringStream.assistant?.streaming) ||
        safeArray(fixture?.streamFrames).some((frame) => frame?.type === "message.delta");
      await screenshotStep(page, bundle, "03-streaming.png", screenshotPaths);
    });

    await step("action-preview", async () => {
      await page.waitForFunction(() => {
        const state = window.__huanyingCanvasAgentAssistant?.state?.debugSnapshot?.();
        return state && state.streaming === false;
      }, null, { timeout: 10000 });
      await page.waitForTimeout(50);
      stateSnapshots.afterPreview = await debugSnapshot(page);
      checks.actionPreview = evaluateActionPreviewCheck({
        fixture,
        afterPreview: stateSnapshots.afterPreview,
        previewVisible: await isVisible(preview),
      });
      strongConfirmVisibleAtPreview = await isVisible(strongConfirm);
      checks.generationGate = hasVideoGenerationActions(fixture || {}) ? strongConfirmVisibleAtPreview : true;
      await screenshotStep(page, bundle, "04-action-preview.png", screenshotPaths);
      await screenshotStep(page, bundle, "08-video-strong-confirm.png", screenshotPaths);
    });

    await step("apply-receipt", async () => {
      if (hasVideoGenerationActions(fixture || {}) && strongConfirmVisibleAtPreview && await isVisible(legacyApplyButton)) {
        await legacyApplyButton.click();
        await page.waitForTimeout(80);
        stateSnapshots.afterUnconfirmedApply = await debugSnapshot(page);
        await screenshotStep(page, bundle, "09-video-unconfirmed-blocked.png", screenshotPaths);
      }
      if (await isVisible(strongConfirm)) {
        await strongConfirm.click();
        await page.waitForTimeout(30);
      }
      if (await isVisible(applyButton)) {
        await applyButton.click();
        await page.waitForFunction(() => {
          const state = window.__huanyingCanvasAgentAssistant?.state?.debugSnapshot?.();
          return state && (state.pendingActionCount === 0 || state.lastReceipt);
        }, null, { timeout: 10000 });
      }
      stateSnapshots.afterApply = await debugSnapshot(page);
      graphAfter = stateSnapshots.afterApply.graph;
      const noFinalActions = fixtureFinalActions(fixture || {}).length === 0;
      checks.applyReceipt = noFinalActions || Boolean(stateSnapshots.afterApply.assistant?.lastReceipt) || await isVisible(receipt);
      const generationChecks = evaluateGenerationPermissionChecks({
        fixture: fixture || {},
        strongConfirmVisible: strongConfirmVisibleAtPreview,
        graphBeforeUnconfirmedApply: stateSnapshots.afterPreview?.graph,
        graphAfterUnconfirmedApply: stateSnapshots.afterUnconfirmedApply?.graph || stateSnapshots.afterPreview?.graph,
        graphAfterConfirmedApply: graphAfter,
        pendingActionCountAfterUnconfirmedApply:
          stateSnapshots.afterUnconfirmedApply?.assistant?.pendingActionCount ??
          stateSnapshots.afterPreview?.assistant?.pendingActionCount ??
          0,
      });
      checks.generationGate = generationChecks.generationGate;
      checks.pendingState = generationChecks.pendingState;
      await screenshotStep(page, bundle, "05-applied-receipt.png", screenshotPaths);
      await screenshotStep(page, bundle, "07-generation-pending.png", screenshotPaths);
    });

    await step("history-restore", async () => {
      await historyButton.click();
      await page.waitForTimeout(80);
      checks.historyRestore = await isVisible(history);
      stateSnapshots.afterHistory = await debugSnapshot(page);
      await screenshotStep(page, bundle, "06-history-restore.png", screenshotPaths);
    });

    stateSnapshots.final = await debugSnapshot(page);
    if (!graphAfter) {
      graphAfter = stateSnapshots.final.graph;
    }
    const issues = collectBlockingBrowserIssues(monitors);
    const secretSafety = checkArtifactSecretSafety({ fixture, stateSnapshots, graphBefore, graphAfter });
    checks.secretSafety = secretSafety.safe;
    const stateChecks = r5JourneyStateChecks(stateSnapshots, { fixture });
    checks.streaming = checks.streaming && stateChecks.streaming;
    checks.actionPreview = checks.actionPreview && stateChecks.actionPreview;
    checks.applyReceipt = checks.applyReceipt && stateChecks.applyReceipt;
    checks.historyRestore = checks.historyRestore && stateChecks.historyRestore;
    const scorePayload = buildR5JourneyScorePayload(checks);
    const scorePayloadPath = path.join(bundle.artifactDir, "score-payload.json");
    await writeSanitizedJson(scorePayloadPath, scorePayload);
    scorecard = scoreR5JourneyPayload(scorePayload, { payloadPath: scorePayloadPath });
    if (visualDiff && visualBaselineDir) {
      visualDiffReport = await compareVisualArtifactDirectories({
        baselineDir: visualBaselineDir,
        actualDir: bundle.screenshotsDir,
        maxMismatchRatio: visualMaxMismatchRatio,
      });
      if (!visualDiffReport.passesTarget) {
        throw new Error(`Visual diff failed: ${JSON.stringify({
          failedComparisons: visualDiffReport.failedComparisons?.map((item) => item.name) || [],
          missingActuals: visualDiffReport.missingActuals || [],
          missingBaselines: visualDiffReport.missingBaselines || [],
        })}`);
      }
    }
    if (issues.length) {
      throw new Error(`Browser issues detected: ${issues.join(" | ")}`);
    }
    if (!scorecard.passesTarget) {
      throw new Error(`R5 scorecard failed: ${JSON.stringify(scorecard.r5Journey || scorecard)}`);
    }
    await writeR5Artifacts({
      bundle,
      success: true,
      trace,
      ...monitors,
      stateSnapshots,
      graphBefore,
      graphAfter,
      scorecard,
      visualDiffReport,
      fixture,
      screenshotPaths,
      lastFrame: finalFrame,
    });
    return {
      success: true,
      artifactDir: bundle.artifactDir,
      scorecardPath: path.join(bundle.artifactDir, "scorecard.json"),
      screenshotPaths,
      checks,
    };
  } catch (error) {
    const issues = [error?.message || String(error), ...collectBlockingBrowserIssues(monitors)];
    stateSnapshots.final = stateSnapshots.final || await debugSnapshot(page);
    graphAfter = graphAfter || stateSnapshots.final.graph;
    if (!scorecard) {
      const scorePayload = buildR5JourneyScorePayload(checks);
      const scorePayloadPath = path.join(bundle.artifactDir, "score-payload.json");
      await writeSanitizedJson(scorePayloadPath, scorePayload);
      scorecard = scoreR5JourneyPayload(scorePayload, { payloadPath: scorePayloadPath });
    }
    await writeR5Artifacts({
      bundle,
      success: false,
      failedStep,
      issues,
      trace,
      ...monitors,
      stateSnapshots,
      graphBefore,
      graphAfter,
      scorecard,
      visualDiffReport,
      fixture,
      screenshotPaths,
      lastFrame: finalFrame,
    });
    error.artifactDir = bundle.artifactDir;
    error.scorecardPath = path.join(bundle.artifactDir, "scorecard.json");
    throw error;
  }
}

async function runLegacyScreenshot({ page, args, monitors }) {
  await mkdir(args.outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.resolve(args.outputDir, `assistant-panel-live-${timestamp}.png`);
  const launcher = page.locator("#fabBtn, .hy-canvas-agent-launcher").first();
  await launcher.waitFor({ state: "visible", timeout: 15000 });
  await launcher.click();
  const panel = page.locator(".hy-canvas-agent-panel").first();
  await panel.waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-canvas-agent-control='history'], .hy-canvas-agent-icon-btn[aria-label*='历史']").first().click();
  await page.locator(".hy-canvas-agent-history").first().waitFor({ state: "visible", timeout: 5000 });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const title = await page.locator(".hy-canvas-agent-title").first().textContent();
  const skillText = await page.locator(".hy-canvas-agent-skill-list").first().textContent();
  const uploadCount = await page.locator(".hy-canvas-agent-upload[aria-label='上传参考图']").count();
  const modelButtonText = await page.locator(".hy-canvas-agent-mode-pill").first().textContent();
  const historyVisible = await page.locator(".hy-canvas-agent-history").first().isVisible();

  const hasRequiredUi =
    /RH/.test(title || "") &&
    /电商套图/.test(skillText || "") &&
    /爆款实验室/.test(skillText || "") &&
    uploadCount > 0 &&
    /Agent|Model|pi|canvas/i.test(modelButtonText || "") &&
    historyVisible;
  if (!hasRequiredUi) {
    throw new Error(`Assistant panel UI did not match expected RH state. Screenshot: ${screenshotPath}`);
  }
  const blockingIssues = collectBlockingBrowserIssues(monitors);
  if (blockingIssues.length) {
    throw new Error(`Browser issues detected: ${blockingIssues.join(" | ")}. Screenshot: ${screenshotPath}`);
  }
  return {
    success: true,
    url: args.url,
    screenshotPath,
    ignoredHttpErrors: safeArray(monitors.httpErrors).filter((error) => !isAssistantPanelUrl(error.url)).length,
    ignoredRequestFailures: safeArray(monitors.requestFailures).filter((failure) => !isAssistantPanelUrl(failure.url)).length,
  };
}

async function main() {
  const args = validateLiveRunnerArgs(parseLiveRunnerArgs());
  const fixture = args.fixturePath ? await loadLiveFixture(args.fixturePath) : null;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: !args.headed,
    ...(args.browserExecutable ? { executablePath: args.browserExecutable } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const monitors = {
    consoleErrors: [],
    pageErrors: [],
    httpErrors: [],
    requestFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") {
      monitors.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    monitors.pageErrors.push(error?.stack || error?.message || String(error));
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      monitors.httpErrors.push({ status, url: response.url() });
    }
  });
  page.on("requestfailed", (request) => {
    monitors.requestFailures.push({
      url: request.url(),
      failure: request.failure()?.errorText || "",
    });
  });

  try {
    await maybeInjectFixture(page, fixture);
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const result = args.r5Journey
      ? await runR5Journey({
          page,
          fixture,
          bundle: await createArtifactBundle({ outputDir: args.outputDir }),
          monitors,
          prompt: args.prompt,
          visualDiff: args.visualDiff,
          visualBaselineDir: args.visualBaseline,
          visualMaxMismatchRatio: args.visualMaxMismatchRatio,
        })
      : await runLegacyScreenshot({ page, args, monitors });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    if (error?.artifactDir) {
      console.error(JSON.stringify({ artifactDir: error.artifactDir, scorecardPath: error.scorecardPath }));
    }
    process.exitCode = 1;
  });
}
