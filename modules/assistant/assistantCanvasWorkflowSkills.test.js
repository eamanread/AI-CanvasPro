import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantCanvasWorkflowSkills } from "./assistantCanvasWorkflowSkills.js";

function graph() {
  const nodes = [];
  const edges = [];
  return {
    nodes,
    edges,
    selectedNodeIds: [],
    addNode(node) { nodes.push(node); return node; },
    addEdge(edge) { edges.push(edge); return edge; },
    setSelectedNodes(ids) { this.selectedNodeIds = ids; },
    getState() { return { nodes, edges }; },
  };
}

test("workflow skills apply workflow through adapter", async () => {
  const graphStore = graph();
  const skills = createAssistantCanvasWorkflowSkills({
    graphStore,
    workflowService: { loadWorkflowsFromServer: async () => [{ id: "wf-1", name: "??" }], saveWorkflowUsage: async () => null },
    workflowCanvas: { applyWorkflowToCanvas: () => ({ nodes: [{ id: "n1", type: "ai-text" }], edges: [{ id: "e1", source: "n1", target: "n1" }] }) },
  });
  const result = await skills.applyWorkflow({ workflowId: "wf-1" });
  assert.deepEqual(result.createdNodeIds, ["n1"]);
  assert.equal(graphStore.edges.length, 1);
  assert.deepEqual(graphStore.selectedNodeIds, ["n1"]);
});

test("workflow skills save and update via persistence service", async () => {
  const graphStore = graph();
  graphStore.addNode({ id: "n1", type: "ai-text" });
  const calls = [];
  const skills = createAssistantCanvasWorkflowSkills({
    graphStore,
    workflowService: {
      saveNewWorkflowFromCanvas: async (state, meta) => { calls.push({ kind: "save", state, meta }); return { id: "wf-new", name: meta.name }; },
      saveUpdatedWorkflowFromCanvas: async (id, state, meta) => { calls.push({ kind: "update", id, state, meta }); return { id, name: meta.name }; },
    },
  });
  const saved = await skills.saveWorkflow({ name: "????" });
  const updated = await skills.updateWorkflow({ workflowId: "wf-1", name: "????" });
  assert.equal(saved.workflowId, "wf-new");
  assert.equal(updated.workflowId, "wf-1");
  assert.deepEqual(calls.map((call) => call.kind), ["save", "update"]);
});
