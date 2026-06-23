import test from "node:test";
import assert from "node:assert/strict";

import { createPanorama360FromImageNode } from "./createPanorama360FromImageNode.js";

function createStore() {
  const state = {
    nodes: {
      "image-1": {
        id: "image-1",
        type: "source-image",
        x: 100,
        y: 80,
        width: 320,
        height: 240,
      },
    },
    edges: {},
    selectedNodeIds: [],
  };

  return {
    state,
    getStateRaw: () => state,
    addNode(node) {
      state.nodes[node.id] = node;
    },
    addEdge(edge) {
      state.edges[edge.id] = edge;
    },
    setSelectedNodes(ids) {
      state.selectedNodeIds = ids.slice();
    },
  };
}

test("createPanorama360FromImageNode creates a panorama node and connects the source image", () => {
  const store = createStore();
  const generatedIds = ["panorama-node", "edge-node"];
  const focused = [];

  const result = createPanorama360FromImageNode("image-1", {
    store,
    generateId: () => generatedIds.shift(),
    connectWithPolicies: () => false,
    commitHistory: () => {},
    focusOnNodes: (ids) => focused.push(ids),
    resolveSpawnPos: () => ({ x: 500, y: 80 }),
  });

  assert.equal(result.nodeId, "panorama-node");
  assert.equal(store.state.nodes["panorama-node"].type, "panorama-360");
  assert.equal(store.state.nodes["panorama-node"].x, 500);
  assert.equal(store.state.edges["edge-node"].sourceId, "image-1");
  assert.equal(store.state.edges["edge-node"].targetId, "panorama-node");
  assert.deepEqual(store.state.selectedNodeIds, ["panorama-node"]);
  assert.deepEqual(focused, [["image-1", "panorama-node"]]);
});

test("createPanorama360FromImageNode throws when source node is missing", () => {
  const store = createStore();

  assert.throws(
    () =>
      createPanorama360FromImageNode("missing-image", {
        store,
        commitHistory: () => {},
      }),
    /找不到原节点/
  );
});
