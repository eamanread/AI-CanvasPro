// 3D导演台·编辑器外壳纯逻辑（V0-V5，文档 11/13/14）
// 全部纯函数：从 sceneState/directorExt 派生视图模型，把编辑转成 action/patch 参数。
// DOM 渲染与事件在 modules/panoramaDirectorChrome.autoload.js。零 DOM 依赖、可测。
import { clampSceneFocalLength, computeStableGridSnap, SCENE_SENSOR_WIDTH_MM } from "../../src/core/panoramaSceneMath.js";

// 视野角度(FOV)对外用【水平 FOV】(传感器宽 36mm)，与竞品一致(15–90°)。
// 为什么：引擎内置 focalLengthToFov/fovToFocalLength 用的是【垂直 FOV】(传感器高 24mm)→ 焦距[16,135] 只映射垂直[10°,74°]，
// 滑杆拖到 15/90 两端会塌进死区(用户报"奇怪")。水平 FOV 下 焦距[16,135]↔水平[15.2°,96.7°]，整段 15–90 落在合法焦距[18,135]，无死区。
// 不动桥层(桥仍按焦距→垂直FOV渲染,焦距才是真相)；这里只把"标注/换算用的角"换成水平，使滑杆数值对齐竞品。
const SCENE_SENSOR_W = Number(SCENE_SENSOR_WIDTH_MM) || 36;
export function focalToHorizontalFov(focal) {
  const f = clampSceneFocalLength(focal);
  return (2 * Math.atan(SCENE_SENSOR_W / (2 * f)) * 180) / Math.PI;
}
export function horizontalFovToFocal(fovDeg) {
  const deg = Math.max(1, Math.min(179, Number(fovDeg) || 0));
  return clampSceneFocalLength(SCENE_SENSOR_W / (2 * Math.tan((deg * Math.PI) / 360)));
}

// 人偶 colorKey 是枚举（red/blue/green/...），真实材质色在混淆注册表里；
// 此表仅供场景树/检查器的色块"显示"用，命名与竞品一致（角色B 红=#F75353）。
export const MANNEQUIN_COLOR_HEX = Object.freeze({
  red: "#F75353",
  blue: "#4C7DF7",
  green: "#37C871",
  cyan: "#3FC6CE",
  purple: "#9B6BF5",
  yellow: "#E6C04A",
  white: "#E8E8E8",
});
const CHAR_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const DIRECTOR_VIEW_MODES = Object.freeze(["director", "camera"]);

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
function radToDeg(r) {
  const v = Number(r);
  return Number.isFinite(v) ? Math.round((v * 180) / Math.PI) : 0;
}
function degToRad(d) {
  const v = Number(d);
  return Number.isFinite(v) ? (v * Math.PI) / 180 : 0;
}
function charLabel(index) {
  return `角色${CHAR_LABELS[index] || index + 1}`;
}

export function mannequinColorHex(colorKey) {
  return MANNEQUIN_COLOR_HEX[String(colorKey || "").toLowerCase()] || "#888888";
}

// 人偶显示名：自定义名优先（directorExt.mannequins[id].name，非空），否则回落派生标签 charLabel(idx)。
// 人偶无原生 name 字段；自定义名落 directorExt（sceneNode 封闭）。
export function mannequinDisplayName(directorExt, id, idx) {
  const ext = directorExt && directorExt.mannequins && directorExt.mannequins[String(id)];
  const name = ext && typeof ext.name === "string" ? ext.name.trim() : "";
  return name || charLabel(idx);
}
// 人偶改名 → directorExt.mannequins[id].name 补丁（空串清回派生标签）。
export function mannequinNamePatch(id, name) {
  const v = typeof name === "string" ? name.trim() : "";
  return { mannequins: { [String(id)]: { name: v } } };
}

// ===== 场景树 可见性👁 + 锁定🔒（状态走 directorExt，sceneNode 封闭——见下方铁律）=====
// sceneNode.normalize 白名单不含 visible/locked（已实证：mannequin/camera 上会被剥离），
// 因此可见性/锁定一律存 node.directorExt.visibility / .locked，且【用数组】不用 Set
//（Set 不能 JSON 序列化、过不了 store 往返/持久化）。
//   directorExt.visibility = { mannequinIds: ['m1',...], cameraIds: [...] }   命中 = 隐藏
//   directorExt.locked     = { mannequinIds: ['m1',...], cameraIds: [...] }   命中 = 锁定
function extIdArray(ext, group, kind) {
  const g = ext && ext[group];
  const key = kind === "camera" ? "cameraIds" : "mannequinIds";
  const arr = g && g[key];
  return Array.isArray(arr) ? arr.map(String) : [];
}
// 是否隐藏（命中 visibility）；默认显示。
export function isObjectHidden(kind, id, directorExt) {
  return extIdArray(directorExt, "visibility", kind).includes(String(id));
}
// 是否锁定（命中 locked）。
export function isObjectLocked(kind, id, directorExt) {
  return extIdArray(directorExt, "locked", kind).includes(String(id));
}
// 锁定对象不可被选中（用于树行点击 / setSelection 拦截）。
export function canSelectObject(kind, id, directorExt) {
  return !isObjectLocked(kind, id, directorExt);
}
// 切换某 id 在 directorExt.<group>.<...Ids> 数组中的存废，返回【完整数组】的补丁
//（深合并里数组是替换语义，所以必须回传切换后的整组数组）。
function toggleIdPatch(group, kind, id, directorExt) {
  const key = kind === "camera" ? "cameraIds" : "mannequinIds";
  const cur = extIdArray(directorExt, group, kind);
  const sid = String(id);
  const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : cur.concat(sid);
  return { [group]: { [key]: next } };
}
export function toggleVisibilityPatch(kind, id, directorExt) {
  return toggleIdPatch("visibility", kind, id, directorExt);
}
export function toggleLockPatch(kind, id, directorExt) {
  return toggleIdPatch("locked", kind, id, directorExt);
}

// 场景树：机位（可命名）+ 角色（按序号派生标签 角色A/B…）
// directorExt 可选：给每行附 visible/locked（从 directorExt.visibility/.locked 数组派生）。
export function deriveSceneTree(sceneState, directorExt) {
  const cameras = (Array.isArray(sceneState?.cameras) ? sceneState.cameras : []).map((c, i) => {
    const id = String(c?.id ?? "");
    return {
      id,
      type: "camera",
      label: String(c?.name || "").trim() || `机位${i + 1}`,
      visible: !isObjectHidden("camera", id, directorExt),
      locked: isObjectLocked("camera", id, directorExt),
    };
  });
  const characters = (Array.isArray(sceneState?.mannequins) ? sceneState.mannequins : []).map((m, i) => {
    const id = String(m?.id ?? "");
    return {
      id,
      type: "mannequin",
      label: mannequinDisplayName(directorExt, id, i),
      colorHex: mannequinColorHex(m?.colorKey),
      visible: !isObjectHidden("mannequin", id, directorExt),
      locked: isObjectLocked("mannequin", id, directorExt),
    };
  });
  return { cameras, characters };
}

// 树过滤（搜索框）
export function filterSceneTree(tree, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return tree;
  const hit = (item) => item.label.toLowerCase().includes(q);
  return { cameras: tree.cameras.filter(hit), characters: tree.characters.filter(hit) };
}

// 当前选中对象的检查器视图模型（人偶=可编辑变换；机位=名称/位置/注视/FOV）。
// directorExt 可选：机位的注视目标/坐标存 directorExt.cameras[id]（sceneNode 封闭）。
export function deriveInspector(sceneState, directorExt) {
  const sel = sceneState?.selection || {};
  if (sel.selectedObjectType === "mannequin") {
    const list = Array.isArray(sceneState?.mannequins) ? sceneState.mannequins : [];
    const idx = list.findIndex((m) => String(m?.id) === String(sel.selectedObjectId));
    if (idx < 0) return null;
    const m = list[idx];
    const multi = Array.isArray(sel.selectedObjects) && sel.selectedObjects.length > 1;
    const locked = isObjectLocked("mannequin", m.id, directorExt);
    return {
      kind: "mannequin",
      id: String(m.id),
      title: "角色",
      label: mannequinDisplayName(directorExt, m.id, idx),
      colorHex: mannequinColorHex(m.colorKey),
      colorKey: String(m.colorKey || "").toLowerCase(),
      locked,
      editable: !multi && !locked,
      fields: {
        posX: round2(m.position?.x),
        posY: round2(m.position?.y),
        posZ: round2(m.position?.z),
        rotXDeg: radToDeg(m.rotation?.x),
        rotYDeg: radToDeg(m.rotation?.y),
        rotZDeg: radToDeg(m.rotation?.z),
        scale: round2(Number.isFinite(m.scale) && m.scale > 0 ? m.scale : 1),
      },
    };
  }
  // 注意：sceneNode.selection 不支持 'camera'（setPanoramaSceneSelection 只收 mannequin/cube）。
  // 机位检查器由导演侧选中触发 → 见 deriveCameraInspector（autoload 传 dcCameraId）。
  if (sel.selectedObjectType === "camera") {
    return deriveCameraInspector(sceneState, directorExt, sel.selectedObjectId);
  }
  return null;
}

// 机位检查器视图模型（机位不可经原生 selection 选中，由导演侧 dcCameraId 触发）
export function deriveCameraInspector(sceneState, directorExt, cameraId) {
  const list = Array.isArray(sceneState?.cameras) ? sceneState.cameras : [];
  const idx = list.findIndex((c) => String(c?.id) === String(cameraId));
  if (idx < 0) return null;
  const c = list[idx];
  const ext = (directorExt?.cameras && directorExt.cameras[String(c.id)]) || {};
  const focal = clampSceneFocalLength(Number.isFinite(ext.focalLength) ? ext.focalLength : c.focalLength);
  const pos = ext.position || c.position || { x: 0, y: 1.6, z: 0 };
  const mannequins = Array.isArray(sceneState?.mannequins) ? sceneState.mannequins : [];
  const locked = isObjectLocked("camera", c.id, directorExt);
  return {
    kind: "camera",
    id: String(c.id),
    title: "摄像机",
    label: String(c.name || "").trim() || `机位${idx + 1}`,
    slot: c.slot ?? null,
    focalLength: round2(focal),
    fovDeg: Math.round(focalToHorizontalFov(focal)), // 水平 FOV(15–90°,对齐竞品)，非垂直 focalLengthToFov
    position: { x: round2(pos.x), y: round2(pos.y), z: round2(pos.z) },
    lookAtTarget: typeof ext.lookAtTarget === "string" ? ext.lookAtTarget : "manual",
    lookAtPoint: ext.lookAtPoint && Number.isFinite(ext.lookAtPoint.x)
      ? { x: round2(ext.lookAtPoint.x), y: round2(ext.lookAtPoint.y), z: round2(ext.lookAtPoint.z) }
      : { x: 0, y: 1.2, z: 0 },
    targetOptions: [{ value: "manual", label: "手动坐标" }].concat(
      mannequins.map((m, i) => ({ value: String(m.id), label: charLabel(i) })),
    ),
    // 截图数（仅计数入签名 → 截图/清空时检查器重渲；gallery 渲染时再读完整 captures 数组，避免大 dataURL 入签名）
    capturesCount: resolveCameraCaptures(directorExt, c.id).length,
    locked,
    editable: !locked,
  };
}

// ===== 摄像机检查器：切换机位 dropdown 选项 + 预览占位文字（降级，无离屏渲染）=====
// 机位下拉：列出所有机位，标注当前激活（viewport.activeCameraId / 导演侧 dcCameraId）。
export function deriveCameraOptions(sceneState, activeCameraId) {
  const list = Array.isArray(sceneState?.cameras) ? sceneState.cameras : [];
  const active = activeCameraId == null ? null : String(activeCameraId);
  return list.map((c, i) => {
    const id = String(c?.id ?? "");
    return {
      value: id,
      label: String(c?.name || "").trim() || `机位${i + 1}`,
      active: active != null && id === active,
    };
  });
}
// 解析当前激活机位 id：优先导演侧 dcCameraId，其次 viewport.activeCameraId，再回落首个机位。
export function resolveActiveCameraId(sceneState, dcCameraId) {
  const list = Array.isArray(sceneState?.cameras) ? sceneState.cameras : [];
  const dc = dcCameraId == null ? "" : String(dcCameraId);
  if (dc && list.some((c) => String(c?.id) === dc)) return dc;
  const vp = sceneState?.viewport?.activeCameraId;
  if (vp != null && list.some((c) => String(c?.id) === String(vp))) return String(vp);
  return list.length ? String(list[0].id) : null;
}
// 相机预览缩略图【降级占位文字】（无离屏渲染）：机位N · {fov}° / {focal}mm。
// 入参用 deriveCameraInspector 的视图模型（已含 label/fovDeg/focalLength）。
export function cameraPreviewPlaceholderText(cameraInspector) {
  const c = cameraInspector || {};
  const label = String(c.label || "机位");
  const fov = Number.isFinite(c.fovDeg) ? Math.round(c.fovDeg) : 0;
  const focal = Number.isFinite(c.focalLength) ? round2(c.focalLength) : 0;
  return `${label} · ${fov}° / ${focal}mm`;
}

// ===== V3: 机位（注视点→orbit sceneView，绕开 upsert/slot）=====
// 给定机位世界位置 + 注视点 + 焦距，算出 huanying orbit 相机 sceneView。
// 坐标约定(B3)：position = target + dist·(cosPitch·sinYaw, sinPitch, cosPitch·cosYaw)。
export function cameraOrbitFromLookAt({ position, lookAtPoint, focalLength }) {
  const P = position || { x: 0, y: 1.6, z: 5 };
  const L = lookAtPoint || { x: 0, y: 1.2, z: 0 };
  const dir = { x: P.x - L.x, y: P.y - L.y, z: P.z - L.z };
  const distance = Math.max(0.05, Math.hypot(dir.x, dir.y, dir.z));
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y / distance)));
  const yaw = Math.atan2(dir.x, dir.z);
  return {
    target: { x: L.x, y: L.y, z: L.z },
    orbitYaw: yaw,
    orbitPitch: pitch,
    orbitDistance: distance,
    // sceneView.focalLength 经 normalize 存活（fov 会被剥离）。它是 orbit 视图焦距的“意图载体”：
    // 桥层 orbit FOV 实际只认 bridge._defaultSceneFocalLength，故运行时会把此值同步进桥（见 syncSceneViewFocalLength）。
    focalLength: clampSceneFocalLength(focalLength),
  };
}

// 解析某机位的注视点：手动=lookAtPoint；角色=该人台头部（脚底+1.72·scale）
export function resolveCameraLookAtPoint(cameraExt, mannequins) {
  const ext = cameraExt || {};
  if (ext.lookAtTarget && ext.lookAtTarget !== "manual") {
    const m = (Array.isArray(mannequins) ? mannequins : []).find((x) => String(x?.id) === String(ext.lookAtTarget));
    if (m && m.position) {
      const s = Number.isFinite(m.scale) && m.scale > 0 ? m.scale : 1;
      return { x: m.position.x, y: m.position.y + 1.72 * s, z: m.position.z };
    }
  }
  const p = ext.lookAtPoint;
  return p && Number.isFinite(p.x) ? { x: p.x, y: p.y, z: p.z } : { x: 0, y: 1.2, z: 0 };
}

// 机位 FOV(水平度,15–90) → directorExt.cameras[id] 焦距补丁。
// 用水平换算(horizontalFovToFocal)，使滑杆 15–90 整段映射到合法焦距[18,135]、无死区(对齐竞品)。
export function cameraFovPatch(cameraId, fovDeg) {
  const focal = horizontalFovToFocal(fovDeg);
  return { cameras: { [String(cameraId)]: { focalLength: focal } } };
}
export function cameraLookAtTargetPatch(cameraId, target) {
  return { cameras: { [String(cameraId)]: { lookAtTarget: String(target || "manual") } } };
}
export function cameraLookAtPointPatch(cameraId, axis, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  return { cameras: { [String(cameraId)]: { lookAtPoint: { [axis]: v } } } };
}

// 检查器单字段编辑 → updatePanoramaSceneObjectTransform 的 pose 补丁。
// ⚠️ 实测：updatePanoramaSceneObjectTransform 收到部分 pose 会把缺失字段重置为默认
//（只发 {scale} 会把 position 归零）。因此【始终输出完整 pose】，只改被编辑字段。
export function buildMannequinPosePatch(field, rawValue, currentFields) {
  const f = currentFields || {};
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  const pose = {
    position: { x: Number(f.posX) || 0, y: Number(f.posY) || 0, z: Number(f.posZ) || 0 },
    rotation: {
      x: degToRad(Number(f.rotXDeg) || 0),
      y: degToRad(Number(f.rotYDeg) || 0),
      z: degToRad(Number(f.rotZDeg) || 0),
    },
    scale: Math.max(0.05, Number(f.scale) || 1),
  };
  switch (field) {
    case "posX": pose.position.x = value; break;
    case "posY": pose.position.y = value; break;
    case "posZ": pose.position.z = value; break;
    case "rotXDeg": pose.rotation.x = degToRad(value); break;
    case "rotYDeg": pose.rotation.y = degToRad(value); break;
    case "rotZDeg": pose.rotation.z = degToRad(value); break;
    case "scale": pose.scale = Math.max(0.05, value); break;
    default: return null;
  }
  return pose;
}

// ===== V1: 取景比例（文档 13/14 V1，状态落 node.directorExt.aspect）=====
export const ASPECT_PRESETS = Object.freeze([
  { key: "adaptive", label: "Auto", ratio: null },
  { key: "21:9", label: "21:9", ratio: 21 / 9 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "3:4", label: "3:4", ratio: 3 / 4 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
]);
const ASPECT_KEYS = new Set(ASPECT_PRESETS.map((p) => p.key));

// 比例存 node.directorExt.aspect（sceneNode 封闭，capture.mode 不可承载——spike 修正）
export function deriveCaptureAspect(node) {
  const a = node?.directorExt?.aspect;
  return ASPECT_KEYS.has(a) ? a : "adaptive";
}

// directorExt 深合并：嵌套对象递归合并，数组/原始值替换。
// V2-V4 按 id 写嵌套（panoramaSphere.radiusScale/.yawOffset、mannequins[id].pose）时不互相冲掉。
export function mergeDirectorExt(current, patch) {
  const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (!isObj(patch)) return patch;
  if (!isObj(current)) return mergeDirectorExt({}, patch);
  const out = { ...current };
  for (const k of Object.keys(patch)) {
    out[k] = isObj(out[k]) && isObj(patch[k]) ? mergeDirectorExt(out[k], patch[k]) : patch[k];
  }
  return out;
}

// 自绘安全框：给定比例 key + 视口尺寸，算内接取景框（adaptive=满框，无遮罩）
export function computeSafeFrameRect(aspectKey, viewportW, viewportH) {
  const W = Number(viewportW) || 0;
  const H = Number(viewportH) || 0;
  const preset = ASPECT_PRESETS.find((p) => p.key === aspectKey);
  if (!preset || preset.ratio == null || W <= 0 || H <= 0) {
    return { x: 0, y: 0, w: W, h: H, full: true };
  }
  const target = preset.ratio;
  const viewRatio = W / H;
  let w;
  let h;
  if (viewRatio > target) { h = H; w = H * target; } // 视口更宽→高占满，左右留边
  else { w = W; h = W / target; }                     // 视口更高→宽占满，上下留边
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, full: false };
}

// ===== V1: 变换模式（move/rotate/scale + V/R/S，复用 ui.transformTool）=====
export const TRANSFORM_MODES = Object.freeze([
  { key: "move", label: "移动", hotkey: "V" },
  { key: "rotate", label: "旋转", hotkey: "R" },
  { key: "scale", label: "缩放", hotkey: "S" },
]);
const TRANSFORM_KEYS = new Set(TRANSFORM_MODES.map((m) => m.key));
const HOTKEY_TO_MODE = Object.freeze({ v: "move", r: "rotate", s: "scale" });

export function deriveTransformMode(sceneState) {
  const t = sceneState?.ui?.transformTool;
  return TRANSFORM_KEYS.has(t) ? t : "move";
}
export function transformModeForHotkey(key) {
  return HOTKEY_TO_MODE[String(key || "").toLowerCase()] || null;
}

// ===== V2: 全局场景检查器（无选中时"3D场景"，状态分布 sceneView + directorExt）=====
export const SCENE_DISTANCE_RANGE = Object.freeze({ min: 0.5, max: 60, default: 9 });
export const SPHERE_RADIUS_SCALE_RANGE = Object.freeze({ min: 0.3, max: 2.5, default: 1 });
export const DEFAULT_SKY_COLOR = "#060608";

function clampRange(value, range, fallback) {
  const v = Number(value);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(range.max, Math.max(range.min, v));
}

// 空选中 → 3D场景视图模型。sceneState=已 normalize 的场景；directorExt=node.directorExt
export function deriveSceneGlobal(sceneState, directorExt) {
  const ext = directorExt || {};
  const sphere = ext.panoramaSphere || {};
  const sv = sceneState?.viewport?.sceneView || {};
  const pano = sceneState?.panorama || {};
  const skyColor = typeof ext.environmentSkyColor === "string" && /^#[0-9a-fA-F]{6}$/.test(ext.environmentSkyColor)
    ? ext.environmentSkyColor
    : DEFAULT_SKY_COLOR;
  return {
    sceneDistance: round2(clampRange(sv.orbitDistance, SCENE_DISTANCE_RANGE, SCENE_DISTANCE_RANGE.default)),
    sphereRadiusScale: round2(clampRange(sphere.radiusScale, SPHERE_RADIUS_SCALE_RANGE, SPHERE_RADIUS_SCALE_RANGE.default)),
    sphereYawDeg: Math.round(((Number(sphere.yawOffset) || 0) * 180) / Math.PI),
    skyColor,
    // 地面状态并入模型 → 切换地面 toggle 时检查器签名变化，轮询自然重渲（透明度/高度滑杆显隐）
    ground: {
      visible: (ext.ground?.visible) !== false,
      opacity: resolveGroundOpacity(ext),
      height: resolveGroundHeight(ext),
    },
    panorama: {
      hasImage: Boolean(pano.imageUrl || pano.localPath),
      imageUrl: String(pano.imageUrl || ""),
      fileName: String(pano.fileName || ""),
    },
  };
}

// 场景缩放编辑 → sceneView 补丁（仅改 orbitDistance，其余原样回传给 applyPanoramaSceneViewCommit）
export function buildSceneDistancePatch(currentSceneView, distance) {
  const d = clampRange(distance, SCENE_DISTANCE_RANGE, SCENE_DISTANCE_RANGE.default);
  const sv = currentSceneView || {};
  return { ...sv, orbitDistance: d };
}

// 全景球水平旋转(度) → directorExt.panoramaSphere.yawOffset(弧度)
export function sphereYawPatch(deg) {
  const d = Number(deg);
  return { panoramaSphere: { yawOffset: Number.isFinite(d) ? (d * Math.PI) / 180 : 0 } };
}
export function sphereRadiusPatch(scale) {
  return { panoramaSphere: { radiusScale: clampRange(scale, SPHERE_RADIUS_SCALE_RANGE, SPHERE_RADIUS_SCALE_RANGE.default) } };
}
export function skyColorPatch(hex) {
  const c = String(hex || "");
  return { environmentSkyColor: /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_SKY_COLOR };
}

// ===== 网格吸附 (Grid Snap)：人偶拖拽落地对齐到网格 =====
// 3D 舞台网格单位（与舞台地面网格 0.5m 一致）；snapGrid 开关存 directorExt.snapGrid.enabled。
export const SNAP_GRID_SIZE = 0.5;
export function resolveSnapGridEnabled(directorExt) {
  return !!(directorExt && directorExt.snapGrid && directorExt.snapGrid.enabled === true);
}
export function snapGridPatch(enabled) {
  return { snapGrid: { enabled: enabled === true } };
}
// 给定人偶当前完整姿势字段（deriveInspector().fields 形态：posX/posY/posZ/rot*Deg/scale），
// 把 X/Z 吸附到网格，返回【完整 pose】（partial pose 会重置缺失字段——见 buildMannequinPosePatch 注释）。
// prevSnap 为该人偶上次吸附的 {x,z}（滞回稳定，避免边界抖动），首次传 null。
export function buildGridSnapPose(currentFields, gridSize = SNAP_GRID_SIZE, prevSnap = null) {
  const f = currentFields || {};
  const g = Math.max(0.0001, Number(gridSize) || SNAP_GRID_SIZE);
  const px = Number(f.posX) || 0;
  const pz = Number(f.posZ) || 0;
  const sx = computeStableGridSnap(px, g, prevSnap && Number.isFinite(prevSnap.x) ? prevSnap.x : null, 0.12);
  const sz = computeStableGridSnap(pz, g, prevSnap && Number.isFinite(prevSnap.z) ? prevSnap.z : null, 0.12);
  return {
    position: { x: sx, y: Number(f.posY) || 0, z: sz },
    rotation: {
      x: degToRad(Number(f.rotXDeg) || 0),
      y: degToRad(Number(f.rotYDeg) || 0),
      z: degToRad(Number(f.rotZDeg) || 0),
    },
    scale: Math.max(0.05, Number(f.scale) || 1),
  };
}

// ===== 人偶头顶名牌 (角色标签)：开关 + 标签文字 + 头顶坐标 =====
// 开关存 directorExt.mannequinLabels.visible（默认 true）。
export function resolveMannequinLabelsVisible(directorExt) {
  return directorExt?.mannequinLabels?.visible ?? true;
}
export function mannequinLabelsVisiblePatch(visible) {
  return { mannequinLabels: { visible: visible === true } };
}
// 标签文字：自定义名优先（directorExt.mannequins[id].name），否则按下标 charLabel(idx)。
// directorExt 可选——不传则回落派生名（向后兼容）。修复：改名后头顶名牌跟随。
export function labelForMannequinId(id, mannequins, directorExt) {
  const list = Array.isArray(mannequins) ? mannequins : [];
  const idx = list.findIndex((m) => String(m?.id) === String(id));
  return mannequinDisplayName(directorExt, id, idx >= 0 ? idx : 0);
}
// 名牌头顶 Y 坐标：人偶 group 脚底 Y + 角色身高(1.92)·scale + 偏移(默认 0.3m)。
export const CHARACTER_LABEL_HEIGHT = 1.92;
export function computeLabelPositionY(groupY, scale = 1, offset = 0.3) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return (Number(groupY) || 0) + CHARACTER_LABEL_HEIGHT * s + (Number(offset) || 0);
}

// ===== 地面 透明度 + 高度（对齐竞品 3D场景 地面 toggle 下的两条 slider）=====
// 状态：directorExt.ground.opacity (0..1) + directorExt.ground.height (Y 位置)。
// 复用 ground.visible 同枝（深合并：写 opacity/height 不冲掉 visible，反之亦然）。
// 竞品默认透明度 0.40；但运行时【仅当用户显式设过（是 number）才强制】，否则不覆盖原生每帧值。
export const GROUND_OPACITY_RANGE = Object.freeze({ min: 0, max: 1, default: 0.4 });
export const GROUND_HEIGHT_RANGE = Object.freeze({ min: -2, max: 2, default: 0 });

function clampGroundRange(value, range) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  return Math.min(range.max, Math.max(range.min, v));
}
// UI 展示用：未设过则回落默认值（让滑杆有初值），区别于"是否强制运行时"（见 isGroundOpacityUserSet）。
export function resolveGroundOpacity(directorExt) {
  const v = directorExt?.ground?.opacity;
  const c = clampGroundRange(v, GROUND_OPACITY_RANGE);
  return c == null ? GROUND_OPACITY_RANGE.default : round2(c);
}
export function resolveGroundHeight(directorExt) {
  const v = directorExt?.ground?.height;
  const c = clampGroundRange(v, GROUND_HEIGHT_RANGE);
  return c == null ? GROUND_HEIGHT_RANGE.default : round2(c);
}
// 用户是否显式设过 → 决定运行时是否强制覆盖原生值（未设过 = 留给原生）。
export function isGroundOpacityUserSet(directorExt) {
  return Number.isFinite(directorExt?.ground?.opacity);
}
export function isGroundHeightUserSet(directorExt) {
  return Number.isFinite(directorExt?.ground?.height);
}
export function groundOpacityPatch(opacity) {
  const c = clampGroundRange(opacity, GROUND_OPACITY_RANGE);
  return { ground: { opacity: c == null ? GROUND_OPACITY_RANGE.default : c } };
}
export function groundHeightPatch(height) {
  const c = clampGroundRange(height, GROUND_HEIGHT_RANGE);
  return { ground: { height: c == null ? GROUND_HEIGHT_RANGE.default : c } };
}

// ===== 场景树行右键菜单：纯动作助手（show/hide + lock/unlock 复用 toggle*Patch；构建菜单项）=====
// 返回某行右键菜单的项描述（label/action/disabled），DOM 在 autoload 渲染（真机验证显隐）。
// 注意：toggle*Patch 已被既有测试覆盖，这里只测"菜单项装配"这一新纯逻辑。
export function buildTreeContextMenuItems(item) {
  const it = item || {};
  const visible = it.visible !== false;
  const locked = !!it.locked;
  return [
    { action: "group", label: "打组", disabled: true, devNote: "成组（开发中：无干净的建组 action / 运行时成组语义未验证）" },
    { action: "toggleVisibility", label: visible ? "隐藏" : "显示", disabled: false },
    { action: "toggleLock", label: locked ? "解锁" : "锁定", disabled: false },
    { action: "delete", label: "删除", disabled: false, danger: true },
  ];
}

// ===== 摄像机截图 gallery：每机位截图列表（directorExt.cameras[id].captures = [dataURL,...]）=====
// 用数组（深合并里数组替换语义）。push/clear 均回传完整数组补丁。
export const MAX_CAMERA_CAPTURES = 24;
export function resolveCameraCaptures(directorExt, cameraId) {
  const ext = directorExt?.cameras && directorExt.cameras[String(cameraId)];
  const arr = ext && ext.captures;
  return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x) : [];
}
// 追加一张截图（dataURL）；超出上限丢最旧（FIFO，防 directorExt 无限膨胀）。
export function appendCameraCapturePatch(cameraId, dataUrl, directorExt) {
  const url = typeof dataUrl === "string" ? dataUrl : "";
  if (!url) return null;
  const cur = resolveCameraCaptures(directorExt, cameraId);
  let next = cur.concat(url);
  if (next.length > MAX_CAMERA_CAPTURES) next = next.slice(next.length - MAX_CAMERA_CAPTURES);
  return { cameras: { [String(cameraId)]: { captures: next } } };
}
export function clearCameraCapturesPatch(cameraId) {
  return { cameras: { [String(cameraId)]: { captures: [] } } };
}
// 空态文案（对齐竞品"暂无摄像机截图"）。
export function cameraCapturesEmptyText() {
  return "暂无摄像机截图";
}

export { charLabel, round2, radToDeg, degToRad };
