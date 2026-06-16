# 海外版即梦后台常驻浏览器改造设计

日期：2026-05-19

## 背景

当前海外版即梦/Dreamina 通过 `integrations/seedance_extension_bridge` 接入，前端统一走 `/api/v2/seedance-web/*`，后端维护本地任务队列，Chrome 扩展在 Dreamina/CapCut 页面中填提示词、上传素材、点击生成并回传结果。

现有方案能跑通海外网页生成，但用户体验有明显短板：画布发出生成指令后，用户仍需要把海外网页窗口放到最上层，页面操作才更稳定。这会让“从画布发起自动生成”的价值大幅下降，因为用户已经接近直接使用海外网页。

这次改造的目标不是逆向官方接口，也不是完全废弃现有海外桥接，而是把海外网页变成一个“后台常驻工作浏览器”：它平时挂在后台，任务自动执行；用户想查看登录状态、余额、失败原因、生成历史时，可以随时切到这个浏览器窗口。

## 目标

1. 海外 Dreamina 浏览器窗口常驻，不在任务完成后自动关闭。
2. 浏览器有真实窗口，可被用户随时查看，不采用纯 headless 黑盒模式。
3. 任务执行不要求用户手动把海外网页置顶。
4. 继续复用 `user_data/seedance_web/profile` 保存登录态。
5. 保持现有前端生成入口和 `/api/v2/seedance-web/*` 外部接口尽量不变。
6. 把改造影响面限制在海外版 Dreamina/Seedance Web 链路，不影响国内即梦和其他视频供应商。
7. 保留现有扩展桥接作为过渡 fallback，降低一次性替换风险。

## 非目标

1. 不改国内即梦 `/api/v2/dreamina/*` 和 `DreaminaCliService` 链路。
2. 不改 RunningHub、Apimart、GRSAI 等其他视频供应商。
3. 不承诺绕过 Dreamina/CapCut 的验证码、风控、登录过期或平台限制。
4. 不在第一阶段逆向 Dreamina 网页真实接口。
5. 不把浏览器做成任务结束后自动关闭的一次性进程。
6. 不优先引入纯 headless 模式，因为用户明确需要随时查看网页。

## 当前问题

当前执行链路大致是：

```text
画布视频节点
  -> api/seedanceWebVideoBridge.js
  -> POST /api/v2/seedance-web/tasks
  -> SeedanceWebTaskStore 创建 pending 任务
  -> Chrome 扩展 background.js 轮询 pending 任务
  -> background.js 找当前 Dreamina 标签页
  -> content.js 操作 DOM：填词、上传、点击、查结果、回传
```

关键问题在于扩展执行时大量依赖页面脚本和 DOM 事件：

- `content.js` 会 `focus()` 输入框、模拟键盘输入、模拟拖拽上传、模拟点击生成按钮。
- `background.js` 会查找当前或最近访问的 Dreamina 标签页。
- 浏览器后台页面可能受到节流、可见性状态、React 事件触发差异等影响。
- 页面如果被遮挡、失焦或标签页不是预期页面，任务更容易失败或卡住。

因此用户才会感受到：虽然从画布发任务，但实际还要照看海外网页。

## 方案比较

### 方案 A：继续 Chrome 扩展，修复当前标签页和前台问题

做法是继续使用 `background.js` + `content.js`，优化 `findActiveSeedanceTab()`，尽量固定目标 tab，并在需要时自动激活窗口。

优点：

- 改动最小。
- 能最大化复用现有扩展逻辑。
- 对现有任务队列影响较小。

缺点：

- 仍然依赖扩展消息和网页可见状态。
- 自动激活窗口会抢用户焦点，体验不符合“后台挂着”的目标。
- 只能缓解问题，不能从架构上消除“前台网页依赖”。

结论：可作为短期兜底，不建议作为主方案。

### 方案 B：Playwright 常驻工作浏览器

后端新增一个常驻浏览器 worker，使用 Playwright 启动有界面浏览器，复用海外 profile，固定持有 Dreamina 页面。画布发任务后，后端直接把任务交给 worker 在固定页面中执行。

优点：

- 项目里已经有 Playwright 依赖和脚本雏形，落地成本较低。
- 可以有真实窗口，用户随时能查看。
- 任务完成后浏览器保持打开，不自动关闭。
- 不要求用户手动置顶海外网页。
- 可以保持现有前端 API 基本不变。

缺点：

- 仍然依赖 Dreamina 网页 DOM，页面改版仍需维护。
- 需要把现有 `content.js` 中的关键页面操作抽出或复用到 worker。
- 首期建议单任务串行执行，避免多个任务互相覆盖页面状态。

结论：推荐作为第一阶段主方案。

### 方案 C：接入 agent-browser-runtime

把海外网页执行层接到 agent-browser-runtime，由它管理浏览器会话、页面操作、预览或远程控制。

优点：

- 更接近“浏览器运行时”抽象，后续可扩展性更好。
- 如果 runtime 支持可视化预览、会话管理、CDP 控制，体验会更完整。
- 适合作为长期统一浏览器自动化层。

缺点：

- 当前项目里没有发现该依赖，需要新增运行时、进程管理和适配层。
- 首次集成风险比直接 Playwright 更高。
- 对 Dreamina 页面稳定性的核心验证仍然绕不开。

结论：适合作为第二阶段候选，不建议第一阶段直接压上全部改造。

## 推荐方案

第一阶段采用方案 B：新增 `Seedance Web Worker Browser`，用 Playwright 启动一个有界面、常驻、持久 profile 的浏览器。

设计原则：

1. 前端和画布生成链路尽量不动。
2. 后端 `/api/v2/seedance-web/*` 外部接口尽量不变。
3. 把“任务执行器”从 Chrome 扩展轮询改为后端 worker 主动执行。
4. 扩展方案保留一段时间作为 fallback。
5. 第一版只支持单任务串行执行。

## 新增模块

建议新增：

```text
integrations/seedance_extension_bridge/browser_worker.py
```

职责：

- 启动浏览器。
- 复用 `user_data/seedance_web/profile`。
- 打开或复用 `https://dreamina.capcut.com/` 页面。
- 保持浏览器窗口常驻。
- 暴露 `start()`、`show()`、`stop()`、`restart()`、`status()`、`execute_task(task)`。
- 检测浏览器是否被用户手动关闭。
- 任务执行失败时把错误写回 `SeedanceWebTaskStore`。

建议内部状态：

```text
idle
starting
ready
login_required
busy
error
closed
```

## 后端改造点

### `browser_launcher.py`

现有 `SeedanceBrowserLauncher` 主要负责打开登录浏览器和加载扩展。改造后可以保留它用于：

- 查找 Chrome/Edge/Playwright Chromium。
- 解析 profile 目录。
- 提供浏览器路径、扩展路径、登录 URL。

也可以让 `browser_worker.py` 复用它的路径解析逻辑，避免重复实现浏览器查找。

### `bridge_service.py`

现有 `SeedanceWebBridgeService` 继续作为外部服务门面，但增加 worker 注入：

```text
SeedanceWebBridgeService(
  browser_launcher=...,
  browser_worker=...,
)
```

关键变化：

- `start_login()` 不再只是打开浏览器后结束，而是启动/确保 worker 浏览器存在。
- `get_status()` 合并 worker 状态和页面登录状态。
- `submit_video_task()` 创建任务后触发 worker 执行。
- worker 执行过程中调用 `update_task_status()` 和 `register_uploaded_file()`。

任务状态建议保持兼容：

```text
pending -> processing -> submitted -> completed
pending -> processing -> failed
submitted -> completed
submitted -> timeout
```

### `route_service.py`

保留现有接口：

```text
GET  /api/v2/seedance-web/status
POST /api/v2/seedance-web/login
POST /api/v2/seedance-web/logout
POST /api/v2/seedance-web/tasks
GET  /api/v2/seedance-web/query_result
```

新增可选控制接口：

```text
POST /api/v2/seedance-web/browser/show
POST /api/v2/seedance-web/browser/restart
POST /api/v2/seedance-web/browser/stop
```

其中：

- `login`：启动或复用海外工作浏览器。
- `show`：把工作浏览器窗口带到用户可查看状态。
- `restart`：关闭当前 worker 并重新打开。
- `stop`：停止 worker 浏览器，但不清除 profile。
- `logout`：仍然表示逻辑登出或标记未登录，不默认删除 profile。

### `task_store.py`

第一阶段可以继续内存队列，但建议补充：

- 任务进入 worker 前记录 `claimedAt`。
- worker 异常退出时，将 `processing/submitted` 中超时任务标为 `failed` 或 `timeout`。
- 保持 `taskCode`、`promptMarker`、`files` 结构不变，避免前端变化。

后续如果要增强可靠性，可再把任务写入 `user_data/seedance_web/tasks.json`。

## 页面操作逻辑

现有关键逻辑在：

```text
integrations/seedance_extension_bridge/extension/content.js
```

包括：

- 应用模型、比例、时长等 preset。
- 上传参考图或参考视频。
- 填写 prompt。
- 点击生成。
- 查找生成结果。
- 下载或抓取视频并上传回本地。

第一阶段不建议完全重写这些逻辑。建议拆出一个页面自动化层：

```text
integrations/seedance_extension_bridge/page_actions/
```

或者先在 `browser_worker.py` 中通过 Playwright 注入 JS 复用 content helper。

长期更干净的结构：

```text
integrations/seedance_extension_bridge/
  browser_worker.py
  page_actions/
    seedance_page_actions.js
    seedance_page_actions.py
```

其中：

- JS 负责在页面上下文里执行 DOM 操作。
- Python worker 负责调度、状态更新、文件保存和错误处理。

## 前端改造点

### `api/seedanceWebApi.js`

保留现有方法：

- `fetchSeedanceWebStatusFromServer()`
- `startSeedanceWebLoginFromServer()`
- `logoutSeedanceWebFromServer()`
- `submitSeedanceWebVideoTask()`
- `querySeedanceWebResult()`

新增：

```text
showSeedanceWebBrowserFromServer()
restartSeedanceWebBrowserFromServer()
stopSeedanceWebBrowserFromServer()
```

### `modules/settings/seedanceWebSettings.js`

设置页文案从“打开海外网页”升级为“海外工作浏览器”概念：

- `打开海外工作浏览器`
- `查看海外工作浏览器`
- `重启海外工作浏览器`
- `停止海外工作浏览器`

状态文案建议：

```text
海外工作浏览器已就绪
海外工作浏览器运行中
海外网页需要登录
海外工作浏览器正在执行任务
海外工作浏览器已断开
```

### `api/seedanceWebVideoBridge.js`

尽量不改。它继续负责：

- 判断是否走海外桥接。
- 提交 `/api/v2/seedance-web/tasks`。
- 轮询 `/api/v2/seedance-web/query_result`。
- 把海外错误转成节点可读错误。

如果后端错误文案更清晰，前端只需要补少量错误映射。

## 新执行流程

### 打开海外工作浏览器

```text
用户设置页点击“打开海外工作浏览器”
  -> POST /api/v2/seedance-web/login
  -> SeedanceWebBridgeService.start_login()
  -> browser_worker.start()
  -> 启动有界面 persistent browser
  -> 打开 https://dreamina.capcut.com/
  -> 返回 worker 状态
```

如果用户需要登录，就在这个窗口里手动登录。登录后 profile 保留。

### 画布提交生成任务

```text
画布视频节点
  -> runSeedanceWebVideoGeneration()
  -> POST /api/v2/seedance-web/tasks
  -> SeedanceWebTaskStore.create_task()
  -> browser_worker.enqueue(task)
  -> worker 在固定 Dreamina 页面执行任务
  -> 更新任务状态
  -> 保存/回传视频文件
  -> 前端 query_result 轮询拿结果
```

### 用户查看浏览器

```text
用户点击“查看海外工作浏览器”
  -> POST /api/v2/seedance-web/browser/show
  -> worker 把窗口带到可见状态
```

这个动作只是查看，不重新提交任务，也不清空页面。

## 对其他功能的影响

不应影响：

- 国内即梦 CLI 登录和生成。
- 国内即梦 `/api/v2/dreamina/*`。
- 普通视频供应商生成。
- 图片生成。
- 画布节点通用保存、恢复、连线和执行流程。
- 素材库、项目文件、更新、授权等通用功能。

可能影响：

- 海外版 Dreamina 的登录状态显示。
- 海外版 Dreamina 的设置页按钮和文案。
- `/api/v2/seedance-web/status` 返回字段会增加 worker 状态。
- 海外任务失败提示会更细。

兼容策略：

- 保持 `provider: "seedance_web"` 不变。
- 保持 `taskCode` 和 `query_result` 结构不变。
- 保持生成结果中的 `videos/localPath/videoUrl` 兼容。
- 第一阶段保留扩展桥接 fallback，避免 worker 不稳定时完全不可用。

## 主要风险

### Dreamina 页面仍然可能变化

无论使用扩展、Playwright 还是 agent-browser-runtime，只要不是官方 API，就仍然依赖网页结构。

缓解：

- 页面动作层集中维护。
- 失败时保存截图和诊断信息。
- 错误提示引导用户点击“查看海外工作浏览器”确认页面状态。

### 后台执行仍可能受网站限制

部分网站会根据页面可见性、自动化环境、验证码或风控限制操作。

缓解：

- 使用有界面 headed browser，而不是默认 headless。
- 使用 persistent profile，尽量接近真实用户会话。
- POC 阶段先验证“不置顶但窗口存在”的稳定性。

### 多任务并发会互相干扰

Dreamina 页面本质上是一个交互式单页面应用，多任务同时操作同一页面风险高。

缓解：

- 第一阶段只允许一个海外任务执行。
- 后续如需并发，再考虑多个独立 profile 或多个 worker。

### 用户手动操作页面可能影响任务

用户查看浏览器时可能手动点击页面，导致 worker 状态和页面状态不一致。

缓解：

- 任务运行中设置状态为 `busy`。
- 设置页显示“正在执行任务”。
- 如果页面状态被打断，任务失败并提示用户重试。

### 打包体积和运行环境

Playwright Chromium 或系统浏览器路径会影响打包和部署。

缓解：

- 优先复用现有 `browser_launcher.py` 的浏览器查找逻辑。
- 打包时明确是否随包 Chromium。
- 支持环境变量 `AIC_SEEDANCE_WEB_BROWSER_PATH` 指定浏览器路径。

## 验证计划

### POC 验证

1. 启动有界面 persistent browser。
2. 使用 `user_data/seedance_web/profile` 登录海外 Dreamina。
3. 不把浏览器置顶，保持它被主程序或其他窗口遮挡。
4. 从脚本执行一次：
   - 填 prompt。
   - 上传一张参考图。
   - 点击生成。
   - 查询最新结果。
   - 抓取/保存视频。
5. 验证任务期间用户可以切到浏览器查看状态。
6. 验证任务完成后浏览器不关闭。

### 单元测试

建议覆盖：

- `/api/v2/seedance-web/tasks` 仍返回兼容 task。
- `query_result` 仍返回兼容 videos/localPath。
- worker 未启动时提交任务能返回清晰错误。
- worker 已关闭时 status 返回 `closed` 或 `not_connected`。
- 单任务运行时第二个任务排队或明确拒绝。

### 手工测试

1. 国内即梦登录和生成不受影响。
2. 海外区域点击“打开海外工作浏览器”能打开/复用同一窗口。
3. 海外区域画布发任务时，不手动置顶网页也能执行。
4. 点击“查看海外工作浏览器”能看到当前页面。
5. 点击“重启海外工作浏览器”后 profile 仍保留登录态。
6. 手动关闭浏览器后，设置页状态能变成断开。

## 分阶段实施

### 第一阶段：POC

目标：验证后台非置顶浏览器是否能稳定完成一次 Dreamina 生成。

输出：

- 一个独立 worker POC 脚本。
- 一份 POC 结论：通过、部分通过或不可行。

### 第二阶段：后端 worker 接入

目标：新增 `browser_worker.py`，并让 `SeedanceWebBridgeService` 可以把任务交给 worker。

输出：

- 常驻浏览器启动/状态/停止能力。
- 单任务串行执行能力。
- 与 `SeedanceWebTaskStore` 打通。

### 第三阶段：设置页控制

目标：让用户能清楚管理海外工作浏览器。

输出：

- 打开、查看、重启、停止按钮。
- worker 状态显示。
- 错误提示优化。

### 第四阶段：fallback 和清理

目标：保留旧扩展桥接一段时间，待 worker 稳定后再决定是否清理。

输出：

- 可配置执行模式：`worker` / `extension`。
- 默认使用 `worker`。
- 异常时可切回 `extension` 辅助排查。

### 第五阶段：评估 agent-browser-runtime

目标：如果 Playwright worker 已验证可用，再评估 agent-browser-runtime 是否值得接入。

判断标准：

- 是否能减少自维护浏览器进程管理。
- 是否能提供更好的可视化预览。
- 是否能稳定复用 profile。
- 是否会显著增加打包复杂度。

## 推荐结论

建议先做 Playwright 常驻 worker，而不是第一阶段直接上 agent-browser-runtime。

原因：

1. 项目已有 Playwright 依赖和脚本基础。
2. 当前最重要的风险是 Dreamina 页面能否后台稳定执行，而不是 runtime 抽象是否优雅。
3. Playwright worker 改造影响面更小，更容易保留现有接口和 fallback。
4. 用户需要“网页挂后台，想看随时看”，headed persistent browser 正好匹配这个体验。

如果 POC 证明后台窗口稳定，再正式接入后端任务执行层；如果 POC 失败，再考虑 agent-browser-runtime 或继续保守使用扩展前台方案。
