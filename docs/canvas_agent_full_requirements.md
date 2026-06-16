# Huanying Canvas Agent 完整需求文档

状态：草案 v1
日期：2026-06-03
项目：D:\Aic\huanying-source-windows-20260430-122116

## 1. 定位

Canvas Agent 不是一个普通聊天框，而是 Huanying 画布上的对话式创作操作系统。它通过 RH 右下角入口唤出，在助手面板中完成对话、画布诊断、节点规划、动作预览、生成调度、历史恢复和结果回执。

核心边界：

- Pi / Agent 只负责理解意图、生成回复、提出画布动作。
- Huanying 负责上下文构建、动作校验、预览确认、真实执行、生成任务、权限和回归。
- Agent 不允许直接执行 shell、写文件、操作 DOM、绕过 Huanying action schema 修改画布。
- 所有画布改动必须经过 `CanvasActionSchema` -> preview -> confirmation policy -> executor -> receipt。

## 2. 当前项目基线

CodeGraph 确认的现有关键结构：

- `modules/app/appAssistantPanel.js`：RH 助手面板和右下角唤出入口。
- `modules/app/appAssistantPanel.autoload.js`：自动挂载与 graphStore adapter。
- `modules/assistant/assistantContextBuilder.js`：画布上下文构建。
- `modules/assistant/assistantActionPreview.js`：动作摘要、预览和回执文案。
- `modules/assistant/assistantActionExecutor.js`：动作执行和生成任务入口。
- `api/canvasAgentApi.js`：前端 Canvas Agent API client。
- `services/canvas_agent_route_service.py`：后端 Canvas Agent 路由。
- `services/pi_bridge_service.py`：Pi JSONL sidecar bridge。
- `services/canvas_agent_action_schema.py`：Canvas action schema。
- `services/claw_action_schema.py`：Claw 历史 action schema 基础。
- `integrations/pi_canvas_agent/src/*`：Pi sidecar runner、协议和 Huanying 工具定义。

当前状态应被记录为“最小恢复态”：已有面板、对话、基础 action proposal、校验、预览和应用链路，但不能假设历史 Claw UI、完整助手历史、完整工作流模板、流式对话、附件系统和模型选择已经存在。

## 3. 产品目标

### 3.1 用户目标

- 用户可以用自然语言理解、整理、扩展和驱动当前画布。
- 用户可以通过对话创建节点、连接节点、整理布局、聚焦问题、修改节点数据。
- 用户可以上传参考图片/视频/文档，让助手基于引用生成节点和工作流。
- 用户可以选择模型、技能和执行模式。
- 用户可以看到清晰预览，在风险动作前确认，在执行后得到可审计回执。
- 用户可以恢复历史会话，并继续之前的画布创作上下文。

### 3.2 工程目标

- 助手功能与 Huanying 主业务尽量解耦。
- Agent 输出契约稳定、可测试、可回归。
- 流式对话和 action 执行分离：文本可以流式，动作必须 final 后校验。
- 每个 live 失败都能沉淀为 schema / executor / UI / scorecard 回归。
- Sidecar 可打包，不要求普通用户全局安装 Pi。

## 4. 总体架构

系统分为六层：

1. UI Shell：RH 面板、按钮、历史、附件、模型选择、流式消息、预览卡和回执。
2. Conversation：会话、消息、上下文快照、动作事务、生成记录、恢复和导出。
3. Context：画布、选区、视口、节点数据、素材、附件、模型配置和项目摘要。
4. Agent Contract：Pi / Agent 只输出 `reply/actions/warnings/requiresConfirmation`。
5. Action Runtime：schema 校验、风险分级、预览确认、执行、撤销、生成调度。
6. Regression / Packaging：离线回归、live scorecard、sidecar 打包、license/source/lockfile preflight。

## 5. 核心原则

- 不信任 Agent：Agent 输出永远是 proposal，不是 command。
- 不混用状态：streaming message 是 UI 状态，actions 是事务状态，generation task 是运行状态。
- 不隐藏成本：视频、批量生成、外部上传和扣费动作必须强确认。
- 不丢 provenance：每个生成节点必须记录 prompt、model、provider、引用、会话、动作事务和结果。
- 不绕过 adapter：助手核心不直接依赖 Huanying 内部 store，通过 adapter 注入能力。
- 不只存聊天：历史必须保存上下文快照、actions、receipts、generation tasks。

## 6. P0 需求：基础闭环

| 编号 | 需求 | 描述 | 验收标准 |
|---|---|---|---|
| P0-01 | Agent 输出契约固定 | 统一响应字段：`reply`、`actions`、`warnings`、`requiresConfirmation`、`usage`、`traceId`、`conversationId`。 | 任意响应都能被 schema validate；非法字段失败关闭或被剔除。 |
| P0-02 | 流式协议 | 支持 SSE 或 JSONL streaming；文本增量输出；actions 只在 final event 出现。 | 用户看到逐字回复；中断不会留下半截 actions。 |
| P0-03 | 流式事件类型 | 定义 `message.delta`、`message.done`、`action.proposed`、`warning`、`tool.status`、`error`、`receipt`。 | 前端能显示思考中、规划中、生成中、失败、完成。 |
| P0-04 | Action schema 版本化 | action 增加 `schemaVersion`、`actionId`、`clientMutationId`、`riskLevel`、`requiresConfirmation`。 | 老 action 兼容；新 action 可迁移。 |
| P0-05 | Pi 工具强隔离 | Pi 不注册文件和 shell 工具，只注册 Huanying 非执行 proposal 工具。 | `run_shell`、`file_write`、危险字段被拒绝。 |
| P0-06 | 上下文快照 | 每轮发送时保存 context snapshot。 | 历史会话恢复后可继续基于当时画布追问。 |
| P0-07 | 会话持久化 | 支持创建、重命名、删除、搜索、恢复、导出。 | 历史按钮可打开会话列表；刷新不丢会话。 |
| P0-08 | 动作事务 | 一次回复中的 actions 形成 transaction。 | 可预览、确认、执行、失败处理、回执、回滚。 |
| P0-09 | 权限边界 | 低风险可自动；中风险需确认；视频/外部上传/批量扣费强确认。 | 未授权视频生成必失败。 |
| P0-10 | 解耦 adapter | `modules/assistant/*` 只依赖抽象 adapter。 | 核心模块可单测，不需要真实 DOM 和主 store。 |

## 7. P1 需求：真实助手体验

### 7.1 流式对话

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-01 | 流式回复渲染 | assistant 消息逐步出现，支持停止、重试、复制。 |
| P1-02 | 多状态消息 | 消息包含 `sending`、`streaming`、`done`、`failed`、`cancelled`。 |
| P1-03 | 错误转译 | 后端错误转成用户可懂文案，同时保留 traceId。 |
| P1-04 | 上下文提示 | 显示已读取节点数、选区、模型、附件数量。 |
| P1-05 | 继续生成/改写 | 支持“继续”“只改第 2 个节点”“撤销刚才布局”。 |

### 7.2 对话控制画布

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-06 | 画布诊断 | 输出问题、建议和可选 actions。 |
| P1-07 | 创建节点 | 用 `create_node` 创建文本、图片、视频、评论、工作流节点。 |
| P1-08 | 连接节点 | 用 `connect_nodes` 建立输入输出关系。 |
| P1-09 | 更新节点数据 | 用 `update_node_data` 修改 prompt、模型、参数和 metadata。 |
| P1-10 | 自动布局 | 用 `layout_nodes` 执行 storyboard/grid/flow/tree 布局。 |
| P1-11 | 聚焦/选中 | 用 `focus_nodes` 或 view adapter 聚焦问题节点。 |
| P1-12 | 节点分组 | 用 `create_group` 标记角色区、分镜区、生成区。 |
| P1-13 | 节点复制/变体 | 用 duplicate + variant metadata 生成分支。 |

### 7.3 生成驱动节点

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-14 | 生成任务 action | 支持 `queue_generation_task` 和 `run_prompt_preset_generation`。 |
| P1-15 | pending 状态 | renderer remount 后 pending/running 状态不丢。 |
| P1-16 | 结果挂载 | 生成结果回写节点，包含 URL、缩略图、错误和 metadata。 |
| P1-17 | 生成回执 | 显示创建、启动、等待确认、失败、完成的数量。 |
| P1-18 | 批量控制 | 支持暂停、取消、重试、只重跑失败。 |
| P1-19 | provenance | 每个产物记录 prompt、model、provider、reference、会话和 action。 |

## 8. Agent 面板按钮需求

| UI 元素 | 完整需求 | 优先级 |
|---|---|---|
| 右下角 RH icon | 打开/收起；显示在线、离线、生成中、错误状态。 | P1 |
| 顶部头像/标题 | 展示 agent 状态、当前模式、当前项目。 | P2 |
| 会话 ID | 可复制；可展开查看会话元信息。 | P1 |
| 历史按钮 | 会话列表、搜索、重命名、删除、恢复、导出。 | P1 |
| 新会话按钮 | 创建新会话；可选择是否继承当前上下文。 | P1 |
| 技能列表 | 设置 `assistantIntent`，触发不同 workflow routing。 | P1 |
| 上传按钮 | 上传参考图、视频、文档，生成 attachment chip。 | P1 |
| 输入框 | 多行输入、粘贴图片、快捷键、slash command、引用。 | P1 |
| Agent pill | 选择 Ask、Plan、Canvas Agent、Generate、Doctor、Auto。 | P1 |
| @ 按钮 | 引用节点、附件、素材、历史产物、模板、文档。 | P1 |
| 文档按钮 | 添加产品 brief、品牌规范、脚本、CSV、资料。 | P2 |
| Ask 下拉 | 选择 Ask only、Propose actions、Auto safe、Generate confirm。 | P1 |
| AUTO badge | 设置自动执行策略。 | P1 |
| 爆款实验室 | 进入 Claw 历史爆款复刻工作流。 | P2 |
| 发送按钮 | 发送时变停止；支持取消 streaming。 | P1 |
| 应用按钮 | 打开动作预览；支持全部应用、逐条应用、跳过危险项。 | P1 |
| 预览卡 | 显示将创建、连接、修改、生成的 diff。 | P1 |
| 回执卡 | 显示成功、失败、耗时、可撤销项、下一步建议。 | P1 |

## 9. 附件与参考图

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-20 | 附件上传 | 图片、视频、文档上传到 Huanying 受控后端或素材系统。 |
| P1-21 | 附件 chip | 显示缩略图、文件名、类型、用途和删除入口。 |
| P1-22 | @ 引用附件 | 支持 `@参考图1`、`@节点A`、`@品牌文档`。 |
| P1-23 | 附件入 context | context 只传安全摘要、assetId、mime、尺寸、用途。 |
| P1-24 | 用途选择 | 风格参考、角色参考、构图参考、产品参考、首尾帧、mask。 |
| P1-25 | provider 适配 | 根据模型能力限制输入格式、数量和尺寸。 |

## 10. 模型选择与统一配置

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-26 | 统一配置 | 在 Huanying API Key 设置里管理 `canvas_agent` 和 `pi_canvas_agent`。 |
| P1-27 | 面板模型选择 | 面板选择当前会话模型，不直接保存 key。 |
| P1-28 | 能力矩阵 | 标明文本、图像输入、图像生成、视频生成、工具调用、上下文长度。 |
| P1-29 | 技能推荐模型 | 不同 `assistantIntent` 推荐不同 provider/model。 |
| P1-30 | 未配置降级 | 未配置时展示配置入口和最小可用模式。 |
| P1-31 | 模型记录 | 每条消息和每个生成节点记录 provider/model。 |
| P1-32 | 成本提示 | 视频、大批量、外部 provider 调用前提示成本、耗时和权限。 |

## 11. 历史会话

| 编号 | 需求 | 描述 |
|---|---|---|
| P1-33 | 消息历史 | 保存 user/assistant 消息与状态。 |
| P1-34 | 上下文历史 | 保存每轮 canvas context snapshot。 |
| P1-35 | 动作历史 | 保存 proposed/validated/applied/rejected actions。 |
| P1-36 | 生成历史 | 保存 generation task、结果、失败原因和重试。 |
| P1-37 | 会话恢复 | 重新打开后可继续追问和操作画布。 |
| P1-38 | 会话导出 | 导出 JSON / Markdown。 |
| P1-39 | 历史搜索 | 按关键词、项目、节点、技能、模型、失败状态搜索。 |

## 12. P2：恢复 Claw 历史能力

| 编号 | 能力 | 描述 |
|---|---|---|
| P2-01 | 画布医生 | 扫描孤立节点、断线、失败生成、提示词缺失、比例不一致。 |
| P2-02 | 自动整理 | 根据工作流类型做 story/grid/flow/tree 布局。 |
| P2-03 | 一句话工作流 | 一句话创建完整节点图。 |
| P2-04 | story_to_video | 故事梗概到脚本、角色、分镜、首尾帧、视频节点。 |
| P2-05 | 分镜导演 | 镜头列表、景别、运动、画面提示词、角色一致性。 |
| P2-06 | 变体分支 | 风格、镜头、文案、构图、模型分支。 |
| P2-07 | 模板强确认 | 模板应用前展示节点/线/生成任务预览。 |
| P2-08 | 爆款实验室 | 上传参考视频/图文，拆解并复刻 workflow。 |

## 13. P3：发布与维护

- Node 22+ Pi sidecar 打包。
- 不要求普通用户全局安装 Pi。
- runtime/source/license/lockfile/source tree preflight。
- 离线回归覆盖 API、schema、UI、executor、Pi mock。
- Action schema、conversation schema、context schema 版本迁移。
- Live failure 全部转成 scorecard 和回归测试。

## 14. 推荐实施顺序

1. 固定 streaming + final action contract。
2. 建 conversation/session persistence。
3. 实现附件、参考图和引用。
4. 实现模型选择和能力矩阵。
5. 升级 action preview/apply/receipt。
6. 扩展真实画布控制 actions。
7. 接入生成任务 pending/running/result 生命周期。
8. 实现画布医生和自动整理。
9. 恢复 story_to_video、分镜导演、变体分支。
10. 完成 sidecar 打包、离线 preflight、live scorecard。

