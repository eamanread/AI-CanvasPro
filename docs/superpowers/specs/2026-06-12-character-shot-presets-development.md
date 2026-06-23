# 3D导演台·角色机位速切（Character Shot Presets）开发文档(Development Doc)

- 版本: v1.1（v1.0 经对抗审查修正两处构图参数错误并补充三项运行时实证，见 §8 审查记录）
- 日期: 2026-06-12
- 上游: 本日产品方案（选中角色 → 八机位速切：正面特写/右侧近景/过肩/右侧中景/右前方全景/正面中景/后上方大远景/俯视角）
- 性质: **实施级文档**——文件级改动清单、函数签名、测试文件、验收门，可直接派工

---

## 0. 已验证基线（每条均经真实代码/运行时验证，2026-06-12）

| # | 事实 | 证据 |
|---|---|---|
| B1 | 场景相机状态 `sceneNode.viewport.sceneView = { target:{x,y,z}, orbitYaw, orbitPitch, orbitDistance, focalLength? }`，默认 `target.y=1.2, yaw=pitch=π/4, distance=9`；`focalLength` 可选且 `normalizePanoramaSceneState` 原样保留 | node 运行 `createDefaultSceneView()` / `normalizePanoramaSceneState()` 实测 |
| B2 | 相机约束（运行时取值）：`orbitPitch ∈ [-1.35, +1.35] rad（±77.3°）`，`orbitDistance ∈ [0.05, 120]`，`focalLength ∈ [16, 135] mm（默认 50）`，传感器全画幅 36mm | `src/core/panoramaSceneMath.js` `PANORAMA_SCENE_CAMERA_CONSTRAINTS` 实测 |
| B3 | 坐标约定（实验钉死）：`resolveSceneCameraPose({yaw:0,pitch:0,dist:3,target:(0,1.2,0)})` → 相机 `(0,1.2,3)`（+Z 方向）；`yaw=+90°` → 相机 `(+3,1.2,0)`（+X）；`forwardVectorFromYawPitch(0,0)=(0,0,1)`。即相机偏移 = `(sin(yaw), ·, cos(yaw))·distance`，朝向角 0 指向 +Z | node 实测 |
| B4 | 焦距→FOV 为全画幅垂直 FOV：`focalLengthToFov(85)=16.1°`、`(50)=27.0°`、`(24)=53.1°` | node 实测 |
| B5 | `resolveSceneCameraPose(sceneView, fov=58)` 第二参为 fov；3D 桥内部对带 `focalLength` 的对象做 `focalLengthToFov(focalLength ?? SCENE_DEFAULT_FOCAL_LENGTH_MM)` 解析（出现 15 处），**自由视图会消费 sceneView.focalLength** | `modules/panoramaSceneNode/scene3dBridge.js` grep 上下文 |
| B6 | 角色（人台）归一化：统一身高 **1.92m × scale**、脚底位于本地 y=0、x/z 居中；`mannequin = {id, gender, colorKey, position{x,y,z}, rotation{x,y,z}, scale}`，`rotation.y` 为朝向(弧度) | `characterModelRegistry.js` `TARGET_CHARACTER_HEIGHT=1.92` + `normalizeCharacterModel`（position.y -= box.min.y）；`panoramaCharacterAssets.test.js` |
| B7 | 选中状态 `sceneNode.selection = { selectedObjectType, selectedObjectId, selectedObjectIds[], selectedObjects[], selectedGroupId }`，人台选中时 `selectedObjectType==='mannequin'` | `panoramaCharacterAssets.test.js` 断言 |
| B8 | 既有 action 签名（全部对象参数 + `storeInstance` 注入，可测）：`applyPanoramaSceneViewCommit({nodeId, sceneView, panoramaView, activeView='default', activeCameraId=null, storeInstance})`、`setPanoramaSceneMode({nodeId, mode, storeInstance})`、`upsertPanoramaSceneCameraAtSlot({nodeId, slot, viewPose, storeInstance})`、`focusPanoramaSceneSelection({nodeId, storeInstance})` | `sceneNodeActions.js` 签名提取 |
| B9 | 工具栏按钮模式：`createToolbarIconButton({action, tooltip, label, iconSvg, extraClass})`（`components/nodeToolbar/buttonFactory.js`），UI 模块定义 HTML + PanoramaSceneNode 按 `action` 字符串分发；人台快捷菜单先例 `createMannequinQuickMenu`（被 `panoramaCharacterAssets.test.js` 以源码正则断言钉住） | `PanoramaSceneToolbar.js` 源码 |
| B10 | 双模式 `mode: 'scene' | 'panorama'`，默认 `'scene'`；`viewport.activeView` 默认 `'default'`、`activeCameraId` 默认 `null` | `createDefaultPanoramaSceneState()` 实测 |
| B11 | 三项关键行为运行时实证：① 正俯仰=高机位（`resolveSceneCameraPose(pitch=+0.5)` → 相机 y=2.638 > target.y=1.2）；② `clampSceneOrbitPitch(2)→1.35`、`clampSceneFocalLength(200/8)→135/16`；③ `applyPanoramaSceneViewCommit` 只传 `sceneView` 时 `panoramaView` 完整保留、`focalLength` 落库、`activeView='default'`/`activeCameraId=null` | fake store + node 实测（2026-06-12） |

---

## 1. 总架构与不变量

```
UI(S3)  CharacterShotStrip(8按钮, 新文件)
            │ click: data-action="character-shot:<presetKey>"
            ▼
Action(S2)  applyPanoramaSceneCharacterShot(新文件 characterShotActions.js)
            │ ① 校验单选人台 ② panorama→scene 自动切 ③ 算位姿 ④ 提交
            ▼
纯函数(S1)  computeCharacterShotSceneView(新文件 characterShotPresets.js)
            │ 角色位姿 + 预设语法 → sceneView 五参数(全部过既有 clamp)
            ▼
既有设施    applyPanoramaSceneViewCommit → store → scene3dBridge 跟随渲染
```

**不变量（实施红线）**
1. 不新增任何持久化字段——预设只写既有 `viewport.sceneView`（含可选 `focalLength`，B1/B5 已验证链路通）。
2. 所有输出经既有 clamp：`clampSceneOrbitPitch` / `clampSceneFocalLength` / distance 夹紧到 `[SCENE_ORBIT_DISTANCE_MIN, SCENE_ORBIT_DISTANCE_MAX]`，不得绕过（俯视角因此为 ≈77° 而非 90°，按产品方案接受）。
3. 混淆文件最小接缝：`PanoramaSceneNode.js` 仅允许 ≤2 处插入（import + 选中区渲染/绑定），其余逻辑全部在新建未混淆模块中；改动前留 `.bak` 快照。
4. 新增样式经 `theme-upgrade.css` 唯一入口（项目 UI 覆盖层铁律），不直接改 `styles/panorama-scene-*.css`。
5. 模式冲突自动收敛：`mode==='panorama'` 时先 `setPanoramaSceneMode('scene')` 再运镜。
6. 不触碰 `scene3dBridge.js` 与三维渲染层。

---

## 2. S1 — 预设数学模块 `characterShotPresets.js`

**新文件**: `modules/panoramaSceneNode/characterShotPresets.js`（+ 根目录 `panoramaCharacterShotPresets.test.js`，跟随现有根目录测试命名习惯）

```js
import {
  clampSceneOrbitPitch, clampSceneFocalLength, normalizeAngle,
  SCENE_ORBIT_DISTANCE_MIN, SCENE_ORBIT_DISTANCE_MAX,
  resolveSceneCameraPose, forwardVectorFromYawPitch,
} from "../../src/core/panoramaSceneMath.js";

export const CHARACTER_SHOT_PRESET_KEYS = Object.freeze([
  "front-closeup", "right-close", "over-shoulder", "right-medium",
  "right-front-full", "front-medium", "rear-high-extreme-long", "top-down",
]);
export const CHARACTER_SHOT_PRESETS = Object.freeze({ /* 见参数表 */ });

// 符号常量
export const SHOT_PITCH_SIGN = 1;        // +pitch = 高机位（B11 已实证，T2 仅作回归锁）
export const SHOT_FACING_YAW_OFFSET = 0; // 人台网格视觉朝向若非 forward(rotY) 方向，此处补偿 π（S3-V3 目检钉死）

export function computeCharacterShotSceneView({ mannequin, presetKey, currentSceneView = null })
// -> { ok:true, sceneView:{target,orbitYaw,orbitPitch,orbitDistance,focalLength} }
//  | { ok:false, reason:"unknown-preset"|"invalid-mannequin" }
```

### 2.1 八预设参数表（v1 起点值；S3 浏览器目检允许 ±20% 微调，调表不调算法）

朝向方位差 Δ：`cameraYaw = mannequin.rotation.y + SHOT_FACING_YAW_OFFSET + Δ`；
按 B3 约定，Δ=0 → 相机在角色面前方向；角色右侧 = `up × forward` = Δ=+90°（T3 钉死）。
`s = mannequin.scale || 1`；高度相对脚底（`position.y`，B6）。

| key | 名称 | Δ 方位 | 目标点 | 目标高(×s) | 俯仰(高机位+) | 距离(×s, m) | 焦距(mm) |
|---|---|---:|---|---:|---:|---:|---:|
| `front-closeup` | 😀 正面特写 | 0° | 头部 | 1.72 | 0° | 0.9 | 85 |
| `right-close` | 👤 右侧近景 | +90° | 胸口 | 1.45 | 0° | 1.6 | 50 |
| `over-shoulder` | 🫱 过肩(右肩后) | +168° | 视线点=脚底+forward·1.2s | 1.50 | +5° | 1.75 | 50 |
| `right-medium` | 🧍 右侧中景 | +90° | 腰胸间 | 1.15 | 0° | 2.8 | 50 |
| `right-front-full` | 🚶 右前方全景 | +45° | 身体中心 | 0.95 | +3° | 5.0 | 35 |
| `front-medium` | 🙂 正面中景 | 0° | 胸口 | 1.30 | 0° | 2.8 | 50 |
| `rear-high-extreme-long` | ⛰️ 后上方大远景 | 180° | 身体中心 | 0.95 | +30° | 16.0 | 24 |
| `top-down` | 🛰️ 俯视角 | `null`(保持当前 yaw) | 身体中心 | 0.95 | +77°(被 clamp 到 1.35rad) | 7.0 | 24 |

过肩几何说明：目标点取角色视线方向前方 1.2s 处（单人过肩成立）；相机从该点按 Δ=+168° 环绕 1.75s，落在右肩后外侧、肩颈入前景。双人自动对焦为 S4。

### 2.2 算法（实现要点）

1. 入参校验：`mannequin.position` 三轴有限数、`presetKey ∈ PRESETS`，否则 fail-closed 返回 `{ok:false}`。
2. `s` 取 `scale`（非有限或 ≤0 时取 1）；`rotY = rotation?.y ?? 0`。
3. `target = position + (0, targetHeight·s, 0)`；过肩再加 `forwardVectorFromYawPitch(rotY+SHOT_FACING_YAW_OFFSET, 0) · 1.2s` 的 x/z 分量。
4. `orbitYaw = Δ===null ? (currentSceneView?.orbitYaw ?? 0) : normalizeAngle(rotY + SHOT_FACING_YAW_OFFSET + Δ)`。
5. `orbitPitch = clampSceneOrbitPitch(SHOT_PITCH_SIGN · pitchRad)`。
6. `orbitDistance = min(max(distance·s, SCENE_ORBIT_DISTANCE_MIN), SCENE_ORBIT_DISTANCE_MAX)`。
7. `focalLength = clampSceneFocalLength(focal)`。
8. 地面防穿：`resolveSceneCameraPose(view).position.y < 0.1` 时将 pitch 逐步抬高（步进 5°，≤3 次）后仍不满足则钳 `target.y` 上浮——纯函数内完成，不留状态。

### 2.3 测试（`panoramaCharacterShotPresets.test.js`，node:test，零 DOM）

| 用例 | 断言 |
|---|---|
| T1 八预设全量输出 | 每个 key 输出五参数均有限数、pitch/distance/focal 落入 B2 区间 |
| T2 俯仰符号钉死 | `resolveSceneCameraPose({pitch:+0.5,...}).position.y > target.y`（失败即说明 `SHOT_PITCH_SIGN` 应取 -1，修常量不修表） |
| T3 方位语义钉死 | rotY=0 时：`front-closeup` 相机位 z > 角色 z（+Z 前方）；`right-close` 相机位 x > 角色 x（+X 右侧）；rotY=π/2 时同断言旋转跟随 |
| T4 缩放等比 | scale=1.5 时 target 高度与 distance 均为 1.0 时的 1.5 倍 |
| T5 俯视夹紧 | `top-down` 的 pitch === clampSceneOrbitPitch(1.35+ε) 上限值；yaw 保持传入 currentSceneView.orbitYaw |
| T6 过肩目标点 | 目标点位于角色 forward 方向 1.2s 处（x/z 分量校验） |
| T7 fail-closed | 未知 presetKey / position 含 NaN → `{ok:false}` 且不抛异常 |
| T8 地面防穿 | 构造低 target+大俯角用例，输出相机 y ≥ 0.1 |

**验收门**: T1–T8 全绿；模块零副作用（不 import store/DOM）。

---

## 3. S2 — Action 层 `characterShotActions.js`

**新文件**: `modules/panoramaSceneNode/characterShotActions.js`（+ 根目录 `panoramaCharacterShotActions.test.js`）。**不改动混淆的 `sceneNodeActions.js`**。

```js
import { normalizePanoramaSceneState } from "./sceneNode.js";
import { applyPanoramaSceneViewCommit, setPanoramaSceneMode } from "./sceneNodeActions.js";
import { computeCharacterShotSceneView, CHARACTER_SHOT_PRESETS } from "./characterShotPresets.js";

export function applyPanoramaSceneCharacterShot({ nodeId, presetKey, storeInstance })
// -> { ok:true, presetKey, sceneView }
//  | { ok:false, reason:"node-not-found"|"no-mannequin-selected"|"multi-selection"
//               |"mannequin-not-found"|"unknown-preset"|"invalid-mannequin" }
```

**流程**
1. 经 `storeInstance.getStateRaw?.() ?? getState()` 取节点（沿用 `panoramaCharacterAssets.test.js` 的 fake-store 协议，B8 同款注入方式），不存在 → `node-not-found`。
2. `state = normalizePanoramaSceneState(node.sceneNode)`；`selection.selectedObjectType !== 'mannequin'` 或无 `selectedObjectId` → `no-mannequin-selected`；`selectedObjects.length > 1` → `multi-selection`（V1 不支持群组取景）。
3. 按 `selectedObjectId` 在 `state.mannequins` 找人台，找不到 → `mannequin-not-found`。
4. `state.mode === 'panorama'` → 先 `setPanoramaSceneMode({nodeId, mode:'scene', storeInstance})`。（实施时实测：`panorama-scene` 节点走 scene-only normalizer，mode 结构性锁死为 `'scene'`，此分支为不可达防御代码，保留以兜底上游模式统一——见 §8 R7）
5. `computeCharacterShotSceneView({mannequin, presetKey, currentSceneView: state.viewport.sceneView})`，失败原样透传 reason。
6. `applyPanoramaSceneViewCommit({nodeId, sceneView, activeView:'default', activeCameraId:null, storeInstance})`——脱离机位书签回自由视图（B10 默认值同源），书签数据不受影响；不传 `panoramaView` 不会抹掉既有 360° 视角（B11-③ 已实证）。
7. 返回 `{ok:true, presetKey, sceneView}`。

**测试**（fake store，参照 `panoramaCharacterAssets.test.js` 模式）
- A1: 选中人台 → 调用后 `viewport.sceneView` 五参数与 S1 纯函数输出一致，`activeCameraId===null`。
- A2: 未选人台 / 选中 camera → `{ok:false,'no-mannequin-selected'}` 且 sceneView 未变。
- A3: panorama 模式 → 调用后 `mode==='scene'` 且 sceneView 已更新。
- A4: 多选 → `{ok:false,'multi-selection'}`。
- A5: 八预设逐个调用幂等（同输入两次输出 deepEqual）。

**验收门**: A1–A5 全绿；`node --test` 全仓既有测试无回归。

---

## 4. S3 — UI 速切条 + 接缝

**新文件**: `components/panoramaScene/CharacterShotStrip.js`

```js
import { createToolbarHtml, createToolbarIconButton } from "../nodeToolbar/buttonFactory.js";
import { applyPanoramaSceneCharacterShot } from "../../modules/panoramaSceneNode/characterShotActions.js";
import { CHARACTER_SHOT_PRESETS } from "../../modules/panoramaSceneNode/characterShotPresets.js";

export const CHARACTER_SHOT_STRIP_HTML = createToolbarHtml({
  toolbarClass: "v2-character-shot-strip",
  items: /* 8× createToolbarIconButton({ action:`character-shot:${key}`, tooltip:label, ... }) */
});
export function bindCharacterShotStrip({ stripEl, getNodeId, storeInstance, onApplied }) // 委托点击→action
export function syncCharacterShotStripVisibility({ stripEl, sceneState })               // 单选人台&&scene可用时显示
```

**`PanoramaSceneNode.js` 接缝（≤2 处，B9 先例 `createMannequinQuickMenu` 同模式）**
1. 顶部 import 区追加一行（strip 模块导入）。
2. 选中指示/人台快捷菜单渲染处：插入 strip 挂载 + `bindCharacterShotStrip` + 在选中状态同步路径调用 `syncCharacterShotStripVisibility`。
改动前先 `copy PanoramaSceneNode.js PanoramaSceneNode.js.bak-shot-strip`。

**显示规则**
- 显示：`selection.selectedObjectType==='mannequin'` 且单选。
- 隐藏：取消选中 / 选中其他对象类型 / 多选（多选时如保留按钮则置灰 + tooltip"请选择单个角色"，V1 取隐藏，实现最小）。
- panorama 模式下点击照常生效（action 内自动切 scene，弹既有 toast 机制提示"已切换到场景模式"，若 toast 不可达则静默，不阻断）。

**样式**: 仅在 `styles/theme-upgrade.css` 追加 `.v2-character-shot-strip` 区块（一行 8 钮、窄节点 4×2 折行、跟随既有 panorama 工具栏 token），**不动** `styles/panorama-scene-*.css`。

**浏览器验收（8779 预览，逐项目检）**
| 检查 | 通过标准 |
|---|---|
| V1 选中出现/取消消失 | 与显示规则一致，无残留 DOM |
| V2 八机位构图 | 特写：头部占画面高 ≥60%；近景胸上；中景腰上；全景全身入画且 ≤2/3 画高；大远景人物 ≤1/8 画高；过肩可见肩颈前景压角；俯视近乎正顶 |
| V3 朝向跟随 | 旋转人台 90° 后重按"正面特写"，仍正对面部（若反向，按 §2 改 `SHOT_FACING_YAW_OFFSET=π` 一处常量，重测 T3） |
| V4 焦距生效 | 特写(85mm)与全景(35mm)透视压缩感目视有别（fov 实际变化，B5 链路） |
| V5 微调不被锁 | 切机位后轨道/平移/推拉手势照常可用 |
| V6 运镜过渡 | 记录实际表现：阻尼平滑或硬切均可接受 V1；硬切则在 S4 备选项加 tween（不阻塞验收） |
| V7 既有功能无回归 | 机位书签创建/激活、人台增删改、截帧、安全框全部照常 |

**验收门**: V1–V7 通过 + 全仓 `node --test` 绿 + seam diff ≤2 处。

---

## 5. S4 — P2 增强（独立排期，不阻塞 V1）

| 项 | 设计 | 复用 |
|---|---|---|
| P2-1 存为机位书签 | strip 按钮长按/右键 → `upsertPanoramaSceneCameraAtSlot({nodeId, slot, viewPose})`，slot 取 `cameras.length` 后继，命名"`<预设名>·<角色色>`" | B8 既有 action |
| P2-2 双人过肩 | 视线方向 ±25° 锥角、6s 距离内存在其他人台 → 目标点改取其头部(1.72×s')；否则退回单人语义 | S1 纯函数内扩展，新增 `otherMannequins` 入参 |
| P2-3 八连拍参考帧 | "📸 八连拍"按钮：顺序遍历 8 预设 → 每步 `applyPanoramaSceneCharacterShot` + `capturePanoramaSceneViewport` → 产出 8 帧，供分镜行 `@图片N` 参考 | 既有 capture 链路 |
| P2-4 群组取景 | 多选/编组时取成员包围盒中心，distance 乘以包围半径系数 | `selection.selectedObjects` |

---

## 6. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| 人台网格视觉朝向与 `forwardVectorFromYawPitch(rotY)` 不一致（GLTF 轴向） | 中 | 唯一开关 `SHOT_FACING_YAW_OFFSET`，V3 目检即可定位；T3 锁定数学层语义不漂移 |
| `mannequin.position.y` 非脚底锚点（与 B6 归一化推断不符） | 低 | V2 目检特写高度即可暴露；修正只动参数表"目标高"一列 |
| `applyPanoramaSceneViewCommit` 为硬切而非阻尼 | 低 | V6 已降级为"记录实际表现"，硬切可接受，tween 进 S4 备选 |
| 混淆文件接缝引入回归 | 中 | ≤2 插入点 + `.bak` 快照 + V7 回归清单 + 全仓测试 |
| 预设参数审美不达标 | 低 | 表驱动设计，S3 只调表不动算法；±20% 微调权限已授予 |

**回滚**: 删除 3 个新文件 + 还原 `PanoramaSceneNode.js` 两处插入（或直接用 `.bak`）+ 撤销 `theme-upgrade.css` 区块。零持久化字段意味着已保存项目不受任何影响。

## 7. 遗留决定（已于 2026-06-12 实施中回填）

- D1 ✅: 运镜过渡为**硬切**（点击后 <350ms 呈现新机位，无可感知阻尼），V1 可接受；tween 列入 S4 备选。
- D2 ✅: 人台视觉朝向 = `forwardVectorFromYawPitch(π − rotY)` —— 浏览器三点实验（rotY∈{0, π/2, π}）钉死：偏移 π **且 yaw 符号镜像**。终值 `SHOT_FACING_YAW_OFFSET = Math.PI`、`SHOT_FACING_YAW_SIGN = -1`，统一封装为导出函数 `resolveCharacterFacingYaw(rotY)`（实现与测试共用，防语义漂移）。
- D3 ✅: 多选时 strip 隐藏（实现为 `selectedObjects.length > 1` 时不显示）。
- D4 ✅: 八预设参数表按 §2.1 v1.1 终值实施，8/8 浏览器目检通过，无需 ±20% 微调；唯一备注：节点视口为宽幅(≈2.2:1)时"右前方全景"人物占画高约 85%（全身完整入画，构图成立）。`top-down` 实现取 pitchDeg=89 由 clamp 收敛到 1.35rad（语义="系统允许的最接近正顶"）。

## 8. 审查记录（2026-06-12 v1.0 → v1.1）

审查方法：① 文档引用的全部 API/路径/常量逐条对照真实代码；② 三项未钉死行为做运行时实证（B11）；③ 参数表按"焦距-距离-可视高度"做构图数学复核（可视高度 = 2·d·tan(fov/2)，fov 取 `focalLengthToFov` 实测值）。

| # | 发现 | 级别 | 处置 |
|---|---|---|---|
| R1 | **中景焦距错误**：35mm@2.8m 可视高度 1.91m ≈ 全身入画，实为全景构图而非中景 | 🔴 错误 | `right-medium`/`front-medium` 焦距 35→**50mm**（可视高度 1.34m=腰上构图 ✓），§2.1 已修 |
| R2 | **大远景占比超标**：15m@24mm 人物占画高 12.8%，超 V2 标准 ≤1/8(12.5%) | 🟡 临界 | 距离 15→**16m**（占比 11.4% ✓），§2.1 已修 |
| R3 | `applyPanoramaSceneViewCommit` 不传 panoramaView 是否抹掉 360° 视角——文档原版未验证 | 🟡 隐患 | fake store 实测：**保留**（B11-③），S2 流程加注 |
| R4 | 俯仰符号原仅靠默认值推断 | 🟡 隐患 | 实测钉死：正俯仰=高机位（B11-①），`SHOT_PITCH_SIGN=1` 由假设升级为事实 |
| R5 | 其余构图复核全部通过：特写 0.9m@85mm 可视 0.25m(头部满框)、近景 1.6m@50mm 可视 0.77m(胸上)、过肩 1.75m@50mm 可视 0.84m、全景 5m@35mm 人物占 56%(≤2/3 ✓) | ✅ 通过 | 无改动 |
| R6 | 引用核对：`buttonFactory.js` 存在且导出匹配；`sceneNodeActions.js` 可在 node:test 加载（既有 `panoramaCharacterAssets.test.js` 即为先例）；fake store 协议（getState/getStateRaw/updateNodeData/batch）与既有测试一致 | ✅ 通过 | 无改动 |
| R7 | （S2 实施发现）`panorama-scene` 节点经 `normalizeSceneOnlyPanoramaSceneState`，`mode` 永远为 `'scene'`；360° 全景属独立节点类型 `panorama-360`（状态字段 `panorama360Node`）。文档原设想的"panorama→scene 自动切"在该节点结构性不可达 | 🟡 计划偏差 | A3 测试改为断言 scene-only 不变量；action 防御分支保留；§3-4 已加注；§4 显示规则中"panorama 模式下点击"场景作废 |
| R8 | （S3 浏览器实验发现）人台视觉朝向相对 `forwardVectorFromYawPitch(rotY)` 不仅差 π，**yaw 符号还是镜像的**（三点实验：offset=0 拍后脑勺→offset=π 后 rotY=π/2 仍拍后脑勺、rotY=π 拍正脸 → 钉死 facing = π − rotY） | 🔴 错误(已修) | 新增 `SHOT_FACING_YAW_SIGN=-1` + `resolveCharacterFacingYaw()`；T3/T6 改为朝向向量语义断言并复用该函数；rotY∈{0, π/2} 正面特写均目检为正脸 |
| R9 | （S3 实施决策与环境发现）①UI 接入最终采用 **autoload 零侵入模式**（`modules/panoramaSceneShotStrip.autoload.js` + index.html 一个 script 标签），未动混淆的 PanoramaSceneNode.js——优于原计划的 2 处接缝；②节点 id 在宿主层 `.v2-node[data-node-id]` 而非组件根；③双 server.py 实例（8777+8779 同跑）会令 8779 页面卡在 loader（疑 API 资源争抢），浏览器验收应直接用已运行的 8777 | 🟢 改进/备忘 | autoload 内 `resolveNodeId` 用 `closest('[data-node-id]')`；回滚=删 3 个新文件+1 个 script 标签+1 段 CSS |

## 9. 实施完成记录（2026-06-12）

**交付物**（全部新文件，零混淆文件改动）：
- `modules/panoramaSceneNode/characterShotPresets.js`（S1 纯函数）+ `panoramaCharacterShotPresets.test.js`（T1–T8）
- `modules/panoramaSceneNode/characterShotActions.js`（S2 action）+ `panoramaCharacterShotActions.test.js`（A1–A5+A1x）
- `components/panoramaScene/CharacterShotStrip.js`（S3 展示层）+ `panoramaCharacterShotStrip.test.js`（3 用例）
- `modules/panoramaSceneShotStrip.autoload.js`（S3 胶水，轮询 300ms 同步可见性）
- `index.html` 追加 1 个 script 标签；`styles/theme-upgrade.css` 追加 `.v2-character-shot-strip` 区块

**验收结果**：单测 17/17 绿；panorama 全家桶 29/29 绿；浏览器（8777 真实实例）V1–V7 全过——八机位逐一目检构图正确（特写正脸满框/侧面近景/教科书过肩/膝上中景/45°全景/正面中景/高位大远景/77°俯视），focalLength 落库并被 3D 桥消费（85/50/35/24mm 透视差异目视可辨），旋转 π/2 后正面特写仍正对面部，取消选中 700ms 内收起，多节点各自独立同步。全仓 `node --test` 中 48 个失败均位于与本改动无交集的区域（RunningHub 适配器/视频参数面板/output\upstream 上游副本——对应本分支并行会话的未提交修改），且 panorama 相关全部套件 0 失败。

## 10. UI 迭代：右侧竖排停靠（2026-06-12 用户反馈）

**需求**：机位按钮改为竖排停靠在黑夜/白天按钮（`.v2-panorama-scene-corner-toolbar`，挂于 `.panorama-scene-shell`，`top/right: var(--space-14)`，按钮 40×40）正下方，贴最右侧一列下来，UI 风格与其一致；全屏模式同样成立。

**改动**（2 个文件）：
- `modules/panoramaSceneShotStrip.autoload.js`：strip 挂载目标从组件根改为 `.panorama-scene-shell`（与角部工具栏同容器，普通/全屏定位一致；nodeId 解析本就走 `closest('[data-node-id]')` 不受影响）。
- `styles/theme-upgrade.css`：`.v2-character-shot-strip` 重写为竖排列（`flex-direction: column`，`right: var(--space-14)`，`top: calc(var(--space-14) + 56px)` = 角部工具栏 48px 高 + 8px 间距），完整复用 `--panorama-scene-current-toolbar-*` 设计令牌（毛玻璃/圆角/阴影），按钮 40×40 透明底 + 悬停提亮（与 env-toggle 同款）；全屏态（`.panorama-scene-browser-fullscreen`）`top: calc(var(--space-14) + 100px)` 跟随角部工具栏整体下移 44px。

**验收**（浏览器实测）：strip 与角部工具栏 left/right 像素级同列对齐、紧贴其下 8px；点击预设正确运镜（特写正脸目检通过）；全屏类模拟下两者同步位移、间距恒定；单测 17/17 不变。

**环境备忘补充**：①预览浏览器实例可能被并行会话替换/搞挂（症状：eval 正常但渲染管线死、截图超时、addNode 不绘制）——`preview_stop` + `preview_start` 换新浏览器即愈；②持久化的测试节点会叠在同坐标导致点错节点的速切条——验证脚本应先清理 `shot-*` 前缀测试节点。

## 11. 双入口重构 + 默会参数 v2（2026-06-12 用户反馈第二轮）

**反馈**：①全屏模式速切条不显示（非全屏反而显示）；②机位角度需按默会知识重调；③全景图融合（见 §12）。

**全屏不显示的根因**：全屏是 **shell 传送门**机制——`.panorama-scene-shell` 被搬运到 body 级 `.panorama-scene-browser-fullscreen` 容器（`panorama-scene-browser-fullscreen-anchor` 占位），脱离 `.panorama-scene-component` 祖先链 → 旧实现按 component 扫描找不到 strip、`closest('[data-node-id]')` 解析 nodeId 失败。

**双入口设计（终版）**：
- 戳记机制：轮询期间把 nodeId 写入 `shell.dataset.shotNodeId`，随 shell 传送携带，nodeId 解析不再依赖 DOM 祖先（host 优先、戳记兜底）。
- **全屏**：选中人台 → strip 自动浮现（`is-visible` + `is-fullscreen`），右缘竖排贴黑夜/白天按钮下方（`top: space-14+100px` 让位"退出全屏"）。
- **非全屏**：编辑工具栏（`.v2-panorama-mode-toolbar`）注入 `act-character-shot-toggle` icon 按钮，tooltip "固定机位"，未选人台时禁用置灰；点击切换 strip `is-open` 下拉（同右缘位置），选完机位即运镜并收起；外点/Escape 关闭。
- 浏览器实测（8777）：全屏 portal 后戳记随行、strip 自动浮现于"退出全屏→黑夜白天→八机位"右缘竖列、全屏内点击正确运镜；非全屏按钮启用/禁用状态正确、下拉展开/选择/收起全通；测试 18/18 绿。

**默会参数 v2**（重调理由：目标点=构图中心，特写让眼落上三分线；俯仰 +3~8° 微俯更自然上相；近景=胸上、中景=腰上、全景=全身留头脚空间）：

| 机位 | 方位 | 目标高 | 俯仰 | 距离 | 焦距 | v1→v2 变化 |
|---|---|---|---|---|---|---|
| 正面特写 | 0° | 1.58(口鼻) | +5° | 1.15 | 85 | 目标 1.72→1.58、加微俯、拉远 0.9→1.15 |
| 右侧近景 | +80° | 1.40(胸上) | +3° | 2.0 | 65 | 90°→80°(微偏前见眼神)、焦距 50→65 |
| 过肩 | +160° | 视线点 1.6m@1.45 | +8° | 1.9 | 40 | 视距 1.2→1.6、广角 50→40 纳入对手空间 |
| 右侧中景 | +90° | 1.25(腰上) | +5° | 3.2 | 50 | 1.15→1.25、2.8→3.2 |
| 右前方全景 | +45° | 1.0 | +4° | 6.5 | 35 | 5.0→6.5(人物≈2/3画高留头脚空间) |
| 正面中景 | 0° | 1.25 | +5° | 3.2 | 50 | 同右侧中景 |
| 后上方大远景 | 180° | 1.0 | +28° | 18 | 24 | 16→18 |
| 俯视角 | 保持 | 1.0 | 89°→clamp | 8.0 | 24 | 7→8 |

**朝向公式复核**：UI 放置人偶（`addPanoramaSceneMannequin` 经 `readCurrentViewPose`）存 `rotY = −viewYaw`，代入 `facing = forward(π − rotY) = forward(π + viewYaw) = −相机视线方向` = 正对相机 ✓ —— 与公式完全一致（Node 纯数学三组 viewYaw 验证）。"角度不对"确认为构图参数问题而非朝向错误。

**环境备忘三**：预览面板视口可能变成 **0×0**（`innerWidth/Height=0`，画布零尺寸→虚拟化渲染器一个节点都不画、截图超时）——先 `preview_resize` 恢复尺寸再 reload；store 删除节点后旧 DOM 可能残留为"僵尸 shell"（querySelector 第一命中陷阱），验证脚本必须按 host id 作用域查询。

## 12. 360 全景图融入 3D 导演台——落地方案（待排期）

**目标**：全景图（上传或 AI 生成）作为 3D 导演台的环境贴图，人偶站在"场景里"取景，八机位+截帧输出带环境的构图参考。

**现状盘点（管线大半已通）**：
- `sceneNode.panorama` 状态字段已存在（localPath/imageUrl/fileName/sourceSignature/isLoaded/error）✅
- `uploadPanoramaSceneImage`（上传入口）+ `syncPanorama360FromIncomingImageEdge`（**连边自动同步**：图像节点→导演台）已存在 ✅
- `PANORAMA_360_IMAGE_SOURCE_TYPES` 已定义可接受的来源节点类型 ✅
- `panorama-360` 独立节点（AI 全景生成与查看）已存在 ✅
- 三维侧 `scene3dBridge`(three.js r1xx) + `environmentMode`(day/night) ✅
- **唯一缺口：渲染消费**——把 equirect 贴图变成场景环境（当前 scene-only 模式只有纯色天空+网格地面）。

**实施分片**：

| 片 | 内容 | 要点 | 估时 |
|---|---|---|---|
| P1 环境球 | `scene3dBridge` 增加 `syncPanoramaEnvironment(panoramaState)`：TextureLoader 加载 equirect → `mapping = EquirectangularReflectionMapping` → `scene.background = tex` + `scene.environment = tex`（IBL：人偶材质自动吃环境反射/补光） | 按 `sourceSignature` 缓存纹理防重载；卸载时 dispose；背景随轨道相机旋转天然正确 | 1d |
| P2 地面融合 | 简单档：全景加载时地面网格隐藏/半透明、雾色取全景底部均值；进阶档：three.js `GroundedSkybox`（地碗投影，人物真正"站进"场景） | 地碗半径≈15-30m 与机位距离匹配（大远景 18m 在碗内） | 1-2d |
| P3 光照一致 | equirect 降采样估主光方向/色温 → 驱动 DirectionalLight（人偶投影方向与全景吻合）；`environmentMode` 改语义为曝光/色调分档 | 简化为最亮像素块求方向即可 | 1-2d |
| P4 工作流闭环 | panorama-360 节点生成 → 连边 → 导演台自动换景（已有 sync）→ 摆人偶 → 八机位 → `capturePanoramaSceneViewport` 截帧（背景随渲染自动入画）→ 喂分镜/生图参考 | 主要是端到端验收 + golden 用例 | 0.5d |

**校验与降级**：输入校验宽高比≈2:1（非 equirect 给 toast 并拒载）；建议分辨率 ≥4096×2048（低于则提示模糊风险）；纹理加载失败回落纯色环境（现状）；`panorama.error` 字段已预留。

**红线**：只动 `scene3dBridge` 渲染消费层 + 新模块，不改 storeActions 契约；全景纹理不入 store（store 只存引用，与现状一致）。

### §12.1 实施记录（2026-06-12，P1-P3 已落地）

**交付物**（全部新文件，零混淆文件改动）：
- `modules/panoramaSceneNode/panoramaEnvironmentRuntime.js` —— P1 环境球点亮 + IBL（克隆纹理转 `EquirectangularReflectionMapping` → `scene.environment`）、P2 简单档（`_ground`/`_grid*` 透明度 ×0.25 让位+可逆恢复）、P3 主光估计（equirect 降采样 64×32 找最亮格 → 方向/色温/强度 → 自建 `__hyPanoSun` DirectionalLight，不动原生灯）。
- `modules/panoramaSceneEnvironment.autoload.js` + index.html 1 个 script 标签（删除即整体回退）。
- `panoramaEnvironmentRuntime.test.js`（E1–E7：点亮/恢复/360 不干预/纹理换源/地面往返/光估计/安装幂等）。

**重大实现发现（三个深坑，逐一实证）**：
1. **桥构造函数用闭包覆盖实例方法**——朴素原型包装 0 调用（实例自有属性遮蔽）。解法：原型**访问器陷阱**（getter/setter），构造期 `this.x = fn` 赋值必经 setter 被包装；getter 兜底包装原型原方法。对 `_syncPanoramaCanvasVisibility` + `renderNow` 双钩。
2. **`renderOrder = -1` 会让全景球被渲染管线整体吞掉**（与桥多 pass 渲染交互；探针球二分 + 像素采样定位）。修复：不设 renderOrder，仅 `depthWrite=false + material.fog=false + toneMapped=false`。
3. **上游遗产确认**：`sceneNode.panorama` → 主同步 → 纹理加载到 60m BackSide 球的链路**原生已通**（含 token 化竞态防护/SRGB/各向异性），scene 模式下球加载后本就 `visible=true`——P1 的核心工作量是排掉上述两坑 + IBL/地面/光照增强。

**验证状态**：单测 E1–E7 全绿（panorama 全家桶 37/37）；浏览器像素级验证：修复 renderOrder 后渲染出全景地面色（[98,81,61]，对照原生灰 [59,59,63]），钩子状态全真（sphereVisible/hasMap/envHooked/dimmed=true, warned=false）。**遗留 P4 端到端目检**（环境球+人偶+八机位+截帧整图）因预览浏览器环境劣化（连续 4 实例渲染管线僵死，详见 §11 环境备忘）转交真机验证，步骤：3D 导演台 → 工具栏「上传全景图」选一张 2:1 equirect → 球面环境即现、地面网格自动让位、人偶受全景主光照明 → 选人偶切八机位 → 截图按钮出参考帧。

**预览环境备忘四**：画布渲染器 boot 后需要真实窗口 resize 信号才开始绘制节点（合成 `dispatchEvent(new Event('resize'))` 有时无效，`preview_resize` 真实改尺寸有时有效）；浏览器实例 reload 后渲染管线高概率僵死——验证策略应为「新实例 + 单次加载 + 一次性跑完全部断言」。

## 13. 全景图节点连线导演台（2026-06-12 用户反馈第三轮）

**需求**：panorama-360（360全景图节点）可连线到 panorama-scene（3D导演台），实现连线换景。

**现状根因**（连线真值表实测）：`isValidConnection` 的允许目标列表不含 `panorama-scene` —— 导演台**不接受任何入边**；且原生 `syncPanorama360FromIncomingImageEdge` 有 `isPanorama360NodeType` 守卫，只服务"图→360节点"方向，导演台无同步消费。

**改动**：
1. **校验放行**（唯一一处混淆文件 seam，备份 `EdgeController.js.bak-pano-edge`）：`isValidConnection` 在 id 检查后插入——目标为 `panorama-scene` 时仅接受 `panorama-360` 源（普通图像走节点自带"上传全景图"按钮，语义不混淆）。插入点在 blocked-source 检查之前（panorama-360 原本是被禁输出的源）。⚠️ 编码坑：该文件 UTF-8 无 BOM，PS5.1 `Get-Content` 默认 GBK 读会毁中文字面量——必须 `[IO.File]::ReadAllText(UTF8)` 读写（第一次 seam 因此炸出语法错误后回滚重做）。
2. **边同步模块**（新文件）`modules/panoramaSceneNode/panoramaSceneEdgeSync.js`：轮询比对——360 节点 `panorama360Node.panorama` → 导演台 `sceneNode.panorama`，签名 `edge:<sourceId>:<media>` 标记连线来源；断边/源图移除仅清空连线来源的全景，**手动上传（无 edge: 前缀）永不触碰**；多入边取最近；edges 数组/对象 map 双形态兼容（真实 store 为 map，字段 sourceId/targetId 已实锤）。
3. **接入**：`panoramaSceneEnvironment.autoload.js` 增加 500ms 轮询（签名不变零写入）。

**验证**：真值表 C1–C3（新规则 + 既有规则全量回归锁）+ 同步 S1–S6 全绿（51/51 panorama 全家桶）；真实 store 端到端（浏览器 eval）：`addEdge` → 导演台 panorama 写入（edge: 签名）→ `removeEdge` → 清空恢复。配合 §12 环境运行时：连线后 500ms 内纹理加载、环境球即现。

**真机验收步骤**：360全景图节点（生成或上传全景）→ 拖线连到 3D导演台（现在允许）→ 导演台环境即换为全景；断开连线 → 恢复纯色环境；导演台上手动上传的全景不受连线增删影响。

## 14. 修复：360全景图上传报"上传失败"（2026-06-12 用户反馈第四轮）

**根因**（浏览器真实复现定位）：`sceneNodeActions.js` 的 `uploadPanoramaSceneImage` 调用 `resolveOutputMediaSize`（上传后做 2:1 比例检查）但**缺失 import**——该函数定义在 `services/mediaRatioService.js`（`imageToolbar.js` 等正确引入），此处某次加比例检查功能时漏带 import → 运行时 ReferenceError 进 catch → toast "上传失败" + `panorama.error="resolveOutputMediaSize is not defined"`。服务器端点 `POST /api/upload` 实测完全正常（200，multipart 直测）。

**修复**：`sceneNodeActions.js` 顶部补一行 import（hy-fix 注释标记，备份 `.bak-upload-fix`，UTF-8 显式读写）。

**验证**：依赖该模块的 21 个测试全绿；浏览器真实链路复现——修复前 `error: "resolveOutputMediaSize is not defined"`，修复后 `error: null` + `imageUrl: /data/uploads/...` + 上传源节点与连边正常创建。2:1 比例检查现在真正生效（非 2:1 图会弹拉伸警告）。

## 15. 修复：全景图节点拖不出连线（2026-06-12 用户反馈第五轮）

**根因**：§13 只放行了 `isValidConnection`（校验层），但本应用的连线起手依赖**选中节点右侧的 side-plus "+"按钮**——其渲染过滤（EdgeController @side-plus 定位函数）用同一个 `_PANORAMA_SOURCE_BLOCKED_TYPES` 黑名单（含 `panorama-360`）→ 选中全景图节点根本不出现右侧"+"，无从拖线。

**修复**（EdgeController 第二处 seam，同文件同备份）：side-plus 输出过滤白名单放行 `panorama-360`。拖线落点校验仍走 isValidConnection（只允许落在导演台上，其余目标拒绝）。

**验证**：模块加载正常、真值表不变、9/9 边同步测试绿；`getAllowedGenerationNodeTypesForQuoteMenu('panorama-360')` 返回空数组（右"+"点击菜单为空但不崩——菜单候选不含 panorama-scene，后续可按需加入"创建并连接导演台"快捷项）；其余源类型菜单零变化。

**真机步骤**：刷新页面 → 选中 360全景图节点 → 右侧出现"+" → 按住拖到 3D导演台节点上松手 → 连线建立、导演台 500ms 内换景。

## 16. 地面投影穹顶：比例与地平线修复（2026-06-12 用户反馈第六轮）

**反馈**：①人物比例与场景不协调；②全景地平线与舞台地平线不一致（下半球被黑色舞台地面切断）。测试素材 `D:\Backup\Downloads\5f916a052de5f629614fb7932f254897.jpg`（7108×4000，16:9 非标准全景——贴球有约 12% 水平拉伸，上传时已有比例警告）。

**默会方案**：行业标准 **Grounded Skybox（地面投影穹顶）**——假设全景按站立视高（1.6m）拍摄，下半球顶点沿视线方向投影到地面平面（射线长截断于半径），整体上移 `height−0.01`：全景地板像素铺成真实地面、地平线（赤道）自然落在 1.6m 视高、人物脚踩全景地板获得比例锚。穹顶半径 24m（覆盖最大机位距离 18m×scale）。原生 60m 球在 scene 模式让位隐藏（仍归 360 查看器）。

**实现**：`panoramaEnvironmentRuntime.js` 重写——`buildGroundedDomeGeometry()`（球几何下半球顶点变换，E8 测试锁定平面/壳层分布）+ `ensureGroundedDome`（贴图共享原生纹理、换图原位换贴图、卸载 dispose 几何材质不动纹理）。

**实施中的第三个深坑（R10）**：原生主同步**每次都回写** `_ground.visible=true` 和按 zoom 动态计算的网格透明度——一次性隐藏被覆盖，0.96 不透明地面把穹顶下半部全部盖住（症状与 renderOrder 坑同款"轻微红色泄漏"）。修复：全景激活期间**每次同步幂等压制**（ground 隐藏 + 网格钳到 0.08），恢复时交还原生回写。E5 测试模拟原生回写锁定该行为。

**验证**：单测 8/8（全家桶 47/47）；浏览器真实素材端到端——像素采样：顶部暖棕（橱柜）/底部浅米（地砖投影）；截图目检：默认俯视下人偶站在全景地砖上（网格仅剩淡参考线）、正面中景下人物与门/家具比例协调、地平线穿过人物腰部（平视构图正确）、IBL+主光照明生效。

**备忘**：①16:9 等非 2:1 素材有水平拉伸（已有上传警告），后续可做"弧幕模式"（局部球带投影）消除拉伸——**已于 §17 落地**；②验证脚本用 PowerShell 拼 multipart 时 byte[] 数组会被字符串化毁文件（fetch 200 但 Image 解码失败、文件头非 FF D8 FF）——脚本上传一律改用 `Invoke-RestMethod -Form` 或直接拷文件进 data/uploads。

## 17. 弧幕模式：按图片比例消除变形（2026-06-12 用户反馈第七轮）

**反馈**：非 2:1 图整球环绕后严重变形"完全不能用"；要求按上传图片比例计算处理。

**方案（已实现）**：`resolveProjectionMode(w, h)` 按比例分流——
- **≈2:1（1.9~2.15）**：全等距地面投影穹顶（§16 原方案）。
- **其他比例 → 弧幕模式**：图投到局部球带 `SphereGeometry(R, …, phiStart, hFov, thetaStart, vFov)`，**水平视场 = 70°基准垂直视场 × 宽高比**（等距映射下保持方形像素=零变形；hFov 钳 40°~200°，触限回推 vFov 维持方形像素）。16:9→124.4°×70°、21:9→163°×70°。弧幕下沿照常做地面投影（人物仍站在图片地板上、地平线对齐保持）。弧幕旋转 -90° 使中心正对 +Z=默认放置人偶的身后（拍人时弧幕作背景入画）。
- **弧幕外补全**：同图两段式重度均化（24×12 降采样 → blur(10) 放大至 128×64）做 360° 模糊背景层（R+0.8 外侧），只保留色调/光感、不暴露拉伸结构；其地面投影即弧幕扇区外的地板底色。IBL/主光照旧用原图。

**对抗审查（Workflow 两轮，5+5 agents）确认并修复的两个 major**：
- **R11 桥层 A→B→A 换图竞态**（预存缺陷）：回退到已加载 URL 时早退不作废在途加载 → 画面停在错图。修复：`scene3dBridge.js` 第三处 seam（备份 `.bak-race-fix`）——命中 loaded 早退前 `++token` 并清 pending。
- **R12 网格淡化从未上屏**：原生 `renderNow` 内部顺序是"`_syncInfiniteGrid` 重算网格透明度 → render"，运行时钩子在 render 之后钳制 → 每帧画的都是原生值；E5 测试把时序模拟反了所以假绿。修复：renderNow 钩子改为 **fn.apply 前** `preRenderGridSuppress`（仅全景激活时钳网格），E5b 用真实时序锁定。审查覆盖度说明：lifecycle 维度两轮完成（产出上述两发现）；three-math 维度两轮均因 API 网络故障未完成，其核心数学由 E8/E10 单测+多轮浏览器目检覆盖。

**验证**：单测 12 项全绿（全家桶 51/51）；浏览器真实素材（16:9 客厅效果图）：正面中景下背景清晰**零变形**（沙发/电视墙/吊灯比例自然）、人物与家具比例协调、地平线对齐、网格淡化上屏生效、地板斑驳经两段式模糊明显减弱。已知残留：弧幕下沿地面投影对图片下 1/3 的"非地板内容"（家具）有径向拉花——地面投影固有特征，如需可后续加"地板投影半径上限"参数收窄。


## 17. 全景渲染推翻重做 + 导演台产品化 P0-P4（2026-06-12 第七轮，用户给竞品截图）

**用户反馈**：弧幕+模糊方案"完全不能用"（地板成斑驳烂泥），并给竞品导演台截图（真 2:1 全景豪华客厅，地砖透视正确/墙面无拉伸；左场景树+右数值检查器+导演/机位视角切换+ViewCube）。

**根因终判**：一张 16:9 照片本质不是 360° 全景，数学上无法无缝包球（要么横拉 2 倍，要么只覆盖部分球）。弧幕+模糊是想从普通照片伪造 360°，做不到好看。竞品干净是因为输入就是真 2:1 全景，且不强行处理非全景图。

**用户拍板**：两条路（删弧幕+模糊）；产品做满 P0-P4。

### P0 全景地面止血（已完成）
`resolveProjectionMode(w,h)` 按比例分叉：
- ≈2:1（1.9–2.15）→ grounded：地面投影穹顶，地板来自全景、人物站进场景、隐藏原生地面（= 竞品效果）；
- 其他 → backdrop：图作弧形背景屏（`buildBackdropBandGeometry`，方形像素无拉伸，不做地面投影），保留原生网格地面，人物站网格上、照片纯背景参考；
- 无尺寸信息保守按 grounded（防真全景误判）。
删除 buildGroundedBandGeometry/buildBlurredBackdropTexture/Group 多层，dome 回归单层 Mesh。上传比例提示改为"将作为背景参考…上传 2:1 等距全景图可让人物站进场景"。

验证：单测 13/13（E1 grounded、E9 比例分叉、E10 弧屏纯球壳无地面投影、E11 backdrop 保留地面、E12 模式切换地面恢复）；浏览器真机（用户 16:9 厨房图）：panoMode=backdrop + 单层 Mesh + 原生网格地面 visible + 原生球隐藏，截图确认房间无拉伸作背景、人物站网格上——烂泥地板彻底消除。

### 竞品功能拆解 + 幻映差距
竞品 = 轻量虚拟制片台：①导演/机位双视角 ②场景树(机位/角色,命名/搜索) ③数值检查器(位置/旋转/缩放/统一缩放/颜色) ④姿势 tab ⑤ViewCube 导航球 ⑥命名彩色多角色 ⑦干净全景地面。幻映内核（人偶/机位/gizmo/截帧/八机位）已齐全，差①②③④⑤外壳 + ⑦渲染质量。

### 路线（P1-P4 进行中）
- P1 导演/机位双视角：viewport.viewMode(director|camera)，机位视角=相机设为选中机位位姿，复用八机位/机位槽
- P2 场景树+数值检查器：读 mannequins/cameras 渲染，写回走既有 action+轮询
- P3 角色姿势：GLTF 骨骼套预设旋转（applyPanoramaCharacterNaturalArmPose 先例）
- P4 ViewCube + 打磨
全部新模块 + autoload + theme-upgrade.css，不碰混淆核心。

## 18. P1+P2 导演台编辑器外壳（2026-06-12 完成）

竞品对标 = 轻量虚拟制片台。本期交付顶部模式切换 + 左场景树 + 右数值检查器，全屏 shell 上挂载，几乎逐项对齐竞品截图。

**新文件**：
- `components/panoramaScene/DirectorChrome.js`（纯逻辑：deriveSceneTree/filterSceneTree/deriveInspector/buildMannequinPosePatch/MANNEQUIN_COLOR_HEX）
- `modules/panoramaDirectorChrome.autoload.js`（DOM 渲染 + 350ms 轮询同步 + 事件）
- `panoramaDirectorChrome.test.js`（D1-D9）
- theme-upgrade.css 追加 `.hy-director-chrome` 区块 + 右缘布局协调（:has 选择器）

**P1 导演/机位视角**：顶部 segmented 切换条。机位视角 = `setPanoramaSceneSafeFrameVisible(true)` + 跳到选中/首个机位（`activatePanoramaSceneCamera`，已有 `cameraPoseToSceneViewFromReference` 把机位世界位姿转 orbit sceneView）；导演视角 = 安全框关 + 自由轨道。viewMode 存 shell dataset（无原生字段）。

**P2 场景树+检查器**：
- 左场景树：机位（可命名，回落"机位N"）+ 角色（按序号派生"角色A/B"，无原生 name 字段；色块用自定义 colorKey→hex 显示表，红=#F75353 同竞品）；搜索过滤；点击 → `setPanoramaSceneSelection`，选中态双向轮询同步。
- 右检查器：人偶=位置X/Y/Z + 旋转Y(度) + 统一缩放 全可编辑 + 颜色块；机位=名称(可改)+焦距。编辑 → `updatePanoramaSceneObjectTransform`/`renamePanoramaSceneCamera`。

**实施中抓到的两个真 bug**：
1. 🔴 **部分 pose 重置**：`updatePanoramaSceneObjectTransform` 收到部分 pose（如只 `{scale}`）会把缺失字段（position）归零（浏览器实测确认）。修复：`buildMannequinPosePatch` 始终输出完整 pose，只改被编辑字段（D8 回归锁）。
2. 🟡 **轮询 re-render 闭包陈旧**：350ms 轮询重渲染会替换 input，旧闭包的 `insp.fields` 陈旧 → 误用旧值重置其他轴。修复：change 处理器触发时从 store 实时重取 `deriveInspector().fields`，不依赖渲染时闭包。

**右缘布局协调**：全屏 chrome 激活时（`:has(.hy-director-chrome.is-visible)`）隐藏冗余八机位竖条（非全屏仍用"固定机位"按钮）、日夜角标左移 232px 让位检查器。

**验证**：纯逻辑 D1-D9 全绿（9/9）；浏览器真机：树选中联动、X 编辑(0→2.5,Y/Z 保留)、旋转(→90°)、缩放(→1.5)、机位视角(安全框 on)、改旋转后位置不被重置——全通过，截图与竞品布局高度一致。

**遗留**：P3 角色姿势（需核对 GLTF 骨骼名，applyPanoramaCharacterNaturalArmPose 为先例）、P4 ViewCube 导航球——下一步。
