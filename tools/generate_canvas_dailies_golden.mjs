// Regenerates the cross-repo canvas-dailies golden fixture from REAL
// Huanying code (CONTRACTS.md:29 - the producer generates, the
// consumer's golden test goes red first). Replays the golden director
// envelope through the real plan + executor, simulates one failed and
// one completed take (flat real-store shape, /output relative URL),
// exports canvas-dailies/v2 and writes it into the QMAI fixture.
//
// Run: node tools/generate_canvas_dailies_golden.mjs [qmaiRepoDir]
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeAssistantActions } from "../modules/assistant/assistantActionExecutor.js";
import { buildDirectorBrainCanvasPlan } from "../modules/directorBrain/directorBrainService.js";
import { buildCanvasDailiesExport } from "../modules/directorBrain/directorCanvasDailies.js";
import { loadDirectorMemoryExport } from "../modules/directorBrain/directorMemoryExportLoader.js";

const GOLDEN_ENVELOPE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../modules/directorBrain/__fixtures__/qmai-director-export.golden.json",
);
const DEFAULT_QMAI_REPO = "D:\\Backup\\Documents\\导演wiki\\QMAI";

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

const qmaiRepo = process.argv[2] || DEFAULT_QMAI_REPO;
const fixturePath = path.join(qmaiRepo, "src/lib/director/__fixtures__/canvas-dailies.golden.json");

const memory = await loadDirectorMemoryExport(GOLDEN_ENVELOPE);
const plan = await buildDirectorBrainCanvasPlan({
  qmaiProjectPath: GOLDEN_ENVELOPE,
  storyboard: memory.artifacts.storyboard,
  prompts: memory.artifacts.prompts,
  continuityReport: memory.artifacts.continuityReport,
  flowId: memory.flowId,
});
const graphStore = createGraphStore();
await executeAssistantActions({ actions: plan.actions, graphStore, source: "qmai-director" });

const imageNodes = graphStore.nodes.filter((node) => node.type === "ai-image");
if (imageNodes.length < 2) {
  throw new Error(`golden scenario expects >=2 ai-image prep nodes, got ${imageNodes.length}`);
}
// One failed take, one completed take with a real-shape relative URL.
graphStore.updateNodeData(imageNodes[0].id, { generationStatus: "failed", userEdited: true });
graphStore.updateNodeData(imageNodes[1].id, {
  jobStatus: "success",
  imageUrl: "/output/gen_golden_take_001.png",
  thumbUrl: "/output/gen_golden_take_001_thumb.png",
});

const dailies = buildCanvasDailiesExport({
  graphStore,
  flowId: memory.flowId,
  projectId: memory.project.id,
  exportedAt: "2026-06-12T01:00:00.000Z",
  phase: "post-generation",
  assetBaseUrl: "http://localhost:8777",
});

await writeFile(fixturePath, JSON.stringify(dailies, null, 2), "utf8");
process.stdout.write(`canvas-dailies golden (v2) written: ${fixturePath}\n`);
process.stdout.write(`stats: ${JSON.stringify(dailies.stats)}\n`);
