# Claw Code 助手阶段五任务单：变体宇宙 + 工作流炼金术

## 0. 使用方式

本文档用于阶段五并行开发。阶段五风险比阶段三、四更高，因为它会触及复制分支、模板抽象、保存边界、权限和版本策略。

并行规则：

- 每个窗口只领取一个“并行窗口”。
- 同一个文件同一时间只能由一个窗口修改。
- 凡是涉及模板保存、团队复用、权限、版本、文件写入，必须先停下来让主协调窗口确认。
- 不启动、不重启、不停止、不检查、不探测 `8777`。

## 1. 阶段目标

用户可以一句话创建多条创意变体分支，并把成熟子图提炼成可复用模板。

阶段五完成后应能稳定演示：

- 选中图、视频或 prompt 后，创建 3-5 条不同风格方向。
- 每条分支有标题、说明、分组边界和差异总结。
- 助手能识别一个选中子图的输入、处理和输出节点。
- 用户确认后，可以把子图沉淀成可复用模板。

## 2. 产品边界

允许：

- 基于选中节点复制或创建变体分支。
- 为变体分支创建分组、命名和说明。
- 在聊天里总结每条分支差异。
- 识别选中子图的输入、处理、输出。
- 设计模板参数化结构和本地项目内保存策略。

高风险，需要强确认：

- 创建或保存可复用模板。
- 修改团队库、共享库或跨项目资产。
- 写入任何模板文件。
- 批量复制大量节点。

禁止：

- 默认自动扣费生成。
- 未确认删除或覆盖用户现有节点。
- 未确认写入团队模板库。
- 为了模板化大改画布存储结构。
- 让 Claw 直接读写项目 JSON 或绕过幻映后端/前端执行器。

## 3. 共享契约

阶段五可能需要新增或产品化这些能力：

- `duplicate_nodes`：创建变体分支的基础动作。
- `create_group`：分支边界。
- `create_node(comment/source-text)`：分支说明和差异总结。
- `layout_nodes` / `move_nodes`：分支排布。
- `create_workflow_template`：如需新增，必须强确认，且先做最小本地项目级 MVP。

推荐变体 metadata：

```json
{
  "variantGroupId": "var_xxx",
  "variantIndex": 1,
  "variantTitle": "电影感冷色方向",
  "variantDifference": "更冷、更写实、更高对比",
  "variantSourceNodeIds": ["node_a"],
  "variantRisk": "prepare_only_no_generation"
}
```

推荐模板 metadata：

```json
{
  "templateKind": "workflow_subgraph",
  "templateName": "商品图转短视频",
  "templateVersion": "0.1.0",
  "templateScope": "project",
  "templateAuthor": "current_user",
  "templateInputs": [],
  "templateOutputs": [],
  "templateParameters": []
}
```

## 4. 并行窗口分工

### 窗口 A：变体分支协议和 schema

负责范围：

- `services/claw_bridge_service.py`
- `services/claw_action_schema.py`
- `claw_bridge_service_test.py`
- `claw_action_schema_test.py`

任务：

- 让 Claw 明确“做几个不同风格方向”时只准备分支，不自动生成。
- 规范 `duplicate_nodes`、`create_group`、`create_node` 的变体 metadata。
- 如果新增 `create_workflow_template`，必须将其设为中高风险、强确认。
- 明确删除、覆盖、团队库写入默认禁止。

禁止修改：

- `modules/app/*`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionPreview.js`
- 任何模板存储实现文件，除非主协调窗口批准。

验收命令：

```powershell
python -m unittest claw_bridge_service_test.py claw_action_schema_test.py
python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py
```

### 窗口 B：子图识别、复制和变体落图

负责范围：

- `modules/assistant/assistantContextBuilder.js`
- `modules/assistant/assistantContextBuilder.test.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`

任务：

- 增强选中子图摘要：输入节点、处理中节点、输出节点、边界节点。
- 确保变体分支可复制、分组、布局和撤销。
- 限制一次自动分支数量，默认 3-5 条。
- 防止对超大选区做无提示复制。

禁止修改：

- `services/*`
- `modules/app/appAssistantPanel.js`
- `modules/assistant/assistantActionPreview.js`
- 模板保存相关文件

验收命令：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionExecutor.test.js
node --check modules\assistant\assistantContextBuilder.js
node --check modules\assistant\assistantActionExecutor.js
```

### 窗口 C：变体和模板 preview/receipt

负责范围：

- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreview.test.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`

任务：

- preview 清楚展示将创建哪些变体、每条分支差异是什么。
- 对模板保存动作显示强确认风险。
- receipt 汇总分支数量、复制节点数量、模板状态。
- 不做聊天 UI 大改版。

禁止修改：

- `services/*`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantContextBuilder.js`
- 模板存储实现

验收命令：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js
node --check modules\assistant\assistantActionPreview.js
node --check modules\app\appAssistantPanel.js
node --check modules\app\appAssistantPanel.autoload.js
```

### 窗口 D：模板保存策略和治理文档

负责范围：

- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
- 可以新增模板策略文档，但不要直接实现存储，除非主协调窗口授权
- `task_plan.md`
- `progress.md`
- `findings.md`

任务：

- 明确模板保存位置策略：项目内、用户预设、团队库分别什么时候用。
- 明确权限、版本、作者、标签最低字段。
- 明确阶段五 MVP 只做什么，不做什么。
- 阶段五最后一个切片通过后，更新 handoff 和 roadmap。
- 汇报时必须明确说“阶段五已完成”。

禁止修改：

- 生产代码文件，除非主协调窗口明确授权。

验收命令：

```powershell
git diff --check -- docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md docs\CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md task_plan.md progress.md findings.md
```

## 5. 建议切片顺序

1. S5-01：选中节点创建风格变体。
2. S5-02：变体命名和分组。
3. S5-03：变体差异总结。
4. S5-04：子图输入输出识别。
5. S5-05：模板参数化。
6. S5-06：模板保存边界。
7. S5-07：模板复用入口。
8. S5-08：权限、版本、作者、标签。
9. S5-09：阶段五总回归和接力文档。

S5-01 到 S5-04 可以先完成变体分支价值；S5-05 之后进入模板化，需要更严格的确认和治理。

## 6. 阶段五完成标准

- “做 5 个不同风格方向”能生成分支、分组、差异说明，不自动扣费。
- “把这段整理成可复用模板”能识别输入/输出并生成模板说明。
- 模板保存位置、权限、版本和团队复用边界清晰。
- 用户确认后模板可在新画布复用。
- 所有高风险保存/团队共享动作都有强确认。
- 阶段回归通过，handoff 和 roadmap 更新完成。

