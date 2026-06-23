// 3D导演台·角色姿势运行时（V4，文档 13/14）
// 把 characterPose.poseToBoneRotations 的结果应用到 GLTF 角色骨骼。
// 基于 applyPanoramaCharacterNaturalArmPose 的"bone.quaternion.multiply(轴角)"模式。
// 核心 applyPoseToModel 可测（注入 THREE 对象）；与桥的集成（每帧对各角色应用）在 autoload/桥钩子。
import * as THREE from "./threeRuntime.js";

function axisVector(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

// 把 boneRotations（{boneName:[{axis,angleRad}...]}）应用到 model 的骨骼。
// - 首次记录每骨骼绑定四元数到 bone.userData.__hyBindQuat；
// - 每次应用先复位到绑定姿势再叠加（幂等，不累积漂移）；
// - 上一帧被 pose、本帧不再 pose 的骨骼复位回绑定（移除姿势即还原）。
export function applyPoseToModel(model, boneRotations) {
  if (!model || typeof model.getObjectByName !== "function") return;
  const rots = boneRotations || {};
  const nextPosed = new Set(Object.keys(rots));
  const prevPosed = model.userData && model.userData.__hyPosedBones ? model.userData.__hyPosedBones : new Set();

  // 复位上帧有、本帧无的骨骼
  for (const boneName of prevPosed) {
    if (nextPosed.has(boneName)) continue;
    const bone = model.getObjectByName(boneName);
    if (bone && bone.userData.__hyBindQuat) bone.quaternion.copy(bone.userData.__hyBindQuat);
  }

  for (const [boneName, list] of Object.entries(rots)) {
    const bone = model.getObjectByName(boneName);
    if (!bone) continue;
    if (!bone.userData.__hyBindQuat) bone.userData.__hyBindQuat = bone.quaternion.clone();
    bone.quaternion.copy(bone.userData.__hyBindQuat);
    for (const { axis, angle } of list) {
      const q = new THREE.Quaternion().setFromAxisAngle(axisVector(axis), angle);
      bone.quaternion.multiply(q);
    }
    bone.updateMatrixWorld?.(true);
  }

  if (!model.userData) model.userData = {};
  model.userData.__hyPosedBones = nextPosed;
}
