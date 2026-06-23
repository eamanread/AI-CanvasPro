import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDefaultPanoramaSceneState,
  normalizePanoramaSceneState,
} from "./modules/panoramaSceneNode/sceneNode.js";

const rootPath = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(rootPath, path), "utf8");

const FUSION_KEYS = ["inputImage", "environmentImage", "referencePlane"];

test("default 3D director state no longer includes scene image fusion fields", () => {
  const state = createDefaultPanoramaSceneState();

  for (const key of FUSION_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(state, key), false, key);
  }
});

test("normalizing legacy scenes strips scene image fusion fields", () => {
  const state = normalizePanoramaSceneState({
    inputImage: {
      localPath: "outputs/room.png",
      imageUrl: "/outputs/room.png",
      fileName: "room.png",
      width: 1200,
      height: 900,
      mimeType: "image/png",
      appliedAt: 100,
    },
    environmentImage: { enabled: true, imageUrl: "/outputs/room.png", opacity: 1 },
    referencePlane: { enabled: true, imageUrl: "/outputs/room.png", opacity: 0.5, depth: -8 },
  });

  for (const key of FUSION_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(state, key), false, key);
  }
});

test("scene action module does not expose scene image fusion actions", () => {
  const actions = read("modules/panoramaSceneNode/sceneNodeActions.js");

  assert.doesNotMatch(actions, /removePanoramaSceneImage/);
  assert.doesNotMatch(actions, /uploadPanoramaSceneImageWithFusion/);
  assert.doesNotMatch(actions, /PANORAMA_SCENE_EMPTY_FUSION_INPUT_IMAGE/);
});

test("runtime bridge no longer consumes image fusion fields", () => {
  const bridge = read("modules/panoramaSceneNode/scene3dBridge.js");

  assert.doesNotMatch(bridge, /_syncSceneImageFusion/);
  assert.doesNotMatch(bridge, /sceneImageFusionReferencePlane/);
  assert.doesNotMatch(bridge, /referencePlane/);
  assert.doesNotMatch(bridge, /environmentImage/);
});

test("selected node toolbar only exposes panorama upload, not scene image controls", () => {
  const toolbar = read("components/panoramaScene/PanoramaSceneToolbar.js");

  assert.match(toolbar, /upload-panorama/);
  assert.doesNotMatch(toolbar, /upload-scene-image/);
  assert.doesNotMatch(toolbar, /remove-scene-image/);
  assert.doesNotMatch(toolbar, /panorama-scene-image-status/);
});

test("component action dispatcher does not map removed scene image toolbar actions", () => {
  const component = read("components/PanoramaSceneNode.js");

  assert.doesNotMatch(component, /action === "upload-scene-image"/);
  assert.doesNotMatch(component, /action === "remove-scene-image"/);
  assert.doesNotMatch(component, /removePanoramaSceneImage/);
});

