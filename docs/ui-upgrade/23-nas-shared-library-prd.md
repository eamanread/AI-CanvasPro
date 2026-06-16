# 幻映 · 团队共享库（NAS 公共存储）产品设计文档 / PRD

- 版本：**v0.3**（方案已定稿：采用乙 / 4.2-B）
- 日期：2026-06-16
- 范围：让团队把"资产 / 工作流 / 预设 + 其媒体"放到一个共享文件夹（NAS）上，多人共用一份库；安全网为"管理员手动备份"。
- 关联评估：本 PRD 每条结论均基于真实代码取证。**行号以函数名为准、行段为辅**（代码会漂移，认符号名更稳）。

### 决策记录（2026-06-16，需求方拍板）

- **采用乙 / 4.2-B**（库目录直接含 `output/`、`uploads/`，媒体相对路径天然解析、不裂图）。否决 4.2-A（见附录 A）与丙折中。
- **共享范围边界（已确认）**：需求方主动共享的只有**资产 / 工作流 / 预设**三样；`output/`、`uploads/` 作为这三样的**配套媒体**一并放入库目录（否则资产裂图），但**不在软件内暴露为"输出画廊"**——幻映无列举 output 的接口，资产库只显示已保存资产，个人画布本地不共享，故正常使用软件的同事不会刷到他人原始生成；仅直接浏览 NAS 文件夹可见（靠 NAS 权限/约定管控）。
- **绝不共享**：`config.json`（API Key / 模型配置）、`settings.json`、个人画布（`Canvas Project/`）、`vimax_runs/`。

### v0.2 相对 v0.1 的关键变化（review 驱动）

1. **默认方案从 4.2-A（保存时复制媒体进库 + 新建 `/library-media` 虚拟根）翻转为 4.2-B（库目录直接含 `output/`、`uploads/`，媒体相对路径天然解析）。** 原因：4.2-A 会在 `data/uploads/` 来源、派生图链路、存量资产、7+ 路径字段 / `nodes[]` 双副本四处裂图，且成本接近"较大"；4.2-B 把这些全部规避（详见附录 A）。
2. 修正全文 `file:line`（v0.1 系统性漂移，多处指向错误函数）。
3. 补齐被漏掉的改动：`Sam3Service.assets_dir` getter 化、自定义预设根 getter 化、`libraryDir` 独立设置项与持久化、启动期"不可达不静默回退"、库状态探测/计数 API。
4. 把"中等改造（4 处）"诚实改为"中等改造（约 8–10 处小改，无单点大改）"。
5. `§12` 取舍表补上之前回避的真实风险（SMB `os.replace` 未验证、坏 JSON 静默吞空在 SMB 变高频、大库 N×SMB 延迟）。

---

## 0. TL;DR（给决策者）

- **要做的事**：设置里新增一个"**团队共享库目录**"。用户把它指到一个 NAS 共享文件夹后，幻映把"**资产 / 工作流 / 预设，以及它们引用的图片/视频（output、uploads）**"全部读写到那个文件夹。其他人把各自机器也指到同一文件夹，刷新后自动看到同一份库。备份 = 管理员定期拷这一个文件夹。
- **为什么可行**：幻映的"库"本质是**目录 + 实时扫描**（`_list_json_objects`，[json_file_route_service.py:135-147](services/json_file_route_service.py)），不是数据库。"往文件夹里放文件 = 库里自动出现"是它的原生行为。资产/工作流/逐文件预设都是**一文件一条、互相独立**，多人各建各的天然不打架。
- **媒体为什么不裂图**：资产用**相对路径**引用媒体（`imageUrl:/output/...`、`localPath:output/...`、上传图 `data/uploads/...`，实测多份 `data/assets/*.json`）。只要 `output/` 和 `uploads/` 也在同一个共享库里，这些相对路径在每个人的 server 上都解析到同一个 NAS 位置——**不改一个字节路径就不裂图**。这正是 v0.2 的核心。
- **必须改的代码（中等，约 8–10 处小改，无单点大改）**：① 让 `ASSETS_DIR/WORKFLOWS_DIR/thumbs` 跟随新设置（今天冻结在 `data/`，[server.py:231-234](server.py)，而 `_refresh_storage_globals` 不刷新它们，[server.py:459-477](server.py)）；② 预设路径跟随（系统整表 lambda [server.py:783](server.py) + 自定义预设根新增 getter）；③ `Sam3Service.assets_dir` 改 getter（否则抠图拒绝库内资产，[server.py:761](server.py)+[sam3_service.py:21,332](services/sam3_service.py)）；④ `output/uploads` 指到库（二者**已经**是运行时可跟随的，几乎零成本）；⑤ 输出文件名加机器前缀防多机撞号（[server.py:1866-1885](server.py)）；⑥ 关掉/绕开打包版出厂覆盖对共享预设的影响（[runtime_paths.py:178-189](services/runtime_paths.py)）；⑦ 预设整表改原子写 + SMB 重试（[library_file_route_service.py:176-184](services/library_file_route_service.py)）；⑧ 新增 `libraryDir` 独立设置项 + 持久化 + 校验；⑨ 启动期库不可达时**不静默回退本地**（[server.py:639-649](server.py)）；⑩ 库状态探测/计数 API（§6 用，现为 0 起点）。
- **明确接受的取舍**：同一条目被两人同时编辑 = 后写者赢、无锁、不合并、当场无报错；靠"低频同改的纪律 + 管理员手动备份"兜底。**原始生成（output）也会共享**（这是媒体不裂图的代价，见 §12 / 开放问题 1）。不引入账户、权限分级、跨进程锁、云存储。
- **不需要做的事**：app 层登录/鉴权（形态A 下每人跑自己机器的 `127.0.0.1` 服务、谁也不连谁，访问控制交给 NAS 共享权限）。

---

## 1. 背景与问题

幻映目前是**本地优先**架构：每台机器各自跑一个本地 Python HTTP 服务器（[server.py](server.py)）+ 浏览器前端，默认只绑 `127.0.0.1`（`BIND_HOST`，[server.py:175](server.py)）。数据是一堆 JSON 文件 + 媒体文件，存在本机磁盘。

痛点：**团队成员之间无法共用资产、工作流、预设**，重复劳动、风格不统一、好素材沉在某个人机器上。

需求方已确认：用户指定**一个文件夹**作为存储、系统**自动获得**其下内容；多人指向同一 NAS 文件夹**共用一份库**；安全靠**管理员手动备份**；部署为**形态A**（每人本机各跑 server，都指向同一 NAS，非中心服务器）；语义为**公共可读写库 + 个人本地数据分开**；改造**中等**（可改后端+UI，不引入账户）；范围**仅 NAS**。

---

## 2. 现状：真实代码事实（设计依据）

> 行号以函数名为准。以下均已核实。

### 2.1 "库"是目录实时扫描，不是数据库

- 列资产：`GET /api/v2/assets` → `_list_json_objects(assets_dir)` 对目录 `os.listdir` + 逐个读 `.json`（`_list_json_objects`，[json_file_route_service.py:135-147](services/json_file_route_service.py)）。**每次请求实时扫**，无缓存索引。
- 列工作流：同理（`handle_get`，[json_file_route_service.py:266-269](services/json_file_route_service.py)）。
- 自定义预设：扫 `<user>/prompt/<类型>/*.txt`（`_read_presets`，[library_file_route_service.py:187-215](services/library_file_route_service.py)）。
- 含义：**把文件丢进目录 = 库里自动出现**（下次列表请求生效）。全仓**无 SQLite / 无嵌入式数据库**。

### 2.2 数据是逐文件、互相独立的

- 资产 = `<assets>/<id>.json`（`_save_asset`，[json_file_route_service.py:182-191](services/json_file_route_service.py)）。
- 工作流 = `<workflows>/<id>.json`，默认 `scope=private`（`_save_workflow`，[json_file_route_service.py:193-204](services/json_file_route_service.py)）。
- id = "时间戳 + 随机串"，近乎不撞。**多人各建各的落到不同文件，互不干扰。**

### 2.3 媒体用相对路径引用，且来源有两类（决定方案）

实测 `data/assets/*.json`：

- 生成图：`imageUrl:/output/gen_…png`、`localPath:output/gen_…png`、`thumbUrl:/output/…`。
- **上传参考图**：`localPath:data/uploads/upload_…jpg`、`originalLocalPath:data/uploads/…`（实测 `asset-1781351607617-…json` 媒体 100% 来自 `data/uploads/`）。
- `sourceUrl:https://file5.aitohumanize.com/…` 是会过期的供应商 CDN，**不可依赖**。
- 单张图带 7+ 路径字段（`sourceUrl/thumbUrl/imageUrl/localPath/originalLocalPath/displayLocalPath/thumbLocalPath`）+ 顶层 `coverUrl`、`items[].thumbSrc`，且节点在 `items[].nodeData` 与 `nodes[]` **各存一份**。
- 服务端把 `/output/`、`/data/uploads/`、`/data/assets/`、`/data/workflows/` 映射到磁盘后流式吐给浏览器（`translate_path` 的 virtual_roots，[server.py:1923-1941](server.py)，读全局在 1926-1930）。
- 资产库 UI 的显示图/缩略图还会走 `/api/v2/images/derivatives/ensure` 生成派生图，其虚拟根解析只认 `output/` 与 `data/uploads/`（`resolve_virtual_media_root`，[media_file_route_service.py:98-133](services/media_file_route_service.py)）。
- **含义（关键）**：要让共享资产不裂图，**最省事的是让 `output/` 和 `uploads/` 也在共享库里**，这样所有相对路径天然解析正确，无需改写路径、无需新建虚拟根、不碰派生链。这是 v0.2 选 4.2-B 的根本原因（附录 A 解释为什么"复制媒体进库 + 新虚拟根"的 4.2-A 反而又贵又会裂）。

### 2.4 路径如何派生、哪些能改、哪些今天改不动

- 所有存储路径从单一 `writableRoot` 派生（`build_runtime_paths`，[runtime_paths.py:74-101](services/runtime_paths.py)）。
- **已经运行时可改的**（UI 设置 `fileSavePaths` 保存 → `_apply_file_save_paths` → `_refresh_storage_globals`）：`USER_DIR / OUTPUT_DIR / UPLOADS_DIR`。`_refresh_storage_globals` 的 `global` 列表确实含 `OUTPUT_DIR/UPLOADS_DIR`（[server.py:459-477](server.py)，global 在 460-461；UI 处理 [server.py:730-732](server.py)，`_apply_file_save_paths` 在 487-498，迁移分支 492-495）。`_normalize_storage_dir` 做 `expanduser+expandvars+abspath`、不校验存在性、不拒中文/UNC（[server.py:351-356](server.py)）。
- **import 时冻结、UI 改不动的**：`ASSETS_DIR / WORKFLOWS_DIR / *_thumbs`——只在模块加载时从 `writableRoot/data` 赋值一次（[server.py:231-234](server.py)），`_refresh_storage_globals` 的 global 列表里**没有**它们（[server.py:459-477](server.py)）。
- 含义：让用户"指定一个文件夹"对 `output/uploads` 几乎免费、对 `assets/workflows` 需把它们加进 `_refresh_storage_globals`（小改，§8.1）。

### 2.5 路径消费方式：大多 late-binding，少数按值冻结（决定改动面）

- ✅ late-binding（读模块全局、自动跟随）：`translate_path`（[server.py:1923-1941](server.py)）；`JsonFileRouteService` 的 `assets_dir_getter=lambda:ASSETS_DIR` / `workflows_dir_getter`（[server.py:770-778](server.py)，772-773）；`LibraryFileRouteService` thumbs getter（[server.py:781-782](server.py)）。
- ⚠️ 按值冻结（不会自动跟随，必须改 getter）：`Sam3Service` 在构造时按值收下 `assets_dir=ASSETS_DIR`（[server.py:761](server.py)），内部 `self.assets_dir=os.path.abspath(...)`（[sam3_service.py:21](services/sam3_service.py)），用于抠图的 `_is_path_inside` 安全校验（[sam3_service.py:332](services/sam3_service.py)）。库搬到 NAS 后，SAM3 会因路径校验失败拒绝库内资产——**必须一并改 getter**。
- ⚠️ 无 getter（硬编码 user 目录）：自定义预设根 `os.path.join(self._get_user_dir(),'prompt')`（`_read_presets`/`_preset_root_dir`，[library_file_route_service.py:188,218](services/library_file_route_service.py)）；系统预设整表路径是 server 内联 `lambda:os.path.join(USER_DIR,'prompt-presets.json')`（[server.py:783](server.py)）。要让预设进库需各加/改注入点。

### 2.6 三个会咬人的写入热点

- **系统预设整表** `prompt-presets.json`：整表 `open(w)` 覆盖、非原子、无锁（`_write_preset_definitions`，[library_file_route_service.py:176-184](services/library_file_route_service.py)）。
- **出厂覆盖**：打包版启动时 private_defaults 对 `user/config.json`、`user/prompt-presets.json`、`user/prompt/`、`user/tools/` 是 `overwrite=True`（`_should_overwrite_private_default`，[runtime_paths.py:178-189](services/runtime_paths.py)，落盘 `writable_root/user`，复制在 212、marker 在 247）。
- **坏 JSON 静默吞空**：`_read_json_file` 遇任何异常 `return {}`（[server.py:333-340](server.py)）；列表里的 `_load_json_file` 同样静默跳过该条（[json_file_route_service.py:74-79](services/json_file_route_service.py)）。在 SMB 上，**文件被他机持写句柄时读侧 open 抛 PermissionError 也落进这个静默分支**，该条当场从列表消失（写完/释放后下次扫描恢复）。

### 2.7 形态A 的免费红利：不需要 app 鉴权

形态A 下每人跑自己机器的 `127.0.0.1` server，互不连接，共享介质是 NAS 文件系统。访问控制交给 NAS 共享权限（SMB ACL）即可，无需 app 登录/token。

---

## 3. 目标 / 非目标

### 3.1 目标

1. 设置里能指定一个"团队共享库目录"；资产/工作流/预设 + 其媒体（output/uploads）读写都落到那里。
2. 指到 NAS 后多人共用一份库；他人新增的条目**刷新后**自动出现（非实时推送）。
3. 个人配置（API key、模型注册表）、个人画布存档（`Canvas Project/`）、`vimax_runs/` **留本地、不共享**。
4. 备份 = 管理员手动拷库目录；任何单条损坏/被覆盖能从备份精确恢复，互不牵连。
5. 共享预设不会被打包版升级"打回出厂"。

### 3.2 非目标（YAGNI）

- ❌ 跨进程/跨主机文件锁、实时冲突检测、冲突合并 UI。
- ❌ 用户账户、登录、权限分级、操作审计。
- ❌ 自动同步守护进程、版本历史、内容寻址去重。
- ❌ 云对象存储（S3/MinIO）。
- ❌ 共享个人画布存档与个人 config/settings。
- ❌ 把某台机做成中心服务器（坚持形态A）。
- ❌（v0.2 明确放弃）"只共享精选资产、不共享原始生成"的隔离——它需要 4.2-A 式的媒体复制+路径改写，成本不匹配本轮（见附录 A、开放问题 1）。

---

## 4. 方案总览

### 4.1 一句话

新增一个"**团队共享库目录**"。系统在该目录下统一管理：

```
<库目录>/                      ← 用户指定，通常是 NAS 共享文件夹 \\NAS\huanying-lib
├── assets/      + thumbs/    ← 资产（逐文件 <id>.json）
├── workflows/   + thumbs/    ← 工作流（逐文件 <id>.json）
├── presets/
│   ├── prompt-presets.json   ← 系统预设整表
│   └── prompt/<类型>/*.txt    ← 自定义预设（逐文件）
├── output/                   ← 生成成品（资产用 /output/... 引用它）
└── uploads/                  ← 上传参考图（资产用 /data/uploads/... 引用它）
```

**留在本地、各归各人、不进库目录**：`<user>/config.json`（API key）、`<user>/settings.json`、`<user>/Canvas Project/`（个人画布）、`<user>/vimax_runs/`。

### 4.2 精髓：媒体随库走，路径不改一个字节

因为资产/工作流用相对路径 `/output/...`、`/data/uploads/...` 引用媒体（§2.3），只要把 `output/` 和 `uploads/` 也纳入库目录，**每个人的 server 把这些相对路径解析到同一个 NAS 位置**，媒体就不裂图。

- 不复制媒体、不改写 JSON 里的路径字段、不新建 `/library-media` 虚拟根、不碰 `derivatives/ensure` 派生链、不碰前端保存链路——这些正是 v0.1 的 4.2-A 会引入的、又贵又会裂图的东西（附录 A）。
- 代价：**原始生成 `output/` 也共享**（团队共用一个生成画廊）。配套只需一个小改：输出文件名加机器前缀防多机撞号（§8.5）。
- `output/uploads` 本来就已是运行时可跟随的全局（§2.4），把它们指到库目录几乎零成本。

### 4.3 为什么贴合代码

- "自动获取" = 复用现成目录实时扫描（§2.1），零新索引。
- "各建各的安全" = 复用现成逐文件模型（§2.2）。
- "媒体不裂图" = 复用现成相对路径解析（§2.3/§4.2），零路径改写。
- "手动备份够用" = 逐文件独立，恢复单文件不扰动其他（§2.6）。
- "无需 app 鉴权" = 形态A 的 loopback + NAS ACL（§2.7）。

---

## 5. 功能描述

| # | 功能 | 描述 |
|---|---|---|
| F1 | 指定库目录 | 设置面板新增"团队共享库目录"，用户填/选一个绝对路径（本地盘或 NAS UNC `\\NAS\share\huanying-lib`）。 |
| F2 | 自动获取 | 指定后，资产/工作流/预设列表实时来自该目录；他人新增条目在本端**刷新/重载后**出现（非实时推送）。 |
| F3 | 媒体随库 | `output/uploads` 纳入库目录，资产引用的图片/视频在任意成员机上都解析正确，不裂图（§4.2，无需复制/改写）。 |
| F4 | 首次迁移 | 第一次设库目录时，把本机已有的 assets/workflows/presets/output/uploads **补缺式复制**进库（需新增迁移分支，§8.7；**路径无需改写**）。 |
| F5 | 个人数据隔离 | config/settings/画布存档/vimax_runs **不**进库目录，留本地。 |
| F6 | 库状态可见 | 设置面板显示当前库目录、是否可达、是否可写、各类条目数；NAS 不可达时**明确报错**而非静默回退（§8.9）。 |
| F7 | 备份指引 | 文档/设置页说明"如何手动备份库目录"（§10.3）。 |

---

## 6. UI 设计

### 6.1 入口

复用现有"文件保存路径"设置区（现有三框 userDir/outputDir/tempDir，[modules/settings/fileSaveSettings.js](modules/settings/fileSaveSettings.js)，重度混淆），其下新增"团队共享库"分区：

```
┌─ 团队共享库 ────────────────────────────────────────────┐
│  库目录   [ \\NAS\share\huanying-lib            ] [选择] │
│           资产 / 工作流 / 预设及其媒体(output/uploads)都存这里 │
│  状态     ● 已连接 · 可读写 · 资产128 / 工作流14 / 预设36 │
│           （或 ⚠ 无法访问该路径 / 🔒 只读，新增将失败）   │
│  说明     启用后，输出与上传也会写入库目录(团队共享生成结果)。│
│           个人 API Key / 画布存档仍留本机、不共享。        │
│  备份     库即这一个文件夹，定期整盘拷贝即可备份。[详情]   │
│                              [ 取消 ]   [ 保存并迁移 ]    │
└──────────────────────────────────────────────────────────┘
```

要点：

- **一个**目录框（对齐"指定一个文件夹"）；assets/workflows/presets/output/uploads 作为子目录由系统自动建（仿 `ensure_runtime_dirs`，[runtime_paths.py:105-117](services/runtime_paths.py)）。
- 明确告知"启用后 output/uploads 也共享"——这是 §4.2 的代价，必须让用户知情。
- "选择"按钮：**纯浏览器前端的 File System Access API 拿不到 UNC 实路径**，务实做法是**先支持手填绝对路径 + 后端校验/写探针**，图形目录选择器列为后续可选（呼应开放问题 2）。
- 状态行的"可达/可写/条目数"来自一个**新增的后端探测端点**（§8.10，现为 0 起点）。

### 6.2 交互细节

- 保存后做一次写探针（库目录写一个 `.huanying_probe` 临时文件再删）判断真实可写，结果进状态行——避免"看着已连接、其实只读/掉线"。
- 路径含中文/空格/UNC 全部允许（`_normalize_storage_dir`，[server.py:351-356](server.py)）。
- 切换库目录是重操作（迁移+刷新全局），保存时二次确认，说明"会把本机现有库复制到新位置，且之后读写都走新位置；output/uploads 也将共享"。

---

## 7. 交互流程

### 7.1 首次配置（管理员）

1. NAS 建共享 `\\NAS\share\huanying-lib`，设权限（§10.2）。
2. 管理员在设置里填该路径 → 保存并迁移 → 系统建子目录并把本机已有库 + 媒体复制进去。
3. 正常使用即可，资产/生成自动落库。

### 7.2 成员接入

1. 成员填**同一路径** → 保存。
2. 因目录已有内容，列表立即显示团队库，且媒体不裂图。
3. 各自新建条目落到库里新的 `<id>.json`，他人刷新后可见。

### 7.3 "自动获取"的刷新语义（明确边界）

- 服务端列表**实时扫描**，永远最新；但**浏览器前端把列表缓存在内存**，他人新增条目需本端**重新拉列表（切面板/手动刷新）或重载应用**才出现，**非实时推送**。
- 可选增强：资产库面板加"刷新"按钮 + 打开面板时自动重拉。

### 7.4 并发语义（接受的行为）

- 两人新建不同条目：✅ 互不影响。
- 两人同时编辑**同一条 id**：⚠️ 后保存者整文件覆盖先保存者，**无锁、无合并、当场无报错**。约定"同一条目同一时间一个人改"，事后靠备份恢复。
- 两人同改**系统预设整表**：⚠️ 风险最高（一次覆盖抹多条）。缓解：§8.7 原子写 + 约定单人维护；自定义预设（逐 txt）不受此限。
- 两机生成同名 `gen_…png`：§8.5 机器前缀避免。

### 7.5 NAS 掉线/不可达

- 运行中库目录不可达：UI 状态行变 ⚠️、列表显示"库不可达"而非空库，**提示检查 NAS，不自动回退本地**（避免"以为写 NAS、其实写本机"的状态分裂）。启动期同理（§8.9）。

---

## 8. 数据层调整（约 8–10 处小改，无单点大改）

> 原则：复用现成机制（`_refresh_storage_globals` 的可刷新全局、`fileSavePaths` 的迁移、`_atomic_write_json`），把新概念"库目录"接进去。

### 8.1 让资产/工作流目录跟随"库目录"（核心，中）

- 把 `ASSETS_DIR / WORKFLOWS_DIR / ASSET_THUMBS_DIR / WORKFLOW_THUMBS_DIR` 加进 `_refresh_storage_globals` 的 `global` 声明并按 `libraryDir` 重算（[server.py:459-477](server.py)，当前 global 在 460-461 不含它们）。
- 可行性依据（已核实）：`translate_path`（[server.py:1923-1941](server.py)，读全局 1926-1930）与 `JsonFileRouteService` getter（[server.py:770-778](server.py)）、thumbs getter（[server.py:781-782](server.py)）都是 late-binding，重新赋值后即读到新值。

### 8.2 `Sam3Service.assets_dir` 改 getter（小，但不可漏）

- `Sam3Service` 现按值收 `assets_dir`（[server.py:761](server.py)、[sam3_service.py:21](services/sam3_service.py)），抠图 `_is_path_inside` 校验用它（[sam3_service.py:332](services/sam3_service.py)）。
- 改为 provider/getter（对齐已有 `uploads_dir_provider/output_dir_provider`，[server.py:762-763](server.py)），否则库迁移后 SAM3 抠图拒绝库内资产。

### 8.3 预设路径跟随库（中）

- 系统整表：把 server 内联 `lambda:os.path.join(USER_DIR,'prompt-presets.json')`（[server.py:783](server.py)）改为指向 `libraryDir/presets/prompt-presets.json`。
- 自定义逐 txt（**无 getter**）：给 `LibraryFileRouteService` 新增 `preset_root_getter`，并改 `_read_presets`/`_preset_root_dir`/`_save_prompt_preset` 三处（[library_file_route_service.py:188,218,250+](services/library_file_route_service.py)）读它，指向 `libraryDir/presets/prompt/`。注意保持 `user_dir` 仍本地（§4.1）。

### 8.4 `output/uploads` 指到库（小，二者已可跟随）

- `OUTPUT_DIR/UPLOADS_DIR` 已在 `_refresh_storage_globals` 的 global 列表（§2.4）。当 `libraryDir` 启用时，令 `OUTPUT_DIR=libraryDir/output`、`UPLOADS_DIR=libraryDir/uploads`，覆盖独立的 `fileSavePaths.outputDir/tempDir`（定义优先级：libraryDir 启用时它说了算）。
- 这一步让 §2.3 的相对媒体路径天然解析到库，无需任何路径改写。

### 8.5 输出文件名加机器前缀（小，4.2-B 必做）

- `_next_gen_output_filename` 的序号只有进程内锁（`_gen_seq_lock`，[server.py:1866-1885](server.py)，锁在 1868；序号扫描 `_scan_max_gen_seq_for_date` 在 1847）。多机共享 `output` 会撞名互相覆盖。
- 文件名加机器标识/uuid 前缀（如 `gen_<machineId>_YYYYMMDD_NNNN.png`），消除跨机撞号。

### 8.6 关掉/绕开出厂覆盖对共享预设的影响（小）

- 预设迁到 `libraryDir/presets/` 后，private_defaults 的覆盖命中条件是字面 `user/...`（[runtime_paths.py:178-189](services/runtime_paths.py)，落盘 `writable_root/user`），**对已迁出的库预设自然不再命中**——这一步主要靠 §8.3 的路径迁移达成。
- 仍需做：① 确认 seed 不会被写进 `libraryDir`；② marker `.private_defaults_applied.json` 保持落本地 `writable_root`（[runtime_paths.py:247](services/runtime_paths.py)）以免多机互判 already-applied；③ 迁移后清理/重定向 `user/` 下旧预设残留，避免误导。
- （注：`config.json` 全程留本地、每机各自，**无需**改其 overwrite——v0.1 把 config 当共享配置是错的，已纠正。）

### 8.7 预设整表原子写 + SMB 重试（小）

- `_write_preset_definitions` 的 `open(w)`（[library_file_route_service.py:176-184](services/library_file_route_service.py)）改为 temp + `os.replace`（仿 `_atomic_write_json`，[server.py:1831-1845](server.py)），**并包跨平台重试**应对 SMB `ERROR_SHARING_VIOLATION`。
- 资产/工作流写入对齐：把已注入的 `_atomic_write_json`（注入在 [server.py:777](server.py)，定义 1831-1845）用到 `_save_asset/_save_workflow`（当前走非原子 `_write_json_file`，[json_file_route_service.py:190,203](services/json_file_route_service.py)）。
- ⚠️ SMB 上 `os.replace` 的原子性/占用行为未经验证，**重试是实现必做项**（§11.2、§12）。

### 8.8 `libraryDir` 设置项与持久化（中）

- `libraryDir` 为**独立设置键**，不并入 `fileSavePaths`（后者经 `_validate_file_save_paths` 只认 userDir/outputDir/tempDir 三键、其余静默丢弃，[server.py:359-367,393-417 区](server.py)）。
- 独立读/写/校验，持久化进 system settings（每机独立，本就落本机 LOCALAPPDATA）。
- 校验：`libraryDir` 不得与 `userDir` 相同或互相嵌套；保存时做 §6.2 写探针。

### 8.9 启动期"不可达不静默回退"（小-中）

- 启动期 `try: _apply_file_save_paths(...) except: 回退 DEFAULT_*`（[server.py:639-649](server.py)）当前会静默回退本机默认。改为：**库目录不可达时停在"未连接"态、由 UI 报错，不回退本地**。
- 运行时保存路径（`_apply_file_save_paths` 内 `os.makedirs`，[server.py:487-498](server.py)）NAS 不可达时本就直接抛错；两者口径统一为"明确报错、不回退"。

### 8.10 库状态探测/计数 API（中，0 起点）

- 新增端点：库目录可达性（`os.access` + 写探针）、可写性、各类条目计数（`os.listdir` 计数）。供 §6 状态行。
- 注意：计数对大库要 `os.listdir` 经 SMB，是 §12 承认的慢路径，状态行计数可做成异步/懒加载。

### 8.11 首次迁移（中）

- 现成 `migrate=True` 只 `_copy_missing_tree` 三棵树（userDir/outputDir/tempDir，[server.py:492-495](server.py)，`_copy_missing_tree` 定义 420-440），**不含 assets/workflows/presets**。需**新增迁移分支**把 `assets→library/assets`、`workflows→library/workflows`、`user/prompt-presets.json + user/prompt/→library/presets`、本机 `output/uploads→library/output|uploads` 复制进库。
- **4.2-B 下路径无需改写**（媒体相对路径在新位置照样解析），这是相对 4.2-A 省掉的最大块。
- 大库（数千 JSON + 媒体经 SMB 串行 `shutil.copy2`）可能耗时数分钟~数十分钟：迁移做成**可中断幂等**（copy-missing 天然幂等）+ 进度回显 + 迁移期锁定库切换。

---

## 9. 错误处理与边界

| 场景 | 现状（代码） | 本方案处理 |
|---|---|---|
| 库目录不可达（启动期） | `try/except` 静默回退本机默认（[server.py:639-649](server.py)） | §8.9 改为停在"未连接"、UI 报错、不回退 |
| 库目录不可达（运行时保存） | `os.makedirs` 直接抛（[server.py:487-498](server.py)） | 捕获后 UI 明确报错，与启动期口径统一 |
| 文件写一半被读 | 坏 JSON → 该条暂时消失（[server.py:333-340](server.py)、[json_file_route_service.py:74-79](services/json_file_route_service.py)） | §8.7 原子写缩小撕裂窗口；**SMB 上 `os.replace` 原子性未验证**，§11.2 真机确认前不下"已消除"结论 |
| 并发读撞他机写句柄 | open 抛 PermissionError → 被静默吞 → 列表丢该条 | 接受为**已知体验降级**（SMB 抖动下变高频）：写/释放后下次扫描自愈；§11.2 专项测消失频率与恢复时延 |
| 同一条目并发写 | 后写赢、无报错 | 接受（§7.4）；备份兜底 |
| 系统预设整表并发写 | 一次抹多条 | §8.7 原子写 + 单人维护约定 |
| 媒体 | 相对路径 | §4.2 output/uploads 随库，天然解析、不裂图 |
| 库只读（成员无写权） | 写抛错 | §6.2 写探针提前探测，UI 标"🔒只读"，新增动作友好提示 |
| 大视频预览 | 整文件/Range 64KB 经 server 过 SMB（[server.py:2005-2037](server.py)，bufsize 在 2031） | 文档提示受 SMB 带宽影响；本轮不优化 |
| 超大库列表 | `os.listdir`+逐文件 `json.load` 串行（[json_file_route_service.py:135-147](services/json_file_route_service.py)） | 文档提示数千条经 SMB 首屏变慢；§13 列"列表缓存/分页"为后续 |

---

## 10. 配置与部署

### 10.1 形态A 部署

1. NAS 建共享 `\\NAS\share\huanying-lib`。
2. 每台成员机保证能访问该 UNC（**优先用 UNC，避免映射盘符在重启/服务上下文不可见**）。
3. 各自跑本机 `启动项目.bat`（server 仍绑 `127.0.0.1`，无需 LAN 模式、无需 app 鉴权）。
4. 各自在设置里把"库目录"指到同一 UNC。

### 10.2 访问控制（交给 NAS）

- 管理员账号：库目录可读写。
- 成员账号：按团队策略给读写或只读（配合 §6 状态行"🔒只读"）。
- 不在 app 层做登录/权限（§2.7）。

### 10.3 备份（管理员手动）

- 库 = 一个文件夹，备份 = 定期整盘拷贝（NAS 快照 / 计划任务 robocopy / 手动复制）。
- 逐文件独立，单条损坏可从备份**只恢复那一个文件**。
- 系统预设整表是"一次可丢多条"的点，改它前后多备一次。

### 10.4 个人数据

- config/settings/画布/vimax_runs 留本机默认位置，不进库；各人 API key/画布互不可见。

---

## 11. 测试计划

### 11.1 单元/集成（`node --test` / `python -m unittest`，沿用现有风格）

- `runtime_paths`/`_refresh_storage_globals`：新增 `libraryDir` 派生 assets/workflows/presets/output/uploads 正确；刷新后 `ASSETS_DIR/WORKFLOWS_DIR/thumbs` 确实改变，getter 与 `translate_path` 读到新值（参照 [server_runtime_paths_test.py](server_runtime_paths_test.py)）。
- `Sam3Service`：assets_dir 改 getter 后，库内资产抠图 `_is_path_inside` 通过。
- 预设：系统整表与自定义 txt 均落 `libraryDir/presets`；整表原子写；private_defaults 不再覆盖库内预设（参照 [private_defaults_test.py](private_defaults_test.py)、[library_file_route_service_test.py](library_file_route_service_test.py)）。
- 列表扫描：目录放入文件后列表实时包含（参照 [json_file_route_service_test.py](json_file_route_service_test.py)）。
- 输出命名：多"机器前缀"下不撞号。
- `libraryDir` 设置：独立键持久化、校验拒绝与 userDir 嵌套。

### 11.2 真机 NAS 冒烟（不可省，代码假设本地 NTFS）

1. 两机指同一库，各建不同资产 → 双方刷新后互见。
2. **媒体不裂图**：A 机生成/上传并存的资产，B 机打开能看到图（验证 §4.2）。
3. 两机同时写**同一 id** → 结果"后写赢、文件完好"，非半截/损坏。
4. **并发读（高频失败路径）**：A 机持续写/覆盖某 id，B 机反复拉列表，统计该条消失频率与恢复时延，确认只是暂时消失非永久丢失。
5. **SMB `os.replace`**：两进程同毫秒写同一文件，检查是否产生空/坏文件、是否抛 `ERROR_SHARING_VIOLATION`——**决定 §8.7 重试参数，是阶段2交付门禁**。
6. 拔网/断 NAS → 行为符合 §8.9（明确报错、不静默回退）。
7. 库设成员只读 → 新增友好失败、不崩。

---

## 12. 风险与取舍（显式承诺，不回避中危）

| 取舍 | 选择 | 理由 / 边界 |
|---|---|---|
| 并发写同一条目 | 接受后写赢、不加锁 | 逐文件冲突面小、低频；加跨进程锁属较大改造，超本轮 |
| 数据安全网 | 管理员手动备份 | 逐文件独立→可精确恢复单条 |
| 原始生成 output | **一并共享** | 媒体不裂图的代价；团队共用生成画廊（开放问题 1） |
| 实时性 | 刷新可见，非实时推送 | 推送需额外机制，非目标 |
| **SMB `os.replace` 原子性** | **未验证，阶段2真机门禁前不下"消除撕裂窗口"结论** | 见 §8.7/§11.2.5；需带重试 |
| **坏 JSON / 被占用文件静默吞空** | 接受为已知体验降级 | SMB 抖动下变高频；写完下次扫描自愈 + 备份兜底（§2.6/§9） |
| **超大库 N×SMB 列表延迟 + 缩略图经 SMB** | 本轮接受、不优化 | 数千条首屏变慢；§13 后续做缓存/分页 |
| 鉴权 | 交给 NAS 权限 | 形态A loopback，无网络暴露 |

---

## 13. 落地阶段与验收

- **阶段 1**：§8.1（assets/workflows 跟随）+ §8.2（Sam3 getter）+ §8.3（预设跟随）+ §8.4（output/uploads 指库）+ §8.8（libraryDir 设置/持久化）+ §6 UI + §8.10 探测 API。验收：单机把库指到另一目录，资产/工作流/预设/媒体照常读写、SAM3 抠图正常、不被升级打回出厂。
- **阶段 2**：§8.5（机器前缀）+ §8.6（出厂覆盖收口）+ §8.7（原子写+SMB 重试）+ §8.9（不可达明确报错）+ §8.11（迁移分支）。验收：A 机存的带图资产 B 机打开有图；断 NAS 明确提示；§11.2 真机冒烟（尤其 4、5）全过。
- **阶段 3**：写《管理员部署+备份手册》（§10）。
- **后续可选（非本轮）**：系统预设拆逐文件；列表缓存/分页应对超大库；"个人草图与团队成品分流"（若开放问题 1 决定不共享原始生成）。

### 验收总标准

两台机指同一 NAS 库，能共用一份资产/工作流/预设，新增刷新后互见，**带图资产不裂图（含 output 与 uploads 两类来源）**，SAM3 抠图对库内资产可用，共享预设不被出厂覆盖，单条损坏可从备份精确恢复；全程无需 app 登录；个人 API key/画布不外泄。

---

## 14. 开放问题（待 review 确认）

1. ~~能否接受"原始生成 output 也共享"？~~ **✅ 已定（2026-06-16）：采用乙 / 4.2-B，接受 output/uploads 配套媒体随库共享、软件内不暴露为画廊、仅文件层面在共享盘可见。** 不再考虑 4.2-A 与丙折中。
2. 库目录"选择"按钮先只支持手填 + 校验，还是投入做图形目录选择器（纯前端拿不到 UNC 实路径）？
3. 工作流的 `scope=private` 字段（[json_file_route_service.py:201](services/json_file_route_service.py)）是否借用做"个人/共享"的最小区分，还是本轮完全不碰？
4. 是否需要"库内同名查重提示"，还是完全靠 id 唯一 + 各建各的？
5. config/settings 是否提供"导出/导入"方便新成员快速对齐模型配置（不共享、但可手动同步）？

---

## 附录 A：为什么否决 v0.1 的 4.2-A（保存时复制媒体进库 + `/library-media` 虚拟根）

review 用真实代码证明 4.2-A 既更贵又会裂图，故 v0.2 改用 4.2-B。要点：

1. **uploads 来源漏处理裂图**：资产媒体不只来自 `output/`，还大量来自 `data/uploads/`（实测某资产 100%）。4.2-A 的"复制 output 媒体"漏掉 uploads → 这类资产换机裂图。
2. **`/library-media` 新虚拟根打断派生链**：4.2-A 要新建 `/library-media` 并改写路径，但 `derivatives/ensure` 的 `resolve_virtual_media_root` 只认 `output/` 与 `data/uploads/`（[media_file_route_service.py:98-133](services/media_file_route_service.py)）；新根会让显示图/缩略图派生失败或回退原图（大图过 SMB 卡）。
3. **改写不彻底裂图**：单图 7+ 路径字段 + `coverUrl/thumbSrc` + `items[].nodeData` 与 `nodes[]` 双副本，只改少数字段会残留 `output/` 引用。
4. **存量资产不回填裂图**：`_copy_missing_tree` 只拷文件不改写路径，§8.4 改写只对新存生效，旧资产迁库后仍裂图。
5. **改动面接近"较大"**：后端媒体复制去重 + 5 个混淆前端保存点 + 整 JSON 递归改写 + 派生服务加根 + Sam3 getter + 存量回填 + SMB 原子写重试。

4.2-B 把 1–5 几乎全部规避（output/uploads 随库、相对路径天然解析、无新根、无改写、无前端改动），唯一额外成本是 §8.5 一个机器前缀小改 + "原始生成共享"这一产品取舍（开放问题 1）。
