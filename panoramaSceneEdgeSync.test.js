import test from "node:test";
import assert from "node:assert/strict";
import { isValidConnection } from "./modules/interaction/EdgeController.js";
import {
  createPanorama360NodeData,
  createPanoramaSceneNodeData,
  normalizePanoramaSceneState,
} from "./modules/panoramaSceneNode/sceneNode.js";
import {
  PANORAMA_EDGE_SIGNATURE_PREFIX,
  buildPanoramaEdgeSignature,
  resolvePanorama360Payload,
  syncPanoramaSceneFromIncomingEdges,
} from "./modules/panoramaSceneNode/panoramaSceneEdgeSync.js";

// ---- 连线校验真值表（seam 回归锁）----

test("C1: panorama-360 → panorama-scene is now a valid connection", () => {
  assert.equal(isValidConnection({ id: "a", type: "panorama-360" }, { id: "b", type: "panorama-scene" }), true);
});

test("C2: director stage only accepts panorama-360 inputs (images go through the upload button)", () => {
  for (const src of ["ai-image", "source-image", "source-video", "ai-text", "source-text"]) {
    assert.equal(isValidConnection({ id: "a", type: src }, { id: "b", type: "panorama-scene" }), false, `${src} rejected`);
  }
});

test("C3: existing connection rules are untouched", () => {
  const expectTrue = [
    ["source-image", "panorama-360"],
    ["ai-image", "panorama-360"],
    ["source-image", "ai-image"],
    ["ai-text", "ai-image"],
    ["source-video", "ai-video"],
    ["source-text", "storyboard-script"],
  ];
  const expectFalse = [
    ["panorama-360", "ai-image"],
    ["panorama-scene", "ai-image"],
    ["source-text", "panorama-360"],
  ];
  for (const [s, t] of expectTrue) {
    assert.equal(isValidConnection({ id: "a", type: s }, { id: "b", type: t }), true, `${s}→${t} stays true`);
  }
  for (const [s, t] of expectFalse) {
    assert.equal(isValidConnection({ id: "a", type: s }, { id: "b", type: t }), false, `${s}→${t} stays false`);
  }
});

// ---- 边同步 ----

function createFakeStore(nodes, edges) {
  return {
    state: { nodes, edges },
    getState() {
      return this.state;
    },
    getStateRaw() {
      return this.state;
    },
    updateNodeData(nodeId, patch) {
      this.state.nodes[nodeId] = { ...this.state.nodes[nodeId], ...patch };
    },
  };
}

function makePano360(id, imageUrl) {
  const node = createPanorama360NodeData({ id });
  node.panorama360Node = {
    ...node.panorama360Node,
    panorama: {
      ...node.panorama360Node.panorama,
      imageUrl,
      fileName: "p.png",
      sourceSignature: "src-sig",
      isLoaded: true,
    },
  };
  return node;
}

function sceneOf(store, id) {
  return normalizePanoramaSceneState(store.state.nodes[id].sceneNode);
}

test("S1: connecting a panorama-360 with an image applies it to the director stage", () => {
  const p360 = makePano360("p360", "blob:pano-1");
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  const store = createFakeStore({ p360, stage }, [{ sourceId: "p360", targetId: "stage" }]);

  const updates = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].action, "apply");
  const pano = sceneOf(store, "stage").panorama;
  assert.equal(pano.imageUrl, "blob:pano-1");
  assert.equal(pano.isLoaded, false, "isLoaded reset so the bridge reloads the texture");
  assert.ok(pano.sourceSignature.startsWith(PANORAMA_EDGE_SIGNATURE_PREFIX));
  assert.equal(pano.sourceSignature, buildPanoramaEdgeSignature("p360", { imageUrl: "blob:pano-1" }));
});

test("S2: same signature is idempotent (no repeated writes)", () => {
  const p360 = makePano360("p360", "blob:pano-1");
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  const store = createFakeStore({ p360, stage }, [{ sourceId: "p360", targetId: "stage" }]);

  syncPanoramaSceneFromIncomingEdges({ storeInstance: store });
  const second = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });
  assert.equal(second.length, 0, "no-op on unchanged signature");
});

test("S3: removing the edge clears an edge-driven panorama", () => {
  const p360 = makePano360("p360", "blob:pano-1");
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  const store = createFakeStore({ p360, stage }, [{ sourceId: "p360", targetId: "stage" }]);
  syncPanoramaSceneFromIncomingEdges({ storeInstance: store });

  store.state.edges = [];
  const updates = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].action, "clear");
  assert.equal(sceneOf(store, "stage").panorama.imageUrl, null);
});

test("S4: a manually uploaded panorama (no edge: prefix) is never touched", () => {
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  stage.sceneNode = {
    ...stage.sceneNode,
    panorama: {
      localPath: "C:/up.png",
      imageUrl: "blob:manual",
      fileName: "up.png",
      sourceSignature: "manual-sig",
      isLoaded: true,
      error: null,
    },
  };
  const store = createFakeStore({ stage }, []);

  const updates = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });
  assert.equal(updates.length, 0);
  assert.equal(sceneOf(store, "stage").panorama.imageUrl, "blob:manual");
});

test("S5: source updates flow through; empty panorama-360 contributes nothing", () => {
  const p360 = makePano360("p360", "blob:pano-1");
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  const store = createFakeStore({ p360, stage }, [{ sourceId: "p360", targetId: "stage" }]);
  syncPanoramaSceneFromIncomingEdges({ storeInstance: store });

  // 360 节点换图 → 导演台跟随
  store.state.nodes.p360.panorama360Node.panorama.imageUrl = "blob:pano-2";
  const updates = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });
  assert.equal(updates.length, 1);
  assert.equal(sceneOf(store, "stage").panorama.imageUrl, "blob:pano-2");

  // 空图的 360 节点解析为 null payload
  assert.equal(resolvePanorama360Payload(createPanorama360NodeData({ id: "empty" })), null);
  assert.equal(resolvePanorama360Payload({ id: "x", type: "ai-image" }), null);
});

test("S6: edges-as-object-map stores are supported", () => {
  const p360 = makePano360("p360", "blob:pano-1");
  const stage = createPanoramaSceneNodeData({ id: "stage" });
  const store = createFakeStore({ p360, stage }, { e1: { sourceId: "p360", targetId: "stage" } });

  const updates = syncPanoramaSceneFromIncomingEdges({ storeInstance: store });
  assert.equal(updates.length, 1);
  assert.equal(sceneOf(store, "stage").panorama.imageUrl, "blob:pano-1");
});
