# 26 ·「我的画布」面板 — 产品需求文档 (PRD)

- 日期：2026-06-23
- 状态：设计已与用户确认，待评审 → 转实现计划
- 范围：画布右上角功能区新增「我的画布」入口 + 抽屉面板，用于管理临时画布与已保存画布
- 前置阅读：本功能高度复用现有 `CanvasTabManager` / `projectService` / `hyUnifiedDrawer`，**不碰混淆桥 `scene3dBridge.js`**

---

## 1. 背景与目标

### 1.1 背景
- App 里「画布(canvas)」对用户即一个工作区；保存后落盘为 `user/Canvas Project/{name}.json`。一个项目 `.json` 内部是 `{ canvases:[...], activeCanvasId }`，可含多个画布。
- 左上角标签条（`#canvasTabs`）= 当前工作区的画布集合（`CanvasTabManager._canvases`），这些就是用户语境里的「临时画布（未保存的）」。
- 「新建画布」「保存画布」的**功能本就存在**（`CanvasTabManager.addCanvas()` / `window._v2SaveProject()`），只是上一版把 UI 入口移除了。
- 现状缺一个统一的「画布管理」面板：临时画布散在左上角标签条，已保存画布只在顶栏「打开」下拉里。

### 1.2 目标
在右上角新增「我的画布」抽屉面板，集中展示与管理：
- **临时画布**（当前工作区未保存的）→ [保存]、[删除]
- **已保存画布**（磁盘 `.json`）→ [打开]、[删除]
- 附加：重命名、搜索/按名筛选、已保存按时间排序、面板内「新建画布」入口。

### 1.3 成功判据
- 入口出现在右上角「设置(齿轮) 与 画布节点」之间；点击展开抽屉，「我的画布」tab 排在「画布节点」之前。
- 两区按「临时在前、已保存在后」展示；每行操作按设计可用。
- 全程复用现有保存/打开/删除/新建/改名能力，不破坏左上角标签、顶栏、其它抽屉 tab。
- 删除/打开(替换工作区)/保存命名 均有弹窗；不误触发任何付费操作。

---

## 2. 术语与数据模型

| 术语 | 定义 | 数据来源 |
|---|---|---|
| 临时画布 | 当前工作区中**尚未保存**的画布 | `CanvasTabManager._canvases` 过滤掉「本会话已存集合」 |
| 已保存画布 | 磁盘上的项目 `.json` | `projectService.getProjects()`（返回 `{filename,name,updatedAt}` 列表） |
| 当前画布 | 工作区当前激活画布 | `CanvasTabManager._activeId` |
| 已存集合 | 本会话内通过本面板[保存]过的临时画布 id 集合 | 新增 session 级 `Set<canvasId>` |

**临时画布对象字段**（`_canvases[i]`）：`{ id, name, nodes[], edges[], viewport{x,y,zoom}, assets[], _persistRevHint }`。

**项目 `.json` 结构**：`{ canvases:[ {id,name,nodes,edges,viewport,assets} ], activeCanvasId }`。

> 说明：已保存画布列表项 = 一个 `.json`（即便其内部含多个画布，也作为**一项**展示，名称取项目名）。打开它会把整个项目载入工作区（替换左上角画布集合）。

---

## 3. 范围

### 3.1 本版包含
- 右上角工具栏「我的画布」按钮（齿轮与画布节点之间）。
- `hyUnifiedDrawer` 新增「我的画布」tab（排在画布节点之前）+ 面板内容。
- 临时画布区 / 已保存画布区 两段列表。
- 每行操作：临时=[保存][删除]，已保存=[打开][删除]。
- 删除二次确认弹窗；保存命名弹窗；打开「会替换工作区」确认弹窗（仅当存在未保存临时画布时）。
- 重命名（临时 + 已保存）。
- 顶部搜索框（按名筛选两区）。
- 已保存按 `updatedAt` 倒序。
- 面板内「新建画布」按钮。

### 3.2 本版不包含（YAGNI）
- 缩略图/封面预览、未保存「红点/脏标记」、批量多选删除、拖拽排序、项目展开显示子画布、回收站/撤销删除、跨设备同步。

---

## 4. 信息架构与入口

### 4.1 工具栏入口
- 文件：`modules/headerControlsRelocate.autoload.js`
- 现有顺序：小地图 · 网格 · 适应 · 缩放% · 分隔线 · 设置(齿轮/`.avatar-wrap`) · 画布节点 · 资产 · 工作流。
- **新增**：在「设置(齿轮)」之后、「画布节点」之前插入「我的画布」按钮：
  - `makeBtn("hy-hc-mycanvas", "我的画布", ICON_MYCANVAS, () => openDrawer("mycanvas"))`
  - 图标：Tabler 类「文件夹/网格」语义的 SVG（实现时定一个与现有图标同风格的 inline SVG）。

### 4.2 抽屉 tab
- 文件：`modules/unifiedSidebarDrawer.autoload.js`
- 在 `.hy-ud-tabs` **最前面**加一个 `<button data-tab="mycanvas">我的画布</button>`（排在画布节点之前）。
- 在 `.hy-ud-body` 加 `<div class="hy-ud-pane" data-pane="mycanvas">…</div>`。
- 复用现有 `toggle/open/close/switchTab/updateFooterCount/点外关闭/与 PI 面板互斥` 逻辑（仅在分支里补 `mycanvas`）。

---

## 5. 面板布局与组件

抽屉宽度沿用 `.hy-unified-drawer`（360px，固定右侧，z-index 1100）。「我的画布」面板自上而下：

1. **顶部操作行**：搜索框（`<input>`，占满；图标 `ti-search`，placeholder「搜索画布…」）+ 「新建画布」按钮（`ti-plus`）。
2. **临时画布区**：分组标题「临时画布 · 未保存」；行项：
   - 图标（画布）+ 名称（双击改名）+（当前画布带「当前」徽标）+ 右侧操作 [保存][删除]。
3. **已保存画布区**：分组标题「已保存画布 · 最近在前」；行项：
   - 图标（文件夹）+ 名称（双击改名）+ 次行「相对时间」+ 右侧操作 [打开][删除]。
4. 空态：临时区为空显示「暂无未保存画布」；已保存区为空显示「暂无已保存画布」。

样式复用 `.hy-ud-*`（行项可复用 `.hy-ud-node-row` 同款规格：36–44px、hover/active 高亮）；操作按钮为小图标按钮（`aria-label` 必填）。多数类已存在，新增样式控制在最少。

视觉草图见本会话 mockup（tab 顺序「我的画布 / 画布节点 / 资产 / 工作流」）。

---

## 6. 功能需求（逐项 + 复用映射）

| 编号 | 需求 | 行为 | 复用 |
|---|---|---|---|
| F1 | 工具栏按钮 | 点击 `hyUnifiedDrawer.toggle("mycanvas")`；再点同 tab 收起 | 现有 `openDrawer/toggle` |
| F2 | 抽屉 tab + 面板渲染 | 切到 mycanvas → 渲染两区列表 | 现有 `switchTab` + 新 `renderMyCanvases()` |
| F3 | 临时画布列表 | 读 `CanvasTabManager._canvases`，过滤已存集合，标记「当前」(`_activeId`) | `_canvases` / `_activeId` |
| F4 | 已保存列表 | `getProjects()` → 按 `updatedAt` 倒序渲染 | `projectService.getProjects` |
| F5 | 新建画布 | 调 `CanvasTabManager.addCanvas()`，刷新面板 + 左上角标签 | `addCanvas` / `renderTabs` |
| F6 | 保存(单画布) | 弹命名框（默认=画布名）→ 用单画布快照 `{canvases:[该画布], activeCanvasId:该id}` 调 `saveProject(name, snapshot)`；成功后把该 id 加入「已存集合」→ 该项移入已保存区，已保存区刷新 | `saveProject` + 新 `saveSingleCanvas()` helper + 复用命名弹窗范式 |
| F7 | 删除临时 | 弹确认 → `CanvasTabManager.deleteCanvas(id)`（至少留 1 个画布的现有约束保留）→ 刷新 | `deleteCanvas` + 新确认弹窗 |
| F8 | 打开已保存 | 若存在未保存临时画布 → 先弹「替换工作区」确认 → `loadProject(filename)`（hydrate 替换工作区 + `renderTabs`）→ 刷新面板 | `projectService.loadProject` / `ProjectManager.loadProject` |
| F9 | 删除已保存 | 弹确认 → `deleteProject(filename)` → 刷新已保存区 | `deleteProject` |
| F10 | 重命名临时 | 行内双击改名 → `CanvasTabManager.renameCanvas(id, name)` → 刷新 | `renameCanvas` |
| F11 | 重命名已保存 | 行内双击改名 → 后端 `PATCH /api/v2/projects/{filename}?rename`（启用现有未用端点；兜底：load→saveAs(新名)→deleteProject(旧)）→ 刷新 | 现有 PATCH 端点（需接通）|
| F12 | 搜索/筛选 | 顶部输入 → 纯前端按名 `includes` 过滤两区 | 新增前端过滤 |
| F13 | 排序 | 已保存区按 `updatedAt` 倒序（临时区按 `_canvases` 原序） | 新增前端排序 |
| F14 | 列表实时刷新 | 抽屉打开时拉取一次；本面板内任一写操作后刷新；切回 mycanvas tab 重新拉 | 新增；可给 `CanvasTabManager` 加一个轻量变更回调（可选） |

---

## 7. 交互流程

### 7.1 保存临时画布（F6）
1. 点行内[保存] → 弹命名弹窗（输入框默认填画布当前名）。
2. 确认 → 构造单画布快照 → `saveProject(name, snapshot)`。
3. 成功 → 该 canvasId 进「已存集合」→ 临时区移除该行、已保存区出现 `{name}.json`（顶部，最近）。失败 → 提示错误、不改状态（**显式报错，不静默**）。
4. 左上角标签该画布**仍开着**（不动 `_canvases`），仅面板归类变化。

### 7.2 打开已保存画布（F8）
1. 点行内[打开]。
2. 若当前工作区存在未保存临时画布 → 弹确认「打开会替换当前工作区，未保存的临时画布将丢失，继续？」；否则直接进。
3. 确认 → `loadProject(filename)` → 工作区被该项目替换、左上角标签刷新、面板刷新。
4. **副作用**：「已存集合」与当前会话语义重置（新工作区的画布按临时呈现，该项目 `.json` 仍在已保存区）。

### 7.3 删除（F7 / F9）
- 统一二次确认弹窗（复用 `.save-dialog` 范式）：标题「删除画布/项目」，文案含名称，按钮[取消][删除]。
- 临时删除 → `deleteCanvas(id)`；已保存删除 → `deleteProject(filename)`。删除后刷新对应区。

### 7.4 重命名（F10 / F11）
- 行内名称双击进入可编辑（`contentEditable` 或临时 `<input>`），回车/失焦提交，Esc 取消。
- 临时 → `renameCanvas`；已保存 → 后端 rename。空名/重名：给出提示并保持原名（不静默吞）。

### 7.5 新建（F5）
- 顶部[新建画布] → `addCanvas()` → 新临时画布进临时区并成为「当前」，左上角同步出现新标签。

---

## 8. 关键决策（已与用户确认）

1. **「保存后移到已保存区」的实现 = 会话级「已存集合」**：本面板[保存]成功后记下 canvasId；临时区 = `_canvases` 排除该集合。**刷新页面后集合重置**（这些画布会重新算作临时）——用户已接受此权衡（不把「已存」状态持久化进画布数据，避免更大改动）。
2. **[打开] 替换当前工作区**（沿用 `loadProject`）；当存在未保存临时画布时打开前弹确认。用户已接受。
3. **重命名已保存画布接通后端**：启用现有未用的 `PATCH …?rename`（或兜底 load→另存→删旧）。用户已同意可小改 Python server。

其它决策：
- 已保存项目即使内部多画布，也作为**一项**展示（名称=项目名），打开=载入整个项目。
- 「当前画布」在临时区高亮 + 「当前」徽标。
- 抽屉互斥/点外关闭/与 PI 面板互斥**沿用现有**，不为 mycanvas 特例化。

---

## 9. 错误处理与边界

- 所有网络操作（save/getProjects/load/delete/rename）失败 → 显式提示（toast 或弹窗），**不静默吞异常、不以默认值掩盖失败**；面板状态不做乐观假设，失败即回退/重拉。
- 删除临时画布触及「至少保留 1 个画布」现有约束时，按现有行为处理（保留约束，必要时禁用最后一个的删除并提示）。
- 重名/空名（保存、改名）→ 提示并阻止；是否允许覆盖同名项目，沿用现有 `saveProject` 行为（实现时核验现有是否覆盖/报错并对齐文案）。
- 列表数据竞态：以「写操作后强制重拉」为准，避免本地缓存与磁盘不一致。
- 抽屉在 360 模式/全屏 3D 编辑器下的层级：沿用 `hyUnifiedDrawer` 现有 z-index，不新引入定位包含块。

---

## 10. 复用清单 vs 新增清单

### 10.1 复用（现成）
- 抽屉：`window.hyUnifiedDrawer.{open,close,toggle,switchTab}`、`.hy-unified-drawer`/`.hy-ud-*`、点外关闭、互斥。
- 工具栏：`makeBtn` + `openDrawer(tab)`。
- 画布：`CanvasTabManager.{_canvases,_activeId,addCanvas,switchTo,deleteCanvas,renameCanvas,getMultiDataSnapshot,hydrate,renderTabs}`。
- 项目：`projectService.{getProjects,saveProject,loadProject,deleteProject,resolveCanvasData}`、`window._v2SaveProject`、`ProjectManager.loadProject`。
- 弹窗范式：`.save-dialog-overlay/.save-dialog/.save-dialog-actions`。
- 后端：`GET/POST/DELETE /api/v2/projects*`；`PATCH …?rename`（待启用）。

### 10.2 新增（缺口）
- `renderMyCanvases()`：两区渲染 + 操作绑定（在 `unifiedSidebarDrawer` 内）。
- `saveSingleCanvas(canvasId, name)`：构造单画布快照并调 `saveProject`。
- 会话级 `savedTempCanvasIds: Set`。
- 确认弹窗（删除/替换工作区）与命名弹窗的薄封装（复用 `.save-dialog` 范式，或抽一个通用 `confirmDialog(opts)`）。
- 搜索过滤 + 时间排序（纯前端）。
- 工具栏「我的画布」按钮 + tab + 面板 DOM/样式。
- 后端 rename 端点接通（F11）。
- 纯逻辑层抽出可测函数（见测试）。

---

## 11. 改动文件清单（均在可读层）

- `modules/headerControlsRelocate.autoload.js` — 新增工具栏按钮。
- `modules/unifiedSidebarDrawer.autoload.js` — tab + 面板 + `renderMyCanvases` + 操作 + 搜索/排序 + 弹窗调用。
- `styles/theme-upgrade.css` — 少量样式（多数 `.hy-ud-*`/`.hy-hc-btn` 已存在）。
- 新增纯逻辑模块（建议）`components/...` 或 `modules/myCanvases/*.js` — 放可单测的纯函数（过滤/排序/单画布快照/已存集合判定）。
- 后端 `server.py` + `api/projectsV2Api.js` + `services/projectService.js` — 接通/暴露 rename（F11）。
- **不改**：`modules/panoramaSceneNode/scene3dBridge.js`（混淆桥）、`src/core/*` 烘焙快照。

> ⚠️ 实现时核验：`CanvasTabManager` / `projectService` 为混淆代码，上述方法名以**实际导出/全局**为准（本 PRD 名称来自调研报告，编码前用 codegraph + 真实读码逐一确认；删除方法真名可能是 `deleteCanvas`/`removeCanvas` 等，需对齐）。

---

## 12. 测试计划

### 12.1 纯逻辑单测（node:test）
- 搜索过滤：给定列表 + 关键词 → 返回匹配项（大小写/空查询/中文）。
- 时间排序：`updatedAt` 倒序，缺失字段回落稳定。
- 单画布快照构造：从 `_canvases` 取一项 → `{canvases:[该项],activeCanvasId}` 字段正确、不带入其它画布。
- 已存集合判定：临时区 = `_canvases` 排除集合；保存后该 id 进集合。
- 两区数据合成：临时在前、已保存在后、当前画布标记。

### 12.2 真机自验（Chrome 扩展，`127.0.0.1:8777`）
- 工具栏按钮位置（齿轮与画布节点之间）+ 点击展开 mycanvas tab（排在画布节点前）。
- 临时区/已保存区渲染正确（与左上角标签、磁盘项目一致）。
- 新建 → 临时区与左上角同步出现。
- 保存 → 命名弹窗 → 临时项移入已保存区（顶部）+ 左上角标签仍在。
- 打开（有未保存临时画布）→ 替换确认 → 工作区替换、面板刷新。
- 删除（临时/已保存）→ 确认弹窗 → 移除。
- 重命名（临时/已保存）→ 生效。
- 搜索/排序生效。
- 抽屉互斥/点外关闭/与 PI 面板互斥未被破坏；左上角标签、其它 tab 正常。
- **不点付费按钮**；失败路径显式报错。

### 12.3 测试缺口
- DOM/事件逻辑无 node 单测，仅靠扩展真机自验；纯函数尽量外提以可测。

---

## 13. 验收标准（完成判据）

1. 入口与 tab 顺序符合 §4；面板两区与操作符合 §5/§6。
2. 七类流程（新建/保存/删除临时/打开/删除已保存/改名/搜索排序）真机自验通过且有证据（截图/读 DOM/读 store）。
3. 复用现有能力，未破坏：左上角标签、顶栏、画布节点/资产/工作流 tab、PI 面板互斥。
4. 全部失败路径显式报错，无静默吞异常。
5. 纯逻辑单测全绿；node --check 通过。
6. 不改混淆桥、不动烘焙快照；后端仅 rename 必要小改。

---

## 14. 待实现时核验项（编码前确认真名/行为）

- `CanvasTabManager` 删除方法真名、`getMultiDataSnapshot` 参数、`hydrate` 入参形态。
- `projectService.saveProject` 同名是否覆盖/报错；`getProjects` 返回字段是否含 `filename`+`updatedAt`。
- `hyUnifiedDrawer.switchTab/updateFooterCount` 是否需要为 mycanvas 改分支。
- `PATCH …?rename` 端点是否可直接启用、请求/响应形态。
- 工具栏 `makeBtn` 签名与插入点（确保落在齿轮与画布节点之间）。
