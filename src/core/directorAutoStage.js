// 需求③ 抽取协议层(纯函数,可单测):剧情/参考图 → 喂模型的提示词 + 模型回文 → 结构化 blocking。
// 摆台坐标交 directorBlocking.compileBlockingToScene;本模块只管"出题(prompt)"与"读卷(parse)"。
// 设计(doc24):LLM 只产【枚举档位或精确坐标】混合;多场只取第一场;有参考图则图优先、文字补细节。

// 给模型看的 blocking schema(枚举↔精确混合;与 compileBlockingToScene 入参一致)
export const BLOCKING_SCHEMA_HINT = [
  '{',
  '  "scene": "场景名(可选)",',
  '  "mannequins": [  // 角色站位',
  '    { "name":"角色名", "gender":"male|female",',
  '      // 站位二选一:粗档位 或 精确坐标',
  '      "stage":"L|CL|C|CR|R(左到右)", "depth":"FG|MG|BG(前/中/后景)",',
  '      "x":0, "z":0,           // 精确坐标(米),给了就优先于 stage/depth',
  '      "facing":0,             // 朝向 0-7(0=面向镜头,每档45°),或',
  '      "yaw":0,                // 精确朝向(弧度),给了就优先',
  '      "pose":"stand|sit" }',
  '  ],',
  '  "cubes": [ { "name":"残墙/桌子/掩体", "stage":"R","depth":"BG", "x":0,"z":0, "scale":1 } ],',
  '  "cameras": [ { "shotSize":"WS|MS|CU(景别)", "x":0,"y":1.6,"z":0, "focalLength":0 } ]',
  '}',
].join('\n');

export function buildExtractionSystemPrompt({ hasImage = false } = {}) {
  return [
    '你是影视分镜的"空间场记"。把输入还原成 3D 导演台的【场景站位】,只输出一个 JSON,不要任何解释/markdown 包裹。',
    '规则:',
    '1. 只摆【一个场景】:输入若含多场,只取第一场。',
    '2. 角色用真实素体——只有 male/female 两种,据描述判性别,判不出按 male。',
    '3. 站位优先用粗档位(stage 左中右 / depth 前中后景 / facing 八方位);',
    '   若输入给了明确距离/队形/坐标(如"相距12m""楔形""领先半个身位"),则尽量换算成精确 x/z/yaw 坐标(米/弧度),精确优先。',
    '4. 道具(墙/桌/掩体等)放进 cubes;机位放进 cameras(按景别 WS/MS/CU)。',
    '5. 坐标系:X=左(-)/右(+),Z=景深(FG=+Z近镜头/BG=-Z远),facing 0=面向镜头。',
    hasImage ? '6. 有参考图:以图为准还原画面里人物的相对位置/朝向,文字仅作补充。' : '',
    '输出 JSON 形如:',
    BLOCKING_SCHEMA_HINT,
  ].filter(Boolean).join('\n');
}

export function buildExtractionUserPrompt(scriptText, { hasImage = false } = {}) {
  const t = String(scriptText || '').trim();
  if (hasImage && !t) return '根据参考图还原这个场景的角色站位(输出 blocking JSON)。';
  return (hasImage ? '参考图 + 剧情如下,还原第一场的站位(输出 blocking JSON):\n\n' : '剧情如下,还原第一场的站位(输出 blocking JSON):\n\n') + t;
}

// 鲁棒解析模型回文 → blocking 对象。容错:直接 parse → ```json 代码块 → 首{到末}截取。失败回 null。
export function parseBlockingJson(text) {
  const raw = typeof text === 'string' ? text : (text && typeof text.text === 'string' ? text.text : '');
  if (!raw) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let obj = tryParse(raw.trim());
  if (!obj) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) obj = tryParse(fence[1].trim());
  }
  if (!obj) {
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    if (i >= 0 && j > i) obj = tryParse(raw.slice(i, j + 1));
  }
  if (!obj || typeof obj !== 'object') return null;
  return firstSceneOnly(obj);
}

// 清空重摆计划(纯函数,可单测):compileBlockingToScene 结果 → 全新 sceneNode 数组 + directorExt 补丁。
// "清空重摆"=整组替换(非合并):mannequins/cubes/cameras 全换新;directorExt 的可见性/锁定清空、名字/机位/真值重写。
// id 注入(idFor)以便单测确定性;autoload 传带时间戳的真 id。沿用真机跑通的 scene2 写法(直接构数组 + updateNodeData)。
const RESTAGE_PALETTE = ["blue", "red", "green", "cyan", "purple", "yellow", "white"];
const IDENT_QUAT = { w: 1, x: 0, y: 0, z: 0 };
const ZERO_ROT = { x: 0, y: 0, z: 0 };

export function buildRestagePlan(compiled, { idFor = (kind, i) => `${kind}-${i}` } = {}) {
  const c = compiled || {};
  const cm = Array.isArray(c.mannequins) ? c.mannequins : [];
  const cc = Array.isArray(c.cubes) ? c.cubes : [];
  const ca = Array.isArray(c.cameras) ? c.cameras : [];
  const mIds = cm.map((_, i) => idFor("mannequin", i));
  const kIds = cc.map((_, i) => idFor("cube", i));
  const camIds = ca.map((_, i) => idFor("camera", i));

  const mannequins = cm.map((m, i) => ({
    id: mIds[i], gender: m.gender || "male", colorKey: RESTAGE_PALETTE[i % RESTAGE_PALETTE.length],
    position: m.position, rotation: m.rotation, quaternion: m.quaternion, scale: m.scale,
  }));
  const cubes = cc.map((cu, i) => ({
    id: kIds[i], colorKey: "blue",
    position: cu.position, rotation: { ...ZERO_ROT }, quaternion: { ...IDENT_QUAT }, scale: cu.scale,
  }));
  const cameras = ca.map((cam, i) => ({
    id: camIds[i], name: `机位${i + 1}`, slot: i + 1, focalLength: cam.focalLength,
    position: cam.position, rotation: { ...ZERO_ROT }, quaternion: { ...IDENT_QUAT },
  }));

  const directorExt = {
    mannequins: Object.fromEntries(cm.map((m, i) => [mIds[i], { name: m.name || "" }])),
    cubes: Object.fromEntries(cc.map((cu, i) => [kIds[i], { name: cu.name || "" }])),
    cameras: Object.fromEntries(ca.map((cam, i) => [camIds[i], {
      position: cam.position, lookAtTarget: "manual", lookAtPoint: cam.lookAtPoint, focalLength: cam.focalLength,
    }])),
    // 清空重摆:旧的可见性/锁定一并清空(不残留指向已删对象的 id)
    visibility: { mannequinIds: [], cubeIds: [], cameraIds: [] },
    locked: { mannequinIds: [], cubeIds: [], cameraIds: [] },
    blocking: { source: "auto", sceneName: c.sceneName || "" },
  };
  return { mannequins, cubes, cameras, directorExt };
}

// 多场容错:若模型把多场塞进 scenes[]/shots[],只取第一场;否则原样。统一保证三个数组存在。
export function firstSceneOnly(blocking) {
  let b = blocking;
  const container = Array.isArray(b?.scenes) ? b.scenes : (Array.isArray(b?.shots) ? b.shots : null);
  if (container && container.length) {
    const first = container[0];
    // 第一场若自带 blocking 字段优先用,否则把第一场对象当 blocking
    b = (first && typeof first === 'object') ? (first.blocking && typeof first.blocking === 'object' ? first.blocking : first) : b;
  }
  return {
    scene: typeof b?.scene === 'string' ? b.scene : (typeof b?.name === 'string' ? b.name : ''),
    mannequins: Array.isArray(b?.mannequins) ? b.mannequins : (Array.isArray(b?.characters) ? b.characters : []),
    cubes: Array.isArray(b?.cubes) ? b.cubes : (Array.isArray(b?.props) ? b.props : []),
    cameras: Array.isArray(b?.cameras) ? b.cameras : [],
  };
}
