# 幻映智能体近期 1/2/3 重点落地执行方案

日期：2026-05-30

适用范围：本方案只覆盖近期最关键的三件事：

1. `story_to_video` 一句话故事视频工作流 live 跑通。
2. 真实模型输出 action 的稳定性治理。
3. 真实画布应用体验收口。

本方案假设团队里有很强的产品、AI 工程、前端、后端和 QA 背景。强团队不会把目标定成“又加一堆功能”，而会先把一个高价值闭环做到稳定、可验证、可回退、可交付。

---

## 0. 总判断

当前项目已经不是“有没有能力”的阶段，而是“真实模型输出能不能稳定进入产品闭环”的阶段。

已经有的底座：

- Claw Code runtime 已接入。
- provider proxy 已接入。
- 多话题持久记忆已接入。
- action schema 已有大量校验和修复。
- 前端 preview、executor、undo/history 已有基础闭环。
- Skill Registry 已能注入 `canvas_layout`、`storyboard_director`、`variant_branches`、`workflow_template`。
- `story_to_video` 协议已新增：1 个故事大纲、1 个风格设定、N 个分镜文本、N 个关键图、N 个视频准备节点。

当前最大风险：

- 真实模型会输出不稳定 action。
- schema、prompt、executor 之间还存在语义落差。
- live 成功不等于画布体验成功。
- 如果继续开新功能，会扩大不稳定面。

近期正确路线：

```text
先把 story_to_video 做成一个标杆闭环
再把真实模型 action 稳定性沉淀成治理层
最后把浏览器画布体验打磨到用户可反复使用
```

---

## 1. 重点一：`story_to_video` 一句话故事视频工作流 live 跑通

### 1.1 产品目标

用户输入：

```text
做一个 15 秒雨夜赛博追逐故事短片
```

系统应该稳定产生：

```text
故事大纲 ai-text
风格/角色一致性设定 ai-text
第 1 镜分镜文本 ai-text -> 第 1 镜关键图 ai-image -> 第 1 镜视频准备 ai-video
第 2 镜分镜文本 ai-text -> 第 2 镜关键图 ai-image -> 第 2 镜视频准备 ai-video
...
```

文本和图片可以自动生成。视频只创建准备节点，必须等用户授权后才可生成。

### 1.2 强团队会先锁死的产品契约

`story_to_video` 不是普通 `text_to_image_video`。

必须满足：

- 故事大纲只有 1 个。
- 风格设定只有 1 个。
- 分镜文本是多个。
- 每个分镜文本对应一个关键图节点。
- 每个关键图节点对应一个视频准备节点。
- 每个镜头必须有 `shotIndex`。
- 能推断或填写 `shotDurationSec`。
- 总时长应落在 `storyDurationSec` 或项目偏好里。
- 视频生成不得自动触发。

标准 metadata：

```json
{
  "workflowKind": "story_to_video",
  "workflowGroupId": "wf_story_video_xxx",
  "workflowStep": "story_outline | style_bible | shot_script | shot_keyframe | shot_video",
  "storyDurationSec": 15,
  "shotIndex": 1,
  "shotDurationSec": 3,
  "shotTitle": "镜头标题",
  "shotPrompt": "图片提示词",
  "shotVideoPrompt": "视频运动提示词"
}
```

### 1.3 落地切片

#### S1-01：建立 story_to_video 黄金样例集

文件建议：

- 新增 `docs/assistant_live_cases/story_to_video_cases.md`
- 新增 `docs/assistant_live_cases/story_to_video_expected_actions.json`

内容：

- 15 秒故事短片，4-6 镜。
- 30 秒故事短片，6-10 镜。
- 有中文主题、有英文风格、有明确角色。
- 空画布场景。
- 已有选区/已有素材场景。

验收：

- 每个 case 都有输入语句。
- 每个 case 都有期望节点结构。
- 每个 case 都写清楚不允许触发视频生成。

#### S1-02：固定 prompt 和 skill 的 story_to_video 触发口径

涉及文件：

- `services/claw_bridge_service.py`
- `config/assistant-skills/storyboard_director.json`

要求：

- 用户说“故事短片 / 故事视频 / 15 秒短片 / 做成视频故事”时优先走 `story_to_video`。
- 不要退化成单条 `text_to_image_video`。
- prompt 中必须明确“一个大纲、一个风格设定、多个分镜”。

验收：

```powershell
python -m unittest claw_bridge_service_test.py claw_skill_registry_service_test.py
```

#### S1-03：schema 支持 story_to_video 的全部安全字段

涉及文件：

- `services/claw_action_schema.py`
- `claw_action_schema_test.py`

必须支持：

- `storyDurationSec`
- `shotDurationSec`
- `shotVideoPrompt`
- `storyboard_grid`
- `branch_flow`
- `single_chain`
- 模型常见 node/action 别名

仍然必须拦截：

- 未授权 `queue_generation_task` video。
- 不存在节点引用。
- 危险字段、key、路径、blob/data URL。
- 独立空 `create_group`。

验收：

```powershell
python -m unittest claw_action_schema_test.py
```

#### S1-04：前端 preview/receipt 明确显示故事工作流

涉及文件：

- `modules/assistant/assistantActionPreview.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.autoload.js`

用户应该看到：

```text
故事视频工作流：将创建 X 个节点，连接 Y 条线。
文本/图片生成将自动执行 N 个任务。视频生成仍需确认。
```

不能显示成：

```text
普通工作流
未知工作流
已经生成视频
```

验收：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js
```

#### S1-05：live smoke 通过

前置条件：

- 由用户手动重启 `8777`。
- 开发者不主动启动、重启、停止或检查服务。

live 请求：

```text
做一个15秒雨夜赛博追逐故事短片，先生成故事大纲、风格设定、分镜文本、关键图和视频准备节点
```

验收标准：

- `/api/v2/assistant/chat` 返回 `success=true`。
- actions 包含 `workflowKind=story_to_video`。
- 至少 1 个 `story_outline`。
- 至少 1 个 `style_bible`。
- 至少 3 个 `shot_script`。
- 至少 3 个 `shot_keyframe`。
- 至少 3 个 `shot_video`。
- 没有未授权视频 queue。
- schema warnings 可接受，但不能有 validation error。

---

## 2. 重点二：真实模型 action 稳定性治理

### 2.1 产品目标

强团队不会指望 LLM 每次都完美输出 schema。正确做法是三层治理：

```text
Prompt 让模型少犯错
Schema 修复常见可修复错误
Executor 拦截不可修复错误并给清晰回执
```

目标不是“放宽规则让它都过”，而是：

- 可安全修复的自动修。
- 不安全的坚决拦。
- 每个 live 错误都变成回归测试。

### 2.2 错误分类体系

#### A 类：可自动修复

例子：

- `nodeType` 写在 `data.type`。
- `connect_nodes` 使用 `source/target`。
- 同批新建节点后用语义别名引用。
- `layout_nodes` 用 `storyboard_grid`。
- 工作流批次中出现空 `connect_nodes` 占位。
- 工作流批次中出现空 `create_group` 占位。

处理：

- schema repair。
- 加 warning。
- 加测试。

#### B 类：需要模型重试或用户确认

例子：

- 节点引用模糊。
- 资产重名无法判断。
- 要生成视频但没有授权。
- 要删除/覆盖大量内容。

处理：

- 返回友好错误或确认请求。
- 不执行 actions。

#### C 类：必须拦截

例子：

- API Key/token/path/data URL/blob URL。
- shell/file 写入。
- 绕过 schema/executor。
- 未授权视频生成。
- 删除用户内容。

处理：

- hard fail。
- 记录 diagnostics。

### 2.3 落地切片

#### S2-01：建立 live error ledger

新增文件：

- `docs/assistant_live_cases/live_error_ledger.md`

每次 live 错误必须记录：

```text
日期
用户输入
服务是否由用户重启
返回 success/errorCode
原始错误
错误分类 A/B/C
修复文件
回归测试名
是否需要用户再次重启
```

验收：

- 最近一次 `story_to_video` 的 `nodeIds` 和 `storyboard_grid` 错误必须记录进去。

#### S2-02：schema repair registry

目标：

把 `services/claw_action_schema.py` 里不断增长的 repair 逻辑整理成可读结构。

建议结构：

```text
normalize action shape
repair missing canonical fields
repair generated node aliases
repair safe placeholders
validate scope
validate semantics
sanitize dangerous fields
```

不一定马上拆文件，但要先在代码里形成清晰顺序和注释。

验收：

```powershell
python -m unittest claw_action_schema_test.py
```

#### S2-03：每个 live 错误必须先写失败测试

规则：

- 看到 live 错误后，先把原始 action 形状写进测试。
- 确认测试红。
- 再修 schema/executor/prompt。
- 再跑绿。

强制测试位置：

- 后端 schema 错误：`claw_action_schema_test.py`
- bridge prompt 错误：`claw_bridge_service_test.py`
- preview 错误：`modules/assistant/assistantActionPreview.test.js`
- executor 错误：`modules/assistant/assistantActionExecutor.test.js`
- panel 回执错误：`modules/app/appAssistantPanel.test.js`

#### S2-04：建立 action contract matrix

新增文件：

- `docs/assistant_action_contract_matrix.md`

每个 action 写清：

```text
action type
required fields
optional fields
safe metadata
model common aliases
schema repair policy
executor behavior
preview behavior
auto apply policy
undo/history behavior
tests
```

优先覆盖：

- `create_node`
- `connect_nodes`
- `layout_nodes`
- `create_group`
- `queue_generation_task`
- `run_prompt_preset_generation`
- `duplicate_nodes`
- `create_workflow_template`

#### S2-05：模型输出质量评分

对每次 live action batch 打分：

```text
结构完整性 0-5
schema 合法性 0-5
安全边界 0-5
画布可读性 0-5
生成权限正确性 0-5
```

上线目标：

- `story_to_video` 连续 5 次 live smoke 平均分 >= 22/25。
- 不出现 C 类错误。
- A 类错误可以有，但必须自动修复且有 warning。

---

## 3. 重点三：真实画布应用体验收口

### 3.1 产品目标

强团队不会只看 `/chat success=true`。真正验收标准是用户在浏览器里觉得可用：

- 预览能看懂。
- 应用能成功。
- 节点不堆叠。
- 文本/图片生成能启动。
- 视频不越权生成。
- 错误能看懂。
- 可以撤销。
- 可以继续追问。

### 3.2 用户可见验收链路

完整链路：

```text
用户输入故事短片
-> 聊天区显示助手回复
-> preview 显示故事视频工作流
-> 自动应用低风险动作或用户点击应用
-> 画布出现故事大纲/风格设定/分镜/关键图/视频准备节点
-> 文本/图片进入生成状态
-> 视频节点保持准备状态
-> 回执写清楚创建了什么
-> recentOperations 记录本次操作
-> 用户继续问“刚刚做了什么”能答得上
```

### 3.3 落地切片

#### S3-01：浏览器人工验收脚本

新增文件：

- `docs/CLAW_ASSISTANT_BROWSER_ACCEPTANCE_SCRIPT.md`

包含：

```text
验收准备
输入语句
预期 preview
预期画布节点
预期生成状态
预期视频授权边界
预期回执
失败截图要求
回归记录格式
```

#### S3-02：画布节点布局验收

标准：

- 故事大纲和风格设定在左侧。
- 分镜按镜头顺序排列。
- 每镜内部顺序是：文本 -> 关键图 -> 视频准备。
- 节点不重叠。
- 新节点不堆在 `(0, 0)`。
- 视野聚焦到新故事工作流。

涉及：

- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`

#### S3-03：生成状态验收

文本/图片生成：

- `queuedGenerationNodeIds` 有文本和图片节点。
- `startedGenerationNodeIds` 有文本和图片节点。
- 节点状态不是静默无反应。

视频生成：

- `videoGenerationTaskNodeIds` 为空，除非用户明确授权。
- 视频节点可见，但不自动开跑。

#### S3-04：错误体验验收

标准：

- 成功提示是轻量灰色文本。
- 错误提示是小号红色文本。
- 超过三行错误默认折叠。
- 每条消息可复制。
- 每段助手消息下面有复制按钮。

已有 UI 改动要继续防回归。

测试：

```powershell
node --test --test-concurrency=1 modules\app\appAssistantPanel.test.js
```

#### S3-05：撤销和历史验收

标准：

- 一次 story_to_video 应用是一个 batch。
- undo 能撤销整批节点/边/状态。
- recentOperations 记录：

```text
已创建故事视频工作流：X 个节点，Y 条连接。文本/图片生成将自动执行 N 个任务。视频生成仍需确认。
```

---

## 4. 组织方式

### 4.1 如果团队很强，会这样分工

#### Product Owner

负责：

- 定义 story_to_video 用户可见效果。
- 决定默认镜头数和时长策略。
- 决定失败时是自动修复、重试还是询问用户。

产物：

- 黄金样例。
- 浏览器验收脚本。
- 体验优先级。

#### AI Prompt / Skill Owner

负责：

- `workflowMvpRules`
- `storyboard_director` skill
- prompt compact 策略
- live 输出分析

产物：

- prompt 改动。
- skill 改动。
- live 输出评分。

#### Backend Contract Owner

负责：

- `claw_action_schema.py`
- `claw_bridge_service.py`
- `/actions/validate`
- provider/runtime 交互

产物：

- schema repair。
- diagnostics。
- 后端回归。

#### Frontend Canvas Owner

负责：

- preview
- executor
- layout
- undo/history
- generation runner
- panel receipt

产物：

- 用户可见闭环。
- 前端测试。

#### QA / Release Owner

负责：

- live smoke。
- 浏览器验收。
- 错误台账。
- 回归矩阵。

产物：

- 每轮 live 报告。
- 是否可交付判断。

### 4.2 每日节奏

建议每天只做三件事：

```text
上午：跑 2-3 条 live smoke，记录错误
下午：把最高频错误修成自动化回归
晚上：跑整套回归，更新接力文档
```

禁止：

- 一边修 live，一边再开大功能。
- 只改 prompt 不补测试。
- 只看 `/chat` 不看浏览器画布。
- 没写 handoff 就结束。

---

## 5. 验收门槛

### 5.1 `story_to_video` 可交付门槛

必须连续通过：

- 5 次 live `/chat`。
- 3 次浏览器 apply。
- 3 次文本/图片生成启动。
- 0 次未授权视频生成。
- 0 次 schema hard fail。
- 0 次节点堆叠。
- 0 次不可理解错误提示。

### 5.2 回归命令

后端：

```powershell
python -m unittest claw_skill_registry_service_test.py claw_bridge_service_test.py claw_action_schema_test.py
python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py services\claw_skill_registry_service.py
```

前端：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\assistant\assistantActionExecutor.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js
node --check modules\assistant\assistantActionPreview.js modules\assistant\assistantActionExecutor.js modules\app\appAssistantPanel.js
```

文档/格式：

```powershell
python -m json.tool config\assistant-skills\storyboard_director.json
git diff --check -- services\claw_bridge_service.py services\claw_action_schema.py modules\assistant\assistantActionPreview.js modules\assistant\assistantActionExecutor.js modules\app\appAssistantPanel.js docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md
```

### 5.3 live 验收协作规则

`8777` 规则必须继续遵守：

- 开发者不主动启动 `8777`。
- 开发者不主动重启 `8777`。
- 开发者不主动停止 `8777`。
- 如果需要服务加载新后端代码，停下来告诉用户需要手动重启。
- 用户回复“已重启”后，开发者可以继续调用本地接口做 live smoke。

---

## 6. 风险和应对

### 风险 1：模型每次输出形状不同

应对：

- 黄金样例 + live error ledger。
- prompt 缩小自由度。
- schema repair 只修安全等价错误。
- 不能修的返回友好诊断。

### 风险 2：prompt 越写越长

应对：

- Skill Registry 使用 `compactBody`。
- actionProtocol 保留关键短规则。
- 复杂方法论放 skill，不继续堆在主 prompt。

### 风险 3：真实画布体验和离线测试不一致

应对：

- 所有 live 问题补成测试。
- 浏览器验收脚本必须执行。
- 画布状态、renderer mount、generation runner 单独覆盖。

### 风险 4：为了赶进度放宽安全边界

应对：

- 视频生成永远需要授权。
- delete/file/shell/secret 继续 hard fail。
- 高风险模板保存继续强确认。

---

## 7. 优先级排序

如果只能做一件事：

```text
让 story_to_video 连续 5 次 live smoke 成功，并能在浏览器落画布。
```

如果只能做两件事：

```text
story_to_video live 成功
真实模型 action error ledger + 回归测试机制
```

如果只能做三件事：

```text
story_to_video live 成功
action 稳定性治理
浏览器画布应用体验收口
```

暂时不要优先做：

- 团队模板市场。
- 大规模 UI 重做。
- 新 action 大扩张。
- 本地模型。
- 原生 Claw session resume 大改。

---

## 8. 下一步执行清单

1. 用户手动重启 `8777`，让第 97 节 schema 修复生效。
2. 开发者复测同一句 `story_to_video` live smoke。
3. 如果还有 schema fail，立刻写入 `live_error_ledger.md` 并补失败测试。
4. 如果 `/chat success=true`，进入浏览器 apply 验收。
5. 浏览器验收失败则按 executor/preview/panel 分类修复。
6. 连续 5 次 live smoke + 3 次浏览器 apply 成功后，才宣布“故事视频一句话工作流 live 基本收口”。

---

## 9. 完成定义

这个近期项目不是以“代码写完”定义完成，而以“用户能反复成功使用”定义完成。

最终完成口径：

```text
用户用自然中文输入一个故事短片需求。
幻映智能体能稳定理解、拆分、创建、排布、生成文本/图片、保留视频授权边界。
失败时能说明原因。
成功时能回执清楚。
整个动作可撤销、可追问、可接力维护。
```
