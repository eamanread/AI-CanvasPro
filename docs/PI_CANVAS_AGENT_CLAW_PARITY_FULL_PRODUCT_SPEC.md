# Pi Canvas Agent 对齐 Claw Code 最终能力：完整功能、交互与后端规格

状态：v1.0 可执行规格  
日期：2026-06-04  
项目：`D:\Aic\huanying-source-windows-20260430-122116`  
目标承载：Pi Canvas Agent  
参考目标：Claw Code 助手历史最终实现、最终方案、踩坑记录

---

## 0. 文档定位

本文不是普通功能清单，而是一份面向产品、前端、后端、Agent/Sidecar、QA、发布负责人和后续接力开发者的完整规格文档。

它回答四个问题：

1. 如果目标是 Claw Code 助手最终产品能力，Pi 面板还缺什么。
2. 每个缺失功能应如何交互、如何存数据、如何接后端。
3. 历史开发踩过哪些坑，怎样在 Pi 路线里一次性避开。
4. 一个有行业背景、真正做过 AI 创作工具和节点画布的人，会如何把这个助手做成生产级功能，而不是 prompt demo。

默认前提：

- Pi 是新的 Agent runtime / sidecar，不再复刻 Claw CLI 编程代理路线。
- Huanying 继续拥有画布上下文、权限、动作 schema、预览、执行、生成任务、历史、回归和发布边界。
- Claw 历史代码和文档是产品目标与坑点证据，不等于当前 Pi 已经完成同等能力。
- 普通用户不能被要求全局安装 Pi、Node 或任何开发依赖。

---

## 1. 一句话产品目标

把右下角 RH/Pi 助手从“能聊天、能展示面板”升级为 Huanying 画布上的对话式创作操作系统：用户用自然语言和参考素材，让 Agent 理解当前画布、提出结构化动作、预览风险、执行低风险改动、驱动文本/图片生成、强确认视频生成、保存完整历史，并能恢复 Claw 历史中的画布医生、自动整理、一句话工作流、story_to_video、分镜导演、变体分支和模板炼金术能力。

---

## 2. 当前基线与关键差距

### 2.1 当前 Pi 已有能力

| 领域 | 当前已有 | 说明 |
|---|---|---|
| 面板入口 | 右下角 RH/Canvas Agent 入口、右侧助手面板 | 已有基础 UI shell |
| 聊天状态 | 非流式和流式前端状态机 | 前端可处理 delta/done/warning |
| 后端路由 | `/api/v2/canvas-agent/*` | status/chat/chat stream/context preview/actions validate/conversations |
| Action 安全 | Canvas schema 包装 Claw schema | 能复用 Claw 历史 action 安全经验 |
| 预览/应用 | pending actions、validate、executor、receipt | 已有基础闭环 |
| 历史 | local conversation store 和后端 JSON conversation service | 基础创建/搜索/恢复/删除/导出 |
| 附件 | 本地 chip + uploader adapter | 还不是完整引用系统 |
| 模型 | 模型下拉、统一配置摘要、禁用态 | 真实 Pi 模型调用还未闭环 |
| Sidecar | JSONL runner、protocol、工具白名单 | 当前 runner 仍是 echo POC |

### 2.2 最关键硬缺口

`integrations/pi_canvas_agent/src/runner.ts` 目前仍是 POC：它接收 JSONL 后返回 `Pi canvas agent received: <message>`，说明 UI 和后端通道虽然已经搭起来，但智能体内核还没有真正接入 Pi SDK、模型、session、tool call 和结构化 action proposal。

只要这个缺口未补，当前 Pi 面板仍是“壳 + 安全执行通道”，不是完整 Canvas Agent。

### 2.3 对齐 Claw 最终目标后的差距分层

| 层级 | 缺口 | 严重度 |
|---|---|---|
| Agent 内核 | 真实 Pi SDK 调用、tool registration、模型输出解析 | P0 阻塞 |
| 协议 | 真实 streaming event，而不是同步 reply 包装成 NDJSON | P0 |
| 上下文 | 大画布摘要、附件/引用、偏好、历史记忆、技能上下文 | P0/P1 |
| 交互 | 结构化预览卡、@ 引用、强确认、生成状态、错误恢复 | P1 |
| 创作技能 | 画布医生、整理、workflow、story_to_video、分镜、变体 | P1/P2 |
| 生成 | 文本/图片真实触发、pending mount、视频授权、结果挂载 | P1/P2 |
| 模板 | 模板保存、复用、版本、权限、团队治理 | P2/P3 |
| 回归 | fixture、live scorecard、artifact、source preflight | P0/P1 |
| 发布 | sidecar lockfile、license、bundled runtime、离线可运行 | P3 |

---

## 3. 产品原则

### 3.1 不信任 Agent

Agent 永远只提出 proposal，不直接改画布、不直接调用生成、不直接读写文件、不执行 shell、不操作浏览器。

所有 actions 必须经过：

```text
Pi output
  -> normalize
  -> backend schema validation
  -> frontend preview / confirmation policy
  -> latest context re-validate
  -> executor
  -> receipt / transaction / history
```

### 3.2 只信任 final actions

Streaming delta 只是 UI 文本，不允许触发画布动作。即使 delta 中出现 actions，也只能记录 warning，不能执行。

### 3.3 成本和风险不隐藏

视频生成、批量生成、外部上传、覆盖已有内容、删除、模板保存、团队库写入全部强确认。文本/图片可以在低风险和 schema 通过后自动运行。

### 3.4 每次执行都可解释、可回退、可复盘

一次 Agent 回复是一笔 transaction。必须能知道：它读了什么上下文，为什么提出这些动作，执行了哪些，失败了哪些，生成了哪些结果，能否撤销。

### 3.5 UI 是创作驾驶舱，不是聊天泡泡

面板必须让用户看见：当前模型、当前模式、读取上下文、引用素材、动作影响、生成状态、风险、历史和下一步建议。

---

## 4. 目标用户旅程

### 4.1 一句话改画布

1. 用户点击右下角 RH icon。
2. 面板打开，状态显示：模型已配置、当前项目、当前会话。
3. 用户输入：“帮我把当前提示词节点连一个图片生成节点，再整理布局。”
4. 前端构建 context：项目、画布、选区、节点、边、素材、附件、模型、历史偏好。
5. Pi sidecar 真实调用模型，stream 返回文本 delta 和 tool.status。
6. final event 返回 actions。
7. UI 展示分组预览卡：将创建 1 个 ai-image，连接 1 条边，执行布局，低风险。
8. 低风险自动应用，或用户点击“应用到画布”。
9. 前端重新构建最新 context，调用 `/actions/validate`。
10. executor 执行 create/connect/layout/focus。
11. 面板显示 receipt，画布聚焦新节点。
12. 历史保存消息、context snapshot、actions、receipt、transaction。

### 4.2 参考图驱动创作

1. 用户点击上传，选择参考图。
2. 文件上传到 Huanying 受控 asset/upload store。
3. chip 显示缩略图、文件名、用途。
4. 用户点击 chip 的用途下拉，选择“角色参考”或“风格参考”。
5. 用户输入：“用这张图作为角色参考，做 3 个短片分镜。”
6. context 只给 Agent `assetId/mime/dimensions/usage/thumbnailHint`，不泄露本地路径或 blob URL。
7. Agent 提出 story_to_video / storyboard actions。
8. 文本/图片节点可自动生成，视频节点只准备，需强确认。

### 4.3 恢复历史继续创作

1. 用户打开历史抽屉。
2. 搜索“短片 / 分镜 / 失败 / 产品图”。
3. 选择会话恢复。
4. 面板恢复消息、pending actions、上次 context summary、receipts。
5. 用户输入：“继续上次方案，只改第 2 个镜头。”
6. Agent 根据历史 transaction 和当前画布差异提出局部 actions。

### 4.4 异常旅程

| 场景 | 用户看到 | 系统行为 |
|---|---|---|
| 模型未配置 | “请先配置 Agent 模型”，按钮跳转设置 | 禁止发送真实请求 |
| sidecar 缺失 | “Pi runner 缺失，无法启动助手内核” | status 返回 missing_runner |
| stream 中断 | 消息失败，可重试/复制 trace | 清空半截 pending actions |
| Agent 返回非法 action | “动作校验失败”，展示建议 | 不执行，保存 fixture candidate |
| 画布已变化 | “画布已变化，已重新校验” | 应用前重新 validate |
| 视频未授权 | “视频生成需要确认” | executor 二次拦截 |
| renderer 未挂载 | “生成任务等待节点挂载” | 保存 pending，不判失败 |
| 失败部分动作 | 成功/失败分组回执 | 可复制诊断，可重试失败项 |

---

## 5. 功能总览与优先级

### 5.1 P0：必须先完成的真实闭环

| 编号 | 功能 | 用户价值 | 验收标准 |
|---|---|---|---|
| P0-01 | 真实 Pi SDK runner | 让助手真的理解请求 | runner 不再 echo，能调用模型并输出 final response |
| P0-02 | Huanying tool proposal | 模型只能提出动作，不能执行动作 | 只注册 `huanying_canvas_propose_actions` |
| P0-03 | 真实 streaming | 看到逐步回复和状态 | sidecar 输出 JSONL events，前端 delta 渲染 |
| P0-04 | Final action contract | actions 只在 done 出现 | delta actions 不执行 |
| P0-05 | 后端 schema fail closed | 防止危险动作 | shell/file/browser/MCP/delete 等被拒绝 |
| P0-06 | 模型配置闭环 | 用户知道为什么不可用 | status/model menu 不泄露 key |
| P0-07 | Source/runtime preflight | 防止发布缺文件 | runner/source/lock/license 缺失时 regression fail |
| P0-08 | Fixture 回归 | 不依赖真实模型也能测 UI | deterministic stream fixture 能跑完整预览/应用 |

### 5.2 P1：可用产品体验

| 编号 | 功能 | 用户价值 | 验收标准 |
|---|---|---|---|
| P1-01 | 分组预览卡 | 看懂将发生什么 | create/connect/update/layout/generate 分组展示 |
| P1-02 | 逐条选择/跳过 | 用户可控 | 可取消单条 action 后再 validate/apply |
| P1-03 | 强确认 UX | 高风险不误执行 | 视频/模板/批量覆盖必须确认 |
| P1-04 | @ 引用系统 | 精确引用节点/素材/附件 | resolver 可搜索、hover 预览、写入 context references |
| P1-05 | 附件用途选择 | 参考图真正可用 | style/character/composition/product/firstFrame/mask |
| P1-06 | 历史高级管理 | 可继续旧创作 | 搜索、重命名、删除、导出、恢复 pending |
| P1-07 | 错误恢复 | 非技术用户可理解 | friendlyMessage + diagnostics + copy trace |
| P1-08 | 文本/图片生成生命周期 | 从规划到结果闭环 | queued/running/succeeded/failed/result assets |
| P1-09 | 画布医生 | 快速发现问题 | 3-8 条诊断，可落注释/聚焦 |
| P1-10 | 自动整理 | 让画布更清晰 | 只 move/layout/group/rename/focus，不改 prompt/model |

### 5.3 P2：恢复 Claw 高级创作能力

| 编号 | 能力 | 目标 |
|---|---|---|
| P2-01 | 一句话工作流 | 文生图、图生视频、文生图生视频、图片变体 |
| P2-02 | story_to_video | 故事大纲、风格设定、分镜文本、关键图、视频准备 |
| P2-03 | 分镜导演 | 3-8 个镜头组，镜头运动、风格、连续性、prompt |
| P2-04 | 变体分支 | 选中子图复制 3-5 条风格/文案/构图分支 |
| P2-05 | Prompt 手术台 | 局部改写 prompt，不误覆盖用户内容 |
| P2-06 | 爆款实验室 | 参考视频/图文拆解为可复刻 workflow |
| P2-07 | 项目偏好记忆 | 风格、比例、模型、命名、品牌语气跨会话生效 |
| P2-08 | 上下文调试 | 用户/开发者看到模型读了什么 |

### 5.4 P3：模板、团队化与发布

| 编号 | 能力 | 目标 |
|---|---|---|
| P3-01 | 模板保存 | 从成熟子图提炼模板资产 |
| P3-02 | 模板复用 | 菜单或一句话再次创建模板 workflow |
| P3-03 | 权限/版本 | 作者、标签、版本、项目/团队范围 |
| P3-04 | 团队库治理 | 模板审核、更新、弃用、回滚 |
| P3-05 | 发布打包 | bundled Node/Pi sidecar，无全局依赖 |
| P3-06 | Live scorecard | 真实模型/browser 失败可量化和回归 |

---

## 6. 面板交互规格

### 6.1 信息架构

```text
RH Floating Entry
  -> Assistant Panel
      Header
        - Avatar / 状态灯
        - 标题：幻映智能体 / Pi Canvas Agent
        - conversationId / copy
        - history
        - new conversation
        - close
      Status Strip
        - model
        - mode
        - context read summary
        - selected nodes count
        - attachments count
      Skill Launcher
      Messages
      Action Preview Drawer
      Receipt Timeline
      Composer
```

### 6.2 Header

| 元素 | 行为 |
|---|---|
| Avatar 状态灯 | ready 绿色、streaming 蓝色、error 橙红、missing runtime 灰色 |
| 标题 | 默认“幻映智能体”；debug 可显示 “Pi Canvas Agent” |
| conversationId | 短 ID；点击复制完整 ID |
| 历史按钮 | 打开历史抽屉 |
| 新会话 | 新建 conversation，可选择继承项目偏好，不继承 pending actions |
| 关闭 | 收起面板，不中断后台生成任务；streaming 时二次提示 |

### 6.3 Status Strip

必须显示：

- 当前模型：provider / model / configured 状态。
- 当前模式：Ask、Plan、Canvas Agent、Generate、Doctor、Auto Safe。
- 读取上下文：节点数、边数、选区数、附件数、素材数。
- 风险策略：Auto safe on/off，视频是否授权。

示例：

```text
Pi · gpt-4.1-mini | Canvas Agent | 读取 18 节点 / 22 连线 / 2 选中 / 1 附件 | Auto safe
```

### 6.4 Skill Launcher

技能点击不直接执行，只做三件事：

1. 设置 `assistantIntent`。
2. 填入一段可编辑 prompt。
3. 在 status strip 显示当前技能。

| 技能 | assistantIntent | 推荐能力 |
|---|---|---|
| 电商套图 | `commerce_pack` | product shots、UGC、detail page、variants |
| 海报设计 | `poster_design` | layout、copy、visual hierarchy |
| 品牌设计 | `brand_design` | style bible、logo/VI workflow |
| 室内设计 | `interior_design` | reference image、material board、render workflow |
| 社交媒体 | `social_media` | platform variants、cover/post carousel |
| 剧情短片 | `story_short` | story_to_video、storyboard director |
| 营销视频 | `marketing_video` | ad script、shot plan、video prep |
| 智能漫剧 | `comic_drama` | character continuity、multi-shot storyboard |
| 爆款实验室 | `viral_lab` | reference deconstruction、template extraction |

### 6.5 Composer

| 控件 | 完整交互 |
|---|---|
| 上传 | 支持图片、视频、文档；上传后生成 chip；失败保留本地 chip 并提示未入 context |
| 输入框 | 多行、Ctrl/Cmd+Enter 发送、粘贴图片自动附件、可选中文案复制 |
| @ | 打开引用 resolver；支持节点、素材、附件、历史产物、模板、文档 |
| 模型 | 打开模型下拉；禁用模型显示原因和配置入口 |
| Ask 下拉 | Ask only / Propose actions / Auto safe / Generate confirm |
| AUTO | 展示当前自动执行策略；点击打开策略 popover |
| 爆款实验室 | 打开 viral workflow 向导，不直接执行 |
| 发送 | idle 时发送；streaming 时变停止 |
| 应用 | 仅 pending actions 出现；强确认未通过时禁用或显示确认按钮 |

### 6.6 @ 引用 resolver

分组：

```text
@ 当前选区
@ 画布节点
@ 素材库
@ 本轮附件
@ 历史产物
@ 工作流模板
@ 文档/知识卡片
```

每条引用显示名称、类型、缩略图或图标、来源、用途标签、最近状态。Hover preview 根据类型展示图像、视频封面、文档摘要或节点摘要。

写入 request 的引用必须是安全摘要：

```json
{
  "references": [
    {
      "id": "asset_123",
      "kind": "asset",
      "mime": "image/png",
      "usage": "character_reference",
      "source": "attachment",
      "dimensions": { "width": 1024, "height": 1024 }
    }
  ]
}
```

禁止写入：真实本地路径、blob URL、data URL、真实 API URL、完整文件内容。

### 6.7 Action Preview

预览卡必须结构化，而不是纯文本。

```text
Action Preview
  Summary
    - 将创建 5 个节点
    - 将连接 4 条边
    - 将整理 storyboard_grid 布局
    - 文本/图片生成可自动开始
    - 视频生成需要确认
  Groups
    1. 创建节点
    2. 连接节点
    3. 布局/视野
    4. 生成任务
    5. 记忆/偏好
    6. 模板/高风险
  Controls
    - Apply safe actions
    - Approve high risk
    - Skip selected
    - Copy diagnostics
    - View JSON
```

每条 action 显示动作类型、目标节点/边、用户可懂的影响描述、风险等级、是否自动应用、是否需要确认、失败诊断。

### 6.8 强确认

强确认必须包含风险原因、影响范围、成本/耗时提示、是否可撤销、明确按钮文案。

示例：

```text
需要确认：启动视频生成
这可能消耗额度，并需要较长时间。将影响 3 个 ai-video 节点。
[只创建准备节点] [确认并启动视频生成]
```

### 6.9 Receipt

Receipt 是执行后的审计记录，不是简单 toast。

必须包含：

- 成功数量。
- 失败数量。
- 创建节点 IDs。
- 连接 IDs。
- 启动/等待的生成任务。
- 视频授权结果。
- 可撤销 transactionId。
- 下一步建议。

示例：

```text
已应用 8 项画布更新
- 创建 5 个节点：故事大纲、风格设定、镜头 1-3
- 连接 4 条边
- 已启动 3 个图片生成任务
- 3 个视频节点仅准备，未启动视频生成
- 可在历史中撤销本次 batch
```

### 6.10 历史抽屉

支持搜索、重命名、删除/归档、导出 JSON/Markdown、恢复 pending actions、恢复 context snapshot 摘要。

历史列表展示：

```text
标题
最后消息摘要
技能 / 模型 / 更新时间
操作摘要：创建 5 节点、3 图片生成、1 视频待确认
```

---

## 7. 后端总体架构

### 7.1 目标架构

```text
Frontend Panel
  appAssistantPanel.js
  assistantContextBuilder.js
  assistantActionPreview.js
  assistantActionExecutor.js
  assistantConversationStore.js
  assistantAttachmentStore.js
  assistantModelRegistry.js
        |
        | HTTP / NDJSON
        v
Python Backend
  CanvasAgentRouteService
  CanvasAgentConversationService
  CanvasAgentContextService
  CanvasAgentActionSchema
  PiBridgeService
  PiRuntimeService
  Provider/Model Config
        |
        | JSONL stdin/stdout
        v
Pi Sidecar
  runner.ts
  protocol.ts
  huanyingTools.ts
  skill prompt registry
  Pi SDK session
        |
        | provider proxy only
        v
Model Provider
```

### 7.2 后端职责边界

| 模块 | 职责 | 不允许做 |
|---|---|---|
| RouteService | HTTP 参数解析、错误响应、stream 输出 | 执行动作 |
| PiBridgeService | 调 sidecar、解析 JSONL、校验 response | 暴露真实 key、跳过 schema |
| PiRuntimeService | runner 路径、env、status | 首次联网安装依赖 |
| ContextService | 上下文脱敏/压缩/preview | 传完整项目 JSON |
| ActionSchema | action 白名单、别名修复、风险、确认 | 信任 Agent 的风险声明 |
| ConversationService | 消息、context、transactions、receipts | 保存 secrets/raw blob |
| GenerationTaskStore | 生成任务状态和结果 | 未授权启动视频 |
| TemplateService | 模板保存/版本/权限 | 把 preview 伪装成保存成功 |

---

## 8. API 规格

### 8.1 Status

`GET /api/v2/canvas-agent/status`

返回：

```json
{
  "success": true,
  "available": true,
  "status": "ready",
  "runtime": {
    "configured": true,
    "running": false,
    "status": "ready",
    "runnerPath": "integrations/pi_canvas_agent/dist/runner.js",
    "source": "project_sidecar"
  },
  "provider": {
    "name": "pi_canvas_agent",
    "configured": true,
    "endpoint": "https://example.com/v1",
    "model": "gpt-4.1-mini",
    "apiKeyPresent": true,
    "proxyTokenPresent": false
  },
  "capabilities": {
    "streaming": true,
    "actions": true,
    "attachments": true,
    "vision": true,
    "textGeneration": true,
    "imageGeneration": true,
    "videoGenerationRequiresConfirmation": true
  }
}
```

禁止返回真实 `apiKey`、`proxyToken`、URL query secret、Authorization header。

### 8.2 Chat

`POST /api/v2/canvas-agent/chat`

请求：

```json
{
  "message": "帮我检查画布并整理布局",
  "conversationId": "conv_123",
  "mode": "actions",
  "assistantIntent": { "id": "canvas_doctor" },
  "model": { "provider": "pi_canvas_agent", "modelId": "gpt-4.1-mini" },
  "context": {},
  "attachments": [],
  "references": []
}
```

响应：

```json
{
  "success": true,
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "traceId": "trace_789",
  "reply": "我发现 3 个问题，并准备了整理方案。",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false,
  "usage": { "inputTokens": 3200, "outputTokens": 900 }
}
```

### 8.3 Chat Stream

`POST /api/v2/canvas-agent/chat/stream`

Content-Type：`application/x-ndjson; charset=utf-8`

事件：

```json
{"type":"message.start","conversationId":"conv_123","messageId":"msg_456","traceId":"trace_789"}
{"type":"message.delta","delta":"我先检查当前画布..."}
{"type":"tool.status","name":"huanying_canvas_propose_actions","status":"planning"}
{"type":"action.proposed","count":5,"riskLevel":"low"}
{"type":"warning","message":"检测到 2 个孤立节点。"}
{"type":"message.done","reply":"已准备好整理方案。","actions":[],"warnings":[],"requiresConfirmation":false}
```

规则：

- `message.delta` 不允许执行 actions。
- `action.proposed` 只做 UI 状态，不进入 pending，除非 final done 确认。
- `message.done` 是唯一 action source of truth。
- 中断时后端必须输出或前端合成 `error/cancelled` 状态。

### 8.4 Actions Validate

`POST /api/v2/canvas-agent/actions/validate`

请求：

```json
{
  "actions": [],
  "context": {},
  "videoAuthorized": false,
  "transactionId": "txn_123"
}
```

成功：

```json
{
  "success": true,
  "valid": true,
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false,
  "riskSummary": {
    "level": "low",
    "reasons": [],
    "autoApplicable": true
  }
}
```

失败：

```json
{
  "success": false,
  "valid": false,
  "friendlyMessage": "这个动作引用了不存在的节点，因此没有执行。",
  "diagnostics": [
    {
      "code": "missing_node",
      "actionIndex": 2,
      "message": "找不到目标节点 node_abc",
      "suggestion": "刷新画布后重试，或让助手重新读取当前选区。"
    }
  ],
  "actions": []
}
```

### 8.5 Context Preview

`POST /api/v2/canvas-agent/context/preview`

用途：调试和校准，显示 sanitized context summary。

必须包含：

- nodeCount/edgeCount。
- selectedNodeIds。
- assets count。
- attachments count。
- prompt budget。
- redaction warnings。
- compaction status。
- assistantIntent。
- model reference。

### 8.6 Conversations

```text
GET    /api/v2/canvas-agent/conversations?query=
POST   /api/v2/canvas-agent/conversations
GET    /api/v2/canvas-agent/conversations/{id}
PATCH  /api/v2/canvas-agent/conversations/{id}
DELETE /api/v2/canvas-agent/conversations/{id}
POST   /api/v2/canvas-agent/conversations/{id}/messages
POST   /api/v2/canvas-agent/conversations/{id}/receipts
GET    /api/v2/canvas-agent/conversations/{id}/export?format=json|markdown
```

### 8.7 建议新增 Generation Tasks

```text
GET    /api/v2/canvas-agent/generation-tasks?conversationId=&nodeId=
POST   /api/v2/canvas-agent/generation-tasks/{id}/cancel
POST   /api/v2/canvas-agent/generation-tasks/{id}/retry
POST   /api/v2/canvas-agent/generation-tasks/retry-failed
```

### 8.8 建议新增 Templates

```text
GET    /api/v2/canvas-agent/templates?query=&scope=project|user|team
POST   /api/v2/canvas-agent/templates
GET    /api/v2/canvas-agent/templates/{id}
PATCH  /api/v2/canvas-agent/templates/{id}
POST   /api/v2/canvas-agent/templates/{id}/instantiate
POST   /api/v2/canvas-agent/templates/{id}/archive
```

---

## 9. Sidecar / Pi Runner 规格

### 9.1 JSONL 请求

Python -> sidecar：

```json
{
  "id": "pi-req-1",
  "type": "chat",
  "conversationId": "conv_123",
  "mode": "actions",
  "message": "帮我搭一个文生图生视频工作流",
  "model": { "provider": "pi_canvas_agent", "modelId": "gpt-4.1-mini" },
  "context": {},
  "stream": true
}
```

### 9.2 JSONL 响应

sidecar -> Python：

```json
{"id":"pi-req-1","type":"event","event":{"type":"message.start","traceId":"trace_1"}}
{"id":"pi-req-1","type":"event","event":{"type":"message.delta","delta":"我会创建一个工作流结构..."}}
{"id":"pi-req-1","type":"event","event":{"type":"tool.status","name":"huanying_canvas_propose_actions","status":"called"}}
{"id":"pi-req-1","type":"response","success":true,"reply":"已准备工作流。","actions":[],"warnings":[],"requiresConfirmation":false}
```

### 9.3 Pi SDK Runner 内部流程

```text
handleChat(request)
  -> normalize request
  -> build system prompt
  -> build skill prompt by assistantIntent
  -> create / resume Pi session by conversationId
  -> register only huanying_canvas_propose_actions
  -> send message + context
  -> stream text/tool status
  -> collect proposed actions
  -> normalize proposed actions
  -> safeResponse
```

### 9.4 工具注册规则

唯一允许工具：`huanying_canvas_propose_actions`。

工具参数：

```json
{
  "replyHint": "string",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false
}
```

工具不执行动作，只把 actions 存到 runner 当前请求上下文。

禁止工具：

- read_file
- write_file
- edit_file
- bash
- shell
- powershell
- browser
- package
- MCP
- arbitrary HTTP
- project JSON write

### 9.5 Prompt 组成

```text
System rules
  - You are Huanying Canvas Agent
  - Huanying executes after validation
  - Never use shell/file/browser/network/package/MCP
  - Video generation requires explicit authorization

Response contract
  - reply/actions/warnings/requiresConfirmation
  - actions only through tool
  - no markdown fenced JSON in final tool payload

Canvas action guide
Matched assistant skills
Sanitized context
```

### 9.6 Prompt budget 策略

按优先级保留：

1. 用户最新消息。
2. response contract。
3. 安全规则。
4. 当前选区和直接相连节点。
5. pending actions / last receipt。
6. assistantIntent 对应 skill。
7. 附件和引用摘要。
8. 全画布摘要。
9. 历史摘要。
10. 低优先级节点详情。

超过预算时，先压缩上下文，不删安全规则和 response contract。

---

## 10. Context 数据规格

### 10.1 顶层结构

```json
{
  "schemaVersion": "2026-06-04",
  "project": {},
  "canvas": {},
  "selection": {},
  "viewport": {},
  "assets": {},
  "attachments": [],
  "references": [],
  "workflows": {},
  "promptPresets": {},
  "conversationMemory": {},
  "projectPreferences": {},
  "assistantIntent": {},
  "model": {},
  "warnings": [],
  "budget": {}
}
```

### 10.2 Canvas Summary

```json
{
  "nodeCount": 20,
  "edgeCount": 18,
  "nodes": [
    {
      "id": "node_1",
      "nodeType": "source-text",
      "name": "产品卖点",
      "textExcerpt": "...",
      "promptExcerpt": "...",
      "position": { "x": 100, "y": 200 },
      "size": { "width": 320, "height": 180 },
      "status": "idle",
      "model": "",
      "provider": "",
      "media": { "hasImage": false, "hasVideo": false },
      "metadata": {}
    }
  ],
  "edges": [],
  "diagnostics": [],
  "layoutHints": {}
}
```

### 10.3 Attachments / References

```json
{
  "id": "ref_1",
  "kind": "image",
  "source": "attachment",
  "assetId": "asset_123",
  "name": "role.png",
  "mime": "image/png",
  "usage": "character_reference",
  "dimensions": { "width": 1024, "height": 1024 },
  "safePreview": true
}
```

禁止：`C:\Users\...`、`D:\...`、`blob:`、`data:`、`sk-*`、`Bearer ...`、`apiKey`、raw binary/base64。

### 10.4 Conversation Memory

```json
{
  "conversationId": "conv_123",
  "summary": "用户正在制作 15 秒剧情短片。",
  "recentMessages": [],
  "recentReceipts": [],
  "pendingActions": [],
  "lastAppliedTransactionId": "txn_123"
}
```

### 10.5 Project Preferences

```json
{
  "visualStyle": "电影感、柔和逆光",
  "aspectRatio": "16:9",
  "preferredImageModel": "...",
  "preferredVideoDurationSec": 5,
  "brandTone": "高级、克制",
  "namingRules": "镜头节点以 Shot 01 命名"
}
```

偏好字段必须白名单化，不允许存 secret/path/raw prompt dump。

---

## 11. Action Contract

### 11.1 Action Envelope

```json
{
  "schemaVersion": "2026-06-04",
  "actionId": "act_123",
  "type": "create_node",
  "riskLevel": "low",
  "requiresConfirmation": false,
  "clientMutationId": "cm_123",
  "metadata": {
    "source": "pi_canvas_agent",
    "conversationId": "conv_123",
    "messageId": "msg_456",
    "traceId": "trace_789",
    "assistantIntent": "story_short"
  }
}
```

### 11.2 允许动作

| Action | 风险 | 自动应用 | 说明 |
|---|---|---|---|
| `create_node` | low/medium | 低风险可 | 创建安全节点 |
| `update_node_data` | low/medium/high | 视字段 | prompt/metadata 可低风险，覆盖结果高风险 |
| `rename_node` | low | 可 | 重命名 |
| `connect_nodes` | low/medium | 可 | 需端口语义校验 |
| `layout_nodes` | low | 可 | 只动位置/布局 |
| `move_nodes` | low | 可 | 只动位置 |
| `focus_nodes` | low | 可 | 选中/聚焦 |
| `set_viewport` | low | 可 | 移动画布视野 |
| `create_group` | low | 可 | 分组 |
| `duplicate_nodes` | medium | 需预览 | 复制子图 |
| `queue_generation_task` | medium/high | 文本/图片可，视频强确认 | 生成任务 |
| `run_prompt_preset_generation` | medium/high | 文本/图片可，视频强确认 | 预设生成 |
| `create_workflow_template` | high | 不自动 | 模板强确认 |
| `set_project_preference` | medium | 需确认 | 项目偏好记忆 |
| `restore_asset_to_canvas` | medium | 需预览 | 恢复素材组 |

### 11.3 禁止动作

- delete_node / delete_edge 默认禁止，除非未来单独设计回收站和强确认。
- shell/file/browser/network/MCP 永久禁止。
- 直接写项目 JSON 禁止。
- 绕过 Huanying 生成队列禁止。
- 未授权视频生成禁止。

### 11.4 风险推断

| 条件 | 风险 |
|---|---|
| 只创建 comment/source-text/focus/layout | low |
| 创建 ai-text/ai-image 准备节点 | low/medium |
| 启动 ai-text/ai-image 生成 | medium，可自动但需可见回执 |
| 创建 ai-video 准备节点 | medium，默认不启动 |
| 启动 ai-video 生成 | high，强确认 |
| duplicate 选中子图 3-5 条 | medium |
| 模板保存/团队库 | high |
| 覆盖已有 prompt/result/model | medium/high |
| 删除/外部上传/批量扣费 | high |

---

## 12. 生成任务生命周期

### 12.1 状态机

```text
proposed
  -> validated
  -> queued
  -> waiting_renderer_mount
  -> running
  -> succeeded
  -> failed
  -> cancelled
  -> retrying
```

### 12.2 Generation Task 数据

```json
{
  "id": "gen_123",
  "conversationId": "conv_123",
  "transactionId": "txn_123",
  "actionId": "act_123",
  "nodeId": "node_img_1",
  "nodeType": "ai-image",
  "status": "queued",
  "prompt": "...",
  "model": "...",
  "provider": "...",
  "references": [],
  "requestedBy": "canvas_agent",
  "requiresConfirmation": false,
  "authorizedAt": null,
  "startedAt": null,
  "completedAt": null,
  "resultAssetIds": [],
  "error": null
}
```

### 12.3 文本/图片生成

- schema 通过后可自动进入 queued。
- executor 必须调用节点真实 `_onGenerate` 或统一 generation adapter。
- renderer 未 mount 时写 pending，不判失败。
- 结果写回节点和 task store。
- receipt 显示 started/queued/failed。

### 12.4 视频生成

- 创建 ai-video 准备节点不等于启动视频生成。
- 启动 ai-video 生成必须强确认。
- 即使 action 省略 nodeType，也必须从 current graph 或 same-batch created nodes 推断。
- executor 是最后一道防线；后端漏掉时前端也必须阻止。

### 12.5 预设生成

`run_prompt_preset_generation` 必须保持 Claw C49 的结论：

- 不把完整 preset template 写进节点输入框。
- 通过 hidden pending preset / local preset resolver 调用真实 `_onGenerate(template)`。
- action 可只携带 preset title/path/user alias，由本地解析。
- 找不到 preset 时给 friendly error，不生成空 prompt。

---

## 13. 高级创作能力规格

### 13.1 画布医生

触发：“检查画布”“哪里有问题”“帮我诊断”或 Doctor 模式。

诊断范围：

- 孤立节点。
- 断线或反向连线。
- prompt 缺失。
- 生成失败节点。
- 尺寸/比例不一致。
- 过度重叠。
- 节点命名混乱。
- 视频节点未授权但有生成动作。

输出：

- 3-8 条问题。
- severity：info/warning/error。
- 建议动作。
- 可选 comment/source-text 注释落画布。
- 可聚焦最严重 1-3 个问题节点。

禁止：自动生成、删除、覆盖 prompt。

### 13.2 自动整理

触发：“整理画布”“排整齐”“让链路清楚一点”。

| 策略 | 使用场景 |
|---|---|
| `single_chain` | source -> ai -> result 单链路 |
| `branch_flow` | 多变体分支 |
| `storyboard_grid` | 分镜/story_to_video |
| `asset_lane` | 素材/参考图整理 |
| `problem_lane` | 诊断问题区 |
| `workflow_columns` | 输入/处理/输出三列 |

动作：`layout_nodes`、`move_nodes`、`create_group`、`rename_node`、`focus_nodes`、`set_viewport`。

禁止：修改 prompt/model/assets/generation params。

### 13.3 一句话工作流

| workflowKind | 结构 |
|---|---|
| `text_to_image` | source-text -> ai-image |
| `image_to_video` | source-image -> ai-video |
| `text_to_image_video` | source-text -> ai-image -> ai-video |
| `image_variants` | source-image -> 多个 ai-image variant |
| `story_to_video` | story outline + style bible + shots |

metadata：

- workflowKind
- workflowGroupId
- workflowStep
- workflowReason

验收：

- 节点不堆叠。
- 连线方向正确。
- batch 可撤销。
- 文本/图片可生成。
- 视频只准备。
- receipt 说明付费边界。

### 13.4 story_to_video

结构：

```text
story_outline ai-text
style_bible ai-text
Shot 01
  shot_script ai-text
  shot_keyframe ai-image
  shot_video ai-video prep
Shot 02
  ...
```

metadata：

- storyDurationSec
- shotIndex
- shotDurationSec
- shotTitle
- shotPrompt
- shotVideoPrompt
- workflowStep

规则：

- 15 秒短片默认 3-5 镜头。
- 30 秒默认 5-8 镜头。
- 每个镜头有可生成图片 prompt。
- 视频节点只准备，除非明确强确认。

### 13.5 分镜导演

输入：脚本、想法、角色设定、参考图。  
输出：3-8 个 shot groups。

metadata：

- storyboardId
- shotIndex
- shotTitle
- shotVisual
- shotCamera
- shotStyle
- shotPrompt
- shotContinuity

交互：

- preview 显示镜头数、关键图数、视频准备节点数。
- 可点击某个镜头聚焦。
- 可要求“只改第 2 个镜头”。
- 角色一致性作为 warnings/notes 显示。

### 13.6 变体分支

触发：

- “做 3 个不同风格方向”
- “给选中图做 5 个变体”
- “复制这个方案，分别走写实/赛博/极简方向”

动作：

- duplicate selected subgraph。
- create_group per variant。
- create_node comment/source-text for variant difference。
- layout branch_flow。
- focus variants。

metadata：

- variantGroupId
- variantIndex
- variantTitle
- variantDifference
- variantSourceNodeIds
- variantRisk

规则：

- 默认不改原节点。
- 默认不生成扣费。
- 最多 5 条分支。
- 需要生成时，文本/图片可自动，视频强确认。

### 13.7 Prompt 手术台

能力：

- 局部改写 prompt。
- 提取关键词。
- 加强风格/镜头/光线。
- 保持原用户意图。

规则：

- 不整段替换，除非用户明确要求。
- preview 显示 diff。
- 支持撤销。
- 不把 preset template 暴露到输入框。

### 13.8 模板炼金术

阶段 1：强确认预览。

```json
{
  "type": "create_workflow_template",
  "name": "15 秒剧情短片模板",
  "nodeIds": [],
  "metadata": {
    "templateKind": "story_to_video",
    "parameters": []
  },
  "riskLevel": "high",
  "requiresConfirmation": true
}
```

阶段 2：真实保存。

模板数据：

- templateId
- name
- description
- scope：project/user/team
- author
- version
- tags
- nodes blueprint
- edges blueprint
- parameters
- default models
- required references
- permissions

阶段 3：复用。

- 从模板菜单创建。
- 对话中说“用上次那个短片模板”。
- 参数填写 wizard。
- 创建前 preview。

---

## 14. Conversation / History 数据设计

### 14.1 Conversation

```json
{
  "id": "conv_123",
  "projectId": "project_1",
  "title": "15 秒剧情短片",
  "summary": "用户正在制作一个电影感短片。",
  "assistantIntent": "story_short",
  "model": {},
  "createdAt": "2026-06-04T00:00:00Z",
  "updatedAt": "2026-06-04T00:10:00Z",
  "messages": [],
  "contextSnapshots": [],
  "transactions": [],
  "receipts": [],
  "generationTasks": [],
  "projectPreferencesUsed": {}
}
```

### 14.2 Message

```json
{
  "id": "msg_1",
  "role": "user",
  "content": "帮我做一个 15 秒短片",
  "status": "done",
  "attachments": [],
  "references": [],
  "createdAt": "..."
}
```

Assistant message：

```json
{
  "id": "msg_2",
  "role": "assistant",
  "content": "我会拆成 4 个镜头...",
  "status": "done_pending_actions",
  "traceId": "trace_1",
  "actions": [],
  "warnings": [],
  "usage": {}
}
```

### 14.3 Transaction

```json
{
  "id": "txn_123",
  "conversationId": "conv_123",
  "messageId": "msg_2",
  "status": "applied",
  "actionsOriginal": [],
  "actionsValidated": [],
  "riskSummary": {},
  "applyResult": {},
  "undoToken": "history_abc",
  "createdAt": "...",
  "appliedAt": "..."
}
```

### 14.4 Export

Markdown 导出必须脱敏，并包含：

- 会话标题。
- 消息。
- 关键 context summary。
- actions 摘要。
- receipts。
- generation tasks 状态。
- 不包含 secrets/path/blob/data URL。

---

## 15. 错误处理与诊断

### 15.1 错误分类

| code | 归属 | 用户文案 |
|---|---|---|
| `missing_model_config` | model | 请先配置 Agent 模型。 |
| `missing_runner` | runtime | Pi sidecar 缺失，请检查安装包。 |
| `pi_timeout` | sidecar | Agent 响应超时，可以重试。 |
| `pi_invalid_response` | sidecar | Agent 返回格式异常，未执行任何动作。 |
| `invalid_actions` | schema | 动作校验失败，画布没有被修改。 |
| `missing_node` | schema | 动作引用了不存在的节点。 |
| `unsafe_action` | schema | 该动作不允许由助手执行。 |
| `video_requires_confirmation` | policy | 视频生成需要明确确认。 |
| `renderer_not_ready` | executor | 节点正在挂载，生成任务已进入等待。 |
| `generation_failed` | generation | 生成失败，可重试或复制诊断。 |

### 15.2 Error UI

错误卡显示：

- 一句话原因。
- 建议下一步。
- 可复制诊断。
- traceId。
- 关联 action index。

不要把 Python exception、schema raw error、stack trace 作为主文案。

### 15.3 Fixture Candidate

每次 invalid_actions / unexpected executor failure 都应保存可回归候选：

```json
{
  "id": "fixture_candidate_...",
  "message": "...",
  "contextSummary": {},
  "actions": [],
  "schemaResponse": {},
  "owner": "schema|executor|ui|sidecar",
  "createdAt": "..."
}
```

---

## 16. 安全与隐私

### 16.1 永久禁止泄露

- API key / token / password / credential。
- Authorization header。
- Windows/macOS/Linux 绝对路径。
- data URL / blob URL。
- 完整项目 JSON。
- 本地文件内容。
- 上游 provider 原始错误中包含的 secret。

### 16.2 权限矩阵

| 能力 | Agent | Backend | Frontend Executor | User |
|---|---|---|---|---|
| 读画布摘要 | 可看 sanitized | 构建/脱敏 | 提供 adapter | 默认允许 |
| 改画布 | 提 proposal | 校验 | 执行 | 低风险可自动 |
| 文本生成 | 提 proposal | 校验 | 启动 | 可自动 |
| 图片生成 | 提 proposal | 校验 | 启动 | 可自动 |
| 视频生成 | 提 proposal | 强确认 | 未授权阻止 | 必须确认 |
| 文件读写 | 禁止 | 禁止 | 禁止 | 不开放 |
| shell | 禁止 | 禁止 | 禁止 | 不开放 |
| 模板保存 | 提 proposal | 强确认/权限 | 调 API | 必须确认 |

### 16.3 双重视频防线

1. Backend schema 从 explicit nodeType、data.nodeType、same-batch created nodes、current context 推断是否 ai-video。
2. Frontend executor 再从 graphStore 推断 target node type。
3. 任一层判断是 ai-video 且未授权，都不启动生成。

---

## 17. 回归与验收

### 17.1 单元测试矩阵

| 范围 | 测试 |
|---|---|
| Protocol | event normalize、final actions、invalid event |
| Streaming client | JSONL/SSE、abort、fallback、error |
| Pi runner | request normalize、tool action collect、safe response |
| Huanying tools | dangerous tool/action rejected |
| Bridge | timeout、invalid JSON、schema invalid、secret redaction |
| Route | chat/status/stream/conversations/actions validate |
| Context | redaction、budget、selection、attachments |
| Preview | grouping、risk、strong confirmation |
| Executor | create/connect/layout/focus/generation/video guard |
| Conversation | persist/search/export/redaction |
| Attachment | upload/local fallback/toContext |
| Model registry | configured/disabled/capability |
| Generation | pending/running/result/retry/cancel |
| Template | save/instantiate/version/permission |

### 17.2 Deterministic Fixture

至少七个 fixture：

1. `basic-create-connect-layout-focus`。
2. `invalid-delta-actions-do-not-execute`。
3. `generation-permission-gate`。
4. `history-restore-pending-actions`。
5. `story-to-video-structure`。
6. `variant-branches-no-original-overwrite`。
7. `template-strong-confirmation`。

### 17.3 Live Harness Artifact

每次 live run 输出：

```text
output/regression/canvas-agent-live/<timestamp>/
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

### 17.4 Scorecard

| 项 | 分值 |
|---|---:|
| 面板打开 | 5 |
| 模型配置正确且不泄密 | 5 |
| stream 正常 | 5 |
| final actions 合法 | 5 |
| preview 可理解 | 5 |
| 二次校验 | 5 |
| executor 应用正确 | 5 |
| receipt 完整 | 5 |
| 历史恢复 | 5 |
| 文本/图片生成权限 | 5 |
| 视频强确认 | 5 |
| 无 console/backend 泄密 | 5 |

任意未授权视频生成直接安全失败。

---

## 18. 发布与打包

### 18.1 必备文件

```text
integrations/pi_canvas_agent/package.json
integrations/pi_canvas_agent/package-lock.json
integrations/pi_canvas_agent/LICENSES.md
integrations/pi_canvas_agent/src/runner.ts
integrations/pi_canvas_agent/src/protocol.ts
integrations/pi_canvas_agent/src/huanyingTools.ts
integrations/pi_canvas_agent/dist/runner.js
```

### 18.2 Runtime 策略

优先级：

1. 发布包内置 Node 22+ runtime。
2. 发布包内置已构建 sidecar dist。
3. 开发者环境 fallback 到本机 Node。

禁止：

- 普通用户全局安装 Pi。
- 普通用户全局安装 Node。
- 运行时首次联网安装依赖。
- 缺 lockfile 仍宣称可发布。

### 18.3 Preflight

`tools/check_pi_canvas_agent_source_tree.py` 必须 blocking：

- 缺 source fail。
- 缺 dist fail。
- 缺 lockfile fail。
- 缺 license fail。
- runner 不可执行 fail。

---

## 19. 分阶段实施建议

### Phase 0：冻结与补证据

- 记录当前 Pi runner echo 状态。
- 固定当前 UI/API/backend 能力表。
- 补 source preflight 目标。
- 确认 git 不可靠时以文件级 verification 为准。

退出：文档和 baseline 完成。

### Phase 1：真实 Pi SDK Runner

- runner 接 Pi SDK。
- 注册唯一 Huanying proposal tool。
- 支持 conversationId session。
- 支持 final actions。
- 不启用文件/shell/browser。

退出：真实模型能返回安全 comment/focus/layout actions。

### Phase 2：真实 Streaming

- sidecar 输出 event JSONL。
- Python route 透传。
- 前端只认 final actions。
- stop/retry/cancel 完整。

退出：fixture 和真实模型 stream 都可用。

### Phase 3：交互补齐

- preview 卡片化。
- 强确认。
- @ resolver。
- 附件用途。
- 历史高级操作。
- context debug。

退出：用户能看懂并控制每次画布变更。

### Phase 4：生成生命周期

- text/image generation adapter。
- pending mount。
- result assets。
- retry/cancel。
- video double guard。

退出：文本/图片真实运行，视频不越权。

### Phase 5：高级技能迁移

- 画布医生。
- 自动整理。
- 一句话 workflow。
- story_to_video。
- 分镜导演。
- 变体分支。

退出：每个能力有 fixture、unit tests、live smoke。

### Phase 6：模板炼金术

- 模板保存。
- 参数化。
- 复用入口。
- 权限/版本。
- 团队治理。

退出：模板可真实复用，不只是 preview。

### Phase 7：发布与治理

- lockfile/license。
- bundled runtime。
- offline regression。
- live scorecard。
- release preflight。

退出：普通用户离线可用，开发失败可回归。

---

## 20. 踩坑合集与规避方案

### 20.1 不要复刻 Claw CLI 长 prompt 路线

历史坑：Windows 参数长度、prompt compaction、fenced JSON、模型输出外包 Markdown、别名不稳定。

规避：

- Pi 走 JSONL stdin/stdout。
- stream event 结构化。
- prompt budget 有优先级。
- parser 支持 fenced JSON 但不依赖它。

### 20.2 不要信任模型字段

历史坑：模型会输出 `action/actionType/operation`、`data.type`、`node_type`、省略 nodeType、未来 node ids、空 connect placeholders。

规避：

- schema 做 alias repair。
- same-batch action id mapping。
- context node type inference。
- 空 placeholder 可 warning 忽略，但危险动作 fail closed。

### 20.3 不要让 Agent 拿工具权限

历史坑：coding agent 默认能力容易越界。

规避：

- Pi 不注册 file/shell/browser/network/package/MCP。
- 只注册 proposal tool。
- 后端再过滤危险动作名。

### 20.4 不要把上传 chip 当引用闭环

历史坑：资产面板可见但 context count=0、blob/data/path 泄漏风险、模型不知道引用用途。

规避：

- 上传进入受控 asset store。
- context 只传 assetId/summary/usage。
- @ resolver 明确引用对象。
- hover preview 只走本地 UI。

### 20.5 不要把视频准备节点当视频生成

历史坑：模型会说“已生成视频”，但只是创建了 ai-video 节点；或者省略 nodeType 绕过授权。

规避：

- 文案区分“准备视频节点”和“启动视频生成”。
- schema + executor 双重推断 ai-video。
- scorecard 把未授权视频启动定为硬失败。

### 20.6 不要只做离线测试

历史坑：离线 schema 通过，真实模型输出仍会多空字段、别名、Markdown、超预算。

规避：

- 每个 live 失败保存 sample。
- sample 进入 scorecard 和 fixture。
- deterministic fixture 覆盖 UI，不依赖真实模型稳定性。

### 20.7 不要把模板 preview 说成已保存

历史坑：`create_workflow_template` 只是高风险预览，不是模板资产。

规避：

- preview 文案明确“准备创建模板”。
- 真实保存必须走 TemplateService。
- 保存后有 templateId/version/scope/author。

### 20.8 不要绕过最新 context 二次校验

历史坑：用户看到 preview 后画布变化，旧 action 仍被应用。

规避：

- apply 前重新 buildContext。
- validate 使用最新 node ids/edges/selection。
- stale action 给友好错误。

### 20.9 不要把错误原文甩给用户

历史坑：raw schema/Python 错误不可读，还可能泄露。

规避：

- friendlyMessage 主展示。
- diagnostics 可复制。
- raw 只进脱敏日志。

### 20.10 不要发布半个 sidecar

历史坑：source/runtime 缺失但功能文档写完成。

规避：

- source preflight blocking。
- lockfile/license 必备。
- status 明确 missing_runner。
- 普通用户无全局安装要求。

---

## 21. 行业老手的实现口径

如果由有 AI 创作工具、节点画布、生成任务系统经验的团队来做，他们不会把重点放在“让模型多聪明”上，而会先把以下产品地基做扎实：

1. 状态分层：聊天状态、动作事务状态、生成任务状态、画布状态、历史状态必须分离。
2. 动作是交易，不是按钮：一次 Agent 回复产生 transaction，有 validate、apply、receipt、undo、export。
3. 引用是资产，不是 URL：任何参考图/视频/文档先资产化，再进入 context。
4. 生成是队列，不是函数调用：要有任务 ID、状态机、结果、失败、重试、取消。
5. 风险是本地推断，不是模型声明：模型无法降低本地风险，只能提高风险。
6. 历史是上下文资产：保存的不只是消息，还包括 context snapshot、actions、receipts、生成结果。
7. 高级能力先结构后生成：先创建 workflow/storyboard/variant 结构，再按权限启动生成。
8. 每个失败都变成资产：失败样例进入 fixture、scorecard、回归清单。
9. 发布必须离线确定：sidecar、runtime、source、license、lockfile 都由 preflight 守住。
10. UI 要讲人话：用户不需要看 schema error，需要知道“为什么没执行、怎么修、下一步点哪里”。

---

## 22. 最终验收清单

### 22.1 P0 验收

- [ ] Pi runner 真实调用模型，不再 echo。
- [ ] 只注册 Huanying proposal tool。
- [ ] stream 事件真实来自 sidecar。
- [ ] delta actions 不执行。
- [ ] final actions 经过 backend schema。
- [ ] shell/file/browser/MCP action 被拒绝。
- [ ] status/model 不泄密。
- [ ] source preflight blocking。

### 22.2 P1 验收

- [ ] action preview 分组卡片可读。
- [ ] 强确认可阻止视频。
- [ ] @ resolver 可引用节点/素材/附件。
- [ ] 附件用途进入 context。
- [ ] 历史可搜索/恢复/导出。
- [ ] 文本/图片生成有 queued/running/result。
- [ ] 错误有 friendlyMessage 和 diagnostics。

### 22.3 P2 验收

- [ ] 画布医生输出 3-8 条问题并可落注释。
- [ ] 自动整理只改布局/分组/聚焦。
- [ ] 文生图生视频 workflow 正确创建。
- [ ] story_to_video 结构完整。
- [ ] 分镜导演生成 3-8 shot groups。
- [ ] 变体分支不覆盖原节点。
- [ ] 视频生成不越权。

### 22.4 P3 验收

- [ ] 模板可保存为真实资产。
- [ ] 模板可复用并参数化。
- [ ] 有权限、版本、作者、标签。
- [ ] bundled runtime 可用。
- [ ] lockfile/license/source preflight 通过。
- [ ] live scorecard 和 artifact 完整。

---

## 23. 推荐下一步

最建议立即执行的不是继续扩 UI，而是：

1. 改造 `integrations/pi_canvas_agent/src/runner.ts`，接入真实 Pi SDK 和唯一 Huanying proposal tool。
2. 建立 sidecar streaming JSONL event 协议。
3. 用 deterministic fixture 跑通：open panel -> stream -> preview -> validate -> apply -> receipt -> history。
4. 再补 @ 引用、preview 卡片和生成生命周期。
5. 最后迁移 Claw 高级技能和模板治理。

只有当第 1 步完成，当前 Pi 面板才从“壳”变成真正的 Canvas Agent。
