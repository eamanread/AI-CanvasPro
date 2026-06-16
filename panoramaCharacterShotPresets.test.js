import test from "node:test";
import assert from "node:assert/strict";
import {
  CHARACTER_SHOT_PRESETS,
  CHARACTER_SHOT_PRESET_KEYS,
  SHOT_PITCH_SIGN,
  resolveCharacterFacingYaw,
  computeCharacterShotSceneView,
} from "./modules/panoramaSceneNode/characterShotPresets.js";
import {
  resolveSceneCameraPose,
  clampSceneOrbitPitch,
  forwardVectorFromYawPitch,
  SCENE_ORBIT_DISTANCE_MIN,
  SCENE_ORBIT_DISTANCE_MAX,
  SCENE_FOCAL_LENGTH_MIN_MM,
  SCENE_FOCAL_LENGTH_MAX_MM,
} from "./src/core/panoramaSceneMath.js";

const PITCH_LIMIT = clampSceneOrbitPitch(Math.PI);

function makeMannequin(overrides = {}) {
  return {
    id: "m1",
    gender: "female",
    colorKey: "red",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    ...overrides,
  };
}

function cameraPositionOf(sceneView) {
  return resolveSceneCameraPose(sceneView).position;
}

test("T1: all eight presets produce finite clamped sceneView params", () => {
  assert.equal(CHARACTER_SHOT_PRESET_KEYS.length, 8);
  for (const key of CHARACTER_SHOT_PRESET_KEYS) {
    assert.ok(CHARACTER_SHOT_PRESETS[key], `${key} registered`);
    const result = computeCharacterShotSceneView({ mannequin: makeMannequin(), presetKey: key });
    assert.equal(result.ok, true, `${key} ok`);
    const { target, orbitYaw, orbitPitch, orbitDistance, focalLength } = result.sceneView;
    for (const v of [target.x, target.y, target.z, orbitYaw, orbitPitch, orbitDistance, focalLength]) {
      assert.ok(Number.isFinite(v), `${key} finite`);
    }
    assert.ok(Math.abs(orbitPitch) <= PITCH_LIMIT + 1e-9, `${key} pitch in range`);
    assert.ok(orbitDistance >= SCENE_ORBIT_DISTANCE_MIN && orbitDistance <= SCENE_ORBIT_DISTANCE_MAX, `${key} distance in range`);
    assert.ok(focalLength >= SCENE_FOCAL_LENGTH_MIN_MM && focalLength <= SCENE_FOCAL_LENGTH_MAX_MM, `${key} focal in range`);
  }
});

test("T2: positive pitch means a high camera (regression lock for SHOT_PITCH_SIGN)", () => {
  const pose = resolveSceneCameraPose({
    target: { x: 0, y: 1.2, z: 0 },
    orbitYaw: 0,
    orbitPitch: 0.5,
    orbitDistance: 3,
  });
  assert.ok(pose.position.y > 1.2, "positive pitch raises camera above target");
  assert.equal(SHOT_PITCH_SIGN, 1);
});

// 角色视觉朝向复用模块导出的 resolveCharacterFacingYaw（浏览器三点实验钉死），
// 测试用朝向向量语义断言，不硬编码世界轴向
function facingOf(rotY) {
  return forwardVectorFromYawPitch(resolveCharacterFacingYaw(rotY), 0);
}

function rightOf(rotY) {
  const f = facingOf(rotY);
  // right = up × forward, up = (0,1,0)
  return { x: f.z, y: 0, z: -f.x };
}

function dotXZ(a, b) {
  return a.x * b.x + a.z * b.z;
}

test("T3: azimuth semantics follow character facing", () => {
  for (const rotY of [0, Math.PI / 2, -2.1]) {
    const mannequin = makeMannequin({ rotation: { x: 0, y: rotY, z: 0 } });
    const front = computeCharacterShotSceneView({ mannequin, presetKey: "front-closeup" });
    const frontOffset = cameraPositionOf(front.sceneView);
    assert.ok(dotXZ(frontOffset, facingOf(rotY)) > 0, `rotY=${rotY}: front camera on facing side`);

    const right = computeCharacterShotSceneView({ mannequin, presetKey: "right-close" });
    const rightOffset = cameraPositionOf(right.sceneView);
    assert.ok(dotXZ(rightOffset, rightOf(rotY)) > 0, `rotY=${rotY}: right camera on character's right`);

    const rear = computeCharacterShotSceneView({ mannequin, presetKey: "rear-high-extreme-long" });
    assert.ok(dotXZ(cameraPositionOf(rear.sceneView), facingOf(rotY)) < 0, `rotY=${rotY}: rear camera behind character`);
  }
});

test("T4: scale drives target height and distance proportionally", () => {
  const base = computeCharacterShotSceneView({ mannequin: makeMannequin(), presetKey: "front-medium" });
  const scaled = computeCharacterShotSceneView({ mannequin: makeMannequin({ scale: 1.5 }), presetKey: "front-medium" });
  assert.ok(Math.abs(scaled.sceneView.target.y - base.sceneView.target.y * 1.5) < 1e-9);
  assert.ok(Math.abs(scaled.sceneView.orbitDistance - base.sceneView.orbitDistance * 1.5) < 1e-9);
});

test("T5: top-down clamps pitch to the system limit and keeps current yaw", () => {
  const result = computeCharacterShotSceneView({
    mannequin: makeMannequin(),
    presetKey: "top-down",
    currentSceneView: { orbitYaw: 0.42, orbitPitch: 0, orbitDistance: 9, target: { x: 0, y: 1.2, z: 0 } },
  });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.sceneView.orbitPitch - PITCH_LIMIT) < 1e-9, "pitch pinned at clamp limit");
  assert.ok(Math.abs(result.sceneView.orbitYaw - 0.42) < 1e-9, "yaw preserved");
});

test("T6: over-shoulder targets the gaze point 1.6s ahead of the character", () => {
  const facing = facingOf(0);
  const result = computeCharacterShotSceneView({ mannequin: makeMannequin(), presetKey: "over-shoulder" });
  assert.equal(result.ok, true);
  const { target } = result.sceneView;
  assert.ok(Math.abs(target.x - facing.x * 1.6) < 1e-9, "gaze point x = facing·1.6");
  assert.ok(Math.abs(target.z - facing.z * 1.6) < 1e-9, "gaze point z = facing·1.6");
  assert.ok(Math.abs(target.y - 1.45) < 1e-9, "gaze point height");

  const scaled = computeCharacterShotSceneView({ mannequin: makeMannequin({ scale: 2 }), presetKey: "over-shoulder" });
  assert.ok(Math.abs(scaled.sceneView.target.z - facing.z * 3.2) < 1e-9, "gaze distance scales");
});

test("T7: fail-closed on unknown preset or invalid mannequin", () => {
  const unknown = computeCharacterShotSceneView({ mannequin: makeMannequin(), presetKey: "dutch-angle" });
  assert.deepEqual(unknown, { ok: false, reason: "unknown-preset" });

  const nan = computeCharacterShotSceneView({
    mannequin: makeMannequin({ position: { x: Number.NaN, y: 0, z: 0 } }),
    presetKey: "front-closeup",
  });
  assert.deepEqual(nan, { ok: false, reason: "invalid-mannequin" });

  const missing = computeCharacterShotSceneView({ mannequin: null, presetKey: "front-closeup" });
  assert.deepEqual(missing, { ok: false, reason: "invalid-mannequin" });
});

test("T8: ground guard keeps the camera above the floor for degenerate poses", () => {
  const sunken = makeMannequin({ position: { x: 0, y: -5, z: 0 } });
  const result = computeCharacterShotSceneView({ mannequin: sunken, presetKey: "front-closeup" });
  assert.equal(result.ok, true);
  assert.ok(cameraPositionOf(result.sceneView).y >= 0.0999, "camera y >= 0.1");
});
