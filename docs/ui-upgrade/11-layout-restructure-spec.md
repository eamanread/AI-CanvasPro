# 幻映工作台 · 布局重构需求优化文档（控件迁移 / 抽屉改造 / 删悬浮栏）

日期：2026-06-12
模式：需求文档（未改代码）。批准后实施。
设计基准：项目根 `DESIGN.md`（强制）。机制延续 `styles/theme-upgrade.css` [S1]–[S6] 覆盖层。
勘察基础：8777 真机 DOM 实测（本文所有"现状"均经 getComputedStyle / 元素勘察验证）。

---

## 0. 需求澄清结论（苏格拉底问答 + 原始三需求）

| # | 你的确认 |
|---|---|
| Q1 控件簇位置 | **并入顶栏同一行**（9 项控件排进顶栏，非第二行悬浮） |
| Q2 抽屉关闭方向 | **抽屉改为屏幕右侧停靠**，向左滑出（开）、向右滑出（关） |
| Q3 三按钮映射 | **同一抽屉切 tab**（节点/资产/工作流 → 同一抽屉的不同 tab） |
| Q4 小地图本体 | **仍在左下角**，底部位置下移到原"开关小地图"图标对齐处 |

原始三需求：①左下控件 + 侧栏功能全部移入顶栏一行（顺序：开关小地图 / 开关网格对齐 / 开关黑夜模式 / 适应画布 / 画布百分比 / 设置 / 节点 / 资产 / 工作流）②节点/资产/工作流抽屉改造（右停靠、关闭按钮与计数文案互换、点关闭按钮向右滑出）③删除画布左侧悬浮栏。

---

## 1. 现状勘察（真实代码事实）

| 元素 | 现状 | 归属 |
|---|---|---|
| 左下控件簇 `.canvas-controls-floating` | btnMinimap / btnToggleDots / btnFitAction / zoomSlider / zoomPercent | index.html 静态 |
| 左侧悬浮栏 `.sidebar-floating` | btnAdd(添加节点菜单) / btnCanvasLogo(项目下拉) / btnAssets(资产面板) / btnWorkflows(工作流面板) / btnFiles(隐藏) / userAvatar(设置)+avatarMenu | index.html 静态 |
| 顶栏 `.header` | 全宽 nav 带（[S5]）：logo + 项目名 + 画布切换器 | index.html 静态 |
| 资产面板 `.v2-asset-sidebar-panel` | **左停靠**（left:64px，absolute），`transform` 动画（transition .2s），`.show` 显隐；分类：人物/场景/物品/服装/风格/自定义 | **混淆 JS**（AssetManager）动态构建 |
| 工作流面板 `.v2-workflow-sidebar-panel` | **独立**面板（320宽），与资产面板**并列、非同一 tab 抽屉** | **混淆 JS**（WorkflowManager） |
| 黑夜模式 | **无独立开关按钮**，仅设置→画布底色→V1暗夕/V2白昼；机制 = `#v2-wrap.theme-light` 类（[S6] 已接管为纯白底+淡黑点阵） | 混淆 JS + [S6] CSS |
| 小地图 `.minimap-wrapper` | 左下角 | index.html 静态 |

### ⚠ 两个关键勘察发现（直接影响需求 2）

1. **幻映当前没有"画布/资产 tab + 画布元素列表 + 共N节点"的统一抽屉**。你提供的图1/图2 是 **liblib 的交互范式**（我此前深挖 liblib 时记录过其"资产管理"左抽屉正是这个结构，见 06 文档 §4.1）。幻映现状是**资产、工作流两个相互独立的面板**，且无"节点列表/画布元素"面板。
2. **"节点"按钮的语义有歧义**：幻映的 btnAdd 是"添加节点**菜单**"（弹出式，非抽屉）；而图1的"画布" tab 是"节点列表/画布元素"（抽屉）。两者不是一回事。

---

## 2. 需求逐条 → 落点 + 可行性

### 需求 1：控件全部并入顶栏一行

**目标顺序**（左→右，接在画布切换器之后）：
`开关小地图 · 开关网格对齐 · 开关黑夜模式 · 适应画布 · 画布百分比 · 设置 · 节点 · 资产 · 工作流`

**落点**：新建可读模块（仿 `canvasTabsDropdownUi.autoload.js` 先例），把这 8 个既有按钮（btnMinimap/btnToggleDots/btnFitAction/zoomPercent/userAvatar/btnAdd/btnAssets/btnWorkflows）**DOM 搬迁**进 `.header`，按指定顺序排列；新增 1 个"黑夜模式"开关按钮（调用既有 `theme-light` 机制）。CSS 统一为顶栏图标钮制度（DESIGN.md：透明底 hover 显形、3px 圆角、ghost 风）。

**可行性：高（~90%）**。按钮均为静态元素，搬迁 = appendChild 到 header；事件绑定跟随元素不丢失。
- 黑夜模式开关：需小 JS（读写 `#v2-wrap.theme-light` + 持久化），**注意**与设置里"画布底色"开关同步（两处控同一状态，避免不一致）。
- 缩放百分比 `zoomPercent` 搬入后，其点击展开的缩放菜单（如有）位置需重定位。
- 风险点：顶栏变拥挤（9 项 + logo + 项目名 + 切换器），窄屏需考虑溢出/折叠。

### 需求 2：节点/资产/工作流抽屉改造

拆成三个子项，可行性差异很大：

**2a. 抽屉改右侧停靠 + 关闭方向（开左滑入 / 关右滑出）**
- 落点：CSS 覆盖 `.v2-asset-sidebar-panel` / `.v2-workflow-sidebar-panel` 的 `left/right/transform`。两面板都是 absolute + transform 动画，**纯 CSS 可改停靠侧与滑动方向**。
- **可行性：中高（~80%）**。
- ⚠ **冲突**：PI 助手面板（幻映AI导演）也在右侧。右停靠抽屉与 PI 面板会**重叠**。需定夺：右抽屉与 PI 面板互斥（开一个关另一个）／错位并存／抽屉更窄叠在 PI 之上。

**2b. 关闭按钮（K←）与计数文案（共N节点）位置互换**
- 落点：CSS flex `order` 或绝对重定位。
- **可行性：中（~60%）**，取决于二者是否在同一 flex 容器（混淆 DOM，需实施时真机确认）；若跨容器则需小 JS 搬迁节点。
- 注：此"共N节点 + K← 收起"的页脚行属于图1那种**带节点列表的抽屉**——幻映现状的资产/工作流面板**未必有这一行**（见 2c）。

**2c. "同一抽屉切 tab"（节点/资产/工作流 统一为一个 tab 抽屉，如图1/2）**
- **可行性：低（CSS 不可达）**。幻映现状是**两个独立的混淆面板**（资产、工作流），且**无节点列表面板**。把它们合并成 liblib 式"画布/资产/工作流"单一 tab 抽屉 = 重构混淆 DOM，覆盖层做不到。
- **三条现实路径（需你拍板，§3）**：
  - **路径 A（推荐，低风险）**：保留三个**独立**面板/入口，但统一它们的**视觉皮肤 + 右停靠 + 关闭方向 + 页脚按钮/文案互换**——看起来一致、行为一致，只是不是"物理同一个 tab 容器"。节点 = 沿用 btnAdd 添加节点菜单（弹出，不强行塞进抽屉）。
  - **路径 B（中风险，中成本）**：新建一个**可读的统一抽屉外壳模块**，把现有资产面板、工作流面板作为内容嵌入它的 tab；"节点" tab 需要新建一个节点列表（读 graphStore 渲染画布元素 + 共N节点 + 定位）。工作量大、且嵌入混淆面板有不确定性。
  - **路径 C**：本轮只做 2a + 2b（右停靠 + 关闭改造 + 皮肤统一），"统一 tab" 单列后续专项。

### 需求 3：删除画布左侧悬浮栏

- 落点：需求 1 把 `.sidebar-floating` 里的功能按钮（设置/节点/资产/工作流）搬进顶栏后，CSS 隐藏 `.sidebar-floating` 外壳（`display:none`）。
- **可行性：高（~95%）**。
- 注：栏内的 btnCanvasLogo（项目下拉）功能已被顶栏画布切换器（[S4.9]）替代，随栏删除；btnFiles 本就隐藏。

---

## 3. 需要你拍板的关键取舍（实施前必须定）

| 决策 | 选项 | 推荐 |
|---|---|---|
| **D1：节点/资产/工作流抽屉形态** | A 三独立面板统一皮肤+右停靠（CSS，低风险）／ B 新建统一 tab 抽屉（大改，含新建节点列表）／ C 本轮只做右停靠+关闭改造 | **A**（最快达成"看起来统一、右停靠、关闭一致"，且不碰混淆重构） |
| **D2：右抽屉 vs PI 面板重叠** | 互斥（开一关一）／ 并存错位 ／ 抽屉叠在 PI 之上 | **互斥** |
| **D3："节点"按钮含义** | = 添加节点菜单（btnAdd，现状）／ = 新建"画布元素/节点列表"抽屉（新功能） | **= 添加节点菜单**（除非选 D1-B） |

---

## 4. 实施方案概要（待 §3 定夺后细化）

- 新分区：`theme-upgrade.css` **[S7] 布局重构**；新模块 `modules/headerControlsRelocate.autoload.js`（按钮搬迁 + 黑夜开关）。
- 顶栏控件：DOM 搬迁 + 顶栏图标钮制度（DESIGN.md）。
- 抽屉：CSS 改 `left→right`、`transform` 方向；页脚 order 互换。
- 删栏：`.sidebar-floating{display:none}`。
- 小地图：`.minimap-wrapper` 下移对齐（bottom 调整）。
- 回退：删 [S7] 区块 + 模块文件 + index.html 一行 script。

## 5. 验收清单（待方案定稿后逐条）

- [ ] 顶栏一行 9 控件按序排列、各自功能正常（小地图开关/网格/黑夜/适应/缩放/设置/节点/资产/工作流）
- [ ] 黑夜模式开关与设置内"画布底色"状态同步
- [ ] 资产/工作流抽屉右停靠，开左滑入、关右滑出
- [ ] 关闭按钮与计数文案位置已互换，点关闭按钮抽屉向右滑出
- [ ] 右抽屉与 PI 面板按 D2 决策无冲突
- [ ] 左侧悬浮栏已消失，无残留点击热区
- [ ] 小地图本体仍在左下、位置下移对齐
- [ ] DESIGN.md 制度一致（无彩色、3-4-6 圆角、禁影）
- [ ] 面板测试 131/131；node --test 对照遗留基线

## 实施记录（2026-06-12，D1=B / D2=互斥 / D3=画布节点列表）

已落地并 8777 真机验证全绿。三处新增（[S7] CSS + 两个可读模块）：

- **[modules/unifiedSidebarDrawer.autoload.js]**：右停靠统一抽屉，tab = 画布/资产/工作流。
  - **画布 tab**（D3 核心）：`import { graphStore }` 读节点 → 行 = **类型图标（按 type 区分：文本/图像/视频/音频/分镜/全景/组）+ 名称**，点击 `window.v2FocusOnNode(id)` 跳转+缩放到该节点（实测视口 `1475,309@0.278 → -3186,2469@2`），`graphStore.subscribe` 实时刷新，footer「共 N 节点」(左) + 收起 ›(右) — **已按需求2互换**。
  - **资产/工作流 tab**：复用既有混淆面板（btnAssets/btnWorkflows 惰性创建），`appendChild` 进抽屉 pane + 清内联 transform/定位填充（解决了"面板是 sidebar 子元素被 display:none 连带灭掉"和"identity transform 制造包含块致 fixed 错位"两个坑）。
  - 开=右滑入 / 关=右滑出（translateX）；与 PI 面板互斥（开抽屉先关 PI）。
- **[modules/headerControlsRelocate.autoload.js]**：把 8 个既有控件搬进顶栏 + 新建黑夜开关/节点/资产/工作流按钮，顺序严格 = 小地图·网格·黑夜·适应·百分比·设置·节点·资产·工作流。迁移后按钮 handler 全部存活（实测小地图开关/设置菜单正常）。黑夜开关切换 `#v2-wrap.theme-light` + localStorage。
- **[S7] CSS**：控件簇皮肤、删悬浮栏（中和容器+藏按钮，保面板子级渲染）、小地图下移、抽屉全套、面板填充。
- 测试：indexEncoding + bootWiring + 面板契约 **135/135**。

**已知小边界**（不阻塞）：①背景 CDP tab 的 CSS transition 冻结只是验证假象，真机平滑动画；②资产/工作流面板自带页脚/收起按钮仍在（被复用面板的原生 chrome），与抽屉 footer 不冲突（抽屉 footer 仅画布 tab 显示）；③黑夜开关与设置内"画布底色"为两个入口控同一 `theme-light` 状态，已用 localStorage 持久化，但设置面板打开时可能以其自身状态覆盖（双向同步未做，需要再说）。

## 6. 风险

- R1 顶栏拥挤/窄屏溢出（9 控件 + 既有三件）——需溢出策略
- R2 右抽屉 vs PI 面板重叠（D2）
- R3 抽屉页脚 order 互换依赖混淆 DOM 的 flex 结构（实施时真机确认）
- R4 黑夜开关与设置项双向同步（状态源唯一性）
- R5 "统一 tab 抽屉"若选 D1-B：新建节点列表 + 嵌入混淆面板，成本与不确定性最高

## 实施记录 v2（2026-06-12 第二轮反馈，5 项）

[S8] CSS + 两模块增量，8777 真机验证全过：
1. **顶栏盒子化+穿透**（需求1）：顶栏 `background:transparent` + 去底边线 + `pointer-events:none`（画布顶部可交互、网格点透到顶）；左上组(logo+项目名+切换器)与右上控件簇各用 4px 圆角盒；**恢复项目名可见可编辑**（bundle 在 V2 隐藏了它，强制 display）——呈现 `logo | 项目名(可编辑) | 画布切换器▾`，对应图1。
2. **设置直开**（需求2）：撤销下拉菜单，userAvatar 捕获拦截原 handler → 直接触发 btnOpenSettings；**删除 index.html 的 btnTutorial/btnAbout**（保留 btnOpenSettings 作触发器）。
3. **tooltip 下移**（需求3）：`.hy-header-controls [data-tooltip]:hover::after/::before` 改 `top:calc(100%+...)`，箭头朝上。
4. **统一计数 footer**（需求4）：移除"资产/工作流隐藏 footer"规则，各 tab 都显示我的 footer + 收起；计数适配单位——节点(graphStore)/资产(`.v2-asset-item`)/工作流(`.v2-workflow-card`)。注：资产顶层是分类文件夹，钻入分类前 item 数为 0（DOM 可见项计数，非账号总数）。
5. **缩放编辑**（需求5）：点击百分比 → 内联输入 → 回车设缩放（中心保持，`getStateRaw().viewport` 直写 + requestRender，实测 150%→zoom 1.5）。

**事故与修复**：探测缩放 API 时误用 `updateViewport({x,y,zoom})` 把服务端保存的视口写成 null（updateViewport 非对象式 merge）。已用 `getStateRaw().viewport` 直写合法值 + markViewportPersist 修复并验证持久化（x:0,z:0.3）。**正确的视口写法 = getStateRaw 直改属性**，updateViewport 对象式不可用。
