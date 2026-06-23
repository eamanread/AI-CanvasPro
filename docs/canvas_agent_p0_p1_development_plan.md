# Huanying Canvas Agent P0/P1 可落地开发文档

状态：草案 v1
日期：2026-06-03
范围：P0 + P1
依赖文档：`docs/canvas_agent_full_requirements.md`

## 1. 执行摘要

P0/P1 的目标不是“把聊天框补完整”，而是建立一条产品级闭环：

用户输入 -> 上下文快照 -> 流式 Agent 回复 -> final actions -> schema 校验 -> 预览 -> 权限确认 -> Huanying executor -> 画布变化/生成任务 -> 回执 -> 历史沉淀 -> 回归样本。

强团队会优先保证这条链路稳定、可审计、可回滚、可测试，再去做 story_to_video、爆款实验室、分镜导演等高级能力。

## 2. 真实项目约束

### 2.1 已有能力

- `appAssistantPanel.js` 已有 RH 风格面板、技能列表、输入框、预览卡、回执卡。
- `CanvasAgentRouteService` 已有 `/api/v2/canvas-agent/chat`、`/actions/validate`、`/context/preview`。
- `PiBridgeService` 已有 JSONL 请求和响应清洗。
- `CanvasAgentActionSchema` 继承 Claw 历史 schema。
- `assistantActionExecutor` 已能执行基础 create/connect/layout/focus/generation 类动作。
- `api/configApi.js` 和 settings 已纳入 Canvas Agent / Pi Canvas Agent 配置入口。

### 2.2 不应假设的能力

- 不假设历史 Claw UI 仍在。
- 不假设已有完整会话历史。
- 不假设已有 streaming。
- 不假设附件、参考图、`@` 引用已经可用。
- 不假设模型选择只是一个字符串字段。
- 不假设 Pi 可以直接操作画布。

### 2.3 关键架构约束

- 不改 obfuscated/minified `main.js`，继续通过 autoload 和 adapter 挂载。
- 助手核心放在 `modules/assistant/*`，Huanying app 绑定放在 `modules/app/*`。
- 后端协议放在 `services/canvas_agent_*` 和 `services/pi_*`。
- Pi sidecar 放在 `integrations/pi_canvas_agent/*`。
- 真实执行只发生在 Huanying executor，不发生在 Pi。

## 3. P0/P1 目标架构

```text
appAssistantPanel
  -> assistantConversationStore
  -> assistantStreamingClient
  -> assistantContextBuilder
  -> canvasAgentApi
  -> CanvasAgentRouteService
  -> PiBridgeService / Pi runner
  -> CanvasAgentActionSchema
  -> assistantActionPreview
  -> assistantActionExecutor
  -> graphStore / generation adapter
```

新增模块建议：

| 模块 | 路径 | 职责 |
|---|---|---|
| Conversation Store | `modules/assistant/assistantConversationStore.js` | 管理会话、消息、上下文快照、事务、生成记录。 |
| Streaming Client | `modules/assistant/assistantStreamingClient.js` | 消费 SSE/JSONL stream，输出统一前端事件。 |
| Attachment Store | `modules/assistant/assistantAttachmentStore.js` | 管理附件 chip、上传结果、引用对象。 |
| Model Registry | `modules/assistant/assistantModelRegistry.js` | 从统一配置生成模型和能力矩阵。 |
| Confirmation Policy | `modules/assistant/assistantConfirmationPolicy.js` | 根据 action 风险决定自动、普通确认、强确认。 |
| Transaction Store | `modules/assistant/assistantActionTransactionStore.js` | proposed/validated/applied/failed/rolled_back 事务状态。 |
| Session Routes | `services/canvas_agent_conversation_service.py` | 后端会话持久化。 |
| Streaming Routes | `services/canvas_agent_stream_route_service.py` | SSE/JSONL streaming 响应。 |

## 4. 开发原则

1. 文本流式、动作定稿：`message.delta` 可实时显示，`actions` 只能在 `message.done` 或 final frame 出现。
2. 先保存再请求：发送前先创建 message 和 context snapshot，避免请求失败丢上下文。
3. 先校验再预览：preview 使用 schema 后的 sanitized actions。
4. 先预览再执行：除低风险自动动作外，所有画布变更必须可见。
5. 先事务再回执：executor 返回结构化 result，不只返回字符串。
6. 先 mock 再 live：每条协议都有单元测试，live 失败沉淀 scorecard。

## 5. Phase P0-A：固定协议与类型

### 5.1 前端协议类型

新增 `modules/assistant/assistantProtocol.js`。

核心类型：

```js
export const CANVAS_AGENT_PROTOCOL_VERSION = "2026-06-03";

export const AssistantStreamEventType = Object.freeze({
  MessageStart: "message.start",
  MessageDelta: "message.delta",
  MessageDone: "message.done",
  ActionProposed: "action.proposed",
  Warning: "warning",
  ToolStatus: "tool.status",
  Error: "error",
  Receipt: "receipt",
});
```

统一响应：

```js
{
  protocolVersion: "2026-06-03",
  conversationId: "conv_xxx",
  messageId: "msg_xxx",
  traceId: "trace_xxx",
  reply: "文本回复",
  actions: [],
  warnings: [],
  requiresConfirmation: false,
  usage: { inputTokens: 0, outputTokens: 0 }
}
```

### 5.2 后端协议

`CanvasAgentRouteService` 保留非流式 `/chat`，新增流式：

- `POST /api/v2/canvas-agent/chat/stream`
- Content-Type：`text/event-stream` 或 newline JSON。
- 请求字段：`message`、`context`、`conversationId`、`assistantIntent`、`mode`、`model`、`attachments`。

验收：

- 非流式旧测试继续通过。
- 新增 stream parser 测试。
- 流中不允许出现可执行 action partial。

## 6. Phase P0-B：Action Schema 版本化

### 6.1 action envelope

每条 action 增加：

```json
{
  "schemaVersion": "2026-06-03",
  "actionId": "act_xxx",
  "type": "create_node",
  "riskLevel": "low",
  "requiresConfirmation": false,
  "metadata": {
    "source": "canvas_agent",
    "conversationId": "conv_xxx",
    "messageId": "msg_xxx",
    "assistantIntent": "story_short"
  }
}
```

### 6.2 风险分级

| 风险 | 动作 | 策略 |
|---|---|---|
| low | focus、select、layout 小范围、诊断标记 | 可自动执行 |
| medium | create、connect、update prompt、group、duplicate | 预览确认 |
| high | video generation、批量生成、外部上传、删除/覆盖、模板大规模应用 | 强确认 |

### 6.3 schema 测试

必须覆盖：

- alias repair。
- unknown node reference。
- dangerous key/value。
- video requires confirmation。
- created node alias 被后续 connect 引用。
- unsupported nodeType。
- sanitized metadata 不泄露本地路径和 secret。

## 7. Phase P0-C：Pi 隔离与 Bridge 加固

### 7.1 Pi 工具白名单

只允许：

- `huanying_canvas_propose_actions`
- `huanying_canvas_read_context_summary`
- `huanying_canvas_explain_capability`

禁止：

- shell。
- file read/write。
- DOM 操作。
- HTTP 任意代理。
- 直接生成扣费任务。

### 7.2 Bridge 防线

`PiBridgeService` 要做：

- request id 匹配。
- stdout 首行 JSONL 解析。
- response 类型检查。
- actions schema validate。
- warnings 脱敏。
- stderr / exception / Windows path 脱敏。
- timeout 和 non-zero returncode 统一错误。

验收：

- 任何 schema 异常都 fail closed。
- warning 不泄露 API key、本地路径、命令行。
- Pi 返回自然语言时不影响 UI；Pi 返回 actions 时必须过 schema。

## 8. Phase P0-D：Conversation Store

### 8.1 数据模型

```json
{
  "id": "conv_xxx",
  "title": "电商套图规划",
  "projectId": "project_xxx",
  "createdAt": "2026-06-03T00:00:00.000Z",
  "updatedAt": "2026-06-03T00:00:00.000Z",
  "assistantIntent": { "id": "commerce_pack", "title": "电商套图" },
  "model": { "provider": "pi_canvas_agent", "model": "..." },
  "messages": [],
  "contextSnapshots": [],
  "transactions": [],
  "generationTasks": []
}
```

### 8.2 前端职责

- `createConversation()`：新建会话。
- `appendMessage()`：追加消息。
- `attachContextSnapshot()`：绑定上下文。
- `appendTransaction()`：记录 actions 生命周期。
- `appendReceipt()`：记录执行回执。
- `searchConversations()`：历史搜索。

### 8.3 后端职责

优先用 JSON file route 或项目已有存储风格落地，避免引入数据库。

建议 API：

- `GET /api/v2/canvas-agent/conversations`
- `POST /api/v2/canvas-agent/conversations`
- `GET /api/v2/canvas-agent/conversations/:id`
- `PATCH /api/v2/canvas-agent/conversations/:id`
- `DELETE /api/v2/canvas-agent/conversations/:id`
- `POST /api/v2/canvas-agent/conversations/:id/export`

### 8.4 验收

- 刷新页面后历史会话仍在。
- 切换会话恢复 messages 和 last context summary。
- 删除会话不影响当前画布。
- 导出文件不包含 API key、本地绝对路径。

## 9. Phase P1-A：流式 UI

### 9.1 面板状态机

```text
idle -> composing -> sending -> streaming -> finalizing -> hasActions -> applying -> completed
                                      -> failed
                                      -> cancelled
```

### 9.2 UI 行为

- 发送按钮在 streaming 时变成停止按钮。
- 停止只取消当前请求，不删除已有消息。
- assistant 消息逐字渲染。
- actions 到达 final 后显示预览卡。
- warnings 显示在预览卡上方或消息下方。
- traceId 可复制。

### 9.3 验收

- 流式过程中关闭面板再打开，状态仍在。
- 网络失败时消息状态变 failed，可重试。
- cancel 后不会应用 actions。

## 10. Phase P1-B：面板按钮落地

| 按钮 | 实现任务 |
|---|---|
| RH launcher | 绑定状态 badge：offline/ready/streaming/running/error。 |
| 历史 | 打开 conversation drawer，列出、搜索、恢复、删除。 |
| 新会话 | 新建 conversation，可继承当前 assistantIntent。 |
| 复制会话 | 复制 conversationId 或导出 trace summary。 |
| 技能 | 设置 `assistantIntent`，写入会话，并影响 system prompt。 |
| 上传 | 打开文件选择，上传后生成 attachment chip。 |
| @ | 打开引用选择器：节点、附件、素材、历史产物。 |
| Agent pill | 打开 mode selector。 |
| Ask 下拉 | 切换执行策略。 |
| AUTO | 切换 auto apply policy。 |
| 爆款实验室 | 设置 `assistantIntent=viral_lab`，进入参考视频工作流入口。 |
| 应用 | 打开 action preview modal 或 inline confirm。 |

## 11. Phase P1-C：附件与引用

### 11.1 Attachment 对象

```json
{
  "id": "att_xxx",
  "kind": "image",
  "name": "reference.png",
  "mime": "image/png",
  "size": 12345,
  "width": 1024,
  "height": 1024,
  "assetId": "asset_xxx",
  "previewUrl": "/api/...",
  "usage": "style_reference"
}
```

### 11.2 输入区交互

- 点击 `+` 上传。
- 粘贴图片自动上传。
- 拖拽文件到面板上传。
- chip 可删除、改用途、预览。
- `@` 菜单可插入引用 token。

### 11.3 context 注入

Agent context 中只传：

- attachment id。
- asset id。
- mime。
- dimensions。
- usage。
- safe preview URL。
- 用户命名。

不传：

- 本地绝对路径。
- API key。
- 原始二进制。
- 未授权外链。

## 12. Phase P1-D：模型选择

### 12.1 Model Registry

从统一 API Key 配置读取：

- `canvas_agent`
- `pi_canvas_agent`
- 已有文本/图片/视频 provider。

输出能力矩阵：

```json
{
  "provider": "pi_canvas_agent",
  "model": "xxx",
  "supportsText": true,
  "supportsImageInput": true,
  "supportsImageGeneration": false,
  "supportsVideoGeneration": false,
  "supportsTools": true,
  "maxReferenceImages": 8,
  "requiresProxy": true,
  "configured": true
}
```

### 12.2 选择规则

- 对话模型只影响 agent reasoning。
- 生成模型影响节点生成 action 的 provider/model。
- 技能可推荐模型，但用户可改。
- 未配置模型时显示配置入口。
- 不在面板保存 API key。

## 13. Phase P1-E：画布动作闭环

### 13.1 P1 支持动作

- `create_node`
- `connect_nodes`
- `update_node_data`
- `layout_nodes`
- `focus_nodes`
- `create_group`
- `duplicate_nodes`
- `queue_generation_task`
- `run_prompt_preset_generation`

### 13.2 Preview

预览卡必须分组：

- 将创建的节点。
- 将连接的线。
- 将修改的节点。
- 将整理的布局。
- 将启动的生成任务。
- 需要强确认的动作。

### 13.3 Apply

执行顺序：

1. clone pending actions。
2. validate actions。
3. build preview summary。
4. check confirmation policy。
5. execute sanitized actions。
6. collect result。
7. update transaction。
8. render receipt。
9. persist conversation。

### 13.4 Receipt

回执结构：

```json
{
  "transactionId": "txn_xxx",
  "success": true,
  "appliedCount": 4,
  "skippedCount": 0,
  "failedCount": 0,
  "createdNodeIds": [],
  "generationTaskIds": [],
  "warnings": [],
  "rollbackAvailable": true
}
```

## 14. Phase P1-F：生成任务生命周期

### 14.1 节点状态

```text
draft -> proposed -> applied -> queued -> running -> completed
                                      -> failed
                                      -> cancelled
```

### 14.2 pending 保留

状态不能只存在 React/DOM 层，必须写入 graphStore 或 generation task store。renderer remount 后恢复：

- task id。
- node id。
- provider/model。
- prompt。
- references。
- status。
- startedAt / updatedAt。
- error。

### 14.3 强确认

视频生成、大批量生成、外部上传必须显示：

- 预计任务数。
- provider/model。
- 输入引用。
- 可能耗时。
- 是否可能消耗额度。

## 15. 测试策略

### 15.1 前端单测

新增或扩展：

- `assistantProtocol.test.js`
- `assistantStreamingClient.test.js`
- `assistantConversationStore.test.js`
- `assistantAttachmentStore.test.js`
- `assistantModelRegistry.test.js`
- `assistantConfirmationPolicy.test.js`
- `appAssistantPanel.test.js`
- `appAssistantPanel.autoload.test.js`

### 15.2 后端单测

新增或扩展：

- `canvas_agent_route_service_test.py`
- `pi_bridge_service_test.py`
- `canvas_agent_action_schema_test.py`
- `canvas_agent_context_service_test.py`
- `canvas_agent_conversation_service_test.py`
- `canvas_agent_stream_route_service_test.py`

### 15.3 Live 回归

浏览器打开页面验证：

- RH icon 存在。
- 面板打开/关闭。
- 技能写入 assistantIntent。
- 发送消息出现 streaming。
- 上传附件显示 chip。
- 历史会话可恢复。
- action preview 可应用。
- 低风险自动动作可执行。
- 高风险视频生成必须强确认。

当前已落库的真实网页截图验证脚本：

```bash
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression
```

验收要求：

- 必须打开真实 Huanying 页面，而不是 jsdom。
- 必须点击右下角 `#fabBtn` 或 `.hy-canvas-agent-launcher`。
- 必须等待 `.hy-canvas-agent-panel` 可见。
- 必须校验 `RH 智能体`、`电商套图`、`爆款实验室` 等真实 UI 文案。
- 必须保存 PNG 截图到 `output/regression`。
- 如果浏览器 console 出现 error，本轮 UI 验证失败。
- 后续每次修改助手面板 UI、交互、流式状态、附件 chip、历史侧栏、模型选择器，都要重新执行该脚本并在交付说明中写出截图路径。

## 16. 分阶段交付计划

### Sprint 1：协议和状态

- `assistantProtocol.js`
- streaming API mock。
- panel message 状态机。
- action envelope version。
- schema 风险字段。

验收：流式 mock 能跑通；旧非流式测试不回退。

### Sprint 2：会话历史

- conversation store。
- 后端 conversation routes。
- 历史按钮 drawer。
- 新会话、重命名、删除、恢复。

验收：刷新页面不丢会话；历史可搜索和恢复。

### Sprint 3：附件和引用

- attachment store。
- 上传按钮。
- chip。
- `@` 引用节点/附件。
- context 注入附件摘要。

验收：参考图可上传、引用、进入 context，不泄露本地路径。

### Sprint 4：模型选择

- model registry。
- 面板模型 selector。
- API Key 配置联动。
- 未配置降级提示。

验收：模型选择影响 chat request；不保存 key。

### Sprint 5：动作预览和执行升级

- confirmation policy。
- action transaction store。
- preview 分组。
- apply receipt 结构化。
- generation pending 状态保留。

验收：create/connect/layout/focus/update/generation 全链路可回归。

## 17. 风险与规避

| 风险 | 规避 |
|---|---|
| Agent 输出不可控 | schema fail closed，Pi 只 proposal。 |
| 流式中断产生半截 action | actions 只允许 final frame。 |
| 历史恢复错上下文 | 每轮保存 context snapshot。 |
| 参考图泄露本地路径 | 只传 assetId 和 safe URL。 |
| 模型能力不匹配 | model registry 做 capability gate。 |
| 生成状态丢失 | pending/running 写入 store。 |
| UI 与主项目耦合 | adapter 注入 graph/generation/workspace 能力。 |
| 高级工作流返工 | 先完成 P0/P1 基础闭环。 |

## 18. Definition of Done

P0/P1 完成必须满足：

- 用户可流式对话。
- 用户可创建和恢复历史会话。
- 用户可上传参考图并引用。
- 用户可选择模型和执行模式。
- 用户可通过对话提出画布动作。
- actions 必须经过 schema、preview、确认、executor。
- 低风险动作可自动，高风险动作强确认。
- 生成任务有 pending/running/completed/failed 状态。
- 所有消息、上下文、actions、回执、生成任务可追踪。
- 前端、后端、Pi、schema、executor 测试通过。
- Live 浏览器回归覆盖 RH 面板核心交互。
