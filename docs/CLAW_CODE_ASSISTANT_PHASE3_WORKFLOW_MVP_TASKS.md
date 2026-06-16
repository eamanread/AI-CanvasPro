# Claw Code 助手阶段三任务单：一句话生成工作流 MVP

## 0. 使用方式

本文档用于阶段三并行开发。阶段一和阶段二按当前项目推进口径视为已完成基线，本阶段只做“一句话搭工作流”。

多个助手并行时，必须遵守：

- 每个窗口只领取一个“并行窗口”。
- 同一个文件同一时间只能由一个窗口修改。
- 如果必须修改不属于自己的文件，先停止并汇报，不要直接改。
- 所有改变画布的动作必须继续经过 schema、preview、executor、二次校验和 undo/history 语义。
- 不启动、不重启、不停止、不检查、不探测 `8777`，需要服务状态时交给用户处理。

## 1. 阶段目标

用户说“帮我搭一个文生图生视频工作流”时，助手能在画布上创建一组可检查、可撤销、可继续运行的节点结构。

本阶段默认只准备画布结构，不自动触发付费生成。

阶段三完成后应能稳定演示：

- 文生图工作流：`source-text -> ai-image`
- 图生视频工作流：`source-image -> ai-video`
- 文生图生视频工作流：`source-text -> ai-image -> ai-video`
- 图片批量变体雏形：一个输入图连接到多个风格方向的 `ai-image` 节点

## 2. 产品边界

允许：

- 创建 `source-text`、`source-image`、`ai-image`、`ai-video` 等工作流节点。
- 创建连接。
- 设置合理的节点标题、占位 prompt、尺寸、时长、分辨率等安全默认值。
- 布局新工作流并聚焦视野。
- 输出 preview/receipt，让用户知道创建了什么。

禁止：

- 默认自动运行视频生成。
- 自动触发任何用户未确认的付费生成。
- 删除现有节点。
- 修改用户已有节点的 prompt/model/assets/generation 参数，除非用户明确要求。
- 绕过 `actions/validate` 或直接写项目 JSON。
- 为了阶段三引入团队模板库、shell、文件写入或外部网络能力。

## 3. 共享契约

阶段三优先复用已有 action：

- `create_node`
- `connect_nodes`
- `layout_nodes`
- `move_nodes`
- `create_group`
- `rename_node`
- `focus_nodes`
- `set_viewport`

原则上不新增高风险 action。若确实需要新增字段，只允许作为安全 metadata 或 node data 白名单补充，并且必须同步：

- 后端 schema
- bridge prompt/action protocol
- 前端 preview
- 前端 executor
- 自动应用守卫
- 测试
- handoff 文档

推荐 metadata 字段：

```json
{
  "workflowKind": "text_to_image_video",
  "workflowStep": "source_prompt | image_generation | video_generation",
  "workflowGroupId": "wf_xxx",
  "workflowReason": "prepared canvas workflow only"
}
```

## 4. 并行窗口分工

### 窗口 A：工作流协议和 schema

负责范围：

- `services/claw_bridge_service.py`
- `services/claw_action_schema.py`
- `claw_bridge_service_test.py`
- `claw_action_schema_test.py`

任务：

- 增加阶段三工作流生成规则，让 Claw 明确“搭工作流”只创建结构，不默认运行生成。
- 约束文生图、图生视频、文生图生视频、批量变体的常见动作序列。
- 若添加 workflow metadata，确保 schema 白名单接受并脱敏。
- 确保视频生成仍需要授权，不能被工作流创建误触发。

禁止修改：

- `modules/app/*`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionPreview.js`

验收命令：

```powershell
python -m unittest claw_bridge_service_test.py claw_action_schema_test.py
python -m py_compile services\claw_bridge_service.py services\claw_action_schema.py
```

### 窗口 B：上下文、执行器和连接落地

负责范围：

- `modules/assistant/assistantContextBuilder.js`
- `modules/assistant/assistantContextBuilder.test.js`
- `modules/assistant/assistantActionExecutor.js`
- `modules/assistant/assistantActionExecutor.test.js`

任务：

- 确保上下文能给出创建新工作流所需的安全画布信息。
- 确保 executor 可以稳定创建节点、连接节点、布局并聚焦。
- 覆盖刚创建节点在同一批 action 中被后续连接引用的场景。
- 确保整个 batch 可撤销，不绕过现有 graphStore 路径。

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

### 窗口 C：preview、receipt 和面板反馈

负责范围：

- `modules/assistant/assistantActionPreview.js`
- `modules/assistant/assistantActionPreview.test.js`
- `modules/app/appAssistantPanel.js`
- `modules/app/appAssistantPanel.test.js`
- `modules/app/appAssistantPanel.autoload.js`
- `modules/app/appAssistantPanel.autoload.test.js`

任务：

- preview 能清楚说明将创建哪些节点、哪些连接、是否只是准备结构。
- receipt 能汇总本次创建的工作流类型、节点数量、连接数量。
- 明确提示“未自动运行付费生成”。
- 保持聊天 UI 现有轻量文本风格和复制能力，不做无关 UI 重构。

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

- 补阶段三回归项。
- 记录阶段三新增 action/metadata/限制。
- 阶段三最后一个切片通过后，更新 handoff 和 roadmap。
- 汇报时必须明确说“阶段三已完成”。

禁止修改：

- 生产代码文件，除非主协调窗口明确授权。

验收命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\claw_assistant_regression.ps1 -List
git diff --check -- docs\CLAW_CODE_ASSISTANT_IMPLEMENTATION_HANDOFF.md docs\CLAW_CODE_ASSISTANT_WOW_FEATURE_ROADMAP.md docs\CLAW_CODE_ASSISTANT_E2E_REGRESSION_CHECKLIST.md scripts\claw_assistant_regression.ps1 task_plan.md progress.md findings.md
```

## 5. 建议切片顺序

1. S3-01：常用工作流模板协议。
2. S3-02：节点默认值和安全字段。
3. S3-03：端口和连接语义强化。
4. S3-04：工作流布局和视野聚焦。
5. S3-05：工作流生成 preview/receipt。
6. S3-06：阶段三回归和接力文档。

S3-01 和 S3-02 可由窗口 A/B 并行推进，但必须先约定 metadata 字段。S3-05 不要早于 S3-01 的 preview 文案契约。

## 6. 阶段三完成标准

- 输入“搭一个文生图生视频工作流”，能创建并连接 `source-text -> ai-image -> ai-video`。
- 新节点不堆叠，连接方向正确，视野聚焦到新工作流。
- 默认不自动运行付费生成。
- preview/receipt 清楚说明创建内容和付费边界。
- 可以一次撤销整个 batch。
- 阶段回归通过，handoff 和 roadmap 更新完成。

