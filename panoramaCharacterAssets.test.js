import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPanoramaSceneNodeData,
  normalizePanoramaSceneState,
} from "./modules/panoramaSceneNode/sceneNode.js";
import {
  addPanoramaSceneMannequin,
  addPanoramaSceneMannequinGrid,
  updatePanoramaSceneObjectTransform,
} from "./modules/panoramaSceneNode/sceneNodeActions.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const assetRoot = join(rootPath, "assets/characters/quaternius/universal-base");

const requiredFiles = [
  "SOURCE.md",
  "Superhero_Male_FullBody.gltf",
  "Superhero_Male_FullBody.bin",
  "Superhero_Female_FullBody.gltf",
  "Superhero_Female_FullBody.bin",
  "T_Eye_Brown.png",
  "T_Eye_Normal_png.png",
  "T_Hair_1_BaseColor.png",
  "T_Hair_1_Normal_png.png",
  "T_Hair_2_BaseColor.png",
  "T_Hair_2_Normal.png",
  "T_Superhero_Female_Dark_BaseColor.png",
  "T_Superhero_Female_Normal.png",
  "T_Superhero_Female_Roughness.png",
  "T_Superhero_Male_Dark.png",
  "T_Superhero_Male_Normal.png",
  "T_Superhero_Male_Roughness.png",
];

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

test("Quaternius character asset bundle exists locally", () => {
  for (const fileName of requiredFiles) {
    assert.equal(existsSync(join(assetRoot, fileName)), true, `${fileName} should exist`);
  }
});

test("character GLTF files reference only files present in the copied bundle", () => {
  for (const fileName of ["Superhero_Male_FullBody.gltf", "Superhero_Female_FullBody.gltf"]) {
    const gltf = JSON.parse(readFileSync(join(assetRoot, fileName), "utf8"));
    const referencedUris = [
      ...(gltf.buffers || []).map((item) => item.uri),
      ...(gltf.images || []).map((item) => item.uri),
    ].filter(Boolean);

    assert.ok(referencedUris.length > 0, `${fileName} should reference binary/texture files`);
    for (const uri of referencedUris) {
      assert.equal(existsSync(join(assetRoot, uri)), true, `${fileName} references missing ${uri}`);
    }
  }
});

test("character model registry points to local Quaternius asset paths", () => {
  const source = readFileSync(
    join(rootPath, "modules/panoramaSceneNode/characterModelRegistry.js"),
    "utf8",
  );

  assert.match(source, /assets\/characters\/quaternius\/universal-base\/Superhero_Male_FullBody\.gltf/);
  assert.match(source, /assets\/characters\/quaternius\/universal-base\/Superhero_Female_FullBody\.gltf/);
});

test("3D director actions place, select, and transform a mannequin", () => {
  const node = createPanoramaSceneNodeData({ id: "scene-character-action" });
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

  let state = normalizePanoramaSceneState(store.state.nodes[node.id].sceneNode);
  assert.equal(state.mannequins.length, 1);
  assert.equal(state.mannequins[0].id, mannequinId);
  assert.equal(state.mannequins[0].gender, "female");
  assert.equal(state.mannequins[0].colorKey, "red");
  assert.equal(state.selection.selectedObjectType, "mannequin");
  assert.equal(state.selection.selectedObjectId, mannequinId);

  updatePanoramaSceneObjectTransform({
    nodeId: node.id,
    objectType: "mannequin",
    objectId: mannequinId,
    pose: {
      position: { x: 1, y: 0, z: 2 },
      rotation: { x: 0, y: 0.5, z: 0 },
      scale: 1.5,
    },
    storeInstance: store,
  });

  state = normalizePanoramaSceneState(store.state.nodes[node.id].sceneNode);
  assert.equal(state.mannequins[0].position.x, 1);
  assert.equal(state.mannequins[0].position.z, 2);
  assert.equal(state.mannequins[0].rotation.y, 0.5);
  assert.equal(state.mannequins[0].scale, 1.5);
  assert.equal(state.selection.selectedObjectId, mannequinId);
});

test("3D director actions can place a selectable mannequin grid", () => {
  const node = createPanoramaSceneNodeData({ id: "scene-character-grid" });
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

  const ids = addPanoramaSceneMannequinGrid({
    nodeId: node.id,
    viewPose: {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { y: 0 },
    },
    storeInstance: store,
  });

  const state = normalizePanoramaSceneState(store.state.nodes[node.id].sceneNode);
  assert.equal(ids.length, 4);
  assert.equal(state.mannequins.length, 4);
  assert.equal(state.selection.selectedObjectType, "mannequin");
  assert.equal(state.selection.selectedObjects.length, 4);
  assert.equal(state.groups.length, 1);
  assert.deepEqual(state.groups[0].memberIds, ids);
});

test("3D director UI wires mannequin menu selection to placement action", () => {
  const source = readFileSync(join(rootPath, "components/PanoramaSceneNode.js"), "utf8");

  assert.match(source, /createMannequinQuickMenu/);
  assert.match(source, /onSelectColor/);
  assert.match(source, /addPanoramaSceneMannequin\(/);
  assert.match(source, /readCurrentViewPose/);
  assert.match(source, /mannequin-entry/);
});
