# Huanying Canvas Agent R1-R4 专业产品需求文档

版本：v1.0  
日期：2026-06-03  
范围：R1 流式真实 Agent 对话闭环、R2 Canvas Action 执行闭环、R3 Conversation 前后端同步、R4 统一 API Key / Model 配置  
项目路径：`D:\Aic\huanying-source-windows-20260430-122116`

---

## 1. 文档定位

本文档是 Huanying Canvas Agent 下一轮 P0 需求的产品规格说明，不是单纯功能清单。它面向产品、前端、后端、Agent/Sidecar、QA 和发布负责人，目标是把“右下角画布助手”从可展示的 UI 基线推进到真实可用的生产闭环。

本轮只覆盖 R1-R4，刻意不把画布医生、story_to_video、分镜导演、变体分支等能力塞进同一轮开发。那些能力属于 R1-R4 之上的业务技能层；如果底层闭环没有做好，高级能力会变成不可控的 prompt demo。

### 1.1 本轮目标

让用户可以在 Huanying 画布右下角助手面板里完成以下闭环：

1. 选择已配置的 Agent 模型。
2. 输入自然语言需求。
3. 看到流式回复。
4. Agent 产出结构化画布 actions。
5. UI 以预览卡片展示影响范围和风险。
6. 用户确认后，actions 被 Huanying 本地 executor 执行。
7. 画布真实变化，助手返回回执。
8. 对话、actions、回执被保存到历史会话。

### 1.2 本轮非目标

- 不让 Pi 或任何 Agent 直接执行文件、shell 或 Huanying 内部命令。
- 不让中间 streaming delta 触发画布动作。
- 不在本轮实现完整 story_to_video，只保留 action contract 支撑未来扩展。
- 不改 obfuscated/minified `main.js`。
- 不把助手核心逻辑绑死在 Huanying UI 内部，应通过 adapter 保持解耦。

---

## 2. 当前项目基线与真实约束

根据 CodeGraph 当前结构，R1-R4 的核心落点如下：

| 层级 | 当前关键模块 | 产品职责 |
|---|---|---|
| 前端面板 | `modules/app/appAssistantPanel.js` | 右下角助手 UI、输入区、流式展示、预览、确认、回执、历史入口 |
| 前端 autoload | `modules/app/appAssistantPanel.autoload.js` | 把助手挂载到 Huanying 页面，接入 graphStore/workspaceStore/API 配置 |
| 前端 API | `api/canvasAgentApi.js` | 封装 `/api/v2/canvas-agent/*` 请求、NDJSON stream、actions validate |
| Assistant Core | `modules/assistant/assistantActionExecutor.js` | 本地执行 create/connect/layout/focus/generation 等 canvas actions |
| Assistant Core | `modules/assistant/assistantActionPreview.js` | actions 摘要、预览、回执文案 |
| Assistant Core | `modules/assistant/assistantContextBuilder.js` | 从画布/选区/workspace 构建上下文 |
| 后端路由 | `services/canvas_agent_route_service.py` | chat/chat stream/actions validate/context/conversations/status 路由入口 |
| 后端桥接 | `services/pi_bridge_service.py` | JSONL 调用 Pi sidecar，清洗 response，校验 actions，脱敏 warnings |
| 后端 schema | `services/canvas_agent_action_schema.py` | CanvasActionSchema 校验和兼容 ClawActionSchema 历史经验 |
| Pi sidecar | `integrations/pi_canvas_agent/src/huanyingTools.ts` | 只注册 propose-actions 工具，不执行真实动作 |

### 2.1 关键设计原则

1. **Agent 只能提出方案，Huanying 决定是否执行。** 这条是安全边界，也是解耦边界。
2. **只信任 final frame。** `message.delta` 只用于 UI 展示，`message.done` 才允许携带 actions。
3. **所有 actions 先过本地 schema。** 即使 Agent 声称“安全”，也必须经过 `CanvasAgentActionSchema`。
4. **高风险必须强确认。** 特别是视频生成、批量节点变更、覆盖已有内容、删除类动作。
5. **会话是事务日志。** 用户消息、Agent 回复、actions、确认、执行结果、错误都要能回溯。
6. **Key 不出现在 UI、日志、会话导出、trace。** 模型配置只能引用，不泄露。
7. **助手和 Huanying 解耦。** Assistant Core 面向 graphStore adapter，而不是直接依赖具体画布内部实现。

---

## 3. 总体用户旅程

### 3.1 标准路径

1. 用户点击右下角助手 icon。
2. 面板打开，默认选中当前可用 Agent 模型。
3. 面板读取当前画布上下文：选区、节点摘要、连接关系、workspace 信息。
4. 用户输入：“创建一个图片生成节点，连接到当前提示词节点，并整理布局。”
5. UI 进入 streaming 状态，显示 Agent 正在思考和增量回复。
6. Agent final frame 返回：reply、actions、warnings、requiresConfirmation、traceId。
7. UI 展示 actions preview card：将创建几个节点、连接几条边、是否会触发生成、风险等级。
8. 用户点击“应用到画布”。
9. 前端调用 actions validate，后端 schema 返回规范化 actions。
10. 前端 executor 使用 graphStore adapter 执行动作。
11. UI 显示回执：成功创建节点、连接边、聚焦变更区域。
12. 会话历史保存本轮消息、actions、执行结果。

### 3.2 异常路径

| 场景 | 用户看到 | 系统行为 |
|---|---|---|
| 未配置模型/key | 模型不可用，提示去 API 设置 | 禁止发送真实请求 |
| stream 中断 | 当前回复变为失败卡片，可重试 | 保留用户输入和 traceId |
| Agent 返回非法 actions | 展示“动作校验失败” | 不执行，记录 scorecard candidate |
| 高风险 actions | 按钮显示强确认文案 | 未强确认前不可执行 |
| 执行部分失败 | 回执显示成功/失败明细 | 保留失败 action，可复制诊断信息 |
| 刷新页面 | 历史会话仍可恢复 | 从后端 conversations 读取 |

---

## 4. 模块-功能总览

| 模块 | 功能 | R1 | R2 | R3 | R4 |
|---|---|---:|---:|---:|---:|
| Assistant Panel | 打开/关闭、输入、stream 展示、停止、重试 | 是 | 部分 | 是 | 是 |
| Stream Client | NDJSON 解析、状态机、取消、错误归一 | 是 | 否 | 部分 | 部分 |
| Action Preview | 动作分组、风险、影响范围、确认 CTA | 否 | 是 | 是 | 否 |
| Action Executor | create/connect/update/layout/focus 执行 | 否 | 是 | 是 | 否 |
| Conversation Store | 新建、恢复、搜索、删除、导出 | 部分 | 是 | 是 | 部分 |
| Model Registry | 模型列表、能力标签、配置状态 | 是 | 否 | 部分 | 是 |
| Canvas Agent API | chat stream、validate、conversations、status | 是 | 是 | 是 | 是 |
| Route Service | HTTP 路由、provider 配置、schema 校验 | 是 | 是 | 是 | 是 |
| Pi Bridge | JSONL 请求、response 清洗、warnings 脱敏 | 是 | 是 | 部分 | 是 |
| Context Builder | 画布上下文、选区、附件、assistantIntent | 是 | 是 | 是 | 部分 |

---

## 5. R1：流式真实 Agent 对话闭环

### 5.1 产品目标

用户在助手面板输入自然语言后，不再等待一个静态假结果，而是能看到真实 Agent 的流式回复；在回复结束时，系统拿到稳定、可验证的 final payload，为后续 actions preview 和执行做准备。

### 5.2 模块与职责

| 模块 | 职责 |
|---|---|
| `appAssistantPanel.js` | 管理输入、发送、stream 状态、停止、重试、显示 delta 和 final reply |
| `api/canvasAgentApi.js` | 发起 `POST /api/v2/canvas-agent/chat/stream`，解析 NDJSON frame |
| `assistantContextBuilder.js` | 构建 message context，包括画布摘要、选区、附件引用、assistantIntent |
| `canvas_agent_route_service.py` | 校验请求、调用 bridge、包装 NDJSON stream 响应 |
| `pi_bridge_service.py` | 通过 JSONL 发送 `{message, context, conversationId, mode}`，清洗 Agent 输出 |
| Pi sidecar | 生成 reply/actions/warnings/requiresConfirmation，不直接执行工具 |

### 5.3 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R1-F1 | 发送消息 | 支持 Enter 发送、Shift+Enter 换行；空消息不可发送 | P0 |
| R1-F2 | 上下文注入 | 请求包含当前 conversationId、selectedModel、assistantIntent、canvas context | P0 |
| R1-F3 | 流式展示 | `message.delta` 到达时逐步追加到当前 assistant bubble | P0 |
| R1-F4 | final 归并 | `message.done` 到达后设置 final reply/actions/warnings/requiresConfirmation | P0 |
| R1-F5 | 停止生成 | streaming 中显示 stop，点击后 abort 请求，保留已收到文本 | P0 |
| R1-F6 | 重试 | 失败消息支持 retry，复用同一 user message 和最新 context | P0 |
| R1-F7 | 错误归一 | network/timeout/invalid-frame/backend-error 转为用户可读失败卡 | P0 |
| R1-F8 | trace 可见 | debug 区或复制诊断里包含 traceId/messageId/conversationId | P1 |

### 5.4 Stream 协议

#### 5.4.1 Request

```json
{
  "message": "创建一个图片生成节点并连接到当前提示词节点",
  "conversationId": "conv_20260603_xxx",
  "mode": "actions",
  "model": {
    "provider": "pi_canvas_agent",
    "modelId": "configured-agent-model"
  },
  "assistantIntent": {
    "id": "canvas_create",
    "title": "创建画布节点",
    "source": "quick_intent"
  },
  "context": {
    "workspace": {},
    "canvas": {},
    "selection": {},
    "attachments": []
  }
}
```

#### 5.4.2 Response Frames

```json
{"type":"message.start","conversationId":"conv_x","messageId":"msg_x","traceId":"trace_x"}
{"type":"message.delta","delta":"我会先创建图片生成节点...","conversationId":"conv_x","messageId":"msg_x","traceId":"trace_x"}
{"type":"warning","message":"当前没有选中节点，将使用默认位置。"}
{"type":"message.done","reply":"已准备好画布更新方案。","actions":[],"warnings":[],"requiresConfirmation":true,"conversationId":"conv_x","messageId":"msg_x","traceId":"trace_x"}
```

### 5.5 前端状态机

| 状态 | 说明 | 可用操作 | 退出条件 |
|---|---|---|---|
| `idle` | 无请求 | 输入、发送、打开历史、切模型 | 点击发送 |
| `preparing` | 构建 context | 取消 | context 完成 |
| `streaming` | 正在接收 delta | 停止 | done/error/abort |
| `done_no_actions` | 回复结束，无 actions | 重试、继续对话 | 新消息 |
| `done_pending_actions` | 回复结束，有待确认 actions | 预览、应用、取消、继续问 | 应用/取消 |
| `applying` | 正在校验并执行 actions | 禁止重复点击 | receipt/error |
| `error` | 请求失败 | 重试、复制诊断 | 重试/新消息 |
| `cancelled` | 用户停止 | 重试、继续对话 | 新消息 |

### 5.6 交互说明

- 输入框发送后立即把 user message 固定到会话区，避免 stream 失败时用户内容丢失。
- Assistant bubble 先显示“正在理解画布...”，收到 delta 后替换为真实流式内容。
- Stop 按钮只中断请求，不删除已收到内容。
- 如果 final frame 没有 actions，则显示普通助手回复，不出现 preview card。
- 如果 final frame 有 actions，则在 assistant bubble 下方展示“待应用到画布”的 action preview。
- warnings 不应打断主流程，除非 warning 对应安全风险。

### 5.7 验收标准

- 在真实页面中输入一条消息，能看到至少一次 streaming delta 或 streaming 状态过渡。
- final payload 能稳定落到 state，actions 不从 delta 读取。
- 中途停止不会执行任何 actions。
- 网络失败、非法 NDJSON、backend 503 都有可读错误。
- live screenshot 覆盖：发送中、streaming、done with actions、error/retry。

---

## 6. R2：Canvas Action 执行闭环

### 6.1 产品目标

Agent 输出的画布意图必须从“文本建议”升级为“可预览、可确认、可执行、可回滚认知”的 actions 闭环。用户始终知道将发生什么，Huanying 始终掌握最终执行权。

### 6.2 模块与职责

| 模块 | 职责 |
|---|---|
| `CanvasAgentActionSchema` | 校验 action 类型、字段、风险、兼容历史 Claw schema |
| `assistantActionPreview.js` | 将 actions 转为人可读预览、分组、风险摘要 |
| `assistantActionExecutor.js` | 通过 graphStore adapter 执行已校验 actions |
| `appAssistantPanel.js` | 展示 preview、强确认、执行进度、receipt |
| `canvasAgentApi.js` | 调用 `/actions/validate`，不在前端裸信 Agent 输出 |
| `canvas_agent_route_service.py` | 暴露 validate route，返回规范化 actions 和 warnings |
| graphStore adapter | 把 assistant action 映射为 Huanying 节点/边/布局/选区操作 |

### 6.3 P0 Action Contract

| Action Type | 说明 | 风险 | P0 支持 |
|---|---|---|---|
| `create_node` | 创建画布节点 | low/medium | 是 |
| `connect_nodes` | 创建边/连线 | low | 是 |
| `update_node` | 更新节点名称、prompt、data 部分字段 | medium | 是 |
| `layout_nodes` | 整理节点位置 | low/medium | 是 |
| `focus_nodes` | 选中并聚焦节点 | low | 是 |
| `start_generation` | 启动文本/图片生成 | medium/high | P0 仅低风险自动；视频强确认 |
| `delete_node` | 删除节点 | high | 本轮不默认开放 |
| `run_shell` | 执行 shell | forbidden | 永久禁止 |
| `write_file` | 写本地文件 | forbidden | 永久禁止 |

### 6.4 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R2-F1 | Action envelope | 每个 action 带 type、id、source、metadata、risk、reason | P0 |
| R2-F2 | Schema 校验 | 所有 actions 执行前必须调用后端 validate | P0 |
| R2-F3 | Preview card | 展示动作数量、类型分组、影响节点、风险等级 | P0 |
| R2-F4 | 强确认 | high risk 或 video generation 必须二次确认 | P0 |
| R2-F5 | 执行锁 | applying 中禁止重复点击，避免重复创建节点 | P0 |
| R2-F6 | 执行回执 | 显示 appliedCount、createdNodeIds、createdEdgeIds、warnings | P0 |
| R2-F7 | 聚焦变更 | 执行成功后提供“聚焦新节点/变更节点” | P0 |
| R2-F8 | 失败保留 | 校验失败或部分执行失败时保留 preview 和诊断信息 | P0 |
| R2-F9 | Scorecard candidate | 每个 live 失败可转为 schema/executor 回归用例 | P1 |

### 6.5 Preview Card 交互

Preview card 应按“用户可理解的影响”组织，而不是按 JSON 顺序展示。

#### 卡片信息结构

1. 标题：`准备应用 5 个画布动作`
2. 风险 badge：`低风险` / `需要确认` / `强确认`
3. 摘要：
   - 创建 2 个节点
   - 连接 1 条边
   - 整理 3 个节点布局
   - 聚焦新增节点
4. 分组明细：
   - 节点创建
   - 连线
   - 内容更新
   - 布局与视图
   - 生成任务
5. warnings：例如“未选中节点，将使用默认位置”。
6. CTA：
   - `应用到画布`
   - `取消`
   - `查看 JSON`
   - 高风险时增加 `我确认执行高风险动作`

### 6.6 确认策略

| 条件 | 确认策略 |
|---|---|
| 仅 create/connect/focus，数量较少 | 单次确认或低风险自动应用开关 |
| update existing node | 普通确认 |
| layout 大量节点 | 普通确认，说明影响范围 |
| start text/image generation | 可配置为自动执行或普通确认 |
| start video generation | 强确认 |
| delete/overwrite/bulk destructive | 强确认；本轮默认不开放 |
| forbidden action | 直接拒绝，不展示应用按钮 |

### 6.7 执行事务语义

R2 不强制实现数据库级 rollback，但必须实现“认知上的事务完整性”：

- 每批 actions 有 batchId。
- validate 前记录 proposed actions。
- validate 后记录 normalized actions。
- executor 返回 applied/failed/warnings。
- conversation receipt 保存执行结果。
- UI 能告诉用户哪些已成功、哪些失败。

### 6.8 验收标准

- Agent 返回 create/connect/layout/focus actions 后，UI 能展示 preview card。
- 点击应用后先 validate，再 executor。
- 校验失败时画布不变。
- 高风险 actions 未确认时无法执行。
- 执行成功后画布真实出现节点/边，且回执显示影响范围。
- 重复点击不会重复执行同一批 actions。

---

## 7. R3：Conversation 前后端同步

### 7.1 产品目标

助手不是一次性 chat widget，而是画布创作过程中的协作记录。用户需要能恢复历史、理解某次画布变化从何而来、继续上一次上下文，并在出现问题时把会话作为诊断证据。

### 7.2 模块与职责

| 模块 | 职责 |
|---|---|
| Assistant Panel History UI | 历史抽屉、搜索、恢复、删除、重命名、导出入口 |
| Frontend Conversation Store | 乐观更新、缓存、离线兜底、当前会话状态 |
| Canvas Agent API | 封装 conversations CRUD/search/export |
| Backend Conversation Service | 持久化会话、消息、actions、receipts、metadata |
| Route Service | GET/POST/PATCH/DELETE `/api/v2/canvas-agent/conversations*` |
| Context Builder | 恢复会话时保留 workspace/canvas 关联，不盲目复用过期 selection |

### 7.3 会话数据模型

```json
{
  "id": "conv_20260603_abc",
  "title": "图片节点工作流整理",
  "createdAt": "2026-06-03T10:00:00+08:00",
  "updatedAt": "2026-06-03T10:05:00+08:00",
  "workspaceId": "workspace_x",
  "canvasId": "canvas_x",
  "model": {
    "provider": "pi_canvas_agent",
    "modelId": "configured-agent-model",
    "displayName": "Agent 高质量模型"
  },
  "messages": [
    {
      "id": "msg_user_1",
      "role": "user",
      "content": "创建一个图片生成节点",
      "createdAt": "2026-06-03T10:01:00+08:00",
      "attachments": []
    },
    {
      "id": "msg_agent_1",
      "role": "assistant",
      "content": "已准备画布更新方案。",
      "createdAt": "2026-06-03T10:01:05+08:00",
      "actions": [],
      "warnings": [],
      "traceId": "trace_x"
    }
  ],
  "receipts": [
    {
      "id": "receipt_1",
      "actionBatchId": "batch_1",
      "success": true,
      "summary": "Applied 3 canvas actions.",
      "createdAt": "2026-06-03T10:01:10+08:00"
    }
  ]
}
```

### 7.4 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R3-F1 | 创建会话 | 第一次发送消息前自动创建 conversationId | P0 |
| R3-F2 | 自动命名 | 根据第一条 user message 或 Agent intent 生成标题 | P0 |
| R3-F3 | 会话列表 | 历史抽屉展示最近会话、更新时间、摘要 | P0 |
| R3-F4 | 搜索 | 按标题、消息正文、intent、模型搜索 | P0 |
| R3-F5 | 恢复 | 点击历史恢复 messages、pending actions、receipts | P0 |
| R3-F6 | 删除 | 删除前确认；删除当前会话后自动新建空会话 | P0 |
| R3-F7 | 重命名 | 支持 inline rename 或菜单 rename | P1 |
| R3-F8 | 导出 | 导出 markdown/json，自动脱敏 key 和内部 secret | P1 |
| R3-F9 | 会话归属 | 记录 workspaceId/canvasId，避免跨画布误恢复 | P0 |
| R3-F10 | 同步失败兜底 | 后端失败时前端保留 local draft，并提示未同步 | P0 |

### 7.5 API 设计

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v2/canvas-agent/conversations` | 列表，支持分页和 query |
| `POST` | `/api/v2/canvas-agent/conversations` | 创建会话 |
| `GET` | `/api/v2/canvas-agent/conversations/{id}` | 获取详情 |
| `PATCH` | `/api/v2/canvas-agent/conversations/{id}` | 重命名、更新 metadata |
| `DELETE` | `/api/v2/canvas-agent/conversations/{id}` | 删除 |
| `POST` | `/api/v2/canvas-agent/conversations/{id}/messages` | 追加消息 |
| `POST` | `/api/v2/canvas-agent/conversations/{id}/receipts` | 追加执行回执 |
| `GET` | `/api/v2/canvas-agent/conversations/{id}/export` | 导出 |

如果当前后端已采用合并式 route，也可以保持现有路由形态，但产品语义必须覆盖上述能力。

### 7.6 历史抽屉交互

- 点击 header 历史 icon 打开抽屉。
- 默认按更新时间倒序展示。
- 搜索框即时过滤；后端搜索慢时先本地过滤已有列表，再显示 loading。
- 当前会话显示 active 标记。
- 删除会话必须二次确认，尤其是当前会话。
- 恢复历史时，不自动执行历史 pending actions，只显示当时的预览和状态。
- 如果历史会话所属 canvas 与当前 canvas 不一致，显示提示：“这是另一个画布的助手记录，继续恢复只恢复对话，不自动应用动作。”

### 7.7 同步策略

| 操作 | 前端策略 | 后端策略 |
|---|---|---|
| 用户发送消息 | 乐观加入当前会话 | 写入 message，返回 server id |
| stream delta | 前端临时展示 | 不必每个 delta 持久化，可最终落 message |
| message.done | 更新 assistant message | 保存 reply/actions/warnings/trace |
| actions applied | 添加 receipt | 保存 batch result |
| rename/delete | UI 乐观更新 | 失败则回滚并提示 |

### 7.8 验收标准

- 刷新页面后，历史会话仍可恢复。
- 删除/重命名能同步后端；失败时 UI 明确提示。
- 执行 actions 后，回执进入当前会话。
- 导出内容不包含 API key。
- 恢复历史 pending actions 不会自动执行。

---

## 8. R4：统一 API Key / Model 配置

### 8.1 产品目标

assistantIntent 的 key 和模型配置必须纳入 Huanying 现有 API key 管理体系。用户不应在助手里单独维护一套 secret；助手面板只选择“模型能力”，不直接处理密钥。

### 8.2 模块与职责

| 模块 | 职责 |
|---|---|
| Huanying API Key 设置 | 统一保存 provider endpoint/key/model 默认值 |
| `appAssistantPanel.autoload.js` | 从统一配置快照构建助手可用模型列表 |
| Assistant Model Registry | 展示 provider/model/capabilities/configured 状态 |
| `canvasAgentApi.js` | 请求中传 model/provider 引用，不传 secret |
| `canvas_agent_route_service.py` | 根据 provider 读取后端配置，返回脱敏 status |
| `pi_bridge_service.py` | 调用 sidecar 时使用 provider config getter，warnings/error 脱敏 |
| Pi sidecar | 接收 endpoint/model/key 环境或安全注入，不在 stdout 泄露 |

### 8.3 功能需求

| 编号 | 功能 | 需求点 | 优先级 |
|---|---|---|---|
| R4-F1 | 配置统一 | 使用 Huanying 现有 API key 配置，不新增孤立 secret store | P0 |
| R4-F2 | Provider 支持 | 支持 `canvas_agent` / `pi_canvas_agent` provider summary | P0 |
| R4-F3 | 模型选择 | 面板模型下拉展示名称、provider、能力标签、配置状态 | P0 |
| R4-F4 | 禁用未配置项 | 未配置 key/endpoint 的模型不可发送请求 | P0 |
| R4-F5 | 设置跳转 | 未配置时提供“去配置 API Key”入口 | P0 |
| R4-F6 | 默认模型 | 根据统一配置选择默认 Agent 模型 | P0 |
| R4-F7 | Secret 脱敏 | UI、status、日志、会话导出不出现完整 key | P0 |
| R4-F8 | 模型能力 | 标记 text、vision、action_planning、low_latency、high_quality | P1 |
| R4-F9 | 每会话模型记录 | 会话记录 modelId/displayName/provider，但不记录 key | P0 |

### 8.4 配置模型

```json
{
  "providers": {
    "pi_canvas_agent": {
      "configured": true,
      "endpoint": "https://example.endpoint/v1",
      "apiKeyRef": "secret_ref_pi_canvas_agent",
      "defaultModel": "agent-high-quality",
      "displayName": "Pi Canvas Agent"
    }
  },
  "models": [
    {
      "id": "agent-high-quality",
      "provider": "pi_canvas_agent",
      "displayName": "Agent 高质量",
      "configured": true,
      "capabilities": ["text", "vision", "action_planning", "high_quality"]
    }
  ]
}
```

注意：`apiKeyRef` 是产品语义。前端不应拿到真实 key；如果现有 Huanying 配置体系暂时只能前端读取 key，也必须在助手日志、status、conversation export 中脱敏，并逐步迁移到后端安全读取。

### 8.5 模型选择器交互

- 默认显示当前模型 displayName，例如“Agent 高质量”。
- 下拉按 provider 分组。
- 每个模型显示能力标签：`文本`、`视觉`、`动作规划`、`高质量`、`低延迟`。
- 未配置模型置灰，副文案显示“缺少 API Key”或“缺少 Endpoint”。
- 点击未配置模型不切换，而是提示去设置。
- 成功切换模型后，只影响下一条消息，不修改已发送消息。
- 会话恢复时显示历史消息使用的模型；当前新消息使用当前选择模型。

### 8.6 Backend Status 脱敏

`GET /api/v2/canvas-agent/status` 应返回可展示的 provider 状态：

```json
{
  "success": true,
  "providers": [
    {
      "id": "pi_canvas_agent",
      "configured": true,
      "endpoint": "https://right.codes/.../v1",
      "apiKey": "configured",
      "defaultModel": "agent-high-quality"
    }
  ]
}
```

不得返回完整 key。endpoint 可按策略只显示 host 或部分路径。

### 8.7 验收标准

- 助手能从统一 API 配置读取默认 provider/model。
- 未配置 key 时发送按钮禁用或发送前阻断，并给出明确设置入口。
- 请求 payload 不包含真实 API key。
- 后端错误、warnings、status、会话导出均不包含完整 key。
- 切换模型后，下一次 stream 使用新的 model/provider。

---

## 9. 跨 R1-R4 的交互细节

### 9.1 Composer 输入区

- Placeholder 根据当前上下文变化：
  - 无选区：“描述你想在画布上创建什么...”
  - 有选区：“可以让助手修改或连接当前选中的节点...”
  - 未配置模型：“请先配置 Agent 模型后再发送。”
- 发送按钮状态：
  - 空输入 disabled。
  - streaming 中变为 stop。
  - applying 中 disabled。
  - 未配置模型 disabled。

### 9.2 消息气泡

| 类型 | 展示 |
|---|---|
| User | 文本、附件 chip、时间、使用的 context 摘要入口 |
| Assistant streaming | 打字状态、delta 文本、stop 操作 |
| Assistant final | 完整 reply、warnings、actions preview |
| System receipt | 执行结果、受影响节点、聚焦按钮 |
| Error | 错误原因、retry、复制诊断 |

### 9.3 Preview 与 Receipt 的关系

- Preview 是“即将做什么”。
- Receipt 是“已经做了什么”。
- Preview 可以取消；Receipt 不能取消，只能作为日志。
- 同一 batch 的 preview 和 receipt 通过 actionBatchId 关联。

### 9.4 继续对话

用户可以在 pending actions 未应用时继续追问，但系统必须明确当前有未处理动作：

- 推荐 UI：在输入区上方显示 mini pending bar。
- 行为：继续追问时将 pending actions 作为 context 的 `pendingActionSummary`，但不自动执行。

---

## 10. 安全与风控要求

### 10.1 禁止项

| 禁止项 | 说明 |
|---|---|
| Agent 直接执行 shell | 即使模型要求也拒绝 |
| Agent 直接写文件 | 只允许 propose actions |
| delta 帧执行 actions | 只允许 final done 携带 actions |
| UI 泄露 API key | 包括错误、导出、截图、console |
| 历史恢复自动执行 actions | 用户必须重新确认 |

### 10.2 风险分级

| 风险 | 例子 | 策略 |
|---|---|---|
| Low | focus、少量 connect、创建注释节点 | 可普通确认，未来可自动 |
| Medium | update node prompt、layout 多节点、创建生成节点 | 普通确认 |
| High | 视频生成、覆盖内容、批量变更 | 强确认 |
| Forbidden | shell、file、外部系统执行 | 拒绝 |

---

## 11. 可观测性与诊断

每次请求必须贯穿以下 id：

- conversationId
- userMessageId
- assistantMessageId
- actionBatchId
- traceId
- modelId/provider

### 11.1 用户可见诊断

错误卡片提供“复制诊断”，包含：

- 错误类型
- traceId
- conversationId
- route
- provider
- modelId
- action count
- validation summary

不得包含 API key、完整 Authorization header、secret env。

### 11.2 QA 回归沉淀

每个 live failure 应归类为：

| 类型 | 回归归属 |
|---|---|
| stream 协议失败 | `canvasAgentApi` / route service 测试 |
| action schema 失败 | `canvas_agent_action_schema` fixtures |
| executor 失败 | `assistantActionExecutor` 测试 |
| UI 状态失败 | `appAssistantPanel` 测试 |
| 真实页面失败 | live screenshot check |

---

## 12. 性能与体验指标

| 指标 | 目标 |
|---|---|
| 面板打开响应 | < 200ms |
| 点击发送到出现 streaming 状态 | < 300ms，本地状态立即反馈 |
| 首个 delta | 真实服务下尽量 < 3s，超时显示仍在等待 |
| action preview 渲染 | < 100ms |
| apply actions 防重复 | 100% 防重复 batch |
| 历史列表首屏 | < 500ms 或 skeleton |
| secret 泄露 | 0 容忍 |

---

## 13. 测试验收矩阵

| 需求 | 单测 | 集成 | Live Screenshot |
|---|---|---|---|
| R1 stream start/delta/done | `canvasAgentApi`、panel state | route stream fake bridge | streaming UI 截图 |
| R1 stop/retry/error | panel state | abort/failure mock | error card 截图 |
| R2 validate before execute | panel state、schema | API validate + executor | preview/apply/receipt 截图 |
| R2 high risk confirmation | confirmation policy | video action fake | strong confirm 截图 |
| R3 history CRUD | conversation store | backend conversations | history drawer 截图 |
| R3 restore no auto execute | panel state | restore pending action | restored pending 截图 |
| R4 model configured/disabled | model registry | status + autoload | model dropdown 截图 |
| R4 secret redaction | backend tests | export/status tests | 不在截图/日志出现 key |

---

## 14. 分阶段交付建议

### Sprint A：R1 Stream 闭环

- 完成 stream client 状态机。
- 完成真实 `/chat/stream` UI 接入。
- 完成 stop/retry/error。
- 截图验证 open panel、streaming、done、error。

### Sprint B：R2 Actions 闭环

- 固定 P0 action schema。
- 完成 preview card 分组和风险。
- 完成 validate-before-execute。
- 完成 receipt 和 focus changed nodes。

### Sprint C：R3 Conversations 同步

- 完成后端 conversations CRUD。
- 前端历史抽屉接后端。
- 完成恢复、删除、搜索、当前会话事务日志。

### Sprint D：R4 Config/Model

- 从统一 API key 配置生成 assistant model registry。
- 完成未配置阻断、设置入口、provider status 脱敏。
- 完成每会话 model metadata。

推荐顺序：A → B → C → D。原因是 R3/R4 会影响 R1/R2 的元数据，但真正的价值闭环先由 R1/R2 产生；没有真实 stream 和 actions，历史与模型配置只能验证壳。

---

## 15. Definition of Done

R1-R4 完成必须同时满足：

1. 真实页面可以打开右下角助手并完成一次真实或 mock Agent stream。
2. final actions 可以预览、确认、validate、execute、receipt。
3. 刷新后会话历史仍可恢复。
4. 模型/key 来自统一配置，未配置不可误发请求。
5. API key 不出现在 UI、console、后端 status、会话导出和测试截图中。
6. 至少覆盖以下截图：面板打开、模型菜单、streaming、preview card、strong confirm、receipt、history restore。
7. 前端 focused tests、后端 route/schema tests、live screenshot check 全部通过。
8. 所有新增能力保持 assistant core 与 Huanying graphStore adapter 解耦。

---

## 16. 默会知识实现要点

一个经验很强的团队不会把本轮做成“接个聊天接口”。他们会把它当成一个可审计的创作事务系统：

- **先做协议，再做聪明。** Agent 能力可以慢慢增强，但协议不稳定会让后续每个技能都返工。
- **把不确定性挡在 preview 前。** 模型输出永远不可信，preview 是用户信任的第一层。
- **把执行权留给本地 executor。** 这样未来换 Pi、换模型、换 provider，都不会影响 Huanying 画布安全。
- **把历史当证据链。** 会话不是聊天记录，而是“为什么画布变成这样”的解释系统。
- **把配置当产品体验。** 用户不关心 key 在哪里，只关心“为什么不能用”和“下一步去哪配置”。
- **把每次失败变成资产。** live 失败必须转成 schema、executor、route 或 screenshot 回归，而不是只修当下。

本轮真正的成功标准不是“助手会回复”，而是“用户敢让助手改画布，并且每次改动都可理解、可确认、可追踪、可恢复”。
