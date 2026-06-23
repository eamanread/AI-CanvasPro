import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { executeAssistantActions } from "../assistant/assistantActionExecutor.js";
import { buildDirectorBrainCanvasPlan } from "./directorBrainService.js";
import { buildCanvasDailiesExport, CANVAS_DAILIES_SCHEMA_VERSION } from "./directorCanvasDailies.js";
import { loadDirectorMemoryExport } from "./directorMemoryExportLoader.js";

const GOLDEN_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/qmai-director-export.golden.json",
);

function createGraphStore() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    addNode(node) { nodes.push(node); return node; },
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(nodeId, patch) {
      const node = nodes.find((item) => item.id === nodeId);
      if (node) node.data = { ...(node.data || {}), ...(patch || {}) };
    },
    setSelectedNodes() {},
  };
}

async function landGoldenPlanOnCanvas() {
  const memory = await loadDirectorMemoryExport(GOLDEN_PATH);
  const plan = await buildDirectorBrainCanvasPlan({
    qmaiProjectPath: GOLDEN_PATH,
    storyboard: memory.artifacts.storyboard,
    prompts: memory.artifacts.prompts,
    continuityReport: memory.artifacts.continuityReport,
    flowId: memory.flowId,
  });
  const graphStore = createGraphStore();
  await executeAssistantActions({ actions: plan.actions, graphStore });
  return { graphStore, flowId: memory.flowId, projectId: memory.project.id };
}

test("directorCanvasDailies: exports the real canvas state as canvas-dailies/v1", async () => {
  const { graphStore, flowId, projectId } = await landGoldenPlanOnCanvas();
  // Simulate one generation outcome and one user edit on the canvas.
  const imageNode = graphStore.nodes.find((node) => node.type === "ai-image");
  graphStore.updateNodeData(imageNode.id, { generationStatus: "failed", userEdited: true });

  const dailies = buildCanvasDailiesExport({
    graphStore,
    flowId,
    projectId,
    exportedAt: "2026-06-12T01:00:00.000Z",
  });

  assert.equal(dailies.schemaVersion, CANVAS_DAILIES_SCHEMA_VERSION);
  assert.equal(dailies.flowId, "flow-flywheel-round-2");
  assert.equal(dailies.exportedAt, "2026-06-12T01:00:00.000Z");

  const shotNodes = dailies.nodes.filter((node) => node.type === "storyboard-script");
  assert.equal(shotNodes.length, 3);
  assert.equal(shotNodes.every((node) => typeof node.qmaiShotId === "string" && node.qmaiShotId.length > 0), true);

  const imageNodes = dailies.nodes.filter((node) => node.type === "ai-image");
  assert.equal(imageNodes.length >= 1, true);
  assert.equal(imageNodes.some((node) => node.generationStatus === "failed"), true);
  assert.equal(imageNodes.every((node) => typeof node.prompt === "string"), true);

  assert.equal(dailies.stats.shotCount, 3);
  assert.equal(dailies.stats.failedCount, 1);
  assert.equal(dailies.edges.length >= 1, true);
});

test("directorCanvasDailies: validates inputs fail-closed", async () => {
  const { graphStore } = await landGoldenPlanOnCanvas();

  assert.throws(() => buildCanvasDailiesExport({ graphStore, exportedAt: "yesterday" }), /exportedAt/);
  assert.throws(() => buildCanvasDailiesExport({ exportedAt: "2026-06-12T01:00:00.000Z" }), /graphStore/);
  assert.throws(
    () => buildCanvasDailiesExport({ graphStore, exportedAt: "2026-06-12T01:00:00.000Z", flowId: "x/../y" }),
    /flowId/,
  );
});

test("directorCanvasDailies: an empty canvas cannot export dailies", () => {
  const emptyStore = { nodes: [{ id: "note", type: "comment", name: "n", data: {} }], edges: [] };

  assert.throws(
    () => buildCanvasDailiesExport({ graphStore: emptyStore, exportedAt: "2026-06-12T01:00:00.000Z" }),
    /production-surface/,
  );
});

test("directorCanvasDailies: only production-surface nodes are exported, sanitized", async () => {
  const { graphStore } = await landGoldenPlanOnCanvas();
  graphStore.addNode({
    id: "unrelated-note",
    type: "comment",
    name: "随手记",
    data: { content: "本地路径 D:\\secret\\notes.md" },
  });

  const dailies = buildCanvasDailiesExport({ graphStore, exportedAt: "2026-06-12T01:00:00.000Z" });

  assert.equal(dailies.nodes.some((node) => node.id === "unrelated-note"), false);
  assert.equal(JSON.stringify(dailies).includes("D:\\\\secret"), false);
});

test("directorCanvasDailies v2: flat real-store nodes export prompt, lineage, normalized status and absolutized outputs", () => {
  const graphStore = {
    nodes: [
      {
        id: "ai-image-1",
        type: "ai-image",
        name: "prep · shot-001",
        data: null,
        prompt: "雨夜便利店,冷蓝低饱和",
        negativePrompt: "禁止暖光",
        qmaiPromptId: "prompt-shot-001-image",
        jobStatus: "success",
        imageUrl: "/output/gen_001.png",
        thumbUrl: "/output/gen_001_thumb.png",
      },
      {
        id: "ai-image-2",
        type: "ai-image",
        name: "prep · shot-002",
        data: null,
        prompt: "柜台上的旧伞",
        imageUrl: "file:///D:/secret/gen_002.png",
      },
    ],
    edges: [],
  };

  const dailies = buildCanvasDailiesExport({
    graphStore,
    exportedAt: "2026-06-12T10:00:00.000Z",
    phase: "post-generation",
    assetBaseUrl: "http://localhost:8777/",
  });

  assert.equal(dailies.schemaVersion, "canvas-dailies/v2");
  assert.equal(dailies.phase, "post-generation");

  const done = dailies.nodes.find((node) => node.id === "ai-image-1");
  assert.equal(done.prompt, "雨夜便利店,冷蓝低饱和");
  assert.equal(done.negativePrompt, "禁止暖光");
  assert.equal(done.qmaiPromptId, "prompt-shot-001-image");
  // jobStatus:"success" normalizes to completed - reading the raw
  // generationStatus key alone would misreport finished takes.
  assert.equal(done.generationStatus, "completed");
  assert.equal(done.outputs.length, 1);
  assert.equal(done.outputs[0].url, "http://localhost:8777/output/gen_001.png");
  assert.equal(done.outputs[0].thumbnailUrl, "http://localhost:8777/output/gen_001_thumb.png");

  const blocked = dailies.nodes.find((node) => node.id === "ai-image-2");
  assert.deepEqual(blocked.outputs, []);
  assert.equal(JSON.stringify(dailies).includes("file:///"), false);
  assert.equal(dailies.stats.generatedCount, 1);
});

test("directorCanvasDailies v2: relative outputs without assetBaseUrl are dropped, http(s) passes as-is", () => {
  const graphStore = {
    nodes: [
      { id: "n1", type: "ai-image", name: "a", data: { prompt: "x", imageUrl: "/output/a.png" } },
      { id: "n2", type: "ai-video", name: "b", data: { prompt: "y", videoUrl: "https://cdn.example.com/b.mp4" } },
    ],
    edges: [],
  };

  const dailies = buildCanvasDailiesExport({ graphStore, exportedAt: "2026-06-12T10:00:00.000Z" });

  assert.deepEqual(dailies.nodes.find((node) => node.id === "n1").outputs, []);
  assert.deepEqual(dailies.nodes.find((node) => node.id === "n2").outputs, [{ kind: "video", url: "https://cdn.example.com/b.mp4" }]);
});

test("directorCanvasDailies v2: unknown phase fails closed", () => {
  const graphStore = { nodes: [{ id: "n1", type: "ai-image", name: "a", data: { prompt: "x" } }], edges: [] };
  assert.throws(
    () => buildCanvasDailiesExport({ graphStore, exportedAt: "2026-06-12T10:00:00.000Z", phase: "mid-flight" }),
    /phase/,
  );
});
