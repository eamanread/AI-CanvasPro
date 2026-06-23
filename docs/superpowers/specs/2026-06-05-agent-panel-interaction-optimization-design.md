# Agent 面板交互优化设计规格

日期：2026-06-05
项目：`D:\Aic\huanying-source-windows-20260430-122116`
方案：A，现有面板模块化增强
来源：用户基于截图 `D:\Backup\Downloads\屏幕截图_5-6-2026_185339_127.0.0.1.jpeg` 提出的 Agent 面板优化需求

## 1. 目标

本次优化要把当前 Agent 面板从“能用”提升到“像成熟聊天助手一样好用”。核心目标是：

- 模型选择更干净，只显示已配置文本模型。
- 安全提示不长期占据面板空间。
- 增加全局记忆的 `plan / act` 模式，明确视频生成确认边界。
- 增加可用的 `@` 引用能力，让会话可以关联附件、画布节点和资产库资产。
- 修复输入框提交后残留文本的问题。
- 支持 Enter 发送、Shift+Enter 换行、空内容禁发。
- 回复支持真实流式或前端打字机效果。
- 同一会话内保留上下文记忆，新建会话后重新开始。

## 2. 已确认需求

### 2.1 模型选择

- 只展示系统中已配置成功的文本模型。
- 默认模型取已配置文本模型列表中的第一个。
- 按钮和下拉项显示 `modelName` 或等价的可读模型名。
- 不展示 `pi_canvas_agent`、`canvas_agent`、图片模型、视频模型、未配置模型、失败模型、删除模型。
- 没有可用文本模型时，模型按钮置灰，并提示去模型设置里配置。

### 2.2 临时安全提示

- 截图紫色区域的普通安全说明只展示 3 秒。
- 3 秒后淡出并彻底消失。
- 不保留“安全说明”入口。
- 错误提示、执行结果、强确认提示不套用这条自动消失规则。

### 2.3 模式选择

- 绿色区域改成模式选择器。
- 只有两种模式：`plan` 和 `act`。
- 用户原文中的 `done` 已确认等于 `act`。
- 模式选择全局记住，下次打开任意项目时沿用上次选择。
- 首次无历史选择时默认 `plan`。
- `plan` 模式下，生成视频节点或启动视频生成需要确认。
- `act` 模式下，生成视频节点或启动视频生成不需要二次确认，拥有节点生成全权限。
- `act` 模式仍必须经过 action schema 校验，不能绕过安全校验。

### 2.4 `@` 引用功能

- 点击黄色区域 `@` 后，在输入框光标位置插入 `@`。
- 菜单在 `@` 字符旁边向右展开。
- 菜单顺序固定为：
  1. 当前 Agent 会话上传的参考内容。
  2. 画布节点 >。
  3. 我的资产 >。
- 上传参考内容只显示当前 Agent 会话上传的附件。
- 画布节点最多先显示 30 个，顶部带搜索框。
- 我的资产复用现有资产库数据源。
- 我的资产分类固定为：角色、场景、物品、服装、风格、自定义。
- 空资产分类仍显示，但置灰并标注“暂无资产”。
- 选择后输入框显示可读标签，例如 `@参考图-夏日海报`、`@节点-分镜1`、`@资产-角色-小女孩`。
- 标签背后绑定真实 id 和来源信息。
- 发送时把被 `@` 的素材、节点、资产关联进本次消息上下文。
- 上下文尽量传完整业务数据，但自动过滤本地路径、API Key、token、私有绝对路径等高危字段。

### 2.5 输入框与发送

- 发送成功后立即清空输入框。
- 发送失败时恢复原输入内容，方便用户修改后重试。
- 输入为空时发送按钮置灰且不可发送。
- 输入有内容时发送按钮变亮。
- Enter 发送。
- Shift+Enter 换行。
- 中文输入法候选期间不能误触发发送。

### 2.6 回复体验与上下文记忆

- 优先使用真实后端流式输出。
- 如果后端只返回完整文本，前端用打字机效果逐字或逐段显示。
- 同一个 `conversationId` 内要保留上下文记忆。
- 第二轮问题要能关联第一轮问题、上一轮回复、上一轮 `@` 引用、上一轮待执行动作。
- 点击新建会话后重新开始上下文。
- 打开历史会话时恢复该历史会话的上下文。
- 不把不同历史会话混在一起作为模型上下文。

## 3. 非目标

本次不做以下内容：

- 不重写整个 Agent 面板。
- 不新建一套独立资产库。
- 不改变图片节点已有 `@` 交互，只参考其交互方式。
- 不绕过现有 action schema 校验。
- 不把密钥、token、本地绝对路径传给模型。
- 不把所有历史会话混成全局长期记忆。

## 4. 推荐技术路线

采用“现有面板模块化增强”。

理由：

- 当前项目已有会话存储、附件存储、流式客户端、视频授权、模型注册表等基础能力。
- 保留现有面板能降低回归风险。
- 本次需求主要是交互和上下文拼装优化，不需要整体重构。
- 可以先在当前文件附近落地，再把复杂逻辑逐步拆到小模块。

## 5. 影响范围

主要涉及：

- `modules\app\appAssistantPanel.js`
- `modules\app\appAssistantPanel.test.js`
- `modules\app\appAssistantPanel.p1Ui.test.js`
- `modules\app\appAssistantPanel.streaming.test.js`
- `modules\assistant\assistantModelRegistry.js`
- `modules\assistant\assistantModelRegistry.test.js`
- `modules\assistant\assistantAttachmentStore.js`
- `modules\assistant\assistantContextBuilder.js`
- 可能新增 `modules\assistant\assistantMentionResolver.js`
- 可能新增 `modules\assistant\assistantMentionContext.js`
- 可能新增 `modules\assistant\assistantTypingEffect.js`

现有 `appAssistantPanel.js` 已经比较大。实现时应把新增复杂逻辑拆到 `modules\assistant` 下的小模块，避免继续堆积。

## 6. 设计细节

### 6.1 模型过滤与默认选择

新增一个文本模型过滤能力：

- 输入：模型注册表 options。
- 输出：可展示文本模型列表。
- 过滤规则：
  - `configured === true`
  - `supportsText === true`
  - 文本模型来源优先识别为 `provider === "model_registry"`
  - `status !== "failed"`
  - `status !== "deleted"`
  - 排除 agent provider、图片生成模型、视频生成模型

面板状态初始化和 `setModelRegistry()` 时都要应用该过滤结果。

如果用户之前选过的模型仍在可用列表中，保留该选择。否则切到第一个可用文本模型。

### 6.2 临时提示状态

新增临时提示状态：

- `transientNotice`
- `transientNoticeVisible`
- `transientNoticeTimer`

普通安全说明通过临时提示渲染。显示 3 秒后添加淡出 class，动画结束后清空。

错误、确认、应用结果仍走原有常驻状态，不被自动清理。

### 6.3 模式状态

新增：

- `agentMode`
- `setAgentMode(mode)`
- `loadAgentModePreference()`
- `saveAgentModePreference(mode)`

本地存储 key：

`huanying.canvasAgent.agentMode.v1`

发送或应用动作时：

- `plan`：沿用当前视频确认边界。
- `act`：视为当前批次视频生成已授权，允许传 `videoAuthorized=true`。

强确认按钮文案也应跟随模式变化：

- `plan`：提示“视频生成需要确认”。
- `act`：不展示视频确认按钮，或展示“Act 模式已授权生成”状态。

### 6.4 Mention 候选解析

新增 `assistantMentionResolver.js`：

职责：

- 从当前会话附件生成参考内容候选。
- 从当前画布上下文生成节点候选。
- 从资产库数据源生成资产候选。
- 统一输出菜单可渲染结构。

候选结构：

```js
{
  id: "node-1",
  type: "canvas_node",
  label: "分镜1",
  displayToken: "@节点-分镜1",
  category: "画布节点",
  source: "canvas",
  raw: {}
}
```

资产候选结构要包含资产分类：

```js
{
  id: "asset-1",
  type: "asset",
  assetType: "角色",
  label: "小女孩",
  displayToken: "@资产-角色-小女孩",
  source: "asset_library",
  raw: {}
}
```

### 6.5 Mention 上下文拼装

新增 `assistantMentionContext.js`：

职责：

- 接收用户选择过的 mention bindings。
- 读取对应原始业务数据。
- 输出给 Agent 的安全上下文。
- 过滤危险字段。

危险字段包括但不限于：

- `apiKey`
- `token`
- `secret`
- `password`
- `authorization`
- `localPath`
- `filePath`
- Windows 绝对路径
- 私有绝对路径
- data URL 大体积内容

输出结构：

```js
{
  mentions: {
    items: [
      {
        id: "asset-1",
        type: "asset",
        label: "小女孩",
        assetType: "角色",
        data: {}
      }
    ]
  }
}
```

发送请求时，将该结构合并进现有 `contextWithAssistantReferences()` 输出。

### 6.6 Mention UI

在 compose 区域增加：

- mention menu root
- active menu section
- node search input
- hovered submenu state
- selected mention bindings

交互规则：

- 点击 `@` 按钮时，向 textarea 插入 `@` 并打开菜单。
- 菜单定位在 `@` 近似位置。若无法精确计算 textarea 字符坐标，则优先定位在输入框右上或按钮附近，后续再细化。
- 鼠标移入“画布节点 >”展开节点子菜单。
- 鼠标移入“我的资产 >”展开分类子菜单。
- 鼠标移入资产分类后展开资产名称列表。
- 键盘可后续增强，本次至少保证鼠标可用。

### 6.7 输入框发送状态

`handleSend()` 流程改为：

1. 读取当前输入内容。
2. trim 后为空则不发送。
3. 保存 `draftText`。
4. 清空输入框并更新发送按钮为禁用。
5. 调用 `state.sendMessage(draftText)`。
6. 成功则保持清空。
7. 失败则恢复 `draftText` 并显示错误。

键盘规则：

- `compositionstart` 后进入 composing 状态。
- `compositionend` 后退出 composing 状态。
- `keydown Enter` 且非 composing 且非 Shift 时发送。
- `Shift+Enter` 保持 textarea 默认换行。

### 6.8 回复打字机效果

新增 `assistantTypingEffect.js`：

- 支持取消。
- 支持 reduced motion。
- 支持按字或小片段追加。
- 支持长文本提速，避免几千字回复显示过慢。

真实流式时不额外模拟。非流式时，收到完整 reply 后插入一个空 assistant message，再用打字机逐步填充。

切换会话、新建会话、取消发送、关闭面板时要终止当前打字机，防止旧回复写入新会话。

### 6.9 会话上下文记忆

同一 `conversationId` 的请求上下文应包含：

- 最近用户消息。
- 最近助手回复。
- 最近 context snapshot。
- 当前 mention bindings。
- 当前 references。
- 当前 attachments。
- 当前 pending actions 摘要。

建议先限制最近消息数量，避免 token 过大。例如最近 12 条消息或摘要结构。具体实现可复用现有 conversation store，先保证同一会话可关联回答。

## 7. 数据流

```text
用户输入
  -> textarea draft
  -> @ menu 选择 mention
  -> mention bindings
  -> 点击发送 / Enter
  -> build context
      -> canvas context
      -> attachments
      -> references
      -> mention context
      -> conversation memory
  -> buildAssistantRequest
  -> api.chatStream 或 api.chat
  -> assistant message streaming / typing effect
  -> actions preview
  -> plan/act 权限判断
  -> apply actions
```

## 8. 错误处理

- 没有文本模型：禁用发送，提示去配置文本模型。
- 资产库加载失败：`我的资产` 显示加载失败，不影响附件和画布节点引用。
- `@` 绑定对象已删除：发送时跳过该引用，并提示引用已失效。
- 发送失败：恢复输入框原文。
- 流式中断：显示已取消状态，不生成假成功结果。
- 打字机被取消：停止写入，不污染新会话。
- act 模式下 schema 拒绝动作：仍显示校验失败，不能强行执行。

## 9. 验收标准

### 9.1 用户体验验收

- 模型按钮只显示已配置文本模型名称。
- 默认模型是已配置文本模型第一个。
- 安全提示出现约 3 秒后淡出并消失。
- 模式可切换 plan/act，并在刷新后保持上次选择。
- plan 模式下视频生成需要确认。
- act 模式下视频生成不需要确认。
- 点击 `@` 后输入框出现 `@`，旁边出现选择框。
- `@` 菜单顺序正确。
- 选择 `@` 项后输入框显示可读标签。
- 发送后输入框清空。
- 发送失败后输入框恢复原文。
- 空输入不能发送。
- Enter 发送，Shift+Enter 换行。
- 助手回复逐字或逐段显示。
- 同一会话第二轮问题能关联第一轮内容。

### 9.2 自动化测试

新增或更新测试覆盖：

- 模型过滤和默认选择。
- plan/act 持久化和视频授权。
- 临时提示淡出。
- mention 候选排序。
- mention 选择后的显示 token 和上下文绑定。
- mention 上下文脱敏。
- 输入框提交成功清空、失败恢复。
- Enter 与 Shift+Enter。
- 真流式增量显示。
- 非流式打字机效果。
- conversationId 内上下文连续性。

## 10. 分阶段实施

### 阶段一：基础交互修复

- 修复发送后输入框残留。
- 空输入禁发。
- Enter 发送，Shift+Enter 换行。
- 紫色提示 3 秒淡出。

### 阶段二：模型与模式

- 只展示已配置文本模型。
- 默认选第一个文本模型。
- 增加 plan/act 模式。
- 全局记忆模式。
- 打通 plan/act 视频授权差异。

### 阶段三：`@` 引用

- 当前会话附件候选。
- 画布节点候选和搜索。
- 我的资产三级菜单。
- 可读标签插入。
- mention 上下文绑定和脱敏。

### 阶段四：流式与上下文记忆

- 修正真实流式 UI。
- 增加非流式打字机效果。
- 增强同一会话上下文记忆。
- 历史会话恢复校验。

## 11. 风险与控制

- 风险：`appAssistantPanel.js` 文件较大，继续堆逻辑会难维护。
  - 控制：复杂逻辑拆到 `modules\assistant` 小模块。
- 风险：act 模式可能触发高成本生成。
  - 控制：只取消视频二次确认，不取消 schema 校验；UI 明确显示 act 模式。
- 风险：`@` 原始数据过大或含敏感信息。
  - 控制：完整业务数据优先，但必须脱敏和限制大体积字段。
- 风险：前端打字机和真实流式重复输出。
  - 控制：只有非流式完整 reply 才启用打字机。
- 风险：上下文过长。
  - 控制：限制最近消息数量，并后续可加摘要。

## 12. 当前设计结论

本设计已按用户确认的方案 A 落地为可实施规格。下一步应基于本规格编写实施计划，再进入代码开发。

