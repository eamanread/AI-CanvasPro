import test from "node:test";
import assert from "node:assert/strict";
import {
  createPanoramaSceneNodeData,
  normalizePanoramaSceneState,
} from "./modules/panoramaSceneNode/sceneNode.js";
import {
  addPanoramaSceneMannequin,
  addPanoramaSceneMannequinGrid,
  clearPanoramaSceneSelection,
  setPanoramaSceneMode,
} from "./modules/panoramaSceneNode/sceneNodeActions.js";
import { applyPanoramaSceneCharacterShot } from "./modules/panoramaSceneNode/characterShotActions.js";
import {
  CHARACTER_SHOT_PRESET_KEYS,
  computeCharacterShotSceneView,
} from "./modules/panoramaSceneNode/characterShotPresets.js";

function createFakeSceneStore(node) {
  return {
    state: {
      nodes: {
        [node.id]: node,
      },
      edges: [],
    },
    getState() {
      return this.state;
    },
    getStateRaw() {
      return this.state;
    },
    updateNodeData(nodeId, patch) {
      this.state.nodes[nodeId] = {
        ...this.state.nodes[nodeId],
        ...patch,
      };
    },
    batch(callback) {
      callback();
    },
  };
}

function setupSelectedMannequin(id = "scene-shot") {
  const node = createPanoramaSceneNodeData({ id });
  const store = createFakeSceneStore(node);
  const mannequinId = addPanoramaSceneMannequin({
    nodeId: node.id,
    gender: "female",
    colorKey: "red",
    viewPose: {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { y: 0 },
    },
    storeInstance: store,
  });
  return { node, store, mannequinId };
}

function readSceneState(store, nodeId) {
  return normalizePanoramaSceneState(store.state.nodes[nodeId].sceneNode);
}

test("A1: applies the preset sceneView for the selected mannequin", () => {
  const { node, store, mannequinId } = setupSelectedMannequin("scene-shot-a1");
  const before = readSceneState(store, node.id);
  const mannequin = before.mannequins.find((item) => item.id === mannequinId);
  const expected = computeCharacterShotSceneView({
    mannequin,
    presetKey: "front-closeup",
    currentSceneView: before.viewport.sceneView,
  });

  const result = applyPanoramaSceneCharacterShot({
    nodeId: node.id,
    presetKey: "front-closeup",
    storeInstance: store,
  });

  assert.equal(result.ok, true);
  const after = readSceneState(store, node.id);
  assert.deepEqual(after.viewport.sceneView, expected.sceneView);
  assert.equal(after.viewport.activeView, "default");
  assert.equal(after.viewport.activeCameraId, null);
});

test("A2: refuses without a selected mannequin and leaves the view untouched", () => {
  const { node, store } = setupSelectedMannequin("scene-shot-a2");
  clearPanoramaSceneSelection({ nodeId: node.id, storeInstance: store });
  const before = readSceneState(store, node.id);

  const result = applyPanoramaSceneCharacterShot({
    nodeId: node.id,
    presetKey: "front-closeup",
    storeInstance: store,
  });

  assert.deepEqual(result, { ok: false, reason: "no-mannequin-selected" });
  const after = readSceneState(store, node.id);
  assert.deepEqual(after.viewport.sceneView, before.viewport.sceneView);
});

test("A3: 3D director stage is scene-only; the shot action lands regardless of mode tampering", () => {
  // panorama-scene 节点经 scene-only normalizer，mode 结构性锁死为 'scene'
  //（360° 属于独立节点类型 panorama-360/panorama360Node，2026-06-12 实测钉死，文档 §8 R7）
  const { node, store } = setupSelectedMannequin("scene-shot-a3");
  setPanoramaSceneMode({ nodeId: node.id, mode: "panorama", storeInstance: store });
  assert.equal(readSceneState(store, node.id).mode, "scene", "scene-only invariant holds");

  const result = applyPanoramaSceneCharacterShot({
    nodeId: node.id,
    presetKey: "right-close",
    storeInstance: store,
  });

  assert.equal(result.ok, true);
  const after = readSceneState(store, node.id);
  assert.equal(after.mode, "scene");
  assert.deepEqual(after.viewport.sceneView, result.sceneView);
});

test("A4: refuses on multi-selection", () => {
  const node = createPanoramaSceneNodeData({ id: "scene-shot-a4" });
  node.sceneNode = {
    ...node.sceneNode,
    gridPlacement: {
      ...node.sceneNode.gridPlacement,
      rows: 2,
      cols: 2,
      gender: "male",
      colorKey: "blue",
    },
  };
  const store = createFakeSceneStore(node);
  addPanoramaSceneMannequinGrid({
    nodeId: node.id,
    viewPose: {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { y: 0 },
    },
    storeInstance: store,
  });
  assert.ok(readSceneState(store, node.id).selection.selectedObjects.length > 1);

  const result = applyPanoramaSceneCharacterShot({
    nodeId: node.id,
    presetKey: "front-closeup",
    storeInstance: store,
  });
  assert.deepEqual(result, { ok: false, reason: "multi-selection" });
});

test("A5: every preset is idempotent through the action layer", () => {
  const { node, store } = setupSelectedMannequin("scene-shot-a5");
  for (const presetKey of CHARACTER_SHOT_PRESET_KEYS) {
    const first = applyPanoramaSceneCharacterShot({ nodeId: node.id, presetKey, storeInstance: store });
    assert.equal(first.ok, true, `${presetKey} first apply`);
    const viewAfterFirst = readSceneState(store, node.id).viewport.sceneView;
    const second = applyPanoramaSceneCharacterShot({ nodeId: node.id, presetKey, storeInstance: store });
    assert.equal(second.ok, true, `${presetKey} second apply`);
    const viewAfterSecond = readSceneState(store, node.id).viewport.sceneView;
    assert.deepEqual(viewAfterSecond, viewAfterFirst, `${presetKey} idempotent`);
  }
});

test("A1x: unknown node id fails closed", () => {
  const { store } = setupSelectedMannequin("scene-shot-a1x");
  const result = applyPanoramaSceneCharacterShot({
    nodeId: "missing-node",
    presetKey: "front-closeup",
    storeInstance: store,
  });
  assert.deepEqual(result, { ok: false, reason: "node-not-found" });
});
