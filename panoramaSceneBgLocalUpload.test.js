import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPanorama360NodeWithImage,
  createPanorama360BackgroundFromLocalImage,
} from "./modules/panoramaSceneBgLocalUpload.js";
import { isPanorama360NodeType } from "./modules/panoramaSceneNode/sceneNode.js";
import { resolvePanorama360Payload } from "./modules/panoramaSceneNode/panoramaSceneEdgeSync.js";

function createStore() {
  const state = {
    nodes: {
      "scene-1": { id: "scene-1", type: "panorama-scene", x: 100, y: 80, width: 480, height: 320 },
    },
    edges: {},
    selectedNodeIds: [],
  };
  return {
    state,
    getStateRaw: () => state,
    addNode(node) { state.nodes[node.id] = node; },
    addEdge(edge) { state.edges[edge.id] = edge; },
    setSelectedNodes(ids) { state.selectedNodeIds = ids.slice(); },
    updateNodeData(id, patch) { state.nodes[id] = { ...state.nodes[id], ...patch }; },
  };
}

test("F5-U1: buildPanorama360NodeWithImage produces a panorama-360 node carrying the local image", () => {
  const node = buildPanorama360NodeWithImage({
    id: "p1",
    sceneNode: { id: "scene-1", x: 0, y: 0, width: 480, height: 320 },
    imageUrl: "blob:local/abc",
    fileName: "kitchen.jpg",
    resolveSpawnPos: () => ({ x: 700, y: 0 }),
    nodes: {},
  });
  assert.ok(isPanorama360NodeType(node.type), "节点类型 = panorama-360");
  assert.equal(node.x, 700);
  assert.equal(node.panorama360Node.panorama.imageUrl, "blob:local/abc", "图注入 panorama360Node.panorama.imageUrl");
  assert.equal(node.panorama360Node.panorama.fileName, "kitchen.jpg");
  assert.match(node.name, /kitchen\.jpg/);
});

test("F5-U2: the injected node is consumable by the edge-sync payload resolver (真实链路对齐)", () => {
  const node = buildPanorama360NodeWithImage({
    id: "p1",
    sceneNode: { id: "scene-1" },
    imageUrl: "blob:local/xyz",
    fileName: "room.png",
    resolveSpawnPos: () => ({ x: 0, y: 0 }),
    nodes: {},
  });
  // resolvePanorama360Payload 是 edge-sync 实际读取入边全景的函数 → 必须能解析出我们注入的图
  const payload = resolvePanorama360Payload(node);
  assert.ok(payload, "edge-sync 能从节点解析出全景 payload");
  assert.equal(payload.imageUrl, "blob:local/xyz");
  assert.equal(payload.fileName, "room.png");
});

test("F5-U3: createPanorama360BackgroundFromLocalImage adds the node and connects it to the scene", () => {
  const store = createStore();
  const ids = ["pano-node", "edge-node"];
  const focused = [];
  const result = createPanorama360BackgroundFromLocalImage(
    "scene-1",
    { imageUrl: "blob:local/foo", fileName: "foo.jpg" },
    {
      store,
      generateId: () => ids.shift(),
      connectWithPolicies: () => false, // 强制走 addEdge 兜底，验证连边方向
      commitHistory: () => {},
      resolveSpawnPos: () => ({ x: 700, y: 80 }),
      focusOnNodes: (a) => focused.push(a),
    },
  );
  assert.equal(result.nodeId, "pano-node");
  assert.ok(isPanorama360NodeType(store.state.nodes["pano-node"].type));
  assert.equal(store.state.nodes["pano-node"].panorama360Node.panorama.imageUrl, "blob:local/foo");
  // 边方向：panorama-360 (source) → panorama-scene (target)，符合 EdgeController seam
  assert.equal(store.state.edges["edge-node"].sourceId, "pano-node");
  assert.equal(store.state.edges["edge-node"].targetId, "scene-1");
  assert.deepEqual(focused, [["scene-1", "pano-node"]]);
});

test("F5-U4: connectWithPolicies success path skips the manual addEdge fallback", () => {
  const store = createStore();
  let policyCall = null;
  createPanorama360BackgroundFromLocalImage(
    "scene-1",
    { imageUrl: "blob:local/bar", fileName: "bar.jpg" },
    {
      store,
      generateId: () => "pano-node",
      connectWithPolicies: (args) => { policyCall = args; return true; },
      commitHistory: () => {},
      resolveSpawnPos: () => ({ x: 0, y: 0 }),
      focusOnNodes: () => {},
    },
  );
  assert.deepEqual(policyCall, { sourceId: "pano-node", targetId: "scene-1" }, "走策略连边：360→scene");
  assert.equal(Object.keys(store.state.edges).length, 0, "策略成功则不再 addEdge 兜底");
});

test("F5-U5: throws on a non-scene target or a missing image (不伪造)", () => {
  const store = createStore();
  assert.throws(
    () => createPanorama360BackgroundFromLocalImage("ghost", { imageUrl: "x" }, { store, commitHistory: () => {} }),
    /3D 导演台/,
  );
  assert.throws(
    () => createPanorama360BackgroundFromLocalImage("scene-1", { imageUrl: "" }, { store, commitHistory: () => {} }),
    /本地图片/,
  );
});
