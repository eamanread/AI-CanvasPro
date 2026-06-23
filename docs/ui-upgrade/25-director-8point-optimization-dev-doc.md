# 25 · 3D导演台 8 项优化 — 需求&开发文档

> 流程约定（用户要求）：**先确认代码真实情况 → 提问确认需求 → 再出本开发文档**。
> 本文每点均经「读真实代码（含 git 历史）」核查，并经一轮 AskUserQuestion 确认需求。
> 日期 2026-06-17。分支 `feature/codex-work-20260609`。核查方式：5 个只读 Explore 子代理 + 直接读码 + 真单例浏览器核查。
> ⚠ 本地 git 对象库存在已知损坏（见记忆 huanying-git-object-corruption），部分历史溯源受限，已在相应点标注。

---

## 0. 总览

| # | 优化点 | 需求确认 | 代码真相 | 类型 | 优先级 |
|---|---|---|---|---|---|
| 1 | 相机移动/旋转/缩放 | **移动+旋转,禁止缩放** | 相机仅有「位置」(移动),无旋转、无缩放项 | 补能力 | P1 |
| 2 | 全屏隐藏输入框 dock | 全屏时隐藏 | dock z6200 > 全屏 6000 → 全屏时反而盖在上层显示 | 小改 | P0 |
| 3 | 偶现旧工具栏 | 不该出现 | 原生 `.panorama-scene-fixed-toolbar` 靠内联style+CSS`:has()`隐藏,与React重渲存在竞态 | 修Bug | P1 |
| 4 | 方向键移动 | **完全没反应→修运行时** | 代码完整且git证明未被合并删;是运行时门控/事件未达 | 修Bug | P1 |
| 5 | 视野角度 FOV | **仍不能用→修复**(机位不变,放大/缩小视野) | 只在机位视角生效;桥按焦距镜像渲染,疑似改FOV无效或变成推拉镜头 | 修Bug | P1 |
| 6 | 截图含相机 | 截图不要相机 | 截图仅清人偶/立方体选中去gizmo,**未隐藏相机标记** | 修Bug | P2 |
| 7 | 截图天空色不变 | 应跟随天空色 | 天空色设在 `scene.background`,截图读canvas;疑似 renderer clearColor 未同步 | 修Bug | P2 |
| 8 | 黑夜/白天 | **做完整切换**(UI+真实光照) | 仅有 `environmentMode` 字段(默认night),UI与光照效果从未接线(设计过没做完,非被删) | 新功能 | P2 |

P0=立即低风险；P1=核心交互；P2=截图/环境增强。

---

## 1. 各点详述

### 点1 · 相机：可移动+旋转，禁止缩放
**需求**：导演视角选中相机时，像人偶一样可上下左右移动 + 旋转；但**不能改变自身大小**（无缩放）。

**代码真相**（`components/panoramaScene/DirectorChrome.js` `deriveCameraInspector`，`modules/panoramaDirectorChrome.autoload.js` renderInspector 相机分支 ~L760-814）：
- 相机检查器字段：`position`(X/Y/Z) ✓、`focalLength/fovDeg`、`lookAtTarget/lookAtPoint`。
- **无 `rotation` 字段**（人偶/立方体有，见 DirectorChrome.js mannequin/cube 分支）。
- **无 `scale` 字段**（人偶/立方体有「统一缩放」`sliderRow`，相机没有）。
- 相机当前朝向由 position + lookAtPoint（注视点）隐式决定，不是欧拉旋转。
- 3D 拖拽 gizmo 是否给相机挂了缩放档：在混淆 `scene3dBridge` 中，**未确认**（待真机核查）。

**差距/方案**：
1. **移动**：已具备（位置字段）。如 3D gizmo 未给相机 translate 档，则补 translate。
2. **旋转（新增，确认走 3D 拖拽手柄，不做检查器旋转数值）**：
   - 在桥层给「选中相机」启用 **rotate 档变换手柄**（与人偶一致）；scene3dBridge 混淆，**需真机确认如何按对象类型开 rotate / 关 scale**。
   - 手柄旋转 → 写 `ext.rotation`（新增 `cameraRotationPatch`），并把 `lookAtTarget` 切为 `manual/free`、由「位置+旋转」推算 lookAtPoint，使相机按旋转重新瞄准（**机位不动，只转朝向**）。
   - 检查器「注视目标」下拉在 `ext.rotation` 存在时**置灰禁用**（旋转优先，二者不打架）。
3. **禁止缩放**：检查器本就无缩放项（保持）；**核查并确保 3D gizmo 对相机不提供 scale 档**（若提供则按对象类型限制为 translate+rotate）。

**验证**：选中相机→检查器出现旋转三轴、调节后相机朝向变化而位置不变；无任何缩放控件/手柄；人偶仍 move/rotate/scale 三者齐全（不回归）。
**风险/待确认**：旋转与 lookAt 注视的交互语义（手动旋转后是否禁用「注视目标」下拉）；gizmo 是否存在缩放档需真机看。

---

### 点2 · 全屏时隐藏底部输入框 dock
**需求**：进入导演台全屏（`.panorama-scene-browser-fullscreen`）时，底部节点输入框 dock 隐藏。

**代码真相**：`syncScriptDock`（autoload L1567-1579）按 `resolveDockNodeId()`（选中导演台节点）显隐 dock；dock 外壳 `.hy-dc-scriptdock` z-index **6200 > 全屏 6000**，故全屏态 dock 会浮在 3D 编辑器之上显示（与需求相反）。`selectedNodeIds` 在全屏时仍指向该节点（无清除），故 dock 一直显示。

**方案**（最小改，`syncScriptDock`）：
```js
const inFullscreen = [...document.querySelectorAll(SHELL_SELECTOR)]
  .some((s) => s.closest(FULLSCREEN_SELECTOR));
if (!targetId || inFullscreen) { /* 隐藏 dock */ return; }
```
**验证**：画布点选导演台→dock 浮出；双击进全屏→dock 消失；退出全屏→dock 恢复。
**风险**：低。注意「内联编辑态(非全屏 shell)」是否也要隐藏——按需求只点名「全屏」，内联态保留（待用户确认是否一并隐藏）。

---

### 点3 · 偶现旧工具栏
**需求**：进入 3D 导演台时不应再出现原生旧工具栏（附件图1顶部那条）。

**代码真相**：原生工具栏 `.panorama-scene-fixed-toolbar`（`components/panoramaScene/PanoramaSceneBottomToolbar.js`，React/混淆渲染）。隐藏靠两路：
- 内联 `style.display="none"`（`setNativeFullscreenUiHidden` autoload L144），由 350ms 轮询触发；
- CSS `.panorama-scene-shell:has(.hy-director-chrome.is-visible) .panorama-scene-fixed-toolbar{display:none!important}`（theme-upgrade.css ~L1900）。
**根因**：React 重渲该工具栏的时机与「350ms 轮询设内联 style」「`:has()` 选择器重算」**异步竞态**——React 在两次轮询间重建/更新该元素、内联 style 被清，`:has()` 尚未重算 → 短暂可见（偶现）。
> ⚠ 附件图1 是**顶部**工具栏；子代理定位到的是 `-fixed-toolbar`（命名偏底部）。实施前**先真机确认图1那条的确切 class**（可能存在顶/底两条或同元素不同定位）。

**方案**：用 MutationObserver 钉死隐藏（最稳）：
```js
// 对每个 shell 内的原生工具栏挂 observer，attributes:["style"] + childList，
// 一旦出现/被重置即重新 display:none（仅当该 shell 的 chrome.is-visible）
```
辅以强化 CSS（提高特异性/覆盖 inline）。
**验证**：反复进出全屏、快速切换视角/触发重渲，旧工具栏不再闪现。
**风险**：需确认 observer 目标元素稳定（React 可能整体替换节点 → observe 父容器 childList）。

---

### 点4 · 方向键移动（完全没反应 → 修运行时）
**需求**：机位视角选机位→方向键移动机位/画面；选角色→方向键移动人偶。**功能此前已开发，本次只修不重做。**

**代码真相**：handler **完整存在**（autoload L1675-1718，三分支：选人偶移人偶 / 机位视角移机位 / 导演视角平移注视点）。git 证明首次提交 `34b3e0cb` 即齐全、未被合并删除。门控：
- L1677 焦点守卫：`activeElement` 是 INPUT/TEXTAREA/SELECT 即 `return`；
- L1681 `activeDirectorContext()`：要求存在 `.panorama-scene-shell` 内含 `.hy-director-chrome.is-visible`（`syncOnce` L1637 对任意挂载的 shell 都会加 is-visible，故编辑器开着时应可得 context）。

**「完全没反应」的运行时疑因（需真机逐一排除）**：
1. **方向键被 3D 画布/轨道控制在 document 之前 `stopPropagation`** → document 级 keydown 收不到（最可疑：handler 挂在 `document`，子级若拦截则不触发）。
2. **焦点被输入框占用**：新底部 dock 含 textarea；若全屏时 dock 仍显示(见点2)且被聚焦 → L1677 直接 bail。修点2后缓解。
3. **双导演台节点时 `activeDirectorContext()` 取第一个带 is-visible 的 shell** → 可能解析到非当前编辑的节点 → 操作落到别的场景，当前画面"无反应"。
4. 桥层轨道控制器接管方向键做自身平移/旋转并吞事件。

**方案**：
- 先**插桩诊断**（临时 log：handler 是否进入、`activeDirectorContext` 是否为 null、event 是否到达），定位真因；
- 据真因修：大概率改为**在 shell 上以捕获阶段(`capture:true`)监听 keydown**（早于桥控制器），或 window 级 + 明确目标 shell 解析（修 multi-node）；
- 修点2后排除 dock 抢焦点。

**验证**：编辑器内（机位视角）选机位按方向键→画面平移；选人偶→人偶走动；导演视角→视角平移。双节点各自独立。
**风险**：捕获阶段监听可能与桥控制器冲突，需保证只在 chrome 可交互态拦截方向键。

---

### 点5 · 视野角度 FOV（仍不能用 → 修复）
**需求**：FOV = **机位位置不变**的前提下，放大/缩小视野（镜头变焦，非推拉镜头）。数值低=更聚焦/更近，高=更广。目前仍有问题，需修复。

**代码真相**：FOV 滑杆 autoload L806-813 → `cameraFovPatch` + `writeDirectorExt(focal)` + `setCameraFocalLength`(同步 sceneNode) + `maybeApplyCameraView`。
- `maybeApplyCameraView`（L971-978）：**仅当 `getViewMode==="camera"`（机位视角）才生效**；非机位视角调 FOV 无任何画面变化。
- 机位视角下：`buildCameraSceneView`→`cameraOrbitFromLookAt({position,lookAtPoint,focalLength})`→`applyPanoramaSceneViewCommit`。
- 桥层渲染 orbit 视角的 FOV 来自 `bridge._defaultSceneFocalLength`（由 runtime `syncSceneViewFocalLengthWith` 镜像 sceneView.focalLength）；`resolveSceneCameraPose` 据反映焦距/orbitDistance 定位。

**疑因（需真机核查二选一/兼有）**：
- (a) **作用域**：用户在导演视角选中相机调 FOV → maybeApplyCameraView 直接 bail（看似"没用"）。UX 上 FOV 滑杆出现在相机检查器（导演视角也能选相机），却只在机位视角起效 → 困惑。
- (b) **变焦 vs 推拉**：若 `cameraOrbitFromLookAt` 的 `orbitDistance` 随 focal 变化 → 改 FOV 实际是**移动相机(推拉)**，违反"机位不变"；或桥层仅按 focal 改 distance 而非改视场角 → 看不到预期变焦。

**方案**：
1. 真机确认 (a)(b) 哪条成立（机位视角下拖 FOV，观察是相机位移还是视场角变化、画面是否变）。
2. 修复目标：在机位视角下，FOV 改变**仅改视场角**（lens zoom），相机 position/lookAt 不动；导演视角下选相机调 FOV 给出明确反馈或暂置灰提示"仅机位视角生效"。
3. 校验 `cameraOrbitFromLookAt` 不因 focal 改动 orbitDistance；桥层 `_defaultSceneFocalLength` 镜像确实改变渲染 FOV。
**验证**：机位视角下拖 FOV，相机不动、画面变窄/变宽；单测覆盖换算与"不改 distance"。
**风险**：此区历史多次返工（焦距/FOV/水平vs垂直）；务必真机逐帧确认，勿凭推断改。

---

### 点6 · 截图不要相机
**需求**：截取站位图时，画面里若有相机标记（机位 gizmo/标记），不要截进去。

**代码真相**：`captureWithAspectToCanvas`（autoload L883-899）截图前**仅**清除人偶/立方体选中态（去 transform gizmo），等两帧再 `captureCameraDataUrl`(canvas.toDataURL)。相机标记由 `bridge._cameraMap` 在 THREE 场景中常驻，**截图未隐藏**。对照：人偶标签 `__hyLabelLayer`、地面网格在渲染前有 visible/opacity 门控（runtime），可循此例。

**方案**（`captureWithAspectToCanvas`）：截图前遍历 `bridge._cameraMap`，记录并置 `group.visible=false`；toDataURL 后恢复原 visible。需拿到 shell 对应的 bridge 引用（与 runtime 同源）。
**验证**：场景含 ≥1 机位，截图结果不含相机标记；截后相机标记恢复显示。
**风险/待核查**：相机可视体在 `_cameraMap` 中的结构（group/mesh/sprite）；与点2/点1 gizmo 隐藏不冲突。

---

### 点7 · 截图天空颜色不跟随
**需求**：修改天空颜色（`environmentSkyColor`）后，截图应呈现新颜色。

**代码真相**：`applyDirectorSphereParamsWith`（runtime L502-508）把天空色写入 `scene.background`(THREE.Color)。截图 `captureCameraDataUrl`(L831-839) 直接 `canvas.toDataURL`（`preserveDrawingBuffer:true`）。
**疑似根因**（混淆桥层，**待真机验证**）：`scene.background` 已更新，但 **WebGL renderer 的 clearColor 未随之 `setClearColor` 同步**，或截图走的渲染路径未实际把 background 画进绘制缓冲 → toDataURL 取到旧/默认底色。

**方案**：
1. 真机验证：改天空色后**屏幕实时**是否已变（若屏幕变、仅截图不变 → 截图路径分歧；若屏幕也不变 → applyDirectorSphereParams 未生效）。
2. 据验证修：大概率在设天空色处同步 `renderer.setClearColor(scene.background,1)`；或确保截图前一帧用当前 background 实渲。
**验证**：改天空色 → 截图底色随之变；连了 360 全景时不受影响（以全景为底）。
**风险**：clearColor 同步为推断，必须先验证真因再改。补单测：`panoramaEnvironmentRuntime.test.js` 增「设天空色→background 等于该色」断言。

---

### 点8 · 黑夜/白天（做完整切换）
**需求**：做完整白天/黑夜切换——**UI 切换 + 真实光照/色调变化**（白天亮、黑夜暗）。

**代码真相**：`sceneNode.environmentMode`('day'|'night'，默认 night) **字段存在**（`normalizeEnvironmentMode`），但：
- `DirectorChrome.js` `deriveSceneGlobal`（L474-498）**不暴露** environmentMode；
- autoload 「3D场景」面板**无切换 UI**；
- runtime **零消费**（无任何按 environmentMode 调光照的代码）。
- 文档 11/13/14 设计过该项（含 `setPanoramaSceneEnvironmentMode` API），**实现止步于字段定义**（非被删；本地 git 损坏无法完全溯源，但当前三层 UI/runtime 均缺）。

**方案**（三层补齐）：
1. **逻辑层** `DirectorChrome.js` `deriveSceneGlobal`：输出 `environmentMode: state.environmentMode || 'night'`。
2. **UI 层** autoload「3D场景」面板（天空颜色一节附近）：加「白天/黑夜」分段切换；点击 → `setPanoramaSceneEnvironmentMode`（action 已在文档设计，确认/补实现）。
3. **runtime 层** `panoramaEnvironmentRuntime.js`：新增 `applyEnvironmentModeWith(bridge, scene, ext)`，在 `syncPanoramaEnvironment` 内调用——
   - `day`：提高环境光/方向光强度、中性/暖色调、整体提亮；
   - `night`：降低强度、冷/暗色调（当前默认偏暗即近 night）。
   - **固定两档预设，不加强度调节滑杆**（已确认）；预设值在代码内给一组合理默认。
**验证**：切白天→画面明显变亮/暖；切黑夜→变暗/冷；状态随节点持久化；截图反映当前模式（与点7联动）。
**风险**：与全景 IBL 光照估计的叠加关系（是覆盖强度还是叠加）；需定义 day/night 不破坏已连全景的观感。

---

## 2. 实施顺序建议（分组、低耦合优先）

1. **批次A（低风险小改，先做）**：点2（全屏隐藏 dock）、点6（截图去相机）。
2. **批次B（截图/环境）**：点7（天空色截图，先真机验真因）、点8（黑夜白天，三层）。
3. **批次C（核心交互，需真机诊断）**：点4（方向键，先插桩定位）、点5（FOV，先真机判 a/b）。
4. **批次D（补能力）**：点1（相机旋转+禁缩放，依赖 gizmo 真机核查）。
5. **点3** 贯穿：定位图1确切元素后用 MutationObserver 收口（可并入批次A）。

> 凡标「需真机核查/诊断」的（1 gizmo、4 门控、5 a/b、7 真因、3 元素），**实施前先用 Chrome 扩展在 127.0.0.1:8777 真机确认，再改码**——不凭推断落键。付费按钮（生成站位）仍由用户亲点。

## 3. 验证总清单
- 单测：FOV 换算&"不改distance"(点5)、天空色→background(点7)、相机旋转 patch(点1)、environmentMode 派生(点8)。
- 真机（Chrome 扩展，真单例 `import('/src/core/stores/appStore.js')` 无 `?v=`）：逐点交互核查 + `getBoundingClientRect` 实测，改 CSS 热替换 `<link>`、改 JS 整页 reload。
- 截图类（6/7）：因 3D 视口 CDP 截图会冻结，用 DOM/状态读 + 必要时由用户截图核对。

## 4. 需求确认结论（2026-06-17 已锁）
- **点2**：仅**全屏隐藏** dock；内联编辑态 + 画布选中均保留显示。（与 §1 点2 方案一致：`inFullscreen` 用 `.panorama-scene-browser-fullscreen` 判定，内联 shell 不命中。）
- **点1**：相机旋转**必须用 3D 拖拽手柄(gizmo)**，不走检查器数值；**手动旋转后「注视目标」切手动/自由并置灰禁用**（旋转优先）；禁止缩放不变。
- **点8**：白天/黑夜**固定两档预设**（各一组光照+色调），**不提供强度调节**。

> 8 项需求至此 100% 锁定，可进入实施。
