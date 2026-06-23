# 27 ·「我的画布」面板 — 落地开发文档 (Dev Doc)

- 日期：2026-06-23
- 配套 PRD：[26-my-canvases-panel-prd.md](./26-my-canvases-panel-prd.md)
- 状态：已对**真实部署代码**逐项核验 + 对抗式评审，含 PRD 修正，待实现
- ⚠️ **以真实部署文件 `modules/` + `services/` 为准**。凡与前期探索报告 / `output/upstream/AI-CanvasPro/src/...`（上游副本）冲突，一律以本文为准——**死副本陷阱**：探索报告里 `deleteCanvas` async/Promise/`_confirmDeleteDirtyCanvas` 等结论来自上游副本，**真实 build 里不成立**。

---

## 0. 核验结论摘要（必读，覆盖 PRD 若干假设）

| # | PRD 假设 | 真实情况（已核验） | 影响 |
|---|---|---|---|
| B1 | 打开=`loadProject` 替换工作区 | `loadProject(filename)` **纯取数**，不碰 `CanvasTabManager`、不替换、不 renderTabs。现有「打开项目」是 **additive 追加一张画布**，根本没有「替换/丢失」行为 | **blocker**：按 PRD 弹「将丢失」却走 additive=欺骗。需新写 `openProjectReplace`=load+`init` |
| B2 | `deleteCanvas` async/返回 boolean/自带确认 | 真实 build：**同步、无返回值(undefined)、删前不弹框**（`_confirmDeleteDirtyCanvas` 本 build 不存在） | **blocker**：`if(await deleteCanvas())` 永远 falsy 误判。确认必须面板自做，成败靠重读 `_canvases` |
| M1 | 复用 `saveProject` 即可 | `saveProject` 成功会写 `window.currentProjectId/currentProjectName`=该文件 | **major**：单画布另存会**劫持全局当前项目指针**，之后顶栏 `_v2SaveProject` 把整工作区写进单画布文件→污染。须存→存盘→**复位** |
| M2 | 已存集合 `Set<canvasId>` | 临时区按 canvasId 剔除、已保存区按 filename 列项=两套 key | **major**：删除/改名/同名覆盖该文件后 canvasId 不移出→画布**两区都不显示凭空消失**。须升级 `Map<canvasId,filename>` |
| M3 | `switchTab` 已支持任意 tab | `switchTab`/`updateFooterCount` 都是**硬分支**，mycanvas 落 else→`showExternalPanel`（错配 workflow 面板） | **major**：两函数都必须**新增 mycanvas 分支** |
| M4 | 失败显式报错（§9） | `getProjects`→`catch[]`、`loadProject`→`catch 空项目`、`deleteProject`→`catch false`，**全静默吞错** | **major**：直接复用则失败路径无从报错。面板须**二次校验**或走裸 requester |
| M5 | rename「启用现有未用端点」 | 后端 PATCH `_rename_project` **已完整实现**（body 键是 `name`）；但**前端无任何封装**；Windows 上同名 rename→`os.rename` 抛 `FileExistsError`→**500** | **major**：前端需新写 PATCH 封装；后端建议加 409 检查 |
| m1 | `getProjects` 返回 `updatedAt` | 真实字段 **`mtime`**（秒级浮点），`name`=去 `.json` 的文件名 | minor：排序/相对时间用 `mtime*1000` |
| m2 | 复用 `.save-dialog` 弹窗 | `#saveDialogOverlay` 是**单例 DOM**，按钮已被 `CanvasProjectDropdownManager` 绑定 | minor：新建独立弹窗，**勿劫持**；且要登记进抽屉点外关闭排除名单 |
| m3 | 同名保存「沿用现有行为」 | 后端 `_save_project` **无存在检查，静默覆盖**；`_safe_name` 把 `[\/:*?"<>|]`→`_`，异原名可能 sanitize 后同名碰撞覆盖 | minor：前端复刻同 sanitize 规则比对，保存前提示「将覆盖」 |

---

## 1. 已核验真实接口 / 行为（实现直接引用）

### 1.1 `modules/CanvasTabManager.js`（挂 `window.CanvasTabManager`）
- `_canvases: []`、`_activeId`：公开属性，直接读（**bare import / 直读 window，不带 `?v=`**）。
- `addCanvas()`：**同步、无返回值**。`id='canvas_'+Date.now()`，`name='画布 '+(len+1)`，设为 active，`_hydrateCanvasSnapshot(空)`+`commit()`+`renderTabs()`。
- `switchTo(canvasId)`：**async**，无显式返回（同 id/不存在则 early-return）。`_flushCurrentCanvas()`+设 active+`_hydrateCanvasSnapshot`+`commit()`+`renderTabs()`。
- `deleteCanvas(canvasId)`：**同步、无返回值、删前不弹框**。`length<=1` 守卫→`window.showToast('至少保留一个画布页面','warn')` 后 return。删当前画布时把 `_activeId` 切到相邻（`Math.max(0,idx-1)`）+`_hydrateCanvasSnapshot`+`commit()`+`renderTabs()`。
- `renameCanvas(canvasId,newName)`：**同步、无返回值**。`trim` 后空或同名则 no-op；否则改 `rec.name`+`_markCanvasMetaDirty()`。**不自动 `renderTabs()`**（调用方需补）。
- `getMultiDataSnapshot({sanitizeForPersistence=false}={})`：先 `_flushCurrentCanvas()`（**只 flush 当前活动画布**）→ 克隆 `{canvases,activeCanvasId}`。`getMultiData()`=无参等价。
- `init(data)`：入参单对象 `{canvases,activeCanvasId}`，**无第二参**。`_buildCanvasRecord` 整体重建 `_canvases`、重置签名缓存，空则建默认画布，选中并 `_hydrateCanvasSnapshot`，`renderTabs()`。**`init` 不调 `commit()` → 替换工作区无 undo**。
- `renderTabs()`：无参，读 `#canvasTabs`，按 `_lastTabsRenderSignature` 增量重渲。`buildTabsRenderSignature(canvases,activeId)` 具名导出可单测。
- **本 build 无脏状态/变更事件**：`_notifyDirtyStateChanged` / `aicanvas:dirty-state-changed` / `isCanvasDirty` / `markCanvasClean` / `getActiveCanvasId` **均 grep 0 命中**（这些来自上游副本）。当前 id 用 `_activeId`；面板刷新只能写操作后**自己重渲**。
- **非活动画布数据可能陈旧**：非活动 `_canvases[i]` 只持有上次 `_buildCanvasRecord` 快照。`saveSingleCanvas` 取目标画布须从 `getMultiDataSnapshot().canvases` 里挑（已 flush 当前），**勿直读 `_canvases[i]`**。

### 1.2 `services/projectService.js`（明文 ESM）
- `loadProject(filename)`：fetch→命中 `resolveCanvasData(data)` 返回**纯数据**；404/null/catch 均返回 `resolveCanvasData({})`（**空默认项目，失败被伪装，不抛**）。**不碰 CanvasTabManager**。
- `saveProject(name,data)`：`sanitize`→`saveV2ProjectToServer({projectName:name||默认,activeCanvasId,canvases})`→成功**写 `window.currentProjectId=result.filename`、`currentProjectName=去.json`**→返回 `{success,filename}`。**catch 里会 throw**。
- `getProjects()`：`try await fetchV2ProjectsFromServer(); catch{return []}`（**双层吞错，网络故障与空列表无法区分**）。
- `deleteProject(filename)`：`try…return true; catch{return false}`（**吞异常返 false 不抛**）。
- `api/requester.js`：`!response.ok`(4xx/5xx) **会 throw**；仅 `404+allow404Null` 返 null；**无 `patch` helper**。→ 面板要区分 409/500 须走**裸 requester** 或自行二次校验。

### 1.3 后端 `services/json_file_route_service.py`
- `_list_projects()`：返回 `[{filename, name:filename[:-5], mtime:os.path.getmtime(秒级浮点)}]`，已按 mtime 倒序。
- `_save_project()`：空名兜成「未命名画布」；`filename=_safe_name(name)+'.json'`（`_safe_name`：`re.sub(r'[\\/:*?"<>|]','_')`）；`_atomic_write_json`（os.replace）；**无存在检查→同名静默覆盖**。
- PATCH 链路：`server.py:2231 do_PATCH`→`HTTP_ROUTE_DISPATCHER.handle_patch`→`_rename_project(path,body)`。请求体 `{name:新名}`（**键是 `name`**），空名→400，非法路径→400，文件不存在→404，成功→`{success:True,filename}`。**`os.rename` 无目标存在检查→Windows 同名抛 `FileExistsError`→未捕获→500**。

### 1.4 `modules/unifiedSidebarDrawer.autoload.js`
- `switchTab(tab)`：**硬二分支**——`tab==='canvas'`→`hideExternalPanels()+renderNodes()`；else→`hideExternalPanels()+showExternalPanel(tab)`（mycanvas 会错配）。
- `updateFooterCount(tab)`：只认 canvas/asset/workflow，其余落默认 `n=0/unit='节点'`。
- 外壳 DOM 在 autoload 内 `innerHTML` 写死；tab 顺序 画布节点/资产/工作流；tab 按钮统一 `.hy-ud-tab` `forEach` 绑 `click→switchTab(dataset.tab)`。
- 点外关闭（pointerdown capture，约第 259 行）排除选择器：`t.closest('.v2-asset-create-panel, .v2-asset-select-dropdown, .settings-overlay, .v2-canvas-ctx-menu, .save-dialog-overlay, .about-dialog, .canvas-proj-dropdown')`。
- `window.hyUnifiedDrawer={open,close,toggle,switchTab}`；`open()` 调 `closePiPanel()`（单向互斥）。

### 1.5 `modules/headerControlsRelocate.autoload.js`
- `makeBtn(cls,title,svg,onClick)`：建 `.hy-hc-btn`+cls 按钮 append 进 cluster 并返回。`openDrawer(tab)=window.hyUnifiedDrawer?.toggle(tab)`。
- 装配序：minimap/toggleDots/fitAction + zoomControls + `sep()` + avatarWrap(设置，约第 184 行) + `makeBtn(node,约193)` + asset + flow。**插入点：第 184~193 行间**。

### 1.6 `index.html` / `_v2SaveProject`
- `#saveDialogOverlay` 单例（标题写死「保存画布」，`#saveDialogInput`/`#saveDialogCancel`/`#saveDialogConfirm` 已被 dropdown manager 绑定）。**不劫持**。
- `window._v2SaveProject(name)`：`getMultiDataSnapshot()` 取**全部**画布→`saveProject(name,multiData)`→成功写 `currentProjectId=result.filename` 等。

---

## 2. 关键设计修订（落地强约束）

1. **打开=真替换**（方案 A，符合用户已确认语义）：`openProjectReplace(filename)` = `await loadProject(filename)`（取数）→ 校验 `data.canvases` 非空（空=失败 toast 不替换）→ `CanvasTabManager.init(data)`（整体重建+renderTabs）→ `savedTempCanvasMap.clear()` → 设 `currentProjectId/Name`。**已知限制：`init` 不 commit()→替换不可撤销**（见 §7）。
2. **已存映射 `Map<canvasId, filename>`**（会话级，模块全局，刷新重置）。临时区剔除按 `canvasId∈Map`，已保存区列项按 `getProjects()` 的 filename；删除/改名/同名覆盖该文件时**同步维护映射**，否则画布凭空消失。
3. **全局项目指针复位**：`saveSingleCanvas` 调 `saveProject` 前存 `prevId/prevName`，成功后**复位** `window.currentProjectId/currentProjectName`，避免单画布另存劫持全局上下文。
4. **错误处理**：底层吞错→面板**二次校验 + 显式 toast**。删后重拉确认消失；load 后校验非空；getProjects 空数组要再探一次区分真空/网络错；rename 走裸 PATCH 让 4xx/5xx 抛出后分支提示。
5. **独立弹窗**：新建 `.hy-mycanvas-dialog`（仿 `.save-dialog` 视觉），`confirmDialog()`/`namePrompt()`；**勿劫持 `#saveDialogOverlay`**；**必须把 `.hy-mycanvas-dialog` 加进抽屉点外关闭排除选择器**（否则点确认框会关抽屉）。
6. **sanitize 同名覆盖**：前端复刻 `frontendSafeName(s)=s.replace(/[\\/:*?"<>|]/g,'_')`，保存命名时比对已有 filename，命中提示「将覆盖同名项目」。
7. **同步 deleteCanvas**：确认在调用前完成；调用后靠**重读 `_canvases`** 判成败，不依赖返回值；`length<=1` 先行提示不调用。

---

## 3. 任务分解（TDD，有序，含依赖）

> 纯逻辑优先抽成可单测函数（DOM/事件只能靠 Chrome 扩展真机自验）。错误显式抛，最小改动，最大复用。

### 基础层（可并行）
- **T0 · 纯逻辑模块 + 单测**（deps：无）
  - 文件：`modules/myCanvases/myCanvasesLogic.js`（新）+ `.test.js`（新）
  - 纯函数（不碰 window/DOM）：`filterByName(list,kw)`（includes，大小写不敏感，空查询返全量，中文）；`sortSavedByMtime(list)`（mtime desc + filename 二级稳定）；`buildSingleCanvasSnapshot(multiSnapshot,canvasId)`→`{canvases:[该项],activeCanvasId:canvasId}`（从 `getMultiDataSnapshot()` 结果挑）；`selectTempCanvases(canvases,savedMap,activeId)`（临时=排除 savedMap.keys，标记当前）；`frontendSafeName(s)`（复刻后端 `_safe_name`）；`findOverwriteTarget(name,savedList)`（按 sanitize 后文件名查同名覆盖）；`ensureJsonName(filename)`、`buildRenameRequest(filename,newName)`（PATCH 改名 url/body，键是 `name`）。**共 8 个纯函数**。
  - 测试：上述各函数边界（空/大小写/中文/同秒并列稳定/单画布快照只含目标/sanitize 碰撞 `a/b`↔`a:b`→`a_b`）。
- **T1 · 前端 PATCH rename 封装 + 单测**（deps：无）
  - 文件：`api/projectsV2Api.js`（+ 可选 `api/requester.js` 加 `patch` 导出）+ 测试
  - `renameV2ProjectOnServer(filename,newName)`：`requester({url:'/api/v2/projects/'+encodeURIComponent(filename),method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName}),provider:'local'})`。**不包 try/catch 吞错**，让 4xx/5xx 抛。`projectService.js` 可加薄 `renameProject` 同样不吞错。
  - 测试：mock requester，断言发出 `PATCH` + `{name:newName}` + filename 经 encodeURIComponent；4xx 抛出（参照 `api/canvasAgentApi.test.js` 的 PATCH 断言范式）。
- **T2 · 后端 rename 同名冲突转 409**（deps：无）⚠️改用户机器 Python，需用户重启 server 生效
  - 文件：`services/json_file_route_service.py`
  - `_rename_project` 在 `os.rename` 前插：`if os.path.exists(new_path) and os.path.abspath(new_path)!=os.path.abspath(file_path): return self._json_err(409,'同名项目已存在')`。仅动这一处。
  - 测试：临时 canvas_dir 放两 `.json`，PATCH A→B 名 → 409 且 A 仍在/B 未覆盖；PATCH→新名 → 200 改名成功。

### 抽屉外壳层
- **T4 · 抽屉 mycanvas tab/pane + 分支**（deps：无，但 T5 填充内容）
  - 文件：`modules/unifiedSidebarDrawer.autoload.js`、`styles/theme-upgrade.css`
  - `innerHTML`：`.hy-ud-tabs` **最前**插 `<button class=hy-ud-tab data-tab=mycanvas>我的画布</button>`；`.hy-ud-body` 插 `<div class=hy-ud-pane data-pane=mycanvas hidden>`（搜索行+新建按钮+两区容器）。`switchTab` 增 `if(tab==='mycanvas'){hideExternalPanels();renderMyCanvases();}`（不进 else）。`updateFooterCount` 增 mycanvas 分支（`n=临时+已保存`，`unit='画布'`）。点外关闭选择器追加 `.hy-mycanvas-dialog`。
  - 测试：真机自验 `switchTab('mycanvas')` pane 可见、其它 hidden、footer 文案对；回归 canvas/asset/workflow 正常。
- **T3 · 工具栏「我的画布」按钮**（deps：T4）
  - 文件：`modules/headerControlsRelocate.autoload.js`、`styles/theme-upgrade.css`
  - 第 184~193 行间：`const ICON_MYCANVAS=<同风格 inline SVG>`；`makeBtn('hy-hc-mycanvas','我的画布',ICON_MYCANVAS,()=>openDrawer('mycanvas'))`。CSS 沿用 `.hy-hc-btn`。
  - 测试：真机 `.hy-hc-mycanvas` 存在、rect 非 0、DOM 序在 `.hy-hc-avatar` 后 `.hy-hc-node` 前、点击开抽屉 currentTab='mycanvas'。

### 渲染与弹窗
- **T5 · `renderMyCanvases` 两区渲染 + `savedTempCanvasMap` + 操作绑定**（deps：T0）
  - 文件：`modules/unifiedSidebarDrawer.autoload.js`（+ 引 T0）
  - 模块全局 `const savedTempCanvasMap=new Map()`。`renderMyCanvases()`：读 `CanvasTabManager._canvases/_activeId` 取临时；`await projectService.getProjects()` 取已保存（失败显式 toast+标错，**不当空态**；空数组再探确认真空）；`splitTempVsSaved`+`filterByName`+`sortSavedByMtime`(T0) 合成；临时行=[保存][删除]+当前徽标，已保存行=相对时间(`mtime*1000`)+[打开][删除]；双击名改名。写操作后 `renderMyCanvases()`(+必要时 `renderTabs()`)。新建按钮=`addCanvas()`+`renderMyCanvases()`。
  - 测试：真机 临时区≈左上角 `#canvasTabs`、已保存区≈磁盘、当前徽标、搜索过滤、新建同步。
- **T6 · 通用 `confirmDialog` + `namePrompt`**（deps：T4）
  - 文件：`modules/myCanvases/dialog.js`（新）或 autoload 内、`styles/theme-upgrade.css`
  - 独立 `.hy-mycanvas-dialog` overlay（仿 `.save-dialog` 视觉）。`confirmDialog({title,message,confirmText,danger})→Promise<boolean>`、`namePrompt({title,defaultValue})→Promise<string|null>`；Enter=确认 Esc=取消；每次重建/重绑（不复用单例按钮）；**勿触碰 `#saveDialogOverlay`**。
  - 测试：真机 打开弹窗时抽屉不被点外关闭；取消/确认/Enter/Esc 正确；与顶栏保存弹窗互不干扰。

### 操作层（多数 deps：T5,T6）
- **T7 · F6 保存单画布（含 currentProjectId 复位）**（deps：T5,T6）
  - `saveSingleCanvas(canvasId,name)`：`snap=getMultiDataSnapshot()`→`single=buildSingleCanvasSnapshot(snap,canvasId)`(T0)；存 `prevId/prevName`；`await saveProject(name,single)`；成功后**复位** `currentProjectId/Name`、`savedTempCanvasMap.set(canvasId,result.filename)`、`renderMyCanvases()`。失败（saveProject throw）→catch toast、不改 Map。命名走 T6（默认=画布名），`frontendSafeName` 比对提示「将覆盖」。
  - 测试：真机 命名→保存→移入已保存区/左上角标签仍在/临时区剔除；**关键回归**：保存后顶栏 `_v2SaveProject` 仍写对文件（currentProjectId 已复位）。
- **T8 · F7 删除临时画布**（deps：T5,T6）
  - [删除]→`confirmDialog(danger)`；`length<=1` 提示约束不调用；否则 `deleteCanvas(id)`（同步不 await）→重读 `_canvases.some(c=>c.id===id)`：仍在=失败 toast，消失=`savedTempCanvasMap.delete(id)`+`renderMyCanvases()`。删当前→`_activeId` 已切相邻，徽标随重渲。
  - 测试：真机 确认→删除→同步；删最后一个触发约束；删当前后徽标落相邻。
- **T9 · F8 打开=追加（非替换）** ✅已实现+真机验证（deps：T5）
  - ⚠️ **用户 2026-06-23 纠正**：新建/打开【绝不覆盖或删除未保存画布】。旧"打开=替换(init)"作废。
  - `mcOpenSaved(filename)`：`loadSavedProjectRaw`（裸GET，404→null/其它抛）→`resolveCanvasData`→取 `activeCanvasId` 那张（多画布只取活动一张）→工作区同名标签则 `switchTo`，否则 `addCanvas()+renameCanvas(_activeId,projName)`→`hydrateActiveCanvasSnapshot(active)`→`renderTabs()`→`savedTempCanvasMap.set(targetId,filename)`（归已保存、剔出临时）→设 `currentProjectId/Name/_v2CurrentFile`→`renderMyCanvases()`。**无确认弹窗、不丢未保存、不调 init/clear**。`tm.commit` 不存在（addCanvas/hydrate 自带持久化）。
  - 测试：真机验证过——工作区+1、未保存全保留、切到打开的、归已保存不进临时、currentProjectId 设对、无弹窗、清理恢复。
- **T10 · F9 删除已保存**（deps：T5,T6）
  - [删除]→`confirmDialog`→`ok=await deleteProject(filename)`（吞错返 false）；**二次校验**重拉 `getProjects` 仍含→失败 toast；消失→把 Map 里 `value===filename` 的条目 delete（对应 canvasId 回临时区）；若 `currentProjectId===filename`→提示并重置为新草稿（防悬空 404）；`renderMyCanvases()`。
  - 测试：真机 确认→删除→移除；映射回退；删当前项目指针不悬空。
- **T11 · F10 重命名临时画布**（deps：T5）
  - 双击 `contentEditable`/临时 input，回车/失焦提交、Esc 取消。空/同名→提示保持原名；否则 `renameCanvas(id,newName)`（同步）→**`renderTabs()`**（renameCanvas 不自动）→`renderMyCanvases()`。
  - 测试：真机 改名生效/左上角同步；空名/Esc 保持原名。
- **T12 · F11 重命名已保存（PATCH+409/500+映射）**（deps：T1,T2,T5,T6）
  - 双击改名→trim 空提示保持；否则 `try await renameV2ProjectOnServer(filename,newName)`(T1，会抛)；成功→更新 Map 里 `value===oldFilename`→新 filename、若 `currentProjectId===old` 同步、`renderMyCanvases()`。catch 按 status 分支：409『同名项目已存在』、404『项目不存在(请刷新)』、其它『改名失败』。pending 期禁用该行操作防连点竞态。
  - 测试：真机 改名→已保存区更新/磁盘改名；同名→409 可读（依赖 T2）；映射/指针同步。
- **T13 · F12/F13 搜索 + mtime 排序接线**（deps：T0,T5）
  - 顶部 input `oninput`→存模块变量→`renderMyCanvases` 内两区先 `filterByName`(T0) 再渲染；已保存 `sortSavedByMtime`(T0)；相对时间 `mtime*1000` 格式化（借 `CanvasProjectDropdownManager` 日期范式）。搜索无匹配空态『无匹配结果』，数据空『暂无未保存/已保存画布』（区分）。
  - 测试：纯逻辑由 T0 覆盖；真机 输入实时过滤/清空恢复/倒序/空态文案区分。

### 建议实现顺序
`T0 ∥ T1 ∥ T2`（基础+测试）→ `T4`（抽屉壳）→ `T5`（渲染）→ `T3`（工具栏按钮）→ `T6`（弹窗）→ `T7…T13`（操作，多数可并行，T12 依赖 T1/T2）。每步：纯逻辑跑 `node:test`、UI 跑 Chrome 扩展真机自验，绿了再下一步。

---

## 4. 跨切面与风险

- **死副本陷阱**：只认 `modules/`+`services/` 部署文件，忽略 `output/upstream/AI-CanvasPro/src/...`。prod 路由若是冻结 `.exe`（`Get-NetTCPConnection -LocalPort 8777` 查 OwningProcess 进程名）则磁盘改动不生效，需用户重启 dev/重打包。
- **自验铁律**：Chrome 扩展取真实单例 **bare import** `'/src/core/stores/appStore.js'`、读 `window.CanvasTabManager`，**严禁 `?v=`**（幻影模块）；量面板用 `getBoundingClientRect` 非 `display`；CSS 改热替换 `?v=Date.now()` 不整页刷新，JS 改才 reload。
- **全局指针劫持**：`saveProject`/`openProjectReplace` 都写 `currentProjectId/Name`；T7 复位、T9/T10/T12 同步任一漏写→顶栏保存/自动保存越权覆盖或 404 悬空。实现后**必须真机验证顶栏保存仍写对文件**。
- **两套 key 不一致**：`Map<canvasId,filename>` 在删除/改名/同名覆盖任一处漏维护→画布凭空消失。本功能最易出 bug 点。
- **Windows os.rename 同名 500**：未做 T2 则前端只能吞 500 猜原因。后端是用户机器（可能 frozen），改 Python 需用户重启。
- **sanitize 碰撞静默覆盖**：异原名经 `_safe_name` 同文件名 POST /save 静默覆盖；前端 `frontendSafeName` 复刻比对才能提示「将覆盖」。
- **底层吞错**：getProjects/loadProject/deleteProject 静默吞错；面板不二次校验则踩 §9 验收红线。
- **非活动画布快照**：`saveSingleCanvas` 取非活动画布须经 `getMultiDataSnapshot()`，直读 `_canvases[i]` 可能陈旧/空；实现前用扩展实测。

---

## 5. 测试与验收

### 5.1 纯逻辑单测（`node --test`）— T0/T1（前端）、T2（后端）
- `myCanvasesLogic`（8 函数）：filter/sort/单画布快照/selectTempCanvases/frontendSafeName/findOverwriteTarget/ensureJsonName/buildRenameRequest 全边界（含 rename body 键是 `name` 而非 newName）。
- `renameV2ProjectOnServer`：PATCH 形态 + 4xx 抛。
- 后端 `_rename_project`：同名→409、新名→200。

### 5.2 真机自验（Chrome 扩展，`127.0.0.1:8777`，**不点付费按钮**）
入口位置（齿轮↔节点间）、tab 顺序、两区渲染一致、新建同步、保存→移区 + **顶栏保存回归**、打开→真替换 + Map 清空、删除临时（同步+确认+约束）、删除已保存（二次校验+映射回退+指针不悬空）、改名（临时/已保存/409）、搜索/排序/空态区分、点弹窗不关抽屉、回归其它 tab/PI 互斥。

### 5.3 验收判据
- 13 类功能真机自验通过且有证据（截图/读 DOM/读 store/读磁盘）。
- 纯逻辑单测全绿、`node --check` 通过。
- 失败路径**显式报错**（无静默吞）。
- 顶栏保存/自动保存写文件**未被本功能污染**（全局指针复位验证）。
- 未破坏左上角标签、其它抽屉 tab、PI 互斥、save-dialog 既有保存。

---

## 6. 待用户拍板 / 配合项（默认值已选，可改）

1. **替换不可撤销**：打开=`init` 替换工作区，`init` 不 commit() → **无 undo**。默认：接受（与「打开=替换」一致）。若要可撤销需替换后补快照（超最小改动）。
2. **全屏 3D 导演编辑器（z-index 6000）下**：抽屉 z-index 1100 会被盖住。默认：**本版不支持在全屏 3D 模式打开「我的画布」**（该场景管理画布无意义）。若要支持需抬层到 6200+（且禁给外壳加 transform/filter，见 CLAUDE.md）。
3. **空名/纯空白名**：后端保存兜成「未命名画布」、改名返 400（不一致）。默认：**前端先行校验阻止空名**，两路径统一。
4. **后端 409 改动（T2）**：需改用户机器 Python 文件并**由用户重启 server**生效（我只改码不动机器）。
5. **保存后再编辑该画布**：磁盘仍是旧快照、面板不追踪脏状态（YAGNI，§8 决策1 已接受刷新重置）。默认：已保存项加一句轻提示文案（可选）。

---

## 7. 与 PRD(doc 26) 的关系

本文**核验并修正** doc 26 的 §6/§7/§8/§9/§10/§14 若干假设（见 §0 表）。实现以本文为准；doc 26 保留为需求意图与范围的来源。
