import {
  clampSceneFocalLength,
  clampSceneOrbitPitch,
  forwardVectorFromYawPitch,
  normalizeAngle,
  resolveSceneCameraPose,
  SCENE_ORBIT_DISTANCE_MAX,
  SCENE_ORBIT_DISTANCE_MIN,
} from "../../src/core/panoramaSceneMath.js";

const DEG = Math.PI / 180;
const GROUND_MIN_CAMERA_Y = 0.1;
const GROUND_GUARD_PITCH_STEP = 5 * DEG;
const GROUND_GUARD_MAX_ATTEMPTS = 3;

// +pitch = 高机位（B11-① 实证，T2 回归锁）
export const SHOT_PITCH_SIGN = 1;
// 人台视觉朝向 = forwardVectorFromYawPitch(π − rotY)
//（2026-06-12 浏览器三点实验钉死 rotY∈{0, π/2, π}：偏移 π 且 yaw 符号镜像，文档 D2 终值）
export const SHOT_FACING_YAW_OFFSET = Math.PI;
export const SHOT_FACING_YAW_SIGN = -1;

export function resolveCharacterFacingYaw(rotY) {
  const yaw = Number.isFinite(rotY) ? rotY : 0;
  return SHOT_FACING_YAW_OFFSET + SHOT_FACING_YAW_SIGN * yaw;
}

// 八机位镜头语法（2026-06-12 v2，按片场惯例重调——文档 §11）。
// azimuthDeg: 相机相对角色朝向的环绕方位差，0=正前方、+90=角色右侧、null=保持当前 yaw。
// targetHeight/distance 单位为"相对脚底 × scale"的米值；top-down 取 89° 由 clamp 收敛到系统上限(≈77.3°)。
// 默会规则：目标点=构图中心（特写让眼睛落上三分线→目标取口鼻 1.58）；
// 俯仰普遍 +3~8°（相机略高于目标点=自然的人眼/肩扛感，微俯更上相）；
// 近景=胸上(1.40)、中景=腰上(1.25)、全景=全身留头脚空间(人物≈2/3画高)。
const PRESET_LIST = [
  { key: "front-closeup", label: "正面特写", azimuthDeg: 0, targetHeight: 1.58, pitchDeg: 5, distance: 1.15, focalLength: 85 },
  { key: "right-close", label: "右侧近景", azimuthDeg: 80, targetHeight: 1.4, pitchDeg: 3, distance: 2.0, focalLength: 65 },
  { key: "over-shoulder", label: "过肩镜头", azimuthDeg: 160, targetHeight: 1.45, pitchDeg: 8, distance: 1.9, focalLength: 40, gazeForward: 1.6 },
  { key: "right-medium", label: "右侧中景", azimuthDeg: 90, targetHeight: 1.25, pitchDeg: 5, distance: 3.2, focalLength: 50 },
  { key: "right-front-full", label: "右前方全景", azimuthDeg: 45, targetHeight: 1.0, pitchDeg: 4, distance: 6.5, focalLength: 35 },
  { key: "front-medium", label: "正面中景", azimuthDeg: 0, targetHeight: 1.25, pitchDeg: 5, distance: 3.2, focalLength: 50 },
  { key: "rear-high-extreme-long", label: "后上方大远景", azimuthDeg: 180, targetHeight: 1.0, pitchDeg: 28, distance: 18.0, focalLength: 24 },
  { key: "top-down", label: "俯视角", azimuthDeg: null, targetHeight: 1.0, pitchDeg: 89, distance: 8.0, focalLength: 24 },
];

export const CHARACTER_SHOT_PRESETS = Object.freeze(
  Object.fromEntries(PRESET_LIST.map((preset) => [preset.key, Object.freeze({ ...preset })])),
);
export const CHARACTER_SHOT_PRESET_KEYS = Object.freeze(PRESET_LIST.map((preset) => preset.key));

function isFiniteVector3(value) {
  return Boolean(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z);
}

export function computeCharacterShotSceneView({ mannequin, presetKey, currentSceneView = null } = {}) {
  const preset = CHARACTER_SHOT_PRESETS[presetKey];
  if (!preset) return { ok: false, reason: "unknown-preset" };
  if (!mannequin || !isFiniteVector3(mannequin.position)) return { ok: false, reason: "invalid-mannequin" };

  const scale = Number.isFinite(mannequin.scale) && mannequin.scale > 0 ? mannequin.scale : 1;
  const facingYaw = resolveCharacterFacingYaw(mannequin?.rotation?.y);

  const target = {
    x: mannequin.position.x,
    y: mannequin.position.y + preset.targetHeight * scale,
    z: mannequin.position.z,
  };
  if (Number.isFinite(preset.gazeForward)) {
    const forward = forwardVectorFromYawPitch(facingYaw, 0);
    target.x += forward.x * preset.gazeForward * scale;
    target.z += forward.z * preset.gazeForward * scale;
  }

  const orbitYaw = preset.azimuthDeg == null
    ? (Number.isFinite(currentSceneView?.orbitYaw) ? currentSceneView.orbitYaw : 0)
    : normalizeAngle(facingYaw + preset.azimuthDeg * DEG);
  let orbitPitch = clampSceneOrbitPitch(SHOT_PITCH_SIGN * preset.pitchDeg * DEG);
  const orbitDistance = Math.min(
    Math.max(preset.distance * scale, SCENE_ORBIT_DISTANCE_MIN),
    SCENE_ORBIT_DISTANCE_MAX,
  );
  const focalLength = clampSceneFocalLength(preset.focalLength);

  const buildView = () => ({
    target: { ...target },
    orbitYaw,
    orbitPitch,
    orbitDistance,
    focalLength,
  });

  // 地面防穿（文档 §2.2-8）：先逐步抬俯仰，仍不满足则上浮目标点
  let attempts = 0;
  while (
    attempts < GROUND_GUARD_MAX_ATTEMPTS
    && resolveSceneCameraPose(buildView()).position.y < GROUND_MIN_CAMERA_Y
  ) {
    orbitPitch = clampSceneOrbitPitch(orbitPitch + GROUND_GUARD_PITCH_STEP);
    attempts += 1;
  }
  const cameraY = resolveSceneCameraPose(buildView()).position.y;
  if (cameraY < GROUND_MIN_CAMERA_Y) {
    target.y += GROUND_MIN_CAMERA_Y - cameraY;
  }

  return { ok: true, presetKey, sceneView: buildView() };
}
