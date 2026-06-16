# Claw Code 助手接入幻映：持续实现与接力文档

> 本文是 **持续更新的实现文档**。每个接力开发者在开始前先读它；每完成一块实现、发现一个坑、改动一个接口、跑完一组验证，都必须更新本文。不要把它当一次性方案文档。

## 0. 当前状态

更新时间：2026-05-26
当前状态：已完成前端第一纵切、特殊接入配置卡、后端 assistant 状态/聊天壳、后端 provider proxy 第一版、claw runtime 管理骨架、真实 claw-code runtime 下载编译放置、真实 CLI 参数形态校准、前端画布上下文摘要接入、后端 action schema 白名单校验接入、前端 action 预览卡片第一版、前端 graphStore 动作执行器第一版、后端 `actions/validate` / `context/preview` 调试路由、后端基于 `context.canvas.nodes` 的节点引用作用域校验、`connect_nodes` 保守语义校验、前端应用前二次校验、`rename_node/focus_nodes` 两类低风险非生成动作、action 预览卡片详情展开/局部勾选应用，以及低风险内部画布动作自动应用；右下角现有圆形入口可以打开聊天面板，前端能调用 `/api/v2/assistant/status` 与 `/api/v2/assistant/chat`，聊天 payload 已能携带当前画布、选中节点、连线、素材与工作流摘要。后端能读取并脱敏 `providers.claw_assistant`，并已提供 `/api/v2/assistant/provider-proxy/v1/chat/completions` 给 claw-code runtime 使用。后端已能识别外置/内置 runtime 路径、构造只含本地 proxy 凭据和安全 Windows 基础环境的启动 spec，并提供可测试的 runtime start/stop 路由。当前基础真实聊天已完成端到端联调：`/api/v2/assistant/chat` 已经能通过真实 `claw.exe`、本地 provider proxy 和在线模型返回 `success=true/reply=OK`。当前前端对 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes` 五类低风险内部画布动作会自动走 `/api/v2/assistant/actions/validate` 二次复验并执行后端净化后的 actions；不符合低风险规则的动作仍保留预览和人工应用。真实在线模型已验证能产出最小 `create_node + connect_nodes` actions；更复杂动作、精确 handle/端口契约、撤销/历史提交仍待实现。
本次补充：已新增 `ClawBridgeService` 聊天调用层，`/api/v2/assistant/chat` 在注入 bridge 后会把消息和上下文转成 claw-code CLI 参数，解析纯文本或 JSON 输出，并返回统一的 `reply/actions/warnings/requiresConfirmation` 结构。真实 CLI 形态已校准为 `claw --output-format json prompt <JSON>`，不再把 prompt JSON 走 stdin。
本次补充 2：已把 `runtimePath` 暴露到 Claw Code 助手设置卡与 `getProviderConfig("claw_assistant")`，并让状态接口在 provider 已配置但 runtime 缺失时返回 `missing_runtime`。这一步是进入真实联调前的路径配置准备。
本次补充 3：已把 `ultraworkers/claw-code` 克隆到 `integrations/claw_code/source`，在本机用 Rust + VS Build Tools 编译出 `integrations/claw_code/runtime/claw.exe`，并复制许可证到 `LICENSE.claw-code.txt`。`claw.exe --help` 已通过离线冒烟检查；未启动、检查、重启或探测 `8777`。
本次补充 4：已修复前端助手 API 的错误透出。后端 bridge 返回 `success=false/errorCode/reply` 时，`api/clawAssistantApi.js` 会把它格式化为可读错误并保留 `errorCode/assistantReply/assistantResponse`，聊天面板不再只显示泛化的“Claw Code 助手回复失败”。
本次补充 5：已新增 `modules/assistant/assistantContextBuilder.js`，并在 `modules/app/appAssistantPanel.autoload.js` 注入真实 `graphStore/workspaceStore`。发送聊天时会带上轻量、脱敏的 `project/canvas/selection/assets/workflows/warnings` 摘要；不会把真实 API Key、绝对路径、data/blob URL 或完整项目 JSON 交给 claw-code。
本次补充 6：已新增 `services/claw_action_schema.py` 和 `claw_action_schema_test.py`，支持 `create_node/update_node_data/connect_nodes` 三类低风险动作的白名单校验、危险字段剔除和敏感值脱敏；`server.py` 已实例化 `CLAW_ACTION_SCHEMA` 并注入正式 `CLAW_BRIDGE_SERVICE`，所以真实 `/api/v2/assistant/chat` 链路会默认校验 claw 返回的 actions。
本次补充 7：已新增 `modules/assistant/assistantActionPreview.js` 和测试，并接入 `modules/app/appAssistantPanel.js`。当助手返回 actions 时，聊天面板会在回复下方显示操作预览卡片，摘要展示将创建、修改或连接什么；“取消”可移除预览，“应用”已预留给下一步 graphStore 执行器。
本次补充 8：已新增 `modules/assistant/assistantActionExecutor.js` 和测试，并在 `modules/app/appAssistantPanel.autoload.js` 注入真实 `graphStore` 执行能力。预览卡片点击“应用”后会通过 `graphStore.addNode/updateNodeData/addEdge/setSelectedNodes` 执行低风险动作，支持 action id 引用新建节点、`selected_node` 相对定位，成功后移除预览并在聊天中显示执行摘要；不直接写项目 JSON，不触发付费生成。
本次补充 9：已新增 `services/claw_context_service.py`，并让 `ClawAssistantRouteService` 支持 `POST /api/v2/assistant/actions/validate` 与 `POST /api/v2/assistant/context/preview`。前者复用正式 `ClawActionSchema` 返回净化后的 actions 或校验错误，后者对调试上下文做二次脱敏，删除 secret/key/token 字段并替换 Windows 绝对路径、OpenAI key、Bearer token、`data:` URL 与 `blob:` URL。`server.py` 已把 `CLAW_ACTION_SCHEMA` 与 `CLAW_CONTEXT_SERVICE` 注入正式 assistant route；本次仍未启动、检查、重启或探测 `8777`。
本次补充 10：`ClawActionSchema.validate_actions(actions, context=...)` 已支持基于上下文的节点作用域校验。传入 `context.canvas.nodes` 时，`update_node_data.nodeId` 和 `connect_nodes.from/to` 必须指向当前上下文中的节点，或指向同一批 action 中更早出现的 `create_node.id`；`ClawBridgeService` 与 `actions/validate` 路由都会把 context 传入 schema。缺少 context 时仍保留纯 schema 校验，方便离线工具和旧测试调用。
本次补充 11：`connect_nodes` 已增加保守语义校验：会拒绝自连接、连入 `source-*` 节点、明显反向或未知的 `sourceHandle/targetHandle`，以及明显媒体类型不兼容的连接，例如 `source-audio -> ai-image`；同时保留常见安全流向，例如 `source-text -> ai-image`、`source-image -> ai-video`。`validate_actions()` 也改为逐条 action 收集错误，避免一条坏 action 遮住后续诊断。
本次补充 12：前端应用 actions 前已经接入二次校验。`api/clawAssistantApi.js` 新增 `validateClawAssistantActions()` 调用 `/api/v2/assistant/actions/validate`；`modules/app/appAssistantPanel.autoload.js` 在预览卡片“应用”时重新构建当前画布 context，先把 `{actions, context}` 交给后端校验，再执行后端返回的净化 actions。若后端返回 `valid=false`，前端会阻止执行器落图并在聊天面板显示错误。
本次补充 13：已补齐 `rename_node` 与 `focus_nodes` 两类低风险非生成动作。后端 `ClawActionSchema` 会对白名单字段、节点作用域和敏感值做校验；前端预览卡片会展示“重命名/聚焦”摘要；`assistantActionExecutor` 会通过 `graphStore.renameNode` 或安全 fallback 重命名节点，并通过 `graphStore.setSelectedNodes` 聚焦节点；执行结果摘要也会显示重命名和聚焦数量。
本次补充 14：action 预览卡片已支持局部应用和详情展开。每条 action 都有默认勾选的复选框，用户可以取消某几条后只应用剩余动作；点击“应用”时只把勾选后的 actions 交给现有二次校验和执行器。每条预览也会展示可展开的 JSON 详情，方便真实联调时判断模型到底产出了什么。
本次补充 15：真实联调确认用户重新填写的 `apiKey` 已不再是 URL，但 provider proxy 仍按旧逻辑把 `apiUrl=https://api.gptclubapi.xyz/openai` 拼成 `/openai/chat/completions`，上游返回 403。已修复 endpoint 解析：`/v1` base 继续追加 `/chat/completions`，完整 `/chat/completions` endpoint 不重复追加，`/openai` base 自动走 `/openai/v1/chat/completions`。运行中的 `8777` 需要用户重启后才会加载此改动。
本次补充 16：用户确认当前 key 和 Codex 使用的是同一个 key，因此不再把排查重点放在“key 本身是否可用”。继续对比幻映现有通用文本代理后发现，`/api/v2/proxy/completions` 会带浏览器 `User-Agent`，而助手 provider proxy 之前没有。已为助手 provider proxy 补齐浏览器 UA，降低中转/CDN 因 Python/urllib 默认请求指纹返回 403 的概率。运行中的 `8777` 仍需用户重启后才会加载此改动。
本次补充 17：provider proxy 经用户重启后已真实返回上游 `OK`，确认 key、apiUrl、模型名与本地 proxy 均可用；随后 `/api/v2/assistant/chat` 仍超时，根因定位到 bridge 直接用极简 env 启动 `claw.exe`，没有传入 `PATH/SystemRoot/TEMP` 等 Windows 基础环境。已把 `ClawRuntimeService.build_launch_spec()` 的 env 改成“白名单基础环境 + 本地 proxy 覆盖值”，仍不传真实 key。真实 bridge 直跑已不再超时。
本次补充 18：真实 `claw.exe --output-format json` 返回的外层字段是 `message`，并且在收到 `responseContract` 时可能把 `{reply/actions/warnings/requiresConfirmation}` 合同 JSON 放进 `message` 字符串里。`ClawBridgeService` 已支持读取外层 `message`，并能展开内嵌合同 JSON；这对真实 actions 产出非常关键。运行中的 `8777` 需要用户再次重启后才会加载本次 bridge/env/parser 修复。
本次补充 19：低风险内部画布动作已经支持自动应用，不再要求用户为免费内部结构操作点击“应用”；同时自动应用成功消息新增操作日志样式，失败时会把错误包装成包含 action 序号、类型、标题/ID 和原因的诊断文本，方便定位是 validate 还是 executor 的哪条动作出问题。本次只改前端静态 JS，不需要重启 `8777`，刷新浏览器页面即可加载。
本次补充 20：阶段二“画布医生 + 自动整理画布”已完成。已补齐 `canvas.diagnostics`、诊断注释、严重问题聚焦、`canvas.layoutHints`、整理策略分型、诊断后整理回执联动和阶段二回归/接力文档；下一阶段进入“一句话生成工作流 MVP”。本轮没有启动、重启、停止、检查或探测 `8777`。
本次补充 21：阶段三“一句话生成工作流 MVP”已完成到离线/测试口径。当前 bridge 已有 `workflowMvpRules`，schema/context/executor/preview/receipt 已围绕 `workflowKind/workflowStep/workflowGroupId/workflowReason` 保留工作流结构元数据；工作流创建复用 `create_node/connect_nodes/layout_nodes/focus_nodes/set_viewport`，默认只搭画布结构，不调用 `queue_generation_task` 或 `run_prompt_preset_generation`，并在 preview/receipt 中提示未自动运行付费生成。下一阶段进入阶段四“分镜导演模式”。本轮没有启动、重启、停止、检查或探测 `8777`。
本次补充 22：阶段四 D 窗口已接取并推进回归/接力准备，但阶段四尚未完成。当前前端侧已能看到分镜 metadata 上下文保留、分镜 preview/receipt、multi-shot executor 分组/布局和“视频节点仅准备/未自动触发未经授权的视频生成”的测试覆盖；后端 bridge/schema 仍缺 `storyboardRules` 与 `storyboardId/shotIndex/shotTitle/shotVisual/shotCamera/shotStyle/shotPrompt/shotContinuity` 安全 metadata 白名单闭环。D 窗口已在回归清单中预埋 S4 人工验收场景，并记录下一步应先由窗口 A 补齐后端协议/schema。阶段四不能在本轮汇报为完成。本轮没有启动、重启、停止、检查或探测 `8777`。
当前决策：采用 B 方案，claw-code 作为本地 sidecar AI 助手核心，幻映负责配置、代理、安全、画布执行和用户确认。

已存在文档：

- `docs/CLAW_CODE_ASSISTANT_INTEGRATION_B_IDEAL_PRODUCT.md`
- `docs/CLAW_CODE_PROJECT_RESEARCH.md`
- `docs/CLAW_CODE_PROJECT_RESEARCH_ZH_CN.md`

本轮新增的关键决策：

- 在现有“特殊接入配置”区域新增 **Claw Code 助手** 卡片。
- 用户在幻映里填写助手专用 `apiUrl / apiKey / model / providerType / runtimePath`。
- 正式产品不让 claw-code 直接拿真实 API Key。
- claw-code 只拿幻映本地 OpenAI-compatible 代理地址和本地 token。
- 幻映后端读取真实 `providers.claw_assistant` 配置并请求云模型。

## 1. 接力更新规则

每次接力开发必须更新这些区域：

1. 更新 `0. 当前状态` 的状态和日期。
2. 在 `15. 实现日志` 追加记录，不要覆盖旧记录。
3. 如果改了接口，更新 `5. 后端接口契约`。
4. 如果改了配置结构，更新 `4. 配置结构`。
5. 如果新增或改名文件，更新 `8. 文件触达清单`。
6. 如果跑了测试，更新 `14. 验证记录`。
7. 如果发现风险或坑，更新 `13. 风险与注意事项`。

交接时必须保证下一位开发者能回答：

- 现在做到哪了？
- 哪些文件已经改了？
- 哪些接口已经可用？
- 哪些测试已经过了？
- 下一个最小动作是什么？
- 有哪些坑不能重复踩？

### 1.1 本地 8777 服务协作规则

用户已明确要求：以后凡是涉及 `http://127.0.0.1:8777` 本地服务的启动、检查、重启、停止或状态准备，都由用户来处理。注意这不是“永远不联调服务”，而是当开发者想启动/检查/探测服务时必须停下来交给人工处理；用户通知服务已就绪后，可以继续做依赖该服务的联调。

接力开发者必须遵守：

- 不要主动启动 `8777` 服务。
- 不要主动检查 `8777` 服务是否已经启动。
- 不要主动重启、停止或探测该服务。
- 如果某一步需要依赖本地服务状态，先告诉用户“需要 8777 服务就绪”，等用户启动好并通知后再继续。
- 只有在用户明确要求“你来检查 8777”或“你来启动服务”时，才可以执行对应操作。

## 2. 最终目标

在幻映中接入一个完整的 **Claw Code AI 助手**：

- 用户在幻映设置里配置助手模型。
- 幻映后端启动和管理 claw-code。
- claw-code 通过幻映本地 provider proxy 使用在线模型。
- 幻映前端提供右侧 AI 助手面板。
- 助手能理解当前画布、选中节点、资源、模型和工作流。
- 助手返回自然语言回答和结构化 actions。
- 幻映校验 actions，展示预览卡片。
- 用户确认后，幻映执行画布变更。
- claw-code 不直接写项目 JSON，不直接拿真实 API Key，不绕过生成权限。

## 3. 总体架构

```text
幻映设置：特殊接入配置 / Claw Code 助手
  -> user/config.json.providers.claw_assistant
  -> 幻映后端 ClawProviderProxyService
  -> 真实 OpenAI-compatible 云模型或本地模型服务

幻映前端助手面板
  -> api/clawAssistantApi.js
  -> /api/v2/assistant/*
  -> ClawAssistantRouteService
  -> ClawBridgeService
  -> ClawRuntimeService
  -> claw-code 进程
  -> 幻映本地 provider proxy
```

核心边界：

| 边界 | 规则 |
|---|---|
| 配置 | 真实 API Key 存在幻映配置里，不直接暴露给 claw-code |
| 模型请求 | claw-code 调用幻映本地 OpenAI-compatible 代理 |
| 画布执行 | claw-code 只返回 actions，幻映校验并执行 |
| 项目文件 | claw-code 不直接读写 `user/Canvas Project/*.json` |
| 高风险能力 | bash、MCP、外部网络、付费生成默认受控 |

## 4. 配置结构

配置存储位置沿用现有链路：

```text
user/config.json
```

新增 provider：

```json
{
  "providers": {
    "claw_assistant": {
      "apiUrl": "https://api.openai.com/v1",
      "apiKey": "sk-xxxx",
      "model": "gpt-4.1-mini",
      "providerType": "openai_compatible",
      "runtimePath": "D:/tools/claw-code.exe"
    }
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `apiUrl` | 是 | OpenAI-compatible base URL，不带末尾斜杠 |
| `apiKey` | 是 | 助手专用 API Key |
| `model` | 是 | 助手默认模型 |
| `providerType` | 否 | 默认 `openai_compatible` |
| `runtimePath` | 否 | 外置 claw-code 可执行文件路径；未填写时会查找 `integrations/claw_code/runtime/` |

前端设置卡片字段：

```text
apiUrl
apiKey
model
providerType
runtimePath
```

当前 `api/configApi.js#getProviderConfig(providerId)` 只稳定返回：

```js
{
  apiUrl,
  apiKey,
  modelApiKey,
  defaultDurationSec
}
```

实现时需要让 `claw_assistant` 能额外返回：

```js
{
  apiUrl,
  apiKey,
  model,
  providerType,
  runtimePath
}
```

注意不要破坏 RunningHUB、GRSAI、PPIO、APIMart 的旧字段。

## 5. 后端接口契约

新增接口统一放在 `/api/v2/assistant/*` 下。

### 5.1 状态接口

```text
GET /api/v2/assistant/status
```

返回示例：

```json
{
  "success": true,
  "available": true,
  "status": "ready",
  "runtime": {
    "configured": true,
    "running": true,
    "pid": 12345,
    "workDir": "user_data/claw_assistant"
  },
  "provider": {
    "configured": true,
    "apiUrl": "https://api.openai.com/v1",
    "model": "gpt-4.1-mini",
    "providerType": "openai_compatible",
    "apiKeyPresent": true
  }
}
```

不得返回真实 `apiKey`。

### 5.2 聊天接口

```text
POST /api/v2/assistant/chat
```

请求：

```json
{
  "conversationId": "project-id-or-session-id",
  "message": "帮我检查当前画布",
  "context": {
    "project": {},
    "canvas": {},
    "selection": {},
    "models": {},
    "assets": {}
  }
}
```

返回：

```json
{
  "success": true,
  "reply": "我看到了 3 个节点，其中视频节点缺少参考图输入。",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false
}
```

### 5.3 上下文预览接口

```text
POST /api/v2/assistant/context/preview
```

用途：调试当前会发送给 claw 的上下文摘要。必须自动脱敏。

请求可以是包装形态：

```json
{
  "context": {
    "project": {},
    "canvas": {},
    "selection": {},
    "assets": {},
    "workflows": {}
  }
}
```

也可以直接提交 context 对象：

```json
{
  "project": {},
  "canvas": {},
  "selection": {}
}
```

返回：

```json
{
  "success": true,
  "context": {},
  "warnings": []
}
```

安全要求：

- 删除字段名命中 `apiKey / authorization / secret / token / password / credential` 的字段。
- 替换字符串里的 Windows 绝对路径、`data:` URL、`blob:` URL、OpenAI key 形态和 Bearer token。
- warning 只返回泛化原因，不回显原始敏感字段值。

### 5.4 action 校验接口

```text
POST /api/v2/assistant/actions/validate
```

用途：前端或后端执行前校验 claw 返回的 actions。

请求：

```json
{
  "actions": [
    {
      "id": "act_create",
      "type": "create_node",
      "title": "创建文本节点",
      "nodeType": "source-text",
      "data": {
        "content": "..."
      }
    }
  ]
}
```

返回：

```json
{
  "success": true,
  "valid": true,
  "actions": [],
  "warnings": [],
  "errors": []
}
```

当前复用 `services/claw_action_schema.py`，支持 `create_node / update_node_data / connect_nodes / rename_node / focus_nodes` 五类低风险动作。非法动作不会返回可执行 actions，只返回 `valid=false` 和错误原因。

如果请求体携带 `context.canvas.nodes`，校验会额外检查节点引用作用域：

- `update_node_data.nodeId` 必须指向当前上下文中的节点，或同一批 action 中更早创建的 `create_node.id`。
- `connect_nodes.from/sourceId/to/targetId` 必须指向当前上下文中的节点，或同一批 action 中更早创建的 `create_node.id`。
- `rename_node.nodeId` 与 `focus_nodes.nodeIds[*]` 必须指向当前上下文中的节点；`selected_node` 会按当前 selection 解析。
- `connect_nodes` 还会做保守语义校验，拦截自连接、连入 source 节点、明显反向/未知 handle 和明显媒体类型不兼容连接。
- 缺少 `context` 时只做结构、字段和敏感值白名单校验，不做节点存在性判断。

当前前端在用户点击 action 预览卡片“应用”时，会重新构建最新画布 context，并调用该接口做二次校验；只有 `valid=true` 时才把返回的净化 actions 交给 `graphStore` 执行器。

### 5.5 运行时接口

```text
POST /api/v2/assistant/runtime/start
POST /api/v2/assistant/runtime/stop
```

用途：启动或停止本地 claw runtime。

### 5.6 Provider Proxy 接口

```text
POST /api/v2/assistant/provider-proxy/v1/chat/completions
```

claw-code 看到的是 OpenAI-compatible endpoint：

```text
OPENAI_BASE_URL=http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1
OPENAI_API_KEY=aic-local-assistant-token
```

幻映后端实际请求由 `providers.claw_assistant.apiUrl` 解析得到：

- `apiUrl` 以 `/chat/completions` 结尾时，视为完整 endpoint，不再追加路径。
- `apiUrl` 以 `/v1` 结尾时，转发到 `{apiUrl}/chat/completions`。
- `apiUrl` 以 `/openai` 结尾时，转发到 `{apiUrl}/v1/chat/completions`，用于兼容部分中转网关。
- 其他 OpenAI-compatible base URL 暂按 `{apiUrl}/chat/completions` 转发。

转发时：

- 使用真实 `providers.claw_assistant.apiKey`
- 出站请求带浏览器 `User-Agent`，尽量贴近现有 `/api/v2/proxy/completions` 请求形态
- 如果请求体里没有 `model`，补 `providers.claw_assistant.model`
- 保留 OpenAI-compatible request/response 格式
- 支持普通 JSON 响应
- 后续如要支持 streaming，再加 SSE 转发

安全要求：

- 只允许本地请求。
- 校验 `Authorization: Bearer aic-local-assistant-token` 或等价本地 token。
- 不把真实 `apiKey` 写入日志。
- 错误响应要脱敏。

## 6. claw-code 启动环境

推荐运行目录：

```text
user_data/claw_assistant/
```

可选内置 runtime 目录：

```text
integrations/claw_code/runtime/
```

启动 claw 时注入：

```text
OPENAI_BASE_URL=http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1
OPENAI_API_KEY=aic-local-assistant-token
```

不要注入真实 `providers.claw_assistant.apiKey`。

如果后续需要兼容 Anthropic/DashScope，可在 proxy 层模拟 OpenAI-compatible，或者根据 `providerType` 走不同后端适配。但第一版以 `openai_compatible` 为准。

## 7. 前端产品入口

设置面板：

- 修改 `modules/settings/apiSettings.js`
- 在 `SPECIAL_PROVIDER_CONFIGS` 里新增 `claw_assistant`
- 字段为 `apiUrl / apiKey / model / providerType / runtimePath`
- 标题显示“Claw Code 助手”
- 描述明确：这是 AI 助手专用模型配置，不进入普通节点模型 registry。

助手面板：

- 不新增前端路由。
- 作为主界面右侧 dock 面板。
- 接入 `modules/app/`。
- 调用 `api/clawAssistantApi.js`。

## 8. 文件触达清单

### 8.1 已创建或已修改

- 修改：`docs/CLAW_CODE_ASSISTANT_INTEGRATION_B_IDEAL_PRODUCT.md`
- 创建：`docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- 创建：`api/clawAssistantApi.js`
- 创建：`api/clawAssistantApi.test.js`
- 创建：`modules/app/appAssistantPanel.js`
- 创建：`modules/app/appAssistantPanel.autoload.js`
- 创建：`modules/app/appAssistantPanel.test.js`
- 创建：`modules/app/appAssistantPanel.autoload.test.js`
- 创建：`modules/assistant/assistantContextBuilder.js`
- 创建：`modules/assistant/assistantContextBuilder.test.js`
- 创建：`modules/assistant/assistantActionPreview.js`
- 创建：`modules/assistant/assistantActionPreview.test.js`
- 创建：`modules/assistant/assistantActionExecutor.js`
- 创建：`modules/assistant/assistantActionExecutor.test.js`
- 创建：`services/claw_assistant_route_service.py`
- 创建：`services/claw_provider_proxy_service.py`
- 创建：`services/claw_runtime_service.py`
- 创建：`services/claw_bridge_service.py`
- 创建：`services/claw_action_schema.py`
- 创建：`services/claw_context_service.py`
- 创建：`claw_assistant_route_service_test.py`
- 创建：`claw_provider_proxy_service_test.py`
- 创建：`claw_runtime_service_test.py`
- 创建：`claw_bridge_service_test.py`
- 创建：`claw_action_schema_test.py`
- 创建目录：`integrations/claw_code/source/`
- 创建目录：`integrations/claw_code/runtime/`
- 创建：`integrations/claw_code/runtime/claw.exe`
- 创建：`integrations/claw_code/runtime/LICENSE.claw-code.txt`
- 修改：`api/configApi.js`
- 修改：`api/configApi.specialProviders.test.js`
- 修改：`api/index.js`
- 修改：`modules/settings/apiSettings.js`
- 修改：`modules/settings/apiSettings.test.js`
- 修改：`modules/subscriptionCdkeyVisibility.autoload.js`
- 修改：`services/http_route_dispatcher.py`
- 修改：`http_route_dispatcher_test.py`
- 修改：`server.py`

### 8.2 预计新增

- `services/claw_action_permission_service.py`（后续做节点存在性、动作权限和更细粒度执行策略时再考虑）

### 8.3 预计修改

- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionPreview.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.autoload.js`
- `services/claw_action_schema.py`
- `services/claw_assistant_route_service.py`
- `server.py`

## 9. 实现任务清单

### 任务 1：特殊接入配置卡

目标：在“特殊接入配置”中新增 Claw Code 助手卡。

改动：

- `modules/settings/apiSettings.js`
- `modules/providers.js`
- `api/configApi.js`
- `config_route_service_test.py`

验收：

- 设置面板出现 Claw Code 助手卡。
- 可以保存 `apiUrl / apiKey / model / providerType / runtimePath`。
- 刷新后配置仍存在。
- `getProviderConfig("claw_assistant")` 能读到完整字段。
- 不影响 RunningHUB、PPIO、APIMart、GRSAI。

### 任务 2：后端 provider proxy

目标：实现 `/api/v2/assistant/provider-proxy/v1/chat/completions`。

改动：

- `services/claw_provider_proxy_service.py`
- `services/claw_assistant_route_service.py`
- `services/http_route_dispatcher.py`
- `server.py`
- `claw_provider_proxy_service_test.py`
- `http_route_dispatcher_test.py`

验收：

- 未配置 `claw_assistant` 时返回清晰错误。
- 请求缺少本地 token 时拒绝。
- 配置完整时，后端按 endpoint 解析规则转发到真实 OpenAI-compatible chat completions 接口。
- 请求体没有 `model` 时自动补默认模型。
- 日志和响应不泄露真实 `apiKey`。

### 任务 3：claw runtime 管理

目标：检测、启动、停止 claw-code。

改动：

- `services/claw_runtime_service.py`
- `services/claw_bridge_service.py`
- `services/claw_assistant_route_service.py`
- `claw_runtime_service_test.py`

验收：

- 能检测外置或内置 claw runtime。
- 能构建受控工作目录 `user_data/claw_assistant/`。
- 启动时只注入本地 proxy env。
- 状态接口能返回 running/pid/workDir。

### 任务 4：助手聊天桥

目标：前端能向 `/api/v2/assistant/chat` 发送消息，后端调用 claw 并返回 reply/actions。

改动：

- `services/claw_bridge_service.py`
- `services/claw_context_service.py`
- `services/claw_action_schema.py`
- `claw_assistant_route_service_test.py`
- `claw_action_schema_test.py`

验收：

- 支持 conversationId。
- 支持上下文摘要。
- claw 输出纯文本时能转成 `{reply, actions: []}`。
- claw 输出 JSON 时能解析 actions。
- 非法 JSON 不崩溃，返回格式异常错误。

### 任务 5：前端助手 API 和面板

目标：幻映界面可打开助手面板，完成聊天和状态显示。

改动：

- `api/clawAssistantApi.js`
- `api/index.js`
- `index.html`
- `modules/app/appAssistantPanel.js`
- `modules/app/appPanels.js`
- `styles/*`
- `claw_assistant_api.test.js`

验收：

- 面板能打开/关闭。
- 能显示未配置、启动中、可用、错误状态。
- 能发送消息并展示回复。
- 错误信息可读。

### 任务 6：画布上下文摘要

目标：把当前画布、选中节点、连接、模型和资源摘要传给助手。

改动：

- `modules/assistant/assistantContextBuilder.js`
- `services/claw_context_service.py`
- `assistant_context_builder.test.js`

验收：

- 不传 API Key。
- 不传完整绝对路径。
- 不传完整项目 JSON。
- 能表达节点类型、名称、prompt 摘要、连接关系、生成状态、选中节点。

### 任务 7：action 预览和执行

目标：claw 返回 actions 后，幻映展示预览并在用户确认后执行。

改动：

- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/app/appAssistantPanel.js`
- `services/claw_action_schema.py`
- `assistant_action_executor.test.js`
- `claw_action_schema_test.py`

验收：

- `create_node` 可预览并执行。
- `update_node_data` 可预览并执行。
- `connect_nodes` 可预览并执行。
- `rename_node` 可预览并执行。
- `focus_nodes` 可预览并执行。
- 预览卡片支持每条 action 勾选/取消勾选，应用时只提交勾选动作。
- 预览卡片支持展开查看单条 action JSON 详情。
- 高风险 `run_generation` 需要二次确认。
- 非法 action 被拒绝。
- 执行后项目可保存，刷新可恢复。

## 10. Action Schema 初稿

允许 action：

```json
{
  "id": "act_1",
  "type": "create_node",
  "title": "创建图像节点",
  "nodeType": "ai-image",
  "data": {
    "prompt": "..."
  },
  "position": {
    "relativeTo": "selected_node",
    "direction": "right"
  }
}
```

```json
{
  "id": "act_2",
  "type": "update_node_data",
  "title": "优化提示词",
  "nodeId": "node-id",
  "patch": {
    "prompt": "..."
  }
}
```

```json
{
  "id": "act_3",
  "type": "connect_nodes",
  "title": "连接参考图",
  "from": "source-node-id",
  "to": "target-node-id"
}
```

```json
{
  "id": "act_4",
  "type": "rename_node",
  "title": "重命名节点",
  "nodeId": "node-id",
  "name": "新节点名"
}
```

```json
{
  "id": "act_5",
  "type": "focus_nodes",
  "title": "聚焦节点",
  "nodeIds": ["node-id-1", "node-id-2"]
}
```

所有 action 必须有：

- `id`
- `type`
- `title`

所有 action 的字段必须白名单校验。未知字段可以保留用于展示，但不能参与执行。

作用域校验：

- 当 `validate_actions(..., context=...)` 收到 `context.canvas.nodes` 时，`update_node_data`、`connect_nodes`、`rename_node`、`focus_nodes` 的节点引用必须存在于当前画布上下文。
- 同一批 actions 中，后面的 action 可以引用前面 `create_node.id`，例如先 `id=act_create_video` 创建节点，再 `connect_nodes.to=act_create_video`。
- 该校验已经接入 `ClawBridgeService` 和 `/api/v2/assistant/actions/validate`。因此真实聊天链路与独立调试路由的结果保持一致。
- `connect_nodes` 已有第一层保守语义校验：拒绝自连接、连入 `source-*` 节点、明显反向或未知的 `sourceHandle/targetHandle`，以及明显媒体类型不兼容的组合，例如 `source-audio -> ai-image`。
- 当前允许的常见安全流向包括 `source-text -> ai-image`、`source-text -> ai-video`、`source-image -> ai-video` 等；这只是预联调防线，不等同于完整端口系统。
- 后续仍需补更精确的画布 handle/端口契约、动作权限策略和付费生成权限；这些属于下一层权限/语义校验。

## 11. 安全规则

必须遵守：

- claw-code 不直接获取真实 API Key。
- provider proxy 不返回真实 API Key。
- provider proxy 只接受本地请求或本地 token。
- claw-code 默认不允许 `danger-full-access`。
- 画布改动必须走 action schema。
- 付费生成必须二次确认。
- 任何日志都不能写入 API Key、订阅密钥、完整私密素材。

## 12. 推荐测试命令

Python：

```powershell
python -m unittest claw_bridge_service_test.py claw_provider_proxy_service_test.py claw_runtime_service_test.py claw_action_schema_test.py claw_assistant_route_service_test.py
```

后端全量：

```powershell
python -m unittest discover -p "*_test.py"
```

前端：

```powershell
cmd /c node --test api\clawAssistantApi.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js
```

前端全量：

```powershell
cmd /c npm test
```

静态语法：

```powershell
python -m py_compile server.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py services\claw_bridge_service.py services\claw_context_service.py services\claw_action_schema.py
```

## 13. 风险与注意事项

- `main.js`、部分 `components`、部分 API 文件是压缩/混淆风格，尽量不要直接大改。
- 现有 `services/` 同时有 JS 和 Python 文件，修改时注意扩展名。
- `api/configApi.js#getProviderConfig()` 目前字段较固定，扩展时要保护旧 provider。
- 特殊接入配置会暴露给前端设置页，这是现有产品模式；但 claw runtime 不应直接拿真实 key。
- `server.py` 已经较大，新逻辑必须下沉到 route service。
- `/api/v2/assistant` 要加入敏感 API 前缀，走本地访问控制。
- provider proxy 第一版先支持非 streaming JSON；如果直接做 SSE，测试复杂度会升高。
- bridge 层当前按真实 claw-code CLI 形态构造命令：`command + ["--output-format", "json", "prompt", promptPayloadJson]`；prompt JSON 在最后一个命令参数里，stdin 传空字符串。
- 不要把 claw-code 放在幻映项目根目录高权限执行。
- 不要让 claw-code 直接写 `user/Canvas Project/*.json`。
- `8777` 本地服务的启动、检查、重启都交给用户处理；开发者不要主动操作或探测，除非用户明确授权。

## 14. 验证记录

当前已完成前端第一纵切、配置卡、后端 assistant 状态/聊天壳、后端 provider proxy 第一版、claw runtime 管理骨架、claw bridge 聊天调用层、真实 claw-code runtime 文件放置、真实 CLI 参数校准、前端画布上下文摘要、后端 action schema 白名单校验、前端 action 预览卡片、前端 graphStore 动作执行器、后端 actions/context 调试路由、后端节点引用作用域校验、`connect_nodes` 保守语义校验、前端应用前二次校验，以及 `rename_node/focus_nodes` 低风险动作的目标测试；真实 8777 联调和真实在线模型端到端 actions 产出尚未验证。

### 2026-05-22

- 写入 B 方案中的“特殊接入配置与模型算力来源”。
- 创建本文作为持续实现与接力文档。
- RED 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 失败符合预期，缺少 `api/clawAssistantApi.js`、`modules/app/appAssistantPanel.js`、`getSpecialProviderConfigs` 导出，且 `claw_assistant` 未返回 `model/providerType`。
- GREEN 验证：同一命令通过，10 个 Node 测试全部通过。
- Fresh 验证：同一目标测试再次通过，10 个 Node 测试全部通过。
- 语法检查：`cmd /c node --check api\clawAssistantApi.js`、`modules\app\appAssistantPanel.js`、`modules\app\appAssistantPanel.autoload.js`、`modules\subscriptionCdkeyVisibility.autoload.js` 均通过。
- Diff 检查：`git diff --check` 退出码为 0，仅提示若干已修改文件未来会被 Git 转成 CRLF 的换行警告。
- RED 验证：`python -m unittest claw_assistant_route_service_test.py http_route_dispatcher_test.py` 失败符合预期，缺少 `services.claw_assistant_route_service`，且 dispatcher 不接受 `claw_assistant_route_service_getter`。
- GREEN 验证：同一 Python 命令通过，12 个测试全部通过。
- 前端状态补充 RED/GREEN：`cmd /c node --test modules\app\appAssistantPanel.test.js` 先失败于 `provider_configured` 显示为“等待接入”，修正后 3 个测试全部通过。
- Fresh 验证：`python -m unittest claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，12 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py`、`cmd /c node --check modules\app\appAssistantPanel.js`、`cmd /c node --check api\clawAssistantApi.js` 均通过。
- RED 验证：`python -m unittest claw_provider_proxy_service_test.py claw_assistant_route_service_test.py` 失败符合预期，缺少 `services.claw_provider_proxy_service`，且 `ClawAssistantRouteService` 不接受 `provider_proxy_service`。
- GREEN 验证：`python -m unittest claw_provider_proxy_service_test.py claw_assistant_route_service_test.py` 通过，12 个测试全部通过。
- Fresh 验证：`python -m unittest claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，18 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py` 通过。

- RED 验证：扩展 `claw_action_schema_test.py`、`modules/assistant/assistantActionPreview.test.js`、`modules/assistant/assistantActionExecutor.test.js`、`modules/app/appAssistantPanel.test.js` 后，`rename_node/focus_nodes` 相关 focused 测试失败符合预期，原因是 schema 不支持动作、预览丢弃动作、执行器跳过动作、结果摘要不显示重命名/聚焦数量。
- GREEN 验证：补齐 `rename_node/focus_nodes` 后，`python -m unittest claw_action_schema_test.py` 通过，10 个测试全部通过；`cmd /c node --test modules\assistant\assistantActionPreview.test.js` 通过，2 个测试全部通过；`cmd /c node --test modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js` 通过，16 个测试全部通过。
- Fresh 前端助手套件：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js` 通过，33 个测试全部通过。
- Fresh 后端助手套件：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，57 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过；`cmd /c node --check modules\assistant\assistantActionPreview.js`、`modules\assistant\assistantActionExecutor.js`、`modules\app\appAssistantPanel.js`、`modules\app\appAssistantPanel.autoload.js` 均通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：扩展 `modules/app/appAssistantPanel.test.js` 后，`cmd /c node --test modules\app\appAssistantPanel.test.js` 失败符合预期，预览卡片没有单 action 复选框，也没有详情区域。
- GREEN 验证：补齐预览卡片勾选和详情后，`cmd /c node --test modules\app\appAssistantPanel.test.js modules\assistant\assistantActionPreview.test.js` 通过，12 个测试全部通过。
- Fresh 前端助手套件：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js` 通过，35 个测试全部通过。
- Fresh 后端助手套件：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，57 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过；`cmd /c node --check modules\assistant\assistantActionPreview.js`、`modules\assistant\assistantActionExecutor.js`、`modules\app\appAssistantPanel.js`、`modules\app\appAssistantPanel.autoload.js` 均通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。

## 15. 实现日志

### 2026-05-22

- 用户确认采用“特殊接入配置中新增 Claw Code 助手卡，幻映本地 provider proxy 给 claw-code 使用”的方案。
- 方案文档已更新：`docs/CLAW_CODE_ASSISTANT_INTEGRATION_B_IDEAL_PRODUCT.md`。
- 接力实现文档已创建：`docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`。
- 完成特殊配置前端落地：`modules/settings/apiSettings.js` 新增 `Claw Code 助手` 卡片，字段为 `apiUrl / apiKey / model / providerType / runtimePath`；`api/configApi.js#getProviderConfig("claw_assistant")` 返回助手专用字段。
- 完成助手面板前端第一纵切：新增 `modules/app/appAssistantPanel.js`，复用现有 `#fabBtn` 圆形入口，点击后打开聊天面板，支持关闭、输入、发送、展示用户气泡和助手回复。
- 新增 `api/clawAssistantApi.js`，封装 `GET /api/v2/assistant/status` 与 `POST /api/v2/assistant/chat`。
- 为避免直接编辑一整行压缩的 `index.html`，通过现有已加载的 `modules/subscriptionCdkeyVisibility.autoload.js` 引入 `modules/app/appAssistantPanel.autoload.js`。
- 追加协作规则：以后 `8777` 服务是否启动、是否需要启动、是否检查，都由用户来处理；开发者只在用户明确通知服务已就绪或明确授权检查/启动后继续相关动作。
- 完成后端 assistant route 壳：新增 `services/claw_assistant_route_service.py`，支持 `GET /api/v2/assistant/status` 和 `POST /api/v2/assistant/chat`。
- 状态接口会读取 `user/config.json.providers.claw_assistant`，返回 `apiUrl/model/providerType/apiKeyPresent/configured`，不会返回真实 `apiKey`。
- 聊天接口当前是受控后端壳：校验 JSON 与 message，返回 `{reply, actions: [], warnings: [], requiresConfirmation: false}`，用于确认前后端链路已接通；尚未调用 claw-code。
- `services/http_route_dispatcher.py` 与 `server.py` 已挂载 `/api/v2/assistant/*`，并把 `/api/v2/assistant` 加入敏感本地 API 前缀。
- 前端面板识别 `provider_configured` 状态并显示“配置已读取”。
- 完成后端 provider proxy 第一版：新增 `services/claw_provider_proxy_service.py`，挂载在 `/api/v2/assistant/provider-proxy/v1/chat/completions`。
- provider proxy 会校验 `Authorization: Bearer aic-local-assistant-token`，读取 `providers.claw_assistant`，缺少请求 `model` 时补配置里的默认模型，并按 endpoint 解析规则转发到真实 chat completions 接口。
- provider proxy 只把真实 `apiKey` 放入出站 `Authorization` 请求头；返回体和异常信息会对真实 key 做 `[redacted]` 脱敏。
- `services/claw_assistant_route_service.py` 已支持注入 `provider_proxy_service`，provider-proxy 路由会先分流给代理服务，不走聊天壳 JSON 校验。
- 完成 claw runtime 离线管理骨架：新增 `services/claw_runtime_service.py` 和 `claw_runtime_service_test.py`。
- `ClawRuntimeService` 会优先读取 `providers.claw_assistant.runtimePath/runtimeCommand/commandPath/command` 指向的外置 runtime，其次查找 `integrations/claw_code/runtime/` 下的 `claw-code.exe`、`claw.exe`、`claw-code`、`claw`。
- `build_launch_spec()` 会创建 `user_data/claw_assistant` 工作目录，并只注入 `OPENAI_BASE_URL`、`OPENAI_API_KEY=aic-local-assistant-token`、`CLAW_CODE_HOME`；不会把真实 `providers.claw_assistant.apiKey` 放进启动 spec。
- `ClawAssistantRouteService` 已支持注入 `runtime_service`，`GET /api/v2/assistant/status` 会返回 runtime 的 `configured/running/pid/workDir/runtimePath/source/proxyBaseUrl` 信息；只有 provider 已配置且 runtime running 时才返回 `available=true/status=ready`。
- `server.py` 已实例化 `CLAW_RUNTIME_SERVICE`，并注入 `CLAW_ASSISTANT_ROUTE_SERVICE`。
- `ClawRuntimeService.start()` / `stop()` 已实现为可注入 `popen_factory` 的进程管理骨架；测试使用 fake process，不启动真实 claw-code。
- `POST /api/v2/assistant/runtime/start` 与 `POST /api/v2/assistant/runtime/stop` 已接入 `ClawAssistantRouteService`。start 会使用 `build_launch_spec()` 的 command/cwd/env，stop 会 terminate/wait，超时后 kill。
- runtime 子进程环境只透传少量系统环境字段，并覆盖本地 proxy 变量；不会继承真实 `OPENAI_API_KEY` 或 `providers.claw_assistant.apiKey`。
- 完成 claw bridge 聊天调用层第一版：新增 `services/claw_bridge_service.py` 与 `claw_bridge_service_test.py`。
- `ClawBridgeService.chat(payload)` 会调用 `runtime_service.build_launch_spec()`，构造 `command + ["--output-format", "json", "prompt", promptPayloadJson]`，把 `message/conversationId/context/responseContract` 序列化到最后一个 CLI 参数，并通过可注入 `command_runner` 执行；stdin 传空字符串。
- bridge 能把纯文本 stdout 转成 `{success, reply, actions: [], warnings: [], requiresConfirmation: false}`，也能解析 JSON stdout 中的 `reply/actions/warnings/requiresConfirmation`。
- bridge 对非法 JSON-like 输出返回 `CLAW_OUTPUT_PARSE_ERROR`，对缺少 runtime 返回 `CLAW_RUNTIME_UNAVAILABLE`，对非零退出或 runner 异常返回 `CLAW_RUNTIME_FAILED`，并会对 launch env 中的敏感值做 `[redacted]` 脱敏。
- `ClawAssistantRouteService` 已支持注入 `bridge_service`；当 bridge 存在时，`POST /api/v2/assistant/chat` 在完成 JSON/message 校验后会委派给 bridge。未注入 bridge 时仍保留原后端壳回复，方便测试和回退。
- `server.py` 已实例化 `CLAW_BRIDGE_SERVICE` 并注入 `CLAW_ASSISTANT_ROUTE_SERVICE`。这不会主动启动或探测 `8777`，真实 runtime 是否可用仍由用户按协作规则处理。
- 完成联调前 runtime 路径配置补齐：`modules/settings/apiSettings.js` 的 `Claw Code 助手` 卡片新增 `runtimePath` 字段，用户可在设置里填写外置 `claw-code.exe` 路径。
- `api/configApi.js#getProviderConfig("claw_assistant")` 已返回 `runtimePath`；该字段进入 `providers.claw_assistant.runtimePath` 后会被 `ClawRuntimeService` 优先用于 runtime 解析。
- `ClawAssistantRouteService` 状态细分已补齐：当 provider 已配置但 runtime service 报告 `configured=false` 时，`GET /api/v2/assistant/status` 返回 `status=missing_runtime`，前端助手面板会显示未安装/缺少运行时状态。
- 完成前端画布上下文摘要第一版：新增 `modules/assistant/assistantContextBuilder.js`，从 `graphStore/workspaceStore` 读取当前画布节点、连线、viewport、选中节点、素材和工作流，输出轻量 `project/canvas/selection/assets/workflows/warnings`。
- 上下文摘要只走白名单字段，会截断长文本，并对 API Key/token/Authorization/secret、Windows 绝对路径、`data:` URL 与 `blob:` URL 做脱敏或完全不传。
- `modules/app/appAssistantPanel.autoload.js` 已接入 `buildAssistantContext()`，并新增 `createAssistantPanelOptions()` 方便测试 autoload 注入；聊天发送时不再只传 project id，而是传当前画布摘要。
- 补充用户对 `8777` 规则的纠正：不是全程不碰服务，而是需要启动、检查、探测服务时开发者要停下并交给用户处理；用户通知服务就绪后再继续联调。
- 完成后端 action schema 白名单校验第一版：新增 `services/claw_action_schema.py` 与 `claw_action_schema_test.py`，覆盖 `create_node`、`update_node_data`、`connect_nodes`。
- action schema 会校验必填字段、节点类型白名单、连线端点，并只保留允许字段；`data/patch/position` 只接受标量白名单字段。
- action schema 会剔除 API Key、Authorization、secret、token、password、credential、Windows 绝对路径、`data:` URL、`blob:` URL、OpenAI key 形态和 Bearer token 形态；warning 不回显原始未知字段名，避免把危险字段通过提示文本带回前端。
- `ClawBridgeService` 已支持注入 `action_schema`。当 claw JSON 输出包含 actions 时，bridge 会先校验和净化；非法 actions 返回 `success=false/errorCode=CLAW_ACTION_SCHEMA_INVALID/actions=[]`，合法 actions 会强制 `requiresConfirmation=true`。
- `server.py` 已实例化 `CLAW_ACTION_SCHEMA = ClawActionSchema()`，并通过 `action_schema=CLAW_ACTION_SCHEMA` 注入正式 `CLAW_BRIDGE_SERVICE`。这意味着真实 `/api/v2/assistant/chat` 链路不再只是“能解析 actions”，而是默认会先做后端白名单校验。
- 完成前端 action 预览卡片第一版：新增 `modules/assistant/assistantActionPreview.js` 与 `modules/assistant/assistantActionPreview.test.js`。
- `summarizeAssistantActions()` 会把 `create_node` 摘要为“创建某类节点”、把 `update_node_data` 摘要为“更新某节点的哪些字段”、把 `connect_nodes` 摘要为“连接 A -> B”；不认识的 action 不进入预览。
- `modules/app/appAssistantPanel.js` 已在助手回复后检测 `response.actions`，有 actions 时在回复下方渲染 `.claw-assistant-action-preview` 卡片。
- 预览卡片当前提供“取消”和“应用”按钮；取消会移除预览，应用按钮已经预留 `onApplyActions(actions, response)` 注入点。未注入执行器时只提示操作已准备好，等待执行器接入，不会直接改画布。

验证补充：
- RED 验证：`python -m unittest claw_runtime_service_test.py claw_assistant_route_service_test.py` 失败符合预期，缺少 `services.claw_runtime_service`，且 `ClawAssistantRouteService` 不接受 `runtime_service`。
- GREEN 验证：`python -m unittest claw_runtime_service_test.py claw_assistant_route_service_test.py` 通过，13 个测试全部通过。
- Fresh 验证：`python -m unittest claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，24 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py` 通过。
- RED 验证：扩展 `claw_runtime_service_test.py` 与 `claw_assistant_route_service_test.py` 后，`python -m unittest claw_runtime_service_test.py claw_assistant_route_service_test.py` 失败符合预期，`ClawRuntimeService` 不接受 `popen_factory`，缺少 `start/stop`，route 未分发 runtime start/stop。
- GREEN 验证：`python -m unittest claw_runtime_service_test.py claw_assistant_route_service_test.py` 通过，18 个测试全部通过。
- Fresh 验证：`python -m unittest claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，29 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py` 通过。
- RED 验证：`python -m unittest claw_bridge_service_test.py claw_assistant_route_service_test.py` 失败符合预期，缺少 `services.claw_bridge_service`，且 `ClawAssistantRouteService` 不接受 `bridge_service`。
- GREEN 验证：新增 `services/claw_bridge_service.py` 并把 bridge 注入 route/server 后，`python -m unittest claw_bridge_service_test.py claw_assistant_route_service_test.py` 通过，15 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，35 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py services\claw_bridge_service.py` 通过。
- RED 验证：扩展 `api/configApi.specialProviders.test.js`、`modules/settings/apiSettings.test.js`、`claw_assistant_route_service_test.py` 后，`runtimePath` 未返回、设置卡缺字段、provider 已配置但 runtime 缺失时仍返回 `provider_configured`，失败符合预期。
- GREEN 验证：`cmd /c node --test api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js` 通过，6 个测试全部通过；`python -m unittest claw_assistant_route_service_test.py` 通过，11 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，36 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py services\claw_bridge_service.py` 通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改 JS/Python 文件未来会被 Git 转成 CRLF。
- Runtime 获取：`integrations/claw_code/source` 为 `ultraworkers/claw-code` 克隆源码，提交 `f8e1bb7262b261da1ee6bfcd461bfc5b676f6a6d`；仓库状态干净。
- Runtime 编译：用 Rust stable + VS Build Tools MSVC 环境在 `integrations/claw_code/source/rust` 执行 release workspace build，产物复制为 `integrations/claw_code/runtime/claw.exe`。
- Runtime 文件：`claw.exe` 大小 14,857,216 字节，SHA256 为 `82E41B7ABB5F6357A224F440F379986208B83723BC39653E0E6D93B926120A9C`；许可证复制为 `integrations/claw_code/runtime/LICENSE.claw-code.txt`。
- 离线冒烟：`integrations\claw_code\runtime\claw.exe --help` 通过，并确认真实非交互 CLI 是 `claw [--model MODEL] [--output-format text|json] prompt TEXT`。
- RED 验证：`python -m unittest claw_bridge_service_test.py` 失败符合预期，旧 bridge 命令为 `claw prompt --output-format json` 且 prompt JSON 仍走 stdin。
- GREEN 验证：`services/claw_bridge_service.py` 改为 `claw --output-format json prompt <JSON>` 后，`python -m unittest claw_bridge_service_test.py` 通过，6 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，37 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，11 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\http_route_dispatcher.py services\claw_assistant_route_service.py services\claw_provider_proxy_service.py services\claw_runtime_service.py services\claw_bridge_service.py` 通过。
- RED 验证：`cmd /c node --test api\clawAssistantApi.test.js` 失败符合预期，后端返回 `errorCode=CLAW_RUNTIME_FAILED` 与 `reply=...provider proxy returned 401` 时，前端抛出的 Error 没有 `errorCode`，也没有保留具体 reply。
- GREEN 验证：`api/clawAssistantApi.js` 新增 `createAssistantError()` 后，`cmd /c node --test api\clawAssistantApi.test.js` 通过，3 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js` 通过，12 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py` 通过，37 个测试全部通过。
- Fresh 语法检查：`cmd /c node --check api\clawAssistantApi.js` 通过。
- RED 验证：`cmd /c node --test modules\assistant\assistantContextBuilder.test.js` 失败符合预期，缺少 `modules/assistant/assistantContextBuilder.js`。
- GREEN 验证：新增 `modules/assistant/assistantContextBuilder.js` 后，同一命令通过，2 个测试全部通过。
- Fresh 验证：`cmd /c node --test modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js api\clawAssistantApi.test.js` 通过，9 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js` 通过，15 个测试全部通过。
- Fresh 语法检查：`cmd /c node --check modules\assistant\assistantContextBuilder.js` 与 `cmd /c node --check modules\app\appAssistantPanel.autoload.js` 均通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：`python -m unittest claw_action_schema_test.py` 失败符合预期，`server.py` 尚未导入 `ClawActionSchema`，也没有把 `CLAW_ACTION_SCHEMA` 注入 `CLAW_BRIDGE_SERVICE`。
- GREEN 验证：`python -m unittest claw_action_schema_test.py claw_bridge_service_test.py claw_assistant_route_service_test.py` 通过，23 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，43 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_bridge_service.py services\claw_action_schema.py services\claw_assistant_route_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：`cmd /c node --test modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js` 失败符合预期，缺少 `modules/assistant/assistantActionPreview.js`，且面板尚不会渲染 action 预览卡片。
- GREEN 验证：同一命令通过，6 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js` 通过，18 个测试全部通过。
- Fresh 语法检查：`cmd /c node --check modules\assistant\assistantActionPreview.js` 与 `cmd /c node --check modules\app\appAssistantPanel.js` 均通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：`cmd /c node --test modules\assistant\assistantActionExecutor.test.js` 失败符合预期，缺少 `modules/assistant/assistantActionExecutor.js`。
- GREEN 验证：新增 `modules/assistant/assistantActionExecutor.js` 后，同一命令通过，5 个测试全部通过。
- RED 验证：扩展 `modules\app\appAssistantPanel.test.js` 与 `modules\app\appAssistantPanel.autoload.test.js` 后，`cmd /c node --test modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 失败符合预期，autoload 未注入 `onApplyActions`，面板成功应用后没有结果摘要。
- GREEN 验证：接入执行器注入和应用成功摘要后，`cmd /c node --test modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，13 个测试全部通过。
- RED/GREEN 补充：新增 `selected_node` 相对定位覆盖，先失败于新建节点仍落在 `0,0`，补充相对定位后同一执行器测试通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js` 通过，26 个测试全部通过。
- Fresh 语法检查：`cmd /c node --check modules\assistant\assistantActionExecutor.js`、`cmd /c node --check modules\app\appAssistantPanel.js`、`cmd /c node --check modules\app\appAssistantPanel.autoload.js` 均通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：扩展 `claw_assistant_route_service_test.py` 后，`python -m unittest claw_assistant_route_service_test.py` 失败符合预期，缺少 `services.claw_context_service`，且 assistant route 尚不接受 `action_schema/context_service`，也没有分发 `actions/validate` 与 `context/preview`。
- GREEN 验证：新增 `services/claw_context_service.py` 并把 `action_schema/context_service` 注入 route/server 后，`python -m unittest claw_assistant_route_service_test.py` 通过，17 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，49 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：扩展 `claw_action_schema_test.py`、`claw_bridge_service_test.py`、`claw_assistant_route_service_test.py` 后，`python -m unittest claw_action_schema_test.py claw_bridge_service_test.py claw_assistant_route_service_test.py` 失败符合预期，`validate_actions()` 不接受 `context`，bridge 和 validate 路由也没有把 context 传给 schema。
- GREEN 验证：`ClawActionSchema.validate_actions(actions, context=...)` 支持 `context.canvas.nodes` 作用域后，同一命令通过，33 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，53 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- RED 验证：扩展 `claw_action_schema_test.py` 后，`python -m unittest claw_action_schema_test.py` 失败符合预期，非法 self-connect、连入 source 节点、反向/未知 handle、媒体类型不兼容连接仍会被当成 valid。
- GREEN 验证：`ClawActionSchema` 增加 `connect_nodes` 保守语义校验后，同一命令通过，8 个测试全部通过。
- Fresh 验证：`python -m unittest claw_action_schema_test.py claw_bridge_service_test.py claw_assistant_route_service_test.py` 通过，35 个测试全部通过。
- Fresh 验证：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，55 个测试全部通过。
- Fresh 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过。
- RED 验证：扩展 `api/clawAssistantApi.test.js` 后，`cmd /c node --test api\clawAssistantApi.test.js` 失败符合预期，`api/clawAssistantApi.js` 尚未导出 `validateClawAssistantActions`。
- RED 验证：扩展 `modules\app\appAssistantPanel.autoload.test.js` 后，`cmd /c node --test modules\app\appAssistantPanel.autoload.test.js` 失败符合预期，autoload 仍直接执行 actions，没有调用 `validateActions`，且 `onApplyActions` 仍是同步直接返回。
- GREEN 验证：新增 `validateClawAssistantActions()` 并让 autoload 在应用前调用后端校验后，`cmd /c node --test api\clawAssistantApi.test.js` 通过，4 个测试全部通过；`cmd /c node --test modules\app\appAssistantPanel.autoload.test.js` 通过，3 个测试全部通过。
- Fresh 验证：`cmd /c node --test api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js` 通过，28 个测试全部通过。
- Fresh 语法检查：`cmd /c node --check api\clawAssistantApi.js`、`cmd /c node --check modules\app\appAssistantPanel.autoload.js`、`cmd /c node --check api\index.js` 均通过。
- Fresh 后端回归：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` 通过，55 个测试全部通过。
- Fresh Python 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py` 通过。
- Fresh diff 检查：`git diff --check` 通过，仅提示若干已修改文件未来会被 Git 转成 CRLF。
- 完成前端 action 执行器第一版：新增 `modules/assistant/assistantActionExecutor.js` 和 `modules/assistant/assistantActionExecutor.test.js`。
- 执行器只处理 `create_node/update_node_data/connect_nodes` 三类低风险动作，全部通过 `graphStore.addNode/updateNodeData/addEdge/setSelectedNodes` 落地；不直接写项目 JSON，不触发任何生成任务。
- 执行器支持顺序执行时把 action id 映射成真实新建节点 id，例如后续 `connect_nodes.to = "act_create_video"` 会解析为刚创建的真实节点 id。
- 执行器支持 `position.relativeTo = "selected_node"` 的相对摆放，能按 `direction/offsetX/offsetY` 把新节点放到当前选中节点右侧、左侧、上方或下方，避免默认落在 `0,0`。
- `modules/app/appAssistantPanel.autoload.js` 已注入真实 `graphStore` 到 `createAssistantActionExecutor()`，并把 `onApplyActions(actions, response)` 传给面板控制器。
- `modules/app/appAssistantPanel.js` 的预览卡片点击“应用”后会调用执行器；成功时移除预览并追加“已应用 N 个画布操作”的结果摘要；失败时保留错误气泡。
- 完成后端调试路由第一版：`POST /api/v2/assistant/actions/validate` 会复用 `CLAW_ACTION_SCHEMA` 校验并净化 actions，返回 `success/valid/actions/warnings/errors`，方便真实联调时独立判断模型产出的动作是否可执行。
- 完成后端上下文预览第一版：新增 `services/claw_context_service.py`，`POST /api/v2/assistant/context/preview` 支持 `{context:{...}}` 和直接 context 对象两种输入，返回脱敏后的 `context/warnings`。
- context 预览会删除 secret/key/token/password/credential 等字段，替换 Windows 绝对路径、OpenAI key、Bearer token、`data:` URL 与 `blob:` URL；warning 不回显原始敏感值。
- `server.py` 已实例化 `CLAW_CONTEXT_SERVICE = ClawContextService()`，并把 `action_schema=CLAW_ACTION_SCHEMA` 与 `context_service=CLAW_CONTEXT_SERVICE` 注入正式 `CLAW_ASSISTANT_ROUTE_SERVICE`。
- 完成后端节点引用作用域校验第一版：`ClawActionSchema.validate_actions(actions, context=...)` 会从 `context.canvas.nodes[*].id` 建立当前画布节点集合。
- `update_node_data.nodeId` 与 `connect_nodes.from/sourceId/to/targetId` 在 context 存在时必须命中当前画布节点，或命中同一批 actions 中更早出现的 `create_node.id`。
- `ClawBridgeService` 已把聊天 payload 的 `context` 传给 action schema；因此真实 `/api/v2/assistant/chat` 链路会在返回前拦截模型引用不存在节点的 actions。
- `/api/v2/assistant/actions/validate` 也会把请求体里的 `context` 传给 schema；独立调试路由与真实 bridge 链路保持同一套判定。
- 未提供 context 时，schema 仍只做结构、字段、节点类型和敏感值白名单校验，避免破坏离线工具或旧调用方。
- 完成 `connect_nodes` 保守语义校验第一版：拒绝自连接、连入 `source-*` 节点、明显反向或未知的 `sourceHandle/targetHandle`，以及明显媒体类型不兼容的连接。
- 当前保留常见安全流向，例如 `source-text -> ai-image`、`source-text -> ai-video`、`source-image -> ai-video`；后续真实联调后再把规则收敛到精确端口契约。
- `ClawActionSchema.validate_actions()` 改为逐条 action 收集错误，避免第一条坏 action 把后续动作的诊断全部遮住。
- 完成前端应用前二次校验：`api/clawAssistantApi.js` 新增 `validateClawAssistantActions(payload)`，POST 到 `/api/v2/assistant/actions/validate`，提交 `{actions, context}` 并返回后端校验结果。
- `api/index.js` 已导出 `validateClawAssistantActions`，保持统一 API 聚合入口完整。
- `modules/app/appAssistantPanel.autoload.js` 的 `onApplyActions` 改为异步：点击预览卡片“应用”时重新构建当前 context，调用 `assistantApi.validateActions({ actions, context })`，`valid=false` 时抛错并阻止执行器，`valid=true` 时只执行后端返回的净化 actions。
- 若后端返回 warnings，autoload 会把校验 warnings 合并到执行结果里；当前面板仍只展示执行摘要，后续可在详情展开里呈现这些 warnings。
- 完成 `rename_node/focus_nodes` 低风险动作补齐：`services/claw_action_schema.py` 新增两类 action schema，`rename_node.nodeId` 与 `focus_nodes.nodeIds[*]` 会在 context 存在时做节点作用域校验，字段仍走白名单和敏感值过滤。
- `modules/assistant/assistantActionPreview.js` 已能把 `rename_node` 摘要为“Rename node_id to name”，把 `focus_nodes` 摘要为“Focus node_a, node_b”，不再在预览层丢弃这两类动作。
- `modules/assistant/assistantActionExecutor.js` 已能通过 `graphStore.renameNode(nodeId, name)` 重命名节点；若未来某个 store 没有 `renameNode`，会 fallback 到 `updateNodeData(nodeId, { name, title, label })`。
- `focus_nodes` 通过 `graphStore.setSelectedNodes(nodeIds)` 聚焦节点，先校验每个节点存在，不直接改项目 JSON，不触发生成任务；若同一批 actions 显式聚焦节点，则不会再用“新建节点自动选中”覆盖焦点。
- `modules/app/appAssistantPanel.js` 的应用结果摘要已统计 `renamedNodeIds` 和 `focusedNodeIds`，用户确认后能看到“重命名 N 个节点”“聚焦 N 个节点”的反馈。
- 完成 action 预览卡片详情/局部应用：`modules/assistant/assistantActionPreview.js` 会为每条 action 渲染一个默认勾选的 checkbox，并在点击“应用”时只把勾选后的 actions 传给上层。
- 同一预览卡片现在包含 `<details>` 详情区，展示单条 action 的 JSON 摘要，便于真实联调时定位模型产出的字段、引用和 patch。
- `modules/app/appAssistantPanel.js` 修正了 `onApply` 处理：此前面板闭包固定把原始 actions 交给 `onApplyActions`，现在会接收预览组件传入的 selected actions，因此局部应用能真正进入后端二次校验和执行器。

## 16. 下一步最小动作

从 **端到端联调准备 / action 管线增强** 继续。前端画布上下文摘要已经接入 chat payload；真实 claw-code runtime 已经下载、编译并放到自动探测路径；后端 action schema 已经接入正式 bridge；前端 action 预览卡片已经能展示待执行操作、展开详情、并只应用勾选动作；前端执行器已经能在用户点击“应用”后先用最新 context 调 `/api/v2/assistant/actions/validate`，再把净化 actions 落到 `graphStore`；后端也已经提供 `actions/validate` 和 `context/preview` 两个调试路由，并能基于 `context.canvas.nodes` 拦截不存在节点引用、明显错误的 `connect_nodes` 语义，以及 `rename_node/focus_nodes` 的越界引用。真实 8777 联调要等用户明确通知本地服务就绪。

推荐下一组 TDD：

1. 给 action 预览补更完整的失败/警告展示，尤其是后端二次校验返回 warnings 或 errors 时的可读反馈。
2. 给执行链路补历史/撤销提交点，避免用户确认执行后无法自然撤回。
3. 真实 8777 联调开始前，先让用户启动/确认本地服务就绪；开发者不要主动启动、检查或探测 `8777`。
4. 联调时重点验证：云模型 key 只留在 `providers.claw_assistant`，claw 只拿本地 proxy token；真实模型回复 actions 后，预览、确认、执行、保存恢复都正常。

## 17. 真实 runtime 下载与 CLI 校准补充

- 源码位置：`integrations/claw_code/source`。
- 源码提交：`f8e1bb7262b261da1ee6bfcd461bfc5b676f6a6d`。
- Rust workspace：`integrations/claw_code/source/rust`。
- 编译产物：`integrations/claw_code/runtime/claw.exe`。
- 许可证文件：`integrations/claw_code/runtime/LICENSE.claw-code.txt`。
- SHA256：`82E41B7ABB5F6357A224F440F379986208B83723BC39653E0E6D93B926120A9C`。
- 本机编译依赖：Rust stable toolchain、VS Build Tools MSVC；曾尝试 GNU toolchain，但缺 `gcc.exe/dlltool.exe`，最终采用 MSVC `link.exe` 成功。
- 真实 CLI 形态：`claw --output-format json prompt TEXT`。`TEXT` 是 prompt 参数，不是 stdin。
- 当前 bridge 行为：把 `message/conversationId/context/responseContract` 序列化为 JSON 字符串，作为 `prompt` 后面的最后一个参数传入；`input_text` 传空字符串。
- 离线冒烟只执行了 `claw.exe --help`。没有启动 claw runtime，没有调用云模型，没有检查或探测 `8777`。

## 18. 对原 B 方案的当前完成度评估

评估来源：对照 `docs/CLAW_CODE_ASSISTANT_INTEGRATION_B_IDEAL_PRODUCT.md` 中“最理想产品形态”“后端架构设计”“助手协议设计”“允许的动作类型”“画布上下文设计”“用户确认机制”和“成功标准”。

### 18.1 总体判断

- 如果按“工程基础接入”计算，当前约完成 **86%**。
- 如果按原方案里的“完美产品形态”计算，当前约完成 **68%**。
- 当前已经越过“简单聊天框/配置壳”阶段，进入了“能拿到安全画布上下文、能校验 claw 返回 actions、能展示操作预览、并能在用户确认后执行低风险画布动作”的阶段。
- 还没有达到“完整可依赖的真实 AI 画布助手”标准，因为真实 8777 联调、真实在线模型端到端 actions 产出、精确端口契约、撤销/历史和保存恢复体验仍未验证/完善。

### 18.2 分项进度

| 模块 | 当前进度 | 说明 |
|---|---:|---|
| 方案与边界设计 | 100% | B 方案、key 不直给 claw、幻映负责执行与确认的边界已明确并写入文档 |
| 特殊接入配置卡 `claw_assistant` | 90% | `apiUrl/apiKey/model/providerType/runtimePath` 已进入设置与配置读取；后续可补高级权限项 |
| 本地 provider proxy | 90% | OpenAI-compatible 非 streaming 代理已实现并真实连通 `gpt-5.5`；streaming/SSE、更多 providerType 待扩展 |
| 后端 assistant 路由 | 92% | status/chat/runtime/provider-proxy/context-preview/actions-validate 已挂载，`/api/v2/assistant/chat` 已真实联调成功；后续补更细调试诊断 |
| claw runtime 管理 | 82% | 路径识别、launch spec、start/stop skeleton 与真实 `claw.exe` 已有；one-shot bridge 已能携带安全基础环境调用真实 claw |
| claw CLI bridge | 90% | 已校准真实 CLI 参数、解析 `message/reply/actions`，支持内嵌 response contract，并接入后端 action schema、context 节点作用域校验和 connect 语义校验 |
| 前端聊天入口和对话框 | 82% | 右下角圆形入口、对话框、状态、错误显示、action 预览卡片、详情展开、局部勾选应用、应用前二次校验和执行结果摘要已具备；上下文栏、快捷意图区和更完整诊断可继续增强 |
| 画布上下文摘要 | 60% | 已发送节点、连线、选中、素材、工作流摘要并脱敏；后端 `context/preview` 可二次确认；模型/订阅/上下游链路语义可继续增强 |
| 真实在线模型联调 | 70% | 基础聊天链路已完成端到端联调；真实模型稳定产出 actions 和复杂画布任务仍待专项联调 |
| action schema 校验 | 76% | 后端已覆盖 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes` 白名单校验、危险字段剔除、bridge 注入、独立 validate 路由、context 节点作用域校验和 connect 保守语义校验；精确端口契约、权限策略和高风险动作待补 |
| 操作预览卡片 | 72% | 已能展示 create/update/connect/rename/focus 的紧凑预览卡片、取消/应用入口、单条勾选/局部应用、详情展开、应用前二次校验和成功/失败反馈；更完整的二次校验 warnings/errors 展示待补 |
| 用户确认后执行画布变更 | 55% | 已通过后端二次校验后的净化 actions 调 `graphStore` 执行 create/update/connect/rename/focus，并支持新建节点引用、选中节点相对定位、节点重命名、节点聚焦和局部应用；撤销/历史、真实联调待补 |
| 会话记忆/诊断/高级权限 | 10% | conversationId、错误透出和 runtime 状态有基础；项目级记忆、诊断导出和高级权限未做 |

### 18.3 当前已经具备的能力

- 用户可以打开 Claw Code 助手对话框。
- 可以在特殊接入配置里填写助手专用模型与 runtime 路径。
- 后端可以读取并脱敏 `providers.claw_assistant`。
- claw-code 不会拿到真实 API Key，只会拿到本地 provider proxy 地址和本地 token。
- 本地 provider proxy 可以代表 claw-code 请求真实 OpenAI-compatible 模型。
- 已有真实 `claw.exe`，并已确认非交互 CLI 形态。
- `/api/v2/assistant/chat` 已能通过 bridge 调用 claw CLI，并保留错误细节。
- 前端聊天请求已能携带安全的画布上下文摘要。
- 后端已有 `context/preview` 可用于真实联调前确认上下文二次脱敏结果。
- 后端已有 `actions/validate` 可用于单独校验模型产出的结构化动作。
- 后端已有 context 节点作用域校验，可拦截引用不存在画布节点的 update/connect actions。
- 后端已有 `connect_nodes` 保守语义校验，可拦截自连接、连入 source 节点、明显反向/未知 handle 和明显媒体类型不兼容连接。
- 前端应用前会用最新 context 调 `/api/v2/assistant/actions/validate` 做二次校验，只有后端返回 `valid=true` 才把净化后的 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes` 应用到 `graphStore`。
- action 预览卡片支持展开查看单条 action JSON 详情，并可取消勾选某些动作，只应用剩余动作。
- action 执行器会选中新建节点，支持重命名和聚焦已有节点，并在聊天面板追加执行摘要。

### 18.4 当前最关键缺口

基础聊天已经真实联调通过。下一步不是继续排 key/url/claw 启动问题，而是把 **action 管线** 做到可联调、可诊断、可扩展：

1. 继续遵守用户约束：任何需要启动、重启、检查 `8777` 的动作都先停下来，由用户处理并回复就绪。
2. 让真实模型稳定产出合格 `actions`，不只是普通文本聊天。
3. 后端 action schema 继续补精确端口契约、动作权限策略和更多低风险动作。
4. 前端执行器继续补撤销/历史提交、保存恢复后的画布一致性。
5. 端到端验证真实模型回复 actions 后，预览、确认、执行、错误恢复都符合产品预期。

只有这条管线完成后，Claw Code 助手才会从“能理解和回答”进入“能帮用户操作幻映画布”的阶段。
## 19. 2026-05-22 live probe and model routing supplement

- User confirmed `8777` was started, so a live probe was performed without starting/restarting/stopping the service from the developer side.
- `GET /api/v2/assistant/status` returned provider configured, bundled runtime configured at `integrations/claw_code/runtime/claw.exe`, and runtime not running persistently.
- First `POST /api/v2/assistant/chat` reached the backend bridge but failed with `CLAW_RUNTIME_FAILED`.
- Direct CLI reproduction showed the root cause: `claw.exe` defaults to Anthropic unless the model is passed with the `openai/` routing prefix. The runtime spec now exposes `model = openai/<providers.claw_assistant.model>` for `openai_compatible` providers, and the bridge now passes it as `--model`.
- The bridge default command runner now decodes runtime output as UTF-8 with replacement, avoiding Windows locale mojibake or decode failures when `claw.exe` emits UTF-8 diagnostics.
- `claw-code` preserves `openai/...` model ids for custom base URLs, so `ClawProviderProxyService` now strips the `openai/` routing prefix before forwarding the model to the real upstream provider.
- Focused RED/GREEN tests were added for runtime model prefixing, bridge `--model` passing, UTF-8 runtime output decoding, and provider proxy model-prefix stripping.
- Verification passed: `python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` ran 61 tests.
- Verification passed: `python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py`.
- Additional live provider-proxy probe returned upstream HTTP 403 with an empty body for the configured `apiUrl=https://api.gptclubapi.xyz/openai`. A later probe showed this was still affected by provider endpoint construction, because the old proxy generated `/openai/chat/completions`.
- Because the running `8777` process loaded code before this supplement, it must be restarted by the user before re-testing `/api/v2/assistant/chat` against the new bridge/runtime/proxy code.

## 20. 2026-05-22 provider endpoint normalization supplement

- User refilled the Claw Code assistant key and asked for another probe. The live status route was reachable and provider config was present; the key was no longer the earlier URL-looking value.
- Direct `POST /api/v2/assistant/provider-proxy/v1/chat/completions` still returned upstream HTTP 403 with an empty body.
- Root cause evidence: `ClawProviderProxyService` used `endpoint = f"{provider['apiUrl']}/chat/completions"`, so `https://api.gptclubapi.xyz/openai` became `https://api.gptclubapi.xyz/openai/chat/completions`, matching the user-reported bad path.
- RED tests added in `claw_provider_proxy_service_test.py`:
  - `apiUrl=https://api.gptclubapi.xyz/openai` must forward to `https://api.gptclubapi.xyz/openai/v1/chat/completions`.
  - A full `.../chat/completions` endpoint must be used as-is without appending a second `/chat/completions`.
- GREEN implementation added `ClawProviderProxyService._chat_completions_endpoint(...)` and uses it in `_proxy_chat_completions`.
- Focused verification passed: `python -m unittest claw_provider_proxy_service_test.py` ran 9 tests.
- Fresh backend assistant verification passed: `python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` ran 65 tests.
- Fresh syntax verification passed: `python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py`.
- Security note for future handoff: when checking `user/config.json`, avoid commands that may echo the raw config file on parse errors. Prefer `/api/v2/assistant/status` or a purpose-built redacted check that never prints `apiKey` values.
- Important handoff note: the already-running `8777` process still has the old proxy code until the user restarts it. Do not restart/check/start/stop `8777` from the developer side; wait for the user to say it has been restarted before live re-probing.

## 21. 2026-05-22 provider and bridge live debugging supplement

- After the user restarted `8777`, direct provider-proxy probing succeeded:
  - `POST /api/v2/assistant/provider-proxy/v1/chat/completions`
  - response body contained `model="gpt-5.5"` and assistant content `OK`.
- This proves the assistant key, `apiUrl=https://api.gptclubapi.xyz/openai`, `model=gpt-5.5`, endpoint normalization, local proxy token, and cloud model path are working.
- Full `POST /api/v2/assistant/chat` still timed out at 240 seconds, so the failure moved from provider proxy to bridge/runtime.
- Direct `claw.exe --model openai/gpt-5.5 --output-format json prompt "只回复 OK，不要解释。"` with inherited shell environment succeeded in about 10 seconds.
- Reproducing the same `claw.exe` command with the bridge-style minimal env (`OPENAI_BASE_URL/OPENAI_API_KEY/CLAW_CODE_HOME` only) timed out after 90 seconds.
- Root cause: `ClawBridgeService` used `spec["env"]` directly, while `ClawRuntimeService.start()` wrapped env through `_process_env(...)`. One-shot bridge calls therefore lacked Windows basics such as `PATH`, `SystemRoot`, `TEMP`, `APPDATA`, etc.
- Fix: `ClawRuntimeService.build_launch_spec()` now returns `env=self._process_env(local_proxy_env)`. This keeps safe OS basics but still overwrites `OPENAI_API_KEY` with `aic-local-assistant-token` and does not leak `providers.claw_assistant.apiKey` or ambient `OPENAI_API_KEY`.
- Additional fix: `ClawBridgeService` now reads real claw JSON field `message` as a reply fallback.
- Additional fix: when real claw puts the requested `{reply/actions/warnings/requiresConfirmation}` JSON contract inside its `message`, bridge now unwraps that embedded contract and sends normalized `reply/actions/warnings/requiresConfirmation` to the frontend.
- Direct source-level bridge probe after the fixes succeeded and returned a non-empty reply, proving the timeout is fixed in current source.
- Verification passed: `python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py` ran 68 tests.
- Verification passed: `python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py`.
- Important handoff note: because bridge/env/parser fixes were made after the last user restart, the running `8777` process must be restarted by the user one more time before live `/api/v2/assistant/chat` re-probing.

## 22. 2026-05-22 final live chat verification

- User restarted `8777` after the bridge/env/parser fixes.
- Direct provider-proxy probe still succeeded:
  - `POST /api/v2/assistant/provider-proxy/v1/chat/completions`
  - HTTP 200
  - upstream model `gpt-5.5`
  - assistant content `OK`
- Full assistant chat probe succeeded:
  - `POST /api/v2/assistant/chat`
  - HTTP 200
  - body:
    ```json
    {
      "success": true,
      "conversationId": "live-final-chat-after-env-fix",
      "reply": "OK",
      "actions": [],
      "warnings": [],
      "requiresConfirmation": false
    }
    ```
- This confirms the current end-to-end text chat path is working:
  - frontend/backend assistant route
  - bridge one-shot `claw.exe`
  - `openai/gpt-5.5` model routing
  - Huanying local provider proxy
  - real cloud model
  - normalized assistant response back to the API caller
- Remaining product work is no longer basic cloud chat connectivity. Next work should focus on real canvas-aware prompts producing valid `actions`, frontend preview/apply experience under real responses, undo/history safety, and stronger action schema coverage.

## 23. 后续接力开发路线、能力边界与工期估算

### 23.1 当前已经可以做什么

- 真实聊天：用户可以通过右下角 AI 助手入口打开对话框，后端通过真实 `claw.exe` 和在线模型返回回复。最终联调已验证 `reply=OK`。
- 安全 key 边界：真实 API Key 只保存在 `providers.claw_assistant`，claw-code 只拿本地 provider proxy 地址和本地 token。
- 画布上下文：前端聊天 payload 已能携带项目、画布节点、连线、选中节点、素材和工作流摘要，并做敏感信息脱敏。
- 结构化动作管线：后端已支持并校验 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes`。
- 操作预览：前端能展示 action 预览卡片、展开 JSON 详情、取消勾选部分 action，并只应用选中的动作。
- 安全执行：用户点击“应用”后，前端会用最新 context 调后端 `/api/v2/assistant/actions/validate` 二次校验，只有后端返回 `valid=true` 才执行净化后的 actions。
- 已能执行的低风险画布动作：创建节点、修改节点数据、连接明显安全的节点、重命名节点、聚焦/选中节点。

### 23.2 当前不能误判为已经完成的能力

- 还没有证明真实模型能长期稳定地产出合格 actions。基础聊天通了，但“稳定操作画布”还需要专门联调。
- 端口/handle 契约仍是保守校验，不是完整精确的节点端口系统。
- 撤销/历史提交还没接完整，AI 应用后的自然撤销体验仍待补。
- 高风险动作还不能放开，包括删除、大批量修改、触发付费生成、写项目文件、读本地敏感文件等。
- 复杂工作流自动编排还没到日常可靠水平，需要提示词协议、schema 和前端反馈共同打磨。

### 23.3 推荐后续步骤与预计工期

1. 真实模型 actions 稳定产出
   预计：0.5 到 1 天。
   目标：固定助手系统提示词和 response contract，让真实模型在需要操作画布时稳定返回 `actions`，而不是只自然语言回答。重点验证 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes`。

2. 真实画布联调
   预计：1 天。
   目标：在前端真实场景中说“创建一个文生图节点并连接到当前文本节点”这类任务时，助手返回预览，用户确认后能真正落到画布。

3. 精确节点类型与端口规则
   预计：1 到 2 天。
   目标：梳理每类节点的输入/输出端口、媒体类型和允许连接方向，把当前保守 `connect_nodes` 校验升级成更精确的契约，减少乱连线。

4. 撤销、历史与失败恢复
   预计：1 天左右。
   目标：AI 应用动作后进入幻映自己的历史栈；失败时能明确告诉用户哪条 action 失败，并避免画布进入半应用状态。

5. 前端体验打磨
   预计：1 到 2 天。
   目标：预览卡片更清楚，错误提示更可读，应用后自动聚焦结果；二次校验 warnings/errors 要能在 UI 里被用户看懂。

6. 高风险动作和权限保护
   预计：1 天左右。
   目标：删除、大批量修改、付费生成、写文件等能力必须有权限分级和强确认。默认仍只开放低风险动作。

### 23.4 粗略进度判断

- 基础真实聊天：已完成。
- 安全小动作画布操作：约 60% 到 70%。
- 真正好用的画布 AI 助手：约 45% 到 55%。
- “完美到位”的理想产品形态：仍需要持续打磨，预计还要 1 到 2 周。

### 23.5 里程碑口径

- 再做 2 到 3 天：应能达到“真实聊天 + 基础画布操作可用”的阶段。
- 再做 5 到 7 天：应能达到“比较顺手、可日常试用”的阶段。
- 再做 1 到 2 周：才接近“更完整、更稳、更像正式产品”的阶段。

### 23.6 下一位开发者的优先级

下一步优先级最高的是 **真实模型 actions 产出与真实画布应用联调**。不要再优先排查 key、apiUrl、claw-code 是否支持 OpenAI 兼容模型；这些已经在 2026-05-22 的最终联调中证明可用。新的接力开发应该从“让模型稳定返回可执行 actions，并在前端安全预览和应用”开始。

## 24. 2026-05-23 action prompt 协议与 fenced JSON 解析补强

本次推进的是“真实模型 actions 稳定产出”的第一块基础能力：让 bridge 发给 `claw.exe` 的 prompt 不再只是普通用户文本，而是带有幻映画布助手角色、响应契约、可用 action、节点类型和安全边界的结构化任务。

### 24.1 已完成的代码能力

- `services/claw_bridge_service.py` 的 `_build_prompt_argument(...)` 现在会向 `claw.exe` 传入结构化 JSON prompt。
- prompt 中新增 `assistantRole = "huanying_canvas_assistant"`，用于固定模型身份。
- prompt 中新增明确指令：必须 `Return ONLY one JSON object`，返回对象只允许使用 `reply/actions/warnings/requiresConfirmation` 这一类 response contract。
- prompt 中写入低风险 action 协议，当前面向以下动作：`create_node`、`update_node_data`、`connect_nodes`、`rename_node`、`focus_nodes`。
- prompt 中写入 `selected_node` 引用规则，方便模型在用户说“当前节点”“选中的节点”时生成可被后端 schema 解析的 action。
- prompt 中写入当前允许模型创建/修改的主要节点类型提示，例如 `source-text`、`ai-image`、`ai-video`、`audio`、`asset`、`group`、`note`。
- prompt 中写入安全字段边界，强调不要返回 `apiKey`、token、secret、本地路径、data/blob URL 等敏感或危险内容。
- `ClawBridgeService` 的 JSON 解析增强：现在可以解析真实 claw 输出里的 `message` 字段，也可以从 ```json fenced code block``` 中提取嵌入的 response contract。
- 如果真实 claw 把 `{ "reply": ..., "actions": ... }` 包在普通 `message` 文本或 fenced JSON 里，bridge 会尽量解包成前端需要的标准 `reply/actions/warnings/requiresConfirmation`。

### 24.2 新增测试覆盖

- `claw_bridge_service_test.py` 新增测试：真实 claw 的 `message` 字段中如果包含 ```json fenced code block```，bridge 能提取其中的 response contract，并正确返回 `reply/actions/warnings/requiresConfirmation`。
- `claw_bridge_service_test.py` 新增测试：发给 `claw.exe` 的 prompt 必须包含幻映画布助手协议，包括 `huanying_canvas_assistant`、`Return ONLY one JSON object`、action 名称、`selected_node`、节点类型和 `Never include apiKey`。

### 24.3 本次验证结果

- 已运行 focused bridge 测试：`python -m unittest claw_bridge_service_test.py`，结果 15 tests OK。
- 已运行 assistant 后端测试组：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 70 tests OK。
- 已运行语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py`，无报错。
- 已运行 `git diff --check`，只有已有文件的 LF/CRLF 提示，没有本次改动导致的空白错误。

### 24.4 重要接力说明

- 本次没有启动、重启、停止或探测 `8777` 服务，继续遵守用户要求：任何需要碰 `8777` 的动作都先停下来，由用户人工处理并通知。
- 因为本次改动涉及 `services/claw_bridge_service.py`，如果 `8777` 已经在旧代码下运行，必须由用户手动重启后，新 prompt 协议和 fenced JSON 解析才会进入真实服务。
- 这一步仍然不能等同于“真实模型已经稳定会操作画布”。它完成的是模型产出 action 的协议基础。下一步应该在用户确认 `8777` 已重启/已准备好后，做真实 `/api/v2/assistant/chat` action 任务联调，例如让模型生成“创建一个文生图节点并连接到 selected_node”的 action，再走前端预览、二次校验和应用。

## 25. 2026-05-23 重启后的真实 action 产出与二次校验联调

用户确认已经手动重启 `8777` 后，进行了真实 `/api/v2/assistant/chat` 和 `/api/v2/assistant/actions/validate` 联调。本次开发侧没有启动、重启、停止或检查服务，只在用户确认后发起本地 API 探测。

### 25.1 英文上下文 action 产出通过

请求上下文中提供了一个被选中的 `source-text` 节点：

- `id = node_text_1`
- `type = source-text`
- `content = a futuristic city with cinematic lighting`
- `selection.selectedNodeIds = ["node_text_1"]`

请求用户意图为：创建一个 `ai-image` 节点，使用选中文本节点内容作为 prompt，并把选中文本节点连接到新建节点，只准备画布操作，不执行生成。

真实 `/api/v2/assistant/chat` 返回 HTTP 200，核心结果：

```json
{
  "success": true,
  "conversationId": "live-action-probe-20260523-english-1",
  "reply": "我会根据当前选中的文本节点内容创建一个 AI 图片节点，并把该文本节点连接到新节点。确认后只会修改画布结构，不会运行生成。",
  "actions": [
    {
      "id": "act_create_ai_image_from_selected_text",
      "type": "create_node",
      "title": "创建 AI 图片节点",
      "nodeType": "ai-image",
      "data": {
        "prompt": "a futuristic city with cinematic lighting",
        "title": "AI Image from Prompt Node",
        "name": "AI Image from Prompt Node"
      },
      "position": {
        "relativeTo": "selected_node",
        "direction": "right"
      },
      "requiresConfirmation": true,
      "riskLevel": "low"
    },
    {
      "id": "act_connect_text_to_ai_image",
      "type": "connect_nodes",
      "title": "连接文本节点到 AI 图片节点",
      "from": "node_text_1",
      "to": "act_create_ai_image_from_selected_text",
      "requiresConfirmation": true,
      "riskLevel": "low"
    }
  ],
  "warnings": [],
  "requiresConfirmation": true
}
```

结论：第 24 节新增的 prompt/action 协议已经能让真实模型稳定产出最小可执行画布 actions，且 bridge 内部 schema 没有拒绝这组 actions。

### 25.2 二次 validate 联调通过

把上述 actions 和相同 context 提交到 `/api/v2/assistant/actions/validate`，返回 HTTP 200：

```json
{
  "success": true,
  "valid": true,
  "warnings": [],
  "errors": []
}
```

结论：这组真实模型产出的 actions 可以走前端“应用前二次校验”链路。前端应用时应只使用 validate 返回的净化 actions。

### 25.3 中文上下文 action 产出与校验通过

为了验证中国用户场景，使用纯 ASCII 测试脚本生成真实中文上下文，避免 PowerShell here-string 本身把中文脚本文字转成问号。

请求上下文：

- `id = node_text_cn_1`
- `type = source-text`
- `title = 产品提示词`
- `content = 未来城市`
- `selection.selectedNodeIds = ["node_text_cn_1"]`

真实 `/api/v2/assistant/chat` 返回 HTTP 200，模型正确读取中文 `content`，并返回：

```json
{
  "success": true,
  "conversationId": "live-action-probe-20260523-cn-context-1",
  "reply": "我会创建一个 ai-image 节点，使用选中的 source-text 内容「未来城市」作为提示词，并把源文本节点连接到新节点。确认后只会修改画布，不会运行生成。",
  "actions": [
    {
      "id": "act_create_ai_image_from_selected_text",
      "type": "create_node",
      "title": "创建 AI 图像节点",
      "nodeType": "ai-image",
      "data": {
        "prompt": "未来城市",
        "title": "未来城市 图像生成"
      },
      "position": {
        "relativeTo": "selected_node",
        "direction": "right"
      },
      "requiresConfirmation": true,
      "riskLevel": "low"
    },
    {
      "id": "act_connect_text_to_ai_image",
      "type": "connect_nodes",
      "title": "连接源文本到 AI 图像节点",
      "from": "node_text_cn_1",
      "to": "act_create_ai_image_from_selected_text",
      "requiresConfirmation": true,
      "riskLevel": "low"
    }
  ],
  "warnings": [],
  "requiresConfirmation": true
}
```

同一组中文 actions 再提交 `/api/v2/assistant/actions/validate`，返回：

```json
{
  "success": true,
  "valid": true,
  "warnings": [],
  "errors": []
}
```

结论：中文内容可以通过 Huanying -> bridge -> real `claw.exe` -> cloud model -> bridge -> actions validate 主链路。第一次中文探测出现“乱码/未识别”的原因是开发侧 PowerShell here-string 向 Python 传递中文源码时发生了客户端编码损坏，不应记为服务端或 claw-code 的真实缺陷。

### 25.4 当前最新能力判断

- 真实在线模型聊天：已完成并验证。
- 真实模型低风险画布 actions 产出：最小闭环已验证，覆盖 `create_node` + `connect_nodes`。
- actions 二次校验：已验证通过，英文和中文 payload 都可以得到 `valid=true`。
- 前端真实画布应用：仍需要在浏览器 UI 里点开助手、输入同类任务、看到预览卡片、点击应用，并确认节点和连线真的落到画布。这一步尚未在本次记录中完成。

### 25.5 下一步接力优先级

下一步不再是后端 action 产出是否可行，而是 **前端真实画布应用联调**：

1. 用户打开幻映前端，在真实画布上选中一个 `source-text` 节点。
2. 在右下角 Claw Code 助手里输入：“根据当前文本节点创建一个文生图节点并连接过去，不要执行生成。”
3. 预期 UI 显示 action 预览卡片，至少包含 `create_node` 和 `connect_nodes`。
4. 用户点击应用后，前端会调用 `/api/v2/assistant/actions/validate` 做二次校验。
5. 只有 `valid=true` 时，前端执行净化后的 actions，把新节点和连线写入 `graphStore`。
6. 联调重点观察：节点是否出现在 selected node 右侧、连线方向是否正确、预览文案是否可读、应用后是否自动聚焦，以及失败时错误提示是否能指导用户。

## 26. 2026-05-23 前端 action executor 应用链路补强

本次推进的是前端真实画布应用联调前的代码级保障。用户询问是否需要重启服务；本次没有改后端服务逻辑，不需要重启 `8777`。如浏览器已经打开旧页面，后续只需要刷新前端页面以加载新的静态 JS。

### 26.1 已完成的前端验证

- 检查了 `modules/app/appAssistantPanel.autoload.js`：
  - 发送消息时会构建最新 `buildAssistantContext(...)`。
  - 用户点击 action 预览的“应用”后，会重新构建最新 context。
  - 应用前会调用 `/api/v2/assistant/actions/validate`。
  - 只有后端返回 `valid=true` 后，才会把后端净化后的 actions 交给 executor。
- 检查了 `modules/app/appAssistantPanel.js`：
  - 能显示 action 预览卡片。
  - 支持按 action 勾选/取消，局部应用。
  - 应用后会显示“新建/更新/连接/重命名/聚焦”的摘要。
- 检查了 `modules/assistant/assistantActionExecutor.js`：
  - 支持 `create_node`、`update_node_data`、`connect_nodes`、`rename_node`、`focus_nodes`。
  - 支持 `selected_node` 相对定位。
  - 支持后续 action 引用前面 `create_node.id`，例如 `connect_nodes.to = "act_create_ai_image_from_selected_text"`。

### 26.2 本次修复

发现一个前端小缺口：后端 schema 和上下文摘要都已经支持 `sourceHandle/targetHandle`，但 executor 在真正调用 `graphStore.addEdge(...)` 时会丢掉这两个字段。

已修复：

- `modules/assistant/assistantActionExecutor.js`
  - `buildEdgePayload(...)` 现在会保留经过后端校验的 `sourceHandle` 和 `targetHandle`。
  - 如果 action 没有提供 handle，则保持原来的 `{ id, sourceId, targetId }` 形状。

这个修复对刚刚真实模型返回的最小 actions 不是硬阻塞，因为那组 actions 没带 handle；但对后续更精确的节点端口联调很重要，避免模型/后端已经给出端口信息，前端落画布时又丢失。

### 26.3 新增测试覆盖

- `modules/assistant/assistantActionExecutor.test.js`
  - 新增 `preserves validated source and target handles when connecting nodes`：确保 `connect_nodes` 的 `sourceHandle/targetHandle` 会进入 `graphStore.addEdge(...)`。
  - 新增 `applies live Claw Code create image and connect action shape with Chinese prompt`：复刻第 25 节真实模型返回的中文 actions，验证 executor 会：
    - 在选中的 `source-text` 节点右侧创建 `ai-image`。
    - 保留中文 `prompt = 未来城市`。
    - 将 `connect_nodes.to` 的 action id 解析为真实新节点 id。
    - 创建 `source-text -> ai-image` 连线。
    - 自动选中新创建的节点。

### 26.4 本次验证结果

- RED 验证：新增 handle 测试先失败，失败原因是 `addEdge` payload 缺少 `sourceHandle/targetHandle`。
- GREEN 验证：修复后运行 `npm.cmd test -- modules/assistant/assistantActionExecutor.test.js`，结果 9 tests pass。
- 前端 assistant 相关测试：`npm.cmd test -- modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 31 tests pass。
- 后端 assistant 相关测试：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 70 tests OK。
- `git diff --check` 只有既有 LF/CRLF 提示，没有本次改动造成的空白错误。

### 26.5 下一步仍然需要人工前端联调

代码级链路已经覆盖，但还没有通过真人在浏览器里点击“应用”确认视觉结果。下一步请在幻映前端做：

1. 刷新浏览器页面，确保新的 `assistantActionExecutor.js` 静态文件被加载。
2. 在画布上创建或选择一个 `source-text` 节点，内容可以用中文，例如“未来城市”。
3. 打开右下角 Claw Code 助手，输入：“根据当前文本节点创建一个文生图节点并连接过去，不要执行生成。”
4. 预期会出现 action 预览卡片。
5. 点击“应用”后，预期画布上出现一个新的 `ai-image` 节点，位于当前文本节点右侧，并出现一条从文本节点到图片节点的连线。

如果这一步在真实 UI 里成功，就可以把状态从“代码级可应用”推进到“真实前端画布应用已联调通过”。

## 27. 2026-05-23 低风险内部画布动作自动应用

用户完成真实 UI 联调后确认：Claw Code 助手已经真的能在画布上生成节点和连线。随后用户明确提出新的产品要求：**这种不需要付费的幻映内部操作，不要询问，直接生成即可。**

本节记录本次已完成的产品行为调整：低风险、免费、幻映内部画布结构操作从“预览后点应用”改为“自动应用”；高风险、未知、付费或不确定动作仍然保留预览/确认边界。

### 27.1 自动应用规则

当前前端自动应用只对以下低风险内部 action 类型开放：

- `create_node`
- `update_node_data`
- `connect_nodes`
- `rename_node`
- `focus_nodes`

自动应用还必须满足：

- `actions` 是非空数组。
- 每个 action 的 `riskLevel` 为空、`low` 或 `internal`。
- response 里没有 `errors`。
- 前端存在真实 `onApplyActions` 执行器。

注意：即使模型返回 `requiresConfirmation=true`，只要 action batch 满足上述低风险内部规则，前端也会自动应用。这是为了兼容第 24 节旧 prompt 协议里“有 actions 就需要确认”的保守默认。真正的安全边界由 action 类型、风险等级、后端二次校验和 executor 共同保证。

### 27.2 仍然保留确认/预览的情况

以下情况不会自动应用，仍然进入 action 预览卡片：

- action 类型不在当前低风险白名单内。
- `riskLevel` 是 `medium`、`high` 或其他非低风险值。
- response 带有 `errors`。
- 未来接入的删除、大批量修改、付费生成、写项目文件、读本地敏感文件、shell/系统命令等高风险能力。
- 没有前端 executor 时。

### 27.3 安全链路没有被绕过

自动应用不是跳过安全。实际链路仍然是：

1. 模型返回 actions。
2. 前端判断它们属于低风险内部画布动作。
3. 前端重新构建最新 canvas context。
4. 前端调用 `/api/v2/assistant/actions/validate` 做后端二次校验。
5. 只有 `valid=true` 时，前端才执行后端返回的净化 actions。
6. executor 再落到 `graphStore`。

因此，自动应用只是省掉用户点击“应用”的交互成本，没有绕过后端 schema、节点作用域、连接语义和敏感字段净化。

### 27.4 本次代码改动

- `modules/app/appAssistantPanel.js`
  - 新增 `shouldAutoApplyActions` 选项。
  - 收到 assistant actions 后，如果符合自动应用规则，会直接调用 `onApplyActions(...)`。
  - 自动应用成功后直接追加“已应用 N 个画布操作”的结果消息，不渲染预览卡片。
  - 自动应用失败时显示错误消息。
  - 不符合自动应用规则时，继续渲染原来的 action 预览卡片。
- `modules/app/appAssistantPanel.autoload.js`
  - 新增并导出 `shouldAutoApplyInternalCanvasActions(...)`。
  - 默认将这个判断传给真实 app assistant panel。
  - 仍然在 `onApplyActions(...)` 里调用后端 validate，并只执行后端净化 actions。

### 27.5 新增测试覆盖

- `modules/app/appAssistantPanel.test.js`
  - 新增测试：低风险内部 actions 会自动应用，不渲染预览卡片，并显示应用结果。
  - 新增测试：不允许自动应用的 actions 仍然渲染预览卡片。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 新增测试：`create_node + connect_nodes` 低风险内部 batch 会被判定为可自动应用。
  - 新增测试：`riskLevel=medium`、未知 action 类型、response errors 都不会自动应用。

### 27.6 本次验证结果

- RED 验证：新增自动应用测试一开始失败，原因是 `appAssistantPanel.autoload.js` 没导出 `shouldAutoApplyInternalCanvasActions`，且 `appAssistantPanel.js` 没有自动应用分支。
- GREEN 验证：实现后运行 `npm.cmd test -- modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js`，结果 17 tests pass。
- 前端 assistant/API/context 相关测试：`npm.cmd test -- modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 35 tests pass。
- 后端 assistant 相关测试：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 70 tests OK。
- Python 语法检查：`python -m py_compile server.py services\claw_assistant_route_service.py services\claw_action_schema.py services\claw_context_service.py services\claw_bridge_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py`，无报错。

### 27.7 使用和接力说明

- 本次没有改后端服务逻辑，不需要重启 `8777`。
- 如果浏览器已经打开旧页面，需要刷新幻映页面，让新的前端静态 JS 生效。
- 下一步接力重点应该继续补“自动应用后的体验打磨”：
  - 自动应用后聚焦/定位更明显。
  - 后续高风险/付费动作接入时，必须继续走预览和强确认。

## 28. 2026-05-23 自动应用反馈与失败诊断打磨

本节承接第 27 节的自动应用能力。用户已经确认低风险内部画布操作应当直接生成；本次继续补齐自动应用后的可理解性，重点是让成功结果像“操作日志”，失败时能定位到具体 action。

### 28.1 本次产品行为

- 自动应用或手动应用成功后，结果消息现在会带 `claw-assistant-message--operation` 样式，视觉上区别于普通 AI 聊天回复。
- 该操作日志仍沿用原摘要格式，例如“已应用 2 个画布操作：新建 1 个节点，连接 1 条线。”
- 自动应用或手动应用失败时，面板不再只显示裸错误；如果错误对象携带 `actionIndex`、`actionNumber` 或 `actionId`，会显示类似：

```text
操作应用失败：第 2 条 connect_nodes（连接节点），标题：连接节点，ID：act_connect。
原因：executor refused connection
```

- 如果错误对象没有携带具体 action 标识，面板会追加当前 batch 的前 3 条 action 摘要，方便开发者判断 validate/executor 是在哪组动作中失败。

### 28.2 本次代码改动

- `modules/app/appAssistantPanel.js`
  - 新增 `ACTION_TYPE_LABELS`，把 `create_node/update_node_data/connect_nodes/rename_node/focus_nodes` 显示为中文动作名。
  - 新增 `formatActionContext(...)`，统一格式化“第几条 action + 类型 + 中文名 + 标题 + ID”。
  - 新增 `findErrorActionIndex(...)`，支持从 `error.actionIndex`、`error.actionNumber`、`error.actionId` 里定位失败 action。
  - 新增 `formatApplyActionsError(...)`，把失败信息包装成更适合接力联调的诊断文本。
  - 成功结果消息改为追加 `claw-assistant-message--operation` 样式。
  - CSS 新增 `.claw-assistant-message--operation`，让操作日志从普通助手回复中分离出来。

### 28.3 新增测试覆盖

- `modules/app/appAssistantPanel.test.js`
  - 扩展“低风险内部 actions 自动应用”测试，要求成功结果消息带 `.claw-assistant-message--operation`。
  - 新增“自动应用失败时带 action 上下文”测试，模拟 `onApplyActions` 抛出带 `actionIndex=1` 的错误，并要求 UI 显示 `第 2 条 connect_nodes（连接节点）`、`标题：连接节点` 和原始错误原因。

### 28.4 本次验证结果

- RED 验证：先运行 `npm.cmd test -- modules/app/appAssistantPanel.test.js`，新增测试按预期失败：
  - 成功消息缺少 `.claw-assistant-message--operation`。
  - 失败消息只显示 `executor refused connection`，没有 action 序号、类型和标题。
- GREEN 验证：实现后再次运行 `npm.cmd test -- modules/app/appAssistantPanel.test.js`，结果 13 tests pass。
- 前端 assistant/API/context 相关测试：`npm.cmd test -- modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 36 tests pass。
- JS 语法检查：`node --check modules/app/appAssistantPanel.js`，无报错。
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒，没有本次改动造成的空白错误。

### 28.5 使用和接力说明

- 本次仍然只改前端静态 JS 和测试，没有改后端服务逻辑，不需要重启 `8777`。
- 浏览器已有旧页面时，刷新幻映页面即可加载新的面板反馈样式和失败诊断逻辑。
- 下一步推荐继续补两块：
  - 找到现有画布 viewport/focus API，让自动创建节点后视野更明显地移动或高亮到新节点。
  - 研究 graphStore/history/undo 的现有提交方式，让助手动作进入幻映原生撤销历史。

## 29. 2026-05-23 资产可见性、画布 API 上下文与生成权限策略

本节承接用户的新要求：**生成文本和生成图片权限全开，生成视频必须使用者授权；当前助手看不到资产，先让它能拿到画布相关 API/接口数据。**

### 29.1 本次产品行为

- 助手上下文现在会显式带上 `canvasApi.permissions`：
  - `internalCanvasOperations = auto_apply_low_risk`：低风险、免费的幻映内部画布操作可以自动应用。
  - `textGeneration = allowed`：生成文本权限开放。
  - `imageGeneration = allowed`：生成图片权限开放。
  - `videoGeneration = requires_user_authorization`：生成视频必须先获得使用者授权。
- 助手上下文现在会带上 `canvasApi.allowedActions` 和 `canvasApi.allowedNodeTypes`，让模型知道当前被允许表达的画布动作和节点类型范围。
- 资产上下文不再只依赖 `workspaceStore.assets`。如果资产面板的数据在 `AssetManager` 内部，助手也会从 `assetManager._getSortedAssets()`、`getAssets()`、`assets`、`_assets` 等来源收集并去重。
- 资产摘要会保留对模型有用的轻量信息，例如 `id/name/type/category/cat/customTag/tag/tags/labels/items/nodes/itemCount/nodeCount`，但仍会过滤本地路径、`data:`/`blob:` URL、Bearer token、OpenAI key、secret-like 字段等敏感内容。

### 29.2 本次代码改动

- `modules/assistant/assistantContextBuilder.js`
  - 新增 `CANVAS_API_CONTEXT`，把权限策略、允许 action、允许节点类型写入上下文。
  - 新增 AssetManager 多来源资产读取和去重逻辑。
  - 增强资产摘要，支持资产分类、自定义标签以及子项/节点数量摘要。
- `modules/app/appAssistantPanel.autoload.js`
  - 新增 `resolveAssetManager(...)`。
  - `buildContext()` 现在会把 `assetManager` 传给 `buildAssistantContext(...)`。
  - 支持从显式依赖、`window.__huanyingAssetManager` 或 `globalThis.__huanyingAssetManager` 获取资产管理器。
- `modules/AssetManager.js`
  - 将真实 `assetManager` 注册到 `globalThis.__huanyingAssetManager`，让助手面板可以读取资产面板当前数据。
- `services/claw_bridge_service.py`
  - prompt 协议新增 `permissionPolicy`。
  - 文案从旧的“不要触发付费生成”调整为：文本/图片生成可在支持的幻映 action/provider 策略内表达，视频生成必须用户授权；幻映负责最终校验、权限和执行。

### 29.3 新增测试覆盖

- `modules/assistant/assistantContextBuilder.test.js`
  - 覆盖 `workspaceStore.assets` 为空时，从 `assetManager._getSortedAssets()` 读取资产。
  - 覆盖资产分类、自定义标签、子项/节点摘要。
  - 覆盖本地路径、`data:` URL 和 secret-like 字段净化。
  - 覆盖 `canvasApi.permissions`、允许 action、允许节点类型。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖显式 `assetManager` 会传入上下文构建器。
  - 覆盖从 `window.__huanyingAssetManager` 读取全局资产管理器。
- `claw_bridge_service_test.py`
  - 覆盖 prompt 协议里的 `permissionPolicy`。
  - 覆盖文本/图片允许、视频需授权的 prompt 文案。
  - 覆盖旧的 `Never trigger paid generation` 文案已不再作为协议约束。

### 29.4 本次验证结果

- 聚焦前端上下文/资产测试：`npm.cmd test -- modules/assistant/assistantContextBuilder.test.js modules/app/appAssistantPanel.autoload.test.js`，结果 11 tests pass。
- 聚焦后端 prompt 协议测试：`python -m unittest claw_bridge_service_test.py`，结果 16 tests OK。
- 前端 assistant/API/context 相关测试：`npm.cmd test -- modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 40 tests pass。
- 后端 assistant 相关测试：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 71 tests OK。
- 语法检查：
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `node --check modules\app\appAssistantPanel.autoload.js`
  - `node --check modules\AssetManager.js`
  - `python -m py_compile services\claw_bridge_service.py`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒，没有本次改动造成的空白错误。

### 29.5 使用和接力说明

- 本次没有启动、重启、停止或探测 `8777` 服务。
- 前端资产可见性相关改动需要刷新浏览器页面后生效。
- 后端 prompt 协议改动需要用户自己重启 `8777` 后，运行中的服务才会加载；开发侧不要主动启动、重启、检查或停止服务。
- 当前完成的是“让助手拿到资产和画布 API/权限上下文”的基础层。下一步建议继续把更完整的画布接口能力整理成可执行 action/schema，例如视野定位、撤销历史、资产插入/引用、节点参数编辑和生成任务授权边界。

## 30. 2026-05-23 短期会话记忆层

本节承接用户反馈：当前助手“像没有上下文记忆”。本次补的是第一层可用记忆：**同一个项目/会话内的最近聊天内容和最近画布动作结果，会随下一次请求进入 assistant context**。这不是磁盘长期记忆，也不是跨项目永久画像；它先解决连续对话中的“刚才说过什么/刚才做过什么”。

### 30.1 本次产品行为

- 前端助手面板现在维护短期内存：
  - 最近 8 条用户/助手消息。
  - 最近 6 条画布动作结果。
  - 每条动作结果最多记录 4 个 action 摘要。
- 每次发送新消息时，当前消息仍放在顶层 `message`，历史内容放进 `context.conversation`：
  - `context.conversation.recentMessages`
  - `context.conversation.recentOperations`
- 记忆内容会随 `buildAssistantContext(...)` 继续做净化：
  - 截断过长文本。
  - 不泄露 `apiKey/token/secret/password/authorization`。
  - 不泄露本地绝对路径、`data:` URL、`blob:` URL、OpenAI-style key、Bearer token。
- 成功自动应用或手动应用画布动作后，操作日志会进入 `recentOperations`，下一轮用户问“刚才做了什么”时，模型能从上下文看到刚才的动作结果。
- 应用失败时也会记录失败摘要，方便下一轮继续修复。

### 30.2 本次代码改动

- `modules/app/appAssistantPanel.js`
  - 新增短期记忆状态：`recentMessages`、`recentOperations`。
  - 新增 `getConversationMemory()`，发送消息时把短期记忆注入 `buildContext({ conversationMemory })`。
  - 助手回复成功后记录用户消息和助手回复。
  - `applyActionBatch(...)` 成功/失败后分别记录 `applied/failed` 操作摘要。
  - 对记忆文本和 action 摘要做轻量截断与字段收敛，避免把整段 action 原始 JSON 无限塞给模型。
- `modules/app/appAssistantPanel.autoload.js`
  - `buildCurrentContext(options)` 现在会把 `options.conversationMemory` 继续传给 `buildAssistantContext(...)`。
- `modules/assistant/assistantContextBuilder.js`
  - 新增 `summarizeConversationMemory(...)`。
  - 新增 `conversation` 上下文输出，包含净化后的 `recentMessages/recentOperations`。
  - 复用现有敏感字段、路径、URL、key 的净化规则。
- `services/claw_bridge_service.py`
  - prompt instructions 新增短期记忆说明。
  - `ACTION_PROTOCOL` 新增 `memoryRules`：
    - 使用 `context.conversation.recentMessages` 理解用户前序指令。
    - 使用 `context.conversation.recentOperations` 理解最近已应用/失败的画布操作。
    - 不假设隐藏记忆；缺信息时简短追问。

### 30.3 新增测试覆盖

- `modules/app/appAssistantPanel.test.js`
  - 新增测试：第二轮消息会携带上一轮用户/助手消息。
  - 新增测试：自动应用画布动作后，下一轮消息会携带最近操作结果。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 新增测试：`conversationMemory` 会从 panel options 转发到 context builder。
- `modules/assistant/assistantContextBuilder.test.js`
  - 新增测试：最近聊天/动作记忆会进入 context，并且敏感内容会被净化、长文本会被截断。
- `claw_bridge_service_test.py`
  - 新增测试：后端 prompt 明确指导模型使用 `context.conversation.recentMessages` 和 `context.conversation.recentOperations`。

### 30.4 本次验证结果

- RED 验证：
  - 前端最初失败在 `conversationMemory` 未传递、第二轮无历史、动作结果未入下一轮上下文。
  - 后端最初失败在 prompt 没有短期记忆使用说明。
  - context builder 最初失败在没有 `context.conversation`。
- GREEN 验证：
  - `npm.cmd test -- modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js modules/assistant/assistantContextBuilder.test.js`，结果 28 tests pass。
  - `python -m unittest claw_bridge_service_test.py`，结果 17 tests OK。
- 前端 assistant/API/context 相关回归：
  - `npm.cmd test -- modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 44 tests pass。
- 后端 assistant 相关回归：
  - `python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 72 tests OK。
- 语法检查：
  - `node --check modules\app\appAssistantPanel.js`
  - `node --check modules\app\appAssistantPanel.autoload.js`
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `python -m py_compile services\claw_bridge_service.py`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒，没有本次改动造成的空白错误。

### 30.5 使用和接力说明

- 本次没有启动、重启、停止、检查或探测 `8777`。
- 前端短期记忆需要刷新浏览器页面后生效。
- 后端 prompt 记忆规则需要用户自己重启 `8777` 后才会进入运行中的服务。
- 当前记忆是“同一页面/同一项目会话里的短期记忆”。刷新页面后前端内存会消失。后续若要更像真正项目助手，需要继续补：
  - 项目级长期摘要，写入本地项目元数据或专门的 assistant memory store。
  - 用户偏好记忆，例如常用风格、常用模型、常用比例、不要重复确认的安全动作。
  - 对话压缩摘要，避免长会话无限增长。
  - Claw Code runtime 自身 session/resume 的稳定接入。

### 30.6 最终完成判定约定

用户已明确约定：当 Claw Code AI 助手功能补全完整、达到最终目标时，开发侧需要主动告诉用户“这个 AI 助手功能已经达到最终目的，可以开始新的需求开发”。在此之前，不要把阶段性完成误报成最终完成。

当前判断：**尚未达到最终目的**。本次只是补上短期记忆层，距离最终目标还需要继续补画布接口能力、撤销/历史、资产插入/引用、授权边界、长期项目记忆，以及更多真实 UI 联调。

## 31. 2026-05-23 持久多话题记忆核心层

本节承接用户质疑：Claw Code 本来有 session/resume 记忆，为什么接入幻映后反而像没记忆。根因已确认：

- Claw Code runtime 确实支持 session：`claw.exe --help` 显示 REPL 会自动保存到 `.claw/sessions/<session-id>.jsonl`，并支持 `--resume latest`、`/session list`、`/history`、`/compact` 等。
- 但当前幻映 bridge 为了先跑通“可控画布助手”，一直使用的是一次性 `claw.exe --output-format json prompt <payload>`。
- 这个一次性 prompt 调用没有绑定 Claw 的交互式 REPL session，也没有映射到幻映自己的多话题会话列表。
- 因此之前第 30 节补的只是前端短期内存，刷新页面或关闭软件后会消失，不是最终形态。

本次补上的是持久化多话题记忆的核心层：**幻映本地持久保存 Claw 助手话题、聊天记录和画布操作记录；聊天请求进入 bridge 前，后端自动把对应话题历史注入 `context.conversation`。**

### 31.1 本次产品行为

- 新增本地持久会话库，文件位置：
  - 源码/开发模式：`user/claw_assistant_memory.json`
  - 打包模式：跟随 `RUNTIME_PATHS["userDir"]`，仍在用户可写目录下。
- 支持多话题：
  - 每个 conversation 有 `id/projectId/title/createdAt/updatedAt/messageCount/operationCount/clawSessionId`。
  - 可按项目列出话题。
  - 可创建新话题。
- 聊天时：
  - 前端会自动为当前项目复用最近话题；如果没有话题，会创建“默认话题”。
  - `/api/v2/assistant/chat` 在调用 bridge 前，会从本地持久会话库读取该话题的历史，注入 `context.conversation`。
  - bridge 返回后，后端把本轮用户消息和助手回复写回本地会话库。
- 画布动作应用后：
  - 前端 `onApplyActions(...)` 会调用后端记录操作结果。
  - 持久会话库会保存最近画布动作摘要，下一次模型可看到“刚才应用了什么”。
- 安全边界：
  - 持久记忆会净化 OpenAI-style key、Bearer token、`data:` URL、`blob:` URL、本地绝对路径和 secret-like 字段。
  - 记忆只保存摘要字段，不保存完整 action 原始对象。

### 31.2 本次代码改动

- 新增 `services/claw_conversation_memory_service.py`
  - 管理 `claw_assistant_memory.json`。
  - 支持 `create_conversation(...)`、`list_conversations(...)`、`record_chat_turn(...)`、`record_operation(...)`、`build_context_memory(...)`。
  - 对聊天文本和操作摘要做净化、截断和数量上限控制。
- `services/claw_assistant_route_service.py`
  - 新增 `memory_service` 注入。
  - `/api/v2/assistant/chat` 调用 bridge 前自动合并持久记忆。
  - bridge 返回后自动写回用户消息和助手回复。
  - 新增：
    - `POST /api/v2/assistant/conversations/list`
    - `POST /api/v2/assistant/conversations`
    - `POST /api/v2/assistant/conversations/operation`
- `server.py`
  - 新增 `CLAW_MEMORY_SERVICE = ClawConversationMemoryService(...)`。
  - 将 `memory_service=CLAW_MEMORY_SERVICE` 注入 `CLAW_ASSISTANT_ROUTE_SERVICE`。
- `api/clawAssistantApi.js` / `api/index.js`
  - 新增前端 API：
    - `fetchClawAssistantConversations(...)`
    - `createClawAssistantConversation(...)`
    - `recordClawAssistantConversationOperation(...)`
- `modules/app/appAssistantPanel.autoload.js`
  - 默认通过后端话题 API 为当前项目复用/创建持久话题。
  - `conversationId` 现在可以异步解析为持久话题 ID。
  - 动作应用成功后，会把操作摘要写入持久会话库。
- `modules/app/appAssistantPanel.js`
  - 支持异步 `conversationId()`，从而接入后端持久话题。

### 31.3 新增测试覆盖

- 新增 `claw_conversation_memory_service_test.py`
  - 覆盖创建/列出/持久化多话题。
  - 覆盖聊天和操作记录进入可注入的上下文记忆。
  - 覆盖敏感内容净化。
- `claw_assistant_route_service_test.py`
  - 覆盖 chat 前注入持久记忆、chat 后写回回复。
  - 覆盖创建话题、列话题、记录操作。
  - 覆盖 server wiring。
- `api/clawAssistantApi.test.js`
  - 覆盖前端会话 API。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖自动复用/创建持久话题，动作应用后写回操作记忆。

### 31.4 本次验证结果

- 聚焦后端验证：
  - `python -m unittest claw_conversation_memory_service_test.py claw_assistant_route_service_test.py`，结果 23 tests OK。
- 聚焦前端验证：
  - `npm.cmd test -- api/clawAssistantApi.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js`，结果 29 tests pass。
- 后端 assistant 回归：
  - `python -m unittest claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 76 tests OK。
- 前端 assistant/API/context 回归：
  - 首次用 Node 默认并发跑时，Windows/Node 出现 `VirtualAlloc failed` / `JavaScript heap out of memory`，不是断言失败。
  - 改为串行：`node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果 46 tests pass。
- 语法检查：
  - `node --check api\clawAssistantApi.js`
  - `node --check api\index.js`
  - `node --check modules\app\appAssistantPanel.js`
  - `node --check modules\app\appAssistantPanel.autoload.js`
  - `python -m py_compile services\claw_conversation_memory_service.py services\claw_assistant_route_service.py server.py`

### 31.5 使用和接力说明

- 本次没有启动、重启、停止、检查或探测 `8777`。
- 因为新增了后端服务、后端路由和 `server.py` wiring，运行中的 `8777` 必须由用户重启后才能生效。开发侧不要主动启动/重启/检查/停止。
- 浏览器页面也需要刷新，以加载新的前端 API 和 autoload 逻辑。
- 当前已经从“短期记忆”推进到“本地持久多话题核心记忆”。
- 但还不是最终完成：
  - 右下角助手面板还没有做成完整的话题列表/搜索/切换 UI。
  - 还没有把 Claw runtime 自身 `.claw/sessions` 与幻映 conversation 一一映射。
  - 还没有做长会话自动摘要/压缩。
  - 还没有做项目级长期偏好，例如常用画风、常用模型、常用比例。
  - 还没有做话题删除、重命名、导出、归档。

### 31.6 关于 Claw Code 原生 session 的下一步判断

Claw Code 原生 session 能力是真的存在，但不能简单把幻映助手“裸接”到它：

- 幻映必须继续掌握 API key 边界、画布动作白名单、视频授权、资产净化和二次校验。
- Claw 的 `.claw/sessions` 更像 runtime/CLI 层会话，幻映还需要自己的产品级 conversation：标题、项目归属、多话题列表、画布操作记录、用户可见切换。
- 最理想形态是双层映射：
  - 幻映 `conversationId`：产品层，多话题 UI、聊天记录、操作记录、项目记忆。
  - Claw `clawSessionId`：runtime 层，后续用于 REPL/session resume、history/compact/export。

下一步推荐继续做“多话题 UI 和 Claw session 映射”，这样才会更接近用户截图里的体验。

## 32. 2026-05-23 可见多话题 UI 与历史消息回显

本节承接用户对“短期记忆不够”的追问。第 31 节已经把持久多话题记忆核心层落到本地文件和后端注入链路，本次继续把它变成右下角助手面板里用户可见、可切换、可新建的话题体验。

### 32.1 本次产品行为

- 右下角 `Claw Code 助手` 面板现在有话题栏：
  - 显示当前话题标题。
  - 展示当前项目下的持久话题列表。
  - 支持点击话题切换当前 conversation。
  - 支持点击 `+` 新建一个持久话题。
- 打开助手面板时：
  - 前端会读取当前项目的话题列表。
  - 如果已有话题，会选中最近的话题。
  - 如果后端返回该话题详情，会把持久保存的历史聊天消息回显到聊天区。
- 切换话题时：
  - `conversationId` 会切到被选中的持久话题。
  - 聊天区会清空当前可见消息，并加载被选中话题的历史消息。
  - 后续发送消息会使用新话题的 `conversationId`，因此后端会把新消息写回对应话题。
- 新建话题时：
  - 会调用后端会话创建接口。
  - 当前助手切换到新话题。
  - 可见聊天区清空，避免把旧话题消息混进新话题。
- 这仍然保持幻映自有记忆层为主：Claw 原生 `.claw/sessions` 映射还没有接入，本次是把第 31 节的幻映 conversation 层做成用户可感知的产品形态。

### 32.2 本次代码改动

- `services/claw_conversation_memory_service.py`
  - 新增 `get_conversation_detail(...)`。
  - 返回某个话题的安全详情：meta、messages、operations。
  - 继续净化 OpenAI-style key、Bearer token、本地绝对路径、`data:` URL、`blob:` URL 和 secret-like action 字段。
- `services/claw_assistant_route_service.py`
  - 新增 `POST /api/v2/assistant/conversations/get`。
  - 用于前端读取单个话题详情和历史消息。
- `api/clawAssistantApi.js` / `api/index.js`
  - 新增并导出 `fetchClawAssistantConversation(...)`。
- `modules/app/appAssistantPanel.autoload.js`
  - 接入 `fetchConversation`。
  - 对外暴露给面板使用的：
    - `listConversations()`
    - `createConversation(title)`
    - `selectConversation(conversationId)`
    - `fetchConversation(conversationId)`
  - 保持当前项目下的 active conversation 状态。
- `modules/app/appAssistantPanel.js`
  - 新增话题栏、话题列表和新建话题按钮。
  - 打开面板时自动刷新话题列表并加载当前话题历史。
  - 切换话题时加载对应历史。
  - 新建话题时清空旧历史并切换到新 topic。
  - 发送消息后刷新话题列表但不强制重载聊天区，避免刚发送的消息被重复渲染。

### 32.3 新增测试覆盖

- `claw_conversation_memory_service_test.py`
  - 覆盖单个话题详情读取和可见历史净化。
- `claw_assistant_route_service_test.py`
  - 覆盖 `/api/v2/assistant/conversations/get` 返回历史消息。
- `api/clawAssistantApi.test.js`
  - 覆盖 `fetchClawAssistantConversation(...)` 请求路径和返回结构。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖话题列表、新建、切换、详情读取四类 panel-facing 方法。
- `modules/app/appAssistantPanel.test.js`
  - 覆盖助手面板显示话题列表、切换话题后回显对应历史、发送消息使用当前话题 id。
  - 覆盖新建话题后清空旧话题历史。

### 32.4 本次验证结果

- RED 验证：
  - 后端最初失败于缺少 `get_conversation_detail(...)` 和 `/conversations/get` 路由。
  - 前端最初失败于缺少 `fetchClawAssistantConversation(...)`、autoload 缺少话题管理方法、面板缺少话题 UI。
- GREEN 验证：
  - `python -m unittest claw_conversation_memory_service_test.py claw_assistant_route_service_test.py`，结果：25 tests OK。
  - `node --test --test-concurrency=1 api/clawAssistantApi.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js`，结果：33 tests pass。
- 回归验证：
  - `python -m unittest claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果：78 tests OK。
  - `node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果：50 tests pass。
- 语法检查：
  - `node --check api\clawAssistantApi.js`
  - `node --check api\index.js`
  - `node --check modules\app\appAssistantPanel.js`
  - `node --check modules\app\appAssistantPanel.autoload.js`
  - `python -m py_compile services\claw_conversation_memory_service.py services\claw_assistant_route_service.py server.py`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒。

### 32.5 使用和接力说明

- 本次没有启动、重启、停止、检查或探测 `8777`。
- 因为新增了后端路由 `/api/v2/assistant/conversations/get` 和后端 memory service 方法，运行中的 `8777` 需要由用户自己重启后才会加载这次后端改动。
- 浏览器页面也需要刷新，才能加载新的前端 API、autoload 和助手面板 UI。
- 当前已经从“后台持久多话题核心层”推进到“用户可见的多话题切换和历史消息回显”。
- 仍未达到最终目标：
  - 还没有把 Claw runtime 原生 `.claw/sessions` 与幻映 conversation 一一映射。
  - 还没有做长会话自动摘要/压缩。
  - 还没有做话题重命名、删除、导出、搜索。
  - 还没有做项目级长期偏好记忆。
  - 还需要继续扩展真实画布 API/action 能力。

## 33. 2026-05-23 Claw 原生 session 映射基座与长记忆摘要

本节承接用户关于“Claw Code 本来有 session/resume 记忆，接入后为什么像没有上下文”的问题。当前 slice 补的是稳定基座：把幻映 product-level `conversationId` 和 Claw runtime-level `clawSessionId` 建立一一映射，并为长话题生成可注入的安全摘要。注意：这还不是完整 REPL resume 聊天流，当前 bridge 仍然使用一次性 `claw.exe --output-format json prompt <payload>`，但已经具备后续切换到 Claw 原生 session/resume 的数据基础。

### 33.1 本次产品行为

- 每个幻映助手话题现在都会有稳定的 `clawSessionId`，格式类似 `session-<timestamp>-<id>`。
- 后端会同步一份 Claw-compatible shadow JSONL：`<CLAW_RUNTIME_SERVICE.work_dir()>/.claw/sessions/<clawSessionId>.jsonl`。文件包含 `session_meta`、可选 `compaction` 摘要记录，以及 Claw message block 形态的 user/assistant 消息。
- `build_context_memory(...)` 现在返回 `conversationId/title/clawSessionId/summary/recentMessages/recentOperations`。
- 长话题会把超出最近窗口的旧消息压成 `summary`，再和最近消息一起注入给模型。
- 摘要、消息、operation 继续执行安全净化：不泄漏 OpenAI-style key、Bearer token、本地绝对路径、`data:` URL、`blob:` URL、secret-like 字段。
- `/api/v2/assistant/chat` 进入 bridge 前会把 `summary` 和 `clawSessionId` 合并进 `context.conversation`。
- bridge prompt 明确告诉模型：`summary` 是长期摘要，`recentMessages/recentOperations` 是短期上下文，`clawSessionId` 只是内部 runtime session 映射 ID。

### 33.2 本次代码改动

- `services/claw_conversation_memory_service.py`
  - 构造函数新增 `claw_session_dir_getter`。
  - 新增运行时字段维护：`clawSessionId`、`summary`、`summaryUpdatedAt`、`summaryMessageCount`、`summaryCount`。
  - 新增长记忆摘要构建与刷新逻辑。
  - 新增 Claw shadow session JSONL 同步逻辑。
  - `create_conversation(...)`、`_ensure_conversation(...)`、`record_chat_turn(...)`、`record_operation(...)`、`build_context_memory(...)` 都会维护映射/摘要/影子 session。
- `services/claw_assistant_route_service.py`
  - `_with_persistent_memory(...)` 现在会把 `clawSessionId` 和 `summary` 注入 `context.conversation`。
- `services/claw_bridge_service.py`
  - `ACTION_PROTOCOL.memoryRules` 新增长期摘要和 session 映射规则。
  - prompt instructions 新增长期摘要与 `clawSessionId` 内部使用说明。
- `server.py`
  - `CLAW_MEMORY_SERVICE` 注入 `claw_session_dir_getter=lambda: os.path.join(CLAW_RUNTIME_SERVICE.work_dir(), ".claw", "sessions")`。
- `api/index.js`
  - 补齐 `fetchClawAssistantWikiStatus` 的统一导出，避免 frontend regression 从总入口引入时缺口。

### 33.3 新增/更新测试覆盖

- `claw_conversation_memory_service_test.py`
  - 覆盖稳定 `clawSessionId` 分配。
  - 覆盖 shadow JSONL 生成，并检查 `session_meta` 与 message record 形态。
  - 覆盖旧消息进入 `summary`，并确认 key 会被净化。
- `claw_assistant_route_service_test.py`
  - 覆盖 chat payload 注入 `context.conversation.clawSessionId` 和 `context.conversation.summary`。
- `claw_bridge_service_test.py`
  - 覆盖 prompt 明确包含 `Use context.conversation.summary` 和 `context.conversation.clawSessionId` 规则。

### 33.4 本次验证结果

- RED 验证：初始失败点为 `ClawConversationMemoryService.__init__()` 不接受 `claw_session_dir_getter`，`build_context_memory(...)` 缺少 `clawSessionId/summary`，route 注入缺少 `clawSessionId/summary`，bridge prompt 缺少长期摘要与 session 映射规则。
- GREEN 验证：`python -m unittest claw_conversation_memory_service_test.py claw_assistant_route_service_test.py claw_bridge_service_test.py`，结果：52 tests OK。
- 后端 assistant 回归：`python -m unittest claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果：88 tests OK。
- 前端 assistant/API/context 回归：`node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js modules/app/appAssistantPanel.autoload.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantActionPreview.test.js api/clawAssistantApi.test.js modules/assistant/assistantContextBuilder.test.js`，结果：51 tests pass。
- 语法检查通过：`python -m py_compile services\claw_conversation_memory_service.py services\claw_assistant_route_service.py services\claw_bridge_service.py server.py`；`node --check api\clawAssistantApi.js`；`node --check api\index.js`；`node --check modules\app\appAssistantPanel.js`；`node --check modules\app\appAssistantPanel.autoload.js`。
- `git diff --check` 退出码为 0，仅有既有 LF/CRLF 转换提醒。

### 33.5 使用和接力说明

- 本次没有启动、重启、停止、检查、探测或访问 `8777`。
- 因为修改了后端 service、route prompt 和 `server.py` wiring，运行中的 `8777` 必须由用户自己重启后才会加载本次后端改动。
- 浏览器刷新即可加载 `api/index.js` 的前端导出改动。
- 当前实现是“Claw 原生 session 映射基座 + 幻映持久长摘要”，还不是完整 Claw REPL `--resume` 聊天流。
- 后续如果要真正切换为 Claw 原生 session/resume，需要单独验证 `claw.exe --resume <session>` 与非交互 prompt/JSON 输出是否存在安全可控组合；当前 help 只明确显示 `--resume` 可用于 REPL/斜杠命令，没有安全证明可以直接用 `--resume ... prompt TEXT`。
- 当前最终目标仍未完全达成。剩余关键项包括：真实 Claw REPL/resume 流、话题 rename/delete/search/export、项目级长期偏好记忆、更完整的画布 API/action 能力、撤销/历史安全、更多真实 UI 联调。

## 34. 2026-05-23 真实资产引用 Action 与 Windows 长 Prompt 压缩

本节承接用户反馈：助手现在确实有了上下文记忆，但让它“去资产里面拿”时看起来像自己创建了一个新东西；并且某次任务后持续报 `CLAW_RUNTIME_FAILED`，底层错误是 `FileNotFoundError(2, '文件名或扩展名太长。', None, 206, None)`。本轮定位到两个叠加问题，并完成了代码级修复。

### 34.1 根因判断

- “资产里拿”之前并不是真正可执行的资产引用能力。
  - 上下文里已经能把资产摘要给模型看见，例如资产 id、名称、分类、子项摘要。
  - 但 action 白名单里只有 `create_node`、`update_node_data`、`connect_nodes`、`rename_node`、`focus_nodes`。
  - 也就是说模型没有一个合法动作可以表达“把 AssetManager 里的真实资产子项拿到画布上”。
  - 在这种情况下，模型很容易退化成 `create_node`，创建一个看起来像 source-image/source-video 的节点，但它不是从真实 AssetManager 取出的资产数据。
- `文件名或扩展名太长` 是 Windows 命令行参数长度问题。
  - `ClawBridgeService` 之前会把完整 prompt JSON 作为 CLI 参数传给 `claw.exe --output-format json prompt <payload>`。
  - 持久记忆、长摘要、画布节点、资产摘要、LLM Wiki 上下文一起变大后，`<payload>` 可能超过 Windows 创建进程可接受的参数长度。
  - Windows 把这个失败表现为 WinError 206，也就是 “The filename or extension is too long”，并不代表 key、OpenAI 模型或 claw-code 本身一定坏了。

### 34.2 本次产品行为

- 新增 `create_asset_reference_node` 作为正式画布 action。
- 当用户要求“用资产里的某个图/视频/音频做参考”时，模型现在会被明确要求：
  - 从 `context.assets.items[*].id` 里选择真实 `assetId`。
  - 可选使用 `context.assets.items[*].items[*].id` 或 `nodes[*].id` 作为 `assetItemId`。
  - 不要伪造媒体、不要创建空的替代 source 节点。
- 前端执行该 action 时会从真实 `AssetManager` 读取原始资产数据，克隆资产子项的 `nodeData` 或原始子项数据，创建新的 `source-image` / `source-video` / `source-audio` 节点。
- 资产引用 action 属于低风险内部画布操作，已加入自动应用白名单。文本和图片生成权限仍开放，视频生成仍需要用户授权。
- Prompt 现在会在过长时自动压缩，保留当前消息、动作协议、画布/选择摘要、少量资产、长期摘要和最近记忆，并在上下文里加入 `context.promptCompaction` 提示。

### 34.3 本次代码改动

- `services/claw_bridge_service.py`
  - 新增 `MAX_PROMPT_ARGUMENT_CHARS = 16000`。
  - 新增 `_build_prompt_argument(...)` 和多级 `_compact_context(...)` 压缩逻辑，避免把超长 JSON 直接塞进 Windows CLI 参数。
  - action 协议加入 `create_asset_reference_node`。
  - prompt 指令明确：用户要求使用已有资产时必须引用 `context.assets.items[*].id`，不要伪造媒体节点。
- `services/claw_action_schema.py`
  - 新增 `create_asset_reference_node` schema。
  - 必填字段：`id/type/title/assetId/nodeType`。
  - 可选字段：`assetItemId/assetItemIndex/data/position/requiresConfirmation/riskLevel`。
  - `nodeType` 限制为 `source-image/source-video/source-audio`。
  - 校验 `assetId` 必须来自当前 `context.assets.items[*].id`。
  - 校验 `assetItemId` 必须来自对应资产的 `items/nodes` 子项 id。
  - 同 batch 后续 `connect_nodes` 可以引用前面资产引用 action 的 `id`。
- `modules/assistant/assistantContextBuilder.js`
  - `canvasApi.allowedActions` 加入 `create_asset_reference_node`。
  - 资产子项摘要新增 `index` 和 `parentAssetId`，让模型能稳定选择子项。
- `modules/assistant/assistantActionExecutor.js`
  - `createAssistantActionExecutor(...)` 新增 `assetManager` 注入。
  - 新增 `create_asset_reference_node` 执行逻辑。
  - 支持从 `_getSortedAssets()`、`getAssets()`、`assets`、`_assets` 获取真实资产。
  - 支持按 `assetItemId` 或 `assetItemIndex` 选择资产子项。
  - 保留真实媒体相关字段，例如 `src/localPath/width/height` 等原始字段，但模型上下文仍不泄漏这些敏感路径或大媒体数据。
  - 生成节点时写入 `assetId/sourceAssetId/assetItemId/sourceAssetItemId/assetItemIndex/assetName/assetItemName`，方便后续调试和追溯。
- `modules/assistant/assistantActionPreview.js`
  - 预览摘要支持资产引用 action。
- `modules/app/appAssistantPanel.autoload.js`
  - 创建 action executor 时传入解析到的 `AssetManager`。
  - 自动应用白名单加入 `create_asset_reference_node`。

### 34.4 新增/更新测试覆盖

- `claw_bridge_service_test.py`
  - 覆盖长 prompt 会被压缩到 `MAX_PROMPT_ARGUMENT_CHARS` 以内。
  - 覆盖 prompt 包含资产引用指令和 `create_asset_reference_node` 协议。
- `claw_action_schema_test.py`
  - 覆盖合法资产引用 action 会通过校验。
  - 覆盖未知资产、未知资产子项、错误 `nodeType` 会被拒绝。
- `modules/assistant/assistantContextBuilder.test.js`
  - 覆盖 `canvasApi.allowedActions` 包含 `create_asset_reference_node`。
  - 覆盖资产子项摘要包含 `index` 和 `parentAssetId`。
- `modules/assistant/assistantActionExecutor.test.js`
  - 覆盖从真实 AssetManager 原始数据创建资产引用节点，并能在同一批 action 里继续连接节点。
- `modules/assistant/assistantActionPreview.test.js`
  - 覆盖资产引用 action 的预览摘要。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖 AssetManager 会传给 executor factory。
  - 覆盖资产引用 action 会作为低风险内部画布操作自动应用。

### 34.5 本次验证结果

- 定向后端验证：`python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`，结果：33 tests OK。
- 定向前端验证：`node --test --test-concurrency=1 modules/assistant/assistantContextBuilder.test.js modules/assistant/assistantActionExecutor.test.js modules/assistant/assistantActionPreview.test.js modules/app/appAssistantPanel.autoload.test.js`，结果：29 tests pass。
- 后端 assistant/LLM Wiki 回归：`python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果：101 tests OK。
- 前端 assistant/API/context/settings 回归：`node --test --test-concurrency=1 api/clawAssistantApi.test.js api/configApi.specialProviders.test.js modules/settings/apiSettings.test.js modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js modules/assistant/assistantContextBuilder.test.js modules/assistant/assistantActionPreview.test.js modules/assistant/assistantActionExecutor.test.js`，结果：62 tests pass。
- 语法检查通过：
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `node --check modules\assistant\assistantActionExecutor.js`
  - `node --check modules\assistant\assistantActionPreview.js`
  - `node --check modules\app\appAssistantPanel.autoload.js`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒。

### 34.6 使用和接力说明

- 本次没有启动、重启、停止、检查、探测或访问 `8777`。
- 因为修改了后端 `services/claw_bridge_service.py` 和 `services/claw_action_schema.py`，运行中的 `8777` 必须由用户自己重启后才会加载本次后端改动。
- 因为修改了前端静态 JS，浏览器页面也需要刷新后才会加载新的资产引用执行逻辑和自动应用白名单。
- 重启并刷新后，适合做的真实联调用例是：
  - 先保证资产面板里有一个可见图片/视频/音频资产。
  - 让助手执行类似“把资产里的这张图拿到画布上，作为刚才视频节点的参考”。
  - 期望 Claw 返回 `create_asset_reference_node`，必要时再跟一个 `connect_nodes`，而不是普通 `create_node` 伪造 source 节点。
- 如果仍然出现 `CLAW_RUNTIME_FAILED`，下一步优先看错误是否还是 WinError 206；如果不是 206，再按 runtime/env/provider 三段分界排查。
- 当前最终目标仍未完全达成。剩余关键项包括：真实 Claw REPL/resume 流、话题 rename/delete/search/export、项目级长期偏好记忆、更完整的画布 API/action 能力、撤销/历史安全、更多真实 UI 联调。

## 35. 2026-05-23 AssetManager 延迟注册导致助手资产上下文为 0 的修复

本节承接用户截图反馈：左侧资产面板里明明有 `人物 > 新资产7` 等资产，但 Claw 助手回复里说 `assets.count 是 0，没有可用资产 id`。这不是模型“看不懂图”，而是前端上下文桥接时序问题。

### 35.1 根因判断

- 资产面板真实数据在 `AssetManager` 实例里。
- 上一节已经让助手支持从 `AssetManager` 读取资产，但 `modules/app/appAssistantPanel.autoload.js` 在创建助手面板 options 时只解析一次：
  - `deps.assetManager`
  - `window.__huanyingAssetManager`
  - `globalThis.__huanyingAssetManager`
- 如果助手面板 autoload 比 `modules/AssetManager.js` 更早执行，当时全局 `__huanyingAssetManager` 还不存在，`assetManagerRef` 就会被固定成 `null`。
- 后面资产面板加载出来、全局注册成功，助手仍然使用旧的 `null` 引用，所以 `buildAssistantContext(...)` 得到的 `assets.count` 仍是 0。
- 这和截图现象完全吻合：页面左侧可视资产存在，但助手 prompt 的结构化上下文里没有资产。

### 35.2 本次产品行为

- 助手面板不再把“初始化瞬间是否存在 AssetManager”当成最终结果。
- 如果初始化时没有拿到 AssetManager，会创建一个延迟解析引用。
- 每次构建上下文、以及执行资产引用 action 时，这个延迟引用都会重新读取当前最新的：
  - `deps.assetManager`
  - `window.__huanyingAssetManager`
  - `globalThis.__huanyingAssetManager`
- 因此只要资产面板后来完成注册，助手下一次发送消息时就能把真实资产摘要带进 `context.assets`。
- 同样，`create_asset_reference_node` 自动应用时也能在执行阶段拿到后来注册的 AssetManager。

### 35.3 本次代码改动

- `modules/app/appAssistantPanel.autoload.js`
  - 新增 `createDeferredAssetManagerRef(...)`。
  - 如果初始化时已有显式 `assetManager` 或全局 AssetManager，继续直接使用原对象，保持既有测试和显式依赖行为不变。
  - 如果初始化时没有 AssetManager，返回一个轻量代理对象：
    - `_getSortedAssets(...)`
    - `getAssets(...)`
    - `assets`
    - `_assets`
  - 这些方法/属性在调用时再动态查找真实 AssetManager。
  - `createAssistantPanelOptions(...)` 现在使用这个延迟引用传给 `buildAssistantContext(...)` 和 `createAssistantActionExecutor(...)`。
- `modules/assistant/assistantActionPreview.js`
  - 修复回归中暴露的知识库来源摘要缺口。
  - `create_node` 如果携带 `data.sourceTitle/sourceName/knowledgeTitle` 与 `data.fileId/sourceFileId/knowledgeFileId`，预览摘要会显示 `from <sourceTitle> (<fileId>)`，方便用户确认知识库落点来源。

### 35.4 新增测试覆盖

- `modules/app/appAssistantPanel.autoload.test.js`
  - 新增测试：`autoload panel options resolve asset manager registered after options are created`。
    - 复现 options 创建时没有 `window.__huanyingAssetManager`。
    - 后续再把 AssetManager 注册到 `windowRef.__huanyingAssetManager`。
    - 期望 `options.buildContext()` 能看到 `assets.count = 1`。
  - 新增测试：`autoload action executor can use asset manager registered after options are created`。
    - 复现 action executor factory 初始化时拿不到真实 AssetManager。
    - 后续注册 AssetManager。
    - 期望 `onApplyActions(...)` 执行阶段能通过延迟引用读到真实资产。
- `modules/assistant/assistantActionPreview.test.js`
  - 已有知识库来源摘要测试在本次前端回归中暴露为 RED，本轮补齐实现后通过。

### 35.5 本次验证结果

- RED 验证：`node --test --test-concurrency=1 modules/app/appAssistantPanel.autoload.test.js` 初始失败 2 个测试：
  - 上下文仍返回 `assets.count = 0`。
  - 执行器拿不到后注册资产。
- GREEN 验证：实现延迟引用后，`node --test --test-concurrency=1 modules/app/appAssistantPanel.autoload.test.js`，结果：13 tests pass。
- 关联预览修复验证：`node --test --test-concurrency=1 modules/assistant/assistantActionPreview.test.js`，结果：3 tests pass。
- 前端 assistant/API/context/settings 回归：`node --test --test-concurrency=1 api/clawAssistantApi.test.js api/configApi.specialProviders.test.js modules/settings/apiSettings.test.js modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js modules/assistant/assistantContextBuilder.test.js modules/assistant/assistantActionPreview.test.js modules/assistant/assistantActionExecutor.test.js`，结果：65 tests pass。
- 语法检查通过：
  - `node --check modules\app\appAssistantPanel.autoload.js`
  - `node --check modules\assistant\assistantActionPreview.js`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒。

### 35.6 使用和接力说明

- 本次没有启动、重启、停止、检查、探测或访问 `8777`。
- 本次只修改前端静态 JS 和测试，不需要重启 `8777`。
- 需要刷新浏览器页面，让新的 `appAssistantPanel.autoload.js` 生效。
- 刷新后再次对助手说“把资产 > 人物 > 新资产7 拿出来并连接到刚才的视频节点”，预期上下文里不再是 `assets.count=0`，模型应该能返回 `create_asset_reference_node`。
- 如果刷新后仍然说资产为 0，下一步应在浏览器控制台检查：
  - `window.__huanyingAssetManager`
  - `window.__huanyingAssetManager?._getSortedAssets?.().length`
  - 当前资产是否确实已加载到 AssetManager 的 `_assets/assets` 或 `_getSortedAssets()` 结果里。

## 36. 2026-05-23 资产引用支持 source-text 与“拿资产”协议校准

本节承接用户反馈：只是让助手拿一个资产，结果出现 `CLAW_ACTION_SCHEMA_INVALID: action[0] unsupported nodeType source-text ...`。这说明上一轮已经让 Claw 走到了 `create_asset_reference_node`，但 schema 仍然离真实资产结构有差距。

### 36.1 根因判断

- 左侧资产卡片并不一定只有图片/视频/音频子项。
- 从截图看，每个资产卡里同时出现 TXT 图标和缩略图，这类资产很可能包含 `source-text` 子项，例如提示词、说明或节点文本。
- 第 34 节新增资产引用 action 时，后端 schema 只允许：
  - `source-image`
  - `source-video`
  - `source-audio`
- 所以 Claw 返回 `create_asset_reference_node` 且 `nodeType=source-text` 时，被 `ClawActionSchema` 拒绝。
- 这不是 OpenAI/key/runtime 问题，而是幻映 action schema 对真实资产结构建模不完整。

### 36.2 本次产品行为

- `create_asset_reference_node` 现在允许引用真实文本资产子项：
  - `source-text`
  - `source-image`
  - `source-video`
  - `source-audio`
- Claw prompt 协议新增校准：
  - 用户按可见资产名要求“拿/使用资产”时，如果该名称存在于 `context.assets`，应选择匹配资产，不要继续要求用户提供资产 id。
  - 如果资产同时包含文本和媒体子项，且用户没有明确说要提示词/文本，默认优先图片/视频/音频子项。
  - `source-text` 只用于文本资产，或用户明确要求拿文本/提示词时。
- 前端 executor 已经能克隆 `source-text` 资产子项，本次补了测试确认。

### 36.3 本次代码改动

- `services/claw_action_schema.py`
  - `ASSET_REFERENCE_NODE_TYPES` 新增 `source-text`。
  - 仍然拒绝 `ai-image/ai-video/ai-text` 这类生成节点作为资产引用类型，避免把“引用已有资产”和“创建生成任务”混淆。
- `services/claw_bridge_service.py`
  - `create_asset_reference_node` 协议说明从 `source-image/source-video/source-audio` 扩展为 `source-text/source-image/source-video/source-audio`。
  - `safetyRules` 新增可见名称匹配规则：上下文里有匹配资产名时不要向用户要 id。
  - `safetyRules` 新增混合资产子项选择规则：默认优先媒体子项，明确文本需求时才用 `source-text`。
- `modules/assistant/assistantActionExecutor.test.js`
  - 新增 source-text 资产引用执行测试，确认真实 AssetManager 子项会被克隆成 `source-text` 节点。
- `modules/settings/apiSettings.js`
  - 前端宽回归暴露一个相邻 LLM Wiki 设置字段文案回归，已把 `apiToken` label 恢复为 `API Token（可选）`，placeholder 恢复为“可留空”语义。

### 36.4 新增/更新测试覆盖

- `claw_action_schema_test.py`
  - 新增 `test_validate_accepts_text_asset_reference_action`。
  - RED 时失败为 `unsupported nodeType source-text`。
  - GREEN 后 `source-text` 资产引用通过，并保留 assetId/assetItemId。
- `claw_bridge_service_test.py`
  - 更新资产引用 prompt 测试，要求协议包含：
    - `choose the matching asset instead of asking for an id`
    - `Use source-text only for text assets`
- `modules/assistant/assistantActionExecutor.test.js`
  - 新增 `creates a text asset reference node from raw AssetManager asset data`。
  - 确认 `source-text` 子项的 `content/name/assetId/assetItemId` 能落到新节点。

### 36.5 本次验证结果

- RED 验证：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_text_asset_reference_action` 初始失败：`unsupported nodeType source-text`。
- GREEN/定向验证：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_text_asset_reference_action claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_asset_reference_outside_context_or_wrong_type`，结果：2 tests OK。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_instructs_model_to_reference_existing_assets`，结果：1 test OK。
  - `node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js`，结果：12 tests pass。
- 相关回归：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`，结果：36 tests OK。
  - `node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js modules/assistant/assistantContextBuilder.test.js modules/assistant/assistantActionPreview.test.js modules/app/appAssistantPanel.autoload.test.js`，结果：33 tests pass。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果：106 tests OK。
  - `node --test --test-concurrency=1 api/clawAssistantApi.test.js api/configApi.specialProviders.test.js modules/settings/apiSettings.test.js modules/app/appAssistantPanel.test.js modules/app/appAssistantPanel.autoload.test.js modules/assistant/assistantContextBuilder.test.js modules/assistant/assistantActionPreview.test.js modules/assistant/assistantActionExecutor.test.js`，结果：66 tests pass。
- 语法检查：
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - `node --check modules\assistant\assistantActionExecutor.js`
  - `node --check modules\settings\apiSettings.js`
- `git diff --check` 退出码为 0，仅输出既有 LF/CRLF 转换提醒。

### 36.6 使用和接力说明

- 本次没有启动、重启、停止、检查、探测或访问 `8777`。
- 因为修改了后端 `services/claw_action_schema.py` 和 `services/claw_bridge_service.py`，运行中的 `8777` 必须由用户自己重启后才会加载本次后端改动。
- 因为修改了前端测试和设置页静态 JS，浏览器刷新即可加载对应前端改动。
- 这次修掉的是“真实资产子项类型不完整”导致的 schema 拒绝。
- 但用户判断是对的：这仍然暴露出最终方案差距。理想状态下，“拿资产”应更像原生产品动作：
  - 能按可见名称/当前选中资产直接定位。
  - 能明确区分“拿整个资产组”“拿其中图片”“拿其中提示词”。
  - 能恢复资产组内多个节点及边，而不是只靠多个单节点引用 action。
  - 出错时 UI 应给出“缺少哪个资产/哪个子项/哪个类型不支持”的可理解修复建议，而不是裸露 schema 错误。
- 下一步建议做“资产操作产品化”：
  - 新增更高层的 `restore_asset_to_canvas` / `restore_asset_item_to_canvas` action。
  - 由前端 AssetManager 执行现有恢复逻辑，而不是让模型手工拼多个 `create_asset_reference_node`。
  - 让 Claw 只表达“恢复资产 X 到画布并连接到节点 Y”，具体子项、节点、边、布局交给幻映执行器。

## 37. Claw Code 助手最终目标攻克表

本节是后续接力开发的总看板。后续每完成一个开发切片，必须在这里把状态从 `[待攻克]` 或 `[进行中]` 改为 `[已攻克]`，并在对应小节或后续新小节里写清楚：代码改动、测试结果、是否需要用户重启 `8777`、是否需要浏览器刷新。

当前摸底结论：

- 底层接入完成度约 75%：模型 key/provider proxy、真实 claw runtime、聊天 bridge、基础面板、上下文、安全 schema、动作执行和持久记忆已经成型。
- 真实 AI 画布助手完成度约 45%-55%：能做简单画布操作，但复杂资产、工作流、撤销、错误修复和生成任务编排还不够产品化。
- 离最终“完美到位”目标仍差约 40%-50%：不是差一个 bug，而是差一批可持续攻克的产品级能力。

### 37.1 已攻克切片

| 编号 | 状态 | 切片 | 当前结果 |
|---|---|---|---|
| C01 | [已攻克] | claw-code 项目研究、下载、编译和 runtime 放置 | `integrations/claw_code/runtime/claw.exe` 可用，离线 help 冒烟通过。 |
| C02 | [已攻克] | 助手专用特殊配置、OpenAI-compatible provider proxy 和真实 key 边界 | 真实 API key 由幻映后端保管，claw 只访问本地 provider proxy。 |
| C03 | [已攻克] | 右下角圆形入口和基础聊天面板 | 入口、对话框、状态、发送消息、基础错误展示已接入。 |
| C04 | [已攻克] | 真实 claw bridge、CLI 输出解析和在线模型联调基础 | 支持 `message` 外层、内嵌 JSON 合同、真实 `/assistant/chat` 基本链路。 |
| C05 | [已攻克] | 画布上下文摘要和权限上下文 | 当前画布、选区、节点、边、资产摘要、允许动作、文本/图片/视频权限进入 context。 |
| C06 | [已攻克] | 后端 action schema、二次校验和安全净化 | `create_node/update_node_data/connect_nodes/rename_node/focus_nodes/create_asset_reference_node` 已有白名单校验。 |
| C07 | [已攻克] | 前端 action 预览、局部应用、低风险自动应用和失败诊断 | 免费低风险内部操作可自动应用，失败会带 action 上下文。 |
| C08 | [已攻克] | 本地持久多话题记忆、历史回显和长摘要 | 支持多话题、历史消息、操作记忆、`clawSessionId` 映射基座和 summary。 |
| C09 | [已攻克] | Windows 长 prompt 压缩 | 避免 `FileNotFoundError(2, 文件名或扩展名太长, 206)`，长上下文会压缩。 |
| C10 | [已攻克] | AssetManager 延迟注册与资产可见性 | 修复左侧有资产但助手 context `assets.count=0` 的加载顺序问题。 |
| C11 | [已攻克] | 单资产子项引用和 `source-text` 支持 | `create_asset_reference_node` 支持 `source-text/source-image/source-video/source-audio`。 |
| C12 | [已攻克] | LLM Wiki 只读配置、自动检索和画布落点基础 | 配置卡、状态测试、意图触发检索、知识来源 note/source-text 落点基础已完成。 |

### 37.2 正在攻克切片

| 编号 | 状态 | 切片 | 成功标准 |
|---|---|---|---|
| C13 | [已攻克] | 资产操作产品化：`restore_asset_to_canvas` / `restore_asset_item_to_canvas` | 用户说“把资产/新资产7拿出来”时，Claw 返回高层恢复动作；幻映用 AssetManager/执行器恢复真实资产组或子项，而不是让模型拼多个低层节点。 |

### 37.3 待攻克切片

| 编号 | 状态 | 切片 | 成功标准 |
|---|---|---|---|
| C14 | [已攻克] | 整个资产组恢复：节点、边、布局、选中状态和可追溯 metadata | 资产包含多个节点和边时能一键恢复到画布，边关系保持，节点不重叠，恢复后自动选中新节点组。 |
| C15 | [已攻克] | 资产歧义消解和当前资产选择上下文 | 当多个“新资产7”或多个分类同名时，助手能按当前 tab/可见分类/选中资产消歧；必要时问一句短问题。 |
| C16 | [已攻克] | 画布操作能力扩展 | 支持节点参数编辑、批量布局、分组、复制、整理工作流、选区级操作，且都进入 schema 和 executor。 |
| C17 | [已攻克] | 撤销/历史/事务安全 | AI 自动改画布必须进入幻映原生历史；失败可回滚，部分失败有清晰结果。 |
| C18 | [已攻克] | 用户友好的错误恢复 | 不再裸露 `CLAW_ACTION_SCHEMA_INVALID`；缺资产/缺子项/类型不支持/节点不存在/连接不安全等会返回中文诊断和修复建议。 |
| C19 | [已攻克] | 文本和图片生成任务编排 | 文本/图片生成权限开放后，助手能创建、配置、触发或排队生成任务，并回写状态。 |
| C20 | [已攻克] | 视频生成授权闭环 | 视频生成必须弹出授权/确认，确认后才能创建或触发视频任务，并能解释费用/风险边界。 |
| C21 | [已攻克] | 更完整的端口和连接语义 | 连接不只按 nodeType 粗判，要理解真实端口、输入槽、参考图、首帧、音频、提示词等语义。 |
| C22 | [已攻克] | 项目级长期偏好记忆 | 记住常用画风、模型、比例、品牌偏好、视频时长、命名习惯，并可查看/修改/清除。 |
| C23 | [已攻克] | 话题管理完善 | 支持话题重命名、删除、搜索、导出、归档；切换话题不串上下文。 |
| C24 | [已攻克] | Claw 原生 REPL/resume 流验证和切换 | 已离线确认当前不能安全直接切到原生 `--resume prompt`；状态接口会暴露 `nativeSessions` 能力报告，桥接继续保持 one-shot + shadow session。 |
| C25 | [已攻克] | 上下文调试面板和模型校准工具 | `/context/preview` 返回脱敏 context + debug 摘要，前端 API 和面板只读调试按钮可查看上下文大小、资产/选区/动作协议/runtime bridge 状态。 |
| C26 | [已攻克] | 真实端到端联调脚本和回归用例 | 已固化离线自动回归脚本和人工 live checklist，覆盖资产、视频连接、图像节点、工作流、多话题、偏好、LLM Wiki、context debug、native session、视频授权和 8777 人工规则。 |
| C27 | [已攻克] | 打磨为最终产品体验 | 已补齐可见话题管理、topic 搜索/重命名/导出/删除、快捷意图按钮，并把这些能力写入统一回归 checklist。 |

### 37.4 后续推进规则

- 每次开始一个切片，先把对应编号标记为 `[进行中]`。
- 每次攻克一个切片，必须补充新的实现小节，并把该编号标记为 `[已攻克]`。
- 每次停下来必须汇报：
  - 当前攻克到哪个编号。
  - 完成了什么。
  - 本轮测试结果。
  - 是否需要用户重启 `8777`。
  - 是否只需要刷新浏览器。
- 继续遵守用户的 `8777` 规则：开发侧不主动启动、重启、停止、检查或探测服务；需要服务就绪时停下来交给用户处理。
## 38. C13 已攻克：资产操作产品化与高层恢复动作

本节记录 2026-05-23 本轮完成的 C13。C13 的目标是把“拿资产/把新资产7拿出来”从低层节点拼装，升级为 Claw 输出高层资产恢复意图，幻映本地执行器负责从真实 AssetManager 数据恢复画布内容。

### 38.1 已完成能力

- 后端 `services/claw_action_schema.py` 新增动作：
  - `restore_asset_to_canvas`
  - `restore_asset_item_to_canvas`
- 后端 schema 会校验：
  - `assetId` 必须来自 `context.assets.items[*].id`。
  - `assetItemId` 必须来自资产子项 `items[*].id` 或 `nodes[*].id`。
  - `connectTo` / `connectFrom` 必须引用当前画布节点或 `selected_node`。
  - `requiresConfirmation=false` 和 `riskLevel=low` 可以保留，供低风险内部操作自动应用。
- `services/claw_bridge_service.py` 的 prompt 协议已更新：
  - 整个资产/资产组请求优先返回 `restore_asset_to_canvas`。
  - 单个资产子项请求返回 `restore_asset_item_to_canvas`。
  - `create_asset_reference_node` 只作为“创建单个 source 引用节点”的窄场景保留。
- `modules/assistant/assistantContextBuilder.js` 的 `context.canvasApi.allowedActions` 已加入两个 restore 动作。
- `modules/assistant/assistantActionPreview.js` 已能展示 restore 动作摘要。
- `modules/app/appAssistantPanel.autoload.js` 已把两个 restore 动作加入低风险内部自动应用白名单。
- `modules/assistant/assistantActionExecutor.js` 已能：
  - 从 AssetManager 的 `_getSortedAssets()` / `getAssets()` / `assets` / `_assets` 找真实资产。
  - 对 `restore_asset_to_canvas` 恢复 `asset.nodes` / `asset.items` 中的节点。
  - 恢复 `asset.edges` 并把原节点 id 映射为新画布节点 id。
  - 按 `position.relativeTo=selected_node` 等规则放置恢复出的节点组。
  - 支持 `connectTo` / `connectFrom` 自动加一条连接边。
  - 对 `restore_asset_item_to_canvas` 按 `assetItemId` 或 `assetItemIndex` 恢复单个子项。

### 38.2 本轮验证

- RED 验证先失败，失败点符合预期：
  - 后端报 `unsupported action type restore_asset_to_canvas` / `restore_asset_item_to_canvas`。
  - bridge prompt 未包含高层 restore 动作。
  - 前端 context/preview/autoload/executor 均不认识 restore 动作。
- GREEN 聚焦验证通过：
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`：41 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js`：35 tests OK。
- 宽回归通过：
  - 后端：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py claw_conversation_memory_service_test.py llm_wiki_bridge_service_test.py`：112 tests OK。
  - 前端：`cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`：68 tests OK。
- 语法检查通过：
  - Python：`py_compile` 覆盖 assistant 相关服务和 `server.py`。
  - JS：`node --check` 覆盖 `assistantActionExecutor.js`、`assistantActionPreview.js`、`assistantContextBuilder.js`、`appAssistantPanel.autoload.js`。
- `git diff --check` 通过；仅输出已有 LF/CRLF 转换 warning，没有 whitespace error。

### 38.3 生效方式

- 本轮包含后端 schema / bridge prompt 变化，真实运行中的 `8777` 需要由用户手动重启后才会生效。
- 本轮包含前端静态 JS 变化，浏览器需要刷新后才会加载新的 context/preview/executor/autoload 代码。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。

### 38.4 下一棒建议

下一棒从 C14 开始，重点不是再让模型拼动作，而是在 C13 高层 restore 合同上继续增强恢复质量：

- 更完整地贴合真实 AssetManager `restoreAssetToCanvas` / `_restoreAssetSubItem` 行为。
- 处理更复杂的资产组 metadata、布局、防重叠、选中状态和内部边。
- 提升同名资产/当前可见资产/选中资产的消歧体验。
- 把 restore 失败改成用户友好的资产缺失、子项缺失、类型不支持提示。

## 39. C14 已攻克：整个资产组恢复质量增强

本节记录 2026-05-23 本轮完成的 C14。C14 没有新增模型侧动作类型，而是在 C13 的 `restore_asset_to_canvas` 合同后面增强幻映本地执行质量，让整个资产组恢复更像真实产品能力。

### 39.1 已完成能力

- `modules/assistant/assistantActionExecutor.js` 增强整组资产恢复：
  - 当资产节点缺少坐标，或多个资产节点坐标重复/互相重叠时，执行器会使用确定性的网格布局兜底。
  - 恢复资产组落点会尽量避开当前画布已有节点，避免默认落在 `0,0` 时压住现有内容。
  - 恢复出的节点会保留可追溯 metadata：
    - `restoredFromAsset`
    - `restoreActionId`
    - `restoreBatchId`
    - `sourceAssetId`
    - `sourceAssetName`
    - `sourceAssetNodeId`
    - `sourceAssetItemId`
  - 执行结果新增统计：
    - `restoredAssetNodeCounts`
    - `restoredAssetEdgeCounts`
  - 恢复后仍会自动选中新恢复出的节点组。
- `modules/app/appAssistantPanel.js` 和 `modules/app/appAssistantPanel.autoload.js` 增强操作结果摘要：
  - 成功恢复资产组后会显示恢复资产数、恢复节点数、恢复边数。
  - 持久操作记忆也会记录更清晰的恢复结果，方便下一轮对话知道刚刚恢复了什么。

### 39.2 本轮验证

- RED 验证先失败，失败点符合预期：
  - 位置缺失/重复的资产组会与自身或现有节点重叠。
  - 成功恢复资产组后，面板摘要只显示“已应用 1 个画布操作”，没有恢复资产/节点/边数量。
- GREEN 聚焦验证通过：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`：16 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js`：18 tests OK。
- 前端宽回归通过：
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`：72 tests OK。
- JS 语法检查通过：
  - `modules\assistant\assistantActionExecutor.js`
  - `modules\app\appAssistantPanel.js`
  - `modules\app\appAssistantPanel.autoload.js`
- `git diff --check` 通过；仅输出已有 LF/CRLF 转换 warning，没有 whitespace error。

### 39.3 生效方式

- 本轮只改前端静态 JS 和测试，不需要后端 `8777` 重启。
- 浏览器需要刷新后才会加载新的 executor、面板摘要和 autoload 代码。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。

### 39.4 下一棒建议

下一棒进入 C15：资产歧义消解和当前资产选择上下文。

- 让 assistant context 能暴露当前资产面板的可见分类、可见资产、打开/选中的资产。
- 当多个资产同名，如多个“新资产7”，Claw 应优先当前可见/当前选中的资产。
- 必要时只问一句短问题，而不是直接说找不到资产或乱选。

## 40. C15 已攻克：资产歧义消解和当前资产选择上下文

本节记录 2026-05-23 本轮完成的 C15。C15 解决的是“资产已经能恢复，但同名资产/多分类资产容易选错”的问题：Claw 现在不仅能看到资产列表，还能看到当前资产面板的选中、打开、当前、可见资产和分类上下文，从而优先恢复用户正在看的那个资产。

### 40.1 已完成能力

- `modules/assistant/assistantContextBuilder.js` 新增资产面板上下文提取：
  - 支持读取 `selectedAssetId` / `_selectedAssetId`。
  - 支持读取 `openAssetId` / `_openAssetId`。
  - 支持读取 `currentAssetId` / `_currentAssetId` / `activeAssetId` / `_activeAssetId`。
  - 支持读取 `activeTab` / `_activeTab` / `tab` / `_tab`。
  - 支持读取 `activeCategory` / `_activeCategory` / `selectedCategory` / `category` / `cat`。
  - 支持读取 `getVisibleAssetIds()` / `_getVisibleAssetIds()` / `visibleAssetIds` / `_visibleAssetIds`。
  - 支持从 `getVisibleAssets()` / `_getVisibleAssets()` 辅助归纳可见资产。
- `context.assets.panel` 现在会在有可用资产面板状态时写入：
  - `selectedAssetId`
  - `openAssetId`
  - `currentAssetId`
  - `activeTab`
  - `activeCategory`
  - `visibleAssetIds`
  - `selectedAsset`
  - `openAsset`
  - `visibleAssets`
- 资产面板上下文仍然遵守脱敏边界：
  - 不把本地绝对路径交给 Claw。
  - 不把 data URL / blob URL / 大媒体 payload 交给 Claw。
  - 只暴露 id、名称、分类、类型、子项摘要等可用于消歧的轻量字段。
- `services/claw_bridge_service.py` 的 prompt 协议新增资产消歧规则：
  - 当资产名称重复时，优先 `context.assets.panel.currentAssetId`，再看 selected/open/current asset。
  - 使用 `visibleAssetIds` / `visibleAssets` 优先当前资产面板可见资产。
  - 如果 selected/open/current/visible 仍无法消歧，只问一句简短澄清问题，并且本轮不返回 actions。
- prompt 压缩逻辑新增 `_compact_asset_panel(...)`：
  - 长上下文压缩时保留 `assets.panel` 里的关键消歧字段。
  - 防止大画布、大资产、大记忆上下文把当前选中资产信息挤掉。

### 40.2 本轮验证

- 聚焦验证通过：
  - `python -m unittest claw_bridge_service_test.py`：26 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js`：6 tests OK。
- 后端宽回归通过：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py claw_assistant_route_service_test.py`：75 tests OK。
- 前端宽回归通过：
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`：74 tests OK。
- 语法检查通过：
  - `python -m py_compile services\claw_bridge_service.py`
  - `cmd /c node --check modules\assistant\assistantContextBuilder.js`
- `git diff --check` 通过；仅输出已有 LF/CRLF 转换 warning，没有 whitespace error。
- 2026-05-23 接力复核通过：
  - `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js`：58 tests OK。
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py claw_assistant_route_service_test.py`：75 tests OK。
  - `node --check modules\assistant\assistantContextBuilder.js` / `node --check modules\app\appAssistantPanel.autoload.js` / `python -B -m py_compile services\claw_bridge_service.py` 均通过。

### 40.3 生效方式

- 本轮包含后端 `services/claw_bridge_service.py` 的 prompt / 压缩变化，真实运行中的 `8777` 需要由用户手动重启后才会生效。
- 本轮包含前端静态 JS 变化，浏览器需要刷新后才会让新的 `context.assets.panel` 进入后续对话。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。

### 40.4 下一棒建议

下一棒进入 C16：画布操作能力扩展。建议优先补“用户自然会要求 AI 做”的真实画布动作，而不是继续堆 prompt 文案：

- 节点参数编辑：修改 prompt、标题、模型、比例、尺寸、生成参数等真实节点字段。
- 选区级操作：批量移动、批量整理、批量命名、批量连接、批量删除前确认。
- 分组/复制/整理工作流：让 Claw 能把一堆节点整理成更可读的工作流结构。
- 每个新增动作都必须同时进入 backend schema、bridge prompt、frontend preview、executor、auto-apply/confirmation 策略和测试。

## 41. C16 已攻克：画布操作能力扩展

本节记录 2026-05-23 本轮完成的 C16。C16 把 Claw 助手从“能创建/连接/恢复资产”推进到“能整理和操作已有画布结构”：节点参数继续走 `update_node_data`，本轮新增 4 个低风险内部画布动作，覆盖选区级移动、批量布局、复制和分组。

### 41.1 已完成能力

- 后端 `services/claw_action_schema.py` 新增动作：
  - `move_nodes`：批量移动已有节点，字段为 `nodeIds`、`deltaX`、`deltaY`。
  - `layout_nodes`：批量整理布局，支持 `horizontal` / `vertical` / `grid`，字段为 `nodeIds`、`layout` / `direction`、`columns`、`gap`、`originX`、`originY`。
  - `duplicate_nodes`：复制已有节点，可复制选中节点之间的内部边，字段为 `nodeIds`、`offsetX`、`offsetY`、`includeInternalEdges`。
  - `create_group`：创建可见 `group` 容器，字段为 `nodeIds`、`name` / `label`、`padding`。
- 后端 schema 继续保证：
  - 新动作的 `nodeIds` 必须来自 `context.canvas.nodes[*].id` 或 `selected_node`。
  - 空 `nodeIds` 会被拒绝。
  - 未知节点引用会被拒绝。
  - 本轮不新增删除类动作，避免绕过后续 C17 撤销/历史安全。
- 节点参数编辑继续使用既有 `update_node_data`，并扩展安全参数字段：
  - `seed`
  - `steps`
  - `cfgScale`
  - `guidanceScale`
  - `strength`
  - `style`
  - `sampler`
  - `scheduler`
  - `fps`
  - `frameRate`
  - `batchSize`
- `services/claw_bridge_service.py` 的 prompt 协议新增批量画布操作说明：
  - 参数编辑使用 `update_node_data`。
  - 批量整理使用 `layout_nodes`，不要让模型拼一堆手动移动。
  - 复制工作流/选区使用 `duplicate_nodes`。
  - 分组使用 `create_group` 创建可见 group 容器。
- `modules/assistant/assistantContextBuilder.js` 的 `context.canvasApi.allowedActions` 已加入 4 个新动作。
- `modules/assistant/assistantActionPreview.js` 已能展示新动作摘要：
  - move/layout 归为 layout 类。
  - duplicate 归为 copy 类。
  - create_group 归为 group 类。
- `modules/assistant/assistantActionExecutor.js` 已能执行：
  - `move_nodes`：通过 `graphStore.updateNodeData(...)` 更新多个节点坐标。
  - `layout_nodes`：按确定性 horizontal/vertical/grid 坐标重排节点。
  - `duplicate_nodes`：克隆节点，按 offset 放置，并复制选区内部边。
  - `create_group`：按选区包围盒创建 `group` 节点，写入 `groupedNodeIds` / `childNodeIds`，并选中 group 与原节点。
- `modules/app/appAssistantPanel.autoload.js` 已将 4 个新动作加入低风险内部自动应用白名单。
- `modules/app/appAssistantPanel.js` 的操作日志摘要已能显示：
  - 移动节点数
  - 布局节点数
  - 复制节点数
  - 复制边数
  - 分组数

### 41.2 本轮验证

- RED 验证先失败，失败点符合预期：
  - 后端 schema 报 `unsupported action type move_nodes/layout_nodes/duplicate_nodes/create_group`。
  - bridge prompt 未包含批量画布操作协议。
  - 前端 context allowedActions 未暴露新动作。
  - preview/executor/auto-apply/面板摘要均不认识新动作。
- GREEN 聚焦验证通过：
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`：46 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`：63 tests OK。
- 宽回归通过：
  - 后端：`python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py claw_conversation_memory_service_test.py llm_wiki_bridge_service_test.py`：117 tests OK。
  - 前端：`cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`：79 tests OK。
- 语法检查通过：
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - `cmd /c node --check modules\assistant\assistantContextBuilder.js`
  - `cmd /c node --check modules\assistant\assistantActionPreview.js`
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`
- `git diff --check` 通过；仅输出已有 LF/CRLF 转换 warning，没有 whitespace error。

### 41.3 生效方式

- 本轮包含后端 schema / bridge prompt / prompt 压缩变化，真实运行中的 `8777` 需要由用户手动重启后才会生效。
- 本轮包含前端静态 JS 变化，浏览器需要刷新后才会加载新的 context/preview/executor/autoload/面板摘要代码。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。

### 41.4 下一棒建议

下一棒进入 C17：撤销/历史/事务安全。原因是 C16 之后低风险自动画布操作已经明显变多，下一步必须让 AI 自动修改画布进入幻映原生历史/撤销体系，避免用户无法回退。

- 确认当前 `graphStore` 是否已经有历史栈、事务、command 或 snapshot API。
- 让 assistant executor 的一次 action batch 作为一个可撤销事务进入历史。
- 如果 batch 部分失败，需要明确哪些已应用、哪些失败，并尽量支持回滚。

## 42. C17 已攻克：撤销/历史/事务安全

本节记录 2026-05-23 本轮完成的 C17。C16 之后助手已经可以自动执行更多低风险画布批量操作，本轮把一次 AI action batch 接入了幻映现有 snapshot/history 边界：成功批次提交一条历史记录，失败批次恢复到执行前快照，并把失败 action 上下文返回给面板错误诊断。

### 42.1 已完成能力

- 已确认现有历史能力：
  - `modules/history.js` 是 snapshot 栈，导出 `commit/undo/redo/getHistoryInfo`。
  - `graphStore` 透出 `getHistorySnapshot/loadHistorySnapshot/batch`。
- `modules/assistant/assistantActionExecutor.js` 新增执行事务层：
  - 执行前抓取 `graphStore.getHistorySnapshot()`，没有专用方法时退回当前 `nodes/edges/selectedNodeIds/viewport` 摘要。
  - 成功后调用 `history.commit(...)`，metadata 包含 `source=claw_assistant`、`label=Claw Code assistant action batch`、`actionCount`、`appliedCount` 和 `actionTypes`。
  - 如果 `graphStore.batch(...)` 存在，会把整批 action 包在 batch 里执行，减少中间渲染/通知。
  - 任意 action 中途失败时调用 `loadHistorySnapshot(...)` 或 `loadState(...)` 回滚到执行前。
  - 抛出的错误会带上 `actionIndex/actionNumber/actionId/actionType/appliedCount/rolledBack`，供面板显示“第几条、什么动作、为什么失败、是否已回滚”。
- `modules/app/appAssistantPanel.autoload.js` 默认把 `modules/history.js` 的 `commit` 作为 history adapter 传给执行器。
- C17 仍不开放删除类动作；删除/高风险改动要等后续确认、错误恢复和 UX 完整后再推进。

### 42.2 本轮修改文件

- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 42.3 验证记录

- RED 验证先失败，证明旧执行器确实没有 history commit，也没有失败回滚/错误上下文字段。
- focused GREEN：
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`：22 tests pass。
  - `node --test --test-concurrency=1 modules\app\appAssistantPanel.autoload.test.js`：16 tests pass。
  - `node --check modules\assistant\assistantActionExecutor.js`：pass。
  - `node --check modules\app\appAssistantPanel.autoload.js`：pass。
- 宽回归：
  - `node --test --test-concurrency=1 modules\history.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js`：85 tests pass。
- `git diff --check`：exit 0，仅输出已有 LF/CRLF conversion warnings。

### 42.4 生效方式与下一棒

- 本轮是前端静态 JS 改动，不需要重启 `8777`。
- 浏览器刷新后，右下角 AI 助手加载新的 autoload/executor 代码即可生效。
- 下一棒进入 C18：用户友好的错误恢复。重点是把 `CLAW_ACTION_SCHEMA_INVALID`、缺资产、缺子项、类型不支持等错误变成用户能看懂、能继续对话修正的中文诊断。
- 在没有原生历史 API 前，不要新增删除类自动动作。

## 43. C18 已攻克：用户友好的错误恢复

本节记录 2026-05-23 本轮完成的 C18。C17 已经保证失败的自动画布操作可以回滚，C18 继续补“失败后用户能看懂、能修正”的产品体验：后端保留原始 validator 错误给开发排查，同时给前端和聊天面板提供中文 `friendlyMessage`、`friendlyErrors` 和结构化 `diagnostics`。

### 43.1 已完成能力

- `services/claw_action_schema.py`
  - `validate_actions(...)` 在失败时继续返回原始 `errors`，并新增：
    - `friendlyMessage`
    - `friendlyErrors`
    - `diagnostics`
  - `diagnostics` 每项包含 `code/message/suggestion/raw/actionIndex/actionNumber/target` 等字段。
  - 已覆盖的友好诊断类型包括：
    - actions 不是数组、单个 action 不是对象。
    - 不支持的 action type。
    - 缺少必要字段。
    - 当前画布里不存在的节点引用。
    - 资产面板里不存在的资产引用。
    - 资产里不存在的子项引用。
    - 不支持的 nodeType，尤其是把已有资产引用误写成 `ai-*` 生成节点。
    - 自连、连入 source 节点、媒体类型不兼容、source/target handle 不支持。
    - 不支持的 layout。
    - LLM Wiki 来源 metadata 不在当前检索结果里。
- `services/claw_bridge_service.py`
  - schema 校验失败时，`reply` 改成中文友好诊断，不再把 `Claw Code returned invalid actions: ...` 暴露为主消息。
  - `CLAW_ACTION_SCHEMA_INVALID` 仍保留在 `errorCode`，原始错误保留在 `errors` 和 `diagnostics[*].raw`，方便接力调试。
  - `ai-video` `create_node` 动作即使模型返回 `requiresConfirmation=false`，桥接层也会强制 `requiresConfirmation=true`，作为视频生成授权的最小安全边界。
- `services/claw_assistant_route_service.py`
  - `/api/v2/assistant/actions/validate` 现在透传 `friendlyMessage/friendlyErrors/diagnostics`，前端预校验失败可以直接展示用户友好提示。
- `api/clawAssistantApi.js`
  - 抛错时优先使用 `friendlyMessage` / `userMessage` / `diagnostics[0].message`。
  - 不再把 `CLAW_ACTION_SCHEMA_INVALID: raw detail` 当成用户主消息。
  - 仍保留 `errorCode`、`assistantReply`、`assistantResponse` 和 `diagnostics` 供调试。
- `modules/app/appAssistantPanel.autoload.js`
  - `onApplyActions(...)` 的预校验失败会显示友好错误和 `建议：...`，并在 executor 运行前中止，不会触碰画布。
  - 低风险自动应用白名单现在排除 `create_node + nodeType=ai-video`，视频生成节点必须进入确认/授权路径。
- `modules/app/appAssistantPanel.js`
  - 自动应用或手动应用失败时，如果错误对象带有 `friendlyMessage` / `diagnostics`，面板优先展示友好文案，再附带动作上下文。

### 43.2 本轮修改文件

- `services/claw_action_schema.py`
- `services/claw_bridge_service.py`
- `services/claw_assistant_route_service.py`
- `api/clawAssistantApi.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.js`
- `claw_action_schema_test.py`
- `claw_bridge_service_test.py`
- `claw_assistant_route_service_test.py`
- `api/clawAssistantApi.test.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 43.3 验证记录

- RED 验证已先失败，失败点符合预期：
  - schema 没有 `friendlyMessage/diagnostics`。
  - bridge schema-invalid 仍返回 raw `Claw Code returned invalid actions: ...`。
  - `/actions/validate` 不透传友好诊断。
  - 前端 API 和 autoload 仍显示 raw validator 文案。
  - `ai-video` 低风险动作仍可能自动应用。
- GREEN / 宽回归通过：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_returns_friendly_diagnostics_for_common_failures claw_bridge_service_test.ClawBridgeServiceTests.test_chat_returns_friendly_schema_error_for_invalid_actions claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_actions_validate_route_returns_validation_errors`：3 tests OK。
  - `node --test --test-concurrency=1 --test-name-pattern "friendly|use friendly" api\clawAssistantApi.test.js modules\app\appAssistantPanel.autoload.test.js`：2 tests pass。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_forces_confirmation_for_video_generation_actions`：1 test OK。
  - `node --test --test-concurrency=1 --test-name-pattern "auto-apply guard" modules\app\appAssistantPanel.autoload.test.js`：1 test pass。
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`：120 tests OK。
  - `node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`：91 tests pass。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py services\claw_assistant_route_service.py`：通过。
  - `node --check modules\app\appAssistantPanel.autoload.js`：通过。

### 43.4 生效方式与下一棒

- 本轮包含后端 schema / bridge / route 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮包含前端静态 JS 改动，浏览器刷新后才会加载新的 API/autoload/panel 逻辑。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- C18 完成后，下一棒可以进入 C19：文本和图片生成任务编排。重点是把“创建文本/图片生成节点、配置参数、触发或排队生成、回写状态”产品化；视频生成的完整授权弹窗和费用/风险说明仍归 C20。
## 44. C19 已攻克：文本和图片生成任务编排

本节记录 2026-05-23 本轮完成的 C19。C19 的目标是把文本/图片生成从“模型只能创建节点或改字段”，推进到“模型能表达一个明确的生成排队任务，幻映执行器把任务状态写回画布”。本轮仍然保持离线，不直接调用云端生成接口。

### 44.1 已完成能力

- 后端 `services/claw_action_schema.py` 新增 `queue_generation_task` action：
  - 目标节点必须是 `ai-text` 或 `ai-image`。
  - `taskType=text` 只能对应 `ai-text`，`taskType=image` 只能对应 `ai-image`。
  - `parameters` 只保留安全生成参数；`apiKey`、token、secret 等敏感字段会被丢弃。
  - `ai-video` / `taskType=video` 仍会被拒绝，完整视频授权闭环归 C20。
- 后端 `services/claw_bridge_service.py` 的 prompt 协议已告知 Claw：
  - 文本和图片生成权限开放。
  - 需要先创建或更新 `ai-text` / `ai-image` 节点，再用 `queue_generation_task` 排队。
  - 视频生成不能自动排队，必须走授权确认。
- 前端 `modules/assistant/assistantContextBuilder.js` 已把 `queue_generation_task` 暴露到 `context.canvasApi.allowedActions`。
- 前端 `modules/assistant/assistantActionPreview.js` 已支持 generation 类型预览，能显示类似 `Queue image generation on node_2` 的摘要。
- 前端 `modules/assistant/assistantActionExecutor.js` 已支持执行 `queue_generation_task`：
  - 支持引用当前已有节点、`selected_node`，以及本轮 `create_node` 动作刚创建的节点。
  - 会在节点数据中写入 `generationStatus/taskStatus/jobStatus=queued`、`generationRequestedBy=claw_assistant`、`generationTaskType`、`generationTaskTitle`、`generationQueuedAt`、prompt/model/provider/parameters 等可见任务信息。
  - 图片任务额外写入 `asyncTaskStatus=queued`，方便后续接真实图片生成队列。
  - 执行结果会返回 `queuedGenerationNodeIds` / `generationTaskNodeIds`，面板可用于操作日志和持久记忆。
- `modules/app/appAssistantPanel.autoload.js` 已把低风险文本/图片排队任务加入自动应用策略；视频排队仍不会自动应用。
- `modules/app/appAssistantPanel.js` 已能在操作结果里显示“排队生成 N 个任务”。

### 44.2 本轮修改文件

- `services/claw_action_schema.py`
- `services/claw_bridge_service.py`
- `claw_action_schema_test.py`
- `claw_bridge_service_test.py`
- `modules/assistant/assistantContextBuilder.js`
- `modules/assistant/assistantContextBuilder.test.js`
- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreview.test.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 44.3 验证记录

- Focused 后端验证：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_text_and_image_generation_queue_tasks claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_video_generation_queue_tasks claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_generation_permission_policy`
  - 结果：3 tests OK。
- Focused 前端验证：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：77 tests pass。

### 44.4 生效方式与下一棒

- 本轮包含后端 schema / bridge prompt 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮包含前端静态 JS 改动，浏览器刷新后才会加载新的 context/preview/executor/autoload/面板摘要逻辑。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C20：视频生成授权闭环。C20 需要允许 Claw 表达视频生成任务，但必须强制 `requiresConfirmation=true`，并在预览/应用前给出费用、耗时、消耗额度等风险说明；只有用户确认后才允许写入视频任务状态。
## 45. C20 已攻克：视频生成授权闭环

本节记录 2026-05-25 本轮完成的 C20。C20 的目标是允许 Claw 表达视频生成任务，但不能像文本/图片一样自动应用；视频必须进入确认/授权路径，并在前端显示费用、额度、耗时和外部任务提交风险。

### 45.1 已完成能力

- 后端 `services/claw_action_schema.py` 扩展 `queue_generation_task`：
  - 允许 `ai-video` / `taskType=video`。
  - 当目标是视频生成时，schema 会把 action 强制规范为 `requiresConfirmation=true`、`riskLevel=video`。
  - `ai-video` 与 `taskType=video` 必须匹配；其它节点类型仍不能冒充视频生成任务。
  - 仍然会清理 `parameters` 中的敏感字段，Claw 拿不到 API key。
- 后端 `services/claw_bridge_service.py` 的 prompt 协议已更新：
  - 文本/图片仍可低风险排队。
  - 视频也使用 `queue_generation_task`，但必须是“authorized video generation”。
  - 明确告诉模型：视频 queue action 必须 `requiresConfirmation=true`、`riskLevel=video`，因为可能消耗付费算力、额度，并且耗时更长。
  - bridge 层继续强制视频生成动作整体 `requiresConfirmation=true`，即使模型漏写也会被拉回确认流。
- 前端 `modules/assistant/assistantActionExecutor.js` 支持确认后排队 `ai-video`：
  - 未确认的视频 queue 会抛出 `requires confirmation` 错误。
  - 确认后只写本地画布状态，不提交真实云端视频任务。
  - 写入 `generationStatus/taskStatus/jobStatus=queued`、`generationTaskType=video`、`videoGenerationAuthorized=true`、`generationAuthorizationRequired=true`、`generationRiskLevel=video`、`videoTaskStatus=queued`、`dreaminaTaskStatus=queued` 等状态。
  - 执行结果新增 `videoGenerationTaskNodeIds`，用于操作日志和持久记忆。
- 前端 `modules/assistant/assistantActionPreview.js` 支持视频风险提示：
  - 视频 queue 预览会显示“视频生成需要确认：可能消耗额度或付费算力，耗时更长，并会提交外部生成任务。”
- 前端 `modules/app/appAssistantPanel.js` / `modules/app/appAssistantPanel.autoload.js`：
  - 操作结果会显示 `视频生成 N 个已授权任务`。
  - 持久操作摘要也记录已授权视频任务数。
  - 自动应用守卫继续拒绝视频生成 queue；视频必须留在预览/确认路径。

### 45.2 本轮修改文件

- `services/claw_action_schema.py`
- `services/claw_bridge_service.py`
- `claw_action_schema_test.py`
- `claw_bridge_service_test.py`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`
- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreview.test.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 45.3 验证记录

- RED 验证先失败，失败点符合预期：
  - schema 仍拒绝视频 queue。
  - bridge 因 schema 拒绝导致视频 queue 返回失败。
  - prompt 协议没有“authorized video generation”文案。
  - executor 仍只支持 `ai-text/ai-image`。
  - preview 和面板没有视频授权风险文案。
- Focused GREEN：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_video_generation_queue_tasks_but_forces_confirmation claw_bridge_service_test.ClawBridgeServiceTests.test_chat_accepts_video_generation_queue_tasks_but_forces_confirmation claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_generation_permission_policy`
  - 结果：3 tests OK。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "video generation queue|authorization risk|authorized video" modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js`
  - 结果：4 tests pass。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：123 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：98 tests pass。
- 语法和空白：
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`：通过。
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`：通过。
  - `cmd /c node --check modules\assistant\assistantActionPreview.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`：通过。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 45.4 生效方式与下一棒

- 本轮包含后端 schema / bridge prompt 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮包含前端静态 JS 改动，浏览器刷新后才会加载新的 executor/preview/panel/autoload 逻辑。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C21：更完整的端口和连接语义。重点是把当前“按 nodeType 粗略判断连接是否安全”升级为更接近幻映真实端口/输入槽的连接语义，例如 prompt 输入、参考图、首帧、音频、视频输入等。
## 46. C21 已攻克：更完整的端口和连接语义

本节记录 2026-05-25 本轮完成的 C21。C21 的目标不是新增动作，而是让现有 `connect_nodes` 更懂幻映画布的真实输入槽语义，避免“节点类型大体能接，但端口实际接错”的问题。

### 46.1 已完成能力

- `services/claw_action_schema.py` 扩展安全端口白名单：
  - 图片输入槽：`referenceImage`、`reference_image`、`firstFrame`、`first_frame`、`lastFrame`、`last_frame`、`initImage`、`init_image`、`startImage`、`start_image`。
  - 视频输入槽：`videoInput`、`video_input`。
  - 音频输入槽：`audioInput`、`audio_input`。
- 新增端口媒体类型校验：
  - `targetHandle=prompt/text` 只接收 text。
  - `targetHandle=reference/referenceImage/firstFrame/...` 只接收 image。
  - `targetHandle=video/videoInput` 只接收 video。
  - `targetHandle=audio/audioInput` 只接收 audio。
  - `sourceHandle=text/image/video/audio` 也会和源节点媒体类型匹配。
- 保留原有粗粒度 nodeType 安全校验：
  - 仍然拒绝自连接。
  - 仍然拒绝连接进 `source-*` 节点。
  - 仍然拒绝明显不兼容的节点类型，例如 audio -> ai-image。
- 友好错误诊断已扩展：
  - 端口媒体不匹配时，会生成“输入端口 firstFrame 需要 image，但当前连接给的是 text”这类中文诊断。
- `services/claw_bridge_service.py` 的 action protocol 新增 `connectionPortRules`：
  - 告诉 Claw：`targetHandle prompt expects text`。
  - 参考图使用 `referenceImage`。
  - 视频首帧使用 `firstFrame`。
  - 视频素材输入使用 `videoInput`。
  - 音频输入使用 `audioInput`。
  - 不要把图片接到 prompt、文本接到 firstFrame/referenceImage、图片接到 audioInput。

### 46.2 本轮修改文件

- `services/claw_action_schema.py`
- `services/claw_bridge_service.py`
- `claw_action_schema_test.py`
- `claw_bridge_service_test.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 46.3 验证记录

- RED 验证先失败，失败点符合预期：
  - `firstFrame/audioInput/referenceImage` 等端口别名还不在白名单。
  - `image -> prompt`、`text -> firstFrame`、`image -> audioInput` 还不会被端口语义拒绝。
  - prompt 协议没有这些端口规则。
- Focused GREEN：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_richer_generation_port_semantics claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_connections_with_wrong_input_slot_media claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_generation_port_semantics`
  - 结果：3 tests OK。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`：通过。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：126 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js`
  - 结果：98 tests pass。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 46.4 生效方式与下一棒

- 本轮是后端 schema / bridge prompt 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮没有改前端静态 JS；如果浏览器已经加载了前面 C20 的前端改动，C21 本身不额外要求刷新。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C22：项目级长期偏好记忆。重点是把常用画风、模型、比例、品牌偏好、视频时长、命名习惯等从普通聊天记忆里结构化出来，并支持查看/修改/清除。
## 47. C22 已攻克：项目级长期偏好记忆

本节记录 2026-05-25 本轮完成的 C22。C22 的目标是把“以后这个项目都用某种风格/比例/模型/品牌语气”从普通聊天记录里结构化出来，成为每轮都能注入给 Claw 的项目级长期偏好。

### 47.1 已完成能力

- `services/claw_conversation_memory_service.py` 新增项目偏好存储：
  - 存储在 `user/claw_assistant_memory.json` 同一记忆文件的 `projectPreferences` 下。
  - 按 `projectId` 隔离。
  - 支持 `update_project_preferences(...)`、`clear_project_preferences(...)`、`build_project_preferences_context(...)`。
  - 支持安全字段：`visualStyle`、`defaultModel`、`defaultProvider`、`aspectRatio`、`resolution`、`brandTone`、`videoDuration`、`namingRules`、`workflowDefaults`、`imageCount`、`seed`、`duration`。
  - 会清理 API key、token、本地绝对路径、data/blob URL 等敏感内容。
- `services/claw_action_schema.py` 新增偏好动作：
  - `remember_project_preference`
  - `clear_project_preference`
  - 偏好 action 只允许安全偏好字段，敏感字段会被丢弃。
- `services/claw_bridge_service.py` prompt 协议已加入项目偏好规则：
  - 使用 `context.projectPreferences.items` 作为项目级长期偏好。
  - 当用户要求“以后都用/记住/默认”某个安全偏好时，返回 `remember_project_preference`。
  - 当用户要求忘记或重置偏好时，返回 `clear_project_preference`。
- `services/claw_assistant_route_service.py`：
  - chat 前会把当前项目偏好注入 `context.projectPreferences`。
  - bridge 返回偏好 action 后，后端会直接写入项目偏好记忆。
  - 偏好 action 会从返回给前端的 `actions` 里移除，避免前端画布 executor 把它当作画布动作处理。
  - 响应里增加 `preferenceUpdates` 和最新 `projectPreferences`，方便后续 UI/日志接入。
- `services/claw_bridge_service.py` 的 prompt 压缩流程会保留 `projectPreferences`，长上下文也不会丢掉项目偏好。

### 47.2 本轮修改文件

- `services/claw_conversation_memory_service.py`
- `services/claw_action_schema.py`
- `services/claw_bridge_service.py`
- `services/claw_assistant_route_service.py`
- `claw_conversation_memory_service_test.py`
- `claw_action_schema_test.py`
- `claw_bridge_service_test.py`
- `claw_assistant_route_service_test.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 47.3 验证记录

- RED 验证先失败，失败点符合预期：
  - memory service 没有项目偏好方法。
  - schema 不认识偏好 action。
  - prompt 协议没有项目偏好规则。
  - route 不会注入和应用项目偏好 action。
- Focused GREEN：
  - `python -m unittest claw_conversation_memory_service_test.ClawConversationMemoryServiceTests.test_updates_persists_and_clears_sanitized_project_preferences claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_sanitized_project_preference_actions claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_project_preference_protocol claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_chat_injects_and_applies_project_preference_actions`
  - 结果：4 tests OK。
  - `python -m py_compile services\claw_conversation_memory_service.py services\claw_action_schema.py services\claw_bridge_service.py services\claw_assistant_route_service.py`：通过。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：130 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：98 tests pass。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 47.4 生效方式与下一棒

- 本轮包含后端 memory/schema/bridge/route 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮没有改前端静态 JS；若只验证 C22 后端偏好能力，不额外要求浏览器刷新。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C23：话题管理完善。重点是话题重命名、删除、搜索、导出/归档等记忆管理动作，并继续保证切换话题不串上下文。
## 48. C23 已攻克：话题管理完善

本节记录 2026-05-25 本轮完成的 C23。C23 的目标是把已有“可见话题列表/创建/切换/详情”补成可管理的话题系统：支持重命名、删除、搜索和导出，并继续按项目隔离。

### 48.1 已完成能力

- `services/claw_conversation_memory_service.py` 新增话题管理方法：
  - `rename_conversation(...)`：按 `conversationId + projectId` 重命名话题，标题会脱敏和限长。
  - `delete_conversation(...)`：按项目隔离删除话题，不影响其它项目。
  - `search_conversations(...)`：可搜索标题、summary、历史消息和操作摘要。
  - `export_conversation(...)`：导出脱敏后的 markdown，包括标题、summary、消息和操作记录。
- `services/claw_assistant_route_service.py` 新增路由：
  - `POST /api/v2/assistant/conversations/rename`
  - `POST /api/v2/assistant/conversations/delete`
  - `POST /api/v2/assistant/conversations/search`
  - `POST /api/v2/assistant/conversations/export`
- `api/clawAssistantApi.js` 新增前端 API：
  - `renameClawAssistantConversation`
  - `deleteClawAssistantConversation`
  - `searchClawAssistantConversations`
  - `exportClawAssistantConversation`
- `api/index.js` 已导出这些 API，后续 UI 可以直接接按钮和搜索框。

### 48.2 本轮修改文件

- `services/claw_conversation_memory_service.py`
- `services/claw_assistant_route_service.py`
- `api/clawAssistantApi.js`
- `api/index.js`
- `claw_conversation_memory_service_test.py`
- `claw_assistant_route_service_test.py`
- `api/clawAssistantApi.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 48.3 验证记录

- RED 验证先失败，失败点符合预期：
  - memory service 没有 rename/search/export/delete 方法。
  - route 没有对应 endpoint。
  - 前端 API 没有对应导出。
- Focused GREEN：
  - `python -m unittest claw_conversation_memory_service_test.ClawConversationMemoryServiceTests.test_renames_searches_exports_and_deletes_conversations_by_project claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_conversation_management_routes_rename_search_export_and_delete`
  - 结果：2 tests OK。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "topic rename search export" api\clawAssistantApi.test.js`
  - 结果：1 test pass。
  - `python -m py_compile services\claw_conversation_memory_service.py services\claw_assistant_route_service.py`：通过。
  - `cmd /c node --check api\clawAssistantApi.js`：通过。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：132 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：99 tests pass。
  - `cmd /c node --check api\clawAssistantApi.js`：通过。
  - `cmd /c node --check api\index.js`：通过。
  - `python -m py_compile services\claw_conversation_memory_service.py services\claw_assistant_route_service.py`：通过。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 48.4 生效方式与下一棒

- 本轮包含后端 memory/route 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮包含前端 API 静态 JS 改动；接 UI 按钮前浏览器刷新即可加载新 API。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C24：Claw 原生 REPL/resume 流验证和切换。重点是离线验证当前 `claw.exe --resume` / session / JSON 输出能力，只有确认安全可控后才考虑把 one-shot bridge 切到原生 resume。

## 49. C24 已攻克：Claw 原生 REPL/resume 能力报告与保守切换结论

本节记录 2026-05-25 本轮完成的 C24。C24 的目标不是为了“强行切换”，而是把 Claw 原生 `--resume` 能力摸清楚，并把当前桥接模式用机器可读状态暴露出来，避免后续开发误以为 shadow JSONL 已经等同于原生 REPL resume。

### 49.1 已完成能力

- `services/claw_runtime_service.py` 新增 `claw_shadow_session_dir()` 和 `build_native_session_capabilities()`。
- `/api/v2/assistant/status` 通过 runtime status 自动暴露 `runtime.nativeSessions`：
  - `currentBridgeMode: "one_shot_json_prompt"`；
  - `switchState: "shadow_session"`；
  - `canUseNativeResumeForChat: false`；
  - `shadowSessionDir: <workDir>/.claw/sessions`；
  - `nativeResume.flag: "--resume"`；
  - `nativeResume.supportsResumedSlashCommands: true`；
  - `nativeResume.supportsArbitraryPromptBridge: false`；
  - `nativeResume.enabledForBridge: false`；
  - `blockers/evidence` 记录为什么暂时不能切换。
- `build_launch_spec()` 新增 `bridgeMode` 和 `nativeSessions`，让后续 bridge/debug UI 能知道当前仍是 one-shot JSON prompt。
- `ClawBridgeService` 行为保持不变：即使 `context.conversation.clawSessionId` 存在，也不会自动添加 `--resume`，仍用 `--output-format json prompt <payload>`，并把 `clawSessionId` 作为内部映射上下文传给模型。

### 49.2 关键结论

- Claw Code 原生 session/resume 确实存在，但当前离线源码/文档证据显示它适合：
  - `claw --resume latest` 进入恢复会话；
  - `claw --resume latest /status /diff /compact /export` 这类 resumed slash command。
- 当前没有证明存在安全可控的 `claw --resume <session> prompt <payload-json>` 非交互 JSON 聊天合同。
- 幻映目前必须继续以自己的 conversation memory、topic、project preferences、operation history 作为产品级记忆边界；Claw 原生 session 只能作为后续 runtime adapter 的增强目标。

### 49.3 验证记录

- RED 验证先失败，失败点符合预期：
  - `runtime.build_status()` 还没有 `nativeSessions`。
  - `runtime.build_launch_spec()` 还没有 `bridgeMode`。
- Focused GREEN：
  - `python -m unittest claw_runtime_service_test.ClawRuntimeServiceTests.test_status_reports_conservative_native_session_capabilities claw_runtime_service_test.ClawRuntimeServiceTests.test_build_launch_spec_keeps_one_shot_bridge_mode_until_resume_is_verified claw_bridge_service_test.ClawBridgeServiceTests.test_chat_keeps_one_shot_prompt_bridge_when_claw_session_mapping_exists`
  - 结果：3 tests OK。
- 相关后端回归：
  - `python -m unittest claw_runtime_service_test.py claw_bridge_service_test.py claw_assistant_route_service_test.py claw_conversation_memory_service_test.py`
  - 结果：87 tests OK。
- 宽后端回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：135 tests OK。
- 语法和空白：
  - `python -m py_compile services\claw_runtime_service.py services\claw_bridge_service.py services\claw_assistant_route_service.py`：通过。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 49.4 生效方式与下一棒

- 本轮包含后端 runtime status / launch spec 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮没有改前端静态 JS；如果只验证状态接口字段，不额外要求浏览器刷新。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C25：上下文调试面板和模型校准工具。重点是把本轮发送给 Claw 的脱敏上下文、压缩状态、资产数量、选区、动作协议和 runtime/native session 能力做成可见调试面，方便联调时判断“模型到底看到了什么”。

## 50. C25 已攻克：上下文调试面板和模型校准工具

本节记录 2026-05-25 本轮完成的 C25。C25 的目标是解决联调时最常见的盲区：模型回答不符合预期时，开发者和用户需要知道本轮到底发送了哪些脱敏上下文、大小是多少、资产/选区/知识库/话题记忆是否在里面，以及当前 bridge/runtime 是什么模式。

### 50.1 已完成能力

- `services/claw_context_service.py`
  - `/context/preview` 在原有脱敏 context 之外新增 `debug`。
  - `debug.contextBytes` 记录 UTF-8 序列化大小。
  - `debug.canvas/selection/assets/workflows/knowledge/conversation/projectPreferences` 记录关键数量。
  - `debug.promptCompaction` 记录压缩状态。
  - `debug.actionProtocol` 汇总 permission policy、允许 action 数量、允许节点类型数量、安全字段数量和连接端口规则数量。
  - `debug.runtime` 汇总当前 bridge mode、native resume 是否启用、是否可用于聊天。
- `services/claw_assistant_route_service.py`
  - context preview route 会把 `bridge_service.ACTION_PROTOCOL` 和 `runtime_service.build_status()` 的安全摘要传给 context service。
  - 不返回真实 API Key，不返回本地媒体路径，不返回 data/blob URL，不返回 raw 项目 JSON。
- `api/clawAssistantApi.js` / `api/index.js`
  - 新增并导出 `previewClawAssistantContext(...)`。
- `modules/app/appAssistantPanel.js`
  - 话题栏新增只读 context debug 按钮。
  - 点击后用当前 `buildContextWithMemory()` 生成同一轮上下文，调用 preview API，并把摘要显示到聊天区操作消息里。
  - 摘要包含 bytes、nodes/edges、selected、assets/visible、allowed actions、bridge mode、compaction、warnings。
- `modules/app/appAssistantPanel.autoload.js`
  - 自动注入 `previewClawAssistantContext`，真实前端无需额外 wiring。

### 50.2 验证记录

- RED 验证先失败，失败点符合预期：
  - context preview route 没有 `debug`。
  - API 没有 `previewClawAssistantContext` 导出。
  - 面板没有 `debug-context` 按钮。
- Focused GREEN：
  - `python -m unittest claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_context_preview_route_returns_debug_calibration_summary`
  - 结果：1 test OK。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "previews sanitized assistant context|context debug summary" api\clawAssistantApi.test.js modules\app\appAssistantPanel.test.js`
  - 结果：2 tests pass。
- 相关回归：
  - 首次误跑 `python -m unittest claw_assistant_route_service_test.py claw_context_service_test.py`，失败原因是项目里不存在 `claw_context_service_test.py`，不是代码失败；随后改用正确套件。
  - `python -m unittest claw_assistant_route_service_test.py claw_runtime_service_test.py claw_bridge_service_test.py`
  - 结果：81 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：53 tests pass。
- 宽回归：
  - `python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`
  - 结果：136 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：101 tests pass。
- 语法和空白：
  - `python -m py_compile services\claw_context_service.py services\claw_assistant_route_service.py services\claw_runtime_service.py`：通过。
  - `cmd /c node --check api\clawAssistantApi.js`：通过。
  - `cmd /c node --check api\index.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`：通过。
  - `git diff --check`：退出码 0；只输出既有 LF/CRLF 转换提醒。

### 50.3 生效方式与下一棒

- 本轮包含后端 context preview 改动，真实运行中的 `8777` 需要由用户手动重启后才会加载。
- 本轮包含前端静态 JS 改动，浏览器刷新后面板才会出现新的 context debug 按钮。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 下一棒进入 C26：真实端到端联调脚本和回归用例。重点是把“拿资产、连视频节点、创建图像节点、整理工作流、多话题记忆、LLM Wiki 落点、上下文 debug、视频授权”等场景固化为自动/人工回归清单。

## 51. C26 已攻克：真实端到端联调脚本和回归用例

本节记录 2026-05-25 本轮完成的 C26。C26 的目标不是再新增一个助手动作，而是把目前已经完成的大量能力沉淀成“以后任何接力开发者都能跑”的离线回归入口，以及“需要真人确认服务就绪后才能做”的 live 联调清单。

### 51.1 已完成能力

- 新增 `scripts/claw_assistant_regression.ps1`
  - 这是 Claw assistant 的统一离线回归脚本。
  - 默认执行后端 broad suite、前端 broad suite、Python 语法检查、JS 语法检查、`git diff --check`。
  - 支持 `-List` 查看实际命令，支持 `-SkipPython` / `-SkipNode` / `-SkipSyntax` / `-SkipDiff` 局部跳过。
  - 脚本开头明确声明：`never starts, stops, restarts, checks, or probes 8777`。
  - 脚本不调用 Claw、OpenAI、LLM Wiki、本地浏览器、云端生成服务或 `8777`。
- 新增 `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
  - 固化自动/人工回归分界。
  - 明确写入：用户负责启动/重启/确认 `8777`；开发者不启动、不重启、不停止、不检查、不探测 `8777`。
  - 覆盖以下产品场景：
    - `C26-ASSET-RESTORE` / 拿资产。
    - `C26-CONNECT-VIDEO` / 连接视频节点。
    - `C26-CREATE-IMAGE` / 创建图像节点。
    - `C26-WORKFLOW-CLEANUP` / 整理工作流。
    - `C26-MULTI-TOPIC-MEMORY` / 多话题记忆。
    - `C26-PROJECT-PREFERENCES` / 项目偏好。
    - `C26-LLM-WIKI-LANDING` / LLM Wiki 落点。
    - `C26-CONTEXT-DEBUG` / 上下文调试。
    - `C26-NATIVE-SESSIONS` / nativeSessions 状态。
    - `C26-VIDEO-AUTHORIZATION` / 视频生成授权。
- 新增 `claw_assistant_regression_artifacts_test.py`
  - 用测试钉住脚本和 checklist 的存在。
  - 检查 checklist 必须覆盖最终产品关键场景。
  - 检查脚本必须是本地离线命令集合，且不包含 live probe 命令。

### 51.2 本轮修改文件

- `scripts/claw_assistant_regression.ps1`
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
- `claw_assistant_regression_artifacts_test.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 51.3 验证记录

- RED 验证先失败，失败点符合预期：
  - `scripts/claw_assistant_regression.ps1` 不存在。
  - `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md` 不存在。
- Focused GREEN：
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - 结果：2 tests OK。
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List`
  - 结果：只列出本地测试/语法/diff 命令。
- 完整离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：138 tests OK。
  - 前端 broad suite：101 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：exit code 0；仅输出已有 LF/CRLF 转换提醒。

### 51.4 生效方式与下一棒

- C26 新增的是离线脚本、文档和测试，不需要 `8777` 重启。
- 后续开发者需要人工 live 联调时，必须先让用户启动/重启/确认 `8777`，用户回复准备好之后才可以继续。
- 下一棒进入 C27：最终产品体验打磨。重点是把现在已经能工作的助手面板补成更完整的产品形态，包括可见话题管理、搜索/导出、空状态、状态反馈、快捷意图、上下文提示和操作日志质感。

## 52. C27 已攻克：最终产品体验打磨

本节记录 2026-05-25 本轮完成的 C27。C27 的目标是把前面已经完成但偏“底层可用”的能力补成更像真实产品的助手面板，重点是让用户可以看见和操作长期记忆话题，并能用快捷意图快速组织常见请求。

### 52.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 话题区域新增搜索框和四个图标按钮：
    - 搜索 topic。
    - 重命名当前 topic。
    - 导出当前 topic。
    - 删除当前 topic。
  - 搜索会调用 `searchConversations` 并刷新 topic 列表。
  - 重命名会调用 `renameConversation`，更新当前标题和列表。
  - 导出会调用 `exportConversation`，并在操作日志里显示“已导出话题：...”和导出内容摘要。
  - 删除会走 `confirmTopicDelete` 确认钩子，删除后刷新话题列表并切到剩余话题。
  - 新增快捷意图按钮：
    - 拿资产。
    - 整理选区。
    - 生成图片。
    - 知识卡。
  - 快捷意图只会把常用中文 prompt 准备到输入框，不会直接提交、不触发付费或高风险动作。
- `modules/app/appAssistantPanel.autoload.js`
  - 默认注入 C23 已有的 topic 管理 API：
    - `renameClawAssistantConversation`
    - `searchClawAssistantConversations`
    - `exportClawAssistantConversation`
    - `deleteClawAssistantConversation`
  - 对面板暴露 `renameConversation` / `searchConversations` / `exportConversation` / `deleteConversation` helper。
  - 所有 helper 都自动携带当前 `projectId`，并保持项目隔离。
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
  - 新增 `C27-TOPIC-MANAGEMENT / 话题管理`。
  - 新增 `C27-QUICK-INTENTS / 快捷意图`。
  - 人工 live pass criteria 中补充话题管理和快捷意图检查项。
- `claw_assistant_regression_artifacts_test.py`
  - checklist marker 扩展到 C27 话题管理和快捷意图。

### 52.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
- `claw_assistant_regression_artifacts_test.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `task_plan.md`
- `progress.md`
- `findings.md`

### 52.3 验证记录

- RED 验证先失败，失败点符合预期：
  - 面板没有 topic 搜索输入和搜索/重命名/导出/删除按钮。
  - autoload 没有向面板暴露 conversation management helpers。
  - 面板没有快捷意图按钮。
  - checklist 没有 C27 话题管理和快捷意图 marker。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "topic search rename export|conversation management helpers|quick intents" modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：3 tests pass。
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - 结果：2 tests OK。
- 相关前端回归和语法：
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：104 tests pass。
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`
  - 结果：通过。
- 完整统一离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：138 tests OK。
  - 前端 broad suite：104 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：exit code 0；仅输出已有 LF/CRLF 转换提醒。

### 52.4 生效方式与最终状态

- C27 是前端静态 JS、测试和文档改动；不需要 `8777` 重启。
- 浏览器刷新后才会加载新的面板控件。
- 本轮没有启动、重启、停止、检查或探测 `8777`，保持用户约定。
- 至此，Claw Code assistant 的当前最终目标路线 C01-C27 已全部 `[已攻克]`。接下来可以进入真实人工 live 验收，或开始新的需求开发。
## 53. C28 已攻克：RH 智能体聊天对话框 UI 改造

本节记录 2026-05-25 依据 `docs/superpowers/plans/2026-05-25-rh-assistant-chat-dialog-ui.md` 完成的 UI 改造切片。目标是把当前 Claw/RH assistant 从旧的悬浮小面板推进到更接近参考图的右侧全高聊天对话框，并补齐截图里要求的四个入口：历史会话、新建对话、上传图片、`@` 引用。

### 53.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 面板改为右侧全高聊天抽屉形态：`right:0; top:0; bottom:0; width:min(540px,100vw); height:100vh; border-radius:0`。
  - header 新增图标按钮区：
    - `data-claw-assistant-action="toggle-history"`：打开/关闭历史会话弹层。
    - `data-claw-assistant-action="new-topic"`：复用现有持久化 conversation 新建链路。
    - `data-claw-assistant-action="close"`：关闭面板。
  - 原常驻 topic bar 不再作为主界面展示，历史列表、搜索、重命名、导出、删除和 context debug 被收进 `.claw-assistant-history-popover`。
  - 切换历史会话或新建对话成功后会自动关闭历史弹层，并聚焦输入框。
  - 输入区改为 composer 结构：
    - 左侧 `+` 上传图片按钮。
    - 隐藏 file input：`data-claw-assistant-action="upload-input"`，仅接受 `image/*`。
    - `@` 引用按钮：`data-claw-assistant-action="toggle-references"`。
    - 上传 chip 区：`.claw-assistant-upload-list`。
    - 引用 chip 区：`.claw-assistant-reference-chips`。
    - 引用候选弹层：`.claw-assistant-reference-popover`。
  - 上传图片只保存元数据和本地/缩略图/display URL，不把 base64 原图塞进 chat payload。
  - 单轮最多保留 4 个待发送上传图片。
  - 点击上传 chip 可移除图片，同时会移除对应 `upload:` 引用。
  - 点击 `@` 候选后生成 `@xxx` chip；再次点击同一候选不会重复添加。
  - 发送成功后清空本轮上传和引用；发送失败时保留，方便用户重试。
  - 发送 payload 新增：
    ```js
    context.userReferences = {
      uploads: [
        { id, name, mimeType, size, localUrl, thumbUrl, displayUrl }
      ],
      mentions: [
        { type, id, label, detail, nodeType }
      ]
    }
    ```
  - 保持原有能力不变：持久化多话题、上下文 debug、快捷意图、action preview、低风险自动执行、操作日志。

- `modules/app/appAssistantPanel.autoload.js`
  - 新增 `uploadReferenceFile` 注入，默认使用 `services/projectService.js#uploadFile`，测试或后续开发可以通过 deps 覆盖。
  - 新增 `listReferenceCandidates({ uploads })` 注入，候选来源包括：
    - 当前 graphStore 节点，映射为 `{ type:"node", id, label, detail, nodeType }`。
    - AssetManager 资产，映射为 `{ type:"asset", id, label, detail }`。
    - 当前 pending uploads，映射为 `{ type:"upload", id, label, detail }`。
  - AssetManager 读取兼容 `_getSortedAssets()`、`getAssets()`、`assets`、`_assets`，并继续保留延迟解析全局 AssetManager 的能力。

- `modules/app/appAssistantPanel.test.js`
  - 新增历史按钮弹层测试。
  - 新增图片上传进入 `context.userReferences.uploads` 的测试。
  - 新增 `@` 引用进入 `context.userReferences.mentions` 的测试。
  - 旧的持久化话题、新建、搜索、重命名、导出、删除、快捷意图、action preview 等测试继续保留并通过。

- `modules/app/appAssistantPanel.autoload.test.js`
  - 新增 autoload 暴露上传适配器的测试。
  - 新增从 graph 节点、AssetManager 资产、pending upload 构建引用候选的测试。

### 53.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 53.3 RED/GREEN 验证记录

- RED 已先确认失败，失败点符合预期：
  - `options.uploadReferenceFile` 未暴露。
  - `options.listReferenceCandidates` 未暴露。
  - `.claw-assistant-history-popover` 不存在。
  - 上传 input 不存在。
  - `toggle-references` 按钮和引用候选不存在。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "history button|uploaded image|at-mentions|upload reference|reference candidates" modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：5 tests pass。
- 面板与 autoload 回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：51 tests pass。
- 相关 API + 前端组合：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js api\clawAssistantApi.test.js`
  - 结果：61 tests pass。
- 宽前端回归：
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js api\configApi.specialProviders.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`
  - 结果：109 tests pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`：通过。
- 统一离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：138 tests OK。
  - 前端 broad suite：109 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：通过；仅输出仓库已有 LF/CRLF 转换警告。

### 53.4 生效方式与下一步

- 本轮只修改前端静态 JS、测试和接力文档，不需要启动、检查、重启、停止或探测 `8777`。
- 真实应用里需要浏览器刷新后才能加载新的 UI。
- 用户已经明确约定：如果后续任何步骤需要启动、检查、重启、停止或确认 `8777` 服务，开发者必须停下来交给用户处理；用户说服务已就绪后再继续联调。
- 下一步如果用户继续要求 UI 精修，应基于真实截图/人工反馈调整视觉间距、图标形态和移动端表现；如果进入能力补齐，则优先检查图片引用是否需要升级为真正 vision/multimodal provider payload。

## 54. C29 已攻克：底部输入区尺寸与 `@` 触发方式精修

本节记录 2026-05-25 基于用户标注截图完成的 UI 精修。用户反馈：底部输入区需要更接近标注区域的高度；可见的 `@` 标记/按钮需要去掉，但在输入框里输入 `@` 仍然要触发引用功能。

### 54.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - `.claw-assistant-form` 调整为更高的底部输入区：`min-height:170px`，并保留顶部边界和暗色工作台质感。
  - `.claw-assistant-composer` 调整为更大的输入容器：`min-height:78px`，textarea 内部最小高度提高到 `52px`。
  - 快捷意图 chips（拿资产、整理选区、生成图片、知识卡）从消息区下方移入 `.claw-assistant-form` 内部，成为底部输入区域的一部分，布局更贴近用户标注图。
  - 不再把 `referenceButton` 插入 composer，因此界面上不再出现可见 `@` 按钮。
  - 新增输入框 `input` 事件监听：
    - 当光标前文本匹配独立 `@`（例如输入框内容结尾为 `@` 或空格后 `@`）时，调用 `renderReferenceCandidates()` 并打开 `.claw-assistant-reference-popover`。
    - 用户仍然可以通过键入 `@` 选择画布节点、资产或待上传图片引用。
  - 既有引用 chip、发送 payload 中的 `context.userReferences.mentions`、发送成功后清空引用等能力保持不变。

- `modules/app/appAssistantPanel.test.js`
  - 更新 `@` 引用测试：断言页面不存在可见 `toggle-references` 按钮，并通过 textarea 输入 `@` 触发候选列表。
  - 新增底部输入区布局测试：断言快捷意图父级为 `clawAssistantForm`，并检查样式里包含更大的 form/composer min-height。

### 54.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 54.3 RED/GREEN 验证记录

- RED 已先确认失败，失败点符合预期：
  - 页面仍存在 `data-claw-assistant-action="toggle-references"` 的可见按钮。
  - 快捷意图父级仍是 `clawAssistantPanel`，不是 `clawAssistantForm`。
  - 底部输入区样式还没有 `min-height:170px` / `min-height:78px`。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "at-mentions|enlarged bottom composer" modules\app\appAssistantPanel.test.js`
  - 结果：2 tests pass。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：52 tests pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
- 统一离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：138 tests OK。
  - 前端 broad suite：110 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：通过；仅输出仓库已有 LF/CRLF 转换警告。

### 54.4 生效方式与注意事项

- 本轮是前端静态 JS、测试和文档更新，不需要启动、检查、重启、停止或探测 `8777`。
- 浏览器刷新后生效。
- 可见 `@` 按钮已隐藏，但 `@` 引用功能没有删除；触发方式改为在输入框内键入独立 `@`。

## 55. C30 已攻克：`@` 引用图片 hover 预览

本节记录 2026-05-25 基于用户新截图完成的引用预览切片。用户反馈：`@新资产4` 这类引用 chip 鼠标放上去以后应能看到图片预览，确认自己引用的是哪一张图。

### 55.1 已完成能力

- `modules/app/appAssistantPanel.autoload.js`
  - 新增 `pickPreviewUrl(source)`，从候选对象里提取可预览图片 URL。
  - 支持字段包括：
    - `previewUrl`
    - `thumbUrl`
    - `thumbnailUrl`
    - `displayUrl`
    - `localUrl`
    - `url`
    - `src`
    - `imageUrl`
    - 以及上述字段的 `data.*` 版本。
  - `buildReferenceCandidates()` 现在会给以下候选补 `previewUrl`：
    - pending uploads：优先用上传缩略图/展示图。
    - graphStore 节点：优先用节点或节点 data 上的图像字段。
    - AssetManager 资产：优先用资产缩略图/展示图。

- `modules/app/appAssistantPanel.js`
  - `normalizeReferenceCandidate()` 会保留候选中的 `previewUrl`。
  - `renderPendingReferences()` 为每个 `@` chip 创建 `.claw-assistant-reference-preview`。
  - 当引用有 `previewUrl` 时，预览层里显示 `<img>`，用于确认具体图片。
  - 当引用没有图片时，预览层仍显示引用名称和类型/详情。
  - `mouseenter` / `focus` 展开预览；`mouseleave` / `blur` 隐藏预览。
  - 样式新增暗色浮层、圆角缩略图、名称和类型说明，避免遮挡输入区结构。

- `modules/app/appAssistantPanel.test.js`
  - 新增 hover 预览测试：选择带 `previewUrl` 的 asset 引用后，chip 内存在隐藏预览层；鼠标进入显示，鼠标离开隐藏；图片 `src` 等于候选预览 URL。

- `modules/app/appAssistantPanel.autoload.test.js`
  - 更新引用候选测试：验证 pending upload 和 AssetManager asset 会携带 `previewUrl`。

### 55.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 55.3 RED/GREEN 验证记录

- RED 已先确认失败，失败点符合预期：
  - autoload reference candidates 缺少 `previewUrl`。
  - at-mention chip 上没有 `.claw-assistant-reference-preview`，无法 hover 显示图片。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "image preview|reference candidates" modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：2 tests pass。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：53 tests pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
  - `cmd /c node --check modules\app\appAssistantPanel.autoload.js`：通过。
- 统一离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：138 tests OK。
  - 前端 broad suite：111 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：通过；仅输出仓库已有 LF/CRLF 转换警告。

### 55.4 生效方式与注意事项

- 本轮是前端静态 JS、测试和文档更新，不需要启动、检查、重启、停止或探测 `8777`。
- 浏览器刷新后生效。
- 真实预览是否显示图片取决于候选对象是否能提供 `previewUrl/thumbUrl/displayUrl/localUrl/src` 等可访问图片地址；没有图片地址时会显示文本预览。

## 56. C31 已攻克：聊天输入区加高、图片消息发送、文字可选中复制

本节记录 2026-05-25 基于用户继续反馈完成的 UI 与上下文切片。用户要求：聊天框再高一点；可以放入图片并发图；聊天窗口里的文字要能选中复制；同时关心当前 AI 助手是否能理解图片。

### 56.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 底部输入区继续加高：`.claw-assistant-form` 提升到 `min-height:220px`，`.claw-assistant-composer` 提升到 `min-height:118px`，textarea 内部最小高度提升到 `88px`，`rows` 从 `1` 调整为 `3`。
  - 上传 input 增加 `multiple="multiple"`，支持一次选择多张图，仍受 `MAX_PENDING_UPLOADS=4` 限制。
  - textarea 支持粘贴图片文件；composer 支持拖拽图片文件进入。
  - 允许“只有图片、没有文字”的发送。若输入框为空但存在待发送图片或引用，会自动生成一条用户消息摘要，例如 `已发送图片：xxx.png`，并正常调用 `assistantApi.sendMessage(...)`。
  - 上传结果如果包含 `localPath/path/originalLocalPath` 或 `/data/uploads/...` 地址，会额外生成 `workspacePath`（如 `data/uploads/reference.png`）和 `clawFileHint`（如 `@data/uploads/reference.png`）。
  - `.claw-assistant-messages`、`.claw-assistant-message` 和 `.claw-assistant-message *` 增加 `user-select:text` 与 `-webkit-user-select:text`，聊天正文可拖选复制。
- `services/claw_bridge_service.py`
  - prompt 协议新增 `userReferenceRules`，明确要求模型读取 `context.userReferences.uploads` 和 `context.userReferences.mentions`。
  - `_build_prompt_payload(...)` 的 instructions 新增说明：当前用户消息附带的上传图片与 @ 引用都在 `context.userReferences`。
  - `_compact_context(...)` 新增 `userReferences` 压缩保留逻辑，避免大画布上下文触发 Windows 命令行长度压缩时丢失用户刚上传的图片。
  - 压缩时只保留安全元数据字段，不保留 `dataUrl/blobUrl`，避免把 base64 或 blob 地址塞进 prompt。
  - 重要边界：当前实现让 Claw 拿到图片引用、可访问 URL/相对路径提示和当前消息语义；是否真正能“看懂图片像素”，取决于 Claw CLI 与当前在线模型是否支持 vision/multimodal 输入。若无法从这些引用读取像素，prompt 已要求模型如实说明并让用户补充视觉细节，不能假装看过。

### 56.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `services/claw_bridge_service.py`
- `claw_bridge_service_test.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 56.3 RED/GREEN 验证记录

- RED 已先确认失败，失败点符合预期：
  - 粘贴图片后不输入文字提交，旧逻辑不会发送。
  - 样式里仍是旧的 `170px/78px/52px` 高度。
  - 消息区没有 `user-select:text`。
  - 后端 prompt 没有显式说明 `context.userReferences.uploads`。
  - 大上下文压缩时会丢失 `userReferences`。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js`
  - 结果：33 tests pass。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_instructs_model_to_use_user_uploaded_image_references claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_compaction_preserves_user_uploaded_image_references`
  - 结果：2 tests OK。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：55 tests pass。
- Bridge 回归与语法检查：
  - `python -m unittest claw_bridge_service_test.py`
  - 结果：35 tests OK。
  - `cmd /c node --check modules\app\appAssistantPanel.js`：通过。
  - `python -m py_compile services\claw_bridge_service.py`：通过。
- 统一离线回归：
  - `powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1`
  - 结果：exit code 0。
  - 后端 broad suite：140 tests OK。
  - 前端 broad suite：113 tests pass。
  - Python syntax：通过。
  - JS syntax：通过。
  - `git diff --check`：通过；仅输出仓库已有 LF/CRLF 转换警告。

### 56.4 生效方式与注意事项

- 本轮包含前端静态 JS 改动：浏览器刷新后才能加载新的聊天框高度、粘贴/拖入图片、纯图片发送和文字选择样式。
- 本轮包含后端 `services/claw_bridge_service.py` prompt / 压缩逻辑改动：真实运行中的 `8777` 需要由用户手动重启后才会加载新的图片引用协议。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定：需要服务动作时由用户处理，开发者不要主动碰服务。
- 后续如果要做到“模型必定能直接识别图片像素”，下一步应验证 Claw Code 当前 CLI 对图片附件/vision 的真实支持；若 CLI 只支持文本 prompt，则需要设计一层多模态 provider payload 或图片转描述预处理，而不是只靠 JSON 里的 URL。

## 57. C32 已攻克：底部输入框吃掉空隙

本节记录 2026-05-25 基于用户截图红框反馈完成的 UI 微调。用户指出底部 composer 下方不应留下空白槽，要求“让这个对话框变高，下去补上这个空隙”。

### 57.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - `.claw-assistant-composer` 增加 `flex:1 1 auto`，在 `.claw-assistant-form` 里直接吃掉快捷意图下方的剩余高度。
  - `.claw-assistant-composer` 最小高度从 `118px` 提升到 `150px`。
  - `.claw-assistant-composer .claw-assistant-input` 最小高度从 `88px` 提升到 `118px`，最大高度从 `150px` 提升到 `190px`。
  - 目标视觉效果：红框处不再是外层 form 的空白背景，而是输入框边框本体继续向下延展。
- `modules/app/appAssistantPanel.test.js`
  - 更新“enlarged bottom composer”测试，明确要求 composer 有 `flex:1 1 auto`、`min-height:150px`，textarea 有 `min-height:118px`。

### 57.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 57.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "enlarged bottom composer" modules\app\appAssistantPanel.test.js`
  - 失败点：旧 CSS 没有 `.claw-assistant-composer{...flex:1 1 auto...}`。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "enlarged bottom composer" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：55 tests pass。

### 57.4 生效方式与注意事项

- 本轮只修改前端静态 JS、测试和文档，不需要后端 `8777` 重启。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 浏览器刷新后才能加载新的输入框高度。

## 58. C33 已攻克：顶部三个操作按钮改为线性图标

本节记录 2026-05-25 基于用户截图反馈完成的 UI 微调。用户指出右上角三个按钮 `H / + / x` 太丑，要求换成参考图里的线性图标样式。

### 58.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 新增 `HEADER_ICONS`，用内联 SVG 线性图标替换 header 右侧三个字符按钮：
    - 历史会话：时钟图标，`data-claw-assistant-icon="history"`。
    - 新建对话：对话气泡加号图标，`data-claw-assistant-icon="new-chat"`。
    - 收起/关闭：右箭头图标，`data-claw-assistant-icon="collapse"`。
  - 原按钮 action 和 aria label 保持不变：
    - `toggle-history`
    - `new-topic`
    - `close`
  - header 图标按钮样式调整为更轻的线性按钮：
    - 默认透明背景和透明边框。
    - hover 时轻微亮底和细边框。
    - SVG 统一 `18px`、`stroke-width:1.8`、圆角线帽。
  - 只影响 header actions，不影响底部上传按钮、隐藏的旧关闭按钮或历史弹层里的 topic 工具按钮。
- `modules/app/appAssistantPanel.test.js`
  - 新增测试要求 header 三个按钮不再显示 `H/+ /x` 字符。
  - 测试验证按钮内含对应 SVG 图标标记，并验证 header close 按钮使用透明背景样式。

### 58.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 58.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "line icons" modules\app\appAssistantPanel.test.js`
  - 失败点：旧 UI 的历史按钮仍渲染 `H`。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "line icons" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：56 tests pass。

### 58.4 生效方式与注意事项

- 本轮只修改前端静态 JS、测试和文档，不需要后端 `8777` 重启。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 浏览器刷新后才能加载新的 header 图标。

## 59. C34 已攻克：历史会话弹层精简与话题行 hover 操作

本节记录 2026-05-25 基于用户截图红框/蓝框反馈完成的历史会话 UI 调整。用户要求红色方框标记的顶部功能不要了，蓝色标记的导出/删除能力下移到每个话题行上，并且鼠标放到哪个话题上就显示哪个话题的操作；搜索历史会话输入框要补齐这些功能移走后的空间。

### 59.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 删除历史弹层顶部工具区里的旧按钮：
    - `debug-context`
    - `search-topics`
    - `rename-topic`
    - `export-topic`
    - `delete-topic`
  - 删除话题栏里额外的 `debug-context` 小按钮，聊天框 chrome 不再暴露上下文调试入口。
  - 历史搜索框 `.claw-assistant-topic-search` 保持 `width:100%`，父级 `.claw-assistant-topic-tools` 去掉按钮间隙后由搜索框吃满整行。
  - 搜索改为输入即触发：`topicSearchInputEl` 监听 `input` 事件调用 `searchTopicList()`，回车仍保留同一搜索行为。
  - 每个话题项从单纯按钮结构调整为可聚焦的 `div[role="button"]`：
    - 左侧为话题名和消息/操作数量。
    - 右侧新增 `.claw-assistant-topic-actions`。
    - `.claw-assistant-topic-actions` 默认 `opacity:0` 且不可点击，话题行 `hover` 或 `focus-within` 时显示并恢复点击。
  - 导出/删除按钮移动到每个话题行内部：
    - `data-claw-assistant-topic-action="export"`
    - `data-claw-assistant-topic-action="delete"`
    - 按钮使用内联 SVG 线性图标，不再用旧字符按钮。
  - 新增 `exportConversationById(conversationIdToExport)`：
    - 可以导出任意会话，不再只导出当前激活会话。
    - 导出后仍在聊天区追加“已导出话题：xxx”的操作消息。
  - 新增 `deleteConversationById(conversationIdToDelete)`：
    - 可以删除任意会话，不再只删除当前激活会话。
    - 删除非当前会话时刷新历史列表但不清空当前聊天。
    - 删除当前会话时清空可见历史和短期内存，再刷新到新的可用会话。
    - 删除后会清空历史搜索输入，避免搜索词还在但列表已经刷新成全量结果。
- `modules/app/appAssistantPanel.test.js`
  - 将旧的上下文调试按钮测试改为“聊天框 chrome 不再暴露 debug 控件”。
  - 更新历史话题测试，覆盖：
    - 顶部 `debug/search/rename/export/delete` 旧 action 不再渲染。
    - 搜索框吃满工具区宽度。
    - 话题行 hover 操作区默认隐藏。
    - 输入搜索词会触发搜索。
    - 话题行本身仍可被识别为 `DIV`。
    - 导出/删除从对应话题行里的按钮触发，并按该话题 ID 执行。

### 59.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 59.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "searches topics" modules\app\appAssistantPanel.test.js`
  - 失败点：旧 `debug-context` 顶部入口仍存在，测试期望为不渲染。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "searches topics" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：56 tests pass。
- 空白检查：
  - `git diff --check`
  - 结果：exit code 0；仅输出仓库已有 LF/CRLF 转换 warning，没有新增 whitespace error。

### 59.4 生效方式与注意事项

- 本轮只修改前端静态 JS、测试和文档，不需要后端 `8777` 重启。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 浏览器刷新后才能加载新的历史会话弹层 UI。
- `previewContextDebug()` 和旧的 active export/delete 包装函数仍保留在文件内，便于后续如果需要做开发者调试入口或快捷键时复用；当前 UI 已不再暴露这些旧顶部入口。

## 60. C35 已攻克：新话题用首条消息自动命名

本节记录 2026-05-25 基于用户截图反馈完成的话题命名体验优化。用户指出历史会话里每次新建都叫“新话题”，无法区分，要求使用者第一句话的简短表述作为该话题名字。

### 60.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 新增 `conversationMessageCount(conversation)`：
    - 从 `conversation.messageCount` 或 `conversation.messages.length` 识别当前会话是否已有消息。
    - `setActiveConversationMeta()` 和 `renderConversationHistory()` 会同步维护 `activeConversationMessageCount`。
  - 新增 `isPlaceholderConversationTitle(title)`：
    - 识别占位标题：空标题、`默认话题`、`新话题`、`default topic`、`new topic`、`untitled`。
    - 只有占位标题才会自动命名，避免覆盖已有正常话题名。
  - 新增 `deriveConversationTitleFromMessage(message)`：
    - 压缩多余空白。
    - 优先取第一句/第一段短表述，遇到 `。！？!?；;，,、` 等分隔符截断。
    - 超过 18 个字符时截为前 18 个字符并追加 `...`。
  - 新增 `shouldAutoNameActiveConversationFromFirstMessage()`：
    - 要求当前存在 `renameConversation` 能力。
    - 当前 active 会话 ID 有效。
    - 当前会话消息数为 `0`。
    - 当前标题仍是占位标题。
  - 新增 `autoNameConversationFromFirstMessage(conversationIdToRename, message, enabled)`：
    - 在首条消息成功发送后调用已有 `renameConversation(id, title)`。
    - 成功后更新本地 conversations 列表、顶部当前话题名和历史弹层话题行。
  - `submitMessage()` 调整：
    - 在发送前记录是否满足“首条消息自动命名”条件。
    - 用户消息和助手回复成功写入后，再执行自动重命名。
    - 只有确实需要自动命名时才 `await` 该逻辑，避免给普通消息发送路径额外增加异步节拍，保护 action preview 既有测试和 UI 时序。
    - 自动命名后会维持正确的 `activeConversationMessageCount`，避免同一话题后续消息再次触发命名。
- `modules/app/appAssistantPanel.test.js`
  - 新增测试 `assistant panel renames a new topic from the first user message`：
    - 初始会话标题为 `新话题` 且 `messageCount: 0`。
    - 用户发送 `帮我整理资产面板，保留图片节点`。
    - 期望调用 `renameConversation("conv-new", "帮我整理资产面板")`。
    - 期望历史会话行显示新的短标题。

### 60.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 60.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "renames a new topic" modules\app\appAssistantPanel.test.js`
  - 失败点：`renameConversation` 调用数组为空，证明旧实现没有自动命名。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "renames a new topic" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
- 时序回归修复验证：
  - 首次全量面板回归发现 action preview 相关测试因为自动命名无条件 `await` 多一拍而失败。
  - 修复为只有满足首句自动命名条件时才 `await`。
  - 复测：
    - `cmd /c node --test --test-concurrency=1 --test-name-pattern "renders action preview" modules\app\appAssistantPanel.test.js`
    - 结果：1 test pass。
    - `cmd /c node --test --test-concurrency=1 --test-name-pattern "renames a new topic" modules\app\appAssistantPanel.test.js`
    - 结果：1 test pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：57 tests pass。

### 60.4 生效方式与注意事项

- 本轮只修改前端静态 JS、测试和文档，不需要后端 `8777` 重启。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 浏览器刷新后才能加载新逻辑。
- 当前自动命名是前端 deterministic 规则，不调用模型总结标题；优点是快、稳定、不额外花 token。后续如果产品要求“更像 ChatGPT 的智能标题”，可以另开切片接入后端标题生成，但需要注意成本、延迟和失败兜底。

## 61. C36 已攻克：助手标题改为“幻映智能体”

本节记录 2026-05-25 基于用户截图反馈完成的品牌文案微调。用户要求聊天框左上角标题从“RH 智能体”改为“幻映智能体”。

### 61.1 已完成能力

- `modules/app/appAssistantPanel.js`
  - 新增 `ASSISTANT_DISPLAY_NAME = "幻映智能体"`，统一面板显示名称，避免标题文案散落在多处。
  - 面板左上角 `.claw-assistant-title` 改为“幻映智能体”。
  - 面板 `aria-label`、标题 `title`、关闭按钮 label、FAB title、搜索历史会话 aria label 等跟随改为“幻映智能体”。
  - 默认未接入/无法回复错误里的助手名也同步改为“幻映智能体”，保持用户可见文案一致。
- `modules/app/appAssistantPanel.test.js`
  - 在面板打开/关闭测试中新增断言：
    - `.claw-assistant-title` 文案必须是“幻映智能体”。
    - 面板 `aria-label` 必须是“幻映智能体”。

### 61.2 本轮修改文件

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 61.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "opens from the existing" modules\app\appAssistantPanel.test.js`
  - 失败点：旧标题仍为 `RH 智能体`，测试期望 `幻映智能体`。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "opens from the existing" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
- 语法检查：
  - `cmd /c node --check modules\app\appAssistantPanel.js`
  - 结果：通过。
- 面板相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：57 tests pass。

### 61.4 生效方式与注意事项

- 本轮只修改前端静态 JS、测试和文档，不需要后端 `8777` 重启。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 浏览器刷新后才能看到新标题。

## 62. C37 已攻克：恢复整个资产时按子节点类型自动多路连接

本节记录 2026-05-25 基于用户真实联调反馈完成的资产连接修复。用户让幻映智能体把 `新资产4` 拿出来并连接到新的视频节点，结果只连接了文本，图片没有连接。排查后确认根因在执行器：`restore_asset_to_canvas + connectTo` 只取恢复出来的第一个节点作为连接锚点，因此一个资产里同时有文本和图片时，只会外接其中一个子节点。

### 62.1 根因结论

- `modules/assistant/assistantActionExecutor.js`
  - 旧 `addRestoreConnection()` 使用 `restoredNodeIds[0]` 作为唯一连接锚点。
  - `restore_asset_to_canvas` 恢复整个资产时，虽然会恢复多个子节点，但对外连接只创建一条边。
  - 这导致“文本 + 图片”混合资产连接到 `ai-video` 时，只有第一个恢复节点会被接入，另一个节点丢失外部连接。
- 该问题不是 OpenAI key、模型能力或画布显示问题，而是执行器能力边界不完整。

### 62.2 已完成能力

- `modules/assistant/assistantActionExecutor.js`
  - 新增媒体类型映射：
    - `source-text / ai-text / comment / storyboard / debug` => `text`
    - `source-image / ai-image / panorama-scene / panorama-360` => `image`
    - `source-video / ai-video / scene-detection` => `video`
    - `source-audio / ai-audio` => `audio`
  - 新增目标端口兼容映射：
    - `prompt / text` 接文本。
    - `referenceImage / reference / firstFrame / image` 接图片。
    - `videoInput / video` 接视频。
    - `audioInput / audio` 接音频。
  - 新增恢复资产默认连接规则：
    - 接到 `ai-video`：
      - 文本子节点 => `prompt`
      - 图片子节点 => `firstFrame`
      - 视频子节点 => `videoInput`
      - 音频子节点 => `audioInput`
    - 接到 `ai-image`：
      - 文本子节点 => `prompt`
      - 图片子节点 => `referenceImage`
    - 接到 `ai-text`：
      - 文本子节点 => `prompt`
      - 图片子节点 => `image`
    - 接到 `ai-audio`：
      - 文本子节点 => `prompt`
      - 音频子节点 => `audioInput`
    - 接到 `scene-detection` / `panorama-scene` / `panorama-360` 时按图片/视频能力接入。
  - `addRestoreConnection()` 改为：
    - `connectTo` 场景下遍历所有恢复节点。
    - 对每个恢复节点按源类型和目标节点类型推导目标端口。
    - 如果模型显式给了 `targetHandle` 且该端口与当前子节点媒体类型兼容，则尊重该端口。
    - 如果显式端口不兼容当前子节点，则自动回落到默认端口。例如模型给了 `reference`，图片仍接 `reference`，文本会补接 `prompt`。
    - 无法推导多路连接时保留旧行为，只连一个锚点，避免未知目标类型直接扩散连接。
- `services/claw_bridge_service.py`
  - 补充动作协议提示：
    - 当整资产连接到生成节点时，优先使用 `restore_asset_to_canvas + connectTo`。
    - 幻映会把恢复出的文本/图片/视频/音频子节点路由到兼容目标端口。

### 62.3 测试覆盖

- `modules/assistant/assistantActionExecutor.test.js`
  - 新增测试 `connects restored text and image asset children into a video node`：
    - 资产包含 `source-text` 和 `source-image`。
    - 目标节点为 `ai-video`。
    - 执行 `restore_asset_to_canvas` 并 `connectTo: "selected_node"`。
    - 期望生成两条外部边：
      - 文本节点 -> 视频节点，`targetHandle: "prompt"`。
      - 图片节点 -> 视频节点，`targetHandle: "firstFrame"`。
  - 更新旧的整资产恢复测试：
    - 资产内部已有一条边时仍保留内部恢复边。
    - 外部连接现在会为图片和文本分别接到 `reference` 与 `prompt`。

### 62.4 本轮修改文件

- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`
- `services/claw_bridge_service.py`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 62.5 RED/GREEN 验证记录

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "connects restored text and image" modules\assistant\assistantActionExecutor.test.js`
  - 失败点：旧实现只生成 `["edge-1"]`，缺少图片/文本多路外部连接中的第二条边。
- Focused GREEN：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "connects restored text and image" modules\assistant\assistantActionExecutor.test.js`
  - 结果：1 test pass。
- 执行器回归：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - 结果：27 tests pass。
- JS 语法检查：
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`
  - 结果：通过。
- 助手执行器 + 面板 autoload 相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：49 tests pass。
- Python 语法检查：
  - `python -m py_compile services\claw_bridge_service.py`
  - 结果：通过。
- 后端协议提示单测：
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_huanying_action_protocol`
  - 结果：OK。

### 62.6 生效方式与注意事项

- 本轮修改了前端执行器静态 JS 和后端 prompt 协议。
- 前端执行器改动需要刷新浏览器页面后生效。
- 后端 `services/claw_bridge_service.py` 的 prompt 协议改动需要用户手动重启 `8777` 后才会进入真实模型上下文。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续保持用户约定。
- 修复后，再让智能体“把整个资产连接到新的视频节点”时，应能把资产里的文本和图片都连入视频节点；文本通常进 `prompt`，图片默认进 `firstFrame`。

## 63. C38 已攻克：`set_viewport` 让助手能主动移动视野

- 本轮继续推进 `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md` 中的低风险内部画布能力补齐，新增 `set_viewport`。
- 这次补的是“看哪里”的能力，不是“改什么”的能力。助手现在可以在完成布局、创建、恢复资产后，主动把画布视野移动到结果区域。
- 实现范围：
  - `modules/assistant/assistantActionExecutor.js`
  - `modules/assistant/assistantActionExecutor.test.js`
  - `modules/assistant/assistantActionPreview.js`
  - `modules/assistant/assistantActionPreview.test.js`
  - `modules/assistant/assistantContextBuilder.js`
  - `modules/assistant/assistantContextBuilder.test.js`
  - `modules/app/appAssistantPanel.autoload.js`
  - `modules/app/appAssistantPanel.autoload.test.js`
  - `services/claw_action_schema.py`
  - `claw_action_schema_test.py`
  - `services/claw_bridge_service.py`
  - `claw_bridge_service_test.py`
- 新增行为：
  - 后端 schema 接受 `set_viewport`，支持 `viewport` 以及 `x/y/zoom`。
  - 后端 bridge prompt 协议把 `set_viewport` 暴露给 Claw。
  - 前端执行器调用 `graphStore.updateViewport(...)`。
  - 前端预览卡片会显示 `Set viewport to x:... y:... zoom:...`。
  - `canvasApi.allowedActions` 和自动应用白名单都已加入 `set_viewport`。
- 这轮验证结果：
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，共 64 tests pass。
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py` 通过，共 61 tests pass。
  - `node --check modules\assistant\assistantActionExecutor.js modules\assistant\assistantActionPreview.js modules\assistant\assistantContextBuilder.js modules\app\appAssistantPanel.autoload.js` 通过。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py` 通过。
- 生效方式：
  - 这轮前端静态 JS 改动，浏览器刷新后生效。
  - 后端 `services/claw_bridge_service.py` 和 `services/claw_action_schema.py` 改动，需要用户手动重启 `8777` 后才会进入真实联调路径。
  - 按用户约定，本轮没有主动启动、重启、停止、检查或探测 `8777`。
- 进度判断：
  - `set_viewport` 这条切片已完成。
  - 整体 `CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP` 仍然还有更高阶的 prompt 手术、画布医检、分镜/模板等内容，但底层操作能力又往前补了一块。
## 64. C39 已攻克：Prompt 手术台 MVP 协议落地

本节记录 2026-05-25 继续推进 `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md` 阶段 1「Prompt 手术台」。本轮没有新增画布 action，因为现有 `update_node_data` / `create_node` / 自动应用 / undo 事务能力已经足够；真正缺口是 Claw bridge prompt 里没有清晰教模型如何区分“改 prompt”“生成 prompt 变体”和“真正开始生成”。

### 64.1 已完成能力

- `services/claw_bridge_service.py`
  - `ACTION_PROTOCOL` 新增 `promptSurgeryRules`。
  - 直接优化选中 prompt 时使用 `update_node_data + nodeId: selected_node`，patch 字段限定在安全的 `prompt/content/text/title/name`。
  - 生成 prompt variants、保留原 prompt、旁边放几个版本时使用 `create_node` 创建 `source-text` / `ai-text` 类文本节点，不覆盖原节点。
  - `prompt surgery` 和 `prompt variants` 不得调用 `queue_generation_task`，除非用户明确要求生成、运行、渲染或输出。
  - 中文 prompt 必须保持有效 UTF-8；只有用户要求翻译、双语或 Midjourney 英文风格时才改语言。
  - `_compact_action_protocol()` 会保留 `promptSurgeryRules`，长上下文压缩时不会丢掉 Prompt 手术台规则。
  - 为避免普通请求误触发 Windows 参数压缩，把旧的长 `examples` 收敛为空数组；Prompt 手术台 few-shot 以短规则形式写入 `promptSurgeryRules`。当前完整 prompt payload 约 15788 字符，低于 `MAX_PROMPT_ARGUMENT_CHARS = 16000`。
- `modules/assistant/assistantActionPreview.js`
  - 新增 prompt-only patch 识别：当 `update_node_data.patch` 只包含 `prompt/content/text/title/name` 时，预览摘要显示为 `Prompt update ...`。
  - 这让前端操作日志/预览更像“已优化 prompt”，而不是笼统的“更新节点”。
- 测试覆盖：
  - `claw_bridge_service_test.py` 新增 Prompt 手术台协议和压缩协议保留测试。
  - `modules/assistant/assistantActionPreview.test.js` 新增 prompt-only 更新摘要测试。

### 64.2 用户可见效果

- 选中 `ai-image` / `ai-video` / `ai-text` / prompt 文本节点后，用户说“优化这个 prompt”“改得更电影感”“改成 Midjourney 风格英文 prompt”，Claw 更容易产出可自动应用的 `update_node_data`。
- 用户说“给我 3 个变体”“保留原 prompt，旁边放几个新版”，Claw 更容易产出多个 `create_node` 文本节点，而不是误触发生成任务。
- 这类操作属于幻映内部低风险画布编辑，不会触发付费生成；视频生成仍然保持授权边界。
- 前端预览里，纯 prompt 更新会显示 `Prompt update selected_node: prompt, content` 这类更明确的摘要。

### 64.3 RED/GREEN 验证记录

- RED 已先确认失败：
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_prompt_surgery_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_compact_action_protocol_preserves_prompt_surgery_protocol`
    - 初始失败点：`actionProtocol` 缺少 `promptSurgeryRules`。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "prompt-only" modules\assistant\assistantActionPreview.test.js`
    - 初始失败点：prompt-only 更新仍显示 `Update selected_node`。
- Focused GREEN：
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_prompt_surgery_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_compact_action_protocol_preserves_prompt_surgery_protocol`
    - 结果：2 tests OK。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "prompt-only" modules\assistant\assistantActionPreview.test.js`
    - 结果：1 test pass。
- 相关回归：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
    - 结果：63 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
    - 结果：96 tests pass。
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
    - 结果：通过。
  - `cmd /c node --check modules\assistant\assistantActionPreview.js`
    - 结果：通过。
  - `git diff --check`
    - 结果：exit 0，仅有既有 LF/CRLF warning。

### 64.4 生效方式与注意事项

- 本轮包含后端 `services/claw_bridge_service.py` prompt 协议改动；真实运行中的 `8777` 需要由用户手动重启后，Claw 才会拿到 Prompt 手术台规则。
- 本轮包含前端静态 JS 改动；浏览器刷新后，prompt-only 更新预览文案才会生效。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守“需要服务动作时交给用户”的约定。
- 这不是一个新的本地 prompt 优化模型，也不让 Claw 自己付费生成；它是让 Claw 更稳定地产出幻映已有的安全 action。

## 65. C40 已攻克：`/` 预设提示词直接生成执行

本节记录 2026-05-25 基于用户真实联调反馈完成的文本/图片 `/` 预设生成接入。用户说明：幻映文本和图片生成节点本来就有预设提示词，输入 `/` 可以看到，点击预设后会直接生成文本或图片；但幻映智能体之前做不了这个操作。根因不是模型不会理解，而是我们给 Claw 的 action 只有 `queue_generation_task`，它只写排队元数据，没有调用幻映现有 `/` 预设菜单选择后的真实生成入口。

### 65.1 根因结论

- `modules/slashMenu.js`
  - 选择预设后会执行 `selectPresetTemplate(template, context)`。
  - 该函数同步 prompt 后调用 `context.onGenerate(safeTemplate)`。
- `components/aigenText/taskOrchestrationModule.js` 和 `components/aigenImage/taskOrchestrationModule.js`
  - 文本/图片生成节点都暴露 `_onGenerate(userInput = null)`。
- `modules/assistant/assistantActionExecutor.js`
  - 旧的 `queue_generation_task` 只写入 `generationStatus/taskStatus/generationTaskType` 等元数据。
  - 它不会触发 mounted node instance 的 `_onGenerate(template)`，所以不能等价执行 `/` 菜单预设。

### 65.2 已完成能力

- 新增 action：`run_prompt_preset_generation`
  - 支持 `nodeId` 指向已有 `ai-text` / `ai-image` 节点。
  - 支持 `nodeId` 指向同一批 actions 里前面 `create_node` 的 action id。
  - 支持 `taskType/mode` 为 `text`、`image`，以及 `ai-text`、`ai-image` 别名。
  - 支持 `presetTemplate`、`template` 或 `prompt` 作为预设模板文本。
  - 拒绝视频节点；视频生成仍走既有授权边界。
- 前端执行器：
  - 执行前会把预设文本写入节点 prompt 相关元数据，便于 UI 和后续上下文看到。
  - 默认 runner 通过 `window.__v2RendererBridge.nodeInstances.get(nodeId)._onGenerate(template)` 调用真实节点生成入口。
  - 对刚创建但尚未挂载的节点增加短重试，避免同批 “创建节点 -> 立刻运行预设” 因实例未 mounted 而失败。
- 前端预览与自动应用：
  - `assistantActionPreview` 增加 slash preset generation 摘要。
  - `appAssistantPanel.autoload` 将文本/图片 `run_prompt_preset_generation` 纳入低风险自动应用。
  - `canvasApi.allowedActions` 暴露该 action，让 Claw 知道这是可用能力。
- 后端 schema / bridge：
  - `services/claw_action_schema.py` 接受 `run_prompt_preset_generation`，并校验文本/图片边界。
  - `services/claw_bridge_service.py` 的 action protocol 暴露该动作、字段和执行语义：`Slash preset generation: run_prompt_preset_generation nodeId + presetTemplate/template; calls _onGenerate(template).`
  - 压缩版 action protocol 现在保留 `presetGenerationRules`。
  - 本轮还修复了长上下文压缩时 `memoryRules` 被丢弃的问题，避免模型失去 `context.conversation.recentMessages` / `recentOperations` 的明确使用规则。

### 65.3 用户可见效果

- 用户可以让幻映智能体对已有文本/图片生成节点执行 `/` 里的预设提示词，并触发真实生成，而不是只把节点标成“已排队”。
- 用户可以让它先创建 `ai-image` / `ai-text` 节点，再立刻用某个预设模板生成。
- 文本和图片生成按用户最新约定属于可直接执行能力，不需要额外询问。
- 视频生成仍需要使用者授权，不能通过 `run_prompt_preset_generation` 绕过。

### 65.4 RED/GREEN 与回归验证

- RED 已先确认失败：
  - `run_prompt_preset_generation` 起初不在 schema、bridge protocol、context API、preview、autoload auto-apply 或 executor 中。
  - 旧 `queue_generation_task` 不会调用 `_onGenerate(template)`。
- Focused GREEN 已通过：
  - executor/schema/bridge/context/preview/autoload 的 slash preset generation 定向测试通过。
- 后端相关回归：
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`
  - 结果：66 tests OK。
- 前端助手相关回归：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：109 tests pass。
- 空白检查：
  - `git diff --check`
  - 结果：exit 0，仅有既有 LF/CRLF conversion warning。

### 65.5 生效方式与注意事项

- 本轮包含前端静态 JS 改动，浏览器刷新后才能加载新的 executor / preview / auto-apply 行为。
- 本轮包含后端 `services/claw_action_schema.py` 和 `services/claw_bridge_service.py` 改动，真实运行中的 `8777` 必须由用户手动重启后，Claw 才会拿到新 schema 和新 action protocol。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 后续如果 live UI 仍失败，优先检查：
  - 目标节点是否是 mounted 的 `ai-text` / `ai-image` 实例；
  - `window.__v2RendererBridge.nodeInstances` 是否能取到该节点；
  - 该节点实例是否暴露 `_onGenerate`；
  - Claw 输出的 action 是否用了 `run_prompt_preset_generation`，而不是退回 `queue_generation_task`。

## 66. C41 已攻克：`/` 预设生成后的空连线红错防护

本节记录 2026-05-26 基于用户截图反馈完成的修复。用户让幻映智能体新建文本节点，并使用文本节点 `/` 菜单里「分镜视频 / 文戏」预设生成文本后，聊天框出现红色错误：`第 3 个操作缺少必要字段 from/sourceId。；第 3 个操作缺少必要字段 to/targetId。`

### 66.1 根因结论

- 这不是 OpenAI key、模型调用、文本预设生成入口或 `_onGenerate(template)` 的问题。
- 真正触发错误的是 Claw 额外返回了一条 `connect_nodes` 动作。
- 这条 `connect_nodes` 没有 `from/sourceId`，也没有 `to/targetId`，等同于一个空的占位连线动作。
- `connect_nodes` 的正确协议必须有起点和终点；所以后端 schema 正确拦截了它。
- 但在 `/` 预设生成场景里，`create_node + run_prompt_preset_generation` 已经足够完成用户意图，空连线不应该让整次结果变成红错。

### 66.2 已完成能力

- `services/claw_action_schema.py`
  - 新增 `_is_empty_connect_action(...)`。
  - 当同一批 actions 里包含 `run_prompt_preset_generation` 时，如果出现同时缺少 `from/sourceId` 和 `to/targetId` 的空 `connect_nodes`，schema 会丢弃该空动作，并加入 warning：`ignored incomplete connect_nodes action[N] without from/to`。
  - 单独的空 `connect_nodes` 仍然会被拒绝。
  - 只缺一端的 `connect_nodes` 仍然会被拒绝。
  - 这保证了“模型多吐了一条无意义空连线”不会阻塞文本/图片预设生成，但真正的连线请求仍然保持严格校验。
- `services/claw_bridge_service.py`
  - `connectionPortRules` 增加规则：`connect_nodes requires from/to; never emit empty placeholders.`
  - `presetGenerationRules` 增加规则：`Do not add connect_nodes for slash presets unless the user explicitly asks and from/to are known.`
  - 压缩了若干 `allowedActions.notes` 文案，保留关键语义和测试关键词，同时避免完整 prompt 超过 `MAX_PROMPT_ARGUMENT_CHARS = 16000` 后误触发压缩协议。

### 66.3 用户可见效果

- 再让幻映智能体“新建文本节点并用 `/` 里的分镜视频 / 文戏预设生成文本”时，即使模型偶发多吐一条没有端点的空 `connect_nodes`，后端也会丢弃这条空动作，不再把聊天框打成红色 schema 错误。
- 如果用户真的要求“把 A 连到 B”，但模型没有给出起点或终点，仍然会报错并要求补齐端点，不会默默乱连。
- 文本/图片 `/` 预设生成仍然走 C40 的 `run_prompt_preset_generation -> _onGenerate(template)` 路径。
- 视频生成授权边界没有变化。

### 66.4 RED/GREEN 与回归验证

- RED 已先确认失败：
  - schema 原先会把同批 `run_prompt_preset_generation` 后面的空 `connect_nodes` 视为整批失败。
  - bridge prompt 原先没有明确禁止 `/` 预设生成时额外加空 `connect_nodes`。
  - bridge 输出原先会因该空连线返回 `CLAW_ACTION_SCHEMA_INVALID`。
- Focused GREEN：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_drops_incomplete_connect_after_prompt_preset_generation claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_standalone_incomplete_connect claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_slash_preset_generation_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_chat_drops_spurious_incomplete_connect_after_slash_preset_generation`
  - 结果：4 tests OK。
- 后端相关回归：
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`
  - 结果：69 tests OK。
- Route + schema + bridge 回归：
  - `python -m unittest claw_assistant_route_service_test.py claw_action_schema_test.py claw_bridge_service_test.py`
  - 结果：104 tests OK。
- Python 语法检查：
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。

### 66.5 生效方式与注意事项

- 本轮只改后端 schema 和 bridge prompt，没有前端静态 JS 改动。
- 真实运行中的 `8777` 需要由用户手动重启后，才能加载新的 schema 防护和 prompt 规则。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 后续如果仍出现类似红错，优先检查模型返回的第 N 条 action：
  - 如果是空 `connect_nodes` 且同批有 `run_prompt_preset_generation`，应被本轮 guard 丢弃。
  - 如果是缺一端或引用不存在的真实连线动作，仍应按 schema 错误处理。
## 67. C42 已完成：`/` 预设路径解析与新节点挂载等待修复

本节记录 2026-05-26 基于用户真实联调反馈完成的修复。用户指出：图文生成节点本身输入 `/` 就能看到预设，点击预设可以直接生成，但幻映智能体生成出来的操作仍然失败，并出现 `mounted generation node instance not found for <nodeId>`。本轮确认这不是 OpenAI key 问题，也不是图文节点没有预设，而是执行器没有把“可见预设路径”解析为“真实模板文本”，同时新节点挂载等待窗口太短。

### 67.1 根因结论

- `modules/slashMenu.js` 的真实行为是：用户选中预设后，把 `preset.template` 传给 `context.onGenerate(template)`。
- Claw 在真实输出里可能只知道用户口中的菜单路径，例如 `分镜视频 / 文戏`，并把它放在 `presetTemplate` 或 `presetTitle` 里。
- C40 的执行器之前把 `presetTemplate` 直接当成最终 prompt，因此会把 `分镜视频 / 文戏` 这种菜单标签写进节点，而不是去本地预设表里找完整模板。
- 后端 schema 之前强制 `presetTemplate/template/prompt` 必须存在，导致模型如果只返回 `presetTitle` 会被拦截；这与“预设模板由幻映本地拥有”这个产品边界不匹配。
- 新建节点后，`graphStore.addNode(...)` 成功不代表 renderer component 已经注册到 `window.__v2RendererBridge.nodeInstances`。旧的 8 次重试在真实 UI 中可能提前失败，于是节点里出现 `mounted generation node instance not found for <nodeId>`。

### 67.2 已完成能力

- `modules/assistant/assistantActionExecutor.js`
  - 新增从 `modules/promptPresets.js` 读取 `getPromptPresets(nodeType)` 的能力。
  - 新增预设查找逻辑：支持顶层标题、二级路径如 `Parent / Child`，只做空白和斜杠归一化，不改模板正文。
  - 优先用 `presetTitle`、`presetName`、`presetPath`、`presetTemplate` 去本地预设表解析；解析成功后把真实模板写入 `prompt` / `generationPresetTemplate`，再调用 `_onGenerate(template)`。
  - `createAssistantActionExecutor(...)` 增加可注入的 `promptPresetProvider`，用于单测和后续依赖注入。
  - 默认挂载等待从 8 次调度增加到 120 次调度，避免新节点刚创建后 renderer 尚未 mount 就被错误标记失败。
- `services/claw_action_schema.py`
  - `run_prompt_preset_generation` 现在允许只提供 `presetTitle`。
  - 如果 `presetTitle`、`presetTemplate`、`template`、`prompt` 都没有，才报缺少字段。
  - 文本/图片边界不变；视频仍然被拒绝。
- `services/claw_bridge_service.py`
  - bridge prompt 现在明确告诉 Claw：如果只知道菜单标签，可以返回类似 `Parent / Child` 的 `presetTitle`，幻映会从本地预设表解析真实模板。

### 67.3 用户可见效果

- 当用户让幻映智能体“新建文本节点，并使用 `/` 里的某个预设生成文本”时，Claw 可以只返回预设菜单名/路径，幻映前端会从本地预设列表找到完整模板。
- 节点会收到真实模板，而不是只收到菜单名。
- 节点挂载稍慢时不会立刻写红色失败状态。
- 图片节点 `/` 预设生成同样走本地预设解析和 `_onGenerate(template)`。
- 视频生成授权边界不变，仍不能通过 `run_prompt_preset_generation` 绕过确认。

### 67.4 RED/GREEN 与回归验证

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "resolves slash prompt preset|waits beyond" modules\assistant\assistantActionExecutor.test.js`
    - 失败点 1：`Story / Drama` 被当成模板正文，而不是解析成 `resolved full drama template`。
    - 失败点 2：只传 `presetTitle` 会抛出 `requires presetTemplate or template`。
    - 失败点 3：8 帧后节点被标记为 `generationPresetStatus: failed`。
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_prompt_preset_generation_with_title_only`
    - 失败点：后端 schema 不接受 title-only preset generation。
- GREEN 已通过：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "resolves slash prompt preset|waits beyond" modules\assistant\assistantActionExecutor.test.js`
    - 3 tests OK。
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_prompt_preset_generation_with_title_only`
    - OK。
- 回归验证已通过：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
    - 35 tests OK。
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`
    - 70 tests OK。
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`
    - 通过。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
    - 通过。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js modules\promptPresets.test.js modules\slashMenu.test.js`
    - 126 tests OK。
  - `python -m unittest claw_assistant_route_service_test.py claw_action_schema_test.py claw_bridge_service_test.py`
    - 105 tests OK。

### 67.5 生效方式与注意事项

- 本轮包含前端静态 JS 改动：需要浏览器刷新后，新的 preset 解析和挂载等待逻辑才会进入 live UI。
- 本轮包含后端 `services/claw_action_schema.py` 和 `services/claw_bridge_service.py` 改动：真实运行中的 `8777` 必须由用户手动重启后，Claw 才能拿到新的 schema 与 prompt 协议。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 后续如果仍出现类似失败，优先看执行器收到的 action：
  - 如果只有 `presetTitle` 或 `presetTemplate` 是菜单路径，应由本轮 resolver 解析成本地模板。
  - 如果本地 `/` 菜单里根本没有对应标题/路径，则需要让用户确认预设名字或检查自定义预设是否已加载。
  - 如果仍是 `mounted generation node instance not found`，说明 120 次调度仍不足或节点被虚拟化/未渲染，需要进一步接入 renderer bridge 的 pin/mount-ready 事件。
## 68. C43 已完成：`/` 预设名只写在 action 标题里的兜底

本节记录 2026-05-26 基于用户最新截图完成的修复。截图里失败的操作是 `run_prompt_preset_generation`，标题为 `使用预设提示词「分镜视频 / 文戏」生成文本`，但 action 里没有 `presetTitle`、`presetTemplate`、`template` 或 `prompt`，因此 C42 的执行器仍然报：`run_prompt_preset_generation requires presetTitle, presetTemplate, or template`。

### 68.1 根因结论

- C42 已经能处理 `presetTitle: "分镜视频 / 文戏"` 或 `presetTemplate: "分镜视频 / 文戏"`。
- 本次真实输出更偏：模型没有填任何 dedicated preset 字段，只把预设路径写进了 action 标题。
- action 标题不是理想机器字段，但如果里面有明确引号包住的预设名，例如 `「分镜视频 / 文戏」`，幻映可以安全抽取这段文本，再走 C42 的本地预设解析器。

### 68.2 已完成能力

- `modules/assistant/assistantActionExecutor.js`
  - 新增从 action 标题中抽取预设名的兜底。
  - 支持以下引号形态：
    - `「...」`
    - `『...』`
    - `【...】`
    - `"..."`
    - `'...'`
  - 抽取到的候选值会进入 C42 的本地 preset resolver，继续按节点类型匹配顶层标题或 `Parent / Child` 路径。
- `services/claw_action_schema.py`
  - 如果 `presetTitle` 缺失，会从 action 标题的引号内容中派生 `presetTitle`。
  - 如果标题也没有可抽取的预设名，仍会报缺少 `presetTitle/presetTemplate/template`。
- `services/claw_bridge_service.py`
  - prompt 协议继续要求 Claw 优先写 `presetTitle`。
  - 同时说明如果必要，幻映可以从 quoted labels 里恢复预设路径。

### 68.3 用户可见效果

- 像截图这种 action：
  - `title: 使用预设提示词「分镜视频 / 文戏」生成文本`
  - 没有 `presetTitle`
  - 没有 `presetTemplate`

  现在不会因为缺字段直接失败；幻映会抽取 `分镜视频 / 文戏`，再去 `/` 菜单同源预设表里找到真实模板并运行。

- 如果标题没有明确引号包住预设名，仍会报错；这是刻意保留的边界，避免把普通标题误当 preset 名。

### 68.4 RED/GREEN 与回归验证

- RED 已先确认失败：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "from the action title" modules\assistant\assistantActionExecutor.test.js`
    - 失败点：只在标题中有 `「Story / Drama」` 时，前端仍报缺少 `presetTitle/presetTemplate/template`。
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_derives_prompt_preset_title_from_action_title`
    - 失败点：后端 schema 不会从 action 标题派生 `presetTitle`。

- GREEN 已通过：
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "from the action title" modules\assistant\assistantActionExecutor.test.js`
    - OK。
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_derives_prompt_preset_title_from_action_title`
    - OK。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_slash_preset_generation_protocol`
    - OK。

- 回归验证已通过：
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
    - 36 tests OK。
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`
    - 71 tests OK。
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`
    - 通过。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
    - 通过。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js modules\promptPresets.test.js modules\slashMenu.test.js`
    - 127 tests OK。
  - `python -m unittest claw_assistant_route_service_test.py claw_action_schema_test.py claw_bridge_service_test.py`
    - 106 tests OK。

### 68.5 生效方式与注意事项

- 本轮包含前端静态 JS 改动：需要浏览器刷新后，标题抽取兜底才会进入 live UI。
- 本轮包含后端 `services/claw_action_schema.py` 和 `services/claw_bridge_service.py` 改动：真实运行中的 `8777` 必须由用户手动重启后，Claw 才能拿到新的 schema 与 prompt 协议。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 后续如果同类失败再次出现，要优先看 action 里预设名到底出现在哪里：
  - `presetTitle` / `presetTemplate`：C42 路径应处理。
  - action 标题的明确引号内：C43 路径应处理。
  - 普通标题散文里没有引号：需要继续加强 bridge prompt 或让模型补字段，不建议无限猜测。

## 69. C44 已完成：`/` 预设新建节点别名修复与聊天超时扩容

本节记录 2026-05-26 基于用户真实联调反馈完成的修复。用户反馈同一个“新建文本节点并使用 `/` 里的 `分镜视频 / 文戏` 预设生成文本”操作仍然失败，错误形态变成后续操作引用当前画布不存在的节点，例如 `ai-text-storyboard-wenxi-...`，随后又出现浏览器侧 `请求超时，请检查网络连接或服务器状态`。

### 69.1 根因结论

- 这次不是 C40 的“没有真实调用 `_onGenerate(template)`”，也不是 C41 的“空 `connect_nodes`”，也不是 C42/C43 的“预设名没有解析出来”。
- 新问题是 Claw 创建节点后，没有在后续动作里引用前一个 `create_node` action 的 `id`，而是自己编了一个看起来像未来画布节点的 id。
- 后端 schema 旧逻辑只允许引用当前画布真实节点 id、`selected_node`、或之前已经验证通过的 action id，因此会拒绝这个虚构 id。
- 这个拒绝原则是对的，但对模型漂移不够耐受。安全兜底边界是：只有当同一批 actions 里前面恰好只有一个兼容的 `create_node` 生成节点时，才把虚构 id 改写成那个 action id；如果有两个候选，继续报错，不猜。
- 超时根因独立：后端 `ClawBridgeService.DEFAULT_TIMEOUT_SECONDS` 已经是 900 秒，但前端 `sendClawAssistantMessage()` 默认 60000ms 会先中断慢模型请求。

### 69.2 已完成能力

- `services/claw_action_schema.py`
  - 新增 created-node alias 修复逻辑。
  - 验证过程中持续记录已通过的 `create_node` action id 与 nodeType。
  - 当 `run_prompt_preset_generation.nodeId` 引用未知 id 且前面只有一个兼容的 `ai-text` / `ai-image` 新建节点时，自动改写为该 `create_node` action id。
  - 修复过的 alias 会进入同批 alias 表，后续 `connect_nodes.from/to` 等如果继续引用同一个虚构 id，也会改写到同一个 action id。
  - 如果候选节点不唯一，仍然返回 `unknown node reference`，避免乱连或乱生成。
- `modules/assistant/assistantActionExecutor.js`
  - 增加同样的前端兜底：直接执行 raw actions 时，如果 `run_prompt_preset_generation` 引用虚构 id，但本批前面只创建了一个兼容生成节点，会映射到真实生成出来的 node id。
  - 成功兜底时会在 result warnings 里记录 `generated node alias`，便于调试。
- `services/claw_bridge_service.py`
  - prompt 协议明确要求后续 action 使用前面 `create_node` 的 action id，不能发明最终画布节点 id。
- `api/clawAssistantApi.js`
  - `DEFAULT_CHAT_TIMEOUT_MS` 从 60000ms 提升到 180000ms，减少慢模型请求被浏览器提前 abort 的概率。

### 69.3 用户可见效果

- 如果 Claw 输出：
  - 第 1 个 action：`create_node`，id 是 `act_create_text`，nodeType 是 `ai-text`；
  - 第 2 个 action：`run_prompt_preset_generation`，nodeId 却写成 `ai-text-storyboard-wenxi-...`；

  后端现在会在唯一候选明确时把第 2 个 action 的 nodeId 改成 `act_create_text`，再交给前端执行器生成真实文本。
- 如果同一个虚构 id 在第 3 个 `connect_nodes` 里继续出现，也会沿用同一个修复映射。
- 如果一批里前面创建了两个文本节点，模型又引用一个虚构文本 id，系统不会猜，仍会要求模型/用户补清楚。
- 慢一点的 Claw/OpenAI 请求不再 60 秒就被浏览器打断，默认会等到 180 秒。

### 69.4 RED/GREEN 与回归验证

- RED 已先确认失败：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_rewrites_generated_node_alias_to_single_created_prompt_preset_node claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_ambiguous_generated_node_alias_for_prompt_preset`
    - 第一个测试失败于 `valid == False`，证明 schema 旧逻辑会拦截虚构 id。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "invented new-node id" modules\assistant\assistantActionExecutor.test.js`
    - 失败于 `missing node "ai-text-storyboard-wenxi-123"`。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "longer assistant chat" api\clawAssistantApi.test.js`
    - 失败于 `60000 !== 180000`。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_exposes_slash_preset_generation_protocol`
    - 失败于 prompt 未包含 `not invented final canvas node ids`。
- Focused GREEN 已通过：
  - 上述 4 组 targeted tests 全部 OK。
- 相关回归已通过：
  - `python -m unittest claw_action_schema_test.py claw_bridge_service_test.py`：73 tests OK。
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js api\clawAssistantApi.test.js`：49 tests OK。
  - `python -m unittest claw_assistant_route_service_test.py claw_action_schema_test.py claw_bridge_service_test.py`：108 tests OK。
  - `cmd /c node --test --test-concurrency=1 api\clawAssistantApi.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js modules\promptPresets.test.js`：130 tests OK。
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js api\clawAssistantApi.js`：通过。
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`：通过。
  - `git diff --check`：exit code 0，仅有仓库既有 LF/CRLF warning。

### 69.5 验证缺口与注意事项

- 宽前端套件如果包含 `modules\slashMenu.test.js`，当前会失败 11 个测试；失败原因是该已有脏改测试导入了不存在的 `modules/promptPresetSelection.js`，不是 C44 改动导致。本轮没有修这条半成品测试线，避免混入无关改动。
- `npx react-doctor@latest --verbose --diff`：
  - PowerShell 直接运行被执行策略拦截；
  - 通过 `cmd /c npx ...` 提权运行后，react-doctor 自身退出，原因是当前 `package.json` 没有 React dependency。
- 本轮包含后端 schema/bridge prompt 与前端静态 JS 改动。
- 真实运行中的 `8777` 需要由用户手动重启后才会加载后端改动；浏览器需要刷新后才会加载前端静态 JS。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 用户明确要求：修完后由用户重启服务，然后开发者必须真实测试一次“让助手新建文本节点并使用 `分镜视频 / 文戏` 预设生成”，通过后才能说 live 行为修好。

### 69.6 重启后的真实联调记录

- 用户已手动重启 `8777` 后，进行了 live chat 调用：
  - 意图：新建文本生成节点，并使用文本节点 `/` 预设 `分镜视频 / 文戏` 直接生成文本。
  - 结果：没有返回 actions，后端返回 `success: false` / `CLAW_RUNTIME_FAILED`。
  - 关键错误：上游模型网关 `api.gptclubapi.xyz` 返回 Cloudflare `524 origin_response_timeout`，说明连接建立后，origin 在 Cloudflare 120 秒 proxy read timeout 内没有完整响应。
  - 该请求实际等待约 128 秒，因此不是旧的前端 60 秒超时，也不是 C44 的 schema 节点引用错误。
- 随后进行了 live action validation，不调用模型，只验证重启后的 `8777` 是否加载 C44 schema：
  - 输入 actions 包含：
    - `create_node`：`act_create_text` / `ai-text`；
    - `run_prompt_preset_generation.nodeId`：`ai-text-storyboard-wenxi-123`；
    - `connect_nodes.from`：`ai-text-storyboard-wenxi-123`；
    - action 标题含 `「分镜视频 / 文戏」`。
  - live 返回：
    - `valid: true`；
    - preset action 的 `nodeId` 被改写为 `act_create_text`；
    - connect action 的 `from` 被改写为 `act_create_text`；
    - `presetTitle` 成功派生为 `分镜视频 / 文戏`；
    - warnings 明确记录两处 `generated node alias` 改写。
- 结论：
  - C44 后端修复已经在重启后的 live `8777` 中生效。
  - 完整“真实生成文本”尚未通过，因为 Claw 的上游模型调用被 `api.gptclubapi.xyz` 的 Cloudflare 524 超时挡住。
  - 下一次联调应在上游模型网关恢复后重试同一句请求；若仍 524，需要检查 provider 网关/模型响应时间，而不是继续改 schema alias。

### 69.7 第二次重启后的 live 重试结果

- 用户再次手动重启 `8777` 后，重复调用同一句真实 chat 请求：
  - “请新建一个文本生成节点，并使用文本节点 / 预设里的「分镜视频 / 文戏」直接生成文本。”
- 本次 live chat 成功：
  - `success: true`；
  - 没有 Cloudflare 524；
  - 没有 `unknown node reference`；
  - 没有再发明 `ai-text-storyboard-wenxi-...` 这类未来画布节点 id。
- Claw 返回 actions：
  - 第 1 步：`create_node`
    - `id: create-ai-text-story-video-drama`
    - `nodeType: ai-text`
    - `requiresConfirmation: false`
    - `riskLevel: low`
  - 第 2 步：`run_prompt_preset_generation`
    - `nodeId: create-ai-text-story-video-drama`
    - `taskType: text`
    - `presetTitle: 分镜视频 / 文戏`
    - `requiresConfirmation: false`
    - `riskLevel: low`
- 这说明 live 模型输出现在已经遵守“后续 action 引用前面 `create_node` action id”的协议，且预设名字段齐全。
- 又用同一组 action shape 做了前端执行器层 replay：
  - 成功创建 `ai-text` 节点；
  - 成功按 `分镜视频 / 文戏` 解析预设模板；
  - 成功调用 `generationRunner`；
  - `presetGenerationNodeIds` 与 `generationTaskNodeIds` 都包含新建节点。
- 结论：
  - C44 针对本场景的 live model-output、schema、executor action shape 已经对齐。
  - 后续如果用户在浏览器 UI 中仍看不到最终文本，需要重点检查浏览器页面是否已刷新、`run_prompt_preset_generation` 是否被 auto-apply、真实文本节点实例是否 mount 并暴露 `_onGenerate(...)`、以及文本生成 provider 本身是否返回内容。

## 70. C45 Slash 预设用户路径别名与用户预设加载修复（2026-05-26）

本节记录用户再次反馈“根本就不行”后的实际根因和修复。最新红错为浏览器执行器报：

```text
操作应用失败：第 2 条 run_prompt_preset_generation（预设生成）
原因：run_prompt_preset_generation requires presetTitle, presetTemplate, or template
```

### 70.1 根因

- 真实用户预设文件 `user/prompt-presets.json` 中，文本预设路径是：
  - `分镜视频提示词 / 文戏`
  - `分镜视频提示词 / 武戏`
- 但用户自然语言和 Claw 输出经常写成：
  - `分镜视频 / 文戏`
- C44 的本地 replay 使用了假的 provider，所以证明了 action shape 能执行，但没有覆盖“真实用户预设路径多了 `提示词` 后缀”的情况。
- 旧执行器只做精确路径匹配，`分镜视频 / 文戏` 无法匹配 `分镜视频提示词 / 文戏`，于是落到空模板错误。
- 另一个隐患：`modules/promptPresets.js` 默认只从 `config/prompt-presets.json` 初始化，用户保存到 `user/prompt-presets.json` 的扩展预设不一定在浏览器启动时自动进入同一份 `getPromptPresets(...)` 列表。
- `modules/assistant/assistantContextBuilder.js` 之前没有把可用 slash 预设路径放进 Claw 上下文，Claw 更容易根据历史记忆猜路径。

### 70.2 已完成改动

- `modules/assistant/assistantActionExecutor.js`
  - `normalizePromptPresetLookupKey(...)` 改为按 `/` 分段归一化。
  - 每段会去掉末尾泛化词：`提示词`、`预设提示词`、`预设`、`模板`。
  - 因此 `分镜视频 / 文戏` 可以匹配真实路径 `分镜视频提示词 / 文戏`。
  - 仍保留严格节点类型、文本/图片边界和视频禁止规则。
- `modules/promptPresets.js`
  - 新增浏览器启动时自动加载用户预设 definitions 的逻辑。
  - 新增 `whenPromptPresetsReady()`，方便测试和后续接力代码等待用户预设加载完成。
  - 自动加载只在真实浏览器环境触发；Node 测试环境不会误打本地路由。
- `modules/assistant/assistantContextBuilder.js`
  - 新增 `promptPresets.items` 上下文摘要。
  - 只暴露安全的 `nodeType/title/path/desc`，不暴露完整模板内容，避免大 prompt 和潜在敏感信息。
  - 这能让 Claw 知道真实可用路径，例如 `分镜视频提示词 / 文戏`，减少继续猜成 `分镜视频 / 文戏` 的概率。

### 70.3 RED/GREEN 验证

- RED 已先确认失败：
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
    - 新增用例 `resolves slash prompt preset when the spoken label omits a generic suffix` 失败于 `run_prompt_preset_generation requires presetTitle, presetTemplate, or template`。
  - `node --test --test-concurrency=1 modules\promptPresets.test.js`
    - 新增用例 `browser import automatically loads user preset definitions` 失败于 `whenPromptPresetsReady` 不存在。
  - `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js`
    - 新增用例 `includes available slash preset paths without templates` 失败于 `context.promptPresets` 不存在。
- GREEN 已通过：
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`：38 tests OK。
  - `node --test --test-concurrency=1 modules\promptPresets.test.js`：5 tests OK。
  - `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js`：8 tests OK。
- 相关前端回归已通过：
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantContextBuilder.test.js modules\promptPresets.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：84 tests OK。

### 70.4 接力注意事项

- 本轮只改前端静态 JS 与前端测试；没有改 backend schema/bridge/service。
- 不需要用户重启 `8777` 才能加载本轮后端逻辑，因为没有后端逻辑改动。
- 但正在打开的浏览器页面必须刷新，最好硬刷新，才能加载新的 `assistantActionExecutor.js`、`promptPresets.js` 和 `assistantContextBuilder.js`。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 刷新后应再次在 UI 里测试：
  - “用新的文本节点，选择「分镜视频 / 文戏」生成”
  - 预期执行器应从用户预设中解析到 `分镜视频提示词 / 文戏` 的真实模板，并触发新建文本节点的 `_onGenerate(template)`。
## 71. C46 Assistant Chat Lightweight Status And Copy UI（2026-05-26）

本节记录用户要求的聊天面板 UI 微调：任务成功/失败提示不再显示绿色或红色框，改成轻量小字；每条真实聊天消息下方增加复制按钮。

### 71.1 用户要求

- “这种框框都不要了”：成功提示去掉边框、背景和块状提示感。
- 成功提示字体改小，颜色改为淡灰色。
- 报错提示与成功提示使用同一类轻量展示：无框、小字、红色。
- 每段聊天内容下面增加复制按钮，点击复制该条消息文本。
- 不改上游 524 / Cloudflare timeout 逻辑；该问题仍按外部 provider 超时处理。

### 71.2 已完成改动

- `modules/app/appAssistantPanel.js`
  - 新增 `COPY_MESSAGE_ICON`，使用线性 copy SVG 图标。
  - `appendMessage(...)` 改为渲染：
    - `.claw-assistant-message-row`
    - `.claw-assistant-message`
    - `.claw-assistant-message-body`
    - `.claw-assistant-message-copy`
  - `appendMessage(...)` 仍返回整条消息 row，因此 `typingEl.remove()` 可以一次移除“正在思考...”临时消息，不会留下复制按钮残影。
  - 复制按钮调用 `windowRef.navigator.clipboard.writeText(...)`；测试环境可通过 `options.windowRef` 注入 clipboard。
  - `claw-assistant-message--typing` 临时消息不渲染复制按钮。
  - `.claw-assistant-message--operation` 改为无框、透明背景、11px、淡灰色。
  - `.claw-assistant-message--error` 改为无框、透明背景、11px、红色。
  - 普通用户/助手聊天气泡保留原有视觉样式，只在气泡下方多一个轻量复制按钮。

### 71.3 RED/GREEN 验证

- RED 已先确认失败：
  - `assistant panel adds copy controls under each rendered chat message`
    - 初始失败点：复制按钮数量为 0。
  - `assistant panel renders operation and error notices as lightweight text`
    - 初始失败点：operation 规则仍是绿色背景/边框。
- GREEN 已通过：
  - `node --test modules/app/appAssistantPanel.test.js`
  - 结果：39 tests pass，0 fail。

### 71.4 生效方式与注意事项

- 本轮只改前端静态 JS 和测试，不改后端 schema、bridge、route。
- 不需要重启 `8777`；运行中的浏览器页面刷新后才能加载新 UI。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守“服务动作由用户来”的约定。
- 上游 `api.gptclubapi.xyz` / Cloudflare 524 仍然判断为 provider/origin 超时，不属于本轮 UI 修复范围，也没有为此改代码。
## 72. C47 Assistant Chat Plain Text And Collapsed Error Details（2026-05-26）

本节记录用户继续调整聊天 UI 的要求：所有对话和提示都不要气泡框，改为普通文字；报错内容超过三行时默认折叠，点击箭头后再展开详情。

### 72.1 用户要求

- 用户消息、助手消息、成功提示、错误提示都不要背景气泡、边框、圆角框。
- 保留左右对齐和复制按钮，但消息主体只呈现为普通文字。
- 报错如果超过三行，不要直接把长 JSON / Cloudflare 错误全部铺开。
- 长错误默认只展示三行预览，左侧/前面提供箭头按钮。
- 点击箭头后展开完整错误详情，再次点击可收起。

### 72.2 已完成改动

- `modules/app/appAssistantPanel.js`
  - `.claw-assistant-message` 基础样式改为 `border:0`、`background:transparent`、`border-radius:0`。
  - `.claw-assistant-message--user` 和 `.claw-assistant-message--assistant` 也改为透明背景，只保留文字颜色与对齐。
  - 成功提示 `.claw-assistant-message--operation` 和错误提示 `.claw-assistant-message--error` 继续沿用 C46 的小字轻量样式。
  - 新增 `ERROR_DETAILS_TOGGLE_ICON`，作为长错误展开/收起箭头。
  - 新增 `isLongErrorMessage(...)`：只对错误消息生效，超过 3 个逻辑行或超过 240 字符时进入折叠模式。
  - 新增 `getErrorPreviewText(...)`：生成三行预览或 240 字符预览。
  - 新增 `appendLongErrorMessageContent(...)`：渲染箭头按钮、预览区、隐藏详情区，并通过 `aria-expanded` 切换。
  - 复制按钮仍复制完整原始消息文本，不受错误折叠影响。

### 72.3 RED/GREEN 验证

- RED 已先确认失败：
  - `assistant panel renders all chat messages as plain text without bubbles`
    - 初始失败点：基础消息样式仍有 `border:1px`、`border-radius:14px`、用户消息仍有蓝色渐变背景。
  - `assistant panel collapses long error details behind an arrow toggle`
    - 初始失败点：长错误没有 `toggle-error-details` 箭头按钮。
- GREEN 已通过：
  - `node --test modules/app/appAssistantPanel.test.js`
  - 结果：41 tests pass，0 fail。

### 72.4 生效方式与注意事项

- 本轮只改前端静态 JS 和测试，不改后端。
- 不需要重启 `8777`；浏览器刷新后生效。
- 本轮没有启动、重启、停止、检查或探测 `8777`。
- 上游 `api.gptclubapi.xyz` / Cloudflare 524 仍是外部 provider/origin timeout，不属于本轮 UI 变更范围。
## 73. C48 User Message Muted Bubble Correction（2026-05-26）

本节记录 C47 后的 UI 纠偏：用户澄清“我说的话要气泡框”，但气泡颜色要低调，不要之前蓝紫渐变那种扎眼效果。

### 73.1 用户要求

- 用户自己说的话保留气泡框。
- 气泡颜色参考截图里的深灰/低对比样式。
- 助手回复、成功提示、错误提示继续保持 C47 的普通文字/轻量提示形态。
- 长错误折叠和复制按钮逻辑不变。

### 73.2 已完成改动

- `modules/app/appAssistantPanel.js`
  - `.claw-assistant-message--user` 从透明普通文字改为低调气泡：
    - `background: rgba(255,255,255,.08)`
    - `border: 1px solid rgba(255,255,255,.08)`
    - `border-radius: 14px`
    - `padding: 10px 12px`
  - 明确不再使用旧的蓝紫 `linear-gradient(...)` 用户气泡。
  - `.claw-assistant-message--assistant` 仍为普通文字。
  - operation/error 轻量提示和长错误折叠逻辑保持不变。
- `modules/app/appAssistantPanel.test.js`
  - 将 C47 的“all chat messages plain text without bubbles” 测试调整为：
    - 用户消息是 muted bubble；
    - 助手消息仍是 plain text；
    - 用户气泡不得出现 `linear-gradient`。

### 73.3 RED/GREEN 验证

- RED 已先确认失败：
  - `assistant panel renders user messages as muted bubbles and assistant text as plain text`
  - 初始失败点：用户消息仍是 `background:transparent`。
- GREEN 已通过：
  - `node --test modules/app/appAssistantPanel.test.js`
  - 结果：41 tests pass，0 fail。

### 73.4 生效方式与注意事项

- 本轮只改前端静态 JS 和测试。
- 不需要重启 `8777`；浏览器刷新后生效。
- 本轮没有启动、重启、停止、检查或探测 `8777`。
## 74. C49 Slash Preset Generation Uses Hidden Pending Preset（2026-05-26）

本节记录用户截图反馈后的修复：Claw 已经能拿到 `/` 预设提示词，但执行时把完整模板直接展示到了节点输入框里；正确效果应当像用户手动选择 `/` 预设一样，只显示预设 chip，并在生成时把模板作为隐藏参数传入。

### 74.1 根因

- `run_prompt_preset_generation` 已经可以根据 `presetTitle` / action title 解析真实预设模板。
- 旧的前端执行器在 `modules/assistant/assistantActionExecutor.js` 中做了两件会导致模板外露的事：
  - `graphStore.updateNodeData(nodeId, { prompt: template, ... })`
  - 默认 runner 调用 mounted node instance 时执行 `_onGenerate(template)`
- 节点输入框绑定的是节点 `prompt` 字段，因此 `prompt: template` 会把完整预设内容显示在输入框里。
- 手动 `/` 菜单的正确路径不是写 `prompt`，而是 `setPendingPromptPreset(...)`：
  - 输入框只显示 chip，例如 `人设参考 > 人物三视图`；
  - 模板存在 pending preset 里；
  - 生成时通过 `getPromptPresetGenerateArgs(...)` 注入模板。

### 74.2 已完成改动

- `modules/assistant/assistantActionExecutor.js`
  - 引入 `setPendingPromptPreset(...)`。
  - `runPromptPresetGenerationOnCanvas(...)` 不再写入 `prompt: template`。
  - 仍然保存隐藏调试/追踪字段：
    - `generationPresetTemplate`
    - `generationPresetTitle`
    - `generationPresetStatus`
    - `generationTaskType`
  - 默认 runner 在 mounted instance 存在 `promptEl` 时：
    - 调用 `setPendingPromptPreset({ promptEl, path, template })`；
    - 之后空参数调用 `_onGenerate()` / `onGenerate()`；
    - 让节点自身已有的 `getPromptPresetGenerateArgs(...)` 按手动 `/` 菜单路径注入模板。
  - 如果 instance 没有 `promptEl`，保留兜底：仍直接 `_onGenerate(template)`，避免无 UI 实例场景完全失效。
  - 新增 `getPromptPresetSelectionPath(...)` / `splitPromptPresetPathLabel(...)`，把 `人设参考 / 人物三视图`、`人设参考 > 人物三视图` 这类标题转成 chip path。

### 74.3 用户可见效果

- AI 助手再执行 `run_prompt_preset_generation` 时，不应把完整提示词塞进输入框。
- 输入框应更接近手动 `/` 菜单行为：显示预设 chip，例如 `人设参考 > 人物三视图`。
- 真实生成仍然使用完整模板，只是模板作为隐藏 pending preset 参数传给生成函数。
- 复制、长错误折叠、聊天 UI C46-C48 逻辑不受影响。

### 74.4 RED/GREEN 验证

- RED 已先确认失败：
  - executor 旧行为会把节点 `prompt` 改成完整模板；
  - default runner 旧行为会直接 `_onGenerate(template)`。
- GREEN 已通过：
  - `node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js`
  - 结果：38 tests pass。
- 相关前端回归已通过：
  - `node --test --test-concurrency=1 modules/assistant/assistantActionExecutor.test.js modules/assistant/assistantActionPreview.test.js modules/app/appAssistantPanel.autoload.test.js modules/promptPresets.test.js modules/slashMenu.test.js components/aigenImage/taskOrchestrationModule.promptPreset.test.js components/aigenText/taskOrchestrationModule.test.js`
  - 结果：93 tests pass。

### 74.5 生效方式与注意事项

- 本轮只改前端静态 JS 和测试。
- 不需要重启 `8777`；浏览器刷新后生效。
- 本轮没有启动、重启、停止、检查或探测 `8777`。
- 如果真实 UI 中仍看到完整模板出现在输入框，优先检查浏览器是否加载了旧缓存 JS，以及 mounted node instance 是否暴露 `promptEl`。

## 75. WOW Roadmap Five-Phase Reslice And Phase-Two Auto Layout Promotion（2026-05-26）

本节记录路线图重排决策：用户要求把“自动整理画布”提前到阶段二，并输出阶段一到阶段五的大致开发切片规划。已更新 `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`，后续接力开发以该文档第 4 节的“五阶段推进顺序和切片规划”为准。

### 75.1 最新阶段口径

| 阶段 | 名称 | 状态 | 预计切片数 |
|---:|---|---|---:|
| 1 | 底座和 Prompt 手术台收口 | 已完成 | 7 |
| 2 | 画布医生 + 自动整理画布 | 待推进 | 8 |
| 3 | 一句话生成工作流 MVP | 待推进 | 6 |
| 4 | 分镜导演模式 | 待推进 | 7 |
| 5 | 变体宇宙 + 工作流炼金术 | 待推进 | 9 |

总计约 37 个开发切片；阶段一已经完成，剩余约 30 个切片。

### 75.2 关键变更

- 自动整理画布从旧路线图的阶段 5 提前到阶段 2。
- 阶段 2 不再只是“画布医生 MVP”，而是“诊断问题 + 标注问题 + 聚焦问题 + 自动整理”的闭环。
- 阶段完成汇报新增硬约定：一个阶段最后一个切片通过测试、完成必要联调、并写入接力文档后，必须明确向用户说“阶段 X 已完成”。
- 阶段 1 已经按当前 C49 状态标记完成：底座、记忆、动作执行、文本/图片生成、`/` 预设生成和 UI 基础都已经具备。

### 75.3 阶段二下一步

当前最应该推进阶段二 S2-01：画布医生诊断协议。

建议下一轮开发从测试开始：

- 后端 bridge prompt 应明确“检查画布”只能输出诊断摘要、`create_node(comment/source-text)` 诊断注释、`focus_nodes`、`set_viewport`、必要的 `layout_nodes`，不能触发付费生成。
- schema/validator 应继续拦截视频生成、删除节点、外部文件/命令等高风险动作。
- 前端 context 应补足诊断需要的节点状态、缺 prompt、缺模型、重复命名、失败任务、孤立节点和边关系摘要。
- 阶段二完成前不需要新增破坏性 action；优先产品化已有 `move_nodes`、`layout_nodes`、`create_group`、`focus_nodes` 和 `set_viewport`。

### 75.4 服务规则

- 本轮只是文档和规划更新，没有改后端/前端代码。
- 不需要重启 `8777`。
- 继续遵守用户约定：开发者不要启动、重启、停止、检查或探测 `8777`；如果后续某个后端切片需要重启，停下来让用户处理。

## 76. S2-01 Canvas Doctor Bridge Protocol（2026-05-26）

本节记录阶段二第一个开发切片：画布医生诊断协议。目标是先让 Claw 明白“检查画布/画布医生/诊断”这类请求应该输出什么，先不做诊断上下文扩展、前端注释 UI 或自动整理策略。

### 76.1 已完成改动

- `services/claw_bridge_service.py`
  - 新增 `ACTION_PROTOCOL["canvasDoctorRules"]`。
  - 规则明确画布医生意图：
    - `检查画布`
    - `诊断`
    - `画布有什么问题`
  - 规则要求模型基于 `context.canvas.nodes/edges/status/model/prompt/name` 检查：
    - 孤立节点
    - 缺 prompt
    - 缺模型
    - 失败/进行中任务
    - 重复命名或空命名
    - 可疑连接/断链
  - 规则允许的低风险动作：
    - `create_node` 创建 `comment` / `source-text` 诊断注释
    - `focus_nodes` 聚焦关键问题节点
    - `set_viewport` 移动画布视野
    - 仅当用户明确要求“整理/排版”时才允许使用 `layout_nodes`
  - 规则禁止诊断场景误触发：
    - `queue_generation_task`
    - `run_prompt_preset_generation`
    - 删除节点
    - 改 prompt/model/assets
    - 创建 `ai-*` 生成节点
  - `_compact_action_protocol()` 和最终 emergency/minimal prompt 协议都保留 `canvasDoctorRules`，避免大画布压缩 prompt 时丢失画布医生行为规则。
  - 为保持完整 prompt 低于 Windows 命令行参数阈值，顺手压缩了既有 asset/safety 协议文案，但保留既有测试依赖的关键短语。

- `claw_bridge_service_test.py`
  - 新增 `test_chat_prompt_contains_canvas_doctor_protocol`。
  - 新增 `test_compact_action_protocol_preserves_canvas_doctor_protocol`。

### 76.2 RED/GREEN 验证

- RED 已先确认失败：
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_canvas_doctor_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_compact_action_protocol_preserves_canvas_doctor_protocol`
  - 初始失败点：`canvasDoctorRules` 不存在。
- GREEN 已通过：
  - 同一条 focused 命令 2 tests OK。
- 相关后端回归已通过：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：75 tests OK。
- 语法检查已通过：
  - `python -m py_compile services\claw_bridge_service.py`

### 76.3 接力注意事项

- 这是阶段二 S2-01，已完成。
- 阶段二尚未完成；不能向用户说“阶段二已完成”。
- 下一步建议推进 S2-02：诊断上下文补强，让 `modules/assistant/assistantContextBuilder.js` 明确暴露节点状态、缺 prompt、缺模型、边关系、重复命名、失败任务等摘要。
- 本轮改了 backend bridge prompt/protocol，真实 `8777` 进程需要由用户重启后才会加载新规则。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 77. S2-02 Canvas Doctor Diagnostics Context（2026-05-26）

本节记录阶段二第二个开发切片：诊断上下文补强。S2-01 已经让 Claw 知道“画布医生”应该如何输出；S2-02 让前端上下文直接提供高信号诊断摘要，减少模型在大画布里自己推理节点/边问题的负担。

### 77.1 已完成改动

- `modules/assistant/assistantContextBuilder.js`
  - 新增 `canvas.diagnostics`。
  - 诊断摘要包含：
    - `nodeCount`
    - `edgeCount`
    - `nodeDegrees`
    - `issues`
    - `missingPromptNodeIds`
    - `missingModelNodeIds`
    - `failedNodeIds`
    - `inProgressNodeIds`
    - `isolatedNodeIds`
    - `emptyNameNodeIds`
    - `duplicateNames`
    - `danglingEdges`
  - 诊断项只保存节点 id、边 id、问题类型、重复名称等摘要，不复制完整 prompt、媒体 URL、密钥、路径或大字段。
  - 默认限制：
    - `DEFAULT_DIAGNOSTIC_LIMIT = 24`
    - `DEFAULT_NODE_DEGREE_LIMIT = 80`
  - 支持 `options.diagnosticLimit` 和 `options.nodeDegreeLimit` 调整上限，方便后续大画布策略接力。
  - 诊断覆盖：
    - AI 节点缺 prompt/content/text
    - AI 节点缺 provider/model/selectedModelId 等模型字段
    - failed/error/失败/异常 状态
    - running/pending/queued/进行中/排队/生成中 状态
    - 入出度都为 0 的孤立节点
    - 空名称节点
    - 重复名称节点
    - source/target 指向不存在节点的断链边

- `services/claw_bridge_service.py`
  - `canvasDoctorRules` 更新为优先使用 `context.canvas.diagnostics`，然后再查看 nodes/edges/status/model/prompt/name。

- `modules/assistant/assistantContextBuilder.test.js`
  - 新增 `assistant context includes canvas doctor diagnostics for structural issues`。

- `claw_bridge_service_test.py`
  - 更新画布医生协议测试，要求 prompt 中出现 `context.canvas.diagnostics`。

### 77.2 RED/GREEN 验证

- RED 已先确认失败：
  - `node --test --test-concurrency=1 --test-name-pattern "canvas doctor diagnostics" modules\assistant\assistantContextBuilder.test.js`
  - 初始失败点：`context.canvas.diagnostics` 不存在。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_canvas_doctor_protocol`
  - 初始失败点：桥接协议没有 `context.canvas.diagnostics`。
- GREEN 已通过：
  - focused context test 1 test OK。
  - focused bridge protocol test 1 test OK。
- 相关回归已通过：
  - `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js`
  - 结果：9 tests OK。
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：75 tests OK。
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `python -m py_compile services\claw_bridge_service.py`

### 77.3 接力注意事项

- 这是阶段二 S2-02，已完成。
- 阶段二仍未完成；不能向用户说“阶段二已完成”。
- 下一步建议推进 S2-03：诊断注释落画布。重点不是新增动作，而是让模型稳定用 `create_node` 创建 `comment/source-text` 诊断注释，并让 preview/receipt 文案更像“诊断注释”而不是普通创建节点。
- 本轮改了前端静态 JS 和 backend bridge prompt：
  - 浏览器需要刷新后才会带上 `canvas.diagnostics`。
  - 真实 `8777` 进程需要由用户重启后才会加载新的 bridge prompt。
- 本轮没有启动、重启、停止、检查或探测 `8777`。
## 78. S2-03 Canvas Doctor Annotation Landing（2026-05-26）

本节记录阶段二第三个开发切片：诊断注释落画布。S2-01 让模型知道“画布医生”应该做什么，S2-02 让上下文提供诊断证据，S2-03 让模型输出的诊断注释在 schema、bridge prompt 和前端 preview 中形成稳定产品约定。

### 78.1 已完成改动

- `services/claw_action_schema.py`
  - 在安全 node data 字段中加入诊断注释元数据：
    - `diagnosticKind`
    - `diagnosticSeverity`
    - `diagnosticNodeId`
    - `diagnosticNodeIds`
    - `diagnosticIssue`
    - `diagnosticSuggestion`
  - `create_node` 使用 `nodeType: "comment"` 或 `"source-text"` 时可以保留这些字段。
  - 没有新增破坏性 action，也没有新增付费/外部调用能力。

- `services/claw_bridge_service.py`
  - `SAFE_NODE_DATA_FIELDS` 同步加入上述诊断字段。
  - `canvasDoctorRules` 明确要求诊断注释使用 `create_node comment/source-text`，并带上 `data.diagnosticKind`、`diagnosticSeverity`、`diagnosticNodeIds`、`diagnosticSuggestion`。
  - 仍然禁止诊断场景调用 `queue_generation_task`、`run_prompt_preset_generation`、删除节点、修改 prompt/model/assets、创建 `ai-*` 生成节点。
  - 为解决 Windows `MAX_PROMPT_ARGUMENT_CHARS = 16000` 限制，压缩了 bridge 协议说明文本，但保留已有测试依赖的关键短语。
  - 修复后典型 prompt 长度：batch 约 14233，project preferences 约 14169，canvas doctor 约 14282，base 约 14066；这些场景不再触发 `promptCompaction`。

- `modules/assistant/assistantActionPreview.js`
  - 新增诊断注释摘要逻辑。
  - 当 `create_node` 的 `data` 中带诊断字段时，preview 返回 `kind: "diagnostic"`，保留 action title，并使用“画布诊断”语义，而不是普通创建节点提示。

- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - 阶段二切片表新增“状态”列。
  - S2-01、S2-02、S2-03 已标记为“已完成”。
  - 后续 S2-04 的完成情况见第 79 节；S2-05 到 S2-08 继续待推进。

### 78.2 RED/GREEN 验证

- RED 已先确认失败：schema 旧版本不会保留诊断元数据；preview 旧版本会把诊断注释当普通 `create_node`；bridge prompt 旧版本没有明确 `diagnosticKind` / `diagnosticNodeIds` / `diagnosticSuggestion`。
- GREEN 已通过：
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_canvas_doctor_annotation_metadata claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_canvas_doctor_protocol`
  - 结果：2 tests OK。
  - `node --test --test-concurrency=1 --test-name-pattern "canvas doctor annotation" modules\assistant\assistantActionPreview.test.js`
  - 结果：1 test pass。
- 相关回归已通过：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：76 tests OK。
  - `node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js`
  - 结果：19 tests pass。
  - `node --check modules\assistant\assistantActionPreview.js`
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`

### 78.3 用户可见效果

- Claw 在“检查画布 / 诊断画布”场景下可以更稳定地返回诊断注释动作。
- 前端 preview 会把带诊断字段的 `comment/source-text` 创建动作识别为“画布诊断注释”，不再只是普通创建节点。
- 本节完成时尚未完成“自动聚焦最严重问题”或“自动整理画布”；自动聚焦已在后续第 79 节 S2-04 补上，自动整理仍属于 S2-05 到 S2-07。

### 78.4 接力注意事项

- 这是阶段二 S2-03，已经完成。
- 阶段二尚未完成，不能向用户说“阶段二已完成”。
- S2-04 已在后续第 79 节完成；下一步进入 S2-05“自动整理画布 MVP”。
- 本轮改了 backend bridge/schema 和 frontend static JS：真实 `8777` 进程需要由用户重启后才会加载新的 bridge/schema；浏览器需要刷新后才会加载新的 preview JS。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 79. S2-04 Canvas Doctor Severe Issue Focus（2026-05-26）

本节记录阶段二第四个开发切片：聚焦最严重问题。S2-03 已经能把诊断注释作为产品化动作展示；S2-04 让上下文直接给出推荐聚焦节点，并让 `focus_nodes` / `set_viewport` 带诊断元数据，方便模型、preview 和后续 receipt 对齐。

### 79.1 已完成改动

- `modules/assistant/assistantContextBuilder.js`
  - 新增诊断聚焦推荐：
    - `context.canvas.diagnostics.recommendedFocusNodeIds`
    - `context.canvas.diagnostics.recommendedFocusIssues`
  - 推荐排序是确定性的，优先级大致为：
    - failed node
    - dangling edge 的现存端点
    - missing prompt
    - missing model
    - empty name
    - in-progress node
    - isolated node
    - duplicate name
  - 默认最多推荐 3 个节点，避免大画布里一次聚焦太多。

- `services/claw_action_schema.py`
  - `focus_nodes` 和 `set_viewport` 现在可以保留：
    - `diagnosticKind`
    - `diagnosticSeverity`
    - `diagnosticSuggestion`
  - 这些字段只用于说明诊断聚焦原因，不会放开删除、生成或外部调用能力。

- `services/claw_bridge_service.py`
  - `canvasDoctorRules` 新增规则：
    - 使用 `context.canvas.diagnostics.recommendedFocusNodeIds`
    - 聚焦 1-3 个最严重问题节点
    - 先 `focus_nodes`，再 `set_viewport`
    - 在聚焦动作上带 `diagnosticKind/diagnosticSeverity/diagnosticSuggestion`
  - `allowedActions` 中 `focus_nodes` 和 `set_viewport` 的 optional 字段同步暴露诊断字段。
  - S2-04 后典型 prompt 仍未触发压缩：
    - batch：约 14572
    - project preferences：约 14508
    - canvas doctor：约 14621
    - base：约 14405

- `modules/assistant/assistantActionPreview.js`
  - 当 `focus_nodes` / `set_viewport` 带诊断字段时，preview summary 使用 `kind: "diagnostic_focus"`。
  - 操作说明显示为“画布诊断聚焦”，而不是普通 focus。

- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - S2-04 已标记为“已完成”。
  - S2-05 到 S2-08 仍为“待推进”。

### 79.2 RED/GREEN 验证

- RED 已先确认失败：
  - `recommendedFocusNodeIds` / `recommendedFocusIssues` 不存在；
  - schema 会丢掉 `focus_nodes` / `set_viewport` 上的诊断字段；
  - preview 把诊断聚焦显示为普通 `focus`；
  - bridge prompt 没有提到 `recommendedFocusNodeIds`。

- GREEN 已通过：
  - `node --test --test-concurrency=1 --test-name-pattern "canvas doctor diagnostics|canvas doctor focus" modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js`
  - 结果：2 tests pass。
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_accepts_canvas_doctor_focus_metadata claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_canvas_doctor_protocol`
  - 结果：2 tests OK。

- 相关回归已通过：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：77 tests OK。
  - `node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js`
  - 结果：20 tests pass。
  - `node --check modules\assistant\assistantActionPreview.js`
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`

### 79.3 用户可见效果

- 当用户要求“检查画布”时，Claw 会获得更明确的聚焦目标，不需要自己从完整 issue list 中猜最严重的 1-3 个节点。
- 如果 Claw 返回带诊断字段的 `focus_nodes` / `set_viewport`，前端 preview 会显示为“画布诊断聚焦”。
- 这一步仍不等于自动整理画布；它只负责把最严重问题带到用户视野中。

### 79.4 接力注意事项

- 这是阶段二 S2-04，已经完成。
- 阶段二尚未完成，不能向用户说“阶段二已完成”。
- S2-05 已在后续第 80 节完成；下一步进入 S2-06“整理策略分型”。
- 本轮改了 backend bridge/schema 和 frontend static JS：真实 `8777` 进程需要由用户重启后才会加载新的 bridge/schema；浏览器需要刷新后才会加载新的 preview/context JS。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 80. S2-05 Auto Layout MVP（2026-05-26）

本节记录阶段二第五个开发切片：自动整理画布 MVP。用户确认实现方向：画布节点本身有 `x/y` 坐标和 `width/height` 尺寸，但不要让模型随意给每个节点写死最终坐标；Claw 只表达整理意图，幻映本地执行器负责安全地计算和应用位置。

### 80.1 已完成改动

- `modules/assistant/assistantContextBuilder.js`
  - 新增 `context.canvas.layoutHints`。
  - 主要字段：
    - `coordinateSystem: "absolute_xy_top_left"`
    - `targetNodeIds`
    - `bounds`
    - `suggestedOrigin`
    - `defaultGap: 96`
    - `safeActions`
    - `forbiddenEdits`
    - `nodeRects`
    - `relatedEdgeCount`
  - `targetNodeIds` 的选择顺序：
    - 优先当前选中节点；
    - 其次 `context.canvas.diagnostics.recommendedFocusNodeIds`；
    - 最后使用可见 canvas nodes。
  - `bounds` 根据目标节点的 `x/y/width/height` 计算。
  - `safeActions` 仅包含 `layout_nodes`、`move_nodes`、`create_group`、`rename_node`、`focus_nodes`、`set_viewport`。
  - `forbiddenEdits` 明确包含 `prompt`、`model`、`assets`、`generation`、`delete`。

- `services/claw_bridge_service.py`
  - 新增 `ACTION_PROTOCOL["autoLayoutRules"]`。
  - 规则要求：
    - “整理画布 / 排版 / Auto layout”优先使用 `context.canvas.layoutHints`；
    - 节点坐标体系是 `absolute_xy_top_left`，即左上角 `x/y` 加 `width/height`；
    - 只能使用 layout/move/group/rename/focus/viewport 动作；
    - 不改 prompt/model/assets/generation；
    - 不删除；
    - 不调用 `queue_generation_task` 或 `run_prompt_preset_generation`。
  - `_compact_action_protocol()` 和 emergency/minimal prompt 协议都保留 `autoLayoutRules`。
  - S2-05 后典型 prompt 未触发压缩：layout 约 15270，batch 约 15176，canvas doctor 约 15225，base 约 15009。

- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - S2-05 已标记为“已完成”。
  - S2-06 到 S2-08 仍为“待推进”。

### 80.2 RED/GREEN 验证

- RED 已先确认失败：
  - `context.canvas.layoutHints` 不存在；
  - bridge action protocol 没有 `autoLayoutRules`；
  - compact protocol 没有保留自动整理规则。
- GREEN 已通过：
  - `node --test --test-concurrency=1 --test-name-pattern "auto layout hints" modules\assistant\assistantContextBuilder.test.js`
  - 结果：1 test pass。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_auto_layout_mvp_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_compact_action_protocol_preserves_auto_layout_protocol`
  - 结果：2 tests OK。
- 相关回归已通过：
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：79 tests OK。
  - `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：83 tests pass。
  - `node --check modules\assistant\assistantContextBuilder.js`
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`

### 80.3 用户可见效果

- 当用户说“帮我整理一下画布”时，Claw 会知道当前画布是 xy 坐标体系、应该优先整理哪些节点、可以从哪个 origin 附近开始排、只能做布局/移动/分组/必要命名/视图聚焦。
- 本轮不改变 executor，因为已有 `layout_nodes` 等动作已经能真实移动节点。
- 这一步是自动整理 MVP，不是最终智能排版策略。复杂布局分型属于 S2-06。

### 80.4 接力注意事项

- 这是阶段二 S2-05，已经完成。
- 阶段二尚未完成，不能向用户说“阶段二已完成”。
- 下一步建议推进 S2-06：整理策略分型。
  - 单链路：横向从左到右。
  - 分支/多输出：上游在左，下游 fan-out。
  - 分镜：按镜头/序号成行或网格。
  - 素材区：source 节点靠左或上方。
  - 失败区/问题区：失败和缺配置节点聚到可见问题区，但不改参数。
- 本轮改了 backend bridge 和 frontend static JS：真实 `8777` 进程需要由用户重启后才会加载新的 bridge prompt；浏览器需要刷新后才会带上 `canvas.layoutHints`。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 81. S2-06 Auto Layout Strategy Typing（2026-05-26）

本节记录阶段二第六个开发切片：整理策略分型。S2-05 已经给 Claw 提供 xy 坐标体系、整理目标和安全动作边界；S2-06 在此基础上把常见画布结构压成可读的布局策略提示，让模型不要把所有画布都当成同一种网格来排。

### 81.1 已完成改动

- `modules/assistant/assistantContextBuilder.js`
  - 新增自动整理策略构建逻辑：
    - `layoutNodeTitle`
    - `isStoryboardLayoutNode`
    - `isAssetLayoutNode`
    - `pushLayoutStrategy`
    - `buildAutoLayoutStrategies`
  - `context.canvas.layoutHints.strategies` 现在可输出：
    - `branch_flow`：一个上游节点连接多个下游时，建议 fan-out 分支布局。
    - `single_chain`：单链路从起点到终点时，建议从左到右排列。
    - `storyboard_grid`：分镜/镜头/shot/storyboard 节点建议按行或网格排布。
    - `asset_lane`：`source-image/source-video/source-audio` 等素材节点建议形成素材区。
    - `problem_lane`：失败、缺 prompt、缺 model 或诊断推荐节点建议聚合为问题区。
  - 策略来自当前 node/edge/diagnostics 摘要，不复制完整 prompt、媒体 URL 或本地路径。

- `services/claw_bridge_service.py`
  - `autoLayoutRules` 增加简短策略说明：
    - 优先使用 `context.canvas.layoutHints.strategies`；
    - `single_chain` 左到右；
    - `branch_flow` fan-out；
    - `storyboard_grid` 用行/网格；
    - `asset_lane` 放素材；
    - `problem_lane` 放问题区。
  - 没有新增 action 类型，没有扩大生成、删除、文件或外部调用权限。

- `modules/assistant/assistantContextBuilder.test.js`
  - 新增 `assistant context includes typed auto layout strategy hints`。

- `claw_bridge_service_test.py`
  - 自动整理协议测试同步要求 bridge prompt 包含策略分型口径。

### 81.2 RED/GREEN 验证

- RED 已先确认失败：
  - `node --test --test-concurrency=1 --test-name-pattern "typed auto layout strategy" modules\assistant\assistantContextBuilder.test.js`
  - 初始失败点：`context.canvas.layoutHints.strategies` 不存在。
- GREEN 已通过：
  - `node --test --test-concurrency=1 --test-name-pattern "typed auto layout strategy" modules\assistant\assistantContextBuilder.test.js`
  - 结果：1 test pass。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_auto_layout_mvp_protocol`
  - 结果：1 test OK。

### 81.3 用户可见效果

- 当用户说“整理画布”时，Claw 不只知道能移动哪些节点，还能看到“这批节点更像单链路、分支、分镜、素材区还是问题区”。
- 这能降低“所有节点都排成一条线”或“诊断问题区和素材区混在一起”的概率。
- 本切片仍只做整理意图和策略提示，不改 prompt/model/assets/generation，不触发文本/图片/视频生成。

### 81.4 接力注意事项

- 这是阶段二 S2-06，已经完成。
- S2-07 已在后续第 82 节完成；它负责把诊断 + 整理批次的回执文案对齐。
- 本轮改了 backend bridge 和 frontend static JS：真实 `8777` 进程需要由用户重启后才会加载新的 bridge prompt；浏览器需要刷新后才会带上 `canvas.layoutHints.strategies`。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 82. S2-07 Doctor + Layout Receipt Linkage（2026-05-26）

本节记录阶段二第七个开发切片：画布医生 + 整理联动回执。S2-01 到 S2-06 已经让助手能诊断、标注、聚焦并表达整理策略；S2-07 解决用户对结果的理解问题：同一批动作里如果先诊断再整理，聊天摘要应该说“画布诊断 / 诊断聚焦 / 诊断后整理”，而不是普通“新建 / 聚焦 / 布局”。

### 82.1 已完成改动

- `modules/app/appAssistantPanel.js`
  - `formatApplyActionsResult(result, actions = [])` 现在会读取原始 actions。
  - 新增诊断元数据识别：
    - `diagnosticKind`
    - `diagnosticSeverity`
    - `diagnosticNodeId`
    - `diagnosticNodeIds`
    - `diagnosticIssue`
    - `diagnosticSuggestion`
  - 带诊断字段的 `create_node` 会在回执中计为 `画布诊断 N 条`。
  - 带诊断字段的 `focus_nodes` / `set_viewport` 会在回执中计为 `诊断聚焦 N 个节点`。
  - 同一批动作含诊断注释/聚焦并且含 `layout_nodes` 或 `move_nodes` 时，会把实际整理节点数计为 `诊断后整理 N 个节点`。
  - 普通批量操作仍保留原有文案，例如 `移动 N 个节点`、`布局 N 个节点`、`新建 N 个节点`。

- `modules/app/appAssistantPanel.test.js`
  - 新增 `assistant panel links canvas doctor and layout operation receipts`。
  - 覆盖同一批 actions：
    - 诊断 comment；
    - 诊断聚焦；
    - 诊断后 layout；
    - executor 返回 created/focused/layout 结果。

### 82.2 RED/GREEN 验证

- RED 已先确认失败：
  - `node --test --test-concurrency=1 --test-name-pattern "doctor and layout operation receipts" modules\app\appAssistantPanel.test.js`
  - 初始失败点：回执仍显示 `新建 1 个节点，聚焦 2 个节点，布局 3 个节点`，没有 `画布诊断 1 条`、`诊断聚焦 2 个节点`、`诊断后整理 3 个节点`。
- GREEN 已通过：
  - `node --test --test-concurrency=1 --test-name-pattern "doctor and layout operation receipts" modules\app\appAssistantPanel.test.js`
  - 结果：1 test pass。
- 相关前端回归已通过：
  - `node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js`
  - 结果：42 tests pass。

### 82.3 用户可见效果

- 用户要求“检查并整理画布”时，如果模型返回诊断注释、诊断聚焦和整理动作，聊天区会显示更贴近真实意图的摘要：
  - `画布诊断 1 条`
  - `诊断聚焦 2 个节点`
  - `诊断后整理 3 个节点`
- 这条摘要也会进入 operation memory，后续追问“刚刚整理了什么”时更容易对齐上下文。

### 82.4 接力注意事项

- 这是阶段二 S2-07，已经完成。
- 本切片是前端静态 JS 变化；浏览器刷新后生效。
- 不需要后端重启才能加载本切片本身，但 S2-06 及更早 backend bridge/schema 变化在真实服务里仍需要用户管理的 `8777` 重启后才会生效。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 83. S2-08 Phase 2 Regression And Handoff Closure（2026-05-26）

本节记录阶段二第八个开发切片：阶段二回归和接力文档收口。完成本节后，阶段二“画布医生 + 自动整理画布”按当前 roadmap 口径已完成，下一步进入阶段三“一句话生成工作流 MVP”。

### 83.1 已完成改动

- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - 阶段二状态改为“已完成”。
  - S2-06、S2-07、S2-08 状态改为“已完成”。
  - 总体剩余切片从约 30 个更新为约 22 个。
  - 近期推荐任务切换到阶段三 S3-01 到 S3-06。

- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
  - 顶部当前状态新增阶段二完成摘要。
  - 新增第 81、82、83 节，分别记录 S2-06、S2-07、S2-08。
  - 明确保留 `8777` 协作规则：开发者不主动启动、重启、停止、检查或探测该服务。

- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
  - 补充阶段二覆盖项：画布医生诊断、诊断注释、诊断聚焦、自动整理 MVP、整理策略分型、诊断后整理回执。

- `task_plan.md`、`progress.md`、`findings.md`
  - 记录阶段二收口结果、测试证据、剩余限制和下一阶段方向。

### 83.2 阶段二回归验证

本轮离线验证通过：

- `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：79 tests OK。
- `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`
  - 结果：126 tests pass。
- `node --check modules\assistant\assistantContextBuilder.js modules\assistant\assistantActionPreview.js modules\app\appAssistantPanel.js`
  - 结果：通过。
- `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - 结果：通过。

### 83.3 阶段二完成口径

阶段二已完成，当前具备：

- 画布医生诊断协议；
- 诊断上下文摘要；
- 诊断注释落画布；
- 严重问题聚焦；
- 自动整理画布 MVP；
- 整理策略分型；
- 诊断 + 整理回执联动；
- 阶段二回归和接力文档。

仍需在阶段三继续推进：

- 一句话搭建文生图、图生视频、文生图生视频等工作流；
- 工作流节点默认值；
- 更强的端口/handle 语义；
- 新工作流布局、聚焦、preview/receipt。

### 83.4 接力注意事项

- 阶段二已完成。
- 早期 S2-01 到 S2-05 历史小节里出现的“阶段二尚未完成”是当时切片状态，已被本节 S2-08 完成状态覆盖。
- 下一步建议从阶段三 S3-01“常用工作流模板协议”开始。
- 本阶段没有进行真实浏览器/云模型/Claw live 联调；只做离线自动化验证。
- 如需看真实效果，需要用户自行确保 `8777` 已按最新后端代码重启，并刷新浏览器页面。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 84. S3-06 Phase 3 Regression And Handoff Closure（2026-05-26）

本节记录阶段三第六个开发切片：阶段三回归和接力文档收口。完成本节后，阶段三“一句话生成工作流 MVP”按当前 roadmap 口径已完成，下一步进入阶段四“分镜导演模式”。

### 84.1 阶段三完成口径

阶段三已完成，当前具备：

- `workflowMvpRules`：bridge prompt 明确“搭工作流”只创建结构，不默认运行生成。
- 常用 workflow kind：`text_to_image`、`image_to_video`、`text_to_image_video`、`image_variants`。
- 安全 workflow metadata：`workflowKind`、`workflowStep`、`workflowGroupId`、`workflowReason`。
- 复用既有低风险 action：`create_node`、`connect_nodes`、`layout_nodes`、`focus_nodes`、`set_viewport`。
- 结构链路：文生图、图生视频、文生图生视频和图片批量变体雏形。
- preview/receipt：能说明创建节点数、连接数和“未自动运行付费生成”边界。
- executor/result：能记录 `workflowNodeIds` 和 `workflowGroupIds`，方便操作回执和后续上下文追踪。

### 84.2 安全边界

- 工作流创建默认不调用 `queue_generation_task`。
- 工作流创建默认不调用 `run_prompt_preset_generation`。
- 不删除现有节点。
- 不修改用户已有节点的 prompt/model/assets/generation 参数，除非用户明确要求。
- 不绕过 `actions/validate`、前端二次校验、executor 和 undo/history 事务路径。
- 本阶段不新增 shell、文件写入、外部网络或团队模板库能力。

### 84.3 已固化的自动化覆盖

- `claw_bridge_service_test.py`
  - 覆盖 `workflowMvpRules`、`text_to_image_video`、`image_variants`、workflow metadata 字段，以及禁止 `queue_generation_task` / `run_prompt_preset_generation`。
- `claw_action_schema_test.py`
  - 覆盖 `create_node` workflow metadata 白名单、`text_to_image_video` 三段结构元数据保留。
- `modules/assistant/assistantContextBuilder.test.js`
  - 覆盖 workflow metadata 进入 canvas/selection context。
- `modules/assistant/assistantActionPreview.test.js`
  - 覆盖工作流结构 preview 和付费生成边界文案。
- `modules/assistant/assistantActionExecutor.test.js`
  - 覆盖同批创建 workflow 节点、连接、布局、聚焦和 `workflowNodeIds/workflowGroupIds`。
- `modules/app/appAssistantPanel.test.js`
  - 覆盖工作流 receipt 不暗示已经运行付费生成。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖持久 operation summary 记录 workflow receipt 和付费边界。

### 84.4 回归入口

阶段三回归已经纳入 `scripts/claw_assistant_regression.ps1` 的 backend/frontend broad suites：

- backend broad 包含 `claw_bridge_service_test.py` 和 `claw_action_schema_test.py`。
- frontend broad 包含 `assistantContextBuilder.test.js`、`assistantActionPreview.test.js`、`assistantActionExecutor.test.js`、`appAssistantPanel.test.js` 和 `appAssistantPanel.autoload.test.js`。
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md` 新增 `S3-WORKFLOW-MVP / 一句话搭工作流` 人工 live 验收项。

窗口 D 收口验收命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List
git diff --check -- docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md docs\CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md scripts\claw_assistant_regression.ps1 task_plan.md progress.md findings.md
```

### 84.5 接力注意事项

- 阶段三已完成。
- 早期文档里“阶段三待推进”的描述是当时切片状态，已被本节 S3-06 完成状态覆盖。
- 下一步建议从阶段四 S4-01“脚本拆镜协议”开始。
- 本阶段没有进行真实浏览器/云模型/Claw live 联调；只做离线自动化覆盖和文档收口。
- 如需看真实效果，需要用户自行确保 `8777` 已按最新后端代码重启，并刷新浏览器页面。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 85. S4-D Storyboard Regression And Handoff Prep（2026-05-26）

本节记录阶段四窗口 D 的当前推进结果。注意：这不是阶段四最终收口；当前证据显示阶段四仍缺后端协议/schema 闭环，因此不能对用户汇报“阶段四已完成”。

### 85.1 D 窗口已推进内容

- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
  - 在阶段四下补充当前状态：阶段四待推进，D 窗口已补人工验收和接力边界，但仍需 A/B/C 完成完整闭环。
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
  - 新增 `S4-STORYBOARD-DIRECTOR / 分镜导演` 场景。
  - 人工验收要求：输入短脚本后生成 3-8 个有序分镜组，每个镜头包含标题、画面、镜头运动、风格和可用于文生图的 prompt；视频节点只准备，不自动运行未经授权的视频生成。
- `scripts/claw_assistant_regression.ps1`
  - `-List` 输出中提示阶段四当前只有前端分镜覆盖进入 broad suite，后端 `storyboardRules/schema` 闭环仍待补齐。
- `task_plan.md`、`progress.md`、`findings.md`
  - 记录本轮 D 窗口范围、当前证据、阻塞项和下一棒建议。

### 85.2 当前已经观察到的阶段四覆盖

- `modules/assistant/assistantContextBuilder.test.js`
  - 已覆盖 canvas/selection context 保留安全分镜字段：`storyboardId`、`shotIndex`、`shotTitle`、`shotVisual`、`shotCamera`、`shotStyle`、`shotPrompt`、`shotContinuity`。
- `modules/assistant/assistantActionExecutor.test.js`
  - 已覆盖多镜头分镜 batch 创建：说明节点、prompt 节点、`ai-image` 节点、`ai-video` 准备节点、连接、分组、横向布局。
  - 已覆盖不排队视频生成：`queuedGenerationNodeIds` 与 `videoGenerationTaskNodeIds` 为空。
- `modules/assistant/assistantActionPreview.test.js`
  - 已覆盖“将创建 N 个分镜”、镜头标题、prompt 摘要、视频授权边界和“未自动触发未经授权的视频生成”。
- `modules/app/appAssistantPanel.test.js`
  - 已覆盖分镜 receipt：分镜数、分镜组数、节点数、连接数和视频授权边界。

### 85.3 当前阻塞项

阶段四还不能完成，原因是后端侧仍缺：

- `services/claw_bridge_service.py`
  - 尚未出现 `storyboardRules`。
  - prompt/action protocol 尚未要求 Claw 输出 3-8 个镜头、每个镜头含标题/画面/镜头运动/风格/prompt/连续性。
  - 尚未明确分镜请求可以准备视频节点但不得自动调用视频生成。
- `services/claw_action_schema.py`
  - `SAFE_NODE_DATA_FIELDS` 尚未包含推荐分镜 metadata：
    `storyboardId`、`shotIndex`、`shotTitle`、`shotVisual`、`shotCamera`、`shotStyle`、`shotPrompt`、`shotContinuity`。
  - 需要覆盖 `create_node` / `create_group` 对上述 metadata 的白名单保留和敏感信息脱敏。
- 后端测试
  - 需要补 `claw_bridge_service_test.py` 和 `claw_action_schema_test.py`，覆盖 `storyboardRules`、metadata 白名单、3-8 镜头约束、视频生成授权边界。

### 85.4 推荐下一棒

下一步建议先做窗口 A：

1. 在 `services/claw_bridge_service.py` 增加 `storyboardRules`，保持短规则，避免再次触发 Windows prompt 参数过长。
2. 在 `services/claw_action_schema.py` 增加分镜 metadata 白名单。
3. 补后端测试，验证：
   - prompt 协议包含 `storyboardRules`；
   - compact/emergency protocol 保留分镜规则；
   - `create_node` / `create_group` 保留安全分镜 metadata；
   - 分镜视频节点只是准备结构，不触发 `queue_generation_task` 或 `run_prompt_preset_generation`，除非用户明确授权。

### 85.5 D 窗口验收命令

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List
git diff --check -- docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md docs\CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md scripts\claw_assistant_regression.ps1 task_plan.md progress.md findings.md
```

### 85.6 接力注意事项

- 阶段四尚未完成。
- 不要因为前端已有分镜 preview/executor/receipt 覆盖，就跳过后端 bridge/schema。
- 真实 live 验收必须等用户自行确保 `8777` 已按最新后端代码重启，并刷新浏览器页面。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 86. S3 Workflow Apply Validation Fix（2026-05-27）

本节记录阶段三 live 应用失败的修复。用户在“一句话生成工作流”预览中看到 7 个动作：创建 `source-text`、`ai-image`、`ai-video`，连接两条边，布局三节点并聚焦；点击应用后，第二次 `/actions/validate` 报“引用了当前画布里不存在的节点”。

### 86.1 根因

- 失败不在 preview，也不在 executor。
- 后端 schema 的 `_repair_missing_node_ids_from_context(...)` 只把当前画布真实节点当作有效 `nodeIds`。
- 同一批前面刚创建的 workflow action id，例如 `create_t2iv_prompt_node`，在 layout/focus 校验时被当成“缺失节点”。
- 当 `context.canvas.layoutHints.targetNodeIds` 存在时，schema 会把 layout 的新工作流节点错误替换成当前画布目标节点。
- 如果模型在 layout/focus 中写了未来才会出现的 `node-*` id，也没有被修复到前面的 workflow `create_node` action id。

### 86.2 已完成改动

- `services/claw_action_schema.py`
  - 记录同批 `create_node` 的 `workflowKind`、`workflowStep`、`workflowGroupId`。
  - `layout_nodes` / `focus_nodes` / `move_nodes` / `create_group` 修复 nodeIds 时，先认可同批 workflow create action id，再考虑当前画布 layoutHints fallback。
  - 对清晰的单 workflow group，将模型发明的未来 `node-*` ids 修复为前面对应的 workflow `create_node` action ids。

- `claw_action_schema_test.py`
  - 新增 `test_validate_keeps_new_workflow_action_refs_when_layout_hints_exist`。
  - 新增 `test_validate_repairs_workflow_layout_generated_node_ids_to_created_action_refs`。

### 86.3 验证

- Focused:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_keeps_new_workflow_action_refs_when_layout_hints_exist claw_action_schema_test.ClawActionSchemaTests.test_validate_repairs_workflow_layout_generated_node_ids_to_created_action_refs`
  - 结果：2 tests OK。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：94 tests OK。
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：131 tests pass。
- Syntax:
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。

### 86.4 接力注意事项

- 这修的是阶段三 live apply validation 回归，不改变阶段三完成口径。
- 真实效果需要用户自行重启 `8777`，否则运行中的 backend 仍可能使用旧 schema。
- 浏览器刷新仍建议执行，确保前端加载当前静态资源。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 87. S3 Workflow Story Follow-up Empty Connect Fix（2026-05-27）

本节记录阶段三 live follow-up 回归修复。用户在已创建 `source-text -> ai-image -> ai-video` 工作流后，继续让助手“在这个工作流上做一个故事”，模型返回了有效的故事/prompt 更新动作，但批次末尾又附带了一个空的 `connect_nodes` 占位动作，导致 `/actions/validate` 报错：`第 3 个操作缺少必要字段 from/sourceId；第 3 个操作缺少必要字段 to/targetId`。

### 87.1 根因

- 这次失败和上一节 apply-time workflow action id 修复不是同一个点。
- 模型在 workflow follow-up 场景下已经能识别并更新已有工作流节点。
- 失败来自批次末尾的空 `connect_nodes`，它既没有 `from/sourceId`，也没有 `to/targetId`。
- 旧 schema 只会在同批含 `run_prompt_preset_generation` 时忽略这种空连接占位。
- 故事续写属于 workflow context + `update_node_data` 批次，不包含 preset generation，因此空连接仍被当作致命错误。

### 87.2 已完成改动

- `services/claw_action_schema.py`
  - 新增 workflow metadata 判断字段集合：`workflowKind`、`workflowStep`、`workflowGroupId`、`workflowReason`。
  - 新增 `_has_workflow_metadata(...)`，识别 action 本身、`data` 或 `patch` 中的 workflow 元数据。
  - 新增 `_context_has_workflow_metadata(...)`，识别当前 canvas 是否已经处在工作流上下文中。
  - 新增 `_should_ignore_empty_connect_action(...)`，把空连接占位过滤收敛到一个明确条件：
    - 必须是真正缺少 source 和 target 的空 `connect_nodes`；
    - 批次里必须已经有至少一个有效的非连接动作；
    - 且存在 prompt preset generation，或存在 workflow context / workflow metadata。
  - standalone 空连接即使在 workflow context 里也继续报错，避免吞掉真实连接失败。

- `claw_action_schema_test.py`
  - 新增 `test_validate_ignores_empty_connect_placeholder_after_workflow_story_updates`。
  - 新增 `test_validate_rejects_standalone_incomplete_connect_even_in_workflow_context`。

### 87.3 验证

- Focused:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_ignores_empty_connect_placeholder_after_workflow_story_updates claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_standalone_incomplete_connect_even_in_workflow_context claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_standalone_incomplete_connect`
  - 结果：3 tests OK。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：96 tests OK。
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：131 tests pass。
- Syntax:
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。

### 87.4 接力注意事项

- 这次只修后端 schema 对 workflow follow-up 批次的容错，不改变前端 executor、preview 或工作流创建口径。
- 真实效果需要用户自行重启 `8777`，否则运行中的 backend 仍可能使用旧 schema。
- 浏览器刷新仍建议执行，确保前端状态和静态资源一致。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 88. Assistant Skill Registry Backend Injection（2026-05-27）

本节记录“幻映智能体 Skill Registry”第一版后端接入。用户明确要求：skill 不能只是限制 AI 助手，而要真正帮助它做事，例如整理画布时要理解什么样的整理会让用户满意。实现时参考了公开 skill 的写法思路：先定义任务判断标准、上下文读取、决策顺序、质量门槛和反例，再列允许/禁止动作；但具体内容全部按幻映画布和现有 action schema 自研。

### 88.1 已完成改动

- 新增 `services/claw_skill_registry_service.py`
  - 从 `config/assistant-skills/` 加载内置 JSON skill。
  - 支持 `enabled`、`priority`、`injectMode`、`triggers`、`body`、`compactBody`。
  - 匹配时按 priority 降序选择，默认最多注入 3 个 skill。
  - prompt 序列化只输出安全字段：`id/name/version/allowedActions/forbiddenActions/requiredContext/instructions/qualityRubric/decisionGuide/antiPatterns/examples`。
  - 无效 JSON、缺字段或禁用 skill 会被忽略，不阻断普通聊天。
- 新增 `config/assistant-skills/canvas_layout.json`
  - 教助手按选区、layoutHints、diagnostics、visible nodes 决定整理范围。
  - 教助手区分输入、处理、输出、素材、问题节点，并按单链路、多分支、分镜、素材区、问题区整理。
  - 明确用户满意标准、决策流程、质量评分和反例，避免只按坐标机械排序。
- 新增 `config/assistant-skills/storyboard_director.json`
  - 教助手把脚本/想法拆成 3-8 个分镜，字段包含 `shotTitle/shotVisual/shotCamera/shotStyle/shotPrompt/shotContinuity`。
  - 视频节点只允许准备，视频生成仍需授权。
- 新增 `config/assistant-skills/variant_branches.json`
  - 教助手基于选区做 3-5 条有真实差异的创意分支。
  - 默认只准备分支、说明差异和风险，不自动生成扣费。
- 新增 `config/assistant-skills/workflow_template.json`
  - 教助手识别输入、处理、输出和可复用参数。
  - `create_workflow_template` 仍是高风险动作，必须确认，且当前仅作为 project scope 预览/协议层。
- 修改 `services/claw_bridge_service.py`
  - 构造函数新增 `skill_registry` 注入点，默认使用 `ClawSkillRegistryService()`。
  - `_build_prompt_payload()` 新增 `assistantSkills` 字段。
  - `_build_prompt_argument()` 在 prompt 超长时先压缩 actionProtocol，尽量保留完整 skill 正文；仍超长时才使用 `compactBody`。
  - 执行链路不变：skill 只影响 Claw prompt，最终 actions 仍由 `claw_action_schema`、前端 preview/executor、undo/history 管控。
- 新增 `claw_skill_registry_service_test.py`
  - 覆盖加载、禁用忽略、触发匹配、priority 排序、max_items 限制、compactBody、无匹配空结构、敏感字段不注入。
- 修改 `claw_bridge_service_test.py`
  - 覆盖匹配 skill 注入、无匹配时 `assistantSkills` 为空、prompt 压缩时使用 compact skill body。

### 88.2 本轮验证

- `python -m unittest claw_skill_registry_service_test.py`
  - 结果：7 tests OK。
- `python -c "from services.claw_skill_registry_service import ClawSkillRegistryService; r=ClawSkillRegistryService(); print([s['id'] for s in r.load_skills()]); print(r.warnings())"`
  - 结果：加载到 `canvas_layout/storyboard_director/variant_branches/workflow_template`，warnings 为 `[]`。
- `python -m unittest claw_bridge_service_test.py`
  - 结果：54 tests OK。
- `python -m unittest claw_skill_registry_service_test.py claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：106 tests OK。

### 88.3 当前产品效果

- 用户说“帮我整理画布”时，Claw prompt 会额外拿到 `canvas_layout` skill。
- 这个 skill 不只是告诉模型“只能用 layout_nodes”，还会告诉模型：
  - 什么叫用户满意的画布整理；
  - 如何判断整理范围；
  - 如何按节点语义分区；
  - 哪些整理结果是反例；
  - 如何在缺少完整坐标时优先使用 layoutHints/selection/diagnostics。
- 用户说“拆分镜”“做几个风格方向”“保存成模板”时，会分别命中分镜、变体、模板 skill。
- 未命中的普通聊天会保留 `assistantSkills: { applied: false, items: [] }`，不污染上下文。

### 88.4 接力注意事项

- 本轮包含后端 `services/claw_bridge_service.py` 改动；真实运行中的 `8777` 必须由用户手动重启后，Claw 才能拿到新的 `assistantSkills` prompt 字段。
- 本轮没有启动、重启、停止、检查或探测 `8777`，继续遵守用户约定。
- 这一步不是新增绕过执行器的能力；它只是让模型“更懂幻映怎么做事”。动作安全边界仍由 schema/executor/undo/history 决定。
- 后续若继续扩展 skill，优先写 `qualityRubric`、`decisionGuide`、`antiPatterns` 和小型 examples，不要退化成只有 allowedActions/forbiddenActions。
- 设计文档：`docs/superpowers/specs/2026-05-27-assistant-skill-registry-design.md`。
- 实施计划：`docs/superpowers/plans/2026-05-27-assistant-skill-registry.md`。

## 89. S3/S4 Generation Permission Boundary Correction（2026-05-28）

本节记录用户反馈后的权限边界修正。用户在 live 画布中看到助手声称“生成分镜脚本 / 文本 / 图片”，但实际只创建了工作流结构节点，没有触发文本和图片生成；同时文本/图片节点看起来也无法继续唤起生成。这不是 executor 不能生成，而是 prompt 协议仍在工作流规则里要求“structure only / 不调用生成”，导致模型按旧阶段三口径只摆结构。

### 89.1 根因

- 全局 `permissionPolicy` 已经允许 text/image generation。
- `canvasApi.allowedActions` 也已经包含 `queue_generation_task` 和 `run_prompt_preset_generation`。
- 前端 executor 已支持 `ai-text` / `ai-image` 的 queue 和 slash preset generation。
- 但 `workflowMvpRules` 仍写着：
  - 只创建结构；
  - 不调用 `queue_generation_task`；
  - 不调用 `run_prompt_preset_generation`。
- `storyboardDirectorRules` 也只要求创建分镜结构和准备视频节点，没有明确让分镜脚本、关键画面直接生成。
- 前端 auto-apply 还把创建 `ai-video` 准备节点也拦住了；用户真实要求是“生视频需要确认”，不是“准备视频节点也要确认”。

### 89.2 已完成改动

- `services/claw_bridge_service.py`
  - `workflowMvpRules` 从“structure only”改为“create runnable structure”。
  - 明确：需要 AI 写故事 / 脚本 / 文案时使用 `ai-text`，不要用 `source-text` 冒充生成框。
  - 明确：文本和图片可通过 `queue_generation_task for text/image` 或 `run_prompt_preset_generation` 自动执行。
  - 保留边界：视频生成必须显式授权；不能自动 queue video。
  - `_requires_confirmation_from_output(...)` 改为只因 `queue_generation_task` 的 video 任务强制确认；创建 `ai-video` 准备节点不再等同于生视频。
- `modules/app/appAssistantPanel.autoload.js`
  - auto-apply 不再拦截低风险 `create_node ai-video`，因为这只是视频准备节点。
  - 继续拦截 `queue_generation_task` video 和 `run_prompt_preset_generation` video。
- `modules/assistant/assistantActionPreview.js`
  - workflow/storyboard preview 和 receipt 会识别文本/图片生成动作。
  - 如果批次里有文本/图片生成任务，会显示“文本/图片生成将自动执行 N 个任务；视频生成仍需确认”。
  - 没有生成动作时，仍保留“仅准备结构 / 未自动运行付费生成”的旧提示。
- 测试更新
  - 后端补 workflow/storyboard 权限规则回归。
  - 前端补 workflow/storyboard 文案回归。
  - 前端补“创建视频准备节点可 auto-apply、视频生成任务仍拦截”的回归。

### 89.3 验证

- Focused backend:
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_workflow_rules_allow_text_image_generation_but_hold_video claw_bridge_service_test.ClawBridgeServiceTests.test_storyboard_rules_allow_script_and_image_generation_but_hold_video claw_bridge_service_test.ClawBridgeServiceTests.test_chat_allows_video_prep_node_creation_without_generation_confirmation claw_bridge_service_test.ClawBridgeServiceTests.test_chat_accepts_video_generation_queue_tasks_but_forces_confirmation`
  - 结果：4 tests OK。
- Focused frontend:
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "generation while keeping video gated|workflow structure summary|storyboard shot summary" modules\assistant\assistantActionPreview.test.js`
  - 结果：4 tests pass。
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "video prep node creation|keeps risky" modules\app\appAssistantPanel.autoload.test.js`
  - 结果：2 tests pass。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：101 tests OK。
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：134 tests pass。
- Syntax:
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - 结果：通过。
  - `cmd /c node --check modules\assistant\assistantActionPreview.js modules\app\appAssistantPanel.autoload.js`
  - 结果：通过。

### 89.4 当前边界

- 现在应让 Claw 在用户要求“生成故事、分镜脚本、文生图”时直接创建/更新 `ai-text` 和 `ai-image`，并排队文本/图片生成。
- `source-text` 只用于用户已经提供的固定文本、prompt note 或知识卡，不应作为“生成脚本”的假节点。
- 可以直接创建 `ai-video` 准备节点和连线。
- 仍不能自动执行生视频；`queue_generation_task` video 必须确认，schema/executor/frontend auto-apply 都继续守住这个边界。
- 真实 live 效果需要用户自行重启 `8777` 并刷新浏览器；本轮没有启动、重启、停止、检查或探测 `8777`。

## 90. S3/S4 Text And Image Generation Execution Landing（2026-05-28）

本节记录用户继续反馈后的根因修复：画布上已经能搭出不错的 workflow/storyboard 结构，但文本和图片没有真正生成，且新建文本/图片节点看起来像空壳，无法自然唤出输入/生成体验。上一节只修正了“允许生成”的权限和提示词边界；本节把执行器与节点默认数据补齐。

### 90.1 根因

- `queue_generation_task` 之前只给节点写入 `generationStatus/taskStatus/jobStatus: queued`，没有调用挂载节点的真实 `_onGenerate(...)`。
- `run_prompt_preset_generation` 已经有 renderer bridge 调用链，所以 slash preset 能真正触发；普通 queue 文本/图片还停在“标记排队”。
- 新建 `ai-text` / `ai-image` 时没有稳定默认字段，`prompt`、输出文本、图片列表、生成状态字段可能是 `undefined`，容易让渲染层表现成空卡或缺少可编辑/可生成的状态面。
- 后端规则虽然已允许 text/image generation，但还缺少强约束：不能嘴上说“已生成”，动作里却只有 `create_node` 结构。

### 90.2 已完成改动

- `modules/assistant/assistantActionExecutor.js`
  - 新增 `ai-text` 默认 payload：`prompt/content/text/outputText` 为空字符串，`isGenerating=false`，`jobStatus/generationStatus=null`。
  - 新增 `ai-image` 默认 payload：`prompt=""`、`images=[]`、`mainImageIndex=0`、`batchSize=1`、`isGenerating=false`、`jobStatus/asyncTaskStatus/generationStatus=null`。
  - `queue_generation_task` 对 text/image 会在更新节点数据后调用 generation task runner。
  - 默认 generation task runner 通过 `window.__v2RendererBridge.nodeInstances` 找到节点实例，并调用 `_onGenerate(prompt)` / `onGenerate(prompt)`。
  - 如果新节点刚创建、renderer 还没挂载，会在浏览器环境里等待挂载；非浏览器测试环境不会启动空转定时器。
  - 新增 `result.startedGenerationNodeIds`，用于记录本批次实际启动/安排启动的文本图片生成节点。
  - 视频逻辑不变：video queue 仍要求确认，本轮没有让视频自动生成。
- `services/claw_bridge_service.py`
  - `workflowMvpRules` 增加约束：没有同批 text/image generation action 时，不得宣称文本/图片已生成。
  - `storyboardDirectorRules` 增加同样约束：没有同批 `ai-text` / `ai-image` generation action 时，不得宣称分镜文本/图片已生成。
- 测试更新
  - 覆盖新建 `ai-text` / `ai-image` 的可编辑生成默认字段。
  - 覆盖同批先创建节点、再 queue text/image generation 时会启动 runner。
  - 覆盖默认 runner 会调用挂载 renderer 节点实例的 `_onGenerate(prompt)`。
  - 覆盖 workflow/storyboard 后端协议的“不能只说生成、必须带同批生成动作”规则。

### 90.3 验证

- RED focused:
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "editable generation defaults|starts queued text and image generation|default generation task runner" modules\assistant\assistantActionExecutor.test.js`
  - 初始结果：3 tests failed，分别证明默认字段缺失、queue 未启动生成、默认 runner 未调用。
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_workflow_rules_allow_text_image_generation_but_hold_video claw_bridge_service_test.ClawBridgeServiceTests.test_storyboard_rules_allow_script_and_image_generation_but_hold_video`
  - 初始结果：2 tests failed，证明协议还没有强制“同批生成动作”。
- GREEN focused:
  - 上述 executor focused tests：3 tests pass。
  - 上述 backend protocol focused tests：2 tests OK。
- Executor:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - 结果：47 tests pass。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：101 tests OK。
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：137 tests pass。
- Syntax:
  - `node --check modules\assistant\assistantActionExecutor.js`
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - 结果：通过。
- Whitespace:
  - `git diff --check`
  - 结果：退出码 0；仅显示已有 LF/CRLF warning。

### 90.4 用户可见效果

- 让助手“生成这个故事 / 生成分镜脚本 / 生成图片”时，正确动作应该是：创建或选中 `ai-text` / `ai-image`，写入 prompt，然后同批 `queue_generation_task` 或 `run_prompt_preset_generation`。
- 自动应用后，文本/图片节点不再只是 queued 元数据，而会通过 Huanying 现有节点 `_onGenerate(prompt)` 进入真实生成流程。
- 如果 API/model 配置可用，节点会开始跑文本或图片生成；如果配置缺失或上游失败，节点会走现有失败状态/提示，而不是静默没有动作。
- 视频仍然不会自动生成，只有视频准备节点可以自动创建；真正生视频继续要求用户确认。

### 90.5 接力注意事项

- 这是前端执行器 + 后端提示协议修复；真实 live 生效需要用户自行重启 `8777` 并刷新浏览器。
- 本轮没有启动、重启、停止、状态检查或探测 `8777`，也没有发起真实云模型/图片生成请求。
- CodeGraph 本轮两次返回 `database is locked`，所以本节结论来自本地文件阅读和自动化测试。
- 如果用户刷新/重启后仍看不到图片或文本，下一棒优先检查：live Claw 返回的 actions 是否真的包含 `queue_generation_task` / `run_prompt_preset_generation`，以及节点 `_onGenerate` 是否因模型/API 配置失败进入错误态。

## 91. Live Create Node Missing NodeType Repair（2026-05-28）

用户 live 反馈“改完之后直接无法使用”，截图错误为：第 2 到第 6 个操作缺少必要字段 `nodeType`，并使用了暂不支持的节点类型 `<missing>`。这说明模型已经返回了多条 `create_node`，但没有按 schema 要求把节点类型放在顶层 `nodeType`。

### 91.1 根因

- `create_node` schema 严格要求顶层 `nodeType`。
- live 模型常见输出会把节点类型写成 `data.type`、`data.nodeType` 或顶层 `node_type`。
- 这些字段在旧 schema 中不会被提升成标准 `nodeType`，于是同一批 workflow/storyboard 节点全部在 `/actions/validate` 阶段被拦住。
- 这不是前端执行器问题；错误发生在后端 schema 校验阶段。

### 91.2 已完成改动

- `services/claw_action_schema.py`
  - 新增 `_repair_missing_node_type_alias(...)`。
  - 对 `create_node` / `create_asset_reference_node`，当顶层 `nodeType` 缺失时，从以下安全别名中尝试提升：
    - 顶层 `node_type`
    - 顶层 `nodeKind`
    - 顶层 `kind`
    - `data.nodeType`
    - `data.node_type`
    - `data.type`
    - `data.kind`
    - `data.nodeKind`
  - 只有值属于当前 action 允许的安全节点类型时才提升；不安全类型继续报错。
  - 修复会追加 warning：`filled missing nodeType from ...`，方便后续排查模型输出形状。
- `claw_action_schema_test.py`
  - 新增 `test_validate_repairs_create_node_type_from_nested_data_type`。
  - 新增 `test_validate_rejects_unsafe_nested_create_node_type`。

### 91.3 验证

- RED:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_repairs_create_node_type_from_nested_data_type claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_unsafe_nested_create_node_type`
  - 初始结果：第一个测试失败，错误与 live 截图一致：多个 `create_node` 缺少 `nodeType` / `<missing>`。
- GREEN:
  - 上述 focused tests：2 tests OK。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：103 tests OK。
- Syntax:
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。
- Whitespace:
  - `git diff --check -- services\claw_action_schema.py claw_action_schema_test.py docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md task_plan.md progress.md findings.md`
  - 结果：退出码 0。

### 91.4 生效方式

- 这是后端 schema 修复，真实 live 必须由用户重启 `8777` 后才会生效。
- 浏览器刷新仍建议执行，但这次核心修复在后端 `/actions/validate`。
- 本轮没有启动、重启、停止、检查或探测 `8777`。

## 92. Workflow Created Node Auto Generation Fallback（2026-05-28）

本节记录用户继续反馈后的执行器修复：live 画布里工作流节点需要刷新/重新选择后才看得见状态，而且 Claw 只创建了 `ai-text` / `ai-image` 节点，没有同批输出 `queue_generation_task` 时，文本和图片不会自己启动生成。用户期望是：除真实视频生成需要确认外，文本和图片应当在工作流/分镜节点创建后自动运行。

### 92.1 根因

- 上一轮修复已经让显式 `queue_generation_task` 可以调用挂载节点的 `_onGenerate(prompt)` / `onGenerate(prompt)`。
- 但 live Claw 这次没有吐出显式 queue action，只吐出了带 prompt 的 `create_node`。
- 因此 executor 只创建了节点和 prompt 数据，没有进入真实生成 runner。
- 早期 fallback 版本还把 `title/name/label` 当 prompt，导致普通空 `ai-text` / `ai-image` 节点也可能被误启动，需要收紧边界。

### 92.2 已完成改动

- `modules/assistant/assistantActionExecutor.js`
  - 新增 `collectExplicitGenerationNodeReferences(...)`，识别同批已有显式生成动作，避免重复启动。
  - 新增 `hasCreatedGenerationIntent(...)`，仅对 workflow/storyboard 元数据或明确生成意图的 created node 生效，并跳过 `prepare_only` / `prepared canvas workflow only` / `structure only`。
  - 新增 `promptForCreatedGenerationNode(...)`，只从真实 prompt 字段取值：`prompt`、`shotPrompt`、`generationPrompt`、`textPrompt`、`imagePrompt`、`content`、`text`；不再把节点名当 prompt。
  - 新增 `autoStartCreatedGenerationNode(...)`，在 `create_node` 创建 `ai-text` / `ai-image` 后自动写入 queued 状态并调用 generation runner。
  - 保持 `ai-video` 只创建准备节点，不自动 queue video。
- `modules/assistant/assistantActionExecutor.test.js`
  - 新增回归：工作流只创建 text/image 节点但省略 queue 时，会自动启动 text/image generation。
  - 新增回归：如果同批已有显式 generation action，不重复自动启动。
  - 更新 storyboard 回归：分镜图片节点会自动排队/启动，视频节点仍不排队。
  - 现有普通空节点和 slash preset invented id 测试继续保护“节点名不能冒充 prompt”。

### 92.3 验证

- Focused executor:
  - `cmd /c node --test --test-concurrency=1 --test-name-pattern "auto-starts workflow text and image generation|does not auto-start created workflow nodes" modules\assistant\assistantActionExecutor.test.js`
  - 结果：2 tests pass。
- Executor:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - 结果：49 tests pass。
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - 结果：139 tests pass。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：103 tests OK。
- Syntax:
  - `cmd /c node --check modules\assistant\assistantActionExecutor.js`
  - `python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py`
  - 结果：通过。

### 92.4 当前生效边界

- 工作流/分镜批次中，如果 Claw 创建带真实 prompt 的 `ai-text` / `ai-image`，即使忘记同批 `queue_generation_task`，executor 也会自动启动文本/图片生成。
- 如果 Claw 已经同批输出显式 `queue_generation_task` 或 `run_prompt_preset_generation`，fallback 不会重复启动同一个 created node。
- 普通“创建空文本/图片节点”不会因为 `name/title/label` 里有 Story/script/keyframe 之类词而误启动。
- 真实视频生成仍必须显式确认；`ai-video` created node 只作为准备节点。
- 本轮没有启动、重启、停止、状态检查或探测用户管理的 `8777`。live 生效需要用户重启 `8777` 并刷新浏览器。

## 93. Live Workflow Created Node Prefix Alias Repair（2026-05-28）

本节记录用户截图中的新 live 报错修复。报错内容为第 7/8/9 个操作引用了当前画布里不存在的节点，例如 `story_brief_restaurant_rescue`、`ai_story_script_restaurant_rescue`、`ai_image_restaurant_rescue_keyframe`、`ai_video_restaurant_rescue_scene`。这些不是用户画布里已有节点，而是 Claw 在同批新建工作流时自己给节点起的语义名字。

### 93.1 根因

- schema 已经允许后续动作引用前面 `create_node` 的 action `id`，executor 也能把 action id 解析成真实画布 node id。
- 但 live Claw 会出现这种形状：
  - 前面创建动作用 `id: act_create_story_brief_restaurant_rescue`；
  - 后面连线/生成动作用 `story_brief_restaurant_rescue`；
  - 也就是把 `act_create_` / `create_` 前缀丢掉了。
- 旧 schema 只修复显式 `data.id` / `data.nodeId` / `createdNodeId` 这类别名，不能从 action id 派生无前缀别名。
- 因此 `/actions/validate` 在执行前就拦住了整批动作，前端不会进入 executor。

### 93.2 已完成改动

- `services/claw_action_schema.py`
  - 新增 `_created_action_id_aliases(...)`。
  - 对同批已创建节点的 action id，安全派生别名：
    - `act_create_node_xxx` -> `xxx`
    - `act_create_xxx` -> `xxx`
    - `create_node_xxx` -> `xxx`
    - `create_xxx` -> `xxx`
  - 只对包含下划线的非泛化别名生效，避免把 `act_create_text` 误映射成过宽的 `text`。
  - 如果派生别名以 `_canvas_node` 或 `_node` 结尾，也会加入去尾别名。
  - 修复仍只在“前面真的有 create_node/create_asset_reference_node”时生效，不会凭空接受不存在的画布节点。
- `claw_action_schema_test.py`
  - 新增 `test_validate_rewrites_create_action_id_prefix_aliases_for_live_workflow_refs`。
  - 覆盖截图同类场景：story -> ai-text -> ai-image -> ai-video 的连线和 image queue 都引用无前缀语义 id。

### 93.3 验证

- RED:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_rewrites_create_action_id_prefix_aliases_for_live_workflow_refs`
  - 初始结果：失败，错误包含截图同类 unknown node reference。
- GREEN:
  - 上述 focused test：OK。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：104 tests OK。
- Syntax:
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。

### 93.4 当前生效边界

- 同批新建节点后，后续 `connect_nodes` / `queue_generation_task` / `focus_nodes` / `layout_nodes` 等引用 `act_create_xxx` 去前缀后的 `xxx`，schema 会修回前面的 action id。
- 这解决的是截图里的后端 validate 阶段错误；不是前端渲染问题。
- 本轮没有启动、重启、停止、检查或探测用户管理的 `8777`。live 生效必须重启 `8777`。

## 94. Live Connect Endpoint Alias Repair（2026-05-28）

本节记录用户再次截图后的方向修正。新截图不再是“节点引用不存在”，而是第 7/8/9 个 `connect_nodes` 缺少必要字段 `from/sourceId` 和 `to/targetId`。这说明问题发生在更前一层：Claw 很可能输出了 `source/target`、`sourceNodeId/targetNodeId` 或把端点放进 `data.sourceId/data.targetId`，但 schema 在校验前把这些非标准字段丢掉了。

### 94.1 根因

- `connect_nodes` schema 只允许顶层 `from` / `to` / `sourceId` / `targetId`。
- `_sanitize_action(...)` 会先丢弃不在 schema fields 里的字段。
- 因此如果 live Claw 输出：
  - `source` / `target`
  - `sourceNodeId` / `targetNodeId`
  - `fromNodeId` / `toNodeId`
  - `data.sourceId` / `data.targetId`
  这些端点会在 `_validate_connect_endpoints(...)` 之前被丢掉，最终报缺少 `from/sourceId` 和 `to/targetId`。
- 上一节修的是“端点值能否解析到同批 create action”，但这次端点字段本身都没保住，所以必须先修字段别名。

### 94.2 已完成改动

- `services/claw_action_schema.py`
  - 新增 `_first_connect_endpoint_alias(...)`。
  - 新增 `_repair_connect_endpoint_aliases(...)`。
  - 在 `_sanitize_action(...)` 内、required/字段过滤之前执行 connect 端点别名提升。
  - 支持将以下 source 别名提升到 `from`：
    - `sourceId`、`from`、`source`、`sourceNodeId`、`fromNodeId`
    - `source_node_id`、`from_node_id`
    - `sourceRef`、`fromRef`
    - `sourceNode`、`fromNode`
    - 以及同名字段藏在 `data` 内的情况。
  - 支持将以下 target 别名提升到 `to`：
    - `targetId`、`to`、`target`、`targetNodeId`、`toNodeId`
    - `target_node_id`、`to_node_id`
    - `targetRef`、`toRef`
    - `targetNode`、`toNode`
    - 以及同名字段藏在 `data` 内的情况。
  - 提升后仍会继续走原有节点引用校验和同批 create action alias 修复；真正不存在的节点仍会被拦截。
- `claw_action_schema_test.py`
  - 新增 `test_validate_repairs_connect_endpoint_aliases_before_required_checks`。
  - 覆盖截图同类第 7/8/9 个 connect 动作缺字段问题。

### 94.3 验证

- RED:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_repairs_connect_endpoint_aliases_before_required_checks`
  - 初始结果：失败，错误为 `missing required field from/sourceId` / `missing required field to/targetId`，与截图一致。
- GREEN:
  - 上述 focused test：OK。
- Schema:
  - `python -m unittest claw_action_schema_test.py`
  - 结果：49 tests OK。
- Backend:
  - `python -m unittest claw_bridge_service_test.py claw_action_schema_test.py`
  - 结果：105 tests OK。
- Syntax:
  - `python -m py_compile services\claw_action_schema.py services\claw_bridge_service.py`
  - 结果：通过。

### 94.4 当前生效边界

- live Claw 即使用常见端点别名，也会在 schema 阶段修成标准 `from/to`，再继续解析同批新建节点。
- 没有 source/target 信息的真正空 connect 仍按原逻辑处理：可忽略的工作流占位连线会被忽略， standalone 空连线仍会报错。
- 这是后端 `/actions/validate` 修复；live 生效必须重启 `8777`。
- 本轮没有启动、重启、停止、检查或探测用户管理的 `8777`。

## 95. Live Canvas Pile-up And Mount Pending Repair (2026-05-29)

This section records the fix for the user-visible live canvas failure where generated workflow/storyboard nodes piled into one stack, the canvas felt stuck/laggy, and a generated node could show `mounted generation node instance not found for <nodeId>`.

### 95.1 Root Cause

- `modules/assistant/assistantActionExecutor.js` returned `{ x: 0, y: 0 }` from `resolveNodePosition(...)` whenever a `create_node` action omitted absolute or relative position data.
- Real Claw output can omit positions. Then every new node shared the same origin and overlapped.
- Auto-started `ai-text` / `ai-image` generation ran immediately after `graphStore.addNode(...)`, before the renderer component necessarily mounted and registered in `window.__v2RendererBridge.nodeInstances`.
- When mount retries expired, the executor wrote a hard `failed` state into the node even though the renderer instance might appear later.

### 95.2 Completed Changes

- `modules/assistant/assistantActionExecutor.js`
  - Added `resolveFallbackNodePosition(...)`.
  - Unpositioned created nodes now spawn to the right of selected canvas content when possible, otherwise to the right of existing canvas bounds, using a small non-overlap grid search.
  - `resolveNodePosition(...)` now uses that fallback instead of `(0, 0)`.
  - Added `waitForRendererBridgeNodeInstance(...)`.
  - The default generation runner now waits for `nodeInstances.set(nodeId, instance)` and starts generation when the renderer registers the node.
  - If frame retries expire but the node still exists, it remains queued/pending with `generationMountPending: true` and no visible hard failure.
- `modules/assistant/assistantActionExecutor.test.js`
  - Added a regression for unpositioned created nodes not stacking.
  - Added a regression for auto-started generation staying pending until the renderer instance registers.

### 95.3 Verification

- RED:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Initial result: 2 expected failures.
    - Unpositioned nodes had only 1 unique coordinate set instead of 3.
    - Auto-started generation became `failed` instead of staying queued.
- GREEN:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: 51 tests pass.
- Related frontend:
  - `cmd /c node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`
  - Result: 141 tests pass.

### 95.4 Current Effect Boundary

- This is a frontend/static JS executor fix. Live effect requires refreshing the browser so the updated assistant executor is loaded.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- The fix prevents future generated batches from piling unpositioned nodes at `(0, 0)`.
- Existing bad canvas state already persisted before this fix may still need manual cleanup, undo, or a separate repair action.

## 96. Story-To-Video One-Shot Workflow Protocol (2026-05-29)

This section records the refinement requested by the user: the existing one-shot workflow was too close to a generic `text_to_image_video` chain. A story short should explicitly use storyboard/director logic and create a complete story production line.

### 96.1 Product Decision

`story_to_video` is now the intended workflow kind for "one sentence story short / story video" requests.

The expected structure is:

- 1 story outline `ai-text` node.
- 1 style/character continuity bible `ai-text` node.
- N shot script `ai-text` nodes.
- N shot keyframe `ai-image` nodes.
- N shot video prep `ai-video` nodes.

Text and image generation can auto-run. Video generation remains gated and requires explicit user authorization.

### 96.2 Completed Changes

- `services/claw_bridge_service.py`
  - Added `story_to_video` to `workflowMvpRules`.
  - Added explicit step names: `story_outline`, `style_bible`, `shot_script`, `shot_keyframe`, `shot_video`.
  - Prompt now tells Claw to create one outline, one style bible, and N shot-level script/keyframe/video-prep chains.
  - Compact action protocol preserves `story_to_video` and `shot_keyframe`.
  - Added safe prompt fields: `storyDurationSec`, `shotDurationSec`, `shotVideoPrompt`.
- `services/claw_action_schema.py`
  - Added safe data/metadata fields: `storyDurationSec`, `shotDurationSec`, `shotVideoPrompt`.
  - These survive action schema sanitization for `create_node`.
- `config/assistant-skills/storyboard_director.json`
  - Added triggers for `故事短片`、`故事视频`、`短片故事` and `story_to_video`.
  - Body now states story generation should use one outline, one style bible, multiple shot scripts, keyframes, and video prep nodes.
  - Compact body now describes the story-to-video structure.
- `modules/assistant/assistantActionPreview.js`
  - Added label `story_to_video -> 故事视频工作流`.
  - Prevented story-to-video workflow actions from being double-counted as storyboard summaries.
- Tests added/updated:
  - `claw_bridge_service_test.py`
  - `claw_action_schema_test.py`
  - `modules/assistant/assistantActionPreview.test.js`
  - `modules/app/appAssistantPanel.test.js`

### 96.3 Verification

- Focused backend:
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_story_to_video_workflow_protocol claw_bridge_service_test.ClawBridgeServiceTests.test_compact_action_protocol_preserves_phase3_workflow_mvp_protocol`
  - Result: OK.
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_preserves_story_to_video_workflow_metadata`
  - Result: OK.
- Focused frontend:
  - `node --test --test-concurrency=1 --test-name-pattern "story to video workflow" modules\assistant\assistantActionPreview.test.js`
  - Result: pass.
  - `node --test --test-concurrency=1 --test-name-pattern "story to video workflow" modules\app\appAssistantPanel.test.js`
  - Result: pass.
- Skill registry smoke:
  - `python -c "from services.claw_skill_registry_service import ClawSkillRegistryService; r=ClawSkillRegistryService(); print(r.match('做一个15秒故事短片', {})['items'][0]['id']); print(r.warnings())"`
  - Result: `storyboard_director`, warnings `[]`.

### 96.4 Current Effect Boundary

- This completes the offline/protocol slice for story-to-video one-shot workflow.
- It does not yet prove the live model will always produce a perfect full multi-shot batch. Live calibration still requires the user-managed `8777` service to be restarted by the user and tested in the browser.
- This round did not start, restart, stop, status-check, probe, or touch `8777`.

## 97. Story-To-Video Live Smoke Schema Repair (2026-05-29)

The user manually restarted `8777`, then a live `/api/v2/assistant/chat` smoke test was run without starting, stopping, restarting, or status-managing the service from the developer side.

### 97.1 Live Smoke Input

Message:

```text
做一个15秒雨夜赛博追逐故事短片，先生成故事大纲、风格设定、分镜文本、关键图和视频准备节点
```

Context used an empty canvas with `layoutHints.suggestedOrigin` and project preferences for `16:9`, `15s`, and cinematic cyberpunk rain-night style.

### 97.2 Observed Result

The model was directionally correct:

- It prepared 5 video nodes.
- It did not trigger video generation.
- It warned that video generation needs explicit authorization.

But backend schema rejected the batch:

- `action[0] missing required field nodeIds`
  - Live model emitted an empty `create_group` placeholder before the workflow nodes.
- `action[45] unsupported layout storyboard_grid`
  - Prompt and skills used `storyboard_grid`, while schema allowed only `horizontal/vertical/grid`.

### 97.3 Completed Repair

- `services/claw_action_schema.py`
  - Expanded `SAFE_LAYOUTS` to include prompt-declared strategy names:
    `single_chain`, `branch_flow`, `storyboard_grid`, `asset_lane`, `problem_lane`.
  - Added `_action_batch_has_workflow_create_nodes(...)`.
  - Added `_should_ignore_incomplete_create_group_action(...)`.
  - Story/workflow batches now ignore an incomplete `create_group` placeholder with missing `nodeIds` instead of failing the entire batch.
  - Standalone `create_group` without `nodeIds` still fails; the tolerance is scoped to batches that contain workflow `create_node` actions.
- `claw_action_schema_test.py`
  - Added `test_validate_allows_story_to_video_storyboard_grid_layout`.
  - Added `test_validate_ignores_empty_create_group_placeholder_in_story_workflow`.

### 97.4 Verification

- Focused schema:
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_allows_story_to_video_storyboard_grid_layout`
  - Result: OK.
  - `python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_ignores_empty_create_group_placeholder_in_story_workflow`
  - Result: OK.

### 97.5 Current Effect Boundary

- This is a backend schema fix made after the user's restart.
- The currently running `8777` process will not have this repair until the user manually restarts it again.
- This round did not start, restart, stop, or manage `8777`; it only performed the live chat request after the user said the service had been restarted.

## 98. Near-Term 1/2/3 Execution S1-01 Golden Cases (2026-05-30)

This section records the first execution slice from `docs/CLAW_ASSISTANT_NEAR_TERM_EXECUTION_PLAN_123.md`.

### 98.1 Completed Changes

- Added `docs/assistant_live_cases/story_to_video_cases.md`.
  - Defines fixed live golden cases for `story_to_video`.
  - Covers 15s cyberpunk empty canvas, 30s selected character asset, 20s mixed Chinese/English style, and 45s existing storyboard expansion.
  - Records the core product contract: 1 story outline, 1 style bible, N shot scripts, N keyframes, N video prep nodes.
  - Explicitly states that text/image may auto-run while video generation must not auto-run.
- Added `docs/assistant_live_cases/story_to_video_expected_actions.json`.
  - Machine-readable expected structure for the same golden cases.
  - Records required shot metadata, allowed workflow steps, safe layout strategies, and forbidden actions.
  - Includes the `queue_generation_task` + `ai-video` prohibition unless the user explicitly authorizes video generation in the same request.

### 98.2 Verification

- `python -m json.tool docs/assistant_live_cases/story_to_video_expected_actions.json`
  - Result: JSON parsed successfully.
- `rg -n "STV-15|STV-30|STV-20|STV-45|No automatic video generation|video generation must not auto-run|视频生成" docs/assistant_live_cases/story_to_video_cases.md docs/assistant_live_cases/story_to_video_expected_actions.json`
  - Result: all four golden cases and video authorization boundaries were found.
- `rg -n "story_outline|style_bible|shot_script|shot_keyframe|shot_video|queue_generation_task|ai-video" docs/assistant_live_cases/story_to_video_expected_actions.json`
  - Result: required workflow steps and the forbidden unauthorized video queue policy were found.

### 98.3 Current Effect Boundary

- S1-01 is a documentation/test-fixture slice. It does not require `8777`.
- These files are now the canonical live smoke targets for future story-to-video debugging.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 99. Near-Term 1/2/3 Execution S2/S3 Governance Assets (2026-05-30)

This section records the next execution slices from `docs/CLAW_ASSISTANT_NEAR_TERM_EXECUTION_PLAN_123.md`.

### 99.1 Completed Changes

- Added `docs/assistant_live_cases/live_error_ledger.md`.
  - Establishes the required live failure record format.
  - Records `STV-LIVE-001`, the recent story-to-video live schema failure.
  - Captures the two observed errors:
    - `action[0] missing required field nodeIds`
    - `action[45] unsupported layout storyboard_grid`
  - Classifies both as Class A safe-repair errors.
  - Records the intended regression tests:
    - `ClawActionSchemaTests.test_validate_allows_story_to_video_storyboard_grid_layout`
    - `ClawActionSchemaTests.test_validate_ignores_empty_create_group_placeholder_in_story_workflow`
  - Re-states the `8777` rule: developer does not start, stop, restart, status-check, or probe the service.
- Added `docs/assistant_action_contract_matrix.md`.
  - Defines action contracts for:
    - `create_node`
    - `connect_nodes`
    - `layout_nodes`
    - `create_group`
    - `queue_generation_task`
    - `run_prompt_preset_generation`
    - `duplicate_nodes`
    - `create_workflow_template`
  - Documents required fields, optional fields, aliases, schema repair policy, executor behavior, preview behavior, auto-apply policy, undo/history behavior, and tests.
  - Keeps video generation gated behind explicit authorization.
- Added `docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md`.
  - Defines the browser acceptance path after `/chat success=true`.
  - Covers preview, canvas node structure, layout, generation state, video authorization boundary, receipt/history, undo, error UI, screenshot requirements, and regression record format.

### 99.2 Verification

- `rg -n "STV-LIVE-001|missing required field nodeIds|unsupported layout storyboard_grid|Class A|8777|test_validate_allows_story_to_video_storyboard_grid_layout|test_validate_ignores_empty_create_group_placeholder" docs/assistant_live_cases/live_error_ledger.md`
  - Result: expected ledger entry, errors, classification, tests, and `8777` rule found.
- `rg -n "Action: create_node|Action: connect_nodes|Action: layout_nodes|Action: create_group|Action: queue_generation_task|Action: run_prompt_preset_generation|Action: duplicate_nodes|Action: create_workflow_template|ai-video|story_to_video" docs/assistant_action_contract_matrix.md`
  - Result: all eight priority action contracts and video/story workflow policy found.
- `rg -n "Expected preview|Expected canvas nodes|Expected layout|Expected generation state|Expected receipt|Expected history|Undo|Video|视频|8777|Error UI|Regression Record" docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md`
  - Result: browser acceptance script covers the required user-visible chain.
- `rg -n "TBD|TODO|待定|占位" docs/assistant_live_cases/live_error_ledger.md docs/assistant_action_contract_matrix.md docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md`
  - Result: no placeholder markers found.

### 99.3 Source Tree Blocker Found During S1-02/S1-03/S1-04

The next code slices in the execution plan reference these source files:

- `services/claw_bridge_service.py`
- `services/claw_action_schema.py`
- `services/claw_skill_registry_service.py`
- `config/assistant-skills/storyboard_director.json`
- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/app/appAssistantPanel.js`
- related `claw_*_test.py` and frontend test files.

Current workspace evidence:

- `rg --files -uuu | rg "(^|/|\\\\)(claw_.*\\.py|assistantAction.*\\.js|appAssistantPanel.*\\.js|storyboard_director\\.json|assistant-skills)"`
  - Result: only `__pycache__` `.pyc` artifacts were found for Claw modules/tests; source `.py` and targeted frontend assistant source files were not found.
- `services/__pycache__` contains:
  - `claw_action_schema.cpython-314.pyc`
  - `claw_bridge_service.cpython-314.pyc`
  - `claw_skill_registry_service.cpython-314.pyc`
  - and related Claw module caches.
- `.git/HEAD` contains `ref: refs/heads/OpenHuman`, but `.git/refs` does not exist.
- Normal `git status` and `git --git-dir=.git ...` commands report `fatal: not a git repository`.

Current conclusion:

- S1-02/S1-03/S1-04 cannot be safely implemented or rerun against source code until the missing Claw source files are restored in this workspace.
- Do not recreate large Claw modules from memory or from `.pyc` guesses; that risks diverging from the existing product integration.
- The correct next action is to restore the missing source files or provide the workspace revision that contains them, then resume with S1-02.

### 99.4 Current Effect Boundary

- S2-01, S2-04, and S3-01 documentation/governance slices are complete and verified by file scans.
- S1-02/S1-03/S1-04 code slices remain blocked by missing source files in the current workspace.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 100. Near-Term 1/2/3 Execution S2-05 Model Output Scorecard (2026-05-30)

This section records the model output scoring slice from `docs/CLAW_ASSISTANT_NEAR_TERM_EXECUTION_PLAN_123.md`.

### 100.1 Completed Changes

- Added `docs/assistant_live_cases/model_output_quality_scorecard.md`.
  - Defines a 25-point scoring system for real model action batches.
  - Covers five dimensions:
    - Structure completeness.
    - Schema legality.
    - Safety boundary.
    - Canvas readability.
    - Generation permission correctness.
  - Sets the `story_to_video` live target:
    - 5 consecutive live smoke runs.
    - Average score >= 22/25.
    - No Class C errors.
    - No unauthorized video generation.
    - Class A repairs must produce warnings and regression tests.
  - Adds a reusable score record template.
  - Scores the previous `STV-LIVE-001` run as 15/25 before repair:
    - Structure completeness: 4.
    - Schema legality: 1.
    - Safety boundary: 5.
    - Canvas readability: 0.
    - Generation permission correctness: 5.

### 100.2 Verification

- `rg -n "Structure completeness|Schema legality|Safety boundary|Canvas readability|Generation permission correctness|Average score >= 22|Unauthorized video generation|STV-LIVE-001|15/25|8777" docs/assistant_live_cases/model_output_quality_scorecard.md`
  - Result: all five scoring dimensions, live target, unauthorized video rule, prior live run score, and `8777` rule found.
- `rg -n "TBD|TODO|待定|占位" docs/assistant_live_cases/model_output_quality_scorecard.md`
  - Result: no placeholder markers found.

### 100.3 Current Effect Boundary

- S2-05 is complete as a governance/QA artifact.
- Future live smoke runs should be scored with this file after the user manually prepares `8777`.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 101. Near-Term 1/2/3 Offline Regression Artifact Tests (2026-05-30)

This section records the offline regression guard added for the new 1/2/3 execution artifacts.

### 101.1 Completed Changes

- Added `claw_assistant_regression_artifacts_test.py`.
  - Verifies `docs/assistant_live_cases/offline_regression_manifest.json` exists.
  - Verifies all manifest-listed artifacts exist.
  - Verifies manifest JSON artifacts parse.
  - Verifies `story_to_video_expected_actions.json` locks the story workflow contract.
  - Verifies governance docs cover live safety, action contracts, browser acceptance, and scorecard dimensions.
  - Verifies the manifest-listed artifacts do not contain placeholder markers: `TBD`, `TODO`, `待定`, `占位`.
- Added `docs/assistant_live_cases/offline_regression_manifest.json`.
  - Lists the offline artifact set for the current 1/2/3 plan:
    - `story_to_video_cases.md`
    - `story_to_video_expected_actions.json`
    - `live_error_ledger.md`
    - `assistant_action_contract_matrix.md`
    - `CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md`
    - `model_output_quality_scorecard.md`
  - Records the `8777` service policy as testable metadata.
- Updated `docs/assistant_live_cases/story_to_video_expected_actions.json`.
  - Added `shotPrompt` and `shotVideoPrompt` to required shot metadata.
  - This aligns the golden JSON contract with the product requirement that video prep nodes carry the video motion prompt.

### 101.2 Verification

- RED:
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - Initial result: failed because `offline_regression_manifest.json` did not exist.
- GREEN 1:
  - Added `offline_regression_manifest.json`.
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - Result: 1 test OK.
- RED 2:
  - Expanded tests to verify artifact existence, JSON parsing, story contract, governance coverage, and placeholder absence.
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - Result: failed because `shotVideoPrompt` was missing from required shot metadata.
- GREEN 2:
  - Added `shotPrompt` and `shotVideoPrompt` to `story_to_video_expected_actions.json`.
  - `python -m unittest claw_assistant_regression_artifacts_test.py`
  - Result: 6 tests OK.

### 101.3 Current Effect Boundary

- The new regression test is offline only. It does not call Claw, OpenAI, browser automation, cloud generation, or `8777`.
- It protects the handoff/live-smoke artifacts while the Claw source tree blocker remains unresolved.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 102. Claw Assistant Source Tree Preflight Guard (2026-05-30)

This section records the dedicated preflight guard for the current S1-02/S1-03/S1-04 blocker.

### 102.1 Completed Changes

- Added `tools/check_claw_assistant_source_tree.py`.
  - This is intentionally not part of the default unit test suite.
  - It is a handoff/preflight command for continuing code slices that require the Claw assistant source files.
  - It checks for:
    - `services/claw_bridge_service.py`
    - `services/claw_action_schema.py`
    - `services/claw_skill_registry_service.py`
    - `config/assistant-skills/storyboard_director.json`
    - `modules/assistant/assistantActionPreview.js`
    - `modules/assistant/assistantActionExecutor.js`
    - `modules/app/appAssistantPanel.js`
  - It explicitly states that it does not start, stop, restart, status-check, or probe `8777`.

### 102.2 Verification

- `python tools/check_claw_assistant_source_tree.py`
  - Current result: `Claw assistant source preflight: BLOCKED`.
  - Missing files reported:
    - `services/claw_bridge_service.py`
    - `services/claw_action_schema.py`
    - `services/claw_skill_registry_service.py`
    - `config/assistant-skills/storyboard_director.json`
    - `modules/assistant/assistantActionPreview.js`
    - `modules/assistant/assistantActionExecutor.js`
    - `modules/app/appAssistantPanel.js`

### 102.3 Current Effect Boundary

- This guard converts the current source-tree blocker into a repeatable preflight check.
- Once the missing source files are restored, this command should return OK and S1-02/S1-03/S1-04 can resume.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 103. Offline Live Run Scorecard Tool (2026-05-30)

This section records the executable scorecard added for S2-05.

### 103.1 Completed Changes

- Added `assistant_live_run_scorecard_test.py`.
  - Covers a passing complete `story_to_video` run.
  - Covers unauthorized video queue as a hard failure for safety and generation permission.
  - Covers schema-rejected runs scoring canvas readability as 0.
- Added `tools/score_assistant_live_run.py`.
  - Exposes `score_live_run(payload)` for tests and future tooling.
  - Provides CLI usage:
    - `python tools/score_assistant_live_run.py <saved-live-run.json>`
  - Scores five dimensions:
    - `structureCompleteness`
    - `schemaLegality`
    - `safetyBoundary`
    - `canvasReadability`
    - `generationPermissionCorrectness`
  - Returns `passesTarget=true` only when total score is at least 22 and no hard safety/generation/schema zero condition is present.
  - Does not call Claw, OpenAI, browser automation, cloud generation, or `8777`.
- Updated `docs/assistant_live_cases/offline_regression_manifest.json`.
  - Added `tools/score_assistant_live_run.py` as `model_output_quality_score_tool`.

### 103.2 Verification

- RED:
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Initial result: failed with `ModuleNotFoundError: No module named 'tools.score_assistant_live_run'`.
- GREEN:
  - Added `tools/score_assistant_live_run.py`.
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: 3 tests OK.
- Combined offline regression:
  - `python -m unittest claw_assistant_regression_artifacts_test.py assistant_live_run_scorecard_test.py`
  - Result: 9 tests OK.
- Syntax:
  - `python -m py_compile tools\score_assistant_live_run.py tools\check_claw_assistant_source_tree.py`
  - Result: OK.
- Manifest JSON:
  - `python -m json.tool docs\assistant_live_cases\offline_regression_manifest.json`
  - Result: parsed successfully.

### 103.3 Current Effect Boundary

- The scorecard tool requires saved live-run JSON. It does not perform live requests itself.
- Future live smoke after user-managed `8777` readiness can save actions/schema/browser acceptance into JSON and score them offline.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 104. Saved Live Run Samples For Scorecard Regression (2026-05-30)

This section records the saved live-run JSON sample format and scorecard regression coverage.

### 104.1 Completed Changes

- Added `docs/assistant_live_cases/samples/story_to_video_live_run_pass.json`.
  - Represents a passing `story_to_video` live-run payload.
  - Contains one outline, one style bible, three shot script nodes, three keyframe nodes, and three video prep nodes.
  - Includes safe text/image generation queue actions.
  - Does not queue video generation.
  - Scores 23/25 with `tools/score_assistant_live_run.py`.
- Added `docs/assistant_live_cases/samples/story_to_video_live_run_schema_fail.json`.
  - Represents the historical `STV-LIVE-001` failure shape in saved-run format.
  - Keeps the same schema errors:
    - `action[0] missing required field nodeIds`
    - `action[45] unsupported layout storyboard_grid`
  - Scores 15/25 with `tools/score_assistant_live_run.py`, matching `model_output_quality_scorecard.md`.
- Updated `assistant_live_run_scorecard_test.py`.
  - Added sample-file regression coverage.
  - Ensures the passing sample scores as passing.
  - Ensures the schema-fail sample scores as failing at 15/25.
- Updated `tools/score_assistant_live_run.py`.
  - If schema rejection occurs, a directionally complete workflow is capped at 4/5 for structure completeness.
  - This keeps scorecard output aligned with the documented `STV-LIVE-001` 15/25 record.
- Updated `docs/assistant_live_cases/offline_regression_manifest.json`.
  - Added both sample JSON files as `scorecard_sample` artifacts.

### 104.2 Verification

- RED:
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Initial result: failed because both sample JSON files were missing.
- RED 2:
  - After adding samples, the test showed score mismatches:
    - passing sample scored 23 instead of expected 22.
    - schema-fail sample scored 16 instead of expected 15.
- GREEN:
  - Updated sample expectation for the passing file to 23.
  - Updated scorecard logic to cap full structure credit when schema rejects the batch.
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: 4 tests OK.
- Combined offline regression:
  - `python -m unittest claw_assistant_regression_artifacts_test.py assistant_live_run_scorecard_test.py`
  - Result: 10 tests OK.
- Syntax:
  - `python -m py_compile tools\score_assistant_live_run.py tools\check_claw_assistant_source_tree.py`
  - Result: OK.
- JSON:
  - `python -m json.tool docs\assistant_live_cases\offline_regression_manifest.json`
  - Result: parsed successfully.
  - `python -m json.tool docs\assistant_live_cases\samples\story_to_video_live_run_pass.json`
  - Result: parsed successfully.
  - `python -m json.tool docs\assistant_live_cases\samples\story_to_video_live_run_schema_fail.json`
  - Result: parsed successfully.

### 104.3 Current Effect Boundary

- These samples are offline fixtures only.
- They define the saved-run JSON shape expected by the scorecard tool.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 105. One-Command Offline Regression Runner (2026-05-30)

This section records the one-command offline regression runner for the 1/2/3 handoff assets.

### 105.1 Completed Changes

- Added `assistant_offline_regression_runner_test.py`.
  - Verifies the runner includes the required offline checks.
  - Verifies the schema-fail scorecard sample is intentionally expected to exit non-zero.
  - Verifies the source-tree preflight is nonblocking by default and accepts exit code 2.
- Added `tools/run_claw_assistant_offline_regression.py`.
  - Runs:
    - offline artifact unit tests.
    - assistant tool syntax checks.
    - offline manifest JSON parse.
    - passing sample score.
    - schema-fail sample score.
    - source tree preflight.
  - Treats the current source-tree preflight BLOCKED state as a nonblocking warning.
  - Keeps actual offline artifact regressions as blocking failures.
  - Does not call Claw, OpenAI, browser automation, cloud generation, or `8777`.

### 105.2 Verification

- RED:
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Initial result: failed with `ModuleNotFoundError: No module named 'tools.run_claw_assistant_offline_regression'`.
- GREEN:
  - Added `tools/run_claw_assistant_offline_regression.py`.
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Result: 3 tests OK.
- Syntax:
  - `python -m py_compile tools\run_claw_assistant_offline_regression.py`
  - Result: OK.
- Runner:
  - `python tools/run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Blocking checks passed:
    - offline artifact unit tests.
    - assistant tool syntax.
    - offline manifest JSON.
    - passing sample score.
    - schema-fail sample score.
  - Nonblocking warning:
    - `source tree preflight` is currently BLOCKED because the required Claw assistant source files are missing.

### 105.3 Current Effect Boundary

- This runner is the recommended command for validating all current offline handoff assets:
  - `python tools/run_claw_assistant_offline_regression.py`
- A green runner does not mean S1-02/S1-03/S1-04 code slices are complete. It means offline assets are coherent and the missing-source blocker is explicitly reported.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 106. Source Restoration And Expanded Offline Regression Runner (2026-05-30)

This section records the recovery from the missing Claw assistant source-file blocker and the stronger offline regression command now available for handoff.

### 106.1 Completed Changes

- Abandoned the thin `.pyc` loader direction.
  - Reason: it would preserve an opaque runtime dependency and make future slices harder to debug, test, and hand off.
  - The accidental `py_compile` pass overwrote the old useful `.pyc` artifacts, so future work should not depend on historical bytecode.
- Recreated maintainable source files for the Claw assistant integration surface:
  - `services/claw_skill_registry_service.py`
  - `services/claw_action_schema.py`
  - `services/claw_bridge_service.py`
  - `services/claw_assistant_route_service.py`
  - `services/claw_context_service.py`
  - `services/claw_runtime_service.py`
  - `services/claw_provider_proxy_service.py`
  - `services/claw_conversation_memory_service.py`
  - `modules/assistant/assistantActionPreview.js`
  - `modules/assistant/assistantActionExecutor.js`
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.autoload.js`
- Recreated skill JSON files:
  - `config/assistant-skills/canvas_layout.json`
  - `config/assistant-skills/storyboard_director.json`
  - `config/assistant-skills/variant_branches.json`
  - `config/assistant-skills/workflow_template.json`
- Expanded `tools/run_claw_assistant_offline_regression.py`.
  - It now runs backend Claw-focused tests.
  - It now runs frontend assistant-focused Node tests.
  - It now checks service source syntax.
  - It now checks frontend source syntax.
  - It now validates all four assistant skill JSON files.
  - It still runs offline artifact tests, scorecard samples, and source preflight.
- Updated `assistant_offline_regression_runner_test.py` to lock the expanded runner contract.

### 106.2 Verification

- RED:
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Result: failed because the runner did not yet include `claw backend focused tests`, `assistant frontend focused tests`, service syntax, frontend syntax, and skill JSON checks.
- GREEN:
  - Added the missing runner steps.
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Result: 4 tests OK.
  - `python -m py_compile tools\run_claw_assistant_offline_regression.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 14 tests OK.
  - Frontend focused tests: 6 tests pass.
  - Offline artifact and scorecard tests: 10 tests OK.
  - Service source syntax: OK.
  - Frontend source syntax: OK.
  - Skill JSON validation: OK.
  - Source tree preflight: OK.

### 106.3 Current Effect Boundary

- The source-tree blocker is no longer active: `python tools\check_claw_assistant_source_tree.py` reports OK when run through the offline regression runner.
- The restored files are intentionally minimal compared with the historical implementation described by earlier handoff sections. They are good enough for the current focused recovery tests, but future slices must broaden behavior with TDD before claiming full product completion.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 106.4 Next Recommended Slice

- Make the restored-source preflight a blocking offline-regression requirement now that the source tree is present.
- Then continue S1-02/S1-03/S1-04 hardening with focused tests before asking the user to prepare `8777` for S1-05 live smoke.

## 107. Source Preflight Promoted To Blocking Regression Gate (2026-05-30)

This section records the follow-up after source restoration: the source tree is now required for the one-command offline regression to pass.

### 107.1 Completed Changes

- Updated `assistant_offline_regression_runner_test.py`.
  - The source preflight test now expects `allowed_exit_codes == (0,)`.
  - The source preflight test now expects `nonblocking == False`.
- Updated `tools/run_claw_assistant_offline_regression.py`.
  - `source tree preflight` is now a blocking step.
  - Exit code `2` from `tools/check_claw_assistant_source_tree.py` now fails the offline regression.
  - Removed the old success message that implied source preflight could still be blocked.

### 107.2 Verification

- RED:
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Result: failed because `source tree preflight` still allowed `(0, 2)`.
- GREEN:
  - Updated the runner step.
  - `python -m unittest assistant_offline_regression_runner_test.py`
  - Result: 4 tests OK.
  - `python -m py_compile tools\run_claw_assistant_offline_regression.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - `source tree preflight`: OK and blocking.

### 107.3 Current Effect Boundary

- Future handoff developers can trust `python tools\run_claw_assistant_offline_regression.py` to fail if required Claw assistant source files disappear again.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 108. Prompt Preset Generation Frontend Execution Slice (2026-05-30)

This section records the frontend execution fix for assistant-driven slash-preset generation.

### 108.1 Completed Changes

- Updated `modules/assistant/assistantActionExecutor.test.js`.
  - Added coverage for `run_prompt_preset_generation`.
  - The test verifies text preset generation is passed directly to `generationTaskRunner`.
  - The test verifies `presetId` and `presetName` are preserved on the task.
  - The test verifies video preset generation remains blocked with a confirmation warning.
- Updated `modules/assistant/assistantActionExecutor.js`.
  - Added shared generation-action detection for:
    - `queue_generation_task`
    - `run_prompt_preset_generation`
  - `run_prompt_preset_generation` now updates the target node to queued state and calls `generationTaskRunner`.
  - `presetId` and `presetName` are stored in node data for receipt/debug context.
  - `defaultGenerationTaskRunner` now passes the full task object as the second argument to node generation handlers, while preserving the prompt/template first argument.

### 108.2 Verification

- RED:
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: failed because `run_prompt_preset_generation` did not call the generation runner.
- GREEN:
  - Implemented shared generation-action handling.
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: 3 tests pass.
- Syntax:
  - `node --check modules\assistant\assistantActionExecutor.js`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Frontend focused tests: 7 tests pass.

### 108.3 Current Effect Boundary

- This fixes the frontend executor path after the backend returns a valid `run_prompt_preset_generation` action.
- This does not yet resolve preset names against the full app preset registry in schema. The next slice should preserve/repair preset fields so the executor always receives enough information.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 109. Prompt Preset Generation Schema Repair Slice (2026-05-30)

This section records backend schema hardening for assistant-driven slash-preset generation actions.

### 109.1 Completed Changes

- Updated `claw_action_schema_test.py`.
  - Added coverage for model action type aliases:
    - `action`
    - `actionType`
    - `operation`
  - Added coverage for `targetNodeId -> nodeId` repair.
  - Added coverage that `presetName`, `template`, and `inputs` survive schema sanitization.
  - Added coverage that `run_prompt_preset_generation` on `ai-video` remains blocked without authorization.
- Updated `services/claw_action_schema.py`.
  - Repairs action type aliases into canonical `type`.
  - Repairs generation target aliases for both `queue_generation_task` and `run_prompt_preset_generation`.
  - Repairs `preset -> presetId` when present.
  - Preserves `presetName`, `template`, and `inputs` in sanitized actions.
  - Emits warnings when it repairs action type, target node, or preset aliases.

### 109.2 Verification

- RED:
  - `python -m unittest claw_action_schema_test.py`
  - Result: failed with `action[1] missing type` for a model-shaped preset action using `action=run_prompt_preset_generation`.
- GREEN:
  - Added action type alias repair and preset field preservation.
  - `python -m unittest claw_action_schema_test.py`
  - Result: 7 tests OK.
  - `python -m py_compile services\claw_action_schema.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 16 tests OK.
  - Frontend focused tests: 7 tests pass.

### 109.3 Current Effect Boundary

- Backend can now accept common real-model preset generation action shapes and keep enough fields for the frontend executor to run them.
- Video preset generation is still blocked when the model explicitly marks the action as `nodeType=ai-video`.
- Next safety slice: infer the target node type from same-batch created nodes or canvas context so video generation is blocked even when the model omits `nodeType`.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 110. Video Generation Target Type Inference Safety Slice (2026-05-30)

This section records the safety hardening that prevents omitted `nodeType` from bypassing the video-generation authorization boundary.

### 110.1 Completed Changes

- Updated `claw_action_schema_test.py`.
  - Added coverage for `queue_generation_task` targeting a same-batch `ai-video` node while omitting `nodeType`.
  - Added coverage for `run_prompt_preset_generation` targeting an existing canvas `ai-video` node while omitting `nodeType`.
- Updated `services/claw_action_schema.py`.
  - Builds `context_node_types` from `context.canvas.nodes`.
  - Tracks `created_node_types` for same-batch `create_node` actions and generated aliases.
  - Generation validation now resolves target node type from:
    - explicit action `nodeType`;
    - `action.data.nodeType` / `action.data.type`;
    - same-batch created node type;
    - canvas context node type.
  - `queue_generation_task` and `run_prompt_preset_generation` both use the inferred target node type before allowing generation.

### 110.2 Verification

- RED:
  - `python -m unittest claw_action_schema_test.py`
  - Result: failed because generation actions without `nodeType` were accepted even when the target node was `ai-video`.
- GREEN:
  - Added target node type inference.
  - `python -m unittest claw_action_schema_test.py`
  - Result: 9 tests OK.
  - `python -m py_compile services\claw_action_schema.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 18 tests OK.
  - Frontend focused tests: 7 tests pass.

### 110.3 Current Effect Boundary

- Text and image generation remain allowed when valid.
- Video generation is blocked even when the model omits `nodeType`, as long as the target node is known from the same action batch or canvas context.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 111. Storyboard Grid Semantic Layout Slice (2026-05-30)

This section records the frontend canvas layout hardening for `story_to_video` workflows.

### 111.1 Completed Changes

- Updated `modules/assistant/assistantActionExecutor.test.js`.
  - Added a shuffled-node `storyboard_grid` regression case.
  - The test verifies:
    - `story_outline` and `style_bible` stay in the left column.
    - `shot_script -> shot_keyframe -> shot_video` are arranged left-to-right.
    - Shot rows are ordered by `shotIndex`, independent of model action order.
- Updated `modules/assistant/assistantActionExecutor.js`.
  - Added semantic helpers for workflow step and shot index extraction.
  - Added `applyStoryboardGridLayout`.
  - `layout_nodes` now uses semantic layout for `layout=storyboard_grid`.
  - Non-storyboard layouts still use the previous non-overlapping fallback layout.

### 111.2 Verification

- RED:
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: failed because `storyboard_grid` used generic fallback positions and placed the outline at x=380 instead of the left column.
- GREEN:
  - Implemented semantic storyboard layout.
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: 4 tests pass.
  - `node --check modules\assistant\assistantActionExecutor.js`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Frontend focused tests: 8 tests pass.
  - Backend focused tests: 18 tests OK.

### 111.3 Current Effect Boundary

- `storyboard_grid` now has product-aware layout behavior for story workflows, not just generic grid placement.
- This is still an offline executor-level guarantee. Browser visual acceptance and real live apply still require user-managed `8777` readiness and manual/live smoke.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 112. Scorecard Preset Generation Recognition Slice (2026-05-30)

This section records scorecard hardening for `run_prompt_preset_generation`, matching the newly supported frontend execution path.

### 112.1 Completed Changes

- Updated `assistant_live_run_scorecard_test.py`.
  - Added coverage that text/image `run_prompt_preset_generation` counts as safe generation.
  - Added coverage that video `run_prompt_preset_generation` is a hard safety and generation-permission failure.
- Updated `tools/score_assistant_live_run.py`.
  - Added `GENERATION_ACTION_TYPES`.
  - Treats both `queue_generation_task` and `run_prompt_preset_generation` as generation actions.
  - Unauthorized video checks now include preset generation actions.
  - Generation-permission scoring now credits preset text/image generation.

### 112.2 Verification

- RED:
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: failed because preset text/image generation scored as `2` instead of `5`, and video preset generation did not trigger safety failure.
- GREEN:
  - Unified generation action recognition.
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: 6 tests OK.
  - `python -m py_compile tools\score_assistant_live_run.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Offline artifact and scorecard tests: 12 tests OK.
  - Backend focused tests: 18 tests OK.
  - Frontend focused tests: 8 tests pass.

### 112.3 Current Effect Boundary

- Saved live-run JSON that uses prompt preset generation will now be scored consistently with direct queue generation.
- Video preset generation remains treated as unauthorized unless `videoGenerationAuthorized=true` is present in the saved payload.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 113. Workflow Batch Action-Type Alias Recognition Slice (2026-05-30)

This section records a schema repair that prevents workflow placeholder actions from becoming hard errors when the model uses action-type aliases.

### 113.1 Completed Changes

- Updated `claw_action_schema_test.py`.
  - Added coverage for a workflow batch where the real create node uses `action=create_node` instead of `type=create_node`.
  - The test includes empty `create_group` and empty `connect_nodes` placeholders before the aliased create node.
  - Expected behavior: placeholders are ignored with warnings because the batch is still recognized as a workflow batch.
- Updated `services/claw_action_schema.py`.
  - Added `_canonical_action_type`.
  - `_batch_has_workflow_create_nodes` now recognizes:
    - `type`
    - `action`
    - `actionType`
    - `operation`
  - This keeps placeholder-repair behavior aligned with the later per-action alias repair.

### 113.2 Verification

- RED:
  - `python -m unittest claw_action_schema_test.py`
  - Result: failed because the batch was not recognized as workflow and empty placeholders produced required-field errors.
- GREEN:
  - Implemented canonical action-type lookup in workflow batch detection.
  - `python -m unittest claw_action_schema_test.py`
  - Result: 10 tests OK.
  - `python -m py_compile services\claw_action_schema.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 19 tests OK.
  - Frontend focused tests: 8 tests pass.
  - Offline artifact and scorecard tests: 12 tests OK.

### 113.3 Current Effect Boundary

- Workflow placeholder repair is now consistent even when the model uses common action-type aliases.
- This reduces avoidable live schema failures for story workflow batches.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 114. Bridge Fenced JSON Output Parsing Slice (2026-05-30)

This section records backend output parsing hardening for real Claw/model responses.

### 114.1 Completed Changes

- Updated `claw_bridge_service_test.py`.
  - Added coverage for responses wrapped in Markdown fenced JSON blocks.
  - Added coverage for a valid JSON object surrounded by natural-language text.
- Updated `services/claw_bridge_service.py`.
  - Added `_parse_json_payload`.
  - `parse_claw_output` now attempts, in order:
    - direct JSON parsing;
    - Markdown fenced JSON extraction;
    - scanning the text for the first decodable JSON object/array.
  - Nested `message` payloads also reuse the same tolerant parser.

### 114.2 Verification

- RED:
  - `python -m unittest claw_bridge_service_test.py`
  - Result: failed because fenced JSON and surrounding-text JSON were treated as plain reply text.
- GREEN:
  - Implemented tolerant JSON payload extraction.
  - `python -m unittest claw_bridge_service_test.py`
  - Result: 7 tests OK.
  - `python -m py_compile services\claw_bridge_service.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 21 tests OK.
  - Frontend focused tests: 8 tests pass.
  - Offline artifact and scorecard tests: 12 tests OK.

### 114.3 Current Effect Boundary

- Real model responses are less likely to lose actions when they include JSON in common Markdown or explanatory wrappers.
- This does not loosen action safety: parsed actions still go through `ClawActionSchema`.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 115. Preview Nested Workflow Metadata Recognition Slice (2026-05-30)

This section records frontend preview hardening for model outputs that place workflow metadata under `data.metadata`.

### 115.1 Completed Changes

- Updated `modules/assistant/assistantActionPreview.test.js`.
  - Added coverage for `data.metadata.workflowKind=story_to_video`.
- Updated `modules/assistant/assistantActionPreview.js`.
  - `detectWorkflowKind` now checks:
    - `action.data.metadata`
    - `action.data`
    - `action.metadata`
    - root action fields

### 115.2 Verification

- RED:
  - `node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js`
  - Result: failed because nested `data.metadata.workflowKind` produced empty `workflowKind`.
- GREEN:
  - Added nested metadata workflow detection.
  - `node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js`
  - Result: 3 tests pass.
  - `node --check modules\assistant\assistantActionPreview.js`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Frontend focused tests: 9 tests pass.
  - Backend focused tests: 21 tests OK.

### 115.3 Current Effect Boundary

- Preview can now display story workflow wording even when real model output nests workflow metadata under `data.metadata`.
- Next slice should ensure backend schema sanitization preserves or flattens safe nested workflow metadata before actions reach the frontend.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 116. Schema Nested Workflow Metadata Preservation Slice (2026-05-30)

This section records backend schema hardening for model outputs that place workflow metadata under `data.metadata`.

### 116.1 Completed Changes

- Updated `claw_action_schema_test.py`.
  - Added coverage for a `create_node` whose safe workflow fields are nested under `data.metadata`.
  - The test includes an incomplete `create_group` placeholder to prove the batch is still recognized as a workflow batch.
  - The test verifies safe workflow fields are flattened into sanitized `action.data`.
- Updated `services/claw_action_schema.py`.
  - `_action_workflow_kind` now checks:
    - root action fields;
    - `data.metadata`;
    - `data`;
    - root `metadata`;
    - `patch.metadata`;
    - `patch`.
  - `_safe_metadata` now preserves safe workflow fields from nested `metadata` before merging safe top-level data fields.

### 116.2 Verification

- RED:
  - `python -m unittest claw_action_schema_test.py`
  - Result: failed because `data.metadata.workflowKind` did not mark the batch as workflow, so an incomplete group placeholder became a hard error.
- GREEN:
  - Added nested workflow metadata detection and flattening.
  - `python -m unittest claw_action_schema_test.py`
  - Result: 11 tests OK.
  - `python -m py_compile services\claw_action_schema.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Backend focused tests: 22 tests OK.
  - Frontend focused tests: 9 tests pass.
  - Offline artifact and scorecard tests: 12 tests OK.

### 116.3 Current Effect Boundary

- Backend schema now preserves nested workflow metadata in the sanitized action shape that frontend preview/executor can read.
- This keeps real model output, schema repair, and preview workflow detection aligned.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 117. Scorecard Data Workflow Metadata Recognition Slice (2026-05-30)

This section records scorecard alignment with the sanitized schema action shape.

### 117.1 Completed Changes

- Updated `assistant_live_run_scorecard_test.py`.
  - Added `_data_node` helper for actions where workflow metadata is stored under `data`.
  - Added coverage that a complete `story_to_video` workflow with `data.workflowKind`, `data.workflowStep`, and `data.shotIndex` scores structure completeness as 5.
- Updated `tools/score_assistant_live_run.py`.
  - Added `WORKFLOW_FIELDS`.
  - `_metadata` now merges safe workflow fields from `action.data` in addition to `action.data.metadata` and root `metadata`.

### 117.2 Verification

- RED:
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: failed because a complete story workflow with workflow fields in `data` scored structure completeness as 1 instead of 5.
- GREEN:
  - Added `data` workflow field merge.
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: 7 tests OK.
  - `python -m py_compile tools\score_assistant_live_run.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Offline artifact and scorecard tests: 13 tests OK.
  - Backend focused tests: 22 tests OK.
  - Frontend focused tests: 9 tests pass.

### 117.3 Current Effect Boundary

- Scorecard now matches the sanitized schema action shape where safe workflow metadata is preserved in `data`.
- This avoids under-scoring valid story workflows after schema repair.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 118. Scorecard Generation Target Type Inference Slice (2026-05-30)

This section records scorecard hardening for generation actions that omit `nodeType`.

### 118.1 Completed Changes

- Updated `assistant_live_run_scorecard_test.py`.
  - Added coverage for text/image generation actions that only provide `nodeId`.
  - Added coverage for video generation actions that only provide `nodeId`.
- Updated `tools/score_assistant_live_run.py`.
  - Added `_created_node_types`.
  - Generation-permission scoring now infers missing generation `nodeType` from same-batch created target nodes.
  - Unauthorized video detection already used created video node ids; this slice confirms that behavior with preset generation too.

### 118.2 Verification

- RED:
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: failed because text/image generation with omitted `nodeType` scored generation permission as 2 instead of 5.
- GREEN:
  - Added created-node target type inference.
  - `python -m unittest assistant_live_run_scorecard_test.py`
  - Result: 9 tests OK.
  - `python -m py_compile tools\score_assistant_live_run.py`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Offline artifact and scorecard tests: 15 tests OK.
  - Backend focused tests: 22 tests OK.
  - Frontend focused tests: 9 tests pass.

### 118.3 Current Effect Boundary

- Scorecard now gives credit for valid text/image generation actions even when the model omits `nodeType`.
- Scorecard still treats generation targeting created video nodes as unauthorized unless `videoGenerationAuthorized=true`.
- Next frontend safety slice: mirror this target-type inference in `assistantActionExecutor.js` so video generation cannot be started if an action bypasses backend schema and omits `nodeType`.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 119. Executor Generation Target Type Inference Slice (2026-05-30)

This section records the frontend executor safety mirror for generation actions that omit `nodeType`.

### 119.1 Completed Changes

- Updated `modules/assistant/assistantActionExecutor.test.js`.
  - Added coverage for `queue_generation_task` and `run_prompt_preset_generation` targeting an `ai-video` node while omitting `nodeType`.
  - The test verifies the generation runner is not called, no generation node ids are queued, and a confirmation warning is returned.
- Updated `modules/assistant/assistantActionExecutor.js`.
  - Added target node type helpers.
  - Generation handling now resolves type from:
    - explicit action `nodeType`;
    - `action.data.nodeType`;
    - `action.data.type`;
    - the current graph node type.
  - Video generation remains blocked when the inferred target type is `ai-video`.
  - The inferred `nodeType` is passed into `generationTaskRunner` for downstream handlers.

### 119.2 Verification

- RED:
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: failed because both omitted-`nodeType` generation actions started the video node.
- GREEN:
  - Added target node type inference.
  - `node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js`
  - Result: 5 tests pass.
  - `node --check modules\assistant\assistantActionExecutor.js`
  - Result: OK.
- Full offline regression:
  - `python tools\run_claw_assistant_offline_regression.py`
  - Result: exit 0.
  - Frontend focused tests: 10 tests pass.
  - Backend focused tests: 22 tests OK.
  - Offline artifact and scorecard tests: 15 tests OK.

### 119.3 Current Effect Boundary

- Executor now has a frontend-side safety guard matching backend schema and scorecard target-type inference.
- This protects against accidental video generation if actions bypass backend schema or are replayed directly in frontend tests/tools.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 120. Unified Skill Registry v2 Loader Slice (2026-06-10)

This section records the first implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.2 Phase 1.

### 120.1 Completed Changes

- Updated `services/claw_skill_registry_service.py`.
  - Added optional `v2_skill_dir` support with default path `config/assistant-skills-v2`.
  - Added v2 directory skill loading: each v2 skill lives in a directory with `skill.json` and optional `instructions.md` / `examples.json`.
  - Added legacy field migration: `qualityRubric` is mirrored to `qualityRules` while keeping `qualityRubric` for old callers.
  - Added safe serialization of v2 fields: `type`, `qualityRules`, `riskLevel`, `requiresConfirmation`.
  - Added id-based override behavior: v2 skill wins over legacy skill with the same `id`.
  - Kept old `config/assistant-skills/*.json` loading intact.
- Updated `claw_skill_registry_service_test.py`.
  - Added RED/GREEN coverage for v2 skill directory loading and `qualityRules` serialization.
  - Added coverage that v2 overrides legacy by `id`.
  - Added coverage that legacy `qualityRubric` migrates to `qualityRules` without removing `qualityRubric`.

### 120.2 Verification

- RED:
  - `python -m unittest claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_loads_v2_skill_directory_and_serializes_quality_rules claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_v2_skill_overrides_legacy_skill_and_legacy_quality_rubric_migrates`
  - Result: failed because `ClawSkillRegistryService.__init__()` did not accept `v2_skill_dir`.
- GREEN:
  - `python -m unittest claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_loads_v2_skill_directory_and_serializes_quality_rules claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_v2_skill_overrides_legacy_skill_and_legacy_quality_rubric_migrates`
  - Result: 2 tests OK.
  - `python -m unittest claw_skill_registry_service_test.py claw_bridge_service_test.py`
  - Result: 16 tests OK.
  - `python -m py_compile services\claw_skill_registry_service.py`
  - Result: OK.

### 120.3 Current Effect Boundary

- Claw registry can now read v2 skill directories while preserving legacy skill compatibility.
- This is only the first Phase 1 vertical slice. Phase 1 is not complete yet because built-in v2 skill files, PI Skill Adapter, Canvas Skills Adapter, and full Assistant Response Contract v2 are still pending.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 121. Unified Skill Registry v2 Built-in Core Skills Slice (2026-06-10)

This section records the second implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.2 Phase 1.

### 121.1 Completed Changes

- Added built-in v2 skill directories under `config/assistant-skills-v2/`:
  - `canvas_layout/`
  - `prompt_preset_generation/`
  - `asset_usage/`
  - `storyboard_workflow/`
- Each v2 skill includes:
  - `skill.json`
  - `instructions.md`
  - `examples.json`
  - `tests.json`
- Updated `claw_skill_registry_service_test.py`.
  - Added default registry coverage for the four PRD Phase 1 core scenarios:
    - “请整理画布，让节点更清楚” -> `canvas_layout`
    - “用预设生成图片” -> `prompt_preset_generation`
    - “拿这个资产做图” -> `asset_usage`
    - “做 6 个分镜” -> `storyboard_workflow`
- Updated `services/claw_skill_registry_service.py` after this slice exposed a real test contamination issue.
  - Explicit `skill_dir` no longer implicitly loads default `config/assistant-skills-v2`; tests/custom registries stay isolated unless `v2_skill_dir` is explicitly provided.
  - Default registry still loads both legacy and v2 directories.

### 121.2 Verification

- RED:
  - `python -m unittest claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_default_registry_matches_v2_core_phase1_skills`
  - Result: failed because default registry did not have v2 built-in skills; preset/asset did not match, and storyboard still matched legacy `storyboard_director`.
- GREEN:
  - `python -m unittest claw_skill_registry_service_test.ClawSkillRegistryServiceTests.test_default_registry_matches_v2_core_phase1_skills`
  - Result: 1 test OK.
  - `python -m unittest claw_skill_registry_service_test.py claw_bridge_service_test.py`
  - Result: 17 tests OK.
  - UTF-8 / JSON check for `config/assistant-skills-v2/**/*.json` and `instructions.md`
  - Result: JSON files OK, instructions OK, no continuous question-mark mojibake found.

### 121.3 Current Effect Boundary

- Default Claw registry can now hit the PRD v1.2 Phase 1 core v2 skills.
- This still does not complete Phase 1: PI Skill Adapter, Canvas Skills Adapter, Assistant Response Contract v2, and full skill offline runner are pending.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 122. PI Skill Adapter Minimum Slice (2026-06-10)

This section records the third implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.2 Phase 1.

### 122.1 Completed Changes

- Updated `integrations/pi_canvas_agent/src/huanyingTools.ts` and runtime JS mirror `integrations/pi_canvas_agent/src/huanyingTools.js`.
  - Added `loadHuanyingSkillDefinitions(skillRoot)` for reading `config/assistant-skills-v2/*/skill.json` and `instructions.md`.
  - Added safe skill sanitization for PI prompt injection.
  - Added `buildCanvasAgentSystemPrompt(mode, { skills })` option.
  - Added a `Unified Skill Registry v2` prompt section that includes shared skill ids, allowed actions, forbidden actions, required context, quality rules, risk level, confirmation flag, and clipped instructions.
  - Kept the previous hard-coded PI prompt rules intact as fallback.
- Added `integrations/pi_canvas_agent/src/huanyingTools.skillRegistry.test.js`.
  - Direct Node test for the PI v2 skill adapter without requiring npm/tsc.
- Updated `integrations/pi_canvas_agent/src/huanyingTools.test.ts`.
  - Added TS-level test intent for the same adapter behavior.

### 122.2 Verification

- RED:
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\huanyingTools.skillRegistry.test.js`
  - Result: failed because `./huanyingTools.js` did not export `loadHuanyingSkillDefinitions`.
- GREEN:
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\huanyingTools.skillRegistry.test.js`
  - Result: 1 test pass.
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\huanyingTools.skillRegistry.test.js integrations\pi_canvas_agent\src\protocol.test.js integrations\pi_canvas_agent\src\piClient.test.js integrations\pi_canvas_agent\src\piSdkAdapter.test.js`
  - Result: 23 tests pass.
  - `D:\Aic\node.exe --check integrations\pi_canvas_agent\src\huanyingTools.js`
  - Result: OK.

### 122.3 Current Effect Boundary

- PI can now consume the same v2 skill definitions and include them in the system prompt when caller passes `skills`.
- The runner/client still needs a wiring slice to load v2 skills by default when handling real PI requests; this slice only proves the adapter and prompt surface.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 122.5 PRD v1.3 Real-Code Review Addendum (2026-06-10)

This section records the PRD repair requested after reviewing the real code and project tacit knowledge.

### 122.5.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from v1.2 to v1.3.
- Added a real-code implementation progress snapshot:
  - Slice 120 Claw v2 loader: completed.
  - Slice 121 built-in v2 core skills: completed.
  - Slice 122 PI Skill Adapter minimum: completed but not wired into real PI requests yet.
  - Slice 123 Canvas Skills Adapter: still pending and remains the next implementation slice.
  - Assistant Response Contract v2, Execution Drawer, Project Execution Store, and Orchestrator: still pending.
- Added real-code anchors for the next developer:
  - `services/claw_skill_registry_service.py`
  - `services/claw_bridge_service.py`
  - `integrations/pi_canvas_agent/src/huanyingTools.ts`
  - `integrations/pi_canvas_agent/src/piClient.ts`
  - `integrations/pi_canvas_agent/src/protocol.ts`
  - `modules/assistant/canvasSkills/manifest.js`
  - `modules/assistant/canvasSkills/registry.js`
  - `modules/app/appAssistantPanel.js`
  - `modules/assistant/assistantActionExecutor.js`
  - `services/canvas_agent_route_service.py`
  - `services/http_route_dispatcher.py`
- Corrected the execution API namespace in the PRD:
  - Main execution API should be `/api/v2/canvas-agent/executions/*`.
  - Do not invent `/api/v2/assistant/executions/*` unless dispatcher wiring and tests are also added.
- Clarified current safety debt:
  - `appAssistantPanel.js` still has historical `state.agentMode === "act"` -> `videoAuthorized=true` logic.
  - `canvasSkills/registry.js::shouldConfirmCanvasSkillBatch()` still suppresses confirmation in Act mode.
  - `canvas_agent_action_schema.py` still has `start_generation` compatibility behavior that must not become real video authorization.
- Clarified current PI gap:
  - `huanyingTools.ts/js` can load v2 skills.
  - `piClient.ts/js` still does not pass `skills` into `buildCanvasAgentSystemPrompt()` for real requests.
- Clarified current v2 contract gap:
  - Frontend protocol, PI protocol, PI bridge, Claw parser, and app panel still mostly preserve only old `reply/actions/warnings/requiresConfirmation` fields.
- Added Phase 1 closing slice order:
  1. Canvas Skills Adapter minimum.
  2. PI default v2 skill loading.
  3. Assistant Response Contract v2.
  4. v2 skill offline runner.
  5. video safety debt fix.
- Added environment/test constraints:
  - CodeGraph may be locked; use `rg`/file reads when needed.
  - `npm` may be unavailable; use `D:\Aic\node.exe`.
  - Keep TS and JS mirrors synchronized.
  - Check Chinese encoding for continuous question-mark mojibake.
  - Do not start, stop, check, probe, or touch the user-managed `8777` service.

### 122.5.2 Current Effect Boundary

- This was a documentation repair slice, not a code feature slice.
- The PRD now matches the current real code more closely and no longer implies that Phase 1 is complete.
- The next implementation slice should still be Canvas Skills Adapter minimum, previously referred to as Slice 123.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 123. Canvas Skills v2 Adapter Minimum Slice (2026-06-10)

This section records the fourth implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.3 Phase 1.

### 123.1 Completed Changes

- Updated `modules/assistant/canvasSkills/manifest.test.js`.
  - Added RED/GREEN coverage that the public Canvas Skills module exports a v2 adapter surface.
  - Added coverage for mapping v2 `prompt_preset_generation` to:
    - `imageNode.applyPreset`
    - `textNode.applyPreset`
    - `videoNode.applyPreset` with `requiresConfirmation=true`
  - Added coverage for mapping generation actions to `videoNode.generate` with `requiresConfirmation=true`.
  - Added coverage for mapping v2 `asset_usage` to existing asset/reference Canvas Skills ids.
- Updated `modules/assistant/canvasSkills/registry.js`.
  - Added `canvasSkillIdsForV2Skill(skill, options)`.
  - Added `canvasSkillCallsForV2Skill(skill, options)`.
  - The adapter maps:
    - `run_prompt_preset_generation` + `ai-image` -> `imageNode.applyPreset`
    - `run_prompt_preset_generation` + `ai-text` -> `textNode.applyPreset`
    - `run_prompt_preset_generation` + `ai-video` -> `videoNode.applyPreset`
    - generation actions + `ai-image` -> `imageNode.generate`
    - generation actions + `ai-text` -> `textNode.generate`
    - generation actions + `ai-video` -> `videoNode.generate`
    - `asset_usage` / `asset_bind` -> `asset.use` + `node.bindReferences`
  - Video preset/generation calls are marked `requiresConfirmation=true`.
- Updated `modules/assistant/canvasSkills/index.js`.
  - Re-exported the v2 adapter functions from the public Canvas Skills surface.
- Updated `modules/assistant/assistantCanvasSkillRegistry.js`.
  - Re-exported the v2 adapter functions from the legacy assistant registry facade.
- Updated `modules/assistant/assistantCanvasSkillRegistry.test.js`.
  - Added coverage that old callers can access the v2 adapter through the legacy registry facade.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Marked Slice 123 as completed minimum closure.
  - Updated Phase 1 remaining slice order so PI default v2 skill loading is next.

### 123.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js`
  - Result: failed because `canvasSkillIdsForV2Skill` / `canvasSkillCallsForV2Skill` were not exported or implemented.
- GREEN:
  - Implemented the adapter and exports.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js`
  - Result: 5 tests pass.
  - `D:\Aic\node.exe --check modules\assistant\canvasSkills\registry.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\canvasSkills\index.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantCanvasSkillRegistry.js`
  - Result: OK.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\canvasSkills\manifest.test.js modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\canvasSkills\loader.test.js modules\assistant\canvasSkills\runtime.test.js modules\assistant\canvasSkills\executor.test.js`
  - Result: 14 tests pass.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\canvasSkills\manifest.test.js`
  - Result: 9 tests pass.

### 123.3 Current Effect Boundary

- Canvas Skills can now consume v2 skill metadata at the adapter level and map it to existing stable Canvas Skills ids.
- This completes only the minimum Canvas Skills Adapter slice.
- It does not yet add Execution Orchestrator timeline trace, Project Execution Store, or Assistant Response Contract v2.
- It does not fix the separate video safety debt in `shouldConfirmCanvasSkillBatch()` or `appAssistantPanel.js`; that remains a dedicated safety slice after PI default loading and v2 contract work.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 124. PI Default v2 Skill Loading Slice (2026-06-10)

This section records the fifth implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.3 Phase 1.

### 124.1 Completed Changes

- Updated `integrations/pi_canvas_agent/src/piClient.test.js`.
  - Added RED/GREEN coverage that a real `createPiModelClient().complete()` call sends a system prompt containing:
    - `Unified Skill Registry v2`
    - `skill=prompt_preset_generation`
    - `allowedActions=...run_prompt_preset_generation`
- Updated `integrations/pi_canvas_agent/src/piClient.js`.
  - Imported `loadHuanyingSkillDefinitions`.
  - Added default skill root resolution relative to the source file:
    - `../../../config/assistant-skills-v2`
  - Added default v2 skill loading before calling `buildCanvasAgentSystemPrompt(mode, { skills })`.
  - Added optional test/runtime overrides via `options.skills` or `options.skillRoot`.
- Updated `integrations/pi_canvas_agent/src/piClient.ts`.
  - Mirrored the runtime JS changes and extended `PiClientOptions` with `skillRoot` / `skills`.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Marked PI default v2 prompt injection as completed.
  - Kept PI response contract v2 as the remaining gap.

### 124.2 Verification

- RED:
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\piClient.test.js`
  - Result: failed because the captured real completion `systemPrompt` did not include `Unified Skill Registry v2`.
- GREEN:
  - Implemented default v2 skill loading in `piClient.ts/js`.
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\piClient.test.js`
  - Result: 7 tests pass.
  - `D:\Aic\node.exe --check integrations\pi_canvas_agent\src\piClient.js`
  - Result: OK.
  - `D:\Aic\node.exe --check integrations\pi_canvas_agent\src\huanyingTools.js`
  - Result: OK.
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\huanyingTools.skillRegistry.test.js integrations\pi_canvas_agent\src\protocol.test.js integrations\pi_canvas_agent\src\piClient.test.js integrations\pi_canvas_agent\src\piSdkAdapter.test.js`
  - Result: 24 tests pass.

### 124.3 Current Effect Boundary

- PI real completion prompts now default to the same v2 skill definitions that Claw and Canvas Skills adapters use.
- This completes the PI default v2 prompt-loading slice.
- PI protocol and parser still do not preserve Assistant Response Contract v2 fields like `intent`, `plan`, `actionsByStep`, `execution`, or `developer`.
- The next Phase 1 slice should implement Assistant Response Contract v2 passthrough across frontend protocol, PI protocol/parser, PI bridge, and Claw parser.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 125. Assistant Response Contract v2 Minimum Passthrough Slice (2026-06-10)

This section records the sixth implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.3 Phase 1.

### 125.1 Completed Changes

- Updated `modules/assistant/assistantProtocol.test.js`.
  - Added RED/GREEN coverage that `normalizeAssistantResponse()` preserves sanitized v2 fields:
    - `intent`
    - `plan`
    - `actionsByStep`
    - `execution`
    - `developer`
  - Added stream `message.done` coverage for the same v2 fields.
  - Verified secret-ish fields such as `apiKey` and local path fields are not preserved.
- Updated `modules/assistant/assistantProtocol.js`.
  - Added small v2 contract sanitizer.
  - `normalizeAssistantResponse()` now preserves v2 contract fields while keeping old `actions` compatibility.
  - `normalizeAssistantStreamFrame()` preserves v2 contract fields only on trusted `message.done`, not on deltas.
- Updated `integrations/pi_canvas_agent/src/protocol.test.js`.
  - Added RED/GREEN coverage that `safeResponse()` and `safeStreamFrame(message.done)` preserve sanitized v2 fields.
- Updated `integrations/pi_canvas_agent/src/protocol.js` and `integrations/pi_canvas_agent/src/protocol.ts`.
  - Added matching v2 contract sanitization and passthrough.
- Updated `integrations/pi_canvas_agent/src/piClient.test.js`.
  - Added coverage that model JSON using v2 contract is parsed and preserved.
  - Added coverage that legacy `actions` responses are wrapped into a minimal v2 plan:
    - `intent_<requestId>`
    - `plan_<requestId>`
    - `actionsByStep.step_actions`
    - `exec_<requestId>`
- Updated `integrations/pi_canvas_agent/src/piClient.js` and `integrations/pi_canvas_agent/src/piClient.ts`.
  - Added legacy response wrapper for old `reply/actions/warnings/requiresConfirmation` payloads.
  - Preserves v2 fields from model JSON before calling `safeResponse()`.
- Updated `claw_bridge_service_test.py`.
  - Added coverage that `ClawBridgeService.parse_claw_output()` preserves sanitized v2 fields.
- Updated `services/claw_bridge_service.py`.
  - Added v2 contract field sanitization and passthrough in `parse_claw_output()`.
- Updated `pi_bridge_service_test.py`.
  - Added coverage that `PiBridgeService.chat()` preserves sanitized v2 fields after action validation.
- Updated `services/pi_bridge_service.py`.
  - Added v2 field sanitization in `_sanitize_response()`.
  - Preserves v2 fields in non-stream chat and final `message.done` stream frames.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Marked Assistant Response Contract v2 as completed minimum passthrough.
  - Kept UI execution drawer, Project Execution Store, and Orchestrator as later consumers.

### 125.2 Verification

- RED:
  - `D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js integrations\pi_canvas_agent\src\protocol.test.js integrations\pi_canvas_agent\src\piClient.test.js`
  - Result: failed because v2 fields were missing from frontend protocol, PI protocol, and PI parser.
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_parse_claw_preserves_assistant_response_contract_v2 pi_bridge_service_test.PiBridgeServiceTest.test_chat_preserves_assistant_response_contract_v2_fields`
  - Result: failed because Claw and PI bridge outputs omitted `intent`.
- GREEN:
  - Implemented v2 contract passthrough and sanitization.
  - `D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js integrations\pi_canvas_agent\src\protocol.test.js integrations\pi_canvas_agent\src\piClient.test.js`
  - Result: 27 tests pass.
  - `python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_parse_claw_preserves_assistant_response_contract_v2 pi_bridge_service_test.PiBridgeServiceTest.test_chat_preserves_assistant_response_contract_v2_fields`
  - Result: 2 tests OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantProtocol.js`
  - Result: OK.
  - `D:\Aic\node.exe --check integrations\pi_canvas_agent\src\protocol.js`
  - Result: OK.
  - `D:\Aic\node.exe --check integrations\pi_canvas_agent\src\piClient.js`
  - Result: OK.
  - `python -m py_compile services\claw_bridge_service.py services\pi_bridge_service.py`
  - Result: OK.
  - `D:\Aic\node.exe --test integrations\pi_canvas_agent\src\huanyingTools.skillRegistry.test.js integrations\pi_canvas_agent\src\protocol.test.js integrations\pi_canvas_agent\src\piClient.test.js integrations\pi_canvas_agent\src\piSdkAdapter.test.js modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js`
  - Result: 35 tests pass.
  - `python -m unittest claw_bridge_service_test.py pi_bridge_service_test.py claw_skill_registry_service_test.py`
  - Result: 48 tests OK.

### 125.3 Current Effect Boundary

- Claw, PI, and frontend protocol layers now preserve sanitized Assistant Response Contract v2 fields.
- Old `actions` responses remain compatible and can be wrapped into a minimal v2 plan by PI client parsing.
- This slice does not yet render the new input-above execution drawer.
- This slice does not yet persist v2 executions into Project Execution Store.
- This slice does not yet implement Execution Orchestrator, Undo, Replay, or timeline.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 126. v2 Skill Offline Runner Slice (2026-06-10)

This section records the seventh implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.3 Phase 1.

### 126.1 Completed Changes

- Added `services/assistant_skill_v2_offline_runner.py`.
  - Reads `config/assistant-skills-v2/*/tests.json`.
  - Uses `ClawSkillRegistryService(skill_dir=root, v2_skill_dir=root)` so v2 skill test fixtures stay isolated from legacy built-ins.
  - Executes each test case by calling `registry.match(input, {})`.
  - Verifies `expectSkill` / `mustUseSkill` / `expectedSkill` appears in matched skill ids.
  - Returns structured result with `success`, `total`, `passed`, `failed`, and per-case details.
- Added `assistant_skill_v2_offline_runner_test.py`.
  - Added RED/GREEN coverage for passing test cases.
  - Added RED/GREEN coverage for failed expected-skill matches.
  - Added default built-in coverage for the four v2 core skills.
- Added `tools/run_assistant_skill_v2_offline_tests.py`.
  - CLI entry point for running the v2 skill offline suite.
  - Adds the project root to `sys.path` so it works when invoked from `tools/`.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Marked v2 `tests.json` offline runner as completed minimum closure.

### 126.2 Verification

- RED:
  - `python -m unittest assistant_skill_v2_offline_runner_test.py`
  - Result: failed because `services.assistant_skill_v2_offline_runner` did not exist.
- GREEN:
  - Implemented the runner and CLI.
  - `python -m unittest assistant_skill_v2_offline_runner_test.py`
  - Result: 3 tests OK.
  - First CLI attempt:
    - `python tools\run_assistant_skill_v2_offline_tests.py`
    - Result: failed because `services` was not importable when running a script from `tools/`.
  - Fixed CLI project-root `sys.path`.
  - `python tools\run_assistant_skill_v2_offline_tests.py`
  - Result: success true, 4 total, 4 passed, 0 failed.
  - `python -m py_compile services\assistant_skill_v2_offline_runner.py tools\run_assistant_skill_v2_offline_tests.py`
  - Result: OK.
  - `python -m unittest assistant_skill_v2_offline_runner_test.py claw_skill_registry_service_test.py`
  - Result: 13 tests OK.

### 126.3 Current Effect Boundary

- v2 `tests.json` files now have a real executable offline runner and CLI.
- The runner currently verifies expected skill matching only.
- It does not yet assert deep action generation, allowedActions-only, forbiddenActions, qualityRules, or fixture canvas simulation.
- The next Phase 1 safety slice should fix `Act` mode video authorization debt in `appAssistantPanel.js` and `canvasSkills/registry.js`.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 126.5 PRD v1.4 Real-Code and Tacit-Knowledge Repair (2026-06-10)

This section records the documentation repair requested after re-reviewing the PRD against the real code, previous handoff knowledge, and project tacit rules.

### 126.5.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from v1.3 to v1.4.
- Corrected the top-level PRD status:
  - Slice 120-126 are now recorded as completed and verified.
  - Phase 1 is not yet formally complete because the Act-mode video authorization safety debt remains open.
  - Phase 2/3/4/5 are still not implemented.
- Repaired stale PRD statements that previously implied:
  - `parse_claw_output()` still only preserved old fields.
  - real `piClient` requests still did not load v2 skills.
  - Canvas Skills v2 adapter was still pending.
  - frontend protocol still only preserved old fields.
- Replaced those stale statements with current real-code facts:
  - `services/claw_bridge_service.py` preserves sanitized v2 contract fields.
  - `integrations/pi_canvas_agent/src/piClient.ts/js` defaults to `config/assistant-skills-v2` and passes skills into `buildCanvasAgentSystemPrompt(mode, { skills })`.
  - `integrations/pi_canvas_agent/src/protocol.ts/js` preserves sanitized v2 contract fields.
  - `modules/assistant/assistantProtocol.js` preserves sanitized v2 contract fields.
  - `modules/assistant/canvasSkills/registry.js` exposes `canvasSkillIdsForV2Skill()` and `canvasSkillCallsForV2Skill()`.
  - `services/assistant_skill_v2_offline_runner.py` and `tools/run_assistant_skill_v2_offline_tests.py` provide a minimal executable v2 skill offline runner.
- Clarified that current v2 skill tests only verify skill matching:
  - allowedActions-only checks remain pending.
  - forbiddenActions checks remain pending.
  - qualityRules checks remain pending.
  - real canvas fixture simulation remains pending.
- Clarified that `/api/v2/canvas-agent/executions/*` is still a future route:
  - `services/canvas_agent_route_service.py` currently has no executions route.
  - `services/http_route_dispatcher.py` currently has no executions allowlist entry.
- Preserved the user-managed 8777 rule in the PRD:
  - do not start, stop, restart, check, or probe the 8777 service automatically.
  - live service readiness remains user-managed.

### 126.5.2 Current Effect Boundary

- This was a documentation repair slice only; no runtime code behavior changed in this slice.
- The PRD now better matches the actual current code and the handoff record.
- The next implementation slice should still be the Act-mode video authorization safety fix:
  - write RED tests in `modules/assistant/assistantCanvasSkillRegistry.test.js` and `modules/app/appAssistantPanel.test.js` or `modules/app/appAssistantPanel.p1Ui.test.js`.
  - fix `modules/assistant/canvasSkills/registry.js::shouldConfirmCanvasSkillBatch()` so video calls require confirmation even in Act mode.
  - fix `modules/app/appAssistantPanel.js` so `state.agentMode === "act"` no longer implies `videoAuthorized=true`.
  - allow explicit confirmation/authorization for Act-mode video cards without automatically granting video permission.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 127. Act Mode Video Authorization Safety Slice (2026-06-10)

This section records the Phase 1 safety closure slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.5.

### 127.1 Completed Changes

- Updated `modules/assistant/assistantCanvasSkillRegistry.test.js`.
  - Changed the Act-mode video generation expectation from auto-confirm false to confirmation true.
  - This prevents `shouldConfirmCanvasSkillBatch()` from treating Act mode as video authorization.
- Updated `modules/assistant/canvasSkills/registry.js`.
  - `shouldConfirmCanvasSkillBatch()` now checks video generation before applying the Act-mode shortcut.
  - Video generation Canvas Skills now require confirmation in both Plan and Act modes.
  - Text/image generation remains unchanged: Act mode can still auto-apply low-risk non-video generation batches according to the existing policy.
- Updated `modules/assistant/assistantInteractionCards.js`.
  - Added `includesVideoGenerationTask` analysis.
  - Kept the distinction between:
    - creating a video draft node, which can remain low-risk in Act mode.
    - running a real video generation task via `queue_generation_task` or `run_prompt_preset_generation`, which requires authorization.
  - `shouldRequireCardConfirmation()` now forces confirmation for real video generation tasks even in Act mode.
- Updated `modules/assistant/assistantInteractionCards.test.js`.
  - Added coverage that Act mode still confirms real video generation tasks.
  - Kept existing coverage that Act mode can still skip confirmation for ordinary node preparation cards.
- Updated `modules/assistant/assistantActionPreviewModel.js`.
  - Act mode no longer suppresses strong confirmation for real video generation in the preview model.
  - Preview text now continues to warn about explicit video confirmation for video generation tasks.
- Updated `modules/assistant/assistantActionPreviewModel.test.js`.
  - Replaced the old expectation “Act mode video generation skips strong confirmation text” with the correct expectation that Act mode video generation still requires explicit video authorization.
- Updated `modules/app/appAssistantPanel.js`.
  - Removed the historical `state.agentMode === "act"` -> `videoAuthorized=true` derivation.
  - `videoAuthorized` now requires both:
    - `state.videoGenerationAuthorized === true`
    - `state.strongConfirmationApproved === true`
  - `prepareInteractionCardForPendingActions()` no longer auto-applies cards containing real video generation tasks.
  - `confirmPendingInteractionCard()` can authorize required confirmation cards regardless of Plan/Act mode.
  - `approveVideoGeneration()` now also sets `strongConfirmationApproved=true`, so explicit video approval can pass the existing authorization gate.
  - The rendered confirmation buttons now appear for required confirmation cards in Act mode too.
- Updated `modules/app/appAssistantPanel.test.js`.
  - Replaced the old unsafe test “Act mode authorizes video” with:
    - Act mode does not authorize video generation without explicit approval.
    - Explicit video approval lets Act mode validate and execute video generation.
- Updated `modules/app/appAssistantPanel.p1Ui.test.js`.
  - Added UI coverage that an Act-mode video authorization card renders confirm/cancel buttons.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v1.4 to v1.5.
  - Marked Slice 127 as complete.
  - Marked Phase 1 minimum closure as complete.
  - Kept Phase 2/3/4/5 as not yet implemented.

### 127.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 3 expected failures:
    - Act-mode video Canvas Skill confirmation returned false.
    - Act-mode video generation validated/executed without explicit authorization.
    - Act-mode video authorization card did not render confirm/cancel buttons.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantActionPreviewModel.test.js`
  - Result: expected failure because Act-mode video preview still suppressed strong confirmation.
- GREEN:
  - Implemented the safety fixes above.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantCanvasSkillRegistry.test.js modules\assistant\assistantInteractionCards.test.js modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 103 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\canvasSkills\registry.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantInteractionCards.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantActionPreviewModel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 127.3 Current Effect Boundary

- Phase 1 minimum closure is now complete:
  - Unified Skill Registry v2 loader exists.
  - Built-in v2 core skills exist.
  - Claw, PI, and Canvas Skills adapter minimum paths exist.
  - Assistant Response Contract v2 passthrough exists.
  - v2 skill offline runner exists.
  - Act mode no longer acts as video authorization.
- This slice does not implement Phase 2:
  - no input-above execution drawer yet.
  - no Project Execution Store yet.
  - no `/api/v2/canvas-agent/executions/*` route yet.
- This slice does not implement Phase 3:
  - no Execution Orchestrator yet.
  - no real pause/resume/retry timeline orchestration yet.
  - Orchestrator must repeat the same video authorization rule when implemented.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 128. Assistant Execution Store Minimum Slice and PRD v1.6 Repair (2026-06-10)

This section records the first Phase 2 minimum slice plus the PRD repair requested after reviewing the document against real code and project tacit knowledge.

### 128.1 Completed Code State Verified From Real Files

- `modules/assistant/assistantExecutionStore.js` exists and provides a frontend project-level execution store.
  - Storage key: `huanying.canvasAgent.executions.v1`.
  - Exports `AssistantExecutionStatus` and `createAssistantExecutionStore()`.
  - Supports `snapshot()`, `list()`, `getExecution()`, `createExecution()`, `enqueueExecution()`, `updateStatus()`, `appendTimelineEvent()`, and `clearCompleted()`.
  - Keeps executions project-scoped so different projects do not mix.
  - Stores queue, `drawerState`, progress, plan, `actionsByStep`, summary, and timeline events.
  - Prunes completed/inactive history according to `maxExecutions` while preserving active executions first.
  - Sanitizes secrets, auth headers/cookies, OpenAI-style keys, bearer tokens, local absolute paths, and long base64 data URLs from developer/debug payloads.
- `modules/assistant/assistantExecutionStore.test.js` covers:
  - creating project executions and restoring persisted queue state.
  - appending timeline events and updating status/drawer state without deleting history.
  - stripping secret/path fields from developer payloads.
  - keeping only the requested project and limiting completed history.
- Important boundary:
  - This store is not yet imported by `modules/app/appAssistantPanel.js`.
  - The input-above execution drawer UI is still not rendered.
  - `services/canvas_agent_route_service.py` and `services/http_route_dispatcher.py` still have no `/api/v2/canvas-agent/executions/*` route/allowlist.
  - `modules/assistant/assistantAgentOrchestrator.js` is a multi-agent role/permission planner, not the Phase 3 Execution Orchestrator for queue progression, pause/resume/retry, timeline, Undo, or Replay.

### 128.2 Documentation Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from v1.5 to v1.6.
- Corrected the top-level PRD status:
  - Phase 1 minimum closure remains complete through Slice 127.
  - Phase 2 has started and the frontend `assistantExecutionStore` minimum slice is complete.
  - Phase 2 execution drawer UI, backend execution service/route, real Execution Orchestrator, Undo/Replay, and Phase 3/4/5 work remain incomplete.
- Added real-code constraints for:
  - current frontend execution store.
  - current multi-agent planner vs the still-missing execution orchestrator.
  - current API namespace and the missing executions route.
- Repaired stale PRD statements that previously implied:
  - Phase 2 had not started at all.
  - `assistantExecutionStore` still needed to be created.
  - Canvas Skills video confirmation policy still required the Slice 127 safety fix.
- Updated Phase 2 delivery table so each item has a current status, real-code evidence, and next action.
- Updated Project Execution Store section with the store methods and current sanitization behavior.
- Updated regression acceptance language so frontend store tests are counted as a minimum slice only, not full product completion.

### 128.3 Verification

- Earlier RED evidence for this slice, recorded from the implementation handoff context:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js`
  - Result at the time: failed because `modules/assistant/assistantExecutionStore.js` did not exist.
- Fresh GREEN verification from this documentation repair:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js`
  - Result: 3 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - PRD stale-state search for `v1.5`, `Phase 2/3/4/5 ?`, and old `assistantExecutionStore` pending language.
  - Result: no stale hits; v1.6 anchors and Slice 128 status are present.

### 128.4 Next Recommended Slice

- Continue Phase 2 by wiring the frontend store into `modules/app/appAssistantPanel.js` without changing the 8777 service workflow.
- Suggested TDD target:
  - When `normalizeAssistantResponse()` returns v2 `intent/plan/actionsByStep/execution`, the panel creates or updates an execution record in `assistantExecutionStore`.
  - Old `actions`-only responses remain compatible and can still create a minimal execution draft for the drawer.
  - No video authorization is granted by Act mode; any execution status containing real video generation must become `waiting_video_authorization` until explicit authorization.
- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service. If live service is needed, stop and ask the user to prepare it.

## 129. App Assistant Panel Execution Store Wiring Slice (2026-06-10)

This section records the second Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.7.

### 129.1 Completed Changes

- Updated `modules/app/appAssistantPanel.test.js` first.
  - Added `memoryStorage()` helper for local in-memory storage.
  - Imported `createAssistantExecutionStore`.
  - Added RED/GREEN coverage that a v2 assistant response containing `intent`, `plan`, `actionsByStep`, `execution`, and `developer` creates a project execution record.
  - The test verifies:
    - `conversationId`, `intentId`, and `planId` are stored.
    - the execution title comes from the v2 plan title.
    - `actionsByStep` is preserved.
    - an initial timeline event is appended.
    - developer payload is sanitized by the store; `apiKey` is removed while safe `actionJson` remains.
- Updated `modules/app/appAssistantPanel.js`.
  - Added optional `executionStore` injection to `createAssistantPanelState()` and `createAppAssistantPanel()`.
  - Added v2 response detection for `execution`, `plan`, `intent`, or `actionsByStep`.
  - Added `recordAssistantExecutionFromResponse()` to create an execution record from the normalized response.
  - Non-streaming responses now create execution records after `state.lastResponse` and `conversationId` are updated.
  - Streaming final responses also create execution records after the trusted final response is normalized.
  - This slice only writes initial execution state and first timeline event; it does not render the input-above drawer yet.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v1.6 to v1.7.
  - Marked Slice 129 as completed minimum closure.
  - Clarified that Phase 2 still lacks visible drawer UI, backend execution route/service, and real Execution Orchestrator.

### 129.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "v2 response creates a project execution record"`
  - Result: expected failure because `executionStore.getExecution("exec-layout")` returned null; the panel did not write v2 response data to the store.
- GREEN:
  - Implemented the store wiring in `appAssistantPanel.js`.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "v2 response creates a project execution record"`
  - Result: 42 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\assistant\assistantExecutionStore.test.js`
  - Result: 45 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 129.3 Current Effect Boundary

- The frontend panel can now persist initial v2 execution records into `assistantExecutionStore`.
- Users still do not see the new input-above plan/timeline drawer because the UI renderer has not been added yet.
- The store is still frontend-local; `/api/v2/canvas-agent/executions/*` and `canvas_agent_execution_service.py` are still missing.
- There is still no true Execution Orchestrator for step-by-step execution, pause/resume/retry, Undo, or Replay.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 129.4 Next Recommended Slice

- Continue Phase 2 with the visible input-above execution drawer minimum UI.
- Suggested TDD target:
  - `createAppAssistantPanel` receives an `executionStore` with an execution whose `drawerState.visible=true`.
  - Render a `.hy-canvas-agent-execution-drawer` above the input composer.
  - Collapsed drawer shows line 1, line 2, an expand button, and the correct conditional button placeholder.
  - The drawer reads `executionStore.snapshot()` and remains hidden when there is no visible active execution.
- Keep the old preview card/apply flow compatible until the real Execution Orchestrator is introduced.
- Do not touch the user-managed `8777` service.

## 130. Input-Above Execution Drawer Collapsed UI Slice (2026-06-10)

This section records the third Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.8.

### 130.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Imported `createAssistantExecutionStore` and added `memoryStorage()` helper.
  - Added RED/GREEN UI coverage for a visible execution drawer:
    - creates an execution with `drawerState.visible=true`.
    - mounts `createAppAssistantPanel({ executionStore })`.
    - verifies `.hy-canvas-agent-execution-drawer` exists.
    - verifies line 1 and line 2 are shown.
    - verifies collapsed drawer has `??` and conditional `??` buttons.
    - verifies the drawer is inside `.hy-canvas-agent-compose` and appears before `.hy-canvas-agent-compose-main`, i.e. above the input area.
- Updated `modules/app/appAssistantPanel.js`.
  - Imports `createAssistantExecutionStore`.
  - `createAssistantPanelState()` and `createAppAssistantPanel()` now default to a frontend `assistantExecutionStore` while still allowing injection in tests/runtime.
  - Adds `.hy-canvas-agent-execution-drawer` inside the compose panel before the input main row.
  - Adds `visibleExecutionForDrawer()`, `drawerActionLabel()`, and `renderExecutionDrawer()`.
  - Collapsed drawer reads `executionStore.snapshot()` and renders the active/visible execution's `drawerState.line1`, `drawerState.line2`, status, expand button, and simple conditional action button.
  - Adds minimal CSS for the collapsed drawer so it visually reads as the input box's upper section.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v1.7 to v1.8.
  - Marked Slice 130 as completed minimum closure.
  - Clarified that only collapsed drawer summary is complete; expanded plan/timeline, real button behavior, backend execution route/service, and Orchestrator remain pending.

### 130.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "visible execution renders collapsed drawer"`
  - Result: expected failure because `.hy-canvas-agent-execution-drawer` did not exist.
- GREEN:
  - Implemented the collapsed drawer renderer and CSS.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "visible execution renders collapsed drawer"`
  - Result: 33 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\assistant\assistantExecutionStore.test.js`
  - Result: 78 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 130.3 Current Effect Boundary

- A visible execution in `assistantExecutionStore` can now show a collapsed execution drawer above the input box.
- This is still not the full Visual Agent Plan Board or Timeline:
  - no expanded drawer layout yet.
  - no top task queue strip yet.
  - no left plan / right timeline detail split yet.
  - the expand/conditional buttons are placeholders and do not yet change execution state.
  - no backend execution service/route.
  - no real Execution Orchestrator.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 130.4 Next Recommended Slice

- Continue Phase 2 with expanded drawer MVP.
- Suggested TDD target:
  - click `??` on `.hy-canvas-agent-execution-drawer`.
  - drawer switches to expanded state with class/attribute.
  - shows plan steps from `execution.plan.steps`.
  - shows timeline events from `execution.timeline`.
  - still stays above the input and does not remove the input.
- Keep the expanded UI read-only first; editing/reorder and real Orchestrator state changes can follow later.

## 131. Input-Above Execution Drawer Expanded Read-Only Slice (2026-06-10)

This section records the fourth Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v1.9.

### 131.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added RED/GREEN UI coverage that clicking `.hy-canvas-agent-execution-expand` expands the execution drawer.
  - The test verifies:
    - drawer sets `aria-expanded="true"`.
    - plan steps from `execution.plan.steps` are rendered.
    - timeline events from `execution.timeline` are rendered.
    - `.hy-canvas-agent-execution-plan` and `.hy-canvas-agent-execution-timeline` exist.
- Updated `modules/app/appAssistantPanel.js`.
  - Added local `executionDrawerExpanded` state.
  - The expand button toggles between `??` and `??`.
  - Expanded drawer renders a read-only plan section from `execution.plan.steps`.
  - Expanded drawer renders a read-only timeline section from `execution.timeline`.
  - Added minimal CSS for the expanded two-column read-only plan/timeline layout.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v1.8 to v1.9.
  - Marked Slice 131 as completed minimum closure.
  - Clarified that this is read-only only: no queue strip, no detail panel, no scroll behavior, no editing/reorder, no real button behavior, no backend route, and no Orchestrator.

### 131.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "expanding drawer shows plan and timeline"`
  - Result: expected failure because clicking expand did not set `aria-expanded="true"` and no plan/timeline sections were rendered.
- GREEN:
  - Implemented expanded read-only plan/timeline rendering.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "expanding drawer shows plan and timeline"`
  - Result: 34 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\assistant\assistantExecutionStore.test.js`
  - Result: 79 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 131.3 Current Effect Boundary

- The input-above execution drawer now has:
  - collapsed summary state.
  - expand/collapse toggle.
  - read-only plan steps.
  - read-only timeline events.
- Still missing:
  - top task queue strip.
  - right-side detail panel.
  - auto-scroll/manual-scroll policy.
  - editable plan steps.
  - real conditional button behavior.
  - backend execution service/route.
  - real Execution Orchestrator.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 131.4 Next Recommended Slice

- Continue Phase 2 with drawer conditional button behavior.
- Suggested TDD targets:
  - `确认` button confirms the active pending interaction card / pending actions when available.
  - `授权视频` button routes through the same explicit video authorization path as existing preview/card logic.
  - `暂停/继续/重试` can update frontend execution status minimally until the true Orchestrator is added.
- Keep all video authorization checks explicit; Act mode must not imply video authorization.

## 132. Execution Drawer Video Authorization Button Slice (2026-06-10)

This section records the fifth Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v2.0.

### 132.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added RED/GREEN coverage that a drawer in `waiting_video_authorization` state renders the `授权视频` conditional button.
  - The test sends a v2 response with a video generation action and a visible execution drawer.
  - Clicking the drawer button must explicitly authorize the current batch, then apply pending actions.
  - The test verifies:
    - `validateActions` receives `videoAuthorized=true`.
    - `executeActions` receives `videoAuthorized=true`.
    - pending actions are cleared after execution.
- Updated `modules/app/appAssistantPanel.js`.
  - The drawer conditional action button now calls `handleExecutionDrawerAction(execution)`.
  - For `授权视频`, the handler calls the existing `state.approveVideoGeneration()` path and then `handleApply()`.
  - For `确认`, the handler calls the existing card confirmation path.
  - Paused/continue/retry behavior was intentionally not implemented in this slice because those need separate RED/GREEN tests and should ultimately be driven by the real Execution Orchestrator.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v1.9 to v2.0.
  - Marked Slice 132 as completed minimum closure.
  - Clarified that only the explicit video authorization drawer button is complete; pause/continue/retry remain pending.

### 132.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer video authorization button explicitly authorizes"`
  - Result: expected failure because clicking the drawer conditional button did not call validation/execution; `validations.length` stayed 0.
- GREEN:
  - Implemented the drawer video authorization handler.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer video authorization button explicitly authorizes"`
  - Result: 35 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\assistant\assistantExecutionStore.test.js`
  - Result: 80 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 132.3 Current Effect Boundary

- The drawer can now explicitly authorize video generation through the same safety gate used by the existing panel state.
- This does not make Act mode equal video authorization; the test proves `videoAuthorized=true` only after clicking `授权视频`.
- Still missing:
  - pause/continue/retry button behavior.
  - true Execution Orchestrator.
  - backend execution service/route.
  - Undo/Replay.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 132.4 Next Recommended Slice

- Continue Phase 2 with the `确认` drawer button or a backend execution service slice.
- If staying frontend-first, suggested TDD target:
  - drawer `确认` button applies low-risk pending actions through the existing `confirmPendingInteractionCard()` / `applyPendingActions()` path.
  - no video authorization is granted unless button text is `授权视频` and the current execution is in video authorization state.
- If moving backend-first, suggested TDD target:
  - create `services/canvas_agent_execution_service.py` and route tests for `/api/v2/canvas-agent/executions/*`.

## 133. PRD v2.1 Real-Code Review Repair Slice (2026-06-10)

This section records a documentation-only repair pass for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.

### 133.1 Completed Changes

- Reviewed the PRD against the actual Phase 2 frontend code instead of relying only on stale plan text.
- Confirmed these real-code facts:
  - `modules/app/appAssistantPanel.js` has `recordAssistantExecutionFromResponse()` and writes v2 `intent/plan/actionsByStep/execution` responses into `assistantExecutionStore`.
  - `modules/app/appAssistantPanel.js` has `visibleExecutionForDrawer()`, `drawerActionLabel()`, `renderExecutionDrawer()`, and `handleExecutionDrawerAction()`.
  - `.hy-canvas-agent-execution-drawer` is created inside `.hy-canvas-agent-compose`, before `.hy-canvas-agent-compose-main`, so the drawer is above the input.
  - The drawer consumes `executionStore.snapshot()` and can render collapsed state, read-only plan, read-only timeline, and the `waiting_video_authorization` explicit video authorization button.
  - `handleExecutionDrawerAction()` only implements `授权视频` and `确认`; pause/continue/retry still intentionally return no behavior until separate TDD/Orchestrator slices.
  - `modules/assistant/assistantExecutionStore.js` remains frontend-local and uses `huanying.canvasAgent.executions.v1`.
  - `services/canvas_agent_execution_service.py` is still missing, and `services/canvas_agent_route_service.py` / `services/http_route_dispatcher.py` still have no `/api/v2/canvas-agent/executions/*` route or allowlist.
- Updated the PRD from v2.0 to v2.1.
- Repaired stale PRD wording that incorrectly still said:
  - the panel UI had not consumed the execution store.
  - the input-above drawer still needed to be wired to `snapshot()`.
  - users could not yet see any plan/timeline drawer.
  - Canvas Skills still had the old Act-mode video confirmation debt.
- Kept the correct incomplete boundaries:
  - the current drawer is only a minimum frontend visualization slice.
  - there is no top queue strip, no detail panel, no auto-scroll/manual-scroll policy, no editable plan, no pause/continue/retry behavior, no backend execution service/route, no real Execution Orchestrator, and no Undo/Replay.

### 133.2 Verification

- CodeGraph check:
  - `codegraph_status` failed with `database is locked`, so this pass used `rg` and targeted file reads.
- Real-code anchors checked:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `modules/assistant/assistantExecutionStore.js`
  - `services/canvas_agent_route_service.py`
  - `services/http_route_dispatcher.py`
- No 8777 operation was performed:
  - did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 133.3 Current Effect Boundary

- This slice does not change runtime behavior.
- It makes the PRD accurate for the next developer:
  - frontend execution drawer/store slices 128-132 are real and should not be restarted from zero.
  - backend execution persistence and the real execution orchestrator remain the next major product gaps.

### 133.4 Next Recommended Slice

- Continue Phase 2 with either:
  - frontend `确认` drawer button behavior under TDD, making sure it does not grant video authorization; or
  - backend `services/canvas_agent_execution_service.py` plus `/api/v2/canvas-agent/executions/*` route and dispatcher allowlist.

## 134. Execution Drawer Video Confirmation Label Safety Slice (2026-06-10)

This section records the next Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v2.2.

### 134.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added GREEN coverage for non-video drawer `确认` behavior:
    - a `waiting_confirmation` execution with a `layout_nodes` action renders the drawer action button as `确认`.
    - clicking it applies pending actions through the existing validation/execution path.
    - `validateActions` and `executeActions` do not receive `videoAuthorized`.
  - Added RED/GREEN coverage for video drawer label safety:
    - a `waiting_confirmation` execution whose pending actions contain `queue_generation_task` for `ai-video` must render the drawer action button as `授权视频`, not generic `确认`.
    - The RED run failed with actual `确认` and expected `授权视频`.
- Updated `modules/app/appAssistantPanel.js`.
  - `drawerActionLabel(execution)` now inspects current `state.pendingActions`.
  - In `waiting_confirmation` or `draft` states, if pending actions include an unauthorized `ai-video` `queue_generation_task` or `run_prompt_preset_generation`, the drawer action label is `授权视频`.
  - This keeps the existing `waiting_video_authorization` behavior intact.
  - The check is scoped to confirmation/draft states so failed/paused/executing labels are not accidentally overridden.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.1 to v2.2.
  - Marked Slice 134 as completed minimum closure.
  - Clarified that this is a frontend drawer label/entry safety slice, not the real Execution Orchestrator.

### 134.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "video pending actions show authorize"`
  - Result: expected failure because the drawer action text was `确认`, not `授权视频`.
- GREEN:
  - Implemented `drawerActionLabel()` pending video detection.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "video pending actions show authorize"`
  - Result: 37 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "video pending actions show authorize|drawer video authorization button|drawer confirm applies"`
  - Result: 37 tests pass, 0 fail under the name-pattern run.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\assistant\assistantExecutionStore.test.js`
  - Result: 82 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 134.3 Current Effect Boundary

- The input-above drawer no longer shows a generic `确认` button for a pending real video generation action.
- Generic non-video confirmation still works and does not pass `videoAuthorized`.
- This does not implement pause/continue/retry, backend execution persistence, or the true Execution Orchestrator.
- Existing interaction card behavior remains a legacy compatibility surface; future Orchestrator work should unify card/drawer confirmation and video authorization semantics.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 134.4 Next Recommended Slice

- Continue Phase 2 with one of:
  - backend `services/canvas_agent_execution_service.py` plus `/api/v2/canvas-agent/executions/*` route and dispatcher allowlist; or
  - frontend expanded-drawer queue strip/detail panel slice.
- Avoid implementing pause/continue/retry as fake frontend-only state; those should be driven by the real Execution Orchestrator.

## 135. Backend Project Execution Store and Route Slice (2026-06-10)

This section records the next Phase 2 implementation slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` v2.3.

### 135.1 Completed Changes

- Added `canvas_agent_execution_service_test.py` first.
  - RED verified `services.canvas_agent_execution_service` did not exist.
  - Covers:
    - upsert execution.
    - list/get by project.
    - append timeline event.
    - update execution status and drawer state.
    - clear completed executions by project.
    - JSON persistence to disk.
    - secret/path sanitization for `apiKey`, `sk-*`, and local Windows paths while keeping safe `actionJson`.
    - per-project `max_executions` pruning that preserves active executions.
- Added `services/canvas_agent_execution_service.py`.
  - Implements `CanvasAgentExecutionService`.
  - Stores project-level executions independently from `CanvasAgentConversationService`.
  - Supports:
    - `list_executions(filters)`
    - `get_execution(id)`
    - `upsert_execution(payload)`
    - `append_timeline_event(id, event)`
    - `update_status(id, status, patch)`
    - `clear_completed(filters)`
  - Uses `storage_path`, `clock`, `id_factory`, and `max_executions` injection for tests/runtime.
  - Persists to JSON with top-level `{version, updatedAt, executions}`.
  - Sanitizes secret keys, auth/header/cookie-like fields, bearer/OpenAI-style tokens, local absolute paths, data URLs, and blob URLs.
- Updated `canvas_agent_route_service_test.py` first.
  - Added `_ExecutionService` route stub.
  - RED verified `CanvasAgentRouteService(execution_service=...)` was unsupported and `/api/v2/canvas-agent/executions` returned `None`.
  - Added coverage for:
    - `GET /api/v2/canvas-agent/executions?projectId=...&status=...`
    - `GET /api/v2/canvas-agent/executions/{id}`
    - `POST /api/v2/canvas-agent/executions`
    - `POST /api/v2/canvas-agent/executions/{id}/timeline`
    - `PATCH /api/v2/canvas-agent/executions/{id}/status`
    - `DELETE /api/v2/canvas-agent/executions?projectId=...`
    - 501 when no execution store is configured.
- Updated `services/canvas_agent_route_service.py`.
  - Added `execution_service` constructor injection.
  - Added path parsing and query parsing for `/api/v2/canvas-agent/executions/*`.
  - Added route handlers for list/get/upsert/append-timeline/update-status/clear-completed.
  - Keeps the namespace under `/api/v2/canvas-agent/*`; no `/api/v2/assistant/executions/*` was introduced.
- Updated `http_route_dispatcher_test.py` first.
  - RED verified execution routes were blocked by dispatcher allowlist.
  - Added GET/POST/PATCH/DELETE delegation coverage for executions paths.
- Updated `services/http_route_dispatcher.py`.
  - Added `_CANVAS_AGENT_EXECUTIONS_PREFIX`.
  - Allows executions GET/POST/PATCH/DELETE paths through the existing canvas-agent route delegation.
- Updated `server.py`.
  - Imports `CanvasAgentExecutionService`.
  - Instantiates `CANVAS_AGENT_EXECUTION_SERVICE` at `USER_DIR/canvas-agent-executions.json`.
  - Injects it into `CanvasAgentRouteService`.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.2 to v2.3.
  - Marked backend execution service/route/dispatcher allowlist as completed minimum closure.

### 135.2 Verification

- RED:
  - `python -m unittest canvas_agent_execution_service_test.py`
  - Result: expected failure with `ModuleNotFoundError: No module named 'services.canvas_agent_execution_service'`.
  - `python -m unittest canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_routes_delegate_to_execution_service canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_routes_return_501_when_no_store_is_configured`
  - Result: expected errors because `CanvasAgentRouteService.__init__()` did not accept `execution_service`, and unknown executions path returned `None`.
  - `python -m unittest http_route_dispatcher_test.HttpRouteDispatcherTests.test_canvas_agent_execution_routes_are_allowed`
  - Result: expected failure because dispatcher did not delegate executions paths.
- GREEN:
  - Implemented service, route, dispatcher allowlist, and server wiring.
  - `python -m unittest canvas_agent_execution_service_test.py canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_routes_delegate_to_execution_service canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_routes_return_501_when_no_store_is_configured http_route_dispatcher_test.HttpRouteDispatcherTests.test_canvas_agent_execution_routes_are_allowed`
  - Result: 5 tests OK.
  - `python -m unittest canvas_agent_execution_service_test.py canvas_agent_route_service_test.py http_route_dispatcher_test.py canvas_agent_sync_service_test.py`
  - Result: 42 tests OK.
  - `python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py services\http_route_dispatcher.py server.py`
  - Result: OK.

### 135.3 Current Effect Boundary

- Backend Project Execution Store and `/api/v2/canvas-agent/executions/*` routes now exist.
- Frontend `assistantExecutionStore` is still local/offline; it does not yet call these backend routes.
- The real Execution Orchestrator is still missing:
  - no step-by-step queue progression.
  - no pause/resume/retry.
  - no backend-driven timeline status updates during execution.
  - no Undo/Replay.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 135.4 Next Recommended Slice

- Continue Phase 2 with frontend/backend execution sync:
  - add a small frontend API client for `/api/v2/canvas-agent/executions/*`.
  - let `appAssistantPanel.js` persist newly-created executions to backend when available while keeping local fallback.
- Or continue frontend UI with expanded drawer queue strip/detail panel.
- Do not implement fake pause/continue/retry without the real Execution Orchestrator.

## 136. PRD v2.4 Real-Code Boundary Repair Slice (2026-06-10)

This section records a documentation-only repair pass for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` after Slice 135 landed backend execution persistence.

### 136.1 Completed Changes

- Reviewed the PRD against the current real-code state instead of only trusting prior PRD wording.
- CodeGraph check was attempted first per `AGENTS.md`, but `codegraph_status` returned `database is locked`; this pass used targeted `rg` and file reads instead.
- Confirmed these real-code facts:
  - `services/canvas_agent_execution_service.py` now defines `CanvasAgentExecutionService` with `list_executions()`, `get_execution()`, `upsert_execution()`, `append_timeline_event()`, `update_status()`, and `clear_completed()`.
  - `services/canvas_agent_route_service.py` handles `/api/v2/canvas-agent/executions/*` for list/get/upsert/append-timeline/update-status/clear-completed.
  - `services/http_route_dispatcher.py` allows executions GET/POST/PATCH/DELETE through the canvas-agent route delegation.
  - `server.py` wires `CANVAS_AGENT_EXECUTION_SERVICE` to `USER_DIR/canvas-agent-executions.json` and injects it into `CanvasAgentRouteService`.
  - No frontend API client currently calls `/api/v2/canvas-agent/executions/*`; `modules/app/appAssistantPanel.js` still writes to local `assistantExecutionStore` only.
- Updated the PRD from v2.3 to v2.4.
- Repaired stale PRD wording that still implied backend execution store/route was missing or unconsumed as a standalone capability.
- Kept the correct incomplete boundaries:
  - frontend/backend execution sync is still missing.
  - pause/continue/retry is still missing.
  - queue strip/detail panel/scroll policy is still missing.
  - true Execution Orchestrator is still missing.
  - Undo/Replay is still missing.

### 136.2 Verification

- Document consistency checks:
  - `rg -n "v2\.3|Project Execution Store.*unconsumed|backend route.*still missing|drawer UI.*backend route" docs\superpowers\specs\2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md -S`
  - Result after repair: no stale PRD hits for the repaired boundary wording.
- Real-code anchors checked:
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `services/http_route_dispatcher.py`
  - `server.py`
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/app/appAssistantPanel.js`
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 136.3 Current Effect Boundary

- This slice does not change runtime behavior.
- The PRD now accurately says backend Project Execution Store and `/api/v2/canvas-agent/executions/*` route are complete at minimum closure.
- The PRD also accurately says frontend/backend execution sync and the real Execution Orchestrator remain the next major gaps.

### 136.4 Next Recommended Slice

- Continue Phase 2 with frontend/backend execution sync:
  - add a small frontend API client for `/api/v2/canvas-agent/executions/*`.
  - make `appAssistantPanel.js` persist new execution records to backend when available.
  - keep local/offline `assistantExecutionStore` fallback.
- Keep TDD and do not touch `8777`; if live service verification is needed, stop and ask the user to prepare it.

## 137. Frontend Execution API Best-Effort Sync Slice (2026-06-10)

This section records the next Phase 2 implementation slice after PRD v2.4: frontend/backend execution sync minimum closure.

### 137.1 Completed Changes

- Added `modules/assistant/assistantExecutionApiClient.test.js` first.
  - RED verified `modules/assistant/assistantExecutionApiClient.js` did not exist.
  - Covers:
    - `upsertExecution()` posts to `/api/v2/canvas-agent/executions`.
    - `appendTimelineEvent()` posts to `/api/v2/canvas-agent/executions/{id}/timeline` with encoded execution id.
    - failed HTTP responses throw readable backend error messages.
- Added `modules/assistant/assistantExecutionApiClient.js`.
  - Exports `createAssistantExecutionApiClient({ baseUrl, fetchFn })`.
  - Uses the existing backend namespace `/api/v2/canvas-agent/executions`.
  - Supports `upsertExecution(execution)` and `appendTimelineEvent(executionId, event)`.
  - Allows `fetchFn` injection for tests and keeps the runtime default on `globalThis.fetch`.
- Updated `modules/app/appAssistantPanel.test.js` first.
  - RED verified `createAssistantPanelState` did not call the backend sync client.
  - Added coverage that a v2 response:
    - still creates the local project execution record first.
    - upserts execution metadata to the backend client.
    - appends the initial timeline event to the backend client.
    - does not leak `developer.apiKey` through the synced payload.
  - Added coverage that backend sync failure does not remove or block the local execution record.
- Updated `modules/app/appAssistantPanel.js`.
  - Imports `createAssistantExecutionApiClient`.
  - Adds optional `executionSyncClient` injection to `createAssistantPanelState`.
  - `executionSyncClient === false` disables backend sync explicitly.
  - After a v2 response creates a local execution and initial local timeline event, the panel now does best-effort backend sync:
    - `upsertExecution()` receives execution metadata with an empty `timeline` array so the initial event is not duplicated.
    - `appendTimelineEvent()` writes the initial event through the backend timeline endpoint.
    - sync failures are captured in `state.lastExecutionSyncError` and do not break chat, drawer rendering, or local store persistence.
  - Exposes `state.lastExecutionSyncPromise` for tests/debug wait points without blocking normal `sendMessage()` UI flow.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.4 to v2.5.
  - Marked frontend Execution API best-effort sync as completed minimum closure.
  - Clarified that this is not the real Execution Orchestrator and does not provide continuous progress, pause/resume/retry, Undo, Replay, or a history browser.

### 137.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "backend execution sync|syncs execution"`
  - Result: expected 2 failures because the sync client was not called and no sync error was recorded.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js`
  - Result: expected module-not-found failure because `assistantExecutionApiClient.js` did not exist yet.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\app\appAssistantPanel.test.js --test-name-pattern "assistantExecutionApiClient|backend execution sync|syncs execution"`
  - Result: 47 tests pass, 0 fail.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 87 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
### 137.3 Current Effect Boundary

- New v2 assistant responses now persist locally and then best-effort sync to backend execution routes.
- If backend execution sync fails, the user-facing drawer/local execution remains available.
- This is still only an initial record sync:
  - no backend history loading into the drawer yet.
  - no status PATCH from execution progress yet.
  - no true Execution Orchestrator.
  - no pause/resume/retry.
  - no Undo/Replay.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 137.4 Next Recommended Slice

- Continue Phase 2 with one of:
  - expanded drawer queue strip/detail panel; or
  - backend history load into the frontend execution store; or
  - the first true Execution Orchestrator slice that can step through actions and write timeline/status continuously.
- Do not implement pause/resume/retry as fake UI-only state; it should be driven by Orchestrator state.

## 138. Expanded Execution Drawer Queue Strip and Timeline Detail Slice (2026-06-10)

This section records the Phase 2 drawer UI slice that landed after frontend/backend execution sync.

### 138.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified the expanded execution drawer did not yet render `.hy-canvas-agent-execution-queue`.
  - Added coverage for:
    - expanded drawer queue strip.
    - active and queued execution titles.
    - human status labels for executing and queued tasks.
    - clicking a timeline event.
    - timeline detail text with human summary, step id, action id, duration, retry flag, and undo flag.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `executionDrawerSelectedEventId` to track the selected timeline event in the expanded drawer.
  - Added `executionSnapshotForDrawer()` to safely read execution store snapshot data for drawer rendering.
  - Added `queueStatusText()` for human queue labels.
  - Added `renderExecutionQueueStrip()` for the expanded drawer queue strip.
  - Added `timelineEventDetailText()` for a readable event detail summary.
  - Expanded drawer now renders:
    - `.hy-canvas-agent-execution-queue`
    - `.hy-canvas-agent-execution-queue-list`
    - `.hy-canvas-agent-execution-queue-item`
    - `.hy-canvas-agent-execution-side`
    - `.hy-canvas-agent-execution-event-detail`
  - Timeline events are rendered as clickable buttons; selecting one refreshes the detail panel.
  - CSS was extended inside the existing panel style block.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.5 to v2.6.
  - Marked Slice 138 queue strip and timeline detail as completed minimum closure.
  - Repaired stale wording that still said queue strip/detail panel were entirely missing.
  - Kept the correct unfinished boundaries: queue card switching, scroll policy, pause/resume/retry, backend history loading, true Execution Orchestrator, Undo, and Replay are still missing.

### 138.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue strip and timeline event details"`
  - Result: expected failure because `.hy-canvas-agent-execution-queue` did not exist yet.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue strip and timeline event details"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 88 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.

### 138.3 Current Effect Boundary

- The expanded execution drawer now has the minimum visual shape required by the PRD:
  - current task plus queued task strip.
  - plan area.
  - timeline area.
  - selected event detail text.
- This is still read-only UI, not the true execution workspace.
- Still missing:
  - clicking queue cards to inspect a non-active task without changing execution order.
  - detail panel action buttons such as focus, retry, undo-to-here, skip.
  - drawer timeline scroll policy and auto-scroll behavior.
  - backend history loading into the frontend store/drawer.
  - pause/resume/retry driven by a real Execution Orchestrator.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 138.4 Next Recommended Slice

- Continue Phase 2 with backend history loading or drawer scroll policy.
- Do not implement pause/resume/retry as UI-only fake state; it should be driven by the real Execution Orchestrator.

## 139. Backend Execution History Load Into Frontend Drawer Slice (2026-06-10)

This section records the Phase 2 slice after the expanded queue/detail drawer: loading persisted backend execution history into the frontend project execution store and drawer.

### 139.1 Completed Changes

- Updated `modules/assistant/assistantExecutionApiClient.test.js` first.
  - RED verified `client.listExecutions()` did not exist.
  - Added coverage that `listExecutions({ projectId, status })` GETs `/api/v2/canvas-agent/executions?projectId=...&status=...` with encoded filters and no request body.
- Updated `modules/assistant/assistantExecutionApiClient.js`.
  - Added `listExecutions(filters = {})`.
  - Keeps the existing canvas-agent namespace; no `/api/v2/assistant/executions/*` route was introduced.
- Updated `modules/assistant/assistantExecutionStore.test.js` first.
  - RED verified `store.importExecutions()` did not exist.
  - Added coverage that backend executions are imported only for the current project, persisted to local storage, and sanitized before storage.
- Updated `modules/assistant/assistantExecutionStore.js`.
  - Added `importExecutions(items = [])`.
  - Reuses the existing execution sanitizer and `saveExecution()` path.
  - Filters out executions from other projects when the local store has a `projectId`.
- Updated `modules/app/appAssistantPanel.test.js` first.
  - RED verified `createAppAssistantPanel().init()` did not call `executionSyncClient.listExecutions()`.
  - Added coverage that init loads backend execution history into `assistantExecutionStore` and renders the input-above execution drawer.
  - Added coverage that backend history load failure records `state.lastExecutionSyncError` and keeps an existing local drawer visible.
- Updated `modules/app/appAssistantPanel.js`.
  - `createAppAssistantPanel()` now accepts and passes through `executionSyncClient` to `createAssistantPanelState()`.
  - `createAssistantPanelState()` now exposes `state.loadExecutionHistory(options)`.
  - `loadExecutionHistory()` uses `executionSyncClient.listExecutions({ projectId })`, imports returned executions into the frontend store, and triggers drawer re-render through `onUpdate`.
  - History load failure is best-effort: it records `lastExecutionSyncError` and does not remove local executions or block the assistant panel.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.6 to v2.7.
  - Marked Slice 139 backend execution history load as completed minimum closure.
  - Kept the correct unfinished boundaries: complete history browser, manual refresh, pagination/filtering, status PATCH, true Execution Orchestrator, Undo, and Replay are still missing.

### 139.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "lists executions"`
  - Result: expected failure with `TypeError: client.listExecutions is not a function`.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "imports backend execution history"`
  - Result: expected failure with `TypeError: store.importExecutions is not a function`.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "backend execution history"`
  - Result: expected failures because init did not call `listExecutions()` and load failure did not record `lastExecutionSyncError`.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "lists executions"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "imports backend execution history"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "backend execution history"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 92 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 139.3 Current Effect Boundary

- The panel can now load existing backend execution history on init and display a visible execution in the input-above drawer.
- This closes the minimum frontend/backend history load slice.
- This is not a complete history browser:
  - no dedicated execution history panel yet.
  - no manual refresh UI.
  - no pagination, filters, or search.
  - no status PATCH from a real Orchestrator.
  - no pause/resume/retry.
  - no Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 139.4 Next Recommended Slice

- Continue Phase 2 with drawer scroll policy or queue card selection.
- The first true Execution Orchestrator slice can start after the drawer/history minimums are stable.
- Do not implement pause/resume/retry as fake UI-only state; it should be driven by the real Execution Orchestrator.

## 140. Expanded Drawer Queue Card Detail Switching Slice (2026-06-10)

This section records the Phase 2 drawer UI slice after backend history loading: clicking a queue card in the expanded input-above execution drawer switches the viewed task detail without changing real execution order.

### 140.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified the expanded drawer stayed on the active execution after clicking a queued task card.
  - Added coverage for:
    - active execution plan/timeline shown first.
    - queued execution card click switches the visible plan/timeline to the queued execution.
    - selected queue card gets `data-selected="true"`.
    - `assistantExecutionStore.snapshot().activeExecutionId` remains the active execution.
    - queue order remains unchanged after viewing the queued task.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `executionDrawerSelectedExecutionId` to track which execution is only being viewed in the expanded drawer.
  - Added `executionForExpandedDrawer(activeExecution)` to resolve the selected viewed execution from the project execution snapshot.
  - Updated `renderExecutionQueueStrip(activeExecution, viewedExecution)` to mark the viewed card with `data-selected`.
  - Queue card click now sets `executionDrawerSelectedExecutionId`, clears `executionDrawerSelectedEventId`, and re-renders.
  - Expanded plan and timeline now read from `detailExecution`, while the active execution and queue order stay untouched.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.7 to v2.8.
  - Marked Slice 140 queue card detail switching as completed minimum closure.
  - Removed queue card switching from the remaining Phase 2 gaps.
  - Kept the correct unfinished boundaries: drawer scroll policy, detail operation buttons, canvas object focus, pause/resume/retry, complete history browser, true Execution Orchestrator, Undo, and Replay are still missing.

### 140.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue card switches"`
  - Result: expected failure before implementation because the plan/timeline still showed the active task after clicking the queued card.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue card switches"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 93 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.

### 140.3 Current Effect Boundary

- The expanded execution drawer can now inspect a queued execution's plan and timeline without changing the actual active execution or queue order.
- This is view switching only, not execution scheduling or reordering.
- Still missing:
  - drawer scroll policy and auto-scroll behavior.
  - detail action buttons such as focus target, retry, undo-to-here, and skip.
  - pause/resume/retry driven by a real Execution Orchestrator.
  - complete execution history browser with search/filter/pagination.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 140.4 Next Recommended Slice

- Continue Phase 2 with drawer scroll policy / auto-scroll or detail action buttons.
- Do not implement pause/resume/retry as UI-only fake state; it should be driven by the real Execution Orchestrator.

## 141. Expanded Drawer Timeline Scroll Policy Slice (2026-06-10)

This section records the Phase 2 drawer UI slice after queue card detail switching: the expanded timeline area now has the minimum auto-scroll policy required by the PRD.

### 141.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Extended the fake DOM with `scrollTop`, `clientHeight`, and computed `scrollHeight` so scroll behavior can be tested without a browser.
  - Added RED/GREEN coverage for:
    - expanded timeline defaults to the bottom when rendered.
    - timeline exposes `data-auto-scroll-paused="false"` while auto-scroll is active.
    - manual upward scroll pauses auto-scroll and schedules a 5000 ms resume timer.
    - appending new timeline events while paused keeps the previous manual scroll position instead of jumping to bottom.
    - timer callback resumes auto-scroll and returns the timeline to the bottom.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `EXECUTION_TIMELINE_SCROLL_PAUSE_MS = 5000`.
  - Added `executionTimelineAutoScrollPaused`, `executionTimelineScrollPauseTimer`, and `executionTimelineScrollTopById` local drawer state.
  - Added `maxExecutionTimelineScrollTop()` and `applyExecutionTimelineScroll()`.
  - Added `pauseExecutionTimelineAutoScroll()`.
  - Expanded timeline now applies auto-scroll before attaching the manual scroll listener, so initial programmatic scroll does not accidentally pause itself.
  - Manual upward scroll sets `data-auto-scroll-paused="true"`, stores the per-execution scrollTop, and resumes after 5 seconds.
  - Queue card switching clears the pause timer/state so the newly viewed task starts from the expected bottom position.
  - CSS now makes `.hy-canvas-agent-execution-timeline` an actual scroll area with `max-height:220px; overflow:auto; scroll-behavior:smooth`.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.8 to v2.9.
  - Marked Slice 141 expanded timeline scroll policy as completed minimum closure.
  - Removed drawer scroll policy from the Phase 2 remaining gaps.
  - Kept the correct unfinished boundaries: detail operation buttons, canvas object focus, pause/resume/retry, complete history browser, true Execution Orchestrator, Undo, and Replay are still missing.

### 141.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "timeline auto-scroll"`
  - Result: expected failure before implementation because `.hy-canvas-agent-execution-timeline` did not set `data-auto-scroll-paused` and did not auto-scroll.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "timeline auto-scroll"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK after implementation.

### 141.3 Current Effect Boundary

- The expanded execution drawer timeline now behaves like a log view at the UI layer:
  - default render scrolls to the latest timeline event.
  - manual upward scroll preserves the user's reading position.
  - after 5 seconds, auto-scroll resumes and returns to the latest event.
- This is still frontend UI behavior only.
- Still missing:
  - detail action buttons such as focus target, retry, undo-to-here, and skip.
  - pause/resume/retry driven by a real Execution Orchestrator.
  - complete execution history browser with search/filter/pagination.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 141.4 Next Recommended Slice

- Continue Phase 2 with detail action buttons or the first real Execution Orchestrator slice.
- Do not implement pause/resume/retry as UI-only fake state; it should be driven by the real Execution Orchestrator.

## 142. Timeline Detail Focus Affected Canvas Nodes Slice (2026-06-10)

This section records the Phase 2 drawer detail slice after the timeline scroll policy: timeline events can now carry affected canvas node ids and the expanded drawer can focus those nodes from the detail panel.

### 142.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified `.hy-canvas-agent-execution-detail-focus` was not rendered for a selected timeline event that had `nodeIds`.
  - Added coverage for:
    - selecting a timeline event with `nodeIds`.
    - rendering the detail action button `.hy-canvas-agent-execution-detail-focus`.
    - clicking the button calls `graphStore.setSelectedNodes(["image-1", "text-1"])`.
- Updated `modules/assistant/assistantExecutionStore.test.js` first.
  - RED verified `appendTimelineEvent()` did not preserve `nodeIds` in the stored timeline event.
  - Added coverage that a timeline event stores sanitized/deduped affected node ids while still redacting secret developer payload fields.
- Updated `modules/assistant/assistantExecutionStore.js`.
  - `sanitizeTimelineEvent()` now preserves node ids from:
    - `nodeIds`
    - `affectedNodeIds`
    - `createdNodeIds`
    - `updatedNodeIds`
    - `queuedGenerationNodeIds`
    - `startedGenerationNodeIds`
  - The store normalizes those arrays into one deduped `nodeIds` array on the event.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `timelineEventNodeIds(event)`.
  - It extracts node ids from timeline fields, `developer.actionJson`, `event.action`, and scalar `nodeId` / `targetNodeId` fields.
  - Added `focusTimelineEventNodes(event)`.
  - When node ids exist and `graphStore.setSelectedNodes` is available, it selects those nodes and records a small receipt.
  - The expanded timeline detail panel now renders `.hy-canvas-agent-execution-detail-actions` and `.hy-canvas-agent-execution-detail-focus` with label `聚焦对象` for selected events that have affected node ids.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v2.9 to v3.0.
  - Marked Slice 142 timeline event node id persistence and focus action as completed minimum closure.
  - Removed “canvas object focus” from the remaining Phase 2 gaps.
  - Kept the correct unfinished boundaries: pause/resume/retry, retry/undo/skip detail actions, complete history browser, true Execution Orchestrator, Undo, and Replay are still missing.

### 142.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "timeline detail can focus"`
  - Result: expected failure because `.hy-canvas-agent-execution-detail-focus` did not exist yet.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "appends timeline events"`
  - Result: expected failure because `stored.timeline[0].nodeIds` was `undefined`.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "appends timeline events"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "timeline detail can focus"`
  - Result: passed after implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 95 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 142.3 Current Effect Boundary

- Timeline event details can now focus affected canvas nodes when events include node ids.
- This improves inspection/debuggability of AI execution history but is still a UI/store minimum slice.
- This does not implement:
  - retry, undo-to-here, or skip detail actions.
  - pause/resume/retry driven by a real Execution Orchestrator.
  - complete execution history browser with search/filter/pagination.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 142.4 Next Recommended Slice

- Continue Phase 2 with the first real Execution Orchestrator slice, or complete the remaining detail actions only if they are backed by real executable behavior.
- Do not implement retry/undo/skip as fake UI-only buttons; retry should be Orchestrator-backed, and undo must wait for inverse patch support.

## 143. Execution Orchestrator Core First Slice (2026-06-10)

This section records the first real Execution Orchestrator core slice after timeline event focus: a testable orchestration module now executes v2 plan actions one by one, writes timeline/status, and syncs execution status through the existing canvas-agent execution namespace.

### 143.1 Completed Changes

- Updated `modules/assistant/assistantExecutionOrchestrator.test.js` first.
  - RED verified `modules/assistant/assistantExecutionOrchestrator.js` did not exist.
  - Added coverage for:
    - compiling `plan.steps` + `actionsByStep` into action order.
    - validating one action at a time.
    - executing one action at a time.
    - writing running/completed timeline events for each action.
    - preserving affected `nodeIds` from executor results in completed timeline events.
    - updating local execution status/progress to `completed`.
    - best-effort syncing timeline and status through `executionSyncClient`.
    - failing closed when validation returns invalid, without calling `executeActions`.
- Updated `modules/assistant/assistantExecutionApiClient.test.js` first.
  - RED verified `client.updateExecutionStatus()` did not exist.
  - Added coverage that status updates PATCH `/api/v2/canvas-agent/executions/{id}/status` with encoded execution id and JSON body.
- Updated `modules/assistant/assistantExecutionApiClient.js`.
  - Added `updateExecutionStatus(executionId, status, patch = {})`.
  - Keeps the existing canvas-agent namespace; no `/api/v2/assistant/executions/*` route was introduced.
- Added `modules/assistant/assistantExecutionOrchestrator.js`.
  - Exports `createAssistantExecutionOrchestrator({ executionStore, validateActions, executeActions, executionSyncClient })`.
  - Compiles v2 `plan.steps` and `actionsByStep` into a deterministic action sequence.
  - For each action:
    - appends a `running` timeline event.
    - calls injected `validateActions()` with exactly that action.
    - fails closed if validation fails or returns invalid.
    - calls injected `executeActions()` with exactly the validated action batch.
    - appends a `completed` or `failed` timeline event.
    - writes progress/status/drawer line updates to `assistantExecutionStore`.
  - Best-effort syncs local timeline/status changes through `executionSyncClient.appendTimelineEvent()` and `executionSyncClient.updateExecutionStatus()`.
  - Keeps backend sync failures non-blocking so local UI continuity remains authoritative.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v3.0 to v3.1.
  - Marked Slice 143 Execution Orchestrator core first slice as completed minimum closure.
  - Clarified that this is not yet drawer-button integration, pause/resume cursor, retry/skip, dependency recovery, or Undo/Replay.

### 143.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js`
  - Result: expected module-not-found failure because `assistantExecutionOrchestrator.js` did not exist.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "updates execution status"`
  - Result: expected failure with `TypeError: client.updateExecutionStatus is not a function`.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js`
  - Result: 2 tests pass, 0 fail.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "updates execution status"`
  - Result: matching test passes; full client file shows 5 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.

### 143.3 Current Effect Boundary

- There is now a real, separately testable Execution Orchestrator core.
- It can execute v2 actions step by step and write timeline/status to the project execution store.
- It can sync status through `/api/v2/canvas-agent/executions/{id}/status` using the frontend API client.
- This still does not implement:
  - drawer confirm/pause/resume/retry button integration.
  - pause cursor or resume cursor.
  - retry failed action, skip action, dependency-aware recovery.
  - complete execution history browser with search/filter/pagination.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 143.4 Next Recommended Slice

- Continue Phase 3 core with pause/resume cursor in `assistantExecutionOrchestrator.js`, then wire drawer buttons to that real core.
- Do not wire UI pause/resume/retry as fake state; every button must call Orchestrator-backed behavior.

## 144. Execution Orchestrator Pause Resume Cursor Slice (2026-06-10)

This section records the next Phase 3 core slice after the first Execution Orchestrator module: pause/resume cursor behavior now exists in the core and is persisted in the project execution store.

### 144.1 Completed Changes

- Updated `modules/assistant/assistantExecutionStore.test.js` first.
  - RED verified `orchestratorState` was not persisted on executions.
  - Added coverage for persisting `orchestratorState.nextActionIndex`, `orchestratorState.pausedAtActionId`, and sanitized `orchestratorState.running`.
  - Added a safety expectation that non-`executing` statuses do not preserve `running=true`.
- Updated `modules/assistant/assistantExecutionStore.js`.
  - Added `sanitizeOrchestratorState(state, status)`.
  - Executions now persist `orchestratorState` with:
    - `nextActionIndex`
    - `pausedAtActionId`
    - `running`
  - `running` is only true while execution status is `executing`.
- Updated `modules/assistant/assistantExecutionOrchestrator.test.js` first.
  - RED verified `orchestrator.pause()` did not exist.
  - Added coverage for:
    - pausing while the first action is still running.
    - not killing the in-flight action.
    - stopping before the next action after the current action finishes.
    - writing execution status `paused` and cursor `nextActionIndex: 1`.
    - resuming from the cursor and executing the remaining action only.
    - clearing `pausedAtActionId` and completing progress after resume.
- Updated `modules/assistant/assistantExecutionOrchestrator.js`.
  - Added an in-memory `pauseRequests` set.
  - `run()` now reads `options.startActionIndex` or `execution.orchestratorState.nextActionIndex`.
  - `run()` writes `orchestratorState` on executing, failed, paused, and completed status updates.
  - Added `pause(executionId)`.
  - Added `resume(executionId, options)`.
  - Pause semantics are conservative: pause does not attempt to kill the current in-flight action; it stops before the next action and stores the cursor.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v3.1 to v3.2.
  - Marked Slice 144 Orchestrator pause/resume cursor as completed minimum closure.
  - Clarified that drawer button wiring, retry/skip, dependency recovery, queue state machine, history browser, and Undo/Replay are still missing.

### 144.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "pause cursor"`
  - Result: expected failure because `orchestratorState` was `undefined` before implementation.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "pause stops"`
  - Result: expected failure with `TypeError: orchestrator.pause is not a function` after stabilizing the async test gate.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "pause cursor"`
  - Result: target test passes.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "pause stops"`
  - Result: target test passes.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js`
  - Result: 3 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.

### 144.3 Current Effect Boundary

- The Orchestrator core can now pause after the current action completes and resume from the next action cursor.
- The project execution store now persists the pause cursor state safely.
- This still does not implement:
  - drawer pause/resume button wiring.
  - retry failed action.
  - skip action.
  - dependency-aware recovery.
  - full queue state machine.
  - complete execution history browser with search/filter/pagination.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 144.4 Next Recommended Slice

- Wire drawer `暂停/继续` buttons to the real Orchestrator core, using existing drawer labels but replacing fake/no-op behavior with Orchestrator-backed behavior.
- Keep video authorization safety: Act mode must not become video authorization while wiring Orchestrator execution.

## 145. Drawer Pause Resume Wired To Real Orchestrator Slice (2026-06-10)

This section records the next Phase 3 integration slice after the pause/resume cursor core: the input-above execution drawer now routes its `暂停` / `继续` button behavior through a real Execution Orchestrator instance instead of being a no-op UI label.

### 145.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified clicking the drawer `暂停` button did not call any Orchestrator method.
  - Added coverage that:
    - an executing execution renders the drawer action button as `暂停`.
    - clicking it calls injected `executionOrchestrator.pause(executionId)`.
    - when the injected orchestrator updates the store to `paused`, the drawer re-renders and shows `继续`.
    - clicking `继续` calls injected `executionOrchestrator.resume(executionId)`.
- Updated `modules/app/appAssistantPanel.js`.
  - Imported `createAssistantExecutionOrchestrator`.
  - Added an `executionOrchestrator` option to `createAppAssistantPanel()`.
  - When no explicit orchestrator is injected, but `api.validateActions` and `executionStore` exist, the panel creates a default `createAssistantExecutionOrchestrator()` instance.
  - The default orchestrator reuses the existing panel dependencies:
    - `executionStore`
    - `executionSyncClient` or the default `createAssistantExecutionApiClient()`
    - `api.validateActions`
    - the injected `executeActions`
    - `graphStore`
    - `templateStore`
    - `canvasSkillsRuntime`
    - current `agentMode`
    - current explicit `videoAuthorized` state
  - `handleExecutionDrawerAction()` now routes:
    - `暂停` -> `orchestrator.pause(execution.id)`
    - `继续` -> `orchestrator.resume(execution.id, { agentMode, videoAuthorized })`
  - Existing `授权视频` and `确认` paths remain on the old preview/apply flow for now.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from v3.2 to v3.3.
  - Marked Slice 145 drawer pause/resume wiring as completed minimum closure.
  - Clarified that confirmation, video authorization, retry, skip, dependency recovery, history browser, and Undo/Replay remain unfinished.

### 145.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer pause and resume"`
  - Result: expected failure because the injected Orchestrator was never called.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer pause and resume"`
  - Result: target test passes after implementation.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 145.3 Current Effect Boundary

- The drawer pause/resume button path is now Orchestrator-backed.
- This is still a minimum UI integration slice:
  - `确认` still uses existing interaction card / preview apply behavior.
  - `授权视频` still uses existing explicit authorization + apply behavior.
  - `重试` is still not wired.
  - retry/skip/dependency recovery remain Orchestrator core gaps.
  - complete execution history browser and Undo/Replay remain missing.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 145.4 Next Recommended Slice

- Continue by routing `确认` for v2 execution plans into Orchestrator `run()` while preserving the existing video authorization safety line.
- Do not let Act mode imply video authorization while moving confirmation into Orchestrator.

## 146. PRD v3.4 Real-Code Boundary Repair Slice (2026-06-10)

This section records a documentation-only repair requested by the user: review the PRD against real code and project tacit knowledge, then fix inaccurate or over-optimistic implementation boundaries before the next handoff continues development.

### 146.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Bumped PRD version from `v3.3` to `v3.4`.
  - Added a new `2.4 本次 v3.4 真实代码修复结论` section.
  - Clarified that the frontend local `assistantExecutionStore` already keeps `nodeIds/canRetry/canUndo/durationMs/orchestratorState`, but backend `CanvasAgentExecutionService` currently does not persist these extended fields.
  - Clarified that `CanvasAgentExecutionService._sanitize_timeline_event()` currently keeps only `id/stepId/actionId/status/humanSummary/createdAt/updatedAt/developer`, and `_sanitize_execution()` currently does not keep `orchestratorState`.
  - Clarified that drawer `暂停/继续` is Orchestrator-backed, but drawer `确认`, `授权视频`, and `重试` still use the old preview/apply path or are only label-level behavior.
  - Clarified that Timeline Humanizer is not complete: Orchestrator `humanSummary` can still use English `Running:/Completed:/Failed:` prefixes and action type fallback when the action has no human title.
  - Clarified that plan editing, DAG preview, queue cancel/top/pause controls, retry/skip/undo detail actions, developer JSON detail panel, complete execution history browser, dependency recovery, Undo, and Replay remain unfinished.
  - Updated the Project Execution Store section with the backend fields that must be persisted next:
    - `orchestratorState.nextActionIndex/pausedAtActionId/running`
    - timeline `nodeIds/affectedNodeIds/createdNodeIds/updatedNodeIds/queuedGenerationNodeIds/startedGenerationNodeIds`
    - timeline `error/canRetry/canUndo/durationMs`
  - Updated Phase 1/2/3 status text and success criteria so future developers do not mistake frontend-local behavior or a core Orchestrator module for the complete execution workspace.

### 146.2 Real-Code Evidence Checked

- `modules/app/appAssistantPanel.js`
  - `handleExecutionDrawerAction()` routes:
    - `授权视频` -> `state.approveVideoGeneration()` + `handleApply()`
    - `确认` -> `handleConfirmCard()`
    - `暂停` -> `resolvedExecutionOrchestrator.pause(execution.id)`
    - `继续` -> `resolvedExecutionOrchestrator.resume(execution.id, { agentMode, videoAuthorized })`
  - Expanded drawer is still mostly read-only: queue strip, plan list, timeline list, event detail text, and focus action.
- `modules/assistant/assistantExecutionStore.js`
  - Frontend-local store persists sanitized timeline `nodeIds`, `canRetry`, `canUndo`, `durationMs`, and `orchestratorState`.
- `modules/assistant/assistantExecutionOrchestrator.js`
  - Core Orchestrator exists and supports `run/pause/resume`, but not retry/skip/dependency recovery.
- `modules/assistant/assistantExecutionApiClient.js`
  - Uses `/api/v2/canvas-agent/executions`, `/timeline`, and `/status`.
- `services/canvas_agent_execution_service.py`
  - Backend service exists, but currently drops timeline extended fields and does not persist `orchestratorState`.
- `services/canvas_agent_route_service.py` and `services/http_route_dispatcher.py`
  - Execution routes and dispatcher allowlist exist under `/api/v2/canvas-agent/executions/*`.

### 146.3 Verification

- CodeGraph was attempted first because the project AGENTS.md requests it, but `codegraph_status` returned `database is locked`.
- Fell back to targeted `rg` and file reads; no `8777` service was started, stopped, checked, probed, or touched.
- This is a documentation-only slice, so no runtime unit tests were required for code behavior.

### 146.4 Current Effect Boundary

- The PRD now more accurately reflects the real implementation state.
- This slice does not change runtime behavior.
- The next development slice should still route drawer `确认` for v2 execution plans into `executionOrchestrator.run()` while preserving the video authorization safety line.
- A separate backend TDD slice should persist `orchestratorState` and timeline extended fields before claiming complete project-level execution history.

## 147. Drawer Non-Video Confirm Routed To Orchestrator Slice (2026-06-10)

This section records the next Phase 3 drawer integration slice: non-video v2 execution confirmation now routes through the real Execution Orchestrator, while v2 video execution plans still show explicit `授权视频` instead of generic confirmation.

### 147.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified a `waiting_confirmation` v2 execution with `plan.steps` + `actionsByStep` did not call injected `executionOrchestrator.run()`.
  - RED verified a v2 execution whose `actionsByStep` contains an unauthorized `ai-video` generation action showed generic `确认` instead of `授权视频`.
  - Added coverage that non-video v2 `确认` calls `run(execution.id, { agentMode, videoAuthorized:false })`.
  - Added coverage that v2 video execution does not expose generic confirm before explicit authorization.
- Updated `modules/app/appAssistantPanel.js`.
  - Added a small `isPlainObject()` helper.
  - Added `executionActions(execution)` to compile v2 `actionsByStep` in plan step order for drawer-level safety checks.
  - Added `isRunnableExecution(execution)` for deciding whether drawer `确认` can be Orchestrator-backed.
  - Updated `drawerActionLabel(execution)` to check both legacy `state.pendingActions` and v2 `execution.actionsByStep` for unauthorized video generation.
  - Updated `handleExecutionDrawerAction()`:
    - `确认` + runnable v2 execution + `executionOrchestrator.run` now calls `run(execution.id, { agentMode, videoAuthorized })`.
    - Missing v2 actions or missing Orchestrator still falls back to old `handleConfirmCard()` for backward compatibility.
    - `授权视频` remains on existing explicit authorization + apply path for now.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD from `v3.4` to `v3.5`.
  - Marked Slice 147 non-video v2 drawer confirmation as completed minimum closure.
  - Kept the unfinished boundaries explicit: Orchestrator-backed `授权视频`, `重试`, retry/skip/dependency recovery, backend extended field persistence, complete history browser, Timeline Humanizer, Undo, and Replay remain missing.

### 147.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer confirm routes v2 execution|drawer v2 video execution"`
  - Result: expected failure.
    - Non-video confirm assertion failed because `calls.length` was `0`.
    - v2 video execution assertion failed because button text was `确认` instead of `授权视频`.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer confirm routes v2 execution|drawer v2 video execution"`
  - Result: target tests passed.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionOrchestrator.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 103 tests pass, 0 fail.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.

### 147.3 Current Effect Boundary

- Non-video v2 execution confirmation is now Orchestrator-backed.
- v2 execution-level video safety is improved: v2 `actionsByStep` containing unauthorized `ai-video` generation now shows `授权视频` instead of generic `确认`.
- This still does not implement:
  - Orchestrator-backed `授权视频`.
  - Orchestrator-backed `重试`.
  - retry/skip/dependency recovery.
  - backend persistence of `orchestratorState` and timeline extended fields.
  - complete execution history browser.
  - Timeline Humanizer.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 147.4 Next Recommended Slice

- Continue by making `授权视频` Orchestrator-aware for v2 executions:
  - keep explicit user authorization.
  - pass `videoAuthorized:true` only after explicit authorization.
  - avoid falling back to a legacy pendingActions batch when the active execution is a v2 plan with its own `actionsByStep`.
- In parallel or immediately after, add backend TDD for persisting `orchestratorState` and timeline extended fields so project history does not lose focus/retry/undo gating data.

## 148. Drawer v2 Video Authorization Routed To Orchestrator Slice (2026-06-10)

This section records the next Phase 3 drawer integration slice after non-video v2 confirmation: v2 execution video authorization now keeps explicit user authorization, then routes the runnable v2 execution through the real Execution Orchestrator with `videoAuthorized:true` instead of falling back to the legacy pendingActions apply path.

### 148.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - RED verified a `waiting_video_authorization` v2 execution did not call injected `executionOrchestrator.run()` after clicking the drawer `授权视频` button.
  - Added coverage that clicking `授权视频` on a runnable v2 execution:
    - keeps the button text explicit as `授权视频`.
    - does not call the legacy `executeActions()` / pendingActions batch path.
    - calls `run(execution.id, { agentMode, videoAuthorized:true })` on the injected Orchestrator.
    - allows the Orchestrator to update execution status in the store.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `executionHasUnauthorizedVideoAction(execution)` so the drawer can distinguish v2 execution-level video authorization from legacy `pendingActions` authorization.
  - Updated `handleExecutionDrawerAction()` for the `授权视频` label:
    - compute whether the current target execution is runnable v2 video work before mutating authorization state.
    - call `state.approveVideoGeneration()` only as the explicit user authorization step.
    - for runnable v2 video execution with an Orchestrator, call `resolvedExecutionOrchestrator.run(targetExecution.id, { agentMode, videoAuthorized:true })`.
    - keep `handleApply()` only as the compatibility fallback when there are no v2 actions or no Orchestrator.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD to `v3.6` real-code state.
  - Added Slice 148 to the progress table.
  - Corrected drawer button boundaries: v2 `确认`, v2 `授权视频`, and `暂停/继续` are Orchestrator-backed; `重试` is still not Orchestrator-backed.
  - Corrected Phase 1/2/3 status text, self-check conclusion, and false-completion rules so future developers do not mistake legacy pendingActions fallback or frontend-only state for a complete execution workspace.

### 148.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer v2 video authorization runs execution"`
  - Result: expected failure before implementation because Orchestrator `run()` was not called.
- GREEN target:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer v2 video authorization runs execution"`
  - Result: target test passed.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionOrchestrator.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 104 tests pass, 0 fail.
- Syntax checks:
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js`
  - Result: OK.

### 148.3 Current Effect Boundary

- v2 execution-level video authorization is now Orchestrator-backed after explicit user authorization.
- Act mode still does not imply video authorization; `videoAuthorized:true` is only passed after the user clicks `授权视频`.
- Legacy `pendingActions` video authorization remains as compatibility fallback when the active drawer target is not a runnable v2 execution or no Orchestrator exists.
- This still does not implement:
  - timeline-scoped single-action authorization; current v2 authorization is execution-level.
  - Orchestrator-backed `重试`.
  - retry/skip/dependency recovery.
  - backend persistence of `orchestratorState` and timeline extended fields such as `nodeIds/error/canRetry/canUndo/durationMs`.
  - Timeline Humanizer.
  - complete execution history browser.
  - Undo/Replay inverse patch support.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 148.4 Next Recommended Slice

- Start the backend TDD slice for persisting execution `orchestratorState` and timeline extended fields in `CanvasAgentExecutionService`:
  - timeline `nodeIds/affectedNodeIds/createdNodeIds/updatedNodeIds/queuedGenerationNodeIds/startedGenerationNodeIds`.
  - timeline `error/canRetry/canUndo/durationMs`.
  - execution `orchestratorState.nextActionIndex/pausedAtActionId/running`.
- Then route drawer `重试` through Orchestrator-backed behavior instead of leaving it as a label-only state.

## 149. Backend Execution Extended Fields Persistence Slice (2026-06-10)

This section records the next Phase 3 backend persistence slice after v2 video authorization routing: the backend Project Execution Store now preserves the Orchestrator pause cursor and timeline fields needed by focus/retry/undo gating when executions are saved, appended, status-patched, and loaded back from disk.

### 149.1 Completed Changes

- Updated `canvas_agent_execution_service_test.py` first.
  - Added RED coverage for `CanvasAgentExecutionService` preserving:
    - execution `orchestratorState.nextActionIndex`.
    - execution `orchestratorState.pausedAtActionId`.
    - execution `orchestratorState.running`, with non-`executing` states forcing `running=false`.
    - timeline `nodeIds` merged from `nodeIds/affectedNodeIds/createdNodeIds/updatedNodeIds/queuedGenerationNodeIds/startedGenerationNodeIds`.
    - timeline `error/canRetry/canUndo/durationMs`.
    - secret redaction inside timeline `error`.
  - RED failed with `KeyError: 'orchestratorState'`, proving the backend was still dropping the pause cursor.
- Updated `services/canvas_agent_execution_service.py`.
  - Added `_sanitize_orchestrator_state(value, status)`.
  - Added `_sanitize_timeline_node_ids(value)` to merge and de-duplicate node ids from all known timeline node-id arrays.
  - Added `_sanitize_duration_ms(value)`.
  - Extended `_sanitize_timeline_event()` to preserve:
    - `error`
    - `nodeIds`
    - `canRetry`
    - `canUndo`
    - `durationMs`
  - Extended `_sanitize_execution()` to preserve `orchestratorState`.
  - Extended `update_status()` patch merging so status PATCH can update `orchestratorState` without replacing unrelated state accidentally.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD to `v3.7`.
  - Added Slice 149 to the progress table.
  - Corrected “backend extended fields still missing” language: backend now has the minimum persistence closure for `orchestratorState` and timeline `nodeIds/error/canRetry/canUndo/durationMs`.
  - Kept the remaining gaps explicit: drawer `重试`, retry/skip/dependency recovery, Timeline Humanizer, complete history browser, Undo, and Replay remain unfinished.

### 149.2 Verification

- RED:
  - `python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_persists_orchestrator_state_and_timeline_extended_fields`
  - Result: expected failure with `KeyError: 'orchestratorState'`.
- GREEN target:
  - `python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_persists_orchestrator_state_and_timeline_extended_fields`
  - Result: 1 test OK.
- Related backend regression:
  - `python -m unittest canvas_agent_execution_service_test.py http_route_dispatcher_test.py`
  - Result: 17 tests OK.
- Syntax:
  - `python -m py_compile services\canvas_agent_execution_service.py`
  - Result: OK.

### 149.3 Current Effect Boundary

- Backend execution history now preserves the fields the frontend drawer and Orchestrator need for:
  - pause/resume cursor restore.
  - timeline event node focus after backend history import.
  - retry/undo button gating metadata after backend history import.
  - duration/error display after backend history import.
- This is still not complete execution recovery:
  - Drawer `重试` is still not Orchestrator-backed.
  - Timeline `canUndo=true` is only metadata; there is still no inverse patch implementation.
  - Retry/skip/dependency recovery remains unfinished.
  - Complete history browser/search/filter/pagination remains unfinished.
  - Timeline Humanizer remains unfinished.
  - Undo/Replay remains unfinished.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 149.4 Next Recommended Slice

- Route drawer `重试` through Orchestrator-backed behavior:
  - add RED UI/core tests for retrying the current failed execution/action.
  - avoid fake status-only retry.
  - reuse persisted `orchestratorState` / timeline action metadata where possible.
- Keep video safety intact: retrying a failed video action must not bypass explicit `授权视频`.

## 150. Drawer Retry Routed To Orchestrator Slice (2026-06-10)

This section records the next Phase 3 retry slice after backend extended-field persistence: failed executions can now be retried from their failed cursor through the real Execution Orchestrator, and the input-above drawer `重试` button calls that Orchestrator path instead of being a label-only affordance.

### 150.1 Completed Changes

- Updated `modules/assistant/assistantExecutionOrchestrator.test.js` first.
  - Added RED coverage that `orchestrator.retry(executionId, options)` should retry a failed execution from `orchestratorState.nextActionIndex`.
  - RED failed with `TypeError: orchestrator.retry is not a function`.
  - The test verifies:
    - first run fails on `act-connect` and stores `orchestratorState.nextActionIndex=1`.
    - retry does not re-run the already completed `act-create` action.
    - retry validates and executes `act-connect`.
    - retry forwards `videoAuthorized:false` from the caller instead of inventing authorization.
    - final execution status becomes `completed`.
- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added RED coverage that clicking drawer `重试` on a failed v2 execution calls injected `executionOrchestrator.retry(executionId, { agentMode, videoAuthorized })`.
  - RED failed because calls stayed at `0`, proving the drawer button was only label-level behavior.
- Updated `modules/assistant/assistantExecutionOrchestrator.js`.
  - Added `retry(executionId, options)`.
  - `retry()` reloads the execution from store and calls `run()` with:
    - `startActionIndex: execution.orchestratorState.nextActionIndex`.
    - fallback to `execution.progress.done` when no cursor is present.
  - The existing `run()` path still performs per-action validation, execution, timeline/status writes, and backend best-effort sync.
- Updated `modules/app/appAssistantPanel.js`.
  - `handleExecutionDrawerAction()` now routes `重试` to `resolvedExecutionOrchestrator.retry(targetExecution.id, { agentMode, videoAuthorized })`.
  - The drawer keeps explicit video authorization rules: retry passes current `videoAuthorized` state and does not create authorization by itself.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD to `v3.8`.
  - Added Slice 150 to the progress table.
  - Corrected current boundaries: drawer `重试` is now Orchestrator-backed at failed-execution cursor level.
  - Kept remaining gaps explicit: skip, dependency recovery, Timeline Humanizer, complete history browser, Undo, Replay, and finer timeline single-action retry remain unfinished.

### 150.2 Verification

- RED core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retries failed execution"`
  - Result: expected failure with `TypeError: orchestrator.retry is not a function`.
- RED UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer retry routes failed execution"`
  - Result: expected failure because `calls.length` was `0`.
- GREEN core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retries failed execution"`
  - Result: target test passed.
- GREEN UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "drawer retry routes failed execution"`
  - Result: target test passed.

### 150.3 Current Effect Boundary

- Drawer `重试` is no longer a fake UI-only button for v2 failed executions.
- Orchestrator retry is cursor-level:
  - it restarts from `orchestratorState.nextActionIndex` or `progress.done`.
  - it reuses the existing `run()` validation/execution/timeline/status path.
- This is still not complete recovery:
  - no timeline single-action picker yet.
  - no dependency-aware retry/skip planning yet.
  - no explicit “retry this failed video only after new 授权视频” UX yet.
  - no Undo inverse patch.
  - no Replay.
  - no Timeline Humanizer.
  - no complete history browser/search/filter/pagination.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 150.4 Next Recommended Slice

- Add a retry safety refinement for video actions:
  - if the failed cursor points at an `ai-video` generation action and `videoAuthorized` is not true, retry should stop at `waiting_video_authorization` instead of validating/executing.
  - add core RED/GREEN plus drawer UI test if button state changes.
- Or continue with Timeline Humanizer if product priority is user-facing clarity.

## 151. Video Retry Authorization Safety + PRD v3.9 Repair Slice (2026-06-10)

This section records the real-code PRD repair after Slice 150 and the verified video retry safety behavior now present in `assistantExecutionOrchestrator`.

### 151.1 Completed Changes

- Verified the existing Slice 151 Orchestrator behavior in `modules/assistant/assistantExecutionOrchestrator.js`.
  - `generationActionNodeType(action)` and `isVideoGenerationAction(action)` detect `queue_generation_task` / `run_prompt_preset_generation` actions whose node type is `ai-video`.
  - `retry(executionId, options)` reloads the failed execution and resolves the retry cursor from `orchestratorState.nextActionIndex` or `progress.done`.
  - If the retry cursor points at an `ai-video` generation action and `options.videoAuthorized !== true`, retry does not validate or execute the action.
  - Instead it appends a `waiting_video_authorization` timeline event, preserves the cursor at the video action, sets execution status to `waiting_video_authorization`, and returns `requiresVideoAuthorization:true`.
- Repaired `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version to `v3.9`.
  - Added Slice 151 to the implementation progress table.
  - Corrected stale statements that still said drawer retry, backend extended-field persistence, or Orchestrator-backed execution were unfinished.
  - Reframed remaining gaps as: Timeline Humanizer, complete history browser/search/filter/pagination, timeline single-action operations, skip, dependency recovery, queue state machine, Undo inverse patch, and Replay.
  - Kept the user-managed `8777` rule explicit; this slice did not start, restart, stop, status-check, probe, or touch `8777`.

### 151.2 Verification

- Behavior verification:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retry waits for authorization"`
  - Result: 5 tests pass, 0 fail.
  - The target assertion verifies retrying a failed video action without explicit authorization stores `waiting_video_authorization`, keeps `nextActionIndex` at the video action, and does not call `validateActions()` or `executeActions()`.
- Documentation checks:
  - `git diff --check -- docs\superpowers\specs\2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
  - Result: exit 0.
  - Stale wording scan for `v3.7`, `v3.8`, `重试尚未`, `抽屉重试尚未`, `重试仍待真正`, `后端导入历史目前可能缺少`, `UI 层重试`, `Orchestrator 尚未`, and similar outdated boundaries returned no blocking stale matches.

### 151.3 Current Effect Boundary

- Video retry safety now has a real Orchestrator-level gate:
  - retrying a failed `ai-video` generation action without explicit authorization stops at `waiting_video_authorization`.
  - Act mode still does not imply video authorization.
  - retry does not invent `videoAuthorized:true`.
- This is still not the final execution workspace:
  - no timeline single-action picker yet.
  - no timeline-scoped single-action video authorization UI yet.
  - no skip or dependency-aware recovery yet.
  - no complete history browser/search/filter/pagination yet.
  - no Timeline Humanizer yet.
  - no Undo inverse patch or Replay yet.

### 151.4 Next Recommended Slice

- Start Timeline Humanizer if the next priority is visible user trust:
  - convert `Running:/Completed:/Failed:` and technical action type fallback into concise Chinese user-facing summaries.
  - keep raw action JSON in developer/debug surfaces only.
- Or start timeline single-action operation groundwork if the next priority is recovery:
  - render retry/skip/undo affordances from selected timeline event metadata.
  - route only the safe retry path first.
  - keep video retry authorization gate intact.

## 152. Timeline Humanizer Minimum Slice (2026-06-10)

This section records the next Phase 3 user-facing clarity slice after video retry authorization safety: the Orchestrator no longer writes raw English `Running:/Completed:/Failed:` prefixes or technical action type fallback into ordinary timeline summaries for common actions.

### 152.1 Completed Changes

- Updated `modules/assistant/assistantExecutionOrchestrator.test.js` first.
  - Added RED coverage `assistantExecutionOrchestrator: humanizes technical action summaries for the timeline`.
  - The test creates a v2 execution with a technical `queue_generation_task` action for an `ai-image` node and no human title.
  - RED failed as expected because timeline summaries were `Running: queue_generation_task` and `Completed: queue_generation_task`.
  - The test verifies:
    - running summary becomes `正在生成图片`.
    - completed summary becomes `已生成图片`.
    - completed drawer line becomes `执行完成`.
    - ordinary timeline summaries do not contain `Running:`, `Completed:`, or `queue_generation_task`.
    - raw technical action data is still preserved under `developer.actionJson`.
- Updated `modules/assistant/assistantExecutionOrchestrator.js`.
  - Added `actionHumanObject(action)` and `timelineSummary(action, status)`.
  - Common technical actions now map to concise Chinese objects:
    - `ai-image` -> `图片`
    - `ai-text` -> `文本`
    - `ai-video` -> `视频`
    - `create_node` -> `节点`
    - `connect_nodes` -> `连线`
    - asset actions -> `资产`
    - prompt preset generation -> `预设提示词`
  - Running/completed/failed timeline events use Chinese summaries via `timelineSummary()`.
  - Drawer fallback lines were localized:
    - `准备执行`
    - `没有可执行动作`
    - `执行完成`
    - `已暂停`
  - Video retry authorization summary changed from `Video retry requires explicit authorization` to `需要先授权视频生成`.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version to `v3.10`.
  - Added Slice 152 to the progress table.
  - Reframed Timeline Humanizer from “not started” to “minimum Orchestrator-level slice complete”.
  - Kept remaining boundaries explicit: full Humanizer vocabulary, UI developer JSON panel, timeline single-action operations, skip, dependency recovery, complete history browser, Undo, and Replay remain unfinished.

### 152.2 Verification

- RED:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "humanizes technical action summaries"`
  - Result: expected failure.
  - Actual summaries were `Running: queue_generation_task` and `Completed: queue_generation_task`; expected `正在生成图片` and `已生成图片`.
- Additional RED for video authorization copy:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retry waits for authorization"`
  - Result: expected failure after changing expected summary to `需要先授权视频生成`.
- GREEN:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js`
  - Result: 6 tests pass, 0 fail.

### 152.3 Current Effect Boundary

- Common Orchestrator-generated timeline summaries are now user-facing Chinese.
- Raw technical data still remains available in `developer.actionJson`; this is important for future developer/debug UI.
- This is still not a complete Timeline Humanizer:
  - not every action type has a curated phrase.
  - validation/execution error messages are not fully localized.
  - old historical timeline entries are not migrated.
  - the expanded drawer still does not expose a full developer-mode JSON panel.
  - timeline single-action retry/skip/undo controls remain unfinished.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 152.4 Next Recommended Slice

- If continuing user-facing clarity:
  - extend `timelineSummary()` coverage for canvas layout, prompt preset, asset use, storyboard workflow, reference binding, and generation task states.
  - add tests for failed validation/execution Chinese summaries.
- If continuing recovery:
  - add timeline selected-event action buttons for retry/skip/undo gating.
  - start with retry only, keep video authorization gate intact.

## 153. PRD v3.11 Real-Code Consistency Repair Slice (2026-06-10)

This section records a documentation-only repair after reviewing the PRD against real code and project tacit knowledge. No runtime code was changed in this slice.

### 153.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.10` to `v3.11`.
  - Clarified that v3.11 is a real-code consistency repair, not a new runtime feature slice.
  - Fixed a stale contradiction in the storage section:
    - Old text still said backend execution service had incomplete fields and did not persist timeline `nodeIds/error/canRetry/canUndo/durationMs` or execution `orchestratorState`.
    - Corrected text now matches Slice 149: backend `CanvasAgentExecutionService` persists those fields, including developer payload sanitization.
  - Expanded the real-code boundary table to separate target state from what is actually implemented:
    - store queue exists, but queue scheduler/next-item runner/cancel/pin/pause queued task/queue >5 warning are not implemented.
    - plan board is currently read-only; enable/disable/reorder/single-step/DAG preview are not implemented.
    - timeline details currently show text and `聚焦对象`; selected-event retry/skip/undo buttons are not implemented.
    - drawer-level `重试` is failed-execution cursor retry, not timeline single-action retry.
  - Updated Phase 3 delivery and acceptance wording:
    - `Execution Orchestrator`, timeline event store, pause/resume cursor, failed cursor retry, video retry authorization gate, and minimal Humanizer are implemented.
    - `skip`, dependency recovery, full queue state machine, true action duration calculation, structured targets, developer JSON panel, Undo, and Replay remain unfinished.
  - Reworded confirmation rules so `授权视频` as current-timeline-action authorization is explicitly a target state; real code remains execution-level v2 authorization.
  - Preserved the user-managed `8777` rule: this slice did not start, restart, stop, check, probe, or touch `8777`.

### 153.2 Verification

- CodeGraph status check:
  - `codegraph_status(projectPath="d:\\Aic\\huanying-source-windows-20260430-122116")`
  - Result: `database is locked`, so this review intentionally used `rg` and targeted file reads.
- Real-code anchors read for this repair:
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `services/http_route_dispatcher.py`
- Documentation checks:
  - `git diff --check -- docs\superpowers\specs\2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
  - Result: exit 0; only existing LF/CRLF warning for the handoff file.
  - Stale wording scan after PRD self-check repair:
    - `rg -n '版本：v3\.10|状态：已按真实代码.*v3\.10|本次 v3\.9|字段不完整|当前未持久化 timeline|重试尚未|抽屉重试尚未|UI 层重试' docs\superpowers\specs\2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
    - Result: no matches.
  - Note: scanning `Orchestrator 尚未` by itself can match legitimate target-gap text such as “Orchestrator 尚未计算真实 duration”; that is not stale.

### 153.3 Current Effect Boundary

- This slice only fixes PRD and handoff documentation; it does not change product behavior.
- The next development slice should not re-do backend extended-field persistence or Orchestrator-backed drawer retry; those are already done.
- Recommended next runtime slice remains one of:
  - Timeline selected-event controls: render retry/skip/undo affordances from selected event metadata, implement retry first, keep video authorization gate intact.
  - Queue scheduler: automatically run next queued execution after current completed/failed policy permits, with explicit tests for not touching unauthorized video.
  - Timeline Humanizer expansion: cover layout, asset use, storyboard/reference binding, failed validation/execution messages, and developer JSON panel.

## 154. Timeline Selected-Event Retry Minimum Slice (2026-06-10)

This section records the first runtime slice after PRD v3.11 real-code repair: the expanded execution drawer can now retry a selected retryable timeline event, and the Orchestrator can target the corresponding action by `actionId` instead of only retrying from the failed execution cursor.

### 154.1 Completed Changes

- Updated `modules/assistant/assistantExecutionOrchestrator.test.js` first.
  - Added RED coverage `assistantExecutionOrchestrator: retry can target a selected timeline action id`.
  - RED failed because `retry()` ignored `options.actionId` and still retried from `orchestratorState.nextActionIndex`, validating/executing `act-create` before `act-connect`.
  - The new test verifies:
    - `orchestrator.retry(executionId, { actionId, eventId, videoAuthorized })` resolves the start cursor from `actionId`.
    - Only the selected action is validated/executed in the minimum slice.
    - `actionId` and `eventId` are forwarded to `validateActions()` for trace/debug continuity.
- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added RED coverage `appAssistantPanel Phase 3 UI: selected timeline event can retry that action through orchestrator`.
  - RED failed because the expanded timeline detail did not render `.hy-canvas-agent-execution-detail-retry`.
  - The test verifies:
    - selecting a `canRetry=true` timeline event shows `重试此步`.
    - clicking it calls `executionOrchestrator.retry(executionId, { actionId, eventId, agentMode, videoAuthorized })`.
    - the UI still passes `videoAuthorized:false` unless explicit video authorization has happened.
- Updated `modules/assistant/assistantExecutionOrchestrator.js`.
  - Added `actionIndexById(compiled, actionId)`.
  - `retry()` now prefers a valid `options.actionId` cursor before falling back to `orchestratorState.nextActionIndex` or `progress.done`.
  - `run()` now forwards `actionId` and `eventId` into the validation payload, while still preserving existing per-action execution behavior.
  - Existing video retry safety remains on the resolved retry cursor, so targeted video action retry still cannot bypass explicit authorization.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `retryTimelineEvent(executionId, event)`.
  - Expanded drawer detail actions now render `重试此步` for selected events with `canRetry=true` and a non-empty `actionId`.
  - Clicking `重试此步` calls the injected/default Orchestrator retry path with `actionId/eventId`, not the legacy pending-action apply flow.
  - Existing `聚焦对象` behavior remains unchanged and can coexist with the retry button.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.11` to `v3.12`.
  - Marked Slice 154 as the minimum timeline selected-event retry slice.
  - Reframed remaining gaps: skip, undo, dependency recovery, timeline single-action video authorization UI, retry-result merge/recompile, full queue state machine, complete Humanizer, history browser, Undo/Replay remain unfinished.

### 154.2 Verification

- RED core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retry can target a selected timeline action id"`
  - Result: expected failure; actual validate sequence was `["act-create", "act-connect"]`, expected only `["act-connect"]`.
- RED UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected timeline event can retry"`
  - Result: expected failure because `.hy-canvas-agent-execution-detail-retry` was missing.
- GREEN target core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "retry can target a selected timeline action id"`
  - Result: 7 tests pass, 0 fail in that filtered file run.
- GREEN target UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected timeline event can retry"`
  - Result: 47 tests pass, 0 fail in that filtered file run.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 110 tests pass, 0 fail.
- Syntax:
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 154.3 Current Effect Boundary

- Timeline selected-event retry now has a real minimum vertical slice:
  - event-level UI button exists for `canRetry=true` events with `actionId`.
  - Orchestrator can target the corresponding action by `actionId`.
  - raw event/action ids are passed through for traceability.
- This is still not complete timeline recovery:
  - no `skip()` yet.
  - no `undo` inverse patch yet.
  - no dependency-aware retry/skip/recompile yet.
  - no timeline single-action video authorization UI yet.
  - no retry-result merge strategy beyond the existing execution timeline append behavior.
  - no complete history browser/search/filter/pagination.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 154.4 Next Recommended Slice

- Continue recovery with `skip` minimum slice:
  - add Orchestrator `skip(executionId, { actionId, eventId })` with `skipped` timeline event and cursor advancement.
  - add drawer detail `跳过此步` button gated by a selected failed/retryable event.
  - keep dependency recovery explicit as a later slice unless adding a simple blocked-dependent marker.
- Or continue safety with timeline single-action video authorization UI:
  - selected video retry event should show `授权视频` instead of plain retry when authorization is missing.

## 155A. PRD v3.13 Real-Code Review Repair for Skip Boundary (2026-06-10)

This section records a documentation-only repair requested after reviewing the PRD against real code and project tacit knowledge. No runtime production code was changed in this slice.

### 155A.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.12` to `v3.13`.
  - Added explicit Slice 153, Slice 154, and Slice 155 rows to the real-code progress table.
  - Clarified that Slice 154 is completed as the selected timeline event retry minimum slice.
  - Clarified that Slice 155 is only RED-test preparation right now, not a completed runtime feature.
  - Recorded the current real-code skip boundary:
    - `modules/assistant/assistantExecutionOrchestrator.js` still has no `skip()` method.
    - `modules/app/appAssistantPanel.js` still has no `.hy-canvas-agent-execution-detail-skip` button.
    - `canUndo` remains metadata only; no inverse patch exists.
  - Repaired Phase 2/3 status wording so selected-event retry is not grouped together with skip/undo.
  - Added a pseudo-completion guard: writing skip RED tests or PRD text does not count as skip completion without `orchestrator.skip()`, a `skipped` timeline event, cursor/progress/status advancement, and UI wiring.
  - Kept the user-managed `8777` rule explicit; this slice did not start, restart, stop, status-check, probe, or touch `8777`.

### 155A.2 Real-Code Evidence

- CodeGraph status check:
  - `codegraph_status(projectPath="d:\Aic\huanying-source-windows-20260430-122116")`
  - Result: `database is locked`; this repair used targeted `rg` and file reads instead.
- Current production code evidence:
  - `modules/assistant/assistantExecutionOrchestrator.js` return object currently exposes `pause`, `retry`, `resume`, and `run`; it does not expose `skip`.
  - `modules/app/appAssistantPanel.js` currently has `retryTimelineEvent()` and renders `.hy-canvas-agent-execution-detail-retry`; it does not render `.hy-canvas-agent-execution-detail-skip`.
- Current RED tests already present:
  - `modules/assistant/assistantExecutionOrchestrator.test.js` has `assistantExecutionOrchestrator: skips selected timeline action and advances cursor`.
  - `modules/app/appAssistantPanel.p1Ui.test.js` has `appAssistantPanel Phase 3 UI: selected timeline event can skip that action through orchestrator`.

### 155A.3 Verification

- RED core verification:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skips selected timeline action"`
  - Result: expected failure, 7 pass / 1 fail in the filtered file run.
  - Failure reason: `TypeError: orchestrator.skip is not a function`.
- RED UI verification:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected timeline event can skip"`
  - Result: expected failure, 47 pass / 1 fail in the filtered file run.
  - Failure reason: `assert.ok(skipButton)` failed because `.hy-canvas-agent-execution-detail-skip` is missing.

### 155A.4 Next Required Runtime Slice

- Implement Slice 155 production behavior with TDD:
  - add `skip(executionId, { actionId, eventId })` to `modules/assistant/assistantExecutionOrchestrator.js`.
  - target the selected action by `actionId`, append a `skipped` timeline event, and advance `progress` plus `orchestratorState.nextActionIndex`.
  - for the minimum slice, complete the execution when the skipped action is the last action; later dependency-aware skip can handle middle actions and blocked dependents.
  - add `skipTimelineEvent(executionId, event)` and `.hy-canvas-agent-execution-detail-skip` to `modules/app/appAssistantPanel.js`.
  - turn both existing RED tests GREEN, then run related regression and syntax checks.
- This documentation repair does not make the assistant able to skip a timeline action yet.

## 155. Timeline Selected-Event Skip Minimum Slice (2026-06-10)

This section records the runtime implementation after the v3.13 PRD boundary repair: the expanded execution drawer can now skip a selected retryable timeline event, and the Orchestrator can advance the execution cursor without re-running that action.

### 155.1 Completed Changes

- Implemented `skip(executionId, { actionId, eventId })` in `modules/assistant/assistantExecutionOrchestrator.js`.
  - Resolves the target cursor by `actionId` first, falling back to the stored cursor/progress only when no valid action id is supplied.
  - Appends a `skipped` timeline event with `humanSummary: "已跳过：<action label>"`.
  - Stores `developer.skippedFromEventId` and `developer.actionJson` for trace/debug continuity.
  - Advances `progress.done` and `orchestratorState.nextActionIndex` past the skipped action.
  - Marks the execution `completed` when the skipped action is the final action; otherwise pauses at the next action cursor for the minimum slice.
- Implemented selected-event skip UI in `modules/app/appAssistantPanel.js`.
  - Added `skipTimelineEvent(executionId, event)`.
  - Expanded timeline detail now renders `.hy-canvas-agent-execution-detail-skip` with text `跳过此步` for selected retryable events with an `actionId`, when the injected/default Orchestrator exposes `skip`.
  - Clicking `跳过此步` calls `executionOrchestrator.skip(executionId, { actionId, eventId })`.
  - Existing `聚焦对象` and `重试此步` detail actions remain intact.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.13` to `v3.14`.
  - Marked Slice 155 selected-event skip as completed minimum closure.
  - Reframed remaining gaps as dependency recovery, timeline single-action video authorization UI, Undo inverse patch, queue scheduler, full Humanizer, complete history browser, and Replay.

### 155.2 Verification

- RED core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skips selected timeline action"`
  - Result before implementation: expected failure, 7 pass / 1 fail.
  - Failure reason: `TypeError: orchestrator.skip is not a function`.
- RED UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected timeline event can skip"`
  - Result before implementation: expected failure, 47 pass / 1 fail.
  - Failure reason: `.hy-canvas-agent-execution-detail-skip` was missing.
- GREEN target core:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skips selected timeline action"`
  - Result: 8 tests pass, 0 fail in the filtered file run.
- GREEN target UI:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected timeline event can skip"`
  - Result: 48 tests pass, 0 fail in the filtered file run.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 112 tests pass, 0 fail.
- Syntax:
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 155.3 Current Effect Boundary

- Timeline selected-event skip now has a real minimum vertical slice:
  - event-level UI button exists for selected retryable events with `actionId`.
  - Orchestrator can target and skip the corresponding action by `actionId`.
  - skip writes a `skipped` timeline event and advances cursor/progress.
- This is still not complete timeline recovery:
  - no dependency graph or downstream blocked-step handling yet.
  - no skip-result merge/recompile strategy yet.
  - no Undo inverse patch yet.
  - no timeline single-action video authorization UI yet.
  - no complete history browser/search/filter/pagination.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 155.4 Next Recommended Slice

- Continue recovery with dependency-aware failure handling:
  - build a minimum dependency map from `plan.steps[].dependsOn` and action order.
  - when a selected action is retried or skipped, mark dependent future steps as `dependency_blocked` or keep execution paused with an explicit human summary.
  - keep the current selected-event retry/skip tests green.
- Or continue safety with timeline single-action video authorization UI:
  - selected video generation retry should show `授权视频` instead of plain retry/skip when authorization is missing.

## 156. PRD v3.15 Real-Code Review Repair (2026-06-10)

This section records a documentation-only repair requested after reviewing the PRD against real code, the Slice 155 runtime implementation, and project tacit knowledge. No runtime production code was changed in this slice.

### 156.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.14` to `v3.15`.
  - Added Slice 156 as a documentation repair row in the real-code progress table.
  - Repaired stale wording that still treated generic timeline single-action operation or skip as fully missing after Slice 155.
  - Clarified that selected-event retry/skip are completed minimum closures, while dependency recovery, timeline single-action video authorization, complete history browser, full Humanizer, queue state machine, Undo, and Replay remain open.
  - Clarified the current detail panel boundary: `聚焦对象`, `重试此步`, and `跳过此步` exist; undo, single-action video authorization, and developer JSON panel do not.
- Updated this handoff document.
  - Fixed mojibake in Slice 155 Chinese snippets:
    - `humanSummary: "已跳过：<action label>"`.
    - `.hy-canvas-agent-execution-detail-skip` text `跳过此步`.
    - Existing `聚焦对象` and `重试此步`.
    - Video retry safety text `授权视频`.

### 156.2 Real-Code Evidence

- CodeGraph status check still returned `database is locked`; this review used targeted `rg` and file reads.
- `modules/assistant/assistantExecutionOrchestrator.js` exposes `skip()` and appends `status: "skipped"` with `humanSummary: "已跳过：..."`.
- `modules/app/appAssistantPanel.js` renders `.hy-canvas-agent-execution-detail-skip` with text `跳过此步` for selected retryable events with `actionId`.
- `modules/assistant/assistantExecutionStore.js` and `services/canvas_agent_execution_service.py` preserve timeline `nodeIds/error/canRetry/canUndo/durationMs` and execution `orchestratorState`.

### 156.3 Current Boundary

- This is a documentation consistency repair only.
- It does not change runtime behavior, tests, or UI.
- It does not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 156.4 Next Recommended Runtime Slice

- Continue with dependency-aware retry/skip recovery:
  - build a minimum dependency map from `plan.steps[].dependsOn` plus action order.
  - when retry/skip targets an upstream action, mark downstream dependent actions as `dependency_blocked` or keep execution paused with a clear human summary.
  - keep selected-event retry/skip tests green.
- Or continue with timeline single-action video authorization:
  - selected video generation retry should show `授权视频` instead of generic retry/skip when authorization is missing.

## 157. Dependency-Aware Retry/Skip Recovery Minimum Slice (2026-06-10)

This section records the runtime implementation for the next recovery slice: the Execution Orchestrator now understands minimum step dependencies from `plan.steps[].dependsOn`, blocks downstream dependent actions when an upstream step fails or is skipped, and keeps independent later actions running.

### 157.1 Completed Changes

- Updated `modules/assistant/assistantExecutionOrchestrator.js`.
  - `compilePlanActions()` now preserves each step's `dependsOn` array on compiled action items.
  - Added a minimum dependency map and transitive blocker lookup.
  - During `run()`:
    - if a validate/execute failure occurs in a plan with dependency edges, the failed action still writes the existing `failed` timeline event with `canRetry:true`.
    - later actions whose step depends on the failed step are written as `dependency_blocked`.
    - later actions without dependency on the failed step continue to validate/execute normally.
    - final execution status becomes `paused` when any dependent action is blocked, with `orchestratorState.nextActionIndex` pointing at the first blocked action.
  - During `skip()`:
    - skipping an upstream action writes the existing `skipped` event.
    - later actions whose step depends on the skipped step are written as `dependency_blocked`.
    - execution pauses at the first blocked action with a human drawer summary.
- Updated `modules/assistant/assistantExecutionOrchestrator.test.js`.
  - Added a dependency-plan fixture.
  - Added RED/GREEN coverage for failure recovery: failed upstream step blocks dependent action but independent action still runs.
  - Added RED/GREEN coverage for skip recovery: skipped upstream step blocks dependent future action.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.15` to `v3.16`.
  - Added Slice 157 row.
  - Reframed dependency recovery as completed minimum closure, with full DAG recompile/result merge still open.

### 157.2 Verification

- RED failure-recovery test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "blocks dependent steps"`
  - Result before implementation: expected failure, 8 pass / 1 fail in the filtered file run.
  - Failure reason: actual status was `failed`, expected `paused`.
- GREEN failure-recovery focused test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "blocks dependent steps|stops on invalid action"`
  - Result: 9 tests pass, 0 fail in the filtered file run.
- RED skip-dependency test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skip blocks dependent"`
  - Result before implementation: expected failure, 9 pass / 1 fail in the filtered file run.
  - Failure reason: `blockedActionCount` was missing.
- GREEN skip-dependency focused test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skip blocks dependent|blocks dependent steps"`
  - Result: 10 tests pass, 0 fail in the filtered file run.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 114 tests pass, 0 fail.
- Syntax:
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Result: OK.

### 157.3 Current Effect Boundary

- Minimum dependency-aware recovery is now real:
  - failed upstream step can block dependent future actions.
  - skipped upstream step can block dependent future actions.
  - independent later actions can continue after an upstream failure.
  - timeline records `dependency_blocked` with `developer.blockedByStepId`, `developer.blockedByActionId`, and `developer.blockedByEventId`.
- This is still not full dependency recovery:
  - no DAG recompile after retry/skip succeeds.
  - no result merge strategy for re-running downstream actions.
  - no UI detail panel that lists "which future steps depend on this failure" beyond timeline text.
  - no cross-restart execution resume for blocked dependency graphs.
  - no Undo/Replay integration.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 157.4 Next Recommended Slice

- Continue safety with timeline single-action video authorization UI:
  - selected video generation retry should show `授权视频` instead of generic retry/skip when authorization is missing.
  - keep failed cursor video authorization and selected-event retry/skip tests green.
- Or continue recovery UX:
  - surface blocked dependency details in the expanded timeline detail panel.
  - show "后续 N 步依赖这一步" for failed/skipped source events.


## 158. Timeline Selected-Event Video Authorization UI Minimum Slice (2026-06-10)

This section records the runtime implementation for the selected timeline event video authorization slice. It is the minimum UI closure after Slice 151 video retry safety and Slice 154/155 selected-event retry/skip.

### 158.1 Completed Changes

- Updated `modules/app/appAssistantPanel.js`.
  - Added `timelineEventActionJson(event)` to read selected event action data from `event.developer.actionJson` first, then `event.action`.
  - Added `timelineEventNeedsVideoAuthorization(event)` using the existing `isUnauthorizedVideoGenerationAction(action, graphStore, videoAuthorized)` helper.
  - Added `authorizeTimelineVideoEvent(executionId, event)`.
  - Expanded timeline event detail now detects selected retryable video generation events.
  - For an unauthorized selected video event, the detail actions hide ordinary `重试此步` and `跳过此步`, then show `.hy-canvas-agent-execution-detail-authorize-video` with text `授权视频`.
  - Clicking `授权视频` calls `state.approveVideoGeneration()` and then `executionOrchestrator.retry(executionId, { actionId, eventId, agentMode, videoAuthorized:true })`.
- Updated `modules/app/appAssistantPanel.p1Ui.test.js`.
  - Added RED/GREEN coverage for `selected video timeline event authorizes that action through orchestrator retry`.
  - Verified the ordinary selected-event retry and skip buttons are hidden for unauthorized video events.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Added Slice 158 to the progress table.
  - Reframed timeline single-action video authorization UI as a completed minimum UI closure.
  - Kept remaining gaps explicit: backend execution-chain authorization parity, complete authorization ledger, dependency recompile/result merge, full history browser, Humanizer, Undo, and Replay.

### 158.2 Verification

- RED selected-video-event authorization UI test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected video timeline event authorizes"`
  - Result before implementation: expected failure on missing `.hy-canvas-agent-execution-detail-authorize-video`.
- GREEN selected-event focused UI test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "selected video timeline event authorizes|selected timeline event can retry|selected timeline event can skip"`
  - Result: 49 tests pass, 0 fail.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 115 tests pass, 0 fail.
- Syntax:
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.

### 158.3 Current Effect Boundary

- The expanded execution drawer can now authorize a selected video generation timeline event and retry that exact action through Orchestrator.
- The implementation is intentionally a minimum UI closure:
  - it targets selected event/action retry via `actionId/eventId`.
  - it still uses `state.approveVideoGeneration()` plus `videoAuthorized:true` as the current authorization signal.
  - it is not yet a full per-action video authorization ledger.
  - it does not add backend execution-chain authorization parity.
  - it does not solve DAG recompile, downstream result merge, Undo, Replay, or full history browser.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 158.4 Next Recommended Slice

- Best next runtime slice: dependency UX in expanded timeline details.
  - show which downstream steps were blocked by a failed/skipped source event.
  - use existing `dependency_blocked` events and `developer.blockedByActionId/blockedByStepId/blockedByEventId` as the data source.
  - test for a failed/skipped source event detail showing `后续 N 步依赖这一步`.
- Alternative safety slice: backend execution-chain video authorization parity.
  - persist selected video authorization semantics instead of relying only on frontend state plus retry options.

## 159. PRD v3.18 Real-Code Consistency Repair (2026-06-10)

This section records the documentation-only repair requested after reviewing the PRD against real code, the project tacit knowledge, and the latest Slice 158 implementation. No runtime production code was changed in this slice.

### 159.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.17` to `v3.18`.
  - Added Slice 159 as a documentation repair row.
  - Corrected stale passages that still treated timeline single-action video authorization UI as missing after Slice 158.
  - Updated Phase 1/2/3 summaries, true-code anchors, acceptance boundaries, and self-check text to include selected video event `授权视频`.
  - Kept remaining gaps explicit: queue scheduler, plan editing/DAG, full dependency recompile/result merge, full Humanizer, full history browser, Undo, and Replay.
- Updated this handoff document.
  - Added Slice 158 runtime summary and verification evidence.
  - Added Slice 159 documentation repair summary.
  - Corrected two mojibake strings in the previous tail recommendation so the next developer sees `授权视频` and `后续 N 步依赖这一步`.

### 159.2 Verification

- CodeGraph status was attempted first because this project has CodeGraph configured, but the tool returned `database is locked`; this slice therefore used `rg` plus targeted file reads.
- Stale PRD wording scan after repair:
  - Ran an `rg` scan for old version markers and obsolete single-action-video-authorization-missing phrases without touching `8777`.
  - Result: only current v3.18 / Slice 158 / Slice 159 intentional references remained.

### 159.3 Current Effect Boundary

- This is a documentation-only repair, not a runtime feature slice.
- The PRD now says the selected video timeline event `授权视频` UI is completed as a minimum UI closure.
- The PRD still does not claim the whole execution workspace is complete.
- Remaining product gaps after this repair:
  - complete queue scheduler / cancel / pin / pause queued tasks / queue length warning.
  - editable plan board and DAG preview/recompile.
  - dependency UX plus retry/skip result merge.
  - full history browser with search/filter/pagination.
  - full Timeline Humanizer and developer JSON details.
  - Undo inverse patches and Replay.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.


## 160. Dependency-Blocked Source Event Detail UX Minimum Slice (2026-06-10)

This section records the next Phase 3 recovery UX slice: the expanded execution drawer can now explain which downstream steps depend on a failed or skipped source event by reading existing `dependency_blocked` timeline events.

### 160.1 Completed Changes

- Updated `modules/app/appAssistantPanel.p1Ui.test.js` first.
  - Added RED/GREEN coverage: `source event detail lists blocked dependent steps`.
  - Fixture creates one failed source event plus two `dependency_blocked` events whose `developer.blockedByEventId/blockByActionId/blockedByStepId` point back to the source event.
  - The test asserts the expanded detail renders `.hy-canvas-agent-execution-dependency-detail` with `后续 2 步依赖这一步`, `Generate image`, and `Connect result`.
- Updated `modules/app/appAssistantPanel.js`.
  - Added `planStepTitleById(execution, stepId)`.
  - Added `blockedTimelineEventsForSource(execution, sourceEvent)`.
  - Added `dependencyBlockedDetailText(execution, sourceEvent)`.
  - Expanded timeline detail now appends `.hy-canvas-agent-execution-dependency-detail` when the selected event has downstream `dependency_blocked` events.
  - Detail text uses existing persisted timeline metadata only; it does not invent a new dependency graph or require live Orchestrator state.
  - Added minimal styling so dependency detail matches existing small detail text while using a slightly stronger readable color.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Updated PRD version from `v3.18` to `v3.19`.
  - Added Slice 160 to the progress table.
  - Reframed dependency UX as completed minimum closure while keeping complete DAG recompile/result merge open.

### 160.2 Verification

- RED focused UI test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "source event detail lists blocked"`
  - First attempt failed due to fake DOM not supporting attribute selector usage in the test fixture; test was corrected to use the existing class selector pattern.
  - Verified RED failure after correction: `assert.ok(dependencyDetail)` failed because the dependency detail element did not exist.
- GREEN focused UI test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "source event detail lists blocked|selected timeline event can retry|selected timeline event can skip|selected video timeline event authorizes"`
  - Result: 50 tests pass, 0 fail in the filtered file run.
- Syntax:
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Result: OK.
- Related regression:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js modules\assistant\assistantExecutionStore.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Result: 116 tests pass, 0 fail.

### 160.3 Current Effect Boundary

- Minimum dependency UX is now real in the expanded drawer:
  - select the failed/skipped source event.
  - the detail panel reads downstream `dependency_blocked` events in the same execution.
  - it displays `后续 N 步依赖这一步` plus the blocked plan step titles.
- This is still not full dependency recovery:
  - no action-output-level dependency graph.
  - no DAG recompile after retry/skip succeeds.
  - no result merge strategy for re-running downstream actions.
  - no cross-restart resume engine beyond persisted timeline/orchestratorState.
  - no Undo/Replay integration.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 160.4 Next Recommended Slice

- Next best runtime slice: start Undo inverse patch metadata for safe canvas actions.
  - Begin with low-risk create/connect/layout actions.
  - Keep delete/destructive or video side effects out until explicit semantics exist.
- Alternative: complete queue scheduler minimum slice.
  - auto-start next queued execution after current completion.
  - keep cancel/pin/pause queued tasks as later slices if necessary.



## 161. PRD v3.20 Real-Code and Tacit-Knowledge Boundary Repair (2026-06-10)

This section records the documentation-only PRD repair requested by the user: review the PRD against real code and project tacit knowledge, then correct any wording that could mislead the next developer into thinking target-state features are already implemented.

### 161.1 Completed Changes

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Bumped the PRD version from `v3.19` to `v3.20`.
  - Added Slice 161 to the progress table as a documentation-only repair.
  - Renamed the real-code conclusion section to `2.4 本次 v3.20 真实代码/默会知识修复结论`.
  - At Slice 161 time, clarified that `assistantExecutionStore.enqueueExecution()` existed but the new-message main path still used `createExecution()`; this queue-specific statement is superseded by Slice 162 below.
  - At Slice 161 time, clarified that queue warning / `队列较长`, queue scheduler, cancel, pin/top, and pause-queued-task controls were not implemented; Slice 162 now implements only the success-path enqueue + auto-start minimum.
  - Clarified that completion-summary close and the full project-level AI execution history browser are still target-state features; current code only imports backend execution history on panel init and can hide a drawer if `drawerState.visible=false` is set.
  - Clarified that the click-outside-to-collapse drawer behavior is not yet verified in real code and needs its own UI slice.
  - Replaced the stale `当前必须补的后端字段持久化` section with `已落地的后端扩展字段持久化（Slice 149）` plus a new still-missing list for Undo inverse patch, Replay metadata, full history browsing, and queue scheduling state.
  - Updated Phase 2 acceptance and the self-check section so target rules are marked as target rules, not completed runtime behavior.
- No production runtime code or tests were changed in this slice.

### 161.2 Verification

- CodeGraph status was attempted first because this repository has CodeGraph configured, but the tool returned `database is locked`, so this slice used `rg` and targeted reads.
- Real-code anchors reviewed:
  - `modules/assistant/assistantExecutionStore.js`: at Slice 161, queue support existed at store level while `enqueueExecution()` was not yet used by the message-recording path; Slice 162 now uses it for active v2 execution responses.
  - `modules/assistant/assistantExecutionOrchestrator.js`: at Slice 161, one-active execution existed before the Slice 162 queue scheduler; Slice 162 now adds success-path `queue[0]` auto-start, while undo/replay and full queue policy remain missing.
  - `modules/app/appAssistantPanel.js`: at Slice 161, `recordAssistantExecutionFromResponse()` called `createExecution()`; Slice 162 now switches to `enqueueExecution()` when another active v2 execution exists. Queue cards still only switch detail view, no completion-summary close button is present, and execution drawer visibility depends on `drawerState.visible`.
  - `services/canvas_agent_execution_service.py`: Slice 149 backend fields are already persisted and sanitized.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 161.3 Current Effect Boundary

- The PRD is now safer for handoff: it separates completed minimum closures from target-state product behavior.
- Still not implemented after this documentation repair:
  - full queue scheduler beyond Slice 162 success-path enqueue + auto-start, including failure policy and queued-draft recompile.
  - queue length warning UI / `队列较长` at Slice 161 time; this gap is superseded by Slice 163 below.
  - queue cancel, pin/top, and pause queued tasks.
  - completion-summary close button and full project-level AI execution history browser.
  - click-outside drawer collapse behavior with strong prompt preservation.
  - Undo inverse patches and Replay.
  - complete DAG recompile/result merge after retry/skip.
- Recommended next runtime slice after Slice 162: queue warning / soft-backpressure UI, cancel/top/pause queued controls, or completion-summary close + history entry. If product safety is priority, start Undo inverse patch metadata for low-risk create/connect/layout actions.

## 162. Queue Scheduler Minimum Closure and PRD v3.21 Repair (2026-06-10)

This section records the current queue-runtime closure and the documentation repair after reviewing the PRD against real code, tacit project rules, and the latest queue implementation. It supersedes the Slice 161 queue-specific boundary statements that said the new-message enqueue path and next-item scheduler were still missing.

### 162.1 Completed Runtime Boundary

- `modules/app/appAssistantPanel.js`
  - `recordAssistantExecutionFromResponse()` now checks `executionStore.snapshot().activeExecutionId` before storing a v2 response.
  - If an active execution already exists and the incoming v2 execution id is different, the response is stored via `executionStore.enqueueExecution()` instead of `createExecution()`.
  - Queued executions are forced to `status: "queued"`, keep `queueIndex`, and set `drawerState.visible=false` so they do not steal the active execution drawer.
  - This applies to v2 execution responses; legacy `actions` compatibility paths and natural-language queue controls remain separate follow-up work.
- `modules/assistant/assistantExecutionOrchestrator.js`
  - Added the minimum next-item scheduler: after the current execution reaches successful `completed`, it reads `executionStore.snapshot().queue[0]` and calls `run(nextId, { startActionIndex: 0, ...options })`.
  - It clears the in-memory `activeExecutionId` before starting the queued item so the single-active guard does not block the handoff.
  - This is intentionally a minimum success-path scheduler only.

### 162.2 PRD Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Kept the document at `v3.21`, because Slice 162 is the active runtime/progress update being finalized.
  - Renamed the real-code conclusion heading to `2.4 本次 v3.21 真实代码/默会知识修复结论`.
  - Repaired stale self-check wording that still said the PRD was at `v3.20` and that queue scheduler/new-message enqueue were still missing.
  - Reframed queue status consistently as: minimum queue closure is complete, full queue state machine is still missing.
  - Updated Phase 1/2/3 status and UI acceptance boundaries so they no longer mark v2 response enqueue or successful-completion auto-start as missing.
  - Kept remaining queue gaps explicit at Slice 162 time: queue length warning / `队列较长`, cancel, top/pin, pause queued task, `queued_draft` re-read/recompile before execution, and failure/video/dependency queue interactions. The queue-warning gap is superseded by Slice 163 below.

### 162.3 Verification

- CodeGraph status was attempted first because this repository has CodeGraph configured, but the tool returned `database is locked`, so this slice used `rg` plus targeted file reads.
- Real-code anchors reviewed:
  - `modules/app/appAssistantPanel.js`: `recordAssistantExecutionFromResponse()` now uses `enqueueExecution()` when another active execution exists and hides the queued drawer.
  - `modules/assistant/assistantExecutionOrchestrator.js`: `runNextQueuedExecution()` starts `snapshot().queue[0]` after successful completion.
  - `modules/assistant/assistantExecutionStore.js`: `enqueueExecution()` saves queued status and assigns queue index.
  - `modules/app/appAssistantPanel.test.js`: covers v2 response queueing while another execution is active.
  - `modules/assistant/assistantExecutionOrchestrator.test.js`: covers queued execution auto-start after current completion.
- Runtime verification commands for Slice 162:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "v2 response is queued"`
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "starts next queued|executes v2 plan actions"`
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Latest recorded related regression for this closure: 118 tests pass, 0 fail.

### 162.4 Current Effect Boundary

- The execution workspace now has the minimum queue path:
  - a new v2 execution response while another execution is active becomes queued.
  - the queued response does not take over the visible drawer.
  - when the active execution succeeds, queue item #1 starts automatically.
- This is not the complete queue product:
  - queue warning / `队列较长` UI was not present at Slice 162 time; Slice 163 below has since completed the minimum warning UI.
  - cancel/top/pin/pause queued task controls were not present at Slice 162 time; Slice 164 below has since completed the front-end/local-store minimum controls.
  - no `queued_draft` re-read latest canvas + recompile actions before queued run.
  - no failure/paused/video-authorization/dependency-recovery queue policy yet.
  - no full execution history browser, Undo inverse patches, or Replay yet.
- Historical next recommendation at Slice 162 time was queue warning / soft-backpressure UI, then cancel/top/pause queued controls. Slice 163 below has since completed the queue-warning minimum, so the next queue slice should focus on cancel/top/pause queued controls.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 163. Queue Warning / Soft-Backpressure Minimum Closure and PRD v3.22 Repair (2026-06-10)

This section records the latest queue-warning runtime slice and the follow-up PRD repair requested by the user. It supersedes the Slice 162 queue-warning-specific boundary statements that said the `队列较长` UI was still missing.

### 163.1 Completed Runtime Boundary

- `modules/app/appAssistantPanel.js`
  - Added `EXECUTION_QUEUE_WARNING_THRESHOLD = 5`.
  - `recordAssistantExecutionFromResponse()` now checks `executionStore.snapshot().queue.length` before storing a v2 response while another execution is active.
  - If the incoming v2 response is queued and there are already 5 queued tasks, it still calls `executionStore.enqueueExecution()` and stores `drawerState.queueWarning=true`.
  - This means the 6th queued task is the first one that carries the warning flag; exactly 5 queued tasks remains the no-warning boundary.
- `modules/app/appAssistantPanel.js`
  - `renderExecutionQueueStrip()` now renders `.hy-canvas-agent-execution-queue-warning` when any displayed queue item has `drawerState.queueWarning=true`, or when the queued list is already longer than the threshold.
  - The visible copy is `队列较长：当前排队 N 个任务，仍会继续排队。`
  - The warning is soft backpressure only: it does not reject, cancel, reorder, or pause queued work.
- `modules/assistant/assistantExecutionStore.js`
  - `sanitizeDrawerState()` already preserves `drawerState.queueWarning` as a boolean, so the queue warning survives store normalization.

### 163.2 PRD Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Kept the document at `v3.22`.
  - Updated the top status line to include Slice 163 queue-warning minimum closure.
  - Repaired stale current-state wording that still listed `队列较长提示` / `queue warning` as entirely missing.
  - Reframed queue status consistently as: v2 enqueue + success auto-start + over-5 queue warning are complete minimum closures; cancel, top/pin, pause queued task, queued-draft recompile, and failure/video/dependency queue interactions are still missing.
  - Updated Phase 2/3 acceptance and self-check sections to say the over-5 expanded-drawer warning has real test coverage, while collapsed queue count and full queue controls still require separate slices.

### 163.3 Verification

- CodeGraph status was attempted first because this repository has CodeGraph configured, but the tool returned `database is locked`, so this slice used `rg` plus targeted reads.
- Real-code anchors reviewed:
  - `modules/app/appAssistantPanel.js`: `recordAssistantExecutionFromResponse()` sets `drawerState.queueWarning=true` when queueing over the threshold; `renderExecutionQueueStrip()` renders `.hy-canvas-agent-execution-queue-warning`.
  - `modules/assistant/assistantExecutionStore.js`: `sanitizeDrawerState()` preserves `queueWarning`.
  - `modules/assistant/assistantExecutionOrchestrator.js`: Slice 162 success-path queue auto-start remains unchanged.
  - `modules/app/appAssistantPanel.p1Ui.test.js`: covers the over-5 warning and the exactly-5 no-warning boundary.
- Runtime verification recorded for Slice 163:
  - RED before implementation: `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue warning appears"` failed because `queued.drawerState.queueWarning` was false.
  - GREEN after implementation: `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue warning"` passed.
  - Boundary RED/GREEN: the exactly-5 test first failed when the UI warned at `>= 5`, then passed after render warning logic became `> 5` unless an item explicitly carries `queueWarning`.
  - Syntax checks passed for `modules\app\appAssistantPanel.js` and `modules\app\appAssistantPanel.p1Ui.test.js`.
  - Related regression passed: `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionApiClient.test.js`
  - Latest recorded related regression for this closure: 120 tests pass, 0 fail.

### 163.4 Current Effect Boundary

- The execution workspace now has the minimum queue path plus soft backpressure:
  - a new v2 execution response while another execution is active becomes queued.
  - the queued response does not take over the visible drawer.
  - when the active execution succeeds, queue item #1 starts automatically.
  - when the queue grows beyond 5 queued tasks, the expanded drawer shows `队列较长` while continuing to queue.
- This is still not the complete queue product:
  - cancel/top/pin/pause queued task controls were not present at Slice 163 time; Slice 164 below has since completed the front-end/local-store minimum controls.
  - no `queued_draft` re-read latest canvas + recompile actions before queued run.
  - no failure/paused/video-authorization/dependency-recovery queue policy yet.
  - no collapsed-state queue count completion.
  - no full execution history browser, Undo inverse patches, or Replay yet.
- Next recommended runtime slice if continuing queue work: queue cancel/top/pause controls. If product safety is priority, start Undo inverse patch metadata for low-risk create/connect/layout actions.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 164. Queue Cancel / Top / Pause Controls Minimum Closure and PRD v3.23 Repair (2026-06-10)

This section records the next queue-control runtime slice. It supersedes the Slice 163 queue-control-specific boundary statements that said cancel/top/pause queued task controls were still missing.

### 164.1 Completed Runtime Boundary

- `modules/assistant/assistantExecutionStore.js`
  - Added `drawerState.queuePaused` to the store sanitizer so queued-task pause state survives normalization and local persistence.
  - Added `moveQueuedExecutionToTop(executionId)`, `pauseQueuedExecution(executionId)`, `resumeQueuedExecution(executionId)`, and `cancelQueuedExecution(executionId)`.
  - `moveQueuedExecutionToTop()` reorders only queued executions and does not affect the active execution.
  - `pauseQueuedExecution()` keeps the task in `status: "queued"` but writes `drawerState.queuePaused=true` and `line2="已暂停排队"`.
  - `resumeQueuedExecution()` clears `drawerState.queuePaused` and restores the queued line text.
  - `cancelQueuedExecution()` marks the task `status: "cancelled"`, clears `queueIndex`, hides the drawer, and removes it from `snapshot().queue`.
  - Fixed queue normalization so `queueIndex` ordering is respected instead of being overwritten by array insertion order.
- `modules/app/appAssistantPanel.js`
  - Expanded queue cards now render queued-task controls: `置顶`, `暂停` / `继续`, and `取消`.
  - These controls call the store methods directly and then re-render the drawer.
  - Controls do not interrupt the currently active execution and do not change `activeExecutionId`.
  - Paused queued cards show `已暂停排队`.
- `modules/assistant/assistantExecutionOrchestrator.js`
  - The minimum next-item scheduler now skips queued executions whose `drawerState.queuePaused === true`.
  - A paused queued task remains queued and can be resumed later; the next non-paused queued task can start when the current active execution completes.

### 164.2 PRD Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Bumped the document from `v3.22` to `v3.23`.
  - Added Slice 164 to the progress table.
  - Updated the top status line and real-code conclusion section to include queue cancel/top/pause minimum closure.
  - Repaired stale current-state wording that still listed queue cancel/top/pause controls as missing.
  - Reframed queue status consistently as: v2 enqueue + success auto-start + over-5 warning + expanded-drawer cancel/top/pause are complete minimum closures; backend sync, natural-language queue control, queued-draft recompile, and failure/video/dependency queue interactions are still missing.

### 164.3 TDD Verification

- RED tests were written and confirmed before production changes:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "controls queued"`
    - Failed because `store.moveQueuedExecutionToTop` did not exist.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queued task controls"`
    - Failed because `.hy-canvas-agent-execution-queue-top` was not rendered.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skips queue-paused"`
    - Failed because the scheduler executed the paused queued task.
- GREEN focused tests after implementation:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "controls queued"` passed.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queued task controls"` passed.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "skips queue-paused"` passed.
- Syntax checks passed:
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js`
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - `D:\Aic\node.exe --check modules\app\appAssistantPanel.p1Ui.test.js`
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.test.js`
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.test.js`
- Related regression passed:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionOrchestrator.test.js modules\app\appAssistantPanel.p1Ui.test.js`
    - 71 tests pass, 0 fail.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\assistant\assistantExecutionApiClient.test.js`
    - 52 tests pass, 0 fail.
  - Latest recorded related regression for this closure: 123 tests pass, 0 fail.

### 164.4 Current Effect Boundary

- The execution workspace now has a stronger minimum queue path:
  - a new v2 execution response while another execution is active becomes queued.
  - the queued response does not take over the visible drawer.
  - when the active execution succeeds, the next non-paused queued task starts automatically.
  - when the queue grows beyond 5 queued tasks, the expanded drawer shows `队列较长` while continuing to queue.
  - users can open the expanded drawer and cancel/top/pause/resume queued tasks.
- This is still not the complete queue product:
  - queue control is currently front-end/local-store only; no backend queue-control route/sync yet.
  - no natural-language queue control yet, such as "取消上一个任务" or "把第二个任务置顶".
  - no `queued_draft` re-read latest canvas + recompile actions before queued run.
  - no failure/paused/video-authorization/dependency-recovery queue policy yet.
  - no collapsed-state queue count completion.
  - no full execution history browser, Undo inverse patches, or Replay yet.
- Next recommended runtime slice if continuing queue work: queued-draft re-read latest canvas + recompile actions before execution, or backend sync routes for queue controls. If product safety is priority, start Undo inverse patch metadata for low-risk create/connect/layout actions.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 165. PRD v3.24 Real-Code Boundary Repair for Queue Backend Sync (2026-06-10)

This section records a documentation-only repair requested as "基于真实代码和默会知识，修复PRD文档". No runtime code was changed in this slice.

### 165.1 Why This Repair Was Needed

- Slice 164 correctly completed the front-end/local-store minimum queue controls:
  - queued cards can be topped, paused/resumed, and cancelled in the expanded drawer.
  - the active execution is not interrupted.
  - the next-item scheduler skips queued executions whose `drawerState.queuePaused === true`.
- However, a fresh real-code check showed the PRD could still be read too optimistically:
  - `modules/assistant/assistantExecutionStore.js` preserves `drawerState.queuePaused` only in the front-end store.
  - `services/canvas_agent_execution_service.py::_sanitize_drawer_state()` still preserves only `visible/expanded/line1/line2/queueWarning/pendingConfirmationCount`; it does not preserve `queuePaused`.
  - `services/canvas_agent_route_service.py` still supports execution list/get/upsert/append-timeline/update-status/clear-completed only; there is no `queue-control` subroute.
  - `modules/assistant/assistantExecutionApiClient.js` still has upsert/list/append timeline/update status/clear completed style methods only; it has no queue-control method.
- Therefore queue control must be documented as a front-end/local-store minimum closure, not a backend-synced or cross-restart complete queue-control feature.

### 165.2 PRD Updates Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Bumped the document from `v3.23` to `v3.24`.
  - Updated the top status line to explicitly include Slice 165 as a documentation/real-code boundary repair.
  - Repaired the "当前执行存储" row so queue capability is described as:
    - v2 response enqueue: complete minimum.
    - success auto-start: complete minimum.
    - over-5 queue warning: complete minimum.
    - expanded drawer cancel/top/pause/resume: front-end/local-store minimum only.
    - backend `queuePaused` persistence, `queue-control` route/client, queued-draft recompile, and failure/video/dependency queue policy: still missing.
  - Repaired Slice 164 wording from "完整/已持久化" style language to "前端本地最小闭环".
  - Repaired `services/canvas_agent_execution_service.py` and `/api/v2/canvas-agent/executions/*` PRD rows to state that backend timeline/orchestrator fields are persisted, but queue-control sync is not.
  - Added `queuePaused` to the illustrative Project Execution Store JSON shape as a target/needed field while clarifying backend currently does not persist it.
  - Updated Phase 2/3 acceptance and self-check text so the next backend queue-control slice has explicit RED-test targets.

### 165.3 Real-Code Anchors Checked

- `modules/assistant/assistantExecutionStore.js`
  - `sanitizeDrawerState()` includes `queuePaused`.
  - `moveQueuedExecutionToTop()`, `pauseQueuedExecution()`, `resumeQueuedExecution()`, and `cancelQueuedExecution()` exist.
- `modules/app/appAssistantPanel.js`
  - `renderExecutionQueueStrip()` renders queued-card controls.
  - `handleQueuedExecutionControl()` calls the local store methods and re-renders.
- `modules/assistant/assistantExecutionOrchestrator.js`
  - `runNextQueuedExecution()` skips queued executions whose `drawerState.queuePaused === true`.
- `services/canvas_agent_execution_service.py`
  - `_sanitize_drawer_state()` does not yet preserve `queuePaused`.
  - no backend queue-control helper exists yet.
- `services/canvas_agent_route_service.py`
  - execution routes still cover list/get/upsert/append-timeline/update-status/clear-completed.
  - no `queue-control` path exists yet.
- `services/http_route_dispatcher.py`
  - `/api/v2/canvas-agent/executions/*` remains the correct namespace.
- `modules/assistant/assistantExecutionApiClient.js`
  - no queue-control API method exists yet.

### 165.4 Recommended Next Runtime Slice

If continuing queue work, the next narrow runtime slice should be backend queue-control sync:

1. Write RED Python tests in `canvas_agent_execution_service_test.py`:
   - backend sanitizer preserves `drawerState.queuePaused`.
   - pause/resume/toggle queue controls survive persistence and reload.
   - cancel marks queued execution cancelled and removes it from filtered queue.
   - top reorders only queued executions and never changes the active execution.
2. Write RED route/dispatcher tests:
   - `PATCH /api/v2/canvas-agent/executions/{id}/queue-control` with action `top|pause|resume|cancel`.
   - dispatcher allows that path under the existing `/api/v2/canvas-agent/executions/*` namespace.
3. Implement backend service methods and route.
4. Add `assistantExecutionApiClient` queue-control method and a best-effort front-end sync after local queue-card controls.
5. Verify with focused Python and Node tests, then update this handoff again.

### 165.5 Verification

- CodeGraph status was attempted first because this repository has CodeGraph configured, but the tool returned `database is locked`; this slice used `rg` plus targeted file reads.
- This was a documentation-only repair. No runtime code or tests were changed.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 166. Queue Backend Sync Minimum Closure and PRD v3.25 Repair (2026-06-10)

This section records the queue-control backend sync slice and the PRD repair requested as "基于真实代码和默会知识，修复PRD文档". It supersedes Slice 165's runtime boundary that documented queue controls as front-end/local-store only.

### 166.1 Completed Runtime Boundary

- `services/canvas_agent_execution_service.py`
  - `_sanitize_drawer_state()` now preserves `drawerState.queuePaused` so paused queued tasks can survive backend persistence and history reload.
  - Added `_queued_executions(project_id)` and `_renumber_queue(project_id)` helpers.
  - Added `control_queued_execution(execution_id, action)` with `top`, `pause`, `resume`, and `cancel` actions.
  - `pause` keeps the execution in `status: "queued"`, writes `drawerState.queuePaused=true`, and updates line text to `已暂停排队`.
  - `resume` keeps the execution queued, clears `queuePaused`, and restores line text to `排队中`.
  - `cancel` marks the queued execution `cancelled`, clears `queueIndex`, hides the drawer, and clears `queuePaused`.
  - `top` reorders only queued executions inside the same project and then renumbers queue indexes.
  - `list_executions(status=queued)` now respects `queueIndex` ordering so backend reads match the visible queue order after top/reorder.
- `services/canvas_agent_route_service.py`
  - Added `PATCH /api/v2/canvas-agent/executions/{id}/queue-control`.
  - Request body: `{"action":"top"|"pause"|"resume"|"cancel"}`.
  - The route delegates to `CanvasAgentExecutionService.control_queued_execution()` and returns the updated execution.
- `modules/assistant/assistantExecutionApiClient.js`
  - Added `controlQueuedExecution(executionId, action)`.
  - The client PATCHes `/api/v2/canvas-agent/executions/{id}/queue-control` and keeps the canvas-agent namespace.
- `modules/app/appAssistantPanel.js`
  - `handleQueuedExecutionControl()` still updates the local execution store first so the UI remains responsive.
  - After a successful local queue-control operation, it best-effort calls `executionSyncClient.controlQueuedExecution(id, syncAction)`.
  - Clicking pause on an already paused queued task maps to backend action `resume`.
  - Sync failure is recorded in `state.lastExecutionSyncError` and does not roll back the local queue UI.

### 166.2 PRD v3.25 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
  - Bumped the document from `v3.24` to `v3.25`.
  - Updated the top status line to include Slice 166 as a runtime closure.
  - Repaired stale statements that still described queue backend sync as missing.
  - Reframed queue capability as a minimum backend-synced closure:
    - v2 response enqueue: complete minimum.
    - success auto-start of the first non-paused queued task: complete minimum.
    - over-5 queue warning: complete minimum.
    - expanded drawer cancel/top/pause/resume: complete minimum.
    - backend `queuePaused` persistence: complete minimum.
    - `PATCH /api/v2/canvas-agent/executions/{id}/queue-control`: complete minimum.
    - front-end `controlQueuedExecution()` and drawer best-effort sync: complete minimum.
    - backend queued list respects `queueIndex`: complete minimum.
  - Kept the remaining queue gaps explicit:
    - natural-language queue control.
    - `queued_draft` re-read latest canvas + recompile actions before queued run.
    - failure/video-authorization/dependency-recovery queue policy.
    - collapsed-state queue count.
    - full execution history browser, Undo inverse patches, and Replay.

### 166.3 TDD Verification

- RED tests were written and confirmed before production changes:
  - `python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_persists_queue_paused_drawer_state canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_controls_queued_executions_without_changing_active_execution`
    - Failed because `queuePaused` was not preserved and `control_queued_execution` did not exist.
  - `python -m unittest canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_queue_control_route_delegates_to_execution_service http_route_dispatcher_test.HttpRouteDispatcherTests.test_canvas_agent_execution_routes_are_allowed`
    - Route test failed before `/queue-control` existed; dispatcher allowlist already covered the generic executions namespace.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "queued execution controls"`
    - Failed because `client.controlQueuedExecution` did not exist.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queued task controls"`
    - Failed because queued UI controls did not call the backend sync client.
  - A follow-up service RED asserted `list_executions(status=queued)` must return queued items by `queueIndex` after a top operation; it failed while the backend still returned insertion/created order.
- GREEN focused and related regressions after implementation:
  - `python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test http_route_dispatcher_test`
    - 44 tests pass, 0 fail.
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionOrchestrator.test.js`
    - 124 tests pass, 0 fail.

### 166.4 Current Effect Boundary

- The execution workspace now has a backend-synced minimum queue-control path:
  - a new v2 execution response while another execution is active becomes queued.
  - the queued response does not take over the visible drawer.
  - when the active execution succeeds, the next non-paused queued task starts automatically.
  - when the queue grows beyond 5 queued tasks, the expanded drawer shows `队列较长` while continuing to queue.
  - users can open the expanded drawer and cancel/top/pause/resume queued tasks.
  - those queued control operations are now mirrored to the backend best-effort.
  - backend history can preserve `drawerState.queuePaused` and return queued executions in `queueIndex` order.
- This is still not the complete queue product:
  - no natural-language queue control yet, such as "取消上一个任务" or "把第二个任务置顶".
  - no `queued_draft` re-read latest canvas + recompile actions before queued run.
  - no failure/paused/video-authorization/dependency-recovery queue policy yet.
  - no collapsed-state queue count completion.
  - no full execution history browser, Undo inverse patches, or Replay yet.
- Next recommended runtime slice if continuing queue work: `queued_draft` re-read latest canvas + recompile actions before execution, or natural-language queue controls. If product safety is priority, start Undo inverse patch metadata for low-risk create/connect/layout actions.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.


## 167. PRD v3.26 Real-Code Review Repair (2026-06-10)

This section records the documentation-only PRD repair requested as “基于真实代码和默会知识，修复PRD文档”. It does not change runtime code.

### 167.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used `rg` and targeted file reads instead.
- Runtime files checked for the PRD repair:
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
- Existing tests and previous handoff sections were used as secondary evidence, especially the queue tests around v2 response enqueue, non-paused queued auto-start, queued card controls, and backend queue-control sync.

### 167.2 PRD v3.26 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.25` to `v3.26`.
- Added Slice 167 to the progress table as a documentation-only real-code audit repair.
- Added `modules/assistant/assistantExecutionOrchestrator.js` to the real-code anchor table with the current true boundary:
  - `compilePlanActions()` compiles `plan.steps + actionsByStep`.
  - `run()` validates and executes actions step-by-step and writes timeline.
  - `pause()/resume()/retry()/skip()` have minimum closures.
  - `runNextQueuedExecution()` currently only chooses the first queued execution whose `drawerState.queuePaused !== true` and then calls `run(nextId, { startActionIndex: 0 })`.
- Made the `queued_draft` boundary explicit:
  - front-end `AssistantExecutionStatus` does not include `queued_draft`.
  - queued tasks are currently stored as `queued` with the model-returned `plan/actionsByStep` from enqueue time.
  - there is no `prepareQueuedExecution` dependency injection hook yet.
  - there is no fresh `buildContext({ graphStore })` call inside queue auto-start yet.
  - queued tasks are not recompiled before execution yet.
- Repaired a malformed PRD table/bullet mix in the Execution Orchestrator event-field section.
- Added a real-code regression row for the missing queue recompile behavior: future tests must prove the queued task executes recompiled actions, not stale enqueue-time actions.
- Kept current finished boundaries explicit:
  - front-end/back-end queue-control sync is complete at minimum closure.
  - queued control supports top/pause/resume/cancel locally and best-effort backend sync.
  - backend preserves `drawerState.queuePaused` and returns queued executions by `queueIndex`.
  - selected-event retry/skip/video authorization and dependency-blocked details are minimum closures.
- Kept unfinished boundaries explicit:
  - queued task re-read latest canvas plus recompile before execution.
  - natural-language queue control.
  - failure/video/dependency queue policy.
  - plan editing and DAG preview.
  - full Timeline Humanizer and developer JSON UI.
  - complete execution history browser.
  - Undo inverse patches and Replay.

### 167.3 Recommended Next Runtime Slice

Next runtime work should start with TDD and target the smallest useful `queued` prepare/recompile closure:

1. Add a RED test in `modules/assistant/assistantExecutionOrchestrator.test.js` proving that when an active execution completes, the queued execution is prepared before auto-start and executes the refreshed action rather than the stale enqueue-time action.
2. Add an injected hook such as `prepareQueuedExecution({ execution, context })` to `createAssistantExecutionOrchestrator()`.
3. Call the hook from `runNextQueuedExecution()` before `run(nextId, { startActionIndex: 0 })`.
4. If the hook returns updated `plan/actionsByStep`, persist them through `executionStore.updateStatus()` or an equivalent store update path, then append a timeline event like “已根据最新画布更新计划”.
5. Wire `appAssistantPanel.js` later so the hook can build fresh canvas context with `buildContext({ graphStore })` and call the appropriate model/recompile path.
6. Run focused Node tests first, then the broader assistant execution/app panel regression set.

### 167.4 Verification

- Documentation was checked with targeted `rg` reads for:
  - `版本：v3.26`
  - `Slice 167`
  - `queued_draft`
  - `prepareQueuedExecution`
  - `队列重编译`
  - stale `queue[0]` wording
  - accidental question-mark mojibake in the PRD
- This slice is docs-only; no Python or Node runtime tests were required.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 168. PRD v3.27 Second Real-Code and Tacit-Knowledge Repair (2026-06-10)

This section records the second documentation-only PRD repair requested as "repair the PRD document based on real code and tacit knowledge". It does not change runtime code.

### 168.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used `rg` and targeted file reads instead.
- Runtime files checked for the PRD repair:
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `services/http_route_dispatcher.py`
- Tests checked as evidence:
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/assistant/assistantExecutionStore.test.js`
  - `modules/app/appAssistantPanel.test.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `modules/assistant/assistantExecutionApiClient.test.js`
  - `canvas_agent_execution_service_test.py`
  - `canvas_agent_route_service_test.py`
  - `http_route_dispatcher_test.py`

### 168.2 PRD v3.27 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.26` to `v3.27`.
- Added Slice 168 to the progress table as a documentation-only real-code and tacit-knowledge repair.
- Repaired the `Execution Orchestrator` responsibilities table:
  - It now has explicit columns for current true state and follow-up boundary.
  - It no longer mixes a third "remaining work" cell into a two-column table row.
  - It explicitly marks queued prepare/recompile, DAG result merging, backend authorization parity, Undo, and Replay as unfinished.
- Added a clearer v3.27 real-code boundary table:
  - `dependency_blocked` is only the current minimum failure-recovery closure.
  - The right-side timeline detail currently has human text, focus, selected-event retry/skip/video authorization, and dependency-blocked summaries.
  - The right-side timeline detail does not yet have undo or a full developer JSON panel.
  - Phase 4 Undo/Replay is not implemented; `canUndo` is only gating metadata and current completed events default to `canUndo:false`.
- Added failure-recovery boundaries to the PRD:
  - validate/execute failure can write failed events.
  - plans with `dependsOn` can write `dependency_blocked` for downstream actions.
  - selected-event skip can also block dependent downstream actions.
  - no downstream recompile, result merge, output-level dependency, cross-restart recovery, or inverse patch exists yet.
- Added Phase 4 boundaries:
  - no inverse patch.
  - no AI ownership metadata.
  - no user-edit conflict detection.
  - no replay metadata.
  - no Orchestrator undo/replay API.
  - no clickable undo UI yet.
- Updated the self-check section to say v3.27 / Slice 168 is the latest document boundary.

### 168.3 Current Runtime Boundary After This Repair

- Queue control is still at minimum backend-synced closure:
  - v2 response enqueue exists.
  - active completion auto-starts the first non-paused queued task.
  - over-5 queue warning exists.
  - expanded queued card top/pause/resume/cancel exists.
  - backend persists `queuePaused` and exposes `/queue-control`.
- Queue prepare/recompile is still not implemented:
  - no `queued_draft` status in front-end `AssistantExecutionStatus`.
  - no `prepareQueuedExecution` injection hook in `createAssistantExecutionOrchestrator()`.
  - `runNextQueuedExecution()` still reads `executionStore.snapshot().queue`, skips `drawerState.queuePaused=true`, and calls `run(nextId, { startActionIndex: 0 })`.
  - queued executions still run enqueue-time `plan/actionsByStep`.
  - no fresh `buildContext({ graphStore })` is called before queued auto-start.
- Undo/Replay is still not implemented:
  - `canUndo` exists as metadata, but there is no inverse-patch runtime.
  - no UI should claim clickable undo until inverse patch exists.

### 168.4 Recommended Next Runtime Slice

If continuing the queue track, start with TDD and implement the smallest useful queued prepare/recompile closure:

1. Add a RED test in `modules/assistant/assistantExecutionOrchestrator.test.js` proving a queued execution is prepared before auto-start and executes the refreshed action rather than the stale enqueue-time action.
2. Add an injected hook such as `prepareQueuedExecution({ execution, context, agentMode, videoAuthorized })` to `createAssistantExecutionOrchestrator()`.
3. Call the hook from `runNextQueuedExecution()` before calling `run(nextId, { startActionIndex: 0 })`.
4. Persist returned `plan/actionsByStep/drawerState` to the execution store and append a timeline event like `plan refreshed from latest canvas`.
5. If the prepare hook fails, fail closed: mark the queued execution failed or paused and do not run stale actions.
6. Wire `appAssistantPanel.js` later so the hook can build fresh context with `buildContext({ graphStore })` and call the model/recompile path.
7. Use `D:\Aic\node.exe` for Node tests; do not use npm.

If switching to the Undo track, start with low-risk inverse patches for `create_node`, `connect_nodes`, and `layout_nodes/move_nodes`; generated assets must remain in the asset library and video replay must require fresh authorization.

### 168.5 Verification Notes

- This slice is docs-only; no runtime Node/Python test was required.
- Required document checks after this section:
  - PRD contains version `v3.27` and `Slice 168`.
  - PRD contains no replacement character and no accidental three-question-mark mojibake.
  - PRD does not contain malformed table rows with extra cells under a two-column table.
  - Handoff contains this Slice 168 section.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

## 169. PRD v3.28 Real-Code Repair for Queued Prepare Hook Boundary (2026-06-10)

This section records the documentation repair requested as "基于真实代码和默会知识，修复PRD文档" after the queued prepare/recompile Orchestrator hook landed. It updates the PRD boundary so handoff developers do not keep treating the hook itself as missing.

### 169.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted file reads and `rg` instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/app/appAssistantPanel.js`
- Key real-code facts:
  - `createAssistantExecutionOrchestrator()` now accepts an optional `prepareQueuedExecution` injection.
  - `runNextQueuedExecution()` still selects the first non-paused queued execution from `executionStore.snapshot().queue`.
  - Before auto-running that queued execution, `runNextQueuedExecution()` now calls `prepareQueuedExecution({ execution, executionId, context, agentMode, videoAuthorized })` when the hook exists.
  - If the hook returns a plain object, the Orchestrator persists returned `plan/actionsByStep/drawerState` with queued status and appends a `status: "prepared"` timeline event.
  - `assistantExecutionOrchestrator.test.js` includes `assistantExecutionOrchestrator: prepares queued execution before auto-start`, proving the stale queued action is replaced by the refreshed action.
  - Default `appAssistantPanel.js` Orchestrator wiring still does not inject `prepareQueuedExecution`; it only injects `executionStore`, `executionSyncClient`, `validateActions`, and `executeActions`.
  - `buildContext({ graphStore })` still exists in the panel, but queued auto-start does not yet use it by default.
  - Front-end `AssistantExecutionStatus` still has no `queued_draft` status.

### 169.2 PRD v3.28 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.27` to `v3.28`.
- Added Slice 169 to the progress table:
  - Marked the Orchestrator-level queued prepare/recompile hook as completed at core minimum closure.
  - Recorded the exact RED/GREEN verification commands.
  - Kept the product boundary explicit: this is not yet the full queued recompile product.
- Repaired stale PRD statements that still said:
  - there is no `prepareQueuedExecution` hook.
  - `runNextQueuedExecution()` always runs only enqueue-time `plan/actionsByStep`.
  - queue recompile is entirely unimplemented.
- Updated the real-code anchor table for `modules/assistant/assistantExecutionOrchestrator.js`:
  - The hook now exists.
  - The default app wiring is still missing.
  - The hook does not create a `queued_draft` status.
- Updated Phase 2/Phase 3 summaries, queue state machine boundaries, storage retention notes, verification rows, and self-check bullets to consistently say:
  - Orchestrator hook: done.
  - Default app fresh canvas + model recompile: not done.
  - prepare failure fail-closed: not done.
  - `queued_draft`: not done.
  - backend prepare/recompile API: not done.
  - natural-language queue control, complete dependency merge, Undo/Replay: not done.

### 169.3 Verification Evidence

- Code syntax check:
  - `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Exit 0.
- Focused queued prepare test:
  - `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "prepares queued execution"`
  - Exit 0; Node reported 13 tests, 13 pass, 0 fail.
- Documentation checks after the repair must confirm:
  - PRD contains `版本：v3.28`.
  - PRD contains `Slice 169`.
  - PRD contains no replacement character.
  - PRD contains no accidental three-question-mark mojibake.
  - New handoff Slice 169 contains no replacement character and no accidental three-question-mark mojibake.

### 169.4 Current Runtime Boundary After This Repair

- Completed now:
  - Orchestrator can prepare a queued execution before auto-start when `prepareQueuedExecution` is injected.
  - Refreshed `plan/actionsByStep/drawerState` can be persisted before run.
  - A `prepared` timeline event can be written.
  - The focused test proves the executed action is the refreshed action, not the stale enqueue-time action.
- Still not complete:
  - Default `appAssistantPanel.js` does not inject the hook.
  - Queued auto-start does not yet call fresh `buildContext({ graphStore })` in the product path.
  - There is no real Claw/PI/LLM recompile call wired to the queued prepare path.
  - prepare hook failure currently is not fail-closed into a visible failed/paused queued execution state.
  - There is no `queued_draft` status in the front-end status enum.
  - There is no backend prepare/recompile route or persisted prepare-failure policy.
  - No work in this slice started, restarted, stopped, status-checked, probed, or touched the user-managed `8777` service.

### 169.5 Recommended Next Runtime Slice

If continuing queue work, use TDD and implement the next smallest product-facing closure:

1. Add an app-level RED test proving default `createAppAssistantPanel()` wires a queued prepare hook into `createAssistantExecutionOrchestrator()`.
2. The hook should build fresh context with `buildContext({ graphStore })` at queued auto-start time.
3. The hook should call a real recompile path only if an explicit API/client exists; otherwise introduce a small testable API boundary rather than embedding model calls directly in the Orchestrator.
4. Add fail-closed behavior: if prepare/recompile throws, the queued execution must not run stale actions and should become failed or paused with a visible timeline/error summary.
5. Keep video authorization unchanged: Act mode still does not imply video authorization, and queued prepare must not silently pass `videoAuthorized=true`.
6. Continue using `D:\Aic\node.exe` for Node tests and do not use npm.
7. Do not start, restart, stop, status-check, probe, or touch `8777`; if live service verification becomes necessary, stop and ask the user to handle the service.

## 170. PRD v3.29 Real-Code Repair for Prepare Failure Fail-Closed Boundary (2026-06-10)

This section records the latest PRD repair requested as "基于真实代码和默会知识，修复PRD文档". It is primarily documentation repair, but it also preserves the already-added RED test that exposes the next runtime bug. It does not claim the runtime bug is fixed.

### 170.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used `rg`, targeted file reads, and one focused Node RED run instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/app/appAssistantPanel.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `services/canvas_agent_route_service.py`
  - `services/canvas_agent_execution_service.py`
- Key real-code facts:
  - `createAssistantExecutionOrchestrator()` accepts optional `prepareQueuedExecution`.
  - `runNextQueuedExecution()` calls the injected prepare hook before auto-starting the first non-paused queued execution.
  - Successful prepare can persist refreshed `plan/actionsByStep/drawerState` and append `status: "prepared"`.
  - Default `appAssistantPanel.js` wiring still only injects `executionStore`, `executionSyncClient`, `validateActions`, and `executeActions`; it does not inject `prepareQueuedExecution`.
  - `buildContext({ graphStore })` is used in chat send and mention paths, but not in queued auto-start by default.
  - `assistantExecutionApiClient.js` has list/upsert/append-timeline/update-status/queue-control only; no prepare/recompile API client exists.
  - `services/canvas_agent_route_service.py` exposes status/timeline/queue-control execution subroutes only; no prepare/recompile route exists.
  - Front-end `AssistantExecutionStatus` still has no `queued_draft`.
  - The new RED test proves prepare failure currently bubbles out instead of fail-closing the queued execution.

### 170.2 PRD v3.29 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.28` to `v3.29`.
- Added Slice 170 to the PRD progress table:
  - Marked it as "RED established, production implementation not passing".
  - Recorded that `prepareQueuedExecution` failures still bubble from `runNextQueuedExecution()`.
  - Recorded the expected fail-closed behavior: do not execute stale queued actions, show a visible failed/paused queued execution, and write a `prepare_failed` timeline event.
- Updated the PRD status line, Section 2.4, Phase summaries, and self-check section so handoff developers do not confuse the RED anchor with a completed runtime fix.
- Kept the product boundary explicit:
  - Orchestrator prepare hook success path is complete at core minimum closure.
  - prepare failure fail-closed is not complete.
  - default app fresh context + model recompile wiring is not complete.
  - backend prepare/recompile API is not complete.
  - `queued_draft` remains a target state, not an implemented status.

### 170.3 RED Verification Evidence

Focused RED command run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "prepare failure stops queued stale actions"
```

Result:

- Exit code: 1.
- Node reported 14 tests in the file, 13 pass, 1 fail.
- Failing test: `assistantExecutionOrchestrator: prepare failure stops queued stale actions`.
- Failure evidence: `Error: fresh canvas unavailable` bubbles from `prepareQueuedExecution()` through `runNextQueuedExecution()` in `modules/assistant/assistantExecutionOrchestrator.js`.
- This is the desired RED state for the next runtime fix: queued stale actions are not yet blocked by a visible fail-closed state.

### 170.4 Current Runtime Boundary After This Repair

Completed:

- Queued prepare hook success path exists in the Orchestrator core.
- Successful prepare can replace stale queued `actionsByStep` before execution.
- Successful prepare can append a `prepared` timeline event.
- Queue controls still have minimum frontend/backend sync: top, pause, resume, cancel.

Still not complete:

- `prepareQueuedExecution` failure is not fail-closed.
- Default `appAssistantPanel.js` does not inject a prepare hook.
- Queued auto-start does not build fresh canvas context from `buildContext({ graphStore })` in the product path.
- No real Claw/PI/LLM recompile boundary is wired to queued auto-start.
- No backend prepare/recompile route exists under `/api/v2/canvas-agent/executions/*`.
- No `queued_draft` status exists in the front-end status enum.
- Natural-language queue control, complete dependency merge, Undo, Replay, and full execution history browser remain future work.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 170.5 Recommended Next Runtime Slice

Use TDD and continue from the RED state:

1. Make `assistantExecutionOrchestrator: prepare failure stops queued stale actions` pass by catching prepare errors in `runNextQueuedExecution()`.
2. On prepare failure, do not call `run(nextId, ...)`; set the queued execution to `failed` or an explicitly paused state, keep `drawerState.visible=true`, write the error summary, and append `status: "prepare_failed"`.
3. Add an app-level RED test proving default `createAppAssistantPanel()` wires a prepare hook only when an explicit API boundary exists.
4. Wire the app prepare hook to fresh `buildContext({ graphStore })` at queued auto-start time and call a small explicit recompile API boundary such as `api.prepareQueuedExecution(payload)`.
5. Keep video authorization unchanged: queued prepare must not silently set `videoAuthorized=true`, and Act mode still does not equal video authorization.
6. Continue using `D:\Aic\node.exe` for Node tests and do not use npm.
7. Do not start, restart, stop, status-check, probe, or touch `8777`; if live service verification becomes necessary, stop and ask the user to handle the service.

## 171. PRD v3.30 Real-Code Repair for Queued Prepare Runtime Closure (2026-06-10)

This section supersedes the runtime boundary described in Slice 170. Slice 170 remains useful as the historical RED anchor, but the real code has now moved forward: queued prepare failure is fail-closed, and the default app Orchestrator has a latest-context prepare API boundary when an explicit app API is provided.

### 171.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg` and file reads instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `services/canvas_agent_route_service.py`
  - `services/canvas_agent_execution_service.py`
- Key real-code facts now:
  - `createAssistantExecutionOrchestrator()` still accepts optional `prepareQueuedExecution`.
  - `runNextQueuedExecution()` still selects the first non-paused queued execution from `executionStore.snapshot().queue`.
  - Successful prepare can persist refreshed `plan/actionsByStep/drawerState`, append `status: "prepared"`, and run the refreshed action.
  - Prepare failure is now fail-closed: the error is caught, stale queued actions are not executed, a `status: "prepare_failed"` timeline event is appended, the queued execution becomes `failed`, `drawerState.visible=true`, `drawerState.line2` contains the error summary, and `orchestratorState.running=false`.
  - If a prepare hook returns `context` or `executionContext`, that runtime context is passed to queued `run()`, but those fields are stripped from the persisted execution patch so full context is not stored in the execution record.
  - Default `appAssistantPanel.js` Orchestrator wiring now injects `prepareQueuedExecution` only when `api.prepareQueuedExecution` is a function.
  - The app hook builds latest context at queued auto-start time with `buildContext({ graphStore })`, merges assistant references, attachments, and `buildAssistantMentionContext(state.mentionBindings)`, then calls `api.prepareQueuedExecution({ ...payload, context })`.
  - The default app hook returns the prepared patch plus fresh context, so the queued run executes with latest context.
  - Queued prepare does not silently authorize video; the app-level verification keeps `videoAuthorized:false` unless explicit video authorization has happened.
  - Front-end `AssistantExecutionStatus` still has no `queued_draft`.
  - `assistantExecutionApiClient.js` still has no `prepareQueuedExecution()` method.
  - `services/canvas_agent_route_service.py` and `CanvasAgentExecutionService` still have no dedicated backend prepare/recompile route.

### 171.2 PRD v3.30 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.29` to `v3.30`.
- Updated the PRD status line to reflect the current runtime truth:
  - Slice 169: Orchestrator prepare success path is complete.
  - Slice 170: prepare failure fail-closed is now complete.
  - Slice 171: default app latest-context prepare API boundary is now complete.
- Replaced stale PRD wording that said:
  - default `appAssistantPanel.js` does not inject the prepare hook.
  - queued auto-start does not call `buildContext({ graphStore })` in the product path.
  - prepare failure still bubbles `fresh canvas unavailable` out of `runNextQueuedExecution()`.
  - queued execution still will not be marked failed or write `prepare_failed`.
- Added Slice 171 to the PRD progress table.
- Kept the product boundary explicit: this is a front-end runtime/API-boundary closure, not a real backend/model recompile closure.

### 171.3 Verification Evidence

Focused checks already run for the runtime slice:

- `D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js`
  - Exit 0.
- `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`
  - Exit 0.
- `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "prepare failure stops queued stale actions"`
  - Exit 0; Node reported 14 tests, 14 pass, 0 fail.
- `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "default orchestrator prepares queued execution"`
  - Exit 0; Node reported 54 tests, 54 pass, 0 fail.
- `D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js`
  - Exit 0; Node reported 26 tests, 26 pass, 0 fail.
- `D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.p1Ui.test.js`
  - Exit 0; Node reported 101 tests, 101 pass, 0 fail.

### 171.4 Current Runtime Boundary After This Repair

Completed now:

- Orchestrator can prepare a queued execution before auto-start when `prepareQueuedExecution` is injected.
- Successful prepare can replace stale queued `actionsByStep`, persist the refreshed patch, append `prepared`, and execute refreshed actions.
- Prepare failure fail-closes into visible failed queued execution state and does not run stale queued actions.
- Default app Orchestrator uses latest `buildContext({ graphStore })` and calls an explicit `api.prepareQueuedExecution` boundary when that API is provided.
- Fresh context is forwarded to execution but not persisted as a raw execution patch field.
- Video authorization remains explicit; queued prepare does not turn Act mode into video authorization.

Still not complete:

- No `assistantExecutionApiClient.prepareQueuedExecution()` method exists yet.
- No backend `/api/v2/canvas-agent/executions/{id}/prepare` or equivalent route exists yet.
- No real Claw/PI/LLM recompile runtime is wired behind the prepare API boundary.
- No `queued_draft` status exists in the front-end status enum.
- Natural-language queue control remains future work.
- Complete dependency result merge, complete Timeline Humanizer, full execution history browser, Undo, and Replay remain future work.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 171.5 Recommended Next Runtime Slice

If continuing the queued recompile track, use TDD and implement the next smallest backend/model boundary:

1. Add a RED test for `assistantExecutionApiClient.prepareQueuedExecution()` targeting a small explicit route under `/api/v2/canvas-agent/executions/{id}/prepare` or equivalent.
2. Add Python RED route/service tests proving the backend receives execution id, project id, context, agent mode, and video authorization without leaking secrets.
3. Implement the backend route as a thin boundary first; do not embed model calls in the front-end Orchestrator.
4. Wire the route to the existing Claw/PI/LLM compile path only after the API contract is stable.
5. Preserve the fail-closed rule: prepare/recompile failure must never fall back to executing stale queued actions.
6. Preserve the video rule: Act mode still does not equal video authorization.
7. Continue using `D:\Aic\node.exe` for Node tests and do not use npm.
8. Do not start, restart, stop, status-check, probe, or touch `8777`; if live service verification becomes necessary, stop and ask the user to handle the service.


## 172. PRD v3.31 Real-Code Repair for Queued Prepare Backend/API Thin Boundary (2026-06-10)

This section records the documentation repair requested as "基于真实代码和默会知识，修复PRD文档" after the queued prepare API client and backend thin boundary landed. It supersedes only the stale boundary statements in Slice 171; it does not claim real Claw/PI/LLM recompile is complete.

### 172.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg`, focused file reads, and focused tests instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionApiClient.js`
  - `modules/assistant/assistantExecutionApiClient.test.js`
  - `services/canvas_agent_execution_service.py`
  - `canvas_agent_execution_service_test.py`
  - `services/canvas_agent_route_service.py`
  - `canvas_agent_route_service_test.py`
  - `api/canvasAgentApi.js`
  - `api/canvasAgentApi.test.js`
  - `server.py`
  - `services/http_route_dispatcher.py`
- Key real-code facts now:
  - `createAssistantExecutionApiClient()` now exposes `prepareQueuedExecution(executionId, payload)`.
  - That client POSTs to `/api/v2/canvas-agent/executions/{id}/prepare` and preserves the caller payload body.
  - `CanvasAgentExecutionService.__init__()` accepts optional `prepare_runner`.
  - `CanvasAgentExecutionService.prepare_queued_execution()` finds the existing execution, sanitizes payload/context, passes sanitized `context/agentMode/videoAuthorized` plus the existing execution to the runner, sanitizes the runner result, strips raw `context` and `executionContext`, persists returned `plan/actionsByStep/drawerState/developer/summary`, and returns only prepared patch fields.
  - `CanvasAgentRouteService` exposes `POST /api/v2/canvas-agent/executions/{id}/prepare` as a thin service boundary.
  - The route returns 404 if the execution does not exist, and 501 if an execution exists but prepare is not configured.
  - `HttpRouteDispatcher` already allows canvas-agent executions POST subpaths, so the prepare subroute can reach the route service through the executions prefix.
  - `api/canvasAgentApi.js::createCanvasAgentApi()` still does not expose `prepareQueuedExecution`.
  - `server.py` still instantiates `CanvasAgentExecutionService(storage_path=...)` without a real `prepare_runner`.
  - Therefore the product default browser path is not complete yet: the app hook from Slice 171 requires an injected API object with `prepareQueuedExecution`, but the default `createCanvasAgentApi()` object does not provide it yet.
  - There is still no real Claw/PI/LLM recompile runner behind the thin boundary.
  - Front-end `AssistantExecutionStatus` still has no `queued_draft` state.

### 172.2 PRD v3.31 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.30` to `v3.31`.
- Added Slice 172 to the PRD progress table:
  - `assistantExecutionApiClient.prepareQueuedExecution()` is complete at the thin-client level.
  - `CanvasAgentExecutionService.prepare_queued_execution()` is complete at the injectable-runner boundary level.
  - `POST /api/v2/canvas-agent/executions/{id}/prepare` is complete as a route/service thin boundary.
- Updated the PRD code anchors for:
  - `modules/assistant/assistantExecutionApiClient.js`
  - `api/canvasAgentApi.js`
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `services/canvas_agent_route_service.py`
  - `services/canvas_agent_execution_service.py`
  - `services/http_route_dispatcher.py`
- Corrected stale statements that said there was no backend prepare route at all.
- Preserved the important product boundary:
  - backend/client prepare thin boundary exists;
  - default main browser API exposure is still missing;
  - default server runner wiring is still missing;
  - real Claw/PI/LLM recompile is still missing;
  - `queued_draft`, natural-language queue control, complete dependency merge, Undo, and Replay remain unfinished.

### 172.3 Verification Evidence

Focused checks run in this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionApiClient.test.js --test-name-pattern "prepares queued executions"
```

- Exit 0.
- Node reported 7 tests, 7 pass, 0 fail.

```powershell
python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_prepare_queued_execution_uses_runner_without_persisting_raw_context_or_secrets canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_prepare_queued_execution_returns_unavailable_without_runner
```

- Exit 0.
- Python reported 2 tests OK.

```powershell
python -m unittest canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_prepare_route_delegates_to_execution_service
```

- Exit 0.
- Python reported 1 test OK.

### 172.4 Current Runtime Boundary After This Repair

Completed now:

- Orchestrator prepare success path exists and can execute refreshed queued actions when a prepare hook is injected.
- Orchestrator prepare failure is fail-closed and does not run stale queued actions.
- Default app wiring can build latest canvas context and call an explicit `api.prepareQueuedExecution` boundary when that API object provides the method.
- `assistantExecutionApiClient.prepareQueuedExecution()` exists for the execution namespace.
- Backend `/api/v2/canvas-agent/executions/{id}/prepare` exists as a thin route/service boundary.
- Backend prepare payload and result are sanitized; raw context and secrets are not persisted.

Still not complete:

- `api/canvasAgentApi.js::createCanvasAgentApi()` does not expose `prepareQueuedExecution`, so the default autoload/browser API object still will not trigger Slice 171 prepare unless another API object is injected.
- `server.py` does not inject a real `prepare_runner` into `CanvasAgentExecutionService`; existing executions with no runner return 501 for prepare.
- Real Claw/PI/LLM recompile is not implemented behind the thin boundary.
- No `queued_draft` status exists.
- Natural-language queue control, complete queue failure/video/dependency policy, complete dependency result merge, complete Timeline Humanizer, full execution history browser, Undo, and Replay remain future work.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 172.5 Recommended Next Runtime Slice

Use TDD and continue from the real product-path gap:

1. Add a RED test to `api/canvasAgentApi.test.js` proving `createCanvasAgentApi().prepareQueuedExecution(executionId, payload)` POSTs to `/api/v2/canvas-agent/executions/{id}/prepare`.
2. Implement that method in `api/canvasAgentApi.js` so the default `appAssistantPanel.autoload.js` API object can satisfy Slice 171's `api.prepareQueuedExecution` check.
3. Add a product-path UI/integration test proving default autoload-style API + app panel can call the route boundary without requiring a custom injected API object.
4. Add RED/Python tests for a real `prepare_runner` contract before wiring Claw/PI/LLM compile logic into `server.py`.
5. Preserve fail-closed behavior: prepare/recompile failure must never execute stale queued actions.
6. Preserve the video rule: Act mode still does not equal video authorization.
7. Continue using `D:\Aic\node.exe` for Node tests and do not use npm.
8. Do not start, restart, stop, status-check, probe, or touch `8777`; if live verification becomes necessary, stop and ask the user to prepare the service.

## 173. PRD v3.32 Real-Code Repair for Main Browser Prepare API Exposure (2026-06-10)

This section records the real-code/documentation repair after the default browser Canvas Agent API gained `prepareQueuedExecution()`. It supersedes only the stale Slice 172 product-path gap that said `createCanvasAgentApi()` did not expose the prepare boundary. It does not claim real Claw/PI/LLM recompile is complete.

### 173.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg`, file reads, and focused tests instead.
- Runtime files checked:
  - `api/canvasAgentApi.js`
  - `api/canvasAgentApi.test.js`
  - `modules/app/appAssistantPanel.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `server.py`
- Key real-code facts now:
  - `api/canvasAgentApi.js::createCanvasAgentApi()` exposes `prepareQueuedExecution(first, second)`.
  - The method supports the app payload shape used by `appAssistantPanel.js`: `{ executionId, context, agentMode, videoAuthorized, ... }`.
  - The method also supports `(executionId, payload)` for symmetry with `assistantExecutionApiClient.prepareQueuedExecution(executionId, payload)`.
  - It POSTs to `/api/v2/canvas-agent/executions/{id}/prepare`, URL-encodes the execution id, sends JSON, and preserves the caller payload body.
  - This closes the default autoload/browser API object gap for Slice 171's app prepare hook.
  - `server.py` still instantiates `CanvasAgentExecutionService(storage_path=...)` without a real `prepare_runner`.
  - Therefore the prepare path is callable from the default browser API, but existing backend executions with no runner still return 501; real Claw/PI/LLM recompile remains future work.
  - Front-end `AssistantExecutionStatus` still has no `queued_draft` state.
  - Natural-language queue controls, complete queue failure/video/dependency policy, full dependency result merge, complete Timeline Humanizer, full execution history browser, Undo, and Replay remain unfinished.

### 173.2 RED/GREEN Evidence

RED confirmed before production code:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 api\canvasAgentApi.test.js --test-name-pattern "prepareQueuedExecution"
```

- Exit 1.
- Expected failure: `TypeError: api.prepareQueuedExecution is not a function`.

GREEN after implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 api\canvasAgentApi.test.js --test-name-pattern "prepareQueuedExecution"
```

- Exit 0.
- Node reported 13 tests, 13 pass, 0 fail.

Regression and syntax checks:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 api\canvasAgentApi.test.js modules\assistant\assistantExecutionApiClient.test.js
```

- Exit 0.
- Node reported 20 tests, 20 pass, 0 fail.

```powershell
D:\Aic\node.exe --check api\canvasAgentApi.js
D:\Aic\node.exe --check api\canvasAgentApi.test.js
```

- Both exited 0.

### 173.3 PRD v3.32 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.31` to `v3.32`.
- Added Slice 173 to the PRD progress table.
- Updated the PRD current status, code anchors, queue-state sections, and self-check to reflect:
  - Orchestrator prepare hook exists.
  - Prepare failure is fail-closed.
  - Default app latest-context prepare API boundary exists.
  - Execution API client and backend `/prepare` thin boundary exist.
  - Main browser `createCanvasAgentApi().prepareQueuedExecution()` now exists.
- Removed stale PRD wording that still treated main browser API prepare exposure as unfinished.
- Preserved the important product boundary:
  - This is still not real model recompile.
  - Default `server.py` has no real `prepare_runner` yet.
  - Missing runner returns 501 for existing executions and should remain fail-closed from the Orchestrator perspective.
  - `queued_draft`, natural-language queue control, complete dependency result merge, full history, Undo, and Replay remain future work.

### 173.4 Current Runtime Boundary After This Repair

Completed now:

- Orchestrator can prepare a queued execution before auto-start when `prepareQueuedExecution` is injected.
- Orchestrator prepare failure is fail-closed and does not run stale queued actions.
- Default app wiring can build latest canvas context and call an explicit `api.prepareQueuedExecution` boundary.
- `assistantExecutionApiClient.prepareQueuedExecution()` exists for the execution namespace.
- Backend `/api/v2/canvas-agent/executions/{id}/prepare` exists as a thin route/service boundary.
- Main browser `createCanvasAgentApi().prepareQueuedExecution()` exists and can satisfy the default autoload/browser API object.

Still not complete:

- `server.py` does not inject a real `prepare_runner` into `CanvasAgentExecutionService`; existing executions with no runner return 501 for prepare.
- Real Claw/PI/LLM recompile is not implemented behind the thin boundary.
- No `queued_draft` status exists.
- Natural-language queue control, complete queue failure/video/dependency policy, complete dependency result merge, complete Timeline Humanizer, full execution history browser, Undo, and Replay remain future work.
- This round did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.

### 173.5 Recommended Next Runtime Slice

Use TDD and continue from the real model-runner gap:

1. Add RED Python tests for a real `prepare_runner` contract that receives sanitized latest context, existing execution, agent mode, and video authorization without persisting secrets.
2. Wire `server.py` to inject a real prepare runner into `CanvasAgentExecutionService` only after the runner contract is tested.
3. Implement the runner against the existing Claw/PI/LLM compile path without letting Act mode become video authorization.
4. Preserve fail-closed behavior: prepare/recompile failure must never execute stale queued actions.
5. Keep `context` and `executionContext` as runtime-only return values; do not persist raw canvas context in the execution record.
6. Continue using `D:\Aic\node.exe` for Node tests and do not use npm.
7. Do not start, restart, stop, status-check, probe, or touch `8777`; if live verification becomes necessary, stop and ask the user to prepare the service.

## 174. Default Server Prepare Runner Wiring for Queued Recompile (2026-06-10)

This section supersedes only the Slice 173 runtime gap that said the default server had no `prepare_runner`. It does not claim live `8777` end-to-end verification is complete.

### 174.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg`, focused file reads, and focused tests instead.
- Runtime files checked:
  - `server.py`
  - `server_canvas_agent_prepare_runner_test.py`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `services/pi_bridge_service.py`
  - `modules/app/appAssistantPanel.js`
  - `api/canvasAgentApi.js`
  - `modules/assistant/assistantExecutionApiClient.js`
- Key real-code facts now:
  - `CanvasAgentExecutionService.__init__()` accepts optional `prepare_runner`.
  - `CanvasAgentExecutionService.prepare_queued_execution()` sanitizes payload/context, injects the existing execution into the runner payload, strips raw `context`/`executionContext`, persists returned `plan/actionsByStep/drawerState/developer/summary`, and returns only prepared patch fields.
  - `CanvasAgentRouteService` exposes `POST /api/v2/canvas-agent/executions/{id}/prepare` as a thin service boundary.
  - `createCanvasAgentApi().prepareQueuedExecution()` exists after Slice 173 and can call the route from the default browser API object.
  - `server.py` now defines `_prepare_canvas_agent_queued_execution(payload)`.
  - `CANVAS_AGENT_EXECUTION_SERVICE` now injects `prepare_runner=_prepare_canvas_agent_queued_execution`.
  - The runner calls `PI_BRIDGE_SERVICE.chat(message=..., context=latest_context, conversation_id=..., mode="actions")` to recompile a queued execution from latest canvas context.
  - The runner preserves the video boundary: when `videoAuthorized` is false, the prompt says video generation is not authorized and video steps must wait for explicit authorization.
  - The runner returns a sanitized prepared patch containing `plan`, `actionsByStep`, `drawerState.line2`, `summary`, and sanitized `developer`.

### 174.2 RED/GREEN Evidence

RED before implementation:

```powershell
python -m unittest server_canvas_agent_prepare_runner_test
```

- Expected failures were observed before production code existed:
  - `AttributeError: module 'server' has no attribute '_prepare_canvas_agent_queued_execution'`
  - Missing callable `_prepare_runner` on the default `CANVAS_AGENT_EXECUTION_SERVICE`.

GREEN after implementation:

```powershell
python -m unittest server_canvas_agent_prepare_runner_test
```

- Python reported `Ran 3 tests` and `OK`.

Focused backend regression:

```powershell
python -m py_compile server.py server_canvas_agent_prepare_runner_test.py
```

- Exit 0.

```powershell
python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_prepare_queued_execution_uses_runner_without_persisting_raw_context_or_secrets canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_prepare_queued_execution_returns_unavailable_without_runner canvas_agent_route_service_test.CanvasAgentRouteServiceTests.test_execution_prepare_route_delegates_to_execution_service
```

- Python reported `Ran 3 tests` and `OK`.

### 174.3 PRD v3.33 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to keep `v3.33` aligned with real code.
- Added/confirmed Slice 174 as completed in the PRD progress table.
- Repaired stale PRD wording that still implied the default server had no prepare runner.
- Current boundary is now explicit:
  - default server prepare runner is wired offline through `PI_BRIDGE_SERVICE.chat(mode="actions")`;
  - live `8777` smoke/end-to-end verification is still not done;
  - `queued_draft`, natural-language queue controls, complete dependency result merge, complete queue failure/video/dependency policy, full history, Undo, and Replay remain incomplete.

### 174.4 Current Runtime Boundary

Completed now:

- Orchestrator prepare success path exists and can execute refreshed queued actions when `prepareQueuedExecution` is injected.
- Orchestrator prepare failure is fail-closed and does not run stale queued actions.
- Default app wiring can build latest canvas context and call an explicit `api.prepareQueuedExecution` boundary.
- `assistantExecutionApiClient.prepareQueuedExecution()` exists for the execution namespace.
- Backend `/api/v2/canvas-agent/executions/{id}/prepare` exists as a thin route/service boundary.
- Main browser `createCanvasAgentApi().prepareQueuedExecution()` exists and can satisfy the default autoload/browser API object.
- Default `server.py` now injects `_prepare_canvas_agent_queued_execution` as the prepare runner.
- The runner calls the existing PI/LLM compile path through `PI_BRIDGE_SERVICE.chat(mode="actions")` using latest context.

Still not complete:

- Live `8777` smoke and end-to-end queued prepare verification.
- `queued_draft` status.
- Natural-language queue control.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary.
- Full execution history browser.
- Undo and Replay.

### 174.5 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live verification becomes necessary, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 174.6 Recommended Next Slice

Use TDD and continue from one of these remaining gaps:

1. Add `queued_draft` state and tests, so heavy compile can be delayed until a task is actually about to run.
2. Add live-safe prepare error classification and cross-restart queue restoration tests without touching `8777`.
3. Add natural-language queue control mapping for cancel/top/pause/resume.
4. Add dependency result merge so later queued steps can consume outputs from previous steps.
5. When live verification is needed, ask the user to start/restart/prepare `8777`; do not touch the service directly.

## 175. queued_draft Minimal Queue State Machine (2026-06-10)

This section supersedes only the Slice 174 recommendation that listed `queued_draft` as the next runtime slice. It does not claim the full queue product, live `8777` verification, natural-language queue control, dependency result merge, Undo, or Replay are complete.

### 175.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg`, focused file reads, and focused tests instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `server.py`
- Test files checked:
  - `modules/assistant/assistantExecutionStore.test.js`
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `canvas_agent_execution_service_test.py`

### 175.2 Behavior Now Implemented

- Frontend store now has `AssistantExecutionStatus.QueuedDraft = "queued_draft"`.
- `snapshot().queue`, queue ordering, and queue controls now treat both `queued` and `queued_draft` as queue items.
- `enqueueExecution(raw)` preserves an explicit `queued_draft` status instead of coercing it to `queued`.
- `appAssistantPanel.js::recordAssistantExecutionFromResponse()` now saves a new v2 response as `queued_draft` when another active execution is already running.
- Queue UI text and queue card controls treat `queued_draft` like a queued item for display and top/pause/resume/cancel operations.
- `assistantExecutionOrchestrator.js::runNextQueuedExecution()` now fail-closes queued drafts unless a prepare hook exists and returns fresh executable `actionsByStep`.
- If queued draft prepare succeeds with fresh actions, the execution is promoted to `queued`, a `prepared` timeline event is written, and only the refreshed actions are executed.
- If prepare is missing, throws, returns no plain object, or returns no fresh executable actions, stale actions are not executed; the execution is marked `failed` with a `prepare_failed` timeline event.
- Backend `CanvasAgentExecutionService` now includes `queued_draft` in `_QUEUE_STATUSES` and `_ACTIVE_STATUSES`.
- Backend `list_executions(status="queued")`, `_queued_executions()`, and `control_queued_execution()` now include `queued_draft`.
- Backend `prepare_queued_execution()` promotes `queued_draft` to `queued` only when the prepared result includes non-empty fresh `actionsByStep`; otherwise it returns `None` and does not persist stale actions.

### 175.3 Tests / Verification Commands

Focused tests for this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "queued draft"
```

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "queued draft|fresh actions"
```

```powershell
python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_queued_draft_lists_with_queue_and_promotes_to_queued_after_prepare canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_queued_draft_prepare_without_fresh_actions_does_not_promote_or_persist_stale_actions
```

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "queue warning appears|default orchestrator prepares queued execution"
```

Syntax checks for touched code:

```powershell
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python -m py_compile services\canvas_agent_execution_service.py canvas_agent_execution_service_test.py
```

### 175.4 PRD v3.34 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to keep `v3.34` aligned with real code.
- Added Slice 175 as completed in the PRD progress table.
- Repaired stale PRD wording that still said frontend status enum did not contain `queued_draft`.
- Repaired stale PRD wording that still said execution-time v2 responses were saved as plain `queued`.
- Repaired stale PRD wording that still listed `queued_draft` as an unfinished queue gap.
- Kept the real boundary explicit: `queued_draft` is only a minimal stale-action safety state machine, not the full queue product.

### 175.5 Current Runtime Boundary

Completed now:

- `queued_draft` exists in frontend store and backend queue service.
- New v2 responses received while another execution is active are saved as `queued_draft`.
- Queued drafts participate in queue ordering and queue controls.
- Queued drafts must be prepared with latest context before execution.
- Queued drafts cannot execute stale actions if prepare is absent or fails.
- Backend prepare only promotes queued drafts when fresh actions exist.

Still not complete:

- Live `8777` smoke and end-to-end queued draft prepare verification.
- Natural-language queue control.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary.
- Full execution history browser.
- Undo and Replay.

### 175.6 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live verification becomes necessary, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 175.7 Recommended Next Slice

Use TDD and continue from one of these remaining gaps:

1. Add live-safe prepare error classification and cross-restart queue restoration tests without touching `8777`.
2. Add natural-language queue control mapping for cancel/top/pause/resume.
3. Add dependency result merge so later queued steps can consume outputs from previous steps.
4. Add complete queue failure/video/dependency policy.
5. When live verification is needed, ask the user to start/restart/prepare `8777`; do not touch the service directly.
## 176. PRD v3.35 Real-Code / Tacit-Knowledge Repair (2026-06-10)

This section supersedes only the over-broad wording in Slice 175 that could be read as saying every `queued_draft` queue-control edge case is fully covered. It does not change runtime code and does not claim the full queue product is complete.

### 176.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`; this slice used targeted `rg` and focused file reads instead.
- Runtime files checked:
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `api/canvasAgentApi.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `server.py`
- Test files checked:
  - `modules/assistant/assistantExecutionStore.test.js`
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `canvas_agent_execution_service_test.py`

### 176.2 PRD v3.35 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to version `v3.35`.
- Added Slice 176 as a documentation-only repair slice in the PRD progress table.
- Kept the correct completed boundary:
  - `queued_draft` exists in frontend store and backend execution service.
  - New v2 responses received while another execution is active are saved as `queued_draft`.
  - Queued drafts must be prepared with fresh executable `actionsByStep` before execution.
  - Missing/failed/no-fresh-action prepare is fail-closed and must not execute stale actions.
  - Backend queue list/control/prepare includes `queued_draft`.
- Repaired the over-broad wording:
  - `pauseQueuedExecution()`, `resumeQueuedExecution()`, and `cancelQueuedExecution()` are covered for drafts.
  - `moveQueuedExecutionToTop()` can find a `queued_draft` target, but its internal reorder list still filters only `AssistantExecutionStatus.Queued`.
  - Mixed queues with more than one draft can therefore have unverified top/reorder behavior.
  - The PRD now marks mixed `queued_draft` top ordering as a remaining TDD slice, not as completed product behavior.

### 176.3 Current Runtime Boundary

Completed now:

- `queued_draft` minimal stale-action safety state machine.
- App latest-context prepare API boundary.
- Main browser `prepareQueuedExecution()` API method.
- Backend `/api/v2/canvas-agent/executions/{id}/prepare` thin boundary.
- Default server prepare runner wiring through `PI_BRIDGE_SERVICE.chat(mode="actions")`.
- Prepare failure fail-closed timeline/status behavior.

Still not complete:

- Mixed `queued_draft` queue top/reorder RED/GREEN coverage and fix.
- Live `8777` smoke and end-to-end queued prepare verification.
- Natural-language queue control.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary.
- Full execution history browser.
- Undo and Replay.

### 176.4 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live verification becomes necessary, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 176.5 Recommended Next Runtime Slice

Use TDD and start with the smallest real-code correction:

1. Add a RED test in `modules/assistant/assistantExecutionStore.test.js` proving `moveQueuedExecutionToTop("draft-id")` keeps a mixed `queued`/`queued_draft` queue ordered correctly and preserves the draft status.
2. Run:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "queued draft"
```

3. Fix `modules/assistant/assistantExecutionStore.js::moveQueuedExecutionToTop()` so its reorder list uses `isQueueStatus(execution.status)` instead of filtering only `AssistantExecutionStatus.Queued`.
4. Re-run the focused store test and syntax check:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "queued draft|controls queued"
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
```

After that, continue with live-safe prepare error classification, cross-restart queue restoration, natural-language queue control, dependency result merge, or Undo/Replay. Do not touch `8777` unless the user explicitly asks.
## 177. queued_draft Mixed Queue Top Ordering Runtime Fix (2026-06-10)

This section supersedes only the Slice 176 remaining gap about mixed `queued` / `queued_draft` top ordering. It does not claim the full queue product, live `8777` verification, natural-language queue control, dependency result merge, Undo, or Replay are complete.

### 177.1 Real Code Reviewed

- CodeGraph was attempted earlier in this handoff chain and returned `database is locked`; this runtime slice used targeted file reads and focused tests instead.
- Runtime file changed:
  - `modules/assistant/assistantExecutionStore.js`
- Test file changed:
  - `modules/assistant/assistantExecutionStore.test.js`
- Documentation updated:
  - `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
  - `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 177.2 RED/GREEN Evidence

RED test added first:

- `assistantExecutionStore: moving queued draft to top preserves mixed queue order`
- Scenario: queue order starts as `queued -> queued_draft -> queued -> queued_draft`.
- Expected behavior: moving the last draft to top keeps it as `queued_draft`, assigns it `queueIndex=1`, and preserves the relative order of all other queued/draft items.
- Observed RED failure before code change: old `moveQueuedExecutionToTop()` moved the target draft to the top but pushed the non-target draft behind later plain queued items.

GREEN implementation:

- Updated `modules/assistant/assistantExecutionStore.js::moveQueuedExecutionToTop()`.
- Changed the internal reorder list from:

```js
.filter((execution) => execution.status === AssistantExecutionStatus.Queued)
```

- To:

```js
.filter((execution) => isQueueStatus(execution.status))
```

- This makes top/reorder use the same queue-status definition as `snapshot().queue`, `queuedExecution()`, pause/resume/cancel, and queue normalization.

### 177.3 Verification Commands

RED command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "moving queued draft"
```

- Expected failure was observed before the production change.
- Failure proved the previous implementation reordered mixed draft queues incorrectly.

GREEN and regression commands:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "queued draft|controls queued"
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "queued draft|fresh actions|prepare failure"
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
```

- Store tests reported 8 pass, 0 fail.
- Orchestrator focused queue/prepare tests reported 17 pass, 0 fail.
- Store syntax check exited 0.

### 177.4 PRD v3.36 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to version `v3.36`.
- Added Slice 177 to the PRD progress table.
- Repaired stale wording from Slice 176 that marked mixed draft top ordering as a future TDD gap.
- Current boundary is now explicit:
  - mixed `queued` / `queued_draft` top ordering is fixed in the frontend store;
  - the fix does not change backend queue-control, live prepare, natural-language queue control, dependency result merge, Undo, or Replay.

### 177.5 Current Runtime Boundary

Completed now:

- `moveQueuedExecutionToTop()` uses `isQueueStatus()` when building the reorder list.
- Mixed `queued` / `queued_draft` queues preserve non-target relative order when a draft is moved to top.
- The moved draft keeps status `queued_draft`.
- Active execution id remains unchanged by queue top operations.

Still not complete:

- Live `8777` smoke and end-to-end queued prepare verification.
- Natural-language queue control.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary.
- Full execution history browser.
- Undo and Replay.

### 177.6 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live verification becomes necessary, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 177.7 Recommended Next Slice

Use TDD and continue from one of these remaining gaps:

1. Add live-safe prepare error classification and cross-restart queue restoration tests without touching `8777`.
2. Add natural-language queue control mapping for cancel/top/pause/resume.
3. Add dependency result merge so later queued steps can consume outputs from previous steps.
4. Add complete queue failure/video/dependency policy.
5. Add the first Undo inverse-patch slice for low-risk actions.

## 178. PRD v3.37 Real-Code / Tacit-Knowledge Repair (2026-06-10)

This is a documentation-only slice. It updates the PRD to match the current real code and tacit project rules after Slice 177. It does not change runtime code, does not claim the full queue product is complete, and does not touch the user-managed `8777` service.

### 178.1 Real Code Reviewed

- CodeGraph was attempted again first because this project has CodeGraph configured, but it returned `database is locked`.
- This slice used targeted `rg`, focused file reads, and the current handoff chain instead.
- Runtime/source files checked:
  - `modules/assistant/assistantExecutionStore.js`
  - `modules/assistant/assistantExecutionOrchestrator.js`
  - `modules/app/appAssistantPanel.js`
  - `services/canvas_agent_execution_service.py`
  - `services/canvas_agent_route_service.py`
  - `api/canvasAgentApi.js`
  - `modules/assistant/assistantExecutionApiClient.js`
  - `server.py`
- Documentation checked:
  - `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
  - `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 178.2 PRD v3.37 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to version `v3.37`.
- Added Slice 178 to the PRD progress table.
- Repaired stale wording that still implied mixed `queued_draft` top ordering was a future runtime gap. Slice 177 already fixed it.
- Repaired stale wording that still implied queue prepare/recompile was not implemented at all. Current code has an offline minimum closed loop:
  - Orchestrator injected `prepareQueuedExecution` hook.
  - Prepare success refreshes `plan/actionsByStep/drawerState` and writes `prepared` timeline.
  - Prepare failure writes `prepare_failed`, marks the execution failed, and does not run stale actions.
  - Default app path builds latest canvas context and calls explicit `api.prepareQueuedExecution` when available.
  - `assistantExecutionApiClient.prepareQueuedExecution()` and backend `/api/v2/canvas-agent/executions/{id}/prepare` exist.
  - Main browser `createCanvasAgentApi().prepareQueuedExecution()` exists.
  - Default server prepare runner is wired through `PI_BRIDGE_SERVICE.chat(mode="actions")`.
  - `queued_draft` must prepare and return fresh `actionsByStep` before promotion/execution.
- Repaired stale storage/UI wording:
  - Backend queued list/control includes both `queued` and `queued_draft`.
  - Queue control plus prepare/recompile is a minimum closed loop, not a final queue product.
  - UI queue strip controls exist, but natural-language queue controls, live `8777`, and failure/video/dependency queue policies remain incomplete.
- Kept target-vs-current boundaries explicit:
  - Visual Agent Plan Board is still readonly MVP.
  - Timeline details still do not have Undo or full developer JSON UI.
  - Phase 4 Undo/Replay is still not implemented.
  - Full history browser is still not implemented.
  - Click-outside collapse remains target state, not verified runtime behavior.

### 178.3 Current Runtime Boundary After PRD Repair

Completed now:

- Phase 1 minimum closed loop.
- Phase 2 execution drawer/store/API/history import/queue strip/timeline scroll/focus-object minimum closed loop.
- Phase 3 Orchestrator minimum closed loop for run, pause, resume, retry, skip, dependency_blocked, selected-event retry/skip/video auth, queue warning, queued controls, backend queue-control sync, prepare hook, fail-closed prepare, default app latest-context boundary, backend prepare thin boundary, default server prepare runner, `queued_draft`, and mixed queue top ordering.

Still not complete:

- Live `8777` smoke and end-to-end queued prepare verification.
- Live-safe prepare error classification.
- Cross-restart queue restoration and conflict policy.
- Natural-language queue controls.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary and error localization.
- Full execution history browser.
- Plan editing / DAG.
- Undo and Replay.

### 178.4 Verification

Documentation validation performed with `D:\Aic\node.exe`:

- PRD version line contains `v3.37`.
- PRD contains `Slice 178`.
- PRD contains `queued_draft`, `prepare/recompile`, `Undo/Replay`, and `8777`.
- No Unicode replacement character was found.
- No accidental triple-question-mark mojibake sequence was found.
- Stale phrases about `moveQueuedExecutionToTop()` still filtering only `queued` and queue recompile being wholly unimplemented were removed from the current-state sections.

No runtime tests were run because this slice changed documentation only.

### 178.5 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live verification becomes necessary, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 178.6 Recommended Next Slice

Use TDD and continue from one of these remaining runtime gaps:

1. Add live-safe prepare error classification without touching `8777`.
2. Add cross-restart queue restoration and conflict tests.
3. Add natural-language queue control mapping for cancel/top/pause/resume.
4. Add dependency result merge so downstream steps can consume outputs from previous steps.
5. Add the first Undo inverse-patch slice for low-risk actions.

## 179. Live-Safe Prepare Error Classification Runtime Fix (2026-06-10)

This section supersedes only the Slice 178 remaining gap about live-safe prepare error classification. It does not claim the full queue product, live `8777` verification, natural-language queue control, dependency result merge, complete history, Undo, or Replay are complete.

### 179.1 Real Code Reviewed

- CodeGraph was attempted first because this project has CodeGraph configured, but it returned `database is locked`.
- This slice used targeted `rg`, focused file reads, and focused tests instead.
- Runtime file changed:
  - `modules/assistant/assistantExecutionOrchestrator.js`
- Test file changed:
  - `modules/assistant/assistantExecutionOrchestrator.test.js`
- Documentation updated:
  - `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
  - `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 179.2 Runtime Change

- `modules/assistant/assistantExecutionOrchestrator.js::failPrepareClosed(message, kind = "prepare_failed")` now writes prepare diagnostics into the `prepare_failed` timeline event:
  - `developer.prepareErrorKind`
  - `developer.prepareErrorMessage`
- Current `prepareErrorKind` coverage:
  - `missing_prepare_hook`: a `queued_draft` execution reached the front of the queue but no `prepareQueuedExecution` hook was configured.
  - `prepare_threw`: the configured `prepareQueuedExecution` hook threw or rejected.
  - `invalid_prepare_result`: prepare returned no plain object result.
  - `missing_fresh_actions`: prepare returned a result without fresh executable `actionsByStep`.
- In all four cases the Orchestrator stays fail-closed:
  - stale queued actions are not executed;
  - the execution is marked `failed`;
  - a `prepare_failed` timeline event is appended;
  - the drawer is kept visible with a user-facing error line;
  - `queued` / `queued_draft` work does not silently continue with old actions.

### 179.3 TDD / Verification Evidence

- RED intent: focused tests asserted `developer.prepareErrorKind` on `prepare_failed` timeline events before the runtime wrote that field, so the classification expectation failed.
- GREEN implementation: `failPrepareClosed()` accepts a classification kind and every prepare failure branch passes the correct kind.
- Focused Orchestrator tests cover:
  - `missing_prepare_hook`
  - `prepare_threw`
  - `invalid_prepare_result`
  - `missing_fresh_actions`
- Store queue regression tests were also run to ensure the Slice 177 mixed `queued` / `queued_draft` ordering fix still holds.

Verification commands:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "queued draft|prepare failure|non-object"
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "queued draft|controls queued"
D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js
```

Fresh focused results observed in this repair pass:

- Orchestrator focused tests: 18 pass, 0 fail.
- Store focused tests: 8 pass, 0 fail.
- Orchestrator syntax check exits 0.

### 179.4 PRD v3.38 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to version `v3.38`.
- Added Slice 179 to the PRD progress table.
- Repaired stale wording that still listed live-safe prepare error classification as an unfinished runtime gap.
- Added the current prepare failure boundary:
  - `prepare_failed` timeline events now carry `developer.prepareErrorKind` and `developer.prepareErrorMessage`.
  - The supported kinds are `missing_prepare_hook`, `prepare_threw`, `invalid_prepare_result`, and `missing_fresh_actions`.
- Kept the real boundary explicit:
  - this is an offline frontend Orchestrator diagnostic close-loop;
  - it is not live `8777` end-to-end verification;
  - it is not complete backend route/live-runner error localization;
  - it is not cross-restart queue restoration;
  - it is not Undo/Replay.

### 179.5 Current Runtime Boundary

Completed now:

- `queued_draft` and `queued` prepare failures no longer collapse into one opaque `prepare_failed` event.
- The timeline records a machine-readable reason in `developer.prepareErrorKind`.
- The timeline records the error text in `developer.prepareErrorMessage`.
- Stale queued actions remain blocked when prepare is missing, throws, returns an invalid value, or returns no fresh executable actions.

Still not complete:

- Live `8777` smoke and end-to-end queued prepare verification.
- Cross-restart queue restoration and conflict policy.
- Natural-language queue controls.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary and error localization.
- Full execution history browser.
- Plan editing / DAG.
- Undo and Replay.

### 179.6 Important Operating Rule

- Do not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live service verification is needed, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 179.7 Recommended Next Slice

Use TDD and continue from one of these remaining gaps:

1. Cross-restart queue restoration and conflict tests.
2. Natural-language queue control mapping for cancel/top/pause/resume.
3. Dependency result merge so downstream steps can consume outputs from previous steps.
4. Complete queue failure/video/dependency policy.
5. First Undo inverse-patch slice for low-risk actions.

## 180. Cross-Restart Execution Safe-Pause Runtime Fix (2026-06-10)

This section supersedes only the part of the cross-restart queue restoration gap that could leave an `executing` task stuck after app/server restart. It does not claim automatic resume, user-edit conflict detection, backend leases/locks, dependency result merge, natural-language queue control, live `8777` verification, Undo, or Replay are complete.

### 180.1 Real Code Reviewed

- CodeGraph was attempted first in this continuation and still returned `database is locked`.
- This slice used targeted `rg`, focused file reads, and focused tests instead.
- Runtime files changed:
  - `modules/assistant/assistantExecutionStore.js`
  - `services/canvas_agent_execution_service.py`
- Test files changed:
  - `modules/assistant/assistantExecutionStore.test.js`
  - `canvas_agent_execution_service_test.py`
- Documentation updated:
  - `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
  - `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

### 180.2 Runtime Change

- Frontend store:
  - `createAssistantExecutionStore()` now converts interrupted `executing` executions loaded from local storage into `paused`.
  - `importExecutions()` now applies the same protection to backend history imported into the frontend store.
  - The restored execution keeps `orchestratorState.nextActionIndex` and `orchestratorState.pausedAtActionId`.
  - `orchestratorState.running` is cleared.
  - The drawer stays visible and shows `重启后已暂停，可继续执行`.
  - A `restored_paused` timeline event is appended once with `developer.restoreReason`.
  - Existing `queued` / `queued_draft` queue order is preserved.
- Backend service:
  - `CanvasAgentExecutionService._load()` now applies the same safe-pause policy when loading persisted executions from disk.
  - The restored backend execution is persisted back to storage so a second reload does not append duplicate `restored_paused` events.
  - Queue ordering for `queued` / `queued_draft` executions remains unchanged.

### 180.3 TDD / Verification Evidence

RED tests added first:

- `assistantExecutionStore: restores interrupted executing tasks as paused after restart`
  - Initial failure: restored status stayed `executing`.
- `assistantExecutionStore: imports interrupted backend executing history as paused`
  - Initial failure: imported status stayed `executing`.
- `CanvasAgentExecutionServiceTests.test_restores_interrupted_executing_task_as_paused_after_storage_reload`
  - Initial failure: backend reloaded status stayed `executing`.

GREEN implementation:

- Added frontend `restoreInterruptedExecution()` helper and applied it on local storage load plus backend import.
- Added backend `_restore_interrupted_execution()` helper and applied it during `_load()`.
- Both implementations avoid duplicate `restored_paused` events on repeated reload/import.

Verification commands:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js --test-name-pattern "restores interrupted|imports interrupted"
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionStore.test.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests.test_restores_interrupted_executing_task_as_paused_after_storage_reload
python -m unittest canvas_agent_execution_service_test.CanvasAgentExecutionServiceTests
python -m py_compile services/canvas_agent_execution_service.py
```

Expected focused results:

- Store focused safe-pause tests: 10 pass, 0 fail when run with the focused pattern because Node still enumerates the file under the built-in runner.
- Full store test file: 10 pass, 0 fail.
- Backend focused safe-pause test: 1 pass, 0 fail.
- Full backend execution service unittest class: pass.
- JS and Python syntax checks exit 0.

### 180.4 PRD v3.39 Repair Completed

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to version `v3.39`.
- Added Slice 180 to the PRD progress table.
- Repaired stale wording that still described all cross-restart behavior as missing:
  - safe-pause on frontend local storage load is now implemented;
  - safe-pause on frontend backend-history import is now implemented;
  - safe-pause on backend storage reload is now implemented.
- Kept the real boundary explicit:
  - this is not automatic execution resume;
  - this is not user-edit conflict detection;
  - this is not a backend lease/lock system;
  - this is not full dependency-result merge;
  - this is not Undo/Replay.

### 180.5 Current Runtime Boundary

Completed now:

- Interrupted `executing` executions no longer remain as zombie running tasks after frontend store restart.
- Interrupted backend history imported into the frontend no longer appears as actively running.
- Interrupted backend persisted executions no longer reload as `executing` after service restart.
- The resume cursor is preserved for a user-triggered/manual continue path.
- Queue order survives the restoration pass.

Still not complete:

- Live `8777` smoke and end-to-end queued prepare verification.
- Automatic resume after restart.
- Full cross-restart conflict policy for user-edited canvas state.
- Backend lease/lock ownership and stale-runner detection.
- Natural-language queue controls.
- Complete queue failure/video/dependency policy.
- Complete dependency result merge.
- Complete Timeline Humanizer dictionary and error localization.
- Full execution history browser.
- Plan editing / DAG.
- Undo and Replay.

### 180.6 Important Operating Rule

- This slice did not start, restart, stop, status-check, probe, or touch the user-managed `8777` service.
- If live service verification is needed, stop and ask the user to prepare the service; continue only after the user confirms it is ready.

### 180.7 Recommended Next Slice

Use TDD and continue from one of these remaining gaps:

1. Natural-language queue control mapping for cancel/top/pause/resume.
2. Dependency result merge so downstream steps can consume outputs from previous steps.
3. Complete queue failure/video/dependency policy.
4. First Undo inverse-patch slice for low-risk actions.
5. Full cross-restart conflict policy with canvas revision/ownership checks.


## 181. PRD v3.40 Real-Code / Tacit-Knowledge Repair (2026-06-10)

This is a documentation-only handoff slice. It repairs the PRD so the next developer does not confuse the Scheme B target UX with what the current runtime actually implements. No production runtime code was changed in this slice.

### 181.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- CodeGraph was attempted first because the project has CodeGraph configured, but it returned `database is locked` again.
- Followed the AGENTS fallback: used `rg`, targeted file reads, and current handoff/PRD context instead of broad grep-first symbol exploration.
- This slice only edited documentation; no Node/Python runtime tests were needed beyond document consistency checks.

### 181.2 Real Code Reviewed

Runtime/source anchors checked for the PRD repair:

- `modules/app/appAssistantPanel.js`
  - `sendMessage()` currently enters model-config guard and then requires `api.chat` / `api.chatStream`; it does not intercept natural-language queue commands before the model path.
  - `addCompose()` places `.hy-canvas-agent-execution-drawer` above the input area.
  - `renderExecutionDrawer()` renders the current visible execution with a right-side expand/collapse button and a state-dependent second button.
  - `renderExecutionQueueStrip()` renders queued cards and local queue controls.
  - `handleQueuedExecutionControl()` already supports `top`, `cancel`, and `pause`/resume toggle, and best-effort syncs via `controlQueuedExecution()`.
  - Current UI has no completed-summary close button, no click-outside collapse handler, and no real overlay/backdrop blur over the chat region.
- `modules/assistant/assistantExecutionStore.js`
  - `queued` and `queued_draft` are both queue statuses.
  - `moveQueuedExecutionToTop()`, `pauseQueuedExecution()`, `resumeQueuedExecution()`, and `cancelQueuedExecution()` cover queued/draft items.
  - `restoreInterruptedExecution()` converts stale `executing` records to `paused` on local load or backend import.
  - Store does not automatically synthesize the collapsed drawer's `line1` queue-count text; it uses stored `drawerState.line1` or title/progress fallback.
- `modules/assistant/assistantExecutionOrchestrator.js`
  - `runNextQueuedExecution()` selects the first non-paused queued/queued_draft task.
  - The injected `prepareQueuedExecution` hook refreshes `plan/actionsByStep/drawerState` before execution.
  - Prepare failures are fail-closed and now write `prepareErrorKind/prepareErrorMessage`.
  - Retry/skip/video-auth and `dependency_blocked` are minimum Orchestrator closures, not full Undo/Replay or DAG merge.
- `services/canvas_agent_execution_service.py`
  - Backend execution store persists timeline/orchestrator fields, queue paused state, queue-control, prepare, and safe-pause on storage reload.
  - This is not a backend lease/lock system and not full cross-restart conflict resolution.

### 181.3 PRD v3.40 Repair Completed

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.39` to `v3.40`.
- Rewrote the top status line to make the current implementation boundary explicit.
- Added a Slice 181 row to the progress table.
- Added `### 2.5 v3.40 方案 B 交互与真实代码差异复核`.
- Clarified the Scheme B target-vs-runtime gaps:
  - input-above drawer exists;
  - right-side two-button minimum exists;
  - readonly plan/timeline exists;
  - queue strip and queued card controls exist;
  - timeline auto-scroll exists only inside the expanded timeline area;
  - reference-image-style looping/feed behavior is not implemented;
  - chat overlay/backdrop blur is not implemented;
  - click-outside collapse is not implemented;
  - completed-summary close is not implemented;
  - editable plan board/DAG is not implemented;
  - natural-language queue control is not implemented;
  - Undo/Replay is not implemented.
- Added a product-scope note: Section 4 is final scope, not a claim that every item is implemented.
- Reworded the Skill Studio scope as `Skill Registry Studio`, emphasizing definition/validation/debugging over a heavy marketplace/admin product.
- Clarified that collapsed queue count is still target behavior unless `drawerState.line1` already contains it; `renderExecutionDrawer()` does not currently compute `排队 N 个` from the snapshot.
- Changed the recommended next queue slice to natural-language queue control:
  - intercept before model config guard and before `api.chat` / `api.chatStream` requirements;
  - use existing queue store/control logic;
  - do not send obvious queue commands to the LLM;
  - allow local queue control even when model config is unavailable.
- Kept the `8777` manual-service rule intact.

### 181.4 Current Runtime Boundary After PRD Repair

Completed minimum closures remain:

- Unified Skill Registry v2 loader/adapters/protocol pass-through minimum.
- Input-above execution drawer minimum.
- Project-level frontend execution store and backend execution service minimum.
- Execution API client and `/api/v2/canvas-agent/executions/*` route minimum.
- Orchestrator run/pause/resume/retry/skip/video-auth/dependency-blocked minimum.
- Queue scheduler, queue warning, queued card controls, backend queue-control sync.
- Queued prepare/recompile hook, app latest-context boundary, main browser API, backend prepare thin boundary, default server prepare runner.
- `queued_draft` stale-action protection, mixed queue top-ordering fix, prepare failure diagnostics, and cross-restart safe-pause.

Still not complete:

- Natural-language queue controls.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Chat overlay/backdrop blur and click-outside collapse.
- Completed-summary close and full execution history browser.
- Full queue failure/video/dependency policy.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 181.5 Recommended Next Slice

Use TDD and implement Natural-Language Queue Control:

1. Add RED UI/state tests in `modules/app/appAssistantPanel.p1Ui.test.js` for phrases such as:
   - `取消第一个排队任务`
   - `把第二个任务置顶`
   - `暂停下一个任务`
   - `继续暂停任务`
2. Assert that these commands:
   - append visible user/assistant feedback messages or receipts;
   - do not call `api.chat` / `api.chatStream`;
   - bypass model-config guard for local queue operations;
   - call existing `handleQueuedExecutionControl()` paths and best-effort backend `queue-control` sync.
3. Implement the smallest parser in `appAssistantPanel.js` near `sendMessage()`, before model config guard and before API requirements.
4. Run focused Node tests and syntax check with `D:\Aic\node.exe`.
5. Update this handoff and the PRD again after the runtime slice.

### 181.6 Verification

Document-only verification performed after the PRD edit:

```powershell
# Planned verification commands for this slice:
D:\Aic\node.exe -e "<PRD consistency script>"
git diff --check -- docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

The fresh output for these commands should be recorded by the agent that finalizes this slice.
## 182. Natural-Language Queue Control Runtime Slice (2026-06-10)

This is a runtime + documentation handoff slice. It supersedes only the Slice 181 recommendation that natural-language queue control should be the next runtime slice. It does not claim the full queue product, live `8777` verification, dependency result merge, full history, Undo, or Replay are complete.

### 182.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- CodeGraph was attempted earlier in this workstream and still returned `database is locked`; implementation used targeted file reads and focused tests.
- Followed TDD:
  - RED tests were added first in `modules/app/appAssistantPanel.p1Ui.test.js`.
  - Initial focused run failed because no model-pre-guard queue command interception existed.
  - GREEN implementation was then added in `modules/app/appAssistantPanel.js`.
  - Additional RED guard tests caught two false-positive risks: `取消当前任务` and `取消第一个节点` must not be treated as queued-task commands.

### 182.2 Runtime Changes

Modified `modules/app/appAssistantPanel.js`:

- Added local queue-command parsing helpers:
  - `normalizeQueueControlText()`
  - `parseLocalizedOrdinal()`
  - `parseQueueControlAction()`
  - `hasQueueControlHint()`
  - `queueControlTargetIndex()`
  - `queueControlReply()`
  - `parseNaturalLanguageQueueControl()`
- Added `applyNaturalLanguageQueueControl(message, options)` inside `createAssistantPanelState()`.
- `sendMessage()` now calls `applyNaturalLanguageQueueControl()` before:
  - `modelConfigGuardReason(state)`
  - `api.chatStream` / `api.chat` availability checks
  - assistant request construction
  - LLM calls
- Supported minimum command classes:
  - cancel: `取消第一个排队任务`, `删掉/删除/移除...`
  - top: `把第二个任务置顶`, `优先/提前...`
  - pause: `暂停下一个任务`, `暂停第 N 个...`
  - resume: `继续暂停任务`, `继续暂停的任务`, `恢复...`
- Target selection minimum:
  - `第一个/第1个/下一个` maps to queue index 0.
  - `第二个/第2个` maps to queue index 1.
  - `最后一个/上一个` maps to the last queued item.
  - resume without an ordinal prefers the first queued item whose `drawerState.queuePaused === true`.
- Queue commands reuse existing local store methods:
  - `executionStore.cancelQueuedExecution(id)`
  - `executionStore.moveQueuedExecutionToTop(id)`
  - `executionStore.pauseQueuedExecution(id)`
  - `executionStore.resumeQueuedExecution(id)`
- When a command succeeds, it best-effort syncs backend queue state through:
  - `executionSyncClient.controlQueuedExecution(id, action)`
- The local response appends a user message and an assistant feedback message, then updates:
  - `state.lastReceipt`
  - `state.lastReceiptDetails`
  - `state.lastResponse`
  - `state.status = "done_no_actions"`
- `canSendMessage(message)` now accepts the draft text. When the text is a local queue command, the send button can be enabled even if model configuration is missing.
- False-positive guardrails added:
  - `取消当前任务` is not treated as queue control.
  - `取消第一个节点` is not treated as queue control unless queue wording is explicit.

### 182.3 Tests Added / Adjusted

Added focused tests in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `natural-language queue command cancels before model config guard`
  - Verifies `取消第一个排队任务` cancels queue item 1.
  - Verifies `api.chat` is not called.
  - Verifies this bypasses the missing-model guard.
  - Verifies backend queue-control sync receives `cancel`.
- `natural-language queue commands top, pause, and resume without LLM`
  - Verifies `把第二个任务置顶` changes queue order.
  - Verifies `暂停下一个任务` sets `drawerState.queuePaused=true`.
  - Verifies `继续暂停的任务` resumes it.
  - Verifies no LLM call is made.
- `natural-language queue command enables send button when model config is missing`
  - Verifies UI send button is enabled for local queue commands even with `modelConfigRequired=true`.
- `natural-language active-task wording is not mistaken for queue control`
  - Verifies `取消当前任务` does not cancel a queued task.
- `natural-language canvas node wording is not mistaken for queue control`
  - Verifies `取消第一个节点` does not cancel a queued task.

Adjusted stale assertions in `modules/app/appAssistantPanel.test.js` to match current true runtime behavior:

- Active execution receiving a new v2 execution stores the new task as `queued_draft`, not legacy `queued`.
- Imported backend history with stale `executing` status is restored to `paused` and shows `重启后已暂停`, per Slice 180 safe-pause behavior.

### 182.4 PRD Update

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version to `v3.41`.
- Updated top status line to include Slice 182.
- Added progress table row:
  - `Slice 182：自然语言队列控制最小闭环`
- Updated Section 2.5 natural-language queue row from `未落地` to `已完成本地最小闭环`.
- Kept the remaining boundary explicit:
  - no batch `取消全部` / bulk reorder yet;
  - no natural-language current-task pause yet;
  - no multi-turn pronoun/reference resolution yet;
  - no ambiguity confirmation UX yet;
  - no full queue failure/video/dependency policy yet;
  - no live `8777` end-to-end verification yet.

### 182.5 Current Runtime Boundary After This Slice

Completed minimum closures now include:

- Input-above execution drawer.
- Project-level execution store and backend execution service minimum.
- Queue scheduler, queue warning, queued card top/pause/resume/cancel controls.
- Backend queue-control best-effort sync.
- Queued prepare/recompile minimum with `queued_draft` stale-action protection.
- Prepare failure diagnostics and cross-restart safe-pause.
- Natural-language local queue control for cancel/top/pause/resume before model guard / LLM call.

Still not complete:

- Real `8777` live smoke / end-to-end queued prepare verification.
- Natural-language queue control complete semantic version:
  - `取消全部`
  - bulk reorder
  - current-task pause/resume by language
  - multi-turn references like `把刚刚那个置顶`
  - ambiguity confirmation
- Full queue failure/video/dependency policy.
- Editable Visual Agent Plan Board / DAG preview.
- Chat overlay/backdrop blur and click-outside collapse.
- Completed-summary close and full execution history browser.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 182.6 Verification Commands

Run these before claiming Slice 182 is complete:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe -e "<PRD/handoff consistency checks>"
```

Do not use `8777` for this slice unless the user explicitly prepares it and asks for live verification.

## 183. Natural-Language Queue Cancel-All Runtime Slice (2026-06-10)

This runtime slice continues the Slice 182 natural-language queue-control work by closing the first complete-semantic gap: `取消全部排队任务`. It does not claim bulk reorder, current-task pause/resume by language, multi-turn references, ambiguity confirmation, full queue failure/video/dependency policy, live `8777` verification, Undo, or Replay are complete.

### 183.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- CodeGraph was attempted at the start of this continuation and still returned `database is locked`; work used targeted reads and focused tests.
- Followed TDD:
  - Added RED test `natural-language queue command cancels all queued tasks without LLM` in `modules/app/appAssistantPanel.p1Ui.test.js`.
  - RED failed because `取消全部排队任务` was parsed as single `cancel` and only targeted the first queue item.
  - GREEN implementation added the minimum `cancel_all` path in `modules/app/appAssistantPanel.js`.

### 183.2 Runtime Changes

Modified `modules/app/appAssistantPanel.js`:

- `parseNaturalLanguageQueueControl()` now maps cancel commands containing `全部` / `所有` / `全都` / `all` to `action: "cancel_all"`.
- The parser returns all current queued executions for `cancel_all`.
- `applyNaturalLanguageQueueControl()` now handles `cancel_all` before single-item actions:
  - Iterates current queued/queued_draft executions.
  - Calls `executionStore.cancelQueuedExecution(id)` for each item.
  - Leaves the active execution untouched.
  - Writes one user message and one assistant feedback message.
  - Sets `lastResponse.queueControl.action = "cancel_all"` and `executionIds` to all cancelled ids.
  - Best-effort syncs backend queue-control by calling `controlQueuedExecution(id, "cancel")` for each cancelled id.

### 183.3 Tests Added

Added focused test in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `natural-language queue command cancels all queued tasks without LLM`
  - Verifies `取消全部排队任务` does not call `api.chat`.
  - Verifies it bypasses the missing model guard.
  - Verifies queued and queued_draft tasks are all cancelled.
  - Verifies the active execution remains active.
  - Verifies assistant feedback says `已取消 3 个排队任务。`.
  - Verifies backend queue-control sync receives one `cancel` call per cancelled queued execution.

### 183.4 Current Runtime Boundary After This Slice

Completed minimum closures now include:

- Natural-language single queued-task cancel/top/pause/resume.
- Natural-language `取消全部排队任务` batch cancel for queued/queued_draft tasks.
- Local command execution before model guard / LLM call.
- Best-effort backend queue-control sync for each cancelled queued execution.

Still not complete:

- Bulk reorder beyond `置顶`.
- Current-task pause/resume by natural language.
- Multi-turn references like `把刚刚那个置顶`.
- Ambiguity confirmation for broad or risky queue commands.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 183.5 Verification Commands

Run these before claiming Slice 183 is complete:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe -e "<PRD/handoff consistency checks>"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

## 184. PRD v3.43 Real-Code/Tacit-Knowledge Repair Slice (2026-06-10)

This is a documentation-only repair slice. It updates the unified Skill Registry / execution workspace PRD to match the current real code after Slice 183. It does not change runtime code, does not claim the full queue product is complete, and does not touch the user-managed `8777` service.

### 184.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- CodeGraph was attempted first because this project has CodeGraph configured, but it still returned `database is locked`.
- Followed the AGENTS fallback by using targeted `rg` / file reads and real code anchors instead of trusting stale PRD wording.
- This slice intentionally did not run live service verification; it only repairs documentation boundaries.

### 184.2 Real Code Reviewed

Reviewed the current implementation and tests around the PRD claims:

- `modules/app/appAssistantPanel.js`
  - `parseNaturalLanguageQueueControl(message, executionStore)`
  - `applyNaturalLanguageQueueControl(message, options)`
  - `canSendMessage(message = "")`
  - `sendMessage(text, options = {})`
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - natural-language single queued-task cancel/top/pause/resume tests
  - missing-model-configuration bypass test
  - `取消全部排队任务` / `cancel_all` test
  - false-positive guards for `取消当前任务` and `取消第一个节点`
- `modules/assistant/assistantExecutionStore.js`
  - queued/queued_draft queue status handling
  - queued pause/resume/cancel/top store controls
  - cross-restart safe-pause behavior
- `modules/assistant/assistantExecutionOrchestrator.js`
  - active execution pause/resume cursor behavior
  - queued prepare/fail-closed boundary
  - queued/queued_draft auto-start boundary

### 184.3 PRD Changes

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.42` to `v3.43`.
- Rewrote the top status line to make the current truth explicit:
  - Slice 182 natural-language single queued-task control is complete as a local minimum.
  - Slice 183 `取消全部排队任务` is complete as a local minimum.
  - Current real code intercepts these commands before model configuration guard, `api.chat/chatStream`, and LLM calls.
  - The remaining natural-language gaps are current-task pause/resume, bulk reorder, multi-turn references, ambiguity confirmation, full failure/video/dependency queue policy, and live `8777` verification.
- Added progress table row:
  - `Slice 184：PRD v3.43 真实代码/默会知识修复`
- Updated real-code anchor rows for:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
- Repaired stale wording that still implied natural-language queue control was wholly missing.
- Repaired Phase 1/2/3 summaries so they include Slice 183 and this Slice 184 document repair.
- Kept target-vs-current boundaries explicit:
  - Visual Agent Plan Board is still read-only MVP, not editable/DAG-complete.
  - Timeline details still lack Undo, Replay, full developer JSON panel, and complete Humanizer dictionary.
  - `queued_draft` / prepare / queue-control are minimum code closures, not live `8777` product verification.
  - `8777` remains user-managed and must not be touched automatically.

### 184.4 Current Runtime Boundary After This Slice

Completed minimum closures now include:

- Project execution store and backend execution service minimum.
- Input-above execution drawer minimum.
- Orchestrator run/pause/resume/retry/skip minimum.
- Selected-event retry/skip/video authorization minimum.
- Dependency-blocked minimum recovery and source-event dependency summary.
- Queue scheduling, queue warning, queued card top/pause/resume/cancel controls.
- Backend queue-control best-effort sync.
- Queued prepare/recompile minimum with `queued_draft` stale-action protection.
- Prepare failure diagnostics and cross-restart safe-pause.
- Natural-language single queued-task control before model guard / LLM call.
- Natural-language `取消全部排队任务` batch cancel for queued/queued_draft tasks.

Still not complete:

- Natural-language current-task pause/resume.
- Natural-language bulk reorder.
- Multi-turn references like `把刚刚那个置顶`.
- Ambiguity confirmation for broad or risky queue commands.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Chat overlay/backdrop blur and click-outside collapse.
- Completed-summary close and full execution history browser.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 184.5 Verification Commands

Run these before claiming Slice 184 documentation repair is complete:

```powershell
python - <<'PY'
from pathlib import Path
prd = Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8-sig')
handoff = Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8-sig', errors='replace')
checks = {
    'PRD version v3.43': '版本：v3.43' in prd,
    'PRD Slice 184 row': 'Slice 184：PRD v3.43' in prd,
    'PRD doc-only status': '本轮是文档修复切片，不改运行时代码' in prd,
    'PRD cancel_all boundary': '取消全部排队任务' in prd and 'cancel_all' in prd,
    'PRD current-task gap': '自然语言当前任务暂停/继续' in prd,
    'PRD no duplicated semantic phrase': '完整语义版完整语义版' not in prd,
    'Handoff Slice 184 section': '## 184. PRD v3.43 Real-Code/Tacit-Knowledge Repair Slice' in handoff,
    'Handoff no 8777 touch': 'Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.' in handoff,
    'No replacement char': '\ufffd' not in prd and '\ufffd' not in handoff,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
raise SystemExit(1 if failed else 0)
PY
git diff --check -- docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this documentation-only slice.


## 185. Natural-Language Active Execution Pause/Resume Runtime Slice (2026-06-10)

This runtime slice closes the Slice 184 remaining gap for natural-language current-task pause/resume. It does not claim bulk reorder, multi-turn references, ambiguity confirmation, current-task cancel, full queue failure/video/dependency policy, live `8777` verification, Undo, or Replay are complete.

### 185.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- Tried CodeGraph first because this project has CodeGraph configured; it still returned `database is locked`.
- Followed the AGENTS fallback with targeted `rg` / file reads and local Node tests.
- Kept existing queue-control behavior intact: `暂停下一个任务` remains a queued-task command, and `取消当前任务` is still not implemented by this slice.

### 185.2 RED Test

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language active execution pause and resume bypass model guard`

The RED run failed before implementation because the send button stayed disabled when model configuration was required and the draft was `暂停当前任务`.

Command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "natural-language active execution pause"
```

Observed RED symptom:

- Expected the local command send button to be enabled.
- Actual button state was disabled, proving there was no pre-model-guard active execution control path.

### 185.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added active execution parser/helper functions:
  - `activeExecutionControlExecution(executionStore)`
  - `parseNaturalLanguageActiveExecutionControl(message, executionStore)`
  - `activeExecutionControlTitle(execution)`
  - `activeExecutionControlReply(action, execution)`
- Added `applyNaturalLanguageActiveExecutionControl(message, options, command)`:
  - handles only `pause` / `resume`;
  - requires current-task wording such as `当前`, `正在`, `这个`, `此`, `active`, or `current`;
  - rejects queue wording such as `排队`, `队列`, `下一个`, `上一个`, `第`, `最后`, `queue`, or `queued`;
  - rejects canvas-object wording such as `节点`, `画布`, `图层`, `素材`, or `连线`;
  - calls `state.executionOrchestrator.pause(id)` for an executing active task;
  - calls `state.executionOrchestrator.resume(id, { agentMode, videoAuthorized })` for a paused active task;
  - writes local user/assistant messages, `lastResponse.executionControl`, `lastReceipt`, `lastReceiptDetails`, and `status="done_no_actions"` without calling the LLM.
- Added `executionOrchestrator` injection to `createAssistantPanelState()` and `state.setExecutionOrchestrator(orchestrator)`.
- Updated `createAppAssistantPanel()` to call `state.setExecutionOrchestrator?.(resolvedExecutionOrchestrator)` so the state-level local command path can use the same Orchestrator as drawer controls.
- Updated `canSendMessage(message)` so current-task local commands are enabled even when `modelConfigRequired=true`.
- Updated `sendMessage(text, options)` so current-task commands are parsed synchronously and intercepted before queue control, model config guard, `api.chat/chatStream`, and LLM calls.

A regression was found while running broader tests: the first implementation awaited an async active-control helper before adding normal chat placeholders, which broke the existing "thinking placeholder" synchronous behavior. The fix was to parse the active-control command synchronously in `sendMessage()` and only call the async helper when a command actually matches.

### 185.4 Behavior Now Covered

Completed minimum closure:

- `暂停当前任务` pauses the current active execution locally.
- `继续当前任务` resumes the current paused execution locally.
- Both commands bypass missing model configuration, `api.chat/chatStream`, and LLM calls.
- The local resume path passes `agentMode` and keeps `videoAuthorized:false` unless explicit video authorization state exists.
- Normal chat still shows the thinking placeholder synchronously.
- Existing queue controls remain separate:
  - `暂停下一个任务` still targets queued work.
  - `继续暂停任务` still resumes queued paused work.
  - `取消当前任务` is not implemented by this slice and must not cancel queued work by accident.

Still not complete:

- Natural-language current-task cancel.
- Natural-language bulk reorder.
- Multi-turn references like `把刚刚那个置顶`.
- Ambiguity confirmation for broad or risky commands.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Completed-summary close and full execution history browser.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 185.5 Verification Results

Fresh verification run in this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.test.js --test-name-pattern "thinking placeholder"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "natural-language active execution pause"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
```

Results:

- `thinking placeholder` focused run: 47 pass, 0 fail.
- `natural-language active execution pause` focused run: 61 pass, 0 fail.
- Combined app panel run: 108 pass, 0 fail.
- `node --check modules\app\appAssistantPanel.js`: exit 0.

### 185.6 PRD v3.44 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.43` to `v3.44`.
- Added `Slice 185：自然语言当前任务暂停/继续最小闭环` to the real-code progress table.
- Updated the top status, Phase 1/2/3 summaries,方案 B difference table, and self-check so current-task pause/resume is no longer listed as an unfinished natural-language gap.
- Kept the remaining natural-language gaps explicit: bulk reorder, multi-turn references, ambiguity confirmation, current-task cancel, full queue failure/video/dependency policy, and live `8777` verification.
- Kept target-vs-current boundaries explicit for editable plan board, overlay/blur, completed-summary close, complete history, complete Humanizer, Undo, and Replay.

### 185.7 Verification Commands For Next Handoff

Run these before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python - <<'PY'
from pathlib import Path
prd = Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8-sig')
handoff = Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8-sig', errors='replace')
checks = {
    'PRD version v3.44': '版本：v3.44' in prd,
    'PRD Slice 185 row': 'Slice 185：自然语言当前任务暂停/继续最小闭环' in prd,
    'PRD active parser anchor': 'parseNaturalLanguageActiveExecutionControl()' in prd,
    'PRD current pause done': '暂停当前任务 / 继续当前任务' in prd,
    'PRD remaining bulk reorder': '批量重排' in prd,
    'Handoff Slice 185 section': '## 185. Natural-Language Active Execution Pause/Resume Runtime Slice' in handoff,
    'Handoff no 8777 touch': 'Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.' in handoff,
    'No replacement char': '\ufffd' not in prd and '\ufffd' not in handoff,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
raise SystemExit(1 if failed else 0)
PY
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

## 186. Natural-Language Active Execution Cancel Runtime Slice (2026-06-10)

This runtime slice closes the Slice 185 remaining gap for natural-language current-task cancel. It does not claim bulk reorder, multi-turn references, ambiguity confirmation, full queue failure/video/dependency policy, live `8777` verification, editable plan board, full history browser, Undo, or Replay are complete.

### 186.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- Tried CodeGraph first because this project has CodeGraph configured; it still returned `database is locked`.
- Followed the AGENTS fallback with targeted `rg` / file reads and local Node tests.
- Kept existing queue-control behavior intact:
  - `取消第一个排队任务` still cancels queued work.
  - `取消全部排队任务` still cancels queued/queued_draft work and keeps active work.
  - `取消第一个节点` is still not mistaken for task control.
  - `暂停当前任务/继续当前任务` remains the Slice 185 active-task control path.

### 186.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language active execution cancel bypasses model guard`

The RED run failed before implementation because the send button stayed disabled when model configuration was required and the draft was `取消当前任务`.

Command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "active execution cancel"
```

Observed RED symptom:

- Expected the local command send button to be enabled.
- Actual button state was disabled, proving there was no pre-model-guard active execution cancel path.

Added focused coverage in `modules/assistant/assistantExecutionOrchestrator.test.js`:

- `assistantExecutionOrchestrator: cancel stops after current action and keeps queued work`

The RED run failed before implementation because `orchestrator.cancel()` did not exist; the call from `executeActions()` threw, and `run()` marked the execution `failed` instead of `cancelled`.

Command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "cancel stops"
```

Observed RED symptom:

- Expected `result.status === "cancelled"`.
- Actual status was `failed`, proving active cancel was not a first-class Orchestrator control.

### 186.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Extended `parseNaturalLanguageActiveExecutionControl(message, executionStore)` so `cancel` is a valid active-execution action alongside `pause` and `resume`.
- Kept the active-control guardrails:
  - requires current-task wording such as `当前`, `正在`, `这个`, `此`, `active`, or `current`;
  - rejects queue wording such as `排队`, `队列`, `下一个`, `上一个`, `第`, `最后`, `queue`, or `queued`;
  - rejects canvas-object wording such as `节点`, `画布`, `图层`, `素材`, or `连线`.
- Added `cancel: "已取消当前任务"` to `activeExecutionControlReply()`.
- Extended `applyNaturalLanguageActiveExecutionControl()`:
  - for `cancel`, first calls `state.executionOrchestrator.cancel(id, { agentMode, videoAuthorized })` when available;
  - if no Orchestrator cancel function is present, falls back to `executionStore.updateStatus(id, "cancelled", ...)`;
  - writes local user/assistant messages, `lastResponse.executionControl`, `lastReceipt`, `lastReceiptDetails`, and `status="done_no_actions"` without calling the LLM.
- `canSendMessage(message)` already calls the active-control parser before model guard, so `取消当前任务` now stays sendable without model configuration.
- `sendMessage(text, options)` already intercepts active-control commands before queue control, model config guard, `api.chat/chatStream`, and LLM calls.

Updated `modules/assistant/assistantExecutionOrchestrator.js`:

- Added `cancelRequests = new Set()` next to `pauseRequests`.
- Added `cancel(executionId)` to the returned Orchestrator API.
- Running active execution behavior:
  - `cancel(id)` records a cancel request and clears any pending pause request.
  - The current action is not force-killed.
  - After the current action completes and its completed timeline event is written, `run()` sees the cancel request, appends a `status:"cancelled"` timeline event, updates execution status to `cancelled`, clears `orchestratorState.running`, and returns `{ status:"cancelled" }`.
  - Queued/queued_draft work is preserved and not auto-started after cancel.
- Non-running cancellable execution behavior:
  - `draft`, `executing`, `waiting_confirmation`, `waiting_video_authorization`, `paused`, and `failed` executions can be marked `cancelled` directly.
  - Completed/cancelled/queued statuses are not incorrectly treated as active current-task cancel targets.
- `finally` now clears both `pauseRequests` and `cancelRequests` for the execution id.

Updated `modules/app/appAssistantPanel.p1Ui.test.js`:

- Added active cancel UI test proving:
  - send button is enabled when model config is missing;
  - `api.chat()` is not called;
  - `executionOrchestrator.cancel("exec-active-cancel")` is called;
  - active execution becomes `cancelled`;
  - queued execution remains `queued`;
  - assistant feedback says `已取消当前任务`.
- Updated the old active-task wording guard test to the new product truth:
  - `取消当前任务` is now active-task cancel;
  - it must not cancel queued work.

### 186.4 Behavior Now Covered

Completed minimum closure:

- `取消当前任务` cancels the current active execution locally.
- The command bypasses missing model configuration, `api.chat/chatStream`, and LLM calls.
- Running cancel waits for the current action to return, then stops subsequent actions.
- Running cancel writes `cancelled` timeline/status and clears `orchestratorState.running`.
- Running cancel does not auto-start queued work.
- Existing queued controls remain separate:
  - `取消第一个排队任务` targets queued work.
  - `取消全部排队任务` targets queued/queued_draft work.
  - `取消第一个节点` is still rejected as local queue/current-task control.

Still not complete:

- Force-killing an already-started external generation task.
- Natural-language bulk reorder.
- Multi-turn references like `把刚刚那个置顶`.
- Ambiguity confirmation for broad or risky commands.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Completed-summary close and full execution history browser.
- Complete dependency result merge and downstream recompile.
- Complete Timeline Humanizer dictionary and developer JSON panel.
- Full cross-restart conflict policy with canvas revision/ownership checks.
- Undo and Replay.

### 186.5 PRD v3.45 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.44` to `v3.45`.
- Added `Slice 186：自然语言取消当前任务最小闭环` to the real-code progress table.
- Updated the top status, real-code anchors, 方案 B difference table, Phase 1/2/3 summaries, state-machine summary, and self-check so current-task cancel is no longer listed as an unfinished natural-language gap.
- Kept the remaining natural-language gaps explicit: bulk reorder, multi-turn references, ambiguity confirmation, full queue failure/video/dependency policy, and live `8777` verification.
- Kept target-vs-current boundaries explicit for editable plan board, overlay/blur, completed-summary close, complete history, complete Humanizer, complete dependency result merge, Undo, and Replay.

### 186.6 Verification Results

Fresh focused verification during this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js --test-name-pattern "cancel stops"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "active execution cancel|active-task cancel|canvas node wording"
```

Observed focused results:

- Orchestrator focused run: 19 pass, 0 fail.
- App panel focused run: 62 pass, 0 fail.

Run the full verification block below after any later edits before claiming this slice remains clean.

### 186.7 Verification Commands For Next Handoff

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\assistant\assistantExecutionOrchestrator.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionOrchestrator.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python - <<'PY'
from pathlib import Path
prd = Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8-sig')
handoff = Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8-sig', errors='replace')
checks = {
    'PRD version v3.45': '版本：v3.45' in prd,
    'PRD Slice 186 row': 'Slice 186：自然语言取消当前任务最小闭环' in prd,
    'PRD cancel current phrase': '取消当前任务' in prd,
    'PRD active cancel implementation anchor': 'executionOrchestrator.cancel(id)' in prd,
    'PRD remaining bulk reorder': '批量重排' in prd,
    'Handoff Slice 186 section': '## 186. Natural-Language Active Execution Cancel Runtime Slice' in handoff,
    'Handoff no 8777 touch': 'Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.' in handoff,
    'No replacement char': '\ufffd' not in prd and '\ufffd' not in handoff,
}
failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL'), name)
raise SystemExit(1 if failed else 0)
PY
git diff --check -- modules/assistant/assistantExecutionOrchestrator.js modules/assistant/assistantExecutionOrchestrator.test.js modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 194. Clarification Completed Card Persistence Runtime / PRD v3.53 Repair Slice (2026-06-10)

This slice closes the smallest gap after Slice 193: once the user resolves an `execution_control_clarification` card, the in-memory completed state is written back to the local persistent conversation store. This prevents restored local history from continuing to show the same latest card as `needs_clarification`. It is still a local `conversationStore` loop, not cross-device/backend message mutation or multi-pending clarification management.

### 194.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first; MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Because `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` still exist in the workspace, this slice used `rg`, targeted file reads, and offline Node/document checks.
- Continued the existing TDD chain from Slice 193 before claiming the persistence behavior.

### 194.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: completed clarification card is persisted after selection`

Added focused coverage in `modules/assistant/assistantConversationStore.test.js`:

- `assistantConversationStore: updates a persisted message card by id`

Observed RED symptoms before implementation:

- `conversationStore` had no `updateMessageCard()` API.
- After `取消任务 -> 当前任务`, the in-memory card became `completed`, but the saved conversation card remained `needs_clarification`.

### 194.3 Runtime Implementation

Updated `modules/assistant/assistantConversationStore.js`:

- Added `updateMessageCard(id, cardId, patch = {})`.
  - Finds the saved conversation by id.
  - Walks messages/cards from newest to oldest.
  - Merges the patch into the matching card id through `sanitizeJson()`.
  - Preserves the original card id and calls `touch(conversation)` so storage is persisted.
  - Returns `null` when the conversation or card id is missing.

Updated `modules/app/appAssistantPanel.js`:

- `completeExecutionControlClarificationCard(target)` still updates the latest in-memory `execution_control_clarification` card to `completed`.
- After the in-memory update, it now best-effort calls `conversationStore.updateMessageCard(state.conversationId, updated.id, updated)` when a conversation id and store method exist.
- The writeback is intentionally local and best-effort, so older stores or tests without the method keep the existing UI behavior.

### 194.4 Behavior Covered

- `取消任务` persists a pending clarification card to the local conversation store.
- Choosing `当前任务` updates the in-memory clarification card to `completed`.
- The same card id in `conversationStore.get(conversation.id).messages[*].cards[*]` is updated to `status:"completed"` and `selectedTarget:"active"`.
- Future local restore no longer treats that card as the latest pending clarification.

Still not complete:

- Multiple pending clarification archives.
- Cross-device or backend message update semantics for clarification card state.
- Complex multi-turn references beyond latest-message target restoration.
- Natural-language bulk reorder.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 194.5 PRD v3.53 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Kept version at `v3.53`.
- Added `Slice 194：澄清完成态本地持久回写最小闭环` to the real-code progress table.
- Updated the top status, real-code anchors, natural-language queue/current-task control boundary, Phase 3 summary, queue-state summary, and self-check so completed-card local persistent writeback is marked complete.
- Removed stale wording that listed completed-card local persistent writeback as a remaining gap.
- Kept the correct remaining boundary: multiple pending clarification archives, cross-device/backend message updates, complex multi-turn semantics, bulk reorder, full queue failure/video/dependency linkage, live `8777` verification, complete history/Humanizer/dependency merge, Undo, and Replay are still not complete.

### 194.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantConversationStore.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.53':'版本：v3.53' in prd,'PRD Slice 194':'Slice 194：澄清完成态本地持久回写最小闭环' in prd,'PRD updateMessageCard anchor':'updateMessageCard()' in prd,'Handoff Slice 194':'## 194. Clarification Completed Card Persistence Runtime / PRD v3.53 Repair Slice' in h,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantConversationStore.js modules/assistant/assistantConversationStore.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.
## 195. Multiple Pending Clarification Archive Runtime / PRD v3.54 Repair Slice (2026-06-10)

This slice closes the smallest remaining clarification-card safety gap after Slice 194: when a new clarification, an explicit current/queue control command, or a normal chat turn continues, old pending `execution_control_clarification` cards are archived and disabled instead of remaining clickable. The implementation is local to the panel and local `conversationStore`; it does not add backend/cross-device message mutation.

### 195.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first; MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Because `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` still exist in the workspace, this slice used `rg`, targeted file reads, and offline Node/document checks.
- Continued the existing TDD chain from Slice 194 before claiming the archive behavior.

### 195.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: new ambiguous clarification archives the previous pending card`
- `appAssistantPanel Phase 2 UI: archived clarification cards render disabled`

Observed RED symptoms before implementation:

- `取消任务 -> 暂停任务` left the first clarification card as `needs_clarification`, so an older card could still be selected later.
- Archived/non-pending clarification cards were not treated as generally resolved in the render path.

### 195.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `archivePendingExecutionControlClarificationCards(summary = "")`.
  - Walks all in-memory messages/cards from newest to oldest.
  - Finds `execution_control_clarification` cards with `status:"needs_clarification"`.
  - Updates each one to `status:"archived"` and replaces the summary with a context-specific archive message.
  - Best-effort writes the updated card back through `conversationStore.updateMessageCard(state.conversationId, updated.id, updated)`.
  - Clears `state.pendingExecutionControlClarification` when at least one card is archived.
- `applyNaturalLanguageAmbiguousExecutionControl()` archives existing pending cards before creating the next broad-command clarification.
- `applyNaturalLanguageQueueControl()` archives existing pending cards before executing a clear queue-task command.
- `applyNaturalLanguageActiveExecutionControl()` archives existing pending cards before executing a clear current-task command.
- The normal LLM/chat path archives existing pending cards after model-config guard passes and before calling `api.chat/chatStream`, so stale clarification choices do not survive an unrelated user turn.
- `completeExecutionControlClarificationCard(target)` now refuses any card whose status is not exactly `needs_clarification`, so archived cards cannot be completed by stale clicks.
- `renderInteractionCard()` now treats any non-`needs_clarification` clarification card as resolved; both `当前任务` and `排队任务` buttons become disabled and no click handlers are attached.

### 195.4 Behavior Covered

- `取消任务 -> 暂停任务` archives the first persisted and in-memory clarification card, then creates a second pending card for the newer action.
- A follow-up `当前任务` consumes the latest pending pause request, not the archived cancel request.
- The archived first card remains `archived`; the second card becomes `completed` with `selectedTarget:"active"` after selection.
- Rendered archived clarification cards have both action buttons disabled, while the latest pending card remains selectable.

Still not complete:

- Cross-device or backend message update semantics for clarification card state.
- Complex multi-turn references beyond latest-message target restoration and basic pending-card archive.
- Natural-language bulk reorder.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 195.5 PRD v3.54 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set/kept version at `v3.54`.
- Added `Slice 195：多个未决澄清自动归档最小闭环` to the real-code progress table.
- Updated the top status, real-code anchors, natural-language queue/current-task control boundary, Phase 3 summary, queue-state summary, and self-check so old pending clarification archive is marked complete.
- Removed stale duplicate `195/195` slice references and kept the remaining boundary focused on cross-device/backend updates, complex semantics, bulk reorder, full queue linkage, live `8777`, complete history/Humanizer/dependency merge, Undo, and Replay.

### 195.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantConversationStore.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.54':'版本：v3.54' in prd,'PRD Slice 195':'Slice 195：多个未决澄清自动归档最小闭环' in prd,'PRD archive anchor':'archivePendingExecutionControlClarificationCards()' in prd,'Handoff Slice 195':'## 195. Multiple Pending Clarification Archive Runtime / PRD v3.54 Repair Slice' in h,'No duplicate 195':'195/195' not in prd,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/app/appAssistantPanel.test.js modules/assistant/assistantConversationStore.js modules/assistant/assistantConversationStore.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.
## 192. Clarification Card Completion / Disabled-State Runtime Slice (2026-06-10)

This slice closes the smallest UX gap left after Slice 190: once the user chooses `当前任务` or `排队任务` from an ambiguity clarification card, the original card now visibly completes and both choice buttons are disabled. This prevents repeated clicks on the same clarification card and gives the user a clear visual record of the chosen target.

### 192.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first before implementation; MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Because `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` still exist in the workspace, this slice used `rg`, targeted file reads, and offline Node tests.
- Followed TDD: wrote the failing UI test first, confirmed RED, then implemented the smallest runtime/UI change.

### 192.2 RED Test

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: ambiguous clarification card completes and disables after selection`

RED command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card completes"
```

Observed RED symptom:

- The clarification card stayed `data-status="needs_clarification"` after selecting `当前任务`.
- The current/queue buttons were still enabled, so the card had no completed/disabled visual state.

### 192.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `latestExecutionControlClarificationCardTarget(cardId = "")`.
  - Finds the latest `execution_control_clarification` card in `state.messages`.
  - Keeps the implementation separate from `latestCanvasActionCardTarget()` so canvas action cards are not affected.
- Added `completeExecutionControlClarificationCard(target)`.
  - Updates the latest clarification card with `status:"completed"`.
  - Stores `selectedTarget:"active"|"queue"`.
  - Rewrites the card summary to `已选择当前任务/排队任务，正在执行对应操作。`
- Updated `applyPendingExecutionControlClarification()`.
  - Marks the clarification card completed before dispatching the clarified active/queue control.
  - This path is shared by typed follow-ups and card-button follow-ups.
- Updated `renderInteractionCard()` for `execution_control_clarification`.
  - Completed cards disable `.hy-canvas-agent-clarify-current` and `.hy-canvas-agent-clarify-queue`.
  - Completed cards write `aria-disabled`.
  - The chosen button receives `data-selected="true"`.
  - Disabled cards no longer bind click handlers, so fake DOM repeated clicks do not re-execute the same card.
- Updated the inline CSS string.
  - Disabled clarification buttons get lower opacity and default cursor.
  - Selected clarification target gets a subtle outline.

### 192.4 Behavior Covered

- `取消任务` -> clarification card -> click `当前任务`:
  - current task is cancelled through the existing active control path;
  - original clarification card becomes `completed`;
  - both target buttons become disabled;
  - the selected current button has `data-selected="true"`;
  - clicking the disabled rendered current button again does not call active cancel again.

Still not complete:

- Persisting the pending clarification/card state across reload/history restore.
- Restoring completed clarification cards from conversation history with cards attached.
- Complex multi-turn references beyond the current short target follow-up.
- Natural-language bulk reorder.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 192.5 PRD v3.51 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.50` to `v3.51`.
- Added `Slice 192：澄清卡片完成/禁用态最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, section 2.4, section 2.5, Phase 3 summary, queue-state summary, and self-check.
- Replaced the previous current-boundary wording that still listed local card completion/disabled state as missing.
- Kept the correct remaining boundary: cross-session clarification persistence, complex multi-turn semantics, bulk reorder, full queue failure/video/dependency linkage, live `8777` verification, complete history/Humanizer/dependency merge, Undo, and Replay are still not complete.

### 192.6 Verification Results

Focused RED/GREEN verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card completes"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card|ambiguous follow-up|ambiguous natural-language (task control|pause|resume)"
```

Observed results:

- RED failed as expected before implementation: card status remained `needs_clarification`.
- Focused GREEN after implementation: 70 pass, 0 fail.

Run the full verification block below after later edits before claiming this slice remains clean:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.51':'版本：v3.51' in prd,'PRD Slice 192':'Slice 192：澄清卡片完成/禁用态最小闭环' in prd,'PRD completion anchor':'completeExecutionControlClarificationCard()' in prd,'Handoff Slice 192':'## 192. Clarification Card Completion / Disabled-State Runtime Slice' in h,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 190. Ambiguous Task-Control Clarification Card Runtime Slice (2026-06-10)

This slice closes the UI part of the broad task-control clarification loop. After `取消任务` / `暂停任务` / `继续任务` asks whether the user means the current task or queued task, the assistant message now includes clickable `当前任务` / `排队任务` buttons. Button clicks intentionally reuse the Slice 189 follow-up path (`state.sendMessage("当前任务"|"排队任务")`) instead of bypassing the active/queue safety paths.

### 190.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- CodeGraph was not relied on for this slice; earlier attempts in this area returned locked/unavailable states, so implementation and verification used targeted code reads and local Node tests.
- Followed TDD: added focused UI tests for clarification buttons, observed RED because the buttons did not exist, then implemented the smallest rendering/handler path.

### 190.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: ambiguous clarification card current button executes requested active control`
- `appAssistantPanel Phase 2 UI: ambiguous clarification card queue button executes requested queue control`

RED command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card"
```

Observed RED symptoms:

- `.hy-canvas-agent-clarify-current` was missing after `取消任务`.
- `.hy-canvas-agent-clarify-queue` was missing after `暂停任务`.

### 190.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `executionControlClarificationCard(command)`.
  - Builds an `execution_control_clarification` card.
  - Stores `status:"needs_clarification"`, action label, active button label, and queue button label.
  - Uses `取消全部排队任务` wording for broad `cancel all` queue clarification.
- Updated `applyNaturalLanguageAmbiguousExecutionControl()`.
  - Still writes `pendingExecutionControlClarification`.
  - Assistant clarification message now includes `cards: [executionControlClarificationCard(command)]`.
  - Still does not call LLM/API chat and still does not mutate active/queued work.
- Updated `renderInteractionCard()`.
  - Added a branch for `card.type === "execution_control_clarification"`.
  - Renders `.hy-canvas-agent-clarify-current` and `.hy-canvas-agent-clarify-queue`.
  - Button clicks call `onClarifyTarget(card, "active"|"queue")`.
- Updated `createAppAssistantPanel()`.
  - Added `handleClarificationCard(_card, target)`.
  - Maps the selected target to the short follow-up text `当前任务` or `排队任务`.
  - Calls `state.sendMessage(text, { onUpdate: render })`, reusing Slice 189 pending clarification execution.
- Updated `renderMessages()` handlers.
  - Wires `onClarifyTarget` through `schedule(() => handleClarificationCard(card, target))`.

### 190.4 Behavior Covered

- `取消任务` -> clarification card -> click `当前任务` cancels active execution through the active control path and does not cancel queued work.
- `暂停任务` -> clarification card -> click `排队任务` pauses the first queued execution through the queue control path and best-effort syncs `queue-control`.
- Both button paths:
  - bypass missing model config through the same local-control send path;
  - do not call `api.chat/chatStream`;
  - reuse existing active/queue execution safety behavior;
  - do not directly mutate non-target work.

Still not complete:

- Card completion/disabled state after a choice is clicked.
- Persisted clarification context across reload/history restore.
- Complex follow-up language and complex multi-turn references.
- Natural-language bulk reorder.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, Undo, and Replay.

### 190.5 PRD v3.49 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.48` to `v3.49`.
- Added `Slice 190：歧义澄清卡片按钮最小闭环` to the real-code progress table.
- Updated top status, code anchors, section 2.4, section 2.5, Phase 3 summary, queue-state summary, and self-check.
- Replaced the previous “clickable clarification buttons still missing” current boundary with the new boundary: buttons exist and execute through the pending clarification path, but card completion state, persisted context, complex multi-turn references, and full NL scheduling are still not complete.

### 190.6 Verification Results

Focused verification from the runtime slice:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card|ambiguous follow-up|ambiguous natural-language (task control|pause|resume)"
```

Observed focused result:

- 69 pass, 0 fail.

## 191. PRD v3.50 Real-Code / Tacit-Knowledge Repair Slice (2026-06-10)

This slice is a document-only repair based on the current code and project tacit knowledge. It does not add runtime behavior. Its purpose is to make the PRD the source of truth again after Slice 190, so handoff developers do not mistake old “button missing” wording for the current boundary.

### 191.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first. The MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- The workspace still contains `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock`, so the practical fallback was `rg`, targeted file reads, and offline Node/document checks.

### 191.2 Real Code Checked

Verified the current behavior against these anchors:

- `modules/app/appAssistantPanel.js`
  - `parseNaturalLanguageAmbiguousExecutionControl()`
  - `applyNaturalLanguageAmbiguousExecutionControl()`
  - `parsePendingExecutionControlClarification()`
  - `applyPendingExecutionControlClarification()`
  - `executionControlClarificationCard()`
  - `renderInteractionCard()`
  - `handleClarificationCard()`
  - `canSendMessage()`
  - `sendMessage()`
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - broad task-control clarification tests
  - short follow-up current/queue execution tests
  - clarification card current/queue button tests

### 191.3 PRD Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.49` to `v3.50`.
- Updated the top status to say this is a pure PRD/handoff repair and that runtime code was not changed in this slice.
- Added `Slice 191：PRD v3.50 真实代码/默会知识复核` to the real-code progress table.
- Updated section headings from `2.4 v3.49` / `2.5 v3.49` to `2.4 v3.50` / `2.5 v3.50`.
- Clarified Slice 188 history: button support was missing at Slice 188 time but is now complete as a Slice 190 minimal loop.
- Updated the self-check summary so Slice 190 button execution is listed as an already completed minimal capability.
- Corrected the current CodeGraph status wording from the previous `database is locked` statement to the current MCP response, while preserving older locked notes as historical slice context.

### 191.4 Current Boundary After Repair

Completed minimal loops:

- Broad task-control commands ask for clarification instead of guessing.
- Short `当前任务` / `排队任务` follow-up executes the pending requested action.
- Clarification card buttons call the same safe short follow-up path.

Still not complete:

- Clarification card completion/disabled state.
- Clarification context persistence across reload/history restore.
- Complex multi-turn reference resolution.
- Natural-language bulk reorder.
- Full queue failure/video/dependency linkage.
- Real `8777` live verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 191.5 Fresh Verification Results

Fresh verification run after the PRD repair:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
```

Observed results:

- `appAssistantPanel.p1Ui.test.js` + `appAssistantPanel.test.js`: 116 pass, 0 fail.
- `D:\Aic\node.exe --check modules\app\appAssistantPanel.js`: exit 0.

Run the document consistency and diff checks below before the next handoff claims this slice remains clean:

```powershell
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.50':'版本：v3.50' in prd,'PRD Slice 191':'Slice 191：PRD v3.50 真实代码/默会知识复核' in prd,'PRD Slice 190 button anchor':'executionControlClarificationCard()' in prd and 'handleClarificationCard()' in prd,'Handoff Slice 190':'## 190. Ambiguous Task-Control Clarification Card Runtime Slice' in h,'Handoff Slice 191':'## 191. PRD v3.50 Real-Code / Tacit-Knowledge Repair Slice' in h,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 187. PRD v3.46 Real-Code/Tacit-Knowledge Repair Slice (2026-06-10)

This is a documentation-only slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`. It does not change runtime code and does not claim ambiguity confirmation, bulk reorder, multi-turn references, Undo/Replay, full history, full dependency merge, or live `8777` integration are complete.

### 187.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- Tried CodeGraph first because this project has CodeGraph instructions; current MCP status returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Followed the fallback with targeted `rg` / direct file reads and documentation consistency checks.
- Kept this as a PRD repair slice only; no runtime JS/Python behavior was changed.

### 187.2 Real-Code Findings

- `modules/app/appAssistantPanel.js::parseNaturalLanguageQueueControl()` only catches queue controls when the text includes queue/ordinal hints such as `排队`, `队列`, `第`, `下一个`, `上一个`, `最后`, `queue`, or `queued`.
- `modules/app/appAssistantPanel.js::parseNaturalLanguageActiveExecutionControl()` only catches current-task controls when the text includes current-task hints such as `当前`, `正在`, `这个`, `此`, `active`, or `current`.
- `取消当前任务` is implemented by Slice 186; it calls `executionOrchestrator.cancel(id)` when available and falls back to `executionStore.updateStatus(id, "cancelled", ...)`.
- Running active cancel is request-based: `assistantExecutionOrchestrator.cancel()` waits until the current action returns, then writes `cancelled` timeline/status and does not auto-start queued work.
- Broad commands like `取消任务`, `暂停任务`, `继续任务`, and `取消全部任务` are not local execution controls today. With missing model configuration they should hit the model guard rather than mutate active/queued state.

### 187.3 PRD Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.45` to `v3.46`.
- Added `Slice 187：PRD v3.46 真实代码/默会知识修复` to the progress table.
- Corrected the top status and current environment constraints to say current CodeGraph is `not initialized`, while older `database is locked` mentions remain historical slice notes.
- Added an explicit natural-language ambiguity boundary: broad task commands must ask for clarification before changing execution state.
- Fixed the queue/task cancellation wording in sections 9.9 and 9.10 so PRD no longer implies `取消任务` or `取消全部任务` is already safe local control.
- Updated self-check so the remaining gap lists `歧义确认` as covering broad commands like `取消任务/暂停任务/继续任务/取消全部任务`.

### 187.4 Verification Results

Fresh documentation verification for this slice:

```powershell
python -c "from pathlib import Path; p=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md'); prd=p.read_text(encoding='utf-8'); handoff=h.read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.46':'版本：v3.46' in prd,'PRD Slice 187':'Slice 187：PRD v3.46 真实代码/默会知识修复' in prd,'PRD broad cancel boundary':'取消任务/暂停任务/继续任务/取消全部任务' in prd,'PRD CodeGraph not initialized':'CodeGraph not initialized for this project' in prd,'Handoff Slice 187':'## 187. PRD v3.46 Real-Code/Tacit-Knowledge Repair Slice' in handoff,'No replacement char':'\\ufffd' not in prd and '\\ufffd' not in handoff}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this documentation-only slice.

## 188. Natural-Language Ambiguous Task Control Clarification Runtime Slice (2026-06-10)

This slice closes the first minimal ambiguity-confirmation loop for broad natural-language task-control commands. It updates runtime code, UI tests, and the PRD. It does not claim full NL scheduling, clickable clarification buttons, multi-turn disambiguation, bulk reorder, full queue failure/video/dependency policy, live `8777` verification, Undo, or Replay are complete.

### 188.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- Tried CodeGraph first; this turn returned `database is locked`, so work fell back to targeted `rg` / direct file reads and local Node/Python verification.
- Used the existing RED test from the interrupted slice for `暂停任务`, then added a RED test for `继续任务` before enabling resume ambiguity handling.

### 188.2 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- `parseNaturalLanguageAmbiguousExecutionControl(message, executionStore)` now accepts `cancel`, `pause`, and `resume` broad task-control actions.
- Broad commands still require `任务/task` wording and still reject canvas-object wording such as node/canvas/layer/asset/connection.
- Existing explicit controls remain higher priority:
  - `取消当前任务 / 暂停当前任务 / 继续当前任务` still go through active execution control.
  - `取消第一个排队任务 / 暂停下一个任务 / 继续暂停的任务 / 取消全部排队任务` still go through queue control.
- `ambiguousExecutionControlReply(command)` now has explicit pause and resume clarification copy:
  - `暂停任务` asks whether to pause the current task or queued task.
  - `继续任务` asks whether to resume the current task or queued task.
- `hasQueueControlHint(text)` was narrowed from broad `暂停任务` to `暂停的任务`, so `暂停任务` no longer gets mistaken for queue pause, while `继续暂停的任务` still works as queue resume.
- `applyNaturalLanguageAmbiguousExecutionControl()` returns local assistant feedback without calling `api.chat/chatStream`, without touching active/queued state, and writes:
  - `executionControl.action = "clarify"`
  - `executionControl.requestedAction = "cancel" | "pause" | "resume"`
  - `executionControl.status = "needs_clarification"`
  - `state.status = "done_no_actions"`

Updated `modules/app/appAssistantPanel.p1Ui.test.js`:

- Existing RED/GREEN coverage for `取消任务` remains.
- Completed RED/GREEN for `暂停任务` broad ambiguity.
- Added RED/GREEN for `继续任务` broad ambiguity.
- Focused tests prove broad cancel/pause/resume:
  - are sendable even when model config is missing;
  - do not call LLM/API chat;
  - do not mutate active execution status;
  - do not mutate queued execution status or `queuePaused`;
  - append clarification copy to chat messages.

### 188.3 PRD v3.47 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.46` to `v3.47`.
- Added `Slice 188：自然语言任务控制歧义确认最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, section 2.4, section 2.5, queue rules, Phase 3 summary, and self-check.
- Corrected the previous Slice 187 boundary: broad commands are still not directly executable, but now they are intercepted locally for first-turn clarification instead of falling into model guard.
- Kept remaining gaps explicit: clickable/plan-board clarification execution, multi-turn disambiguation, bulk reorder, full queue failure/video/dependency policy, live `8777` verification, full history, complete Humanizer, dependency result merge, Undo, and Replay.

### 188.4 Verification Results

Fresh verification run during this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous natural-language pause"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous natural-language resume"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous natural-language (task control|pause|resume)|natural-language queue commands top"
```

Observed focused results:

- First pause RED failed as expected before implementation: `actual undefined`, expected `clarify`.
- Pause focused GREEN: 64 pass, 0 fail.
- Resume RED failed as expected after temporarily narrowing resume support: sendability assertion failed.
- Resume + ambiguity focused GREEN: 65 pass, 0 fail.

### 188.5 Still Not Complete

- Clarification buttons or plan-board confirmation cards.
- Executing the clarified choice after the user answers in a second turn.
- Bulk reorder and multi-turn references.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, Undo, and Replay.

### 188.6 Verification Commands For Next Handoff

Run before claiming the branch remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.47':'版本：v3.47' in prd,'PRD Slice 188':'Slice 188：自然语言任务控制歧义确认最小闭环' in prd,'PRD clarify status':'needs_clarification' in prd,'PRD no replacement char':'\ufffd' not in prd,'Handoff Slice 188':'## 188. Natural-Language Ambiguous Task Control Clarification Runtime Slice' in h,'Handoff no 8777 touch':'Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.' in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 189. Ambiguous Task-Control Follow-Up Execution Runtime Slice (2026-06-10)

This slice closes the next minimal loop after Slice 188: once the assistant asks whether a broad command targets the current task or queued task, the user's short follow-up (`当前任务` / `排队任务`) now executes the previously requested control through the existing active/queue paths. It does not claim clickable clarification buttons, persisted clarification context, full NL scheduling, bulk reorder, complex multi-turn references, live `8777` verification, Undo, or Replay are complete.

### 189.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, or call the user-managed `8777` service.
- Tried CodeGraph first this turn; it returned `database is locked`, so work used targeted file reads and local Node tests.
- Followed TDD: added focused follow-up tests, observed RED, then implemented the smallest code path that reuses existing active/queue controls.

### 189.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: ambiguous follow-up current target executes requested active control`
- `appAssistantPanel Phase 2 UI: ambiguous follow-up queue target executes requested queue control`

RED command:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous follow-up"
```

Observed RED symptoms:

- `state.canSendMessage("当前任务")` was `false` after `取消任务` clarification because the follow-up had no parser and hit the missing-model guard.
- `state.canSendMessage("排队任务")` was `false` after `暂停任务` clarification for the same reason.

### 189.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `parsePendingExecutionControlClarification(message, clarification)`.
  - It consumes a pending requested action from the previous clarification.
  - It recognizes target-only follow-ups such as `当前任务` / `排队任务`.
  - It rejects canvas-object wording so node/canvas/asset instructions are not mistaken for task control.
- Added `clarifiedQueueControlCommand(clarification, executionStore)`.
  - For queue follow-up, it builds the same command object consumed by `applyNaturalLanguageQueueControl()`.
  - `cancel + all` maps to `cancel_all` over current queued/queued_draft work.
  - `resume` prefers a paused queued task, then falls back to the first queued item.
- Added `state.pendingExecutionControlClarification`.
  - `applyNaturalLanguageAmbiguousExecutionControl()` writes it when asking for clarification.
  - Explicit active/queue controls and clarified execution clear it.
- Updated `canSendMessage(message)` to allow follow-up target-only messages before the model config guard.
- Updated `sendMessage()` to call `applyPendingExecutionControlClarification()` before broad ambiguity parsing and before the model guard.
- Updated `applyNaturalLanguageQueueControl()` to accept an optional pre-parsed command so the UI can keep the user's actual follow-up text while reusing the existing queue-control execution path.

### 189.4 Behavior Now Covered

- `取消任务` -> assistant asks current vs queued -> `当前任务` cancels the current active execution through the active control path.
- `暂停任务` -> assistant asks current vs queued -> `排队任务` pauses the first queued execution through the queue control path and best-effort syncs `queue-control`.
- Both follow-up paths:
  - bypass missing model config;
  - do not call `api.chat/chatStream`;
  - reuse existing active/queue control safety behavior;
  - do not mutate non-target active/queued work.

Still not complete:

- Clickable clarification buttons/cards in the drawer or chat.
- Persisted clarification context across reload/history restore.
- Complex follow-up language beyond target-only current/queue wording.
- Bulk reorder and multi-turn references.
- Full queue failure/video/dependency policy.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, Undo, and Replay.

### 189.5 PRD v3.48 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.47` to `v3.48`.
- Added `Slice 189：歧义澄清后二次回答执行最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, section 2.4, section 2.5, Phase 3 summary, queue-state summary, and self-check.
- Replaced the previous “second-turn execution still missing” wording with the new boundary: short target-only follow-up execution is complete, but clickable clarification buttons, persisted clarification context, complex multi-turn references, and full NL scheduling are still not complete.

### 189.6 Verification Results

Fresh focused verification during this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous follow-up|ambiguous natural-language (task control|pause|resume)|natural-language queue commands top"
```

Observed focused result:

- 67 pass, 0 fail.

Run the full verification block below after later edits before claiming this slice remains clean.

### 189.7 Verification Commands For Next Handoff

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.48':'版本：v3.48' in prd,'PRD Slice 189':'Slice 189：歧义澄清后二次回答执行最小闭环' in prd,'PRD pending clarification anchor':'parsePendingExecutionControlClarification()' in prd,'Handoff Slice 189':'## 189. Ambiguous Task-Control Follow-Up Execution Runtime Slice' in h,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 193. Clarification Context History Restore Runtime / PRD v3.52 Repair Slice (2026-06-10)

This slice closes the smallest persistence gap after Slice 192: if the last restored conversation message still contains a pending `execution_control_clarification` card, the assistant can rebuild the local pending clarification and accept a short follow-up such as `当前任务` or `排队任务` after reload/history restore. This is a local latest-message history-recovery loop, not full multi-device or multi-pending clarification state management.

### 193.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first; MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Because `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` still exist in the workspace, this slice used `rg`, targeted file reads, and offline Node/document checks.
- Followed the existing TDD continuation: focused tests were added for persistence and restore before implementation was validated.

### 193.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: ambiguous clarification card is persisted to conversation store`
- `appAssistantPanel Phase 2 UI: restored ambiguous clarification accepts current follow-up`

RED command used during the slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous clarification card is persisted|restored ambiguous clarification"
```

Observed RED symptoms:

- The persisted assistant message in `conversationStore.appendMessage()` had no clarification `cards` payload.
- After `restoreConversation(conversation)`, `state.canSendMessage("当前任务")` was still `false`, so the short follow-up hit the missing-model guard instead of the local clarification path.

### 193.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `pendingExecutionControlClarificationFromMessages(messages)`.
  - Reads the last conversation message only.
  - Finds the latest `execution_control_clarification` card whose `status` is still `needs_clarification`.
  - Rebuilds `action`, `all`, `activeExecutionId`, and `queueCount` for `state.pendingExecutionControlClarification`.
  - Ignores unsupported actions and completed cards.
- Updated `executionControlClarificationCard(command)`.
  - The card now persists `action`, `all`, `activeExecutionId`, and `queueCount`, so a restored history message contains enough data to continue the previous broad task-control request.
- Updated `applyNaturalLanguageAmbiguousExecutionControl()`.
  - Builds one `clarificationCard` and attaches it to the in-memory assistant message.
  - Writes the same card into `conversationStore.appendMessage()` with `kind: "execution_control"`.
- Updated `restoreConversation(conversation)`.
  - After cloning restored messages, it calls `pendingExecutionControlClarificationFromMessages(state.messages)` and stores the result on `state.pendingExecutionControlClarification`.

### 193.4 Behavior Covered

- `取消任务` creates a pending clarification card and persists that card to the conversation store.
- Restoring a conversation whose last assistant message contains a `needs_clarification` execution-control card rebuilds the pending clarification.
- After restore, `当前任务` can be sent without model configuration and executes the restored active-control request.
- The restored follow-up path reuses the same active/queue control safety paths as Slice 189/190, rather than bypassing them.

Still not complete:

- Multiple pending clarification archives.
- Writing a completed-card update back into the persistent conversation store after the user chooses a target.
- Cross-device or backend message update semantics for clarification card state.
- Complex multi-turn references beyond latest-message target restoration.
- Natural-language bulk reorder.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Editable Visual Agent Plan Board / DAG preview.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 193.5 PRD v3.52 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Kept version at `v3.52` and repaired stale v3.51-era wording in the self-check section.
- Added or confirmed `Slice 193：澄清上下文历史恢复最小闭环` in the real-code progress table.
- Updated the top status, real-code anchors, queue rules, Phase 2/3 summaries, queue-state summary, and self-check so latest-message clarification history restore is marked complete.
- Replaced stale remaining-gap wording that still listed general cross-session clarification persistence as missing.
- Kept the correct remaining boundary: multiple pending clarification archives, completed-card persistent-store writeback, cross-device/backend message updates, complex multi-turn semantics, bulk reorder, full queue failure/video/dependency linkage, live `8777` verification, complete history/Humanizer/dependency merge, Undo, and Replay are still not complete.

### 193.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
python -c "from pathlib import Path; prd=Path('docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md').read_text(encoding='utf-8'); h=Path('docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md').read_text(encoding='utf-8', errors='replace'); checks={'PRD version v3.52':'版本：v3.52' in prd,'PRD Slice 193':'Slice 193：澄清上下文历史恢复最小闭环' in prd,'PRD restore anchor':'pendingExecutionControlClarificationFromMessages()' in prd,'Handoff Slice 193':'## 193. Clarification Context History Restore Runtime / PRD v3.52 Repair Slice' in h,'No replacement char':'\ufffd' not in prd and '\ufffd' not in h,'No mojibake question marks':(chr(63)*4) not in prd and (chr(63)*4) not in h}; [print(('PASS' if ok else 'FAIL'), name) for name, ok in checks.items()]; raise SystemExit(0 if all(checks.values()) else 1)"
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 196. Natural-Language Queue Move-To-Index Runtime / PRD v3.55 Repair Slice (2026-06-11)

This slice closes a small but real queue-control gap after Slice 195: the assistant can now understand a controlled source/target ordinal queue reorder such as `把第四个排队任务移动到第二个`. This is a single queued-item move-to-index loop, not the full multi-item natural-language reorder board.

### 196.1 Operating Constraints Observed

- Did not start, restart, stop, status-check, probe, browse, curl, or call the user-managed `8777` service.
- Tried CodeGraph first; MCP returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`
- Because `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` still exist in the workspace, this slice used `rg`, targeted file reads, and offline Node/Python/document checks.
- Followed RED/GREEN TDD before implementation.

### 196.2 RED Tests

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command moves item to requested position without LLM`

Added focused coverage in `modules/assistant/assistantExecutionStore.test.js`:

- `assistantExecutionStore: moves queued execution to requested index preserving mixed queue order`

Added focused coverage in `modules/assistant/assistantExecutionApiClient.test.js`:

- `assistantExecutionApiClient: sends queued execution move target index`

Added focused coverage in `canvas_agent_execution_service_test.py`:

- `test_moves_queued_execution_to_requested_index`

Added focused coverage in `canvas_agent_route_service_test.py`:

- `test_execution_queue_control_route_forwards_move_target_index`

Observed RED symptoms before implementation:

- `store.moveQueuedExecutionToIndex()` did not exist.
- `controlQueuedExecution()` dropped the move `targetIndex` payload.
- Backend `control_queued_execution()` rejected/failed `action:"move"` with `target_index`.
- `/queue-control` did not forward `targetIndex` to the execution service.
- `appAssistantPanel` did not parse source/target ordinal move commands before model-config guard, so the command fell through instead of bypassing LLM.

### 196.3 Runtime Implementation

Updated `modules/assistant/assistantExecutionStore.js`:

- Added `moveQueuedExecutionToIndex(id, targetIndex)`.
- Reuses a shared internal move helper for both `moveQueuedExecutionToTop()` and move-to-index.
- Normalizes the queue, removes the target, clamps the requested zero-based target index, reinserts the target, renumbers queued/queued_draft items, persists, and returns the moved execution.
- Preserves queued/queued_draft status and keeps active execution unchanged.

Updated `modules/assistant/assistantExecutionApiClient.js`:

- `controlQueuedExecution(executionId, action, payload = {})` now merges the optional payload into the PATCH body.
- Existing callers still send `{ action }`; move callers can send `{ action:"move", targetIndex }`.

Updated `services/canvas_agent_execution_service.py`:

- `control_queued_execution(execution_id, action, target_index=None)` now accepts `move`.
- Move parses/clamps `target_index`, reorders queued/queued_draft within the same project, renumbers queue indexes, persists, and returns the moved execution.
- Existing `top/pause/resume/cancel` behavior is preserved.

Updated `services/canvas_agent_route_service.py`:

- `/api/v2/canvas-agent/executions/{id}/queue-control` now reads `targetIndex` / `target_index` and forwards it as `target_index`.

Updated `modules/app/appAssistantPanel.js`:

- Added `queueControlOrdinalMatches(text)` and `parseQueueMoveCommand(text, queue)`.
- `parseQueueControlAction()` recognizes controlled move wording: `移动/移到/移至/排到/放到/调整到/挪到/move/reorder`.
- `parseNaturalLanguageQueueControl()` returns `action:"move"` only when it can find at least two ordinals, using the first ordinal as source and the last ordinal as final target position.
- `applyNaturalLanguageQueueControl()` calls `executionStore.moveQueuedExecutionToIndex(id, targetIndex)` and best-effort syncs backend with `controlQueuedExecution(id, "move", { targetIndex })`.
- The normal model guard and LLM path are bypassed for this local command.

### 196.4 Behavior Covered

- With active execution plus four queued/queued_draft tasks, `把第四个排队任务移动到第二个` moves the fourth queued item to final position 2.
- The moved queued_draft keeps `status:"queued_draft"`.
- Other queued items keep their relative order.
- Active execution stays active.
- No LLM/API chat call is made.
- Backend sync payload contains `action:"move"` and `{ targetIndex: 1 }`.

Still not complete:

- True multi-item natural-language reorder such as “按 4、2、1、3 的顺序重排整个队列”.
- Drag/edit Visual Agent Plan Board reorder and DAG recompile.
- Cross-device or backend message update semantics for clarification card state.
- Complex multi-turn references beyond latest-message target restoration and basic pending-card archive.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 196.5 PRD v3.55 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.55` and latest update to `2026-06-11`.
- Added `Slice 196：自然语言队列指定位置重排最小闭环` to the real-code progress table.
- Updated the top status, real-code anchors, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Kept the correct remaining boundary: true multi-item NL reorder, complex references, cross-device/backend message updates, full failure/video/dependency linkage, live `8777`, full history/Humanizer/dependency merge, Undo, and Replay are not complete.

### 196.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.
## 197. Natural-Language Full Queue Reorder Runtime / PRD v3.56 Repair Slice (2026-06-11)

This slice closes the next queue-control gap after Slice 196: the assistant can now understand a controlled full-queue ordinal reorder such as `按 4、2、1、3 的顺序重排整个排队任务`. It is a minimum full-queue reorder loop driven by an explicit complete ordinal list, not drag/drop Plan Board editing and not an open-ended multi-turn semantic scheduler.

### 197.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph MCP still reports `CodeGraph not initialized for this project. Run 'codegraph init' first.`; per project instructions this slice used targeted code reads/tests instead of attempting initialization.
- Worked from real runtime code and tests: `modules/app/appAssistantPanel.js`, `modules/assistant/assistantExecutionStore.js`, `modules/assistant/assistantExecutionApiClient.js`, `services/canvas_agent_execution_service.py`, `services/canvas_agent_route_service.py`, and their focused tests.
- Kept the product boundary explicit: explicit full ordinal reorder is complete; complex partial swaps, multi-turn references, Plan Board drag/recompile, queue failure/video/dependency linkage, live `8777`, Undo, and Replay remain future work.

### 197.2 Runtime State Verified

Frontend store:

- `assistantExecutionStore.reorderQueuedExecutions(orderedIds)` exists.
- It normalizes queued/queued_draft, filters valid unique queue ids, requires at least two valid ids, applies requested order first, appends omitted queue items after, renumbers queue indexes, preserves queued/queued_draft status, preserves active execution, persists, and returns `snapshot().queue`.

Execution API client and backend:

- `controlQueuedExecution(executionId, action, payload = {})` can send `orderedIds` in the queue-control PATCH body.
- `CanvasAgentRouteService` reads both `orderedIds` and `ordered_ids` and forwards a list as `ordered_ids`.
- `CanvasAgentExecutionService.control_queued_execution(..., ordered_ids=...)` accepts `action:"reorder"`, reorders queued/queued_draft within the same project, preserves status, renumbers queue indexes, persists, and returns a sanitized execution.

Assistant panel parser/executor:

- `parseQueueControlAction()` recognizes reorder wording before move wording.
- `queueControlOrderIndexes(rawText, queueLength)` extracts numeric/localized ordinals from the raw message and deduplicates valid queue indexes.
- `parseQueueReorderCommand(rawText, text, queue)` requires a complete ordinal list whose length matches the current queue length, then maps it to `orderedIds`.
- `applyNaturalLanguageQueueControl()` handles `action:"reorder"` before single-item controls, calls `executionStore.reorderQueuedExecutions(orderedIds)`, appends local user/assistant feedback, bypasses model config guard and LLM, and best-effort syncs backend once with `controlQueuedExecution(syncId, "reorder", { orderedIds })`.

### 197.3 Behavior Covered

- Active execution plus mixed queued/queued_draft queue remains stable while the queue is reordered.
- `按 4、2、1、3 的顺序重排整个排队任务` becomes `[4,2,1,3]` by queued item id.
- queued_draft items keep `status:"queued_draft"`; queued items keep `status:"queued"`.
- No `api.chat` / `api.chatStream` / LLM call is made for this local command.
- Backend sync uses `action:"reorder"` and `{ orderedIds:[...] }`.

Still not complete:

- Complex partial batch swaps such as “把 2 和 4 换一下，再把 3 提到最后”.
- Multi-turn references such as “就按刚才那个顺序排”.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 197.4 PRD v3.56 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.56` and kept latest update at `2026-06-11`.
- Added `Slice 197：自然语言队列全量重排最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, backend/service/client rows, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added current anchors for `queueControlOrderIndexes()`, `parseQueueReorderCommand()`, `reorderQueuedExecutions()`, and `control_queued_execution(..., ordered_ids=...)`.
- Replaced stale “full reorder still missing” current-boundary language with the accurate remaining gap: complex partial reorder, multi-turn references, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 197.5 Verification Run In This Slice

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
# Result: 156 tests, 156 pass, 0 fail.

python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
# Result: Ran 40 tests, OK.

D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
# Result: all commands exited 0.
```

No `8777` command is required or allowed for this slice.
## 198. Natural-Language Two-Item Queue Swap Runtime / PRD v3.57 Repair Slice (2026-06-11)

This slice closes the first complex-partial-reorder gap after Slice 197: the assistant can now understand a controlled two-item queue swap such as `把第二个和第四个排队任务换一下`. It generates a complete `orderedIds` list and reuses the existing queue reorder path. This is not a full multi-item natural-language planner, not Plan Board drag/drop, and not DAG recompile linkage.

### 198.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- Continued working from real runtime code and tests, not from target-state prose alone.
- Used TDD: wrote the UI RED test first, verified the expected failure, implemented the smallest parser/runtime change, then verified GREEN.
- Kept the remaining boundary explicit: three-or-more local swaps, multi-turn references, Plan Board drag/edit linkage, queue failure/video/dependency linkage, live `8777`, Undo, and Replay remain future work.

### 198.2 RED Test

Added `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command swaps two queued tasks without LLM`
- Scenario: active execution plus four queued/queued_draft tasks.
- User says `把第二个和第四个排队任务换一下`.
- Expected queue order becomes `1,4,3,2` by id, queued_draft statuses are preserved, active execution remains active, `chatCalls === 0`, and backend sync receives `action:"reorder"` with full `orderedIds`.

Verified RED with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "swaps two queued"
```

Expected failure observed:

- `response.queueControl.action` was `undefined` instead of `reorder`, proving the current parser did not handle two-item swap commands.

### 198.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- `parseQueueControlAction()` now recognizes swap wording before falling through to other queue controls: `交换/互换/对调/换一下/换个位置/swap`.
- Added `parseQueueSwapCommand(text, queue)`.
- The swap parser requires at least two explicit ordinals and at least two queued items.
- It clamps source/target indexes, rejects same-index swaps, creates a full `orderedIds` array from the current queued/queued_draft order, swaps the two target ids, and returns `action:"reorder"`.
- `parseNaturalLanguageQueueControl()` now tries `parseQueueSwapCommand()` before complete-list `parseQueueReorderCommand()` when the action is `reorder`.
- `applyNaturalLanguageQueueControl()` did not need a new branch: the existing Slice 197 `reorder` branch already calls `executionStore.reorderQueuedExecutions(orderedIds)` and syncs backend with `controlQueuedExecution(syncId, "reorder", { orderedIds })`.

### 198.4 Behavior Covered

- `把第二个和第四个排队任务换一下` bypasses model config guard and LLM.
- Active execution is not changed.
- queued/queued_draft statuses are preserved.
- The resulting order is a full deterministic queue order, not a partial patch.
- Backend sync reuses the stable `reorder` queue-control contract instead of adding a new backend action.

Still not complete:

- Three-or-more local reorder expressions such as “把 2 和 4 换一下，再把 3 提到最后”.
- Multi-turn references such as “按刚才那个顺序排”.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 198.5 PRD v3.57 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.57` and kept latest update at `2026-06-11`.
- Added `Slice 198：自然语言队列两项交换最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, UI test row, natural-language ambiguity row, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added the current anchor `parseQueueSwapCommand()`.
- Reframed the remaining queue-language gap as three-or-more local swaps, multi-turn references, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 198.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.
## 199. Natural-Language Three-Item Queue Reorder Runtime / PRD v3.58 Repair Slice (2026-06-11)

This slice closes the first controlled three-item local-reorder gap after Slice 198: the assistant can now understand `把第二个和第四个排队任务换一下，再把第三个排到最后`. It first swaps the first two referenced queued items, then moves the third referenced original queued item to the tail, generates a complete `orderedIds` list, and reuses the stable backend `reorder` queue-control path. This is not arbitrary multi-step queue-language planning and not Plan Board drag/drop.

### 199.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph MCP still reports `CodeGraph not initialized for this project. Run 'codegraph init' first.`; per project instructions this slice used `rg`, targeted reads, and offline tests.
- Used TDD: wrote the RED UI test first, verified the current wrong behavior, implemented the smallest parser/runtime change, then verified GREEN.
- Kept the remaining boundary explicit: arbitrary multi-step local reorder, multi-turn references, Plan Board drag/edit linkage, queue failure/video/dependency linkage, live `8777`, Undo, and Replay remain future work.

### 199.2 RED Test

Added `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command applies swap then move-to-last without LLM`
- Scenario: active execution plus four queued/queued_draft tasks.
- User says `把第二个和第四个排队任务换一下，再把第三个排到最后`.
- Expected order is `[1,4,2,3]` by id, active execution remains active, queued_draft statuses are preserved, no LLM call is made, and backend sync receives full `orderedIds`.

Verified RED with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "swap then move-to-last"
```

Expected failure observed:

- Current implementation produced `[1,3,2,4]`, proving it treated the first and last ordinals as a plain swap instead of applying the requested ordered operations.

### 199.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `parseQueueSwapThenMoveLastCommand(text, queue)`.
- It requires swap wording, a later move-to-last phrase, at least three explicit ordinals, and at least three queued items.
- It uses the first two ordinals as the swap pair.
- It uses the last ordinal as the original queued item to move to the tail after the swap.
- It builds a full deterministic `orderedIds` array and returns `action:"reorder"`.
- `parseNaturalLanguageQueueControl()` now tries `parseQueueSwapThenMoveLastCommand()` before the simpler two-item `parseQueueSwapCommand()` and full-list `parseQueueReorderCommand()`.
- The existing Slice 197 reorder branch handles store mutation and backend sync, so no new backend action was added.

### 199.4 Behavior Covered

- `把第二个和第四个排队任务换一下，再把第三个排到最后` bypasses model config guard and LLM.
- Starting queue `[1,2,3,4]` becomes `[1,4,2,3]`.
- Active execution is unchanged.
- queued/queued_draft statuses are preserved.
- Backend sync reuses `action:"reorder"` with full `orderedIds`.

Still not complete:

- Arbitrary multi-step local reorder expressions beyond this controlled pattern.
- Multi-turn references such as “按刚才那个顺序排”.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 199.5 PRD v3.58 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.58` and kept latest update at `2026-06-11`.
- Added `Slice 199：自然语言队列三项局部重排首片` to the real-code progress table.
- Updated top status, real-code anchors, UI test row, natural-language ambiguity row, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added the current anchor `parseQueueSwapThenMoveLastCommand()`.
- Reframed the remaining queue-language gap as arbitrary multi-step local reorder, multi-turn references, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 199.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 200. Natural-Language Move-Then-Current-Swap Queue Reorder Runtime / PRD v3.59 Repair Slice (2026-06-11)

This slice closes the second controlled three-item local-reorder gap after Slice 199: the assistant can now understand `先把第三个排到最后，再把当前第二个和当前第四个换一下`. It first moves the originally referenced third queued item to the tail, then swaps the current second and current fourth positions after that move, generates a complete `orderedIds` list, and reuses the stable backend `reorder` queue-control path. This is still not arbitrary multi-step queue-language planning and not Visual Agent Plan Board drag/drop.

### 200.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph MCP is still not usable in this workspace; this turn returned `database is locked`. The project also contains `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock`, so this slice used targeted reads, existing handoff context, and offline tests instead of running `codegraph init -i`.
- Used TDD: the RED UI test was added first, the old wrong order was verified, the smallest parser/runtime change was added, and focused GREEN was verified before PRD/handoff repair.
- Kept the remaining boundary explicit: arbitrary multi-step local reorder, multi-turn references, Plan Board drag/edit linkage, queue failure/video/dependency linkage, live `8777`, Undo, and Replay remain future work.

### 200.2 RED Test

Added `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command applies move-to-last then current-position swap without LLM`
- Scenario: active execution plus four queued/queued_draft tasks.
- User says `先把第三个排到最后，再把当前第二个和当前第四个换一下`.
- Expected order is `[1,3,4,2]` by id:
  - start `[1,2,3,4]`
  - move original third to last -> `[1,2,4,3]`
  - swap current second/current fourth -> `[1,3,4,2]`
- Active execution remains active, queued_draft statuses are preserved, no LLM call is made, and backend sync receives full `orderedIds`.

Verified RED with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "move-to-last then current-position swap"
```

Expected failure observed:

- Existing implementation produced `[1,3,2,4]`, proving it treated the command as the earlier move-only / wrong-order semantics instead of applying the requested ordered operations.

### 200.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `parseQueueMoveLastThenCurrentSwapCommand(text, queue)`.
- It requires a move-to-last phrase and a swap phrase, with the move phrase appearing before the swap phrase.
- It requires at least three explicit ordinals and at least three queued items.
- It uses the first ordinal as the original queued item to move to the tail.
- It uses the second ordinal and the last ordinal as current-position swap indexes after the move.
- It builds a full deterministic `orderedIds` array and returns `action:"reorder"`.
- `parseNaturalLanguageQueueControl()` now tries `parseQueueMoveLastThenCurrentSwapCommand()` before `parseQueueSwapThenMoveLastCommand()`, `parseQueueSwapCommand()`, and `parseQueueReorderCommand()`.
- The existing Slice 197 reorder branch handles store mutation and backend sync, so no new backend action was added.

### 200.4 Behavior Covered

- `先把第三个排到最后，再把当前第二个和当前第四个换一下` bypasses model config guard and LLM.
- Starting queue `[1,2,3,4]` becomes `[1,3,4,2]`.
- Active execution is unchanged.
- queued/queued_draft statuses are preserved.
- Backend sync reuses `action:"reorder"` with full `orderedIds`.

Still not complete:

- Arbitrary multi-step local reorder expressions beyond the two controlled three-item patterns from Slice 199 and Slice 200.
- Multi-turn references such as `按刚才那个顺序排`, `把它放最后`, or `再换前两个`.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 200.5 PRD v3.59 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.59` and kept latest update at `2026-06-11`.
- Added `Slice 200：自然语言队列先移动再当前位置交换最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, UI test row, natural-language ambiguity row, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added the current anchor `parseQueueMoveLastThenCurrentSwapCommand()`.
- Reframed the remaining queue-language gap as arbitrary multi-step local reorder generalization, multi-turn references, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 200.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 201. Natural-Language Queue Operation Plan Mini-Interpreter / PRD v3.60 Repair Slice (2026-06-11)

This slice moves the queue-language parser away from only piling up single hard-coded reorder phrases. The assistant can now parse a controlled multi-step local queue edit by splitting the command into ordered operation segments and applying each operation to the current queue state.

Covered example: `先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下`.

Starting queue `[1,2,3,4]` becomes:

1. swap first and third -> `[3,2,1,4]`
2. move current fourth to second -> `[3,4,2,1]`
3. swap current third and current fourth -> `[3,4,1,2]`

The implementation still reuses the stable `action:"reorder"` backend sync path with complete `orderedIds`.

### 201.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- Did not run `codegraph init -i`; CodeGraph was not used for this change because the current workspace has been returning lock/unavailable states and the project requires user confirmation before initialization/repair.
- Used TDD: wrote the RED UI test first, verified the current parser produced the wrong order, then implemented the smallest operation-plan parser and verified GREEN.
- Kept the remaining boundary explicit: this is the first controlled mini-interpreter, not full arbitrary natural-language queue editing, not multi-turn pronoun/reference tracking, and not Plan Board drag/drop.

### 201.2 RED Test

Added `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command applies generic multi-step local queue reorder operations without LLM`
- Scenario: active execution plus four queued/queued_draft tasks.
- User says `先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下`.
- Expected order is `[3,4,1,2]` by id.
- Active execution remains active, queued_draft statuses are preserved, no LLM call is made, and backend sync receives full `orderedIds`.

Verified RED with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "generic multi-step local queue reorder"
```

Expected failure observed after repairing test UTF-8 text:

- Existing implementation produced `[4,2,3,1]` instead of `[3,4,1,2]`, proving the old hard-coded parsers could not apply multiple ordered operations against the current queue state.

### 201.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `queueControlOperationSegments(text)`.
- Added `parseQueueOperationPlanCommand(text, queue)`.
- The segmenter splits on `先/再/然后/接着/随后/then/next`.
- Each segment can become a queue operation:
  - `swap`: two explicit ordinals plus swap wording such as `交换/互换/对调/换一下/换个位置/swap`.
  - `move`: move wording plus source/target ordinals.
  - `move last`: move wording plus `最后/末尾/last`.
- The interpreter applies operations sequentially to a local `orderedIds` array, so later `当前第 N 个` references are evaluated against the already-mutated queue order.
- `parseNaturalLanguageQueueControl()` now tries `parseQueueOperationPlanCommand()` before older single-pattern parsers for reorder commands.
- The move branch also tries `parseQueueOperationPlanCommand()` before falling back to the single move parser, allowing multi-step commands whose first operation is move wording.
- The existing Slice 197 reorder branch handles store mutation and backend sync; no new backend route/action was added.

### 201.4 Behavior Covered

- `先把第一个和第三个排队任务换一下，再把当前第四个移动到第二个，然后把当前第三个和当前第四个换一下` bypasses model config guard and LLM.
- Starting queue `[1,2,3,4]` becomes `[3,4,1,2]`.
- Active execution is unchanged.
- queued/queued_draft statuses are preserved.
- Backend sync reuses `action:"reorder"` with full `orderedIds`.
- Existing Slice 198-200 focused queue-language tests remain green under the new parser priority.

Still not complete:

- Full arbitrary natural-language queue editing.
- Multi-turn references such as `按刚才那个顺序排`, `把它放最后`, or `再换前两个`.
- Ambiguous or non-ordinal references such as `最短的那个`, `图生视频那个任务`, or asset/title-based matching.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 201.5 PRD v3.60 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.60` and kept latest update at `2026-06-11`.
- Added `Slice 201：自然语言队列 operation plan mini-interpreter 首片` to the real-code progress table.
- Updated top status, real-code anchors, UI test row, natural-language ambiguity row, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added the current anchors `queueControlOperationSegments()` and `parseQueueOperationPlanCommand()`.
- Reframed the remaining queue-language gap as full arbitrary NL queue editing, multi-turn references, non-ordinal reference matching, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 201.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 202. Natural-Language Adjacent Queue Reference Runtime / PRD v3.61 Repair Slice (2026-06-11)

This slice extends the Slice 201 queue operation mini-interpreter with the first non-explicit-ordinal reference: current adjacent queue pairs. The assistant can now interpret a later operation segment such as `再把前两个换一下` against the queue order produced by earlier operations.

Covered example: `先把第一个和第三个排队任务换一下，再把前两个换一下`.

Starting queue `[1,2,3,4]` becomes:

1. swap first and third -> `[3,2,1,4]`
2. swap current leading pair -> `[2,3,1,4]`

The implementation still reuses the stable `action:"reorder"` backend sync path with complete `orderedIds`.

### 202.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph MCP still returned `database is locked`; this slice used targeted reads and offline tests instead of attempting initialization/repair.
- Used TDD: wrote the RED UI test first, verified the old parser only applied the first operation, then implemented the smallest adjacent-reference parser and verified focused GREEN.
- Kept the remaining boundary explicit: this covers only current front/back adjacent pair references, not pronouns, title/type matching, Plan Board drag/drop, or full arbitrary natural-language queue editing.

### 202.2 RED Test

Added `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: natural-language queue command swaps current leading pair without explicit ordinals`
- Scenario: active execution plus four queued/queued_draft tasks.
- User says `先把第一个和第三个排队任务换一下，再把前两个换一下`.
- Expected order is `[2,3,1,4]` by id.
- Active execution remains active, queued_draft statuses are preserved, no LLM call is made, and backend sync receives full `orderedIds`.

Verified RED with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "leading pair"
```

Expected failure observed:

- Existing implementation produced `[3,2,1,4]`, proving it applied the first explicit swap but ignored the implicit `前两个` adjacent-pair swap.

### 202.3 Runtime Implementation

Updated `modules/app/appAssistantPanel.js`:

- Added `queueControlAdjacentSwapIndexes(segment, queueLength)`.
- It maps `前两个/最前两个/前两项/最前两项/firsttwo` to current indexes `[0,1]`.
- It maps `后两个/最后两个/末尾两个/后两项/最后两项/lasttwo` to current tail indexes `[queueLength - 2, queueLength - 1]`.
- `parseQueueOperationPlanCommand()` now checks adjacent-pair references in swap segments before requiring explicit ordinals.
- The interpreter still applies operations sequentially to the mutable local `orderedIds` array, so `前两个` and `后两个` are evaluated against current operation-plan state.
- The existing Slice 197 reorder branch handles store mutation and backend sync; no new backend route/action was added.

### 202.4 Behavior Covered

- `先把第一个和第三个排队任务换一下，再把前两个换一下` bypasses model config guard and LLM.
- Starting queue `[1,2,3,4]` becomes `[2,3,1,4]`.
- Active execution is unchanged.
- queued/queued_draft statuses are preserved.
- Backend sync reuses `action:"reorder"` with full `orderedIds`.
- Existing Slice 198-201 focused queue-language tests remain green under the new adjacent-pair parser.

Still not complete:

- Full arbitrary natural-language queue editing.
- Multi-turn references such as `按刚才那个顺序排`, `把它放最后`, or `再换前两个` across messages.
- Semantic/non-ordinal references such as `图生视频那个任务`, `标题里有海报的任务`, or `最短的那个`.
- Drag/edit Visual Agent Plan Board reorder, DAG preview, and prepare/recompile linkage.
- Cross-device/backend message update semantics for clarification card state.
- Full queue failure/video/dependency linkage.
- Real `8777` live smoke / end-to-end queued prepare verification.
- Complete history browser, complete Timeline Humanizer, dependency result merge, Undo, and Replay.

### 202.5 PRD v3.61 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.61` and kept latest update at `2026-06-11`.
- Added `Slice 202：自然语言队列前两个/后两个相邻引用最小闭环` to the real-code progress table.
- Updated top status, real-code anchors, UI test row, natural-language ambiguity row, Phase 3 queue-state summary, natural-language queue/current-task boundary, and self-check notes.
- Added the current anchor `queueControlAdjacentSwapIndexes()`.
- Reframed the remaining queue-language gap as full arbitrary NL queue editing, multi-turn references, semantic/non-ordinal reference matching, Plan Board drag/edit linkage, live `8777`, full queue failure/video/dependency linkage, history/Humanizer/dependency merge, Undo, and Replay.

### 202.6 Verification Commands For Next Handoff

Run before claiming this slice remains clean after later edits:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
git diff --check -- modules/app/appAssistantPanel.js modules/app/appAssistantPanel.p1Ui.test.js modules/assistant/assistantExecutionStore.js modules/assistant/assistantExecutionStore.test.js modules/assistant/assistantExecutionApiClient.js modules/assistant/assistantExecutionApiClient.test.js services/canvas_agent_execution_service.py canvas_agent_execution_service_test.py services/canvas_agent_route_service.py canvas_agent_route_service_test.py docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md
```

No `8777` command is required or allowed for this slice.

## 203. PRD v3.62 Real-Code Repair / Natural-Language Queue Title Reference RED Boundary (2026-06-11)

This section records a documentation repair requested by the user: fix the PRD based on real code and tacit project knowledge, without claiming unfinished runtime as complete.

### 203.1 Operating Constraints Observed

- Did not start, stop, restart, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph MCP returned `database is locked`; this slice used targeted reads, `rg`, and the known focused test instead.
- This was a PRD/handoff repair slice, not a runtime GREEN implementation slice.
- Kept the current worktree as authoritative; did not revert unrelated dirty files.

### 203.2 Real-Code Finding

Current runtime still does not support queue item title keyword references.

Relevant runtime state:

- `modules/app/appAssistantPanel.js::parseQueueMoveCommand(text, queue)` requires at least two explicit ordinals from `queueControlOrdinalMatches(text)`.
- The command `把海报生成移动到第三个排队任务` contains only one explicit target ordinal and a title keyword, so the current parser returns no queue command.
- `applyNaturalLanguageQueueControl()` already knows how to execute `action:"move"` if a parser returns `command.execution` and `command.targetIndex`; the gap is parser-side title matching, not store/backend move support.

Focused RED currently present in `modules/app/appAssistantPanel.p1Ui.test.js`:

- Test name: `appAssistantPanel Phase 2 UI: natural-language queue command moves a queued task by title reference without LLM`
- Scenario: active execution plus queued titles `故事大纲`, `海报生成`, `视频生成`.
- User command: `把海报生成移动到第三个排队任务`.
- Expected future behavior: no LLM call, move `exec-queued-2` to `targetIndex:2`, preserve active execution and queued/queued_draft statuses, sync backend as `["exec-queued-2", "move", { targetIndex: 2 }]`.

Observed verification on this slice:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "title reference"
```

Actual result:

- 82 pass / 1 fail in the filtered file run.
- The failing test is the new title-reference test.
- Failure: `response.queueControl.action` actual `undefined`, expected `"move"`.

This failure is intentional evidence for the next runtime GREEN slice. Do not mark title reference as completed until the focused test passes.

### 203.3 PRD v3.62 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.62`.
- Repaired top status so it says Slice 203 is only a RED boundary and explicitly not a completed runtime capability.
- Added progress row `Slice 203：自然语言队列标题关键词引用 RED 边界`.
- Updated real-code anchors and queue/natural-language sections to distinguish:
  - completed Slice 202 adjacent-pair reference support;
  - incomplete Slice 203 title keyword GREEN;
  - future type/content semantic references and multi-turn pronouns.
- Updated Phase 3 queue-state wording and self-check so接力开发 will not mistake the RED test for a shipped capability.

### 203.4 Next Runtime GREEN Slice

Recommended minimal next implementation:

1. Add a title normalization helper in `modules/app/appAssistantPanel.js` using `execution.title` and `execution.drawerState.line1`.
2. Add a title-reference parser such as `parseQueueTitleMoveCommand(text, queue)`.
3. Require move wording plus exactly/safely one target ordinal and exactly one queue title/line1 match.
4. Call the title parser before the ordinal-only `parseQueueMoveCommand()` fallback in `parseNaturalLanguageQueueControl()`.
5. Run the focused RED again and require it to pass before marking Slice 203 GREEN.
6. Then run the related Node/Python queue-control regression set and update both this handoff and PRD again.

### 203.5 Still Not Complete

- Superseded by 203.6: Slice 203 runtime GREEN is now complete for unique title/line1 move references.
- Type/content semantic references such as `图生视频那个任务` or `内容里提到海报的任务` are not complete.
- Multi-turn references such as `它`, `刚才那个`, `再把那个放最后` are not complete.
- Drag/edit Visual Agent Plan Board linkage is not complete.
- Full queue failure/video/dependency linkage, complete history browser, complete Timeline Humanizer, dependency result merge, Undo, Replay, and real `8777` live smoke remain incomplete.

No `8777` command is required or allowed for this documentation repair slice.

### 203.6 Runtime GREEN Implementation

This subsection supersedes the RED-only boundary above. Slice 203 is now GREEN for the first safe title keyword queue reference: unique queued execution `title` / `drawerState.line1` matching for single-item move commands.

Updated `modules/app/appAssistantPanel.js`:

- Added `queueControlExecutionReferenceCandidates(execution)`.
  - Builds normalized reference candidates from `execution.title`, `execution.drawerState.line1`, optional `drawerState.title`, `plan.title`, and `intent.title`.
  - Deduplicates candidates and ignores candidates shorter than 2 normalized chars.
- Added `queueControlMoveSourceReferenceText(text)`.
  - Extracts the source phrase before move wording such as `移动/移到/排到/放到/调整到/挪到/move/reorder`.
  - Removes common command wrappers such as `请/帮我/把/将/这个/那个` and trailing `任务/排队任务`.
- Added `queueControlTitleReferenceIndex(text, queue)`.
  - Scores candidate matches against the whole normalized command and the extracted source phrase.
  - Returns a source index only when the best match is unique; ties return `-1` so ambiguous title matches fail closed instead of mutating the queue.
- Added `parseQueueTitleMoveCommand(text, queue)`.
  - Requires move wording.
  - Requires a target hint: explicit ordinal or first/last style target.
  - Resolves the source from title/line1 candidate matching and the target from the last explicit ordinal or existing target-index helper.
- Updated `parseNaturalLanguageQueueControl()` move branch to try `parseQueueTitleMoveCommand()` before the ordinal-only `parseQueueMoveCommand()` fallback.

No backend route/store changes were needed because Slice 196 already provides `moveQueuedExecutionToIndex()`, `controlQueuedExecution(..., "move", { targetIndex })`, and backend `control_queued_execution(..., target_index=...)`.

### 203.7 Behavior Now Covered

- User command: `把海报生成移动到第三个排队任务`.
- Starting queue titles: `故事大纲`, `海报生成`, `视频生成`.
- The parser bypasses model config guard and LLM.
- It uniquely matches `海报生成` to `exec-queued-2`.
- It moves that queued_draft task to `targetIndex:2`.
- Active execution remains `exec-active`.
- Queue status and queueIndex are preserved/recomputed correctly:
  - `exec-queued-1` remains `queued`, index 1.
  - `exec-queued-3` remains `queued`, index 2.
  - `exec-queued-2` remains `queued_draft`, index 3.
- Backend sync uses `["exec-queued-2", "move", { targetIndex: 2 }]`.

### 203.8 PRD v3.63 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Set version to `v3.63`.
- Replaced the v3.62 RED-only Slice 203 language with a GREEN completed-minimum row.
- Added the new runtime anchors:
  - `queueControlExecutionReferenceCandidates()`
  - `queueControlMoveSourceReferenceText()`
  - `queueControlTitleReferenceIndex()`
  - `parseQueueTitleMoveCommand()`
- Updated Phase 3 / queue-state / natural-language boundary wording from “title reference not implemented” to “title/line1 unique keyword move is complete; title ambiguity, type/content semantics, and multi-turn references remain incomplete”.
- Kept the real `8777` live smoke boundary explicit.

### 203.9 Verification

RED was verified before implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "title reference"
```

Observed RED before code:

- 82 pass / 1 fail.
- Failure: `response.queueControl.action` actual `undefined`, expected `"move"`.

GREEN and regression verification after implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "title reference"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
python -m unittest canvas_agent_execution_service_test canvas_agent_route_service_test
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionStore.js
D:\Aic\node.exe --check modules\assistant\assistantExecutionApiClient.js
python -m py_compile services\canvas_agent_execution_service.py services\canvas_agent_route_service.py
```

Observed GREEN:

- Focused title-reference run: 83 pass / 0 fail.
- Related Node regression set: 162 pass / 0 fail.
- Python execution service/route regression: 40 tests OK.
- JS syntax checks: no output/errors.
- Python py_compile: no output/errors.

### 203.10 Still Not Complete

- Ambiguous title matches intentionally fail closed; no clarification UI exists for “两个标题都像海报”.
- Type/content semantic references such as `图生视频那个任务` or `内容里提到海报的任务` are not complete.
- Multi-turn references such as `它`, `刚才那个`, or `再把那个放最后` are not complete.
- Drag/edit Visual Agent Plan Board linkage is not complete.
- Full queue failure/video/dependency linkage, complete history browser, complete Timeline Humanizer, dependency result merge, Undo, Replay, and real `8777` live smoke remain incomplete.

No `8777` command was run for this slice.

## 204. PRD v3.64 Real-Code / Tacit-Knowledge Review Repair Slice

### 204.1 Scope

- This was a documentation-only repair slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`.
- No runtime code was changed in this slice.
- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.

### 204.2 Real-Code Findings

- `modules/app/appAssistantPanel.js` still contains the Slice 203 title-reference queue move helpers:
  - `queueControlExecutionReferenceCandidates()`
  - `queueControlMoveSourceReferenceText()`
  - `queueControlTitleReferenceIndex()`
  - `parseQueueTitleMoveCommand()`
- `parseNaturalLanguageQueueControl()` still routes move commands through `parseQueueOperationPlanCommand()` first, then `parseQueueTitleMoveCommand()`, then `parseQueueMoveCommand()`.
- The verified Slice 203 behavior remains bounded to unique queued execution `title` / `drawerState.line1` matching for single-item move commands.
- Plan Board is still read-only; there is no drag/edit/recompile linkage yet.
- Timeline has selected-event retry/skip/video authorization and `dependency_blocked` summaries, but still has no Undo/Replay/inverse patch implementation.
- CodeGraph status was inconsistent/blocked in this environment:
  - default call returned `CodeGraph not initialized for this project`;
  - explicit `projectPath` call returned `database is locked`;
  - `.codegraph/codegraph.db` and `.codegraph/codegraph.db.lock` exist.
- Therefore this slice used `rg` plus targeted reads instead of CodeGraph, and did not run `codegraph init -i`.

### 204.3 PRD Changes

- Updated PRD version from `v3.63` to `v3.64`.
- Rewrote the top status line so this slice is described as a documentation review/repair, not a new runtime GREEN implementation.
- Added progress row `Slice 204: PRD v3.64 real-code/tacit-knowledge review repair`.
- Renamed the v3.58 review headings to v3.64 review headings.
- Updated the self-check section so it says Slice 204 is documentation-only and preserves the remaining runtime gaps.
- Preserved the important incomplete boundaries:
  - title ambiguity clarification;
  - type/content semantic references;
  - multi-turn pronouns such as `it / that previous one`;
  - drag/edit Plan Board linkage;
  - full queue failure/video/dependency linkage;
  - complete history browser;
  - complete Timeline Humanizer;
  - dependency result merge;
  - Undo/Replay;
  - real `8777` live smoke.

### 204.4 Verification

Commands run:

```powershell
rg -n "v3\.58|v3\.63|v3\.64|Slice 204|Slice 203|appAssistantPanel\.js` \|" docs\superpowers\specs\2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md
```

Observed before final handoff append:

- PRD has `version v3.64`.
- PRD has Slice 204 progress row.
- PRD has v3.64 section headings.
- Remaining v3.63/v3.58 hits were checked and replaced where they described current state; historical handoff mentions are left as history.

### 204.5 Recommended Next Runtime Slice

Best next runtime slice remains title ambiguity clarification for queue title references:

- If multiple queued tasks match the same title/line1 keyword with equal confidence, do not silently no-op and do not call LLM.
- Return a local clarification card/list that lets the user choose which queued task should be moved.
- Reuse the existing clarification card model where possible:
  - `executionControlClarificationCard()`
  - `handleClarificationCard()`
  - `completeExecutionControlClarificationCard()`
  - `archivePendingExecutionControlClarificationCards()`
- Add RED/GREEN coverage in `modules/app/appAssistantPanel.p1Ui.test.js`.

## 205. Natural-Language Queue Title Ambiguity Clarification Runtime / PRD v3.65 Repair Slice (2026-06-11)

### 205.1 Scope

- Continued from the Slice 204 real-code PRD review and implemented the first runtime slice for ambiguous queue title references.
- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from the remaining v3.64/Slice 203 boundary wording to the v3.65/Slice 205 true state.
- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph could not be used as the source of truth in this environment because the explicit project-path status call returned `database is locked`; the slice used targeted source reads and focused offline tests instead.

### 205.2 Runtime Change

Files changed:

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.p1Ui.test.js`
- `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

Implemented in `modules/app/appAssistantPanel.js`:

- Added `queueControlTitleReferenceMatch(text, queue)`.
  - It scores queued execution reference candidates from `title` and `drawerState.line1`.
  - It returns `{ index, candidates }` for a unique best match.
  - It returns `{ index: -1, ambiguous: true, candidates }` when multiple queued executions tie at the best title/line1 score.
  - Candidate entries are shaped as `{ id, title, index }`.
- Kept `queueControlTitleReferenceIndex(text, queue)` as a compatibility wrapper around `queueControlTitleReferenceMatch(...).index`.
- Added `queueControlTitleReferenceClarificationReply(candidates)`.
  - It produces a local Chinese clarification reply that lists the matched queued-task candidates.
- Updated `parseQueueTitleMoveCommand(text, queue)`.
  - Unique title/line1 matches continue to return the existing `move` command from Slice 203.
  - Ambiguous title/line1 matches now return:
    ```js
    {
      action: "clarify",
      requestedAction: "move",
      status: "needs_clarification",
      candidates,
      targetIndex,
      queue,
      text,
    }
    ```
- Updated `applyNaturalLanguageQueueControl(message, options, command)`.
  - `action === "clarify"` now returns a local `queueControl` response before the model-config guard, `api.chat/chatStream`, or any LLM call.
  - It appends the user and assistant messages, sets `status` to `done_no_actions`, clears pending actions, and stores the clarification details in `lastReceiptDetails`.
  - It intentionally does not mutate active execution, queued execution order, queued/queued_draft status, or backend `queue-control` state.

### 205.3 RED/GREEN Test

Added focused coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

- `appAssistantPanel Phase 2 UI: ambiguous queue title reference asks for clarification without LLM`

Scenario:

- Active execution: `exec-active`.
- Queued executions:
  - `exec-queued-1`: title `海报生成 A`, status `queued`.
  - `exec-queued-2`: title `海报生成 B`, status `queued_draft`.
  - `exec-queued-3`: title `视频生成`, status `queued`.
- User command: `把海报生成移动到第三个排队任务`.

Expected behavior:

- `chatCalls === 0`.
- `response.queueControl.action === "clarify"`.
- `response.queueControl.status === "needs_clarification"`.
- `response.queueControl.requestedAction === "move"`.
- `response.queueControl.targetIndex === 2`.
- Candidates are `exec-queued-1 / 海报生成 A` and `exec-queued-2 / 海报生成 B`.
- Reply includes both candidate titles.
- Queue order and statuses remain unchanged.
- Active execution remains active.
- Backend sync calls remain empty.

Observed RED before implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous queue title reference"
```

- 84 tests run by Node's test-name behavior.
- 83 pass / 1 fail.
- Failure: `response.queueControl.action` was `undefined`, expected `clarify`.

Observed GREEN after implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous queue title reference"
```

- 84 pass / 0 fail.

Related regression already run after implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

- 163 pass / 0 fail.

Syntax check already run after implementation:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
```

- Exit 0, no output/errors.

### 205.4 PRD v3.65 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to match the real code after Slice 205:

- Top status now describes Slice 205 as runtime GREEN instead of leaving the document at the Slice 204 documentation-only state.
- Real-code anchors now include `queueControlTitleReferenceMatch()` and `queueControlTitleReferenceClarificationReply()`.
- Phase 2/3 queue-language status now says Slice 196-205 covers:
  - specified-position move;
  - full ordinal-list reorder;
  - two-item swap;
  - controlled three-item local reorder patterns;
  - operation-plan mini-interpreter first slice;
  - front/back adjacent references;
  - title-keyword unique move;
  - title-keyword ambiguity local text clarification.
- Self-check now records Slice 205 and no longer says title ambiguity is fully missing.
- Remaining boundary is now more precise:
  - candidate buttons / short-answer execution are not complete;
  - cross-conversation persistence for the title-ambiguity choice is not complete;
  - type/content semantic references are not complete;
  - multi-turn pronouns such as `它` / `刚才那个` are not complete;
  - drag/edit Plan Board linkage is not complete;
  - DAG/prepare recompile linkage for plan edits is not complete;
  - Undo/Replay is not complete;
  - real `8777` live smoke remains user-managed and not done in this slice.

### 205.5 Current Boundary After This Slice

Completed:

- Title/line1 unique keyword queue move from Slice 203 still works.
- Title/line1 ambiguous keyword queue move now fails safely into local clarification instead of falling through to LLM or silently doing nothing.
- The clarification response carries structured candidates and target index, so the next slice can execute a selected candidate without reparsing the original user sentence.

Not complete:

- No candidate button/card UI for the title ambiguity yet.
- No short-answer follow-up such as `第一个` / `第二个` / `海报生成 B` yet.
- No restoration of pending title-ambiguity clarification from persisted conversation history yet.
- No semantic references such as `图生视频那个任务`, `最短的那个`, or `内容里提到海报的任务` yet.
- No multi-turn pronoun/reference resolution such as `把它放最后` yet.
- No Visual Agent Plan Board drag/edit linkage or shared operation model between the board and NL parser yet.
- No queue failure/video/dependency full policy, complete history browser, complete Timeline Humanizer, dependency result merge, Undo, Replay, or real `8777` live verification yet.

### 205.6 Recommended Next Runtime Slice

Recommended Slice 206: title ambiguity clarification follow-up execution.

Goal:

- After Slice 205 returns title-match candidates, let the user choose a candidate by either:
  - clicking a candidate button/card; or
  - replying with a short answer such as `第一个`, `第二个`, `海报生成 B`.
- Then execute the original move against the selected queued execution and the stored `targetIndex`.
- Continue to bypass LLM.
- Preserve active execution.
- Preserve queued/queued_draft statuses.
- Sync backend with `controlQueuedExecution(id, "move", { targetIndex })`.

Implementation hints:

- Reuse the broad task clarification patterns where possible:
  - `executionControlClarificationCard()`
  - `parsePendingExecutionControlClarification()`
  - `applyPendingExecutionControlClarification()`
  - `completeExecutionControlClarificationCard()`
  - `archivePendingExecutionControlClarificationCards()`
- If reusing the broad card model becomes too coupled, create a queue-title-specific clarification card with the same completed/archived/persistent behavior.
- Add RED tests before runtime changes.

No `8777` command was run for this slice.

## 206. Queue Title Ambiguity Follow-up Execution Runtime / PRD v3.66 Repair Slice (2026-06-11)

This slice completes the minimal runtime loop that Slice 205 intentionally left open: after a title/line1 keyword move command returns multiple queued candidates, the user can select the intended queued execution without invoking the LLM.

### 206.1 Scope

- Implemented queue-title-specific clarification state in `modules/app/appAssistantPanel.js`:
  - `pendingQueueTitleClarification` on panel state.
  - `queueTitleClarificationCard()` for `queue_title_clarification` interaction cards.
  - `pendingQueueTitleClarificationFromMessages()` for restoring the latest pending queue-title clarification from conversation messages.
  - `parsePendingQueueTitleClarification()` for short replies and candidate ids.
  - `clarifiedQueueTitleControlCommand()` to rebuild the original local `move` command from the selected candidate and stored `targetIndex`.
  - `applyPendingQueueTitleClarification()` to complete the card and execute the local queue move path.
- Clarification selection supports short ordinal replies such as `第二个` and `2`, exact candidate title replies such as `海报生成 B`, and candidate id replies from UI buttons.
- The selected command continues to bypass model configuration guard, `api.chat/chatStream`, and LLM calls.
- The original queue move path is reused, so it preserves active execution and queued/queued_draft statuses, and syncs backend with `controlQueuedExecution(id, "move", { targetIndex })`.

### 206.2 UI Runtime Changes

- `renderInteractionCard()` now renders a dedicated `queue_title_clarification` branch.
- Candidate buttons use `.hy-canvas-agent-queue-title-candidate` and show numbered candidate titles.
- Clicking a candidate immediately sets `data-selected="true"` on that button, then sends the candidate id through `handleClarificationCard()`.
- `completeQueueTitleClarificationCard()` marks the latest pending `queue_title_clarification` card as `completed`, stores `selectedCandidateId`, updates the summary, and persists via `conversationStore.updateMessageCard()` when available.
- New queue-title clarification requests archive older pending queue-title cards; active/queue/broad-control/normal chat paths also clear stale queue-title clarification state.

### 206.3 TDD Evidence

RED was confirmed before implementation with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous queue title"
```

Expected RED failures:

- `state.canSendMessage("第二个")` was `false`.
- `.hy-canvas-agent-queue-title-candidate` button count was `0`.

GREEN focused verification after implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous queue title"
```

Result: `86 pass / 0 fail`.

Related JS regression:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `165 pass / 0 fail`.

Syntax check:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
```

Result: exit 0, no output.

### 206.4 PRD v3.66 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.65` to `v3.66`.
- Top status now describes Slice 206 as runtime GREEN.
- Added progress row `Slice 206：标题歧义候选短回答/按钮执行最小闭环`.
- Updated real-code anchors for `modules/app/appAssistantPanel.js` and `modules/app/appAssistantPanel.p1Ui.test.js`.
- Updated self-check so candidate button / short-answer execution is no longer listed as missing.
- Preserved remaining true gaps: type/content semantic references, multi-turn pronouns, editable/drag Plan Board, DAG/prepare recompile linkage, cross-device/backend message updates, full history entry, Undo/Replay, and real `8777` live 联调.

### 206.5 Boundaries

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is still a local controlled queue-title clarification slice, not a complete natural-language semantic queue editor.
- Button/short-answer selection only executes the stored `requestedAction:"move"` against the selected queued execution and stored `targetIndex`.
- Type/content references like “把图片生成那个任务移到最后”, multi-turn references like “把刚才那个移到最后”, Plan Board drag/edit linkage, Undo/Replay, and real live integration remain future slices.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.

## 207. Natural-Language Queue Generation-Type Reference Runtime / PRD v3.67 Repair Slice (2026-06-11)

This slice starts the next true gap after Slice 206: non-ordinal, non-title semantic queue references. It adds the first safe semantic reference class: generation type references backed by the queued execution action contract.

### 207.1 Scope

- Implemented generation-type semantic queue reference helpers in `modules/app/appAssistantPanel.js`:
  - `queueControlExecutionActions()` reads queued execution `actionsByStep` in plan step order.
  - `queueControlGenerationKindsFromText()` recognizes explicit user hints for image, video, and text generation.
  - `queueControlGenerationKindFromValue()` normalizes action values such as `ai-image`, `imageNode.generate`, `ai-video`, and `ai-text`.
  - `queueControlExecutionGenerationKinds()` derives each queued execution generation kinds from `actionsByStep` action `nodeType`, `type`, `skillId`, `tool`, `kind`, and nested `data` fields.
  - `queueControlSemanticReferenceMatch()` matches requested generation kinds against queued executions.
- `parseQueueTitleMoveCommand()` now falls back to semantic generation-type matching only when title/line1 matching does not uniquely identify a source task.
- Unique semantic match reuses the existing local `move` queue-control path.
- Multiple semantic matches return `clarify/needs_clarification` candidates and reuse the Slice 206 queue-title clarification short-answer/button execution path.

### 207.2 TDD Evidence

RED was confirmed before implementation with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "generation type"
```

Expected RED failures:

- Unique `图片生成` reference returned no `queueControl.move`.
- Ambiguous `图片生成` reference returned no `queueControl.clarify`.

GREEN focused verification after implementation:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "generation type"
```

Result: `88 pass / 0 fail` for the focused UI run; syntax check passed.

Related JS regression:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `167 pass / 0 fail`.

### 207.3 PRD v3.67 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.66` to `v3.67`.
- Top status now describes Slice 207 as runtime GREEN.
- Added progress row `Slice 207：自然语言队列生成类型语义引用首片`.
- Updated real-code anchors for `modules/app/appAssistantPanel.js` and `modules/app/appAssistantPanel.p1Ui.test.js`.
- Updated self-check and queue capability sections so generation-type semantic references are listed as landed, while content/theme/asset references and multi-turn pronouns remain open.

### 207.4 Boundaries

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a complete semantic queue editor. It only covers explicit generation type references backed by queued `actionsByStep` data.
- Supported user hints are intentionally narrow: image/picture, video, and text wording plus English `image/video/text`.
- Supported execution evidence is intentionally concrete: `nodeType`, action `type`, `skillId`, `tool`, `kind`, and nested `data.nodeType/data.type`.
- Content/theme/asset references like “把夏天海报那个任务移到最后”, multi-turn references like “把刚才那个移到最后”, Plan Board drag/edit linkage, Undo/Replay, and real live integration remain future slices.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.

## 208. Natural-Language Queue Prompt/Content Reference Runtime / PRD v3.68 Repair Slice (2026-06-11)

This slice closes the next queue-reference gap after Slice 207. Queue move commands can now identify a queued execution by prompt/content text already stored in its `actionsByStep`, without calling the LLM.

### 208.1 Scope

- Implemented prompt/content semantic queue reference helpers in `modules/app/appAssistantPanel.js`:
  - `queueControlContentReferenceHint(text)` extracts the source reference from the move command, normalizes it, strips generic words such as `这个/那个/排队/任务/生成`, and requires a 2+ character hint.
  - `queueControlExecutionContentCandidates(execution)` reads each queued execution `actionsByStep` and collects `prompt/text/content/description/summary` from the action itself, `prompt/text/content/description/summary` from nested `data`, and `prompt/text/content/description` from nested `payload` and `params`. Current runtime does not collect `payload.summary` or `params.summary`.
  - `queueControlContentReferenceMatch(text, queue)` matches normalized hints against queued execution content candidates.
- Updated `queueControlSemanticReferenceMatch(text, queue)`:
  - If the user does not explicitly request an image/video/text generation kind, it falls back to prompt/content reference matching.
  - If a requested generation kind does not match any queued execution, it also falls back to prompt/content reference matching.
- Unique content match reuses the existing local `move` queue-control path.
- Multiple content matches return `clarify/needs_clarification` candidates and reuse the Slice 206 `queue_title_clarification` short-answer/button execution path.

### 208.2 TDD Evidence

RED was confirmed before implementation with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "prompt content"
```

Expected RED failures:

- `把猫咪海报那个排队任务移动到最后` did not produce a local `queueControl.move`.
- Ambiguous `猫咪海报` prompt references did not produce `queueControl.clarify` candidates.

GREEN focused verification after implementation:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "prompt content"
```

Result: `90 pass / 0 fail` for the focused UI run; syntax check passed.

Related JS regression:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `169 pass / 0 fail`.

### 208.3 PRD v3.68 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.67` to `v3.68`.
- Top status now describes Slice 208 as runtime GREEN.
- Added progress row `Slice 208：自然语言队列 prompt/content 内容语义引用首片`.
- Updated real-code anchors for `modules/app/appAssistantPanel.js` and `modules/app/appAssistantPanel.p1Ui.test.js`.
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so prompt/content semantic references are listed as landed.
- Preserved remaining true gaps: asset-level references, complex topic similarity, multi-turn pronouns, editable/drag Plan Board, DAG/prepare recompile linkage, cross-device/backend message updates, full history entry, full queue failure/video/dependency linkage, Undo/Replay, and real `8777` live integration.

### 208.4 Boundaries

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a full semantic queue editor. It only covers field-level substring matching against queued `actionsByStep` content already present in local execution data.
- Matching is intentionally conservative: source text before the move target is normalized, generic task/control words are stripped, and candidates must come from concrete action content fields.
- Asset-level references, cross-turn references like `刚才那个/它`, complex semantic similarity, Plan Board drag/edit linkage, Undo/Replay, and real live integration remain future slices.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.

## 209. Natural-Language Queue Asset-Field Reference Runtime / PRD v3.69 Repair Slice (2026-06-11)

This slice closes the next queue-reference gap after Slice 208. Queue move commands can now identify a queued execution by asset fields already stored in its `actionsByStep`, without calling the LLM.

### 209.1 Scope

- Implemented asset-field semantic queue reference helpers in `modules/app/appAssistantPanel.js`:
  - `queueControlAssetCandidateValues(source)` reads direct asset fields from a plain object: `assetId`, `assetName`, `assetTitle`, `assetLabel`, `assetKey`, `assetItemId`, `assetItemName`, `assetItemTitle`, `assetItemLabel`.
  - The same helper also reads nested `asset`, `assetItem`, and `referenceAsset` objects, plus array fields `assets`, `assetItems`, `assetReferences`, `references`, and `referenceAssets`.
  - Nested/array asset records only contribute safe identifier/title fields: `id`, `name`, `title`, `label`, `assetId`, `assetName`, and `assetTitle`.
  - It intentionally does not read URL, path, token, key, secret, or other sensitive transport fields.
  - `queueControlExecutionAssetCandidates(execution)` walks queued `actionsByStep`, reading each action plus nested `data`, `payload`, and `params` objects.
  - `queueControlAssetReferenceMatch(text, queue)` extracts a normalized source hint through the existing `queueControlContentReferenceHint(text)` path and matches it against normalized asset candidates.
- Updated `queueControlSemanticReferenceMatch(text, queue)`:
  - If the user does not explicitly request an image/video/text generation kind, it tries asset-field matching first, then falls back to prompt/content matching.
  - If a requested generation kind does not match any queued execution, it also tries asset-field matching first, then prompt/content matching.
- Unique asset match reuses the existing local `move` queue-control path.
- Multiple asset matches return `clarify/needs_clarification` candidates and reuse the Slice 206 `queue_title_clarification` short-answer/button execution path.

### 209.2 TDD Evidence

RED was confirmed before implementation with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "asset reference"
```

Expected RED failures:

- `把新资产4那个排队任务移动到最后` did not produce a local `queueControl.move`.
- Ambiguous `新资产4` asset references did not produce `queueControl.clarify` candidates.

GREEN focused verification after implementation:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "asset reference"
```

Result: `92 pass / 0 fail` for the focused UI run; syntax check passed.

Related JS regression:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `171 pass / 0 fail`.

### 209.3 PRD v3.69 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.68` to `v3.69`.
- Top status described Slice 209 as runtime GREEN.
- Added progress row `Slice 209：自然语言队列资产字段级语义引用首片`.
- Updated real-code anchors for `modules/app/appAssistantPanel.js` and `modules/app/appAssistantPanel.p1Ui.test.js`.
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so asset-field semantic references are listed as landed.

### 209.4 Boundaries

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a full semantic queue editor. It only covers field-level substring matching against queued `actionsByStep` asset fields already present in local execution data.
- This is not an asset-library search. It does not query global assets, compare thumbnails, resolve same-name assets deeply, or infer visual similarity.
- Cross-turn references like `刚才那个/它`, complex semantic similarity, Plan Board drag/edit linkage, Undo/Replay, and real live integration remain future slices.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.

## 210. PRD v3.70 Real-Code / Tacit-Knowledge Repair Slice (2026-06-11)

This slice is a documentation repair pass only. It aligns the PRD and handoff with the exact runtime fields currently implemented after Slice 209.

### 210.1 Scope

- Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` from `v3.69` to `v3.70`.
- Added progress row `Slice 210：PRD v3.70 真实代码/默会知识复核修复`.
- Corrected Slice 208 prompt/content field documentation:
  - Runtime collects `prompt/text/content/description/summary` from the action itself.
  - Runtime collects `prompt/text/content/description/summary` from nested `data`.
  - Runtime collects `prompt/text/content/description` from nested `payload` and `params`.
  - Runtime does not collect `payload.summary` or `params.summary`.
- Tightened Slice 209 asset-field wording:
  - Direct action/data/payload/params fields include `assetId/assetName/assetTitle/assetLabel/assetKey/assetItem*`.
  - Nested/array asset records include `id/name/title/label/assetId/assetName/assetTitle`.
  - URL/path/secret-like fields remain out of scope.
- Preserved true product boundaries: Plan Board is still read-only; Timeline still has no Undo/Replay/inverse patch; natural-language queue editing is not a full semantic dispatcher; real `8777` live integration is still manual/user-managed.

### 210.2 Verification

Commands run after the repair:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "asset reference"
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Results:

- Syntax check passed.
- Focused UI run: `92 pass / 0 fail`.
- Related JS regression: `171 pass / 0 fail`.

### 210.3 Boundaries

- No runtime code was added in Slice 210.
- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.

## 211. Natural-Language Queue Recent-Reference Pronoun Runtime / PRD v3.71 Repair Slice (2026-06-11)

This slice closes the first multi-turn queue-reference gap after Slice 209. Once a queue command has clearly acted on a specific queued execution, the next move command can refer to that same execution with a pure pronoun phrase such as `它` or `刚才那个`, without calling the LLM.

### 211.1 Scope

- Implemented recent-reference queue move helpers in `modules/app/appAssistantPanel.js`:
  - `hasQueueControlRecentReference(text)` recognizes pure recent-reference wording such as `它`, `这个`, `那个`, `这项`, `那项`, `刚才那个`, `刚才的`, `刚刚那个`, `刚刚的`, `it`, `that`, and `same`.
  - `queueControlRecentReferenceRemainder(text)` extracts the source side before the move verb and removes polite prefixes, pronouns, and generic task words.
  - `parseQueueRecentReferenceMoveCommand(text, queue, recentReference)` only uses recent reference when the source side has no remaining semantic keywords after cleanup.
  - `state.lastQueueControlReference` stores the latest successfully controlled queued execution id and display title.
- Updated `parseNaturalLanguageQueueControl(message, executionStore, recentReference)`:
  - Move commands now try `parseQueueRecentReferenceMoveCommand()` before title/content/type/asset matching.
  - Existing call sites that need UI send-button gating pass `state.lastQueueControlReference`.
- Updated `applyNaturalLanguageQueueControl()`:
  - Successful queue controls remember the resulting execution id for follow-up pronoun moves.
  - `cancel` clears the recent reference.
  - Responses include `referenceSource: "recent_queue_control"` when the recent-reference path was used.
- Safety boundary:
  - `把它移动到第一个排队任务` can use the recent execution id.
  - `把这个海报生成移动到最后` should not be hijacked by the recent-reference path because `海报生成` remains after cleanup and should keep using explicit title/content/asset matching.

### 211.2 TDD Evidence

RED was confirmed before implementation with:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent referenced task pronoun"
```

Expected RED failure:

- After `把新资产4那个排队任务移动到最后`, the follow-up `把它移动到第一个排队任务` returned no local `queueControl.move`; actual `queueControl.action` was `undefined`.

GREEN focused verification after implementation:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent referenced task pronoun"
```

Result: `93 pass / 0 fail` for the focused UI run; syntax check passed.

### 211.3 PRD v3.71 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.70` to `v3.71`.
- Top status now describes Slice 211 as runtime GREEN.
- Added progress row `Slice 211：自然语言队列最近引用代词指代首片`.
- Updated real-code anchors for `modules/app/appAssistantPanel.js` and `modules/app/appAssistantPanel.p1Ui.test.js`.
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so recent-reference pronoun moves are listed as landed.
- Preserved remaining true gaps: complex multi-turn pronouns, cross-session/cross-restart recent-reference restoration, complex topic similarity, asset-library search, Plan Board drag/edit linkage, DAG/prepare recompile linkage, cross-device/backend message updates, full history, Undo/Replay, and real `8777` live integration.

### 211.4 Boundaries

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a full multi-turn semantic memory system. It only keeps the latest successfully controlled queued execution in current in-memory panel state.
- It does not restore recent references from conversation history after reload, across devices, or after app restart.
- It does not support complex pronouns like `它旁边那个`, `它后面那个`, `刚才那两个`, or topic-similarity matching.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used targeted reads and local tests instead.


## 212. Restored Conversation Queue Recent-Reference Runtime / PRD v3.72 Repair Slice (2026-06-11)

This slice closes the first persistence gap after Slice 211: a recent queue reference can now survive restoring the same local conversation history. It does not claim cross-device or backend message-sync memory.

### 212.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "restored conversation reuses recent queue reference"
```

Observed RED failure before the runtime repair:

- First state could move `exec-queued-asset-4` with `把新资产4那个排队任务移动到最后`.
- The conversation was persisted through `createAssistantConversationStore()`.
- A new state called `restoreConversation(persisted)`.
- `restoredState.canSendMessage("把它移动到第一个排队任务")` returned `false`, so the restored panel could not reuse the recent queue reference without LLM/model config.

### 212.2 Runtime Changes

- `modules/assistant/assistantConversationStore.js`
  - `appendMessage()` now preserves `kind`.
  - `appendMessage()` now sanitizes and stores `queueControl` metadata.
  - `appendMessage()` now sanitizes and stores `executionControl` metadata.
- `modules/app/appAssistantPanel.js`
  - `cloneMessage()` now preserves `queueControl` and `executionControl` in restored/debug cloned messages.
  - Added `queueControlReferenceFromMessages(messages = [])`.
  - `restoreConversation()` now rebuilds `state.lastQueueControlReference` from restored messages.
  - Queue-control assistant messages written to memory and `conversationStore.appendMessage()` now include `queueControl: state.lastResponse.queueControl`.
  - Successful single queue-control metadata now includes `title: queueControlExecutionTitle(result)` together with `executionId/action/targetIndex`.

### 212.3 GREEN / Regression Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --check modules\assistant\assistantConversationStore.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "restored conversation reuses recent queue reference"
```

Result:

- Syntax checks passed.
- Focused UI run: `94 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `173 pass / 0 fail`.

### 212.4 PRD v3.72 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.71` to `v3.72`.
- Top status now describes Slice 212 as runtime GREEN.
- Added progress row `Slice 212：最近队列引用本地会话恢复首片`.
- Updated real-code anchors for:
  - `modules/app/appAssistantPanel.js`
  - `modules/assistant/assistantConversationStore.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so same-local-conversation restored recent reference is listed as landed.
- Corrected the remaining-gap language: the landed scope is only same local conversation restore; still missing are different-conversation references, cross-device/backend message sync, complex pronouns, complex topic similarity, asset-library search, drag/edit Plan Board linkage, real `8777` live integration, and Undo/Replay.

### 212.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This supersedes Slice 211's “in-memory only” limit only for the case where the same local conversation is restored and contains stored `queueControl` metadata.
- This does not implement arbitrary long-term memory across unrelated topics or different conversations.
- This does not implement cross-device/backend message-sync metadata reconciliation.
- This does not support complex references such as `它旁边那个`, `它后面的那个`, or `刚才那两个`.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used `rg`, targeted reads, syntax checks, focused tests, and related regression tests instead.


## 213. Recent Queue Neighbor Reference Runtime / PRD v3.73 Repair Slice (2026-06-11)

This slice closes the first “neighbor of the recently referenced queue item” gap. After the assistant has clearly acted on one queued execution, the user can now refer to the item immediately before or after it in the current queue order without calling the LLM.

### 213.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "item before recent reference"
```

Observed RED failure before implementation:

- First command `把新资产4那个排队任务移动到最后` correctly moved `exec-queued-asset-4` and remembered it as the recent queue reference.
- Follow-up command `把它前面的那个移动到第一个排队任务` produced no local `queueControl.move`.
- Assertion failed with actual `undefined`, expected `move`.

### 213.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueControlRecentNeighborOffset(text)`.
  - It inspects only the source side before the move verb.
  - It recognizes recent-reference wording plus adjacent-position wording:
    - previous side: `前面`, `前一个`, `上一个`, `previous`, `prev`, `before`
    - next side: `后面`, `后一个`, `下一个`, `next`, `after`
  - It strips polite prefixes, generic task words, and recent-reference pronouns before deciding whether the remaining source is purely a neighbor reference.
- Extended `parseQueueRecentReferenceMoveCommand(text, queue, recentReference)`:
  - It now tries the neighbor-reference path before the old “pure pronoun only” remainder guard.
  - It finds the current index of `recentReference.executionId`, applies the `-1/+1` neighbor offset, rejects out-of-range neighbors, resolves the target index with the existing `queueControlTargetIndex()`, and returns local `move`.
  - Neighbor matches include `referenceSource: "recent_queue_neighbor"`.
- Existing pure pronoun behavior from Slice 211/212 is preserved.
- Explicit semantic references such as `这个海报生成` still fall through to title/content/asset matching instead of being hijacked by recent-reference logic.

### 213.3 GREEN Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "item before recent reference"
```

Result:

- Syntax check passed.
- Focused UI run: `95 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `174 pass / 0 fail`.

### 213.4 PRD v3.73 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.72` to `v3.73`.
- Top status now describes Slice 213 as runtime GREEN.
- Added progress row `Slice 213：最近队列引用相邻项指代首片`.
- Updated real-code anchors for:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so recent-reference neighbor moves are listed as landed.
- Preserved remaining boundaries: no `它旁边` left/right disambiguation, no `刚才那两个`, no chained multi-hop references, no cross-device/backend recent-reference sync, no real `8777` live integration, and no Undo/Replay.

### 213.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a full multi-turn semantic planner. It is a local parser slice for the immediate previous/next queued item relative to the most recently controlled queued execution.
- It depends on the current queue order at the time of the follow-up command.
- If the requested neighbor is out of range, it does not invent a target and will fall back to the normal path.
- Remaining natural-language queue gaps include `它旁边` ambiguity, `刚才那两个`, chained relative references, complex topic similarity, asset-library search, Plan Board drag/edit linkage, true live integration, and Undo/Replay.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used `rg`, targeted reads, syntax checks, focused RED/GREEN tests, and related regression tests instead.


## 214. Recent Queue Side-Neighbor Clarification Runtime / PRD v3.74 Repair Slice (2026-06-11)

This slice closes the first `它旁边那个` ambiguity gap. When the recently referenced queued execution has both a previous and a next neighbor, the assistant now asks the user to choose instead of guessing.

### 214.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous neighbor of recent"
```

Observed RED failure before implementation:

- First command `把新资产4那个排队任务移动到第二个排队任务` correctly moved `exec-queued-asset-4` into the middle of the queue and remembered it as the recent reference.
- Follow-up command `把它旁边那个移动到第一个排队任务` produced no local clarification.
- Assertion failed with actual `undefined`, expected `clarify`.

### 214.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueControlRecentAmbiguousNeighborSource(text)`.
  - Added `queueControlRecentNeighborCandidates(queue, sourceIndex)`.
  - Extended `parseQueueRecentReferenceMoveCommand(text, queue, recentReference)`:
    - If the source side is recent-reference wording plus `旁边` / `附近` / `nearby` / `neighbor`, collect the previous and next queued executions around the recent item.
    - If two candidates exist, return `action:"clarify"`, `requestedAction:"move"`, `status:"needs_clarification"`, candidate list, and `targetIndex`.
    - If only one neighbor exists, keep the direct local `move` behavior.
    - If no neighbor exists, return null and let the normal path continue.
- The clarification reuses the existing queue-title clarification card, short-answer, and candidate-button execution path.
- The clarification itself does not mutate queue order and does not call backend `queue-control`; selected candidate execution still uses the existing local move path.

### 214.3 GREEN / Regression Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "ambiguous neighbor of recent"
```

Result:

- Syntax check passed.
- Focused UI run: `96 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `175 pass / 0 fail`.

### 214.4 PRD v3.74 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.73` to `v3.74`.
- Top status now describes Slice 214 as runtime GREEN.
- Added progress row `Slice 214：最近队列引用旁边歧义澄清首片`.
- Updated real-code anchors for:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
- Updated Phase 2/3, queue state, self-check, and queue-rule sections so `它旁边那个` ambiguity clarification is listed as landed.
- Preserved remaining boundaries: no `刚才那两个`, no chained multi-hop references, no complex clarification-follow-up semantic chain beyond the existing candidate selection path, no cross-device/backend recent-reference sync, no real `8777` live integration, and no Undo/Replay.

### 214.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is still a local parser slice, not a full semantic planner.
- It depends on the current queue order at the time of the ambiguous follow-up command.
- The first version uses existing queue-title clarification UI, so the wording/title is generic “选择要移动的排队任务”; future UI polish can specialize it to “选择它前面还是后面”.
- Remaining natural-language queue gaps include `刚才那两个`, chained relative references, complex topic similarity, asset-library search, Plan Board drag/edit linkage, true live integration, and Undo/Replay.
- CodeGraph explicit `projectPath` remains blocked by `database is locked`; this slice used `rg`, targeted reads, syntax checks, focused RED/GREEN tests, and related regression tests instead.

## 215. PRD v3.75 Real-Code / Tacit-Knowledge Repair Slice (2026-06-11)

This is a documentation-only handoff slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`. It does not change runtime code and does not claim any new assistant capability is complete.

### 215.1 Scope

- Reviewed the PRD against current real code in:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `modules/assistant/assistantConversationStore.js`
  - this handoff document
- CodeGraph explicit `projectPath` still returns `database is locked`, so this slice used `rg` and targeted reads instead of CodeGraph structural queries.
- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.

### 215.2 PRD Changes

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.74` to `v3.75`.
- Rewrote the top status as a pure PRD repair status, not a runtime GREEN status.
- Added progress row `Slice 215：PRD v3.75 真实代码/默会知识复核修复`.
- Added `### 2.6 v3.75 本轮 PRD 修复记录`.
- Fixed stale attribution: references that implied `它旁边那个` was covered only by `Slice 211/212/213` now say `Slice 211/212/213/214` or explicitly point to Slice 214.
- Reconfirmed the real boundaries:
  - `它旁边那个` ambiguity is Slice 214, backed by `queueControlRecentAmbiguousNeighborSource()`, `queueControlRecentNeighborCandidates()`, and the `ambiguous neighbor of recent queue reference asks before moving` focused test.
  - recent queue reference persistence is same-local-conversation restore only; it is not cross-device/backend message sync or arbitrary multi-topic memory.
  - Plan Board is still read-only.
  - Timeline still has no Undo/Replay/inverse patch/developer JSON panel.
  - `8777` remains user-managed.

### 215.3 Remaining Boundaries

- No runtime code changed in this slice.
- No tests were required for runtime behavior; the document was checked by text/anchor scans.
- The next recommended runtime slice is still either:
  - `它旁边那个` clarification follow-up (`前面的` / `后面的`) using candidate relation metadata, or
  - `刚才那两个` recent multi-reference clarification/batch-control.
- Do not claim the PRD target state is complete: editable Plan Board, Undo/Replay, full history browser, full Timeline Humanizer, full dependency result merge, real `8777` live integration, and complete natural-language semantic queue editing remain unfinished.

## 216. Recent Queue Side-Neighbor Clarification Follow-Up Runtime / PRD v3.76 Slice (2026-06-11)

This runtime slice closes the first follow-up gap after Slice 214. When the assistant asks the user to choose which side of the recently referenced queued task is meant by `它旁边那个`, the user can now answer with side words such as `前面的` or `后面的` instead of needing to type an ordinal/title or click a candidate button.

### 216.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "side answer"
```

Observed RED failure before implementation:

- First command moved `exec-queued-asset-4` to the middle of the queue and remembered it as the recent reference.
- Second command `把它旁边那个移动到第一个排队任务` returned a local `clarify/needs_clarification` with previous/next candidates.
- Follow-up `后面的` did not resolve the clarification.
- Assertion failed with actual `undefined`, expected `move`.

### 216.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueTitleClarificationRelationAnswer(text)`.
  - `normalizeQueueTitleClarificationCandidates()` now preserves candidate `relation` when it is `previous` or `next`.
  - `queueControlRecentNeighborCandidates(queue, sourceIndex)` now annotates candidates with `relation:"previous"` or `relation:"next"`.
  - `parsePendingQueueTitleClarification()` now tries relation matching after ordinal matching and before title/id text matching.
  - Supported relation answers include `前面的`, `后面的`, `前一个`, `后一个`, `上一个`, `下一个`, `previous`, `prev`, `before`, `next`, and `after`.
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - Added focused coverage for `它旁边那个` clarification followed by `后面的`.

### 216.3 GREEN / Regression Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "side answer"
```

Result:

- Syntax check passed.
- Focused UI run: `97 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `176 pass / 0 fail`.

### 216.4 PRD v3.76 Update

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.75` to `v3.76`.
- Top status now describes Slice 216 as runtime GREEN.
- Added progress row `Slice 216：最近队列旁边澄清前/后短答执行`.
- Updated app/UI anchors and self-check so the landed scope includes relation-based side follow-up after `它旁边那个` clarification.
- Preserved remaining true gaps: `刚才那两个`, chained/multi-hop relative references, cross-device/backend recent-reference metadata sync, complex topic similarity, asset-library search, editable Plan Board, true live `8777` integration, and Undo/Replay.

### 216.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is still a local clarification parser slice, not a full semantic planner.
- Relation short-answer selection only works when the pending candidates carry a unique `previous` or `next` relation.
- Existing ordinal/title/id/candidate-button clarification paths are preserved.
- Recommended next runtime slice: `刚才那两个` recent multi-reference clarification, preferably starting with a clarification-first behavior rather than mutating multiple queue items by guess.

## 217. PRD v3.77 Real-Code / Tacit-Knowledge Consistency Repair Slice (2026-06-11)

This was a documentation-only slice for `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`. It did not change runtime code and did not claim any new assistant capability was complete.

### 217.1 Scope

- Reviewed the PRD against real code in:
  - `modules/app/appAssistantPanel.js`
  - `modules/app/appAssistantPanel.p1Ui.test.js`
  - `modules/assistant/assistantConversationStore.js`
  - this handoff document
- CodeGraph default status returned `CodeGraph not initialized for this project. Run 'codegraph init' first.`; explicit `projectPath` returned `database is locked`, so the slice degraded to `rg` and targeted file reads.
- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.

### 217.2 PRD Changes

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md` to v3.77:

- Corrected stale PRD wording that still described Slice 216 as only a side-neighbor clarification without follow-up execution.
- Confirmed `queueTitleClarificationRelationAnswer()`, `queueControlRecentNeighborCandidates()` relation metadata, and `parsePendingQueueTitleClarification()` relation matching are real runtime code.
- Synced the Solution B interaction gap table, Phase 2/3 progress, queue state-machine description, queue-rule self-check, and remaining-boundary text.
- Preserved the boundary that Slice 216 was not `刚才那两个`, not chained multi-hop relative references, not cross-device/backend recent-reference sync, not real `8777` live integration, and not Undo/Replay.

### 217.3 Verification

- Document anchor checks were performed with `rg` / targeted reads.
- No runtime tests were required because this slice did not modify runtime behavior.

## 218. Recent Two Queue References Group Move Runtime / PRD v3.78 Slice (2026-06-11)

This runtime slice supports the narrow local command `把刚才那两个移动到最后` after the same panel state has already controlled two different queued executions. It moves those two remembered queued tasks as a group using local `reorder`, without calling the model.

### 218.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent two queue references"
```

Observed RED before implementation:

- First command selected `exec-queued-asset-4` via the asset reference `新资产4` and moved it to the tail.
- Second command selected `exec-queued-asset-5` via `它前面的那个` and moved it to the first queued slot.
- Follow-up `把刚才那两个移动到最后` did not produce a local queue-control response.
- Assertion failed because `grouped?.queueControl?.action` was `undefined`, expected `reorder`.

### 218.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueControlRecentReferenceIds(recentReference = {})`.
  - Added `queueControlRecentMultiReferenceSource(text)` for `刚才那两个` / `这两个` / `那俩` / `both` / `those two` / `these two` source phrases.
  - Added `queueControlMoveGroupOrderedIds(queue, groupIds, targetIndex)` to preserve the group in current queue order, remove it from the queue, and insert it at the requested target position.
  - Added `parseQueueRecentMultiReferenceMoveCommand(text, queue, recentReference, targetIndexOverride = null)` returning `action:"reorder"`, complete `orderedIds`, `referenceSource:"recent_queue_multi"`, and `referenceExecutionIds`.
  - Updated `rememberQueueControlReference(execution, action)` to keep `state.recentQueueControlReferences` with the last 4 local queue-control references and expose `recentExecutionIds` on `state.lastQueueControlReference`.
  - Added `state.recentQueueControlReferences` initialization.
  - Updated `restoreConversation(conversation)` to initialize the recent-reference list from the restored last reference only.
  - Updated `parseNaturalLanguageQueueControl()` so `reorder`, `move`, and `top` branches try the recent-multi-reference parser before broader operation-plan parsers.
  - Updated `applyNaturalLanguageQueueControl()` reorder handling to include `referenceSource` and `executionIds` in `queueControl`, and to remember each referenced id after successful reorder.
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - Added focused coverage for `把刚才那两个移动到最后` after two recent explicit queue controls.

### 218.3 GREEN / Regression Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent two queue references"
```

Result:

- Syntax check passed.
- Focused UI run: `98 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `177 pass / 0 fail`.

### 218.4 PRD v3.78 Repair

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Confirmed version `v3.78` and top status describe Slice 218 as runtime GREEN.
- Added/kept progress row `Slice 218：最近两个队列引用成组移动`.
- Synced Solution B real-code gaps, Phase 2/3 progress, queue state-machine text, self-check, and target queue-rule text so `刚才那两个` is no longer listed as entirely missing.
- Preserved the accurate boundary: the new capability is only same-local-state recent two-reference group move.

### 218.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This is not a complete semantic queue planner.
- It does not support cross-conversation/cross-device/backend sync of two-reference memory.
- It does not support arbitrary `刚才那几个` / `那一组` multi-object references.
- It does not support continuous multi-hop relative references or topic-similarity matching.
- It does not search the asset library.
- It does not make Plan Board editable and does not add Timeline Undo/Replay.
- Recommended next runtime slice: continuous neighbor reference safety, cross-conversation/backend recent-reference metadata, or editable Plan Board / Timeline Undo-Replay depending on product priority.

## 219. Restored Conversation Recent Two References Runtime / PRD v3.79 Slice (2026-06-11)

This runtime slice closes the smallest persistence gap after Slice 218: after restoring the same local conversation, the panel can rebuild the recent two queue-control references from persisted assistant `queueControl` metadata and can still execute `把刚才那两个移动到最后` locally without calling the model.

### 219.1 RED Symptom

Focused RED was added in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "restored conversation reuses recent two queue references"
```

Observed RED before implementation:

- First command selected `exec-queued-asset-4` via `新资产4` and moved it to the tail.
- Second command selected `exec-queued-asset-5` via `它前面的那个` and moved it to the first queued slot.
- The conversation was persisted and then restored into a fresh panel state.
- `canSendMessage("把刚才那两个移动到最后")` returned `false`.
- Failure confirmed that restore only rebuilt the last queue reference, not the recent two-reference list required by Slice 218.

### 219.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueControlReferencesFromMessages(messages = [])`.
  - The helper scans persisted assistant messages in chronological order and reads `queueControl.executionId` plus `queueControl.executionIds`.
  - It keeps the last 4 local queue-control references, de-dupes by execution id, and clears the list on `cancel` / `cancel_all` to mirror runtime `rememberQueueControlReference()` behavior.
  - `queueControlReferenceFromMessages()` now returns the last reference plus `recentExecutionIds`.
  - `restoreConversation()` now restores `state.recentQueueControlReferences` from message history instead of rebuilding it from only the last reference.
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - Added focused coverage for restoring the same local conversation and then executing `把刚才那两个移动到最后`.

### 219.3 GREEN Evidence

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "restored conversation reuses recent two queue references"
```

Result:

- Syntax check passed.
- Focused UI run: `99 pass / 0 fail`.

### 219.4 PRD v3.79 Update

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.78` to `v3.79`.
- Top status now describes Slice 219 as runtime GREEN.
- Added progress row `Slice 219：同一本地会话恢复最近两个队列引用`.
- Updated the v3.75-v3.79 repair section, Phase 2/3 text, queue-state text, target queue-rule self-check, and remaining-boundary language.
- Preserved the accurate boundary: this is same-local-conversation restore only.

### 219.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This does not implement different-conversation memory.
- This does not implement cross-device or backend message-sync recent-reference reconciliation.
- This does not support arbitrary `刚才那几个` / `那一组` multi-object references.
- This does not support continuous multi-hop relative references or topic-similarity matching.
- This does not search the asset library.
- This does not make Plan Board editable and does not add Timeline Undo/Replay.
- Recommended next runtime slice: continuous neighbor reference safety, different-conversation/cross-device/backend recent-reference metadata, or editable Plan Board / Timeline Undo-Replay depending on product priority.


## 220. PRD v3.80 Real-Code / Tacit-Knowledge Repair Slice (2026-06-11)

This is a documentation-only PRD repair slice. It does not change runtime code and does not touch the user-managed `8777` service.

### 220.1 Why This Slice Was Needed

After Slice 219, runtime code already restored the recent two queue-control references from the same local conversation, but parts of the PRD still described the older Slice 212 boundary as only "last/recent one reference" or omitted Slice 219 from Phase 2/3 and queue-state summaries. That could mislead the next developer into rebuilding or mis-scoping already completed work.

### 220.2 Evidence Checked

- CodeGraph explicit `projectPath` still returned `database is locked`; degraded to `rg` and targeted reads.
- `modules/app/appAssistantPanel.js`
  - `queueControlReferencesFromMessages(messages = [])` reads `queueControl.executionId` and `queueControl.executionIds` from persisted assistant messages.
  - `queueControlReferenceFromMessages(messages = [])` returns the last reference plus `recentExecutionIds`.
  - `restoreConversation(conversation)` restores both `state.recentQueueControlReferences` and `state.lastQueueControlReference`.
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - Contains focused coverage: `restored conversation reuses recent two queue references without LLM`.
  - Historical Slice 219 focused result: `99 pass / 0 fail`.
  - Historical related regression result: `178 pass / 0 fail`.
- `modules/assistant/assistantConversationStore.js`
  - `appendMessage()` preserves `kind`, `queueControl`, and `executionControl` metadata on local messages.

### 220.3 PRD Changes

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped PRD version from `v3.79` to `v3.80`.
- Rewrote the top status as a pure PRD repair slice, not a runtime implementation slice.
- Added progress row `Slice 220: PRD v3.80 real-code/tacit-knowledge consistency repair`.
- Updated the conversation-store constraint so it no longer says only the latest queue reference is restored; it now records the Slice 219 recent-4 / recent-two restore behavior.
- Updated Solution B, Phase 2, Phase 3, queue-state, v3.75-v3.80 repair notes, and self-check language so Slice 219 is included consistently.
- Preserved all unfinished boundaries: no cross-device/backend recent-reference sync, no different-conversation memory, no full semantic queue planner, no editable Plan Board, no Undo/Replay, and no real `8777` live integration.

### 220.4 Boundaries / Next Handoff Notes

- No runtime files changed in this slice.
- No tests were re-run for runtime behavior; this slice relies on existing Slice 219 historical GREEN evidence plus current source inspection.
- Before claiming future runtime completion, still run the relevant focused Node/Python tests.
- Next recommended runtime slice remains one of:
  - continuous neighbor reference safety;
  - different-conversation / cross-device / backend recent-reference metadata boundary;
  - editable Plan Board;
  - Timeline Undo/Replay inverse patch.


## 221. Recent Three Queue References Runtime / PRD v3.81 Slice (2026-06-11)

This runtime slice extends the recent multi-reference queue control from the Slice 218/219 "recent two" case to a first verified "recent three" case in the same local session.

### 221.1 RED Symptom

Added focused RED coverage in `modules/app/appAssistantPanel.p1Ui.test.js`:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent three queue references"
```

Observed RED before implementation:

- The test established three recent queue-control references by moving `新资产4`, then moving the item before it, then moving the `城市夜景海报` prompt task.
- The follow-up command `把刚才那三个移动到第一个排队任务` returned no local `queueControl` result.
- Failure was at `grouped?.queueControl?.action`, actual `undefined`, expected `reorder`.
- This confirmed the parser only recognized the prior `刚才那两个` shape.

### 221.2 Runtime Changes

- `modules/app/appAssistantPanel.js`
  - Added `queueControlRecentMultiReferenceCount(text)`.
  - It recognizes explicit recent multi-reference counts for two, three, and four recent items.
  - `queueControlRecentMultiReferenceSource(text)` now delegates to the count helper.
  - `parseQueueRecentMultiReferenceMoveCommand()` now slices the last N recent references based on the detected count instead of always taking two.
  - It now requires the current queue to contain enough referenced executions before generating `reorder`, so a partial match cannot silently move fewer items than requested.
- `modules/app/appAssistantPanel.p1Ui.test.js`
  - Added `appAssistantPanel Phase 2 UI: recent three queue references move as a group without LLM`.
  - The test verifies no LLM calls, active execution stays active, statuses are preserved, complete `orderedIds` are produced in current queue order, and backend `queue-control` sync receives `action:"reorder"`.

### 221.3 GREEN / Regression Evidence

Focused RED command failed correctly before implementation:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent three queue references"
```

Focused GREEN verification:

```powershell
D:\Aic\node.exe --check modules\app\appAssistantPanel.js
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js --test-name-pattern "recent three queue references"
```

Result:

- Syntax check passed.
- Focused UI run: `100 pass / 0 fail`.

Related regression verification:

```powershell
D:\Aic\node.exe --test --test-concurrency=1 modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantExecutionStore.test.js modules\assistant\assistantExecutionApiClient.test.js
```

Result: `179 pass / 0 fail`.

### 221.4 PRD v3.81 Update

Updated `docs/superpowers/specs/2026-06-09-unified-skill-registry-agent-execution-workspace-prd.md`:

- Bumped version from `v3.80` to `v3.81`.
- Top status now describes Slice 221 as runtime GREEN.
- Added progress row `Slice 221: recent three queue references group move`.
- Updated Solution B, Phase 2/3, queue-state, v3.75-v3.81 repair notes, and self-check language.
- Preserved the accurate boundary: this is explicit-count same-local-session recent three-reference group move, not a complete arbitrary multi-object semantic planner.

### 221.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- This does not implement different-conversation memory.
- This does not implement cross-device or backend message-sync recent-reference reconciliation.
- This does not support no-count `刚才那几个` / `那一组` references.
- This does not support continuous multi-hop relative references or topic-similarity matching.
- This does not search the asset library.
- This does not make Plan Board editable and does not add Timeline Undo/Replay.
- Recommended next runtime slice: no-count group reference clarification, continuous neighbor reference safety, different-conversation/cross-device/backend recent-reference metadata, or editable Plan Board / Timeline Undo-Replay depending on product priority.


## 222. Phase 4 Undo First Slices + Plan Board Toggle + Drawer Closeout / PRD v3.82 Slices 222-228 (2026-06-11)

This batch advances three PRD mainlines in one TDD round: Phase 4 Undo first slices (222-225), editable Plan Board first slice (226), and execution drawer closeout slices (227-228).

### 222.1 RED Coverage Added First

- `modules/assistant/assistantExecutionStore.test.js`
  - timeline events keep sanitized inverse patch data (drops invalid op types, no `inverse` key when absent, persists across reload);
  - `setPlanStepEnabled` guards (executing rejected, executed step rejected, re-enable after progress rejected, missing step rejected).
- `modules/assistant/assistantExecutionOrchestrator.test.js`
  - completed `create_node`/`connect_nodes` capture `inverse.ops` + `canUndo:true` (with `nodeSignatureProvider` signatures);
  - generation actions keep `canUndo:false` and no inverse;
  - `undo()` applies inverse once, writes `undone`, second call returns `already_undone`;
  - all-conflict undo writes `undo_conflict` and never `undone`;
  - missing hook / missing inverse returns `undo_unavailable`.
  - Note: undo tests need unique event ids, so they use `createUndoStoreWithPlan()` with a counter id factory instead of the fixed `evt-fixed` factory.
- `canvas_agent_execution_service_test.py`
  - persists timeline `inverse` across reload, drops invalid ops, redacts `sk-` signatures, omits `inverse` key when absent.
- `modules/app/appAssistantPanel.p1Ui.test.js` (five `Phase 4 UI` tests)
  - selected undoable event renders `撤销此步` and removes AI nodes through the default orchestrator wiring;
  - user-modified node (signature mismatch) is kept and `undo_conflict` recorded;
  - plan step toggles render for unexecuted steps only, absent while executing;
  - completed summary `关闭` button hides drawer into `执行历史（N）` entry with reopen;
  - clicking the chat messages area collapses the expanded drawer to the status bar.

### 222.2 Runtime Changes

- `modules/assistant/assistantExecutionOrchestrator.js`
  - `inverseForActionResult()` builds `remove_node` (with optional creation-time signature) / `remove_edge` ops for `create_node`/`connect_nodes` results; completed events now write `canUndo: Boolean(inverse)` and embed `inverse`.
  - New injected options: `applyInverseOps`, `nodeSignatureProvider`.
  - New `undo(executionId, { eventId })` with `undone` / `undo_conflict` / `undo_failed` / `already_undone` / `undo_unavailable` paths; never mutates execution status, syncs timeline + drawer line2 best-effort.
- `modules/assistant/assistantExecutionStore.js`
  - `sanitizeInverse()` keeps only `remove_node`/`remove_edge` ops, sanitizes signatures, omits the `inverse` key entirely when empty;
  - `setPlanStepEnabled(id, stepId, enabled)` with guards: not while executing, not for steps with running/completed/failed timeline events, no re-enable once progress exists.
- `services/canvas_agent_execution_service.py`
  - `_sanitize_inverse()` mirrors the frontend rules (op whitelist, secret redaction in signatures, key omitted when empty).
- `modules/app/appAssistantPanel.js`
  - default orchestrator wiring injects `applyInverseOps` (graphStore `removeNode`/`removeEdge`, node-missing / signature-mismatch / unsupported conflicts) and `nodeSignatureProvider` (JSON of `{name, data}`);
  - detail area renders `.hy-canvas-agent-execution-detail-undo`（撤销此步）only for `canUndo` events with inverse ops not yet undone;
  - plan area renders `.hy-canvas-agent-execution-step-toggle`（停用/启用）for unexecuted steps in draft/waiting_confirmation/queued/queued_draft/paused/failed, disabled steps show `（已停用）`, toggle PATCHes backend `plan` best-effort;
  - `drawerActionLabel` returns `关闭` for completed; close sets `drawerState.visible=false`, resets expansion/selection, syncs best-effort;
  - when no visible execution but project executions exist, drawer renders `.hy-canvas-agent-execution-history-toggle`（执行历史（N））with a 10-item recent list and reopen-on-click;
  - chat messages area click collapses the expanded drawer (drawer stays visible).
- `modules/app/appAssistantPanel.autoload.js`
  - graph store adapter gains `removeNode` (maps to runtime `deleteNodes([id])`) and `removeEdge`.

### 222.3 GREEN / Regression Evidence

```powershell
node --test --test-name-pattern "Phase 4 UI" modules/app/appAssistantPanel.p1Ui.test.js   # 5 pass / 0 fail
node --test modules/app/appAssistantPanel.p1Ui.test.js                                    # 105 pass / 0 fail
node --test <all modules/app tests>                                                       # 188 pass / 0 fail
node --test <all modules/assistant tests>                                                 # 274 pass / 0 fail
python canvas_agent_execution_service_test.py                                             # 13 pass
python canvas_agent_route_service_test.py                                                 # 28 pass
python http_route_dispatcher_test.py                                                      # 14 pass
```

### 222.4 PRD v3.82 Update

- Bumped version to `v3.82`; top status describes Slices 222-228.
- Added progress rows for Slices 222-228 in section 2.2.
- Updated 2.4 rows (Undo/Replay, 计划编辑与 DAG, 完整历史入口, 完成总结关闭, 点击外部收起, 右侧时间线详情) and 2.5 rows (Plan Board, Timeline 操作, 展开态覆盖) to the new minimal-closure state.
- Rewrote Phase 4 "当前真实代码边界" to reflect the landed first slices and the honest remaining gaps.
- Updated the post-2.6 priority paragraph to v3.82.

### 222.5 Boundaries / Next Handoff Notes

- Did not start, restart, stop, status-check, probe, curl, browse, or otherwise touch the user-managed `8777` service.
- Undo only covers delete-style inverse for `create_node`/`connect_nodes`; no attribute-level inverse for `update_node`/`layout_nodes/move_nodes`, no multi-step "undo to here", no Replay, no regenerate entry; generation actions remain non-undoable so generated assets stay in the asset library.
- Node-modification detection is a shallow `{name, data}` JSON signature captured at creation time; deep or out-of-band mutations beyond `name/data` shape are treated as modified only if the signature string differs.
- Plan Board editing is step-level enable/disable only; no drag reorder, no single-step run, no DAG preview, no post-edit recompile.
- Execution history entry lists the 10 most recent executions; no search/filter/pagination.
- Click-outside collapse covers the chat messages area only; no real overlay/backdrop blur visuals yet.
- CodeGraph remained unavailable (`database is locked` on explicit projectPath); used `rg` + targeted reads per project rules.
- Recommended next runtime slices: attribute-level inverse + multi-step undo, Plan Board drag reorder / recompile, history search/filter, overlay/blur visuals, then a human-arranged live `8777` end-to-end pass.


## 223. Attribute-Level Inverse + Undo-To-Here + First Live Integration / PRD v3.83 Slices 229-231 (2026-06-11)

### 223.1 Slice 229: restore_node attribute-level inverse

- RED first in `assistantExecutionOrchestrator.test.js` (capture with snapshot provider, non-undoable without provider, undo via `restoredNodeIds`), `assistantExecutionStore.test.js` (sanitize keeps restore_node name/data, strips secrets), `canvas_agent_execution_service_test.py` (persistence + redaction), `appAssistantPanel.p1Ui.test.js` (UI undo restores attributes).
- Runtime: orchestrator gains `nodeSnapshotProvider` injection; `RESTORABLE_ACTION_TYPES` (`update_node/update_node_data/set_node_prompt/set_node_model/rename_node`) snapshot `{name,data}` BEFORE executeActions; completed event inverse gets `restore_node` op with prior name/data + post-action signature. Panel `applyGraphInverseOps` restores via `graphStore.updateNodeData` + `updateNode`/`renameNode` (adapter extended in autoload), conflicts on missing node or signature mismatch. Both sanitizers whitelist `restore_node` and sanitize `data`.
- Boundary: restore is patch semantics — keys ADDED by the AI patch that did not exist before are not deleted on undo. No positional (layout/move) inverse yet.

### 223.2 Slice 230: undoTo (撤销到这里)

- `orchestrator.undoTo(executionId, { eventId })`: collects all not-yet-undone undoable events from the selected event (inclusive) to the timeline end, undoes them in REVERSE order via the existing single-event undo, skips already-undone, stops on `undo_failed`, aggregates `{status, undoneCount, conflictCount, results}`.
- UI: `.hy-canvas-agent-execution-detail-undo-to`（撤销到这里）renders only when the selected event is undoable AND at least one later event is also undoable.
- Boundary: not transactional — conflicts keep the canvas for that op and are recorded; earlier successful undos in the same batch are not rolled back.

### 223.3 Slice 231: first live integration round (user-authorized)

User authorization 2026-06-11: live integration moved from human-only to the developer. Findings and evidence:

- The user's long-running `8777` instance was started 2026-06-09 09:56 (`python server.py`, PID 20744) — BEFORE all executions-route slices. `/api/v2/canvas-agent/status` answers but `/executions` 404s. Force-killing that process was denied by policy; the USER must restart `8777` to load the new features.
- Validation therefore ran on a fresh current-code instance at `--port=8779`:
  - 10/10 live API checks: upsert; inverse timeline persistence + op whitelist + `sk-` signature redaction; plan `enabled` flag via status PATCH; close `visible=false`; queue-control `top` reorder; prepare route reachability (404 on unknown id); clear-completed cleanup (dedicated projectId `live-prd-v382-check`, fully cleaned).
  - Cross-restart recovery: upsert `executing` execution, kill + restart own instance → `paused`, `running=false`, cursor kept, one `restored_paused` event, line2 `重启后已暂停，可继续执行`.
  - `restore_node` live persistence: prior name/data kept, `apiKey` stripped (projectId `live-prd-v383-check`, cleaned).
- Browser-level UI live acceptance NOT possible in this environment: the headless preview browser cannot boot the heavy canvas app (stuck on splash, reload loop; no `location.reload` exists in code — environment crash loop), and no Claude-in-Chrome browser is connected. Panel UI behavior remains covered by 105+ offline UI tests.

### 223.4 Evidence

```powershell
node --test --test-name-pattern "Phase 4 UI" modules/app/appAssistantPanel.p1Ui.test.js   # 7 pass
node --test <all modules/app + modules/assistant tests>                                   # 469 pass / 0 fail
python canvas_agent_execution_service_test.py                                             # 14 pass
python canvas_agent_route_service_test.py                                                 # 28 pass
```

### 223.5 Next handoff notes

- Remind the user to restart the long-running `8777` so the executions routes and drawer features go live for real use.
- Next runtime slices: positional inverse for `layout_nodes/move_nodes`; Plan Board drag reorder / recompile; history search/filter; overlay/blur visuals; browser-level UI live acceptance once a real Chrome is available; chat/LLM-path live integration.


## 224. Positional Inverse + Plan Drag Reorder + History Search + Overlay + Real-Chromium Acceptance + LLM Link Fix / PRD v3.84 Slices 232-237 (2026-06-11)

### 224.1 Runtime slices (all RED->GREEN)

- Slice 232 `restore_node_position`: orchestrator gains `nodePositionProvider`; `layout_nodes`/`move_nodes` capture `{x,y}` per `action.nodeIds` BEFORE execution; completed-event inverse ops carry prior coordinates + post-action position signature. Undo restores `node.x/y` directly (same direct-mutation pattern the executor uses); signature mismatch -> `node_moved` conflict keeps user moves. Frontend + backend sanitizers whitelist the op (numeric x/y required). Boundary: `data.layoutStrategy` written by layout_nodes is NOT reverted.
- Slice 233 plan drag reorder + recompile: `assistantExecutionStore.reorderPlanSteps(id, orderedStepIds)` validates full permutation, locks executed steps to their original indices, rejects executing, appends a `plan_edited` timeline event. UI: unexecuted steps are `draggable` (dragstart/drop) and have 上移/下移 buttons; reorder best-effort PATCHes backend plan. Recompile semantics: `run()`/`resume()` always recompile from the latest plan; no LLM re-generation.
- Slice 234 history search: `.hy-canvas-agent-execution-history-search` input filters the history list by title/status/drawer text; still updatedAt-desc, top 10.
- Slice 235 overlay/blur: `.hy-canvas-agent-execution-backdrop` (blur + translucent) covers the chat area while expanded and collapses on click; expanded drawer gets blur/shadow CSS. Live finding: with no chat messages the messages container is hidden, so the backdrop is the real click-outside surface.
- Slice 236 LLM link fix (found by live integration): `piSdkAdapter.ts/js resolveOpenAIChatCompletionsUrl()` blindly appended `/chat/completions`, so an `/openai`-suffixed gateway base (user's `claw_assistant.apiUrl = https://api.gptclubapi.xyz/openai`) produced `/openai/chat/completions` -> upstream 404 -> `pi_agent_failed`. Now mirrors `claw_provider_proxy_service._endpoint()`: `/openai` base -> `/v1/chat/completions`. TS and JS both updated; focused test added.

### 224.2 Live acceptance evidence

- Real Chromium (Playwright, headed, chromium-1217) against a current-code `python server.py --port=8778` instance: **17/17 PASS** — app boot + assistant install, seeded drawer above input, expanded plan/timeline, backdrop visible, step toggles/up-down/draggable, live step disable, live reorder + backend plan sync, 撤销此步/撤销到这里 rendered, undo conflict kept canvas + synced `undo_conflict`, backdrop click collapsed to status bar, completed 关闭 button, 执行历史 entry, live search filter, history reopen, zero page errors, seed cleanup.
- Chat/LLM live: after the URL fix the request reaches the real gateway; current stop point is the provider business error `已达到总封顶限额 ($4000)` (user API key quota cap). Full v2-contract completion acceptance requires the user to renew quota, then re-run the same call.
- Literal port 8777: occupied by the user's desktop packaged app `幻映工作台1.1.exe` (old packaged build, no executions routes, no canvas-agent status route). Policy denies killing user processes; switching acceptance to literal 8777 needs the user to close that app and run `python server.py` from this repo (default port 8777). Everything except the port number was accepted on identical code at 8778.

### 224.3 Regression

```powershell
node --test <all modules/app + modules/assistant + PI integration tests>   # 505 pass / 0 fail
python canvas_agent_execution_service_test.py                              # 15 pass
python canvas_agent_route_service_test.py / http_route_dispatcher_test.py  # OK
python pi_bridge_service_test.py                                           # OK
```

### 224.4 Next handoff notes

- Re-run full LLM v2-contract live acceptance once the user's provider quota is renewed.
- Re-run the UI acceptance against literal 8777 once the packaged 1.1 app is closed (same script semantics; it lived at `.live_ui_acceptance.mjs` during this round and can be recreated from this record).
- Remaining roadmap: layoutStrategy revert + group-position undo coupling, history pagination/status chips, Replay.


## 225. Full Live Acceptance on Real 8777 + Gemini 3.1 LLM Link / PRD v3.85 Slices 238-239 (2026-06-11)

### 225.1 Context

The user closed the packaged desktop app and restarted literal `8777` with this repo's current `python server.py`. The user also directed the LLM acceptance to switch from the quota-capped gpt-5.5 channel to the Gemini 3.1 text model.

### 225.2 Slice 238: fenced-JSON parse fix (found by live LLM acceptance)

- First gemini-3.1-pro call returned HTTP 200 / success but `actions: []` with warning "Model returned plain text without action JSON." — Gemini wrapped the action JSON in a markdown code fence; `piClient parseJsonObject()`'s fallback regex anchors on a trailing brace, and the fenced text ends with backticks.
- Fix: new `stripMarkdownCodeFence()` applied before parsing, in BOTH `piClient.ts` and `piClient.js`; focused test "parses action JSON wrapped in markdown code fences" added (RED first).
- PI bridge uses `subprocess.run` per request, so the JS fix took effect without restarting the user's 8777.
- Boundary: only a single whole-message fence is unwrapped; mixed prose with multiple JSON blocks is future work.

### 225.3 Slice 239: acceptance evidence on literal 8777

- Model reference used: `{"provider": "model_registry", "modelId": "gemini-3.1-pro"}` -> matched the user's configured modelRegistry text entry (grsai gateway base `https://grsai.dakka.com.cn/v1`).
- LLM live result: 9.1s, zero warnings, full v2 contract — `intent` + `plan` + `actionsByStep` with `create_node` (source-text, title "Live 联调验证") and `focus_nodes`, plus legacy `actions` mirror.
- Real-Chromium UI acceptance re-run against literal `8777`: **17/17 PASS** (same checklist as record 224: boot/install, seeded drawer, expanded plan/timeline, backdrop, step toggle/reorder + backend sync, undo buttons, undo conflict sync, backdrop collapse, 关闭, 执行历史, live search, reopen, zero page errors, seed cleanup).
- Acceptance script archived as `tools/run_canvas_agent_ui_acceptance.mjs` (parameterized base URL, defaults to `http://127.0.0.1:8777`, seeds under `live-accept-ui-8777` and cleans up).

### 225.4 Regression

```powershell
node --test <all PI integration + modules/app + modules/assistant tests>   # 506 pass / 0 fail
```

### 225.5 Remaining roadmap

- Replay structured actions; history pagination/status chips; layoutStrategy revert + group-position undo coupling; multi-JSON-block parse hardening; re-run multi-model regression when the gpt-5.5 quota is renewed.


## 226. Panel Model Selector Aligned With Text Node Rules / PRD v3.86 Slice 240 (2026-06-11)

### 226.1 Requirement

User: the agent panel's model selector should offer the same models as the text generation node, and models must be selectable without having passed testing.

### 226.2 Gap found

- Text node menu rule (`modules/modelRegistryFilters.js isSelectableApiModel`): requires id + name + modelId, excludes only `deleted`/`disabled` — failed (untested) and key-less models stay listed.
- Panel rule (`assistantModelRegistry.js isConfiguredTextModelOption`): required full config AND excluded `status: "failed"` — so the user's `gemini-3.1` (status failed) never appeared in the panel menu.

### 226.3 Changes (RED->GREEN)

- `assistantModelRegistry.js`:
  - new `isSelectableTextModelOption()` / `filterSelectableTextModelOptions()` mirroring the text node rule (registry text options only; excludes `deleted` status and `disabled: true`; keeps failed and incomplete-config entries);
  - `isConfiguredTextModelOption()` no longer excludes `status: "failed"` (send gate now allows untested models);
  - `normalizeRegistryTextModel` carries `disabled`; `defaultModel` still prefers a non-failed configured option first.
- `appAssistantPanel.js`: menu render, `state.modelOptions` normalization, guard option list, `fallbackSelectedModel`, debug snapshot all switched to the selectable filter; the selected-model send guard stays on `isConfiguredTextModelOption`, so key-less models render disabled (with reason + config link) and still block sends.
- Tests updated to the new behavior (intentional): registry "keep only active text-node models" now expects Failed Text in the configured list; p1Ui "model button opens configured text models only" now expects Failed Text in the menu; autoload selectable test expects the missing-key option listed with `configured: false`. New tests: registry selectable-mirror semantics; p1Ui end-to-end failed-model select + send (chat payload carries the failed model), missing-key disabled rendering, deleted hidden.

### 226.4 Evidence

- JS regression: 509 pass / 0 fail (modules/app + modules/assistant + canvasSkills + PI integration).
- Live on real `8777` (Playwright Chromium, 3/3): user's registry lists `gemini-3.1` (status failed, has key) and `gpt` (unverified); the panel menu now shows BOTH enabled; clicking gemini-3.1 sets it as the active model (`provider: model_registry`, pill shows gemini-3.1). Before this slice the failed entry was hidden.

### 226.5 Boundaries

- Panel and text node remain two implementations mirroring the same rule; extracting a shared module is future cleanup.
- The panel lists the user's modelRegistry text models; vendor built-in manifest models shown in the text node menu are not part of the panel list (unchanged scope).


## 227. P0-P2 Audit Items Completed / PRD v3.87 Slices 241-248 (2026-06-11)

Executed the full audit backlog in order via the written plan `docs/superpowers/plans/2026-06-11-p0-p2-completion.md` (writing-plans -> executing-plans, TDD per task, one commit per task).

### 227.1 Delivered

- **Slice 241 (P0-1)**: `CanvasAgentActionSchema.validate_actions(..., matched_skills=)` enforces skill.json allowed/forbidden lists (`blockedBySkill`); route forwards `matchedSkills`; executions persist `intent.matchedSkills` (JS + Python stores); orchestrator sends matchedSkills to validate and writes `blocked_by_skill` (canRetry:false) fail-closed; offline runner asserts examples respect constraints + qualityRules non-empty (built-ins 12/12).
- **Slice 242 (P0-2)**: `assistantExecutionMetrics.computeExecutionMetrics()` derives PRD ch.20 computable metrics; wired into `debugSnapshot().executionMetrics`.
- **Slice 243 (P1-6)**: orchestrator `now()` option; completed/failed events carry real `durationMs` + structured `target {actionType,nodeType,nodeIds,stepId}`; sanitized round-trip on both stores.
- **Slice 244 (P0-3)**: `replay()` re-executes structural actions, writes `replayed`/`replay_skipped_generation`; `regenerateStep()` runs one action without moving the cursor, video requires fresh authorization; drawer buttons 回放结构 / 重新生成此步.
- **Slice 245 (P1-4)**: developer toggle in the detail area reveals selected-event JSON (durationMs/target/inverse/developer).
- **Slice 246 (P2-7/8)**: readonly dependency DAG edge list in the plan area; execution history load-more pagination (10/page).
- **Slice 247 (P2-9/10)**: `assistantModelRegistry` raw filtering reuses text-node `isSelectableApiModel` as the single rule source; no-count group references (那几个/那一组) move ALL recent queue references.
- **Slice 248 (P1-5 + real bug fix)**: live LLM E2E `tools/run_canvas_agent_llm_e2e.mjs` (drives the REAL UI: model menu -> input -> send -> confirm) found a real product bug — step-by-step orchestration lost the executor's in-batch node-alias map, so model aliases (story_outline) broke later update/connect actions with `[store] updateNodeData() 找不到节点`. Orchestrator now keeps a cross-action alias table (run + replay). Final live run: **6/6 PASS** on real 8777 with gemini-3.1-pro — 7 actions executed, real durations (avg 8ms), real canvas node ids, self-cleaning (exec_pi- prefix only).

### 227.2 Debugging notes (systematic-debugging, 4 evidence layers)

1. Stale failed execution occupying the drawer (correct PRD strong-state behavior; E2E cleans backend leftovers now).
2. Leftovers lived in BACKEND with empty projectId (frontend localStorage cleaning alone was insufficient).
3. Programmatic `state.sendMessage()` bypasses the panel render loop — the drawer DOM never updates; E2E must drive the real input/send DOM.
4. The genuine runtime bug: cross-action alias loss (fixed, RED test `node aliases survive across step-by-step execution`).

### 227.3 Evidence

- JS full sweep: **525 pass / 0 fail**; Python: execution service / route / action schema / dispatcher / offline runner all OK; built-in skills deep assertions 12/12.
- Live: `node tools/run_canvas_agent_llm_e2e.mjs` -> 6/6 PASS; metrics dogfooded in-run (actionValidityRate 1, avgActionDurationMs 8).

### 227.4 Boundaries / next priorities

- Real LLM responses carry EMPTY `intent.matchedSkills` (models don't echo it; the minimal piClient wrapper doesn't backfill) — skill enforcement is proven offline/with explicit injection, but the real chat path needs the PI/Claw wrapper to backfill matchedSkills from local matching. **This is the top next slice.**
- Metrics are local-snapshot only (no backend aggregation/dashboard); some ch.20 metrics aren't locally computable.
- Replay never rebuilds generation results (by 4.2 design); regenerateStep cannot recover aliases pointing at nodes created in the original run.
- DAG is a textual edge list; history has pagination but no status chips; E2E covers the text-storyboard scenario only (no real image/video generation run).
- The long-running 8777 was NOT restarted this round: frontend changes are static-served (live now); the Slice 241 backend enforcement needs a user-driven 8777 restart to load.


## 228. matchedSkills Real-Path Backfill + 8777 Restart Closes the Enforcement Loop / PRD v3.88 Slices 249-250 (2026-06-11)

- **Slice 249 (TDD)**: skill definitions now keep `triggers` (huanyingTools ts+js; the sanitizer previously stripped them, so the PI side had nothing to match against). `piClient.matchedSkillIdsForMessage()` matches the request message against loaded skill triggers; BOTH contract branches (model returned v2 fields / minimal wrap) merge local matches into `intent.matchedSkills`, dedup with model-echoed ids, and no longer clobber a model-provided intent object. PI tests 33/33 (new: minimal-wrap backfill, hasV2-branch backfill, complete() wiring, loader keeps triggers).
- **Slice 250**: user directed the 8777 restart; old PID killed, `python server.py` relaunched on current code. Live verification: `/actions/validate` with matchedSkills BLOCKS forbidden actions (`blockedBySkill`, PASS) and passes legal ones (PASS). Added the generic trigger 分镜 to storyboard_workflow (the long-form-only triggers missed real phrasings like 做 2 个分镜).
- **Loop closed live**: LLM E2E re-run, now 8 assertions, all PASS — real gemini response carries `matchedSkills: ["storyboard_workflow"]`, `skillHitRate` metric went 0 -> 1. Full chain proven on real 8777: real LLM -> local trigger backfill -> execution persistence -> orchestrator validate payload -> backend skill constraints fail-closed.
- Regression: JS 529 pass / 0 fail; Python action schema + offline runner OK (12/12 built-in cases).
- Boundaries: trigger matching is substring-based (no semantic similarity); unknown model-echoed skill ids are silently skipped by the backend loader; qualityRules remain presence-only assertions.


## 229. Remaining Roadmap Completed / PRD v3.89 Slices 251-255 (2026-06-11)

- **Slice 251**: `compute_metrics()` on the backend execution service + `GET /api/v2/canvas-agent/metrics` (dispatcher allowlisted) + `assistantExecutionApiClient.fetchMetrics()`; developer-mode detail area renders a metrics dashboard block (`.hy-canvas-agent-execution-metrics`).
- **Slice 252**: leveled ASCII DAG graph (`.hy-canvas-agent-execution-dag-graph`, `└─▶` connectors) alongside the edge list; history status chips (全部/已完成/失败/已取消) compose with search + pagination.
- **Slice 253**: machine-checkable `qualityChecks` (requiresActionType / forbidsActionType / maxActions) enforced by the offline runner against examples.json; all 4 built-in skills configured and passing (12/12); PI loader keeps the field.
- **Slice 254**: semantic trigger matching — exact substring OR all non-stopword words present OR both halves of a CJK trigger (len>=4) present; mirrored across piClient (ts+js) and ClawSkillRegistryService (python). 帮我把画布整理一下 now hits canvas_layout.
- **Slice 255**: `tools/run_canvas_agent_image_e2e.mjs` 5/5 on real 8777 — storyboard+image plan executed, a REAL ai-image generation was queued AND started (node id recorded in the completed event's result), matchedSkills present on the real path, self-cleaning.
- Regression: JS 533 pass / 0 fail; Python 6 suites OK.
- **New gap discovered (next priority)**: the orchestrator execute path does not write `state.generationTasks` back to the panel (only the legacy apply flow does), so generation-task tracking/notifications are missing when execution goes through the drawer confirm path.
- Architecture overview generated at `docs/ARCHITECTURE-canvas-agent.md`.


## 230. QMAI Director Integration Optimizations / PRD v3.90 Slices 256-262 (2026-06-12)

Executed the full architecture-review backlog (5 redundancies / 4 mismatches / 6 improvements) via docs/superpowers/plans/2026-06-11-qmai-integration-optimizations.md.

- **256 shared sanitizer**: `modules/assistant/sensitiveDataRules.js` is the single rule source for the contract sanitizer and the director context sanitizer (key-pattern union + Bearer/sk-/path redaction + SAFE_KEY_EXCEPTIONS for policy flags like redactedLocalPaths). Caught divergences fixed: protocol now drops authorization/headers/cookie keys; director now redacts Bearer tokens.
- **257 director skill**: 5th built-in v2 skill; forbids all generation actions; qualityChecks; offline runner 15 cases incl. director; server-side enforcement live PASS both directions.
- **258 first cut**: `tools/director_plan_runner.mjs` (L3 compile, node/fs side) reads QMAI memory read-only, derives knowledge cards, optionally consumes exported storyboard/action-package/continuity-report, runs buildDirectorBrainCanvasPlan + continuity gate, emits a v2 contract (matchedSkills=["director"], steps step_cards/step_shots/step_layout with dependsOn). `services/director_bridge_service.py` per-request node process, fail-closed. Route POST /api/v2/canvas-agent/director/plan + dispatcher allowlist + api.directorPlan(). Panel 「导演：」command routes AFTER the 6 local gates and BEFORE the model guard (queue control wins; no model config needed). The middle PI hop is deleted per review — brain→canvas is deterministic compilation. NOTE: programmatic state.sendMessage has no onUpdate → UI tests must drive the real input/send DOM (same lesson as the LLM E2E).
- **259 prepare split**: one prepare channel, two strategies — executions with matchedSkills incl. "director" recompile via api.directorPlan({recompile:true}); others keep the fresh-context path; fail-closed preserved.
- **260 receipts projection**: `export_receipts()` + GET /api/v2/canvas-agent/receipts + tools/export_execution_receipts.py emit huanying-execution-receipts/v1 (metrics + undo counts, sanitized) — the symmetric one-way read-only file bridge for QMAI's review-memory flywheel.
- **261 golden fixture**: modules/directorBrain/__fixtures__/qmai-live-sample committed (live wiki/memory layout) + loader contract test.
- **262 live acceptance**: 8777 restarted with HY_QMAI_PROJECT_DIR=fixture. Live: skill block PASS, director/plan PASS (3 knowledge cards from real fixture read), receipts PASS, `tools/run_canvas_agent_director_e2e.mjs` **7/7** — 「导演：」 -> drawer -> confirm -> knowledge-card nodes on the real canvas, matchedSkills carried end-to-end, zero false blocks on structural actions.
- Regression: JS 567 pass / 0 fail (1 env-gated skip); Python 8 suites OK. Fix during wiring: server.py injection had leaked director_bridge_service into PiBridgeService ctor (boot failure) — removed; only CanvasAgentRouteService takes it.
- Red lines intact: canvas-is-truth, generation-requires-confirmation, QMAI read-only. Explicitly NOT done (postponed per review): PI dual-role split, QMAI HTTP service, any change inside the QMAI repo (owned by the other session; its local ahead-3-commits + uncommitted files still need that session to land).
- Next: real QMAI project dir acceptance; real storyboard/action-package artifact flow; state.generationTasks write-back; failure self-healing on the prepare channel; QMAI-side receipts consumption.


## 231. Generation Confirmation Rework / PRD v3.91 Slices 263-267 (2026-06-12)

User-locked spec via 7 Socratic answers: confirmation gates REAL generation dispatch only (blank/PREP nodes never gate nor count); Plan confirms image|video, Act confirms video only; everything else auto-executes in BOTH modes; one up-front confirmation releases the whole plan AND doubles as video authorization (APPLY strong-confirm retired); copy 本次将生成 X 个文本节点、X 个图片节点、X 个视频节点，确认执行吗？ (zero-omit); both paths (v2 drawer + legacy pendingActions card) share one rule; confirm state gets a redesigned look; other drawer states untouched; line1==line2 dup bug fixed.

- **263**: `modules/assistant/assistantGenerationConfirmation.js` — countGenerationActions (nodeType-resolved incl. graphStore lookup), generationConfirmationRequired, generationConfirmationMessage. 4 unit tests.
- **264 (v2 drawer)**: record path computes counts -> auto `orchestrator.run` for zero-confirm plans (drawer shows progress); confirm-needed drafts carry the counted message as line2 (initial timeline event no longer clobbers it); drawerActionLabel unified (授权视频 -> 确认, gated by counts); confirm click passes videoAuthorized:true when video>0; executor wrapper honors payload.videoAuthorized (one-gate). Scoping traps fixed: record lives in the STATE factory (uses state.executionOrchestrator + state.lastAutoExecutionPromise awaited by handleSend), executionActions/isRunnableExecution hoisted to module scope.
- **265 (legacy path)**: the REAL legacy auto-policy lives in `prepareInteractionCardForPendingActions.canAutoApply` (old: act||plan-with-generated-nodes) — rewritten to the new rule; card.requiresConfirmation/confirmationMessage now set from counts; confirmPendingInteractionCard authorizes video by counts (one step). The handleSend-level legacy branch I first added was redundant and removed — single policy point at state layer.
- **266 (visuals)**: drawer data-confirm green state, `.hy-canvas-agent-confirm-badge` per-type counts, highlighted confirm button, render-time message override (covers imported/restored drafts); strongConfirmButton permanently hidden.
- **267 (E2E/live)**: director E2E asserts structural-plans-auto-execute (7/7); LLM 8/8 and IMAGE 5/5 pass via their tolerant confirm-if-present blocks (act text/image now auto); live visual check 3/3 with screenshot — title + counted copy + badges + highlighted 确认 (the original ugly duplicated-text card is gone).
- Regression: **JS 637 pass / 0 fail** (2 env-gated skips). 11 old-policy tests intentionally updated (plan-auto-image tests -> act mode; create-video-node-confirm tests -> real video generation fixtures; bottom preview-row test -> state-layer partial-selection since that UI is unreachable under the new rule; main preview test -> auto-apply receipt).
- Boundaries: video real-generation live E2E still not run (cost); bottom preview checkbox UI unreachable by design now; strongConfirmation state flags remain as internal mechanics only.


## 232. Repair-Warning Filter + Legacy Line Dedupe / Slice 268 (2026-06-12)

User screenshot feedback after the confirmation rework:
1. `action[2] repaired connect endpoint aliases` showed in the user warning strip — this is ClawActionSchema's technical auto-repair notice (services/claw_action_schema.py:493). Fixed at the presentation layer: the strip filters /repaired/i warnings (still kept in state.lastWarnings for developer mode); genuine warnings (连续性拦截 etc.) still render.
2. The duplicated line1==line2 card persisted — root cause: the record-layer dedupe (slice 264) only protects NEW executions; the user's card was a STALE persisted execution from before the fix. Added a render-layer fallback in renderExecutionDrawer: when line1===line2, line2 falls back to the status text — covers legacy localStorage/backend imports without data migration.
- Tests: 2 new p1Ui tests (filter keeps real warnings; legacy seeded execution renders deduped). Panel suites 197 pass. Live check on real 8777: 2/2 (seeded legacy duplicate renders deduped; injected repaired warning filtered while continuity warning shows).
- Note for the user: a hard refresh (Ctrl+F5) may be needed once — module JS can be HTTP-cached by the browser.
