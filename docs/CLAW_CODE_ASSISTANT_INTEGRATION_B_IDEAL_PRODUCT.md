# claw-code 接入幻映作为 AI 助手的完整方案

## 方案定位

本方案只采用 B 方案：**claw-code 作为本地 sidecar AI 助手核心，幻映负责产品体验、画布上下文、权限控制和最终执行**。

它的目标不是把 claw-code 粗暴塞进幻映，也不是做一个简单聊天框，而是在幻映里形成一个真正懂画布、懂节点、懂模型配置、懂工作流的创作型 AI 助手。

最终形态应该是：

> 用户在幻映画布里创作时，可以随时叫出 AI 助手。助手能理解当前画布、当前选中节点、上下游连接、项目资源、模型配置和用户目标，然后给出可执行的创作建议、节点方案、提示词优化、工作流编排和自动化操作。所有真正影响画布、项目文件、付费生成任务的动作，都由幻映确认后执行。

## 核心原则

claw-code 只做“智能推理和方案生成”，幻映做“产品交互和执行仲裁”。

这个边界必须非常清楚：

| 模块 | 负责什么 |
|---|---|
| claw-code | 理解用户意图、分析上下文、生成建议、产出结构化动作 |
| 幻映前端 | 展示助手、采集画布上下文、展示确认卡片、执行画布变更 |
| 幻映后端 | 管理 claw 进程、隔离工作目录、传递上下文、记录会话、控制权限 |
| 用户 | 对画布变更、项目写入、付费生成、外部命令执行做最终确认 |

claw-code 不能直接改幻映项目 JSON，不能直接绕过幻映执行生成任务，不能直接读取或暴露用户 API Key。它只能通过幻映定义好的助手协议返回建议和动作。

## 最理想的产品形态

幻映里新增一个右侧 AI 助手面板，视觉上像专业创作工作台里的协作副驾驶，而不是普通网页客服。

面板固定服务于画布创作，不做营销介绍，不做独立页面。用户打开幻映后，在当前项目里就能使用它。

助手面板应包含这些核心区域：

| 区域 | 作用 |
|---|---|
| 对话区 | 用户和助手多轮交流，保留当前项目会话 |
| 上下文栏 | 显示助手当前理解范围：选中节点、整张画布、当前项目、资源库 |
| 快捷意图区 | 提供“优化提示词”“生成节点方案”“检查工作流”“补全视频流程”“解释当前节点”等创作指令 |
| 操作预览区 | 展示助手准备执行的画布动作，必须可展开查看细节 |
| 确认执行区 | 用户确认后，幻映把动作应用到画布 |
| 运行状态区 | 显示 claw 运行状态、模型状态、上下文大小、错误恢复入口 |

这个助手不是只回答文字，而是要成为幻映创作流程的一部分。

## 用户能获得的体验

用户可以自然地说：

- “帮我看一下这个画布现在的流程有没有问题。”
- “把这个图像节点后面补一个图生视频流程。”
- “我想做一个小红书风格的视频脚本，帮我生成节点。”
- “帮我把这个提示词改得更适合 seedance。”
- “检查这些节点为什么没有生成结果。”
- “根据这张参考图，帮我设计三套文生图提示词。”
- “把当前画布整理成一个可复用工作流。”
- “帮我给这个视频生成配音文案和分镜。”

助手的回答不能只停留在文字建议，而应该在合适的时候给出可执行动作。例如：

- 创建一个 AI 文本节点。
- 创建一个 AI 图像节点。
- 创建一个 AI 视频节点。
- 填入优化后的 prompt。
- 连接上游参考图节点。
- 调整节点名称。
- 生成一组分镜节点。
- 把多个节点整理成工作流。
- 给当前节点追加负面提示词。
- 根据当前模型能力修正参数。

所有动作都以“预览卡片”的形式出现。用户能看到助手将要做什么，也能取消、修改或只应用其中一部分。

## 前端产品设计

助手入口放在幻映现有主界面里，建议在右侧侧边栏或底部工具条提供一个 AI 助手按钮。点击后打开右侧 dock 面板。

面板状态包括：

| 状态 | 展示 |
|---|---|
| 未配置 | 提示需要配置 claw 运行时或模型 provider |
| 正在启动 | 显示本地 claw 正在启动 |
| 可用 | 正常聊天和操作 |
| 忙碌中 | 显示正在分析画布或生成方案 |
| 需要确认 | 显示操作预览卡片 |
| 执行中 | 显示正在应用到画布 |
| 执行完成 | 显示已创建/修改的节点摘要 |
| 出错 | 显示错误原因、重试、复制诊断信息 |

助手对话区必须支持引用上下文：

- 当前选中节点
- 当前画布全部节点摘要
- 某个节点的上下游链路
- 用户资源库中的图片、视频、音频
- 当前项目名称
- 当前模型配置摘要
- 当前订阅/可用模型状态

引用不应该把所有原始数据硬塞给 claw，而是由幻映生成“上下文摘要”。摘要要足够结构化，让 claw 能理解画布，但不能包含敏感信息。

## 后端架构设计

后端新增一个独立助手域，不应该把逻辑塞进 `server.py`。

建议结构：

```text
api/clawAssistantApi.js
modules/app/appAssistantPanel.js
services/claw_assistant_route_service.py
services/claw_bridge_service.py
services/claw_runtime_service.py
services/claw_context_service.py
services/claw_action_schema.py
services/claw_provider_proxy_service.py
```

后端职责：

| 服务 | 职责 |
|---|---|
| `ClawRuntimeService` | 检测、启动、停止、重启 claw 二进制 |
| `ClawBridgeService` | 向 claw 发送任务，读取输出，处理超时和错误 |
| `ClawContextService` | 把幻映画布数据压缩成安全上下文 |
| `ClawAssistantRouteService` | 提供 `/api/v2/assistant/*` 接口 |
| `ClawActionSchema` | 定义助手允许返回的结构化动作 |
| `ClawProviderProxyService` | 读取幻映特殊接入配置，用本地 OpenAI-compatible 代理替 claw 请求真实云模型 |

后端路由建议挂在：

```text
/api/v2/assistant/status
/api/v2/assistant/chat
/api/v2/assistant/context/preview
/api/v2/assistant/actions/validate
/api/v2/assistant/runtime/start
/api/v2/assistant/runtime/stop
/api/v2/assistant/provider-proxy/v1/chat/completions
```

这里的 `assistant` 是幻映产品域，不要直接暴露成 `/api/v2/claw/*`。因为用户面对的是“幻映 AI 助手”，不是裸 claw。

## 特殊接入配置与模型算力来源

claw-code 本身不自带本地大模型，它只是助手运行框架。真正回答问题的算力来自用户配置的云端模型或本地 OpenAI-compatible 模型服务。

幻映应在现有“特殊接入配置”区域增加一张 **Claw Code 助手** 配置卡。它和 RunningHUB、PPIO 这类特殊接入保持同一产品位置，但语义是“助手专用模型 provider”，不是普通节点 registry 模型。

建议卡片字段：

| 字段 | 说明 |
|---|---|
| `apiUrl` | OpenAI-compatible base URL，例如 `https://api.openai.com/v1`、中转网关或本地模型网关；也允许直接填写完整 `/chat/completions` endpoint |
| `apiKey` | 助手专用 API Key |
| `model` | 助手默认模型，例如 `gpt-4.1-mini`、`qwen-plus`、`kimi-k2` |
| `providerType` | 默认 `openai_compatible`，后续可扩展 `anthropic`、`dashscope` 等 |
| `runtimePath` | 外置 claw-code 可执行文件路径；不填写时使用内置 `integrations/claw_code/runtime/` 候选文件 |

`apiUrl` 的实际转发 endpoint 由幻映 provider proxy 解析：`/v1` base 会追加 `/chat/completions`，完整 `/chat/completions` endpoint 会原样使用，部分中转网关的 `/openai` base 会转为 `/openai/v1/chat/completions`。

保存后的配置建议进入现有 `user/config.json` 的 `providers` 节点：

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

正式产品不建议把真实 `apiKey` 直接交给 claw-code。推荐方式是：

```text
claw-code
  -> http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1/chat/completions
  -> 幻映后端读取 providers.claw_assistant
  -> 真实云模型 / 本地 OpenAI-compatible 服务
```

幻映启动 claw 时只注入本地代理地址和短期本地 token：

```text
OPENAI_BASE_URL=http://127.0.0.1:8777/api/v2/assistant/provider-proxy/v1
OPENAI_API_KEY=aic-local-assistant-token
```

这样 claw-code 可以按 OpenAI-compatible 协议正常工作，但真实 API Key 仍由幻映后端保管。后续要做用量统计、订阅限制、错误归因、模型切换和安全审计，也都可以在幻映代理层统一处理。

## claw-code 运行方式

claw-code 不直接运行在幻映项目根目录的高权限环境里。

它应该有自己的受控工作目录，例如：

```text
user_data/claw_assistant/
```

里面保存：

- claw runtime 配置
- 当前项目助手会话
- 临时上下文文件
- 运行日志
- 结构化输出
- 错误诊断信息

如果使用外置 claw 二进制，幻映保存它的路径。如果后续打包内置 runtime，则放在：

```text
integrations/claw_code/runtime/
```

幻映启动时不强制启动 claw。用户打开助手面板或第一次请求助手时再启动，并在状态栏显示运行状态。

## 助手协议设计

幻映和 claw-code 之间不要只传自然语言。必须定义一个稳定协议。

请求格式大致是：

```json
{
  "conversationId": "project-assistant-session-id",
  "userMessage": "帮我把当前图像节点后面补一个图生视频流程",
  "context": {
    "project": {},
    "canvas": {},
    "selection": {},
    "models": {},
    "assets": {}
  },
  "capabilities": {
    "canCreateNodes": true,
    "canConnectNodes": true,
    "canEditPrompts": true,
    "canRunGeneration": false
  }
}
```

响应格式必须包含自然语言回答和结构化动作：

```json
{
  "reply": "我建议在当前图像节点后面创建一个图生视频节点，并继承参考图作为首帧输入。",
  "actions": [
    {
      "id": "act_create_video_node",
      "type": "create_node",
      "title": "创建图生视频节点",
      "nodeType": "ai-video",
      "data": {
        "prompt": "..."
      },
      "position": {
        "relativeTo": "selected_node",
        "direction": "right"
      }
    },
    {
      "id": "act_connect_reference",
      "type": "connect_nodes",
      "title": "连接参考图到视频节点",
      "from": "selected_node",
      "to": "act_create_video_node"
    }
  ],
  "warnings": [],
  "requiresConfirmation": true
}
```

幻映必须校验这些 action。校验通过后展示给用户确认。确认后才执行。

## 允许的动作类型

完整产品形态下，助手动作可以覆盖这些类型：

| 动作 | 说明 |
|---|---|
| `create_node` | 创建文本、图像、视频、音频、分镜、注释等节点 |
| `update_node_data` | 修改节点 prompt、参数、名称、模型选择等 |
| `connect_nodes` | 创建节点连线 |
| `disconnect_nodes` | 删除指定连线 |
| `create_workflow` | 把一组节点保存为工作流草稿 |
| `rename_node` | 重命名节点 |
| `focus_nodes` | 聚焦某些节点 |
| `annotate_canvas` | 创建说明型注释节点 |
| `prepare_generation` | 准备生成任务但不立即执行 |
| `run_generation` | 触发生成任务，必须单独二次确认 |

其中 `run_generation` 是高风险动作，因为可能消耗额度或调用付费模型。它必须比普通画布编辑多一层确认。

## 幻映画布上下文设计

传给 claw 的上下文必须是“摘要”，不是完整项目 JSON。

画布摘要包括：

- 节点列表
- 节点类型
- 节点名称
- prompt 摘要
- 关键参数
- 本地资源类型
- 上下游连接关系
- 当前选中节点
- 画布中已有生成结果状态
- 模型选择状态
- 错误状态

不要传：

- API Key
- 完整本地绝对路径
- 用户隐私配置
- 订阅密钥
- 不必要的大图 base64
- 原始项目完整 JSON

图片、视频等资源可以传“可理解描述 + 本地引用 id”，不要默认传原始文件内容。需要图像理解时，再由幻映显式选择资源并通过受控接口传入。

## 权限与安全

这是整个方案最重要的部分。

claw-code 自己有工具能力，可能包括读写文件、bash、web、MCP、插件等。幻映接入时不能默认放开这些能力。

推荐权限原则：

| 能力 | 默认 |
|---|---|
| 读取画布摘要 | 允许 |
| 读取幻映项目文件 | 不允许直接读取 |
| 写幻映项目文件 | 不允许直接写 |
| 执行 bash/PowerShell | 默认禁止 |
| 访问用户 API Key | 禁止 |
| 调用付费生成 | 必须用户确认 |
| 调用外部网络 | 受配置控制 |
| 使用 MCP/插件 | 高级设置中显式开启 |

幻映应该给 claw 一个“低权限助手环境”，而不是 `danger-full-access`。

真正要改画布时，只能通过幻映 action schema。这样即使 claw 推理错了，也不会直接破坏用户项目。

## 用户确认机制

所有会改变项目状态的动作必须确认。

确认卡片应清楚显示：

- 将创建几个节点
- 将修改哪些节点
- 将连接哪些节点
- 是否会触发生成
- 是否会消耗额度
- 是否会保存工作流
- 是否会覆盖已有 prompt

用户可以：

- 全部应用
- 只应用部分动作
- 展开查看详情
- 取消
- 要求助手重新生成方案

这会让助手有高级自动化能力，但不会让用户失去控制感。

## 会话与记忆

助手会话应该按项目保存。

同一个幻映项目中，助手能记住：

- 用户的创作目标
- 当前项目正在做什么
- 用户喜欢的提示词风格
- 最近生成过的节点方案
- 哪些动作被用户接受或拒绝

但这些记忆不应该污染全局配置。项目级记忆保存在项目或用户数据目录中，全局偏好另存。

建议数据位置：

```text
user/assistant/
user/assistant/conversations/
user/assistant/preferences.json
```

如果后续需要和 claw-code 自身 session 对齐，可以保存 claw session id，但幻映仍然维护自己的 conversation id。

## 设置面板

幻映设置里新增“AI 助手”配置区。

配置项包括：

- claw 运行时路径
- 当前运行状态
- provider 配置来源
- 默认助手模型
- 上下文发送范围
- 是否允许读取资源摘要
- 是否允许网络访问
- 是否允许 MCP
- 是否允许执行命令
- 是否允许自动准备画布动作
- 是否允许触发生成任务
- 日志与诊断导出

默认配置必须偏安全。高级危险能力放在折叠区，并给出明确提示。

同时，在现有“特殊接入配置”下新增 **Claw Code 助手** 卡片，专门保存助手使用的模型接口配置。这个配置不进入普通文本/图像/视频/音频节点 registry，不影响节点下拉模型列表，只供助手运行时和本地 provider proxy 使用。

## 与幻映现有架构的融合

这个方案符合幻映现有架构。

前端不引入新路由，不做新 SPA 页面。助手是一个面板，接入 `modules/app/`。

后端不把逻辑堆进 `server.py`。新增 route service，然后挂到 `services/http_route_dispatcher.py`。

前端调用不裸写 `fetch`。新增 `api/clawAssistantApi.js`，内部走 `api/requester.js`。

画布执行不绕过 store。所有动作最后通过 `graphStore`、现有节点创建流、连接流、项目保存机制执行。

生成结果不绕过现有管线。助手只准备生成任务，真正生成仍走现有文本、图像、视频、音频节点逻辑。

## 错误处理

助手必须有可理解的错误状态。

| 错误 | 用户看到 |
|---|---|
| claw 未安装 | 未检测到本地助手运行时 |
| claw 启动失败 | 启动失败，可查看诊断 |
| 模型未配置 | 助手模型未配置 |
| 请求超时 | 助手响应超时，可重试 |
| 输出不是合法 JSON | 助手返回格式异常 |
| action 校验失败 | 方案里有无法执行的动作 |
| 权限不足 | 当前权限不允许执行该操作 |
| 用户取消 | 已取消应用 |

错误信息要能帮助普通用户处理问题，也要能让开发者复制诊断日志。

## 日志与诊断

需要记录：

- claw runtime 状态
- 启动命令
- 工作目录
- 请求耗时
- 上下文大小
- action 校验结果
- 错误堆栈
- 用户是否确认执行

不要记录：

- API Key
- 原始敏感配置
- 完整私密素材内容
- 订阅密钥

诊断信息可以提供“一键复制”，方便排查。

## 完整能力清单

最终产品应该具备这些能力：

| 能力 | 标准 |
|---|---|
| 理解画布 | 能解释节点、连线、生成状态和模型配置 |
| 优化 prompt | 能根据节点类型和模型能力改写提示词 |
| 创建节点方案 | 能生成文本、图片、视频、音频节点组合 |
| 编排工作流 | 能把用户目标转成完整画布结构 |
| 检查问题 | 能指出缺失输入、模型未配置、连接错误、参数不合理 |
| 操作预览 | 所有动作都能预览 |
| 用户确认 | 所有改动都要确认 |
| 安全隔离 | claw 不能直接写项目文件 |
| 会话记忆 | 同项目内多轮对话连续 |
| 错误恢复 | 启动失败、超时、格式错误都有明确处理 |
| 可诊断 | 能导出运行状态和错误信息 |

## 成功标准

做到位的标准不是“能聊天”，而是用户真的愿意在幻映创作时依赖它。

合格形态应该满足：

- 用户不需要离开幻映画布。
- 用户能用自然语言让助手分析当前创作。
- 助手能准确理解选中节点和上下游关系。
- 助手能生成可执行的节点/连线/提示词方案。
- 用户能在应用前看懂所有改动。
- 应用后画布结构正确、项目可保存、刷新后可恢复。
- 不泄露 API Key。
- 不绕过订阅和生成权限。
- 不直接破坏项目 JSON。
- claw 出错时，幻映仍然稳定。

## 最终判断

最理想的 B 方案不是“给幻映接一个 claw 聊天框”，而是做一个**幻映画布 AI 副驾驶**。

claw-code 提供推理、规划和工具型 agent 能力；幻映提供创作场景、节点体系、画布执行、安全边界和用户确认。两者结合后，用户得到的是一个能真正参与 AI 多模态创作的助手，而不是另一个孤立的命令行工具。

这个方案的关键不是接通命令，而是接好边界：

- 智能在 claw。
- 数据在幻映。
- 权限在幻映。
- 执行在幻映。
- 决策确认在用户。

这样才能既强大，又稳。
