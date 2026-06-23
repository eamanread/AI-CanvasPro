import test from "node:test";
import assert from "node:assert/strict";
import { bindAssistantCanvasReferences } from "./assistantCanvasReferenceBinder.js";

function graph() {
  const nodes = [{ id: "target", type: "ai-image", data: {} }, { id: "source", type: "source-image", name: "??A", data: {} }];
  const edges = [];
  return {
    nodes,
    edges,
    addEdge(edge) { edges.push(edge); return edge; },
    updateNodeData(id, patch) { const node = nodes.find((item) => item.id === id); node.data = { ...(node.data || {}), ...patch }; },
  };
}

test("binder writes edges and node reference metadata", () => {
  const graphStore = graph();
  const result = bindAssistantCanvasReferences({ graphStore, targetNodeId: "target", references: [{ id: "source", type: "canvas_node", label: "??A" }] });
  assert.equal(result.boundReferences.length, 1);
  assert.equal(graphStore.edges[0].source, "source");
  assert.equal(graphStore.edges[0].target, "target");
  assert.equal(result.boundReferences[0].edgeId, graphStore.edges[0].id);
  assert.equal(graphStore.nodes[0].data.assistantReferences[0].label, "??A");
});

test("binder warns missing canvas node references", () => {
  const graphStore = graph();
  const result = bindAssistantCanvasReferences({ graphStore, targetNodeId: "target", references: [{ id: "missing", type: "canvas_node" }] });
  assert.equal(result.boundReferences.length, 0);
  assert.match(result.warnings.join(" "), /missing/);
});
