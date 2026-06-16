import { buildCanvasDailiesExport } from "./modules/directorBrain/directorCanvasDailies.js";

// Simulate a graphStore with invalid node data (qmaiShotId is a number instead of string)
const graphStore = {
  nodes: [
    {
      id: "node1",
      type: "storyboard-script",
      name: "Shot 1",
      data: {
        qmaiShotId: 123, // WRONG: should be string, but is number
        shotIndex: 1,
        dramaticBeat: "establish",
      },
    },
    {
      id: "node2",
      type: "ai-image",
      name: "Image prep",
      data: {
        qmaiPromptId: null, // WRONG: missing but was on producer side
        prompt: "test",
      },
    },
  ],
  edges: [],
};

try {
  const dailies = buildCanvasDailiesExport({
    graphStore,
    flowId: "test-flow",
    projectId: "test-project",
    exportedAt: "2026-06-12T01:00:00.000Z",
  });
  
  console.log("Export succeeded without error:");
  console.log("Node 1 (storyboard-script):");
  console.log("  Input qmaiShotId:", graphStore.nodes[0].data.qmaiShotId, "(type:", typeof graphStore.nodes[0].data.qmaiShotId + ")");
  console.log("  Output qmaiShotId:", dailies.nodes[0].qmaiShotId, "(missing:", !("qmaiShotId" in dailies.nodes[0]) + ")");
  
  console.log("\nNode 2 (ai-image):");
  console.log("  Input qmaiPromptId:", graphStore.nodes[1].data.qmaiPromptId);
  console.log("  Output qmaiPromptId:", dailies.nodes[1].qmaiPromptId, "(missing:", !("qmaiPromptId" in dailies.nodes[1]) + ")");
  
  console.log("\n⚠️ ISSUE: Node data was silently omitted without any error or warning.");
  console.log("The QMAI consumer expects qmaiShotId/qmaiPromptId to be present when mapping to shotIds/promptIds.");
  
} catch (error) {
  console.log("Export failed with error (as it should):");
  console.log(error.message);
}
