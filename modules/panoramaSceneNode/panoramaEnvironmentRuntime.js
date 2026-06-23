// 3D导演台·全景环境运行时（P1-P3 + 地面投影穹顶，文档 §12/§16）
// 零侵入：对 PanoramaScene3DBridge 安装原型访问器钩子，scene 模式下消费 sceneNode.panorama：
// - 地面投影穹顶（GroundedSkybox 算法）：按拍摄视高把全景下半球投影到地面平面——
//   人物站进全景地板、全景地平线与舞台地平线对齐（2026-06-12 用户反馈：比例失锚/地平线不一致）；
// - 克隆 equirect 纹理作 scene.environment（IBL）；
// - 舞台自有地面隐藏、网格淡化（摆位参考保留）；
// - 从全景估主光驱动补充平行光。
// 卸载全景即整体恢复原状；360 查看模式（panorama-360 节点）不干预。
import * as THREE from "./threeRuntime.js";
import { PanoramaScene3DBridge } from "./scene3dBridge.js";
import appStore from "../../src/core/stores/appStore.js";
import {
  isObjectHidden,
  labelForMannequinId,
  labelForCubeId,
  computeLabelPositionY,
  resolveMannequinLabelsVisible,
  resolveGroundOpacity,
  resolveGroundHeight,
  isGroundOpacityUserSet,
  isGroundHeightUserSet,
} from "../../components/panoramaScene/DirectorChrome.js";
import { derivePoseValues, poseToBoneRotations } from "../../components/panoramaScene/characterPose.js";
import { applyPoseToModel } from "./panoramaCharacterPoseRuntime.js";

const GRID_DIM_OPACITY_SCALE = 0.12;
const PANO_DOME_NAME = "__hyPanoDome";
const PANO_SUN_NAME = "__hyPanoSun";
// 拍摄视高：全景/效果图默认按站立人眼高度拍摄（行业惯例），赤道线=地平线落在 1.6m 视高
const PANO_CAPTURE_HEIGHT = 1.6;
// 穹顶半径须覆盖最大机位距离（后上方大远景 18m×scale），并给地板透视留延展
const PANO_DOME_RADIUS = 24;

// 钩点：桥的构造函数会用闭包覆盖实例方法（实测：朴素原型包装 0 调用——实例自有属性遮蔽）。
// 因此用原型【访问器陷阱】：构造期 `this.x = fn` 的赋值必经原型 setter（实例尚无同名自有属性），
// 在 setter 中包装；getter 兜底包装原型原方法。
// renderNow 内部顺序是「_syncInfiniteGrid 重算网格透明度 → renderer.render」（对抗审查实证），
// 因此网格压制必须发生在 fn.apply 之【前】才能进入当帧渲染；dome/env 同步仍放在之后。
const HOOK_METHODS = [
  { name: "_syncPanoramaCanvasVisibility", preSuppress: false },
  { name: "renderNow", preSuppress: true },
];

function warnOnce(bridge, error) {
  if (bridge && !bridge.__hyPanoEnvWarned) {
    bridge.__hyPanoEnvWarned = true;
    console.warn("[panoramaEnvironment] sync failed:", error?.message || error);
  }
}

function hookMethodViaAccessor(proto, { name, preSuppress }) {
  const original = proto[name];
  if (typeof original !== "function") return false;
  const INNER = Symbol(`hyPanoEnvInner:${name}`);
  const WRAPPED = Symbol(`hyPanoEnvWrapped:${name}`);
  const makeWrapper = (fn) => function hyPanoEnvHook(...args) {
    if (preSuppress) {
      try {
        preRenderGridSuppress(this);
      } catch {
        /* fail-open */
      }
    }
    const result = fn.apply(this, args);
    try {
      syncPanoramaEnvironment(this);
    } catch (error) {
      warnOnce(this, error);
    }
    return result;
  };
  const protoWrapper = makeWrapper(original);
  Object.defineProperty(proto, name, {
    configurable: true,
    get() {
      if (this === proto) return protoWrapper;
      if (this[INNER]) {
        if (!this[WRAPPED]) {
          Object.defineProperty(this, WRAPPED, { value: makeWrapper(this[INNER]), configurable: true, writable: true });
        }
        return this[WRAPPED];
      }
      return protoWrapper;
    },
    set(value) {
      Object.defineProperty(this, INNER, { value, configurable: true, writable: true });
      Object.defineProperty(this, WRAPPED, {
        value: typeof value === "function" ? makeWrapper(value) : value,
        configurable: true,
        writable: true,
      });
    },
  });
  return true;
}

export function installPanoramaEnvironmentRuntime() {
  const proto = PanoramaScene3DBridge?.prototype;
  if (!proto) return false;
  if (proto.__hyPanoEnvInstalled) return true;
  let hooked = 0;
  for (const spec of HOOK_METHODS) {
    if (hookMethodViaAccessor(proto, spec)) hooked += 1;
  }
  if (hooked === 0) return false;
  proto.__hyPanoEnvInstalled = true;
  return true;
}

function findScene(bridge) {
  if (bridge.__hyScene?.isScene) return bridge.__hyScene;
  for (const key of Object.keys(bridge)) {
    const value = bridge[key];
    if (value && value.isScene) {
      bridge.__hyScene = value;
      return value;
    }
  }
  return null;
}

function isSceneMode(bridge) {
  try {
    if (typeof bridge._isPanorama360Mode === "function") {
      return !bridge._isPanorama360Mode(bridge._sceneState);
    }
  } catch {
    /* fall through */
  }
  return true;
}

// ---- 地面投影（GroundedSkybox 核心算法）----
// 球心=拍摄视点；下半球顶点沿视线方向投影到 y=-height 平面（射线长截断于半径），
// UV 不变 → 全景下半球像素铺成真实地板。整体上移 height-0.01 后地板落于舞台地面。
function applyGroundedProjection(geometry, radius, height) {
  const pos = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    if (v.y < 0) {
      const dir = v.clone().normalize();
      const t = Math.min(-height / dir.y, radius);
      dir.multiplyScalar(t);
      pos.setXYZ(i, dir.x, dir.y, dir.z);
    }
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildGroundedDomeGeometry(radius = PANO_DOME_RADIUS, height = PANO_CAPTURE_HEIGHT) {
  return applyGroundedProjection(new THREE.SphereGeometry(radius, 96, 48), radius, height);
}

// ---- 按图片比例选择投影模式（2026-06-12 用户反馈第七轮：非全景图不再伪造地面）----
// 决策（用户拍板"两条路"）：
//   ≈2:1 等距全景 → grounded：地面投影穹顶，地板来自全景、人物站进场景（= 竞品效果）；
//   其他比例（16:9/21:9/普通照片）→ backdrop：图作弧形背景屏、不做地面投影，
//       保留原生网格地面，人物站网格上、照片纯背景参考（无拉伸、无烂地板）。
// 彻底删除上一轮的"弧幕+模糊补全"——那是想从普通照片伪造 360°，本质做不到好看。
const PANORAMA_EQUIRECT_RATIO_MIN = 1.9;
const PANORAMA_EQUIRECT_RATIO_MAX = 2.15;
const BACKDROP_RADIUS = 40;
const BACKDROP_VFOV = (64 * Math.PI) / 180;
const BACKDROP_MAX_HFOV = (190 * Math.PI) / 180;

export function resolveProjectionMode(imageWidth, imageHeight) {
  const w = Number(imageWidth);
  const h = Number(imageHeight);
  // 无尺寸信息：保守按全景处理（穹顶），避免把真全景误判成背景幕
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { kind: "grounded", ratio: 2 };
  const ratio = w / h;
  if (ratio >= PANORAMA_EQUIRECT_RATIO_MIN && ratio <= PANORAMA_EQUIRECT_RATIO_MAX) {
    return { kind: "grounded", ratio };
  }
  return { kind: "backdrop", ratio };
}

// 背景幕：弧形屏，方形像素（水平弧 = 垂直弧 × 比例），不做地面投影。
// 弧幕 phi=π 几何中心朝世界 +X，调用处转 -90° 使其正对 +Z（默认人偶身前）。
export function buildBackdropBandGeometry(ratio, radius = BACKDROP_RADIUS) {
  const vFov = BACKDROP_VFOV;
  const hFov = Math.min(BACKDROP_MAX_HFOV, vFov * Math.max(0.5, Number(ratio) || 1.78));
  const phiStart = Math.PI - hFov / 2;
  const thetaStart = Math.PI / 2 - vFov / 2;
  return new THREE.SphereGeometry(radius, 64, 24, phiStart, hFov, thetaStart, vFov);
}

function makeDomeMaterial(map) {
  return new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false, toneMapped: false });
}

// 返回所选模式（供 sync 决定地面让位与否）；dome 是单层 Mesh（grounded 穹顶或 backdrop 弧屏）。
function ensurePanoramaProjection(bridge, scene, map) {
  const image = map?.image;
  const mode = resolveProjectionMode(image?.width, image?.height);
  const signature = `${mode.kind}:${(mode.ratio || 0).toFixed(3)}:${map.uuid}`;
  let dome = bridge.__hyPanoDome;
  if (dome && bridge.__hyPanoDomeSig === signature) {
    if (dome.parent !== scene) scene.add(dome);
    if (!dome.visible) dome.visible = true;
    return mode;
  }
  removeGroundedDome(bridge, scene);

  if (mode.kind === "grounded") {
    dome = new THREE.Mesh(buildGroundedDomeGeometry(), makeDomeMaterial(map));
    dome.position.y = PANO_CAPTURE_HEIGHT - 0.01; // 地板微沉防 z-fighting
    bridge.__hyPanoDomeBaseYaw = 0;
  } else {
    dome = new THREE.Mesh(buildBackdropBandGeometry(mode.ratio), makeDomeMaterial(map));
    dome.rotation.y = -Math.PI / 2; // 弧屏正对 +Z（拍正面机位时入画）
    dome.position.y = PANO_CAPTURE_HEIGHT;
    bridge.__hyPanoDomeBaseYaw = -Math.PI / 2;
  }
  dome.name = PANO_DOME_NAME;
  scene.add(dome);
  bridge.__hyPanoDome = dome;
  bridge.__hyPanoDomeSig = signature;
  bridge.__hyPanoMode = mode.kind;
  return mode;
}

function removeGroundedDome(bridge, scene) {
  const dome = bridge.__hyPanoDome;
  if (!dome) return;
  if (scene && dome.parent === scene) scene.remove(dome);
  dome.geometry?.dispose?.();
  dome.material?.dispose?.(); // map 归原生球所有，不 dispose
  bridge.__hyPanoDome = null;
  bridge.__hyPanoDomeSig = null;
  bridge.__hyPanoMode = null;
  bridge.__hyPanoDomeBaseYaw = 0;
}

// ---- V2: 桥 → nodeId → node.directorExt（桥不持有 nodeId，从 container DOM 反查）----
function findBridgeContainer(bridge) {
  if (bridge.__hyContainer && bridge.__hyContainer.isConnected) return bridge.__hyContainer;
  for (const key of Object.keys(bridge)) {
    const v = bridge[key];
    if (v && typeof v === "object" && typeof v.closest === "function" && v.nodeType === 1) {
      bridge.__hyContainer = v;
      return v;
    }
  }
  return null;
}
// 点6/桥访问:按 nodeId 注册运行中的桥(每次 syncPanoramaEnvironment 刷新一次),供 autoload 截图前隐藏相机标记等。
const __hyBridgesByNode = new Map();
function resolveBridgeNodeId(bridge) {
  const c = findBridgeContainer(bridge);
  if (!c) return "";
  const shell = c.closest(".panorama-scene-shell");
  if (shell?.dataset?.shotNodeId) return shell.dataset.shotNodeId;
  const host = c.closest("[data-node-id]");
  return host?.dataset?.nodeId || "";
}
function readBridgeDirectorExt(bridge) {
  try {
    const id = resolveBridgeNodeId(bridge);
    if (!id) return null;
    const state = typeof appStore?.getStateRaw === "function" ? appStore.getStateRaw() : appStore?.getState?.();
    return state?.nodes?.[id]?.directorExt || null;
  } catch {
    return null;
  }
}

function readBridgeSceneNode(bridge) {
  try {
    const id = resolveBridgeNodeId(bridge);
    if (!id) return null;
    const state = typeof appStore?.getStateRaw === "function" ? appStore.getStateRaw() : appStore?.getState?.();
    return state?.nodes?.[id]?.sceneNode || null;
  } catch {
    return null;
  }
}

// 场景平移（directorExt.sceneTransform.position，对齐竞品 3D场景面板）。
// 给每个人偶/方块 group 的"状态位置"叠加偏移（幂等重算，不累积；桥按需渲染→post-render 应用持久，同 V2 球参）。
// 注意：不动地面/穹顶（保持地平线对齐）；不碰朝向（_syncMannequins 的 facing 逻辑保留）。
export function applySceneTransformWith(bridge, ext, sceneNode) {
  if (!sceneNode) return;
  const t = (ext && ext.sceneTransform) || {};
  const p = t.position || {};
  const r = t.rotation || {};
  const ox = Number(p.x) || 0, oy = Number(p.y) || 0, oz = Number(p.z) || 0;
  const rx = Number(r.x) || 0, ry = Number(r.y) || 0, rz = Number(r.z) || 0; // 弧度
  const hasRot = !!(rx || ry || rz);
  const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  const applyTo = (map, list) => {
    if (!map || typeof map.forEach !== "function") return;
    map.forEach((visual, id) => {
      const g = (visual && visual.group) || visual;
      if (!g || !g.position || !g.quaternion) return;
      const st = (Array.isArray(list) ? list : []).find((x) => String(x && x.id) === String(id));
      const bp = (st && st.position) || { x: 0, y: 0, z: 0 };
      // 位置：R·状态位置 + 偏移（绕场景原点旋转，再平移）
      const v = new THREE.Vector3(Number(bp.x) || 0, Number(bp.y) || 0, Number(bp.z) || 0);
      if (hasRot) v.applyQuaternion(R);
      g.position.set(v.x + ox, v.y + oy, v.z + oz);
      // 朝向：以"状态旋转变化"为信号，捕获桥设好的干净四元数为基准，叠加 R。
      // 不复刻桥的 facing 公式、不漂移；单位旋转 = 基准（无 facing 跳变）。
      const sr = (st && st.rotation) || {};
      const key = `${Number(sr.x) || 0},${Number(sr.y) || 0},${Number(sr.z) || 0}`;
      if (!g.userData) g.userData = {};
      if (g.userData.__hyRotKey !== key || !g.userData.__hyBaseQuat) {
        g.userData.__hyBaseQuat = g.quaternion.clone();
        g.userData.__hyRotKey = key;
      }
      if (hasRot) g.quaternion.copy(R).multiply(g.userData.__hyBaseQuat);
      else g.quaternion.copy(g.userData.__hyBaseQuat);
    });
  };
  applyTo(bridge._mannequinMap, sceneNode.mannequins);
  applyTo(bridge._cubeMap, sceneNode.cubes);
}
export function applySceneTransform(bridge) {
  applySceneTransformWith(bridge, readBridgeDirectorExt(bridge), readBridgeSceneNode(bridge));
}

// ===== F1: 对象可见性（场景树👁，状态 directorExt.visibility.mannequinIds/cubeIds）=====
// 命中 id 的人偶/方块 group.visible=false（同地面让位 group.visible 模式）。
// 单点集中（其他端只读 directorExt）；幂等——每帧同步都按 ext 重置 visible，
// 故移出 visibility 数组后下一帧自然恢复 true（无需记忆上次隐藏集）。
// 机位无 3D group（机位=相机），可见性仅作用于树/选中拦截，运行时不在此隐藏。
export function applyObjectVisibilityWith(bridge, ext, sceneNode) {
  const applyTo = (map, list, kind) => {
    if (!map || typeof map.forEach !== "function") return;
    map.forEach((visual, id) => {
      const g = (visual && visual.group) || visual;
      if (!g || typeof g.visible !== "boolean") return;
      // 该对象不在 sceneNode 列表里时也按 ext 判定（list 仅用于将来扩展，目前不依赖）
      const hidden = isObjectHidden(kind, id, ext);
      if (g.visible === hidden) g.visible = !hidden;
    });
  };
  applyTo(bridge && bridge._mannequinMap, sceneNode && sceneNode.mannequins, "mannequin");
  // 立方体可见性（树行 👁 → directorExt.visibility.cubeIds → 隐藏 cube group）
  applyTo(bridge && bridge._cubeMap, sceneNode && sceneNode.cubes, "cube");
}
export function applyObjectVisibility(bridge) {
  applyObjectVisibilityWith(bridge, readBridgeDirectorExt(bridge), readBridgeSceneNode(bridge));
}

// ===== F3: 人偶头顶名牌（角色标签 sprite）=====
// 顶层独立容器 __hyLabelLayer（NOT 挂人偶 group——避免 _rebuildPickRoots/raycast 污染）；
// sprite.raycast = () => null 屏蔽拾取（覆盖 Object3D.raycast，不是 material）；
// CanvasTexture 缓存在 visual.__hyLabelTex（不每帧重建）；
// 标签文字 = charLabel(mannequins 下标)；头顶 Y = computeLabelPositionY(groupY, scale, 0.3)。
const LABEL_OFFSET = 0.3;

function makeLabelTexture(text) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pad = 10;
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // 圆角底板
  const tw = Math.min(canvas.width - pad * 2, ctx.measureText(text).width + 40);
  const bx = (canvas.width - tw) / 2;
  const by = 8;
  const bh = canvas.height - 16;
  ctx.fillStyle = "rgba(18,18,20,1)"; // 不透明底牌（去透明度：重叠时不再透出后面的名牌 → 修“显示错乱”）
  if (typeof ctx.roundRect === "function") { ctx.beginPath(); ctx.roundRect(bx, by, tw, bh, 12); ctx.fill(); }
  else ctx.fillRect(bx, by, tw, bh);
  ctx.fillStyle = "#f2f2f3";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function ensureLabelLayer(bridge, scene) {
  let layer = bridge.__hyLabelLayer;
  if (layer && layer.parent === scene) return layer;
  if (layer && layer.parent && layer.parent !== scene) layer.parent.remove(layer);
  if (!layer) {
    layer = new THREE.Group();
    layer.name = "__hyLabelLayer";
    bridge.__hyLabelLayer = layer;
  }
  scene.add(layer);
  return layer;
}

export function syncMannequinLabelsWith(bridge, ext, sceneNode, scene) {
  if (!scene) return;
  const map = bridge && bridge._mannequinMap;
  if (!map || typeof map.forEach !== "function") {
    if (bridge && bridge.__hyLabelLayer) bridge.__hyLabelLayer.visible = false;
    return;
  }
  const layer = ensureLabelLayer(bridge, scene);
  layer.visible = resolveMannequinLabelsVisible(ext);
  const mannequins = (sceneNode && Array.isArray(sceneNode.mannequins)) ? sceneNode.mannequins : [];
  if (!bridge.__hyLabelSprites) bridge.__hyLabelSprites = new Map();
  const sprites = bridge.__hyLabelSprites;
  const seen = new Set();

  // 建/更新一个名牌 sprite 并定位（人偶与立方体共用此助手；id 不冲突 → 共用 sprites/seen）。
  const upsertLabel = (visual, id, text, x, y, z) => {
    let entry = sprites.get(String(id));
    if (!entry || entry.text !== text) {
      // 文字变化 → 重建纹理（缓存在 visual.__hyLabelTex）
      const oldTex = visual && visual.__hyLabelTex;
      const tex = makeLabelTexture(text);
      if (oldTex && oldTex !== tex) oldTex.dispose?.();
      if (visual) visual.__hyLabelTex = tex;
      let sprite = entry && entry.sprite;
      if (!sprite) {
        // 不透明底牌 + alphaTest:0.5（丢弃透明边距像素）= 修“重叠错乱/透出后牌”。
        // depthTest:false 保留原始“顶层 overlay 永远可见”设计（不被世界几何遮挡，回退误引入的回归）；
        // 名牌互相重叠时由 transparent pass 按相机距离排序（renderer.sortObjects 默认开）保证近者后绘、盖住远者。
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, alphaTest: 0.5 });
        sprite = new THREE.Sprite(mat);
        sprite.raycast = () => null; // 屏蔽拾取（覆盖 SPRITE 的 raycast，非 material）
        sprite.scale.set(1.4, 0.35, 1);
        // 永远画在最上层:depthTest:false 已不做深度比较,但透明 pass 内仍按顺序绘制——
        // 超高 renderOrder 保证名牌最后画,压住天空穹顶/全景球/地面(它们也可能是透明,否则会盖住名字)。
        sprite.renderOrder = 9999;
        layer.add(sprite);
      } else if (sprite.material) {
        if (sprite.material.map && sprite.material.map !== tex) sprite.material.map.dispose?.();
        sprite.material.map = tex;
        sprite.material.needsUpdate = true;
      }
      entry = { sprite, text };
      sprites.set(String(id), entry);
    }
    entry.sprite.position.set(x, y, z);
  };

  // 人偶名牌（头顶）；对象被 👁 隐藏 → 跳过(不进 seen → 下方移除分支删名牌)，名牌随对象一起消失。
  map.forEach((visual, id) => {
    const g = (visual && visual.group) || visual;
    if (!g || !g.position) return;
    if (isObjectHidden("mannequin", id, ext)) return;
    seen.add(String(id));
    const s = (g.scale && Number.isFinite(g.scale.y) && g.scale.y > 0) ? g.scale.y : 1;
    upsertLabel(visual, id, labelForMannequinId(id, mannequins, ext), g.position.x, computeLabelPositionY(g.position.y, s, LABEL_OFFSET), g.position.z);
  });

  // 立方体名牌（顶面上方）——与人偶同规则、共用名牌层；名字走 directorExt.cubes[id].name。
  const cubeMap = bridge._cubeMap;
  const cubes = (sceneNode && Array.isArray(sceneNode.cubes)) ? sceneNode.cubes : [];
  if (cubeMap && typeof cubeMap.forEach === "function") {
    cubeMap.forEach((visual, id) => {
      const g = (visual && visual.group) || visual;
      if (!g || !g.position) return;
      if (isObjectHidden("cube", id, ext)) return; // 隐藏的立方体 → 名牌随之消失（与人偶一致）
      seen.add(String(id));
      const s = (g.scale && Number.isFinite(g.scale.y) && g.scale.y > 0) ? g.scale.y : 1;
      // 立方体几何中心在 position → 顶面 = y + 0.5·scale，名牌再抬 LABEL_OFFSET。
      // 依赖均匀缩放(三轴绑同一标量 scale)且不计 group 旋转；放开非均匀缩放/倾斜顶面需改用 Box3 世界包围盒。
      upsertLabel(visual, id, labelForCubeId(id, cubes, ext), g.position.x, (Number(g.position.y) || 0) + 0.5 * s + LABEL_OFFSET, g.position.z);
    });
  }

  // 移除已不存在的名牌（人偶+立方体；防泄漏）
  for (const [id, entry] of sprites) {
    if (seen.has(id)) continue;
    if (entry.sprite) {
      layer.remove(entry.sprite);
      entry.sprite.material?.map?.dispose?.();
      entry.sprite.material?.dispose?.();
    }
    sprites.delete(id);
  }
}
export function syncMannequinLabels(bridge) {
  const scene = findScene(bridge);
  syncMannequinLabelsWith(bridge, readBridgeDirectorExt(bridge), readBridgeSceneNode(bridge), scene);
}

// V4 活体集成：把 directorExt.mannequins[id].pose 应用到桥里对应人偶模型的骨骼。
// _mannequinMap 的 entry.group 含 GLTF 骨骼；applyPoseToModel 记录绑定四元数(=原生自然姿势)、
// 每次复位再叠加(幂等、移除某骨骼姿势即还原)。无 pose → 全 0 → 还原到绑定(自然)姿势。
export function syncMannequinPosesWith(bridge, ext) {
  const map = bridge._mannequinMap;
  if (!map || typeof map.forEach !== "function") return;
  map.forEach((visual, id) => {
    const model = (visual && visual.group) || visual;
    if (!model || typeof model.getObjectByName !== "function") return;
    const { values } = derivePoseValues(ext, String(id));
    applyPoseToModel(model, poseToBoneRotations(values));
  });
}
export function syncMannequinPoses(bridge) {
  syncMannequinPosesWith(bridge, readBridgeDirectorExt(bridge));
}

// V2 核心（可测）：把给定 directorExt 的全景球参数+天空色应用到桥（不读 store）
export function applyDirectorSphereParamsWith(bridge, scene, ext) {
  const sky = ext?.environmentSkyColor;
  if (typeof sky === "string" && /^#[0-9a-fA-F]{6}$/.test(sky)) {
    if (scene.background && scene.background.isColor) scene.background.set(sky);
    else scene.background = new THREE.Color(sky);
    bridge.__hySkyApplied = true;
  }
  const dome = bridge.__hyPanoDome;
  if (!dome) return;
  const sphere = ext?.panoramaSphere || {};
  const base = Number(bridge.__hyPanoDomeBaseYaw) || 0;
  dome.rotation.y = base + (Number(sphere.yawOffset) || 0);
  const s = Number(sphere.radiusScale);
  const scale = Number.isFinite(s) && s > 0 ? s : 1;
  dome.scale.setScalar(scale);
  // grounded 模式：缩放穹顶同时补偿位置，保持地板仍落在世界 y≈0
  if (bridge.__hyPanoMode === "grounded") dome.position.y = PANO_CAPTURE_HEIGHT * scale - 0.01;
}

// V2: 从 store 读 directorExt 再应用（运行时入口）
function applyDirectorSphereParams(bridge, scene) {
  applyDirectorSphereParamsWith(bridge, scene, readBridgeDirectorExt(bridge));
}

// 点8(改正):白天/黑夜不再改灯光(那会变人物/背景颜色),改为切「头顶天空颜色」——由 autoload 钮写 environmentSkyColor,
// 经天空色路径(applyDirectorSphereParams)落 scene.background。故此处不再有 applyEnvironmentMode 灯光逻辑。

// ---- 舞台地面/网格让位（地板来自全景，自有地面整面隐藏，网格淡化保留摆位参考）----
function collectGroundParts(bridge) {
  if (bridge.__hyGroundParts) return bridge.__hyGroundParts;
  const parts = [];
  for (const key of Object.keys(bridge)) {
    if (!/^_(ground|grid)/i.test(key)) continue;
    const obj = bridge[key];
    if (obj && obj.isObject3D) parts.push(obj);
  }
  bridge.__hyGroundParts = parts;
  return parts;
}

function isOpaqueGroundPlane(part) {
  return Boolean(part.isMesh && part.geometry?.type === "PlaneGeometry");
}

function eachPartMaterial(part, fn) {
  const mat = part.material;
  if (Array.isArray(mat)) mat.forEach(fn);
  else if (mat) fn(mat);
}

// 注意：原生主同步每次都会回写 _ground.visible=true 和按 zoom 动态算的网格透明度
//（2026-06-12 实测：一次性隐藏被覆盖、不透明地面盖住穹顶地板）。
// 因此全景激活期间【每次同步都强制压制】（幂等固定值，开销可忽略）；
// 恢复时设回 visible 并停止压制，透明度由原生回写自然恢复。
const GRID_PANO_OPACITY = 0.08;

function clampGridOpacity(bridge) {
  for (const part of collectGroundParts(bridge)) {
    if (isOpaqueGroundPlane(part)) continue;
    eachPartMaterial(part, (mat) => {
      if (typeof mat.opacity === "number" && mat.opacity > GRID_PANO_OPACITY) {
        mat.transparent = true;
        mat.opacity = GRID_PANO_OPACITY;
        mat.needsUpdate = true;
      }
    });
  }
}

// renderNow 前置压制：原生 _syncInfiniteGrid 在每次 render 前重算网格透明度，
// 必须在它之后、render 之前（即 wrapper 的 fn.apply 前）钳制才会进入当帧画面
export function preRenderGridSuppress(bridge) {
  // 用户「地面」关：每帧强制全隐藏，压过原生每帧的 visible 回写
  if (bridge?.__hyUserGroundHidden) {
    for (const part of collectGroundParts(bridge)) {
      if (part.visible) part.visible = false;
    }
    return;
  }
  // 用户设过 地面透明度/高度 → 每帧强制（原生 _syncInfiniteGrid 每帧重算网格透明度，
  // 必须在它之后、render 之前钳制，镜像 clampGridOpacity 的强制时机）。
  const ext = readBridgeDirectorExt(bridge);
  if (isGroundOpacityUserSet(ext) || isGroundHeightUserSet(ext)) {
    applyGroundAppearanceWith(bridge, ext);
  } else if (bridge?.__hyGroundDimmed) {
    clampGridOpacity(bridge);
    return;
  }
  if (!bridge?.__hyGroundDimmed) return;
  // 用户设了透明度时不再回到 dim 的 0.08（用户值优先）；仅在未设透明度时维持 dim
  if (!isGroundOpacityUserSet(ext)) clampGridOpacity(bridge);
}

export function dimGroundForPanorama(bridge) {
  bridge.__hyGroundDimmed = true;
  for (const part of collectGroundParts(bridge)) {
    if (isOpaqueGroundPlane(part) && part.visible) part.visible = false;
  }
  clampGridOpacity(bridge);
}

export function restoreGroundFromPanorama(bridge) {
  if (!bridge.__hyGroundDimmed) return;
  bridge.__hyGroundDimmed = false;
  for (const part of collectGroundParts(bridge)) {
    if (isOpaqueGroundPlane(part) && !part.visible) part.visible = true;
    // 网格透明度交还原生回写（每次主同步都会按 zoom 重算）
  }
}

// 用户「地面」开关（directorExt.ground.visible，对齐竞品 3D场景面板）。
// 关 = 真正隐藏 地板 + 网格（全 .visible=false），而非 dimGround 的"压暗到 0.08"。
// 因原生每帧回写 visible/透明度，须 ①每次同步设一次 + ②preRenderGridSuppress 每帧强制（见下）。
// 仅非 grounded 模式有意义：grounded 地板来自全景，归 dimGround 管，这里只清自身标志不强行显隐。
function applyUserGroundPreference(bridge) {
  const wasHidden = bridge.__hyUserGroundHidden === true;
  const g = readBridgeDirectorExt(bridge)?.ground;
  const hide = !!(g && g.visible === false);
  if (hide) {
    // 用户关地面：全隐藏（地板+网格），**所有模式**生效，压过 grounded 的 dim（修复：连全景后关不掉网格）
    bridge.__hyUserGroundHidden = true;
    for (const part of collectGroundParts(bridge)) part.visible = false;
  } else {
    bridge.__hyUserGroundHidden = false;
    // 从隐藏切回：只恢复网格(非不透明地板)可见；不透明地板交还 mode
    //（dimGround/restoreGround 在本次同步已先设：grounded 隐板 / backdrop 显板）。
    if (wasHidden) {
      for (const part of collectGroundParts(bridge)) {
        if (!isOpaqueGroundPlane(part)) part.visible = true;
      }
    }
  }
}

// ===== 地面 透明度 + 高度（directorExt.ground.opacity / .height，对齐竞品地面 toggle 下两条滑杆）=====
// 仅当用户显式设过（resolveGround*UserSet）才强制；未设则留给原生（不污染默认观感）。
// 透明度 → 网格(非不透明地板)的 material.opacity（+ transparent=true）；
// 高度   → 所有地面 part 的 position.y。用户关地面时不应用（__hyUserGroundHidden）。
// 原生每帧回写网格透明度 → 须在 preRenderGridSuppress 里同样强制（见下，镜像 clampGridOpacity）。
function applyGroundOpacityToParts(bridge, opacity) {
  for (const part of collectGroundParts(bridge)) {
    if (isOpaqueGroundPlane(part)) continue; // 不透明地板归 dim/visible 管，不在此调透明度
    eachPartMaterial(part, (mat) => {
      if (typeof mat.opacity !== "number") return;
      mat.transparent = true;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    });
  }
}

export function applyGroundAppearanceWith(bridge, ext) {
  if (!bridge) return;
  if (bridge.__hyUserGroundHidden) return; // 地面关 → 不调透明度/高度（已整面隐藏）
  if (isGroundOpacityUserSet(ext)) {
    applyGroundOpacityToParts(bridge, resolveGroundOpacity(ext));
  }
  if (isGroundHeightUserSet(ext)) {
    const y = resolveGroundHeight(ext);
    for (const part of collectGroundParts(bridge)) {
      if (part && part.position && part.position.y !== y) part.position.y = y;
    }
  }
}
export function applyGroundAppearance(bridge) {
  applyGroundAppearanceWith(bridge, readBridgeDirectorExt(bridge));
}

// ===== Task1: 真实可控地板 GridHelper（directorExt.ground.{visible,opacity,height}）=====
// 为什么要它：原生地面是逐帧在世界空间重算的【无限网格】，几何是绝对坐标，
// 既有 高度 滑杆推不动它（applyGroundAppearanceWith 改 position.y 对无限网格无效）。
// 竞品的地面是【有限半透明地板】（默认透明度 0.40 + 可调高度）。这里加一块真实的：
//   - 选 GridHelper（非实心 Mesh）——给出"有限地板网格"的观感，与竞品一致、且 LineSegments 轻量；
//   - directorExt.ground 驱动：visible(默认 true)→plane.visible / opacity(默认 0.40)→material.opacity
//     (transparent=true) / height(默认 0)→plane.position.y（高度真正抬升这块地板）；
//   - 单例缓存在 bridge.__hyFloorPlane，每次同步更新属性、不重建；360 查看模式移除；
//   - raycast 屏蔽（覆盖 GridHelper.raycast → null），不污染拾取。
// 双地面处理：本地板可见时，把原生无限网格压暗到 0.08 参考级（复用 dimGroundForPanorama 的
// __hyGroundDimmed + clampGridOpacity 机制），避免画面出现两层网格打架；本地板成为"地面表面"，
// 原生网格仅作极淡摆位参考。地面 toggle 关（__hyUserGroundHidden）时本地板一并隐藏（与原生网格同隐）。
const FLOOR_PLANE_NAME = "__hyFloorPlane";
const FLOOR_SIZE = 40;
const FLOOR_DIVISIONS = 40;
const FLOOR_COLOR_CENTER = 0x6b6b6b;
const FLOOR_COLOR_GRID = 0x4a4a4a;

function ensureFloorPlane(bridge, scene) {
  let plane = bridge.__hyFloorPlane;
  if (plane && plane.parent === scene) return plane;
  if (plane && plane.parent && plane.parent !== scene) plane.parent.remove(plane);
  if (!plane) {
    plane = new THREE.GridHelper(FLOOR_SIZE, FLOOR_DIVISIONS, FLOOR_COLOR_CENTER, FLOOR_COLOR_GRID);
    plane.name = FLOOR_PLANE_NAME;
    plane.raycast = () => null; // 屏蔽拾取（覆盖 GridHelper/LineSegments 的 raycast，不入 raycast 树）
    // GridHelper 默认 transparent=false → opacity 不生效；开启透明以让 0.40 默认值真实起作用
    if (plane.material) {
      plane.material.transparent = true;
      plane.material.depthWrite = false; // 半透明地板不写深度，避免压住其上元素
    }
    bridge.__hyFloorPlane = plane;
  }
  if (plane.parent !== scene) scene.add(plane);
  return plane;
}

function removeFloorPlane(bridge, scene) {
  const plane = bridge.__hyFloorPlane;
  if (!plane) return;
  if (scene && plane.parent === scene) scene.remove(plane);
  plane.geometry?.dispose?.();
  plane.material?.dispose?.();
  bridge.__hyFloorPlane = null;
}

// 核心（可测）：按给定 ext 在 scene 上创建/更新单例地板。
// 不读 store；360 模式由调用方决定不进入此函数（syncPanoramaEnvironment 已早返回）。
export function syncDirectorFloorWith(bridge, ext, scene) {
  if (!bridge || !scene) return;
  const g = (ext && ext.ground) || {};
  // 地面 toggle 关 → 地板随原生网格一并隐藏（toggle 控制两者）
  const userHidden = bridge.__hyUserGroundHidden === true || g.visible === false;
  const plane = ensureFloorPlane(bridge, scene);
  if (userHidden) {
    plane.visible = false;
    return;
  }
  plane.visible = true;
  // 透明度（默认 0.40，对齐竞品）；高度（默认 0，真正抬升这块地板）
  const opacity = resolveGroundOpacity(ext); // 未设过回落默认 0.40
  if (plane.material && typeof plane.material.opacity === "number") {
    plane.material.transparent = true;
    if (plane.material.opacity !== opacity) {
      plane.material.opacity = opacity;
      plane.material.needsUpdate = true;
    }
  }
  const y = resolveGroundHeight(ext); // 未设过回落默认 0
  if (plane.position && plane.position.y !== y) plane.position.y = y;
}

export function syncDirectorFloor(bridge) {
  const scene = findScene(bridge);
  syncDirectorFloorWith(bridge, readBridgeDirectorExt(bridge), scene);
}

function detachEnvironment(bridge, scene) {
  if (bridge.__hyEnvTex) {
    if (scene && scene.environment === bridge.__hyEnvTex) scene.environment = null;
    bridge.__hyEnvTex.dispose?.();
    bridge.__hyEnvTex = null;
    bridge.__hyEnvSrc = null;
  }
  const sun = bridge.__hyPanoSun;
  if (sun) sun.visible = false;
}

// ---- 主光估计（P3）----
const LIGHT_PROBE_W = 64;
const LIGHT_PROBE_H = 32;

export function estimateKeyLightFromImage(image, sampleFn = sampleImagePixels) {
  const sampled = sampleFn(image, LIGHT_PROBE_W, LIGHT_PROBE_H);
  if (!sampled) return null;
  const { data, width, height } = sampled;
  let best = { lum: -1, x: 0, y: 0, r: 255, g: 255, b: 255 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > best.lum) best = { lum, x, y, r, g, b };
    }
  }
  if (best.lum < 0) return null;
  const u = (best.x + 0.5) / width;
  const v = (best.y + 0.5) / height;
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  const dir = {
    x: -Math.sin(theta) * Math.sin(phi),
    y: Math.cos(theta),
    z: -Math.sin(theta) * Math.cos(phi),
  };
  return {
    direction: dir,
    color: { r: best.r / 255, g: best.g / 255, b: best.b / 255 },
    intensity: Math.min(1.4, 0.4 + (best.lum / 255) * 1.0),
    uv: { u, v },
  };
}

function sampleImagePixels(image, w, h) {
  if (typeof document === "undefined" || !image) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  } catch {
    return null;
  }
}

function applyPanoramaKeyLight(bridge, scene, map) {
  if (bridge.__hyPanoSunSrc === map && bridge.__hyPanoSun) {
    bridge.__hyPanoSun.visible = true;
    return;
  }
  const estimate = estimateKeyLightFromImage(map.image);
  if (!estimate) return;
  let sun = bridge.__hyPanoSun;
  if (!sun) {
    sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.name = PANO_SUN_NAME;
    scene.add(sun);
    if (sun.target) scene.add(sun.target);
    bridge.__hyPanoSun = sun;
  }
  sun.color.setRGB(estimate.color.r, estimate.color.g, estimate.color.b);
  sun.intensity = estimate.intensity;
  sun.position.set(estimate.direction.x * 30, Math.max(2, estimate.direction.y * 30), estimate.direction.z * 30);
  if (sun.target) sun.target.position.set(0, 0, 0);
  sun.visible = true;
  bridge.__hyPanoSunSrc = map;
}

// ===== 机位/导演视角 FOV：把 sceneView.focalLength 镜像进桥的默认场景焦距 =====
// 真因（活体桥层实证，2026-06-14）：orbit 视图 FOV 唯一来源 = bridge._defaultSceneFocalLength。
// 桥层建视图位姿用 resolveSceneCameraPose(sceneView, focalLengthToFov(this._defaultSceneFocalLength))，
// 其 fov 只取第二参（fallbackFov），**完全忽略 sceneView 自身的 fov/focalLength**：
//   · sceneView.fov  → normalize 阶段被剥离（DEFAULT_SCENE_VIEW 无此字段，归一化只保留 target/orbit*/focalLength）；
//   · sceneView.focalLength → 存活，但 resolveSceneCameraPose 根本不读它。
// 这就是“机位视角调 FOV 视野不变窄”此前 4 次修不动的真因。修法：运行时把 sceneView.focalLength
// （机位视角=机位焦距，由 cameraOrbitFromLookAt 写入并经 normalize 存活）同步进桥默认焦距 → FOV 真正生效。
export function syncSceneViewFocalLengthWith(bridge, sceneNode) {
  if (!bridge || typeof bridge.setDefaultSceneFocalLength !== "function") return;
  const focal = Number(sceneNode?.viewport?.sceneView?.focalLength);
  if (!Number.isFinite(focal)) return;
  // 幂等修正(点5):不能只比“上次请求值”——桥的默认焦距可能在换视图/内部逻辑后悄悄回退
  // (实测:store sceneView.focalLength=24 但桥 _defaultSceneFocalLength 回到 50,旧标记仍=24 → 误判“已设过”跳过 → FOV 卡死/“调了没用”)。
  // 改为:仅当 请求值不变 且 桥当前实际默认焦距 仍等于上次“应用后回读的实际值” 才跳过;否则重推。
  // 回读应用后的实际(钳制后)值做比较 → 既修“桥回退漏推”,又不因相机约束钳制而自循环(钳制后实际值稳定)。
  if (bridge.__hySceneFocalReq === focal && bridge._defaultSceneFocalLength === bridge.__hySceneFocalApplied) return;
  bridge.__hySceneFocalReq = focal;
  bridge.setDefaultSceneFocalLength(focal);
  bridge.__hySceneFocalApplied = bridge._defaultSceneFocalLength;
}
export function syncSceneViewFocalLength(bridge) {
  syncSceneViewFocalLengthWith(bridge, readBridgeSceneNode(bridge));
}

// 点6:按 nodeId 取运行中的桥(autoload 截图前用它隐藏相机标记)。仅在桥至少渲染过一次后可得。
export function getPanoramaSceneBridge(nodeId) {
  return __hyBridgesByNode.get(String(nodeId)) || null;
}
// 点6:隐藏/恢复所有相机标记(_cameraMap 每项的 object3d/group)。返回处理数量。截图前传 false,截完传 true。
export function setPanoramaCameraHelpersVisible(bridge, visible) {
  const m = bridge && bridge._cameraMap;
  if (!m || typeof m.forEach !== "function") return 0;
  let n = 0;
  m.forEach((entry) => {
    const o3d = entry && (entry.object3d || entry.group || (entry.isObject3D ? entry : null));
    if (o3d && typeof o3d.visible === "boolean") { o3d.visible = !!visible; n += 1; }
  });
  return n;
}
export function syncPanoramaEnvironment(bridge) {
  try { const __id = resolveBridgeNodeId(bridge); if (__id) __hyBridgesByNode.set(String(__id), bridge); } catch (_) { /* 注册失败不影响渲染 */ }
  const sphere = bridge?._panoramaSphere;
  if (!sphere) return;
  const scene = findScene(bridge);
  if (!scene) return;
  const map = sphere.material?.map || null;

  if (!isSceneMode(bridge)) {
    // panorama-360 查看模式：完全交还原生逻辑，撤掉我们的附加物（含名牌层 + 导演地板）
    removeGroundedDome(bridge, scene);
    detachEnvironment(bridge, scene);
    restoreGroundFromPanorama(bridge);
    removeFloorPlane(bridge, scene);
    if (bridge.__hyLabelLayer) bridge.__hyLabelLayer.visible = false;
    return;
  }

  // —— 视角 FOV：sceneView.focalLength → 桥默认场景焦距（两个 scene 分支通用，与有无背景无关）——
  syncSceneViewFocalLength(bridge);

  if (!map) {
    // scene 模式但未连全景背景：仍是 3D 舞台，可见性/名牌照常作用于人偶
    if (sphere.visible) sphere.visible = false;
    removeGroundedDome(bridge, scene);
    detachEnvironment(bridge, scene);
    // 点7:无全景背景时也把「天空颜色」(environmentSkyColor)落到 scene.background → WebGL 实渲该色,
    // 截图(canvas.toDataURL)与实时视图一致呈现所选天空色;原本仅在有全景的分支(L935)调,故无全景时截图透明/不变色。
    applyDirectorSphereParams(bridge, scene);
    restoreGroundFromPanorama(bridge);
    applyUserGroundPreference(bridge);
    applyGroundAppearance(bridge);
    syncDirectorFloor(bridge);
    applySceneTransform(bridge);
    applyObjectVisibility(bridge);
    syncMannequinLabels(bridge);
    syncMannequinPoses(bridge);
    return;
  }

  // —— scene 模式：原生 60m 球让位给投影层（原生球供 360 查看器使用）——
  if (sphere.visible) sphere.visible = false;
  const mode = ensurePanoramaProjection(bridge, scene, map);

  // —— IBL 环境（克隆纹理共享像素，改 equirect 映射）——
  if (bridge.__hyEnvSrc !== map) {
    detachEnvironment(bridge, scene);
    const env = map.clone();
    env.mapping = THREE.EquirectangularReflectionMapping;
    env.colorSpace = map.colorSpace;
    env.needsUpdate = true;
    scene.environment = env;
    bridge.__hyEnvTex = env;
    bridge.__hyEnvSrc = map;
  }

  // —— 地面：grounded 模式地板来自全景→隐藏原生地面；backdrop 模式保留原生网格地面（人物站其上）——
  if (mode.kind === "grounded") dimGroundForPanorama(bridge);
  else restoreGroundFromPanorama(bridge);
  applyUserGroundPreference(bridge);
  // —— 地面 透明度/高度（directorExt.ground.opacity/.height，仅用户显式设过才强制）——
  applyGroundAppearance(bridge);
  // —— Task1: 真实可控地板（GridHelper，directorExt.ground 驱动；360 模式已早返回移除）——
  // 原生无限网格此时已压暗(grounded dim / backdrop 原生)，本地板成为可调地面表面、避免双网格打架。
  syncDirectorFloor(bridge);

  // —— 全景主光 ——
  applyPanoramaKeyLight(bridge, scene, map);

  // —— V2: directorExt 全景球参数（水平旋转/半径）+ 天空色 ——
  applyDirectorSphereParams(bridge, scene);
  // —— 场景平移/旋转：人偶/方块 group 叠加 directorExt.sceneTransform ——
  applySceneTransform(bridge);
  // —— F1: 场景树可见性（命中 directorExt.visibility 的人偶 group.visible=false）——
  applyObjectVisibility(bridge);
  // —— F3: 人偶头顶名牌 sprite（顶层 __hyLabelLayer，开关 directorExt.mannequinLabels.visible）——
  // 须放在 applyObjectVisibility/applySceneTransform 之后：用最终 group.position 同步名牌头顶坐标。
  syncMannequinLabels(bridge);
  // —— V4: 角色姿势活体集成（directorExt.mannequins[id].pose → 人偶骨骼）——
  syncMannequinPoses(bridge);
}
