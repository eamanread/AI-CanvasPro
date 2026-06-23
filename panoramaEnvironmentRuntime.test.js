import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "./modules/panoramaSceneNode/threeRuntime.js";
import {
  applyDirectorSphereParamsWith,
  applySceneTransformWith,
  applyObjectVisibilityWith,
  syncMannequinLabelsWith,
  syncMannequinPosesWith,
  buildBackdropBandGeometry,
  buildGroundedDomeGeometry,
  dimGroundForPanorama,
  estimateKeyLightFromImage,
  installPanoramaEnvironmentRuntime,
  preRenderGridSuppress,
  resolveProjectionMode,
  restoreGroundFromPanorama,
  syncPanoramaEnvironment,
  applyGroundAppearanceWith,
  syncDirectorFloorWith,
  syncSceneViewFocalLengthWith,
} from "./modules/panoramaSceneNode/panoramaEnvironmentRuntime.js";

function makeFakeBridge({ withMap = true, is360 = false } = {}) {
  const scene = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(60, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }),
  );
  sphere.visible = false;
  scene.add(sphere);
  if (withMap) {
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    sphere.material.map = tex;
    sphere.visible = true; // 原生加载回调会置 true
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ opacity: 0.9, transparent: false }),
  );
  const gridMinor = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ opacity: 0.5, transparent: true }),
  );
  scene.add(ground);
  scene.add(gridMinor);
  return {
    scene,
    _panoramaSphere: sphere,
    _ground: ground,
    _gridMinor: gridMinor,
    _sceneState: {},
    _isPanorama360Mode: () => is360,
  };
}

test("E13: directorExt sphere params + sky color apply to dome/scene (V2 运行时核心)", () => {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(24, 8, 6), new THREE.MeshBasicMaterial());
  dome.name = "__hyPanoDome";
  scene.add(dome);
  const bridge = { scene, __hyPanoDome: dome, __hyPanoMode: "backdrop", __hyPanoDomeBaseYaw: -Math.PI / 2 };

  // 水平旋转：base(-π/2) + yawOffset(π/2) = 0
  applyDirectorSphereParamsWith(bridge, scene, { panoramaSphere: { yawOffset: Math.PI / 2, radiusScale: 1.5 }, environmentSkyColor: "#223344" });
  assert.ok(Math.abs(dome.rotation.y - 0) < 1e-9, "base + yawOffset");
  assert.ok(Math.abs(dome.scale.x - 1.5) < 1e-9, "半径 scale 应用");
  assert.ok(scene.background && scene.background.isColor, "天空色 → scene.background Color");

  // grounded 模式：缩放同时补偿位置，地板保持世界 y≈0
  bridge.__hyPanoMode = "grounded"; bridge.__hyPanoDomeBaseYaw = 0;
  applyDirectorSphereParamsWith(bridge, scene, { panoramaSphere: { radiusScale: 2 } });
  assert.ok(Math.abs(dome.scale.x - 2) < 1e-9);
  assert.ok(Math.abs(dome.position.y - (1.6 * 2 - 0.01)) < 1e-9, "grounded 位置补偿保地板");

  // 空 ext / 非法天空色：dome 复位 scale=1，不崩
  applyDirectorSphereParamsWith(bridge, scene, null);
  assert.ok(Math.abs(dome.scale.x - 1) < 1e-9, "无 ext → scale 复位 1");
});

function domeOf(bridge) {
  return bridge.scene.getObjectByName("__hyPanoDome") || null;
}

function domeMeshes(bridge) {
  const dome = domeOf(bridge);
  if (!dome) return [];
  const meshes = [];
  dome.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  return meshes;
}

test("E1: no image dims → grounded dome (floor from panorama), hides native sphere+ground, sets IBL", () => {
  const bridge = makeFakeBridge({ withMap: true });
  syncPanoramaEnvironment(bridge);

  const dome = domeOf(bridge);
  assert.ok(dome, "grounded dome added to scene");
  assert.ok(dome.isMesh, "single-mesh dome");
  assert.equal(dome.material.map, bridge._panoramaSphere.material.map, "dome shares native texture");
  assert.ok(Math.abs(dome.position.y - 1.59) < 1e-9, "dome raised by capture height (1.6 - 0.01)");
  assert.equal(bridge._panoramaSphere.visible, false, "native 60m sphere hidden in scene mode");
  assert.ok(bridge.scene.environment, "scene.environment set");
  assert.equal(bridge.scene.environment.mapping, THREE.EquirectangularReflectionMapping, "equirect mapping");
  assert.equal(bridge._ground.visible, false, "grounded mode hides stage ground (floor comes from panorama)");
  assert.ok(bridge._gridMinor.material.opacity <= 0.08, "grid clamped to faint reference level");
});

test("E2: removing the map removes the dome and restores everything", () => {
  const bridge = makeFakeBridge({ withMap: true });
  syncPanoramaEnvironment(bridge);
  bridge._panoramaSphere.material.map = null;
  syncPanoramaEnvironment(bridge);

  assert.equal(domeOf(bridge), null, "dome removed");
  assert.equal(bridge.scene.environment, null, "env detached");
  assert.equal(bridge._ground.visible, true, "ground restored");
  // 网格透明度由原生主同步回写恢复（fake bridge 无原生逻辑，不断言）
});

test("E3: panorama-360 viewer mode is left untouched (native logic owns it)", () => {
  const bridge = makeFakeBridge({ withMap: true, is360: true });
  syncPanoramaEnvironment(bridge);
  assert.equal(domeOf(bridge), null, "no dome in 360 viewer mode");
  assert.equal(bridge._panoramaSphere.visible, true, "native sphere untouched");
  assert.equal(bridge.scene.environment, null, "no env attached");
  assert.equal(bridge._ground.visible, true, "ground untouched");
});

test("E4: env texture and dome follow texture swaps", () => {
  const bridge = makeFakeBridge({ withMap: true });
  syncPanoramaEnvironment(bridge);
  const firstEnv = bridge.scene.environment;
  const firstDome = domeOf(bridge);
  syncPanoramaEnvironment(bridge);
  assert.equal(bridge.scene.environment, firstEnv, "same map → same env texture");
  assert.equal(domeOf(bridge), firstDome, "same map → same dome instance");

  const newTex = new THREE.Texture();
  bridge._panoramaSphere.material.map = newTex;
  syncPanoramaEnvironment(bridge);
  assert.notEqual(bridge.scene.environment, firstEnv, "map change → env swapped");
  assert.equal(domeOf(bridge).material.map, newTex, "map change → dome rebuilt with new texture");
});

test("E9: projection mode forks on aspect ratio — 2:1 grounded, others backdrop", () => {
  assert.equal(resolveProjectionMode(2048, 1024).kind, "grounded", "标准 2:1 → 沉浸穹顶");
  assert.equal(resolveProjectionMode(4096, 2000).kind, "grounded", "2.048 在容差内 → 穹顶");

  assert.equal(resolveProjectionMode(1920, 1080).kind, "backdrop", "16:9 → 背景幕");
  assert.equal(resolveProjectionMode(2520, 1080).kind, "backdrop", "21:9 → 背景幕");
  assert.equal(resolveProjectionMode(1024, 1024).kind, "backdrop", "1:1 → 背景幕");
  assert.equal(resolveProjectionMode(7108, 4000).kind, "backdrop", "用户的 16:9 厨房素材 → 背景幕");

  // 无尺寸信息保守按全景（避免把真全景误判成背景幕）
  assert.equal(resolveProjectionMode(undefined, undefined).kind, "grounded", "无尺寸 → 保守穹顶");
  assert.equal(resolveProjectionMode(0, 0).kind, "grounded");
  assert.ok(Math.abs(resolveProjectionMode(1920, 1080).ratio - 1920 / 1080) < 1e-9, "ratio 透传");
});

test("E10: backdrop band is a pure curved screen on the sphere shell (NO floor projection)", () => {
  const ratio = 1920 / 1080;
  const radius = 40;
  const geometry = buildBackdropBandGeometry(ratio, radius);
  const pos = geometry.getAttribute("position");
  const vFov = (64 * Math.PI) / 180;
  const expectedHFov = vFov * ratio;
  let maxAzimuthSpan = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, y, z);
    assert.ok(Math.abs(r - radius) < 1e-3, "所有顶点贴球壳（无地面投影，与 grounded 区分）");
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    // 弧幕几何中心在 +X（phi=π），方位角 = atan2(z, x)，±hFov/2（dome 层再转 -90° 朝 +Z）
    maxAzimuthSpan = Math.max(maxAzimuthSpan, Math.abs(Math.atan2(z, x)));
  }
  assert.ok(maxAzimuthSpan <= expectedHFov / 2 + 0.02, "水平弧 = 垂直弧 × 比例（方形像素，无拉伸）");
  // 弧幕竖直方向围绕赤道对称（无负向地面延伸）
  assert.ok(Math.abs(minY + maxY) < radius * 0.05, "弧幕围绕赤道对称");
});

test("E11: a 16:9 texture goes through backdrop mode and KEEPS the native grid floor", () => {
  const bridge = makeFakeBridge({ withMap: true });
  bridge._panoramaSphere.material.map.image = { width: 1920, height: 1080 };
  syncPanoramaEnvironment(bridge);
  const dome = domeOf(bridge);
  assert.ok(dome && dome.isMesh, "backdrop 为单层弧屏 Mesh");
  assert.equal(dome.material.map, bridge._panoramaSphere.material.map, "弧屏共享原纹理");
  assert.ok(dome.geometry.getAttribute("position").count < 64 * 32, "局部球带几何");
  // 关键：背景幕模式不抢地面——原生网格地面保留，人物站其上
  assert.equal(bridge._ground.visible, true, "背景幕模式保留原生地面（人物站网格上）");
  assert.equal(bridge.__hyPanoMode, "backdrop", "模式记录为 backdrop");
  assert.ok(bridge.scene.environment, "IBL 仍生效");
});

test("E12: switching a grounded panorama to a backdrop image restores the native ground", () => {
  const bridge = makeFakeBridge({ withMap: true });
  bridge._panoramaSphere.material.map.image = { width: 4096, height: 2048 }; // 2:1
  syncPanoramaEnvironment(bridge);
  assert.equal(bridge._ground.visible, false, "2:1 grounded → 地面隐藏");

  const tex = new THREE.Texture();
  tex.image = { width: 1920, height: 1080 }; // 16:9
  bridge._panoramaSphere.material.map = tex;
  syncPanoramaEnvironment(bridge);
  assert.equal(bridge._ground.visible, true, "换成 16:9 → 背景幕 → 地面恢复可见");
  assert.equal(bridge.__hyPanoMode, "backdrop");
});

test("E5: ground suppression keeps re-asserting against native rewrites and restores visibility", () => {
  const bridge = makeFakeBridge({ withMap: true });
  dimGroundForPanorama(bridge);
  // 模拟原生主同步回写
  bridge._ground.visible = true;
  bridge._gridMinor.material.opacity = 0.5;
  dimGroundForPanorama(bridge);
  assert.equal(bridge._ground.visible, false, "re-suppressed after native rewrite");
  assert.ok(bridge._gridMinor.material.opacity <= 0.08, "grid re-clamped after native rewrite");
  restoreGroundFromPanorama(bridge);
  restoreGroundFromPanorama(bridge);
  assert.equal(bridge._ground.visible, true);
});

test("E5b: pre-render suppress clamps the grid AFTER native per-frame recompute (real render order)", () => {
  // 真实时序（审查实证）：原生 renderNow 内部先 _syncInfiniteGrid 重算透明度、再 render；
  // 我们的 preRenderGridSuppress 必须钳在两者之间
  const bridge = makeFakeBridge({ withMap: true });
  syncPanoramaEnvironment(bridge); // 激活全景 → __hyGroundDimmed
  // 模拟原生 _syncInfiniteGrid 在 render 前重算
  bridge._gridMinor.material.opacity = 0.41;
  preRenderGridSuppress(bridge);
  assert.ok(bridge._gridMinor.material.opacity <= 0.08, "当帧渲染前网格被钳制");

  // 全景未激活时不干预
  const idle = makeFakeBridge({ withMap: false });
  idle._gridMinor.material.opacity = 0.41;
  preRenderGridSuppress(idle);
  assert.equal(idle._gridMinor.material.opacity, 0.41, "无全景时不触碰网格");
});

test("E5c: 用户「地面」关 → preRenderGridSuppress 真正隐藏 地板+网格（非仅压暗）", () => {
  const bridge = makeFakeBridge({ withMap: true });
  bridge.__hyUserGroundHidden = true;
  // 模拟原生每帧把地板/网格设回可见
  bridge._ground.visible = true;
  bridge._gridMinor.visible = true;
  bridge._gridMinor.material.opacity = 0.6;
  preRenderGridSuppress(bridge);
  assert.equal(bridge._ground.visible, false, "用户关地面 → 地板 .visible=false");
  assert.equal(bridge._gridMinor.visible, false, "用户关地面 → 网格 .visible=false（这是之前 dim 没做、导致只变色的根因）");
  // 下一帧仍强制隐藏（幂等，压过原生回写）
  bridge._ground.visible = true;
  preRenderGridSuppress(bridge);
  assert.equal(bridge._ground.visible, false, "下一帧继续强制隐藏");
  // 取消隐藏标志 → 不再压 visible（交还原生回写）
  bridge.__hyUserGroundHidden = false;
  bridge._gridMinor.visible = true;
  preRenderGridSuppress(bridge);
  assert.equal(bridge._gridMinor.visible, true, "取消用户隐藏后不再干预 visible");
});

test("E14: applySceneTransformWith 把场景平移叠加到人偶/方块 group（幂等、不漂移、归零复位）", () => {
  const g1 = new THREE.Object3D();
  const g2 = new THREE.Object3D();
  const bridge = {
    _mannequinMap: new Map([["m1", { group: g1 }]]),
    _cubeMap: new Map([["c1", { group: g2 }]]),
  };
  const sceneNode = {
    mannequins: [{ id: "m1", position: { x: 1, y: 0, z: 2 } }],
    cubes: [{ id: "c1", position: { x: -1, y: 0.5, z: 0 } }],
  };
  const ext = { sceneTransform: { position: { x: 10, y: 0, z: -3 } } };
  applySceneTransformWith(bridge, ext, sceneNode);
  assert.deepEqual([g1.position.x, g1.position.y, g1.position.z], [11, 0, -1], "人偶 = 状态位置 + 偏移");
  assert.deepEqual([g2.position.x, g2.position.y, g2.position.z], [9, 0.5, -3], "方块 = 状态位置 + 偏移");
  // 幂等：重算从"状态位置"出发，再调一次不累积漂移
  applySceneTransformWith(bridge, ext, sceneNode);
  assert.deepEqual([g1.position.x, g1.position.y, g1.position.z], [11, 0, -1], "再次调用不累积");
  // 偏移归零 → 回到状态位置
  applySceneTransformWith(bridge, { sceneTransform: { position: { x: 0, y: 0, z: 0 } } }, sceneNode);
  assert.deepEqual([g1.position.x, g1.position.y, g1.position.z], [1, 0, 2], "偏移归零回到状态位置");
  // 无 sceneNode 安全
  applySceneTransformWith(bridge, ext, null);
  assert.ok(true, "无 sceneNode 不崩");
});

test("E15: 场景旋转 — 绕原点转位置 + 朝向叠加（捕获干净基准、单位旋转无跳变、不漂移）", () => {
  const g = new THREE.Object3D();
  g.quaternion.identity(); // 桥设好的"干净"朝向（这里取单位）
  const bridge = { _mannequinMap: new Map([["m1", { group: g }]]) };
  const sceneNode = { mannequins: [{ id: "m1", position: { x: 0, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 } }] };
  // 单位旋转（无 transform）：朝向应捕获基准且不跳变（仍单位）
  applySceneTransformWith(bridge, {}, sceneNode);
  assert.ok(Math.abs(g.quaternion.w - 1) < 1e-9, "单位旋转不改朝向（捕获基准）");
  assert.ok(g.userData.__hyBaseQuat, "已捕获基准四元数");
  // 绕 Y 转 90°：位置 (0,0,2) → (2,0,0)；朝向 = Ry90 · 基准
  const ry = Math.PI / 2;
  applySceneTransformWith(bridge, { sceneTransform: { rotation: { x: 0, y: ry, z: 0 } } }, sceneNode);
  assert.ok(Math.abs(g.position.x - 2) < 1e-6 && Math.abs(g.position.z) < 1e-6, "位置绕 Y 转 90°：(0,0,2)→(2,0,0)");
  const expect = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0, "XYZ"));
  assert.ok(Math.abs(g.quaternion.y - expect.y) < 1e-6 && Math.abs(g.quaternion.w - expect.w) < 1e-6, "朝向 = Ry90·基准");
  // 再调一次相同旋转 → 不漂移（仍是 90°，非 180°）
  applySceneTransformWith(bridge, { sceneTransform: { rotation: { x: 0, y: ry, z: 0 } } }, sceneNode);
  assert.ok(Math.abs(g.quaternion.y - expect.y) < 1e-6, "重复调用朝向不累积漂移");
  // 归零 → 回到基准朝向 + 原位
  applySceneTransformWith(bridge, {}, sceneNode);
  assert.ok(Math.abs(g.quaternion.w - 1) < 1e-9, "归零回到基准朝向");
  assert.ok(Math.abs(g.position.x) < 1e-9 && Math.abs(g.position.z - 2) < 1e-9, "归零回到原位");
});

// ===== F1: 对象可见性 运行时（命中 directorExt.visibility 的人偶 group.visible=false）=====

test("F-E16: applyObjectVisibilityWith hides hit mannequins, restores when removed (幂等)", () => {
  const g1 = new THREE.Object3D();
  const g2 = new THREE.Object3D();
  const bridge = { _mannequinMap: new Map([["m1", { group: g1 }], ["m2", { group: g2 }]]) };
  const sceneNode = { mannequins: [{ id: "m1" }, { id: "m2" }] };

  applyObjectVisibilityWith(bridge, { visibility: { mannequinIds: ["m1"] } }, sceneNode);
  assert.equal(g1.visible, false, "m1 命中 → 隐藏");
  assert.equal(g2.visible, true, "m2 未命中 → 显示");

  // 移出 visibility → 下一帧恢复（无需记忆上次隐藏集）
  applyObjectVisibilityWith(bridge, { visibility: { mannequinIds: [] } }, sceneNode);
  assert.equal(g1.visible, true, "移出后恢复可见");

  // 无 ext / 无 map 安全
  applyObjectVisibilityWith(bridge, null, sceneNode);
  assert.equal(g1.visible, true);
  applyObjectVisibilityWith({}, { visibility: { mannequinIds: ["m1"] } }, sceneNode);
  assert.ok(true, "无 _mannequinMap 不崩");
});

// ===== F3: 人偶头顶名牌 sprite 运行时 =====
// 注：node 无 document → makeLabelTexture 返回 null，sprite 仍创建（map=null），位置/层级/raycast 可测。

test("F-E17: syncMannequinLabelsWith creates one sprite per mannequin in a top-level layer, raycast suppressed", () => {
  const scene = new THREE.Scene();
  const g1 = new THREE.Object3D(); g1.position.set(1, 0, 2);
  const g2 = new THREE.Object3D(); g2.position.set(-3, 0, 0); g2.scale.set(2, 2, 2);
  const bridge = { _mannequinMap: new Map([["m1", { group: g1 }], ["m2", { group: g2 }]]) };
  const sceneNode = { mannequins: [{ id: "m1" }, { id: "m2" }] };

  syncMannequinLabelsWith(bridge, {}, sceneNode, scene);
  const layer = scene.getObjectByName("__hyLabelLayer");
  assert.ok(layer, "顶层名牌容器加入 scene");
  assert.equal(layer.parent, scene, "名牌层挂在 scene 顶层（不挂人偶 group）");
  const sprites = layer.children;
  assert.equal(sprites.length, 2, "每个人偶一个名牌");
  // raycast 屏蔽（覆盖 sprite.raycast）
  const hits = [];
  sprites[0].raycast(null, hits);
  assert.equal(hits.length, 0, "raycast 被屏蔽（不污染拾取）");
  assert.equal(sprites[0].raycast(), null, "raycast 直接返回 null");

  // 头顶位置：m1 scale=1 → y=1.92+0.3；m2 scale=2 → y=1.92*2+0.3
  const s1 = bridge.__hyLabelSprites.get("m1").sprite;
  const s2 = bridge.__hyLabelSprites.get("m2").sprite;
  assert.ok(Math.abs(s1.position.y - (1.92 + 0.3)) < 1e-9, "m1 名牌头顶 y=2.22");
  assert.ok(Math.abs(s1.position.x - 1) < 1e-9 && Math.abs(s1.position.z - 2) < 1e-9, "m1 名牌 x/z 跟随人偶");
  assert.ok(Math.abs(s2.position.y - (1.92 * 2 + 0.3)) < 1e-9, "m2 名牌随 scale 抬高");
});

test("F-E18: label layer visibility follows directorExt.mannequinLabels.visible (默认 true)", () => {
  const scene = new THREE.Scene();
  const g1 = new THREE.Object3D();
  const bridge = { _mannequinMap: new Map([["m1", { group: g1 }]]) };
  const sceneNode = { mannequins: [{ id: "m1" }] };

  syncMannequinLabelsWith(bridge, null, sceneNode, scene);
  assert.equal(scene.getObjectByName("__hyLabelLayer").visible, true, "无 ext 默认显示名牌");

  syncMannequinLabelsWith(bridge, { mannequinLabels: { visible: false } }, sceneNode, scene);
  assert.equal(bridge.__hyLabelLayer.visible, false, "开关关 → 名牌层隐藏");

  syncMannequinLabelsWith(bridge, { mannequinLabels: { visible: true } }, sceneNode, scene);
  assert.equal(bridge.__hyLabelLayer.visible, true, "开关开 → 名牌层显示");
});

test("F-E19: label sprites do not drift on repeated sync, and removed mannequins drop their sprite", () => {
  const scene = new THREE.Scene();
  const g1 = new THREE.Object3D(); g1.position.set(0, 0, 5);
  const bridge = { _mannequinMap: new Map([["m1", { group: g1 }], ["m2", { group: new THREE.Object3D() }]]) };
  const sceneNode = { mannequins: [{ id: "m1" }, { id: "m2" }] };

  syncMannequinLabelsWith(bridge, {}, sceneNode, scene);
  const layer = bridge.__hyLabelLayer;
  assert.equal(layer.children.length, 2);
  // 重复同步 → 不累积 sprite、位置稳定
  syncMannequinLabelsWith(bridge, {}, sceneNode, scene);
  assert.equal(layer.children.length, 2, "重复同步不累积新 sprite");
  const y = bridge.__hyLabelSprites.get("m1").sprite.position.y;
  syncMannequinLabelsWith(bridge, {}, sceneNode, scene);
  assert.equal(bridge.__hyLabelSprites.get("m1").sprite.position.y, y, "位置无累积漂移");

  // 删除 m2 → 其名牌被移除
  bridge._mannequinMap.delete("m2");
  syncMannequinLabelsWith(bridge, {}, { mannequins: [{ id: "m1" }] }, scene);
  assert.equal(layer.children.length, 1, "删除人偶后名牌被回收");
  assert.equal(bridge.__hyLabelSprites.has("m2"), false);
});

test("E22: syncMannequinPosesWith 把 directorExt.mannequins[id].pose 应用到人偶骨骼 + 清空还原", () => {
  const model = new THREE.Group();
  for (const n of ["upperarm_l", "upperarm_r", "spine_01"]) {
    const b = new THREE.Object3D();
    b.name = n;
    model.add(b);
  }
  const bridge = { _mannequinMap: new Map([["m1", { group: model }]]) };
  const ua = model.getObjectByName("upperarm_l");
  // 加姿势：左肩外展 90° → upperarm_l 旋转（非单位四元数）
  syncMannequinPosesWith(bridge, { mannequins: { m1: { pose: { "shoulderL.abduct": 90 } } } });
  assert.ok(Math.abs(ua.quaternion.w - 1) > 1e-3, "左上臂被姿势驱动旋转");
  // 清空姿势 → 还原到绑定（单位）
  syncMannequinPosesWith(bridge, { mannequins: { m1: { pose: {} } } });
  assert.ok(Math.abs(ua.quaternion.w - 1) < 1e-6 && Math.abs(ua.quaternion.x) < 1e-6, "清空 → 还原绑定姿势");
  // 无 _mannequinMap / 无 ext 安全
  syncMannequinPosesWith({}, { mannequins: {} });
  syncMannequinPosesWith(bridge, null);
  assert.ok(true, "无 map / 无 ext 不崩");
});

test("E6: key light estimation finds the brightest cell and maps uv to a sane direction", () => {
  const w = 64;
  const h = 32;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = 40;
    data[i * 4 + 1] = 44;
    data[i * 4 + 2] = 52;
    data[i * 4 + 3] = 255;
  }
  const hot = (9 * w + 40) * 4;
  data[hot] = 255;
  data[hot + 1] = 240;
  data[hot + 2] = 200;
  const estimate = estimateKeyLightFromImage({}, () => ({ data, width: w, height: h }));

  assert.ok(estimate, "estimate produced");
  assert.ok(estimate.direction.y > 0.4, "sun above horizon (v<0.5 → +y)");
  const len = Math.hypot(estimate.direction.x, estimate.direction.y, estimate.direction.z);
  assert.ok(Math.abs(len - 1) < 1e-6, "unit direction");
  assert.ok(estimate.color.r > estimate.color.b, "warm color picked up");
});

test("E7: prototype install is idempotent and hooks the stable sync method", () => {
  return import("./modules/panoramaSceneNode/scene3dBridge.js").then(({ PanoramaScene3DBridge }) => {
    const proto = PanoramaScene3DBridge.prototype;
    const beforeSync = proto._syncPanoramaCanvasVisibility;
    assert.equal(typeof beforeSync, "function");
    const ok1 = installPanoramaEnvironmentRuntime();
    const wrappedSync = proto._syncPanoramaCanvasVisibility;
    const ok2 = installPanoramaEnvironmentRuntime();
    assert.equal(ok1, true);
    assert.equal(ok2, true);
    assert.notEqual(wrappedSync, beforeSync, "_syncPanoramaCanvasVisibility wrapped");
    assert.equal(proto._syncPanoramaCanvasVisibility, wrappedSync, "second install is a no-op");
  });
});

test("E8: grounded dome geometry projects the lower hemisphere onto the capture-height plane", () => {
  const radius = 24;
  const height = 1.6;
  const geometry = buildGroundedDomeGeometry(radius, height);
  const pos = geometry.getAttribute("position");
  let minY = Infinity;
  let flatCount = 0;
  let onSphereBelow = 0;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    minY = Math.min(minY, y);
    const r = Math.hypot(x, y, z);
    if (y < 0) {
      if (Math.abs(y + height) < 1e-3) flatCount += 1;            // 投影到地面平面
      else assert.ok(Math.abs(r - radius) < 1e-3, "clamped points stay on the sphere shell");
      if (Math.abs(r - radius) < 1e-3) onSphereBelow += 1;
    } else {
      assert.ok(Math.abs(r - radius) < 1e-3, "upper hemisphere untouched");
    }
  }
  assert.ok(flatCount > 100, `a substantial floor disc exists (${flatCount} verts)`);
  assert.ok(onSphereBelow > 0, "distant shell below horizon retained");
  assert.ok(minY >= -radius - 1e-6, "nothing escapes the sphere");
});

// ===== Feature 1: 地面 透明度 + 高度（applyGroundAppearanceWith 对假桥）=====
test("E20: applyGroundAppearanceWith 设网格透明度 + 全地面高度（仅用户设过才动）", () => {
  const bridge = makeFakeBridge({ withMap: true });
  // 未设过 → 不动（原生值保持）
  bridge._gridMinor.material.opacity = 0.5;
  bridge._ground.position.y = 0;
  applyGroundAppearanceWith(bridge, null);
  assert.equal(bridge._gridMinor.material.opacity, 0.5, "未设过 → 网格透明度不被覆盖");
  assert.equal(bridge._ground.position.y, 0, "未设过 → 地面高度不动");

  // 设了透明度 → 网格(非不透明地板)material.opacity = 用户值 + transparent=true；不透明地板不动
  applyGroundAppearanceWith(bridge, { ground: { opacity: 0.2 } });
  assert.ok(Math.abs(bridge._gridMinor.material.opacity - 0.2) < 1e-9, "网格透明度 = 用户值");
  assert.equal(bridge._gridMinor.material.transparent, true);

  // 设了高度 → 所有地面 part 的 position.y = 高度
  applyGroundAppearanceWith(bridge, { ground: { height: 1.5 } });
  assert.ok(Math.abs(bridge._ground.position.y - 1.5) < 1e-9, "不透明地板高度");
  assert.ok(Math.abs(bridge._gridMinor.position.y - 1.5) < 1e-9, "网格高度");
});

test("E21: 用户关地面（__hyUserGroundHidden）时 applyGroundAppearanceWith 不动（已整面隐藏）", () => {
  const bridge = makeFakeBridge({ withMap: true });
  bridge.__hyUserGroundHidden = true;
  bridge._gridMinor.material.opacity = 0.5;
  bridge._ground.position.y = 0;
  applyGroundAppearanceWith(bridge, { ground: { opacity: 0.1, height: 2 } });
  assert.equal(bridge._gridMinor.material.opacity, 0.5, "地面关 → 不调透明度");
  assert.equal(bridge._ground.position.y, 0, "地面关 → 不调高度");
});

// ===== Task1: 真实可控地板 GridHelper（syncDirectorFloorWith 对假桥）=====
function floorOf(bridge) {
  return bridge.__hyFloorPlane || null;
}

test("T1-1: syncDirectorFloorWith 创建单例地板（GridHelper），默认透明度 0.40 / 高度 0 / 可见，raycast 屏蔽", () => {
  const scene = new THREE.Scene();
  const bridge = {};
  syncDirectorFloorWith(bridge, null, scene);
  const plane = floorOf(bridge);
  assert.ok(plane, "地板已创建并缓存在 __hyFloorPlane");
  assert.equal(plane.parent, scene, "地板加入 scene");
  assert.equal(plane.name, "__hyFloorPlane");
  assert.ok(plane.isLineSegments, "GridHelper 实现 = LineSegments（有限地板网格观感）");
  assert.equal(plane.visible, true, "默认可见");
  assert.equal(plane.material.transparent, true, "transparent 开启 → opacity 生效");
  assert.ok(Math.abs(plane.material.opacity - 0.4) < 1e-9, "默认透明度 0.40（对齐竞品，未设过回落默认）");
  assert.ok(Math.abs(plane.position.y - 0) < 1e-9, "默认高度 0");
  // raycast 屏蔽（不污染拾取）
  const hits = [];
  plane.raycast(null, hits);
  assert.equal(hits.length, 0, "raycast 被屏蔽");
  assert.equal(plane.raycast(), null, "raycast 直接返回 null");
});

test("T1-2: 地板 opacity/height/visible 跟随 directorExt.ground（幂等、不重建）", () => {
  const scene = new THREE.Scene();
  const bridge = {};
  syncDirectorFloorWith(bridge, { ground: { opacity: 0.25, height: 0.8 } }, scene);
  const plane = floorOf(bridge);
  assert.ok(Math.abs(plane.material.opacity - 0.25) < 1e-9, "透明度 = 用户值");
  assert.ok(Math.abs(plane.position.y - 0.8) < 1e-9, "高度 = 用户值（真正抬升地板）");

  // 幂等：再调一次不重建（同一实例）、按新值更新
  syncDirectorFloorWith(bridge, { ground: { opacity: 0.6, height: -0.5 } }, scene);
  assert.equal(floorOf(bridge), plane, "同一地板实例（不重建）");
  assert.equal(scene.children.filter((c) => c.name === "__hyFloorPlane").length, 1, "scene 中只有一块地板");
  assert.ok(Math.abs(plane.material.opacity - 0.6) < 1e-9, "透明度更新");
  assert.ok(Math.abs(plane.position.y + 0.5) < 1e-9, "高度更新");
});

test("T1-3: 地面 toggle 关（ground.visible=false 或 __hyUserGroundHidden）→ 地板隐藏（与原生网格同隐）", () => {
  const scene = new THREE.Scene();
  const bridge = {};
  syncDirectorFloorWith(bridge, { ground: { visible: false, opacity: 0.4 } }, scene);
  assert.equal(floorOf(bridge).visible, false, "ground.visible=false → 地板隐藏");

  // 重新打开
  syncDirectorFloorWith(bridge, { ground: { visible: true } }, scene);
  assert.equal(floorOf(bridge).visible, true, "ground.visible=true → 地板恢复可见");

  // __hyUserGroundHidden 标志同样隐藏（preRenderGridSuppress 关地面时设的标志）
  bridge.__hyUserGroundHidden = true;
  syncDirectorFloorWith(bridge, {}, scene);
  assert.equal(floorOf(bridge).visible, false, "__hyUserGroundHidden → 地板隐藏（toggle 控制两者）");
});

test("T1-4: syncPanoramaEnvironment 装配地板；360 查看模式移除地板", () => {
  const bridge = makeFakeBridge({ withMap: true });
  syncPanoramaEnvironment(bridge);
  assert.ok(floorOf(bridge), "scene 模式：地板被装配");
  assert.equal(floorOf(bridge).parent, bridge.scene, "地板挂在桥的 scene");

  // 切到 360 查看模式 → 地板移除（镜像 dome 移除）
  bridge._isPanorama360Mode = () => true;
  syncPanoramaEnvironment(bridge);
  assert.equal(floorOf(bridge), null, "360 查看模式：地板被移除");
  assert.ok(!bridge.scene.getObjectByName("__hyFloorPlane"), "scene 中无残留地板");
});

test("T1-5: 无全景背景（scene 模式无 map）仍装配地板（3D 舞台照样有可调地面）", () => {
  const bridge = makeFakeBridge({ withMap: false });
  syncPanoramaEnvironment(bridge);
  assert.ok(floorOf(bridge), "无 map 的 scene 模式也装配地板");
  assert.equal(floorOf(bridge).visible, true);
});

// 机位视角 FOV 真因修复：sceneView.focalLength → bridge.setDefaultSceneFocalLength（orbit FOV 唯一真因）。
function makeFocalBridge({ clampMax = Infinity } = {}) {
  const b = { calls: [], _default: 35 };
  b.setDefaultSceneFocalLength = (v) => { b._default = Math.min(clampMax, Number(v)); b.calls.push(Number(v)); };
  b.getDefaultSceneFocalLength = () => b._default;
  return b;
}
test("FOV-1: syncSceneViewFocalLengthWith 把 sceneView.focalLength 镜像进桥默认焦距", () => {
  const b = makeFocalBridge();
  syncSceneViewFocalLengthWith(b, { viewport: { sceneView: { focalLength: 85 } } });
  assert.deepEqual(b.calls, [85], "首次同步把 85mm 推进桥");
  assert.equal(b.getDefaultSceneFocalLength(), 85);
});
test("FOV-2: 同值幂等（不重复 set→不触发 requestRender 自循环）；变值才再推", () => {
  const b = makeFocalBridge();
  const node = { viewport: { sceneView: { focalLength: 50 } } };
  syncSceneViewFocalLengthWith(b, node);
  syncSceneViewFocalLengthWith(b, node); // 同值
  syncSceneViewFocalLengthWith(b, node);
  assert.deepEqual(b.calls, [50], "同值只推一次");
  node.viewport.sceneView.focalLength = 24;
  syncSceneViewFocalLengthWith(b, node);
  assert.deepEqual(b.calls, [50, 24], "焦距变了才再推");
});
test("FOV-3: 桥钳制超界焦距也不自循环（用原始请求值做幂等标记，非读 getter）", () => {
  const b = makeFocalBridge({ clampMax: 70 }); // 请求 85 → 桥钳到 70；getter 永远回 70≠85
  const node = { viewport: { sceneView: { focalLength: 85 } } };
  syncSceneViewFocalLengthWith(b, node);
  syncSceneViewFocalLengthWith(b, node);
  syncSceneViewFocalLengthWith(b, node);
  assert.deepEqual(b.calls, [85], "钳制场景下仍只推一次（否则会无限 set→render 死循环）");
});
test("FOV-4: 无 setDefaultSceneFocalLength 的旧桥 / 非数字焦距 → 安全跳过", () => {
  assert.doesNotThrow(() => syncSceneViewFocalLengthWith({}, { viewport: { sceneView: { focalLength: 50 } } }));
  const b = makeFocalBridge();
  syncSceneViewFocalLengthWith(b, { viewport: { sceneView: {} } });
  syncSceneViewFocalLengthWith(b, null);
  assert.deepEqual(b.calls, [], "无有效焦距不推");
});
