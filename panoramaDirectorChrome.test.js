import test from "node:test";
import assert from "node:assert/strict";
import {
  ASPECT_PRESETS,
  DIRECTOR_VIEW_MODES,
  TRANSFORM_MODES,
  buildMannequinPosePatch,
  computeSafeFrameRect,
  deriveCaptureAspect,
  deriveInspector,
  deriveSceneTree,
  deriveTransformMode,
  filterSceneTree,
  mannequinColorHex,
  mergeDirectorExt,
  transformModeForHotkey,
  deriveSceneGlobal,
  buildSceneDistancePatch,
  sphereYawPatch,
  sphereRadiusPatch,
  skyColorPatch,
  DEFAULT_SKY_COLOR,
  cameraOrbitFromLookAt,
  resolveCameraLookAtPoint,
  cameraFovPatch,
  focalToHorizontalFov,
  horizontalFovToFocal,
  cameraLookAtTargetPatch,
  cameraLookAtPointPatch,
  deriveCameraInspector,
  isObjectHidden,
  isObjectLocked,
  canSelectObject,
  toggleVisibilityPatch,
  toggleLockPatch,
  deriveCameraOptions,
  resolveActiveCameraId,
  cameraPreviewPlaceholderText,
  buildGridSnapPose,
  resolveSnapGridEnabled,
  snapGridPatch,
  SNAP_GRID_SIZE,
  resolveMannequinLabelsVisible,
  mannequinLabelsVisiblePatch,
  labelForMannequinId,
  computeLabelPositionY,
  CHARACTER_LABEL_HEIGHT,
  resolveGroundOpacity,
  resolveGroundHeight,
  isGroundOpacityUserSet,
  isGroundHeightUserSet,
  groundOpacityPatch,
  groundHeightPatch,
  GROUND_OPACITY_RANGE,
  GROUND_HEIGHT_RANGE,
  buildTreeContextMenuItems,
  resolveCameraCaptures,
  appendCameraCapturePatch,
  clearCameraCapturesPatch,
  cameraCapturesEmptyText,
  MAX_CAMERA_CAPTURES,
} from "./components/panoramaScene/DirectorChrome.js";
import { resolveSceneCameraPose, focalLengthToFov } from "./src/core/panoramaSceneMath.js";

const SCENE = {
  cameras: [
    { id: "c1", name: "机位1", focalLength: 50 },
    { id: "c2", name: "", focalLength: 35 },
  ],
  mannequins: [
    { id: "m1", colorKey: "red", position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: 1.9 },
    { id: "m2", colorKey: "blue", position: { x: -1.46, y: -2.4, z: -2.63 }, rotation: { y: 0 }, scale: 0.94 },
  ],
  selection: { selectedObjectType: null, selectedObjectId: null, selectedObjects: [] },
};

test("D1: scene tree lists cameras (named/defaulted) and characters (角色A/B + color)", () => {
  const tree = deriveSceneTree(SCENE);
  assert.deepEqual(tree.cameras.map((c) => c.label), ["机位1", "机位2"]);
  assert.equal(tree.cameras[1].label, "机位2", "空名机位回落序号标签");
  assert.deepEqual(tree.characters.map((c) => c.label), ["角色A", "角色B"]);
  assert.equal(tree.characters[0].colorHex, "#F75353", "红 → 竞品同款 hex");
  assert.equal(tree.characters[1].colorHex, "#4C7DF7");
  assert.equal(tree.characters[0].type, "mannequin");
});

test("D2: tree search filters by label, both groups", () => {
  const tree = deriveSceneTree(SCENE);
  const f1 = filterSceneTree(tree, "机位");
  assert.equal(f1.cameras.length, 2);
  assert.equal(f1.characters.length, 0);
  const f2 = filterSceneTree(tree, "角色b");
  assert.equal(f2.characters.length, 1);
  assert.equal(f2.characters[0].id, "m2");
  assert.equal(filterSceneTree(tree, "").cameras.length, 2, "空查询不过滤");
});

test("D3: inspector for a selected mannequin exposes editable transform + derived label/color", () => {
  const scene = { ...SCENE, selection: { selectedObjectType: "mannequin", selectedObjectId: "m2", selectedObjects: [{ id: "m2" }] } };
  const insp = deriveInspector(scene);
  assert.equal(insp.kind, "mannequin");
  assert.equal(insp.label, "角色B");
  assert.equal(insp.colorHex, "#4C7DF7");
  assert.equal(insp.editable, true);
  assert.equal(insp.fields.posX, -1.46);
  assert.equal(insp.fields.posY, -2.4);
  assert.equal(insp.fields.posZ, -2.63);
  assert.equal(insp.fields.rotYDeg, 0);
  assert.equal(insp.fields.scale, 0.94);
});

test("D4: rotation rad→deg and scale clamp in inspector view model", () => {
  const scene = { ...SCENE, selection: { selectedObjectType: "mannequin", selectedObjectId: "m1", selectedObjects: [{ id: "m1" }] } };
  const insp = deriveInspector(scene);
  assert.equal(insp.fields.rotYDeg, 90, "π/2 → 90°");
  assert.equal(insp.fields.scale, 1.9);
});

test("D5: multi-selection marks inspector non-editable", () => {
  const scene = { ...SCENE, selection: { selectedObjectType: "mannequin", selectedObjectId: "m1", selectedObjects: [{ id: "m1" }, { id: "m2" }] } };
  assert.equal(deriveInspector(scene).editable, false);
});

test("D6: camera selection → name+focal inspector", () => {
  const scene = { ...SCENE, selection: { selectedObjectType: "camera", selectedObjectId: "c1", selectedObjects: [{ id: "c1" }] } };
  const insp = deriveInspector(scene);
  assert.equal(insp.kind, "camera");
  assert.equal(insp.label, "机位1");
  assert.equal(insp.focalLength, 50);
});

test("D7: nothing selected → null inspector", () => {
  assert.equal(deriveInspector(SCENE), null);
  assert.equal(deriveInspector({}), null);
});

test("D8: edit patches ALWAYS emit full pose (partial pose resets missing fields in the action)", () => {
  const fields = { posX: 1, posY: 0, posZ: 2, rotYDeg: 90, scale: 1.9 };
  // 改 X：position 改，但 rotation/scale 必须也带上（否则被 action 归零）
  const px = buildMannequinPosePatch("posX", "3.5", fields);
  assert.deepEqual(px.position, { x: 3.5, y: 0, z: 2 });
  assert.ok(Math.abs(px.rotation.y - Math.PI / 2) < 1e-9, "改 X 仍带原旋转 90°");
  assert.equal(px.scale, 1.9, "改 X 仍带原缩放");

  const pz = buildMannequinPosePatch("posZ", -4, fields);
  assert.deepEqual(pz.position, { x: 1, y: 0, z: -4 });
  assert.equal(pz.scale, 1.9);

  // 改旋转：rotation 改，但 position/scale 必须保留
  const rot = buildMannequinPosePatch("rotYDeg", 180, fields);
  assert.ok(Math.abs(rot.rotation.y - Math.PI) < 1e-9, "180° → π rad");
  assert.deepEqual(rot.position, { x: 1, y: 0, z: 2 }, "改旋转仍带原位置（关键回归）");
  assert.equal(rot.scale, 1.9, "改旋转仍带原缩放");

  // 改缩放：scale 改，position/rotation 保留
  const sc = buildMannequinPosePatch("scale", 0.01, fields);
  assert.equal(sc.scale, 0.05, "scale 下限钳到 0.05");
  assert.deepEqual(sc.position, { x: 1, y: 0, z: 2 }, "改缩放仍带原位置");
  assert.ok(Math.abs(sc.rotation.y - Math.PI / 2) < 1e-9, "改缩放仍带原旋转");

  assert.equal(buildMannequinPosePatch("posX", "abc", fields), null, "非数字回 null（不写）");
});

test("D9: view modes are exactly director|camera; color fallback is graceful", () => {
  assert.deepEqual([...DIRECTOR_VIEW_MODES], ["director", "camera"]);
  assert.equal(mannequinColorHex("unknownколор"), "#888888");
  assert.equal(mannequinColorHex("RED"), "#F75353", "大小写不敏感");
});

// ===== V1 纯逻辑 =====

test("V1-D10: inspector exposes 3-axis rotation; patches preserve all axes (full pose)", () => {
  const scene = {
    ...SCENE,
    mannequins: [{ id: "m9", colorKey: "red", position: { x: 1, y: 0, z: 2 }, rotation: { x: 0.1, y: Math.PI / 2, z: -0.2 }, scale: 1.3 }],
    selection: { selectedObjectType: "mannequin", selectedObjectId: "m9", selectedObjects: [{ id: "m9" }] },
  };
  const f = deriveInspector(scene).fields;
  assert.equal(f.rotXDeg, radToDegSafe(0.1), "rotX 暴露");
  assert.equal(f.rotYDeg, 90);
  assert.equal(f.rotZDeg, radToDegSafe(-0.2), "rotZ 暴露");

  // 改 rotX → 三轴旋转 + 位置/缩放全保留（part-pose 重置陷阱）
  const p = buildMannequinPosePatch("rotXDeg", 45, f);
  assert.ok(Math.abs(p.rotation.x - Math.PI / 4) < 1e-9, "rotX→45°");
  assert.ok(Math.abs(p.rotation.y - Math.PI / 2) < 1e-9, "rotY 保留 90°");
  // rotZDeg 在 inspector 已 round 到整数度，patch 由该整数度还原（往返一致，非原始弧度）
  assert.ok(Math.abs(p.rotation.z - (f.rotZDeg * Math.PI) / 180) < 1e-9, "rotZ 按当前字段保留");
  assert.deepEqual(p.position, { x: 1, y: 0, z: 2 }, "位置保留");
  assert.equal(p.scale, 1.3, "缩放保留");

  function radToDegSafe(r) { return Math.round((r * 180) / Math.PI); }
});

test("V1-D11: aspect presets are the 7 competitor ratios; derive falls back to adaptive", () => {
  assert.deepEqual(ASPECT_PRESETS.map((p) => p.key), ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
  assert.equal(ASPECT_PRESETS.find((p) => p.key === "adaptive").ratio, null);
  assert.ok(Math.abs(ASPECT_PRESETS.find((p) => p.key === "16:9").ratio - 16 / 9) < 1e-9);
  // 落点 = node.directorExt.aspect（非 sceneNode）
  assert.equal(deriveCaptureAspect({ directorExt: { aspect: "16:9" } }), "16:9");
  assert.equal(deriveCaptureAspect({ directorExt: { aspect: "bogus" } }), "adaptive", "非法值回落");
  assert.equal(deriveCaptureAspect({}), "adaptive", "无 directorExt 回落");
  assert.equal(deriveCaptureAspect(null), "adaptive");
});

test("V1-D12: self-drawn safe frame rect inscribes the target ratio, centered", () => {
  // adaptive → 满框无遮罩
  const full = computeSafeFrameRect("adaptive", 1600, 900);
  assert.equal(full.full, true);
  assert.equal(full.w, 1600);
  assert.equal(full.h, 900);

  // 16:9 in 16:9 视口 → 满框
  const exact = computeSafeFrameRect("16:9", 1600, 900);
  assert.ok(Math.abs(exact.w - 1600) < 1e-6 && Math.abs(exact.h - 900) < 1e-6, "比例吻合时满框");

  // 1:1 in 1600×900 → 高占满(900)，宽=900，左右各留 350
  const sq = computeSafeFrameRect("1:1", 1600, 900);
  assert.ok(Math.abs(sq.h - 900) < 1e-6 && Math.abs(sq.w - 900) < 1e-6, "1:1 内接 900×900");
  assert.ok(Math.abs(sq.x - 350) < 1e-6 && Math.abs(sq.y - 0) < 1e-6, "水平居中");

  // 9:16 竖图 in 1600×900 → 宽受限？9/16=0.5625<viewRatio1.78 → 高占满900,宽=900*0.5625=506.25
  const portrait = computeSafeFrameRect("9:16", 1600, 900);
  assert.ok(Math.abs(portrait.h - 900) < 1e-6, "竖幅高占满");
  assert.ok(Math.abs(portrait.w - 900 * 9 / 16) < 1e-6, "宽=高×比例");

  // 退化输入
  assert.equal(computeSafeFrameRect("16:9", 0, 0).full, true);
});

test("V1-D14: mergeDirectorExt deep-merges nested keys (V2-V4 不互相冲掉)", () => {
  // 同一嵌套对象的兄弟键不丢（V2 全景球分两次写半径/旋转）
  const a = mergeDirectorExt({ panoramaSphere: { radiusScale: 1.2 } }, { panoramaSphere: { yawOffset: 0.5 } });
  assert.deepEqual(a.panoramaSphere, { radiusScale: 1.2, yawOffset: 0.5 });
  // 不同 id 共存（V4 写 m2 不冲掉 m1）
  const b = mergeDirectorExt({ mannequins: { m1: { pose: { spine: 1 } } } }, { mannequins: { m2: { pose: { neck: 2 } } } });
  assert.deepEqual(Object.keys(b.mannequins).sort(), ["m1", "m2"]);
  // 同 id 同键递归合并
  const c = mergeDirectorExt({ mannequins: { m1: { pose: { spine: 1 } } } }, { mannequins: { m1: { pose: { neck: 2 } } } });
  assert.deepEqual(c.mannequins.m1.pose, { spine: 1, neck: 2 });
  // 原始值覆盖 + 退化输入
  assert.equal(mergeDirectorExt({ aspect: "16:9" }, { aspect: "1:1" }).aspect, "1:1");
  assert.deepEqual(mergeDirectorExt(null, { aspect: "1:1" }), { aspect: "1:1" });
  assert.deepEqual(mergeDirectorExt({ aspect: "16:9" }, {}), { aspect: "16:9" });
});

// ===== V2 纯逻辑：全局场景检查器 =====

test("V2-D15: deriveSceneGlobal reads scene distance + sphere/sky from directorExt + panorama", () => {
  const scene = { viewport: { sceneView: { orbitDistance: 12 } }, panorama: { imageUrl: "/x.jpg", fileName: "x.jpg" } };
  const ext = { panoramaSphere: { radiusScale: 1.4, yawOffset: Math.PI / 2 }, environmentSkyColor: "#102030" };
  const g = deriveSceneGlobal(scene, ext);
  assert.equal(g.sceneDistance, 12);
  assert.equal(g.sphereRadiusScale, 1.4);
  assert.equal(g.sphereYawDeg, 90, "弧度→度");
  assert.equal(g.skyColor, "#102030");
  assert.equal(g.panorama.hasImage, true);
  assert.equal(g.panorama.fileName, "x.jpg");
});

test("V2-D16: deriveSceneGlobal falls back gracefully (no ext / bad values)", () => {
  const g = deriveSceneGlobal({}, null);
  assert.equal(g.sphereRadiusScale, 1, "无 ext → 半径默认 1");
  assert.equal(g.sphereYawDeg, 0);
  assert.equal(g.skyColor, DEFAULT_SKY_COLOR);
  assert.equal(g.panorama.hasImage, false);
  // 非法天空色回落
  assert.equal(deriveSceneGlobal({}, { environmentSkyColor: "red" }).skyColor, DEFAULT_SKY_COLOR);
  // 距离/半径越界钳制
  assert.equal(deriveSceneGlobal({ viewport: { sceneView: { orbitDistance: 999 } } }, {}).sceneDistance, 60);
  assert.equal(deriveSceneGlobal({}, { panoramaSphere: { radiusScale: 99 } }).sphereRadiusScale, 2.5);
});

test("V2-D17: scene/sphere/sky patches target the right落点 and preserve sceneView", () => {
  // 场景缩放只改 orbitDistance，保留其余 sceneView
  const sv = { target: { x: 1, y: 1, z: 1 }, orbitYaw: 0.5, orbitPitch: 0.3, orbitDistance: 9 };
  const p = buildSceneDistancePatch(sv, 20);
  assert.equal(p.orbitDistance, 20);
  assert.deepEqual(p.target, { x: 1, y: 1, z: 1 }, "target 保留");
  assert.equal(p.orbitYaw, 0.5, "yaw 保留");
  // 球旋转/半径/天空色 → directorExt 落点
  assert.ok(Math.abs(sphereYawPatch(90).panoramaSphere.yawOffset - Math.PI / 2) < 1e-9);
  assert.equal(sphereRadiusPatch(1.5).panoramaSphere.radiusScale, 1.5);
  assert.equal(sphereRadiusPatch(99).panoramaSphere.radiusScale, 2.5, "半径钳制");
  assert.equal(skyColorPatch("#aabbcc").environmentSkyColor, "#aabbcc");
  assert.equal(skyColorPatch("bad").environmentSkyColor, DEFAULT_SKY_COLOR);
});

// ===== V3 纯逻辑：机位检查器 =====

test("V3-D18: camera inspector enriches FOV/position/lookAt from camera + directorExt", () => {
  const scene = {
    cameras: [{ id: "c1", name: "机位1", slot: 1, position: { x: 9, y: 1.4, z: 2.8 }, focalLength: 50 }],
    mannequins: [{ id: "m1", colorKey: "red" }, { id: "m2", colorKey: "blue" }],
    selection: { selectedObjectType: "camera", selectedObjectId: "c1", selectedObjects: [{ id: "c1" }] },
  };
  // 无 directorExt：用机位自身值 + 默认注视
  const a = deriveInspector(scene);
  assert.equal(a.kind, "camera");
  assert.equal(a.title, "摄像机");
  assert.equal(a.focalLength, 50);
  assert.ok(a.fovDeg > 0, "FOV 由焦距换算");
  assert.deepEqual(a.position, { x: 9, y: 1.4, z: 2.8 });
  assert.equal(a.lookAtTarget, "manual");
  assert.deepEqual(a.targetOptions.map((o) => o.value), ["manual", "m1", "m2"], "注视目标=手动+各角色");
  // directorExt 覆盖：注视角色 m2 + FOV 焦距 35
  const ext = { cameras: { c1: { lookAtTarget: "m2", focalLength: 35, lookAtPoint: { x: 1, y: 1.2, z: 0 } } } };
  const b = deriveInspector(scene, ext);
  assert.equal(b.lookAtTarget, "m2");
  assert.equal(b.focalLength, 35);
});

test("V3-D18b: deriveCameraInspector works by id (机位不可经原生 selection 选中)", () => {
  const scene = {
    cameras: [{ id: "c1", name: "机位1", position: { x: 9, y: 1.4, z: 2.8 }, focalLength: 50 },
              { id: "c2", name: "", position: { x: 1, y: 1, z: 1 }, focalLength: 35 }],
    mannequins: [{ id: "m1", colorKey: "red" }],
  };
  const insp = deriveCameraInspector(scene, null, "c2");
  assert.equal(insp.kind, "camera");
  assert.equal(insp.label, "机位2", "空名回落序号");
  assert.deepEqual(insp.position, { x: 1, y: 1, z: 1 });
  assert.equal(deriveCameraInspector(scene, null, "ghost"), null, "不存在机位回 null");
});

test("V3-D19: cameraOrbitFromLookAt round-trips through resolveSceneCameraPose", () => {
  const position = { x: 9.66, y: 1.37, z: 2.76 };
  const lookAtPoint = { x: 0, y: 1.2, z: 0 };
  const sv = cameraOrbitFromLookAt({ position, lookAtPoint, focalLength: 50 });
  const pose = resolveSceneCameraPose(sv);
  assert.ok(Math.abs(pose.position.x - position.x) < 1e-6, "相机位 x 还原");
  assert.ok(Math.abs(pose.position.y - position.y) < 1e-6, "相机位 y 还原");
  assert.ok(Math.abs(pose.position.z - position.z) < 1e-6, "相机位 z 还原");
  assert.ok(Math.abs(pose.target.x - lookAtPoint.x) < 1e-6, "注视点=target");
  assert.ok(Math.abs(pose.target.y - lookAtPoint.y) < 1e-6);
});

test("V3-D19b: cameraOrbitFromLookAt 携带 focalLength（机位视角 FOV 的意图载体）", () => {
  // 实证（活体桥层归一化）：sceneView.fov 会被 normalize 剥离，且 resolveSceneCameraPose 只认 fallbackFov
  //（=focalLengthToFov(bridge._defaultSceneFocalLength)），完全忽略 sceneView 自身的 fov/focalLength。
  // 故 orbit 视图 FOV 唯一真因 = bridge._defaultSceneFocalLength；运行时把 sceneView.focalLength 同步进桥。
  const sv24 = cameraOrbitFromLookAt({ position: { x: 0, y: 1.6, z: 5 }, lookAtPoint: { x: 0, y: 1.2, z: 0 }, focalLength: 24 });
  const sv85 = cameraOrbitFromLookAt({ position: { x: 0, y: 1.6, z: 5 }, lookAtPoint: { x: 0, y: 1.2, z: 0 }, focalLength: 85 });
  assert.equal(sv24.focalLength, 24, "24mm 焦距随 sceneView 提交（运行时据此设桥默认焦距）");
  assert.equal(sv85.focalLength, 85, "85mm 焦距随 sceneView 提交");
  // 焦距→FOV 单调：85mm（长焦）FOV 应小于 24mm（广角），证明同步进桥后视野会变窄。
  assert.ok(focalLengthToFov(85) < focalLengthToFov(24), "长焦 FOV < 广角 FOV → 视野更窄");
});

test("V3-D20: resolveCameraLookAtPoint targets manual point or mannequin head", () => {
  const mannequins = [{ id: "m1", position: { x: 2, y: 0, z: 1 }, scale: 1 }, { id: "m2", position: { x: -1, y: 0, z: 0 }, scale: 2 }];
  // 手动
  assert.deepEqual(resolveCameraLookAtPoint({ lookAtTarget: "manual", lookAtPoint: { x: 0, y: 1.2, z: 0 } }, mannequins), { x: 0, y: 1.2, z: 0 });
  // 角色头部 = 脚底 + 1.72·scale
  const head = resolveCameraLookAtPoint({ lookAtTarget: "m2" }, mannequins);
  assert.deepEqual(head, { x: -1, y: 1.72 * 2, z: 0 }, "m2 头部 = scale 2 → y=3.44");
  // 目标角色不存在 → 回落手动/默认
  assert.deepEqual(resolveCameraLookAtPoint({ lookAtTarget: "ghost" }, mannequins), { x: 0, y: 1.2, z: 0 });
});

test("V3-D21: camera patches target directorExt.cameras[id]; FOV↔focal clamped", () => {
  const fp = cameraFovPatch("c1", 50);
  assert.ok(fp.cameras.c1.focalLength >= 16 && fp.cameras.c1.focalLength <= 135, "焦距钳制");
  assert.deepEqual(cameraLookAtTargetPatch("c1", "m1").cameras.c1, { lookAtTarget: "m1" });
  assert.deepEqual(cameraLookAtPointPatch("c1", "y", 1.5).cameras.c1, { lookAtPoint: { y: 1.5 } });
  assert.equal(cameraLookAtPointPatch("c1", "x", "abc"), null, "非数字回 null");
});

test("V3-D21b: FOV 用水平角(15–90,对齐竞品)，整段映射到合法焦距、无死区、单调", () => {
  // 竞品 FOV 15–90 是【水平 FOV】(传感器宽 36mm)；引擎内置换算是垂直(24mm)→焦距[16,135] 只到垂直[10,74]，
  // 拖 15/90 两端塌死区。改水平换算后：焦距[16,135]↔水平[15.2,96.7]，整段 15–90 落在合法焦距[18,135]。
  for (const deg of [15, 30, 45, 60, 75, 90]) {
    const focal = cameraFovPatch("c1", deg).cameras.c1.focalLength;
    assert.ok(focal >= 16 && focal <= 135, `${deg}° 焦距在合法区间`);
    // 15° 因 focalFor15≈136.7>135 会轻微钳到 135(→15.2°)，其余应几乎精确还原
    const back = focalToHorizontalFov(focal);
    const tol = deg <= 15 ? 0.5 : 0.1;
    assert.ok(Math.abs(back - deg) <= tol, `${deg}° 水平 FOV 往返一致(实得 ${back.toFixed(2)})`);
  }
  // 单调：数值越低=焦距越长(越聚焦)；越高=焦距越短(越广)
  const f15 = horizontalFovToFocal(15), f45 = horizontalFovToFocal(45), f90 = horizontalFovToFocal(90);
  assert.ok(f15 > f45 && f45 > f90, "FOV 越大焦距越短(更广)");
  assert.equal(f90, horizontalFovToFocal(90), "幂等");
});

test("V1-D13: transform mode derive + hotkey mapping", () => {
  assert.deepEqual(TRANSFORM_MODES.map((m) => m.key), ["move", "rotate", "scale"]);
  assert.deepEqual(TRANSFORM_MODES.map((m) => m.hotkey), ["V", "R", "S"]);
  assert.equal(deriveTransformMode({ ui: { transformTool: "rotate" } }), "rotate");
  assert.equal(deriveTransformMode({ ui: { transformTool: "bogus" } }), "move", "非法回落 move");
  assert.equal(deriveTransformMode({}), "move");
  assert.equal(transformModeForHotkey("V"), "move");
  assert.equal(transformModeForHotkey("r"), "rotate", "大小写不敏感");
  assert.equal(transformModeForHotkey("s"), "scale");
  assert.equal(transformModeForHotkey("x"), null, "无关键回 null");
});

// ===== F1: 场景树 可见性👁 + 锁定🔒（directorExt 数组旁路）=====

test("F1-D22: deriveSceneTree marks visible/locked from directorExt arrays (默认全显示未锁)", () => {
  // 无 directorExt → 全显示、全未锁
  const t0 = deriveSceneTree(SCENE);
  assert.equal(t0.characters[0].visible, true);
  assert.equal(t0.characters[0].locked, false);
  assert.equal(t0.cameras[0].visible, true);
  assert.equal(t0.cameras[0].locked, false);

  // visibility.mannequinIds 命中 → 该角色 visible=false（仅命中项）
  const ext = { visibility: { mannequinIds: ["m1"], cameraIds: ["c2"] }, locked: { mannequinIds: ["m2"], cameraIds: [] } };
  const t = deriveSceneTree(SCENE, ext);
  assert.equal(t.characters[0].visible, false, "m1 隐藏");
  assert.equal(t.characters[1].visible, true, "m2 仍显示");
  assert.equal(t.characters[1].locked, true, "m2 锁定");
  assert.equal(t.characters[0].locked, false);
  assert.equal(t.cameras[1].visible, false, "c2 隐藏");
  assert.equal(t.cameras[0].visible, true);
});

test("F1-D23: isObjectHidden/isObjectLocked/canSelectObject read directorExt by kind+id", () => {
  const ext = { visibility: { mannequinIds: ["m1"] }, locked: { mannequinIds: ["m2"], cameraIds: ["c1"] } };
  assert.equal(isObjectHidden("mannequin", "m1", ext), true);
  assert.equal(isObjectHidden("mannequin", "m2", ext), false);
  assert.equal(isObjectLocked("mannequin", "m2", ext), true);
  assert.equal(isObjectLocked("camera", "c1", ext), true);
  assert.equal(canSelectObject("mannequin", "m2", ext), false, "锁定不可选");
  assert.equal(canSelectObject("mannequin", "m1", ext), true, "仅隐藏仍可选");
  assert.equal(canSelectObject("camera", "c2", ext), true);
  // 无 ext 安全
  assert.equal(isObjectHidden("mannequin", "m1", null), false);
  assert.equal(canSelectObject("camera", "c1", undefined), true);
});

test("F1-D24: toggle patches return FULL id array (deep-merge 数组替换语义)", () => {
  // 从无 → 加入
  const add = toggleVisibilityPatch("mannequin", "m1", null);
  assert.deepEqual(add, { visibility: { mannequinIds: ["m1"] } });
  // 已有 → 移除
  const ext = { visibility: { mannequinIds: ["m1", "m2"] } };
  const rm = toggleVisibilityPatch("mannequin", "m1", ext);
  assert.deepEqual(rm, { visibility: { mannequinIds: ["m2"] } }, "移除 m1 回传完整剩余数组");
  // 锁定 camera 走 cameraIds
  const lk = toggleLockPatch("camera", "c1", null);
  assert.deepEqual(lk, { locked: { cameraIds: ["c1"] } });
  // 经 mergeDirectorExt 合并后不冲掉兄弟字段（数组替换、其他键保留）
  const merged = mergeDirectorExt({ aspect: "16:9", visibility: { cameraIds: ["c9"] } }, add);
  assert.equal(merged.aspect, "16:9", "aspect 保留");
  assert.deepEqual(merged.visibility.mannequinIds, ["m1"]);
  assert.deepEqual(merged.visibility.cameraIds, ["c9"], "cameraIds 兄弟键保留");
});

test("F1-D25: locked mannequin/camera inspector is non-editable", () => {
  const mScene = { ...SCENE, selection: { selectedObjectType: "mannequin", selectedObjectId: "m1", selectedObjects: [{ id: "m1" }] } };
  const lockedExt = { locked: { mannequinIds: ["m1"] } };
  assert.equal(deriveInspector(mScene, lockedExt).editable, false, "锁定角色 inspector 不可编辑");
  assert.equal(deriveInspector(mScene, lockedExt).locked, true);
  assert.equal(deriveInspector(mScene).editable, true, "未锁仍可编辑");
  // camera
  const cInsp = deriveCameraInspector(SCENE, { locked: { cameraIds: ["c1"] } }, "c1");
  assert.equal(cInsp.editable, false);
  assert.equal(cInsp.locked, true);
  assert.equal(deriveCameraInspector(SCENE, null, "c1").editable, true);
});

test("F1-D26: visibility/locked survive a JSON store roundtrip (arrays, not Sets)", () => {
  const ext = { visibility: { mannequinIds: ["m1"] }, locked: { cameraIds: ["c1"] } };
  const round = JSON.parse(JSON.stringify(ext));
  assert.deepEqual(round.visibility.mannequinIds, ["m1"], "数组过 JSON 往返存活");
  assert.deepEqual(round.locked.cameraIds, ["c1"]);
  // 数组而非 Set（Set 会序列化成 {} 丢失）
  assert.ok(Array.isArray(round.visibility.mannequinIds));
});

// ===== F2: 摄像机检查器 — 切换机位选项 + 预览占位文字 =====

test("F2-D27: deriveCameraOptions lists cameras and flags the active one", () => {
  const opts = deriveCameraOptions(SCENE, "c2");
  assert.deepEqual(opts.map((o) => o.value), ["c1", "c2"]);
  assert.deepEqual(opts.map((o) => o.label), ["机位1", "机位2"], "空名回落序号");
  assert.equal(opts[1].active, true, "c2 标为激活");
  assert.equal(opts[0].active, false);
  assert.equal(deriveCameraOptions({}, null).length, 0, "无机位空列表");
});

test("F2-D28: resolveActiveCameraId prefers dcCameraId, then viewport, then first", () => {
  const scene = { ...SCENE, viewport: { activeCameraId: "c2" } };
  assert.equal(resolveActiveCameraId(scene, "c1"), "c1", "导演侧 dcCameraId 优先");
  assert.equal(resolveActiveCameraId(scene, null), "c2", "回落 viewport.activeCameraId");
  assert.equal(resolveActiveCameraId({ ...SCENE }, "ghost"), "c1", "非法 dc + 无 viewport → 首个机位");
  assert.equal(resolveActiveCameraId({}, null), null, "无机位 → null");
});

test("F2-D29: cameraPreviewPlaceholderText is the degraded 机位N · {fov}° / {focal}mm string", () => {
  const insp = deriveCameraInspector(SCENE, { cameras: { c1: { focalLength: 50 } } }, "c1");
  const txt = cameraPreviewPlaceholderText(insp);
  assert.match(txt, /机位1 · \d+° \/ [\d.]+mm/);
  assert.ok(txt.includes("50mm"), "焦距入字符串");
  // 退化输入安全
  assert.equal(cameraPreviewPlaceholderText(null), "机位 · 0° / 0mm");
});

// ===== F3: 人偶头顶名牌 — 标签文字 + 头顶坐标 + 开关 =====

test("F3-D30: labelForMannequinId aligns to array index (角色A/B…) and guards missing id", () => {
  const mannequins = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  assert.equal(labelForMannequinId("m1", mannequins), "角色A");
  assert.equal(labelForMannequinId("m2", mannequins), "角色B");
  assert.equal(labelForMannequinId("m3", mannequins), "角色C");
  assert.equal(labelForMannequinId("ghost", mannequins), "角色A", "不存在 id 回落首个（防崩）");
  assert.equal(labelForMannequinId("m1", null), "角色A");
});

test("F3-D31: computeLabelPositionY = groupY + 1.92·scale + offset (scale 跟随)", () => {
  assert.ok(Math.abs(computeLabelPositionY(0, 1, 0.3) - (1.92 + 0.3)) < 1e-9, "默认 scale=1 → 2.22");
  assert.ok(Math.abs(computeLabelPositionY(0, 2, 0.3) - (1.92 * 2 + 0.3)) < 1e-9, "scale=2 → 头顶随之抬高");
  assert.ok(Math.abs(computeLabelPositionY(5, 1, 0.3) - (5 + 1.92 + 0.3)) < 1e-9, "groupY 叠加");
  assert.equal(CHARACTER_LABEL_HEIGHT, 1.92);
  // 退化 scale
  assert.ok(Math.abs(computeLabelPositionY(0, 0, 0.3) - (1.92 + 0.3)) < 1e-9, "scale<=0 回落 1");
});

test("F3-D32: mannequin labels visible toggle reads/writes directorExt.mannequinLabels.visible", () => {
  assert.equal(resolveMannequinLabelsVisible(null), true, "默认显示");
  assert.equal(resolveMannequinLabelsVisible({ mannequinLabels: { visible: false } }), false);
  assert.equal(resolveMannequinLabelsVisible({ mannequinLabels: { visible: true } }), true);
  assert.deepEqual(mannequinLabelsVisiblePatch(false), { mannequinLabels: { visible: false } });
  assert.deepEqual(mannequinLabelsVisiblePatch(true), { mannequinLabels: { visible: true } });
});

// ===== F4: 网格吸附 — 完整 pose + 滞回稳定 =====

test("F4-D33: buildGridSnapPose snaps X/Z to grid, keeps Y/rotation/scale, emits FULL pose", () => {
  const fields = { posX: 1.23, posY: 0.5, posZ: -0.78, rotXDeg: 0, rotYDeg: 90, rotZDeg: 0, scale: 1.4 };
  const pose = buildGridSnapPose(fields, 0.5, null);
  assert.equal(pose.position.x, 1.0, "1.23 → 最近 0.5 网格 = 1.0");
  assert.equal(pose.position.z, -1.0, "-0.78 → -1.0");
  assert.equal(pose.position.y, 0.5, "Y 不吸附，原样保留");
  assert.ok(Math.abs(pose.rotation.y - Math.PI / 2) < 1e-9, "旋转 90° 保留（完整 pose）");
  assert.equal(pose.scale, 1.4, "缩放保留");
  assert.equal(SNAP_GRID_SIZE, 0.5);
});

test("F4-D34: grid snap hysteresis holds previous snap within the window (无抖动)", () => {
  // 距上次吸附值很近、在滞回窗内 → 保持上次值不跳格
  const fields = { posX: 1.18, posY: 0, posZ: 0, rotXDeg: 0, rotYDeg: 0, rotZDeg: 0, scale: 1 };
  const held = buildGridSnapPose(fields, 0.5, { x: 1.0, z: 0 });
  assert.equal(held.position.x, 1.0, "滞回窗内保持 1.0 不跳到 1.0/1.5 边界抖动");
  // 越过滞回窗 → 跳到新格
  const moved = buildGridSnapPose({ ...fields, posX: 1.6 }, 0.5, { x: 1.0, z: 0 });
  assert.equal(moved.position.x, 1.5, "越窗 → 吸附到 1.5");
});

test("F4-D35: snapGrid enabled toggle reads/writes directorExt.snapGrid.enabled", () => {
  assert.equal(resolveSnapGridEnabled(null), false, "默认关");
  assert.equal(resolveSnapGridEnabled({ snapGrid: { enabled: true } }), true);
  assert.equal(resolveSnapGridEnabled({ snapGrid: { enabled: false } }), false);
  assert.deepEqual(snapGridPatch(true), { snapGrid: { enabled: true } });
  assert.deepEqual(snapGridPatch(false), { snapGrid: { enabled: false } });
});

// ===== Feature 1: 地面 透明度 + 高度 (directorExt.ground.opacity / .height) =====
test("G1-D40: resolveGroundOpacity/Height defaults + clamp; UserSet 仅 number 为真", () => {
  // 未设过 → 回落默认（滑杆初值），但 UserSet=false（运行时不强制覆盖原生）
  assert.equal(resolveGroundOpacity(null), GROUND_OPACITY_RANGE.default);
  assert.equal(resolveGroundOpacity({}), 0.4);
  assert.equal(isGroundOpacityUserSet(null), false);
  assert.equal(isGroundOpacityUserSet({ ground: {} }), false);
  // 设过 → 取该值（钳到 0..1），UserSet=true
  assert.equal(resolveGroundOpacity({ ground: { opacity: 0.7 } }), 0.7);
  assert.equal(resolveGroundOpacity({ ground: { opacity: 2 } }), 1, "钳到上界");
  assert.equal(resolveGroundOpacity({ ground: { opacity: -1 } }), 0, "钳到下界");
  assert.equal(isGroundOpacityUserSet({ ground: { opacity: 0 } }), true, "0 也算设过");
  // 高度
  assert.equal(resolveGroundHeight(null), GROUND_HEIGHT_RANGE.default);
  assert.equal(resolveGroundHeight({ ground: { height: 0.5 } }), 0.5);
  assert.equal(resolveGroundHeight({ ground: { height: 99 } }), 2, "钳到 +2");
  assert.equal(resolveGroundHeight({ ground: { height: -99 } }), -2, "钳到 -2");
  assert.equal(isGroundHeightUserSet({ ground: { height: 0 } }), true);
  assert.equal(isGroundHeightUserSet({ ground: {} }), false);
});

test("G1-D41: groundOpacity/Height patches 深合并不冲掉 ground.visible", () => {
  assert.deepEqual(groundOpacityPatch(0.5), { ground: { opacity: 0.5 } });
  assert.deepEqual(groundHeightPatch(0.3), { ground: { height: 0.3 } });
  // 非法值回落默认
  assert.deepEqual(groundOpacityPatch("x"), { ground: { opacity: 0.4 } });
  assert.deepEqual(groundHeightPatch(undefined), { ground: { height: 0 } });
  // 深合并：先 visible，再 opacity，两者并存（mergeDirectorExt 嵌套合并）
  let ext = mergeDirectorExt({}, { ground: { visible: false } });
  ext = mergeDirectorExt(ext, groundOpacityPatch(0.6));
  ext = mergeDirectorExt(ext, groundHeightPatch(0.2));
  assert.deepEqual(ext.ground, { visible: false, opacity: 0.6, height: 0.2 });
});

test("G1-D42: deriveSceneGlobal 暴露 ground 状态（驱动滑杆显隐 + 初值）", () => {
  const g0 = deriveSceneGlobal({}, null);
  assert.equal(g0.ground.visible, true, "默认地面开");
  assert.equal(g0.ground.opacity, 0.4);
  assert.equal(g0.ground.height, 0);
  const g1 = deriveSceneGlobal({}, { ground: { visible: false, opacity: 0.25, height: 1 } });
  assert.equal(g1.ground.visible, false);
  assert.equal(g1.ground.opacity, 0.25);
  assert.equal(g1.ground.height, 1);
});

// ===== Feature 2: 场景树行右键菜单项装配 =====
test("G2-D43: buildTreeContextMenuItems 标签随 visible/locked 翻转，打组禁用", () => {
  const items = buildTreeContextMenuItems({ type: "mannequin", id: "m1", visible: true, locked: false });
  const byAction = Object.fromEntries(items.map((i) => [i.action, i]));
  assert.equal(byAction.toggleVisibility.label, "隐藏", "可见 → 显示「隐藏」");
  assert.equal(byAction.toggleLock.label, "锁定", "未锁 → 显示「锁定」");
  assert.equal(byAction.group.disabled, true, "打组禁用（不伪造）");
  assert.ok(byAction.group.devNote, "打组带开发中说明");
  assert.equal(byAction.delete.danger, true);
  // 翻转态
  const items2 = buildTreeContextMenuItems({ type: "camera", id: "c1", visible: false, locked: true });
  const m2 = Object.fromEntries(items2.map((i) => [i.action, i]));
  assert.equal(m2.toggleVisibility.label, "显示", "隐藏 → 显示「显示」");
  assert.equal(m2.toggleLock.label, "解锁", "已锁 → 显示「解锁」");
});

// ===== Feature 3: 摄像机截图 captures 列表 (directorExt.cameras[id].captures) =====
test("G3-D44: resolveCameraCaptures 读数组 + 过滤非法 + 空态", () => {
  assert.deepEqual(resolveCameraCaptures(null, "c1"), []);
  assert.deepEqual(resolveCameraCaptures({ cameras: { c1: {} } }, "c1"), []);
  assert.deepEqual(
    resolveCameraCaptures({ cameras: { c1: { captures: ["data:a", "", null, "data:b"] } } }, "c1"),
    ["data:a", "data:b"],
    "过滤空串/非字符串",
  );
  assert.equal(cameraCapturesEmptyText(), "暂无摄像机截图");
});

test("G3-D45: appendCameraCapturePatch push（深合并保留其他机位字段）+ FIFO 上限", () => {
  const ext = { cameras: { c1: { focalLength: 50, captures: ["data:a"] } } };
  const patch = appendCameraCapturePatch("c1", "data:b", ext);
  assert.deepEqual(patch, { cameras: { c1: { captures: ["data:a", "data:b"] } } });
  // 深合并后 focalLength 仍在
  const merged = mergeDirectorExt(ext, patch);
  assert.equal(merged.cameras.c1.focalLength, 50);
  assert.deepEqual(merged.cameras.c1.captures, ["data:a", "data:b"]);
  // 空 dataURL → null（不写）
  assert.equal(appendCameraCapturePatch("c1", "", ext), null);
  // FIFO：超上限丢最旧
  const many = Array.from({ length: MAX_CAMERA_CAPTURES }, (_, i) => `d${i}`);
  const over = appendCameraCapturePatch("c1", "dNEW", { cameras: { c1: { captures: many } } });
  assert.equal(over.cameras.c1.captures.length, MAX_CAMERA_CAPTURES);
  assert.equal(over.cameras.c1.captures[0], "d1", "丢掉最旧 d0");
  assert.equal(over.cameras.c1.captures[MAX_CAMERA_CAPTURES - 1], "dNEW");
});

test("G3-D46: clearCameraCapturesPatch 清空 + 进检查器签名的 capturesCount", () => {
  assert.deepEqual(clearCameraCapturesPatch("c1"), { cameras: { c1: { captures: [] } } });
  const scene = { cameras: [{ id: "c1", name: "机位1", focalLength: 50 }], mannequins: [] };
  const ext = { cameras: { c1: { captures: ["data:a", "data:b"] } } };
  assert.equal(deriveCameraInspector(scene, ext, "c1").capturesCount, 2);
  assert.equal(deriveCameraInspector(scene, null, "c1").capturesCount, 0);
});
