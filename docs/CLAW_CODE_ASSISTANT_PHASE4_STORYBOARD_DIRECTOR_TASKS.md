# Claw Code 助手阶段四任务单：分镜导演模式

## 0. 使用方式

本文档用于阶段四并行开发。阶段三完成后再进入本阶段；若阶段三未完成，只允许阅读和准备测试草案，不要提前改生产代码。

并行规则：

- 每个窗口只领取一个“并行窗口”。
- 同一个文件同一时间只能由一个窗口修改。
- 修改共享契约前先停下来同步。
- 不启动、不重启、不停止、不检查、不探测 `8777`。

## 1. 阶段目标

用户输入一段脚本、分镜想法或短片描述时，助手能拆成 3-8 个镜头，并在画布上生成可继续做图/视频的分镜结构。

阶段四完成后应能稳定演示：

- 把一段脚本拆成多个镜头。
- 每个镜头有标题、画面描述、镜头运动、风格和可用于文生图的 prompt。
- 每个镜头在画布上形成一组清晰节点。
- 镜头按顺序排布，后续能选择某个镜头继续生成图片或视频。

## 2. 产品边界

允许：

- 创建分镜说明节点、prompt 节点、图片生成节点、视频准备节点。
- 创建分镜组或分镜容器。
- 为每个镜头写入安全 metadata。
- 自动布局分镜顺序。
- 文本/图片生成能力按已有策略处理。

禁止：

- 未授权自动触发视频生成。
- 删除用户现有节点。
- 覆盖用户已有工作流。
- 直接写文件、shell、外部网络。
- 在阶段四引入团队模板库或模板权限系统。

## 3. 共享契约

阶段四优先复用已有 action：

- `create_node`
- `connect_nodes`
- `create_group`
- `layout_nodes`
- `move_nodes`
- `focus_nodes`
- `set_viewport`
- 必要时 `rename_node`

推荐分镜 metadata：

```json
{
  "storyboardId": "sb_xxx",
  "shotIndex": 1,
  "shotTitle": "镜头 1：开场",
  "shotVisual": "画面描述",
  "shotCamera": "镜头运动",
  "shotStyle": "风格",
  "shotPrompt": "可用于文生图的 prompt",
  "shotContinuity": "角色/场景/风格连续性说明"
}
```

metadata 只能用于说明、preview、receipt 和后续上下文，不得作为绕过生成授权的入口。

## 4. 并行窗口分工

### 窗口 A：分镜协议和后端 schema

负责范围：

- `services/claw_bridge_service.py`
- `services/claw_action_schema.py`
- `claw_bridge_service_test.py`
- `claw_action_schema_test.py`

任务：

- 增加分镜导演规则，让 Claw 输出 3-8 个镜头的结构化 actions。
- 明确每个镜头应包含标题、画面、镜头运动、风格、prompt。
- 允许安全分镜 metadata 进入 `create_node` / `create_group`。
- 强化规则：视频节点可以准备，但视频生成仍需授权。

禁止修改：

- `modules/app/*`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionPreview.js`

验收命令：

```powershell
python -m unittest claw_bridge_service_test.py claw_action_schema_test.py
python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py
```

### 窗口 B：分镜上下文和执行落图

负责范围：

- `modules/assistant/assistantContextBuilder.js`
- `modules/assistant/assistantContextBuilder.test.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`

任务：

- 确保一批分镜节点能稳定创建、连接、分组和布局。
- 覆盖 3-8 个镜头的 batch 执行。
- 确保分镜组可撤销。
- 确保分镜顺序布局不会明显重叠。

禁止修改：

- `services/*`
- `modules/app/appAssistantPanel.js`
- `modules/assistant/assistantActionPreview.js`

验收命令：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantContextBuilder.test.js modules\assistant\assistantActionExecutor.test.js
node --check modules\assistant\assistantContextBuilder.js
node --check modules\assistant\assistantActionExecutor.js
```

### 窗口 C：分镜 preview、receipt 和用户反馈

负责范围：

- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreview.test.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`

任务：

- preview 能汇总“将创建 N 个分镜”。
- 每个分镜能显示镜头标题、prompt 摘要和视频授权边界。
- receipt 能说明创建了多少分镜组、多少节点、多少连接。
- 长错误继续使用现有折叠策略，不做无关 UI 改版。

禁止修改：

- `services/*`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantContextBuilder.js`

验收命令：

```powershell
node --test --test-concurrency=1 modules\assistant\assistantActionPreview.test.js modules\app\appAssistantPanel.test.js modules\app\appAssistantPanel.autoload.test.js
node --check modules\assistant\assistantActionPreview.js
node --check modules\app\appAssistantPanel.js
node --check modules\app\appAssistantPanel.autoload.js
```

### 窗口 D：阶段回归和接力文档

负责范围：

- `docs/CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md`
- `docs/CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md`
- `docs/CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md`
- `scripts/claw_assistant_regression.ps1`
- `task_plan.md`
- `progress.md`
- `findings.md`

任务：

- 补阶段四人工验收场景。
- 记录分镜 metadata 和视频授权边界。
- 阶段四最后一个切片通过后，更新 handoff 和 roadmap。
- 汇报时必须明确说“阶段四已完成”。

禁止修改：

- 生产代码文件，除非主协调窗口明确授权。

验收命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List
git diff --check -- docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md docs\CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md scripts\claw_assistant_regression.ps1 task_plan.md progress.md findings.md
```

## 5. 建议切片顺序

1. S4-01：脚本拆镜协议。
2. S4-02：分镜节点数据结构。
3. S4-03：分镜组创建。
4. S4-04：分镜顺序布局。
5. S4-05：分镜 prompt 一致性。
6. S4-06：分镜后续生成边界。
7. S4-07：阶段四回归和接力文档。

S4-01 必须先于其他切片确定 metadata。S4-03 和 S4-04 可以并行，但不得同时修改 executor 同一段逻辑。

## 6. 阶段四完成标准

- 输入一段脚本，画布自动生成 3-8 个分镜节点组。
- 每个分镜都有可用于文生图的 prompt。
- 分镜顺序清晰，节点组不明显重叠。
- 后续能选择某个镜头继续生成图片或视频节点。
- 不会自动触发未经授权的视频生成。
- 阶段回归通过，handoff 和 roadmap 更新完成。

