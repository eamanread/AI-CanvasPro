import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
  parseBlockingJson,
  firstSceneOnly,
  buildRestagePlan,
  BLOCKING_SCHEMA_HINT,
} from "./src/core/directorAutoStage.js";
import { compileBlockingToScene } from "./src/core/directorBlocking.js";

test("AS-1: system prompt 含核心规则 + schema;有图时加图优先条", () => {
  const noImg = buildExtractionSystemPrompt({ hasImage: false });
  assert.ok(noImg.includes("只摆") && noImg.includes("male/female") && noImg.includes(BLOCKING_SCHEMA_HINT));
  assert.ok(!noImg.includes("以图为准"));
  const withImg = buildExtractionSystemPrompt({ hasImage: true });
  assert.ok(withImg.includes("以图为准"), "有图 → 图优先条");
});

test("AS-2: user prompt 拼接剧情;纯图无文本时给兜底指令", () => {
  assert.ok(buildExtractionUserPrompt("李玄对峙四敌", {}).includes("李玄对峙四敌"));
  assert.ok(buildExtractionUserPrompt("", { hasImage: true }).includes("参考图"));
  assert.ok(buildExtractionUserPrompt("剧情X", { hasImage: true }).includes("参考图"));
});

test("AS-3: parseBlockingJson 直接 JSON", () => {
  const b = parseBlockingJson('{"mannequins":[{"gender":"male","stage":"C"}],"cubes":[],"cameras":[]}');
  assert.equal(b.mannequins.length, 1);
  assert.equal(b.mannequins[0].stage, "C");
});

test("AS-4: parseBlockingJson 容错——```json 代码块 / 首尾大括号截取 / 前后噪声", () => {
  const fenced = parseBlockingJson("这是站位:\n```json\n{\"mannequins\":[{\"gender\":\"female\"}]}\n```\n完");
  assert.equal(fenced.mannequins[0].gender, "female");
  const noisy = parseBlockingJson("好的,结果如下 {\"mannequins\":[{\"stage\":\"L\"}]} 希望满意");
  assert.equal(noisy.mannequins[0].stage, "L");
});

test("AS-5: parseBlockingJson 解析失败回 null;支持 {text} 包装", () => {
  assert.equal(parseBlockingJson("这根本不是JSON"), null);
  assert.equal(parseBlockingJson(""), null);
  assert.equal(parseBlockingJson(null), null);
  const wrapped = parseBlockingJson({ text: '{"mannequins":[{"gender":"male"}]}' });
  assert.equal(wrapped.mannequins[0].gender, "male");
});

test("AS-6: firstSceneOnly 多场只取第一场(scenes[]/shots[]/blocking 字段)", () => {
  // scenes[] 第一场带 blocking
  const a = firstSceneOnly({ scenes: [{ blocking: { mannequins: [{ stage: "L" }] } }, { blocking: { mannequins: [{ stage: "R" }] } }] });
  assert.equal(a.mannequins.length, 1);
  assert.equal(a.mannequins[0].stage, "L", "取第一场");
  // shots[] 第一场对象本身即 blocking
  const b = firstSceneOnly({ shots: [{ mannequins: [{ stage: "C" }] }, { mannequins: [{ stage: "R" }] }] });
  assert.equal(b.mannequins[0].stage, "C");
  // 直接 blocking(无多场容器)
  const c = firstSceneOnly({ mannequins: [{ stage: "CL" }] });
  assert.equal(c.mannequins[0].stage, "CL");
});

test("AS-7: firstSceneOnly 统一保证三数组存在 + 字段别名(characters/props)", () => {
  const out = firstSceneOnly({ scene: "交锋", characters: [{ gender: "male" }], props: [{ name: "墙" }] });
  assert.equal(out.scene, "交锋");
  assert.deepEqual(out.mannequins, [{ gender: "male" }], "characters→mannequins 别名");
  assert.deepEqual(out.cubes, [{ name: "墙" }], "props→cubes 别名");
  assert.deepEqual(out.cameras, [], "缺 cameras 兜空数组");
  const empty = firstSceneOnly({});
  assert.deepEqual([empty.mannequins, empty.cubes, empty.cameras], [[], [], []]);
});

test("AS-8: buildRestagePlan 全新数组 + directorExt 名字/机位/清空可见性锁定", () => {
  const compiled = {
    mannequins: [
      { name: "李玄", gender: "male", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 1, z: 0 }, quaternion: { w: 1, x: 0, y: 0, z: 0 }, scale: 1 },
      { name: "敌1", gender: "female", position: { x: 3, y: 0, z: 0 }, rotation: { x: 0, y: -1, z: 0 }, quaternion: { w: 1, x: 0, y: 0, z: 0 }, scale: 1 },
    ],
    cubes: [{ name: "残墙", position: { x: 5, y: 1.5, z: 0 }, scale: 3 }],
    cameras: [{ focalLength: 40, position: { x: 0, y: 1.6, z: 6 }, lookAtPoint: { x: 1.5, y: 1.2, z: 0 } }],
    sceneName: "交锋",
  };
  const plan = buildRestagePlan(compiled, { idFor: (k, i) => `${k}-T-${i}` });
  // 全新数组
  assert.equal(plan.mannequins.length, 2);
  assert.equal(plan.mannequins[0].id, "mannequin-T-0");
  assert.equal(plan.mannequins[0].gender, "male");
  assert.notEqual(plan.mannequins[0].colorKey, plan.mannequins[1].colorKey, "调色板循环→相邻人偶不同色");
  assert.deepEqual(plan.mannequins[1].position, { x: 3, y: 0, z: 0 });
  assert.equal(plan.cubes[0].id, "cube-T-0");
  assert.equal(plan.cubes[0].scale, 3);
  assert.equal(plan.cameras[0].id, "camera-T-0");
  assert.equal(plan.cameras[0].focalLength, 40);
  // directorExt:名字映射 + 机位注视 + 清空可见性/锁定 + 真值 source
  assert.equal(plan.directorExt.mannequins["mannequin-T-0"].name, "李玄");
  assert.equal(plan.directorExt.cubes["cube-T-0"].name, "残墙");
  assert.equal(plan.directorExt.cameras["camera-T-0"].lookAtTarget, "manual");
  assert.deepEqual(plan.directorExt.cameras["camera-T-0"].lookAtPoint, { x: 1.5, y: 1.2, z: 0 });
  assert.deepEqual(plan.directorExt.visibility, { mannequinIds: [], cubeIds: [], cameraIds: [] }, "清空重摆:可见性清空");
  assert.deepEqual(plan.directorExt.locked, { mannequinIds: [], cubeIds: [], cameraIds: [] });
  assert.equal(plan.directorExt.blocking.source, "auto");
  assert.equal(plan.directorExt.blocking.sceneName, "交锋");
});

test("AS-9: 端到端 blocking → compile → restage plan(贯通)", () => {
  const blocking = {
    scene: "对峙",
    mannequins: [
      { name: "李玄", gender: "male", stage: "C", depth: "FG", facing: 0 },
      { name: "敌中", gender: "male", x: 12, z: 0, yaw: -1.57 },
    ],
    cubes: [{ name: "残墙", x: 18, scale: 3 }],
    cameras: [{ shotSize: "WS" }],
  };
  const plan = buildRestagePlan(compileBlockingToScene(blocking), { idFor: (k, i) => `${k}${i}` });
  assert.equal(plan.mannequins.length, 2);
  assert.equal(plan.mannequins[1].position.x, 12, "精确坐标贯通到 plan");
  assert.equal(plan.directorExt.mannequins["mannequin0"].name, "李玄");
  assert.equal(plan.cubes[0].position.x, 18);
  assert.equal(plan.cameras.length, 1);
  assert.ok(plan.cameras[0].focalLength > 0);
});

test("AS-10: buildRestagePlan 空/缺字段健壮", () => {
  assert.doesNotThrow(() => buildRestagePlan(null));
  const empty = buildRestagePlan({});
  assert.deepEqual([empty.mannequins, empty.cubes, empty.cameras], [[], [], []]);
  assert.deepEqual(empty.directorExt.visibility, { mannequinIds: [], cubeIds: [], cameraIds: [] });
});
