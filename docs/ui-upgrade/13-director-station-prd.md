# 幻映 3D 导演台 · 产品需求文档（PRD · V1–V5）

| 项 | 值 |
|---|---|
| 版本 | **PRD v1.1（spike 修正）** |
| 最后修订 | **2026-06-12** |
| **单一真相源（SoT）** | **本文档 = 范围/PRD SoT**。功能清单 SoT=`11-...full-feature-spec.md`；实现 SoT=`14-...dev-doc.md`；`12-...design-plan.md` **已退役**（UI 细则并入 13/14，仅留历史草稿）。 |
| 规划编号 | **唯一规划编号 = V1–V5**。已交付基线（原 P0–P2 任务批次）统一记作 **"V0 基线"**；doc11 §12 的 P0–P7 已 superseded（见该文 P↔V 映射表）。 |
| 视角 | 资深产品 —— 基于**代码真实状态 + spike 实测** + **竞品目标**，不写悬空功能 |
| 设计基准 | Warp DESIGN.md（[S6] **中性灰**，已落地 `theme-upgrade.css`） |
| 布局基准 | 竞品 6 张截图（未选中/角色属性/角色姿势×2/机位视角/底部工具栏） |
| 工程约束 | 全部新模块 + autoload + theme-upgrade.css，**不碰混淆核心**；每功能独立可回退 |
| 前置文档 | `11-...full-feature-spec.md`（功能逆向，功能清单 SoT）、`12-...design-plan.md`（**已退役**草案） |

---

## 0. v1.1 勘误（spike 修正）⚠️ 推翻旧假设

> 本节列出 spike 实测推翻的旧假设。**全文新状态落点、取景比例机制、"添加到画布" 流程、AI 生成全景路由均以本节为准**；与早期草案（doc12/PRD v1.0）冲突处一律以此为准。

| # | spike 实测事实 | 推翻的旧假设 | 现行裁决 |
|---|---|---|---|
| 1 | `sceneNode` 是**封闭 schema**：`normalizePanoramaSceneState` 白名单化，**剥离一切未知字段**。实测顶层 `environmentSkyColor/panoramaSphere/directorExt`、`camera.lookAtTarget/lookAtPoint`、`mannequin.pose/posePresetKey` **全部被丢弃**；`capture.mode='16:9'` 被**重置回 `'adaptive'`**（capture.mode 也是白名单枚举）。 | "新字段挂 sceneNode 即可持久化"；"capture.mode 可扩枚举承载比例" | 新状态**禁入 sceneNode**；比例不走 capture.mode |
| 2 | 新状态必须放**节点级 `node.directorExt`（与 sceneNode 同级）**。依据：持久化迁移 `_migratePanoramaNodeInPlace` 只转换 sceneNode/panorama360Node、**不剥离 node 级其他字段**；运行时 `store.updateNodeData` 合并保留 node 级字段。 | "所有导演台状态都在 sceneNode 内" | 一切新状态 → `node.directorExt.*`（跨保存持久化高置信存活，实现时再验） |
| 3 | **取景比例不能用 `capture.mode`**（whitelist 拒绝新值）。 | "比例 = capture.mode 扩枚举 + 桥安全框" | 比例存 `node.directorExt.aspect`；安全框由 **UI 层自绘遮罩**（不依赖桥 capture 安全框做比例） |
| 4 | **"添加到画布"**：`capturePanoramaSceneViewport({nodeId,captureViewport,captureBlob,storeInstance})` **只回调 blob、不创建节点**。 | "截帧 action 顺带落画布节点" | 需另接图像节点创建：复用 `modules/nodeSpawn.js` 的 `createBatchSpawnLayoutNearNode` + `store.addNode` 落 ai-image/source-image 节点（参考八机位 `characterShotActions.js` 批量出图） |
| 5 | **AI 生成全景**：`modules/createPanorama360FromImageNode.js` 导出 `createPanorama360FromImageNode` **已存在**；背景源 "AI生成" 路由到 panorama-360 节点的生成能力。 | "AI 全景管线待建" | 背景源 "AI生成" → 复用 `createPanorama360FromImageNode` / panorama-360 节点生成 |

---

## 1. 背景与目标

### 1.1 背景
幻映 3D 导演台（`panorama-scene` 节点）已具备完整 3D 内核（人台/机位/变换 gizmo/截帧/连线全景），但 UI 停留在"摆台工具"。竞品已是**轻量虚拟制片台**（场景树 + 上下文检查器 + 姿势系统 + 取景比例 + AI 全景）。代码核对显示：**竞品功能约 85% 可直接映射幻映已有状态/action**，仅"角色姿势"为全新子系统。

### 1.2 目标
把导演台升级为**对标竞品的虚拟制片台**：用户能在 3D 场景里摆角色（含姿势）、布机位、按画幅取景、逐机位出帧喂分镜——形成"3D 摆位 → 取景 → 出图 → 分镜"闭环。

### 1.3 非目标（本期不做）
- 物理/碰撞、动画时间轴、灯光布光系统（仅全景 IBL + 主光）
- 多人协同、角色换装/捏脸
- 真实渲染级材质（人台为示意体）

### 1.4 成功度量
- 用户用真 2:1 全景 + 摆好姿势的角色，从某机位按 16:9 出一张可用分镜参考帧（端到端 < 2 分钟）
- 右检查器三态（场景/角色/机位）覆盖竞品全部字段
- 每版 Warp 设计走查 0 违规（色/圆角/影/字）

---

## 2. 现状基线（已交付，代码事实）

| 能力 | 落点 | 状态 |
|---|---|---|
| 全景地面两条路（2:1 穹顶 / 非2:1 背景幕+网格地面） | `panoramaEnvironmentRuntime.js` `resolveProjectionMode` | ✅ 已交付 |
| 导演/机位双视角切换 | `panoramaDirectorChrome.autoload.js` + `setPanoramaSceneSafeFrameVisible`/`activatePanoramaSceneCamera` | ✅ |
| 左场景树（机位+角色/搜索/选中联动） | `DirectorChrome.js` `deriveSceneTree`/`filterSceneTree` | ✅ |
| 右检查器·角色基础（位置XYZ/旋转Y/统一缩放/颜色块）、机位基础（名/焦距） | `DirectorChrome.js` `deriveInspector` | ✅ |
| 八机位速切（幻映独有差异化） | `characterShotPresets.js`/`characterShotActions.js` | ✅ |

**已知代码约束（PRD 必须尊重）**：
1. `updatePanoramaSceneObjectTransform` 收**部分 pose 会重置缺失字段**（只发 `{scale}` 会把 position 归零）→ 编辑务必发完整 pose（已修，D8 锁）。
2. `orbitPitch` 钳到 `±1.35rad(±77.3°)`，`focalLength ∈ [16,135]`，`orbitDistance ∈ [0.05,120]`。
3. 人台 `scale` 状态层接受 vec3 或标量；**非均匀缩放的桥渲染待验证**（V1 取保守=统一缩放优先）。
4. `environmentMode` 仅 `day/night`，**无任意天空色字段**（V2 新增）。
5. 全屏是 **shell 传送门**（搬到 body 级容器），UI 须挂 `.panorama-scene-shell` 并以 dataset 戳记 nodeId。

---

## 3. 数据模型总览（两层：封闭 `sceneNode` 旧状态 + `node.directorExt` 新状态）

> ⚠️ **状态扩展机制（v1.1 勘误，铁律）**：`sceneNode` 是**封闭 schema**——`normalizePanoramaSceneState` 白名单化，**剥离一切未知字段**（实测 pose/lookAtTarget/sky/sphere/`capture.mode='16:9'` 均被丢弃或重置）。因此**禁止**给 sceneNode 加新字段。**一切新状态走节点级 `node.directorExt`（与 sceneNode 同级）**：迁移 `_migratePanoramaNodeInPlace` 不剥离 node 级其他字段，`store.updateNodeData` 合并保留——可跨保存持久化（实现时再验）。

### 3.1 旧状态（封闭 `node.sceneNode`，只读消费，**勿加字段**）

```
sceneNode {
  version, mode('scene'|'panorama'), environmentMode('day'|'night'),
  viewport { activeView, activeCameraId,
    sceneView { target{x,y,z}, orbitYaw, orbitPitch, orbitDistance, focalLength? },
    panoramaView { yaw, pitch, fov } },
  panorama { localPath, imageUrl, fileName, sourceSignature, isLoaded, error },
  mannequins[] { id, gender, colorKey, position{x,y,z}, rotation{x,y,z}, quaternion, scale },
  cubes[], cameras[] { id, slot, name, position{x,y,z}, quaternion, rotation{x,y,z}, focalLength },
  selection { selectedObjectType, selectedObjectId, selectedObjects[], ... },
  groups[], gridPlacement{rows,cols,...},
  capture { pending, lastCaptureAt, error, mode('adaptive'), showSafeFrame },
                // ⚠️ capture.mode 是白名单枚举，写 '16:9' 会被重置回 'adaptive'，不可承载比例
  ui { mouseTool, transformTool('move'|'rotate'|'scale'), activeTool, transformSpace, pivotMode, ... }
}
```

### 3.2 新状态（节点级 `node.directorExt`，与 sceneNode 同级，所有 V1–V5 新字段落点）

```
node.directorExt {
  aspect: 'adaptive'|'21:9'|'16:9'|'4:3'|'1:1'|'3:4'|'9:16',   // V1 取景比例（安全框 UI 自绘）
  environmentSkyColor: '#hex',                                  // V2 天空色
  panoramaSphere: { radiusScale:number, yawOffset:rad },        // V2 全景球半径/水平旋转
  cameras: { <cameraId>: { lookAtTarget:'manual'|<mannequinId>, lookAtPoint:{x,y,z} } }, // V3 注视
  mannequins: { <mannequinId>: { pose:{ <bone>:{x,y,z} }, posePresetKey:string|null } }  // V4 姿势
}
```

**关键映射**：取景比例→`node.directorExt.aspect`（**不走 capture.mode**，安全框 UI 自绘）；变换模式→`ui.transformTool`（sceneNode 内既有枚举，可写）；全景球半径/旋转→`node.directorExt.panoramaSphere` 驱动渲染层（原生 60m 球 / backdrop rotation）；机位 FOV→`camera.focalLength`(换算，sceneNode 内既有)；注视→`node.directorExt.cameras[id]`；姿势→`node.directorExt.mannequins[id].pose`。

---

## 4. 设计语言（Warp，强制）

| 维度 | 规范 |
|---|---|
| 颜色 | canvas `#141414` / 面板 `#1b1b1b` / 浮层·输入 `#262626` / 发丝线 `#2e2e2e`·`#333` / 文字 `#f5f5f5`·`#c4c4c4`·`#a8a8a8` |
| 选中·主操作 | 中性白底填充 `rgba(255,255,255,.12)`，**禁彩色 accent**；语义色仅状态 |
| 形/影 | 圆角 按钮3 / 输入·卡4 / 大面板6；**禁投影**（层级=表面对比+发丝线）；胶囊只给图标容器与状态丸 |
| 字 | Inter 400/500（UI）；**DM Mono（一切坐标/角度/FOV/比例数值）**；Instrument Serif italic（空态/编辑性副标） |
| 浮层 | `#262626` + `1px #333` + 6px 圆角，无影，由触发按钮**上方**弹出 |
| 数值字段 | DM Mono、change(blur/回车)提交、聚焦期间不被轮询重渲打断 |

---

## 5. 全局信息架构

```
┌ 3D导演台 ───[导演视角|机位视角]──────────────────── ? ✕ ┐
│ 场景(左,固定)        视口 + ViewCube(右上)      检查器(右,上下文) │
│  🔍搜索              底部工具栏:                 ∅→3D场景         │
│  📷机位N             [选择|加角色|变换|加机位|    角色→[属性|姿势]  │
│  🧍角色N              安全框|截图|背景源|全屏]    机位→[属性|截图]  │
└──────────────────────────────────────────────────────────────┘
```
右检查器三态 = 整个产品的信息骨架；底部工具栏 = 创建/取景动作；左树 = 对象选取。

### 5.1 线框图 — 右检查器三态（布局参照竞品截图，色用 Warp 中性灰 token）

> 色标：面板底 `surface #1b1b1b`｜浮层/输入场域 `surface-raised #262626`｜发丝线 `hairline #2e2e2e/#333`｜主文字 `ink-1 #f5f5f5`｜次/弱文字 `#c4c4c4/#a8a8a8`｜激活白底 `rgba(255,255,255,.12)`。数值字段一律 DM Mono。

```
态①  ∅ 无选中 → 「3D场景」              态②  选角色 → 「角色」               态③  选机位 → 「摄像机」
┌─ 检查器 (surface #1b1b1b) ─────┐   ┌─ 检查器 (surface #1b1b1b) ─────┐   ┌─ 检查器 (surface #1b1b1b) ─────┐
│ 3D场景                         │   │ 角色B          [属性]│[姿势]  │   │ 机位3         [属性]│[截图]  │
│ ── 场景变换 ───────(hairline)  │   │ ── 属性 tab ──────(active白底) │   │ ── 属性 tab ──────(active白底) │
│  缩放  [ 300% ]──滑杆          │   │  位置 X[-1.46]Y[-2.4]Z[-2.63] │   │  ◳ 镜头预览  ┌──────┐ FOV50° │
│  平移  X[0] Y[0] Z[0]  (DMMono)│   │  旋转 X[0]  Y[90] Z[0]  ←三轴 │   │             │ 取景图 │ ⤢展开 │
│  旋转  X[0] Y[0] Z[0]          │   │  缩放 X[.94]Y[.94]Z[.94] +统一 │   │             └──────┘        │
│ ── 全景背景 ──────(hairline)   │   │  统一缩放 [ 1.9 ]──滑杆        │   │  机位下拉 [ 机位3 ▾ ]        │
│  ┌──┐ pano.jpg (缩略+名)      │   │  颜色  ■ #F75353 (只读块)     │   │  位置 X[9.66]Y[1.37]Z[2.76]  │
│  └──┘                         │   │                               │   │  注视目标 [ 手动坐标 ▾ ]     │
│  天空色 ■ [#060608] hex输入    │   │ ── 姿势 tab ───────────────── │   │  注视坐标 X[0] Y[1.2] Z[0]   │
│ ── 全景球 ──────(hairline)     │   │  [站立✓][T型][行走][跑步]      │   │  FOV  [ 50.0 ]──滑杆 (°/mm)  │
│  水平旋转 [ 0° ]──滑杆         │   │  [坐姿][蹲下][单膝跪][双膝跪]   │   │                              │
│  球半径   [ 60 ]──滑杆 ←60m球  │   │  …(4列×5行=20预设, 激活白底)   │   │ ── 截图 tab ───────────────  │
│ ── 全局开关 ─────(hairline)    │   │  ▸躯干 前倾[2]扭转[0]侧倾[0]   │   │  ┌─┐┌─┐┌─┐ 历史帧序列       │
│  角色标签 [开]  网格吸附 [开]  │   │  ▸头部 点头[-10]转头[0]…      │   │  └─┘└─┘└─┘                  │
│  (Warp 开关: 轨#333 / 开=白)   │   │  ▸肩(左/右) ▸肘(左/右) ▸髋…   │   │  [ + 添加到画布 ]            │
└────────────────────────────────┘   └────────────────────────────────┘   └────────────────────────────────┘
注：态①字段→viewport.sceneView(变换)/    注：旋转/缩放=三轴(V1)；姿势tab=V4，     注：注视目标/坐标=node.directorExt.
   panorama(只读) + node.directorExt        pose 存 node.directorExt.mannequins[id]    cameras[id]；截图tab「添加到画布」
   (天空色/球参数)。比例不在此, 在底栏。                                              另接 createBatchSpawnLayoutNearNode。
```

### 5.2 线框图 — 底部三个菜单（由按钮上方弹出，浮层 `#262626` + `1px #333` + 6px 圆角，无影）

```
底部工具栏: [▷选择] [🧍加角色] [⟲变换] [📷加机位] [⛶安全框] [📸截图] [🖼背景源] [⛶全屏]
                          │                          │                       │
            ┌─ 变换菜单 ──┴──┐        ┌─ 比例网格 ───┴────┐    ┌─ 背景源 ──┴───────┐
            │ ▷ 移动    [V] │        │ [Auto][21:9][16:9] │    │ ⬆ 本地上传    (?) │
            │ ⟲ 旋转    [R] │        │ [4:3 ][1:1 ][3:4 ] │    │ 🕘 历史记录        │
            │ ⤢ 缩放    [S] │        │ [9:16]             │    │ ✦ AI生成           │
            └────(active白底)┘        │ (选中白底; 每卡    │    │   "从一句话生成场景"│
            键帽: #1b1b1b 1px         │  56×40 内画幅缩略  │    │   (Serif italic 副)│
            hairline + DM Mono        │  框 + DM Mono 标签)│    └────────────────────┘
                                      └─→ 比例存 node.directorExt.aspect    背景源: 本地→uploadPanoramaSceneImage
                                          安全框 UI 自绘 (非 capture.mode)  历史→近期全景  AI→createPanorama360FromImageNode
```

---

## 6. V1 — 取景与变换（工期 ~1.5d）

> 目标：补齐"出图画幅 + 上手手感"。全是暴露已有状态，零新子系统，最高性价比。

### 6.1 功能点
| # | 功能 | 数据落点 | action | 验收 |
|---|---|---|---|---|
| F1.1 | **取景比例选择器** Auto/21:9/16:9/4:3/1:1/3:4/9:16 | **`node.directorExt.aspect`**（`'adaptive'`=Auto）；**不走 capture.mode**（whitelist 拒绝新值） | `store.updateNodeData` 写 `directorExt.aspect`；安全框由 **UI 层自绘遮罩** | 选 16:9 → 视口安全框宽高比 = 16:9±1px，画幅外压暗 60%；截图分辨率比 = 16:9 |
| F1.2 | **变换模式菜单 + 快捷键** 移动`V`/旋转`R`/缩放`S` | `ui.transformTool`（sceneNode 内既有枚举，可写） | `setPanoramaSceneTool`/既有 | 点菜单或按 V/R/S 切换；gizmo 随之换；当前模式高亮（激活态白底 `rgba(255,255,255,.12)`） |
| F1.3 | **角色三轴旋转** X/Y/Z(度) | `mannequin.rotation`（sceneNode 内既有，可写） | `updatePanoramaSceneObjectTransform`(完整 pose) | 改 X 角色绕 X 轴转、改 Z 绕 Z 轴转；提交后 position/scale 不变（不被归零） |
| F1.4 | 角色缩放：统一缩放（保守）+ 三轴(stretch) | `mannequin.scale`(标量/vec3，sceneNode 内既有) | 同上 | 统一缩放滑杆改值→三轴等比；三轴档需桥渲染验证，未过则仅统一 |

### 6.2 交互
- **比例**：点底部「安全框」→ 上方弹 7 项网格（图B）；选中即时改安全框；Auto=跟随视口宽高。
- **变换**：点「变换」→ 弹 移动/旋转/缩放（右侧键帽 V/R/S）；导演台聚焦时全局快捷键直切。
- **三轴旋转**：检查器「旋转」三轴并排，DM Mono，回车/blur 提交，始终发完整 pose。

### 6.3 UI（Warp）
- 比例浮层：`#262626`/`1px #333`/6px；7 卡 56×40（4px 圆角，内画幅缩略框 + DM Mono 标签）；Auto 含图标；选中白底。
- 变换菜单：行 36px，左图标 + Inter 名 + 右键帽（`#1b1b1b` 1px hairline，DM Mono 弱色）；激活白底。
- 三轴行：轴标 X/Y/Z（ink-3）+ `#262626` 4px 输入。

### 6.4 风险
- 三轴非均匀缩放桥渲染未验证 → V1 默认统一缩放，三轴标"实验"，渲染异常则回退。
- ✅ **取景比例落点已定（spike 修正）**：`capture.mode` 经实测**不可承载比例**（写 `'16:9'` 被 normalize 重置回 `'adaptive'`）→ **已转为** `node.directorExt.aspect` + **UI 层自绘安全框遮罩**（不依赖桥 capture 安全框做比例）。原 "capture.mode 扩枚举" 方案作废。

### 6.5 验收用例
- **AC-V1-1（比例安全框）**：选 16:9 → 视口安全框宽高比 = 16:9 ±1px；导出/截图分辨率比 = 16:9；切到 9:16 安全框立即转竖幅，画幅外区域压暗 ≈60%。
- **AC-V1-2（比例落点）**：选任意非 Auto 比例后，`node.directorExt.aspect` = 所选值；触发一次保存→重载，`directorExt.aspect` 仍在；`sceneNode.capture.mode` 始终 = `'adaptive'`（确认未被写入比例）。
- **AC-V1-3（变换快捷键）**：导演台聚焦时按 V/R/S → `ui.transformTool` 依次 = move/rotate/scale，gizmo 同步切换，当前模式按钮高亮（白底 `rgba(255,255,255,.12)`）。
- **AC-V1-4（三轴旋转不归零）**：改角色旋转 X=30 提交 → 角色绕 X 轴转 30°，且 `mannequin.position`、`mannequin.scale` 数值与提交前完全一致（部分 pose 重置陷阱已规避）。

---

## 7. V2 — 场景与背景（工期 ~2d）

> 目标：无选中时的"3D场景"全局检查器 + 全景背景三入口。多为暴露已有状态。

### 7.1 功能点
| # | 功能 | 数据落点 | 验收 |
|---|---|---|---|
| F2.1 | 场景缩放/平移/旋转 | `viewport.sceneView`(distance/target/yaw，sceneNode 内既有) | 改值视口整体缩放/平移/转 |
| F2.2 | 已连接全景图（缩略图+文件名） | `panorama.imageUrl/fileName`（sceneNode 内既有，只读） | 显示连线/上传的全景缩略与名 |
| F2.3 | **天空颜色**（球外/无全景背景色） | **`node.directorExt.environmentSkyColor`**（默认映射 day/night） | 取色 → 无全景时 `scene.background` 变该色；hex 输入与色块同步 |
| F2.4 | **全景球·水平旋转** 0–360° | **`node.directorExt.panoramaSphere.yawOffset`** → 渲染层 dome/球 `rotation.y` | 滑杆转全景对齐机位（0–360° 连续无跳变） |
| F2.5 | **全景球·球形半径** | **`node.directorExt.panoramaSphere.radiusScale`** → 渲染层球半径（原生 60m / backdrop） | 滑杆调包裹感/远近，全景不撕裂 |
| F2.6 | 角色标签 / 网格吸附 开关 | label 渲染 / `gridPlacement`（sceneNode 内既有） | 开关即时生效 |
| F2.7 | **全景背景源**：本地上传 / 历史记录 / AI生成 | upload / 历史索引 / **AI生成路由 `createPanorama360FromImageNode`**（事实5） | 三入口可达；上传复用已修 `uploadPanoramaSceneImage`；AI生成唤起 panorama-360 生成 |

### 7.2 交互
- 空选中 → 右栏"3D场景"，分区卡（场景变换 / 全景背景 / 全景球 / 全局开关）。
- 全景球半径/水平旋转滑杆实时反馈；天空色取色器（Warp 色块 + hex 输入）。
- 底部「背景源」→ 弹 本地上传(带?)/历史记录/AI生成（图F）；历史=近期全景网格；AI生成=唤起全景生成（**复用 `modules/createPanorama360FromImageNode.js` 的 `createPanorama360FromImageNode` / panorama-360 节点生成能力**，已存在，事实5）。

### 7.3 UI（Warp）
- 分区卡间发丝线分隔；缩略图 4px 圆角 + 文件名 DM Mono 截断；滑杆轨 `#333`、填充中性白、白握柄。
- AI生成项可带 Instrument Serif italic 副标"从一句话生成场景"。

### 7.4 风险
- ✅ **天空色/球参数落点已定（spike 修正）**：`environmentSkyColor`、`panoramaSphere` 均为新字段，**不入 sceneNode（会被剥离）→ 已落 `node.directorExt`**；桥从 directorExt 读取消费（无全景时 `scene.background` 设色；day/night 兼容映射两档默认）。
- 球半径实时改需桥支持动态半径（backdrop 已可重建；原生球需验证）。
- AI生成全景：✅ 路由已定，复用既存 `createPanorama360FromImageNode`（无需新建管线，事实5）。

### 7.5 验收用例
- **AC-V2-1（天空色）**：无全景连线时打开取色器选 `#3366ff` → `scene.background` 变蓝；`node.directorExt.environmentSkyColor='#3366ff'`；色块与 hex 输入同步；重载后仍生效。
- **AC-V2-2（全景球水平旋转）**：拖水平旋转滑杆 0→180° → 全景纹理绕 Y 轴转 180°，机位朝向对齐目标方位，过程无撕裂/跳变；`directorExt.panoramaSphere.yawOffset` = 对应弧度。
- **AC-V2-3（AI生成入口）**：底部「背景源」→「AI生成」→ 唤起 `createPanorama360FromImageNode` 流程（panorama-360 节点路径），生成结果回灌为当前场景全景源。

---

## 8. V3 — 机位系统（工期 ~2.5d）

> 目标：机位从"书签"升级为"虚拟机位"，闭环分镜。机位数据已含 position/quaternion/focalLength。

### 8.1 功能点
| # | 功能 | 数据落点 | 验收 |
|---|---|---|---|
| F3.1 | 镜头预览缩略图（FOV标注+展开） | 从机位离屏渲染（复用 bridge renderer） | 选中机位显示其取景小图 |
| F3.2 | 切换机位（下拉） | `activatePanoramaSceneCamera`（既有 action） | 下拉切换→视图跳该机位 |
| F3.3 | 机位位置 XYZ 编辑 | `camera.position`（sceneNode 内既有，可写） | 改值机位移动 |
| F3.4 | **注视目标**：手动坐标 / 角色 | **`node.directorExt.cameras[id].lookAtTarget`**（`'manual'`\|mannequinId） | 选角色→机位锁定看该角色(跟踪)，角色移动机位跟转 |
| F3.5 | 注视坐标 XYZ | **`node.directorExt.cameras[id].lookAtPoint`**（手动时生效） | 改值机位转向该点 |
| F3.6 | **FOV 滑杆** 16–135mm↔FOV | `camera.focalLength`（`focalLengthToFov` 换算，sceneNode 内既有） | 拖 FOV 改透视，双标 mm/° 同步 |
| F3.7 | 机位截图序列 + 添加到画布 | 截帧：`capturePanoramaSceneViewport`（**只回调 blob，不建节点**，事实4）；添加到画布：**另接 `createBatchSpawnLayoutNearNode` + `store.addNode` 落 ai-image/source-image 节点** | 每机位存帧；点"加到画布"→画布上新增图像节点（参考 `characterShotActions.js` 批量出图） |

### 8.2 交互
- 选中机位 → 右栏"摄像机"[属性|摄像机截图]。
- 注视目标下拉选角色 → 机位 quaternion 由 look-at(position→角色头部) 实时求解。
- FOV 滑杆显示双标（mm + °）。
- 「摄像机截图」tab 列该机位历史帧；底部「加到画布」当前帧入画布喂分镜。
  - **真实流程（事实4）**：`capturePanoramaSceneViewport` 仅产出 blob；「加到画布」需自行用 `modules/nodeSpawn.js` 的 `createBatchSpawnLayoutNearNode(nearNodeId,...)` 算布局 + `store.addNode` 落 ai-image/source-image 图像节点（blob→URL/上传），参照八机位 `modules/panoramaSceneNode/characterShotActions.js` 的批量出图实现。

### 8.3 UI（Warp）
- 预览图顶部叠 FOV 标（DM Mono）+ 右上展开图标；坐标三轴 DM Mono；下拉 Warp 制度。

### 8.4 风险
- look-at→quaternion 求解 + 跟踪需每帧更新（绑定 mannequin 移动）；性能用脏标记。
- 离屏渲染缩略图需复用桥 renderer（避免新建 WebGL 上下文）。
- ✅ **注视落点已定（spike 修正）**：`lookAtTarget/lookAtPoint` 不入 sceneNode（会被剥离）→ 落 `node.directorExt.cameras[id]`。
- ✅ **「添加到画布」职责已明确（事实4）**：截帧 action 只回 blob，节点创建另接 `createBatchSpawnLayoutNearNode`+`store.addNode`。

### 8.5 验收用例
- **AC-V3-1（FOV 换算）**：FOV 滑杆拖到 60° → `camera.focalLength = clampSceneFocalLength(fovToFocalLength(60))`（约 31mm），双标显示 `60° / 31mm`；超界值被钳到 [16,135]mm。
- **AC-V3-2（注视跟踪）**：注视目标选「角色A」→ 机位 quaternion 指向角色头部；拖动角色A位置，机位朝向实时跟随（脏标记重算）；`directorExt.cameras[id].lookAtTarget` = 角色A的 mannequinId。
- **AC-V3-3（添加到画布）**：某机位按 16:9 截一帧→点「加到画布」→ 画布上紧邻当前 panorama-scene 节点新增一个 ai-image/source-image 节点（由 `createBatchSpawnLayoutNearNode` 布局），节点图为该帧；`capturePanoramaSceneViewport` 本身不创建节点。

---

## 9. V4 — 角色表演 / 姿势系统（工期 ~4.5–6d，含 +50% buffer）⭐ 唯一全新子系统

> ⏱ **工期 buffer 说明**：原估 3–4d，因**骨骼轴向标定反复**（每部位需浏览器目检确认旋转轴/正负，且 20 套预设需逐个调到自然，标定常需多轮回炉），按 **+50% buffer** 上调至 **4.5–6d**。这是唯一计入 buffer 的版本。

> 目标：角色从静态站姿→可摆表演。代码已证可行：GLTF 含完整人形骨骼，`applyPanoramaCharacterNaturalArmPose` 已是骨骼旋转先例。

### 9.1 骨骼资产（已核实，GLTF 真实节点）
`pelvis` · `spine_01/02/03` · `neck_01` · `Head` · `clavicle_l/r` · `upperarm_l/r` · `lowerarm_l/r` · `hand_l/r`(+全手指) · `thigh_l/r` · `calf_l/r` · `foot_l/r`

### 9.2 功能点
| # | 功能 | 数据落点 | 验收 |
|---|---|---|---|
| F4.1 | **姿势预设 20 个** 站立/T型/行走/跑步/坐姿/蹲下/单膝跪/双膝跪/叉腰/倚靠/鞠躬/思考/格斗/踢球/投掷/推进/招手/伸手/抱臂/看手机 | **`node.directorExt.mannequins[id].pose`**（骨骼角度字典）+ `posePresetKey` 记录当前预设 | 点预设→角色摆该姿势 |
| F4.2 | **姿势细调** 滑杆，分部位左右对称 | 同上（在 pose 基底叠加，细调后 `posePresetKey`→null） | 拖滑杆→对应骨骼实时转 |
| | · 身体(整体) 前倾/转身/侧倾 → `pelvis`/`Armature` | | |
| | · 躯干 前倾/扭转/侧倾 → `spine_01/02/03` | | |
| | · 头部 点头/转头/歪头 → `neck_01`+`Head` | | |
| | · 手臂-肩(左/右) 前举/外展/扭转 → `clavicle`+`upperarm` | | |
| | · 肘部(左/右) 弯曲 → `lowerarm` | | |
| | · 腿部-髋(左/右) 前抬/外展/扭转 → `thigh` | | |
| | · 膝(左/右) 弯曲 → `calf`；踝 → `foot` | | |

### 9.3 交互
- 角色检查器「姿势」tab。点预设套骨骼角度（覆盖细调基底）；拖滑杆叠加微调。
- 姿势存 **`node.directorExt.mannequins[id].pose`**（按 mannequinId 索引），随节点持久化；切角色保留各自姿势。

### 9.4 UI（Warp）
- 预设：4 列网格按钮（小图标 + Inter 名），激活白底。
- 细调：分部位折叠组；每自由度一行（标签 + 滑杆 + DM Mono 值）；左/右用小丸标"左""右"。

### 9.5 风险
- 骨骼旋转轴/正负方向需逐部位标定（浏览器目检），出"姿势标定表"；**因标定反复，工期 +50% buffer（→4.5–6d）**。
- 预设 20 套角度需人工调出自然姿势（设计/美术介入）。
- 姿势叠加变换 gizmo 时的坐标空间（本地骨骼 vs 世界）需明确。
- ✅ **姿势落点已定（spike 修正）**：`pose/posePresetKey` 不入 sceneNode（会被剥离）→ 落 `node.directorExt.mannequins[id]`。

### 9.6 验收用例
- **AC-V4-1（预设套用）**：选「坐姿」预设 → 角色摆出坐姿；`directorExt.mannequins[id].pose` 写入对应骨骼角度字典，`posePresetKey='sit'`；重载后姿势保留。
- **AC-V4-2（细调叠加 + 解锁预设）**：在「坐姿」基底上拖「躯干-前倾」滑杆 +10° → 仅躯干骨骼叠加旋转、其余保持坐姿；`posePresetKey` 转为 `null`（已脱离纯预设）。
- **AC-V4-3（多角色独立）**：角色A摆坐姿、角色B摆站立 → 切换选中互不串改；各自 `directorExt.mannequins[idA/idB].pose` 独立存储。

---

## 10. V5 — 导航与资产（工期 ~2d）

### 10.1 功能点
| # | 功能 | 数据落点 | 验收 |
|---|---|---|---|
| F5.1 | **ViewCube** 方位立方体+三轴彩点 | 设 `sceneView.orbitYaw/Pitch` | 点面切前/后/左/右/上/下正交 |
| F5.2 | 重置视角 | `resetPanoramaSceneView` | 回默认机位 |
| F5.3 | 角色库（内置多体型/性别） | `addPanoramaSceneMannequin`(扩模型) | 库网格选→落角色 |
| F5.4 | 上传自定义角色 | 上传 GLTF + 注册 | 上传→入库可用 |
| F5.5 | Warp 一致性全量走查 | 全 UI | 色/圆角/影/字 0 违规 |

### 10.2 交互/UI
- ViewCube：右上 CSS 3D 或小 three 立方体；面 `#262626`+发丝边；三轴点用语义色（仅此处作方位辨识例外）；下方"重置视角"小字。
- 角色库：点「加角色」→ 弹库网格（图C）+ 上传入口（图D）。

### 10.3 风险
- 上传角色需骨骼名匹配姿势系统（否则姿势不可用）→ 上传时校验骨骼或仅允许变换。

### 10.4 验收用例
- **AC-V5-1（ViewCube 正交切换）**：点 ViewCube「前」面 → `sceneView.orbitYaw/orbitPitch` 设为正前正交值，视口切到正前视角；点「上」面切顶视（受 orbitPitch ±1.35rad 钳，无法到正 90° 时取最大俯角并提示）。
- **AC-V5-2（重置视角）**：任意视角下点「重置视角」→ 调 `resetPanoramaSceneView`，视口回默认机位。
- **AC-V5-3（Warp 走查）**：全 UI 实测：无 S5 暖炭色相残留（全部表面取 [S6] 中性灰）、无彩色 accent、无 box-shadow 投影；圆角 = 按钮3/输入·卡4/大面板6；数值字段用 DM Mono → 0 违规。

---

## 11. 风险登记册（汇总）

| 风险 | 影响 | 缓解 / 现状 | 版本 |
|---|---|---|---|
| **normalize 剥未知字段** | 新状态不持久 | ✅ **已转 `node.directorExt`**（sceneNode 封闭，新状态一律节点级旁路；高置信存活，实现首步再验） | 全程 |
| **`capture.mode` 不可承载比例** | 比例不生效 | ✅ **已转自绘**：比例存 `node.directorExt.aspect`，安全框 UI 层自绘遮罩（不用 capture.mode/桥安全框） | V1 |
| 部分 pose 重置缺失字段 | 编辑误清零 | 始终发完整 pose（已修+测试锁） | V1 |
| 非均匀缩放桥渲染未验证 | 三轴缩放可能无效 | 默认统一缩放，三轴标实验 | V1 |
| 天空色/球参数需桥消费 | 改色/半径无效 | 桥从 `node.directorExt` 读取（`scene.background` 接管天空色；球参数驱动 dome）；day/night 兼容 | V2 |
| 球半径动态改 | 半径无效 | backdrop 可重建；原生球验证 | V2 |
| look-at→quaternion + 跟踪性能 | 卡顿 | 脏标记 + 离屏渲染复用 renderer | V3 |
| **「添加到画布」非截帧 action 职责** | 截图不落画布 | ✅ **已明确**：`capturePanoramaSceneViewport` 只回 blob；另接 `createBatchSpawnLayoutNearNode` + `store.addNode` 落图像节点（事实4） | V3 |
| 骨骼轴向标定反复 | 姿势别扭、工期超 | 逐部位目检出标定表；**工期 +50% buffer（→4.5–6d）** | V4 |
| 上传角色骨骼不匹配 | 姿势不可用 | 上传校验/降级仅变换 | V5 |
| 全屏 shell 传送门 | UI 找不到节点 | dataset 戳记 nodeId（已落地） | 全程 |
| 预览浏览器易僵死 | 验证受阻 | 新实例+单次加载+一次性断言 | 全程 |

---

## 12. 验收与回退总则

- **每个功能**：纯逻辑 node:test 全绿 + 浏览器真机目检（截图/状态对账）+ 不破坏既有 panorama 套件回归。
- **每版**：Warp 设计走查（色/圆角/影/字 token 实测）；端到端用真素材跑通一条出图链。
- **回退**：每功能 = 新模块 + autoload + theme-upgrade.css 区块；删文件 + index.html 标签 + CSS 区块即整体恢复；混淆核心零改动。
- **不变量**：全景纹理不入 store；语义色仅状态；orbitPitch/focalLength/distance 走既有 clamp。

---

## 13. 路线图一览

| 版本 | 主题 | 核心交付 | 性质 | 工期 |
|---|---|---|---|---|
| V1 | 取景与变换 | 比例选择器 / 变换V·R·S / 三轴旋转 | 暴露已有 | 1.5d |
| V2 | 场景与背景 | 全局场景检查器 / 全景球参数 / AI生成入口 | 暴露已有+AI | 2d |
| V3 | 机位系统 | 机位检查器 / 注视目标 / FOV / 截图闭环 | 暴露已有 | 2.5d |
| V4 | 角色表演 | 20姿势预设 + 骨骼细调 | **全新子系统** | **4.5–6d**（含 +50% buffer，骨骼轴向标定反复） |
| V5 | 导航与资产 | ViewCube / 角色库上传 / Warp 走查 | 打磨 | 2d |

**总工期约 12.5–14 个工作日**（V4 计入 +50% buffer）；V1–V3（~6d）即可达竞品主体形态，V4 拉开表演力差异，V5 收尾。
