import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "./modules/panoramaSceneNode/threeRuntime.js";
import { applyPoseToModel } from "./modules/panoramaSceneNode/panoramaCharacterPoseRuntime.js";

// 构造带命名骨骼的假模型（THREE.Group + 子 Object3D 当骨骼）
function makeFakeModel(boneNames) {
  const model = new THREE.Group();
  for (const name of boneNames) {
    const bone = new THREE.Object3D();
    bone.name = name;
    model.add(bone);
  }
  return model;
}
function bone(model, name) { return model.getObjectByName(name); }

test("PR1: applies axis-angle rotation, records bind quaternion, idempotent (no drift)", () => {
  const model = makeFakeModel(["upperarm_l", "lowerarm_l"]);
  const rots = { upperarm_l: [{ axis: "x", angle: Math.PI / 2 }] };
  applyPoseToModel(model, rots);
  const b = bone(model, "upperarm_l");
  assert.ok(b.userData.__hyBindQuat, "记录绑定四元数");
  // 旋转 90° about X → 四元数 (sin45,0,0,cos45)
  assert.ok(Math.abs(b.quaternion.x - Math.sin(Math.PI / 4)) < 1e-6, "x 分量");
  assert.ok(Math.abs(b.quaternion.w - Math.cos(Math.PI / 4)) < 1e-6, "w 分量");
  // 再应用一次相同 pose → 不累积（仍是 90°，非 180°）
  applyPoseToModel(model, rots);
  assert.ok(Math.abs(b.quaternion.x - Math.sin(Math.PI / 4)) < 1e-6, "幂等无漂移");
});

test("PR2: removing a bone's pose resets it to bind", () => {
  const model = makeFakeModel(["upperarm_l", "upperarm_r"]);
  applyPoseToModel(model, { upperarm_l: [{ axis: "x", angle: Math.PI / 2 }], upperarm_r: [{ axis: "z", angle: 0.5 }] });
  assert.ok(Math.abs(bone(model, "upperarm_l").quaternion.x) > 0.1, "左臂已转");
  // 下一帧只 pose 右臂 → 左臂复位
  applyPoseToModel(model, { upperarm_r: [{ axis: "z", angle: 0.5 }] });
  const bl = bone(model, "upperarm_l");
  assert.ok(Math.abs(bl.quaternion.x) < 1e-6 && Math.abs(bl.quaternion.w - 1) < 1e-6, "左臂复位到绑定（单位四元数）");
});

test("PR3: composes multiple DOFs on one bone (肩 前举+外展+扭转)", () => {
  const model = makeFakeModel(["upperarm_r"]);
  applyPoseToModel(model, { upperarm_r: [{ axis: "z", angle: 0.3 }, { axis: "x", angle: 0.2 }, { axis: "y", angle: 0.1 }] });
  const b = bone(model, "upperarm_r");
  // 合成四元数应归一
  const len = Math.hypot(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
  assert.ok(Math.abs(len - 1) < 1e-6, "合成四元数归一");
  assert.ok(Math.abs(b.quaternion.w - 1) > 1e-3, "确有旋转");
});

test("PR4: empty/no-op + missing bone are safe", () => {
  const model = makeFakeModel(["spine_01"]);
  applyPoseToModel(model, {});
  applyPoseToModel(model, { ghost_bone: [{ axis: "x", angle: 1 }] }); // 不存在的骨骼跳过
  applyPoseToModel(null, { x: [] }); // null model 不崩
  assert.ok(true, "无异常");
});

test("PR5: full empty pose after a pose resets all previously posed bones", () => {
  const model = makeFakeModel(["upperarm_l", "lowerarm_l"]);
  applyPoseToModel(model, { upperarm_l: [{ axis: "x", angle: 1 }], lowerarm_l: [{ axis: "z", angle: 1 }] });
  applyPoseToModel(model, {}); // 清空姿势
  for (const n of ["upperarm_l", "lowerarm_l"]) {
    const b = bone(model, n);
    assert.ok(Math.abs(b.quaternion.w - 1) < 1e-6, `${n} 复位`);
  }
});
