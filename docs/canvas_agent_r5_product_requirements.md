# Huanying Canvas Agent R5 专业产品需求文档

版本：v1.0  
日期：2026-06-03  
范围：R5 Live 校准、真实网页端到端验收、生成权限门禁、renderer pending 状态保持、失败转回归  
项目路径：`D:\Aic\huanying-source-windows-20260430-122116`

---

## 1. 文档定位

本文档是 Huanying Canvas Agent 在 R1-R4 之后的 R5 产品需求文档。R1-R4 已经完成了流式对话、Action Contract、会话历史、模型/API Key 统一配置等基础闭环；R5 的核心目标不是继续堆功能，而是把这些能力放进真实 Huanying 页面里做可重复、可截图、可定位、可回归的 live 校准。

如果团队里有非常强背景、又擅长默会知识的人，他会把 R5 定义为“从测试通过到产品可信”的质量门槛：每一次助手能力都必须在真实页面里跑通用户旅程；每一个 live 失败都必须留下证据，并转化为 schema、executor、UI state 或 scorecard 的回归用例。否则后续 Canvas Doctor、自动整理、story_to_video、分镜导演、变体分支都会变成只在局部单测里成立、在真实页面里不稳定的 demo。

### 1.1 R5 一句话目标

让 Huanying Canvas Agent 在真实网页中稳定完成“打开助手 -> 选择模型 -> 发送流式对话 -> 预览 actions -> 应用到画布 -> 生成权限校验 -> 回执 -> 历史恢复 -> 截图/trace 归档”的端到端验收，并把所有失败自动转为可复现回归资产。

### 1.2 本轮目标

1. 扩展真实网页 live screenshot 验收，从“只打开面板”升级为“完整助手旅程”。
2. 将 R1-R4 的核心能力全部纳入浏览器级回归：stream、preview、apply、history、model dropdown、disabled model guard。
3. 建立生成权限产品门禁：文本/图片低风险可自动运行，视频生成必须强确认。
4. 保证 renderer mount / remount / refresh 时 pending generation 状态不丢失。
5. 让每一个 live 失败都生成 artifact bundle，并能沉淀为 schema/executor/UI/scorecard 回归。
6. 形成发布 preflight：普通用户不需要全局安装依赖、不泄露 API Key、不依赖偶发网络、离线可跑核心回归。

### 1.3 本轮非目标

- 不实现 Canvas Doctor 的完整诊断算法；R5 只定义它未来进入 live scorecard 的入口。
- 不实现 story_to_video 完整业务链；R5 只验证视频生成必须强确认且 pending 状态可靠。
- 不让 Agent 或 Pi sidecar 执行 shell、写文件、直接改画布。
- 不改 obfuscated/minified `main.js`。
- 不把真实用户 API Key 写入 fixture、日志、截图、trace 或会话导出。
- 不把 live 校准变成只在开发机上手动看一眼的流程，必须可自动化、可归档、可失败定位。

---

## 2. 当前基线与真实约束

### 2.1 R1-R4 已有基础

| 层级 | 当前关键模块 | 已具备能力 | R5 要验证的真实页面能力 |
|---|---|---|---|
| 面板 UI | `modules/app/appAssistantPanel.js` | 右下角助手、输入、stream、预览、回执、历史、模型菜单 | 真实 DOM 点击、状态切换、禁用按钮、预览卡片、历史恢复 |
| Autoload | `modules/app/appAssistantPanel.autoload.js` | 挂载助手，复用原右下角 `#fabBtn` | 页面加载后不重复挂载，不破坏原 FAB 位置 |
| API Client | `api/canvasAgentApi.js` | chat、chatStream、validate、conversations、status | 浏览器网络路径、fallback、abort、错误归一 |
| Protocol | `modules/assistant/assistantProtocol.js` | stream frame normalize，只信任 `message.done` actions | live 中 delta 不触发动作，done 后才出现 preview |
| Action Preview | `modules/assistant/assistantActionPreviewModel.js` | 分组、风险、强确认 | 真实 UI 卡片文案、CTA、风险 badge |
| Executor | `modules/assistant/assistantActionExecutor.js` | create/connect/update/layout/focus/generation queue | 真实画布节点/边变化，低风险动作不重复执行 |
| Conversation | `modules/assistant/assistantConversationStore.js` | 会话保存、恢复、导出脱敏 | live 刷新/恢复后 pending actions 不自动执行 |
| Model Registry | `modules/assistant/assistantModelRegistry.js` | 统一 provider config、disabled model | 真实下拉菜单显示可用/不可用模型，不泄露 key |
| Backend Route | `services/canvas_agent_route_service.py` | status/chat/stream/validate/conversations | live 网络错误可定位到路由 |
| Bridge | `services/pi_bridge_service.py` | JSONL、response 清洗、schema validate | mock/live sidecar 都不能泄露 secrets |
| Live Tool | `tools/assistant_panel_live_screenshot_check.mjs` | 打开页面、点击助手、截图、检测错误 | 扩展为完整 journey runner |

### 2.2 真实约束

1. Huanying 页面不是测试专用页面，资源 404、第三方资产噪音可能存在；R5 需要区分“宿主页噪音”和“助手关键路径错误”。
2. 右下角原本已有交互 icon，助手必须复用该位置或挂载在同一视觉位置，不能制造第二个 FAB。
3. UI 必须按真实网页截图验收，不接受只靠 jsdom 单测判断。
4. 模型/API Key 统一配置中可能存在 endpoint、proxyBaseUrl、apiKeyConfigured、proxyTokenConfigured 等别名；R5 必须覆盖禁用/启用两种模型状态。
5. 生成任务存在异步 pending 状态；renderer 重新挂载时，pending 不能消失，也不能重复触发生成。
6. 视频生成成本高且风险高，必须强确认；live 验收不能因为误触发视频生成造成真实费用。
7. 所有 artifact 必须脱敏：不能保存真实 API Key、Authorization、Windows 私密路径、signed URL query。

---

## 3. R5 产品需求清单总览

| 编号 | 模块 | 功能 | 需求点 | 优先级 |
|---|---|---|---|---|
| R5-F1 | Live Harness | 完整用户旅程 runner | 自动打开页面、点击助手、发送消息、等待 stream、应用 actions、恢复历史 | P0 |
| R5-F2 | Live Harness | deterministic fixture | 使用可控 mock API/bridge 返回，避免依赖外部模型和真实费用 | P0 |
| R5-F3 | UI 验收 | 助手入口 | 复用原右下角 icon/FAB，截图确认位置、面板出现、无重复 launcher | P0 |
| R5-F4 | UI 验收 | 模型下拉 | 覆盖 configured、disabled、default、切换、去配置 API Key 提示 | P0 |
| R5-F5 | Stream | 流式对话 | live 中验证 start/delta/warning/done 顺序、停止、retry、done-only actions | P0 |
| R5-F6 | Action Preview | 动作预览 | live 中验证 create/connect/layout/focus preview 分组、风险、影响范围 | P0 |
| R5-F7 | Action Apply | 真实画布应用 | 应用后真实画布出现节点/连线/布局/聚焦变化，且不会重复执行 | P0 |
| R5-F8 | Generation Gate | 文本/图片低风险自动运行 | 低风险 text/image generation 可进入 queued/running，不需要强确认 | P0 |
| R5-F9 | Generation Gate | 视频强确认 | video generation 必须显示强确认，未确认不可执行 | P0 |
| R5-F10 | Pending State | renderer mount 保持 | 生成 pending 在 renderer mount/remount/refresh 后仍保留 | P0 |
| R5-F11 | History | 会话恢复 | live 中验证历史列表、搜索、恢复、pending action 不自动执行 | P0 |
| R5-F12 | Artifact | 截图与 trace | 每次 live run 输出截图、console、network、state、scorecard | P0 |
| R5-F13 | Failure Regression | 失败转回归 | 每个 live 失败生成 fixture candidate，归因到 schema/executor/UI/API | P0 |
| R5-F14 | Secret Safety | 脱敏 preflight | artifact、日志、截图文本、导出文件不含 key/token/signed URL | P0 |
| R5-F15 | Release Gate | 离线回归 | 普通用户无需全局安装 Pi；核心 live mock 回归可离线跑 | P0 |
| R5-F16 | QA Dashboard | run summary | 输出 pass/fail、关键截图路径、失败定位、建议回归文件 | P1 |
| R5-F17 | Visual Diff | 截图稳定性 | 对关键区域做视觉 diff，避免整体页面噪音导致误报 | P1 |
| R5-F18 | Scorecard | 质量评分 | 为助手 UI、stream、action、generation、history 生成分项评分 | P1 |
| R5-F19 | CI/Packaging | 打包 preflight | 将 runtime/source/license/lockfile/source preflight 纳入 R5 gate | P1 |
| R5-F20 | Manual QA | 人工复核脚本 | 给 QA 一份可手动复现的点击脚本与验收清单 | P1 |

---

## 4. R5 总体用户旅程

### 4.1 标准 live 校准旅程

1. 测试工具启动或连接本地 Huanying 页面。
2. 页面加载完成，工具监听 console、pageerror、response、requestfailed。
3. 工具定位右下角原始 `#fabBtn` 或 `.hy-canvas-agent-launcher`。
4. 用户/工具点击助手入口，面板打开。
5. 工具截图：`01-open-panel.png`。
6. 工具打开模型菜单，验证默认模型、可用模型、禁用模型、配置提示。
7. 工具截图：`02-model-dropdown.png`。
8. 工具输入一条确定性 prompt：“创建一个评论节点，连接到当前节点，整理布局并聚焦。”
9. mock stream 返回 start/delta/warning/done，UI 显示流式内容。
10. 工具截图：`03-streaming.png`。
11. done frame 携带 actions，UI 显示 preview card。
12. 工具截图：`04-action-preview.png`。
13. 点击“应用到画布”，前端调用 validate，然后 executor 应用 actions。
14. 画布出现新节点/连线，面板显示 receipt。
15. 工具截图：`05-applied-receipt.png`。
16. 工具打开历史，搜索当前会话，恢复会话。
17. 工具截图：`06-history-restore.png`。
18. 工具触发 text/image generation fixture，验证低风险 pending。
19. 工具触发 video generation fixture，验证强确认阻断。
20. 工具输出 artifact bundle 和 scorecard。

### 4.2 失败旅程

| 失败点 | 用户/QA 看到 | 系统必须记录 | 回归归因 |
|---|---|---|---|
| 面板打不开 | 截图显示 FAB 无响应 | DOM selector、console、autoload 网络请求 | UI/autoload |
| 模型菜单错误 | 下拉为空或泄露 key | model registry snapshot、sanitized config | model registry |
| stream 中断 | error card、retry CTA | NDJSON frame、network trace、traceId | API/stream |
| delta 携带 actions | UI 不执行，只记录 warning | frame payload、protocol normalize result | protocol |
| preview 缺失 | done 有 actions 但无卡片 | state snapshot、actions fixture | preview/state |
| validate 失败 | 展示校验失败 | schema response、action payload | schema |
| apply 重复 | 画布节点重复 | before/after graph snapshot | executor/state lock |
| pending 丢失 | 刷新后任务不见 | generation task store snapshot | pending store |
| 视频误执行 | 未强确认却进入 queue | action、confirmation decision | policy/executor |
| artifact 泄密 | 日志出现 key/token | secret scan evidence | sanitizer |

---

## 5. 模块需求详述

## 5.1 Live Harness 模块

### 5.1.1 产品目标

把当前 `tools/assistant_panel_live_screenshot_check.mjs` 从“打开面板截图工具”升级为“真实页面助手端到端校准 runner”。它不只是截图，而是能稳定驱动 UI、收集证据、输出 scorecard、把失败变成回归资产。

### 5.1.2 功能点

| 功能 | 需求描述 | 优先级 |
|---|---|---|
| 页面启动/连接 | 支持连接已有 `http://127.0.0.1:8777`，也支持由 runner 启动本地 server | P0 |
| 浏览器选择 | 支持指定 Chrome executable，默认 headless，可选 headed 调试 | P0 |
| 关键路径监听 | 收集 console error、pageerror、assistant route 4xx/5xx、assistant module requestfailed | P0 |
| 噪音过滤 | favicon、宿主页普通资源 404 不阻断；assistant 相关错误必须阻断 | P0 |
| 步骤化截图 | 每个关键步骤保存独立 screenshot，不只保存 full page 最终图 | P0 |
| 状态快照 | 保存 panel state、graph before/after、conversation snapshot、model snapshot | P0 |
| artifact bundle | 每次 run 形成目录：screenshots、trace、network、console、scorecard、fixture-candidate | P0 |
| 失败最小复现 | 失败时记录最后一个成功步骤、失败 selector、等待条件、相关 frame/action | P0 |

### 5.1.3 Artifact 目录结构

```text
output/regression/assistant-live/2026-06-03T10-00-00-000Z/
  screenshots/
    01-open-panel.png
    02-model-dropdown.png
    03-streaming.png
    04-action-preview.png
    05-applied-receipt.png
    06-history-restore.png
    07-generation-pending.png
    08-video-strong-confirm.png
  trace.json
  console.json
  network.json
  assistant-state.json
  graph-before.json
  graph-after.json
  scorecard.json
  fixture-candidate.json
  summary.md
```

### 5.1.4 交互/运行说明

- 开发者运行 live check 后，命令行输出只展示 summary、pass/fail、截图目录，不打印敏感 payload。
- 失败时第一屏输出必须包含：
  - failedStep
  - screenshotPath
  - likelyOwner：`ui | stream | schema | executor | generation | history | model | backend`
  - suggestedRegression：建议补到哪个测试文件。
- artifact 里保存的 payload 必须先过 sanitizer。

---

## 5.2 Deterministic Fixture 模块

### 5.2.1 产品目标

R5 live 校准不能依赖真实模型每次返回一致结果，也不能消耗真实视频生成费用。因此需要 deterministic fixture：用可控 stream frames 和 action payload 驱动真实 UI，验证 Huanying 的“接收、预览、确认、执行、回执”能力。

### 5.2.2 Fixture 数据结构

```json
{
  "id": "r5-basic-create-connect-layout-focus",
  "title": "创建节点、连线、布局、聚焦",
  "initialCanvas": {
    "nodes": [
      {"id": "seed_prompt", "nodeType": "source-text", "name": "Seed Prompt"}
    ],
    "edges": [],
    "selectedNodeIds": ["seed_prompt"]
  },
  "modelOptions": [
    {"provider": "pi_canvas_agent", "modelId": "agent-live-fixture", "configured": true},
    {"provider": "pi_canvas_agent", "modelId": "agent-disabled", "configured": false, "disabledReason": "缺少 API Key 或 Endpoint"}
  ],
  "streamFrames": [
    {"type": "message.start", "conversationId": "conv_r5", "messageId": "msg_r5", "traceId": "trace_r5"},
    {"type": "message.delta", "delta": "我会创建评论节点并整理布局。"},
    {"type": "warning", "message": "使用当前选中节点作为连接起点。"},
    {
      "type": "message.done",
      "reply": "已准备好画布更新方案。",
      "actions": [
        {"type": "create_node", "nodeType": "comment", "name": "R5 Review Note", "data": {"content": "Live fixture note"}},
        {"type": "connect_nodes", "source": "seed_prompt", "target": "$created.R5 Review Note"},
        {"type": "layout_nodes", "strategy": "grid"},
        {"type": "focus_nodes", "nodeIds": ["$created.R5 Review Note"]}
      ],
      "warnings": [],
      "requiresConfirmation": false
    }
  ],
  "expected": {
    "createdNodes": 1,
    "createdEdges": 1,
    "receiptContains": ["R5 Review Note"],
    "historyRestores": true
  }
}
```

### 5.2.3 功能需求

| 编号 | 需求点 | 优先级 |
|---|---|---|
| R5-FIX-1 | 支持 fixture 注入 modelOptions、initialCanvas、streamFrames、validationResult | P0 |
| R5-FIX-2 | 支持 `$created.<name>` 这类符号引用，用于 action 间关联 | P0 |
| R5-FIX-3 | 支持 fixture 模拟 backend 503、invalid frame、schema invalid、executor warning | P0 |
| R5-FIX-4 | 支持一键把失败 live payload 写成 fixture-candidate | P0 |
| R5-FIX-5 | fixture 文件不能包含真实 API Key、真实 endpoint userinfo、用户本地私密路径 | P0 |

---

## 5.3 助手入口与面板 UI 验收

### 5.3.1 产品目标

验证真实 Huanying 页面里的助手入口、面板布局和关键按钮不是“单测中存在”，而是真实可点击、可见、可截图、可恢复的。

### 5.3.2 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-UI-1 | 入口复用 | 优先复用原右下角 `#fabBtn`；如果不存在，再挂载 `.hy-canvas-agent-launcher` | P0 |
| R5-UI-2 | 位置验证 | 截图中 launcher 位于右下角安全区域，不遮挡主画布关键控件 | P0 |
| R5-UI-3 | 面板打开 | 点击后 `.hy-canvas-agent-panel` 可见，标题、欢迎语、快捷意图、输入区可见 | P0 |
| R5-UI-4 | 面板关闭/再开 | 关闭后不销毁未完成会话，再打开保持当前会话 | P1 |
| R5-UI-5 | 按钮语义 | 上传、模型、历史、新会话、停止、重试、应用按钮必须有 aria-label 或可定位文本 | P0 |
| R5-UI-6 | 空状态 | 无会话时显示参考设计风格的开场页，不显示空白或测试占位文案 | P0 |
| R5-UI-7 | 错误状态 | API/stream/schema/executor 失败均以用户可理解卡片展示 | P0 |

### 5.3.3 截图验收

| 截图 | 必须包含 | 不应包含 |
|---|---|---|
| `01-open-panel.png` | 右下角入口、助手面板、标题、快捷意图、输入框 | 重复 FAB、空白面板 |
| `02-model-dropdown.png` | 当前模型、可用模型、禁用模型、配置提示 | API Key、完整 token |
| `03-streaming.png` | 用户消息、assistant streaming bubble、stop 按钮 | action preview 提前出现 |
| `04-action-preview.png` | action 分组、风险、应用 CTA、取消 CTA | 未校验就执行的迹象 |
| `05-applied-receipt.png` | 执行回执、影响节点、聚焦入口 | 重复执行结果 |
| `06-history-restore.png` | 历史列表、搜索、恢复后的消息 | 导出/历史中的 secret |

---

## 5.4 模型下拉与配置门禁

### 5.4.1 产品目标

真实 UI 中必须能明确告诉用户哪个 Agent 模型可用、哪个不可用、为什么不可用，以及如何去配置。模型切换只传递模型引用，不传递 key。

### 5.4.2 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-MODEL-1 | 默认模型 | 自动选中 registry 的 defaultModel；无可用模型时进入配置引导状态 | P0 |
| R5-MODEL-2 | 下拉分组 | 按 provider 分组显示模型，展示 capability tag：低延迟、高质量、支持参考图等 | P1 |
| R5-MODEL-3 | 禁用模型 | disabled model 可见但不可选，显示原因：缺少 API Key 或 Endpoint | P0 |
| R5-MODEL-4 | 发送 guard | 当前模型未配置时，发送按钮 disabled；强行调用 state.send 也必须被 guard 拦截 | P0 |
| R5-MODEL-5 | 配置入口 | “去配置 API Key” CTA 指向 Huanying 统一 API Key 管理位置 | P0 |
| R5-MODEL-6 | 脱敏 | UI、payload、status、trace、artifact 都不能出现真实 key/token | P0 |

### 5.4.3 交互说明

- 用户点击模型 pill，打开菜单。
- 可用模型显示为普通菜单项，点击后 pill 文案立即更新。
- 禁用模型显示灰态，点击不切换，仅展示原因和配置 CTA。
- 如果当前 selectedModel 后来变成 disabled，发送区显示配置提示并阻止发送。
- live runner 必须截图验证 enabled/disabled 两种状态。

---

## 5.5 流式对话 live 验收

### 5.5.1 产品目标

R1 的 stream 协议必须在真实页面跑通，不仅是 API 单测通过。用户要看到流式文本，系统要保证动作只来自 final frame。

### 5.5.2 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-STREAM-1 | start frame | 面板进入 streaming，记录 conversationId/messageId/traceId | P0 |
| R5-STREAM-2 | delta frame | assistant bubble 增量展示文本；delta 中即使包含 actions 也忽略 | P0 |
| R5-STREAM-3 | warning frame | warning 展示在当前回复上下文中，不覆盖 final warnings | P0 |
| R5-STREAM-4 | done frame | done 后才读取 actions 并生成 preview | P0 |
| R5-STREAM-5 | stop | 点击停止后 abort，请求不再应用 final actions | P0 |
| R5-STREAM-6 | retry | retry 复用用户消息，重新生成 context，保留上一轮失败记录 | P0 |
| R5-STREAM-7 | invalid frame | 非法 frame 转 error card，不执行 actions | P0 |

### 5.5.3 验收标准

- `03-streaming.png` 中可以看到用户消息、流式中状态、stop 按钮。
- live trace 中 frame 顺序为 start -> delta -> warning? -> done。
- 如果 fixture 把 actions 放进 delta，graph-after 不应发生任何变化。
- stop 后 pendingActions 必须为空。
- retry 后必须生成新的 traceId 或 messageId。

---

## 5.6 Action Preview 与真实画布应用

### 5.6.1 产品目标

验证 Agent 输出 actions 后，真实页面会展示清晰预览，用户确认后 Huanying 本地 executor 正确改动画布，并给出可审计回执。

### 5.6.2 P0 验收 action

| Action | live 验收点 | 风险 |
|---|---|---|
| `create_node` | 创建 comment/source-text/ai-image 占位节点，节点可见 | low/medium |
| `connect_nodes` | 新边可见，source/target 正确 | low |
| `layout_nodes` | 节点位置发生合理变化，不堆叠 | low/medium |
| `focus_nodes` | 选区/视口聚焦到目标节点 | low |
| `update_node` | 可更新安全字段，不能覆盖危险字段 | medium |
| `queue_generation_task` | text/image 可 queue；video 强确认 | medium/high |

### 5.6.3 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-ACT-1 | Preview 分组 | 按 create/connect/layout/focus/generation 分组展示 | P0 |
| R5-ACT-2 | 影响范围 | 展示将创建/更新/连接/聚焦的节点数量和名称 | P0 |
| R5-ACT-3 | 风险提示 | medium/high 行为显示风险 badge 和说明 | P0 |
| R5-ACT-4 | Apply 锁 | applying 期间按钮 disabled，防止重复执行 | P0 |
| R5-ACT-5 | Receipt | 执行后显示 applied、skipped、warnings、affectedNodeIds | P0 |
| R5-ACT-6 | Graph snapshot | live artifact 保存 before/after，便于定位 executor 问题 | P0 |
| R5-ACT-7 | Partial failure | 部分失败时保留失败 action、显示原因，不回滚已成功低风险动作 | P1 |

### 5.6.4 交互说明

- Preview card 默认折叠细节，但展示摘要：例如“将创建 1 个评论节点、连接 1 条边、整理布局并聚焦新节点”。
- 用户点击“应用到画布”后：
  1. UI 进入 applying。
  2. 调用 `/actions/validate`。
  3. schema 返回规范化 actions。
  4. executor 执行。
  5. UI 展示 receipt。
- 如果 validate 失败，按钮回到可操作状态，但不执行任何 action。
- 如果 executor warning，receipt 中展示 warning，并提供“复制诊断”。

---

## 5.7 生成权限与成本门禁

### 5.7.1 产品目标

R5 必须定义并验证生成权限：低风险文本/图片生成可以进入自动队列；视频生成、批量高成本生成、不可逆生成必须强确认。这个需求的重点不是“能不能生成”，而是“不会误生成、不会误扣费、不会丢 pending”。

### 5.7.2 权限矩阵

| 生成类型 | 默认行为 | 是否需要确认 | live 验收方式 |
|---|---|---|---|
| 文本生成 | 可自动 queue | 否，除非批量/覆盖 | mock runner 记录 queued |
| 图片生成 | 可自动 queue | 否，除非批量/使用高成本模型 | mock runner 记录 queued |
| 视频生成 | 不自动执行 | 必须强确认 | 未确认时 graph/task 不变化 |
| 批量生成 | 根据数量升风险 | medium/high 确认 | fixture 设置批量阈值 |
| 覆盖已有结果 | 不自动执行 | 必须确认 | fixture 验证 CTA |
| 外部付费 API | 不直接执行 | 至少普通确认，视频强确认 | mock，不打真实 API |

### 5.7.3 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-GEN-1 | 文本低风险自动 queue | 单个 text generation 可在 apply 后进入 pending/running | P0 |
| R5-GEN-2 | 图片低风险自动 queue | 单个 image generation 可在 apply 后进入 pending/running | P0 |
| R5-GEN-3 | 视频强确认 | video generation preview 必须显示强确认，不确认不可 apply | P0 |
| R5-GEN-4 | 成本提示 | high cost action 文案必须说明“可能消耗额度/费用” | P0 |
| R5-GEN-5 | Mock runner | live 验收使用 fake generation runner，不调用真实模型 | P0 |
| R5-GEN-6 | 重复保护 | 同一个 generation task 不因重复点击或 remount 重复入队 | P0 |
| R5-GEN-7 | 回执 | generation queued 后 receipt 显示任务 ID、节点、状态 | P0 |

### 5.7.4 视频强确认交互

1. Agent 返回 video generation action。
2. Preview card 显示 high risk badge。
3. 主 CTA 不显示“立即应用”，而显示“需要强确认”。
4. 用户必须勾选或输入确认文案，例如“确认生成视频”。
5. 未完成强确认时，Apply 按钮 disabled。
6. live runner 验证未确认点击不会产生 generation task。
7. live runner 可选验证完成强确认后，只进入 mock queue，不打真实视频 API。

---

## 5.8 Renderer Mount Pending 状态保持

### 5.8.1 产品目标

Huanying 的生成节点和 renderer 可能因为切换视图、刷新、重新挂载而重建 UI。R5 要确保助手触发的 pending generation 状态不会因为 renderer mount/remount 丢失，也不会重复启动。

### 5.8.2 状态定义

| 状态 | 说明 | UI 表现 |
|---|---|---|
| `queued` | 已排队，尚未开始 | 节点 pending badge、面板 generation task row |
| `running` | 正在生成 | spinner、可查看任务信息 |
| `completed` | 生成完成 | 显示结果、receipt 更新 |
| `failed` | 生成失败 | failure badge、retry CTA |
| `cancelled` | 用户取消 | cancelled badge |

### 5.8.3 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-PEND-1 | 状态持久化 | pending task 写入 conversation/generation task store | P0 |
| R5-PEND-2 | renderer remount | 节点 renderer 重建后仍显示 pending/running 状态 | P0 |
| R5-PEND-3 | 页面刷新 | 刷新后从 store 恢复 pending，不自动重启任务 | P0 |
| R5-PEND-4 | 幂等 taskId | 同一 actionId/conversationId/messageId 生成稳定 taskId | P0 |
| R5-PEND-5 | receipt 同步 | task 状态变化后 receipt 或历史中可看到最新状态 | P1 |
| R5-PEND-6 | 失败恢复 | failed task 可 retry，但 retry 生成新的 attemptId | P1 |

### 5.8.4 live 验收场景

1. 通过 fixture 触发 image generation。
2. 应用 actions 后，节点进入 `queued`。
3. runner 截图 `07-generation-pending.png`。
4. runner 模拟 renderer remount 或页面 refresh。
5. 重新打开助手/画布。
6. 验证 pending badge 仍存在，generation task 没有重复入队。
7. artifact 保存 remount 前后 state diff。

---

## 5.9 历史会话与恢复

### 5.9.1 产品目标

R5 要验证会话历史不是 UI 装饰，而是真实可恢复的创作日志。恢复会话时，历史 actions 和 pending actions 只能展示，不能自动执行。

### 5.9.2 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-HIS-1 | 新会话 | live runner 可创建新会话并发送消息 | P0 |
| R5-HIS-2 | 自动命名 | 会话标题可由首条消息/intent 生成 | P1 |
| R5-HIS-3 | 历史列表 | 点击历史按钮显示列表，包含本轮会话 | P0 |
| R5-HIS-4 | 搜索 | 搜索关键字能过滤历史 | P0 |
| R5-HIS-5 | 恢复 | 恢复后消息、reply、preview/receipt 可见 | P0 |
| R5-HIS-6 | 不自动执行 | 恢复 pending actions 不触发 executor | P0 |
| R5-HIS-7 | 导出脱敏 | 导出会话不包含 key/token/local path/signed URL | P0 |

### 5.9.3 交互说明

- 历史 drawer 打开后，当前会话置顶。
- 搜索框输入关键词后，列表即时过滤。
- 点击历史项后，面板恢复对应消息流。
- 如果历史项包含 pending actions，显示“上次未应用的建议”，但 CTA 必须需要用户重新点击。
- 如果历史项包含 generation pending，显示状态，不自动 restart。

---

## 5.10 失败转回归与 Scorecard

### 5.10.1 产品目标

每一个 live 失败都不能只停留在“截图坏了”。R5 必须建立失败归因和沉淀机制：失败 -> artifact -> fixture candidate -> 单测/回归 -> 修复 -> scorecard 更新。

### 5.10.2 Failure Owner 分类

| Owner | 典型失败 | 建议回归位置 |
|---|---|---|
| `ui` | selector 找不到、按钮不可点击、面板状态错误 | `modules/app/appAssistantPanel*.test.js` |
| `stream` | frame 顺序错误、delta actions 被使用、stop 失效 | `assistantProtocol.test.js` / `assistantStreamingClient.test.js` |
| `api` | chatStream fallback、abort、HTTP error 归一失败 | `api/canvasAgentApi*.test.js` |
| `schema` | 合法 action 被拒、非法 action 放行 | `canvas_agent_action_schema_test.py` |
| `executor` | 节点重复、连线错误、布局堆叠 | `assistantActionExecutor.test.js` |
| `generation` | 视频未强确认、pending 丢失、重复入队 | `assistantGenerationTaskStore.test.js` |
| `history` | 恢复丢消息、pending 自动执行 | `assistantConversationStore.test.js` |
| `model` | disabled model 可发送、key 泄露 | `assistantModelRegistry.test.js` |
| `backend` | status/chat/validate/conversation route 错误 | `canvas_agent_route_service_test.py` |

### 5.10.3 Scorecard 输出

```json
{
  "runId": "assistant-live-2026-06-03T10-00-00-000Z",
  "success": false,
  "score": 82,
  "checks": {
    "panelOpen": {"pass": true, "score": 10},
    "modelDropdown": {"pass": true, "score": 10},
    "streaming": {"pass": true, "score": 15},
    "actionPreview": {"pass": true, "score": 15},
    "applyReceipt": {"pass": false, "score": 0, "owner": "executor"},
    "historyRestore": {"pass": true, "score": 10},
    "generationGate": {"pass": true, "score": 15},
    "secretSafety": {"pass": true, "score": 10}
  },
  "failedStep": "apply-actions",
  "artifactDir": "output/regression/assistant-live/...",
  "suggestedRegression": "modules/assistant/assistantActionExecutor.test.js"
}
```

### 5.10.4 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R5-SCORE-1 | 分项评分 | panel、model、stream、preview、apply、history、generation、secret 各有结果 | P0 |
| R5-SCORE-2 | 失败归因 | 每个失败必须标注 likelyOwner 和 suggestedRegression | P0 |
| R5-SCORE-3 | fixture candidate | 失败 payload 自动生成最小候选 fixture | P0 |
| R5-SCORE-4 | artifact summary | 输出 summary.md，给人类快速判断失败 | P0 |
| R5-SCORE-5 | 趋势记录 | 后续可把 score 历史写入 docs 或 CI artifact | P1 |

---

## 5.11 Secret Safety 与发布 Preflight

### 5.11.1 产品目标

R5 的所有 live 产物必须默认安全。由于用户可能配置真实 key 和 endpoint，任何截图、日志、trace、history export 都必须脱敏。发布前必须验证普通用户不需要全局安装 Pi 或开发依赖。

### 5.11.2 Secret Safety 需求

| 编号 | 需求点 | 优先级 |
|---|---|---|
| R5-SEC-1 | artifact 不保存真实 `apiKey`、`proxyToken`、Authorization、Bearer token | P0 |
| R5-SEC-2 | URL 保存前移除 userinfo、query、fragment 中的 token/signature | P0 |
| R5-SEC-3 | Windows 本地路径保存前替换为 `[REDACTED_PATH]` | P0 |
| R5-SEC-4 | screenshot OCR/DOM text 不应出现 key/token 明文 | P1 |
| R5-SEC-5 | scoped secret scan 必须作为 R5 preflight 一部分 | P0 |
| R5-SEC-6 | 测试 fixture 不使用真实 OpenAI-key 前缀字面量，不把测试占位符误判为泄密 | P0 |

### 5.11.3 发布 Preflight 需求

| 编号 | 需求点 | 优先级 |
|---|---|---|
| R5-PRE-1 | 普通用户不能被要求全局安装 Pi | P0 |
| R5-PRE-2 | Node 22+ sidecar 打包方案必须在 preflight 中检查 | P1 |
| R5-PRE-3 | runtime/source/license/lockfile/source tree 检查纳入离线回归 | P1 |
| R5-PRE-4 | live mock 回归在无外网、无真实 key 时可跑 | P0 |
| R5-PRE-5 | 真实 API live smoke 必须显式 opt-in，默认不运行 | P0 |

---

## 6. R5 关键页面与交互规格

### 6.1 助手打开

- 入口：右下角原有 icon/FAB。
- 点击反馈：按钮有 pressed/open 状态。
- 面板位置：靠右下，不遮挡核心画布中心区域。
- 初始内容：欢迎语、快捷意图、参考图上传入口、模型 pill、历史入口。
- 验收：真实截图中可定位所有元素。

### 6.2 模型选择

- 点击模型 pill 打开下拉。
- 下拉显示当前 provider 和模型名。
- disabled model 灰态显示，但仍可看到不可用原因。
- 点击可用模型后关闭下拉并更新 pill。
- 点击 disabled model 不关闭或显示配置提示，不切换 selectedModel。

### 6.3 发送与 streaming

- 输入 prompt 后 Enter 发送。
- 发送后输入框可禁用或保持可输入，但 Send CTA 进入 streaming 状态。
- Assistant bubble 显示流式 delta。
- Stop CTA 在 streaming 期间可见。
- Done 后如果有 actions，显示 preview；没有 actions，只显示回复。

### 6.4 Action preview

- Preview 卡片必须包含：
  - 摘要标题
  - action 分组
  - 风险等级
  - 影响节点/边
  - warnings
  - Apply / Cancel CTA
- medium/high risk 必须有明显视觉区分。
- high risk 不完成强确认时 Apply disabled。

### 6.5 应用与回执

- 点击 Apply 后按钮显示 applying。
- 成功后 receipt 显示：
  - 创建节点数
  - 创建边数
  - 更新节点数
  - queued generation tasks
  - warnings
  - 聚焦按钮
- 失败后 receipt/error 显示：
  - 失败原因
  - 已成功/未执行区分
  - 复制诊断

### 6.6 历史恢复

- 点击历史 icon 打开 drawer。
- 搜索历史项。
- 点击历史项恢复消息。
- 恢复后的 pending actions 只展示，不自动执行。
- 关闭 drawer 不影响当前会话。

### 6.7 生成 pending

- 低风险 text/image apply 后，在节点和面板中出现 pending。
- renderer remount 后 pending 仍在。
- video action preview 显示强确认，不确认不出现 pending。

---

## 7. 数据与协议要求

### 7.1 Live Runner Step Event

```json
{
  "stepId": "04-action-preview",
  "status": "pass",
  "startedAt": "2026-06-03T10:00:00.000Z",
  "finishedAt": "2026-06-03T10:00:01.200Z",
  "screenshotPath": "screenshots/04-action-preview.png",
  "state": {
    "panelStatus": "done_pending_actions",
    "pendingActionCount": 4,
    "riskLevel": "medium"
  }
}
```

### 7.2 Sanitized Assistant State Snapshot

```json
{
  "conversationId": "conv_r5",
  "selectedModel": {
    "provider": "pi_canvas_agent",
    "modelId": "agent-live-fixture"
  },
  "status": "done_pending_actions",
  "lastWarnings": [],
  "pendingActions": [
    {"type": "create_node", "nodeType": "comment", "name": "R5 Review Note"}
  ],
  "lastReceipt": null
}
```

### 7.3 Graph Snapshot

```json
{
  "nodeCount": 2,
  "edgeCount": 1,
  "nodes": [
    {"id": "seed_prompt", "nodeType": "source-text", "name": "Seed Prompt"},
    {"id": "node_created_1", "nodeType": "comment", "name": "R5 Review Note"}
  ],
  "edges": [
    {"source": "seed_prompt", "target": "node_created_1"}
  ],
  "selectedNodeIds": ["node_created_1"]
}
```

---

## 8. 验收标准

### 8.1 P0 验收

| 验收项 | 标准 |
|---|---|
| 真实页面打开 | `#fabBtn` 或 assistant launcher 可见并可点击 |
| 面板截图 | 生成 `01-open-panel.png`，无 console/pageerror 阻断 |
| 模型菜单 | 可用/禁用模型都在截图中，禁用模型阻止发送 |
| stream | start/delta/done 顺序可追踪，delta 不执行 actions |
| preview | done actions 生成 preview card |
| apply | validate 后 executor 应用 actions，画布 before/after diff 正确 |
| receipt | 面板显示执行结果和 affected nodes |
| generation gate | text/image 可 queue，video 必须强确认 |
| pending state | renderer remount/refresh 不丢 pending，不重复入队 |
| history | 历史列表可恢复会话，pending actions 不自动执行 |
| artifacts | 输出 screenshots/trace/scorecard/summary |
| secret scan | scoped scan 结果为 0，artifact 不含 key/token |

### 8.2 P1 验收

| 验收项 | 标准 |
|---|---|
| visual diff | 对关键组件区域做 diff，而非整页噪音 diff |
| score trend | scorecard 可被 CI 或本地脚本汇总 |
| manual QA script | QA 可按文档手动复现 R5 核心旅程 |
| typed fixture | fixture schema 清晰，错误能指向字段 |
| packaging preflight | Node sidecar/runtime/license/source tree 检查纳入发布门槛 |

---

## 9. 需求优先级说明

### P0：必须本轮完成

- 完整 live journey runner。
- deterministic fixture。
- 真实页面截图：打开、模型、stream、preview、apply、history、generation gate。
- 文本/图片低风险自动 queue。
- 视频强确认。
- pending 状态 remount 保持。
- 每个 live 失败生成 artifact 和 fixture candidate。
- scoped secret scan 和 artifact 脱敏。

### P1：建议本轮完成或紧随其后

- visual diff。
- scorecard 趋势。
- QA 手动脚本。
- packaging preflight 深化。
- partial failure 更细粒度回执。

### P2：后续迭代

- 多浏览器矩阵。
- 移动端完整 live journey。
- 真实 API opt-in smoke。
- Canvas Doctor scorecard。
- story_to_video 全链路 live calibration。

---

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 页面资源噪音导致误报 | live check 不稳定 | 只阻断 assistant 关键路径错误，普通宿主页资源错误记录但不 fail |
| 真实模型输出不稳定 | 回归不可重复 | P0 使用 deterministic fixture，真实 API smoke opt-in |
| 视频误触发费用 | 用户损失 | 默认 mock runner，video 必须强确认，真实视频生成不纳入默认 live |
| pending 状态重复入队 | 重复生成/重复扣费 | 稳定 taskId、apply lock、idempotent generation runner |
| API Key 泄露 | 安全事故 | artifact sanitizer、scoped secret scan、UI 不展示 key |
| 画布内部结构不稳定 | executor live diff 难判断 | graphStore adapter 输出稳定 before/after snapshot |
| 截图 diff 脆弱 | 误报多 | 先做语义断言 + 关键区域截图，P1 再做视觉 diff |
| 只做 happy path | 后续高级功能不可靠 | R5 必须覆盖失败路径并转回归 |

---

## 11. 与后续 R6-R8 的关系

R5 是后续高级能力的质量底座。

| 后续能力 | R5 提供的底座 |
|---|---|
| R6 Canvas Doctor | live scorecard、graph snapshot、失败归因 |
| R7 Auto Layout | layout action live diff、节点重叠/聚焦验收 |
| R8 一句话工作流 | stream -> preview -> apply -> receipt 完整验收链 |
| story_to_video | 视频强确认、pending 状态、mock generation runner |
| 分镜导演 | 多节点/多边/布局 preview 和历史恢复 |
| 变体分支 | action 分组、批量风险、会话事务日志 |

---

## 12. R5 最小可落地版本

如果要用最短路径交付 R5，建议 P0 MVP 定义如下：

1. 一个 live fixture：`r5-basic-create-connect-layout-focus`。
2. 一个 generation fixture：`r5-generation-permission-gate`。
3. 一个 history fixture：`r5-history-restore-pending-actions`。
4. 一个失败 fixture：`r5-invalid-delta-actions-do-not-execute`。
5. live runner 生成 6-8 张截图和 `scorecard.json`。
6. 每次失败生成 `fixture-candidate.json`。
7. 全量回归命令包含：
   - frontend Node tests
   - backend Python tests
   - live screenshot journey
   - scoped secret scan

MVP 完成后，才能进入 R6 Canvas Doctor 和 R8 story_to_video 的稳定开发。否则高级能力会把已有不稳定点放大。

---

## 13. 最终验收口径

R5 不是“脚本能跑一下”。R5 只有在以下条件同时满足时才算完成：

1. 真实网页截图显示助手完整旅程可用。
2. stream、preview、apply、history、model、generation gate 都进入 live 验收。
3. 文本/图片生成低风险自动 queue，视频生成强确认阻断。
4. renderer remount/refresh 不丢 pending，也不重复入队。
5. 每个失败都能留下 artifact，并能转成回归 fixture。
6. 所有 artifact 和文档 scoped secret scan 为 0。
7. 普通用户不需要全局安装 Pi 或开发依赖即可使用打包后的助手能力。

这就是 R5 的产品完成标准：真实、可证据化、可复现、可发布。
