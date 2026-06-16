import test from "node:test";
import assert from "node:assert/strict";
import {
  POSE_PARTS,
  POSE_DOF_INDEX,
  POSE_PRESET_KEYS,
  POSE_PRESET_LABELS,
  POSE_PRESETS,
  derivePoseValues,
  buildPoseDofPatch,
  buildPosePresetPatch,
  poseToBoneRotations,
} from "./components/panoramaScene/characterPose.js";

test("PO1: 20 presets, all keys labeled + defined, bones reference real GLTF names", () => {
  assert.equal(POSE_PRESET_KEYS.length, 20);
  const REAL_BONES = new Set([
    "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r",
    "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r",
  ]);
  for (const k of POSE_PRESET_KEYS) {
    assert.ok(POSE_PRESET_LABELS[k], `${k} 有中文名`);
    assert.ok(POSE_PRESETS[k], `${k} 有预设`);
  }
  // 所有 dof 的骨骼必须是真实 GLTF 骨骼（避免引用不存在的骨骼）
  for (const [dofKey, d] of Object.entries(POSE_DOF_INDEX)) {
    assert.ok(REAL_BONES.has(d.bone), `${dofKey} 引用真实骨骼 ${d.bone}`);
    assert.ok(["x", "y", "z"].includes(d.axis), `${dofKey} 轴合法`);
    assert.ok(d.min < d.max, `${dofKey} 范围有效`);
  }
  // 预设里引用的 dofKey 必须存在
  for (const [k, preset] of Object.entries(POSE_PRESETS)) {
    for (const dofKey of Object.keys(preset)) {
      assert.ok(POSE_DOF_INDEX[dofKey], `预设 ${k} 的 ${dofKey} 存在`);
    }
  }
});

test("PO2: derivePoseValues defaults to 0 and reads pose + presetKey from directorExt", () => {
  const d0 = derivePoseValues(null, "m1");
  assert.equal(Object.values(d0.values).every((v) => v === 0), true, "无 ext → 全 0");
  assert.equal(d0.presetKey, null);

  const ext = { mannequins: { m1: { pose: { "head.nod": 20, "elbowL.bend": 90 }, posePresetKey: "think" } } };
  const d1 = derivePoseValues(ext, "m1");
  assert.equal(d1.values["head.nod"], 20);
  assert.equal(d1.values["elbowL.bend"], 90);
  assert.equal(d1.values["shoulderL.raise"], 0, "未设的 dof 为 0");
  assert.equal(d1.presetKey, "think");
});

test("PO3: dof edit clamps to range and clears presetKey", () => {
  const p = buildPoseDofPatch("m1", "elbowL.bend", 999);
  assert.equal(p.mannequins.m1.pose["elbowL.bend"], 150, "钳到 max 150");
  assert.equal(p.mannequins.m1.posePresetKey, null, "细调清预设标记");
  // 负向钳制
  assert.equal(buildPoseDofPatch("m1", "elbowL.bend", -50).mannequins.m1.pose["elbowL.bend"], 0);
  // 未知 dof
  assert.equal(buildPoseDofPatch("m1", "bogus.x", 10), null);
});

test("PO4: preset patch writes full pose dict + presetKey (覆盖式，无残留)", () => {
  const p = buildPosePresetPatch("tpose", "ignored?"); // 注意参数顺序：(mannequinId, presetKey)
  assert.equal(p, null, "第二参为 presetKey，'ignored?' 非法 → null");
  const t = buildPosePresetPatch("m1", "tpose");
  assert.equal(t.mannequins.m1.posePresetKey, "tpose");
  assert.equal(t.mannequins.m1.pose["shoulderL.abduct"], 90, "T型 左肩外展 90");
  assert.equal(t.mannequins.m1.pose["shoulderR.abduct"], 90);
  assert.equal(t.mannequins.m1.pose["head.nod"], 0, "其余 dof 显式归 0（覆盖残留）");
  // 站立 = 全 0
  const stand = buildPosePresetPatch("m1", "stand");
  assert.ok(Object.values(stand.mannequins.m1.pose).every((v) => v === 0), "站立全 0");
});

test("PO5: poseToBoneRotations groups DOFs by bone, applies sign, skips ~0", () => {
  // T型：左肩外展 upperarm_l.x +90·sign(1)，右肩外展 upperarm_r.x +90
  const { values } = (() => {
    const patch = buildPosePresetPatch("m1", "tpose");
    return derivePoseValues(patch.mannequins ? { mannequins: { m1: { pose: patch.mannequins.m1.pose } } } : {}, "m1");
  })();
  const rots = poseToBoneRotations(values);
  assert.ok(rots.upperarm_l && rots.upperarm_l.length >= 1, "左上臂有旋转");
  const abductL = rots.upperarm_l.find((r) => r.axis === "x");
  assert.ok(Math.abs(abductL.angle - (90 * Math.PI / 180)) < 1e-9, "外展 90° (sign +1)");
  // 弯曲带负 sign
  const bend = poseToBoneRotations({ "elbowL.bend": 90 });
  assert.ok(Math.abs(bend.lowerarm_l[0].angle - (-90 * Math.PI / 180)) < 1e-9, "elbowL sign=-1");
  // 全 0 → 空
  assert.deepEqual(poseToBoneRotations({}), {});
});
