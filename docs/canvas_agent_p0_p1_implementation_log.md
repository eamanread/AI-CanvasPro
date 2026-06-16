# Canvas Agent P0/P1 实现日志

日期：2026-06-03
范围：Sprint 1 + P0/P1 底座

## 已落地内容

### 协议与流式

- 新增 `modules/assistant/assistantProtocol.js`
  - 固定 `CANVAS_AGENT_PROTOCOL_VERSION = "2026-06-03"`。
  - 定义 stream event：`message.start`、`message.delta`、`message.done`、`action.proposed`、`warning`、`tool.status`、`error`、`receipt`。
  - 统一 request/response normalize。
- 新增 `modules/assistant/assistantStreamingClient.js`
  - 支持 async iterable、JSONL response、SSE response。
  - 文本 delta 可流式累积。
  - `action.proposed` 可先到，`message.done` 不会清空已提出 actions。
  - streaming warning 不会被空 final frame 覆盖。
  - stream error event 会 fail closed。
- `api/canvasAgentApi.js`
  - 新增 `chatStream(payload, handlers)`。
  - `/chat/stream` 不可用时回退 `/chat`，避免真实后端未升级时打断旧助手闭环。

### 面板状态机

- `modules/app/appAssistantPanel.js`
  - `sendMessage(text, { onUpdate })` 支持流式更新。
  - 面板 `handleSend` 把 `render` 作为 `onUpdate`，delta 到达时立即重绘。
  - 状态字段：`status`、`streaming`、`lastWarnings`、`lastResponse`。
  - 非流式旧 `api.chat` 路径保留。
  - 失败时状态从 `streaming/sending` 进入 `failed`，避免 UI 卡死。

### Action contract / 风险 / 确认

- 新增 `modules/assistant/assistantActionContract.js`
  - action envelope：`schemaVersion`、`actionId`、`riskLevel`、`requiresConfirmation`、`metadata`。
  - 本地风险推断：low / medium / high。
  - Agent 不能通过 `requiresConfirmation:false` 降低本地高风险动作确认要求。
- 新增 `modules/assistant/assistantConfirmationPolicy.js`
  - 低风险默认自动。
  - 中风险普通确认。
  - 视频生成、高风险模板、删除/恢复等强确认。
- `services/claw_action_schema.py`
  - 保留 envelope 字段。
  - 保留 provenance metadata：`source`、`conversationId`、`messageId`、`traceId`、`assistantIntent`。

### 会话历史底座

- 新增 `modules/assistant/assistantConversationStore.js`
  - localStorage 可插拔持久化。
  - 保存 messages、contextSnapshots、transactions、receipts、generationTasks。
  - 支持 create/list/get/rename/delete/search/export。
- 新增 `services/canvas_agent_conversation_service.py`
  - 后端 JSON 文件会话服务底座。
  - 暂未接入 dispatcher，等待 CodeGraph 解锁后按现有路由结构安全接入。
- `modules/app/appAssistantPanel.js`
  - 发送前自动创建会话。
  - 每轮保存 user message、context snapshot、assistant message、proposed transaction。
  - apply 后保存 receipt。
  - 新会话按钮可创建并切换会话。
  - 复制按钮可复制/展示 conversationId。
  - 历史按钮可打开历史列表并恢复消息。
- `modules/app/appAssistantPanel.autoload.js`
  - 默认注入 `createAssistantConversationStore()`，保持可覆盖。

### 附件与参考图底座

- 新增 `modules/assistant/assistantAttachmentStore.js`
  - 支持 image/video/document 附件。
  - 支持 uploader adapter。
  - `toContext()` 只输出安全摘要。
  - 本地 Windows 路径、`blob:`、`data:` 不进入 agent context。
- `modules/app/appAssistantPanel.js`
  - 请求中加入 `attachments: state.attachments()`。
  - 上传按钮打开文件选择，先生成本地附件 chip。
  - chip 点击可移除附件。

### 模型选择底座

- 新增 `modules/assistant/assistantModelRegistry.js`
  - 从统一 API Key config 的 `providers` 构造模型能力矩阵。
  - 支持默认 agent 模型选择。
  - 支持按 assistantIntent 推荐模型。
  - 支持 reference image 数量 gate。
- `modules/app/appAssistantPanel.js`
  - 请求中加入 `model: state.selectedModel`。
  - Agent pill 可循环切换注入的 `modelOptions`。

### 真实网页截图验证

- 新增 `tools/assistant_panel_live_screenshot_check.mjs`
  - 打开真实页面。
  - 点击右下角 `#fabBtn` 或 `.hy-canvas-agent-launcher`。
  - 等待 RH 面板出现。
  - 校验标题、技能入口、上传入口、模型按钮、历史层。
  - 输出 PNG 到 `output/regression`。
  - 浏览器 console error 会导致验证失败。

## 新增/修改测试

新增：

- `modules/assistant/assistantProtocol.test.js`
- `modules/assistant/assistantStreamingClient.test.js`
- `modules/assistant/assistantActionContract.test.js`
- `modules/assistant/assistantConfirmationPolicy.test.js`
- `modules/assistant/assistantConversationStore.test.js`
- `modules/assistant/assistantAttachmentStore.test.js`
- `modules/assistant/assistantModelRegistry.test.js`
- `modules/app/appAssistantPanel.streaming.test.js`
- `modules/app/appAssistantPanel.context.test.js`
- `modules/app/appAssistantPanel.p1Ui.test.js`
- `api/canvasAgentApi.streaming.test.js`
- `canvas_agent_action_schema_envelope_test.py`
- `canvas_agent_conversation_service_test.py`

建议验证命令：

```bash
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantModelRegistry.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js api\canvasAgentApi.streaming.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.test.js
```

```bash
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test
```

真实网页截图验证：

```bash
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression
```

## 当前环境阻塞

本轮尝试运行测试时，PowerShell 宿主启动阶段报：

```text
HRESULT: 0x800705AF
```

并且一次补丁过程中出现过 Windows pagefile 相关错误：

```text
os error 1455: 页面文件太小，无法完成操作
```

CodeGraph MCP 当前也持续返回：

```text
database is locked
```

因此本轮已完成代码和测试落库，但尚未能在当前宿主内实际执行 Node/Python 测试和 Playwright 截图脚本。等环境恢复后，应优先运行上面的三个验证命令。

## 下一步建议

1. 恢复 CodeGraph：释放 `.codegraph` 锁或重启 CodeGraph MCP，再用 `codegraph_context` 复查 dispatcher/server 路由。
2. 运行新增前端/后端测试，修复可能的语法或行为回归。
3. 运行真实网页截图验证，保存 PNG 路径。
4. 安全接入后端 conversation routes。
5. 安全接入 `/api/v2/canvas-agent/chat/stream` 后端 streaming route。
6. 继续实现 P1：完整历史抽屉、附件 uploader adapter、模型 selector 弹层、action preview 分组和逐条确认。



---

## 2026-06-03 execution update: ordered steps 1-5

### Step 1 - CodeGraph and command baseline
- CodeGraph MCP status is available for `D:\Aic\huanying-source-windows-20260430-122116` with 491 indexed files.
- Removed stale `.codegraph\codegraph.db.lock` and ran `codegraph sync` successfully.
- Git metadata folder exists and `HEAD` points at `refs/heads/OpenHuman`, but normal `git status` still reports the repository as invalid in this harness; treat version-state inspection as an environment risk and do not rely on git output here.

### Step 2 - Regression tests and fixes
- Fixed P1 assistant panel UI regressions in `modules/app/appAssistantPanel.js`.
- Added/extended coverage in `modules/app/appAssistantPanel.p1Ui.test.js`, `modules/app/appAssistantPanel.autoload.test.js`, and `tools/assistant_panel_live_screenshot_check.test.mjs`.
- Frontend focused regression passed: 79 tests, 0 failures.
- Backend focused regression passed: 71 tests, 0 failures.

### Step 3 - Real webpage screenshot validation
- Updated `tools/assistant_panel_live_screenshot_check.mjs` to ignore generic host-page resource 404 noise while still failing on JS runtime errors, assistant module failures, and `/api/v2/canvas-agent/*` route failures.
- Real Huanying page validation passed with Chrome and local server on `http://127.0.0.1:8777`.
- Latest screenshot artifact: `output\regression\assistant-panel-live-2026-06-03T03-18-19-968Z.png`.

### Step 4 - Backend conversation and stream routes
- Confirmed `services/canvas_agent_route_service.py` exposes `/api/v2/canvas-agent/chat/stream` and `/api/v2/canvas-agent/conversations*` routes.
- Confirmed `services/http_route_dispatcher.py` delegates GET/POST/PATCH/DELETE canvas-agent conversation routes and stream chat route.
- Confirmed `server.py` wires `CanvasAgentConversationService` into `CanvasAgentRouteService`.
- Focused backend route tests passed: `canvas_agent_route_service_test`, `http_route_dispatcher_test`, and `canvas_agent_conversation_service_test`.

### Step 5 - P1 UI implementation
- History drawer now supports search, row rendering, delete action, and restore state reset.
- Attachment flow now uses an uploader adapter when configured and falls back to local reference chips when no uploader exists.
- Model selector now opens a dropdown, preserves old cycle behavior, selects injected model options, and receives unified API-key provider config via `appAssistantPanel.autoload` without exposing secrets in UI text.
- Grouped action preview now uses local action preview model and blocks high-risk/video batches until strong confirmation is explicitly accepted.

### Verification evidence
```bash
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionPreviewModel.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js api\canvasAgentApi.streaming.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.test.js tools\assistant_panel_live_screenshot_check.test.mjs
# 79 tests, 79 pass, 0 fail
```

```bash
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_route_service_test http_route_dispatcher_test canvas_agent_context_service_test
# Ran 71 tests, OK
```

```bash
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
# success=true, screenshotPath=output\regression\assistant-panel-live-2026-06-03T03-18-19-968Z.png
```

---

## R1-R4 Completion Evidence - 2026-06-03

### R4 backend unified model/key config

- `services/canvas_agent_route_service.py` now accepts unified provider aliases: `endpoint`, `baseUrl`, `defaultModel`, `modelName`, `apiKeyConfigured`, `proxyTokenConfigured`, and `tokenConfigured`.
- `/api/v2/canvas-agent/status` returns only sanitized provider summary fields and strips URL userinfo/query/fragment before exposing endpoint data.
- `/api/v2/canvas-agent/chat` and `/chat/stream` pass only sanitized model references to the bridge.
- `services/pi_bridge_service.py` includes optional sanitized `model` in JSONL requests and drops API keys, tokens, endpoints, and other secret/config fields.

### Verification

```bash
python -m unittest canvas_agent_route_service_test pi_bridge_service_test
# Ran 38 tests, OK
```

```bash
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantModelRegistry.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantContextBuilder.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js api\canvasAgentApi.streaming.test.js api\canvasAgentApi.test.js tools\assistant_panel_live_screenshot_check.test.mjs
# 110 tests, 110 pass, 0 fail
```

```bash
python -m unittest canvas_agent_action_schema_envelope_test canvas_agent_conversation_service_test canvas_agent_action_schema_test canvas_agent_route_service_test pi_bridge_service_test canvas_agent_context_service_test http_route_dispatcher_test
# Ran 65 tests, OK
```

```bash
D:\Aic\node.exe tools\assistant_panel_live_screenshot_check.mjs --url http://127.0.0.1:8777 --out output\regression --browser-executable "C:\Program Files\Google\Chrome\Application\chrome.exe"
# success=true, screenshotPath=D:\Aic\huanying-source-windows-20260430-122116\output\regression\assistant-panel-live-2026-06-03T09-56-46-997Z.png
```

```powershell
Select-String scoped assistant/backend/docs files -Pattern 's[k]-'
# TOTAL 0
```

### Completed scope

- R1 streaming conversation protocol and frontend stream state.
- R2 validated action contract, preview, confirmation, executor, and receipts.
- R3 conversation persistence, restore, history drawer, export redaction, and pending action preservation.
- R4 unified model/API-key configuration, disabled model guard, model selector, backend provider aliasing, and bridge model sanitization.

### Next scope

- R5 live screenshot expansion: cover send/stream/preview/apply/history/model-dropdown in one browser journey.
- R6 Canvas Doctor and scorecard-driven layout diagnostics.
- R7 Auto Layout and one-click canvas cleanup.
- R8 one-sentence workflow / story-to-video / variants with strong confirmation gates.
---

## R5 Live Calibration Evidence - 2026-06-03

- Frontend regression: pass, `D:\Aic\node.exe --test ...`, 125/125 tests passed.
- Backend regression: pass, `python -m unittest ...`, 76 tests passed, OK.
- R5 basic live journey: pass, artifact dir `output\regression\assistant-live\assistant-live-2026-06-03T12-03-58-514Z`.
- R5 generation permission journey: pass, artifact dir `output\regression\assistant-live\assistant-live-2026-06-03T12-04-05-416Z`.
- R5 invalid delta-actions journey: pass, artifact dir `output\regression\assistant-live\assistant-live-2026-06-03T12-04-10-949Z`.
- Secret scan: `TOTAL 0`.
- Completed scope: deterministic fixture runner, artifact sanitizer, R5 scorecard, live fixture injection, generation permission gate, pending-state persistence, failure-to-regression bundle, R5 regression runner.
- Noted live regression fix: R5 journey input selector is scoped to `.hy-canvas-agent-panel .hy-canvas-agent-input` so hidden host textareas cannot steal the run.
- Next scope: R6 Canvas Doctor scorecard and R7 Auto Layout live diff.
