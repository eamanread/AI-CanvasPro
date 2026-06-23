# Pi Canvas Agent 对齐 Claw-code P0-P4 产品说明文档

状态：v1.0 产品/交互/数据规格  
日期：2026-06-05  
项目：`D:\Aic\huanying-source-windows-20260430-122116`  
目标：基于 Claw-code 助手最新规划与历史最终实现，定义 Pi Canvas Agent 从 P0 到 P4 的完整产品能力、交互设计、字段协议、后端数据与验收口径。

---

## 0. 文档定位

本文是给产品、前端、后端、Agent/Sidecar、QA、发布负责人和后续接力开发者使用的产品说明文档，不是简单功能列表。

它回答五个问题：

1. 如果目标是 Claw-code 助手最终规划能力，Pi Canvas Agent 应具备哪些功能。
2. 每个功能的用户价值、交互表现、字段数据和后端职责是什么。
3. P0-P4 的优先级如何划分，哪些必须先做，哪些是后续平台化。
4. 强背景团队会如何基于 AI 创作工具、节点画布、Agent 安全边界和生成任务系统的默会知识落地。
5. 如何定义“完成”，避免文档完成但产品不可用。

本文以以下原则作为最高约束：

- Pi 只做意图理解、流式回复和结构化 proposal，不直接改画布。
- Huanying 持有上下文、schema、预览、确认、执行、生成、历史、回归和发布边界。
- 所有画布变更必须经过 schema、preview、confirmation policy、latest context validate、executor、receipt/history。
- 视频生成、模板保存、团队库写入、删除、批量覆盖等高风险动作必须强确认。
- 普通用户不能被要求安装全局 Pi、Node 或开发依赖。

---

## 1. 优先级定义

| 优先级 | 定义 | 产品判断标准 |
|---|---|---|
| P0 | 不补就无法对齐 Claw 最新目标闭环，尤其是 `story_to_video`、真实模型 action 稳定、真实浏览器落画布 | 没有它，Pi 助手只能算“面板/壳/演示”，不能算可交付创作助手 |
| P1 | 用户可反复使用所需的产品化体验与恢复能力 | 没有它，功能可以跑一次，但用户无法放心继续创作 |
| P2 | Claw 已规划/部分实现过的高级创作能力迁移到 Pi | 没有它，Pi 有基础助手，但缺少 Claw 的“哇塞创作能力” |
| P3 | 模板团队化、发布治理、CI/数据化运营 | 没有它，不能规模化交付给普通用户和团队 |
| P4 | 长期平台能力、生态能力和智能创作中台化 | 面向多项目、多团队、多模型、多模板、多 Agent 协作的长期演进 |

---

## 2. 一句话产品目标

把 Pi Canvas Agent 做成 Huanying 画布上的对话式创作操作系统：用户用自然语言、选区、引用素材和历史上下文，让助手理解当前画布，提出结构化动作，预览风险，安全应用低风险改动，驱动文本/图片生成，强确认视频生成，保存完整历史，并逐步恢复 Claw-code 历史中的画布医生、自动整理、一句话工作流、story_to_video、分镜导演、变体分支、Prompt 手术台和模板炼金术能力。

---

## 3. 目标用户与核心场景

### 3.1 目标用户

| 用户 | 目标 | 对助手的期望 |
|---|---|---|
| AI 短片创作者 | 快速把想法拆成故事、分镜、关键图、视频准备链路 | 能理解“15 秒故事短片”，自动搭好故事视频工作流 |
| 电商/营销设计师 | 批量生成主图、详情图、社媒素材和营销短视频 | 能从参考图和品牌要求生成多个方向，并保持成本可控 |
| 节点画布重度用户 | 维护复杂画布、诊断失败、整理结构 | 能检查问题、标注问题、自动整理、聚焦关键节点 |
| 团队模板维护者 | 把成熟子图沉淀为模板，复用给团队 | 能识别输入/输出/参数，支持权限和版本治理 |
| QA/开发接力者 | 稳定复现模型输出和浏览器行为 | 每次失败都能落 fixture、scorecard 和 artifact |

### 3.2 核心用户旅程

#### 3.2.1 一句话 story_to_video

1. 用户打开右下角 Pi/RH 助手面板。
2. 状态条显示当前文本模型、配置可用、当前会话。
3. 用户输入：“做一个 15 秒雨夜赛博追逐故事短片。”
4. 前端构建脱敏 context：项目、画布、选区、节点、边、附件、引用、历史、生成状态。
5. Pi sidecar 调用模型，流式返回自然语言说明。
6. final `message.done` 返回 actions。
7. 预览卡显示“故事视频工作流”：1 个故事大纲、1 个风格设定、3-5 个分镜、关键图、视频准备节点。
8. 文本/图片生成可排队，视频只创建准备节点。
9. 用户点击应用。
10. 前端用最新 context 调 `/actions/validate`。
11. executor 创建节点、连接、分组、布局、聚焦。
12. receipt 写明创建内容、跳过的视频生成、生成任务状态。
13. 历史保存 messages、context snapshot、transaction、receipt、generation tasks。

#### 3.2.2 参考图驱动创作

1. 用户上传参考图。
2. 附件进入受控 attachment/asset store。
3. 用户给附件标记用途：角色参考、风格参考、构图参考、产品参考、首帧、mask。
4. 用户输入：“用这张图作为角色参考，做 4 个短片分镜。”
5. context 只传 `assetId/mime/dimensions/usage/thumbnailHint`，不传本地路径、blob URL、data URL、token。
6. Pi 输出分镜或 story_to_video actions。
7. preview 显示引用素材与用途。
8. apply 后画布生成可继续编辑的分镜结构。

#### 3.2.3 画布诊断与整理

1. 用户输入：“检查这个画布哪里有问题，并整理一下。”
2. Canvas Doctor 读取 diagnostics：失败节点、缺 prompt、断线、孤立节点、重复命名、布局重叠。
3. preview 展示 3-8 条诊断和建议。
4. 用户可选择只聚焦问题、落注释，或执行安全整理。
5. Auto Layout 只执行 layout/move/group/rename/focus/set_viewport。
6. receipt 说明诊断项、移动节点数、创建分组数、未修改 prompt/model/assets/generation。

---

## 4. 产品原则

### 4.1 不信任 Agent

Agent 永远只输出 proposal，不拥有执行权限。所有执行都由 Huanying 完成。

```text
model output
  -> normalize / parse
  -> backend schema validation
  -> frontend preview
  -> confirmation policy
  -> latest context validate
  -> executor
  -> receipt / history / transaction
```

### 4.2 只信任 final actions

- `message.delta` 只渲染文本。
- `tool.status` 只显示状态。
- `warning` 只提示风险。
- 只有 `message.done.actions` 可进入 pending actions。
- delta 中即使出现 actions，也必须忽略并记录 warning/fixture。

### 4.3 成本和风险显性化

| 行为 | 默认策略 |
|---|---|
| 创建 comment/source-text/连接/布局/聚焦 | 可低风险自动或一键应用 |
| 文本/图片生成 | schema 通过后可 queue/pending/running |
| 视频生成 | 必须强确认 + 后端 `videoAuthorized=true` |
| 模板保存 | 必须强确认 |
| 团队库写入 | P3/P4，必须权限校验 |
| 删除/覆盖/批量复制大选区 | 默认禁止或强确认 |

### 4.4 可解释、可回退、可复盘

一次 assistant 回复必须形成一笔 transaction。系统需要知道：

- 使用了哪个模型。
- 读了哪些上下文。
- 引用了哪些素材。
- 提出了哪些 actions。
- 用户勾选了哪些 actions。
- validate 结果是什么。
- executor 执行结果是什么。
- 生成任务状态是什么。
- receipt 如何展示。
- 历史如何恢复。

### 4.5 UI 是创作驾驶舱

面板不是普通聊天泡泡。它必须让用户看到：模型、模式、上下文、引用、风险、动作、生成状态、历史和下一步建议。

---

## 5. 信息架构

### 5.1 面板区域

| 区域 | 内容 | 优先级 |
|---|---|---|
| Launcher | 右下角入口，复用现有 FAB 或 Pi/RH 助手按钮 | P0 |
| Header | 标题、状态、模型、历史、新会话、关闭 | P0 |
| Status Strip | 模型可用性、runtime、当前模式、streaming/applying 状态 | P0/P1 |
| Skill Launcher | 快捷意图：story_to_video、画布医生、自动整理、分镜、变体、模板 | P1/P2 |
| Message Stream | 用户消息、assistant delta、warning、done、error | P0 |
| Composer | 输入框、上传、@ 引用、模型选择、发送、停止、重试 | P0/P1 |
| Attachment Tray | 附件 chip、缩略图、usage、删除/失败态 | P1 |
| Action Preview | 分组卡、逐条勾选、风险、影响范围、强确认 | P0/P1 |
| Receipt | 执行结果、warnings、generation task 状态、聚焦按钮 | P0/P1 |
| History Drawer | 会话列表、搜索、恢复、删除、重命名、导出 | P1 |
| Debug/Context Drawer | context preview、trace、fixture candidate | P1/P3 |

### 5.2 面板状态机

```text
idle
  -> composing
  -> sending
  -> streaming
  -> done_no_actions
  -> done_pending_actions
  -> validating
  -> applying
  -> applied
  -> failed
  -> cancelled
```

字段：

```json
{
  "status": "idle | sending | streaming | done_pending_actions | validating | applying | applied | failed | cancelled",
  "streaming": true,
  "conversationId": "conv_xxx",
  "messageCount": 4,
  "pendingActionCount": 12,
  "selectedActionCount": 10,
  "referenceCount": 2,
  "generationTaskCount": 3,
  "runningGenerationTaskCount": 1,
  "modelConfigRequired": false
}
```

---

## 6. 功能清单总览

### 6.1 P0 功能

| 编号 | 功能点 | 功能描述 | 验收口径 |
|---|---|---|---|
| P0-01 | 统一文本模型配置 | 使用设置里的文本模型，不新增独立 Pi 配置入口 | status/provider/model 显示可用；无 key 泄露 |
| P0-02 | 流式聊天闭环 | 支持 `message.start/delta/warning/done/error` | delta 渲染，done 归并 actions |
| P0-03 | Final-only actions | 只有 `message.done.actions` 可执行 | delta actions 被忽略且不 mutate canvas |
| P0-04 | Pi proposal-only | Pi 只提 proposal，不执行 shell/file/browser/MCP/package | dangerous action fail-closed |
| P0-05 | Action schema fail-closed | 校验 action 类型、字段、引用、危险值 | 非法 action 不进入 executor |
| P0-06 | Action preview/apply/receipt | 用户可看懂、选择、应用、获得回执 | create/connect/layout/generation 分组显示 |
| P0-07 | 视频强确认 | ai-video generation 未授权不得启动 | schema + preview + executor 三层拦截 |
| P0-08 | story_to_video 标杆 | 创建故事大纲、风格设定、分镜、关键图、视频准备节点 | fixture/live 能落画布 |
| P0-09 | 真实模型 action repair | 支持 alias、nested metadata、fenced JSON、缺 nodeType 推断 | 每类 repair 有测试 |
| P0-10 | latest context validate | apply 前用当前画布重新 validate | stale/unknown node 阻断 |
| P0-11 | conversation 基础持久化 | 保存消息、context、actions、receipt | 历史恢复不自动执行 pending |
| P0-12 | generation task 基础状态 | queued/running/completed/failed/cancelled | receipt/history 可见 |
| P0-13 | offline regression | fixture 可离线验证核心旅程 | 无真实 key/无外网可跑 |
| P0-14 | 8777 browser 验收 | 授权后验证真实页面 | artifact 包含截图和状态 |

### 6.2 P1 功能

| 编号 | 功能点 | 功能描述 | 验收口径 |
|---|---|---|---|
| P1-01 | 分组预览卡增强 | diagnostics/create/connect/update/layout/generation/workflow/other | 每组有标题、数量、样例、风险 |
| P1-02 | 逐条勾选/跳过 | 用户可取消部分 action 后应用 | 只 validate/apply 被选 actions |
| P1-03 | 附件 usage | style/character/composition/product/firstFrame/mask/general | context 中带 usage |
| P1-04 | @ 引用 MVP | 节点/素材/附件引用写入 context.references | 请求 payload 可验证 |
| P1-05 | 历史高级管理 | 搜索、恢复、删除、重命名、导出 | 恢复 pending 不自动执行 |
| P1-06 | 生成任务可视化 | 面板显示 generation 状态和任务 ID | failed 可定位原因 |
| P1-07 | 友好错误恢复 | friendly message、errorCode、trace、copy diagnostics、retryable | 不展示 raw secret |
| P1-08 | Canvas Doctor MVP | 诊断失败、缺 prompt、断线、孤立、重复命名 | 3-8 条结构化诊断 |
| P1-09 | Auto Layout MVP | single_chain/branch_flow/storyboard_grid/asset_lane/problem_lane | 不改 prompt/model/assets/generation |
| P1-10 | Context Debug | 用户/QA 可看到模型读了什么 | 脱敏 context preview |
| P1-11 | stop/retry UX | streaming 可停止，失败可重试 | stop 后不应用 final actions |
| P1-12 | fixture candidate | live 失败能沉淀成候选 fixture | 归因 schema/executor/UI/API |

### 6.3 P2 功能

| 编号 | 功能点 | 功能描述 | 验收口径 |
|---|---|---|---|
| P2-01 | 一句话工作流全套 | text_to_image/image_to_video/text_to_image_video/image_variants | 节点、连接、布局、receipt 完整 |
| P2-02 | 分镜导演 | 3-8 个 shot groups，镜头语言、prompt、连续性 | 可只改第 N 镜 |
| P2-03 | 变体分支 | 选中子图复制 3-5 条差异化分支 | 默认不扣费，分组清晰 |
| P2-04 | Prompt 手术台 | 局部改写 prompt，显示 diff，保留原意 | 支持撤销 |
| P2-05 | 爆款实验室 | 从参考视频/图文拆解为可复刻 workflow | 输出结构化复刻工作流 |
| P2-06 | LLM Wiki/知识卡片 | read-only 检索、知识卡片落画布、引用 trace | 不越权写知识库 |
| P2-07 | 项目偏好记忆 | 风格、比例、模型、命名、品牌语气跨会话 | context 有 preferences |
| P2-08 | 大画布语义压缩 | 选区优先、子图摘要、边界节点、生成状态摘要 | 大画布不靠机械截断 |
| P2-09 | 端口/连线语义 | source/target handle、类型兼容、方向校验 | 常用链路连接正确 |
| P2-10 | Prompt preset 产品化 | 助手调用文本/图片预设生成，隐藏模板细节 | 视频仍强确认 |

### 6.4 P3 功能

| 编号 | 功能点 | 功能描述 | 验收口径 |
|---|---|---|---|
| P3-01 | 模板保存 | 从成熟子图提炼 template asset | 保存后有 templateId |
| P3-02 | 模板复用 | 菜单或一句话再次创建模板 workflow | 新画布可复用 |
| P3-03 | 模板权限/版本 | scope、author、version、tags、deprecated、rollback | 团队治理可审计 |
| P3-04 | 团队模板库 | 审核、更新、弃用、回滚、复用统计 | 团队共享可控 |
| P3-05 | 发布打包 | bundled Node/Pi sidecar，无全局依赖 | 普通用户离线可运行 |
| P3-06 | CI scorecard | live/browser/offline 结果趋势化 | 每次回归有评分 |
| P3-07 | 视觉 diff | 关键区域截图稳定 diff | 避免 UI 回归 |
| P3-08 | 多项目历史同步 | conversation/generation/template 跨设备/团队 | 权限隔离 |

### 6.5 P4 功能

| 编号 | 功能点 | 功能描述 | 验收口径 |
|---|---|---|---|
| P4-01 | 多 Agent 协作 | 分镜、提示词、布局、生成、QA 多 Agent 分工 | 每个 Agent 权限最小化 |
| P4-02 | 智能创作中台 | 将模板、偏好、资产、历史、模型能力统一编排 | 支持跨项目工作流 |
| P4-03 | A/B 实验与数据闭环 | 记录模板成功率、生成成功率、用户采纳率 | 数据驱动改进 |
| P4-04 | 企业审计 | 所有 AI 操作可追踪、可审计、可导出 | 满足团队合规 |
| P4-05 | 可插拔模型能力路由 | 按 text/vision/action_planning/low_latency/high_quality 路由 | 模型选择自动化 |
| P4-06 | 跨端协作 | Web/Desktop/团队云空间状态一致 | 用户切换设备不丢上下文 |

---

## 7. 交互设计详述

### 7.1 Header

字段：

```json
{
  "title": "Pi Canvas Agent",
  "conversationId": "conv_xxx",
  "modelLabel": "gpt-5.5",
  "providerLabel": "model_registry",
  "runtimeStatus": "ready | missing_runner | unconfigured | failed",
  "streaming": false,
  "applying": false
}
```

交互：

- 点击模型 pill 打开模型菜单。
- 点击历史按钮打开历史抽屉。
- 点击加号新建会话。
- runtime/provider 不可用时显示错误状态和配置入口。

### 7.2 Skill Launcher

P0/P1 推荐展示：

| Skill | 触发 intent | 默认 prompt |
|---|---|---|
| 故事视频 | `story_to_video` | “把当前想法拆成故事大纲、风格设定、分镜文本、关键图和视频准备节点。” |
| 检查画布 | `canvas_doctor` | “检查当前画布的问题，给出诊断和建议。” |
| 自动整理 | `auto_layout` | “整理当前画布，让链路更清晰，不修改 prompt/model/assets。” |
| 参考图创作 | `reference_creation` | “基于上传素材生成创作方向。” |

Skill 点击行为：

1. 设置 `assistantIntent`。
2. 将 prompt 填入输入框。
3. 不自动发送，除非后续产品明确支持。
4. context 中带：

```json
{
  "assistantIntent": {
    "id": "story_to_video",
    "title": "故事视频",
    "source": "skill_launcher"
  }
}
```

### 7.3 Composer

交互要求：

- Enter 发送，Shift+Enter 换行。
- streaming 中发送按钮变 stop。
- 失败后显示 retry。
- 模型未配置时发送 disabled，并显示去设置文本模型。
- 上传按钮支持多文件。
- @ 按钮打开引用选择器。

Composer 请求字段：

```json
{
  "message": "做一个15秒雨夜赛博追逐故事短片",
  "mode": "actions",
  "conversationId": "conv_xxx",
  "model": {
    "provider": "model_registry",
    "modelId": "text_default",
    "model": "gpt-5.5",
    "displayName": "GPT-5.5"
  },
  "assistantIntent": {
    "id": "story_to_video",
    "title": "故事视频",
    "source": "skill_launcher"
  },
  "attachments": [],
  "context": {}
}
```

### 7.4 Attachment Tray

附件 chip 显示：

```text
[缩略图] role.png · style ▼ · x
```

Usage 枚举：

```json
[
  "style",
  "character",
  "composition",
  "product",
  "firstFrame",
  "mask",
  "general",
  "reference"
]
```

Attachment context 字段：

```json
{
  "id": "att_xxx",
  "kind": "image",
  "name": "role.png",
  "mime": "image/png",
  "size": 123456,
  "width": 1024,
  "height": 1024,
  "dimensions": { "width": 1024, "height": 1024 },
  "assetId": "asset_xxx",
  "usage": "character",
  "thumbnailHint": "character reference image"
}
```

禁止进入 context：

- `C:\Users\...`
- `D:\...`
- `blob:...`
- `data:image/...`
- signed URL token/query
- API key / Authorization / Bearer

### 7.5 @ 引用 Resolver

MVP 数据结构：

```json
{
  "id": "ref_node_n1",
  "kind": "node",
  "targetId": "n1",
  "label": "角色设定",
  "nodeType": "source-text",
  "usage": "target",
  "assetId": "",
  "thumbnailHint": ""
}
```

搜索源：

| 来源 | kind | P1 要求 |
|---|---|---|
| 当前选区节点 | node | 必须 |
| 画布节点 | node | 必须 |
| 附件 | attachment | 必须 |
| 项目素材 | asset | 建议 |
| 历史会话 | conversation | P2 |
| 模板 | template | P3 |

交互：

1. 用户点击 @ 或输入 @。
2. 弹出搜索框。
3. 列出节点/附件/素材。
4. 选择后插入 token，并写入 `context.references.items`。
5. hover 显示名称、类型、缩略图或摘要。

### 7.6 Action Preview

Preview model：

```json
{
  "actionCount": 18,
  "selectedActionCount": 16,
  "selectedIndexes": [0,1,2],
  "sections": [
    {
      "id": "workflow",
      "title": "故事视频工作流：将创建 11 个节点和 10 条连接",
      "risk": "medium",
      "items": ["故事大纲", "风格设定", "3 个镜头"],
      "actions": []
    }
  ],
  "riskSummary": {
    "high": 0,
    "medium": 8,
    "low": 10,
    "videoGeneration": 0,
    "diagnostics": 0
  },
  "requiresStrongConfirmation": false,
  "requiresConfirmation": true
}
```

Preview 分组规则：

| section | action types |
|---|---|
| diagnostics | 带 `diagnosticKind/diagnosticSeverity/diagnosticSuggestion` 的动作 |
| create_nodes | `create_node` |
| connect_nodes | `connect_nodes` |
| update_nodes | `update_node_data`, `rename_node` |
| layout | `layout_nodes`, `move_nodes`, `focus_nodes`, `set_viewport`, `create_group` |
| generation | `queue_generation_task`, `run_prompt_preset_generation` |
| workflow | `create_workflow_template`, workflow metadata batch |
| other | 其他安全但未归类动作 |

### 7.7 Strong Confirmation

触发条件：

- `nodeType=ai-video` 的 generation action。
- `create_workflow_template`。
- 批量复制超过上限。
- delete/overwrite 类动作。
- 团队库写入。

UI 文案：

```text
需要确认：本次操作包含视频生成或高风险动作。
视频节点可以准备，但启动视频生成可能消耗额度。请输入 APPLY 或点击确认后继续。
```

确认字段：

```json
{
  "videoAuthorized": true,
  "strongConfirmationApproved": true,
  "confirmationText": "APPLY"
}
```

### 7.8 Receipt

Receipt 字段：

```json
{
  "id": "rcpt_xxx",
  "transactionId": "txn_xxx",
  "success": true,
  "summary": "Created 11 nodes, connected 10 edges, queued 4 generation tasks. Video generation was not started.",
  "details": {
    "appliedCount": 18,
    "createdNodeIds": [],
    "createdEdgeIds": [],
    "updatedNodeIds": [],
    "queuedGenerationNodeIds": [],
    "startedGenerationNodeIds": [],
    "completedGenerationNodeIds": [],
    "failedGenerationNodeIds": [],
    "skippedVideoGenerationNodeIds": [],
    "warnings": []
  },
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

Receipt 交互：

- 显示简短 summary。
- 可展开 details。
- 可复制 trace。
- 可聚焦新节点。
- 可重试失败 generation task。

---

## 8. 后端 API 规格

### 8.1 `GET /api/v2/canvas-agent/status`

响应：

```json
{
  "success": true,
  "available": true,
  "status": "ready",
  "runtime": {
    "configured": true,
    "running": false,
    "status": "ready",
    "runnerPath": "[REDACTED_PATH]"
  },
  "provider": {
    "name": "model_registry",
    "configured": true,
    "apiUrl": "https://right.codes/codex/v1",
    "endpoint": "https://right.codes/codex/v1",
    "model": "gpt-5.5",
    "defaultModel": "gpt-5.5",
    "providerType": "openai_compatible",
    "apiKeyPresent": true,
    "proxyTokenPresent": false,
    "reasons": []
  }
}
```

不得返回：

- apiKey 明文。
- proxyToken 明文。
- Authorization header。
- 本地绝对路径。

### 8.2 `POST /api/v2/canvas-agent/chat`

请求：

```json
{
  "message": "检查画布并整理一下",
  "mode": "actions",
  "conversationId": "conv_xxx",
  "model": {},
  "assistantIntent": {},
  "context": {}
}
```

响应：

```json
{
  "success": true,
  "reply": "我会先诊断问题，再整理结构。",
  "actions": [],
  "warnings": [],
  "requiresConfirmation": false,
  "conversationId": "conv_xxx",
  "messageId": "msg_xxx",
  "traceId": "trace_xxx"
}
```

### 8.3 `POST /api/v2/canvas-agent/chat/stream`

Content-Type：`application/x-ndjson; charset=utf-8`

Frames：

```json
{"type":"message.start","conversationId":"conv_xxx","messageId":"msg_xxx","traceId":"trace_xxx"}
{"type":"message.delta","delta":"我会创建故事大纲和分镜..."}
{"type":"warning","message":"视频生成需要确认，不会自动启动。"}
{"type":"message.done","reply":"已准备故事视频工作流。","actions":[],"warnings":[],"requiresConfirmation":false}
```

规则：

- `message.delta.actions` 必须被清空或忽略。
- `message.done.actions` 才是最终 action 来源。
- `error` frame 必须包含 friendly message 和 errorCode。

### 8.4 `POST /api/v2/canvas-agent/actions/validate`

请求：

```json
{
  "actions": [],
  "context": {},
  "videoAuthorized": false
}
```

响应：

```json
{
  "success": true,
  "valid": true,
  "actions": [],
  "warnings": [],
  "errors": [],
  "requiresConfirmation": false
}
```

校验职责：

- action alias repair。
- 节点引用存在性检查。
- same-batch created id 映射。
- workflow metadata 白名单。
- dangerous key/value 拦截。
- video authorization 检查。
- auto_layout intent 下 forbidden action 拦截。

### 8.5 `POST /api/v2/canvas-agent/context/preview`

响应：

```json
{
  "success": true,
  "context": {
    "project": {},
    "canvas": {},
    "selection": {},
    "attachments": {},
    "references": {}
  },
  "warnings": []
}
```

用途：

- QA 检查模型会读到什么。
- 用户理解引用和上下文范围。
- 失败时生成 fixture candidate。

### 8.6 Conversations API

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/v2/canvas-agent/conversations` | list/search |
| POST | `/api/v2/canvas-agent/conversations` | create |
| GET | `/api/v2/canvas-agent/conversations/{id}` | get |
| PATCH | `/api/v2/canvas-agent/conversations/{id}` | rename |
| DELETE | `/api/v2/canvas-agent/conversations/{id}` | delete |
| POST | `/api/v2/canvas-agent/conversations/{id}/messages` | append message |
| POST | `/api/v2/canvas-agent/conversations/{id}/context-snapshots` | attach context |
| POST | `/api/v2/canvas-agent/conversations/{id}/transactions` | append transaction |
| POST | `/api/v2/canvas-agent/conversations/{id}/receipts` | append receipt |
| POST | `/api/v2/canvas-agent/conversations/{id}/generation-tasks` | append generation task |
| GET/POST | `/api/v2/canvas-agent/conversations/{id}/export` | export sanitized |

### 8.7 Generation Tasks API

| Method | Path | 功能 |
|---|---|---|
| GET | `/api/v2/canvas-agent/generation-tasks` | list by conversation/node/status |
| POST | `/api/v2/canvas-agent/generation-tasks` | create |
| PATCH | `/api/v2/canvas-agent/generation-tasks/{id}` | update status/result/error |

---

## 9. 数据模型

### 9.1 Assistant Context

```json
{
  "project": {
    "id": "project_xxx",
    "name": "Project Name"
  },
  "canvas": {
    "nodeCount": 20,
    "edgeCount": 19,
    "nodes": [],
    "edges": [],
    "diagnostics": {},
    "layoutHints": {}
  },
  "selection": {
    "selectedNodeIds": []
  },
  "assets": {
    "items": []
  },
  "workflows": {
    "items": []
  },
  "promptPresets": {
    "items": []
  },
  "references": {
    "items": []
  },
  "attachments": {
    "items": []
  },
  "assistantIntent": {
    "id": "story_to_video",
    "title": "故事视频",
    "source": "skill_launcher"
  }
}
```

### 9.2 Canvas Diagnostics

```json
{
  "failedNodeIds": [],
  "missingPromptNodeIds": [],
  "danglingEdgeIds": [],
  "isolatedNodeIds": [],
  "duplicateNameGroups": [
    { "name": "AI Image", "nodeIds": ["n1", "n2"] }
  ],
  "recommendedFocusNodeIds": []
}
```

### 9.3 Layout Hints

```json
{
  "coordinateSystem": "absolute_xy_top_left",
  "targetNodeIds": [],
  "bounds": { "x": 0, "y": 0, "width": 1000, "height": 600 },
  "suggestedOrigin": { "x": 1200, "y": 0 },
  "defaultGap": 96,
  "strategies": ["single_chain", "branch_flow", "storyboard_grid", "asset_lane", "problem_lane"],
  "forbiddenEdits": ["prompt", "model", "assets", "generation", "delete"]
}
```

### 9.4 Action Envelope

```json
{
  "schemaVersion": "canvas-agent-action-v1",
  "actionId": "act_xxx",
  "type": "create_node",
  "riskLevel": "low | medium | high",
  "requiresConfirmation": false,
  "reason": "Build story outline node",
  "metadata": {
    "conversationId": "conv_xxx",
    "messageId": "msg_xxx",
    "traceId": "trace_xxx",
    "assistantIntent": "story_to_video"
  }
}
```

### 9.5 Allowed Actions

| Action | P0/P1 支持 | 字段 |
|---|---|---|
| `create_node` | 是 | `nodeId/id`, `nodeType`, `name`, `data`, `position`, `size` |
| `update_node_data` | 是 | `nodeId`, `data/patch`, `prompt`, `model` |
| `rename_node` | 是 | `nodeId`, `name/title` |
| `connect_nodes` | 是 | `from`, `to`, `label` |
| `layout_nodes` | 是 | `layout`, `nodeIds` |
| `move_nodes` | 是 | `nodeIds`, `positions`, `gap` |
| `focus_nodes` | 是 | `nodeIds` |
| `set_viewport` | 是 | `nodeIds` 或 viewport 参数 |
| `create_group` | 是 | `nodeIds`, `name`, `padding`, `data` |
| `duplicate_nodes` | P2 | `nodeIds`, `metadata` |
| `queue_generation_task` | 是 | `nodeId`, `nodeType`, `prompt`, `provider`, `model`, `references` |
| `run_prompt_preset_generation` | P1/P2 | `nodeId`, `nodeType`, `presetId/presetName`, `template`, `inputs` |
| `create_workflow_template` | P3 | `name`, `nodeIds`, `metadata`, strong confirm |

### 9.6 Story-to-video Metadata

```json
{
  "workflowKind": "story_to_video",
  "workflowGroupId": "wf_story_video_xxx",
  "workflowStep": "story_outline | style_bible | shot_script | shot_keyframe | shot_video",
  "storyDurationSec": 15,
  "shotIndex": 1,
  "shotDurationSec": 3,
  "shotTitle": "镜头 1：雨夜街头",
  "shotPrompt": "cinematic cyberpunk chase, rain, neon reflections",
  "shotVideoPrompt": "fast dolly forward, handheld chase feeling"
}
```

### 9.7 Conversation

```json
{
  "id": "conv_xxx",
  "title": "雨夜赛博追逐短片",
  "projectId": "project_xxx",
  "workspaceId": "workspace_xxx",
  "canvasId": "canvas_xxx",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "updatedAt": "2026-06-05T00:00:00.000Z",
  "assistantIntent": {},
  "model": {},
  "messages": [],
  "contextSnapshots": [],
  "transactions": [],
  "generationTasks": [],
  "receipts": []
}
```

### 9.8 Message

```json
{
  "id": "msg_xxx",
  "role": "user | assistant",
  "content": "",
  "status": "done | streaming | failed",
  "kind": "normal | error",
  "errorCode": "",
  "traceId": "trace_xxx",
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

### 9.9 Transaction

```json
{
  "id": "txn_xxx",
  "status": "proposed | pending | applied | failed | cancelled",
  "messageId": "msg_xxx",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "updatedAt": "2026-06-05T00:00:00.000Z",
  "actions": [],
  "selectedActionIndexes": [],
  "validation": {},
  "receipt": {},
  "receiptId": "rcpt_xxx"
}
```

### 9.10 Generation Task

```json
{
  "id": "gen_xxx",
  "idempotencyKey": "txn_xxx:node_xxx:queue_generation_task",
  "transactionId": "txn_xxx",
  "conversationId": "conv_xxx",
  "messageId": "msg_xxx",
  "traceId": "trace_xxx",
  "nodeId": "node_xxx",
  "nodeType": "ai-image",
  "provider": "",
  "model": "",
  "prompt": "",
  "references": [],
  "status": "queued | running | completed | failed | cancelled",
  "result": {},
  "error": "",
  "createdAt": "2026-06-05T00:00:00.000Z",
  "updatedAt": "2026-06-05T00:00:00.000Z",
  "startedAt": "",
  "completedAt": ""
}
```

---

## 10. Mode / Intent 规则

### 10.1 `actions` mode

默认模式。允许安全 canvas actions。

### 10.2 `doctor` mode

允许：

- diagnostics。
- `focus_nodes`。
- `create_node` comment/source-text 注释。
- `set_viewport`。

禁止：

- 生成。
- 删除。
- 覆盖 prompt/model/assets。

### 10.3 `auto_layout` mode

允许：

- `layout_nodes`
- `move_nodes`
- `create_group`
- `rename_node`
- `focus_nodes`
- `set_viewport`

禁止：

- `create_node` 内容节点。
- `update_node_data` 修改 prompt/model/assets。
- `queue_generation_task`。
- 删除。

### 10.4 `story_to_video` intent

必须优先输出 story_to_video 结构，不退化成普通 `text_to_image_video`。

---

## 11. 错误处理

### 11.1 错误分类

| code | 场景 | 用户文案 |
|---|---|---|
| `model_not_configured` | 文本模型未配置 | 请先在设置里配置文本模型后再发送 |
| `pi_runtime_failed` | sidecar 运行失败 | Pi 助手内核启动失败，请复制诊断给开发者 |
| `pi_timeout` | 模型或 sidecar 超时 | 助手响应超时，请重试 |
| `pi_invalid_response` | 返回非 JSON 或非法 frame | 助手返回了无法识别的响应，已阻止执行 |
| `invalid_actions` | action schema 失败 | 动作校验失败，未修改画布 |
| `video_confirmation_required` | 视频未授权 | 视频生成需要确认，当前只准备节点 |
| `renderer_not_mounted` | 生成节点未挂载 | 生成任务已排队，等待节点挂载 |
| `generation_failed` | 生成失败 | 生成失败，可查看原因并重试 |
| `stream_aborted` | 用户停止 | 已停止本次回复，不会应用未完成动作 |

### 11.2 Error UI

错误卡字段：

```json
{
  "friendlyMessage": "动作校验失败，未修改画布。",
  "errorCode": "invalid_actions",
  "traceId": "trace_xxx",
  "diagnostics": ["action[3] video generation requires confirmation"],
  "retryable": true
}
```

交互：

- 显示 friendlyMessage。
- 展开 diagnostics。
- 复制 trace。
- retry。
- 生成 fixture candidate。

---

## 12. 安全与隐私

### 12.1 永久禁止泄露

- API key。
- Bearer token。
- proxy token。
- Authorization header。
- password/secret/credential。
- Windows 本地绝对路径。
- blob/data URL。
- signed URL query。
- 完整项目 JSON。

### 12.2 Dangerous Action 拦截

包含以下 term 的 action 必须 fail-closed：

```json
[
  "shell",
  "bash",
  "powershell",
  "file",
  "browser",
  "mcp",
  "package",
  "network",
  "delete"
]
```

删除类动作如果未来开放，必须 P2/P3 单独设计强确认和 undo，不在 P0/P1 默认开放。

### 12.3 双重视频防线

三层防线：

1. backend schema：没有 `videoAuthorized=true` 时拒绝 ai-video generation。
2. frontend preview：显示 strong confirmation。
3. executor：根据 action 或目标节点推断 nodeType，再次拦截。

---

## 13. 验收标准

### 13.1 P0 验收

| 验收项 | 通过标准 |
|---|---|
| 模型配置 | 使用设置文本模型，status 不泄密 |
| streaming | start/delta/warning/done 顺序正确 |
| final-only actions | delta actions 不执行 |
| preview/apply | 可预览、勾选、validate、执行、receipt |
| story_to_video | 结构完整，视频只准备 |
| video gate | 未授权不启动视频生成 |
| schema repair | alias/nested metadata/缺 nodeType 有测试 |
| history | 恢复 pending actions 不自动执行 |
| regression | Node/Python/offline fixture 通过 |
| live | 授权后 8777 artifact 可证明真实页面可用 |

### 13.2 P1 验收

| 验收项 | 通过标准 |
|---|---|
| 附件 usage | usage 写入 context，敏感字段脱敏 |
| @ 引用 | references 写入 context |
| generation lifecycle | 状态进入 receipt/history |
| doctor | 结构化诊断可见 |
| auto layout | 只布局，不改内容/生成 |
| friendly error | 复制 trace 可用 |
| context debug | 可查看脱敏 context |
| fixture candidate | 失败可沉淀回归 |

### 13.3 推荐命令

```powershell
D:\Aic\node.exe --test modules\assistant\assistantProtocol.test.js modules\assistant\assistantStreamingClient.test.js modules\assistant\assistantActionContract.test.js modules\assistant\assistantConfirmationPolicy.test.js api\canvasAgentApi.test.js api\canvasAgentApi.streaming.test.js
```

```powershell
D:\Aic\node.exe --test modules\assistant\assistantActionPreviewModel.test.js modules\assistant\assistantAttachmentStore.test.js modules\assistant\assistantConversationStore.test.js modules\assistant\assistantGenerationTaskStore.test.js modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.streaming.test.js modules\app\appAssistantPanel.context.test.js modules\app\appAssistantPanel.p1Ui.test.js modules\app\appAssistantPanel.autoload.test.js
```

```powershell
python -m unittest canvas_agent_action_schema_test canvas_agent_context_service_test canvas_agent_conversation_service_test canvas_agent_route_service_test pi_runtime_service_test pi_bridge_service_test http_route_dispatcher_test
```

```powershell
python tools\check_pi_canvas_agent_source_tree.py
python tools\run_pi_canvas_agent_offline_regression.py
```

---

## 14. 强背景团队的默会知识实现口径

### 14.1 不以“模型聪明”为核心

强团队不会把成功押注在模型一次性输出完美 JSON，而是建立治理层：

```text
Prompt 降低错误概率
Schema 修复可修复错误
Executor 拦截不可修复错误
Fixture 固化每次 live 失败
Scorecard 量化真实模型质量
```

### 14.2 不把 UI 当装饰

Action preview 是安全系统的一部分，不是展示层。用户必须在执行前理解：

- 将创建什么。
- 将修改什么。
- 将连接什么。
- 是否会生成。
- 是否会扣费。
- 是否可撤销。
- 哪些动作被跳过。

### 14.3 不把上传 chip 当引用闭环

附件必须有：

- assetId。
- usage。
- mime/dimensions。
- thumbnailHint。
- context 脱敏。
- @ 引用或显式选择。

只有 chip 没有 usage/context，不算引用闭环。

### 14.4 不把视频准备节点说成已生成视频

所有文案必须区分：

| 概念 | 文案 |
|---|---|
| 创建 ai-video 节点 | 已准备视频节点 |
| queue ai-video generation | 即将启动视频生成，需确认 |
| completed video generation | 视频生成完成 |

### 14.5 不只做离线测试

离线测试证明协议稳定，浏览器 artifact 证明产品可用。两个都需要。

### 14.6 不在 P0/P1 引入大而全模板系统

模板炼金术是 P3。P0/P1 只需要保留安全边界，不应该为模板团队化拖垮核心闭环。

---

## 15. P2-P4 后续路线

### 15.1 P2 路线

1. 完整一句话工作流。
2. 分镜导演产品化。
3. 变体分支 executor 和 preview。
4. Prompt 手术台 diff。
5. 爆款实验室 MVP。
6. 项目偏好记忆。
7. 大画布上下文语义压缩。

### 15.2 P3 路线

1. TemplateService。
2. 模板保存/复用 UI。
3. 权限、版本、作者、标签。
4. 团队库治理。
5. 发布打包和 CI scorecard。

### 15.3 P4 路线

1. 多 Agent 协作。
2. 智能创作中台。
3. 数据闭环。
4. 企业审计。
5. 跨端协作。

---

## 16. 完成定义

本产品规格下，P0/P1 开发完成必须同时满足：

1. 用户能打开 Pi 助手，使用设置里的文本模型发送消息。
2. 流式回复可见，final-only actions 成立。
3. `story_to_video` 能从自然语言生成完整画布结构。
4. 预览卡能解释风险、生成、视频边界。
5. apply 前重新 validate。
6. executor 能真实创建节点、连线、布局、聚焦。
7. 文本/图片 generation 进入 task lifecycle。
8. 视频未授权绝不启动。
9. history 能恢复 messages、pending actions、receipt、generation tasks。
10. 附件和 references 不泄露敏感信息。
11. Canvas Doctor 和 Auto Layout MVP 可用且不越权。
12. Node/Python/offline regression 通过。
13. 授权时 8777 browser artifact 可证明真实页面闭环。
14. 文档同步记录已实现、未实现、风险和后续 P2-P4。

如果只有代码没有 artifact，不能宣称“产品完成”。如果只有文档没有代码，不能宣称“开发完成”。如果只有 mock 没有真实页面验收，不能宣称“用户可用”。
