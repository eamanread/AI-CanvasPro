# 幻映 3D 导演台 · 开发文档（V1–V5 实施蓝图）

| 项 | 值 |
|---|---|
| 版本 | **DEV v1.1（spike 修正）** |
| 最后修订 | **2026-06-12** |
| **单一真相源（SoT）** | **本文档 = 实现 SoT**。功能清单 SoT=`11-...full-feature-spec.md`；范围/PRD SoT=`13-...prd.md`；`12-...design-plan.md` **已退役**（并入 13/14）。 |
| 规划编号 | **唯一规划编号 = V1–V5**。已交付基线（原 P0–P2 任务批次）统一记作 **"V0 基线"**；doc11 §12 P0–P7 已 superseded。 |
| 配套 | PRD `13-director-station-prd.md`（v1.1） |
| 性质 | 工程实施蓝图——文件级模块清单、真实 action 契约、字段字典、关键算法、测试约定，可直接派工 |
| 铁律 | 全部新模块 + autoload + `theme-upgrade.css` 唯一样式入口；**不改混淆核心**；每功能独立可回退；纯逻辑零 DOM 可测 |

---

## 0. v1.1 勘误（spike 修正）⚠️ 推翻旧假设

> 本节列出 spike 实测推翻的旧假设，**全文字段落点、取景比例机制、"添加到画布" 流程、AI 生成全景路由均以本节为准**。

| # | spike 实测事实 | 推翻的旧假设 | 现行裁决（实现） |
|---|---|---|---|
| 1 | `sceneNode` 是**封闭 schema**：`normalizePanoramaSceneState` 白名单化，**剥离一切未知字段**。实测顶层 `environmentSkyColor/panoramaSphere/directorExt`、`camera.lookAtTarget/lookAtPoint`、`mannequin.pose/posePresetKey` **全被丢弃**；`capture.mode='16:9'` 被**重置回 `'adaptive'`**。 | "新字段挂 sceneNode/capture.mode 扩枚举即可" | 字段字典 §2.3 全部新字段从 `sceneNode.*` 改到 **`node.directorExt.*`** |
| 2 | 新状态放**节点级 `node.directorExt`（与 sceneNode 同级）**：迁移 `_migratePanoramaNodeInPlace` 只转 sceneNode/panorama360Node、不剥离 node 级其他字段；`store.updateNodeData` 合并保留。**✅ V1-0 运行时实测通过**：`updateNodeData(nodeId,{directorExt:{...}})` 写入→读回完整，且扛住后续 `updateNodeData` 合并不被冲掉、normalize 不碰。 | "状态全在 sceneNode 内" | 写回走 `store.updateNodeData(nodeId,{directorExt:{...}})`（合并）；读取 `node.directorExt`（运行时✅；**跨项目保存/重载持久化仍待验**，留作各版落地首检项） |
| 3 | **取景比例不能用 `capture.mode`**（whitelist 拒绝新值）。 | "比例=capture.mode 扩枚举" | §4.1：比例存 `node.directorExt.aspect`；安全框 **UI 层自绘遮罩**（DOM/canvas 叠加，不依赖桥 capture 安全框） |
| 4 | **"添加到画布"**：`capturePanoramaSceneViewport(...)` **只回 blob、不创建节点**。 | "截帧 action 顺带落画布节点" | §4.6（新增）：另接 `modules/nodeSpawn.js` 的 `createBatchSpawnLayoutNearNode` + `store.addNode` 落 ai-image/source-image 节点（参考 `characterShotActions.js`） |
| 5 | **AI 生成全景**：`modules/createPanorama360FromImageNode.js` 导出 `createPanorama360FromImageNode` **已存在**。 | "AI 全景管线待建" | §5 V2 背景源 "AI生成" → 复用 `createPanorama360FromImageNode` / panorama-360 节点 |

---

## 0. 架构总览

### 0.1 分层（沿用已交付基线 = V0，即原 P0–P2 任务批次的零侵入架构）

```
┌─────────────────────────────────────────────────────────────────┐
│ L4 UI 外壳层（autoload，挂 .panorama-scene-shell）                 │
│   panoramaDirectorChrome.autoload.js（顶栏/左树/右检查器，已建）    │
│   panoramaSceneShotStrip.autoload.js（八机位，已建）               │
│   ＋各版新增 autoload（见模块清单）                               │
│      │ DOM 渲染 + 350ms 轮询同步 + 事件                           │
├─────────────────────────────────────────────────────────────────┤
│ L3 纯逻辑层（components/panoramaScene/*.js，零 DOM、node:test）     │
│   DirectorChrome.js（树/检查器派生，已建）                         │
│   ＋各版新增纯逻辑模块（视图模型派生 / 参数换算 / 骨骼角度表）       │
├─────────────────────────────────────────────────────────────────┤
│ L2 渲染消费层（panoramaEnvironmentRuntime.js，已建）               │
│   bridge 原型访问器钩子；全景投影/IBL/主光；＋V2 天空色/球参数      │
├─────────────────────────────────────────────────────────────────┤
│ L1 Action 层（modules/panoramaSceneNode/sceneNodeActions.js，混淆）│
│   只读调用，不改：变换/选中/机位/截帧/取景/环境（签名见 §3）        │
├─────────────────────────────────────────────────────────────────┤
│ L0 状态 + 桥（appStore + scene3dBridge.js，混淆，只读）            │
│   node.sceneNode（字段字典 §2）；PanoramaScene3DBridge（three.js） │
└─────────────────────────────────────────────────────────────────┘
```

### 0.2 数据流（单向，所有 UI 一致）

```
读： appStore.getStateRaw() → node.sceneNode
     → normalizePanoramaSceneState() → derive*(纯逻辑) → 视图模型 → 渲染 DOM
写： DOM 事件 → build*Patch(纯逻辑) → sceneNodeActions.*({nodeId,...,storeInstance:appStore})
     → store 更新 → scene3dBridge 渲染跟随
同步：350ms 轮询 derive，签名比对跳过无变化；输入聚焦期间不重渲（防打断）
```

### 0.3 挂载与 nodeId 解析（全屏传送门，已踩坑）

- 全屏时 `.panorama-scene-shell` 被搬到 body 级 `.panorama-scene-browser-fullscreen` 容器，脱离 `.panorama-scene-component` 祖先链。
- **必须**：轮询时把 nodeId 写入 `shell.dataset.shotNodeId`（host 优先、戳记兜底），随 shell 携带；不可依赖 DOM 祖先 `closest('[data-node-id]')`。
- 已封装：`resolveShellNodeId(shell)`（见 `panoramaDirectorChrome.autoload.js`）。

---

## 1. 模块清单（已建 + 各版新增）

| 版本 | 新文件 | 层 | 职责 | 测试 |
|---|---|---|---|---|
| 已建 | `panoramaEnvironmentRuntime.js` | L2 | 全景投影/IBL/主光 | `panoramaEnvironmentRuntime.test.js` |
| 已建 | `panoramaSceneEdgeSync.js` | L1辅 | 全景连线同步 | `panoramaSceneEdgeSync.test.js` |
| 已建 | `DirectorChrome.js` | L3 | 树/检查器派生 | `panoramaDirectorChrome.test.js` |
| 已建 | `panoramaDirectorChrome.autoload.js` | L4 | 外壳 DOM | （浏览器目检） |
| **V1** | `DirectorChrome.js`（扩） | L3 | +比例/变换模式/三轴旋转 派生与 patch | 扩 D 系列 |
| **V1** | `panoramaDirectorChrome.autoload.js`（扩） | L4 | +底部比例/变换菜单、检查器三轴行 | 目检 |
| **V2** | `sceneGlobalInspector.js` | L3 | 全局场景检查器派生（场景变换/全景球/天空色/开关） | 新测试 |
| **V2** | `panoramaEnvironmentRuntime.js`（扩） | L2 | +天空色/球半径/水平旋转 消费 | 扩 E 系列 |
| **V2** | `panoramaBackgroundSource.autoload.js` | L4 | 背景源菜单（本地/历史/AI生成） | 目检 |
| **V3** | `cameraInspector.js` | L3 | 机位检查器派生 + FOV换算 + look-at求解 | 新测试 |
| **V3** | `cameraThumbnail.js` | L3/L2 | 离屏镜头预览（复用 bridge renderer） | 目检 |
| **V4** | `characterPosePresets.js` | L3 | 20 预设骨骼角度表 + 部位/自由度定义 | 新测试 |
| **V4** | `characterPoseRuntime.js` | L2 | 骨骼旋转应用（基于 applyPanoramaCharacterNaturalArmPose） | 目检+标定 |
| **V4** | 检查器姿势 tab（扩 autoload） | L4 | 预设网格 + 细调滑杆 | 目检 |
| **V5** | `viewCube.js` + autoload | L3/L4 | 方位立方体 → orbitYaw/Pitch | 目检 |
| **V5** | `characterLibrary.js` | L3 | 角色库/上传注册 | 新测试 |

---

## 2. 字段字典（真实 `node.sceneNode` + 各版新增）

### 2.1 现有字段（已核实，`normalizePanoramaSceneState` 行为）

```ts
sceneNode = {
  version: number,
  mode: 'scene' | 'panorama',                 // panorama-scene 经 scene-only normalizer 锁 'scene'
  environmentMode: 'day' | 'night',           // 默认 'night'；无任意天空色
  viewport: {
    activeView: string,                        // 默认 'default'
    activeCameraId: string | null,
    sceneView: { target:{x,y,z}, orbitYaw, orbitPitch, orbitDistance, focalLength? },
    panoramaView: { yaw, pitch, fov }
  },
  panorama: { localPath, imageUrl, fileName, sourceSignature, isLoaded, error },
  mannequins: [{ id, gender, colorKey, position:{x,y,z}, rotation:{x,y,z}, quaternion, scale }],
                                               // scale: 标量或 vec3 均被 normalize 保留（桥渲染 vec3 待验）
  cubes: [...],
  cameras: [{ id, slot, name, position:{x,y,z}, quaternion, rotation:{x,y,z}, focalLength }],
  selection: { selectedObjectType, selectedObjectId, selectedObjectIds[], selectedObjects[], selectedGroupId },
  groups: [...], gridPlacement: { rows, cols, spacingX, spacingZ, gender, colorKey },
  capture: { pending, lastCaptureAt, error, mode:'adaptive', showSafeFrame:false },
  ui: { mouseTool, transformTool:'move'|'rotate'|'scale', activeTool, transformSpace, pivotMode, navigationPreset, showCameraList, isEditing }
}
```

### 2.2 约束（实测，开发必须尊重）

| 约束 | 值 | 影响 |
|---|---|---|
| orbitPitch 钳 | `±1.35 rad (±77.3°)` | 俯视到不了正 90° |
| focalLength 钳 | `[16,135] mm`（默认50，传感器 36mm） | FOV 范围 |
| orbitDistance 钳 | `[0.05,120] m` | 场景缩放上下限 |
| **部分 pose 重置** | `updatePanoramaSceneObjectTransform` 收 `{scale}` 会把 position 归零 | **必须发完整 pose** |
| 坐标约定 | `forwardVectorFromYawPitch(0,0)=(0,0,1)`；相机偏移 `(sin yaw,·,cos yaw)·dist`，yaw=0 朝 +Z | 机位/朝向计算 |
| 人台朝向 | UI 放置存 `rotY=−viewYaw`；视觉朝向 `forward(π−rotY)` | 八机位/姿势朝向 |

### 2.3 各版新增字段（全部落 `node.directorExt`，与 sceneNode 同级）

> ⚠️ **落点铁律（spike 实测）**：`sceneNode` 是封闭 schema，写入任何下列字段都会被 `normalizePanoramaSceneState` 剥离/重置（含 `capture.mode='16:9'`→`'adaptive'`）。故**全部新字段一律落 `node.directorExt.*`**（节点级旁路，与 sceneNode 同级），由 `store.updateNodeData(nodeId,{directorExt:{...}})` 合并写回。

```ts
node.directorExt = {                                  // 与 node.sceneNode 同级
  aspect: 'adaptive'|'21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16',  // V1
  environmentSkyColor: '#hex',                        // V2
  panoramaSphere: { radiusScale:number, yawOffset:rad },      // V2
  cameras: { [cameraId]: { lookAtTarget:'manual'|<mannequinId>, lookAtPoint:{x,y,z} } }, // V3
  mannequins: { [mannequinId]: { pose:{ [boneName]:{x,y,z弧度} }, posePresetKey:string|null } } // V4
}
```

| 版本 | 字段 | 类型 | 默认 | 落点（节点级旁路） |
|---|---|---|---|---|
| V1 | `node.directorExt.aspect` | `'adaptive'\|'21:9'\|'16:9'\|'4:3'\|'1:1'\|'3:4'\|'9:16'` | `'adaptive'` | `store.updateNodeData`；**不走 `capture.mode`**（whitelist 拒绝），安全框 UI 自绘 |
| V2 | `node.directorExt.environmentSkyColor` | `#hex` | 映射 day/night 两档 | `store.updateNodeData`；桥 `scene.background` 消费 |
| V2 | `node.directorExt.panoramaSphere` | `{ radiusScale:number, yawOffset:rad }` | `{1, 0}` | `store.updateNodeData`；渲染层 dome/球参数 |
| V3 | `node.directorExt.cameras[id].lookAtTarget` | `'manual'\|<mannequinId>` | `'manual'` | `store.updateNodeData`（按 cameraId 索引） |
| V3 | `node.directorExt.cameras[id].lookAtPoint` | `{x,y,z}` | `{0,1.2,0}` | 同上，手动时生效 |
| V4 | `node.directorExt.mannequins[id].pose` | `{ <boneName>:{x,y,z弧度} }` | `{}` | `store.updateNodeData`（按 mannequinId 索引），骨骼旋转字典 |
| V4 | `node.directorExt.mannequins[id].posePresetKey` | `string\|null` | `null` | 记录当前预设（细调后转 null） |

> **写回/读取**：`node.directorExt` 是 node 级字段（**非** sceneNode 子字段），不经 `normalizePanoramaSceneState`。依据：迁移 `_migratePanoramaNodeInPlace` 只转 sceneNode/panorama360Node、不剥离 node 级其他字段；`store.updateNodeData` 浅合并保留。**跨保存持久化为高置信结论（spike 推断），各版实施首步仍以真机保存→重载验证一次**；若发现被丢，退路 = 写入 node 其他已知存活字段命名空间。

---

## 3. 数据交互契约（真实 action 签名，全部 `storeInstance: appStore`）

### 3.1 读（纯函数，L3）
```js
import { normalizePanoramaSceneState, isPanoramaSceneNodeType } from './sceneNode.js'
const state = appStore.getStateRaw()            // 现有
const sceneState = normalizePanoramaSceneState(node.sceneNode)
// 派生视图模型（DirectorChrome.js 已有 deriveSceneTree/deriveInspector）
```

### 3.2 写（L1 action，签名已核准）
| 用途 | 签名 |
|---|---|
| 选中 | `setPanoramaSceneSelection({nodeId, objectType, objectId, storeInstance})` |
| 变换 | `updatePanoramaSceneObjectTransform({nodeId, objectType, objectId, pose:{position,rotation,scale}, targets?, storeInstance})` ⚠️完整 pose |
| 变换模式 | `setPanoramaSceneTool({nodeId, tool:'move'\|'rotate'\|'scale', storeInstance})` |
| 安全框开关 | `setPanoramaSceneSafeFrameVisible({nodeId, visible, storeInstance})` |
| 取景比例（**已改**） | ⚠️ **不用** `setPanoramaSceneCaptureMode` 承载比例（`capture.mode` 白名单拒绝非 `'adaptive'`，写 `'16:9'` 被重置）。比例改用 `store.updateNodeData(nodeId,{directorExt:{aspect}})`，安全框 UI 自绘（§4.1）。`setPanoramaSceneCaptureMode` 仅在需切桥原生 adaptive 安全框时调用。 |
| **新状态写回** | `store.updateNodeData(nodeId, { directorExt:{ ...新字段 } })`（浅合并，承载 V1–V5 全部新字段，§2.3） |
| **添加到画布**（**新增**，事实4） | 截帧 `capturePanoramaSceneViewport` 只回 blob → 另接 `createBatchSpawnLayoutNearNode`（`modules/nodeSpawn.js`）+ `store.addNode(...)` 落 ai-image/source-image 节点（§4.6） |
| 机位重命名 | `renamePanoramaSceneCamera({nodeId, cameraId, name, storeInstance})` |
| 机位激活 | `activatePanoramaSceneCamera({nodeId, cameraId, storeInstance})` |
| 加机位 | `addPanoramaSceneCamera({nodeId, viewPose, storeInstance})` |
| 加人台 | `addPanoramaSceneMannequin({nodeId, gender, colorKey, viewPose, storeInstance})` |
| 视图提交 | `applyPanoramaSceneViewCommit({nodeId, sceneView, panoramaView?, activeView='default', activeCameraId=null, storeInstance})` |
| 重置视角 | `resetPanoramaSceneView({nodeId, storeInstance})` |
| 截帧 | `capturePanoramaSceneViewport({nodeId, captureViewport, captureBlob, storeInstance})` |
| 环境 | `setPanoramaSceneEnvironmentMode({nodeId, environmentMode:'day'\|'night', storeInstance})` |
| 变换空间 | `setPanoramaSceneTransformSpace({nodeId, transformSpace, storeInstance})` |

### 3.3 换算（L3，纯函数，`src/core/panoramaSceneMath.js`）
```js
focalLengthToFov(focal, sensor=36)   // → 垂直 FOV(度)
fovToFocalLength(fov, sensor=36)     // → mm
clampSceneFocalLength(mm)            // → [16,135]
clampSceneOrbitPitch(rad)            // → ±1.35
forwardVectorFromYawPitch(yaw,pitch) // 坐标约定基准
resolveSceneCameraPose(sceneView, fov?) // → {position,target,...}（机位预览/look-at 用）
```

---

## 4. 关键算法

### 4.1 取景比例安全框（V1，**UI 自绘——spike 定案**）
- ⚠️ **定案（不再走 capture.mode）**：spike 实测 `capture.mode` 是白名单枚举，写 `'16:9'` 被 `normalizePanoramaSceneState` 重置回 `'adaptive'`，**无法承载比例**。
- **比例存** `node.directorExt.aspect`；**安全框由 UI 层自绘**：
  - `aspect='16:9'` → 目标宽高比 16/9；视口实际宽高比 vs 目标 → 取较小内接框，框外叠 `rgba(0,0,0,.6)` 遮罩（DOM/canvas 叠加层，挂 `.panorama-scene-shell`）。
  - `aspect='adaptive'` → 跟随视口宽高（不绘比例框，或绘桥原生 adaptive 安全框）。
  - 截图：按 `aspect` 内接框裁切 blob（决定出图分辨率比）。
- **不依赖**桥 capture 安全框做比例（桥安全框仅 adaptive 语义）。

### 4.2 FOV↔焦距（V3）
- 滑杆值域用 FOV(度)；显示双标 `${fov}° / ${fovToFocalLength(fov)}mm`；写回 `camera.focalLength = clampSceneFocalLength(fovToFocalLength(fov))`。

### 4.3 注视目标→quaternion（V3）
- 注视状态读自 **`node.directorExt.cameras[id]`**（`lookAtTarget`/`lookAtPoint`）。
- target='manual' → look-at 点 = `lookAtPoint`；target=mannequinId → look-at 点 = 该人台头部 `position + (0, 1.72·scale, 0)`。
- `dir = normalize(lookAt − camera.position)`；由 dir 构 quaternion（three `Matrix4.lookAt` → `setFromRotationMatrix`）。跟踪：人台移动时脏标记重算（绑 350ms 轮询或 store 订阅）。

### 4.4 骨骼旋转（V4）
- 姿势读自 **`node.directorExt.mannequins[id].pose`**（按 mannequinId 索引）。
- 复用 `applyPanoramaCharacterNaturalArmPose` 模式：`bone.quaternion.multiply(setFromAxisAngle(axis, angle))`。
- 部位→骨骼映射（§2.3 表）；每自由度 = (boneName, 轴, 角度范围)；**轴向逐部位浏览器目检标定**，出 `POSE_BONE_AXIS_MAP`。
- 预设 = 骨骼角度字典；细调 = 在预设基底上叠加。应用顺序：先重置骨骼到绑定姿势 → 套预设 → 叠细调。

### 4.5 全景球参数（V2）
- 球参数读自 **`node.directorExt.panoramaSphere`**（`yawOffset`/`radiusScale`），天空色读自 `node.directorExt.environmentSkyColor`。
- 水平旋转 → `dome.rotation.y = yawOffset`（backdrop 已用 -π/2 基准，叠加 yawOffset）。
- 半径 → backdrop `BACKDROP_RADIUS * radiusScale` 重建；grounded 穹顶半径同理；原生 60m 球 `geometry.scale` 或重建（验证）。
- 天空色 → `scene.background = new THREE.Color(skyColor)`（无全景时）；有全景时背景=全景，天空色仅球外/边缘。

### 4.6 添加到画布（V3，**spike 修正——事实4**）
- ⚠️ `capturePanoramaSceneViewport({nodeId,captureViewport,captureBlob,storeInstance})` **只回调 blob、不创建画布节点**。
- 「添加到画布」需自行创建图像节点：
  1. 取截帧 blob（→ object URL 或上传得 URL）。
  2. 布局：`createBatchSpawnLayoutNearNode(currentSceneNodeId, count=1, ...)`（`modules/nodeSpawn.js`）算出邻近落点坐标。
  3. 落节点：`store.addNode({ type:'ai-image'|'source-image', position, data:{ imageUrl/blobUrl, ... } })`。
- **参考实现**：八机位批量出图 `modules/panoramaSceneNode/characterShotActions.js`（已用同一 `createBatchSpawnLayoutNearNode` + `store.addNode` 模式批量落节点）。

---

## 5. 各版实现分解

### V1（~1.5d）
1. `DirectorChrome.js` 扩：`ASPECT_PRESETS`、`deriveAspect(node)`（读 `node.directorExt.aspect`，默认 `'adaptive'`）、`TRANSFORM_MODES`、`deriveTransformMode(sceneState)`；`buildMannequinPosePatch` 扩三轴旋转（已是完整 pose，加 rotX/rotZ case）。
2. autoload 扩：底部「安全框」按钮挂比例浮层（选中写 `store.updateNodeData(nodeId,{directorExt:{aspect}})`）+ **UI 自绘安全框遮罩层**（按 aspect 内接框 + 框外压暗，§4.1，**不写 capture.mode**）；「变换」挂模式浮层 + V/R/S 快捷键监听（导演台聚焦时）；检查器旋转改三轴行。
3. 测试：扩 D 系列（aspect 派生/变换模式/三轴 patch 完整性）；浏览器目检比例安全框宽高比（16:9±1px）+ V/R/S 切 gizmo + 比例落 directorExt（保存重载存活、capture.mode 始终 adaptive）。
4. 样式：theme-upgrade.css 加比例网格卡 + 变换菜单键帽（**中性灰 token**）。

### V2（~2d）
1. `sceneGlobalInspector.js`：`deriveSceneGlobal(node)`（场景变换读 sceneState；全景缩略读 sceneState.panorama；天空色/球参数读 **`node.directorExt`**；开关）。
2. `panoramaEnvironmentRuntime.js` 扩：`applySkyColor`、`applySphereParams(radiusScale,yawOffset)`；从 **`node.directorExt`** 读取消费。
3. `panoramaBackgroundSource.autoload.js`：背景源菜单（本地上传→`uploadPanoramaSceneImage`；历史→近期全景；**AI生成→复用 `modules/createPanorama360FromImageNode.js` 的 `createPanorama360FromImageNode` / panorama-360 节点，已存在，事实5**）。
4. autoload：空选中渲染"3D场景"检查器；写回走 `store.updateNodeData(nodeId,{directorExt:{...}})`。
5. 测试：**首步真机验证 `node.directorExt` 保存→重载存活**（spike 已高置信，仍验一次）；E 系列扩天空色/球参数；目检。

### V3（~2.5d）
1. `cameraInspector.js`：`deriveCameraInspector`（注视读 **`node.directorExt.cameras[id]`**）、`fovSliderModel`、`resolveLookAtQuaternion`。
2. `cameraThumbnail.js`：复用 bridge renderer 离屏渲染机位取景小图（脏标记缓存）。
3. autoload：机位检查器（属性 tab + 摄像机截图 tab）；**「加到画布」≠ 截帧 action**——截帧 `capturePanoramaSceneViewport` 只回 blob，节点创建另接 `createBatchSpawnLayoutNearNode`+`store.addNode`（§4.6，事实4，参考 `characterShotActions.js`）。注视写回走 `store.updateNodeData(nodeId,{directorExt:{cameras:{...}}})`。
4. 测试：FOV 换算/look-at 求解纯逻辑；目检机位编辑/跟踪/「加到画布」真落图像节点。

### V4（~4.5–6d，含 +50% buffer：骨骼轴向标定反复）
1. `characterPosePresets.js`：`POSE_PARTS`（部位→骨骼+自由度）、`POSE_PRESETS`（20×骨骼角度）、`POSE_BONE_AXIS_MAP`。
2. `characterPoseRuntime.js`：`applyPose(model, poseDict)`（重置→预设→细调叠加）；姿势读自 **`node.directorExt.mannequins[id].pose`**，写回走 `store.updateNodeData(nodeId,{directorExt:{mannequins:{...}}})`。
3. autoload：姿势 tab（预设网格 + 部位折叠组滑杆）。
4. 标定：浏览器逐部位目检轴向/正负，填 AXIS_MAP；20 预设逐个调自然（**标定反复=工期 buffer 主因**）。
5. 测试：预设表完整性/部位映射/角度范围；目检每姿势 + 多角色 pose 独立 + 保存重载存活。

### V5（~2d）
1. `viewCube.js` + autoload：方位立方体（CSS 3D），点面→`applyPanoramaSceneViewCommit` 设正交 yaw/pitch；「重置视角」→`resetPanoramaSceneView`。
2. `characterLibrary.js`：库网格 + 上传 GLTF 注册（校验骨骼名匹配姿势系统）。
3. Warp 全量走查（色/圆角/影/字 token 实测）。

---

## 6. 测试约定（沿用本系列）

- **纯逻辑（L3）**：根目录 `*.test.js`，`node:test`，零 DOM，覆盖派生/patch/换算/边界；命名跟随既有（如 `panoramaDirectorChrome.test.js`）。
- **浏览器目检**：新预览实例 + 导航 8777 + 单次加载 + 一次性断言（reload 后渲染管线易僵死）；状态对账（store ↔ UI）+ 截图。
- **回归**：每改不破坏既有 panorama 全家桶（environment/edgeSync/shot/chrome/assets）。
- **门**：纯逻辑全绿 + 目检通过 + Warp token 实测 + 回归 0 退化。

---

## 7. 已知陷阱清单（开发必读）

| 陷阱 | 现象 | 规避 |
|---|---|---|
| **sceneNode 封闭剥字段** | 挂 sceneNode 的新字段被 normalize 丢弃 | ✅ **新状态一律 `node.directorExt`（节点级旁路，spike 定案）**，经 `store.updateNodeData` 合并；首步真机验存活 |
| **capture.mode 不承载比例** | 写 `'16:9'` 被重置回 `'adaptive'` | ✅ 比例存 `node.directorExt.aspect`，安全框 UI 自绘（§4.1） |
| **「添加到画布」职责** | 误以为截帧 action 落节点 | ✅ 截帧只回 blob；节点另接 `createBatchSpawnLayoutNearNode`+`store.addNode`（§4.6，事实4） |
| 部分 pose 重置 | 改一字段其他归零 | 始终发完整 pose（buildMannequinPosePatch 已修） |
| 轮询闭包陈旧 | 编辑误用旧值 | change 时从 store 实时重取 fields |
| 全屏传送门 | UI 找不到 nodeId | shell.dataset 戳记 |
| 混淆文件 UTF-8 无 BOM | PS GBK 读写毁中文 | `[IO.File]::ReadAllText/WriteAllText(UTF8)` 或 node 读写 |
| 非均匀缩放渲染 | vec3 scale 可能无效 | 默认统一缩放，三轴标实验 |
| 预览浏览器僵死 | eval 正常但不渲染 | 换新实例 |
| 双 server 实例 | 8779 卡 loader | 验证用已运行的 8777 |

---

## 8. 回退

每功能 = 新模块 + autoload + theme-upgrade.css 区块（+ 极少数混淆文件 seam 留 `.bak`）。回退 = 删新文件 + index.html 对应 `<script>` + CSS 区块（+ seam 还原）。混淆核心零改动，git diff 全可逆。
