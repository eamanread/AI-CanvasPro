# LLM Wiki 接入 Claw Code 助手实现接力文档

更新时间：2026-05-23

相关方案文档：

- `docs/LLM_WIKI_CLAW_ASSISTANT_INTEGRATION_PLAN.md`
- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`

## 1. 当前决策

LLM Wiki 作为 Claw Code 助手的只读知识工具接入，不直接放进画布 API。

第一阶段目标是“可查询、可降级、可脱敏、可被 Claw 感知”，不是“把知识直接写进画布”。

核心边界：

- LLM Wiki API token 可选；如果填写，只保存在幻映后端。
- Claw 不直接裸连 LLM Wiki 本地端口。
- 幻映后端提供 `/api/v2/assistant/wiki/*` 受控代理。
- 普通 Claw 对话不自动写入 LLM Wiki。
- 写入、归档、Deep Research、资料重扫都放到后续阶段，并且必须用户确认。
- 第一阶段不修改画布 action schema，也不新增画布执行能力。

## 2. 外部能力依据

来自 LLM Wiki README_CN.md 的可接入能力：

| 能力 | README 信息 |
|---|---|
| 本地 API 地址 | 示例为 `http://127.0.0.1:19828` |
| 鉴权 | 可选 Token 鉴权；本地服务未开启鉴权时可留空 |
| 健康检查 | `GET /api/v1/health` |
| 项目列表 | `GET /api/v1/projects` |
| 文件列表 | `GET /api/v1/projects/{id}/files` |
| 文件内容 | `GET /api/v1/projects/{id}/files/content` |
| 搜索 | `POST /api/v1/projects/{id}/search` |
| 知识图谱 | `GET /api/v1/projects/{id}/graph` |
| 重扫源资料 | `POST /api/v1/projects/{id}/sources/rescan` |

注意：

- 实现前需要用真实本地 LLM Wiki 实例或 mock 校准具体请求/响应字段。
- 第一阶段只依赖 health/projects/search/content，graph 可以作为可选只读接口。
- 不要在开发侧擅自启动、停止、重启用户的 LLM Wiki 服务。

## 3. 当前状态

| 项 | 状态 |
|---|---|
| 方案文档 | 已创建 |
| 实现文档 | 已创建 |
| 后端 bridge service | 第一阶段只读桥接已实现 |
| 后端 assistant wiki routes | 第一阶段只读路由已实现 |
| LLM Wiki 配置项 | 已实现前端配置读写和状态测试入口 |
| Claw prompt 工具说明 | 第一阶段只读知识规则已实现 |
| Claw 知识查询闭环 | 已实现意图触发的只读预检索 |
| 前端设置 UI | 已实现 LLM Wiki 知识库卡片 |
| 画布落地 action | 协议层已开始：Claw prompt 已指导使用现有 `create_node` 创建 `comment` / `source-text`；未新增新 action |
| 写回 LLM Wiki | 未开始，非第一阶段范围 |

## 4. 推荐第一阶段切片

名称：LLM Wiki Claw Assistant Readonly Bridge Slice

目标：

- 建立受控只读桥接。
- 让 Claw 知道可用知识工具。
- 不影响现有画布 API 和画布 action。

建议阶段：

### Phase 1：配置和状态

新增配置结构：

```json
{
  "integrations": {
    "llm_wiki": {
      "enabled": true,
      "apiBaseUrl": "http://127.0.0.1:19828",
      "apiToken": "",
      "defaultProjectId": "",
      "requestTimeoutSec": 20,
      "maxSearchResults": 8,
      "maxContentChars": 6000
    }
  }
}
```

验收：

- 后端能读取配置。
- 状态响应只显示 `apiTokenPresent`，不返回 token。
- `apiToken` 可留空；空 token 时后端不发送 `Authorization` header。
- 未配置 `apiBaseUrl` 时状态稳定返回 `unconfigured`，不影响 `/api/v2/assistant/chat`。

### Phase 2：Bridge Service

新增建议文件：

- `services/llm_wiki_bridge_service.py`
- `llm_wiki_bridge_service_test.py`

建议 service 方法：

| 方法 | 用途 |
|---|---|
| `build_status()` | 返回配置/可用性摘要 |
| `list_projects()` | 代理项目列表 |
| `search(project_id, query, limit)` | 代理搜索并标准化结果 |
| `get_file_content(project_id, file_id, max_chars)` | 读取内容并限长脱敏 |
| `get_graph(project_id, limit)` | 可选，读取图谱摘要 |

脱敏要求：

- API token（可选）
- Bearer token
- OpenAI 风格 key
- Windows/macOS/Linux 绝对路径
- `data:` URL
- `blob:` URL
- secret/key/token/password/credential 字段

### Phase 3：Assistant Wiki Routes

建议在现有 assistant route service 下挂独立子路由：

| Huanying route | LLM Wiki 对应 |
|---|---|
| `GET /api/v2/assistant/wiki/status` | health/config |
| `GET /api/v2/assistant/wiki/projects` | projects |
| `POST /api/v2/assistant/wiki/search` | project search |
| `POST /api/v2/assistant/wiki/file-content` | file content |
| `POST /api/v2/assistant/wiki/graph` | graph，可选 |

请求错误要统一成：

```json
{
  "success": false,
  "errorCode": "LLM_WIKI_UNAVAILABLE",
  "message": "..."
}
```

建议错误码：

| 错误码 | 场景 |
|---|---|
| `LLM_WIKI_DISABLED` | 功能未开启 |
| `LLM_WIKI_UNCONFIGURED` | 缺 baseUrl 或缺项目 id（搜索/内容读取时） |
| `LLM_WIKI_UNAVAILABLE` | health 失败或连接失败 |
| `LLM_WIKI_AUTH_FAILED` | 401/403 |
| `LLM_WIKI_BAD_RESPONSE` | 响应非预期 JSON |
| `LLM_WIKI_REQUEST_FAILED` | 其他上游错误 |

### Phase 4：Claw Prompt 协议

在 `services/claw_bridge_service.py` 的 prompt/action protocol 里补充知识工具说明。

第一阶段建议只声明能力，不让模型直接生成裸 HTTP 调用：

```json
{
  "knowledgeTools": {
    "llmWiki": {
      "available": true,
      "mode": "readonly",
      "routes": [
        "assistant/wiki/status",
        "assistant/wiki/search",
        "assistant/wiki/file-content"
      ],
      "rules": [
        "Use LLM Wiki only for project knowledge lookup.",
        "Do not store normal chat messages in LLM Wiki.",
        "Do not claim citations unless they came from LLM Wiki results.",
        "Do not trigger writes, rescans, or research without explicit user confirmation."
      ]
    }
  }
}
```

是否让 Claw runtime 真正发工具请求，需要看当前 Claw 工具调用形态。若第一期不做 runtime tool execution，可以先把 LLM Wiki 搜索结果作为后端增强 context 注入给 Claw。

### Phase 5：前端最小 UI

第一阶段可选做一个设置入口：

- 是否启用 LLM Wiki
- API Base URL
- API Token（可选）
- 默认 Project
- 状态测试按钮

如果为了不影响你当前 UI 开发，也可以第一阶段只做后端配置和 API，前端设置放到下一切片。

## 5. 关键实现注意事项

### 5.1 不要污染画布 API

不要新增类似 `/api/v2/canvas/wiki/*` 的路由。

推荐所有知识相关路由都在 assistant 命名空间下：

```text
/api/v2/assistant/wiki/*
```

### 5.2 不要自动写知识库

禁止第一阶段调用：

- rescan
- write page
- import source
- Deep Research trigger
- save conversation

### 5.3 不要自动保存对话

普通助手对话只属于 Claw/幻映会话，不进入 LLM Wiki。

如果未来需要沉淀，必须有用户明确指令：

- “保存到知识库”
- “归档这个结论”
- “把这组分镜写入当前项目资料”

### 5.4 对 LLM Wiki 返回内容做二次净化

即使 LLM Wiki 自身是本地可信服务，幻映 bridge 仍要净化返回内容。原因是资料可能来自用户本地文件和网页，里面可能包含路径、token、账号信息。

### 5.5 限制返回体大小

建议默认限制：

- 搜索结果最多 8 条。
- 单条 snippet 最多 800 字符。
- 文件内容最多 6000 字符。
- 图谱节点最多 80 个、边最多 160 条。

超限时返回 warnings。

## 6. 测试清单

### 后端 service 测试

- 未启用时状态为 disabled。
- 缺 baseUrl 时状态为 unconfigured；token 为空时仍可连接无鉴权的本地 LLM Wiki。
- baseUrl 非 loopback 时默认拒绝。
- health 成功时返回 available。
- health 连接失败时返回 unavailable。
- 上游 401/403 映射为 `LLM_WIKI_AUTH_FAILED`。
- 搜索结果被标准化和限长。
- 返回内容中的敏感值被脱敏。

### Route 测试

- `/api/v2/assistant/wiki/status` 能返回成功响应。
- `/api/v2/assistant/wiki/search` 缺 query 返回 400。
- `/api/v2/assistant/wiki/search` 缺 projectId 时使用 defaultProjectId。
- 上游异常不会让 server 崩溃。

### Claw prompt 测试

- 未配置 LLM Wiki 时，prompt 不宣称知识工具可用。
- 已配置 LLM Wiki 时，prompt 说明只读知识工具和安全规则。
- prompt 中不包含 API token。

## 7. 验证命令建议

第一阶段完成后建议运行：

```powershell
python -m unittest llm_wiki_bridge_service_test.py claw_assistant_route_service_test.py claw_bridge_service_test.py
```

如果触及 config：

```powershell
npm.cmd test -- api/configApi.specialProviders.test.js modules/settings/apiSettings.test.js
```

如果触及前端 assistant context：

```powershell
npm.cmd test -- modules/assistant/assistantContextBuilder.test.js modules/app/appAssistantPanel.autoload.test.js
```

最终建议跑：

```powershell
python -m unittest claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py
```

## 8. 持续更新日志

### 2026-05-23：方案和接力文档创建

本次只创建文档，没有代码实现。

产出：

- `docs/LLM_WIKI_CLAW_ASSISTANT_INTEGRATION_PLAN.md`
- `docs/LLM_WIKI_CLAW_ASSISTANT_IMPLEMENTATION_HANDOFF.md`

已明确：

- LLM Wiki 接入 Claw 助手能力层，不放进画布 API。
- 第一阶段为只读桥接。
- 普通 Claw 对话不自动写入 LLM Wiki。
- LLM Wiki token 只保存在幻映后端。
- 后续开发应优先新增独立 service/route/tests，避免影响你正在补的画布能力。

未做：

- 未修改代码。
- 未新增配置。
- 未调用本地 LLM Wiki。
- 未启动、停止、重启或探测任何本地服务。

### 2026-05-23：只读桥接第一阶段实现

本次实现第一期只读接入，不触碰画布 API。

新增：

- `services/llm_wiki_bridge_service.py`
- `llm_wiki_bridge_service_test.py`

改动：

- `services/claw_assistant_route_service.py`
  - 新增 `wiki_service` 注入。
  - 新增 `/api/v2/assistant/wiki/*` 只读子路由。
  - `/api/v2/assistant/chat` 会把 `wiki_service.build_context_summary()` 注入到 `context.knowledge.llmWiki`。
  - 注入前会移除 token/secret/password/credential 类字段。
- `services/claw_bridge_service.py`
  - `ACTION_PROTOCOL` 新增 `knowledgeTools.llmWiki`。
  - 明确 LLM Wiki 是 read-only project knowledge lookup。
  - 明确普通聊天不得写入 LLM Wiki，不得伪造 citation，不得包含 token、本地路径、data/blob URL。
- `server.py`
  - 新增 `from services.llm_wiki_bridge_service import LlmWikiBridgeService`。
  - 新增 `LLM_WIKI_BRIDGE_SERVICE = LlmWikiBridgeService(config_file_getter=lambda: CONFIG_FILE)`。
  - 将 `wiki_service=LLM_WIKI_BRIDGE_SERVICE` 注入 `CLAW_ASSISTANT_ROUTE_SERVICE`。

第一阶段支持的后端路由：

- `GET /api/v2/assistant/wiki/status`
- `GET /api/v2/assistant/wiki/projects`
- `POST /api/v2/assistant/wiki/search`
- `POST /api/v2/assistant/wiki/file-content`
- `POST /api/v2/assistant/wiki/graph`

配置读取：

```json
{
  "integrations": {
    "llm_wiki": {
      "enabled": true,
      "apiBaseUrl": "http://127.0.0.1:19828",
      "apiToken": "local-token",
      "defaultProjectId": "project-id",
      "requestTimeoutSec": 20,
      "maxSearchResults": 8,
      "maxContentChars": 6000
    }
  }
}
```

安全边界：

- 默认要求 `apiBaseUrl` 是 loopback：`127.0.0.1`、`localhost` 或 `::1`。
- 路由响应不返回实际 `apiToken`。
- Claw prompt payload 不包含 token 字段。
- 搜索结果和文件内容会二次脱敏：
  - API key / OpenAI-style key
  - Bearer token
  - Windows/macOS/Linux 绝对路径
  - `data:` URL
  - `blob:` URL
  - secret/key/token/password/credential 字段

验证：

- RED：新增测试后先失败，原因是缺少 `services.llm_wiki_bridge_service`、`ClawAssistantRouteService` 不接受 `wiki_service`、server 未接线、Claw prompt 无 `knowledgeTools.llmWiki`。
- GREEN：`python -m unittest llm_wiki_bridge_service_test.py claw_assistant_route_service_test.py claw_bridge_service_test.py`，结果 51 tests OK。
- 后端 assistant 回归：`python -m unittest llm_wiki_bridge_service_test.py claw_conversation_memory_service_test.py claw_bridge_service_test.py claw_runtime_service_test.py claw_provider_proxy_service_test.py claw_assistant_route_service_test.py http_route_dispatcher_test.py claw_action_schema_test.py`，结果 90 tests OK。
- Python 语法检查：`python -m py_compile server.py services\llm_wiki_bridge_service.py services\claw_assistant_route_service.py services\claw_bridge_service.py services\claw_context_service.py services\claw_runtime_service.py services\claw_provider_proxy_service.py services\http_route_dispatcher.py services\claw_conversation_memory_service.py`，无报错。

未做：

- 未新增前端设置 UI。
- 未新增画布 action。
- 未将搜索结果落到画布。
- 未写入 LLM Wiki。
- 未触发 Deep Research。
- 未触发 LLM Wiki rescan。
- 未启动、停止、重启或探测 `8777`。
- 未启动、停止、重启或探测本地 LLM Wiki 服务。

下一个建议切片：

1. 等 `create_comment` / undo/history 完成后，再做“知识结果落画布”。
2. 后续写回、Deep Research、rescan 必须继续走用户确认。
3. 继续校准 LLM Wiki 真实响应字段，必要时扩展 bridge normalizer。

### 2026-05-23：前端设置入口和状态测试实现

目标：补齐第一阶段产品可配置入口，让团队成员不需要手改 `config.json` 就能启用 LLM Wiki。

改动：
- `modules/settings/apiSettings.js`
  - 新增 `getKnowledgeIntegrationConfigs()`，把 LLM Wiki 定义为 knowledge integration，而不是 provider。
  - 新增 `normalizeKnowledgeIntegrationsSnapshot()` 和 `prepareKnowledgeIntegrationConfigForPersistence()`。
  - 设置页在“特殊接入配置”后插入“知识库接入”卡片。
  - LLM Wiki 卡片字段：`enabled`、`apiBaseUrl`、`apiToken`、`defaultProjectId`、`requestTimeoutSec`、`maxSearchResults`、`maxContentChars`。
  - 保存时写入 `integrations.llm_wiki`，并移除误放到 `providers.llm_wiki` 的漂移配置。
  - “测试连接”会先保存当前卡片配置，再调用 `/api/v2/assistant/wiki/status`。
- `api/clawAssistantApi.js`
  - 新增 `fetchClawAssistantWikiStatus()`。
- `api/index.js`
  - 导出 `fetchClawAssistantWikiStatus()`。
- `modules/settings/apiSettings.test.js`
  - 增加 LLM Wiki integration 元数据、默认值归一化、保存路径边界测试。
- `api/clawAssistantApi.test.js`
  - 增加 wiki status wrapper 路由测试。

验证：
- RED：新增测试先失败，原因是缺少 `getKnowledgeIntegrationConfigs` / `fetchClawAssistantWikiStatus` 等导出。
- GREEN：`node --test --test-concurrency=1 modules\settings\apiSettings.test.js`，7 tests pass。
- GREEN：`node --test --test-concurrency=1 api\clawAssistantApi.test.js`，7 tests pass。
- 前端助手/API/context 回归：`node --test --test-concurrency=1 api\configApi.specialProviders.test.js api\clawAssistantApi.test.js modules\settings\apiSettings.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js`，60 tests pass。
- 后端 wiki/assistant 回归：`python -m unittest llm_wiki_bridge_service_test.py claw_assistant_route_service_test.py claw_bridge_service_test.py`，53 tests OK。

未做：
- 没有启动、停止、重启、探测 `8777`。
- 没有启动、停止、重启、探测本地 LLM Wiki 服务。
- 没有新增写回、Deep Research、rescan。
- 没有把 LLM Wiki 搜索结果落画布。
- 没有让 Claw 自动发起 wiki search 查询闭环。

### 2026-05-23：Claw 知识查询闭环实现

目标：让 Claw 在明显需要项目知识时，先由幻映后端只读检索 LLM Wiki，再把结果注入给 Claw，而不是让用户手动调用 wiki search。

改动：
- `services/claw_assistant_route_service.py`
  - 新增 wiki search intent 判断，覆盖 `knowledge base`、`wiki`、`project knowledge`、`reference`、`search`、`知识库`、`资料`、`引用`、`检索` 等关键词。
  - `/api/v2/assistant/chat` 注入 `context.knowledge.llmWiki` 时，如果用户请求命中知识意图且 LLM Wiki 已启用/可用，会调用 `wiki_service.search(project_id=defaultProjectId, query=message, limit=3)`。
  - 检索成功时注入 `context.knowledge.llmWiki.searchResults`、`lastSearch`、`searchWarnings`。
  - 检索失败时注入 `lastSearch.success=false` 和空 `searchResults`，不阻断 Claw 正常回复。
  - 对 summary 和 search payload 递归移除 token/secret/password/credential/authorization/api_key 类字段。
- `services/claw_bridge_service.py`
  - `ACTION_PROTOCOL.knowledgeTools.llmWiki.rules` 增加 `Use context.knowledge.llmWiki.searchResults as retrieved project knowledge only when present.`。
- `claw_assistant_route_service_test.py`
  - 增加自动预检索成功、普通请求不检索、预检索失败降级三组测试。
- `claw_bridge_service_test.py`
  - 增加 prompt 协议必须说明 `searchResults` 用法的断言。

验证：
- RED：新增测试先失败，原因是聊天路由未调用 `wiki_service.search()`，且 prompt 协议未说明 `searchResults`。
- GREEN：`python -m unittest claw_assistant_route_service_test.py`，31 tests OK。
- 本切片精确验证：`python -m unittest claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_chat_prefetches_wiki_search_results_for_knowledge_request claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_chat_skips_wiki_search_for_general_request claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_chat_keeps_working_when_wiki_auto_search_fails claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_readonly_llm_wiki_knowledge_rules llm_wiki_bridge_service_test.py`，10 tests OK。
- Python 语法检查：`python -B -m py_compile services\claw_assistant_route_service.py services\claw_bridge_service.py services\llm_wiki_bridge_service.py`，通过。
- 注意：当前更宽的 `claw_bridge_service_test.py` 已包含并行新增的 asset reference / 长 prompt 压缩 RED 测试，失败点是 `MAX_PROMPT_ARGUMENT_CHARS` 和 `create_asset_reference_node`，不属于本次 LLM Wiki 自动检索切片。

未做：
- 没有启动、停止、重启、探测 `8777`。
- 没有启动、停止、重启、探测本地 LLM Wiki 服务。
- 没有把检索结果落画布。
- 没有写回 LLM Wiki。
- 没有触发 Deep Research 或 rescan。

### 2026-05-23：知识结果落画布协议切片

目标：在不新增画布 action、不触碰画布 API 的前提下，让 Claw 能把已检索到的 LLM Wiki 结果整理成低风险画布资料节点。

改动：
- `services/claw_bridge_service.py`
  - `ACTION_PROTOCOL.knowledgeTools.llmWiki` 新增 `canvasLandingRules`。
  - 明确用户要求“把 LLM Wiki findings 放到画布”时，应该基于 `context.knowledge.llmWiki.searchResults` 创建低风险节点。
  - 推荐 `create_node` + `nodeType comment` 用于简短资料卡，`nodeType source-text` 用于可复用资料摘要。
  - 要求把 `source title` 和 `fileId` 写进 `data.content` / `data.text` / `data.title`，不要新增不受支持的 citation 字段。
  - 明确不得伪造 citations、source title、fileId、file content 或来源声明。
  - prompt 压缩时新增轻量 LLM Wiki 保留逻辑，保留 `lastSearch`、前几条 `searchResults`、`searchWarnings`，避免长上下文压缩把知识检索结果丢掉。
- `claw_bridge_service_test.py`
  - 增加协议断言，确认 prompt 包含知识结果落画布规则。
  - 增加长 prompt 压缩断言，确认压缩后仍保留 LLM Wiki `lastSearch` 和 `searchResults` 的 `title/fileId/snippet`。

验证：
- RED：新增测试先失败，原因是压缩后的 prompt 丢失 `lastSearch`，且协议没有知识结果落画布规则。
- GREEN：`python -m unittest claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_compacts_large_context_before_windows_command_limit claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_readonly_llm_wiki_knowledge_rules`，2 tests OK。
- 后端相关回归：`python -m unittest claw_bridge_service_test.py llm_wiki_bridge_service_test.py claw_assistant_route_service_test.py claw_action_schema_test.py`，70 tests OK。
- Python 语法检查：`python -B -m py_compile services\claw_bridge_service.py services\llm_wiki_bridge_service.py services\claw_assistant_route_service.py services\claw_action_schema.py`，通过。
- Diff 空白检查：`git diff --check` 退出码 0，仅输出既有 LF/CRLF 转换警告。

当前边界：
- 仍然没有新增 `create_comment` 或 LLM Wiki 专用 action。
- 仍然不自动写入 LLM Wiki。
- 仍然不触发 Deep Research 或 rescan。
- 仍然没有启动、停止、重启、探测 `8777` 或本地 LLM Wiki 服务。
- 这一切片让“检索结果落画布”具备可执行协议和压缩稳定性，但最终效果仍依赖 Claw 模型按协议返回 `create_node` actions，并通过现有后端 validate + 前端 executor 执行。

### 2026-05-23：来源元数据落画布切片

目标：让 LLM Wiki 资料卡不仅把来源写进正文，还能把安全的结构化来源元数据保留到画布节点数据里，方便后续预览、追溯和可能的 citation UI。

改动：
- `services/claw_action_schema.py`
  - `SAFE_NODE_DATA_FIELDS` 新增安全标量字段：`sourceTitle`、`sourceFileId`、`sourceProjectId`、`source`、`fileId`、`projectId`、`citation`。
  - 这些字段仍走原有 scalar sanitizer，会继续丢弃 API key、Bearer token、本地绝对路径、`data:` URL、`blob:` URL 等不安全值。
- `services/claw_bridge_service.py`
  - prompt 协议的 `safeNodeDataFields` 同步新增来源元数据字段。
  - `canvasLandingRules` 明确：当这些值来自 `context.knowledge.llmWiki.searchResults` 时，可以复制到 `data.sourceTitle`、`data.fileId`、`data.projectId`、`data.sourceFileId`、`data.sourceProjectId`、`data.citation`。
  - 修正 `requiresConfirmation` 聚合逻辑：如果动作或顶层显式要求确认则确认；如果顶层显式 `false` 且动作没有要求确认，则保持 `false`。这让低风险知识资料卡可以和协议里的自动落点策略一致。
- `claw_action_schema_test.py`
  - 增加 LLM Wiki 资料卡来源元数据保留和敏感值剔除测试。
- `claw_bridge_service_test.py`
  - 增加受控 Claw 输出资料卡 action 的验证测试，确认 `sourceTitle/fileId/projectId/citation` 通过 schema 后仍保留。
  - 增加 prompt 协议必须公开 `sourceTitle/sourceFileId` 的断言。
- `modules/assistant/assistantActionPreview.test.js`
  - 增加创建知识资料卡时预览摘要展示来源标题和 fileId 的测试。

验证：
- RED：新增测试先失败，原因是 schema 丢弃 `sourceTitle/fileId` 等字段、prompt 未声明 `sourceTitle/sourceFileId`、preview 摘要只显示 `Create comment node`。
- GREEN：`python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_preserves_safe_llm_wiki_source_metadata_on_canvas_notes claw_bridge_service_test.ClawBridgeServiceTests.test_chat_validates_actions_when_schema_is_injected claw_bridge_service_test.ClawBridgeServiceTests.test_chat_accepts_llm_wiki_canvas_note_with_safe_source_metadata claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_readonly_llm_wiki_knowledge_rules`，4 tests OK。
- GREEN：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js`，3 tests pass。
- 后端相关回归：`python -m unittest claw_bridge_service_test.py claw_action_schema_test.py claw_assistant_route_service_test.py llm_wiki_bridge_service_test.py`，72 tests OK。
- 前端相关回归：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js modules\app\appAssistantPanel.test.js`，44 tests pass。
- Python 语法检查：`python -B -m py_compile services\claw_bridge_service.py services\claw_action_schema.py services\claw_assistant_route_service.py services\llm_wiki_bridge_service.py`，通过。
- Diff 空白检查：`git diff --check` 退出码 0，仅输出既有 LF/CRLF 转换警告。

当前边界：
- 仍然没有新增 LLM Wiki 专用 action。
- 仍然没有写回 LLM Wiki、Deep Research 或 rescan。
- 真实模型是否稳定填充这些字段，还需要下一步 mock/live 校准。

### 2026-05-23：API Token 可选切片

目标：修正设置页“必须填写 apiToken”的体验问题。对于本机无鉴权的 LLM Wiki 服务，用户不需要找 token，直接留空即可。

改动：
- `services/llm_wiki_bridge_service.py`
  - `_configured_error(...)` 不再要求 `apiToken`。
  - 只有 `apiBaseUrl` 缺失才返回 `LLM_WIKI_UNCONFIGURED`。
  - `_request_json(...)` 只有在 `apiToken` 非空时才发送 `Authorization: Bearer ...`。
  - 如果真实 LLM Wiki 服务需要鉴权，仍会通过上游 401/403 映射为 `LLM_WIKI_AUTH_FAILED`。
- `modules/settings/apiSettings.js`
  - LLM Wiki token 字段文案为 `API Token（可选）`。
  - placeholder 提示本地 LLM Wiki 未开启鉴权时可留空。
- `llm_wiki_bridge_service_test.py`
  - 增加空 token 也能状态检测和搜索，且不发送 Authorization header 的测试。
- `modules/settings/apiSettings.test.js`
  - 增加 token 字段文案为可选的测试。

验证：
- RED：新增测试先失败，原因是空 token 会被判定为 `unconfigured`，且前端字段仍表现得像必填。
- GREEN：`python -m unittest llm_wiki_bridge_service_test.LlmWikiBridgeServiceTests.test_status_allows_empty_token_for_loopback_service llm_wiki_bridge_service_test.LlmWikiBridgeServiceTests.test_search_omits_authorization_header_when_token_is_empty`，2 tests OK。
- GREEN：`node --test --test-concurrency=1 modules\settings\apiSettings.test.js`，7 tests pass。
- 后端 wiki/assistant 回归：`python -m unittest llm_wiki_bridge_service_test.py claw_assistant_route_service_test.py claw_bridge_service_test.py`，61 tests OK。
- 前端设置/API 回归：`node --test --test-concurrency=1 modules\settings\apiSettings.test.js api\clawAssistantApi.test.js`，14 tests pass。
- 语法检查：`python -B -m py_compile services\llm_wiki_bridge_service.py services\claw_assistant_route_service.py services\claw_bridge_service.py` 和 `node --check modules\settings\apiSettings.js` 均通过。
- Diff 空白检查：`git diff --check` 退出码 0，仅输出既有 LF/CRLF 转换警告。

当前边界：
- `apiBaseUrl` 仍然必须是 loopback。
- `defaultProjectId` 仍然是搜索默认项目；如果不填，搜索类请求需要显式传 projectId。
- 未启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。

### 2026-05-23：画布资料卡 Action Hints 切片

目标：当用户明确要求“把知识库资料整理成资料卡放到画布上”时，后端先把已检索到的 LLM Wiki 结果整理成稳定的 `canvasActionHints`，再交给 Claw。这样模型优先照着安全模板返回 `create_node`，减少自由发挥导致的来源字段缺失或 citation 编造。

改动：
- `services/claw_assistant_route_service.py`
  - 新增 LLM Wiki 画布落点意图判断，覆盖 `canvas`、`note card`、`画布`、`资料卡`、`知识卡`、`卡片`、`节点`、`放到`、`整理成` 等表达。
  - `_with_wiki_auto_search(...)` 在搜索成功且命中画布落点意图时，会基于 `searchResults` 生成 `context.knowledge.llmWiki.canvasActionHints`。
  - hint 仍然只是提示，不直接执行画布动作；形状为低风险 `create_node` + `nodeType=comment`，并保留 `sourceTitle/fileId/projectId/sourceFileId/sourceProjectId/citation` 等安全标量来源字段。
- `services/claw_bridge_service.py`
  - `canvasLandingRules` 新增明确规则：`Prefer context.knowledge.llmWiki.canvasActionHints when present`。
  - prompt 压缩时新增 `canvasActionHints` 保留逻辑，长上下文下仍保留 action hint 的 `type/nodeType/riskLevel/requiresConfirmation` 和安全 `data` 字段。
- `claw_assistant_route_service_test.py`
  - 增加“知识库资料卡放到画布”请求会注入 `canvasActionHints` 的测试。
- `claw_bridge_service_test.py`
  - 增加 prompt 协议必须说明优先使用 `canvasActionHints` 的断言。
  - 增加长 prompt 压缩后仍保留 `canvasActionHints` 的断言。

验证：
- RED：新增 3 个测试先失败，原因分别是路由缺少 `canvasActionHints`、压缩后缺少 `canvasActionHints`、prompt 协议缺少 `Prefer context.knowledge.llmWiki.canvasActionHints`。
- GREEN：`python -m unittest claw_assistant_route_service_test.ClawAssistantRouteServiceTests.test_chat_adds_wiki_canvas_action_hints_for_canvas_landing_request claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_contains_readonly_llm_wiki_knowledge_rules claw_bridge_service_test.ClawBridgeServiceTests.test_chat_prompt_compacts_large_context_before_windows_command_limit`，3 tests OK。
- 后端相关回归：`python -m unittest claw_assistant_route_service_test.py claw_bridge_service_test.py llm_wiki_bridge_service_test.py claw_action_schema_test.py`，76 tests OK。

当前边界：
- `canvasActionHints` 是 Claw 输入提示，不是新的画布 API，也不会绕过现有 action schema / 前端 executor。
- 未新增写回、Deep Research、rescan 或 LLM Wiki 专用 action。
- 未启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。
- 因为改了后端 route/bridge，运行中的 `8777` 需要用户后续自行重启后才会加载这次后端逻辑。

### 2026-05-23：资料卡来源范围校验切片

目标：把“模型不要编造引用”的提示规则推进到后端校验层。Claw 返回的 LLM Wiki 资料卡如果带 `sourceTitle/fileId/projectId/citation` 等来源字段，必须能在当前 `context.knowledge.llmWiki.searchResults` 或 `canvasActionHints` 中找到对应来源，否则拒绝这批 actions。

改动：
- `services/claw_action_schema.py`
  - 新增 LLM Wiki 来源范围提取：从 `searchResults`、`canvasActionHints` 及其 `data` 中收集允许的 `title/fileId/projectId/source/citation`。
  - `create_node` 动作只要携带 LLM Wiki 来源字段，就会校验这些字段是否来自当前上下文。
  - 没有 LLM Wiki 上下文时不启用该限制，避免影响普通画布节点和非知识库来源。
- `claw_action_schema_test.py`
  - 增加伪造 `Fake Guide / file-fake` 来源会被拒绝的测试。
- `claw_bridge_service_test.py`
  - 增加受控 Claw 输出伪造 LLM Wiki 来源时，bridge 返回 `CLAW_ACTION_SCHEMA_INVALID` 的测试。

验证：
- RED：新增 2 个测试先失败，原因是 schema 只校验字段安全性，不校验来源是否来自当前 LLM Wiki 结果。
- GREEN：`python -m unittest claw_action_schema_test.ClawActionSchemaTests.test_validate_rejects_llm_wiki_source_metadata_outside_context claw_bridge_service_test.ClawBridgeServiceTests.test_chat_rejects_llm_wiki_canvas_note_with_fabricated_source_metadata`，2 tests OK。
- 后端相关回归：`python -m unittest claw_action_schema_test.py claw_bridge_service_test.py claw_assistant_route_service_test.py llm_wiki_bridge_service_test.py`，81 tests OK。

当前边界：
- 这是 action schema 的上下文校验，不调用真实 LLM Wiki，也不新增 LLM Wiki 写回。
- 只约束带 LLM Wiki 来源字段的 `create_node`，不影响普通无来源节点。
- 未启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。

### 2026-05-23：资料卡预览体验切片

目标：让知识库资料卡在助手预览卡里更像“可追溯资料卡”，而不是只显示一行通用 `Create comment node`。用户在应用前能直接看到标题、来源、fileId/projectId 和摘要片段。

改动：
- `modules/assistant/assistantActionPreview.js`
  - `summarizeAssistantActions(...)` 会识别 `create_node` 中的 LLM Wiki 来源字段。
  - 预览渲染新增来源行：`来源：Brand Guide (file-brand) · 项目：project-brand`。
  - 预览渲染新增摘要行：从 `snippet/summary/content/text` 中提取第一段非来源说明文本。
  - 保留原有 details JSON 展开，不影响选择/部分应用流程。
- `modules/app/appAssistantPanel.js`
  - 新增 `.claw-assistant-action-preview-source` 和 `.claw-assistant-action-preview-excerpt` 样式，使来源与摘要在卡片里更易扫读。
- `modules/assistant/assistantActionPreview.test.js`
  - 增加预览 DOM 应渲染来源、fileId 和摘要片段的测试。

验证：
- RED：新增测试先失败，原因是预览只在 summary/details 中隐含来源，没有 `来源：...` 和摘要行。
- GREEN：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js`，4 tests pass。
- 前端相关回归：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js`，48 tests pass。

当前边界：
- 这是前端预览体验增强，不改变后端 schema、Claw prompt、画布执行器或 LLM Wiki 服务。
- 自动应用的低风险动作仍会直接执行；需要确认的知识资料卡会在预览卡中展示更清楚的来源。
- 前端静态文件变更需要浏览器刷新后生效。

### 2026-05-23：资料卡落画布后节点正文显示切片

目标：让 Claw 用 LLM Wiki 检索结果创建 `comment` / `source-text` 节点时，画布节点正文直接显示资料标题、摘要、来源和项目，而不是只把 `sourceTitle/fileId/projectId/citation` 藏在 metadata 里。

改动：
- `modules/assistant/assistantActionExecutor.js`
  - 新增 LLM Wiki 资料卡正文格式化逻辑，仅在 `create_node` 的 `nodeType=comment/source-text` 且 `data` 带有安全来源 metadata 时触发。
  - 正文格式为：标题、摘要、`来源：标题 (fileId)`、`项目：projectId`，必要时附加 `引用：...`。
  - 保留原有 `sourceTitle/fileId/projectId/citation/sourceFileId/sourceProjectId` 等 metadata 字段，方便后续 citation UI、过滤和追溯。
  - 避免把原文里的 `Source:` / `来源：` 行重复当成摘要。
- `modules/assistant/assistantActionExecutor.test.js`
  - 增加 `formats llm wiki knowledge card content when creating canvas nodes`，先 RED 证明旧实现只保留原始 content，GREEN 后确认节点正文与 metadata 都正确保留。

验证：
- RED：`node --test --test-concurrency=1 modules\assistant\assistantActionExecutor.test.js` 先失败，失败点为缺少 `来源：Brand Guide (file-brand)`。
- GREEN：`node --test --test-concurrency=1 --test-name-pattern "formats llm wiki knowledge card" modules\assistant\assistantActionExecutor.test.js` 通过，1 test pass。
- 相关前端回归：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，51 tests pass。
- 语法检查：`node --check modules\assistant\assistantActionExecutor.js`、`node --check modules\app\appAssistantPanel.js` 均通过。
- `git diff --check` 退出码 0，仅输出已有 LF/CRLF 转换提醒。

当前边界：
- 没有新增 LLM Wiki 专用 action。
- 没有调用真实 Claw/cloud model。
- 没有启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。
- 没有新增写回、Deep Research 或 rescan。
- 前端静态 JS 变更需要浏览器刷新后生效。

当前进度估计：LLM Wiki config/read-only/search/canvas-landing/source-metadata/source-scope/preview/node-display 基础约 91%；完整 wow roadmap 约 71%，剩余主要是写回确认、Deep Research、rescan、真实模型/浏览器联调和更完整 citation UI。

### 2026-05-23：知识卡来源追踪回执切片

目标：让 LLM Wiki 资料卡落画布并被自动应用后，助手操作回执也能直接显示资料来源，而不是只显示“新建 1 个节点”。

改动：
- `modules/assistant/assistantActionExecutor.js`
  - `create_node` 创建 `comment` / `source-text` 且携带 LLM Wiki 安全来源 metadata 时，执行结果新增 `knowledgeCards`。
  - `knowledgeCards` 只保留标量来源追踪字段：`nodeId`、`title`、`fileId`、`projectId`、`citation`、`source`。
  - 不改变节点 payload 中既有的 `sourceTitle/fileId/projectId/citation` metadata，也不新增任何 LLM Wiki action。
- `modules/app/appAssistantPanel.js`
  - 自动应用或手动应用后，操作回执会展示 `知识卡：Brand Guide (file-brand) · 项目：project-brand` 这类来源追踪。
- `modules/app/appAssistantPanel.autoload.js`
  - 持久化 operation summary 同步保留同样的知识卡来源追踪，方便后续话题历史和对话上下文说明“刚才放了哪张资料卡”。
- 测试：
  - `modules/assistant/assistantActionExecutor.test.js`
  - `modules/app/appAssistantPanel.test.js`
  - `modules/app/appAssistantPanel.autoload.test.js`

验证：
- RED：新增测试先失败，原因是 executor 没有 `knowledgeCards`，面板/持久化摘要也没有来源追踪。
- GREEN：`node --test --test-concurrency=1 --test-name-pattern "knowledge card|source traces" modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，3 tests OK。
- 相关前端回归：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，62 tests OK。
- 语法检查：`node --check modules\assistant\assistantActionExecutor.js`、`node --check modules\app\appAssistantPanel.js`、`node --check modules\app\appAssistantPanel.autoload.js` 均通过。

当前边界：
- 没有写回 LLM Wiki。
- 没有触发 Deep Research 或 rescan。
- 没有新增 LLM Wiki 专用 action。
- 没有调用真实 Claw/cloud model。
- 没有启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。

当前进度估计：LLM Wiki config/read-only/search/canvas-landing/source-metadata/source-scope/preview/node-display/source-trace foundation 约 93%；完整 wow roadmap 约 73%。剩余主要是写回确认、Deep Research、rescan、真实模型/浏览器联调和更完整 citation UI。

### 2026-05-23：知识卡 Citation Display 元数据基础切片

目标：在不改核心渲染器、不新增画布 API 的前提下，让 LLM Wiki 资料卡节点自带一个稳定的、可被后续节点详情/侧栏/citation UI 读取的来源展示字段。

改动：
- `modules/assistant/assistantActionExecutor.js`
  - 新增 `buildKnowledgeCitationDisplay(...)` 和 `buildKnowledgeCitationMetadata(...)`。
  - `create_node` 创建 `comment` / `source-text` 且携带 LLM Wiki 安全来源 metadata 时，节点 payload 新增：
    - `citationKind: "llm_wiki"`
    - `citationDisplay`，例如 `Brand Guide (file-brand)`
    - `citationProjectId`，例如 `project-brand`
  - `knowledgeCards` 回执同步新增 `citationDisplay`，面板未来可以直接复用同一来源标签。
  - 不改变现有 `sourceTitle/fileId/projectId/citation/sourceFileId/sourceProjectId` 字段，也不新增 LLM Wiki 专用 action。
- `modules/assistant/assistantActionExecutor.test.js`
  - 新增 `adds normalized citation display metadata to llm wiki knowledge card nodes`。
  - 同步更新已有知识卡回执测试，确保 `citationDisplay` 一起返回。

验证：
- RED：`node --test --test-concurrency=1 --test-name-pattern "normalized citation display|knowledge card" modules\assistant\assistantActionExecutor.test.js` 先失败，原因是节点缺少 `citationKind/citationDisplay`。
- GREEN：同一命令通过，2 tests OK。
- 相关前端回归：`node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，63 tests OK。
- 语法检查：`node --check modules\assistant\assistantActionExecutor.js` 通过。
- Diff 空白检查：`git diff --check` 退出码 0，仅输出仓库既有 LF/CRLF 转换提醒。

当前边界：
- 没有修改核心画布渲染器。
- 没有新增写回 LLM Wiki。
- 没有触发 Deep Research 或 rescan。
- 没有新增 LLM Wiki 专用 action。
- 没有调用真实 Claw/cloud model。
- 没有启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。

当前进度估计：LLM Wiki config/read-only/search/canvas-landing/source-metadata/source-scope/preview/node-display/source-trace/citation-display foundation 约 95%；完整 wow roadmap 约 75%。剩余主要是节点详情/侧栏级 citation UI、写回确认、Deep Research、rescan、真实模型/浏览器联调。

### 2026-05-23：Foundation 最终 Citation Context/UI 闭环切片

目标：把前一轮已经写入节点 payload 的 `citationDisplay/citationKind/citationProjectId` 真正串到助手上下文、动作预览、自动/手动应用回执和持久化 operation summary 中，让 LLM Wiki foundation 在离线只读范围内闭环完成。

改动：
- `modules/assistant/assistantContextBuilder.js`
  - 新增节点来源归一化摘要逻辑。
  - 当画布节点携带 `citationKind/citationDisplay/sourceTitle/fileId/projectId/citation/source` 等字段时，节点摘要会附带 `knowledgeSource`。
  - `knowledgeSource` 保留 `kind/display/title/fileId/projectId/citation/source`，供后续 Claw 上下文、历史解释和 citation UI 读取。
- `modules/assistant/assistantActionPreview.js`
  - 预览来源行优先使用 `data.citationDisplay`。
  - 项目 id 同时兼容 `projectId/sourceProjectId/citationProjectId`。
- `modules/app/appAssistantPanel.js`
  - 应用回执中的 `知识卡：...` 优先显示 `citationDisplay`，避免退化成 `node-1`。
  - 项目展示兼容 `citationProjectId`。
- `modules/app/appAssistantPanel.autoload.js`
  - 持久化 operation summary 同步使用相同的 `citationDisplay/citationProjectId` 规则，保证下次打开话题时仍能看懂“刚才放了哪张资料卡”。
- 测试：
  - `modules/assistant/assistantContextBuilder.test.js`
  - `modules/assistant/assistantActionPreview.test.js`
  - `modules/app/appAssistantPanel.test.js`
  - `modules/app/appAssistantPanel.autoload.test.js`

验证：
- RED：新增 4 个测试先失败，失败点分别是 context 缺少 `knowledgeSource`、预览来源未使用 `citationDisplay`、应用回执/持久化摘要退化为节点 id。
- GREEN：`node --test --test-concurrency=1 --test-name-pattern "llm wiki citation metadata|normalized citation display|citation display" modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，4 tests OK。
- 相关前端回归：`node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js` 通过，74 tests OK。
- 语法检查：`node --check modules\assistant\assistantContextBuilder.js`、`node --check modules\assistant\assistantActionPreview.js`、`node --check modules\app\appAssistantPanel.js`、`node --check modules\app\appAssistantPanel.autoload.js` 均通过。
- Diff 空白检查：`git diff --check` 退出码 0，仅输出仓库既有 LF/CRLF 转换提醒。

当前边界：
- 没有修改核心画布渲染器或大体量 `main.js`。
- 没有新增写回 LLM Wiki。
- 没有触发 Deep Research 或 rescan。
- 没有新增 LLM Wiki 专用 action。
- 没有调用真实 Claw/cloud model。
- 没有启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。

当前进度估计：LLM Wiki foundation 100%。完整 wow roadmap 约 80%，剩余主要是独立产品切片：节点详情/侧栏级 citation UI、确认式写回、Deep Research/rescan 显式确认入口、真实模型/浏览器/服务联调。

## 9. 下一位开发者接力入口

最新接力状态：LLM Wiki foundation 已经在离线只读范围内完成 100%。已完成：配置入口、可选 token、只读 bridge、自动检索、画布 action hints、来源范围校验、预览来源/摘要、画布节点正文、知识卡来源回执、`citationDisplay` 元数据、助手上下文 `knowledgeSource`、应用回执和持久化摘要读取 normalized citation。

下一步不要再从“节点显示校准”“回执来源追踪”“citationDisplay 透传”开始；这些基础已经完成。后续应从下面任一独立产品切片继续：

1. 更完整 citation UI：在节点详情/侧栏/筛选里展示和定位 `citationDisplay/sourceTitle/fileId/projectId/citation`。
2. 写回 LLM Wiki 的确认式 UX：只做设计或 gated workflow，不允许普通聊天自动保存。
3. Deep Research / rescan 的显式确认入口：必须保留用户确认和失败降级。
4. 真实模型/浏览器联调：只有用户明确说服务已准备好并要求联调时再做。

如果要继续推进，建议从这里开始：

1. 若继续 citation 体验，先找一个干净的节点详情/侧栏组件承载 UI；不要直接改大体量核心渲染器。
2. 读 `modules/assistant/assistantContextBuilder.js` 的 `knowledgeSource` 摘要逻辑，确认 Claw 上下文如何读取已落画布知识卡来源。
3. 读 `modules/assistant/assistantActionPreview.js` 的 `summarizeKnowledgeSource(...)`，确认预览来源展示逻辑。
4. 读 `modules/app/appAssistantPanel.js` / `modules/app/appAssistantPanel.autoload.js` 的 `formatKnowledgeCardTrace(...)`，确认回执和持久化摘要如何显示 `citationDisplay`。
5. 读 `services/claw_action_schema.py` 的 `_extract_llm_wiki_source_scope(...)`、`_validate_llm_wiki_source_scope(...)`，确认资料卡来源必须来自当前上下文。
6. 读 `services/claw_assistant_route_service.py` 的 `_with_wiki_auto_search(...)`、`_build_wiki_canvas_action_hints(...)`，确认什么时候注入 `searchResults` 与 `canvasActionHints`。
7. 写回、Deep Research、rescan 必须单独切片，并继续要求用户确认。

第一期切记：只读、受控、可降级。
## 2026-05-25: Assistant Panel Citation UI Slice

目标：把已经贯通到节点、预览、回执和持久化摘要里的 LLM Wiki citation 元数据，补成一个轻量但可见的助手面板入口。

改动：
- `modules/app/appAssistantPanel.js`
  - 在助手面板 header 新增 `来源` 按钮，显示最近 LLM Wiki 知识卡数量。
  - 新增 `.claw-assistant-citation-popover` 来源弹层，列出最近知识卡的 `citationDisplay/title/fileId/projectId/citation/nodeId`。
  - 应用成功后把 `result.knowledgeCards` 写入最近 operation memory，并持续刷新来源列表。
  - 从历史 operation summary 中恢复知识卡来源，切换/加载话题后仍能看到近期来源。
  - 点击带 `nodeId` 的来源条目时调用 `focusKnowledgeCardNode(nodeId, card)`，用于定位画布节点。
- `modules/app/appAssistantPanel.autoload.js`
  - 默认注入 `focusKnowledgeCardNode(...)`，通过 `graphStore.setSelectedNodes([nodeId])` 聚焦引用节点。
- `modules/app/appAssistantPanel.test.js`
  - 覆盖 `来源` 按钮、弹层展示、source count、file/project 展示和点击聚焦。
- `modules/app/appAssistantPanel.autoload.test.js`
  - 覆盖 autoload 默认知识卡聚焦回调。

验证：
- Focused: `cmd /c node --test --test-concurrency=1 --test-name-pattern "citation popover|knowledge card focus" modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js`，2 tests pass。
- Related frontend: `cmd /c node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\assistant\assistantContextBuilder.test.js`，101 tests pass。
- Syntax: `cmd /c node --check modules\app\appAssistantPanel.js` 和 `cmd /c node --check modules\app\appAssistantPanel.autoload.js` 均通过。
- Whitespace: `git diff --check` 退出码 0，仅有仓库既有 LF/CRLF 提醒。

边界：
- 没有修改后端 schema/bridge/service。
- 没有写回 LLM Wiki。
- 没有触发 Deep Research / rescan。
- 没有启动、停止、重启或探测 `8777` / 本地 LLM Wiki 服务。
- 这是“助手面板 citation UI”第一层，不是完整的节点详情/侧栏 citation 管理系统。

当前进度估计：LLM Wiki foundation 仍为 100%；完整 wow roadmap 约 82%。后续剩余主要是节点详情/侧栏级 citation UI、确认式写回、Deep Research/rescan 显式确认入口、真实模型/浏览器/服务联调。
