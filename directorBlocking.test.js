import test from "node:test";
import assert from "node:assert/strict";
import {
  compileBlockingToScene,
  facingToYaw,
  STAGE_X,
  DEPTH_Z,
  SHOTSIZE_FOCAL,
} from "./src/core/directorBlocking.js";

test("DB-1: 枚举档位 → 网格坐标(stage→x, depth→z)", () => {
  const out = compileBlockingToScene({
    mannequins: [
      { gender: "male", stage: "L", depth: "FG" },
      { gender: "female", stage: "C", depth: "MG" },
      { gender: "male", stage: "R", depth: "BG" },
    ],
  });
  assert.equal(out.mannequins[0].position.x, STAGE_X.L);
  assert.equal(out.mannequins[0].position.z, DEPTH_Z.FG);
  assert.equal(out.mannequins[1].position.x, 0);
  assert.equal(out.mannequins[2].position.x, STAGE_X.R);
  assert.equal(out.mannequins[2].position.z, DEPTH_Z.BG);
  assert.equal(out.mannequins[0].position.y, 0, "脚踩地 y=0");
});

test("DB-2: 精确坐标覆盖枚举(有 x/z/yaw 用精确)——混合精度", () => {
  const out = compileBlockingToScene({
    mannequins: [{ gender: "male", stage: "L", depth: "BG", x: 12, z: 2.2, yaw: 1.5 }],
  });
  const m = out.mannequins[0];
  assert.equal(m.position.x, 12, "精确 x 覆盖 stage");
  assert.equal(m.position.z, 2.2, "精确 z 覆盖 depth");
  assert.equal(m.rotation.y, 1.5, "精确 yaw 覆盖 facing");
});

test("DB-3: facing 八方位→yaw + 一致 quaternion", () => {
  assert.equal(facingToYaw(0), 0);
  assert.ok(Math.abs(facingToYaw(2) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(facingToYaw(4) - Math.PI) < 1e-9);
  assert.equal(facingToYaw(8), 0, "环绕");
  assert.equal(facingToYaw(undefined), 0, "缺省朝镜头");
  const out = compileBlockingToScene({ mannequins: [{ gender: "male", facing: 2 }] });
  const q = out.mannequins[0].quaternion;
  assert.ok(Math.abs(q.y - Math.sin(Math.PI / 4)) < 1e-9 && Math.abs(q.w - Math.cos(Math.PI / 4)) < 1e-9, "quaternion 与 yaw 一致");
});

test("DB-4: gender 归一(仅 male/female,命不中默认 male)", () => {
  const out = compileBlockingToScene({
    mannequins: [{ gender: "女" }, { gender: "female" }, { gender: "robot" }, {}],
  });
  assert.deepEqual(out.mannequins.map((m) => m.gender), ["male", "female", "male", "male"]);
});

test("DB-5: 立方体 → 几何中心 y=scale/2(踩地)+ 名字 trim + 档位/精确", () => {
  const out = compileBlockingToScene({
    cubes: [
      { name: " 残墙 ", stage: "R", depth: "BG", scale: 3 },
      { name: "桌子", x: 1.5, z: 0 },
    ],
  });
  assert.equal(out.cubes[0].name, "残墙");
  assert.equal(out.cubes[0].position.x, STAGE_X.R);
  assert.equal(out.cubes[0].position.z, DEPTH_Z.BG);
  assert.equal(out.cubes[0].position.y, 1.5, "scale 3 → 中心 y=1.5 → 底面踩地");
  assert.equal(out.cubes[0].scale, 3);
  assert.equal(out.cubes[1].position.x, 1.5);
  assert.equal(out.cubes[1].scale, 1, "默认 scale=1");
  assert.equal(out.cubes[1].position.y, 0.5);
});

test("DB-6: 机位 景别→焦距(单调,经场景钳制)+ 注视站位质心 + 默认放质心 +Z 侧", () => {
  const out = compileBlockingToScene({
    mannequins: [{ gender: "male", stage: "L" }, { gender: "male", stage: "R" }],
    cameras: [{ shotSize: "WS" }, { shotSize: "CU" }, { focalLength: 50 }],
  });
  // 质心 = (L+R)/2 = 0
  assert.equal(out.centroid.x, 0);
  assert.ok(out.cameras[0].focalLength < out.cameras[1].focalLength, "WS(广) 焦距 < CU(长焦)");
  assert.equal(out.cameras[2].focalLength, 50, "精确 focalLength 覆盖 shotSize");
  // 默认机位在质心 +Z 侧、看向质心
  assert.equal(out.cameras[0].position.z, out.centroid.z + 6);
  assert.deepEqual(out.cameras[0].lookAtPoint, out.centroid);
  assert.equal(out.cameras[1].position.x, out.centroid.x + 1.5, "多机位横向错开");
  assert.ok(SHOTSIZE_FOCAL.WS < SHOTSIZE_FOCAL.CU);
});

test("DB-7: 空/缺字段健壮(不崩,合理默认)", () => {
  assert.doesNotThrow(() => compileBlockingToScene(null));
  assert.doesNotThrow(() => compileBlockingToScene({}));
  const out = compileBlockingToScene({ mannequins: [{}] });
  assert.equal(out.mannequins[0].position.x, 0, "无 stage/x → C(0)");
  assert.equal(out.mannequins[0].scale, 1);
  assert.equal(out.mannequins[0].poseHint, "stand");
  assert.deepEqual(out.centroid, { x: 0, y: 1.2, z: 0 });
});

test("DB-8: poseHint sit 仅标注(暂以站立近似)", () => {
  const out = compileBlockingToScene({ mannequins: [{ pose: "sit" }, { pose: "stand" }, {}] });
  assert.deepEqual(out.mannequins.map((m) => m.poseHint), ["sit", "stand", "stand"]);
});
