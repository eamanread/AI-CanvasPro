import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FAILURE_CATEGORIES,
  createAssistantPanelBrowserSmokeHarness,
  runCanvasSkillsRealApiSmoke,
  createModuleSmokeCanvasRuntime,
  isAcceptedSmokeSubmission,
  redactSmokeArtifact,
  runRealApiSmoke,
  scanSmokeArtifactForSecrets,
  selectSmokeImageModel,
  selectSmokeTextModel,
} from "./assistant_real_api_smoke.mjs";

function fakeAdapters(overrides = {}) {
  return {
    config: {},
    textModels: [
      { id: "text-1", provider: "model_registry", nodeType: "text", configured: true, supportsText: true },
    ],
    imageModels: [
      { id: "image-1", nodeType: "image", configured: true, usableByImageNode: true, modelId: "img-model" },
    ],
    onCreateImageDraft() {
      return { ok: true, nodeId: "ai-image-1" };
    },
    onSubmitGeneration() {
      return { taskId: "task-1", nodeState: "submitted" };
    },
    ...overrides,
  };
}

test("realApiSmoke: selects first configured text-node model", () => {
  const model = selectSmokeTextModel({
    registryModels: [
      { id: "img-1", nodeType: "image", configured: true },
      { id: "text-1", nodeType: "text", configured: true, capabilities: ["text"], supportsText: true },
    ],
  });

  assert.equal(model.id, "text-1");
});

test("realApiSmoke: missing text model returns CONFIG_MISSING_TEXT_MODEL", async () => {
  const result = await runRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    adapters: fakeAdapters({ textModels: [] }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCategory, FAILURE_CATEGORIES.CONFIG_MISSING_TEXT_MODEL);
});

test("realApiSmoke: failed module smoke writes a redacted artifact when requested", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "module-smoke-failure-"));
  const result = await runRealApiSmoke({
    mode: "Module",
    writeArtifact: true,
    outputDir,
    adapters: fakeAdapters({ textModels: [] }),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCategory, FAILURE_CATEGORIES.CONFIG_MISSING_TEXT_MODEL);
  assert.match(result.artifactPath, /real-api-smoke-/);
  const artifact = JSON.parse(await readFile(result.artifactPath, "utf8"));
  assert.equal(artifact.status, "failed");
  assert.equal(artifact.secretScan.status, "passed");
});

test("realApiSmoke: selects first usable image-node model", () => {
  const model = selectSmokeImageModel({
    imageModels: [
      { id: "img-unconfigured", nodeType: "image", configured: false },
      { id: "img-1", nodeType: "image", configured: true, usableByImageNode: true },
    ],
  });

  assert.equal(model.id, "img-1");
});

test("realApiSmoke: calls chatStream before image submission", async () => {
  const calls = [];
  const result = await runRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    prompt: "Create a real smoke test image.",
    adapters: fakeAdapters({
      onChatStream() {
        calls.push("chatStream");
        return [
          { type: "message.delta", delta: "Creating an image node." },
          {
            type: "action.proposed",
            actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "smoke image" }],
          },
          {
            type: "message.done",
            reply: "Submitted.",
            actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "smoke image" }],
          },
        ];
      },
      onSubmitGeneration() {
        calls.push("submitGeneration");
        return { taskId: "task-1", nodeState: "submitted" };
      },
    }),
  });

  assert.deepEqual(calls, ["chatStream", "submitGeneration"]);
  assert.equal(result.textModel.connected, true);
  assert.equal(result.submission.accepted, true);
  assert.deepEqual(result.executionOrder, ["textModel.chat", "imageNode.createDraft", "imageNode.generate"]);
});

test("realApiSmoke: module canvas runtime creates draft and records submitted generation state", async () => {
  const runtime = createModuleSmokeCanvasRuntime();
  const created = await runtime.onCreateImageDraft({
    id: "img",
    type: "create_node",
    nodeType: "ai-image",
    prompt: "smoke image",
    modelId: "image-1",
    provider: "model_registry",
  });
  const submitted = await runtime.onSubmitGeneration({
    nodeId: created.nodeId,
    nodeType: "ai-image",
    prompt: "smoke image",
  });
  const state = runtime.graphStore.getState();

  assert.equal(created.ok, true);
  assert.equal(state.nodes[0].type, "ai-image");
  assert.equal(state.nodes[0].data.prompt, "smoke image");
  assert.equal(submitted.nodeState, "submitted");
  assert.equal(isAcceptedSmokeSubmission(submitted), true);
});

test("realApiSmoke: accepted image submission supports task id and submitted states", () => {
  for (const state of ["submitted", "queued", "running", "generating"]) {
    assert.equal(isAcceptedSmokeSubmission({ nodeState: state }), true);
  }
  assert.equal(isAcceptedSmokeSubmission({ taskId: "task-1" }), true);
  assert.equal(isAcceptedSmokeSubmission({ queuedGenerationNodeIds: ["ai-image-1"] }), true);
  assert.equal(isAcceptedSmokeSubmission({ canvasSkillReceipts: [{ queuedGenerationNodeIds: ["ai-image-1"] }] }), true);
  assert.equal(isAcceptedSmokeSubmission({ nodeState: "failed" }), false);
});

test("realApiSmoke: artifact redactor removes Authorization, Bearer, apiKey, token query string, long base64", () => {
  const redacted = redactSmokeArtifact({
    headers: { Authorization: "Bearer sk-test-secret" },
    apiKey: "sk-test-secret",
    nested: { token: "hidden-token" },
    url: "https://x.test/file.png?token=abc&X-Amz-Signature=def",
    image: `data:image/png;base64,${"a".repeat(2000)}`,
  });
  const text = JSON.stringify(redacted);

  assert.doesNotMatch(text, /sk-test-secret|hidden-token|Bearer|X-Amz-Signature|a{1000}/);
  assert.equal(scanSmokeArtifactForSecrets(redacted).status, "passed");
});

test("realApiSmokeRunner: module mode goes through canvasSkills runtime", async () => {
  let runtimePayload = null;
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    adapters: fakeAdapters({
      canvasSkillsRuntime: {
        async executeActions(payload) {
          runtimePayload = payload;
          if (payload.actions[0].type === "create_node") {
            return { success: true, createdNodeIds: ["ai-image-runtime"], actionNodeIdMap: { img: "ai-image-runtime" } };
          }
          return { success: true, queuedGenerationNodeIds: ["ai-image-runtime"], canvasSkillReceipts: [{ submitted: true, nodeId: "ai-image-runtime" }] };
        },
      },
      onCreateImageDraft: undefined,
      onSubmitGeneration: undefined,
      onChatStream() {
        return [
          { type: "message.delta", delta: "Creating." },
          { type: "message.done", reply: "Done", actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }] },
        ];
      },
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.createdNodeId, "ai-image-runtime");
  assert.equal(runtimePayload.actions[0].type, "queue_generation_task");
});

test("realApiSmokeRunner: browser mode verifies panel-to-node submission", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Browser",
    writeArtifact: false,
    browserHarness: {
      async run() {
        return {
          status: "passed",
          mode: "Browser",
          submission: { accepted: true, nodeState: "submitted" },
          assistantSnapshots: [
            { assistant: { streaming: true } },
            { assistant: { streaming: false, messages: [{ role: "assistant", cards: [{ type: "skill_trace" }] }] }, graph: { nodes: [{ id: "img-1", type: "ai-image", generationStatus: "submitted" }] } },
          ],
        };
      },
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.mode, "Browser");
  assert.equal(result.submission.accepted, true);
});

test("realApiSmokeRunner: browser mode accepts queued generation evidence from debug receipt details", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Browser",
    writeArtifact: false,
    browserHarness: {
      async run() {
        return {
          status: "passed",
          mode: "Browser",
          assistantSnapshots: [
            { assistant: { streaming: true } },
            {
              assistant: {
                streaming: false,
                lastReceiptDetails: { queuedGenerationNodeIds: ["ai-image-receipt-1"] },
                messages: [{ role: "assistant", cards: [{ type: "skill_trace" }] }],
              },
              graph: { nodes: [] },
            },
          ],
        };
      },
    },
  });

  assert.equal(result.status, "passed");
  assert.equal(result.submission.accepted, true);
  assert.equal(result.submission.nodeState, "submitted");
  assert.equal(result.createdNodeId, "ai-image-receipt-1");
});

test("realApiSmokeRunner: browser mode normalizes harness timeout failures", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Browser",
    writeArtifact: false,
    browserHarness: {
      async run() {
        const error = new Error("spawnSync D:\\Aic\\node.exe ETIMEDOUT");
        error.code = "ETIMEDOUT";
        throw error;
      },
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.mode, "Browser");
  assert.equal(result.failureCategory, FAILURE_CATEGORIES.TIMEOUT);
  assert.equal(result.secretScan.status, "passed");
});

test("realApiSmokeRunner: module mode passes with the default canvasSkills smoke runtime", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    adapters: fakeAdapters({
      onCreateImageDraft: undefined,
      onSubmitGeneration: undefined,
      onChatStream() {
        return [
          { type: "message.delta", delta: "Creating." },
          { type: "message.done", reply: "Done", actions: [{ id: "img", type: "create_node", nodeType: "ai-image", prompt: "cat" }] },
        ];
      },
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.submission.accepted, true);
  assert.match(result.createdNodeId, /^ai-image-smoke-/);
});

test("realApiSmokeRunner: module mode preserves image action data when submitting generation", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    adapters: fakeAdapters({
      onCreateImageDraft: undefined,
      onSubmitGeneration: undefined,
      onChatStream() {
        return [
          { type: "message.delta", delta: "Creating." },
          {
            type: "message.done",
            reply: "Done",
            actions: [
              {
                id: "img",
                type: "create_node",
                data: {
                  nodeType: "ai-image",
                  prompt: "cat from data",
                  modelId: "image-1",
                  provider: "model_registry",
                },
              },
            ],
          },
        ];
      },
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.submission.accepted, true);
  assert.deepEqual(result.submission.warnings, []);
  assert.equal(result.submission.canvasSkillReceipts[0].paramsSummary.promptPreview, "cat from data");
});

test("realApiSmokeRunner: module mode does not submit blank optional provider fields", async () => {
  const result = await runCanvasSkillsRealApiSmoke({
    mode: "Module",
    writeArtifact: false,
    adapters: fakeAdapters({
      onCreateImageDraft: undefined,
      onSubmitGeneration: undefined,
      onChatStream() {
        return [
          { type: "message.delta", delta: "Creating." },
          {
            type: "message.done",
            reply: "Done",
            actions: [
              {
                id: "img",
                type: "create_node",
                nodeType: "ai-image",
                prompt: "cat without provider",
              },
            ],
          },
        ];
      },
    }),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.submission.accepted, true);
  assert.deepEqual(result.submission.warnings, []);
});

test("realApiSmokeRunner: browser harness reads R5 artifacts instead of relying on screenshots", async () => {
  const artifactDir = await mkdtemp(path.join(os.tmpdir(), "browser-smoke-artifact-"));
  let commandArgs = null;
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "assistant-state.json"),
    JSON.stringify({
      duringStream: { assistant: { streaming: true } },
      final: { assistant: { streaming: false, messages: [{ role: "assistant", cards: [{ type: "skill_trace" }] }] } },
    }),
    "utf8"
  );
  await writeFile(
    path.join(artifactDir, "graph-after.json"),
    JSON.stringify({ nodes: [{ id: "img-1", type: "ai-image", data: { generationStatus: "submitted" } }] }),
    "utf8"
  );
  const harness = createAssistantPanelBrowserSmokeHarness({
    runCommand(_command, args) {
      commandArgs = args;
      return {
        status: 0,
        stdout: JSON.stringify({ success: true, artifactDir }),
        stderr: "",
      };
    },
  });

  const result = await harness.run({
    baseUrl: "http://127.0.0.1:8777",
    outputDir: artifactDir,
    prompt: "Create one image node and submit generation.",
  });

  assert.equal(result.status, "passed");
  assert.equal(result.submission.accepted, true);
  assert.equal(result.assistantSnapshots.length, 2);
  assert.deepEqual(commandArgs.slice(commandArgs.indexOf("--prompt"), commandArgs.indexOf("--prompt") + 2), [
    "--prompt",
    "Create one image node and submit generation.",
  ]);
});

test("realApiSmokeRunner: browser harness parses pretty-printed R5 JSON output", async () => {
  const artifactDir = await mkdtemp(path.join(os.tmpdir(), "browser-smoke-pretty-"));
  await writeFile(
    path.join(artifactDir, "assistant-state.json"),
    JSON.stringify({ final: { assistant: { streaming: false, messages: [{ cards: [{ type: "skill_trace" }] }] } } }),
    "utf8"
  );
  await writeFile(
    path.join(artifactDir, "graph-after.json"),
    JSON.stringify({ nodes: [{ id: "img-1", type: "ai-image", data: { generationStatus: "queued" } }] }),
    "utf8"
  );
  const harness = createAssistantPanelBrowserSmokeHarness({
    runCommand() {
      return {
        status: 0,
        stdout: `noise before json\n${JSON.stringify({ success: true, artifactDir }, null, 2)}\n`,
        stderr: "",
      };
    },
  });

  const result = await harness.run({ outputDir: artifactDir });

  assert.equal(result.status, "passed");
  assert.equal(result.createdNodeId, "img-1");
});

test("real API smoke PowerShell wrapper accepts and forwards Chrome path", async () => {
  const script = await readFile("tools/run_canvas_agent_real_api_smoke.ps1", "utf8");

  assert.match(script, /\[string\]\$Chrome/);
  assert.match(script, /"--chrome",\s*\$Chrome/);
});
