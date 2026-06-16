# Pi Canvas Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 A 方案把 `earendil-works/pi` 接入幻映，形成安全的画布助手内核；继承 Claw 开发历程里验证过的产品目标，同时避开旧选型的 CLI/runtime/source/权限坑。

**Architecture:** 新增 Node 22+ Pi SDK sidecar runner；幻映 Python 后端通过本地 JSONL 调用 sidecar；Pi 只负责理解意图和提出结构化 actions；幻映继续负责上下文脱敏、schema 校验、预览、二次复验、执行、回退和生成权限。旧 `claw_*` 代码先作为 `canvas_agent_*` 兼容层迁移，不一次性推倒已经验证过的 action contract。

**Tech Stack:** Python `unittest`；native ES modules + `node --test`；Node 22+ sidecar；Pi SDK (`@earendil-works/pi-*`)；JSONL stdin/stdout bridge；OpenAI-compatible provider proxy；existing Huanying graphStore / renderer bridge.

---

## 0. 设计边界与硬规则

### 0.1 当前本地基线

项目根目录：`D:\Aic\huanying-source-windows-20260430-122116`。

当前可复用文件：

- `services/claw_action_schema.py`：最小恢复态 action 白名单、别名修复、视频权限边界。
- `services/claw_bridge_service.py`：旧 Claw CLI bridge；作为反例和协议参考，不继续沿用 CLI prompt 参数路线。
- `services/claw_assistant_route_service.py`：旧 `/api/v2/assistant/*` 路由形态参考。
- `services/claw_context_service.py`：敏感字段和值脱敏基线。
- `services/claw_skill_registry_service.py`：本地 JSON skill 注入基线。
- `modules/assistant/assistantActionExecutor.js`：当前可用的安全前端执行器基线。
- `modules/assistant/assistantActionPreview.js`：当前可用的预览/回执摘要基线。
- `modules/app/appAssistantPanel.js`、`modules/app/appAssistantPanel.autoload.js`：当前是 stub，不能当作真实 UI 已完成。
- `config/assistant-skills/*.json`：画布布局、分镜、变体、模板等历史 skill 资产。
- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`、`docs/assistant_action_contract_matrix.md`：历史目标、坑点、action contract 证据。

当前已知约束：

- `.git` 目录存在但状态疑似不完整；Phase 0 必须确认版本管理状态，不能盲目提交。
- CodeGraph 在本次调研中返回 `database is locked`；实施时可重试，仍失败则用本地只读检索。
- 离线开发期间不启动、不重启、不停止、不 curl、不浏览器探测用户托管的 `8777`。

### 0.2 Pi 集成判断

Pi 用作 embeddable agent runtime，而不是裸 coding-agent CLI：

- 通过 SDK 或自定义 runner 控制工具面。
- Python 与 Node sidecar 之间走 JSONL，不走 Windows CLI 最后一个超长 prompt 参数。
- 不启用 Pi 默认文件、shell、浏览器、包扩展能力。
- 不依赖 Pi 提供产品权限；权限与确认全部留在幻映。
- 普通用户不能被要求全局安装 Pi；发布时必须打包 sidecar runtime/source/lockfile/license。

参考来源：

- `https://github.com/earendil-works/pi`
- `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md`
- `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md`
- `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md`
- `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md`

### 0.3 不可破坏的安全门

- Pi 不能拿真实上游 API Key，只能拿幻映 provider proxy 的本地 token/base URL。
- Pi 不能拿完整项目 JSON、本地绝对路径、密钥、Bearer token、data URL、blob URL。
- Pi 不能使用读文件、写文件、编辑文件、shell/bash/PowerShell、浏览器、包扩展、MCP 之类能力。
- Pi 只提议 actions；只有幻映后端 schema 和前端二次复验通过后才执行。
- 视频生成永远需要用户明确授权。
- 文本/图片生成仅在低风险、已校验、前端复验通过时自动运行。
- 每个 live 失败必须先沉淀为本地回归测试，再继续 live 校准。

---

## 1. 目标架构

```text
Huanying Frontend
  ├─ modules/app/appAssistantPanel.js
  │    chat UI / quick intents / preview cards / confirmation / receipts
  ├─ modules/assistant/assistantContextBuilder.js
  │    graphStore/workspaceStore -> safe canvas context
  ├─ modules/assistant/assistantActionPreview.js
  │    actions -> readable preview
  └─ modules/assistant/assistantActionExecutor.js
       validated actions -> graphStore mutations / generation requests

        HTTP JSON: /api/v2/canvas-agent/*

Huanying Python Backend
  ├─ services/canvas_agent_route_service.py
  ├─ services/canvas_agent_context_service.py
  ├─ services/canvas_agent_action_schema.py
  ├─ services/pi_bridge_service.py
  ├─ services/pi_runtime_service.py
  └─ existing provider proxy

        local stdin/stdout JSONL

integrations/pi_canvas_agent/
  ├─ package.json / package-lock.json
  ├─ src/protocol.ts
  ├─ src/huanyingTools.ts
  ├─ src/runner.ts
  └─ dist/runner.js
```

### 1.1 JSONL Bridge Protocol

Python -> sidecar:

```json
{"id":"req-1","type":"chat","conversationId":"project-default","mode":"replyOnly","message":"帮我检查画布","context":{"canvas":{"nodes":[],"edges":[]}}}
```

Sidecar -> Python:

```json
{"id":"req-1","type":"response","success":true,"reply":"我会检查节点状态和连接关系。","actions":[],"warnings":[],"requiresConfirmation":false}
```

错误也走同一 envelope：

```json
{"id":"req-1","type":"response","success":false,"errorCode":"pi_agent_failed","reply":"Pi canvas agent failed before producing a response.","actions":[],"warnings":["exit code 1"],"requiresConfirmation":false}
```

### 1.2 Action Response Contract

Phase 2 起，Pi 只能返回：

```json
{
  "reply": "string shown in chat",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false
}
```

Actions 永远进入 `CanvasAgentActionSchema.validate_actions(...)`，Pi 输出不直接执行。

### 1.3 第一批允许 action

- `create_node`
- `update_node_data`
- `rename_node`
- `connect_nodes`
- `layout_nodes`
- `move_nodes`
- `focus_nodes`
- `set_viewport`
- `create_group`
- `duplicate_nodes`
- `queue_generation_task`
- `run_prompt_preset_generation`
- `create_workflow_template`，只作为强确认预览动作

---

## 2. 文件结构总览

### 2.1 新增 Python 文件

- `services/canvas_agent_action_schema.py`：中性命名 action schema；Phase 0 包装 `ClawActionSchema`，后续迁出 Claw 命名。
- `services/canvas_agent_context_service.py`：中性命名上下文脱敏/压缩服务。
- `services/pi_runtime_service.py`：解析 sidecar runner 路径，构建安全环境变量。
- `services/pi_bridge_service.py`：JSONL 请求/响应、timeout、stderr、exit code、invalid JSON 处理。
- `services/canvas_agent_route_service.py`：提供 `/api/v2/canvas-agent/*`。

### 2.2 新增前端/sidecar 文件

- `api/canvasAgentApi.js`：浏览器调用 canvas-agent API。
- `modules/assistant/assistantContextBuilder.js`：构建脱敏画布上下文。
- `integrations/pi_canvas_agent/package.json`：隔离 sidecar 包。
- `integrations/pi_canvas_agent/src/protocol.ts`：JSONL 协议类型和校验。
- `integrations/pi_canvas_agent/src/huanyingTools.ts`：Huanying-only 工具和系统提示。
- `integrations/pi_canvas_agent/src/runner.ts`：Pi SDK runner 和 JSONL 主循环。

### 2.3 修改现有文件

- `server.py`：注册新 route service。
- `services/http_route_dispatcher.py`：若当前项目通过 dispatcher 路由，则新增 canvas-agent 分发。
- `modules/app/appAssistantPanel.js`：从 stub 重建真实助手面板。
- `modules/app/appAssistantPanel.autoload.js`：安装真实面板。
- `modules/assistant/assistantActionExecutor.js`：保留执行逻辑，逐步移除 Claw 命名。
- `modules/assistant/assistantActionPreview.js`：扩展医生/工作流/分镜/变体/模板回执。

### 2.4 新增测试

- `canvas_agent_action_schema_test.py`
- `canvas_agent_context_service_test.py`
- `pi_runtime_service_test.py`
- `pi_bridge_service_test.py`
- `canvas_agent_route_service_test.py`
- `api/canvasAgentApi.test.js`
- `modules/assistant/assistantContextBuilder.test.js`
- `integrations/pi_canvas_agent/src/protocol.test.ts`
- `integrations/pi_canvas_agent/src/huanyingTools.test.ts`
- `tools/check_pi_canvas_agent_source_tree.py`
- `tools/run_canvas_agent_offline_regression.py`

---

## Phase 0：冻结现状与补基线

**目标：** 明确当前代码真实状态，避免把历史 Claw 文档误当作现存实现；先建立 `canvas_agent` 中性兼容层。

**退出标准：** baseline 文档存在；source preflight 存在；`CanvasAgentActionSchema` 与当前 Claw schema 行为保持一致；不触碰 `8777`。

### Task 0.1：确认 `.git` / 版本管理状态

**Files**

- Create: `docs/PI_CANVAS_AGENT_BASELINE_STATUS.md`
- Create: `tools/check_pi_canvas_agent_source_tree.py`

**Steps**

- [ ] 运行只读检查：

```powershell
git status --short
git rev-parse --show-toplevel
Test-Path -LiteralPath .git\index
python tools\check_claw_assistant_source_tree.py
```

- [ ] 写入 `docs/PI_CANVAS_AGENT_BASELINE_STATUS.md`，必须记录：
  - 每条 git 命令的原始结果。
  - `.git\index` 是否存在。
  - 当前 Claw 源码是“最小恢复态”。
  - `modules/app/appAssistantPanel*.js` 是 stub。
  - 如果 git 不可用，本阶段不做 commit，只做文件级验证并请求用户决定仓库修复方式。

- [ ] 创建 `tools/check_pi_canvas_agent_source_tree.py`，检查这些文件是否存在：

```text
services/canvas_agent_action_schema.py
services/canvas_agent_context_service.py
services/pi_bridge_service.py
services/pi_runtime_service.py
services/canvas_agent_route_service.py
integrations/pi_canvas_agent/package.json
integrations/pi_canvas_agent/src/runner.ts
integrations/pi_canvas_agent/src/protocol.ts
integrations/pi_canvas_agent/src/huanyingTools.ts
```

- [ ] 首次运行预期为 `BLOCKED`，因为 Phase 1 文件还未创建：

```powershell
python tools\check_pi_canvas_agent_source_tree.py
```

### Task 0.2：把 ClawActionSchema 包装成 CanvasAgentActionSchema

**Files**

- Create: `services/canvas_agent_action_schema.py`
- Create: `canvas_agent_action_schema_test.py`

**Tests first**

`canvas_agent_action_schema_test.py` 覆盖：

- 安全 `create_node comment` 通过。
- 未授权 `queue_generation_task ai-video` 被拒绝。
- `actionType=create_node`、`data.type=ai-text` 被修复。
- `source/target/sourceNodeId/targetNodeId/data.sourceId` 等连线别名保持现有行为。

**Implementation**

Phase 0 先保持行为完全兼容：

```python
from services.claw_action_schema import ClawActionSchema


class CanvasAgentActionSchema(ClawActionSchema):
    """Neutral canvas-agent schema wrapper around the restored Claw schema."""

    pass
```

**Verify**

```powershell
python -m unittest canvas_agent_action_schema_test.py claw_action_schema_test.py
python -m py_compile services\canvas_agent_action_schema.py
```

### Task 0.3：把 ClawContextService 包装成 CanvasAgentContextService

**Files**

- Create: `services/canvas_agent_context_service.py`
- Create: `canvas_agent_context_service_test.py`

**Tests first**

覆盖：

- 删除 `apiKey/token/secret/password/credential` 字段。
- 替换 `sk-*`、`Bearer ...`、Windows 绝对路径、`data:`、`blob:`。
- 输出 `warnings` 便于调试。

**Implementation**

```python
from services.claw_context_service import ClawContextService


class CanvasAgentContextService(ClawContextService):
    """Neutral context service for Pi canvas agent routes."""

    pass
```

**Verify**

```powershell
python -m unittest canvas_agent_context_service_test.py
python -m py_compile services\canvas_agent_context_service.py
```

---

## Phase 1：Pi sidecar POC

**目标：** 新建隔离的 Pi sidecar；Python `PiBridgeService` 通过 JSONL 发送 `{message, context, conversationId}`；先只返回纯文本 reply，不落 actions。

**退出标准：** Python 可以调用 sidecar 并拿到标准 response envelope；无 canvas action；无文件/shell 工具。

### Task 1.1：新建 `integrations/pi_canvas_agent/`

**Files**

- Create: `integrations/pi_canvas_agent/package.json`
- Create: `integrations/pi_canvas_agent/tsconfig.json`
- Create: `integrations/pi_canvas_agent/src/protocol.ts`
- Create: `integrations/pi_canvas_agent/src/protocol.test.ts`

**package.json**

```json
{
  "name": "huanying-pi-canvas-agent",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.19.0" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test dist/**/*.test.js",
    "check": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@earendil-works/pi-ai": "latest",
    "@earendil-works/pi-agent-core": "latest",
    "@earendil-works/pi-coding-agent": "latest"
  },
  "devDependencies": { "typescript": "^5.8.3" }
}
```

**Protocol contract**

`src/protocol.ts` 必须导出：

- `BridgeRequest`
- `BridgeResponse`
- `normalizeBridgeRequest(value)`
- `safeResponse(id, data)`

**Tests first**

`src/protocol.test.ts` 覆盖：

- 正常 chat request 被规范化。
- 缺少 `message` 抛错。
- `safeResponse()` 永远补齐 `actions: []`、`warnings: []`、`requiresConfirmation: false`。

**Verify**

```powershell
cd integrations\pi_canvas_agent
npm install
npm run build
npm test
```

如果网络受限，必须对 `npm install` 申请网络权限，不要改成全局安装 Pi。

### Task 1.2：实现最小 JSONL runner

**Files**

- Create: `integrations/pi_canvas_agent/src/runner.ts`

**Behavior**

- 从 stdin 读取 UTF-8 JSONL。
- 每行一个 request。
- 每个 request 返回一行 response。
- Phase 1 不调用真实模型也可以，但 runner 结构必须为后续 Pi SDK session 留出 `handleChat()` 边界。

**Minimal response**

输入：

```json
{"id":"req-1","type":"chat","message":"检查画布","context":{}}
```

输出：

```json
{"id":"req-1","type":"response","success":true,"reply":"Pi canvas agent received: 检查画布","actions":[],"warnings":[],"requiresConfirmation":false}
```

**Verify**

```powershell
cd integrations\pi_canvas_agent
npm run build
node dist\runner.js
```

手动粘贴一行 JSONL，确认 stdout 只返回一行 JSON。

### Task 1.3：新增 `PiRuntimeService`

**Files**

- Create: `services/pi_runtime_service.py`
- Create: `pi_runtime_service_test.py`

**Behavior**

- 默认 runner：`integrations/pi_canvas_agent/dist/runner.js`。
- command：`node <runner>`。
- 仅透传 Windows 基础环境：`SystemRoot/WINDIR/TEMP/TMP/PATH/COMSPEC` 等。
- 注入本地 proxy 环境：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`PI_MODEL`。
- `status()` 在 runner 不存在时返回 `configured=false/status=missing_runner`。

**Verify**

```powershell
python -m unittest pi_runtime_service_test.py
python -m py_compile services\pi_runtime_service.py
```

### Task 1.4：新增 `PiBridgeService`

**Files**

- Create: `services/pi_bridge_service.py`
- Create: `pi_bridge_service_test.py`

**Behavior**

- 构造 request id：`pi-<timestamp>-<short uuid>`。
- 通过 `subprocess.run(..., input=jsonl, capture_output=True, text=True, timeout=...)` 调用 sidecar。
- 解析 stdout 第一行 JSON。
- 校验 response id 必须等于 request id。
- 错误码：
  - `pi_timeout`
  - `pi_bridge_failed`
  - `pi_runtime_failed`
  - `pi_invalid_response`
  - `pi_response_mismatch`

**Tests first**

覆盖：

- 正常发送 JSONL 并解析 reply。
- timeout 返回 `pi_timeout`。
- stdout 非 JSON 返回 `pi_invalid_response`。
- response id 不匹配返回 `pi_response_mismatch`。

**Verify**

```powershell
python -m unittest pi_bridge_service_test.py pi_runtime_service_test.py
python -m py_compile services\pi_bridge_service.py
```

---

## Phase 2：Action Contract 迁移

**目标：** Pi 从纯文本 reply 进入 `reply/actions/warnings/requiresConfirmation`；但 actions 仍只由幻映校验和执行。

**退出标准：** Pi 可提出 actions；后端会验证并净化；未授权视频生成被拦；Pi 默认文件/shell 工具没有进入工具面。

### Task 2.1：只注册 Huanying 自定义工具

**Files**

- Create: `integrations/pi_canvas_agent/src/huanyingTools.ts`
- Create: `integrations/pi_canvas_agent/src/huanyingTools.test.ts`
- Modify: `integrations/pi_canvas_agent/src/runner.ts`

**Tool policy**

第一期只允许一个逻辑工具：`huanying_canvas_propose_actions`。

它不执行画布动作，只收集模型提出的动作并返回给 runner。禁止工具名或 action 类型中出现：

- `read_file`
- `write_file`
- `edit_file`
- `bash`
- `shell`
- `powershell`
- `browser`
- `package`
- `mcp`

**Allowed action allowlist**

```text
create_node
update_node_data
rename_node
connect_nodes
layout_nodes
move_nodes
focus_nodes
set_viewport
create_group
duplicate_nodes
queue_generation_task
run_prompt_preset_generation
create_workflow_template
```

**Tests first**

- 允许 `focus_nodes`、`create_node comment`。
- 丢弃 `run_shell`、`write_file` 形态。
- system prompt 包含“Huanying executes after validation”和“Video generation requires explicit authorization”。

**Verify**

```powershell
cd integrations\pi_canvas_agent
npm run build
npm test
```

### Task 2.2：PiBridgeService 对 actions 做后端 schema 校验

**Files**

- Modify: `services/pi_bridge_service.py`
- Extend: `pi_bridge_service_test.py`

**Behavior**

`PiBridgeService` 增加 `action_schema` 注入：

- sidecar 返回空 actions：直接返回。
- sidecar 返回 actions：调用 `action_schema.validate_actions(actions, context=context, video_authorized=False)`。
- schema invalid：返回 `success=false/errorCode=invalid_actions`。
- schema valid：返回 sanitized actions，合并 schema warnings。

**Tests first**

- fake sidecar 返回 `create_node comment`，bridge 返回 sanitized action。
- fake sidecar 返回 `run_shell`，bridge 返回 `invalid_actions`。
- fake sidecar 返回 `queue_generation_task` 指向 `ai-video`，bridge 返回 `invalid_actions`。

**Verify**

```powershell
python -m unittest pi_bridge_service_test.py canvas_agent_action_schema_test.py claw_action_schema_test.py
python -m py_compile services\pi_bridge_service.py services\canvas_agent_action_schema.py
```

### Task 2.3：新增 `/api/v2/canvas-agent/*` 路由

**Files**

- Create: `services/canvas_agent_route_service.py`
- Create: `canvas_agent_route_service_test.py`
- Modify: `server.py`
- Modify if applicable: `services/http_route_dispatcher.py`

**Routes**

- `GET /api/v2/canvas-agent/status`
- `POST /api/v2/canvas-agent/chat`
- `POST /api/v2/canvas-agent/context/preview`
- `POST /api/v2/canvas-agent/actions/validate`

**Chat request**

```json
{"message":"检查画布","conversationId":"default","mode":"actions","context":{}}
```

**Chat response**

```json
{"success":true,"reply":"...","actions":[],"warnings":[],"requiresConfirmation":false}
```

**Tests first**

- chat 委派给 bridge。
- actions/validate 委派给 schema。
- context/preview 委派给 context service。
- 空 message 返回 400。

**Verify**

```powershell
python -m unittest canvas_agent_route_service_test.py pi_bridge_service_test.py pi_runtime_service_test.py canvas_agent_action_schema_test.py canvas_agent_context_service_test.py
python -m py_compile server.py services\canvas_agent_route_service.py services\pi_bridge_service.py services\pi_runtime_service.py
```

---

## Phase 3：恢复真实助手 UI

**目标：** 重建可用的右下角助手面板、上下文构建、快捷意图、预览卡片、应用和回执。

**退出标准：** 用户能打开助手面板，发送消息，看到上下文范围，看到 actions 预览，应用已校验的低风险动作，并看到回执。

### Task 3.1：重建 `assistantContextBuilder`

**Files**

- Create: `modules/assistant/assistantContextBuilder.js`
- Create: `modules/assistant/assistantContextBuilder.test.js`

**Context fields**

```json
{
  "project": { "id": "", "name": "" },
  "canvas": {
    "nodeCount": 0,
    "edgeCount": 0,
    "nodes": [],
    "edges": []
  },
  "selection": { "selectedNodeIds": [] },
  "assets": { "items": [] },
  "workflows": { "items": [] },
  "promptPresets": { "items": [] }
}
```

**Limits**

- nodes: max 80
- edges: max 120
- selected nodes: max 20
- assets: max 30
- workflows: max 20
- prompt presets: max 40

**Redaction**

必须删除或替换：

- key 命中 `apiKey/authorization/secret/token/password/credential/file/path`
- value 命中 `Bearer ...`、`sk-*`、`data:`、`blob:`、Windows 绝对路径

**Tests first**

- 两个节点、一条边、一个选中节点能被摘要。
- secret/path/data URL 不出现在 JSON 字符串里。
- 超过上限时被截断但保留 `nodeCount/edgeCount` 原始数量。

**Verify**

```powershell
node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js
node --check modules\assistant\assistantContextBuilder.js
```

### Task 3.2：新增 `api/canvasAgentApi.js`

**Files**

- Create: `api/canvasAgentApi.js`
- Create: `api/canvasAgentApi.test.js`

**Exports**

```js
export function createCanvasAgentApi({ fetchImpl = globalThis.fetch } = {})
```

返回对象方法：

- `status()` -> `GET /api/v2/canvas-agent/status`
- `chat(payload)` -> `POST /api/v2/canvas-agent/chat`
- `validateActions(payload)` -> `POST /api/v2/canvas-agent/actions/validate`
- `previewContext(payload)` -> `POST /api/v2/canvas-agent/context/preview`

**Tests first**

- `chat()` 请求 URL 正确。
- 后端 `success=false` 时抛 Error，Error 上保留 `response`。

**Verify**

```powershell
node --test --test-concurrency=1 api\canvasAgentApi.test.js
node --check api\canvasAgentApi.js
```

### Task 3.3：重建助手面板 state core

**Files**

- Modify: `modules/app/appAssistantPanel.js`
- Extend: `modules/app/appAssistantPanel.test.js`

**Exports**

保留现有导出兼容：

- `formatAssistantPanelReceipt(...)`
- `createAppAssistantPanel(...)`

新增：

- `createAssistantPanelState({ api, buildContext, graphStore })`

**State behavior**

- `messages`: `{role, content}` 数组。
- `pendingActions`: 当前待预览 actions。
- `lastReceipt`: 最近一次应用回执。
- `sendMessage(text)`: 构建 context，调用 `api.chat({message, context, mode:'actions'})`。
- `previewText()`: 调用 `summarizeAssistantActions(pendingActions)`。
- `applyPendingActions()`: 调用后端 validate，再调用 `executeAssistantActions()`。

**Tests first**

- `sendMessage('检查画布')` 会向 API 发送 message/context。
- response actions 会进入 `pendingActions`。
- schema invalid 时不调用 executor，回执显示校验失败。
- schema valid 时调用 executor，清空 `pendingActions`。

**Verify**

```powershell
node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js
node --check modules\app\appAssistantPanel.js
```

### Task 3.4：实现 DOM 面板和 autoload

**Files**

- Modify: `modules/app/appAssistantPanel.js`
- Modify: `modules/app/appAssistantPanel.autoload.js`
- Extend: `modules/app/appAssistantPanel.autoload.test.js`

**UI requirements**

- 右下角浮动入口按钮。
- Dock 面板：消息列表、输入框、发送按钮。
- 快捷意图：`检查画布`、`整理画布`、`搭建工作流`、`分镜导演`、`变体分支`。
- 上下文徽标：节点数、选中节点数、当前 mode。
- actions 预览区：显示 summary 和展开详情。
- 应用按钮：只对 pending actions 显示。
- 回执区：显示创建节点、连线、布局、生成任务、视频确认提示。

**CSS class prefix**

统一使用：

- `.canvas-agent-entry`
- `.canvas-agent-panel`
- `.canvas-agent-messages`
- `.canvas-agent-input`
- `.canvas-agent-preview`
- `.canvas-agent-apply`
- `.canvas-agent-receipt`

**Autoload behavior**

`installAppAssistantPanel(deps)`：

- Node/test 环境无 `document` 时返回 `null`。
- 浏览器环境创建 panel 并执行 `init()`。
- 不探测 `8777`，状态查询只在用户打开面板后执行。

**Verify**

```powershell
node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js
node --check modules\app\appAssistantPanel.js modules\app\appAssistantPanel.autoload.js
```

---

## Phase 4：恢复 Claw 历史能力

**目标：** 在 Pi 内核上恢复 Claw 历史开发目标：画布医生、自动整理、一句话工作流、`story_to_video`、分镜导演、变体分支、工作流模板强确认。

**退出标准：** 每个能力都有离线 schema/executor/preview/receipt 测试；不通过 live 成功来替代离线证据。

### Task 4.1：画布医生 + 自动整理

**Files**

- Modify: `integrations/pi_canvas_agent/src/huanyingTools.ts`
- Modify: `services/canvas_agent_action_schema.py`
- Extend: `canvas_agent_action_schema_test.py`
- Extend: `modules/assistant/assistantActionPreview.test.js`
- Extend: `modules/assistant/assistantActionExecutor.test.js`

**Canvas doctor allowed actions**

- `create_node` with `nodeType=comment` or `source-text`
- `focus_nodes`
- `set_viewport`
- `layout_nodes` only when user asks to organize after diagnosis

**Diagnostic metadata**

- `diagnosticKind`
- `diagnosticSeverity`
- `diagnosticNodeId`
- `diagnosticNodeIds`
- `diagnosticIssue`
- `diagnosticSuggestion`

**Auto-layout allowed actions**

- `layout_nodes`
- `move_nodes`
- `create_group`
- `rename_node`
- `focus_nodes`
- `set_viewport`

**Forbidden in doctor/layout**

- `queue_generation_task`
- `run_prompt_preset_generation`
- prompt/model/assets destructive update
- deletion
- shell/file/network operation

**Layout strategies**

- `single_chain`
- `branch_flow`
- `storyboard_grid`
- `asset_lane`
- `problem_lane`

**Acceptance**

- “检查画布”返回 3-8 条问题或解释无明显问题。
- 问题注释能落在画布上并可撤销。
- “整理画布”只移动/布局/分组/聚焦，不改 prompt/model/assets。

### Task 4.2：一句话工作流 MVP

**Workflow kinds**

- `text_to_image`
- `image_to_video`
- `text_to_image_video`
- `image_variants`
- `story_to_video`

**Required fields**

- `workflowKind`
- `workflowGroupId`
- `workflowStep`
- `workflowReason`

**Expected behavior**

- “搭一个文生图生视频工作流”创建 `source-text -> ai-image -> ai-video`。
- 默认不自动生成视频。
- 新节点不堆叠；缺失坐标时 executor 使用非重叠 fallback。
- Same-batch action id 可作为后续 `connect_nodes/layout_nodes/focus_nodes` 引用。

**Acceptance**

- schema 修复 action aliases。
- executor 解析 same-batch action ids。
- preview/receipt 明确“创建结构”和“视频生成需确认”。

### Task 4.3：`story_to_video`

**Expected structure**

- 1 个 `ai-text` story outline。
- 1 个 `ai-text` style bible。
- N 个 `ai-text` shot script。
- N 个 `ai-image` shot keyframe。
- N 个 `ai-video` shot video prep。

**Shot metadata**

- `storyDurationSec`
- `shotIndex`
- `shotDurationSec`
- `shotTitle`
- `shotPrompt`
- `shotVideoPrompt`

**Acceptance**

- 用户说“故事短片 / 故事视频 / 15 秒短片 / 做成视频故事”优先走 `story_to_video`。
- 每个镜头有 `shotIndex`。
- `storyboard_grid` 布局：outline/style 在左侧，shot script/keyframe/video prep 按行排列。
- 文本/图片生成可入队；视频生成不自动执行。

### Task 4.4：分镜导演模式

**Safe metadata**

- `storyboardId`
- `shotIndex`
- `shotTitle`
- `shotVisual`
- `shotCamera`
- `shotStyle`
- `shotPrompt`
- `shotContinuity`

**Acceptance**

- 脚本拆成 3-8 个 shot groups。
- 每组包含 shot script / keyframe / video prep。
- preview 显示镜头数量、关键图数量、视频准备节点数量。
- receipt 不暗示视频已生成。

### Task 4.5：变体分支

**Required behavior**

- 复制选中子图 3-5 条分支。
- 每条分支创建 group。
- 使用 `branch_flow` 布局。
- 每条分支有差异说明 comment/source-text。
- 不覆盖原节点 prompt，除非用户明确要求且强确认。

**Acceptance**

- 原始节点不变。
- 分支可聚焦、可撤销。
- 文本/图片生成只在用户明确要求生成变体时执行。

### Task 4.6：工作流模板预览 / 强确认

**Action**

```json
{"type":"create_workflow_template","name":"故事短片模板","nodeIds":["node-1","node-2"],"metadata":{"templateKind":"story_to_video"},"riskLevel":"high","requiresConfirmation":true}
```

**Acceptance**

- 当前只做预览和强确认，不把模板保存伪装成已完成。
- schema 要求 `name` 和 `nodeIds/nodes`。
- preview/receipt 显示高风险确认原因。

**Phase 4 verify**

```powershell
python -m unittest canvas_agent_action_schema_test.py
node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js
```

---

## Phase 5：生成权限与 live 校准

**目标：** 文本/图片低风险自动运行；视频生成强确认；renderer mount pending 状态不丢；每个 live 失败进入本地回归。

**退出标准：** schema、executor、preview、scorecard 对生成权限结论一致；live 校准只在用户明确准备 `8777` 后进行。

### Task 5.1：renderer mount pending 状态保留

**Files**

- Modify: `modules/assistant/assistantActionExecutor.js`
- Extend: `modules/assistant/assistantActionExecutor.test.js`

**Behavior**

- `queue_generation_task` 或 `run_prompt_preset_generation` 到达时，先写入节点 `generationStatus="queued"`、`jobStatus="queued"`。
- 如果 `window.__v2RendererBridge.nodeInstances.get(nodeId)` 暂不存在，不判定失败。
- result 返回 `queuedGenerationNodeIds`，但不加入 `startedGenerationNodeIds`。
- warnings 可包含 `generation pending renderer mount`。

**Tests first**

- `ai-image` renderer 未挂载时保持 queued/pending。
- `ai-text` renderer 已挂载时调用 `_onGenerate(prompt, task)`。
- `run_prompt_preset_generation` 传递完整 task 作为第二参数。

### Task 5.2：文本/图片低风险自动运行

**Allowed auto-run**

- `queue_generation_task` targeting `ai-text`
- `queue_generation_task` targeting `ai-image`
- `run_prompt_preset_generation` targeting `ai-text`
- `run_prompt_preset_generation` targeting `ai-image`

**Required metadata**

Executor 更新节点数据时写入：

- `generationRequestedBy="canvas_agent"`
- `generationStatus="queued"`
- `jobStatus="queued"`
- `prompt`
- `presetId/presetName/template/inputs` if present

**Acceptance**

- 文本/图片生成路径走真实节点 generation handler。
- 不把 slash preset 模板全文写回输入框，保持隐藏模板执行语义。
- 失败显示在助手回执，不吞错误。

### Task 5.3：视频生成强确认

**Backend schema**

- 当 action 显式 `nodeType=ai-video` 且 `video_authorized=False`，拒绝。
- 当 action 省略 `nodeType`，但目标 nodeId 在 current context 或 same-batch created nodes 中是 `ai-video`，拒绝。
- `run_prompt_preset_generation` 指向视频节点同样拒绝。

**Frontend executor**

- 即使 action 绕过 backend 或省略 `nodeType`，也从 graphStore 推断 target node type。
- target 是 `ai-video` 时只加入 warning，不调用 generation runner。

**Scorecard**

- 任意 unauthorized video generation 直接安全失败。
- 创建 `ai-video` 准备节点不算失败，启动视频生成才失败。

### Task 5.4：live 校准流程

Live 校准只在用户明确说可以使用当前 `8777` 后执行。

**Manual flow**

1. 用户手动重启 `8777`。
2. 用户刷新浏览器。
3. 开发者只发送一个明确 case。
4. 保存原始响应到 `docs/assistant_live_cases/YYYY-MM-DD-case-name.json`。
5. 运行 scorecard。
6. 如果失败，先写本地 failing test，再修 schema/executor/preview/runner。

**Commands**

```powershell
python tools\score_assistant_live_run.py docs\assistant_live_cases\YYYY-MM-DD-case-name.json
python tools\run_canvas_agent_offline_regression.py
```

**Live acceptance cases**

- “检查画布”：无生成、可标注/聚焦。
- “整理画布”：只移动/布局/分组/聚焦。
- “搭一个文生图生视频工作流”：创建结构，视频不生成。
- “做一个 15 秒故事短片”：`story_to_video` 结构完整，文本/图片可生成，视频只准备。
- “给选中图做 3 个风格变体”：不改原图，分支清晰，图片生成权限正确。

---

## Phase 6：打包与发布

**目标：** 普通用户不需要全局安装 Pi 或 Node；runtime/source/license/lockfile/source preflight 进入离线回归。

**退出标准：** 发布包包含 sidecar 源码、构建产物、依赖锁、许可证；离线回归缺任何关键文件都会失败。

### Task 6.1：锁定 sidecar 依赖

**Files**

- Create: `integrations/pi_canvas_agent/package-lock.json`
- Create: `integrations/pi_canvas_agent/LICENSES.md`
- Build: `integrations/pi_canvas_agent/dist/runner.js`

**Commands**

```powershell
cd integrations\pi_canvas_agent
npm ci
npm run build
npm test
```

**Acceptance**

- `npm ci` 可以从 lockfile 复现。
- `dist/runner.js` 可以被 `PiRuntimeService` 找到。
- `LICENSES.md` 记录 Pi 包和直接依赖的许可证来源。

### Task 6.2：Windows runtime 策略

优先级：

1. Release 包内带可用 Node 22+ runtime，执行 `node.exe integrations\pi_canvas_agent\dist\runner.js`。
2. 如果可稳定打包，再评估单文件 sidecar exe。
3. 开发者环境 fallback：本机 Node 22+，状态接口显示 `developer_node_runtime`。

禁止：

- 要求普通用户 `npm install -g`。
- 要求普通用户全局安装 Pi。
- 运行时首次联网下载 sidecar 依赖。

### Task 6.3：离线回归总入口

**Files**

- Create: `tools/run_canvas_agent_offline_regression.py`
- Create: `canvas_agent_offline_regression_runner_test.py`

**Runner steps**

- Python schema tests。
- Python bridge/runtime/route/context tests。
- Python syntax checks。
- JS context/preview/executor/panel/api tests。
- JS syntax checks。
- Pi sidecar build/test，如果 node/npm 可用。
- `tools/check_pi_canvas_agent_source_tree.py`，Phase 1 后设为 blocking。

**Expected output**

```text
[canvas-agent] python tests: OK
[canvas-agent] python syntax: OK
[canvas-agent] frontend tests: OK
[canvas-agent] frontend syntax: OK
[canvas-agent] pi sidecar tests: OK
[canvas-agent] source preflight: OK
[canvas-agent] offline regression: OK
```

---

## Verification Matrix

| Area | Command | Required Before |
|---|---|---|
| Canvas schema | `python -m unittest canvas_agent_action_schema_test.py claw_action_schema_test.py` | Phase 0+ |
| Context redaction | `python -m unittest canvas_agent_context_service_test.py` | Phase 0+ |
| Pi bridge/runtime | `python -m unittest pi_bridge_service_test.py pi_runtime_service_test.py` | Phase 1+ |
| Canvas routes | `python -m unittest canvas_agent_route_service_test.py` | Phase 2+ |
| Frontend context | `node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js` | Phase 3+ |
| Frontend preview/executor | `node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js` | Phase 2+ |
| Assistant panel | `node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` | Phase 3+ |
| Pi sidecar | `cd integrations\pi_canvas_agent; npm run build; npm test` | Phase 1+ |
| Full offline | `python tools\run_canvas_agent_offline_regression.py` | Phase 6 |

---

## Risk Register

| Risk | Symptom | Prevention | Regression Owner |
|---|---|---|---|
| Pi SDK API drift | TypeScript build fails after dependency update | Isolate SDK calls in `runner.ts`; lock `package-lock.json` | Pi sidecar tests |
| Unsafe Pi tools enabled | Agent asks to read/write files or run shell | Tool allowlist only exposes Huanying custom tools | `huanyingTools.test.ts` |
| API key exposure | Real key appears in sidecar env/log/context | Provider proxy only; context redaction; env allowlist | context/runtime tests |
| Windows command length | Long prompt fails before model call | JSONL stdin protocol, no CLI prompt argument | bridge tests |
| Source disappearance | Regression passes with missing source | blocking source preflight | offline runner |
| Video auto-generation | Unexpected video task starts | backend schema + frontend inferred node type guard | schema/executor/scorecard |
| Renderer mount race | Text/image generation silently fails | queued/pending state and retry-friendly runner result | executor tests |
| Stub UI mistaken as done | Status says assistant exists but panel unusable | Phase 3 panel tests and baseline doc | panel tests |
| Git invalidity | Cannot commit/diff safely | Phase 0 baseline status and user decision | baseline doc |

---

## Implementation Order

1. 完成 Phase 0，确认版本管理和最小恢复态。
2. 完成 Phase 1，证明 JSONL sidecar bridge 可用。
3. 完成 Phase 2，迁移 action contract 并建立后端校验。
4. 完成 Phase 3，恢复真实 UI，再开始用户体验验收。
5. Phase 4 按能力逐个恢复，每个能力都有离线测试。
6. Phase 5 只在用户允许时做 live 校准。
7. Phase 6 在离线和 live 安全门稳定后做发布打包。

---

## Self-Review Checklist

- 方案保持 A 路线：Pi SDK runner + Python JSONL bridge。
- 文档把当前 Claw 代码定义为最小恢复态，没有假设旧 UI 仍存在。
- 每个阶段都有目标、文件、测试、退出标准。
- 文档继承 Claw 的产品目标，但不继承旧 Claw CLI runtime 路线。
- 文档明确禁用 Pi 文件/shell/包扩展等高风险工具。
- 文档保留幻映 schema、预览、执行和生成权限边界。
- 文档明确视频生成强确认。
- 文档规定 live 失败必须先进入回归。
- 文档包含 packaging、lockfile、license、source preflight。
