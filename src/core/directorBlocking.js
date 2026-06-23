// 需求③ 摆台核心(纯函数,可单测):把抽取出的结构化 blocking → 3D 导演台坐标。
// 设计铁律(doc24):LLM/视觉只产【枚举档位】或【精确坐标】,坐标交确定性编译;有精确用精确、否则枚举查表。
// 约定:世界 X=舞台左(-)/右(+);Z=景深(FG=+Z 近镜头 / MG=0 / BG=-Z 远);Y 向上(脚踩地 y=0)。
//      facing 0-7 八方位,0=朝 +Z(面向默认镜头),每档 45°(yaw=f·π/4)。
//      默认镜头在质心 +Z 侧(z+6)看向站位质心。立方体几何中心在 position → y=scale/2 使其踩地。
import { clampSceneFocalLength } from "./panoramaSceneMath.js";

export const STAGE_X = Object.freeze({ L: -3, CL: -1.5, C: 0, CR: 1.5, R: 3 });
export const DEPTH_Z = Object.freeze({ FG: 3, MG: 0, BG: -3 });
export const SHOTSIZE_FOCAL = Object.freeze({ WS: 20, MS: 40, CU: 85 }); // 景别→焦距(mm,再经场景钳制)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function quatY(theta) {
  return { w: Math.cos(theta / 2), x: 0, y: Math.sin(theta / 2), z: 0 };
}
function stageToX(stage) {
  const k = String(stage || "").toUpperCase();
  return Object.prototype.hasOwnProperty.call(STAGE_X, k) ? STAGE_X[k] : 0;
}
function depthToZ(depth) {
  const k = String(depth || "").toUpperCase();
  return Object.prototype.hasOwnProperty.call(DEPTH_Z, k) ? DEPTH_Z[k] : 0;
}
export function facingToYaw(facing) {
  const n = num(facing);
  if (n == null) return 0;
  return (((Math.round(n) % 8) + 8) % 8) * (Math.PI / 4);
}
function normGender(g) {
  return String(g || "").toLowerCase() === "female" ? "female" : "male"; // 仅 male/female 真实素体,命不中默认 male
}
function trimName(v) {
  return typeof v === "string" ? v.trim() : "";
}

// blocking → { mannequins, cubes, cameras, centroid, sceneName }。机位输出 position+lookAtPoint+focalLength,
// 由执行器(autoload)经 cameraOrbitFromLookAt / directorExt.cameras 落台。纯逻辑,不依赖 THREE。
export function compileBlockingToScene(blocking) {
  const b = blocking || {};

  const mannequins = (Array.isArray(b.mannequins) ? b.mannequins : []).map((m) => {
    const x = num(m.x);
    const z = num(m.z);
    const yaw = num(m.yaw);
    const scale = num(m.scale) && num(m.scale) > 0 ? num(m.scale) : 1;
    const ry = yaw != null ? yaw : facingToYaw(m.facing); // 精确 yaw 优先,否则枚举 facing
    return {
      name: trimName(m.name),
      gender: normGender(m.gender),
      position: { x: x != null ? x : stageToX(m.stage), y: 0, z: z != null ? z : depthToZ(m.depth) },
      rotation: { x: 0, y: ry, z: 0 },
      quaternion: quatY(ry),
      scale,
      poseHint: String(m.pose || "").toLowerCase() === "sit" ? "sit" : "stand", // sit 暂以站立近似(校准债),仅作标注
    };
  });

  const cubes = (Array.isArray(b.cubes) ? b.cubes : []).map((c) => {
    const x = num(c.x);
    const z = num(c.z);
    const scale = num(c.scale) && num(c.scale) > 0 ? num(c.scale) : 1;
    return {
      name: trimName(c.name),
      position: { x: x != null ? x : stageToX(c.stage), y: scale / 2, z: z != null ? z : depthToZ(c.depth) },
      scale,
    };
  });

  // 站位质心(给机位注视用)
  const pts = mannequins.map((m) => m.position);
  const centroid = pts.length
    ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: 1.2, z: pts.reduce((s, p) => s + p.z, 0) / pts.length }
    : { x: 0, y: 1.2, z: 0 };

  const cameras = (Array.isArray(b.cameras) ? b.cameras : []).map((cam, i) => {
    const focalRaw = num(cam.focalLength);
    const focal = clampSceneFocalLength(
      focalRaw != null ? focalRaw : (SHOTSIZE_FOCAL[String(cam.shotSize || "").toUpperCase()] || SHOTSIZE_FOCAL.MS),
    );
    const x = num(cam.x);
    const y = num(cam.y);
    const z = num(cam.z);
    return {
      focalLength: focal,
      // 精确位置优先;否则默认放在质心 +Z 侧(看向站位),多机位横向错开避免重叠
      position: {
        x: x != null ? x : centroid.x + i * 1.5,
        y: y != null ? y : 1.6,
        z: z != null ? z : centroid.z + 6,
      },
      lookAtPoint: { x: centroid.x, y: centroid.y, z: centroid.z },
      shotSize: String(cam.shotSize || "").toUpperCase() || null,
    };
  });

  return { mannequins, cubes, cameras, centroid, sceneName: trimName(b.scene) };
}
