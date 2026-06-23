# Agent 面板二次交互优化设计规格

日期：2026-06-05
项目：`D:\Aic\huanying-source-windows-20260430-122116`
方案：B，适度模块化增强
状态：已由用户确认进入规格落地

## 1. 背景

本规格延续上一轮 Agent 面板优化成果，重点解决菜单关闭、输入 `@` 唤起、聊天区信息层级、操作确认规则和品牌命名问题。本次不重做 Agent 面板，只在现有结构上做可测试的模块化增强。

## 2. 目标

- 让模型菜单和 `@` 菜单符合成熟下拉交互：来源按钮可再次关闭，点击外部关闭，Esc 关闭。
- 让用户手动输入 `@` 时也能唤起引用菜单，并支持按 `@` 后文本过滤。
- 让 `@` 菜单层级更干净：资产空态只出现在子菜单，不污染一级菜单。
- 聊天区只保留用户/Agent 对话和挂在回复下方的小字交互卡片，不展示成功类系统提示。
- 用清晰规则区分 `plan` 和 `act` 下的确认行为。
- 将左上角标题和辅助文案改为 `幻映智能体`，保留 FAB 圆按钮 `RH`。

## 3. 已确认需求

### 3.1 悬浮菜单关闭规则

模型菜单和 `@` 菜单统一规则：

- 点击来源按钮：未打开则打开，已打开则关闭。
- 点击菜单外、来源按钮外任意位置：关闭当前菜单。
- 按 Esc：关闭当前菜单。
- 同一时间只允许一个浮层打开。
- 打开模型菜单时关闭 `@` 菜单；打开 `@` 菜单时关闭模型菜单。
- 模型按钮不再轮换模型，只负责打开/关闭菜单。
- 只有点击模型菜单项才切换模型。

### 3.2 输入框手动输入 `@`

- 用户输入一个新的 `@` 时打开 `@` 菜单。
- 记录该 `@` 的位置作为当前 mention 查询起点。
- `@` 后面的文字作为搜索 query，用于过滤参考内容、画布节点、资产候选。
- 删除该 `@` 后关闭菜单。
- 光标离开当前 mention 查询范围时关闭菜单。
- 点击 `@` 按钮时：
  - 菜单未打开：在光标处插入 `@` 并打开菜单。
  - 菜单已打开：关闭菜单，不重复插入 `@`。

### 3.3 `@` 菜单层级

一级菜单固定为：

1. 当前上传参考内容
2. `画布节点 >`
3. `我的资产 >`

规则：

- 当前上传参考内容直接展示在一级菜单。
- 没有参考内容时，可以在参考内容区域显示置灰 `暂无参考内容`。
- 鼠标移入 `画布节点 >` 后，右侧展开节点子菜单。
- 节点子菜单展示当前画布节点名称，支持搜索过滤，最多先展示 30 个。
- 鼠标移入 `我的资产 >` 后，右侧展开分类子菜单。
- 资产分类固定为：角色、场景、物品、服装、风格、自定义。
- 如果资产库完全为空，只在 `我的资产 >` 的右侧子菜单显示置灰 `暂无资产`。
- 如果某个分类为空，只在鼠标移入该分类后的下一级子菜单显示置灰 `暂无资产`。
- 一级菜单不显示资产空态文案。

### 3.4 聊天区展示原则

聊天主区域只渲染两类内容：

1. 用户/Agent 对话文本。
2. 挂在 Agent 回复下方的小字交互卡片。

不再独立展示成功类系统提示，包括但不限于：

- `已选择模型`
- `已切换 Act`
- `上传成功`
- 普通安全说明
- 其他成功类轻提示

错误、校验失败、执行结果不再作为独立系统提示显示，而是进入对应回复下方的交互卡片状态。

### 3.5 交互卡片范围

卡片挂在“提出这批操作”的 Agent 回复下面，后续状态更新同一张卡片。

卡片覆盖：

- 画布动作预览
- 需确认动作
- 执行结果
- 错误原因
- 数据读取摘要
- 生成任务状态

卡片状态包括：

- `pending`
- `needs_confirmation`
- `running`
- `completed`
- `cancelled`
- `failed`

### 3.6 确认规则

“多节点一次生成”按本次 Agent 回复里将要新增、生成或排队的节点数量判断，只要超过 1 个节点就算多节点。

`plan` 模式：

- 单个普通节点生成：不需要确认，自动提交生成。
- 单个视频节点生成：需要确认后才提交生成。
- 多节点一次生成：需要确认后才提交生成。

`act` 模式：

- 不需要任何确认卡片。
- Agent 默认拥有画布增、改、查的高权限。
- 不显示取消/确认按钮。
- 仍必须通过 action schema 校验，校验失败时卡片显示失败原因。

### 3.7 卡片默认展开规则

- 需要用户确认的卡片默认展开，显示详情、取消按钮、确认/应用按钮。
- 不需要确认的卡片默认收起，只显示状态摘要，点击后查看详情。
- `act` 模式下卡片只展示状态、结果、错误，不出现确认按钮。

### 3.8 取消规则

在 `plan` 模式下，用户点击确认卡片的取消按钮后：

- 当前 pending actions 清空。
- 卡片状态改为 `cancelled`。
- 卡片保留在对应回复下方，作为历史记录。

### 3.9 历史会话恢复

打开历史会话时需要恢复：

- 用户消息
- Agent 回复
- 对应交互卡片
- 卡片状态，包括待确认、已确认、已取消、执行中、已执行、失败

不同会话的卡片和上下文不能混用。

### 3.10 标题命名

- 左上角主标题从 `RH 智能体` 改为 `幻映智能体`。
- root aria-label、关闭按钮 aria-label 等辅助文案同步改为 `幻映智能体`。
- FAB 小圆按钮继续显示 `RH`。

## 4. 非目标

本次不做：

- 不重写整个 Agent 面板。
- 不改图片节点既有 `@` 交互，只参考其交互方式。
- 不新建独立资产库。
- 不绕过 action schema 校验。
- 不把密钥、token、本地路径、data URL 等敏感信息传给模型。
- 不把操作卡片做成全局底部消息流。
- 不把模型按钮恢复为点击轮换模型。

## 5. 推荐架构

采用适度模块化增强：

- `appAssistantPanel.js` 保留 UI 壳、DOM 渲染和事件绑定入口。
- 新增浮层控制小模块，统一处理外部点击、Esc、来源按钮 toggle。
- 新增交互卡片小模块，统一判断确认规则、生成卡片模型、更新卡片状态。
- 继续复用已有 mention resolver/context、conversation store、action preview、action executor。

## 6. 建议文件变更

修改：

- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.p1Ui.test.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.context.test.js`
- `modules/assistant/assistantMentionResolver.js`
- `modules/assistant/assistantMentionResolver.test.js`

新增：

- `modules/assistant/assistantFloatingLayer.js`
- `modules/assistant/assistantFloatingLayer.test.js`
- `modules/assistant/assistantInteractionCards.js`
- `modules/assistant/assistantInteractionCards.test.js`

## 7. 数据结构

Agent 消息建议支持卡片数组：

```js
{
  id: "msg_...",
  role: "assistant",
  content: "我准备好了这些画布操作。",
  cards: [
    {
      id: "card_...",
      type: "canvas_actions",
      status: "needs_confirmation",
      title: "将生成 3 个节点",
      summary: "包含文本、图片、视频节点",
      expanded: true,
      requiresConfirmation: true,
      actions: [],
      result: null,
      error: ""
    }
  ]
}
```

初期兼容策略：

- 如果历史消息没有 `cards` 字段，按原消息正常渲染。
- 新产生的 assistant 消息在有 actions、data reads、generation tasks、errors 时带 `cards`。
- conversation store 保存消息时保留 `cards`。
- 恢复历史会话时恢复 `cards`，并回填 pending actions。

## 8. 卡片确认判断

新增 `assistantInteractionCards.js`，核心职责：

- 从 actions 中统计本批将新增/生成/排队的节点数。
- 判断是否包含视频节点生成。
- 根据 `agentMode` 输出是否需要确认。
- 创建可渲染的卡片模型。
- 根据用户确认、取消、执行结果、错误更新卡片状态。

建议 API：

```js
export function analyzeAssistantActionBatch(actions, { graphStore } = {}) {}
export function shouldRequireCardConfirmation(analysis, { agentMode } = {}) {}
export function createInteractionCard({ actions, analysis, agentMode }) {}
export function updateInteractionCardStatus(card, patch) {}
```

确认逻辑：

```text
if agentMode === "act": no confirmation
else if generatedNodeCount > 1: confirmation
else if generatedNodeCount === 1 and includesVideoGeneration: confirmation
else no confirmation
```

## 9. 浮层控制

新增 `assistantFloatingLayer.js`，核心职责：

- 维护当前打开的浮层 id。
- source click 执行 toggle。
- document pointerdown 判断是否在 source 或 layer 内。
- Esc 关闭当前浮层。
- 打开一个浮层时关闭其他浮层。

建议 API：

```js
export function createFloatingLayerController({ document, onChange }) {}
```

返回：

```js
{
  open(id),
  close(id),
  toggle(id),
  closeAll(),
  isOpen(id),
  registerLayer(id, { sourceEl, layerEl }),
  destroy()
}
```

## 10. UI 渲染规则

### 10.1 聊天消息

- `messagesEl` 渲染用户/assistant 文本。
- assistant 消息下如果有 `cards`，紧跟渲染 `.hy-canvas-agent-message-cards`。
- 卡片使用更小字号、弱边框、轻背景，视觉上属于回复的附属信息。

### 10.2 卡片按钮

- `needs_confirmation` 且 `agentMode === "plan"`：显示取消、确认/应用。
- `act`：不显示取消/确认。
- `completed/cancelled/failed`：不显示确认按钮，只显示状态。

### 10.3 原 preview/receipt 兼容

当前已有 `previewEl`、`receiptEl` 可逐步降级：

- 新逻辑优先把内容挂到 assistant message cards。
- 旧 preview/receipt 不再展示普通系统提示。
- 必要时保留隐藏 DOM 或仅用于测试过渡，最终以 message cards 为准。

## 11. 错误处理

- 模型缺失：发送被阻止，错误进入当前或最近 assistant 卡片；如果没有 assistant 回复，则可在 compose 附近显示非聊天流错误状态。
- schema 校验失败：对应 action 卡状态变为 `failed`，展示校验原因。
- 执行失败：对应 card 状态变为 `failed`，展示失败原因。
- 用户取消：对应 card 状态变为 `cancelled`。
- `@` 绑定对象失效：发送时跳过失效引用，并在对应卡片或请求上下文中记录轻量 warning，不展示系统提示。

## 12. 测试计划

### 12.1 浮层测试

- 模型按钮点击打开菜单。
- 模型按钮再次点击关闭菜单。
- 点击菜单外关闭菜单。
- Esc 关闭菜单。
- 点击模型按钮不切换模型。
- 点击模型选项才切换模型。
- 打开模型菜单会关闭 `@` 菜单，反之亦然。

### 12.2 `@` 测试

- 点击 `@` 按钮插入 `@` 并打开菜单。
- 菜单打开时再次点击 `@` 按钮关闭菜单且不重复插入。
- 手动输入 `@` 打开菜单。
- 输入 `@query` 过滤候选。
- 删除触发用的 `@` 后关闭菜单。
- 资产完全为空时，一级菜单不显示 `暂无资产`，hover `我的资产 >` 后子菜单显示。
- 分类为空时，hover 分类后下一级显示 `暂无资产`。

### 12.3 卡片测试

- 成功类系统提示不渲染为聊天流内容。
- actions 卡挂在提出动作的 assistant 回复下面。
- `plan` 单普通节点不需要确认。
- `plan` 单视频节点需要确认。
- `plan` 多节点需要确认。
- `act` 不出现确认按钮。
- 取消后 pending actions 清空，卡片保留为 `cancelled`。
- 确认后执行结果更新同一张卡片。
- schema 校验失败更新为 `failed`。
- 历史会话恢复消息卡片状态。

### 12.4 标题测试

- 主标题为 `幻映智能体`。
- root aria-label 包含 `幻映智能体`。
- 关闭按钮 aria-label 包含 `幻映智能体`。
- FAB 仍显示 `RH`。

## 13. 验收标准

- 点击 `@` 开，再点 `@` 关；点别处或 Esc 也关闭。
- 在输入框手打 `@` 会弹菜单，继续输入会过滤。
- 资产为空时一级菜单不显示 `暂无资产`，只在子菜单显示。
- 点击模型按钮只开关菜单，不自动切换模型。
- 聊天区不再出现成功类系统提示，只显示对话和必要小卡片。
- `plan` 下单视频和多节点需要确认，单普通节点不确认。
- `act` 下没有确认按钮，但展示状态/结果/错误卡。
- 取消后卡片保留为已取消。
- 历史会话可恢复卡片状态。
- 左上角标题显示 `幻映智能体`，FAB 仍为 `RH`。

## 14. 实施顺序建议

1. 浮层控制模块与模型菜单 toggle 行为。
2. 输入框手动 `@` 触发和 mention 菜单空态层级。
3. 交互卡片模块与确认规则。
4. 聊天消息卡片渲染和系统提示收敛。
5. 历史会话卡片恢复。
6. 标题改名。
7. 聚焦测试与广域回归。

## 15. 自检结论

- 无 TBD/TODO 占位。
- 确认规则与用户最新描述一致。
- `act` 模式仍保留 schema 校验，未扩大到绕过安全边界。
- 菜单关闭、`@` 输入、资产空态、聊天卡片、标题改名都有可测试验收标准。
- 范围集中在 Agent 面板二次交互优化，适合作为一个实施计划继续推进。
