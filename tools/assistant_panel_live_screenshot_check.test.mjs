import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  buildR5JourneyScorePayload,
  collectBlockingBrowserIssues,
  scoreR5JourneyPayload,
  evaluateGenerationPermissionChecks,
  getR5JourneySelectors,
  evaluateActionPreviewCheck,
  resolveR5JourneyPrompt,
  isAssistantPanelUrl,
  isGenericResourceConsoleError,
  parseLiveRunnerArgs,
  r5JourneyStateChecks,
  validateLiveRunnerArgs,
  createLiveFixtureInitScript,
} from "./assistant_panel_live_screenshot_check.mjs";
import { isConfiguredTextModelOption } from "../modules/assistant/assistantModelRegistry.js";
import {
  createFixtureCanvasAgentApi,
  createFixtureGraphStore,
  graphSnapshot,
  loadLiveFixtureFromObject,
} from "./assistant_live_fixture_runtime.mjs";
import {
  detectUnsafeArtifactSecrets,
  sanitizeArtifactValue,
} from "./assistant_live_artifact_utils.mjs";

test("assistant live screenshot check ignores noisy host resource errors", () => {
  const issues = collectBlockingBrowserIssues({
    consoleErrors: [
      "Failed to load resource: the server responded with a status of 404 (File not found)",
    ],
    pageErrors: [],
    httpErrors: [
      { status: 404, url: "http://127.0.0.1:8777/favicon.ico" },
      { status: 404, url: "http://127.0.0.1:8777/assets/missing-host-image.png" },
    ],
    requestFailures: [],
  });

  assert.deepEqual(issues, []);
});

test("assistant live screenshot check still fails runtime and assistant-route issues", () => {
  assert.equal(isGenericResourceConsoleError("Failed to load resource: 404"), true);
  assert.equal(isGenericResourceConsoleError("Uncaught TypeError: boom"), false);
  assert.equal(isAssistantPanelUrl("http://127.0.0.1:8777/api/v2/canvas-agent/chat/stream"), true);
  assert.equal(isAssistantPanelUrl("http://127.0.0.1:8777/favicon.ico"), false);

  const issues = collectBlockingBrowserIssues({
    consoleErrors: ["Uncaught TypeError: boom"],
    pageErrors: ["ReferenceError: missing"],
    httpErrors: [
      { status: 500, url: "http://127.0.0.1:8777/api/v2/canvas-agent/chat/stream" },
    ],
    requestFailures: [
      { url: "http://127.0.0.1:8777/modules/app/appAssistantPanel.autoload.js", failure: "net::ERR_FAILED" },
    ],
  });

  assert.equal(issues.length, 4);
  assert.match(issues.join("\n"), /Uncaught TypeError/);
  assert.match(issues.join("\n"), /ReferenceError/);
  assert.match(issues.join("\n"), /api\/v2\/canvas-agent/);
  assert.match(issues.join("\n"), /appAssistantPanel\.autoload\.js/);
});

test("assistant live fixture runtime streams deterministic frames", async () => {
  const fixture = loadLiveFixtureFromObject({
    id: "fixture-1",
    streamFrames: [
      { type: "message.start", conversationId: "conv-1" },
      { type: "message.delta", delta: "hello" },
      { type: "message.done", reply: "done", actions: [{ type: "focus_nodes", nodeIds: ["n1"] }] },
    ],
    validationResult: { valid: true, actions: [{ type: "focus_nodes", nodeIds: ["n1"] }], warnings: [] },
  });
  const api = createFixtureCanvasAgentApi(fixture);
  const events = [];
  const result = await api.chatStream({ message: "x" }, { onEvent: (event) => events.push(event) });

  assert.equal(result.reply, "done");
  assert.deepEqual(events.map((event) => event.type), ["message.start", "message.delta", "message.done"]);
  assert.deepEqual((await api.validateActions([{ type: "focus_nodes", nodeIds: ["n1"] }])).actions, [
    { type: "focus_nodes", nodeIds: ["n1"] },
  ]);
});

test("assistant live fixture graph store snapshots nodes and edges", () => {
  const graph = createFixtureGraphStore({
    nodes: [{ id: "seed", nodeType: "source-text", name: "Seed" }],
    edges: [],
    selectedNodeIds: ["seed"],
  });
  graph.addNode({ id: "note", nodeType: "comment", name: "Note" });
  graph.addEdge({ id: "edge-1", source: "seed", target: "note" });
  graph.setSelectedNodes(["note"]);

  assert.deepEqual(graphSnapshot(graph), {
    nodeCount: 2,
    edgeCount: 1,
    nodes: [
      { id: "seed", nodeType: "source-text", type: "", name: "Seed", x: 0, y: 0 },
      { id: "note", nodeType: "comment", type: "", name: "Note", x: 0, y: 0 },
    ],
    edges: [{ id: "edge-1", source: "seed", target: "note" }],
    selectedNodeIds: ["note"],
  });
});


test("assistant live screenshot check parses R5 fixture and artifact options", () => {
  const args = parseLiveRunnerArgs([
    "--url", "http://127.0.0.1:8777",
    "--out", "output/regression",
    "--fixture", "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "--r5-journey",
  ]);

  assert.equal(args.url, "http://127.0.0.1:8777");
  assert.equal(args.outputDir, "output/regression");
  assert.equal(args.fixturePath, "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json");
  assert.equal(args.r5Journey, true);
});

test("assistant live screenshot check parses and prioritizes real API smoke prompt", () => {
  const args = parseLiveRunnerArgs([
    "--r5-journey",
    "--real-api-smoke",
    "--allow-real-api-smoke",
    "--prompt",
    "Create one image node and submit image generation.",
  ]);

  assert.equal(args.prompt, "Create one image node and submit image generation.");
  assert.equal(
    resolveR5JourneyPrompt({ fixture: { prompt: "fixture prompt" }, prompt: args.prompt }),
    "Create one image node and submit image generation."
  );
});

test("assistant live screenshot check parses visual diff options without enabling browser probes", () => {
  const args = parseLiveRunnerArgs([
    "--visual-baseline", "docs/assistant_live_cases/visual-baselines/r5",
    "--visual-diff",
  ]);

  assert.equal(args.visualDiff, true);
  assert.equal(args.visualBaseline, "docs/assistant_live_cases/visual-baselines/r5");
});

test("assistant live R5 fixtures declare configured text-node models when model options are present", async () => {
  const fixturePaths = [
    "docs/assistant_live_cases/r5-basic-create-connect-layout-focus.json",
    "docs/assistant_live_cases/r5-generation-permission-gate.json",
    "docs/assistant_live_cases/r5-invalid-delta-actions-do-not-execute.json",
  ];

  for (const fixturePath of fixturePaths) {
    const fixture = JSON.parse(await readFile(path.resolve(fixturePath), "utf8"));
    if (!Array.isArray(fixture.modelOptions) || fixture.modelOptions.length === 0) {
      continue;
    }
    const selected = fixture.modelOptions.find((model) => model?.configured !== false) || fixture.modelOptions[0];
    assert.equal(
      isConfiguredTextModelOption(selected),
      true,
      `${fixturePath} selected model must satisfy the configured text-node model contract`
    );
    assert.ok(
      fixture.modelOptions.some(isConfiguredTextModelOption),
      `${fixturePath} must include at least one sendable configured text-node model`
    );
  }
});

test("assistant live fixture bootstrap fallback uses a configured text-node model", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(createLiveFixtureInitScript({ id: "fallback-model-fixture" }), sandbox);
  const bootstrapped = sandbox.window.__HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__({
    id: "fallback-model-fixture",
    streamFrames: [],
  });

  assert.ok(bootstrapped.modelOptions.some(isConfiguredTextModelOption));
  assert.equal(isConfiguredTextModelOption(bootstrapped.selectedModel), true);
});

test("assistant live fixture bootstrap exposes mounted generator instances for initial AI nodes", async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(createLiveFixtureInitScript({
    id: "mounted-ai-fixture",
    initialCanvas: {
      nodes: [{ id: "text_node", nodeType: "ai-text", name: "Text Node" }],
      edges: [],
      selectedNodeIds: ["text_node"],
    },
  }), sandbox);
  const bootstrapped = sandbox.window.__HUANYING_CANVAS_AGENT_LIVE_BOOTSTRAP__(
    sandbox.window.__HUANYING_CANVAS_AGENT_LIVE_FIXTURE__
  );

  assert.equal(bootstrapped.rendererBridge.isNodeMounted("text_node"), true);
  const instance = bootstrapped.rendererBridge.nodeInstances.get("text_node");
  assert.equal(typeof instance._onGenerate, "function");
  await instance._onGenerate("write copy", { nodeId: "text_node" });
  const node = bootstrapped.graphStore.nodes.find((item) => item.id === "text_node");
  assert.match(JSON.stringify(node.data), /queued|running|write copy/);
});

test("assistant live screenshot check requires a second explicit opt-in for real API smoke", () => {
  const unsafeArgs = parseLiveRunnerArgs(["--r5-journey", "--real-api-smoke"]);

  assert.equal(unsafeArgs.realApiSmoke, true);
  assert.equal(unsafeArgs.allowRealApiSmoke, false);
  assert.throws(
    () => validateLiveRunnerArgs(unsafeArgs),
    /--allow-real-api-smoke/
  );

  const safeArgs = validateLiveRunnerArgs(parseLiveRunnerArgs([
    "--r5-journey",
    "--real-api-smoke",
    "--allow-real-api-smoke",
  ]));
  assert.equal(safeArgs.allowRealApiSmoke, true);
});

test("assistant live screenshot check builds score payload from journey checks", () => {
  const payload = buildR5JourneyScorePayload({
    panelOpen: true,
    modelDropdown: true,
    streaming: true,
    actionPreview: true,
    applyReceipt: true,
    historyRestore: true,
    generationGate: true,
    pendingState: true,
    secretSafety: true,
  });

  assert.equal(payload.r5Journey.panelOpen.pass, true);
  assert.equal(payload.r5Journey.secretSafety.pass, true);
});

test("assistant live screenshot check fails state checks when real send ends failed", () => {
  const checks = r5JourneyStateChecks({
    afterOpen: { assistant: { status: "idle", streaming: false } },
    duringStream: { assistant: { status: "streaming", streaming: true } },
    afterPreview: {
      assistant: {
        status: "failed",
        streaming: false,
        pendingActionCount: 0,
        lastReceipt: "Pi canvas agent returned an unsupported stream frame.",
      },
    },
    afterApply: {
      assistant: {
        status: "failed",
        streaming: false,
        pendingActionCount: 0,
        lastReceipt: "Pi canvas agent returned an unsupported stream frame.",
      },
    },
    afterHistory: { assistant: { status: "failed" } },
  }, { fixture: null });

  assert.equal(checks.actionPreview, false);
  assert.equal(checks.applyReceipt, false);
  assert.equal(checks.historyRestore, false);
});

test("assistant live screenshot check delegates R5 scorecards to the Python scorer contract", () => {
  const payload = buildR5JourneyScorePayload({
    panelOpen: true,
    modelDropdown: true,
    streaming: true,
    actionPreview: true,
    applyReceipt: true,
    historyRestore: true,
    generationGate: true,
    pendingState: true,
    secretSafety: true,
  });
  const calls = [];
  const scorecard = scoreR5JourneyPayload(payload, {
    payloadPath: "C:\\tmp\\r5-score-payload.json",
    pythonExecutable: "python-test",
    scorerPath: "tools\\score_assistant_live_run.py",
    runCommand(command, args, options) {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: JSON.stringify({
          passesTarget: true,
          r5Journey: { total: 110, max: 110 },
        }),
        stderr: "",
      };
    },
  });

  assert.equal(scorecard.passesTarget, true);
  assert.equal(scorecard.r5Journey.total, 110);
  assert.deepEqual(calls.map((call) => call.command), ["python-test"]);
  assert.deepEqual(calls[0].args, ["tools\\score_assistant_live_run.py", "C:\\tmp\\r5-score-payload.json"]);
});

test("assistant live screenshot check detects key-shaped secrets after artifact sanitization", () => {
  const unsafe = detectUnsafeArtifactSecrets({
    apiKey: "secret-value",
    nested: [
      `provider s${"k-"}abc123456789`,
      "Bearer private-token",
      "https://example.test/file.png?token=abc&safe=1",
      "D:\\private\\asset.png",
    ],
  });
  const sanitized = detectUnsafeArtifactSecrets(sanitizeArtifactValue({
    apiKey: "secret-value",
    nested: [
      `provider s${"k-"}abc123456789`,
      "Bearer private-token",
      "https://example.test/file.png?token=abc&safe=1",
      "D:\\private\\asset.png",
    ],
  }));

  assert.equal(unsafe.safe, false);
  assert.match(unsafe.issues.join("\n"), /apiKey|Bearer|OpenAI|token|path/i);
  assert.equal(sanitized.safe, true);
});

test("assistant live screenshot check scopes R5 input selector to the assistant panel", () => {
  const selectors = getR5JourneySelectors();

  assert.match(selectors.input, /\.hy-canvas-agent-panel/);
  assert.match(selectors.input, /\.hy-canvas-agent-input/);
  assert.doesNotMatch(selectors.input, /,\s*textarea\b/);
});

test("assistant live screenshot check waits for startup overlay before clicking launcher", () => {
  const selectors = getR5JourneySelectors();

  assert.match(selectors.startupOverlay, /v2-initial-loader/);
});

test("assistant live screenshot check verifies video is blocked before strong confirmation", () => {
  const fixture = loadLiveFixtureFromObject({
    streamFrames: [
      {
        type: "message.done",
        actions: [
          { type: "queue_generation_task", nodeId: "text_node", nodeType: "ai-text" },
          { type: "queue_generation_task", nodeId: "image_node", nodeType: "ai-image" },
          { type: "queue_generation_task", nodeId: "video_node", nodeType: "ai-video" },
        ],
      },
    ],
    expected: {
      safeQueuedNodeIds: ["text_node", "image_node"],
    },
  });

  const checks = evaluateGenerationPermissionChecks({
    fixture,
    strongConfirmVisible: true,
    graphBeforeUnconfirmedApply: {
      nodes: [
        { id: "text_node", data: {} },
        { id: "image_node", data: {} },
        { id: "video_node", data: {} },
      ],
    },
    graphAfterUnconfirmedApply: {
      nodes: [
        { id: "text_node", data: {} },
        { id: "image_node", data: {} },
        { id: "video_node", data: {} },
      ],
    },
    graphAfterConfirmedApply: {
      nodes: [
        { id: "text_node", data: { generationStatus: "queued" } },
        { id: "image_node", data: { generationStatus: "queued" } },
        { id: "video_node", data: { generationStatus: "queued" } },
      ],
    },
    pendingActionCountAfterUnconfirmedApply: 3,
  });

  assert.equal(checks.generationGate, true);
  assert.equal(checks.pendingState, true);
});

test("assistant live screenshot check recognizes new interaction card confirmation controls", () => {
  const selectors = getR5JourneySelectors();

  assert.match(selectors.applyButton, /hy-canvas-agent-card-confirm/);
  assert.match(selectors.preview, /hy-canvas-agent-card/);
  assert.match(selectors.strongConfirm, /hy-canvas-agent-card-confirm/);
});

test("assistant live screenshot check fails gate if video queues without confirmation", () => {
  const fixture = loadLiveFixtureFromObject({
    streamFrames: [
      {
        type: "message.done",
        actions: [
          { type: "queue_generation_task", nodeId: "video_node", nodeType: "ai-video" },
        ],
      },
    ],
  });

  const checks = evaluateGenerationPermissionChecks({
    fixture,
    strongConfirmVisible: true,
    graphBeforeUnconfirmedApply: { nodes: [{ id: "video_node", data: {} }] },
    graphAfterUnconfirmedApply: {
      nodes: [{ id: "video_node", data: { generationStatus: "queued" } }],
    },
    graphAfterConfirmedApply: {
      nodes: [{ id: "video_node", data: { generationStatus: "queued" } }],
    },
    pendingActionCountAfterUnconfirmedApply: 1,
  });

  assert.equal(checks.generationGate, false);
  assert.equal(checks.pendingState, false);
});


test("assistant live screenshot check accepts real API action preview without fixture actions", () => {
  const checks = r5JourneyStateChecks({
    afterPreview: { assistant: { status: "done_pending_actions", pendingActionCount: 2 } },
    afterApply: { assistant: { status: "done_pending_actions", lastReceipt: "applied" } },
    afterHistory: { assistant: { status: "done_pending_actions" } }
  }, { fixture: null });

  assert.equal(checks.actionPreview, true);
  assert.equal(checks.applyReceipt, true);
  assert.equal(checks.historyRestore, true);
});


test("assistant live screenshot check treats real API pending actions as preview evidence", () => {
  assert.equal(
    evaluateActionPreviewCheck({
      fixture: null,
      afterPreview: { assistant: { status: "done_pending_actions", pendingActionCount: 2 } },
      previewVisible: true,
    }),
    true
  );
  assert.equal(
    evaluateActionPreviewCheck({
      fixture: null,
      afterPreview: { assistant: { status: "failed", pendingActionCount: 2 } },
      previewVisible: true,
    }),
    false
  );
});

test("assistant live screenshot check accepts low-risk fixture actions that auto-apply before preview", () => {
  const fixture = loadLiveFixtureFromObject({
    streamFrames: [
      {
        type: "message.done",
        actions: [
          { type: "create_node", nodeType: "comment", id: "note" },
          { type: "connect_nodes", from: "seed", to: "note" },
        ],
      },
    ],
  });
  const stateSnapshots = {
    afterPreview: {
      assistant: {
        status: "done_no_actions",
        pendingActionCount: 0,
        lastReceipt: "Canvas operations applied.",
      },
    },
    afterApply: {
      assistant: {
        status: "done_no_actions",
        pendingActionCount: 0,
        lastReceipt: "Canvas operations applied.",
      },
    },
    afterHistory: { assistant: { status: "done_no_actions" } },
  };

  assert.equal(
    evaluateActionPreviewCheck({
      fixture,
      afterPreview: stateSnapshots.afterPreview,
      previewVisible: false,
    }),
    true
  );
  assert.equal(r5JourneyStateChecks(stateSnapshots, { fixture }).actionPreview, true);
});
