# 幻映智能体 Skill Registry 设计

日期：2026-05-27

## 目标

把当前硬写在 `services/claw_bridge_service.py` 的助手能力规则，逐步抽成可加载、可匹配、可压缩注入的幻映专属 skill registry。

第一版目标不是做插件市场或 UI 管理，而是先让幻映智能体在“整理画布、分镜导演、变体分支、模板炼金术”等场景下获得稳定的操作规程。Skill 负责指导 Claw 怎么判断意图、读取哪些上下文、选择哪些 action；真正执行仍然必须走现有 `claw_action_schema`、二次校验、前端 preview/executor 和 undo/history。

## 非目标

- 不让 skill 绕过后端 schema。
- 不让 skill 直接读写项目文件、执行 shell、启动服务或调用外部网络。
- 不在第一版做前端 skill 编辑器。
- 不在第一版做外部插件安装、团队 skill 市场或热更新。
- 不把完整 prompt preset 模板、API Key、绝对路径等敏感内容写进 skill 注入上下文。

## 总体方案

第一版采用“后端内置配置版”：

```text
config/assistant-skills/
  canvas_layout.json
  storyboard_director.json
  variant_branches.json
  workflow_template.json
```

后端新增一个小型 registry 服务，启动或请求时读取这些 JSON 文件。每次用户发起 Claw 聊天请求时，后端根据用户消息、当前 context、skill 的 triggers 和 priority，选择本次要注入的 skill。注入位置在 Claw prompt 构建阶段，即 `ClawBridgeService._build_prompt_payload()` 附近。

## Skill 文件结构

每个 skill 是一个 JSON 文件，建议字段如下：

```json
{
  "id": "canvas_layout",
  "name": "幻映画布整理",
  "version": "0.1.0",
  "enabled": true,
  "priority": 80,
  "injectMode": "when_matched",
  "triggers": ["整理画布", "排版", "整理选区", "节点太乱", "帮我排一下"],
  "allowedActions": ["layout_nodes", "move_nodes", "create_group", "rename_node", "focus_nodes", "set_viewport"],
  "forbiddenActions": ["queue_generation_task", "run_prompt_preset_generation", "delete_nodes", "update_node_data"],
  "requiredContext": [
    "context.selection.selectedNodeIds",
    "context.canvas.layoutHints",
    "context.canvas.edges",
    "context.canvas.diagnostics"
  ],
  "body": "当用户要求整理画布时，优先读取选区和 layoutHints，只输出低风险整理 actions，不改 prompt/model/assets/generation。",
  "compactBody": "整理画布：用 selection/layoutHints 选 nodeIds；只用 layout/move/group/focus/viewport；不生成、不删除、不改内容。",
  "examples": []
}
```

字段说明：

- `id`：稳定唯一标识，日志、测试和 prompt 引用都用它。
- `enabled`：允许临时禁用。
- `priority`：多个 skill 命中时排序，数字越大越优先。
- `injectMode`：第一版只支持 `when_matched` 和 `always`。
- `triggers`：用于消息关键词匹配，后续可扩展为 intent matcher。
- `allowedActions`：skill 允许 Claw 输出的 action 类型。
- `forbiddenActions`：skill 场景下明确禁止的 action 类型。
- `body`：完整规则，正常 prompt 注入。
- `compactBody`：prompt 超长时注入。
- `examples`：少量结构化示例，帮助模型稳定输出合法 actions。

## Skill 内容写法

Skill 内容要像“能力方法论 + 操作规程”，不只是限制清单，也不写泛泛的角色设定。它既要告诉助手不能做什么，更要告诉助手怎么判断“做得好”。

外部 skill 可借鉴的写法：

- `frontend-design` 的重点不是罗列禁令，而是先建立 purpose、tone、constraints、differentiation，再要求用 typography、color、motion、composition 等维度落地。这启发幻映 skill 必须先定义“用户满意的画布是什么样”，再输出 action。
- `canvas-design` 强调 form、space、color、composition，并先形成设计哲学再表达为视觉结果。这启发幻映画布整理不能只说“节点别重叠”，还要有空间组织原则。
- `impeccable` 强调先读取 PRODUCT/DESIGN 上下文，否则会产出泛化结果。这启发幻映 skill 必须明确必读 context，例如 selection、layoutHints、edges、diagnostics、assets。
- `high-end-visual-design` 通过反模式、质量门槛和创意选择机制让模型避免默认模板化输出。这启发幻映 skill 要写“好坏标准”和“反例”，而不是只写 allowedActions。

每个 skill 的 `body` 推荐包含：

1. 目标：这个 skill 要解决什么场景。
2. 用户满意标准：什么结果会让用户觉得清楚、顺手、符合创作流程。
3. 必须读取的上下文：例如 `layoutHints`、选区、资产、LLM Wiki、prompt presets。
4. 决策顺序：例如先选区、再链路、再分区、再问题节点。
5. 布局/创作方法：怎么判断链路、分支、素材区、结果区、问题区。
6. 允许动作：只能输出哪些 action。
7. 禁止动作：不能改什么、不能生成什么、不能删除什么。
8. 输出要求：必须带哪些字段，如何引用节点。
9. 质量评分标准：整理后如何自检。
10. 反例：哪些整理结果用户会觉得更乱。
11. 示例：1-3 个短 action 示例。

建议每个 skill 增加这些可选字段：

```json
{
  "qualityRubric": [
    "用户一眼能看出输入、处理和输出",
    "相关节点靠近，无关节点不要混在一起",
    "连线尽量从左到右或从上到下，不交叉或少交叉",
    "有选区时只整理选区，不擅自重排全画布"
  ],
  "decisionGuide": [
    "先判断用户要整理选区、整张画布、某条链路还是问题节点",
    "再根据 edges 判断输入节点、处理中节点、输出节点",
    "最后选择 horizontal、grid、branch_flow 或 storyboard_grid"
  ],
  "antiPatterns": [
    "把素材、生成结果、失败节点混成一排",
    "为了整齐移动用户未选中的大块区域",
    "只按 x/y 排序，不考虑连线方向和节点语义"
  ]
}
```

## 第一版内置 Skills

### canvas_layout

目标：用户说“整理画布、整理选区、排版、节点太乱”时，输出低风险画布整理 actions。

规则要点：

- 优先整理当前选区。
- 无选区时使用 `context.canvas.layoutHints.targetNodeIds`。
- 诊断后整理时优先 `context.canvas.diagnostics.recommendedFocusNodeIds`。
- 使用 `layout_nodes` 为主，必要时使用 `create_group`、`rename_node`、`focus_nodes`、`set_viewport`。
- 不改 prompt、model、assets、generation。
- 不触发文本/图片/视频生成。
- 不因为上下文压缩就拒绝整理；优先使用 `layoutHints`，缺 `nodeIds` 时后端已有兜底。

用户满意标准：

- 能一眼看出“输入 -> 生成 -> 结果”的流向。
- 参考素材、生成节点、最终结果、失败/问题节点不要混在一起。
- 有选区时尊重选区，只整理用户当前关注的内容。
- 节点之间留出稳定间距，避免卡片重叠和连线严重穿插。
- 对文生图生视频链路，默认从左到右排列。
- 对多分支生成，源节点在左，多个方向向右扇出或按网格排列。
- 对分镜，按 `shotIndex` 或镜头顺序排列。

画布整理决策流程：

1. 判断范围：用户是否说“选区/当前这些/全部画布/问题节点/某条链路”。
2. 判断语义：根据 node type、title、workflow metadata、storyboard metadata、edges 区分输入、处理、输出、素材、问题节点。
3. 判断布局：
   - 单链路用 `horizontal`。
   - 多分支用 `branch_flow` 或横向主轴加纵向分支。
   - 分镜用 `storyboard_grid`。
   - 素材集中区用 `asset_lane`。
   - 失败/缺字段节点用 `problem_lane`。
4. 输出动作：首选 `layout_nodes`，必要时 `create_group`，最后 `set_viewport` 聚焦结果。

反例：

- 只按当前 x/y 从左到右排序，但把输入和输出关系打乱。
- 用户只选了几个节点，却移动整张画布。
- 把参考图、提示词、结果图、失败视频全部排成一条长线。
- 因为没看到完整坐标就拒绝整理，而不是使用 `layoutHints`。

### storyboard_director

目标：用户输入脚本、短片想法、分镜需求时，输出 3-8 个分镜结构。

规则要点：

- 每个镜头必须有 `shotTitle`、`shotVisual`、`shotCamera`、`shotStyle`、`shotPrompt`、`shotContinuity`。
- 使用 `create_node`、`connect_nodes`、`create_group`、`layout_nodes`。
- 可准备视频节点，但未授权不得触发视频生成。
- 分镜顺序必须清楚，按 `shotIndex` 排列。

### variant_branches

目标：用户要求“做几个风格方向、变体、方案对比”时，基于选中子图创建 3-5 条分支。

规则要点：

- 优先使用当前选区和 `context.selection.subgraph`。
- 使用 `duplicate_nodes`、`create_group`、`create_node(comment/source-text)`、`layout_nodes`。
- 每条分支带 `variantGroupId`、`variantIndex`、`variantTitle`、`variantDifference`、`variantRisk=prepare_only_no_generation`。
- 不自动触发生成扣费。
- 超过 5 条或超大选区需要确认或拒绝。

### workflow_template

目标：用户要求“保存成模板、以后复用、沉淀工作流”时，指导 Claw 做模板提炼。

规则要点：

- 先识别输入、处理、输出、参数。
- `create_workflow_template` 是高风险动作，必须 `requiresConfirmation=true`、`riskLevel=high`。
- 第一版只允许 project scope。
- 不写团队库、不跨项目共享、不直接写文件。
- 在 executor/storage 实现前，该 skill 只用于协议和预览，不宣称模板已真实保存。

## 匹配和注入流程

```text
用户消息
  ↓
Claw assistant route 收到 payload
  ↓
SkillRegistry.load()
  ↓
SkillRegistry.match(message, context)
  ↓
选出 enabled 且 triggers 命中的 skills
  ↓
按 priority 排序，限制数量和总长度
  ↓
ClawBridgeService._build_prompt_payload 注入 assistantSkills
  ↓
Claw 返回 actions
  ↓
claw_action_schema 二次校验
  ↓
前端 preview/executor/undo
```

建议 prompt 中新增字段：

```json
{
  "assistantSkills": {
    "applied": true,
    "items": [
      {
        "id": "canvas_layout",
        "name": "幻映画布整理",
        "allowedActions": ["layout_nodes", "move_nodes", "create_group"],
        "forbiddenActions": ["queue_generation_task", "delete_nodes"],
        "instructions": "压缩或完整规则",
        "examples": []
      }
    ]
  }
}
```

## Prompt 压缩策略

由于 Windows 命令参数长度有限，registry 必须支持压缩：

- 正常情况下注入 `body`。
- `_build_prompt_argument()` 进入 compact action protocol 时注入 `compactBody`。
- minimal/emergency 级别只注入 skill id、allowedActions、forbiddenActions 和 1-2 条最关键规则。
- 每次最多注入 2-3 个 skill，避免 prompt 膨胀。

## 安全边界

- Skill 只影响 Claw 的输出倾向，不决定最终执行。
- 最终 action 仍由 `services/claw_action_schema.py` 校验。
- 高风险动作继续必须确认。
- 文本/图片生成按现有策略；视频生成必须授权。
- skill 文件中不允许写密钥、绝对路径、完整用户私有 prompt 模板。
- skill 加载失败时只记录 warning，不阻断普通聊天。

## 测试策略

后端测试：

- 能加载有效 skill 文件。
- 无效 JSON、缺少 id、禁用 skill 会被忽略或报友好 warning。
- “整理画布”命中 `canvas_layout`。
- “拆分镜”命中 `storyboard_director`。
- “做 3 个风格方向”命中 `variant_branches`。
- “保存成模板”命中 `workflow_template`。
- prompt 超长时使用 `compactBody`。
- skill 注入不绕过 action schema。

前端测试：

- 不需要第一版 UI。
- 只验证已有 preview/executor 不受影响。

人工验收：

- 让用户重启服务后，用真实 Claw 发送“帮我整理画布”，确认模型不再回答“我看不到 xy 所以不能整理”，而是输出可校验的 `layout_nodes`。

## 实施顺序

1. 新增 `config/assistant-skills/` 和四个初始 skill 文件。
2. 新增 `services/claw_skill_registry_service.py`，负责读取、校验、匹配、压缩。
3. 在 `ClawBridgeService._build_prompt_payload()` 中注入 `assistantSkills`。
4. 在 prompt compaction 路径中使用 `compactBody`。
5. 补后端单测。
6. 更新 handoff 和路线图，写清楚 skill 只是提示层，执行仍走 schema/executor。

## 设计自检

- 无待补空项。
- 第一版不做 UI、不做插件市场，范围可控。
- 明确 skill 不能绕过 schema/executor。
- 明确 prompt 长度压缩策略。
- 明确第一批四个幻映专属 skill。
- 明确模板 skill 在 executor/storage 未实现前不能宣称已保存。
