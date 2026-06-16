// 3D导演台·角色姿势纯逻辑（V4，文档 13/14）
// 部位/自由度结构 + 20 预设 + pose 派生与 patch。状态落 node.directorExt.mannequins[id].pose。
// 骨骼应用在 panoramaCharacterPoseRuntime.js（基于 applyPanoramaCharacterNaturalArmPose）。
// GLTF 骨骼已核实：pelvis/spine_01-03/neck_01/Head/clavicle_l·r/upperarm_l·r/lowerarm_l·r/thigh_l·r/calf_l·r/foot_l·r。
// ⚠️ dof 的 (bone,axis,sign) 为种子值，自然度需浏览器逐部位标定（文档 V4 风险）。

// 每个自由度：{ key, label, bone, axis('x'|'y'|'z'), sign, min, max(度) }
export const POSE_PARTS = Object.freeze([
  { key: "body", label: "身体", dofs: [
    { key: "lean", label: "前倾", bone: "pelvis", axis: "x", sign: 1, min: -30, max: 30 },
    { key: "turn", label: "转身", bone: "pelvis", axis: "y", sign: 1, min: -90, max: 90 },
    { key: "tilt", label: "侧倾", bone: "pelvis", axis: "z", sign: 1, min: -30, max: 30 },
  ] },
  { key: "torso", label: "躯干", dofs: [
    { key: "lean", label: "前倾", bone: "spine_02", axis: "x", sign: 1, min: -40, max: 40 },
    { key: "twist", label: "扭转", bone: "spine_01", axis: "y", sign: 1, min: -40, max: 40 },
    { key: "tilt", label: "侧倾", bone: "spine_02", axis: "z", sign: 1, min: -30, max: 30 },
  ] },
  { key: "head", label: "头部", dofs: [
    { key: "nod", label: "点头", bone: "neck_01", axis: "x", sign: 1, min: -40, max: 40 },
    { key: "turn", label: "转头", bone: "neck_01", axis: "y", sign: 1, min: -70, max: 70 },
    { key: "tilt", label: "歪头", bone: "neck_01", axis: "z", sign: 1, min: -40, max: 40 },
  ] },
  { key: "shoulderL", label: "手臂-肩", side: "左", dofs: [
    { key: "raise", label: "前举", bone: "upperarm_l", axis: "z", sign: -1, min: -90, max: 160 },
    { key: "abduct", label: "外展", bone: "upperarm_l", axis: "x", sign: 1, min: -30, max: 120 },
    { key: "twist", label: "扭转", bone: "upperarm_l", axis: "y", sign: 1, min: -90, max: 90 },
  ] },
  { key: "shoulderR", label: "手臂-肩", side: "右", dofs: [
    { key: "raise", label: "前举", bone: "upperarm_r", axis: "z", sign: 1, min: -90, max: 160 },
    { key: "abduct", label: "外展", bone: "upperarm_r", axis: "x", sign: 1, min: -30, max: 120 },
    { key: "twist", label: "扭转", bone: "upperarm_r", axis: "y", sign: 1, min: -90, max: 90 },
  ] },
  { key: "elbowL", label: "肘部", side: "左", dofs: [
    { key: "bend", label: "弯曲", bone: "lowerarm_l", axis: "z", sign: -1, min: 0, max: 150 },
  ] },
  { key: "elbowR", label: "肘部", side: "右", dofs: [
    { key: "bend", label: "弯曲", bone: "lowerarm_r", axis: "z", sign: 1, min: 0, max: 150 },
  ] },
  { key: "hipL", label: "腿部-髋", side: "左", dofs: [
    { key: "raise", label: "前抬", bone: "thigh_l", axis: "x", sign: 1, min: -90, max: 120 },
    { key: "abduct", label: "外展", bone: "thigh_l", axis: "z", sign: 1, min: -45, max: 45 },
    { key: "twist", label: "扭转", bone: "thigh_l", axis: "y", sign: 1, min: -45, max: 45 },
  ] },
  { key: "hipR", label: "腿部-髋", side: "右", dofs: [
    { key: "raise", label: "前抬", bone: "thigh_r", axis: "x", sign: 1, min: -90, max: 120 },
    { key: "abduct", label: "外展", bone: "thigh_r", axis: "z", sign: 1, min: -45, max: 45 },
    { key: "twist", label: "扭转", bone: "thigh_r", axis: "y", sign: 1, min: -45, max: 45 },
  ] },
  { key: "kneeL", label: "膝", side: "左", dofs: [
    { key: "bend", label: "弯曲", bone: "calf_l", axis: "x", sign: 1, min: 0, max: 150 },
  ] },
  { key: "kneeR", label: "膝", side: "右", dofs: [
    { key: "bend", label: "弯曲", bone: "calf_r", axis: "x", sign: 1, min: 0, max: 150 },
  ] },
]);

// 全自由度索引：'partKey.dofKey' → dof 定义（含 bone/axis/sign/min/max）
export const POSE_DOF_INDEX = Object.freeze(
  Object.fromEntries(
    POSE_PARTS.flatMap((p) => p.dofs.map((d) => [`${p.key}.${d.key}`, { ...d, part: p.key, side: p.side || null }])),
  ),
);

// 20 预设（pose 字典 = { 'partKey.dofKey': 度 }；缺省=0=绑定姿势）。种子值，待浏览器标定自然度。
function pose(map) { return Object.freeze(map); }
export const POSE_PRESET_KEYS = Object.freeze([
  "stand", "tpose", "walk", "run", "sit", "crouch", "kneel1", "kneel2",
  "akimbo", "lean", "bow", "think", "fight", "kick", "throw", "push",
  "wave", "reach", "armcross", "phone",
]);
export const POSE_PRESET_LABELS = Object.freeze({
  stand: "站立", tpose: "T型", walk: "行走", run: "跑步", sit: "坐姿", crouch: "蹲下",
  kneel1: "单膝跪", kneel2: "双膝跪", akimbo: "叉腰", lean: "倚靠", bow: "鞠躬", think: "思考",
  fight: "格斗", kick: "踢球", throw: "投掷", push: "推进", wave: "招手", reach: "伸手",
  armcross: "抱臂", phone: "看手机",
});
export const POSE_PRESETS = Object.freeze({
  stand: pose({}),
  tpose: pose({ "shoulderL.abduct": 90, "shoulderR.abduct": 90 }),
  walk: pose({ "hipL.raise": 25, "hipR.raise": -15, "kneeL.bend": 20, "kneeR.bend": 10, "shoulderL.raise": 20, "shoulderR.raise": -20 }),
  run: pose({ "hipL.raise": 45, "hipR.raise": -30, "kneeL.bend": 70, "kneeR.bend": 40, "torso.lean": 18, "shoulderL.raise": 50, "shoulderR.raise": -50, "elbowL.bend": 80, "elbowR.bend": 80 }),
  sit: pose({ "hipL.raise": 85, "hipR.raise": 85, "kneeL.bend": 90, "kneeR.bend": 90 }),
  crouch: pose({ "hipL.raise": 70, "hipR.raise": 70, "kneeL.bend": 110, "kneeR.bend": 110, "torso.lean": 25 }),
  kneel1: pose({ "hipR.raise": 90, "kneeR.bend": 120, "kneeL.bend": 30 }),
  kneel2: pose({ "hipL.raise": 60, "hipR.raise": 60, "kneeL.bend": 130, "kneeR.bend": 130 }),
  akimbo: pose({ "shoulderL.abduct": 45, "shoulderR.abduct": 45, "elbowL.bend": 100, "elbowR.bend": 100 }),
  lean: pose({ "torso.tilt": 18, "body.tilt": 10 }),
  bow: pose({ "torso.lean": 40, "head.nod": 15 }),
  think: pose({ "shoulderR.raise": 70, "elbowR.bend": 120, "head.nod": 12, "head.tilt": 10 }),
  fight: pose({ "shoulderL.raise": 40, "shoulderR.raise": 35, "elbowL.bend": 90, "elbowR.bend": 85, "torso.twist": 15, "kneeL.bend": 20, "kneeR.bend": 20 }),
  kick: pose({ "hipR.raise": 80, "kneeR.bend": 20, "torso.lean": -10, "shoulderL.raise": 30 }),
  throw: pose({ "shoulderR.raise": 120, "elbowR.bend": 60, "torso.twist": -25, "shoulderL.raise": 20 }),
  push: pose({ "shoulderL.raise": 80, "shoulderR.raise": 80, "elbowL.bend": 20, "elbowR.bend": 20, "torso.lean": 15 }),
  wave: pose({ "shoulderR.raise": 130, "shoulderR.abduct": 20, "elbowR.bend": 40 }),
  reach: pose({ "shoulderR.raise": 100, "elbowR.bend": 5 }),
  armcross: pose({ "shoulderL.raise": 25, "shoulderR.raise": 25, "shoulderL.abduct": 30, "shoulderR.abduct": 30, "elbowL.bend": 120, "elbowR.bend": 120 }),
  phone: pose({ "shoulderR.raise": 60, "elbowR.bend": 100, "head.nod": 20 }),
});

function clampDof(dofKey, value) {
  const d = POSE_DOF_INDEX[dofKey];
  const v = Number(value);
  if (!d || !Number.isFinite(v)) return 0;
  return Math.min(d.max, Math.max(d.min, Math.round(v)));
}

// 当前角色的姿势值（每自由度的度数；缺省 0）。directorExt.mannequins[id].pose
export function derivePoseValues(directorExt, mannequinId) {
  const ext = directorExt?.mannequins && directorExt.mannequins[String(mannequinId)];
  const pose = (ext && ext.pose) || {};
  const presetKey = ext && typeof ext.posePresetKey === "string" ? ext.posePresetKey : null;
  const values = {};
  for (const dofKey of Object.keys(POSE_DOF_INDEX)) {
    values[dofKey] = Number.isFinite(pose[dofKey]) ? clampDof(dofKey, pose[dofKey]) : 0;
  }
  return { values, presetKey };
}

// 单自由度编辑 → directorExt.mannequins[id] 补丁（细调后清 presetKey）
export function buildPoseDofPatch(mannequinId, dofKey, value) {
  if (!POSE_DOF_INDEX[dofKey]) return null;
  return { mannequins: { [String(mannequinId)]: { pose: { [dofKey]: clampDof(dofKey, value) }, posePresetKey: null } } };
}

// 套预设 → 完整 pose 字典 + presetKey（覆盖式：先清零再套预设值，避免残留旧细调）
export function buildPosePresetPatch(mannequinId, presetKey) {
  const preset = POSE_PRESETS[presetKey];
  if (!preset) return null;
  const full = {};
  for (const dofKey of Object.keys(POSE_DOF_INDEX)) full[dofKey] = Number.isFinite(preset[dofKey]) ? clampDof(dofKey, preset[dofKey]) : 0;
  return { mannequins: { [String(mannequinId)]: { pose: full, posePresetKey: presetKey } } };
}

// ===== 姿势预设「更正」（按项目级覆盖）=====
// 种子预设 (POSE_PRESETS) 的 dof 值仅为近似；用户挑预设后手调部位滑杆校正，点「更正」把
// 当前细调后的姿势存为该预设的项目级修正定义，落 directorExt.posePresetOverrides[presetKey]。
// 套预设时优先读 override（resolvePresetPose / buildPosePresetPatchWithOverride）。

// 当前细调后的姿势值 → 该预设的覆盖补丁（只存非零 dof，与 POSE_PRESETS 同形）。
export function savePresetOverridePatch(presetKey, poseValues) {
  if (!POSE_PRESETS[presetKey]) return null;
  const dict = {};
  for (const dofKey of Object.keys(POSE_DOF_INDEX)) {
    const v = clampDof(dofKey, (poseValues || {})[dofKey]);
    if (v !== 0) dict[dofKey] = v;
  }
  return { posePresetOverrides: { [String(presetKey)]: dict } };
}

// 解析某预设的姿势字典：有项目级 override 则取 override，否则取种子 POSE_PRESETS。
export function resolvePresetPose(directorExt, presetKey) {
  const ov = directorExt && directorExt.posePresetOverrides && directorExt.posePresetOverrides[String(presetKey)];
  if (ov && typeof ov === "object" && !Array.isArray(ov)) return ov;
  return POSE_PRESETS[presetKey] || null;
}

// 套预设（含 override）→ 完整 pose 字典 + presetKey（覆盖式：先清零再套，残留细调清掉）。
export function buildPosePresetPatchWithOverride(mannequinId, presetKey, directorExt) {
  const preset = resolvePresetPose(directorExt, presetKey);
  if (!preset) return null;
  const full = {};
  for (const dofKey of Object.keys(POSE_DOF_INDEX)) full[dofKey] = Number.isFinite(preset[dofKey]) ? clampDof(dofKey, preset[dofKey]) : 0;
  return { mannequins: { [String(mannequinId)]: { pose: full, posePresetKey: presetKey } } };
}

// 姿势字典 → 每骨骼的合成轴角列表（运行时用）：{ boneName: [{axis,angleRad}, ...] }
export function poseToBoneRotations(poseValues) {
  const out = {};
  for (const [dofKey, deg] of Object.entries(poseValues || {})) {
    const d = POSE_DOF_INDEX[dofKey];
    if (!d) continue;
    const angle = (Number(deg) || 0) * d.sign * Math.PI / 180;
    if (Math.abs(angle) < 1e-6) continue;
    (out[d.bone] = out[d.bone] || []).push({ axis: d.axis, angle });
  }
  return out;
}
